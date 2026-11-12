// ---------- video analysis ----------
const VID = { track:[], frames:[], an:null, W:0, H:0, base:null, recStart:null, stream:null, rec:null, overlay:true, raf:0, pose:null };
const LMK = { sh:[11,12], el:[13,14], wr:[15,16], hip:[23,24], kn:[25,26], an:[27,28], ft:[31,32] };
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.2';
const POSE_MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
const vid = $('vid'), vcan = $('vcan');
const deg = r => r*180/Math.PI;
const dist = (a,b) => Math.hypot(a[0]-b[0], a[1]-b[1]);
function ang3(a,b,c){ const v1=[a[0]-b[0],a[1]-b[1]], v2=[c[0]-b[0],c[1]-b[1]]; return deg(Math.acos(clamp((v1[0]*v2[0]+v1[1]*v2[1])/(Math.hypot(...v1)*Math.hypot(...v2)||1),-1,1))); }
function vStatus(t){ $('vStatus').innerHTML = t; }

function videoView(){ drawOverlay(); }
function showVideo(on){ vid.classList.toggle('hidden', !on); $('vEmpty').classList.toggle('hidden', on); }

// --- sources ---
$('vLoad').onclick = ()=>$('vFile').click();
$('vFile').onchange = e => { const f = e.target.files[0]; if (!f) return; resetVideo(); VID.recStart = null; vid.srcObject = null; vid.src = URL.createObjectURL(f); vid.load(); showVideo(true); $('vAnaBar').classList.remove('hidden'); vStatus(`Loaded ${esc(f.name)}. Tap <b>Find joints &amp; analyse</b>.`); };
$('vRec').onclick = async ()=>{
  try{
    VID.stream = await navigator.mediaDevices.getUserMedia({ video:{ facingMode:'environment', width:{ideal:1280}, height:{ideal:720}, frameRate:{ideal:30} }, audio:false });
  }catch(e){ vStatus('The camera is not available in this browser. Film with the Camera app and use <b>Load video</b>.'); return; }
  resetVideo(); vid.src = ''; vid.srcObject = VID.stream; showVideo(true); await vid.play().catch(()=>{});
  const chunks = [], type = ['video/mp4','video/webm;codecs=vp9','video/webm'].find(t=>window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  VID.rec = new MediaRecorder(VID.stream, type?{mimeType:type}:{});
  VID.rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  VID.rec.onstop = ()=>{
    VID.stream.getTracks().forEach(t=>t.stop()); vid.srcObject = null;
    vid.src = URL.createObjectURL(new Blob(chunks, {type: type||'video/mp4'})); vid.load();
    $('vRecBar').classList.add('hidden'); $('vSrcBar').classList.remove('hidden'); $('vAnaBar').classList.remove('hidden');
    vStatus('Recorded'+(LIVE.strokes.length ? ' — synced with the PM5 strokes rowed meanwhile' : '')+'. Tap <b>Find joints &amp; analyse</b>.');
  };
  VID.rec.start(); VID.recStart = Date.now();
  $('vSrcBar').classList.add('hidden'); $('vRecBar').classList.remove('hidden'); vStatus('Recording… row a few strokes, then Stop.');
};
$('vStop').onclick = ()=>{ if (VID.rec && VID.rec.state!=='inactive') VID.rec.stop(); };
function resetVideo(){ Object.assign(VID, {track:[], frames:[], an:null, base:null}); $('vPlay').classList.add('hidden'); $('vResult').classList.add('hidden'); $('vSyncPanel').classList.add('hidden'); $('vProg').style.width='0'; const c=vcan.getContext('2d'); c.clearRect(0,0,vcan.width,vcan.height); }

// --- pose tracking ---
async function getPose(){
  if (window.__mockPose) return { detectForVideo:(v,ts)=>({landmarks:[window.__mockPose(ts/1000)]}) };
  if (VID.pose) return VID.pose;
  vStatus('Loading the body-tracking model (about 9 MB, first time only)…');
  const m = await import(MP + '/vision_bundle.mjs');
  const fs = await m.FilesetResolver.forVisionTasks(MP + '/wasm');
  const opts = d => ({ baseOptions:{ modelAssetPath:POSE_MODEL, delegate:d }, runningMode:'VIDEO', numPoses:1, minPoseDetectionConfidence:0.4, minTrackingConfidence:0.4 });
  try{ VID.pose = await m.PoseLandmarker.createFromOptions(fs, opts('GPU')); }catch(e){ VID.pose = await m.PoseLandmarker.createFromOptions(fs, opts('CPU')); }
  return VID.pose;
}
function seek(t){ return new Promise(res=>{ const done=()=>{ vid.removeEventListener('seeked',done); res(); }; vid.addEventListener('seeked',done); vid.currentTime = t; setTimeout(done, 1500); }); }
$('vAnalyse').onclick = async ()=>{
  const btn = $('vAnalyse'); btn.disabled = true;
  try{
    if (!vid.duration || !isFinite(vid.duration)) await new Promise(r=>{ vid.onloadedmetadata=r; setTimeout(r,3000); });
    const pose = await getPose();
    vid.pause(); VID.W = vid.videoWidth || 1280; VID.H = vid.videoHeight || 720; VID.track = [];
    const fps = 20, dur = vid.duration || 0, n = Math.floor(dur*fps);
    for (let i=0;i<=n;i++){
      const t = i/fps; await seek(t);
      let L = null;
      try{ const r = pose.detectForVideo(vid, Math.round(t*1000)+1); L = r.landmarks && r.landmarks[0] ? r.landmarks[0].map(p=>[p.x,p.y,p.visibility??1]) : null; }catch(e){}
      VID.track.push({t, L});
      if (i%5===0){ $('vProg').style.width = (i/n*100)+'%'; vStatus(`Finding joints… ${Math.round(i/n*100)} %`); await new Promise(r=>setTimeout(r,0)); }
    }
    $('vProg').style.width = '100%';
    analyseVideo();
  }catch(e){ console.error(e); vStatus('Could not run the body tracking: '+esc(e.message)+'. It needs an internet connection the first time.'); }
  btn.disabled = false;
};

// --- turn landmarks into rowing angles and strokes ---
function analyseVideo(){
  const tr = VID.track.filter(f=>f.L);
  if (tr.length < 20){ vStatus('Could not find a person in enough frames. Film from the side with the whole body in view.'); return; }
  const vis = s => mean(tr.map(f=>Object.values(LMK).reduce((a,k)=>a+(f.L[k[s]][2]||0),0)));
  const si = vis(0) >= vis(1) ? 0 : 1, W = VID.W, H = VID.H;
  let fr = tr.map(f=>{ const o={t:f.t}; for (const k in LMK){ const p=f.L[LMK[k][si]]; o[k]=[p[0]*W,p[1]*H]; } return o; });
  // smooth every joint over 5 frames
  fr = fr.map((f,i)=>{ const o={t:f.t}; for (const k in LMK){ const w = fr.slice(Math.max(0,i-2), i+3); o[k] = [mean(w.map(x=>x[k][0])), mean(w.map(x=>x[k][1]))]; } return o; });
  const dir = Math.sign(mean(fr.map(f=>f.an[0]-f.hip[0]))) || 1;           // +1 = feet to the right
  const thigh = mean(fr.map(f=>dist(f.hip,f.kn))), mpp = ((S.profile.hgt||185)*0.245/100)/thigh;
  for (const f of fr){
    f.seat = dir*(f.an[0]-f.hip[0])*mpp;                 // hip to ankle, m (small at the catch)
    f.hand = dir*(f.an[0]-f.wr[0])*mpp;                  // ankle to hands, m
    f.knee = ang3(f.hip,f.kn,f.an); f.elbow = ang3(f.sh,f.el,f.wr);
    f.trunk = deg(Math.atan2(dir*(f.sh[0]-f.hip[0]), f.hip[1]-f.sh[1]));   // + = leaning towards the feet
    f.shin = deg(Math.atan2(dir*(f.kn[0]-f.an[0]), f.an[1]-f.kn[1]));      // + = knee past the ankle
    f.handsPastKnee = dir*(f.an[0]-f.wr[0]) < dir*(f.an[0]-f.kn[0]);
  }
  // catches (seat closest to the feet) and finishes (furthest), with hysteresis
  const sv = fr.map(f=>f.seat).slice().sort((a,b)=>a-b), lo = sv[Math.floor(sv.length*0.05)], hi = sv[Math.floor(sv.length*0.95)], rng = hi-lo;
  const ev = []; let mode = null, best = null;
  fr.forEach((f,i)=>{
    if (f.seat < lo+0.3*rng){ if (mode!=='c'){ if (best) ev.push(best); mode='c'; best={k:'c',i}; } else if (f.seat < fr[best.i].seat) best.i=i; }
    else if (f.seat > hi-0.3*rng){ if (mode!=='f'){ if (best) ev.push(best); mode='f'; best={k:'f',i}; } else if (f.seat > fr[best.i].seat) best.i=i; }
  });
  if (best) ev.push(best);
  const strokes = [];
  for (let j=0;j+2<ev.length;j++){
    if (ev[j].k!=='c' || ev[j+1].k!=='f' || ev[j+2].k!=='c') continue;
    const c=ev[j].i, f=ev[j+1].i, c2=ev[j+2].i, C=fr[c], Fi=fr[f];
    const drv = fr.slice(c,f+1), rec = fr.slice(f,c2+1), T = x => x ? x.t-C.t : null;
    const firstD = pred => drv.find(pred);
    const leg50 = firstD(x=>x.knee >= C.knee+0.5*(Fi.knee-C.knee)), back = firstD(x=>x.trunk <= C.trunk-5), arm = C.elbow>155 ? firstD(x=>x.elbow<=155) : null, vert = firstD(x=>x.trunk<=0);
    const s30 = firstD(x=>x.seat-C.seat >= 0.3*(Fi.seat-C.seat));
    const shoot = s30 ? (s30.hand-C.hand)/Math.max(0.01, s30.seat-C.seat) : 1;
    const kBend = rec.find(x=>x.knee <= Fi.knee-12), hPast = rec.find(x=>x.handsPastKnee);
    // handle speed during the drive (m/s)
    const hv = drv.map((x,k)=>{ const a=drv[Math.max(0,k-1)], b=drv[Math.min(drv.length-1,k+1)]; return b.t>a.t ? (b.hand-a.hand)/(b.t-a.t) : 0; });
    strokes.push({ c:C.t, f:Fi.t, c2:fr[c2].t, driveT:Fi.t-C.t, recT:fr[c2].t-Fi.t, rate:60/(fr[c2].t-C.t),
      catchTrunk:C.trunk, finishTrunk:Fi.trunk, shin:C.shin, catchKnee:C.knee, finishElbow:Fi.elbow, len:Fi.hand-C.hand,
      backEarly: back && leg50 ? T(back) < T(leg50) - 0.02 : false, armEarly: arm && vert ? T(arm) < T(vert) - 0.03 : !!(arm && !vert),
      shoot, kneesEarly: kBend && hPast ? kBend.t < hPast.t - 0.03 : false, hv:resample(hv.map(v=>Math.max(0,v)),50) });
  }
  VID.frames = fr; VID.an = { strokes, dir, mpp, side: si ? 'right' : 'left' };
  if (!strokes.length){ vStatus('Joints found, but no full strokes. Film at least 3 complete strokes from the side.'); }
  else vStatus(`Found ${strokes.length} strokes. Lines show the ${VID.an.side} side of the body.`);
  setupPlayback(); renderVideoResult();
  if (VID.recStart) { VID.base = VID.recStart; }
  if (pmStrokes().length) { $('vSyncPanel').classList.remove('hidden'); if (!VID.base) autoSync(); }
  syncInfo(); drawOverlay();
}

function med(a){ const s=a.filter(x=>x!=null&&!isNaN(x)).sort((x,y)=>x-y); return s.length ? s[Math.floor(s.length/2)] : null; }
function videoFindings(st){
  const F = [], add=(sev,title,what,why,drill)=>F.push({sev,title,what,why,drill});
  const share = k => st.filter(s=>s[k]).length/st.length;
  const ct = med(st.map(s=>s.catchTrunk)), ft = med(st.map(s=>s.finishTrunk)), sh = med(st.map(s=>s.shin)), ratio = med(st.map(s=>s.recT/s.driveT)), rate = med(st.map(s=>s.rate)), shoot = med(st.map(s=>s.shoot));
  if (share('backEarly') > 0.4) add(2,'Back opens before the legs are down',`In ${Math.round(share('backEarly')*100)} % of the strokes the body starts swinging back before the knees are half flat.`,'The legs lose their connection to the handle and the back has to do the work. On the force curve this often shows as a late peak or two humps.','<b>Drill:</b> legs-only strokes, then "legs, then body" with the arms long. Hold the body angle until the hands pass the knees.');
  if (shoot < 0.6) add(2,'Slide shooting',`In the first third of the drive the handle moves only ${Math.round(shoot*100)} % as far as the seat.`,'The seat runs away from the handle: the legs push but the back gives way, so the force never reaches the handle.','<b>Drill:</b> pause at the catch, then push with the legs and feel the handle move at the same speed as the seat. Pick drill: catch at half slide.');
  if (share('armEarly') > 0.4) add(1,'Arms bend early',`In ${Math.round(share('armEarly')*100)} % of the strokes the elbows bend before the body has passed vertical.`,'Pulling with the arms early shortens the drive and moves load from the strong legs to the weak arms.','<b>Drill:</b> "long arms" — keep the arms straight like ropes until the back has opened, then draw.');
  if (share('kneesEarly') > 0.4) add(1,'Knees come up before the hands pass them',`In ${Math.round(share('kneesEarly')*100)} % of the strokes the knees bend before the hands are past them.`,'The hands have to lift over the knees and the recovery gets out of order.','<b>Drill:</b> recovery order "arms, body, slide" — pause with arms away and body over, then let the knees rise.');
  if (ct != null && ct < 12) add(1,'Little body swing at the catch',`Body angle at the catch about ${Math.round(ct)}° forward (aim for 20–30°, "1 o'clock").`,'Without the forward swing the catch is short and the back can not add to the drive.','<b>Drill:</b> arms-and-body only with a clear swing forward from the hips, then add the slide.');
  if (ct != null && ct > 36) add(1,'Over-reaching at the catch',`Body angle at the catch about ${Math.round(ct)}° forward (aim for 20–30°).`,'Reaching too far rounds the back and puts the lower back in a weak position at the hardest part of the stroke.','<b>Drill:</b> set the body angle at the finish of the recovery\'s body-over and keep it up the slide.');
  if (sh != null && sh > 10) add(1,'Over-compressed at the catch',`The knees are about ${Math.round(sh)}° past vertical at the catch.`,'Coming too far up the slide puts the knees past the ankles and the legs in a weak position.','<b>Drill:</b> stop at shins vertical. Try moving the footstretcher one hole towards the stern (see RigCoach).');
  if (sh != null && sh < -12) add(1,'Not coming far enough forward',`The shins are about ${Math.round(-sh)}° short of vertical at the catch.`,'The stroke is shorter than it needs to be.','<b>Drill:</b> reach the catch with shins vertical and the arms long, then push.');
  if (ft != null && ft > -6) add(1,'Little layback at the finish',`Body angle at the finish about ${Math.round(-ft)}° back (aim for 10–25°, "11 o'clock").`,'Without the body swing the back adds nothing at the end of the drive.','<b>Drill:</b> legs + body only, finish leaning slightly back with the core engaged.');
  if (ft != null && ft < -32) add(1,'Too much layback',`Body angle at the finish about ${Math.round(-ft)}° back (aim for 10–25°).`,'Lying back costs time and makes the recovery heavy.','<b>Drill:</b> finish at "11 o\'clock" and let the hands lead out.');
  if (ratio && rate < 28 && ratio < 1.6) add(1,'Rushing the slide',`Recovery is ${fmt(ratio,1)} × the drive at rate ${Math.round(rate)}.`,'Speeding up the slide costs energy and makes the catch rushed.','<b>Drill:</b> rate 18, count 1 on the drive and 1-2-3 on the recovery.');
  if (!F.length) add(0,'Sequence looks good','Legs, body and arms come in the right order and the catch and finish positions are within the normal range.','Keep it as the rate goes up.','<b>Next:</b> film at rate 24 and 28 and compare.');
  return { F:F.sort((a,b)=>b.sev-a.sev), ct, ft, sh, ratio, rate, len:med(st.map(s=>s.len)) };
}
function renderVideoResult(){
  const st = VID.an && VID.an.strokes || [], el = $('vResult');
  if (!st.length){ el.classList.add('hidden'); return; }
  const r = videoFindings(st);
  el.classList.remove('hidden');
  el.innerHTML = `<h2>What the video shows · ${st.length} strokes</h2>
    <div class="chips">
      <div class="chip"><div class="cv">${r.rate?Math.round(r.rate):'–'}</div><div class="cl">strokes / min</div></div>
      <div class="chip ${r.ratio<1.6&&r.rate<28?'warn':''}"><div class="cv">1 : ${fmt(r.ratio,1)}</div><div class="cl">drive : recovery</div></div>
      <div class="chip ${r.ct<12||r.ct>36?'warn':''}"><div class="cv">${fmt(r.ct,0)}°</div><div class="cl">body forward at catch · 20–30°</div></div>
      <div class="chip ${r.ft>-6||r.ft<-32?'warn':''}"><div class="cv">${fmt(-r.ft,0)}°</div><div class="cl">layback at finish · 10–25°</div></div>
      <div class="chip ${r.sh>10||r.sh<-12?'warn':''}"><div class="cv">${r.sh>0?'+':''}${fmt(r.sh,0)}°</div><div class="cl">shin at catch · 0° = vertical</div></div>
      <div class="chip"><div class="cv">${fmt(r.len,2)} m</div><div class="cl">handle travel (from height)</div></div>
    </div>
    <div style="margin-top:14px">${r.F.map(f=>`<div class="find"><h3>${esc(f.title)}${f.sev?`<span class="sev ${f.sev>1?'hi':''}">${f.sev>1?'work on this':'check'}</span>`:''}</h3><p>${f.what}</p><p style="color:var(--ink-mid)">${f.why}</p><div class="drill">${f.drill}</div></div>`).join('')}</div>
    <div class="tblWrap" style="margin-top:12px"><table><tr><th>#</th><th>rate</th><th>ratio</th><th>catch°</th><th>finish°</th><th>shin°</th><th>order</th></tr>
    ${st.map((s,i)=>`<tr data-go="${s.c}"><td>${i+1}</td><td>${Math.round(s.rate)}</td><td>${fmt(s.recT/s.driveT,1)}</td><td>${fmt(s.catchTrunk,0)}</td><td>${fmt(-s.finishTrunk,0)}</td><td>${fmt(s.shin,0)}</td><td class="${s.backEarly||s.armEarly||s.shoot<0.6?'off':'ok'}">${[s.backEarly?'back':'' , s.armEarly?'arms':'', s.shoot<0.6?'shoot':''].filter(Boolean).join(' ')||'ok'}</td></tr>`).join('')}</table></div>
    <p class="hint">Angles are measured in the picture, so film straight from the side. Tap a row to jump to that catch.</p>`;
  el.querySelectorAll('[data-go]').forEach(r=>r.onclick=()=>{ goTo(+r.dataset.go); window.scrollTo({top:0,behavior:'smooth'}); });
}

// --- playback with lines on the joints ---
function setupPlayback(){
  $('vPlay').classList.remove('hidden');
  vid.playbackRate = 0.5;
  vid.ontimeupdate = ()=>{ if (vid.paused) drawOverlay(); };
  vid.onplay = ()=>{ $('vPP').textContent='Pause'; loop(); };
  vid.onpause = ()=>{ $('vPP').textContent='Play'; cancelAnimationFrame(VID.raf); drawOverlay(); };
  vid.onseeked = ()=>drawOverlay();
}
function loop(){ drawOverlay(); if (!vid.paused) VID.raf = requestAnimationFrame(loop); }
function goTo(t){ vid.pause(); vid.currentTime = clamp(t,0,vid.duration||t); }
$('vPP').onclick = ()=>{ if (vid.paused) vid.play(); else vid.pause(); };
$('vBack').onclick = ()=>goTo(vid.currentTime-1/30);
$('vFwd').onclick = ()=>goTo(vid.currentTime+1/30);
$('vPrevC').onclick = ()=>{ const cs=(VID.an?.strokes||[]).map(s=>s.c).filter(c=>c<vid.currentTime-0.05); if (cs.length) goTo(cs[cs.length-1]); };
$('vNextC').onclick = ()=>{ const c=(VID.an?.strokes||[]).map(s=>s.c).find(c=>c>vid.currentTime+0.05); if (c!=null) goTo(c); };
$('vScrub').oninput = ()=>{ if (vid.duration) goTo($('vScrub').value/1000*vid.duration); };
$('vSpeed').querySelectorAll('[data-s]').forEach(b=>b.onclick=()=>{ vid.playbackRate=+b.dataset.s; $('vSpeed').querySelectorAll('[data-s]').forEach(x=>x.classList.toggle('active',x===b)); });
$('vOv').onclick = ()=>{ VID.overlay=!VID.overlay; $('vOv').classList.toggle('active',VID.overlay); drawOverlay(); };

function frameAt(t){
  const fr = VID.frames; if (!fr.length) return null;
  let k = fr.findIndex(f=>f.t>=t); if (k<=0) return fr[Math.max(0,k)]; if (k<0) return fr[fr.length-1];
  const a = fr[k-1], b = fr[k], u = (t-a.t)/((b.t-a.t)||1), o = {t};
  for (const key in a) if (Array.isArray(a[key])) o[key] = [a[key][0]*(1-u)+b[key][0]*u, a[key][1]*(1-u)+b[key][1]*u]; else if (typeof a[key]==='number') o[key] = a[key]*(1-u)+b[key]*u;
  return o;
}
function strokeAt(t){ return (VID.an?.strokes||[]).find(s=>t>=s.c && t<s.c2); }
function drawOverlay(){
  const t = vid.currentTime || 0;
  if (vid.duration) { $('vScrub').value = Math.round(t/vid.duration*1000); $('vT').textContent = fmt(t,2)+' s'; }
  const W = VID.W || vid.videoWidth, H = VID.H || vid.videoHeight; if (!W) return;
  if (vcan.width!==W) { vcan.width=W; vcan.height=H; }
  const g = vcan.getContext('2d'); g.clearRect(0,0,W,H);
  const s = strokeAt(t), i = s ? (VID.an.strokes.indexOf(s)+1) : 0;
  $('vPhase').textContent = s ? `stroke ${i} · ${t < s.f ? 'drive' : 'recovery'}` : '';
  if (VID.overlay && VID.frames.length){
    const f = frameAt(t); if (f){
      const lw = Math.max(3, W/220), seg = (a,b)=>{ g.beginPath(); g.moveTo(...f[a]); g.lineTo(...f[b]); g.stroke(); };
      // handle path, last 1.2 s
      const trail = VID.frames.filter(x=>x.t<=t && x.t>t-1.2);
      if (trail.length>1){ g.strokeStyle='rgba(255,255,255,0.7)'; g.lineWidth=lw*0.6; g.setLineDash([lw,lw]); g.beginPath(); trail.forEach((x,k)=>k?g.lineTo(...x.wr):g.moveTo(...x.wr)); g.stroke(); g.setLineDash([]); }
      const pairs = [['sh','el'],['el','wr'],['sh','hip'],['hip','kn'],['kn','an'],['an','ft']];
      g.lineCap='round'; g.strokeStyle='#fff'; g.lineWidth=lw*2.2; pairs.forEach(p=>seg(...p));
      g.strokeStyle=MG; g.lineWidth=lw; pairs.forEach(p=>seg(...p));
      // vertical reference at the hip and the body line extended
      g.strokeStyle='rgba(255,255,255,0.85)'; g.lineWidth=lw*0.5; g.setLineDash([lw*1.5,lw]); g.beginPath(); g.moveTo(f.hip[0], f.hip[1]); g.lineTo(f.hip[0], f.hip[1]-dist(f.hip,f.sh)*1.1); g.stroke(); g.setLineDash([]);
      for (const k of ['sh','el','wr','hip','kn','an']){ g.beginPath(); g.arc(...f[k], lw*1.3, 0, 7); g.fillStyle='#fff'; g.fill(); g.lineWidth=lw*0.6; g.strokeStyle=IK; g.stroke(); }
      const label = (p,txt,dx,dy)=>{ const fs=Math.max(14,W/48); g.font=`700 ${fs}px Chivo Mono, monospace`; const w=g.measureText(txt).width+fs*0.6; const x=p[0]+dx*fs, y=p[1]+dy*fs; g.fillStyle='rgba(255,255,255,0.92)'; g.fillRect(x, y-fs, w, fs*1.35); g.fillStyle=IK; g.fillText(txt, x+fs*0.3, y+fs*0.05); };
      const d = VID.an ? VID.an.dir : 1;
      label(f.kn, `knee ${Math.round(ang3(f.hip,f.kn,f.an))}°`, d>0?0.6:-6.5, -0.6);
      const tr = deg(Math.atan2(d*(f.sh[0]-f.hip[0]), f.hip[1]-f.sh[1]));
      label(f.hip, `body ${tr>=0?Math.round(tr)+'° fwd':Math.round(-tr)+'° back'}`, d>0?-9:0.8, 1.6);
      label(f.el, `arm ${Math.round(ang3(f.sh,f.el,f.wr))}°`, d>0?-6:0.6, -0.8);
    }
  }
  if (s && Math.abs(t-s.c)<0.06) tag(g,'CATCH',W); else if (s && Math.abs(t-s.f)<0.06) tag(g,'FINISH',W);
  drawSync(s);
}
function tag(g,txt,W){ const fs=Math.max(18,W/30); g.font=`900 ${fs}px Chivo Mono, monospace`; g.fillStyle=MG; g.fillRect(fs*0.5, fs*0.5, g.measureText(txt).width+fs, fs*1.5); g.fillStyle='#fff'; g.fillText(txt, fs, fs*1.55); }

// --- link the video to the PM5 force curves ---
function pmStrokes(){ if (LIVE.strokes.length) return LIVE.strokes; const s = S.sessions[0]; return s ? unpack(s) : []; }
function pmAt(videoFinish){ const ps = pmStrokes(); if (!ps.length || VID.base==null) return null; const at = VID.base + (videoFinish + (+$('vOffset').value||0))*1000; let best=null, bd=1e9; for (const p of ps){ const d=Math.abs(p.t-at); if (d<bd){ bd=d; best=p; } } return bd<1200 ? best : null; }
function autoSync(){
  const ps = pmStrokes(), st = VID.an?.strokes||[]; if (!ps.length || !st.length) return;
  let best = null, bs = 1e12;
  for (const s of st.slice(0,5)) for (const p of ps){ const base = p.t - s.f*1000; const sc = mean(st.map(x=>{ const at=base+x.f*1000; return Math.min(1500, Math.min(...ps.map(q=>Math.abs(q.t-at)))); })); if (sc<bs){ bs=sc; best=base; } }
  VID.base = best; $('vOffset').value = 0; syncInfo(); drawOverlay();
  toast(bs<300 ? 'Video aligned with the PM5 strokes' : 'Rough alignment — fine-tune the offset');
}
$('vAutoSync').onclick = autoSync;
$('vOffset').oninput = ()=>drawOverlay();
function syncInfo(){ const ps = pmStrokes(); $('vSyncInfo').textContent = !ps.length ? 'no PM5 strokes yet' : VID.recStart && LIVE.strokes.length ? 'recorded here, synced by clock' : `${ps.length} PM5 strokes from ${LIVE.strokes.length?'this session':'the last saved session'}`; }
function drawSync(s){
  if ($('vSyncPanel').classList.contains('hidden')) return;
  const p = s ? pmAt(s.f) : null, el = $('vForce');
  if (!s){ el.innerHTML = '<p class="hint">Move to a stroke to compare.</p>'; return; }
  const curves = [], pk = p && p.curve ? Math.max(...p.curve) : 0;
  if (p && p.curve) curves.push({data:resample(p.curve,50), col:MG, w:3});
  const vmax = Math.max(...s.hv) || 1, scale = (pk || 500)/vmax;
  curves.push({data:s.hv.map(v=>v*scale), col:IK, w:2});
  const t = vid.currentTime, x = clamp((t-s.c)/(s.f-s.c),0,1);
  el.innerHTML = forceChart(curves, {h:180, marks: t<=s.f ? [{x, t:'now'}] : []}) +
    `<p class="hint">${p ? `PM5 peak ${Math.round(pk)} N · handle speed peak ${fmt(vmax,2)} m/s. Where the black line keeps rising after the pink one falls, the handle is moving without pressure — that is where force is lost.` : 'No PM5 stroke matched this one. Use <b>Auto-align</b> or adjust the offset.'}</p>`;
}
