// Arena 05: Jungle (Rừng rậm)
// Two tree-branch ledges, a log swinging on vines overhead, a mud pool in the middle that bogs fighters down,
// tree stumps by the walls and breakable bamboo fences on each side of the mud.
// Every decoration is a pure function of `t` or of fixed seeds, so host and guest draw the same scene online.
(function () {
  const W = 960, H = 540, FLOOR = 462;
  const MUD = { x0: 398, x1: 562 };          // mud pool on the floor (centered, away from both spawns)
  const LOG = { cx: 480, y: 210, w: 180, amp: 46, speed: 1.05 }; // swinging log platform
  const TAU = Math.PI * 2;

  // seeded random (fixed seeds: identical on every client)
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let r = Math.imul(s ^ (s >>> 15), 1 | s);
      r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  let rnd = rng(5);
  const pick = (a) => a[(rnd() * a.length) | 0];

  let swingT = 0;   // swing clock, reset each round
  let staticLayer = null, glowSprite = null;
  const splashCd = [0, 0];

  // ---------- drawing helpers ----------
  function leaf(g, x, y, len, ang, col, vein) {
    g.save();
    g.translate(x, y); g.rotate(ang);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(len * 0.5, -len * 0.32, len, 0);
    g.quadraticCurveTo(len * 0.5, len * 0.32, 0, 0);
    g.fill();
    if (vein) {
      g.strokeStyle = vein; g.lineWidth = Math.max(0.6, len * 0.04);
      g.beginPath(); g.moveTo(len * 0.05, 0); g.lineTo(len * 0.9, 0); g.stroke();
    }
    g.restore();
  }
  // fern frond: curved stem with paired leaflets that shrink toward the tip
  function frond(g, x, y, len, ang, col, curl, n) {
    n = n || 12;
    g.save();
    g.translate(x, y); g.rotate(ang);
    g.strokeStyle = col; g.lineWidth = Math.max(1, len * 0.02); g.lineCap = 'round';
    let px = 0, py = 0, a = 0;
    const step = len / n;
    g.beginPath(); g.moveTo(0, 0);
    const pts = [];
    for (let i = 0; i < n; i++) {
      a += curl / n;
      px += Math.cos(a) * step; py += Math.sin(a) * step;
      g.lineTo(px, py); pts.push([px, py, a]);
    }
    g.stroke();
    g.fillStyle = col;
    for (let i = 0; i < pts.length; i++) {
      const [lx, ly, la] = pts[i], s = len * 0.2 * (1 - i / pts.length * 0.8);
      for (const side of [-1, 1]) {
        g.save(); g.translate(lx, ly); g.rotate(la + side * 1.05);
        g.beginPath(); g.moveTo(0, 0);
        g.quadraticCurveTo(s * 0.5, -s * 0.22, s, 0); g.quadraticCurveTo(s * 0.5, s * 0.22, 0, 0);
        g.fill(); g.restore();
      }
    }
    g.restore();
  }
  // broad tropical leaf (monstera-like) with midrib and side veins
  function broadLeaf(g, x, y, size, ang, col, vein, holes) {
    g.save();
    g.translate(x, y); g.rotate(ang);
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(size * 0.2, -size * 0.55, size * 0.85, -size * 0.45, size, 0);
    g.bezierCurveTo(size * 0.85, size * 0.45, size * 0.2, size * 0.55, 0, 0);
    g.fill();
    if (holes) {
      g.globalCompositeOperation = 'destination-out';
      for (let i = 1; i < 4; i++) {
        for (const s of [-1, 1]) { g.beginPath(); g.ellipse(size * (0.22 + i * 0.17), s * size * 0.2, size * 0.05, size * 0.022, s * 0.5, 0, TAU); g.fill(); }
      }
      g.globalCompositeOperation = 'source-over';
    }
    g.strokeStyle = vein; g.lineWidth = Math.max(0.8, size * 0.025);
    g.beginPath(); g.moveTo(0, 0); g.lineTo(size * 0.95, 0);
    for (let i = 1; i < 5; i++) {
      const vx = size * i * 0.18;
      g.moveTo(vx, 0); g.quadraticCurveTo(vx + size * 0.08, -size * 0.12, vx + size * 0.15, -size * 0.3);
      g.moveTo(vx, 0); g.quadraticCurveTo(vx + size * 0.08, size * 0.12, vx + size * 0.15, size * 0.3);
    }
    g.stroke();
    g.restore();
  }
  function leafCluster(g, x, y, n, size, cols) {
    for (let i = 0; i < n; i++) {
      const a = rnd() * TAU;
      leaf(g, x + Math.cos(a) * size * 0.3 * rnd(), y + Math.sin(a) * size * 0.25 * rnd(), size * (0.5 + rnd() * 0.6), a, pick(cols));
    }
  }
  function trunk(g, x, wTop, wBot, col, dark, buttress) {
    const grd = g.createLinearGradient(x - wBot / 2, 0, x + wBot / 2, 0);
    grd.addColorStop(0, dark); grd.addColorStop(0.35, col); grd.addColorStop(1, dark);
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(x - wTop / 2, 0);
    g.lineTo(x + wTop / 2, 0);
    const b = buttress || 14;
    g.quadraticCurveTo(x + wBot / 2 - 4, FLOOR - 40, x + wBot / 2 + b, FLOOR + 4);
    g.lineTo(x - wBot / 2 - b, FLOOR + 4);
    g.quadraticCurveTo(x - wBot / 2 + 4, FLOOR - 40, x - wTop / 2, 0);
    g.fill();
  }
  // buttress root fins at the foot of a trunk
  function buttressRoots(g, x, w, col) {
    g.fillStyle = col;
    for (const s of [-1, 1]) {
      for (let k = 0; k < 2; k++) {
        const reach = w * (0.55 + k * 0.35), hgt = 50 + k * 30;
        g.beginPath();
        g.moveTo(x + s * w * 0.25, FLOOR - hgt);
        g.quadraticCurveTo(x + s * w * 0.35, FLOOR - 12, x + s * reach, FLOOR + 3);
        g.lineTo(x + s * (reach - 16), FLOOR + 3);
        g.quadraticCurveTo(x + s * w * 0.2, FLOOR - 10, x + s * w * 0.1, FLOOR - hgt + 10);
        g.closePath(); g.fill();
      }
    }
  }
  // bromeliad tuft (epiphyte) sitting on a trunk or branch
  function bromeliad(g, x, y, s, flower) {
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.32;
      leaf(g, x, y, s * (0.8 + (i % 2) * 0.35), a, i % 2 ? '#3d6a2c' : '#2f5523', 'rgba(150,190,110,.35)');
    }
    if (flower) {
      g.fillStyle = flower;
      g.beginPath(); g.moveTo(x - 3, y - 2); g.lineTo(x, y - s * 0.9); g.lineTo(x + 3, y - 2); g.fill();
    }
  }
  // small orchid flower
  function orchid(g, x, y, s, col) {
    g.save(); g.translate(x, y);
    g.fillStyle = col;
    for (let i = 0; i < 5; i++) {
      g.save(); g.rotate(i * TAU / 5 - Math.PI / 2);
      g.beginPath(); g.ellipse(0, -s * 0.55, s * 0.28, s * 0.55, 0, 0, TAU); g.fill();
      g.restore();
    }
    g.fillStyle = '#f2d98a'; g.beginPath(); g.arc(0, 0, s * 0.22, 0, TAU); g.fill();
    g.restore();
  }
  function mushroom(g, x, y, s, cap, glow) {
    g.fillStyle = '#d8ccb0';
    g.fillRect(x - s * 0.12, y - s * 0.8, s * 0.24, s * 0.8);
    g.fillStyle = cap;
    g.beginPath(); g.ellipse(x, y - s * 0.8, s * 0.5, s * 0.32, 0, Math.PI, 0); g.fill();
    g.strokeStyle = 'rgba(40,28,16,.45)'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(x - s * 0.45, y - s * 0.8); g.lineTo(x + s * 0.45, y - s * 0.8); g.stroke();
    if (glow) {
      g.fillStyle = 'rgba(255,255,255,.35)';
      g.beginPath(); g.ellipse(x - s * 0.15, y - s * 0.95, s * 0.12, s * 0.06, -0.3, 0, TAU); g.fill();
    }
  }

  // a thick branch whose walkable top edge is y, running from x0 to x1
  function branch(g, x0, x1, y, fromLeft) {
    const thick = 18;
    const base = fromLeft ? x0 : x1, tip = fromLeft ? x1 : x0, lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    // soft shadow under the branch on the trunk/air
    g.fillStyle = 'rgba(0,0,0,.18)';
    g.beginPath(); g.ellipse((x0 + x1) / 2, y + thick + 14, (hi - lo) * 0.45, 8, 0, 0, TAU); g.fill();
    const grd = g.createLinearGradient(0, y - 2, 0, y + thick + 8);
    grd.addColorStop(0, '#76593a'); grd.addColorStop(0.3, '#4f3a24'); grd.addColorStop(1, '#25190f');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(base, y - 4);
    g.lineTo(tip, y);
    g.quadraticCurveTo(tip + (fromLeft ? 10 : -10), y + 7, tip, y + 11);
    g.quadraticCurveTo((base + tip) / 2, y + thick + 2, base, y + thick + 16);
    g.closePath();
    g.fill();
    // bark plates and fissures
    g.strokeStyle = 'rgba(18,10,4,.55)'; g.lineWidth = 1.4;
    for (let i = 0; i < 14; i++) {
      const bx = lo + 14 + rnd() * (hi - lo - 28);
      g.beginPath(); g.moveTo(bx, y + 4 + rnd() * 3); g.quadraticCurveTo(bx + 6, y + 9, bx + 14 * (rnd() - 0.3), y + 12 + rnd() * 5); g.stroke();
    }
    g.strokeStyle = 'rgba(150,118,80,.25)'; g.lineWidth = 1;
    for (let i = 0; i < 8; i++) {
      const bx = lo + 10 + rnd() * (hi - lo - 20);
      g.beginPath(); g.moveTo(bx, y + 3); g.lineTo(bx + 10, y + 4); g.stroke();
    }
    // a knot
    const kx = lo + (hi - lo) * (fromLeft ? 0.42 : 0.58);
    g.fillStyle = '#2c1e12'; g.beginPath(); g.ellipse(kx, y + 9, 6, 4, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(140,105,70,.5)'; g.lineWidth = 1; g.beginPath(); g.ellipse(kx, y + 9, 8, 5.5, 0, 0, TAU); g.stroke();
    // moss blanket on the walkable top, with hanging fringe
    g.fillStyle = '#3e6a2b';
    g.beginPath(); g.moveTo(lo + 4, y + 2);
    for (let x = lo + 4; x <= hi - 4; x += 6) g.lineTo(x, y - 1.5 - rnd() * 2);
    g.lineTo(hi - 4, y + 4); g.lineTo(lo + 4, y + 4); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(150,196,100,.6)'; g.lineWidth = 1.6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(lo + 6, y - 1); g.lineTo(hi - 6, y - 1); g.stroke();
    g.strokeStyle = 'rgba(62,106,43,.85)'; g.lineWidth = 1.2;
    for (let x = lo + 8; x < hi - 8; x += 5 + rnd() * 8) {
      const l = 3 + rnd() * 8;
      g.beginPath(); g.moveTo(x, y + 3); g.quadraticCurveTo(x + 1, y + 3 + l * 0.6, x + (rnd() - 0.5) * 3, y + 3 + l); g.stroke();
    }
    for (let i = 0; i < 12; i++) {
      const mx = lo + 6 + rnd() * (hi - lo - 12);
      leaf(g, mx, y, 7 + rnd() * 6, -Math.PI / 2 + (rnd() - 0.5) * 2.2, rnd() < 0.5 ? '#3f6a2e' : '#4f7d36');
    }
    // hanging moss strands under the branch
    g.strokeStyle = 'rgba(96,128,70,.55)'; g.lineWidth = 1;
    for (let i = 0; i < 10; i++) {
      const hx = lo + 20 + rnd() * (hi - lo - 40), hl = 10 + rnd() * 26;
      g.beginPath(); g.moveTo(hx, y + 14); g.bezierCurveTo(hx + 3, y + 14 + hl * 0.3, hx - 3, y + 14 + hl * 0.6, hx + 1, y + 14 + hl); g.stroke();
    }
    // leafy tuft at the tip, hanging below the walk line only
    for (let i = 0; i < 18; i++) leaf(g, tip + (fromLeft ? -8 : 8) * rnd(), y + 10 + rnd() * 8, 16 + rnd() * 16, Math.PI / 2 + (rnd() - 0.5) * 1.8, pick(['#2d5124', '#3a6a2b', '#25441e', '#467a32']), 'rgba(140,180,100,.25)');
    // epiphytes near the trunk
    bromeliad(g, base + (fromLeft ? 26 : -26), y - 1, 15, '#b8433a');
    orchid(g, base + (fromLeft ? 52 : -52), y + 15, 5, '#c784b6');
    orchid(g, base + (fromLeft ? 61 : -61), y + 19, 4, '#b670a4');
  }

  // ---------- static layer (painted once) ----------
  function paintStatic() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    rnd = rng(5);
    // jungle air
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#0a1811'); sky.addColorStop(0.4, '#173225'); sky.addColorStop(0.78, '#12251b'); sky.addColorStop(1, '#09120c');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    // gaps in the far canopy where daylight leaks in
    for (const [gx, gy, gr] of [[360, 70, 110], [610, 55, 90], [480, 120, 150]]) {
      const gl = g.createRadialGradient(gx, gy, 6, gx, gy, gr);
      gl.addColorStop(0, 'rgba(170,210,140,.20)'); gl.addColorStop(1, 'rgba(170,210,140,0)');
      g.fillStyle = gl; g.fillRect(gx - gr, gy - gr, gr * 2, gr * 2);
    }
    // distant haze glow behind the arena
    const glow = g.createRadialGradient(W / 2, 250, 30, W / 2, 260, 520);
    glow.addColorStop(0, 'rgba(88,140,92,.22)'); glow.addColorStop(1, 'rgba(88,140,92,0)');
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    // three layers of far trunks, each followed by a thin fog sheet (aerial perspective)
    const layers = [
      { n: 10, w: [12, 22], col: '#1d3a2c', dark: '#173024', fog: 0.10 },
      { n: 8, w: [20, 34], col: '#18321f', dark: '#11251a', fog: 0.07 },
      { n: 6, w: [30, 48], col: '#132819', dark: '#0c1c12', fog: 0.0 },
    ];
    for (const L of layers) {
      for (let i = 0; i < L.n; i++) {
        const x = 140 + rnd() * (W - 280), w = L.w[0] + rnd() * (L.w[1] - L.w[0]);
        trunk(g, x, w * 0.8, w, L.col, L.dark, 8 + w * 0.3);
        // a few hanging lianas off each trunk
        g.strokeStyle = 'rgba(40,72,44,.4)'; g.lineWidth = 1.5;
        g.beginPath(); g.moveTo(x, 40 + rnd() * 60); g.bezierCurveTo(x + 20, 160, x - 16, 230, x + 10 + rnd() * 20, 260 + rnd() * 80); g.stroke();
      }
      // distant palm / fern silhouettes in front of this layer
      for (let i = 0; i < 4; i++) {
        const px = 120 + rnd() * (W - 240), py = 300 + rnd() * 120;
        for (let k = 0; k < 6; k++) frond(g, px, py, 50 + rnd() * 40, -Math.PI / 2 + (k - 2.5) * 0.45, L.dark, (k - 2.5) * 0.18, 10);
      }
      if (L.fog) {
        const fg = g.createLinearGradient(0, 160, 0, FLOOR);
        fg.addColorStop(0, `rgba(110,150,115,0)`); fg.addColorStop(0.7, `rgba(110,150,115,${L.fog})`); fg.addColorStop(1, `rgba(110,150,115,${L.fog * 0.6})`);
        g.fillStyle = fg; g.fillRect(0, 160, W, FLOOR - 160);
      }
    }
    // big framing trunks that hold the two branches
    for (const tx of [62, W - 62]) {
      trunk(g, tx, 92, 112, '#3b2b1c', '#1a120b', 16);
      buttressRoots(g, tx, 112, '#2c2015');
    }
    for (const tx of [62, W - 62]) {
      const toward = tx < W / 2 ? 1 : -1;  // side facing the arena (light side)
      // vertical bark fissures
      for (let i = 0; i < 26; i++) {
        const x = tx - 42 + rnd() * 84, y = 60 + rnd() * (FLOOR - 120);
        g.strokeStyle = 'rgba(10,6,3,.55)'; g.lineWidth = 1.5 + rnd() * 1.5;
        g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 4, y + 20, x - 3, y + 40, x + 1, y + 50 + rnd() * 40); g.stroke();
        g.strokeStyle = 'rgba(150,115,80,.16)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x + 2, y + 2); g.lineTo(x + 3, y + 30); g.stroke();
      }
      // rim light on the arena-facing edge
      const rim = g.createLinearGradient(tx + toward * 30, 0, tx + toward * 56, 0);
      rim.addColorStop(0, 'rgba(160,190,120,0)'); rim.addColorStop(1, 'rgba(160,190,120,.10)');
      g.fillStyle = rim; g.fillRect(Math.min(tx + toward * 30, tx + toward * 56), 80, 26, FLOOR - 90);
      // moss patches climbing the trunk
      for (let i = 0; i < 26; i++) leaf(g, tx + toward * (10 + rnd() * 36), 120 + rnd() * (FLOOR - 170), 8 + rnd() * 9, rnd() * TAU, pick(['rgba(70,112,52,.6)', 'rgba(90,130,60,.5)', 'rgba(52,90,40,.65)']));
      // strangler-fig roots wrapping down the trunk
      g.strokeStyle = 'rgba(70,52,34,.85)'; g.lineWidth = 4;
      for (let k = 0; k < 2; k++) {
        const ox = tx + (k ? 20 : -24);
        g.beginPath(); g.moveTo(ox, 90);
        g.bezierCurveTo(ox + 30 * toward, 200, ox - 20 * toward, 300, ox + 6, FLOOR);
        g.stroke();
      }
      // epiphytes and a hollow
      bromeliad(g, tx + toward * 30, 220, 18, '#c55a3a');
      bromeliad(g, tx - toward * 20, 400, 14);
      g.fillStyle = '#120c07'; g.beginPath(); g.ellipse(tx - toward * 8, 270, 9, 15, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(120,90,60,.5)'; g.lineWidth = 2; g.beginPath(); g.ellipse(tx - toward * 8, 270, 11, 17, 0, 0, TAU); g.stroke();
      // big broad leaves at the trunk base
      broadLeaf(g, tx + toward * 40, FLOOR - 4, 60, -Math.PI / 2 + toward * 0.75, '#244a22', 'rgba(120,170,90,.35)', true);
      broadLeaf(g, tx + toward * 22, FLOOR - 2, 48, -Math.PI / 2 + toward * 0.25, '#1e3f1d', 'rgba(120,170,90,.3)', false);
      frond(g, tx - toward * 30, FLOOR, 70, -Math.PI / 2 - toward * 0.5, '#24481f', -toward * 0.5, 12);
    }
    // a twig off the right trunk for the parrot
    g.strokeStyle = '#3b2b1c'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(W - 100, 166); g.quadraticCurveTo(W - 130, 160, W - 152, 162); g.stroke();
    leaf(g, W - 150, 162, 14, -2.6, '#3a6a2b', 'rgba(140,180,100,.3)');
    leaf(g, W - 140, 161, 12, 2.4, '#2f5a24');
    // branches (the two side platforms)
    branch(g, 100, 300, 330, true);
    branch(g, 660, 860, 330, false);
    // canopy across the top (HUD band, kept dim), darker at the very top
    for (let i = 0; i < 50; i++) leafCluster(g, rnd() * W, rnd() * 70 - 6, 8, 46, ['#14301c', '#1a3a22', '#0f2416', '#21462a']);
    for (let i = 0; i < 20; i++) leafCluster(g, rnd() < 0.5 ? rnd() * 170 : W - rnd() * 170, 60 + rnd() * 90, 7, 40, ['#1a3a22', '#22492b', '#163120']);
    const topShade = g.createLinearGradient(0, 0, 0, 70);
    topShade.addColorStop(0, 'rgba(4,10,6,.55)'); topShade.addColorStop(1, 'rgba(4,10,6,0)');
    g.fillStyle = topShade; g.fillRect(0, 0, W, 70);

    // ---- ground ----
    const soil = g.createLinearGradient(0, FLOOR, 0, H);
    soil.addColorStop(0, '#2e2317'); soil.addColorStop(0.35, '#211910'); soil.addColorStop(1, '#0f0b06');
    g.fillStyle = soil; g.fillRect(0, FLOOR, W, H - FLOOR);
    // soil strata and grit
    g.strokeStyle = 'rgba(70,52,32,.35)'; g.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      const yy = FLOOR + 20 + k * 14;
      g.beginPath(); g.moveTo(0, yy);
      for (let x = 0; x <= W; x += 40) g.lineTo(x, yy + Math.sin(x * 0.02 + k) * 2.5);
      g.stroke();
    }
    for (let i = 0; i < 320; i++) {
      g.fillStyle = `rgba(${rnd() < 0.5 ? '96,74,46' : '8,6,3'},${0.25 + rnd() * 0.3})`;
      g.fillRect(rnd() * W, FLOOR + 6 + rnd() * (H - FLOOR - 6), 1.5 + rnd() * 3, 1 + rnd() * 2);
    }
    // pebbles with a lit top
    for (let i = 0; i < 26; i++) {
      const px = rnd() * W, py = FLOOR + 12 + rnd() * 50, pr = 2 + rnd() * 4;
      if (px > MUD.x0 - 20 && px < MUD.x1 + 20 && py < FLOOR + 30) continue;
      g.fillStyle = '#3a3428'; g.beginPath(); g.ellipse(px, py, pr * 1.3, pr, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(160,150,120,.25)'; g.beginPath(); g.ellipse(px - pr * 0.3, py - pr * 0.4, pr * 0.6, pr * 0.3, 0, 0, TAU); g.fill();
    }
    // surface roots snaking out from the big trunks
    for (const [sx, dir] of [[62, 1], [W - 62, -1]]) {
      for (let k = 0; k < 3; k++) {
        const len = 90 + k * 50, yy = FLOOR + 6 + k * 9;
        g.strokeStyle = '#2a1e13'; g.lineWidth = 6 - k * 1.5; g.lineCap = 'round';
        g.beginPath(); g.moveTo(sx + dir * 30, FLOOR + 2);
        g.bezierCurveTo(sx + dir * len * 0.4, yy - 6, sx + dir * len * 0.7, yy + 6, sx + dir * len, yy + 2); g.stroke();
        g.strokeStyle = 'rgba(140,105,70,.3)'; g.lineWidth = 1;
        g.beginPath(); g.moveTo(sx + dir * 34, FLOOR + 1);
        g.bezierCurveTo(sx + dir * len * 0.4, yy - 8, sx + dir * len * 0.7, yy + 4, sx + dir * len, yy); g.stroke();
      }
    }
    // leaf litter along the surface
    for (let i = 0; i < 160; i++) {
      const lx = rnd() * W, ly = FLOOR + 3 + rnd() * 26;
      if (lx > MUD.x0 - 6 && lx < MUD.x1 + 6 && ly < FLOOR + 22) continue;
      leaf(g, lx, ly, 6 + rnd() * 7, rnd() * TAU, pick(['rgba(110,78,40,.7)', 'rgba(130,100,46,.6)', 'rgba(80,60,30,.7)', 'rgba(70,96,40,.6)', 'rgba(150,84,40,.5)']));
    }
    // mud pool: wet rim, body, swirl marks and footprints
    const mx = (MUD.x0 + MUD.x1) / 2, mw = (MUD.x1 - MUD.x0) / 2;
    g.fillStyle = '#18110a';
    g.beginPath(); g.ellipse(mx, FLOOR + 10, mw + 14, 20, 0, 0, TAU); g.fill();
    g.fillStyle = 'rgba(60,44,26,.9)';
    g.beginPath(); g.ellipse(mx, FLOOR + 8, mw + 6, 16, 0, 0, TAU); g.fill();
    const mud = g.createLinearGradient(0, FLOOR - 4, 0, FLOOR + 22);
    mud.addColorStop(0, '#5e4329'); mud.addColorStop(0.5, '#47331f'); mud.addColorStop(1, '#2b1f12');
    g.fillStyle = mud;
    g.beginPath(); g.ellipse(mx, FLOOR + 6, mw, 13, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(30,20,10,.45)'; g.lineWidth = 1.2;
    for (let k = 0; k < 5; k++) {
      const sx = mx - mw * 0.7 + k * mw * 0.35;
      g.beginPath(); g.ellipse(sx, FLOOR + 6 + (k % 2) * 3, 12 + k * 2, 3, 0.1, 0.3, Math.PI * 1.4); g.stroke();
    }
    for (const [fx, fy] of [[mx - 52, FLOOR + 4], [mx - 30, FLOOR + 9], [mx + 34, FLOOR + 5], [mx + 56, FLOOR + 10]]) {
      g.fillStyle = 'rgba(25,17,9,.55)'; g.beginPath(); g.ellipse(fx, fy, 7, 2.6, 0, 0, TAU); g.fill();
      g.fillStyle = 'rgba(140,110,70,.18)'; g.beginPath(); g.ellipse(fx, fy - 1.6, 6, 0.9, 0, 0, TAU); g.fill();
    }
    // grass edge along the floor (skipping the mud), lit blade tips
    g.strokeStyle = '#3f6a2e'; g.lineWidth = 3; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, FLOOR); g.lineTo(MUD.x0 - 8, FLOOR); g.moveTo(MUD.x1 + 8, FLOOR); g.lineTo(W, FLOOR); g.stroke();
    for (let x = 4; x < W; x += 4 + rnd() * 6) {
      if (x > MUD.x0 - 10 && x < MUD.x1 + 10) continue;
      const h = 5 + rnd() * 13, bend = (rnd() - 0.5) * 9;
      g.strokeStyle = pick(['#4b7d34', '#355c27', '#5a8a3c', '#2f5222']); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, FLOOR + 2); g.quadraticCurveTo(x + 2, FLOOR - h * 0.6, x + bend, FLOOR - h); g.stroke();
      if (rnd() < 0.25) { g.fillStyle = 'rgba(190,220,130,.4)'; g.fillRect(x + bend - 0.5, FLOOR - h - 0.5, 1.2, 1.2); }
    }
    // clover and tiny flowers in the grass
    for (let i = 0; i < 18; i++) {
      const fx = rnd() * W;
      if (fx > MUD.x0 - 20 && fx < MUD.x1 + 20) continue;
      g.fillStyle = pick(['#d9d2a0', '#c99ac0', '#e6c46a']);
      g.beginPath(); g.arc(fx, FLOOR - 3 - rnd() * 6, 1.6, 0, TAU); g.fill();
    }
    // small ferns between the spawns and the trunks
    for (const fx of [150, W - 150, 360, W - 360]) {
      for (let k = 0; k < 5; k++) frond(g, fx + (k - 2) * 4, FLOOR + 1, 26 + (k % 2) * 10, -Math.PI / 2 + (k - 2) * 0.5, '#2f5a24', (k - 2) * 0.22, 8);
    }
    // glowing mushroom clusters at the trunk bases (glow pulses in the dynamic layer)
    for (const [mx2, dir] of [[118, 1], [W - 118, -1]]) {
      mushroom(g, mx2 - dir * 46, FLOOR + 1, 12, '#7fb8a2', true);
      mushroom(g, mx2 - dir * 36, FLOOR + 2, 8, '#6aa892', true);
      mushroom(g, mx2 - dir * 54, FLOOR + 2, 7, '#8cc6b0', true);
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

  // stumps never change, so each one is painted once to its own sprite
  const stumpSprites = {};
  function stumpSprite(o, mirror) {
    const key = o.w + 'x' + o.h + (mirror ? 'm' : '');
    if (stumpSprites[key]) return stumpSprites[key];
    const pad = 18, c = document.createElement('canvas');
    c.width = o.w + pad * 2; c.height = o.h + pad;
    const g = c.getContext('2d');
    const rr = rnd; rnd = rng(mirror ? 77 : 41);
    if (mirror) { g.translate(c.width, 0); g.scale(-1, 1); }
    const x = pad, w = o.w;
    const yb = c.height, yt = yb - o.h;                   // floor line and top face in sprite space
    // ground contact shadow
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(x + w / 2, yb - 1, w / 2 + 14, 4, 0, 0, TAU); g.fill();
    // flared roots
    g.fillStyle = '#2b1e13';
    g.beginPath();
    g.moveTo(x - 14, yb); g.quadraticCurveTo(x + 2, yb - 10, x + 4, yt + 14);
    g.lineTo(x + w - 4, yt + 14); g.quadraticCurveTo(x + w - 2, yb - 10, x + w + 14, yb);
    g.closePath(); g.fill();
    // body with side lighting
    const grd = g.createLinearGradient(x, 0, x + w, 0);
    grd.addColorStop(0, '#2a1d12'); grd.addColorStop(0.35, '#634830'); grd.addColorStop(0.6, '#4a3521'); grd.addColorStop(1, '#22170d');
    g.fillStyle = grd; g.fillRect(x + 2, yt + 6, w - 4, o.h - 6);
    // bark plates
    for (let i = 0; i < 5; i++) {
      const bx = x + 6 + i * 10 + rnd() * 3;
      g.strokeStyle = 'rgba(12,7,3,.65)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(bx, yt + 13); g.bezierCurveTo(bx + 2, yt + 22, bx - 2, yt + 32, bx + 1, yb - 3); g.stroke();
      g.strokeStyle = 'rgba(160,125,85,.18)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(bx + 2, yt + 14); g.lineTo(bx + 3, yt + 30); g.stroke();
    }
    // bark lip around the cut
    g.fillStyle = '#2e2014'; g.beginPath(); g.ellipse(x + w / 2, yt + 7, w / 2 + 1, 8.5, 0, 0, TAU); g.fill();
    // cut top: heartwood with growth rings and radial cracks
    const face = g.createRadialGradient(x + w / 2 - 6, yt + 4, 2, x + w / 2, yt + 6, w / 2);
    face.addColorStop(0, '#c09a68'); face.addColorStop(0.7, '#9a7a52'); face.addColorStop(1, '#6e5233');
    g.fillStyle = face; g.beginPath(); g.ellipse(x + w / 2, yt + 6, w / 2 - 2, 6.5, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(90,62,36,.75)'; g.lineWidth = 0.8;
    for (const r of [0.82, 0.64, 0.47, 0.3, 0.14]) { g.beginPath(); g.ellipse(x + w / 2 + (1 - r) * 1.5, yt + 6, (w / 2 - 2) * r, 6.5 * r, 0, 0, TAU); g.stroke(); }
    g.strokeStyle = 'rgba(50,32,16,.8)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(x + w / 2, yt + 6); g.lineTo(x + w / 2 + 16, yt + 9); g.moveTo(x + w / 2, yt + 6); g.lineTo(x + w / 2 - 12, yt + 2); g.stroke();
    // moss cap on one rim and down the side
    g.fillStyle = 'rgba(78,120,52,.9)';
    g.beginPath(); g.ellipse(x + 10, yt + 9, 10, 4, -0.3, 0, TAU); g.fill();
    for (let i = 0; i < 8; i++) leaf(g, x + 3 + rnd() * 10, yt + 12 + rnd() * (o.h - 18), 7 + rnd() * 5, rnd() * TAU, 'rgba(70,112,52,.85)');
    // mushroom shelf fungus and a cluster of little caps
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i % 2 ? '#b98a4e' : '#a4743c';
      g.beginPath(); g.ellipse(x + w - 2, yt + 20 + i * 7, 7 - i, 2.6, 0, Math.PI, TAU); g.fill();
    }
    mushroom(g, x + w + 6, yb, 9, '#a8553a', true);
    mushroom(g, x + w + 12, yb, 6, '#b8673f', true);
    // a sapling sprouting from the stump side
    g.strokeStyle = '#4f7d36'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x + 4, yt + 18); g.quadraticCurveTo(x - 6, yt + 6, x - 4, yt - 6); g.stroke();
    leaf(g, x - 4, yt - 6, 9, -2.2, '#5a8a3c', 'rgba(180,210,140,.4)');
    leaf(g, x - 3, yt + 2, 8, -0.6, '#4f7d36');
    rnd = rr;
    return (stumpSprites[key] = { c, ox: pad, oy: o.h });
  }
  function drawStump(g, o) {
    const s = stumpSprite(o, o.x > W / 2);
    g.drawImage(s.c, Math.round(o.x - s.ox), Math.round(o.y + o.h - s.c.height));
  }

  function drawBamboo(g, o, t) {
    const { x, w, h } = o;
    const yb = o.y + h;
    const hp = typeof o.hp === 'number' ? o.hp : BAMBOO_HP;
    // contact shadow
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.ellipse(x + w / 2, yb, w / 2 + 8, 3.5, 0, 0, TAU); g.fill();
    if (hp <= 0) {
      // broken stubs with split, jagged tops and splinters on the ground
      for (let i = 0; i < 3; i++) {
        const sx = x + 2 + i * 8, sh = 10 + ((i * 7) % 9);
        const grd = g.createLinearGradient(sx, 0, sx + 6, 0);
        grd.addColorStop(0, '#4f5d24'); grd.addColorStop(0.5, '#8a9a45'); grd.addColorStop(1, '#4f5d24');
        g.fillStyle = grd; g.fillRect(sx, yb - sh, 6, sh);
        g.fillStyle = '#d8d08a';
        g.beginPath(); g.moveTo(sx, yb - sh); g.lineTo(sx + 1.5, yb - sh - 6); g.lineTo(sx + 3, yb - sh - 1); g.lineTo(sx + 4.5, yb - sh - 4); g.lineTo(sx + 6, yb - sh); g.fill();
      }
      g.strokeStyle = 'rgba(200,190,120,.7)'; g.lineWidth = 1.2;
      for (let i = 0; i < 5; i++) {
        const sx = x - 14 + i * 13, sy = yb - 1 - (i % 2);
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + 7, sy - 1 + (i % 3)); g.stroke();
      }
      g.fillStyle = 'rgba(95,120,50,.8)';
      g.save(); g.translate(x + w + 10, yb - 2); g.rotate(0.08); g.fillRect(-14, -3, 28, 5); g.restore();
      return;
    }
    const dmg = 1 - hp / BAMBOO_HP;
    const tilt = dmg * 0.12 * Math.sin(t * 9) * (dmg > 0.5 ? 1 : 0.3) + Math.sin(t * 1.3 + x) * 0.006;
    g.save();
    g.translate(x + w / 2, yb); g.rotate(tilt);
    // three culms of slightly different heights
    for (let i = 0; i < 3; i++) {
      const px = -w / 2 + 1 + i * 8, ph = h - (i === 1 ? 0 : 8 + i * 3);
      const grd = g.createLinearGradient(px, 0, px + 7, 0);
      grd.addColorStop(0, '#46531f'); grd.addColorStop(0.35, '#9aab52'); grd.addColorStop(0.6, '#7d8e3e'); grd.addColorStop(1, '#3d4a1a');
      g.fillStyle = grd; g.fillRect(px, -ph, 7, ph);
      // nodes: dark band with a pale ridge above
      for (let k = 18; k < ph - 4; k += 22) {
        g.fillStyle = '#323d14'; g.fillRect(px - 0.6, -k, 8.2, 2.2);
        g.fillStyle = 'rgba(220,225,150,.45)'; g.fillRect(px - 0.4, -k - 1.2, 7.8, 1);
      }
      // cut top showing the hollow
      g.fillStyle = '#c4c27a'; g.beginPath(); g.ellipse(px + 3.5, -ph, 3.5, 1.6, 0, 0, TAU); g.fill();
      g.fillStyle = '#3a3a18'; g.beginPath(); g.ellipse(px + 3.5, -ph, 2, 0.8, 0, 0, TAU); g.fill();
    }
    // rope-vine lashings, wrapped twice
    for (const ly of [-h * 0.3, -h * 0.72]) {
      g.strokeStyle = '#2f5423'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(-w / 2 - 1, ly); g.lineTo(w / 2 + 1, ly + 3); g.stroke();
      g.strokeStyle = '#4a7a33'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(-w / 2 - 1, ly + 3); g.lineTo(w / 2 + 1, ly); g.stroke();
      g.strokeStyle = '#3d6b2c'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(w / 2 + 1, ly + 2); g.quadraticCurveTo(w / 2 + 5, ly + 8, w / 2 + 3, ly + 13); g.stroke();
    }
    // cracks and splits as it takes damage
    if (dmg > 0.01) {
      g.strokeStyle = `rgba(30,24,10,${0.4 + dmg * 0.5})`; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(-6, -h * 0.55); g.lineTo(-2, -h * 0.45); g.lineTo(-7, -h * 0.35);
      if (dmg > 0.4) { g.moveTo(5, -h * 0.8); g.lineTo(9, -h * 0.68); g.lineTo(4, -h * 0.6); }
      if (dmg > 0.7) { g.moveTo(-1, -h * 0.2); g.lineTo(3, -h * 0.12); g.lineTo(0, -h * 0.04); }
      g.stroke();
      g.strokeStyle = `rgba(230,220,150,${dmg * 0.5})`; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(-5, -h * 0.55); g.lineTo(-1, -h * 0.45); g.stroke();
    }
    // leaf sprigs at the top nodes
    const flut = Math.sin(t * 2.1 + x * 0.1) * 0.08;
    leaf(g, -w / 2 + 4, -h + 10, 15, -2.3 + flut, '#4f7d36', 'rgba(170,210,120,.35)');
    leaf(g, -w / 2 + 3, -h + 14, 12, -2.8 + flut, '#3f6a2e');
    leaf(g, w / 2 - 2, -h + 4, 14, -0.7 - flut, '#3f6a2e', 'rgba(170,210,120,.3)');
    leaf(g, w / 2 - 1, -h + 26, 11, -0.2 - flut, '#4f7d36');
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

  function drawVine(g, x0, y0, x1, y1, sway, col, width, leaves, t) {
    const mx = (x0 + x1) / 2 + sway, my = (y0 + y1) / 2;
    g.strokeStyle = col; g.lineWidth = width; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
    // twisted strand highlight
    g.strokeStyle = 'rgba(150,190,110,.22)'; g.lineWidth = Math.max(0.8, width * 0.35);
    g.beginPath(); g.moveTo(x0 - 1, y0); g.quadraticCurveTo(mx - 1, my, x1 - 1, y1); g.stroke();
    if (leaves) {
      for (let i = 1; i < leaves; i++) {
        const tt = i / leaves, it = 1 - tt;
        const x = it * it * x0 + 2 * it * tt * mx + tt * tt * x1, y = it * it * y0 + 2 * it * tt * my + tt * tt * y1;
        const flutter = t === undefined ? 0 : Math.sin(t * 2.3 + i * 1.7 + x0) * 0.12;
        const big = i % 3 === 0;
        leaf(g, x, y, big ? 14 : 10, (i % 2 ? 0.5 : Math.PI - 0.5) + sway * 0.01 + flutter, big ? '#2e5423' : '#3d6b2c', 'rgba(150,190,110,.3)');
      }
    }
  }

  function drawLog(g, t) {
    const p = logPlat;
    const a = Math.sin(swingT * LOG.speed);
    const sway = -a * 10;
    // shadow cast on the floor, moving with the swing
    g.fillStyle = 'rgba(0,0,0,.16)';
    g.beginPath(); g.ellipse(p.x + p.w / 2, FLOOR + 3, p.w * 0.45, 4, 0, 0, TAU); g.fill();
    // supporting vines from the canopy (taut, so almost straight)
    drawVine(g, LOG.cx - 70, -6, p.x + 22, p.y + 4, sway * 0.4, '#355f27', 4, 9, t);
    drawVine(g, LOG.cx + 70, -6, p.x + p.w - 22, p.y + 4, sway * 0.4, '#355f27', 4, 9, t);
    // the log itself
    const grd = g.createLinearGradient(0, p.y - 2, 0, p.y + p.h);
    grd.addColorStop(0, '#7d5e3d'); grd.addColorStop(0.35, '#58402a'); grd.addColorStop(1, '#271b10');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(p.x + 10, p.y);
    g.lineTo(p.x + p.w - 10, p.y);
    g.quadraticCurveTo(p.x + p.w + 2, p.y + p.h / 2, p.x + p.w - 10, p.y + p.h);
    g.lineTo(p.x + 10, p.y + p.h);
    g.quadraticCurveTo(p.x - 2, p.y + p.h / 2, p.x + 10, p.y);
    g.fill();
    // wood grain running along the log
    g.strokeStyle = 'rgba(20,12,6,.45)'; g.lineWidth = 1;
    for (let k = 0; k < 4; k++) {
      const yy = p.y + 5 + k * 4;
      g.beginPath(); g.moveTo(p.x + 14, yy);
      for (let xx = p.x + 14; xx < p.x + p.w - 14; xx += 18) g.lineTo(xx, yy + Math.sin(xx * 0.09 + k * 2) * 1.2);
      g.stroke();
    }
    // bark grooves
    g.strokeStyle = 'rgba(20,12,6,.55)'; g.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      const bx = p.x + 24 + i * 26;
      g.beginPath(); g.moveTo(bx, p.y + 5); g.lineTo(bx + 16, p.y + 7); g.stroke();
      g.beginPath(); g.moveTo(bx + 8, p.y + 13); g.lineTo(bx + 22, p.y + 15); g.stroke();
    }
    // a knot and lichen spots
    g.fillStyle = '#2a1c10'; g.beginPath(); g.ellipse(p.x + 70, p.y + 12, 5, 3.5, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(150,115,75,.5)'; g.lineWidth = 1; g.beginPath(); g.ellipse(p.x + 70, p.y + 12, 7, 5, 0, 0, TAU); g.stroke();
    for (const [lx, ly, lr] of [[44, 8, 3], [118, 15, 2.5], [140, 7, 2], [96, 17, 2]]) {
      g.fillStyle = 'rgba(170,180,130,.45)'; g.beginPath(); g.arc(p.x + lx, p.y + ly, lr, 0, TAU); g.fill();
    }
    // end caps with growth rings (both cut ends)
    for (const [ex, sgn] of [[p.x + 9, -1], [p.x + p.w - 9, 1]]) {
      g.fillStyle = '#8f6e47';
      g.beginPath(); g.ellipse(ex, p.y + p.h / 2, 6, p.h / 2 - 1, 0, sgn > 0 ? -Math.PI / 2 : Math.PI / 2, sgn > 0 ? Math.PI / 2 : Math.PI * 1.5); g.fill();
      g.strokeStyle = 'rgba(60,40,22,.8)'; g.lineWidth = 0.8;
      for (const r of [0.65, 0.35]) { g.beginPath(); g.ellipse(ex, p.y + p.h / 2, 6 * r, (p.h / 2 - 1) * r, 0, sgn > 0 ? -Math.PI / 2 : Math.PI / 2, sgn > 0 ? Math.PI / 2 : Math.PI * 1.5); g.stroke(); }
    }
    // vine lashings: a few coils with a dangling end
    for (const lx of [p.x + 22, p.x + p.w - 22]) {
      for (let k = -1; k <= 1; k++) {
        g.strokeStyle = k ? '#2f5423' : '#4a7a33'; g.lineWidth = 2.6;
        g.beginPath(); g.moveTo(lx - 5 + k * 3, p.y - 1); g.lineTo(lx + 5 + k * 3, p.y + p.h + 1); g.stroke();
      }
      g.strokeStyle = '#3d6b2c'; g.lineWidth = 1.5;
      const dang = Math.sin(t * 1.7 + lx * 0.05) * 3 + sway * 0.3;
      g.beginPath(); g.moveTo(lx + 4, p.y + p.h); g.quadraticCurveTo(lx + 6 + dang, p.y + p.h + 10, lx + 3 + dang, p.y + p.h + 18); g.stroke();
      leaf(g, lx + 3 + dang, p.y + p.h + 18, 8, 1.4, '#3d6b2c');
    }
    // mossy walk line with tufts and a little fern growing on top
    g.fillStyle = '#3e6a2b';
    g.beginPath(); g.moveTo(p.x + 12, p.y + 2.5);
    for (let k = 0; k <= 16; k++) g.lineTo(p.x + 12 + k * (p.w - 24) / 16, p.y - 0.5 - ((k * 7) % 3));
    g.lineTo(p.x + p.w - 12, p.y + 2.5); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(150,196,100,.6)'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(p.x + 14, p.y); g.lineTo(p.x + p.w - 14, p.y); g.stroke();
    frond(g, p.x + p.w * 0.62, p.y, 16, -Math.PI / 2 - 0.5, '#4f7d36', 0.5, 6);
    frond(g, p.x + p.w * 0.62, p.y, 13, -Math.PI / 2 + 0.6, '#3f6a2e', -0.4, 5);
  }

  // decorative background vines (x anchor, length, phase)
  const VINES = [[150, 230, 0.3], [205, 170, 1.7], [345, 140, 2.4], [615, 140, 0.9], [755, 170, 2.9], [810, 230, 1.2]];
  // decorations from fixed seeds (same on every client)
  const drng = rng(2024);
  const FLIES = [];
  for (let i = 0; i < 20; i++) FLIES.push({ x: 60 + drng() * 840, y: 110 + drng() * 320, p: drng() * 10, s: 0.4 + drng() * 0.6 });
  const FALL = [];
  for (let i = 0; i < 8; i++) FALL.push({ x: drng() * W, o: drng() * 20, s: 18 + drng() * 16, c: ['#3f6a2e', '#6b7a2c', '#7a5a2a', '#4f7d36'][i % 4], z: 8 + drng() * 5 });
  const MOTES = [];
  for (let i = 0; i < 26; i++) MOTES.push({ ray: i % 4, u: drng(), v: drng(), s: 0.02 + drng() * 0.03 });
  const HANG = []; // swaying leaf fringe hanging from the canopy edge
  for (let i = 0; i < 22; i++) HANG.push({ x: 10 + i * 44 + drng() * 20, l: 16 + drng() * 30, p: drng() * TAU });
  const REEDS = [];
  for (const ex of [MUD.x0 - 6, MUD.x1 + 6]) for (let i = 0; i < 6; i++) REEDS.push({ x: ex + (drng() - 0.5) * 16, h: 20 + drng() * 18, lean: (drng() - 0.5) * 6, p: drng() * TAU });
  const BUBBLES = [];
  for (let i = 0; i < 6; i++) BUBBLES.push({ x: (drng() - 0.5) * 1.5, period: 1.4 + drng() * 1.6, off: drng() * 3 });
  const DRIPS = [{ x: 296, y: 343 }, { x: 664, y: 343 }];

  // corner fern silhouettes for the foreground, painted once
  let fernSprite = null;
  function makeFerns() {
    const c = document.createElement('canvas');
    c.width = W; c.height = 140;
    const g = c.getContext('2d');
    g.translate(0, 140 - H);
    for (const [bx, dir] of [[0, 1], [W, -1]]) {
      for (let i = 0; i < 6; i++) {
        const ang = dir > 0 ? -0.15 - i * 0.2 : Math.PI + 0.15 + i * 0.2;
        frond(g, bx + dir * 4, H + 8, 78 + (i % 3) * 20, ang, 'rgba(6,14,8,.92)', -dir * 0.35, 12);
      }
    }
    return c;
  }
  // soft horizontal mist puff, painted once
  let mistSprite = null;
  function makeMist() {
    const c = document.createElement('canvas');
    c.width = 440; c.height = 96;
    const g = c.getContext('2d');
    g.scale(1, 96 / 440);
    const mg = g.createRadialGradient(220, 220, 10, 220, 220, 220);
    mg.addColorStop(0, 'rgba(150,185,150,.07)'); mg.addColorStop(1, 'rgba(150,185,150,0)');
    g.fillStyle = mg; g.fillRect(0, 0, 440, 440);
    return c;
  }

  function makeGlow() {
    const c = document.createElement('canvas');
    c.width = c.height = 32;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(236,255,160,.9)'); gr.addColorStop(0.25, 'rgba(214,240,120,.45)'); gr.addColorStop(1, 'rgba(214,240,120,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    return c;
  }

  // blue morpho butterfly drifting through the upper background
  function drawButterfly(g, t) {
    const x = 480 + Math.sin(t * 0.23) * 300 + Math.sin(t * 0.71) * 40;
    const y = 170 + Math.sin(t * 0.37) * 50 + Math.sin(t * 1.9) * 8;
    const dir = Math.cos(t * 0.23) >= 0 ? 1 : -1;
    const flap = Math.abs(Math.sin(t * 11));
    g.save(); g.translate(x, y); g.scale(dir, 1); g.rotate(-0.2);
    for (const [sy, s] of [[-1, 1], [1, 0.75]]) {
      g.save(); g.scale(1, 0.25 + flap * 0.75);
      g.fillStyle = 'rgba(64,140,230,.85)';
      g.beginPath(); g.ellipse(-3, sy * 5 * s, 7 * s, 5 * s, sy * 0.5, 0, TAU); g.fill();
      g.fillStyle = 'rgba(20,30,50,.85)';
      g.beginPath(); g.ellipse(-6, sy * 7 * s, 3 * s, 2 * s, sy * 0.5, 0, TAU); g.fill();
      g.restore();
    }
    g.fillStyle = '#1b1712'; g.fillRect(-5, -1, 8, 2);
    g.restore();
  }
  // scarlet macaw on the twig off the right trunk
  function drawParrot(g, t) {
    const x = W - 136, y = 160;
    const bob = (t % 6.3) < 0.6 ? Math.sin((t % 6.3) / 0.6 * Math.PI * 2) * 2.5 : 0;
    const blink = (t % 4.7) < 0.12;
    g.save(); g.translate(x, y);
    // tail
    g.fillStyle = '#9a2a24'; g.beginPath(); g.moveTo(4, 2); g.lineTo(14, 30); g.lineTo(9, 31); g.lineTo(0, 4); g.fill();
    g.fillStyle = '#2d5fa8'; g.beginPath(); g.moveTo(8, 18); g.lineTo(14, 30); g.lineTo(10, 30); g.fill();
    // body
    g.fillStyle = '#b8322a'; g.beginPath(); g.ellipse(2, -6, 7, 11, 0.25, 0, TAU); g.fill();
    // wing: yellow, green, blue bands
    g.fillStyle = '#d6b23a'; g.beginPath(); g.ellipse(5, -6, 4.5, 8, 0.35, 0, TAU); g.fill();
    g.fillStyle = '#3c8a3a'; g.beginPath(); g.ellipse(6, -2, 4, 7, 0.35, 0, TAU); g.fill();
    g.fillStyle = '#2d5fa8'; g.beginPath(); g.ellipse(7, 3, 3.5, 6, 0.35, 0, TAU); g.fill();
    // head
    g.save(); g.translate(-3, -17 + bob);
    g.fillStyle = '#c23a2e'; g.beginPath(); g.arc(0, 0, 6, 0, TAU); g.fill();
    g.fillStyle = '#efe6d6'; g.beginPath(); g.ellipse(-2.5, 0.5, 3, 2.6, 0, 0, TAU); g.fill();
    if (blink) { g.strokeStyle = '#1a1210'; g.lineWidth = 1; g.beginPath(); g.moveTo(-4, 0.5); g.lineTo(-1.5, 0.5); g.stroke(); }
    else { g.fillStyle = '#1a1210'; g.beginPath(); g.arc(-2.6, 0.4, 1.1, 0, TAU); g.fill(); }
    g.fillStyle = '#e8dcc4'; g.beginPath(); g.moveTo(-5, -2); g.quadraticCurveTo(-11, 0, -7, 5); g.lineTo(-5, 2); g.fill();
    g.fillStyle = '#2a221c'; g.beginPath(); g.moveTo(-6, 3); g.lineTo(-7, 5); g.lineTo(-4, 4); g.fill();
    g.restore();
    // feet gripping the twig
    g.strokeStyle = '#5a4a40'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(0, 4); g.lineTo(-1, 7); g.moveTo(4, 4); g.lineTo(4, 7); g.stroke();
    g.restore();
  }

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
        if (!glowSprite) glowSprite = makeGlow();
        if (!mistSprite) mistSprite = makeMist();
        ctx.save();
        ctx.drawImage(staticLayer, 0, 0);
        // god rays through the canopy, breathing slowly, with dust motes drifting down them
        for (let i = 0; i < 4; i++) {
          const x = 220 + i * 170 + Math.sin(t * 0.2 + i) * 20;
          const a = 0.035 + 0.02 * Math.sin(t * 0.5 + i * 1.7);
          const grd = ctx.createLinearGradient(0, 60, 0, FLOOR);
          grd.addColorStop(0, `rgba(210,235,160,${a})`); grd.addColorStop(1, 'rgba(210,235,160,0)');
          ctx.fillStyle = grd;
          ctx.beginPath(); ctx.moveTo(x, 60); ctx.lineTo(x + 50, 60); ctx.lineTo(x + 150, FLOOR); ctx.lineTo(x + 60, FLOOR); ctx.closePath(); ctx.fill();
        }
        for (const m of MOTES) {
          const v = (m.v + t * m.s) % 1;                    // 0 top .. 1 floor
          const rx = 220 + m.ray * 170 + Math.sin(t * 0.2 + m.ray) * 20;
          const x = rx + 25 + v * 70 + (m.u - 0.5) * (40 + v * 50) + Math.sin(t * 0.8 + m.u * 9) * 4;
          const y = 70 + v * (FLOOR - 90);
          const a = 0.35 * Math.sin(v * Math.PI);
          ctx.fillStyle = `rgba(235,245,200,${a})`;
          ctx.fillRect(x, y, 1.5, 1.5);
        }
        // swaying leaf fringe at the canopy edge
        for (const hg of HANG) {
          const sw = Math.sin(t * 0.9 + hg.p) * 0.12;
          ctx.strokeStyle = 'rgba(30,60,32,.9)'; ctx.lineWidth = 1.2;
          const ex = hg.x + Math.sin(sw) * hg.l, ey = 52 + Math.cos(sw) * hg.l;
          ctx.beginPath(); ctx.moveTo(hg.x, 52); ctx.lineTo(ex, ey); ctx.stroke();
          leaf(ctx, ex, ey, 12, Math.PI / 2 + sw * 2 - 0.4, '#1c3e22');
          leaf(ctx, ex, ey, 10, Math.PI / 2 + sw * 2 + 0.5, '#24492a');
        }
        // swaying decorative vines
        for (const [vx, len, ph] of VINES) {
          const sway = Math.sin(t * 0.9 + ph) * 16;
          drawVine(ctx, vx, -4, vx + sway * 0.6, len, sway, 'rgba(52,92,40,.85)', 2.5, 7, t);
          // curled tendril at the tip
          const tx = vx + sway * 0.6, ty = len;
          ctx.strokeStyle = 'rgba(70,110,50,.8)'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(tx + 3, ty + 4, 4, -Math.PI / 2, Math.PI * 1.2); ctx.stroke();
        }
        drawButterfly(ctx, t);
        drawParrot(ctx, t);
        // low mist drifting along the forest floor (behind the fighters)
        for (let i = 0; i < 3; i++) {
          const mx = ((t * (8 + i * 5) + i * 330) % (W + 400)) - 200;
          const my = FLOOR - 18 - i * 14;
          ctx.drawImage(mistSprite, mx - 220, my - 48, 440, 96);
        }
        // bioluminescent mushroom glow, pulsing
        for (const [gx, ph] of [[72, 0], [W - 72, 1.3], [158, 2.1], [W - 158, 2.9]]) {
          const pulse = 0.35 + 0.25 * Math.sin(t * 1.6 + ph);
          ctx.globalAlpha = pulse * 0.6;
          ctx.drawImage(glowSprite, gx - 22, FLOOR - 32, 44, 44);
        }
        ctx.globalAlpha = 1;
        // mud: slow sheen, bubbles that swell, pop and ripple
        const mx = (MUD.x0 + MUD.x1) / 2, mw = (MUD.x1 - MUD.x0) / 2;
        const shx = mx + Math.sin(t * 0.3) * mw * 0.4;
        ctx.fillStyle = 'rgba(190,160,110,.10)';
        ctx.beginPath(); ctx.ellipse(shx, FLOOR + 2, mw * 0.35, 2.5, 0, 0, TAU); ctx.fill();
        for (const b of BUBBLES) {
          const ph = ((t + b.off) % b.period) / b.period;
          const bx = mx + b.x * mw * 0.6;
          if (ph < 0.6) {
            const r = 1.5 + (ph / 0.6) * 5;
            ctx.fillStyle = 'rgba(80,60,36,.9)';
            ctx.beginPath(); ctx.arc(bx, FLOOR + 6, r, Math.PI, 0); ctx.fill();
            ctx.fillStyle = 'rgba(210,180,130,.35)';
            ctx.beginPath(); ctx.arc(bx - r * 0.35, FLOOR + 6 - r * 0.55, r * 0.25, 0, TAU); ctx.fill();
          } else if (ph < 0.9) {
            const k = (ph - 0.6) / 0.3;
            ctx.strokeStyle = `rgba(150,118,78,${0.55 * (1 - k)})`; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.ellipse(bx, FLOOR + 6, 4 + k * 12, 1 + k * 2.5, 0, 0, TAU); ctx.stroke();
          }
        }
        // cattails at the mud edges, swaying
        for (const r of REEDS) {
          const sw = Math.sin(t * 1.1 + r.p) * 2.5 + r.lean;
          ctx.strokeStyle = '#5c7a3a'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(r.x, FLOOR + 4); ctx.quadraticCurveTo(r.x + sw * 0.3, FLOOR - r.h * 0.5, r.x + sw, FLOOR - r.h); ctx.stroke();
          ctx.fillStyle = '#4a3420';
          ctx.beginPath(); ctx.ellipse(r.x + sw, FLOOR - r.h + 3, 2.4, 5.5, sw * 0.03, 0, TAU); ctx.fill();
          ctx.strokeStyle = '#5c7a3a'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(r.x + sw, FLOOR - r.h - 2); ctx.lineTo(r.x + sw * 1.1, FLOOR - r.h - 7); ctx.stroke();
        }
        // water drips falling from the branch tips
        for (let i = 0; i < DRIPS.length; i++) {
          const d = DRIPS[i];
          const ph = ((t + i * 1.6) % 3.2);
          if (ph < 0.9) {        // drop swelling at the tip
            const r = 0.6 + ph * 2;
            ctx.fillStyle = 'rgba(180,220,230,.55)';
            ctx.beginPath(); ctx.arc(d.x, d.y + r, r, 0, TAU); ctx.fill();
          } else if (ph < 1.24) { // falling
            const k = (ph - 0.9) / 0.34;
            const y = d.y + 2 + k * k * (FLOOR - d.y - 2);
            ctx.strokeStyle = 'rgba(190,230,240,.6)'; ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.moveTo(d.x, y - 6 * k - 2); ctx.lineTo(d.x, y); ctx.stroke();
          } else if (ph < 1.8) {  // ripple where it lands
            const k = (ph - 1.24) / 0.56;
            ctx.strokeStyle = `rgba(190,230,240,${0.4 * (1 - k)})`; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.ellipse(d.x, FLOOR + 1, 2 + k * 9, 0.8 + k * 2, 0, 0, TAU); ctx.stroke();
          }
        }
        // the swinging log on its vines
        drawLog(ctx, t);
        // terrain obstacles (live x/y/hp)
        for (const o of OBSTACLES) { if (o.kind === 'stump') drawStump(ctx, o); else drawBamboo(ctx, o, t); }
        // fireflies with a soft glow
        for (const f of FLIES) {
          const x = f.x + Math.sin(t * f.s + f.p) * 26, y = f.y + Math.cos(t * f.s * 1.3 + f.p) * 14;
          const a = 0.25 + 0.35 * Math.max(0, Math.sin(t * 2 * f.s + f.p * 3));
          ctx.globalAlpha = a * 0.7;
          ctx.drawImage(glowSprite, x - 8, y - 8, 16, 16);
          ctx.globalAlpha = 1;
          ctx.fillStyle = `rgba(240,255,170,${a})`;
          ctx.fillRect(x - 1, y - 1, 2, 2);
        }
        ctx.restore();
      } catch (e) { /* never break the frame */ }
    },

    drawForeground(ctx, t) {
      try {
        ctx.save();
        // falling leaves that tumble (flip) as they drift down
        ctx.globalAlpha = 0.55;
        for (const L of FALL) {
          const y = ((t + L.o) * L.s * 2) % (H + 40) - 20;
          const x = (L.x + Math.sin((t + L.o) * 1.3) * 30 + W) % W;
          ctx.save();
          ctx.translate(x, y); ctx.rotate(Math.sin((t + L.o) * 2) * 1.2);
          ctx.scale(1, 0.25 + Math.abs(Math.cos((t + L.o) * 2.6)) * 0.75);
          leaf(ctx, -L.z / 2, 0, L.z, 0, L.c, 'rgba(20,30,10,.4)');
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        // foreground fern fronds in the bottom corners (below the fighting zone)
        if (!fernSprite) fernSprite = makeFerns();
        ctx.drawImage(fernSprite, 0, H - fernSprite.height);
        // soft vignette, a touch greener at the corners
        const v = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 620);
        v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,10,3,.38)');
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
