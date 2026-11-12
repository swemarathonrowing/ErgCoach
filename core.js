// ---------- state ----------
const KEY = 'ergcoach.v1';
const S = (()=>{ try{ return Object.assign({profile:{hgt:185,wgt:80}, sessions:[]}, JSON.parse(localStorage.getItem(KEY)||'{}')); }catch(e){ return {profile:{hgt:185,wgt:80}, sessions:[]}; } })();
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){ toast('Storage full: delete old sessions'); } }

// the session being rowed right now
const LIVE = { strokes:[], start:null, dist:0, rate:0, watt:0, pace:0, src:null };
function newLive(src){ Object.assign(LIVE, {strokes:[], start:Date.now(), dist:0, rate:0, watt:0, pace:0, elapsed:0, src}); }

// ---------- PM5 over Web Bluetooth ----------
const UUID = n => `ce06${n}-43e5-11e4-916c-0800200c9a66`;
const PM = {
  dev:null, connected:false,
  cur:{}, buf:[], bufN:0, bufGot:0, lastCount:-1,
  async connect(){
    const bt = navigator.bluetooth || navigator.webble;
    if (!bt) throw new Error('nobt');
    this.dev = await bt.requestDevice({ filters:[{namePrefix:'PM5'}], optionalServices:[UUID('0010'), UUID('0020'), UUID('0030')] });
    this.dev.addEventListener('gattserverdisconnected', ()=>{ this.connected=false; pmUi(); toast('PM5 disconnected'); });
    setCon('Connecting to '+(this.dev.name||'PM5')+' …');
    const srv = await this.dev.gatt.connect();
    const svc = await srv.getPrimaryService(UUID('0030'));
    try{ const r = await svc.getCharacteristic(UUID('0034')); await r.writeValue(new Uint8Array([1])); }catch(e){}   // status every 500 ms
    const subs = [['0031', this.onGeneral], ['0032', this.onAdditional], ['0035', this.onStroke], ['0036', this.onStroke2], ['003d', this.onCurve]];
    for (const [id, fn] of subs){
      try{
        const c = await svc.getCharacteristic(UUID(id));
        c.addEventListener('characteristicvaluechanged', e => { const dv = e.target.value; fn.call(this, new Uint8Array(dv.buffer, dv.byteOffset, dv.byteLength)); });
        await c.startNotifications();
      }catch(e){ console.warn('PM5 char', id, e); }
    }
    this.connected = true; newLive('pm5'); pmUi();
  },
  disconnect(){ try{ this.dev && this.dev.gatt.disconnect(); }catch(e){} this.connected=false; pmUi(); },
  u16(v,i){ return v[i] | (v[i+1]<<8); }, u24(v,i){ return v[i] | (v[i+1]<<8) | (v[i+2]<<16); },
  onGeneral(v){ LIVE.elapsed = this.u24(v,0)*0.01; LIVE.dist = this.u24(v,3)*0.1; LIVE.drag = v[18]; liveUi(); },
  onAdditional(v){ LIVE.rate = v[5]; LIVE.pace = this.u16(v,7)*0.01; if (LIVE.hrSrc!=='strap') LIVE.hr = (v[6] && v[6]<255) ? v[6] : null; liveUi(); },
  onStroke(v){
    const sd = { driveLen:v[6]*0.01, driveTime:v[7]*0.01, recTime:this.u16(v,8)*0.01, strokeDist:this.u16(v,10)*0.01,
      peak:this.u16(v,12)*0.1*LBF, avg:this.u16(v,14)*0.1*LBF, work:this.u16(v,16)*0.1, count:this.u16(v,18) };
    if (sd.count === this.lastCount) return;
    this.cur.sd = sd; this.tryFinish();
  },
  onStroke2(v){ this.cur.power = this.u16(v,3); LIVE.watt = this.cur.power; liveUi(); },
  onCurve(v){
    // byte 0: high nibble = packets in this curve, low nibble = 16-bit points in this packet; byte 1 = sequence
    const total = (v[0]>>4)&15, n = v[0]&15;
    if (this.bufGot === 0 || this.bufN !== total) { this.buf = []; this.bufN = total; this.bufGot = 0; }
    for (let i=0; i<n; i++) this.buf.push(this.u16(v, 2+i*2)*LBF);
    this.bufGot++;
    if (this.bufGot >= this.bufN){ this.cur.curve = this.buf.slice(); this.bufGot = 0; this.tryFinish(); }
  },
  tryFinish(){
    clearTimeout(this.ft);
    if (this.cur.curve && this.cur.sd) return this.finish();
    this.ft = setTimeout(()=>this.finish(), 1500);     // one of the two never came: keep what we have
  },
  finish(){
    clearTimeout(this.ft);
    const c = this.cur; this.cur = {};
    if (!c.curve && !c.sd) return;
    if (c.sd) this.lastCount = c.sd.count;
    addStroke(Object.assign({ t:Date.now(), curve:c.curve||null, power:c.power||LIVE.watt, rate:LIVE.rate }, c.sd||{}));
  }
};

