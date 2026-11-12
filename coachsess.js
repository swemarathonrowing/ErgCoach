// ================= Coached workout: lobby → steps → awards (TV screen) =================
const WK = { plan:null, custom:[], s:null, nextCard:0, tick:[] };
try{ WK.custom = JSON.parse(localStorage.getItem('ergcoach.plans')||'[]'); }catch(e){}
const allPlans = ()=>PLANS.concat(WK.custom);
WK.plan = JSON.parse(JSON.stringify(allPlans()[0]));

// ---------- setup ----------
function renderWkSetup(){
  $('wkPlans').innerHTML = allPlans().map(p=>`<div class="panel ${WK.plan.id===p.id?'sel':''}" data-p="${p.id}"><b>${esc(p.name)}</b><p class="hint">${esc(p.d||'')}</p><p class="hint">${p.steps.length} steps · ${planLen(p)}</p></div>`).join('');
  $('wkPlans').querySelectorAll('[data-p]').forEach(el=>el.onclick=()=>{ WK.plan = JSON.parse(JSON.stringify(allPlans().find(p=>p.id===el.dataset.p))); renderWkSetup(); });
  $('wkPlanName').textContent = WK.plan.name;
  const P = WK.plan.steps;
  $('wkSteps').innerHTML = `<div class="stepRow lbl"><div></div><div>Step</div><div>Kind</div><div>Length</div><div>Focus</div><div>Rate</div><div>Power % normal</div><div></div></div>` + P.map((st,i)=>`<div class="stepRow" data-i="${i}">
    <div class="n">${i+1}</div><input data-k="n" value="${esc(st.n)}">
    <select data-k="type"><option value="time" ${st.type==='time'?'selected':''}>Time</option><option value="dist" ${st.type==='dist'?'selected':''}>Distance</option></select>
    <input data-k="v" value="${st.type==='time'?fmtTime(st.v).replace(/\.\d$/,''):st.v}" title="${st.type==='time'?'m:ss':'metres'}">
    <select data-k="focus">${Object.entries(FOCUS).map(([k,f])=>`<option value="${k}" ${st.focus===k?'selected':''}>${f.t}</option>`).join('')}</select>
    <input data-k="rate" value="${st.rate?st.rate.join('–'):''}" placeholder="20–22">
    <input data-k="pw" value="${st.pw?st.pw.join('–'):''}" placeholder="${st.focus==='power'?'100–110':'–'}">
    <button data-del style="min-height:34px;padding:2px 8px">✕</button></div>`).join('');
  const parseRange = v => { const m = String(v).match(/(\d+)\s*[–-]\s*(\d+)/) || String(v).match(/(\d+)/); return m ? [+m[1], +(m[2]||m[1])] : null; };
  $('wkSteps').querySelectorAll('.stepRow[data-i]').forEach(r=>{ const st = P[+r.dataset.i];
    r.querySelectorAll('[data-k]').forEach(inp=>inp.onchange=()=>{ const k=inp.dataset.k, v=inp.value;
      if (k==='v') st.v = st.type==='time' ? (v.includes(':') ? v.split(':').reduce((a,x)=>a*60+(+x),0) : +v*60) : +v;
      else if (k==='rate'||k==='pw') st[k] = parseRange(v); else st[k] = v;
      if (k==='type') st.v = v==='time' ? 120 : 250; WK.plan.id = WK.plan.id.startsWith('my-') ? WK.plan.id : WK.plan.id; renderWkSetup(); });
    r.querySelector('[data-del]').onclick = ()=>{ P.splice(+r.dataset.i,1); renderWkSetup(); }; });
}
const planLen = p => { const t = p.steps.filter(s=>s.type==='time').reduce((a,s)=>a+s.v,0), d = p.steps.filter(s=>s.type==='dist').reduce((a,s)=>a+s.v,0); return `${Math.round(t/60)} min${d?` + ${d} m`:''}`; };
$('wkAdd').onclick = ()=>{ WK.plan.steps.push({ n:'New step', type:'time', v:120, focus:'shape', rate:[20,22] }); renderWkSetup(); };
$('wkSave').onclick = ()=>{ const name = (prompt('Name of your plan', WK.plan.name) || '').trim(); if (!name) return; const p = { ...JSON.parse(JSON.stringify(WK.plan)), id:'my-'+Date.now(), name, d:'Your own plan' };
  WK.custom.push(p); localStorage.setItem('ergcoach.plans', JSON.stringify(WK.custom)); WK.plan = JSON.parse(JSON.stringify(p)); renderWkSetup(); toast('Saved'); };

