// ---------- athlete: team login, live to the coach, diary, heart-rate zones ----------
const TEAM = (()=>{ try{ return JSON.parse(localStorage.getItem('ergcoach.team')||'null'); }catch(e){ return null; } })() || {};
const saveTeam = ()=>localStorage.setItem('ergcoach.team', JSON.stringify({code:TEAM.code, token:TEAM.token, athlete:TEAM.athlete, team:TEAM.team}));
const URLTEAM = new URLSearchParams(location.search).get('team') || TEAM_CODE;
let RT = null, rtCode = null, joinState = { step:'code', roster:null, pick:null, pin:'' };
function profileHR(){ return { max_hr:S.profile.max_hr, rest_hr:S.profile.rest_hr, birth_year:S.profile.birth_year }; }

// --- team panel ---
function renderTeam(){
  const p = $('teamPane');
  if (TEAM.token){
    p.innerHTML = `<h2>Team</h2><div class="field"><div class="fl"><b style="font-size:16px">${esc(TEAM.athlete.name)}</b><small>${esc(TEAM.team||TEAM.code)} · ${API.kind==='local'?'local demo server':'live to the coach'}</small></div><span class="dot ${RT?'on':''}"></span></div><div class="btnRow"><button id="tOut">Log out</button></div>`;
    $('tOut').onclick = ()=>{ if (RT) RT.close(); RT=null; Object.assign(TEAM,{token:null,athlete:null}); saveTeam(); joinState={step:'roster',roster:joinState.roster,pick:null,pin:''}; renderTeam(); renderDiaryIfOpen(); };
    return;
  }
  if (joinState.step==='code'){
    p.innerHTML = `<h2>Join your team</h2><div class="field"><div class="fl">Team code<small>from your coach or the QR code</small></div><input type="text" id="tCode" style="width:130px;text-transform:uppercase" value="${esc(TEAM.code||URLTEAM||'')}" autocapitalize="characters"></div><div class="btnRow"><button class="solid" id="tFind">Find team</button></div><p class="status" id="tMsg"></p>`;
    $('tFind').onclick = async ()=>{ const code=$('tCode').value.trim().toUpperCase(); if (!code) return; try{ const r = await API.roster(code); if (!r || !r.team){ $('tMsg').textContent='No team with that code.'; return; } TEAM.code=code; TEAM.team=r.team.name; saveTeam(); joinState={step:'roster',roster:r,pick:null,pin:''}; renderTeam(); }catch(e){ $('tMsg').textContent=e.message; } };
    return;
  }
  if (joinState.step==='roster'){
    const r = joinState.roster;
    if (!r){ joinState.step='code'; return renderTeam(); }
    p.innerHTML = `<h2>${esc(r.team.name)} · tap your name</h2>${r.athletes.length ? `<div class="names">${r.athletes.map(a=>`<button data-a="${a.id}">${esc(a.name)}</button>`).join('')}</div>` : '<p class="hint">The coach has not added anyone yet.</p>'}<div class="btnRow"><button id="tBack">Other team</button></div>`;
    p.querySelectorAll('[data-a]').forEach(b=>b.onclick=async ()=>{ joinState.pick=r.athletes.find(a=>a.id===b.dataset.a);
      // no PIN set for this rower: scanning the QR and tapping your name is enough
      if (!joinState.pick.has_pin){ try{ const res = await API.athleteLogin(TEAM.code, joinState.pick.id, ''); TEAM.token=res.token; TEAM.athlete=res.athlete; saveTeam(); await afterLogin(); toast('Hi '+res.athlete.name); }catch(e){ toast(e.message); } return; }
      joinState.step='pin'; joinState.pin=''; renderTeam(); });
    $('tBack').onclick = ()=>{ joinState.step='code'; renderTeam(); };
    return;
  }
  // PIN pad
  p.innerHTML = `<h2>${esc(joinState.pick.name)} · your 4-digit code</h2><div class="pinDots">${[0,1,2,3].map(i=>`<i class="${i<joinState.pin.length?'on':''}"></i>`).join('')}</div><p class="status" id="tMsg" style="text-align:center"></p>
    <div class="pad">${[1,2,3,4,5,6,7,8,9].map(n=>`<button data-n="${n}">${n}</button>`).join('')}<button data-n="back">⌫</button><button data-n="0">0</button><button data-n="x" style="font-size:12px">Back</button></div>`;
  p.querySelectorAll('[data-n]').forEach(b=>b.onclick=async ()=>{
    const n=b.dataset.n;
    if (n==='x'){ joinState.step='roster'; return renderTeam(); }
    if (n==='back') joinState.pin = joinState.pin.slice(0,-1); else if (joinState.pin.length<4) joinState.pin += n;
    p.querySelectorAll('.pinDots i').forEach((d,i)=>d.classList.toggle('on', i<joinState.pin.length));
    if (joinState.pin.length===4){
      try{ const r = await API.athleteLogin(TEAM.code, joinState.pick.id, joinState.pin); TEAM.token=r.token; TEAM.athlete=r.athlete; saveTeam(); await afterLogin(); toast('Hi '+r.athlete.name); }
      catch(e){ joinState.pin=''; renderTeam(); $('tMsg').textContent = e.message; }
    }
  });
}
async function afterLogin(){
  try{ const pr = await API.myProfile(TEAM.token); if (pr){ const m={height:'hgt',weight:'wgt',sex:'sex',birth_year:'birth_year',max_hr:'max_hr',rest_hr:'rest_hr'}; for (const k in m) if (pr[k]!=null) S.profile[m[k]]=pr[k]; save(); fillProfile(); if (pr.team) TEAM.team=pr.team; } }
  catch(e){ if (/Not logged in/i.test(e.message)){ TEAM.token=null; saveTeam(); } }
  await connectRt(); renderTeam(); renderDiaryIfOpen(); refreshProg();
}

