// Stick Fight · src/main.js
// Boot: start the attract mode and the animation loop.
// Shares one scope with the other src files; build.py wraps them all in a single closure.

// ---------- loop ----------
let last = performance.now();
attract();
roster.querySelectorAll('canvas').forEach((c, i) => drawPortrait(c, ROSTER[i]));
function frame(t) {
  const dt = Math.min(0.033, (t - last) / 1000);
  last = t;
  now = t / 1000;
  game.state = state;
  update(dt);
  netTick(dt);
  pressed.clear();
  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
// redraw portraits once the chalk fonts arrive (they don't use text, but keep layout settled)
if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
window.__stickfight = { p1, p2, ROSTER, sel, game, solids, arenaList, setArena, get arena() { return arena; }, showArenaSelect, get state() { return state; }, startMatch, showSelect, net, netToLobby };
