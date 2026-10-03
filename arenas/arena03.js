// Arena 03: Ice Cavern (Hang băng)
// Slippery ice floor (momentum carries, knockback slides further) and icicles
// that crack, shake, then fall from the ceiling. Stone ledges give normal grip.
(function () {
  const W = 960, H = 540, FLOOR = 474, CEIL = 92;
  const ICE_GRIP = 0.2;        // fraction of each frame's speed change that "takes" on ice
  const SNAP = 450;            // bigger instant changes (dashes, knockback) pass through untouched
  const WARN = 1.0;            // seconds an icicle shakes before falling
  const ICICLE_DMG = 9, HIT_CD = 1.4;
  const SPOTS = [110, 230, 350, 480, 610, 730, 850]; // symmetric around x = 480

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  // per-slot state kept here (contract: don't write extra fields on fighters)
  const lastV = [null, null];
  const hitCd = [0, 0];
  let icicles = [], shards = [], dropT = 3, nextTarget = 0;

  function makeIcicles() {
    icicles = SPOTS.map((x, i) => ({
      x, len: 34 + ((i * 37) % 3) * 8, w: 13 + (i % 2) * 3,
      state: 'hang', t: 0, y: 0, vy: 0, grow: 1,
    }));
  }
  makeIcicles();

  const arena = {
    id: 'arena03',
    name: 'Ice Cavern',
    nameVi: 'Hang băng',
    hint: 'Slippery ice, falling icicles',
    hintVi: 'Sàn trơn, nhũ băng rơi',
    floorY: FLOOR,
    gravityScale: 1,
    platforms: [
      { x: 140, y: 320, w: 180, h: 16 },
      { x: 640, y: 320, w: 180, h: 16 },
      { x: 400, y: 208, w: 160, h: 16 },
    ],
    // solid terrain: two crystal blocks by the walls, and a frozen pillar in the middle that can be smashed
    obstacles: [
      { x: 60, y: 404, w: 64, h: 70, kind: 'crystal' },
      { x: 836, y: 404, w: 64, h: 70, kind: 'crystal' },
      { x: 456, y: 352, w: 48, h: 122, kind: 'pillar', hp: 40 },
    ],

    reset() {
      makeIcicles();
      shards = [];
      dropT = 3 + rnd() * 1.5;
      nextTarget = rnd() < 0.5 ? 0 : 1;
      lastV[0] = lastV[1] = null;
      hitCd[0] = hitCd[1] = 0;
    },

    update(dt, fighters, game) {
      try {
        if (!(dt > 0)) return;
        const floorY = (game && game.floorY) || FLOOR;
        const live = !!(game && game.fighting);

        // ---- slippery floor ----
        for (const f of fighters || []) {
          if (!f) continue;
          const s = f.slot === 1 ? 1 : 0;
          hitCd[s] = Math.max(0, hitCd[s] - dt);
          const onIce = f.onGround && Math.abs(f.y - floorY) < 2;
          const prev = lastV[s];
          if (onIce && prev !== null && Math.abs(f.vx - prev) < SNAP) {
            const before = f.vx;
            const nv = prev + (f.vx - prev) * ICE_GRIP;
            f.vx = nv;
            // the engine already moved x this frame with the grippy speed; correct it
            const nx = clamp(f.x + (nv - before) * dt, 28, W - 28);
            // never slide into solid terrain; the engine resolves collisions before we run
            const blocked = arena.obstacles.some(o => alive(o) && nx + 16 > o.x && nx - 16 < o.x + o.w && f.y > o.y + 1 && f.y - 130 < o.y + o.h);
            if (blocked) f.vx = before; else f.x = nx;
            if (Math.abs(nv) > 160 && Math.abs(nv - before) > 60 && rnd() < 0.35 && game && game.particle) {
              game.particle({ x: f.x - Math.sign(nv) * 10, y: floorY - 2, vx: -nv * 0.15, vy: -40 - rnd() * 60, life: 0.35, col: '#cdefff', r: 2.5 });
            }
          }
          lastV[s] = f.vx;
        }

        // ---- icicles ----
        if (live) {
          dropT -= dt;
          if (dropT <= 0) {
            // alternate who gets targeted so it stays fair; pick the hanging spot nearest that fighter
            const tf = fighters && fighters[nextTarget];
            nextTarget = 1 - nextTarget;
            const tx = tf ? tf.x : 480;
            let best = null;
            for (const ic of icicles) if (ic.state === 'hang' && ic.grow >= 1 && (!best || Math.abs(ic.x - tx) < Math.abs(best.x - tx))) best = ic;
            if (best) { best.state = 'warn'; best.t = 0; }
            dropT = 3.2 + rnd() * 2.2;
          }
        }

        for (const ic of icicles) {
          if (ic.state === 'hang') {
            if (ic.grow < 1) ic.grow = Math.min(1, ic.grow + dt / 3.5);
          } else if (ic.state === 'warn') {
            ic.t += dt;
            if (game && game.particle && rnd() < 0.3) game.particle({ x: ic.x + (rnd() - 0.5) * 6, y: CEIL + ic.len, vx: 0, vy: 120, life: 0.5, col: '#9fdcff', r: 2 });
            if (ic.t >= WARN) { ic.state = 'fall'; ic.y = 0; ic.vy = 120; if (game && game.shake) game.shake(2); }
          } else if (ic.state === 'fall') {
            ic.vy += 2000 * dt;
            ic.y += ic.vy * dt;
            const tip = CEIL + ic.len + ic.y;
            // hits a fighter?
            for (const f of fighters || []) {
              if (!f || f.ko) continue;
              const s = f.slot === 1 ? 1 : 0;
              if (hitCd[s] > 0) continue;
              if (Math.abs(f.x - ic.x) < 24 && tip > f.y - 150 && tip - ic.len < f.y) {
                hitCd[s] = HIT_CD;
                if (game && game.hurt) game.hurt(f, { dmg: ICICLE_DMG, kb: 180, fromX: ic.x + (f.x === ic.x ? (f.facing || 1) * -1 : 0), stun: 0.35, word: 'CRACK!' });
                shatter(ic, tip, game);
                break;
              }
            }
            if (ic.state !== 'fall') continue;
            // lands on a ledge or the floor
            let stop = floorY;
            for (const p of arena.platforms) if (ic.x > p.x && ic.x < p.x + p.w && tip - ic.vy * dt <= p.y + 1 && p.y < stop) stop = p.y;
            for (const o of arena.obstacles) if (alive(o) && ic.x > o.x && ic.x < o.x + o.w && o.y < stop) stop = o.y;
            if (tip >= stop) shatter(ic, stop, game);
          } else if (ic.state === 'gone') {
            ic.t -= dt;
            if (ic.t <= 0) { ic.state = 'hang'; ic.grow = 0; ic.y = 0; }
          }
        }

        for (let i = shards.length - 1; i >= 0; i--) {
          const s = shards[i];
          s.life -= dt; s.vy += 1400 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += s.vr * dt;
          if (s.y > floorY) { s.y = floorY; s.vy *= -0.25; s.vx *= 0.7; }
          if (s.life <= 0) shards.splice(i, 1);
        }
      } catch (e) { /* never break the game loop */ }
    },

    drawBackground(ctx, t) {
      try {
        ctx.save();
        ctx.drawImage(getStatic(), 0, 0);
        // slow cold shimmer in the deep crystals
        for (let i = 0; i < 9; i++) {
          const x = 70 + i * 103, y = 150 + ((i * 53) % 90);
          const a = 0.05 + 0.05 * Math.sin(t * 0.8 + i * 1.7);
          const g = ctx.createRadialGradient(x, y, 0, x, y, 55);
          g.addColorStop(0, `rgba(120,210,255,${a})`); g.addColorStop(1, 'rgba(120,210,255,0)');
          ctx.fillStyle = g; ctx.fillRect(x - 55, y - 55, 110, 110);
        }
        // glints sliding across the ice floor
        for (let i = 0; i < 3; i++) {
          const gx = ((t * 60 + i * 340) % 1200) - 120;
          const g = ctx.createLinearGradient(gx - 60, 0, gx + 60, 0);
          g.addColorStop(0, 'rgba(200,240,255,0)'); g.addColorStop(0.5, 'rgba(200,240,255,0.10)'); g.addColorStop(1, 'rgba(200,240,255,0)');
          ctx.fillStyle = g;
          ctx.beginPath(); ctx.moveTo(gx - 40, FLOOR + 2); ctx.lineTo(gx + 60, FLOOR + 2); ctx.lineTo(gx + 10, H); ctx.lineTo(gx - 90, H); ctx.closePath(); ctx.fill();
        }
        // ledges
        for (const p of arena.platforms) drawLedge(ctx, p);
        for (const o of arena.obstacles) if (alive(o)) (o.kind === 'pillar' ? drawPillar : drawCrystal)(ctx, o, t);
        drawRubble(ctx);
        // icicles (hanging, shaking, falling)
        for (const ic of icicles) drawIcicle(ctx, ic, t);
        ctx.restore();
      } catch (e) { try { ctx.restore(); } catch (_) {} }
    },

    drawForeground(ctx, t) {
      try {
        ctx.save();
        for (const s of shards) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, s.life * 2));
          ctx.translate(s.x, s.y); ctx.rotate(s.rot);
          ctx.fillStyle = '#d6f3ff';
          ctx.beginPath(); ctx.moveTo(-s.r, 0); ctx.lineTo(0, -s.r * 0.6); ctx.lineTo(s.r, 0); ctx.lineTo(0, s.r * 0.6); ctx.closePath(); ctx.fill();
          ctx.restore();
        }
        ctx.restore();
        // drifting frost motes
        ctx.save();
        ctx.fillStyle = '#e4f6ff';
        for (let i = 0; i < 36; i++) {
          const sp = 14 + (i % 5) * 6;
          const x = (i * 131 + Math.sin(t * 0.6 + i) * 30 + t * 8) % W;
          const y = 90 + ((i * 71 + t * sp) % (H - 90));
          ctx.globalAlpha = 0.12 + 0.1 * ((i * 7) % 3) / 2;
          ctx.fillRect(x, y, 2, 2);
        }
        ctx.globalAlpha = 1;
        // cold vignette at the edges only
        const v = ctx.createRadialGradient(W / 2, H * 0.55, H * 0.45, W / 2, H * 0.55, W * 0.7);
        v.addColorStop(0, 'rgba(5,15,30,0)'); v.addColorStop(1, 'rgba(5,15,30,0.45)');
        ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
        ctx.restore();
      } catch (e) { try { ctx.restore(); } catch (_) {} }
    },
  };

  const START_HP = new WeakMap(arena.obstacles.filter(o => o.hp).map(o => [o, o.hp]));
  const alive = o => o.w > 0 && o.h > 0 && !(o.hp !== undefined && !(o.hp > 0));

  // pillar breaking: spray shards once when the engine drops its hp to 0
  const pillarWasAlive = new WeakMap();
  function drawRubble(ctx) {
    for (const o of arena.obstacles) {
      if (!START_HP.has(o)) continue;
      const a = alive(o);
      if (pillarWasAlive.get(o) && !a) {
        for (let i = 0; i < 12; i++) shards.push({ x: o.x + Math.random() * o.w, y: o.y + Math.random() * o.h, vx: (Math.random() - 0.5) * 420, vy: -100 - Math.random() * 320, r: 3 + Math.random() * 6, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20, life: 0.8 + Math.random() * 0.5 });
      }
      pillarWasAlive.set(o, a);
      if (!a) {
        // stump of broken ice left on the floor
        ctx.fillStyle = 'rgba(140,200,235,0.55)';
        ctx.beginPath(); ctx.moveTo(o.x - 4, o.y + o.h); ctx.lineTo(o.x + 8, o.y + o.h - 12); ctx.lineTo(o.x + 20, o.y + o.h - 6); ctx.lineTo(o.x + 32, o.y + o.h - 14); ctx.lineTo(o.x + o.w + 4, o.y + o.h); ctx.closePath(); ctx.fill();
      }
    }
  }

  function drawCrystal(ctx, o, t) {
    const { x, y, w, h } = o;
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#3f86b5'); g.addColorStop(0.5, '#6cb8e0'); g.addColorStop(1, '#2a5f86');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x, y + h); ctx.lineTo(x, y + 8); ctx.lineTo(x + 8, y); ctx.lineTo(x + w - 8, y); ctx.lineTo(x + w, y + 8); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(210,240,255,0.7)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = 'rgba(210,240,255,0.25)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + w * 0.3, y + 4); ctx.lineTo(x + w * 0.5, y + h * 0.55); ctx.lineTo(x + w * 0.75, y + h); ctx.moveTo(x + w * 0.5, y + h * 0.55); ctx.lineTo(x + 4, y + h * 0.8); ctx.stroke();
    const a = 0.25 + 0.15 * Math.sin(t * 1.3 + x);
    ctx.fillStyle = `rgba(225,248,255,${a})`;
    ctx.fillRect(x + 10, y + 6, 4, h * 0.4);
    ctx.fillStyle = '#cfeeff'; ctx.fillRect(x + 6, y - 2, w - 12, 3);
  }

  function drawPillar(ctx, o, t) {
    const { x, y, w, h } = o;
    const max = START_HP.get(o), dmg = max ? 1 - Math.max(0, o.hp) / max : 0;
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#2f6f9c'); g.addColorStop(0.4, '#7cc4ea'); g.addColorStop(1, '#245478');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 4, y + h); ctx.lineTo(x, y + 6); ctx.lineTo(x + w * 0.5, y - 4); ctx.lineTo(x + w, y + 6); ctx.lineTo(x + w + 4, y + h); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(215,242,255,0.75)'; ctx.lineWidth = 2; ctx.stroke();
    // frozen bands
    ctx.strokeStyle = 'rgba(215,242,255,0.3)'; ctx.lineWidth = 1.5;
    for (let k = 1; k < 4; k++) { const yy = y + (h * k) / 4; ctx.beginPath(); ctx.moveTo(x, yy); ctx.lineTo(x + w, yy - 4); ctx.stroke(); }
    // cracks grow as it takes damage
    if (dmg > 0.01) {
      ctx.strokeStyle = `rgba(255,255,255,${0.5 + 0.4 * dmg})`; ctx.lineWidth = 1.5;
      const n = 1 + Math.floor(dmg * 5);
      ctx.beginPath();
      for (let k = 0; k < n; k++) {
        const cx = x + w * (0.2 + ((k * 37) % 60) / 100), cy = y + h * (0.15 + ((k * 53) % 70) / 100);
        ctx.moveTo(cx, cy); ctx.lineTo(cx + 10, cy + 9); ctx.lineTo(cx + 4, cy + 20);
        ctx.moveTo(cx, cy); ctx.lineTo(cx - 9, cy + 7);
      }
      ctx.stroke();
    }
  }

  function shatter(ic, y, game) {
    ic.state = 'gone'; ic.t = 2.5;
    for (let i = 0; i < 10; i++) {
      shards.push({ x: ic.x + (rnd() - 0.5) * 10, y: y - 4, vx: (rnd() - 0.5) * 360, vy: -150 - rnd() * 260, r: 3 + rnd() * 4, rot: rnd() * 6, vr: (rnd() - 0.5) * 20, life: 0.6 + rnd() * 0.4 });
    }
    if (game && game.shake) game.shake(4);
  }

  function drawIcicle(ctx, ic, t) {
    if (ic.state === 'gone') return;
    let x = ic.x, y = CEIL, len = ic.len * (ic.state === 'hang' ? ic.grow : 1), w = ic.w * (ic.state === 'hang' ? 0.4 + 0.6 * ic.grow : 1);
    if (len < 3) return;
    if (ic.state === 'warn') x += Math.sin(t * 70) * 2.5 * (0.4 + ic.t / WARN);
    if (ic.state === 'fall') y += ic.y;
    // warning: pulsing ring on the ground/ledge below + target line
    if (ic.state === 'warn') {
      let gy = FLOOR;
      for (const p of arena.platforms) if (ic.x > p.x && ic.x < p.x + p.w && p.y < gy) gy = p.y;
      for (const o of arena.obstacles) if (alive(o) && ic.x > o.x && ic.x < o.x + o.w && o.y < gy) gy = o.y;
      const k = ic.t / WARN, pulse = 0.5 + 0.5 * Math.sin(t * 18);
      ctx.save();
      ctx.strokeStyle = `rgba(150,220,255,${0.35 + 0.4 * pulse})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.ellipse(ic.x, gy + 2, 14 + 14 * k, 4 + 3 * k, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([4, 8]);
      ctx.strokeStyle = `rgba(150,220,255,${0.12 + 0.12 * pulse})`;
      ctx.beginPath(); ctx.moveTo(ic.x, CEIL + ic.len + 6); ctx.lineTo(ic.x, gy - 4); ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    g.addColorStop(0, '#5fa9d6'); g.addColorStop(0.45, '#c9eeff'); g.addColorStop(1, '#4a8fbd');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y); ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x + w * 0.15, y + len * 0.7); ctx.lineTo(x, y + len); ctx.lineTo(x - w * 0.2, y + len * 0.65);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(230,248,255,0.55)'; ctx.lineWidth = 1.2; ctx.stroke();
    if (ic.state === 'warn') {
      // crack lines
      ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x - w / 2 + 1, y + 3); ctx.lineTo(x - 1, y + 6); ctx.lineTo(x + 3, y + 3); ctx.lineTo(x + w / 2 - 1, y + 7); ctx.stroke();
    }
  }

  function drawLedge(ctx, p) {
    const x = p.x, y = p.y, w = p.w, h = p.h || 16;
    ctx.fillStyle = '#2b3d55';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - 6, y + h); ctx.lineTo(x + w * 0.6, y + h + 8); ctx.lineTo(x + w * 0.3, y + h + 5); ctx.lineTo(x + 6, y + h);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(160,215,245,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    // frost cap
    ctx.fillStyle = '#9fd3ee';
    ctx.fillRect(x + 2, y - 2, w - 4, 4);
    ctx.fillStyle = 'rgba(220,245,255,0.6)';
    ctx.fillRect(x + 8, y - 2, w * 0.35, 1.5);
    // tiny icicles under the ledge (decor)
    ctx.fillStyle = 'rgba(150,210,240,0.7)';
    for (let i = 1; i < 6; i++) {
      const ix = x + (w * i) / 6, il = 6 + ((i * 7) % 3) * 4;
      ctx.beginPath(); ctx.moveTo(ix - 3, y + h - 2); ctx.lineTo(ix + 3, y + h - 2); ctx.lineTo(ix, y + h + il); ctx.closePath(); ctx.fill();
    }
  }

  // ---------- static layer, rendered once ----------
  let staticCv = null;
  function getStatic() {
    if (staticCv) return staticCv;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    let s = 99;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);

    // cave air
    const sky = g.createLinearGradient(0, 0, 0, FLOOR);
    sky.addColorStop(0, '#08131f'); sky.addColorStop(0.5, '#0d2236'); sky.addColorStop(1, '#13304a');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);

    // far crystal columns (dim, mirrored for symmetry)
    for (let i = 0; i < 7; i++) {
      const x = 40 + i * 70 + r() * 20, w = 26 + r() * 30, top = 140 + r() * 120;
      for (const xx of [x, W - x - w]) {
        const cg = g.createLinearGradient(xx, 0, xx + w, 0);
        cg.addColorStop(0, 'rgba(40,90,130,0.35)'); cg.addColorStop(0.5, 'rgba(70,140,185,0.28)'); cg.addColorStop(1, 'rgba(30,70,110,0.35)');
        g.fillStyle = cg;
        g.beginPath(); g.moveTo(xx, FLOOR); g.lineTo(xx, top + 20); g.lineTo(xx + w / 2, top); g.lineTo(xx + w, top + 20); g.lineTo(xx + w, FLOOR); g.closePath(); g.fill();
      }
    }

    // side rock walls
    for (const side of [0, 1]) {
      g.fillStyle = '#0a1622';
      g.beginPath();
      const x0 = side ? W : 0, d = side ? -1 : 1;
      g.moveTo(x0, 0);
      for (let y = 0; y <= FLOOR; y += 30) g.lineTo(x0 + d * (34 + r() * 26 + (y > 300 ? 10 : 0)), y);
      g.lineTo(x0, FLOOR); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(110,170,210,0.18)'; g.lineWidth = 2; g.stroke();
    }

    // ceiling rock with frost rim (sits under the HUD band)
    g.fillStyle = '#0b1724';
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, CEIL - 6);
    for (let x = W; x >= 0; x -= 24) g.lineTo(x, CEIL - 4 + (r() - 0.5) * 12);
    g.lineTo(0, CEIL - 6); g.closePath(); g.fill();
    g.fillStyle = 'rgba(150,210,240,0.45)';
    g.fillRect(0, CEIL - 2, W, 3);
    // small decorative stalactites between drop spots
    for (let x = 30; x < W; x += 34 + r() * 20) {
      if (SPOTS.some(sx => Math.abs(sx - x) < 22)) continue;
      const l = 8 + r() * 18;
      g.fillStyle = 'rgba(90,150,190,0.7)';
      g.beginPath(); g.moveTo(x - 4, CEIL); g.lineTo(x + 4, CEIL); g.lineTo(x, CEIL + l); g.closePath(); g.fill();
    }

    // frozen floor
    const fl = g.createLinearGradient(0, FLOOR, 0, H);
    fl.addColorStop(0, '#3d6f92'); fl.addColorStop(0.15, '#24496a'); fl.addColorStop(1, '#0f2335');
    g.fillStyle = fl; g.fillRect(0, FLOOR, W, H - FLOOR);
    g.fillStyle = 'rgba(200,240,255,0.55)'; g.fillRect(0, FLOOR, W, 2);
    // cracks and scratches in the ice
    g.strokeStyle = 'rgba(170,220,250,0.18)'; g.lineWidth = 1;
    for (let i = 0; i < 22; i++) {
      let x = r() * W, y = FLOOR + 8 + r() * (H - FLOOR - 12);
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 3; k++) { x += (r() - 0.5) * 60; y += (r() - 0.3) * 10; g.lineTo(x, Math.min(H - 2, Math.max(FLOOR + 4, y))); }
      g.stroke();
    }
    // faint mirrored reflection of the crystal glow
    g.fillStyle = 'rgba(120,200,240,0.06)';
    for (let i = 0; i < 8; i++) g.fillRect(60 + i * 115, FLOOR + 6, 40, 3);

    staticCv = c;
    return c;
  }

  (window.STICK_ARENAS = window.STICK_ARENAS || []).push(arena);
})();
