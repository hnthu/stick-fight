// Arena 04: Night City Rooftops (Mái nhà thành phố đêm)
// Neon skyline, rooftops at different heights, and a billboard lift in the middle
// that rides up and down and carries whoever stands on it. Drawn entirely in code.
// All visuals are pure functions of `t` and arena state (no Math.random), so host and
// guest see the same picture online. Static layers are painted once and blitted.
(function () {
  const W = 960, H = 540, FLOOR = 474, PAD = 24, TAU = Math.PI * 2;

  // ---------- gameplay geometry (unchanged) ----------
  // Mirror-symmetric around x = 480 so both spawn sides are equal.
  const LIFT = { x: 405, y: 362, w: 150, h: 14, lift: true };
  const LIFT_TOP = 206, LIFT_BOTTOM = 362, LIFT_PERIOD = 7; // seconds per full up/down cycle
  const ROOF_Y = 362;
  const platforms = [
    { x: 30,  y: ROOF_Y, w: 210, h: 14 },   // left rooftop
    { x: 720, y: ROOF_Y, w: 210, h: 14 },   // right rooftop
    LIFT,
  ];

  // Solid terrain: AC units on the main roof, brick chimneys (breakable) on the side roofs.
  const CHIMNEY_HP = 40;
  const obstacles = [
    { x: 330, y: FLOOR - 46, w: 64, h: 46, kind: 'ac' },
    { x: 566, y: FLOOR - 46, w: 64, h: 46, kind: 'ac' },
    { x: 108, y: ROOF_Y - 56, w: 32, h: 56, kind: 'chimney', hp: CHIMNEY_HP },
    { x: 820, y: ROOF_Y - 56, w: 32, h: 56, kind: 'chimney', hp: CHIMNEY_HP },
  ];

  // ---------- deterministic helpers ----------
  let seed = 404;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  function hash(n) { // 0..1 from an integer, for per-frame effects
    n = Math.imul((n | 0) ^ 0x2c1b3c6d, 0x297a2d39);
    n = Math.imul(n ^ (n >>> 15), 0x85ebca6b);
    n ^= n >>> 13;
    return (n >>> 0) / 4294967296;
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  // Full-screen layers carry PAD px of overdraw on every side so screen shake never shows an edge.
  function fullLayer() { const c = mk(W + PAD * 2, H + PAD * 2), g = c.getContext('2d'); g.translate(PAD, PAD); return [c, g]; }
  const blit = (ctx, c) => ctx.drawImage(c, -PAD, -PAD);

  const PAL = {
    pink: '#ff3fb4', cyan: '#2bf0ff', yellow: '#ffe14d', warm: '#ffc96b', amber: '#e8b862', teal: '#5aaec8',
  };

  // ---------- state for animated details (all derived at draw time) ----------
  let built = false, fontReady = false, fontCheckT = -1;
  let L = {};                      // pre-rendered layers and sprites
  const twinkles = [], farFlicker = [], midFlicker = [], tvs = [], beacons = [];

  // ================= SKY =================
  function paintSky() {
    const [c, g] = fullLayer();
    const gr = g.createLinearGradient(0, -PAD, 0, H + PAD);
    gr.addColorStop(0, '#05031a'); gr.addColorStop(0.3, '#100a2e'); gr.addColorStop(0.62, '#26104a');
    gr.addColorStop(0.82, '#4a1652'); gr.addColorStop(1, '#5e1d4e');
    g.fillStyle = gr; g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
    // city glow bleeding up from the horizon
    const glow = g.createRadialGradient(W / 2, FLOOR + 40, 40, W / 2, FLOOR + 40, 560);
    glow.addColorStop(0, 'rgba(255,90,170,.22)'); glow.addColorStop(1, 'rgba(255,90,170,0)');
    g.fillStyle = glow; g.fillRect(-PAD, 0, W + PAD * 2, H);
    // static faint stars, denser and brighter higher up
    for (let i = 0; i < 260; i++) {
      const y = Math.pow(rnd(), 1.6) * 300 - 10, x = rnd() * (W + PAD * 2) - PAD;
      g.globalAlpha = (0.15 + rnd() * 0.45) * (1 - y / 340);
      g.fillStyle = rnd() < 0.15 ? '#ffd9f0' : rnd() < 0.3 ? '#cfe6ff' : '#eceaff';
      g.fillRect(x, y, 1, 1);
    }
    g.globalAlpha = 1;
    for (let i = 0; i < 34; i++) twinkles.push({ x: 10 + rnd() * (W - 20), y: 6 + Math.pow(rnd(), 1.4) * 240, ph: rnd() * TAU, f: 0.8 + rnd() * 2.2, big: rnd() < 0.3 });
    // moon: halo, disc with soft terminator, craters
    const mx = 790, my = 92;
    const halo = g.createRadialGradient(mx, my, 20, mx, my, 150);
    halo.addColorStop(0, 'rgba(255,236,214,.32)'); halo.addColorStop(0.4, 'rgba(255,200,220,.10)'); halo.addColorStop(1, 'rgba(255,200,220,0)');
    g.fillStyle = halo; g.fillRect(mx - 160, my - 160, 320, 320);
    const disc = g.createRadialGradient(mx - 8, my - 8, 4, mx, my, 32);
    disc.addColorStop(0, '#fffaf0'); disc.addColorStop(0.75, '#f6e6cf'); disc.addColorStop(1, '#d9c3b0');
    g.fillStyle = disc; g.beginPath(); g.arc(mx, my, 31, 0, TAU); g.fill();
    g.save(); g.beginPath(); g.arc(mx, my, 31, 0, TAU); g.clip();
    const craters = [[-10, -8, 7], [9, 10, 5], [12, -12, 3.5], [-4, 14, 3], [-16, 6, 2.5], [4, -2, 2]];
    for (const [dx, dy, r] of craters) {
      g.fillStyle = 'rgba(175,150,140,.35)'; g.beginPath(); g.arc(mx + dx, my + dy, r, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,245,.35)'; g.beginPath(); g.arc(mx + dx + r * 0.25, my + dy + r * 0.25, r * 0.7, 0, TAU); g.fill();
    }
    g.fillStyle = 'rgba(60,30,80,.18)'; g.beginPath(); g.arc(mx + 14, my + 6, 32, 0, TAU); g.fill();
    g.restore();
    L.sky = c;

    // drifting cloud bands, lit pink from below by the city
    L.clouds = [];
    for (let k = 0; k < 3; k++) {
      const cw = 520 + k * 120, ch = 70, cc = mk(cw, ch), cg = cc.getContext('2d');
      for (let i = 0; i < 26; i++) {
        const x = 30 + rnd() * (cw - 60), y = ch * 0.45 + (rnd() - 0.5) * 18, rx = 30 + rnd() * 70, ry = 6 + rnd() * 10;
        const gg = cg.createRadialGradient(x, y, 0, x, y, rx);
        const a = 0.10 + rnd() * 0.08;
        gg.addColorStop(0, `rgba(150,90,170,${a})`); gg.addColorStop(1, 'rgba(150,90,170,0)');
        cg.fillStyle = gg; cg.save(); cg.translate(x, y); cg.scale(1, ry / rx); cg.translate(-x, -y);
        cg.beginPath(); cg.arc(x, y, rx, 0, TAU); cg.fill(); cg.restore();
      }
      // rim light on the underside
      cg.globalCompositeOperation = 'source-atop';
      const rim = cg.createLinearGradient(0, 0, 0, ch);
      rim.addColorStop(0, 'rgba(60,40,110,.4)'); rim.addColorStop(1, 'rgba(255,120,190,.55)');
      cg.fillStyle = rim; cg.fillRect(0, 0, cw, ch);
      L.clouds.push({ c: cc, y: 40 + k * 62, speed: 3 + k * 2.2, off: k * 330 });
    }
  }

  // ================= FAR SKYLINE =================
  function paintFar() {
    const [c, g] = fullLayer();
    // very far, hazy row
    let x = -PAD;
    while (x < W + PAD) {
      const bw = 26 + rnd() * 44, bh = 90 + rnd() * 130, top = FLOOR - 40 - bh;
      g.fillStyle = '#2b1a50'; g.fillRect(x, top, bw, bh + 60);
      if (rnd() < 0.3) { g.fillRect(x + bw * 0.3, top - 10, bw * 0.4, 10); }
      x += bw + rnd() * 6;
    }
    let hz = g.createLinearGradient(0, FLOOR - 260, 0, FLOOR);
    hz.addColorStop(0, 'rgba(90,30,110,0)'); hz.addColorStop(1, 'rgba(170,60,140,.32)');
    g.fillStyle = hz; g.fillRect(-PAD, FLOOR - 260, W + PAD * 2, 260);

    // the landmark tower (behind everything near, right of centre)
    const tx = 640, tTop = 118;
    g.fillStyle = '#1a1036';
    g.beginPath(); g.moveTo(tx - 26, FLOOR); g.lineTo(tx - 12, tTop + 70); g.lineTo(tx - 6, tTop + 20); g.lineTo(tx + 6, tTop + 20); g.lineTo(tx + 12, tTop + 70); g.lineTo(tx + 26, FLOOR); g.closePath(); g.fill();
    g.fillRect(tx - 18, tTop + 66, 36, 8); // observation deck
    g.fillRect(tx - 1.5, tTop - 30, 3, 50); // spire
    g.fillStyle = 'rgba(255,170,220,.25)'; g.fillRect(tx - 18, tTop + 70, 36, 2);
    beacons.push({ x: tx, y: tTop - 31, ph: 0, f: 1.1, big: true });

    // nearer far row with windows
    x = -PAD;
    while (x < W + PAD) {
      const bw = 34 + rnd() * 50, bh = 120 + rnd() * 190, top = FLOOR - 60 - bh;
      g.fillStyle = '#160e2f'; g.fillRect(x, top, bw, bh + 80);
      const roof = rnd();
      if (roof < 0.2) { // stepped top
        g.fillRect(x + 6, top - 12, bw - 12, 12); g.fillRect(x + 12, top - 20, bw - 24, 8);
      } else if (roof < 0.35) { // pitched
        g.beginPath(); g.moveTo(x, top); g.lineTo(x + bw / 2, top - 18); g.lineTo(x + bw, top); g.fill();
      }
      if (rnd() < 0.3) { // antenna with a beacon
        const ax = x + bw * (0.3 + rnd() * 0.4), ah = 20 + rnd() * 26;
        g.fillRect(ax - 1, top - ah, 2, ah);
        g.fillRect(ax - 5, top - ah * 0.6, 10, 1);
        beacons.push({ x: ax, y: top - ah - 1, ph: rnd() * TAU, f: 0.6 + rnd() * 0.6 });
      }
      // a thin edge highlight on the side facing the moon
      g.fillStyle = 'rgba(190,150,255,.08)'; g.fillRect(x + bw - 2, top, 2, bh + 60);
      g.fillStyle = '#160e2f';
      for (let wy = top + 8; wy < FLOOR - 70; wy += 11)
        for (let wx = x + 5; wx < x + bw - 6; wx += 9) {
          const r = rnd();
          if (r < 0.2) {
            const col = rnd() < 0.7 ? '#ffd27a' : '#9ad8ff';
            if (rnd() < 0.12) farFlicker.push({ x: wx, y: wy, col, ph: rnd() * 1000, per: 8 + rnd() * 20 });
            else { g.globalAlpha = 0.28 + rnd() * 0.25; g.fillStyle = col; g.fillRect(wx, wy, 4, 5); g.globalAlpha = 1; g.fillStyle = '#160e2f'; }
          }
        }
      x += bw + 2 + rnd() * 8;
    }
    hz = g.createLinearGradient(0, FLOOR - 170, 0, FLOOR);
    hz.addColorStop(0, 'rgba(120,40,140,0)'); hz.addColorStop(1, 'rgba(160,50,150,.30)');
    g.fillStyle = hz; g.fillRect(-PAD, FLOOR - 170, W + PAD * 2, 170);
    L.far = c;
  }

  // ================= MID TOWERS =================
  function windowGrid(g, x, y, w, h, cw, ch, sx, sy, dens, cols, list) {
    for (let wy = y; wy + ch < y + h; wy += sy)
      for (let wx = x; wx + cw < x + w; wx += sx) {
        g.fillStyle = 'rgba(8,4,20,.55)'; g.fillRect(wx, wy, cw, ch); // dark pane
        if (rnd() > dens) continue;
        const col = cols[(rnd() * cols.length) | 0];
        if (list && rnd() < 0.1) { list.push({ x: wx, y: wy, w: cw, h: ch, col, ph: rnd() * 1000, per: 6 + rnd() * 14 }); continue; }
        litWindow(g, wx, wy, cw, ch, col, 0.45 + rnd() * 0.2);
      }
  }
  function litWindow(g, x, y, w, h, col, a) {
    g.globalAlpha = a; g.fillStyle = col; g.fillRect(x, y, w, h);
    g.globalAlpha = a * 0.5; g.fillStyle = '#fff6e0'; g.fillRect(x, y, w, 1);   // light from the ceiling
    const k = rnd();
    g.globalAlpha = a; g.fillStyle = 'rgba(30,14,40,.7)';
    if (k < 0.2) for (let i = 2; i < h; i += 2) g.fillRect(x, y + i, w, 0.8);   // blinds
    else if (k < 0.3) { g.fillRect(x + w * 0.55, y + h * 0.35, w * 0.3, h * 0.65); g.fillRect(x + w * 0.6, y + h * 0.15, w * 0.2, h * 0.25); } // someone at the window
    else if (k < 0.38) { g.fillRect(x + 1, y + h - 3, w * 0.4, 3); g.fillRect(x + 2, y + h - 6, 1.5, 3); } // potted plant
    g.globalAlpha = 1;
  }

  function paintMid() {
    const [c, g] = fullLayer();
    const mids = [[-PAD, 230, 70 + PAD], [260, 200, 60], [330, 150, 70], [570, 160, 66], [640, 205, 58], [890, 230, 70 + PAD]];
    for (const [x, y, w] of mids) {
      const body = g.createLinearGradient(x, 0, x + w, 0);
      body.addColorStop(0, '#24184a'); body.addColorStop(1, '#1b1239');
      g.fillStyle = body; g.fillRect(x, y, w, FLOOR - y + 70);
      // neon rim light: pink from the left signs, cyan from the right
      g.fillStyle = x < W / 2 ? 'rgba(255,80,190,.18)' : 'rgba(60,230,255,.16)';
      g.fillRect(x < W / 2 ? x : x + w - 2, y, 2, FLOOR - y);
      // roof cap and clutter
      g.fillStyle = '#2f2260'; g.fillRect(x - 2, y - 4, w + 4, 5);
      g.fillStyle = '#1b1239';
      const r = rnd();
      if (r < 0.35) { // satellite dish
        const dx = x + 12 + rnd() * (w - 30);
        g.fillRect(dx + 5, y - 10, 2, 8);
        g.beginPath(); g.ellipse(dx + 6, y - 13, 8, 4, -0.5, 0, TAU); g.fill();
      } else if (r < 0.7) { // railing
        g.fillRect(x + 4, y - 12, w - 8, 1.5);
        for (let i = x + 4; i < x + w - 4; i += 8) g.fillRect(i, y - 12, 1, 8);
      } else { // tiny rooftop shack
        g.fillRect(x + w * 0.55, y - 14, w * 0.3, 10);
      }
      windowGrid(g, x + 7, y + 12, w - 12, FLOOR - y - 30, 7, 9, 13, 16, 0.38, ['#ffcf70', '#ff9fd8', '#ffd9a0'], midFlicker);
    }
    // a couple of windows with a TV glow
    tvs.push({ x: 274, y: 300, w: 7, h: 9 }, { x: 680, y: 333, w: 7, h: 9 }, { x: 344, y: 236, w: 7, h: 9 });
    L.mid = c;
  }

  // ================= SIDE BUILDINGS (walkable roofs) =================
  function waterTower(g, cx, base) {
    const ty = base - 124;
    // legs and bracing
    g.strokeStyle = '#2b2050'; g.lineWidth = 4; g.lineCap = 'butt';
    g.beginPath();
    g.moveTo(cx - 26, ty + 54); g.lineTo(cx - 32, base); g.moveTo(cx + 26, ty + 54); g.lineTo(cx + 32, base);
    g.moveTo(cx - 6, ty + 54); g.lineTo(cx - 8, base); g.moveTo(cx + 6, ty + 54); g.lineTo(cx + 8, base);
    g.stroke();
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(cx - 28, ty + 70); g.lineTo(cx + 28, ty + 104); g.moveTo(cx + 28, ty + 70); g.lineTo(cx - 28, ty + 104);
    g.moveTo(cx - 30, ty + 104); g.lineTo(cx + 30, ty + 104);
    g.stroke();
    // wooden tank with staves and steel bands
    const tank = g.createLinearGradient(cx - 30, 0, cx + 30, 0);
    tank.addColorStop(0, '#3a2a58'); tank.addColorStop(0.35, '#4a3668'); tank.addColorStop(1, '#241a40');
    g.fillStyle = tank; g.fillRect(cx - 30, ty + 6, 60, 50);
    g.fillStyle = 'rgba(15,8,30,.35)';
    for (let i = cx - 26; i < cx + 30; i += 6) g.fillRect(i, ty + 6, 1, 50);
    g.fillStyle = '#5c4a80';
    for (const by of [ty + 12, ty + 30, ty + 48]) { g.fillRect(cx - 31, by, 62, 2); g.fillStyle = '#4a3a6c'; }
    // conical roof with a finial
    g.fillStyle = '#2a1e48';
    g.beginPath(); g.moveTo(cx - 35, ty + 8); g.lineTo(cx, ty - 14); g.lineTo(cx + 35, ty + 8); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,160,220,.15)';
    g.beginPath(); g.moveTo(cx - 35, ty + 8); g.lineTo(cx, ty - 14); g.lineTo(cx - 6, ty + 8); g.closePath(); g.fill();
    g.fillStyle = '#2a1e48'; g.fillRect(cx - 1, ty - 22, 2, 9); g.beginPath(); g.arc(cx, ty - 22, 2, 0, TAU); g.fill();
    // ladder
    g.strokeStyle = '#3e3066'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx + 18, ty + 10); g.lineTo(cx + 18, base); g.moveTo(cx + 24, ty + 10); g.lineTo(cx + 24, base);
    for (let y = ty + 14; y < base; y += 6) { g.moveTo(cx + 18, y); g.lineTo(cx + 24, y); }
    g.stroke();
  }

  function sideBuilding(g, p, left) {
    const x = p.x, w = p.w, y = p.y;
    // facade
    const body = g.createLinearGradient(x, 0, x + w, 0);
    body.addColorStop(0, left ? '#2a1e4e' : '#30225a'); body.addColorStop(1, left ? '#30225a' : '#2a1e4e');
    g.fillStyle = body; g.fillRect(x, y, w, FLOOR - y + 70);
    // panel seams
    g.fillStyle = 'rgba(10,4,24,.35)';
    for (let sy = y + 30; sy < FLOOR; sy += 36) g.fillRect(x, sy, w, 1);
    // windows with frames and sills
    for (let wy = y + 22; wy < FLOOR - 16; wy += 18)
      for (let wx = x + 12; wx < x + w - 14; wx += 22) {
        if (wy > 410 && wy < 448 && Math.abs(wx + 5 - (left ? 135 : 825)) < 60) continue; // behind the sign
        g.fillStyle = '#150c2a'; g.fillRect(wx - 1, wy - 1, 12, 11);
        if (rnd() < 0.62) litWindow(g, wx, wy, 10, 9, rnd() < 0.5 ? PAL.amber : PAL.teal, 0.42 + rnd() * 0.15);
        else { g.fillStyle = '#1c1236'; g.fillRect(wx, wy, 10, 9); }
        g.fillStyle = '#3d2f66'; g.fillRect(wx - 2, wy + 10, 14, 1.5);
      }
    // drainpipe on the outer edge
    const px = left ? x + 4 : x + w - 8;
    g.fillStyle = '#3a2d62'; g.fillRect(px, y + 8, 4, FLOOR - y - 8);
    g.fillStyle = '#4c3d7a'; for (let sy = y + 30; sy < FLOOR; sy += 40) g.fillRect(px - 1, sy, 6, 3);
    // fire escape on the inner edge (toward the centre)
    const fx = left ? x + w - 34 : x + 4;
    g.strokeStyle = '#3f3170'; g.lineWidth = 1.2;
    for (const ly of [y + 44, y + 88]) {
      g.fillStyle = '#3f3170'; g.fillRect(fx, ly, 30, 2);
      g.beginPath();
      for (let i = fx; i <= fx + 30; i += 5) { g.moveTo(i, ly); g.lineTo(i, ly - 10); }
      g.moveTo(fx, ly - 10); g.lineTo(fx + 30, ly - 10);
      g.stroke();
      g.beginPath(); // diagonal stair
      g.moveTo(left ? fx + 4 : fx + 26, ly); g.lineTo(left ? fx + 26 : fx + 4, ly + 44 > FLOOR ? FLOOR : ly + 44);
      g.stroke();
    }
    // sign mount: dark box and brackets (the tubes light up at draw time)
    const sx = left ? 135 : 825;
    g.fillStyle = '#120a24'; g.fillRect(sx - 62, 412, 124, 36);
    g.strokeStyle = '#4a3a74'; g.lineWidth = 2; g.strokeRect(sx - 62, 412, 124, 36);
    g.fillStyle = '#4a3a74'; g.fillRect(sx - 50, 406, 3, 8); g.fillRect(sx + 47, 406, 3, 8);
    // roof parapet cap (the walkable top)
    g.fillStyle = '#3e2f6c'; g.fillRect(x - 4, y, w + 8, p.h);
    g.fillStyle = '#9b8bd6'; g.fillRect(x - 4, y, w + 8, 2);
    g.fillStyle = 'rgba(10,4,24,.4)';
    for (let i = x + 20; i < x + w; i += 34) g.fillRect(i, y + 2, 1, p.h - 2);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, y + p.h, w, 4); // shadow under the cap
  }

  function cat(g, x, y) { // a cat sitting on top of the left water tower
    g.fillStyle = '#0d0820';
    g.beginPath(); g.ellipse(x, y - 6, 6, 7, 0, 0, TAU); g.fill();
    g.beginPath(); g.arc(x + 1, y - 15, 4, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(x - 2, y - 18); g.lineTo(x - 1, y - 22); g.lineTo(x + 1, y - 18); g.fill();
    g.beginPath(); g.moveTo(x + 2, y - 18); g.lineTo(x + 4, y - 22); g.lineTo(x + 5, y - 17); g.fill();
  }

  function paintSides() {
    const [c, g] = fullLayer();
    for (const p of platforms) {
      if (p.lift) continue;
      const left = p.x < W / 2;
      waterTower(g, left ? p.x + 168 : p.x + p.w - 168, p.y);
      // small antenna and a vent stack on each roof
      const ax = left ? p.x + 60 : p.x + p.w - 60;
      g.fillStyle = '#251a46'; g.fillRect(ax, p.y - 34, 2, 34); g.fillRect(ax - 8, p.y - 28, 18, 1.5); g.fillRect(ax - 5, p.y - 20, 12, 1.5);
      sideBuilding(g, p, left);
    }
    L.sides = c;
  }

  // ================= MAIN ROOF (floor) =================
  function paintFloor() {
    const [c, g] = fullLayer();
    // coping stones along the top edge
    g.fillStyle = '#463a6e'; g.fillRect(-PAD, FLOOR, W + PAD * 2, 10);
    g.fillStyle = '#7d6fb4'; g.fillRect(-PAD, FLOOR, W + PAD * 2, 2);
    g.fillStyle = 'rgba(12,6,28,.5)';
    for (let x = -PAD + 12; x < W + PAD; x += 46 + ((rnd() * 6) | 0)) g.fillRect(x, FLOOR + 2, 1.5, 8);
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(-PAD, FLOOR + 10, W + PAD * 2, 3);
    // brick facade below
    g.fillStyle = '#251a3e'; g.fillRect(-PAD, FLOOR + 13, W + PAD * 2, H - FLOOR + PAD);
    for (let row = 0, y = FLOOR + 13; y < H + PAD; row++, y += 7) {
      for (let x = -PAD - (row % 2 ? 0 : 9); x < W + PAD; x += 18) {
        const k = rnd();
        g.fillStyle = k < 0.3 ? '#2b1f46' : k < 0.6 ? '#281c42' : k < 0.9 ? '#22183a' : '#30234e';
        g.fillRect(x + 0.5, y + 0.5, 17, 6);
      }
    }
    // a strip of top-floor windows peeking up from the building we stand on
    for (let x = 34; x < W; x += 96) {
      if (x > 430 && x < 520) continue; // vent grille goes here
      g.fillStyle = '#120a24'; g.fillRect(x, FLOOR + 30, 26, 22);
      if (rnd() < 0.55) litWindow(g, x + 2, FLOOR + 32, 22, 20, rnd() < 0.6 ? PAL.warm : '#d79bff', 0.35);
      g.fillStyle = '#3d3066'; g.fillRect(x - 2, FLOOR + 52, 30, 2);
      g.fillStyle = '#120a24'; g.fillRect(x + 12, FLOOR + 32, 1.5, 20); g.fillRect(x + 2, FLOOR + 41, 22, 1.5);
    }
    // ventilation grille under the lift
    g.fillStyle = '#14102a'; g.fillRect(446, FLOOR + 26, 68, 26);
    g.fillStyle = '#3a3060'; for (let y = FLOOR + 29; y < FLOOR + 50; y += 4) g.fillRect(449, y, 62, 1.5);
    // drainpipes reaching the coping
    for (const x of [8, 946]) { g.fillStyle = '#3a2d62'; g.fillRect(x, FLOOR + 10, 5, H); }
    L.floor = c;

    // puddles on the coping (reflections drawn on top each frame)
    L.puddles = [[60, 70], [262, 40], [452, 56], [646, 44], [830, 70]];
  }

  // ================= OBSTACLE SPRITES =================
  function paintAC() {
    const w = 64, h = 46, c = mk(w + 8, h + 6), g = c.getContext('2d');
    g.translate(4, 0);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-3, h - 2, w + 6, 6); // contact shadow
    // feet
    g.fillStyle = '#231d3c'; g.fillRect(3, h - 4, 8, 4); g.fillRect(w - 11, h - 4, 8, 4);
    const body = g.createLinearGradient(0, 0, 0, h);
    body.addColorStop(0, '#5a5288'); body.addColorStop(1, '#3c3664');
    g.fillStyle = body; g.fillRect(0, 0, w, h - 4);
    g.fillStyle = '#7d75b4'; g.fillRect(0, 0, w, 2);          // top edge highlight
    g.fillStyle = '#2a2448'; g.fillRect(0, h - 6, w, 2);      // bottom seam
    g.fillStyle = 'rgba(15,10,35,.5)'; g.fillRect(24, 3, 1, h - 9); // panel seam
    // screws
    g.fillStyle = '#8c84c4';
    for (const [sx, sy] of [[3, 4], [21, 4], [3, h - 10], [21, h - 10], [w - 4, 4], [w - 4, h - 10]]) g.fillRect(sx, sy, 1.5, 1.5);
    // louvres on the service panel
    for (let i = 0; i < 5; i++) { g.fillStyle = '#2b2550'; g.fillRect(5, 9 + i * 6, 14, 3); g.fillStyle = '#6a62a0'; g.fillRect(5, 12 + i * 6, 14, 0.8); }
    // fan housing
    const fx = w - 21, fy = h / 2 - 1;
    g.fillStyle = '#1a1530'; g.beginPath(); g.arc(fx, fy, 16, 0, TAU); g.fill();
    g.strokeStyle = '#8a82c0'; g.lineWidth = 1.5; g.beginPath(); g.arc(fx, fy, 16, 0, TAU); g.stroke();
    // sticker / warning label
    g.fillStyle = '#ffd23f'; g.fillRect(6, h - 15, 8, 5); g.fillStyle = '#2a2448'; g.fillRect(9.5, h - 14, 1, 2.5);
    // drip pipe on the side
    g.fillStyle = '#4a4278'; g.fillRect(w, 18, 3, h - 22);
    L.ac = c;
    // fan grille drawn above the blades
    const gc = mk(36, 36), gg = gc.getContext('2d');
    gg.strokeStyle = 'rgba(160,150,210,.55)'; gg.lineWidth = 0.8;
    for (const r of [5, 10, 15]) { gg.beginPath(); gg.arc(18, 18, r, 0, TAU); gg.stroke(); }
    gg.beginPath(); gg.moveTo(2, 18); gg.lineTo(34, 18); gg.moveTo(18, 2); gg.lineTo(18, 34); gg.stroke();
    gg.fillStyle = '#9a92d0'; gg.beginPath(); gg.arc(18, 18, 2.5, 0, TAU); gg.fill();
    L.grille = gc;
  }

  function paintChimney() {
    const w = 32, h = 56, c = mk(w + 12, h + 4), g = c.getContext('2d');
    g.translate(6, 0);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-4, h - 1, w + 8, 4);
    g.fillStyle = '#3a1a26'; g.fillRect(0, 6, w, h - 6); // mortar
    for (let row = 0, y = 7; y < h; row++, y += 6) {
      for (let x = row % 2 ? -6 : 0; x < w; x += 12) {
        const k = rnd(), bx = Math.max(0, x), bw = Math.min(x + 11, w) - bx;
        if (bw <= 0) continue;
        g.fillStyle = k < 0.25 ? '#7a3a4a' : k < 0.55 ? '#6a3242' : k < 0.85 ? '#5e2c3c' : '#844656';
        g.fillRect(bx, y, bw, 5);
        g.fillStyle = 'rgba(255,200,210,.08)'; g.fillRect(bx, y, bw, 1);
      }
    }
    // soot near the top
    const soot = g.createLinearGradient(0, 6, 0, 28);
    soot.addColorStop(0, 'rgba(10,4,12,.6)'); soot.addColorStop(1, 'rgba(10,4,12,0)');
    g.fillStyle = soot; g.fillRect(0, 6, w, 22);
    // neon rim light on the side facing the centre is added at draw time; stone cap here
    g.fillStyle = '#8a5a6a'; g.fillRect(-4, 0, w + 8, 7);
    g.fillStyle = '#b08090'; g.fillRect(-4, 0, w + 8, 1.5);
    g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-2, 7, w + 4, 2);
    g.fillStyle = '#140a14'; g.fillRect(6, 1.5, w - 12, 3); // flue opening
    L.chimney = c;

    const rc = mk(56, 20), rg = rc.getContext('2d');
    const chunks = [[2, 13, 12, 6], [12, 9, 11, 7], [22, 12, 13, 7], [33, 14, 11, 5], [17, 4, 9, 6], [40, 10, 8, 4], [6, 8, 7, 5]];
    for (const [x, y, cw, ch] of chunks) {
      rg.fillStyle = rnd() < 0.5 ? '#6a3242' : '#7a3a4a'; rg.fillRect(x, y, cw, ch);
      rg.fillStyle = 'rgba(255,200,210,.1)'; rg.fillRect(x, y, cw, 1);
    }
    rg.fillStyle = 'rgba(30,20,30,.5)'; rg.fillRect(0, 18, 56, 2);
    L.rubble = rc;

    // soft smoke puff sprite
    const pc = mk(48, 48), pg = pc.getContext('2d');
    const pr = pg.createRadialGradient(24, 24, 0, 24, 24, 24);
    pr.addColorStop(0, 'rgba(170,160,200,.9)'); pr.addColorStop(0.6, 'rgba(150,140,190,.35)'); pr.addColorStop(1, 'rgba(150,140,190,0)');
    pg.fillStyle = pr; pg.fillRect(0, 0, 48, 48);
    L.puff = pc;
  }

  // ================= NEON SIGNS =================
  const FONT = '"Permanent Marker", "Comic Sans MS", cursive';
  function neonSprite(text, size, col, w, h, sub, subCol) {
    const pad = 22, on = mk(w + pad * 2, h + pad * 2), off = mk(w + pad * 2, h + pad * 2);
    for (const [c, lit] of [[on, true], [off, false]]) {
      const g = c.getContext('2d');
      g.translate(pad, pad);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `${size}px ${FONT}`;
      const ty = sub ? h * 0.42 : h / 2;
      if (lit) {
        g.shadowColor = col; g.shadowBlur = 18;
        g.lineWidth = 3; g.strokeStyle = col; g.strokeText(text, w / 2, ty);
        g.shadowBlur = 6; g.fillStyle = '#fff4fb'; g.fillText(text, w / 2, ty);
        g.shadowBlur = 0; g.globalAlpha = 0.6; g.fillStyle = col; g.fillText(text, w / 2, ty); g.globalAlpha = 1;
      } else {
        g.lineWidth = 2; g.strokeStyle = 'rgba(110,80,120,.75)'; g.strokeText(text, w / 2, ty);
        g.fillStyle = 'rgba(60,40,70,.9)'; g.fillText(text, w / 2, ty);
      }
      if (sub) {
        g.font = `${Math.round(size * 0.38)}px ${FONT}`;
        g.shadowColor = subCol; g.shadowBlur = lit ? 8 : 0;
        g.fillStyle = lit ? subCol : 'rgba(70,50,80,.9)';
        g.fillText(sub, w / 2, h * 0.84);
        g.shadowBlur = 0;
      }
    }
    return { on, off, pad, w, h };
  }
  function paintSigns() {
    L.ramen = neonSprite('RAMEN', 26, PAL.pink, 124, 36);
    L.h24 = neonSprite('24H', 28, PAL.cyan, 124, 36);
    L.fight = neonSprite('FIGHT!', 27, PAL.yellow, 138, 50, 'NIGHT  CITY', PAL.cyan);
    // colored light spill on the wall behind each sign
    L.spill = {};
    for (const [k, col] of [['pink', '255,63,180'], ['cyan', '43,240,255'], ['yellow', '255,225,77']]) {
      const c = mk(220, 120), g = c.getContext('2d');
      const r = g.createRadialGradient(110, 60, 6, 110, 60, 110);
      r.addColorStop(0, `rgba(${col},.22)`); r.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = r; g.save(); g.translate(110, 60); g.scale(1, 0.55); g.translate(-110, -60);
      g.beginPath(); g.arc(110, 60, 110, 0, TAU); g.fill(); g.restore();
      L.spill[k] = c;
    }
  }

  // ================= LIFT =================
  function paintLift() {
    // billboard body (hangs under the deck), 138 x 58
    const bw = LIFT.w - 12, bh = 58, c = mk(bw, bh), g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 0, bh);
    bg.addColorStop(0, '#1a0e34'); bg.addColorStop(1, '#0e0820');
    g.fillStyle = bg; g.fillRect(0, 0, bw, bh);
    g.fillStyle = 'rgba(255,255,255,.03)';
    for (let x = 0; x < bw; x += 3) g.fillRect(x, 0, 1, bh); // scanlines of the panel
    g.strokeStyle = '#3a2c62'; g.lineWidth = 2; g.strokeRect(1, 1, bw - 2, bh - 2);
    L.board = c;
    // diamond-plate deck
    const dc = mk(LIFT.w, LIFT.h), dg = dc.getContext('2d');
    const dgGrad = dg.createLinearGradient(0, 0, 0, LIFT.h);
    dgGrad.addColorStop(0, '#7466aa'); dgGrad.addColorStop(1, '#4a3e78');
    dg.fillStyle = dgGrad; dg.fillRect(0, 0, LIFT.w, LIFT.h);
    dg.fillStyle = 'rgba(200,190,255,.25)';
    for (let x = 2; x < LIFT.w; x += 6) for (let y = 4; y < 7; y += 3) { dg.fillRect(x + (y % 2 ? 3 : 0), y, 2, 1); }
    dg.fillStyle = '#ffd23f';
    for (let i = 0; i < LIFT.w; i += 14) { dg.beginPath(); dg.moveTo(i, LIFT.h - 2); dg.lineTo(i + 7, LIFT.h - 6); dg.lineTo(i + 11, LIFT.h - 6); dg.lineTo(i + 4, LIFT.h - 2); dg.fill(); }
    dg.fillStyle = '#d0c6ff'; for (const x of [3, LIFT.w - 5]) dg.fillRect(x, 4, 2, 2); // rivets
    L.deck = dc;
    // steel truss rail (tall strip)
    const rc = mk(10, FLOOR + PAD), rg = rc.getContext('2d');
    rg.fillStyle = '#4b3d7a'; rg.fillRect(0, 0, 2, FLOOR + PAD); rg.fillRect(8, 0, 2, FLOOR + PAD);
    rg.strokeStyle = '#3b2f64'; rg.lineWidth = 1;
    rg.beginPath();
    for (let y = 0; y < FLOOR + PAD; y += 14) { rg.moveTo(1, y); rg.lineTo(9, y + 7); rg.lineTo(1, y + 14); }
    rg.stroke();
    rg.fillStyle = '#7a6cb0'; for (let y = 0; y < FLOOR + PAD; y += 28) { rg.fillRect(0, y, 2, 1); rg.fillRect(8, y + 14, 2, 1); }
    L.rail = rc;
  }

  function build() {
    seed = 404;
    paintSky(); paintFar(); paintMid(); paintSides(); paintFloor(); paintAC(); paintChimney(); paintSigns(); paintLift();
    built = true;
  }
  function checkFont(t) {
    if (fontReady || !document.fonts || typeof document.fonts.check !== 'function') return;
    if (t - fontCheckT < 0.5 && fontCheckT >= 0) return;
    fontCheckT = t;
    try { if (document.fonts.check(`20px ${FONT}`)) { fontReady = true; paintSigns(); } } catch (e) { fontReady = true; }
  }

  // ================= PER-FRAME DRAWING =================
  // Neon flicker: mostly on, with short deterministic stutters.
  function flick(t, salt) {
    const slot = Math.floor(t * 12), r = hash(slot * 31 + salt);
    if (r < 0.035) return 0;           // brief dropout
    if (r < 0.06) return 0.55;         // half-lit buzz
    const slow = Math.floor(t / 9), outage = hash(slow * 7 + salt * 3) < 0.12 && (t % 9) < 0.7;
    return outage ? 0.15 : 1;
  }
  function drawSign(ctx, s, cx, cy, a) {
    const x = cx - s.w / 2 - s.pad, y = cy - s.h / 2 - s.pad;
    if (a < 1) ctx.drawImage(s.off, x, y);
    if (a > 0) { ctx.globalAlpha = a; ctx.drawImage(s.on, x, y); ctx.globalAlpha = 1; }
  }

  function drawSkyDynamic(ctx, t) {
    for (const s of twinkles) {
      const a = 0.35 + 0.45 * Math.sin(t * s.f + s.ph);
      if (a <= 0.05) continue;
      ctx.globalAlpha = a; ctx.fillStyle = '#f4f0ff';
      ctx.fillRect(s.x, s.y, 1.5, 1.5);
      if (s.big && a > 0.6) { ctx.globalAlpha = (a - 0.6) * 1.2; ctx.fillRect(s.x - 2, s.y + 0.25, 5.5, 1); ctx.fillRect(s.x + 0.25, s.y - 2, 1, 5.5); }
    }
    ctx.globalAlpha = 1;
    // cloud bands drift slowly; a wisp crosses the moon now and then
    for (const cl of L.clouds) {
      const span = cl.c.width + W + PAD * 2;
      const x = W + PAD - ((t * cl.speed + cl.off) % span);
      ctx.drawImage(cl.c, x, cl.y);
    }
    // an airliner crossing high up every 50 s
    const pt = t % 50;
    if (pt < 34) {
      const px = -40 + pt * 30, py = 112 - pt * 0.9;
      ctx.fillStyle = 'rgba(20,12,40,.9)'; ctx.fillRect(px - 7, py, 14, 2); ctx.fillRect(px - 2, py - 1, 4, 4);
      if (Math.floor(t * 1.4) % 2 === 0) { ctx.fillStyle = '#ff4060'; ctx.fillRect(px - 8, py, 2, 2); }
      if ((t * 1.1) % 1 < 0.12) { ctx.fillStyle = '#ffffff'; ctx.fillRect(px + 6, py, 2, 2); }
    }
  }

  function drawWindowsDynamic(ctx, list, t, a0) {
    for (const w of list) {
      const on = hash(Math.floor((t + w.ph) / w.per) * 13 + (w.x | 0) * 7 + (w.y | 0)) < 0.7;
      if (!on) continue;
      ctx.globalAlpha = a0; ctx.fillStyle = w.col; ctx.fillRect(w.x, w.y, w.w || 4, w.h || 5);
    }
    ctx.globalAlpha = 1;
  }

  function drawBeacons(ctx, t) {
    for (const b of beacons) {
      const k = (t * b.f + b.ph / TAU) % 1;
      const on = k < 0.18;
      ctx.fillStyle = on ? '#ff3a4c' : '#5a1424';
      ctx.fillRect(b.x - 1.5, b.y - 1.5, 3, 3);
      if (on) {
        const gr = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.big ? 16 : 9);
        gr.addColorStop(0, 'rgba(255,60,80,.5)'); gr.addColorStop(1, 'rgba(255,60,80,0)');
        ctx.fillStyle = gr; ctx.fillRect(b.x - 16, b.y - 16, 32, 32);
      }
    }
  }

  function drawSearchlights(ctx, t) {
    for (const [x0, sp, ph, col] of [[300, 0.31, 0, '170,220,255'], [700, 0.26, 2.2, '255,170,230']]) {
      const a = -Math.PI / 2 + Math.sin(t * sp + ph) * 0.5;
      ctx.save();
      ctx.translate(x0, FLOOR - 40); ctx.rotate(a);
      const gr = ctx.createLinearGradient(0, 0, 520, 0);
      gr.addColorStop(0, `rgba(${col},.15)`); gr.addColorStop(0.6, `rgba(${col},.05)`); gr.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(520, -46); ctx.lineTo(520, 46); ctx.lineTo(0, 3); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }

  function drawTVs(ctx, t) {
    for (let i = 0; i < tvs.length; i++) {
      const v = tvs[i], r = hash(Math.floor(t * 6) * 5 + i * 97);
      ctx.globalAlpha = 0.35 + r * 0.3;
      ctx.fillStyle = r < 0.33 ? '#8fb8ff' : r < 0.66 ? '#b0a0ff' : '#9ff0ff';
      ctx.fillRect(v.x, v.y, v.w, v.h);
    }
    ctx.globalAlpha = 1;
  }

  function drawLift(ctx, t) {
    const p = LIFT, cx = p.x + p.w / 2, travel = LIFT_BOTTOM - p.y;
    // rails, pulley head and counterweight
    ctx.drawImage(L.rail, p.x + 3, 0); ctx.drawImage(L.rail, p.x + p.w - 13, 0);
    ctx.fillStyle = '#2c2250'; ctx.fillRect(p.x - 2, 84, p.w + 4, 12);
    ctx.fillStyle = '#5b4b8a'; ctx.fillRect(p.x - 2, 84, p.w + 4, 2);
    for (const wx of [cx - 30, cx + 30]) {
      ctx.save(); ctx.translate(wx, 100); ctx.rotate(travel / 9);
      ctx.fillStyle = '#3e3270'; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#8a7cc8'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-7, 0); ctx.lineTo(7, 0); ctx.moveTo(0, -7); ctx.lineTo(0, 7); ctx.stroke();
      ctx.restore();
    }
    // cables to the deck
    ctx.strokeStyle = 'rgba(200,190,235,.55)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx - 37, 100); ctx.lineTo(cx - 37, p.y); ctx.moveTo(cx + 37, 100); ctx.lineTo(cx + 37, p.y); ctx.stroke();
    // counterweight rides the other way on the outer cable
    const cwY = 112 + travel * 0.9;
    ctx.strokeStyle = 'rgba(200,190,235,.35)'; ctx.beginPath(); ctx.moveTo(cx - 23, 100); ctx.lineTo(cx - 23, cwY); ctx.stroke();
    ctx.fillStyle = '#2a2048'; ctx.fillRect(cx - 29, cwY, 12, 22);
    ctx.fillStyle = '#4a3c78'; for (let i = 0; i < 4; i++) ctx.fillRect(cx - 29, cwY + 2 + i * 5, 12, 1);

    // light pool on the roof under the billboard, stronger the lower it is
    const by = p.y + p.h, bh = 58, near = clamp(1 - (FLOOR - (by + bh)) / 220, 0, 1);
    const fa = flick(t, 3);
    if (near > 0.02 && fa > 0) {
      const gr = ctx.createRadialGradient(cx, FLOOR, 4, cx, FLOOR, 120);
      gr.addColorStop(0, `rgba(255,120,200,${0.22 * near * fa})`); gr.addColorStop(1, 'rgba(255,120,200,0)');
      ctx.fillStyle = gr; ctx.fillRect(cx - 120, FLOOR - 60, 240, 70);
    }
    // billboard: panel, glowing spill, tubes and chase bulbs around the frame
    ctx.drawImage(L.spill.pink, cx - 110, by + bh / 2 - 60);
    ctx.drawImage(L.board, p.x + 6, by);
    ctx.fillStyle = '#4a3a74'; ctx.fillRect(p.x + 18, p.y + p.h - 1, 4, 3); ctx.fillRect(p.x + p.w - 22, p.y + p.h - 1, 4, 3); // hangers
    const bx0 = p.x + 10, by0 = by + 4, bw0 = p.w - 20, bh0 = bh - 8;
    ctx.save();
    ctx.strokeStyle = fa > 0.5 ? PAL.pink : '#5a2a48'; ctx.lineWidth = 2.5;
    if (fa > 0.5) { ctx.shadowColor = PAL.pink; ctx.shadowBlur = 10; }
    ctx.globalAlpha = fa > 0.5 ? fa : 1;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx0, by0, bw0, bh0, 6) : ctx.rect(bx0, by0, bw0, bh0); ctx.stroke();
    ctx.restore();
    drawSign(ctx, L.fight, cx, by + bh / 2, fa);
    // marquee bulbs chasing round the frame
    const per = 2 * (bw0 + bh0), n = 30, step = Math.floor(t * 10);
    for (let i = 0; i < n; i++) {
      let d = (i / n) * per, bxp, byp;
      if (d < bw0) { bxp = bx0 + d; byp = by0 - 3; }
      else if ((d -= bw0) < bh0) { bxp = bx0 + bw0 + 3; byp = by0 + d; }
      else if ((d -= bh0) < bw0) { bxp = bx0 + bw0 - d; byp = by0 + bh0 + 3; }
      else { d -= bw0; bxp = bx0 - 3; byp = by0 + bh0 - d; }
      const lit = (i + step) % 3 === 0;
      ctx.fillStyle = lit ? '#fff2b0' : '#5a4a3a';
      ctx.fillRect(bxp - 1, byp - 1, 2.5, 2.5);
      if (lit) { ctx.globalAlpha = 0.35; ctx.fillStyle = PAL.yellow; ctx.fillRect(bxp - 2.5, byp - 2.5, 5.5, 5.5); ctx.globalAlpha = 1; }
    }
    // the deck itself, with a cyan edge strip
    ctx.drawImage(L.deck, p.x, p.y);
    ctx.save(); ctx.shadowColor = PAL.cyan; ctx.shadowBlur = 8;
    ctx.fillStyle = PAL.cyan; ctx.fillRect(p.x, p.y, p.w, 2.5);
    ctx.restore();
    // a warning lamp blinks while the lift is moving fast
    const speed = Math.abs(Math.sin((liftT / LIFT_PERIOD) * TAU));
    if (speed > 0.3 && Math.floor(t * 4) % 2 === 0) {
      for (const lx of [p.x + 2, p.x + p.w - 6]) { ctx.fillStyle = '#ff9a2a'; ctx.fillRect(lx, p.y - 4, 4, 4); }
    }
  }

  function drawPuddles(ctx, t) {
    // thin wet strips on the coping that catch the neon
    for (let i = 0; i < L.puddles.length; i++) {
      const [x, w] = L.puddles[i];
      ctx.fillStyle = 'rgba(20,12,44,.85)'; ctx.fillRect(x, FLOOR + 1, w, 3);
      const col = x < 300 ? '255,63,180' : x > 660 ? '43,240,255' : '255,225,77';
      for (let k = 0; k < 4; k++) {
        const sx = x + ((Math.sin(t * 1.3 + i * 2 + k * 1.7) + 1) / 2) * (w - 10);
        ctx.fillStyle = `rgba(${col},${0.25 + 0.15 * Math.sin(t * 3 + k + i)})`;
        ctx.fillRect(sx, FLOOR + 2, 6 + k * 2, 1);
      }
    }
  }

  function drawAC(ctx, o, t, i) {
    ctx.drawImage(L.ac, o.x - 4, o.y);
    const fx = o.x + o.w - 21, fy = o.y + o.h / 2 - 1;
    // motion-blurred blades: a faint disc plus the blades at the current angle
    ctx.fillStyle = 'rgba(120,112,170,.18)'; ctx.beginPath(); ctx.arc(fx, fy, 13, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(fx, fy); ctx.rotate(t * 11 + i);
    ctx.fillStyle = '#8a82c4';
    for (let b = 0; b < 4; b++) { ctx.rotate(TAU / 4); ctx.beginPath(); ctx.ellipse(0, 7, 3, 6.5, 0.4, 0, TAU); ctx.fill(); }
    ctx.restore();
    ctx.drawImage(L.grille, fx - 18, fy - 18);
    // status LED and a condensation drip
    ctx.fillStyle = Math.floor(t * 1.5 + i) % 2 ? '#3fff9a' : '#1a4a30'; ctx.fillRect(o.x + 9, o.y + 4, 3, 2);
    const dk = (t * 0.8 + i * 0.5) % 1;
    if (dk < 0.5) { ctx.fillStyle = 'rgba(150,220,255,.7)'; ctx.fillRect(o.x + o.w + 1, o.y + o.h - 4 + dk * 10, 1.5, 2); }
    // neon rim light from the nearest sign
    ctx.fillStyle = o.x < W / 2 ? 'rgba(255,63,180,.22)' : 'rgba(43,240,255,.2)';
    ctx.fillRect(o.x < W / 2 ? o.x : o.x + o.w - 2, o.y + 2, 2, o.h - 8);
  }

  function drawChimney(ctx, o, t) {
    const base = o.y + o.h;
    if (!(o.hp > 0)) { ctx.drawImage(L.rubble, o.x + o.w / 2 - 28, base - 20); return; }
    ctx.drawImage(L.chimney, o.x - 6, o.y);
    ctx.fillStyle = o.x < W / 2 ? 'rgba(255,63,180,.18)' : 'rgba(43,240,255,.16)';
    ctx.fillRect(o.x < W / 2 ? o.x + o.w - 2 : o.x, o.y + 7, 2, o.h - 8);
    // cracks spread as it takes damage
    const dmg = 1 - o.hp / CHIMNEY_HP, x = o.x, y = o.y;
    if (dmg > 0.01) {
      ctx.strokeStyle = '#140810'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(x + 7, y + 9); ctx.lineTo(x + 13, y + 20); ctx.lineTo(x + 10, y + 30); ctx.lineTo(x + 15, y + 40);
      if (dmg > 0.4) { ctx.moveTo(x + o.w - 4, y + 16); ctx.lineTo(x + 20, y + 27); ctx.lineTo(x + 23, y + 38); ctx.lineTo(x + 18, y + 50); }
      if (dmg > 0.7) { ctx.moveTo(x + 3, y + 34); ctx.lineTo(x + 10, y + 30); ctx.moveTo(x + 16, y + 9); ctx.lineTo(x + 22, y + 14); }
      ctx.stroke();
      if (dmg > 0.4) { ctx.fillStyle = '#1a0a12'; ctx.fillRect(x + 21, y + 26, 6, 4); } // a missing brick
    }
    // smoke rising from the flue, leaning with the wind
    for (let i = 0; i < 6; i++) {
      const k = (t * 0.28 + i / 6) % 1, s = 10 + k * 26;
      ctx.globalAlpha = 0.22 * (1 - k) * (k < 0.1 ? k * 10 : 1);
      ctx.drawImage(L.puff, x + o.w / 2 - s / 2 + Math.sin(k * 5 + i) * 4 + k * 22, y - 4 - k * 80 - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  function drawBackground(ctx, t) {
    try {
      if (!built) build();
      checkFont(t);
      ctx.save();
      blit(ctx, L.sky);
      drawSkyDynamic(ctx, t);
      blit(ctx, L.far);
      drawWindowsDynamic(ctx, farFlicker, t, 0.5);
      drawBeacons(ctx, t);
      drawSearchlights(ctx, t);
      blit(ctx, L.mid);
      drawWindowsDynamic(ctx, midFlicker, t, 0.5);
      drawTVs(ctx, t);
      // neon light spill on the side buildings, then the buildings and their signs
      blit(ctx, L.sides);
      const fr = flick(t, 1), fc = flick(t, 2);
      ctx.globalAlpha = fr; ctx.drawImage(L.spill.pink, 135 - 110, 430 - 60); ctx.globalAlpha = fc; ctx.drawImage(L.spill.cyan, 825 - 110, 430 - 60); ctx.globalAlpha = 1;
      drawSign(ctx, L.ramen, 135, 430, fr);
      drawSign(ctx, L.h24, 825, 430, fc);
      // the cat on the left water tower flicks its tail
      const catX = 184, catY = ROOF_Y - 130;
      cat(ctx, catX, catY);
      ctx.strokeStyle = '#0d0820'; ctx.lineWidth = 2; ctx.lineCap = 'round';
      const tw = Math.sin(t * 1.7) * 4;
      ctx.beginPath(); ctx.moveTo(catX - 5, catY - 2); ctx.quadraticCurveTo(catX - 13, catY - 4 + tw, catX - 11 - tw * 0.5, catY - 14); ctx.stroke();
      ctx.lineCap = 'butt';
      drawLift(ctx, t);
      blit(ctx, L.floor);
      drawPuddles(ctx, t);
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i];
        if (o.kind === 'ac') drawAC(ctx, o, t, i); else drawChimney(ctx, o, t);
      }
      ctx.restore();
    } catch (e) { /* never break the frame */ }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  // ================= FOREGROUND: rain, splashes, low mist, vignette =================
  const DROPS = 90, SPLASHES = 14;
  function drawForeground(ctx, t) {
    try {
      if (!built) build();
      if (!L.vignette) {
        const [c, g] = fullLayer();
        const v = g.createRadialGradient(W / 2, H * 0.55, 260, W / 2, H * 0.55, 640);
        v.addColorStop(0, 'rgba(6,2,16,0)'); v.addColorStop(1, 'rgba(6,2,16,.42)');
        g.fillStyle = v; g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
        L.vignette = c;
        const mc = mk(W + 400, 60), mg = mc.getContext('2d');
        for (let i = 0; i < 18; i++) {
          const x = (i / 18) * (W + 400) + hash(i) * 40, rx = 70 + hash(i + 50) * 60;
          const gr = mg.createRadialGradient(x, 30, 0, x, 30, rx);
          gr.addColorStop(0, 'rgba(170,140,220,.09)'); gr.addColorStop(1, 'rgba(170,140,220,0)');
          mg.fillStyle = gr; mg.fillRect(x - rx, 0, rx * 2, 60);
        }
        L.mist = mc;
      }
      // rain streaks: two depths, positions are a function of t only
      ctx.lineWidth = 1;
      for (let layer = 0; layer < 2; layer++) {
        ctx.strokeStyle = layer ? 'rgba(190,210,255,.30)' : 'rgba(160,180,240,.16)';
        ctx.beginPath();
        const len = layer ? 15 : 9, sp = layer ? 760 : 520;
        for (let i = layer; i < DROPS; i += 2) {
          const s = sp * (0.85 + hash(i * 3) * 0.3), span = H + PAD * 2 + 40;
          const y = ((hash(i * 7) * span + t * s) % span) - PAD - 20;
          const x = ((hash(i * 11) * (W + 120) - (y + PAD) * 0.16) % (W + 120) + W + 120) % (W + 120) - 60;
          ctx.moveTo(x, y); ctx.lineTo(x + len * 0.16, y - len);
        }
        ctx.stroke();
      }
      // splashes on the roofs (main roof, side roofs, lift deck, obstacle tops)
      ctx.strokeStyle = 'rgba(190,215,255,.45)'; ctx.lineWidth = 1;
      for (let i = 0; i < SPLASHES; i++) {
        const per = 0.9 + hash(i * 17) * 0.8, cyc = Math.floor((t + hash(i) * per) / per), k = ((t + hash(i) * per) % per) / per;
        if (k > 0.22) continue;
        const r = hash(cyc * 29 + i), r2 = hash(cyc * 41 + i * 3);
        let sx, sy;
        if (r < 0.62) { sx = 10 + r2 * (W - 20); sy = FLOOR; }
        else if (r < 0.74) { sx = 34 + r2 * 202; sy = ROOF_Y; }
        else if (r < 0.86) { sx = 724 + r2 * 202; sy = ROOF_Y; }
        else { sx = LIFT.x + 4 + r2 * (LIFT.w - 8); sy = LIFT.y; }
        for (const o of obstacles) if (o.hp === undefined || o.hp > 0) if (sx > o.x && sx < o.x + o.w && sy > o.y) sy = o.y;
        const rr = 2 + k * 18;
        ctx.globalAlpha = 1 - k / 0.22;
        ctx.beginPath(); ctx.ellipse(sx, sy, rr, rr * 0.25, 0, Math.PI, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(200,220,255,.6)';
        ctx.fillRect(sx - 3 - k * 10, sy - 2 - k * 14, 1, 1); ctx.fillRect(sx + 3 + k * 10, sy - 2 - k * 12, 1, 1);
      }
      ctx.globalAlpha = 1;
      // low mist rolling along the roofline
      const mx = -((t * 12) % 400);
      ctx.drawImage(L.mist, mx - PAD, FLOOR - 34);
      blit(ctx, L.vignette);
    } catch (e) { /* never break the frame */ }
    ctx.globalAlpha = 1;
  }

  // ================= GAMEPLAY: the lift (unchanged) =================
  // Smooth up/down motion; the engine carries whoever stands on it.
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
