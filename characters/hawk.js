// Hawk, the archer. Skill: Triple Shot — three arrows fired in a spread.
defineCharacter({
  id: 'hawk', name: 'Hawk', title: 'Archer', color: '#9fd65a',
  hp: 95, spd: 1.0, jump: 1.05, pow: 0.95,
  skillName: 'Triple Shot', skillDesc: 'Fires three arrows in a spread.', cd: 4,

  useSkill(f) {
    f.cast = 0.25; f.castKind = 'throw';
    const h = f.hand(), s = f.facing;
    for (const a of [-0.13, 0, 0.13]) shots.push({ owner: f, x: h.x, y: h.y, vx: Math.cos(a) * 760 * s, vy: Math.sin(a) * 760 - 60, g: 380, r: 6, dmg: 6, kb: 120, col: '#e9f5d0', life: 2,
      quiet: true, ch: this });
  },
  shotDraw(g, sh) {
    g.translate(sh.x, sh.y); g.rotate(Math.atan2(sh.vy, sh.vx));
    chalkPath(g, [[-26, 0], [4, 0]], sh.col, 3);
    chalkPath(g, [[-4, -5], [6, 0], [-4, 5]], sh.col, 2.5);
    chalkPath(g, [[-26, 0], [-32, -5]], '#9fd65a', 2); chalkPath(g, [[-26, 0], [-32, 5]], '#9fd65a', 2);
  },
  aiWantsSkill(me, foe, adx, dy, r) { return adx > 140 && Math.abs(dy) < 50 && r < 0.5; },

  // feather and quiver strap
  drawGear(g, f, gear) {
    const { P, s, col, neck, hip } = gear;
    chalkPath(g, [P(-8, -10), P(-18, -26), P(-26, -30)], '#f1f7e2', 3);
    chalkPath(g, [P(-12, -14), P(-20, -20)], col, 2);
    chalkPath(g, [[neck[0] - 8 * s, neck[1] - 6], [hip[0] - 14 * s, hip[1] - 4]], '#a77b4f', 4);
  },
});
