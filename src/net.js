// Stick Fight · src/net.js
// Online 1 vs 1 through the artifact "room" capability (works on the published claude.ai page only).
// The host (who creates the room) runs the whole game and plays P1 on the left. The guest plays P2:
// it sends its keys and draws the host's snapshots. Both sides only use room presence (each side's own
// state, latest value wins), so no event topics or extra permissions are needed.
// Arenas run on both sides with the same random seed per step, so moving platforms and hazards line up.
// Shares one scope with the other src files; build.py wraps them all in a single closure.

const NET_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
const NET_LEFT_AFTER = 3;   // seconds without the other player before the match is dropped
const NET_STATES = ['intro', 'fight', 'ko', 'over'];
const NET_BANNERS = ['round', 'fight', 'ko', 'time'];
// fighter fields sent in every snapshot (x, y, vx, vy first: the guest smooths those)
const NET_F = ['x', 'y', 'vx', 'vy', 'facing', 'hp', 'maxHp', 'ghost', 'onGround', 'hurt', 'cast', 'blocking', 'ko', 'koT',
  'walk', 'flash', 't', 'skillCd', 'dashT', 'armorT', 'regenT', 'slowT', 'wins', 'jumps'];
const NET_BOOL = new Set(['onGround', 'blocking', 'ko']);

const net = {
  api: undefined,          // room namespace; null when this page can't go online, undefined while asking
  room: null, role: null, code: '', since: 0,
  ch: 0, arena: 'random', ready: false,
  match: null,             // host: { id, a: arena id, c: [p1 char, p2 char] }
  shown: null,             // guest: id of the match on screen
  seed: 0, step: 0, steps: [], replaying: false,
  fx: [], fxSeq: 0, fxSeen: -1,
  inCount: [0, 0, 0, 0], inSent: '', inBase: null,
  lastSnap: null, target: [null, null], away: 0, msg: '', joinedAt: 0,
};
const netReady = (window.claude && typeof window.claude.use === 'function')
  ? window.claude.use('room').then(r => { net.api = r || null; }, () => { net.api = null; })
  : Promise.resolve().then(() => { net.api = null; });

const rd = (v, k = 100) => Math.round((+v || 0) * k) / k;
const num = (v, d = 0) => (Number.isFinite(+v) ? +v : d);
const netHostOn = () => mode === 'online' && net.role === 'host';
function netGuestActive() { return mode === 'online' && net.role === 'guest' && state !== 'lobby'; }
function netMe() { return net.role === 'guest' ? p2 : p1; }

// ---------- who is in the room ----------
function netOthers() { return net.room ? net.room.peers().filter(p => !p.sameTab && p.kind === 'viewer') : []; }
const netEarlier = (a, b) => num(a.presence.since) - num(b.presence.since) || (a.peer < b.peer ? -1 : 1);
function hostPeer() { return netOthers().find(p => p.presence.role === 'host') || null; }
// the host plays the guest who joined first; anyone later is told the room is full
function guestPeer() { return netOthers().filter(p => p.presence.role === 'guest').sort(netEarlier)[0] || null; }
function netRoomFull() {
  if (net.role !== 'guest') return false;
  const me = { presence: { since: net.since }, peer: net.room.peers().find(p => p.sameTab)?.peer || '' };
  return netOthers().some(p => p.presence.role === 'guest' && netEarlier(p, me) < 0);
}
const netCh = v => Math.max(0, Math.min(ROSTER.length - 1, num(v) | 0));

