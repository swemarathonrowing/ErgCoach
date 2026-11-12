// ---------- force curve analysis ----------
function resample(a, n=50){
  if (!a || a.length<2) return [];
  const out = [];
  for (let i=0;i<n;i++){ const p = i/(n-1)*(a.length-1), k = Math.floor(p), f = p-k; out.push(k+1<a.length ? a[k]*(1-f)+a[k+1]*f : a[k]); }
  return out;
}
const smooth3 = a => a.map((v,i)=> i===0||i===a.length-1 ? v : (a[i-1]+2*v+a[i+1])/4);
// target shape: smooth bell, peak at about 40 % of the drive
const IDEAL = (()=>{ const r=[]; for(let i=0;i<50;i++){ const x=i/49; r.push(Math.pow(Math.max(0,Math.sin(Math.PI*Math.pow(x,0.756))),1.15)); } return r; })();
function pearson(a,b){ const ma=mean(a), mb=mean(b); let n=0,da=0,db=0; for(let i=0;i<a.length;i++){ n+=(a[i]-ma)*(b[i]-mb); da+=(a[i]-ma)**2; db+=(b[i]-mb)**2; } return n/Math.sqrt(da*db||1); }

function curveMetrics(curve){
  const r = smooth3(resample(curve, 50)); if (!r.length) return null;
  const pk = Math.max(...r), pi = r.indexOf(pk), x = i => i/49;
  const avg = mean(r);
  let pickup = 1; for (let i=0;i<r.length;i++) if (r[i] >= 0.5*pk){ pickup = x(i); break; }
  let drop = 1; for (let i=pi;i<r.length;i++) if (r[i] < 0.3*pk){ drop = x(i); break; }
  // humps: local maxima that stand out by more than 8 % of peak
  const peaks = [];
  for (let i=1;i<r.length-1;i++) if (r[i]>=r[i-1] && r[i]>r[i+1] && r[i]>0.4*pk) peaks.push(i);
  let humps = peaks.length ? 1 : 0, dip = 0;
  for (let k=1;k<peaks.length;k++){ const a=peaks[k-1], b=peaks[k]; const lo = Math.min(...r.slice(a,b+1)); const d = (Math.min(r[a],r[b]) - lo)/pk; if (d > 0.08){ humps++; dip = Math.max(dip,d); } }
  const tot = r.reduce((s,v)=>s+v,0);
  const tail = r.slice(40).reduce((s,v)=>s+v,0)/tot;     // share of the work in the last 20 %
  return { r, pk, peakPos:x(pi), ratio:pk/avg, pickup, drop, humps, dip, tail, shape:pearson(r.map(v=>v/pk), IDEAL) };
}

function summarize(strokes){
  const withC = strokes.filter(s=>s.curve && s.curve.length>4);
  const ms = withC.map(s=>curveMetrics(s.curve)).filter(Boolean);
  const avgCurve = ms.length ? IDEAL.map((_,i)=>mean(ms.map(m=>m.r[i]))) : [];
  const m = k => mean(ms.map(x=>x[k]));
  // consistency: spread of the normalised curves, where force is meaningful
  let cv = 0;
  if (ms.length>=3){ const vals=[]; for(let i=0;i<50;i++){ const col = ms.map(x=>x.r[i]/x.pk); const mu=mean(col); if (mu>0.3) vals.push(sd(col)/mu); } cv = mean(vals); }
  const dt = mean(strokes.filter(s=>s.driveTime).map(s=>s.driveTime)), rt = mean(strokes.filter(s=>s.recTime).map(s=>s.recTime));
  const dl = mean(strokes.filter(s=>s.driveLen).map(s=>s.driveLen));
  const rate = mean(strokes.filter(s=>s.rate).map(s=>s.rate)), power = mean(strokes.filter(s=>s.power).map(s=>s.power));
  const humpShare = ms.length ? ms.filter(x=>x.humps>1).length/ms.length : 0;
  return { n:strokes.length, nC:ms.length, avgCurve, peakPos:m('peakPos'), ratio:m('ratio'), pickup:m('pickup'), drop:m('drop'), tail:m('tail'), shape:m('shape'), humpShare, dip:m('dip'), cv, dt, rt, dl, rate, power, pk:m('pk') };
}

