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
      assert.ok(it.sets >= 1 && it.sets <= 4, `${it.id} sets ${it.sets}`);
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
  assert.equal(w7.items[0].sets, 4); assert.equal(w7.items[1].sets, 4); assert.equal(w7.items[2].sets, 3);
  assert.equal(w8.items[0].sets, 2); assert.equal(w8.items[0].target, 12);
  // extraSets setting: 0 restores the v1.2 two-set prescription; core/mobility never change
  const lean = CL.dayPlan(0, 1, Object.assign({}, S, { extraSets: 0 }));
  assert.equal(lean.items[0].sets, 2); assert.equal(lean.items.find(i => i.group === 'core').sets, 2);
  assert.equal(CL.dayPlan(0, 1, S).items.find(i => i.group === 'core').sets, 2);
  // burnout flag only on the last set of strength rep exercises
  const q = CL.buildQueue(CL.dayPlan(0, 1, S));
  assert.deepEqual(q.filter(x => x.burnout).map(x => x.item.id + x.setNo), ['standard-push-ups3', 'bodyweight-squats3', 'decline-push-ups3', 'reverse-lunges3', 'reverse-snow-angels3']);
  assert.ok(!CL.buildQueue(CL.dayPlan(0, 1, Object.assign({}, S, { burnoutOn: false }))).some(x => x.burnout));
  assert.ok(!CL.buildQueue(CL.dayPlan(2, 1, S)).some(x => x.burnout && x.item.kind !== 'reps'), 'holds never burn out');
  // every exercise has a how-to
  for (const id of Object.keys(CL.EX)) assert.ok(CL.EX[id].how && CL.EX[id].how.length > 40, id);
  assert.ok(CL.dayPlan(0, 5).items[0].hint.length > 0, 'week 5 shows a harder-variation hint');
});