// ---------- recording what the host sees, so the guest can replay it ----------
const netRaw = { burst, word, ring, dust, sfx: { ...sfx } };
function netLog(type, ...a) {
  if (!netHostOn() || state === 'lobby') return;
  net.fx.push([++net.fxSeq, type, ...a]);
  if (net.fx.length > 24) net.fx.shift();
}
burst = (x, y, col, n, power) => { netLog('b', rd(x, 1), rd(y, 1), col, n, rd(power, 1)); netRaw.burst(x, y, col, n, power); };
word = (x, y, text, col) => {
  if (net.replaying) return; // the guest already gets the host's words
  netLog('w', rd(x, 1), rd(y, 1), String(text).slice(0, 12), col); netRaw.word(x, y, text, col);
};
ring = (x, y, col, flat) => { netLog('r', rd(x, 1), rd(y, 1), col, flat ? 1 : 0); netRaw.ring(x, y, col, flat); };
dust = (x, y, n) => { netLog('d', rd(x, 1), rd(y, 1), n); netRaw.dust(x, y, n); };
for (const k of Object.keys(sfx)) {
  const fn = sfx[k];
  sfx[k] = (...a) => { netLog('s', k, a[0] ? 1 : 0); return fn(...a); };
}
function netPlayFx(e) {
  const [, t, a, b, c, d, f] = e;
  const col = v => String(v).slice(0, 32);
  if (t === 'b') netRaw.burst(num(a), num(b), col(c), Math.min(40, num(d)), num(f));
  else if (t === 'w') netRaw.word(num(a), num(b), String(c).slice(0, 12), col(d));
  else if (t === 'r') netRaw.ring(num(a), num(b), col(c), !!d);
  else if (t === 'd') netRaw.dust(num(a), num(b), Math.min(20, num(c)));
  else if (t === 's' && Object.prototype.hasOwnProperty.call(netRaw.sfx, a)) netRaw.sfx[a](!!b);
}

// ---------- arenas: same random numbers on both sides ----------
function netSeeded(n, fn) {
  if (mode !== 'online' || !net.role) return fn();
  const saved = Math.random;
  let a = (net.seed ^ Math.imul(n + 2, 0x9e3779b1)) >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  net.replaying = net.role === 'guest';
  try { return fn(); } finally { Math.random = saved; net.replaying = false; }
}
// game.js calls these two in place of the plain arena hooks
function netArenaReset() {
  if (netHostOn()) { net.seed = (Math.random() * 4294967296) >>> 0; net.step = 0; net.steps = []; }
  netSeeded(-1, () => arenaCall('reset', game));
}
function netArenaUpdate(dt) {
  if (!netHostOn()) { arenaCall('update', dt, [p1, p2], game); return; }
  const q = Math.max(1, Math.round(dt * 1e4));
  net.step++; net.steps.push(q);
  if (net.steps.length > 30) net.steps.shift();
  netSeeded(net.step, () => arenaCall('update', q / 1e4, [p1, p2], game));
}

