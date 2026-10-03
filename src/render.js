// Stick Fight · src/render.js
// Drawing: fighter poses, stick figures, HUD, projectiles and the frame.
// Shares one scope with the other src files; build.py wraps them all in a single closure.

// ---------- drawing ----------
const lerp = (a, b, t) => a + (b - a) * t;
function attackExt(f) {
  if (!f.atk) return 0;
  const A = ATTACKS[f.atk.type], t = f.atk.t;
  if (t < A.on) return t / A.on;
  if (t < A.off) return 1;
  return Math.max(0, 1 - (t - A.off) / (A.dur - A.off));
}
function pose(f) {
  // angles in radians from straight down; positive points toward the facing side
  const P = {
    lean: 0, drop: Math.sin(f.t * 4) * 1.5,
    la: [0.5, 2.4], ra: [0.2, 2.6], // lead arm, rear arm: [upper, forearm]
    ll: [0.28, -0.02], rl: [-0.28, -0.4], // lead leg, rear leg: [thigh, shin]
  };
  if (f.ko) {
    P.la = [-1.2, -1.6]; P.ra = [-1.8, -2.2]; P.ll = [0.3, 0.1]; P.rl = [-0.1, -0.2]; P.drop = 0;
    return P;
  }
  if (!f.onGround) {
    const tuck = f.vy < 0 ? 1 : 0.5;
    P.ll = [0.9 * tuck + 0.2, -0.5]; P.rl = [0.2, -1.0 * tuck]; P.la = [1.2, 2.2]; P.ra = [-0.6, 0.6]; P.drop = 0;
  } else if (Math.abs(f.vx) > 40 && !f.atk && f.hurt <= 0) {
    const s = Math.sin(f.walk), c = Math.cos(f.walk);
    P.ll = [s * 0.55, s * 0.55 - 0.35 - Math.max(0, c) * 0.6];
    P.rl = [-s * 0.55, -s * 0.55 - 0.35 - Math.max(0, -c) * 0.6];
    P.la = [0.5 - s * 0.2, 2.3]; P.ra = [0.2 + s * 0.2, 2.5];
    P.drop = Math.abs(c) * 3;
  }
  if (f.blocking) { P.la = [1.25, 2.95]; P.ra = [1.0, 2.85]; P.ll = [0.55, -0.25]; P.rl = [-0.2, -0.75]; P.drop = 8; }
  if (f.hurt > 0) { P.lean = -0.35; P.la = [-0.6, -0.2]; P.ra = [-1.0, -0.6]; }
  if (f.cast > 0) {
    if (f.castKind === 'throw') { P.la = [1.6, 1.55]; P.ra = [-0.5, 0.2]; P.lean = 0.1; }
    else if (f.castKind === 'raise') { P.la = [2.7, 3.0]; P.ra = [2.5, 2.9]; }
    else if (f.castKind === 'flex') { P.la = [1.4, 3.0]; P.ra = [-1.4, -3.0]; P.drop = 6; }
  }
  // skill poses (dash, bite, flurry, slam...) come from the character file
  if (f.hurt <= 0 && !(f.cast > 0)) f.ch.pose?.(f, P);
  if (f.atk) {
    const e = attackExt(f);
    if (f.atk.type === 'punch') {
      P.la = [lerp(0.5, 1.55, e), lerp(2.4, 1.57, e)];
      P.ra = [0.1, 2.7]; P.lean = 0.12 * e;
      if (f.onGround) { P.ll = [0.45, 0.1]; P.rl = [-0.45, -0.5]; }
    } else {
      P.ll = [lerp(0.28, 1.45, e), lerp(-0.02, 1.6, e)];
      if (f.onGround) P.rl = [-0.12, -0.2];
      P.lean = -0.28 * e; P.la = [lerp(0.5, 1.0, e), 2.6]; P.ra = [lerp(0.2, -0.9, e), -0.3];
    }
  }
  return P;
}
const seg = (x, y, a, len, s) => [x + Math.sin(a) * len * s, y + Math.cos(a) * len];

