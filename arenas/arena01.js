// Arena 01 — Mountain Temple (Đền trên núi)
// Misty peaks, a pagoda whose roofs are the platforms, falling cherry blossoms.
// Terrain: breakable stone lanterns by each side hall and a bronze bell in the centre. No hazards.
(function () {
  const W = 960, H = 540, FLOOR = 474;
  const PLATFORMS = [
    { x: 110, y: 362, w: 190, h: 14 },  // left side-hall roof
    { x: 660, y: 362, w: 190, h: 14 },  // right side-hall roof
    { x: 385, y: 252, w: 190, h: 14 },  // central pagoda roof
  ];
  // solid terrain: two breakable stone lanterns guarding the side halls, an unbreakable bronze bell in the centre
  const OBSTACLES = [
    { x: 92, y: FLOOR - 74, w: 36, h: 74, kind: 'lantern', hp: 40, maxHp: 40 },
    { x: W - 92 - 36, y: FLOOR - 74, w: 36, h: 74, kind: 'lantern', hp: 40, maxHp: 40 },
    { x: 448, y: FLOOR - 62, w: 64, h: 62, kind: 'bell' },
  ];
  const alive = o => !(o.broken || o.dead || o.removed || (o.hp != null && o.hp <= 0));

  // seeded random so the scenery is identical every load
  let seed = 11;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // ---------- static scenery, painted once ----------
  let sky = null;
  function paintSky() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const b = c.getContext('2d');
    const g = b.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#1d2136'); g.addColorStop(0.4, '#4a3f5c'); g.addColorStop(0.7, '#8a6070'); g.addColorStop(1, '#a8766e');
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    // pale moon
    b.fillStyle = 'rgba(255,240,220,.85)';
    b.beginPath(); b.arc(790, 92, 34, 0, Math.PI * 2); b.fill();
    b.fillStyle = 'rgba(255,240,220,.12)';
    b.beginPath(); b.arc(790, 92, 58, 0, Math.PI * 2); b.fill();
    for (let i = 0; i < 70; i++) {
      b.globalAlpha = 0.2 + rnd() * 0.5;
      b.fillStyle = '#fff';
      b.fillRect(rnd() * W, rnd() * H * 0.35, 1.5, 1.5);
    }
    b.globalAlpha = 1;
    // three ridges of peaks, far to near
    const ridge = (base, amp, col, peaks) => {
      b.fillStyle = col;
      b.beginPath(); b.moveTo(0, H);
      const step = W / peaks;
      b.lineTo(0, base);
      for (let i = 0; i < peaks; i++) {
        const x = i * step;
        b.lineTo(x + step * (0.3 + rnd() * 0.3), base - amp * (0.5 + rnd() * 0.5));
        b.lineTo(x + step, base - amp * rnd() * 0.25);
      }
      b.lineTo(W, H); b.closePath(); b.fill();
    };
    ridge(300, 170, '#4c4a6a', 5);
    ridge(360, 140, '#3d3c58', 6);
    ridge(420, 110, '#2f2f46', 8);
    // stone courtyard floor
    const fg = b.createLinearGradient(0, FLOOR, 0, H);
    fg.addColorStop(0, '#5b4f4a'); fg.addColorStop(1, '#2e2826');
    b.fillStyle = fg; b.fillRect(0, FLOOR, W, H - FLOOR);
    b.strokeStyle = 'rgba(0,0,0,.35)'; b.lineWidth = 2;
    b.beginPath(); b.moveTo(0, FLOOR + 1); b.lineTo(W, FLOOR + 1); b.stroke();
    b.strokeStyle = 'rgba(0,0,0,.18)'; b.lineWidth = 1.5;
    for (let row = 0; row < 3; row++) {
      const y = FLOOR + 18 + row * 18;
      b.beginPath(); b.moveTo(0, y); b.lineTo(W, y); b.stroke();
      for (let x = (row % 2) * 30; x < W; x += 60) { b.beginPath(); b.moveTo(x, y - 18); b.lineTo(x, y); b.stroke(); }
    }
    b.fillStyle = 'rgba(255,220,190,.25)'; b.fillRect(0, FLOOR, W, 2);
    // temple
    drawTemple(b);
    return c;
  }

  // a curved east-asian roof whose top edge is the platform surface
  function roof(b, p, depth) {
    const { x, y, w } = p, over = 22;
    b.fillStyle = '#7a2a26';
    b.beginPath();
    b.moveTo(x - over, y + depth + 6);
    b.quadraticCurveTo(x + 8, y + depth - 2, x + 6, y);
    b.lineTo(x + w - 6, y);
    b.quadraticCurveTo(x + w - 8, y + depth - 2, x + w + over, y + depth + 6);
    b.closePath(); b.fill();
    // tile ridges
    b.strokeStyle = 'rgba(0,0,0,.25)'; b.lineWidth = 1.5;
    for (let i = x + 16; i < x + w - 10; i += 14) { b.beginPath(); b.moveTo(i, y + 3); b.lineTo(i, y + depth); b.stroke(); }
    // ridge cap = the walkable edge
    b.fillStyle = '#3a2220'; b.fillRect(x, y - 2, w, 6);
    b.fillStyle = 'rgba(255,214,140,.55)'; b.fillRect(x, y - 2, w, 2);
    // upturned eave tips
    b.fillStyle = '#d8a548';
    b.beginPath(); b.arc(x - over, y + depth + 4, 3.5, 0, Math.PI * 2); b.arc(x + w + over, y + depth + 4, 3.5, 0, Math.PI * 2); b.fill();
  }

  function hall(b, p, bodyTop, bottom) {
    const inset = 14;
    b.fillStyle = '#5e4f47';
    b.fillRect(p.x + inset, bodyTop, p.w - inset * 2, bottom - bodyTop);
    // red pillars
    b.fillStyle = '#7d2620';
    const n = 4;
    for (let i = 0; i < n; i++) {
      const px = p.x + inset + 4 + i * ((p.w - inset * 2 - 14) / (n - 1));
      b.fillRect(px, bodyTop, 10, bottom - bodyTop);
    }
    // warm lit doorway
    const dw = 40, dx = p.x + p.w / 2 - dw / 2;
    b.fillStyle = 'rgba(232,160,80,.55)'; b.fillRect(dx, bottom - 58, dw, 58);
    b.fillStyle = 'rgba(80,30,20,.5)'; b.fillRect(dx + dw / 2 - 1, bottom - 58, 2, 58);
    // base step
    b.fillStyle = '#6e625a'; b.fillRect(p.x + 4, bottom - 6, p.w - 8, 6);
  }

  function drawTemple(b) {
    const [L, R, M] = PLATFORMS;
    // central pagoda body runs from its roof down to the floor, behind the side halls
    hall(b, { x: M.x + 10, w: M.w - 20 }, M.y + 30, FLOOR);
    // middle tier band
    b.fillStyle = '#7a2a26'; b.fillRect(M.x - 4, M.y + 110, M.w + 8, 12);
    b.fillStyle = '#d8a548'; b.fillRect(M.x - 4, M.y + 110, M.w + 8, 2);
    roof(b, M, 30);
    // spire on top of the pagoda (decor only, behind fighters)
    b.fillStyle = '#d8a548';
    b.fillRect(M.x + M.w / 2 - 2, M.y - 46, 4, 44);
    for (let i = 0; i < 3; i++) { b.beginPath(); b.arc(M.x + M.w / 2, M.y - 12 - i * 12, 5 - i, 0, Math.PI * 2); b.fill(); }
    // side halls
    for (const p of [L, R]) { hall(b, p, p.y + 28, FLOOR); roof(b, p, 28); }
    // cherry trees framing the scene, behind the halls' edges
    for (const [tx, s] of [[18, 1], [W - 18, -1]]) {
      b.strokeStyle = '#3b2622'; b.lineWidth = 9; b.lineCap = 'round';
      b.beginPath(); b.moveTo(tx, FLOOR); b.quadraticCurveTo(tx + s * 10, FLOOR - 120, tx + s * 50, FLOOR - 190); b.stroke();
      b.lineWidth = 4;
      b.beginPath(); b.moveTo(tx + s * 18, FLOOR - 130); b.lineTo(tx + s * 80, FLOOR - 160); b.stroke();
      for (let i = 0; i < 60; i++) {
        b.fillStyle = `rgba(${245 + rnd() * 10 | 0},${160 + rnd() * 50 | 0},${190 + rnd() * 30 | 0},${0.55 + rnd() * 0.35})`;
        b.beginPath();
        b.arc(tx + s * (20 + rnd() * 90), FLOOR - 150 - rnd() * 80, 6 + rnd() * 10, 0, Math.PI * 2);
        b.fill();
      }
    }
  }

  // ---------- animated layers ----------
  const mist = Array.from({ length: 6 }, (_, i) => ({ y: 250 + i * 34, x: rnd() * W, s: 8 + rnd() * 14, w: 260 + rnd() * 200, a: 0.06 + rnd() * 0.06 }));
  const petals = Array.from({ length: 46 }, () => ({ x: rnd() * W, y: rnd() * H, vy: 22 + rnd() * 26, vx: 10 + rnd() * 18, ph: rnd() * 6.28, r: 2.5 + rnd() * 2.5 }));

  function drawLantern(ctx, o, t) {
    const cx = o.x + o.w / 2, top = o.y, bot = o.y + o.h;
    const dmg = o.maxHp ? 1 - Math.max(0, o.hp) / o.maxHp : 0;
    ctx.fillStyle = 'rgba(15,10,10,.55)'; ctx.fillRect(o.x - 1, top + 10, o.w + 2, o.h - 10);  // dark backing so it reads against the halls
    ctx.fillStyle = '#9a8c80';
    ctx.fillRect(o.x + 2, bot - 8, o.w - 4, 8);              // base
    ctx.fillRect(cx - 7, top + 34, 14, o.h - 42);            // post
    ctx.fillRect(o.x, top + 26, o.w, 10);                    // shelf
    const flick = 0.45 + 0.1 * Math.sin(t * 9 + o.x);
    ctx.fillStyle = `rgba(240,170,90,${flick})`; ctx.fillRect(cx - 9, top + 12, 18, 14);  // fire box
    ctx.fillStyle = '#a89a8d';
    ctx.beginPath(); ctx.moveTo(o.x - 4, top + 12); ctx.lineTo(cx, top); ctx.lineTo(o.x + o.w + 4, top + 12); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,220,180,.25)'; ctx.fillRect(o.x, top + 26, o.w, 2);
    if (dmg > 0.01) {  // cracks grow as it takes hits
      ctx.strokeStyle = 'rgba(20,12,10,.8)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx - 4, top + 36); ctx.lineTo(cx + 3, top + 36 + 30 * dmg); ctx.lineTo(cx - 2, top + 40 + 36 * dmg);
      if (dmg > 0.4) { ctx.moveTo(o.x + 4, top + 28); ctx.lineTo(o.x + 14, top + 34); }
      if (dmg > 0.7) { ctx.moveTo(o.x + o.w - 4, top + 8); ctx.lineTo(cx + 6, top + 14); }
      ctx.stroke();
    }
  }

  function drawBell(ctx, o, t) {
    const cx = o.x + o.w / 2, top = o.y, bot = o.y + o.h;
    const sw = Math.sin(t * 1.4) * 0.02;  // a faint idle sway, purely visual
    ctx.save();
    ctx.translate(cx, top); ctx.rotate(sw);
    // wooden stand cross beam
    ctx.fillStyle = '#3a2220'; ctx.fillRect(-o.w / 2 - 6, -4, o.w + 12, 7);
    // bell body
    const g = ctx.createLinearGradient(-o.w / 2, 0, o.w / 2, 0);
    g.addColorStop(0, '#4d3a22'); g.addColorStop(0.45, '#9a7a3e'); g.addColorStop(1, '#3d2e1b');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-o.w / 2 + 12, 4);
    ctx.quadraticCurveTo(-o.w / 2 + 2, o.h * 0.4, -o.w / 2, o.h - 10);
    ctx.lineTo(o.w / 2, o.h - 10);
    ctx.quadraticCurveTo(o.w / 2 - 2, o.h * 0.4, o.w / 2 - 12, 4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#d8a548'; ctx.fillRect(-o.w / 2, o.h - 14, o.w, 4);
    ctx.fillStyle = 'rgba(216,165,72,.5)';
    for (let r = 0; r < 2; r++) for (let c = -1; c <= 1; c++) { ctx.beginPath(); ctx.arc(c * 12, 18 + r * 12, 2.5, 0, Math.PI * 2); ctx.fill(); }
    ctx.restore();
    // stone plinth
    ctx.fillStyle = '#6e625a'; ctx.fillRect(o.x - 4, bot - 10, o.w + 8, 10);
    ctx.fillStyle = 'rgba(255,220,180,.2)'; ctx.fillRect(o.x - 4, bot - 10, o.w + 8, 2);
  }

  function drawBackground(ctx, t) {
    if (!sky) sky = paintSky();
    ctx.save();
    ctx.drawImage(sky, 0, 0);
    // drifting mist bands between ridges and temple
    for (const m of mist) {
      const x = ((m.x + t * m.s) % (W + m.w)) - m.w;
      const g = ctx.createLinearGradient(x, 0, x + m.w, 0);
      g.addColorStop(0, 'rgba(255,240,240,0)'); g.addColorStop(0.5, `rgba(255,240,240,${m.a})`); g.addColorStop(1, 'rgba(255,240,240,0)');
      ctx.fillStyle = g; ctx.fillRect(x, m.y, m.w, 26);
    }
    for (const o of OBSTACLES) {
      if (!alive(o)) {  // broken lantern: a little rubble pile
        ctx.fillStyle = '#7a6d64';
        ctx.fillRect(o.x - 4, FLOOR - 8, 14, 8); ctx.fillRect(o.x + 12, FLOOR - 12, 12, 12); ctx.fillRect(o.x + 26, FLOOR - 6, 14, 6);
        continue;
      }
      if (o.kind === 'bell') drawBell(ctx, o, t); else drawLantern(ctx, o, t);
    }
    ctx.restore();
  }

  function drawForeground(ctx, t) {
    for (const p of petals) {
      const y = (p.y + t * p.vy) % (H + 20) - 10;
      const x = ((p.x + t * p.vx + Math.sin(t * 1.3 + p.ph) * 18) % (W + 20) + W + 20) % (W + 20) - 10;
      ctx.save();
      ctx.translate(x, y); ctx.rotate(t * 2 + p.ph);
      ctx.fillStyle = 'rgba(255,183,207,.7)';
      ctx.beginPath(); ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  (window.STICK_ARENAS = window.STICK_ARENAS || []).push({
    id: 'arena01',
    name: 'Mountain Temple',
    nameVi: 'Đền trên núi',
    hint: 'Stone lanterns, bronze bell',
    hintVi: 'Đèn đá, chuông đồng',
    gravityScale: 1,
    floorY: FLOOR,
    platforms: PLATFORMS,
    obstacles: OBSTACLES,
    reset() { for (const o of OBSTACLES) if (o.maxHp) { o.hp = o.maxHp; o.broken = false; } },
    drawBackground,
    drawForeground,
  });
})();
