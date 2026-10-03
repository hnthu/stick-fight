// Stick Fight · src/audio.js
// Sound effects made with WebAudio (no files).
// Shares one scope with the other src files; build.py wraps them all in a single closure.

// ---------- sound ----------
let actx = null, muted = false;
function initAudio() {
  if (actx) return;
  try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; }
}
function noise(dur, freq, gain, q = 1) {
  if (!actx || muted) return;
  const len = Math.floor(actx.sampleRate * dur);
  const buf = actx.createBuffer(1, len, actx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
  const src = actx.createBufferSource(); src.buffer = buf;
  const f = actx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq; f.Q.value = q;
  const g = actx.createGain(); g.gain.value = gain;
  src.connect(f).connect(g).connect(actx.destination); src.start();
}
function tone(f0, f1, dur, gain, type = 'square') {
  if (!actx || muted) return;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type; const t = actx.currentTime;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur);
}
const sfx = {
  swing: () => noise(0.09, 2400, 0.08),
  hit: heavy => { noise(heavy ? 0.22 : 0.14, heavy ? 700 : 1100, heavy ? 0.6 : 0.45); tone(heavy ? 160 : 220, 60, 0.12, 0.12); },
  block: () => tone(900, 600, 0.08, 0.06, 'triangle'),
  jump: () => tone(300, 520, 0.09, 0.04, 'triangle'),
  ko: () => { noise(0.5, 500, 0.7); tone(200, 40, 0.6, 0.2, 'sawtooth'); },
  bell: () => { tone(880, 860, 0.6, 0.08, 'sine'); tone(1320, 1300, 0.5, 0.04, 'sine'); },
  skill: () => { tone(400, 900, 0.18, 0.06, 'triangle'); noise(0.15, 3000, 0.1); },
  zap: () => { noise(0.35, 4000, 0.5); tone(1200, 80, 0.3, 0.1, 'sawtooth'); },
  boom: () => { noise(0.4, 300, 0.8); tone(120, 40, 0.4, 0.2, 'sine'); },
  pick: () => tone(660, 990, 0.08, 0.05, 'triangle'),
  move: () => tone(500, 520, 0.03, 0.025, 'triangle'),
};
