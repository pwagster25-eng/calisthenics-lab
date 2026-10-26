/* Calisthenics Lab service worker — offline shell + recorded coach clips. No network sync, no analytics.
   Bump CACHE when shipping a new version so clients pick it up. */
const CACHE = 'calisthenics-lab-v3.0.1';
const AUDIO = 'calisthenics-lab-audio-v1'; // keyed by clip hash in the manifest, so it survives app updates
const ASSETS = ['./', './index.html', './core.js', './figures.js', './manifest.webmanifest', './audio/manifest.json', './icons/icon-180.png', './icons/icon-192.png', './icons/icon-512.png', './icons/icon-512-maskable.png'];

async function audioList() {
  try {
    const r = await fetch('./audio/manifest.json', { cache: 'no-cache' }); const j = await r.json();
    const all = Object.entries(j.clips || {}).map(([id, c]) => ({ id, url: './audio/' + c.f }));
    // Essential = everything except the long explanations and the quotes; those are fetched in the background afterwards.
    return { essential: all.filter(a => !/^(how|q)_/.test(a.id)).map(a => a.url), rest: all.filter(a => /^(how|q)_/.test(a.id)).map(a => a.url), all: new Set(all.map(a => a.url)) };
  } catch { return { essential: [], rest: [], all: new Set() }; }
}
async function warm(cache, urls, chunk) {
  for (let i = 0; i < urls.length; i += chunk) {
    await Promise.all(urls.slice(i, i + chunk).map(async u => { try { if (!(await cache.match(u))) { const r = await fetch(u); if (r.ok) await cache.put(u, r); } } catch {} }));
  }
}
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE && k !== AUDIO).map(k => caches.delete(k)));
    await self.clients.claim();
    // Background, low concurrency so the page stays responsive: essential clips first (~3.5 MB), then the
    // explanations and quotes (~8 MB), then drop clips no longer in the manifest. Failures are tolerated —
    // a clip that is not cached is fetched on demand, and the device voice covers anything unavailable.
    const a = await caches.open(AUDIO); const list = await audioList();
    warm(a, list.essential, 3).then(() => warm(a, list.rest, 2)).then(async () => {
      for (const req of await a.keys()) { const rel = '.' + new URL(req.url).pathname.replace(/^.*\/app/, ''); if (list.all.size && !list.all.has(rel)) a.delete(req); }
    }).catch(() => {});
  })());
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (/\/audio\/.+\.mp3$/.test(url.pathname)) {
    // Cache-first for clips: they are immutable per hash and large.
    e.respondWith(caches.open(AUDIO).then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  // Network-first for the app shell so updates arrive; cache fallback for offline.
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(r => r || caches.match('./index.html'))));
});