function chalkPath(g, pts, col, w) {
  g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke();
}

// per-character headgear and props come from characters/<id>.js drawGear(g, f, gear)
function drawGear(g, f, head, neck, hip, s, col) {
  if (!f.ch.drawGear) return;
  const [hx, hy] = head;
  const gear = { hx, hy, head, neck, hip, s, col, P: (x, y) => [hx + x * s, hy + y],
    wave: Math.sin(f.t * 14) * 3, trail: Math.min(18, 8 + Math.abs(f.vx) * 0.03) };
  g.save();
  f.ch.drawGear(g, f, gear);
  g.restore();
}

// draws a fighter at its own x/y; g is any 2D context already in board units
function drawFighter(g, f, opts = {}) {
  const s = f.facing, P = pose(f), thick = f.ch.thick || 1;
  const col = f.flash > 0 ? '#ffffff' : f.slowT > 0 ? '#c8f0ff' : f.color;
  if (!opts.portrait) {
    const sy = f.surfaceBelow(), hgt = Math.max(0, sy - f.y);
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath(); g.ellipse(f.x, sy + 3, Math.max(8, 26 - hgt * 0.06), 5, 0, 0, Math.PI * 2); g.fill();
  }
  g.save();
  g.translate(f.x, f.y);
  if (f.ko) {
    const k = Math.min(1, f.koT * 2.6);
    g.translate(0, -16 * k);
    g.rotate(-s * (Math.PI / 2) * k);
  }
  const hip = [0, -62 + P.drop];
  const legs = [P.rl, P.ll].map(([th, sh]) => {
    const knee = seg(hip[0], hip[1], th, 32, s);
    return [hip, knee, seg(knee[0], knee[1], sh, 32, s)];
  });
  const neck = [hip[0] + Math.sin(P.lean) * 42 * s, hip[1] - Math.cos(P.lean) * 42];
  const head = [hip[0] + Math.sin(P.lean) * 58 * s, hip[1] - Math.cos(P.lean) * 58];
  const sh = [neck[0] + Math.sin(P.lean) * 4 * s, neck[1] + 4];
  const arms = [P.ra, P.la].map(([up, lo]) => {
    const elb = seg(sh[0], sh[1], up, 26, s);
    return [sh, elb, seg(elb[0], elb[1], lo, 24, s)];
  });

  if (f.ch.gearBehind) drawGear(g, f, head, neck, hip, s, col); // capes sit behind the body
  g.shadowColor = f.color; g.shadowBlur = 8;
  g.globalAlpha = 0.7;
  chalkPath(g, legs[0], col, 6 * thick); chalkPath(g, arms[0], col, 6 * thick);
  g.globalAlpha = 1;
  chalkPath(g, [hip, neck], col, 7 * thick);
  chalkPath(g, legs[1], col, 6.5 * thick);
  chalkPath(g, arms[1], col, 6.5 * thick);
  g.fillStyle = col;
  for (const a of arms) { g.beginPath(); g.arc(a[2][0], a[2][1], 4.5 * thick, 0, Math.PI * 2); g.fill(); }
  g.lineWidth = 6; g.strokeStyle = col;
  g.beginPath(); g.arc(head[0], head[1], 13, 0, Math.PI * 2); g.stroke();
  g.shadowBlur = 0;
  if (!f.ch.gearBehind) drawGear(g, f, head, neck, hip, s, col);
  if (f.ko) {
    chalkPath(g, [[head[0] + 2 * s, head[1] - 5], [head[0] + 8 * s, head[1] + 1]], col, 2);
    chalkPath(g, [[head[0] + 8 * s, head[1] - 5], [head[0] + 2 * s, head[1] + 1]], col, 2);
  } else if (!f.ch.hideEye) { g.fillStyle = col; g.fillRect(head[0] + 5 * s - 1.5, head[1] - 3, 3, 3); }
  // iron skin shell
  if (f.armorT > 0) {
    g.save();
    g.setLineDash([8, 7]); g.lineDashOffset = -f.t * 40;
    g.globalAlpha = 0.5 + 0.3 * Math.sin(f.t * 10);
    g.strokeStyle = '#c9d2e6'; g.lineWidth = 3;
    g.beginPath(); g.ellipse(0, -70, 38, 82, 0, 0, Math.PI * 2); g.stroke();
    g.restore();
  }
  g.restore();

  if (opts.tag) {
    g.font = `16px ${FONT_B}`; g.textAlign = 'center'; g.fillStyle = f.slot === 0 ? C.p1 : C.p2;
    g.globalAlpha = 0.9;
    g.fillText(opts.tag, f.x, f.y - 150 + P.drop - (f.ch.tagLift || 0));
    g.globalAlpha = 1;
  }
}

