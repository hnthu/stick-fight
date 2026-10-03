// Arena 10: Haunted Castle (Lâu đài ma)
// Moonlit castle hall: two stone balconies, a gently swinging chandelier, and a
// ghost platform that fades in and out. While the ghost platform is gone its
// width is set to 0 so the engine's normal platform check lets fighters drop
// through; it flickers for 1.5 s before vanishing so nobody is surprised.
(function () {
  const W = 960, H = 540;
  const FLOOR = 470;

  // Ghost platform cycle (seconds)
  const G_SOLID = 5, G_WARN = 1.5, G_GONE = 2.5, G_IN = 1.0;
  const G_CYCLE = G_SOLID + G_WARN + G_GONE + G_IN;
  const GHOST_W = 140;

  const CH_BASE_X = 390, CH_W = 180, CH_Y = 290, CH_SWAY = 26;

  const balL = { x: 85, y: 340, w: 200, h: 14 };
  const balR = { x: 675, y: 340, w: 200, h: 14 };
  const chand = { x: CH_BASE_X, y: CH_Y, w: CH_W, h: 10 };
  const ghost = { x: 410, y: 175, w: GHOST_W, h: 12 };

  // Solid obstacles (mirrored): breakable rotten coffins on the floor and
  // stone gargoyles guarding the outer end of each balcony.
  const COFFIN_HP = 35;
  const coffinL = { x: 300, y: FLOOR - 38, w: 64, h: 38, kind: 'coffin', hp: COFFIN_HP };
  const coffinR = { x: 596, y: FLOOR - 38, w: 64, h: 38, kind: 'coffin', hp: COFFIN_HP };
  const gargL = { x: 90, y: 340 - 50, w: 34, h: 50, kind: 'gargoyle' };
  const gargR = { x: 836, y: 340 - 50, w: 34, h: 50, kind: 'gargoyle' };
  const OBSTACLES = [coffinL, coffinR, gargL, gargR];
  const wasBroken = [false, false];

  let ghostT = 0;      // time within cycle
  let chandT = 0;      // chandelier swing clock
  let flash = 0;       // lightning flash intensity 0..1
  let boltTimer = 6;   // seconds until next lightning
  let bolt = null;     // {x, pts, life}
  let bg = null;       // pre-rendered static layer

  function rnd(a, b) { return a + Math.random() * (b - a); }

  // Ghost alpha + whether solid, from cycle time
  function ghostState() {
    const t = ghostT;
    if (t < G_SOLID) return { a: 0.85, solid: true, warn: false };
    if (t < G_SOLID + G_WARN) {
      const k = (t - G_SOLID) / G_WARN;
      const flick = 0.5 + 0.5 * Math.sin(t * (18 + k * 30));
      return { a: 0.85 * (1 - k * 0.6) * (0.45 + 0.55 * flick), solid: true, warn: true };
    }
    if (t < G_SOLID + G_WARN + G_GONE) return { a: 0, solid: false, warn: false };
    const k = (t - G_SOLID - G_WARN - G_GONE) / G_IN;
    return { a: 0.85 * k * 0.7, solid: false, warn: false };
  }

  function buildBg() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const g = c.getContext('2d');

    // Wall gradient
    const wg = g.createLinearGradient(0, 0, 0, FLOOR);
    wg.addColorStop(0, '#0d0b1a');
    wg.addColorStop(0.6, '#171427');
    wg.addColorStop(1, '#1d1a2c');
    g.fillStyle = wg; g.fillRect(0, 0, W, FLOOR);

    // Stone blocks
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
    for (let y = 0, row = 0; y < FLOOR; y += 34, row++) {
      g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); g.stroke();
      const off = row % 2 ? 0 : 36;
      for (let x = off; x < W; x += 72) {
        g.beginPath(); g.moveTo(x + 0.5, y); g.lineTo(x + 0.5, y + 34); g.stroke();
      }
    }
    // random stone tint
    for (let i = 0; i < 140; i++) {
      g.fillStyle = `rgba(${Math.random() < 0.5 ? '90,80,130' : '0,0,0'},${rnd(0.03, 0.08)})`;
      g.fillRect(Math.floor(rnd(0, 13)) * 72 + rnd(-36, 0), Math.floor(rnd(0, 14)) * 34, 72, 34);
    }

    // Gothic windows (moonlight) at x positions, set high
    const wins = [110, 300, 660, 850];
    for (const wx of wins) drawWindow(g, wx, 95, 64, 170);
    // Central rose window
    drawRose(g, 480, 140, 62);

    // Pillars between windows
    for (const px of [205, 395, 565, 755]) {
      const pg = g.createLinearGradient(px - 18, 0, px + 18, 0);
      pg.addColorStop(0, '#0f0d1c'); pg.addColorStop(0.45, '#2a2640'); pg.addColorStop(1, '#100e1d');
      g.fillStyle = pg; g.fillRect(px - 18, 60, 36, FLOOR - 60);
      g.fillStyle = '#25213a'; g.fillRect(px - 24, 60, 48, 12); g.fillRect(px - 24, FLOOR - 16, 48, 16);
    }

    // Tattered banners hanging from pillars (dark crimson)
    for (const bx of [205, 755]) {
      g.fillStyle = '#3a1020';
      g.beginPath();
      g.moveTo(bx - 22, 78); g.lineTo(bx + 22, 78); g.lineTo(bx + 22, 230);
      g.lineTo(bx + 12, 215); g.lineTo(bx + 4, 236); g.lineTo(bx - 6, 218); g.lineTo(bx - 14, 232); g.lineTo(bx - 22, 220);
      g.closePath(); g.fill();
      g.strokeStyle = '#6b4a1e'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(bx - 26, 78); g.lineTo(bx + 26, 78); g.stroke();
      // crest: simple skull-ish circle
      g.fillStyle = 'rgba(200,170,110,0.35)';
      g.beginPath(); g.arc(bx, 135, 9, 0, Math.PI * 2); g.fill();
      g.fillRect(bx - 5, 142, 10, 6);
    }

    // Floor
    const fg = g.createLinearGradient(0, FLOOR, 0, H);
    fg.addColorStop(0, '#2a2538'); fg.addColorStop(1, '#0c0a14');
    g.fillStyle = fg; g.fillRect(0, FLOOR, W, H - FLOOR);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const y = FLOOR + 10 + i * i * 6 + i * 8;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    for (let x = -600; x < W + 600; x += 80) {
      g.beginPath(); g.moveTo(W / 2 + (x - W / 2) * 0.55, FLOOR); g.lineTo(x, H); g.stroke();
    }
    // Carpet runner
    g.fillStyle = 'rgba(90,18,34,0.75)';
    g.beginPath(); g.moveTo(400, FLOOR); g.lineTo(560, FLOOR); g.lineTo(610, H); g.lineTo(350, H); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(180,140,60,0.4)'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(408, FLOOR); g.lineTo(362, H); g.moveTo(552, FLOOR); g.lineTo(598, H); g.stroke();
    // Floor edge highlight
    g.fillStyle = '#3d3652'; g.fillRect(0, FLOOR, W, 3);

    // Suits of armour silhouettes at the far edges
    for (const ax of [48, 912]) {
      g.fillStyle = '#0a0912';
      g.beginPath(); g.arc(ax, FLOOR - 112, 11, 0, Math.PI * 2); g.fill();
      g.fillRect(ax - 15, FLOOR - 100, 30, 46);
      g.fillRect(ax - 11, FLOOR - 54, 9, 54); g.fillRect(ax + 2, FLOOR - 54, 9, 54);
      g.fillRect(ax + (ax < W / 2 ? 18 : -21), FLOOR - 150, 3, 150);
      g.beginPath(); g.moveTo(ax + (ax < W / 2 ? 19.5 : -19.5), FLOOR - 166);
      g.lineTo(ax + (ax < W / 2 ? 14 : -25), FLOOR - 148); g.lineTo(ax + (ax < W / 2 ? 25 : -14), FLOOR - 148); g.fill();
    }

    // Balcony corbels and balustrades (static)
    for (const b of [balL, balR]) drawBalconyBody(g, b);

    bg = c;
  }

  function drawWindow(g, x, y, w, h) {
    // arch path
    const path = () => {
      g.beginPath();
      g.moveTo(x - w / 2, y + h);
      g.lineTo(x - w / 2, y + w * 0.5);
      g.quadraticCurveTo(x - w / 2, y, x, y - 10);
      g.quadraticCurveTo(x + w / 2, y, x + w / 2, y + w * 0.5);
      g.lineTo(x + w / 2, y + h);
      g.closePath();
    };
    g.fillStyle = '#2b2546'; path(); g.fill();
    const sg = g.createLinearGradient(0, y, 0, y + h);
    sg.addColorStop(0, '#1e2a52'); sg.addColorStop(1, '#141a36');
    g.save(); g.translate(0, 0);
    g.fillStyle = sg;
    g.beginPath();
    g.moveTo(x - w / 2 + 6, y + h - 4);
    g.lineTo(x - w / 2 + 6, y + w * 0.5);
    g.quadraticCurveTo(x - w / 2 + 6, y + 6, x, y - 3);
    g.quadraticCurveTo(x + w / 2 - 6, y + 6, x + w / 2 - 6, y + w * 0.5);
    g.lineTo(x + w / 2 - 6, y + h - 4);
    g.closePath(); g.fill();
    g.restore();
    // mullions
    g.strokeStyle = '#0c0a16'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, y - 3); g.lineTo(x, y + h); g.stroke();
    for (let yy = y + 40; yy < y + h; yy += 40) { g.beginPath(); g.moveTo(x - w / 2 + 6, yy); g.lineTo(x + w / 2 - 6, yy); g.stroke(); }
    // sill
    g.fillStyle = '#2e2944'; g.fillRect(x - w / 2 - 6, y + h, w + 12, 8);
  }

  function drawRose(g, x, y, r) {
    g.fillStyle = '#2b2546';
    g.beginPath(); g.arc(x, y, r + 8, 0, Math.PI * 2); g.fill();
    const rg = g.createRadialGradient(x, y, 4, x, y, r);
    rg.addColorStop(0, '#3c4a7c'); rg.addColorStop(1, '#151b3a');
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    // moon seen through it
    g.fillStyle = 'rgba(220,228,255,0.55)';
    g.beginPath(); g.arc(x + 14, y - 12, 22, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(21,27,58,0.55)';
    g.beginPath(); g.arc(x + 24, y - 18, 19, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#0c0a16'; g.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke();
    }
    g.beginPath(); g.arc(x, y, r * 0.42, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke();
  }

  function drawBalconyBody(g, b) {
    const left = b.x < W / 2;
    // Corbels under the slab
    g.fillStyle = '#1b1829';
    for (let i = 0; i < 3; i++) {
      const cx = b.x + 24 + i * ((b.w - 48) / 2);
      g.beginPath();
      g.moveTo(cx - 12, b.y + b.h); g.lineTo(cx + 12, b.y + b.h);
      g.lineTo(cx + 4, b.y + b.h + 34); g.lineTo(cx - 4, b.y + b.h + 34); g.closePath(); g.fill();
    }
    // Wall support toward the side wall
    g.fillStyle = '#15121f';
    const wx = left ? 0 : b.x + b.w;
    const ww = left ? b.x : W - (b.x + b.w);
    if (ww > 0) g.fillRect(wx, b.y, ww, b.h + 6);
  }

  function drawBalconyTop(ctx, b) {
    // Slab
    const sg = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
    sg.addColorStop(0, '#5a5274'); sg.addColorStop(1, '#2c2740');
    ctx.fillStyle = sg; ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = '#7c7398'; ctx.fillRect(b.x, b.y, b.w, 2);
    // Balustrade hanging below as a decorative rail
    ctx.fillStyle = '#26223a';
    for (let x = b.x + 10; x < b.x + b.w - 6; x += 18) ctx.fillRect(x, b.y + b.h, 6, 16);
    ctx.fillStyle = '#332d4a'; ctx.fillRect(b.x + 4, b.y + b.h + 16, b.w - 8, 5);
  }

  function drawChandelier(ctx, t) {
    const cx = chand.x + chand.w / 2;
    const top = 0;
    // pivot is at ceiling above base center; chain points toward current position
    const px = CH_BASE_X + CH_W / 2;
    ctx.save();
    ctx.strokeStyle = '#3e3850'; ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(px, top); ctx.lineTo(cx, chand.y - 46); ctx.stroke();
    ctx.setLineDash([]);
    // arms from hub to ring
    ctx.strokeStyle = '#4a4260'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, chand.y - 46); ctx.lineTo(chand.x + 6, chand.y);
    ctx.moveTo(cx, chand.y - 46); ctx.lineTo(chand.x + chand.w - 6, chand.y);
    ctx.moveTo(cx, chand.y - 46); ctx.lineTo(cx, chand.y);
    ctx.stroke();
    ctx.fillStyle = '#4a4260'; ctx.beginPath(); ctx.arc(cx, chand.y - 46, 6, 0, Math.PI * 2); ctx.fill();
    // ring (the standing surface)
    const rg = ctx.createLinearGradient(0, chand.y, 0, chand.y + chand.h);
    rg.addColorStop(0, '#8a7a4a'); rg.addColorStop(1, '#3d3420');
    ctx.fillStyle = rg; ctx.fillRect(chand.x, chand.y, chand.w, chand.h);
    ctx.fillStyle = '#b39f62'; ctx.fillRect(chand.x, chand.y, chand.w, 2);
    // hanging candles below the ring with flicker
    for (let i = 0; i < 5; i++) {
      const x = chand.x + 18 + i * ((chand.w - 36) / 4);
      const y = chand.y + chand.h;
      ctx.fillStyle = '#5a4e32'; ctx.fillRect(x - 1, y, 2, 8);
      ctx.fillStyle = '#cfc6a8'; ctx.fillRect(x - 3, y + 8, 6, 12);
      const fl = 0.75 + 0.25 * Math.sin(t * 13 + i * 2.1) * Math.sin(t * 7.3 + i);
      ctx.fillStyle = `rgba(255,190,90,${0.18 * fl})`;
      ctx.beginPath(); ctx.arc(x, y + 30, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,200,110,${0.85 * fl})`;
      ctx.beginPath(); ctx.ellipse(x, y + 26 + fl, 2.5, 5 * fl, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawGhost(ctx, t) {
    const s = ghostState();
    // Faint outline always visible so players know where it will return
    ctx.save();
    ctx.strokeStyle = 'rgba(150,220,210,0.13)';
    ctx.setLineDash([5, 6]); ctx.lineWidth = 1;
    ctx.strokeRect(ghost.x + 0.5, ghost.y + 0.5, GHOST_W - 1, ghost.h - 1);
    ctx.setLineDash([]);
    if (s.a > 0.01) {
      const bob = Math.sin(t * 2) * 1.5;
      ctx.globalAlpha = s.a;
      ctx.shadowColor = s.warn ? '#ff8aa0' : '#7ff0d8';
      ctx.shadowBlur = 14;
      ctx.fillStyle = s.warn ? '#b56a86' : '#6fc9bb';
      ctx.fillRect(ghost.x, ghost.y + bob * 0, GHOST_W, ghost.h);
      ctx.shadowBlur = 0;
      // wispy tail drips under the slab
      ctx.fillStyle = s.warn ? 'rgba(190,110,140,0.5)' : 'rgba(120,210,195,0.5)';
      for (let i = 0; i < 6; i++) {
        const x = ghost.x + 12 + i * 23;
        const len = 10 + 6 * Math.sin(t * 3 + i * 1.7);
        ctx.beginPath();
        ctx.moveTo(x - 6, ghost.y + ghost.h);
        ctx.quadraticCurveTo(x + 4 * Math.sin(t * 4 + i), ghost.y + ghost.h + len, x + 6, ghost.y + ghost.h);
        ctx.fill();
      }
      // two hollow eyes
      ctx.fillStyle = 'rgba(10,20,30,0.7)';
      ctx.beginPath(); ctx.ellipse(ghost.x + GHOST_W / 2 - 14, ghost.y + 6 + bob, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(ghost.x + GHOST_W / 2 + 14, ghost.y + 6 + bob, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawBolt(ctx) {
    if (!bolt) return;
    ctx.save();
    // Bolt is only drawn inside the window glass area (clip)
    ctx.beginPath();
    for (const wx of [110, 300, 660, 850]) ctx.rect(wx - 26, 92, 52, 170);
    ctx.arc(480, 140, 62, 0, Math.PI * 2);
    ctx.clip();
    ctx.strokeStyle = `rgba(220,230,255,${Math.min(1, bolt.life * 4)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bolt.pts[0][0], bolt.pts[0][1]);
    for (const p of bolt.pts) ctx.lineTo(p[0], p[1]);
    ctx.stroke();
    ctx.restore();
  }

  function isBroken(o) {
    return o.broken || o.dead || o.destroyed || (typeof o.hp === 'number' && o.hp <= 0);
  }

  function drawCoffin(ctx, o, t) {
    const { x, y, w, h } = o;
    if (isBroken(o)) {
      // smashed: open base with planks scattered (not solid)
      ctx.fillStyle = '#2a1a14';
      ctx.fillRect(x + 2, FLOOR - 10, w - 4, 10);
      ctx.save(); ctx.translate(x + 10, FLOOR - 3); ctx.rotate(-0.35); ctx.fillStyle = '#4a3024'; ctx.fillRect(-16, -3, 34, 5); ctx.restore();
      ctx.save(); ctx.translate(x + w - 6, FLOOR - 3); ctx.rotate(0.25); ctx.fillStyle = '#3a241a'; ctx.fillRect(-14, -3, 28, 5); ctx.restore();
      ctx.fillStyle = `rgba(120,240,170,${0.08 + 0.05 * Math.sin(t * 2 + x)})`;
      ctx.fillRect(x + 6, FLOOR - 12, w - 12, 3);
      return;
    }
    // lying coffin seen from the side: tapered hexagon lid
    ctx.fillStyle = '#2a1a14';
    ctx.beginPath();
    ctx.moveTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + 10);
    ctx.lineTo(x + w - 8, y); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 10); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4a3024'; ctx.fillRect(x + 6, y, w - 12, 5);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y + 14); ctx.lineTo(x + w, y + 14); ctx.stroke();
    // brass cross
    ctx.fillStyle = 'rgba(180,150,80,0.7)';
    ctx.fillRect(x + w / 2 - 2, y + 18, 4, 16); ctx.fillRect(x + w / 2 - 7, y + 22, 14, 4);
    // eerie green glow from the lid seam, pulsing
    const g = 0.12 + 0.08 * Math.sin(t * 2.2 + x);
    ctx.fillStyle = `rgba(120,240,170,${g})`; ctx.fillRect(x + 4, y + 12, w - 8, 3);
  }

  function drawGargoyle(ctx, o, t) {
    const { x, y, w, h } = o;
    const cx = x + w / 2, face = x < W / 2 ? 1 : -1;
    ctx.fillStyle = '#3a3550';
    ctx.fillRect(x - 2, y + h - 10, w + 4, 10);              // plinth
    ctx.beginPath();                                          // crouched body
    ctx.moveTo(x + 2, y + h - 10); ctx.lineTo(x + 4, y + 18);
    ctx.lineTo(cx, y + 10); ctx.lineTo(x + w - 4, y + 18); ctx.lineTo(x + w - 2, y + h - 10); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + face * 4, y + 10, 9, 0, Math.PI * 2); ctx.fill(); // head
    ctx.beginPath();                                          // horns
    ctx.moveTo(cx - 4, y + 3); ctx.lineTo(cx - 8, y - 6); ctx.lineTo(cx, y + 2);
    ctx.moveTo(cx + 6, y + 2); ctx.lineTo(cx + 12, y - 6); ctx.lineTo(cx + 10, y + 4); ctx.fill();
    ctx.beginPath();                                          // folded wing
    ctx.moveTo(cx - face * 4, y + 16); ctx.lineTo(cx - face * 22, y + 4); ctx.lineTo(cx - face * 14, y + 30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4c4668'; ctx.fillRect(x - 2, y + h - 10, w + 4, 2);
    // glowing eyes that brighten with lightning
    const e = 0.45 + 0.25 * Math.sin(t * 1.5) + flash * 0.4;
    ctx.fillStyle = `rgba(255,80,80,${Math.min(1, e)})`;
    ctx.fillRect(cx + face * 6 - 1.5, y + 8, 3, 2); ctx.fillRect(cx + face * 1 - 1.5, y + 8, 3, 2);
  }

  function drawObstacles(ctx, t) {
    for (const o of OBSTACLES) {
      ctx.save();
      if (o.kind === 'coffin') drawCoffin(ctx, o, t);
      else if (o.kind === 'gargoyle') drawGargoyle(ctx, o, t);
      ctx.restore();
    }
  }

  const arena = {
    id: 'arena10',
    name: 'Haunted Castle',
    nameVi: 'Lâu đài ma',
    hint: 'Ghost platform fades away',
    hintVi: 'Bục ma lúc ẩn lúc hiện',
    floorY: FLOOR,
    gravityScale: 0.92,
    platforms: [balL, balR, chand, ghost],
    obstacles: OBSTACLES,

    reset() {
      ghostT = 0; chandT = 0; flash = 0; boltTimer = rnd(4, 7); bolt = null;
      chand.x = CH_BASE_X; ghost.w = GHOST_W;
      // engine restores hp before reset; this covers standalone use too
      coffinL.hp = COFFIN_HP; coffinR.hp = COFFIN_HP;
      wasBroken[0] = wasBroken[1] = false;
    },

    update(dt, fighters, game) {
      try {
        if (!(dt > 0)) return;
        dt = Math.min(dt, 0.1);
        // Chandelier: slow pendulum sway
        chandT += dt;
        chand.x = CH_BASE_X + Math.sin(chandT * 0.9) * CH_SWAY;

        // Ghost platform cycle
        const wasSolid = ghostState().solid;
        ghostT = (ghostT + dt) % G_CYCLE;
        const s = ghostState();
        ghost.w = s.solid ? GHOST_W : 0;
        if (wasSolid && !s.solid && game && game.particle) {
          for (let i = 0; i < 14; i++) {
            game.particle({ x: ghost.x + Math.random() * GHOST_W, y: ghost.y + 6, vx: rnd(-30, 30), vy: rnd(-60, -10), life: rnd(0.5, 0.9), col: '#8fe6d6', r: 3, float: true });
          }
        }

        // A broken coffin releases its ghost
        [coffinL, coffinR].forEach((c, i) => {
          const b = isBroken(c);
          if (b && !wasBroken[i] && game && game.particle) {
            for (let k = 0; k < 18; k++) {
              game.particle({ x: c.x + Math.random() * c.w, y: c.y + 10, vx: rnd(-40, 40), vy: rnd(-140, -50), life: rnd(0.7, 1.2), col: k % 3 ? '#8fe6d6' : '#d8fff6', r: 3, float: true });
            }
            if (game.word) game.word(c.x + c.w / 2, c.y - 20, 'BOO!', '#8fe6d6');
          }
          wasBroken[i] = b;
        });

        // Lightning: purely visual flash + small shake
        boltTimer -= dt;
        if (boltTimer <= 0) {
          boltTimer = rnd(7, 13);
          flash = 1;
          const wins = [110, 300, 480, 660, 850];
          const bx = wins[Math.floor(Math.random() * wins.length)] + rnd(-12, 12);
          const pts = [[bx, 80]];
          let x = bx;
          for (let y = 80; y < 270; y += 18) { x += rnd(-12, 12); pts.push([x, y]); }
          bolt = { pts, life: 0.35 };
          if (game && game.shake && game.state !== 'menu') game.shake(3);
        }
        if (flash > 0) flash = Math.max(0, flash - dt * 2.6);
        if (bolt) { bolt.life -= dt; if (bolt.life <= 0) bolt = null; }
      } catch (e) { /* never throw into the engine */ }
    },

    drawBackground(ctx, t) {
      try {
        if (!bg) buildBg();
        ctx.save();
        ctx.drawImage(bg, 0, 0);

        // Moonbeams from windows (subtle, animated)
        const pulse = 0.05 + 0.015 * Math.sin(t * 0.7);
        ctx.fillStyle = `rgba(150,170,230,${pulse + flash * 0.12})`;
        for (const wx of [110, 300, 660, 850]) {
          ctx.beginPath();
          ctx.moveTo(wx - 26, 262); ctx.lineTo(wx + 26, 262);
          ctx.lineTo(wx + 26 + (wx < 480 ? 90 : -10), FLOOR); ctx.lineTo(wx - 26 + (wx < 480 ? 10 : -90), FLOOR);
          ctx.closePath(); ctx.fill();
        }

        // Lightning lights the glass
        if (flash > 0) {
          ctx.fillStyle = `rgba(200,215,255,${flash * 0.55})`;
          for (const wx of [110, 300, 660, 850]) ctx.fillRect(wx - 26, 92, 52, 170);
          ctx.beginPath(); ctx.arc(480, 140, 62, 0, Math.PI * 2); ctx.fill();
        }
        drawBolt(ctx);

        // Wall torches by the balconies
        for (const tx of [30, 930]) {
          ctx.fillStyle = '#3a3020'; ctx.fillRect(tx - 3, 268, 6, 22);
          const fl = 0.8 + 0.2 * Math.sin(t * 11 + tx);
          const tg = ctx.createRadialGradient(tx, 260, 2, tx, 260, 70);
          tg.addColorStop(0, `rgba(255,150,60,${0.22 * fl})`); tg.addColorStop(1, 'rgba(255,150,60,0)');
          ctx.fillStyle = tg; ctx.fillRect(tx - 70, 190, 140, 140);
          ctx.fillStyle = `rgba(255,170,70,${0.9 * fl})`;
          ctx.beginPath(); ctx.ellipse(tx, 260, 4, 8 * fl, 0, 0, Math.PI * 2); ctx.fill();
        }

        // Platforms
        drawBalconyTop(ctx, balL);
        drawBalconyTop(ctx, balR);
        drawChandelier(ctx, t);
        drawGhost(ctx, t);
        drawObstacles(ctx, t);

        // Drifting spirit wisps in the upper hall
        for (let i = 0; i < 4; i++) {
          const k = t * 0.12 + i * 0.25;
          const x = ((k % 1) + 1) % 1 * (W + 120) - 60;
          const y = 120 + i * 30 + Math.sin(t * 1.3 + i * 2) * 14;
          ctx.fillStyle = 'rgba(160,230,220,0.08)';
          ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(190,245,235,0.18)';
          ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      } catch (e) {
        try { ctx.restore(); } catch (e2) {}
      }
    },

    drawForeground(ctx, t) {
      try {
        ctx.save();
        // Low creeping fog
        for (let i = 0; i < 3; i++) {
          const off = (t * (14 + i * 6) + i * 300) % (W + 400) - 200;
          const fg = ctx.createRadialGradient(off, FLOOR + 10, 10, off, FLOOR + 10, 220);
          fg.addColorStop(0, 'rgba(170,180,210,0.09)'); fg.addColorStop(1, 'rgba(170,180,210,0)');
          ctx.fillStyle = fg; ctx.fillRect(off - 220, FLOOR - 80, 440, 160);
        }
        // Lightning flash on everything (very soft)
        if (flash > 0) {
          ctx.fillStyle = `rgba(190,205,255,${flash * 0.08})`;
          ctx.fillRect(0, 0, W, H);
        }
        // Cobwebs in the top corners
        ctx.strokeStyle = 'rgba(200,200,220,0.12)'; ctx.lineWidth = 1;
        for (const side of [0, 1]) {
          const ox = side ? W : 0, sx = side ? -1 : 1;
          for (let i = 0; i <= 4; i++) {
            const a = (i / 4) * Math.PI / 2;
            ctx.beginPath(); ctx.moveTo(ox, 0); ctx.lineTo(ox + sx * Math.cos(a) * 90, Math.sin(a) * 90); ctx.stroke();
          }
          for (let r = 25; r <= 85; r += 20) {
            ctx.beginPath();
            for (let i = 0; i <= 4; i++) {
              const a = (i / 4) * Math.PI / 2;
              const x = ox + sx * Math.cos(a) * r, y = Math.sin(a) * r;
              if (i === 0) ctx.moveTo(x, y); else ctx.quadraticCurveTo(ox + sx * Math.cos(a - 0.2) * r * 0.85, Math.sin(a - 0.2) * r * 0.85, x, y);
            }
            ctx.stroke();
          }
        }
        // Vignette
        const vg = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 620);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,8,0.45)');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
        ctx.restore();
      } catch (e) {
        try { ctx.restore(); } catch (e2) {}
      }
    },
  };

  (window.STICK_ARENAS = window.STICK_ARENAS || []).push(arena);
})();
