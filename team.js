// ---------- team backend: Supabase when configured, otherwise a local demo backend ----------
const CFG = Object.assign({ url:'', key:'' }, window.ERG_CFG || {}, (()=>{ try{ return JSON.parse(localStorage.getItem('ergcoach.server')||'{}'); }catch(e){ return {}; } })());

const SupaAPI = {
  kind:'supabase',
  async rpc(fn, args){
    const r = await fetch(`${CFG.url}/rest/v1/rpc/${fn}`, { method:'POST', headers:{ apikey:CFG.key, Authorization:'Bearer '+CFG.key, 'Content-Type':'application/json' }, body:JSON.stringify(args||{}) });
    const txt = await r.text(); let j = null; try{ j = txt ? JSON.parse(txt) : null; }catch(e){}
    if (!r.ok) throw new Error((j && (j.message || j.hint)) || ('Server error '+r.status));
    return j;
  },
  createTeam:(name,code,pin)=>SupaAPI.rpc('create_team',{p_name:name,p_code:code,p_coach_pin:pin}),
  roster:code=>SupaAPI.rpc('team_roster',{p_code:code}),
  athleteLogin:async (code,id,pin)=>{ const r = await SupaAPI.rpc('athlete_login',{p_code:code,p_athlete:id,p_pin:pin}); if (r && r.error) throw new Error(r.error); return r; },
  coachLogin:(code,pin)=>SupaAPI.rpc('coach_login',{p_code:code,p_pin:pin}),
  myProfile:tok=>SupaAPI.rpc('my_profile',{p_token:tok}),
  updateProfile:(tok,p)=>SupaAPI.rpc('update_profile',{p_token:tok,p}),
  saveSession:(tok,s)=>SupaAPI.rpc('save_session',{p_token:tok,s}),
  mySessions:(tok,full)=>SupaAPI.rpc('my_sessions',{p_token:tok,p_full:!!full}),
  deleteSession:(tok,id)=>SupaAPI.rpc('delete_session',{p_token:tok,p_id:id}),
  coachTeam:tok=>SupaAPI.rpc('coach_team',{p_token:tok}),
  coachSaveAthlete:(tok,p)=>SupaAPI.rpc('coach_save_athlete',{p_token:tok,p}),
  coachRemoveAthlete:(tok,id)=>SupaAPI.rpc('coach_remove_athlete',{p_token:tok,p_id:id}),
  coachSessions:(tok,ids,from,full)=>SupaAPI.rpc('coach_sessions',{p_token:tok,p_athletes:ids&&ids.length?ids:null,p_from:from||null,p_full:!!full}),
  async rt(code, onMsg){
    if (!SupaAPI.sb){ const m = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'); SupaAPI.sb = m.createClient(CFG.url, CFG.key); }
    const ch = SupaAPI.sb.channel('erg-'+code.toUpperCase(), { config:{ broadcast:{ self:false, ack:false } } });
    ch.on('broadcast', { event:'m' }, ({payload}) => onMsg(payload));
    await new Promise(res=>ch.subscribe(st=>{ if (st==='SUBSCRIBED') res(); }));
    return { send:m=>ch.send({ type:'broadcast', event:'m', payload:m }), close:()=>SupaAPI.sb.removeChannel(ch) };
  }
};

// Local demo backend: same calls, stored in this browser; live data between tabs via BroadcastChannel
const LocalAPI = {
  kind:'local', K:'ergcoach.localdb',
  db(){ try{ return Object.assign({teams:[],athletes:[],tokens:[],sessions:[]}, JSON.parse(localStorage.getItem(this.K)||'{}')); }catch(e){ return {teams:[],athletes:[],tokens:[],sessions:[]}; } },
  put(d){ localStorage.setItem(this.K, JSON.stringify(d)); },
  id(){ return (crypto.randomUUID ? crypto.randomUUID() : 'x'+Math.random().toString(36).slice(2)+Date.now().toString(36)); },
  async h(s){ const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('erg:'+s)); return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''); },
  tok(d,t){ const k = d.tokens.find(x=>x.token===t); if (!k) throw new Error('Not logged in'); return k; },
  async createTeam(name, code, pin){ const d=this.db(); code=code.toUpperCase(); if (d.teams.some(t=>t.code===code)) throw new Error('That team code is taken'); const t={id:this.id(),name,code,coach_pin:pin ? await this.h(pin) : null}; d.teams.push(t); const token=this.id(); d.tokens.push({token,team_id:t.id,athlete_id:null}); this.put(d); return {token,team:{id:t.id,name,code}}; },
  async roster(code){ const d=this.db(), t=d.teams.find(x=>x.code===code.toUpperCase()); if (!t) return null; return {team:{id:t.id,name:t.name,code:t.code}, athletes:d.athletes.filter(a=>a.team_id===t.id).map(a=>({id:a.id,name:a.name,has_pin:!!a.pin})).sort((a,b)=>a.name.localeCompare(b.name))}; },
  async athleteLogin(code,id,pin){ const d=this.db(), t=d.teams.find(x=>x.code===code.toUpperCase()), a=d.athletes.find(x=>x.id===id && t && x.team_id===t.id); if (!a) throw new Error('Unknown athlete');
    if (a.locked_until && a.locked_until>Date.now()) throw new Error('Too many wrong codes. Try again in a few minutes.');
    if (a.pin && a.pin !== await this.h(pin||'')){ a.failed=(a.failed||0)+1; if (a.failed>=5) a.locked_until=Date.now()+600000; this.put(d); throw new Error('Wrong code'); }
    a.failed=0; a.locked_until=null; const token=this.id(); d.tokens.push({token,team_id:t.id,athlete_id:a.id}); this.put(d); return {token,athlete:{id:a.id,name:a.name}}; },
  async coachLogin(code,pin){ const d=this.db(), t=d.teams.find(x=>x.code===code.toUpperCase()); if (!t || (t.coach_pin && t.coach_pin!==await this.h(pin||''))) throw new Error('Wrong team code or coach PIN'); const token=this.id(); d.tokens.push({token,team_id:t.id,athlete_id:null}); this.put(d); return {token,team:{id:t.id,name:t.name,code:t.code}}; },
  async myProfile(tok){ const d=this.db(), k=this.tok(d,tok), a=d.athletes.find(x=>x.id===k.athlete_id), t=d.teams.find(x=>x.id===k.team_id); if (!a) return null; const {pin,failed,locked_until,...p}=a; return Object.assign(p,{team:t.name,code:t.code}); },
  async updateProfile(tok,p){ const d=this.db(), k=this.tok(d,tok), a=d.athletes.find(x=>x.id===k.athlete_id); for (const f of ['sex','birth_year','weight','height','max_hr','rest_hr']) if (p[f]!=null && p[f]!=='') a[f]=p[f]; this.put(d); },
  async saveSession(tok,s){ const d=this.db(), k=this.tok(d,tok); if (!k.athlete_id) throw new Error('Not logged in');
    if (s.id){ const o=d.sessions.find(x=>x.id===s.id && x.athlete_id===k.athlete_id); if (o){ for (const f of ['kind','zone','rpe','notes','distance','duration','avg_hr']) if (s[f]!==undefined) o[f]=s[f]; this.put(d); return o.id; } }
    const o=Object.assign({}, s, {id:this.id(), team_id:k.team_id, athlete_id:k.athlete_id, started_at:s.started_at||new Date().toISOString(), kind:s.kind||'erg'}); d.sessions.push(o); this.put(d); return o.id; },
  async mySessions(tok,full){ const d=this.db(), k=this.tok(d,tok); return d.sessions.filter(s=>s.athlete_id===k.athlete_id).sort((a,b)=>b.started_at.localeCompare(a.started_at)).map(s=>full?s:Object.assign({},s,{strokes:null})); },
  async deleteSession(tok,id){ const d=this.db(), k=this.tok(d,tok); d.sessions=d.sessions.filter(s=>!(s.id===id && (s.athlete_id===k.athlete_id || (!k.athlete_id && s.team_id===k.team_id)))); this.put(d); },
  async coachTeam(tok){ const d=this.db(), k=this.tok(d,tok); if (k.athlete_id) throw new Error('Coach login needed'); const t=d.teams.find(x=>x.id===k.team_id);
    return {team:{id:t.id,name:t.name,code:t.code}, athletes:d.athletes.filter(a=>a.team_id===t.id).map(({pin,failed,locked_until,...a})=>({...a,has_pin:!!pin})).sort((a,b)=>a.name.localeCompare(b.name))}; },
  async coachSaveAthlete(tok,p){ const d=this.db(), k=this.tok(d,tok); if (k.athlete_id) throw new Error('Coach login needed');
    if (p.id){ const a=d.athletes.find(x=>x.id===p.id && x.team_id===k.team_id); if (!a) throw new Error('Unknown athlete'); for (const f of ['name','max_hr','rest_hr','weight','height','sex','birth_year']) if (p[f]!=null && p[f]!=='') a[f]=p[f]; if (p.pin==='none') a.pin=null; else if (p.pin) { a.pin=await this.h(p.pin); a.failed=0; a.locked_until=null; } this.put(d); return a.id; }
    if (p.pin && !/^\d{4}$/.test(p.pin)) throw new Error('PIN must be 4 digits');
    const a={id:this.id(),team_id:k.team_id,name:p.name,pin:p.pin ? await this.h(p.pin) : null}; for (const f of ['max_hr','rest_hr','weight','height','sex','birth_year']) if (p[f]!=null && p[f]!=='') a[f]=p[f]; d.athletes.push(a); this.put(d); return a.id; },
  async coachRemoveAthlete(tok,id){ const d=this.db(), k=this.tok(d,tok); if (k.athlete_id) return; d.athletes=d.athletes.filter(a=>!(a.id===id && a.team_id===k.team_id)); d.sessions=d.sessions.filter(s=>s.athlete_id!==id); this.put(d); },
  async coachSessions(tok,ids,from,full){ const d=this.db(), k=this.tok(d,tok); if (k.athlete_id) throw new Error('Coach login needed'); const names=Object.fromEntries(d.athletes.map(a=>[a.id,a.name]));
    return d.sessions.filter(s=>s.team_id===k.team_id && (!ids||!ids.length||ids.includes(s.athlete_id)) && (!from||s.started_at>=from)).sort((a,b)=>b.started_at.localeCompare(a.started_at)).map(s=>Object.assign({},s,{name:names[s.athlete_id], strokes:full?s.strokes:null})); },
  async rt(code, onMsg){ const bc = new BroadcastChannel('erg-'+code.toUpperCase()); bc.onmessage = e=>onMsg(e.data); return { send:m=>bc.postMessage(m), close:()=>bc.close() }; }
};
const TEAM_CODE = ((window.ERG_CFG && window.ERG_CFG.team) || 'ERG').toUpperCase();
const API = (CFG.url && CFG.key) ? SupaAPI : LocalAPI;