// ---------- demo rower (to try the app without an erg) ----------
const DEMO = { on:false, kind:'good', h:null, n:0 };
function demoCurve(kind){
  const N = 32, out = [];
  for (let i=0;i<N;i++){
    const x = i/(N-1); let f;
    const bell = (c, w) => Math.exp(-(((x-c)/w)**2));
    switch(kind){
      case 'soft':  f = Math.pow(x,1.6)*0.3 + bell(0.52,0.24); break;
      case 'late':  f = bell(0.62,0.22) + 0.15*bell(0.3,0.15); break;
      case 'hump':  f = 0.95*bell(0.3,0.13) + 0.85*bell(0.66,0.14); break;
      case 'spike': f = bell(0.2,0.09)*1.15 + 0.45*bell(0.5,0.28); break;
      default:      f = Math.sin(Math.PI*Math.pow(x,0.756)); f = Math.pow(Math.max(0,f),1.15);
    }
    if (i===0 || i===N-1) f *= 0.15;
    out.push(Math.max(0, f*(1+(Math.random()-0.5)*0.06)));
  }
  const pk = 520 + (Math.random()-0.5)*40, m = Math.max(...out);
  return out.map(v=>v/m*pk);
}
function demoStroke(){
  const rate = 22 + Math.round((Math.random()-0.5)*2);
  const curve = demoCurve(DEMO.kind);
  const driveTime = DEMO.kind==='good' ? 0.82 : 0.78 + Math.random()*0.08;
  const recTime = 60/rate - driveTime - (DEMO.kind==='spike' ? 0.5 : 0);
  const driveLen = (S.profile.hgt||185)*0.0079 * (DEMO.kind==='soft' ? 0.92 : 1);
  const avg = mean(curve), peak = Math.max(...curve);
  const power = Math.round(avg*driveLen/driveTime*0.92);
  if (LIVE.hrSrc!=='strap') LIVE.hr = Math.round(Math.min(168, 105 + DEMO.n*1.6 + (Math.random()-0.5)*3));
  LIVE.rate = rate; LIVE.watt = power; LIVE.pace = paceFromWatts(power); LIVE.dist += 500/LIVE.pace*60/rate;
  addStroke({ t:Date.now(), curve, driveLen, driveTime, recTime:Math.max(0.6,recTime), peak, avg, power, rate, count:++DEMO.n });
  DEMO.h = setTimeout(demoStroke, 60/rate*1000);
}
function startDemo(){ if (PM.connected) PM.disconnect(); clearTimeout(DEMO.h); DEMO.on = true; DEMO.n = 0; newLive('demo'); demoStroke(); pmUi(); $('demoSeg').classList.remove('hidden'); }
function stopDemo(){ DEMO.on=false; clearTimeout(DEMO.h); pmUi(); $('demoSeg').classList.add('hidden'); }

function addStroke(s){
  if (!LIVE.start) newLive(DEMO.on ? 'demo' : 'pm5');
  if (s.hr==null) s.hr = LIVE.hr || null;
  LIVE.strokes.push(s);
  HOOKS.stroke.forEach(f=>{ try{ f(s); }catch(e){ console.warn(e); } });
  if (!s.power && s.avg && s.driveLen && s.driveTime) s.power = Math.round(s.avg*s.driveLen/s.driveTime*0.92);
  liveUi(); if (VIEW==='live') renderLiveChart(); if (VIEW==='tech') renderTech();
}

