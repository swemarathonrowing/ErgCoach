// ================= ErgCoach · coach screen =================
const S = { profile:{} };   // analysis.js reads the rower's height from here
const COLS = ['#e07a55','#4fa3a5','#f7b267','#7aa36b','#8b6bb0','#ee8a7a','#5b6fb0','#b3527a','#55558f','#d98a5a','#6aa5c9','#a07ab8'];
const C = { token:null, team:null, athletes:[], sel:new Set(), live:{}, rt:null, view:'live', sims:null, hist:[], prog:{}, liveEv:[] };
try{ Object.assign(C, JSON.parse(localStorage.getItem('ergcoach.coach')||'{}')); C.sel = new Set(C.sel||[]); }catch(e){}
C.live = {}; C.rt = null;
const saveC = ()=>localStorage.setItem('ergcoach.coach', JSON.stringify({ token:C.token, team:C.team, sel:[...C.sel], fields:C.fields, sort:C.sort }));
const colOf = id => COLS[Math.max(0, C.athletes.findIndex(a=>a.id===id)) % COLS.length];
const athOf = id => C.athletes.find(a=>a.id===id);
const online = id => C.live[id] && Date.now()-C.live[id].seen < 12000;
const nameOf = id => (athOf(id)||C.live[id]||{}).name || '?';

// ---------- login ----------
$('srvNote').innerHTML = API.kind==='local' ? 'Running on the <b>local demo server</b>: data lives in this browser, and only tabs in this browser see each other. Add your Supabase project in <code>config.js</code> to run the whole erg room.' : 'Connected to Supabase.';
$('lCode').value = (C.team && C.team.code) || '';
$('lGo').onclick = async ()=>{ try{ const r = await API.coachLogin($('lCode').value.trim(), ''); await enter(r); }catch(e){ $('lMsg').textContent = e.message; } };
$('nGo').onclick = async ()=>{ const code=$('nCode').value.trim().toUpperCase(); if (!/^[A-Z0-9]{4,8}$/.test(code)) { $('nMsg').textContent='Code: 4–8 letters or digits'; return; }
  try{ const r = await API.createTeam($('nName').value.trim()||code, code, ''); await enter(r); C.view='roster'; showV('roster'); }catch(e){ $('nMsg').textContent = e.message; } };


async function enter(r){
  C.token = r.token; C.team = r.team; saveC();
  await loadTeam();
  $('login').classList.add('hidden'); $('app').classList.remove('hidden');
  $('tName').textContent = `${C.team.name} · ${C.team.code}`;
  C.rt = await API.rt(C.team.code, onMsg);
  C.rt.send({ type:'ping' });
  renderInvite(); renderSide(); showV(C.view);
  loadHist(); setInterval(loadHist, 120000);
}
async function loadHist(){
  try{ C.hist = await API.coachSessions(C.token, null, new Date(Date.now()-400*864e5).toISOString(), false) || []; }catch(e){ return; }
  C.prog = {}; for (const a of C.athletes) C.prog[a.id] = progress(C.hist.filter(s=>s.athlete_id===a.id));
  if (C.view==='spot') renderSpot();
}
const progOf = id => C.prog[id] || (C.prog[id] = progress([]));
async function loadTeam(){
  const r = await API.coachTeam(C.token); C.team = r.team; C.athletes = r.athletes || [];
  if (!C.sel.size) C.athletes.forEach(a=>C.sel.add(a.id));
}
function showV(v){
  C.view = v;
  for (const s of ['wk','live','spot','games','ana','roster']) $('v-'+s).classList.toggle('hidden', s!==v);
  document.querySelectorAll('#tabs button[data-v]').forEach(b=>b.classList.toggle('active', b.dataset.v===v));
  if (v==='live') renderLive(); if (v==='games') renderGames(); if (v==='ana') loadAna(); if (v==='roster') renderRoster(); if (v==='spot') renderSpot(); if (v==='wk') wkShow(); $('wkBar').classList.toggle('hidden', v!=='wk' || !WK.s);
}
document.querySelectorAll('#tabs button[data-v]').forEach(b=>b.onclick=()=>showV(b.dataset.v));

// ---------- incoming data ----------
function onMsg(m){
  if (!m || !m.id) return;
  const L = C.live[m.id] || (C.live[m.id] = { id:m.id, name:m.name, st:{}, k:[], seen:0, dist:0 });
  L.seen = Date.now(); L.name = m.name;
  if (m.type==='st'){ L.st = m; L.dist = m.dist||0; GAME.tick(m.id); }
  if (m.type==='k'){ L.k.push(m); if (L.k.length>40) L.k.shift(); if (m.dist) L.dist = Math.max(L.dist, m.dist); }
  if (m.type==='join'||m.type==='hit'||m.type==='hi') wkOnMsg(m);
  if (m.type==='saved') setTimeout(loadHist, 800);
  if (m.type==='ev' && m.events) for (const e of m.events) pushLiveEv(m.id, e);
  if (m.type==='hi' && !athOf(m.id)) loadTeam().then(renderSide).catch(()=>{});
  if (!athOf(m.id) && !C.sel.has(m.id)) C.sel.add(m.id);
}
setInterval(()=>{ renderSide(); if (C.view==='live') renderLive(); if (C.view==='games') GAME.draw(); if (C.view==='spot') renderSpotLive(); }, 1000);

// ---------- sidebar ----------
function sideIds(){ const ids = C.athletes.map(a=>a.id); for (const id in C.live) if (!ids.includes(id)) ids.push(id); return ids; }
function renderSide(){
  if (!C.token) return;
  const ids = sideIds();
  $('athList').innerHTML = ids.length ? ids.map(id=>`<label class="ath"><input type="checkbox" data-s="${id}" ${C.sel.has(id)?'checked':''}><span class="sw" style="background:${colOf(id)}"></span><span class="nm">${esc(nameOf(id))}</span>${(()=>{ const r = riskOf(id); return r.length ? `<span class="rdot" style="background:${RISKC[r[0].lvl]}" title="${esc(r[0].t)}"></span>` : ''; })()}<span class="dot ${online(id)?'on':''}" title="${online(id)?'online':'offline'}"></span></label>`).join('') : '<p class="hint">No rowers yet: add them under Roster.</p>';
  $('athList').querySelectorAll('[data-s]').forEach(c=>c.onchange=()=>{ c.checked ? C.sel.add(c.dataset.s) : C.sel.delete(c.dataset.s); saveC(); if (C.view==='ana') renderAna(); if (C.view==='games') renderGames(); });
  const n = ids.filter(online).length; $('tOnline').textContent = `${n} online`;
}
$('sAll').onclick = ()=>{ const ids=sideIds(); const all = ids.every(id=>C.sel.has(id)); ids.forEach(id=> all ? C.sel.delete(id) : C.sel.add(id)); saveC(); renderSide(); if (C.view==='ana') renderAna(); };
$('sOn').onclick = ()=>{ C.sel = new Set(sideIds().filter(online)); saveC(); renderSide(); if (C.view==='ana') renderAna(); };

// ---------- live ----------
const FIELDS = [['self','vs own normal'],['pace','Pace'],['watt','Watts'],['rate','Rate'],['dist','Distance'],['time','Time'],['hr','Heart rate'],['zone','Zone'],['peak','Peak force'],['dl','Drive length'],['curve','Curve'],['tech','Technique']];
C.fields = C.fields || ['self','pace','watt','rate','dist','hr','zone','curve','tech'];
function renderFields(){
  $('fields').innerHTML = FIELDS.map(([k,l])=>`<label class="${C.fields.includes(k)?'on':''}"><input type="checkbox" data-f="${k}" ${C.fields.includes(k)?'checked':''}>${l}</label>`).join('');
  $('fields').querySelectorAll('[data-f]').forEach(c=>c.onchange=()=>{ const k=c.dataset.f; C.fields = c.checked ? [...C.fields,k] : C.fields.filter(x=>x!==k); saveC(); renderFields(); renderLive(); });
}
$('sort').value = C.sort || 'name'; $('sort').onchange = ()=>{ C.sort=$('sort').value; saveC(); renderLive(); };
function hrInfo(id){ const L=C.live[id], a=athOf(id)||{}; const p = { max_hr:a.max_hr||(L&&L.st.max_hr), rest_hr:a.rest_hr||(L&&L.st.rest_hr), birth_year:a.birth_year }; const hr = L && L.st.hr; return { hr, z:zoneOf(p,hr) }; }
function lastCurve(id, n=5){ const L=C.live[id]; if (!L) return null; const ks = L.k.filter(k=>k.c && k.c.length>4).slice(-n); if (!ks.length) return null; const rs = ks.map(k=>resample(k.c,50)); return rs[0].map((_,i)=>mean(rs.map(r=>r[i]))); }
function techOf(id){ const L=C.live[id]; if (!L) return null; const ks = L.k.filter(k=>k.c).slice(-8); if (ks.length<2) return null; S.profile.hgt = (athOf(id)||{}).height || null; const su = summarize(ks.map(k=>({curve:k.c, driveLen:k.dl, driveTime:k.dt, recTime:k.rt, power:k.p, rate:k.r})));
  const f = findings(su); return { score:scoreOf(su), top:f[0], su }; }
