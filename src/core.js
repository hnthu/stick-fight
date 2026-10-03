// Stick Fight · src/core.js
// Constants, canvas, colors, the character registry and DOM helpers.
// Shares one scope with the other src files; build.py wraps them all in a single closure.

const W = 960, H = 540, GRAV = 2300, ROUND_TIME = 60, WINS_NEEDED = 2;
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const css = getComputedStyle(document.documentElement);
const C = {
  chalk: css.getPropertyValue('--chalk').trim() || '#ecebe2',
  dim: css.getPropertyValue('--dim').trim() || '#9db0a7',
  p1: css.getPropertyValue('--p1').trim() || '#ff8a6e',
  p2: css.getPropertyValue('--p2').trim() || '#7cc6f0',
  gold: css.getPropertyValue('--gold').trim() || '#f3d35b',
  ink: '#141b18',
};
const FONT_D = '"Permanent Marker", "Comic Sans MS", cursive';
const FONT_B = '"Patrick Hand", "Comic Sans MS", cursive';
// the current arena sets these; the chalkboard defaults are used until one is picked
let FLOOR = 474, gravK = 1;
let PLATFORMS = [ { x: 150, y: 330, w: 190, h: 12 }, { x: 620, y: 330, w: 190, h: 12 } ];


// ---------- characters ----------
// Each characters/<id>.js file calls defineCharacter(); load order sets roster order.
const ROSTER = [];
function defineCharacter(def) { ROSTER.push(def); }

// ---------- dom ----------
const el = id => document.getElementById(id);

// ---------- canvas sizing ----------
function resize() {
  const r = cv.getBoundingClientRect();
  if (!r.width) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const scale = r.width / W;
  cv.width = Math.max(1, Math.round(r.width * dpr));
  cv.height = Math.max(1, Math.round(r.height * dpr));
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();
