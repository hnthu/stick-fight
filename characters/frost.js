// Frost, the ice witch. Skill: Ice Shard — a fast shard that slows the target for 2 seconds.
defineCharacter({
  id: 'frost', name: 'Frost', title: 'Ice Witch', color: '#8fe3ff',
  hp: 100, spd: 0.95, jump: 1.0, pow: 1.0,
  skillName: 'Ice Shard', skillDesc: 'A fast shard that freezes the target, slowing them for 2 seconds.', cd: 4.5,

  // slowT is an engine status: half speed, weaker jumps
  useSkill(f) {
    f.cast = 0.22; f.castKind = 'throw';
    const h = f.hand();
    shots.push({ owner: f, x: h.x, y: h.y, vx: 680 * f.facing, vy: 0, g: 0, r: 9, dmg: 8, kb: 140, col: '#bff0ff', life: 2,
      slow: 2, word: 'FREEZE', ch: this });
  },
  shotTrail(s) {
    if (Math.random() < 0.5) parts.push({ x: s.x, y: s.y, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, life: 0.3, max: 0.3, col: '#dff7ff', r: 2, float: true });
  },
  shotDraw(g, s) {
    g.translate(s.x, s.y); g.rotate(Math.sign(s.vx) < 0 ? Math.PI : 0);
    g.shadowColor = '#8fe3ff'; g.shadowBlur = 12;
    g.fillStyle = s.col;
    g.beginPath(); g.moveTo(14, 0); g.lineTo(-6, -7); g.lineTo(-14, 0); g.lineTo(-6, 7); g.closePath(); g.fill();
  },
  aiWantsSkill(me, foe, adx, dy, r) { return adx > 140 && Math.abs(dy) < 50 && r < 0.5; },

  // ice crown
  drawGear(g, f, gear) {
    const { P } = gear;
    chalkPath(g, [P(-12, -9), P(-9, -24), P(-4, -13), P(0, -30), P(4, -13), P(9, -24), P(12, -9)], '#e6fbff', 3);
  },
});
