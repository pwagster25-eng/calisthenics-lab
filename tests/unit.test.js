// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const CL = require('../app/core.js');

const S = CL.DEFAULT_SETTINGS;

test('every program day resolves to known exercises with sane prescriptions', () => {
  for (let w = 1; w <= 8; w++) for (let d = 0; d < 7; d++) {
    const p = CL.dayPlan(d, w);
    assert.ok(p.items.length >= 4);
    for (const it of p.items) {
      assert.ok(CL.EX[it.id], it.id);
      assert.ok(it.sets >= 1 && it.sets <= 3, `${it.id} sets ${it.sets}`);
      assert.ok(it.target > 0);
      assert.match(it.logKey, /^[1-8]-[0-6]-[a-z0-9-]+$/);
    }
  }
});

test('v1.2 defect: cardio/mobility items no longer become 6-12 "sets"', () => {
  const tue = CL.dayPlan(1, 1);
  const walk = tue.items.find(i => i.id === 'brisk-walking');
  assert.equal(walk.sets, 1); assert.equal(walk.unit, 'min');
  const thu = CL.dayPlan(3, 1);
  assert.equal(thu.items.find(i => i.id === 'hip-mobility').sets, 1);
  assert.equal(CL.buildQueue(tue).length, 1 + 2 + 2 + 1);
});

test('week scaling: low→high reps, week 7 adds a set to the first exercise, week 8 deloads', () => {
  const w1 = CL.dayPlan(0, 1).items[0], w3 = CL.dayPlan(0, 3).items[0], w7 = CL.dayPlan(0, 7), w8 = CL.dayPlan(0, 8);
  assert.equal(w1.target, 12); assert.equal(w3.target, 15);
  assert.equal(w7.items[0].sets, 3); assert.equal(w7.items[1].sets, 3); assert.equal(w7.items[2].sets, 2);
  assert.equal(w8.items[0].sets, 1); assert.equal(w8.items[0].target, 12);
  assert.ok(CL.dayPlan(0, 5).items[0].hint.length > 0, 'week 5 shows a harder-variation hint');
});

test('time estimate: every day fits the 45-minute default cap; weeks 1–6 strength days also fit a 30-minute cap at default rests', () => {
  for (let w = 1; w <= 8; w++) for (let d = 0; d < 7; d++) assert.ok(CL.estimateMinutes(CL.dayPlan(d, w), S).fits, `W${w} day ${d}`);
  const cap30 = Object.assign({}, S, { capMinutes: 30 });
  for (let w = 1; w <= 6; w++) for (const d of [0, 2, 4, 5]) { const e = CL.estimateMinutes(CL.dayPlan(d, w), cap30); assert.ok(e.fits, `W${w} day ${d} = ${e.minutes} min`); }
  // and that it is honest: long rests do NOT fit a 30-minute cap
  const e = CL.estimateMinutes(CL.dayPlan(0, 3), Object.assign({}, cap30, { restWithin: 90, restBetween: 120 }));
  assert.equal(e.fits, false);
});

test('rest type: within vs between, light days, core finisher, no rest for cardio', () => {
  const mon = CL.dayPlan(0, 1), tue = CL.dayPlan(1, 1);
  const push = mon.items[0], core = mon.items.find(i => i.group === 'core');
  assert.equal(CL.restFor(push, false, mon.light, S), S.restWithin);
  assert.equal(CL.restFor(push, true, mon.light, S), S.restBetween);
  assert.equal(CL.restFor(core, false, mon.light, S), S.restLight);
  assert.equal(CL.restFor(tue.items[0], false, tue.light, S), 0);
  assert.equal(CL.restFor(tue.items[1], false, tue.light, S), S.restLight);
});

