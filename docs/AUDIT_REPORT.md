# Calisthenics Lab v1.2 — Independent Audit

Reviewer: Claude (independent of the ChatGPT build). Scope: `index.html` (v1.2, 20 KB, single file) and `CLAUDE_HANDOFF.md`. Method: full read of the source, re-execution of its parsing logic in Node, and reproduction of three defects in headless Chromium against the unmodified file (`tests/browser.test.js`, section A). Line references are to the v1.2 `index.html`.

## 1. Overall assessment

The v1.2 prototype is a reasonable first sketch — deadline-based timers, localStorage persistence, Web Audio beeps, and an export/import path are the right primitives. But the guided-workout layer was bolted on by monkey-patching `render`, `updateRest`, `startRest` and `skipRest` (lines 25–28), and it keeps its own position counter (`coachIndex`) that is independent of the set log. That one design choice is the root of most of the state bugs below: the "coach" and the log can disagree, and every patch that tries to reconcile them (the queue-signature check in the wrapped `render`) ends the session silently.

Three findings are severe enough that I would not run v1.2 on a phone as-is: prescription strings are parsed heuristically, so Tue/Thu/Sun guided sessions demand up to six "sets" of walking (confirmed); a v1.0/v1.1 backup without a `sets` object crashes rendering on import (confirmed); and a crafted backup injects HTML into the page (confirmed). The 30-minute promise is also not honest — at the app's own 60-second rest default the prescribed strength volume takes roughly 33 minutes including warm-up and cool-down.

I rebuilt rather than patched. The result (v2.0) keeps all v1 data, derives the guided position from the log, moves to a full-screen session view with one large Log Set button, and adds an estimate so the time cap is a measurement rather than a slogan. Details in `CHANGELOG.md`; evidence in `TESTING.md`.

## 2. Defects, ranked by severity

Severity: **S1** data loss / crash / security; **S2** wrong behaviour the user will hit in normal use; **S3** usability; **S4** cosmetic or hygiene.

