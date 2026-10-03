// Stick Fight · src/arena.js
// The default chalkboard arena, the arena registry/hooks and solid obstacles. Contract: arenas/CONTRACT.md.
// Shares one scope with the other src files; build.py wraps them all in a single closure.

// ---------- chalkboard background (drawn once) ----------
const bg = document.createElement('canvas');
bg.width = W; bg.height = H;
(function paintBoard() {
  const b = bg.getContext('2d');
  const g = b.createRadialGradient(W / 2, H * 0.45, 80, W / 2, H / 2, W * 0.75);
  g.addColorStop(0, '#2b3934'); g.addColorStop(1, '#18201d');
  b.fillStyle = g; b.fillRect(0, 0, W, H);
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) {
    b.save();
    b.globalAlpha = 0.035 + rnd() * 0.04;
    b.fillStyle = '#dfe6e0';
    b.translate(rnd() * W, rnd() * H * 0.85);
    b.rotate((rnd() - 0.5) * 0.6);
    b.beginPath(); b.ellipse(0, 0, 60 + rnd() * 140, 10 + rnd() * 26, 0, 0, Math.PI * 2); b.fill();
    b.restore();
  }
  for (let i = 0; i < 1400; i++) {
    b.globalAlpha = rnd() * 0.12;
    b.fillStyle = '#f0f0e8';
    b.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  b.globalAlpha = 1;
  const chalkLine = (x1, y1, x2, y2, w, a) => {
    b.strokeStyle = `rgba(236,235,226,${a})`; b.lineWidth = w; b.lineCap = 'round';
    b.beginPath();
    const n = Math.max(2, Math.floor(Math.hypot(x2 - x1, y2 - y1) / 18));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t + (rnd() - 0.5) * 2.2;
      i ? b.lineTo(x, y) : b.moveTo(x, y);
    }
    b.stroke();
  };
  chalkLine(0, FLOOR + 2, W, FLOOR + 2, 4, 0.75);
  chalkLine(0, FLOOR + 5, W, FLOOR + 4, 2, 0.3);
  for (let x = 6; x < W; x += 16 + rnd() * 10) chalkLine(x, FLOOR + 10, x - 10, FLOOR + 26 + rnd() * 10, 1.5, 0.16);
  for (const p of PLATFORMS) {
    chalkLine(p.x, p.y + 2, p.x + p.w, p.y + 2, 4, 0.72);
    chalkLine(p.x + 4, p.y + 6, p.x + p.w - 4, p.y + 7, 2, 0.28);
    chalkLine(p.x + 18, p.y + 6, p.x + 30, p.y + 40, 2, 0.2);
    chalkLine(p.x + p.w - 18, p.y + 6, p.x + p.w - 30, p.y + 40, 2, 0.2);
  }
  b.font = `22px ${FONT_B}`; b.fillStyle = 'rgba(236,235,226,.18)';
  b.fillText('rounds: best of 3', 22, FLOOR + 50);
})();

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
  floorY: 474, gravityScale: 1, platforms: [ { x: 150, y: 330, w: 190, h: 12 }, { x: 620, y: 330, w: 190, h: 12 } ],
  drawBackground(g) { g.drawImage(bg, 0, 0); },
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
