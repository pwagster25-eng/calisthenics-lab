# Change log

## v4.0 (2026-10-27) — progressive programme: ladders, supersets, circuits, 4-week blocks

User request: "a progressive regime building me up — intensity and difficulty increase with my body and improvement; time can also increase; add circuit training and supersets; you do the research on most effective." Decisions were emailed on 2026-10-25 and the user said "Proceed"; the recommended options were taken: 4 strength days + 2 timed-circuit days + 1 recovery day, a one-tap effort rating, automatic progression with Undo, sessions growing to ~40 min then density, no equipment.

**What the evidence says (and what the app does with it)** — sources are from PubMed; DOIs linked.
- *More weekly sets → more size and strength, with diminishing returns; frequency helps strength.* Pelland et al., Sports Med 2025 meta-regression of 67 studies ([10.1007/s40279-025-02344-w](https://doi.org/10.1007/s40279-025-02344-w)). → Each movement pattern gets two exposures a week via four full-body days; sets per exercise start at 3 and are *earned* up to a cap (4 in block 1, 5 from block 2).
- *Training closer to failure matters for muscle size; strength gains are similar across a wide range of reps-in-reserve.* Robinson et al., Sports Med 2024 ([10.1007/s40279-024-02069-2](https://doi.org/10.1007/s40279-024-02069-2)). → Working sets aim for the top of the rep range with reps in reserve (not Max), the last set stays a timed burnout, and the effort rating feeds progression.
- *Progressive push-up variations build strength comparably to bench pressing.* Kotarsky et al., J Strength Cond Res 2018 RCT ([10.1519/JSC.0000000000002345](https://doi.org/10.1519/JSC.0000000000002345)). → Difficulty progresses by *leverage*, i.e. by climbing a ladder of variations, not by adding load.
- *Supersets / paired sets give similar adaptations to traditional sets in roughly half the time; alternating with short rest between the two and normal rest after the pair preserves work output.* Mang, Beam & Kravitz, J Strength Cond Res 2025 narrative review ([10.1519/JSC.0000000000005246](https://doi.org/10.1519/JSC.0000000000005246)); Chien et al. 2026 systematic review of paired-set configurations ([10.3390/jfmk11030370](https://doi.org/10.3390/jfmk11030370)); Iversen et al., Sports Med 2021 time-efficient training review ([10.1007/s40279-021-01490-1](https://doi.org/10.1007/s40279-021-01490-1)). → Strength days are two upper/lower supersets (A1/A2, B1/B2): 20 s between the two, the normal 45 s after the pair, 60 s between blocks.
- *Circuit resistance training improves strength, cardiorespiratory fitness and body composition together.* Ramos-Campo et al. 2021 meta-analysis ([10.1123/japa.2021-0204](https://doi.org/10.1123/japa.2021-0204)). → Tuesday and Thursday are timed whole-body circuits (default 40 s on / 20 s off, 6 stations), replacing the plain walking days; the core finisher is a 3-station circuit.
- *Periodise and recover.* Standard 4-week waves: three weeks of progression and a deload at ~60 % of the sets with no evaluation.

**Programme (progressive mode, default)**
- 11 **ladders** (push horizontal, push shoulders/tempo, squat, lunge, hinge ×2, upper back ×2, core front, core side, plank/crawl), each an ordered list of library variations. Starting rungs match the v3 plan (standard push-ups, pike push-ups, bodyweight squats, reverse lunges, glute-bridge march…).
- **Week template:** Mon A (push-h + squat, upper back + hinge, core circuit), Tue Circuit 1, Wed B (push-b + lunge, upper back B + hinge B, core circuit), Thu Circuit 2, Fri C (push-h + lunge, …), Sat D (push-b + squat, …), Sun recovery. The same exercise never appears twice on one day (a rung collision steps along the ladder).
- **Blocks:** week → block/week-in-block; core circuit 2 rounds in block 1 then 3; timed circuits 2 rounds in block 1, 3 in block 2, 4 from block 3; deload every 4th week; weeks run to 52.
- **Progression rule (evaluated when a session ends):** every working set at the top of the range, no set rated Max, burnout ≥ the low end → one more set (to the cap) or, at the cap, the next rung with sets back to 3. Two weak sessions in a row (≥ 2 sets under the low end, or a Max rating with a set under it) → one rung down (or one set fewer at rung 0). Incomplete exercises are not judged. Changes are applied automatically, spoken ("Level up…"), shown in a **Progress earned** card with **Undo**, and logged.
- **Effort rating:** Easy / Hard / Max buttons on the rest screen for the set just logged (stored as `effort` on the entry; not shown for auto-logged stations).
- **Timed circuits:** "▶ Start circuit" starts a work timer; each station logs itself (`auto: true`, seconds), rests the fixed interval, and the next station starts on its own; Stop early logs the time done; rounds are announced.
- **Your ladders** panel: current exercise, rung dots, sets, Easier/Harder nudges (logged as manual).
- Editing a progressive day turns it into a plain list (no supersets/timed circuit) until reset; ladder set counts still apply to it. Classic 8-week mode remains in Settings → Programme.
- Settings: Programme mode, timed-circuit work/rest, rests inside a superset / between circuit stations / after a round.

**Engine & storage**
- `core.js`: `LADDERS`, `TEMPLATE`, `weekInfo`, `templateDay`, block-aware `dayPlan`, interleaving `buildQueue`, `restAfter` (replaces the flat rest rule for blocks), queue-based `estimateMinutes`, `evaluateSession`, `undoLastChanges`, `adjustLadder`; state gains `mode`, `progress {ladders, log}`, `lastChanges`; set entries gain `effort` and `auto`; week keys accept 1–52; session gains `workUntil/workTotal` and new rest kinds. All validated on load; merge keeps the furthest ladder state.
- 13 new coach clips (circuit start, work, rest, superset, rounds 2–6, level up / volume up / step back, deload week).
- Service-worker cache v4.0.0.
- Tests: 20 unit (+3: ladders/template/blocks, rests & estimate, progression rules incl. undo/merge/validation) and 22 browser checks (+2: superset + effort + timed circuit flow; a perfect session earning progressions with the card, Undo, ladder nudge, deload display and the classic switch). Legacy v2/v3 checks run with `mode: 'classic'` pinned, so the fixed programme they describe is still verified unchanged.

**Estimates at defaults:** strength days ≈ 25–26 min in block 1 (supersets are dense), timed circuits ≈ 18–19 min, growing with earned sets and rounds; the 45-minute cap and 40-minute warning are unchanged.

## v3.1.1 (2026-10-25)

- Estimator recalibrated from a real Friday session: 19 sets with burnouts, warm-up and cool-down in 27:34 against a 31-minute estimate. Ordinary sets now count 1.5 s/rep + 4 s (was 2 s + 6 s); holds +6 s. Strength days now estimate ≈ 29 min at default settings — still slightly conservative on purpose, since the cap warning should err early.

## v3.1.0 (2026-10-25) — music keeps playing

User report: music stopped whenever the coach spoke (the clips played through a media element, which iOS treats as a music player and lets it take over the audio session).

- New setting **Audio & cues → Music from other apps**: *Keeps playing* (default), *Lowered while coach talks*, *Paused by the coach*.
- Implementation: on iOS 17+ the Audio Session API is set to `ambient` / `transient` / `playback` respectively (`Coach.applySession()`); where that API is missing, *Keeps playing* and *Lowered* route the clips through Web Audio (`decodeAudioData` + buffer sources, small decoded-buffer cache), which mixes with other audio on every iOS version. *Paused by the coach* keeps the media-element path and plays even on silent.
- Trade-off made explicit in the setting text: when the coach is mixed in, it follows the ring/silent switch like the beeps do.
- Service-worker cache bumped to v3.1.0. Browser test G3 now also checks the Web Audio route decodes a clip; 20/20, unit 17/17.

## v3.0.1 (2026-10-25)

- The "+ Add an exercise" buttons under Main work and Core finisher are now always visible (they were only shown in edit mode). Adding asks the same question as swapping: just for today, or saved to the plan.

## v3.0 (2026-10-25) — editable programme, exercise library, figures, recorded coach, new look

User requests (voice conversation): swap exercises in and out of the plan from a bodyweight-only library; a visual for every exercise ("not a cheesy stick figure"); a more aesthetic, less all-blue interface ("you design it"); a gritty, non-robotic coach voice — approved use of ElevenLabs for pre-recorded audio (voice "Apollo"); and both permanent plan edits **and** quick "just for today" swaps.

**Programme editing**
- **Edit this day** on the plan: reorder (↑ ↓), **⇄ Swap** any exercise, **✕ Remove**, **+ Add** to main work or the core finisher, **Reset to default**. Limits: 1–8 main, 0–4 core, no duplicates on a day.
- Every change is either **Just for today** (stored as `todaySwaps` with the local date; silently expires at midnight) or **Save to my plan** (stored as `program[dayIdx]`). A permanent edit made while a today-only override is active is applied to both, so what you see is what you get. Days that match the default again drop their override automatically.
- Badges: "Changed for today only" / "Customised". Editing is refused while a guided session is active for that day (end it first).
- Log keys stay `week-day-exerciseId`, so swapping and swapping back never loses history; logs for exercises no longer on a day still show under "Also logged this day".
- Pure, tested API in `core.js`: `resolveDay`, `editDay`, `applyEdit`, `resetDay`, `library`, `alternativesFor`, `localDate`. Everything is validated on load (`cleanProgram`, `cleanTodaySwaps`) and survives export/import; merge keeps the current customisation. Schema version is now **3** (additive; v2 and v1 files load unchanged, and a v3 backup still opens in v2.1).

**Exercise library** — 93 exercises (was 34), all bodyweight; the only "props" are a wall, a couch/step, stairs or a doorframe. Each has a difficulty level (1–3, shown as dots), movement group (push / legs / hinge & glutes / upper back / core / conditioning / mobility), rep or hold prescription, cue and a full how-to with the common mistake. The picker filters by group, lists easier variations first, and shows the how-to and the picture sequence for the selected item. Table/band rows remain in the data as an equipment-dependent entry but are hidden from the picker.

**Figures** — `app/figures.js`: a small pose model (hip position + limb angles) rendered as solid silhouettes with a near/far limb shade, floor line, props (step, couch, wall, post, stairs) and a top-view hand-placement inset for push-up variants. 2–3 labelled frames per exercise (start → movement → finish) with arrows. Shown as a thumbnail on every plan row and in the picker, as the full strip when a row is expanded, and on the session **work**, **rest** (next exercise) and **burnout** screens. Everything is generated from fixed numeric tables — no user data goes through `innerHTML`.

**Recorded coach** — 538 clips generated once with ElevenLabs (voice Apollo, `eleven_multilingual_v2`), 22.05 kHz / 32 kbps mono, 11.8 MB total:
- per exercise: name, "Next up: …", the form cue, and the full explanation; every rest length offered in Settings; set numbers 1–6; day names; warm-up / cool-down steps; 12 coach lines; all 100 motivational lines; the fixed cues (logged, go, burnout intro/halfway/ten seconds/stop, cap warnings, skipped, undone, complete…).
- Playback engine (`Coach` in `index.html`): a 2-element `HTMLAudio` pool unlocked on the first tap, a sequential queue with preload of the next clip, `urgent` to cut in, text fallback through `speechSynthesis` for any clip that is missing or fails to play, and a **Device voice** setting that bypasses the clips entirely. Motivational lines are now chosen by **duration** so they always finish before the 10-second "Next up" call. Media-element audio should also play with the iPhone silent switch on (to confirm on device — see TESTING §3).
- Caching: the service worker caches audio **cache-first** in a separate `calisthenics-lab-audio-v1` cache keyed by clip hash (file names are `id.hash.mp3`, so a changed line can never be served stale). Essential clips (~3.5 MB) are fetched in the background right after activation, then the explanations and quotes (~8 MB), at low concurrency so the page stays responsive; anything not yet cached is fetched on demand.
- Pipeline in `tools/voice/`: `catalogue.mjs` derives the clip list and speech-friendly text from `core.js` (45° → "45 degrees", 2–3 → "2 to 3", 90/90 → "ninety-ninety" …); `generate.mjs` regenerates only clips whose text changed and writes `app/audio/manifest.json`. The API key is read from the environment and is not stored anywhere in the repository.

**Visual redesign** — new palette: charcoal base (`#0e0f12`), chalk text, **ember** `#ff5a2e` for primary actions, amber for timers/burnout, teal rest ring, mint for "done". Movement groups are colour-coded (stripe on every thumbnail and day dots). Rounded display numerals for clocks and reps, uppercase tracked labels, larger day hero with the estimate as a number, colour-coded day strip, phase-tinted session backgrounds (warm-up amber, rest teal, burnout ember, cool-down blue, done green). New icons in the same palette. `theme-color` and manifest colours updated.

**Other**
- Settings: **Coach voice** (Recorded coach / Device voice); the device-voice picker and speed are kept as the fallback; coaching level and quote switches unchanged.
- Service-worker cache bumped to `calisthenics-lab-v3.0.0`; the shell now includes `figures.js` and `audio/manifest.json`.
- Tests: 17 unit tests (+6: library completeness, figure coverage, edit operations, today/plan semantics and expiry, storage validation/merge, clip catalogue coverage) and 20 browser checks (+4: today-only swap with midnight expiry, permanent edits/reset/session guard, coach clip sequencing and quote-fit, service-worker caching). Browser tests opt out of the service worker (`?nosw`) except the SW test, so SW warm-up cannot starve the page during the run.

**Not changed:** the week scaling, rest logic, time cap, import safety and the log-derived session position from v2 — all v2 tests still pass unchanged apart from one shortened label.

## v2.1 (2026-10-22) — after the first real session on the phone

User feedback: works on iPhone; didn't know several exercises; wanted more sets (finished a 14-set day in 16 min); wanted the voice to say more mid-workout, better voices, warm-up and cool-down timers, and a timed burnout set to finish each exercise. Also supplied a list of motivational lines to be spoken without attribution.

- **How-to for every exercise** (setup → movement → the common mistake). Shown by tapping the name in the plan, by "How? 🔊" in the session, and read aloud by the 🔊 Explain button.
- **Sets:** default 3 per strength exercise (Settings → 2/3/4). Week 7 adds one more on the first two exercises; week 8 halves. Core finisher stays at 2.
- **Burnout set:** the last set of each push/leg/hinge/upper-back exercise is a timed AMRAP (default 40 s; 30–60). Separate "Start burnout timer" button; spoken "halfway" and "ten seconds"; 3-2-1 beeps; then "Stop. Log your reps". Logged with `burnout: true, secs`. Shown as 🔥 in the log. "Log reps without the timer" bypass. Guidance text says to stop at technique breakdown, not absolute failure.
- **Warm-up timer** (default 4 min, light days 2) with five spoken steps evenly spaced; **cool-down timer** (default 2 min, light days 1) with three steps. ±30 s and Skip. Both count toward the elapsed clock and the estimate.
- **Mid-workout voice:** coaching level Off / Light / Full. Full = form cue at the start of every set plus a short reminder ~25 s into ordinary sets. Light = cue on set 1 only.
- **Motivational lines:** 100 lines from the user's list, attribution stripped, rotated in order (position persisted as `quoteIdx`); one per rest ≥ 30 s, a few seconds in; one at the start of the warm-up and after the cool-down. Switch in Settings.
- **Voice picker:** lists the device's English voices (★ marks Enhanced/Premium), automatic choice prefers Premium → Enhanced → local en-US; speed slider 0.8–1.2×; test lines. iOS note on downloading better voices in Accessibility → Spoken Content.
- **Estimator recalibrated** to ~2 s/rep + 6 s per set (was 3 s + 10 s) from the 16-minute observation; burnout time counted as fixed. Monday now estimates ≈ 32 min with warm-up and cool-down.
- Pause now freezes warm-up, burnout and cool-down deadlines too. Undo during cool-down returns to the last set.
- Service worker cache bumped to v2.1.0 so installed phones pick up the update on next launch.
- Tests: unit tests cover extraSets, burnout flags, how-to presence, warm-up in the estimate, burnout log entries; browser suite adds the full warm-up → burnout → cool-down flow and the settings sheet (16 checks).

## v1.2 → v2.0

## Files

| File | Status | Purpose |
|---|---|---|
| `app/index.html` | rewritten | UI, guided-session engine, audio/speech/wake-lock layer, settings, import/export |
| `app/core.js` | new | Pure logic: exercise library, programme, week scaling, log-derived queue, migration, import validation, time estimate, timer math. Loaded by the page and by the unit tests. |
| `app/manifest.webmanifest` | new | Home-Screen install metadata |
| `app/sw.js` | new | Offline shell cache (same-origin GET only; no sync, no analytics) |
| `app/icons/*.png` | new | 180 / 192 / 512 / maskable icons (original placeholder mark) |
| `tests/unit.test.js` | new | 11 Node tests |
| `tests/browser.test.js` | new | 14 Playwright checks on an iPhone 14 viewport with a fake clock, incl. 3 v1.2 regressions reproduced against the original file |
| `src/` | untouched | ChatGPT's v1.2 prototype, for side-by-side comparison |

Opening `app/index.html` from the file system still works (no build step). The service worker and Home-Screen install need HTTPS or `localhost`.

## Data & compatibility

- New storage key `calisthenics-v2` with `schemaVersion: 2`. The original `calisthenics-v1` record is **read once and left untouched** — a built-in rollback.
- Log keys change from positional (`1-0-m-2`) to stable exercise ids (`1-0-wide-push-ups`), mapped through a frozen copy of the v1.2 programme table. Every v1 entry maps; logs for exercises no longer scheduled on that day are kept and shown under "Also logged this day".
- Set entries gain an optional `unit` (`reps` | `sec` | `min`); v1 entries without it still render.
- `restSeconds` → `settings.restWithin` (and `restBetween = restSeconds + 30`); `soundOn` → `settings.soundOn` and `settings.voiceOn`.
- Export writes the v2 shape plus `exportedAt`. Import accepts v1 **and** v2 files, validates every field, offers **Merge** (default, union de-duplicated by timestamp) or **Replace**, and snapshots current data to `calisthenics-v2-preimport` first.
- Import hardening: 2 MB cap, JSON object only, key regexes, numeric bounds (0–999 reps, ≤50 sets per exercise, weeks 1–8, days 0–6), unknown fields dropped, no `innerHTML` anywhere with user data.

## Guided session

- Full-screen session view with four phases: Work, Rest, Paused, Complete. One 68 px Log Set button in the thumb zone; secondary actions Skip set / Undo last / Rest now (work) and −15 s / +15 s / Undo last (rest).
- Position derived from the log + session skips. List logging, guided logging, undo and skip are always consistent.
- Within-exercise vs between-exercise rest with separate durations; core finisher and light days use a shorter rest; walking/mobility blocks have none. Per-exercise overrides are one property away in `core.js` (`restFor`).
- Reps stepper pre-filled with the last logged value for that exercise (else the target). Target and cue shown in-session; week-specific "harder variation" hints shown in weeks 5–6.
- Next-exercise preview during work and during rest.
- Pause/Resume freezes both the elapsed clock and the rest deadline.
- Elapsed clock starts with the session; warning (cap − 5) and cap are banners + beeps + speech, never `alert()`. Cap 30–60 and warning minutes configurable; default 45/40.
- Session persisted to storage; relaunch restores it paused.
- Completion screen with sets/time summary; "Mark day complete & finish" writes `done` and a history entry; history (last 200) shown on the plan view.
- Screen Wake Lock requested during a session (toggle in Settings).

## Audio

- Separate switches: Beeps, Voice prompts, 3-2-1 countdown, Vibration, Keep screen awake. Test buttons for beep and voice.
- Unlock on Start (silent buffer + zero-volume utterance). `resume()` on visibility change.
- Beeps scheduled on the audio clock; distinct cues for logged / tick / go / warn / done.
- Speech: short utterances, cancel only when preempting (`urgent`), reference kept to avoid GC drops, voice-off cancels speech.
- No spoken "three, two, one" — beeps only, so it never collides with the "Next" announcement.

## Programme (see AUDIT_REPORT §4 for reasoning)

- Mon: wide push-ups → **decline push-ups** (reverse snow angels kept).
- Sat: decline push-ups → **prone swimmers**; reverse lunges → **single-leg Romanian deadlift**. No equipment anywhere in the schedule (user confirmed none); table/band rows exist in the library only as an optional swap.
- Week scaling: low end (W1–2) → high end (W3–6), variation hint W5–6, +1 set on the first two exercises W7, half sets W8.
- Defaults: 45 s within / 60 s between / 30 s light & core; **cap 45 min, warning at 40** (user confirmed 45 is acceptable; 30/35/40/60 selectable). Every day fits 45 at defaults; weeks 1–6 strength days also fit 30. The estimate is shown and turns amber when over the chosen cap.
- Hollow hold 15–20 s, side plank 20–25 s.

## Removed

- Separate manual "Workout timer" panel (folded into the session clock).
- Monkey-patched `render`/`updateRest`/`startRest`/`skipRest` wrappers.
- `state.checks` (dead).
- Blocking `alert()` calls (remaining `confirm()`s guard only destructive actions: end session, switch day mid-session, replace on import).