| # | Sev | Finding | Evidence | Fix in v2.0 |
|---|-----|---------|----------|-------------|
| 1 | S1 | **Import can crash the app.** `$('file').onchange` assigns `state = s` and only defaults `done/checks/prs` — not `sets`, `restSeconds`, `soundOn`. A backup from v1.0/v1.1 (before set logging) or any hand-edited file without `sets` makes `render()` throw `TypeError` at `(state.sets[id]||[])`. The page is then blank until storage is cleared. | line 10 (`state=s;state.done||={}…`); repro test A1 | Every load/import passes through `CL.normalize()`, which rebuilds a complete, typed state. |
| 2 | S1 | **HTML injection via backup.** Logged reps are rendered with `innerHTML`: `` `Logged: ${sets.map(x=>x.reps).join(', ')}` ``. Any string in `reps` executes as markup. A backup is "trusted" only if you never share one, restore one from a chat, or let ChatGPT/Claude hand you one. | line 10 (`draw`), repro test A2 renders `<img id=pwned>` | All data rendered through `textContent`/DOM nodes; import coerces `reps` to a bounded number and drops anything else. |
| 3 | S1 | **Import silently replaces all data.** No confirmation, no merge, no snapshot. Restoring an old backup erases newer logs. Handoff rule 7 says "never silently delete user logs." | line 10 | Merge by default (union, de-duplicated by timestamp), Replace behind a second confirm, and a pre-import snapshot under `calisthenics-v2-preimport`. |
| 4 | S2 | **Prescriptions are parsed from display strings.** `parseInt('12–15 min')` → 12 sets; `Math.min(6, …)` caps the queue at 6. Tue: "0/12 sets logged" for walking and a 6-set walking queue; Thu: 15→6; Sun: 15→6; "Hip mobility 3 min" → 3 sets. | line 10 `target=parseInt(m[1])||1`, line 16 `makeQueue`; repro test A3 (`coachStep` = "1 / 11" on Tue) | Structured exercise library: `sets`, `lo/hi`, `kind` (reps/hold/cardio/mobility), `perSide`. Labels are generated, never parsed. |
| 5 | S2 | **Guided position is independent of the log.** `coachIndex` increments on guided Log and on Skip, but list-logging a different exercise does not move it, "Back" moves it without un-logging, and list "Undo" does not move it back. Set numbers displayed can differ from sets actually logged. | lines 14–24 | Position is computed from logged sets + session skips (`CL.sessionPosition`). Guided Log, list Log, Undo and Skip cannot disagree because there is no second counter. |
| 6 | S2 | **Day/week change kills the session silently.** Wrapped `render` compares queue signatures and sets `guided=false` with no message, no speech, no history record. | line 25 | Changing day/week during a session prompts to end it; ending records a history entry. |
| 7 | S2 | **Coach advances before rest.** `coachLog` calls `startRest()` then `coachAdvance()`, which immediately speaks "Next: X. Set N" — while the user is starting to rest — then the rest-end hook speaks the same name again. The display shows the *next* exercise as current during rest. (Handoff item 2 asked about exactly this.) | lines 19, 22, 26 | Explicit phases: WORK → REST (shows "up next") → WORK. Speech: "Logged. Rest 45 seconds" at rest start, "Next: X, set 2" at 10 s left, 3-2-1 beeps, "Go. X." at zero. One utterance at a time; urgent ones cancel. |
| 8 | S2 | **Duplicate-tap logging.** No debounce on either Log button; two quick taps log two sets and advance twice. | lines 10, 22 | 500 ms guard on all session actions; verified by a synchronous triple-tap test. |
| 9 | S2 | **30-minute cap is manual and blocking.** The workout clock must be started separately from the guided session; at 0 it fires `alert()`, which blocks timers and speech and is hostile in a PWA. No warning before the cap. Warm-up/cool-down not accounted for anywhere. | line 11 | Elapsed clock starts with the session; non-blocking banners + spoken warning 5 min before the cap and at the cap (default 45 min, configurable 30–60); per-day estimate including warm-up, rest and cool-down, with an "over cap" warning. |
| 10 | S2 | **Time promise is false at defaults.** 14 sets × (~40 s work + 60 s rest) + 4 min warm-up + 2 min cool-down ≈ 33 min on every strength day. | arithmetic; `CL.estimateMinutes` reproduces ≈33 min at 60/90 s | Defaults changed to 45 s within / 60 s between / 30 s core finisher (≈27 min), estimate shown, week-7 volume increase limited so it stays ≤30 min. |
| 11 | S2 | **Mute doesn't stop speech; one switch for everything.** Toggling sound off leaves an in-flight utterance playing; beeps and voice share `soundOn`. `unlockAudio()` returns early when muted, so audio is never unlocked if the user mutes first and unmutes mid-session. | lines 11, 17 | Separate Beeps / Voice / Countdown / Vibration switches; turning voice off cancels speech; unlock is independent of mute state. |
| 12 | S2 | **Units are lost.** "Brisk walking 12 min" is logged as `{reps:12}` — indistinguishable from 12 reps. | line 10 | New entries carry `unit: 'reps'|'sec'|'min'`; old entries keep working without it. |
| 13 | S2 | **No session persistence.** iOS evicts background Safari tabs and Home-Screen apps freely. A killed tab loses the guided position and the rest deadline. | n/a | Session (start time, pause state, rest deadline, skips) is stored; on relaunch it is restored in a paused state. |
| 14 | S3 | **Reps input is far from the Log button.** Guided Log reads `#reps-<id>` from the exercise list below the fold. Empty input → `Number('')` = 0 reps logged silently. | line 22 | In-session −/+ stepper pre-filled with last logged value or the target. |
| 15 | S3 | **Tap targets below 44 pt.** `.smallbtn` (Skip, Sound) ≈ 30 px tall; day buttons 12 px text. | CSS line 1 | All controls ≥ 44 px; Log Set 68 px; stepper 64 px circles. |
| 16 | S3 | **No pause, no undo in guided mode, no elapsed time, no completion summary.** "Back" exists but does not undo. | lines 18–24 | Pause/Resume (freezes rest and elapsed), Undo last, Skip set, Rest now, ±15 s rest, completion screen with summary and Mark-complete. |
| 17 | S3 | **`render()` after every log rebuilds every input**, discarding any reps the user typed into other exercises. | line 10 | List re-render only on list actions; session view is separate. |
| 18 | S3 | **First beep is dropped.** `unlockAudio()` calls `resume()` (async) and `beep()` runs immediately while the context is still `suspended`. | line 11 | Unlock plays a silent buffer; `beep()` calls `resume()` itself and schedules on the audio clock. |
| 19 | S4 | **Monkey-patching globals** (`render`, `updateRest`, `startRest`, `skipRest.onclick`) makes the control flow order-dependent and hard to test. `state.checks` is dead. `speechSynthesis.cancel()` before every `speak()` is a known iOS footgun (the next utterance is sometimes dropped). | lines 25–28, 17 | Single engine with explicit phases; pure logic in `core.js` with unit tests; cancel only when preempting. |
| 20 | S4 | **No manifest, service worker, or icons**, so the app cannot actually be installed as a Home-Screen PWA; `<title>` doesn't match the app name. | head | `manifest.webmanifest`, `sw.js` (offline shell, no network sync), 180/192/512 icons, Apple meta tags. |

