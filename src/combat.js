// Stick Fight · src/combat.js
// Particles, projectiles, timed effects, damage and hit detection.
// Shares one scope with the other src files; build.py wraps them all in a single closure.

// ---------- effects ----------
  // shots: projectiles { owner, x, y, vx, vy, g, r, dmg, kb, col, life, stun?, heavy?, slow?, quiet?, word?, trail(s)?, draw(g, s) }
  // effects: timed skill effects { update(dt) -> false when done, draw(g), danger?: { x, r, owner } }
const parts = [], words = [], shots = [], effects = [], rings = [];
  let shake = 0, freeze = 0, slow = 0, flashScreen = 0;
  function dust(x, y, n) {
    for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 160, vy: -Math.random() * 90, life: 0.4, max: 0.4, col: C.chalk, r: 2 + Math.random() * 2 });
  }
  function burst(x, y, col, n, power) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = power * (0.4 + Math.random());
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 60, life: 0.5, max: 0.5, col, r: 2 + Math.random() * 3 });
    }
  }
  function ring(x, y, col, flat) { rings.push({ x, y, r: 10, life: 0.45, col, flat }); }
  const HIT_WORDS = ['POW', 'WHAM', 'BAM', 'THWACK', 'SMACK'];
  function word(x, y, text, col) { words.push({ x, y, text, col, life: 0.7, rot: (Math.random() - 0.5) * 0.4 }); }

// ---------- combat ----------
  // returns damage actually dealt
  function damage(a, d, o) {
    if (d.ko || d.dashT > 0) return 0;
    let dmg = o.dmg * a.ch.pow, kb = o.kb;
    const at = o.at || { x: d.x, y: d.y - 80 };
    if (d.blocking && d.facing === -o.dir && !o.unblockable) {
      dmg *= 0.15; kb *= 0.35;
      burst(at.x, at.y, C.dim, 6, 120);
      sfx.block(); freeze = Math.max(freeze, 0.03);
    } else if (d.armorT > 0) {
      dmg *= 0.25; kb *= 0.15;
      burst(at.x, at.y, d.color, 8, 160);
      word(at.x, at.y - 24, 'CLANG', d.color);
      sfx.block(); freeze = Math.max(freeze, 0.04);
    } else {
      d.hurt = o.stun; d.atk = null; d.cast = 0; d.flash = 0.12;
      d.ch.onHurt?.(d, false);
      if (o.heavy || o.popV || !d.onGround) { d.vy = o.popV || -260; d.onGround = false; }
      burst(at.x, at.y, a.color, o.heavy ? 16 : 10, o.heavy ? 320 : 220);
      if (o.word) word(at.x, at.y - 30, o.word, a.color);
      else if (!o.quiet && (o.heavy || Math.random() < 0.3)) word(at.x, at.y - 30, HIT_WORDS[(Math.random() * HIT_WORDS.length) | 0], a.color);
      shake = Math.max(shake, o.heavy ? 10 : 5); freeze = Math.max(freeze, o.quiet ? 0.02 : o.heavy ? 0.08 : 0.05);
      sfx.hit(o.heavy);
    }
    if (o.slow) d.slowT = Math.max(d.slowT, o.slow);
    d.vx = o.dir * kb;
    d.hp = Math.max(0, d.hp - dmg);
    if (d.hp <= 0) {
      d.ko = true; d.koT = 0; d.vy = -480; d.vx = o.dir * 380; d.onGround = false;
      d.dashT = d.regenT = d.armorT = 0;
      d.ch.onHurt?.(d, true);
      shake = 18; slow = 1.1; freeze = 0.12;
      sfx.ko();
      endRound(a.env ? other(d) : a);
    }
    return dmg;
  }
  function resolveHit(a, d) {
    const pt = a.attackPoint();
    if (!pt) return;
    if (d.ko || Math.abs(pt.x - d.x) > 24 || pt.y < d.y - 140 || pt.y > d.y + 6) {
      // kicks sweep low too, so short obstacles can be broken
      const o = obstacleAt(pt.x, pt.y, 10) || (a.atk.type === 'kick' ? obstacleAt(pt.x, a.y - 22, 6) : null);
      if (o && o.hp != null) { a.atk.hit = true; hitObstacle(o, pt.A.dmg * a.ch.pow, pt.x, pt.y, a.color); }
      return;
    }
    a.atk.hit = true;
    const heavy = a.atk.type === 'kick';
    damage(a, d, { dmg: pt.A.dmg, kb: pt.A.kb, stun: pt.A.stun, dir: a.facing, at: pt, heavy });
  }
  function updateShots(dt) {
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.life -= dt; s.vy += s.g * dt; s.x += s.vx * dt; s.y += s.vy * dt;
      if (s.trail) s.trail(s); else s.ch?.shotTrail?.(s);
      const d = other(s.owner);
      let gone = s.life <= 0 || s.x < -40 || s.x > W + 40 || s.y > FLOOR;
      if (!gone) {
        const o = obstacleAt(s.x, s.y, s.r * 0.6);
        if (o) {
          gone = true;
          burst(s.x, s.y, s.col, 8, 140);
          if (o.hp != null) hitObstacle(o, s.dmg * s.owner.ch.pow, s.x, s.y, s.col);
        }
      }
      if (!gone && !d.ko && Math.abs(s.x - d.x) < 16 + s.r && s.y > d.y - 140 && s.y < d.y) {
        damage(s.owner, d, { dmg: s.dmg, kb: s.kb, stun: s.stun ?? 0.2, dir: Math.sign(s.vx), at: { x: s.x, y: s.y }, heavy: !!s.heavy, slow: s.slow, quiet: !!s.quiet, word: s.word || null });
        gone = true;
      }
      // opposing projectiles cancel out
      if (!gone) for (const o of shots) if (o !== s && o.owner !== s.owner && Math.hypot(o.x - s.x, o.y - s.y) < o.r + s.r) { o.life = 0; gone = true; burst(s.x, s.y, C.chalk, 8, 150); }
      if (gone) { if (s.y > FLOOR) burst(s.x, FLOOR, s.col, 5, 90); shots.splice(i, 1); }
    }
    for (let i = effects.length - 1; i >= 0; i--) {
      if (effects[i].update(dt) === false) effects.splice(i, 1);
    }
    for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.life -= dt; r.r += 420 * dt; if (r.life <= 0) rings.splice(i, 1); }
  }
  function separate(a, b) {
    if (a.ko || b.ko || a.dashT > 0 || b.dashT > 0) return;
    const dx = b.x - a.x;
    if (Math.abs(dx) < 34 && Math.abs(a.y - b.y) < 100) {
      const push = (34 - Math.abs(dx)) / 2 * (Math.sign(dx) || 1);
      a.x -= push; b.x += push;
      a.x = Math.max(28, Math.min(W - 28, a.x)); b.x = Math.max(28, Math.min(W - 28, b.x));
    }
  }
