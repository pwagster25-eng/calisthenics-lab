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
    'standard-push-ups':   { name: 'Standard push-ups', kind: 'reps', group: 'push', sets: 2, lo: 12, hi: 15, cue: 'Straight trunk, elbows about 45°, stop 2–3 reps before failure.', harder: 'Slow the lowering phase to 3 seconds.', how: "Hands just wider than shoulders, body in one straight line from head to heels. Lower until your chest is a fist's height from the floor, elbows pointing back at about 45 degrees, then press up. Mistake: hips sagging or rising — brace your stomach like you're about to be poked." },
    'decline-push-ups':    { name: 'Decline push-ups', kind: 'reps', group: 'push', sets: 2, lo: 8, hi: 10, cue: 'Feet on a step or couch. Keep hips level; lower chest between hands.', harder: 'Raise the feet higher, or add a 1-second pause at the bottom.', how: "Feet up on a step, couch or bottom stair; hands on the floor under your shoulders. Lower your chest between your hands and press back up. The higher the feet, the harder it is. Mistake: letting the hips pike up — keep the straight line." },
    'wide-push-ups':       { name: 'Wide push-ups', kind: 'reps', group: 'push', sets: 2, lo: 8, hi: 10, cue: 'Hands wider than shoulders; keep shoulders away from ears.', how: "Hands about one and a half shoulder-widths apart, fingers slightly out. Lower the chest toward the floor and press up. Mistake: elbows flaring straight out to the sides — keep them a little behind the wrists." },
    'pike-push-ups':       { name: 'Pike push-ups', kind: 'reps', group: 'push', sets: 2, lo: 6, hi: 8, cue: 'Hips high, lower the top of the head toward the floor between the hands.', harder: 'Elevate the feet on a step for more shoulder load.', how: "Start in a push-up position, then walk your feet in and push your hips up so your body makes an upside-down V. Bend the elbows to lower the top of your head toward the floor between your hands, then press back up. Mistake: turning it into a normal push-up — keep the hips high so the shoulders do the work." },
    'close-grip-push-ups': { name: 'Close-grip push-ups', kind: 'reps', group: 'push', sets: 2, lo: 10, hi: 10, cue: 'Hands under the shoulders, elbows brushing the ribs.', harder: 'Move to diamond hand position.', how: "Hands directly under the shoulders, no wider. Lower with the elbows brushing your ribs and press up. Mistake: hands drifting wide — if it feels awkward, shorten the range rather than widen the hands." },
    'tempo-push-ups':      { name: 'Tempo push-ups', kind: 'reps', group: 'push', sets: 2, lo: 8, hi: 10, cue: '3 seconds down, 1 second pause, press up smoothly.', harder: '4 seconds down.', how: "A normal push-up done slowly: count three seconds on the way down, pause one second at the bottom, then press up at normal speed. Mistake: speeding up as you tire — if you can't keep the count, stop the set." },
    'staggered-push-ups':  { name: 'Staggered push-ups', kind: 'reps', group: 'push', sets: 2, lo: 6, hi: 6, perSide: true, cue: 'One hand a few inches forward of the other; swap sides each set.', harder: 'Increase the stagger distance.', how: "Push-up position, but slide one hand forward about a hand-length so the hands are offset. Do all reps, then swap hands for the next set. The rear hand works harder. Mistake: twisting the hips toward the forward hand — keep the shoulders square." },
    'diamond-push-ups':    { name: 'Diamond push-ups', kind: 'reps', group: 'push', sets: 2, lo: 6, hi: 10, cue: 'Thumbs and index fingers touching under the sternum. Shorten the range if wrists complain.', harder: 'Add a slow 3-second lowering.', how: "Hands together under your sternum with the thumbs and index fingers touching to make a diamond. Lower your chest to your hands and press up; elbows stay close to the body. Mistake: wrist pain — if it hurts, move the hands a few inches apart." },
    'bodyweight-squats':   { name: 'Bodyweight squats', kind: 'reps', group: 'legs', sets: 2, lo: 15, hi: 15, cue: 'Feet shoulder-width, sit back and down, knees track over toes.', harder: 'Pause 2 seconds at the bottom.', how: "Feet shoulder-width, toes slightly out, arms out front for balance. Push the hips back and bend the knees to sit down as low as is comfortable, then drive through the heels to stand. Mistake: heels lifting or knees caving in — keep the whole foot down and the knees over the toes." },
    'pause-squats':        { name: 'Pause squats', kind: 'reps', group: 'legs', sets: 2, lo: 12, hi: 12, cue: 'Hold the bottom for 2 seconds, keep breathing.', harder: '3-second pause.', how: "A normal squat, but hold the bottom position for a full two seconds before standing. Keep breathing during the pause. Mistake: relaxing at the bottom — stay tight, chest up." },
    'reverse-lunges':      { name: 'Reverse lunges', kind: 'reps', group: 'legs', sets: 2, lo: 8, hi: 8, perSide: true, cue: 'Step back, lower the rear knee gently, drive through the front heel. Use a wall for balance.', harder: 'Slow the descent.', how: "Stand tall, step one foot straight back and lower until the back knee is just above the floor; both knees about 90 degrees. Push through the front heel to return. Alternate legs or do all reps on one side. Mistake: leaning forward — keep the torso upright, hand on a wall if balance is shaky." },
    'split-squats':        { name: 'Split squats', kind: 'reps', group: 'legs', sets: 2, lo: 8, hi: 8, perSide: true, cue: 'Long stance, torso upright, front shin vertical.', harder: 'Rear foot elevated on a low step.', how: "Take a long step forward and keep the feet there the whole set. Lower straight down until the back knee nearly touches, then push up through the front foot. All reps on one leg, then switch. Mistake: short stance — the front shin should stay roughly vertical." },
    'lateral-lunges':      { name: 'Lateral lunges', kind: 'reps', group: 'legs', sets: 2, lo: 8, hi: 8, perSide: true, cue: 'Step wide, sit into one hip, keep the other leg straight.', how: "Feet together, step wide to one side and sit your hips back over that foot, keeping the other leg straight and both feet flat. Push off to return. Mistake: the knee going past the toes — think 'sit back', not 'lean forward'." },
    'single-leg-rdl':      { name: 'Single-leg Romanian deadlift', kind: 'reps', group: 'hinge', sets: 2, lo: 8, hi: 8, perSide: true, cue: 'Hinge at the hip, back flat, reach the free leg behind you. Fingertips on a wall for balance.', harder: 'Hold a filled water bottle in each hand.', how: "Stand on one leg with a soft knee. Hinge at the hips, sending the free leg straight back and the chest forward, until your torso is roughly parallel to the floor, then squeeze the glute to stand. Fingertips on a wall for balance. Mistake: rounding the back — keep it flat and move only at the hip." },
    'glute-bridges':       { name: 'Glute bridges', kind: 'reps', group: 'hinge', sets: 2, lo: 15, hi: 15, cue: 'Drive through the heels, squeeze at the top, ribs down.', harder: 'Single-leg glute bridges, 8–10 per side.', how: "Lie on your back, knees bent, feet flat and hip-width. Drive through the heels to lift the hips until your body is a straight line from shoulders to knees, squeeze at the top, lower slowly. Mistake: arching the lower back — keep the ribs down and stop when the glutes are fully squeezed." },
    'glute-bridge-march':  { name: 'Glute bridge march', kind: 'reps', group: 'hinge', sets: 2, lo: 10, hi: 10, perSide: true, cue: 'Hold the bridge, lift one foot at a time without the hips dropping.', how: "Hold the top of a glute bridge. Lift one foot a few inches off the floor, set it down, then lift the other, without letting the hips drop or rotate. Mistake: hips tilting as a foot leaves the floor — go slower." },
    'rows':                { name: 'Table or band rows', kind: 'reps', group: 'pull', sets: 2, lo: 8, hi: 12, cue: 'Optional swap if you ever have a sturdy table edge or a band: pull chest to the edge, squeeze shoulder blades. Not scheduled by default (no equipment).', harder: 'Walk the feet further forward (more horizontal).', how: "Lie under a sturdy table edge, grab it with both hands, body straight, and pull your chest up to the edge; or anchor a band at chest height and pull the handles to your ribs. Lower under control. Mistake: shrugging — pull the shoulder blades down and back." },
    'prone-swimmers':      { name: 'Prone swimmers', kind: 'reps', group: 'pull', sets: 2, lo: 10, hi: 12, perSide: true, cue: 'Face down, arms overhead. Lift opposite arm and leg together, lower slowly, switch. Keep the neck long.', harder: 'Add a 2-second hold at the top.', how: "Lie face down with arms stretched overhead. Lift the right arm and left leg a few inches off the floor, lower, then lift the left arm and right leg. Keep the neck long, eyes on the floor. Mistake: cranking the head up — the chin stays tucked." },
    'reverse-snow-angels': { name: 'Reverse snow angels', kind: 'reps', group: 'pull', sets: 2, lo: 10, hi: 10, cue: 'Face down, arms sweep from hips to overhead just off the floor. Light upper-back work, not a pulling substitute.', how: "Lie face down, arms by your sides, palms down. Lift the arms slightly off the floor and sweep them in a wide arc up to overhead, then back to the hips, keeping them off the floor the whole time. Mistake: lifting the chest — only the arms move." },
    'prone-ytw-raises':    { name: 'Prone Y-T-W raises', kind: 'reps', group: 'pull', sets: 2, lo: 8, hi: 8, cue: 'Face down; raise arms in Y, then T, then W. One rep = all three.', how: "Lie face down. Raise straight arms into a Y shape, lower; raise them out sideways into a T, lower; then bend the elbows and squeeze into a W, lower. That is one rep. Mistake: rushing — pause for a second at the top of each letter." },
    'prone-w-raises':      { name: 'Prone W raises', kind: 'reps', group: 'pull', sets: 2, lo: 12, hi: 12, cue: 'Elbows bent, squeeze the shoulder blades down and together.', how: "Lie face down with elbows bent so your arms make a W. Lift the arms and squeeze the shoulder blades down and together, hold a second, lower. Mistake: using the lower back — keep the hips and chest on the floor." },
    'reverse-crunches':    { name: 'Reverse crunches', kind: 'reps', group: 'core', sets: 2, lo: 12, hi: 12, cue: 'Curl the pelvis off the floor; lower slowly.', how: "Lie on your back, knees bent to 90 degrees and lifted so the shins are parallel to the floor, hands by your sides. Curl the knees toward the chest so the hips lift slightly off the floor, then lower slowly. Mistake: swinging the legs — use the stomach, not momentum." },
    'dead-bugs':           { name: 'Dead bugs', kind: 'reps', group: 'core', sets: 2, lo: 8, hi: 8, perSide: true, cue: 'Lower back pressed down; opposite arm and leg reach; exhale as you extend.', how: "Lie on your back, arms straight up, knees bent above the hips. Press the lower back into the floor and slowly extend the right arm overhead and the left leg out straight, hovering above the floor; return and switch sides. Mistake: the lower back lifting off the floor — shorten the reach." },
    'bent-knee-leg-raises':{ name: 'Bent-knee leg raises', kind: 'reps', group: 'core', sets: 2, lo: 10, hi: 10, cue: 'Knees bent 90°, lift and lower slowly without arching.', how: "Lie on your back, hands under the hips, knees bent. Lift the knees toward the chest until the hips come off the floor slightly, then lower the feet toward the floor without arching the back. Mistake: lowering too far — stop before the back lifts." },
    'hollow-hold':         { name: 'Hollow hold', kind: 'hold', group: 'core', sets: 2, lo: 15, hi: 20, cue: 'Lower back glued to the floor, arms and legs long. Breathe.', harder: 'Lower the legs a little.', how: "Lie on your back, press the lower back into the floor, then lift the shoulders and straight legs a few inches off the floor with the arms reaching past the ears. Hold and breathe. Mistake: the lower back arching — bend the knees or raise the legs higher to make it easier." },
    'side-plank':          { name: 'Side plank', kind: 'hold', group: 'core', sets: 2, lo: 20, hi: 25, perSide: true, cue: 'Elbow under shoulder, hips stacked and lifted. Knees down to regress.', how: "Lie on your side, elbow directly under the shoulder, feet stacked. Lift the hips so your body is a straight line and hold. Knees on the floor makes it easier. Mistake: hips sagging — push the floor away with the elbow." },
    'bird-dogs':           { name: 'Bird dogs', kind: 'reps', group: 'core', sets: 2, lo: 10, hi: 10, perSide: true, cue: 'Opposite arm and leg, pause 1 second, keep the hips level.', how: "On hands and knees, hands under shoulders and knees under hips. Reach the right arm forward and the left leg back until both are level with the body, pause a second, return, then switch. Mistake: hips rotating — keep them square to the floor." },
    'standing-knee-raises':{ name: 'Standing knee raises', kind: 'reps', group: 'core', sets: 2, lo: 12, hi: 12, cue: 'Tall posture, lift knee to hip height with control.', how: "Stand tall, hands on hips. Lift one knee to hip height with control, lower, and alternate. Mistake: leaning back to lift the knee — stay upright and brace the stomach." },
    'cobra-press-ups':     { name: 'Cobra press-ups', kind: 'reps', group: 'mobility', sets: 1, lo: 8, hi: 8, cue: 'Hips stay on the floor; press the chest up only as far as is comfortable.', how: "Lie face down, hands under the shoulders, hips on the floor. Press the chest up by straightening the arms only as far as is comfortable, keep the hips down, pause, and lower. Mistake: pinching in the lower back — press up less far and keep the glutes relaxed." },
    'cat-cow':             { name: 'Cat-cow', kind: 'reps', group: 'mobility', sets: 1, lo: 8, hi: 8, cue: 'Slow, breathe with the movement.', how: "On hands and knees. Breathe in and let the belly drop while the chest and tailbone lift (cow); breathe out and round the spine toward the ceiling, tucking the chin (cat). Move slowly with the breath." },
    'hip-mobility':        { name: 'Hip mobility', kind: 'mobility', group: 'mobility', sets: 1, lo: 3, hi: 3, cue: '90/90 switches, hip circles, deep squat hold.', how: "Three minutes of easy hip movement: sit on the floor with both knees bent to 90 degrees and switch sides (90/90 switches), stand and make slow hip circles, then sink into a deep squat and hold, rocking gently. Nothing should hurt." },
    'brisk-walking':       { name: 'Brisk walking', kind: 'cardio', group: 'cardio', sets: 1, lo: 12, hi: 15, cue: 'Conversational pace. Nose breathing if you can.', how: "Walk fast enough that you can talk in full sentences but couldn't sing. Arms swinging, tall posture, nose breathing if you can." },
    'walk-or-shadowbox':   { name: 'Brisk walking or shadowboxing', kind: 'cardio', group: 'cardio', sets: 1, lo: 15, hi: 15, cue: 'Easy, steady effort — about 5/10.', how: "Either a brisk walk, or shadowboxing: stand in a boxing stance and throw light, relaxed punches at the air while moving your feet, for fifteen minutes at an easy effort of about five out of ten." },
    'comfortable-walking': { name: 'Comfortable walking', kind: 'cardio', group: 'cardio', sets: 1, lo: 15, hi: 20, cue: 'Relaxed. This is recovery.', how: "An easy, relaxed walk at whatever pace feels pleasant. This is recovery, not training." }
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
    warnMinutes: 40,
    extraSets: 1,          // added to every 2-set strength exercise (3 sets by default)
    burnoutOn: true,       // last set of each strength exercise is a timed burnout
    burnoutSeconds: 40,
    warmupSeconds: 240,    // strength days (light days use half)
    cooldownSeconds: 120,
    cueLevel: 'full',      // 'off' | 'light' | 'full' — spoken coaching during sets
    quotesOn: true,        // motivational lines during longer rests
    voiceURI: '',          // '' = browser default
    voiceRate: 1
  };

  /* ------------------------------------------------------------------ */
  /* Week scaling                                                        */
  /* ------------------------------------------------------------------ */
  function prescription(exId, week, dayIdx, posInMain, settings) {
    const ex = EX[exId];
    const st = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    const tier = PHASES[week - 1].tier;
    const isStrength = ['push', 'legs', 'hinge', 'pull'].includes(ex.group);
    let sets = ex.sets + (isStrength && ex.sets >= 2 ? st.extraSets : 0), target = ex.lo, hint = '';
    if (tier === 'build' || tier === 'progress' || tier === 'consolidate') target = ex.hi;
    if (tier === 'progress' && isStrength && posInMain === 0 && ex.harder) hint = ex.harder;
    if (tier === 'consolidate' && isStrength && (posInMain === 0 || posInMain === 1)) sets += 1;
    if (tier === 'deload') { sets = Math.max(1, Math.ceil(sets / 2)); target = ex.lo; }
    const burnout = !!st.burnoutOn && isStrength && ex.kind === 'reps';
    const unit = ex.kind === 'hold' ? 'sec' : ex.kind === 'cardio' || ex.kind === 'mobility' ? 'min' : 'reps';
    const range = ex.lo === ex.hi ? String(ex.lo) : `${ex.lo}–${ex.hi}`;
    const side = ex.perSide ? '/side' : '';
    const label = unit === 'min' ? `${range} min` : `${sets} × ${range}${unit === 'sec' ? ' sec' : ''}${side}`;
    return { sets, target, unit, label, hint, perSide: !!ex.perSide, kind: ex.kind, burnout, burnoutSeconds: st.burnoutSeconds };
  }

  function dayPlan(dayIdx, week, settings) {
    const p = PROGRAM[dayIdx];
    const mk = (section) => p[section].map((id, i) => {
      const pr = prescription(id, week, dayIdx, section === 'm' ? i : -1, settings);
      return Object.assign({ id, section, name: EX[id].name, cue: EX[id].cue, how: EX[id].how || '', group: EX[id].group, lo: EX[id].lo, hi: EX[id].hi, logKey: `${week}-${dayIdx}-${id}` }, pr);
    });
    const light = p.k !== 'Strength';
    const st = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    return { dayIdx, week, d: p.d, n: p.n, k: p.k, f: p.f, light, items: [...mk('m'), ...mk('c')], mainCount: p.m.length,
      warmupSeconds: light ? Math.round(st.warmupSeconds / 2) : st.warmupSeconds, cooldownSeconds: light ? Math.round(st.cooldownSeconds / 2) : st.cooldownSeconds };
  }

  /* Honest time estimate (minutes). */
  function estimateMinutes(plan, settings) {
    const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    let work = 0, rest = 0;
    plan.items.forEach((it, idx) => {
      const sides = it.perSide ? 2 : 1;
      let per = it.kind === 'reps' ? it.target * 2 * sides + 6 : it.kind === 'hold' ? it.target * sides + 8 : it.target * 60;
      work += per * it.sets;
      if (it.burnout) work += it.burnoutSeconds - per + 10; // the last set is timed, not counted
      for (let k = 1; k <= it.sets; k++) {
        const last = idx === plan.items.length - 1 && k === it.sets;
        if (last) continue;
        const between = k === it.sets;
        rest += restFor(it, between, plan.light, s);
      }
    });
    const warm = plan.warmupSeconds != null ? plan.warmupSeconds : (plan.light ? 120 : 240), cool = plan.cooldownSeconds != null ? plan.cooldownSeconds : (plan.light ? 60 : 120);
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
    plan.items.forEach((it, ei) => { for (let s = 1; s <= it.sets; s++) q.push({ item: it, ei, setNo: s, lastOfExercise: s === it.sets, burnout: !!it.burnout && s === it.sets }); });
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
    if (x.burnout === true) { out.burnout = true; const sec = Number(x.secs); if (Number.isFinite(sec) && sec > 0 && sec <= 600) out.secs = Math.round(sec); }
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
    num('extraSets', 0, 3); num('burnoutSeconds', 15, 120); num('warmupSeconds', 0, 900); num('cooldownSeconds', 0, 900);
    ['soundOn', 'voiceOn', 'hapticsOn', 'countdownOn', 'keepAwake', 'burnoutOn', 'quotesOn'].forEach(k => { if (typeof src[k] === 'boolean') s[k] = src[k]; });
    if (['off', 'light', 'full'].includes(src.cueLevel)) s.cueLevel = src.cueLevel;
    if (typeof src.voiceURI === 'string' && src.voiceURI.length <= 200) s.voiceURI = src.voiceURI;
    const vr = Number(src.voiceRate); if (Number.isFinite(vr) && vr >= 0.7 && vr <= 1.3) s.voiceRate = Math.round(vr * 100) / 100;
    if (legacy) {
      const r = Number(legacy.restSeconds); if (Number.isFinite(r) && r >= 0 && r <= 600) { s.restWithin = r; s.restBetween = Math.max(r, Math.min(600, r + 30)); }
      if (typeof legacy.soundOn === 'boolean') { s.soundOn = legacy.soundOn; s.voiceOn = legacy.soundOn; }
    }
    if (s.warnMinutes >= s.capMinutes) s.warnMinutes = Math.max(1, s.capMinutes - 5);
    return s;
  }

  function emptyState() {
    return { schemaVersion: SCHEMA_VERSION, week: 1, day: 0, done: {}, prs: {}, sets: {}, settings: Object.assign({}, DEFAULT_SETTINGS), session: null, history: [], quoteIdx: 0 };
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
    st.quoteIdx = clamp(Math.round(Number(raw.quoteIdx)) || 0, 0, 9999);
    return { state: st, notes, from: isV2 ? 'v2' : 'v1' };
  }

  function cleanSession(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const n = (k) => { const v = Number(raw[k]); return Number.isFinite(v) && v >= 0 ? v : 0; };
    if (!/^[1-8]-[0-6]$/.test(String(raw.key)) || !n('startedAt')) return null;
    const skipped = {};
    if (raw.skipped && typeof raw.skipped === 'object') for (const k of Object.keys(raw.skipped)) if (V2_KEY.test(k)) { const v = Number(raw.skipped[k]); if (Number.isFinite(v) && v > 0 && v < 20) skipped[k] = Math.round(v); }
    return { key: raw.key, startedAt: n('startedAt'), pausedAt: n('pausedAt') || 0, pausedTotal: n('pausedTotal'), restUntil: n('restUntil') || 0, restTotal: n('restTotal') || 0, restKind: raw.restKind === 'between' ? 'between' : 'within', skipped, warned: !!raw.warned, capped: !!raw.capped,
      warmUntil: n('warmUntil') || 0, warmTotal: n('warmTotal') || 0, warmDone: !!raw.warmDone, coolUntil: n('coolUntil') || 0, coolTotal: n('coolTotal') || 0, coolDone: !!raw.coolDone, burnUntil: n('burnUntil') || 0, burnTotal: n('burnTotal') || 0, burnReady: !!raw.burnReady };
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

  /* Warm-up / cool-down scripts: evenly spaced over the timer. */
  const WARMUP_STEPS = ['March in place, swing the arms', 'Arm circles, both directions', 'Easy bodyweight squats, half depth', 'Hip circles and leg swings', 'Five easy push-ups and a cat-cow'];
  const WARMUP_STEPS_LIGHT = ['Easy marching, loosen the shoulders', 'Hip circles and gentle twists'];
  const COOLDOWN_STEPS = ['Easy walking, let the breathing settle', 'Slow breathing: in through the nose, long exhale', 'Light stretch: chest, hip flexors, calves'];
  function scriptStep(steps, total, left) {
    if (!total || !steps.length) return { index: 0, text: steps[0] || '' };
    const elapsed = Math.max(0, total - left);
    const index = Math.min(steps.length - 1, Math.floor(elapsed / (total / steps.length)));
    return { index, text: steps[index] };
  }
  /* Motivational lines supplied by the user; spoken without attribution. */
  const QUOTES = [
    "When I feel tired, I just think about how great I will feel once I finally reach my goal.",
    "You have to think about it before you can do it. The mind is what makes it all possible.",
    "The only bad workout is the one that didn't happen.",
    "Don't be afraid of failure. This is the way to succeed.",
    "You should never stay at the same level. Always push yourself to the next.",
    "You did not wake up today to be mediocre.",
    "Action is the foundational key to all success.",
    "If it doesn't challenge you, it doesn't change you.",
    "You can either suffer the pain of discipline or the pain of regret.",
    "We can push ourselves further. We always have more to give.",
    "If you want to be the best, you have to do things other people aren't willing to do.",
    "Every champion was once a contender who refused to give up.",
    "The difference between try and triumph is a little 'umph'.",
    "If you are not pissed off for greatness, that just means you're okay with being mediocre.",
    "Keep working even when no one is watching.",
    "Your health account, your bank account, they're the same thing. The more you put in, the more you can take out. Exercise is king and nutrition is queen. Together you have a kingdom.",
    "Don't dream of winning. Train for it!",
    "Most people give you right before the big break comes, don't let that person be you.",
    "Discipline is the bridge between goals and accomplishment.",
    "Fitness is not about being better than someone else. It's about being better than you used to be.",
    "Exercise should be regarded as a tribute to the heart.",
    "Keep listening to your body. It will tell you when something is not okay.",
    "Whether you think you can, or you think you can't. you are right.",
    "All our dreams can come true if we have the courage to pursue them.",
    "Great things come from hard work and perseverance. No excuses.",
    "Always make a total effort, even when the odds are against you.",
    "Success is walking from failure to failure with no loss of enthusiasm.",
    "Your mind will quit a thousand times before your body will.",
    "I've grown most not from victories, but setbacks. If winning is God's reward, then losing is how he teaches us.",
    "Set your goals high, and don't stop until you get there.",
    "Physical fitness can neither be achieved by wishful thinking nor outright purchase.",
    "If you take time to realize what your dream is and what you really want in life — no matter what it is, whether it's sports or in other fields — you have to realize that there is always work to do, and you want to be the hardest working person in whatever you do, and you put yourself in a position to be successful. And you have to have a passion about what you do.",
    "You shall gain, but you shall pay with sweat, blood, and vomit.",
    "You have to push past your perceived limits, push past that point you thought was as far as you can go.",
    "Get ready, be prepared. So when opportunities finally show themselves, you'll be able to own them.",
    "You dream. You plan. You reach. There will be obstacles. There will be doubters. There will be mistakes. But with hard work, with belief, with confidence and trust in yourself and those around you, there are no limits.",
    "Be Humble. Be Hungry. And always be the hardest worker in the room.",
    "Some people want it to happen, some wish it would happen, others make it happen.",
    "A year from now you may wish you had started today.",
    "A goal is just an awesome way to force growth on yourself.",
    "If you do not believe in yourself, no one will do it for you.",
    "Our bodies are gardens, our wills are our gardeners.",
    "Get comfortable with being uncomfortable!",
    "Time, Effort, Sacrifice, and Sweat. How will you pay for your goals?",
    "He who is not courageous enough to take risks, will accomplish nothing in life.",
    "It's supposed to be hard. If it wasn't hard, everyone would do it.  The hard is what makes it great.",
    "The purpose of training is to tighten up the slack, toughen the body, and polish the spirit.",
    "Put all excuses aside and remember this: You are capable.",
    "The groundwork for all happiness is good health.",
    "Success usually comes to those who are too busy to be looking for it.",
    "The only place where success comes before work is in the dictionary.",
    "The clock is ticking. Are you becoming the person you want to be?",
    "The successful warrior is the average man, with laser-like focus.",
    "Pain is temporary. Quitting lasts forever.",
    "Physical fitness is not only one of the most important keys to a healthy body, it is the basis of dynamic and creative intellectual activity.",
    "No matter how many mistakes you make or how slow you progress, you are still way ahead of everyone who isn't trying.",
    "Making excuses burns zero calories per hour.",
    "The only person you are destined to become is the person you decide to be.",
    "Great works are performed, not by strength, but by perseverance.",
    "I hated every minute of training, but I said, don't quit. Suffer now and live the rest of your life as a champion.",
    "We are what we repeatedly do. Excellence then is not an act but a habit.",
    "The body achieves what the mind believes.",
    "The hard days are the best because that's when champions are made, so if you push through, you can push through anything.",
    "If you don't find the time, if you don't do the work, you don't get the results.",
    "Dead last finish is greater than did not finish, which trumps did not start.",
    "Push harder than yesterday if you want a different tomorrow.",
    "The real workout starts when you want to stop.",
    "Take care of your body. It's the only place you have to live.",
    "I've failed over and over again in my life and that is why I succeed.",
    "Once you are exercising regularly, the hardest thing is to stop it.",
    "The secret of getting ahead is getting started.",
    "Exercise should be regarded as tribute to the heart.",
    "You're going to have to let it hurt. Let it suck. The harder you work, the better you will look. Your appearance isn't parallel to how heavy you lift, it's parallel to how hard you work.",
    "Most people fail, not because of lack of desire, but, because of lack of commitment.",
    "You miss one hundred percent of the shots you don't take.",
    "If something stands between you and your success, move it. Never be denied.",
    "All progress takes place outside the comfort zone.",
    "Just believe in yourself. Even if you don't, just pretend that you do and at some point, you will.",
    "The harder you work and the more prepared you are for something, you're going to be able to persevere through anything.",
    "Enduring means accepting. Accepting things as they are and not as you would wish them to be, and then looking ahead, not behind.",
    "If you want something you've never had, you must be willing to do something you've never done.",
    "The resistance that you fight physically in the gym and the resistance that you fight in life can only build a strong character.",
    "Continuous improvement is better than delayed perfection.",
    "Once you learn to quit, it becomes a habit.",
    "It's hard to beat a person who never gives up.",
    "Do something today that your future self will thank you for.",
    "Success is usually the culmination of controlling failure.",
    "Think of your workouts as important meetings you schedule with yourself. Bosses don't cancel.",
    "Workout till you feel that pain and soreness in muscles. This one is good pain. No pain, no gain.",
    "Confidence comes from discipline and training.",
    "I don't count my sit-ups. I only start counting when it starts hurting because they're the only ones that count.",
    "What hurts today makes you stronger tomorrow.",
    "Strength does not come from physical capacity. It comes from an indomitable will.",
    "You must expect things of yourself before you can do them.",
    "The last three or four reps is what makes the muscle grow. This area of pain divides a champion from someone who is not a champion.",
    "If you fail to prepare, you're prepared to fail.",
    "Motivation is what gets you started. Habit is what keeps you going.",
    "A champion is someone who gets up when they can't.",
    "The difference between the impossible and the possible lies in a person's determination.",
    "When you have a clear vision of your goal, it's easier to take the first step toward it."
  ];
  const COACH_LINES = ['Keep breathing. Smooth reps.', 'Stop two reps before failure.', 'Brace the stomach, body in one line.', 'Control the way down.', 'Full range, no bouncing.', 'Good. Steady pace.'];

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
    WARMUP_STEPS, WARMUP_STEPS_LIGHT, COOLDOWN_STEPS, COACH_LINES, QUOTES, scriptStep,
    secondsLeft, fmt, elapsedMs, clamp
  };
});
