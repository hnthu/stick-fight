// Zip, the speedster. Skill: Flurry — six lightning-fast punches in a row.
defineCharacter({
  id: 'zip', name: 'Zip', title: 'Speedster', color: '#ff7ac8',
  hp: 85, spd: 1.35, jump: 1.12, pow: 0.88,
  skillName: 'Flurry', skillDesc: 'Six lightning-fast punches in a row.', cd: 5,

  netFields: ['flurryT'],
  reset(f) { f.flurryT = 0; f.flurryTick = 0; },
  useSkill(f) { f.flurryT = 0.6; f.flurryTick = 0; },
  busy(f) { return f.flurryT > 0; },
  threat(f) { return f.flurryT > 0; },
  onHurt(f) { f.flurryT = 0; },
  // creep forward while punching
  moveTarget(f) { return f.flurryT > 0 ? f.facing * 40 : null; },
  tick(f, dt, foe) {
    if (!(f.flurryT > 0)) return;
    f.flurryT -= dt;
    f.flurryTick -= dt;
    if (f.flurryTick <= 0) {
      f.flurryTick = 0.1;
      sfx.swing();
      const px = f.x + f.facing * 60, py = f.y - 92 + (Math.random() - 0.5) * 20;
      if (Math.abs(px - foe.x) < 30 && py > foe.y - 140 && py < foe.y) damage(f, foe, { dmg: 3.2, kb: 70, stun: 0.16, dir: f.facing, at: { x: px, y: py }, quiet: true });
    }
  },
  pose(f, P) {
    if (!(f.flurryT > 0)) return;
    const ph = Math.sin(f.t * 60) > 0;
    P.la = ph ? [1.55, 1.57] : [0.6, 2.3]; P.ra = ph ? [0.4, 2.5] : [1.5, 1.6]; P.lean = 0.15;
  },
  aiWantsSkill(me, foe, adx, dy, r) { return adx < 72 && Math.abs(dy) < 40 && r < 0.5; },

  // goggles and speed lines
  drawGear(g, f, gear) {
    const { P, s, col, hip } = gear;
    g.strokeStyle = C.chalk; g.lineWidth = 2.5; g.strokeRect(gear.hx + 2 * s - (s < 0 ? 12 : 0), gear.hy - 7, 12, 7);
    chalkPath(g, [P(-12, -4), P(2, -4)], C.chalk, 2.5);
    if (Math.abs(f.vx) > 150 || f.flurryT > 0) for (let i = 0; i < 3; i++) chalkPath(g, [[hip[0] - (24 + i * 4) * s, hip[1] - 30 + i * 18], [hip[0] - (48 + i * 6) * s, hip[1] - 30 + i * 18]], col, 2);
  },
});