function miniCurve(c, col){ if (!c) return ''; const mx = Math.max(...c)||1, W=200, H=54; const d = c.map((v,i)=>`${i?'L':'M'}${(i/(c.length-1)*W).toFixed(1)} ${(H-2-v/mx*(H-6)).toFixed(1)}`).join('');
  const id = IDEAL.map((v,i)=>`${i?'L':'M'}${(i/(IDEAL.length-1)*W).toFixed(1)} ${(H-2-v*(H-6)).toFixed(1)}`).join('');
  return `<svg viewBox="0 0 ${W} ${H}"><path d="${id}" fill="none" stroke="#bbb" stroke-dasharray="3 3"/><path d="${d}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round"/></svg>`; }
function renderLive(){
  if ($('fields').childElementCount===0) renderFields();
  let ids = sideIds().filter(id=>C.sel.has(id));
  const val = id => { const L=C.live[id], st=L?L.st:{}; switch(C.sort){ case 'watt': return -(st.watt||0); case 'dist': return -(L?L.dist:0); case 'rate': return -(st.rate||0); case 'hrr': return -((hrInfo(id).z||{}).r||0); case 'tech': return -((techOf(id)||{}).score||0); case 'self': return -(vsNormal(id)??-999); default: return nameOf(id).toLowerCase(); } };
  ids.sort((a,b)=>{ const oa=online(a)?0:1, ob=online(b)?0:1; if (oa!==ob) return oa-ob; const va=val(a), vb=val(b); return va<vb?-1:va>vb?1:0; });
  const F = k => C.fields.includes(k);
  $('tiles').innerHTML = ids.length ? ids.map(id=>{
    const L = C.live[id], st = L ? L.st : {}, on = online(id), last = L && L.k[L.k.length-1], h = hrInfo(id), t = F('tech') ? techOf(id) : null;
    const cell = (v,l,big)=>`<div><div class="v ${big?'big':''}">${v}</div><div class="l">${l}</div></div>`;
    let v = '';
    if (F('self')){ const d = vsNormal(id); v += `<div style="grid-column:1/3"><div class="v" style="color:${d==null?'inherit':d>=0?'#16a34a':'#757575'}">${d==null?'–':(d>=0?'+':'')+Math.round(d)+'%'}</div><div class="l">vs own normal${progOf(id).normal?` · ${Math.round(progOf(id).normal)} W`:' · no history yet'}</div></div>`; }
    if (F('pace')) v += cell(st.pace?fmtPace(st.pace):'–:––','/500 m', true);
    if (F('watt')) v += cell(st.watt?Math.round(st.watt):'–','watts', true);
    if (F('rate')) v += cell(st.rate||'–','spm');
    if (F('dist')) v += cell(L?Math.round(L.dist):'–','metres');
    if (F('time')) v += cell(st.el?fmtTime(st.el).replace(/\.\d$/,''):'–','time');
    if (F('hr')) v += cell(h.hr||'–', h.z?`bpm · ${Math.round(h.z.r*100)}% HRR`:'bpm');
    if (F('zone')) v += `<div><div class="v"><span class="zone" style="background:${h.z?h.z.col:'#eee'}">${h.z?h.z.k:'–'}</span></div><div class="l">zone</div></div>`;
    if (F('peak')) v += cell(last&&last.pk?last.pk:'–','peak N');
    if (F('dl')) v += cell(last&&last.dl?fmt(last.dl,2):'–','drive m');
    const rk = riskOf(id), rl = rk.length ? rk[0].lvl : 0;
    return `<div class="tile ${on?'':'off'} ${rl?'rk'+rl:''}">${riskBadge(id, true)}<div class="nm"><span class="sw" style="background:${colOf(id)}"></span>${esc(nameOf(id))}<small>${on ? (st.demo?'demo':'live') : 'offline'}</small></div><div class="vals">${v}</div>
      ${F('curve') ? miniCurve(lastCurve(id,1), colOf(id)) : ''}
      ${t ? `<div class="tech">Technique ${t.score}${t.top?` · <b>${esc(t.top.title)}</b>`:' · clean curve'}</div>` : ''}</div>`;
  }).join('') : '<p class="hint">Tick rowers in the list on the left. When they log in on their phone and connect a PM5, they light up here.</p>';
  // compare curves
  const cs = ids.filter(online).map(id=>({ id, c:lastCurve(id) })).filter(x=>x.c);
  $('cmp').innerHTML = forceChart(cs.map(x=>{ const mx=Math.max(...x.c); return { data:x.c.map(v=>v/mx*100), col:colOf(x.id), w:2.2 }; }), { ideal:cs.length?100:0, h:200 }).replace('>N<','>%<');
  $('cmpLeg').innerHTML = cs.map(x=>`<span><i style="background:${colOf(x.id)}"></i>${esc(nameOf(x.id))} · peak at ${Math.round(curveMetrics(x.c).peakPos*100)}%</span>`).join('');
  const to = [...C.sel].filter(online); $('msgTo').textContent = `to ${to.length} online rower${to.length===1?'':'s'}`;
}
const targets = ()=>[...C.sel];
$('msgGo').onclick = ()=>{ const t=$('msg').value.trim(); if (!t) return; C.rt.send({ type:'cmd', to:targets(), title:t, ttl:8 }); toast('Sent'); };
$('msg').onkeydown = e=>{ if (e.key==='Enter') $('msgGo').click(); };
$('msgCount').onclick = ()=>{ C.rt.send({ type:'cmd', to:targets(), count:5, sub:$('msg').value.trim() }); toast('Countdown sent'); };
$('msgStop').onclick = ()=>{ C.rt.send({ type:'cmd', to:targets(), title:'Easy · stop', ttl:6 }); };

