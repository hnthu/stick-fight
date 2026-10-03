// Nyx, the vampire. Skill: Life Drain — lunge in for a bite that steals 12 health.
defineCharacter({
  id: 'nyx', name: 'Nyx', title: 'Vampire', color: '#c58cff',
  hp: 100, spd: 1.05, jump: 1.05, pow: 1.0,
  skillName: 'Life Drain', skillDesc: 'Lunges in for a bite that steals 12 health.', cd: 5,

  netFields: ['drainT'],
  reset(f) { f.drainT = 0; f.drainHit = false; },
  useSkill(f) { f.drainT = 0.24; f.drainHit = false; },
  busy(f) { return f.drainT > 0; },
  threat(f) { return f.drainT > 0; },
  onHurt(f) { f.drainT = 0; },
  move(f, dt, foe) {
    if (!(f.drainT > 0) || f.hurt > 0) return false;
    f.drainT -= dt;
    f.vx = f.facing * 520;
    const px = f.x + f.facing * 42, py = f.y - 92;
    if (!f.drainHit && Math.abs(px - foe.x) < 28 && py > foe.y - 140 && py < foe.y) {
      f.drainHit = true;
      const dealt = damage(f, foe, { dmg: 12, kb: 160, stun: 0.35, dir: f.facing, at: { x: px, y: py } });
      if (dealt > 0) {
        f.hp = Math.min(f.maxHp, f.hp + dealt);
        for (let i = 0; i < 12; i++) parts.push({ x: foe.x, y: foe.y - 90, vx: (f.x - foe.x) * 3 + (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 60, life: 0.4, max: 0.4, col: '#e0476b', r: 3, float: true });
      }
    }
    if (f.drainT <= 0) f.vx *= 0.3;
    return true;
  },
  pose(f, P) {
    if (f.drainT > 0) { P.lean = 0.45; P.la = [1.7, 1.4]; P.ra = [1.3, 1.9]; }
  },
  aiWantsSkill(me, foe, adx, dy, r) { return adx < 95 && Math.abs(dy) < 40 && r < 0.5; },

  // cape (drawn behind the body) and small horns
  gearBehind: true,
  drawGear(g, f, gear) {
    const { P, s, col, neck, hip } = gear;
    const n = [neck[0], neck[1] + 2], sway = Math.sin(f.t * 3) * 4 - Math.min(14, Math.abs(f.vx) * 0.03);
    g.fillStyle = 'rgba(100, 40, 150, .55)'; g.strokeStyle = col; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(n[0], n[1]);
    g.quadraticCurveTo(n[0] - (26 - sway) * s, n[1] + 30, n[0] - (30 - sway) * s, hip[1] + 18);
    g.lineTo(n[0] - 6 * s, hip[1] + 8); g.closePath(); g.fill(); g.stroke();
    chalkPath(g, [P(-6, -11), P(-9, -20), P(-2, -13)], col, 2.5);
    chalkPath(g, [P(4, -12), P(6, -21), P(10, -11)], col, 2.5);
  },
});