// ---------- host: snapshot out, guest keys in ----------
function netFighter(f) {
  const a = NET_F.map(k => (NET_BOOL.has(k) ? (f[k] ? 1 : 0) : rd(f[k])));
  a.push(f.castKind || 0, f.atk ? [f.atk.type === 'kick' ? 1 : 0, rd(f.atk.t, 1000)] : 0);
  a.push((f.ch.netFields || []).map(k => rd(f[k], 1000)));
  return a;
}
function netSendSnap() {
  const obs = arena && Array.isArray(arena.obstacles) ? arena.obstacles : [];
  const snap = {
    m: net.match.id, s: NET_STATES.indexOf(state), r: round, tm: rd(timer, 10),
    b: banner ? [NET_BANNERS.indexOf(banner.kind), banner.w ?? -1] : 0,
    sh: rd(shake, 10), fl: rd(flashScreen), rs: net.seed, st: [net.step, ...net.steps],
    f: [netFighter(p1), netFighter(p2)],
    sp: shots.slice(0, 12).map(s => [ROSTER.indexOf(s.ch), rd(s.x, 10), rd(s.y, 10), rd(s.vx, 1), rd(s.vy, 1), s.r, String(s.col || ''), rd(s.g, 1)]),
    ef: effects.filter(e => e.ch).slice(0, 6).map(e => [ROSTER.indexOf(e.ch), rd(e.x, 10), rd(e.y, 10), rd(e.t, 1000), rd(e.fire, 1000)]),
    ob: obs.map((o, i) => o && [i, rd(o.x, 10), rd(o.y, 10), o.hp == null ? -1 : rd(o.hp, 10)]).filter(Boolean).slice(0, 24),
    pl: PLATFORMS.slice(0, 16).map(p => [rd(p.x, 10), rd(p.y, 10)]),
    fx: net.fx.slice(),
  };
  // presence is capped at 4 KiB; drop the oldest effects first if a busy frame gets close
  while (JSON.stringify(snap).length > 3500 && (snap.fx.length || snap.sp.length > 3)) {
    if (snap.fx.length) snap.fx.shift(); else snap.sp.pop();
  }
  net.room.presence({ snap }).catch(() => {});
}
function netReadGuest(apply) {
  const v = guestPeer()?.presence.in;
  if (!Array.isArray(v) || v.length !== 7) return IDLE;
  const c = v.slice(3).map(n => num(n) | 0);
  const base = net.inBase || c;
  net.inBase = c;
  if (!apply) return IDLE;
  return { left: !!v[0], right: !!v[1], down: !!v[2], up: c[0] !== base[0], punch: c[1] !== base[1], kick: c[2] !== base[2], skill: c[3] !== base[3] };
}
const netGuestInput = () => netReadGuest(true);