// ---------- risk: things worth a quick check-in. Flags, not diagnoses ----------
// level 2 = act now (red), level 1 = keep an eye (amber)
function riskOf(id){
  const L = C.live[id], out = []; if (!L) return out;
  const age = (Date.now() - (L.seen||0))/1000;
  if (L.k.length && age > 6 && age < 120) out.push({ lvl:1, t:'Signal lost', d:`no data for ${Math.round(age)} s` });
  if (!online(id)) return out;
  const h = hrInfo(id);
  if (h.z && h.hr){ const mx = maxHrOf({ max_hr:(athOf(id)||{}).max_hr || L.st.max_hr, birth_year:(athOf(id)||{}).birth_year });
    if (mx && h.hr >= mx) out.push({ lvl:2, t:'HR above max', d:`${h.hr} bpm, max ${mx}` });
    else if (h.z.r >= 0.95) out.push({ lvl:2, t:'HR very high', d:`${Math.round(h.z.r*100)}% of reserve` });
    else if (h.z.r >= 0.9 && !(WK.s && WK.s.status==='run' && ['power'].includes((WK.s.steps[WK.s.idx]||{}).focus))) out.push({ lvl:1, t:'HR high', d:`${Math.round(h.z.r*100)}% of reserve` }); }
  const ks = L.k.filter(k=>k.c && k.c.length>4 && k.p);
  if (ks.length >= 12){
    const q = k => { const g = shapeGrade(k.c); return g ? g.q : null; }, first = ks.slice(0,6).map(q).filter(v=>v!=null), lastq = ks.slice(-6).map(q).filter(v=>v!=null);
    if (first.length && lastq.length && mean(first) - mean(lastq) > 0.06) out.push({ lvl:1, t:'Form fading', d:'curve worse than at the start: fatigue' });
    const pAll = mean(ks.map(k=>k.p)), pLast = mean(ks.slice(-5).map(k=>k.p)), rLast = mean(ks.slice(-5).map(k=>k.r||0)), rAll = mean(ks.map(k=>k.r||0));
    if (pLast < pAll*0.82 && rLast >= rAll-1) out.push({ lvl:1, t:'Power dropping', d:`${Math.round((1-pLast/pAll)*100)}% below session average` });
  }
  const last = ks.slice(-5);
  if (last.length >= 4){
    const pp = mean(last.map(k=>k.pp||0.4)), w = mean(last.map(k=>k.p)), n = progOf(id).normal || w;
    if (pp > 0.52 && w >= n*0.95) out.push({ lvl:pp > 0.58 ? 2 : 1, t:'Late peak under load', d:'pulling with the back: low-back strain risk' });
    const pk = mean(last.map(k=>k.pk||0)), sh = last.map(k=>shapeGrade(k.c)).filter(Boolean);
    if (pp < 0.3 && pk > 0 && sh.length && mean(sh.map(g=>g.q)) < 0.85) out.push({ lvl:1, t:'Jerky catch', d:'spiky hit off the catch: back and ribs' });
  }
  return out.sort((a,b)=>b.lvl-a.lvl);
}
const RISKC = ['#9a8f99','#e8a33a','#d9483b'];
function riskBadge(id, big){ const r = riskOf(id); if (!r.length) return ''; const top = r[0];
  return `<div class="risk lv${top.lvl}" title="${esc(r.map(x=>x.t+': '+x.d).join('\n'))}"><b>⚠ ${esc(top.t)}</b>${big?` <span>${esc(top.d)}</span>`:''}${r.length>1?` <span>+${r.length-1}</span>`:''}</div>`; }