// ---------- heart rate: zones by the Karvonen (heart-rate reserve) method ----------
const ZONES = [
  { k:'UT2', lo:0.60, hi:0.70, col:'#9ec5e8', d:'Long, easy endurance' },
  { k:'UT1', lo:0.70, hi:0.80, col:'#6fb46f', d:'Steady endurance' },
  { k:'AT',  lo:0.80, hi:0.85, col:'#e6c84a', d:'Anaerobic threshold' },
  { k:'TR',  lo:0.85, hi:0.95, col:'#e8873a', d:'Transport / VO₂max' },
  { k:'AN',  lo:0.95, hi:1.01, col:'#d0312d', d:'Anaerobic, sprint' }
];
function maxHrOf(p){ if (p && p.max_hr) return +p.max_hr; if (p && p.birth_year) return Math.round(208 - 0.7*(new Date().getFullYear()-p.birth_year)); return null; }
function hrr(p, hr){ const mx = maxHrOf(p), rs = p && +p.rest_hr; if (!mx || !rs || !hr) return null; return (hr-rs)/(mx-rs); }
function zoneOf(p, hr){ const r = hrr(p,hr); if (r==null) return null; if (r < 0.6) return {k:'Rec', col:'#d6d6d6', d:'Recovery', r}; return Object.assign({r}, ZONES.find(z=>r>=z.lo && r<z.hi) || ZONES[4]); }
function zoneTable(p){ const mx = maxHrOf(p), rs = +(p && p.rest_hr); if (!mx || !rs) return null; return ZONES.map(z=>({...z, from:Math.round(rs+(mx-rs)*z.lo), to:Math.round(rs+(mx-rs)*Math.min(1,z.hi))})); }

// ---------- level: predicted 2 km from the best erg sessions (Paul's law: +5 s/500 m per doubling of distance) ----------
function pred2k(sessions){
  let best = null;
  for (const s of sessions) if ((s.kind||'erg')==='erg' && s.distance>=500 && s.duration>0){ const pace = s.duration/(s.distance/500); const p2 = pace + 5*Math.log2(2000/s.distance); if (!best || p2<best.pace) best = {pace:p2, from:s}; }
  return best ? { time:best.pace*4, pace:best.pace, watts:2.8/Math.pow(best.pace/500,3), from:best.from } : null;
}
function levelOf(t2k, sex){ if (!t2k) return null; const o = sex==='f' ? 45 : 0; const bands = [[360+o,'Elite'],[390+o,'Competitive'],[420+o,'Club'],[465+o,'Fitness'],[1e9,'Beginner']]; return bands.find(b=>t2k<b[0])[1]; }
const fmtTime = s => !s ? '–' : `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}.${Math.floor((s*10)%10)}`;
