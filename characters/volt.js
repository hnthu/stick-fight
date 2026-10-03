// Volt, the storm caller. Skill: Lightning — marks the enemy's spot, strikes it half a second later.
// Can't be blocked, only dodged. The CPU sees the mark through `danger` and steps away.
defineCharacter({
  id: 'volt', name: 'Volt', title: 'Storm', color: '#f5e663',
  hp: 95, spd: 1.1, jump: 1.05, pow: 1.0,
  skillName: 'Lightning', skillDesc: 'Marks the enemy\'s spot. Half a second later lightning strikes it. Can\'t be blocked, only dodged.', cd: 5,

  useSkill(f, foe) {
    f.cast = 0.3; f.castKind = 'raise';
    effects.push({
      ch: this, owner: f, x: foe.x, y: foe.surfaceBelow(), t: this.DELAY, fire: 0,
      get danger() { return this.fire > 0 ? null : { x: this.x, r: 60, owner: this.owner }; },
      // returns false when finished
      update(dt) {
        if (this.fire > 0) { this.fire -= dt; return this.fire > 0; }
        this.t -= dt;
        if (this.t <= 0) {
          this.fire = 0.22; flashScreen = 0.12; shake = Math.max(shake, 8); sfx.zap();
          const d = other(this.owner);
          if (Math.abs(d.x - this.x) < 46 && d.y <= this.y + 2 && d.y > this.y - 220) {
            damage(this.owner, d, { dmg: 15, kb: 180, stun: 0.5, dir: Math.sign(d.x - this.x) || 1, at: { x: d.x, y: d.y - 80 }, heavy: true, unblockable: true, word: 'ZAP' });
          }
          burst(this.x, this.y, C.gold, 14, 260);
        }
        return true;
      },
    });
  },
  DELAY: 0.55,
  // e: { x, y, t, fire } — drawn from data so an online guest can draw it too
  effectDraw(g, e) {
    if (e.fire > 0) {
      g.shadowColor = C.gold; g.shadowBlur = 18;
      const pts = [[e.x, 0]];
      for (let y = 40; y < e.y; y += 40) pts.push([e.x + (Math.random() - 0.5) * 40, y]);
      pts.push([e.x, e.y]);
      chalkPath(g, pts, '#fffbe0', 6); chalkPath(g, pts, C.gold, 2.5);
    } else {
      const k = 1 - e.t / this.DELAY;
      g.setLineDash([6, 6]); g.strokeStyle = C.gold; g.lineWidth = 2.5; g.globalAlpha = 0.5 + 0.5 * Math.sin(k * 30);
      g.beginPath(); g.ellipse(e.x, e.y + 2, 46, 8, 0, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 0.25 * k; g.setLineDash([]);
      chalkPath(g, [[e.x, 60], [e.x, e.y]], C.gold, 2);
    }
  },
  aiWantsSkill(me, foe, adx, dy, r) { return r < 0.3; },

  // spiky lightning hair
  drawGear(g, f, gear) {
    const { P, col } = gear;
    chalkPath(g, [P(8, -10), P(2, -28), P(-2, -15), P(-12, -30), P(-10, -14), P(-24, -20), P(-12, -6)], col, 3.5);
  },
});
