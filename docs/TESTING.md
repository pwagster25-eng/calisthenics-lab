# Testing evidence, limitations, and iPhone QA checklist

## 0. v3.0 results (2026-10-25, Node 22.22, Playwright 1.56 / Chromium; browser suite run 3× after the final change, 20/20 each time)

### Unit tests — `node --test tests/unit.test.js` → **17 / 17 pass** (the 11 below plus:)

12. v3 library: every one of the 93 exercises is complete (name, cue, how-to, kind, group, level, prescription); the picker lists ≥ 80 bodyweight exercises, hides the equipment-dependent rows, and sorts easier variations first.
13. v3 figures: every exercise has 1–3 frames; every strip renders as SVG with no `undefined`/`NaN`, the figure sits on the canvas, and the aria-label escapes markup.
14. v3 editing: swap / add / remove / move are validated (unknown ids, duplicates on the day, section limits, at least one main exercise) and never mutate their input.
15. v3 today vs plan: a today-only swap is visible today, gone tomorrow, and isolated to its day; a permanent edit made while a today override exists applies to both; plans built from the resolved day log under the swapped exercise's id; resets behave; editing back to the default clears the override.
16. v3 storage: overrides are validated on load (bad ids dropped, lengths capped, bad dates/days rejected, defaults not stored), round-trip through normalize and import, and merge keeps the current customisation; v2 data loads with empty overrides and schema 3.
17. v3 coach: the manifest covers every exercise (name / next / cue / how), every quote and coach line, every rest length in Settings, set numbers, day names, warm-up/cool-down steps and all fixed cues; every clip has a file, a plausible duration and a hash-named file; no attribution survives in the quotes.

### Browser tests — `node tests/browser.test.js` → **20 / 20 pass** (the 16 below plus:)

- G1 — Edit day → Swap → library filtered to Push → pick Knee push-ups → **Just for today**: row, badge and thumbnail update, `todaySwaps` dated, `program` untouched, log key `1-0-knee-push-ups`; advance the fake clock past midnight and reload → default is back and the badge is gone.
- G2 — permanent swap, add to core, move, remove: all persist across reload (`program[0]` as expected, no today override); Reset to default clears it; Edit is refused with a toast while a session is active.
- G3 — recorded coach: manifest loads (538 clips); session start queues `day_0, warm_start, warm_0, q_n`; skip warm-up → `warm_done, ex_standard-push-ups, cue_standard-push-ups`; figures present on the work and rest screens and the next-up thumbnail; Log → `logged, rest_45`; a quote plays ~4 s in and its duration fits before the 10-s call; at 10 s → `next_standard-push-ups, set_2`; Device-voice mode bypasses clips.
- G4 — service worker: shell cache `calisthenics-lab-v3.0.0` includes `figures.js` and `audio/manifest.json`; the audio cache fills with the essential clips (≥ 290) in the background.

Screenshots: `tests/screenshots/v3-01-plan.png`, `v3-02-exercise-expanded.png`, `v3-03-edit-day.png`, `v3-04-library-picker.png`, `v3-05-work.png`, `v3-06-rest.png`.

### v3 device checks to add to §3 (cannot be proven headless)

21. **Recorded coach plays:** Settings → Test voice should play Apollo ("Voice check…"), not the system voice. If it is the system voice, open Settings once with Wi-Fi on and wait a minute (the clips download in the background), then try again.
22. **Silent switch with the recorded coach:** ring/silent switch on silent → Test voice. Expected: the recorded coach **plays** (media audio ignores the switch) while beeps stay silent. Record what actually happens; if the coach is silenced too, say so and I will switch the clips to the Web Audio path with a user-facing note instead.
23. **Playback from a timer, not a tap:** start a session, log a set, put the phone down: "Logged. Rest 45 seconds." then, at 10 s, "Next up: …, set two" must play without touching the screen. If only the first plays, note it (would mean iOS re-locked the media element).
24. **Overlap:** on a 30-second rest the quote must finish before "Next up". On a 20-second rest no quote should play.
25. **Music (v3.1):** play Apple Music / Spotify, then Settings → Test voice with *Music from other apps* on each of the three options. Expected: *Keeps playing* → music continues at full volume with the coach on top; *Lowered* → music dips while the coach talks (iOS 17+), otherwise same as Keeps playing; *Paused by the coach* → music stops. Also confirm with the silent switch on that the first two are silenced and the third still plays.
26. **Offline after first launch:** open the app on Wi-Fi, wait two minutes, Airplane Mode, force-quit, relaunch, start a session: coach clips should still play (cached) and the figures render (no network needed).
27. **Edit flow with one thumb:** Edit this day → Swap → pick → Just for today, in under 20 seconds; confirm the sticky "Just for today / Save to my plan" bar does not cover the last list item.
28. **Figures legibility:** at your normal text size, the work-screen figure should be readable at arm's length; tell me if the hand-position inset is too small to be useful.

