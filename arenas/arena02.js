// Arena 02: Volcano (Núi lửa)
// Rock ledges over a cooled-crust floor, two basalt pillars and two breakable boulders. Three lava vents (one centre, two at the edges)
// erupt in turn: first the centre, then both edges together. Each eruption glows and
// bubbles for 1.3 s before the column shoots up, so there is always time to move.
// Visuals: every static layer is painted once to offscreen canvases; per-frame drawing only reads
// `t` and the hazard state, never Math.random, so online peers stay in step.
(function () {
  const W = 960, H = 540, FLOOR = 474;
  const VENT_W = 96;
  const VENTS = [
    { x: 480, group: 0 },            // centre
    { x: 72, group: 1 }, { x: 888, group: 1 }, // both edges (symmetric)
  ];
  const FIRST = 5, PERIOD = 7.5, WARN = 1.3, ACTIVE = 0.9, RISE = 0.18;
  const COL_TOP = 175;               // lava column reaches up to here
  const DMG = 10, HIT_CD = 1.2;
  const BOULDER_HP = 35;

  // local/cycle are only read by the drawing code (afterglow, crater mood)
  const S = { clock: 0, cycle: -1, group: 0, phase: 'idle', phaseT: 0, local: 0, cd: [0, 0], fx: [] };

  // ---------- helpers ----------
  const TAU = Math.PI * 2;
  function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const ease = (v) => v * v * (3 - 2 * v);
  function layer(w, h, paint) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    paint(c.getContext('2d'), c.width, c.height);
    return c;
  }
  function poly(b, pts) { b.beginPath(); pts.forEach((p, i) => (i ? b.lineTo(p[0], p[1]) : b.moveTo(p[0], p[1]))); b.closePath(); }
  function path(b, pts) { b.beginPath(); pts.forEach((p, i) => (i ? b.lineTo(p[0], p[1]) : b.moveTo(p[0], p[1]))); }
  // jagged polyline between two points
  function jag(r, x1, y1, x2, y2, step, amp) {
    const n = Math.max(2, Math.round(Math.hypot(x2 - x1, y2 - y1) / step)), out = [];
    for (let i = 0; i <= n; i++) {
      const k = i / n, e = i === 0 || i === n ? 0 : (r() - 0.5) * amp;
      out.push([x1 + (x2 - x1) * k + e * 0.4, y1 + (y2 - y1) * k + e]);
    }
    return out;
  }

  // ---------- shapes shared by static and animated layers ----------
  const CONE = (() => {
    const r = rng(311), L = [], R = [];
    // left flank from crater lip down to the plain, right flank mirrored with its own jitter
    for (let i = 0; i <= 14; i++) { const k = i / 14; L.push([428 - k * k * 40 - k * 250 + (r() - 0.5) * 8 * k, 142 + k * 300 + (r() - 0.5) * 6]); }
    for (let i = 0; i <= 14; i++) { const k = i / 14; R.push([532 + k * k * 40 + k * 250 + (r() - 0.5) * 8 * k, 142 + k * 300 + (r() - 0.5) * 6]); }
    return { L, R };
  })();
  // lava rivers on the cone: [points], each ends behind a ridge
  const STREAMS = (() => {
    const river = (x0, y0, x1, y1, n, amp, ph) => {
      const out = [];
      for (let i = 0; i <= n; i++) {
        const k = i / n, m = Math.sin(k * 7 + ph) * amp * Math.sin(k * Math.PI);
        out.push([x0 + (x1 - x0) * k + m, y0 + (y1 - y0) * k + Math.cos(k * 5 + ph) * 3]);
      }
      return out;
    };
    return [
      river(450, 147, 300, 362, 16, 12, 0.3),
      river(512, 147, 668, 352, 16, 11, 2.1),
      river(586, 248, 622, 318, 6, 5, 4.0),   // branch off the right river
      river(372, 252, 338, 302, 5, 4, 1.2),   // branch off the left river
    ];
  })();
  const PLATFORMS = [
    { x: 120, y: 340, w: 170, h: 18 },
    { x: 395, y: 228, w: 170, h: 18 },
    { x: 670, y: 340, w: 170, h: 18 },
  ];

  // ---------- static layers (painted once) ----------
  let L = null;
  function build() {
    const out = {};
    out.vig = layer(W, H, (b) => {
      const g = b.createRadialGradient(W / 2, H * 0.55, H * 0.35, W / 2, H * 0.55, W * 0.72);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(8,2,2,.55)');
      b.fillStyle = g; b.fillRect(0, 0, W, H);
    });
    out.sky = layer(W, H, paintSky);
    out.sky.getContext('2d').drawImage(out.vig, 0, 0);
    out.floor = layer(W, H - FLOOR + 6, paintFloor);
    out.floor.getContext('2d').drawImage(out.vig, 0, -(FLOOR - 2));
    out.vig = null;
    out.seams = [0, 1, 2].map(k => layer(W, H - FLOOR + 6, (b) => paintSeams(b, k)));
    out.ember = layer(16, 16, (b) => {
      const g = b.createRadialGradient(8, 8, 0, 8, 8, 8);
      g.addColorStop(0, 'rgba(255,230,160,1)'); g.addColorStop(0.25, 'rgba(255,150,60,.8)'); g.addColorStop(1, 'rgba(255,60,10,0)');
      b.fillStyle = g; b.fillRect(0, 0, 16, 16);
    });
    out.glow = layer(128, 128, (b) => {
      const g = b.createRadialGradient(64, 64, 0, 64, 64, 64);
      g.addColorStop(0, 'rgba(255,140,50,.9)'); g.addColorStop(0.4, 'rgba(255,90,30,.35)'); g.addColorStop(1, 'rgba(255,60,20,0)');
      b.fillStyle = g; b.fillRect(0, 0, 128, 128);
    });
    out.smoke = layer(96, 96, (b) => {
      const g = b.createRadialGradient(48, 44, 4, 48, 50, 48);
      g.addColorStop(0, 'rgba(62,46,46,.9)'); g.addColorStop(0.6, 'rgba(44,32,33,.55)'); g.addColorStop(1, 'rgba(30,22,24,0)');
      b.fillStyle = g; b.fillRect(0, 0, 96, 96);
    });
    out.smokeLit = layer(96, 96, (b) => {
      const g = b.createRadialGradient(48, 70, 2, 48, 60, 46);
      g.addColorStop(0, 'rgba(255,110,40,.55)'); g.addColorStop(1, 'rgba(255,80,30,0)');
      b.fillStyle = g; b.fillRect(0, 0, 96, 96);
    });
    out.plat = PLATFORMS.map((p, i) => layer(p.w + 24, p.h + 60, (b) => paintLedge(b, p, 900 + i * 17)));
    out.pillar = [0, 1].map(i => layer(44 + 16, 96 + 14, (b) => paintPillar(b, 44, 96, 50 + i * 13)));
    out.boulder = [0, 1].map(i => layer(46 + 12, 52 + 8, (b) => paintBoulder(b, 46, 52, 70 + i * 5)));
    out.rubble = layer(70, 30, paintRubble);
    out.fg = layer(W, H, paintForegroundRocks);
    return out;
  }

  function paintSky(b) {
    const r = rng(42);
    // sky: soot black above, smouldering red near the horizon
    let g = b.createLinearGradient(0, 0, 0, FLOOR);
    g.addColorStop(0, '#0a0507'); g.addColorStop(0.3, '#150809'); g.addColorStop(0.62, '#2a0f0d'); g.addColorStop(0.86, '#4a1810'); g.addColorStop(1, '#5a1e10');
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    // a few dim stars peeking through the ash
    for (let i = 0; i < 46; i++) {
      const x = r() * W, y = 8 + r() * 200, a = 0.12 + r() * 0.3;
      if (Math.abs(x - 480) < 150 && y > 40) continue; // hidden by the plume
      b.fillStyle = `rgba(255,${210 + r() * 40 | 0},${190 + r() * 40 | 0},${a})`;
      b.fillRect(x, y, r() < 0.15 ? 2 : 1.2, r() < 0.15 ? 2 : 1.2);
    }
    // blood moon behind the haze
    b.save();
    g = b.createRadialGradient(780, 118, 10, 780, 118, 70);
    g.addColorStop(0, 'rgba(255,140,90,.14)'); g.addColorStop(1, 'rgba(255,100,60,0)');
    b.fillStyle = g; b.fillRect(700, 40, 160, 160);
    b.fillStyle = 'rgba(190,80,55,.32)'; b.beginPath(); b.arc(780, 118, 22, 0, TAU); b.fill();
    b.fillStyle = 'rgba(120,40,35,.25)';
    for (const [dx, dy, rr] of [[-7, -5, 5], [6, 4, 4], [-2, 9, 3], [8, -8, 2.5]]) { b.beginPath(); b.arc(780 + dx, 118 + dy, rr, 0, TAU); b.fill(); }
    b.restore();
    // ash cloud banks, lit from below by the lava glow
    const puff = (x, y, rad, col) => {
      const pg = b.createRadialGradient(x, y, 0, x, y, rad);
      pg.addColorStop(0, col); pg.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
      b.fillStyle = pg; b.beginPath(); b.arc(x, y, rad, 0, TAU); b.fill();
    };
    for (let c = 0; c < 9; c++) {
      const cx = (c + 0.5) / 9 * W + (r() - 0.5) * 80, cy = 70 + r() * 110, cw = 120 + r() * 140;
      for (let i = 0; i < 14; i++) {
        const k = (r() - 0.5) * 2, x = cx + k * cw / 2, y = cy - (1 - k * k) * 14 + (r() - 0.5) * 10, rad = 18 + (1 - k * k) * 26 + r() * 10;
        puff(x, y + rad * 0.35, rad * 0.9, `rgba(130,44,24,${0.05 + r() * 0.06})`); // lit underside
        puff(x, y, rad, `rgba(30,15,16,${0.18 + r() * 0.16})`);
      }
    }
    // far mountain range (cool, hazy)
    b.fillStyle = '#2b1211';
    path(b, [[0, 372]]); for (let x = 0; x <= W; x += 30) b.lineTo(x, 340 + Math.sin(x * 0.011 + 1) * 26 + Math.sin(x * 0.037) * 8 + r() * 6);
    b.lineTo(W, FLOOR); b.lineTo(0, FLOOR); b.closePath(); b.fill();
    // distant lava glow pooled at the horizon
    for (const [x, w] of [[150, 160], [820, 180], [610, 90]]) {
      g = b.createRadialGradient(x, 410, 2, x, 410, w);
      g.addColorStop(0, 'rgba(255,90,30,.28)'); g.addColorStop(1, 'rgba(255,60,20,0)');
      b.fillStyle = g; b.fillRect(x - w, 340, w * 2, 140);
    }
    // middle ridge
    b.fillStyle = '#1e0d0d';
    path(b, [[0, 396]]); for (let x = 0; x <= W; x += 22) b.lineTo(x, 378 + Math.sin(x * 0.02 + 3) * 16 + r() * 8);
    b.lineTo(W, FLOOR); b.lineTo(0, FLOOR); b.closePath(); b.fill();
    b.strokeStyle = 'rgba(255,110,60,.12)'; b.lineWidth = 1.2;
    path(b, [[0, 396]]); for (let x = 0; x <= W; x += 22) b.lineTo(x, 378 + Math.sin(x * 0.02 + 3) * 16 + 1); b.stroke();

    // ---- the volcano ----
    const pts = [...CONE.L.slice().reverse(), ...CONE.R];
    b.save();
    poly(b, [...pts, [W / 2 + 330, FLOOR + 2], [W / 2 - 330, FLOOR + 2]]);
    g = b.createLinearGradient(0, 140, 0, FLOOR);
    g.addColorStop(0, '#3a1813'); g.addColorStop(0.18, '#24100f'); g.addColorStop(1, '#130909');
    b.fillStyle = g; b.fill();
    b.clip();
    // light side facing the crater glow / shadow side
    g = b.createLinearGradient(330, 0, 640, 0);
    g.addColorStop(0, 'rgba(0,0,0,.28)'); g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(0.55, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
    b.fillStyle = g; b.fillRect(0, 130, W, FLOOR);
    // gullies running down the slope
    for (let i = 0; i < 90; i++) {
      const a = Math.PI / 2 + (r() - 0.5) * 1.6, d0 = 24 + r() * 230, len = 18 + r() * 60;
      const x0 = 480 + Math.cos(a) * d0, y0 = 142 + Math.sin(a) * d0;
      const dark = r() < 0.65;
      b.strokeStyle = dark ? `rgba(6,2,3,${0.12 + r() * 0.16})` : `rgba(140,70,52,${0.05 + r() * 0.07})`;
      b.lineWidth = 0.7 + r() * 1.2;
      path(b, jag(r, x0, y0, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len, 9, 3)); b.stroke();
    }
    // a few boulders and outcrops catching the crater light
    for (let i = 0; i < 18; i++) {
      const a = Math.PI / 2 + (r() - 0.5) * 1.5, d = 50 + r() * 250, x = 480 + Math.cos(a) * d, y = 142 + Math.sin(a) * d, s = 2 + r() * 3.5;
      b.fillStyle = 'rgba(14,6,6,.6)'; b.beginPath(); b.ellipse(x + 1.5, y + s * 0.5, s * 1.3, s * 0.45, 0, 0, TAU); b.fill(); // shadow
      b.fillStyle = '#2c1512'; b.beginPath(); b.ellipse(x, y, s * 1.2, s * 0.7, 0, 0, TAU); b.fill();
      b.strokeStyle = 'rgba(220,120,80,.3)'; b.lineWidth = 0.8; b.beginPath(); b.ellipse(x, y, s * 1.2, s * 0.7, 0, Math.PI * 1.15, Math.PI * 1.85); b.stroke();
    }
    // speckle of cinders
    for (let i = 0; i < 380; i++) {
      b.fillStyle = r() < 0.7 ? `rgba(0,0,0,${0.2 + r() * 0.3})` : `rgba(150,70,50,${0.15 + r() * 0.2})`;
      b.fillRect(200 + r() * 560, 150 + r() * 320, 1 + r() * 2, 1 + r() * 1.5);
    }
    // crusted channels of the lava rivers (bright flow is animated on top)
    b.lineCap = 'round'; b.lineJoin = 'round';
    for (const s of STREAMS) {
      b.strokeStyle = 'rgba(10,4,4,.8)'; b.lineWidth = 10; path(b, s); b.stroke();
      b.strokeStyle = 'rgba(140,40,18,.75)'; b.lineWidth = 6; path(b, s); b.stroke();
      // cooled tongue where the river ends
      const e = s[s.length - 1];
      b.fillStyle = 'rgba(60,20,14,.9)'; b.beginPath(); b.ellipse(e[0], e[1] + 4, 12, 5, 0, 0, TAU); b.fill();
    }
    b.restore();
    // rim light along both flanks near the top
    b.lineCap = 'round';
    for (const side of [CONE.L, CONE.R]) {
      for (let i = 0; i < side.length - 1; i++) {
        const a = 0.55 * (1 - i / 7);
        if (a <= 0) break;
        b.strokeStyle = `rgba(255,120,60,${a})`; b.lineWidth = 2;
        path(b, [side[i], side[i + 1]]); b.stroke();
      }
    }
    // crater lip
    b.fillStyle = '#2a1210';
    b.beginPath(); b.ellipse(480, 143, 54, 9, 0, 0, TAU); b.fill();
    b.strokeStyle = 'rgba(255,150,80,.55)'; b.lineWidth = 1.5;
    b.beginPath(); b.ellipse(480, 143, 54, 9, 0, Math.PI * 1.05, Math.PI * 1.95); b.stroke();

    // ---- near cliffs at both sides, with charred trees ----
    const cliff = (dir) => {
      const x0 = dir < 0 ? 0 : W, s = -dir;
      const top = jag(r, x0, 236, x0 + s * 64, 282, 10, 7)
        .concat(jag(r, x0 + s * 64, 282, x0 + s * 112, 358, 12, 8))
        .concat(jag(r, x0 + s * 112, 358, x0 + s * 158, FLOOR, 14, 8));
      b.save();
      poly(b, [[x0, 236], ...top, [x0, FLOOR]]);
      g = b.createLinearGradient(x0, 0, x0 + s * 160, 0);
      g.addColorStop(0, '#080404'); g.addColorStop(1, '#150a0a');
      b.fillStyle = g; b.fill();
      b.clip();
      for (let i = 0; i < 18; i++) { // strata
        const y = 250 + i * 13 + r() * 6;
        b.strokeStyle = `rgba(80,36,28,${0.12 + r() * 0.12})`; b.lineWidth = 1;
        path(b, jag(r, x0, y, x0 + s * 170, y + 10 + r() * 10, 16, 3)); b.stroke();
      }
      b.restore();
      b.strokeStyle = 'rgba(255,100,50,.28)'; b.lineWidth = 1.6; path(b, top); b.stroke();
      // dead trees on the ledge
      const tree = (x, y, sc, lean) => {
        b.strokeStyle = '#070303'; b.lineCap = 'round';
        b.lineWidth = 3 * sc; path(b, [[x, y], [x + lean * 4 * sc, y - 18 * sc], [x + lean * 2 * sc, y - 34 * sc]]); b.stroke();
        b.lineWidth = 1.6 * sc;
        path(b, [[x + lean * 3 * sc, y - 14 * sc], [x + lean * 14 * sc, y - 24 * sc], [x + lean * 18 * sc, y - 22 * sc]]); b.stroke();
        path(b, [[x + lean * 3 * sc, y - 24 * sc], [x - lean * 8 * sc, y - 33 * sc]]); b.stroke();
        path(b, [[x + lean * 2 * sc, y - 34 * sc], [x + lean * 7 * sc, y - 42 * sc]]); b.stroke();
      };
      tree(x0 + s * 26, 246, 1, s); tree(x0 + s * 86, 300, 0.75, -s);
    };
    cliff(-1); cliff(1);
  }

  // basalt plates (cooling polygons) on the ground strip; y is relative to FLOOR - 2
  const ROWS = (() => {
    const r = rng(77), ys = [4, 14, 28, 46, 70], rows = [];
    for (let j = 0; j < ys.length; j++) {
      const row = [], step = 30 + j * 10;
      for (let x = -20; x <= W + 40; x += step) row.push([x + (j && x > -20 ? (r() - 0.5) * step * 0.5 : 0), ys[j] + (j ? (r() - 0.5) * 4 : 0)]);
      rows.push(row);
    }
    return rows;
  })();
  function plates(cb) {
    const r = rng(91);
    for (let j = 0; j < ROWS.length - 1; j++) {
      const A = ROWS[j], B = ROWS[j + 1];
      let ia = 0, ib = 0;
      while (ia < A.length - 1 && ib < B.length - 1) {
        // walk both rows, closing a plate whenever one row steps
        const a0 = A[ia], b0 = B[ib];
        let quad;
        if (A[ia + 1][0] < B[ib + 1][0]) { quad = [a0, A[ia + 1], b0]; ia++; if (r() < 0.6 && ia < A.length - 1) { quad = [a0, A[ia], A[ia + 1], B[ib + 1], b0]; ia++; ib++; } }
        else { quad = [a0, B[ib + 1], b0]; ib++; quad = [a0, A[ia + 1], B[ib], b0]; ia++; }
        cb(quad, j, r);
      }
    }
  }
  function paintFloor(b) {
    b.translate(0, 2);
    let g = b.createLinearGradient(0, 0, 0, H - FLOOR);
    g.addColorStop(0, '#2c1b17'); g.addColorStop(1, '#0f0808');
    b.fillStyle = g; b.fillRect(0, -2, W, H - FLOOR + 6);
    plates((q, j, r) => {
      const v = 30 + r() * 18 - j * 4;
      b.fillStyle = `rgb(${v + 14 | 0},${v * 0.62 | 0},${v * 0.52 | 0})`;
      poly(b, q); b.fill();
      // top-lit bevel on each plate
      b.strokeStyle = `rgba(150,90,70,${0.18 - j * 0.03})`; b.lineWidth = 1;
      path(b, [q[0], q[1]]); b.stroke();
      // grit
      for (let i = 0; i < 6; i++) {
        const k = r(), m = r(), p = q[0], s = q[1], u = q[q.length - 1];
        b.fillStyle = r() < 0.5 ? 'rgba(0,0,0,.35)' : 'rgba(170,110,90,.18)';
        b.fillRect(p[0] + (s[0] - p[0]) * k + (u[0] - p[0]) * m * 0.6, p[1] + (u[1] - p[1]) * m * 0.8 + 1, 1.5, 1.2);
      }
    });
    // dark seams between plates
    b.strokeStyle = '#0a0505'; b.lineWidth = 2.2; b.lineJoin = 'round';
    plates((q) => { poly(b, q); b.stroke(); });
    // depth: darken toward the bottom edge
    g = b.createLinearGradient(0, 20, 0, H - FLOOR);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)');
    b.fillStyle = g; b.fillRect(0, 0, W, H - FLOOR + 6);
    // the lip fighters stand on
    b.fillStyle = '#100808'; b.fillRect(0, -2, W, 4);
    b.strokeStyle = '#8a5640'; b.lineWidth = 2;
    const r = rng(5);
    path(b, [[0, -1]]); for (let x = 0; x <= W; x += 16) b.lineTo(x, -1 + (r() - 0.5) * 1.2); b.stroke();
    b.strokeStyle = 'rgba(255,170,120,.18)'; b.lineWidth = 1;
    path(b, [[0, -2]]); for (let x = 0; x <= W; x += 16) b.lineTo(x, -2); b.stroke();
    // pebbles sitting on the lip
    for (let i = 0; i < 40; i++) {
      const x = r() * W, s = 1.5 + r() * 2.5;
      b.fillStyle = '#3d2620'; b.beginPath(); b.ellipse(x, -1 - s * 0.4, s, s * 0.6, 0, 0, TAU); b.fill();
      b.fillStyle = 'rgba(200,140,110,.25)'; b.fillRect(x - s * 0.5, -1 - s * 0.9, s * 0.6, 0.8);
    }
    // vent pits cut into the crust
    for (const v of VENTS) {
      const x0 = v.x - VENT_W / 2;
      b.fillStyle = '#050202';
      poly(b, [[x0 - 8, -2], [x0 + 10, 22], [x0 + VENT_W - 10, 22], [x0 + VENT_W + 8, -2]]); b.fill();
      // scorched ring
      g = b.createRadialGradient(v.x, 0, VENT_W * 0.4, v.x, 0, VENT_W);
      g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      b.fillStyle = g; b.fillRect(v.x - VENT_W, 0, VENT_W * 2, H - FLOOR);
      // rim stones
      for (let i = 0; i < 9; i++) {
        const side = i % 2 ? 1 : -1, k = (i >> 1) / 4;
        const rx = v.x + side * (VENT_W / 2 + 4 - k * 10), ry = -1 + k * 22, s = 4 + r() * 3;
        b.fillStyle = '#2e1a15'; b.beginPath(); b.ellipse(rx, ry, s, s * 0.7, r(), 0, TAU); b.fill();
        b.strokeStyle = 'rgba(255,120,60,.35)'; b.lineWidth = 1; b.beginPath(); b.ellipse(rx, ry, s, s * 0.7, 0, Math.PI * 1.1, Math.PI * 1.9); b.stroke();
      }
    }
  }
  // glowing seams, split into 3 groups that pulse out of phase
  function paintSeams(b, k) {
    b.translate(0, 2);
    b.lineJoin = 'round'; b.lineCap = 'round';
    plates((q, j, r) => {
      if (Math.floor(r() * 3) !== k || r() < 0.35) return;
      const e = (r() * q.length) | 0, p = q[e], s = q[(e + 1) % q.length];
      b.shadowColor = 'rgba(255,90,20,.9)'; b.shadowBlur = 6;
      b.strokeStyle = `rgba(255,${110 + j * 18},40,${0.75 - j * 0.12})`; b.lineWidth = 1.6;
      path(b, [p, s]); b.stroke();
      b.shadowBlur = 0;
      b.strokeStyle = 'rgba(255,220,150,.55)'; b.lineWidth = 0.6; path(b, [p, s]); b.stroke();
    });
  }

  function paintLedge(b, p, seed) {
    const r = rng(seed), w = p.w, h = p.h, ox = 12, oy = 6;
    b.translate(ox, oy);
    // silhouette: flat top, layered body, hanging rock teeth
    const under = [[w, 0], [w + 4, h * 0.4], [w - 6, h]];
    const teeth = 5 + ((r() * 3) | 0);
    for (let i = 0; i <= teeth; i++) {
      const x = w - 10 - (w - 20) * (i / teeth);
      const d = h + 6 + r() * (i % 2 ? 10 : 30) * Math.sin(Math.PI * (i / teeth)) + 6;
      under.push([x + (r() - 0.5) * 8, d]);
    }
    under.push([6, h]); under.push([-4, h * 0.4]); under.push([0, 0]);
    let g = b.createLinearGradient(0, 0, 0, h + 44);
    g.addColorStop(0, '#5a3628'); g.addColorStop(0.15, '#3a2219'); g.addColorStop(0.6, '#24130f'); g.addColorStop(1, '#3a120a');
    poly(b, under); b.fillStyle = g; b.fill();
    b.save(); poly(b, under); b.clip();
    // strata
    for (let i = 0; i < 4; i++) {
      const y = 6 + i * 7 + r() * 3;
      b.strokeStyle = i % 2 ? 'rgba(10,4,4,.45)' : 'rgba(140,80,60,.18)'; b.lineWidth = 1;
      path(b, jag(r, -4, y, w + 4, y + (r() - 0.5) * 4, 12, 2.5)); b.stroke();
    }
    // lava-lit underside
    g = b.createLinearGradient(0, h, 0, h + 44);
    g.addColorStop(0, 'rgba(255,80,30,0)'); g.addColorStop(1, 'rgba(255,90,30,.35)');
    b.fillStyle = g; b.fillRect(-10, h, w + 20, 50);
    for (let i = 0; i < 60; i++) { b.fillStyle = r() < 0.6 ? 'rgba(0,0,0,.3)' : 'rgba(180,110,80,.15)'; b.fillRect(r() * w, 2 + r() * (h + 20), 1.5, 1.2); }
    b.restore();
    poly(b, under); b.strokeStyle = 'rgba(10,4,4,.8)'; b.lineWidth = 1.5; b.stroke();
    // walkable top: bright worn edge with a few pebbles
    b.fillStyle = '#6e4636'; b.fillRect(0, -1, w, 3);
    b.strokeStyle = 'rgba(255,190,140,.35)'; b.lineWidth = 1; path(b, [[1, -1], [w - 1, -1]]); b.stroke();
    for (let i = 0; i < 7; i++) {
      const x = 8 + r() * (w - 16), s = 1.5 + r() * 2;
      b.fillStyle = '#4a2d22'; b.beginPath(); b.ellipse(x, -1 - s * 0.3, s, s * 0.55, 0, 0, TAU); b.fill();
    }
    // one cooled crack running into the rock
    b.strokeStyle = 'rgba(255,120,50,.4)'; b.lineWidth = 1.2;
    path(b, jag(r, w * 0.32, 2, w * 0.44, h + 8, 6, 5)); b.stroke();
  }

  function paintPillar(b, w, h, seed) {
    const r = rng(seed), ox = 8, oy = 6, cols = 3, cw = w / cols;
    b.translate(ox, oy);
    for (let i = 0; i < cols; i++) {
      const x = i * cw;
      // each column is a hexagonal prism: lit left face, shaded right face
      let g = b.createLinearGradient(x, 0, x + cw, 0);
      g.addColorStop(0, '#4a3029'); g.addColorStop(0.45, '#2c1b18'); g.addColorStop(0.5, '#1e1112'); g.addColorStop(1, '#120a0b');
      b.fillStyle = g; b.fillRect(x, 0, cw, h);
      b.strokeStyle = '#0a0506'; b.lineWidth = 1.2; b.strokeRect(x + 0.5, 0, cw - 1, h);
      // hex cap
      b.fillStyle = '#5c3b30';
      poly(b, [[x, 0], [x + cw * 0.25, -3], [x + cw * 0.75, -3], [x + cw, 0], [x + cw * 0.75, 3], [x + cw * 0.25, 3]]); b.fill();
      b.strokeStyle = 'rgba(255,180,130,.3)'; b.lineWidth = 0.8; path(b, [[x + 1, 0], [x + cw * 0.25, -3], [x + cw * 0.75, -3]]); b.stroke();
      // cooling joints: short stepped cracks, offset per column
      for (let y = 18 + i * 7 + r() * 6; y < h - 8; y += 20 + r() * 10) {
        b.strokeStyle = 'rgba(6,2,3,.85)'; b.lineWidth = 1.3;
        path(b, [[x + 1, y], [x + cw * 0.5, y + (r() - 0.5) * 3], [x + cw - 1, y + (r() - 0.5) * 3]]); b.stroke();
        b.strokeStyle = 'rgba(160,100,80,.18)'; b.lineWidth = 0.8;
        path(b, [[x + 1, y + 1.5], [x + cw * 0.5, y + 1.5]]); b.stroke();
      }
      for (let k = 0; k < 18; k++) { b.fillStyle = r() < 0.6 ? 'rgba(0,0,0,.35)' : 'rgba(170,110,90,.14)'; b.fillRect(x + r() * cw, r() * h, 1.2, 1.2); }
    }
    // soot rising from the base
    const g = b.createLinearGradient(0, h - 30, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.5)');
    b.fillStyle = g; b.fillRect(0, h - 30, w, 30);
    // scree at the foot
    for (let i = 0; i < 7; i++) {
      const x = (i < 4 ? -6 + r() * 10 : w - 4 + r() * 10), s = 2 + r() * 3;
      b.fillStyle = '#2b1915'; b.beginPath(); b.ellipse(x, h - s * 0.5, s, s * 0.7, r(), 0, TAU); b.fill();
    }
  }

  // lumpy boulder outline (shared by sprite and dynamic crack clip)
  function boulderShape(w, h) {
    const r = rng(17), pts = [];
    for (let i = 0; i <= 16; i++) {
      const a = Math.PI + (i / 16) * Math.PI;
      const rr = 1 + (r() - 0.5) * 0.12;
      pts.push([w / 2 + Math.cos(a) * (w / 2 + 2) * rr, h + Math.sin(a) * h * rr * (i > 2 && i < 14 ? 1 : 0.85)]);
    }
    return pts;
  }
  const BSHAPE = boulderShape(46, 52);
  function paintBoulder(b, w, h, seed) {
    const r = rng(seed);
    b.translate(6, 4);
    let g = b.createRadialGradient(w * 0.35, h * 0.3, 3, w * 0.5, h * 0.6, w * 0.8);
    g.addColorStop(0, '#5a3a30'); g.addColorStop(0.5, '#2e1c18'); g.addColorStop(1, '#140a0a');
    poly(b, BSHAPE); b.fillStyle = g; b.fill();
    b.save(); poly(b, BSHAPE); b.clip();
    // pahoehoe ropes: curved wrinkles in the crust
    for (let i = 0; i < 7; i++) {
      const y = 8 + i * 6.5;
      b.strokeStyle = i % 2 ? 'rgba(10,4,4,.5)' : 'rgba(150,95,75,.2)'; b.lineWidth = 1;
      b.beginPath(); b.moveTo(-2, y + 4); b.quadraticCurveTo(w / 2, y - 6 + r() * 4, w + 2, y + 4); b.stroke();
    }
    for (let i = 0; i < 40; i++) { b.fillStyle = r() < 0.6 ? 'rgba(0,0,0,.35)' : 'rgba(180,120,95,.16)'; b.fillRect(r() * w, r() * h, 1.3, 1.3); }
    g = b.createLinearGradient(0, h * 0.6, 0, h);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.45)');
    b.fillStyle = g; b.fillRect(0, 0, w, h);
    b.restore();
    poly(b, BSHAPE); b.strokeStyle = '#0a0505'; b.lineWidth = 1.5; b.stroke();
    b.strokeStyle = 'rgba(255,170,120,.28)'; b.lineWidth = 1;
    b.beginPath(); BSHAPE.slice(3, 9).forEach((p, i) => (i ? b.lineTo(p[0], p[1]) : b.moveTo(p[0], p[1]))); b.stroke();
  }
  function paintRubble(b) {
    const r = rng(23);
    for (let i = 0; i < 11; i++) {
      const x = 8 + r() * 54, s = 3 + r() * 7, y = 29 - s * 0.6 - (Math.abs(x - 35) < 14 ? r() * 4 : 0);
      b.fillStyle = `rgb(${40 + r() * 20 | 0},${24 + r() * 10 | 0},${20 + r() * 8 | 0})`;
      poly(b, [[x - s, y + s * 0.5], [x - s * 0.6, y - s * 0.6], [x + s * 0.5, y - s * 0.7], [x + s, y + s * 0.5]]); b.fill();
      b.strokeStyle = 'rgba(200,140,110,.25)'; b.lineWidth = 0.8; path(b, [[x - s * 0.6, y - s * 0.6], [x + s * 0.5, y - s * 0.7]]); b.stroke();
    }
  }
  function paintForegroundRocks(b) {
    const r = rng(611);
    // dark crags in the bottom corners, below the fighters' feet
    for (const dir of [-1, 1]) {
      const x0 = dir < 0 ? 0 : W, s = -dir;
      const top = jag(r, x0, 488, x0 + s * 70, 512, 10, 6).concat(jag(r, x0 + s * 70, 512, x0 + s * 120, H, 10, 6));
      poly(b, [[x0, 488], ...top, [x0, H]]);
      b.fillStyle = '#050202'; b.fill();
      b.strokeStyle = 'rgba(255,110,60,.25)'; b.lineWidth = 1.2; path(b, top); b.stroke();
    }
  }

  // ---------- animated pieces ----------
  function ventState(v) {
    if (v.group !== S.group) return { warn: 0, active: 0, h: 0 };
    if (S.phase === 'warn') return { warn: S.phaseT / WARN, active: 0, h: 0 };
    if (S.phase === 'burst') {
      const rise = Math.min(1, S.phaseT / RISE), fall = Math.min(1, (ACTIVE - S.phaseT) / 0.2);
      return { warn: 1, active: 1, h: Math.max(0, Math.min(rise, fall)) };
    }
    return { warn: 0, active: 0, h: 0 };
  }
  // 1 right after a vent stops erupting, fading to 0 over ~1.6 s (visual only)
  function afterglow(v) {
    if (v.group !== S.group || S.phase !== 'idle' || S.cycle < 0) return 0;
    return clamp01(1 - (S.local - WARN - ACTIVE) / 1.6);
  }

  function drawVolcanoLife(ctx, t) {
    // crater: breathing glow, a churning lava surface and spatter
    const breath = 0.5 + 0.5 * Math.sin(t * 1.3) * Math.sin(t * 0.47 + 1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 + 0.25 * breath;
    ctx.drawImage(L.glow, 480 - 130, 143 - 110, 260, 200);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    const cg = ctx.createLinearGradient(0, 137, 0, 149);
    cg.addColorStop(0, '#ffd27a'); cg.addColorStop(0.5, '#ff7a24'); cg.addColorStop(1, '#a8240c');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.ellipse(480, 143, 46, 5.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(120,30,10,.6)';
    for (let i = 0; i < 4; i++) { const x = 446 + ((t * 9 + i * 19) % 68); ctx.beginPath(); ctx.ellipse(x, 143 + Math.sin(i + t) * 1.5, 6, 1.4, 0, 0, TAU); ctx.fill(); }
    for (let i = 0; i < 8; i++) { // spatter arcs, deterministic in t
      const per = 1.6 + hash(i) * 1.4, k = ((t + hash(i + 9) * per) % per) / per;
      if (k > 0.75) continue;
      const q = k / 0.75, vx = (hash(i + 3) - 0.5) * 70, vy = 60 + hash(i + 5) * 70;
      const x = 480 + (hash(i + 7) - 0.5) * 60 + vx * q, y = 141 - vy * q + 120 * q * q;
      ctx.fillStyle = `rgba(255,${180 - q * 90 | 0},70,${1 - q})`; ctx.fillRect(x - 1, y - 1, 2.2, 2.2);
    }
    // the lava rivers creep downhill: a bright core with travelling pulses
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let si = 0; si < STREAMS.length; si++) {
      const s = STREAMS[si];
      path(ctx, s); ctx.strokeStyle = `rgba(255,${90 + 30 * breath | 0},30,.75)`; ctx.lineWidth = 4; ctx.stroke();
      ctx.setLineDash([10, 22]); ctx.lineDashOffset = -t * (16 + si * 4);
      path(ctx, s); ctx.strokeStyle = 'rgba(255,210,120,.75)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.setLineDash([3, 41]); ctx.lineDashOffset = -t * (22 + si * 3) - 11;
      path(ctx, s); ctx.strokeStyle = 'rgba(255,245,200,.8)'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.setLineDash([]);
    }
    // smoke plume: puffs born at the crater, rising and drifting right, lit from beneath
    for (let i = 0; i < 9; i++) {
      const k = ((t * 0.055 + i / 9) % 1);
      const x = 480 + (hash(i) - 0.5) * 30 + k * k * 170 + Math.sin(t * 0.4 + i) * 8;
      const y = 138 - k * 120 + Math.sin(t * 0.7 + i * 2) * 3;
      const sz = 40 + k * 120;
      ctx.globalAlpha = (k < 0.1 ? k / 0.1 : 1) * (1 - k) * 0.85;
      ctx.drawImage(L.smoke, x - sz / 2, y - sz / 2, sz, sz);
      if (i % 2 || k < 0.4) {
        ctx.globalAlpha *= (1 - k) * (0.6 + 0.4 * breath);
        ctx.drawImage(L.smokeLit, x - sz / 2, y - sz / 2, sz, sz);
      }
    }
    ctx.globalAlpha = 1;
    // rare volcanic lightning inside the plume (dim, short)
    const slot = Math.floor(t / 4.3), lt = t - slot * 4.3;
    if (hash(slot * 3.1) < 0.45 && lt < 0.22) {
      const fl = lt < 0.06 || (lt > 0.11 && lt < 0.16) ? 1 : 0.35;
      const x0 = 450 + hash(slot) * 120, y0 = 70 + hash(slot + 1) * 20;
      ctx.strokeStyle = `rgba(255,220,255,${0.55 * fl})`; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x0, y0);
      let x = x0, y = y0;
      for (let i = 0; i < 5; i++) { x += (hash(slot * 7 + i) - 0.5) * 26; y += 8 + hash(slot * 5 + i) * 8; ctx.lineTo(x, y); }
      ctx.stroke();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.18 * fl; ctx.drawImage(L.glow, x0 - 60, y0 - 30, 120, 90);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
  }

  function drawFloorLife(ctx, t) {
    ctx.drawImage(L.floor, 0, FLOOR - 2);
    // seams breathe in three groups
    for (let k = 0; k < 3; k++) {
      ctx.globalAlpha = 0.45 + 0.35 * Math.sin(t * (0.9 + k * 0.23) + k * 2.1);
      ctx.drawImage(L.seams[k], 0, FLOOR - 2);
    }
    ctx.globalAlpha = 1;
    // fumaroles: thin steam wisps from a few cracks
    for (const [fx, ph] of [[318, 0], [640, 2.3], [42, 4.1], [918, 1.2], [528, 3.3]]) {
      for (let i = 0; i < 4; i++) {
        const k = ((t * 0.35 + ph + i / 4) % 1), x = fx + Math.sin(t * 1.3 + i + ph) * 4 + k * 10;
        ctx.globalAlpha = 0.12 * Math.sin(k * Math.PI);
        ctx.drawImage(L.smoke, x - 6 - k * 10, FLOOR - 6 - k * 50, 12 + k * 20, 12 + k * 20);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawLedge(ctx, p, i, t) {
    ctx.drawImage(L.plat[i], p.x - 12, p.y - 6);
    // molten drip forming on the lowest tooth and falling into the dark
    const per = 2.6 + i * 0.4, k = ((t + i * 0.9) % per) / per, dx = p.x + p.w * (0.42 + 0.16 * hash(i)), dy = p.y + p.h + 22;
    if (k < 0.7) {
      const s = 1 + 2 * (k / 0.7);
      ctx.fillStyle = `rgba(255,${140 + 60 * (k / 0.7) | 0},50,.9)`; ctx.beginPath(); ctx.ellipse(dx, dy + s * 0.6, s * 0.8, s, 0, 0, TAU); ctx.fill();
    } else {
      const q = (k - 0.7) / 0.3;
      ctx.fillStyle = `rgba(255,160,60,${1 - q})`; ctx.fillRect(dx - 1, dy + 3 + q * q * 90, 2, 4);
    }
  }

  function drawObstacles(ctx, t) {
    const list = arena.obstacles;
    for (let i = 0; i < list.length; i++) {
      const o = list[i];
      if (o.kind === 'pillar') {
        ctx.drawImage(L.pillar[i % 2], o.x - 8, o.y - 6);
        // rim light from the centre vent: stronger while it builds or erupts
        const v = VENTS[0], st = ventState(v), heat = Math.max(st.warn * 0.6, st.h, afterglow(v) * 0.6);
        const right = o.x + o.w / 2 < v.x, edge = right ? o.x + o.w : o.x, sw = 7 + heat * 6;
        const rg = ctx.createLinearGradient(edge, 0, edge + (right ? -sw : sw), 0);
        rg.addColorStop(0, `rgba(255,${110 + heat * 70 | 0},40,${0.22 + 0.08 * Math.sin(t * 1.5 + i) + heat * 0.45})`); rg.addColorStop(1, 'rgba(255,90,30,0)');
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = rg; ctx.fillRect(right ? edge - sw : edge, o.y, sw, o.h);
        ctx.globalCompositeOperation = 'source-over';
        for (let y = o.y + 26; y < o.y + o.h - 4; y += 24) {
          ctx.strokeStyle = `rgba(255,100,40,${0.12 + 0.12 * Math.sin(t * 1.1 + y * 0.1) + heat * 0.25})`; ctx.lineWidth = 1;
          path(ctx, [[o.x + 2, y], [o.x + o.w - 2, y + 2]]); ctx.stroke();
        }
      } else if (o.kind === 'boulder') {
        drawBoulder(ctx, o, i, t);
      }
    }
  }
  function drawBoulder(ctx, o, i, t) {
    const cx = o.x + o.w / 2, by = o.y + o.h;
    if (!(o.hp > 0)) {
      ctx.drawImage(L.rubble, cx - 35, by - 30);
      // the exposed core cools down but never quite goes out
      const pulse = 0.4 + 0.25 * Math.sin(t * 2 + i);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = pulse * 0.6; ctx.drawImage(L.glow, cx - 18, by - 16, 36, 20);
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      for (let k = 0; k < 4; k++) {
        const x = cx - 14 + k * 9 + hash(k + i) * 4;
        ctx.fillStyle = `rgba(255,${120 + 60 * hash(k) | 0},40,${0.4 + 0.3 * Math.sin(t * 3 + k)})`; ctx.fillRect(x, by - 4 - hash(k * 3) * 6, 2, 2);
      }
      return;
    }
    const dmg = 1 - clamp01(o.hp / BOULDER_HP);
    const hit = o._hitT > 0 ? clamp01(o._hitT / 0.15) : 0;
    const jx = hit ? Math.sin(t * 90) * 1.5 * hit : 0;
    ctx.drawImage(L.boulder[i % 2], o.x - 6 + jx, o.y - 4);
    // the molten core shows through cracks that grow with damage
    ctx.save();
    ctx.translate(o.x + jx, o.y);
    poly(ctx, BSHAPE); ctx.clip();
    const glowA = 0.25 + 0.65 * dmg + 0.1 * Math.sin(t * 4 + i);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const cracks = [
      [0, [[21, 2], [25, 14], [19, 26], [23, 38], [22, 52]]],
      [0.25, [[25, 14], [34, 20], [44, 24]]],
      [0.45, [[19, 26], [10, 31], [2, 36]]],
      [0.6, [[23, 38], [33, 42], [38, 52]]],
      [0.75, [[34, 20], [36, 9], [41, 6]]],
      [0.85, [[10, 31], [8, 18], [4, 12]]],
    ];
    for (const [need, pts] of cracks) {
      if (dmg < need) continue;
      const a = need === 0 ? glowA : glowA * clamp01((dmg - need) * 5);
      ctx.strokeStyle = `rgba(255,90,20,${a * 0.6})`; ctx.lineWidth = 4 + dmg * 2; path(ctx, pts); ctx.stroke();
      ctx.strokeStyle = `rgba(255,${170 + 60 * dmg | 0},80,${a})`; ctx.lineWidth = 1.4 + dmg * 1.2; path(ctx, pts); ctx.stroke();
    }
    if (hit) { ctx.fillStyle = `rgba(255,220,180,${0.35 * hit})`; ctx.fillRect(-4, -4, o.w + 8, o.h + 8); }
    ctx.restore();
  }

  function drawVent(ctx, v, t, vi) {
    const st = ventState(v), ag = afterglow(v), x0 = v.x - VENT_W / 2;
    const heat = Math.max(st.warn, ag);
    // light pooling on the ground around the vent
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.12 + 0.08 * Math.sin(t * 2 + vi) + heat * 0.45 + st.h * 0.4;
    ctx.drawImage(L.glow, v.x - VENT_W * 1.1, FLOOR - 50 - heat * 30, VENT_W * 2.2, 100 + heat * 40);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // molten pool: rises during the warning, churns, bubbles
    const level = 18 - heat * 12;
    const w0 = 12 - (18 - level) * 0.6;
    let g = ctx.createLinearGradient(0, FLOOR + level - 2, 0, FLOOR + 22);
    g.addColorStop(0, `rgb(255,${150 + heat * 80 | 0},${60 + heat * 60 | 0})`); g.addColorStop(0.4, '#ff5a1a'); g.addColorStop(1, '#7a1608');
    ctx.fillStyle = g;
    poly(ctx, [[x0 + w0 - 10, FLOOR + level], [x0 + 12, FLOOR + 22], [x0 + VENT_W - 12, FLOOR + 22], [x0 + VENT_W - w0 + 10, FLOOR + level]]);
    ctx.fill();
    // crust skins drifting on the surface
    ctx.fillStyle = `rgba(70,18,8,${0.65 - heat * 0.4})`;
    for (let i = 0; i < 3; i++) {
      const x = x0 + 18 + ((t * (6 + i * 3) + i * 23 + vi * 11) % (VENT_W - 36));
      ctx.beginPath(); ctx.ellipse(x, FLOOR + level + 3, 7 - i, 1.6, 0, 0, TAU); ctx.fill();
    }
    // bubbles that swell and pop (faster as pressure builds)
    const rate = 1 + heat * 3;
    for (let i = 0; i < 4; i++) {
      const per = 0.9 + hash(i + vi * 5) * 0.8, k = ((t * rate + hash(i * 2 + vi) * per) % per) / per;
      const bx = x0 + 22 + hash(i * 3 + vi * 7) * (VENT_W - 44), by = FLOOR + level + 2;
      if (k < 0.8) {
        const r = 1 + 4 * (k / 0.8) * (0.6 + heat * 0.6);
        ctx.fillStyle = 'rgba(255,200,110,.85)'; ctx.beginPath(); ctx.arc(bx, by - r * 0.5, r, Math.PI, 0); ctx.fill();
        ctx.fillStyle = 'rgba(255,245,210,.7)'; ctx.fillRect(bx - r * 0.4, by - r * 1.1, 1.2, 1.2);
      } else {
        const q = (k - 0.8) / 0.2;
        ctx.fillStyle = `rgba(255,190,90,${1 - q})`;
        for (let s = -1; s <= 1; s += 2) ctx.fillRect(bx + s * q * 7, by - 4 - q * 8 + q * q * 6, 1.6, 1.6);
      }
    }
    if (st.warn > 0 && !st.active) {
      const w = st.warn, e = ease(w);
      // the ground around the vent splits and glows
      ctx.lineCap = 'round';
      for (let k = 0; k < 4; k++) {
        const side = k % 2 ? 1 : -1, len = (16 + hash(k + vi * 9) * 22) * e, sx = v.x + side * (VENT_W / 2 - 2 - (k >> 1) * 8);
        const y0 = FLOOR + 4 + (k >> 1) * 10, pts = [[sx, y0]];
        for (let j = 1; j <= 4; j++) pts.push([sx + side * len * j / 4, y0 + j * 2.5 + (hash(k * 11 + j + vi) - 0.5) * 6]);
        ctx.strokeStyle = `rgba(255,70,20,${0.35 * w})`; ctx.lineWidth = 4; path(ctx, pts); ctx.stroke();
        ctx.strokeStyle = `rgba(255,${150 + 70 * w | 0},70,${0.35 + 0.45 * w})`; ctx.lineWidth = 1.3; path(ctx, pts); ctx.stroke();
      }
      // heat shimmer column outlining exactly where the lava will rise
      const a = 0.08 + 0.2 * e;
      g = ctx.createLinearGradient(0, FLOOR, 0, COL_TOP);
      g.addColorStop(0, `rgba(255,120,40,${a})`); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g; ctx.fillRect(x0, COL_TOP, VENT_W, FLOOR - COL_TOP);
      ctx.strokeStyle = `rgba(255,170,90,${0.1 + 0.25 * e})`; ctx.lineWidth = 1;
      ctx.setLineDash([6, 8]); ctx.lineDashOffset = -t * 40;
      path(ctx, [[x0 + 2, FLOOR], [x0 + 2, COL_TOP + 40]]); ctx.stroke();
      path(ctx, [[x0 + VENT_W - 2, FLOOR], [x0 + VENT_W - 2, COL_TOP + 40]]); ctx.stroke();
      ctx.setLineDash([]);
      for (let k = 0; k < 5; k++) { // wavering haze lines
        const y = FLOOR - 20 - ((t * 60 + k * 50) % (FLOOR - COL_TOP - 30));
        ctx.strokeStyle = `rgba(255,200,140,${0.08 * e})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x0 + 10, y);
        for (let x = 10; x <= VENT_W - 10; x += 8) ctx.lineTo(x0 + x, y + Math.sin(x * 0.2 + t * 8 + k) * 2);
        ctx.stroke();
      }
      // blinking warning chevrons, quickening as the burst nears
      const blink = Math.sin(S.phaseT * (10 + w * 14)) > 0;
      if (blink) {
        ctx.lineJoin = 'round';
        for (let i = 0; i < 2; i++) {
          const y = FLOOR - 28 - i * 16 - e * 6;
          poly(ctx, [[v.x - 16, y + 8], [v.x, y - 4], [v.x + 16, y + 8], [v.x + 16, y + 13], [v.x, y + 1], [v.x - 16, y + 13]]);
          ctx.fillStyle = '#ffcf4a'; ctx.strokeStyle = '#2a0c06'; ctx.lineWidth = 3;
          ctx.stroke(); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,220,.6)'; ctx.fillRect(v.x - 2, y - 2, 4, 2);
        }
      }
    }
    if (st.active && st.h > 0) drawColumn(ctx, v, t, st, vi);
    else if (ag > 0) {
      // the column collapses back: a heaving dome of lava slumping into the pit
      const d = ag * 26;
      g = ctx.createLinearGradient(0, FLOOR - d, 0, FLOOR + 6);
      g.addColorStop(0, `rgba(255,200,110,${ag})`); g.addColorStop(1, `rgba(255,80,20,${ag})`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(x0 + 6, FLOOR + 6); ctx.quadraticCurveTo(v.x, FLOOR - d * 2, x0 + VENT_W - 6, FLOOR + 6); ctx.fill();
    }
  }
  function drawColumn(ctx, v, t, st, vi) {
    const x0 = v.x - VENT_W / 2, top = FLOOR - (FLOOR - COL_TOP) * st.h;
    const wob = (y, k) => Math.sin(y * 0.05 + t * 18 + k) * 6 + Math.sin(y * 0.13 - t * 11) * 2;
    // outer heat bloom
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 * st.h;
    ctx.drawImage(L.glow, x0 - 60, top - 60, VENT_W + 120, FLOOR - top + 120);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // body
    let g = ctx.createLinearGradient(x0, 0, x0 + VENT_W, 0);
    g.addColorStop(0, '#9a1a08'); g.addColorStop(0.18, '#e2440f'); g.addColorStop(0.38, '#ff8a2a'); g.addColorStop(0.5, '#ffc24e');
    g.addColorStop(0.62, '#ff8a2a'); g.addColorStop(0.82, '#e2440f'); g.addColorStop(1, '#9a1a08');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0 + 2, FLOOR + 8);
    for (let y = FLOOR; y >= top; y -= 12) ctx.lineTo(x0 + 8 + wob(y, 0), y);
    ctx.bezierCurveTo(x0 + 6 + wob(top, 0), top - 30, x0 + VENT_W - 6 + wob(top, 1), top - 30, x0 + VENT_W - 8 + wob(top, 1), top);
    for (let y = top; y <= FLOOR; y += 12) ctx.lineTo(x0 + VENT_W - 8 + wob(y, 1), y);
    ctx.lineTo(x0 + VENT_W - 2, FLOOR + 8);
    ctx.closePath(); ctx.fill();
    // dark crust edges
    ctx.strokeStyle = 'rgba(90,14,4,.7)'; ctx.lineWidth = 2; ctx.stroke();
    // streaks rushing upward inside the column
    ctx.save(); ctx.clip();
    for (let k = 0; k < 9; k++) {
      const lx = x0 + 14 + hash(k + vi * 3) * (VENT_W - 28);
      const len = 30 + hash(k * 7) * 50, y = FLOOR - ((t * (520 + hash(k) * 200) + hash(k * 3) * 400) % (FLOOR - top + len));
      ctx.strokeStyle = k % 3 ? 'rgba(255,220,140,.55)' : 'rgba(150,30,8,.45)';
      ctx.lineWidth = k % 3 ? 2 : 4;
      ctx.beginPath(); ctx.moveTo(lx + wob(y, 2) * 0.5, y); ctx.lineTo(lx + wob(y + len, 2) * 0.5, y + len); ctx.stroke();
    }
    // white-hot core
    g = ctx.createLinearGradient(v.x - 10, 0, v.x + 10, 0);
    g.addColorStop(0, 'rgba(255,240,180,0)'); g.addColorStop(0.5, 'rgba(255,250,215,.8)'); g.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = g; ctx.fillRect(v.x - 10 + wob(top, 3) * 0.4, top + 6, 20, FLOOR - top);
    ctx.restore();
    // crown: blobs flung out at the top of the column
    for (let k = 0; k < 10; k++) {
      const per = 0.45 + hash(k + 1) * 0.2, q = ((t + hash(k) * per) % per) / per;
      const dir = k % 2 ? 1 : -1, sp = 30 + hash(k * 5) * 50;
      const bx = v.x + dir * (8 + q * sp), byy = top - 10 - q * 40 + q * q * 70;
      const r = (3.5 - q * 2) * st.h;
      if (r <= 0.3) continue;
      ctx.fillStyle = `rgba(255,${200 - q * 100 | 0},${80 - q * 40 | 0},${1 - q * 0.6})`;
      ctx.beginPath(); ctx.arc(bx, byy, r, 0, TAU); ctx.fill();
    }
    // base splash ring
    ctx.fillStyle = 'rgba(255,170,70,.9)';
    for (let k = 0; k < 6; k++) {
      const q = ((t * 3 + k / 6) % 1), dir = k % 2 ? 1 : -1;
      ctx.beginPath(); ctx.arc(v.x + dir * (VENT_W / 2 + q * 18), FLOOR - 4 - Math.sin(q * Math.PI) * 14, 2.5 * (1 - q) + 0.5, 0, TAU); ctx.fill();
    }
  }

  const arena = {
    id: 'arena02',
    name: 'Volcano',
    nameVi: 'Núi lửa',
    hint: 'Lava vents, pillars, boulders',
    hintVi: 'Lava phun, cột đá, tảng đá vỡ',
    floorY: FLOOR,
    gravityScale: 1,
    platforms: PLATFORMS,
    // basalt pillars flank the centre vent; breakable cooled-lava boulders guard the edge vents
    obstacles: [
      { x: 334, y: FLOOR - 96, w: 44, h: 96, kind: 'pillar' },
      { x: 582, y: FLOOR - 96, w: 44, h: 96, kind: 'pillar' },
      { x: 122, y: FLOOR - 52, w: 46, h: 52, kind: 'boulder', hp: BOULDER_HP },
      { x: 792, y: FLOOR - 52, w: 46, h: 52, kind: 'boulder', hp: BOULDER_HP },
    ],

    drawBackground(ctx, t) {
      try {
        if (!L) L = build();
        ctx.save();
        ctx.drawImage(L.sky, 0, 0);
        drawVolcanoLife(ctx, t);
        drawFloorLife(ctx, t);
        for (let i = 0; i < arena.platforms.length; i++) drawLedge(ctx, arena.platforms[i], i, t);
        drawObstacles(ctx, t);
        for (let i = 0; i < VENTS.length; i++) drawVent(ctx, VENTS[i], t, i); // lava covers ledges it reaches
        ctx.restore();
      } catch (e) { /* never break the frame */ }
    },

    drawForeground(ctx, t) {
      try {
        if (!L) L = build();
        ctx.save();
        // eruption light washing over the fighters
        let burst = 0;
        for (const v of VENTS) burst = Math.max(burst, ventState(v).h);
        if (burst > 0) {
          ctx.globalCompositeOperation = 'lighter';
          for (const v of VENTS) {
            const h = ventState(v).h;
            if (h <= 0) continue;
            ctx.globalAlpha = 0.16 * h;
            ctx.drawImage(L.glow, v.x - 190, COL_TOP - 40, 380, FLOOR - COL_TOP + 120);
          }
          ctx.globalCompositeOperation = 'source-over';
        }
        // embers: glowing motes rising and swaying
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 34; i++) {
          const sp = 22 + hash(i) * 46, span = H + 60;
          const y = H + 20 - ((t * sp + hash(i + 50) * span) % span);
          const x = (hash(i + 20) * W + Math.sin(t * (0.5 + hash(i + 3)) + i) * 26 + (H - y) * 0.08) % W;
          const s = 4 + hash(i + 7) * 7, fl = 0.5 + 0.5 * Math.sin(t * (4 + hash(i) * 5) + i);
          ctx.globalAlpha = (0.25 + 0.45 * fl) * clamp01((H - y) / 60) * clamp01(y / 90);
          ctx.drawImage(L.ember, x - s / 2, y - s / 2, s, s);
        }
        ctx.globalCompositeOperation = 'source-over';
        // ash flakes drifting down, slowly tumbling
        for (let i = 0; i < 26; i++) {
          const sp = 14 + hash(i + 90) * 20, span = H + 40;
          const y = ((t * sp + hash(i + 70) * span) % span) - 20;
          const x = (hash(i + 30) * W + t * 12 + Math.sin(t * 0.8 + i) * 18) % W;
          const a = t * (1 + hash(i)) + i, w = 2.6 * Math.abs(Math.cos(a)) + 0.6;
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = i % 4 ? '#8a7f7c' : '#5a4f4d';
          ctx.fillRect(x - w / 2, y, w, 1.6);
        }
        ctx.globalAlpha = 1;
        // heat haze at floor level, vignette and foreground crags
        const g = ctx.createLinearGradient(0, H - 90, 0, H);
        g.addColorStop(0, 'rgba(255,60,20,0)'); g.addColorStop(1, `rgba(255,70,20,${0.1 + 0.04 * Math.sin(t * 1.2)})`);
        ctx.fillStyle = g; ctx.fillRect(0, H - 90, W, 90);
        ctx.drawImage(L.fg, 0, 480, 130, 60, 0, 480, 130, 60);
        ctx.drawImage(L.fg, W - 130, 480, 130, 60, W - 130, 480, 130, 60);
        ctx.restore();
      } catch (e) { /* ignore */ }
    },

    update(dt, fighters, game) {
      try {
        S.cd[0] = Math.max(0, S.cd[0] - dt); S.cd[1] = Math.max(0, S.cd[1] - dt);
        S.clock += dt;
        const c = S.clock - FIRST;
        if (c < 0) { S.phase = 'idle'; return; }
        const n = Math.floor(c / PERIOD), local = c - n * PERIOD;
        S.local = local;
        if (n !== S.cycle) { S.cycle = n; S.group = n % 2; }
        const prev = S.phase;
        if (local < WARN) { S.phase = 'warn'; S.phaseT = local; }
        else if (local < WARN + ACTIVE) { S.phase = 'burst'; S.phaseT = local - WARN; }
        else { S.phase = 'idle'; S.phaseT = 0; }

        const vents = VENTS.filter(v => v.group === S.group);
        if (S.phase === 'warn' && Math.random() < 0.5 && game && game.particle) {
          for (const v of vents) game.particle({ x: v.x + (Math.random() - 0.5) * VENT_W * 0.7, y: FLOOR + 4, vx: (Math.random() - 0.5) * 40, vy: -120 - Math.random() * 160, life: 0.5, col: '#ff9a3a', r: 3 });
        }
        if (S.phase === 'burst' && prev !== 'burst' && game) {
          if (game.shake) game.shake(7);
          for (const v of vents) if (game.particle) for (let i = 0; i < 14; i++)
            game.particle({ x: v.x + (Math.random() - 0.5) * VENT_W, y: FLOOR - 10, vx: (Math.random() - 0.5) * 380, vy: -300 - Math.random() * 420, life: 0.9, col: i % 2 ? '#ffb347' : '#ff5a1f', r: 4 });
        }
        if (S.phase !== 'burst' || !fighters || !game) return;
        const st = ventState(vents[0]);
        if (st.h < 0.35) return;
        const top = FLOOR - (FLOOR - COL_TOP) * st.h;
        for (const f of fighters) {
          if (!f || f.ko) continue;
          const i = f.slot === 1 ? 1 : 0;
          if (S.cd[i] > 0) continue;
          for (const v of vents) {
            if (Math.abs(f.x - v.x) < VENT_W / 2 + 10 && f.y > top && f.y - 140 < FLOOR) {
              S.cd[i] = HIT_CD;
              if (game.fighting && game.hurt) {
                game.hurt(f, { dmg: DMG, kb: 240, fromX: v.x, stun: 0.35, heavy: true, word: 'BURN' });
                f.vy = -720;
              }
              break;
            }
          }
        }
      } catch (e) { /* ignore */ }
    },

    reset() {
      S.clock = 0; S.cycle = -1; S.group = 0; S.phase = 'idle'; S.phaseT = 0; S.local = 0; S.cd[0] = S.cd[1] = 0;
    },
  };

  (window.STICK_ARENAS = window.STICK_ARENAS || []).push(arena);
})();
