// ---------- workouts (step plans), stroke judging, avatars, badge art, rowing style ----------
const FOCUS = {
  shape: { t:'Shape',  d:'Match the target curve' },
  rate:  { t:'Rhythm', d:'Hit the notes: stay on the stroke rate' },
  power: { t:'Power',  d:'Hold the power band, keep the shape' },
  easy:  { t:'Easy',   d:'Breathe, row light, no scoring' },
};
const PLANS = [
  { id:'shape', name:'Shape school', d:'Learn the force curve, then keep it as rate and pressure go up.', steps:[
    { n:'Warm-up', type:'time', v:300, focus:'easy', rate:[18,20] },
    { n:'Find the shape', type:'time', v:240, focus:'shape', rate:[18,20] },
    { n:'Easy', type:'time', v:60, focus:'easy', rate:[18,20] },
    { n:'Shape at pace', type:'time', v:240, focus:'shape', rate:[20,22] },
    { n:'Easy', type:'time', v:60, focus:'easy', rate:[18,20] },
    { n:'Shape under pressure', type:'time', v:180, focus:'power', rate:[24,26], pw:[100,110] },
    { n:'Cool-down', type:'time', v:180, focus:'easy', rate:[18,20] } ] },
  { id:'ladder', name:'Rhythm ladder', d:'Climb the rates one step at a time. Every stroke is a note.', steps:[
    { n:'Warm-up', type:'time', v:240, focus:'easy', rate:[18,20] },
    { n:'Rate 18', type:'time', v:120, focus:'rate', rate:[18,18] }, { n:'Rate 20', type:'time', v:120, focus:'rate', rate:[20,20] },
    { n:'Rate 22', type:'time', v:120, focus:'rate', rate:[22,22] }, { n:'Rate 24', type:'time', v:120, focus:'rate', rate:[24,24] },
    { n:'Rate 26', type:'time', v:60, focus:'rate', rate:[26,26] }, { n:'Cool-down', type:'time', v:180, focus:'easy', rate:[18,20] } ] },
  { id:'p250', name:'Power 6 × 250 m', d:'Short, hard pieces. Points for power inside your own band with a clean curve.', steps:[
    { n:'Warm-up', type:'time', v:300, focus:'easy', rate:[18,22] },
    ...Array.from({length:6}, (_,i)=>[{ n:`250 m · ${i+1} of 6`, type:'dist', v:250, focus:'power', rate:[28,32], pw:[115,135] }, { n:'Rest', type:'time', v:90, focus:'easy', rate:[16,20] }]).flat(),
    { n:'Cool-down', type:'time', v:180, focus:'easy', rate:[18,20] } ] },
  { id:'steady', name:'Steady 20', d:'Twenty minutes of UT2 with the shape on. Long combos win here.', steps:[
    { n:'Warm-up', type:'time', v:180, focus:'easy', rate:[18,20] }, { n:'Steady state', type:'time', v:1200, focus:'shape', rate:[18,20] }, { n:'Cool-down', type:'time', v:120, focus:'easy', rate:[18,20] } ] },
  { id:'demo', name:'Quick demo · 3 min', d:'One short step of each kind, to try the system.', steps:[
    { n:'Warm-up', type:'time', v:20, focus:'easy', rate:[18,22] }, { n:'Find the shape', type:'time', v:45, focus:'shape', rate:[20,24] },
    { n:'Rhythm', type:'time', v:40, focus:'rate', rate:[22,22] }, { n:'Power band', type:'time', v:40, focus:'power', rate:[22,26], pw:[95,115] }, { n:'Cool-down', type:'time', v:20, focus:'easy', rate:[18,20] } ] },
];
const stepTarget = st => `${st.rate ? (st.rate[0]===st.rate[1] ? `rate ${st.rate[0]}` : `rate ${st.rate[0]}–${st.rate[1]}`) : ''}${st.pw ? ` · ${st.pw[0]}–${st.pw[1]}% of your normal` : ''}`;
const stepLen = st => st.type==='dist' ? `${st.v} m` : fmtTime(st.v).replace(/\.\d$/,'');

