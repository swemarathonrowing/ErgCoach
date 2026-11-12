// ================= Phone: join the coach's workout, play it in landscape =================
const WKA = { m:null, recv:0, joined:false, R:newRun(), last:[], fx:[], anchor:null, idx:-1, card:0, done:false, saved:false, av:null, raf:0 };
try{ WKA.av = JSON.parse(localStorage.getItem('ergcoach.avatar')||'null'); }catch(e){}
const myAv = ()=> WKA.av || (WKA.av = avDefault(TEAM.athlete ? TEAM.athlete.id : 'me'));
function athWk(m){
  const first = !WKA.m || WKA.m.sid!==m.sid;
  if (first){ Object.assign(WKA, { joined:false, R:newRun(), last:[], fx:[], anchor:null, idx:-1, done:false, saved:false, dismissed:false }); }
  WKA.m = m; WKA.recv = Date.now();
  if (WKA.dismissed) return;
  if (m.status==='run' && m.idx!==WKA.idx){ WKA.idx = m.idx; WKA.anchor = null; WKA.card = Date.now(); if (navigator.vibrate) navigator.vibrate([60,40,60]); }
  if (m.status==='done' && !WKA.done){ WKA.done = true; finishWk(); }
  $('sess').classList.remove('hidden'); document.body.classList.add('inSess');
  const sig = m.status+'|'+m.players.map(p=>p.id+JSON.stringify(p.av)).join(',');
  if (m.status==='lobby' || !WKA.joined){ if (sig!==WKA.sig || !$('wkIn')) renderLobby(); } else if (m.status==='run') startPlay();
  WKA.sig = sig;
}
const curStep = ()=> WKA.m && WKA.m.status==='run' ? WKA.m.steps[WKA.m.idx] : null;
const stepEl = ()=> WKA.m ? WKA.m.el + (Date.now()-WKA.recv)/1000 : 0;

// ---------- lobby: pick a face, connect, I'm in ----------
function renderLobby(){
  stopPlay(); const m = WKA.m, av = myAv();
  const pick = (k, n, f) => `<div class="pk">${Array.from({length:n},(_,i)=>`<button data-k="${k}" data-v="${i}" class="${av[k]===i?'on':''}">${f(i)}</button>`).join('')}</div>`;
  const others = m.players.filter(p=>!TEAM.athlete || p.id!==TEAM.athlete.id);
  $('sessIn').innerHTML = `<div class="lob"><div class="lobL">${avatarSVG(av,150)}<div class="lobName">${esc(TEAM.athlete?TEAM.athlete.name:'')}</div>
      <button class="big ${WKA.joined?'':'go'}" id="wkIn">${WKA.joined ? (m.status==='run' ? 'Back in' : 'You are in ✓') : "I'm in"}</button>
      <div class="lobPm">${PM.connected ? 'PM5 connected' : DEMO.on ? 'Demo rowing' : '<button id="wkPm">Connect PM5</button> <button id="wkDemo">Demo</button>'}</div></div>
    <div class="lobR"><div class="lobT">${esc(m.name)}</div><div class="lobS">${m.steps.length} steps · ${m.status==='run' ? 'running now, jump in' : 'waiting for the coach to start'}</div>
      <div class="lbl2">Cap</div>${pick('c',10,i=>`<i style="background:${AV_CAPS2[i]}"></i>`)}
      <div class="lbl2">Skin</div>${pick('s',5,i=>`<i style="background:${AV_SKIN2[i]}"></i>`)}
      <div class="lbl2">Face</div>${pick('f',5,i=>AV_FACE[i])}
      <div class="lbl2">Extra</div>${pick('a',6,i=>AV_ACC[i])}
      <div class="lbl2">In the room · ${m.players.length}</div><div class="crew">${others.map(p=>`<span>${avatarSVG(p.av,44)}<small>${esc(p.name)}</small></span>`).join('') || '<small>nobody else yet</small>'}</div></div></div>`;
  $('sessIn').querySelectorAll('[data-k]').forEach(b=>b.onclick=()=>{ av[b.dataset.k] = +b.dataset.v; localStorage.setItem('ergcoach.avatar', JSON.stringify(av)); if (WKA.joined) sendJoin(); renderLobby(); });
  $('wkIn').onclick = ()=>{ WKA.joined = true; sendJoin(); goLandscape(); if (m.status==='run') startPlay(); else renderLobby(); };
  if ($('wkPm')) $('wkPm').onclick = ()=>$('btnConnect').click();
  if ($('wkDemo')) $('wkDemo').onclick = ()=>{ if (!DEMO.on) $('btnDemo').click(); renderLobby(); };
}
function sendJoin(){ if (RT && TEAM.athlete && WKA.m) RT.send({ type:'join', sid:WKA.m.sid, ...me(), av:myAv() }); }
async function wakeLock(){ try{ if ('wakeLock' in navigator && !WKA.wl) { WKA.wl = await navigator.wakeLock.request('screen'); WKA.wl.addEventListener('release', ()=>WKA.wl=null); } }catch(e){} }
document.addEventListener('visibilitychange', ()=>{ if (document.visibilityState==='visible' && WKA.joined) wakeLock(); });
function goLandscape(){ wakeLock(); const d = document.documentElement; if (d.requestFullscreen && !document.fullscreenElement) d.requestFullscreen().then(()=>screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(()=>{})).catch(()=>{}); }
$('sessX').onclick = ()=>{ WKA.dismissed = true; stopPlay(); $('sess').classList.add('hidden'); document.body.classList.remove('inSess'); if (document.fullscreenElement) document.exitFullscreen(); };

