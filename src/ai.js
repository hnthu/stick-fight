// Stick Fight · src/ai.js
// The CPU opponent. See docs/cpu-ai.md.
// Shares one scope with the other src files; build.py wraps them all in a single closure.

// ---------- CPU brain ----------
function makeBrain() { return { t: 0, move: 0, block: false, jump: false, atk: null, skill: false }; }
const brains = new Map([[p1, makeBrain()], [p2, makeBrain()]]);
function wantsSkill(me, foe, adx, dy) {
  return !!me.ch.aiWantsSkill?.(me, foe, adx, dy, Math.random());
}
function aiInput(me, foe, dt) {
  const ai = brains.get(me);
  ai.t -= dt;
  if (ai.t <= 0) {
    ai.t = 0.09 + Math.random() * 0.16;
    const dx = foe.x - me.x, adx = Math.abs(dx), dir = Math.sign(dx) || 1, dy = foe.y - me.y;
    ai.move = 0; ai.block = false; ai.atk = null;
    const threatened = (foe.atk || foe.ch.threat?.(foe)) && adx < 110;
    if (me.skillCd <= 0 && wantsSkill(me, foe, adx, dy)) ai.skill = true;
    else if (threatened && Math.random() < 0.42) ai.block = true;
    else if (adx > 64) {
      ai.move = dir;
      if (dy < -60 && me.onGround && Math.random() < 0.4) ai.jump = true;
      if (Math.random() < 0.03) ai.jump = true;
    } else {
      const r = Math.random();
      if (me.hp < me.maxHp * 0.3 && r < 0.15) ai.move = -dir;
      else if (r < 0.62) ai.atk = adx < 54 ? (Math.random() < 0.7 ? 'punch' : 'kick') : 'kick';
      else if (r < 0.74) ai.move = -dir;
      else if (r < 0.8) ai.jump = true;
      else if (r < 0.9) ai.block = true;
    }
  }
  // step out of any marked danger zone (e.g. Volt's lightning)
  for (const e of effects) {
    const z = e.danger;
    if (z && z.owner !== me && Math.abs(z.x - me.x) < z.r && Math.random() < 0.3) ai.move = me.x > z.x ? 1 : -1;
  }
  if (!me.onGround && me.jumps < 2 && me.vy > -80 && foe.y < me.y - 50 && Math.random() < 0.05) ai.jump = true;
  if (ai.move) {
    const o = obstacleAhead(me, ai.move, me.onGround ? 60 : 36);
    if (o) {
      const tall = me.y - o.y;
      if (me.onGround) {
        if (o.hp != null && tall > 120 && me.cd <= 0 && !me.atk && Math.sign(o.x + o.w / 2 - me.x) === me.facing) ai.atk = 'kick';
        else ai.jump = true;
      } else if (me.jumps < 2 && me.vy > -120 && tall > 0) ai.jump = true;
    }
  }
  // stuck against something: hop
  if (ai.move && me.onGround && Math.abs(me.x - (ai.lastX ?? me.x)) < 0.5) { ai.stuck = (ai.stuck || 0) + dt; if (ai.stuck > 0.35) { ai.jump = true; ai.stuck = 0; } } else ai.stuck = 0;
  ai.lastX = me.x;
  const inp = { left: ai.move < 0, right: ai.move > 0, down: ai.block, up: ai.jump, punch: ai.atk === 'punch', kick: ai.atk === 'kick', skill: ai.skill };
  ai.jump = false; ai.atk = null; ai.skill = false;
  return inp;
}