// --- live to the coach ---
async function connectRt(){
  if (!TEAM.token || !TEAM.code) return;
  if (RT && rtCode===TEAM.code) return;
  try{ RT = await API.rt(TEAM.code, onCoachMsg); rtCode = TEAM.code; hello(); }catch(e){ console.warn('realtime', e); RT=null; }
  renderTeam();
}
const me = ()=>({ id:TEAM.athlete.id, name:TEAM.athlete.name });
function hello(){ if (RT && TEAM.athlete) RT.send({ type:'hi', ...me(), rowing: PM.connected||DEMO.on, demo:DEMO.on }); }
let lastSt = 0;
HOOKS.status.push(()=>{
  if (!RT || !TEAM.athlete) return; const now = Date.now(); if (now-lastSt < 900) return; lastSt = now;
  const last = LIVE.strokes[LIVE.strokes.length-1];
  RT.send({ type:'st', ...me(), t:now, pace:LIVE.pace || (last && paceFromWatts(last.power)) || null, rate:LIVE.rate||null, watt:LIVE.watt || (last&&last.power) || null, dist:Math.round(LIVE.dist||0), el:LIVE.elapsed||((now-(LIVE.start||now))/1000), hr:LIVE.hr||null, max_hr:maxHrOf(profileHR()), rest_hr:S.profile.rest_hr||null, n:LIVE.strokes.length, demo:DEMO.on });
});
HOOKS.stroke.push(s=>{
  if (!RT || !TEAM.athlete) return;
  const m = s.curve ? curveMetrics(s.curve) : null;
  RT.send({ type:'k', ...me(), t:s.t, c:s.curve ? resample(s.curve,30).map(v=>Math.round(v)) : null, dl:s.driveLen, dt:s.driveTime, rt:s.recTime, pk:s.peak?Math.round(s.peak):null, p:s.power, r:s.rate, hr:s.hr, pp:m&&+m.peakPos.toFixed(2), pu:m&&+m.pickup.toFixed(2), hu:m&&m.humps, dist:Math.round(LIVE.dist||0) });
});
setInterval(()=>{ if (RT && !(PM.connected||DEMO.on)) hello(); }, 5000);
function onCoachMsg(m){
  if (!m || !TEAM.athlete) return;
  if (m.type==='ping') return hello();
  if (m.type==='wk') return athWk(m);
  if (m.type!=='cmd') return;
  if (m.to && m.to!=='all' && !m.to.includes(TEAM.athlete.id)) return;
  if (m.count){ let n = m.count; const tick=()=>{ showBanner(n>0 ? String(n) : 'GO!', m.sub||''); if (n-- > 0) setTimeout(tick, 1000); else setTimeout(hideBanner, 1500); }; tick(); return; }
  showBanner(m.title||'', m.sub||''); if (m.ttl) setTimeout(hideBanner, m.ttl*1000);
}
function showBanner(t, sub){ $('bannerTxt').innerHTML = esc(t)+(sub?`<small>${esc(sub)}</small>`:''); $('banner').classList.remove('hidden'); }
function hideBanner(){ $('banner').classList.add('hidden'); }
$('bannerX').onclick = hideBanner;

