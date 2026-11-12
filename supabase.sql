-- ErgCoach · Supabase schema
-- Run once in Supabase → SQL Editor. Tables are closed to the public (RLS on, no policies);
-- the apps talk only through the functions below, which check the team code, PIN or session token.

create extension if not exists pgcrypto;

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                     -- short join code, e.g. "JRS24"
  name text not null,
  coach_pin text,                                -- optional bcrypt hash; null = no coach login needed
  created_at timestamptz default now()
);

create table if not exists athletes (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  name text not null,
  pin text,                                      -- optional bcrypt hash of a 4-digit code; null = QR login only
  sex text, birth_year int, weight numeric, height numeric,
  max_hr int, rest_hr int,
  failed int default 0, locked_until timestamptz,
  created_at timestamptz default now()
);

create table if not exists tokens (
  token uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  athlete_id uuid references athletes(id) on delete cascade,   -- null = coach
  created_at timestamptz default now()
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete cascade,
  athlete_id uuid references athletes(id) on delete cascade,
  started_at timestamptz not null,
  kind text default 'erg',                       -- erg | water | run | bike | strength | other
  zone text,                                     -- UT2, UT1, AT, TR, AN
  distance int, duration int,                    -- m, s
  avg_power int, avg_rate numeric, avg_hr int, score int,
  rpe int, notes text,
  summary jsonb,                                 -- technique summary, avg curve, hr zones
  strokes jsonb,                                 -- packed strokes with force curves
  created_at timestamptz default now()
);
create index if not exists sessions_athlete on sessions(athlete_id, started_at desc);
create index if not exists sessions_team on sessions(team_id, started_at desc);

alter table teams enable row level security;
alter table athletes enable row level security;
alter table tokens enable row level security;
alter table sessions enable row level security;

-- ---------- helpers ----------
create or replace function _tok(p_token uuid) returns tokens
language sql security definer set search_path = public as $$
  select * from tokens where token = p_token and created_at > now() - interval '180 days'
$$;

-- ---------- team ----------
create or replace function create_team(p_name text, p_code text, p_coach_pin text) returns json
language plpgsql security definer set search_path = public as $$
declare t teams; k uuid;
begin
  insert into teams(name, code, coach_pin) values (p_name, upper(p_code), case when coalesce(p_coach_pin,'') = '' then null else crypt(p_coach_pin, gen_salt('bf')) end) returning * into t;
  insert into tokens(team_id) values (t.id) returning token into k;
  return json_build_object('token', k, 'team', json_build_object('id', t.id, 'name', t.name, 'code', t.code));
end $$;

create or replace function team_roster(p_code text) returns json
language sql security definer set search_path = public as $$
  select json_build_object('team', json_build_object('id', t.id, 'name', t.name, 'code', t.code),
    'athletes', coalesce((select json_agg(json_build_object('id', a.id, 'name', a.name, 'has_pin', a.pin is not null) order by a.name) from athletes a where a.team_id = t.id), '[]'))
  from teams t where t.code = upper(p_code)
$$;

create or replace function athlete_login(p_code text, p_athlete uuid, p_pin text) returns json
language plpgsql security definer set search_path = public as $$
declare a athletes; k uuid;
begin
  select a2.* into a from athletes a2 join teams t on t.id = a2.team_id where t.code = upper(p_code) and a2.id = p_athlete;
  if a.id is null then raise exception 'Unknown athlete'; end if;
  if a.locked_until is not null and a.locked_until > now() then raise exception 'Too many wrong codes. Try again in a few minutes.'; end if;
  if a.pin is not null and a.pin <> crypt(coalesce(p_pin,''), a.pin) then
    -- return instead of raise: a raised exception would roll back the failure counter
    update athletes set failed = failed + 1, locked_until = case when failed + 1 >= 5 then now() + interval '10 minutes' end where id = a.id;
    return json_build_object('error', case when a.failed + 1 >= 5 then 'Too many wrong codes. Try again in 10 minutes.' else 'Wrong code' end);
  end if;
  update athletes set failed = 0, locked_until = null where id = a.id;
  insert into tokens(team_id, athlete_id) values (a.team_id, a.id) returning token into k;
  return json_build_object('token', k, 'athlete', json_build_object('id', a.id, 'name', a.name));