// ---- judging one stroke ----
const GRADES = ['MISS','GOOD','GREAT','PERFECT'], GCOL = ['#9a8f99','#2f8a8c','#7aa36b','#ffb547'], GPTS = [0,40,70,100];
function shapeGrade(curve){
  if (!curve || curve.length < 6) return null;
  const r = smooth3(resample(curve, IDEAL.length)), c = pearson(r, IDEAL), m = curveMetrics(curve), pp = m ? m.peakPos : 0.4;
  const off = Math.max(0, Math.abs(pp - 0.41) - 0.05);                       // peak 36–46% is free
  const q = c - off*0.6 - (m && m.humps ? 0.03 : 0);
  return { g: q>=0.967 ? 3 : q>=0.94 ? 2 : q>=0.86 ? 1 : 0, q, pp };
}
function rateGrade(rate, tr){ if (!tr || !rate) return null; const lo = tr[0]-0.5, hi = tr[1]+0.5, d = rate<lo ? lo-rate : rate>hi ? rate-hi : 0; return { g: d===0 ? 3 : d<=1 ? 2 : d<=2 ? 1 : 0, d:rate<lo?-d:d }; }
function powerGrade(w, normal, pw){ if (!pw || !w || !normal) return null; const p = w/normal*100, d = p<pw[0] ? pw[0]-p : p>pw[1] ? p-pw[1] : 0; return { g: d===0 ? 3 : d<=4 ? 2 : d<=9 ? 1 : 0, p }; }
function judge(s, step, normal){
  if (!step || step.focus==='easy') return null;
  const sh = shapeGrade(s.curve), ra = rateGrade(s.rate, step.rate), pw = powerGrade(s.power, normal, step.pw);
  let g, why = '';
  if (step.focus==='rate') g = ra ? ra.g : 0;
  else if (step.focus==='power') g = Math.round(0.6*(pw?pw.g:sh?sh.g:0) + 0.4*(sh?sh.g:0) - 0.01);
  else g = Math.round(0.75*(sh?sh.g:0) + 0.25*(ra?ra.g:3) - 0.01);
  if (sh && sh.g<2 && step.focus!=='rate') why = sh.pp>0.47 ? 'Legs first: peak comes late' : sh.pp<0.33 ? 'Smoother catch: peak too early' : 'Keep the push even';
  else if (ra && ra.g<2) why = ra.d<0 ? 'Rate up a little' : 'Rate down a little';
  else if (pw && pw.g<2) why = pw.p < step.pw[0] ? 'A bit more pressure' : 'Ease off, stay in the band';
  return { g, why, sh, ra, pw };
}
// combo, multiplier and score for a run of judged strokes
function newRun(){ return { score:0, combo:0, maxCombo:0, n:0, hits:[0,0,0,0], streakP:0, maxP:0, onBeat:0, maxBeat:0 }; }
function scoreStroke(R, j){
  R.n++; R.hits[j.g]++;
  R.combo = j.g ? R.combo+1 : 0; R.maxCombo = Math.max(R.maxCombo, R.combo);
  R.streakP = j.g===3 ? R.streakP+1 : 0; R.maxP = Math.max(R.maxP, R.streakP);
  R.onBeat = j.ra && j.ra.g===3 ? R.onBeat+1 : 0; R.maxBeat = Math.max(R.maxBeat, R.onBeat);
  const mult = Math.min(4, 1 + Math.floor(R.combo/10)); R.score += GPTS[j.g]*mult; R.mult = mult;
  R.acc = (R.hits[1]*0.4 + R.hits[2]*0.7 + R.hits[3]) / R.n;
  return R;
}

