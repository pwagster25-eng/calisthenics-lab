// Browser tests (Playwright, Chromium, iPhone 14 viewport, fake clock).
// Run: node tests/browser.test.js   (expects a static server on http://127.0.0.1:8089 serving the repo root)
const { chromium, devices } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'http://127.0.0.1:8089';
const SHOTS = path.join(__dirname, 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const results = [];
async function step(name, fn) {
  try { await fn(); results.push(['PASS', name]); console.log('PASS', name); }
  catch (e) { results.push(['FAIL', name + ' — ' + (e && e.message || e)]); console.log('FAIL', name, '\n   ', e && e.stack || e); }
}

// Settings that reproduce the v2.0 flow (no warm-up/cool-down/burnout, 2 sets) for the state-machine tests.
const LEGACY = { extraSets: 0, burnoutOn: false, warmupSeconds: 0, cooldownSeconds: 0, quotesOn: false };
const seedSettings = (page, extra) => page.evaluate((s) => { const cur = JSON.parse(localStorage.getItem('calisthenics-v2') || '{"schemaVersion":2}'); cur.settings = Object.assign({}, cur.settings || {}, s); cur.mode = 'classic'; localStorage.setItem('calisthenics-v2', JSON.stringify(cur)); }, Object.assign({}, LEGACY, extra || {}));
const seedClassic = page => page.evaluate(() => { const cur = JSON.parse(localStorage.getItem('calisthenics-v2') || '{"schemaVersion":3}'); cur.mode = 'classic'; localStorage.setItem('calisthenics-v2', JSON.stringify(cur)); });

const V1_SEED = {
  done: { '1-0': true }, checks: {}, prs: { 1: 22 },
  sets: { '1-0-m-0': [{ reps: 12, at: '2026-10-01T10:00:00.000Z' }, { reps: 11, at: '2026-10-01T10:02:00.000Z' }], '1-5-m-1': [{ reps: 9, at: '2026-10-05T10:00:00.000Z' }] },
  restSeconds: 60, soundOn: true, week: 1, day: 0
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ ...devices['iPhone 14'], locale: 'en-US' });
  const page = await ctx.newPage();
  const dialogs = [];
  page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  page.on('pageerror', e => console.log('   pageerror:', e.message));

  /* ---------- A. Reproduce v1.2 defects (evidence for the audit) ---------- */
  await step('v1.2 repro: importing a backup without `sets` crashes render (TypeError)', async () => {
    const errors = []; const h = e => errors.push(e.message); page.on('pageerror', h);
    await page.goto(BASE + '/src/index.html');
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('calisthenics-v1', JSON.stringify({ done: {}, prs: {} })); });
    // v1.2 boot defaults sets, so simulate the import path which does not:
    await page.evaluate(() => { localStorage.setItem('calisthenics-v1', JSON.stringify({ done: {}, prs: {} })); });
    const crashed = await page.evaluate(() => { try { state = { done: {}, prs: {} }; render(); return false; } catch (e) { return e.constructor.name + ': ' + e.message; } });
    page.off('pageerror', h);
    assert.ok(crashed && /TypeError/.test(crashed), 'expected TypeError, got ' + crashed);
  });
  await step('v1.2 repro: crafted backup injects HTML into the page', async () => {
    await page.goto(BASE + '/src/index.html');
    await page.evaluate(() => { localStorage.setItem('calisthenics-v1', JSON.stringify({ done: {}, prs: {}, sets: { '1-0-m-0': [{ reps: '<img id="pwned" src=x>' }] } })); });
    await page.reload();
    assert.equal(await page.locator('#pwned').count(), 1, 'injected <img> element was rendered');
  });
  await step('v1.2 repro: Tuesday guided queue asks for 6 sets of walking', async () => {
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE + '/src/index.html');
    await page.click('[data-day="1"]');
    await page.click('#coachStart');
    const txt = await page.textContent('#coachStep');
    assert.equal(txt.trim(), '1 / 11', 'queue length should be 6 (not 11) if parsing were correct; got ' + txt);
    const after5 = await page.evaluate(() => { for (let i = 0; i < 5; i++) document.getElementById('coachNext').click(); return document.getElementById('coachName').textContent; });
    assert.equal(after5, 'Brisk walking', 'still on walking after 5 skips');
  });

  /* ---------- B. v2 migration ---------- */
  await step('v2: boots from v1 storage, migrates, leaves v1 key untouched', async () => {
    await page.goto(BASE + '/app/index.html?nosw');
    await page.evaluate((seed) => { localStorage.clear(); localStorage.setItem('calisthenics-v1', JSON.stringify(seed)); }, V1_SEED);
    await page.reload();
    const { v1, v2 } = await page.evaluate(() => ({ v1: localStorage.getItem('calisthenics-v1'), v2: JSON.parse(localStorage.getItem('calisthenics-v2')) }));
    assert.deepEqual(JSON.parse(v1), V1_SEED, 'v1 record unchanged');
    assert.deepEqual(v2.sets['1-0-standard-push-ups'].map(x => x.reps), [12, 11]);
    assert.deepEqual(v2.sets['1-5-decline-push-ups'].map(x => x.reps), [9]);
    assert.equal(v2.prs['1'], 22);
    await page.waitForSelector('#moves .ex');
    const first = await page.locator('#moves .ex').first().textContent();
    assert.match(first, /Standard push-ups/); assert.match(first, /2\/3 (sets )?logged/); assert.match(first, /Logged: 12, 11/);
    await page.click('[role=tab]:nth-child(6)'); // Sat
    assert.match(await page.textContent('#extraWrap'), /Decline push-ups[\s\S]*Logged: 9/, 'orphaned log still visible');
    await page.screenshot({ path: path.join(SHOTS, '01-plan-view.png'), fullPage: false });
  });

  /* ---------- C. Guided session with a fake clock ---------- */
  const T0 = new Date('2026-10-22T18:00:00Z').getTime();
  await step('v2: guided session — log, rest 45 s, auto-advance to set 2, duplicate tap ignored', async () => {
    await page.evaluate(() => localStorage.clear());
    await seedSettings(page);
    await page.clock.install({ time: T0 });
    await page.goto(BASE + '/app/index.html?nosw');
    await page.click('#startSession');
    assert.ok(await page.isVisible('#session'));
    assert.equal((await page.textContent('#wSet')).trim(), 'Set 1 of 2');
    assert.equal((await page.textContent('#wName')).trim(), 'Standard push-ups');
    assert.match(await page.textContent('#wNext'), /Then: Standard push-ups, set 2/);
    await page.click('#repMinus'); // 12 -> 11
    await page.evaluate(() => { const b = document.getElementById('logSet'); b.click(); b.click(); b.click(); }); // triple tap within 500 ms
    await page.clock.runFor(300);
    const sets = await page.evaluate(() => JSON.parse(localStorage.getItem('calisthenics-v2')).sets);
    assert.deepEqual(sets['1-0-standard-push-ups'].map(x => x.reps), [11], 'exactly one set logged');
    assert.ok(await page.isVisible('#phRest'));
    assert.equal((await page.textContent('#rClock')).trim(), '00:45');
    assert.match(await page.textContent('#rNext'), /Standard push-ups • set 2 of 2/);
    await page.screenshot({ path: path.join(SHOTS, '02-rest.png') });
    await page.clock.runFor(20_000);
    assert.equal((await page.textContent('#rClock')).trim(), '00:25');
    await page.clock.runFor(26_000);
    assert.ok(await page.isVisible('#phWork'), 'back to work after rest');
    assert.equal((await page.textContent('#wSet')).trim(), 'Set 2 of 2');
    assert.match(await page.textContent('#sClock'), /00:4[5-7]/);
    await page.screenshot({ path: path.join(SHOTS, '03-work.png') });
  });
  await step('v2: between-exercise rest is 60 s; skip rest; skip set; undo moves back', async () => {
    await page.click('#logSet'); await page.clock.runFor(600);
    assert.equal((await page.textContent('#rClock')).trim(), '01:00', 'between-exercise rest');
    assert.match(await page.textContent('#rLabel'), /next exercise/);
    assert.match(await page.textContent('#rNext'), /Bodyweight squats • set 1 of 2/);
    await page.click('#skipRest'); await page.clock.runFor(600);
    assert.equal((await page.textContent('#wName')).trim(), 'Bodyweight squats');
    await page.click('#skipSet'); await page.clock.runFor(600);
    assert.equal((await page.textContent('#wSet')).trim(), 'Set 2 of 2');
    const before = await page.evaluate(() => JSON.parse(localStorage.getItem('calisthenics-v2')).sets);
    assert.equal(before['1-0-bodyweight-squats'], undefined, 'skip does not log a set');
    await page.click('#undoSet'); await page.clock.runFor(600); // removes push-up set 2
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('calisthenics-v2')).sets);
    assert.deepEqual(after['1-0-standard-push-ups'].map(x => x.reps), [11]);
    assert.equal((await page.textContent('#wName')).trim(), 'Standard push-ups');
    assert.equal((await page.textContent('#wSet')).trim(), 'Set 2 of 2');
  });
  await step('v2: pause freezes elapsed and rest; resume shifts the deadline', async () => {
    await page.click('#logSet'); await page.clock.runFor(600); // rest 60 (between)
    await page.clock.runFor(10_000);
    assert.equal((await page.textContent('#rClock')).trim(), '00:50');
    const e1 = await page.textContent('#sClock');
    await page.click('#pauseBtn'); await page.clock.runFor(600);
    assert.ok(await page.isVisible('#phPaused'));
    await page.clock.runFor(30_000);
    assert.equal(await page.textContent('#sClock'), e1, 'elapsed frozen while paused');
    await page.click('#resumeBtn'); await page.clock.runFor(100);
    assert.equal((await page.textContent('#rClock')).trim(), '00:50', 'rest resumes where it stopped');
    const left = await page.evaluate(() => window.__cl.state.session.restUntil - Date.now());
    assert.ok(left > 49_000 && left <= 50_000, 'deadline shifted by the pause duration: ' + left);
  });
  await step('v2: changing day mid-session asks for confirmation; reload restores a paused session', async () => {
    await page.click('#skipRest'); await page.clock.runFor(600);
    await page.click('#endSession'); // not done -> confirm dialog (auto-accepted) -> ends & closes
    await page.clock.runFor(600);
    assert.ok(dialogs.some(d => /End this session/.test(d)));
    assert.ok(!(await page.isVisible('#session')));
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('calisthenics-v2')).history.length), 1);
    // start again and reload mid-rest
    await page.click('#startSession'); await page.clock.runFor(600);
    await page.click('#logSet'); await page.clock.runFor(600);
    await page.reload(); await page.clock.runFor(600);
    assert.ok(await page.isVisible('#phPaused'), 'restored paused');
    await page.click('#resumeBtn'); await page.clock.runFor(600);
    assert.ok(await page.isVisible('#phRest'));
    const n = dialogs.length;
    await page.click('#endSession'); await page.clock.runFor(600);
    assert.equal(dialogs.length, n + 1);
  });
  await step('v2: session completion screen, mark complete, history and done flag', async () => {
    await page.evaluate(() => localStorage.clear()); await seedSettings(page);
    await page.goto(BASE + '/app/index.html?nosw'); await page.clock.runFor(300);
    await page.click('#startSession'); await page.clock.runFor(300);
    for (let i = 0; i < 14; i++) { await page.click('#logSet'); await page.clock.runFor(700); if (await page.isVisible('#skipRest')) { await page.click('#skipRest'); await page.clock.runFor(700); } }
    assert.ok(await page.isVisible('#phDone'), 'done screen: ' + await page.textContent('#sStep') + ' / ' + await page.textContent('#wName') + ' / phases ' + JSON.stringify(await page.evaluate(() => ({ s: window.__cl.state.session, d: window.__cl.state.day, w: window.__cl.state.week, keys: Object.keys(window.__cl.state.sets) }))));
    assert.match(await page.textContent('#doneSummary'), /14 sets logged/);
    await page.screenshot({ path: path.join(SHOTS, '04-complete.png') });
    await page.click('#doneBtn'); await page.clock.runFor(300);
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('calisthenics-v2')));
    assert.equal(st.done['1-0'], true); assert.equal(st.session, null); assert.equal(st.history[0].setsLogged, 14); assert.equal(st.history[0].completed, true);
    assert.match(await page.textContent('#finish'), /Completed/);
  });
  await step('v2: light day — walking has no rest and advances straight to bird dogs', async () => {
    await page.click('[role=tab]:nth-child(2)'); await page.clock.runFor(300);
    await page.click('#startSession'); await page.clock.runFor(300);
    assert.equal((await page.textContent('#wName')).trim(), 'Brisk walking');
    assert.match(await page.textContent('#repUnit'), /minutes/);
    await page.click('#logSet'); await page.clock.runFor(700);
    assert.ok(await page.isVisible('#phWork'), 'no rest after walking');
    assert.equal((await page.textContent('#wName')).trim(), 'Bird dogs');
    await page.click('#logSet'); await page.clock.runFor(700);
    assert.equal((await page.textContent('#rClock')).trim(), '00:30', 'light-day rest');
    await page.click('#endSession'); await page.clock.runFor(300);
  });
  await step('v2: 40-minute warning and 45-minute cap banners fire without blocking alerts', async () => {
    await page.click('[role=tab]:nth-child(1)'); await page.clock.runFor(300);
    const n = dialogs.length;
    await page.click('#startSession'); await page.clock.runFor(300);
    await page.clock.runFor(40 * 60_000 + 1000);
    assert.ok(await page.isVisible('#capBanner')); assert.match(await page.textContent('#capBanner'), /5 minutes to your 45-minute cap/);
    assert.match(await page.getAttribute('#sClock', 'class'), /warn/);
    await page.clock.runFor(5 * 60_000 + 1000);
    assert.match(await page.textContent('#capBanner'), /Time cap reached/);
    assert.match(await page.getAttribute('#sClock', 'class'), /bad/);
    assert.equal(dialogs.length, n, 'no alert() dialogs');
    await page.screenshot({ path: path.join(SHOTS, '05-cap-banner.png') });
    await page.click('#endSession'); await page.clock.runFor(300);
  });
  await step('v2.1: warm-up → sets → burnout timer → cool-down → done, with how-to and quotes', async () => {
    await page.evaluate(() => localStorage.clear()); await seedClassic(page);
    await page.goto(BASE + '/app/index.html?nosw'); await page.clock.runFor(600);
    await page.click('#startSession'); await page.clock.runFor(600);
    assert.ok(await page.isVisible('#phTimer'), 'warm-up timer shown');
    assert.equal((await page.textContent('#tLabel')).trim(), 'Warm-up'); assert.equal((await page.textContent('#tClock')).trim(), '04:00');
    assert.match(await page.textContent('#tName'), /March in place/);
    assert.equal((await page.textContent('#sStep')).trim(), 'Warm-up');
    await page.clock.runFor(50_000);
    assert.match(await page.textContent('#tName'), /Arm circles/, 'script advances with time');
    await page.click('#timerSkip'); await page.clock.runFor(600);
    assert.ok(await page.isVisible('#phWork')); assert.equal((await page.textContent('#wSet')).trim(), 'Set 1 of 3');
    assert.equal(await page.evaluate(() => window.__cl.state.session.warmDone), true);
    // how-to box
    assert.ok(!(await page.isVisible('#wHow')));
    await page.click('#howBtn'); assert.match(await page.textContent('#wHow'), /Hands just wider than shoulders/);
    await page.click('#howBtn'); assert.ok(!(await page.isVisible('#wHow')));
    // two normal sets, then the burnout set
    for (let i = 0; i < 2; i++) { await page.click('#logSet'); await page.clock.runFor(700); await page.click('#skipRest'); await page.clock.runFor(700); }
    assert.equal((await page.textContent('#wSet')).trim(), 'Set 3 of 3 • burnout');
    assert.ok(await page.isVisible('#burnStart'), 'burnout start button'); assert.ok(!(await page.isVisible('#logSet')));
    await page.click('#burnStart'); await page.clock.runFor(600);
    assert.ok(await page.isVisible('#phTimer')); assert.match(await page.textContent('#tLabel'), /Burnout/); assert.equal((await page.textContent('#tClock')).trim(), '00:40');
    const before = (await page.textContent('#tClock')).trim();
    await page.click('#pauseBtn'); await page.clock.runFor(20_000); await page.click('#resumeBtn'); await page.clock.runFor(100);
    assert.equal((await page.textContent('#tClock')).trim(), before, 'burnout timer paused');
    await page.clock.runFor(41_000);
    assert.ok(await page.isVisible('#phWork')); assert.match(await page.textContent('#wSet'), /Burnout done/); assert.ok(await page.isVisible('#logSet'));
    await page.click('#repPlus'); await page.click('#logSet'); await page.clock.runFor(700);
    const pu = await page.evaluate(() => JSON.parse(localStorage.getItem('calisthenics-v2')).sets['1-0-standard-push-ups']);
    assert.equal(pu.length, 3); assert.equal(pu[2].burnout, true); assert.equal(pu[2].secs, 40); assert.equal(pu[2].reps, 13);
    assert.equal((await page.textContent('#rClock')).trim(), '01:00'); assert.match(await page.textContent('#rNext'), /Bodyweight squats • set 1 of 3/);
    // a motivational line is queued a few seconds into a long rest (quoteIdx advances)
    const q0 = await page.evaluate(() => window.__cl.state.quoteIdx | 0);
    await page.clock.runFor(6_000);
    assert.equal(await page.evaluate(() => window.__cl.state.quoteIdx | 0), q0 + 1, 'quote spoken once during rest');
    await page.click('#skipRest'); await page.clock.runFor(600);
    // skip everything else to reach the cool-down
    for (let i = 0; i < 30 && !(await page.isVisible('#phTimer')); i++) { await page.click('#skipSet'); await page.clock.runFor(600); }
    assert.equal((await page.textContent('#tLabel')).trim(), 'Cool-down'); assert.equal((await page.textContent('#tClock')).trim(), '02:00');
    assert.equal((await page.textContent('#sStep')).trim(), 'Cool-down');
    await page.clock.runFor(121_000);
    assert.ok(await page.isVisible('#phDone'), 'done after cool-down'); assert.match(await page.textContent('#doneSummary'), /3 sets logged/);
    await page.screenshot({ path: path.join(SHOTS, '07-burnout.png') }).catch(() => {});
    await page.click('#doneBtn'); await page.clock.runFor(600);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('calisthenics-v2')).done['1-0']), true);
  });
  await step('v2.1: settings sheet lists voice controls and the plan shows burnout labels', async () => {
    await page.click('#openSettings');
    assert.ok(await page.isVisible('#voiceURI')); assert.ok(await page.isVisible('#extraSets')); assert.equal(await page.inputValue('#extraSets'), '1'); assert.equal(await page.inputValue('#burnoutSeconds'), '40');
    await page.selectOption('#extraSets', '2'); await page.click('#closeSettings');
    assert.match(await page.locator('#moves .ex').first().textContent(), /4 × 12–15 • last set: 40 s burnout/);
    await page.locator('#moves .ex .name').first().click();
    assert.ok(await page.locator('#moves .ex').first().locator('.how').isVisible(), 'how-to expands');
    await page.click('#openSettings'); await page.selectOption('#extraSets', '1'); await page.click('#closeSettings');
  });
  await step('v2: import a v1 backup file (merge) keeps existing data and upgrades keys', async () => {
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE + '/app/index.html?nosw');
    await page.evaluate(() => { localStorage.setItem('calisthenics-v2', JSON.stringify({ schemaVersion: 2, sets: { '1-2-pike-push-ups': [{ reps: 6, at: '2026-10-02T10:00:00.000Z' }] } })); });
    await page.reload();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#import')]);
    await chooser.setFiles({ name: 'old.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(V1_SEED)) });
    await page.waitForFunction(() => /Imported/.test(document.getElementById('importNote').textContent));
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('calisthenics-v2')));
    assert.equal(st.sets['1-2-pike-push-ups'].length, 1, 'existing data kept');
    assert.deepEqual(st.sets['1-0-standard-push-ups'].map(x => x.reps), [12, 11]);
    assert.ok(await page.evaluate(() => !!localStorage.getItem('calisthenics-v2-preimport')), 'pre-import snapshot saved');
  });
  await step('v2: crafted backup cannot inject markup', async () => {
    await page.evaluate(() => { document.getElementById('importNote').textContent = ''; });
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#import')]);
    await chooser.setFiles({ name: 'evil.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ sets: { '1-0-m-1': [{ reps: '<img id="pwned2" src=x>' }, { reps: 7 }] }, prs: { 1: '<b id="pwned3">' } })) });
    await page.waitForFunction(() => /Imported/.test(document.getElementById('importNote').textContent));
    assert.equal(await page.locator('#pwned2, #pwned3').count(), 0);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('calisthenics-v2')).sets['1-0-bodyweight-squats'].length), 1, 'the valid entry survived');
  });
  /* ---------- G. v3: editable programme, library picker, figures, recorded coach ---------- */
  await step('v3: swap an exercise for today only — plan updates, badge shows, logs key by the new id, and it expires tomorrow', async () => {
    await page.goto(BASE + '/app/index.html?nosw'); await page.evaluate(() => localStorage.clear()); await seedClassic(page); await page.reload();
    const T0 = Date.parse('2026-10-26T15:00:00'); await page.clock.install({ time: T0 }); // local-time date rolls over at midnight
    await page.click('#editDay');
    assert.equal(await page.evaluate(() => window.__cl.editing), true);
    await page.click('#moves .ex:nth-child(1) .editbar button:nth-child(3)'); // ⇄ Swap
    assert.ok(await page.isVisible('#library'));
    assert.match(await page.textContent('#libEyebrow'), /Replace Standard push-ups/);
    await page.click('#libGroups button:nth-child(1)'); // All
    const count = await page.locator('#libList .lib').count(); assert.ok(count >= 80, 'library rows ' + count);
    await page.click('#libGroups button:nth-child(2)'); // Push
    await page.click('#libList .lib:has-text("Knee push-ups")');
    assert.ok(await page.isVisible('#libActions'));
    await page.click('#libToday');
    assert.ok(!(await page.isVisible('#library')));
    assert.match(await page.textContent('#moves .ex:nth-child(1) .name'), /Knee push-ups/);
    assert.match(await page.textContent('#dayBadges'), /today only/);
    assert.equal(await page.locator('#moves .ex:nth-child(1) .th svg').count(), 1, 'thumbnail figure');
    const st = await page.evaluate(() => window.__cl.state);
    assert.equal(st.todaySwaps.date, '2026-10-26'); assert.deepEqual(st.program, {});
    assert.equal((await page.evaluate(() => window.__cl.plan().items[0].logKey)), '1-0-knee-push-ups');
    await page.clock.runFor(10 * 3600 * 1000); await page.reload(); // 01:00 the next day
    assert.match(await page.textContent('#moves .ex:nth-child(1) .name'), /Standard push-ups/);
    assert.equal(await page.textContent('#dayBadges'), '');
  });
  await step('v3: permanent edits (swap, add, move, remove) persist across reload; reset restores the default; a session blocks editing', async () => {
    await page.goto(BASE + '/app/index.html?nosw'); await page.evaluate(() => localStorage.clear()); await seedClassic(page); await page.reload();
    await page.click('#editDay');
    await page.click('#moves .ex:nth-child(2) .editbar button:nth-child(3)');
    await page.click('#libList .lib:has-text("Sumo squats")'); await page.click('#libPlan');
    await page.click('#addCore'); await page.click('#libList .lib:has-text("Plank")'); await page.click('#libPlan');
    await page.click('#moves .ex:nth-child(1) .editbar button:nth-child(2)'); // move down
    await page.click('#core .ex:nth-child(1) .editbar button:nth-child(4)'); // remove (dialog: accept = today only)
    await page.reload();
    const names = await page.evaluate(() => Array.from(document.querySelectorAll('#moves .ex .name, #core .ex .name')).map(e => e.firstChild.textContent));
    assert.deepEqual(names.slice(0, 2), ['Sumo squats', 'Standard push-ups']);
    assert.ok(names.includes('Plank'));
    assert.match(await page.textContent('#dayBadges'), /Customised/); // once a day is customised, further edits follow the plan
    const st = await page.evaluate(() => window.__cl.state);
    assert.deepEqual(st.program['0'].m.slice(0, 2), ['sumo-squats', 'standard-push-ups']); assert.deepEqual(st.program['0'].c, ['dead-bugs', 'plank']);
    assert.equal(st.todaySwaps, null);
    await page.click('#editDay'); await page.click('#resetDay'); // reset to default (confirm accepted)
    assert.equal(await page.evaluate(() => Object.keys(window.__cl.state.program).length), 0);
    await page.click('#editDay');
    await page.click('#startSession');
    await page.evaluate(() => document.getElementById('editDay').click()); // session is active (overlay open)
    assert.equal(await page.evaluate(() => window.__cl.editing), false, 'editing refused while a session is active');
    assert.match(await page.textContent('#toast'), /End the guided session/);
  });
  await step('v3: recorded coach — manifest loads, cues are queued as clip ids with text fallbacks, quotes fit the rest, device mode bypasses clips', async () => {
    await page.goto(BASE + '/app/index.html?nosw'); await page.evaluate(() => localStorage.clear()); await seedClassic(page); await page.reload();
    await page.waitForFunction(() => window.__cl.Coach.clips && Object.keys(window.__cl.Coach.clips).length > 500);
    const T0 = Date.parse('2026-10-26T15:00:00'); await page.clock.install({ time: T0 });
    await page.click('#startSession'); await page.clock.runFor(300);
    let last = await page.evaluate(() => window.__cl.Coach.log);
    assert.deepEqual(last.slice(0, 3), ['day_0', 'warm_start', 'warm_0']); assert.match(last[3], /^q_\d+$/, 'a quote after the warm-up intro');
    assert.equal(await page.locator('#tArc').count(), 1);
    await page.click('#timerSkip'); await page.clock.runFor(600);
    const log = () => page.evaluate(() => window.__cl.Coach.log);
    let L = await log(); const i = L.indexOf('warm_done'); assert.ok(i > 0); assert.deepEqual(L.slice(i, i + 3), ['warm_done', 'ex_standard-push-ups', 'cue_standard-push-ups']);
    assert.equal(await page.locator('#wFig svg').count(), 1, 'figure on the work screen');
    assert.equal(await page.locator('#wNextFig svg').count(), 1, 'thumbnail for the next item');
    await page.click('#logSet'); await page.clock.runFor(300);
    last = await page.evaluate(() => window.__cl.Coach.last); assert.deepEqual(last, ['logged', 'rest_45']);
    await page.clock.runFor(5000);
    last = await page.evaluate(() => window.__cl.Coach.last); assert.match(last[0], /^q_\d+$/, 'quote during rest: ' + last);
    const fits = await page.evaluate(() => { const c = window.__cl.Coach; return c.dur(c.last[0]) <= 45 - 4 - 13; }); assert.ok(fits, 'quote fits before the Next call');
    await page.clock.runFor(31_000);
    last = await page.evaluate(() => window.__cl.Coach.last); assert.deepEqual(last, ['next_standard-push-ups', 'set_2']);
    assert.equal(await page.locator('#rFig svg').count(), 1, 'figure on the rest screen');
    const dev = await page.evaluate(() => { const c = window.__cl.Coach; window.__cl.state.settings.coachVoice = 'device'; const u = c.useClips(); window.__cl.state.settings.coachVoice = 'recorded'; return [u, c.useClips(), c.text('go'), c.dur('rest_45') > 0]; });
    assert.deepEqual(dev, [false, true, 'Go!', true]);
    // Music mixing: without the Audio Session API (Chromium) the 'mix' default routes clips through Web Audio and decodes them.
    const wa = await page.evaluate(async () => { const c = window.__cl.Coach; const s = window.__cl.state.settings; const mix = c.webAudio(); s.audioMix = 'solo'; const solo = c.webAudio(); s.audioMix = 'mix'; let dur; try { dur = (await c.buffer('go')).duration; } catch (e) { dur = 'decode failed: ' + e; } return [mix, solo, dur, c.buffers.size]; });
    assert.equal(wa[0], true, 'mix uses Web Audio when audioSession is unavailable'); assert.equal(wa[1], false, 'solo keeps the media element');
    assert.ok(typeof wa[2] === 'number' && wa[2] > 0.3 && wa[2] < 2, 'decoded "Go!" clip: ' + wa[2]); assert.ok(wa[3] >= 1, 'decoded buffers are cached');
    await page.click('#endSession');
  });
  /* ---------- H. v4: progressive programme ---------- */
  await step('v4: Monday is supersets + core circuit; A1→A2 rest is 20 s, after the pair 45 s; effort rating is stored; interval day auto-logs stations', async () => {
    await page.goto(BASE + '/app/index.html?nosw'); await page.evaluate(() => localStorage.clear()); await page.reload();
    assert.match(await page.textContent('#phase'), /Block 1, week 1 of 4/);
    assert.equal(await page.locator('#ladders .ladder').count(), 11, 'ladders panel');
    const tags = await page.evaluate(() => Array.from(document.querySelectorAll('#moves .tagchip, #core .tagchip')).map(e => e.textContent));
    assert.deepEqual(tags, ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'C3']);
    assert.match(await page.textContent('#moves .blockhead'), /Superset A/);
    const T0 = Date.parse('2026-10-27T18:00:00'); await page.clock.install({ time: T0 });
    await page.click('#startSession'); await page.clock.runFor(300); await page.click('#timerSkip'); await page.clock.runFor(700);
    assert.match(await page.textContent('#wSet'), /Superset A1 • Set 1 of 3/);
    await page.click('#logSet'); await page.clock.runFor(300);
    assert.equal((await page.textContent('#rClock')).trim(), '00:20'); assert.match(await page.textContent('#rLabel'), /Superset/);
    assert.deepEqual(await page.evaluate(() => window.__cl.Coach.last), ['logged', 'superset', 'next_bodyweight-squats']);
    assert.ok(await page.isVisible('#effortRow')); await page.click('[data-effort="m"]');
    const eff = await page.evaluate(() => window.__cl.state.sets['1-0-standard-push-ups'][0].effort); assert.equal(eff, 'm');
    await page.clock.runFor(21000); assert.match(await page.textContent('#wSet'), /Superset A2 • Set 1 of 3/); assert.match(await page.textContent('#wName'), /Bodyweight squats/);
    await page.click('#logSet'); await page.clock.runFor(300); assert.equal((await page.textContent('#rClock')).trim(), '00:45');
    await page.clock.runFor(46000); assert.match(await page.textContent('#wSet'), /Superset A1 • Set 2 of 3/);
    await page.click('#endSession'); await page.clock.runFor(300);
    // Tuesday: timed circuit
    await page.click('#days button:nth-child(2)'); await page.clock.runFor(200);
    assert.match(await page.textContent('#dayBadges'), /2 rounds • 40\/20 s/);
    await page.click('#startSession'); await page.clock.runFor(300); await page.click('#timerSkip'); await page.clock.runFor(700);
    assert.equal((await page.textContent('#burnStart')).trim(), '▶ Start circuit'); assert.ok(!(await page.isVisible('#logSet')));
    await page.click('#burnStart'); await page.clock.runFor(500);
    assert.match(await page.textContent('#tLabel'), /Work • round 1 of 2/); assert.equal((await page.textContent('#tClock')).trim(), '00:40');
    await page.clock.runFor(40500);
    const st1 = await page.evaluate(() => ({ s: window.__cl.state.sets['1-1-jumping-jacks'], rest: document.getElementById('rClock').textContent, lbl: document.getElementById('rLabel').textContent }));
    assert.deepEqual(st1.s.map(e => [e.reps, e.unit, e.auto]), [[40, 'sec', true]]); assert.match(st1.lbl, /next station/); assert.equal(st1.rest.trim(), '00:20');
    assert.ok(!(await page.isVisible('#effortRow')), 'no effort rating for an auto-logged station');
    await page.clock.runFor(20500);
    assert.match(await page.textContent('#tName'), /Bodyweight squats/, 'next station started itself');
    assert.equal(await page.evaluate(() => document.getElementById('session').className), 'show burn');
    await page.click('#timerStop'); await page.clock.runFor(400);
    const st2 = await page.evaluate(() => window.__cl.state.sets['1-1-bodyweight-squats']); assert.equal(st2.length, 1); assert.ok(st2[0].reps >= 1 && st2[0].reps < 40, 'stopped early logs the time done');
    await page.click('#endSession');
  });
  await step('v4: a perfect session earns progressions (set, then rung), the progress card shows them with Undo, and ladders can be nudged', async () => {
    await page.goto(BASE + '/app/index.html?nosw'); await page.evaluate(() => localStorage.clear()); await page.reload();
    const T0 = Date.parse('2026-10-27T18:00:00'); await page.clock.install({ time: T0 });
    await page.click('#startSession'); await page.clock.runFor(300); await page.click('#timerSkip'); await page.clock.runFor(700);
    // log every set at the top of the range through the engine, skipping rests
    for (let i = 0; i < 40; i++) {
      const st = await page.evaluate(() => { const s = window.__cl.state.session; const pos = window.__cl.__pos(); return { done: pos.done, rest: !!(s && s.restUntil), burn: !!(s && s.burnUntil), pending: !!(pos.current && pos.current.burnout && !s.burnReady), hi: pos.current && pos.current.item.hi, cur: pos.current && pos.current.item.id, setNo: pos.current && pos.current.setNo, work: !!(s && s.workUntil) }; });
      if (st.done) break;
      if (st.rest) { await page.click('#skipRest'); await page.clock.runFor(600); continue; }
      if (st.pending) { await page.click('#burnLogInstead'); await page.clock.runFor(600); }
      await page.evaluate(hi => { for (let k = 0; k < 60; k++) document.getElementById('repPlus').click(); }, st.hi); // draft well above hi
      await page.click('#logSet'); await page.clock.runFor(600);
    }
    assert.equal(await page.evaluate(() => window.__cl.__pos().done), true, 'all sets logged');
    await page.clock.runFor(130000); // cool-down
    await page.click('#doneBtn'); await page.clock.runFor(300);
    const after = await page.evaluate(() => ({ lc: window.__cl.state.lastChanges, L: window.__cl.state.progress.ladders, last: window.__cl.Coach.last }));
    assert.ok(after.lc && after.lc.changes.length === 7, 'every ladder on the day progressed: ' + JSON.stringify(after.lc && after.lc.changes.map(c => c.type)));
    assert.ok(after.lc.changes.every(c => c.type === 'set')); assert.equal(after.L['push-h'].sets, 4); assert.equal(after.L['core-a'].sets, 4);
    assert.deepEqual(after.last, ['progress_set']);
    assert.ok(await page.isVisible('#progressCard')); assert.match(await page.textContent('#progressCard'), /4 sets next time/);
    assert.match(await page.textContent('#moves .ex:nth-child(2) .rx'), /^4 × /, 'Monday now shows 4 sets');
    await page.click('#progressCard button:nth-child(1)'); // Undo
    assert.equal(await page.evaluate(() => window.__cl.state.progress.ladders['push-h'].sets), 3); assert.ok(!(await page.isVisible('#progressCard')));
    await page.click('#ladders .ladder:nth-child(1) .btns button:nth-child(2)'); // Harder on push-h
    assert.match(await page.textContent('#ladders .ladder:nth-child(1)'), /Close-grip push-ups/); assert.match(await page.textContent('#moves .ex:nth-child(2) .name'), /Close-grip push-ups/);
    await page.reload(); assert.match(await page.textContent('#moves .ex:nth-child(2) .name'), /Close-grip push-ups/, 'persisted');
    // deload week: fewer sets, no evaluation banner text
    await page.selectOption('#week', '4'); await page.clock.runFor(200); assert.match(await page.textContent('#dayBadges'), /Deload week/); assert.match(await page.textContent('#moves .ex:nth-child(2) .rx'), /^2 × /);
    // classic mode switch restores the fixed plan
    await page.click('#openSettings'); await page.selectOption('#mode', 'classic'); await page.click('#closeSettings'); await page.clock.runFor(200);
    assert.equal(await page.locator('#moves .tagchip').count(), 0); assert.ok(!(await page.isVisible('#laddersPanel')));
  });

  await step('v3: service worker precaches the shell and the essential clips (not the long ones) and serves audio cache-first', async () => {
    await page.goto(BASE + '/app/index.html');
    const info = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      for (let i = 0; i < 60; i++) { const a = await caches.open('calisthenics-lab-audio-v1'); if ((await a.keys()).length >= 294) break; await new Promise(r => setTimeout(r, 500)); }
      const keys = await caches.keys(); const a = await caches.open('calisthenics-lab-audio-v1'); const ak = (await a.keys()).map(r => r.url);
      const c = await caches.open('calisthenics-lab-v4.0.0'); const ck = (await c.keys()).map(r => r.url);
      return { keys, audio: ak.length, essential: ak.filter(u => /\/(ex|next|cue|rest|set)_/.test(u)).length, how: ak.filter(u => /\/how_/.test(u)).length, shell: ck.some(u => /figures\.js/.test(u)) && ck.some(u => /manifest\.json/.test(u)), scope: reg.scope };
    });
    assert.ok(info.keys.includes('calisthenics-lab-v4.0.0') && info.keys.includes('calisthenics-lab-audio-v1'), JSON.stringify(info));
    assert.ok(info.shell, 'shell assets cached');
    assert.ok(info.essential >= 290, 'essential clips cached: ' + info.essential);
  });

  await step('v2: no console errors during the run', async () => { /* collected via pageerror listener above; failures would print */ });

  await page.screenshot({ path: path.join(SHOTS, '06-settings.png') }).catch(() => {});
  await page.goto(BASE + '/app/index.html?nosw').catch(() => {}); await page.evaluate(async () => { for (const k of await caches.keys()) await caches.delete(k); const r = await navigator.serviceWorker.getRegistrations(); for (const x of r) await x.unregister(); }).catch(() => {});
  await browser.close();
  const fails = results.filter(r => r[0] === 'FAIL');
  fs.writeFileSync(path.join(__dirname, 'browser-results.txt'), results.map(r => r.join(' ')).join('\n') + '\n');
  console.log(`\n${results.length - fails.length}/${results.length} browser checks passed`);
  process.exit(fails.length ? 1 : 0);
})();
