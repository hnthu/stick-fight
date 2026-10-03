# Stick Fight: code layout

Published game: https://claude.ai/artifact/N4nmHXxQty6tNFcvJG2mkv (built from `dist/index.html`).

```
index.html            page markup; loads the files below in order (open it locally to play the dev version)
src/style.css         page styles
src/modules.txt       load order of every game script (index.html and build.py both follow it)
src/core.js           constants, canvas, colors, character registry (defineCharacter), el()
src/audio.js          sound effects (WebAudio)
src/input.js          keyboard + touch, key maps for P1/P2
characters/*.js       one file per fighter: stats, skill, CPU skill rule, look (see below)
src/fighter.js        Fighter class: movement, jumps, punch/kick, physics, obstacle collisions
src/combat.js         particles, projectiles, timed effects, damage(), hit detection
src/ai.js             CPU opponent (explained in docs/cpu-ai.md)
src/arena.js          chalkboard arena, arena registry/hooks, solid obstacles
arenas/arenaNN.js     the 10 arenas; rules in arenas/CONTRACT.md
src/render.js         poses, stick figures, HUD, frame drawing
src/game.js           match/round flow, pause, menu, per-frame update()
src/ui.js             character select, arena select, buttons
src/net.js            online 1 vs 1: room-code lobby, host/guest sync over the artifact `room` capability
src/main.js           boot + animation loop
build.py              bundles everything into dist/index.html (one file)
```

All `src/` and `characters/` files share one scope (in `index.html` as plain scripts, in `dist/` inside one closure), so a later file can use anything an earlier file declares. Top-level code may only use things from files loaded **before** it; functions can call anything at runtime.

## Publish

```
python3 build.py        # writes dist/index.html
```
Then publish `dist/index.html` to the same Artifact URL with `capabilities: {room: {}}` (online play needs it).

## Add a character

1. Copy a file in `characters/` (e.g. `ember.js` for a projectile, `kage.js` for a movement skill) and rename it.
2. Add its path to `src/modules.txt` and a matching `<script>` tag in `index.html` (same spot as the others). Roster order = load order.

A character is one `defineCharacter({...})` call:

| field / hook | meaning |
|---|---|
| `id, name, title, color` | identity (`id` must be unique) |
| `hp, spd, jump, pow` | max health; speed, jump and damage multipliers (1 = normal) |
| `thick, tagLift` | optional: thicker lines; raise the name tag (tall hats) |
| `skillName, skillDesc, cd` | skill text and cooldown in seconds |
| `useSkill(f, foe)` | **required**: start the skill |
| `reset(f)` | set this character's own fields at round start |
| `busy(f)` | true while the skill locks the fighter (no attacks/blocks) |
| `threat(f)` | true while the skill can hit (the CPU may block) |
| `move(f, dt, foe)` | steer the fighter this frame; return true to skip normal movement |
| `moveTarget(f)` | override walking speed (return a number) or null |
| `tick(f, dt, foe)` | runs every frame just before physics |
| `grounded(f)` | runs every frame the fighter is on the ground |
| `onHurt(f, ko)` | cancel the skill when hit (ko = knocked out) |
| `pose(f, P)` | change the stick-figure pose while the skill runs |
| `aiWantsSkill(me, foe, adx, dy, r)` | CPU rule: return true to use the skill now (`r` is a random 0..1) |
| `drawGear(g, f, gear)` | draw hats/props; `gear` has `P(x,y)` head-relative points, `hx, hy, neck, hip, s, col, wave, trail` |
| `gearBehind, hideEye` | draw gear behind the body; hide the default eye dot |

Engine statuses any skill can set on a fighter: `cast`/`castKind` ('throw', 'raise', 'flex'), `dashT` (no gravity, can't be hit), `armorT` (quarter damage, no stun), `regenT` (+12 hp/s), `slowT` (half speed). Shared helpers: `shots.push({...})` for projectiles (with `draw(g, s)` and optional `trail(s)`), `effects.push({ update(dt), draw(g), danger })` for timed effects, `damage(attacker, target, opts)`, `parts`, `burst`, `ring`, `word`, `sfx`, `other(f)`.

## Add an arena

Write `arenas/arenaNN.js` following `arenas/CONTRACT.md`, then add its `<script>` tag in `index.html` next to the other arenas.

## Online 1 vs 1 (src/net.js)

Works only on the published claude.ai page, for signed-in people the artifact is shared with (`claude.use('room')` returns null elsewhere and the lobby says so).

- One player creates a room and gets a 4-character code; the other joins with it. Room name: `sf-<code>`.
- The **host** (creator, P1, left) runs the real game. The **guest** (P2, right) runs no simulation: it sends its keys and draws the host's snapshots.
- Everything travels as room presence (no event topics): guest `in: [left, right, down, upCount, punchCount, kickCount, skillCount]`; host `snap` (fighters, shots, effects, obstacles, platforms, recent sounds/sparks/words), kept under 4 KiB.
- Arenas run on both sides: the host sends the dt of each arena step and a seed per round, and `Math.random` is seeded per step, so moving platforms and hazards line up. Only the host deals damage (`game.hurt` is a no-op on the guest).
- New character visuals must draw from data so the guest can draw them: use `shotDraw(g, s)` / `shotTrail(s)` / `effectDraw(g, e)` on the character and put `ch: this` on shots and effects. Character fields the pose or gear reads go in `netFields: ['field']`.
- Test locally: `tests/fake-room.js` fakes the room over BroadcastChannel; `tests/online-test.js` plays a host and a guest window through lobby, match, rematch and leaving.