end $$;

create or replace function coach_login(p_code text, p_pin text) returns json
language plpgsql security definer set search_path = public as $$
declare t teams; k uuid;
begin
  select * into t from teams where code = upper(p_code);
  if t.id is null or (t.coach_pin is not null and t.coach_pin <> crypt(coalesce(p_pin,''), t.coach_pin)) then perform pg_sleep(1); raise exception 'Wrong team code or coach PIN'; end if;
  insert into tokens(team_id) values (t.id) returning token into k;
  return json_build_object('token', k, 'team', json_build_object('id', t.id, 'name', t.name, 'code', t.code));
end $$;

-- ---------- athlete ----------
create or replace function my_profile(p_token uuid) returns json
language sql security definer set search_path = public as $$
  select row_to_json(x) from (select a.id, a.name, a.sex, a.birth_year, a.weight, a.height, a.max_hr, a.rest_hr, t.name team, t.code
    from athletes a join teams t on t.id = a.team_id where a.id = (_tok(p_token)).athlete_id) x
$$;

create or replace function update_profile(p_token uuid, p jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare k tokens := _tok(p_token);
begin
  if k.athlete_id is null then raise exception 'Not logged in'; end if;
  update athletes set sex = coalesce(nullif(p->>'sex',''), sex), birth_year = coalesce(nullif(p->>'birth_year','')::int, birth_year),
    weight = coalesce(nullif(p->>'weight','')::numeric, weight), height = coalesce(nullif(p->>'height','')::numeric, height),
    max_hr = coalesce(nullif(p->>'max_hr','')::int, max_hr), rest_hr = coalesce(nullif(p->>'rest_hr','')::int, rest_hr)
  where id = k.athlete_id;
end $$;

create or replace function save_session(p_token uuid, s jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare k tokens := _tok(p_token); i uuid;
begin
  if k.athlete_id is null then raise exception 'Not logged in'; end if;
  if s ? 'id' and exists(select 1 from sessions where id = (s->>'id')::uuid and athlete_id = k.athlete_id) then
    update sessions set kind = coalesce(s->>'kind', kind), zone = s->>'zone', rpe = (s->>'rpe')::int, notes = s->>'notes',
      distance = coalesce((s->>'distance')::int, distance), duration = coalesce((s->>'duration')::int, duration), avg_hr = coalesce((s->>'avg_hr')::int, avg_hr)
    where id = (s->>'id')::uuid returning id into i;
    return i;
  end if;
  insert into sessions(team_id, athlete_id, started_at, kind, zone, distance, duration, avg_power, avg_rate, avg_hr, score, rpe, notes, summary, strokes)
  values (k.team_id, k.athlete_id, coalesce((s->>'started_at')::timestamptz, now()), coalesce(s->>'kind','erg'), s->>'zone',
    (s->>'distance')::int, (s->>'duration')::int, (s->>'avg_power')::int, (s->>'avg_rate')::numeric, (s->>'avg_hr')::int, (s->>'score')::int,
    (s->>'rpe')::int, s->>'notes', s->'summary', s->'strokes')
  returning id into i;
  return i;
end $$;

create or replace function my_sessions(p_token uuid, p_full boolean default false) returns json
language sql security definer set search_path = public as $$
  select coalesce(json_agg(x order by x.started_at desc), '[]') from (
    select id, athlete_id, started_at, kind, zone, distance, duration, avg_power, avg_rate, avg_hr, score, rpe, notes, summary,
      case when p_full then strokes end strokes
    from sessions where athlete_id = (_tok(p_token)).athlete_id order by started_at desc limit 400) x
$$;

create or replace function delete_session(p_token uuid, p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from sessions where id = p_id and (athlete_id = (_tok(p_token)).athlete_id or ((_tok(p_token)).athlete_id is null and team_id = (_tok(p_token)).team_id))
$$;

-- ---------- coach ----------
create or replace function coach_team(p_token uuid) returns json
language plpgsql security definer set search_path = public as $$
declare k tokens := _tok(p_token);
begin
  if k.team_id is null or k.athlete_id is not null then raise exception 'Coach login needed'; end if;
  return (select json_build_object('team', json_build_object('id', t.id, 'name', t.name, 'code', t.code),
    'athletes', coalesce((select json_agg(json_build_object('id', a.id, 'name', a.name, 'sex', a.sex, 'birth_year', a.birth_year, 'weight', a.weight, 'height', a.height, 'max_hr', a.max_hr, 'rest_hr', a.rest_hr, 'has_pin', a.pin is not null) order by a.name) from athletes a where a.team_id = t.id), '[]'))
    from teams t where t.id = k.team_id);
end $$;

create or replace function coach_save_athlete(p_token uuid, p jsonb) returns uuid
language plpgsql security definer set search_path = public as $$
declare k tokens := _tok(p_token); i uuid;
begin
  if k.team_id is null or k.athlete_id is not null then raise exception 'Coach login needed'; end if;
  if p ? 'id' then
    update athletes set name = coalesce(p->>'name', name),
      pin = case when coalesce(p->>'pin','') ~ '^[0-9]{4}$' then crypt(p->>'pin', gen_salt('bf')) when p->>'pin' = 'none' then null else pin end, failed = 0, locked_until = null,
      max_hr = coalesce(nullif(p->>'max_hr','')::int, max_hr), rest_hr = coalesce(nullif(p->>'rest_hr','')::int, rest_hr),
      weight = coalesce(nullif(p->>'weight','')::numeric, weight), height = coalesce(nullif(p->>'height','')::numeric, height),
      sex = coalesce(nullif(p->>'sex',''), sex), birth_year = coalesce(nullif(p->>'birth_year','')::int, birth_year)
    where id = (p->>'id')::uuid and team_id = k.team_id returning id into i;
  else
    if coalesce(p->>'pin','') <> '' and p->>'pin' !~ '^[0-9]{4}$' then raise exception 'PIN must be 4 digits'; end if;
    insert into athletes(team_id, name, pin, max_hr, rest_hr, weight, height, sex, birth_year)
      values (k.team_id, p->>'name', case when coalesce(p->>'pin','') = '' then null else crypt(p->>'pin', gen_salt('bf')) end, nullif(p->>'max_hr','')::int, nullif(p->>'rest_hr','')::int,
        nullif(p->>'weight','')::numeric, nullif(p->>'height','')::numeric, nullif(p->>'sex',''), nullif(p->>'birth_year','')::int) returning id into i;
  end if;
  return i;
end $$;

create or replace function coach_remove_athlete(p_token uuid, p_id uuid) returns void
language sql security definer set search_path = public as $$
  delete from athletes where id = p_id and team_id = (_tok(p_token)).team_id and (_tok(p_token)).athlete_id is null
$$;

create or replace function coach_sessions(p_token uuid, p_athletes uuid[] default null, p_from timestamptz default null, p_full boolean default false) returns json
language sql security definer set search_path = public as $$
  select coalesce(json_agg(x order by x.started_at desc), '[]') from (
    select s.id, s.athlete_id, a.name, s.started_at, s.kind, s.zone, s.distance, s.duration, s.avg_power, s.avg_rate, s.avg_hr, s.score, s.rpe, s.notes, s.summary,
      case when p_full then s.strokes end strokes
    from sessions s join athletes a on a.id = s.athlete_id
    where s.team_id = (_tok(p_token)).team_id and (_tok(p_token)).athlete_id is null
      and (p_athletes is null or s.athlete_id = any(p_athletes)) and (p_from is null or s.started_at >= p_from)
    order by s.started_at desc limit 2000) x
$$;

grant execute on function create_team, team_roster, athlete_login, coach_login, my_profile, update_profile, save_session,
  my_sessions, delete_session, coach_team, coach_save_athlete, coach_remove_athlete, coach_sessions to anon, authenticated;
revoke execute on function _tok from anon, authenticated;

-- upgrade an existing project: QR-only login without PIN
alter table athletes alter column pin drop not null;
alter table teams alter column coach_pin drop not null;