// --- heart rate strap (any standard Bluetooth chest belt) ---
$('btnHr').onclick = async ()=>{
  const bt = navigator.bluetooth || navigator.webble; if (!bt){ btCheck(); return; }
  try{
    const d = await bt.requestDevice({ filters:[{ services:['heart_rate'] }] });
    const c = await (await (await d.gatt.connect()).getPrimaryService('heart_rate')).getCharacteristic('heart_rate_measurement');
    c.addEventListener('characteristicvaluechanged', e=>{ const v=e.target.value, f=v.getUint8(0); LIVE.hr = f&1 ? v.getUint16(1,true) : v.getUint8(1); LIVE.hrSrc='strap'; liveUi(); });
    await c.startNotifications(); LIVE.hrSrc='strap'; $('btnHr').textContent = 'HR: '+(d.name||'connected'); toast('Heart rate connected');
    d.addEventListener('gattserverdisconnected', ()=>{ LIVE.hrSrc=null; $('btnHr').textContent='Heart rate strap'; });
  }catch(e){ if (e.name!=='NotFoundError') toast('Heart rate: '+e.message); }
};

// --- profile & zones ---
function fillProfile(){
  $('pHgt').value = S.profile.hgt||''; $('pWgt').value = S.profile.wgt||''; $('pSex').value = S.profile.sex||'';
  $('pBy').value = S.profile.birth_year||''; $('pMax').value = S.profile.max_hr||''; $('pRest').value = S.profile.rest_hr||'';
  renderZones();
}
function renderZones(){
  const p = profileHR(), zt = zoneTable(p), mx = maxHrOf(p);
  $('zoneBox').innerHTML = zt ? `<table class="zt"><tr><th>Zone</th><th>bpm</th><th>% HRR</th></tr>${zt.map(z=>`<tr><td><span class="sw" style="background:${z.col}"></span>${z.k}</td><td>${z.from}–${z.to}</td><td>${Math.round(z.lo*100)}–${Math.round(Math.min(1,z.hi)*100)}</td></tr>`).join('')}</table><p class="hint">Karvonen: zone bpm = resting + (max − resting) × %. It uses <b>your</b> resting pulse, so it is fairer than a plain % of max. ${S.profile.max_hr?'':`Max HR estimated at ${mx} from your age — a tested max is better.`}</p>`
    : `<p class="hint">Enter max (or year of birth) and resting heart rate to get your personal training zones.</p>`;
}
const profMap = { pHgt:'hgt', pWgt:'wgt', pSex:'sex', pBy:'birth_year', pMax:'max_hr', pRest:'rest_hr' };
for (const id in profMap) $(id).oninput = $(id).onchange = ()=>{
  const v = $(id).value; S.profile[profMap[id]] = id==='pSex' ? v : (+v||null); save(); renderZones();
  clearTimeout(fillProfile.h); fillProfile.h = setTimeout(()=>{ if (TEAM.token) API.updateProfile(TEAM.token, { height:S.profile.hgt, weight:S.profile.wgt, sex:S.profile.sex, birth_year:S.profile.birth_year, max_hr:S.profile.max_hr, rest_hr:S.profile.rest_hr }).catch(()=>{}); }, 800);
};

