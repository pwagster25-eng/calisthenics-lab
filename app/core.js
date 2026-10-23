/* Calisthenics Lab v2.0 — core logic (no DOM).
   Loaded by index.html in the browser and by tests/unit.test.js in Node.
   Everything here is pure: program data, week scaling, log-derived queue,
   v1 → v2 migration, import validation, time estimation, timer math. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CL = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCHEMA_VERSION = 2;
  const STORAGE_V1 = 'calisthenics-v1';
  const STORAGE_V2 = 'calisthenics-v2';
  const STORAGE_PREIMPORT = 'calisthenics-v2-preimport';
  const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
  const MAX_SETS_PER_KEY = 50;

  /* ------------------------------------------------------------------ */
  /* Legacy v1.x program (positional). Frozen: used ONLY to migrate the  */
  /* positional log keys `${week}-${day}-m-${i}` / `-c-${i}` to stable   */
  /* exercise ids. Do not edit.                                          */
  /* ------------------------------------------------------------------ */
  const LEGACY_PROGRAM = [
    { m: ['standard-push-ups', 'bodyweight-squats', 'wide-push-ups', 'reverse-lunges', 'reverse-snow-angels'], c: ['reverse-crunches', 'dead-bugs'] },
    { m: ['brisk-walking', 'bird-dogs', 'side-plank', 'cobra-press-ups'], c: [] },
    { m: ['pike-push-ups', 'close-grip-push-ups', 'split-squats', 'glute-bridges', 'prone-ytw-raises'], c: ['side-plank', 'dead-bugs'] },
    { m: ['brisk-walking', 'standing-knee-raises', 'bird-dogs', 'hip-mobility'], c: [] },
    { m: ['tempo-push-ups', 'pause-squats', 'staggered-push-ups', 'lateral-lunges', 'reverse-snow-angels'], c: ['bent-knee-leg-raises', 'hollow-hold'] },
    { m: ['diamond-push-ups', 'decline-push-ups', 'reverse-lunges', 'glute-bridge-march', 'prone-w-raises'], c: ['reverse-crunches', 'side-plank'] },
    { m: ['comfortable-walking', 'cobra-press-ups', 'cat-cow', 'hip-mobility'], c: [] }
  ];

  /* ------------------------------------------------------------------ */
  /* Exercise library. kind: reps | hold | cardio | mobility             */
  /* group: push | legs | hinge | pull | core | cardio | mobility        */
  /* ------------------------------------------------------------------ */
  const EX = {
    'standard-push-ups':   { name: 'Standard push-ups', kind: 'reps', group: 'push', sets: 2, lo: 12, hi: 15, cue: 'Straight trunk, elbows about 45°, stop 2–3 reps before failure.', harder: 'Slow the lowering phase to 3 seconds.' },
    'decline-push-ups':    { name: 'Decline push-ups', kind: 'reps', group: 'push', sets: 2, lo: 8, hi: 10, cue: 'Feet on a step or couch. Keep hips level; lower chest between hands.', harder: 'Raise the feet higher, or add a 1-second pause at the bottom.' },
    'wide-push-ups':       { name: 'Wide push-ups', kind: 'reps', group: 'push', sets: 2, lo: 8, hi: 10, cue: 'Hands wider than shoulders; keep shoulders away from ears.' },
    'pike-push-ups':       { name: 'Pike push-ups', kind: 'reps', group: 'push', sets: 2, lo: 6, hi: 8, cue: 'Hips high, lower the top of the head toward the floor between the hands.', harder: 'Elevate the feet on a step for more shoulder load.' },
    'close-grip-push-ups': { name: 'Close-grip push-ups', kind: 'reps', group: 'push', sets: 2, lo: 10, hi: 10, cue: 'Hands under the shoulders, elbows brushing the ribs.', harder: 'Move to diamond hand position.' },
    'tempo-push-ups':      { name: 'Tempo push-ups', kind: 'reps', group: 'push', sets: 2, lo: 8, hi: 10, cue: '3 seconds down, 1 second pause, press up smoothly.', harder: '4 seconds down.' },
    'staggered-push-ups':  { name: 'Staggered push-ups', kind: 'reps', group: 'push', sets: 2, lo: 6, hi: 6, perSide: true, cue: 'One hand a few inches forward of the other; swap sides each set.', harder: 'Increase the stagger distance.' },
    'diamond-push-ups':    { name: 'Diamond push-ups', kind: 'reps', group: 'push', sets: 2, lo: 6, hi: 10, cue: 'Thumbs and index fingers touching under the sternum. Shorten the range if wrists complain.', harder: 'Add a slow 3-second lowering.' },
    'bodyweight-squats':   { name: 'Bodyweight squats', kind: 'reps', group: 'legs', sets: 2, lo: 15, hi: 15, cue: 'Feet shoulder-width, sit back and down, knees track over toes.', harder: 'Pause 2 seconds at the bottom.' },
    'pause-squats':        { name: 'Pause squats', kind: 'reps', group: 'legs', sets: 2, lo: 12, hi: 12, cue: 'Hold the bottom for 2 seconds, keep breathing.', harder: '3-second pause.' },
    'reverse-lunges':      { name: 'Reverse lunges', kind: 'reps', group: 'legs', sets: 2, lo: 8, hi: 8, perSide: true, cue: 'Step back, lower the rear knee gently, drive through the front heel. Use a wall for balance.', harder: 'Slow the descent.' },
    'split-squats':        { name: 'Split squats', kind: 'reps', group: 'legs', sets: 2, lo: 8, hi: 8, perSide: true, cue: 'Long stance, torso upright, front shin vertical.', harder: 'Rear foot elevated on a low step.' },
    'lateral-lunges':      { name: 'Lateral lunges', kind: 'reps', group: 'legs', sets: 2, lo: 8, hi: 8, perSide: true, cue: 'Step wide, sit into one hip, keep the other leg straight.' },
    'single-leg-rdl':      { name: 'Single-leg Romanian deadlift', kind: 'reps', group: 'hinge', sets: 2, lo: 8, hi: 8, perSide: true, cue: 'Hinge at the hip, back flat, reach the free leg behind you. Fingertips on a wall for balance.', harder: 'Hold a filled water bottle in each hand.' },
    'glute-bridges':       { name: 'Glute bridges', kind: 'reps', group: 'hinge', sets: 2, lo: 15, hi: 15, cue: 'Drive through the heels, squeeze at the top, ribs down.', harder: 'Single-leg glute bridges, 8–10 per side.' },
    'glute-bridge-march':  { name: 'Glute bridge march', kind: 'reps', group: 'hinge', sets: 2, lo: 10, hi: 10, perSide: true, cue: 'Hold the bridge, lift one foot at a time without the hips dropping.' },
    'rows':                { name: 'Table or band rows', kind: 'reps', group: 'pull', sets: 2, lo: 8, hi: 12, cue: 'Optional swap if you ever have a sturdy table edge or a band: pull chest to the edge, squeeze shoulder blades. Not scheduled by default (no equipment).', harder: 'Walk the feet further forward (more horizontal).' },
    'prone-swimmers':      { name: 'Prone swimmers', kind: 'reps', group: 'pull', sets: 2, lo: 10, hi: 12, perSide: true, cue: 'Face down, arms overhead. Lift opposite arm and leg together, lower slowly, switch. Keep the neck long.', harder: 'Add a 2-second hold at the top.' },
    'reverse-snow-angels': { name: 'Reverse snow angels', kind: 'reps', group: 'pull', sets: 2, lo: 10, hi: 10, cue: 'Face down, arms sweep from hips to overhead just off the floor. Light upper-back work, not a pulling substitute.' },
    'prone-ytw-raises':    { name: 'Prone Y-T-W raises', kind: 'reps', group: 'pull', sets: 2, lo: 8, hi: 8, cue: 'Face down; raise arms in Y, then T, then W. One rep = all three.' },
    'prone-w-raises':      { name: 'Prone W raises', kind: 'reps', group: 'pull', sets: 2, lo: 12, hi: 12, cue: 'Elbows bent, squeeze the shoulder blades down and together.' },
    'reverse-crunches':    { name: 'Reverse crunches', kind: 'reps', group: 'core', sets: 2, lo: 12, hi: 12, cue: 'Curl the pelvis off the floor; lower slowly.' },
    'dead-bugs':           { name: 'Dead bugs', kind: 'reps', group: 'core', sets: 2, lo: 8, hi: 8, perSide: true, cue: 'Lower back pressed down; opposite arm and leg reach; exhale as you extend.' },
    'bent-knee-leg-raises':{ name: 'Bent-knee leg raises', kind: 'reps', group: 'core', sets: 2, lo: 10, hi: 10, cue: 'Knees bent 90°, lift and lower slowly without arching.' },
    'hollow-hold':         { name: 'Hollow hold', kind: 'hold', group: 'core', sets: 2, lo: 15, hi: 20, cue: 'Lower back glued to the floor, arms and legs long. Breathe.', harder: 'Lower the legs a little.' },
    'side-plank':          { name: 'Side plank', kind: 'hold', group: 'core', sets: 2, lo: 20, hi: 25, perSide: true, cue: 'Elbow under shoulder, hips stacked and lifted. Knees down to regress.' },
    'bird-dogs':           { name: 'Bird dogs', kind: 'reps', group: 'core', sets: 2, lo: 10, hi: 10, perSide: true, cue: 'Opposite arm and leg, pause 1 second, keep the hips level.' },
    'standing-knee-raises':{ name: 'Standing knee raises', kind: 'reps', group: 'core', sets: 2, lo: 12, hi: 12, cue: 'Tall posture, lift knee to hip height with control.' },
    'cobra-press-ups':     { name: 'Cobra press-ups', kind: 'reps', group: 'mobility', sets: 1, lo: 8, hi: 8, cue: 'Hips stay on the floor; press the chest up only as far as is comfortable.' },
    'cat-cow':             { name: 'Cat-cow', kind: 'reps', group: 'mobility', sets: 1, lo: 8, hi: 8, cue: 'Slow, breathe with the movement.' },
    'hip-mobility':        { name: 'Hip mobility', kind: 'mobility', group: 'mobility', sets: 1, lo: 3, hi: 3, cue: '90/90 switches, hip circles, deep squat hold.' },
    'brisk-walking':       { name: 'Brisk walking', kind: 'cardio', group: 'cardio', sets: 1, lo: 12, hi: 15, cue: 'Conversational pace. Nose breathing if you can.' },
    'walk-or-shadowbox':   { name: 'Brisk walking or shadowboxing', kind: 'cardio', group: 'cardio', sets: 1, lo: 15, hi: 15, cue: 'Easy, steady effort — about 5/10.' },
    'comfortable-walking': { name: 'Comfortable walking', kind: 'cardio', group: 'cardio', sets: 1, lo: 15, hi: 20, cue: 'Relaxed. This is recovery.' }
  };

  /* Day plans. Changes from v1.2 are marked // v2. */
  const PROGRAM = [
    { d: 'Mon', n: 'Full Body A', k: 'Strength', f: 'Chest • quads • upper back • abs',
      m: ['standard-push-ups', 'bodyweight-squats', 'decline-push-ups' /* v2: was wide-push-ups */, 'reverse-lunges', 'reverse-snow-angels'],
      c: ['reverse-crunches', 'dead-bugs'] },
    { d: 'Tue', n: 'Core + Mobility', k: 'Light', f: 'Stability • walking',
      m: ['brisk-walking', 'bird-dogs', 'side-plank', 'cobra-press-ups'], c: [] },
    { d: 'Wed', n: 'Full Body B', k: 'Strength', f: 'Shoulders • legs • core',
      m: ['pike-push-ups', 'close-grip-push-ups', 'split-squats', 'glute-bridges', 'prone-ytw-raises'],
      c: ['side-plank', 'dead-bugs'] },
    { d: 'Thu', n: 'Conditioning + Core', k: 'Light', f: 'Aerobic work • mobility',
      m: ['walk-or-shadowbox', 'standing-knee-raises', 'bird-dogs', 'hip-mobility'], c: [] },
    { d: 'Fri', n: 'Full Body C', k: 'Strength', f: 'Tempo • balance • core',
      m: ['tempo-push-ups', 'pause-squats', 'staggered-push-ups', 'lateral-lunges', 'reverse-snow-angels'],
      c: ['bent-knee-leg-raises', 'hollow-hold'] },
    { d: 'Sat', n: 'Full Body D', k: 'Strength', f: 'Push • posterior chain • hinge',
      m: ['diamond-push-ups', 'prone-swimmers' /* v2: was decline-push-ups */, 'single-leg-rdl' /* v2: was reverse-lunges */, 'glute-bridge-march', 'prone-w-raises'],
      c: ['reverse-crunches', 'side-plank'] },
    { d: 'Sun', n: 'Active Recovery', k: 'Recovery', f: 'Mobility • easy walk',
      m: ['comfortable-walking', 'cobra-press-ups', 'cat-cow', 'hip-mobility'], c: [] }
  ];

  const PHASES = [
    { tier: 'foundation', text: 'Foundation: technique first, low end of each rep range.' },
    { tier: 'foundation', text: 'Consistency: same volume, cleaner reps.' },
    { tier: 'build', text: 'Build: work to the top of each rep range.' },
    { tier: 'build', text: 'Control: full range of motion, steady tempo.' },
    { tier: 'progress', text: 'Progress: harder variation on the first push exercise, or a third set.' },
    { tier: 'progress', text: 'Add difficulty OR repetitions, not both.' },
    { tier: 'consolidate', text: 'Consolidate: a third set on the first two exercises; leave 2 reps in reserve.' },
    { tier: 'deload', text: 'Deload: about half the sets, low end of ranges, reassess.' }
  ];

  const DEFAULT_SETTINGS = {
    restWithin: 45,        // seconds between sets of the same exercise (strength days)
    restBetween: 60,       // seconds when moving to a new exercise (strength days)
    restLight: 30,         // seconds on Light/Recovery days and for the core finisher
    soundOn: true,
    voiceOn: true,
    hapticsOn: true,
    countdownOn: true,     // 3-2-1 beeps at end of rest
    keepAwake: true,       // request a screen wake lock during a guided session
    capMinutes: 45,
    warnMinutes: 40
  };

  /* ------------------------------------------------------------------ */
  /* Week scaling                                                        */
  /* ------------------------------------------------------------------ */
  function prescription(exId, week, dayIdx, posInMain) {
    const ex = EX[exId];
    const tier = PHASES[week - 1].tier;
    let sets = ex.sets, target = ex.lo, hint = '';
    const isStrength = ['push', 'legs', 'hinge', 'pull'].includes(ex.group);
    if (tier === 'build' || tier === 'progress' || tier === 'consolidate') target = ex.hi;
    if (tier === 'progress' && isStrength && posInMain === 0 && ex.harder) hint = ex.harder;
    if (tier === 'consolidate' && isStrength && (posInMain === 0 || posInMain === 1)) sets = ex.sets + 1;
    if (tier === 'deload') { sets = Math.max(1, Math.ceil(ex.sets / 2)); target = ex.lo; }
    const unit = ex.kind === 'hold' ? 'sec' : ex.kind === 'cardio' || ex.kind === 'mobility' ? 'min' : 'reps';
    const range = ex.lo === ex.hi ? String(ex.lo) : `${ex.lo}–${ex.hi}`;
    const side = ex.perSide ? '/side' : '';
    const label = unit === 'min' ? `${range} min` : `${sets} × ${range}${unit === 'sec' ? ' sec' : ''}${side}`;
    return { sets, target, unit, label, hint, perSide: !!ex.perSide, kind: ex.kind };
  }

  function dayPlan(dayIdx, week) {
    const p = PROGRAM[dayIdx];
    const mk = (section) => p[section].map((id, i) => {
      const pr = prescription(id, week, dayIdx, section === 'm' ? i : -1);
      return Object.assign({ id, section, name: EX[id].name, cue: EX[id].cue, group: EX[id].group, lo: EX[id].lo, hi: EX[id].hi, logKey: `${week}-${dayIdx}-${id}` }, pr);
    });
    return { dayIdx, week, d: p.d, n: p.n, k: p.k, f: p.f, light: p.k !== 'Strength', items: [...mk('m'), ...mk('c')], mainCount: p.m.length };
  }

  /* Honest time estimate (minutes). */
  function estimateMinutes(plan, settings) {
    const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    let work = 0, rest = 0;
    plan.items.forEach((it, idx) => {
      const sides = it.perSide ? 2 : 1;
      let per = it.kind === 'reps' ? it.target * 3 * sides + 10 : it.kind === 'hold' ? it.target * sides + 10 : it.target * 60;
      work += per * it.sets;
      for (let k = 1; k <= it.sets; k++) {
        const last = idx === plan.items.length - 1 && k === it.sets;
        if (last) continue;
        const between = k === it.sets;
        rest += restFor(it, between, plan.light, s);
      }
    });
    const warm = plan.light ? 2 * 60 : 4 * 60, cool = plan.light ? 60 : 2 * 60;
    const total = (warm + work + rest + cool) / 60;
    return { minutes: Math.round(total), workMin: Math.round(work / 60), restMin: Math.round(rest / 60), fits: total <= s.capMinutes };
  }

  function restFor(item, between, light, settings) {
    const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    if (item.kind === 'cardio' || item.kind === 'mobility') return light ? 0 : s.restLight;
    if (light || item.group === 'core') return s.restLight;
    return between ? s.restBetween : s.restWithin;
  }

  /* ------------------------------------------------------------------ */
  /* Log-derived session queue                                           */
  /* The queue position is COMPUTED from logged sets + session skips, so */
  /* list logging, guided logging, undo and skip can never disagree.     */
  /* ------------------------------------------------------------------ */
  function buildQueue(plan) {
    const q = [];
    plan.items.forEach((it, ei) => { for (let s = 1; s <= it.sets; s++) q.push({ item: it, ei, setNo: s, lastOfExercise: s === it.sets }); });
    return q;
  }

  function sessionPosition(plan, sets, skipped) {
    const q = buildQueue(plan);
    const counts = {};
    plan.items.forEach(it => { counts[it.logKey] = (sets[it.logKey] || []).length + ((skipped || {})[it.logKey] || 0); });
    let index = q.length;
    for (let i = 0; i < q.length; i++) {
      const c = counts[q[i].item.logKey];
      if (q[i].setNo > c) { index = i; break; }
    }
    // Because counts are per-exercise, the first unmet set in exercise order is correct even if
    // the user logged extra sets on a later exercise via the list.
    return { index, total: q.length, current: q[index] || null, next: q[index + 1] || null, done: index >= q.length, queue: q };
  }

  /* ------------------------------------------------------------------ */
  /* Validation & migration                                              */
  /* ------------------------------------------------------------------ */
  const V1_KEY = /^([1-8])-([0-6])-([mc])-(\d{1,2})$/;
  const V2_KEY = /^([1-8])-([0-6])-([a-z0-9-]{2,40})$/;
  const UNITS = ['reps', 'sec', 'min'];

  function slugLegacy(week, day, section, i) {
    const names = LEGACY_PROGRAM[day] && LEGACY_PROGRAM[day][section];
    const id = names && names[i];
    return id ? `${week}-${day}-${id}` : `${week}-${day}-legacy-${section}${i}`;
  }

  function cleanSetEntry(x) {
    if (!x || typeof x !== 'object') return null;
    const reps = Number(x.reps);
    if (!Number.isFinite(reps) || reps < 0 || reps > 999) return null;
    const out = { reps: Math.round(reps) };
    if (typeof x.at === 'string' && x.at.length <= 40 && !Number.isNaN(Date.parse(x.at))) out.at = new Date(x.at).toISOString();
    if (UNITS.includes(x.unit)) out.unit = x.unit;
    return out;
  }

  function cleanSets(raw, notes) {
    const out = {}; let dropped = 0, migrated = 0;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const k of Object.keys(raw)) {
      let key = null, m;
      if ((m = V1_KEY.exec(k))) { key = slugLegacy(+m[1], +m[2], m[3], +m[4]); migrated++; }
      else if ((m = V2_KEY.exec(k))) key = k; // unknown-but-well-formed ids are kept (shown as "Also logged")
      if (!key) { dropped++; continue; }
      const arr = Array.isArray(raw[k]) ? raw[k] : [];
      const list = arr.slice(0, MAX_SETS_PER_KEY).map(cleanSetEntry).filter(Boolean);
      dropped += Math.max(0, arr.length - list.length);
      if (list.length) out[key] = (out[key] || []).concat(list);
    }
    if (migrated) notes.push(`${migrated} legacy log key(s) migrated to stable exercise ids.`);
    if (dropped) notes.push(`${dropped} invalid log entr${dropped === 1 ? 'y' : 'ies'} ignored.`);
    return out;
  }

  function cleanDone(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const k of Object.keys(raw)) if (/^[1-8]-[0-6]$/.test(k) && raw[k]) out[k] = true;
    return out;
  }

  function cleanPrs(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object') return out;
    for (const k of Object.keys(raw)) { const n = Number(raw[k]); if (/^[1-8]$/.test(k) && Number.isFinite(n) && n >= 0 && n <= 999) out[k] = Math.round(n); }
    return out;
  }

  function cleanSettings(raw, legacy) {
    const s = Object.assign({}, DEFAULT_SETTINGS);
    const src = (raw && typeof raw === 'object') ? raw : {};
    const num = (k, lo, hi) => { const n = Number(src[k]); if (Number.isFinite(n) && n >= lo && n <= hi) s[k] = Math.round(n); };
    num('restWithin', 0, 600); num('restBetween', 0, 600); num('restLight', 0, 600); num('capMinutes', 10, 120); num('warnMinutes', 1, 119);
    ['soundOn', 'voiceOn', 'hapticsOn', 'countdownOn', 'keepAwake'].forEach(k => { if (typeof src[k] === 'boolean') s[k] = src[k]; });
    if (legacy) {
      const r = Number(legacy.restSeconds); if (Number.isFinite(r) && r >= 0 && r <= 600) { s.restWithin = r; s.restBetween = Math.max(r, Math.min(600, r + 30)); }
      if (typeof legacy.soundOn === 'boolean') { s.soundOn = legacy.soundOn; s.voiceOn = legacy.soundOn; }
    }
    if (s.warnMinutes >= s.capMinutes) s.warnMinutes = Math.max(1, s.capMinutes - 5);
    return s;
  }

  function emptyState() {
    return { schemaVersion: SCHEMA_VERSION, week: 1, day: 0, done: {}, prs: {}, sets: {}, settings: Object.assign({}, DEFAULT_SETTINGS), session: null, history: [] };
  }

  /* Normalise any raw object (v1 storage, v1 backup, v2 storage, v2 backup) into a clean v2 state. */
  function normalize(raw) {
    const notes = [];
    const st = emptyState();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { state: st, notes: ['Empty or unrecognised data; starting fresh.'], from: 'empty' };
    const isV2 = raw.schemaVersion === SCHEMA_VERSION;
    st.week = clamp(Number(raw.week) || 1, 1, 8);
    st.day = clamp(Number(raw.day) || 0, 0, 6);
    st.done = cleanDone(raw.done);
    st.prs = cleanPrs(raw.prs);
    st.sets = cleanSets(raw.sets, notes);
    st.settings = cleanSettings(raw.settings, isV2 ? null : raw);
    st.session = cleanSession(raw.session);
    st.history = cleanHistory(raw.history);
    return { state: st, notes, from: isV2 ? 'v2' : 'v1' };
  }

  function cleanSession(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const n = (k) => { const v = Number(raw[k]); return Number.isFinite(v) && v >= 0 ? v : 0; };
    if (!/^[1-8]-[0-6]$/.test(String(raw.key)) || !n('startedAt')) return null;
    const skipped = {};
    if (raw.skipped && typeof raw.skipped === 'object') for (const k of Object.keys(raw.skipped)) if (V2_KEY.test(k)) { const v = Number(raw.skipped[k]); if (Number.isFinite(v) && v > 0 && v < 20) skipped[k] = Math.round(v); }
    return { key: raw.key, startedAt: n('startedAt'), pausedAt: n('pausedAt') || 0, pausedTotal: n('pausedTotal'), restUntil: n('restUntil') || 0, restTotal: n('restTotal') || 0, restKind: raw.restKind === 'between' ? 'between' : 'within', skipped, warned: !!raw.warned, capped: !!raw.capped };
  }

  function cleanHistory(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.slice(-200).map(h => {
      if (!h || typeof h !== 'object' || !/^[1-8]-[0-6]$/.test(String(h.key))) return null;
      const start = Number(h.startedAt), end = Number(h.endedAt), logged = Number(h.setsLogged);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
      return { key: h.key, startedAt: start, endedAt: end, setsLogged: Number.isFinite(logged) ? logged : 0, completed: !!h.completed };
    }).filter(Boolean);
  }

  /* Merge an imported clean state into the current clean state (union; never drops current data). */
  function merge(current, incoming) {
    const out = JSON.parse(JSON.stringify(current));
    for (const k of Object.keys(incoming.sets)) {
      const have = out.sets[k] || [];
      const sig = new Set(have.map(x => `${x.at || ''}|${x.reps}`));
      for (const e of incoming.sets[k]) { const s = `${e.at || ''}|${e.reps}`; if (!sig.has(s)) { have.push(e); sig.add(s); } }
      have.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
      out.sets[k] = have.slice(0, MAX_SETS_PER_KEY);
    }
    Object.assign(out.done, incoming.done);
    for (const w of Object.keys(incoming.prs)) out.prs[w] = Math.max(out.prs[w] || 0, incoming.prs[w]);
    const seen = new Set(out.history.map(h => `${h.key}|${h.startedAt}`));
    for (const h of incoming.history) if (!seen.has(`${h.key}|${h.startedAt}`)) out.history.push(h);
    out.history.sort((a, b) => a.startedAt - b.startedAt);
    return out;
  }

  /* Parse an import file's text safely. */
  function parseImport(text) {
    if (typeof text !== 'string') return { ok: false, error: 'Not a text file.' };
    if (text.length > MAX_IMPORT_BYTES) return { ok: false, error: 'Backup is too large (limit 2 MB).' };
    let raw;
    try { raw = JSON.parse(text); } catch { return { ok: false, error: 'Not valid JSON.' }; }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'Backup must be a JSON object.' };
    const r = normalize(raw);
    const n = Object.values(r.state.sets).reduce((a, b) => a + b.length, 0);
    return { ok: true, state: r.state, notes: r.notes, from: r.from, setCount: n, dayCount: Object.keys(r.state.done).length };
  }

  /* ------------------------------------------------------------------ */
  /* Timer math (deadline based — survives tab suspension)                */
  /* ------------------------------------------------------------------ */
  function secondsLeft(until, now) { return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0; }
  function fmt(sec) { sec = Math.max(0, Math.round(sec)); return `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`; }
  function elapsedMs(session, now) {
    if (!session) return 0;
    const end = session.pausedAt || now;
    return Math.max(0, end - session.startedAt - session.pausedTotal);
  }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  return {
    SCHEMA_VERSION, STORAGE_V1, STORAGE_V2, STORAGE_PREIMPORT, MAX_IMPORT_BYTES, DEFAULT_SETTINGS,
    EX, PROGRAM, PHASES, LEGACY_PROGRAM,
    prescription, dayPlan, estimateMinutes, restFor, buildQueue, sessionPosition,
    normalize, merge, parseImport, emptyState, cleanSetEntry,
    secondsLeft, fmt, elapsedMs, clamp
  };
});