// ---------- session state, broadcast ----------
$('wkOpen').onclick = ()=>{
  WK.s = { mode:$('wkMode').value, sid:Math.random().toString(36).slice(2,8), name:WK.plan.name, steps:JSON.parse(JSON.stringify(WK.plan.steps)), status:'lobby', idx:0, t0:0, auto:$('wkAuto').checked, players:{}, feed:[] };
  $('wkAuto2').checked = WK.s.auto; wkShow(); wkSend(); qrFor($('wkQr'));
};
function wkShow(){ const on = !!WK.s; $('wkSetup').classList.toggle('hidden', on); $('wkStage').classList.toggle('hidden', !on); $('wkBar').classList.toggle('hidden', !on || C.view!=='wk'); if (on) renderStage(true); else renderWkSetup(); }
function wkMsg(){ const s = WK.s; if (!s) return null;
  return { type:'wk', mode:s.mode, sid:s.sid, name:s.name, status:s.status, idx:s.idx, steps:s.steps, el: s.status==='run' ? (Date.now()-s.t0)/1000 : 0, auto:s.auto,
    players:Object.values(s.players).map(p=>({ id:p.id, name:p.name, av:p.av })), res:s.res||null }; }
function wkSend(){ const m = wkMsg(); if (m && C.rt) C.rt.send(m); }
setInterval(()=>{ if (WK.s) wkSend(); }, 2000);
// rowers join and report each judged stroke
function wkOnMsg(m){
  const s = WK.s; if (!s || m.sid!==s.sid) { if (m.type==='hi' && s) wkSend(); return; }
  if (m.type==='join'){ const fresh = !s.players[m.id]; s.players[m.id] = Object.assign(s.players[m.id] || { R:newRun(), g:null, gAt:0, d0:{} }, { id:m.id, name:m.name, av:m.av });
    if (fresh) feed(`${m.name} is in!`); wkSend(); renderStage(true); }
  if (m.type==='hit'){ const p = s.players[m.id]; if (!p) return; const was = p.R.combo;
    p.R = m.R; p.g = m.g; p.why = m.why; p.gAt = Date.now();
    const c = p.R.combo; if (c && c%25===0 && c!==was) feed(`${p.name} · ${c} combo!`); if (p.R.streakP===10) feed(`${p.name} · 10 PERFECT in a row!`); if (p.R.onBeat===20) feed(`${p.name} · locked on the rate`);
    renderStage(false); }
}
function feed(t){ const s = WK.s; s.feed.push({ t, at:Date.now() }); if (s.feed.length>6) s.feed.shift(); }
// ---------- controls ----------
function goStep(i){
  const s = WK.s; if (!s) return; if (i >= s.steps.length) return endWk(); i = Math.max(0, i);
  s.idx = i; s.t0 = Date.now(); s.status = 'run';
  for (const p of Object.values(s.players)) p.d0[i] = C.live[p.id] ? C.live[p.id].dist : 0;
  WK.nextCard = Date.now(); wkSend(); renderStage(true);
}
$('wkStart').onclick = ()=>{ if (WK.s.status==='lobby') goStep(0); };
$('wkNext').onclick = ()=>{ if (WK.s.status==='lobby') goStep(0); else if (WK.s.status==='run') goStep(WK.s.idx+1); };
$('wkPrev').onclick = ()=>{ if (WK.s.status==='run') goStep(WK.s.idx-1); };
$('wkAuto2').onchange = ()=>{ WK.s.auto = $('wkAuto2').checked; wkSend(); };
$('wkTv').onclick = ()=>{ document.body.classList.toggle('tv'); if (document.body.classList.contains('tv') && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(()=>{}); else if (document.fullscreenElement) document.exitFullscreen(); };
$('wkEnd').onclick = e=>{ const b=e.target; if (WK.s.status==='done'){ WK.s=null; document.body.classList.remove('tv'); wkShow(); return; } if (!b.dataset.arm){ b.dataset.arm=1; b.textContent='Sure? End'; setTimeout(()=>{ b.dataset.arm=''; b.textContent='End workout'; },3000); return; } endWk(); };
function endWk(){
  const s = WK.s; s.status = 'done'; s.res = {};
  // rowing style from today plus saved sessions, closest teammate by style, level and badges
  const feats = {};
  for (const a of C.athletes){ const P = progOf(a.id); feats[a.id] = { f:featuresOf(C.hist.filter(x=>x.athlete_id===a.id)), b:Object.keys(P.badges) }; }
  for (const p of Object.values(s.players)){
    const L = C.live[p.id], ks = L ? L.k.filter(k=>k.c) : [], su = ks.length>=5 ? summarize(ks.map(k=>({curve:k.c, power:k.p, rate:k.r, driveLen:k.dl, driveTime:k.dt, recTime:k.rt}))) : null;
    const live = su ? { pp:su.peakPos, pu:su.pickup, hump:su.humpShare, cv:su.cv, w:su.power, rate:su.rate } : null;
    const P = progOf(p.id), me = featuresOf(C.hist.filter(x=>x.athlete_id===p.id), live), badges = Object.keys(P.badges);
    const R = p.R, earned = []; if (R.n>=10) earned.push('finisher'); if (R.maxCombo>=25) earned.push('combo25'); if (R.maxCombo>=50) earned.push('combo50'); if (R.maxP>=10) earned.push('perfect10'); if (R.maxBeat>=20) earned.push('metronome'); if (R.acc>=0.9 && R.n>=30) earned.push('sharp');
    let twin = null; for (const id in feats){ if (id===p.id || !feats[id].f || !me) continue; const sim = likeness(me, feats[id].f, badges.concat(earned), feats[id].b); if (!twin || sim>twin.sim) twin = { id, name:nameOf(id), sim }; }
    const prev = C.hist.filter(x=>x.athlete_id===p.id && x.summary && x.summary.game && x.summary.game.acc!=null).slice(0,5).map(x=>x.summary.game.acc), usual = prev.length ? mean(prev) : null;
    s.res[p.id] = { style:styleOf(me), twin, earned, new:earned.filter(b=>!P.badges[b]), R, usual, imp: usual!=null && R.n ? (R.acc-usual)*100 : null, journey:journeyOf(p) };
  }
  wkSend(); renderStage(true);
}
// auto-advance
setInterval(()=>{ const s = WK.s; if (!s || s.status!=='run') return; const st = s.steps[s.idx], el = (Date.now()-s.t0)/1000;
  if (C.view==='wk') renderClock();
  if (!s.auto) return;
  if (st.type==='time' && el >= st.v) goStep(s.idx+1);
  if (st.type==='dist'){ const ps = Object.values(s.players).filter(p=>online(p.id)); if (ps.length && ps.every(p=>stepDist(p) >= st.v)) goStep(s.idx+1); }
}, 250);
const stepDist = p => C.live[p.id] ? Math.max(0, C.live[p.id].dist - (p.d0[WK.s.idx]||0)) : 0;

// ---------- the stage ----------
function ring(f, col){ const r=16, c=2*Math.PI*r; return `<svg viewBox="0 0 40 40" class="ring"><circle cx="20" cy="20" r="${r}" fill="#fffaf0" stroke="#1b130d" stroke-width="4"/><circle cx="20" cy="20" r="${r}" fill="none" stroke="${col}" stroke-width="5" stroke-dasharray="${c*clamp(f,0,1)} ${c}" transform="rotate(-90 20 20)"/><text x="20" y="24" text-anchor="middle" font-size="11" font-family="Ultra, Georgia, serif">${Math.round(f*100)}</text></svg>`; }
function renderClock(){ const s = WK.s, el = $('stClock'); if (!el || !s) return; const st = s.steps[s.idx], e = (Date.now()-s.t0)/1000;
  if (st.type==='time'){ const left = st.v - e; el.textContent = (left<0?'+':'') + fmtTime(Math.abs(left)).replace(/\.\d$/,''); }
  else { const ps = Object.values(s.players).filter(p=>online(p.id)), m = ps.length ? Math.min(...ps.map(stepDist)) : 0; el.textContent = `${Math.max(0, Math.round(st.v - m))} m`; }
  const f = $('stFill'); if (f) f.style.width = `${clamp(st.type==='time' ? e/st.v : (Object.values(s.players).length ? mean(Object.values(s.players).map(stepDist))/st.v : 0),0,1)*100}%`;
  const nc = $('nextCd'); if (nc){ const left = 4 - (Date.now()-WK.nextCard)/1000; if (left <= 0) nc.parentElement.parentElement.remove(); else nc.textContent = Math.ceil(left); }
}
function renderStage(full){
  const s = WK.s, el = $('wkStage'); if (!s || !el) return;
  $('wkStart').classList.toggle('hidden', s.status!=='lobby'); $('wkPrev').classList.toggle('hidden', s.status!=='run'); $('wkNext').classList.toggle('hidden', s.status==='done');
  $('wkEnd').textContent = s.status==='done' ? 'Close' : 'End workout';
  const al = Object.values(s.players).map(p=>({ p, r:riskOf(p.id) })).filter(x=>x.r.length && x.r[0].lvl===2);
  $('wkInfo').innerHTML = `${Object.keys(s.players).length} joined · ${esc(s.name)}${al.map(x=>` <span class="alert">⚠ ${esc(x.p.name)}: ${esc(x.r[0].t)}</span>`).join('')}`;
  const ps = Object.values(s.players);
  if (s.status==='lobby'){
    if (!full && $('lobGrid')) { $('lobGrid').innerHTML = lobTiles(ps); return; }
    el.innerHTML = `<div class="lobby"><div class="qrBox"><div class="stPlan">Scan to join</div><div id="wkQr"></div><div class="stPlan">or type the team code</div><div class="code">${esc(C.team.code)}</div></div>
      <div><div class="stPlan">${esc(s.name)} · ${s.steps.length} steps · ${planLen(s)}</div><div class="stName">Grab an erg, pick your face</div>
      <div class="stTarget" style="margin:1vw 0 2vw">Scan, tap your name, connect the PM5, then tap <span class="fc">I'm in</span></div><div class="stGrid" id="lobGrid" style="padding:0">${lobTiles(ps)}</div></div></div>`;
    qrFor($('wkQr')); return;
  }
  if (s.status==='done'){
    el.innerHTML = `<div class="stHead"><div><div class="stPlan">${esc(s.name)} · done</div><div class="stName">Awards</div><div class="stTarget">${s.mode==='compete' ? 'Competition mode: ranked by points' : 'Progress mode: everyone against their own usual'}</div></div></div>
      <div class="stGrid" style="margin-top:2vw">${ordered(ps).map((p,rank)=>{ const r = s.res[p.id]||{}, R = p.R; const sty = r.style ? STYLES[r.style] : null;
        return `<div class="pt">${R.n?`<div class="mult" style="width:auto;padding:0 .6vw;border-radius:2vw">${Math.round((R.acc||0)*100)}%</div>`:''}${avatarSVG(p.av,120)}<div class="nm">${esc(p.name)}</div>
          ${s.mode==='compete' ? `<div class="imp">#${rank+1} · ${R.score} pts</div>` : `<div class="imp">${r.imp==null ? 'First coached workout: this is your baseline' : (r.imp>=0?'+':'')+Math.round(r.imp)+' accuracy vs your usual'}</div>`}
          <div class="cb">${R.n} strokes · best combo ${R.maxCombo}</div>
          ${sty?`<div class="sty"><b>${esc(sty.t)}</b></div>`:''}${r.twin?`<div class="sty">Rows most like <b>${esc(r.twin.name)}</b> · ${r.twin.sim}%</div>`:''}
          <div class="bdgs">${(r.earned||[]).map(b=>badgeSVG(b,true)).join('') || '<span class="hint">Next time!</span>'}</div></div>`; }).join('')}</div>`;
    return;
  }
  // running
  const st = s.steps[s.idx], f = FOCUS[st.focus];
  if (full || !$('stGrid')){
    el.innerHTML = `<div class="stHead"><div><div class="stPlan">${esc(s.name)} · step ${s.idx+1} of ${s.steps.length}${s.auto?'':' · coach moves on'}</div><div class="stName">${esc(st.n)}</div>
      <div class="stTarget"><span class="fc">${f.t}</span>${esc(stepTarget(st))} · ${stepLen(st)} · ${esc(f.d)}</div></div><div class="stClock" id="stClock"></div></div>
      <div class="stStrip">${s.steps.map((x,i)=>`<div class="${x.focus==='easy'?'easy':''} ${i<s.idx?'done':''}" style="flex:${x.type==='time'?Math.max(1,x.v/60):Math.max(1,x.v/250)}">${i===s.idx?'<i id="stFill"></i>':''}</div>`).join('')}</div>
      <div class="stGrid" id="stGrid"></div>${s.mode==='compete' ? '' : '<canvas id="tunnel"></canvas>'}<div class="ticker" id="stTick"></div>
      ${Date.now()-WK.nextCard < 4000 ? `<div class="nextCard"><div><div class="k">${s.idx ? 'Next up' : 'Here we go'}</div><div class="n">${esc(st.n)}</div><div class="k">${f.t} · ${esc(stepTarget(st))} · ${stepLen(st)}</div><div class="c" id="nextCd">4</div></div></div>` : ''}`;
  }
  $('stGrid').innerHTML = ordered(ps).map(p=>{ const R = p.R, fresh = Date.now()-p.gAt < 1500, on = online(p.id), z = hrInfo(p.id).z;
    const gr = st.focus==='easy' ? (z ? `<span style="color:${z.col}">${z.k}</span>` : '') : (p.g!=null && Date.now()-p.gAt < 6000 ? `<span style="color:${GCOL[p.g]}">${GRADES[p.g]}</span>` : '');
    return `<div class="pt ${on?'':'off'}" style="animation:none">${R.mult>1?`<div class="mult">×${R.mult}</div>`:''}${R.n?ring(R.acc||0, GCOL[3]):''}${avatarSVG(p.av,120)}<div class="nm">${esc(p.name)}</div>
      <div class="gr ${fresh?'hit':''}">${gr}</div><div class="cb">${st.type==='dist' ? `${Math.round(stepDist(p))} / ${st.v} m · ` : ''}${R.combo ? `${R.combo} combo` : st.focus==='easy' ? 'easy' : '&nbsp;'}</div>
      ${ptStats(p.id)}${riskBadge(p.id)}</div>`; }).join('') || '<p class="hint" style="font-size:1.4vw">Nobody has joined yet.</p>';
  const tk = s.feed.filter(x=>Date.now()-x.at < 20000).slice(-4);
  $('stTick').innerHTML = tk.map(x=>`<span>★ ${esc(x.t)}</span>`).join('');
  renderClock();
}
// split, rate, heart rate and the last curve on every rower card
function ptStats(id){ const L = C.live[id], st = L ? L.st : {}, h = hrInfo(id);
  return `<div class="pst"><div><b>${st.pace?fmtPace(st.pace):'–:––'}</b><i>/500</i></div><div><b>${st.rate||'–'}</b><i>spm</i></div><div><b style="color:${h.z?shadeC(h.z.col,-0.25):'inherit'}">${h.hr||'–'}</b><i>${h.z?h.z.k:'bpm'}</i></div></div>${miniCurve(lastCurve(id,1), colOf(id))}`; }
const lobTiles = ps => ps.map(p=>`<div class="pt">${avatarSVG(p.av,120)}<div class="nm">${esc(p.name)}</div><div class="cb">${online(p.id)?'ready':'…'}</div></div>`).join('') || '<p class="hint" style="font-size:max(14px,1.2vw)">Waiting for the first rower…</p>';
function qrFor(el){ if (!el) return; el.innerHTML = qrSVG(new URL('index.html?team='+C.team.code, location.href).href); }
setInterval(()=>{ if (C.view==='wk' && WK.s && WK.s.status==='run') renderStage(false); if (C.view==='wk' && WK.s && WK.s.status==='lobby') renderStage(false); }, 1000);

// ---------- the progress tunnel: one long path through the whole plan ----------
// Journey = judged quality over time. Everyone moves forward while they row; clean strokes move you further, raw power does not.
function planStrokes(s){ return s.steps.reduce((a,st)=>a + (st.type==='time' ? st.v : st.v/4.5) * ((st.rate ? (st.rate[0]+st.rate[1])/2 : 20)/60), 0); }
function planFrac(s){ const wt = st => st.type==='time' ? st.v : st.v/4.5, tot = s.steps.reduce((a,st)=>a+wt(st),0); let done = s.steps.slice(0,s.idx).reduce((a,st)=>a+wt(st),0);
  if (s.status==='done') return 1; const st = s.steps[s.idx]; if (s.status==='run') done += wt(st)*clamp(st.type==='time' ? (Date.now()-s.t0)/1000/st.v : 0.5, 0, 1); return done/tot; }
// the group moves through the plan together; your own quality (vs the targets) decides how close to the front you are
function journeyOf(p){ const s = WK.s, R = p.R; if (!s) return 0; const q = R.n ? (R.hits[1]*0.4 + R.hits[2]*0.7 + R.hits[3]) / R.n : 0.5; return clamp(planFrac(s) * (0.8 + 0.2*q), 0, 1); }
function ordered(ps){ return WK.s && WK.s.mode==='compete' ? [...ps].sort((a,b)=>b.R.score-a.R.score) : ps; }
const AVIMG = {};
function avImg(p){ const k = p.id+JSON.stringify(p.av); if (!AVIMG[k]){ const im = new Image(); im.src = 'data:image/svg+xml,'+encodeURIComponent(avatarSVG(p.av,200).replace('<svg ','<svg xmlns="http://www.w3.org/2000/svg" ')); AVIMG[k] = im; } return AVIMG[k]; }
function drawTunnel(now){
  const cv = $('tunnel'); if (!cv || !WK.s || WK.s.status!=='run'){ WK.tRaf = 0; return; } WK.tRaf = requestAnimationFrame(drawTunnel);
  const s = WK.s, dpr = devicePixelRatio||1, W = cv.clientWidth, H = Math.max(260, Math.round(window.innerHeight*0.42));
  if (cv.width !== Math.round(W*dpr) || cv.height !== Math.round(H*dpr)){ cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr); cv.style.height = H+'px'; }
  const g = cv.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0);
  lpSky(g, W, H); lpSun(g, W*0.5, H*0.3, 26);
  lpMountains(g, W, H*0.42, H*0.22, LP.hills[0], 5, 0, 7, 0.05); lpMountains(g, W, H*0.48, H*0.18, LP.hills[1], 9, W*0.3, 8, 0.06);
  g.fillStyle = LP.hills[2]; g.fillRect(0, H*0.48, W, H);
  // the path: from the viewer (t=0, bottom) to the horizon (t=1), winding like a valley road
  const hz = H*0.44, P = t => { const d = Math.pow(1-t, 1.7); return { x: W*0.5 + Math.sin(t*Math.PI*2.4)*W*0.28*(1-t*0.75), y: hz + d*(H-hz), w: 14 + d*W*0.34 }; };
  // faceted banks on both sides, a pastel river in the middle
  for (let i=0;i<60;i++){ const t0 = i/60, t1 = (i+1)/60, a = P(t0), b = P(t1), sh = (i%2 ? 0.04 : -0.04);
    g.fillStyle = shadeC(i%3 ? LP.hills[3] : LP.hills[2], sh); g.beginPath(); g.moveTo(0,a.y); g.lineTo(a.x-a.w/2-a.w*0.08,a.y); g.lineTo(b.x-b.w/2-b.w*0.08,b.y); g.lineTo(0,b.y); g.closePath(); g.fill();
    g.fillStyle = shadeC(i%3 ? LP.hills[2] : LP.hills[3], -sh); g.beginPath(); g.moveTo(W,a.y); g.lineTo(a.x+a.w/2+a.w*0.08,a.y); g.lineTo(b.x+b.w/2+b.w*0.08,b.y); g.lineTo(W,b.y); g.closePath(); g.fill();
    g.fillStyle = '#fbe9d6'; g.beginPath(); g.moveTo(a.x-a.w/2-a.w*0.08,a.y); g.lineTo(a.x-a.w/2,a.y); g.lineTo(b.x-b.w/2,b.y); g.lineTo(b.x-b.w/2-b.w*0.08,b.y); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(a.x+a.w/2+a.w*0.08,a.y); g.lineTo(a.x+a.w/2,a.y); g.lineTo(b.x+b.w/2,b.y); g.lineTo(b.x+b.w/2+b.w*0.08,b.y); g.closePath(); g.fill();
    const wc = shadeC(LP.water[i%2], ((i*7)%5-2)*0.02); g.fillStyle = wc; g.beginPath(); g.moveTo(a.x-a.w/2,a.y); g.lineTo(a.x+a.w/2,a.y); g.lineTo(b.x+b.w/2,b.y); g.lineTo(b.x-b.w/2,b.y); g.closePath(); g.fill(); }
  // shimmer drifting toward the viewer
  for (let k=0;k<14;k++){ const t = ((k/14) - now/40000) % 1, tt = t<0 ? t+1 : t, q = P(tt), off = ((k*37)%10-5)/10*q.w*0.7; g.fillStyle = 'rgba(255,248,239,.55)'; g.fillRect(q.x+off, q.y, Math.max(2,q.w*0.05), Math.max(1,q.w*0.006)); }
  // pines on the banks
  for (let k=0;k<16;k++){ const t = 0.1 + k/16*0.85, q = P(t), side = k%2 ? 1 : -1, h = 10 + (1-t)*60; lpPine(g, q.x + side*(q.w*0.75 + 20 + (k%3)*q.w*0.2), q.y, h, LP.hills[5]); }
  // camera follows the pack: show a window of the journey just behind the leaders
  const lead = Math.max(0, ...Object.values(s.players).map(p=>(WK.jm||{})[p.id] ?? journeyOf(p)));
  const cam = clamp(lead - 0.1, 0, 0.62), V = t => (t - cam) / 0.38;
  // step gates along the path, sized by each step's share of the plan
  const tot = s.steps.reduce((a,st)=>a+(st.type==='time'?st.v:st.v/4.5),0); let acc = 0;
  s.steps.forEach((st,i)=>{ acc += (st.type==='time'?st.v:st.v/4.5)/tot; if (i===s.steps.length-1) return; const vt = V(acc); if (vt<0.02 || vt>0.98) return; const q = P(vt), h = q.w*0.5 + 6, col = i < s.idx ? LP.teal : i===s.idx ? LP.gold : 'rgba(255,246,236,.7)';
    g.fillStyle = col; g.fillRect(q.x-q.w/2-3, q.y-h, 4+q.w*0.03, h); g.fillRect(q.x+q.w/2-1, q.y-h, 4+q.w*0.03, h); g.fillRect(q.x-q.w/2-3, q.y-h, q.w+6, 3+q.w*0.03);
    if (q.w > 60){ g.font = `700 ${Math.max(9, q.w*0.07)}px 'Josefin Sans', sans-serif`; g.textAlign='center'; g.fillStyle = col; g.fillText(s.steps[i+1].n.toUpperCase(), q.x, q.y-h-6); } });
  // finish arch at the horizon
  const f = P(clamp(V(1),0,0.98)); g.fillStyle = LP.gold; g.beginPath(); for (let k=0;k<6;k++){ const a=-Math.PI/2+k/6*Math.PI*2; g.lineTo(f.x+Math.cos(a)*12, f.y-20+Math.sin(a)*12); } g.closePath(); g.fill();
  // rowers: far ones first so near ones overlap them
  const ps = Object.values(s.players).map((p,i)=>({ p, i, j:journeyOf(p) }));
  for (const x of ps){ const m = WK.jm || (WK.jm = {}); m[x.p.id] = (m[x.p.id] ?? x.j) + (x.j - (m[x.p.id] ?? x.j))*0.05; x.t = clamp(V(m[x.p.id]), 0, 0.98); }
  ps.sort((a,b)=>b.t-a.t).forEach(x=>{ const q = P(x.t), lane = ((x.i % 6) - 2.5) / 5.5, sz = 26 + (1-x.t)*70, bob = Math.sin(now/300 + x.i)*2*(1-x.t);
    const ax = q.x + lane*q.w*0.85, ay = q.y - sz*0.55 + bob, im = avImg(x.p);
    // a shell seen from behind, oars sweeping at the rower's rate
    const bw = sz*0.22, bl = sz*0.5, col = GFX.PAL[x.i % GFX.PAL.length], rate = (C.live[x.p.id] && C.live[x.p.id].st.rate) || 20, ph = (now/1000*rate/60 + x.i*0.3) % 1, sw = Math.sin(ph*Math.PI*2);
    g.strokeStyle = LP.ink; g.lineWidth = Math.max(1, sz*0.03); for (const sd of [-1,1]){ g.beginPath(); g.moveTo(ax+sd*bw*0.5, q.y-bl*0.05); g.lineTo(ax+sd*sz*0.75, q.y + sw*sz*0.12); g.stroke(); g.fillStyle = col; g.fillRect(ax+sd*sz*0.75-sz*0.05, q.y + sw*sz*0.12 - sz*0.03, sz*0.1, sz*0.06); }
    g.fillStyle = 'rgba(255,248,239,.5)'; g.beginPath(); g.moveTo(ax-bw, q.y+bl*0.25); g.lineTo(ax+bw, q.y+bl*0.25); g.lineTo(ax+bw*0.3, q.y+bl*0.9); g.lineTo(ax-bw*0.3, q.y+bl*0.9); g.closePath(); g.fill();
    g.fillStyle = shadeC(col,-0.12); g.beginPath(); g.moveTo(ax, q.y-bl*0.35); g.lineTo(ax+bw, q.y); g.lineTo(ax+bw*0.6, q.y+bl*0.25); g.lineTo(ax-bw*0.6, q.y+bl*0.25); g.lineTo(ax-bw, q.y); g.closePath(); g.fill();
    g.fillStyle = shadeC(col,0.15); g.beginPath(); g.moveTo(ax, q.y-bl*0.35); g.lineTo(ax-bw, q.y); g.lineTo(ax, q.y+bl*0.1); g.closePath(); g.fill();
    if (im.complete) g.drawImage(im, ax-sz/2, ay-sz/2, sz, sz);
    if (sz > 34){ g.font = `700 ${Math.round(sz*0.2)}px 'Josefin Sans', sans-serif`; g.textAlign = 'center'; g.fillStyle = LP.ink; g.fillStyle = 'rgba(59,53,96,.7)'; const tw = g.measureText(x.p.name).width + 12; g.fillRect(ax-tw/2, ay-sz*0.78, tw, sz*0.24); g.fillStyle = LP.cream; g.fillText(x.p.name, ax, ay - sz*0.6); } });
  g.font = `400 ${Math.max(12, W*0.009)}px 'Josefin Sans', sans-serif`; g.textAlign = 'left'; g.fillStyle = 'rgba(255,246,236,.85)';
  g.fillStyle = LP.ink; g.fillText('THE JOURNEY · clean strokes move you forward, power alone does not', 18, 24);
}
setInterval(()=>{ if (C.view==='wk' && WK.s && WK.s.status==='run' && WK.s.mode!=='compete' && $('tunnel') && !WK.tRaf) WK.tRaf = requestAnimationFrame(drawTunnel); }, 500);