test('queue position is derived from the log: list logging, guided logging, undo and skip agree', () => {
  const p = CL.dayPlan(0, 1); // Mon: 5×2 + 2×2 = 14 sets
  const sets = {};
  let pos = CL.sessionPosition(p, sets, {});
  assert.equal(pos.total, 14); assert.equal(pos.index, 0); assert.equal(pos.current.setNo, 1);
  // log set 1 of push-ups
  sets[p.items[0].logKey] = [{ reps: 12 }];
  pos = CL.sessionPosition(p, sets, {});
  assert.equal(pos.index, 1); assert.equal(pos.current.item.id, 'standard-push-ups'); assert.equal(pos.current.setNo, 2);
  assert.equal(pos.current.lastOfExercise, true);
  // user logs a squat set out of order via the list → coach still asks for push-up set 2
  sets[p.items[1].logKey] = [{ reps: 15 }];
  pos = CL.sessionPosition(p, sets, {});
  assert.equal(pos.current.item.id, 'standard-push-ups'); assert.equal(pos.current.setNo, 2);
  // finish push-ups → next is squats set 2 (set 1 already logged)
  sets[p.items[0].logKey].push({ reps: 11 });
  pos = CL.sessionPosition(p, sets, {});
  assert.equal(pos.current.item.id, 'bodyweight-squats'); assert.equal(pos.current.setNo, 2);
  // skip counts like a logged set for queue purposes but is not persisted
  pos = CL.sessionPosition(p, sets, { [p.items[1].logKey]: 1 });
  assert.equal(pos.current.item.id, 'decline-push-ups');
  // no equipment anywhere in the schedule
  for (let d = 0; d < 7; d++) assert.ok(!CL.PROGRAM[d].m.includes('rows') && !CL.PROGRAM[d].c.includes('rows'));
  // undo (pop) moves the position back
  sets[p.items[0].logKey].pop();
  pos = CL.sessionPosition(p, sets, {});
  assert.equal(pos.current.item.id, 'standard-push-ups'); assert.equal(pos.current.setNo, 2);
  // extra sets beyond the prescription never break completion
  const all = {}; for (const it of p.items) all[it.logKey] = Array.from({ length: it.sets + 2 }, () => ({ reps: 5 }));
  pos = CL.sessionPosition(p, all, {});
  assert.equal(pos.done, true); assert.equal(pos.current, null);
});

test('v1 storage/backups migrate positionally to stable ids and keep every entry', () => {
  const v1 = {
    done: { '1-0': true, '2-5': true, 'junk': true },
    checks: {}, prs: { 1: 22, 9: 5 },
    sets: {
      '1-0-m-0': [{ reps: 12, at: '2026-10-01T10:00:00.000Z' }, { reps: 11, at: '2026-10-01T10:02:00.000Z' }],
      '1-0-c-1': [{ reps: 8, at: '2026-10-01T10:20:00.000Z' }],
      '1-5-m-1': [{ reps: 9, at: '2026-10-05T10:00:00.000Z' }], // Sat decline push-ups — no longer on Sat in v2
      '3-1-m-0': [{ reps: 15, at: '2026-10-14T10:00:00.000Z' }]  // Tue walking
    },
    restSeconds: 90, soundOn: false, week: 3, day: 1
  };
  const { state, notes, from } = CL.normalize(v1);
  assert.equal(from, 'v1');
  assert.deepEqual(state.sets['1-0-standard-push-ups'].map(x => x.reps), [12, 11]);
  assert.deepEqual(state.sets['1-0-dead-bugs'].map(x => x.reps), [8]);
  assert.deepEqual(state.sets['1-5-decline-push-ups'].map(x => x.reps), [9], 'orphaned exercise log is preserved, not dropped');
  assert.deepEqual(state.sets['3-1-brisk-walking'].map(x => x.reps), [15]);
  assert.equal(Object.values(state.sets).flat().length, 5, 'every set survives');
  assert.deepEqual(state.done, { '1-0': true, '2-5': true });
  assert.deepEqual(state.prs, { 1: 22 });
  assert.equal(state.week, 3); assert.equal(state.day, 1);
  assert.equal(state.settings.restWithin, 90); assert.equal(state.settings.soundOn, false); assert.equal(state.settings.voiceOn, false);
  assert.equal(state.schemaVersion, 2);
  assert.ok(notes.some(n => /migrated/.test(n)));
  // idempotent: normalising the v2 output changes nothing
  const again = CL.normalize(JSON.parse(JSON.stringify(state)));
  assert.deepEqual(again.state, state);
});

