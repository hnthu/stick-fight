// Arena 07: Space Station (Trạm vũ trụ)
// Low gravity, two fixed metal ledges and one thruster platform that drifts left and right.
// Visual notes: everything static is pre-rendered once (sky, planet, frame, deck, obstacle bodies);
// per-frame drawing is only the animated bits. Drawing never touches Math.random, so the seeded
// arena step used for online play is unaffected; update() keeps its original logic.
(function () {
  const W = 960, H = 540, FLOOR = 474;
  const DRIFT_CX = 405, DRIFT_AMP = 150, DRIFT_PERIOD = 11;
  const TAU = Math.PI * 2;

  const platforms = [
    { x: 110, y: 345, w: 170, h: 14 },
    { x: 680, y: 345, w: 170, h: 14 },
    { x: DRIFT_CX, y: 220, w: 150, h: 14 },
  ];
  const drifter = platforms[2];
  let driftT = 0;

  // Solid obstacles, mirrored left/right; spawn zones (x 170..290, 670..790) stay clear.
  // Cargo containers against the walls, a control console mid-floor, and one
  // breakable debris crate floating above the console (below the drifting platform).
  const OBSTACLES = [
    { x: 22, y: 394, w: 80, h: 80, kind: 'container' },
    { x: 858, y: 394, w: 80, h: 80, kind: 'container' },
    { x: 445, y: 422, w: 70, h: 52, kind: 'console' },
    { x: 458, y: 240, w: 44, h: 40, kind: 'debris', hp: 40 },
  ];
  const DEBRIS_HP = 40;
  const obstacles = OBSTACLES.map(o => Object.assign({}, o));
  const alive = o => !(o.broken || o.dead || o.destroyed || (o.hp != null && o.hp <= 0));

  // fighter positions seen in update(), only used for light pools on the deck (visual only)
  const seen = [];

  // own seeded random for layout, so Math.random (seeded by the engine online) is never touched here
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const gauss = () => (rnd() + rnd() + rnd() - 1.5) / 1.5;
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  // smooth deterministic flicker from a few sines
  const flick = (t, k) => 0.5 + 0.22 * Math.sin(t * 31 + k) + 0.17 * Math.sin(t * 17.3 + k * 2.1) + 0.11 * Math.sin(t * 47.9 + k * 0.7);

  // ---------- star data (animated layers) ----------
  const twinkles = [], farStars = [], bright = [];
  for (let i = 0; i < 30; i++) twinkles.push({ x: 30 + rnd() * (W - 60), y: 16 + rnd() * 380, r: 1 + rnd() * 1.4, ph: rnd() * TAU, sp: 0.8 + rnd() * 2.2, warm: rnd() < 0.3 });
  for (let i = 0; i < 48; i++) farStars.push({ x: rnd() * W, y: 12 + rnd() * 420, a: 0.12 + rnd() * 0.28 });
  [[262, 96], [640, 72], [900, 300], [72, 268], [520, 168], [372, 330]].forEach(([x, y], i) => bright.push({ x, y, s: 5 + (i % 3) * 2, ph: i * 1.7, col: i % 2 ? '200,220,255' : '255,232,200' }));

  // ---------- static background ----------
  let bg = null;
  function buildStatic() {
    const c = canvas(W, H);
    const b = c.getContext('2d');

    // deep space base
    const sky = b.createLinearGradient(0, 0, 0, FLOOR);
    sky.addColorStop(0, '#04050c'); sky.addColorStop(0.55, '#080a1a'); sky.addColorStop(1, '#0f1226');
    b.fillStyle = sky; b.fillRect(0, 0, W, H);

    const blob = (x, y, r, col) => {
      const g = b.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      b.fillStyle = g; b.fillRect(x - r, y - r, r * 2, r * 2);
    };

    // milky way band: soft glow along a diagonal, dense dust of tiny stars, darker dust lanes
    b.save();
    b.translate(W / 2, 230); b.rotate(-0.32);
    b.scale(1, 0.22);
    const mw = b.createRadialGradient(0, 0, 0, 0, 0, 620);
    mw.addColorStop(0, 'rgba(120,120,190,0.16)'); mw.addColorStop(0.5, 'rgba(80,80,150,0.07)'); mw.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = mw; b.fillRect(-640, -640, 1280, 1280);
    b.restore();
    for (let i = 0; i < 900; i++) {
      const u = rnd() * 1.3 - 0.15, off = gauss() * 70;
      const x = u * W, y = 230 + (W / 2 - x) * Math.tan(0.32) + off;
      if (y < 0 || y > FLOOR - 6) continue;
      const a = 0.05 + rnd() * 0.22 * (1 - Math.abs(off) / 140);
      b.fillStyle = `rgba(210,215,255,${Math.max(0.03, a).toFixed(3)})`;
      b.fillRect(x, y, 1, 1);
    }
    for (let i = 0; i < 14; i++) {
      const u = 0.1 + rnd() * 0.8, x = u * W, y = 230 + (W / 2 - x) * Math.tan(0.32) + gauss() * 18;
      blob(x, y, 24 + rnd() * 30, 'rgba(4,4,12,0.35)');
    }

    // nebula clouds built from many small soft blobs (purple left, teal middle, magenta right)
    const cloud = (cx, cy, spread, n, rgb, a) => {
      for (let i = 0; i < n; i++) blob(cx + gauss() * spread, cy + gauss() * spread * 0.6, 30 + rnd() * 70, `rgba(${rgb},${(a * (0.5 + rnd())).toFixed(3)})`);
    };
    cloud(210, 170, 170, 18, '110,60,170', 0.06);
    cloud(240, 150, 80, 8, '170,90,200', 0.05);
    cloud(560, 300, 140, 14, '40,110,160', 0.05);
    cloud(880, 410, 120, 10, '150,50,110', 0.05);

    // tiny distant spiral galaxy
    b.save();
    b.translate(612, 128); b.rotate(0.5); b.scale(1, 0.38);
    blob(0, 0, 16, 'rgba(230,215,255,0.35)');
    blob(0, 0, 5, 'rgba(255,245,230,0.6)');
    b.strokeStyle = 'rgba(190,180,240,0.18)'; b.lineWidth = 2;
    b.beginPath(); b.arc(0, 0, 10, 0.2, 2.6); b.stroke();
    b.beginPath(); b.arc(0, 0, 10, 3.3, 5.7); b.stroke();
    b.restore();

    // field stars in a few colours and sizes
    const starCols = ['220,226,255', '200,215,255', '255,240,220', '255,220,190', '190,230,255'];
    for (let i = 0; i < 280; i++) {
      const x = rnd() * W, y = rnd() * (FLOOR - 10), a = 0.12 + rnd() * 0.55;
      b.fillStyle = `rgba(${starCols[(rnd() * starCols.length) | 0]},${a.toFixed(2)})`;
      const s = rnd() < 0.92 ? 1 : 2;
      b.fillRect(x, y, s, s);
    }

    // ---- ringed planet (upper right, outside the fight band) ----
    const px = 790, py = 165, pr = 64, tilt = -0.35;
    const ring = (from, to) => {
      const bands = [[1.55, 2, 'rgba(150,120,90,0.25)'], [1.68, 5, 'rgba(215,185,140,0.42)'], [1.83, 3, 'rgba(235,205,160,0.5)'],
        [1.95, 1.5, 'rgba(120,100,80,0.18)'] /* Cassini gap edge */, [2.05, 4, 'rgba(200,170,130,0.38)'], [2.2, 2, 'rgba(160,135,105,0.22)']];
      b.save(); b.translate(px, py); b.rotate(tilt);
      for (const [k, lw, col] of bands) {
        b.strokeStyle = col; b.lineWidth = lw;
        b.beginPath(); b.ellipse(0, 0, pr * k, pr * k * 0.22, 0, from, to); b.stroke();
      }
      b.restore();
    };
    blob(px, py, pr * 1.6, 'rgba(255,190,120,0.05)'); // faint halo
    ring(Math.PI, TAU); // back half
    const pg = b.createRadialGradient(px - 24, py - 26, 6, px, py, pr);
    pg.addColorStop(0, '#d2a46e'); pg.addColorStop(0.55, '#8e6040'); pg.addColorStop(1, '#3a241b');
    b.fillStyle = pg; b.beginPath(); b.arc(px, py, pr, 0, TAU); b.fill();
    b.save();
    b.beginPath(); b.arc(px, py, pr, 0, TAU); b.clip();
    // wavy cloud bands, tilted with the rings
    b.translate(px, py); b.rotate(tilt * 0.6);
    for (let i = -4; i <= 4; i++) {
      b.fillStyle = i % 2 ? 'rgba(70,40,28,0.28)' : 'rgba(240,200,150,0.13)';
      b.beginPath();
      const yy = i * 15;
      b.moveTo(-pr - 4, yy);
      for (let x = -pr; x <= pr + 4; x += 8) b.lineTo(x, yy + Math.sin(x * 0.09 + i) * 2.4);
      for (let x = pr + 4; x >= -pr - 4; x -= 8) b.lineTo(x, yy + 7 + Math.sin(x * 0.07 + i * 2) * 2);
      b.closePath(); b.fill();
    }
    // storm spot
    b.fillStyle = 'rgba(170,80,50,0.45)'; b.beginPath(); b.ellipse(-18, 22, 11, 5, 0, 0, TAU); b.fill();
    b.strokeStyle = 'rgba(240,190,140,0.25)'; b.lineWidth = 1; b.beginPath(); b.ellipse(-18, 22, 14, 7, 0, 0, TAU); b.stroke();
    b.restore();
    b.save();
    b.beginPath(); b.arc(px, py, pr, 0, TAU); b.clip();
    // ring shadow across the disc
    b.translate(px, py); b.rotate(tilt);
    b.fillStyle = 'rgba(20,10,8,0.35)';
    b.beginPath(); b.ellipse(0, 10, pr * 2.1, pr * 0.2, 0, 0, TAU); b.ellipse(0, 10, pr * 1.5, pr * 0.12, 0, 0, TAU); b.fill('evenodd');
    b.restore();
    // night side: light comes from the upper left
    const night = b.createRadialGradient(px - 40, py - 44, pr * 0.6, px - 10, py - 12, pr * 1.6);
    night.addColorStop(0, 'rgba(0,0,0,0)'); night.addColorStop(0.55, 'rgba(6,4,12,0.45)'); night.addColorStop(1, 'rgba(4,3,10,0.9)');
    b.save(); b.beginPath(); b.arc(px, py, pr, 0, TAU); b.clip();
    b.fillStyle = night; b.fillRect(px - pr, py - pr, pr * 2, pr * 2);
    b.restore();
    // thin atmosphere rim on the lit edge
    b.strokeStyle = 'rgba(255,215,170,0.35)'; b.lineWidth = 2;
    b.beginPath(); b.arc(px, py, pr - 0.5, Math.PI * 0.95, Math.PI * 1.75); b.stroke();
    b.strokeStyle = 'rgba(255,200,150,0.12)'; b.lineWidth = 5;
    b.beginPath(); b.arc(px, py, pr + 2, Math.PI * 1.0, Math.PI * 1.7); b.stroke();
    ring(0, Math.PI); // front half

    // ---- small cratered moon ----
    const mx = 156, my = 126, mr = 20;
    const mg = b.createRadialGradient(mx - 7, my - 7, 2, mx, my, mr);
    mg.addColorStop(0, '#a4a9bb'); mg.addColorStop(0.7, '#5f6475'); mg.addColorStop(1, '#2a2d3c');
    b.fillStyle = mg; b.beginPath(); b.arc(mx, my, mr, 0, TAU); b.fill();
    b.save(); b.beginPath(); b.arc(mx, my, mr, 0, TAU); b.clip();
    [[-6, -4, 4], [5, 6, 3], [8, -8, 2], [-4, 9, 2.5], [-11, 4, 1.8], [2, -12, 1.6]].forEach(([dx, dy, r]) => {
      b.fillStyle = 'rgba(40,42,55,0.45)'; b.beginPath(); b.arc(mx + dx, my + dy, r, 0, TAU); b.fill();
      b.strokeStyle = 'rgba(200,205,220,0.25)'; b.lineWidth = 0.8; b.beginPath(); b.arc(mx + dx - 0.6, my + dy - 0.6, r, Math.PI * 0.9, Math.PI * 1.7); b.stroke();
    });
    const mn = b.createLinearGradient(mx - mr, my - mr, mx + mr, my + mr);
    mn.addColorStop(0, 'rgba(0,0,0,0)'); mn.addColorStop(0.6, 'rgba(0,0,0,0.25)'); mn.addColorStop(1, 'rgba(0,0,8,0.8)');
    b.fillStyle = mn; b.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    b.restore();

    // ---- window glass: faint reflections and scratches (behind the fighters) ----
    b.save();
    b.globalAlpha = 0.045; b.fillStyle = '#cfe0ff';
    b.beginPath(); b.moveTo(40, 90); b.lineTo(130, 90); b.lineTo(60, 230); b.lineTo(40, 230); b.closePath(); b.fill();
    b.globalAlpha = 0.03;
    b.beginPath(); b.moveTo(150, 90); b.lineTo(172, 90); b.lineTo(100, 230); b.lineTo(78, 230); b.closePath(); b.fill();
    b.beginPath(); b.moveTo(W - 60, 300); b.lineTo(W - 40, 300); b.lineTo(W - 100, 420); b.lineTo(W - 120, 420); b.closePath(); b.fill();
    b.globalAlpha = 1;
    b.strokeStyle = 'rgba(200,215,255,0.06)'; b.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const x = 40 + rnd() * (W - 80), y = 90 + rnd() * 330, l = 6 + rnd() * 26, a = rnd() * Math.PI;
      b.beginPath(); b.moveTo(x, y); b.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); b.stroke();
    }
    // a soft blue edge tint where the glass meets the frame
    const edgeL = b.createLinearGradient(22, 0, 70, 0);
    edgeL.addColorStop(0, 'rgba(90,140,220,0.08)'); edgeL.addColorStop(1, 'rgba(90,140,220,0)');
    b.fillStyle = edgeL; b.fillRect(22, 0, 48, FLOOR);
    const edgeR = b.createLinearGradient(W - 22, 0, W - 70, 0);
    edgeR.addColorStop(0, 'rgba(90,140,220,0.08)'); edgeR.addColorStop(1, 'rgba(90,140,220,0)');
    b.fillStyle = edgeR; b.fillRect(W - 70, 0, 48, FLOOR);
    b.restore();

    // ---- window frame ----
    const bolt = (x, y) => {
      b.fillStyle = '#0e1018'; b.beginPath(); b.arc(x, y + 0.6, 2.2, 0, TAU); b.fill();
      b.fillStyle = '#596381'; b.beginPath(); b.arc(x, y, 1.8, 0, TAU); b.fill();
      b.fillStyle = 'rgba(220,230,255,0.6)'; b.fillRect(x - 1, y - 1, 1, 1);
    };
    const strut = (x0, mirror) => {
      const g = b.createLinearGradient(x0, 0, x0 + 22, 0);
      const cols = ['#161a25', '#2f3648', '#232837', '#12151e'];
      (mirror ? cols.slice().reverse() : cols).forEach((col, i) => g.addColorStop(i / 3, col));
      b.fillStyle = g; b.fillRect(x0, 0, 22, FLOOR);
      // inner lip catching light from the window
      b.fillStyle = 'rgba(140,165,220,0.22)'; b.fillRect(mirror ? x0 : x0 + 21, 10, 1, FLOOR - 10);
      // panel seams
      b.fillStyle = 'rgba(0,0,0,0.5)';
      for (let y = 70; y < FLOOR; y += 92) b.fillRect(x0 + 2, y, 18, 1);
      b.fillStyle = 'rgba(120,135,170,0.15)';
      for (let y = 71; y < FLOOR; y += 92) b.fillRect(x0 + 2, y, 18, 1);
      for (let y = 32; y < FLOOR; y += 46) bolt(x0 + 11, y);
      // cable bundle on the inside of the strut
      const cx = mirror ? x0 - 3 : x0 + 22;
      ['#3b2a2a', '#22324a', '#2c3a2a'].forEach((col, i) => {
        b.strokeStyle = col; b.lineWidth = 2;
        b.beginPath(); b.moveTo(cx + (mirror ? -i * 2 : i * 2), 120);
        b.lineTo(cx + (mirror ? -i * 2 : i * 2), 300); b.stroke();
      });
      b.fillStyle = '#3c4458';
      for (let y = 140; y < 300; y += 52) b.fillRect(mirror ? cx - 6 : cx - 1, y, 8, 4);
      // warning sticker
      const sx = x0 + 3, sy = 214;
      b.fillStyle = 'rgba(200,160,40,0.7)'; b.fillRect(sx, sy, 16, 22);
      b.save(); b.beginPath(); b.rect(sx, sy, 16, 6); b.clip();
      b.fillStyle = 'rgba(20,20,20,0.8)';
      for (let k = -8; k < 20; k += 6) { b.beginPath(); b.moveTo(sx + k, sy + 6); b.lineTo(sx + k + 3, sy); b.lineTo(sx + k + 6, sy); b.lineTo(sx + k + 3, sy + 6); b.fill(); }
      b.restore();
      b.fillStyle = 'rgba(20,20,20,0.85)'; b.font = 'bold 7px monospace'; b.textAlign = 'center';
      b.fillText('LOW', sx + 8, sy + 14); b.fillText('G', sx + 8, sy + 21);
      // status panel housing (LEDs are animated)
      b.fillStyle = '#0b0d14'; b.fillRect(x0 + 4, 380, 14, 36);
      b.strokeStyle = 'rgba(120,135,170,0.3)'; b.lineWidth = 1; b.strokeRect(x0 + 4.5, 380.5, 13, 35);
    };
    strut(0, false);
    strut(W - 22, true);
    // top beam (sits under the HUD, kept dark)
    const tb = b.createLinearGradient(0, 0, 0, 12);
    tb.addColorStop(0, '#07080d'); tb.addColorStop(1, '#1a1e2a');
    b.fillStyle = tb; b.fillRect(0, 0, W, 12);
    b.fillStyle = 'rgba(140,160,210,0.18)'; b.fillRect(22, 12, W - 44, 1);
    // diagonal corner braces with a bevel
    const brace = (x1, y1, x2, y2) => {
      b.lineCap = 'butt';
      b.strokeStyle = '#1c2130'; b.lineWidth = 12; b.beginPath(); b.moveTo(x1, y1); b.lineTo(x2, y2); b.stroke();
      b.strokeStyle = '#2a3144'; b.lineWidth = 6; b.beginPath(); b.moveTo(x1, y1); b.lineTo(x2, y2); b.stroke();
      b.strokeStyle = 'rgba(150,170,220,0.22)'; b.lineWidth = 1;
      b.beginPath(); b.moveTo(x1, y1 - 7); b.lineTo(x2 + (x2 > x1 ? -6 : 6), y2); b.stroke();
    };
    brace(22, 122, 112, 12);
    brace(W - 22, 122, W - 112, 12);
    bolt(32, 106); bolt(96, 26); bolt(W - 32, 106); bolt(W - 96, 26);

    // ---- support trusses for the two fixed ledges (from the wall struts) ----
    const truss = (xa, xb, yTop) => {
      const yBot = yTop + 22;
      b.strokeStyle = '#1e2331'; b.lineWidth = 4;
      b.beginPath(); b.moveTo(xa, yTop); b.lineTo(xb, yTop); b.moveTo(xa, yBot); b.lineTo(xb, yTop + 4); b.stroke();
      b.strokeStyle = '#323a50'; b.lineWidth = 2;
      b.beginPath(); b.moveTo(xa, yTop); b.lineTo(xb, yTop); b.moveTo(xa, yBot); b.lineTo(xb, yTop + 4); b.stroke();
      b.strokeStyle = 'rgba(70,80,105,0.9)'; b.lineWidth = 1.5; b.beginPath();
      const n = 5;
      for (let i = 0; i <= n; i++) {
        const x = xa + (xb - xa) * i / n, yb = yBot + (yTop + 4 - yBot) * i / n;
        if (i % 2) { b.moveTo(x, yTop); b.lineTo(x, yb); } else { b.moveTo(x, yb); b.lineTo(x + (xb - xa) / n, yTop); }
      }
      b.stroke();
    };
    truss(22, 118, 359);
    truss(W - 22, W - 118, 359);

    // ---- baseboard under the window (vent glow is animated) ----
    b.fillStyle = '#151924'; b.fillRect(22, FLOOR - 10, W - 44, 10);
    b.fillStyle = 'rgba(140,160,210,0.25)'; b.fillRect(22, FLOOR - 10, W - 44, 1);
    b.fillStyle = '#07080d';
    for (let x = 40; x < W - 40; x += 24) b.fillRect(x, FLOOR - 6, 14, 2);

    // ---- deck ----
    const deck = b.createLinearGradient(0, FLOOR, 0, H);
    deck.addColorStop(0, '#2d3446'); deck.addColorStop(0.12, '#1e2331'); deck.addColorStop(1, '#0b0d14');
    b.fillStyle = deck; b.fillRect(0, FLOOR, W, H - FLOOR);
    // walking edge: bright lip and a dark groove
    b.fillStyle = '#5a6584'; b.fillRect(0, FLOOR, W, 1);
    b.fillStyle = '#3a4258'; b.fillRect(0, FLOOR + 1, W, 2);
    b.fillStyle = 'rgba(0,0,0,0.6)'; b.fillRect(0, FLOOR + 7, W, 1);
    // plates with bevels
    for (let x = 0; x < W; x += 80) {
      b.fillStyle = 'rgba(0,0,0,0.55)'; b.fillRect(x, FLOOR + 8, 2, H - FLOOR);
      b.fillStyle = 'rgba(130,145,185,0.12)'; b.fillRect(x + 2, FLOOR + 8, 1, H - FLOOR);
      // diamond tread on the upper strip
      b.fillStyle = 'rgba(150,165,205,0.09)';
      for (let tx = x + 6; tx < x + 76; tx += 6) for (let ty = FLOOR + 12; ty < FLOOR + 28; ty += 5) {
        if (((tx + ty) / 1) % 2 < 1) b.fillRect(tx, ty, 3, 1); else b.fillRect(tx + 1, ty, 1, 2);
      }
      bolt(x + 8, FLOOR + 14); bolt(x + 72, FLOOR + 14);
    }
    b.fillStyle = 'rgba(0,0,0,0.5)'; b.fillRect(0, FLOOR + 30, W, 2);
    b.fillStyle = 'rgba(120,135,175,0.1)'; b.fillRect(0, FLOOR + 32, W, 1);
    // scuffs and boot marks
    for (let i = 0; i < 40; i++) {
      const x = rnd() * W, y = FLOOR + 10 + rnd() * 18, l = 4 + rnd() * 14;
      b.strokeStyle = `rgba(${rnd() < 0.5 ? '0,0,0' : '170,185,220'},${(0.06 + rnd() * 0.08).toFixed(3)})`;
      b.lineWidth = 1; b.beginPath(); b.moveTo(x, y); b.lineTo(x + l, y + (rnd() - 0.5) * 3); b.stroke();
    }
    // hazard stripes near the walls
    b.save();
    b.beginPath(); b.rect(0, FLOOR + 36, 102, 10); b.rect(W - 102, FLOOR + 36, 102, 10); b.clip();
    b.fillStyle = 'rgba(205,165,40,0.6)'; b.fillRect(0, FLOOR + 36, W, 10);
    b.fillStyle = 'rgba(15,15,18,0.85)';
    for (let x = -20; x < W + 20; x += 16) { b.beginPath(); b.moveTo(x, FLOOR + 46); b.lineTo(x + 8, FLOOR + 36); b.lineTo(x + 14, FLOOR + 36); b.lineTo(x + 6, FLOOR + 46); b.fill(); }
    b.restore();
    b.strokeStyle = 'rgba(0,0,0,0.5)'; b.lineWidth = 1;
    b.strokeRect(0.5, FLOOR + 35.5, 102, 11); b.strokeRect(W - 102.5, FLOOR + 35.5, 102, 11);
    // floor grates (glow below is animated)
    for (const gx of [320, 560]) {
      b.fillStyle = '#07080d'; b.fillRect(gx, FLOOR + 36, 80, 12);
      b.fillStyle = '#2a3043';
      for (let k = 2; k < 80; k += 6) b.fillRect(gx + k, FLOOR + 36, 2, 12);
      b.strokeStyle = 'rgba(140,160,210,0.25)'; b.strokeRect(gx + 0.5, FLOOR + 36.5, 79, 11);
    }
    // painted spawn markers and deck label
    b.strokeStyle = 'rgba(120,170,255,0.18)'; b.lineWidth = 2;
    for (const sx of [230, 730]) {
      b.beginPath(); b.moveTo(sx - 22, FLOOR + 22); b.lineTo(sx - 12, FLOOR + 16); b.lineTo(sx - 2, FLOOR + 22); b.stroke();
      b.beginPath(); b.moveTo(sx + 2, FLOOR + 22); b.lineTo(sx + 12, FLOOR + 16); b.lineTo(sx + 22, FLOOR + 22); b.stroke();
    }
    b.fillStyle = 'rgba(150,170,220,0.32)';
    b.font = 'bold 11px monospace'; b.textAlign = 'center';
    b.fillText('DOCK 07   LOW-G ZONE   0.6 G', W / 2, FLOOR + 61);
    b.fillStyle = 'rgba(150,170,220,0.18)'; b.font = '9px monospace';
    b.fillText('BAY A', 160, FLOOR + 61); b.fillText('BAY B', W - 160, FLOOR + 61);
    b.textAlign = 'left';
    return c;
  }

  // ---------- platform sprites ----------
  function buildPlatform(w, h, moving) {
    const pad = 4, c = canvas(w + pad * 2, h + 14 + pad);
    const b = c.getContext('2d');
    const x = pad, y = pad;
    // soft contact shadow under the body
    b.fillStyle = 'rgba(0,0,0,0.35)'; b.fillRect(x + 4, y + h, w - 8, 3);
    const g = b.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#68739a'); g.addColorStop(0.18, '#46506b'); g.addColorStop(0.6, '#2c3346'); g.addColorStop(1, '#1a1e2b');
    b.fillStyle = g; b.fillRect(x, y, w, h);
    // walkable top: bright lip with grip ticks
    b.fillStyle = '#a0abcc'; b.fillRect(x, y, w, 1);
    b.fillStyle = '#727e9f'; b.fillRect(x, y + 1, w, 1);
    b.fillStyle = 'rgba(20,24,34,0.6)';
    for (let k = x + 6; k < x + w - 6; k += 7) b.fillRect(k, y + 1, 3, 1);
    // panel seams and bolts on the front face
    for (let sx = x + 30; sx < x + w - 10; sx += 30) {
      b.fillStyle = 'rgba(0,0,0,0.45)'; b.fillRect(sx, y + 4, 1, h - 5);
      b.fillStyle = 'rgba(160,175,215,0.15)'; b.fillRect(sx + 1, y + 4, 1, h - 5);
    }
    // hazard stripes on the front corners
    b.save();
    b.beginPath(); b.rect(x, y + 4, 14, h - 6); b.rect(x + w - 14, y + 4, 14, h - 6); b.clip();
    b.fillStyle = moving ? 'rgba(210,170,45,0.7)' : 'rgba(150,170,210,0.35)'; b.fillRect(x, y, w, h);
    b.fillStyle = 'rgba(15,15,18,0.85)';
    for (let k = -10; k < w + 10; k += 8) { b.beginPath(); b.moveTo(x + k, y + h); b.lineTo(x + k + 6, y + 2); b.lineTo(x + k + 10, y + 2); b.lineTo(x + k + 4, y + h); b.fill(); }
    b.restore();
    // underside hardware
    b.fillStyle = '#2b3245';
    if (moving) {
      for (const nx of [x + 22, x + w - 22]) { b.fillRect(nx - 9, y + h, 18, 4); b.fillStyle = '#4b5470'; b.fillRect(nx - 6, y + h + 4, 12, 3); b.fillStyle = '#2b3245'; }
      b.fillRect(x + w / 2 - 14, y + h, 28, 3);
    } else {
      b.fillRect(x + w / 2 - 10, y + h, 20, 4);
      b.fillRect(x + 6, y + h, 10, 3); b.fillRect(x + w - 16, y + h, 10, 3);
    }
    return c;
  }
  let spriteFixed = null, spriteMoving = null;

  function drawPlatform(ctx, p, t, moving) {
    const { x, y, w, h } = p;
    const spr = moving ? spriteMoving : spriteFixed;
    if (moving) {
      // thrusters: tilt the plume against the direction of travel
      const vel = Math.cos((driftT / DRIFT_PERIOD) * TAU); // -1..1
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 2; i++) {
        const nx = x + (i ? w - 22 : 22), ny = y + h + 7;
        const f = flick(t, i * 3.1 + x * 0.01);
        const len = 20 + 14 * f;
        const lean = -vel * 7;
        const go = ctx.createLinearGradient(0, ny, 0, ny + len);
        go.addColorStop(0, 'rgba(90,170,255,0.55)'); go.addColorStop(1, 'rgba(40,90,255,0)');
        ctx.fillStyle = go;
        ctx.beginPath(); ctx.moveTo(nx - 7, ny); ctx.quadraticCurveTo(nx - 6 + lean * 0.5, ny + len * 0.6, nx + lean, ny + len); ctx.quadraticCurveTo(nx + 6 + lean * 0.5, ny + len * 0.6, nx + 7, ny); ctx.closePath(); ctx.fill();
        ctx.fillStyle = `rgba(225,240,255,${(0.55 + 0.3 * f).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(nx - 3, ny); ctx.lineTo(nx + lean * 0.35, ny + len * 0.42); ctx.lineTo(nx + 3, ny); ctx.closePath(); ctx.fill();
        // shock diamonds
        ctx.fillStyle = 'rgba(160,210,255,0.35)';
        ctx.fillRect(nx - 1.5 + lean * 0.3, ny + len * 0.55, 3, 2);
      }
      ctx.globalCompositeOperation = 'source-over';
      // heat shimmer specks drifting down
      for (let k = 0; k < 6; k++) {
        const ph = (t * 0.9 + k / 6) % 1;
        const nx = x + (k % 2 ? w - 22 : 22) + Math.sin(k * 7 + t * 3) * 5;
        ctx.fillStyle = `rgba(150,200,255,${(0.35 * (1 - ph)).toFixed(3)})`;
        ctx.fillRect(nx, y + h + 34 + ph * 40, 1.5, 1.5);
      }
    } else {
      // magnetic hover pad: faint pulsing glow under the centre
      const a = 0.12 + 0.06 * Math.sin(t * 2 + x);
      const gp = ctx.createRadialGradient(x + w / 2, y + h + 6, 1, x + w / 2, y + h + 6, 22);
      gp.addColorStop(0, `rgba(110,200,255,${a.toFixed(3)})`); gp.addColorStop(1, 'rgba(110,200,255,0)');
      ctx.fillStyle = gp; ctx.fillRect(x + w / 2 - 22, y + h - 16, 44, 44);
    }
    if (spr) ctx.drawImage(spr, x - 4, y - 4);
    // chasing strip of lights along the front face
    const n = Math.floor((w - 40) / 12);
    for (let i = 0; i < n; i++) {
      const lx = x + 20 + i * 12 + 4;
      const on = 0.5 + 0.5 * Math.sin(t * 4 - i * 0.8 + (moving ? 0 : x));
      ctx.fillStyle = moving ? `rgba(255,205,90,${(0.15 + 0.6 * on * on).toFixed(3)})` : `rgba(120,210,255,${(0.12 + 0.5 * on * on).toFixed(3)})`;
      ctx.fillRect(lx, y + h - 5, 4, 2);
    }
    // corner beacons
    const blink = Math.sin(t * 3 + x * 0.01) > 0.2;
    ctx.fillStyle = blink ? (moving ? '#ffcf5a' : '#7fd6ff') : 'rgba(70,80,100,0.9)';
    ctx.fillRect(x + 2, y + 3, 3, 3); ctx.fillRect(x + w - 5, y + 3, 3, 3);
    if (blink) {
      ctx.fillStyle = moving ? 'rgba(255,207,90,0.18)' : 'rgba(127,214,255,0.18)';
      ctx.fillRect(x, y + 1, 7, 7); ctx.fillRect(x + w - 7, y + 1, 7, 7);
    }
  }

  // ---------- obstacle sprites ----------
  function buildContainer(left) {
    const w = 80, h = 80, c = canvas(w, h), b = c.getContext('2d');
    const base = left ? ['#6a3527', '#4e271d', '#331912'] : ['#23435f', '#1a3249', '#102030'];
    const g = b.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, base[1]); g.addColorStop(0.5, base[0]); g.addColorStop(1, base[2]);
    b.fillStyle = g; b.fillRect(0, 0, w, h);
    // corrugation: light ridge + dark valley
    for (let x = 7; x < w - 6; x += 7) {
      b.fillStyle = 'rgba(255,255,255,0.07)'; b.fillRect(x, 7, 2, h - 14);
      b.fillStyle = 'rgba(0,0,0,0.3)'; b.fillRect(x + 2, 7, 2, h - 14);
    }
    // top and bottom rails
    b.fillStyle = left ? '#8d4936' : '#3e6a8f'; b.fillRect(0, 0, w, 5); b.fillRect(0, h - 6, w, 6);
    b.fillStyle = 'rgba(255,255,255,0.18)'; b.fillRect(0, 0, w, 1);
    b.fillStyle = 'rgba(0,0,0,0.4)'; b.fillRect(0, 5, w, 1); b.fillRect(0, h - 7, w, 1);
    // corner castings
    b.fillStyle = '#2a2d36';
    [[0, 0], [w - 9, 0], [0, h - 9], [w - 9, h - 9]].forEach(([x, y]) => {
      b.fillRect(x, y, 9, 9); b.fillStyle = '#0c0d12'; b.fillRect(x + 3, y + 3, 3, 3); b.fillStyle = '#2a2d36';
    });
    // door locking bars on the side facing the arena
    const dx = left ? w - 22 : 10;
    b.strokeStyle = 'rgba(30,30,36,0.9)'; b.lineWidth = 3;
    b.beginPath(); b.moveTo(dx, 9); b.lineTo(dx, h - 9); b.moveTo(dx + 9, 9); b.lineTo(dx + 9, h - 9); b.stroke();
    b.strokeStyle = 'rgba(200,205,220,0.25)'; b.lineWidth = 1;
    b.beginPath(); b.moveTo(dx - 1, 9); b.lineTo(dx - 1, h - 9); b.moveTo(dx + 8, 9); b.lineTo(dx + 8, h - 9); b.stroke();
    b.fillStyle = '#3a3d48'; b.fillRect(dx - 3, 36, 15, 6);
    b.fillStyle = 'rgba(220,180,60,0.8)'; b.fillRect(dx + 2, 37, 5, 4);
    // label plate
    const lx = left ? 10 : 34;
    b.fillStyle = 'rgba(215,175,45,0.85)'; b.fillRect(lx, 16, 34, 13);
    b.fillStyle = 'rgba(0,0,0,0.25)'; b.fillRect(lx, 28, 34, 1);
    b.fillStyle = '#16161a'; b.font = 'bold 9px monospace'; b.textAlign = 'center';
    b.fillText(left ? 'C-07A' : 'C-07B', lx + 17, 26);
    b.fillStyle = 'rgba(230,230,240,0.35)'; b.font = '7px monospace';
    b.fillText('MAX 24T', lx + 17, 40);
    b.fillText('O2 SUP', lx + 17, 49);
    b.textAlign = 'left';
    // scratches and grime
    for (let i = 0; i < 14; i++) {
      const x = 4 + rnd() * (w - 8), y = 8 + rnd() * (h - 16);
      b.strokeStyle = `rgba(${rnd() < 0.6 ? '230,220,210' : '0,0,0'},${(0.08 + rnd() * 0.1).toFixed(3)})`;
      b.lineWidth = 1; b.beginPath(); b.moveTo(x, y); b.lineTo(x + (rnd() - 0.5) * 12, y + (rnd() - 0.3) * 6); b.stroke();
    }
    const grime = b.createLinearGradient(0, h - 30, 0, h);
    grime.addColorStop(0, 'rgba(0,0,0,0)'); grime.addColorStop(1, 'rgba(0,0,0,0.35)');
    b.fillStyle = grime; b.fillRect(0, h - 30, w, 30);
    return c;
  }

  function buildConsole() {
    const pad = 6, w = 70, h = 52, c = canvas(w + pad * 2, h + pad), b = c.getContext('2d');
    const x = pad, y = pad;
    // body
    const g = b.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#1d2230'); g.addColorStop(0.5, '#2c3346'); g.addColorStop(1, '#181c28');
    b.fillStyle = g; b.fillRect(x, y + 10, w, h - 10);
    // sloped control deck
    b.fillStyle = '#3c4560';
    b.beginPath(); b.moveTo(x - 4, y + 12); b.lineTo(x + 8, y); b.lineTo(x + w - 8, y); b.lineTo(x + w + 4, y + 12); b.closePath(); b.fill();
    b.fillStyle = '#9aa6c8'; b.fillRect(x + 8, y, w - 16, 1);
    b.fillStyle = 'rgba(0,0,0,0.4)'; b.fillRect(x - 4, y + 12, w + 8, 1);
    // screen bezel
    b.fillStyle = '#05080c'; b.fillRect(x + 8, y + 16, w - 16, 20);
    b.strokeStyle = 'rgba(150,170,210,0.3)'; b.lineWidth = 1; b.strokeRect(x + 8.5, y + 16.5, w - 17, 19);
    // keyboard rows on the sloped deck
    b.fillStyle = 'rgba(15,18,26,0.85)';
    for (let r = 0; r < 2; r++) for (let k = 0; k < 9; k++) b.fillRect(x + 6 + k * 6.6 + r * 2, y + 3 + r * 4, 4.5, 2.5);
    // side vents and a kick plate
    b.fillStyle = 'rgba(0,0,0,0.55)';
    for (let k = 0; k < 4; k++) { b.fillRect(x + 3, y + 22 + k * 5, 4, 2); b.fillRect(x + w - 7, y + 22 + k * 5, 4, 2); }
    b.fillStyle = '#121520'; b.fillRect(x, y + h - 5, w, 5);
    b.fillStyle = 'rgba(205,165,40,0.55)';
    for (let k = 2; k < w - 4; k += 8) b.fillRect(x + k, y + h - 4, 4, 3);
    // button housing
    b.fillStyle = '#10131b'; b.fillRect(x + 9, y + 38, w - 18, 9);
    return c;
  }

  function buildDebris() {
    const w = 44, h = 40, pad = 8, c = canvas(w + pad * 2, h + pad * 2), b = c.getContext('2d');
    const x = pad, y = pad;
    const g = b.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#79809a'); g.addColorStop(0.5, '#4c5266'); g.addColorStop(1, '#262a36');
    b.fillStyle = g; b.fillRect(x, y, w, h);
    // torn hull corner (top-right) with a jagged edge
    b.fillStyle = '#1a1d27';
    b.beginPath(); b.moveTo(x + w - 14, y); b.lineTo(x + w - 10, y + 4); b.lineTo(x + w - 6, y + 2); b.lineTo(x + w - 3, y + 8); b.lineTo(x + w, y + 9); b.lineTo(x + w, y); b.closePath(); b.fill();
    // frame and X bracing
    b.strokeStyle = '#a7b0cc'; b.lineWidth = 1.5; b.strokeRect(x + 1, y + 1, w - 2, h - 2);
    b.strokeStyle = 'rgba(0,0,0,0.5)'; b.lineWidth = 3;
    b.beginPath(); b.moveTo(x + 4, y + 4); b.lineTo(x + w - 4, y + h - 4); b.moveTo(x + w - 4, y + 4); b.lineTo(x + 4, y + h - 4); b.stroke();
    b.strokeStyle = 'rgba(190,200,230,0.25)'; b.lineWidth = 1;
    b.beginPath(); b.moveTo(x + 4, y + 3); b.lineTo(x + w - 4, y + h - 5); b.stroke();
    // rivets
    for (const [rx, ry] of [[4, 4], [w - 5, h - 5], [4, h - 5], [w / 2, 4]]) {
      b.fillStyle = '#20232e'; b.fillRect(x + rx - 1, y + ry - 1, 3, 3);
      b.fillStyle = 'rgba(220,230,255,0.5)'; b.fillRect(x + rx - 1, y + ry - 1, 1, 1);
    }
    // scorch mark and stencil
    const sc = b.createRadialGradient(x + 12, y + h - 10, 1, x + 12, y + h - 10, 14);
    sc.addColorStop(0, 'rgba(10,8,8,0.6)'); sc.addColorStop(1, 'rgba(10,8,8,0)');
    b.fillStyle = sc; b.fillRect(x, y + h - 26, 28, 26);
    b.fillStyle = 'rgba(230,200,120,0.4)'; b.font = 'bold 7px monospace'; b.fillText('07-B', x + w - 22, y + h - 4);
    return c;
  }

  let sprites = null;
  function ensureSprites() {
    if (sprites) return;
    sprites = {
      contL: buildContainer(true), contR: buildContainer(false),
      console: buildConsole(), debris: buildDebris(),
    };
    spriteFixed = buildPlatform(170, 14, false);
    spriteMoving = buildPlatform(150, 14, true);
  }

  function drawObstacle(ctx, o, t) {
    const { x, y, w, h } = o;
    if (o.kind === 'container') {
      const left = x < W / 2;
      ctx.drawImage(left ? sprites.contL : sprites.contR, x, y, w, h);
      // magnetic floor clamps with a slow status blink
      const on = Math.sin(t * 1.6 + (left ? 0 : 1.3)) > 0.3;
      ctx.fillStyle = '#20232c'; ctx.fillRect(x + 6, y + h - 3, 14, 3); ctx.fillRect(x + w - 20, y + h - 3, 14, 3);
      ctx.fillStyle = on ? '#6dffb0' : 'rgba(60,90,80,0.9)';
      ctx.fillRect(x + 12, y + h - 2, 2, 1); ctx.fillRect(x + w - 14, y + h - 2, 2, 1);
      // a slow glint sliding across the top rail
      const gx = ((t * 40 + (left ? 0 : 230)) % 400) - 60;
      if (gx > 0 && gx < w - 10) { ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x + gx, y, 10, 1); }
    } else if (o.kind === 'console') {
      ctx.drawImage(sprites.console, x - 6, y - 6);
      // screen: scrolling readout and a live waveform
      const sx = x + 9, sy = y + 11, sw = w - 18, sh = 18;
      ctx.save();
      ctx.beginPath(); ctx.rect(sx, sy, sw, sh); ctx.clip();
      ctx.fillStyle = 'rgba(30,90,80,0.35)'; ctx.fillRect(sx, sy, sw, sh);
      ctx.fillStyle = 'rgba(110,240,190,0.5)';
      const scroll = (t * 6) % 4;
      for (let r = 0; r < 5; r++) {
        const len = 6 + ((r * 7 + Math.floor(t * 1.5)) % 5) * 5;
        ctx.fillRect(sx + 2, sy + 2 + r * 4 - scroll, Math.min(len, 22), 1);
      }
      ctx.strokeStyle = 'rgba(120,255,200,0.85)'; ctx.lineWidth = 1.2; ctx.beginPath();
      for (let i = 0; i <= 26; i += 2) {
        const yy = sy + 9 + Math.sin(t * 6 + i * 0.5) * 4 * Math.sin(i * 0.15 + t);
        i ? ctx.lineTo(sx + 26 + i, yy) : ctx.moveTo(sx + 26, yy);
      }
      ctx.stroke();
      // scanline sweep
      const scan = sy + ((t * 14) % sh);
      ctx.fillStyle = 'rgba(160,255,220,0.12)'; ctx.fillRect(sx, scan, sw, 2);
      ctx.restore();
      // buttons
      const cols = ['#ff5a5a', '#ffcf5a', '#5affb0', '#5ab4ff'];
      for (let i = 0; i < 4; i++) {
        const lit = Math.sin(t * 4 + i * 1.7) > 0;
        ctx.fillStyle = lit ? cols[i] : 'rgba(70,80,100,0.9)';
        ctx.fillRect(x + 12 + i * 13, y + 40, 6, 4);
        if (lit) { ctx.globalAlpha = 0.25; ctx.fillRect(x + 11 + i * 13, y + 39, 8, 6); ctx.globalAlpha = 1; }
      }
      // tiny hologram above the deck: a rotating wireframe planet, kept faint
      const hx = x + w / 2, hy = y - 16;
      ctx.globalCompositeOperation = 'lighter';
      const beam = ctx.createLinearGradient(0, y - 2, 0, hy - 10);
      beam.addColorStop(0, 'rgba(90,220,255,0.16)'); beam.addColorStop(1, 'rgba(90,220,255,0)');
      ctx.fillStyle = beam;
      ctx.beginPath(); ctx.moveTo(hx - 4, y); ctx.lineTo(hx + 4, y); ctx.lineTo(hx + 14, hy - 10); ctx.lineTo(hx - 14, hy - 10); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = `rgba(120,230,255,${(0.32 + 0.06 * Math.sin(t * 9)).toFixed(3)})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(hx, hy, 8, 0, TAU); ctx.stroke();
      const sq = Math.cos(t * 1.4);
      ctx.beginPath(); ctx.ellipse(hx, hy, Math.abs(sq) * 8 + 0.01, 8, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(hx, hy, 8, 2.5, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(hx, hy, 13, 3, -0.3, 0, TAU); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      // cable from the console down into the deck
      ctx.strokeStyle = '#11141c'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + w - 4, y + h - 10); ctx.quadraticCurveTo(x + w + 12, y + h - 6, x + w + 10, y + h + 2); ctx.stroke();
    } else {
      // floating debris crate; cracks, sparks and inner glow grow as it takes damage
      const dmg = o.hp != null ? clamp01(1 - Math.max(0, o.hp) / DEBRIS_HP) : 0;
      const bob = Math.sin(t * 1.3) * 0.8; // sub-pixel visual bob, hitbox stays put
      // reflected glow on nothing: a faint "field" ring under it
      ctx.fillStyle = 'rgba(120,200,255,0.10)';
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + h + 9, w * 0.6, 4, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(120,200,255,${(0.12 + 0.08 * Math.sin(t * 3)).toFixed(3)})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + h + 9, w * 0.7, 5, 0, 0, TAU); ctx.stroke();
      ctx.drawImage(sprites.debris, x - 8, y - 8 + bob);
      // dangling wires swaying in zero-g
      ctx.lineWidth = 1.2;
      [['#d0603a', 8, 0], ['#3a8ad0', 14, 1.7]].forEach(([col, len, ph]) => {
        const ax = x + w - 6, ay = y + 6 + bob;
        const sw = Math.sin(t * 1.7 + ph) * 4;
        ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(ax + 6 + sw * 0.5, ay - 2, ax + 8 + sw, ay - len * 0.6); ctx.stroke();
      });
      if (dmg > 0.01) {
        // inner glow leaking through the cracks
        if (dmg > 0.35) {
          ctx.globalCompositeOperation = 'lighter';
          const gl = ctx.createRadialGradient(x + w * 0.45, y + h * 0.5 + bob, 1, x + w * 0.45, y + h * 0.5 + bob, 18);
          gl.addColorStop(0, `rgba(255,140,60,${(0.25 * dmg * flick(t, 2)).toFixed(3)})`); gl.addColorStop(1, 'rgba(255,140,60,0)');
          ctx.fillStyle = gl; ctx.fillRect(x - 6, y - 6 + bob, w + 12, h + 12);
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.strokeStyle = 'rgba(255,175,95,0.9)'; ctx.lineWidth = 1.4; ctx.beginPath();
        ctx.moveTo(x + w * 0.2, y + bob); ctx.lineTo(x + w * 0.45, y + h * 0.4 + bob); ctx.lineTo(x + w * 0.3, y + h * 0.7 + bob);
        if (dmg > 0.4) { ctx.moveTo(x + w, y + h * 0.3 + bob); ctx.lineTo(x + w * 0.55, y + h * 0.5 + bob); ctx.lineTo(x + w * 0.7, y + h + bob); }
        if (dmg > 0.7) { ctx.moveTo(x, y + h * 0.55 + bob); ctx.lineTo(x + w * 0.3, y + h * 0.7 + bob); ctx.moveTo(x + w * 0.45, y + h * 0.4 + bob); ctx.lineTo(x + w * 0.55, y + h * 0.5 + bob); }
        ctx.stroke();
        // short spark bursts from the torn corner, on a deterministic rhythm
        const cyc = (t * (1 + dmg * 2)) % 1;
        if (cyc < 0.18) {
          const k = Math.floor(t * (1 + dmg * 2));
          ctx.strokeStyle = 'rgba(255,230,150,0.9)'; ctx.lineWidth = 1; ctx.beginPath();
          for (let s = 0; s < 4; s++) {
            const a = -0.6 + Math.sin(k * 12.9898 + s * 4.1) * 0.9, r = 4 + cyc * 50 + s * 2;
            const ox = x + w - 6, oy = y + 4 + bob;
            ctx.moveTo(ox + Math.cos(a) * (r - 4), oy + Math.sin(a) * (r - 4)); ctx.lineTo(ox + Math.cos(a) * r, oy + Math.sin(a) * r);
          }
          ctx.stroke();
        }
      }
      // orbiting bits sell the zero-g
      for (let i = 0; i < 4; i++) {
        const a = t * (0.8 + i * 0.3) + i * 1.6 + x;
        const ox = x + w / 2 + Math.cos(a) * (w * 0.78), oy = y + h / 2 + Math.sin(a) * (h * 0.52) + bob;
        const behind = Math.sin(a) < 0;
        ctx.fillStyle = behind ? 'rgba(110,118,140,0.5)' : 'rgba(175,185,210,0.85)';
        ctx.save(); ctx.translate(ox, oy); ctx.rotate(t * (1.5 + i)); ctx.fillRect(-2, -1.5, 4 - (i % 2), 3); ctx.restore();
      }
    }
  }

  // ---------- animated sky bits ----------
  function drawSky(ctx, t) {
    // slow parallax star drift
    const off = (t * 6) % W;
    for (const s of farStars) {
      let x = s.x - off; if (x < 0) x += W;
      ctx.fillStyle = `rgba(180,200,255,${s.a})`;
      ctx.fillRect(x, s.y, 1, 1);
    }
    // twinkling stars
    for (const s of twinkles) {
      const a = 0.2 + 0.5 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
      ctx.fillStyle = s.warm ? `rgba(255,232,205,${a.toFixed(3)})` : `rgba(235,240,255,${a.toFixed(3)})`;
      ctx.fillRect(s.x - s.r, s.y - 0.5, s.r * 2 + 1, 1);
      ctx.fillRect(s.x - 0.5, s.y - s.r, 1, s.r * 2 + 1);
    }
    // bright stars with diffraction spikes
    ctx.globalCompositeOperation = 'lighter';
    for (const s of bright) {
      const p = 0.75 + 0.25 * Math.sin(t * 1.3 + s.ph);
      const L = s.s * (1.6 + 0.4 * p);
      ctx.fillStyle = `rgba(${s.col},${(0.10 * p).toFixed(3)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.s * 0.9, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(${s.col},${(0.38 * p).toFixed(3)})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(s.x - L, s.y + 0.5); ctx.lineTo(s.x + L, s.y + 0.5); ctx.moveTo(s.x + 0.5, s.y - L); ctx.lineTo(s.x + 0.5, s.y + L); ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${(0.75 * p).toFixed(3)})`; ctx.fillRect(s.x - 0.5, s.y - 0.5, 2, 2);
    }
    // shooting star roughly every 17 s, from a different spot each time
    const cyc = 17, k = Math.floor(t / cyc), u = (t % cyc) / 0.9;
    if (u < 1) {
      const sx = 120 + ((k * 397) % 620), sy = 40 + ((k * 151) % 120);
      const hx = sx + u * 220, hy = sy + u * 80;
      const tg = ctx.createLinearGradient(hx - 60, hy - 22, hx, hy);
      tg.addColorStop(0, 'rgba(200,220,255,0)'); tg.addColorStop(1, `rgba(230,240,255,${(0.7 * (1 - u)).toFixed(3)})`);
      ctx.strokeStyle = tg; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(hx - 60, hy - 22); ctx.lineTo(hx, hy); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    // distant ring station turning slowly, with running lights
    const dx = 352, dy = 142;
    ctx.save();
    ctx.translate(dx, dy);
    ctx.strokeStyle = 'rgba(110,125,160,0.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, 0, 18, 6, 0, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(110,125,160,0.3)';
    for (let i = 0; i < 4; i++) {
      const a = t * 0.25 + i * Math.PI / 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 18, Math.sin(a) * 6); ctx.stroke();
    }
    ctx.fillStyle = 'rgba(130,145,180,0.6)'; ctx.fillRect(-2, -9, 4, 18);
    for (let i = 0; i < 6; i++) {
      const a = t * 0.25 + i * TAU / 6;
      const lit = Math.sin(t * 2 + i) > 0.6;
      if (!lit) continue;
      ctx.fillStyle = i % 2 ? 'rgba(255,120,110,0.8)' : 'rgba(160,220,255,0.8)';
      ctx.fillRect(Math.cos(a) * 18 - 0.5, Math.sin(a) * 6 - 0.5, 1.5, 1.5);
    }
    ctx.restore();

    // a satellite crossing the upper sky every ~40 s
    const sp = (t % 40) / 40;
    const sx = -60 + sp * (W + 120), sy = 105 + Math.sin(sp * 3) * 12;
    ctx.save();
    ctx.translate(sx, sy); ctx.rotate(t * 0.3);
    ctx.fillStyle = '#5d6683'; ctx.fillRect(-5, -4, 10, 8);
    ctx.fillStyle = '#8890aa'; ctx.fillRect(-5, -4, 10, 1);
    for (const side of [-1, 1]) {
      const px = side < 0 ? -20 : 7;
      ctx.fillStyle = '#26467a'; ctx.fillRect(px, -3, 13, 6);
      ctx.fillStyle = 'rgba(140,180,255,0.35)';
      for (let c = 1; c < 13; c += 3) ctx.fillRect(px + c, -3, 1, 6);
      ctx.fillRect(px, -0.5, 13, 1);
      ctx.fillStyle = '#4a5068'; ctx.fillRect(side < 0 ? -7 : 5, -0.5, 2, 1);
    }
    ctx.strokeStyle = 'rgba(160,170,200,0.7)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, -9); ctx.stroke();
    // sun glint off the panels now and then
    const glint = Math.max(0, Math.sin(t * 0.3 * 2 + 1.2));
    if (glint > 0.95) { ctx.fillStyle = `rgba(255,255,255,${((glint - 0.95) * 14).toFixed(3)})`; ctx.fillRect(-14, -2, 6, 4); }
    ctx.restore();
    if (Math.sin(t * 5) > 0.6) { ctx.fillStyle = '#ff6a6a'; ctx.fillRect(sx - 1, sy - 11, 2, 2); }
  }

  // ---------- animated station bits ----------
  function drawStation(ctx, t) {
    // strut status LEDs
    for (const x0 of [4, W - 18]) {
      for (let i = 0; i < 5; i++) {
        const v = Math.sin(t * (1.1 + i * 0.37) + i * 2 + x0);
        const col = i === 4 ? (v > 0.7 ? '255,90,90' : '90,40,40') : v > -0.2 ? '110,255,170' : '40,80,60';
        ctx.fillStyle = `rgb(${col})`;
        ctx.fillRect(x0 + 4, 384 + i * 6, 6, 2);
      }
    }
    // baseboard vents breathing cool light
    const vb = 0.12 + 0.06 * Math.sin(t * 1.4);
    ctx.fillStyle = `rgba(90,170,255,${vb.toFixed(3)})`;
    for (let x = 40; x < W - 40; x += 24) ctx.fillRect(x, FLOOR - 6, 14, 2);
    // floor grates: warm glow from the deck below, flickering slightly
    for (const [gx, k] of [[320, 0], [560, 1]]) {
      const a = 0.18 + 0.08 * flick(t * 0.25, k * 5);
      ctx.fillStyle = `rgba(255,150,70,${a.toFixed(3)})`;
      for (let i = 4; i < 80; i += 6) ctx.fillRect(gx + i, FLOOR + 38, 2, 8);
    }
    // deck running lights: a chase toward the middle from both walls
    for (let i = 0; i < 12; i++) {
      const lx = 40 + i * 80;
      const d = Math.abs(lx - W / 2) / 80;
      const a = 0.18 + 0.42 * Math.pow(Math.max(0, Math.sin(t * 2.2 + d * 0.9)), 3);
      ctx.fillStyle = `rgba(90,190,255,${a.toFixed(3)})`;
      ctx.fillRect(lx - 10, FLOOR + 3, 20, 2);
      ctx.fillStyle = `rgba(90,190,255,${(a * 0.25).toFixed(3)})`;
      ctx.fillRect(lx - 14, FLOOR + 2, 28, 4);
    }
    // soft light pools on the deck under fighters near the floor
    for (const f of seen) {
      const lift = FLOOR - f.y;
      if (!(lift >= -2 && lift < 140)) continue;
      const a = 0.16 * (1 - lift / 140);
      const r = 46 + lift * 0.25;
      ctx.save();
      ctx.translate(f.x, FLOOR + 4); ctx.scale(1, 0.18);
      const gp = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
      gp.addColorStop(0, `rgba(150,190,255,${a.toFixed(3)})`); gp.addColorStop(1, 'rgba(150,190,255,0)');
      ctx.fillStyle = gp; ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.restore();
    }
  }

  function drawDriftGuide(ctx, t) {
    // dotted path for the drifting platform, with end brackets, so its range reads at a glance
    const y = drifter.y + drifter.h + 3;
    const x0 = DRIFT_CX - DRIFT_AMP + 6, x1 = DRIFT_CX + DRIFT_AMP + drifter.w - 6;
    const march = (t * 10) % 12;
    ctx.fillStyle = 'rgba(255,205,90,0.16)';
    for (let x = x0 + march; x < x1; x += 12) ctx.fillRect(x, y, 5, 1);
    ctx.strokeStyle = 'rgba(255,205,90,0.3)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + 4, y - 4); ctx.lineTo(x0, y - 4); ctx.lineTo(x0, y + 4); ctx.lineTo(x0 + 4, y + 4);
    ctx.moveTo(x1 - 4, y - 4); ctx.lineTo(x1, y - 4); ctx.lineTo(x1, y + 4); ctx.lineTo(x1 - 4, y + 4);
    ctx.stroke();
  }

  // ---------- foreground ----------
  let vignette = null;
  function buildVignette() {
    const c = canvas(W, H), b = c.getContext('2d');
    const g = b.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 620);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,10,0.35)');
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    return c;
  }

  const arena = {
    id: 'arena07',
    name: 'Space Station',
    nameVi: 'Trạm vũ trụ',
    hint: 'Low gravity, cargo, debris',
    hintVi: 'Trọng lực thấp, thùng hàng, mảnh vỡ',
    floorY: FLOOR,
    gravityScale: 0.6,
    platforms,
    obstacles,

    drawBackground(ctx, t) {
      try {
        if (!bg) bg = buildStatic();
        ensureSprites();
        ctx.save();
        ctx.drawImage(bg, 0, 0);
        drawSky(ctx, t);
        drawStation(ctx, t);
        drawDriftGuide(ctx, t);
        drawPlatform(ctx, platforms[0], t, false);
        drawPlatform(ctx, platforms[1], t, false);
        drawPlatform(ctx, drifter, t, true);
        for (const o of arena.obstacles || obstacles) if (o && alive(o)) drawObstacle(ctx, o, t);
        ctx.restore();
      } catch (e) { /* never break the game loop */ }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    },

    drawForeground(ctx, t) {
      try {
        if (!vignette) vignette = buildVignette();
        ctx.drawImage(vignette, 0, 0);
      } catch (e) { /* ignore */ }
    },

    update(dt, fighters, game) {
      try {
        if (fighters && fighters.length) {
          seen.length = 0;
          for (const f of fighters) if (f && !f.ko) seen.push({ x: f.x, y: f.y });
        }
        if (!(dt > 0)) return;
        driftT += dt;
        drifter.x = DRIFT_CX + DRIFT_AMP * Math.sin((driftT / DRIFT_PERIOD) * Math.PI * 2);
        // occasional floating dust motes to sell the low gravity
        if (game && typeof game.particle === 'function' && Math.random() < dt * 1.5) {
          game.particle({ x: 40 + Math.random() * (W - 80), y: FLOOR - 4, vx: (Math.random() - 0.5) * 20, vy: -15 - Math.random() * 20, life: 2.2, col: 'rgba(150,190,255,0.6)', r: 2, float: true });
        }
      } catch (e) { /* ignore */ }
    },

    reset() {
      driftT = 0;
      drifter.x = DRIFT_CX;
      // engine restores hp; obstacles here never move, but keep positions pinned
      obstacles.forEach((o, i) => { o.x = OBSTACLES[i].x; o.y = OBSTACLES[i].y; });
    },
  };

  (window.STICK_ARENAS = window.STICK_ARENAS || []).push(arena);
})();
