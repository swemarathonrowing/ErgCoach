// ---------- Games: low-poly dusk river (canvas), Firewatch-style layers ----------
const GFX = (()=>{
  const PAL = ['#e07a55','#2f8a8c','#ffb547','#7aa36b','#8b6bb0','#d9603b','#3f5f9e','#b3527a'];
  const FONT = "'Josefin Sans', 'Avenir Next', sans-serif";
  let cv, g, W = 900, H = 400, raf = 0, last = 0, scroll = 0, lanes = [], state = {}, sm = {}, waterTris = null;
  const LH = 118, SKY = 190, X0 = 176, FIN = 96;
  function mount(el){ if (!cv || !el.contains(cv)){ el.innerHTML=''; cv = document.createElement('canvas'); cv.id='gfx'; el.appendChild(cv); g = cv.getContext('2d'); } if (!raf) raf = requestAnimationFrame(frame); }
  function set(l, s){ lanes = l; state = s; for (const x of l) if (!sm[x.name]) sm[x.name] = { f:x.frac, ph:Math.random() }; }
  function stop(){ cancelAnimationFrame(raf); raf = 0; }
  function text(s, x, y, size, col, align='left', weight=700, ls=0){ g.font = `${weight} ${size}px ${FONT}`; g.textAlign = align; g.textBaseline = 'middle'; g.fillStyle = col; if ('letterSpacing' in g) g.letterSpacing = ls+'px'; g.fillText(s, x, y); if ('letterSpacing' in g) g.letterSpacing = '0px'; }
  function poly(pts, col){ g.beginPath(); pts.forEach((p,i)=>i?g.lineTo(p[0],p[1]):g.moveTo(p[0],p[1])); g.closePath(); g.fillStyle = col; g.fill(); }
  // ---- scenery ----
  function scenery(t){
    lpSky(g, W, SKY+20); lpSun(g, W*0.72, SKY-46, 34);
    lpMountains(g, W, SKY-6, 120, LP.hills[0], 11, scroll*0.04, 6, 0.05);
    lpMountains(g, W, SKY+2, 90, LP.hills[1], 23, scroll*0.09, 7, 0.06);
    lpMountains(g, W, SKY+6, 62, LP.hills[2], 37, scroll*0.18, 9, 0.07);
    // pine shore, nearest layer
    const off = scroll*0.45, sp = 34, col = LP.hills[4];
    g.fillStyle = col; g.fillRect(0, SKY-4, W, 14);
    for (let i=-1; i<W/sp+2; i++){ const k = Math.floor(off/sp)+i, x = i*sp - (off % sp), h = 34 + ((k*7919)%5)*7; lpPine(g, x, SKY+4, h, col); }
    // haze over the far layers
    const hz = g.createLinearGradient(0, SKY-120, 0, SKY+10); hz.addColorStop(0,'rgba(255,197,138,0)'); hz.addColorStop(1,'rgba(255,197,138,.18)'); g.fillStyle = hz; g.fillRect(0, SKY-120, W, 130);
  }
  function water(i, y, t){
    const r = rng(100+i), cols = 18, cw = W/cols*1.25, off = (scroll*1.2 + i*40) % cw;
    for (let c=-1; c<cols+2; c++){ const x = c*cw - off;
      for (let k=0;k<2;k++){ const base = LP.water[(i+k)%2], tri = k ? [[x,y],[x+cw,y],[x+cw*0.55,y+LH]] : [[x,y],[x+cw*0.55,y+LH],[x-cw*0.45,y+LH]];
        poly(tri, shadeC(base, (r()-0.5)*0.12)); }
      poly([[x+cw*0.55,y+LH],[x+cw,y],[x+cw*1.55,y+LH]], shadeC(LP.water[(i+1)%2], (r()-0.5)*0.1)); }
    // shimmer
    g.strokeStyle = 'rgba(255,226,176,.28)'; g.lineWidth = 2;
    for (let s=0;s<6;s++){ const sx = ((s*173 + i*61 - scroll*1.6) % (W+80) + W+80) % (W+80) - 40, sy = y + 20 + ((s*37+i*13) % (LH-30)); g.beginPath(); g.moveTo(sx,sy); g.lineTo(sx+18+(s%3)*8, sy); g.stroke(); }
    // lane line of diamond buoys
    const bo = (scroll*1.2) % 42; for (let x=-bo; x<W; x+=42){ poly([[x,y+LH-5],[x+5,y+LH],[x,y+LH+5],[x-5,y+LH]], Math.round((x+bo)/42 + scroll*1.2/42)%2 ? LP.cream : LP.rose); }
  }
  function finish(t){
    const fx = W-FIN, top = SKY-30, bot = SKY+lanes.length*LH;
    poly([[fx-4,top],[fx+4,top],[fx+4,bot],[fx-4,bot]], LP.ink);
    poly([[fx+30,top],[fx+38,top],[fx+38,bot],[fx+30,bot]], shadeC(LP.ink,0.25));
    for (let k=0;k<4;k++){ const x = fx+4+k*6.5, sway = Math.sin(t/300+k)*2; poly([[x,top+2],[x+6.5,top+2],[x+3.2,top+14+sway]], k%2?LP.gold:LP.cream); }
    for (let yy=top+20; yy<bot; yy+=16){ poly([[fx-4,yy],[fx+4,yy+4],[fx-4,yy+8]], LP.cream); }
    text('FINISH', fx+18, top-10, 10, LP.cream, 'center', 700, 2);
  }
  // ---- a geometric rower in a faceted shell. Rowers face the stern: the boat runs right, feet point left ----
  function rower(bx, wy, col, ph, ghost){
    const drive = ph < 0.36, p = drive ? ph/0.36 : (ph-0.36)/0.64;
    const s = drive ? p : 1 - (p<0.5 ? 2*p*p : 1-Math.pow(-2*p+2,2)/2);
    const sc = 1.3; g.save(); g.translate(bx, wy); g.scale(sc, sc);
    const slide = -12 + 26*Math.min(1, s*1.25), lean = -(0.5 - 0.9*s);
    const hip = [slide, -14], sh = [hip[0]+Math.sin(lean)*24, hip[1]-Math.cos(lean)*24], head = [sh[0]+Math.sin(lean)*10, sh[1]-Math.cos(lean)*10];
    const a = 0.85 - 1.7*s, piv = [4,-16], blade = [piv[0]+56*Math.sin(a)-24, drive ? 6 : -6 - Math.sin(p*Math.PI)*5], hand = [piv[0]-20*Math.sin(a)+4*s, piv[1]-3-(drive?0:3)];
    // reflection
    if (!ghost){ g.save(); g.globalAlpha = 0.18; g.scale(1,-0.35); poly([[-58,-2],[64,-4],[74,-8],[52,8],[-46,10]], shadeC(col,-0.3)); g.restore(); }
    // far oar
    g.strokeStyle = shadeC(LP.ink,0.4); g.lineWidth = 2; g.beginPath(); g.moveTo(hand[0]+5,hand[1]+2); g.lineTo(blade[0]+9,blade[1]-2); g.stroke();
    // hull: deck, side, bow facets
    poly([[-58,-9],[64,-11],[74,-12],[52,-2],[-46,0],[-64,-6]], shadeC(col,-0.12));
    poly([[-58,-9],[64,-11],[74,-12],[30,-14],[-40,-13]], shadeC(col,0.16));
    poly([[52,-2],[74,-12],[64,-11]], shadeC(col,-0.3));
    // legs
    const ft = [-34,-12], knee = [(hip[0]+ft[0])/2 - 2, Math.min(hip[1],ft[1]) - (26 - 22*Math.min(1,s*1.25))];
    g.strokeStyle = LP.ink; g.lineWidth = 5; g.lineJoin = 'miter'; g.beginPath(); g.moveTo(hip[0],hip[1]); g.lineTo(knee[0],knee[1]); g.lineTo(ft[0],ft[1]); g.stroke();
    // torso: two facets
    const nx = Math.cos(lean)*7, ny = Math.sin(lean)*7;
    poly([[hip[0]-nx,hip[1]-ny],[hip[0]+nx,hip[1]+ny],[sh[0]+nx*0.8,sh[1]+ny*0.8],[sh[0]-nx*0.8,sh[1]-ny*0.8]], col);
    poly([[hip[0],hip[1]],[hip[0]+nx,hip[1]+ny],[sh[0]+nx*0.8,sh[1]+ny*0.8],[sh[0],sh[1]]], shadeC(col,-0.15));
    // near oar with rhombus blade
    g.strokeStyle = LP.cream; g.lineWidth = 2.5; g.beginPath(); g.moveTo(hand[0],hand[1]); g.lineTo(blade[0],blade[1]); g.stroke();
    const ang = Math.atan2(blade[1]-hand[1], blade[0]-hand[0]); g.save(); g.translate(blade[0],blade[1]); g.rotate(ang); poly([[-2,0],[8,-4],[16,0],[8,4]], col); g.restore();
    if (drive && p < 0.25 && !ghost){ for (let i=0;i<4;i++) poly([[blade[0]-6+i*4, 2-p*20-i*3],[blade[0]-4+i*4, -2-p*20-i*3],[blade[0]-2+i*4, 2-p*20-i*3]], 'rgba(255,246,236,.8)'); }
    // arm
    g.strokeStyle = LP.ink; g.lineWidth = 4; g.beginPath(); g.moveTo(sh[0],sh[1]+2); g.lineTo((sh[0]+hand[0])/2+2, (sh[1]+hand[1])/2+5); g.lineTo(hand[0],hand[1]); g.stroke();
    // head: octagon with a lit half, cap in boat colour
    const R = 8; const oct = Array.from({length:8},(_,k)=>{ const t2 = k/8*Math.PI*2+Math.PI/8; return [head[0]+Math.cos(t2)*R, head[1]+Math.sin(t2)*R]; });
    poly(oct, '#f0c9a6'); poly([oct[2],oct[3],oct[4],oct[5],oct[6],[head[0],head[1]]], '#e2b08b');
    poly([[head[0]-R,head[1]-1],[head[0]-R*0.7,head[1]-R*0.8],[head[0]+R*0.7,head[1]-R*0.8],[head[0]+R,head[1]-1]], shadeC(col,0.05));
    poly([[head[0]-R,head[1]-1],[head[0]-R-7,head[1]+1],[head[0]-R,head[1]+2]], shadeC(col,-0.2));
    g.restore();
  }
  function tag(x, y, s, col=LP.ink){ g.font = `700 13px ${FONT}`; const w = g.measureText(s).width + 16; poly([[x-w/2,y-11],[x+w/2,y-11],[x+w/2,y+11],[x+5,y+11],[x,y+17],[x-5,y+11],[x-w/2,y+11]], 'rgba(59,53,96,.78)'); text(s, x, y+1, 13, LP.cream, 'center'); }
  function gem(x, y, n){ const col = n===1 ? LP.gold : n===2 ? '#cfd6de' : '#d98a5a', P = Array.from({length:6},(_,i)=>{ const a = -Math.PI/2+i/6*Math.PI*2; return [x+Math.cos(a)*18, y+Math.sin(a)*18]; });
    P.forEach((p,i)=>poly([[x,y],p,P[(i+1)%6]], shadeC(col, [0.2,0.08,-0.1,-0.22,-0.08,0.12][i]))); text(String(n), x, y+2, 16, LP.ink, 'center'); }
  function label(l, y, col){ g.font = `700 13px ${FONT}`; const nm = l.name.toUpperCase(); const w = Math.min(150, g.measureText(nm).width + 34);
    poly([[10,y],[10+w,y],[10+w+10,y+14],[10+w,y+28],[10,y+28]], 'rgba(59,53,96,.72)'); poly([[10,y],[18,y],[18,y+28],[10,y+28]], col);
    g.save(); g.beginPath(); g.rect(22,y,w-8,28); g.clip(); text(nm, 26, y+15, 13, LP.cream, 'left', 700, 1.5); g.restore();
    if (l.sub){ text(l.sub.slice(0,24), 12, y+44, 10, 'rgba(255,246,236,.85)', 'left', 400, 0.5); } }
  // ---- overlays ----
  let lpBg = null;
  function card(t, big, small, kicker){
    if (!lpBg || lpBg.w!==W || lpBg.h!==H){ const im = new Image(); im.src = 'data:image/svg+xml,'+encodeURIComponent(lpSVG(W,H,['#8f84c8','#b9a2d6','#e8b0c6','#f6c6b1'],5,16,10)); lpBg = { w:W, h:H, im }; }
    g.save(); g.globalAlpha = 0.94; if (lpBg.im.complete) g.drawImage(lpBg.im, 0, 0, W, H); else { g.fillStyle = LP.ink; g.fillRect(0,0,W,H); } g.restore();
    const pulse = 1 + Math.max(0, 0.18 - ((t % 1000)/1000)*0.5);
    if (kicker) text(kicker.toUpperCase(), W/2, H/2-86, 15, 'rgba(255,246,236,.8)', 'center', 400, 6);
    g.save(); g.translate(W/2, H/2-10); g.scale(pulse, pulse); text(big, 0, 0, big.length>4 ? 72 : 130, LP.cream, 'center', 700, big.length>4?4:0); g.restore();
    if (small) text(small.toUpperCase(), W/2, H/2+74, 16, LP.gold, 'center', 600, 4);
  }
  // ---- main loop ----
  function frame(now){
    raf = 0; if (!cv || !document.body.contains(cv) || !cv.offsetParent) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now-(last||now))/1000); last = now;
    const dpr = window.devicePixelRatio||1, cw = cv.parentElement.clientWidth, ch = SKY + Math.max(1,lanes.length)*LH + 30;
    if (cv.width !== Math.round(cw*dpr) || cv.height !== Math.round(ch*dpr)){ cv.width=Math.round(cw*dpr); cv.height=Math.round(ch*dpr); cv.style.width=cw+'px'; cv.style.height=ch+'px'; }
    W = cw; H = ch; g.setTransform(dpr,0,0,dpr,0,0);
    const going = state.go && !state.done, avgRate = lanes.length ? mean(lanes.map(l=>l.rate||0)) : 0;
    scroll += dt * (going ? 30 + avgRate*2 : 6);
    scenery(now);
    lanes.forEach((l,i)=>water(i, SKY+10+i*LH, now));
    g.fillStyle = LP.water[3]; g.fillRect(0, SKY+10+lanes.length*LH, W, 30);
    if (state.finish!==false) finish(now);
    const x1 = W - FIN - 100;
    lanes.forEach((l,i)=>{
      const m = sm[l.name] || (sm[l.name]={f:l.frac,ph:0}); m.f += (clamp(l.frac,0,1) - m.f) * Math.min(1, dt*1.6);
      m.ph = (m.ph + (going && l.rate ? dt*l.rate/60 : dt*0.05)) % 1;
      const y = SKY+10 + i*LH, wy = y + 84, bx = X0 + 70 + m.f*(x1 - X0 - 70), col = l.col || PAL[i%PAL.length];
      if (l.ghost!=null){ const gx = X0 + 70 + clamp(l.ghost,0,1)*(x1 - X0 - 70); g.save(); g.globalAlpha = 0.3; rower(gx, wy, '#fff6ec', (m.ph+0.5)%1, true); g.restore(); text('GHOST', gx, wy+22, 9, 'rgba(255,246,236,.6)', 'center', 700, 3); }
      rower(bx, wy, col, m.ph);
      label(l, y+12, col);
      tag(Math.min(bx+120, W-FIN-40), wy-58, l.res);
      if (l.place) gem(W-FIN+60, y+56, l.place);
      if (l.ok) poly([[bx+96,wy-40],[bx+102,wy-34],[bx+96,wy-28],[bx+90,wy-34]], LP.gold);
    });
    // title and clock
    text((state.title||'').toUpperCase(), 22, 30, 14, 'rgba(255,246,236,.85)', 'left', 400, 5);
    if (state.clock) text(state.clock, 20, 68, 44, LP.cream, 'left', 700, 1);
    if (state.count != null) card(now, String(state.count), state.sub||'', 'On your marks');
    else if (state.go && now - state.goAt < 1400){ g.save(); g.globalAlpha = Math.max(0, 1 - (now-state.goAt)/1400); card(now, 'ROW', null, 'Go'); g.restore(); }
    else if (state.done && state.winner) card(now, 'FINISH', state.winner, 'Well rowed');
  }
  return { mount, set, stop, PAL };
})();
