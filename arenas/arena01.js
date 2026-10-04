// Arena 01 — Mountain Temple (Đền trên núi)
// Moonlit peaks, a pagoda whose roofs are the platforms, cherry trees and falling blossoms.
// Terrain: breakable stone lanterns by each side hall and a bronze bell in the centre. No hazards.
// Every visual is a function of `t` and fixed seeds, so host and guest draw the same frame online.
(function () {
  const W = 960, H = 540, FLOOR = 474;
  const SS = 2;  // static scenery is painted at 2x so it stays crisp on high-dpi screens
  const TAU = Math.PI * 2;

  // ---------- gameplay geometry (unchanged since v1) ----------
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

  // seeded random so the scenery is identical on every load and on both sides of an online match
  const makeRnd = s => () => (s = (s * 16807) % 2147483647) / 2147483647;

  const COL = {
    roofDark: '#4e1b18', roof: '#86302a', roofLit: '#a8443a', beam: '#2c1816', gold: '#d2a24c',
    pillarDark: '#5a1915', pillar: '#a53429', wall: '#3f332f', stone: '#7d7168', stoneLit: '#9d9085', stoneDark: '#564c46',
    warm: '255,176,96', petal: '255,183,207',
  };

  // ---------- small sprites, made once ----------
  function sprite(w, h, paint) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    paint(c.getContext('2d'), w, h);
    return c;
  }
  let cloudS = null, mistS = null, glowS = null, vignetteS = null;
  function makeSprites() {
    const r = makeRnd(23);
    cloudS = sprite(380, 70, (b, w, h) => {
      for (let i = 0; i < 26; i++) {
        const x = 40 + r() * (w - 80), y = h * 0.55 + (r() - 0.5) * 18, rx = 26 + r() * 50, ry = 6 + r() * 10;
        const g = b.createRadialGradient(x, y, 0, x, y, rx);
        g.addColorStop(0, 'rgba(214,196,226,.22)'); g.addColorStop(1, 'rgba(214,196,226,0)');
        b.fillStyle = g;
        b.save(); b.translate(x, y); b.scale(1, ry / rx); b.translate(-x, -y);
        b.beginPath(); b.arc(x, y, rx, 0, TAU); b.fill();
        b.restore();
      }
      // moonlit upper rims
      b.globalCompositeOperation = 'source-atop';
      const lg = b.createLinearGradient(0, 0, 0, h);
      lg.addColorStop(0, 'rgba(255,236,222,.5)'); lg.addColorStop(0.5, 'rgba(255,236,222,0)');
      b.fillStyle = lg; b.fillRect(0, 0, w, h);
    });
    mistS = sprite(420, 60, (b, w, h) => {
      const g = b.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
      g.addColorStop(0, 'rgba(236,222,240,1)'); g.addColorStop(0.6, 'rgba(236,222,240,.4)'); g.addColorStop(1, 'rgba(236,222,240,0)');
      b.save(); b.scale(1, h / w); b.fillStyle = g; b.fillRect(0, 0, w, w); b.restore();
    });
    glowS = sprite(128, 128, (b, w) => {
      const g = b.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      g.addColorStop(0, `rgba(${COL.warm},1)`); g.addColorStop(0.35, `rgba(${COL.warm},.35)`); g.addColorStop(1, `rgba(${COL.warm},0)`);
      b.fillStyle = g; b.fillRect(0, 0, w, w);
    });
    vignetteS = sprite(W, H, (b) => {
      const g = b.createRadialGradient(W / 2, H * 0.48, H * 0.45, W / 2, H * 0.5, W * 0.62);
      g.addColorStop(0, 'rgba(12,8,22,0)'); g.addColorStop(1, 'rgba(12,8,22,.42)');
      b.fillStyle = g; b.fillRect(0, 0, W, H);
    });
  }

  // things the animated layer needs to know about the static painting
  const CHIMES = [], HANGING = [], DOORS = [];

  // ---------- static scenery ----------
  let sky = null;
  function paintStatic() {
    const c = document.createElement('canvas');
    c.width = W * SS; c.height = H * SS;
    const b = c.getContext('2d');
    b.scale(SS, SS);
    const r = makeRnd(11);
    CHIMES.length = HANGING.length = DOORS.length = 0;

    // sky: deep indigo to dusty rose at the horizon
    const g = b.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#161a30'); g.addColorStop(0.3, '#2c2a4a'); g.addColorStop(0.55, '#5a4462'); g.addColorStop(0.78, '#8a5e6c'); g.addColorStop(1, '#a8746c');
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    // faint milky band
    b.save(); b.translate(W * 0.35, 120); b.rotate(-0.28);
    const mb = b.createLinearGradient(0, -50, 0, 50);
    mb.addColorStop(0, 'rgba(220,210,255,0)'); mb.addColorStop(0.5, 'rgba(220,210,255,.06)'); mb.addColorStop(1, 'rgba(220,210,255,0)');
    b.fillStyle = mb; b.fillRect(-500, -50, 1000, 100);
    b.restore();
    // static stars, denser and brighter up high
    for (let i = 0; i < 160; i++) {
      const y = Math.pow(r(), 1.6) * H * 0.5, x = r() * W;
      b.globalAlpha = (0.15 + r() * 0.55) * (1 - y / (H * 0.55));
      b.fillStyle = r() < 0.15 ? '#ffe6c8' : r() < 0.3 ? '#cfe0ff' : '#ffffff';
      const s = r() < 0.08 ? 2 : 1.1;
      b.fillRect(x, y, s, s);
    }
    b.globalAlpha = 1;

    // moon with halo and soft maria
    const MX = 790, MY = 104, MR = 32;
    let hg = b.createRadialGradient(MX, MY, MR * 0.8, MX, MY, MR * 4);
    hg.addColorStop(0, 'rgba(255,232,214,.22)'); hg.addColorStop(1, 'rgba(255,232,214,0)');
    b.fillStyle = hg; b.fillRect(MX - MR * 4, MY - MR * 4, MR * 8, MR * 8);
    hg = b.createRadialGradient(MX - 8, MY - 10, 2, MX, MY, MR);
    hg.addColorStop(0, '#fff6e8'); hg.addColorStop(1, '#ecd6c0');
    b.fillStyle = hg; b.beginPath(); b.arc(MX, MY, MR, 0, TAU); b.fill();
    b.save(); b.beginPath(); b.arc(MX, MY, MR, 0, TAU); b.clip();
    for (const [dx, dy, rr, a] of [[-9, -6, 9, 0.1], [7, 4, 11, 0.08], [-4, 12, 6, 0.09], [12, -12, 5, 0.07], [-15, 8, 4, 0.06]]) {
      b.fillStyle = `rgba(150,120,120,${a})`; b.beginPath(); b.arc(MX + dx, MY + dy, rr, 0, TAU); b.fill();
    }
    // terminator shading on the lower-left limb
    const tg = b.createRadialGradient(MX + 12, MY - 12, MR * 0.7, MX + 6, MY - 6, MR * 1.5);
    tg.addColorStop(0, 'rgba(120,90,110,0)'); tg.addColorStop(1, 'rgba(120,90,110,.35)');
    b.fillStyle = tg; b.fillRect(MX - MR, MY - MR, MR * 2, MR * 2);
    b.restore();

    // mountain ridges, far to near, with atmospheric fade
    const ridges = [
      { base: 300, amp: 170, peaks: 5, top: '#58547a', bot: '#4a4568', snow: 0.32 },
      { base: 360, amp: 140, peaks: 6, top: '#433f60', bot: '#38344f', snow: 0.18 },
      { base: 420, amp: 110, peaks: 8, top: '#302e47', bot: '#26253a', snow: 0 },
    ];
    for (let ri = 0; ri < ridges.length; ri++) {
      const R = ridges[ri], pts = [[-10, R.base - R.amp * 0.2 * r()]], step = (W + 20) / R.peaks;
      for (let i = 0; i < R.peaks; i++) {
        pts.push([-10 + i * step + step * (0.3 + r() * 0.4), R.base - R.amp * (0.55 + r() * 0.45)]);
        pts.push([-10 + (i + 1) * step, R.base - R.amp * (0.05 + r() * 0.25)]);
      }
      R.pts = pts;
      const fg = b.createLinearGradient(0, R.base - R.amp, 0, R.base + 60);
      fg.addColorStop(0, R.top); fg.addColorStop(1, R.bot);
      b.fillStyle = fg;
      b.beginPath(); b.moveTo(-10, H);
      for (const [x, y] of pts) b.lineTo(x, y);
      b.lineTo(W + 10, H); b.closePath(); b.fill();
      // moonlit facets (light comes from the upper right) and gullies
      for (let i = 1; i < pts.length - 1; i += 2) {
        const [px, py] = pts[i], [ax, ay] = pts[i - 1], [cx, cy] = pts[i + 1];
        b.fillStyle = 'rgba(255,230,230,.045)';
        b.beginPath(); b.moveTo(px, py); b.lineTo(cx, cy); b.lineTo(px + (cx - px) * 0.35, R.base + 40); b.closePath(); b.fill();
        b.strokeStyle = 'rgba(10,8,20,.12)'; b.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          const f = 0.25 + k * 0.2;
          b.beginPath(); b.moveTo(px + (ax - px) * f * 0.3, py + (ay - py) * f * 0.3);
          b.lineTo(px + (ax - px) * f, py + (ay - py) * f + 18); b.stroke();
        }
        // snow caps on the tall peaks
        if (R.snow && py < R.base - R.amp * 0.72) {
          const f = R.snow, lx = px + (ax - px) * f, ly = py + (ay - py) * f, rx = px + (cx - px) * f, ry = py + (cy - py) * f;
          b.fillStyle = 'rgba(232,226,244,.55)';
          b.beginPath(); b.moveTo(px, py); b.lineTo(rx, ry);
          const n = 5;
          for (let k = 1; k < n; k++) {
            const x = rx + (lx - rx) * k / n, y = ry + (ly - ry) * k / n;
            b.lineTo(x, y + (k % 2 ? 5 + r() * 5 : -1));
          }
          b.lineTo(lx, ly); b.closePath(); b.fill();
          b.fillStyle = 'rgba(120,110,150,.35)';  // shaded side of the snow
          b.beginPath(); b.moveTo(px, py); b.lineTo(lx, ly); b.lineTo(px + (lx - px) * 0.5, py + (ly - py) * 0.5 + 4); b.closePath(); b.fill();
        }
      }
      // a tiny far-off shrine on the tallest far peak, one window lit
      if (ri === 0) {
        let best = pts[1];
        for (let i = 1; i < pts.length; i += 2) if (pts[i][1] < best[1] && pts[i][0] > 80 && pts[i][0] < 700) best = pts[i];
        const [sx, sy] = best;
        b.fillStyle = '#3c3858';
        for (let k = 0; k < 3; k++) {
          const yy = sy + 4 - k * 7, ww = 18 - k * 4;
          b.fillRect(sx - ww / 2 + 2, yy - 4, ww - 4, 5);
          b.beginPath(); b.moveTo(sx - ww / 2 - 2, yy - 4); b.lineTo(sx, yy - 9); b.lineTo(sx + ww / 2 + 2, yy - 4); b.closePath(); b.fill();
        }
        b.fillRect(sx - 0.5, sy - 22, 1, 6);
        b.fillStyle = 'rgba(255,200,130,.85)'; b.fillRect(sx - 1, sy, 2, 2);
      }
      // valley haze at the foot of each ridge
      const hz = b.createLinearGradient(0, R.base - 40, 0, R.base + 30);
      hz.addColorStop(0, 'rgba(200,170,200,0)'); hz.addColorStop(1, `rgba(200,170,200,${0.16 - ri * 0.04})`);
      b.fillStyle = hz; b.fillRect(0, R.base - 40, W, 70);
      // pines along the nearest ridge
      if (ri === 2) {
        const ridgeY = x => {
          for (let i = 0; i < pts.length - 1; i++) if (x >= pts[i][0] && x <= pts[i + 1][0]) {
            const f = (x - pts[i][0]) / (pts[i + 1][0] - pts[i][0]);
            return pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f;
          }
          return R.base;
        };
        b.fillStyle = '#1f1e30';
        for (let x = 0; x < W; x += 7 + r() * 16) {
          const y = ridgeY(x) + 3, hh = 9 + r() * 15, ww = hh * 0.42;
          for (let k = 0; k < 3; k++) {
            const ty = y - hh + k * hh * 0.28;
            b.beginPath(); b.moveTo(x, ty); b.lineTo(x - ww * (0.55 + k * 0.22), ty + hh * 0.42); b.lineTo(x + ww * (0.55 + k * 0.22), ty + hh * 0.42); b.closePath(); b.fill();
          }
          b.fillRect(x - 0.6, y - 3, 1.2, 4);
        }
      }
    }

    paintFloor(b, r);
    paintTrees(b, r);   // behind the halls, so blossoms never cover a roof edge
    paintTemple(b);
    // petals resting on the courtyard, gathered under the trees and along the hall steps
    for (let i = 0; i < 140; i++) {
      const near = i < 70;
      const x = near ? (i % 2 ? r() * 150 : W - r() * 150) : r() * W;
      const y = FLOOR + 3 + Math.pow(r(), 0.8) * 60;
      b.fillStyle = `rgba(${COL.petal},${0.35 + r() * 0.4})`;
      b.beginPath(); b.ellipse(x, y, 1.6 + r() * 1.4, 0.9 + r() * 0.6, r() * 3, 0, TAU); b.fill();
    }
    return c;
  }

  function paintFloor(b, r) {
    // stone courtyard: a lit lip, then courses of flagstones that grow toward the viewer
    b.fillStyle = '#7b6c64'; b.fillRect(0, FLOOR, W, 5);
    b.fillStyle = 'rgba(255,226,206,.4)'; b.fillRect(0, FLOOR, W, 1);
    b.fillStyle = 'rgba(0,0,0,.35)'; b.fillRect(0, FLOOR + 4, W, 1.5);
    let y = FLOOR + 5;
    const rows = [16, 20, 25];
    rows.forEach((h, ri) => {
      const tw = 52 + ri * 10, off = (ri % 2) * tw / 2;
      for (let x = -off; x < W; x += tw) {
        const L = 30 - ri * 3 + r() * 6;
        b.fillStyle = `hsl(${14 + r() * 14},${8 + r() * 6}%,${L}%)`;
        b.fillRect(x + 1, y + 1, tw - 2, h - 2);
        b.fillStyle = 'rgba(255,232,214,.07)'; b.fillRect(x + 1, y + 1, tw - 2, 1.5);      // worn top edge
        b.fillStyle = 'rgba(0,0,0,.18)'; b.fillRect(x + 1, y + h - 3, tw - 2, 2);          // lower shadow
        if (r() < 0.22) {                                                                    // hairline crack
          b.strokeStyle = 'rgba(0,0,0,.3)'; b.lineWidth = 0.8;
          const cx = x + 6 + r() * (tw - 12);
          b.beginPath(); b.moveTo(cx, y + 2); b.lineTo(cx + (r() - 0.5) * 8, y + h * 0.5); b.lineTo(cx + (r() - 0.5) * 12, y + h - 2); b.stroke();
        }
        if (r() < 0.3) {                                                                     // moss in the joint
          b.fillStyle = `rgba(${84 + r() * 30 | 0},${110 + r() * 30 | 0},${64 + r() * 20 | 0},.55)`;
          for (let k = 0; k < 5; k++) b.fillRect(x - 1 + r() * 4, y + r() * h, 1.6, 1.6);
        }
      }
      b.fillStyle = 'rgba(0,0,0,.45)'; b.fillRect(0, y, W, 1);
      y += h;
    });
    // moonlight pooling in the middle of the courtyard
    const pg = b.createRadialGradient(W / 2, FLOOR + 10, 10, W / 2, FLOOR + 10, 420);
    pg.addColorStop(0, 'rgba(255,220,220,.07)'); pg.addColorStop(1, 'rgba(255,220,220,0)');
    b.fillStyle = pg; b.fillRect(0, FLOOR, W, H - FLOOR);
  }

  // a curved roof whose top edge (y) is the walkable platform surface
  function roof(b, x, y, w, depth, over, chimes) {
    const by = y + depth + 6;  // eave line
    const path = () => {
      b.beginPath();
      b.moveTo(x - over, by);
      b.quadraticCurveTo(x + 8, y + depth - 2, x + 6, y);
      b.lineTo(x + w - 6, y);
      b.quadraticCurveTo(x + w - 8, y + depth - 2, x + w + over, by);
      b.closePath();
    };
    // shadow cast under the eaves, then the bracket sets (dougong) that hold them
    b.fillStyle = 'rgba(0,0,0,.4)'; b.fillRect(x - over + 12, by, w + over * 2 - 24, 8);
    for (let bx = x + 6; bx < x + w - 10; bx += 15) {
      b.fillStyle = '#3e1512'; b.fillRect(bx, by + 1, 10, 4); b.fillRect(bx + 3, by + 5, 4, 4);
      b.fillStyle = 'rgba(210,162,76,.35)'; b.fillRect(bx, by + 1, 10, 1);
    }
    const g = b.createLinearGradient(0, y, 0, by);
    g.addColorStop(0, COL.roofDark); g.addColorStop(0.55, COL.roof); g.addColorStop(1, COL.roofLit);
    path(); b.fillStyle = g; b.fill();
    b.save(); path(); b.clip();
    // tile channels fan out slightly toward the eave
    const mid = x + w / 2;
    for (let i = x - over + 4; i < x + w + over; i += 8) {
      const dx = (i - mid) * 0.07;
      b.strokeStyle = 'rgba(20,6,6,.32)'; b.lineWidth = 2;
      b.beginPath(); b.moveTo(i - dx, y); b.lineTo(i, by); b.stroke();
      b.strokeStyle = 'rgba(255,190,170,.09)'; b.lineWidth = 1.2;
      b.beginPath(); b.moveTo(i + 3 - dx, y); b.lineTo(i + 3, by); b.stroke();
    }
    for (let k = 1; k < 4; k++) {
      b.fillStyle = 'rgba(0,0,0,.12)'; b.fillRect(x - over, y + (by - y) * k / 4, w + over * 2, 1);
    }
    // moonlight catching the right slope
    const lg = b.createLinearGradient(x + w * 0.5, 0, x + w + over, 0);
    lg.addColorStop(0, 'rgba(255,220,220,0)'); lg.addColorStop(1, 'rgba(255,220,220,.12)');
    b.fillStyle = lg; b.fillRect(x, y, w + over, by - y);
    b.restore();
    // round tile ends along the eave
    for (let i = x - over + 6; i <= x + w + over - 6; i += 8) {
      b.fillStyle = '#5a1e1a'; b.beginPath(); b.arc(i, by + 1, 3.2, 0, TAU); b.fill();
      b.fillStyle = 'rgba(232,150,120,.55)'; b.beginPath(); b.arc(i - 0.6, by + 0.3, 1.3, 0, TAU); b.fill();
    }
    b.fillStyle = COL.gold; b.fillRect(x - over + 4, by + 4.5, w + over * 2 - 8, 1.2);
    // upturned corners with a gilt finial, and a wind chime hanging from each
    for (const s of [-1, 1]) {
      const cx = s < 0 ? x - over : x + w + over;
      b.strokeStyle = COL.roof; b.lineWidth = 4; b.lineCap = 'round';
      b.beginPath(); b.moveTo(cx - s * 12, by + 1); b.quadraticCurveTo(cx + s * 1, by + 1, cx + s * 4, by - 9); b.stroke();
      b.fillStyle = COL.gold; b.beginPath(); b.arc(cx + s * 4, by - 10, 2.4, 0, TAU); b.fill();
      if (chimes) CHIMES.push({ x: cx + s * 1, y: by + 2, ph: cx * 0.07 });
    }
    // ridge beam: the walkable line, with a warm highlight so players can read it
    b.fillStyle = COL.beam; b.fillRect(x, y - 3, w, 7);
    b.fillStyle = 'rgba(255,214,140,.65)'; b.fillRect(x, y - 3, w, 1.5);
    b.fillStyle = 'rgba(210,162,76,.5)';
    for (let i = x + 10; i < x + w - 6; i += 22) b.fillRect(i, y, 2, 2);
    // small ridge-end ornaments
    for (const s of [-1, 1]) {
      const ex = s < 0 ? x + 1 : x + w - 1;
      b.fillStyle = COL.beam;
      b.beginPath(); b.moveTo(ex, y + 4); b.quadraticCurveTo(ex + s * 2, y - 8, ex - s * 7, y - 10);
      b.quadraticCurveTo(ex - s * 3, y - 4, ex - s * 6, y + 4); b.closePath(); b.fill();
      b.fillStyle = COL.gold; b.beginPath(); b.arc(ex - s * 6, y - 9, 1.5, 0, TAU); b.fill();
    }
  }

  // lattice window or door panel with a warm interior glow
  function lattice(b, x, y, w, h, glow, step) {
    b.fillStyle = '#24170f'; b.fillRect(x - 1.5, y - 1.5, w + 3, h + 3);
    const lg = b.createLinearGradient(0, y, 0, y + h);
    lg.addColorStop(0, `rgba(${COL.warm},${glow * 0.7})`); lg.addColorStop(1, `rgba(${COL.warm},${glow})`);
    b.fillStyle = lg; b.fillRect(x, y, w, h);
    b.strokeStyle = 'rgba(46,22,14,.85)'; b.lineWidth = 1;
    for (let i = x + step; i < x + w - 1; i += step) { b.beginPath(); b.moveTo(i, y); b.lineTo(i, y + h); b.stroke(); }
    for (let j = y + step; j < y + h - 1; j += step) { b.beginPath(); b.moveTo(x, j); b.lineTo(x + w, j); b.stroke(); }
  }

  function pillar(b, x, top, bottom) {
    const pg = b.createLinearGradient(x, 0, x + 10, 0);
    pg.addColorStop(0, COL.pillarDark); pg.addColorStop(0.65, COL.pillar); pg.addColorStop(1, '#6b1f19');
    b.fillStyle = pg; b.fillRect(x, top, 10, bottom - top);
    b.fillStyle = COL.gold; b.fillRect(x - 1, top + 3, 12, 2.5);
    b.fillStyle = COL.stoneDark; b.fillRect(x - 3, bottom - 6, 16, 6);
    b.fillStyle = 'rgba(255,226,206,.25)'; b.fillRect(x - 3, bottom - 6, 16, 1);
  }

  // one storey: wall, pillars, lattice windows, a central door and its steps
  function storey(b, x, w, top, bottom, door) {
    b.fillStyle = 'rgba(0,0,0,.35)'; b.beginPath(); b.ellipse(x + w / 2, bottom + 1, w / 2 + 14, 5, 0, 0, TAU); b.fill();
    const wg = b.createLinearGradient(0, top, 0, bottom);
    wg.addColorStop(0, '#2e2420'); wg.addColorStop(0.25, COL.wall); wg.addColorStop(1, '#352a26');
    b.fillStyle = wg; b.fillRect(x, top, w, bottom - top);
    b.fillStyle = '#4a1a16'; b.fillRect(x - 4, top, w + 8, 7);           // lintel
    b.fillStyle = 'rgba(210,162,76,.6)'; b.fillRect(x - 4, top + 6, w + 8, 1);
    const n = 4, px = i => x + 3 + i * ((w - 16) / (n - 1));
    for (let i = 0; i < n - 1; i++) {
      const bx = px(i) + 13, bw = px(i + 1) - bx - 3;
      if (door && i === 1) {
        const dh = Math.min(58, bottom - top - 18), dy = bottom - 6 - dh;
        lattice(b, bx, dy, bw / 2 - 1, dh, 0.42, 6);
        lattice(b, bx + bw / 2 + 1, dy, bw / 2 - 1, dh, 0.42, 6);
        b.fillStyle = COL.gold; b.fillRect(bx + bw / 2 - 3, dy + dh * 0.55, 2, 2); b.fillRect(bx + bw / 2 + 1, dy + dh * 0.55, 2, 2);
        DOORS.push({ x: bx, y: dy, w: bw, h: dh });
        // three stone steps
        for (let k = 0; k < 3; k++) {
          const sw = bw + 16 + k * 10, sy = bottom - 6 + k * 2;
          b.fillStyle = k ? COL.stoneDark : COL.stone; b.fillRect(bx + bw / 2 - sw / 2, sy, sw, 2.5);
        }
      } else {
        const wy = top + 16, wh = Math.min(30, (bottom - top) * 0.36);
        lattice(b, bx + 2, wy, bw - 4, wh, 0.28, 5);
        b.fillStyle = 'rgba(0,0,0,.25)'; b.fillRect(bx + 2, wy + wh + 2, bw - 4, 2);   // sill shadow
        // wainscot panel below the window
        b.strokeStyle = 'rgba(0,0,0,.35)'; b.lineWidth = 1;
        b.strokeRect(bx + 3.5, bottom - 26, bw - 7, 16);
      }
    }
    for (let i = 0; i < n; i++) pillar(b, px(i), top + 7, bottom);
  }

  function paperLanternSpot(x, y, ph) { HANGING.push({ x, y, ph }); }

  function paintTemple(b) {
    const [L, R, M] = PLATFORMS;
    const cx = M.x + M.w / 2;
    // ---- central pagoda: lower storey ----
    storey(b, M.x + 10, M.w - 20, M.y + 126, FLOOR, true);
    // pent roof skirt between the storeys: sloped, no ridge highlight, so it doesn't read as a platform
    const sy = M.y + 108;
    const sg = b.createLinearGradient(0, sy, 0, sy + 20);
    sg.addColorStop(0, COL.roofDark); sg.addColorStop(1, COL.roof);
    b.fillStyle = sg;
    b.beginPath(); b.moveTo(M.x + 18, sy); b.lineTo(M.x + M.w - 18, sy); b.lineTo(M.x + M.w + 2, sy + 18); b.lineTo(M.x - 2, sy + 18); b.closePath(); b.fill();
    b.strokeStyle = 'rgba(20,6,6,.35)'; b.lineWidth = 1.5;
    for (let i = M.x + 4; i < M.x + M.w; i += 8) { b.beginPath(); b.moveTo(cx + (i - cx) * 0.82, sy + 1); b.lineTo(i, sy + 18); b.stroke(); }
    for (let i = M.x + 2; i <= M.x + M.w - 2; i += 8) { b.fillStyle = '#5a1e1a'; b.beginPath(); b.arc(i, sy + 19, 2.6, 0, TAU); b.fill(); }
    b.fillStyle = 'rgba(0,0,0,.4)'; b.fillRect(M.x + 8, sy + 21, M.w - 16, 5);
    paperLanternSpot(M.x + 26, sy + 24, 1.3); paperLanternSpot(M.x + M.w - 26, sy + 24, 2.1);
    // ---- upper storey: balcony, lattice and a name plaque ----
    const ut = M.y + 36, ux = M.x + 18, uw = M.w - 36;
    const ug = b.createLinearGradient(0, ut, 0, sy);
    ug.addColorStop(0, '#271d1a'); ug.addColorStop(1, COL.wall);
    b.fillStyle = ug; b.fillRect(ux, ut, uw, sy - ut);
    lattice(b, ux + 10, ut + 26, 40, 32, 0.3, 5);
    lattice(b, ux + uw - 50, ut + 26, 40, 32, 0.3, 5);
    lattice(b, cx - 18, ut + 30, 36, 28, 0.36, 6);
    for (const px of [ux, ux + uw / 2 - 30 - 5, ux + uw / 2 + 25, ux + uw - 10]) pillar(b, px, ut, sy);
    // plaque under the main eave
    b.fillStyle = '#1b1210'; b.fillRect(cx - 26, ut + 4, 52, 18);
    b.strokeStyle = COL.gold; b.lineWidth = 1.5; b.strokeRect(cx - 24, ut + 6, 48, 14);
    b.strokeStyle = 'rgba(232,190,100,.9)'; b.lineWidth = 1.6; b.lineCap = 'round';
    for (const gx of [cx - 13, cx, cx + 13]) {        // three brush-stroke glyphs
      b.beginPath(); b.moveTo(gx - 4, ut + 10); b.lineTo(gx + 4, ut + 10);
      b.moveTo(gx, ut + 9); b.lineTo(gx, ut + 17);
      b.moveTo(gx - 4, ut + 14); b.quadraticCurveTo(gx, ut + 12, gx + 4, ut + 16); b.stroke();
    }
    // balcony railing
    const ry = sy - 12;
    b.fillStyle = '#3a1512'; b.fillRect(M.x + 8, ry, M.w - 16, 2.5); b.fillRect(M.x + 8, sy - 2, M.w - 16, 2.5);
    for (let i = M.x + 10; i <= M.x + M.w - 10; i += 9) b.fillRect(i, ry, 2, 12);
    b.fillStyle = 'rgba(210,162,76,.55)'; b.fillRect(M.x + 8, ry, M.w - 16, 0.8);
    // main roof (central platform)
    roof(b, M.x, M.y, M.w, 30, 22, true);
    // sorin spire: rings on a gilt mast, a flame finial and a jewel (decor, not a platform)
    const mg = b.createLinearGradient(cx - 2, 0, cx + 2, 0);
    mg.addColorStop(0, '#8a6528'); mg.addColorStop(0.5, '#f0cf7a'); mg.addColorStop(1, '#7a5a22');
    b.fillStyle = mg; b.fillRect(cx - 1.6, M.y - 58, 3.2, 56);
    b.fillStyle = '#6e5222'; b.fillRect(cx - 7, M.y - 8, 14, 5);
    for (let k = 0; k < 6; k++) {
      const yy = M.y - 14 - k * 6, rw = 8 - k * 0.8;
      b.fillStyle = '#9a7432'; b.beginPath(); b.ellipse(cx, yy, rw, 1.8, 0, 0, TAU); b.fill();
      b.fillStyle = 'rgba(255,226,150,.7)'; b.fillRect(cx - rw * 0.4, yy - 1.6, rw * 0.9, 0.8);
    }
    b.fillStyle = '#c99a45';
    b.beginPath(); b.moveTo(cx, M.y - 70); b.quadraticCurveTo(cx + 6, M.y - 62, cx + 2, M.y - 56); b.lineTo(cx - 2, M.y - 56); b.quadraticCurveTo(cx - 6, M.y - 62, cx, M.y - 70); b.fill();
    // ---- side halls ----
    for (const p of [L, R]) {
      storey(b, p.x + 14, p.w - 28, p.y + 34, FLOOR, true);
      roof(b, p.x, p.y, p.w, 28, 22, true);
      paperLanternSpot(p.x + 34, p.y + 40, p.x * 0.013);
      paperLanternSpot(p.x + p.w - 34, p.y + 40, p.x * 0.017 + 1);
    }
  }

  function paintTrees(b, r) {
    for (const [tx, s] of [[16, 1], [W - 16, -1]]) {
      const blossoms = [];
      const branch = (x, y, ang, len, wid, depth) => {
        const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
        const bend = (r() - 0.5) * len * 0.3;
        b.strokeStyle = '#2b1b18'; b.lineWidth = wid; b.lineCap = 'round';
        b.beginPath(); b.moveTo(x, y); b.quadraticCurveTo((x + x2) / 2 + bend, (y + y2) / 2 - bend * 0.5, x2, y2); b.stroke();
        if (wid > 3) {  // moonlit bark edge
          b.strokeStyle = 'rgba(200,170,180,.18)'; b.lineWidth = 1;
          b.beginPath(); b.moveTo(x + wid * 0.3, y); b.quadraticCurveTo((x + x2) / 2 + bend + wid * 0.3, (y + y2) / 2 - bend * 0.5, x2 + wid * 0.2, y2); b.stroke();
        }
        if (depth === 0) { blossoms.push([x2, y2, 1]); return; }
        if (depth < 3) blossoms.push([x2, y2, 0.7]);
        branch(x2, y2, ang - 0.3 - r() * 0.35, len * (0.68 + r() * 0.12), wid * 0.64, depth - 1);
        branch(x2, y2, ang + 0.25 + r() * 0.35, len * (0.64 + r() * 0.12), wid * 0.6, depth - 1);
      };
      // roots flaring into the flagstones
      b.fillStyle = '#2b1b18';
      b.beginPath(); b.moveTo(tx - 10, FLOOR + 2); b.quadraticCurveTo(tx, FLOOR - 8, tx + 12, FLOOR + 2); b.closePath(); b.fill();
      branch(tx, FLOOR, -Math.PI / 2 + s * 0.28, 82, 11, 4);
      // blossom clouds: shadowed underside, mid tone, moonlit tops, a few loose florets
      for (const pass of [0, 1, 2]) {
        for (const [bx, by, k] of blossoms) {
          const n = pass === 2 ? 3 : 5;
          for (let i = 0; i < n; i++) {
            const ox = (r() - 0.5) * 30 * k, oy = (r() - 0.5) * 20 * k, rr = (6 + r() * 8) * k * (pass === 2 ? 0.55 : 1);
            const col = pass === 0 ? `rgba(176,84,120,${0.6 + r() * 0.3})` : pass === 1 ? `rgba(220,138,170,${0.55 + r() * 0.3})` : `rgba(246,190,210,${0.35 + r() * 0.25})`;
            b.fillStyle = col;
            b.beginPath(); b.arc(bx + ox + (pass === 2 ? s * 2 : 0), by + oy + (pass === 0 ? 4 : pass === 2 ? -3 : 0), rr, 0, TAU); b.fill();
          }
        }
      }
      b.fillStyle = 'rgba(255,236,242,.6)';
      for (const [bx, by] of blossoms) for (let i = 0; i < 3; i++) b.fillRect(bx + (r() - 0.5) * 34, by + (r() - 0.5) * 24, 1.4, 1.4);
    }
  }

  // ---------- animated layers (functions of t only) ----------
  const TWINKLE = (() => { const r = makeRnd(31); return Array.from({ length: 26 }, () => ({ x: r() * W, y: 84 + r() * 150, ph: r() * TAU, f: 1 + r() * 2.5, s: 1.2 + r() * 1.2 })); })();
  const CLOUDS = [{ x: 0, y: 92, s: 5, a: 0.75 }, { x: 520, y: 140, s: 3.4, a: 0.55 }, { x: 260, y: 196, s: 2.4, a: 0.4 }];
  const MIST = (() => { const r = makeRnd(41); return Array.from({ length: 7 }, (_, i) => ({ y: 262 + i * 26 + r() * 10, x: r() * 1400, s: 6 + r() * 10, w: 300 + r() * 220, a: 0.05 + r() * 0.05 })); })();
  const CRANES = [{ off: 0, y: 164, sc: 1 }, { off: 3.2, y: 176, sc: 0.85 }, { off: 6.1, y: 154, sc: 0.75 }];
  const CRANE_P = 52;
  const PETALS = (() => { const r = makeRnd(53); return Array.from({ length: 58 }, (_, i) => ({ x: r() * W, y: r() * H, vy: 20 + r() * 26, vx: 12 + r() * 20, ph: r() * TAU, r: 2.2 + r() * 2.6, near: i < 6 })); })();
  const SPECK = (() => { const r = makeRnd(61); return Array.from({ length: 14 }, () => [r(), r(), 0.06 + r() * 0.1]); })();
  const PATINA = (() => { const r = makeRnd(67); return Array.from({ length: 9 }, () => [r() - 0.5, 0.15 + r() * 0.65, 3 + r() * 6]); })();

  function drawCrane(ctx, x, y, sc, t, i) {
    const flap = Math.sin(t * 4.2 + i * 1.7);
    ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
    ctx.strokeStyle = 'rgba(24,20,36,.6)'; ctx.fillStyle = 'rgba(24,20,36,.6)'; ctx.lineCap = 'round';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(9, 1); ctx.stroke();            // neck to legs
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(9, 1); ctx.lineTo(16, 2.5); ctx.stroke();            // trailing legs
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(-1, 0); ctx.quadraticCurveTo(-4, -8 * flap - 3, -10, -12 * flap); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(2, 0); ctx.quadraticCurveTo(5, -8 * flap - 2, 2, -13 * flap); ctx.stroke();
    ctx.beginPath(); ctx.arc(-11, -0.5, 1.2, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawPaperLantern(ctx, x, y, t, ph) {
    const sw = Math.sin(t * 1.25 + ph) * 0.07 + Math.sin(t * 2.9 + ph * 2) * 0.015;
    const fl = 0.86 + 0.08 * Math.sin(t * 7.3 + ph * 3) + 0.06 * Math.sin(t * 13.1 + ph);
    // warm pool of light on the wall behind
    ctx.globalAlpha = 0.2 * fl;
    ctx.drawImage(glowS, x - 36, y - 6, 72, 72);
    ctx.globalAlpha = 1;
    ctx.save(); ctx.translate(x, y); ctx.rotate(sw);
    ctx.strokeStyle = 'rgba(30,18,16,.9)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, 7); ctx.stroke();
    ctx.fillStyle = '#1e1412'; ctx.fillRect(-5, 6, 10, 3);
    const bg = ctx.createRadialGradient(-2, 18, 1, 0, 20, 13);
    bg.addColorStop(0, `rgba(255,190,120,${fl})`); bg.addColorStop(0.55, '#d0483a'); bg.addColorStop(1, '#7c1f1b');
    ctx.fillStyle = bg; ctx.beginPath(); ctx.ellipse(0, 20, 9, 11, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(80,16,12,.55)'; ctx.lineWidth = 0.8;
    for (let k = -3; k <= 3; k++) {
      const yy = k * 3, hw = 9 * Math.sqrt(Math.max(0, 1 - (yy / 11) * (yy / 11)));
      ctx.beginPath(); ctx.moveTo(-hw, 20 + yy); ctx.lineTo(hw, 20 + yy); ctx.stroke();
    }
    ctx.beginPath(); ctx.ellipse(0, 20, 3.5, 11, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#1e1412'; ctx.fillRect(-4.5, 30, 9, 3);
    ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 1.2;
    const tw = Math.sin(t * 2.2 + ph) * 1.5;
    for (const dx of [-1.5, 0, 1.5]) { ctx.beginPath(); ctx.moveTo(dx, 33); ctx.lineTo(dx + tw, 41); ctx.stroke(); }
    ctx.restore();
  }

  function drawChime(ctx, c, t) {
    const a = Math.sin(t * 1.6 + c.ph) * 0.18 + Math.sin(t * 3.7 + c.ph) * 0.05;
    ctx.save(); ctx.translate(c.x, c.y); ctx.rotate(a);
    ctx.strokeStyle = 'rgba(40,24,18,.9)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 7); ctx.stroke();
    ctx.fillStyle = COL.gold;
    ctx.beginPath(); ctx.moveTo(-2.6, 11); ctx.quadraticCurveTo(-2.4, 7, 0, 6.5); ctx.quadraticCurveTo(2.4, 7, 2.6, 11); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,200,.8)'; ctx.fillRect(-1.6, 7.6, 0.9, 2.4);
    ctx.fillStyle = 'rgba(240,230,210,.7)'; ctx.fillRect(-1, 12, 2, 4);            // paper strip
    ctx.restore();
  }

  function drawLantern(ctx, o, t, idx) {
    const cx = o.x + o.w / 2, top = o.y, bot = o.y + o.h;
    const dmg = o.maxHp ? 1 - Math.max(0, o.hp) / o.maxHp : 0;
    const fl = 0.8 + 0.12 * Math.sin(t * 8.7 + o.x) + 0.08 * Math.sin(t * 15.3 + o.x * 0.3);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(cx, bot, 26, 4, 0, 0, TAU); ctx.fill();
    // warm glow on the flagstones and around the fire box
    ctx.globalAlpha = 0.16 * fl; ctx.drawImage(glowS, cx - 40, bot - 14, 80, 24);
    ctx.globalAlpha = 0.26 * fl; ctx.drawImage(glowS, cx - 34, top - 12, 68, 68);
    ctx.globalAlpha = 1;
    const stoneG = (x0, x1) => {
      const g = ctx.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, COL.stoneDark); g.addColorStop(0.6, COL.stoneLit); g.addColorStop(1, COL.stone);
      return g;
    };
    // two-step base
    ctx.fillStyle = stoneG(o.x, o.x + o.w); ctx.fillRect(o.x, bot - 6, o.w, 6);
    ctx.fillStyle = stoneG(o.x + 4, o.x + o.w - 4); ctx.fillRect(o.x + 4, bot - 12, o.w - 8, 6);
    // post with carved rings
    ctx.fillStyle = stoneG(cx - 6, cx + 6); ctx.fillRect(cx - 6, top + 38, 12, bot - 12 - (top + 38));
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(cx - 6, top + 46, 12, 1.5); ctx.fillRect(cx - 6, top + 54, 12, 1.5);
    ctx.fillStyle = 'rgba(255,226,206,.25)'; ctx.fillRect(cx - 6, top + 47.5, 12, 1); ctx.fillRect(cx - 6, top + 55.5, 12, 1);
    // shelf
    ctx.fillStyle = stoneG(o.x + 2, o.x + o.w - 2); ctx.fillRect(o.x + 2, top + 30, o.w - 4, 8);
    ctx.fillStyle = 'rgba(255,226,206,.3)'; ctx.fillRect(o.x + 2, top + 30, o.w - 4, 1.2);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(o.x + 2, top + 37, o.w - 4, 1.2);
    // fire box with a glowing window and a little flame
    ctx.fillStyle = stoneG(cx - 11, cx + 11); ctx.fillRect(cx - 11, top + 14, 22, 16);
    ctx.fillStyle = `rgba(255,${180 + 30 * fl | 0},110,${0.75 * fl})`; ctx.fillRect(cx - 6, top + 17, 12, 10);
    ctx.fillStyle = `rgba(255,240,190,${0.8 * fl})`;
    ctx.beginPath(); ctx.ellipse(cx + Math.sin(t * 6 + o.x) * 0.6, top + 23, 1.8, 3.2 * fl, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(40,28,24,.9)'; ctx.fillRect(cx - 0.6, top + 17, 1.2, 10);
    // roof cap with upturned corners and a jewel finial
    ctx.fillStyle = '#a89a8d';
    ctx.beginPath(); ctx.moveTo(o.x - 5, top + 12); ctx.quadraticCurveTo(o.x + 6, top + 12, cx, top + 3);
    ctx.quadraticCurveTo(o.x + o.w - 6, top + 12, o.x + o.w + 5, top + 12);
    ctx.lineTo(o.x + o.w + 1, top + 15.5); ctx.lineTo(o.x - 1, top + 15.5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(o.x - 1, top + 14.5, o.w + 2, 1.2);
    ctx.fillStyle = 'rgba(255,236,220,.35)';
    ctx.beginPath(); ctx.moveTo(cx, top + 3.5); ctx.quadraticCurveTo(o.x + o.w - 6, top + 12, o.x + o.w + 5, top + 12); ctx.lineTo(o.x + o.w - 2, top + 12); ctx.quadraticCurveTo(o.x + o.w - 10, top + 10, cx, top + 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9d9085';
    ctx.beginPath(); ctx.arc(cx, top + 1.5, 3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - 1.5, top); ctx.lineTo(cx, top - 3); ctx.lineTo(cx + 1.5, top); ctx.fill();
    // weathering and lichen
    for (let i = 0; i < SPECK.length; i++) {
      const [sx, sy, a] = SPECK[(i + idx * 5) % SPECK.length];
      ctx.fillStyle = i % 4 ? `rgba(30,24,20,${a})` : `rgba(120,150,96,${a * 2})`;
      ctx.fillRect(o.x + 2 + sx * (o.w - 4), top + 30 + sy * (o.h - 32), 1.5, 1.5);
    }
    if (dmg > 0.01) {  // cracks grow as it takes hits
      ctx.strokeStyle = 'rgba(20,12,10,.85)'; ctx.lineWidth = 1.4; ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - 4, top + 38); ctx.lineTo(cx + 3, top + 38 + 14 * Math.min(1, dmg * 2)); ctx.lineTo(cx - 2, top + 40 + 30 * dmg);
      if (dmg > 0.3) { ctx.moveTo(o.x + 4, top + 30); ctx.lineTo(o.x + 10, top + 34); ctx.lineTo(o.x + 14, top + 33); }
      if (dmg > 0.55) { ctx.moveTo(o.x + o.w - 4, top + 9); ctx.lineTo(cx + 6, top + 13); ctx.moveTo(cx + 9, top + 16); ctx.lineTo(cx + 5, top + 24); }
      if (dmg > 0.8) { ctx.moveTo(o.x + 6, bot - 10); ctx.lineTo(o.x + 12, bot - 4); ctx.moveTo(o.x + o.w - 8, bot - 11); ctx.lineTo(o.x + o.w - 12, bot - 6); }
      ctx.stroke();
      if (dmg > 0.55) { ctx.fillStyle = 'rgba(20,12,10,.6)'; ctx.beginPath(); ctx.moveTo(o.x + o.w + 4, top + 12); ctx.lineTo(o.x + o.w - 4, top + 10); ctx.lineTo(o.x + o.w - 1, top + 15); ctx.closePath(); ctx.fill(); }
    }
  }

  function drawRubble(ctx, o, idx) {
    const cx = o.x + o.w / 2;
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(cx, FLOOR, 28, 4, 0, 0, TAU); ctx.fill();
    const stones = [[-20, 7, 12], [-8, 12, 13], [6, 9, 11], [16, 6, 10], [-2, 5, 8], [24, 4, 6]];
    stones.forEach(([dx, h, w], i) => {
      const x = cx + (idx ? -dx : dx) - w / 2;
      ctx.fillStyle = i % 2 ? COL.stone : COL.stoneDark;
      ctx.beginPath(); ctx.moveTo(x, FLOOR); ctx.lineTo(x + 2, FLOOR - h); ctx.lineTo(x + w - 3, FLOOR - h + 2); ctx.lineTo(x + w, FLOOR); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,226,206,.22)'; ctx.fillRect(x + 2, FLOOR - h, w - 5, 1);
    });
    // the fallen roof cap, tipped on its side
    ctx.save(); ctx.translate(cx + (idx ? -4 : 4), FLOOR - 13); ctx.rotate(idx ? -0.5 : 0.5);
    ctx.fillStyle = '#a89a8d';
    ctx.beginPath(); ctx.moveTo(-20, 4); ctx.quadraticCurveTo(-10, 4, 0, -5); ctx.quadraticCurveTo(10, 4, 20, 4); ctx.lineTo(16, 7); ctx.lineTo(-16, 7); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(-16, 6, 32, 1.2);
    ctx.restore();
    // embers dying in the debris
    ctx.fillStyle = 'rgba(255,150,80,.55)'; ctx.fillRect(cx - 3, FLOOR - 3, 2, 2); ctx.fillRect(cx + 5, FLOOR - 2, 1.5, 1.5);
  }

  function drawBell(ctx, o, t) {
    const cx = o.x + o.w / 2, top = o.y, bot = o.y + o.h;
    const sw = Math.sin(t * 1.4) * 0.018;  // faint idle sway, purely visual
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.beginPath(); ctx.ellipse(cx, bot, o.w / 2 + 16, 5, 0, 0, TAU); ctx.fill();
    // stone plinth with a chamfered step
    ctx.fillStyle = COL.stoneDark; ctx.fillRect(o.x - 8, bot - 4, o.w + 16, 4);
    ctx.fillStyle = COL.stone; ctx.fillRect(o.x - 5, bot - 10, o.w + 10, 6);
    ctx.fillStyle = 'rgba(255,226,206,.3)'; ctx.fillRect(o.x - 5, bot - 10, o.w + 10, 1);
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(o.x - 8, bot - 4, o.w + 16, 1);
    ctx.save();
    ctx.translate(cx, top); ctx.rotate(sw);
    const hw = o.w / 2, bh = o.h - 12;
    // dragon loop handle on top
    ctx.strokeStyle = '#5c4524'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.arc(0, 7, 6, Math.PI, 0); ctx.stroke();
    ctx.strokeStyle = 'rgba(240,200,120,.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 7, 6.5, Math.PI * 1.1, Math.PI * 1.6); ctx.stroke();
    const body = () => {
      ctx.beginPath();
      ctx.moveTo(-hw + 12, 6);
      ctx.quadraticCurveTo(-hw + 2, bh * 0.4, -hw, bh);
      ctx.lineTo(hw, bh);
      ctx.quadraticCurveTo(hw - 2, bh * 0.4, hw - 12, 6);
      ctx.closePath();
    };
    const g = ctx.createLinearGradient(-hw, 0, hw, 0);
    g.addColorStop(0, '#3a2a17'); g.addColorStop(0.3, '#7d5f30'); g.addColorStop(0.55, '#a8844a'); g.addColorStop(0.75, '#6e5229'); g.addColorStop(1, '#2f2213');
    body(); ctx.fillStyle = g; ctx.fill();
    ctx.save(); body(); ctx.clip();
    // slow moving sheen
    const shx = 6 + Math.sin(t * 0.35) * 5;
    const sh = ctx.createLinearGradient(shx - 6, 0, shx + 6, 0);
    sh.addColorStop(0, 'rgba(255,230,170,0)'); sh.addColorStop(0.5, 'rgba(255,230,170,.22)'); sh.addColorStop(1, 'rgba(255,230,170,0)');
    ctx.fillStyle = sh; ctx.fillRect(shx - 6, 0, 12, bh);
    // verdigris patina
    for (const [px, py, pr] of PATINA) { ctx.fillStyle = 'rgba(90,160,140,.22)'; ctx.beginPath(); ctx.arc(px * o.w * 0.8, py * bh, pr, 0, TAU); ctx.fill(); }
    // raised bands: two horizontal, two vertical (the kesa pattern)
    const band = (y) => { ctx.fillStyle = 'rgba(30,20,10,.55)'; ctx.fillRect(-hw, y, o.w, 1.6); ctx.fillStyle = 'rgba(255,220,150,.3)'; ctx.fillRect(-hw, y + 1.6, o.w, 1); };
    band(bh * 0.18); band(bh * 0.58); band(bh * 0.78);
    for (const vx of [-hw * 0.33, hw * 0.33]) {
      ctx.fillStyle = 'rgba(30,20,10,.5)'; ctx.fillRect(vx - 0.8, bh * 0.18, 1.6, bh * 0.4);
      ctx.fillStyle = 'rgba(255,220,150,.25)'; ctx.fillRect(vx + 0.8, bh * 0.18, 1, bh * 0.4);
    }
    // nipple bosses in the upper side panels
    for (const sx of [-1, 1]) for (let rr = 0; rr < 3; rr++) for (let cc = 0; cc < 2; cc++) {
      const bx = sx * (hw * 0.47 + cc * 5.5), by = bh * 0.24 + rr * 6;
      ctx.fillStyle = '#4a361c'; ctx.beginPath(); ctx.arc(bx, by + 0.6, 1.9, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(255,226,160,.7)'; ctx.beginPath(); ctx.arc(bx - 0.5, by - 0.2, 0.8, 0, TAU); ctx.fill();
    }
    // lotus striking seat
    const lx = hw * 0.32, ly = bh * 0.68;
    ctx.strokeStyle = 'rgba(40,26,12,.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(lx, ly, 4.5, 0, TAU); ctx.stroke();
    for (let k = 0; k < 8; k++) { const a = k * TAU / 8; ctx.beginPath(); ctx.arc(lx + Math.cos(a) * 4.5, ly + Math.sin(a) * 4.5, 1.4, 0, TAU); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,220,150,.3)'; ctx.beginPath(); ctx.arc(lx - 1, ly - 1, 1.6, 0, TAU); ctx.fill();
    ctx.restore();
    // thick rim lip
    ctx.fillStyle = '#5c4524'; ctx.fillRect(-hw - 1, bh - 3, o.w + 2, 4);
    ctx.fillStyle = 'rgba(255,214,140,.55)'; ctx.fillRect(-hw - 1, bh - 3, o.w + 2, 1);
    ctx.restore();
  }

  function drawBackground(ctx, t) {
    if (!sky) { makeSprites(); sky = paintStatic(); }
    ctx.save();
    ctx.drawImage(sky, 0, 0, W, H);
    // twinkling stars
    for (const s of TWINKLE) {
      const a = 0.25 + 0.6 * Math.max(0, Math.sin(t * s.f + s.ph));
      ctx.globalAlpha = a; ctx.fillStyle = '#fff6ea';
      ctx.fillRect(s.x - s.s / 2, s.y - s.s / 2, s.s, s.s);
      if (a > 0.75) { ctx.globalAlpha = a * 0.35; ctx.fillRect(s.x - s.s * 1.6, s.y - 0.4, s.s * 3.2, 0.8); ctx.fillRect(s.x - 0.4, s.y - s.s * 1.6, 0.8, s.s * 3.2); }
    }
    // thin clouds drifting past the moon
    for (const c of CLOUDS) {
      const x = ((c.x + t * c.s) % (W + 400)) - 400;
      ctx.globalAlpha = c.a; ctx.drawImage(cloudS, x, c.y - 35);
    }
    ctx.globalAlpha = 1;
    // cranes crossing the sky now and then
    CRANES.forEach((c, i) => {
      const p = ((t + c.off) % CRANE_P) / CRANE_P;
      const x = W + 40 - p * (W + 400);
      if (x > -20 && x < W + 20) drawCrane(ctx, x, c.y + Math.sin(t * 0.6 + i) * 5, c.sc, t, i);
    });
    // mist drifting between the peaks and the temple
    for (const m of MIST) {
      const x = ((m.x + t * m.s) % (W + m.w)) - m.w;
      ctx.globalAlpha = m.a; ctx.drawImage(mistS, x, m.y - 16, m.w, 34);
    }
    ctx.globalAlpha = 1;
    // doors and windows breathe with candlelight
    const cf = 0.035 + 0.025 * Math.sin(t * 5.1) * Math.sin(t * 2.3);
    ctx.fillStyle = `rgba(${COL.warm},${cf})`;
    for (const d of DOORS) ctx.fillRect(d.x, d.y, d.w, d.h);
    // spire jewel glint
    const M = PLATFORMS[2], gl = Math.max(0, Math.sin(t * 0.9)) ** 8;
    if (gl > 0.02) {
      const jx = M.x + M.w / 2, jy = M.y - 66;
      ctx.globalAlpha = gl * 0.9; ctx.fillStyle = '#fff4d6';
      ctx.fillRect(jx - 6, jy - 0.5, 12, 1); ctx.fillRect(jx - 0.5, jy - 6, 1, 12);
      ctx.globalAlpha = 1;
    }
    for (const c of CHIMES) drawChime(ctx, c, t);
    for (const h of HANGING) drawPaperLantern(ctx, h.x, h.y, t, h.ph);
    // terrain
    OBSTACLES.forEach((o, i) => {
      if (!alive(o)) { if (o.kind === 'lantern') drawRubble(ctx, o, i); return; }
      if (o.kind === 'bell') drawBell(ctx, o, t); else drawLantern(ctx, o, t, i);
    });
    ctx.restore();
  }

  function drawForeground(ctx, t) {
    if (!sky) return;
    ctx.save();
    for (const p of PETALS) {
      const y = (p.y + t * p.vy * (p.near ? 1.4 : 1)) % (H + 30) - 15;
      const x = ((p.x + t * p.vx + Math.sin(t * 1.3 + p.ph) * 18) % (W + 30) + W + 30) % (W + 30) - 15;
      const flip = Math.cos(t * 3 + p.ph);  // petals tumble, showing their edge now and then
      const r = p.near ? p.r * 2.6 : p.r;
      ctx.save();
      ctx.translate(x, y); ctx.rotate(t * 1.6 + p.ph); ctx.scale(1, 0.25 + 0.75 * Math.abs(flip));
      ctx.globalAlpha = p.near ? 0.22 : 0.8;
      ctx.fillStyle = flip > 0 ? `rgb(${COL.petal})` : '#f6c6d6';
      // a notched sakura petal
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.quadraticCurveTo(-r * 0.2, -r * 0.75, r * 0.8, -r * 0.3);
      ctx.lineTo(r * 0.55, 0);
      ctx.lineTo(r * 0.8, r * 0.3);
      ctx.quadraticCurveTo(-r * 0.2, r * 0.75, -r, 0);
      ctx.fill();
      if (!p.near) { ctx.fillStyle = 'rgba(200,90,130,.5)'; ctx.fillRect(-r * 0.9, -0.4, r * 0.5, 0.8); }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    ctx.drawImage(vignetteS, 0, 0);
    ctx.restore();
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
