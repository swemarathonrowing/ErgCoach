'use strict';
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = (v, d=1) => (v==null || isNaN(v)) ? '–' : (+v).toFixed(d);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mean = a => a.length ? a.reduce((s,x)=>s+x,0)/a.length : 0;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x=>(x-m)**2))); };
const LBF = 4.44822;                       // PM5 reports force in pounds
const MG = '#FD08FF', IK = '#2e2e2e';
const fmtPace = s => (!s || !isFinite(s) || s>=600) ? '–:––' : `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}.${Math.floor((s*10)%10)}`;
const paceFromWatts = w => w>0 ? 500*Math.cbrt(2.8/w) : 0;    // Concept2 formula

function toast(t){ const e=$('toast'); e.textContent=t; e.classList.add('show'); clearTimeout(toast.h); toast.h=setTimeout(()=>e.classList.remove('show'),1800); }


const HOOKS = { stroke:[], status:[] };