// ---------- guest: keys out, snapshot in ----------
function netSendInput() {
  const i = state === 'fight' ? readInput([MAPS.p1, MAPS.p2]) : IDLE;
  ['up', 'punch', 'kick', 'skill'].forEach((k, n) => { if (i[k]) net.inCount[n] = (net.inCount[n] + 1) % 1000; });
  const v = [i.left ? 1 : 0, i.right ? 1 : 0, i.down ? 1 : 0, ...net.inCount];
  const key = v.join();
  if (key !== net.inSent) { net.inSent = key; net.room.presence({ in: v }).catch(() => {}); }
}
function netGuestBegin(m) {
  const list = arenaList();
  net.shown = m.id;
  mode = 'online';
  p1.setChar(ROSTER[netCh(m.c?.[0])]); p2.setChar(ROSTER[netCh(m.c?.[1])]);
  p1.wins = 0; p2.wins = 0; round = 1;
  setArena(list.find(a => a.id === m.a) || CHALK);
  p1.reset(230, 1); p2.reset(W - 230, -1);
  parts.length = 0; words.length = 0; shots.length = 0; effects.length = 0; rings.length = 0;
  restoreObstacles();
  net.seed = null; net.step = 0; net.fxSeen = -1; net.lastSnap = null; net.target = [null, null]; net.away = 0;
  initAudio();
  setScreen('stage');
  el('menu').hidden = true; el('end').hidden = true; el('pause').hidden = true; paused = false;
  state = 'intro'; banner = null;
}
function netApply(snap) {
  const prev = state;
  state = NET_STATES[num(snap.s)] || 'intro';
  round = num(snap.r, 1); timer = num(snap.tm);
  shake = Math.max(shake, num(snap.sh)); flashScreen = Math.max(flashScreen, num(snap.fl));
  game.fighting = state === 'fight'; game.state = state;
  // fighters
  const t = performance.now() / 1000;
  (Array.isArray(snap.f) ? snap.f : []).slice(0, 2).forEach((a, i) => {
    if (!Array.isArray(a)) return;
    const f = i ? p2 : p1;
    NET_F.forEach((k, j) => { if (j >= 4) f[k] = NET_BOOL.has(k) ? !!a[j] : num(a[j]); });
    f.castKind = typeof a[NET_F.length] === 'string' ? a[NET_F.length] : null;
    const atk = a[NET_F.length + 1];
    f.atk = Array.isArray(atk) ? { type: atk[0] ? 'kick' : 'punch', t: num(atk[1]), hit: true } : null;
    const extra = a[NET_F.length + 2];
    (f.ch.netFields || []).forEach((k, j) => { f[k] = num(extra?.[j]); });
    const tg = { x: num(a[0], f.x), y: num(a[1], f.y), vx: num(a[2]), vy: num(a[3]), at: t };
    if (!net.target[i] || Math.hypot(tg.x - f.x, tg.y - f.y) > 140) { f.x = tg.x; f.y = tg.y; }
    f.vx = tg.vx; f.vy = tg.vy;
    net.target[i] = tg;
  });
  // a new round: reset the arena with the host's seed
  if (snap.rs !== net.seed) {
    net.seed = num(snap.rs) >>> 0; net.step = 0;
    parts.length = 0; words.length = 0; rings.length = 0;
    restoreObstacles();
    netArenaReset();
  }
  // replay the host's arena steps we haven't run yet
  const st = Array.isArray(snap.st) ? snap.st : [0];
  const last = num(st[0]) | 0, qs = st.slice(1), first = last - qs.length + 1;
  for (let n = Math.max(net.step + 1, last - 240); n <= last; n++) {
    const q = n >= first ? num(qs[n - first], 167) : 167;
    netSeeded(n, () => arenaCall('update', Math.min(0.05, q / 1e4), [p1, p2], game));
  }
  net.step = Math.max(net.step, last);
  // obstacles and platforms as the host has them
  const obs = arena && Array.isArray(arena.obstacles) ? arena.obstacles : [];
  for (const o of Array.isArray(snap.ob) ? snap.ob : []) {
    const ob = Array.isArray(o) && obs[num(o[0]) | 0];
    if (!ob) continue;
    ob.x = num(o[1], ob.x); ob.y = num(o[2], ob.y);
    if (ob.hp != null && num(o[3]) >= 0) {
      const was = ob.hp; ob.hp = num(o[3]);
      if (was > 0 && ob.hp < was) ob._hitT = 0.15;
      if (was > 0 && ob.hp <= 0) {
        for (let i = 0; i < 26; i++) parts.push({ x: ob.x + Math.random() * ob.w, y: ob.y + Math.random() * ob.h, vx: (Math.random() - 0.5) * 420, vy: -Math.random() * 380, life: 0.7, max: 0.7, col: Math.random() < 0.5 ? C.chalk : C.dim, r: 3 + Math.random() * 4 });
      }
    }
  }
  (Array.isArray(snap.pl) ? snap.pl : []).forEach((p, i) => { if (PLATFORMS[i] && Array.isArray(p)) { PLATFORMS[i].x = num(p[0], PLATFORMS[i].x); PLATFORMS[i].y = num(p[1], PLATFORMS[i].y); } });
  // projectiles and timed effects, drawn by their character
  shots.length = 0;
  for (const s of Array.isArray(snap.sp) ? snap.sp : []) {
    if (!Array.isArray(s)) continue;
    shots.push({ ch: ROSTER[num(s[0], -1)], x: num(s[1]), y: num(s[2]), vx: num(s[3]), vy: num(s[4]), r: num(s[5], 8), col: String(s[6]).slice(0, 32), g: num(s[7]) });
  }
  effects.length = 0;
  for (const e of Array.isArray(snap.ef) ? snap.ef : []) {
    if (Array.isArray(e)) effects.push({ ch: ROSTER[num(e[0], -1)], x: num(e[1]), y: num(e[2]), t: num(e[3]), fire: num(e[4]) });
  }
  // sounds, sparks and words since the last snapshot (skip the backlog on the first one)
  const fx = Array.isArray(snap.fx) ? snap.fx.filter(Array.isArray) : [];
  const top = fx.reduce((m, e) => Math.max(m, num(e[0])), net.fxSeen);
  if (net.fxSeen >= 0) for (const e of fx) if (num(e[0]) > net.fxSeen) netPlayFx(e);
  net.fxSeen = top;
  // banner, rebuilt here so names and "You" read right on this side
  const b = Array.isArray(snap.b) ? snap.b : null;
  const kind = b && NET_BANNERS[num(b[0], -1)];
  banner = kind ? makeBanner(kind, b[1] === 0 ? p1 : b[1] === 1 ? p2 : null) : null;
  if (state === 'over' && prev !== 'over') showEnd();
}
// guest frame: runs instead of the game simulation
function netGuestFrame(dt) {
  const snap = hostPeer()?.presence.snap;
  if (snap && snap !== net.lastSnap && snap.m === net.shown) { net.lastSnap = snap; netApply(snap); }
  const t = performance.now() / 1000;
  [p1, p2].forEach((f, i) => {
    const tg = net.target[i];
    f.t += dt; f.flash = Math.max(0, f.flash - dt);
    if (f.ko) f.koT += dt;
    if (f.atk) f.atk.t += dt;
    if (!tg) return;
    const age = Math.min(0.12, t - tg.at), k = Math.min(1, dt * 22);
    f.x += (tg.x + tg.vx * age - f.x) * k;
    f.y += (Math.min(FLOOR, tg.y + tg.vy * age) - f.y) * k;
    if (f.regenT > 0 && Math.random() < 0.4) parts.push({ x: f.x + (Math.random() - 0.5) * 40, y: f.y - Math.random() * 120, vx: 0, vy: -80, life: 0.6, max: 0.6, col: '#a8f0a0', r: 3, float: true });
    if (f.slowT > 0 && Math.random() < 0.25) parts.push({ x: f.x + (Math.random() - 0.5) * 30, y: f.y - Math.random() * 130, vx: 0, vy: 20, life: 0.5, max: 0.5, col: '#dff7ff', r: 2.5, float: true });
  });
  for (const s of shots) { s.vy += s.g * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.ch?.shotTrail?.(s); }
  for (const e of effects) { if (e.fire > 0) e.fire -= dt; else e.t -= dt; }
  for (let i = rings.length - 1; i >= 0; i--) { const r = rings[i]; r.life -= dt; r.r += 420 * dt; if (r.life <= 0) rings.splice(i, 1); }
}

