// Arena 09: Factory (Nhà máy)
// Two conveyor-belt platforms that carry fighters (direction flips every ~10 s,
// arrows blink before a flip), a hydraulic crusher over the centre of the floor
// that slams every ~11 s after a 1.4 s warning, breakable steel crates guarding
// the crusher zone and solid machine blocks against both walls.
// Everything visual is drawn from the simulation state (st, platforms,
// obstacles) or from t, never from Math.random, so online host and guest match.

(function () {
  const W = 960, H = 540;
  const FLOOR = 470;

  // Crusher geometry and timing
  const CR_X = 480, CR_HALF = 58;       // centre and half-width of the crusher head
  const CR_TOP = 150;                    // head bottom y while idle
  const CR_HIT_HALF = CR_HALF + 18;      // horizontal reach of the hit (fighter is ~40 wide)
  const T_IDLE = 9.6, T_WARN = 1.4, T_DROP = 0.12, T_HOLD = 0.55, T_RISE = 1.3;
  const CYCLE = T_IDLE + T_WARN + T_DROP + T_HOLD + T_RISE;
  const FIRST_DELAY = 5.5;               // idle time before the first slam of a round

  // Conveyor
  const BELT_SPEED = 70;                 // px/s
  const FLIP_EVERY = 10, FLIP_WARN = 1.2;

  const platforms = [
    { x: 105, y: 330, w: 230, h: 16 },
    { x: 625, y: 330, w: 230, h: 16 },
  ];

  // Solid terrain: steel crates (breakable) guard the crusher zone, and heavy
  // machine blocks sit against both walls. Mirror-symmetric around x = 480.
  const CRATE_HP = 40;
  const obstacles = [
    { x: 28, y: 395, w: 62, h: 75, kind: 'machine' },
    { x: 870, y: 395, w: 62, h: 75, kind: 'machine' },
    { x: 330, y: 414, w: 52, h: 56, kind: 'crate', hp: CRATE_HP },
    { x: 578, y: 414, w: 52, h: 56, kind: 'crate', hp: CRATE_HP },
  ];
  const OB_INIT = obstacles.map(o => ({ x: o.x, y: o.y, w: o.w, h: o.h, hp: o.hp }));

  const st = {
    crT: 0,            // time inside the crusher cycle (starts negative for the first delay)
    beltT: 0,          // time since last flip
    beltDir: 1,        // +1 = belts push toward the centre, -1 = toward the walls
    beltOffset: 0,     // animation offset of the belt treads
    gearA: 0,
    hitCd: [0, 0],
    slammed: false,
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // Crusher head bottom y at the current cycle time, plus phase
  function crusher() {
    let t = st.crT;
    if (t < 0) return { y: CR_TOP, phase: 'idle', k: 0 };
    if (t < T_IDLE) return { y: CR_TOP, phase: 'idle', k: t / T_IDLE };
    t -= T_IDLE;
    if (t < T_WARN) return { y: CR_TOP - 6 * Math.sin((t / T_WARN) * Math.PI / 2), phase: 'warn', k: t / T_WARN };
    t -= T_WARN;
    if (t < T_DROP) { const k = t / T_DROP; return { y: CR_TOP + (FLOOR - CR_TOP) * k * k, phase: 'drop', k }; }
    t -= T_DROP;
    if (t < T_HOLD) return { y: FLOOR, phase: 'hold', k: t / T_HOLD };
    t -= T_HOLD;
    const k = Math.min(1, t / T_RISE);
    const e = 1 - (1 - k) * (1 - k);
    return { y: FLOOR - (FLOOR - CR_TOP) * e, phase: 'rise', k };
  }

  // ---------- visual helpers ----------
  const TAU = Math.PI * 2;
  // deterministic hash in 0..1 (used instead of Math.random for decoration)
  function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  // seeded generator for the static layer
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arcTo(x + w, y, x + w, y + r, r);
    g.lineTo(x + w, y + h - r); g.arcTo(x + w, y + h, x + w - r, y + h, r);
    g.lineTo(x + r, y + h); g.arcTo(x, y + h, x, y + h - r, r);
    g.lineTo(x, y + r); g.arcTo(x, y, x + r, y, r); g.closePath();
  }
  function bolt(g, x, y, r) {
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.arc(x + 0.6, y + 0.8, r, 0, TAU); g.fill();
    g.fillStyle = '#4c535a'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.beginPath(); g.arc(x - r * 0.3, y - r * 0.35, r * 0.45, 0, TAU); g.fill();
  }
  // a beveled steel slab: base fill, light top/left edge, dark bottom/right edge
  function slab(g, x, y, w, h, col, hi, lo) {
    g.fillStyle = col; g.fillRect(x, y, w, h);
    g.fillStyle = hi; g.fillRect(x, y, w, 2); g.fillRect(x, y, 2, h);
    g.fillStyle = lo; g.fillRect(x, y + h - 2, w, 2); g.fillRect(x + w - 2, y, 2, h);
  }
  // hazard stripes clipped to a rectangle
  function stripes(g, x, y, w, h, a, b, step) {
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    g.fillStyle = a; g.fillRect(x, y, w, h);
    g.fillStyle = b;
    for (let sx = x - h - step; sx < x + w + h; sx += step) {
      g.beginPath(); g.moveTo(sx, y + h); g.lineTo(sx + h, y); g.lineTo(sx + h + step / 2, y); g.lineTo(sx + step / 2, y + h); g.fill();
    }
    g.restore();
  }
  // shaded cylinder (pipe) between two points
  function pipe(g, x1, y1, x2, y2, r, base) {
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const gr = g.createLinearGradient(x1 - nx * r, y1 - ny * r, x1 + nx * r, y1 + ny * r);
    gr.addColorStop(0, 'rgba(0,0,0,0.55)');
    gr.addColorStop(0.3, 'rgba(255,255,255,0.10)');
    gr.addColorStop(0.45, 'rgba(255,255,255,0.03)');
    gr.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.lineCap = 'butt';
    g.strokeStyle = base; g.lineWidth = r * 2;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
    g.strokeStyle = gr; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }
  function flange(g, x, y, r, vertical) {
    const w = vertical ? r * 2 + 8 : 8, h = vertical ? 8 : r * 2 + 8;
    slab(g, x - w / 2, y - h / 2, w, h, '#40464d', 'rgba(255,255,255,0.12)', 'rgba(0,0,0,0.5)');
    if (vertical) { bolt(g, x - r - 1, y, 1.6); bolt(g, x + r + 1, y, 1.6); }
    else { bolt(g, x, y - r - 1, 1.6); bolt(g, x, y + r + 1, 1.6); }
  }

  // ---------- sprites (rendered once) ----------
  let SPR = null;
  function gearSprite(r, teeth, body, seed) {
    const s = Math.ceil(r * 2 + 6), c = canvas(s, s), g = c.getContext('2d');
    g.translate(s / 2, s / 2);
    const n = teeth * 2;
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, rr = i % 2 ? r * 0.84 : r;
      const bev = (a1 - a0) * 0.18;
      g.lineTo(Math.cos(a0 + bev) * rr, Math.sin(a0 + bev) * rr);
      g.lineTo(Math.cos(a1 - bev) * rr, Math.sin(a1 - bev) * rr);
    }
    g.closePath();
    const gr = g.createLinearGradient(-r, -r, r, r);
    gr.addColorStop(0, body[0]); gr.addColorStop(1, body[1]);
    g.fillStyle = gr; g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1.2; g.stroke();
    // recessed web
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.beginPath(); g.arc(0, 0, r * 0.7, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(0, 0, r * 0.7, Math.PI * 1.05, Math.PI * 1.7); g.stroke();
    // lightening holes between spokes
    const spokes = r > 30 ? 5 : 4;
    g.fillStyle = '#101215';
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * TAU, half = Math.PI / spokes * 0.62;
      g.beginPath();
      g.arc(0, 0, r * 0.62, a - half, a + half);
      g.arc(0, 0, r * 0.34, a + half * 0.8, a - half * 0.8, true);
      g.closePath(); g.fill();
    }
    // hub
    const hub = g.createRadialGradient(-r * 0.08, -r * 0.08, 1, 0, 0, r * 0.3);
    hub.addColorStop(0, '#6a7178'); hub.addColorStop(1, '#2e3338');
    g.fillStyle = hub; g.beginPath(); g.arc(0, 0, r * 0.28, 0, TAU); g.fill();
    g.fillStyle = '#0d0f12'; g.beginPath(); g.arc(0, 0, r * 0.1, 0, TAU); g.fill();
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * TAU + 0.4;
      g.fillStyle = '#7b838a'; g.beginPath(); g.arc(Math.cos(a) * r * 0.19, Math.sin(a) * r * 0.19, Math.max(1, r * 0.035), 0, TAU); g.fill();
    }
    // a little wear: oily smudge
    const rnd = rng(seed);
    for (let i = 0; i < 3; i++) {
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.beginPath(); g.arc((rnd() - 0.5) * r, (rnd() - 0.5) * r, r * (0.1 + rnd() * 0.12), 0, TAU); g.fill();
    }
    return c;
  }
  function puffSprite() {
    const c = canvas(64, 64), g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    gr.addColorStop(0, 'rgba(205,212,220,0.9)');
    gr.addColorStop(0.5, 'rgba(190,198,208,0.35)');
    gr.addColorStop(1, 'rgba(180,190,200,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return c;
  }
  function coneSprite() {
    const w = 300, h = 250, c = canvas(w, h), g = c.getContext('2d');
    g.beginPath(); g.moveTo(w / 2 - 14, 0); g.lineTo(w / 2 + 14, 0); g.lineTo(w, h); g.lineTo(0, h); g.closePath();
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,196,120,0.20)');
    gr.addColorStop(0.45, 'rgba(255,186,110,0.07)');
    gr.addColorStop(1, 'rgba(255,180,100,0)');
    g.fillStyle = gr; g.fill();
    // soften the sides
    g.globalCompositeOperation = 'destination-out';
    const side = g.createLinearGradient(0, 0, w, 0);
    side.addColorStop(0, 'rgba(0,0,0,1)'); side.addColorStop(0.3, 'rgba(0,0,0,0)');
    side.addColorStop(0.7, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = side; g.fillRect(0, 0, w, h);
    return c;
  }
  function buildSprites() {
    SPR = {
      gearBig: gearSprite(48, 14, ['#3d434a', '#202429'], 3),
      gearSmall: gearSprite(26, 8, ['#4a4237', '#262019'], 5),
      roller: gearSprite(8, 6, ['#7a828a', '#3a4046'], 7),
      fan: (function () {
        const c = canvas(28, 28), g = c.getContext('2d');
        g.translate(14, 14); g.fillStyle = '#5a6168';
        for (let i = 0; i < 4; i++) {
          g.rotate(TAU / 4);
          g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(10, -3, 11, 4); g.lineTo(3, 3); g.closePath(); g.fill();
        }
        g.fillStyle = '#2a2e33'; g.beginPath(); g.arc(0, 0, 3, 0, TAU); g.fill();
        return c;
      })(),
      puff: puffSprite(),
      cone: coneSprite(),
    };
  }

  // ---------- static background (pre-rendered once) ----------
  const LAMPS = [212, 748];
  const WINDOWS = [{ x: 254, flip: false }, { x: 960 - 254 - 108, flip: true }];
  const WIN_Y = 112, WIN_W = 108, WIN_H = 132;
  let bg = null;

  function buildWindow(g, wx, rnd, broken) {
    const x = wx, y = WIN_Y, w = WIN_W, h = WIN_H;
    // outside: furnace-lit dusk
    const sky = g.createLinearGradient(0, y, 0, y + h);
    sky.addColorStop(0, '#1b1013'); sky.addColorStop(0.55, '#3b1d14'); sky.addColorStop(1, '#5c2c15');
    g.fillStyle = sky; g.fillRect(x, y, w, h);
    // distant smoke plumes
    for (let i = 0; i < 3; i++) {
      g.fillStyle = 'rgba(70,52,48,' + (0.25 + rnd() * 0.15).toFixed(2) + ')';
      g.beginPath(); g.ellipse(x + 20 + rnd() * 70, y + 20 + rnd() * 30, 18 + rnd() * 16, 8 + rnd() * 6, -0.3, 0, TAU); g.fill();
    }
    // skyline with smokestacks
    g.fillStyle = '#140c0c';
    let sx = x - 4;
    while (sx < x + w) {
      const bw = 10 + rnd() * 22, bh = 18 + rnd() * 34;
      g.fillRect(sx, y + h - bh, bw, bh);
      if (rnd() < 0.45) { const cw = 4 + rnd() * 3; g.fillRect(sx + bw * 0.4, y + h - bh - 26 - rnd() * 22, cw, 30); }
      // a few lit windows far away
      for (let k = 0; k < 3; k++) if (rnd() < 0.5) {
        g.fillStyle = 'rgba(255,150,70,' + (0.35 + rnd() * 0.3).toFixed(2) + ')';
        g.fillRect(sx + 2 + rnd() * (bw - 4), y + h - bh + 4 + rnd() * (bh - 8), 2, 2);
        g.fillStyle = '#140c0c';
      }
      sx += bw + 1;
    }
    // panes: grime gradient at the bottom of each pane
    const cols = 3, rows = 3, pw = w / cols, ph = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const px = x + c * pw, py = y + r * ph;
      const gr = g.createLinearGradient(0, py, 0, py + ph);
      gr.addColorStop(0, 'rgba(255,255,255,0.025)'); gr.addColorStop(0.6, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(25,18,12,0.45)');
      g.fillStyle = gr; g.fillRect(px, py, pw, ph);
      // glass glint
      g.strokeStyle = 'rgba(255,230,200,0.06)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(px + 5, py + ph - 8); g.lineTo(px + pw * 0.55, py + 5); g.stroke();
    }
    // a broken pane
    if (broken) {
      const px = x + (broken.flip ? 0 : 2) * pw, py = y;
      g.fillStyle = '#0d0809';
      g.beginPath(); g.moveTo(px + pw * 0.15, py); g.lineTo(px + pw, py); g.lineTo(px + pw, py + ph * 0.7); g.lineTo(px + pw * 0.55, py + ph * 0.45); g.lineTo(px + pw * 0.62, py + ph * 0.2); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(220,200,180,0.18)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(px + pw * 0.15, py); g.lineTo(px + pw * 0.62, py + ph * 0.2); g.lineTo(px + pw * 0.55, py + ph * 0.45); g.lineTo(px + pw, py + ph * 0.7);
      g.moveTo(px + pw * 0.55, py + ph * 0.45); g.lineTo(px + pw * 0.2, py + ph * 0.8); g.stroke();
    }
    // mullions and frame
    g.fillStyle = '#23272c';
    for (let c = 1; c < cols; c++) g.fillRect(x + c * pw - 2, y, 4, h);
    for (let r = 1; r < rows; r++) g.fillRect(x, y + r * ph - 2, w, 4);
    g.strokeStyle = '#2d3137'; g.lineWidth = 7; g.strokeRect(x - 3, y - 3, w + 6, h + 6);
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1;
    g.strokeRect(x - 6.5, y - 6.5, w + 13, h + 13);
    // sill with drip stain under it
    slab(g, x - 10, y + h + 3, w + 20, 7, '#33383e', 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.5)');
    const drip = g.createLinearGradient(0, y + h + 10, 0, y + h + 70);
    drip.addColorStop(0, 'rgba(0,0,0,0.25)'); drip.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = drip;
    for (let i = 0; i < 4; i++) g.fillRect(x + 8 + rnd() * (w - 16), y + h + 10, 3 + rnd() * 5, 30 + rnd() * 40);
  }

  function buildBg() {
    const c = canvas(W, H), g = c.getContext('2d');
    const rnd = rng(909);

    // ceiling and roof truss (mostly under the HUD)
    g.fillStyle = '#0c0d10'; g.fillRect(0, 0, W, 90);
    g.strokeStyle = '#1a1d22'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, 22); g.lineTo(W, 22); g.stroke();
    g.lineWidth = 3;
    for (let x = 0; x < W; x += 60) { g.beginPath(); g.moveTo(x, 22); g.lineTo(x + 30, 66); g.lineTo(x + 60, 22); g.stroke(); }
    // main I-beam
    slab(g, 0, 64, W, 18, '#22262b', 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.6)');
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 70, W, 2);
    for (let x = 30; x < W; x += 80) { bolt(g, x, 68, 1.6); bolt(g, x, 78, 1.6); }

    // back wall: riveted steel panels
    const PW = 120, PH = 64, top = 84;
    for (let y = top; y < FLOOR; y += PH) {
      for (let x = ((y - top) / PH) % 2 ? -60 : 0; x < W; x += PW) {
        const v = Math.round((rnd() - 0.5) * 6);
        const ph = Math.min(PH, FLOOR - y);
        slab(g, x, y, PW, ph, 'rgb(' + (27 + v) + ',' + (30 + v) + ',' + (35 + v) + ')', 'rgba(255,255,255,0.035)', 'rgba(0,0,0,0.35)');
        if (ph > 20) for (const [rx, ry] of [[x + 7, y + 7], [x + PW - 7, y + 7], [x + 7, y + ph - 7], [x + PW - 7, y + ph - 7]]) bolt(g, rx, ry, 1.7);
        // grime streak from a rivet
        if (rnd() < 0.45) {
          const sx = x + 7 + (rnd() < 0.5 ? 0 : PW - 14), gr = g.createLinearGradient(0, y + 8, 0, y + 8 + 40 + rnd() * 50);
          const rust = rnd() < 0.4;
          gr.addColorStop(0, rust ? 'rgba(110,58,28,0.22)' : 'rgba(0,0,0,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.fillRect(sx - 1.5, y + 8, 3 + rnd() * 2, 90);
        }
        // rust bloom
        if (rnd() < 0.18) {
          const rx = x + 20 + rnd() * (PW - 40), ry = y + 10 + rnd() * (ph - 20);
          const gr = g.createRadialGradient(rx, ry, 0, rx, ry, 10 + rnd() * 14);
          gr.addColorStop(0, 'rgba(120,62,30,0.16)'); gr.addColorStop(1, 'rgba(120,62,30,0)');
          g.fillStyle = gr; g.fillRect(rx - 26, ry - 26, 52, 52);
        }
      }
    }
    // wainscot: darker lower band with a worn safety stripe
    const wain = g.createLinearGradient(0, FLOOR - 70, 0, FLOOR);
    wain.addColorStop(0, 'rgba(0,0,0,0.18)'); wain.addColorStop(1, 'rgba(0,0,0,0.42)');
    g.fillStyle = wain; g.fillRect(0, FLOOR - 70, W, 70);
    stripes(g, 0, FLOOR - 74, W, 5, 'rgba(92,76,28,0.55)', 'rgba(16,16,16,0.7)', 14);

    // stencilled bay number, low contrast
    g.save();
    g.font = 'bold 54px Impact, "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(200,190,160,0.045)';
    g.fillText('BAY 09', 220, 205);
    g.fillText('BAY 09', 740, 205);
    g.restore();

    // windows
    WINDOWS.forEach(wn => buildWindow(g, wn.x, rng(wn.flip ? 77 : 41), wn.flip ? null : { flip: false }));

    // gearbox mounting plates
    for (const side of [0, 1]) {
      const px = side ? W - 98 - 156 : 98;
      g.save();
      rrect(g, px, 140, 156, 132, 10);
      g.fillStyle = '#17191d'; g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 2; g.stroke();
      g.restore();
      for (const [bx, by] of [[px + 10, 150], [px + 146, 150], [px + 10, 262], [px + 146, 262]]) bolt(g, bx, by, 2.4);
    }

    // pipes: big header along the ceiling, risers down both walls
    pipe(g, 0, 98, W, 98, 9, '#2c3934');
    pipe(g, 0, 112, W, 112, 4, '#3a3029');
    for (const x of [140, 360, 600, 820]) flange(g, x, 98, 9, false);
    for (const side of [0, 1]) {
      const m = x => side ? W - x : x;
      pipe(g, m(46), 98, m(46), FLOOR, 8, '#3a302a');
      flange(g, m(46), 160, 8, true); flange(g, m(46), 372, 8, true);
      pipe(g, m(74), 112, m(74), 395, 4, '#2c3934');
      // conduit from the electrical box up to the header
      pipe(g, m(372), 112, m(372), 262, 2.5, '#2a2e33');
      // pipe label with flow arrow
      slab(g, m(46) - 6, 196, 12, 26, '#6b5a22', 'rgba(255,255,255,0.15)', 'rgba(0,0,0,0.4)');
      g.fillStyle = '#16140f';
      g.beginPath(); g.moveTo(m(46), 216); g.lineTo(m(46) - 4, 208); g.lineTo(m(46) + 4, 208); g.closePath(); g.fill();
    }

    // electrical boxes beside the press
    for (const side of [0, 1]) {
      const bx = side ? W - 342 - 40 : 342;
      slab(g, bx, 262, 40, 50, '#2f3439', 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.55)');
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(bx + 4, 266, 32, 42);
      // high-voltage sticker
      g.fillStyle = '#8c7426';
      g.beginPath(); g.moveTo(bx + 20, 272); g.lineTo(bx + 30, 290); g.lineTo(bx + 10, 290); g.closePath(); g.fill();
      g.strokeStyle = '#141414'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(bx + 21, 277); g.lineTo(bx + 18, 283); g.lineTo(bx + 22, 283); g.lineTo(bx + 19, 288); g.stroke();
      g.fillStyle = '#4b5158'; g.fillRect(side ? bx + 4 : bx + 32, 280, 4, 12); // handle
      bolt(g, bx + 5, 300, 1.4); bolt(g, bx + 35, 300, 1.4);
    }

    // crusher frame: I-beam rails with bolts and hazard bands
    const railL = CR_X - CR_HALF - 26, railR = CR_X + CR_HALF + 12;
    // recess behind the press
    const rec = g.createLinearGradient(railL + 14, 0, railR, 0);
    rec.addColorStop(0, 'rgba(0,0,0,0.45)'); rec.addColorStop(0.2, 'rgba(0,0,0,0.2)');
    rec.addColorStop(0.8, 'rgba(0,0,0,0.2)'); rec.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = rec; g.fillRect(railL + 14, 120, railR - railL - 14, FLOOR - 120);
    g.save();
    g.font = 'bold 15px Impact, "Arial Black", sans-serif'; g.textAlign = 'center';
    g.fillStyle = 'rgba(170,120,90,0.07)';
    g.fillText('CRUSH ZONE', CR_X, 300); g.fillText('KEEP CLEAR', CR_X, 320);
    g.restore();
    for (const rx of [railL, railR]) {
      slab(g, rx - 3, 84, 20, FLOOR - 84, '#24282d', 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.6)');
      slab(g, rx + 3, 84, 8, FLOOR - 84, '#2f343a', 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.4)');
      for (let y = 140; y < FLOOR - 20; y += 44) { bolt(g, rx, y, 1.5); bolt(g, rx + 14, y, 1.5); }
      stripes(g, rx - 3, FLOOR - 70, 20, 66, '#6e5a1f', '#141414', 12);
      // grease along the guide face
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(rx === railL ? rx + 14 : rx - 3, 130, 3, FLOOR - 140);
    }
    // danger signs on the rails
    for (const sx of [railL + 7, railR + 7]) {
      g.fillStyle = '#8f7a2c';
      g.beginPath(); g.moveTo(sx, 196); g.lineTo(sx + 13, 220); g.lineTo(sx - 13, 220); g.closePath(); g.fill();
      g.strokeStyle = '#181614'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#181614'; g.fillRect(sx - 1.5, 203, 3, 9); g.fillRect(sx - 1.5, 214, 3, 3);
    }
    // press housing
    slab(g, CR_X - 92, 80, 184, 42, '#2d3238', 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.6)');
    slab(g, CR_X - 80, 86, 54, 30, '#262a2f', 'rgba(255,255,255,0.06)', 'rgba(0,0,0,0.5)');
    slab(g, CR_X + 26, 86, 54, 30, '#262a2f', 'rgba(255,255,255,0.06)', 'rgba(0,0,0,0.5)');
    for (let i = 0; i < 4; i++) { g.fillStyle = '#16181b'; g.fillRect(CR_X + 32, 90 + i * 6, 42, 3); } // vent slots
    g.save();
    g.font = 'bold 15px Impact, "Arial Black", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(200,180,120,0.55)'; g.fillText('20 T', CR_X - 53, 102);
    g.restore();
    g.fillStyle = '#1a1d21'; g.fillRect(CR_X - 92, 118, 184, 6);
    for (let x = CR_X - 84; x <= CR_X + 84; x += 24) bolt(g, x, 83 + 1, 1.5);
    // cylinder glands where the rods come out
    for (const gx of [CR_X - 20, CR_X + 20]) slab(g, gx - 11, 118, 22, 8, '#3d434a', 'rgba(255,255,255,0.15)', 'rgba(0,0,0,0.5)');

    // ---- floor: steel deck plate ----
    const fl = g.createLinearGradient(0, FLOOR, 0, H);
    fl.addColorStop(0, '#2b2e33'); fl.addColorStop(1, '#16171a');
    g.fillStyle = fl; g.fillRect(0, FLOOR, W, H - FLOOR);
    // tread pattern
    for (let y = FLOOR + 10, row = 0; y < H; y += 11, row++) {
      for (let x = (row % 2) * 9; x < W; x += 18) {
        g.save(); g.translate(x, y); g.rotate((((x / 18) | 0) + row) % 2 ? 0.6 : -0.6);
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(-4, 0, 8, 2.2);
        g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(-4, -1, 8, 1.4);
        g.restore();
      }
    }
    // plate seams with bolts
    for (let x = 80; x < W; x += 160) {
      g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x, FLOOR + 4, 2, H - FLOOR);
      g.fillStyle = 'rgba(255,255,255,0.04)'; g.fillRect(x + 2, FLOOR + 4, 1, H - FLOOR);
      for (let y = FLOOR + 16; y < H; y += 26) { bolt(g, x - 6, y, 1.4); bolt(g, x + 8, y, 1.4); }
    }
    // painted walkway lines
    g.fillStyle = 'rgba(150,124,40,0.35)';
    g.fillRect(0, FLOOR + 30, CR_X - CR_HALF - 34, 3); g.fillRect(CR_X + CR_HALF + 34, FLOOR + 30, W, 3);
    // oil stains and scuffs
    for (let i = 0; i < 9; i++) {
      const ox = 60 + rnd() * (W - 120), oy = FLOOR + 14 + rnd() * 50, rx = 10 + rnd() * 26;
      const gr = g.createRadialGradient(ox, oy, 0, ox, oy, rx);
      gr.addColorStop(0, 'rgba(5,6,8,0.4)'); gr.addColorStop(1, 'rgba(5,6,8,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(ox, oy, rx, rx * 0.35, 0, 0, TAU); g.fill();
    }
    g.strokeStyle = 'rgba(255,255,255,0.035)'; g.lineWidth = 1;
    for (let i = 0; i < 30; i++) {
      const sx = rnd() * W, sy = FLOOR + 8 + rnd() * 60;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 8 + rnd() * 20, sy + (rnd() - 0.5) * 3); g.stroke();
    }
    // impact plate under the press
    const ipx = CR_X - CR_HALF - 10, ipw = (CR_HALF + 10) * 2;
    stripes(g, ipx, FLOOR + 4, ipw, 14, '#5a4a1c', '#151515', 16);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(ipx, FLOOR + 18, ipw, 2);
    g.fillStyle = 'rgba(0,0,0,0.22)';
    for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(ipx + 14 + rnd() * (ipw - 28), FLOOR + 30 + rnd() * 26, 6 + rnd() * 8, 2 + rnd() * 2, 0, 0, TAU); g.fill(); }
    // floor lip
    g.fillStyle = '#4a5057'; g.fillRect(0, FLOOR, W, 2);
    g.fillStyle = '#1b1d20'; g.fillRect(0, FLOOR + 2, W, 3);
    // contact shadow where wall meets floor
    const cs = g.createLinearGradient(0, FLOOR - 18, 0, FLOOR);
    cs.addColorStop(0, 'rgba(0,0,0,0)'); cs.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = cs; g.fillRect(0, FLOOR - 18, W, 18);
    // bottom fade
    const bf = g.createLinearGradient(0, FLOOR + 30, 0, H);
    bf.addColorStop(0, 'rgba(0,0,0,0)'); bf.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = bf; g.fillRect(0, FLOOR + 30, W, H - FLOOR - 30);
    return c;
  }

  // ---------- animated pieces ----------
  function spr(ctx, img, x, y, ang) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }

  function drawWindowsLight(ctx, t) {
    // furnace glow outside breathes and flickers
    const f = 0.05 + 0.035 * Math.sin(t * 1.7) + 0.02 * Math.sin(t * 6.3 + 1.2) + 0.015 * Math.sin(t * 13.1);
    for (const wn of WINDOWS) {
      ctx.fillStyle = 'rgba(255,120,40,' + Math.max(0, f).toFixed(3) + ')';
      ctx.fillRect(wn.x, WIN_Y + WIN_H * 0.45, WIN_W, WIN_H * 0.55);
      // warm spill on the wall below the sill
      const gr = ctx.createLinearGradient(0, WIN_Y + WIN_H + 10, 0, WIN_Y + WIN_H + 60);
      gr.addColorStop(0, 'rgba(255,120,50,' + (f * 0.5).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(255,120,50,0)');
      ctx.fillStyle = gr; ctx.fillRect(wn.x - 6, WIN_Y + WIN_H + 10, WIN_W + 12, 50);
    }
  }

  function lampLevel(i, t) {
    if (i === 0) return 1;
    // the right lamp has a tired ballast: brief deterministic flickers
    const n = Math.floor(t * 14), r = hash(n * 3.1 + 17);
    const burst = hash(Math.floor(t / 3.2) + 5) < 0.4;
    return burst && r < 0.35 ? 0.35 + r : 1;
  }

  function drawLamps(ctx, t) {
    for (let i = 0; i < LAMPS.length; i++) {
      const x = LAMPS[i], lv = lampLevel(i, t);
      const sway = Math.sin(t * 0.8 + i * 2) * 1.5;
      // cone
      ctx.globalAlpha = 0.9 * lv;
      ctx.drawImage(SPR.cone, x + sway - SPR.cone.width / 2, 126);
      ctx.globalAlpha = 1;
      // cable
      ctx.strokeStyle = '#121417'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x, 82); ctx.lineTo(x + sway, 112); ctx.stroke();
      // enamel shade
      ctx.fillStyle = '#2f3d38';
      ctx.beginPath(); ctx.moveTo(x + sway - 6, 110); ctx.lineTo(x + sway + 6, 110); ctx.lineTo(x + sway + 20, 126); ctx.lineTo(x + sway - 20, 126); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(x + sway - 6, 110, 12, 2);
      ctx.fillStyle = '#1d2623'; ctx.fillRect(x + sway - 20, 125, 40, 2);
      // bulb
      ctx.fillStyle = 'rgba(255,214,150,' + (0.55 + 0.4 * lv).toFixed(2) + ')';
      ctx.beginPath(); ctx.ellipse(x + sway, 127, 7, 3.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,200,130,' + (0.12 * lv).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x + sway, 127, 18, 0, TAU); ctx.fill();
    }
  }

  function drawGears(ctx) {
    const a = st.gearA * 0.4;
    const ratio = 14 / 8;
    spr(ctx, SPR.gearBig, 154, 190, a);
    spr(ctx, SPR.gearSmall, 154 + 54, 190 + 40, -a * ratio + 0.2);
    spr(ctx, SPR.gearBig, W - 154, 190, -a);
    spr(ctx, SPR.gearSmall, W - 154 - 54, 190 + 40, a * ratio - 0.2);
    // drive chain from the small gear down to the belt motor
    ctx.strokeStyle = 'rgba(20,22,25,0.9)'; ctx.lineWidth = 3;
    ctx.setLineDash([4, 3]);
    ctx.lineDashOffset = -st.beltOffset * 0.5;
    for (const side of [0, 1]) {
      const gx = side ? W - 208 : 208;
      ctx.beginPath(); ctx.moveTo(gx - 10, 238); ctx.lineTo(gx - 6, 324); ctx.moveTo(gx + 10, 238); ctx.lineTo(gx + 6, 324); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }

  function drawPipeDetails(ctx, t) {
    for (const side of [0, 1]) {
      const m = x => side ? W - x : x;
      // pressure gauge on the riser
      const gx = m(46), gy = 248;
      ctx.fillStyle = '#1b1d20'; ctx.beginPath(); ctx.arc(gx, gy, 11, 0, TAU); ctx.fill();
      ctx.fillStyle = '#c9c2ae'; ctx.beginPath(); ctx.arc(gx, gy, 8.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#8a3b2a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(gx, gy, 6.5, Math.PI * 0.15, Math.PI * 0.35); ctx.stroke();
      const c = crusher();
      const p = c.phase === 'warn' ? 0.6 + 0.35 * c.k : c.phase === 'hold' ? 1 : c.phase === 'drop' ? 0.95 : 0.35 + 0.04 * Math.sin(t * 3 + side);
      const ang = Math.PI * 0.8 + p * Math.PI * 1.4;
      ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(ang) * 6.5, gy + Math.sin(ang) * 6.5); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(gx - 3, gy - 3, 2.5, 0, TAU); ctx.fill();
      // valve wheel
      const vx = m(46), vy = 316, va = Math.sin(t * 0.3 + side) * 0.05;
      ctx.save(); ctx.translate(vx, vy); ctx.rotate(va);
      ctx.strokeStyle = '#6e2f25'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, TAU); ctx.stroke();
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 10, Math.sin(a) * 10); ctx.lineTo(-Math.cos(a) * 10, -Math.sin(a) * 10); ctx.stroke(); }
      ctx.fillStyle = '#2a2d31'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function drawSteam(ctx, t) {
    // periodic hiss from the valves on both risers (offset so they don't sync)
    for (const side of [0, 1]) {
      const period = 6.5, ph = ((t + side * 3.1) % period) / period;
      if (ph > 0.45) continue;
      const k = ph / 0.45, dir = side ? -1 : 1;
      for (let i = 0; i < 7; i++) {
        const q = (k * 1.4 - i * 0.09);
        if (q < 0 || q > 1) continue;
        const x = (side ? W - 56 : 56) + dir * (q * 70 + hash(i + side * 9) * 10);
        const y = 316 - q * 60 - hash(i * 2 + 1) * 8;
        const s = 10 + q * 34;
        ctx.globalAlpha = 0.16 * (1 - q) * (1 - k * 0.5);
        ctx.drawImage(SPR.puff, x - s / 2, y - s / 2, s, s);
      }
    }
    // exhaust from the press housing while it rises
    const c = crusher();
    if (c.phase === 'rise' || c.phase === 'hold') {
      const k = c.phase === 'hold' ? c.k * 0.2 : 0.2 + c.k * 0.8;
      for (const dir of [-1, 1]) for (let i = 0; i < 6; i++) {
        const q = (k * 1.3 - i * 0.1);
        if (q < 0 || q > 1) continue;
        const x = CR_X + dir * (94 + q * 60), y = 104 - q * 18 + Math.sin(i * 1.7 + t * 3) * 3;
        const s = 8 + q * 30;
        ctx.globalAlpha = 0.2 * (1 - q);
        ctx.drawImage(SPR.puff, x - s / 2, y - s / 2, s, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawSparks(ctx, t) {
    // the electrical boxes spit a few sparks now and then (decoration only)
    for (const side of [0, 1]) {
      const period = 4.3, base = Math.floor((t + side * 1.9) / period), ph = ((t + side * 1.9) % period);
      if (hash(base + side * 31) < 0.45 || ph > 0.5) continue;
      const bx = side ? W - 342 - 40 + 6 : 342 + 34, by = 308;
      if (ph < 0.08) {
        ctx.fillStyle = 'rgba(255,230,150,' + (0.5 * (1 - ph / 0.08)).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(bx, by, 6, 0, TAU); ctx.fill();
      }
      for (let i = 0; i < 6; i++) {
        const vx = (hash(i + base * 7) - 0.5) * 70, vy = -20 - hash(i * 3 + base) * 40;
        const x = bx + vx * ph, y = by + vy * ph + 260 * ph * ph;
        ctx.fillStyle = i % 2 ? 'rgba(255,214,120,0.85)' : 'rgba(255,170,70,0.85)';
        ctx.fillRect(x, y, 1.6, 1.6);
      }
    }
  }

  function drawBelt(ctx, p, side, t) {
    // side: 0 = left belt, 1 = right belt. Movement in world x for this belt:
    const dirX = (side === 0 ? 1 : -1) * st.beltDir;
    const { x, y, w } = p;
    const h = 16;
    const outer = side === 0 ? x : x + w; // wall-side end (motor)
    // floor shadow under the belt
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath(); ctx.ellipse(x + w / 2, FLOOR + 3, w * 0.5, 5, 0, 0, TAU); ctx.fill();
    // legs with cross bracing and feet
    for (const lx of [x + 18, x + w - 26]) {
      slab(ctx, lx, y + h, 8, FLOOR - y - h, '#262a2f', 'rgba(255,255,255,0.08)', 'rgba(0,0,0,0.5)');
      slab(ctx, lx - 4, FLOOR - 4, 16, 4, '#30353b', 'rgba(255,255,255,0.1)', 'rgba(0,0,0,0.5)');
      bolt(ctx, lx - 1, FLOOR - 2, 1.2); bolt(ctx, lx + 9, FLOOR - 2, 1.2);
    }
    ctx.strokeStyle = '#1e2125'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x + 26, y + h + 6); ctx.lineTo(x + w - 26, FLOOR - 10);
    ctx.moveTo(x + w - 26, y + h + 6); ctx.lineTo(x + 26, FLOOR - 10);
    ctx.stroke();
    slab(ctx, x + 14, y + h + 44, w - 28, 6, '#23272b', 'rgba(255,255,255,0.06)', 'rgba(0,0,0,0.5)');
    // motor box at the wall end, with a spinning fan and status LED
    const mx = side === 0 ? x + 4 : x + w - 48;
    slab(ctx, mx, y + h + 2, 44, 30, '#2c3136', 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.55)');
    for (let i = 0; i < 5; i++) { ctx.fillStyle = '#1a1c20'; ctx.fillRect(mx + (side === 0 ? 4 : 18) + i * 4, y + h + 7, 2, 20); }
    const fx = side === 0 ? mx + 34 : mx + 10, fy = y + h + 17;
    ctx.fillStyle = '#121417'; ctx.beginPath(); ctx.arc(fx, fy, 9, 0, TAU); ctx.fill();
    spr(ctx, SPR.fan, fx, fy, st.beltOffset * 0.25 * dirX);
    ctx.strokeStyle = 'rgba(80,86,92,0.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(fx, fy, 9, 0, TAU); ctx.moveTo(fx - 9, fy); ctx.lineTo(fx + 9, fy); ctx.stroke();
    // return run underneath (moves the other way)
    ctx.fillStyle = '#17191c'; ctx.fillRect(x + h / 2, y + h - 2, w - h, 3);
    // side frame: C-channel with bolts
    slab(ctx, x + 2, y + 4, w - 4, 12, '#363b42', 'rgba(255,255,255,0.13)', 'rgba(0,0,0,0.55)');
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + 4, y + 9, w - 8, 2);
    for (let bx = x + 14; bx < x + w - 10; bx += 26) bolt(ctx, bx, y + 12, 1.3);
    // direction chevrons: lit LEDs along the frame (amber blinking before a flip)
    const warn = st.beltT > FLIP_EVERY - FLIP_WARN;
    const blinkOn = !warn || Math.sin(t * 22) > 0;
    for (let i = 0; i < 5; i++) {
      const cx = x + w * (0.2 + i * 0.15), cy = y + 10;
      // a chase so the arrows read as motion
      const chase = (((st.beltOffset / 40) * 1 + (dirX > 0 ? -i : i) * 0.2) % 1 + 1) % 1;
      const lit = blinkOn ? (warn ? 1 : 0.35 + 0.65 * (chase < 0.35 ? 1 : 0)) : 0.12;
      ctx.fillStyle = warn ? 'rgba(255,170,60,' + (0.9 * lit).toFixed(2) + ')' : 'rgba(110,230,140,' + (0.75 * lit).toFixed(2) + ')';
      ctx.beginPath();
      ctx.moveTo(cx + 5 * dirX, cy); ctx.lineTo(cx - 3 * dirX, cy - 4); ctx.lineTo(cx - 3 * dirX, cy + 4);
      ctx.closePath(); ctx.fill();
    }
    // rubber belt with moving cleats and a worn highlight
    ctx.save();
    ctx.beginPath(); ctx.rect(x + h / 2 - 2, y - 2, w - h + 4, 7); ctx.clip();
    ctx.fillStyle = '#1d1f22'; ctx.fillRect(x, y - 2, w, 7);
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(x, y - 2, w, 1);
    const off = ((st.beltOffset * dirX) % 14 + 14) % 14;
    for (let tx = x - 14 + off; tx < x + w; tx += 14) {
      ctx.fillStyle = '#3c4146'; ctx.fillRect(tx, y - 2, 4, 5);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(tx, y - 2, 4, 1);
    }
    ctx.restore();
    // end rollers with axle caps
    for (const rx of [x + h / 2, x + w - h / 2]) {
      ctx.fillStyle = '#1b1d21'; ctx.beginPath(); ctx.arc(rx, y + h / 2, 9.5, 0, TAU); ctx.fill();
      spr(ctx, SPR.roller, rx, y + h / 2, st.gearA * dirX * 2.2);
    }
    // oil drip under the motor end
    const dk = ((t * 0.5 + side * 0.37) % 1);
    if (dk < 0.7) {
      ctx.fillStyle = 'rgba(10,10,12,0.8)';
      ctx.beginPath(); ctx.ellipse(outer + (side === 0 ? 26 : -26), y + h + 32 + dk * dk * (FLOOR - y - h - 34), 1.3, 2, 0, 0, TAU); ctx.fill();
    }
  }

  function obstacleGone(o) {
    return !o || o.broken || o.dead || o.destroyed || (o.hp !== undefined && o.hp <= 0);
  }

  function drawRubble(ctx, o) {
    const r = rng(((o.x * 13) | 0) + 1);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, FLOOR, o.w * 0.6, 4, 0, 0, TAU); ctx.fill();
    for (let i = 0; i < 7; i++) {
      const px = o.x + r() * o.w, pw = 6 + r() * 10, ph = 3 + r() * 5;
      ctx.save(); ctx.translate(px, FLOOR - ph / 2); ctx.rotate((r() - 0.5) * 0.8);
      ctx.fillStyle = i % 3 ? '#4a4338' : '#5b5141';
      ctx.fillRect(-pw / 2, -ph / 2, pw, ph);
      ctx.fillStyle = 'rgba(255,255,255,0.08)'; ctx.fillRect(-pw / 2, -ph / 2, pw, 1);
      ctx.restore();
    }
    // a bent corner bracket
    ctx.strokeStyle = '#6e6656'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(o.x + o.w * 0.3, FLOOR - 2); ctx.lineTo(o.x + o.w * 0.42, FLOOR - 9); ctx.lineTo(o.x + o.w * 0.56, FLOOR - 7); ctx.stroke();
  }

  function drawMachine(ctx, o, t) {
    const { x, y, w, h } = o;
    const wallLeft = x < W / 2;
    // contact shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - 2, FLOOR - 2, w + 4, 3);
    // body with feet
    slab(ctx, x + 2, y + 4, w - 4, h - 8, '#2b3036', 'rgba(255,255,255,0.10)', 'rgba(0,0,0,0.55)');
    slab(ctx, x, y, w, 8, '#3b4148', 'rgba(255,255,255,0.18)', 'rgba(0,0,0,0.5)');
    slab(ctx, x + 4, y + h - 5, 12, 5, '#33383e', 'rgba(255,255,255,0.1)', 'rgba(0,0,0,0.5)');
    slab(ctx, x + w - 16, y + h - 5, 12, 5, '#33383e', 'rgba(255,255,255,0.1)', 'rgba(0,0,0,0.5)');
    // cooling fins
    for (let i = 0; i < 6; i++) { ctx.fillStyle = '#1b1e22'; ctx.fillRect(x + 8, y + 13 + i * 4, w - 16, 2); }
    // fan grille with spinning blades
    const fx = wallLeft ? x + w - 18 : x + 18, fy = y + 50;
    ctx.fillStyle = '#121417'; ctx.beginPath(); ctx.arc(fx, fy, 12, 0, TAU); ctx.fill();
    spr(ctx, SPR.fan, fx, fy, st.gearA * 9 * (wallLeft ? 1 : -1));
    ctx.strokeStyle = 'rgba(90,96,104,0.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(fx, fy, 12, 0, TAU); ctx.arc(fx, fy, 7, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(fx - 12, fy); ctx.lineTo(fx + 12, fy); ctx.moveTo(fx, fy - 12); ctx.lineTo(fx, fy + 12); ctx.stroke();
    // gauge with a needle that tracks the press
    const gx = wallLeft ? x + 18 : x + w - 18, gy = y + 48;
    ctx.fillStyle = '#16181b'; ctx.beginPath(); ctx.arc(gx, gy, 10, 0, TAU); ctx.fill();
    ctx.fillStyle = '#bdb6a2'; ctx.beginPath(); ctx.arc(gx, gy, 7.5, 0, TAU); ctx.fill();
    const c = crusher();
    const load = c.phase === 'warn' ? 0.5 + 0.4 * c.k : c.phase === 'hold' || c.phase === 'drop' ? 0.95 : c.phase === 'rise' ? 0.95 - 0.6 * c.k : 0.35 + 0.05 * Math.sin(t * 2.2 + x);
    const a = Math.PI * 0.8 + load * Math.PI * 1.4;
    ctx.strokeStyle = '#a5402c'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(a) * 6, gy + Math.sin(a) * 6); ctx.stroke();
    // LED row: green running lights, red when the press fires
    for (let i = 0; i < 3; i++) {
      const on = c.phase === 'warn' || c.phase === 'drop' || c.phase === 'hold'
        ? (Math.sin(t * 20 + i) > 0 ? '#ff4a36' : '#3a1612')
        : (Math.floor(t * 2 + i * 0.7) % 3 === i ? '#5fd17a' : '#1f4a2a');
      ctx.fillStyle = on; ctx.fillRect(x + w / 2 - 10 + i * 8, y + 64, 4, 3);
    }
    // warning sticker
    ctx.fillStyle = '#8c7426'; ctx.fillRect(wallLeft ? x + 8 : x + w - 20, y + 64, 12, 6);
    // power cable into the wall
    ctx.strokeStyle = '#111316'; ctx.lineWidth = 3;
    ctx.beginPath();
    if (wallLeft) { ctx.moveTo(x + 6, y + 30); ctx.quadraticCurveTo(x - 2, y + 42, x - 2, y + 60); }
    else { ctx.moveTo(x + w - 6, y + 30); ctx.quadraticCurveTo(x + w + 2, y + 42, x + w + 2, y + 60); }
    ctx.stroke();
    // heat shimmer above the exhaust: faint rising wisps
    for (let i = 0; i < 3; i++) {
      const q = ((t * 0.6 + i / 3) % 1);
      ctx.globalAlpha = 0.07 * (1 - q);
      const s = 8 + q * 16;
      ctx.drawImage(SPR.puff, x + w / 2 - s / 2 + Math.sin(q * 6 + i) * 4, y - q * 40 - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    bolt(ctx, x + 5, y + 4, 1.5); bolt(ctx, x + w - 5, y + 4, 1.5);
  }

  function drawCrate(ctx, o) {
    const { x, y, w, h } = o;
    const frac = o.hp !== undefined ? Math.max(0, Math.min(1, o.hp / CRATE_HP)) : 1;
    const hit = o._hitT > 0 ? Math.min(1, o._hitT / 0.15) : 0;
    const jx = hit ? Math.sin(hit * 40) * 1.5 : 0;
    ctx.save(); ctx.translate(jx, 0);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(x - 2, FLOOR - 2, w + 4, 3);
    // body panel
    const gr = ctx.createLinearGradient(x, y, x + w, y + h);
    gr.addColorStop(0, frac > 0.5 ? '#585040' : '#4b4436'); gr.addColorStop(1, frac > 0.5 ? '#3a342a' : '#302a22');
    ctx.fillStyle = gr; ctx.fillRect(x, y, w, h);
    // ribbed panel inset
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x + 7, y + 7, w - 14, h - 14);
    for (let i = 0; i < 4; i++) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(x + 9, y + 11 + i * ((h - 20) / 4), w - 18, 1); }
    // frame bars
    ctx.strokeStyle = '#6f6350'; ctx.lineWidth = 5;
    ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 1, y + h - 1); ctx.lineTo(x + 1, y + 1); ctx.lineTo(x + w - 1, y + 1); ctx.stroke();
    // diagonal brace
    ctx.strokeStyle = '#625644'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(x + 6, y + h - 6); ctx.lineTo(x + w - 6, y + 6); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 6, y + h - 8); ctx.lineTo(x + w - 8, y + 6); ctx.stroke();
    // stencil
    ctx.font = 'bold 9px Impact, "Arial Black", sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(210,190,140,0.35)';
    ctx.fillText(x < W / 2 ? 'No.09-A' : 'No.09-B', x + w / 2, y + h - 10);
    // corner brackets with bolts
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) {
      ctx.fillStyle = '#7d715b';
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + 12 * sx, cy); ctx.lineTo(cx + 12 * sx, cy + 4 * sy); ctx.lineTo(cx + 4 * sx, cy + 4 * sy); ctx.lineTo(cx + 4 * sx, cy + 12 * sy); ctx.lineTo(cx, cy + 12 * sy); ctx.closePath(); ctx.fill();
      bolt(ctx, cx + 4 * sx, cy + 4 * sy, 1.3);
    }
    // damage: dents, scratches, cracks
    if (frac < 0.85) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.beginPath(); ctx.ellipse(x + w * 0.66, y + h * 0.35, 6, 4, 0.4, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 10, y + 18); ctx.lineTo(x + 22, y + 15); ctx.moveTo(x + 12, y + 22); ctx.lineTo(x + 20, y + 21); ctx.stroke();
    }
    if (frac < 0.6) {
      ctx.strokeStyle = 'rgba(12,10,8,0.95)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + w * 0.3, y); ctx.lineTo(x + w * 0.45, y + h * 0.35); ctx.lineTo(x + w * 0.35, y + h * 0.6); ctx.lineTo(x + w * 0.42, y + h * 0.75); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(x + w * 0.3, y + h * 0.68, 5, 3, -0.3, 0, TAU); ctx.fill();
    }
    if (frac < 0.3) {
      ctx.strokeStyle = 'rgba(12,10,8,0.95)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + w, y + h * 0.4); ctx.lineTo(x + w * 0.65, y + h * 0.55); ctx.lineTo(x + w * 0.7, y + h); ctx.stroke();
      // bent top-right bracket
      ctx.fillStyle = '#1a1612'; ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x + w - 9, y); ctx.lineTo(x + w, y + 7); ctx.closePath(); ctx.fill();
    }
    if (hit) { ctx.fillStyle = 'rgba(255,240,210,' + (0.35 * hit).toFixed(2) + ')'; ctx.fillRect(x, y, w, h); }
    ctx.restore();
  }

  function drawObstacle(ctx, o, t) {
    if (!o) return;
    if (obstacleGone(o)) { if (o.kind === 'crate') drawRubble(ctx, o); return; }
    if (o.kind === 'machine') drawMachine(ctx, o, t);
    else drawCrate(ctx, o);
  }

  function drawCrusher(ctx, t) {
    const c = crusher();
    let shakeX = 0;
    if (c.phase === 'warn') shakeX = Math.sin(t * 70) * 2 * c.k;
    const hx = CR_X + shakeX, by = c.y;
    const reach = (by - CR_TOP) / (FLOOR - CR_TOP); // 0 at the top, 1 on the floor
    // shadow on the impact plate grows as the head comes down
    ctx.fillStyle = 'rgba(0,0,0,' + (0.12 + 0.35 * Math.max(0, reach)).toFixed(3) + ')';
    ctx.beginPath(); ctx.ellipse(CR_X, FLOOR + 3, CR_HALF * (0.7 + 0.35 * Math.max(0, reach)), 5, 0, 0, TAU); ctx.fill();
    // danger zone on the floor during the warning
    if (c.phase === 'warn') {
      const a = 0.15 + 0.25 * (Math.sin(t * 26) * 0.5 + 0.5);
      const zone = ctx.createLinearGradient(0, FLOOR - 160, 0, FLOOR);
      zone.addColorStop(0, 'rgba(255,60,40,0)');
      zone.addColorStop(1, 'rgba(255,60,40,' + a.toFixed(3) + ')');
      ctx.fillStyle = zone;
      ctx.fillRect(CR_X - CR_HIT_HALF + 18, FLOOR - 160, (CR_HIT_HALF - 18) * 2, 160);
      // edge markers: chevrons pointing out of the zone
      ctx.fillStyle = 'rgba(255,90,60,' + (a + 0.2).toFixed(3) + ')';
      for (const dir of [-1, 1]) {
        const ex = CR_X + dir * (CR_HIT_HALF - 14);
        for (let i = 0; i < 2; i++) {
          const cx = ex + dir * i * 9;
          ctx.beginPath(); ctx.moveTo(cx + dir * 6, FLOOR - 9); ctx.lineTo(cx, FLOOR - 15); ctx.lineTo(cx, FLOOR - 3); ctx.closePath(); ctx.fill();
        }
      }
    }
    // impact cracks and flash after the slam
    if (c.phase === 'hold' || (c.phase === 'rise' && c.k < 0.6)) {
      const fade = c.phase === 'hold' ? 1 : 1 - c.k / 0.6;
      ctx.strokeStyle = 'rgba(8,8,10,' + (0.7 * fade).toFixed(3) + ')'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const dir = i % 2 ? 1 : -1, sx = CR_X + dir * (CR_HALF - 4 - i * 3);
        ctx.moveTo(sx, FLOOR + 1); ctx.lineTo(sx + dir * (8 + hash(i) * 14), FLOOR + 6 + hash(i + 3) * 10); ctx.lineTo(sx + dir * (16 + hash(i + 5) * 18), FLOOR + 12 + hash(i + 7) * 14);
      }
      ctx.stroke();
      if (c.phase === 'hold' && c.k < 0.35) {
        const q = c.k / 0.35;
        ctx.strokeStyle = 'rgba(255,220,160,' + (0.45 * (1 - q)).toFixed(3) + ')'; ctx.lineWidth = 3 * (1 - q) + 1;
        ctx.beginPath(); ctx.ellipse(CR_X, FLOOR, CR_HALF + q * 70, 6 + q * 8, 0, 0, TAU); ctx.stroke();
      }
    }
    // hydraulic hoses (slack while up, taut when down)
    ctx.lineCap = 'round';
    for (const dir of [-1, 1]) {
      const sx = CR_X + dir * 70, sy = 120, ex = hx + dir * (CR_HALF - 10), ey = by - 42;
      const sag = 26 * (1 - Math.max(0, reach)) + 6;
      ctx.strokeStyle = '#141619'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.bezierCurveTo(sx + dir * sag, sy + 30, ex + dir * sag, ey - 30, ex, ey); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.10)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(sx - 1, sy); ctx.bezierCurveTo(sx + dir * sag - 1, sy + 30, ex + dir * sag - 1, ey - 30, ex - 1, ey); ctx.stroke();
    }
    ctx.lineCap = 'butt';
    // chrome piston rods
    const rodTop = 126, rodBot = by - 44;
    if (rodBot > rodTop) for (const rx of [hx - 20, hx + 20]) {
      const gr = ctx.createLinearGradient(rx - 6, 0, rx + 6, 0);
      gr.addColorStop(0, '#3a4046'); gr.addColorStop(0.35, '#b9c1c8'); gr.addColorStop(0.55, '#7f878e'); gr.addColorStop(1, '#2f3439');
      ctx.fillStyle = gr; ctx.fillRect(rx - 6, rodTop, 12, rodBot - rodTop);
      // oily film band that travels with the rod
      ctx.fillStyle = 'rgba(40,30,20,0.25)'; ctx.fillRect(rx - 6, rodTop + 4, 12, 3);
    }
    // guide shoes riding the rails
    for (const dir of [-1, 1]) {
      const gx = dir < 0 ? CR_X - CR_HALF - 12 : CR_X + CR_HALF;
      slab(ctx, gx + shakeX, by - 38, 12, 22, '#3a4047', 'rgba(255,255,255,0.12)', 'rgba(0,0,0,0.5)');
    }
    // head block
    slab(ctx, hx - CR_HALF, by - 46, CR_HALF * 2, 34, '#373d44', 'rgba(255,255,255,0.14)', 'rgba(0,0,0,0.55)');
    slab(ctx, hx - CR_HALF + 8, by - 52, CR_HALF * 2 - 16, 8, '#424951', 'rgba(255,255,255,0.16)', 'rgba(0,0,0,0.5)');
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(hx - CR_HALF + 10, by - 38, CR_HALF * 2 - 20, 18);
    for (let bx = hx - CR_HALF + 8; bx <= hx + CR_HALF - 8; bx += 18) bolt(ctx, bx, by - 41, 1.6);
    ctx.font = 'bold 11px Impact, "Arial Black", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(210,180,110,0.45)'; ctx.fillText('DANGER', hx, by - 29);
    ctx.textBaseline = 'alphabetic';
    // striped striking face, worn at the edges
    stripes(ctx, hx - CR_HALF, by - 12, CR_HALF * 2, 12, '#8a6d1e', '#1a1a1a', 16);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(hx - CR_HALF, by - 2, CR_HALF * 2, 2);
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.fillRect(hx - CR_HALF, by - 12, CR_HALF * 2, 1);
    ctx.fillStyle = 'rgba(30,26,20,0.5)';
    for (let i = 0; i < 5; i++) ctx.fillRect(hx - CR_HALF + 6 + hash(i + 40) * (CR_HALF * 2 - 16), by - 11 + hash(i + 50) * 8, 6 + hash(i + 60) * 8, 1.5);

    // beacon on the housing: dark when idle, spinning red during the warning, solid on impact
    const bx = CR_X, bY = 100;
    const spin = c.phase === 'warn';
    const solid = c.phase === 'drop' || c.phase === 'hold';
    if (spin) {
      const ang = t * 9;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 84, W, FLOOR - 84); ctx.clip();
      for (const off of [0, Math.PI]) {
        const a = ang + off, cosA = Math.cos(a);
        const len = 300, spread = 0.16;
        const alpha = 0.10 * (0.4 + 0.6 * Math.abs(cosA));
        ctx.fillStyle = 'rgba(255,60,40,' + alpha.toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(bx, bY);
        ctx.lineTo(bx + Math.cos(a - spread) * len, bY + Math.abs(Math.sin(a - spread)) * len * 0.5 + 20);
        ctx.lineTo(bx + Math.cos(a + spread) * len, bY + Math.abs(Math.sin(a + spread)) * len * 0.5 + 20);
        ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    // base and dome
    slab(ctx, bx - 10, bY + 4, 20, 6, '#2a2e33', 'rgba(255,255,255,0.12)', 'rgba(0,0,0,0.5)');
    const lit = spin ? 0.6 + 0.4 * Math.abs(Math.sin(t * 9)) : solid ? 1 : 0;
    ctx.fillStyle = lit ? 'rgba(255,' + (70 + 40 * lit | 0) + ',50,' + (0.6 + 0.4 * lit).toFixed(2) + ')' : '#4a1d1a';
    ctx.beginPath(); ctx.arc(bx, bY + 4, 8, Math.PI, 0); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.arc(bx - 3, bY, 2, 0, TAU); ctx.fill();
    if (lit) {
      ctx.fillStyle = 'rgba(255,60,40,' + (0.16 * lit).toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(bx, bY, 24, 0, TAU); ctx.fill();
    }
    // ready LED next to the beacon
    ctx.fillStyle = c.phase === 'idle' ? (Math.sin(t * 3) > 0 ? '#5fd17a' : '#2a5a36') : '#1f2a22';
    ctx.fillRect(bx + 16, bY + 2, 4, 4);
  }

  function drawMotes(ctx, t) {
    // dust drifting through the lamp light
    for (let i = 0; i < 28; i++) {
      const lamp = LAMPS[i % 2];
      const life = 9 + hash(i) * 6;
      const q = ((t / life + hash(i + 100)) % 1);
      const y = 140 + q * 210;
      const spread = 14 + (y - 126) * 0.55;
      const x = lamp + (hash(i + 200) - 0.5) * 2 * spread * 0.8 + Math.sin(t * 0.7 + i) * 6;
      const a = 0.22 * Math.sin(q * Math.PI) * lampLevel(i % 2, t);
      ctx.fillStyle = 'rgba(255,220,170,' + a.toFixed(3) + ')';
      ctx.fillRect(x, y, 1.5, 1.5);
    }
  }

  const arena = {
    id: 'arena09',
    name: 'Factory',
    nameVi: 'Nhà máy',
    hint: 'Conveyors and a crusher',
    hintVi: 'Băng chuyền và máy dập',
    floorY: FLOOR,
    gravityScale: 1,
    platforms,
    obstacles,

    reset() {
      for (let i = 0; i < obstacles.length; i++) {
        const o = obstacles[i], b = OB_INIT[i];
        o.x = b.x; o.y = b.y; o.w = b.w; o.h = b.h;
        if (b.hp !== undefined) o.hp = b.hp;
        if ('broken' in o) o.broken = false;
      }
      st.crT = -FIRST_DELAY;
      st.beltT = 0;
      st.beltDir = 1;
      st.hitCd[0] = st.hitCd[1] = 0;
      st.slammed = false;
    },

    update(dt, fighters, game) {
      try {
        if (!(dt > 0)) return;
        dt = Math.min(dt, 0.05);
        st.gearA += dt;
        st.beltOffset += BELT_SPEED * dt;

        // conveyor direction flip
        st.beltT += dt;
        if (st.beltT >= FLIP_EVERY) { st.beltT -= FLIP_EVERY; st.beltDir = -st.beltDir; }

        // crusher cycle
        st.crT += dt;
        if (st.crT >= CYCLE) { st.crT -= CYCLE; st.slammed = false; }
        const c = crusher();

        if (c.phase === 'hold' && !st.slammed) {
          st.slammed = true;
          if (game && game.shake) game.shake(10);
          if (game && game.particle) {
            for (let i = 0; i < 18; i++) {
              const s = i % 2 ? 1 : -1;
              game.particle({ x: CR_X + s * (CR_HALF - 4), y: FLOOR - 4, vx: s * (60 + Math.random() * 180), vy: -40 - Math.random() * 120, life: 0.6 + Math.random() * 0.4, col: i % 3 ? '#9aa1a8' : '#ffb347', r: 3 + Math.random() * 3, float: i % 3 !== 0 });
            }
          }
        }

        for (let i = 0; i < 2; i++) st.hitCd[i] = Math.max(0, st.hitCd[i] - dt);

        if (!fighters) return;
        for (const f of fighters) {
          if (!f || f.ko) continue;
          const slot = f.slot === 1 ? 1 : 0;

          // conveyor push
          if (f.onGround) {
            for (let i = 0; i < platforms.length; i++) {
              const p = platforms[i];
              if (Math.abs(f.y - p.y) < 3 && f.x > p.x && f.x < p.x + p.w) {
                const dirX = (i === 0 ? 1 : -1) * st.beltDir;
                f.x = clamp(f.x + dirX * BELT_SPEED * dt, 28, 932);
              }
            }
          }

          // crusher: hurts while it falls through the fighter's body, and while pressed down
          if ((c.phase === 'drop' || c.phase === 'hold') && Math.abs(f.x - CR_X) < CR_HIT_HALF && c.y > f.y - 150) {
            const pushDir = f.x < CR_X ? -1 : 1;
            if (st.hitCd[slot] <= 0 && game && game.fighting && game.hurt) {
              st.hitCd[slot] = 1.5;
              game.hurt(f, { dmg: 14, kb: 460, dir: pushDir, stun: 0.45, unblockable: true, heavy: true, word: 'CRUNCH!' });
            }
            // never leave anyone inside the press
            if (c.phase === 'hold') {
              const edge = pushDir < 0 ? CR_X - CR_HIT_HALF : CR_X + CR_HIT_HALF;
              f.x = clamp(edge, 28, 932);
              if (f.vx * pushDir < 120) f.vx = pushDir * 220;
            }
          }
        }
      } catch (e) { /* never break the game loop */ }
    },

    drawBackground(ctx, t) {
      try {
        if (!SPR) buildSprites();
        if (!bg) bg = buildBg();
        ctx.save();
        ctx.drawImage(bg, 0, 0);
        drawWindowsLight(ctx, t);
        drawGears(ctx);
        drawPipeDetails(ctx, t);
        drawLamps(ctx, t);
        drawSteam(ctx, t);
        drawSparks(ctx, t);
        for (const o of obstacles) drawObstacle(ctx, o, t);
        drawBelt(ctx, platforms[0], 0, t);
        drawBelt(ctx, platforms[1], 1, t);
        drawCrusher(ctx, t);
        ctx.restore();
      } catch (e) { try { ctx.restore(); } catch (_) {} }
    },

    drawForeground(ctx, t) {
      try {
        if (!SPR) buildSprites();
        ctx.save();
        drawMotes(ctx, t);
        // low steam hugging the floor at both walls
        for (let i = 0; i < 8; i++) {
          const side = i % 2, q = ((t * 0.05 + hash(i + 300)) % 1);
          const x = side ? W - 20 - q * 140 : 20 + q * 140, y = FLOOR - 6 - hash(i + 310) * 12;
          const s = 50 + hash(i + 320) * 40;
          ctx.globalAlpha = 0.06 * Math.sin(q * Math.PI);
          ctx.drawImage(SPR.puff, x - s / 2, y - s * 0.25, s, s * 0.5);
        }
        ctx.globalAlpha = 1;
        // dust burst after a slam
        const c = crusher();
        if (c.phase === 'hold') {
          const a = 0.22 * (1 - c.k);
          ctx.fillStyle = 'rgba(170,165,150,' + a.toFixed(3) + ')';
          ctx.beginPath(); ctx.ellipse(CR_X, FLOOR - 6, 90 + c.k * 70, 18 + c.k * 10, 0, 0, Math.PI * 2); ctx.fill();
        }
        // cool top light, warm floor bounce, and a dark vignette at the edges
        const grade = ctx.createLinearGradient(0, 80, 0, H);
        grade.addColorStop(0, 'rgba(40,70,90,0.06)'); grade.addColorStop(0.7, 'rgba(0,0,0,0)'); grade.addColorStop(1, 'rgba(90,50,20,0.06)');
        ctx.fillStyle = grade; ctx.fillRect(0, 80, W, H - 80);
        const v = ctx.createRadialGradient(W / 2, H / 2, 240, W / 2, H / 2, 620);
        v.addColorStop(0, 'rgba(0,0,0,0)');
        v.addColorStop(1, 'rgba(0,0,0,0.4)');
        ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
        ctx.restore();
      } catch (e) { try { ctx.restore(); } catch (_) {} }
    },
  };

  arena.reset();
  (window.STICK_ARENAS = window.STICK_ARENAS || []).push(arena);
})();
