/* Calisthenics Lab v3.0 — core logic (no DOM).
   Loaded by index.html in the browser and by tests/unit.test.js in Node.
   Everything here is pure: program data, week scaling, log-derived queue,
   v1 → v2 migration, import validation, time estimation, timer math. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CL = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SCHEMA_VERSION = 3;  // v3: adds program overrides + todaySwaps (additive; v2 files load unchanged)
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
    'comfortable-walking': { name: 'Comfortable walking', kind: 'cardio', group: 'cardio', sets: 1, lo: 15, hi: 20, cue: 'Relaxed. This is recovery.', how: "An easy, relaxed walk at whatever pace feels pleasant. This is recovery, not training." },

    /* ---- v3 library additions (all bodyweight; a wall, couch, step or doorframe at most) ---- */
    // push
    'wall-push-ups':        { name: 'Wall push-ups', kind: 'reps', group: 'push', level: 1, sets: 2, lo: 12, hi: 15, cue: 'Hands on the wall at chest height, body straight, lean in and press away.', harder: 'Walk the feet further from the wall.', how: "Stand an arm's length from a wall, hands flat on it at chest height and shoulder-width apart. Keep the body in one straight line and bend the elbows to bring the chest toward the wall, then press back. Feet further back makes it harder. Mistake: bending at the hips — move as one plank." },
    'incline-push-ups':     { name: 'Incline push-ups', kind: 'reps', group: 'push', level: 1, sets: 2, lo: 10, hi: 12, cue: 'Hands on a couch arm or counter. The higher the hands, the easier.', harder: 'Move to a lower surface.', how: "Hands on the edge of a couch, bed frame or kitchen counter, feet back so the body is one straight line. Lower the chest to the edge and press up. Progress from counter, to couch, to the floor. Mistake: hips sagging — brace the stomach." },
    'knee-push-ups':        { name: 'Knee push-ups', kind: 'reps', group: 'push', level: 1, sets: 2, lo: 10, hi: 12, cue: 'Knees down, hips forward in line with the shoulders — not sitting back.', harder: 'Do the lowering phase from the toes, then drop to the knees to press up.', how: "Kneel, hands under the shoulders, ankles crossed, and bring the hips forward so there is one straight line from the knees to the head. Lower the chest to the floor and press up. Mistake: hips piked back toward the heels — that takes the work out of the chest." },
    'archer-push-ups':      { name: 'Archer push-ups', kind: 'reps', group: 'push', level: 3, sets: 2, lo: 4, hi: 6, perSide: true, cue: 'Very wide hands; lower toward one hand while the other arm straightens.', harder: 'Narrow the bent-arm side until it is nearly a one-arm push-up.', how: "Take a very wide hand position. Lower the chest toward the right hand, bending that arm, while the left arm stays nearly straight and slides out to the side. Press back to centre, then lower to the other side. Mistake: twisting the hips — keep them square and move side to side, not in a circle." },
    'hindu-push-ups':       { name: 'Hindu push-ups', kind: 'reps', group: 'push', level: 3, sets: 2, lo: 6, hi: 8, cue: 'Dive from a downward dog, sweep the chest low, finish with chest up. Push back.', how: "Start in a downward-dog position with the hips high. Dive forward, sweeping the chest just above the floor in a scooping arc, and finish with the arms straight and the chest up. Push the hips back up to the start. Mistake: rushing the dive — move slowly and keep the elbows close to the body." },
    'plank-up-downs':       { name: 'Plank up-downs', kind: 'reps', group: 'push', level: 2, sets: 2, lo: 6, hi: 8, perSide: true, cue: 'Forearm plank to push-up position one hand at a time, then back down. Alternate the lead arm.', how: "Start in a forearm plank. Place the right hand where the right elbow was and press up, then the left, so you are in a push-up position. Lower back to the forearms one arm at a time. Alternate which arm leads. Mistake: hips swinging side to side — widen the feet and brace." },
    'pseudo-planche-lean':  { name: 'Pseudo-planche lean', kind: 'hold', group: 'push', level: 3, sets: 2, lo: 15, hi: 20, cue: 'Push-up position, fingers turned out; lean the shoulders well past the hands and hold.', harder: 'Lean further, or lift one foot.', how: "In a push-up position with the fingers turned out slightly, lean forward so the shoulders travel well past the hands while the arms stay straight and the body stays rigid. Hold. Mistake: the hips piking or sagging — keep the plank line." },
    'scapular-push-ups':    { name: 'Scapular push-ups', kind: 'reps', group: 'pull', level: 1, sets: 2, lo: 10, hi: 12, cue: 'Arms locked straight; only the shoulder blades move — squeeze together, then push the floor away.', how: "Hold a push-up position with the arms locked straight. Without bending the elbows, let the chest sink as the shoulder blades squeeze together, then push the floor away so the upper back rounds slightly. Small movement, full control. Mistake: bending the elbows — this is not a push-up." },
    // legs
    'sumo-squats':          { name: 'Sumo squats', kind: 'reps', group: 'legs', level: 1, sets: 2, lo: 15, hi: 15, cue: 'Wide stance, toes out, knees track over the toes.', harder: 'Pause 2 seconds at the bottom.', how: "Stand with the feet wider than the shoulders and toes turned out about 30 degrees. Sit straight down between the heels with the chest up, then drive back up. Mistake: knees collapsing inward — push them out over the toes the whole way." },
    'jump-squats':          { name: 'Jump squats', kind: 'reps', group: 'legs', level: 3, sets: 2, lo: 8, hi: 10, cue: 'Land softly, knees bent, then sink straight into the next rep.', how: "Squat to about parallel, then jump straight up, swinging the arms. Land quietly on the balls of the feet, bend the knees to absorb, and go straight into the next squat. Mistake: landing with straight legs — soft, quiet landings every time." },
    'wall-sit':             { name: 'Wall sit', kind: 'hold', group: 'legs', level: 1, sets: 2, lo: 30, hi: 45, cue: 'Back flat on the wall, thighs parallel, weight in the heels.', harder: 'Lift one foot an inch for a few seconds at a time.', how: "Lean your back against a wall and slide down until the thighs are parallel to the floor and the knees are over the ankles. Hold, breathing normally, with the hands off the thighs. Mistake: knees forward of the toes — walk the feet out." },
    'forward-lunges':       { name: 'Forward lunges', kind: 'reps', group: 'legs', level: 2, sets: 2, lo: 8, hi: 8, perSide: true, cue: 'Step forward, lower straight down, push back to standing.', how: "Stand tall and take a long step forward. Lower until both knees are at about 90 degrees with the back knee just above the floor, then push off the front foot to return to standing. Mistake: the front knee drifting inward — point it at the second toe." },
    'walking-lunges':       { name: 'Walking lunges', kind: 'reps', group: 'legs', level: 2, sets: 2, lo: 8, hi: 8, perSide: true, cue: 'Long steps, torso upright, step the back leg through into the next lunge.', how: "Step forward into a lunge, then push through the front foot to bring the back leg through into the next lunge, travelling across the room. Keep the torso upright. Mistake: short, choppy steps — long steps keep the front shin vertical." },
    'curtsy-lunges':        { name: 'Curtsy lunges', kind: 'reps', group: 'legs', level: 2, sets: 2, lo: 8, hi: 8, perSide: true, cue: 'Step one foot back and across behind the other, like a curtsy; front knee over the toes.', how: "Stand tall, step the right foot back and across behind the left leg, and bend both knees to lower. Push through the left heel to stand, then switch sides. Mistake: the front knee caving in — keep it over the toes." },
    'bulgarian-split-squats': { name: 'Bulgarian split squats', kind: 'reps', group: 'legs', level: 3, sets: 2, lo: 6, hi: 8, perSide: true, cue: 'Rear foot on the couch, front shin vertical, lower straight down.', harder: 'Pause 2 seconds at the bottom.', how: "Stand a long step in front of a couch or bed and rest the top of the rear foot on it. Lower straight down until the front thigh is parallel to the floor, then drive up through the front heel. Mistake: standing too close — if the front knee shoots forward, hop the foot further out." },
    'cossack-squats':       { name: 'Cossack squats', kind: 'reps', group: 'legs', level: 3, sets: 2, lo: 5, hi: 6, perSide: true, cue: 'Very wide stance; sit all the way to one side, other leg straight, toes up.', how: "Take a very wide stance. Shift the weight to the right and sit down over the right foot as deep as you can while the left leg stays straight with the toes pointing up. Push back to centre and switch sides. Mistake: the heel lifting on the working side — only go as low as the heel stays down." },
    'assisted-pistol-squats': { name: 'Assisted pistol squats', kind: 'reps', group: 'legs', level: 3, sets: 2, lo: 4, hi: 6, perSide: true, cue: 'Hold a doorframe lightly; lower on one leg with the free leg out in front.', harder: 'Use one hand only.', how: "Hold a doorframe or sturdy post lightly with both hands. Lift one foot off the floor and squat as low as you can on the other leg, using the hands only as much as you need, then stand back up. Mistake: pulling yourself up with the arms — the leg does the work, the hands just balance." },
    'calf-raises':          { name: 'Calf raises', kind: 'reps', group: 'legs', level: 1, sets: 2, lo: 15, hi: 20, cue: 'Rise onto the balls of the feet, pause at the top, lower slowly.', harder: 'Do them off the edge of a step.', how: "Stand tall with the fingertips on a wall for balance. Rise as high as you can onto the balls of the feet, pause a second at the top, then lower over two seconds. Off the edge of a step gives a bigger stretch. Mistake: bouncing — control the way down." },
    'single-leg-calf-raises': { name: 'Single-leg calf raises', kind: 'reps', group: 'legs', level: 2, sets: 2, lo: 10, hi: 12, perSide: true, cue: 'One foot, fingertips on the wall, full height, slow down.', how: "Stand on one foot with the fingertips on a wall. Rise as high as possible onto the ball of the foot, pause, and lower slowly. All reps on one side, then switch. Mistake: rolling onto the outside of the foot — push through the big toe." },
    'skater-hops':          { name: 'Skater hops', kind: 'reps', group: 'legs', level: 2, sets: 2, lo: 8, hi: 8, perSide: true, cue: 'Bound sideways from one foot to the other; land soft and hold a beat.', how: "Push off the right foot to bound to the left, landing softly on the left foot with the knee bent and the right leg sweeping behind. Hold the balance for a beat, then bound back. Mistake: standing tall between hops — stay low like a speed skater." },
    // hinge
    'single-leg-glute-bridges': { name: 'Single-leg glute bridges', kind: 'reps', group: 'hinge', level: 3, sets: 2, lo: 8, hi: 10, perSide: true, cue: 'One foot flat, the other leg straight; drive the hips up without tilting.', how: "Lie on your back with one foot flat and the other leg held straight. Drive through the planted heel to lift the hips until the body is a straight line from shoulder to knee, squeeze, then lower slowly. Mistake: the hips tilting toward the lifted leg — slower, and brace." },
    'supermans':            { name: 'Supermans', kind: 'reps', group: 'hinge', level: 1, sets: 2, lo: 10, hi: 12, cue: 'Face down; lift chest and thighs together, hold a second, lower.', harder: 'Hold 3 seconds at the top.', how: "Lie face down with the arms overhead. Lift the arms, chest and both thighs a few inches off the floor at the same time, hold for a second, then lower slowly. Keep the eyes on the floor. Mistake: cranking the neck back — long neck, chin tucked." },
    'good-mornings':        { name: 'Good mornings', kind: 'reps', group: 'hinge', level: 1, sets: 2, lo: 12, hi: 12, cue: 'Hands behind the head; push the hips back with a flat back until the chest is near parallel.', how: "Stand with the feet hip-width, hands behind the head and knees soft. Push the hips straight back, keeping the back flat, until the chest is close to parallel with the floor, then squeeze the glutes to stand. Mistake: rounding the back or bending the knees a lot — this is a hinge, not a squat." },
    'frog-pumps':           { name: 'Frog pumps', kind: 'reps', group: 'hinge', level: 1, sets: 2, lo: 15, hi: 20, cue: 'Soles together, knees out; pump the hips up and squeeze hard.', how: "Lie on your back, put the soles of the feet together and let the knees fall out. Tuck the chin and drive the hips up, squeezing the glutes hard at the top, then lower. Quick rhythm, strong squeeze. Mistake: arching the lower back — ribs down." },
    'hip-thrusts':          { name: 'Hip thrusts', kind: 'reps', group: 'hinge', level: 2, sets: 2, lo: 12, hi: 15, cue: 'Shoulder blades on the couch edge, feet flat; drive the hips up to a flat table top.', harder: 'Single leg, or a 2-second squeeze at the top.', how: "Sit on the floor with the upper back against the edge of a couch, feet flat and knees bent. Drive through the heels to lift the hips until the thighs and torso make one flat line, chin tucked, squeeze, and lower. Mistake: over-arching at the top — stop when the glutes are fully squeezed." },
    'reverse-plank':        { name: 'Reverse plank', kind: 'hold', group: 'hinge', level: 2, sets: 2, lo: 20, hi: 30, cue: 'Sit, hands behind you, lift the hips so the body is one straight line face-up.', how: "Sit with the legs straight and the hands on the floor behind you, fingers pointing toward the feet. Press the hips up until the body is one straight line from heels to shoulders, chest open, and hold. Mistake: the hips sagging — squeeze the glutes." },
    // pull (no equipment)
    'prone-cobra-hold':     { name: 'Prone cobra hold', kind: 'hold', group: 'pull', level: 1, sets: 2, lo: 20, hi: 30, cue: 'Face down; chest slightly up, arms back with thumbs to the ceiling, squeeze the shoulder blades.', how: "Lie face down with the arms by the sides. Lift the chest slightly, reach the arms back and up with the thumbs pointing to the ceiling, squeeze the shoulder blades down and together, and hold. Eyes on the floor. Mistake: lifting high with the lower back — this is a shoulder-blade squeeze, not a back bend." },
    'prone-lat-pulls':      { name: 'Prone lat pulls', kind: 'reps', group: 'pull', level: 2, sets: 2, lo: 10, hi: 12, cue: 'Face down, arms overhead; pull the elbows down to the ribs as if pulling a bar, then reach back out.', how: "Lie face down with the arms stretched overhead and the chest slightly lifted. Pull the elbows down and back toward the ribs as if pulling a bar to the chest, squeezing the shoulder blades, then reach the arms back overhead. Keep the chest just off the floor for the whole set. Mistake: dropping the chest between reps." },
    'wall-slides':          { name: 'Wall slides', kind: 'reps', group: 'pull', level: 1, sets: 2, lo: 10, hi: 10, cue: 'Back and arms on the wall in a goalpost; slide up and down keeping contact.', how: "Stand with the back, head and arms against a wall in a goalpost position. Slide the arms up overhead and back down while keeping the wrists and elbows touching the wall as much as you can. Mistake: the ribs flaring forward — keep the lower back close to the wall." },
    // core
    'plank':                { name: 'Plank', kind: 'hold', group: 'core', level: 1, sets: 2, lo: 30, hi: 45, cue: 'Elbows under shoulders, one straight line, squeeze the glutes, breathe.', harder: 'Lift one foot an inch, alternating.', how: "Forearms on the floor, elbows under the shoulders, feet together. Lift into one straight line from head to heels, squeeze the glutes and brace the stomach. Breathe. Mistake: hips sagging or piking — if the line breaks, stop the set." },
    'plank-shoulder-taps':  { name: 'Plank shoulder taps', kind: 'reps', group: 'core', level: 2, sets: 2, lo: 10, hi: 10, perSide: true, cue: 'Push-up position, feet wide; tap the opposite shoulder without the hips rocking.', how: "In a push-up position with the feet wide, lift one hand and tap the opposite shoulder, replace it, then the other hand. Mistake: hips rocking side to side — slower, wider feet." },
    'mountain-climbers':    { name: 'Mountain climbers', kind: 'reps', group: 'core', level: 2, sets: 2, lo: 12, hi: 12, perSide: true, cue: 'Shoulders over the hands, hips low, drive the knees in and switch.', how: "In a push-up position, drive one knee toward the chest, then switch legs quickly, keeping the hips low and the shoulders over the hands. Mistake: hips bouncing up — keep them level." },
    'bicycle-crunches':     { name: 'Bicycle crunches', kind: 'reps', group: 'core', level: 2, sets: 2, lo: 12, hi: 12, perSide: true, cue: 'Elbow to the opposite knee, slow pedalling, hands only support the head.', how: "Lie on your back, hands lightly behind the head, knees up. Bring the right elbow toward the left knee while the right leg extends, then switch sides in a slow pedalling motion. Mistake: pulling on the neck — the hands only support the head." },
    'flutter-kicks':        { name: 'Flutter kicks', kind: 'hold', group: 'core', level: 2, sets: 2, lo: 20, hi: 30, cue: 'Hands under the hips, legs just off the floor, small quick scissors, lower back pressed down.', how: "Lie on your back, hands under the hips, legs straight and lifted a few inches. Kick the legs up and down in small, quick scissors while the lower back stays pressed into the floor. Mistake: the lower back arching — raise the legs higher." },
    'straight-leg-raises':  { name: 'Straight-leg raises', kind: 'reps', group: 'core', level: 3, sets: 2, lo: 8, hi: 10, cue: 'Legs straight, lift to vertical, lower slowly, stop before the back arches.', how: "Lie on your back, hands under the hips, legs straight. Lift the legs to vertical, then lower them slowly toward the floor, stopping before the lower back lifts. Mistake: using momentum — three seconds down." },
    'v-ups':                { name: 'V-ups', kind: 'reps', group: 'core', level: 3, sets: 2, lo: 8, hi: 10, cue: 'Arms overhead; lift legs and torso together, reach for the feet, lower with control.', how: "Lie flat with the arms overhead. In one movement, lift the straight legs and the upper body so the hands reach toward the feet, making a V, then lower with control. Mistake: bending the knees to cheat — do a tuck-up instead if needed." },
    'sit-ups':              { name: 'Sit-ups', kind: 'reps', group: 'core', level: 1, sets: 2, lo: 12, hi: 15, cue: 'Knees bent, arms crossed on the chest, curl all the way up, lower slowly.', how: "Lie on your back, knees bent, feet flat, arms crossed on the chest. Curl all the way up to sitting and lower slowly. Hook the feet under the couch if needed. Mistake: yanking the head forward — lead with the chest." },
    'crunches':             { name: 'Crunches', kind: 'reps', group: 'core', level: 1, sets: 2, lo: 15, hi: 15, cue: 'Short range: shoulder blades off the floor, pause, lower.', how: "Lie on your back, knees bent, fingertips at the temples. Curl the shoulder blades off the floor, pause, and lower. Short range, slow. Mistake: pulling the head — lead with the chest." },
    'russian-twists':       { name: 'Russian twists', kind: 'reps', group: 'core', level: 2, sets: 2, lo: 12, hi: 12, perSide: true, cue: 'Lean back to 45°, rotate the shoulders to tap beside each hip.', harder: 'Lift the heels off the floor.', how: "Sit with the knees bent and heels on the floor, lean back to about 45 degrees, hands together. Rotate the torso to tap the hands beside one hip, then the other. Mistake: only the arms moving — turn the shoulders." },
    'hollow-rocks':         { name: 'Hollow rocks', kind: 'reps', group: 'core', level: 3, sets: 2, lo: 10, hi: 12, cue: 'Hold the hollow shape and rock like a rocking chair without changing it.', how: "From a hollow hold — lower back pressed down, arms and legs long — rock gently back and forth like a rocking chair without changing the shape. Mistake: the lower back arching when you rock forward — tighten the shape or bend the knees." },
    'side-plank-dips':      { name: 'Side plank dips', kind: 'reps', group: 'core', level: 2, sets: 2, lo: 10, hi: 10, perSide: true, cue: 'From a side plank, lower the hip almost to the floor and lift it back above the line.', how: "In a side plank, lower the hip toward the floor until it almost touches, then lift it back up above the start line. Mistake: rolling forward — keep the chest facing the wall in front of you." },
    'windshield-wipers':    { name: 'Windshield wipers', kind: 'reps', group: 'core', level: 3, sets: 2, lo: 8, hi: 8, perSide: true, cue: 'Arms out, knees bent over the hips; lower the knees side to side with both shoulders down.', how: "Lie on your back, arms out to the sides, knees bent and lifted over the hips. Lower the knees to one side toward the floor, keeping both shoulders down, then sweep them to the other side. Mistake: a shoulder lifting — shorten the range." },
    'heel-touches':         { name: 'Heel touches', kind: 'reps', group: 'core', level: 1, sets: 2, lo: 12, hi: 12, perSide: true, cue: 'Shoulders slightly lifted; reach side to side for each heel.', how: "Lie on your back, knees bent, feet flat, shoulders slightly lifted. Reach the right hand to the right heel, then the left to the left, bending sideways. Mistake: the shoulders dropping to the floor between reps." },
    'bear-crawl':           { name: 'Bear crawl', kind: 'reps', group: 'core', level: 2, sets: 2, lo: 10, hi: 10, perSide: true, cue: 'Hands and feet, knees an inch off the floor, opposite hand and foot step together.', how: "On hands and feet with the knees an inch off the floor, crawl forward by moving the right hand and left foot together, then the left hand and right foot. Keep the back flat enough to balance a cup of water on it. Mistake: the hips swaying up — small steps, knees low." },
    // cardio
    'jumping-jacks':        { name: 'Jumping jacks', kind: 'hold', group: 'cardio', level: 1, sets: 2, lo: 30, hi: 45, cue: 'Soft knees, steady rhythm, stay on the balls of the feet.', how: "Jump the feet wide while the arms swing overhead, then jump them back together as the arms come down. Soft knees, steady rhythm. Mistake: landing flat-footed — stay on the balls of the feet." },
    'high-knees':           { name: 'High knees', kind: 'hold', group: 'cardio', level: 2, sets: 2, lo: 20, hi: 30, cue: 'Run on the spot, knees to hip height, pump the arms, stay tall.', how: "Run on the spot, driving the knees up to hip height and pumping the arms. Land lightly on the balls of the feet. Mistake: leaning back — stay tall." },
    'burpees':              { name: 'Burpees', kind: 'reps', group: 'cardio', level: 3, sets: 2, lo: 6, hi: 8, cue: 'Squat, hands down, jump back, jump in, stand or jump up. Brace before the feet go back.', harder: 'Add a push-up at the bottom.', how: "From standing, squat down and put the hands on the floor, jump the feet back to a push-up position, jump them back in, and stand or jump up. Mistake: letting the back sag when the feet jump back — brace first." },
    'squat-thrusts':        { name: 'Squat thrusts', kind: 'reps', group: 'cardio', level: 2, sets: 2, lo: 8, hi: 10, cue: 'Hands down, feet back to a plank, feet in, stand. No jump.', how: "Squat down, put the hands on the floor, step or hop the feet back to a plank, bring them back in and stand up tall. A burpee without the jump. Mistake: the hips sagging in the plank — brace." },
    'shadowboxing':         { name: 'Shadowboxing', kind: 'cardio', group: 'cardio', level: 1, sets: 1, lo: 10, hi: 12, cue: 'Boxing stance, light relaxed punches, keep the feet moving. Easy effort.', how: "Stand in a boxing stance and throw light, relaxed punches at the air — jabs, crosses, hooks — while moving the feet, for the time shown at an easy effort of about five out of ten." },
    'stair-climbing':       { name: 'Stair climbing', kind: 'cardio', group: 'cardio', level: 2, sets: 1, lo: 10, hi: 12, cue: 'Steady pace up and down a flight of stairs, hand near the rail.', how: "Walk up and down a flight of stairs at a steady pace with a hand near the rail. Whole foot on each step going up, controlled coming down." },
    'march-in-place':       { name: 'Marching in place', kind: 'cardio', group: 'cardio', level: 1, sets: 1, lo: 8, hi: 10, cue: 'Tall posture, knees up, arms swinging. Easy and steady.', how: "March on the spot, lifting the knees to about hip height and swinging the arms, at an easy steady pace for the time shown. A good swap for walking when you cannot get outside." },
    // mobility
    'worlds-greatest-stretch': { name: "World's greatest stretch", kind: 'reps', group: 'mobility', level: 1, sets: 1, lo: 5, hi: 5, perSide: true, cue: 'Long lunge, hands inside the foot; elbow to instep, then rotate and reach up.', how: "Step the right foot forward into a long lunge and put both hands on the floor inside the foot. Drop the right elbow toward the instep, then rotate and reach the right hand to the ceiling, following it with the eyes. Return and repeat, then switch sides. Move slowly." },
    'thoracic-rotations':   { name: 'Thoracic rotations', kind: 'reps', group: 'mobility', level: 1, sets: 1, lo: 8, hi: 8, perSide: true, cue: 'On all fours, hand behind the head; elbow to the opposite wrist, then open to the ceiling.', how: "On hands and knees, put the right hand behind the head. Rotate the right elbow down toward the left wrist, then open it up toward the ceiling as far as the upper back allows, following with the eyes. The hips stay still." },
    'down-dog-to-cobra':    { name: 'Down dog to cobra', kind: 'reps', group: 'mobility', level: 1, sets: 1, lo: 6, hi: 6, cue: 'Hips up and back, heels down; then lower through to a gentle cobra. Flow with the breath.', how: "From a push-up position, push the hips up and back into an upside-down V, pressing the heels toward the floor. Then lower the hips through, straighten the arms and lift the chest into a gentle cobra. Flow slowly between the two with the breath." },
    'deep-squat-hold':      { name: 'Deep squat hold', kind: 'hold', group: 'mobility', level: 1, sets: 1, lo: 45, hi: 60, cue: 'Heels down, elbows pressing the knees out, chest up. Rock gently and breathe.', how: "Sink into the deepest squat you can with the heels down, elbows gently pressing the knees out, chest up. Hold and breathe, rocking gently. Hold a doorframe if the heels lift." },
    'hip-flexor-stretch':   { name: 'Hip flexor stretch', kind: 'hold', group: 'mobility', level: 1, sets: 1, lo: 30, hi: 30, perSide: true, cue: 'Half-kneeling; tuck the tailbone, squeeze the back glute, shift gently forward.', how: "Kneel on one knee with the other foot forward. Tuck the tailbone, squeeze the glute of the kneeling side, and shift gently forward until you feel a stretch in the front of the hip. Chest up, no arching." },
    'pigeon-stretch':       { name: 'Pigeon stretch', kind: 'hold', group: 'mobility', level: 1, sets: 1, lo: 30, hi: 30, perSide: true, cue: 'Front shin across, back leg long; square the hips and breathe into it.', how: "From hands and knees, bring the right knee forward behind the right wrist with the shin angled across, and slide the left leg straight back. Square the hips, lower the chest as far as is comfortable, and breathe. Switch sides." },
    'arm-circles':          { name: 'Arm circles', kind: 'reps', group: 'mobility', level: 1, sets: 1, lo: 10, hi: 10, perSide: true, cue: 'Small to large circles, both directions, shoulders down.', how: "Arms out to the sides. Make small circles that grow larger over ten reps, then reverse direction. Keep the shoulders down away from the ears." },
    'child-pose-reach':     { name: "Child's pose reach", kind: 'hold', group: 'mobility', level: 1, sets: 1, lo: 30, hi: 30, cue: 'Hips to heels, arms long, breathe into the back. Walk the hands to each side for the lats.', how: "Kneel, sit the hips back toward the heels and reach the arms long on the floor in front of you. Breathe into the back for the time shown; walk the hands over to each side to stretch the lats." }
  };
  // Library metadata: difficulty level (1 easier · 2 standard · 3 harder) and equipment flag.
  const LEVELS = { 'wall-push-ups': 1, 'decline-push-ups': 3, 'pike-push-ups': 3, 'diamond-push-ups': 3, 'staggered-push-ups': 3, 'tempo-push-ups': 2, 'single-leg-rdl': 3, 'glute-bridge-march': 2, 'glute-bridges': 1, 'hollow-hold': 3, 'side-plank': 2, 'bird-dogs': 1, 'dead-bugs': 1, 'reverse-crunches': 2, 'bent-knee-leg-raises': 2, 'standing-knee-raises': 1, 'cobra-press-ups': 1, 'cat-cow': 1, 'hip-mobility': 1, 'reverse-snow-angels': 1, 'prone-w-raises': 1, 'prone-ytw-raises': 2, 'prone-swimmers': 2, 'bodyweight-squats': 1, 'pause-squats': 2, 'reverse-lunges': 2, 'split-squats': 2, 'lateral-lunges': 2, 'rows': 2 };
  Object.keys(EX).forEach(id => { if (EX[id].level == null) EX[id].level = LEVELS[id] || 2; });
  EX['rows'].equipment = true;
  const GROUPS = { push: 'Push', legs: 'Legs', hinge: 'Hinge & glutes', pull: 'Upper back', core: 'Core', cardio: 'Conditioning', mobility: 'Mobility' };
  const GROUP_ORDER = ['push', 'legs', 'hinge', 'pull', 'core', 'cardio', 'mobility'];
  const STRENGTH_GROUPS = ['push', 'legs', 'hinge', 'pull'];

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
    voiceURI: '',          // device voice for fallback / 'device' mode ('' = automatic)
    voiceRate: 1,
    coachVoice: 'recorded', // 'recorded' (bundled clips) | 'device' (speechSynthesis)
    audioMix: 'mix'        // 'mix' (music keeps playing) | 'duck' (music lowered while the coach talks) | 'solo' (coach pauses music, plays on silent)
  };

  /* ------------------------------------------------------------------ */
  /* Week scaling                                                        */
  /* ------------------------------------------------------------------ */
  function prescription(exId, week, dayIdx, posInMain, settings) {
    const ex = EX[exId];
    const st = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    const tier = PHASES[week - 1].tier;
    const isStrength = STRENGTH_GROUPS.includes(ex.group);
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

  /* dayDef (optional): { m: [ids], c: [ids] } — a customised day from resolveDay(). Defaults to PROGRAM[dayIdx]. */
  function dayPlan(dayIdx, week, settings, dayDef) {
    const p = PROGRAM[dayIdx];
    const def = dayDef && Array.isArray(dayDef.m) ? dayDef : p;
    const mk = (section) => (def[section] || []).filter(id => EX[id]).map((id, i) => {
      const pr = prescription(id, week, dayIdx, section === 'm' ? i : -1, settings);
      return Object.assign({ id, section, name: EX[id].name, cue: EX[id].cue, how: EX[id].how || '', group: EX[id].group, level: EX[id].level, lo: EX[id].lo, hi: EX[id].hi, logKey: `${week}-${dayIdx}-${id}` }, pr);
    });
    const light = p.k !== 'Strength';
    const st = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    const items = [...mk('m'), ...mk('c')];
    return { dayIdx, week, d: p.d, n: p.n, k: p.k, f: p.f, light, items, mainCount: items.filter(i => i.section === 'm').length,
      custom: !!(dayDef && dayDef.custom), temporary: !!(dayDef && dayDef.temporary),
      warmupSeconds: light ? Math.round(st.warmupSeconds / 2) : st.warmupSeconds, cooldownSeconds: light ? Math.round(st.cooldownSeconds / 2) : st.cooldownSeconds };
  }

  /* ------------------------------------------------------------------ */
  /* Editable programme (v3)                                             */
  /* state.program   = { [dayIdx]: { m: [...], c: [...] } }  permanent    */
  /* state.todaySwaps = { date, dayIdx, m: [...], c: [...] }  one day only */
  /* ------------------------------------------------------------------ */
  const MAX_MAIN = 8, MAX_CORE = 4;
  function localDate(d) { d = d || new Date(); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
  function defaultDay(dayIdx) { const p = PROGRAM[dayIdx]; return { m: p.m.slice(), c: p.c.slice() }; }
  function sameDef(a, b) { return a.m.join(',') === b.m.join(',') && a.c.join(',') === b.c.join(','); }
  /* The day definition in force: today-only swap (if dated today) > permanent custom > default. */
  function resolveDay(state, dayIdx, today) {
    today = today || localDate();
    const t = state.todaySwaps;
    if (t && t.dayIdx === dayIdx && t.date === today) return { m: t.m.slice(), c: t.c.slice(), custom: true, temporary: true };
    const c = state.program && state.program[dayIdx];
    if (c) return { m: c.m.slice(), c: c.c.slice(), custom: true, temporary: false };
    return Object.assign(defaultDay(dayIdx), { custom: false, temporary: false });
  }
  /* Pure edit on a day definition. op: {type:'swap'|'remove'|'add'|'move', section:'m'|'c', index, id, to} */
  function editDay(def, op) {
    const d = { m: def.m.slice(), c: def.c.slice() };
    const arr = d[op.section]; if (!arr) return { ok: false, error: 'Bad section', def: d };
    const max = op.section === 'm' ? MAX_MAIN : MAX_CORE;
    if (op.type === 'swap') {
      if (!EX[op.id] || op.index < 0 || op.index >= arr.length) return { ok: false, error: 'Bad swap', def: d };
      if (arr.includes(op.id) && arr[op.index] !== op.id) return { ok: false, error: `${EX[op.id].name} is already on this day`, def: d };
      arr[op.index] = op.id;
    } else if (op.type === 'remove') {
      if (op.index < 0 || op.index >= arr.length) return { ok: false, error: 'Bad index', def: d };
      if (op.section === 'm' && arr.length <= 1) return { ok: false, error: 'Keep at least one main exercise', def: d };
      arr.splice(op.index, 1);
    } else if (op.type === 'add') {
      if (!EX[op.id]) return { ok: false, error: 'Unknown exercise', def: d };
      if (arr.length >= max) return { ok: false, error: `Limit of ${max} in this section`, def: d };
      if (arr.includes(op.id)) return { ok: false, error: `${EX[op.id].name} is already on this day`, def: d };
      arr.push(op.id);
    } else if (op.type === 'move') {
      const to = op.to; if (op.index < 0 || op.index >= arr.length || to < 0 || to >= arr.length) return { ok: false, error: 'Bad move', def: d };
      const [x] = arr.splice(op.index, 1); arr.splice(to, 0, x);
    } else return { ok: false, error: 'Unknown op', def: d };
    return { ok: true, def: d };
  }
  /* Apply an edit to the state. scope: 'plan' (permanent) | 'today'. Returns {ok, error}. */
  function applyEdit(state, dayIdx, op, scope, today) {
    today = today || localDate();
    const cur = resolveDay(state, dayIdx, today);
    const r = editDay(cur, op); if (!r.ok) return r;
    if (scope === 'today') {
      state.todaySwaps = { date: today, dayIdx, m: r.def.m, c: r.def.c };
    } else {
      // Permanent: write to program; if a today-only override exists for this day, apply the same op to it too so the change is visible now.
      const base = (state.program && state.program[dayIdx]) ? { m: state.program[dayIdx].m.slice(), c: state.program[dayIdx].c.slice() } : defaultDay(dayIdx);
      const rb = cur.temporary ? editDay(base, op) : r;
      state.program = state.program || {};
      if (sameDef(rb.def, defaultDay(dayIdx))) delete state.program[dayIdx]; else state.program[dayIdx] = { m: rb.def.m, c: rb.def.c };
      if (cur.temporary) { if (rb.ok && sameDef(r.def, rb.def)) { delete state.todaySwaps; } else state.todaySwaps = { date: today, dayIdx, m: r.def.m, c: r.def.c }; }
    }
    return { ok: true };
  }
  function resetDay(state, dayIdx, scope) {
    if (scope === 'today') { if (state.todaySwaps && state.todaySwaps.dayIdx === dayIdx) delete state.todaySwaps; }
    else { if (state.program) delete state.program[dayIdx]; if (state.todaySwaps && state.todaySwaps.dayIdx === dayIdx) delete state.todaySwaps; }
  }
  /* Library listing for the picker: no-equipment exercises grouped and sorted by level, then name. */
  function library(opts) {
    opts = opts || {};
    const ids = Object.keys(EX).filter(id => !EX[id].equipment && (!opts.group || EX[id].group === opts.group) && (!opts.exclude || !opts.exclude.includes(id)));
    ids.sort((a, b) => GROUP_ORDER.indexOf(EX[a].group) - GROUP_ORDER.indexOf(EX[b].group) || EX[a].level - EX[b].level || EX[a].name.localeCompare(EX[b].name));
    return ids;
  }
  /* Sensible swaps for an exercise: same movement group, easier first when the exercise is hard. */
  function alternativesFor(exId, exclude) {
    const ex = EX[exId]; if (!ex) return [];
    return library({ group: ex.group, exclude: [exId].concat(exclude || []) });
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
    if (['recorded', 'device'].includes(src.coachVoice)) s.coachVoice = src.coachVoice;
    if (['mix', 'duck', 'solo'].includes(src.audioMix)) s.audioMix = src.audioMix;
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
    return { schemaVersion: SCHEMA_VERSION, week: 1, day: 0, done: {}, prs: {}, sets: {}, settings: Object.assign({}, DEFAULT_SETTINGS), session: null, history: [], quoteIdx: 0, program: {}, todaySwaps: null };
  }
  function cleanIdList(raw, max) {
    if (!Array.isArray(raw)) return null;
    const out = []; for (const id of raw) { if (typeof id === 'string' && EX[id] && !out.includes(id)) out.push(id); if (out.length >= max) break; }
    return out;
  }
  function cleanProgram(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (const k of Object.keys(raw)) {
      if (!/^[0-6]$/.test(k) || !raw[k] || typeof raw[k] !== 'object') continue;
      const m = cleanIdList(raw[k].m, MAX_MAIN), c = cleanIdList(raw[k].c, MAX_CORE) || [];
      if (!m || !m.length) continue;
      const def = { m, c }; if (!sameDef(def, defaultDay(+k))) out[+k] = def;
    }
    return out;
  }
  function cleanTodaySwaps(raw) {
    if (!raw || typeof raw !== 'object') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(raw.date))) return null;
    const dayIdx = Number(raw.dayIdx); if (!Number.isInteger(dayIdx) || dayIdx < 0 || dayIdx > 6) return null;
    const m = cleanIdList(raw.m, MAX_MAIN), c = cleanIdList(raw.c, MAX_CORE) || [];
    if (!m || !m.length) return null;
    return { date: raw.date, dayIdx, m, c };
  }

  /* Normalise any raw object (v1 storage, v1 backup, v2 storage, v2 backup) into a clean v2 state. */
  function normalize(raw) {
    const notes = [];
    const st = emptyState();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { state: st, notes: ['Empty or unrecognised data; starting fresh.'], from: 'empty' };
    const isV2 = Number(raw.schemaVersion) >= 2;
    st.week = clamp(Number(raw.week) || 1, 1, 8);
    st.day = clamp(Number(raw.day) || 0, 0, 6);
    st.done = cleanDone(raw.done);
    st.prs = cleanPrs(raw.prs);
    st.sets = cleanSets(raw.sets, notes);
    st.settings = cleanSettings(raw.settings, isV2 ? null : raw);
    st.session = cleanSession(raw.session);
    st.history = cleanHistory(raw.history);
    st.quoteIdx = clamp(Math.round(Number(raw.quoteIdx)) || 0, 0, 9999);
    st.program = cleanProgram(raw.program);
    st.todaySwaps = cleanTodaySwaps(raw.todaySwaps);
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
    out.program = out.program || {};
    for (const k of Object.keys(incoming.program || {})) if (!out.program[k]) out.program[k] = incoming.program[k];
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
  const COACH_LINES = ['Breathe. Smooth reps.', 'Two reps in the tank. Stop before failure.', 'Brace. One straight line.', 'Own the way down.', 'Full range. No bouncing.', 'Good. Steady pace.', 'Chin neutral, eyes on the floor.', 'Every rep counts. Make it clean.', 'Stay tight through the middle.', 'Quality over speed.', 'Drive. You have more than that.', 'Lock in. Finish the set strong.'];

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
    EX, PROGRAM, PHASES, LEGACY_PROGRAM, GROUPS, GROUP_ORDER, STRENGTH_GROUPS, MAX_MAIN, MAX_CORE,
    prescription, dayPlan, estimateMinutes, restFor, buildQueue, sessionPosition,
    localDate, defaultDay, resolveDay, editDay, applyEdit, resetDay, library, alternativesFor,
    normalize, merge, parseImport, emptyState, cleanSetEntry,
    WARMUP_STEPS, WARMUP_STEPS_LIGHT, COOLDOWN_STEPS, COACH_LINES, QUOTES, scriptStep,
    secondsLeft, fmt, elapsedMs, clamp
  };
});