## 1. v2.0/v2.1 automated results (2026-10-22, Node 22.22, Playwright 1.56 / Chromium 1194; browser suite run 4× consecutively after the final change, 14/14 each time)

### Unit tests — `node --test tests/unit.test.js` → **11 / 11 pass**

1. Every programme day resolves to known exercises with sane prescriptions (all 8 weeks × 7 days).
2. v1.2 defect fixed: cardio/mobility items are 1 block, not 6–12 "sets".
3. Week scaling: low→high reps, week 7 adds one set to the first exercise, week 8 deloads, week 5 shows a variation hint.
4. Time estimate: every day fits the 45-min default cap; weeks 1–6 strength days also fit a 30-min cap at default rests; long rests are reported as *not* fitting a 30-min cap.
5. Rest type selection: within vs between, light days, core finisher, none for cardio.
6. Queue position derived from the log: out-of-order list logging, undo, skip, over-logging — all consistent.
7. v1 storage/backup migration: every entry preserved, orphaned exercise logs kept, settings mapped, idempotent.
8. Import validation: garbage/arrays/oversize rejected; injection strings, out-of-range numbers, bad keys, prototype keys dropped; valid entries survive.
9. Merge is a union that never drops current data and de-duplicates.
10. Timer math: deadline-based, clamps late wake-ups to zero, pause freezes elapsed.
11. Corrupt stored session cannot crash boot.

### Browser tests — `node tests/browser.test.js` → **14 / 14 pass** (iPhone 14 viewport, fake clock)

Against the **unmodified v1.2** file (`src/index.html`):
- A1 — import of a backup without `sets` throws `TypeError` in `render()` ✔ reproduced
- A2 — crafted backup renders an injected `<img>` element ✔ reproduced
- A3 — Tuesday guided queue reports "1 / 11" and still shows "Brisk walking" after five skips ✔ reproduced

Against **v2.0** (`app/index.html`):
- B1 — boots from v1 storage, migrates, leaves the v1 key byte-identical, shows "Logged: 12, 11", shows orphaned Sat decline-push-up log
- C1 — start → set 1 of 2 → triple-tap Log → exactly one set stored → rest 00:45 → 00:25 after 20 s → work "Set 2 of 2" after 46 s; elapsed clock ≈ 00:46
- C2 — between-exercise rest is 01:00 and labelled; skip rest; skip set does not log; undo removes the last set and moves the position back
- C3 — pause freezes elapsed and rest; resume shifts the deadline by the pause length
- C4 — End asks for confirmation when incomplete; history entry written; reload mid-rest restores a **paused** session; resume returns to rest
- C5 — logging all 14 sets reaches the completion screen ("14 sets logged"); Mark complete sets `done['1-0']`, clears the session, writes history with `completed: true`
- C6 — light day: walking logs in minutes with no rest and advances straight to bird dogs; bird-dog rest is 00:30
- C7 — 40-minute warning banner + amber clock; 45-minute cap banner + red clock; zero `alert()` dialogs
- D1 — import of a v1 file via the file chooser merges with existing v2 data and writes a pre-import snapshot
- D2 — crafted backup produces no injected elements; the valid entry in the same file survives
- E — no uncaught page errors during the run

Screenshots: `tests/screenshots/01-plan-view.png`, `02-rest.png`, `03-work.png`, `04-complete.png`, `05-cap-banner.png`.

### How to re-run

```
cd calisthenics-lab-v2
node --test tests/unit.test.js
python3 -m http.server 8089 --bind 127.0.0.1 &      # any static server at the repo root
NODE_PATH=$(npm root -g) node tests/browser.test.js   # needs `playwright` + Chromium installed
```

## 2. What the automated tests do **not** prove

- Anything about iOS Safari/WebKit specifically: audio unlock, speech synthesis, wake lock, silent switch, background suspension, Home-Screen install. Chromium is used because WebKit on Linux is not representative of iOS and no simulator is available here.
- Real elapsed-time behaviour across a locked screen (fake clock only advances timers; it cannot model OS suspension).
- Voice quality, utterance overlap at real speech rates, or the exact timing of the 10-second "Next" announcement against the 3-2-1 beeps when rests are shorter than ~12 s.
- Visual rendering on devices with a Dynamic Island / safe areas (CSS uses `env(safe-area-inset-*)`; untested on hardware).

