// Two-window online test. Needs playwright; run: python3 -m http.server 8765 (in stick-fight/), then node tests/online-test.js dist/index.html
const { chromium } = require('playwright');
const fs = require('fs');
const page = process.argv[2] || 'index.html';
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const ctx = await b.newContext({ viewport: { width: 1040, height: 1100 } });
  await ctx.addInitScript({ content: fs.readFileSync(__dirname + '/fake-room.js', 'utf8') });
  const errs = [];
  const mk = async tag => { const p = await ctx.newPage(); p.on('pageerror', e => errs.push(tag + ' ' + e.message)); p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errs.push(tag + ' ' + m.type() + ': ' + m.text()); }); await p.goto('http://localhost:8765/' + page); await p.waitForTimeout(1200); return p; };
  const H = await mk('host'), G = await mk('guest');
  await H.click('#btn-online'); await H.waitForTimeout(300);
  await H.click('#btn-host'); await H.waitForTimeout(500);
  await H.selectOption('#on-ch', '2'); // ember
  await H.selectOption('#on-arena', 'arena03');
  const code = await H.textContent('#on-code-show');
  console.log('code', code, '| host status:', await H.textContent('#on-status'));
  await G.click('#btn-online'); await G.fill('#on-code', code.toUpperCase()); await G.click('#btn-join'); await G.waitForTimeout(800);
  await G.selectOption('#on-ch', '4'); // volt
  console.log('guest status:', await G.textContent('#on-status'));
  console.log('host status:', await H.textContent('#on-status'), 'start disabled', await H.isDisabled('#btn-start'));
  await G.click('#btn-ready'); await G.waitForTimeout(500);
  console.log('host status:', await H.textContent('#on-status'), 'start disabled', await H.isDisabled('#btn-start'));
  await H.screenshot({ path: 'net-lobby-host.png' }); await G.screenshot({ path: 'net-lobby-guest.png' });
  await H.click('#btn-start'); await H.waitForTimeout(2600);
  const st = p => p.evaluate(() => { const S = __stickfight; return [S.state, S.p1.ch.id, S.p2.ch.id, S.arena.id, S.p1.x.toFixed(0), S.p2.x.toFixed(0), S.p1.hp.toFixed(0), S.p2.hp.toFixed(0)].join(' '); });
  console.log('host', await st(H)); console.log('guest', await st(G));
  // guest walks left and attacks; host stands still
  await G.bringToFront();
  await G.keyboard.down('ArrowLeft'); await G.waitForTimeout(1200); await G.keyboard.up('ArrowLeft');
  for (let i = 0; i < 8; i++) { await G.keyboard.press(i % 2 ? 'KeyK' : 'KeyL'); await G.waitForTimeout(300); }
  await G.keyboard.press('KeyJ'); await G.waitForTimeout(900);
  console.log('after guest attacks: host', await st(H)); console.log('guest', await st(G));
  // host skill
  await H.keyboard.press('KeyH'); await H.waitForTimeout(400);
  console.log('host shots', await H.evaluate(() => 0), 'guest sees', await G.evaluate(() => document.title));
  await G.locator('#stage').screenshot({ path: 'net-guest.png' }); await H.locator('#stage').screenshot({ path: 'net-host.png' });
  // platform/obstacle sync check
  const obs = p => p.evaluate(() => { const S = __stickfight; return JSON.stringify([S.arena.obstacles?.map(o => [Math.round(o.x), Math.round(o.y), o.hp]), S.arena.platforms.map(o => [Math.round(o.x), Math.round(o.y)])]); });
  console.log('obs host ', await obs(H)); console.log('obs guest', await obs(G));
  // force the match to end quickly: host K.O.s guest twice
  for (let r = 0; r < 2; r++) {
    await H.evaluate(() => { const S = __stickfight; S.p2.hp = 1; });
    await H.waitForTimeout(100);
    await H.evaluate(() => { const S = __stickfight; S.p1.x = S.p2.x - 50; });
    for (let i = 0; i < 6; i++) { await H.keyboard.press('KeyF'); await H.waitForTimeout(250); }
    await H.waitForTimeout(4200);
    console.log('round', r, 'host', await st(H), '| guest', await st(G));
  }
  await H.waitForTimeout(1000);
  console.log('host end visible', await H.isVisible('#end'), await H.textContent('#end-sub'));
  console.log('guest end visible', await G.isVisible('#end'), await G.textContent('#end-sub'), 'rematch hidden', await G.isHidden('#btn-again'));
  await G.locator('#stage').screenshot({ path: 'net-guest-end.png' });
  // rematch
  await H.click('#btn-again'); await H.waitForTimeout(2500);
  console.log('rematch host', await st(H), '| guest', await st(G), 'guest end hidden', await G.isHidden('#end'));
  // guest leaves
  await G.close({ runBeforeUnload: true }); await H.waitForTimeout(4500);
  console.log('host after guest left:', await H.evaluate(() => __stickfight.state), await H.textContent('#on-status'));
  console.log('fake max bytes', await H.evaluate(() => window.__fakeStats.maxBytes));
  console.log('errors', errs);
  await b.close();
})();
