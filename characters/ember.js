// Ember, the fire mage. Skill: Fireball — a heavy fireball thrown across the board.
defineCharacter({
  id: 'ember', name: 'Ember', title: 'Fire Mage', color: '#ff5a4e',
  hp: 95, spd: 1.0, jump: 1.0, pow: 1.0, tagLift: 14,
  skillName: 'Fireball', skillDesc: 'Throws a heavy fireball across the board.', cd: 3.5,

  useSkill(f) {
    f.cast = 0.25; f.castKind = 'throw';
    const h = f.hand();
    shots.push({ owner: f, x: h.x, y: h.y, vx: 560 * f.facing, vy: 0, g: 0, r: 12, dmg: 14, kb: 330, col: '#ff6a3d', life: 2,
      stun: 0.35, heavy: true, word: 'FWOOSH', ch: this });
  },
  shotTrail(s) {
    if (Math.random() < 0.8) parts.push({ x: s.x, y: s.y, vx: -s.vx * 0.1 + (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 40, life: 0.3, max: 0.3, col: Math.random() < 0.5 ? '#ffb347' : '#ff5a4e', r: 3 + Math.random() * 3, float: true });
  },
  shotDraw(g, s) {
    g.shadowColor = s.col; g.shadowBlur = 20;
    g.fillStyle = '#ffd36b';
    g.beginPath(); g.arc(s.x, s.y, s.r * 0.6, 0, Math.PI * 2); g.fill();
    g.strokeStyle = s.col; g.lineWidth = 4;
    g.beginPath(); g.arc(s.x, s.y, s.r, 0, Math.PI * 2); g.stroke();
  },
  aiWantsSkill(me, foe, adx, dy, r) { return adx > 140 && Math.abs(dy) < 50 && r < 0.5; },

  // pointed wizard hat
  drawGear(g, f, gear) {
    const { P, col } = gear;
    g.fillStyle = '#5a2320'; g.strokeStyle = col; g.lineWidth = 3;
    g.beginPath(); g.moveTo(...P(-14, -8)); g.lineTo(...P(14, -8)); g.quadraticCurveTo(...P(2, -26), ...P(-12, -44)); g.closePath(); g.fill(); g.stroke();
    chalkPath(g, [P(-20, -8), P(20, -8)], col, 4);
  },
});
