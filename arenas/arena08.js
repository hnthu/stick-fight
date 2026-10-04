// Arena 08: Desert Pyramid (Kim tự tháp sa mạc)
// Stepped pyramid terraces, heat shimmer, and a telegraphed sandstorm that pushes fighters sideways.
// Gameplay (platforms, obstacles, storm timing and push) lives in `update`/`reset`/`pushX`;
// everything else is cosmetic and uses its own hash noise, never Math.random, so it can't disturb online sync.
(function () {
  const W = 960, H = 540, FLOOR = 470;
  const CALM_MIN = 9, CALM_MAX = 13, WARN = 2.2, STORM = 3.6;
  const PUSH_GROUND = 135, PUSH_AIR = 210, PUSH_BLOCK = 70;
  const URN_HP = 30, HALF_BODY = 16, BODY_H = 130;
  const TAU = Math.PI * 2;

  // storm state machine: 'calm' -> 'warn' -> 'storm' -> 'calm'
  const S = { phase: 'calm', t: 0, next: 6, dir: Math.random() < 0.5 ? -1 : 1, power: 0, grains: [], streaks: [] };

  let farLayer = null, nearLayer = null, vignette = null;
  const ledgeCache = {};

  // ---------- small helpers (cosmetic only) ----------
  function rng(seed) {
    let s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  // stable 0..1 noise from an integer, for per-index variation in animated bits
  function hash(n) {
    let x = Math.imul((n | 0) ^ 0x2c1b3c6d, 0x297a2d39);
    x ^= x >>> 15; x = Math.imul(x, 0x85ebca6b); x ^= x >>> 13;
    return (x >>> 0) / 4294967296;
  }
  function frac(v) { return v - Math.floor(v); }
  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  function rgba(r, g, b, a) { return 'rgba(' + r + ',' + g + ',' + b + ',' + (+a).toFixed(3) + ')'; }

  // ---------- far layer: sky, sun, distant pyramids, dunes (gets the heat shimmer) ----------
  function buildFar() {
    const c = mk(W, H), g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 410);
    sky.addColorStop(0, '#0d0a1e');
    sky.addColorStop(0.28, '#211433');
    sky.addColorStop(0.5, '#43203a');
    sky.addColorStop(0.7, '#6e3133');
    sky.addColorStop(0.86, '#93472f');
    sky.addColorStop(1, '#a85f34');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);

    // static star field, thinning toward the glow
    const r = rng(8);
    for (let i = 0; i < 140; i++) {
      const y = r() * 200, x = r() * W, big = r() < 0.08;
      g.fillStyle = r() < 0.2 ? '#cfd8ff' : '#efe2cc';
      g.globalAlpha = (0.12 + r() * 0.45) * Math.pow(1 - y / 200, 1.4);
      g.fillRect(x, y, big ? 2 : 1.2, big ? 2 : 1.2);
    }
    g.globalAlpha = 1;

    // crescent moon, high on the right, cool against the warm horizon
    g.save();
    const mg = g.createRadialGradient(812, 128, 4, 812, 128, 46);
    mg.addColorStop(0, 'rgba(210,220,255,0.12)'); mg.addColorStop(1, 'rgba(210,220,255,0)');
    g.fillStyle = mg; g.fillRect(760, 80, 110, 100);
    g.fillStyle = '#c9c2b6';
    g.beginPath(); g.arc(812, 128, 13, 0, TAU); g.fill();
    g.globalCompositeOperation = 'destination-out';
    g.beginPath(); g.arc(818, 124, 12, 0, TAU); g.fill();
    g.restore();
    // restore the sky behind the moon's cut-out
    g.save(); g.globalCompositeOperation = 'destination-over'; g.fillStyle = sky; g.fillRect(0, 0, W, H); g.restore();

    // big soft sun glow
    const sun = g.createRadialGradient(480, 336, 8, 480, 336, 260);
    sun.addColorStop(0, 'rgba(255,170,95,0.55)');
    sun.addColorStop(0.18, 'rgba(240,120,65,0.32)');
    sun.addColorStop(0.5, 'rgba(200,90,60,0.12)');
    sun.addColorStop(1, 'rgba(200,90,60,0)');
    g.fillStyle = sun; g.fillRect(0, 60, W, 400);

    // long thin clouds, lit from below by the sunset
    function cloud(cx, cy, len, th, seed) {
      const q = rng(seed);
      for (let i = 0; i < 7; i++) {
        const x = cx + (q() - 0.5) * len, y = cy + (q() - 0.5) * th * 1.4, rx = len * (0.18 + q() * 0.22), ry = th * (0.4 + q() * 0.4);
        g.fillStyle = 'rgba(70,32,52,0.55)';
        g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(232,124,92,0.32)';
        g.beginPath(); g.ellipse(x, y + ry * 0.55, rx * 0.85, ry * 0.4, 0, 0, TAU); g.fill();
      }
    }
    cloud(190, 210, 220, 10, 11);
    cloud(700, 196, 260, 9, 12);
    cloud(560, 248, 160, 6, 13);
    cloud(110, 262, 120, 5, 14);

    // the sun itself, sliced by bands of haze near the horizon
    const sd = g.createLinearGradient(0, 278, 0, 394);
    sd.addColorStop(0, '#f09a5a'); sd.addColorStop(1, '#c2523a');
    g.fillStyle = sd; g.globalAlpha = 0.82;
    g.beginPath(); g.arc(480, 336, 58, 0, TAU); g.fill();
    g.globalAlpha = 1;
    for (let i = 0; i < 6; i++) {
      const y = 330 + i * 9, hgt = 1.5 + i * 0.7;
      g.fillStyle = 'rgba(140,60,45,0.55)';
      g.fillRect(410, y, 140, hgt);
    }

    // distant pyramids: faces toward the sun catch a warm rim
    function pyr(cx, base, hw, hgt, body, steps) {
      const towardSun = cx < 480 ? 1 : -1;
      g.fillStyle = body;
      g.beginPath(); g.moveTo(cx - hw, base); g.lineTo(cx, base - hgt); g.lineTo(cx + hw, base); g.closePath(); g.fill();
      // shadow half (away from the sun)
      g.fillStyle = 'rgba(10,4,12,0.32)';
      g.beginPath(); g.moveTo(cx, base - hgt); g.lineTo(cx - towardSun * hw, base); g.lineTo(cx - towardSun * hw * 0.1, base); g.closePath(); g.fill();
      // course lines
      g.strokeStyle = 'rgba(20,8,10,0.22)'; g.lineWidth = 1;
      for (let i = 1; i < steps; i++) {
        const y = base - (hgt * i) / steps, k = 1 - i / steps;
        g.beginPath(); g.moveTo(cx - hw * k, y); g.lineTo(cx + hw * k, y); g.stroke();
      }
      // sunlit edge
      g.strokeStyle = 'rgba(255,170,110,0.45)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(cx, base - hgt); g.lineTo(cx + towardSun * hw, base); g.stroke();
    }
    pyr(110, 374, 120, 122, '#4b2a2c', 10);
    pyr(252, 380, 70, 70, '#56302e', 6);
    pyr(862, 376, 142, 142, '#47282c', 11);
    pyr(714, 384, 46, 44, '#5a3330', 4);

    // a tiny oasis far left: palms and an obelisk on the right
    function palm(x, y, s) {
      g.strokeStyle = '#2e1a1c'; g.lineWidth = 2 * s;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 4 * s, y - 14 * s, x + 2 * s, y - 26 * s); g.stroke();
      g.fillStyle = '#2e1a1c';
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.55;
        g.beginPath(); g.moveTo(x + 2 * s, y - 26 * s);
        g.quadraticCurveTo(x + 2 * s + Math.cos(a) * 10 * s, y - 30 * s + Math.sin(a) * 6 * s, x + 2 * s + Math.cos(a) * 16 * s, y - 22 * s + Math.sin(a) * 3 * s);
        g.lineTo(x + 2 * s + Math.cos(a) * 9 * s, y - 25 * s);
        g.closePath(); g.fill();
      }
    }
    palm(44, 390, 0.8); palm(60, 391, 0.65); palm(30, 392, 0.55);
    g.fillStyle = '#3e2428';
    g.beginPath(); g.moveTo(912, 392); g.lineTo(915, 342); g.lineTo(918, 336); g.lineTo(921, 342); g.lineTo(924, 392); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,170,110,0.35)'; g.fillRect(915, 342, 1.2, 50);

    // dunes, back to front, each with a lit crest
    function dune(base, amp, col, seed, crest) {
      const q = rng(seed);
      const ph = q() * 6, f = 0.004 + q() * 0.004;
      const yAt = x => base - Math.sin(x * f + ph) * amp - Math.sin(x * f * 2.7 + ph) * amp * 0.3;
      g.fillStyle = col;
      g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 6) g.lineTo(x, yAt(x));
      g.lineTo(W, H); g.closePath(); g.fill();
      g.strokeStyle = crest; g.lineWidth = 1.2;
      g.beginPath();
      for (let x = 0; x <= W; x += 6) { const y = yAt(x); x === 0 ? g.moveTo(x, y) : g.lineTo(x, y); }
      g.stroke();
      // faint wind ripples on the dune face
      g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 1;
      for (let i = 0; i < 26; i++) {
        const x0 = q() * W, y0 = yAt(x0) + 4 + q() * 14, len = 20 + q() * 40;
        g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(x0 + len / 2, y0 - 2, x0 + len, y0); g.stroke();
      }
    }
    dune(372, 10, '#552f2a', 21, 'rgba(240,150,100,0.28)');
    dune(388, 14, '#5f3529', 3, 'rgba(240,150,100,0.30)');
    dune(408, 10, '#6c3e2a', 9, 'rgba(250,170,110,0.32)');
    return c;
  }

  // ---------- near layer: the stepped pyramid and sand floor (static) ----------
  function buildNear() {
    const c = mk(W, H), g = c.getContext('2d');
    const r = rng(42);

    const tiers = [
      { x0: 140, x1: 820, top: 360, bot: FLOOR },
      { x0: 360, x1: 600, top: 250, bot: 360 },
    ];
    for (const tr of tiers) {
      const tw = tr.x1 - tr.x0;
      // base tone
      const grd = g.createLinearGradient(0, tr.top, 0, tr.bot);
      grd.addColorStop(0, '#6c4731'); grd.addColorStop(1, '#4a2f22');
      g.fillStyle = grd; g.fillRect(tr.x0, tr.top, tw, tr.bot - tr.top);
      // individual blocks: each one a slightly different stone, with a lit top lip and a dark seam
      let row = 0;
      for (let y = tr.top; y < tr.bot; y += 18, row++) {
        const bh = Math.min(18, tr.bot - y);
        for (let x = tr.x0 - (row % 2 ? 22 : 0); x < tr.x1; x += 44) {
          const bx = Math.max(x, tr.x0), bw = Math.min(x + 44, tr.x1) - bx;
          if (bw <= 0) continue;
          const v = r();
          g.fillStyle = v < 0.5 ? rgba(255, 210, 160, 0.03 + v * 0.06) : rgba(0, 0, 0, (v - 0.5) * 0.18);
          g.fillRect(bx + 1, y + 1, bw - 2, bh - 2);
          g.fillStyle = 'rgba(255,200,140,0.07)'; g.fillRect(bx + 1, y + 1, bw - 2, 1.5);
          g.fillStyle = 'rgba(15,6,3,0.42)'; g.fillRect(bx, y + bh - 1.2, bw, 1.2); g.fillRect(bx + bw - 1.2, y, 1.2, bh);
          // chipped corners
          if (r() < 0.22) {
            g.fillStyle = 'rgba(20,8,4,0.45)';
            const cx = r() < 0.5 ? bx + 1 : bx + bw - 1, dx = cx === bx + 1 ? 1 : -1;
            g.beginPath(); g.moveTo(cx, y + 1); g.lineTo(cx + dx * (3 + r() * 4), y + 1); g.lineTo(cx, y + 3 + r() * 4); g.closePath(); g.fill();
          }
          // pitting
          for (let k = 0; k < 3; k++) {
            g.fillStyle = r() < 0.6 ? 'rgba(0,0,0,0.16)' : 'rgba(255,200,140,0.08)';
            g.fillRect(bx + 2 + r() * (bw - 4), y + 2 + r() * (bh - 4), 1 + r() * 2, 1);
          }
        }
      }
      // backlit: rim light along the top edge and the outer corners
      const rim = g.createLinearGradient(0, tr.top, 0, tr.top + 12);
      rim.addColorStop(0, 'rgba(255,170,100,0.35)'); rim.addColorStop(1, 'rgba(255,170,100,0)');
      g.fillStyle = rim; g.fillRect(tr.x0, tr.top, tw, 12);
      g.fillStyle = 'rgba(255,190,120,0.55)'; g.fillRect(tr.x0, tr.top, tw, 1.5);
      g.fillStyle = 'rgba(255,170,100,0.18)'; g.fillRect(tr.x0, tr.top, 2, tr.bot - tr.top); g.fillRect(tr.x1 - 2, tr.top, 2, tr.bot - tr.top);
      // sand piled on the terrace top
      g.fillStyle = '#9a6a40';
      for (let x = tr.x0; x < tr.x1; x += 30 + r() * 40) {
        const w = 20 + r() * 50, hgt = 1.5 + r() * 2.5;
        g.beginPath(); g.moveTo(x, tr.top); g.quadraticCurveTo(x + w / 2, tr.top - hgt * 2, Math.min(tr.x1, x + w), tr.top); g.closePath(); g.fill();
      }
      // shade falling to the right (sun is behind and a little left)
      const sh = g.createLinearGradient(tr.x0, 0, tr.x1, 0);
      sh.addColorStop(0, 'rgba(255,160,90,0.05)'); sh.addColorStop(0.6, 'rgba(0,0,0,0.08)'); sh.addColorStop(1, 'rgba(0,0,0,0.3)');
      g.fillStyle = sh; g.fillRect(tr.x0, tr.top, tw, tr.bot - tr.top);
      // ambient occlusion where the tier meets the ground / the tier below
      const ao = g.createLinearGradient(0, tr.bot - 22, 0, tr.bot);
      ao.addColorStop(0, 'rgba(0,0,0,0)'); ao.addColorStop(1, 'rgba(0,0,0,0.28)');
      g.fillStyle = ao; g.fillRect(tr.x0, tr.bot - 22, tw, 22);
    }

    // long weathering cracks
    g.strokeStyle = 'rgba(18,7,3,0.5)'; g.lineWidth = 1;
    const cracks = [[176, 378], [300, 396], [660, 372], [770, 400], [372, 270], [584, 300]];
    for (const [x0, y0] of cracks) {
      let x = x0, y = y0;
      g.beginPath(); g.moveTo(x, y);
      for (let i = 0; i < 6; i++) { x += (r() - 0.5) * 8; y += 4 + r() * 6; g.lineTo(x, y); }
      g.stroke();
    }

    // carved frieze across the upper tier: a sunk band with a row of glyphs
    g.fillStyle = 'rgba(20,8,4,0.28)'; g.fillRect(372, 286, 216, 34);
    g.fillStyle = 'rgba(255,190,130,0.12)'; g.fillRect(372, 320, 216, 1.5);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(372, 286, 216, 1.5);
    function glyph(kind, x, y) {
      g.beginPath();
      switch (kind) {
        case 0: // eye of Horus
          g.moveTo(x - 7, y); g.quadraticCurveTo(x, y - 6, x + 7, y); g.quadraticCurveTo(x, y + 4, x - 7, y);
          g.moveTo(x + 1.8, y); g.arc(x, y, 1.8, 0, TAU);
          g.moveTo(x - 1, y + 2); g.lineTo(x - 3, y + 8); g.moveTo(x + 2, y + 2); g.quadraticCurveTo(x + 6, y + 7, x + 3, y + 9);
          break;
        case 1: // ankh
          g.ellipse(x, y - 5, 3, 4, 0, 0, TAU); g.moveTo(x, y - 1); g.lineTo(x, y + 10); g.moveTo(x - 5, y + 1); g.lineTo(x + 5, y + 1);
          break;
        case 2: // bird
          g.moveTo(x - 5, y + 8); g.lineTo(x - 3, y); g.quadraticCurveTo(x, y - 6, x + 3, y - 4); g.lineTo(x + 6, y - 3);
          g.moveTo(x - 3, y); g.quadraticCurveTo(x + 2, y + 3, x + 5, y + 8); g.moveTo(x - 1, y + 8); g.lineTo(x - 1, y + 11);
          break;
        case 3: // water
          for (let i = 0; i < 3; i++) { g.moveTo(x - 6, y - 4 + i * 4); for (let k = 0; k <= 4; k++) g.lineTo(x - 6 + k * 3, y - 4 + i * 4 + (k % 2 ? -1.5 : 1.5)); }
          break;
        case 4: // reed
          g.moveTo(x, y + 10); g.lineTo(x, y - 6); g.quadraticCurveTo(x + 4, y - 7, x + 3, y - 2); g.moveTo(x, y - 2); g.lineTo(x - 3, y - 4);
          break;
        default: // sun disc with cobra
          g.arc(x, y - 1, 4, 0, TAU); g.moveTo(x - 7, y + 7); g.quadraticCurveTo(x, y + 3, x + 7, y + 7);
      }
    }
    const order = [0, 2, 4, 1, 3, 5, 2, 0, 4, 1, 3, 2, 5, 1];
    for (let i = 0; i < order.length; i++) {
      const x = 386 + i * 14.8, y = 302;
      g.lineWidth = 1.3;
      g.strokeStyle = 'rgba(255,190,130,0.16)'; g.save(); g.translate(0.8, 0.8); glyph(order[i], x, y); g.stroke(); g.restore();
      g.strokeStyle = 'rgba(16,6,2,0.62)'; glyph(order[i], x, y); g.stroke();
    }

    // doorway: stone frame, lintel, deep shadowed passage with steps going in
    g.fillStyle = '#5a3a26';
    g.fillRect(440, 384, 80, 86);
    g.fillStyle = 'rgba(255,190,130,0.16)'; g.fillRect(440, 384, 80, 2); g.fillRect(440, 384, 2, 86);
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(518, 384, 2, 86);
    // lintel block with a cartouche
    g.fillStyle = '#6e4a30'; g.fillRect(432, 372, 96, 14);
    g.fillStyle = 'rgba(255,190,130,0.3)'; g.fillRect(432, 372, 96, 1.5);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(432, 384.5, 96, 1.5);
    g.strokeStyle = 'rgba(20,8,4,0.6)'; g.lineWidth = 1.2;
    g.beginPath(); g.ellipse(480, 379, 22, 4.5, 0, 0, TAU); g.stroke();
    g.fillStyle = 'rgba(20,8,4,0.6)';
    for (let i = 0; i < 4; i++) g.fillRect(466 + i * 8, 377.5, 3, 3);
    // the opening
    const dg = g.createLinearGradient(0, 392, 0, FLOOR);
    dg.addColorStop(0, '#0e0806'); dg.addColorStop(1, '#22140c');
    g.fillStyle = dg;
    g.beginPath(); g.moveTo(452, FLOOR); g.lineTo(452, 404); g.lineTo(480, 392); g.lineTo(508, 404); g.lineTo(508, FLOOR); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,160,90,0.10)'; g.lineWidth = 1;
    for (let i = 0; i < 4; i++) { const y = FLOOR - 4 - i * 5, inset = i * 3; g.beginPath(); g.moveTo(454 + inset, y); g.lineTo(506 - inset, y); g.stroke(); }

    // hieroglyph columns flanking the door, carved (shadow + lit lower edge)
    for (const cx of [420, 540]) {
      g.fillStyle = 'rgba(20,8,4,0.22)'; g.fillRect(cx - 9, 376, 18, 88);
      for (let y = 380, i = 0; y < 456; y += 15, i++) {
        const k = (cx === 420 ? [0, 1, 2, 4, 1] : [1, 5, 3, 0, 2])[i % 5];
        g.lineWidth = 1.3;
        g.strokeStyle = 'rgba(255,190,130,0.18)'; g.save(); g.translate(0.8, 0.8); glyph(k, cx, y + 5); g.stroke(); g.restore();
        g.strokeStyle = 'rgba(16,6,2,0.65)'; glyph(k, cx, y + 5); g.stroke();
      }
    }

    // sand floor
    const sand = g.createLinearGradient(0, FLOOR, 0, H);
    sand.addColorStop(0, '#ab7341'); sand.addColorStop(0.18, '#8e5a33'); sand.addColorStop(1, '#4a2c1a');
    g.fillStyle = sand; g.fillRect(0, FLOOR, W, H - FLOOR);
    // sand drift banked all along the base, with a lit crest
    g.fillStyle = '#9b6539';
    g.beginPath(); g.moveTo(0, FLOOR);
    for (let x = 0; x <= W; x += 12) {
      const nearBase = x > 120 && x < 840 ? 1 : 0.4;
      g.lineTo(x, FLOOR - (2 + Math.sin(x * 0.045) * 1.5 + r() * 1.2) * nearBase);
    }
    g.lineTo(W, FLOOR); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(70, FLOOR); g.quadraticCurveTo(130, FLOOR - 24, 196, FLOOR); g.fill();
    g.beginPath(); g.moveTo(764, FLOOR); g.quadraticCurveTo(830, FLOOR - 22, 890, FLOOR); g.fill();
    g.fillStyle = 'rgba(255,214,150,0.45)'; g.fillRect(0, FLOOR, W, 1.5);
    // ripples: a shadow line with a lit line just above
    for (let i = 0; i < 11; i++) {
      const y = FLOOR + 10 + i * 6 + r() * 3, ph = r() * 6, fq = 0.025 + r() * 0.015;
      for (const [dy, col] of [[0, 'rgba(40,18,8,0.28)'], [-1.2, 'rgba(255,200,140,0.10)']]) {
        g.strokeStyle = col; g.lineWidth = 1.1;
        g.beginPath();
        for (let x = 0; x <= W; x += 8) { const yy = y + dy + Math.sin(x * fq + ph) * 2; x === 0 ? g.moveTo(x, yy) : g.lineTo(x, yy); }
        g.stroke();
      }
    }
    // pebbles with little shadows
    for (let i = 0; i < 46; i++) {
      const x = r() * W, y = FLOOR + 8 + r() * 60, s = 1 + r() * 2.5;
      g.fillStyle = 'rgba(0,0,0,0.28)'; g.beginPath(); g.ellipse(x + 1, y + 1, s * 1.2, s * 0.6, 0, 0, TAU); g.fill();
      g.fillStyle = r() < 0.5 ? '#6b4a33' : '#87613f'; g.beginPath(); g.ellipse(x, y, s, s * 0.7, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,220,170,0.3)'; g.fillRect(x - s * 0.4, y - s * 0.5, s * 0.6, 0.8);
    }
    // a half-buried skull and a bone, low contrast, off to the sides
    function skull(x, y) {
      g.fillStyle = '#b8a07a';
      g.beginPath(); g.ellipse(x, y, 9, 7, 0, Math.PI, TAU); g.fill();
      g.fillRect(x - 5, y - 1, 10, 3);
      g.fillStyle = '#2a1a10';
      g.beginPath(); g.ellipse(x - 3.5, y - 2.5, 2, 2.2, 0, 0, TAU); g.ellipse(x + 3.5, y - 2.5, 2, 2.2, 0, 0, TAU); g.fill();
      g.fillStyle = '#9b6539'; g.fillRect(x - 11, y + 1, 22, 3);
    }
    skull(54, FLOOR + 22);
    g.save(); g.translate(905, FLOOR + 30); g.rotate(-0.25);
    g.fillStyle = '#a99070'; g.fillRect(-12, -1.5, 24, 3);
    g.beginPath(); g.arc(-12, -2, 2.6, 0, TAU); g.arc(-12, 2, 2.6, 0, TAU); g.arc(12, -2, 2.6, 0, TAU); g.arc(12, 2, 2.6, 0, TAU); g.fill();
    g.restore();
    // dry desert scrub at the edges
    function shrub(x, y, s) {
      g.strokeStyle = '#3c2416'; g.lineWidth = 1.2;
      for (let i = 0; i < 9; i++) {
        const a = -Math.PI / 2 + (i - 4) * 0.28, l = (10 + r() * 10) * s;
        g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5, y + Math.sin(a) * l * 0.6, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
      }
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.beginPath(); g.ellipse(x + 3, y + 1, 12 * s, 2.5, 0, 0, TAU); g.fill();
    }
    shrub(20, FLOOR + 2, 1); shrub(944, FLOOR + 2, 1.1); shrub(410, FLOOR + 48, 0.7); shrub(600, FLOOR + 56, 0.6);
    return c;
  }

  // ---------- props ----------
  // terrace ledge, pre-rendered per size; the top edge is the standing line
  function ledgeSprite(w, h) {
    const key = w + 'x' + h;
    if (ledgeCache[key]) return ledgeCache[key];
    const pad = 10, c = mk(w + pad * 2, h + pad * 2 + 10), g = c.getContext('2d'), r = rng(w * 31 + h);
    const x0 = pad, y0 = pad;
    // soft drop shadow under the lip
    const sh = g.createLinearGradient(0, y0 + h, 0, y0 + h + 10);
    sh.addColorStop(0, 'rgba(0,0,0,0.38)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.fillRect(x0 + 3, y0 + h, w - 6, 10);
    // blocks
    for (let x = x0, i = 0; x < x0 + w; x += 30, i++) {
      const bw = Math.min(30, x0 + w - x), v = r();
      const bg = g.createLinearGradient(0, y0, 0, y0 + h);
      bg.addColorStop(0, v < 0.5 ? '#b98250' : '#ad7647'); bg.addColorStop(1, '#7e5232');
      g.fillStyle = bg; g.fillRect(x, y0, bw, h);
      g.fillStyle = 'rgba(25,10,4,0.5)'; g.fillRect(x + bw - 1, y0 + 2, 1, h - 2);
      if (r() < 0.4) { g.fillStyle = 'rgba(30,12,6,0.35)'; g.fillRect(x + 4 + r() * (bw - 8), y0 + 5 + r() * (h - 8), 2 + r() * 3, 1); }
    }
    // chamfered lit top and dark underside
    g.fillStyle = '#e0ab6c'; g.fillRect(x0, y0, w, 2);
    g.fillStyle = 'rgba(255,225,170,0.6)'; g.fillRect(x0 + 1, y0, w - 2, 1);
    g.fillStyle = 'rgba(25,10,4,0.55)'; g.fillRect(x0, y0 + h - 2.5, w, 2.5);
    // worn, rounded ends
    g.fillStyle = 'rgba(25,10,4,0.4)'; g.fillRect(x0, y0 + 2, 1.5, h - 2); g.fillRect(x0 + w - 1.5, y0 + 2, 1.5, h - 2);
    // sand dusting on the top
    g.fillStyle = 'rgba(220,170,110,0.55)';
    for (let x = x0 + 6; x < x0 + w - 10; x += 18 + r() * 30) {
      const sw = 10 + r() * 24;
      g.beginPath(); g.moveTo(x, y0 + 0.5); g.quadraticCurveTo(x + sw / 2, y0 - 2.5, x + sw, y0 + 0.5); g.closePath(); g.fill();
    }
    const out = { c, pad };
    ledgeCache[key] = out;
    return out;
  }
  function drawLedge(ctx, p, t, idx) {
    const sp = ledgeSprite(p.w, p.h);
    ctx.drawImage(sp.c, p.x - sp.pad, p.y - sp.pad);
    // thin trickles of sand from both ends
    ctx.fillStyle = 'rgba(214,166,108,0.55)';
    for (let e = 0; e < 2; e++) {
      const ex = e ? p.x + p.w - 4 : p.x + 4;
      for (let k = 0; k < 6; k++) {
        const ph = frac(t * 0.9 + k / 6 + hash(idx * 7 + e) * 3);
        ctx.globalAlpha = 0.65 * (1 - ph);
        ctx.fillRect(ex + Math.sin(ph * 6 + k) * 1.2, p.y + p.h + ph * 46, 1.2, 2.2);
      }
    }
    ctx.globalAlpha = 1;
  }

  // bronze brazier on a tripod; flame bends with the wind, embers rise
  function brazier(ctx, x, y, t, lean, seed) {
    // warm pool of light on the stone behind and below
    const pool = ctx.createRadialGradient(x, y - 30, 4, x, y - 20, 90);
    const fk = 0.85 + 0.15 * Math.sin(t * 11 + seed) * Math.sin(t * 7.3 + seed * 2);
    pool.addColorStop(0, rgba(255, 150, 70, 0.20 * fk)); pool.addColorStop(1, 'rgba(255,150,70,0)');
    ctx.fillStyle = pool; ctx.fillRect(x - 90, y - 120, 180, 150);
    // tripod
    ctx.strokeStyle = '#2c1a10'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y - 22); ctx.lineTo(x - 9, y);
    ctx.moveTo(x, y - 22); ctx.lineTo(x + 9, y);
    ctx.moveTo(x, y - 22); ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = '#2c1a10'; ctx.fillRect(x - 11, y - 1.5, 4, 1.5); ctx.fillRect(x + 7, y - 1.5, 4, 1.5);
    ctx.lineCap = 'butt';
    // bowl
    const bg = ctx.createLinearGradient(x - 12, 0, x + 12, 0);
    bg.addColorStop(0, '#8a5a2a'); bg.addColorStop(0.45, '#c08840'); bg.addColorStop(1, '#4a2e16');
    ctx.fillStyle = bg;
    ctx.beginPath(); ctx.moveTo(x - 13, y - 30); ctx.lineTo(x + 13, y - 30); ctx.quadraticCurveTo(x + 10, y - 19, x, y - 19); ctx.quadraticCurveTo(x - 10, y - 19, x - 13, y - 30); ctx.fill();
    ctx.fillStyle = '#e0a860'; ctx.fillRect(x - 13, y - 31, 26, 1.6);
    // embers bed
    ctx.fillStyle = rgba(255, 110, 40, 0.9 * fk);
    ctx.beginPath(); ctx.ellipse(x, y - 30, 11, 2.2, 0, 0, TAU); ctx.fill();
    // flame: three layers, bent downwind
    const fl = 1 + Math.sin(t * 17 + seed) * 0.13 + Math.sin(t * 29 + seed * 0.3) * 0.08;
    const lx = lean * 14, sway = Math.sin(t * 6 + seed) * 2;
    const layers = [[9, 54, 'rgba(230,80,30,0.55)'], [7, 44, 'rgba(255,140,50,0.8)'], [4, 32, 'rgba(255,220,130,0.9)']];
    for (const [hw, hh, col] of layers) {
      const tip = hh * fl;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x - hw, y - 30);
      ctx.quadraticCurveTo(x - hw * 0.7 + lx * 0.4 + sway * 0.5, y - 30 - tip * 0.55, x + lx + sway, y - 30 - tip);
      ctx.quadraticCurveTo(x + hw * 0.7 + lx * 0.4 + sway * 0.5, y - 30 - tip * 0.5, x + hw, y - 30);
      ctx.closePath(); ctx.fill();
    }
    // rising embers
    for (let i = 0; i < 9; i++) {
      const ph = frac(t * (0.45 + hash(seed * 13 + i) * 0.4) + hash(seed * 29 + i));
      const ex = x + (hash(seed + i * 3) - 0.5) * 14 + Math.sin(t * 2.4 + i) * 5 * ph + lean * ph * 60;
      const ey = y - 40 - ph * 90;
      ctx.fillStyle = rgba(255, 170 + (i % 3) * 25, 80, 0.85 * (1 - ph));
      ctx.fillRect(ex, ey, 1.6, 1.6);
    }
    // smoke wisps
    for (let i = 0; i < 3; i++) {
      const ph = frac(t * 0.22 + i / 3 + seed * 0.1);
      const sx = x + lx * 1.6 * ph * 3 + Math.sin(t * 0.9 + i * 2) * 8 * ph, sy = y - 80 - ph * 70;
      ctx.fillStyle = rgba(60, 40, 40, 0.10 * Math.sin(ph * Math.PI));
      ctx.beginPath(); ctx.arc(sx, sy, 6 + ph * 14, 0, TAU); ctx.fill();
    }
    // glow halo
    const glow = ctx.createRadialGradient(x, y - 40, 2, x, y - 40, 48);
    glow.addColorStop(0, rgba(255, 150, 60, 0.26 * fk)); glow.addColorStop(1, 'rgba(255,150,60,0)');
    ctx.fillStyle = glow; ctx.fillRect(x - 48, y - 88, 96, 96);
  }

  // pole with a gilded finial and a cloth banner that streams downwind (shows the storm direction)
  function banner(ctx, x, y, t, wind, seed) {
    ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 74); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,190,120,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 1, y); ctx.lineTo(x - 1, y - 74); ctx.stroke();
    // finial: ball and spear tip
    ctx.fillStyle = '#c99a4a';
    ctx.beginPath(); ctx.arc(x, y - 76, 3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x - 2.5, y - 78); ctx.lineTo(x, y - 87); ctx.lineTo(x + 2.5, y - 78); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,200,0.7)'; ctx.fillRect(x - 1.2, y - 77.5, 1, 1);
    // base: little stone foot
    ctx.fillStyle = '#5a3a24'; ctx.fillRect(x - 5, y - 4, 10, 4);

    const aw = Math.abs(wind), dir = wind === 0 ? 1 : Math.sign(wind);
    const len = 34 + aw * 18, flap = (0.3 + aw) * 4, droop = 1 - aw;
    const top = i => { const k = i / 8; return [x + dir * len * k, y - 70 + Math.sin(t * 9 + seed - k * 5) * flap * k + droop * 10 * k]; };
    const bot = i => { const k = i / 8; return [x + dir * len * k, y - 50 + Math.sin(t * 9 + seed - k * 5) * flap * k + droop * 16 * k]; };
    ctx.fillStyle = '#7d2b2b';
    ctx.beginPath();
    let p = top(0); ctx.moveTo(p[0], p[1]);
    for (let i = 1; i <= 8; i++) { p = top(i); ctx.lineTo(p[0], p[1]); }
    for (let i = 8; i >= 0; i--) { p = bot(i); ctx.lineTo(p[0], p[1]); }
    ctx.closePath(); ctx.fill();
    // fold shading: alternate light/dark strips following the wave
    for (let i = 0; i < 8; i++) {
      const s = Math.cos(t * 9 + seed - (i + 0.5) / 8 * 5);
      const a = top(i), b = top(i + 1), c2 = bot(i + 1), d = bot(i);
      ctx.fillStyle = s > 0 ? rgba(255, 170, 120, 0.10 * s) : rgba(0, 0, 0, -0.22 * s);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c2[0], c2[1]); ctx.lineTo(d[0], d[1]); ctx.closePath(); ctx.fill();
    }
    // gold trim along the top, emblem (sun disc) and fringe
    ctx.strokeStyle = 'rgba(220,170,80,0.75)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); p = top(0); ctx.moveTo(p[0], p[1] + 1.5);
    for (let i = 1; i <= 8; i++) { p = top(i); ctx.lineTo(p[0], p[1] + 1.5); }
    ctx.stroke();
    const m1 = top(3), m2 = bot(3);
    ctx.fillStyle = 'rgba(230,180,90,0.8)';
    ctx.beginPath(); ctx.arc((m1[0] + m2[0]) / 2, (m1[1] + m2[1]) / 2, 3.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(230,180,90,0.7)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i <= 8; i++) { p = bot(i); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[0] + dir * aw * 3, p[1] + 3 + droop); }
    ctx.stroke();
  }

  function solid(o) { return o && o.w > 0 && o.h > 0 && !(o.hp !== undefined && o.hp <= 0); }

  // wind never shoves a fighter into a solid obstacle: stop at its face instead
  function pushX(f, nx) {
    for (const o of arena.obstacles) {
      if (!solid(o)) continue;
      if (f.y <= o.y + 0.5 || f.y - BODY_H >= o.y + o.h) continue; // standing on top, or above it
      const l = o.x - HALF_BODY, r = o.x + o.w + HALF_BODY;
      if (f.x <= l && nx > l) nx = l;
      else if (f.x >= r && nx < r) nx = r;
    }
    return nx;
  }

  function drawPillar(ctx, o) {
    const x = o.x, y = o.y, w = o.w, h = o.h, b = y + h, left = x < W / 2;
    // sand heaped around the foot
    ctx.fillStyle = '#9b6539';
    ctx.beginPath(); ctx.moveTo(x - 16, b); ctx.quadraticCurveTo(x + w / 2, b - 14, x + w + 16, b); ctx.closePath(); ctx.fill();
    // plinth
    ctx.fillStyle = '#4a2e1e'; ctx.fillRect(x - 6, b - 12, w + 12, 12);
    ctx.fillStyle = 'rgba(255,190,130,0.25)'; ctx.fillRect(x - 6, b - 12, w + 12, 1.5);
    // shaft with a cylindrical shade
    const sg = ctx.createLinearGradient(x, 0, x + w, 0);
    sg.addColorStop(0, '#a4744a'); sg.addColorStop(0.35, '#93653f'); sg.addColorStop(0.8, '#5e3e26'); sg.addColorStop(1, '#4a301d');
    ctx.fillStyle = sg; ctx.fillRect(x, y + 6, w, h - 18);
    // stacked drum seams
    ctx.fillStyle = 'rgba(25,10,4,0.5)';
    for (const dy of [30, 58]) { ctx.fillRect(x, y + dy, w, 1.4); }
    ctx.fillStyle = 'rgba(255,200,140,0.18)';
    for (const dy of [31.5, 59.5]) { ctx.fillRect(x, y + dy, w, 1); }
    // fluting (dark groove + lit edge)
    for (let i = 1; i < 5; i++) {
      const fx = x + (w * i) / 5;
      ctx.fillStyle = 'rgba(30,14,6,0.38)'; ctx.fillRect(fx - 1, y + 10, 2, h - 24);
      ctx.fillStyle = 'rgba(255,200,140,0.10)'; ctx.fillRect(fx + 1, y + 10, 1, h - 24);
    }
    // carved band with a cartouche on the middle drum
    ctx.fillStyle = 'rgba(20,8,4,0.3)'; ctx.fillRect(x + 4, y + 38, w - 8, 14);
    ctx.strokeStyle = 'rgba(255,200,140,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + 45, w / 2 - 9, 4.5, 0, 0, TAU); ctx.stroke();
    // jagged broken top; the standing line stays flat at y
    ctx.fillStyle = '#a77650';
    ctx.beginPath();
    ctx.moveTo(x, y + 8); ctx.lineTo(x, y); ctx.lineTo(x + w * 0.32, y); ctx.lineTo(x + w * 0.42, y + 4);
    ctx.lineTo(x + w * 0.55, y + 1); ctx.lineTo(x + w * 0.62, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,214,150,0.5)'; ctx.fillRect(x, y, w * 0.32, 1.5); ctx.fillRect(x + w * 0.62, y, w * 0.38, 1.5);
    ctx.fillStyle = 'rgba(200,150,95,0.7)'; ctx.fillRect(x + 3, y - 1, 9, 1.5); ctx.fillRect(x + w - 14, y - 1, 7, 1.5);
    // crack
    ctx.strokeStyle = 'rgba(20,8,4,0.65)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x + w * 0.42, y + 4); ctx.lineTo(x + w * 0.36, y + 18); ctx.lineTo(x + w * 0.46, y + 30); ctx.lineTo(x + w * 0.38, y + 52); ctx.stroke();
    // fallen capital lying in the sand beside it
    const dx = left ? x + w + 6 : x - 32;
    ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.ellipse(dx + 13, b - 1, 15, 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#7a5232'; ctx.beginPath(); ctx.ellipse(dx + 13, b - 7, 13, 7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#9a6c44'; ctx.beginPath(); ctx.ellipse(dx + (left ? 21 : 5), b - 7, 4.5, 6.5, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(30,12,6,0.4)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.ellipse(dx + (left ? 21 : 5), b - 7, 2.5, 4, 0, 0, TAU); ctx.stroke();
  }

  function drawUrn(ctx, o, t) {
    const x = o.x, y = o.y, w = o.w, h = o.h, cx = x + w / 2, b = y + h;
    if (!solid(o)) {
      // shards on the sand: outside glaze and lighter broken edges
      const pts = [[-22, 0, 12, 0.2], [-8, -1, 8, -0.4], [6, 0, 11, 0.1], [19, -1, 7, 0.6], [-2, -4, 6, -0.2], [12, -3, 5, 0.9]];
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(cx, b, 26, 3, 0, 0, TAU); ctx.fill();
      for (const p of pts) {
        ctx.save(); ctx.translate(cx + p[0] + p[2] / 2, b + p[1] - 2); ctx.rotate(p[3]);
        ctx.fillStyle = '#a4552e';
        ctx.beginPath(); ctx.moveTo(-p[2] / 2, 2); ctx.lineTo(p[2] / 2, 2); ctx.lineTo(p[2] * 0.1, -p[2] * 0.55); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#d08a5a'; ctx.fillRect(-p[2] / 2, 1, p[2], 1);
        ctx.restore();
      }
      ctx.fillStyle = '#2a140a'; ctx.fillRect(cx - 4, b - 3, 7, 2);
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.ellipse(cx + 3, b, w * 0.6, 4, 0, 0, TAU); ctx.fill();
    // handles behind the body
    ctx.strokeStyle = '#8a4426'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx - w * 0.3, y + 7); ctx.quadraticCurveTo(cx - w * 0.62, y + 8, cx - w * 0.44, y + h * 0.36); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx + w * 0.3, y + 7); ctx.quadraticCurveTo(cx + w * 0.62, y + 8, cx + w * 0.44, y + h * 0.36); ctx.stroke();
    // body with a round shade
    const bg = ctx.createRadialGradient(cx - w * 0.16, y + h * 0.42, 2, cx, y + h * 0.5, w * 0.62);
    bg.addColorStop(0, '#c36a3a'); bg.addColorStop(0.6, '#a0522c'); bg.addColorStop(1, '#6a321a');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.26, y + 3);
    ctx.lineTo(cx + w * 0.26, y + 3);
    ctx.quadraticCurveTo(cx + w * 0.2, y + 11, cx + w * 0.5, y + h * 0.45);
    ctx.quadraticCurveTo(cx + w * 0.55, b - 6, cx + w * 0.25, b);
    ctx.lineTo(cx - w * 0.25, b);
    ctx.quadraticCurveTo(cx - w * 0.55, b - 6, cx - w * 0.5, y + h * 0.45);
    ctx.quadraticCurveTo(cx - w * 0.2, y + 11, cx - w * 0.26, y + 3);
    ctx.closePath(); ctx.fill();
    // foot ring
    ctx.fillStyle = '#7a3a1e'; ctx.fillRect(cx - w * 0.25, b - 3, w * 0.5, 3);
    // rim (flat standing line) with an opening
    ctx.fillStyle = '#c87444'; ctx.fillRect(cx - w * 0.34, y, w * 0.68, 4);
    ctx.fillStyle = 'rgba(255,220,170,0.45)'; ctx.fillRect(cx - w * 0.34, y, w * 0.68, 1);
    ctx.fillStyle = '#2a140a'; ctx.fillRect(cx - w * 0.22, y + 1, w * 0.44, 1.5);
    // painted bands: black band with lotus petals, thin lines above and below
    const by = y + h * 0.42;
    ctx.fillStyle = '#2a140a'; ctx.fillRect(x + 3, by, w - 6, 6);
    ctx.fillRect(x + 6, by - 4, w - 12, 1); ctx.fillRect(x + 5, by + 9, w - 10, 1);
    ctx.fillStyle = 'rgba(232,184,104,0.8)';
    for (let i = 0; i < 5; i++) {
      const px = x + 7 + i * 6.5;
      ctx.beginPath(); ctx.moveTo(px - 2, by + 5); ctx.quadraticCurveTo(px, by - 1, px + 2, by + 5); ctx.fill();
    }
    ctx.fillStyle = 'rgba(42,20,10,0.75)';
    for (let i = 0; i < 6; i++) ctx.fillRect(x + 8 + i * 5, y + h * 0.72, 2, 2);
    // glaze highlight
    ctx.fillStyle = 'rgba(255,220,180,0.28)';
    ctx.beginPath(); ctx.ellipse(cx - w * 0.24, y + h * 0.5, w * 0.06, h * 0.18, -0.15, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,230,200,0.5)'; ctx.fillRect(cx - w * 0.27, y + h * 0.36, 1.5, 3);
    // cracks grow as it takes damage
    const dmg = 1 - Math.max(0, o.hp) / URN_HP;
    if (dmg > 0.05) {
      ctx.strokeStyle = 'rgba(20,6,2,0.85)'; ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(cx - 4, y + 4); ctx.lineTo(cx + 2, y + 16); ctx.lineTo(cx - 3, y + 26);
      if (dmg > 0.4) { ctx.moveTo(cx + 2, y + 16); ctx.lineTo(cx + 12, y + 22); ctx.lineTo(cx + 10, y + 34); }
      if (dmg > 0.7) { ctx.moveTo(cx - 3, y + 26); ctx.lineTo(cx - 12, y + 36); ctx.moveTo(cx - 3, y + 26); ctx.lineTo(cx + 1, y + 44); }
      ctx.stroke();
      // lit edge on the crack
      ctx.strokeStyle = 'rgba(240,160,110,0.35)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(cx - 3, y + 5); ctx.lineTo(cx + 3, y + 16); ctx.stroke();
      if (dmg > 0.7) { ctx.fillStyle = '#1a0a04'; ctx.beginPath(); ctx.moveTo(cx + 2, y + 16); ctx.lineTo(cx + 7, y + 19); ctx.lineTo(cx + 3, y + 22); ctx.closePath(); ctx.fill(); }
    }
  }

  // ---------- animated far details ----------
  function drawSkyLife(ctx, t) {
    // twinkling stars
    for (let i = 0; i < 18; i++) {
      const x = hash(i * 3 + 1) * W, y = 84 + hash(i * 3 + 2) * 110;
      const tw = 0.5 + 0.5 * Math.sin(t * (1.2 + hash(i) * 2.5) + i * 1.7);
      ctx.fillStyle = rgba(240, 232, 215, (0.15 + 0.5 * tw) * (1 - (y - 84) / 130));
      ctx.fillRect(x, y, 1.6, 1.6);
      if (tw > 0.92) { ctx.fillRect(x - 2, y + 0.4, 5.6, 0.8); ctx.fillRect(x + 0.4, y - 2, 0.8, 5.6); }
    }
    // a pair of vultures circling high over the far left and right
    for (let i = 0; i < 3; i++) {
      const cx = [210, 760, 300][i], cy = [140, 128, 176][i], rad = [46, 60, 30][i], sp = [0.22, -0.18, 0.3][i];
      const a = t * sp + i * 2.1, x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad * 0.35;
      const flap = Math.sin(t * 3 + i) > 0.85 ? -2.5 : 0.5, s = [1, 0.85, 0.7][i];
      ctx.strokeStyle = 'rgba(30,14,20,0.8)'; ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x - 8 * s, y + flap * s); ctx.quadraticCurveTo(x - 4 * s, y - 3 * s, x, y); ctx.quadraticCurveTo(x + 4 * s, y - 3 * s, x + 8 * s, y + flap * s);
      ctx.stroke();
    }
  }
  // a camel caravan walking along the far dune ridge
  function drawCaravan(ctx, t) {
    const span = W + 160, base = frac(t * 0.006) * span - 80;
    for (let i = 0; i < 4; i++) {
      const x = base - i * 15, y = 386 - Math.sin(x * 0.006 + 1.2) * 4;
      if (x < -20 || x > W + 20) continue;
      const step = Math.sin(t * 4 + i * 1.3) * 1.2;
      ctx.fillStyle = 'rgba(40,18,20,0.75)';
      if (i === 3) { // the guide on foot
        ctx.fillRect(x - 0.6, y - 7, 1.4, 5); ctx.beginPath(); ctx.arc(x, y - 8, 1.1, 0, TAU); ctx.fill();
        ctx.fillRect(x - 1 + step * 0.3, y - 2, 0.8, 2); ctx.fillRect(x + 0.4 - step * 0.3, y - 2, 0.8, 2);
        continue;
      }
      ctx.beginPath(); ctx.ellipse(x, y - 6, 4.2, 2.2, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x - 0.5, y - 8, 2, 1.6, 0, 0, TAU); ctx.fill();
      ctx.fillRect(x + 3, y - 10, 1, 4); ctx.fillRect(x + 3, y - 11, 2.4, 1.2);
      ctx.fillRect(x - 3 + step * 0.4, y - 4, 0.8, 4); ctx.fillRect(x + 2.2 - step * 0.4, y - 4, 0.8, 4);
    }
  }

  function buildVignette() {
    const c = mk(W, H), g = c.getContext('2d');
    const v = g.createRadialGradient(W / 2, H * 0.55, H * 0.45, W / 2, H * 0.55, W * 0.62);
    v.addColorStop(0, 'rgba(10,4,8,0)'); v.addColorStop(1, 'rgba(10,4,8,0.38)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    const hz = g.createLinearGradient(0, H - 50, 0, H);
    hz.addColorStop(0, 'rgba(255,160,90,0)'); hz.addColorStop(1, 'rgba(255,160,90,0.07)');
    g.fillStyle = hz; g.fillRect(0, H - 50, W, 50);
    return c;
  }

  // current wind strength for visuals: -1..1 (sign = direction)
  function windVis() {
    if (S.phase === 'warn') return S.dir * (0.25 + 0.5 * (S.t / WARN));
    if (S.phase === 'storm') return S.dir * S.power;
    return 0.12 * S.dir;
  }

  const arena = {
    id: 'arena08',
    name: 'Desert Pyramid',
    nameVi: 'Kim tự tháp sa mạc',
    hint: 'Sandstorms push you sideways',
    hintVi: 'Bão cát đẩy ngang',
    floorY: FLOOR,
    gravityScale: 1,
    platforms: [
      { x: 170, y: 360, w: 180, h: 14 },
      { x: 610, y: 360, w: 180, h: 14 },
      { x: 390, y: 250, w: 180, h: 14 },
    ],
    // broken pillars (solid) flank the spawns; clay urns (breakable) guard the centre
    obstacles: [
      { x: 108, y: FLOOR - 96, w: 44, h: 96, kind: 'pillar' },
      { x: 808, y: FLOOR - 96, w: 44, h: 96, kind: 'pillar' },
      { x: 326, y: FLOOR - 50, w: 40, h: 50, kind: 'urn', hp: URN_HP },
      { x: 594, y: FLOOR - 50, w: 40, h: 50, kind: 'urn', hp: URN_HP },
    ],

    reset() {
      S.phase = 'calm'; S.t = 0; S.next = 7 + Math.random() * 3; S.power = 0;
      S.dir = Math.random() < 0.5 ? -1 : 1;
      S.grains.length = 0; S.streaks.length = 0;
    },

    update(dt, fighters, game) {
      try {
        if (!(dt > 0)) return;
        dt = Math.min(dt, 0.05);
        const live = !!(game && game.fighting);
        // the cycle only advances during a live round (calm drift behind menus)
        if (live) {
          S.t += dt;
          if (S.phase === 'calm' && S.t >= S.next) {
            S.phase = 'warn'; S.t = 0;
            S.dir = Math.random() < 0.5 ? -1 : 1;
            if (game.word) game.word(S.dir > 0 ? 200 : 760, 150, S.dir > 0 ? 'BÃO CÁT →' : '← BÃO CÁT', '#ffb060');
          } else if (S.phase === 'warn' && S.t >= WARN) {
            S.phase = 'storm'; S.t = 0;
            if (game.shake) game.shake(4);
          } else if (S.phase === 'storm' && S.t >= STORM) {
            S.phase = 'calm'; S.t = 0; S.next = CALM_MIN + Math.random() * (CALM_MAX - CALM_MIN);
          }
        } else if (S.phase !== 'calm') {
          // round ended mid-storm: let it die down
          S.power = Math.max(0, S.power - dt * 1.5);
          if (S.power <= 0) { S.phase = 'calm'; S.t = 0; }
        }

        if (S.phase === 'storm' && live) {
          S.power = Math.min(1, S.t / 0.4) * Math.min(1, (STORM - S.t) / 0.5);
          for (const f of fighters || []) {
            if (!f || f.ko) continue;
            const sp = f.blocking ? PUSH_BLOCK : (f.onGround ? PUSH_GROUND : PUSH_AIR);
            f.x = pushX(f, Math.max(28, Math.min(932, f.x + S.dir * sp * S.power * dt)));
          }
          if (game.particle && Math.random() < dt * 30) {
            game.particle({ x: S.dir > 0 ? 0 : W, y: 120 + Math.random() * 350, vx: S.dir * (500 + Math.random() * 300), vy: (Math.random() - 0.5) * 40, life: 1.4, col: '#d9a868', r: 2 + Math.random() * 2, float: true });
          }
        } else if (S.phase === 'warn' && live && game.particle && Math.random() < dt * 14) {
          // dust gathering at the upwind edge
          game.particle({ x: S.dir > 0 ? 10 + Math.random() * 40 : W - 10 - Math.random() * 40, y: FLOOR - Math.random() * 200, vx: S.dir * (60 + Math.random() * 80), vy: -20 - Math.random() * 30, life: 0.9, col: '#c89458', r: 2, float: true });
        }

        // ambient drifting grains (visual only)
        const wv = windVis();
        if (S.grains.length < 40 && Math.random() < dt * 20) {
          S.grains.push({ x: Math.random() * W, y: FLOOR - Math.random() * 60, a: 0, life: 2 + Math.random() * 2 });
        }
        for (let i = S.grains.length - 1; i >= 0; i--) {
          const g = S.grains[i];
          g.a += dt; g.x += (wv * 260 + 20) * dt; g.y -= 8 * dt;
          if (g.a > g.life || g.x < -10 || g.x > W + 10) S.grains.splice(i, 1);
        }
        // storm streaks for the foreground overlay
        if (S.phase === 'storm') {
          const want = 70 * S.power;
          while (S.streaks.length < want) S.streaks.push({ x: Math.random() * W, y: 90 + Math.random() * 440, len: 30 + Math.random() * 70, sp: 900 + Math.random() * 600 });
        }
        for (let i = S.streaks.length - 1; i >= 0; i--) {
          const s = S.streaks[i];
          s.x += S.dir * s.sp * dt;
          if (s.x < -100 || s.x > W + 100) {
            if (S.phase === 'storm' && S.streaks.length <= 70 * S.power + 1) { s.x = S.dir > 0 ? -s.len : W + s.len; s.y = 90 + Math.random() * 440; }
            else S.streaks.splice(i, 1);
          }
        }
      } catch (e) { /* never break the game loop */ }
    },

    drawBackground(ctx, t) {
      try {
        if (!farLayer) farLayer = buildFar();
        if (!nearLayer) nearLayer = buildNear();
        ctx.save();
        // whole far layer first, so shimmer strips never leave gaps at the edges
        ctx.drawImage(farLayer, 0, 0);
        drawSkyLife(ctx, t);
        // heat shimmer: the horizon band wobbles in thin strips
        const amp = 1.6 + Math.abs(windVis()) * 2;
        for (let y = 250; y < 420; y += 3) {
          const k = (y - 250) / 170;
          const off = Math.sin(t * 3.1 + y * 0.21) * amp * k + Math.sin(t * 5.3 + y * 0.07) * amp * 0.5 * k;
          ctx.drawImage(farLayer, 0, y, W, 3, off - 2, y, W + 4, 3);
        }
        drawCaravan(ctx, t);

        // distant haze grows during storms
        const wv = Math.abs(windVis());
        if (wv > 0.15) {
          ctx.fillStyle = rgba(180, 110, 60, 0.22 * wv);
          ctx.fillRect(0, 100, W, 330);
        }

        ctx.drawImage(nearLayer, 0, 0);

        // faint torchlight breathing out of the doorway
        const dl = 0.75 + 0.25 * Math.sin(t * 5.1) * Math.sin(t * 3.3 + 1);
        const dg = ctx.createRadialGradient(480, FLOOR - 4, 2, 480, FLOOR - 10, 40);
        dg.addColorStop(0, rgba(255, 140, 60, 0.22 * dl)); dg.addColorStop(1, 'rgba(255,140,60,0)');
        ctx.fillStyle = dg; ctx.fillRect(440, 420, 80, 50);

        // gold capstone with a slow glint sweeping across it
        ctx.fillStyle = '#b8873e';
        ctx.beginPath(); ctx.moveTo(455, 250); ctx.lineTo(480, 214); ctx.lineTo(505, 250); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(40,16,6,0.35)';
        ctx.beginPath(); ctx.moveTo(480, 214); ctx.lineTo(505, 250); ctx.lineTo(486, 250); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,220,140,0.55)';
        ctx.beginPath(); ctx.moveTo(480, 214); ctx.lineTo(456, 249); ctx.lineTo(459, 249); ctx.closePath(); ctx.fill();
        const gl = frac(t * 0.18);
        if (gl < 0.25) {
          const k = gl / 0.25, gx = 455 + k * 50;
          ctx.save();
          ctx.beginPath(); ctx.moveTo(455, 250); ctx.lineTo(480, 214); ctx.lineTo(505, 250); ctx.closePath(); ctx.clip();
          ctx.fillStyle = rgba(255, 245, 210, 0.55 * Math.sin(k * Math.PI));
          ctx.beginPath(); ctx.moveTo(gx - 4, 252); ctx.lineTo(gx + 10, 212); ctx.lineTo(gx + 16, 212); ctx.lineTo(gx + 2, 252); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        const tw = Math.max(0, Math.sin(t * 0.9)) ** 12;
        if (tw > 0.05) {
          ctx.fillStyle = rgba(255, 240, 200, 0.8 * tw);
          ctx.fillRect(477, 214, 6, 1); ctx.fillRect(479.5, 211, 1, 6);
        }

        const w = windVis();
        arena.platforms.forEach((p, i) => drawLedge(ctx, p, t, i));
        for (const o of arena.obstacles) {
          if (o.kind === 'pillar') { if (solid(o)) drawPillar(ctx, o); }
          else if (o.kind === 'urn') drawUrn(ctx, o, t);
        }

        brazier(ctx, 400, 250, t, w, 1);
        brazier(ctx, 560, 250, t, w, 2);
        banner(ctx, 180, 360, t, w, 0);
        banner(ctx, 780, 360, t, w, 1.7);

        // drifting sand grains near the ground
        ctx.fillStyle = 'rgba(230,180,120,0.45)';
        for (const g of S.grains) ctx.fillRect(g.x, g.y, 2, 1.5);

        // warning: dust wall rising on the upwind edge, billowing in puffs
        if (S.phase === 'warn') {
          const k = S.t / WARN;
          const ex = S.dir > 0 ? 0 : W, wdt = 60 + 140 * k;
          const grd = ctx.createLinearGradient(ex, 0, ex + S.dir * wdt, 0);
          grd.addColorStop(0, rgba(200, 140, 80, 0.55 * k + 0.15));
          grd.addColorStop(1, 'rgba(200,140,80,0)');
          ctx.fillStyle = grd;
          ctx.fillRect(S.dir > 0 ? 0 : W - wdt, 90, wdt, FLOOR - 90);
          for (let i = 0; i < 7; i++) {
            const py = FLOOR - 20 - i * 52 + Math.sin(t * 2 + i) * 6;
            const px = ex + S.dir * (wdt * 0.55 + Math.sin(t * 3 + i * 1.9) * 14);
            const pr = 26 + 18 * k + hash(i) * 14;
            const pg = ctx.createRadialGradient(px, py, pr * 0.2, px, py, pr);
            pg.addColorStop(0, rgba(196, 136, 80, 0.22 * k)); pg.addColorStop(1, 'rgba(196,136,80,0)');
            ctx.fillStyle = pg; ctx.fillRect(px - pr, py - pr, pr * 2, pr * 2);
          }
        }
        ctx.restore();
      } catch (e) {
        try { ctx.restore(); } catch (e2) {}
      }
    },

    drawForeground(ctx, t) {
      try {
        if (!vignette) vignette = buildVignette();
        ctx.save();
        // warning chevrons near the top of the arena
        if (S.phase === 'warn') {
          const blink = (Math.sin(t * 14) + 1) / 2;
          const y = 104, d = S.dir;
          for (let i = 0; i < 5; i++) {
            const cx = W / 2 + (i - 2) * 46 + d * ((t * 60) % 46);
            const edge = 1 - Math.abs(cx - W / 2) / 130;
            ctx.globalAlpha = Math.max(0, (0.45 + 0.45 * blink) * Math.min(1, edge * 1.6));
            ctx.beginPath();
            ctx.moveTo(cx - d * 10, y - 12); ctx.lineTo(cx + d * 6, y); ctx.lineTo(cx - d * 10, y + 12);
            ctx.lineTo(cx - d * 4, y + 12); ctx.lineTo(cx + d * 12, y); ctx.lineTo(cx - d * 4, y - 12);
            ctx.closePath();
            ctx.fillStyle = '#5a2a14'; ctx.save(); ctx.translate(1.5, 1.5); ctx.fill(); ctx.restore();
            ctx.fillStyle = '#ffb060'; ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        if (S.phase === 'storm' || S.streaks.length) {
          const pw = S.power;
          ctx.fillStyle = rgba(190, 120, 60, 0.13 * pw);
          ctx.fillRect(0, 80, W, H - 80);
          // rolling dust clouds (kept faint over the fighting band)
          for (let i = 0; i < 6; i++) {
            const span = W + 400, x = ((t * 520 * S.dir + i * 271) % span + span) % span - 200;
            const y = 140 + hash(i + 40) * 340, rr = 60 + hash(i + 50) * 60;
            const cg = ctx.createRadialGradient(x, y, 4, x, y, rr);
            cg.addColorStop(0, rgba(200, 140, 82, 0.10 * pw)); cg.addColorStop(1, 'rgba(200,140,82,0)');
            ctx.fillStyle = cg; ctx.fillRect(x - rr, y - rr, rr * 2, rr * 2);
          }
          // streaks: two weights so the storm has depth
          ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(235,190,130,0.35)';
          ctx.beginPath();
          for (let i = 0; i < S.streaks.length; i += 2) { const s = S.streaks[i]; ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - S.dir * s.len, s.y + 2); }
          ctx.stroke();
          ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(245,210,160,0.22)';
          ctx.beginPath();
          for (let i = 1; i < S.streaks.length; i += 2) { const s = S.streaks[i]; ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - S.dir * s.len * 0.7, s.y + 1); }
          ctx.stroke();
          // fine grit
          ctx.fillStyle = rgba(240, 200, 150, 0.5 * pw);
          for (let i = 0; i < 40; i++) {
            const span = W + 40, x = ((t * (700 + hash(i) * 500) * S.dir + hash(i + 9) * span) % span + span) % span - 20;
            const y = 90 + hash(i + 77) * 440 + Math.sin(t * 6 + i) * 4;
            ctx.fillRect(x, y, 1.5, 1);
          }
        }
        ctx.drawImage(vignette, 0, 0);
        ctx.restore();
      } catch (e) {
        try { ctx.restore(); } catch (e2) {}
      }
    },
  };

  (window.STICK_ARENAS = window.STICK_ARENAS || []).push(arena);
})();
