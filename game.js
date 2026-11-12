// ---------- self-competition: personal bests, own normal, XP, levels, streaks, badges, highlights ----------
const PB_DISTS = [500, 1000, 2000, 5000, 6000, 10000];
const RANKS = ['Deckhand','Bow seat','Engine room','Stroke seat',"Cox's pride",'Regatta hero','River legend','Ocean crosser'];
const xpNeed = lv => Math.round(300*Math.pow(lv,1.6));                 // XP needed to reach level lv+1 from 0
const isErg = s => (s.kind||'erg')==='erg' && !(s.summary && s.summary.demo);
const stdDist = d => PB_DISTS.find(x => d>=x*0.98 && d<=x*1.03);
const median = a => { if (!a.length) return null; const b=[...a].sort((x,y)=>x-y), m=b.length>>1; return b.length%2 ? b[m] : (b[m-1]+b[m])/2; };
const weekKey = t => { const d = new Date(t); d.setHours(0,0,0,0); d.setDate(d.getDate()-((d.getDay()+6)%7)); return d.getTime(); };
const BADGES = {
  first:   { t:'First strokes',  d:'Saved your first session' },
  ten:     { t:'Regular',        d:'10 sessions' },
  fifty:   { t:'Workhorse',      d:'50 sessions' },
  km100:   { t:'100 km club',    d:'100 km rowed' },
  km500:   { t:'500 km club',    d:'500 km rowed' },
  pb:      { t:'Personal best',  d:'Beat your own best at a standard distance' },
  smooth:  { t:'Smooth operator',d:'Technique score 90 or more' },
  early:   { t:'Early peak',     d:'Force peak in the first 42% of the drive' },
  streak3: { t:'Three-week streak', d:'2+ sessions a week, three weeks running' },
  streak8: { t:'Eight-week streak', d:'2+ sessions a week, eight weeks running' },
  zone60:  { t:'Zone keeper',    d:'60+ minutes of UT2/UT1 in one week' },
  finisher:{ t:'Finisher',       d:'Rowed a whole coached workout' },
  combo25: { t:'Combo 25',       d:'25 good strokes in a row in a workout' },
  combo50: { t:'Combo 50',       d:'50 good strokes in a row in a workout' },
  perfect10:{ t:'Perfect ten',   d:'10 PERFECT strokes in a row' },
  metronome:{ t:'Metronome',     d:'20 strokes in a row exactly on the rate' },
  sharp:   { t:'Sharpshooter',   d:'90% accuracy over a whole workout' },
};
// Walk the sessions in time order and record what each one achieved compared with everything before it.
function progress(sessions){
  const ss = [...sessions].filter(s=>s.started_at).sort((a,b)=>a.started_at.localeCompare(b.started_at));
  const P = { xp:0, level:0, pbs:{}, badges:{}, events:[], km:0, n:0, streak:0, weeks:{}, normal:null, tech:null };
  const ergW = [], ergT = [];
  for (const s of ss){
    const t = new Date(s.started_at).getTime(), ev = [], pre = { w:median(ergW.slice(-10)), tech:ergT.length>=3 ? mean(ergT.slice(-10)) : null };
    let xp = 20 + Math.round((s.distance||0)/100);
    P.n++; P.km += (s.distance||0)/1000;
    const wk = weekKey(t); P.weeks[wk] = P.weeks[wk] || { n:0, zmin:0 }; P.weeks[wk].n++;
    const zs = s.summary && s.summary.zoneSec; if (zs) P.weeks[wk].zmin += ((zs.UT2||0)+(zs.UT1||0))/60; else if (s.zone==='UT2'||s.zone==='UT1') P.weeks[wk].zmin += (s.duration||0)/60;
    if (isErg(s)){
      const d = stdDist(s.distance||0);
      if (d && s.duration){ const tt = s.duration*d/s.distance, old = P.pbs[d];
        if (!old || tt < old.time){ P.pbs[d] = { time:tt, at:s.started_at, prev:old?old.time:null }; if (old){ ev.push({ k:'pb', d, time:tt, gain:old.time-tt }); xp += 60; } } }
      if (s.avg_power && pre.w && s.avg_power >= pre.w*1.03) ev.push({ k:'watts', pct:(s.avg_power/pre.w-1)*100, w:s.avg_power, base:pre.w });
      if (s.score!=null && pre.tech!=null && s.score >= pre.tech+5) ev.push({ k:'tech', score:s.score, gain:s.score-pre.tech });
      if (s.avg_power) ergW.push(s.avg_power); if (s.score!=null) ergT.push(s.score);
      if (s.score>=90) ev.push({ k:'badge', b:'smooth' }); if (s.summary && s.summary.peakPos && s.summary.peakPos<=0.42) ev.push({ k:'badge', b:'early' });
    }
    // streak: consecutive weeks with 2+ sessions, counted back from this session's week
    let st = 0; for (let w = wk; P.weeks[w] && P.weeks[w].n>=2; w -= 7*864e5) st++;
    if (st > P.streak && st >= 2) ev.push({ k:'streak', weeks:st }); P.streak = st;
    if (P.n===1) ev.push({ k:'badge', b:'first' }); if (P.n===10) ev.push({ k:'badge', b:'ten' }); if (P.n===50) ev.push({ k:'badge', b:'fifty' });
    if (P.km>=100) ev.push({ k:'badge', b:'km100' }); if (P.km>=500) ev.push({ k:'badge', b:'km500' });
    if (ev.some(e=>e.k==='pb')) ev.push({ k:'badge', b:'pb' }); if (st>=3) ev.push({ k:'badge', b:'streak3' }); if (st>=8) ev.push({ k:'badge', b:'streak8' });
    if (P.weeks[wk].zmin>=60) ev.push({ k:'badge', b:'zone60' });
    const gm = s.summary && s.summary.game;
    if (gm){ if (gm.done) ev.push({ k:'badge', b:'finisher' }); if (gm.maxCombo>=25) ev.push({ k:'badge', b:'combo25' }); if (gm.maxCombo>=50) ev.push({ k:'badge', b:'combo50' });
      if (gm.maxP>=10) ev.push({ k:'badge', b:'perfect10' }); if (gm.maxBeat>=20) ev.push({ k:'badge', b:'metronome' }); if (gm.acc>=0.9 && gm.n>=30) ev.push({ k:'badge', b:'sharp' }); xp += Math.round((gm.score||0)/100); }
    const real = [];
    for (const e of ev){ if (e.k==='badge'){ if (P.badges[e.b]) continue; P.badges[e.b] = s.started_at; xp += 40; } real.push(e); }
    P.xp += xp; let lv = P.level; while (P.xp >= xpNeed(lv+1)) lv++; if (lv > P.level){ real.push({ k:'level', level:lv, rank:rankOf(lv) }); P.level = lv; }
    for (const e of real) P.events.push({ ...e, at:s.started_at, sid:s.id });
  }
  // the current streak only counts if this week or last week is still alive
  const nowWk = weekKey(Date.now()); if (!(P.weeks[nowWk] && P.weeks[nowWk].n>=2) && !(P.weeks[nowWk-7*864e5] && P.weeks[nowWk-7*864e5].n>=2)) P.streak = 0;
  P.normal = median(ergW.slice(-10)); P.tech = ergT.length ? mean(ergT.slice(-10)) : null;
  P.toNext = xpNeed(P.level+1) - P.xp; P.lvFrac = (P.xp - xpNeed(P.level)) / (xpNeed(P.level+1) - xpNeed(P.level));
  return P;
}
const rankOf = lv => RANKS[Math.min(RANKS.length-1, Math.floor(lv/3))] + ' ' + ['I','II','III'][lv%3];
// Your own target pace for a distance: your PB there, else predicted from your other bests, else your normal watts.
function ghostPace(P, dist){
  if (P.pbs[dist]) return { pace:P.pbs[dist].time/(dist/500), src:'your best '+dist+' m' };
  let best = null; for (const d in P.pbs){ const p = P.pbs[d].time/(d/500) + 5*Math.log2(dist/d); if (!best || p<best) best = p; }
  if (best) return { pace:best, src:'predicted from your bests' };
  if (P.normal) return { pace:500*Math.cbrt(2.8/P.normal), src:'your normal watts' };
  return null;
}
// Text for one achievement, used on the big screen and on the phone.
function evText(e){
  switch (e.k){
    case 'pb': return { big:'New PB!', line:`${e.d} m · ${fmtTime(e.time)}`, sub:`${fmt(e.gain,1)} s faster than before` };
    case 'watts': return { big:`+${Math.round(e.pct)}%`, line:`${Math.round(e.w)} W average`, sub:`vs own normal ${Math.round(e.base)} W` };
    case 'tech': return { big:'Cleaner stroke', line:`Technique ${e.score}`, sub:`+${Math.round(e.gain)} on own average` };
    case 'streak': return { big:`${e.weeks}-week streak`, line:'2+ sessions every week', sub:'' };
    case 'level': return { big:'Level up!', line:`Level ${e.level} · ${e.rank}`, sub:'' };
    case 'badge': return { big:BADGES[e.b].t, line:BADGES[e.b].d, sub:'New badge' };
    case 'ghost': return { big:'Beat the ghost', line:`${fmt(e.gain,1)} s ahead of ${e.src}`, sub:'' };
    case 'live': return { big:`+${Math.round(e.pct)}%`, line:'above own normal right now', sub:`${Math.round(e.w)} W vs ${Math.round(e.base)} W` };
  }
  return { big:'', line:'', sub:'' };
}
const EV_W = { pb:10, ghost:9, level:8, watts:6, tech:6, streak:5, badge:3, live:7 };