## 3. Where I disagree with the handoff's framing

- **"Rest runs first, then announces the next exercise."** Half right. Announce *what is coming* at rest start (so you can move to the wall, step, or floor) and again briefly at 10 s, then say "Go" at zero. Announcing only at zero wastes the rest period; announcing at rest start *and* at zero with the same sentence (v1.2) sounds like a bug.
- **"Auto-advance only after prescribed sets."** The guided queue should not auto-skip a set because you logged a different exercise out of order; it should simply ask for the first unmet set in programme order. Deriving position from the log gives you that without any auto-advance rule.
- **Background audio.** Do not spend effort on keeping audio alive in the background. iOS suspends JS timers and the AudioContext when the screen locks or the PWA is backgrounded; the known workarounds (looping silent `<audio>`) are fragile and battery-hostile. The reliable answer for a 30-minute session is the **Screen Wake Lock API** (Safari 16.4+): keep the screen on, keep the timers alive. v2.0 requests it; needs device confirmation.
- **Speaking "Three, two, one."** A spoken countdown lags the beeps and competes with the "Next" announcement. Beeps only for the countdown; words for the transitions.
- **Vibration.** `navigator.vibrate` is not implemented in iOS Safari. Keep the switch (Android/desktop) but label it honestly.

## 4. Programming critique (handoff item 11)

What v1.2 gets right: four full-body strength days with push variety that matches the user's interests, daily core, cobra press-ups with hips down, easy days that are actually easy, a deload week.

Issues and what v2.0 changes:

1. **No horizontal pull at all.** Reverse snow angels, Y-T-W and prone W raises are scapular/posterior-deltoid work at very low load. The handoff itself notes they are "not equivalent to loaded pulling," yet the plan has nothing else. The user has confirmed **no equipment** (no table edge, no band), so there is no honest fix inside the constraint. **Change:** Monday keeps reverse snow angels; Saturday gets **prone swimmers** (alternating opposite arm/leg raises) so the two heaviest push days each end with posterior-chain work; "table or band rows" stays in the exercise library as an optional swap and is clearly described as not scheduled. The app's guidance text says plainly that these are not a pulling substitute. If pulling strength becomes a goal, the one purchase that changes the programme is a door-anchored band.
2. **Fri/Sat pressing load.** v1.2 has four push-up variations across two consecutive days (tempo + staggered Fri; diamond + decline Sat), with diamond and decline being the two most triceps/shoulder-demanding. **Change:** decline push-ups move to Mon (replacing wide push-ups), so Sat has one push variation plus prone swimmers; Sat becomes push / posterior chain / hinge.
3. **Hip hinge is thin.** Only glute bridges and a bridge march. **Change:** bodyweight single-leg Romanian deadlift on Sat (replacing a second weekly dose of reverse lunges). It trains the hinge pattern and balance, costs nothing in equipment, and sets up loaded hinging later.
4. **Wide push-ups dropped.** Least transferable variation, most shoulder-abducted position. Decline covers the "chest" intent better. Easy to restore if the user likes them — it is one line in `PROGRAM`.
5. **Progression text only.** v1.2's phases are prose; the prescription is identical in week 1 and week 7. **Change:** weeks 1–2 low end of range, 3–6 high end, week 5–6 a "harder variation" hint on the first push exercise, week 7 a third set on the first exercise only (keeps the estimate ≤ 30 min), week 8 half the sets. All of it is visible in the day card and driven by `CL.prescription()`.
6. **Core volume** is appropriate (2 exercises × 2 sets on strength days plus daily stability work). Hollow hold bumped to 15–20 s, side plank to 20–25 s, so there is somewhere to progress to.
7. **Rest defaults and the cap.** 60 s everywhere did not fit a 30-minute cap. 45 s within / 60 s between on strength days, 30 s for the core finisher and light days, none for walking/mobility. The user has since confirmed sessions may run to **45 minutes**, so the default cap is 45 with a warning at 40; 30 remains selectable and the weeks 1–6 strength days still fit it at default rests (≈26–30 min). Week 7 adds a third set to the first two exercises (≈30–33 min).

Things I did **not** change and want the user to decide: whether to keep Thursday's shadowboxing option (fine, but it is the only item whose intensity is not self-limiting); whether Sunday needs a time cap at all; whether to restore wide push-ups alongside decline now that the cap is 45 minutes (the user was undecided; it is one id in `PROGRAM`).

## 5. UX flow for guided mode (as implemented)

```
PLAN VIEW ──Start──▶ WORK ──Log set──▶ (more sets?) ──yes──▶ REST ──deadline/skip──▶ WORK
   ▲                  │  │  │                            │                          
   │                  │  │  └─Skip set──▶ WORK (next)   no ──▶ COMPLETE ──Mark/Finish──▶ PLAN VIEW
   │                  │  └─Undo last──▶ WORK (previous set)
   │                  └─Pause──▶ PAUSED ──Resume──▶ (same phase, deadline shifted)
   └──End (confirm unless complete)── any phase
Relaunch with stored session ──▶ PAUSED (restored)
Day/week change during session ──▶ confirm End ──▶ PLAN VIEW
```

State is five fields in `state.session` (`startedAt`, `pausedAt`, `pausedTotal`, `restUntil`, `skipped`) plus the log. Phase is a pure function of those and the clock; nothing is stored that could be derived.

Cues per transition (voice optional, beeps optional):

| Transition | Beep | Voice |
|---|---|---|
| Start | — | "Starting Full Body A. First: Standard push-ups, set 1." |
| Log set | short | "Logged. Rest 45 seconds." / "…then Bodyweight squats." |
| 10 s left | — | "Next: Bodyweight squats, set 1." |
| 3-2-1 | tick ×3 | — |
| Rest end / skip | two-tone | "Go. Bodyweight squats." |
| 40 min (cap − 5) | double low | "5 minutes left before your time cap." |
| 45 min (cap) | double low | "Time cap reached. Finish this set, then cool down." |
| Complete | three-tone | "All sets complete. Great work. Cool down." |

## 6. What still needs a physical iPhone

See `TESTING.md` §3. Headless Chromium can prove state logic and layout; it cannot prove Safari's audio unlock, speech after lock/unlock, wake-lock behaviour, the silent switch, or Home-Screen install.