function drawPortrait(canvas, ch) {
  const g = canvas.getContext('2d');
  const k = canvas.width / 100;
  g.setTransform(k, 0, 0, k, 0, 0);
  const f = new Fighter(0); f.setChar(ch); f.reset(50, 1); f.t = 1.3;
  g.translate(0, 0);
  g.save(); g.translate(50, 118); g.scale(0.62, 0.62); g.translate(-50, -FLOOR);
  f.y = FLOOR;
  drawFighter(g, f, { portrait: true });
  g.restore();
}

function roughRect(x, y, w, h) {
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + 0.5); ctx.lineTo(x + w - 0.5, y + h); ctx.lineTo(x, y + h - 0.5); ctx.closePath();
}
function drawHUD() {
  const bw = 340, bh = 20, top = 22;
  for (const [f, x, dir] of [[p1, 40, 1], [p2, W - 40 - bw, -1]]) {
    ctx.fillStyle = 'rgba(0,0,0,.35)'; roughRect(x, top, bw, bh); ctx.fill();
    const fill = (v, col, y = top, h = bh, w0 = bw) => {
      const w = w0 * Math.max(0, Math.min(1, v));
      ctx.fillStyle = col;
      // health drains toward the center timer
      if (dir === 1) roughRect(x + bw - w, y, w, h); else roughRect(x, y, w, h);
      ctx.fill();
    };
    fill(f.ghost / f.maxHp, 'rgba(236,235,226,.55)');
    fill(f.hp / f.maxHp, f.hp < f.maxHp * 0.25 ? C.gold : f.color);
    ctx.strokeStyle = C.chalk; ctx.lineWidth = 2.5; roughRect(x, top, bw, bh); ctx.stroke();
    // skill meter
    const sw = 150, sx = dir === 1 ? x + bw - sw : x, sy = top + bh + 6;
    const ready = f.skillCd <= 0;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; roughRect(sx, sy, sw, 7); ctx.fill();
    ctx.fillStyle = ready ? C.gold : 'rgba(243,211,91,.45)';
    const fw = sw * (1 - f.skillCd / f.ch.cd);
    if (dir === 1) roughRect(sx + sw - fw, sy, fw, 7); else roughRect(sx, sy, fw, 7);
    ctx.fill();
    ctx.font = `15px ${FONT_B}`; ctx.fillStyle = ready ? C.gold : C.dim;
    ctx.textAlign = dir === 1 ? 'right' : 'left';
    ctx.fillText(state === 'menu' ? '' : (ready ? `${f.ch.skillName} ready` : f.ch.skillName), dir === 1 ? sx - 8 : sx + sw + 8, sy + 8);
    ctx.font = `20px ${FONT_D}`; ctx.fillStyle = f.color;
    ctx.textAlign = dir === 1 ? 'left' : 'right';
    ctx.fillText(state === 'menu' ? '' : `${f.ch.name}`, dir === 1 ? x : x + bw, top + bh + 30);
    ctx.font = `15px ${FONT_B}`; ctx.fillStyle = f.slot === 0 ? C.p1 : C.p2;
    if (state !== 'menu') ctx.fillText(label(f), dir === 1 ? x : x + bw, top + bh + 48);
    for (let i = 0; i < WINS_NEEDED; i++) {
      const px = dir === 1 ? x + bw - 10 - i * 22 : x + 10 + i * 22, py = top + bh + 28;
      ctx.beginPath(); ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.strokeStyle = C.chalk; ctx.lineWidth = 2; ctx.stroke();
      if (f.wins > i) { ctx.fillStyle = C.gold; ctx.fill(); }
    }
  }
  ctx.textAlign = 'center';
  ctx.font = `38px ${FONT_D}`;
  ctx.fillStyle = timer <= 10 && state === 'fight' ? C.gold : C.chalk;
  ctx.fillText(state === 'menu' ? '' : String(Math.ceil(timer)), W / 2, top + 30);
  if (muted && state !== 'menu') { ctx.font = `14px ${FONT_B}`; ctx.fillStyle = C.dim; ctx.fillText('sound off', W / 2, top + 50); }
}

