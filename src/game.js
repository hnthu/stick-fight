// Stick Fight · src/game.js
// Match and round flow, pause/menu, and the per-frame update.
// Shares one scope with the other src files; build.py wraps them all in a single closure.

// ---------- game flow ----------
let state = 'menu', mode = 'cpu', round = 1, timer = ROUND_TIME, phaseT = 0, banner = null, paused = false;

function setScreen(screen) {
  el('select').hidden = screen !== 'select';
  el('arena-select').hidden = screen !== 'arena';
  el('online').hidden = screen !== 'online';
  el('stage').hidden = screen === 'select' || screen === 'arena' || screen === 'online';
  if (screen === 'stage') resize();
}
function startMatch() {
  initAudio();
  p1.setChar(ROSTER[sel.c[0]]); p2.setChar(ROSTER[sel.c[1]]);
  p1.wins = 0; p2.wins = 0; round = 1;
  setArena(chosenArena());
  setScreen('stage');
  el('menu').hidden = true; el('end').hidden = true; el('pause').hidden = true; paused = false;
  startRound();
}
function startRound() {
  p1.reset(230, 1); p2.reset(W - 230, -1);
  parts.length = 0; words.length = 0; shots.length = 0; effects.length = 0; rings.length = 0;
  timer = ROUND_TIME; phaseT = 0; slow = 0;
  restoreObstacles();
  netArenaReset();
  unstick();
  state = 'intro'; banner = makeBanner('round');
  sfx.bell();
}
function endRound(winner) {
  if (state !== 'fight') return;
  state = 'ko'; phaseT = 0;
  if (winner) winner.wins++;
  banner = makeBanner(winner && (p1.ko || p2.ko) ? 'ko' : 'time', winner);
}
// kind: 'round' | 'fight' | 'ko' | 'time' (an online guest rebuilds banners from the kind)
function makeBanner(kind, winner) {
  if (kind === 'round') return { kind, text: `Round ${round}`, sub: `${p1.ch.name} vs ${p2.ch.name}` };
  if (kind === 'fight') return { kind, text: 'Fight!', sub: '' };
  return { kind, w: winner ? winner.slot : -1, text: kind === 'ko' ? 'K.O.!' : 'Time!',
    sub: winner ? `${winner.ch.name} (${label(winner)}) takes round ${round}` : 'Draw round' };
}
function label(f) {
  if (mode === 'online') return f === netMe() ? 'You' : 'Opponent';
  return f === p1 ? 'Player 1' : 'CPU';
}
function shortLabel(f) {
  if (mode === 'online') return f === netMe() ? 'You' : 'Foe';
  return f === p1 ? 'P1' : 'CPU';
}
function finishMatch() {
  state = 'over';
  showEnd();
}
function showEnd() {
  const w = p1.wins >= WINS_NEEDED ? p1 : p2, online = mode === 'online';
  el('end-title').textContent = `${w.ch.name} wins!`;
  el('end-title').style.color = w.color;
  el('end-sub').textContent = online
    ? `${w === netMe() ? 'You win' : 'Your opponent wins'} the match, rounds ${p1.wins} to ${p2.wins}.${net.role === 'guest' ? ' The host can start a rematch.' : ''}`
    : `${label(w)} takes the match, rounds ${p1.wins} to ${p2.wins}.`;
  el('btn-again').hidden = online && net.role !== 'host';
  el('btn-change').textContent = online ? 'Back to lobby' : 'Change fighters';
  el('btn-menu').textContent = online ? 'Leave room' : 'Menu';
  el('end').hidden = false;
  (el('btn-again').hidden ? el('btn-change') : el('btn-again')).focus();
}
function togglePause() {
  if (state === 'menu' || state === 'over' || state === 'select' || state === 'arena' || state === 'lobby' || mode === 'online') return;
  paused = !paused;
  el('pause').hidden = !paused;
  if (paused) el('btn-resume').focus();
}
function attract() {
  const a = (Math.random() * 10) | 0, b = (a + 1 + ((Math.random() * 9) | 0)) % 10;
  p1.setChar(ROSTER[a]); p2.setChar(ROSTER[b]);
  const list = arenaList();
  setArena(list[(Math.random() * list.length) | 0]);
  p1.reset(230, 1); p2.reset(W - 230, -1);
  shots.length = 0; effects.length = 0;
  restoreObstacles();
  arenaCall('reset', game);
  unstick();
}
function toMenu() {
  state = 'menu'; paused = false; banner = null;
  setScreen('stage');
  el('pause').hidden = true; el('end').hidden = true; el('menu').hidden = false;
  attract();
  el('btn-1p').focus();
}


// ---------- per-frame update ----------
function update(dt) {
  if (paused || state === 'select' || state === 'arena' || state === 'lobby') return;
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt;
    if (!p.float) p.vy += 900 * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.y > FLOOR) { p.y = FLOOR; p.vy *= -0.3; p.vx *= 0.6; }
    if (p.life <= 0) parts.splice(i, 1);
  }
  for (let i = words.length - 1; i >= 0; i--) { words[i].life -= dt; words[i].y -= 30 * dt; if (words[i].life <= 0) words.splice(i, 1); }
  shake = Math.max(0, shake - 60 * dt);
  flashScreen = Math.max(0, flashScreen - dt);
  if (netGuestActive()) { netGuestFrame(dt); return; } // the host runs this match

  if (freeze > 0) { freeze -= dt; return; }
  let gdt = dt;
  if (slow > 0) { slow -= dt; gdt = dt * 0.35; }

  phaseT += dt;
  let i1 = IDLE, i2 = IDLE;

  if (state === 'menu') {
    i1 = aiInput(p1, p2, gdt); i2 = aiInput(p2, p1, gdt);
    for (const f of [p1, p2]) f.hp = Math.max(f.hp, f.maxHp * 0.4);
  } else if (state === 'intro') {
    if (phaseT > 1.1 && banner?.kind !== 'fight') banner = makeBanner('fight');
    if (phaseT > 1.7) { state = 'fight'; banner = null; phaseT = 0; }
  } else if (state === 'fight') {
    i1 = readInput([MAPS.p1, MAPS.p2]); // either key set plays
    i2 = mode === 'online' ? netGuestInput() : aiInput(p2, p1, gdt);
    timer -= gdt;
    if (timer <= 0) {
      timer = 0;
      const r1 = p1.hp / p1.maxHp, r2 = p2.hp / p2.maxHp;
      endRound(r1 > r2 ? p1 : r2 > r1 ? p2 : null);
    }
  } else if (state === 'ko') {
    if (phaseT > 2.4) {
      if (p1.wins >= WINS_NEEDED || p2.wins >= WINS_NEEDED) finishMatch();
      else { round++; startRound(); }
    }
  }

  game.fighting = state === 'fight';
  const movers = [...PLATFORMS, ...solids()];
  for (const p of movers) { p._px = p.x; p._py = p.y; }
  netArenaUpdate(gdt);
  for (const f of [p1, p2]) {
    const p = f.standOn;
    if (f.onGround && p && movers.includes(p) && Number.isFinite(p._px)) { f.x += p.x - p._px; f.y += p.y - p._py; }
  }
  p1.update(gdt, i1, p2);
  p2.update(gdt, i2, p1);
  separate(p1, p2);
  updateShots(gdt);
  if (state === 'fight' || state === 'menu') { resolveHit(p1, p2); resolveHit(p2, p1); }
}
