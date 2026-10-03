// Kage, the ninja. Skill: Shadow Dash — blink through the enemy, slashing on the way. Can't be hit mid-dash.
defineCharacter({
  id: 'kage', name: 'Kage', title: 'Ninja', color: '#aab3c8',
  hp: 90, spd: 1.2, jump: 1.1, pow: 0.95,
  skillName: 'Shadow Dash', skillDesc: 'Blinks forward through the enemy, slashing as it passes. Can\'t be hit mid-dash.', cd: 4,

  reset(f) { f.dashHit = false; },
  // dashT is an engine status: no gravity, can't be hit, passes through the other fighter
  useSkill(f) { f.dashT = 0.2; f.dashHit = false; },
  busy(f) { return f.dashT > 0; },
  move(f, dt, foe) {
    if (!(f.dashT > 0)) return false;
    f.dashT -= dt;
    f.vx = f.facing * 1300; f.vy = 0;
    if (Math.random() < 0.9) parts.push({ x: f.x, y: f.y - 20 - Math.random() * 100, vx: -f.facing * 60, vy: 0, life: 0.3, max: 0.3, col: f.color, r: 3, float: true });
    if (!f.dashHit && Math.abs(foe.x - f.x) < 34 && Math.abs(foe.y - f.y) < 110) {
      f.dashHit = true;
      damage(f, foe, { dmg: 12, kb: 260, stun: 0.4, dir: f.facing, at: { x: foe.x, y: foe.y - 80 }, heavy: true });
    }
    if (f.dashT <= 0) f.vx *= 0.2;
    return true;
  },
  pose(f, P) {
    if (f.dashT > 0) { P.lean = 0.55; P.la = [-1.2, -1.0]; P.ra = [-1.4, -1.2]; P.ll = [0.9, -0.3]; P.rl = [-0.8, -1.2]; }
  },
  aiWantsSkill(me, foe, adx, dy, r) { return adx > 80 && adx < 320 && Math.abs(dy) < 30 && r < 0.4; },

  // mask over the eyes and a red scarf
  hideEye: true,
  drawGear(g, f, gear) {
    const { P, wave, trail, s, neck } = gear;
    chalkPath(g, [P(-13, -3), P(13, -3)], C.ink, 7);
    g.fillStyle = C.chalk; g.fillRect(gear.hx + 6 * s - 2, gear.hy - 5, 4, 3);
    const n = [neck[0] - 4 * s, neck[1] + 2];
    chalkPath(g, [n, [n[0] - (trail + 16) * s, n[1] + 6 + wave], [n[0] - (trail + 34) * s, n[1] + 2 - wave]], '#d24b5a', 4);
  },
});