// ---------- games ----------
const GAMES = {
  ghost: { t:'Beat your ghost', d:'Everyone races their own personal best. Ranked by how far ahead of themselves they finish, so a beginner can win.' },
  race:  { t:'Race', d:'Everyone rows the same distance from a common start. First across wins.' },
  relay: { t:'Relay', d:'Teams take turns: when one rower finishes a leg, the next one gets GO on the phone.' },
  zone:  { t:'Hold the zone', d:'Points for every second inside a watt, rate or heart-rate band. Rewards control, not just power.' },
  goal:  { t:'Team metres', d:'The whole group rows towards one shared distance goal.' },
};
const GAME = { kind:'ghost', run:null, cfg:{ ghost:{dist:500}, race:{dist:500}, relay:{teams:2, leg:250, rounds:1}, zone:{mode:'watt', lo:180, hi:220, zk:'UT1', rlo:20, rhi:22, min:5}, goal:{m:20000} },
  tick(id){ const r=this.run; if (!r || r.done) return; const L=C.live[id]; if (!L) return; const st=L.st, now=Date.now();
    if ((r.kind==='race'||r.kind==='ghost') && r.go && r.p[id] && !r.p[id].fin){ const p=r.p[id]; if (p.d0==null) p.d0=L.dist; const pm=p.m||0, pt=p.pt||r.go; p.m = L.dist-p.d0; p.pt=now; if (p.m>=r.dist){ p.fin=(pt + (p.m>pm ? (r.dist-pm)/(p.m-pm) : 1)*(now-pt) - r.go)/1000; p.m=r.dist; r.place=(r.place||0)+1; p.place=r.place; if (r.kind==='ghost'){ const g = p.gt - p.fin; p.gain = g; if (g>0){ C.rt.send({type:'cmd',to:[id],title:'You beat your ghost!',sub:`${fmt(g,1)} s faster than ${p.src}`,ttl:8}); pushLiveEv(id,{k:'ghost',gain:g,src:p.src}); } else C.rt.send({type:'cmd',to:[id],title:fmtTime(p.fin),sub:`${fmt(-g,1)} s behind ${p.src}. Next time!`,ttl:8}); } else C.rt.send({type:'cmd',to:[id],title:`#${p.place} · ${fmtTime(p.fin)}`,sub:'Finished',ttl:8}); if (Object.values(r.p).every(x=>x.fin)) r.done=true; } }
    if (r.kind==='relay' && r.go){ for (const tm of r.teams){ if (tm.fin) continue; const cur = tm.order[tm.leg % tm.order.length]; if (cur!==id) continue; if (tm.d0==null) tm.d0=L.dist; tm.cur = Math.max(0, L.dist-tm.d0);
        if (tm.cur>=r.leg){ tm.leg++; tm.cur=0; tm.d0=null; const total=tm.order.length*r.rounds;
          if (tm.leg>=total){ tm.fin=(now-r.go)/1000; r.place=(r.place||0)+1; tm.place=r.place; C.rt.send({type:'cmd',to:tm.order,title:`${tm.name}: #${tm.place}`,sub:fmtTime(tm.fin),ttl:10}); if (r.teams.every(t=>t.fin)) r.done=true; }
          else { const nx = tm.order[tm.leg % tm.order.length]; C.rt.send({type:'cmd',to:[nx],title:'GO!',sub:`${tm.name} · leg ${tm.leg+1} of ${total} · ${r.leg} m`,ttl:4}); C.rt.send({type:'cmd',to:[id],title:'Done · great leg',sub:`${nameOf(nx)} is rowing`,ttl:4}); if (C.live[nx]) tm.d0 = C.live[nx].dist; } } } }
    if (r.kind==='zone' && r.go && r.p[id] && now<r.end){ const p=r.p[id], dt = p.last ? Math.min(3,(now-p.last)/1000) : 1; p.last=now; p.tot+=dt; let ok=false;
      if (r.mode==='watt') ok = st.watt>=r.lo && st.watt<=r.hi; else if (r.mode==='rate') ok = st.rate>=r.rlo && st.rate<=r.rhi; else { const z=hrInfo(id).z; ok = !!z && z.k===r.zk; }
      p.ok = ok; if (ok) p.in+=dt; }
    if (r.kind==='zone' && now>=r.end && !r.done){ r.done=true; C.rt.send({type:'cmd',to:Object.keys(r.p),title:'Time!',sub:'Hold the zone is over',ttl:6}); }
    if (r.kind==='goal' && r.go && r.p[id]){ const p=r.p[id]; if (p.d0==null) p.d0=L.dist; p.m = Math.max(0, L.dist-p.d0); const sum=Object.values(r.p).reduce((a,x)=>a+x.m,0); if (sum>=r.m && !r.done){ r.done=true; r.fin=(now-r.go)/1000; C.rt.send({type:'cmd',to:Object.keys(r.p),title:'Goal reached!',sub:`${Math.round(r.m)} m in ${fmtTime(r.fin)}`,ttl:10}); } }
  },
  draw(){ if (this.run) drawRun(); }
};
function renderGames(){
  $('gameCards').innerHTML = Object.entries(GAMES).map(([k,g])=>`<div class="panel ${GAME.kind===k?'sel':''}" data-g="${k}"><b>${g.t}</b><p class="hint">${g.d}</p></div>`).join('');
  $('gameCards').querySelectorAll('[data-g]').forEach(p=>p.onclick=()=>{ if (GAME.run && !GAME.run.done) return toast('Stop the running game first'); GAME.kind=p.dataset.g; GAME.run=null; renderGames(); });
  const k = GAME.kind, c = GAME.cfg[k], who = [...C.sel].filter(online), n = who.length;
  let h = `<h2>${GAMES[k].t} · set up</h2><div class="row">`;
  if (k==='ghost' || k==='race') h += `<span class="lbl">Distance</span>${[250,500,1000,2000].map(d=>`<button data-rd="${d}" class="${c.dist===d?'solid':''}">${d} m</button>`).join('')}<input id="gDist" type="number" value="${c.dist}" style="width:110px"> m`;
  if (k==='relay') h += `<span class="lbl">Teams</span><input id="gTeams" type="number" value="${c.teams}" min="2" max="6" style="width:70px"><span class="lbl">Leg</span><input id="gLeg" type="number" value="${c.leg}" style="width:90px"> m <span class="lbl">Legs each</span><input id="gRounds" type="number" value="${c.rounds}" min="1" max="10" style="width:70px"><button id="gShuffle">Shuffle teams</button>`;
  if (k==='zone') h += `<select id="gMode"><option value="watt" ${c.mode==='watt'?'selected':''}>Watts</option><option value="rate" ${c.mode==='rate'?'selected':''}>Stroke rate</option><option value="hr" ${c.mode==='hr'?'selected':''}>Heart-rate zone</option></select>
     ${c.mode==='watt'?`<input id="gLo" type="number" value="${c.lo}" style="width:90px">–<input id="gHi" type="number" value="${c.hi}" style="width:90px"> W`:''}${c.mode==='rate'?`<input id="gRlo" type="number" value="${c.rlo}" style="width:80px">–<input id="gRhi" type="number" value="${c.rhi}" style="width:80px"> spm`:''}${c.mode==='hr'?`<select id="gZk">${ZONES.map(z=>`<option ${c.zk===z.k?'selected':''}>${z.k}</option>`).join('')}</select><span class="hint">each rower's own Karvonen zone</span>`:''}
     <span class="lbl">for</span><input id="gMin" type="number" value="${c.min}" style="width:70px"> min`;
  if (k==='goal') h += `<span class="lbl">Goal</span><input id="gM" type="number" value="${c.m}" style="width:120px"> m <span class="hint">${n?`≈ ${Math.round(c.m/n)} m each`:''}</span>`;
  h += `</div>`;
  if (k==='relay'){ if (!GAME.teams || GAME.teams.flat().some(id=>!who.includes(id)) || who.some(id=>!GAME.teams.flat().includes(id)) || GAME.teams.length!==c.teams) makeTeams(who, c.teams);
    h += `<div class="grid2" style="grid-template-columns:repeat(${Math.min(3,c.teams)},1fr);margin-top:12px">${GAME.teams.map((t,i)=>`<div class="teamBox"><b>Team ${'ABCDEF'[i]}</b><ol>${t.map(id=>`<li>${esc(nameOf(id))}</li>`).join('')}</ol></div>`).join('')}</div>`; }
  h += `<div class="row" style="margin-top:14px"><button class="mg" id="gStart" ${n<(k==='relay'?2:1)?'disabled':''}>Start with ${n} rower${n===1?'':'s'}</button><span class="hint">Uses the ticked rowers who are online. Rowers keep their PM5 in Just Row; the game measures metres from GO.</span></div>`;
  $('gameSet').innerHTML = h;
  const num = (id,key)=>{ const e=$(id); if (e) e.onchange=()=>{ c[key] = e.tagName==='SELECT' ? e.value : +e.value; renderGames(); }; };
  num('gDist','dist'); num('gTeams','teams'); num('gLeg','leg'); num('gRounds','rounds'); num('gMode','mode'); num('gLo','lo'); num('gHi','hi'); num('gRlo','rlo'); num('gRhi','rhi'); num('gZk','zk'); num('gMin','min'); num('gM','m');
  $('gameSet').querySelectorAll('[data-rd]').forEach(b=>b.onclick=()=>{ c.dist=+b.dataset.rd; renderGames(); });
  if ($('gShuffle')) $('gShuffle').onclick = ()=>{ makeTeams(who.sort(()=>Math.random()-0.5), c.teams, true); renderGames(); };
  $('gStart').onclick = ()=>startGame(who);
  drawRun();
}
function makeTeams(ids, n, raw){
  // balance by recent watts with a snake draft
  const w = id => (C.live[id] && C.live[id].st.watt) || 0;
  const s = raw ? ids : [...ids].sort((a,b)=>w(b)-w(a)); const t = Array.from({length:n},()=>[]);
  s.forEach((id,i)=>{ const r = Math.floor(i/n), j = i%n; t[r%2 ? n-1-j : j].push(id); }); GAME.teams = t;
}
function startGame(who){
  const k = GAME.kind, c = GAME.cfg[k], CD = 5;
  const r = { kind:k, go:null, done:false, p:{} };
  if (k==='race'){ r.dist=c.dist; who.forEach(id=>r.p[id]={m:0,d0:null}); }
  if (k==='ghost'){ r.dist=c.dist; who.forEach(id=>{ const g = ghostPace(progOf(id), c.dist) || { pace:135, src:'a starter ghost (2:15 /500 m)' }; r.p[id]={m:0,d0:null,gt:g.pace*c.dist/500,src:g.src}; }); }
  if (k==='relay'){ r.leg=c.leg; r.rounds=c.rounds; r.teams = GAME.teams.filter(t=>t.length).map((t,i)=>({ name:'Team '+'ABCDEF'[i], order:t, leg:0, cur:0, d0:null })); }
  if (k==='zone'){ Object.assign(r, { mode:c.mode, lo:c.lo, hi:c.hi, rlo:c.rlo, rhi:c.rhi, zk:c.zk }); who.forEach(id=>r.p[id]={in:0,tot:0,last:null,ok:false}); }
  if (k==='goal'){ r.m=c.m; who.forEach(id=>r.p[id]={m:0,d0:null}); }
  GAME.run = r; $('gameRun').innerHTML='';
  const sub = k==='ghost' ? `${c.dist} m · beat your ghost` : k==='race' ? `${c.dist} m race` : k==='relay' ? `Relay · ${c.leg} m legs` : k==='zone' ? `Hold ${c.mode==='watt'?c.lo+'–'+c.hi+' W':c.mode==='rate'?c.rlo+'–'+c.rhi+' spm':c.zk} for ${c.min} min` : `Team goal ${c.m} m`;
  GAME.sub = sub.toUpperCase();
  if (k==='relay'){ const first = r.teams.map(t=>t.order[0]); C.rt.send({type:'cmd',to:first,count:CD,sub:sub+' · you start'}); r.teams.forEach(t=>t.order.slice(1).forEach((id,i)=>C.rt.send({type:'cmd',to:[id],title:`${t.name} · you are #${i+2}`,sub:'Wait for GO on your phone',ttl:CD+2}))); }
  else C.rt.send({ type:'cmd', to:who, count:CD, sub });
  r.cd = Date.now()+CD*1000;
  setTimeout(()=>{ r.go = Date.now(); if (k==='zone') r.end = r.go + c.min*60000;
    for (const id in r.p) if (C.live[id]) r.p[id].d0 = C.live[id].dist;
    if (r.teams) for (const t of r.teams){ const id=t.order[0]; if (C.live[id]) t.d0 = C.live[id].dist; } }, CD*1000);
  drawRun();
}
function drawRun(){
  const r = GAME.run, el = $('gameRun'); if (!el) return;
  if (!r){ GFX.stop(); el.innerHTML = '<p class="hint">Set up a game above and press Start. The countdown shows on every phone, then the boats race live.</p>'; return; }
  if (!$('gfxBox')){ el.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:10px"><h2 style="margin:0" id="gTitle"></h2><button id="gStop">Stop</button></div><div id="gfxBox"></div><div id="gInfo"></div>`; }
  GFX.mount($('gfxBox'));
  const now = Date.now(), t = r.go ? (now-r.go)/1000 : 0, pal = i => GFX.PAL[i % GFX.PAL.length];
  const rateOf = id => (C.live[id] && online(id) && C.live[id].st.rate) || 0, idx = id => Math.max(0, sideIds().indexOf(id));
  const L = []; let winner = null, info = '';
  if (r.kind==='race'){ const ps = Object.entries(r.p).sort((a,b)=>(a[1].fin||1e9)-(b[1].fin||1e9) || b[1].m-a[1].m); ps.forEach(([,p],i)=>{ if (p.fin) p.place=i+1; });
    Object.entries(r.p).forEach(([id,p])=>L.push({ name:nameOf(id), col:pal(idx(id)), frac:p.m/r.dist, res:p.fin?fmtTime(p.fin):`${Math.round(p.m)} m`, sub:p.fin?'':`${C.live[id]&&C.live[id].st.pace?fmtPace(C.live[id].st.pace):'–'} /500 m`, place:p.place, rate:p.fin?0:rateOf(id) }));
    const w = ps.find(([,p])=>p.place===1); if (w) winner = `${nameOf(w[0])} · ${fmtTime(w[1].fin)}`; }
  if (r.kind==='ghost'){ const ps = Object.entries(r.p).sort((a,b)=>((b[1].gain??-1e9)/b[1].gt)-((a[1].gain??-1e9)/a[1].gt)); ps.forEach(([,p],i)=>{ if (p.fin) p.place=i+1; });
    Object.entries(r.p).forEach(([id,p])=>{ const gf = r.go ? Math.min(1, t/p.gt) : 0, ahead = p.fin ? p.gain : (p.m/r.dist - gf)*p.gt;
      L.push({ name:nameOf(id), col:pal(idx(id)), frac:p.m/r.dist, ghost:p.fin&&p.gain>0?null:gf, res:p.fin ? (p.gain>0?`+${fmt(p.gain,1)} s`:fmtTime(p.fin)) : `${ahead>=0?'+':'−'}${fmt(Math.abs(ahead),1)} s`, sub:`ghost ${fmtPace(p.gt/(r.dist/500))} /500 m`, place:p.fin&&p.gain>0?p.place:null, ok:!p.fin && ahead>0, rate:p.fin?0:rateOf(id) }); });
    const w = ps.find(([,p])=>p.gain>0); if (w && Object.values(r.p).every(p=>p.fin)) winner = `${nameOf(w[0])} · ${fmt(w[1].gain,1)} s ahead of ${w[1].src.replace('your','own')}`; }
  if (r.kind==='relay'){ const total = tm => tm.order.length*r.rounds*r.leg;
    r.teams.forEach((tm,i)=>{ const done = Math.min(total(tm), tm.leg*r.leg + (tm.cur||0)), cur = tm.order[tm.leg % tm.order.length];
      L.push({ name:tm.name, col:pal(i), frac:done/total(tm), res:tm.fin?fmtTime(tm.fin):`${Math.round(done)} m`, sub:tm.fin?'':`${nameOf(cur)} · leg ${tm.leg+1}`, place:tm.place, rate:tm.fin?0:rateOf(cur) }); });
    const w = r.teams.find(tm=>tm.place===1); if (w) winner = `${w.name} · ${fmtTime(w.fin)}`;
    info = `<div class="grid2" style="grid-template-columns:repeat(${Math.min(3,r.teams.length)},1fr);margin-top:12px">${r.teams.map(tm=>`<div class="teamBox"><b>${tm.name}</b><ol>${tm.order.map(id=>`<li class="${!tm.fin && tm.order[tm.leg%tm.order.length]===id?'act':''}">${esc(nameOf(id))}</li>`).join('')}</ol></div>`).join('')}</div>`; }
  if (r.kind==='zone'){ const ps = Object.entries(r.p).sort((a,b)=>b[1].in-a[1].in);
    Object.entries(r.p).forEach(([id,p])=>{ const i = ps.findIndex(x=>x[0]===id); const st = C.live[id] ? C.live[id].st : {}; const cur = r.mode==='watt' ? `${Math.round(st.watt||0)} W` : r.mode==='rate' ? `${st.rate||0} spm` : (hrInfo(id).z||{}).k||'–';
      L.push({ name:nameOf(id), col:pal(idx(id)), frac:p.tot ? p.in/p.tot : 0, res:`${Math.round(p.in)} pts`, sub:`now ${cur} · ${p.tot?Math.round(p.in/p.tot*100):0}% in`, ok:p.ok && !r.done, place:r.done?i+1:null, rate:rateOf(id) }); });
    if (r.done && ps[0]) winner = `${nameOf(ps[0][0])} · ${Math.round(ps[0][1].in)} pts`; }
  if (r.kind==='goal'){ const sum = Object.values(r.p).reduce((a,x)=>a+x.m,0), n = Object.keys(r.p).length;
    L.push({ name:'The team', col:'#c8352b', frac:sum/r.m, res:`${Math.round(sum)} / ${r.m} m`, rate:mean(Object.keys(r.p).map(rateOf)) });
    Object.entries(r.p).sort((a,b)=>b[1].m-a[1].m).forEach(([id,p])=>L.push({ name:nameOf(id), col:pal(idx(id)), frac:p.m/Math.max(1,r.m/n), res:`${Math.round(p.m)} m`, sub:`${Math.round(p.m/Math.max(1,sum)*100)}% of team`, rate:rateOf(id) }));
    if (r.done) winner = `${r.m} m in ${fmtTime(r.fin)}`; }
  if (r.done && !r.doneAt) r.doneAt = performance.now();
  if (r.go && !r.goAt) r.goAt = performance.now() - (Date.now()-r.go);
  const clock = !r.go ? '' : r.kind==='zone' ? (r.end>now ? fmtTime((r.end-now)/1000).replace(/\.\d$/,'') : '0:00') : fmtTime(r.done && r.fin ? r.fin : t).replace(/\.\d$/,'');
  GFX.set(L, { title:GAMES[r.kind].t, clock, go:!!r.go, goAt:r.goAt||0, done:r.done, finish:r.kind!=='zone', ghostMode:r.kind==='ghost',
    count: r.go ? null : Math.max(1, Math.ceil((r.cd-now)/1000)), sub: GAME.sub,
    winner: r.done && r.doneAt && performance.now()-r.doneAt < 5000 ? winner : null });
  $('gTitle').textContent = GAMES[r.kind].t + (r.done ? ' · finished' : '');
  $('gInfo').innerHTML = info;
  $('gStop').textContent = r.done ? 'Close' : 'Stop';
  $('gStop').onclick = ()=>{ if (!r.done){ r.done=true; C.rt.send({type:'cmd',to:Object.keys(r.p).concat(r.teams?r.teams.flatMap(t=>t.order):[]),title:'Stopped',ttl:4}); } else { GAME.run=null; $('gameRun').innerHTML=''; } drawRun(); };
}
setInterval(()=>{ if (C.view==='games' && GAME.run && !GAME.run.go) drawRun(); }, 200);

// ---------- analytics ----------
const ANA = { ss:[], from:null };
async function loadAna(){
  const per = +$('aPer').value; ANA.from = per ? new Date(Date.now()-per*864e5).toISOString() : null;
  $('aTrend').innerHTML = '<p class="hint">Loading…</p>';
  try{ ANA.ss = await API.coachSessions(C.token, null, ANA.from, false) || []; }catch(e){ $('aTrend').innerHTML = `<p class="hint">${esc(e.message)}</p>`; return; }
  renderAna();
}
['aPer'].forEach(id=>$(id).onchange=loadAna); ['aMet','aErg','aWho'].forEach(id=>$(id).onchange=renderAna);
const p2kOf = s => s.distance>=500 && s.duration>0 ? (s.duration/(s.distance/500) + 5*Math.log2(2000/s.distance))*4 : null;
const metOf = (s,k) => k==='p2k' ? p2kOf(s) : k==='peakPos' ? (s.summary&&s.summary.peakPos!=null ? s.summary.peakPos*100 : null) : s[k]!=null ? +s[k] : null;
function renderAna(){
  const ids = [...C.sel].filter(id=>athOf(id)), erg = $('aErg').checked;
  const ss = ANA.ss.filter(s=>ids.includes(s.athlete_id) && (!erg || (s.kind||'erg')==='erg') && !(s.summary&&s.summary.demo&&false));
  const met = $('aMet').value, lab = $('aMet').selectedOptions[0].textContent;
  $('aTrendT').textContent = lab + ' · per session';
  const series = ids.map(id=>({ id, name:nameOf(id), col:colOf(id), pts:ss.filter(s=>s.athlete_id===id).map(s=>[new Date(s.started_at).getTime(), metOf(s,met)]).filter(p=>p[1]!=null).sort((a,b)=>a[0]-b[0]) })).filter(s=>s.pts.length);
  $('aTrend').innerHTML = series.length ? timeChart(series, { invert:met==='p2k', fmt: met==='p2k' ? v=>fmtTime(v).replace(/\.\d$/,'') : met==='peakPos' ? v=>Math.round(v)+'%' : v=>Math.round(v) }) : '<p class="hint">No sessions for the ticked rowers in this period. Rowers save sessions from their phone with Stop &amp; save, or add them in their diary.</p>';
  $('aTrendLeg').innerHTML = series.map(s=>{ const a=s.pts[0][1], b=s.pts[s.pts.length-1][1], d=b-a; const better = met==='p2k' ? d<0 : met==='avg_hr' ? null : d>0;
    return `<span><i style="background:${s.col}"></i>${esc(s.name)} ${s.pts.length>1?`<b style="color:${better==null?'inherit':better?'#16a34a':'#b00020'}">${d>0?'+':''}${met==='p2k'?fmt(d,1)+' s':met==='peakPos'?Math.round(d)+' pts':Math.round(d)}</b>`:''}</span>`; }).join('');
  // force curve evolution
  const who = $('aWho'); const cur = who.value; who.innerHTML = ids.map(id=>`<option value="${id}">${esc(nameOf(id))}</option>`).join(''); if (ids.includes(cur)) who.value = cur;
  const mine = ss.filter(s=>s.athlete_id===who.value && s.summary && s.summary.curve && s.summary.curve.length).sort((a,b)=>a.started_at.localeCompare(b.started_at));
  if (mine.length){ const n=mine.length; const curves = mine.map((s,i)=>{ const c=s.summary.curve, mx=Math.max(...c)||1, f=n===1?1:i/(n-1); const g = Math.round(215-f*215);
      return { data:c.map(v=>v/mx*100), col: i===n-1 ? '#e07a55' : `rgb(${g},${g},${g})`, w: i===n-1 ? 3 : 1.3 }; });
    $('aCurve').innerHTML = forceChart(curves, { ideal:100, h:210 }).replace('>N<','>%<');
    const a = mine[0].summary, b = mine[n-1].summary;
    $('aCurveTxt').innerHTML = `${n} sessions, light grey = oldest, magenta = latest. Peak position ${Math.round(a.peakPos*100)}% → <b>${Math.round(b.peakPos*100)}%</b> (aim 35–45%). Force reaches half of peak at ${Math.round(a.pickup*100)}% → <b>${Math.round(b.pickup*100)}%</b> of the drive (earlier is better). ${b.humpShare!=null?`Curves with a dip: ${Math.round(a.humpShare*100)}% → <b>${Math.round(b.humpShare*100)}%</b>.`:''}`; }
  else { $('aCurve').innerHTML = '<p class="hint">No erg sessions with force curves for this rower yet.</p>'; $('aCurveTxt').innerHTML=''; }
  // zones
  const zk = ['Rec',...ZONES.map(z=>z.k)], zc = {Rec:'#d6d6d6'}; ZONES.forEach(z=>zc[z.k]=z.col);
  const zrows = ids.map(id=>{ const o={}; for (const s of ANA.ss.filter(s=>s.athlete_id===id)){ const zs = s.summary && s.summary.zoneSec; if (zs && Object.keys(zs).length) for (const k in zs) o[k]=(o[k]||0)+zs[k]; else if (s.zone && s.duration) o[s.zone]=(o[s.zone]||0)+s.duration; } return { id, o, tot:Object.values(o).reduce((a,b)=>a+b,0) }; });
  $('aZones').innerHTML = zrows.map(r=>`<div style="display:grid;grid-template-columns:120px 1fr 60px;gap:10px;align-items:center;margin:6px 0"><span>${esc(nameOf(r.id))}</span>${r.tot?`<div class="zbar">${zk.map(k=>r.o[k]?`<span title="${k} ${Math.round(r.o[k]/60)} min" style="width:${r.o[k]/r.tot*100}%;background:${zc[k]}"></span>`:'').join('')}</div>`:'<span class="hint">no heart-rate data</span>'}<span class="hint" style="text-align:right">${Math.round(r.tot/60)} min</span></div>`).join('')
    + `<div class="legend">${zk.map(k=>`<span><i style="background:${zc[k]}"></i>${k}</span>`).join('')}</div><p class="hint">All sessions, erg and other training, in the period. Zones are each rower's own Karvonen bands, so 80% of heart-rate reserve means the same effort for everyone.</p>`;
  // table
  ANA.rows = ids.map(id=>{ const a = athOf(id), m = ANA.ss.filter(s=>s.athlete_id===id), e = m.filter(s=>(s.kind||'erg')==='erg'); const p2 = pred2k(e); const sc = e.filter(s=>s.score!=null).map(s=>s.score);
    const last = m[0] ? new Date(m[0].started_at) : null;
    return { name:nameOf(id), sessions:m.length, km:Math.round(m.reduce((s,x)=>s+(x.distance||0),0)/100)/10, hours:Math.round(m.reduce((s,x)=>s+(x.duration||0),0)/360)/10, p2k:p2?p2.time:null, level:levelOf(p2&&p2.time, a.sex)||'', wkg:p2&&a.weight?Math.round(p2.watts/a.weight*100)/100:null, score:sc.length?Math.round(mean(sc)):null, peak:e[0]&&e[0].summary&&e[0].summary.peakPos!=null?Math.round(e[0].summary.peakPos*100):null, maxhr:maxHrOf(a)||null, rest:a.rest_hr||null, last:last?last.toLocaleDateString('sv-SE'):'' }; });
  const cols = [['name','Rower'],['sessions','Sessions'],['km','km'],['hours','Hours'],['p2k','Pred. 2 km'],['level','Level'],['wkg','W/kg'],['score','Tech score'],['peak','Peak %'],['maxhr','Max HR'],['rest','Rest HR'],['last','Last']];
  const sk = ANA.sk || 'name', dir = ANA.dir || 1; ANA.rows.sort((x,y)=>{ const a=x[sk], b=y[sk]; if (a==null) return 1; if (b==null) return -1; return (a<b?-1:a>b?1:0)*dir; });
  $('aTable').innerHTML = `<table class="t"><tr>${cols.map(([k,l])=>`<th data-k="${k}">${l}${sk===k?(dir>0?' ↑':' ↓'):''}</th>`).join('')}</tr>${ANA.rows.map(r=>`<tr>${cols.map(([k])=>`<td>${k==='p2k'?(r[k]?fmtTime(r[k]):'–'):r[k]??'–'}</td>`).join('')}</tr>`).join('')}</table>`;
  $('aTable').querySelectorAll('th').forEach(th=>th.onclick=()=>{ if (ANA.sk===th.dataset.k) ANA.dir=-(ANA.dir||1); else { ANA.sk=th.dataset.k; ANA.dir=1; } renderAna(); });
}
$('aCsv').onclick = ()=>{
  const ids = [...C.sel], rows = ANA.ss.filter(s=>ids.includes(s.athlete_id));
  const head = ['rower','date','kind','distance_m','duration_s','avg_watts','avg_rate','avg_hr','zone','rpe','tech_score','peak_pos','pickup','pred_2k_s','notes'];
  const q = v => v==null ? '' : /[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g,'""')}"` : v;
  const csv = [head.join(',')].concat(rows.map(s=>[nameOf(s.athlete_id), s.started_at, s.kind, s.distance, s.duration, s.avg_power, s.avg_rate, s.avg_hr, s.zone, s.rpe, s.score, s.summary&&s.summary.peakPos, s.summary&&s.summary.pickup, p2kOf(s)&&Math.round(p2kOf(s)*10)/10, s.notes].map(q).join(','))).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download = `ergcoach-${C.team.code}-${new Date().toISOString().slice(0,10)}.csv`; a.click();
};
function timeChart(series, o={}){
  const W=900, H=260, L=56, R=16, T=14, B=28;
  const xs = series.flatMap(s=>s.pts.map(p=>p[0])), ys = series.flatMap(s=>s.pts.map(p=>p[1]));
  let x0=Math.min(...xs), x1=Math.max(...xs); if (x1-x0<864e5){ x0-=432e5; x1+=432e5; }
  let y0=Math.min(...ys), y1=Math.max(...ys); const pad=(y1-y0||Math.abs(y1)*0.1||1)*0.12; y0-=pad; y1+=pad;
  const X = t => L+(t-x0)/(x1-x0)*(W-L-R), Y = v => o.invert ? T+(v-y0)/(y1-y0)*(H-T-B) : T+(1-(v-y0)/(y1-y0))*(H-T-B);
  let g = '';
  for (let i=0;i<=4;i++){ const v=y0+(y1-y0)*i/4; g += `<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#eee"/><text x="${L-6}" y="${Y(v)+4}" font-size="11" text-anchor="end" fill="#888">${o.fmt(v)}</text>`; }
  for (let i=0;i<=4;i++){ const t=x0+(x1-x0)*i/4; g += `<text x="${X(t)}" y="${H-8}" font-size="11" text-anchor="middle" fill="#888">${new Date(t).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</text>`; }
  for (const s of series){ g += `<path d="${s.pts.map((p,i)=>`${i?'L':'M'}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join('')}" fill="none" stroke="${s.col}" stroke-width="2.4" stroke-linejoin="round"/>` + s.pts.map(p=>`<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="3.5" fill="${s.col}"><title>${esc(s.name)} · ${new Date(p[0]).toLocaleDateString('sv-SE')} · ${o.fmt(p[1])}</title></circle>`).join(''); }
  if (o.invert) g += `<text x="${L}" y="${T-2}" font-size="10" fill="#888">faster ↑</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" font-family="Chivo Mono,monospace">${g}</svg>`;
}

