// ---------- low-poly look: layered faceted landscapes (dusk palette), backgrounds, avatars, gem badges ----------
const LP = {
  sky:   ['#a99bd6','#c9a8d8','#f0b6c6','#f9cdb0','#fde3c4'],     // lilac → pink → peach (calm pastel dusk)
  hills: ['#fbe1d3','#f2c4c8','#d9b0d2','#ab9acb','#7f7ab3','#55558f'], // far → near
  water: ['#8fd3c7','#7ac6bc','#66b6b0','#529fa0'],
  cream: '#fff8ef', ink: '#3b3560', sun:'#fff1d6', gold:'#f7b267', teal:'#4fa3a5', rose:'#ee8a7a', plum:'#55558f',
};
const hexRgb = h => [1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const mixC = (a,b,t) => { const A=hexRgb(a), B=hexRgb(b); return `rgb(${A.map((v,i)=>Math.round(v+(B[i]-v)*t)).join(',')})`; };
const shadeC = (c,k) => { const A = c.startsWith('#') ? hexRgb(c) : c.match(/\d+/g).map(Number); return `rgb(${A.map(v=>Math.round(clamp(v*(1+k),0,255))).join(',')})`; };
const ramp = (stops, t) => { t = clamp(t,0,1)*(stops.length-1); const i = Math.min(stops.length-2, Math.floor(t)); return mixC(stops[i], stops[i+1], t-i); };
function rng(seed){ let s = seed>>>0 || 1; return ()=>((s = (s*1664525 + 1013904223)>>>0) / 4294967296); }
// a triangulated gradient as SVG (used for page and card backgrounds)
function lpSVG(w, h, stops, seed=7, cols=14, rows=9, jit=0.42, var_=0.05){
  const r = rng(seed), pts = [];
  for (let y=0;y<=rows;y++){ const row=[]; for (let x=0;x<=cols;x++){ const ex = x===0||x===cols, ey = y===0||y===rows; row.push([ (x+(ex?0:(r()-0.5)*jit*2))*w/cols, (y+(ey?0:(r()-0.5)*jit*2))*h/rows ]); } pts.push(row); }
  let out = '';
  for (let y=0;y<rows;y++) for (let x=0;x<cols;x++){ const a=pts[y][x], b=pts[y][x+1], c=pts[y+1][x], d=pts[y+1][x+1], flip = r()<0.5;
    for (const tri of flip ? [[a,b,d],[a,d,c]] : [[a,b,c],[b,d,c]]){ const cy = (tri[0][1]+tri[1][1]+tri[2][1])/3; out += `<polygon points="${tri.map(p=>p[0].toFixed(1)+','+p[1].toFixed(1)).join(' ')}" fill="${shadeC(ramp(stops, cy/h), (r()-0.5)*var_*2)}"/>`; } }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" shape-rendering="crispEdges">${out}</svg>`;
}
const lpURL = (...a) => `url("data:image/svg+xml,${encodeURIComponent(lpSVG(...a))}")`;
// a faceted mountain ridge with a lit and a shaded side per peak (Firewatch-style layer)
function lpRidge(seed, n, w, amp){ const r = rng(seed), pts = []; for (let i=0;i<=n;i++) pts.push([i/n*w, (i%2 ? -amp*(0.55+r()*0.45) : -amp*(0.05+r()*0.3))]); return pts; }
function lpMountains(g, W, baseY, amp, col, seed, off, n=8, light=0.07){
  const w = W*1.6, ridge = lpRidge(seed, n*2, w, amp), o = ((off % w) + w) % w;
  for (const dx of [-o, w-o]){
    g.beginPath(); g.moveTo(dx, baseY+2); for (const p of ridge) g.lineTo(dx+p[0], baseY+p[1]); g.lineTo(dx+w, baseY+2); g.closePath(); g.fillStyle = col; g.fill();
    for (let i=1;i<ridge.length-1;i+=2){ const a = ridge[i-1], p = ridge[i], b = ridge[i+1];
      g.beginPath(); g.moveTo(dx+p[0], baseY+p[1]); g.lineTo(dx+a[0], baseY+a[1]); g.lineTo(dx+(a[0]+p[0])/2, baseY+2); g.closePath(); g.fillStyle = shadeC(col, light); g.fill();
      g.beginPath(); g.moveTo(dx+p[0], baseY+p[1]); g.lineTo(dx+b[0], baseY+b[1]); g.lineTo(dx+(p[0]+b[0])/2+8, baseY+2); g.closePath(); g.fillStyle = shadeC(col, -light); g.fill(); }
  }
}
function lpPine(g, x, y, h, col){ const w = h*0.42; for (let k=0;k<3;k++){ const yy = y - k*h*0.28, ww = w*(1-k*0.25); g.beginPath(); g.moveTo(x, yy-h*0.45); g.lineTo(x-ww/2, yy); g.lineTo(x, yy-h*0.08); g.closePath(); g.fillStyle = shadeC(col,0.08); g.fill(); g.beginPath(); g.moveTo(x, yy-h*0.45); g.lineTo(x+ww/2, yy); g.lineTo(x, yy-h*0.08); g.closePath(); g.fillStyle = shadeC(col,-0.08); g.fill(); } }
function lpSky(g, W, H){ const gr = g.createLinearGradient(0,0,0,H); LP.sky.forEach((c,i)=>gr.addColorStop(i/(LP.sky.length-1), c)); g.fillStyle = gr; g.fillRect(0,0,W,H); }
function lpSun(g, x, y, r){ const gl = g.createRadialGradient(x,y,r*0.6,x,y,r*3); gl.addColorStop(0,'rgba(255,226,176,.55)'); gl.addColorStop(1,'rgba(255,226,176,0)'); g.fillStyle = gl; g.fillRect(x-r*3,y-r*3,r*6,r*6);
  g.beginPath(); for (let i=0;i<10;i++){ const a = i/10*Math.PI*2; g.lineTo(x+Math.cos(a)*r, y+Math.sin(a)*r); } g.closePath(); g.fillStyle = LP.sun; g.fill(); }

// ---- low-poly avatars (faceted head, cap and simple geometric face) ----
const AV_CAPS2 = ['#e07a55','#2f8a8c','#ffb547','#7aa36b','#8b6bb0','#d9603b','#3f5f9e','#b3527a','#26294a','#efe6d8'];
const AV_SKIN2 = ['#f6d7bd','#e8b993','#c98e66','#8f5c3e','#5c3a28'];
function avatarSVG(av, size=72){
  av = av || {}; const cap = AV_CAPS2[av.c||0], skin = AV_SKIN2[av.s||0], I = LP.ink, L = c=>shadeC(c,0.12), D = c=>shadeC(c,-0.14);
  // octagon head split into 8 facets, lit from the upper left
  const cx=50, cy=54, R=34, pts = Array.from({length:8},(_,i)=>{ const a = -Math.PI/2 + (i+0.5)/8*Math.PI*2; return [cx+Math.cos(a)*R, cy+Math.sin(a)*R*1.05]; });
  const shades = [0.10,0.02,-0.08,-0.16,-0.12,-0.02,0.08,0.14];
  let head = pts.map((p,i)=>{ const q = pts[(i+1)%8]; return `<polygon points="${cx},${cy} ${p[0].toFixed(1)},${p[1].toFixed(1)} ${q[0].toFixed(1)},${q[1].toFixed(1)}" fill="${shadeC(skin, shades[i])}"/>`; }).join('');
  const capP = `<polygon points="16,46 22,26 38,15 62,15 78,26 84,46" fill="${cap}"/><polygon points="16,46 22,26 38,15 50,46" fill="${L(cap)}"/><polygon points="62,15 78,26 84,46 50,46" fill="${D(cap)}"/><polygon points="78,40 98,44 84,50" fill="${D(cap)}"/>`;
  const eyes = av.f===3 ? `<polygon points="28,52 72,52 68,62 54,62 50,57 46,62 32,62" fill="${I}"/>`
    : av.f===4 ? `<polygon points="36,56 42,52 44,60" fill="${I}"/><polygon points="56,57 66,55 66,58 56,60" fill="${I}"/>`
    : av.f===1 ? `<polygon points="35,58 45,55 45,60 35,61" fill="${I}"/><polygon points="55,55 65,58 65,61 55,60" fill="${I}"/>`
    : `<polygon points="40,52 45,57 40,62 35,57" fill="${I}"/><polygon points="60,52 65,57 60,62 55,57" fill="${I}"/>`;
  const mouth = av.f===2 ? `<polygon points="48,70 54,70 51,75" fill="${I}"/>` : av.f===1 ? `<polygon points="40,72 60,72 58,75 42,75" fill="${I}"/>` : `<polygon points="38,68 62,68 56,76 44,76" fill="${I}"/>`;
  const acc = [ '',
    `<polygon points="14,44 86,44 86,50 14,50" fill="#fff6ec"/><polygon points="14,44 6,40 8,52 14,50" fill="#efe6d8"/>`,
    `<polygon points="36,67 50,63 64,67 58,70 50,67 42,70" fill="${I}"/>`,
    `<polygon points="30,52 46,52 46,62 30,62" fill="none" stroke="${I}" stroke-width="3"/><polygon points="54,52 70,52 70,62 54,62" fill="none" stroke="${I}" stroke-width="3"/><line x1="46" y1="56" x2="54" y2="56" stroke="${I}" stroke-width="3"/>`,
    `<polygon points="50,88 38,82 38,94" fill="${cap}"/><polygon points="50,88 62,82 62,94" fill="${D(cap)}"/>`,
    `<polygon points="80,52 84,60 80,64 76,60" fill="#bfe3ef"/>` ][av.a||0];
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="av"><polygon points="20,96 80,96 50,88" fill="rgba(38,41,74,.18)"/>${head}${capP}${eyes}${mouth}${acc}</svg>`;
}
// ---- gem badges: a faceted hexagonal crystal with a line icon ----
function badgeSVG(key, on=true, size=64){
  const [ic, col] = BADGE_ART[key] || ['star','#ffb547'], c = on ? col : '#d8d2c8';
  const P = Array.from({length:6},(_,i)=>{ const a = -Math.PI/2 + i/6*Math.PI*2; return [50+Math.cos(a)*42, 50+Math.sin(a)*42]; });
  const inner = Array.from({length:6},(_,i)=>{ const a = -Math.PI/2 + i/6*Math.PI*2; return [50+Math.cos(a)*26, 50+Math.sin(a)*26]; });
  const sh = [0.22,0.08,-0.12,-0.22,-0.06,0.14];
  let facets = P.map((p,i)=>{ const q = P[(i+1)%6], a = inner[i], b = inner[(i+1)%6]; return `<polygon points="${[p,q,b,a].map(v=>v.map(n=>n.toFixed(1)).join(',')).join(' ')}" fill="${shadeC(c, sh[i])}"/>`; }).join('');
  facets += `<polygon points="${inner.map(v=>v.map(n=>n.toFixed(1)).join(',')).join(' ')}" fill="${shadeC(c,0.04)}"/>`;
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="bdg${on?'':' off'}">${facets}
    <g stroke="${on?'#fff6ec':'#f3efe8'}" fill="none" stroke-linecap="round" stroke-linejoin="round" stroke-width="4" transform="translate(50 50) scale(.62) translate(-50 -48)">${ICONS[ic].replace(/fill="#f8eed5"/g,'fill="none"').replace(/fill="#1b130d"/g,'fill="#fff6ec"')}</g></svg>`;
}

// paint the faceted dusk backdrop behind the game screens
function applyLp(ids){ const stops = ['#8f84c8','#b9a2d6','#e8b0c6','#f6c6b1','#fcdcc0'];
  ids.forEach((id,i)=>{ const el = document.getElementById(id); if (!el) return; el.classList.add('lpbg'); el.style.backgroundImage = lpURL(1600, 1000, stops, 3+i*11, 18, 11); }); }

// QR code as an SVG (vector, sharp at any size on a TV); generator bundled in qrlib.js
function qrSVG(text, dark='#3b3560', light='#fff8ef'){ const q = qrcode(0, 'M'); q.addData(text); q.make(); const n = q.getModuleCount(), m = 2; let d = '';
  for (let r=0;r<n;r++) for (let c=0;c<n;c++) if (q.isDark(r,c)) d += `M${c+m} ${r+m}h1v1h-1z`;
  return `<svg viewBox="0 0 ${n+2*m} ${n+2*m}" shape-rendering="crispEdges" class="qr" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="${light}"/><path d="${d}" fill="${dark}"/></svg>`; }
