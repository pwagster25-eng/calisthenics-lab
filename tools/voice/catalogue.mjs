/* Builds the list of coach clips the app needs, from core.js.
   Clip ids are stable; the text is what gets recorded. Run: node tools/voice/catalogue.mjs > /dev/stdout */
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const CL = require('../../app/core.js');

/* Make written text read well aloud. */
export function speakable(t) {
  return String(t)
    .replace(/(\d+)\s*°/g, '$1 degrees')
    .replace(/90\/90/g, 'ninety-ninety')
    .replace(/(\d+)\/10/g, (m, n) => (['zero','one','two','three','four','five','six','seven','eight','nine','ten'][+n] || n) + ' out of ten')
    .replace(/(\d+)\s*[–-]\s*(\d+)/g, '$1 to $2')
    .replace(/\bY-T-W\b/g, 'Y, T, W')
    .replace(/\bRDL\b/g, 'Romanian deadlift')
    .replace(/\s+s\b/g, ' seconds')
    .replace(/\s*•\s*/g, '. ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];

export function buildCatalogue() {
  const c = {};
  const add = (id, text) => { c[id] = speakable(text); };
  for (const [id, ex] of Object.entries(CL.EX)) {
    add(`ex_${id}`, `${ex.name}.`);
    add(`next_${id}`, `Next up: ${ex.name}.`);
    add(`cue_${id}`, ex.cue);
    add(`how_${id}`, `${ex.name}. ${ex.how}`);
  }
  [15, 20, 30, 45, 60, 75, 90, 120, 150].forEach(n => add(`rest_${n}`, `Rest ${n} seconds.`));
  for (let n = 1; n <= 6; n++) add(`set_${n}`, `Set ${WORDS[n]}.`);
  CL.PROGRAM.forEach((d, i) => add(`day_${i}`, `${d.n}. Let's go.`));
  CL.WARMUP_STEPS.forEach((t, i) => add(`warm_${i}`, t + '.'));
  CL.WARMUP_STEPS_LIGHT.forEach((t, i) => add(`warml_${i}`, t + '.'));
  CL.COOLDOWN_STEPS.forEach((t, i) => add(`cool_${i}`, t + '.'));
  CL.COACH_LINES.forEach((t, i) => add(`coach_${i}`, t));
  CL.QUOTES.forEach((t, i) => add(`q_${i}`, t));
  Object.entries({
    warm_start: "Warm-up. Easy pace — we're just getting the body warm.",
    warm_done: "Warm-up done. Let's work. First up:",
    lets_go: "Let's go. First up:",
    logged: 'Logged.',
    go: 'Go!',
    then_burn: 'Burnout set.',
    burn_ready: 'Start the burnout timer when you are ready.',
    burn_intro: 'Burnout set. As many clean reps as you can. Go!',
    burn_half: 'Halfway. Keep breathing.',
    burn_ten: 'Ten seconds. Empty the tank.',
    burn_stop: 'Time. Stop, and log your reps.',
    all_done: "That's every set. Cool-down time — let the breathing settle.",
    cool_done: 'Cool-down complete. Great work today.',
    complete: 'Session complete. Great work.',
    skipped: 'Skipped.',
    undone: 'Undone.',
    cap_warn: "Heads up — you're close to your time cap. Finish this exercise, then cool down.",
    cap_hit: 'Time cap. Finish this set, then cool down.',
    nothing: 'Nothing left to do today.',
    resume: 'Back to it.',
    test: "Voice check. You're hearing the recorded coach.",
    last_set: 'Last set.',
    // v4
    circuit_start: 'Circuit. Work hard, rest short. Go!',
    work: 'Work!',
    rest_short: 'Rest.',
    superset: 'Superset. Straight into the next one.',
    round_2: 'Round two.', round_3: 'Round three.', round_4: 'Round four.', round_5: 'Round five.', round_6: 'Round six.',
    progress_up: 'Level up. You earned the next variation.',
    progress_set: 'Volume up. One more set next time.',
    progress_down: 'Dialing it back a step. Earn it back.',
    deload_week: 'Deload week. Lighter on purpose — move well and recover.'
  }).forEach(([k, v]) => add(k, v));
  return c;
}

if (process.argv[1] && process.argv[1].endsWith('catalogue.mjs')) {
  const c = buildCatalogue();
  const chars = Object.values(c).reduce((a, t) => a + t.length, 0);
  console.error(`${Object.keys(c).length} clips, ${chars} characters`);
  console.log(JSON.stringify(c, null, 1));
}
