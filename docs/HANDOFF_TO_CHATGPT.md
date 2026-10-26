# Handoff: Calisthenics Lab v3.0

Summary for a second reviewer. Reasoning for the v2 rebuild in `AUDIT_REPORT.md`; all changes in `CHANGELOG.md`; evidence in `TESTING.md`. Live at https://pwagster25-eng.github.io/calisthenics-lab/app/ (user-approved GitHub Pages deployment).

## What v3.0 adds (please challenge)
1. **Editable programme with two scopes.** `state.program[dayIdx] = {m, c}` (permanent) and `state.todaySwaps = {date, dayIdx, m, c}` (expires at local midnight). `CL.resolveDay(state, dayIdx, today)` picks today > plan > default; `CL.applyEdit` applies a positional op (`swap|add|remove|move`) in either scope and keeps the two consistent. Log keys are still `week-day-exerciseId`, so edits never touch history. Editing is blocked while a session is active for that day — a simpler rule than reconciling a live queue against a changed plan.
2. **Library of 93 bodyweight exercises** with level 1–3, group, cue, how-to. `CL.library({group})` and `CL.alternativesFor(id)` drive the picker. Rows are the only equipment entry and are hidden from the picker.
3. **Figures** (`figures.js`): forward-kinematics pose model → solid silhouettes, 2–3 frames with labels/arrows, props and a hand-position inset. Generated from constant tables only, so `innerHTML` is safe there; everything else still uses `textContent`.
4. **Recorded coach.** 538 ElevenLabs clips (voice Apollo) with a manifest `{id: {f, h, d, t}}`; `Coach.say([...ids or {id,text}], {urgent})` plays sequentially on a 2-element `HTMLAudio` pool, falls back to `speechSynthesis` per item, and chooses quotes by **duration** so they fit the rest. Clip file names carry a text hash; the service worker caches them cache-first in a separate cache and warms them in the background after activation (essential set first). Setting `coachVoice: 'device'` bypasses clips.
5. **New visual system**: charcoal / chalk / ember with colour-coded movement groups; phase-tinted session backgrounds; rounded display numerals.

## Things worth a second opinion
- Media-element audio vs the iPhone silent switch (expected to play; needs confirmation on device — TESTING §0 item 22). If it does not, the alternative is decoding clips through the existing AudioContext, which *does* follow the switch.
- Whether `clients.claim()` + background warming of ~12 MB on first launch is acceptable on cellular; an opt-in "download coach audio" button is the obvious alternative.
- The positional edit model (ops carry an index) vs an id-based one; positional was chosen so "move" is trivial and duplicates are impossible, at the cost of needing the day to be re-resolved before each op.
- Pose quality: a handful of exercises (cat-cow, scapular push-ups, prone holds) are inherently subtle in a side-view silhouette; a third frame or a small motion arrow on the moving segment would help.

## v2.0 handoff (kept for context)

## Verdict on v1.2
Right primitives (deadline timers, localStorage, Web Audio, export/import), wrong structure for the guided layer. The coach kept its own `coachIndex` separate from the set log and was wired in by monkey-patching `render`/`updateRest`/`startRest`; prescriptions were parsed from display strings. Three S1 issues reproduced in headless Chromium against the untouched file: import crash when `sets` is missing (`TypeError` in `render`), HTML injection through `reps` rendered with `innerHTML`, and import replacing all data with no merge/snapshot. S2: Tue/Thu/Sun guided queues demand 6 "sets" of walking (`parseInt('12–15 min')`), coach announces the next exercise before rest and again after, duplicate taps log twice, 30-min cap is a manual timer ending in `alert()`, and at the app's own 60 s default the strength days take ≈33 min, not 30.

## What v2.0 does differently (please challenge)
1. **Position is a pure function of the log** (`CL.sessionPosition(plan, sets, skipped)`): first unmet set in programme order. No second counter → list-log, guided-log, undo, skip cannot disagree. Skips live only in the session, never in the log.
2. **Structured exercise library** with stable ids, `kind` (reps/hold/cardio/mobility), `lo/hi`, `perSide`, `sets`. Labels are generated. Log keys are `week-day-exerciseId`; v1 positional keys migrate through a frozen copy of the v1.2 table. v1 storage key is left untouched.
3. **Explicit phases** WORK → REST → WORK / COMPLETE, plus PAUSED; session persisted and restored paused after relaunch. Rest kind (within/between/light/core/none) chosen by `CL.restFor`.
4. **Cue schedule:** "Logged. Rest N seconds[, then X]" → "Next: X, set n" at 10 s → 3 beeps → two-tone + "Go. X." Beeps and voice are separate switches; no spoken countdown.
5. **Honest time cap:** `CL.estimateMinutes` (warm-up + Σ sets×(work+rest) + cool-down) shown per day; rest defaults 45/60/30 s; cap default **45 min** (user-confirmed), warning at 40, 30 still selectable and still met by weeks 1–6; cues are banners + speech, not `alert()`.
6. **Import:** schema-validated, bounded, merged by default, pre-import snapshot, zero `innerHTML` with data.
7. **PWA shell:** manifest, offline-only service worker, icons, wake lock during sessions. Not deployed.
8. **Programme (no equipment — user confirmed):** decline push-ups moved Sat→Mon replacing wide push-ups; prone swimmers added Sat; single-leg RDL added Sat replacing a second weekly reverse lunge; real week-to-week scaling in code. Rows are in the library only as an optional swap. See AUDIT §4.

## Open questions for the user / for you
- Keep wide push-ups alongside decline now that the cap is 45? (user undecided; one id in `PROGRAM`)
- Distribution: PWA on GitHub Pages is the recommended path (no App Store, no Mac). Not deployed yet — awaiting the user's go-ahead.
- Estimator calibration: 3 s/rep + 10 s per set — measure one real session.
- Do we want per-exercise rest overrides in the UI, or is the settings-level split enough?
- Is a custom confirm sheet worth it over native `confirm()` in a standalone PWA?

## Device-verification needed (cannot be proven headless)
iOS audio unlock on first tap, speech after lock/unlock and after a call, Wake Lock on Safari 16.4+, silent-switch behaviour of beeps vs speech, Home-Screen install + offline load, safe-area layout. Checklist with expected outcomes: `TESTING.md` §3.

## Test surface you can extend
- `tests/unit.test.js` (Node, no deps) — 17 tests on `core.js`, `figures.js` and the audio manifest.
- `tests/browser.test.js` (Playwright, iPhone 14 viewport, `page.clock`) — 20 checks incl. three v1.2 regressions against `src/index.html`.
Add a test before changing `sessionPosition`, `normalize`, `restFor`, `resolveDay` or `applyEdit`; those are the contract.
