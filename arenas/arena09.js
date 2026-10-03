// Arena 09: Factory (Nhà máy)
// Two conveyor-belt platforms that carry fighters (direction flips every ~10 s,
// arrows blink before a flip), a hydraulic crusher over the centre of the floor
// that slams every ~11 s after a 1.4 s warning, breakable steel crates guarding
// the crusher zone and solid machine blocks against both walls.

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

  // ---------- static background (pre-rendered once) ----------
  let bg = null;
  function buildBg() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');

    // back wall
    const wall = g.createLinearGradient(0, 0, 0, FLOOR);
    wall.addColorStop(0, '#15171c');
    wall.addColorStop(1, '#22252b');
    g.fillStyle = wall; g.fillRect(0, 0, W, FLOOR);

    // brick/panel lines
    g.strokeStyle = 'rgba(255,255,255,0.035)'; g.lineWidth = 1;
    for (let y = 90; y < FLOOR; y += 40) {
      g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke();
      const off = ((y / 40) | 0) % 2 ? 40 : 0;
      for (let x = off; x < W; x += 80) { g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + 40); g.stroke(); }
    }

    // tall windows with dim orange glow from a furnace outside
    for (const wx of [70, 300, 590, 820]) {
      const gr = g.createLinearGradient(0, 110, 0, 250);
      gr.addColorStop(0, 'rgba(120,60,25,0.35)');
      gr.addColorStop(1, 'rgba(60,30,15,0.15)');
      g.fillStyle = gr; g.fillRect(wx, 110, 70, 140);
      g.strokeStyle = '#2d3036'; g.lineWidth = 4; g.strokeRect(wx, 110, 70, 140);
      g.lineWidth = 2;
      g.beginPath(); g.moveTo(wx + 35, 110); g.lineTo(wx + 35, 250); g.moveTo(wx, 180); g.lineTo(wx + 70, 180); g.stroke();
    }

    // vertical and horizontal pipes
    function pipe(x1, y1, x2, y2, r, col) {
      g.strokeStyle = col; g.lineWidth = r * 2; g.lineCap = 'butt';
      g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = r * 0.6;
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len * r * 0.45, ny = dx / len * r * 0.45;
      g.beginPath(); g.moveTo(x1 + nx, y1 + ny); g.lineTo(x2 + nx, y2 + ny); g.stroke();
    }
    pipe(0, 95, W, 95, 9, '#2e3a36');
    pipe(40, 95, 40, FLOOR, 8, '#3a302a');
    pipe(920, 95, 920, FLOOR, 8, '#3a302a');
    pipe(250, 95, 250, 280, 6, '#2e3a36');
    pipe(710, 95, 710, 280, 6, '#2e3a36');
    pipe(250, 280, 160, 280, 6, '#2e3a36');
    pipe(710, 280, 800, 280, 6, '#2e3a36');
    // flanges
    g.fillStyle = '#454b50';
    for (const [x, y, v] of [[40, 160, 1], [40, 380, 1], [920, 160, 1], [920, 380, 1], [250, 180, 1], [710, 180, 1], [140, 95, 0], [820, 95, 0], [360, 95, 0], [600, 95, 0]]) {
      if (v) g.fillRect(x - 12, y - 4, 24, 8); else g.fillRect(x - 4, y - 12, 8, 24);
    }

    // crusher frame: two vertical rails either side of the press
    g.fillStyle = '#2b2f35';
    g.fillRect(CR_X - CR_HALF - 26, 84, 14, FLOOR - 84);
    g.fillRect(CR_X + CR_HALF + 12, 84, 14, FLOOR - 84);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.fillRect(CR_X - CR_HALF - 24, 84, 3, FLOOR - 84);
    g.fillRect(CR_X + CR_HALF + 14, 84, 3, FLOOR - 84);
    // housing at the top
    g.fillStyle = '#30353b'; g.fillRect(CR_X - 90, 80, 180, 40);
    g.fillStyle = '#1d2024'; g.fillRect(CR_X - 90, 116, 180, 6);
    // rivets
    g.fillStyle = '#4a5157';
    for (let x = CR_X - 80; x <= CR_X + 80; x += 20) { g.beginPath(); g.arc(x, 88, 2, 0, 7); g.fill(); }

    // floor
    const fl = g.createLinearGradient(0, FLOOR, 0, H);
    fl.addColorStop(0, '#2a2c30'); fl.addColorStop(1, '#141518');
    g.fillStyle = fl; g.fillRect(0, FLOOR, W, H - FLOOR);
    g.fillStyle = '#3b3f45'; g.fillRect(0, FLOOR, W, 4);
    // diamond plate texture
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = FLOOR + 14; y < H; y += 16) for (let x = ((y / 16) | 0) % 2 ? 8 : 0; x < W; x += 16) g.fillRect(x, y, 6, 2);
    // hazard stripes under the crusher
    g.save();
    g.beginPath(); g.rect(CR_X - CR_HALF - 10, FLOOR + 4, (CR_HALF + 10) * 2, 14); g.clip();
    g.fillStyle = '#4a3f1c'; g.fillRect(CR_X - 80, FLOOR + 4, 160, 14);
    g.fillStyle = '#1a1a1a';
    for (let x = CR_X - 90; x < CR_X + 90; x += 16) {
      g.beginPath(); g.moveTo(x, FLOOR + 18); g.lineTo(x + 8, FLOOR + 4); g.lineTo(x + 16, FLOOR + 4); g.lineTo(x + 8, FLOOR + 18); g.fill();
    }
    g.restore();
    return c;
  }

  function gear(ctx, x, y, r, teeth, ang, col) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = col;
    ctx.beginPath();
    const n = teeth * 2;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
      const rr = i % 2 ? r * 0.82 : r;
      ctx.lineTo(Math.cos(a0) * rr, Math.sin(a0) * rr);
      ctx.lineTo(Math.cos(a1) * rr, Math.sin(a1) * rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#16181c';
    ctx.beginPath(); ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawBelt(ctx, p, side, t) {
    // side: 0 = left belt, 1 = right belt. Movement in world x for this belt:
    const dirX = (side === 0 ? 1 : -1) * st.beltDir;
    const { x, y, w } = p;
    const h = 16;
    // support legs
    ctx.fillStyle = '#25282d';
    ctx.fillRect(x + 18, y + h, 8, FLOOR - y - h);
    ctx.fillRect(x + w - 26, y + h, 8, FLOOR - y - h);
    ctx.fillStyle = '#1c1f23';
    ctx.fillRect(x + 14, y + h + 40, w - 28, 5);
    // belt body
    ctx.fillStyle = '#32363c';
    ctx.beginPath();
    ctx.arc(x + h / 2, y + h / 2, h / 2, Math.PI / 2, Math.PI * 1.5);
    ctx.lineTo(x + w - h / 2, y);
    ctx.arc(x + w - h / 2, y + h / 2, h / 2, -Math.PI / 2, Math.PI / 2);
    ctx.closePath(); ctx.fill();
    // treads moving along the top
    ctx.save();
    ctx.beginPath(); ctx.rect(x + h / 2, y - 1, w - h, 5); ctx.clip();
    ctx.fillStyle = '#4d5359'; ctx.fillRect(x, y - 1, w, 5);
    ctx.fillStyle = '#1b1d21';
    const off = ((st.beltOffset * dirX) % 14 + 14) % 14;
    for (let tx = x - 14 + off; tx < x + w; tx += 14) ctx.fillRect(tx, y - 1, 5, 5);
    ctx.restore();
    // end rollers
    gear(ctx, x + h / 2, y + h / 2, 7, 6, st.gearA * dirX * 2.2, '#5a6066');
    gear(ctx, x + w - h / 2, y + h / 2, 7, 6, st.gearA * dirX * 2.2, '#5a6066');
    // direction arrows on the belt side (blink before a flip)
    const warn = st.beltT > FLIP_EVERY - FLIP_WARN;
    const on = !warn || Math.sin(t * 22) > 0;
    if (on) {
      ctx.fillStyle = warn ? 'rgba(255,170,60,0.85)' : 'rgba(120,220,140,0.55)';
      for (let i = 0; i < 3; i++) {
        const cx = x + w * (0.3 + i * 0.2), cy = y + 10;
        ctx.beginPath();
        ctx.moveTo(cx + 5 * dirX, cy);
        ctx.lineTo(cx - 3 * dirX, cy - 4);
        ctx.lineTo(cx - 3 * dirX, cy + 4);
        ctx.closePath(); ctx.fill();
      }
    }
  }

  function obstacleGone(o) {
    return !o || o.broken || o.dead || o.destroyed || (o.hp !== undefined && o.hp <= 0);
  }

  function drawObstacle(ctx, o, t) {
    if (obstacleGone(o)) return;
    const { x, y, w, h } = o;
    if (o.kind === 'machine') {
      // squat generator block with a pressure gauge and a slow green status light
      ctx.fillStyle = '#2c3137'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#3a4047'; ctx.fillRect(x, y, w, 7);
      ctx.fillStyle = '#1c1f23'; ctx.fillRect(x + 6, y + 14, w - 12, 4); ctx.fillRect(x + 6, y + 22, w - 12, 4);
      const gx = x + w / 2, gy = y + 46;
      ctx.fillStyle = '#16181c'; ctx.beginPath(); ctx.arc(gx, gy, 12, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#7a8189'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(gx, gy, 12, 0, Math.PI * 2); ctx.stroke();
      const a = -Math.PI * 0.75 + Math.PI * 1.1 * (0.5 + 0.4 * Math.sin(t * 0.9 + x));
      ctx.strokeStyle = '#d8743c';
      ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(gx + Math.cos(a) * 9, gy + Math.sin(a) * 9); ctx.stroke();
      ctx.fillStyle = Math.sin(t * 2 + x) > 0 ? '#4fbf6a' : '#1f4a2a';
      ctx.fillRect(x + w - 12, y + 10, 5, 5);
      ctx.fillStyle = '#4a5157';
      for (const [rx, ry] of [[x + 4, y + h - 6], [x + w - 6, y + h - 6]]) ctx.fillRect(rx, ry, 3, 3);
      return;
    }
    // steel crate: darker as it takes damage, cracks appear
    const frac = o.hp !== undefined ? Math.max(0, Math.min(1, o.hp / CRATE_HP)) : 1;
    ctx.fillStyle = frac > 0.5 ? '#4a4237' : '#3d362d';
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#6b5e48'; ctx.lineWidth = 4;
    ctx.strokeRect(x + 2, y + 2, w - 4, h - 4);
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + w - 4, y + h - 4);
    ctx.moveTo(x + w - 4, y + 4); ctx.lineTo(x + 4, y + h - 4); ctx.stroke();
    ctx.fillStyle = '#8a7a5a';
    for (const [rx, ry] of [[x + 3, y + 3], [x + w - 7, y + 3], [x + 3, y + h - 7], [x + w - 7, y + h - 7]]) ctx.fillRect(rx, ry, 4, 4);
    if (frac < 0.67) {
      ctx.strokeStyle = 'rgba(15,12,10,0.9)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + w * 0.3, y); ctx.lineTo(x + w * 0.45, y + h * 0.35); ctx.lineTo(x + w * 0.35, y + h * 0.6); ctx.stroke();
      if (frac < 0.34) {
        ctx.beginPath(); ctx.moveTo(x + w, y + h * 0.4); ctx.lineTo(x + w * 0.65, y + h * 0.55); ctx.lineTo(x + w * 0.7, y + h); ctx.stroke();
      }
    }
  }

  function drawCrusher(ctx, t) {
    const c = crusher();
    let shakeX = 0;
    if (c.phase === 'warn') shakeX = Math.sin(t * 70) * 2 * c.k;
    const hx = CR_X + shakeX, by = c.y;
    // piston rods
    ctx.fillStyle = '#5d646b';
    ctx.fillRect(hx - 26, 118, 12, by - 40 - 118);
    ctx.fillRect(hx + 14, 118, 12, by - 40 - 118);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(hx - 24, 118, 3, by - 40 - 118);
    ctx.fillRect(hx + 16, 118, 3, by - 40 - 118);
    // head block
    ctx.fillStyle = '#3b4148';
    ctx.fillRect(hx - CR_HALF, by - 40, CR_HALF * 2, 40);
    ctx.fillStyle = '#4a5158';
    ctx.fillRect(hx - CR_HALF, by - 40, CR_HALF * 2, 6);
    // striped striking face
    ctx.save();
    ctx.beginPath(); ctx.rect(hx - CR_HALF, by - 12, CR_HALF * 2, 12); ctx.clip();
    ctx.fillStyle = '#8a6d1e'; ctx.fillRect(hx - CR_HALF, by - 12, CR_HALF * 2, 12);
    ctx.fillStyle = '#1a1a1a';
    for (let x = hx - CR_HALF - 12; x < hx + CR_HALF; x += 16) {
      ctx.beginPath(); ctx.moveTo(x, by); ctx.lineTo(x + 8, by - 12); ctx.lineTo(x + 16, by - 12); ctx.lineTo(x + 8, by); ctx.fill();
    }
    ctx.restore();
    // warning lamp on the housing
    const lampOn = c.phase === 'warn' ? Math.sin(t * 26) > 0 : c.phase === 'drop' || c.phase === 'hold';
    ctx.fillStyle = lampOn ? '#ff3b2e' : '#4a1d1a';
    ctx.beginPath(); ctx.arc(CR_X, 100, 7, 0, Math.PI * 2); ctx.fill();
    if (lampOn) {
      ctx.fillStyle = 'rgba(255,60,40,0.18)';
      ctx.beginPath(); ctx.arc(CR_X, 100, 22, 0, Math.PI * 2); ctx.fill();
    }
    // danger zone on the floor during the warning
    if (c.phase === 'warn') {
      const a = 0.15 + 0.25 * (Math.sin(t * 26) * 0.5 + 0.5);
      const zone = ctx.createLinearGradient(0, FLOOR - 160, 0, FLOOR);
      zone.addColorStop(0, 'rgba(255,60,40,0)');
      zone.addColorStop(1, 'rgba(255,60,40,' + a.toFixed(3) + ')');
      ctx.fillStyle = zone;
      ctx.fillRect(CR_X - CR_HIT_HALF + 18, FLOOR - 160, (CR_HIT_HALF - 18) * 2, 160);
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
        if (!bg) bg = buildBg();
        ctx.save();
        ctx.drawImage(bg, 0, 0);

        // big slow gears on the wall
        gear(ctx, 150, 200, 46, 12, st.gearA * 0.4, '#2a2e33');
        gear(ctx, 214, 238, 26, 8, -st.gearA * 0.4 * 46 / 26, '#2f343a');
        gear(ctx, 810, 200, 46, 12, -st.gearA * 0.4, '#2a2e33');
        gear(ctx, 746, 238, 26, 8, st.gearA * 0.4 * 46 / 26, '#2f343a');

        // steam puffs leaking from the pipe joints (decor only)
        for (let i = 0; i < 6; i++) {
          const k = ((t * 0.35 + i / 6) % 1);
          const sx = i % 2 ? 920 : 40, sy = 380 - k * 120;
          ctx.fillStyle = 'rgba(190,200,210,' + (0.10 * (1 - k)).toFixed(3) + ')';
          ctx.beginPath(); ctx.arc(sx + (i % 2 ? -1 : 1) * (8 + k * 20), sy, 6 + k * 14, 0, Math.PI * 2); ctx.fill();
        }

        for (const o of obstacles) drawObstacle(ctx, o, t);
        drawBelt(ctx, platforms[0], 0, t);
        drawBelt(ctx, platforms[1], 1, t);
        drawCrusher(ctx, t);
        ctx.restore();
      } catch (e) { try { ctx.restore(); } catch (_) {} }
    },

    drawForeground(ctx, t) {
      try {
        ctx.save();
        // dark vignette at the edges
        const v = ctx.createRadialGradient(W / 2, H / 2, 240, W / 2, H / 2, 620);
        v.addColorStop(0, 'rgba(0,0,0,0)');
        v.addColorStop(1, 'rgba(0,0,0,0.38)');
        ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
        // dust burst after a slam
        const c = crusher();
        if (c.phase === 'hold') {
          const a = 0.22 * (1 - c.k);
          ctx.fillStyle = 'rgba(170,165,150,' + a.toFixed(3) + ')';
          ctx.beginPath(); ctx.ellipse(CR_X, FLOOR - 6, 90 + c.k * 70, 18 + c.k * 10, 0, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      } catch (e) { try { ctx.restore(); } catch (_) {} }
    },
  };

  arena.reset();
  (window.STICK_ARENAS = window.STICK_ARENAS || []).push(arena);
})();
