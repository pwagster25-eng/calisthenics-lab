# Change log — v1.2 → v2.0

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