// ---------- every frame (from main.js) ----------
function netTick(dt) {
  if (!net.room) return;
  const playing = mode === 'online' && state !== 'lobby';
  if (net.role === 'host') {
    if (!playing) return;
    if (!guestPeer()) { net.away += dt; if (net.away > NET_LEFT_AFTER) netOpponentLeft('Your opponent left the room.'); return; }
    net.away = 0;
    if (state !== 'fight') netReadGuest(false); // keys pressed between rounds don't count
    netSendSnap();
  } else {
    const h = hostPeer(), m = h?.presence.match;
    if (h && h.presence.phase === 'match' && m && m.id !== net.shown && h.presence.snap && net.ready && !netRoomFull()) netGuestBegin(m);
    if (!playing) return;
    if (!h) { net.away += dt; if (net.away > NET_LEFT_AFTER) netOpponentLeft('The host left the room.'); return; }
    if (h.presence.phase !== 'match') { netOpponentLeft('The host went back to the lobby.'); return; }
    net.away = 0;
    netSendInput();
  }
}

// ---------- lobby ----------
function netCard(who, ch, note) {
  return `<div class="who">${who}</div>
    <h3 style="color:${ch.color}">${ch.name} <span style="color:var(--dim);font-family:var(--body);font-size:18px">${ch.title}</span></h3>
    <div class="sk"><em>${ch.skillName}:</em> ${ch.skillDesc}</div>${note ? `<div class="sk">${note}</div>` : ''}`;
}
function netArenaName(id) {
  if (id === 'random') return 'Random';
  const a = arenaList().find(x => x.id === id);
  return a ? String(a.name || a.id) : 'Random';
}
function buildLobbyLists() {
  const chSel = el('on-ch'), arSel = el('on-arena');
  if (!chSel.options.length) ROSTER.forEach((ch, i) => chSel.add(new Option(`${ch.name} (${ch.skillName})`, i)));
  const list = arenaList();
  if (arSel.options.length !== list.length + 1) {
    arSel.innerHTML = '';
    arSel.add(new Option('Random', 'random'));
    list.forEach(a => arSel.add(new Option(String(a.name || a.id) + (a.nameVi ? ` · ${a.nameVi}` : ''), a.id)));
  }
  chSel.value = String(net.ch); arSel.value = net.arena;
}
function renderLobby() {
  if (state !== 'lobby') return;
  buildLobbyLists();
  const status = el('on-status'), inRoom = !!net.room;
  el('on-start').hidden = inRoom; el('on-room').hidden = !inRoom;
  el('btn-host').disabled = el('btn-join').disabled = !net.api;
  el('btn-ready').hidden = !inRoom || net.role !== 'guest';
  el('btn-start').hidden = !inRoom || net.role !== 'host';
  if (net.api === undefined) { status.textContent = 'Connecting…'; return; }
  if (net.api === null) {
    status.textContent = 'Online play only works in the published game on claude.ai, while signed in. This copy can\'t connect.';
    return;
  }
  if (!inRoom) { status.textContent = net.msg || 'Create a room and send the code to a friend, or join with their code.'; return; }
  el('on-code-show').textContent = net.code;
  el('on-arena-wrap').hidden = net.role !== 'host';
  const me = ROSTER[net.ch], meBox = el('on-me'), themBox = el('on-them');
  const host = net.role === 'host', other = host ? guestPeer() : hostPeer();
  meBox.className = `pick ${host ? 'p1' : 'p2'}${!host && net.ready ? ' locked' : ''}`;
  themBox.className = `pick ${host ? 'p2' : 'p1'}${other && (host ? other.presence.ready : true) ? ' locked' : ''}`;
  meBox.innerHTML = netCard(`You · ${host ? 'host, left side' : 'right side'}${!host && net.ready ? ' · ready' : ''}`, me,
    host ? `Arena: ${netArenaName(net.arena)}` : '');
  if (other) {
    const p = other.presence;
    themBox.innerHTML = netCard(`Opponent${host ? (p.ready ? ' · ready' : ' · choosing') : ' · host'}`, ROSTER[netCh(p.ch)],
      host ? '' : `Arena: ${netArenaName(String(p.arena || 'random'))}`);
  } else {
    themBox.innerHTML = `<div class="who">Opponent</div><h3>Waiting…</h3><div class="sk">${host
      ? `Send your friend the code <b>${net.code.toUpperCase()}</b>. They open this game, press Online 1 vs 1 and join.`
      : 'Looking for the host of this room.'}</div>`;
  }
  el('btn-ready').textContent = net.ready ? 'Not ready' : 'Ready';
  el('btn-start').disabled = !(other && other.presence.ready);
  let text;
  if (host) text = !other ? 'Waiting for your friend to join.' : other.presence.ready ? 'Your friend is ready. Press Start match.' : 'Your friend is picking a fighter.';
  else if (netRoomFull()) text = 'This room already has two players.';
  else if (!other) text = performance.now() - net.joinedAt > 4000 ? `No one is hosting room ${net.code.toUpperCase()} right now. Check the code with your friend.` : 'Looking for the room…';
  else text = net.ready ? 'Ready. Waiting for the host to start.' : 'Pick your fighter, then press Ready.';
  if (net.room && !net.room.connected()) text = 'Reconnecting…';
  status.textContent = net.msg ? `${net.msg} ${text}` : text;
}
function showOnline() {
  initAudio();
  state = 'lobby';
  el('menu').hidden = true; el('end').hidden = true; el('pause').hidden = true; paused = false;
  setScreen('online');
  renderLobby();
  if (net.api === undefined) netReady.then(renderLobby);
}
async function netEnter(role, code) {
  if (!net.api || net.room) return;
  net.msg = '';
  el('on-status').textContent = 'Joining…';
  let room;
  try { room = await net.api.join('sf-' + code); }
  catch (e) { net.msg = 'Could not open the room. Try again in a moment.'; renderLobby(); return; }
  Object.assign(net, { room, role, code, since: Date.now(), joinedAt: performance.now(), ready: false, shown: null, inSent: '', inBase: null });
  const base = { role, ch: net.ch, since: net.since };
  room.presence(role === 'host' ? { ...base, arena: net.arena, phase: 'lobby' } : { ...base, ready: false }).catch(() => {});
  room.onPeers(() => renderLobby(), () => { if (net.room === room) netLeave('Lost the connection to the room.'); });
  room.onConnection(() => renderLobby());
  setTimeout(renderLobby, 4200);
  renderLobby();
}
function netLeave(msg) {
  const room = net.room;
  Object.assign(net, { room: null, role: null, match: null, shown: null, ready: false, msg: msg || '' });
  if (room) room.leave().catch(() => {});
  if (mode === 'online') mode = 'cpu';
  if (state === 'lobby') renderLobby();
}
function netStart() {
  if (net.role !== 'host') return;
  const g = guestPeer();
  if (!g || !g.presence.ready) { netToLobby(); return; }
  const list = arenaList();
  let idx = net.arena === 'random' ? 1 + ((Math.random() * (list.length - 1)) | 0) : list.findIndex(a => a.id === net.arena);
  if (!(idx >= 0 && idx < list.length)) idx = 0;
  arenaPick = idx;
  sel.c = [net.ch, netCh(g.presence.ch)];
  mode = 'online';
  net.match = { id: (net.match?.id || 0) + 1, a: list[idx].id, c: sel.c.slice() };
  net.fx = []; net.inBase = null; net.away = 0; net.msg = '';
  net.room.presence({ phase: 'match', match: net.match }).catch(() => {});
  startMatch();
}
function netToLobby(msg) {
  state = 'lobby'; banner = null;
  if (msg) net.msg = msg;
  if (net.role === 'host') net.room?.presence({ phase: 'lobby', snap: null }).catch(() => {});
  if (net.role === 'guest') { net.ready = false; net.room?.presence({ ready: false, in: null }).catch(() => {}); }
  showOnline();
}
function netOpponentLeft(msg) { net.away = 0; netToLobby(msg); }