// ---- avatars: rubber-hose rower heads ----
const AV_CAPS = ['#c8352b','#2f6f86','#e0a526','#5b8c3a','#8a4f9e','#d9762b','#3d5a9e','#a83a62','#1b130d','#e8e0cc'];
const AV_SKIN = ['#f3d9b1','#e2b98f','#c48c62','#8d5a3b','#5e3a24'];
const AV_FACE = ['Grin','Grit','Whistle','Cool','Wink'], AV_ACC = ['None','Headband','Moustache','Glasses','Bow','Sweat'];
const avDefault = id => { let h=0; for (const ch of String(id)) h = (h*31 + ch.charCodeAt(0))>>>0; return { c:h%8, s:(h>>>3)%5, f:(h>>>6)%5, a:(h>>>9)%6 }; };
function avatarSVG(av, size=72){
  av = av || {}; const cap = AV_CAPS[av.c||0], skin = AV_SKIN[av.s||0], I = '#1b130d';
  const eyes = av.f===3 ? `<rect x="28" y="40" width="44" height="12" rx="5" fill="${I}"/><rect x="33" y="42" width="8" height="3" fill="#fff"/>`
    : av.f===4 ? `<ellipse cx="40" cy="45" rx="8" ry="12" fill="#fff" stroke="${I}" stroke-width="2.5"/><ellipse cx="40" cy="46" rx="5" ry="9" fill="${I}"/><path d="M54 47 q6 -5 12 0" stroke="${I}" stroke-width="4" fill="none" stroke-linecap="round"/>`
    : `<ellipse cx="40" cy="45" rx="8" ry="12" fill="#fff" stroke="${I}" stroke-width="2.5"/><ellipse cx="60" cy="45" rx="8" ry="12" fill="#fff" stroke="${I}" stroke-width="2.5"/><ellipse cx="40" cy="46" rx="5" ry="9" fill="${I}"/><ellipse cx="60" cy="46" rx="5" ry="9" fill="${I}"/><path d="M40 46 L37 38 A9 9 0 0 1 42 37.6Z" fill="#fff"/><path d="M60 46 L57 38 A9 9 0 0 1 62 37.6Z" fill="#fff"/>`;
  const mouth = av.f===1 ? `<path d="M37 66 h26" stroke="${I}" stroke-width="4" stroke-linecap="round"/><path d="M40 63 v6 M47 63 v6 M54 63 v6 M60 63 v6" stroke="${I}" stroke-width="2"/>`
    : av.f===2 ? `<circle cx="52" cy="66" r="5" fill="${I}"/>`
    : `<path d="M34 61 Q50 78 66 61" stroke="${I}" stroke-width="4" fill="#fff" stroke-linejoin="round"/>`;
  const acc = [ '',
    `<rect x="16" y="30" width="68" height="9" rx="3" fill="#fff" stroke="${I}" stroke-width="3"/><path d="M16 34 l-8 6 M16 34 l-9 -2" stroke="${I}" stroke-width="3"/>`,
    `<path d="M33 60 q8 -7 17 0 q9 -7 17 0 q-8 6 -17 2 q-9 4 -17 -2z" fill="${I}"/>`,
    `<circle cx="40" cy="46" r="11" fill="none" stroke="${I}" stroke-width="3.5"/><circle cx="62" cy="46" r="11" fill="none" stroke="${I}" stroke-width="3.5"/><path d="M51 45 h0" stroke="${I}" stroke-width="3.5"/>`,
    `<path d="M50 74 l-10 -6 v13 z M50 74 l10 -6 v13 z" fill="${cap}" stroke="${I}" stroke-width="2.5" stroke-linejoin="round"/><circle cx="50" cy="74" r="3" fill="${I}"/>`,
    `<path d="M80 34 q5 8 0 11 q-5 -3 0 -11z" fill="#bfe3ef" stroke="${I}" stroke-width="2"/>` ][av.a||0];
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="av"><circle cx="50" cy="52" r="38" fill="${skin}" stroke="${I}" stroke-width="4"/>
    <path d="M13 46 A38 38 0 0 1 87 46 Z" fill="${cap}" stroke="${I}" stroke-width="4" stroke-linejoin="round"/><path d="M84 44 q12 1 14 7 q-8 1 -16 -2" fill="${cap}" stroke="${I}" stroke-width="3.5" stroke-linejoin="round"/>
    ${(av.a===1)?'':''}${eyes}${mouth}${acc}</svg>`;
}

// ---- badge art (rosettes with an icon, Freeletics-style collection) ----
const BADGE_ART = {
  first:['flag','#5b8c3a'], ten:['boat','#2f6f86'], fifty:['boat','#3d5a9e'], km100:['wave','#2f6f86'], km500:['wave','#3d5a9e'], pb:['bolt','#c8352b'],
  smooth:['curve','#8a4f9e'], early:['curve','#d9762b'], streak3:['flame','#d9762b'], streak8:['flame','#c8352b'], zone60:['heart','#a83a62'],
  combo25:['star','#e0a526'], combo50:['star','#c8352b'], sharp:['target','#5b8c3a'], finisher:['flag','#3d5a9e'], metronome:['metro','#2f6f86'], perfect10:['crown','#e0a526'],
};
const ICONS = {
  flag:'<path d="M42 30 v42" stroke-width="5"/><path d="M42 31 q14 -6 24 2 v16 q-10 -8 -24 -2z" fill="#f8eed5"/>',
  boat:'<path d="M26 54 q24 14 48 0 l-4 -4 q-20 8 -40 0z" fill="#f8eed5"/><path d="M44 28 l14 24" stroke-width="4"/><circle cx="46" cy="36" r="6" fill="#f8eed5"/>',
  wave:'<path d="M26 44 q6 -8 12 0 t12 0 t12 0 t12 0 M26 58 q6 -8 12 0 t12 0 t12 0 t12 0" fill="none" stroke-width="5"/>',
  bolt:'<path d="M55 24 l-18 30 h12 l-6 24 l20 -32 h-12z" fill="#f8eed5"/>',
  curve:'<path d="M28 66 q8 -40 22 -40 t22 40" fill="none" stroke-width="6"/><path d="M28 66 h44" stroke-width="3"/>',
  flame:'<path d="M50 24 q16 18 10 32 q-2 -8 -8 -10 q2 12 -8 18 q-12 -8 -6 -22 q2 8 6 8 q-6 -14 6 -26z" fill="#f8eed5"/>',
  heart:'<path d="M50 70 q-24 -16 -20 -30 q4 -12 20 -4 q16 -8 20 4 q4 14 -20 30z" fill="#f8eed5"/>',
  star:'<path d="M50 24 l7 15 l16 2 l-12 11 l3 16 l-14 -8 l-14 8 l3 -16 l-12 -11 l16 -2z" fill="#f8eed5"/>',
  target:'<circle cx="50" cy="48" r="20" fill="#f8eed5"/><circle cx="50" cy="48" r="11" fill="none" stroke-width="4"/><circle cx="50" cy="48" r="3" fill="#1b130d"/>',
  metro:'<path d="M40 70 l6 -44 h8 l6 44z" fill="#f8eed5"/><path d="M50 62 l12 -26" stroke-width="4"/><circle cx="62" cy="36" r="4" fill="#1b130d"/>',
  crown:'<path d="M28 62 l-2 -28 l12 12 l12 -18 l12 18 l12 -12 l-2 28z" fill="#f8eed5"/>',
};
function badgeSVG(key, on=true, size=64){
  const [ic, col] = BADGE_ART[key] || ['star','#e0a526'], c = on ? col : '#cfc4ad', I = on ? '#1b130d' : '#a89c84';
  let sc = ''; for (let i=0;i<16;i++){ const a = i/16*Math.PI*2; sc += `<circle cx="${50+36*Math.cos(a)}" cy="${48+36*Math.sin(a)}" r="9"/>`; }
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="bdg${on?'':' off'}">
    <path d="M34 72 l-8 24 l10 -5 l6 8 l8 -22z M66 72 l8 24 l-10 -5 l-6 8 l-8 -22z" fill="${on?'#c8352b':'#ddd3bd'}" stroke="${I}" stroke-width="3" stroke-linejoin="round"/>
    <g fill="${c}" stroke="${I}" stroke-width="3">${sc}</g><circle cx="50" cy="48" r="36" fill="${c}"/>
    <circle cx="50" cy="48" r="29" fill="${c}" stroke="${I}" stroke-width="3"/><circle cx="50" cy="48" r="25" fill="none" stroke="${on?'#f8eed5':'#e8dfcb'}" stroke-width="1.5" stroke-dasharray="3 3"/>
    <g stroke="${I}" stroke-linecap="round" stroke-linejoin="round" stroke-width="3" transform="translate(0 2)">${ICONS[ic]}</g></svg>`;
}