function findings(su){
  const F = [], H = S.profile.hgt;
  const add = (sev, title, what, why, drill) => F.push({sev, title, what, why, drill});
  if (su.pickup > 0.24) add(su.pickup>0.32?2:1, 'Soft catch',
    `Force reaches half of its peak only after ${Math.round(su.pickup*100)} % of the drive (aim for under 20 %).`,
    'The blade is not locked on when the legs start. The first part of the drive is lost: the handle moves but nothing pushes the boat.',
    '<b>Drill:</b> catch at half slide, 3 × 10 strokes — hang off the handle, feel the load, then push. Think "connect, then drive".');
  if (su.peakPos > 0.52) add(su.peakPos>0.6?2:1, 'Peak comes late',
    `The peak is at ${Math.round(su.peakPos*100)} % of the drive (aim for 35–45 %).`,
    'Back and arms are doing the work that the legs should have done. The legs push softly and the body pulls hard at the end.',
    '<b>Drill:</b> legs only, then legs + back, 5 min each. Keep the arms long until the legs are almost flat.');
  if (su.peakPos < 0.3 && su.drop < 0.75) add(2, 'Early spike, then drop-off',
    `Peak at ${Math.round(su.peakPos*100)} % and the force falls below 30 % already at ${Math.round(su.drop*100)} %.`,
    'Classic slide shooting: the legs kick, the seat runs away and the back does not follow. The handle loses pressure in the middle.',
    '<b>Drill:</b> pause at body-over, then "push the handle with the legs" — the shoulders and the seat must move together for the first third.');
  if (su.humpShare > 0.35) add(su.humpShare>0.6?2:1, 'Two humps in the curve',
    `${Math.round(su.humpShare*100)} % of the strokes show a dip of about ${Math.round(su.dip*100)} % between two peaks.`,
    'There is a gap between the legs and the back opening (or between back and arms). The handle slows down while the next part takes over.',
    '<b>Drill:</b> overlap the phases: start opening the back as the knees pass about 2/3 flat. Row 10 strokes at rate 18 focusing on one long push.');
  if (su.ratio > 2.0) add(1, 'Spiky curve',
    `Peak force is ${fmt(su.ratio,1)} × the average (a full, round curve is about 1.6–1.9 ×).`,
    'Power comes in a short punch instead of a steady push through the whole drive.',
    '<b>Drill:</b> "accelerate the handle all the way to the finish" — 5 min at rate 20 with the PM on the force curve screen, aim for a fat round curve.');
  if (su.tail > 0.14) add(1, 'Long, weak finish',
    `${Math.round(su.tail*100)} % of the work happens in the last fifth of the drive.`,
    'The arms are dragging the handle in slowly at the end instead of finishing the stroke with the back held.',
    '<b>Drill:</b> arms-and-body only, sharp draw to the lower ribs, hands away fast.');
  if (su.cv > 0.12 && su.nC >= 8) add(1, 'Strokes vary a lot',
    `The curve shape varies ${Math.round(su.cv*100)} % from stroke to stroke (aim for under 10 %).`,
    'The technique is not repeatable yet. Every stroke is a little different, so it is hard to build on.',
    '<b>Drill:</b> 3 × 5 min at rate 18–20, same pressure every stroke, eyes on the force curve.');
  if (su.dt && su.rt && su.rate && su.rate < 28 && su.rt/su.dt < 1.6) add(1, 'Rushing the slide',
    `Recovery is only ${fmt(su.rt/su.dt,1)} × the drive at rate ${Math.round(su.rate)} (aim for 2 × or more below rate 26).`,
    'You come up the slide fast and then wait or hit the catch. Speed on the recovery costs energy and shortens the next stroke.',
    '<b>Drill:</b> ratio work — rate 18, count "1" on the drive and "1-2-3" on the recovery.');
  if (su.dl && H){ const want = H*0.0079, lo = want*0.92; if (su.dl < lo) add(1, 'Short stroke',
    `Drive length ${fmt(su.dl,2)} m. For ${H} cm, about ${fmt(want,2)} m is normal.`,
    'Either you are not reaching full compression at the catch (shins vertical), or the finish is cut short.',
    '<b>Drill:</b> pause at the catch with shins vertical and arms long; check the footstretcher height so the knees can come up.'); }
  if (!F.length && su.nC >= 5) add(0, 'Good curve', 'Smooth, single hump, peak in the first half and a quick pickup.', 'Keep this shape as the rate goes up.', '<b>Next:</b> hold the same curve at rate 24 and 28, then in race pieces.');
  return F.sort((a,b)=>b.sev-a.sev);
}
function scoreOf(su){
  let s = 100;
  s -= clamp((su.pickup-0.18)*150,0,20); s -= clamp(Math.abs(su.peakPos-0.4)*120 - 6,0,20);
  s -= clamp((su.humpShare-0.15)*40,0,15); s -= clamp((su.ratio-1.9)*30,0,10); s -= clamp((su.cv-0.08)*120,0,15);
  s -= clamp((su.tail-0.12)*100,0,8); s -= clamp((1-su.shape)*60,0,12);
  return Math.round(clamp(s,0,100));
}

