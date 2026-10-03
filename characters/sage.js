// Sage, the monk. Skill: Meditate — restores 24 health over 2 seconds.
defineCharacter({
  id: 'sage', name: 'Sage', title: 'Monk', color: '#fff1b8',
  hp: 100, spd: 1.0, jump: 1.0, pow: 0.92,
  skillName: 'Meditate', skillDesc: 'Restores 24 health over 2 seconds.', cd: 9,

  // regenT is an engine status: +12 health per second while it lasts
  useSkill(f) { f.regenT = 2; f.cast = 0.4; f.castKind = 'raise'; },
  aiWantsSkill(me, foe, adx, dy, r) { return me.hp < me.maxHp * 0.65 && (adx > 160 || r < 0.15) && r < 0.6; },

  // glowing halo
  drawGear(g, f, gear) {
    g.shadowColor = C.gold; g.shadowBlur = 10;
    g.strokeStyle = C.gold; g.lineWidth = 2.5;
    g.beginPath(); g.ellipse(gear.hx, gear.hy - 25, 13, 4, 0, 0, Math.PI * 2); g.stroke();
    g.shadowBlur = 0;
  },
});
