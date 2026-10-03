// Bulwark, the knight. Skill: Iron Skin — 3 seconds of quarter damage and no flinching.
defineCharacter({
  id: 'bulwark', name: 'Bulwark', title: 'Knight', color: '#7d96ff',
  hp: 130, spd: 0.8, jump: 0.85, pow: 1.1, thick: 1.2,
  skillName: 'Iron Skin', skillDesc: 'For 3 seconds takes a quarter damage and never flinches.', cd: 8,

  // armorT is an engine status: damage x0.25, almost no knockback, no stun; the shell is drawn by the renderer
  useSkill(f) {
    f.armorT = 3; f.cast = 0.2; f.castKind = 'flex';
    ring(f.x, f.y - 70, f.color);
  },
  aiWantsSkill(me, foe, adx, dy, r) { return adx < 130 && r < 0.3; },

  // helmet with a red plume
  drawGear(g, f, gear) {
    const { P, wave } = gear;
    g.strokeStyle = '#c9d2e6'; g.lineWidth = 7;
    g.beginPath(); g.arc(gear.hx, gear.hy, 15, Math.PI * 1.0, Math.PI * 2.0); g.stroke();
    chalkPath(g, [P(6, -4), P(6, 10)], '#c9d2e6', 4);
    chalkPath(g, [P(0, -16), P(-10, -26 - wave * 0.5), P(-22, -22)], '#ff6b6b', 5);
  },
});
