// Arena 06: Pirate Ship (Tàu cướp biển)
// Night deck at sea. The ship rocks gently (horizon tilts, fighters drift a little
// downhill on deck, rigging platforms bob). Every ~9 s an enemy ship on the horizon
// fires a cannonball: a red target ring marks the landing spot 1.8 s before impact.
(function () {
  const W = 960, H = 540, FLOOR = 462;
  const MAST_X = 480;

  // rigging platforms (base positions; y bobs with the swell)
  const BASE = [
    { x: 130, y: 322, w: 170, h: 12 },  // port yardarm plank
    { x: 660, y: 322, w: 170, h: 12 },  // starboard yardarm plank
    { x: 420, y: 196, w: 120, h: 12 },  // crow's nest
  ];
  const platforms = BASE.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h }));

  // solid deck clutter: barrel stacks by each rail (sturdy), cargo crates at the mast foot (breakable)
  const CRATE_HP = 40;
  const obstacles = [
    { x: 70,  y: FLOOR - 58, w: 54, h: 58, kind: 'barrels' },
    { x: 836, y: FLOOR - 58, w: 54, h: 58, kind: 'barrels' },
    { x: 442, y: FLOOR - 64, w: 76, h: 64, kind: 'crates', hp: CRATE_HP },
  ];

  // ---------- swell ----------
  const ROCK_W = 0.55;                       // rad/s of the swell
  const rockAngle = t => Math.sin(t * ROCK_W) * 0.035;
  const DRIFT = 26;                          // px/s sideways drift on deck at full tilt

  // ---------- helpers ----------
  let seed = 61;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function mk() {
    try {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      return c;
    } catch (e) { return null; }
  }

  // ---------- static layers ----------
  let skyLayer = null, shipLayer = null;

  function paintSky() {
    const c = mk(); if (!c) return null;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 340);
    sky.addColorStop(0, '#0b1020');
    sky.addColorStop(0.6, '#1a1c38');
    sky.addColorStop(1, '#2a2440');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    seed = 61;
    for (let i = 0; i < 160; i++) {
      g.globalAlpha = 0.15 + rnd() * 0.5;
      g.fillStyle = '#e8ecff';
      const s = rnd() < 0.1 ? 2 : 1;
      g.fillRect(rnd() * W, rnd() * 300, s, s);
    }
    g.globalAlpha = 1;
    // moon
    const mx = 770, my = 130;
    const halo = g.createRadialGradient(mx, my, 10, mx, my, 120);
    halo.addColorStop(0, 'rgba(255,240,200,.22)'); halo.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = halo; g.fillRect(mx - 130, my - 130, 260, 260);
    g.fillStyle = '#e9e1c4'; g.beginPath(); g.arc(mx, my, 30, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(160,150,120,.35)';
    g.beginPath(); g.arc(mx - 9, my - 6, 6, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(mx + 10, my + 9, 4, 0, Math.PI * 2); g.fill();
    // thin clouds
    g.fillStyle = 'rgba(120,120,170,.10)';
    for (let i = 0; i < 6; i++) {
      g.beginPath(); g.ellipse(rnd() * W, 110 + rnd() * 120, 90 + rnd() * 120, 8 + rnd() * 8, 0, 0, Math.PI * 2); g.fill();
    }
    return c;
  }

  function paintShip() {
    const c = mk(); if (!c) return null;
    const g = c.getContext('2d');
    seed = 99;
    // bulwark (back railing wall) behind the deck
    g.fillStyle = '#2b1d16';
    g.fillRect(0, FLOOR - 46, W, 46);
    g.fillStyle = '#3a2619';
    g.fillRect(0, FLOOR - 50, W, 8);           // cap rail
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 2;
    for (let x = 20; x < W; x += 64) { g.beginPath(); g.moveTo(x, FLOOR - 42); g.lineTo(x, FLOOR); g.stroke(); }
    // gun ports (closed) on bulwark
    for (const x of [90, 300, 640, 850]) {
      g.fillStyle = '#1a110c'; g.fillRect(x - 16, FLOOR - 36, 32, 22);
      g.strokeStyle = '#4a3222'; g.lineWidth = 2; g.strokeRect(x - 16, FLOOR - 36, 32, 22);
    }
    // deck planks
    const deck = g.createLinearGradient(0, FLOOR, 0, H);
    deck.addColorStop(0, '#5a3d27'); deck.addColorStop(1, '#2e1f15');
    g.fillStyle = deck; g.fillRect(0, FLOOR, W, H - FLOOR);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.5;
    for (let y = FLOOR + 12; y < H; y += 13) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
    for (let row = 0; row < 7; row++) {
      const y = FLOOR + row * 13;
      for (let x = (row * 47) % 120; x < W; x += 120 + rnd() * 30) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 13); g.stroke(); }
    }
    // deck edge highlight
    g.strokeStyle = 'rgba(236,210,170,.55)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, FLOOR + 1); g.lineTo(W, FLOOR + 1); g.stroke();
    // grating hatch and barrels as low deck props (flat, below feet line)
    g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(410, FLOOR + 18, 140, 40);
    g.strokeStyle = 'rgba(160,120,80,.4)'; g.lineWidth = 1;
    for (let x = 418; x < 550; x += 10) { g.beginPath(); g.moveTo(x, FLOOR + 18); g.lineTo(x, FLOOR + 58); g.stroke(); }
    for (let y = FLOOR + 26; y < FLOOR + 58; y += 10) { g.beginPath(); g.moveTo(410, y); g.lineTo(550, y); g.stroke(); }

    // mast
    const mg = g.createLinearGradient(MAST_X - 12, 0, MAST_X + 12, 0);
    mg.addColorStop(0, '#2a1a10'); mg.addColorStop(0.5, '#4d3220'); mg.addColorStop(1, '#2a1a10');
    g.fillStyle = mg; g.fillRect(MAST_X - 11, 20, 22, FLOOR - 20);
    g.fillStyle = '#1e140d';
    for (const y of [110, 250, 380]) g.fillRect(MAST_X - 13, y, 26, 6);  // iron bands
    // main yard and furled sail
    g.fillStyle = '#3b2717'; g.fillRect(150, 268, 660, 9);
    g.fillStyle = '#6d6252';
    g.beginPath(); g.moveTo(160, 277);
    for (let x = 160; x <= 800; x += 40) g.quadraticCurveTo(x + 20, 292, x + 40, 277);
    g.lineTo(800, 277); g.closePath(); g.fill();
    // top yard
    g.fillStyle = '#3b2717'; g.fillRect(330, 140, 300, 7);
    g.fillStyle = '#5f5546';
    g.beginPath(); g.moveTo(340, 147);
    for (let x = 340; x <= 610; x += 30) g.quadraticCurveTo(x + 15, 158, x + 30, 147);
    g.lineTo(620, 147); g.closePath(); g.fill();
    // shrouds / rigging
    g.strokeStyle = 'rgba(200,180,140,.22)'; g.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
      g.beginPath(); g.moveTo(MAST_X - 8, 150 + i * 6); g.lineTo(40 + i * 22, FLOOR - 50); g.stroke();
      g.beginPath(); g.moveTo(MAST_X + 8, 150 + i * 6); g.lineTo(W - 40 - i * 22, FLOOR - 50); g.stroke();
    }
    // ratlines
    g.strokeStyle = 'rgba(200,180,140,.12)'; g.lineWidth = 1;
    for (let k = 1; k < 9; k++) {
      const f = k / 9;
      g.beginPath(); g.moveTo(MAST_X - 8 + (40 - MAST_X + 8) * f, 150 + (FLOOR - 200) * f); g.lineTo(MAST_X - 8 + (150 - MAST_X + 8) * f, 180 + (FLOOR - 230) * f); g.stroke();
      g.beginPath(); g.moveTo(MAST_X + 8 + (W - 40 - MAST_X - 8) * f, 150 + (FLOOR - 200) * f); g.lineTo(MAST_X + 8 + (W - 150 - MAST_X - 8) * f, 180 + (FLOOR - 230) * f); g.stroke();
    }
    return c;
  }

  function ensureLayers() {
    if (!skyLayer) skyLayer = paintSky();
    if (!shipLayer) shipLayer = paintShip();
  }

  // ---------- cannon hazard ----------
  const AIM = 0.7, FLY = 1.1;               // telegraph = AIM + FLY = 1.8 s
  const RADIUS = 80;
  let shot = null;                           // { side, tx, t, x0, y0, done }
  let nextShot = 6, targetSlot = 0, booms = [];
  const hitCd = [0, 0];
  let clock = 0;

  function fire(fighters, game) {
    const f = fighters[targetSlot % 2] || fighters[0];
    targetSlot++;
    const fx = f && isFinite(f.x) ? f.x : 480;
    const tx = clamp(fx + (Math.random() - 0.5) * 120, 90, 870);
    const side = tx > 480 ? -1 : 1;           // fire from the far side so it crosses the stage
    shot = { side, tx, t: 0, x0: side < 0 ? -40 : W + 40, y0: 250 };
  }

  function impact(fighters, game) {
    const x = shot.tx, y = FLOOR;
    booms.push({ x, y, t: 0 });
    if (game.shake) game.shake(10);
    if (game.particle) {
      for (let i = 0; i < 26; i++) {
        const a = -Math.PI * Math.random(), s = 120 + Math.random() * 320;
        game.particle({ x, y: y - 4, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6, col: Math.random() < 0.5 ? '#ffb347' : '#ff6a3d', r: 3 + Math.random() * 3 });
      }
      for (let i = 0; i < 12; i++) {
        game.particle({ x: x + (Math.random() - 0.5) * 60, y: y - 10, vx: (Math.random() - 0.5) * 300, vy: -200 - Math.random() * 250, life: 0.8, col: '#8a5a36', r: 3 });
      }
      for (let i = 0; i < 10; i++) {
        game.particle({ x: x + (Math.random() - 0.5) * 50, y: y - 20, vx: (Math.random() - 0.5) * 40, vy: -40 - Math.random() * 40, life: 1.0, col: '#6b6b78', r: 6, float: true });
      }
    }
    // a cannonball landing on the cargo smashes it open
    for (const o of obstacles) {
      if (o.hp == null || o.hp <= 0) continue;
      if (x > o.x - 40 && x < o.x + o.w + 40) {
        o.hp = Math.max(0, o.hp - 25);
        if (o.hp <= 0 && game.particle) {
          for (let i = 0; i < 14; i++) game.particle({ x: o.x + Math.random() * o.w, y: o.y + Math.random() * o.h, vx: (Math.random() - 0.5) * 360, vy: -150 - Math.random() * 250, life: 0.8, col: '#8a5a36', r: 4 });
        }
      }
    }
    for (const f of fighters) {
      if (!f || f.ko) continue;
      const slot = f.slot === 1 ? 1 : 0;
      const dx = f.x - x, dy = (f.y - 50) - y;
      if (Math.hypot(dx, dy) < RADIUS && hitCd[slot] <= 0 && game.fighting && game.hurt) {
        hitCd[slot] = 1.2;
        game.hurt(f, { dmg: 10, kb: 280, fromX: x, stun: 0.35, heavy: true, word: 'BOOM' });
      }
    }
    if (!game.particle && game.word) game.word(x, y - 60, 'BOOM', '#ffb347');
  }

  function shotPos(s) {
    const u = clamp((s.t - AIM) / FLY, 0, 1);
    return {
      u,
      x: s.x0 + (s.tx - s.x0) * u,
      y: s.y0 + (FLOOR - 8 - s.y0) * u - 200 * 4 * u * (1 - u),
    };
  }

  // ---------- drawing pieces ----------
  function drawSea(ctx, t) {
    const a = -rockAngle(t);
    ctx.save();
    ctx.translate(480, 420); ctx.rotate(a); ctx.translate(-480, -420);
    const hz = 300;
    const sea = ctx.createLinearGradient(0, hz, 0, 560);
    sea.addColorStop(0, '#1d2a4a'); sea.addColorStop(1, '#0c1426');
    ctx.fillStyle = sea; ctx.fillRect(-120, hz, W + 240, 400);
    // moon glitter
    ctx.fillStyle = 'rgba(233,225,196,.18)';
    for (let i = 0; i < 9; i++) {
      const y = hz + 6 + i * 13, w = 18 + i * 8 + Math.sin(t * 2 + i) * 6;
      ctx.fillRect(770 - w / 2 + Math.sin(t * 1.3 + i * 2) * 6, y, w, 2);
    }
    // wave lines
    ctx.strokeStyle = 'rgba(140,170,220,.16)'; ctx.lineWidth = 1.5;
    for (let r = 0; r < 6; r++) {
      const y = hz + 10 + r * 24, sp = 0.6 + r * 0.25;
      ctx.beginPath();
      for (let x = -120; x <= W + 120; x += 20) {
        const yy = y + Math.sin(x * 0.03 + t * sp + r) * (2 + r * 0.6);
        x === -120 ? ctx.moveTo(x, yy) : ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // enemy ships on the horizon
    drawEnemy(ctx, 110 + Math.sin(t * 0.1) * 10, hz, t, shot && shot.side === 1 ? shot : null);
    drawEnemy(ctx, 850 + Math.sin(t * 0.12 + 1) * 10, hz, t, shot && shot.side === -1 ? shot : null);
    ctx.restore();
  }

  function drawEnemy(ctx, x, hz, t, s) {
    const bob = Math.sin(t * 1.1 + x) * 1.5;
    ctx.save(); ctx.translate(x, hz + bob);
    ctx.fillStyle = '#0a0e1a';
    ctx.beginPath(); ctx.moveTo(-34, -6); ctx.lineTo(34, -6); ctx.lineTo(26, 4); ctx.lineTo(-26, 4); ctx.closePath(); ctx.fill();
    ctx.fillRect(-1.5, -42, 3, 36);
    ctx.beginPath(); ctx.moveTo(2, -40); ctx.lineTo(18, -14); ctx.lineTo(2, -12); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-2, -38); ctx.lineTo(-16, -14); ctx.lineTo(-2, -12); ctx.fill();
    if (s && s.t < AIM + 0.15) {
      // muzzle flash / smoke while aiming
      const k = s.t < AIM ? 0.5 + 0.5 * Math.sin(s.t * 30) : 1 - (s.t - AIM) / 0.15;
      ctx.fillStyle = `rgba(255,170,80,${0.6 * k})`;
      ctx.beginPath(); ctx.arc(0, -4, 10 + 6 * k, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawPlatform(ctx, p, t, i) {
    ctx.save();
    // ropes up to the mast top / yard
    ctx.strokeStyle = 'rgba(210,190,150,.35)'; ctx.lineWidth = 1.5;
    if (i < 2) {
      ctx.beginPath(); ctx.moveTo(p.x + 8, p.y); ctx.lineTo(p.x + 8, 277); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p.x + p.w - 8, p.y); ctx.lineTo(p.x + p.w - 8, 277); ctx.stroke();
    }
    if (i === 2) {
      // crow's nest basket below the standing edge
      ctx.fillStyle = '#3d281a';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y + 2); ctx.lineTo(p.x + p.w, p.y + 2);
      ctx.lineTo(p.x + p.w - 14, p.y + 40); ctx.lineTo(p.x + 14, p.y + 40); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 1.5;
      for (let k = 1; k < 6; k++) { const xx = p.x + (p.w / 6) * k; ctx.beginPath(); ctx.moveTo(xx, p.y + 2); ctx.lineTo(xx + (p.x + p.w / 2 - xx) * 0.2, p.y + 40); ctx.stroke(); }
    }
    // plank
    ctx.fillStyle = '#6a4a2f'; ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fillRect(p.x, p.y + p.h - 3, p.w, 3);
    ctx.strokeStyle = 'rgba(240,215,170,.6)'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(p.x, p.y + 1); ctx.lineTo(p.x + p.w, p.y + 1); ctx.stroke();
    ctx.restore();
  }

  function drawFlag(ctx, t) {
    ctx.save();
    ctx.translate(MAST_X + 10, 86);
    ctx.fillStyle = '#121212';
    ctx.beginPath(); ctx.moveTo(0, 0);
    for (let x = 0; x <= 56; x += 8) ctx.lineTo(x, Math.sin(t * 4 - x * 0.12) * 3);
    for (let x = 56; x >= 0; x -= 8) ctx.lineTo(x, 34 + Math.sin(t * 4 - x * 0.12) * 3);
    ctx.closePath(); ctx.fill();
    // skull
    const sy = 15 + Math.sin(t * 4 - 28 * 0.12) * 3;
    ctx.fillStyle = 'rgba(230,225,210,.75)';
    ctx.beginPath(); ctx.arc(28, sy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(25, sy + 3, 6, 5);
    ctx.strokeStyle = 'rgba(230,225,210,.6)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(19, sy + 4); ctx.lineTo(37, sy + 12); ctx.moveTo(37, sy + 4); ctx.lineTo(19, sy + 12); ctx.stroke();
    ctx.restore();
  }

  function drawLantern(ctx, x, y, t) {
    const a = rockAngle(t) * 6;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.strokeStyle = 'rgba(200,180,140,.4)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 22); ctx.stroke();
    const glow = ctx.createRadialGradient(0, 32, 2, 0, 32, 46);
    glow.addColorStop(0, 'rgba(255,190,90,.35)'); glow.addColorStop(1, 'rgba(255,190,90,0)');
    ctx.fillStyle = glow; ctx.fillRect(-46, -14, 92, 92);
    ctx.fillStyle = '#2a1d12'; ctx.fillRect(-7, 22, 14, 3); ctx.fillRect(-7, 40, 14, 3);
    ctx.fillStyle = 'rgba(255,200,110,.85)'; ctx.fillRect(-5, 25, 10, 15);
    ctx.restore();
  }

  function drawCannon(ctx, t) {
    if (shot) {
      const pulse = 0.5 + 0.5 * Math.sin(shot.t * 14);
      const k = clamp(shot.t / (AIM + FLY), 0, 1);
      // target ring on deck, shrinking as impact nears
      ctx.save();
      ctx.strokeStyle = `rgba(255,90,60,${0.7 + 0.3 * pulse})`;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(shot.tx, FLOOR + 6, RADIUS * (1.15 - 0.35 * k), 12 * (1.15 - 0.35 * k), 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(255,80,60,${0.18 + 0.16 * pulse})`;
      ctx.beginPath(); ctx.ellipse(shot.tx, FLOOR + 6, RADIUS * 0.8, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = `rgba(255,120,90,${0.6 + 0.4 * pulse})`;
      ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('!', shot.tx, FLOOR - 14);
      // ball
      if (shot.t >= AIM) {
        const p = shotPos(shot);
        ctx.fillStyle = 'rgba(255,170,80,.25)';
        ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#15151b';
        ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,200,140,.7)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, 10, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }
    for (const b of booms) {
      const k = b.t / 0.5;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - k);
      ctx.fillStyle = '#ffb347';
      ctx.beginPath(); ctx.arc(b.x, b.y - 10, 20 + 70 * k, Math.PI, 0); ctx.fill();
      ctx.restore();
      // scorch
      ctx.save(); ctx.globalAlpha = 0.35 * Math.max(0, 1 - b.t / 4);
      ctx.fillStyle = '#120a06';
      ctx.beginPath(); ctx.ellipse(b.x, FLOOR + 10, 50, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  function drawBarrel(ctx, x, y, w, h) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#3a2414'); g.addColorStop(0.45, '#6e4826'); g.addColorStop(1, '#2e1c10');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + 3, y); ctx.lineTo(x + w - 3, y);
    ctx.quadraticCurveTo(x + w + 2, y + h / 2, x + w - 3, y + h);
    ctx.lineTo(x + 3, y + h);
    ctx.quadraticCurveTo(x - 2, y + h / 2, x + 3, y);
    ctx.fill();
    ctx.fillStyle = '#1c1612';
    ctx.fillRect(x, y + h * 0.18, w, 3); ctx.fillRect(x, y + h * 0.78, w, 3);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
    for (let k = 1; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x + (w / 4) * k, y + 2); ctx.lineTo(x + (w / 4) * k, y + h - 2); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(240,210,160,.45)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + 3, y + 1); ctx.lineTo(x + w - 3, y + 1); ctx.stroke();
  }

  function drawCrate(ctx, x, y, w, h, dmg) {
    ctx.fillStyle = '#7a5532'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#3b2716'; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x + 3, y + 3); ctx.lineTo(x + w - 3, y + h - 3); ctx.moveTo(x + w - 3, y + 3); ctx.lineTo(x + 3, y + h - 3); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 1;
    for (let yy = y + 8; yy < y + h - 4; yy += 8) { ctx.beginPath(); ctx.moveTo(x + 3, yy); ctx.lineTo(x + w - 3, yy); ctx.stroke(); }
    // cracks as it takes damage
    if (dmg > 0.3) {
      ctx.strokeStyle = 'rgba(20,10,4,.85)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(x + w * 0.3, y); ctx.lineTo(x + w * 0.42, y + h * 0.45); ctx.lineTo(x + w * 0.35, y + h * 0.7); ctx.stroke();
    }
    if (dmg > 0.6) {
      ctx.beginPath(); ctx.moveTo(x + w, y + h * 0.3); ctx.lineTo(x + w * 0.7, y + h * 0.5); ctx.lineTo(x + w * 0.75, y + h); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(240,210,160,.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x, y + 1); ctx.lineTo(x + w, y + 1); ctx.stroke();
  }

  function drawObstacle(ctx, o, t) {
    if (!o || !(o.w > 0) || !(o.h > 0)) return;
    ctx.save();
    // contact shadow on the deck
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.beginPath(); ctx.ellipse(o.x + o.w / 2, o.y + o.h + 3, o.w * 0.6, 5, 0, 0, Math.PI * 2); ctx.fill();
    if (o.kind === 'barrels') {
      const bw = o.w / 2, bh = o.h * 0.58;
      drawBarrel(ctx, o.x, o.y + o.h - bh, bw, bh);
      drawBarrel(ctx, o.x + bw, o.y + o.h - bh, bw, bh);
      drawBarrel(ctx, o.x + bw * 0.5, o.y, bw, o.h - bh);
    } else if (o.kind === 'crates') {
      if (o.hp != null && o.hp <= 0) {
        // splintered remains, flat on the deck
        ctx.fillStyle = '#5a3d22';
        ctx.save(); ctx.translate(o.x + 14, o.y + o.h - 4); ctx.rotate(0.15); ctx.fillRect(0, 0, 34, 5); ctx.restore();
        ctx.save(); ctx.translate(o.x + 36, o.y + o.h - 8); ctx.rotate(-0.25); ctx.fillRect(0, 0, 30, 5); ctx.restore();
        ctx.fillRect(o.x + 4, o.y + o.h - 3, 18, 3);
        ctx.fillRect(o.x + o.w - 20, o.y + o.h - 3, 16, 3);
      } else {
        const dmg = o.hp != null ? 1 - o.hp / CRATE_HP : 0;
        const half = o.h / 2;
        drawCrate(ctx, o.x, o.y + half, o.w, half, dmg);
        drawCrate(ctx, o.x + 6, o.y, o.w - 12, half, dmg);
      }
    }
    ctx.restore();
  }

  // ---------- arena ----------
  const arena = {
    id: 'arena06',
    name: 'Pirate Ship',
    nameVi: 'Tàu cướp biển',
    hint: 'Rocking deck, cannon fire',
    hintVi: 'Boong tàu lắc, đạn pháo',
    floorY: FLOOR,
    gravityScale: 1,
    platforms,
    obstacles,

    reset() {
      shot = null; booms = []; nextShot = 6; targetSlot = Math.random() < 0.5 ? 0 : 1;
      hitCd[0] = hitCd[1] = 0;
      for (let i = 0; i < BASE.length; i++) { platforms[i].x = BASE[i].x; platforms[i].y = BASE[i].y; }
      // the engine restores hp itself; this keeps a standalone load correct too
      obstacles[2].hp = CRATE_HP;
    },

    update(dt, fighters, game) {
      try {
        if (!(dt > 0)) return;
        dt = Math.min(dt, 0.05);
        fighters = fighters || [];
        game = game || {};
        clock += dt;
        const now = clock;
        // swell: platforms bob, fighters on the deck drift slightly downhill
        for (let i = 0; i < BASE.length; i++) {
          const amp = i === 2 ? 6 : 4;
          platforms[i].y = BASE[i].y + Math.sin(now * ROCK_W * 2 + i * 1.7) * amp;
          if (i === 2) platforms[i].x = BASE[i].x + Math.sin(now * ROCK_W) * 8;
        }
        const tilt = Math.sin(now * ROCK_W);
        for (const f of fighters) {
          if (!f || f.ko || !f.onGround) continue;
          if (Math.abs(f.y - FLOOR) > 2) continue;
          f.x = clamp(f.x + tilt * DRIFT * dt, 28, W - 28);
        }
        hitCd[0] = Math.max(0, hitCd[0] - dt);
        hitCd[1] = Math.max(0, hitCd[1] - dt);
        for (let i = booms.length - 1; i >= 0; i--) { booms[i].t += dt; if (booms[i].t > 4) booms.splice(i, 1); }

        const live = game.state === 'fight' || game.state === 'menu';
        if (shot) {
          shot.t += dt;
          if (shot.t >= AIM + FLY) { impact(fighters, game); shot = null; }
        } else if (live) {
          nextShot -= dt;
          if (nextShot <= 0) { fire(fighters, game); nextShot = 8 + Math.random() * 4; }
        }
      } catch (e) { /* never break the game loop */ }
    },

    drawBackground(ctx, t) {
      try {
        ensureLayers();
        ctx.save();
        if (skyLayer) ctx.drawImage(skyLayer, 0, 0); else { ctx.fillStyle = '#121830'; ctx.fillRect(0, 0, W, H); }
        drawSea(ctx, t);
        if (shipLayer) ctx.drawImage(shipLayer, 0, 0);
        drawFlag(ctx, t);
        for (let i = 0; i < platforms.length; i++) drawPlatform(ctx, platforms[i], t, i);
        drawLantern(ctx, 240, 277, t);
        drawLantern(ctx, 720, 277, t);
        for (const o of obstacles) drawObstacle(ctx, o, t);
        drawCannon(ctx, t);
        ctx.restore();
        ctx.globalAlpha = 1;
      } catch (e) { try { ctx.restore(); } catch (_) {} }
    },

    drawForeground(ctx, t) {
      try {
        ctx.save();
        // edge vignette
        const v = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 620);
        v.addColorStop(0, 'rgba(0,0,10,0)'); v.addColorStop(1, 'rgba(0,0,10,.45)');
        ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);
        // light sea spray drifting over the rails
        ctx.fillStyle = 'rgba(200,220,255,.18)';
        for (let i = 0; i < 18; i++) {
          const ph = (t * (0.3 + (i % 5) * 0.07) + i * 0.137) % 1;
          const x = (i * 211 + t * 30) % (W + 40) - 20;
          const y = FLOOR - 30 - ph * 120;
          ctx.globalAlpha = 0.6 * Math.sin(ph * Math.PI);
          ctx.fillRect(x, y, 2, 2);
        }
        ctx.globalAlpha = 1;
        // foreground rope silhouettes at the corners
        ctx.strokeStyle = 'rgba(20,12,8,.8)'; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(-10, 90); ctx.quadraticCurveTo(40, 200 + rockAngle(t) * 400, 20, H); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(W + 10, 90); ctx.quadraticCurveTo(W - 40, 200 - rockAngle(t) * 400, W - 20, H); ctx.stroke();
        ctx.restore();
      } catch (e) { try { ctx.restore(); } catch (_) {} }
    },
  };

  arena.reset();
  (window.STICK_ARENAS = window.STICK_ARENAS || []).push(arena);
})();
