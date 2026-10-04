// Stick Fight · src/arena.js
// The default chalkboard arena, the arena registry/hooks and solid obstacles. Contract: arenas/CONTRACT.md.
// Shares one scope with the other src files; build.py wraps them all in a single closure.

// ---------- chalkboard background (painted once, again when the chalk fonts arrive) ----------
// the chalkboard's own layout (FLOOR and PLATFORMS change with the arena, so the board keeps its copies)
const CHALK_FLOOR = 474, CHALK_PLATFORMS = [ { x: 150, y: 330, w: 190, h: 12 }, { x: 620, y: 330, w: 190, h: 12 } ];
const bg = document.createElement('canvas');
bg.width = W; bg.height = H;
function paintBoard() {
  const b = bg.getContext('2d'), FLOOR = CHALK_FLOOR, PLATFORMS = CHALK_PLATFORMS;
  b.clearRect(0, 0, W, H);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // slate: warm centre, cooler edges, plus a faint top light like a classroom lamp
  const g = b.createRadialGradient(W / 2, H * 0.4, 60, W / 2, H / 2, W * 0.78);
  g.addColorStop(0, '#2e3c36'); g.addColorStop(0.6, '#222d29'); g.addColorStop(1, '#141b18');
  b.fillStyle = g; b.fillRect(0, 0, W, H);
  const lamp = b.createLinearGradient(0, 0, 0, H * 0.5);
  lamp.addColorStop(0, 'rgba(255,248,225,.05)'); lamp.addColorStop(1, 'rgba(255,248,225,0)');
  b.fillStyle = lamp; b.fillRect(0, 0, W, H * 0.5);
  // old eraser swirls: long soft arcs, the way a tired hand wipes a board
  for (let i = 0; i < 30; i++) {
    b.save();
    b.globalAlpha = 0.016 + rnd() * 0.02;
    b.strokeStyle = '#dfe6e0'; b.lineWidth = 18 + rnd() * 30; b.lineCap = 'round';
    const x = rnd() * W, y = rnd() * H * 0.82, r = 60 + rnd() * 160, a0 = rnd() * 6.28;
    b.beginPath(); b.arc(x, y, r, a0, a0 + 0.8 + rnd() * 1.6); b.stroke();
    b.restore();
  }
  // fine grain and specks of chalk dust stuck in the slate
  for (let i = 0; i < 2200; i++) {
    b.globalAlpha = rnd() * 0.1;
    b.fillStyle = rnd() < 0.85 ? '#f0f0e8' : '#000';
    b.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  b.globalAlpha = 1;
  const chalkLine = (x1, y1, x2, y2, w, a, col = '236,235,226') => {
    b.strokeStyle = `rgba(${col},${a})`; b.lineWidth = w; b.lineCap = 'round';
    b.beginPath();
    const n = Math.max(2, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 18));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t + (rnd() - 0.5) * 2.2;
      i ? b.lineTo(x, y) : b.moveTo(x, y);
    }
    b.stroke();
    // chalk skips a little on the slate: tiny gaps of darker grain along the stroke
    for (let i = 0; i < n * 2; i++) {
      const t = rnd();
      b.fillStyle = 'rgba(20,27,24,.35)';
      b.fillRect(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t - w / 2, 1.5, w);
    }
  };
  const scribble = (text, x, y, size, a, rot = 0, col = '236,235,226') => {
    b.save(); b.translate(x, y); b.rotate(rot);
    b.font = `${size}px ${FONT_B}`; b.fillStyle = `rgba(${col},${a})`; b.fillText(text, 0, 0);
    b.restore();
  };
  // half-erased lesson in the background: heading, a tally of wins, a fight diagram
  scribble('Lesson 7: Kicks beat punches (usually)', 40, 150, 26, 0.09, -0.02);
  chalkLine(40, 158, 400, 156, 2, 0.06);
  scribble('P1  |||| |', 46, 196, 22, 0.08, -0.01);
  scribble('P2  |||| ||', 46, 222, 22, 0.08, -0.01);
  scribble('Practice day', W - 170, 140, 22, 0.1, 0.02);
  scribble('homework: block more!', W - 270, 232, 22, 0.075, -0.03, '243,211,91');
  // arc of a jump, with arrows, like a coach's play diagram (between the shelves)
  b.setLineDash([6, 9]);
  b.strokeStyle = 'rgba(236,235,226,.09)'; b.lineWidth = 2;
  b.beginPath(); b.moveTo(395, 440); b.quadraticCurveTo(480, 250, 565, 440); b.stroke();
  b.setLineDash([]);
  chalkLine(565, 440, 553, 426, 2, 0.09); chalkLine(565, 440, 548, 437, 2, 0.09);
  for (const [x, y] of [[395, 452], [565, 452]]) { chalkLine(x - 7, y - 7, x + 7, y + 7, 2, 0.09); chalkLine(x + 7, y - 7, x - 7, y + 7, 2, 0.09); }
  scribble('double jump!', 438, 300, 20, 0.08, -0.04);
  // a tiny doodled stick figure waving in the corner
  b.save(); b.translate(888, 300); b.globalAlpha = 0.11; b.strokeStyle = '#ecebe2'; b.lineWidth = 2; b.lineCap = 'round';
  b.beginPath(); b.arc(0, -36, 7, 0, Math.PI * 2);
  b.moveTo(0, -29); b.lineTo(0, -8); b.moveTo(0, -8); b.lineTo(-7, 6); b.moveTo(0, -8); b.lineTo(7, 6);
  b.moveTo(0, -22); b.lineTo(-9, -14); b.moveTo(0, -22); b.lineTo(10, -34); b.stroke();
  b.restore(); b.globalAlpha = 1;
  // floor: a strong chalk line with a softer echo and a dusty buildup under it
  const dust = b.createLinearGradient(0, FLOOR - 6, 0, FLOOR + 22);
  dust.addColorStop(0, 'rgba(236,235,226,0)'); dust.addColorStop(0.35, 'rgba(236,235,226,.07)'); dust.addColorStop(1, 'rgba(236,235,226,0)');
  b.fillStyle = dust; b.fillRect(0, FLOOR - 6, W, 28);
  chalkLine(0, FLOOR + 2, W, FLOOR + 2, 4, 0.78);
  chalkLine(0, FLOOR + 5, W, FLOOR + 4, 2, 0.3);
  for (let x = 6; x < W; x += 16 + rnd() * 10) chalkLine(x, FLOOR + 10, x - 10, FLOOR + 24 + rnd() * 8, 1.5, 0.15);
  // shelves: chalk planks with hatched shadow and two struts
  for (const p of PLATFORMS) {
    for (let x = p.x + 8; x < p.x + p.w - 4; x += 7) chalkLine(x, p.y + 6, x - 6, p.y + 13, 1.2, 0.12);
    chalkLine(p.x, p.y + 2, p.x + p.w, p.y + 2, 4, 0.78);
    chalkLine(p.x + 4, p.y + 7, p.x + p.w - 4, p.y + 8, 2, 0.3);
    chalkLine(p.x - 3, p.y - 1, p.x + 2, p.y + 6, 2.5, 0.5); chalkLine(p.x + p.w + 3, p.y - 1, p.x + p.w - 2, p.y + 6, 2.5, 0.5);
    chalkLine(p.x + 18, p.y + 8, p.x + 30, p.y + 42, 2, 0.24);
    chalkLine(p.x + p.w - 18, p.y + 8, p.x + p.w - 30, p.y + 42, 2, 0.24);
    chalkLine(p.x + 24, p.y + 25, p.x + 40, p.y + 9, 1.5, 0.14); chalkLine(p.x + p.w - 24, p.y + 25, p.x + p.w - 40, p.y + 9, 1.5, 0.14);
  }
  // wooden chalk tray along the bottom, with chalk stubs and a felt eraser
  const ty = H - 16;
  const wood = b.createLinearGradient(0, ty, 0, H);
  wood.addColorStop(0, '#7a5a3c'); wood.addColorStop(0.4, '#5b4129'); wood.addColorStop(1, '#3a2918');
  b.fillStyle = wood; b.fillRect(0, ty, W, 16);
  b.fillStyle = 'rgba(255,230,190,.25)'; b.fillRect(0, ty, W, 1.5);
  b.strokeStyle = 'rgba(30,18,8,.35)'; b.lineWidth = 1;
  for (let i = 0; i < 9; i++) { const yy = ty + 4 + rnd() * 10; b.beginPath(); b.moveTo(0, yy); b.bezierCurveTo(W * 0.3, yy + rnd() * 3, W * 0.6, yy - rnd() * 3, W, yy); b.stroke(); }
  b.fillStyle = 'rgba(236,235,226,.18)';
  for (let i = 0; i < 120; i++) b.fillRect(rnd() * W, ty + 1 + rnd() * 3, 1 + rnd() * 2, 1);
  const stub = (x, len, col, rot) => {
    b.save(); b.translate(x, ty + 2); b.rotate(rot);
    b.fillStyle = col; b.fillRect(-len / 2, -5, len, 6);
    b.fillStyle = 'rgba(0,0,0,.18)'; b.fillRect(-len / 2, -1, len, 2);
    b.fillStyle = 'rgba(255,255,255,.5)'; b.fillRect(-len / 2, -5, len, 1.5);
    b.restore();
  };
  stub(120, 34, '#f4f1e6', 0.03); stub(168, 18, '#f3d35b', -0.05); stub(640, 26, '#ff9a8a', 0.02); stub(676, 12, '#9fd3f0', 0.08); stub(860, 30, '#f4f1e6', -0.02);
  // eraser: wood back, grey felt, chalky smear beside it
  b.fillStyle = 'rgba(236,235,226,.14)'; b.beginPath(); b.ellipse(330, ty + 1, 46, 4, 0, 0, Math.PI * 2); b.fill();
  b.fillStyle = '#6b4a2e'; b.fillRect(270, ty - 12, 64, 9);
  b.fillStyle = 'rgba(255,230,190,.3)'; b.fillRect(270, ty - 12, 64, 1.5);
  b.fillStyle = '#8d8f8a'; b.fillRect(272, ty - 3, 60, 5);
  b.fillStyle = 'rgba(236,235,226,.5)'; b.fillRect(272, ty - 3, 60, 1.5);
  // frame: thin wooden rails on the sides, soft shadow where the slate meets the wood
  for (const [x, dir] of [[0, 1], [W - 7, -1]]) {
    const fw = b.createLinearGradient(x, 0, x + 7, 0);
    fw.addColorStop(dir > 0 ? 0 : 1, '#3a2918'); fw.addColorStop(dir > 0 ? 1 : 0, '#6b4a2e');
    b.fillStyle = fw; b.fillRect(x, 0, 7, H);
    const sh = b.createLinearGradient(dir > 0 ? 7 : W - 7, 0, dir > 0 ? 25 : W - 25, 0);
    sh.addColorStop(0, 'rgba(0,0,0,.35)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    b.fillStyle = sh; b.fillRect(dir > 0 ? 7 : W - 25, 0, 18, ty);
  }
  b.font = `22px ${FONT_B}`; b.fillStyle = 'rgba(236,235,226,.18)';
  b.fillText('rounds: best of 3', 22, FLOOR + 46);
}
paintBoard();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(paintBoard);
// a few motes of chalk dust drifting in the lamp light (deterministic, no state)
const CHALK_MOTES = Array.from({ length: 26 }, (_, i) => ({ x: (i * 373) % W, y: 60 + (i * 211) % 380, s: 4 + (i % 5) * 2, r: 1 + (i % 3) * 0.6, ph: i * 1.7 }));
function drawChalkMotes(g, t) {
  g.fillStyle = '#ecebe2';
  for (const m of CHALK_MOTES) {
    const x = (m.x + t * m.s + Math.sin(t * 0.6 + m.ph) * 14) % W;
    const y = m.y + Math.sin(t * 0.4 + m.ph) * 18 - (t * 3) % 40;
    g.globalAlpha = 0.12 + 0.1 * Math.sin(t * 1.3 + m.ph);
    g.fillRect(x, y, m.r, m.r);
  }
  g.globalAlpha = 1;
}