function drawShots() {
  for (const e of effects) { ctx.save(); if (e.draw) e.draw(ctx); else e.ch?.effectDraw?.(ctx, e); ctx.restore(); }
  for (const s of shots) { ctx.save(); if (s.draw) s.draw(ctx, s); else s.ch?.shotDraw?.(ctx, s); ctx.restore(); }
for (const r of rings) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, r.life / 0.45);
    ctx.strokeStyle = r.col; ctx.lineWidth = 4;
    ctx.beginPath();
    if (r.flat) ctx.ellipse(r.x, r.y, r.r, r.r * 0.15, 0, 0, Math.PI * 2);
    else ctx.arc(r.x, r.y, r.r * 0.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function draw() {
  if (state === 'select' || state === 'arena' || state === 'lobby') return;
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  if (!arenaCall('drawBackground', ctx, now)) ctx.drawImage(bg, 0, 0);
  const showTags = state !== 'menu';
  const order = p1.ko ? [p1, p2] : [p2, p1];
  for (const f of order) drawFighter(ctx, f, { tag: showTags && !f.ko ? shortLabel(f) : null });
  drawShots();
  drawObstacleBars();
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.col;
    ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
  }
  ctx.globalAlpha = 1;
  for (const w of words) {
    ctx.save();
    ctx.translate(w.x, w.y); ctx.rotate(w.rot);
    const k = Math.min(1, (0.7 - w.life) * 10);
    ctx.scale(0.6 + 0.4 * k, 0.6 + 0.4 * k);
    ctx.globalAlpha = Math.min(1, w.life * 3);
    ctx.font = `30px ${FONT_D}`; ctx.textAlign = 'center';
    ctx.lineWidth = 6; ctx.strokeStyle = C.ink; ctx.strokeText(w.text, 0, 0);
    ctx.fillStyle = w.col; ctx.fillText(w.text, 0, 0);
    ctx.restore();
  }
  ctx.restore();
  arenaCall('drawForeground', ctx, now);
  if (flashScreen > 0) { ctx.fillStyle = `rgba(255,251,224,${flashScreen * 1.2})`; ctx.fillRect(0, 0, W, H); }
  drawHUD();
  if (banner) {
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(W / 2, H * 0.42); ctx.rotate(-0.04);
    ctx.font = `76px ${FONT_D}`;
    ctx.lineWidth = 10; ctx.strokeStyle = C.ink; ctx.strokeText(banner.text, 0, 0);
    ctx.fillStyle = banner.text === 'K.O.!' ? C.gold : C.chalk; ctx.fillText(banner.text, 0, 0);
    if (banner.sub) { ctx.font = `26px ${FONT_B}`; ctx.fillStyle = C.chalk; ctx.fillText(banner.sub, 0, 46); }
    ctx.restore();
  }
}