// ---- rowing style and who you are like ----
const STYLES = {
  hammer:   { t:'The Hammer',    d:'Big, early hit off the catch. Watch that the finish does not fade.' },
  diesel:   { t:'The Diesel',    d:'Full, even push from catch to finish. The textbook shape.' },
  bloomer:  { t:'The Late Bloomer', d:'Force arrives late: the back and arms do the work. Push with the legs first.' },
  metronome:{ t:'The Metronome', d:'Every stroke looks the same. Consistency is your weapon.' },
  wildcard: { t:'The Wildcard',  d:'Lots of different strokes. Find one shape and repeat it.' },
};
function styleOf(f){ if (!f) return null;
  if (f.cv > 0.11 || f.hump > 0.35) return 'wildcard';
  if (f.pp < 0.37) return 'hammer'; if (f.pp > 0.47) return 'bloomer';
  if (f.cv < 0.05) return 'metronome'; return 'diesel'; }
// features from saved sessions plus (optionally) this workout's strokes
function featuresOf(sessions, live){
  const e = sessions.filter(s=>isErg(s) && s.summary && s.summary.peakPos!=null).slice(0,12);
  const pick = k => e.map(s=>s.summary[k]).filter(v=>v!=null);
  const f = { pp:mean(pick('peakPos')), pu:mean(pick('pickup')), hump:mean(pick('humpShare')), cv:mean(pick('cv')), w:median(e.map(s=>s.avg_power).filter(Boolean)) || 0, rate:mean(e.map(s=>s.avg_rate).filter(Boolean)) || 20, n:e.length };
  if (live){ for (const k of ['pp','pu','hump','cv']) if (live[k]!=null) f[k] = f.n ? (f[k]*0.6 + live[k]*0.4) : live[k]; if (live.w) f.w = f.w ? (f.w+live.w)/2 : live.w; if (live.rate) f.rate = live.rate; }
  return (f.pp || f.n) ? f : null;
}
function likeness(a, b, ba, bb){
  const d = Math.hypot((a.pp-b.pp)/0.06, (a.pu-b.pu)/0.06, (a.hump-b.hump)/0.25, (a.cv-b.cv)/0.06, (Math.log((a.w||200)/(b.w||200)))/0.25, (a.rate-b.rate)/3);
  const ka = new Set(ba||[]), kb = new Set(bb||[]), uni = new Set([...ka,...kb]).size, inter = [...ka].filter(x=>kb.has(x)).length, jac = uni ? inter/uni : 0.5;
  return Math.round(100 * (0.8*Math.exp(-d*d/8) + 0.2*jac));
}
