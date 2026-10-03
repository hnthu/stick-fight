// Arena 08: Desert Pyramid (Kim tự tháp sa mạc)
// Stepped pyramid terraces, heat shimmer, and a telegraphed sandstorm that pushes fighters sideways.
(function () {
  const W = 960, H = 540, FLOOR = 470;
  const CALM_MIN = 9, CALM_MAX = 13, WARN = 2.2, STORM = 3.6;
  const PUSH_GROUND = 135, PUSH_AIR = 210, PUSH_BLOCK = 70;
  const URN_HP = 30, HALF_BODY = 16, BODY_H = 130;

  // storm state machine: 'calm' -> 'warn' -> 'storm' -> 'calm'
  const S = { phase: 'calm', t: 0, next: 6, dir: Math.random() < 0.5 ? -1 : 1, power: 0, grains: [], streaks: [] };

  let farLayer = null, nearLayer = null;

  function rng(seed) {
    let s = seed >>> 0;
    return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function mk(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  // Sky, sun, distant pyramids and dunes (this band gets the heat shimmer).
  function buildFar() {
    const c = mk(W, H), g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 400);
    sky.addColorStop(0, '#120c22');
    sky.addColorStop(0.45, '#3a1d33');
    sky.addColorStop(0.78, '#7a3a2c');
    sky.addColorStop(1, '#9a5a32');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);

    const r = rng(8);
    g.fillStyle = '#e8d8c0';
    for (let i = 0; i < 70; i++) {
      const y = r() * 170;
      g.globalAlpha = 0.15 + r() * 0.5 * (1 - y / 170);
      g.fillRect(r() * W, y, 1.5, 1.5);
    }
    g.globalAlpha = 1;

    // low, dim sun behind the summit
    const sun = g.createRadialGradient(480, 330, 10, 480, 330, 210);
    sun.addColorStop(0, 'rgba(255,150,80,0.55)');
    sun.addColorStop(0.25, 'rgba(230,110,60,0.28)');
    sun.addColorStop(1, 'rgba(230,110,60,0)');
    g.fillStyle = sun; g.fillRect(0, 100, W, 360);
    g.fillStyle = 'rgba(214,104,62,0.75)';
    g.beginPath(); g.arc(480, 335, 58, 0, Math.PI * 2); g.fill();

    // distant pyramids
    function pyr(cx, base, hw, hgt, col, shade) {
      g.fillStyle = col;
      g.beginPath(); g.moveTo(cx - hw, base); g.lineTo(cx, base - hgt); g.lineTo(cx + hw, base); g.closePath(); g.fill();
      g.fillStyle = shade;
      g.beginPath(); g.moveTo(cx, base - hgt); g.lineTo(cx + hw, base); g.lineTo(cx + hw * 0.25, base); g.closePath(); g.fill();
    }
    pyr(110, 372, 120, 120, '#4a2a2a', 'rgba(0,0,0,0.25)');
    pyr(250, 378, 70, 70, '#52302c', 'rgba(0,0,0,0.25)');
    pyr(860, 374, 140, 140, '#46282a', 'rgba(0,0,0,0.25)');

    // dunes
    function dune(base, amp, col, seed) {
      const q = rng(seed);
      const ph = q() * 6, f = 0.004 + q() * 0.004;
      g.fillStyle = col;
      g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 8) g.lineTo(x, base - Math.sin(x * f + ph) * amp - Math.sin(x * f * 2.7 + ph) * amp * 0.3);
      g.lineTo(W, H); g.closePath(); g.fill();
    }
    dune(385, 14, '#5e3528', 3);
    dune(405, 10, '#6b3d2a', 9);
    return c;
  }

  // Stepped pyramid body, terraces, sand floor (static, no shimmer).
  function buildNear() {
    const c = mk(W, H), g = c.getContext('2d');
    const r = rng(42);

    // pyramid tiers (background masonry, darker so fighters pop)
    const tiers = [
      { x0: 140, x1: 820, top: 360, bot: FLOOR },
      { x0: 360, x1: 600, top: 250, bot: 360 },
    ];
    for (const tr of tiers) {
      const grd = g.createLinearGradient(0, tr.top, 0, tr.bot);
      grd.addColorStop(0, '#6a4630');
      grd.addColorStop(1, '#4a2f22');
      g.fillStyle = grd;
      g.fillRect(tr.x0, tr.top, tr.x1 - tr.x0, tr.bot - tr.top);
      // brick courses
      g.strokeStyle = 'rgba(20,10,6,0.35)';
      g.lineWidth = 1;
      let row = 0;
      for (let y = tr.top + 18; y < tr.bot; y += 18, row++) {
        g.beginPath(); g.moveTo(tr.x0, y); g.lineTo(tr.x1, y); g.stroke();
        for (let x = tr.x0 + (row % 2 ? 22 : 0); x < tr.x1; x += 44) {
          g.beginPath(); g.moveTo(x, y - 18); g.lineTo(x, y); g.stroke();
        }
      }
      // weathering specks
      for (let i = 0; i < 160; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.12)' : 'rgba(255,200,140,0.05)';
        g.fillRect(tr.x0 + r() * (tr.x1 - tr.x0), tr.top + r() * (tr.bot - tr.top), 2 + r() * 3, 1 + r() * 2);
      }
      // right-side shading for a sunset look
      const sh = g.createLinearGradient(tr.x0, 0, tr.x1, 0);
      sh.addColorStop(0, 'rgba(255,160,90,0.06)');
      sh.addColorStop(1, 'rgba(0,0,0,0.28)');
      g.fillStyle = sh; g.fillRect(tr.x0, tr.top, tr.x1 - tr.x0, tr.bot - tr.top);
    }

    // doorway with hieroglyph columns on the bottom tier
    g.fillStyle = '#1e120c';
    g.beginPath(); g.moveTo(450, FLOOR); g.lineTo(450, 405); g.lineTo(480, 390); g.lineTo(510, 405); g.lineTo(510, FLOOR); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(230,180,110,0.28)'; g.lineWidth = 1.5;
    for (const cx of [420, 540]) {
      for (let y = 378; y < 458; y += 16) {
        const k = Math.floor(r() * 4);
        g.beginPath();
        if (k === 0) { g.arc(cx, y + 6, 5, 0, Math.PI * 2); }
        else if (k === 1) { g.moveTo(cx - 5, y + 11); g.lineTo(cx, y + 1); g.lineTo(cx + 5, y + 11); g.closePath(); }
        else if (k === 2) { g.moveTo(cx, y); g.lineTo(cx, y + 12); g.moveTo(cx - 5, y + 4); g.lineTo(cx + 5, y + 4); }
        else { g.ellipse(cx, y + 6, 6, 3, 0, 0, Math.PI * 2); g.moveTo(cx - 2, y + 6); g.arc(cx, y + 6, 1.5, 0, Math.PI * 2); }
        g.stroke();
      }
    }

    // sand floor
    const sand = g.createLinearGradient(0, FLOOR, 0, H);
    sand.addColorStop(0, '#a8703f');
    sand.addColorStop(0.2, '#8a5832');
    sand.addColorStop(1, '#4a2c1a');
    g.fillStyle = sand; g.fillRect(0, FLOOR, W, H - FLOOR);
    g.fillStyle = 'rgba(255,214,150,0.35)'; g.fillRect(0, FLOOR, W, 2);
    g.strokeStyle = 'rgba(40,20,10,0.25)'; g.lineWidth = 1.2;
    for (let i = 0; i < 9; i++) {
      const y = FLOOR + 12 + i * 7 + r() * 3, ph = r() * 6;
      g.beginPath();
      for (let x = 0; x <= W; x += 10) g.lineTo(x, y + Math.sin(x * 0.03 + ph) * 2);
      g.stroke();
    }
    // sand drifts banked against the pyramid base
    g.fillStyle = '#9a6538';
    g.beginPath(); g.moveTo(80, FLOOR); g.quadraticCurveTo(140, FLOOR - 26, 200, FLOOR); g.fill();
    g.beginPath(); g.moveTo(760, FLOOR); g.quadraticCurveTo(820, FLOOR - 24, 880, FLOOR); g.fill();
    return c;
  }

  function drawLedge(ctx, p) {
    // sandstone terrace cap, top edge is the standing line
    ctx.fillStyle = '#b07a46';
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = '#d6a064';
    ctx.fillRect(p.x, p.y, p.w, 3);
    ctx.fillStyle = 'rgba(30,14,6,0.45)';
    ctx.fillRect(p.x, p.y + p.h - 3, p.w, 3);
    ctx.strokeStyle = 'rgba(40,20,8,0.4)'; ctx.lineWidth = 1;
    for (let x = p.x + 30; x < p.x + p.w; x += 30) { ctx.beginPath(); ctx.moveTo(x, p.y + 3); ctx.lineTo(x, p.y + p.h); ctx.stroke(); }
    // shadow under the lip
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(p.x + 4, p.y + p.h, p.w - 8, 6);
  }

  function brazier(ctx, x, y, t, lean) {
    ctx.fillStyle = '#3a2416';
    ctx.fillRect(x - 3, y - 22, 6, 22);
    ctx.fillStyle = '#5a3a20';
    ctx.beginPath(); ctx.moveTo(x - 11, y - 30); ctx.lineTo(x + 11, y - 30); ctx.lineTo(x + 6, y - 21); ctx.lineTo(x - 6, y - 21); ctx.closePath(); ctx.fill();
    const fl = 1 + Math.sin(t * 17 + x) * 0.15 + Math.sin(t * 29 + x * 0.3) * 0.1;
    const lx = lean * 12;
    ctx.fillStyle = 'rgba(255,120,40,0.75)';
    ctx.beginPath(); ctx.moveTo(x - 8, y - 30); ctx.quadraticCurveTo(x - 6 + lx * 0.5, y - 44 * fl, x + lx, y - 52 * fl); ctx.quadraticCurveTo(x + 6 + lx * 0.5, y - 42 * fl, x + 8, y - 30); ctx.fill();
    ctx.fillStyle = 'rgba(255,210,110,0.8)';
    ctx.beginPath(); ctx.moveTo(x - 4, y - 30); ctx.quadraticCurveTo(x + lx * 0.4, y - 40 * fl, x + lx * 0.6, y - 42 * fl); ctx.quadraticCurveTo(x + 3, y - 36, x + 4, y - 30); ctx.fill();
    const glow = ctx.createRadialGradient(x, y - 38, 2, x, y - 38, 46);
    glow.addColorStop(0, 'rgba(255,140,60,0.22)');
    glow.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = glow; ctx.fillRect(x - 46, y - 84, 92, 92);
  }

  function banner(ctx, x, y, t, wind) {
    // pole + cloth flapping downwind; shows the coming storm direction
    ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - 70); ctx.stroke();
    const len = 34 + Math.abs(wind) * 16, dir = wind === 0 ? 1 : Math.sign(wind);
    const flap = (0.3 + Math.abs(wind)) * 4;
    ctx.fillStyle = '#7a2a2a';
    ctx.beginPath();
    ctx.moveTo(x, y - 70);
    for (let i = 0; i <= 6; i++) {
      const k = i / 6;
      ctx.lineTo(x + dir * len * k, y - 70 + Math.sin(t * 9 - k * 5) * flap * k + (1 - Math.abs(wind)) * 10 * k);
    }
    for (let i = 6; i >= 0; i--) {
      const k = i / 6;
      ctx.lineTo(x + dir * len * k, y - 52 + Math.sin(t * 9 - k * 5) * flap * k + (1 - Math.abs(wind)) * 14 * k);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(230,180,90,0.6)';
    ctx.beginPath(); ctx.arc(x + dir * len * 0.4, y - 61 + (1 - Math.abs(wind)) * 5, 3.5, 0, Math.PI * 2); ctx.fill();
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
    const x = o.x, y = o.y, w = o.w, h = o.h, b = y + h;
    ctx.fillStyle = '#4a2e1e';
    ctx.fillRect(x - 6, b - 12, w + 12, 12); // plinth
    ctx.fillStyle = '#8a5d38';
    ctx.fillRect(x, y + 6, w, h - 18);
    // jagged broken top, but the standing line stays flat at y
    ctx.fillStyle = '#9c6c42';
    ctx.beginPath();
    ctx.moveTo(x, y + 8); ctx.lineTo(x, y); ctx.lineTo(x + w * 0.35, y); ctx.lineTo(x + w * 0.45, y + 4);
    ctx.lineTo(x + w * 0.6, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,214,150,0.35)';
    ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = 'rgba(255,200,140,0.14)';
    ctx.fillRect(x, y + 6, 4, h - 18);
    // fluting
    ctx.strokeStyle = 'rgba(30,14,6,0.4)'; ctx.lineWidth = 2;
    for (let i = 1; i < 4; i++) { const fx = x + (w * i) / 4; ctx.beginPath(); ctx.moveTo(fx, y + 10); ctx.lineTo(fx, b - 14); ctx.stroke(); }
    // shade + a crack
    ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(x + w * 0.7, y + 6, w * 0.3, h - 18);
    ctx.strokeStyle = 'rgba(20,8,4,0.6)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x + w * 0.3, y + 12); ctx.lineTo(x + w * 0.42, y + 34); ctx.lineTo(x + w * 0.33, y + 52); ctx.stroke();
    // broken drum lying beside it
    ctx.fillStyle = '#6e4a2e';
    const dx = x < W / 2 ? x + w + 4 : x - 30;
    ctx.beginPath(); ctx.ellipse(dx + 13, b - 7, 13, 7, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawUrn(ctx, o, t) {
    const x = o.x, y = o.y, w = o.w, h = o.h, cx = x + w / 2, b = y + h;
    if (!solid(o)) {
      // shards left on the sand
      ctx.fillStyle = '#b0603a';
      const pts = [[-22, 0, 12], [-8, -1, 8], [6, 0, 11], [19, -1, 7], [-2, -4, 6]];
      for (const p of pts) { ctx.beginPath(); ctx.moveTo(cx + p[0], b + p[1]); ctx.lineTo(cx + p[0] + p[2], b + p[1]); ctx.lineTo(cx + p[0] + p[2] * 0.4, b + p[1] - p[2] * 0.6); ctx.closePath(); ctx.fill(); }
      return;
    }
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(cx, b, w * 0.55, 4, 0, 0, Math.PI * 2); ctx.fill();
    // body
    ctx.fillStyle = '#a4552e';
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.28, y + 2);
    ctx.lineTo(cx + w * 0.28, y + 2);
    ctx.quadraticCurveTo(cx + w * 0.22, y + 10, cx + w * 0.5, y + h * 0.45);
    ctx.quadraticCurveTo(cx + w * 0.55, b - 6, cx + w * 0.25, b);
    ctx.lineTo(cx - w * 0.25, b);
    ctx.quadraticCurveTo(cx - w * 0.55, b - 6, cx - w * 0.5, y + h * 0.45);
    ctx.quadraticCurveTo(cx - w * 0.22, y + 10, cx - w * 0.28, y + 2);
    ctx.closePath(); ctx.fill();
    // rim (flat standing line)
    ctx.fillStyle = '#c06a3a'; ctx.fillRect(cx - w * 0.34, y, w * 0.68, 4);
    // painted band
    ctx.fillStyle = '#2a140a'; ctx.fillRect(x + 3, y + h * 0.42, w - 6, 5);
    ctx.fillStyle = 'rgba(230,180,100,0.7)';
    for (let i = 0; i < 4; i++) ctx.fillRect(x + 7 + i * 8, y + h * 0.42 + 1.5, 3, 2);
    // shading
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(cx + w * 0.2, y + h * 0.6, w * 0.18, h * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,200,140,0.18)';
    ctx.beginPath(); ctx.ellipse(cx - w * 0.22, y + h * 0.5, w * 0.07, h * 0.2, 0, 0, Math.PI * 2); ctx.fill();
    // cracks grow as it takes damage
    const dmg = 1 - Math.max(0, o.hp) / URN_HP;
    if (dmg > 0.05) {
      ctx.strokeStyle = 'rgba(20,6,2,0.8)'; ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(cx - 4, y + 6); ctx.lineTo(cx + 2, y + 16); ctx.lineTo(cx - 3, y + 26);
      if (dmg > 0.4) { ctx.moveTo(cx + 2, y + 16); ctx.lineTo(cx + 12, y + 22); ctx.lineTo(cx + 10, y + 34); }
      if (dmg > 0.7) { ctx.moveTo(cx - 3, y + 26); ctx.lineTo(cx - 12, y + 36); ctx.moveTo(cx - 3, y + 26); ctx.lineTo(cx + 1, y + 44); }
      ctx.stroke();
    }
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
        // heat shimmer: the horizon band wobbles in thin strips
        const amp = 1.6 + Math.abs(windVis()) * 2;
        for (let y = 250; y < 420; y += 3) {
          const k = (y - 250) / 170;
          const off = Math.sin(t * 3.1 + y * 0.21) * amp * k + Math.sin(t * 5.3 + y * 0.07) * amp * 0.5 * k;
          ctx.drawImage(farLayer, 0, y, W, 3, off - 2, y, W + 4, 3);
        }

        // distant haze grows during storms
        const wv = Math.abs(windVis());
        if (wv > 0.15) {
          ctx.fillStyle = 'rgba(180,110,60,' + (0.22 * wv).toFixed(3) + ')';
          ctx.fillRect(0, 100, W, 330);
        }

        ctx.drawImage(nearLayer, 0, 0);

        // gold capstone glint above the summit
        const cap = 0.5 + 0.2 * Math.sin(t * 1.3);
        ctx.fillStyle = 'rgba(214,160,70,' + cap.toFixed(3) + ')';
        ctx.beginPath(); ctx.moveTo(455, 250); ctx.lineTo(480, 214); ctx.lineTo(505, 250); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath(); ctx.moveTo(480, 214); ctx.lineTo(505, 250); ctx.lineTo(486, 250); ctx.closePath(); ctx.fill();

        for (const p of arena.platforms) drawLedge(ctx, p);
        for (const o of arena.obstacles) {
          if (o.kind === 'pillar') { if (solid(o)) drawPillar(ctx, o); }
          else if (o.kind === 'urn') drawUrn(ctx, o, t);
        }

        const w = windVis();
        brazier(ctx, 400, 250, t, w);
        brazier(ctx, 560, 250, t, w);
        banner(ctx, 180, 360, t, w);
        banner(ctx, 780, 360, t, w);

        // drifting sand grains near the ground
        ctx.fillStyle = 'rgba(230,180,120,0.45)';
        for (const g of S.grains) ctx.fillRect(g.x, g.y, 2, 1.5);

        // warning: dust wall rising on the upwind edge
        if (S.phase === 'warn') {
          const k = S.t / WARN;
          const ex = S.dir > 0 ? 0 : W, wdt = 60 + 140 * k;
          const grd = ctx.createLinearGradient(ex, 0, ex + S.dir * wdt, 0);
          grd.addColorStop(0, 'rgba(200,140,80,' + (0.55 * k + 0.15).toFixed(3) + ')');
          grd.addColorStop(1, 'rgba(200,140,80,0)');
          ctx.fillStyle = grd;
          ctx.fillRect(S.dir > 0 ? 0 : W - wdt, 90, wdt, FLOOR - 90);
        }
        ctx.restore();
      } catch (e) {
        try { ctx.restore(); } catch (e2) {}
      }
    },

    drawForeground(ctx, t) {
      try {
        ctx.save();
        // warning chevrons near the top of the arena
        if (S.phase === 'warn') {
          const blink = (Math.sin(t * 14) + 1) / 2;
          ctx.globalAlpha = 0.45 + 0.45 * blink;
          ctx.fillStyle = '#ffb060';
          const y = 104, d = S.dir;
          for (let i = 0; i < 5; i++) {
            const cx = W / 2 + (i - 2) * 46 + d * ((t * 60) % 46);
            ctx.beginPath();
            ctx.moveTo(cx - d * 10, y - 12); ctx.lineTo(cx + d * 6, y); ctx.lineTo(cx - d * 10, y + 12);
            ctx.lineTo(cx - d * 4, y + 12); ctx.lineTo(cx + d * 12, y); ctx.lineTo(cx - d * 4, y - 12);
            ctx.closePath(); ctx.fill();
          }
          ctx.globalAlpha = 1;
        }
        if (S.phase === 'storm' || S.streaks.length) {
          ctx.fillStyle = 'rgba(190,120,60,' + (0.13 * S.power).toFixed(3) + ')';
          ctx.fillRect(0, 80, W, H - 80);
          ctx.strokeStyle = 'rgba(235,190,130,0.35)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (const s of S.streaks) { ctx.moveTo(s.x, s.y); ctx.lineTo(s.x - S.dir * s.len, s.y + 2); }
          ctx.stroke();
        }
        // faint heat haze at the bottom edge
        const hz = ctx.createLinearGradient(0, H - 50, 0, H);
        hz.addColorStop(0, 'rgba(255,160,90,0)');
        hz.addColorStop(1, 'rgba(255,160,90,0.08)');
        ctx.fillStyle = hz; ctx.fillRect(0, H - 50, W, 50);
        ctx.restore();
      } catch (e) {
        try { ctx.restore(); } catch (e2) {}
      }
    },
  };

  (window.STICK_ARENAS = window.STICK_ARENAS || []).push(arena);
})();
