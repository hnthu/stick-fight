// Arena 03: Ice Cavern (Hang băng)
// Slippery ice floor (momentum carries, knockback slides further) and icicles
// that crack, shake, then fall from the ceiling. Stone ledges give normal grip.
// Drawing: a static layer is painted once (cave, ledges, crystal blocks); per frame we add
// light shafts, glows, drips, reflections, icicles and the breakable pillar. Draw code only
// reads `t` and arena state, so host and guest render the same thing online.
(function () {
  const W = 960, H = 540, FLOOR = 474, CEIL = 92;
  const ICE_GRIP = 0.2;        // fraction of each frame's speed change that "takes" on ice
  const SNAP = 450;            // bigger instant changes (dashes, knockback) pass through untouched
  const WARN = 1.0;            // seconds an icicle shakes before falling
  const ICICLE_DMG = 9, HIT_CD = 1.4;
  const SPOTS = [110, 230, 350, 480, 610, 730, 850]; // symmetric around x = 480
  const TAU = Math.PI * 2;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // gameplay randomness uses Math.random, which the engine seeds per step for online play
  const rnd = () => Math.random();

  // per-slot state kept here (contract: don't write extra fields on fighters)
  const lastV = [null, null];
  const hitCd = [0, 0];
  const seen = [null, null];   // last fighter x/y/colour, for reflections on the ice
  let icicles = [], shards = [], dropT = 3, nextTarget = 0, pillarUp = true;

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
      pillarUp = true;
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
          seen[s] = { x: f.x, y: f.y, ko: !!f.ko, col: typeof f.color === 'string' ? f.color : (s ? '#7cc6f0' : '#ff8a6e') };
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

        // pillar just broke: spray ice chunks (cosmetic, seeded so both screens match)
        const pil = arena.obstacles[2], up = alive(pil);
        if (pillarUp && !up) {
          for (let i = 0; i < 14; i++) shards.push({ x: pil.x + rnd() * pil.w, y: pil.y + rnd() * pil.h, vx: (rnd() - 0.5) * 420, vy: -100 - rnd() * 320, r: 3 + rnd() * 6, rot: rnd() * 6, vr: (rnd() - 0.5) * 20, life: 0.8 + rnd() * 0.5 });
        }
        pillarUp = up;

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
        drawShafts(ctx, t);
        drawGlows(ctx, t);
        drawFloorLife(ctx, t);
        drawDrips(ctx, t);
        const pil = arena.obstacles[2];
        if (alive(pil)) drawPillar(ctx, pil, t); else drawRubble(ctx, pil);
        for (const ic of icicles) drawIcicle(ctx, ic, t);
        ctx.restore();
      } catch (e) { try { ctx.restore(); } catch (_) {} }
    },

    drawForeground(ctx, t) {
      try {
        ctx.save();
        // ice chunks from icicles and the pillar
        for (const s of shards) {
          ctx.save();
          ctx.globalAlpha = Math.max(0, Math.min(1, s.life * 2));
          ctx.translate(s.x, s.y); ctx.rotate(s.rot);
          ctx.fillStyle = '#bfe6fa';
          ctx.beginPath(); ctx.moveTo(-s.r, 0); ctx.lineTo(-s.r * 0.2, -s.r * 0.65); ctx.lineTo(s.r, -s.r * 0.1); ctx.lineTo(s.r * 0.1, s.r * 0.6); ctx.closePath(); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.75)';
          ctx.fillRect(-s.r * 0.5, -s.r * 0.3, s.r * 0.5, 1.2);
          ctx.restore();
        }
        // low mist rolling over the ice
        for (let i = 0; i < 3; i++) {
          const mx = ((t * (9 + i * 4) + i * 380) % 1400) - 220, my = FLOOR - 6 + i * 4;
          const g = ctx.createRadialGradient(mx, my, 0, mx, my, 220);
          g.addColorStop(0, 'rgba(170,215,240,0.07)'); g.addColorStop(1, 'rgba(170,215,240,0)');
          ctx.fillStyle = g;
          ctx.save(); ctx.translate(mx, my); ctx.scale(1, 0.18); ctx.translate(-mx, -my);
          ctx.fillRect(mx - 220, my - 220, 440, 440);
          ctx.restore();
        }
        // snowflakes: far (small, slow) and near (bigger, faster, sway more)
        for (let i = 0; i < 48; i++) {
          const near = i % 4 === 0;
          const sp = near ? 34 + (i % 3) * 6 : 12 + (i % 5) * 4;
          const x = ((i * 131.7 + t * (near ? 14 : 6)) % (W + 40)) - 20 + Math.sin(t * (near ? 1.1 : 0.6) + i) * (near ? 18 : 8);
          const y = 92 + ((i * 71.3 + t * sp) % (H - 92));
          ctx.globalAlpha = near ? 0.32 : 0.14 + 0.08 * ((i * 7) % 3) / 2;
          ctx.fillStyle = '#e8f7ff';
          if (near) { ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill(); }
          else ctx.fillRect(x, y, 1.6, 1.6);
        }
        ctx.globalAlpha = 1;
        ctx.drawImage(getFrost(), 0, 0);
        ctx.restore();
      } catch (e) { try { ctx.restore(); } catch (_) {} }
    },
  };

  const alive = o => o.w > 0 && o.h > 0 && !(o.hp !== undefined && !(o.hp > 0));
  const START_HP = new WeakMap(arena.obstacles.filter(o => o.hp).map(o => [o, o.hp]));

  function shatter(ic, y, game) {
    ic.state = 'gone'; ic.t = 2.5;
    for (let i = 0; i < 10; i++) {
      shards.push({ x: ic.x + (rnd() - 0.5) * 10, y: y - 4, vx: (rnd() - 0.5) * 360, vy: -150 - rnd() * 260, r: 3 + rnd() * 4, rot: rnd() * 6, vr: (rnd() - 0.5) * 20, life: 0.6 + rnd() * 0.4 });
    }
    if (game && game.shake) game.shake(4);
  }

  // small deterministic hash for draw-time variety (never Math.random in draw code)
  const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };

  // ---------- per-frame layers ----------
  const SHAFTS = [{ x: 300, w: 120, k: 0 }, { x: 660, w: 120, k: 2.1 }, { x: 480, w: 70, k: 4.2 }];
  function drawShafts(ctx, t) {
    const sh = getShaft();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of SHAFTS) {
      ctx.globalAlpha = 0.55 + 0.25 * Math.sin(t * 0.45 + s.k) + 0.08 * Math.sin(t * 1.7 + s.k * 3);
      const sway = Math.sin(t * 0.2 + s.k) * 6;
      ctx.drawImage(sh, s.x - s.w / 2 + sway, CEIL - 6, s.w, FLOOR - CEIL + 6);
    }
    ctx.restore();
  }

  const GLOWS = [];
  for (let i = 0; i < 6; i++) { const x = 70 + i * 74, y = 160 + ((i * 53) % 90); GLOWS.push({ x, y, k: i * 1.7 }, { x: W - x, y, k: i * 1.7 + 0.9 }); }
  function drawGlows(ctx, t) {
    for (const gl of GLOWS) {
      const a = 0.045 + 0.04 * Math.sin(t * 0.8 + gl.k);
      const g = ctx.createRadialGradient(gl.x, gl.y, 0, gl.x, gl.y, 60);
      g.addColorStop(0, `rgba(110,205,255,${a})`); g.addColorStop(1, 'rgba(110,205,255,0)');
      ctx.fillStyle = g; ctx.fillRect(gl.x - 60, gl.y - 60, 120, 120);
    }
  }

  function drawFloorLife(ctx, t) {
    // glints sliding across the ice
    for (let i = 0; i < 3; i++) {
      const gx = ((t * 60 + i * 340) % 1200) - 120;
      const g = ctx.createLinearGradient(gx - 60, 0, gx + 60, 0);
      g.addColorStop(0, 'rgba(200,240,255,0)'); g.addColorStop(0.5, 'rgba(200,240,255,0.09)'); g.addColorStop(1, 'rgba(200,240,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(gx - 40, FLOOR + 3); ctx.lineTo(gx + 60, FLOOR + 3); ctx.lineTo(gx + 10, H); ctx.lineTo(gx - 90, H); ctx.closePath(); ctx.fill();
    }
    // twinkles on the floor's frost line
    for (let i = 0; i < 14; i++) {
      const x = 20 + hash(i) * 920, ph = (t * 0.6 + hash(i + 40)) % 1;
      if (ph > 0.12) continue;
      const a = Math.sin((ph / 0.12) * Math.PI), r = 1 + 3 * a;
      ctx.strokeStyle = `rgba(235,250,255,${0.7 * a})`; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x - r, FLOOR + 1); ctx.lineTo(x + r, FLOOR + 1); ctx.moveTo(x, FLOOR + 1 - r); ctx.lineTo(x, FLOOR + 1 + r); ctx.stroke();
    }
    // fighters reflected in the ice, plus a soft contact shadow
    for (const f of seen) {
      if (!f) continue;
      const h = FLOOR - f.y;
      if (h < -2 || h > 220) continue;
      const k = 1 - h / 220;
      ctx.save();
      ctx.globalAlpha = 0.22 * k;
      const g = ctx.createLinearGradient(0, FLOOR + 2 + h * 0.6, 0, FLOOR + 2 + h * 0.6 + 58);
      g.addColorStop(0, f.col); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      const rw = f.ko ? 46 : 18;
      ctx.fillRect(f.x - rw / 2, FLOOR + 2 + h * 0.6, rw, 58);
      ctx.globalAlpha = 0.35 * k;
      ctx.fillStyle = '#04101c';
      ctx.beginPath(); ctx.ellipse(f.x, FLOOR + 2, 24 * (0.6 + 0.4 * k), 4, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  // drips from the small stalactites; position comes from t, so it is the same on every screen
  const DRIPS = [];
  for (let i = 0; i < 7; i++) {
    const x = 60 + hash(i + 7) * 840;
    if (SPOTS.some(s => Math.abs(s - x) < 26)) continue;
    DRIPS.push({ x, period: 3.5 + hash(i + 3) * 3, off: hash(i + 11) * 5 });
  }
  function drawDrips(ctx, t) {
    for (const d of DRIPS) {
      const ph = ((t + d.off) % d.period) / d.period;
      let stop = FLOOR;
      for (const p of arena.platforms) if (d.x > p.x && d.x < p.x + p.w && p.y < stop) stop = p.y;
      const top = CEIL + 10;
      if (ph < 0.55) {
        // drop swelling on the tip
        const r = 0.6 + 2 * (ph / 0.55);
        ctx.fillStyle = 'rgba(190,232,255,0.65)';
        ctx.beginPath(); ctx.arc(d.x, top + r, r, 0, TAU); ctx.fill();
      } else {
        const ft = (ph - 0.55) * d.period, y = top + 2 + 0.5 * 1500 * ft * ft;
        if (y < stop) {
          ctx.strokeStyle = 'rgba(200,236,255,0.55)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(d.x, y - 7); ctx.lineTo(d.x, y); ctx.stroke();
        } else {
          // splash ring where it lands
          const st = ft - Math.sqrt(2 * (stop - top - 2) / 1500);
          if (st < 0.35) {
            const a = 1 - st / 0.35;
            ctx.strokeStyle = `rgba(200,236,255,${0.5 * a})`; ctx.lineWidth = 1.2;
            ctx.beginPath(); ctx.ellipse(d.x, stop + 1, 3 + st * 40, 1 + st * 6, 0, 0, TAU); ctx.stroke();
          }
        }
      }
    }
  }

  function icePath(ctx, x, y, w, len, wob) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.lineTo(x + w / 2, y);
    ctx.quadraticCurveTo(x + w * 0.42, y + len * 0.25, x + w * 0.22 + wob, y + len * 0.5);
    ctx.quadraticCurveTo(x + w * 0.12, y + len * 0.8, x, y + len);
    ctx.quadraticCurveTo(x - w * 0.16, y + len * 0.75, x - w * 0.26 + wob, y + len * 0.45);
    ctx.quadraticCurveTo(x - w * 0.45, y + len * 0.2, x - w / 2, y);
    ctx.closePath();
  }

  function drawIcicle(ctx, ic, t) {
    if (ic.state === 'gone') return;
    const grow = ic.state === 'hang' ? ic.grow : 1;
    let x = ic.x, y = CEIL - 2;
    const len = ic.len * grow, w = ic.w * (0.4 + 0.6 * grow);
    if (len < 3) return;
    const k = ic.state === 'warn' ? ic.t / WARN : 0;
    if (ic.state === 'warn') x += Math.sin(t * 70) * 2.5 * (0.4 + k);
    if (ic.state === 'fall') y += ic.y;

    if (ic.state === 'warn') {
      // where it will land: a ring that tightens, a darkening spot and a faint guide line
      let gy = FLOOR;
      for (const p of arena.platforms) if (ic.x > p.x && ic.x < p.x + p.w && p.y < gy) gy = p.y;
      for (const o of arena.obstacles) if (alive(o) && ic.x > o.x && ic.x < o.x + o.w && o.y < gy) gy = o.y;
      const pulse = 0.5 + 0.5 * Math.sin(t * 18);
      ctx.save();
      ctx.fillStyle = `rgba(3,12,22,${0.18 + 0.3 * k})`;
      ctx.beginPath(); ctx.ellipse(ic.x, gy + 2, 10 + 10 * k, 3 + 1.5 * k, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(150,220,255,${0.35 + 0.45 * pulse})`;
      ctx.lineWidth = 2.5;
      const rr = 34 - 16 * k;
      ctx.beginPath(); ctx.ellipse(ic.x, gy + 2, rr, rr * 0.22 + 2, 0, 0, TAU); ctx.stroke();
      ctx.lineWidth = 1.5;
      for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(ic.x + sx * (rr + 4), gy + 2); ctx.lineTo(ic.x + sx * (rr + 11), gy + 2); ctx.stroke(); }
      ctx.setLineDash([3, 9]);
      ctx.lineDashOffset = -t * 40;
      ctx.strokeStyle = `rgba(150,220,255,${0.1 + 0.12 * pulse})`;
      ctx.beginPath(); ctx.moveTo(ic.x, CEIL + ic.len + 6); ctx.lineTo(ic.x, gy - 4); ctx.stroke();
      ctx.setLineDash([]); ctx.lineDashOffset = 0;
      ctx.restore();
    }
    if (ic.state === 'fall') {
      // speed streak above a falling icicle
      const sl = Math.min(90, ic.vy * 0.06);
      const g = ctx.createLinearGradient(0, y - sl, 0, y + len * 0.5);
      g.addColorStop(0, 'rgba(180,225,250,0)'); g.addColorStop(1, 'rgba(180,225,250,0.35)');
      ctx.fillStyle = g;
      ctx.fillRect(x - w * 0.35, y - sl, w * 0.7, sl + len * 0.5);
    }
    const wob = (ic.x % 7) * 0.3 - 1;
    const g = ctx.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
    g.addColorStop(0, '#4f97c6'); g.addColorStop(0.35, '#bfe9fd'); g.addColorStop(0.6, '#8ccbec'); g.addColorStop(1, '#3a7aa8');
    ctx.fillStyle = g;
    icePath(ctx, x, y, w, len, wob); ctx.fill();
    ctx.strokeStyle = 'rgba(225,246,255,0.55)'; ctx.lineWidth = 1; ctx.stroke();
    // bright core and growth rings
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.moveTo(x - w * 0.18, y + 3); ctx.quadraticCurveTo(x - w * 0.12, y + len * 0.45, x - 1, y + len * 0.8); ctx.stroke();
    ctx.strokeStyle = 'rgba(30,80,120,0.35)'; ctx.lineWidth = 1;
    for (let r = 1; r <= 2; r++) {
      const ry = y + len * r * 0.22, rw = w * (0.5 - r * 0.12);
      ctx.beginPath(); ctx.moveTo(x - rw, ry); ctx.quadraticCurveTo(x, ry + 2, x + rw, ry - 1); ctx.stroke();
    }
    // a glinting bead of water on the tip
    if (ic.state === 'hang' && grow >= 1) {
      const b = 0.5 + 0.5 * Math.sin(t * 2 + ic.x);
      ctx.fillStyle = `rgba(215,244,255,${0.5 + 0.4 * b})`;
      ctx.beginPath(); ctx.arc(x, y + len + 1.5, 1.6, 0, TAU); ctx.fill();
    }
    if (ic.state === 'warn') {
      // cracks spread from the root as the warning runs out
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - w / 2 + 1, y + 3); ctx.lineTo(x - 1, y + 6); ctx.lineTo(x + 3, y + 3); ctx.lineTo(x + w / 2 - 1, y + 7);
      if (k > 0.35) { ctx.moveTo(x - 1, y + 6); ctx.lineTo(x - 3, y + 12); ctx.lineTo(x + 1, y + 16); }
      if (k > 0.7) { ctx.moveTo(x + 3, y + 3); ctx.lineTo(x + 4, y + 11); ctx.moveTo(x - w / 2 + 2, y + 9); ctx.lineTo(x - 2, y + 10); }
      ctx.stroke();
      // frost puffing out of the crack
      ctx.fillStyle = `rgba(220,245,255,${0.25 * k})`;
      ctx.beginPath(); ctx.ellipse(x, y + 2, w * (0.6 + k * 0.5), 4, 0, 0, TAU); ctx.fill();
    }
  }

  // bubbles frozen in the pillar (fixed positions)
  const BUBBLES = [];
  for (let i = 0; i < 11; i++) BUBBLES.push({ u: 0.18 + hash(i + 70) * 0.64, v: 0.1 + hash(i + 90) * 0.82, r: 1 + hash(i + 110) * 2.6 });
  // crack segments, revealed one by one as the pillar loses hp
  const CRACKS = [
    [[0.5, 0.05], [0.42, 0.18], [0.55, 0.3], [0.46, 0.4]],
    [[0.08, 0.55], [0.3, 0.6], [0.4, 0.72], [0.62, 0.7]],
    [[0.9, 0.25], [0.7, 0.35], [0.75, 0.48], [0.6, 0.55]],
    [[0.2, 0.2], [0.32, 0.3], [0.28, 0.42]],
    [[0.85, 0.8], [0.66, 0.86], [0.55, 0.96]],
    [[0.46, 0.4], [0.5, 0.52], [0.4, 0.6]],
  ];
  function drawPillar(ctx, o, t) {
    const { x, y, w, h } = o;
    const max = START_HP.get(o), dmg = max ? 1 - Math.max(0, o.hp) / max : 0;
    ctx.save();
    // cold glow behind it
    const gl = ctx.createRadialGradient(x + w / 2, y + h * 0.5, 4, x + w / 2, y + h * 0.5, 70);
    gl.addColorStop(0, `rgba(120,200,245,${0.12 + 0.04 * Math.sin(t * 1.2)})`); gl.addColorStop(1, 'rgba(120,200,245,0)');
    ctx.fillStyle = gl; ctx.fillRect(x - 50, y - 20, w + 100, h + 30);
    // body
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#26618c'); g.addColorStop(0.28, '#6fb8e2'); g.addColorStop(0.45, '#a8dcf6'); g.addColorStop(0.7, '#5aa2cf'); g.addColorStop(1, '#1f4f74');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - 6, y + h); ctx.quadraticCurveTo(x - 1, y + h - 14, x, y + h - 26);
    ctx.lineTo(x + 1, y + 10); ctx.lineTo(x + w * 0.3, y + 1); ctx.lineTo(x + w * 0.55, y - 5); ctx.lineTo(x + w * 0.8, y + 2); ctx.lineTo(x + w - 1, y + 10);
    ctx.lineTo(x + w, y + h - 26); ctx.quadraticCurveTo(x + w + 1, y + h - 14, x + w + 6, y + h);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(215,242,255,0.75)'; ctx.lineWidth = 1.6; ctx.stroke();
    // facet edge and refraction stripe
    ctx.strokeStyle = 'rgba(230,248,255,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + w * 0.55, y - 3); ctx.lineTo(x + w * 0.6, y + h); ctx.stroke();
    ctx.fillStyle = 'rgba(240,252,255,0.22)';
    ctx.fillRect(x + w * 0.3, y + 8, 3, h - 30);
    // frozen bubbles
    for (const b of BUBBLES) {
      ctx.strokeStyle = 'rgba(225,247,255,0.5)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.arc(x + b.u * w, y + b.v * h, b.r, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(x + b.u * w - b.r * 0.5, y + b.v * h - b.r * 0.5, 1, 1);
    }
    // frost bands
    ctx.strokeStyle = 'rgba(205,238,255,0.25)'; ctx.lineWidth = 1.5;
    for (let k = 1; k < 4; k++) { const yy = y + (h * k) / 4; ctx.beginPath(); ctx.moveTo(x + 1, yy + 2); ctx.quadraticCurveTo(x + w / 2, yy - 3, x + w - 1, yy - 2); ctx.stroke(); }
    // snow cap
    ctx.fillStyle = '#d9f1fc';
    ctx.beginPath(); ctx.moveTo(x + 2, y + 9); ctx.quadraticCurveTo(x + w * 0.3, y - 3, x + w * 0.55, y - 6); ctx.quadraticCurveTo(x + w * 0.8, y - 2, x + w - 2, y + 9); ctx.quadraticCurveTo(x + w * 0.5, y + 4, x + 2, y + 9); ctx.fill();
    // cracks: one more segment per ~1/6 of hp lost
    const n = Math.min(CRACKS.length, Math.ceil(dmg * CRACKS.length - 0.01));
    if (n > 0) {
      ctx.strokeStyle = `rgba(255,255,255,${0.55 + 0.4 * dmg})`; ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < n; i++) CRACKS[i].forEach(([u, v], j) => (j ? ctx.lineTo(x + u * w, y + v * h) : ctx.moveTo(x + u * w, y + v * h)));
      ctx.stroke();
      ctx.strokeStyle = 'rgba(20,60,95,0.5)'; ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let i = 0; i < n; i++) CRACKS[i].forEach(([u, v], j) => (j ? ctx.lineTo(x + u * w + 1, y + v * h + 1) : ctx.moveTo(x + u * w + 1, y + v * h + 1)));
      ctx.stroke();
    }
    // white flash when it is hit (engine sets o._hitT)
    if (o._hitT > 0) {
      ctx.globalAlpha = Math.min(1, o._hitT / 0.15) * 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  function drawRubble(ctx, o) {
    const cx = o.x + o.w / 2, fy = o.y + o.h;
    ctx.save();
    ctx.fillStyle = 'rgba(4,14,24,0.35)';
    ctx.beginPath(); ctx.ellipse(cx, fy + 2, 40, 4, 0, 0, TAU); ctx.fill();
    const chunks = [[-26, 8, 11], [-12, 14, 15], [4, 18, 13], [18, 10, 12], [28, 6, 8], [-2, 9, 7]];
    for (const [dx, hh, ww] of chunks) {
      const g = ctx.createLinearGradient(cx + dx - ww / 2, 0, cx + dx + ww / 2, 0);
      g.addColorStop(0, '#3f86b5'); g.addColorStop(0.5, '#9fd5f2'); g.addColorStop(1, '#2d6993');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(cx + dx - ww / 2, fy); ctx.lineTo(cx + dx - ww * 0.2, fy - hh); ctx.lineTo(cx + dx + ww * 0.35, fy - hh * 0.8); ctx.lineTo(cx + dx + ww / 2, fy); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(220,245,255,0.5)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.fillStyle = 'rgba(220,244,255,0.45)';
    for (let i = 0; i < 9; i++) ctx.fillRect(cx - 40 + hash(i + 200) * 80, fy - 2 - hash(i + 220) * 3, 2, 2);
    ctx.restore();
  }

  // ---------- pre-rendered layers ----------
  let shaftCv = null;
  function getShaft() {
    if (shaftCv) return shaftCv;
    const c = document.createElement('canvas'); c.width = 64; c.height = 256;
    const g = c.getContext('2d');
    for (let y = 0; y < 256; y++) {
      const v = y / 256, a = 0.12 * (1 - v) * (1 - v) + 0.015;
      const spread = 0.35 + 0.65 * v;
      const lg = g.createLinearGradient(32 - 32 * spread, 0, 32 + 32 * spread, 0);
      lg.addColorStop(0, 'rgba(120,200,250,0)'); lg.addColorStop(0.5, `rgba(150,215,250,${a})`); lg.addColorStop(1, 'rgba(120,200,250,0)');
      g.fillStyle = lg; g.fillRect(0, y, 64, 1);
    }
    return (shaftCv = c);
  }

  let frostCv = null;
  function getFrost() {
    if (frostCv) return frostCv;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    // cold vignette, strongest in the corners
    const v = g.createRadialGradient(W / 2, H * 0.55, H * 0.45, W / 2, H * 0.55, W * 0.7);
    v.addColorStop(0, 'rgba(5,15,30,0)'); v.addColorStop(1, 'rgba(5,15,30,0.45)');
    g.fillStyle = v; g.fillRect(0, 0, W, H);
    // feathery frost creeping in from the bottom corners (well outside the play area)
    let s = 4242;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const fern = (x, y, ang, len, depth) => {
      if (depth <= 0 || len < 3) return;
      const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x2, y2); g.stroke();
      for (let i = 1; i <= 3; i++) {
        const px = x + (x2 - x) * i / 4, py = y + (y2 - y) * i / 4;
        fern(px, py, ang - 0.9 + (r() - 0.5) * 0.3, len * 0.38, depth - 1);
        fern(px, py, ang + 0.9 + (r() - 0.5) * 0.3, len * 0.38, depth - 1);
      }
      fern(x2, y2, ang + (r() - 0.5) * 0.4, len * 0.6, depth - 1);
    };
    g.lineCap = 'round';
    g.strokeStyle = 'rgba(210,240,255,0.16)'; g.lineWidth = 1;
    for (const [cx, cy, a0] of [[0, H, -0.5], [W, H, Math.PI + 0.5]]) {
      for (let i = 0; i < 4; i++) fern(cx, cy, a0 + (cx ? 1 : -1) * (i * 0.35 - 0.1), 34 + r() * 22, 3);
    }
    return (frostCv = c);
  }

  let staticCv = null;
  function getStatic() {
    if (staticCv) return staticCv;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');
    let s = 99;
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);

    // cave air: dark above, a cold blue haze toward the floor
    const sky = g.createLinearGradient(0, 0, 0, FLOOR);
    sky.addColorStop(0, '#07111c'); sky.addColorStop(0.45, '#0c2033'); sky.addColorStop(1, '#14324c');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    const haze = g.createRadialGradient(W / 2, FLOOR - 60, 30, W / 2, FLOOR - 60, 520);
    haze.addColorStop(0, 'rgba(70,140,190,0.18)'); haze.addColorStop(1, 'rgba(70,140,190,0)');
    g.fillStyle = haze; g.fillRect(0, 0, W, H);

    // rock strata on the back wall
    for (let i = 0; i < 6; i++) {
      const by = 120 + i * 52 + r() * 10;
      g.fillStyle = `rgba(4,12,22,${0.12 + r() * 0.1})`;
      g.beginPath(); g.moveTo(0, by);
      for (let x = 0; x <= W; x += 40) g.lineTo(x, by + Math.sin(x * 0.01 + i) * 8 + (r() - 0.5) * 4);
      g.lineTo(W, by + 14); for (let x = W; x >= 0; x -= 40) g.lineTo(x, by + 14 + Math.sin(x * 0.012 + i * 2) * 6);
      g.closePath(); g.fill();
    }

    // far crystal columns, faceted (mirrored for symmetry)
    const column = (xx, w, top, shade) => {
      const mid = xx + w * 0.45;
      g.fillStyle = `rgba(28,70,105,${0.5 * shade})`;
      g.beginPath(); g.moveTo(xx, FLOOR); g.lineTo(xx, top + 18); g.lineTo(mid, top); g.lineTo(mid, FLOOR); g.closePath(); g.fill();
      g.fillStyle = `rgba(60,125,170,${0.42 * shade})`;
      g.beginPath(); g.moveTo(mid, FLOOR); g.lineTo(mid, top); g.lineTo(xx + w, top + 18); g.lineTo(xx + w, FLOOR); g.closePath(); g.fill();
      g.strokeStyle = `rgba(150,215,250,${0.22 * shade})`; g.lineWidth = 1;
      g.beginPath(); g.moveTo(mid, top + 1); g.lineTo(mid, FLOOR); g.moveTo(xx, top + 18); g.lineTo(mid, top); g.lineTo(xx + w, top + 18); g.stroke();
    };
    for (let i = 0; i < 7; i++) {
      const x = 40 + i * 70 + r() * 20, w = 26 + r() * 30, top = 140 + r() * 120;
      column(x, w, top, 0.65);
      column(W - x - w, w, top, 0.65);
    }
    // nearer short crystal clusters, low on the wall
    for (let i = 0; i < 5; i++) {
      const x = 150 + i * 45 + r() * 10, w = 14 + r() * 10, top = FLOOR - 50 - r() * 50;
      column(x, w, top, 1.2);
      column(W - x - w, w, top, 1.2);
    }

    // side rock walls with frost patches and small crystals growing out of them
    for (const side of [0, 1]) {
      const x0 = side ? W : 0, d = side ? -1 : 1;
      let s2 = 777;
      const r2 = () => ((s2 = (s2 * 16807) % 2147483647) / 2147483647); // same shape on both sides
      const pts = [];
      for (let y = 0; y <= FLOOR; y += 30) pts.push([x0 + d * (34 + r2() * 26 + (y > 300 ? 10 : 0)), y]);
      g.fillStyle = '#081420';
      g.beginPath(); g.moveTo(x0, 0); for (const [px, py] of pts) g.lineTo(px, py); g.lineTo(x0, FLOOR); g.closePath(); g.fill();
      g.fillStyle = '#0c1c2c';
      g.beginPath(); g.moveTo(x0, 0); for (const [px, py] of pts) g.lineTo(x0 + (px - x0) * 0.6, py); g.lineTo(x0, FLOOR); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(120,185,225,0.28)'; g.lineWidth = 2;
      g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
      for (let i = 0; i < 4; i++) {
        const [px, py] = pts[3 + i * 3];
        g.fillStyle = 'rgba(110,185,230,0.55)';
        g.beginPath(); g.moveTo(px, py); g.lineTo(px + d * 14, py - 9); g.lineTo(px + d * 2, py - 4); g.closePath(); g.fill();
        g.beginPath(); g.moveTo(px, py + 4); g.lineTo(px + d * 10, py + 8); g.lineTo(px + d * 1, py + 8); g.closePath(); g.fill();
      }
    }

    // ceiling rock with frost rim (tucked under the HUD band)
    const ce = g.createLinearGradient(0, 0, 0, CEIL);
    ce.addColorStop(0, '#050d16'); ce.addColorStop(1, '#0e2133');
    g.fillStyle = ce;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, CEIL - 6);
    for (let x = W; x >= 0; x -= 24) g.lineTo(x, CEIL - 4 + (r() - 0.5) * 10);
    g.lineTo(0, CEIL - 6); g.closePath(); g.fill();
    const rim = g.createLinearGradient(0, CEIL - 4, 0, CEIL + 3);
    rim.addColorStop(0, 'rgba(170,225,250,0.0)'); rim.addColorStop(0.6, 'rgba(170,225,250,0.55)'); rim.addColorStop(1, 'rgba(170,225,250,0.1)');
    g.fillStyle = rim; g.fillRect(0, CEIL - 4, W, 7);
    // ceiling cracks the light shafts come through
    for (const sx of [300, 660, 480]) {
      const gl = g.createRadialGradient(sx, CEIL - 4, 0, sx, CEIL - 4, 26);
      gl.addColorStop(0, 'rgba(170,225,255,0.45)'); gl.addColorStop(1, 'rgba(170,225,255,0)');
      g.fillStyle = gl; g.fillRect(sx - 26, CEIL - 30, 52, 40);
    }
    // small decorative stalactites between the drop spots
    for (let x = 30; x < W; x += 34 + r() * 20) {
      if (SPOTS.some(sx => Math.abs(sx - x) < 22)) continue;
      const l = 8 + r() * 18;
      const sg = g.createLinearGradient(x - 4, 0, x + 4, 0);
      sg.addColorStop(0, 'rgba(70,130,175,0.8)'); sg.addColorStop(0.4, 'rgba(160,215,245,0.8)'); sg.addColorStop(1, 'rgba(60,115,160,0.8)');
      g.fillStyle = sg;
      g.beginPath(); g.moveTo(x - 4, CEIL); g.lineTo(x + 4, CEIL); g.lineTo(x, CEIL + l); g.closePath(); g.fill();
    }

    // frozen floor: bright frost line, then deep clear ice
    const fl = g.createLinearGradient(0, FLOOR, 0, H);
    fl.addColorStop(0, '#3f7398'); fl.addColorStop(0.12, '#25496a'); fl.addColorStop(0.6, '#163450'); fl.addColorStop(1, '#0c1d2e');
    g.fillStyle = fl; g.fillRect(0, FLOOR, W, H - FLOOR);
    g.fillStyle = 'rgba(205,240,255,0.6)'; g.fillRect(0, FLOOR, W, 2);
    g.fillStyle = 'rgba(205,240,255,0.15)'; g.fillRect(0, FLOOR + 2, W, 2);
    // the cave reflected upside down in the ice (soft, dim)
    g.save();
    g.globalAlpha = 0.1;
    g.translate(0, FLOOR * 2 + 4); g.scale(1, -1);
    g.drawImage(c, 0, FLOOR - (H - FLOOR) - 4, W, H - FLOOR, 0, FLOOR - (H - FLOOR) - 4, W, H - FLOOR);
    g.restore();
    // frozen bubbles deep in the ice
    for (let i = 0; i < 40; i++) {
      const bx = r() * W, by = FLOOR + 14 + r() * (H - FLOOR - 18), br = 0.8 + r() * 2.2;
      g.strokeStyle = `rgba(190,232,255,${0.12 + r() * 0.15})`; g.lineWidth = 0.8;
      g.beginPath(); g.arc(bx, by, br, 0, TAU); g.stroke();
    }
    // branching cracks and skate scratches
    g.strokeStyle = 'rgba(170,220,250,0.2)'; g.lineWidth = 1;
    for (let i = 0; i < 22; i++) {
      let x = r() * W, y = FLOOR + 8 + r() * (H - FLOOR - 12);
      g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 3; k++) {
        const nx = x + (r() - 0.5) * 60, ny = Math.min(H - 2, Math.max(FLOOR + 4, y + (r() - 0.3) * 10));
        g.lineTo(nx, ny);
        if (r() < 0.4) { g.moveTo(nx, ny); g.lineTo(nx + (r() - 0.5) * 20, ny + r() * 6); g.moveTo(nx, ny); }
        x = nx; y = ny;
      }
      g.stroke();
    }
    g.strokeStyle = 'rgba(220,245,255,0.08)';
    for (let i = 0; i < 10; i++) {
      const x = 80 + r() * 800, y = FLOOR + 6 + r() * 20, l = 40 + r() * 80;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + l / 2, y + 3 * (r() - 0.5), x + l, y + 2); g.stroke();
    }
    // snow drifts banked against the walls
    for (const side of [0, 1]) {
      const x0 = side ? W : 0, d = side ? -1 : 1;
      const sg = g.createLinearGradient(0, FLOOR - 26, 0, FLOOR + 4);
      sg.addColorStop(0, '#9fc7de'); sg.addColorStop(1, '#5d8fb0');
      g.fillStyle = sg;
      g.beginPath(); g.moveTo(x0, FLOOR + 3); g.lineTo(x0, FLOOR - 30);
      g.quadraticCurveTo(x0 + d * 30, FLOOR - 28, x0 + d * 52, FLOOR - 8);
      g.quadraticCurveTo(x0 + d * 62, FLOOR, x0 + d * 72, FLOOR + 3); g.closePath(); g.fill();
    }

    // ledges and crystal blocks never move, so they live in this layer too
    for (const p of arena.platforms) drawLedge(g, p);
    drawCrystal(g, arena.obstacles[0], -1);
    drawCrystal(g, arena.obstacles[1], 1);

    staticCv = c;
    return c;
  }

  function drawLedge(ctx, p) {
    const x = p.x, y = p.y, w = p.w, h = p.h || 16;
    // shadow cast on the wall behind
    ctx.fillStyle = 'rgba(2,8,16,0.35)';
    ctx.beginPath(); ctx.ellipse(x + w / 2, y + h + 18, w * 0.45, 9, 0, 0, TAU); ctx.fill();
    // rock slab
    const rg = ctx.createLinearGradient(0, y, 0, y + h + 10);
    rg.addColorStop(0, '#36506d'); rg.addColorStop(1, '#1b2b3e');
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - 6, y + h); ctx.lineTo(x + w * 0.7, y + h + 6); ctx.lineTo(x + w * 0.55, y + h + 10); ctx.lineTo(x + w * 0.3, y + h + 5); ctx.lineTo(x + 6, y + h);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(150,205,240,0.45)'; ctx.lineWidth = 1.5; ctx.stroke();
    // rock texture lines
    ctx.strokeStyle = 'rgba(8,18,30,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.2, y + 4); ctx.lineTo(x + w * 0.25, y + h - 2);
    ctx.moveTo(x + w * 0.62, y + 3); ctx.lineTo(x + w * 0.58, y + h + 4);
    ctx.moveTo(x + w * 0.85, y + 5); ctx.lineTo(x + w * 0.8, y + h);
    ctx.stroke();
    // snow cap with soft lumps, overhanging the edges a little
    ctx.fillStyle = '#cfe9f7';
    ctx.beginPath(); ctx.moveTo(x - 3, y + 3);
    for (let i = 0; i <= 8; i++) { const px = x - 3 + ((w + 6) * i) / 8; ctx.lineTo(px, y - 3 - (i % 2 ? 1.5 : 0)); }
    ctx.lineTo(x + w + 3, y + 3); ctx.quadraticCurveTo(x + w / 2, y + 6, x - 3, y + 3); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillRect(x + 10, y - 3, w * 0.3, 1.5);
    ctx.fillStyle = 'rgba(120,175,210,0.6)';
    ctx.fillRect(x - 2, y + 2, w + 4, 1.5);
    // tiny icicles under the ledge
    for (let i = 1; i < 7; i++) {
      const ix = x + (w * i) / 7, il = 6 + ((i * 7) % 3) * 4;
      const ig = ctx.createLinearGradient(ix - 3, 0, ix + 3, 0);
      ig.addColorStop(0, 'rgba(110,170,215,0.8)'); ig.addColorStop(0.45, 'rgba(200,238,255,0.85)'); ig.addColorStop(1, 'rgba(90,150,200,0.8)');
      ctx.fillStyle = ig;
      ctx.beginPath(); ctx.moveTo(ix - 3, y + h - 2); ctx.lineTo(ix + 3, y + h - 2); ctx.lineTo(ix, y + h + il); ctx.closePath(); ctx.fill();
    }
  }

  // unbreakable crystal block: a cluster of hexagonal prisms that fills the block exactly
  function drawCrystal(ctx, o, side) {
    const { x, y, w, h } = o;
    ctx.save();
    // glow pooled on the ice beneath it
    const gl = ctx.createRadialGradient(x + w / 2, y + h, 2, x + w / 2, y + h, 60);
    gl.addColorStop(0, 'rgba(110,200,250,0.22)'); gl.addColorStop(1, 'rgba(110,200,250,0)');
    ctx.fillStyle = gl; ctx.fillRect(x - 40, y + h - 40, w + 80, 70);
    // dark base block that is the solid shape
    ctx.fillStyle = '#1b4466';
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + 10); ctx.lineTo(x + 10, y); ctx.lineTo(x + w - 10, y); ctx.lineTo(x + w, y + 10); ctx.lineTo(x + w, y + h); ctx.closePath(); ctx.fill();
    // prisms (mirrored on the right block)
    const prisms = [[0.08, 0.32, 0.28], [0.3, 0.0, 0.36], [0.62, 0.18, 0.3], [0.2, 0.5, 0.22], [0.72, 0.45, 0.24]];
    for (const [u, v, pw] of prisms) {
      const px = side > 0 ? x + (1 - u - pw) * w : x + u * w, py = y + v * h, ww = pw * w;
      const lit = ctx.createLinearGradient(px, 0, px + ww, 0);
      lit.addColorStop(0, '#3a86b8'); lit.addColorStop(0.45, '#8fd0f2'); lit.addColorStop(0.55, '#5aa7d4'); lit.addColorStop(1, '#2b6894');
      ctx.fillStyle = lit;
      ctx.beginPath(); ctx.moveTo(px, y + h); ctx.lineTo(px, py + 8); ctx.lineTo(px + ww / 2, py); ctx.lineTo(px + ww, py + 8); ctx.lineTo(px + ww, y + h); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(215,243,255,0.6)'; ctx.lineWidth = 1; ctx.stroke();
      ctx.strokeStyle = 'rgba(235,250,255,0.35)';
      ctx.beginPath(); ctx.moveTo(px + ww / 2, py + 1); ctx.lineTo(px + ww / 2, y + h); ctx.stroke();
    }
    // block outline and a snow cap so the top reads as standable
    ctx.strokeStyle = 'rgba(200,238,255,0.65)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x, y + h); ctx.lineTo(x, y + 10); ctx.lineTo(x + 10, y); ctx.lineTo(x + w - 10, y); ctx.lineTo(x + w, y + 10); ctx.lineTo(x + w, y + h); ctx.stroke();
    ctx.fillStyle = '#d3ecf8';
    ctx.beginPath(); ctx.moveTo(x + 4, y + 4); ctx.quadraticCurveTo(x + w * 0.3, y - 4, x + w * 0.5, y - 3); ctx.quadraticCurveTo(x + w * 0.75, y - 5, x + w - 4, y + 4); ctx.quadraticCurveTo(x + w / 2, y + 2, x + 4, y + 4); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.65)'; ctx.fillRect(x + 12, y - 2, w * 0.25, 1.3);
    ctx.restore();
  }

  (window.STICK_ARENAS = window.STICK_ARENAS || []).push(arena);
})();