// --- save to the cloud diary ---
function zoneSecs(strokes){
  const o = {}; for (const s of strokes){ const z = zoneOf(profileHR(), s.hr); if (!z) continue; const d = (s.driveTime||0)+(s.recTime||0) || 60/(s.rate||20); o[z.k] = (o[z.k]||0)+d; }
  for (const k in o) o[k] = Math.round(o[k]); return o;
}
function cloudSession(L){
  const st = L.strokes, su = summarize(st), hrs = st.map(s=>s.hr).filter(Boolean), zs = zoneSecs(st);
  const dom = Object.entries(zs).sort((a,b)=>b[1]-a[1])[0];
  const dur = L.elapsed ? Math.round(L.elapsed) : Math.round((st[st.length-1].t - L.start)/1000 + (st[0].driveTime||0) + (st[0].recTime||0));
  return { started_at:new Date(L.start).toISOString(), kind:'erg', distance:Math.round(L.dist||0), duration:dur,
    avg_power:Math.round(su.power||0), avg_rate:+(su.rate||0).toFixed(1), avg_hr:hrs.length?Math.round(mean(hrs)):null, score:su.nC>=3?scoreOf(su):null, zone:dom?dom[0]:null,
    summary:{ game:L.game||undefined, peakPos:+su.peakPos.toFixed(3), pickup:+su.pickup.toFixed(3), ratio:+su.ratio.toFixed(2), cv:+su.cv.toFixed(3), humpShare:+su.humpShare.toFixed(2), dl:+(su.dl||0).toFixed(2), dt:+(su.dt||0).toFixed(2), rt:+(su.rt||0).toFixed(2), pk:Math.round(su.pk||0), curve:resample(su.avgCurve,25).map(v=>Math.round(v)), zoneSec:zs, demo:L.src==='demo' },
    strokes: packSession(L).strokes };
}
async function saveCloud(L){
  if (!TEAM.token) return false;
  try{ const id = await API.saveSession(TEAM.token, cloudSession(L)); DIARY.cache=null; await afterSave(id); return true; }catch(e){ console.warn(e); return false; }
}
// ---- competing against yourself ----
const MY = { P:null };
async function refreshProg(){ try{ MY.P = progress(await diarySessions()); }catch(e){} return MY.P; }
async function afterSave(id){
  const P = await refreshProg(); if (!P) return;
  const evs = P.events.filter(e=>e.sid===id);
  if (RT && TEAM.athlete){ RT.send({ type:'saved', ...me() }); if (evs.length) RT.send({ type:'ev', ...me(), events:evs }); }
  celebrate(evs);
}
function celebrate(evs){
  const q = [...evs].sort((a,b)=>(EV_W[b.k]||0)-(EV_W[a.k]||0)).slice(0,4); let i = 0;
  const next = ()=>{ if (i>=q.length) return hideBanner(); const t = evText(q[i++]); showBanner(t.big, [t.line,t.sub].filter(Boolean).join(' · ')); setTimeout(next, 3500); };
  if (q.length) setTimeout(next, 400);
}
HOOKS.status.push(()=>{
  let el = $('lSelf'); if (!el){ el = document.createElement('div'); el.id='lSelf'; el.className='selfRow'; $('lHrRow').after(el); }
  const n = MY.P && MY.P.normal, ks = LIVE.strokes.filter(k=>k.power && Date.now()-k.t < 30000);
  if (!n){ el.innerHTML = `<div class="hint">Save a few sessions and you get your own normal to beat.</div>`; return; }
  if (ks.length < 4){ el.innerHTML = `<div class="sv">–</div><div class="sl">vs your normal ${Math.round(n)} W<br><small>last 30 s</small></div>`; return; }
  const d = (mean(ks.map(k=>k.power))/n - 1)*100;
  el.innerHTML = `<div class="sv" style="color:${d>=0?'#16a34a':'#757575'}">${d>=0?'+':''}${Math.round(d)}%</div><div class="sl">vs your normal ${Math.round(n)} W<br><small>${d>=3?'You are on the big screen':'last 30 s'}</small></div>`;
});
function progressCard(P){
  const pbs = PB_DISTS.filter(d=>P.pbs[d]);
  return `<div class="xpc"><div class="pTop"><div><div class="pLv">Level ${P.level}</div><div class="pRank">${esc(rankOf(P.level))}</div></div><div style="text-align:right"><div class="pLv">${P.streak||0}</div><div class="pRank">week streak</div></div></div>
    <div class="pBar"><i style="width:${Math.round(P.lvFrac*100)}%"></i></div><div class="hint">${P.xp} XP · ${P.toNext} to level ${P.level+1}${P.normal?` · your normal ${Math.round(P.normal)} W`:''}</div>
    <div class="smallLbl" style="margin-top:14px">Personal bests</div>${pbs.length?`<div class="pbs">${pbs.map(d=>`<div><b>${fmtTime(P.pbs[d].time)}</b><small>${d} m · ${new Date(P.pbs[d].at).toLocaleDateString('en-GB',{day:'numeric',month:'short'})}</small></div>`).join('')}</div>`:'<p class="hint">Row 500, 1000, 2000, 5000, 6000 or 10 000 m and your best time lands here.</p>'}
    <div class="smallLbl" style="margin-top:14px">Badges · ${Object.keys(P.badges).length} of ${Object.keys(BADGES).length}</div><div class="badges">${Object.entries(BADGES).map(([k,b])=>`<div class="bdgw" title="${esc(b.d)}">${badgeSVG(k,!!P.badges[k],46)}${esc(b.t)}</div>`).join('')}</div></div>`;
}