test('time estimate: every day fits the 45-minute default cap; weeks 1–6 strength days also fit a 30-minute cap at default rests', () => {
  for (let w = 1; w <= 8; w++) for (let d = 0; d < 7; d++) assert.ok(CL.estimateMinutes(CL.dayPlan(d, w), S).fits, `W${w} day ${d}`);
  const cap30 = Object.assign({}, S, { capMinutes: 30, extraSets: 0, burnoutOn: false });
  for (let w = 1; w <= 6; w++) for (const d of [0, 2, 4, 5]) { const e = CL.estimateMinutes(CL.dayPlan(d, w, cap30), cap30); assert.ok(e.fits, `W${w} day ${d} = ${e.minutes} min`); }
  // warm-up/cool-down settings flow into the estimate
  const noWarm = Object.assign({}, S, { warmupSeconds: 0, cooldownSeconds: 0 });
  assert.ok(CL.estimateMinutes(CL.dayPlan(0, 1, noWarm), noWarm).minutes <= CL.estimateMinutes(CL.dayPlan(0, 1, S), S).minutes - 5);
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
  const p = CL.dayPlan(0, 1, Object.assign({}, S, { extraSets: 0 })); // Mon at 2 sets: 5×2 + 2×2 = 14 sets
  const sets = {};
  let pos = CL.sessionPosition(p, sets, {});
  assert.equal(pos.total, 14); assert.equal(pos.index, 0); assert.equal(pos.current.setNo, 1);
  // log set 1 of push-ups
  sets[p.items[0].logKey] = [{ reps: 12 }];
  pos = CL.sessionPosition(p, sets, {});
  assert.equal(pos.index, 1); assert.equal(pos.current.item.id, 'standard-push-ups'); assert.equal(pos.current.setNo, 2);
  assert.equal(pos.current.lastOfExercise, true); assert.equal(pos.current.burnout, true);
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
  const burn = CL.cleanSetEntry({ reps: 14, burnout: true, secs: 40, unit: 'reps' });
  assert.deepEqual(burn, { reps: 14, unit: 'reps', burnout: true, secs: 40 });
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
  assert.equal(state.schemaVersion, CL.SCHEMA_VERSION);
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

/* ---------------- v3: library, editable programme, figures, recorded coach ---------------- */
const FIG = require('../app/figures.js');
const path = require('node:path');
const fs = require('node:fs');

test('v3 library: every exercise is complete, bodyweight-only entries are listed, equipment swaps are not', () => {
  for (const [id, ex] of Object.entries(CL.EX)) {
    assert.ok(/^[a-z0-9-]{2,40}$/.test(id), id);
    assert.ok(ex.name && ex.cue && ex.how && ex.how.length > 40, `${id} needs name/cue/how`);
    assert.ok(['reps', 'hold', 'cardio', 'mobility'].includes(ex.kind) && CL.GROUP_ORDER.includes(ex.group), id);
    assert.ok([1, 2, 3].includes(ex.level) && ex.sets >= 1 && ex.lo >= 1 && ex.hi >= ex.lo, id);
  }
  const lib = CL.library();
  assert.ok(lib.length >= 80, 'library size ' + lib.length);
  assert.ok(!lib.includes('rows'), 'equipment-dependent rows stay out of the picker');
  assert.ok(lib.includes('wall-push-ups') && lib.includes('burpees'));
  const alts = CL.alternativesFor('standard-push-ups');
  assert.ok(alts.length >= 8 && !alts.includes('standard-push-ups') && alts.every(a => CL.EX[a].group === 'push'));
  assert.deepEqual(CL.library({ group: 'core' }).map(i => CL.EX[i].level), CL.library({ group: 'core' }).map(i => CL.EX[i].level).sort(), 'easier first');
});

test('v3 figures: every exercise has at least one drawn frame, and frames render as SVG with no user data', () => {
  for (const id of Object.keys(CL.EX)) {
    assert.ok(FIG.has(id), `no figure for ${id}`);
    const n = FIG.frameCount(id); assert.ok(n >= 1 && n <= 3, id);
    const svg = FIG.strip(id, { name: CL.EX[id].name });
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>') && (svg.match(/<line /g) || []).length > 8, id);
    assert.ok(!/undefined|NaN/.test(svg), `bad numbers in ${id}`);
    const f = FIG.solve(FIG.POSES[id].frames[0][0]);
    assert.ok(f.hip[1] <= FIG.FLOOR && f.head[1] > 0, `${id} figure off-canvas`);
  }
  assert.ok(/&lt;|&amp;/.test(FIG.strip('standard-push-ups', { name: '<b>&' })), 'name is escaped in aria-label');
});

test('v3 editing: swap/add/remove/move are validated and never corrupt a day', () => {
  const d = CL.defaultDay(0);
  assert.equal(CL.editDay(d, { type: 'swap', section: 'm', index: 0, id: 'knee-push-ups' }).def.m[0], 'knee-push-ups');
  assert.equal(CL.editDay(d, { type: 'swap', section: 'm', index: 0, id: 'bodyweight-squats' }).ok, false, 'duplicate on the day');
  assert.equal(CL.editDay(d, { type: 'swap', section: 'm', index: 0, id: 'nope' }).ok, false);
  assert.equal(CL.editDay(d, { type: 'add', section: 'c', id: 'plank' }).def.c.length, 3);
  assert.equal(CL.editDay({ m: ['plank'], c: [] }, { type: 'remove', section: 'm', index: 0 }).ok, false, 'keep one main exercise');
  const moved = CL.editDay(d, { type: 'move', section: 'm', index: 0, to: 2 }).def.m;
  assert.deepEqual(moved.slice(0, 3), ['bodyweight-squats', 'decline-push-ups', 'standard-push-ups']);
  let full = { m: d.m.slice(), c: [] }; for (const id of ['plank', 'burpees', 'sumo-squats', 'crunches']) full = CL.editDay(full, { type: 'add', section: 'm', id }).def;
  assert.equal(full.m.length, CL.MAX_MAIN); assert.equal(CL.editDay(full, { type: 'add', section: 'm', id: 'v-ups' }).ok, false, 'main limit');
  assert.deepEqual(d, CL.defaultDay(0), 'inputs are never mutated');
});

test('v3 editing: today-only swaps expire at midnight, permanent edits persist, and both coexist sensibly', () => {
  const st = CL.emptyState();
  assert.ok(CL.applyEdit(st, 0, { type: 'swap', section: 'm', index: 0, id: 'archer-push-ups' }, 'today', '2026-10-25').ok);
  assert.equal(CL.resolveDay(st, 0, '2026-10-25').m[0], 'archer-push-ups');
  assert.equal(CL.resolveDay(st, 0, '2026-10-25').temporary, true);
  assert.equal(CL.resolveDay(st, 0, '2026-10-26').m[0], 'standard-push-ups', 'gone tomorrow');
  assert.equal(CL.resolveDay(st, 1, '2026-10-25').custom, false, 'other days untouched');
  // A permanent edit made while a today-override exists applies to both.
  assert.ok(CL.applyEdit(st, 0, { type: 'add', section: 'c', id: 'plank' }, 'plan', '2026-10-25').ok);
  assert.deepEqual(st.program[0].c, ['reverse-crunches', 'dead-bugs', 'plank']);
  assert.deepEqual(st.todaySwaps.c, ['reverse-crunches', 'dead-bugs', 'plank']);
  assert.equal(st.todaySwaps.m[0], 'archer-push-ups', 'today-only swap survives a permanent edit');
  // Plan built from the resolved day logs under the swapped exercise's own id.
  const p = CL.dayPlan(0, 1, st.settings, CL.resolveDay(st, 0, '2026-10-25'));
  assert.equal(p.items[0].logKey, '1-0-archer-push-ups'); assert.equal(p.temporary, true); assert.equal(p.items.length, 8);
  assert.ok(CL.estimateMinutes(p, st.settings).minutes > 20);
  // Reset today → back to the (customised) plan; reset plan → default.
  CL.resetDay(st, 0, 'today'); assert.equal(st.todaySwaps, undefined); assert.equal(CL.resolveDay(st, 0, '2026-10-25').m[0], 'standard-push-ups'); assert.equal(CL.resolveDay(st, 0, '2026-10-25').c.length, 3);
  CL.resetDay(st, 0, 'plan'); assert.equal(st.program[0], undefined);
  // Editing back to the default shape clears the override automatically.
  CL.applyEdit(st, 2, { type: 'swap', section: 'm', index: 0, id: 'wall-push-ups' }, 'plan', '2026-10-25');
  CL.applyEdit(st, 2, { type: 'swap', section: 'm', index: 0, id: 'pike-push-ups' }, 'plan', '2026-10-25');
  assert.equal(st.program[2], undefined);
});

test('v3 storage: programme overrides are validated on load, survive export/import, and merge without clobbering', () => {
  const raw = { schemaVersion: 3, program: { 0: { m: ['knee-push-ups', 'nope', 'knee-push-ups', 'plank', 'burpees', 'crunches', 'v-ups', 'sit-ups', 'sumo-squats', 'wall-sit', 'jump-squats'], c: ['plank', 42] }, 9: { m: ['plank'] }, 1: { m: [] }, 2: { m: CL.PROGRAM[2].m, c: CL.PROGRAM[2].c } },
    todaySwaps: { date: '2026-10-25', dayIdx: 3, m: ['march-in-place', 'bad'], c: [] } };
  const st = CL.normalize(raw).state;
  assert.deepEqual(Object.keys(st.program), ['0']);
  assert.equal(st.program[0].m.length, CL.MAX_MAIN); assert.deepEqual(st.program[0].c, ['plank']); assert.ok(!st.program[0].m.includes('nope'));
  assert.deepEqual(st.todaySwaps, { date: '2026-10-25', dayIdx: 3, m: ['march-in-place'], c: [] });
  assert.equal(CL.normalize({ schemaVersion: 3, todaySwaps: { date: 'yesterday', dayIdx: 0, m: ['plank'] } }).state.todaySwaps, null);
  assert.equal(CL.normalize({ schemaVersion: 3, program: 'x', todaySwaps: [] }).state.todaySwaps, null);
  const again = CL.normalize(JSON.parse(JSON.stringify(st))).state;
  assert.deepEqual(again.program, st.program); assert.deepEqual(again.todaySwaps, st.todaySwaps);
  const r = CL.parseImport(JSON.stringify(st)); assert.ok(r.ok && r.from === 'v2'); assert.deepEqual(r.state.program, st.program);
  const cur = CL.emptyState(); cur.program = { 0: { m: ['plank'], c: [] } };
  const m = CL.merge(cur, st); assert.deepEqual(m.program[0].m, ['plank'], 'current customisation wins');
  const old = CL.normalize({ schemaVersion: 2, sets: { '1-0-standard-push-ups': [{ reps: 10 }] } }).state;
  assert.deepEqual(old.program, {}); assert.equal(old.todaySwaps, null); assert.equal(old.schemaVersion, 3);
});

test('v3 coach: the recorded clip catalogue covers every exercise, cue, quote, rest length and set number', () => {
  const man = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app', 'audio', 'manifest.json'), 'utf8'));
  const clips = man.clips; const dir = path.join(__dirname, '..', 'app', 'audio');
  const need = [];
  for (const id of Object.keys(CL.EX)) need.push(`ex_${id}`, `next_${id}`, `cue_${id}`, `how_${id}`);
  CL.QUOTES.forEach((_, i) => need.push(`q_${i}`)); CL.COACH_LINES.forEach((_, i) => need.push(`coach_${i}`));
  [20, 30, 45, 60, 75, 90, 120, 150].forEach(n => need.push(`rest_${n}`)); // every value offered in Settings
  for (let n = 1; n <= 6; n++) need.push(`set_${n}`);
  for (let i = 0; i < 7; i++) need.push(`day_${i}`);
  CL.WARMUP_STEPS.forEach((_, i) => need.push(`warm_${i}`)); CL.WARMUP_STEPS_LIGHT.forEach((_, i) => need.push(`warml_${i}`)); CL.COOLDOWN_STEPS.forEach((_, i) => need.push(`cool_${i}`));
  need.push('logged', 'go', 'warm_start', 'warm_done', 'lets_go', 'burn_intro', 'burn_half', 'burn_ten', 'burn_stop', 'burn_ready', 'then_burn', 'all_done', 'cool_done', 'complete', 'skipped', 'undone', 'cap_warn', 'cap_hit', 'nothing', 'resume', 'test');
  const missing = need.filter(id => !clips[id]);
  assert.deepEqual(missing, [], 'missing clips');
  for (const id of need) { const c = clips[id]; assert.ok(c.d > 0.3 && c.d < 30, `${id} duration ${c.d}`); assert.ok(fs.existsSync(path.join(dir, c.f)), `${id} file`); assert.ok(c.t && c.f.includes(c.h), id); }
  // Quotes are spoken without attribution: no "— Name" or "by Name" suffix slipped through.
  for (const q of CL.QUOTES) assert.ok(!/[—–-]\s*[A-Z][a-z]+\s+[A-Z][a-z]+\s*$/.test(q), 'attribution in quote: ' + q);
  const longest = Math.max(...CL.QUOTES.map((_, i) => clips[`q_${i}`].d));
  assert.ok(longest < 30, 'quotes are selected by duration at runtime; longest is ' + longest);
});
