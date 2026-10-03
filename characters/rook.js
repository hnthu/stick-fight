// Rook, the brawler. Skill: Ground Pound — leap, slam down, shockwave hits anyone standing nearby.
defineCharacter({
  id: 'rook', name: 'Rook', title: 'Brawler', color: '#ff9f43',
  hp: 120, spd: 0.88, jump: 0.92, pow: 1.2, thick: 1.25,
  skillName: 'Ground Pound', skillDesc: 'Leaps and slams down. The shockwave hits anyone standing nearby.', cd: 6,

  netFields: ['pound'],
  reset(f) { f.pound = false; },
  useSkill(f) {
    f.pound = true; f.jumps = 2;
    if (f.onGround) { f.vy = -760; f.onGround = false; } else f.vy = 1400;
  },
  // once the leap peaks, slam straight down
  tick(f) { if (f.pound && !f.onGround) f.vy = Math.max(f.vy, f.vy > -100 ? 1400 : f.vy); },
  grounded(f) {
    if (!f.pound) return;
    f.pound = false;
    const foe = other(f);
    ring(f.x, f.y, f.color, true);
    shake = 12; sfx.boom();
    for (let i = 0; i < 18; i++) parts.push({ x: f.x + (Math.random() - 0.5) * 60, y: f.y, vx: (Math.random() - 0.5) * 600, vy: -Math.random() * 300, life: 0.5, max: 0.5, col: C.chalk, r: 3 });
    if (foe.onGround && Math.abs(foe.y - f.y) < 8 && Math.abs(foe.x - f.x) < 170) {
      damage(f, foe, { dmg: 16, kb: 320, stun: 0.45, dir: Math.sign(foe.x - f.x) || f.facing, at: { x: foe.x, y: foe.y - 20 }, heavy: true, popV: -480, word: 'QUAKE' });
    }
  },
  onHurt(f, ko) { if (ko) f.pound = false; },
  pose(f, P) {
    if (f.pound && !f.onGround) { P.la = [2.6, 2.9]; P.ra = [2.4, 2.8]; P.ll = [1.2, -0.6]; P.rl = [0.9, -0.9]; }
  },
  aiWantsSkill(me, foe, adx, dy, r) { return adx < 150 && foe.onGround && Math.abs(dy) < 10 && r < 0.4; },

  // headband with fluttering tails
  drawGear(g, f, gear) {
    const { P, wave, trail, s } = gear;
    g.strokeStyle = C.chalk; g.lineWidth = 3.5;
    g.beginPath(); g.arc(gear.hx, gear.hy, 13, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
    const t = P(-12, -6);
    chalkPath(g, [t, [t[0] - trail * s, t[1] + 4 + wave], [t[0] - (trail + 10) * s, t[1] + 2 - wave]], C.chalk, 2.5);
    chalkPath(g, [t, [t[0] - (trail - 4) * s, t[1] + 10 - wave]], C.chalk, 2.5);
  },
});
