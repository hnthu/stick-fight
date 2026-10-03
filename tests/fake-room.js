// Fake claude.use('room') over BroadcastChannel, presence coalesced at 30 Hz with 40 ms latency.
(() => {
  const myPeer = Math.random().toString(36).slice(2, 10);
  function makeRoom(name) {
    const bc = new BroadcastChannel('fake-' + name);
    let mine = {}, dirty = true, left = false;
    const others = new Map(); // peer -> {presence, updatedAt}
    const peerL = [], connL = [];
    let snapshot = Object.freeze([]);
    const rebuild = () => {
      const arr = [{ peer: myPeer, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze({ ...mine }), updatedAt: Date.now() }];
      for (const [p, o] of others) arr.push(o.obj);
      snapshot = Object.freeze(arr);
      peerL.forEach(fn => fn({ peers: snapshot, joined: [], left: [], updated: [] }));
    };
    bc.onmessage = ev => setTimeout(() => {
      if (left) return;
      const m = ev.data;
      if (m.t === 'bye') { others.delete(m.peer); rebuild(); return; }
      if (m.t === 'hello') dirty = true;
      if (m.t === 'p' || m.t === 'hello') {
        if (m.t === 'p' || m.presence) {
          const obj = Object.freeze({ peer: m.peer, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: Object.freeze(m.presence || {}), updatedAt: Date.now() });
          others.set(m.peer, { obj }); rebuild();
        }
      }
    }, 40);
    const iv = setInterval(() => { if (dirty && !left) { dirty = false; bc.postMessage({ t: 'p', peer: myPeer, presence: mine }); rebuild(); } }, 33);
    bc.postMessage({ t: 'hello', peer: myPeer });
    window.addEventListener('pagehide', () => bc.postMessage({ t: 'bye', peer: myPeer }));
    window.__fakeStats = window.__fakeStats || { maxBytes: 0 };
    return {
      name,
      presence(patch) {
        const next = { ...mine };
        for (const k in patch) { if (patch[k] === null) delete next[k]; else next[k] = patch[k]; }
        const bytes = new TextEncoder().encode(JSON.stringify(next)).length;
        window.__fakeStats.maxBytes = Math.max(window.__fakeStats.maxBytes, bytes);
        if (bytes > 4096) return Promise.reject({ code: 'invalid_argument', message: 'too big ' + bytes });
        mine = next; dirty = true; return Promise.resolve();
      },
      peers: () => snapshot,
      onPeers(fn) { peerL.push(fn); setTimeout(() => fn({ peers: snapshot, joined: snapshot, left: [], updated: [] })); return () => {}; },
      onConnection(fn) { setTimeout(() => fn(true)); return () => {}; },
      connected: () => true,
      emit: () => Promise.resolve(), on: () => () => {},
      leave() { left = true; clearInterval(iv); bc.postMessage({ t: 'bye', peer: myPeer }); return Promise.resolve(); },
    };
  }
  const api = { join: async name => { if (!/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(name)) throw { code: 'invalid_argument' }; return makeRoom(name); } };
  window.claude = { use: async n => (n === 'room' ? api : null) };
})();