// ---------- UI shell ----------
let VIEW = 'con';
function showView(v){
  VIEW = v;
  for (const s of ['con','live','tech','video','log']) $('v-'+s).classList.toggle('hidden', s!==v);
  document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('active', b.dataset.v===v));
  if (v==='live') { liveUi(); renderLiveChart(); }
  if (v==='tech') renderTech();
  if (v==='log') renderLog();
  if (v==='video') videoView();
  window.scrollTo(0,0);
}
document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>showView(b.dataset.v));
function setCon(t){ $('conStatus').textContent = t; }
function pmUi(){
  const on = PM.connected || DEMO.on;
  $('pmDot').classList.toggle('on', on);
  $('pmTxt').textContent = PM.connected ? (PM.dev && PM.dev.name || 'PM5')+' connected' : DEMO.on ? 'Demo rowing' : 'PM5 not connected';
  $('btnConnect').textContent = PM.connected ? 'Disconnect' : 'Connect PM5';
  $('btnDemo').textContent = DEMO.on ? 'Stop demo' : 'Try demo rowing';
  setCon(PM.connected ? 'Connected. Start rowing — strokes appear under Live.' : DEMO.on ? 'Demo is rowing at about 22 strokes/min. Pick a fault to see how the analysis reacts.' : '');
}
function btCheck(){
  const ok = !!(navigator.bluetooth || navigator.webble);
  $('btWarn').innerHTML = ok ? '' : `<div class="note"><b>This browser can't use Bluetooth.</b> On iPhone and iPad, open this page in the free <b>Bluefy</b> browser from the App Store. On Android, Mac and PC use <b>Chrome</b> or <b>Edge</b>. Video analysis works everywhere, Safari included.</div>`;
}
$('btnConnect').onclick = async ()=>{
  if (PM.connected) return PM.disconnect();
  stopDemo();
  try{ await PM.connect(); showView('live'); }
  catch(e){
    if (e.message==='nobt') { btCheck(); setCon('No Web Bluetooth here — see above.'); }
    else if (e.name==='NotFoundError') setCon('No PM5 chosen. Wake the monitor and try again.');
    else setCon('Could not connect: '+e.message);
  }
};
$('btnDemo').onclick = ()=>{ if (DEMO.on) stopDemo(); else { startDemo(); showView('live'); } };
$('demoSeg').querySelectorAll('button').forEach(b=>b.onclick=()=>{ DEMO.kind=b.dataset.d; $('demoSeg').querySelectorAll('button').forEach(x=>x.classList.toggle('active',x===b)); });
$('pHgt').value = S.profile.hgt; $('pWgt').value = S.profile.wgt;
$('pHgt').oninput = ()=>{ S.profile.hgt = +$('pHgt').value||null; save(); };
$('pWgt').oninput = ()=>{ S.profile.wgt = +$('pWgt').value||null; save(); };

// ---------- live ----------
function liveUi(){
  if (VIEW!=='live') return;
  const last = LIVE.strokes[LIVE.strokes.length-1];
  $('lPace').textContent = fmtPace(LIVE.pace || (last && paceFromWatts(last.power)));
  $('lRate').textContent = LIVE.rate || '–';
  $('lWatt').textContent = LIVE.watt || (last && last.power) || '–';
  $('lDist').textContent = LIVE.dist ? Math.round(LIVE.dist) : '–';
  $('lStroke').textContent = LIVE.strokes.length + ' strokes';
  const z = zoneOf(profileHR(), LIVE.hr);
  $('lHr').textContent = LIVE.hr || '–';
  $('lZone').textContent = z ? `${z.k} · ${Math.round(z.r*100)} % of HR reserve` : LIVE.hr ? 'Add max and resting HR under PM5 → You' : 'no heart rate';
  $('lZone').style.background = z ? z.col : '';
  HOOKS.status.forEach(f=>f());
}
$('btnLiveTech').onclick = ()=>showView('tech');
$('btnSave').onclick = ()=>{
  stopDemo(); if (PM.connected) PM.disconnect();
  if (LIVE.strokes.length < 5) { toast('Row at least 5 strokes first'); return; }
  S.sessions.unshift(packSession(LIVE)); S.sessions = S.sessions.slice(0,40); save();
  saveCloud(LIVE).then(ok=>toast(ok ? 'Saved to your diary and the team' : 'Session saved on this phone'));
  newLive(null); LIVE.start=null; showView('log');
};
function packSession(L){
  const ss = L.strokes.map(s=>({ h:s.hr||undefined, t:s.t, c:s.curve ? resample(s.curve,40).map(v=>Math.round(v)) : null, dl:s.driveLen, dt:s.driveTime, rt:s.recTime, p:s.power, r:s.rate, pk:s.peak?Math.round(s.peak):null, av:s.avg?Math.round(s.avg):null }));
  return { id:'s'+Date.now().toString(36), start:L.start, src:L.src, dist:Math.round(L.dist||0), strokes:ss };
}
function unpack(sess){ return (sess.strokes||[]).map(s=>({ hr:s.h, t:s.t, curve:s.c, driveLen:s.dl, driveTime:s.dt, recTime:s.rt, power:s.p, rate:s.r, peak:s.pk, avg:s.av })); }
