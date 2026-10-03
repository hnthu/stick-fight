// Arena 02: Volcano (Núi lửa)
// Rock ledges over a cooled-crust floor, two basalt pillars and two breakable boulders. Three lava vents (one centre, two at the edges)
// erupt in turn: first the centre, then both edges together. Each eruption glows and
// bubbles for 1.3 s before the column shoots up, so there is always time to move.
(function () {
  const W = 960, H = 540, FLOOR = 474;
  const VENT_W = 96;
  const VENTS = [
    { x: 480, group: 0 },            // centre
    { x: 72, group: 1 }, { x: 888, group: 1 }, // both edges (symmetric)
  ];
  const FIRST = 5, PERIOD = 7.5, WARN = 1.3, ACTIVE = 0.9, RISE = 0.18;
  const COL_TOP = 175;               // lava column reaches up to here
  const DMG = 10, HIT_CD = 1.2;
  const BOULDER_HP = 35;

  const S = { clock: 0, cycle: -1, group: 0, phase: 'idle', phaseT: 0, cd: [0, 0], fx: [] };

  // ---------- pre-rendered static layer ----------
  let bg = null;
  function rng(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
  function paintStatic() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const b = c.getContext('2d');
    const r = rng(42);
    // sky
    let g = b.createLinearGradient(0, 0, 0, FLOOR);
    g.addColorStop(0, '#120a0c'); g.addColorStop(0.55, '#2a1112'); g.addColorStop(1, '#4a1a12');
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    // distant ridge
    b.fillStyle = '#1d0f10';
    b.beginPath(); b.moveTo(0, 360);
    for (let x = 0; x <= W; x += 40) b.lineTo(x, 330 + Math.sin(x * 0.013) * 22 + r() * 14);
    b.lineTo(W, FLOOR); b.lineTo(0, FLOOR); b.fill();
    // volcano cone
    b.fillStyle = '#170b0c';
    b.beginPath();
    b.moveTo(140, FLOOR); b.lineTo(400, 150); b.lineTo(430, 140); b.lineTo(530, 140); b.lineTo(560, 150); b.lineTo(820, FLOOR);
    b.fill();
    // lava streams down the cone
    b.lineCap = 'round';
    for (const s of [[455, 150, 380, 300, 330, 420], [505, 150, 560, 280, 640, 430], [480, 150, 470, 260, 500, 360]]) {
      b.strokeStyle = 'rgba(255,90,30,.35)'; b.lineWidth = 7;
      b.beginPath(); b.moveTo(s[0], s[1]); b.quadraticCurveTo(s[2], s[3], s[4], s[5]); b.stroke();
      b.strokeStyle = 'rgba(255,170,60,.35)'; b.lineWidth = 2;
      b.beginPath(); b.moveTo(s[0], s[1]); b.quadraticCurveTo(s[2], s[3], s[4], s[5]); b.stroke();
    }
    // near ridge silhouettes at the sides
    b.fillStyle = '#0e0708';
    b.beginPath(); b.moveTo(0, 250); b.lineTo(60, 280); b.lineTo(110, 360); b.lineTo(150, FLOOR); b.lineTo(0, FLOOR); b.fill();
    b.beginPath(); b.moveTo(W, 240); b.lineTo(W - 70, 290); b.lineTo(W - 120, 370); b.lineTo(W - 160, FLOOR); b.lineTo(W, FLOOR); b.fill();
    // ground: cooled basalt crust
    g = b.createLinearGradient(0, FLOOR, 0, H);
    g.addColorStop(0, '#2b1b18'); g.addColorStop(1, '#140c0b');
    b.fillStyle = g; b.fillRect(0, FLOOR, W, H - FLOOR);
    for (let i = 0; i < 70; i++) {
      b.fillStyle = `rgba(${60 + r() * 30},${35 + r() * 15},${30 + r() * 10},.6)`;
      const x = r() * W, y = FLOOR + 8 + r() * (H - FLOOR - 8);
      b.beginPath(); b.ellipse(x, y, 10 + r() * 26, 4 + r() * 6, 0, 0, Math.PI * 2); b.fill();
    }
    // crust top edge
    b.strokeStyle = '#6b4235'; b.lineWidth = 3;
    b.beginPath(); b.moveTo(0, FLOOR + 1); for (let x = 0; x <= W; x += 24) b.lineTo(x, FLOOR + 1 + (r() - 0.5) * 2); b.stroke();
    // vent pits cut into the crust
    for (const v of VENTS) {
      const x0 = v.x - VENT_W / 2;
      b.fillStyle = '#0b0606';
      b.beginPath();
      b.moveTo(x0 - 6, FLOOR); b.lineTo(x0 + 10, FLOOR + 22); b.lineTo(x0 + VENT_W - 10, FLOOR + 22); b.lineTo(x0 + VENT_W + 6, FLOOR); b.fill();
      b.strokeStyle = '#5a3328'; b.lineWidth = 3;
      b.beginPath(); b.moveTo(x0 - 6, FLOOR); b.lineTo(x0 + 10, FLOOR + 22); b.moveTo(x0 + VENT_W + 6, FLOOR); b.lineTo(x0 + VENT_W - 10, FLOOR + 22); b.stroke();
    }
    return c;
  }

  function crack(b, pts) { b.beginPath(); pts.forEach((p, i) => (i ? b.lineTo(p[0], p[1]) : b.moveTo(p[0], p[1]))); b.stroke(); }
  // glowing cracks in the floor (animated alpha, fixed shape)
  const CRACKS = (() => {
    const r = rng(9), out = [];
    for (let i = 0; i < 14; i++) {
      let x = 20 + r() * (W - 40), y = FLOOR + 12 + r() * 40; const pts = [[x, y]];
      for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 50; y += 4 + r() * 10; pts.push([x, Math.min(H - 2, y)]); }
      out.push({ pts, ph: r() * 6 });
    }
    return out;
  })();

  function drawPlatform(ctx, p, t) {
    const h = p.h || 18;
    ctx.save();
    // underside glow from the lava below
    const g = ctx.createLinearGradient(0, p.y, 0, p.y + h + 14);
    g.addColorStop(0, '#4a2c24'); g.addColorStop(1, '#1e1110');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + p.w, p.y);
    ctx.lineTo(p.x + p.w - 10, p.y + h);
    ctx.lineTo(p.x + p.w * 0.6, p.y + h + 12);
    ctx.lineTo(p.x + p.w * 0.35, p.y + h + 8);
    ctx.lineTo(p.x + 10, p.y + h);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#8a5a44'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(p.x, p.y + 1); ctx.lineTo(p.x + p.w, p.y + 1); ctx.stroke();
    ctx.strokeStyle = `rgba(255,110,40,${0.35 + 0.2 * Math.sin(t * 2 + p.x)})`; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(p.x + p.w * 0.3, p.y + 5); ctx.lineTo(p.x + p.w * 0.38, p.y + h); ctx.lineTo(p.x + p.w * 0.45, p.y + h + 6); ctx.stroke();
    ctx.restore();
  }

  function drawPillar(ctx, o, t) {
    ctx.save();
    const cols = 3, cw = o.w / cols;
    for (let i = 0; i < cols; i++) {
      const x = o.x + i * cw, top = o.y;
      const g = ctx.createLinearGradient(x, 0, x + cw, 0);
      g.addColorStop(0, '#3a2724'); g.addColorStop(0.5, '#24171a'); g.addColorStop(1, '#170e10');
      ctx.fillStyle = g;
      ctx.fillRect(x, top, cw, o.y + o.h - top);
      ctx.fillStyle = '#5a3b33';
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + cw * 0.5, top - 4); ctx.lineTo(x + cw, top); ctx.lineTo(x + cw * 0.5, top + 4); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#120a0b'; ctx.lineWidth = 1.5; ctx.strokeRect(x, top, cw, o.y + o.h - top);
    }
    // horizontal cooling joints with faint heat glow
    ctx.strokeStyle = `rgba(255,100,40,${0.22 + 0.1 * Math.sin(t * 1.5 + o.x)})`; ctx.lineWidth = 1.5;
    for (let y = o.y + 28; y < o.y + o.h - 6; y += 26) {
      ctx.beginPath(); ctx.moveTo(o.x + 2, y); ctx.lineTo(o.x + o.w - 2, y + 3); ctx.stroke();
    }
    ctx.restore();
  }

  function drawBoulder(ctx, o, t) {
    ctx.save();
    const cx = o.x + o.w / 2, by = o.y + o.h;
    if (!(o.hp > 0)) { // rubble
      ctx.fillStyle = '#2a1a17';
      for (const [dx, r] of [[-16, 8], [-4, 11], [10, 7], [19, 5]]) { ctx.beginPath(); ctx.ellipse(cx + dx, by - r * 0.6, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore(); return;
    }
    const dmg = 1 - Math.max(0, Math.min(1, o.hp / BOULDER_HP));
    const g = ctx.createRadialGradient(cx - 8, o.y + 14, 4, cx, o.y + o.h / 2, o.w * 0.8);
    g.addColorStop(0, '#4b322b'); g.addColorStop(1, '#1a1012');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(o.x, by);
    ctx.lineTo(o.x - 2, o.y + o.h * 0.45);
    ctx.quadraticCurveTo(o.x + 4, o.y + 2, cx, o.y);
    ctx.quadraticCurveTo(o.x + o.w - 2, o.y + 3, o.x + o.w + 2, o.y + o.h * 0.5);
    ctx.lineTo(o.x + o.w, by);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#6b4235'; ctx.lineWidth = 2; ctx.stroke();
    // molten core shows through cracks, more as it takes damage
    ctx.strokeStyle = `rgba(255,${120 + 60 * dmg | 0},40,${0.45 + 0.45 * dmg + 0.1 * Math.sin(t * 4)})`;
    ctx.lineWidth = 1.5 + dmg * 2; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 4, o.y + 4); ctx.lineTo(cx + 2, o.y + 18); ctx.lineTo(cx - 6, o.y + 30); ctx.lineTo(cx + 1, by - 4);
    if (dmg > 0.3) { ctx.moveTo(cx + 2, o.y + 18); ctx.lineTo(o.x + o.w - 6, o.y + 26); }
    if (dmg > 0.6) { ctx.moveTo(cx - 6, o.y + 30); ctx.lineTo(o.x + 4, o.y + 36); }
    ctx.stroke();
    ctx.restore();
  }

  function ventState(v) {
    if (v.group !== S.group) return { warn: 0, active: 0, h: 0 };
    if (S.phase === 'warn') return { warn: S.phaseT / WARN, active: 0, h: 0 };
    if (S.phase === 'burst') {
      const rise = Math.min(1, S.phaseT / RISE), fall = Math.min(1, (ACTIVE - S.phaseT) / 0.2);
      return { warn: 1, active: 1, h: Math.max(0, Math.min(rise, fall)) };
    }
    return { warn: 0, active: 0, h: 0 };
  }

  function drawVent(ctx, v, t) {
    const st = ventState(v), x0 = v.x - VENT_W / 2;
    // molten pool always visible, brighter while warning
    const pulse = 0.55 + 0.15 * Math.sin(t * 3 + v.x) + st.warn * 0.45;
    let g = ctx.createLinearGradient(0, FLOOR, 0, FLOOR + 22);
    g.addColorStop(0, `rgba(255,${120 + st.warn * 80 | 0},40,${Math.min(1, pulse)})`);
    g.addColorStop(1, 'rgba(120,20,10,.9)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(x0 + 2, FLOOR + 4); ctx.lineTo(x0 + 12, FLOOR + 20); ctx.lineTo(x0 + VENT_W - 12, FLOOR + 20); ctx.lineTo(x0 + VENT_W - 2, FLOOR + 4); ctx.fill();
    if (st.warn > 0 && !st.active) {
      // telegraph: rising glow column outline + blinking warning chevrons
      const a = 0.12 + 0.18 * st.warn;
      g = ctx.createLinearGradient(0, FLOOR, 0, COL_TOP);
      g.addColorStop(0, `rgba(255,120,40,${a})`); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g; ctx.fillRect(x0, COL_TOP, VENT_W, FLOOR - COL_TOP);
      const blink = Math.sin(S.phaseT * (10 + st.warn * 14)) > 0;
      if (blink) {
        ctx.fillStyle = '#ffcf4a'; ctx.strokeStyle = '#2a0c06'; ctx.lineWidth = 3;
        for (let i = 0; i < 2; i++) {
          const y = FLOOR - 26 - i * 16;
          ctx.beginPath(); ctx.moveTo(v.x - 16, y + 8); ctx.lineTo(v.x, y - 4); ctx.lineTo(v.x + 16, y + 8); ctx.lineTo(v.x + 16, y + 13); ctx.lineTo(v.x, y + 1); ctx.lineTo(v.x - 16, y + 13); ctx.closePath();
          ctx.stroke(); ctx.fill();
        }
      }
    }
    if (st.active && st.h > 0) {
      const top = FLOOR - (FLOOR - COL_TOP) * st.h;
      const wob = (y) => Math.sin(y * 0.05 + t * 18) * 6;
      g = ctx.createLinearGradient(v.x - VENT_W / 2, 0, v.x + VENT_W / 2, 0);
      g.addColorStop(0, '#b3200c'); g.addColorStop(0.3, '#ff6a1f'); g.addColorStop(0.5, '#ffc048'); g.addColorStop(0.7, '#ff6a1f'); g.addColorStop(1, '#b3200c');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(x0 + 4, FLOOR + 6);
      for (let y = FLOOR; y >= top; y -= 16) ctx.lineTo(x0 + 8 + wob(y), y);
      ctx.quadraticCurveTo(v.x, top - 34, x0 + VENT_W - 8 + wob(top), top);
      for (let y = top; y <= FLOOR; y += 16) ctx.lineTo(x0 + VENT_W - 8 + wob(y + 30), y);
      ctx.lineTo(x0 + VENT_W - 4, FLOOR + 6);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(255,240,170,.55)';
      ctx.fillRect(v.x - 6 + wob(top) * 0.5, top + 10, 12, FLOOR - top - 10);
    }
  }

  const arena = {
    id: 'arena02',
    name: 'Volcano',
    nameVi: 'Núi lửa',
    hint: 'Lava vents, pillars, boulders',
    hintVi: 'Lava phun, cột đá, tảng đá vỡ',
    floorY: FLOOR,
    gravityScale: 1,
    platforms: [
      { x: 120, y: 340, w: 170, h: 18 },
      { x: 395, y: 228, w: 170, h: 18 },
      { x: 670, y: 340, w: 170, h: 18 },
    ],
    // basalt pillars flank the centre vent; breakable cooled-lava boulders guard the edge vents
    obstacles: [
      { x: 334, y: FLOOR - 96, w: 44, h: 96, kind: 'pillar' },
      { x: 582, y: FLOOR - 96, w: 44, h: 96, kind: 'pillar' },
      { x: 122, y: FLOOR - 52, w: 46, h: 52, kind: 'boulder', hp: BOULDER_HP },
      { x: 792, y: FLOOR - 52, w: 46, h: 52, kind: 'boulder', hp: BOULDER_HP },
    ],

    drawBackground(ctx, t) {
      try {
        if (!bg) bg = paintStatic();
        ctx.save();
        ctx.drawImage(bg, 0, 0);
        // crater glow + smoke plume
        const cg = ctx.createRadialGradient(480, 145, 4, 480, 145, 120);
        cg.addColorStop(0, `rgba(255,120,40,${0.45 + 0.1 * Math.sin(t * 1.7)})`); cg.addColorStop(1, 'rgba(255,80,20,0)');
        ctx.fillStyle = cg; ctx.fillRect(360, 60, 240, 170);
        for (let i = 0; i < 6; i++) {
          const k = ((t * 0.08 + i / 6) % 1);
          ctx.fillStyle = `rgba(60,40,40,${0.28 * (1 - k)})`;
          ctx.beginPath(); ctx.arc(480 + Math.sin(i * 2 + t * 0.3) * 30 + k * 120, 130 - k * 110, 22 + k * 50, 0, Math.PI * 2); ctx.fill();
        }
        // floor cracks
        ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (const c of CRACKS) {
          ctx.strokeStyle = `rgba(255,${90 + 40 * Math.sin(t * 1.3 + c.ph) | 0},30,${0.35 + 0.2 * Math.sin(t * 1.3 + c.ph)})`;
          crack(ctx, c.pts);
        }
        for (const p of arena.platforms) drawPlatform(ctx, p, t);
        for (const o of arena.obstacles) o.kind === 'pillar' ? drawPillar(ctx, o, t) : drawBoulder(ctx, o, t);
        for (const v of VENTS) drawVent(ctx, v, t); // lava covers ledges it reaches
        ctx.restore();
      } catch (e) { /* never break the frame */ }
    },

    drawForeground(ctx, t) {
      try {
        ctx.save();
        // drifting embers
        for (let i = 0; i < 26; i++) {
          const sp = 30 + (i * 37) % 50;
          const y = H - ((t * sp + i * 97) % (H + 40));
          const x = (i * 131 + Math.sin(t * 0.7 + i) * 30) % W;
          ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t * 3 + i);
          ctx.fillStyle = i % 3 ? '#ff8a3a' : '#ffd36a';
          ctx.fillRect(x, y, 2.5, 2.5);
        }
        ctx.globalAlpha = 1;
        // heat haze vignette at the bottom edge
        const g = ctx.createLinearGradient(0, H - 70, 0, H);
        g.addColorStop(0, 'rgba(255,60,20,0)'); g.addColorStop(1, 'rgba(255,60,20,.12)');
        ctx.fillStyle = g; ctx.fillRect(0, H - 70, W, 70);
        ctx.restore();
      } catch (e) { /* ignore */ }
    },

    update(dt, fighters, game) {
      try {
        S.cd[0] = Math.max(0, S.cd[0] - dt); S.cd[1] = Math.max(0, S.cd[1] - dt);
        S.clock += dt;
        const c = S.clock - FIRST;
        if (c < 0) { S.phase = 'idle'; return; }
        const n = Math.floor(c / PERIOD), local = c - n * PERIOD;
        if (n !== S.cycle) { S.cycle = n; S.group = n % 2; }
        const prev = S.phase;
        if (local < WARN) { S.phase = 'warn'; S.phaseT = local; }
        else if (local < WARN + ACTIVE) { S.phase = 'burst'; S.phaseT = local - WARN; }
        else { S.phase = 'idle'; S.phaseT = 0; }

        const vents = VENTS.filter(v => v.group === S.group);
        if (S.phase === 'warn' && Math.random() < 0.5 && game && game.particle) {
          for (const v of vents) game.particle({ x: v.x + (Math.random() - 0.5) * VENT_W * 0.7, y: FLOOR + 4, vx: (Math.random() - 0.5) * 40, vy: -120 - Math.random() * 160, life: 0.5, col: '#ff9a3a', r: 3 });
        }
        if (S.phase === 'burst' && prev !== 'burst' && game) {
          if (game.shake) game.shake(7);
          for (const v of vents) if (game.particle) for (let i = 0; i < 14; i++)
            game.particle({ x: v.x + (Math.random() - 0.5) * VENT_W, y: FLOOR - 10, vx: (Math.random() - 0.5) * 380, vy: -300 - Math.random() * 420, life: 0.9, col: i % 2 ? '#ffb347' : '#ff5a1f', r: 4 });
        }
        if (S.phase !== 'burst' || !fighters || !game) return;
        const st = ventState(vents[0]);
        if (st.h < 0.35) return;
        const top = FLOOR - (FLOOR - COL_TOP) * st.h;
        for (const f of fighters) {
          if (!f || f.ko) continue;
          const i = f.slot === 1 ? 1 : 0;
          if (S.cd[i] > 0) continue;
          for (const v of vents) {
            if (Math.abs(f.x - v.x) < VENT_W / 2 + 10 && f.y > top && f.y - 140 < FLOOR) {
              S.cd[i] = HIT_CD;
              if (game.fighting && game.hurt) {
                game.hurt(f, { dmg: DMG, kb: 240, fromX: v.x, stun: 0.35, heavy: true, word: 'BURN' });
                f.vy = -720;
              }
              break;
            }
          }
        }
      } catch (e) { /* ignore */ }
    },

    reset() {
      S.clock = 0; S.cycle = -1; S.group = 0; S.phase = 'idle'; S.phaseT = 0; S.cd[0] = S.cd[1] = 0;
    },
  };

  (window.STICK_ARENAS = window.STICK_ARENAS || []).push(arena);
})();
