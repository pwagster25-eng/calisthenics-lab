/* Generates the recorded-coach clips with ElevenLabs and writes app/audio/manifest.json.
   Usage:  ELEVENLABS_API_KEY=... ELEVENLABS_VOICE_ID=... node tools/voice/generate.mjs [--only id1,id2] [--dry]
   - Only clips whose text changed (hash) or whose file is missing are generated.
   - The key is read from the environment and never written anywhere.
   - Output: app/audio/<id>.<hash>.mp3 (22.05 kHz, 32 kbps mono) + manifest {id: {f, h, d(seconds), t(text)}}.
     The hash in the file name means a changed line gets a new URL, so the service worker's cache-first audio cache never serves stale audio. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildCatalogue } from './catalogue.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(here, '../../app/audio');
const MANIFEST = path.join(OUT, 'manifest.json');
const KEY = process.env.ELEVENLABS_API_KEY;
const VOICE = process.env.ELEVENLABS_VOICE_ID;
const MODEL = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
const FORMAT = 'mp3_22050_32';
const SETTINGS = { stability: 0.45, similarity_boost: 0.8, style: 0.35, use_speaker_boost: true };
const args = process.argv.slice(2);
const dry = args.includes('--dry');
const only = (args.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const CONCURRENCY = 4;

fs.mkdirSync(OUT, { recursive: true });
const catalogue = buildCatalogue();
let manifest = {};
try { manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')).clips || {}; } catch {}
const hash = t => crypto.createHash('sha1').update(MODEL + '|' + JSON.stringify(SETTINGS) + '|' + t).digest('hex').slice(0, 12);

const todo = Object.entries(catalogue).filter(([id, text]) => {
  if (only.length && !only.includes(id)) return false;
  const m = manifest[id];
  return !m || m.h !== hash(text) || !fs.existsSync(path.join(OUT, m.f));
});
const chars = todo.reduce((a, [, t]) => a + t.length, 0);
console.log(`${Object.keys(catalogue).length} clips in catalogue; ${todo.length} to generate (${chars} characters)`);
if (dry) process.exit(0);
if (!KEY || !VOICE) { console.error('Set ELEVENLABS_API_KEY and ELEVENLABS_VOICE_ID'); process.exit(1); }

/* MP3 duration without a decoder: walk MPEG frames (what mutagen does). */
function mp3Duration(buf) {
  const BR = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]; // MPEG1 L3
  const BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];   // MPEG2/2.5 L3
  const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  let i = 0, frames = 0, samples = 0, sr = 22050;
  if (buf.slice(0, 3).toString() === 'ID3') { i = 10 + ((buf[6] << 21) | (buf[7] << 14) | (buf[8] << 7) | buf[9]); }
  while (i + 4 <= buf.length) {
    if (buf[i] === 0xff && (buf[i + 1] & 0xe0) === 0xe0) {
      const ver = (buf[i + 1] >> 3) & 3, layer = (buf[i + 1] >> 1) & 3, bi = buf[i + 2] >> 4, si = (buf[i + 2] >> 2) & 3, pad = (buf[i + 2] >> 1) & 1;
      if (layer !== 1 || bi === 0 || bi === 15 || si === 3 || ver === 1) { i++; continue; }
      const br = (ver === 3 ? BR : BR2)[bi] * 1000; sr = SR[ver][si];
      const spf = ver === 3 ? 1152 : 576;
      const len = Math.floor(spf / 8 * br / sr) + pad;
      if (len <= 0) { i++; continue; }
      frames++; samples += spf; i += len;
    } else i++;
  }
  return frames ? samples / sr : 0;
}

async function gen(id, text) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${VOICE}?output_format=${FORMAT}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const r = await fetch(url, { method: 'POST', headers: { 'xi-api-key': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: SETTINGS }) });
    if (r.ok) {
      const buf = Buffer.from(await r.arrayBuffer());
      const f = `${id}.${hash(text)}.mp3`; fs.writeFileSync(path.join(OUT, f), buf);
      manifest[id] = { f, h: hash(text), d: Math.round(mp3Duration(buf) * 10) / 10, t: text };
      return;
    }
    const body = await r.text();
    if (r.status === 429 || r.status >= 500) { await new Promise(res => setTimeout(res, 1500 * attempt)); continue; }
    throw new Error(`${id}: HTTP ${r.status} ${body.slice(0, 200)}`);
  }
  throw new Error(`${id}: gave up after retries`);
}

function saveManifest() {
  const clips = {}; Object.keys(catalogue).forEach(id => { if (manifest[id]) clips[id] = manifest[id]; });
  fs.writeFileSync(MANIFEST, JSON.stringify({ voice: 'Apollo', model: MODEL, format: FORMAT, generatedAt: new Date().toISOString(), clips }, null, 0));
}

let done = 0, failed = [];
const queue = todo.slice();
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const [id, text] = queue.shift();
    try { await gen(id, text); done++; if (done % 20 === 0) { saveManifest(); console.log(`${done}/${todo.length}`); } }
    catch (e) { failed.push(id); console.error(String(e.message || e)); }
  }
}));
saveManifest();
// prune files for clips no longer in the catalogue
const keep = new Set(Object.values(manifest).map(m => m.f));
for (const f of fs.readdirSync(OUT)) if (f.endsWith('.mp3') && !keep.has(f)) fs.unlinkSync(path.join(OUT, f));
const total = Object.values(manifest).reduce((a, m) => a + (fs.existsSync(path.join(OUT, m.f)) ? fs.statSync(path.join(OUT, m.f)).size : 0), 0);
console.log(`done: ${done} generated, ${failed.length} failed${failed.length ? ' (' + failed.join(', ') + ')' : ''}; audio folder ${(total / 1048576).toFixed(1)} MB`);
process.exit(failed.length ? 2 : 0);