el('btn-online').onclick = showOnline;
el('btn-host').onclick = () => { let c = ''; for (let i = 0; i < 4; i++) c += NET_CHARS[(Math.random() * NET_CHARS.length) | 0]; netEnter('host', c); };
el('btn-join').onclick = () => {
  const code = el('on-code').value.trim().toLowerCase();
  if (!/^[a-z0-9]{4}$/.test(code)) { net.msg = 'Room codes are 4 letters or numbers.'; renderLobby(); return; }
  netEnter('guest', code);
};
el('on-code').addEventListener('keydown', e => { if (e.key === 'Enter') el('btn-join').click(); });
el('on-ch').onchange = e => { net.ch = netCh(e.target.value); net.room?.presence({ ch: net.ch }).catch(() => {}); renderLobby(); };
el('on-arena').onchange = e => { net.arena = e.target.value; net.room?.presence({ arena: net.arena }).catch(() => {}); renderLobby(); };
el('btn-ready').onclick = () => { net.ready = !net.ready; net.msg = ''; net.room?.presence({ ready: net.ready }).catch(() => {}); renderLobby(); };
el('btn-start').onclick = netStart;
el('btn-on-back').onclick = () => { if (net.room) { netLeave(); renderLobby(); } else { netLeave(); toMenu(); } };