// ---------- charts ----------
function forceChart(curves, opt={}){
  const W=340, H=opt.h||190, L=34, R=10, T=12, B=26;
  const all = curves.flatMap(c=>c.data||[]); const ymax = Math.max(100, ...all, ...(opt.ideal?[opt.ideal]:[]))*1.08;
  const X = x => L + x*(W-L-R), Y = y => T + (1-y/ymax)*(H-T-B);
  const path = (a) => a.map((v,i)=>`${i?'L':'M'}${X(i/(a.length-1)).toFixed(1)} ${Y(v).toFixed(1)}`).join('');
  let g = '';
  const step = ymax>1200 ? 400 : ymax>600 ? 200 : 100;
  for (let v=0; v<ymax; v+=step) g += `<line x1="${L}" y1="${Y(v)}" x2="${W-R}" y2="${Y(v)}" stroke="#eee"/><text x="${L-5}" y="${Y(v)+3}" font-size="9" text-anchor="end" fill="#888">${v}</text>`;
  for (const p of [0,0.25,0.5,0.75,1]) g += `<text x="${X(p)}" y="${H-10}" font-size="9" text-anchor="middle" fill="#888">${Math.round(p*100)}%</text>`;
  g += `<text x="${L}" y="${T-2}" font-size="9" fill="#888">N</text><text x="${W-R}" y="${H-1}" font-size="9" fill="#888" text-anchor="end">drive →</text>`;
  if (opt.ideal) g += `<path d="${path(IDEAL.map(v=>v*opt.ideal))}" fill="none" stroke="${IK}" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  for (const c of curves) if (c.data && c.data.length>1) g += `<path d="${path(c.data)}" fill="${c.fill||'none'}" stroke="${c.col}" stroke-width="${c.w||1.5}" ${c.dash?`stroke-dasharray="${c.dash}"`:''} stroke-linejoin="round"/>`;
  if (opt.marks) for (const m of opt.marks) g += `<line x1="${X(m.x)}" y1="${T}" x2="${X(m.x)}" y2="${H-B}" stroke="${m.col||MG}" stroke-dasharray="2 3"/><text x="${X(m.x)+3}" y="${T+9}" font-size="9" fill="${m.col||MG}">${m.t}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" font-family="Chivo Mono,monospace">${g}</svg>`;
}

function renderLiveChart(){
  const ss = LIVE.strokes.filter(s=>s.curve);
  const last = ss[ss.length-1], prev = ss.slice(-6,-1);
  const curves = prev.map(s=>({data:resample(s.curve,50), col:'#c8c8c8', w:1.2}));
  if (last) curves.push({data:resample(last.curve,50), col:MG, w:3});
  $('lChart').innerHTML = forceChart(curves, {ideal: last ? Math.max(...last.curve) : 0});
  if (!last){ $('lChips').innerHTML = `<p class="hint" style="grid-column:1/-1">${PM.connected||DEMO.on ? 'Take a stroke — the curve of each drive shows up here.' : 'Connect a PM5 or start the demo under <b>PM5</b>.'}</p>`; return; }
  const m = curveMetrics(last.curve), lastS = LIVE.strokes[LIVE.strokes.length-1];
  const chip = (v,l,warn) => `<div class="chip ${warn?'warn':''}"><div class="cv">${v}</div><div class="cl">${l}</div></div>`;
  $('lChips').innerHTML =
    chip(Math.round(m.peakPos*100)+' %', 'peak position · aim 35–45 %', m.peakPos>0.52||m.peakPos<0.3) +
    chip(Math.round(m.pickup*100)+' %', 'to half force · aim < 20 %', m.pickup>0.24) +
    chip(m.humps>1 ? 'two humps' : 'one hump', 'curve shape', m.humps>1) +
    chip(lastS.driveTime&&lastS.recTime ? '1 : '+fmt(lastS.recTime/lastS.driveTime,1) : '–', 'drive : recovery', lastS.rate<28 && lastS.recTime/lastS.driveTime<1.6) +
    chip(lastS.driveLen ? fmt(lastS.driveLen,2)+' m' : '–', 'drive length', false) +
    chip(Math.round(m.pk)+' N', 'peak force · '+Math.round(m.pk/9.81)+' kg', false);
}

