// Stick Fight · src/ui.js
// Character select and arena select screens, menu buttons.
// Shares one scope with the other src files; build.py wraps them all in a single closure.

// ---------- character select ----------
const sel = { c: [0, 2], locked: [false, false], timer: null };
const roster = el('roster');
ROSTER.forEach((ch, i) => {
  const b = document.createElement('button');
  b.className = 'char'; b.id = `char-${ch.id}`; b.dataset.i = i;
  b.setAttribute('aria-label', `${ch.name}, ${ch.title}. Skill: ${ch.skillName}`);
  b.innerHTML = `<span class="tag t1">P1</span><span class="tag t2">P2</span><canvas width="160" height="200"></canvas><b style="color:${ch.color}">${ch.name}</b><small>${ch.skillName}</small>`;
  b.addEventListener('click', () => { const w = picker(); if (w == null) return; sel.c[w] = i; lockPick(w); });
  b.addEventListener('pointerenter', () => { const w = picker(); if (w != null && !sel.locked[w]) { sel.c[w] = i; renderSelect(); } });
  roster.appendChild(b);
});
function picker() { return !sel.locked[0] ? 0 : !sel.locked[1] ? 1 : null; }
function showSelect(m) {
  initAudio();
  mode = m; state = 'select';
  sel.locked = [false, false];
  clearTimeout(sel.timer);
  el('menu').hidden = true; el('end').hidden = true;
  setScreen('select');
  renderSelect();
}
function moveCursor(w, d) {
  if (w == null || sel.locked[w]) return;
  sel.c[w] = (sel.c[w] + d + ROSTER.length) % ROSTER.length;
  sfx.move(); renderSelect();
}
function lockPick(w) {
  if (w == null || sel.locked[w]) return;
  sel.locked[w] = true; sfx.pick(); renderSelect();
  if (sel.locked[0] && sel.locked[1]) sel.timer = setTimeout(() => { if (state === 'select') showArenaSelect(); }, 500);
}
function unlockLast() {
  clearTimeout(sel.timer);
  if (sel.locked[1]) sel.locked[1] = false;
  else if (sel.locked[0]) sel.locked[0] = false;
  else { toMenu(); return; }
  renderSelect();
}
const NAV1 = { KeyA: -1, KeyD: 1, KeyW: -5, KeyS: 5 }, NAV2 = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5 };
function selectKey(code) {
  if (code === 'Escape' || code === 'Backspace') { unlockLast(); return; }
  if (mode === 'cpu') {
    const w = picker();
    if (code in NAV1) moveCursor(w, NAV1[code]);
    else if (code in NAV2) moveCursor(w, NAV2[code]);
    else if (code === 'KeyF' || code === 'KeyK') lockPick(w);
  } else {
    if (code in NAV1) moveCursor(0, NAV1[code]);
    else if (code in NAV2) moveCursor(1, NAV2[code]);
    else if (code === 'KeyF') lockPick(0);
    else if (code === 'KeyK') lockPick(1);
  }
}
function statRow(name, v) { return `<span>${name}</span><span class="bar"><i style="width:${Math.round(Math.max(0.08, Math.min(1, v)) * 100)}%"></i></span>`; }
function renderSelect() {
  const w = picker();
  const who2 = mode === 'cpu' ? 'CPU' : 'Player 2';
  el('sel-title').textContent = w === 0 ? 'Player 1, pick a fighter' : w === 1 ? (mode === 'cpu' ? 'Now pick the CPU\'s fighter' : 'Player 2, pick a fighter') : 'Get ready!';
  el('sel-hint').innerHTML = mode === 'cpu'
    ? 'Move with <kbd>A</kbd><kbd>D</kbd><kbd>W</kbd><kbd>S</kbd>, lock in with <kbd>F</kbd>, or click. <kbd>Esc</kbd> goes back.'
    : 'P1: <kbd>A</kbd><kbd>D</kbd><kbd>W</kbd><kbd>S</kbd> + <kbd>F</kbd>. P2: arrows + <kbd>K</kbd>. Or click. <kbd>Esc</kbd> goes back.';
  roster.querySelectorAll('.char').forEach((b, i) => {
    b.classList.toggle('c1', sel.c[0] === i);
    b.classList.toggle('c2', sel.c[1] === i && (sel.locked[0] || mode !== 'cpu'));
    b.classList.toggle('l1', sel.locked[0] && sel.c[0] === i);
    b.classList.toggle('l2', sel.locked[1] && sel.c[1] === i);
    b.querySelector('.t2').textContent = mode === 'cpu' ? 'CPU' : 'P2';
  });
  [0, 1].forEach(k => {
    const ch = ROSTER[sel.c[k]], box = el(`pick-${k}`);
    const name = k === 0 ? 'Player 1' : who2;
    const waiting = k === 1 && mode === 'cpu' && !sel.locked[0];
    box.classList.toggle('locked', sel.locked[k]);
    box.innerHTML = waiting
      ? `<div class="who">${name}</div><h3>Waiting</h3><div class="sk">Pick Player 1 first, then choose who the CPU plays.</div>`
      : `<div class="who">${name}${sel.locked[k] ? ' &middot; locked in' : ''}</div>
         <h3 style="color:${ch.color}">${ch.name} <span style="color:var(--dim);font-family:var(--body);font-size:18px">${ch.title}</span></h3>
         <div class="sk"><em>${ch.skillName}:</em> ${ch.skillDesc}</div>
         <div class="stats">${statRow('Health', (ch.hp - 60) / 75)}${statRow('Speed', (ch.spd - 0.55) / 0.85)}${statRow('Power', (ch.pow - 0.7) / 0.55)}${statRow('Jump', (ch.jump - 0.6) / 0.6)}</div>`;
  });
}
// ---------- arena select ----------
const agrid = el('arena-grid');
let arenaCursor = 0, arenaBuilt = 0;
// cursor index: 0 = Random, 1.. = arenaList() entries
function buildArenaGrid() {
  const list = arenaList();
  if (arenaBuilt === list.length) return;
  arenaBuilt = list.length;
  agrid.innerHTML = '';
  const rnd = document.createElement('button');
  rnd.className = 'arena'; rnd.id = 'arena-random';
  rnd.innerHTML = '<div class="rnd">?</div><b>Random</b><small>Ngẫu nhiên: any arena</small>';
  agrid.appendChild(rnd);
  list.forEach(a => {
    const b = document.createElement('button');
    b.className = 'arena'; b.id = `arena-${a.id}`;
    const name = String(a.name || a.id), vi = a.nameVi ? String(a.nameVi) : '';
    const hint = [vi, a.hintVi || a.hint].filter(Boolean).join(' · ');
    b.innerHTML = `<canvas width="320" height="180"></canvas><b></b><small></small>`;
    b.querySelector('b').textContent = name; b.querySelector('small').textContent = hint;
    agrid.appendChild(b);
    const g = b.querySelector('canvas').getContext('2d');
    g.setTransform(1 / 3, 0, 0, 1 / 3, 0, 0);
    const prev = arena; arena = a;
    g.fillStyle = '#18201d'; g.fillRect(0, 0, W, H);
    arenaCall('drawBackground', g, 1.5);
    arena = prev;
  });
  [...agrid.children].forEach((b, i) => {
    b.addEventListener('click', () => { arenaCursor = i; pickArena(); });
    b.addEventListener('pointermove', () => { if (arenaCursor !== i) { arenaCursor = i; renderArenaSelect(); } });
  });
}
function renderArenaSelect() {
  [...agrid.children].forEach((b, i) => b.classList.toggle('cur', i === arenaCursor));
}
function showArenaSelect() {
  state = 'arena';
  buildArenaGrid();
  arenaCursor = Math.min(arenaCursor, agrid.children.length - 1);
  setScreen('arena');
  renderArenaSelect();
}
function pickArena() {
  arenaPick = arenaCursor === 0 ? -1 : arenaCursor - 1;
  sfx.pick();
  startMatch();
}
function arenaKey(code) {
  const n = agrid.children.length;
  const cols = Math.max(1, getComputedStyle(agrid).gridTemplateColumns.split(' ').length);
  const d = { KeyA: -1, ArrowLeft: -1, KeyD: 1, ArrowRight: 1, KeyW: -cols, ArrowUp: -cols, KeyS: cols, ArrowDown: cols }[code];
  if (d) { arenaCursor = (arenaCursor + d + n * 10) % n; sfx.move(); renderArenaSelect(); }
  else if (code === 'KeyF' || code === 'KeyK') pickArena();
  else if (code === 'Escape' || code === 'Backspace') { state = 'select'; sel.locked[1] = false; setScreen('select'); renderSelect(); }
}
el('btn-arena-back').onclick = () => arenaKey('Escape');

el('btn-random').onclick = () => {
  for (const w of [0, 1]) if (!sel.locked[w]) { sel.c[w] = (Math.random() * ROSTER.length) | 0; }
  if (!sel.locked[0]) lockPick(0);
  if (!sel.locked[1]) lockPick(1);
};
el('btn-back').onclick = toMenu;

el('btn-1p').onclick = () => showSelect('cpu');
el('btn-2p').onclick = () => showSelect('2p');
el('btn-again').onclick = () => (mode === 'online' ? netStart() : startMatch());
el('btn-change').onclick = () => (mode === 'online' ? netToLobby() : showSelect(mode));
el('btn-menu').onclick = () => { if (mode === 'online') netLeave(); toMenu(); };
el('btn-resume').onclick = togglePause;
el('btn-quit').onclick = toMenu;