// --- diary ---
const DIARY = { cache:null, full:{}, edit:null, adding:false };
const KINDS = { erg:'Erg', water:'On the water', run:'Run', bike:'Bike', strength:'Strength', other:'Other' };
async function diarySessions(){
  if (!TEAM.token) return S.sessions.map(s=>{ const st=unpack(s), su=summarize(st), last=st[st.length-1]; return { id:s.id, local:true, started_at:new Date(s.start).toISOString(), kind:'erg', distance:s.dist, duration:last?Math.round((last.t-s.start)/1000):null, avg_power:Math.round(su.power||0), avg_rate:su.rate, avg_hr:null, score:su.nC>=3?scoreOf(su):null, summary:{}, _local:s }; });
  if (!DIARY.cache) DIARY.cache = await API.mySessions(TEAM.token, false);
  return DIARY.cache;
}
function renderDiaryIfOpen(){ if (VIEW==='log') renderLog(); }
async function renderLog(){
  const lp = $('logPane');
  lp.innerHTML = '<h2>Training diary</h2><p class="hint">Loading…</p>';
  let ss; try{ ss = await diarySessions(); }catch(e){ lp.innerHTML = `<h2>Training diary</h2><p class="hint">Could not reach the server: ${esc(e.message)}</p>`; return; }
  const erg = ss.filter(s=>(s.kind||'erg')==='erg' && !(s.summary&&s.summary.demo));
  const p2 = pred2k(erg), lvl = levelOf(p2 && p2.time, S.profile.sex), wkg = p2 && S.profile.wgt ? p2.watts/S.profile.wgt : null;
  const since = Date.now() - 28*864e5, recent = ss.filter(s=>new Date(s.started_at).getTime()>=since);
  const zsec = {}; for (const s of recent){ const zs = s.summary && s.summary.zoneSec; if (zs && Object.keys(zs).length) for (const k in zs) zsec[k]=(zsec[k]||0)+zs[k]; else if (s.zone && s.duration) zsec[s.zone]=(zsec[s.zone]||0)+s.duration; }
  const zmax = Math.max(1, ...Object.values(zsec));
  const trend = erg.slice(0,20).reverse();
  MY.P = progress(ss);
  let h = `<h2>Training diary${TEAM.athlete?' · '+esc(TEAM.athlete.name):''}</h2>` + progressCard(MY.P);
  if (!TEAM.token) h += `<div class="note">Not logged in to a team: sessions are only stored on this phone. Join your team under <b>PM5</b> to keep them in your diary and share them with the coach.</div>`;
  h += `<div class="chips">
    <div class="chip"><div class="cv">${p2?fmtTime(p2.time):'–'}</div><div class="cl">predicted 2 km${p2?` · from ${p2.from.distance} m`:''}</div></div>
    <div class="chip"><div class="cv">${lvl||'–'}</div><div class="cl">level${wkg?` · ${fmt(wkg,2)} W/kg`:''}</div></div>
    <div class="chip"><div class="cv">${recent.length}</div><div class="cl">sessions, last 4 weeks</div></div>
    <div class="chip"><div class="cv">${Math.round(recent.reduce((a,s)=>a+(s.distance||0),0)/1000)} km</div><div class="cl">${Math.round(recent.reduce((a,s)=>a+(s.duration||0),0)/60)} min, last 4 weeks</div></div></div>`;
  h += `<div class="smallLbl" style="margin-top:16px">Minutes per zone · last 4 weeks</div><div class="bars">${[{k:'Rec',col:'#d6d6d6'},...ZONES].map(z=>`<div><span style="height:${(zsec[z.k]||0)/zmax*110}px;background:${z.col}"></span></div>`).join('')}</div><div class="barsL">${[{k:'Rec'},...ZONES].map(z=>`<div>${z.k}<br><b>${Math.round((zsec[z.k]||0)/60)}</b></div>`).join('')}</div>`;
  if (trend.length >= 2) h += `<div class="smallLbl" style="margin-top:16px">Average watts and technique score, last ${trend.length} erg sessions</div>${trendChart([{data:trend.map(s=>s.avg_power), col:IK, lbl:'W'}, {data:trend.map(s=>s.score), col:MG, lbl:'score', right:true}])}`;
  h += `<div class="btnRow"><button class="solid" id="dAdd">+ Add training</button></div><div id="dForm"></div><div style="margin-top:12px">`;
  h += ss.length ? ss.map(s=>{ const d=new Date(s.started_at); const pace = s.distance&&s.duration ? fmtPace(s.duration/(s.distance/500)) : null; const z = s.zone && ZONES.find(x=>x.k===s.zone);
    return `<div class="sess"><div class="sT">${d.toLocaleDateString('sv-SE')} ${d.toLocaleTimeString('sv-SE',{hour:'2-digit',minute:'2-digit'})} · ${KINDS[s.kind||'erg']}${z?` <span class="tag" style="background:${z.col};border-color:${z.col}">${z.k}</span>`:''}</div>
      <div class="sM">${[s.distance?s.distance+' m':'', s.duration?fmtTime(s.duration).replace(/\.\d$/,''):'', pace?pace+' /500 m':'', s.avg_power?s.avg_power+' W':'', s.avg_hr?s.avg_hr+' bpm':'', s.score!=null?'score '+s.score:'', s.rpe?'RPE '+s.rpe:''].filter(Boolean).join(' · ')}${s.notes?`<br>${esc(s.notes)}`:''}</div>
      <div class="btnRow">${(s.kind||'erg')==='erg'?`<button data-open="${s.id}">Analysis</button>`:''}${s.local?'':`<button data-edit="${s.id}">Edit</button>`}<button data-del="${s.id}">Delete</button></div>${DIARY.edit===s.id?editForm(s):''}</div>`; }).join('')
    : `<p class="hint">Nothing here yet. Row with the PM5 and tap <b>Stop &amp; save</b>, or add other training.</p>`;
  lp.innerHTML = h + '</div>';
  $('dAdd').onclick = ()=>{ DIARY.adding=!DIARY.adding; $('dForm').innerHTML = DIARY.adding ? editForm(null) : ''; bindForm(null); };
  lp.querySelectorAll('[data-open]').forEach(b=>b.onclick=async ()=>{ const s = ss.find(x=>x.id===b.dataset.open); if (s.local) { showView('tech'); return renderTech(s._local); }
    if (!DIARY.full[s.id]){ const all = await API.mySessions(TEAM.token, true); for (const x of all) DIARY.full[x.id]=x; }
    const f = DIARY.full[s.id]; showView('tech'); renderTech({ start:new Date(f.started_at).getTime(), strokes:f.strokes||[] }); });
  lp.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{ DIARY.edit = DIARY.edit===b.dataset.edit ? null : b.dataset.edit; renderLog(); });
  lp.querySelectorAll('[data-del]').forEach(b=>b.onclick=async ()=>{ if(!b.dataset.arm){ b.dataset.arm=1; b.textContent='Tap again'; return; } const s=ss.find(x=>x.id===b.dataset.del); if (s.local){ S.sessions=S.sessions.filter(x=>x.id!==s.id); save(); } else { await API.deleteSession(TEAM.token, s.id); DIARY.cache=null; } renderLog(); });
  if (DIARY.edit) bindForm(ss.find(x=>x.id===DIARY.edit));
}
function editForm(s){
  const v = s || { kind:'water', duration:3600 };
  const dt = s ? null : new Date(Date.now()-new Date().getTimezoneOffset()*6e4).toISOString().slice(0,16);
  return `<div class="panel" id="eForm" style="margin:10px 0">${s?'':`<div class="field"><div class="fl">When</div><input type="text" id="eWhen" value="${dt}" style="width:190px"></div>`}
    <div class="field"><div class="fl">Kind</div><select id="eKind">${Object.entries(KINDS).map(([k,l])=>`<option value="${k}" ${v.kind===k?'selected':''}>${l}</option>`).join('')}</select></div>
    ${s&&s.kind==='erg'?'':`<div class="field"><div class="fl">Duration</div><input type="number" id="eDur" value="${v.duration?Math.round(v.duration/60):''}"><div class="fu">min</div></div>
    <div class="field"><div class="fl">Distance</div><input type="number" id="eDist" value="${v.distance||''}"><div class="fu">m</div></div>
    <div class="field"><div class="fl">Average heart rate</div><input type="number" id="eHr" value="${v.avg_hr||''}"><div class="fu">bpm</div></div>`}
    <div class="field"><div class="fl">Zone<small>blank = from heart rate</small></div><select id="eZone"><option value="">auto</option>${ZONES.map(z=>`<option ${v.zone===z.k?'selected':''}>${z.k}</option>`).join('')}</select></div>
    <div class="field"><div class="fl">How hard? RPE<small>1 = very easy · 10 = max</small></div><input type="number" id="eRpe" min="1" max="10" value="${v.rpe||''}"></div>
    <div class="field" style="display:block"><div class="fl">Notes</div><textarea id="eNotes" style="min-height:70px;margin-top:6px">${esc(v.notes||'')}</textarea></div>
    <div class="btnRow"><button class="solid" id="eSave">Save</button></div></div>`;
}
function bindForm(s){
  const b = $('eSave'); if (!b) return;
  b.onclick = async ()=>{
    if (!TEAM.token){ toast('Join your team to use the diary'); return; }
    const g = id => $(id) ? $(id).value : undefined, num = id => g(id)!==undefined && g(id)!=='' ? +g(id) : undefined;
    const hr = num('eHr') ?? (s && s.avg_hr), z = g('eZone') || (zoneOf(profileHR(), hr)||{}).k || null;
    const o = { kind:g('eKind'), zone:z, rpe:num('eRpe')??null, notes:g('eNotes')||null };
    if ($('eDur')) Object.assign(o, { duration:num('eDur')!=null?num('eDur')*60:null, distance:num('eDist')??null, avg_hr:hr??null });
    if (s) o.id = s.id; else o.started_at = new Date(g('eWhen')).toISOString();
    try{ await API.saveSession(TEAM.token, o); DIARY.cache=null; DIARY.edit=null; DIARY.adding=false; toast('Saved'); renderLog(); }catch(e){ toast(e.message); }
  };
}
function trendChart(series, opt={}){
  const W=340, H=150, L=34, R=34, T=10, B=18, n = Math.max(...series.map(s=>s.data.length));
  const X = i => L + (n<=1?0:i/(n-1))*(W-L-R);
  let g = '';
  series.forEach((s,si)=>{ const vals = s.data.filter(v=>v!=null); if (!vals.length) return; let lo=Math.min(...vals), hi=Math.max(...vals); if (hi-lo<1){ hi+=1; lo-=1; } const pad=(hi-lo)*0.15; lo-=pad; hi+=pad;
    const Y = v => T + (1-(v-lo)/(hi-lo))*(H-T-B);
    const pts = s.data.map((v,i)=>v==null?null:[X(i),Y(v)]).filter(Boolean);
    g += `<path d="${pts.map((p,i)=>`${i?'L':'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('')}" fill="none" stroke="${s.col}" stroke-width="2.2"/>` + pts.map(p=>`<circle cx="${p[0]}" cy="${p[1]}" r="2.6" fill="${s.col}"/>`).join('');
    g += `<text x="${s.right?W-R+4:L-4}" y="${Y(hi-pad)+3}" font-size="9" fill="${s.col}" text-anchor="${s.right?'start':'end'}">${Math.round(hi-pad)}</text><text x="${s.right?W-R+4:L-4}" y="${Y(lo+pad)+3}" font-size="9" fill="${s.col}" text-anchor="${s.right?'start':'end'}">${Math.round(lo+pad)}</text><text x="${s.right?W-R+4:L-4}" y="${H-4}" font-size="9" fill="${s.col}" text-anchor="${s.right?'start':'end'}">${s.lbl}</text>`; });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" font-family="Chivo Mono,monospace">${g}</svg>`;
}

// --- start ---
applyLp(['sess','banner']);
fillProfile(); refreshProg();
if (URLTEAM && !TEAM.token){ TEAM.code = URLTEAM.toUpperCase(); API.roster(TEAM.code).then(r=>{ if (r && r.team){ TEAM.team=r.team.name; joinState={step:'roster',roster:r,pick:null,pin:''}; } renderTeam(); }).catch(()=>renderTeam()); }
else if (TEAM.token) { renderTeam(); afterLogin(); }
else { if (TEAM.code) API.roster(TEAM.code).then(r=>{ if (r&&r.team){ joinState={step:'roster',roster:r,pick:null,pin:''}; } renderTeam(); }).catch(()=>renderTeam()); renderTeam(); }
