// Arena 10: Haunted Castle (Lâu đài ma)
// Moonlit castle hall: two stone balconies, a gently swinging chandelier, and a
// ghost platform that fades in and out. While the ghost platform is gone its
// width is set to 0 so the engine's normal platform check lets fighters drop
// through; it flickers for 1.5 s before vanishing so nobody is surprised.
// Gameplay state lives in update() (seeded by the engine for online play);
// draw code only reads it plus `t`, and static art uses its own fixed-seed PRNG.
(function () {
  const W = 960, H = 540;
  const FLOOR = 470;

  // Ghost platform cycle (seconds)
  const G_SOLID = 5, G_WARN = 1.5, G_GONE = 2.5, G_IN = 1.0;
  const G_CYCLE = G_SOLID + G_WARN + G_GONE + G_IN;
  const GHOST_W = 140;

  const CH_BASE_X = 390, CH_W = 180, CH_Y = 290, CH_SWAY = 26;

  const balL = { x: 85, y: 340, w: 200, h: 14 };
  const balR = { x: 675, y: 340, w: 200, h: 14 };
  const chand = { x: CH_BASE_X, y: CH_Y, w: CH_W, h: 10 };
  const ghost = { x: 410, y: 175, w: GHOST_W, h: 12 };

  // Solid obstacles (mirrored): breakable rotten coffins on the floor and
  // stone gargoyles guarding the outer end of each balcony.
  const COFFIN_HP = 35;
  const coffinL = { x: 300, y: FLOOR - 38, w: 64, h: 38, kind: 'coffin', hp: COFFIN_HP };
  const coffinR = { x: 596, y: FLOOR - 38, w: 64, h: 38, kind: 'coffin', hp: COFFIN_HP };
  const gargL = { x: 90, y: 340 - 50, w: 34, h: 50, kind: 'gargoyle' };
  const gargR = { x: 836, y: 340 - 50, w: 34, h: 50, kind: 'gargoyle' };
  const OBSTACLES = [coffinL, coffinR, gargL, gargR];
  const wasBroken = [false, false];

  // Art layout
  const WINS = [110, 300, 660, 850];        // lancet window centres
  const WIN_TOP = 82, WIN_SPRING = 122, WIN_BOT = 262, WIN_HW = 26;
  const ROSE = { x: 480, y: 140, r: 58 };
  const PILLARS = [205, 395, 565, 755];
  const TORCHES = [30, 930];

  let ghostT = 0;      // time within cycle
  let chandT = 0;      // chandelier swing clock
  let flash = 0;       // lightning flash intensity 0..1
  let boltTimer = 6;   // seconds until next lightning
  let bolt = null;     // {pts, br, life}
  let layerA = null;   // pre-rendered static hall
  let layerB = null;   // pre-rendered tracery / stained glass overlay
  const seen = [480, 480]; // last fighter x positions (gargoyle eyes follow them)

  function rnd(a, b) { return a + Math.random() * (b - a); }

  // Fixed-seed PRNG for art (never touches Math.random)
  function prng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let r = Math.imul(s ^ (s >>> 15), 1 | s);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  // Cheap deterministic hash for per-index animation offsets
  function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  // Ghost alpha + whether solid, from cycle time
  function ghostState() {
    const t = ghostT;
    if (t < G_SOLID) return { a: 0.85, solid: true, warn: false, k: 0 };
    if (t < G_SOLID + G_WARN) {
      const k = (t - G_SOLID) / G_WARN;
      const flick = 0.5 + 0.5 * Math.sin(t * (18 + k * 30));
      return { a: 0.85 * (1 - k * 0.6) * (0.45 + 0.55 * flick), solid: true, warn: true, k };
    }
    if (t < G_SOLID + G_WARN + G_GONE) {
      return { a: 0, solid: false, warn: false, gone: true, k: (t - G_SOLID - G_WARN) / G_GONE };
    }
    const k = (t - G_SOLID - G_WARN - G_GONE) / G_IN;
    return { a: 0.85 * k * 0.7, solid: false, warn: false, k, rising: true };
  }

  function isBroken(o) {
    return o.broken || o.dead || o.destroyed || (typeof o.hp === 'number' && o.hp <= 0);
  }

  // ---------------------------------------------------------------- paths
  function lancetPath(g, wx, inset) {
    const hw = WIN_HW - inset, top = WIN_TOP + inset * 1.3;
    g.moveTo(wx - hw, WIN_BOT - inset);
    g.lineTo(wx - hw, WIN_SPRING);
    g.bezierCurveTo(wx - hw, WIN_SPRING - 22, wx - hw * 0.45, top + 8, wx, top);
    g.bezierCurveTo(wx + hw * 0.45, top + 8, wx + hw, WIN_SPRING - 22, wx + hw, WIN_SPRING);
    g.lineTo(wx + hw, WIN_BOT - inset);
    g.closePath();
  }
  function glassClip(g) {
    g.beginPath();
    for (const wx of WINS) lancetPath(g, wx, 0);
    g.moveTo(ROSE.x + ROSE.r, ROSE.y);
    g.arc(ROSE.x, ROSE.y, ROSE.r, 0, Math.PI * 2);
    g.clip();
  }

  // ---------------------------------------------------------------- layer A
  function buildLayerA() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const R = prng(1010);

    // --- wall base
    const wg = g.createLinearGradient(0, 0, 0, FLOOR);
    wg.addColorStop(0, '#0b0917');
    wg.addColorStop(0.35, '#151226');
    wg.addColorStop(1, '#1e1a2e');
    g.fillStyle = wg; g.fillRect(0, 0, W, FLOOR);

    // --- ashlar blocks with bevels, tone variation, chips and cracks
    for (let y = 0, row = 0; y < FLOOR; y += 34, row++) {
      const off = row % 2 ? 0 : -36;
      for (let x = off; x < W; x += 72) {
        const v = R();
        g.fillStyle = v < 0.5 ? `rgba(110,98,150,${0.02 + v * 0.06})` : `rgba(0,0,0,${0.04 + (v - 0.5) * 0.14})`;
        g.fillRect(x + 1, y + 1, 70, 32);
        // top-left light bevel, bottom-right shadow
        g.fillStyle = 'rgba(170,160,210,0.05)';
        g.fillRect(x + 1, y + 1, 70, 1); g.fillRect(x + 1, y + 1, 1, 32);
        g.fillStyle = 'rgba(0,0,0,0.28)';
        g.fillRect(x + 1, y + 32, 70, 1); g.fillRect(x + 70, y + 1, 1, 32);
        // pitted surface
        for (let k = 0; k < 4; k++) {
          g.fillStyle = `rgba(0,0,0,${0.08 + R() * 0.1})`;
          g.fillRect(x + 4 + R() * 62, y + 4 + R() * 24, 1 + R() * 2, 1);
        }
        // chipped corner
        if (R() < 0.12) {
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.beginPath(); g.moveTo(x + 1, y + 1); g.lineTo(x + 9 + R() * 6, y + 1); g.lineTo(x + 1, y + 7 + R() * 5); g.fill();
        }
        // hairline crack
        if (R() < 0.1) {
          g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1;
          let cx = x + 10 + R() * 50, cy = y + 2;
          g.beginPath(); g.moveTo(cx, cy);
          while (cy < y + 32) { cx += (R() - 0.5) * 8; cy += 3 + R() * 5; g.lineTo(cx, Math.min(cy, y + 32)); }
          g.stroke();
        }
      }
      // mortar line
      g.fillStyle = 'rgba(0,0,0,0.42)'; g.fillRect(0, y, W, 1);
    }

    // --- ribbed vault in the ceiling band
    g.save();
    g.strokeStyle = '#231f36'; g.lineWidth = 7;
    const springs = [0, ...PILLARS, W];
    for (let i = 0; i < springs.length - 1; i++) {
      const a = springs[i], b = springs[i + 1], m = (a + b) / 2;
      g.beginPath(); g.moveTo(a, 64); g.quadraticCurveTo(a + (m - a) * 0.15, 6, m, 0); g.stroke();
      g.beginPath(); g.moveTo(b, 64); g.quadraticCurveTo(b - (b - m) * 0.15, 6, m, 0); g.stroke();
    }
    g.strokeStyle = 'rgba(140,130,180,0.08)'; g.lineWidth = 1.5;
    for (let i = 0; i < springs.length - 1; i++) {
      const a = springs[i], b = springs[i + 1], m = (a + b) / 2;
      g.beginPath(); g.moveTo(a + 2, 62); g.quadraticCurveTo(a + (m - a) * 0.15 + 2, 4, m, -2); g.stroke();
    }
    g.restore();

    // --- lancet windows: deep recess, voussoirs, night sky, stars, sill
    for (const wx of WINS) {
      // splayed recess
      g.fillStyle = '#0a0814';
      g.beginPath(); lancetPath(g, wx, -12); g.fill();
      const rg = g.createLinearGradient(wx - WIN_HW - 12, 0, wx + WIN_HW + 12, 0);
      rg.addColorStop(0, '#2c2744'); rg.addColorStop(0.18, '#15122a'); rg.addColorStop(0.82, '#15122a'); rg.addColorStop(1, '#100d20');
      g.fillStyle = rg; g.beginPath(); lancetPath(g, wx, -8); g.fill();
      // voussoir stones around the arch
      g.strokeStyle = '#2f2a48'; g.lineWidth = 9;
      g.beginPath(); lancetPath(g, wx, -16); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1;
      for (let k = 0; k <= 12; k++) {
        const a = Math.PI + (k / 12) * Math.PI;
        const rx = WIN_HW + 18, ry = 44;
        const px = wx + Math.cos(a) * rx, py = WIN_SPRING + Math.sin(a) * ry * (k === 6 ? 1.05 : 1);
        g.beginPath(); g.moveTo(wx + Math.cos(a) * (rx - 10), WIN_SPRING + Math.sin(a) * (ry - 10)); g.lineTo(px, py); g.stroke();
      }
      g.strokeStyle = 'rgba(160,150,200,0.1)'; g.lineWidth = 1;
      g.beginPath(); lancetPath(g, wx, -20); g.stroke();
      // keystone
      g.fillStyle = '#3a3456';
      g.beginPath(); g.moveTo(wx - 7, WIN_TOP - 26); g.lineTo(wx + 7, WIN_TOP - 26); g.lineTo(wx + 5, WIN_TOP - 10); g.lineTo(wx - 5, WIN_TOP - 10); g.fill();
      g.fillStyle = 'rgba(190,180,230,0.12)'; g.fillRect(wx - 7, WIN_TOP - 26, 14, 1);
      // night sky glass
      g.save();
      g.beginPath(); lancetPath(g, wx, 0); g.clip();
      const sg = g.createLinearGradient(0, WIN_TOP, 0, WIN_BOT);
      sg.addColorStop(0, '#22305e'); sg.addColorStop(0.6, '#18214a'); sg.addColorStop(1, '#2a2a4a');
      g.fillStyle = sg; g.fillRect(wx - WIN_HW, WIN_TOP, WIN_HW * 2, WIN_BOT - WIN_TOP);
      for (let k = 0; k < 14; k++) {
        g.fillStyle = `rgba(220,230,255,${0.25 + R() * 0.5})`;
        g.fillRect(wx - WIN_HW + R() * WIN_HW * 2, WIN_TOP + R() * 110, 1, 1);
      }
      // distant hills / towers silhouette at the bottom of the glass
      g.fillStyle = '#0e1028';
      g.beginPath(); g.moveTo(wx - WIN_HW, WIN_BOT);
      for (let x = -WIN_HW; x <= WIN_HW; x += 6) g.lineTo(wx + x, WIN_BOT - 28 - Math.sin((wx + x) * 0.05) * 8 - R() * 3);
      g.lineTo(wx + WIN_HW, WIN_BOT); g.fill();
      if (wx === 300 || wx === 660) {
        const tx = wx + (wx < 480 ? -8 : 8);
        g.fillRect(tx - 4, WIN_BOT - 62, 8, 40);
        g.beginPath(); g.moveTo(tx - 6, WIN_BOT - 62); g.lineTo(tx, WIN_BOT - 78); g.lineTo(tx + 6, WIN_BOT - 62); g.fill();
        g.fillStyle = 'rgba(255,190,90,0.6)'; g.fillRect(tx - 1, WIN_BOT - 52, 2, 3);
      }
      g.restore();
      // sill with drip marks
      g.fillStyle = '#2f2a46'; g.fillRect(wx - WIN_HW - 14, WIN_BOT, WIN_HW * 2 + 28, 7);
      g.fillStyle = 'rgba(190,180,230,0.13)'; g.fillRect(wx - WIN_HW - 14, WIN_BOT, WIN_HW * 2 + 28, 1);
      g.fillStyle = '#1a1629'; g.fillRect(wx - WIN_HW - 10, WIN_BOT + 7, WIN_HW * 2 + 20, 4);
      // damp stain running down from the sill
      const st = g.createLinearGradient(0, WIN_BOT + 11, 0, WIN_BOT + 120);
      st.addColorStop(0, 'rgba(10,20,15,0.35)'); st.addColorStop(1, 'rgba(10,20,15,0)');
      g.fillStyle = st;
      for (let k = 0; k < 5; k++) {
        const sx = wx - WIN_HW + R() * WIN_HW * 2;
        g.fillRect(sx, WIN_BOT + 11, 2 + R() * 5, 40 + R() * 80);
      }
    }

    // --- rose window: frame + sky + moon
    g.fillStyle = '#0a0814';
    g.beginPath(); g.arc(ROSE.x, ROSE.y, ROSE.r + 14, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#302a4a'; g.lineWidth = 9;
    g.beginPath(); g.arc(ROSE.x, ROSE.y, ROSE.r + 9, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 1;
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      g.beginPath();
      g.moveTo(ROSE.x + Math.cos(a) * (ROSE.r + 5), ROSE.y + Math.sin(a) * (ROSE.r + 5));
      g.lineTo(ROSE.x + Math.cos(a) * (ROSE.r + 13), ROSE.y + Math.sin(a) * (ROSE.r + 13));
      g.stroke();
    }
    g.strokeStyle = 'rgba(170,160,215,0.12)';
    g.beginPath(); g.arc(ROSE.x, ROSE.y, ROSE.r + 14, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    g.save();
    g.beginPath(); g.arc(ROSE.x, ROSE.y, ROSE.r, 0, Math.PI * 2); g.clip();
    const rs = g.createRadialGradient(ROSE.x + 12, ROSE.y - 10, 4, ROSE.x, ROSE.y, ROSE.r);
    rs.addColorStop(0, '#3e4d84'); rs.addColorStop(1, '#141a3c');
    g.fillStyle = rs; g.fillRect(ROSE.x - ROSE.r, ROSE.y - ROSE.r, ROSE.r * 2, ROSE.r * 2);
    const mx = ROSE.x + 12, my = ROSE.y - 10;
    const halo = g.createRadialGradient(mx, my, 18, mx, my, 54);
    halo.addColorStop(0, 'rgba(200,215,255,0.28)'); halo.addColorStop(1, 'rgba(200,215,255,0)');
    g.fillStyle = halo; g.fillRect(mx - 60, my - 60, 120, 120);
    const mg = g.createRadialGradient(mx - 6, my - 6, 2, mx, my, 21);
    mg.addColorStop(0, '#eef1ff'); mg.addColorStop(1, '#a9b4d8');
    g.fillStyle = mg; g.beginPath(); g.arc(mx, my, 20, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(120,130,170,0.35)';
    for (const [dx, dy, r] of [[-6, -3, 4], [5, 6, 3], [7, -7, 2.5], [-3, 9, 2], [-10, 5, 1.8]]) {
      g.beginPath(); g.arc(mx + dx, my + dy, r, 0, Math.PI * 2); g.fill();
    }
    g.restore();

    // --- fluted pillars with carved capitals and bases
    for (const px of PILLARS) {
      const pg = g.createLinearGradient(px - 18, 0, px + 18, 0);
      pg.addColorStop(0, '#0e0c1b'); pg.addColorStop(0.35, '#2e2a46'); pg.addColorStop(0.55, '#26223c'); pg.addColorStop(1, '#0f0d1c');
      g.fillStyle = pg; g.fillRect(px - 16, 76, 32, FLOOR - 96);
      for (let k = -12; k <= 12; k += 6) {
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(px + k - 1, 80, 2, FLOOR - 104);
        g.fillStyle = 'rgba(150,140,200,0.05)'; g.fillRect(px + k + 1, 80, 1, FLOOR - 104);
      }
      // capital: abacus, leaf band, necking
      g.fillStyle = '#2b2642'; g.fillRect(px - 26, 58, 52, 8);
      g.fillStyle = 'rgba(190,180,230,0.12)'; g.fillRect(px - 26, 58, 52, 1);
      g.fillStyle = '#221e36'; g.fillRect(px - 22, 66, 44, 10);
      g.fillStyle = '#332d4e';
      for (let k = -18; k <= 18; k += 9) {
        g.beginPath(); g.moveTo(px + k - 4, 76); g.quadraticCurveTo(px + k, 62, px + k + 4, 76); g.fill();
      }
      g.fillStyle = '#1a1729'; g.fillRect(px - 18, 76, 36, 3);
      // base: torus + plinth
      g.fillStyle = '#26213a'; g.fillRect(px - 21, FLOOR - 22, 42, 6);
      g.fillStyle = '#2d2845'; g.fillRect(px - 25, FLOOR - 16, 50, 16);
      g.fillStyle = 'rgba(190,180,230,0.1)'; g.fillRect(px - 25, FLOOR - 16, 50, 1); g.fillRect(px - 21, FLOOR - 22, 42, 1);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(px + 12, FLOOR - 16, 13, 16);
      // moss creeping up the base
      for (let k = 0; k < 10; k++) {
        g.fillStyle = `rgba(40,70,45,${0.25 + R() * 0.25})`;
        g.beginPath(); g.arc(px - 24 + R() * 48, FLOOR - R() * 12, 1 + R() * 2.2, 0, Math.PI * 2); g.fill();
      }
    }

    // --- torch brackets (flames are animated)
    for (const tx of TORCHES) {
      const s = tx < W / 2 ? 1 : -1;
      g.fillStyle = '#1b1726'; g.fillRect(tx - 6 * s - (s < 0 ? 4 : 0), 276, 4, 26);
      g.strokeStyle = '#2b2436'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(tx - 6 * s, 296); g.quadraticCurveTo(tx, 296, tx, 284); g.stroke();
      g.fillStyle = '#3a2c1c';
      g.beginPath(); g.moveTo(tx - 7, 270); g.lineTo(tx + 7, 270); g.lineTo(tx + 4, 286); g.lineTo(tx - 4, 286); g.fill();
      g.fillStyle = '#5a442a'; g.fillRect(tx - 7, 270, 14, 2);
      g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(tx - 6, 276); g.lineTo(tx + 6, 276); g.moveTo(tx - 5, 281); g.lineTo(tx + 5, 281); g.stroke();
      // soot above the torch
      const so = g.createRadialGradient(tx, 236, 2, tx, 236, 30);
      so.addColorStop(0, 'rgba(0,0,0,0.35)'); so.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = so; g.fillRect(tx - 30, 200, 60, 70);
    }

    // --- suits of armour with halberds
    for (const ax of [48, 912]) {
      const s = ax < W / 2 ? 1 : -1;
      const steel = g.createLinearGradient(ax - 16, 0, ax + 16, 0);
      steel.addColorStop(0, '#0c0b14'); steel.addColorStop(0.4, '#2a2838'); steel.addColorStop(0.55, '#3a3850'); steel.addColorStop(1, '#0c0b14');
      g.fillStyle = steel;
      // helm with plume
      g.beginPath(); g.arc(ax, FLOOR - 114, 11, Math.PI, 0); g.lineTo(ax + 11, FLOOR - 104); g.lineTo(ax - 11, FLOOR - 104); g.fill();
      g.fillStyle = '#05050a'; g.fillRect(ax - 8, FLOOR - 113, 16, 2); g.fillRect(ax - 8, FLOOR - 109, 16, 1);
      g.fillStyle = '#4a1420';
      g.beginPath(); g.moveTo(ax, FLOOR - 125); g.quadraticCurveTo(ax - s * 18, FLOOR - 140, ax - s * 22, FLOOR - 112); g.quadraticCurveTo(ax - s * 12, FLOOR - 126, ax, FLOOR - 121); g.fill();
      g.fillStyle = steel;
      // gorget, pauldrons, cuirass, faulds
      g.fillRect(ax - 7, FLOOR - 104, 14, 5);
      g.beginPath(); g.ellipse(ax - 15, FLOOR - 95, 7, 5, 0, 0, Math.PI * 2); g.ellipse(ax + 15, FLOOR - 95, 7, 5, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(ax - 13, FLOOR - 99); g.lineTo(ax + 13, FLOOR - 99); g.lineTo(ax + 11, FLOOR - 66); g.lineTo(ax - 11, FLOOR - 66); g.fill();
      g.fillStyle = 'rgba(190,190,230,0.12)'; g.fillRect(ax - 1, FLOOR - 98, 2, 30);
      g.fillStyle = steel;
      for (let k = 0; k < 3; k++) g.fillRect(ax - 13 + k, FLOOR - 66 + k * 5, 26 - k * 2, 4);
      g.fillRect(ax - 20, FLOOR - 92, 6, 30); g.fillRect(ax + 14, FLOOR - 92, 6, 30);
      g.fillRect(ax - 11, FLOOR - 52, 9, 50); g.fillRect(ax + 2, FLOOR - 52, 9, 50);
      g.fillStyle = 'rgba(190,190,230,0.1)'; g.fillRect(ax - 9, FLOOR - 32, 5, 3); g.fillRect(ax + 4, FLOOR - 32, 5, 3);
      g.fillStyle = steel; g.fillRect(ax - 13, FLOOR - 4, 12, 4); g.fillRect(ax + 1, FLOOR - 4, 12, 4);
      // halberd
      const hx = ax + s * 22;
      g.fillStyle = '#2a1e14'; g.fillRect(hx - 1.5, FLOOR - 170, 3, 170);
      g.fillStyle = '#3c3a52';
      g.beginPath(); g.moveTo(hx, FLOOR - 188); g.lineTo(hx + 3, FLOOR - 170); g.lineTo(hx - 3, FLOOR - 170); g.fill();
      g.beginPath(); g.moveTo(hx, FLOOR - 168); g.quadraticCurveTo(hx - s * 18, FLOOR - 166, hx - s * 16, FLOOR - 150); g.lineTo(hx, FLOOR - 154); g.fill();
      g.fillStyle = 'rgba(200,200,240,0.18)';
      g.beginPath(); g.moveTo(hx - s * 16, FLOOR - 150); g.lineTo(hx - s * 14, FLOOR - 162); g.lineTo(hx - s * 13, FLOOR - 151); g.fill();
    }

    // --- floor: perspective flagstones
    const fg = g.createLinearGradient(0, FLOOR, 0, H);
    fg.addColorStop(0, '#2b2639'); fg.addColorStop(1, '#0d0b15');
    g.fillStyle = fg; g.fillRect(0, FLOOR, W, H - FLOOR);
    const rows = [FLOOR, FLOOR + 9, FLOOR + 20, FLOOR + 34, FLOOR + 51, FLOOR + 72];
    const vx = W / 2, persp = (y) => 1 + (y - FLOOR) / 70;
    for (let r = 0; r < rows.length - 1; r++) {
      const y0 = rows[r], y1 = rows[r + 1];
      for (let col = -14; col < 14; col++) {
        const xa = vx + col * 64 * persp(y0), xb = vx + (col + 1) * 64 * persp(y0);
        const xc = vx + (col + 1) * 64 * persp(y1), xd = vx + col * 64 * persp(y1);
        const dark = (r + col) % 2 === 0;
        g.fillStyle = dark ? 'rgba(0,0,0,0.22)' : `rgba(120,110,160,${0.03 + R() * 0.04})`;
        g.beginPath(); g.moveTo(xa, y0); g.lineTo(xb, y0); g.lineTo(xc, y1); g.lineTo(xd, y1); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1; g.stroke();
        if (R() < 0.08) {
          g.strokeStyle = 'rgba(0,0,0,0.5)';
          g.beginPath(); const sx = (xa + xb) / 2 + (R() - 0.5) * 20;
          g.moveTo(sx, y0 + 1); g.lineTo(sx + (R() - 0.5) * 16, (y0 + y1) / 2); g.lineTo(sx + (R() - 0.5) * 24, y1 - 1); g.stroke();
        }
      }
    }
    // moonlight reflections of the windows on the polished stone
    for (const wx of WINS) {
      const rf = g.createLinearGradient(0, FLOOR, 0, FLOOR + 50);
      rf.addColorStop(0, 'rgba(120,140,220,0.12)'); rf.addColorStop(1, 'rgba(120,140,220,0)');
      g.fillStyle = rf;
      const dx = wx < 480 ? 70 : -70;
      g.beginPath(); g.moveTo(wx + dx - 22, FLOOR + 2); g.lineTo(wx + dx + 22, FLOOR + 2); g.lineTo(wx + dx * 1.3 + 30, FLOOR + 50); g.lineTo(wx + dx * 1.3 - 30, FLOOR + 50); g.fill();
    }
    // carpet runner with gold border and diamond motif
    const cp = (y, side) => 480 + side * (80 * persp(y));
    g.fillStyle = '#4a0f1e';
    g.beginPath(); g.moveTo(cp(FLOOR, -1), FLOOR); g.lineTo(cp(FLOOR, 1), FLOOR); g.lineTo(cp(H, 1), H); g.lineTo(cp(H, -1), H); g.fill();
    const cg = g.createLinearGradient(0, FLOOR, 0, H);
    cg.addColorStop(0, 'rgba(0,0,0,0.25)'); cg.addColorStop(1, 'rgba(120,20,40,0.15)');
    g.fillStyle = cg; g.fill();
    g.strokeStyle = 'rgba(190,150,70,0.5)'; g.lineWidth = 2;
    for (const k of [0.86, 0.78]) {
      g.beginPath(); g.moveTo(480 - 80 * k, FLOOR); g.lineTo(480 - 80 * k * persp(H), H);
      g.moveTo(480 + 80 * k, FLOOR); g.lineTo(480 + 80 * k * persp(H), H); g.stroke();
      g.lineWidth = 1;
    }
    g.fillStyle = 'rgba(190,150,70,0.28)';
    for (let r = 0; r < rows.length - 1; r++) {
      const y = (rows[r] + rows[r + 1]) / 2, s = persp(y), hh = (rows[r + 1] - rows[r]) * 0.35;
      g.beginPath(); g.moveTo(480 - 12 * s, y); g.lineTo(480, y - hh); g.lineTo(480 + 12 * s, y); g.lineTo(480, y + hh); g.fill();
    }
    // worn patch in the middle of the carpet
    const wp = g.createRadialGradient(480, FLOOR + 30, 2, 480, FLOOR + 30, 50);
    wp.addColorStop(0, 'rgba(0,0,0,0.18)'); wp.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = wp; g.fillRect(420, FLOOR, 120, 70);
    // floor lip
    g.fillStyle = '#3e3754'; g.fillRect(0, FLOOR, W, 2);
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(0, FLOOR + 2, W, 2);
    // contact shadow where wall meets floor
    const cs = g.createLinearGradient(0, FLOOR - 24, 0, FLOOR);
    cs.addColorStop(0, 'rgba(0,0,0,0)'); cs.addColorStop(1, 'rgba(0,0,0,0.3)');
    g.fillStyle = cs; g.fillRect(0, FLOOR - 24, W, 24);

    // --- balconies: wall anchor, carved corbels, slab, baluster frieze, ivy
    for (const b of [balL, balR]) drawBalcony(g, b, R);

    // --- ambient occlusion: darker upper corners and ceiling
    const ao = g.createRadialGradient(W / 2, 360, 120, W / 2, 300, 640);
    ao.addColorStop(0, 'rgba(0,0,0,0)'); ao.addColorStop(1, 'rgba(0,0,6,0.4)');
    g.fillStyle = ao; g.fillRect(0, 0, W, FLOOR);

    layerA = c;
  }

  function drawBalcony(g, b, R) {
    const left = b.x < W / 2;
    // anchor into the side wall
    const wx = left ? 0 : b.x + b.w, ww = left ? b.x : W - (b.x + b.w);
    if (ww > 0) {
      g.fillStyle = '#16131f'; g.fillRect(wx, b.y, ww, b.h + 20);
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(wx, b.y + b.h + 20, ww, 6);
    }
    // shadow cast on the wall below
    const sh = g.createLinearGradient(0, b.y + b.h, 0, b.y + b.h + 70);
    sh.addColorStop(0, 'rgba(0,0,0,0.45)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.fillRect(b.x + 6, b.y + b.h + 20, b.w - 12, 70);
    // corbels: scrolled brackets
    for (let i = 0; i < 3; i++) {
      const cx = b.x + 26 + i * ((b.w - 52) / 2), top = b.y + b.h + 20;
      g.fillStyle = '#1d1a2c';
      g.beginPath();
      g.moveTo(cx - 13, top); g.lineTo(cx + 13, top);
      g.quadraticCurveTo(cx + 11, top + 22, cx + 3, top + 34);
      g.lineTo(cx - 3, top + 34);
      g.quadraticCurveTo(cx - 11, top + 22, cx - 13, top);
      g.fill();
      g.strokeStyle = '#2d2842'; g.lineWidth = 2;
      g.beginPath(); g.arc(cx, top + 26, 4, 0, Math.PI * 1.6); g.stroke();
      g.fillStyle = 'rgba(170,160,215,0.1)'; g.fillRect(cx - 13, top, 26, 1);
    }
    // slab (top face lit, front face darker)
    const sg = g.createLinearGradient(0, b.y, 0, b.y + b.h);
    sg.addColorStop(0, '#5e5679'); sg.addColorStop(0.3, '#433c5c'); sg.addColorStop(1, '#2a2540');
    g.fillStyle = sg; g.fillRect(b.x, b.y, b.w, b.h);
    g.fillStyle = '#8a80aa'; g.fillRect(b.x, b.y, b.w, 1);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(b.x, b.y + b.h - 2, b.w, 2);
    // slab joints and chipped corners
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let x = b.x + 50; x < b.x + b.w; x += 50) g.fillRect(x, b.y + 2, 1, b.h - 2);
    g.fillStyle = '#16131f'; g.fillRect(left ? b.x + b.w - 3 : b.x, b.y, 3, 2);
    // baluster frieze under the slab
    g.fillStyle = '#211d33'; g.fillRect(b.x + 3, b.y + b.h, b.w - 6, 20);
    for (let x = b.x + 10; x < b.x + b.w - 8; x += 15) {
      g.fillStyle = '#3a3454';
      g.beginPath();
      g.moveTo(x, b.y + b.h + 1); g.lineTo(x + 7, b.y + b.h + 1);
      g.quadraticCurveTo(x + 5, b.y + b.h + 6, x + 8, b.y + b.h + 12);
      g.quadraticCurveTo(x + 6, b.y + b.h + 18, x + 6, b.y + b.h + 19);
      g.lineTo(x + 1, b.y + b.h + 19);
      g.quadraticCurveTo(x + 1, b.y + b.h + 18, x - 1, b.y + b.h + 12);
      g.quadraticCurveTo(x + 2, b.y + b.h + 6, x, b.y + b.h + 1);
      g.fill();
      g.fillStyle = 'rgba(180,170,225,0.12)'; g.fillRect(x + 1, b.y + b.h + 9, 1, 6);
    }
    g.fillStyle = '#332d4c'; g.fillRect(b.x + 1, b.y + b.h + 18, b.w - 2, 4);
    g.fillStyle = 'rgba(180,170,225,0.12)'; g.fillRect(b.x + 1, b.y + b.h + 18, b.w - 2, 1);
    // ivy trailing from the outer end
    const ix0 = left ? b.x + 40 : b.x + b.w - 40;
    for (let s = 0; s < 4; s++) {
      let x = ix0 + (R() - 0.5) * 50, y = b.y + b.h + 20;
      const len = 30 + R() * 60;
      g.strokeStyle = 'rgba(30,50,34,0.9)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < len; k += 6) {
        x += (R() - 0.5) * 4; y += 6; g.lineTo(x, y);
      }
      g.stroke();
      for (let k = 0; k < len; k += 7) {
        g.fillStyle = R() < 0.5 ? 'rgba(36,66,42,0.95)' : 'rgba(28,52,34,0.95)';
        const lx = ix0 + (R() - 0.5) * 50, ly = b.y + b.h + 22 + k;
        g.beginPath(); g.ellipse(lx, ly, 3, 2, R() * 3, 0, Math.PI * 2); g.fill();
      }
    }
  }

  // ---------------------------------------------------------------- layer B
  // stained glass tints, lead came and stone tracery, drawn over the animated sky
  function buildLayerB() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    const tints = ['rgba(120,40,90,0.22)', 'rgba(40,80,150,0.2)', 'rgba(140,110,40,0.18)', 'rgba(50,110,90,0.18)'];
    for (const wx of WINS) {
      g.save();
      g.beginPath(); lancetPath(g, wx, 0); g.clip();
      // coloured border panes along the edges
      for (let y = WIN_TOP; y < WIN_BOT; y += 12) {
        const i = ((y / 12) | 0) + wx;
        g.fillStyle = tints[i % tints.length];
        g.fillRect(wx - WIN_HW, y, 6, 12); g.fillRect(wx + WIN_HW - 6, y, 6, 12);
      }
      // diamond leaded lattice
      g.strokeStyle = 'rgba(6,6,14,0.5)'; g.lineWidth = 1;
      for (let d = -120; d < 260; d += 11) {
        g.beginPath(); g.moveTo(wx - WIN_HW, WIN_TOP + d); g.lineTo(wx + WIN_HW, WIN_TOP + d + 30); g.stroke();
        g.beginPath(); g.moveTo(wx + WIN_HW, WIN_TOP + d); g.lineTo(wx - WIN_HW, WIN_TOP + d + 30); g.stroke();
      }
      g.restore();
      // stone tracery: central mullion, transoms, pointed sub-arches, quatrefoil
      g.strokeStyle = '#0d0b18'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(wx, WIN_TOP + 46); g.lineTo(wx, WIN_BOT); g.stroke();
      g.lineWidth = 3;
      for (const y of [176, 220]) { g.beginPath(); g.moveTo(wx - WIN_HW, y); g.lineTo(wx + WIN_HW, y); g.stroke(); }
      g.beginPath();
      g.moveTo(wx - WIN_HW, WIN_SPRING + 18); g.quadraticCurveTo(wx - WIN_HW, WIN_SPRING - 6, wx - WIN_HW / 2, WIN_SPRING - 10);
      g.quadraticCurveTo(wx, WIN_SPRING - 6, wx, WIN_SPRING + 18);
      g.moveTo(wx, WIN_SPRING + 18); g.quadraticCurveTo(wx, WIN_SPRING - 6, wx + WIN_HW / 2, WIN_SPRING - 10);
      g.quadraticCurveTo(wx + WIN_HW, WIN_SPRING - 6, wx + WIN_HW, WIN_SPRING + 18);
      g.stroke();
      const qy = WIN_TOP + 26;
      g.lineWidth = 2.5;
      for (let k = 0; k < 4; k++) {
        const a = k * Math.PI / 2;
        g.beginPath(); g.arc(wx + Math.cos(a) * 5, qy + Math.sin(a) * 5, 5, 0, Math.PI * 2); g.stroke();
      }
      g.fillStyle = 'rgba(160,40,60,0.35)'; g.beginPath(); g.arc(wx, qy, 3, 0, Math.PI * 2); g.fill();
      // stone highlight on tracery
      g.strokeStyle = 'rgba(170,160,215,0.1)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(wx - 1.5, WIN_TOP + 48); g.lineTo(wx - 1.5, WIN_BOT); g.stroke();
      g.strokeStyle = '#0d0b18'; g.lineWidth = 3;
      g.beginPath(); lancetPath(g, wx, 0); g.stroke();
    }
    // rose window tracery: petals, spokes, rings, outer foils
    const { x, y, r } = ROSE;
    g.save();
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.clip();
    for (let k = 0; k < 8; k++) {
      const a0 = (k / 8) * Math.PI * 2, a1 = ((k + 1) / 8) * Math.PI * 2;
      g.globalAlpha = 0.5;
      g.fillStyle = tints[k % tints.length];
      g.beginPath(); g.moveTo(x, y); g.arc(x, y, r, a0, a1); g.closePath(); g.fill();
      g.globalAlpha = 1;
    }
    g.restore();
    g.strokeStyle = 'rgba(13,11,24,0.9)';
    g.lineWidth = 2;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      g.beginPath(); g.moveTo(x + Math.cos(a) * r * 0.24, y + Math.sin(a) * r * 0.24); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke();
    }
    g.lineWidth = 1.6;
    for (let k = 0; k < 8; k++) {
      const a = ((k + 0.5) / 8) * Math.PI * 2;
      g.beginPath(); g.arc(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.17, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.arc(x + Math.cos(a) * r * 0.88, y + Math.sin(a) * r * 0.88, r * 0.09, 0, Math.PI * 2); g.stroke();
    }
    g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, r * 0.24, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(x, y, r * 0.42, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 4;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
    g.fillStyle = 'rgba(160,40,60,0.25)'; g.beginPath(); g.arc(x, y, r * 0.2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#0d0b18'; g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
    layerB = c;
  }

  // ---------------------------------------------------------------- animated bits
  function drawSkyMotion(ctx, t) {
    ctx.save();
    glassClip(ctx);
    // slow clouds drifting across every pane (same sky behind all windows)
    for (let i = 0; i < 7; i++) {
      const sp = 6 + hash(i) * 8;
      const x = ((t * sp + hash(i + 9) * 1200) % 1200) - 120;
      const y = 92 + hash(i + 3) * 120;
      const w = 50 + hash(i + 5) * 60;
      ctx.fillStyle = `rgba(14,16,36,${0.35 + hash(i + 7) * 0.25})`;
      ctx.beginPath();
      ctx.ellipse(x, y, w, 9, 0, 0, Math.PI * 2);
      ctx.ellipse(x + w * 0.4, y - 6, w * 0.5, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(170,185,235,${0.05 + flash * 0.25})`;
      ctx.beginPath(); ctx.ellipse(x + w * 0.4, y - 10, w * 0.4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    }
    if (bolt) {
      const a = Math.min(1, bolt.life * 4);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = `rgba(150,170,255,${a * 0.35})`; ctx.lineWidth = 7;
      strokePts(ctx, bolt.pts);
      ctx.strokeStyle = `rgba(235,240,255,${a})`; ctx.lineWidth = 2;
      strokePts(ctx, bolt.pts);
      ctx.lineWidth = 1;
      for (const b of bolt.br) strokePts(ctx, b);
    }
    if (flash > 0) {
      ctx.fillStyle = `rgba(200,215,255,${flash * 0.5})`;
      ctx.fillRect(0, 70, W, 220);
    }
    ctx.restore();
  }
  function strokePts(ctx, pts) {
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  }

  function drawMoonbeams(ctx, t) {
    const pulse = 0.045 + 0.012 * Math.sin(t * 0.7);
    for (const wx of WINS) {
      const dx = wx < 480 ? 1 : -1;
      const bx0 = wx - WIN_HW, bx1 = wx + WIN_HW;
      const fx0 = bx0 + (dx > 0 ? 14 : -84), fx1 = bx1 + (dx > 0 ? 84 : -14);
      const bg = ctx.createLinearGradient(0, WIN_BOT, 0, FLOOR);
      bg.addColorStop(0, `rgba(150,170,235,${pulse + flash * 0.14})`);
      bg.addColorStop(1, `rgba(150,170,235,${(pulse + flash * 0.14) * 0.35})`);
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.moveTo(bx0, WIN_BOT); ctx.lineTo(bx1, WIN_BOT); ctx.lineTo(fx1, FLOOR); ctx.lineTo(fx0, FLOOR); ctx.closePath(); ctx.fill();
      // dust motes drifting inside the beam
      for (let i = 0; i < 9; i++) {
        const h1 = hash(wx + i * 13), h2 = hash(wx * 3 + i * 7);
        const k = ((t * (0.02 + h1 * 0.03) + h2) % 1);
        const yy = WIN_BOT + 10 + k * (FLOOR - WIN_BOT - 20);
        const span = (yy - WIN_BOT) / (FLOOR - WIN_BOT);
        const xl = bx0 + (fx0 - bx0) * span, xr = bx1 + (fx1 - bx1) * span;
        const xx = xl + (xr - xl) * (0.15 + 0.7 * hash(i + wx)) + Math.sin(t * 0.8 + i) * 4;
        ctx.fillStyle = `rgba(210,220,255,${0.15 + 0.2 * Math.sin(t * 2 + i * 1.7) ** 2})`;
        ctx.fillRect(xx, yy, 1.5, 1.5);
      }
    }
    // during a flash, window-shaped light lands on the floor
    if (flash > 0.05) {
      ctx.fillStyle = `rgba(190,205,255,${flash * 0.16})`;
      for (const wx of WINS) {
        const dx = wx < 480 ? 50 : -50;
        ctx.beginPath(); ctx.ellipse(wx + dx, FLOOR + 14, 38, 8, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function flame(ctx, x, y, s, t, seed) {
    const f1 = Math.sin(t * 11 + seed) * 0.5 + Math.sin(t * 17.3 + seed * 2) * 0.5;
    const lean = Math.sin(t * 3.1 + seed) * 1.5 * s;
    const hgt = (10 + f1 * 2) * s;
    ctx.fillStyle = 'rgba(255,120,40,0.85)';
    ctx.beginPath(); ctx.moveTo(x - 5 * s, y);
    ctx.quadraticCurveTo(x - 6 * s, y - hgt * 0.5, x + lean, y - hgt);
    ctx.quadraticCurveTo(x + 6 * s, y - hgt * 0.5, x + 5 * s, y); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,90,0.9)';
    ctx.beginPath(); ctx.moveTo(x - 3 * s, y);
    ctx.quadraticCurveTo(x - 3.5 * s, y - hgt * 0.4, x + lean * 0.6, y - hgt * 0.72);
    ctx.quadraticCurveTo(x + 3.5 * s, y - hgt * 0.4, x + 3 * s, y); ctx.fill();
    ctx.fillStyle = 'rgba(255,245,210,0.9)';
    ctx.beginPath(); ctx.ellipse(x, y - 2 * s, 1.5 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawTorches(ctx, t) {
    for (const tx of TORCHES) {
      const fl = 0.85 + 0.15 * Math.sin(t * 9 + tx) * Math.sin(t * 5.7 + tx * 0.3);
      const tg = ctx.createRadialGradient(tx, 262, 2, tx, 262, 95);
      tg.addColorStop(0, `rgba(255,140,60,${0.22 * fl})`); tg.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = tg; ctx.fillRect(tx - 95, 167, 190, 190);
      flame(ctx, tx, 271, 1.4, t, tx);
      // embers rising
      for (let i = 0; i < 4; i++) {
        const k = (t * 0.6 + hash(tx + i)) % 1;
        ctx.fillStyle = `rgba(255,170,80,${0.7 * (1 - k)})`;
        ctx.fillRect(tx + Math.sin(t * 3 + i * 2) * 5 * k, 262 - k * 50, 1.5, 1.5);
      }
      // thin smoke
      ctx.strokeStyle = 'rgba(120,110,140,0.08)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(tx, 255);
      for (let k = 1; k <= 5; k++) ctx.lineTo(tx + Math.sin(t * 1.2 + k) * 4 * k / 2, 255 - k * 10);
      ctx.stroke();
    }
  }

  function drawBanners(ctx, t) {
    for (const bx of [205, 755]) {
      const top = 80, bot = 228, hw = 22;
      const sway = (y) => Math.sin(t * 1.1 + bx + y * 0.03) * 2.2 * ((y - top) / (bot - top));
      // rod with finials
      ctx.fillStyle = '#5a4524'; ctx.fillRect(bx - 30, top - 4, 60, 3);
      ctx.fillStyle = '#8a6a34';
      ctx.beginPath(); ctx.arc(bx - 31, top - 2.5, 3, 0, Math.PI * 2); ctx.arc(bx + 31, top - 2.5, 3, 0, Math.PI * 2); ctx.fill();
      // cloth
      const tears = [0, 14, -6, 18, -4, 12, 0];
      ctx.beginPath();
      ctx.moveTo(bx - hw, top);
      ctx.lineTo(bx + hw, top);
      ctx.lineTo(bx + hw + sway(bot), bot - 10);
      for (let i = 0; i < tears.length; i++) {
        const x = bx + hw - (i / (tears.length - 1)) * hw * 2;
        ctx.lineTo(x + sway(bot), bot - 10 + tears[i]);
      }
      ctx.closePath();
      const cg = ctx.createLinearGradient(bx - hw, 0, bx + hw, 0);
      cg.addColorStop(0, '#2a0a16'); cg.addColorStop(0.25, '#4a1424'); cg.addColorStop(0.5, '#34101c'); cg.addColorStop(0.75, '#4a1424'); cg.addColorStop(1, '#22080f');
      ctx.fillStyle = cg; ctx.fill();
      ctx.save(); ctx.clip();
      // gold trim inside the edge
      ctx.strokeStyle = 'rgba(170,130,60,0.55)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(bx - hw + 4, top + 4); ctx.lineTo(bx + hw - 4, top + 4);
      ctx.lineTo(bx + hw - 4 + sway(200), 200); ctx.moveTo(bx - hw + 4, top + 4); ctx.lineTo(bx - hw + 4 + sway(200), 200); ctx.stroke();
      // emblem: crescent moon over a bat
      const ey = 140, ex = bx + sway(ey);
      ctx.fillStyle = 'rgba(200,170,100,0.6)';
      ctx.beginPath(); ctx.arc(ex, ey - 12, 8, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#3a1020';
      ctx.beginPath(); ctx.arc(ex + 4, ey - 14, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(200,170,100,0.6)';
      ctx.beginPath();
      ctx.moveTo(ex, ey + 2); ctx.quadraticCurveTo(ex - 8, ey - 4, ex - 14, ey + 1); ctx.lineTo(ex - 10, ey + 4); ctx.lineTo(ex - 12, ey + 8);
      ctx.quadraticCurveTo(ex - 5, ey + 5, ex, ey + 10); ctx.quadraticCurveTo(ex + 5, ey + 5, ex + 12, ey + 8); ctx.lineTo(ex + 10, ey + 4); ctx.lineTo(ex + 14, ey + 1);
      ctx.quadraticCurveTo(ex + 8, ey - 4, ex, ey + 2); ctx.fill();
      // moth holes
      ctx.fillStyle = 'rgba(10,8,20,0.9)';
      ctx.beginPath(); ctx.arc(bx - 9 + sway(185), 185, 2.2, 0, Math.PI * 2); ctx.arc(bx + 12 + sway(110), 110, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawBats(ctx, t) {
    for (let i = 0; i < 3; i++) {
      const period = 11 + i * 3.7;
      const k = ((t + i * 5.3) % period) / period; // 0..1 across the hall, then waits
      const p = k * 2.2 - 0.1;
      if (p < -0.05 || p > 1.05) continue;
      const dir = i % 2 ? -1 : 1;
      const x = dir > 0 ? p * (W + 80) - 40 : W + 40 - p * (W + 80);
      const y = 105 + i * 34 + Math.sin(t * 2.3 + i) * 16 + Math.sin(t * 7 + i) * 3;
      const flap = Math.sin(t * 18 + i * 2);
      const s = 0.8 + 0.2 * i;
      ctx.fillStyle = '#07060d';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x - 6 * s, y - 7 * flap * s, x - 13 * s, y - 2 * flap * s);
      ctx.lineTo(x - 9 * s, y + 1 * s); ctx.lineTo(x - 6 * s, y);
      ctx.lineTo(x, y + 3 * s);
      ctx.lineTo(x + 6 * s, y); ctx.lineTo(x + 9 * s, y + 1 * s);
      ctx.lineTo(x + 13 * s, y - 2 * flap * s);
      ctx.quadraticCurveTo(x + 6 * s, y - 7 * flap * s, x, y);
      ctx.fill();
      ctx.beginPath(); ctx.ellipse(x, y + 1, 2.2 * s, 3 * s, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawChandelier(ctx, t) {
    const cx = chand.x + chand.w / 2;
    const px = CH_BASE_X + CH_W / 2;
    const hubY = chand.y - 46;
    // warm light pooling on the wall behind
    const lg = ctx.createRadialGradient(cx, chand.y + 10, 10, cx, chand.y + 10, 150);
    const fl = 0.9 + 0.1 * Math.sin(t * 7.1);
    lg.addColorStop(0, `rgba(255,180,90,${0.11 * fl})`); lg.addColorStop(1, 'rgba(255,180,90,0)');
    ctx.fillStyle = lg; ctx.fillRect(cx - 150, chand.y - 140, 300, 300);
    // chain: alternating links from the ceiling pivot to the crown
    const dx = cx - px, dy = hubY - 18;
    const len = Math.hypot(dx, dy), n = Math.floor(len / 8);
    const ang = Math.atan2(dy, dx);
    for (let i = 0; i < n; i++) {
      const k = i / n;
      const lx = px + dx * k, ly = dy * k;
      ctx.save(); ctx.translate(lx, ly); ctx.rotate(ang);
      ctx.strokeStyle = i % 2 ? '#3a3448' : '#4e4660'; ctx.lineWidth = 1.6;
      ctx.beginPath();
      if (i % 2) ctx.ellipse(0, 0, 5, 1.2, 0, 0, Math.PI * 2);
      else ctx.ellipse(0, 0, 5, 2.8, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    // crown ornament
    ctx.fillStyle = '#5a4c30';
    ctx.beginPath(); ctx.moveTo(cx - 8, hubY - 14); ctx.lineTo(cx + 8, hubY - 14); ctx.lineTo(cx + 5, hubY - 4); ctx.lineTo(cx - 5, hubY - 4); ctx.fill();
    for (const s of [-1, 0, 1]) { ctx.beginPath(); ctx.arc(cx + s * 6, hubY - 16, 2, 0, Math.PI * 2); ctx.fill(); }
    // hub
    const hg = ctx.createRadialGradient(cx - 2, hubY - 2, 1, cx, hubY, 8);
    hg.addColorStop(0, '#c9ae6a'); hg.addColorStop(1, '#4a3c22');
    ctx.fillStyle = hg; ctx.beginPath(); ctx.arc(cx, hubY, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#4a3c22'; ctx.beginPath(); ctx.moveTo(cx - 3, hubY + 6); ctx.lineTo(cx + 3, hubY + 6); ctx.lineTo(cx, hubY + 16); ctx.fill();
    // scrolled arms from hub out to the ring
    ctx.strokeStyle = '#6a5a36'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      for (const reach of [0.5, 0.95]) {
        const ex = cx + s * (chand.w / 2 - 6) * reach;
        ctx.beginPath(); ctx.moveTo(cx, hubY + 2);
        ctx.bezierCurveTo(cx + s * 22 * reach, hubY - 10, ex - s * 10, chand.y - 30, ex, chand.y);
        ctx.stroke();
      }
      // small curl near the hub
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx + s * 12, hubY + 10, 4, s > 0 ? Math.PI : 0, s > 0 ? Math.PI * 2.6 : Math.PI * 1.6, s < 0); ctx.stroke();
      ctx.lineWidth = 2.5;
    }
    ctx.beginPath(); ctx.moveTo(cx, hubY + 16); ctx.lineTo(cx, chand.y); ctx.stroke();
    ctx.lineCap = 'butt';
    // ring (standing surface): bronze band with rivets
    const rg = ctx.createLinearGradient(0, chand.y, 0, chand.y + chand.h);
    rg.addColorStop(0, '#b29a5c'); rg.addColorStop(0.4, '#7a6638'); rg.addColorStop(1, '#3a2f1a');
    ctx.fillStyle = rg; ctx.fillRect(chand.x, chand.y, chand.w, chand.h);
    ctx.fillStyle = '#e0c886'; ctx.fillRect(chand.x, chand.y, chand.w, 1);
    ctx.fillStyle = 'rgba(40,30,15,0.8)';
    for (let x = chand.x + 6; x < chand.x + chand.w - 3; x += 12) ctx.fillRect(x, chand.y + 5, 2, 2);
    ctx.fillStyle = '#5a4a28';
    ctx.beginPath(); ctx.arc(chand.x, chand.y + chand.h / 2, 5, 0, Math.PI * 2); ctx.arc(chand.x + chand.w, chand.y + chand.h / 2, 5, 0, Math.PI * 2); ctx.fill();
    // hanging crystals that catch the light
    for (let i = 0; i < 11; i++) {
      const x = chand.x + 10 + i * ((chand.w - 20) / 10);
      const y = chand.y + chand.h + 2 + (i % 2) * 5;
      const sw = Math.sin(t * 2 + i) * 1.2;
      ctx.strokeStyle = 'rgba(200,190,160,0.4)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(x, chand.y + chand.h); ctx.lineTo(x + sw, y); ctx.stroke();
      const glint = 0.35 + 0.35 * Math.max(0, Math.sin(t * 3 + i * 1.9)) + flash * 0.5;
      ctx.fillStyle = `rgba(200,225,255,${Math.min(0.95, glint)})`;
      ctx.beginPath(); ctx.moveTo(x + sw, y); ctx.lineTo(x + sw + 2, y + 4); ctx.lineTo(x + sw, y + 9); ctx.lineTo(x + sw - 2, y + 4); ctx.fill();
    }
    // candles on drop-rods: cup below the ring, candle standing in it, flame pointing up
    for (let i = 0; i < 5; i++) {
      const x = chand.x + 18 + i * ((chand.w - 36) / 4);
      const y = chand.y + chand.h;
      ctx.fillStyle = '#5a4e32'; ctx.fillRect(x - 1, y, 2, 30);
      ctx.fillStyle = '#7a6638';
      ctx.beginPath(); ctx.moveTo(x - 7, y + 28); ctx.lineTo(x + 7, y + 28); ctx.lineTo(x + 3, y + 33); ctx.lineTo(x - 3, y + 33); ctx.fill();
      ctx.fillStyle = '#b29a5c'; ctx.fillRect(x - 7, y + 28, 14, 1);
      ctx.fillStyle = '#d8cfb2'; ctx.fillRect(x - 3, y + 17, 6, 11);
      ctx.fillStyle = 'rgba(255,255,240,0.3)'; ctx.fillRect(x - 3, y + 17, 1.5, 11);
      ctx.fillStyle = '#ece4ca';
      ctx.beginPath(); ctx.ellipse(x + (i % 2 ? 2.2 : -2.2), y + 21, 1.3, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#2a2018'; ctx.fillRect(x - 0.5, y + 15, 1, 2);
      const g2 = ctx.createRadialGradient(x, y + 10, 1, x, y + 10, 16);
      g2.addColorStop(0, 'rgba(255,190,90,0.35)'); g2.addColorStop(1, 'rgba(255,190,90,0)');
      ctx.fillStyle = g2; ctx.fillRect(x - 16, y - 6, 32, 32);
      flame(ctx, x, y + 16, 0.6, t, i * 3.3);
    }
  }

  function drawGhost(ctx, t) {
    const s = ghostState();
    const gx = ghost.x, gy = ghost.y, gh = ghost.h;
    ctx.save();
    // return marker: dashed outline that fills as the platform comes back
    if (!s.solid) {
      const prog = s.gone ? s.k * 0.7 : 0.7 + s.k * 0.3;
      ctx.strokeStyle = 'rgba(150,220,210,0.28)'; ctx.setLineDash([5, 6]); ctx.lineWidth = 1;
      ctx.strokeRect(gx + 0.5, gy + 0.5, GHOST_W - 1, gh - 1);
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(150,230,215,0.4)';
      ctx.fillRect(gx, gy + gh - 2, GHOST_W * prog, 2);
      // swirling motes gathering where it will reappear
      for (let i = 0; i < 6; i++) {
        const a = t * 2 + i * 1.05;
        const rr = 40 * (1 - prog) + 8;
        ctx.fillStyle = `rgba(160,240,225,${0.15 + prog * 0.35})`;
        ctx.fillRect(gx + GHOST_W / 2 + Math.cos(a) * rr * 1.6, gy + 6 + Math.sin(a) * rr * 0.4, 2, 2);
      }
    }
    if (s.a > 0.01) {
      const warn = s.warn;
      const main = warn ? [200, 110, 150] : [120, 225, 205];
      const rgb = (a) => `rgba(${main[0]},${main[1]},${main[2]},${a})`;
      ctx.globalAlpha = s.a;
      // soft aura
      const au = ctx.createRadialGradient(gx + GHOST_W / 2, gy + 6, 4, gx + GHOST_W / 2, gy + 6, 90);
      au.addColorStop(0, rgb(0.22)); au.addColorStop(1, rgb(0));
      ctx.fillStyle = au; ctx.fillRect(gx - 30, gy - 60, GHOST_W + 60, 130);
      // wispy drips under the slab
      ctx.fillStyle = rgb(0.45);
      for (let i = 0; i < 7; i++) {
        const x = gx + 8 + i * 21;
        const len = 12 + 7 * Math.sin(t * 3 + i * 1.7);
        ctx.beginPath();
        ctx.moveTo(x - 7, gy + gh - 1);
        ctx.quadraticCurveTo(x + 5 * Math.sin(t * 4 + i), gy + gh + len, x + 7, gy + gh - 1);
        ctx.fill();
      }
      // body with rounded ends and an inner gradient
      const bg = ctx.createLinearGradient(0, gy, 0, gy + gh);
      bg.addColorStop(0, warn ? '#f0b8cc' : '#c8fff2'); bg.addColorStop(0.35, rgb(1)); bg.addColorStop(1, warn ? '#6a3050' : '#2f7a70');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(gx + 6, gy); ctx.lineTo(gx + GHOST_W - 6, gy);
      ctx.quadraticCurveTo(gx + GHOST_W, gy, gx + GHOST_W, gy + gh / 2);
      ctx.quadraticCurveTo(gx + GHOST_W, gy + gh, gx + GHOST_W - 6, gy + gh);
      ctx.lineTo(gx + 6, gy + gh);
      ctx.quadraticCurveTo(gx, gy + gh, gx, gy + gh / 2);
      ctx.quadraticCurveTo(gx, gy, gx + 6, gy);
      ctx.fill();
      // swirling ectoplasm lines inside
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        for (let x = 0; x <= GHOST_W; x += 6) {
          const y = gy + 3 + i * 3 + Math.sin(x * 0.08 + t * 2.5 + i * 2) * 1.5;
          x ? ctx.lineTo(gx + x, y) : ctx.moveTo(gx, y);
        }
        ctx.stroke();
      }
      // warning cracks spread across the slab
      if (warn) {
        ctx.strokeStyle = 'rgba(60,10,30,0.8)'; ctx.lineWidth = 1.2;
        const n = 1 + Math.floor(s.k * 4);
        for (let i = 0; i < n; i++) {
          const x0 = gx + 20 + i * 30;
          ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x0 + 5, gy + 5); ctx.lineTo(x0 - 2, gy + 8); ctx.lineTo(x0 + 3, gy + gh); ctx.stroke();
        }
      }
      ctx.restore();
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(gx + 6, gy, GHOST_W - 12, 1);
      // face on the front: hollow eyes, mouth gasps open while warning
      const fx = gx + GHOST_W / 2, fy = gy + gh + 3 + Math.sin(t * 2) * 1;
      ctx.fillStyle = 'rgba(8,18,26,0.75)';
      ctx.beginPath(); ctx.ellipse(fx - 14, fy, 4, warn ? 4.5 : 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(fx + 14, fy, 4, warn ? 4.5 : 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath();
      if (warn) ctx.ellipse(fx, fy + 9, 4, 5, 0, 0, Math.PI * 2);
      else ctx.ellipse(fx, fy + 8, 6, 2, 0, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(fx - 15, fy - 1.5, 1.5, 1.5); ctx.fillRect(fx + 13, fy - 1.5, 1.5, 1.5);
    }
    ctx.restore();
  }

  function drawCoffin(ctx, o, t) {
    const { x: ox, w, h } = o;
    const y = o.y;
    if (isBroken(o)) {
      // smashed: open base, planks, lid fallen, ghostly glow lingering
      ctx.fillStyle = '#211510';
      ctx.fillRect(ox + 2, FLOOR - 10, w - 4, 10);
      ctx.fillStyle = '#0c0a08'; ctx.fillRect(ox + 5, FLOOR - 9, w - 10, 4);
      const planks = [[10, -0.35, 34, '#4a3024'], [w - 6, 0.25, 28, '#3a241a'], [w / 2, 0.06, 40, '#33201a']];
      for (const [px, rot, len, col] of planks) {
        ctx.save(); ctx.translate(ox + px, FLOOR - 3); ctx.rotate(rot);
        ctx.fillStyle = col; ctx.fillRect(-len / 2, -3, len, 5);
        ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.fillRect(-len / 2 + 3, -1, len - 8, 1);
        ctx.fillStyle = '#6a6a74'; ctx.fillRect(len / 2 - 4, -2, 1.5, 1.5);
        ctx.restore();
      }
      const gl = 0.1 + 0.06 * Math.sin(t * 2 + ox);
      ctx.fillStyle = `rgba(120,240,170,${gl})`; ctx.fillRect(ox + 6, FLOOR - 12, w - 12, 3);
      ctx.fillStyle = `rgba(160,240,220,${gl * 0.8})`;
      for (let i = 0; i < 3; i++) {
        const k = (t * 0.4 + i / 3) % 1;
        ctx.beginPath(); ctx.arc(ox + 14 + i * 18 + Math.sin(t * 2 + i) * 3, FLOOR - 12 - k * 30, 2.5 * (1 - k), 0, Math.PI * 2); ctx.fill();
      }
      return;
    }
    const hp0 = COFFIN_HP;
    const dmg = typeof o.hp === 'number' ? 1 - Math.max(0, o.hp) / hp0 : 0;
    const hitT = o._hitT > 0 ? o._hitT : 0;
    const x = ox + (hitT > 0 ? Math.sin(hitT * 120) * 2 : 0);
    // contact shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(x + w / 2, FLOOR + 1, w / 2 + 4, 3, 0, 0, Math.PI * 2); ctx.fill();
    // body: tapered profile, shoulder wider than foot
    const shape = () => {
      ctx.beginPath();
      ctx.moveTo(x + 3, y + h); ctx.lineTo(x + w - 3, y + h);
      ctx.lineTo(x + w, y + 14); ctx.lineTo(x + w - 10, y + 4);
      ctx.lineTo(x + 10, y + 4); ctx.lineTo(x, y + 14); ctx.closePath();
    };
    const wg = ctx.createLinearGradient(0, y, 0, y + h);
    wg.addColorStop(0, '#3e281c'); wg.addColorStop(1, '#1e130d');
    ctx.fillStyle = wg; shape(); ctx.fill();
    ctx.save(); shape(); ctx.clip();
    // wood grain
    ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const gy = y + 18 + i * 4;
      ctx.beginPath(); ctx.moveTo(x, gy);
      for (let k = 0; k <= w; k += 8) ctx.lineTo(x + k, gy + Math.sin(k * 0.3 + i * 2 + ox) * 0.8);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x, y + h - 6, w, 6);
    ctx.restore();
    // lid: separate top board, slides open as it breaks
    const ajar = dmg > 0.6 ? 6 : 0;
    const lidX = x + (o === coffinL ? -ajar : ajar);
    if (ajar) {
      // eerie glow escaping through the gap and bony fingers peeking out
      const gl = 0.35 + 0.15 * Math.sin(t * 3 + ox);
      ctx.fillStyle = `rgba(120,240,170,${gl})`; ctx.fillRect(x + 8, y + 9, w - 16, 4);
      const fx = o === coffinL ? x + w - 12 : x + 6;
      ctx.fillStyle = '#d8d4c0';
      for (let i = 0; i < 3; i++) {
        const wig = Math.sin(t * 5 + i) * 1;
        ctx.fillRect(fx + i * 3, y + 4 - wig - (i === 1 ? 2 : 0), 1.8, 6 + wig);
      }
    }
    const lg = ctx.createLinearGradient(0, y, 0, y + 12);
    lg.addColorStop(0, '#5a3a28'); lg.addColorStop(1, '#3a2418');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.moveTo(lidX + 1, y + 13); ctx.lineTo(lidX + 10, y); ctx.lineTo(lidX + w - 10, y); ctx.lineTo(lidX + w - 1, y + 13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,220,180,0.18)'; ctx.fillRect(lidX + 10, y, w - 20, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x + 1, y + 13, w - 2, 1.5);
    // eerie glow in the seam, pulsing
    const g = 0.14 + 0.08 * Math.sin(t * 2.2 + ox) + dmg * 0.15;
    ctx.fillStyle = `rgba(120,240,170,${g})`; ctx.fillRect(x + 4, y + 14.5, w - 8, 1.5);
    // iron corner brackets with rivets
    ctx.fillStyle = '#3a3a44';
    ctx.fillRect(x + 2, y + h - 8, 8, 6); ctx.fillRect(x + w - 10, y + h - 8, 8, 6);
    ctx.fillRect(lidX + 8, y + 1, 7, 4); ctx.fillRect(lidX + w - 15, y + 1, 7, 4);
    ctx.fillStyle = '#7a7a88';
    for (const px of [x + 5, x + w - 7]) ctx.fillRect(px, y + h - 6, 1.5, 1.5);
    // brass handles
    ctx.strokeStyle = 'rgba(170,140,70,0.85)'; ctx.lineWidth = 1.5;
    for (const hx of [x + 16, x + w - 16]) { ctx.beginPath(); ctx.arc(hx, y + 24, 3.5, 0, Math.PI); ctx.stroke(); }
    // brass cross on the lid
    ctx.fillStyle = 'rgba(200,165,85,0.85)';
    ctx.fillRect(lidX + w / 2 - 1.5, y + 2, 3, 9); ctx.fillRect(lidX + w / 2 - 4.5, y + 4, 9, 2.5);
    ctx.fillStyle = 'rgba(255,240,190,0.5)'; ctx.fillRect(lidX + w / 2 - 1.5, y + 2, 1, 9);
    // damage: cracks and a split plank
    if (dmg > 0.25) {
      ctx.strokeStyle = 'rgba(10,5,2,0.95)'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(x + w * 0.3, y + 15); ctx.lineTo(x + w * 0.36, y + 22); ctx.lineTo(x + w * 0.31, y + 29);
      if (dmg > 0.45) { ctx.moveTo(x + w * 0.68, y + 15); ctx.lineTo(x + w * 0.62, y + 24); ctx.lineTo(x + w * 0.7, y + 33); }
      ctx.stroke();
      ctx.fillStyle = 'rgba(200,160,110,0.25)'; ctx.fillRect(x + w * 0.36, y + 22, 2, 1);
    }
    if (hitT > 0) {
      ctx.fillStyle = `rgba(255,255,255,${hitT * 2})`; shape(); ctx.fill();
    }
  }

  function drawGargoyle(ctx, o, t) {
    const { x, y, w, h } = o;
    const cx = x + w / 2, face = x < W / 2 ? 1 : -1;
    const stone = ctx.createLinearGradient(x - 10, 0, x + w + 10, 0);
    stone.addColorStop(face > 0 ? 0 : 1, '#2a2640'); stone.addColorStop(0.5, '#4a4466'); stone.addColorStop(face > 0 ? 1 : 0, '#222036');
    // plinth with molding
    ctx.fillStyle = '#332e4a'; ctx.fillRect(x - 3, y + h - 10, w + 6, 10);
    ctx.fillStyle = '#3e3858'; ctx.fillRect(x - 5, y + h - 12, w + 10, 3);
    ctx.fillStyle = 'rgba(200,190,240,0.15)'; ctx.fillRect(x - 5, y + h - 12, w + 10, 1);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - 3, y + h - 3, w + 6, 3);
    ctx.fillStyle = stone;
    // folded wing behind, ribbed
    ctx.beginPath();
    ctx.moveTo(cx - face * 2, y + 16);
    ctx.quadraticCurveTo(cx - face * 20, y - 2, cx - face * 24, y + 2);
    ctx.lineTo(cx - face * 20, y + 14); ctx.lineTo(cx - face * 22, y + 22); ctx.lineTo(cx - face * 16, y + 30); ctx.lineTo(cx - face * 6, y + 34);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - face * 4, y + 18); ctx.lineTo(cx - face * 20, y + 14);
    ctx.moveTo(cx - face * 4, y + 22); ctx.lineTo(cx - face * 18, y + 24);
    ctx.stroke();
    // crouched body and haunches
    ctx.fillStyle = stone;
    ctx.beginPath();
    ctx.moveTo(x + 2, y + h - 12);
    ctx.quadraticCurveTo(x - 1, y + 26, cx - face * 2, y + 14);
    ctx.quadraticCurveTo(cx + face * 12, y + 16, x + (face > 0 ? w : 0) - face * 3, y + 30);
    ctx.lineTo(x + w - 2, y + h - 12);
    ctx.closePath(); ctx.fill();
    // forelegs with claws gripping the plinth edge
    const lx = cx + face * 9;
    ctx.fillRect(lx - 3, y + 26, 6, h - 38);
    ctx.fillStyle = '#4a4466';
    for (let k = 0; k < 3; k++) ctx.fillRect(lx - 4 + k * 3 + (face > 0 ? 1 : -1), y + h - 13, 1.5, 3);
    // head: brow, snout, open jaw with fangs
    ctx.fillStyle = stone;
    const hx = cx + face * 7, hy = y + 10;
    ctx.beginPath(); ctx.ellipse(hx, hy, 9, 8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(hx + face * 4, hy - 3); ctx.lineTo(hx + face * 14, hy + 1); ctx.lineTo(hx + face * 12, hy + 5); ctx.lineTo(hx + face * 3, hy + 6); ctx.fill();
    ctx.fillStyle = '#100e1c';
    ctx.beginPath(); ctx.moveTo(hx + face * 4, hy + 5); ctx.lineTo(hx + face * 12, hy + 5); ctx.lineTo(hx + face * 6, hy + 9); ctx.fill();
    ctx.fillStyle = '#5a5478';
    ctx.fillRect(hx + face * 9 - 0.5, hy + 5, 1, 2); ctx.fillRect(hx + face * 6 - 0.5, hy + 5, 1, 2);
    // horns and pointed ears
    ctx.fillStyle = stone;
    ctx.beginPath();
    ctx.moveTo(hx - face * 4, hy - 5); ctx.quadraticCurveTo(hx - face * 10, hy - 12, hx - face * 12, hy - 18); ctx.lineTo(hx - face * 1, hy - 7);
    ctx.moveTo(hx + face * 1, hy - 7); ctx.quadraticCurveTo(hx + face * 2, hy - 15, hx - face * 2, hy - 20); ctx.lineTo(hx + face * 5, hy - 6);
    ctx.fill();
    // brow highlight + weathering
    ctx.fillStyle = 'rgba(210,200,250,0.14)';
    ctx.fillRect(hx - 5, hy - 6, 10, 1);
    ctx.fillStyle = 'rgba(40,70,45,0.45)';
    ctx.beginPath(); ctx.arc(x + 4, y + h - 14, 2.5, 0, Math.PI * 2); ctx.arc(cx - face * 10, y + 30, 1.6, 0, Math.PI * 2); ctx.fill();
    // glowing eyes that brighten with lightning and track the nearest fighter
    const tgt = Math.abs(seen[0] - cx) < Math.abs(seen[1] - cx) ? seen[0] : seen[1];
    const look = Math.max(-1, Math.min(1, (tgt - hx) / 200));
    const e = Math.min(1, 0.5 + 0.2 * Math.sin(t * 1.5) + flash * 0.5);
    const ex = hx + face * 3, ey = hy - 2;
    const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, 9);
    eg.addColorStop(0, `rgba(255,70,70,${e * 0.35})`); eg.addColorStop(1, 'rgba(255,70,70,0)');
    ctx.fillStyle = eg; ctx.fillRect(ex - 9, ey - 9, 18, 18);
    ctx.fillStyle = '#100e1c'; ctx.fillRect(ex - 4, ey - 1.5, 8, 3);
    ctx.fillStyle = `rgba(255,90,80,${e})`;
    ctx.fillRect(ex - 3 + look * 1.2, ey - 1, 2.2, 2); ctx.fillRect(ex + 1 + look * 1.2, ey - 1, 2.2, 2);
  }

  function drawObstacles(ctx, t) {
    for (const o of OBSTACLES) {
      ctx.save();
      if (o.kind === 'coffin') drawCoffin(ctx, o, t);
      else if (o.kind === 'gargoyle') drawGargoyle(ctx, o, t);
      ctx.restore();
    }
  }

  function drawWeb(ctx, ox, sx, r0, t) {
    ctx.strokeStyle = 'rgba(200,200,225,0.13)'; ctx.lineWidth = 1;
    const spokes = 6;
    for (let i = 0; i <= spokes; i++) {
      const a = (i / spokes) * Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox + sx * Math.cos(a) * r0, Math.sin(a) * r0); ctx.stroke();
    }
    const sway = Math.sin(t * 0.9) * 1.5;
    for (let r = 18; r <= r0 - 8; r += 15) {
      ctx.beginPath();
      for (let i = 0; i <= spokes; i++) {
        const a = (i / spokes) * Math.PI / 2;
        const x = ox + sx * Math.cos(a) * r, y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y);
        else {
          const am = ((i - 0.5) / spokes) * Math.PI / 2;
          ctx.quadraticCurveTo(ox + sx * Math.cos(am) * r * 0.86 + sway, Math.sin(am) * r * 0.86 + sway, x, y);
        }
      }
      ctx.stroke();
    }
    // dew drops catching the moonlight
    for (let i = 0; i < 4; i++) {
      const a = (0.15 + i * 0.22) * Math.PI / 2, r = 30 + i * 12;
      ctx.fillStyle = `rgba(220,230,255,${0.2 + 0.25 * Math.max(0, Math.sin(t * 1.3 + i * 2))})`;
      ctx.fillRect(ox + sx * Math.cos(a) * r, Math.sin(a) * r, 1.5, 1.5);
    }
  }

  // ---------------------------------------------------------------- arena
  const arena = {
    id: 'arena10',
    name: 'Haunted Castle',
    nameVi: 'Lâu đài ma',
    hint: 'Ghost platform fades away',
    hintVi: 'Bục ma lúc ẩn lúc hiện',
    floorY: FLOOR,
    gravityScale: 0.92,
    platforms: [balL, balR, chand, ghost],
    obstacles: OBSTACLES,

    reset() {
      ghostT = 0; chandT = 0; flash = 0; boltTimer = rnd(4, 7); bolt = null;
      chand.x = CH_BASE_X; ghost.w = GHOST_W;
      // engine restores hp before reset; this covers standalone use too
      coffinL.hp = COFFIN_HP; coffinR.hp = COFFIN_HP;
      wasBroken[0] = wasBroken[1] = false;
    },

    update(dt, fighters, game) {
      try {
        if (!(dt > 0)) return;
        dt = Math.min(dt, 0.1);
        if (fighters) for (let i = 0; i < 2; i++) if (fighters[i] && Number.isFinite(fighters[i].x)) seen[i] = fighters[i].x;
        // Chandelier: slow pendulum sway
        chandT += dt;
        chand.x = CH_BASE_X + Math.sin(chandT * 0.9) * CH_SWAY;

        // Ghost platform cycle
        const wasSolid = ghostState().solid;
        ghostT = (ghostT + dt) % G_CYCLE;
        const s = ghostState();
        ghost.w = s.solid ? GHOST_W : 0;
        if (wasSolid && !s.solid && game && game.particle) {
          for (let i = 0; i < 14; i++) {
            game.particle({ x: ghost.x + Math.random() * GHOST_W, y: ghost.y + 6, vx: rnd(-30, 30), vy: rnd(-60, -10), life: rnd(0.5, 0.9), col: '#8fe6d6', r: 3, float: true });
          }
        }

        // A broken coffin releases its ghost
        [coffinL, coffinR].forEach((c, i) => {
          const b = isBroken(c);
          if (b && !wasBroken[i] && game && game.particle) {
            for (let k = 0; k < 18; k++) {
              game.particle({ x: c.x + Math.random() * c.w, y: c.y + 10, vx: rnd(-40, 40), vy: rnd(-140, -50), life: rnd(0.7, 1.2), col: k % 3 ? '#8fe6d6' : '#d8fff6', r: 3, float: true });
            }
            if (game.word) game.word(c.x + c.w / 2, c.y - 20, 'BOO!', '#8fe6d6');
          }
          wasBroken[i] = b;
        });

        // Lightning: purely visual flash + small shake
        boltTimer -= dt;
        if (boltTimer <= 0) {
          boltTimer = rnd(7, 13);
          flash = 1;
          const wins = [110, 300, 480, 660, 850];
          const bx = wins[Math.floor(Math.random() * wins.length)] + rnd(-12, 12);
          const pts = [[bx, 80]];
          let x = bx;
          for (let y = 80; y < 270; y += 18) { x += rnd(-12, 12); pts.push([x, y]); }
          // forks come from a local PRNG so Math.random use stays as before
          const R = prng(Math.floor(bx * 1000));
          const br = [];
          for (let k = 2; k < pts.length - 2; k += 3) {
            let fx = pts[k][0], fy = pts[k][1];
            const dir = R() < 0.5 ? -1 : 1, seg = [[fx, fy]];
            for (let j = 0; j < 3; j++) { fx += dir * (6 + R() * 8); fy += 10 + R() * 8; seg.push([fx, fy]); }
            br.push(seg);
          }
          bolt = { pts, br, life: 0.35 };
          if (game && game.shake && game.state !== 'menu') game.shake(3);
        }
        if (flash > 0) flash = Math.max(0, flash - dt * 2.6);
        if (bolt) { bolt.life -= dt; if (bolt.life <= 0) bolt = null; }
      } catch (e) { /* never throw into the engine */ }
    },

    drawBackground(ctx, t) {
      try {
        if (!layerA) buildLayerA();
        if (!layerB) buildLayerB();
        ctx.save();
        ctx.drawImage(layerA, 0, 0);
        drawSkyMotion(ctx, t);
        ctx.drawImage(layerB, 0, 0);
        drawMoonbeams(ctx, t);
        drawTorches(ctx, t);
        drawBanners(ctx, t);
        drawBats(ctx, t);
        drawChandelier(ctx, t);
        drawGhost(ctx, t);
        drawObstacles(ctx, t);
        // floating spirit wisps with short tails in the upper hall
        for (let i = 0; i < 4; i++) {
          const k = t * 0.05 + i * 0.25;
          const x = (((k % 1) + 1) % 1) * (W + 120) - 60;
          const y = 118 + i * 28 + Math.sin(t * 1.3 + i * 2) * 14;
          for (let j = 4; j >= 0; j--) {
            const tx = x - j * 5, ty = y + Math.sin(t * 1.3 + i * 2 - j * 0.3) * 3;
            ctx.fillStyle = `rgba(170,240,228,${0.05 + (4 - j) * 0.025})`;
            ctx.beginPath(); ctx.arc(tx, ty, 4 + (4 - j) * 1.6, 0, Math.PI * 2); ctx.fill();
          }
          ctx.fillStyle = 'rgba(210,255,245,0.35)';
          ctx.beginPath(); ctx.arc(x, y, 2.5, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      } catch (e) {
        try { ctx.restore(); } catch (e2) {}
      }
    },

    drawForeground(ctx, t) {
      try {
        ctx.save();
        // low creeping fog in two layers
        for (let i = 0; i < 5; i++) {
          const sp = 10 + i * 5;
          const off = ((t * sp + i * 260) % (W + 400)) - 200;
          const fy = FLOOR + 6 - (i % 2) * 14;
          const fg = ctx.createRadialGradient(off, fy, 10, off, fy, 200);
          fg.addColorStop(0, `rgba(165,175,210,${i % 2 ? 0.06 : 0.09})`); fg.addColorStop(1, 'rgba(165,175,210,0)');
          ctx.fillStyle = fg; ctx.fillRect(off - 200, fy - 70, 400, 140);
        }
        // lightning flash on everything (very soft)
        if (flash > 0) {
          ctx.fillStyle = `rgba(190,205,255,${flash * 0.08})`;
          ctx.fillRect(0, 0, W, H);
        }
        // cobwebs in the top corners
        drawWeb(ctx, 0, 1, 110, t);
        drawWeb(ctx, W, -1, 95, t);
        // a spider bobbing on its thread from the left web
        const sy = 96 + Math.sin(t * 0.7) * 16;
        ctx.strokeStyle = 'rgba(200,200,225,0.22)'; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(62, 40); ctx.lineTo(62, sy - 4); ctx.stroke();
        ctx.fillStyle = '#0a0910';
        ctx.beginPath(); ctx.ellipse(62, sy, 3.2, 4, 0, 0, Math.PI * 2); ctx.arc(62, sy - 4.5, 2, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#0a0910';
        for (const s of [-1, 1]) for (let k = 0; k < 4; k++) {
          const wig = Math.sin(t * 6 + k) * 0.6;
          ctx.beginPath(); ctx.moveTo(62, sy - 1 + k);
          ctx.lineTo(62 + s * 5, sy - 3 + k * 2 + wig); ctx.lineTo(62 + s * 7, sy + 1 + k * 2.2); ctx.stroke();
        }
        // falling dust from the vaulted ceiling
        for (let i = 0; i < 10; i++) {
          const k = (t * (0.04 + hash(i) * 0.04) + hash(i + 30)) % 1;
          const x = hash(i + 50) * W + Math.sin(t * 0.7 + i) * 10;
          ctx.fillStyle = `rgba(200,195,225,${0.12 * (1 - k)})`;
          ctx.fillRect(x, 80 + k * 380, 1.2, 1.2);
        }
        // vignette with a cold tint
        const vg = ctx.createRadialGradient(W / 2, H / 2, 250, W / 2, H / 2, 620);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(2,0,12,0.5)');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
        ctx.restore();
      } catch (e) {
        try { ctx.restore(); } catch (e2) {}
      }
    },
  };

  (window.STICK_ARENAS = window.STICK_ARENAS || []).push(arena);
})();