function renderTech(sess){
  const strokes = sess ? unpack(sess) : LIVE.strokes;
  const tp = $('techPane');
  const title = sess ? `Session ${new Date(sess.start).toLocaleString('sv-SE',{dateStyle:'short',timeStyle:'short'})}` : 'This session';
  if (strokes.filter(s=>s.curve).length < 3){
    tp.innerHTML = `<h2>${esc(title)}</h2><p class="hint">Row at least a few strokes with a PM5 (or the demo) to get an analysis. Saved sessions are under <b>Log</b>.</p>`; return;
  }
  const use = sess ? strokes : strokes.slice(-20);
  const su = summarize(use), F = findings(su), sc = scoreOf(su);
  const ms = use.filter(s=>s.curve).map(s=>resample(s.curve,50));
  const hi = IDEAL.map((_,i)=>Math.max(...ms.map(m=>m[i]))), lo = IDEAL.map((_,i)=>Math.min(...ms.map(m=>m[i])));
  tp.innerHTML = `<h2>${esc(title)} · ${use.length} strokes${sess?'':' (last 20)'}</h2>
    <div class="score"><div class="sv">${sc}</div><div class="st">technique score<br>${su.rate?Math.round(su.rate)+' s/m · ':''}${su.power?Math.round(su.power)+' W · ':''}${fmtPace(paceFromWatts(su.power))} /500 m</div></div>
    <div style="margin-top:12px">${forceChart([{data:hi,col:'#d6d6d6',w:1},{data:lo,col:'#d6d6d6',w:1},{data:su.avgCurve,col:MG,w:3}], {h:210, ideal:su.pk, marks:[{x:su.peakPos,t:'peak'}]})}</div>
    <div class="legend"><span><i style="background:#FD08FF;height:4px"></i>your average curve</span><span><i style="background:#d6d6d6"></i>highest / lowest stroke</span><span><i style="background:repeating-linear-gradient(90deg,#2e2e2e 0 4px,transparent 4px 7px)"></i>target shape</span></div>
    <div class="chips">
      <div class="chip ${su.peakPos>0.52||su.peakPos<0.3?'warn':''}"><div class="cv">${Math.round(su.peakPos*100)} %</div><div class="cl">peak position</div></div>
      <div class="chip ${su.pickup>0.24?'warn':''}"><div class="cv">${Math.round(su.pickup*100)} %</div><div class="cl">to half force</div></div>
      <div class="chip ${su.ratio>2?'warn':''}"><div class="cv">${fmt(su.ratio,2)}</div><div class="cl">peak ÷ average</div></div>
      <div class="chip ${su.cv>0.12?'warn':''}"><div class="cv">${Math.round(su.cv*100)} %</div><div class="cl">stroke-to-stroke variation</div></div>
      <div class="chip"><div class="cv">${su.dl?fmt(su.dl,2)+' m':'–'}</div><div class="cl">drive length</div></div>
      <div class="chip ${su.rt/su.dt<1.6&&su.rate<28?'warn':''}"><div class="cv">${su.dt?'1 : '+fmt(su.rt/su.dt,1):'–'}</div><div class="cl">drive : recovery</div></div>
    </div>
    <div style="margin-top:16px">${F.map(f=>`<div class="find"><h3>${esc(f.title)}${f.sev?`<span class="sev ${f.sev>1?'hi':''}">${f.sev>1?'work on this':'check'}</span>`:''}</h3><p>${f.what}</p><p style="color:var(--ink-mid)">${f.why}</p><div class="drill">${f.drill}</div></div>`).join('')}</div>`;
}

