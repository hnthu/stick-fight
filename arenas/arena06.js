// Arena 06: Pirate Ship (Tàu cướp biển)
// Night deck at sea. The ship rocks gently (horizon tilts, fighters drift a little
// downhill on deck, rigging platforms bob). Every ~9 s an enemy ship on the horizon
// fires a cannonball: a red target ring marks the landing spot 1.8 s before impact.
(function () {
  const W = 960, H = 540, FLOOR = 462;
  const MAST_X = 480;

  // rigging platforms (base positions; y bobs with the swell)
  const BASE = [
    { x: 130, y: 322, w: 170, h: 12 },  // port yardarm plank
    { x: 660, y: 322, w: 170, h: 12 },  // starboard yardarm plank
    { x: 420, y: 196, w: 120, h: 12 },  // crow's nest
  ];
  const platforms = BASE.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h }));

  // solid deck clutter: barrel stacks by each rail (sturdy), cargo crates at the mast foot (breakable)
  const CRATE_HP = 40;
  const obstacles = [
    { x: 70,  y: FLOOR - 58, w: 54, h: 58, kind: 'barrels' },
    { x: 836, y: FLOOR - 58, w: 54, h: 58, kind: 'barrels' },
    { x: 442, y: FLOOR - 64, w: 76, h: 64, kind: 'crates', hp: CRATE_HP },
  ];

  // ---------- swell ----------
  const ROCK_W = 0.55;                       // rad/s of the swell
  const rockAngle = t => Math.sin(t * ROCK_W) * 0.035;
  const DRIFT = 26;                          // px/s sideways drift on deck at full tilt

  // ---------- helpers ----------
  let seed = 61;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // deterministic 0..1 noise for drawing (never Math.random in draw code: online
  // play seeds Math.random per simulation step, and visuals must not disturb it)
  const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
  const TAU = Math.PI * 2;

  function mk(w, h) {
    try {
      const c = document.createElement('canvas');
      c.width = w || W; c.height = h || H;
      return c;
    } catch (e) { return null; }
  }

  // ---------- static layers (painted once) ----------
  const HZ = 300;                 // horizon line
  let skyLayer = null, seaLayer = null, shipLayer = null, vignette = null, clouds = null;

  function paintSky() {
    const c = mk(); if (!c) return null;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, HZ + 20);
    sky.addColorStop(0, '#070b18');
    sky.addColorStop(0.45, '#121733');
    sky.addColorStop(0.8, '#231f3f');
    sky.addColorStop(1, '#3a2c48');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // faint milky band, diagonal
    seed = 17;
    g.save(); g.translate(W * 0.42, 120); g.rotate(-0.32);
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(150,160,220,${0.012 + rnd() * 0.02})`;
      g.beginPath(); g.ellipse((rnd() - 0.5) * 900, (rnd() - 0.5) * 50, 40 + rnd() * 90, 10 + rnd() * 18, 0, 0, TAU); g.fill();
    }
    g.restore();
    // dim fixed stars, thinning toward the horizon haze
    seed = 61;
    for (let i = 0; i < 260; i++) {
      const y = Math.pow(rnd(), 1.4) * (HZ - 10), x = rnd() * W;
      g.globalAlpha = (0.12 + rnd() * 0.45) * (1 - y / HZ * 0.7);
      g.fillStyle = rnd() < 0.15 ? '#ffe9c8' : rnd() < 0.3 ? '#cfd9ff' : '#eef1ff';
      g.fillRect(x, y, rnd() < 0.08 ? 2 : 1, 1);
    }
    g.globalAlpha = 1;
    // moon: halo, disc, terminator shade, maria, craters with lit rims
    const mx = 770, my = 130, mr = 30;
    let halo = g.createRadialGradient(mx, my, mr, mx, my, 170);
    halo.addColorStop(0, 'rgba(255,236,200,.20)'); halo.addColorStop(0.35, 'rgba(255,236,200,.06)'); halo.addColorStop(1, 'rgba(255,236,200,0)');
    g.fillStyle = halo; g.fillRect(mx - 180, my - 180, 360, 360);
    const disc = g.createRadialGradient(mx - 9, my - 9, 4, mx, my, mr);
    disc.addColorStop(0, '#fbf3da'); disc.addColorStop(0.75, '#e6dcbc'); disc.addColorStop(1, '#c9bd98');
    g.fillStyle = disc; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
    g.save(); g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.clip();
    g.fillStyle = 'rgba(40,35,60,.22)'; g.beginPath(); g.arc(mx + 14, my + 6, mr, 0, TAU); g.fill();
    g.fillStyle = 'rgba(150,140,110,.30)';
    g.beginPath(); g.ellipse(mx - 8, my - 4, 9, 6, 0.4, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(mx + 6, my + 10, 7, 4, -0.3, 0, TAU); g.fill();
    g.beginPath(); g.ellipse(mx + 9, my - 12, 5, 3, 0.2, 0, TAU); g.fill();
    for (const [cx, cy, r] of [[-15, 9, 3.5], [3, -2, 2.5], [-3, 17, 2], [14, -2, 2], [-18, -10, 2]]) {
      g.fillStyle = 'rgba(120,110,85,.35)'; g.beginPath(); g.arc(mx + cx, my + cy, r, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,250,230,.35)'; g.lineWidth = 0.8; g.beginPath(); g.arc(mx + cx, my + cy, r, 2.3, 5.2); g.stroke();
    }
    g.restore();
    // warm haze sitting on the horizon
    const haze = g.createLinearGradient(0, HZ - 40, 0, HZ + 6);
    haze.addColorStop(0, 'rgba(90,70,110,0)'); haze.addColorStop(1, 'rgba(120,90,120,.35)');
    g.fillStyle = haze; g.fillRect(0, HZ - 40, W, 46);
    return c;
  }

  // three soft cloud sprites, lit from the moon side (upper right)
  function paintClouds() {
    const out = [];
    for (let k = 0; k < 3; k++) {
      const c = mk(320, 70); if (!c) return out;
      const g = c.getContext('2d');
      seed = 300 + k * 41;
      for (let i = 0; i < 26; i++) {
        const x = 30 + rnd() * 260, y = 38 + (rnd() - 0.5) * 16, rx = 26 + rnd() * 50, ry = 7 + rnd() * 9;
        g.fillStyle = `rgba(70,72,115,${0.10 + rnd() * 0.08})`;
        g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
        g.fillStyle = `rgba(210,200,190,${0.03 + rnd() * 0.04})`;
        g.beginPath(); g.ellipse(x + 6, y - ry * 0.5, rx * 0.7, ry * 0.45, 0, 0, TAU); g.fill();
      }
      out.push(c);
    }
    return out;
  }

  // sea gradient tile, oversized so the tilt never shows an edge
  function paintSea() {
    const c = mk(W + 280, 300); if (!c) return null;
    const g = c.getContext('2d');
    const sea = g.createLinearGradient(0, 0, 0, 300);
    sea.addColorStop(0, '#2b3557'); sea.addColorStop(0.08, '#1d2a4c'); sea.addColorStop(0.5, '#122040'); sea.addColorStop(1, '#091226');
    g.fillStyle = sea; g.fillRect(0, 0, c.width, 300);
    // long static swell bands for depth
    seed = 77;
    for (let i = 0; i < 90; i++) {
      const y = Math.pow(rnd(), 1.6) * 260 + 4, w = 30 + rnd() * 160 * (0.4 + y / 260);
      g.fillStyle = rnd() < 0.5 ? 'rgba(10,16,34,.35)' : 'rgba(90,120,180,.06)';
      g.fillRect(rnd() * c.width, y, w, 1 + y / 120);
    }
    return c;
  }

  // plank texture helper: one board with grain and knots
  function board(g, x, y, w, h, base, s) {
    const v = (rnd() - 0.5) * 18;
    const r = base[0] + v, gg = base[1] + v * 0.7, b = base[2] + v * 0.5;
    g.fillStyle = `rgb(${r | 0},${gg | 0},${b | 0})`; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(20,10,4,.18)'; g.lineWidth = 0.8;
    const n = Math.max(2, (s === 'v' ? w : h) / 3) | 0;
    for (let i = 0; i < n; i++) {
      g.beginPath();
      if (s === 'v') { const xx = x + rnd() * w; g.moveTo(xx, y); g.bezierCurveTo(xx + (rnd() - 0.5) * 3, y + h * 0.3, xx + (rnd() - 0.5) * 3, y + h * 0.7, xx, y + h); }
      else { const yy = y + rnd() * h; g.moveTo(x, yy); g.bezierCurveTo(x + w * 0.3, yy + (rnd() - 0.5) * 2, x + w * 0.7, yy + (rnd() - 0.5) * 2, x + w, yy); }
      g.stroke();
    }
    if (rnd() < 0.35) {
      const kx = x + rnd() * w, ky = y + rnd() * h;
      g.fillStyle = 'rgba(30,15,6,.35)'; g.beginPath(); g.ellipse(kx, ky, s === 'v' ? 2 : 4, s === 'v' ? 4 : 1.8, 0, 0, TAU); g.fill();
    }
  }

  function paintShip() {
    const c = mk(); if (!c) return null;
    const g = c.getContext('2d');
    seed = 99;
    const BT = FLOOR - 50;   // top of bulwark cap rail

    // --- rigging behind everything else on the ship: stays to bow and stern
    g.strokeStyle = 'rgba(190,170,130,.16)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(MAST_X, 34); g.lineTo(-20, 250); g.stroke();
    g.beginPath(); g.moveTo(MAST_X, 34); g.lineTo(W + 20, 230); g.stroke();

    // --- bulwark: vertical planks, frames, shading under the cap rail
    for (let x = 0; x < W; x += 24) board(g, x, BT + 6, 24, FLOOR - BT - 6, [52, 34, 24], 'v');
    g.fillStyle = 'rgba(0,0,0,.35)';
    for (let x = 0; x < W; x += 24) g.fillRect(x, BT + 6, 1.5, FLOOR - BT - 6);
    let sh = g.createLinearGradient(0, BT + 6, 0, BT + 22);
    sh.addColorStop(0, 'rgba(0,0,0,.55)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.fillRect(0, BT + 6, W, 16);
    // frames (stanchions) with bolt heads
    for (let x = 36; x < W; x += 96) {
      g.fillStyle = '#2c1c12'; g.fillRect(x - 4, BT + 6, 8, FLOOR - BT - 6);
      g.fillStyle = 'rgba(255,220,170,.10)'; g.fillRect(x - 4, BT + 6, 1.5, FLOOR - BT - 6);
      g.fillStyle = '#15100c';
      for (const yy of [BT + 14, FLOOR - 10]) { g.beginPath(); g.arc(x, yy, 1.8, 0, TAU); g.fill(); }
    }
    // cap rail with rounded highlight
    let cap = g.createLinearGradient(0, BT, 0, BT + 8);
    cap.addColorStop(0, '#7a5434'); cap.addColorStop(0.4, '#5a3c26'); cap.addColorStop(1, '#2e1f14');
    g.fillStyle = cap; g.fillRect(0, BT, W, 8);
    g.fillStyle = 'rgba(255,225,180,.35)'; g.fillRect(0, BT, W, 1.2);

    // gun ports: lids hinged open above, dark ports with a cannon muzzle peeking
    for (const x of [300, 640]) {
      g.fillStyle = '#0d0907'; g.fillRect(x - 17, FLOOR - 37, 34, 24);
      g.strokeStyle = '#4a3222'; g.lineWidth = 2.5; g.strokeRect(x - 17, FLOOR - 37, 34, 24);
      // muzzle
      g.fillStyle = '#1c1c22'; g.beginPath(); g.arc(x, FLOOR - 25, 8, 0, TAU); g.fill();
      g.fillStyle = '#050506'; g.beginPath(); g.arc(x, FLOOR - 25, 4.5, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(200,200,220,.25)'; g.lineWidth = 1; g.beginPath(); g.arc(x, FLOOR - 25, 8, 3.6, 5.4); g.stroke();
      // lid propped open
      g.save(); g.translate(x, FLOOR - 37); g.transform(1, 0, 0, 0.35, 0, 0);
      g.fillStyle = '#4b311f'; g.fillRect(-17, -24, 34, 24);
      g.strokeStyle = '#24170e'; g.lineWidth = 2; g.strokeRect(-17, -24, 34, 24);
      g.restore();
      g.fillStyle = '#1a120c'; g.fillRect(x - 15, FLOOR - 39, 4, 3); g.fillRect(x + 11, FLOOR - 39, 4, 3); // hinges
    }
    // belaying-pin rails with coiled ropes hung on them
    for (const [x0, x1] of [[176, 266], [694, 784]]) {
      g.fillStyle = '#3d2818'; g.fillRect(x0, FLOOR - 32, x1 - x0, 6);
      g.fillStyle = 'rgba(255,220,170,.18)'; g.fillRect(x0, FLOOR - 32, x1 - x0, 1);
      for (let x = x0 + 10; x < x1; x += 16) {
        g.fillStyle = '#5c3e26'; g.fillRect(x - 1.5, FLOOR - 42, 3, 18);
        g.fillStyle = '#6d4a2d'; g.beginPath(); g.arc(x, FLOOR - 42, 2.4, 0, TAU); g.fill();
      }
      for (const cx of [x0 + 26, x1 - 26]) {
        for (let k = 0; k < 4; k++) {
          g.strokeStyle = k % 2 ? 'rgba(150,122,82,.42)' : 'rgba(110,88,58,.5)'; g.lineWidth = 2;
          g.beginPath(); g.ellipse(cx, FLOOR - 22 + k * 0.8, 9 - k, 13 - k * 1.2, 0, 0, TAU); g.stroke();
        }
      }
    }

    // --- deck: boards running along the ship, staggered butt joints with nail pairs
    const rows = 7, rh = (H - FLOOR) / rows;
    for (let r = 0; r < rows; r++) {
      const y = FLOOR + r * rh;
      let x = -((r * 53) % 140);
      while (x < W) {
        const w = 120 + rnd() * 90;
        board(g, x, y, w, rh, [92 - r * 6, 63 - r * 4, 40 - r * 3], 'h');
        g.fillStyle = 'rgba(15,8,3,.55)'; g.fillRect(x, y, 1.5, rh);
        g.fillStyle = '#20150d';
        g.fillRect(x + 4, y + rh * 0.3, 1.6, 1.6); g.fillRect(x + 4, y + rh * 0.65, 1.6, 1.6);
        x += w;
      }
      g.fillStyle = 'rgba(10,5,2,.6)'; g.fillRect(0, y + rh - 1.2, W, 1.2);   // caulked seam
    }
    // worn, lighter walking path down the middle of the deck
    let worn = g.createLinearGradient(0, FLOOR, 0, FLOOR + 40);
    worn.addColorStop(0, 'rgba(255,220,170,.07)'); worn.addColorStop(1, 'rgba(255,220,170,0)');
    g.fillStyle = worn; g.fillRect(0, FLOOR, W, 40);
    // depth: deck darkens toward the viewer
    let dk = g.createLinearGradient(0, FLOOR, 0, H);
    dk.addColorStop(0, 'rgba(0,0,0,0)'); dk.addColorStop(1, 'rgba(0,0,10,.45)');
    g.fillStyle = dk; g.fillRect(0, FLOOR, W, H - FLOOR);
    // waterway gutter and lit deck edge
    g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, FLOOR, W, 3);
    g.fillStyle = 'rgba(236,210,170,.55)'; g.fillRect(0, FLOOR, W, 1.5);
    // damp patches catching the moon
    for (const [x, y, rx] of [[150, FLOOR + 30, 40], [810, FLOOR + 42, 55], [640, FLOOR + 62, 30]]) {
      const p = g.createRadialGradient(x, y, 2, x, y, rx);
      p.addColorStop(0, 'rgba(160,180,230,.10)'); p.addColorStop(1, 'rgba(160,180,230,0)');
      g.fillStyle = p; g.beginPath(); g.ellipse(x, y, rx, rx * 0.18, 0, 0, TAU); g.fill();
    }
    // cargo hatch grating with a raised coaming
    g.fillStyle = '#3a2717'; g.fillRect(404, FLOOR + 16, 152, 46);
    g.fillStyle = '#0c0805'; g.fillRect(410, FLOOR + 20, 140, 38);
    g.fillStyle = '#5b3d25';
    for (let x = 410; x <= 550; x += 10) g.fillRect(x, FLOOR + 20, 3, 38);
    for (let y = FLOOR + 20; y <= FLOOR + 58; y += 9) g.fillRect(410, y, 140, 2.5);
    g.fillStyle = 'rgba(255,220,170,.25)'; g.fillRect(404, FLOOR + 16, 152, 1.2);
    // iron ring bolts for the guns' tackle
    for (const x of [300, 640]) {
      g.strokeStyle = '#25252b'; g.lineWidth = 2;
      g.beginPath(); g.ellipse(x - 22, FLOOR + 12, 4, 2, 0, 0, TAU); g.stroke();
      g.beginPath(); g.ellipse(x + 22, FLOOR + 12, 4, 2, 0, 0, TAU); g.stroke();
    }

    // --- mast: round shading, grain, iron bands with rivets, cleats, wooldings
    const mg = g.createLinearGradient(MAST_X - 12, 0, MAST_X + 12, 0);
    mg.addColorStop(0, '#22160d'); mg.addColorStop(0.35, '#5a3b25'); mg.addColorStop(0.55, '#4b3120'); mg.addColorStop(1, '#1d130b');
    g.fillStyle = mg; g.fillRect(MAST_X - 11, 64, 22, FLOOR - 64);
    // thinner topmast with cap
    const tg = g.createLinearGradient(MAST_X - 7, 0, MAST_X + 7, 0);
    tg.addColorStop(0, '#22160d'); tg.addColorStop(0.4, '#553823'); tg.addColorStop(1, '#1d130b');
    g.fillStyle = tg; g.fillRect(MAST_X - 7, 20, 14, 50);
    g.fillStyle = '#2a1b10'; g.fillRect(MAST_X - 12, 60, 24, 7);
    g.fillStyle = '#3c2716'; g.beginPath(); g.arc(MAST_X, 20, 7, Math.PI, 0); g.fill();
    g.strokeStyle = 'rgba(15,8,3,.28)'; g.lineWidth = 0.8;
    for (let i = 0; i < 7; i++) {
      const x = MAST_X - 8 + i * 2.6 + (rnd() - 0.5);
      g.beginPath(); g.moveTo(x, 70); g.lineTo(x + (rnd() - 0.5) * 2, FLOOR); g.stroke();
    }
    for (const y of [110, 236, 300, 392]) {
      g.fillStyle = '#17120e'; g.fillRect(MAST_X - 13, y, 26, 6);
      g.fillStyle = 'rgba(200,200,220,.25)'; g.fillRect(MAST_X - 13, y, 26, 1);
      g.fillStyle = 'rgba(200,200,220,.35)';
      for (const dx of [-8, 0, 8]) g.fillRect(MAST_X + dx - 0.8, y + 2.5, 1.6, 1.6);
    }
    // rope woolding near the deck
    for (let y = 410; y < 432; y += 3) { g.fillStyle = y % 6 ? '#7a6243' : '#5e4a32'; g.fillRect(MAST_X - 12, y, 24, 2.2); }
    // cleats with a few turns of rope
    for (const s of [-1, 1]) {
      g.fillStyle = '#2b1b10'; g.fillRect(MAST_X + s * 11 - (s < 0 ? 8 : 0), 372, 8, 4);
      g.strokeStyle = 'rgba(170,140,95,.6)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(MAST_X + s * 15, 374); g.quadraticCurveTo(MAST_X + s * 20, 420, MAST_X + s * 14, FLOOR); g.stroke();
    }

    // --- yards with furled sails, gaskets and footropes
    function yard(x0, x1, y, th, sag) {
      const yg = g.createLinearGradient(0, y, 0, y + th);
      yg.addColorStop(0, '#5c3d26'); yg.addColorStop(0.5, '#3e2918'); yg.addColorStop(1, '#22160d');
      g.fillStyle = yg;
      g.beginPath(); g.moveTo(x0, y + th * 0.25); g.lineTo(MAST_X, y); g.lineTo(x1, y + th * 0.25); g.lineTo(x1, y + th * 0.8); g.lineTo(MAST_X, y + th); g.lineTo(x0, y + th * 0.8); g.closePath(); g.fill();
      // furled canvas bundle in billows
      const top = y + th - 1;
      for (let x = x0 + 8; x < x1 - 8; x += sag) {
        const w = Math.min(sag, x1 - 8 - x), bh = 10 + hash(x) * 4;
        const sg = g.createLinearGradient(0, top, 0, top + bh);
        sg.addColorStop(0, '#8d8270'); sg.addColorStop(0.6, '#6d6352'); sg.addColorStop(1, '#3e372d');
        g.fillStyle = sg;
        g.beginPath(); g.moveTo(x, top); g.quadraticCurveTo(x + w / 2, top + bh * 1.6, x + w, top); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(30,25,18,.35)'; g.lineWidth = 0.8;
        g.beginPath(); g.moveTo(x + w * 0.3, top + 1); g.quadraticCurveTo(x + w * 0.45, top + bh * 0.8, x + w * 0.6, top + 1); g.stroke();
        // gasket tie at every joint
        g.fillStyle = '#4a3b28'; g.fillRect(x - 1, top - 1, 2.5, bh * 0.7);
      }
      // footrope sagging under the yard
      g.strokeStyle = 'rgba(180,155,115,.35)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x0 + 10, y + th + 4); g.quadraticCurveTo((x0 + MAST_X) / 2, y + th + 26, MAST_X - 14, y + th + 6); g.stroke();
      g.beginPath(); g.moveTo(MAST_X + 14, y + th + 6); g.quadraticCurveTo((x1 + MAST_X) / 2, y + th + 26, x1 - 10, y + th + 4); g.stroke();
      // yardarm tips
      g.fillStyle = '#1a110a'; g.fillRect(x0 - 2, y + th * 0.2, 4, th * 0.7); g.fillRect(x1 - 2, y + th * 0.2, 4, th * 0.7);
    }
    yard(150, 810, 266, 11, 40);
    yard(330, 630, 138, 8, 30);
    // lifts from the masthead to the yardarms
    g.strokeStyle = 'rgba(190,170,130,.20)'; g.lineWidth = 1.2;
    for (const [x, y] of [[150, 268], [810, 268], [330, 140], [630, 140]]) { g.beginPath(); g.moveTo(MAST_X, 64); g.lineTo(x, y); g.stroke(); }

    // --- shrouds with ratlines, ending at deadeyes on the rail
    const shroudsL = [], shroudsR = [];
    for (let i = 0; i < 5; i++) { shroudsL.push(34 + i * 24); shroudsR.push(W - 34 - i * 24); }
    function shrouds(xs, side) {
      g.strokeStyle = 'rgba(205,185,145,.26)'; g.lineWidth = 1.6;
      for (const x of xs) { g.beginPath(); g.moveTo(MAST_X + side * 9, 120); g.lineTo(x, BT - 10); g.stroke(); }
      // ratlines: horizontal rungs between first and last shroud
      g.strokeStyle = 'rgba(205,185,145,.14)'; g.lineWidth = 1;
      for (let k = 1; k < 14; k++) {
        const f = k / 14, y = 120 + (BT - 10 - 120) * f;
        const xa = MAST_X + side * 9 + (xs[0] - MAST_X - side * 9) * f;
        const xb = MAST_X + side * 9 + (xs[xs.length - 1] - MAST_X - side * 9) * f;
        g.beginPath(); g.moveTo(xa, y); g.lineTo(xb, y + 0.5); g.stroke();
      }
      // deadeyes and lanyards
      for (const x of xs) {
        g.fillStyle = '#24170e'; g.beginPath(); g.arc(x, BT - 10, 4.5, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,220,170,.25)'; g.beginPath(); g.arc(x - 1, BT - 11, 1.2, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(150,125,90,.6)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x - 2, BT - 6); g.lineTo(x - 2, BT + 2); g.moveTo(x + 2, BT - 6); g.lineTo(x + 2, BT + 2); g.stroke();
        g.fillStyle = '#1a120c'; g.fillRect(x - 5, BT + 2, 10, 6);
      }
    }
    shrouds(shroudsL, -1);
    shrouds(shroudsR, 1);
    return c;
  }

  // vignette as four edge strips (the clear middle is never blitted, which keeps it cheap)
  const VIG = [[0, 0, W, 70], [0, H - 90, W, 90], [0, 70, 150, H - 160], [W - 150, 70, 150, H - 160]];
  function paintVignette() {
    const c = mk(); if (!c) return null;
    const g = c.getContext('2d');
    const edge = (x0, y0, x1, y1, a) => {
      const l = g.createLinearGradient(x0, y0, x1, y1);
      l.addColorStop(0, `rgba(0,0,12,${a})`); l.addColorStop(1, 'rgba(0,0,12,0)');
      return l;
    };
    g.fillStyle = edge(0, 0, 150, 0, 0.42); g.fillRect(0, 0, 150, H);
    g.fillStyle = edge(W, 0, W - 150, 0, 0.42); g.fillRect(W - 150, 0, 150, H);
    g.fillStyle = edge(0, 0, 0, 70, 0.3); g.fillRect(0, 0, W, 70);
    g.fillStyle = edge(0, H, 0, H - 90, 0.38); g.fillRect(0, H - 90, W, 90);
    // bottom mist band
    const m = g.createLinearGradient(0, H - 60, 0, H);
    m.addColorStop(0, 'rgba(120,140,190,0)'); m.addColorStop(1, 'rgba(120,140,190,.10)');
    g.fillStyle = m; g.fillRect(0, H - 60, W, 60);
    return c;
  }

  function ensureLayers() {
    if (!skyLayer) skyLayer = paintSky();
    if (!clouds) clouds = paintClouds();
    if (!seaLayer) {
      seaLayer = paintSea();
      // bake the sea body into the sky; only a thin band at the horizon is redrawn tilted
      if (seaLayer && skyLayer) skyLayer.getContext('2d').drawImage(seaLayer, -140, HZ);
    }
    if (!shipLayer) shipLayer = paintShip();
    if (!vignette) vignette = paintVignette();
  }

  // ---------- animated sky ----------
  const TWINKLE = [];
  for (let i = 0; i < 34; i++) TWINKLE.push({ x: hash(i) * W, y: 10 + Math.pow(hash(i + 50), 1.3) * 250, f: 1 + hash(i + 99) * 3, p: hash(i + 7) * TAU, s: hash(i + 3) < 0.3 ? 2 : 1.4 });

  function drawSky(ctx, t) {
    // the bulwark and deck below y 412 are opaque and painted over this, so skip blitting them
    if (skyLayer) ctx.drawImage(skyLayer, 0, 0, W, FLOOR - 50, 0, 0, W, FLOOR - 50); else { ctx.fillStyle = '#121830'; ctx.fillRect(0, 0, W, H); }
    for (const s of TWINKLE) {
      const a = 0.35 + 0.45 * Math.sin(t * s.f + s.p);
      if (a <= 0.05) continue;
      ctx.globalAlpha = a;
      ctx.fillStyle = '#f4f6ff';
      ctx.fillRect(s.x, s.y, s.s, s.s);
      if (s.s > 1.5 && a > 0.6) { ctx.globalAlpha = a * 0.35; ctx.fillRect(s.x - 2, s.y + 0.5, 6, 1); ctx.fillRect(s.x + 0.5, s.y - 2, 1, 6); }
    }
    ctx.globalAlpha = 1;
    // a shooting star now and then (every ~17 s, deterministic from the clock)
    const cyc = Math.floor(t / 17), ph = t - cyc * 17;
    if (ph < 0.7) {
      const k = ph / 0.7, sx = 120 + hash(cyc) * 520, sy = 40 + hash(cyc + 5) * 90;
      const x = sx + k * 170, y = sy + k * 60;
      const tr = ctx.createLinearGradient(x - 70, y - 25, x, y);
      tr.addColorStop(0, 'rgba(255,255,255,0)'); tr.addColorStop(1, `rgba(255,255,240,${0.8 * Math.sin(k * Math.PI)})`);
      ctx.strokeStyle = tr; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x - 70, y - 25); ctx.lineTo(x, y); ctx.stroke();
    }
    // slow clouds; one drifts across the moon
    if (clouds && clouds.length) {
      for (let i = 0; i < 3; i++) {
        const span = W + 360, sp = 5 + i * 3;
        const x = ((i * 410 + t * sp) % span) - 340, y = 70 + i * 52;
        ctx.globalAlpha = 0.9 - i * 0.15;
        ctx.drawImage(clouds[i], x, y);
      }
      ctx.globalAlpha = 1;
    }
  }

  // ---------- sea (tilts with the swell) ----------
  const MOON_X = 770;
  function drawSea(ctx, t) {
    const a = -rockAngle(t);
    ctx.save();
    ctx.translate(480, 420); ctx.rotate(a); ctx.translate(-480, -420);
    if (skyLayer && seaLayer) ctx.drawImage(skyLayer, 0, HZ - 26, W, 52, -24, HZ - 26, W + 48, 52);
    else { ctx.fillStyle = '#122040'; ctx.fillRect(-140, HZ, W + 280, 300); }
    // bright horizon line
    ctx.fillStyle = 'rgba(190,200,240,.22)'; ctx.fillRect(-140, HZ, W + 280, 1.2);
    // moon path: stacked dashes that widen toward us and shimmer
    for (let i = 0; i < 22; i++) {
      const y = HZ + 3 + i * i * 0.32 + i * 2.2;
      if (y > FLOOR) break;
      for (let j = 0; j < 3; j++) {
        const n = i * 3 + j;
        const w = (6 + i * 3.2) * (0.4 + 0.6 * Math.abs(Math.sin(t * (1.1 + hash(n) * 1.8) + n)));
        const off = (hash(n + 40) - 0.5) * (10 + i * 4) + Math.sin(t * 0.9 + n) * 3;
        ctx.fillStyle = `rgba(255,240,205,${0.32 - i * 0.011})`;
        ctx.fillRect(MOON_X + off - w / 2, y, w, 1.3 + i * 0.06);
      }
    }
    // rolling wave rows: darker troughs under lighter crests, foam flecks
    for (let r = 0; r < 7; r++) {
      const y = HZ + 9 + r * r * 2.6 + r * 9, sp = 0.5 + r * 0.22, amp = 1.2 + r * 0.8, len = 0.035 - r * 0.003;
      ctx.beginPath();
      for (let x = -140; x <= W + 140; x += 16) {
        const yy = y + Math.sin(x * len + t * sp + r * 1.3) * amp;
        x === -140 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.strokeStyle = `rgba(150,180,235,${0.10 + r * 0.025})`; ctx.lineWidth = 1 + r * 0.25; ctx.stroke();
      ctx.save(); ctx.translate(0, 2 + r * 0.6);
      ctx.strokeStyle = `rgba(5,10,24,${0.25 + r * 0.03})`; ctx.lineWidth = 1 + r * 0.4; ctx.stroke();
      ctx.restore();
      for (let k = 0; k < 6; k++) {
        const fx = ((hash(r * 9 + k) * (W + 280) + t * (8 + r * 3)) % (W + 280)) - 140;
        const fy = y + Math.sin(fx * len + t * sp + r * 1.3) * amp - 1;
        const life = 0.5 + 0.5 * Math.sin(t * 1.4 + k * 2.1 + r);
        ctx.fillStyle = `rgba(220,232,255,${0.22 * life})`;
        ctx.fillRect(fx, fy, 6 + r * 2, 1.2);
      }
    }
    // enemy ships: the one on the side the ball comes from flashes
    const firing = shot ? (shot.x0 < 0 ? 0 : 1) : -1;
    drawEnemy(ctx, 110 + Math.sin(t * 0.1) * 10, t, firing === 0 ? shot : null, 1, 0);
    drawEnemy(ctx, 850 + Math.sin(t * 0.12 + 1) * 10, t, firing === 1 ? shot : null, -1, 1);
    ctx.restore();
  }

  function drawEnemy(ctx, x, t, s, face, id) {
    const bob = Math.sin(t * 1.1 + id * 2) * 1.5, roll = Math.sin(t * 0.9 + id) * 0.03;
    ctx.save(); ctx.translate(x, HZ + 2 + bob); ctx.rotate(roll); ctx.scale(face, 1);
    // dark reflection under the hull
    ctx.fillStyle = 'rgba(4,7,16,.45)';
    ctx.beginPath(); ctx.ellipse(0, 6, 36, 4, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#080b16';
    // hull with raised stern castle and bowsprit
    ctx.beginPath();
    ctx.moveTo(-36, -10); ctx.lineTo(-22, -10); ctx.lineTo(-20, -6); ctx.lineTo(30, -6); ctx.lineTo(44, -12);
    ctx.lineTo(28, 4); ctx.lineTo(-30, 4); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#080b16'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(30, -7); ctx.lineTo(54, -16); ctx.stroke();
    // masts and sails, rimmed by moonlight on the right
    for (const [mx, mh, sw] of [[-6, 44, 13], [14, 36, 11]]) {
      ctx.fillStyle = '#080b16'; ctx.fillRect(mx - 1, -6 - mh, 2, mh);
      ctx.beginPath(); ctx.moveTo(mx - sw, -mh + 2); ctx.quadraticCurveTo(mx, -mh + 8, mx + sw, -mh + 2);
      ctx.lineTo(mx + sw - 1, -14); ctx.quadraticCurveTo(mx, -10, mx - sw + 1, -14); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(180,190,230,.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(mx + sw * face, -mh + 2); ctx.lineTo(mx + (sw - 1) * face, -14); ctx.stroke();
    }
    // stern lantern and porthole glints
    const fl = 0.6 + 0.4 * Math.sin(t * 7 + id * 3) * Math.sin(t * 3.1 + id);
    ctx.fillStyle = `rgba(255,190,100,${0.5 + 0.4 * fl})`;
    ctx.fillRect(-34, -16, 2.5, 3);
    ctx.fillStyle = 'rgba(255,190,100,.55)';
    for (const px of [-12, -2, 8, 18]) ctx.fillRect(px, -3, 1.6, 1.4);
    // firing: flashes while aiming, then a lingering cloud of smoke
    if (s) {
      if (s.t < AIM + 0.15) {
        const k = s.t < AIM ? 0.5 + 0.5 * Math.sin(s.t * 30) : 1 - (s.t - AIM) / 0.15;
        const gl = ctx.createRadialGradient(34, -4, 1, 34, -4, 26 + 12 * k);
        gl.addColorStop(0, `rgba(255,220,150,${0.9 * k})`); gl.addColorStop(0.4, `rgba(255,140,60,${0.5 * k})`); gl.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = gl; ctx.fillRect(4, -40, 70, 70);
      }
      if (s.t > AIM * 0.5) {
        const st = s.t - AIM * 0.5;
        for (let i = 0; i < 4; i++) {
          const r = 4 + st * (6 + i * 2), a = Math.max(0, 0.35 - st * 0.18);
          ctx.fillStyle = `rgba(150,150,170,${a})`;
          ctx.beginPath(); ctx.arc(36 + st * 8 + i * 5, -6 - st * 6 - i * 3, r, 0, TAU); ctx.fill();
        }
      }
    }
    ctx.restore();
  }

  // ---------- rigging platforms ----------
  function rope(ctx, x0, y0, x1, y1, w) {
    ctx.strokeStyle = '#8a7350'; ctx.lineWidth = w;
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    // twist marks
    const len = Math.hypot(x1 - x0, y1 - y0), n = len / 5 | 0;
    ctx.strokeStyle = 'rgba(40,28,15,.55)'; ctx.lineWidth = 1;
    for (let i = 1; i < n; i++) {
      const f = i / n, x = x0 + (x1 - x0) * f, y = y0 + (y1 - y0) * f;
      ctx.beginPath(); ctx.moveTo(x - w * 0.5, y - 1); ctx.lineTo(x + w * 0.5, y + 1); ctx.stroke();
    }
  }

  function drawPlatform(ctx, p, t, i) {
    ctx.save();
    if (i < 2) {
      // slings up to the main yard, lashed with a knot at each end
      for (const ex of [p.x + 10, p.x + p.w - 10]) {
        rope(ctx, ex, p.y + 1, ex + (MAST_X - ex) * 0.03, 274, 2.4);
        ctx.fillStyle = '#6f5a3c'; ctx.beginPath(); ctx.arc(ex, p.y + 2, 3.4, 0, TAU); ctx.fill();
        ctx.fillStyle = '#3a2c1c'; ctx.fillRect(ex - 3, 272, 6, 4);   // lashing on the yard
      }
      // three planks with seams, end grain and iron cleats
      for (let k = 0; k < 3; k++) {
        const yy = p.y + k * (p.h / 3);
        ctx.fillStyle = k === 0 ? '#7c5735' : k === 1 ? '#6a4a2d' : '#573b23';
        ctx.fillRect(p.x, yy, p.w, p.h / 3 + 0.5);
      }
      ctx.fillStyle = 'rgba(15,8,3,.55)';
      ctx.fillRect(p.x, p.y + p.h / 3, p.w, 1); ctx.fillRect(p.x, p.y + 2 * p.h / 3, p.w, 1);
      ctx.fillStyle = 'rgba(15,8,3,.35)';
      for (const fx of [0.33, 0.71]) ctx.fillRect(p.x + p.w * fx, p.y, 1.2, p.h);
      ctx.fillStyle = '#3a2717'; ctx.fillRect(p.x - 3, p.y - 1, 4, p.h + 2); ctx.fillRect(p.x + p.w - 1, p.y - 1, 4, p.h + 2);
      ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(p.x, p.y + p.h, p.w, 3);   // underside shadow
    } else {
      // crow's nest: tapered barrel basket with iron hoops, rail of stanchions
      const cx = p.x + p.w / 2, top = p.y + 2, bot = p.y + 44;
      const bg = ctx.createLinearGradient(p.x, 0, p.x + p.w, 0);
      bg.addColorStop(0, '#24170e'); bg.addColorStop(0.35, '#5c3e27'); bg.addColorStop(0.6, '#4a311f'); bg.addColorStop(1, '#1e130b');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.moveTo(p.x, top); ctx.lineTo(p.x + p.w, top); ctx.lineTo(p.x + p.w - 16, bot); ctx.quadraticCurveTo(cx, bot + 6, p.x + 16, bot); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(10,5,2,.5)'; ctx.lineWidth = 1;
      for (let k = 1; k < 9; k++) {
        const xx = p.x + (p.w / 9) * k;
        ctx.beginPath(); ctx.moveTo(xx, top); ctx.lineTo(xx + (cx - xx) * 0.27, bot + 2); ctx.stroke();
      }
      for (const f of [0.3, 0.75]) {
        const yy = top + (bot - top) * f, inset = 16 * f;
        ctx.fillStyle = '#16120f'; ctx.fillRect(p.x + inset, yy, p.w - inset * 2, 3);
        ctx.fillStyle = 'rgba(200,200,220,.22)'; ctx.fillRect(p.x + inset, yy, p.w - inset * 2, 0.8);
      }
      // rim and floor edge
      ctx.fillStyle = '#7c5735'; ctx.fillRect(p.x - 2, p.y, p.w + 4, 6);
      ctx.fillStyle = '#3a2717'; ctx.fillRect(p.x - 2, p.y + 6, p.w + 4, 2);
      // short guard rail behind the standing edge
      ctx.strokeStyle = '#3d2818'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(p.x + 4, p.y - 18); ctx.lineTo(p.x + p.w - 4, p.y - 18); ctx.stroke();
      ctx.lineWidth = 2;
      for (let k = 0; k <= 4; k++) { const xx = p.x + 4 + (p.w - 8) * k / 4; ctx.beginPath(); ctx.moveTo(xx, p.y - 18); ctx.lineTo(xx, p.y); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,225,180,.25)'; ctx.fillRect(p.x + 4, p.y - 19, p.w - 8, 1);
    }
    // lit top edge where feet land
    ctx.fillStyle = 'rgba(245,220,175,.7)'; ctx.fillRect(p.x, p.y, p.w, 1.6);
    ctx.restore();
  }

  // ---------- Jolly Roger ----------
  function drawFlag(ctx, t) {
    ctx.save();
    ctx.translate(MAST_X + 10, 82);   // below the HUD band
    // halyard
    ctx.strokeStyle = 'rgba(190,170,130,.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-3, -18); ctx.lineTo(0, 0); ctx.lineTo(0, 40); ctx.stroke();
    const FW = 58, FH = 36, N = 10;
    const wav = (x, y) => Math.sin(t * 4.2 - x * 0.13 + y * 0.02) * (x / FW) * 4.5;
    for (let i = 0; i < N; i++) {
      const x0 = (FW / N) * i, x1 = (FW / N) * (i + 1);
      const slope = Math.cos(t * 4.2 - (x0 + x1) * 0.065);
      const shade = 18 + slope * 9 * (x0 / FW);
      ctx.fillStyle = `rgb(${shade | 0},${shade | 0},${(shade + 4) | 0})`;
      // ragged fly end: last strips are notched
      const tear = i >= N - 2 ? (i === N - 1 ? 7 : 3) : 0;
      ctx.beginPath();
      ctx.moveTo(x0, wav(x0, 0)); ctx.lineTo(x1, wav(x1, 0) + (i === N - 1 ? 4 : 0));
      ctx.lineTo(x1, FH + wav(x1, FH) - tear); ctx.lineTo(x0, FH + wav(x0, FH));
      ctx.closePath(); ctx.fill();
    }
    { ctx.fillStyle = '#121214'; ctx.beginPath(); ctx.moveTo(FW, 14 + wav(FW, 14)); ctx.lineTo(FW - 7, 18 + wav(FW - 7, 18)); ctx.lineTo(FW, 22 + wav(FW, 22)); ctx.closePath(); ctx.fill(); }
    // skull and crossbones riding the wave
    const sx = 26, sy = 15 + wav(26, 15);
    ctx.strokeStyle = 'rgba(232,226,208,.8)'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx - 10, sy + 6); ctx.lineTo(sx + 10, sy + 17); ctx.moveTo(sx + 10, sy + 6); ctx.lineTo(sx - 10, sy + 17); ctx.stroke();
    ctx.fillStyle = 'rgba(232,226,208,.85)';
    for (const [bx, by] of [[-10, 6], [10, 17], [10, 6], [-10, 17]]) {
      ctx.beginPath(); ctx.arc(sx + bx - 1.5, sy + by - 1, 1.8, 0, TAU); ctx.arc(sx + bx + 1.5, sy + by + 1, 1.8, 0, TAU); ctx.fill();
    }
    ctx.beginPath(); ctx.arc(sx, sy, 6.5, 0, TAU); ctx.fill();
    ctx.fillRect(sx - 3.5, sy + 3, 7, 4.5);
    ctx.fillStyle = '#141416';
    ctx.beginPath(); ctx.arc(sx - 2.4, sy - 0.5, 1.7, 0, TAU); ctx.arc(sx + 2.4, sy - 0.5, 1.7, 0, TAU); ctx.fill();
    ctx.fillRect(sx - 0.6, sy + 2, 1.2, 1.5);
    for (const tx of [-2, 0, 2]) ctx.fillRect(sx + tx - 0.3, sy + 5, 0.6, 2.5);
    ctx.lineCap = 'butt';
    ctx.restore();
  }

  // ---------- lanterns ----------
  function flicker(t, k) { return 0.82 + 0.1 * Math.sin(t * 9.3 + k) + 0.08 * Math.sin(t * 23.7 + k * 2.3); }

  function drawLanternLight(ctx, x, y, t, k) {
    // warm pool cast on rigging and the bulwark, swinging with the lantern
    const a = rockAngle(t) * 6, lx = x + Math.sin(a) * 32, ly = y + 32, f = flicker(t, k);
    const gl = ctx.createRadialGradient(lx, ly, 4, lx, ly, 130);
    gl.addColorStop(0, `rgba(255,180,90,${0.20 * f})`); gl.addColorStop(0.4, `rgba(255,160,80,${0.07 * f})`); gl.addColorStop(1, 'rgba(255,160,80,0)');
    ctx.fillStyle = gl; ctx.fillRect(lx - 130, ly - 130, 260, 260);
  }

  function drawLantern(ctx, x, y, t, k) {
    const a = rockAngle(t) * 6, f = flicker(t, k);
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.strokeStyle = 'rgba(40,30,20,.9)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 18); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 20, 2.5, 0, TAU); ctx.stroke();                 // hanging ring
    // tight glow
    const gl = ctx.createRadialGradient(0, 33, 1, 0, 33, 26);
    gl.addColorStop(0, `rgba(255,210,130,${0.55 * f})`); gl.addColorStop(1, 'rgba(255,190,100,0)');
    ctx.fillStyle = gl; ctx.fillRect(-26, 7, 52, 52);
    // brass cap and base
    ctx.fillStyle = '#6b5226';
    ctx.beginPath(); ctx.moveTo(-6, 26); ctx.lineTo(6, 26); ctx.lineTo(3, 22); ctx.lineTo(-3, 22); ctx.closePath(); ctx.fill();
    ctx.fillRect(-7, 41, 14, 3);
    // glass with flame
    ctx.fillStyle = `rgba(255,214,140,${0.55 + 0.2 * f})`; ctx.fillRect(-5, 26, 10, 15);
    ctx.fillStyle = `rgba(255,250,215,${0.8 * f})`;
    ctx.beginPath(); ctx.ellipse(0, 34 + (1 - f) * 2, 1.8, 3.6 * f, 0, 0, TAU); ctx.fill();
    // frame bars and a glint
    ctx.fillStyle = '#3a2c14'; ctx.fillRect(-5.5, 26, 1.3, 15); ctx.fillRect(4.2, 26, 1.3, 15); ctx.fillRect(-0.6, 26, 1.2, 15);
    ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(-3.6, 27.5, 1, 5);
    ctx.restore();
  }

  // ---------- cannon fire ----------
  function drawCannon(ctx, t) {
    if (shot) {
      const pulse = 0.5 + 0.5 * Math.sin(shot.t * 14);
      const k = clamp(shot.t / (AIM + FLY), 0, 1);
      const rs = 1.15 - 0.35 * k;
      ctx.save();
      // target zone: filled ellipse, shrinking ring, rotating tick marks, crosshair
      ctx.fillStyle = `rgba(255,70,50,${0.14 + 0.16 * pulse})`;
      ctx.beginPath(); ctx.ellipse(shot.tx, FLOOR + 6, RADIUS * 0.8, 9, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,90,60,${0.7 + 0.3 * pulse})`;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(shot.tx, FLOOR + 6, RADIUS * rs, 12 * rs, 0, 0, TAU); ctx.stroke();
      ctx.lineWidth = 2; ctx.strokeStyle = `rgba(255,200,170,${0.5 + 0.4 * pulse})`;
      for (let i = 0; i < 8; i++) {
        const a0 = i * TAU / 8 + shot.t * 2.2;
        ctx.beginPath(); ctx.ellipse(shot.tx, FLOOR + 6, RADIUS * rs + 7, 12 * rs + 3, 0, a0, a0 + 0.22); ctx.stroke();
      }
      ctx.strokeStyle = `rgba(255,120,90,${0.6 + 0.3 * pulse})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(shot.tx - 14, FLOOR + 6); ctx.lineTo(shot.tx + 14, FLOOR + 6); ctx.moveTo(shot.tx, FLOOR + 1); ctx.lineTo(shot.tx, FLOOR + 11); ctx.stroke();
      // warning mark bobbing above the spot
      const by = FLOOR - 18 - Math.abs(Math.sin(shot.t * 7)) * 6;
      ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(20,6,4,.7)'; ctx.strokeText('!', shot.tx, by);
      ctx.fillStyle = `rgba(255,120,90,${0.7 + 0.3 * pulse})`; ctx.fillText('!', shot.tx, by);
      // ball: smoke trail sampled back along its own arc, heat glow, iron sheen
      if (shot.t >= AIM) {
        const p = shotPos(shot);
        for (let i = 14; i >= 1; i--) {
          const q = shotPos({ t: shot.t - i * 0.02, tx: shot.tx, x0: shot.x0, y0: shot.y0 });
          if (q.u <= 0) continue;
          ctx.fillStyle = `rgba(165,165,180,${0.22 - i * 0.014})`;
          ctx.beginPath(); ctx.arc(q.x, q.y - i * 0.6, 3 + i * 0.9, 0, TAU); ctx.fill();
        }
        const gl = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 22);
        gl.addColorStop(0, 'rgba(255,170,80,.35)'); gl.addColorStop(1, 'rgba(255,170,80,0)');
        ctx.fillStyle = gl; ctx.fillRect(p.x - 22, p.y - 22, 44, 44);
        const bg = ctx.createRadialGradient(p.x - 3, p.y - 3, 1, p.x, p.y, 10);
        bg.addColorStop(0, '#6a6a78'); bg.addColorStop(0.5, '#22222a'); bg.addColorStop(1, '#0a0a0e');
        ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, TAU); ctx.fill();
        ctx.strokeStyle = 'rgba(255,190,130,.6)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0.2, 1.6); ctx.stroke();
        // shadow on the deck grows as it nears
        ctx.fillStyle = `rgba(0,0,0,${0.15 + 0.35 * p.u})`;
        ctx.beginPath(); ctx.ellipse(p.x, FLOOR + 4, 6 + 10 * p.u, 2 + 2 * p.u, 0, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
    for (const b of booms) {
      const bt = b.t;
      ctx.save();
      // scorch decal with cracked boards, fading out
      ctx.globalAlpha = 0.5 * Math.max(0, 1 - bt / 4);
      const sc = ctx.createRadialGradient(b.x, FLOOR + 10, 4, b.x, FLOOR + 10, 56);
      sc.addColorStop(0, 'rgba(10,5,2,1)'); sc.addColorStop(1, 'rgba(10,5,2,0)');
      ctx.fillStyle = sc; ctx.beginPath(); ctx.ellipse(b.x, FLOOR + 10, 56, 9, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,140,60,.8)'; ctx.lineWidth = 1;
      if (bt < 1.5) {
        ctx.globalAlpha = Math.max(0, 1 - bt / 1.5) * 0.8;
        for (let i = 0; i < 5; i++) {
          const ex = b.x + (hash(b.x + i) - 0.5) * 70;
          ctx.fillStyle = '#ff9a4a'; ctx.fillRect(ex, FLOOR + 6 + hash(b.x + i + 9) * 8, 2, 1.5);   // embers
        }
      }
      ctx.globalAlpha = 1;
      if (bt < 0.6) {
        const k = bt / 0.6;
        // flash, fireball dome and shock ring
        ctx.globalAlpha = Math.max(0, 1 - k * 2);
        const fl = ctx.createRadialGradient(b.x, b.y - 12, 2, b.x, b.y - 12, 110);
        fl.addColorStop(0, 'rgba(255,245,210,.9)'); fl.addColorStop(1, 'rgba(255,200,120,0)');
        ctx.fillStyle = fl; ctx.fillRect(b.x - 110, b.y - 122, 220, 220);
        ctx.globalAlpha = Math.max(0, 1 - k);
        const fb = ctx.createRadialGradient(b.x, b.y - 8, 2, b.x, b.y - 8, 20 + 60 * k);
        fb.addColorStop(0, '#fff1c0'); fb.addColorStop(0.4, '#ffb347'); fb.addColorStop(1, 'rgba(255,90,40,0)');
        ctx.fillStyle = fb; ctx.beginPath(); ctx.arc(b.x, b.y - 8, 20 + 60 * k, Math.PI, 0); ctx.fill();
        ctx.strokeStyle = `rgba(255,220,170,${0.7 * (1 - k)})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(b.x, FLOOR + 4, 20 + 110 * k, 4 + 12 * k, 0, 0, TAU); ctx.stroke();
      }
      // smoke column rising and spreading
      if (bt > 0.1 && bt < 3) {
        for (let i = 0; i < 6; i++) {
          const st = bt - 0.1, h = hash(b.x * 0.37 + i);
          const r = 10 + st * (10 + h * 8), a = Math.max(0, 0.42 * (1 - st / 2.9));
          ctx.globalAlpha = a;
          ctx.fillStyle = i % 2 ? '#4c4c58' : '#5d5d6a';
          ctx.beginPath(); ctx.arc(b.x + (h - 0.5) * 40 + st * (h - 0.5) * 20, b.y - 18 - st * (26 + i * 8), r, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    }
  }

  // ---------- deck clutter ----------
  function drawBarrel(ctx, x, y, w, h, n) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#2c1a0e'); g.addColorStop(0.32, '#7a522c'); g.addColorStop(0.55, '#5e3e22'); g.addColorStop(1, '#22150b');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + 3, y); ctx.lineTo(x + w - 3, y);
    ctx.quadraticCurveTo(x + w + 2, y + h / 2, x + w - 3, y + h);
    ctx.lineTo(x + 3, y + h);
    ctx.quadraticCurveTo(x - 2, y + h / 2, x + 3, y);
    ctx.fill();
    // staves, curving with the bulge
    ctx.strokeStyle = 'rgba(15,8,3,.45)'; ctx.lineWidth = 0.9;
    for (let k = 1; k < 5; k++) {
      const f = k / 5, xm = x + w * f, bul = (f - 0.5) * 3;
      ctx.beginPath(); ctx.moveTo(x + 3 + (w - 6) * f, y + 1); ctx.quadraticCurveTo(xm + bul, y + h / 2, x + 3 + (w - 6) * f, y + h - 1); ctx.stroke();
    }
    // iron hoops with a highlight
    for (const fy of [0.14, 0.32, 0.68, 0.86]) {
      const yy = y + h * fy, bulge = Math.sin(fy * Math.PI) * 2.2;
      ctx.fillStyle = '#18140f'; ctx.fillRect(x - bulge + 1, yy, w + bulge * 2 - 2, 2.6);
      ctx.fillStyle = 'rgba(210,210,230,.28)'; ctx.fillRect(x + w * 0.25, yy, w * 0.25, 0.9);
    }
    // bung with a stained drip
    ctx.fillStyle = '#20140b'; ctx.beginPath(); ctx.arc(x + w * 0.55, y + h * 0.5, 2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(40,15,10,.4)'; ctx.fillRect(x + w * 0.55 - 0.8, y + h * 0.5, 1.6, h * 0.22);
    // stencil mark on one
    if (n === 1) {
      ctx.fillStyle = 'rgba(230,215,180,.35)'; ctx.font = 'bold 8px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('XXX', x + w / 2, y + h * 0.58);
    }
    // lid rim
    ctx.fillStyle = '#4e3520'; ctx.beginPath(); ctx.ellipse(x + w / 2, y + 1, w / 2 - 3, 2.6, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(240,210,160,.45)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + 1, w / 2 - 3, 2.6, 0, Math.PI, TAU); ctx.stroke();
  }

  function drawCrate(ctx, x, y, w, h, dmg, mark) {
    // boards
    for (let k = 0; k < 4; k++) {
      const by = y + (h / 4) * k;
      ctx.fillStyle = ['#7d5834', '#73502f', '#7a5532', '#6c4a2b'][k];
      ctx.fillRect(x, by, w, h / 4 + 0.5);
      ctx.fillStyle = 'rgba(15,8,3,.45)'; ctx.fillRect(x, by, w, 0.9);
    }
    // frame and diagonal brace
    ctx.strokeStyle = '#3b2716'; ctx.lineWidth = 3.4; ctx.strokeRect(x + 1.7, y + 1.7, w - 3.4, h - 3.4);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + 4, y + h - 4); ctx.lineTo(x + w - 4, y + 4); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,170,.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 4, y + h - 6); ctx.lineTo(x + w - 6, y + 4); ctx.stroke();
    // nail heads at the corners
    ctx.fillStyle = '#1b1610';
    for (const [nx, ny] of [[4, 4], [w - 4, 4], [4, h - 4], [w - 4, h - 4]]) { ctx.beginPath(); ctx.arc(x + nx, y + ny, 1.1, 0, TAU); ctx.fill(); }
    // stencilled cargo mark
    if (mark) {
      ctx.save(); ctx.globalAlpha = 0.35; ctx.fillStyle = '#e8d8b0';
      ctx.beginPath(); ctx.arc(x + w * 0.27, y + h * 0.38, 4, 0, TAU); ctx.fill();
      ctx.fillRect(x + w * 0.27 - 2.5, y + h * 0.38 + 2, 5, 3);
      ctx.font = 'bold 7px sans-serif'; ctx.textAlign = 'left'; ctx.fillText('RUM', x + w * 0.56, y + h * 0.78);
      ctx.restore();
    }
    // cracks and splinters as it takes damage
    ctx.strokeStyle = 'rgba(12,6,2,.9)'; ctx.lineWidth = 1.8;
    if (dmg > 0.25) {
      ctx.beginPath(); ctx.moveTo(x + w * 0.3, y); ctx.lineTo(x + w * 0.42, y + h * 0.45); ctx.lineTo(x + w * 0.35, y + h * 0.7); ctx.stroke();
      ctx.fillStyle = '#a77a4a'; ctx.fillRect(x + w * 0.41, y + h * 0.43, 3, 1.2);
    }
    if (dmg > 0.5) {
      ctx.beginPath(); ctx.moveTo(x + w, y + h * 0.3); ctx.lineTo(x + w * 0.7, y + h * 0.5); ctx.lineTo(x + w * 0.75, y + h); ctx.stroke();
    }
    if (dmg > 0.75) {
      ctx.fillStyle = '#0c0805'; ctx.beginPath(); ctx.moveTo(x + w * 0.55, y + h * 0.2); ctx.lineTo(x + w * 0.7, y + h * 0.35); ctx.lineTo(x + w * 0.58, y + h * 0.55); ctx.lineTo(x + w * 0.5, y + h * 0.38); ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = 'rgba(240,210,160,.5)'; ctx.fillRect(x, y, w, 1.3);
  }

  function drawObstacle(ctx, o, t) {
    if (!o || !(o.w > 0) || !(o.h > 0)) return;
    ctx.save();
    // contact shadow on the deck
    const sg = ctx.createRadialGradient(o.x + o.w / 2, o.y + o.h + 2, 2, o.x + o.w / 2, o.y + o.h + 2, o.w * 0.7);
    sg.addColorStop(0, 'rgba(0,0,0,.55)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y + o.h + 2, o.w * 0.7, 6, 0, 0, TAU); ctx.fill();
    if (o.kind === 'barrels') {
      const bw = o.w / 2, bh = o.h * 0.58;
      drawBarrel(ctx, o.x, o.y + o.h - bh, bw, bh, 0);
      drawBarrel(ctx, o.x + bw, o.y + o.h - bh, bw, bh, 1);
      // wedges under the top barrel
      ctx.fillStyle = '#2a1b10'; ctx.fillRect(o.x + bw * 0.55, o.y + o.h - bh - 3, 5, 3); ctx.fillRect(o.x + bw * 1.3, o.y + o.h - bh - 3, 5, 3);
      drawBarrel(ctx, o.x + bw * 0.5, o.y, bw, o.h - bh, 2);
      // lashing rope around the stack
      ctx.strokeStyle = 'rgba(150,120,80,.75)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(o.x + 1, o.y + o.h - bh * 0.55); ctx.quadraticCurveTo(o.x + o.w / 2, o.y + o.h - bh * 0.45, o.x + o.w - 1, o.y + o.h - bh * 0.55); ctx.stroke();
    } else if (o.kind === 'crates') {
      if (o.hp != null && o.hp <= 0) {
        // splintered remains: broken boards, spilled straw and a rolling bottle
        ctx.fillStyle = 'rgba(200,170,90,.35)';
        ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y + o.h - 2, o.w * 0.55, 4, 0, 0, TAU); ctx.fill();
        const planks = [[14, -4, 34, 0.15], [36, -8, 30, -0.25], [4, -3, 18, 0], [o.w - 20, -3, 16, 0.05], [24, -12, 22, 0.6]];
        for (const [px, py, pw, pr] of planks) {
          ctx.save(); ctx.translate(o.x + px, o.y + o.h + py); ctx.rotate(pr);
          ctx.fillStyle = '#6d4b2c'; ctx.fillRect(0, 0, pw, 5);
          ctx.fillStyle = 'rgba(255,220,170,.25)'; ctx.fillRect(0, 0, pw, 1);
          ctx.fillStyle = '#a67b4c'; ctx.beginPath(); ctx.moveTo(pw, 0); ctx.lineTo(pw + 5, 2); ctx.lineTo(pw, 5); ctx.fill();   // splintered end
          ctx.restore();
        }
        ctx.fillStyle = '#2d4a33'; ctx.save(); ctx.translate(o.x + o.w - 10, o.y + o.h - 4); ctx.rotate(1.45);
        ctx.fillRect(-3, -8, 6, 12); ctx.fillRect(-1.2, -12, 2.4, 4); ctx.restore();
      } else {
        const dmg = o.hp != null ? 1 - o.hp / CRATE_HP : 0;
        const half = o.h / 2;
        drawCrate(ctx, o.x, o.y + half, o.w, half, dmg, true);
        drawCrate(ctx, o.x + 6, o.y, o.w - 12, half, dmg, false);
        // shadow the top crate casts on the lower one
        ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(o.x + 6, o.y + half, o.w - 12, 2.5);
        // cargo net over the stack
        ctx.strokeStyle = 'rgba(160,135,95,.45)'; ctx.lineWidth = 1;
        for (let k = 0; k <= 5; k++) {
          const nx = o.x + 4 + (o.w - 8) * k / 5;
          ctx.beginPath(); ctx.moveTo(nx, o.y + o.h - 1); ctx.quadraticCurveTo(nx + 3, o.y + half, o.x + o.w / 2 + (nx - o.x - o.w / 2) * 0.8, o.y + 2); ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  // ---------- foreground ----------
  function drawFore(ctx, t) {
    if (vignette) for (const [x, y, w, h] of VIG) ctx.drawImage(vignette, x, y, w, h, x, y, w, h);
    // fine spray drifting over the rail, lit by the moon
    for (let i = 0; i < 22; i++) {
      const ph = (t * (0.25 + (i % 5) * 0.06) + hash(i) ) % 1;
      const x = (hash(i + 30) * (W + 40) + t * (18 + (i % 4) * 6)) % (W + 40) - 20;
      const y = FLOOR - 26 - ph * 140;
      ctx.globalAlpha = 0.45 * Math.sin(ph * Math.PI);
      ctx.fillStyle = '#d6e2ff';
      ctx.fillRect(x, y, i % 3 ? 1.5 : 2.2, i % 3 ? 1.5 : 2.2);
    }
    ctx.globalAlpha = 1;
    // foreground rigging at the corners: a rope and a block with a hook
    const sw = rockAngle(t) * 400;
    ctx.strokeStyle = 'rgba(16,10,6,.85)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(-10, 90); ctx.quadraticCurveTo(40, 200 + sw, 20, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(W + 10, 90); ctx.quadraticCurveTo(W - 40, 200 - sw, W - 20, H); ctx.stroke();
    ctx.lineWidth = 2;
    for (const s of [1, -1]) {
      const bx = s > 0 ? 34 + sw * 0.08 : W - 34 - sw * 0.08, by = 158;
      ctx.beginPath(); ctx.moveTo(s > 0 ? 6 : W - 6, 90); ctx.lineTo(bx, by - 10); ctx.stroke();
      ctx.fillStyle = 'rgba(16,10,6,.9)'; ctx.beginPath(); ctx.ellipse(bx, by, 6, 9, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(bx, by + 16, 4, 0, Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx, by + 8); ctx.lineTo(bx, by + 16); ctx.stroke();
    }
  }

  // ---------- cannon hazard ----------
  const AIM = 0.7, FLY = 1.1;               // telegraph = AIM + FLY = 1.8 s
  const RADIUS = 80;
  let shot = null;                           // { side, tx, t, x0, y0, done }
  let nextShot = 6, targetSlot = 0, booms = [];
  const hitCd = [0, 0];
  let clock = 0;

  function fire(fighters, game) {
    const f = fighters[targetSlot % 2] || fighters[0];
    targetSlot++;
    const fx = f && isFinite(f.x) ? f.x : 480;
    const tx = clamp(fx + (Math.random() - 0.5) * 120, 90, 870);
    const side = tx > 480 ? -1 : 1;           // fire from the far side so it crosses the stage
    shot = { side, tx, t: 0, x0: side < 0 ? -40 : W + 40, y0: 250 };
  }

  function impact(fighters, game) {
    const x = shot.tx, y = FLOOR;
    booms.push({ x, y, t: 0 });
    if (game.shake) game.shake(10);
    if (game.particle) {
      for (let i = 0; i < 26; i++) {
        const a = -Math.PI * Math.random(), s = 120 + Math.random() * 320;
        game.particle({ x, y: y - 4, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6, col: Math.random() < 0.5 ? '#ffb347' : '#ff6a3d', r: 3 + Math.random() * 3 });
      }
      for (let i = 0; i < 12; i++) {
        game.particle({ x: x + (Math.random() - 0.5) * 60, y: y - 10, vx: (Math.random() - 0.5) * 300, vy: -200 - Math.random() * 250, life: 0.8, col: '#8a5a36', r: 3 });
      }
      for (let i = 0; i < 10; i++) {
        game.particle({ x: x + (Math.random() - 0.5) * 50, y: y - 20, vx: (Math.random() - 0.5) * 40, vy: -40 - Math.random() * 40, life: 1.0, col: '#6b6b78', r: 6, float: true });
      }
    }
    // a cannonball landing on the cargo smashes it open
    for (const o of obstacles) {
      if (o.hp == null || o.hp <= 0) continue;
      if (x > o.x - 40 && x < o.x + o.w + 40) {
        o.hp = Math.max(0, o.hp - 25);
        if (o.hp <= 0 && game.particle) {
          for (let i = 0; i < 14; i++) game.particle({ x: o.x + Math.random() * o.w, y: o.y + Math.random() * o.h, vx: (Math.random() - 0.5) * 360, vy: -150 - Math.random() * 250, life: 0.8, col: '#8a5a36', r: 4 });
        }
      }
    }
    for (const f of fighters) {
      if (!f || f.ko) continue;
      const slot = f.slot === 1 ? 1 : 0;
      const dx = f.x - x, dy = (f.y - 50) - y;
      if (Math.hypot(dx, dy) < RADIUS && hitCd[slot] <= 0 && game.fighting && game.hurt) {
        hitCd[slot] = 1.2;
        game.hurt(f, { dmg: 10, kb: 280, fromX: x, stun: 0.35, heavy: true, word: 'BOOM' });
      }
    }
    if (!game.particle && game.word) game.word(x, y - 60, 'BOOM', '#ffb347');
  }

  function shotPos(s) {
    const u = clamp((s.t - AIM) / FLY, 0, 1);
    return {
      u,
      x: s.x0 + (s.tx - s.x0) * u,
      y: s.y0 + (FLOOR - 8 - s.y0) * u - 200 * 4 * u * (1 - u),
    };
  }


  const arena = {
    id: 'arena06',
    name: 'Pirate Ship',
    nameVi: 'Tàu cướp biển',
    hint: 'Rocking deck, cannon fire',
    hintVi: 'Boong tàu lắc, đạn pháo',
    floorY: FLOOR,
    gravityScale: 1,
    platforms,
    obstacles,

    reset() {
      shot = null; booms = []; nextShot = 6; targetSlot = Math.random() < 0.5 ? 0 : 1;
      hitCd[0] = hitCd[1] = 0;
      for (let i = 0; i < BASE.length; i++) { platforms[i].x = BASE[i].x; platforms[i].y = BASE[i].y; }
      // the engine restores hp itself; this keeps a standalone load correct too
      obstacles[2].hp = CRATE_HP;
    },

    update(dt, fighters, game) {
      try {
        if (!(dt > 0)) return;
        dt = Math.min(dt, 0.05);
        fighters = fighters || [];
        game = game || {};
        clock += dt;
        const now = clock;
        // swell: platforms bob, fighters on the deck drift slightly downhill
        for (let i = 0; i < BASE.length; i++) {
          const amp = i === 2 ? 6 : 4;
          platforms[i].y = BASE[i].y + Math.sin(now * ROCK_W * 2 + i * 1.7) * amp;
          if (i === 2) platforms[i].x = BASE[i].x + Math.sin(now * ROCK_W) * 8;
        }
        const tilt = Math.sin(now * ROCK_W);
        for (const f of fighters) {
          if (!f || f.ko || !f.onGround) continue;
          if (Math.abs(f.y - FLOOR) > 2) continue;
          f.x = clamp(f.x + tilt * DRIFT * dt, 28, W - 28);
        }
        hitCd[0] = Math.max(0, hitCd[0] - dt);
        hitCd[1] = Math.max(0, hitCd[1] - dt);
        for (let i = booms.length - 1; i >= 0; i--) { booms[i].t += dt; if (booms[i].t > 4) booms.splice(i, 1); }

        const live = game.state === 'fight' || game.state === 'menu';
        if (shot) {
          shot.t += dt;
          if (shot.t >= AIM + FLY) { impact(fighters, game); shot = null; }
        } else if (live) {
          nextShot -= dt;
          if (nextShot <= 0) { fire(fighters, game); nextShot = 8 + Math.random() * 4; }
        }
      } catch (e) { /* never break the game loop */ }
    },

    drawBackground(ctx, t) {
      try {
        ensureLayers();
        ctx.save();
        drawSky(ctx, t);
        drawSea(ctx, t);
        if (shipLayer) ctx.drawImage(shipLayer, 0, 0);
        drawLanternLight(ctx, 240, 277, t, 0);
        drawLanternLight(ctx, 720, 277, t, 1);
        drawFlag(ctx, t);
        for (let i = 0; i < platforms.length; i++) drawPlatform(ctx, platforms[i], t, i);
        drawLantern(ctx, 240, 277, t, 0);
        drawLantern(ctx, 720, 277, t, 1);
        for (const o of obstacles) drawObstacle(ctx, o, t);
        drawCannon(ctx, t);
        ctx.restore();
        ctx.globalAlpha = 1;
      } catch (e) { try { ctx.restore(); } catch (_) {} }
    },

    drawForeground(ctx, t) {
      try {
        ctx.save();
        drawFore(ctx, t);
        ctx.restore();
        ctx.globalAlpha = 1;
      } catch (e) { try { ctx.restore(); } catch (_) {} }
    },
  };

  arena.reset();
  (window.STICK_ARENAS = window.STICK_ARENAS || []).push(arena);
})();