// ---------- roster ----------
function renderRoster(){
  $('roster').innerHTML = C.athletes.map(a=>`<div class="rosterRow" data-id="${a.id}"><input data-f="name" value="${esc(a.name)}"><input data-f="max_hr" type="number" value="${a.max_hr||''}" placeholder="${maxHrOf(a)||'bpm'}"><input data-f="rest_hr" type="number" value="${a.rest_hr||''}"><input data-f="birth_year" type="number" value="${a.birth_year||''}"><span class="row" style="gap:6px;flex-wrap:nowrap"><button data-save>Save</button><button data-del>✕</button></span></div>`).join('') || '<p class="hint">No rowers yet.</p>';
  $('roster').querySelectorAll('.rosterRow').forEach(r=>{
    const id = r.dataset.id;
    r.querySelector('[data-save]').onclick = async ()=>{ const p={id}; r.querySelectorAll('[data-f]').forEach(i=>{ if (i.value!=='') p[i.dataset.f] = i.type==='number' ? +i.value : i.value; });
      if (p.pin && !/^\d{4}$/.test(p.pin)) return toast('PIN: 4 digits'); try{ await API.coachSaveAthlete(C.token,p); await loadTeam(); renderRoster(); renderSide(); toast('Saved'); }catch(e){ toast(e.message); } };
    const np = r.querySelector('[data-nopin]'); if (np) np.onclick = async ()=>{ await API.coachSaveAthlete(C.token,{ id, pin:'none' }); await loadTeam(); renderRoster(); toast('PIN removed'); };
    r.querySelector('[data-del]').onclick = async e=>{ const b=e.target; if (!b.dataset.arm){ b.dataset.arm=1; b.textContent='Sure?'; return; } await API.coachRemoveAthlete(C.token,id); C.sel.delete(id); await loadTeam(); renderRoster(); renderSide(); };
  });
}
$('rAdd').onclick = async ()=>{
  const name=$('rName').value.trim(), pin=''; if (!name) return toast('Name?');
  try{ const id = await API.coachSaveAthlete(C.token,{ name, pin, max_hr:+$('rMax').value||null, rest_hr:+$('rRest').value||null, birth_year:+$('rBy').value||null }); C.sel.add(id); saveC();
    ['rName','rMax','rRest','rBy'].forEach(i=>$(i).value=''); await loadTeam(); renderRoster(); renderSide(); $('rName').focus(); }catch(e){ toast(e.message); }
};
$('rBy').onkeydown = $('rName').onkeydown = e=>{ if (e.key==='Enter') $('rAdd').click(); };
function inviteUrl(){ return new URL('index.html?team='+C.team.code, location.href).href; }
async function renderInvite(){
  const u = inviteUrl(); $('invUrl').textContent = u; $('invCopy').onclick = ()=>navigator.clipboard.writeText(u).then(()=>toast('Copied'));
  $('qr').innerHTML = qrSVG(u);
}