// ---------- arenas ----------
// contract: arenas/CONTRACT.md. Arena files push objects onto window.STICK_ARENAS.
const ENV = { env: true, ch: { pow: 1 }, color: '#ffffff' };
let now = 0;
const game = {
  W, H, state: 'menu', fighting: false,
  get floorY() { return FLOOR; },
  hurt(f, o = {}) {
    if (!game.fighting || netGuestActive() || !f || f.ko || (f !== p1 && f !== p2)) return 0; // online: only the host deals damage
    const dir = o.dir != null && o.dir !== 0 ? Math.sign(o.dir) : (o.fromX != null ? (Math.sign(f.x - o.fromX) || 1) : 0);
    const dmg = Math.max(0, Math.min(25, +o.dmg || 0));
    return damage(ENV, f, { dmg, kb: o.kb != null ? +o.kb : 200, stun: o.stun != null ? +o.stun : 0.3, dir,
      unblockable: o.unblockable !== false, heavy: !!o.heavy, word: o.word, at: { x: f.x, y: f.y - 80 } });
  },
  particle(p) { if (parts.length < 600 && p) parts.push({ vx: 0, vy: 0, life: 0.5, col: C.chalk, r: 3, ...p, max: p.life || 0.5 }); },
  shake(n) { shake = Math.max(shake, Math.min(18, +n || 0)); },
  word(x, y, text, col) { word(x, y, String(text).slice(0, 12), col || C.chalk); },
};
const CHALK = {
  id: 'chalk', name: 'Chalkboard', nameVi: 'Bảng phấn', hint: 'The classic board', hintVi: 'Sàn đấu gốc',
  floorY: CHALK_FLOOR, gravityScale: 1, platforms: CHALK_PLATFORMS,
  drawBackground(g) { g.drawImage(bg, 0, 0); },
  drawForeground(g, t) { drawChalkMotes(g, t); },
};
let arena = CHALK, arenaPick = 0, arenaErrors = new Set();
function validArena(a) {
  return a && typeof a === 'object' && typeof a.drawBackground === 'function' && Array.isArray(a.platforms);
}
function arenaList() {
  const extra = (window.STICK_ARENAS || []).filter(validArena)
    .filter((a, i, arr) => arr.findIndex(b => b.id === a.id) === i)
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return [CHALK, ...extra];
}
// calls an arena hook; a throwing arena falls back to the chalkboard drawing instead of breaking the game
function arenaCall(name, ...args) {
  const fn = arena && arena[name];
  if (typeof fn !== 'function') return false;
  const g = name.startsWith('draw') ? args[0] : null;
  if (g) g.save();
  try { fn.apply(arena, args); return true; }
  catch (err) {
    const key = arena.id + ':' + name;
    if (!arenaErrors.has(key)) { arenaErrors.add(key); console.warn('Arena', key, 'failed:', err); }
    return false;
  } finally {
    if (g) { g.restore(); g.globalAlpha = 1; g.shadowBlur = 0; g.setLineDash([]); }
  }
}
// ---- solid obstacles (arena.obstacles) ----
const BODY_W = 16, BODY_H = 130;
const obstacleHp0 = new WeakMap();
function solids() {
  const list = arena && Array.isArray(arena.obstacles) ? arena.obstacles : [];
  const out = [];
  for (const o of list) {
    if (!o || !(o.w > 0) || !(o.h > 0) || !Number.isFinite(+o.x) || !Number.isFinite(+o.y)) continue;
    if (o.hp != null && !obstacleHp0.has(o)) obstacleHp0.set(o, +o.hp);
    if (o.hp != null && !(o.hp > 0)) continue;
    out.push(o);
  }
  return out;
}
function obstacleAt(x, y, pad = 0) {
  for (const o of solids()) if (x > o.x - pad && x < o.x + o.w + pad && y > o.y - pad && y < o.y + o.h + pad) return o;
  return null;
}
function hitObstacle(o, dmg, x, y, col) {
  o.hp = Math.max(0, o.hp - dmg);
  o._hitT = 0.15;
  burst(x, y, col || C.chalk, 6, 140);
  sfx.block();
  if (o.hp <= 0) {
    for (let i = 0; i < 26; i++) parts.push({ x: o.x + Math.random() * o.w, y: o.y + Math.random() * o.h, vx: (Math.random() - 0.5) * 420, vy: -Math.random() * 380, life: 0.7, max: 0.7, col: Math.random() < 0.5 ? C.chalk : (col || C.dim), r: 3 + Math.random() * 4 });
    word(o.x + o.w / 2, o.y - 10, 'CRASH', C.gold);
    shake = Math.max(shake, 9); sfx.boom();
  }
}
function restoreObstacles() {
  const list = arena && Array.isArray(arena.obstacles) ? arena.obstacles : [];
  for (const o of list) if (o && obstacleHp0.has(o)) o.hp = obstacleHp0.get(o);
  solids();
}
// if a spawn point ends up inside an obstacle, stand the fighter on top of it
function unstick() {
  for (const f of [p1, p2]) for (const o of solids()) {
    if (f.x + BODY_W > o.x && f.x - BODY_W < o.x + o.w && f.y > o.y && f.y - BODY_H < o.y + o.h) { f.y = o.y; f.vy = 0; }
  }
}
function obstacleAhead(f, dir, range) {
  for (const o of solids()) {
    if (!(o.y < f.y - 2 && o.y + o.h > f.y - BODY_H)) continue;
    const gap = dir > 0 ? o.x - (f.x + BODY_W) : (f.x - BODY_W) - (o.x + o.w);
    if (gap >= -2 && gap <= range) return o;
  }
  return null;
}
function drawObstacleBars() {
  for (const o of solids()) {
    const hp0 = obstacleHp0.get(o);
    if (o._hitT > 0) o._hitT -= 1 / 60;
    if (hp0 == null || o.hp >= hp0) continue;
    const w = Math.min(60, o.w), x = o.x + (o.w - w) / 2, y = o.y - 10;
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(x, y, w, 5);
    ctx.fillStyle = o.hp / hp0 < 0.35 ? '#ff6b5a' : C.gold; ctx.fillRect(x, y, w * o.hp / hp0, 5);
  }
}

function setArena(a) {
  arena = validArena(a) ? a : CHALK;
  const fy = +arena.floorY;
  FLOOR = Number.isFinite(fy) ? Math.max(380, Math.min(500, fy)) : 474;
  const gs = +arena.gravityScale;
  gravK = Number.isFinite(gs) && gs > 0 ? Math.max(0.5, Math.min(1.5, gs)) : 1;
  PLATFORMS = arena.platforms.filter(p => p && Number.isFinite(+p.x) && Number.isFinite(+p.y) && Number.isFinite(+p.w));
}
function chosenArena() {
  const list = arenaList();
  if (arenaPick === -1) return list[1 + ((Math.random() * (list.length - 1)) | 0)] || CHALK;
  return list[arenaPick] || CHALK;
}
