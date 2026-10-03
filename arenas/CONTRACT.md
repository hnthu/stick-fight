# Stick Fight arena contract

The game engine lives in `/mnt/project-files/stick-fight/index.html` and is owned by the main Stick Fight thread. **Do not edit index.html.** Each arena thread writes exactly one file, `arenas/arenaNN.js` (NN = 01..10), and nothing else.

## File shape

A plain classic script (no `import`/`export`, no modules), fully self-contained:

- No external assets: no images, fonts, `fetch`, or network calls. Draw everything with the Canvas 2D API.
- No globals except the registry push below. Wrap helpers in an IIFE.
- Keep it under ~60 KB. It will be inlined into the published page.
- Must not throw at load time or in any callback. Guard everything.

```js
(function () {
  const arena = {
    id: 'arena01',            // must equal the file name
    name: 'Neon Rooftop',     // English name, short
    nameVi: 'Sân thượng Neon',// Vietnamese name, short
    hint: 'Moving platforms', // optional, ~5 words, English
    hintVi: 'Bục di chuyển',  // optional, Vietnamese
    floorY: 474,              // y of the ground line (see limits below)
    gravityScale: 1,          // optional, 0.6..1.4 (1 = normal)
    platforms: [ { x: 150, y: 330, w: 190, h: 12 } ],
    drawBackground(ctx, t) {},   // required
    drawForeground(ctx, t) {},   // optional
    update(dt, fighters, game) {}, // optional (hazards, moving platforms)
    reset(game) {},             // optional, called at the start of each round
  };
  (window.STICK_ARENAS = window.STICK_ARENAS || []).push(arena);
})();
```

## Coordinates and canvas

- Logical canvas is **960 × 540**, origin top-left, y grows downward. The engine has already applied its scale transform; draw in these units.
- `t` is seconds since page load (float). Use it for animation.
- The HUD (health bars, timer, names) covers roughly **y 0..80** across the full width. Keep important visuals out of that band.
- Fighters are ~150 px tall, ~40 px wide; `fighter.y` is the **feet** position.
- Spawn points are x = 230 (player 1) and x = 730 (player 2), standing on the floor. Keep the floor solid near both spawns.
- `floorY` must be between **400 and 490**. Fighters can't leave x 28..932 (side walls are built in).

## Platforms

- One-way: fighters land on the top edge (`y`) when falling, and can jump up through them. `h` is visual only.
- Keep each platform's `y` at least 110 px above `floorY` (or 110 px from another platform it overlaps horizontally) so fighters fit underneath. Keep `y >= 150`.
- 0 to 4 platforms. Widths 80..300.
- Moving platforms are allowed: change `x`/`y` of the platform objects inside `update`. The engine carries any fighter standing on a platform by the platform's movement that frame.
- The engine does **not** draw platforms; draw them yourself in `drawBackground` (read their current x/y so moving ones line up).

## Obstacles (solid terrain)

Optional field on the arena object:

```js
obstacles: [
  { x: 420, y: 404, w: 60, h: 70, kind: 'crate', hp: 30 },  // breakable
  { x: 600, y: 420, w: 40, h: 54, kind: 'rock' },           // unbreakable
],
```

- **Solid from every side.** Fighters stand on top, are stopped by the sides, and bump their head on the underside. The fighter body is a 32 px wide × 130 px tall box with its bottom at `fighter.y`.
- **Projectiles stop against them** (fireball, ice shard, arrows). Lightning from above is not blocked.
- **Breakable:** if `hp` is set, punches, kicks and projectiles that hit the obstacle reduce `hp` by their damage. When `hp <= 0` the obstacle becomes non-solid and the engine plays a break effect. Your draw code should stop drawing it (or draw rubble) when `o.hp <= 0`. The engine shows a small health bar on damaged breakables. Good `hp` range: 20..60.
- **Restored every round:** the engine remembers each obstacle's starting `hp` and restores it before calling your `reset(game)`. Reset positions of moving obstacles yourself in `reset`.
- **Moving obstacles:** change `x`/`y` in `update()`. The engine carries fighters standing on top, and pushes fighters out sideways if an obstacle moves into them. Don't move one fast enough to trap a fighter (keep under ~150 px/s).
- **Non-solid:** an obstacle with `w <= 0` or `h <= 0` or `hp <= 0` is ignored.
- **Draw them yourself** in `drawBackground` (read their live x/y/hp).
- `kind` is free text for your own drawing code; the engine ignores it.