// ---------- simulated rowers (try everything without 24 ergs) ----------
$('bSim').onclick = ()=>{
  if (C.sims){ clearInterval(C.sims.h); C.sims=null; $('bSim').textContent='Simulate rowers'; return; }
  const free = C.athletes.filter(a=>!online(a.id)); const ids = free.length ? free.map(a=>({id:a.id,name:a.name})) : 'Anna Erik Johan Sara Oskar Maja Leo Ida'.split(' ').map((n,i)=>({id:'sim-'+i,name:n}));
  const sims = ids.map((a,i)=>({ ...a, w:150+Math.random()*170, r:19+Math.round(Math.random()*6), dist:0, el:0, hr:95, next:0, kind:['good','late','soft','hump','good','spike'][i%6], drift:0 }));
  C.sims = { h:setInterval(()=>{ const now=Date.now();
    for (const s of sims){ s.drift += (Math.random()-0.5)*6; const w = Math.max(80, s.w + s.drift + Math.sin(now/9000+s.w)*12); const v = Math.cbrt(w/2.8); s.dist += v; s.el += 1; s.hr += ((105 + w*0.22) - s.hr)*0.08;
      onMsg({ type:'st', id:s.id, name:s.name, t:now, pace:500/v, rate:s.r, watt:Math.round(w), dist:Math.round(s.dist), el:s.el, hr:Math.round(s.hr), max_hr:190, rest_hr:50, demo:true });
      if (WK.s && WK.s.status!=='done' && !(WK.s.players[s.id])) onMsg({ type:'join', sid:WK.s.sid, id:s.id, name:s.name, av:avDefault(s.id) });
      if (now >= s.next){ s.next = now + 60000/s.r; const pk = w*2.1; const c = IDEAL.map((x,j)=>{ const p=j/49; let f = x;
          const kind = Math.random()<0.75 ? 'good' : s.kind;
          if (kind==='late') f = Math.pow(Math.max(0,Math.sin(Math.PI*Math.pow(p,1.35))),1.1); if (kind==='soft') f = x*Math.min(1,p*3.2); if (kind==='hump') f = x*(1-0.32*Math.exp(-(((p-0.5)/0.07)**2))); if (kind==='spike') f = Math.pow(x,2.4);
          return pk*f*(0.96+Math.random()*0.08); });
        const m = curveMetrics(c); onMsg({ type:'k', id:s.id, name:s.name, t:now, c:resample(c,30).map(Math.round), dl:1.42, dt:0.85, rt:60/s.r-0.85, pk:Math.round(pk), p:Math.round(w), r:s.r, hr:Math.round(s.hr), pp:m&&+m.peakPos.toFixed(2), pu:m&&+m.pickup.toFixed(2), hu:m&&m.humps, dist:Math.round(s.dist) });
        if (WK.s && WK.s.status==='run'){ const st = WK.s.steps[WK.s.idx]; const rr = st.rate ? st.rate[0] + Math.round((Math.random()-0.3)*(st.rate[1]-st.rate[0]+2)) : s.r; s.r = rr; const j = judge({ curve:c, rate:rr, power:w }, st, progOf(s.id).normal || s.w);
          if (j){ s.R = s.R || newRun(); scoreStroke(s.R, j); onMsg({ type:'hit', sid:WK.s.sid, id:s.id, name:s.name, g:j.g, why:j.why, R:{...s.R} }); } } } }
  }, 1000) };
  $('bSim').textContent = `Stop simulation (${sims.length})`; toast(`${sims.length} simulated rowers`);
};

