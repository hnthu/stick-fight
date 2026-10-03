// Stick Fight · src/input.js
// Keyboard and touch input; key maps for both players.
// Shares one scope with the other src files; build.py wraps them all in a single closure.

// ---------- input ----------
const keys = new Set(), pressed = new Set();
const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space']);
window.addEventListener('keydown', e => {
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return; // typing a room code
  if (GAME_KEYS.has(e.code) && state !== 'menu') e.preventDefault();
  if (!e.repeat) pressed.add(e.code);
  keys.add(e.code);
  if (state === 'select') { if (!e.repeat) selectKey(e.code); return; }
  if (state === 'arena') { if (!e.repeat) arenaKey(e.code); return; }
  if (state === 'lobby') return;
  if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) togglePause();
  if (e.code === 'KeyM' && !e.repeat) muted = !muted;
});
window.addEventListener('keyup', e => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

document.querySelectorAll('#touch button').forEach(btn => {
  const k = btn.dataset.k;
  const down = e => { e.preventDefault(); keys.add(k); pressed.add(k); btn.classList.add('on'); initAudio(); };
  const up = e => { e.preventDefault(); keys.delete(k); btn.classList.remove('on'); };
  btn.addEventListener('pointerdown', down);
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('pointerleave', up);
});

const MAPS = {
  p1: { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS', punch: 'KeyF', kick: 'KeyG', skill: 'KeyH' },
  p2: { left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown', punch: 'KeyK', kick: 'KeyL', skill: 'KeyJ' },
};
const IDLE = { left: false, right: false, up: false, down: false, punch: false, kick: false, skill: false };
function readInput(maps) {
  const inp = { ...IDLE };
  for (const m of maps) {
    inp.left ||= keys.has(m.left); inp.right ||= keys.has(m.right); inp.down ||= keys.has(m.down);
    inp.up ||= pressed.has(m.up); inp.punch ||= pressed.has(m.punch); inp.kick ||= pressed.has(m.kick);
    inp.skill ||= pressed.has(m.skill);
  }
  return inp;
}
