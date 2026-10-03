// Stick Fight · src/fighter.js
// The Fighter: movement, jumping, attacks, physics and collisions. Skills plug in through hooks on the character (see README.md).
// Shares one scope with the other src files; build.py wraps them all in a single closure.

// ---------- fighters ----------
const ATTACKS = {
  punch: { dur: 0.26, on: 0.07, off: 0.15, reach: 58, h: 96, dmg: 7, kb: 250, stun: 0.22, cd: 0.06 },
  kick:  { dur: 0.42, on: 0.15, off: 0.27, reach: 72, h: 60, dmg: 11, kb: 400, stun: 0.32, cd: 0.12 },
};

class Fighter {
  constructor(slot) { this.slot = slot; this.wins = 0; this.setChar(ROSTER[slot === 0 ? 0 : 2]); }
  setChar(ch) { this.ch = ch; this.color = ch.color; }
  reset(x, facing) {
    Object.assign(this, { x, y: FLOOR, vx: 0, vy: 0, facing, maxHp: this.ch.hp, hp: this.ch.hp, ghost: this.ch.hp,
      onGround: true, jumps: 0, atk: null, hurt: 0, cd: 0, blocking: false, ko: false, koT: 0, walk: 0, flash: 0,
      t: Math.random() * 10, skillCd: 1.5, cast: 0, castKind: null, dashT: 0, armorT: 0, regenT: 0, slowT: 0 });
    this.ch.reset?.(this);
  }
  get busy() { return !!(this.atk || this.cast > 0 || this.ch.busy?.(this)); }
  hand() { return { x: this.x + this.facing * 34, y: this.y - 96 }; }
  surfaceBelow() {
    let s = FLOOR;
    for (const p of PLATFORMS) if (this.x > p.x && this.x < p.x + p.w && this.y <= p.y + 1 && p.y < s) s = p.y;
    for (const o of solids()) if (this.x + BODY_W > o.x && this.x - BODY_W < o.x + o.w && this.y <= o.y + 1 && o.y < s) s = o.y;
    return s;
  }
  update(dt, inp, foe) {
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    if (this.ghost > this.hp) this.ghost = Math.max(this.hp, this.ghost - 40 * dt);
    if (this.ko) { this.koT += dt; this.physics(dt); this.vx *= Math.pow(0.15, dt); return; }
    for (const k of ['cd', 'hurt', 'cast', 'armorT', 'slowT', 'skillCd']) this[k] = Math.max(0, this[k] - dt);
    if (this.regenT > 0) {
      this.regenT -= dt;
      this.hp = Math.min(this.maxHp, this.hp + 12 * dt);
      if (Math.random() < 0.4) parts.push({ x: this.x + (Math.random() - 0.5) * 40, y: this.y - Math.random() * 120, vx: 0, vy: -80, life: 0.6, max: 0.6, col: '#a8f0a0', r: 3, float: true });
    }
    if (this.slowT > 0 && Math.random() < 0.25) parts.push({ x: this.x + (Math.random() - 0.5) * 30, y: this.y - Math.random() * 130, vx: 0, vy: 20, life: 0.5, max: 0.5, col: '#dff7ff', r: 2.5, float: true });

    const slowK = this.slowT > 0 ? 0.5 : 1;
    const free = this.hurt <= 0 && !this.busy;
    this.blocking = free && inp.down && this.onGround;
    if (!this.busy && this.hurt <= 0) this.facing = foe.x >= this.x ? 1 : -1;

    if (this.ch.move?.(this, dt, foe)) {
      // the character's skill is steering this frame
    } else if (this.hurt > 0) {
      this.vx *= Math.pow(0.04, dt);
    } else {
      const move = free && !this.blocking ? (inp.right ? 1 : 0) - (inp.left ? 1 : 0) : 0;
      let target = move * (this.onGround ? 310 : 270) * this.ch.spd * slowK;
      if ((this.atk || this.cast > 0) && this.onGround) target = 0;
      const skillTarget = this.ch.moveTarget?.(this);
      if (skillTarget != null) target = skillTarget;
      const k = Math.min(1, dt * (this.onGround ? (this.atk ? 8 : 16) : 5));
      if (!(this.atk && !this.onGround)) this.vx += (target - this.vx) * k;
    }

    if (free && !this.blocking && inp.up && this.jumps < 2) {
      this.vy = (this.jumps === 0 ? -860 : -740) * this.ch.jump * (this.slowT > 0 ? 0.8 : 1);
      this.jumps++; this.onGround = false; sfx.jump();
      dust(this.x, this.y, 6);
    }
    if (free && !this.blocking) {
      if (inp.skill && this.skillCd <= 0) this.useSkill(foe);
      else if (this.cd <= 0) {
        if (inp.kick) this.startAttack('kick');
        else if (inp.punch) this.startAttack('punch');
      }
    }
    if (this.atk) {
      this.atk.t += dt * slowK;
      const A = ATTACKS[this.atk.type];
      if (this.atk.t >= A.dur) { this.atk = null; this.cd = A.cd; }
    }
    this.ch.tick?.(this, dt, foe);
    this.physics(dt);
    if (this.onGround) this.walk += this.vx * this.facing * dt * 0.05;
  }
  startAttack(type) { this.atk = { type, t: 0, hit: false }; sfx.swing(); }
  useSkill(foe) {
    this.skillCd = this.ch.cd;
    sfx.skill();
    this.ch.useSkill(this, foe);
  }
  physics(dt) {
    const prevX = this.x, prevY = this.y;
    const obs = solids();
    if (this.dashT <= 0) this.vy += GRAV * gravK * dt;
    // horizontal move, then push out of any obstacle side
    this.x += this.vx * dt;
    this.x = Math.max(28, Math.min(W - 28, this.x));
    for (const o of obs) {
      if (this.y > o.y + 1 && this.y - BODY_H < o.y + o.h && this.x + BODY_W > o.x && this.x - BODY_W < o.x + o.w) {
        this.x = prevX <= o.x + o.w / 2 ? o.x - BODY_W : o.x + o.w + BODY_W;
        if (this.dashT <= 0 && !this.ko) this.vx = 0;
      }
    }
    this.x = Math.max(28, Math.min(W - 28, this.x));
    this.y += this.vy * dt;
    const wasGround = this.onGround;
    this.onGround = false;
    this.standOn = null;
    if (this.y >= FLOOR) { this.y = FLOOR; this.vy = 0; this.onGround = true; }
    else if (this.vy >= 0) {
      for (const p of PLATFORMS) {
        if (this.x > p.x && this.x < p.x + p.w && prevY <= p.y + 0.5 && this.y >= p.y) {
          this.y = p.y; this.vy = 0; this.onGround = true; this.standOn = p; break;
        }
      }
      if (!this.onGround) for (const o of obs) {
        if (this.x + BODY_W > o.x && this.x - BODY_W < o.x + o.w && prevY <= o.y + 0.5 && this.y >= o.y) {
          this.y = o.y; this.vy = 0; this.onGround = true; this.standOn = o; break;
        }
      }
    } else {
      // bump head on the underside of an obstacle
      for (const o of obs) {
        const bottom = o.y + o.h;
        if (this.x + BODY_W > o.x && this.x - BODY_W < o.x + o.w && prevY - BODY_H >= bottom - 0.5 && this.y - BODY_H < bottom) {
          this.y = bottom + BODY_H; this.vy = 0; break;
        }
      }
    }
    if (this.onGround) {
      if (!wasGround && !this.ko) dust(this.x, this.y, 4);
      this.jumps = 0;
      this.ch.grounded?.(this);
    }
  }
  attackPoint() {
    if (!this.atk) return null;
    const A = ATTACKS[this.atk.type];
    if (this.atk.t < A.on || this.atk.t > A.off || this.atk.hit) return null;
    return { x: this.x + this.facing * A.reach, y: this.y - A.h, A };
  }
}

const p1 = new Fighter(0);
const p2 = new Fighter(1);
const other = f => (f === p1 ? p2 : p1);
