# Claude development handoff: Calisthenics Lab v1.2

You are an independent senior front-end engineer, product designer, and QA reviewer. Inspect the attached `index.html` in full before suggesting or implementing changes. Do not assume the current implementation is correct merely because the UI renders.

## User goals and constraints
- iPhone-first, no smartwatch, installable eventually as a PWA; initially a standalone HTML/CSS/JS app.
- Eight-week progressive bodyweight calisthenics plan, seven days of activity, four full-body days, two lighter core/conditioning days, one recovery day.
- 30 minutes maximum per session initially; 45 minutes only as an optional later goal.
- User can perform 20+ strict push-ups; enjoys diamond, pike, decline, staggered, tempo and other interesting variations.
- Cobra/prone press-ups with hips on floor; daily core focus. No pull-ups yet. Upper-back substitutions are not equivalent to loaded pulling.
- User reports blood pressure controlled and medical clearance; preserve sensible exertion and breathing guidance.
- Workout logs, progress, and preferences currently live in browser localStorage; backup import/export exists.
- No email, cloud upload, sharing, deployment, or external data transfer without explicit approval.

## Existing v1.1
Single-file `index.html` contains seven-day workout data, week selector, set logging with reps/timestamps, adjustable 30/45/60/90/120-second rest timer, Web Audio beeps, mute, skip rest, 30-minute workout clock, local progress backup, and simple completion tracking.

## New v1.2 work
A guided-workout panel was added with a sequential set queue, current exercise, set number, progress indicator, Log Set, Back, Skip Set, speech synthesis announcements, and three-second warning. Review carefully: this is a prototype and has not been verified on physical iPhone Safari.

## Independent review and improvements requested
1. Audit JavaScript for correctness and state consistency. Pay special attention to `render` wrapping, active guided queue on day/week change, rest timer expiration, speech announcements, mute behavior, log/undo behavior, and duplicate set logging.
2. Critically examine whether the coach advances too early: ideally rest runs first, then announces the next exercise, with accurate displayed current/next exercise and no competing speech.
3. Support auto-advance only after prescribed sets; distinguish within-exercise rests and between-exercise rests. Allow configurable durations per exercise/type and an optional 3-second countdown.
4. Make Log Set a large thumb-friendly action; show clear set count, target reps, editable actual reps, elapsed workout time, next exercise preview, pause/skip/undo, and session completion.
5. Correct the 30-minute cap: include warmup, exercises, core, rests, cooldown, and alert before the limit. Avoid misleading promises that prescribed volume always fits.
6. Ensure speech and sound are optional and robust to iOS Safari limitations, silent mode, background throttling, audio unlocking, accessibility preferences, and interrupted audio. Do not claim reliable background audio without validation.
7. Preserve backward compatibility with existing `calisthenics-v1` localStorage records and JSON backups. Add migration/versioning if warranted; never silently delete user logs.
8. Check data validation and import security, including untrusted JSON, HTML injection, excessive payloads, and corrupted state.
9. Provide unit and browser tests for queue progression, timer deadlines, skip/undo, duplicate taps, changing days/weeks, completion, mute, and interrupted/resumed sessions. Include manual iPhone Safari QA steps.
10. Consider PWA packaging (manifest, service worker, icons, HTTPS hosting), offline behavior, exportable backups, privacy, and optional future integrations. Do not deploy or add cloud synchronization without approval.
11. Improve exercise programming where necessary, especially balanced posterior-chain/back work without pull-ups, fatigue management across Fri/Sat strength days, and appropriate core volume.

## Deliverables
A. Independent critique with severity-ranked defects, evidence, and recommendations.
B. Proposed UX flow with exact states and transitions.
C. A revised working implementation and test evidence, preserving existing data.
D. A concise change log, limitations, unresolved questions, and side-by-side comparison with v1.2.
E. Do not activate external services, publish, or change unrelated projects without authorization.

Please challenge assumptions, explain tradeoffs, and propose a better design rather than merely agreeing with the existing prototype. Return code or a complete downloadable artifact plus a succinct handoff we can send back to ChatGPT for comparison.
