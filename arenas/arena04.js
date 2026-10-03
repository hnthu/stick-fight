// Arena 04: Night City Rooftops (Mái nhà thành phố đêm)
// Neon skyline, rooftops at different heights, and a billboard lift in the middle
// that rides up and down and carries whoever stands on it. Drawn entirely in code.
(function () {
  const W = 960, H = 540, FLOOR = 474;

  // Mirror-symmetric around x = 480 so both spawn sides are equal.
  const LIFT = { x: 405, y: 362, w: 150, h: 14, lift: true };
  const LIFT_TOP = 206, LIFT_BOTTOM = 362, LIFT_PERIOD = 7; // seconds per full up/down cycle
  const platforms = [
    { x: 30,  y: 362, w: 210, h: 14 },   // left rooftop
    { x: 720, y: 362, w: 210, h: 14 },   // right rooftop
    LIFT,
  ];

  // Solid terrain: AC units on the main roof, brick chimneys (breakable) on the side roofs.
  const obstacles = [
    { x: 330, y: FLOOR - 46, w: 64, h: 46, kind: 'ac' },
    { x: 566, y: FLOOR - 46, w: 64, h: 46, kind: 'ac' },
    { x: 108, y: 362 - 56, w: 32, h: 56, kind: 'chimney', hp: 40 },
    { x: 820, y: 362 - 56, w: 32, h: 56, kind: 'chimney', hp: 40 },
  ];

  let seed = 404;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // ---------- static layers, painted once ----------
  let sky = null, far = null, near = null;
  const farWindows = [], nearWindows = [];

  function layer() { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }

  function paintSky() {
    sky = layer();
    const g = sky.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, '#07051a'); gr.addColorStop(0.55, '#1b0f3d'); gr.addColorStop(0.85, '#3a1450'); gr.addColorStop(1, '#4a1a4a');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 140; i++) {
      g.globalAlpha = 0.25 + rnd() * 0.6;
      g.fillStyle = '#e8e6ff';
      const s = rnd() < 0.1 ? 2 : 1;
      g.fillRect(rnd() * W, rnd() * H * 0.45, s, s);
    }
    g.globalAlpha = 1;
    // moon with a soft halo
    const mx = 780, my = 78;
    const halo = g.createRadialGradient(mx, my, 10, mx, my, 110);
    halo.addColorStop(0, 'rgba(255,240,220,.35)'); halo.addColorStop(1, 'rgba(255,240,220,0)');
    g.fillStyle = halo; g.fillRect(mx - 120, my - 120, 240, 240);
    g.fillStyle = '#fff3dc'; g.beginPath(); g.arc(mx, my, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(200,180,170,.35)';
    g.beginPath(); g.arc(mx - 9, my - 6, 6, 0, Math.PI * 2); g.arc(mx + 10, my + 9, 4, 0, Math.PI * 2); g.fill();
  }

  function paintFar() {
    far = layer();
    const g = far.getContext('2d');
    let x = -10;
    while (x < W) {
      const bw = 34 + rnd() * 50, bh = 120 + rnd() * 190, top = FLOOR - 60 - bh;
      g.fillStyle = '#160f30'; g.fillRect(x, top, bw, bh + 80);
      if (rnd() < 0.25) { // antenna
        g.fillRect(x + bw / 2 - 1, top - 30, 2, 30);
        farWindows.push({ x: x + bw / 2, y: top - 31, beacon: true, ph: rnd() * 6 });
      }
      for (let wy = top + 8; wy < FLOOR - 70; wy += 11)
        for (let wx = x + 5; wx < x + bw - 6; wx += 9)
          if (rnd() < 0.22) farWindows.push({ x: wx, y: wy, ph: rnd() * 100, col: rnd() < 0.7 ? '#ffd27a' : '#9ad8ff' });
      x += bw + 2 + rnd() * 8;
    }
    // haze over the far skyline
    const hz = g.createLinearGradient(0, FLOOR - 200, 0, FLOOR);
    hz.addColorStop(0, 'rgba(120,40,140,0)'); hz.addColorStop(1, 'rgba(160,50,150,.35)');
    g.fillStyle = hz; g.fillRect(0, FLOOR - 200, W, 200);
  }

  function building(g, x, y, w, col) {
    g.fillStyle = col; g.fillRect(x, y, w, FLOOR - y + 70);
    g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(x, y, w, 3);
  }

  function paintNear() {
    near = layer();
    const g = near.getContext('2d');
    // mid-distance towers behind the arena rooftops
    const mids = [[0, 230, 70], [260, 200, 60], [330, 150, 70], [570, 160, 66], [640, 205, 58], [890, 230, 70]];
    for (const [x, y, w] of mids) {
      building(g, x, y, w, '#211640');
      for (let wy = y + 12; wy < FLOOR - 20; wy += 16)
        for (let wx = x + 7; wx < x + w - 8; wx += 13)
          if (rnd() < 0.35) nearWindows.push({ x: wx, y: wy, ph: rnd() * 100, col: rnd() < 0.6 ? '#ffcf70' : '#ff8fd8' });
    }
    // side rooftops (the platforms' buildings), each with a water tower behind
    for (const p of platforms) {
      if (p.lift) continue;
      const cx = p.x < W / 2 ? p.x + 168 : p.x + p.w - 168, ty = p.y - 120;
      g.strokeStyle = '#2e2350'; g.lineWidth = 4;
      g.beginPath();
      g.moveTo(cx - 26, ty + 50); g.lineTo(cx - 32, p.y);
      g.moveTo(cx + 26, ty + 50); g.lineTo(cx + 32, p.y);
      g.moveTo(cx - 29, ty + 70); g.lineTo(cx + 29, ty + 105);
      g.moveTo(cx + 29, ty + 70); g.lineTo(cx - 29, ty + 105);
      g.stroke();
      g.fillStyle = '#2a1f4a'; g.fillRect(cx - 30, ty + 6, 60, 46);
      g.beginPath(); g.moveTo(cx - 34, ty + 8); g.lineTo(cx, ty - 12); g.lineTo(cx + 34, ty + 8); g.fill();
      g.fillStyle = '#211838';
      for (let i = 0; i < 5; i++) g.fillRect(cx - 30, ty + 12 + i * 8, 60, 2);
      building(g, p.x, p.y, p.w, '#2c2050');
      for (let wy = p.y + 22; wy < FLOOR - 8; wy += 18)
        for (let wx = p.x + 12; wx < p.x + p.w - 14; wx += 22)
          nearWindows.push({ x: wx, y: wy, w: 10, h: 9, ph: rnd() * 100, col: rnd() < 0.5 ? '#e8b862' : '#5aaec8' });
    }
  }

  function ensure() { if (!sky) { paintSky(); paintFar(); paintNear(); } }

  function neonText(ctx, text, x, y, size, col, on) {
    ctx.save();
    ctx.font = `bold ${size}px "Permanent Marker", "Comic Sans MS", cursive`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = col; ctx.shadowBlur = on ? 14 : 0;
    ctx.fillStyle = on ? col : 'rgba(80,60,90,.8)';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  function drawLift(ctx, t) {
    const p = LIFT, cx = p.x + p.w / 2;
    // rails to the top of the frame
    ctx.strokeStyle = '#5b4b8a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(p.x + 8, 0); ctx.lineTo(p.x + 8, FLOOR); ctx.moveTo(p.x + p.w - 8, 0); ctx.lineTo(p.x + p.w - 8, FLOOR); ctx.stroke();
    ctx.strokeStyle = 'rgba(200,190,230,.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - 30, 0); ctx.lineTo(cx - 30, p.y); ctx.moveTo(cx + 30, 0); ctx.lineTo(cx + 30, p.y); ctx.stroke();
    // billboard hanging under the deck
    const by = p.y + p.h, bh = 58;
    ctx.fillStyle = '#120a26'; ctx.fillRect(p.x + 6, by, p.w - 12, bh);
    const flick = Math.sin(t * 23) > -0.95;
    ctx.strokeStyle = flick ? '#ff3fb4' : '#5a2a48'; ctx.lineWidth = 3;
    ctx.save(); ctx.shadowColor = '#ff3fb4'; ctx.shadowBlur = flick ? 12 : 0;
    ctx.strokeRect(p.x + 10, by + 4, p.w - 20, bh - 8); ctx.restore();
    neonText(ctx, 'FIGHT!', cx, by + bh / 2 + 1, 26, '#ffe14d', flick);
    // deck
    ctx.fillStyle = '#6a5a9a'; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#2bf0ff'; ctx.save(); ctx.shadowColor = '#2bf0ff'; ctx.shadowBlur = 10;
    ctx.fillRect(p.x, p.y, p.w, 3); ctx.restore();
    // hazard stripes on the deck edge
    ctx.fillStyle = '#ffd23f';
    for (let i = 0; i < p.w; i += 16) ctx.fillRect(p.x + i, p.y + 6, 8, 4);
  }

  function drawBackground(ctx, t) {
    ensure();
    ctx.drawImage(sky, 0, 0);
    ctx.drawImage(far, 0, 0);
    for (const w of farWindows) {
      if (w.beacon) {
        const on = Math.sin(t * 3 + w.ph) > 0.4;
        ctx.fillStyle = on ? '#ff3344' : '#4a1020';
        ctx.fillRect(w.x - 2, w.y - 2, 4, 4);
      } else {
        const on = Math.sin(t * 0.13 + w.ph) > -0.6;
        ctx.globalAlpha = on ? 0.55 : 0.1;
        ctx.fillStyle = w.col; ctx.fillRect(w.x, w.y, 4, 5);
      }
    }
    ctx.globalAlpha = 1;
    // search lights sweeping the sky
    for (const [x0, sp, ph] of [[300, 0.35, 0], [700, 0.28, 2]]) {
      const a = -Math.PI / 2 + Math.sin(t * sp + ph) * 0.55;
      ctx.save();
      ctx.translate(x0, FLOOR - 60); ctx.rotate(a);
      const gr = ctx.createLinearGradient(0, 0, 420, 0);
      gr.addColorStop(0, 'rgba(160,220,255,.16)'); gr.addColorStop(1, 'rgba(160,220,255,0)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(420, -40); ctx.lineTo(420, 40); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.drawImage(near, 0, 0);
    for (const w of nearWindows) {
      const on = Math.sin(t * 0.21 + w.ph) > -0.4;
      ctx.globalAlpha = on ? 0.5 : 0.1;
      ctx.fillStyle = w.col; ctx.fillRect(w.x, w.y, w.w || 6, w.h || 7);
    }
    ctx.globalAlpha = 1;
    // neon signs on the side buildings, one per side
    neonText(ctx, 'RAMEN', 135, 430, 24, '#ff4fd0', Math.sin(t * 17) > -0.9);
    neonText(ctx, '24H', 825, 430, 26, '#3ff0ff', Math.sin(t * 13 + 1) > -0.9);
    // walkable platform tops (static ones)
    for (const p of platforms) {
      if (p.lift) continue;
      ctx.fillStyle = '#4b3b7c'; ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = '#9b8bd6'; ctx.fillRect(p.x, p.y, p.w, 2);
    }
    drawLift(ctx, t);
    // main rooftop floor
    ctx.fillStyle = '#2a2140'; ctx.fillRect(0, FLOOR, W, H - FLOOR);
    ctx.fillStyle = '#4a3c70'; ctx.fillRect(0, FLOOR, W, 4);
    ctx.fillStyle = 'rgba(255,255,255,.06)';
    for (let x = 0; x < W; x += 48) ctx.fillRect(x, FLOOR + 4, 2, H - FLOOR);
    // skylight and vents on the roof surface
    ctx.fillStyle = '#1a1430'; ctx.fillRect(440, FLOOR + 18, 80, 22);
    ctx.fillStyle = 'rgba(110,230,255,.25)'; ctx.fillRect(444, FLOOR + 22, 72, 14);
    for (const o of obstacles) {
      if (o.kind === 'ac') drawAC(ctx, o, t); else drawChimney(ctx, o, t);
    }
  }

  function drawAC(ctx, o, t) {
    const { x, y, w, h } = o;
    ctx.fillStyle = '#4a4470'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#6c64a0'; ctx.fillRect(x, y, w, 4);
    ctx.fillStyle = '#2a2444'; ctx.fillRect(x + 4, y + h - 4, w - 8, 4);
    // side louvres
    ctx.fillStyle = '#353058';
    for (let i = 0; i < 4; i++) ctx.fillRect(x + 5, y + 10 + i * 8, 14, 3);
    // spinning fan
    const fx = x + w - 22, fy = y + h / 2 + 2, r = 14;
    ctx.fillStyle = '#211c38'; ctx.beginPath(); ctx.arc(fx, fy, r, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(t * 9);
    ctx.fillStyle = '#7d76b0';
    for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI * 2 / 3); ctx.fillRect(-2, 0, 4, r - 2); }
    ctx.restore();
    ctx.strokeStyle = '#8a82c0'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(fx, fy, r, 0, Math.PI * 2); ctx.stroke();
    // tiny status LED
    ctx.fillStyle = Math.sin(t * 2 + x) > 0 ? '#3fff9a' : '#1a4a30'; ctx.fillRect(x + 8, y + 6, 3, 3);
  }

  function drawChimney(ctx, o, t) {
    const { x, w } = o, base = o.y + o.h;
    if (!(o.hp > 0)) { // rubble once smashed
      ctx.fillStyle = '#5a2e3a';
      ctx.fillRect(x - 4, base - 8, 14, 8); ctx.fillRect(x + 12, base - 12, 12, 12); ctx.fillRect(x + 22, base - 6, 14, 6);
      return;
    }
    const y = o.y, h = o.h;
    ctx.fillStyle = '#6a3442'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#4a2230';
    for (let r = 0; r * 8 < h; r++) {
      ctx.fillRect(x, y + r * 8, w, 1.5);
      const off = r % 2 ? 0 : 8;
      for (let c = off; c < w; c += 16) ctx.fillRect(x + c, y + r * 8, 1.5, 8);
    }
    ctx.fillStyle = '#8a4a58'; ctx.fillRect(x - 3, y, w + 6, 6); // cap
    // cracks as it takes damage
    if (o.hp < 40) {
      ctx.strokeStyle = '#1c0c14'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + 6, y + 10); ctx.lineTo(x + 14, y + 24); ctx.lineTo(x + 9, y + 36);
      if (o.hp < 22) { ctx.moveTo(x + w - 5, y + 18); ctx.lineTo(x + 18, y + 32); ctx.lineTo(x + 22, y + 48); }
      ctx.stroke();
    }
    // smoke puffs
    for (let i = 0; i < 4; i++) {
      const k = ((t * 0.35 + i / 4) % 1);
      ctx.fillStyle = `rgba(150,140,180,${0.22 * (1 - k)})`;
      ctx.beginPath(); ctx.arc(x + w / 2 + Math.sin(k * 6 + i) * 6 + k * 14, y - 6 - k * 70, 5 + k * 12, 0, Math.PI * 2); ctx.fill();
    }
  }

  // light rain drifting in front of the fighters
  const drops = [];
  for (let i = 0; i < 70; i++) drops.push({ x: Math.random() * W, y: Math.random() * H, s: 500 + Math.random() * 300 });
  let lastT = null;
  function drawForeground(ctx, t) {
    const dt = lastT === null ? 0 : Math.min(0.05, Math.max(0, t - lastT));
    lastT = t;
    ctx.strokeStyle = 'rgba(170,200,255,.28)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of drops) {
      d.y += d.s * dt; d.x -= d.s * 0.15 * dt;
      if (d.y > H) { d.y = -10; d.x = Math.random() * (W + 60); }
      ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + 3, d.y - 14);
    }
    ctx.stroke();
  }

  // The lift: smooth up/down motion; the engine carries whoever stands on it.
  let liftT = 0;
  function update(dt) {
    liftT += dt || 0;
    const k = (1 - Math.cos((liftT / LIFT_PERIOD) * Math.PI * 2)) / 2; // 0..1..0
    LIFT.y = LIFT_BOTTOM - (LIFT_BOTTOM - LIFT_TOP) * k;
  }

  const arena = {
    id: 'arena04',
    hint: 'Billboard lift, AC units',
    hintVi: 'Bảng quảng cáo nâng hạ, máy lạnh',
    name: 'Night City Rooftops',
    nameVi: 'Mái nhà thành phố đêm',
    gravityScale: 1,
    floorY: FLOOR,
    platforms,
    obstacles,
    drawBackground,
    drawForeground,
    update,
    reset() { liftT = 0; LIFT.y = LIFT_BOTTOM; },
  };
  arena.reset();
  (window.STICK_ARENAS = window.STICK_ARENAS || []).push(arena);
})();
