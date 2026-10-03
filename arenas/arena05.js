// Arena 05: Jungle (Rừng rậm)
// Two tree-branch ledges, a log swinging on vines overhead, a mud pool in the middle that bogs fighters down,
// tree stumps by the walls and breakable bamboo fences on each side of the mud.
(function () {
  const W = 960, H = 540, FLOOR = 462;
  const MUD = { x0: 398, x1: 562 };          // mud pool on the floor (centered, away from both spawns)
  const LOG = { cx: 480, y: 210, w: 180, amp: 46, speed: 1.05 }; // swinging log platform

  let seed = 5;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let swingT = 0;   // swing clock, reset each round
  let staticLayer = null;
  const splashCd = [0, 0];

  // ---------- helpers ----------
  function leaf(g, x, y, len, ang, col) {
    g.save();
    g.translate(x, y); g.rotate(ang);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0);
    g.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0);
    g.fill();
    g.restore();
  }
  function leafCluster(g, x, y, n, size, cols) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      leaf(g, x + Math.cos(a) * size * 0.3 * rnd(), y + Math.sin(a) * size * 0.25 * rnd(), size * (0.5 + rnd() * 0.6), a, cols[(rnd() * cols.length) | 0]);
    }
  }
  function trunk(g, x, wTop, wBot, col, dark) {
    const grd = g.createLinearGradient(x - wBot / 2, 0, x + wBot / 2, 0);
    grd.addColorStop(0, dark); grd.addColorStop(0.45, col); grd.addColorStop(1, dark);
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x - wTop / 2, 0);
    g.lineTo(x + wTop / 2, 0);
    g.quadraticCurveTo(x + wBot / 2 - 4, FLOOR - 40, x + wBot / 2 + 14, FLOOR + 4);
    g.lineTo(x - wBot / 2 - 14, FLOOR + 4);
    g.quadraticCurveTo(x - wBot / 2 + 4, FLOOR - 40, x - wTop / 2, 0);
    g.fill();
  }
  // a thick branch whose walkable top edge is y, running from x0 to x1
  function branch(g, x0, x1, y, fromLeft) {
    const thick = 18;
    const base = fromLeft ? x0 : x1, tip = fromLeft ? x1 : x0;
    const grd = g.createLinearGradient(0, y - 2, 0, y + thick + 8);
    grd.addColorStop(0, '#6b5135'); grd.addColorStop(0.35, '#4a3622'); grd.addColorStop(1, '#2a1d12');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(base, y - 4);
    g.lineTo(tip, y);
    g.quadraticCurveTo(tip + (fromLeft ? 10 : -10), y + 7, tip, y + 11);
    g.quadraticCurveTo((base + tip) / 2, y + thick + 2, base, y + thick + 16);
    g.closePath();
    g.fill();
    // bark lines
    g.strokeStyle = 'rgba(20,12,6,.55)'; g.lineWidth = 1.5;
    for (let i = 0; i < 9; i++) {
      const bx = Math.min(x0, x1) + 14 + rnd() * (Math.abs(x1 - x0) - 28);
      g.beginPath(); g.moveTo(bx, y + 4); g.lineTo(bx + 14 * (rnd() - 0.5), y + 11 + rnd() * 5); g.stroke();
    }
    // walkable top highlight (moss)
    g.strokeStyle = 'rgba(126,170,84,.55)'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(Math.min(x0, x1) + 4, y + 1); g.lineTo(Math.max(x0, x1) - 4, y + 1); g.stroke();
    for (let i = 0; i < 14; i++) {
      const mx = Math.min(x0, x1) + 6 + rnd() * (Math.abs(x1 - x0) - 12);
      leaf(g, mx, y + 1, 7 + rnd() * 6, Math.PI + (rnd() - 0.5) * 1.2 + (rnd() < 0.5 ? 0 : Math.PI), rnd() < 0.5 ? '#3f6a2e' : '#4f7d36');
    }
    // leafy tuft at the tip, hanging below the walk line only
    for (let i = 0; i < 16; i++) leaf(g, tip + (fromLeft ? -8 : 8) * rnd(), y + 10 + rnd() * 8, 16 + rnd() * 16, Math.PI / 2 + (rnd() - 0.5) * 1.8, ['#2d5124', '#3a6a2b', '#25441e'][(rnd() * 3) | 0]);
  }

  // ---------- static layer (painted once) ----------
  function paintStatic() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    seed = 5;
    // jungle air
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0b1a12'); sky.addColorStop(0.45, '#163023'); sky.addColorStop(0.8, '#11231a'); sky.addColorStop(1, '#0a130d');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // distant haze glow behind the arena
    const glow = g.createRadialGradient(W / 2, 250, 30, W / 2, 260, 520);
    glow.addColorStop(0, 'rgba(88,140,92,.22)'); glow.addColorStop(1, 'rgba(88,140,92,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    // three layers of far trunks
    const layers = [
      { n: 9, w: [14, 26], col: '#173326', dark: '#11271d' },
      { n: 7, w: [22, 38], col: '#142a1f', dark: '#0e2017' },
      { n: 5, w: [30, 50], col: '#112319', dark: '#0b1a12' },
    ];
    for (const L of layers) {
      for (let i = 0; i < L.n; i++) {
        const x = 140 + rnd() * (W - 280), w = L.w[0] + rnd() * (L.w[1] - L.w[0]);
        trunk(g, x, w * 0.8, w, L.col, L.dark);
      }
    }
    // hanging roots / lianas in the far back (static)
    g.strokeStyle = 'rgba(40,72,44,.45)'; g.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const x = rnd() * W, len = 120 + rnd() * 200;
      g.beginPath(); g.moveTo(x, 0);
      g.bezierCurveTo(x + 18, len * 0.3, x - 18, len * 0.7, x + 6, len); g.stroke();
    }
    // big framing trunks that hold the two branches
    trunk(g, 62, 92, 112, '#3b2b1c', '#1c140c');
    trunk(g, W - 62, 92, 112, '#3b2b1c', '#1c140c');
    // bark texture on big trunks
    g.strokeStyle = 'rgba(12,8,4,.5)'; g.lineWidth = 2;
    for (const tx of [62, W - 62]) {
      for (let i = 0; i < 22; i++) {
        const x = tx - 40 + rnd() * 80, y = 90 + rnd() * (FLOOR - 120);
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 4, y + 20, x - 2, y + 40 + rnd() * 30); g.stroke();
      }
      // moss patches
      for (let i = 0; i < 16; i++) leaf(g, tx - 40 + rnd() * 80, 100 + rnd() * (FLOOR - 160), 10 + rnd() * 8, rnd() * 6.28, 'rgba(70,112,52,.55)');
    }
    // branches (the two side platforms)
    branch(g, 100, 300, 330, true);
    branch(g, 660, 860, 330, false);
    // canopy across the top (HUD band, kept dim)
    for (let i = 0; i < 46; i++) leafCluster(g, rnd() * W, rnd() * 70 - 6, 8, 46, ['#14301c', '#1a3a22', '#0f2416', '#21462a']);
    for (let i = 0; i < 18; i++) leafCluster(g, rnd() < 0.5 ? rnd() * 160 : W - rnd() * 160, 60 + rnd() * 90, 7, 40, ['#1a3a22', '#22492b', '#163120']);
    // ground: soil
    const soil = g.createLinearGradient(0, FLOOR, 0, H);
    soil.addColorStop(0, '#2c2216'); soil.addColorStop(1, '#130e08');
    g.fillStyle = soil; g.fillRect(0, FLOOR, W, H - FLOOR);
    for (let i = 0; i < 260; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '90,70,44' : '10,8,4'},${0.25 + rnd() * 0.3})`;
      g.fillRect(rnd() * W, FLOOR + 6 + rnd() * (H - FLOOR - 6), 2 + rnd() * 3, 1 + rnd() * 2);
    }
    // mud pool (sunk a little into the floor line)
    const mx = (MUD.x0 + MUD.x1) / 2, mw = (MUD.x1 - MUD.x0) / 2;
    g.fillStyle = '#1d150c';
    g.beginPath(); g.ellipse(mx, FLOOR + 10, mw + 10, 18, 0, 0, Math.PI * 2); g.fill();
    const mud = g.createLinearGradient(0, FLOOR - 2, 0, FLOOR + 22);
    mud.addColorStop(0, '#5a4128'); mud.addColorStop(1, '#2e2113');
    g.fillStyle = mud;
    g.beginPath(); g.ellipse(mx, FLOOR + 6, mw, 13, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(160,130,90,.18)';
    g.beginPath(); g.ellipse(mx - 30, FLOOR + 2, mw * 0.45, 3, 0, 0, Math.PI * 2); g.fill();
    // grass edge along the floor (skipping the mud)
    g.strokeStyle = '#3f6a2e'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, FLOOR); g.lineTo(MUD.x0 - 8, FLOOR); g.moveTo(MUD.x1 + 8, FLOOR); g.lineTo(W, FLOOR); g.stroke();
    for (let x = 4; x < W; x += 5 + rnd() * 6) {
      if (x > MUD.x0 - 10 && x < MUD.x1 + 10) continue;
      const h = 6 + rnd() * 12;
      g.strokeStyle = rnd() < 0.5 ? '#4b7d34' : '#355c27'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(x, FLOOR + 2); g.quadraticCurveTo(x + 2, FLOOR - h * 0.6, x + (rnd() - 0.5) * 8, FLOOR - h); g.stroke();
    }
    // reeds at the mud edges (a visual cue that the pool is special)
    for (const ex of [MUD.x0 - 6, MUD.x1 + 6]) {
      for (let i = 0; i < 6; i++) {
        const x = ex + (rnd() - 0.5) * 16, h = 20 + rnd() * 18;
        g.strokeStyle = '#5c7a3a'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(x, FLOOR + 4); g.lineTo(x + (rnd() - 0.5) * 6, FLOOR - h); g.stroke();
        g.fillStyle = '#4a3420';
        g.fillRect(x - 2, FLOOR - h - 2 + rnd() * 4, 4, 9);
      }
    }
    return c;
  }


  // ---------- obstacles (solid terrain) ----------
  // tree stumps by the walls (unbreakable) and bamboo fences guarding the mud (breakable)
  const OBSTACLES = [
    { x: 96, y: FLOOR - 48, w: 56, h: 48, kind: 'stump' },
    { x: W - 152, y: FLOOR - 48, w: 56, h: 48, kind: 'stump' },
    { x: 318, y: FLOOR - 84, w: 26, h: 84, kind: 'bamboo', hp: 30 },
    { x: W - 344, y: FLOOR - 84, w: 26, h: 84, kind: 'bamboo', hp: 30 },
  ];
  const BAMBOO_HP = 30;

  function drawStump(g, o) {
    const { x, y, w, h } = o;
    // flared roots
    g.fillStyle = '#2e2014';
    g.beginPath();
    g.moveTo(x - 12, y + h); g.quadraticCurveTo(x + 2, y + h - 10, x + 4, y + 14);
    g.lineTo(x + w - 4, y + 14); g.quadraticCurveTo(x + w - 2, y + h - 10, x + w + 12, y + h);
    g.closePath(); g.fill();
    // body
    const grd = g.createLinearGradient(x, 0, x + w, 0);
    grd.addColorStop(0, '#2a1d12'); grd.addColorStop(0.45, '#5a4129'); grd.addColorStop(1, '#2a1d12');
    g.fillStyle = grd; g.fillRect(x + 2, y + 6, w - 4, h - 6);
    g.strokeStyle = 'rgba(15,9,4,.6)'; g.lineWidth = 1.5;
    for (let i = 0; i < 4; i++) { const bx = x + 9 + i * 12; g.beginPath(); g.moveTo(bx, y + 14); g.lineTo(bx + 2, y + h - 4); g.stroke(); }
    // cut top with rings (walkable)
    g.fillStyle = '#9a7a52';
    g.beginPath(); g.ellipse(x + w / 2, y + 6, w / 2, 7, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(80,56,32,.8)'; g.lineWidth = 1;
    for (const r of [0.7, 0.45, 0.2]) { g.beginPath(); g.ellipse(x + w / 2, y + 6, w / 2 * r, 7 * r, 0, 0, Math.PI * 2); g.stroke(); }
    // moss and a mushroom
    leaf(g, x + 6, y + h - 8, 12, -0.4, 'rgba(70,112,52,.8)');
    leaf(g, x + w - 6, y + h - 14, 12, Math.PI + 0.3, 'rgba(70,112,52,.8)');
    g.fillStyle = '#a8553a'; g.beginPath(); g.ellipse(x + w - 10, y + 24, 6, 4, 0, Math.PI, 0); g.fill();
    g.fillStyle = '#d9c7a0'; g.fillRect(x + w - 11, y + 24, 2, 6);
  }

  function drawBamboo(g, o, t) {
    const { x, w, h } = o;
    const y = FLOOR - h;
    const hp = typeof o.hp === 'number' ? o.hp : BAMBOO_HP;
    if (hp <= 0) {
      // broken stubs
      for (let i = 0; i < 3; i++) {
        const sx = x + 2 + i * 8, sh = 10 + ((i * 7) % 9);
        g.fillStyle = '#6f7a35'; g.fillRect(sx, FLOOR - sh, 6, sh);
        g.fillStyle = '#c9c17a';
        g.beginPath(); g.moveTo(sx, FLOOR - sh); g.lineTo(sx + 3, FLOOR - sh - 5); g.lineTo(sx + 6, FLOOR - sh); g.fill();
      }
      return;
    }
    const dmg = 1 - hp / BAMBOO_HP;
    const tilt = dmg * 0.12 * Math.sin(t * 9) * (dmg > 0.5 ? 1 : 0.3);
    g.save();
    g.translate(x + w / 2, FLOOR); g.rotate(tilt);
    // three poles of slightly different heights
    for (let i = 0; i < 3; i++) {
      const px = -w / 2 + 1 + i * 8, ph = h - (i === 1 ? 0 : 8 + i * 3);
      const grd = g.createLinearGradient(px, 0, px + 7, 0);
      grd.addColorStop(0, '#4f5d24'); grd.addColorStop(0.5, '#8a9a45'); grd.addColorStop(1, '#4f5d24');
      g.fillStyle = grd; g.fillRect(px, -ph, 7, ph);
      g.fillStyle = '#3c4719';
      for (let k = 18; k < ph; k += 22) g.fillRect(px - 0.5, -k, 8, 2.5);
      g.fillStyle = '#c4c27a'; g.fillRect(px, -ph, 7, 2);
    }
    // vine lashings
    g.strokeStyle = '#3d6b2c'; g.lineWidth = 2.5;
    for (const ly of [-h * 0.3, -h * 0.72]) { g.beginPath(); g.moveTo(-w / 2 - 1, ly); g.lineTo(w / 2 + 1, ly + 3); g.stroke(); }
    // cracks as it takes damage
    if (dmg > 0.01) {
      g.strokeStyle = `rgba(30,24,10,${0.4 + dmg * 0.5})`; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-6, -h * 0.55); g.lineTo(-2, -h * 0.45); g.lineTo(-7, -h * 0.35);
      if (dmg > 0.4) { g.moveTo(5, -h * 0.8); g.lineTo(9, -h * 0.68); g.lineTo(4, -h * 0.6); }
      g.stroke();
    }
    leaf(g, -w / 2 + 4, -h + 10, 14, -2.3, '#4f7d36');
    leaf(g, w / 2 - 2, -h + 4, 13, -0.7, '#3f6a2e');
    g.restore();
  }

  // ---------- swinging log ----------
  const logPlat = { x: LOG.cx - LOG.w / 2, y: LOG.y, w: LOG.w, h: 22 };
  function placeLog() {
    const a = Math.sin(swingT * LOG.speed);
    logPlat.x = Math.round((LOG.cx + a * LOG.amp - LOG.w / 2) * 100) / 100;
    logPlat.y = Math.round((LOG.y - (1 - Math.cos(a * 0.5)) * 30) * 100) / 100; // rises a little at the ends of the arc
  }
  placeLog();

  function drawVine(g, x0, y0, x1, y1, sway, col, width, leaves) {
    const mx = (x0 + x1) / 2 + sway, my = (y0 + y1) / 2;
    g.strokeStyle = col; g.lineWidth = width; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
    if (leaves) {
      for (let i = 1; i < leaves; i++) {
        const t = i / leaves, it = 1 - t;
        const x = it * it * x0 + 2 * it * t * mx + t * t * x1, y = it * it * y0 + 2 * it * t * my + t * t * y1;
        leaf(g, x, y, 11, (i % 2 ? 0.5 : Math.PI - 0.5) + sway * 0.01, i % 3 ? '#3d6b2c' : '#2e5423');
      }
    }
  }

  function drawLog(g) {
    const p = logPlat;
    const a = Math.sin(swingT * LOG.speed);
    const sway = -a * 10;
    // supporting vines from the canopy
    drawVine(g, LOG.cx - 70, -6, p.x + 22, p.y + 6, sway, '#355f27', 4, 9);
    drawVine(g, LOG.cx + 70, -6, p.x + p.w - 22, p.y + 6, sway, '#355f27', 4, 9);
    // the log itself
    const grd = g.createLinearGradient(0, p.y - 2, 0, p.y + p.h);
    grd.addColorStop(0, '#77593a'); grd.addColorStop(0.4, '#533c25'); grd.addColorStop(1, '#2c1f12');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(p.x + 10, p.y);
    g.lineTo(p.x + p.w - 10, p.y);
    g.quadraticCurveTo(p.x + p.w + 2, p.y + p.h / 2, p.x + p.w - 10, p.y + p.h);
    g.lineTo(p.x + 10, p.y + p.h);
    g.quadraticCurveTo(p.x - 2, p.y + p.h / 2, p.x + 10, p.y);
    g.fill();
    // end rings
    g.fillStyle = '#8a6a45';
    g.beginPath(); g.ellipse(p.x + p.w - 9, p.y + p.h / 2, 6, p.h / 2 - 1, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(60,40,22,.8)'; g.lineWidth = 1;
    g.beginPath(); g.ellipse(p.x + p.w - 9, p.y + p.h / 2, 3, p.h / 4, 0, 0, Math.PI * 2); g.stroke();
    // bark grooves
    g.strokeStyle = 'rgba(20,12,6,.5)'; g.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const bx = p.x + 24 + i * 26;
      g.beginPath(); g.moveTo(bx, p.y + 5); g.lineTo(bx + 16, p.y + 7); g.stroke();
      g.beginPath(); g.moveTo(bx + 8, p.y + 13); g.lineTo(bx + 22, p.y + 15); g.stroke();
    }
    // vine lashings
    g.strokeStyle = '#3d6b2c'; g.lineWidth = 3;
    for (const lx of [p.x + 22, p.x + p.w - 22]) {
      g.beginPath(); g.moveTo(lx - 5, p.y - 1); g.lineTo(lx + 5, p.y + p.h + 1); g.moveTo(lx + 5, p.y - 1); g.lineTo(lx - 5, p.y + p.h + 1); g.stroke();
    }
    // mossy walk line
    g.strokeStyle = 'rgba(126,170,84,.6)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(p.x + 12, p.y + 1); g.lineTo(p.x + p.w - 12, p.y + 1); g.stroke();
  }

  // decorative background vines (x anchor, length, phase)
  const VINES = [[150, 230, 0.3], [205, 170, 1.7], [345, 140, 2.4], [615, 140, 0.9], [755, 170, 2.9], [810, 230, 1.2]];
  // fireflies
  const FLIES = [];
  for (let i = 0; i < 18; i++) FLIES.push({ x: 60 + Math.random() * 840, y: 110 + Math.random() * 320, p: Math.random() * 10, s: 0.4 + Math.random() * 0.6 });
  // falling leaves (foreground)
  const FALL = [];
  for (let i = 0; i < 7; i++) FALL.push({ x: Math.random() * W, o: Math.random() * 20, s: 18 + Math.random() * 16, c: i % 2 ? '#3f6a2e' : '#6b7a2c' });

  const arena = {
    id: 'arena05',
    name: 'Jungle',
    nameVi: 'Rừng rậm',
    hint: 'Swinging log, mud, bamboo fences',
    hintVi: 'Gỗ đu, bùn lầy, rào tre',
    floorY: FLOOR,
    gravityScale: 1,
    platforms: [
      { x: 100, y: 330, w: 200, h: 18 },
      { x: 660, y: 330, w: 200, h: 18 },
      logPlat,
    ],
    obstacles: OBSTACLES,

    drawBackground(ctx, t) {
      try {
        if (!staticLayer) staticLayer = paintStatic();
        ctx.save();
        ctx.drawImage(staticLayer, 0, 0);
        // god rays through the canopy
        for (let i = 0; i < 4; i++) {
          const x = 220 + i * 170 + Math.sin(t * 0.2 + i) * 20;
          const a = 0.035 + 0.02 * Math.sin(t * 0.5 + i * 1.7);
          const grd = ctx.createLinearGradient(0, 60, 0, FLOOR);
          grd.addColorStop(0, `rgba(210,235,160,${a})`); grd.addColorStop(1, 'rgba(210,235,160,0)');
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.moveTo(x, 60); ctx.lineTo(x + 50, 60); ctx.lineTo(x + 150, FLOOR); ctx.lineTo(x + 60, FLOOR); ctx.closePath(); ctx.fill();
        }
        // swaying decorative vines
        for (const [vx, len, ph] of VINES) {
          const sway = Math.sin(t * 0.9 + ph) * 16;
          drawVine(ctx, vx, -4, vx + sway * 0.6, len, sway, 'rgba(52,92,40,.85)', 2.5, 7);
        }
        // mud bubbles
        const mx = (MUD.x0 + MUD.x1) / 2, mw = (MUD.x1 - MUD.x0) / 2;
        for (let i = 0; i < 5; i++) {
          const ph = (t * 0.6 + i * 0.37) % 1.6;
          if (ph > 1) continue;
          const bx = mx + Math.sin(i * 12.9) * mw * 0.75, r = 2 + ph * 5;
          ctx.strokeStyle = `rgba(150,118,78,${0.6 * (1 - ph)})`; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.arc(bx, FLOOR + 5, r, Math.PI, 0); ctx.stroke();
        }
        // the swinging log on its vines
        drawLog(ctx);
        // terrain obstacles (live x/y/hp)
        for (const o of OBSTACLES) { if (o.kind === 'stump') drawStump(ctx, o); else drawBamboo(ctx, o, t); }
        // fireflies
        for (const f of FLIES) {
          const x = f.x + Math.sin(t * f.s + f.p) * 26, y = f.y + Math.cos(t * f.s * 1.3 + f.p) * 14;
          const a = 0.25 + 0.35 * Math.max(0, Math.sin(t * 2 * f.s + f.p * 3));
          ctx.fillStyle = `rgba(214,240,120,${a * 0.35})`;
          ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = `rgba(232,250,150,${a})`;
          ctx.fillRect(x - 1, y - 1, 2, 2);
        }
        ctx.restore();
      } catch (e) { /* never break the frame */ }
    },

    drawForeground(ctx, t) {
      try {
        ctx.save();
        // falling leaves, faint
        ctx.globalAlpha = 0.5;
        for (const L of FALL) {
          const y = ((t + L.o) * L.s * 2) % (H + 40) - 20;
          const x = (L.x + Math.sin((t + L.o) * 1.3) * 30 + W) % W;
          leaf(ctx, x, y, 10, Math.sin((t + L.o) * 2) * 1.2, L.c);
        }
        ctx.globalAlpha = 1;
        // foreground fern silhouettes in the bottom corners (below the fighting zone)
        for (const [bx, dir] of [[0, 1], [W, -1]]) {
          for (let i = 0; i < 7; i++) {
            const ang = dir > 0 ? -0.2 - i * 0.18 : Math.PI + 0.2 + i * 0.18;
            leaf(ctx, bx, H + 6, 70 + (i % 3) * 18, ang + Math.sin(t * 0.8 + i) * 0.04, 'rgba(8,18,10,.85)');
          }
        }
        // soft vignette
        const v = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 620);
        v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,8,2,.35)');
        ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
        ctx.restore();
      } catch (e) { /* ignore */ }
    },

    update(dt, fighters, game) {
      try {
        if (!(dt > 0)) return;
        swingT += dt;
        placeLog();
        const fy = (game && game.floorY) || FLOOR;
        (fighters || []).forEach((f, i) => {
          if (!f) return;
          splashCd[i] = Math.max(0, (splashCd[i] || 0) - dt);
          const inMud = !f.ko && f.onGround && f.y >= fy - 1 && f.x > MUD.x0 && f.x < MUD.x1;
          if (!inMud) return;
          // thick mud: drag horizontal speed down to roughly half of normal
          f.vx *= Math.pow(0.72, dt * 60);
          if (Math.abs(f.vx) > 40 && splashCd[i] <= 0 && game && game.particle) {
            splashCd[i] = 0.12;
            for (let k = 0; k < 3; k++) {
              game.particle({ x: f.x + (Math.random() - 0.5) * 24, y: fy - 2, vx: (Math.random() - 0.5) * 120 - f.vx * 0.15, vy: -90 - Math.random() * 120, life: 0.45, col: Math.random() < 0.5 ? '#6b4e30' : '#4a3520', r: 3 + Math.random() * 2 });
            }
          }
        });
      } catch (e) { /* ignore */ }
    },

    reset() {
      swingT = 0;
      splashCd[0] = splashCd[1] = 0;
      placeLog();
    },
  };

  (window.STICK_ARENAS = window.STICK_ARENAS || []).push(arena);
})();
