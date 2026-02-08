// wx-fx.js
// NetWatch Weather — ambient canvas FX (rain/snow/fog/dust)
//
// Usage:
//   import { createWXFX } from './wx-fx.js'
//   const fx = createWXFX(document.getElementById('wx-fx'));
//   fx.set({ mode: 'rain', intensity: 0.6, windMph: 8 });

export function createWXFX(canvas) {
  const ctx = canvas.getContext('2d', { alpha: true });
  const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  const reduced = () => !!mq?.matches;

  let w = 1, h = 1;
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = canvas.getBoundingClientRect();
    w = Math.max(1, Math.floor(r.width));
    h = Math.max(1, Math.floor(r.height));
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const P = [];
  const MAX = 220;
  let state = { mode: 'dust', intensity: 0, windMph: 0, opacity: 0.55 };

  const clamp01 = (x) => Math.max(0, Math.min(1, x));
  const rnd = (a, b) => a + Math.random() * (b - a);

  function wantCount() {
    const i = clamp01(state.intensity);
    if (state.mode === 'rain') return Math.floor(50 + i * 170);
    if (state.mode === 'snow') return Math.floor(30 + i * 120);
    if (state.mode === 'fog') return Math.floor(6 + i * 16);
    return Math.floor(10 + i * 22);
  }

  function spawn() {
    if (P.length >= MAX) return;
    const m = state.mode;
    if (m === 'rain') P.push({ x: rnd(-w*0.2, w*1.2), y: rnd(-h, 0), vx: rnd(0.2,0.6), vy: rnd(8,16), len: rnd(10,22), a: rnd(0.08,0.16) });
    else if (m === 'snow') P.push({ x: rnd(0,w), y: rnd(-h,0), vx: rnd(-0.4,0.4), vy: rnd(0.8,1.8), r: rnd(0.8,2.2), wob: rnd(0,Math.PI*2), a: rnd(0.10,0.22) });
    else if (m === 'fog') P.push({ x: rnd(-w*0.2, w*1.2), y: rnd(h*0.15,h*0.75), vx: rnd(0.12,0.35), r: rnd(80,170), a: rnd(0.015,0.03) });
    else P.push({ x: rnd(0,w), y: rnd(0,h), vx: rnd(-0.05,0.12), vy: rnd(-0.08,0.05), r: rnd(0.6,1.8), a: rnd(0.02,0.06) });
  }

  function draw(p) {
    ctx.globalAlpha = p.a * state.opacity;
    ctx.fillStyle = '#fff';
    if (state.mode === 'rain') {
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * p.len, p.y - p.vy * 0.6);
      ctx.stroke();
    } else if (state.mode === 'snow' || state.mode === 'dust') {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    } else if (state.mode === 'fog') {
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
      g.addColorStop(0, 'rgba(255,255,255,0.18)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  let lastT = performance.now();
  function step(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;

    ctx.clearRect(0, 0, w, h);
    if (reduced() || state.intensity <= 0.01) {
      requestAnimationFrame(step);
      return;
    }

    const want = wantCount();
    while (P.length < want) spawn();
    while (P.length > want) P.pop();

    const wind = (state.windMph || 0) / 30; // ~0..1-ish

    for (const p of P) {
      if (state.mode === 'rain') {
        p.x += (p.vx + wind * 6) * 60 * dt;
        p.y += p.vy * 60 * dt;
        draw(p);
        if (p.y > h + 20 || p.x > w + 60) { p.x = rnd(-w*0.2, w*1.2); p.y = rnd(-120, -20); }
      } else if (state.mode === 'snow') {
        p.wob += dt * (1.2 + wind);
        p.x += (p.vx + Math.sin(p.wob) * 0.35 + wind * 0.8) * 60 * dt;
        p.y += p.vy * 60 * dt;
        draw(p);
        if (p.y > h + 10) { p.y = rnd(-80, -10); p.x = rnd(0, w); }
        if (p.x < -20) p.x = w + 20;
        if (p.x > w + 20) p.x = -20;
      } else if (state.mode === 'fog') {
        p.x += (p.vx + wind * 0.9) * 60 * dt;
        draw(p);
        if (p.x > w + p.r) { p.x = -p.r; p.y = rnd(h*0.15, h*0.75); }
      } else {
        p.x += (p.vx + wind * 0.25) * 60 * dt;
        p.y += p.vy * 60 * dt;
        draw(p);
        if (p.x > w + 10) p.x = -10;
        if (p.x < -10) p.x = w + 10;
        if (p.y > h + 10) p.y = -10;
        if (p.y < -10) p.y = h + 10;
      }
    }

    requestAnimationFrame(step);
  }

  function set(next) {
    state = { ...state, ...next, intensity: clamp01(next.intensity ?? state.intensity) };
  }

  resize();
  window.addEventListener('resize', resize, { passive: true });
  requestAnimationFrame(step);

  return { set, resize };
}