// ---------- judging every stroke ----------
HOOKS.stroke.push(s=>{
  const st = curStep(); if (!st || !WKA.joined || WKA.done) return;
  if (!WKA.anchor) WKA.anchor = s.t;
  const normal = (MY.P && MY.P.normal) || WKA.selfNormal || (WKA.selfNormal = null);
  if (!normal && s.power){ WKA.early = (WKA.early||[]).concat(s.power); if (WKA.early.length>=8) WKA.selfNormal = median(WKA.early); }
  const j = judge(s, st, normal);
  WKA.last.push({ c:s.curve, g:j ? j.g : null, at:performance.now() }); if (WKA.last.length>4) WKA.last.shift();
  if (!j) return;
  scoreStroke(WKA.R, j);
  WKA.fx.push({ g:j.g, why:j.why, at:performance.now(), combo:WKA.R.combo, mult:WKA.R.mult });
  if (j.g===3 && navigator.vibrate) navigator.vibrate(25);
  if (RT && TEAM.athlete) RT.send({ type:'hit', sid:WKA.m.sid, ...me(), g:j.g, why:j.why, R:{...WKA.R, hits:[...WKA.R.hits]} });
});

// ---------- the game screen (landscape canvas) ----------
const INKc = LP.ink, CRM = LP.cream, LPF = "'Josefin Sans', sans-serif";
function startPlay(){
  if (!$('wkCv')){ $('sessIn').innerHTML = `<canvas id="wkCv"></canvas><div class="turn">Turn your phone sideways ⟲</div>`; }
  if (!WKA.raf) WKA.raf = requestAnimationFrame(drawPlay);
}
function stopPlay(){ cancelAnimationFrame(WKA.raf); WKA.raf = 0; }
function tx(g, s, x, y, size, fill, align='center', bold=true){ g.font = `${bold?700:400} ${size}px ${LPF}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = fill; g.fillText(s,x,y+size*0.06); }
function box(g,x,y,w,h,fill,r=4){ g.save(); g.shadowColor='rgba(59,53,96,.35)'; g.shadowBlur=18; g.shadowOffsetY=6; g.beginPath(); g.roundRect(x,y,w,h,Math.min(r,4)); g.fillStyle=fill; g.fill(); g.restore(); }
function drawPlay(now){
  WKA.raf = 0; const cv = $('wkCv'); if (!cv || $('sess').classList.contains('hidden')) return; WKA.raf = requestAnimationFrame(drawPlay);
  const dpr = devicePixelRatio||1, W = cv.clientWidth, H = cv.clientHeight; if (cv.width!==Math.round(W*dpr)){ cv.width = Math.round(W*dpr); cv.height = Math.round(H*dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr,0,0,dpr,0,0);
  const m = WKA.m, st = curStep(); if (!st) return;
  lpSky(g, W, H); lpSun(g, W*0.62, H*0.52, 22); lpMountains(g, W, H*0.72, H*0.32, LP.hills[1], 21, 0, 6, 0.06); lpMountains(g, W, H*0.86, H*0.26, LP.hills[3], 33, 0, 8, 0.08); g.fillStyle = LP.hills[5]; g.fillRect(0, H*0.86, W, H);
  const P = 10, top = 34, laneW = Math.round(W*0.2), cx0 = laneW + 2*P, cw = Math.round(W*0.5), hx = cx0 + cw + P, hw = W - hx - P;
  // step strip
  const tot = m.steps.reduce((a,x)=>a+(x.type==='time'?Math.max(1,x.v/60):Math.max(1,x.v/250)),0); let sx = P;
  m.steps.forEach((x,i)=>{ const w = (W-2*P)*(x.type==='time'?Math.max(1,x.v/60):Math.max(1,x.v/250))/tot - 3; g.fillStyle = i<m.idx ? LP.teal : x.focus==='easy' ? 'rgba(255,246,236,.18)' : 'rgba(255,246,236,.4)'; g.beginPath(); g.moveTo(sx,8); g.lineTo(sx+w,8); g.lineTo(sx+w-4,20); g.lineTo(sx,20); g.closePath(); g.fill();
    if (i===m.idx){ const f = x.type==='time' ? clamp(stepEl()/x.v,0,1) : clamp(((LIVE.dist||0)-(WKA.d0??(WKA.d0=LIVE.dist||0)))/x.v,0,1); g.fillStyle=LP.gold; g.fillRect(sx,8,(w-4)*f,12); } sx += w+3; });
  if (WKA.dIdx!==m.idx){ WKA.dIdx = m.idx; WKA.d0 = LIVE.dist||0; }
  // ---- note highway ----
  box(g, P, top, laneW, H-top-P, st.focus==='easy' ? 'rgba(59,53,96,.35)' : 'rgba(59,53,96,.78)');
  const tr = st.rate ? (st.rate[0]+st.rate[1])/2 : 20, per = 60/tr, hitY = H - P - 46, speed = (hitY-top)/(per*2.6);
  g.save(); g.beginPath(); g.roundRect(P+3, top+3, laneW-6, H-top-P-6, 13); g.clip();
  for (let y = top + ((now/1000*speed*0.6) % 30); y < H; y += 30){ g.strokeStyle='rgba(248,238,213,.08)'; g.lineWidth=2; g.beginPath(); g.moveTo(P+laneW*0.2,y); g.lineTo(P+laneW*0.8,y); g.stroke(); }
  if (st.focus!=='easy'){
    const nowT = Date.now(), anc = WKA.anchor || (WKA.recv - m.el*1000);
    for (let k = Math.floor((nowT-anc)/1000/per) - 1; k < Math.floor((nowT-anc)/1000/per) + 4; k++){
      const tt = anc/1000 + k*per, y = hitY - (tt - nowT/1000)*speed; if (y < top-20 || y > H) continue;
      const nx = P+laneW/2, nw = laneW*0.3; g.fillStyle = LP.gold; g.beginPath(); g.moveTo(nx-nw,y); g.lineTo(nx,y-12); g.lineTo(nx+nw,y); g.lineTo(nx,y+12); g.closePath(); g.fill(); g.fillStyle = shadeC(LP.gold,-0.2); g.beginPath(); g.moveTo(nx,y-12); g.lineTo(nx+nw,y); g.lineTo(nx,y+12); g.closePath(); g.fill(); }
  }
  g.restore();
  g.lineWidth = 3; g.strokeStyle = CRM; g.beginPath(); g.moveTo(P+8, hitY); g.lineTo(P+laneW-8, hitY); g.stroke();
  tx(g, st.focus==='easy' ? 'EASY' : `${st.rate[0]===st.rate[1]?st.rate[0]:st.rate[0]+'–'+st.rate[1]}`, P+laneW/2, H-P-20, 18, CRM);
  tx(g, st.focus==='easy' ? '' : 'SPM', P+laneW/2, H-P-6, 9, 'rgba(255,246,236,.6)', 'center', false);
  const lastFx = WKA.fx[WKA.fx.length-1], fxAge = lastFx ? (performance.now()-lastFx.at)/1000 : 9;
  if (fxAge < 0.5){ g.save(); g.globalAlpha = 1-fxAge*2; g.fillStyle = GCOL[lastFx.g]; for (let i=0;i<8;i++){ const a=i/8*Math.PI*2, r=20+fxAge*90; g.beginPath(); g.arc(P+laneW/2+Math.cos(a)*r, hitY+Math.sin(a)*r*0.5, 6, 0, 7); g.fill(); } g.restore(); }
  // live rate under the lane
  if (LIVE.rate && st.focus!=='easy'){ tx(g, String(LIVE.rate), P+laneW/2, top+24, 22, LIVE.rate>=st.rate[0]-0.5 && LIVE.rate<=st.rate[1]+0.5 ? LP.teal : LP.gold); tx(g, 'YOU', P+laneW/2, top+44, 9, 'rgba(255,246,236,.6)','center',false); }
  // ---- curve stage ----
  box(g, cx0, top, cw, H-top-P, 'rgba(255,246,236,.94)');
  const gx = cx0+18, gy = top+46, gw = cw-36, gh = H-top-P-70;
  if (st.focus==='easy'){
    tx(g, 'Easy rowing', cx0+cw/2, top+gh/2, 34, LP.teal);
    const z = zoneOf(profileHR(), LIVE.hr); tx(g, LIVE.hr ? `${LIVE.hr} bpm${z?' · '+z.k:''}` : 'breathe, row light', cx0+cw/2, top+gh/2+40, 16, INKc, 'center', false);
    const nx = m.steps[m.idx+1]; if (nx) tx(g, `Next: ${nx.n} · ${FOCUS[nx.focus].t}`, cx0+cw/2, top+gh/2+70, 13, '#6b5a45', 'center', false);
  } else {
    tx(g, FOCUS[st.focus].t.toUpperCase()+' · '+FOCUS[st.focus].d, cx0+cw/2, top+20, 11, INKc, 'center', false);
    const X = i => gx + i/(IDEAL.length-1)*gw, Y = v => gy + gh - v*gh*0.92;
    // target band
    g.beginPath(); IDEAL.forEach((v,i)=>{ i?g.lineTo(X(i),Y(v*1.08)):g.moveTo(X(i),Y(v*1.08)); }); for (let i=IDEAL.length-1;i>=0;i--) g.lineTo(X(i),Y(IDEAL[i]*0.86)); g.closePath();
    g.fillStyle = 'rgba(255,181,71,.32)'; g.fill(); g.lineWidth=1.5; g.strokeStyle='rgba(224,122,85,.6)'; g.stroke();
    g.lineWidth=2; g.strokeStyle=INKc; g.beginPath(); g.moveTo(gx,gy+gh); g.lineTo(gx+gw,gy+gh); g.stroke();
    WKA.last.forEach((L,i)=>{ if (!L.c) return; const r = resample(L.c, IDEAL.length), mx = Math.max(...r)||1, latest = i===WKA.last.length-1;
      g.save(); g.globalAlpha = latest ? 1 : 0.18 + i*0.08; g.beginPath(); r.forEach((v,k)=>{ k?g.lineTo(X(k),Y(v/mx)):g.moveTo(X(k),Y(v/mx)); });
      g.lineWidth = latest ? 5 : 2.5; g.lineJoin='round'; g.strokeStyle = latest ? (L.g!=null ? shadeC(GCOL[L.g],-0.12) : LP.teal) : LP.ink; g.stroke(); g.restore(); });
    tx(g, 'CATCH', gx+2, gy+gh+12, 9, '#6b6680', 'left', false); tx(g, 'FINISH', gx+gw-2, gy+gh+12, 9, '#6b6680', 'right', false);
    if (lastFx && fxAge < 1.6){ const sc = 1 + Math.max(0, 0.6 - fxAge*2.2), a = fxAge>1.1 ? (1.6-fxAge)*2 : 1;
      g.save(); g.globalAlpha = a; g.translate(cx0+cw/2, top+gh*0.42); g.rotate(-0.06); g.scale(sc,sc); tx(g, GRADES[lastFx.g], 0, 0, 40, shadeC(GCOL[lastFx.g],-0.1)); g.restore();
      if (lastFx.why && lastFx.g<2){ g.save(); g.globalAlpha=a; tx(g, lastFx.why, cx0+cw/2, top+gh*0.42+38, 14, INKc, 'center', false); g.restore(); } }
  }
  // ---- HUD ----
  box(g, hx, top, hw, 48, LP.rose); g.save(); g.beginPath(); g.rect(hx+4,top,hw-8,48); g.clip(); tx(g, st.n, hx+hw/2, top+18, 15, CRM); g.restore();
  const el = stepEl(), clock = st.type==='time' ? fmtTime(Math.max(0, st.v-el)).replace(/\.\d$/,'') : `${Math.max(0, Math.round(st.v - ((LIVE.dist||0)-(WKA.d0||0))))} m`;
  tx(g, clock, hx+hw/2, top+37, 14, LP.cream, 'center', false);
  const R = WKA.R, cy = top + 60;
  box(g, hx, cy, hw, H-cy-P, 'rgba(59,53,96,.78)');
  tx(g, String(R.score), hx+hw/2, cy+26, 26, CRM); tx(g, 'POINTS', hx+hw/2, cy+46, 9, 'rgba(255,246,236,.6)', 'center', false);
  const pulse = lastFx && fxAge < 0.3 ? 1 + (0.3-fxAge) : 1;
  g.save(); g.translate(hx+hw/2, cy+90); g.scale(pulse,pulse); tx(g, R.combo ? String(R.combo) : '–', 0, 0, 38, R.combo>=10 ? LP.gold : CRM); g.restore();
  tx(g, 'COMBO', hx+hw/2, cy+118, 10, 'rgba(255,246,236,.6)', 'center', false);
  const mult = R.mult || 1; g.fillStyle = mult>1 ? LP.gold : 'rgba(255,246,236,.25)'; g.beginPath(); for (let k=0;k<6;k++){ const a=-Math.PI/2+k/6*Math.PI*2; g.lineTo(hx+hw/2+Math.cos(a)*21, cy+152+Math.sin(a)*21); } g.closePath(); g.fill(); tx(g, '×'+mult, hx+hw/2, cy+153, 16, INKc, 'center', false);
  const nb = 10 - (R.combo % 10); if (mult<4) tx(g, `${nb} to ×${mult+1}`, hx+hw/2, cy+184, 9, 'rgba(255,246,236,.6)', 'center', false);
  if (R.n) tx(g, `${Math.round((R.acc||0)*100)}% ACCURACY`, hx+hw/2, H-P-14, 10, CRM, 'center', false);
  // power gauge for power steps
  if (st.focus==='power' && st.pw){ const n = (MY.P && MY.P.normal) || WKA.selfNormal, w = LIVE.watt||0, lo = 70, hi = 150, p = n ? w/n*100 : null; const gx2 = cx0+cw-22, gy2 = top+40, gh2 = gh;
    const Yp = v => gy2 + gh2 - (clamp(v,lo,hi)-lo)/(hi-lo)*gh2; g.fillStyle='#fffaf0'; g.fillRect(gx2-8,gy2,16,gh2); g.fillStyle='rgba(91,140,58,.6)'; g.fillRect(gx2-8,Yp(st.pw[1]),16,Yp(st.pw[0])-Yp(st.pw[1])); g.lineWidth=2; g.strokeStyle=INKc; g.strokeRect(gx2-8,gy2,16,gh2);
    if (p){ g.fillStyle='#c8352b'; g.beginPath(); g.moveTo(gx2-14,Yp(p)); g.lineTo(gx2-4,Yp(p)-6); g.lineTo(gx2-4,Yp(p)+6); g.closePath(); g.fill(); g.stroke(); tx(g, `${Math.round(p)}%`, gx2-18, Yp(p), 10, INKc, 'right', false); } }
  // next-step title card
  const ca = (Date.now()-WKA.card)/1000;
  if (ca < 3.5){ g.save(); g.fillStyle = 'rgba(59,53,96,.88)'; g.fillRect(0,0,W,H); g.translate(W/2, H/2);
    tx(g, m.idx ? 'N E X T   U P' : 'H E R E   W E   G O', 0, -H*0.2, 12, 'rgba(255,246,236,.75)', 'center', false);
    tx(g, st.n, 0, -H*0.05, 40, CRM); tx(g, `${FOCUS[st.focus].t} · ${stepTarget(st)} · ${stepLen(st)}`.toUpperCase(), 0, H*0.08, 12, LP.gold, 'center', true); tx(g, String(Math.ceil(3.5-ca)), 0, H*0.24, 44, CRM, 'center', false); g.restore(); }
}

// ---------- the end: awards, style, twin, save ----------
async function finishWk(){
  stopPlay(); const r = (WKA.m.res||{})[TEAM.athlete && TEAM.athlete.id] || {}, R = WKA.R, sty = r.style ? STYLES[r.style] : null;
  $('sessIn').innerHTML = `<div class="lob"><div class="lobL">${avatarSVG(myAv(),130)}<div class="lobName">${R.score} pts</div><div class="lobS">${R.n} strokes · best combo ${R.maxCombo} · ${Math.round((R.acc||0)*100)}% accuracy</div>
      <div class="hits">${GRADES.map((t,i)=>`<span style="background:${GCOL[i]}">${t} ${R.hits[i]}</span>`).reverse().join('')}</div></div>
    <div class="lobR"><div class="lobT">Workout done!</div>${r.imp!=null ? `<div class="lobS" style="font-size:16px;color:#ffb547">${r.imp>=0?'+':''}${Math.round(r.imp)} accuracy vs your usual</div>` : '<div class="lobS">Your first coached workout: this is your baseline.</div>'}
      ${sty?`<div class="lbl2">Your rowing style</div><div class="sty"><b>${esc(sty.t)}</b> · ${esc(sty.d)}</div>`:''}
      ${r.twin?`<div class="lbl2">You row most like</div><div class="sty"><b>${esc(r.twin.name)}</b> · ${r.twin.sim}% alike in curve, power, rate and badges</div>`:''}
      <div class="lbl2">Badges from this workout</div><div class="crew">${(r.earned||[]).map(b=>`<span>${badgeSVG(b,true,58)}<small>${esc(BADGES[b].t)}</small></span>`).join('') || '<small>None this time. Long combos and clean curves earn them.</small>'}</div>
      <div class="lbl2" id="wkSaveMsg">Saving to your diary…</div><button id="wkClose">Close</button></div></div>`;
  $('wkClose').onclick = ()=>$('sessX').click();
  if (!WKA.saved && LIVE.strokes.length >= 5){ WKA.saved = true; LIVE.game = { score:R.score, maxCombo:R.maxCombo, maxP:R.maxP, maxBeat:R.maxBeat, acc:R.acc, n:R.n, done:true, plan:WKA.m.name };
    const ok = await saveCloud(LIVE); $('wkSaveMsg').textContent = ok ? 'Saved to your diary' : 'Not saved: log in to your team to keep it'; }
  else $('wkSaveMsg').textContent = '';
}