// ---------- spotlight: only people who beat themselves ----------
function vsNormal(id){
  const L = C.live[id], n = progOf(id).normal; if (!L || !online(id) || !n) return null;
  const ks = L.k.filter(k=>k.p && Date.now()-k.t < 30000); if (ks.length < 4) return null;
  return (mean(ks.map(k=>k.p))/n - 1)*100;
}
function pushLiveEv(id, e){ C.liveEv.push({ ...e, id, at:new Date().toISOString() }); if (C.view==='spot') renderSpot(); }
function spFrom(){ const w = +$('spWin').value; const d = new Date(); if (!w){ d.setHours(0,0,0,0); return d.toISOString(); } return new Date(Date.now()-w*864e5).toISOString(); }
function stars(){
  const from = spFrom(), out = [];
  for (const id of sideIds()){
    const P = progOf(id), raw = P.events.filter(e=>e.at>=from).concat(C.liveEv.filter(e=>e.id===id && e.at>=from));
    if (!raw.length) continue;
    const best = {}; for (const e of raw){ const key = e.k==='badge' ? 'b'+e.b : e.k==='pb' ? 'pb'+e.d : e.k;
      const val = e.k==='watts' ? e.pct : e.k==='tech' ? e.gain : e.k==='ghost' ? e.gain : e.k==='streak' ? e.weeks : e.k==='level' ? e.level : 1;
      if (!best[key] || val >= best[key].val) best[key] = { ...e, val }; }
    const evs = Object.values(best).sort((a,b)=>(EV_W[b.k]||0)-(EV_W[a.k]||0) || b.val-a.val);
    out.push({ id, P, evs, score:evs.reduce((a,e)=>a+(EV_W[e.k]||0),0) });
  }
  return out.sort((a,b)=>b.score-a.score);
}
function capOf(id){ return GFX.PAL[Math.max(0, sideIds().indexOf(id)) % GFX.PAL.length]; }
function renderSpotLive(){
  const hot = sideIds().map(id=>({ id, d:vsNormal(id) })).filter(x=>x.d!=null && x.d>=3).sort((a,b)=>b.d-a.d);
  $('spLive').innerHTML = hot.length ? `<div class="lbl" style="margin-bottom:6px">Right now, above their own normal</div><div class="liveStrip">${hot.map(x=>`<span class="pill" style="background:${capOf(x.id)}">${esc(nameOf(x.id))}<small>+${Math.round(x.d)}%</small></span>`).join('')}</div>` : '';
  SPOT.hot = hot;
}
function renderSpot(){
  renderSpotLive();
  const st = stars(); SPOT.stars = st;
  $('spCards').innerHTML = st.length ? st.map(x=>{ const top = evText(x.evs[0]);
    return `<div class="star"><div class="lv">Level ${x.P.level}<br>${esc(rankOf(x.P.level))}<div class="xpbar"><i style="width:${Math.round(x.P.lvFrac*100)}%"></i></div></div>
      <div class="who"><span class="cap" style="background:${capOf(x.id)}"></span>${esc(nameOf(x.id))}</div>
      <div class="big">${esc(top.big)}</div><div class="line">${esc(top.line)}</div>${top.sub?`<div class="sub">${esc(top.sub)}</div>`:''}
      ${x.evs.length>1?`<ul>${x.evs.slice(1,5).map(e=>{ const t=evText(e); return `<li>★ <b>${esc(t.big)}</b> · ${esc(t.line)}</li>`; }).join('')}</ul>`:''}</div>`; }).join('')
    : `<div class="star" style="grid-column:1/-1;text-align:center"><div class="big">Your PB could be next</div><div class="line">Nobody has beaten their own normal in this period yet.</div><div class="sub">Personal bests, +3% watts on your own normal, a cleaner stroke, streaks and level-ups land here.</div></div>`;
  // effort ladder: XP earned in the period, so volume and consistency count, not talent
  const from = spFrom();
  const rows = sideIds().filter(id=>athOf(id)).map(id=>{ const P = progOf(id); const ss = C.hist.filter(s=>s.athlete_id===id && s.started_at>=from);
    const xp = ss.reduce((a,s)=>a+20+Math.round((s.distance||0)/100),0) + P.events.filter(e=>e.at>=from).reduce((a,e)=>a+(e.k==='pb'?60:e.k==='badge'?40:0),0);
    return { id, P, xp, km:ss.reduce((a,s)=>a+(s.distance||0),0)/1000, n:ss.length }; }).filter(r=>r.xp>0).sort((a,b)=>b.xp-a.xp);
  $('spLadder').innerHTML = `<h2>XP earned · ${$('spWin').selectedOptions[0].textContent.toLowerCase()}</h2><p class="hint" style="margin-top:-6px">XP comes from rowing and from beating yourself: 1 per 100 m, 20 per session, 60 per PB, 40 per badge.</p>`
    + (rows.length ? `<table class="t"><tr><th>Rower</th><th>XP</th><th>Sessions</th><th>km</th><th>Level</th><th>Streak</th><th>Badges</th></tr>${rows.map(r=>`<tr><td><span style="display:inline-block;width:12px;height:12px;border-radius:50%;border:2px solid #1b130d;background:${capOf(r.id)};vertical-align:-2px;margin-right:8px"></span>${esc(nameOf(r.id))}</td><td><b>+${r.xp}</b></td><td>${r.n}</td><td>${fmt(r.km,1)}</td><td>${r.P.level} · ${esc(rankOf(r.P.level))}</td><td>${r.P.streak?r.P.streak+' wk':'–'}</td><td>${Object.keys(r.P.badges).length}/${Object.keys(BADGES).length}</td></tr>`).join('')}</table>` : '<p class="hint">No saved sessions in this period.</p>');
}
$('spWin').onchange = renderSpot;
const SPOT = { i:0, h:0, stars:[], hot:[] };
function spSlides(){
  const sl = SPOT.hot.slice(0,4).map(x=>({ id:x.id, e:{ k:'live', pct:x.d, w:mean(C.live[x.id].k.slice(-8).map(k=>k.p||0)), base:progOf(x.id).normal } }));
  for (const x of SPOT.stars) sl.push(...x.evs.slice(0,2).map(e=>({ id:x.id, e })));
  return sl;
}
function spNext(){
  renderSpot(); const sl = spSlides();
  if (!sl.length) $('spCard').innerHTML = `<div class="big" style="font-size:clamp(40px,6vw,90px)">Your PB<br>could be next</div><div class="line">Beat your own normal and you show up here.</div>`;
  else { const s = sl[SPOT.i++ % sl.length], t = evText(s.e);
    $('spCard').innerHTML = `<div class="who"><span class="cap" style="background:${capOf(s.id)}"></span>${esc(nameOf(s.id))}</div><div class="big">${esc(t.big)}</div><div class="line">${esc(t.line)}</div>${t.sub?`<div class="sub">${esc(t.sub)}</div>`:''}`; }
  const c = $('spCard'); c.style.animation='none'; void c.offsetWidth; c.style.animation='';
  const b = $('spBar'); b.style.transition='none'; b.style.width='0'; void b.offsetWidth; b.style.transition='width 7s linear'; b.style.width='100%';
}
$('spBig').onclick = ()=>{ $('spShow').classList.remove('hidden'); SPOT.i=0; spNext(); SPOT.h = setInterval(spNext, 7000); if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(()=>{}); };
$('spClose').onclick = ()=>{ $('spShow').classList.add('hidden'); clearInterval(SPOT.h); if (document.fullscreenElement) document.exitFullscreen(); };
document.addEventListener('keydown', e=>{ if (e.key==='Escape' && !$('spShow').classList.contains('hidden')) $('spClose').click(); });

// ---------- start ----------
applyLp(['v-games','v-wk','v-spot','spShow']);
document.body.classList.add('lpbg'); document.body.style.backgroundImage = lpURL(1600, 1000, ['#8f84c8','#b9a2d6','#e8b0c6','#f6c6b1','#fcdcc0'], 29, 18, 11);
// one coach, one erg room: no login. Open the fixed team, create it the first time.
(async ()=>{ try{
  if (C.token){ try{ await API.coachTeam(C.token); return enter({ token:C.token, team:C.team }); }catch(e){ C.token=null; } }
  let r; try{ r = await API.coachLogin(TEAM_CODE, ''); }catch(e){ r = await API.createTeam('Erg room', TEAM_CODE, ''); }
  await enter(r);
}catch(e){ $('login').classList.remove('hidden'); $('lMsg').textContent = e.message; } })();