test('import validation: rejects garbage, strips injection payloads, bounds numbers, caps size', () => {
  assert.equal(CL.parseImport('not json').ok, false);
  assert.equal(CL.parseImport('[1,2,3]').ok, false);
  assert.equal(CL.parseImport('x'.repeat(CL.MAX_IMPORT_BYTES + 1)).ok, false);
  const nasty = JSON.stringify({
    sets: {
      '1-0-m-0': [{ reps: '<img src=x onerror=alert(1)>', at: 'now' }, { reps: 1e9 }, { reps: -4 }, { reps: '12', at: '2026-10-01T00:00:00Z', unit: 'bogus' }, 'string', null],
      '1-0-<script>': [{ reps: 3 }],
      '__proto__': [{ reps: 3 }],
      '1-0-m-0-extra': [{ reps: 3 }]
    },
    done: { '1-0': '<b>', '9-9': true }, prs: { 1: '99', 2: 'NaN' }, week: 99, day: -3,
    settings: { restWithin: 99999, soundOn: 'yes' }, session: { key: 'x' }, history: 'nope', evil: { a: 1 }
  });
  const r = CL.parseImport(nasty);
  assert.equal(r.ok, true);
  assert.deepEqual(r.state.sets, { '1-0-standard-push-ups': [{ reps: 12, at: '2026-10-01T00:00:00.000Z' }], '1-0-m-0-extra': [{ reps: 3 }] }, 'well-formed unknown ids are kept; malformed keys and bad entries are dropped');
  assert.deepEqual(r.state.done, { '1-0': true });
  assert.deepEqual(r.state.prs, { 1: 99 });
  assert.equal(r.state.week, 8); assert.equal(r.state.day, 0);
  assert.equal(r.state.settings.restWithin, CL.DEFAULT_SETTINGS.restWithin);
  assert.equal(r.state.settings.soundOn, true);
  assert.equal(r.state.session, null); assert.deepEqual(r.state.history, []);
  assert.equal('evil' in r.state, false);
  assert.ok(r.notes.some(n => /invalid log entr/.test(n)));
});

test('merge is a union that never drops current data and dedupes identical entries', () => {
  const cur = CL.normalize({ schemaVersion: 2, sets: { '1-0-standard-push-ups': [{ reps: 12, at: '2026-10-01T10:00:00.000Z' }] }, done: { '1-0': true }, prs: { 1: 20 } }).state;
  const inc = CL.normalize({ schemaVersion: 2, sets: { '1-0-standard-push-ups': [{ reps: 12, at: '2026-10-01T10:00:00.000Z' }, { reps: 10, at: '2026-10-01T10:02:00.000Z' }], '1-2-pike-push-ups': [{ reps: 6 }] }, done: { '1-2': true }, prs: { 1: 18, 2: 21 } }).state;
  const m = CL.merge(cur, inc);
  assert.equal(m.sets['1-0-standard-push-ups'].length, 2);
  assert.equal(m.sets['1-2-pike-push-ups'].length, 1);
  assert.deepEqual(m.done, { '1-0': true, '1-2': true });
  assert.deepEqual(m.prs, { 1: 20, 2: 21 });
});

test('timer math is deadline-based and pause-aware', () => {
  const t0 = 1_000_000;
  assert.equal(CL.secondsLeft(t0 + 45_000, t0), 45);
  assert.equal(CL.secondsLeft(t0 + 45_000, t0 + 44_100), 1);
  assert.equal(CL.secondsLeft(t0 + 45_000, t0 + 90_000), 0, 'late wake-up clamps to zero rather than going negative');
  assert.equal(CL.secondsLeft(0, t0), 0);
  assert.equal(CL.fmt(0), '00:00'); assert.equal(CL.fmt(1799), '29:59'); assert.equal(CL.fmt(-5), '00:00');
  const s = { startedAt: t0, pausedAt: 0, pausedTotal: 30_000 };
  assert.equal(CL.elapsedMs(s, t0 + 100_000), 70_000);
  assert.equal(CL.elapsedMs(Object.assign({}, s, { pausedAt: t0 + 80_000 }), t0 + 100_000), 50_000, 'clock freezes while paused');
});

test('session state in storage is validated on load (corrupt session cannot crash the app)', () => {
  const r = CL.normalize({ schemaVersion: 2, session: { key: '1-0', startedAt: 'abc' } });
  assert.equal(r.state.session, null);
  const ok = CL.normalize({ schemaVersion: 2, session: { key: '1-0', startedAt: 5, skipped: { '1-0-standard-push-ups': 1, bad: 99 }, restKind: 'weird' } });
  assert.deepEqual(ok.state.session.skipped, { '1-0-standard-push-ups': 1 });
  assert.equal(ok.state.session.restKind, 'within');
});
