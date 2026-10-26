# Calisthenics Lab v3.0

- `app/` — the application (`index.html`, `core.js` pure logic, `figures.js` exercise silhouettes, `sw.js`, `audio/` recorded coach clips + `manifest.json`). Live: https://pwagster25-eng.github.io/calisthenics-lab/app/ (GitHub Pages from this repo).
- `tools/voice/` — the ElevenLabs clip pipeline (`catalogue.mjs`, `generate.mjs`). Needs `ELEVENLABS_API_KEY` and `ELEVENLABS_VOICE_ID` in the environment; regenerates only clips whose text changed.
- `src/` — the unmodified v1.2 prototype from ChatGPT (for comparison and for the regression tests).
- `docs/AUDIT_REPORT.md` — independent audit of v1.2 with severity-ranked defects and programming critique.
- `docs/CHANGELOG.md` — what changed and why; data-compatibility notes.
- `docs/TESTING.md` — automated results, limitations, and the manual iPhone QA checklist.
- `docs/HANDOFF_TO_CHATGPT.md` — concise technical handoff.
- `tests/` — unit tests (Node) and browser tests (Playwright) with screenshots.

Deployed to GitHub Pages with the user's approval. The only external service is ElevenLabs, used offline by the maintainer to generate the bundled audio; the app itself makes no network calls beyond loading its own files.
