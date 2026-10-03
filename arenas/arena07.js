// Arena 07: Space Station (Trạm vũ trụ)
// Low gravity, two fixed metal ledges and one thruster platform that drifts left and right.
(function () {
  const W = 960, H = 540, FLOOR = 474;
  const DRIFT_CX = 405, DRIFT_AMP = 150, DRIFT_PERIOD = 11;

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
  const obstacles = OBSTACLES.map(o => Object.assign({}, o));
  const alive = o => !(o.broken || o.dead || o.destroyed || (o.hp != null && o.hp <= 0));

  function drawObstacle(ctx, o, t) {
    const { x, y, w, h } = o;
    if (o.kind === 'container') {
      const left = x < W / 2;
      const g = ctx.createLinearGradient(x, 0, x + w, 0);
      g.addColorStop(0, left ? '#5a2e22' : '#1f3a52'); g.addColorStop(1, left ? '#3a1d17' : '#132538');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      for (let sx = x + 8; sx < x + w - 4; sx += 10) ctx.fillRect(sx, y + 6, 3, h - 12);
      ctx.strokeStyle = left ? '#8a4a36' : '#3d6688'; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
      ctx.fillStyle = 'rgba(210,170,40,0.75)'; ctx.fillRect(x + w / 2 - 14, y + h / 2 - 6, 28, 12);
      ctx.fillStyle = '#1a1a1a'; ctx.font = 'bold 9px monospace'; ctx.textAlign = 'center';
      ctx.fillText(left ? 'C-07A' : 'C-07B', x + w / 2, y + h / 2 + 3); ctx.textAlign = 'left';
    } else if (o.kind === 'console') {
      ctx.fillStyle = '#262c3c'; ctx.fillRect(x, y + 10, w, h - 10);
      ctx.fillStyle = '#3a4258';
      ctx.beginPath(); ctx.moveTo(x - 4, y + 12); ctx.lineTo(x + 8, y); ctx.lineTo(x + w - 8, y); ctx.lineTo(x + w + 4, y + 12); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8a96b8'; ctx.fillRect(x + 8, y, w - 16, 2);
      // screen
      ctx.fillStyle = '#0b1a24'; ctx.fillRect(x + 10, y + 18, w - 20, 16);
      ctx.strokeStyle = 'rgba(90,220,160,0.7)'; ctx.lineWidth = 1.5; ctx.beginPath();
      for (let i = 0; i <= w - 24; i += 3) {
        const yy = y + 26 + Math.sin(t * 6 + i * 0.35) * 5 * Math.sin(i * 0.12);
        i ? ctx.lineTo(x + 12 + i, yy) : ctx.moveTo(x + 12, yy);
      }
      ctx.stroke();
      // buttons
      const cols = ['#ff5a5a', '#ffcf5a', '#5affb0', '#5ab4ff'];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = Math.sin(t * 4 + i * 1.7) > 0 ? cols[i] : 'rgba(80,90,110,0.9)';
        ctx.fillRect(x + 12 + i * 13, y + 40, 6, 5);
      }
    } else {
      // floating debris crate; cracks show as it takes damage
      const max = 40;
      const dmg = o.hp != null ? 1 - Math.max(0, o.hp) / max : 0;
      ctx.save();
      ctx.fillStyle = 'rgba(120,200,255,0.12)';
      ctx.beginPath(); ctx.ellipse(x + w / 2, y + h + 8, w * 0.6, 5, 0, 0, Math.PI * 2); ctx.fill();
      const g = ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, '#6a6f80'); g.addColorStop(1, '#2f3340');
      ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#9aa3bd'; ctx.lineWidth = 2; ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.lineTo(x + w - 4, y + h - 4); ctx.moveTo(x + w - 4, y + 4); ctx.lineTo(x + 4, y + h - 4); ctx.stroke();
      if (dmg > 0.01) {
        ctx.strokeStyle = 'rgba(255,170,90,0.85)'; ctx.lineWidth = 1.5; ctx.beginPath();
        ctx.moveTo(x + w * 0.2, y); ctx.lineTo(x + w * 0.45, y + h * 0.4); ctx.lineTo(x + w * 0.3, y + h * 0.7);
        if (dmg > 0.4) { ctx.moveTo(x + w, y + h * 0.3); ctx.lineTo(x + w * 0.55, y + h * 0.5); ctx.lineTo(x + w * 0.7, y + h); }
        ctx.stroke();
      }
      // orbiting bits sell the zero-g
      for (let i = 0; i < 3; i++) {
        const a = t * (0.8 + i * 0.3) + i * 2.1 + x;
        ctx.fillStyle = 'rgba(160,170,195,0.7)';
        ctx.fillRect(x + w / 2 + Math.cos(a) * (w * 0.75) - 2, y + h / 2 + Math.sin(a) * (h * 0.5) - 2, 4, 3);
      }
      ctx.restore();
    }
  }

  // seeded random so the starfield is the same every load
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

  const twinkles = [];
  const farStars = [];
  for (let i = 0; i < 26; i++) twinkles.push({ x: rnd() * W, y: 20 + rnd() * 400, r: 1 + rnd() * 1.2, ph: rnd() * 6.28, sp: 1 + rnd() * 2 });
  for (let i = 0; i < 40; i++) farStars.push({ x: rnd() * W, y: 10 + rnd() * 430, a: 0.15 + rnd() * 0.3 });

  let bg = null;
  function buildStatic() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const b = c.getContext('2d');

    // deep space
    const sky = b.createLinearGradient(0, 0, 0, FLOOR);
    sky.addColorStop(0, '#05060f');
    sky.addColorStop(0.6, '#0a0c1e');
    sky.addColorStop(1, '#111427');
    b.fillStyle = sky; b.fillRect(0, 0, W, H);

    // faint nebula clouds
    const neb = (x, y, r, col) => {
      const g = b.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
      b.fillStyle = g; b.fillRect(x - r, y - r, r * 2, r * 2);
    };
    neb(220, 160, 260, 'rgba(90,50,140,0.18)');
    neb(560, 300, 220, 'rgba(40,80,140,0.14)');
    neb(880, 420, 200, 'rgba(120,40,90,0.10)');

    // static stars
    for (let i = 0; i < 220; i++) {
      const x = rnd() * W, y = rnd() * (FLOOR - 10), a = 0.15 + rnd() * 0.5;
      b.fillStyle = `rgba(220,226,255,${a.toFixed(2)})`;
      const s = rnd() < 0.9 ? 1 : 2;
      b.fillRect(x, y, s, s);
    }

    // ringed planet (upper right, out of the main fight band)
    const px = 790, py = 165, pr = 64;
    b.save();
    b.translate(px, py); b.rotate(-0.35);
    b.strokeStyle = 'rgba(200,170,120,0.35)'; b.lineWidth = 6;
    b.beginPath(); b.ellipse(0, 0, pr * 1.9, pr * 0.42, 0, Math.PI, Math.PI * 2); b.stroke();
    b.restore();
    const pg = b.createRadialGradient(px - 22, py - 24, 8, px, py, pr);
    pg.addColorStop(0, '#b98d5c'); pg.addColorStop(0.6, '#7a5236'); pg.addColorStop(1, '#2e1d18');
    b.fillStyle = pg; b.beginPath(); b.arc(px, py, pr, 0, Math.PI * 2); b.fill();
    b.save();
    b.beginPath(); b.arc(px, py, pr, 0, Math.PI * 2); b.clip();
    for (let i = -3; i <= 3; i++) {
      b.fillStyle = i % 2 ? 'rgba(60,35,25,0.25)' : 'rgba(230,190,140,0.12)';
      b.fillRect(px - pr, py + i * 17 - 4, pr * 2, 8);
    }
    b.restore();
    b.save();
    b.translate(px, py); b.rotate(-0.35);
    b.strokeStyle = 'rgba(220,190,140,0.45)'; b.lineWidth = 6;
    b.beginPath(); b.ellipse(0, 0, pr * 1.9, pr * 0.42, 0, 0, Math.PI); b.stroke();
    b.strokeStyle = 'rgba(160,130,95,0.3)'; b.lineWidth = 3;
    b.beginPath(); b.ellipse(0, 0, pr * 2.15, pr * 0.5, 0, 0, Math.PI); b.stroke();
    b.restore();

    // small moon
    const mg = b.createRadialGradient(150, 120, 2, 156, 126, 22);
    mg.addColorStop(0, '#8d93a8'); mg.addColorStop(1, '#2a2d3c');
    b.fillStyle = mg; b.beginPath(); b.arc(156, 126, 20, 0, Math.PI * 2); b.fill();

    // viewport frame: struts left and right, top beam
    const metal = (x, y, w, h, light) => {
      const g = b.createLinearGradient(x, y, x + w, y);
      g.addColorStop(0, '#1b1f2b'); g.addColorStop(0.5, light || '#2c3242'); g.addColorStop(1, '#151821');
      b.fillStyle = g; b.fillRect(x, y, w, h);
    };
    metal(0, 0, 22, FLOOR);
    metal(W - 22, 0, 22, FLOOR);
    b.fillStyle = '#0d0f17';
    b.fillRect(0, 0, W, 10);
    // diagonal braces in the corners
    b.strokeStyle = '#232837'; b.lineWidth = 10;
    b.beginPath(); b.moveTo(22, 120); b.lineTo(110, 10); b.moveTo(W - 22, 120); b.lineTo(W - 110, 10); b.stroke();
    b.strokeStyle = 'rgba(120,140,180,0.18)'; b.lineWidth = 1;
    b.beginPath(); b.moveTo(22, 112); b.lineTo(104, 10); b.moveTo(W - 22, 112); b.lineTo(W - 104, 10); b.stroke();
    // rivets on struts
    b.fillStyle = 'rgba(150,165,200,0.35)';
    for (let y = 30; y < FLOOR; y += 46) { b.fillRect(9, y, 3, 3); b.fillRect(W - 12, y, 3, 3); }

    // deck
    const deck = b.createLinearGradient(0, FLOOR, 0, H);
    deck.addColorStop(0, '#2b3142'); deck.addColorStop(0.15, '#1d2230'); deck.addColorStop(1, '#0d0f16');
    b.fillStyle = deck; b.fillRect(0, FLOOR, W, H - FLOOR);
    b.fillStyle = '#4a5370'; b.fillRect(0, FLOOR, W, 2);
    b.strokeStyle = 'rgba(0,0,0,0.45)'; b.lineWidth = 2;
    for (let x = 0; x <= W; x += 80) { b.beginPath(); b.moveTo(x, FLOOR + 4); b.lineTo(x, H); b.stroke(); }
    b.beginPath(); b.moveTo(0, FLOOR + 30); b.lineTo(W, FLOOR + 30); b.stroke();
    b.fillStyle = 'rgba(160,175,210,0.25)';
    for (let x = 0; x < W; x += 80) { b.fillRect(x + 8, FLOOR + 10, 2, 2); b.fillRect(x + 70, FLOOR + 10, 2, 2); }
    // hazard stripes near the edges
    b.save();
    b.beginPath(); b.rect(0, FLOOR + 34, 90, 10); b.rect(W - 90, FLOOR + 34, 90, 10); b.clip();
    for (let x = -20; x < W; x += 16) {
      b.fillStyle = 'rgba(210,170,40,0.55)';
      b.beginPath(); b.moveTo(x, FLOOR + 44); b.lineTo(x + 8, FLOOR + 34); b.lineTo(x + 16, FLOOR + 34); b.lineTo(x + 8, FLOOR + 44); b.fill();
    }
    b.restore();
    // deck label
    b.fillStyle = 'rgba(150,170,220,0.35)';
    b.font = 'bold 12px monospace'; b.textAlign = 'center';
    b.fillText('DOCK 07  -  LOW-G ZONE', W / 2, FLOOR + 52);
    b.textAlign = 'left';
    return c;
  }

  function drawPlatform(ctx, p, t, thrusters) {
    const { x, y, w, h } = p;
    // underside thruster glow (floating feel)
    const flick = 0.75 + 0.25 * Math.sin(t * 23 + x);
    const nozzles = thrusters ? [x + 22, x + w - 22] : [x + w / 2];
    for (const nx of nozzles) {
      const len = (thrusters ? 26 : 16) * flick;
      const g = ctx.createLinearGradient(0, y + h, 0, y + h + len);
      g.addColorStop(0, 'rgba(120,200,255,0.55)'); g.addColorStop(1, 'rgba(60,120,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(nx - 7, y + h + 2); ctx.lineTo(nx + 7, y + h + 2); ctx.lineTo(nx, y + h + 2 + len); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#333a4d'; ctx.fillRect(nx - 8, y + h, 16, 4);
    }
    // body
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, '#5a6480'); g.addColorStop(0.3, '#3a4258'); g.addColorStop(1, '#1f2433');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#8a96b8'; ctx.fillRect(x, y, w, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let sx = x + 30; sx < x + w - 10; sx += 30) ctx.fillRect(sx, y + 4, 2, h - 5);
    // blinking edge lights
    const on = Math.sin(t * 3 + x * 0.01) > 0;
    ctx.fillStyle = on ? (thrusters ? '#ffcf5a' : '#7fd6ff') : 'rgba(80,90,110,0.8)';
    ctx.fillRect(x + 3, y + 5, 4, 4); ctx.fillRect(x + w - 7, y + 5, 4, 4);
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
        ctx.save();
        ctx.drawImage(bg, 0, 0);

        // slow parallax star drift
        const off = (t * 6) % W;
        for (const s of farStars) {
          let x = s.x - off; if (x < 0) x += W;
          ctx.fillStyle = `rgba(180,200,255,${s.a})`;
          ctx.fillRect(x, s.y, 1, 1);
        }
        // twinkling stars
        for (const s of twinkles) {
          const a = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * s.sp + s.ph));
          ctx.fillStyle = `rgba(235,240,255,${a.toFixed(3)})`;
          ctx.fillRect(s.x - s.r, s.y - 0.5, s.r * 2 + 1, 1);
          ctx.fillRect(s.x - 0.5, s.y - s.r, 1, s.r * 2 + 1);
        }
        // a satellite crossing the upper sky every ~40 s
        const sp = (t % 40) / 40;
        const sx = -60 + sp * (W + 120), sy = 105 + Math.sin(sp * 3) * 12;
        ctx.save();
        ctx.translate(sx, sy); ctx.rotate(t * 0.3);
        ctx.fillStyle = '#5d6683'; ctx.fillRect(-5, -4, 10, 8);
        ctx.fillStyle = '#2d4f86'; ctx.fillRect(-19, -2, 12, 4); ctx.fillRect(7, -2, 12, 4);
        ctx.restore();
        if (Math.sin(t * 5) > 0.6) { ctx.fillStyle = '#ff6a6a'; ctx.fillRect(sx - 1, sy - 6, 2, 2); }

        // deck running lights
        for (let i = 0; i < 12; i++) {
          const lx = 40 + i * 80;
          const a = 0.25 + 0.35 * Math.max(0, Math.sin(t * 2.2 - i * 0.55));
          ctx.fillStyle = `rgba(90,190,255,${a.toFixed(3)})`;
          ctx.fillRect(lx - 10, FLOOR + 3, 20, 2);
        }

        drawPlatform(ctx, platforms[0], t, false);
        drawPlatform(ctx, platforms[1], t, false);
        drawPlatform(ctx, drifter, t, true);
        for (const o of arena.obstacles || obstacles) if (o && alive(o)) drawObstacle(ctx, o, t);
        ctx.restore();
      } catch (e) { /* never break the game loop */ }
    },

    drawForeground(ctx, t) {
      try {
        ctx.save();
        // soft viewport vignette at the very edges only
        const g = ctx.createRadialGradient(W / 2, H / 2, 300, W / 2, H / 2, 620);
        g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,10,0.35)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        // faint glass glare streak in the top-left corner
        ctx.globalAlpha = 0.05 + 0.02 * Math.sin(t * 0.5);
        ctx.fillStyle = '#cfe0ff';
        ctx.beginPath(); ctx.moveTo(40, 90); ctx.lineTo(130, 90); ctx.lineTo(60, 230); ctx.lineTo(40, 230); ctx.closePath(); ctx.fill();
        ctx.restore();
      } catch (e) { /* ignore */ }
    },

    update(dt, fighters, game) {
      try {
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