## 3. iPhone Safari QA checklist (manual, ~20 minutes)

Host the `app/` folder over HTTPS (GitHub Pages, Netlify drop, or any static host — **not done by me; needs your approval**) or run a local HTTPS server on your LAN. `file://` and plain `http://` on a phone will not register the service worker or install.

**Install**
1. Open the URL in Safari → Share → Add to Home Screen. Confirm the icon and the name "Calisthenics Lab".
2. Launch from the Home Screen. Confirm standalone mode (no Safari chrome) and that the status-bar area is not overlapped by the "End / Pause" bar.
3. Toggle Airplane Mode, relaunch. Confirm the app loads offline (service worker).

**Data**
4. If you had v1.2 data: confirm "Upgraded your v1 data" toast, your logged sets appear, and Settings shows your old rest length.
5. Export a backup, open it in Files, confirm it is readable JSON with `"schemaVersion": 2`.
6. Import that same file → choose Merge → confirm no duplicates.

**Audio — do these in order; iOS audio unlock is gesture-based**
7. Settings → Test beep, Test voice. Both should play on first tap. If voice is silent, tap again (first-utterance quirk) and note it.
8. Ring/silent switch **on silent**: Test beep (expect: silent — Web Audio follows the switch) and Test voice (expect: may still play). Record what happens; the Settings note is written to match this expectation and should be corrected if wrong.
9. Start a session, log a set, let the 45 s rest run: expect "Logged. Rest 45 seconds", "Next: …" at ~10 s, three ticks, two-tone + "Go. …".
10. During rest, press the side button to lock the screen, wait past the deadline, unlock: expect the view already in Work with the correct set number and the elapsed clock correct; expect **no** sound to have played while locked (document this — it is the known limitation).
11. With "Keep screen awake" on, start a session and leave the phone untouched for 2+ minutes with auto-lock set to 30 s. Expect the screen to stay on (wake lock). If it locks, note iOS version — the wake lock needs Safari 16.4+ and is released whenever the page is hidden.
12. Receive a phone call or play a Siri response mid-rest, then return: expect beeps still working (AudioContext resumed on visibility change). If not, tap Pause/Resume and retry.
13. Turn Voice off mid-utterance: speech should stop immediately.

**Interaction**
14. Triple-tap Log set fast: exactly one set logged.
15. Pause for 30 s mid-rest, resume: rest continues from where it stopped; elapsed did not count the pause.
16. Background the app (swipe home) for 1 min during work, return: elapsed includes the minute (expected; it is wall time), no crash.
17. Force-quit the app mid-session, relaunch: "Session restored" toast, Paused screen, Resume works.
18. Switch day while in a session: confirmation prompt; cancel keeps the session.
19. Complete a full Monday within the cap: check the estimate against the real elapsed time and tell me the delta — the estimator's 3 s/rep assumption is the main thing to calibrate.
20. Accessibility: enable Larger Text (one or two steps) and confirm the session screen still fits without horizontal scroll; enable Reduce Motion and confirm nothing animates.

## 4. Known limitations (v3.0)

- The recorded coach is one voice (Apollo) at one speed; changing a line means regenerating that clip with the ElevenLabs pipeline (maintainer action, ~1 s per clip). The device voice remains available and is the automatic fallback.
- First launch after the update downloads ~12 MB of audio in the background; until the essential 3.5 MB is in, clips are fetched on demand (short delay before a cue on a slow connection) or the device voice fills in.
- Figures are schematic silhouettes drawn from a pose model; they show position and direction, not fine technique (hand width is shown in a separate inset for push-up variants).
- Today-only swaps are keyed to the phone's local date; a session that runs past midnight keeps the plan it started with only while the session is active.

### Known limitations carried over from v2.0

- No background cues while the screen is locked or the app is backgrounded. Mitigation is the wake lock; there is no reliable web-only alternative on iOS without push notifications and a server, which would violate the no-external-services constraint.
- Vibration does nothing on iPhone Safari (platform limitation); the switch is labelled accordingly.
- Per-exercise rest overrides are data-level (`core.js`) rather than exposed in the UI.
- Programme editing (adding/removing/reordering exercises) is not in the UI; it is a table in `core.js` with stable ids, which was the prerequisite for making it editable later.
- The time estimator uses fixed work-rate assumptions (3 s per rep, +10 s setup per set, holds at face value). It needs one or two real sessions to calibrate.
- History is a flat list of sessions; there is no chart or per-exercise trend yet.
- `confirm()` is still used for three destructive actions. Fine in a PWA, but a custom sheet would look better.
- Wake lock is released by the browser whenever the page is hidden; it is re-requested on return, which is the specified behaviour, not a bug.