Placement rules (the engine relies on these):
- Keep obstacles **out of x 170..290 and x 670..790** (the two spawn zones), and keep the bottom edge of floor obstacles at `floorY`.
- Height 30..150. A single fighter jump clears about 150 px; a double jump about 260 px. Anything taller than 110 px should leave another way around (platform, breakable, or a gap).
- Up to 4 obstacles. Leave at least 120 px of open floor somewhere between the two spawns so melee fights can still happen.
- The CPU jumps over obstacles in its path and attacks breakable ones that block it, so obstacles should be jumpable or breakable.
- Obstacles count as ground for shadows, landing, Rook's ground pound, and lightning.

## drawBackground(ctx, t)

Called every frame before fighters. Paint the **entire** 960 × 540 area (sky/walls, floor and everything below it, platforms). Keep it cheap: pre-render static layers once to an offscreen canvas (`document.createElement('canvas')`) and blit, then draw animated bits on top. Use `ctx.save()/restore()` and leave `globalAlpha`, `shadowBlur`, `filter`, and line dash reset.

Fighters are neon-ish chalk colors (orange, grey, red, cyan, yellow, blue, cream, purple, pink, green) with a soft glow. Keep backgrounds darker / lower-contrast than that so fighters stay readable; avoid large pure-white or very bright areas behind the fighting zone (y 250..floorY).

## drawForeground(ctx, t)

Optional. Drawn after fighters and effects, before the HUD. Use for subtle overlays (rain, fog, vignette, foreground silhouettes at the edges). Must not hide fighters: keep alpha low in the play area.

## update(dt, fighters, game)

Optional. Called every frame while a round is being shown (intro, fight, K.O.), and also behind the main menu. `dt` is seconds (already slowed during slow-motion). `fighters` is `[p1, p2]`.

Fighter fields you may **read**: `x, y, vx, vy, facing, onGround, hp, maxHp, ko, blocking, slot` (0 or 1).
Fighter fields you may **write**: `x, vx, vy` (pushes, wind, launch pads), `slowT` (seconds of slow effect, e.g. ice/mud). Don't write anything else; use `game.hurt` for damage.

`game` provides:

| member | meaning |
|---|---|
| `game.state` | `'menu' | 'intro' | 'fight' | 'ko' | 'over'` |
| `game.fighting` | `true` only while the round is live; hazards that hurt should check it |
| `game.hurt(fighter, opts)` | environmental damage. `opts = { dmg, kb = 200, dir = 0 (push direction ±1, 0 = away from hazard x if `fromX` given, else none), fromX, stun = 0.3, unblockable = true, heavy = false, word }`. Ignored unless `game.fighting`. Can K.O. (the other fighter wins the round). Keep hazard damage modest: 5..15 per hit, and give each fighter a cooldown (≥ 1 s) between hazard hits. |
| `game.particle({x, y, vx, vy, life, col, r, float})` | spawn a square particle; `float: true` ignores gravity |
| `game.shake(n)` | screen shake, 0..18 |
| `game.word(x, y, text, col)` | comic pop-up word |
| `game.floorY` | current floor y |
| `game.W, game.H` | 960, 540 |

Hazards must be **telegraphed** (a visible warning of at least 0.5 s before they hurt) so they feel fair, and should matter but not dominate a 60-second round.

## reset(game)

Optional. Called at the start of every round. Reset hazard timers and platform positions here.

## Testing your file

Load it standalone in a headless browser with a tiny harness: create a 960×540 canvas, define `window.STICK_ARENAS`, load your script, call `drawBackground(ctx, t)` / `drawForeground` / `update(1/60, fakeFighters, fakeGame)` for a few hundred frames with fake fighters `{x, y, vx, vy, facing:1, onGround:true, hp:100, maxHp:100, ko:false, blocking:false, slot:0, slowT:0}` and a stub `game` whose methods are no-ops, and check for zero exceptions. Screenshot one frame with two fake stick figures standing at x 230 and 730 to check readability. Chromium is at `/opt/pw-browsers/chromium` for Playwright.

When done, the main thread integrates the file, adds it to the arena select screen, and republishes the game.
