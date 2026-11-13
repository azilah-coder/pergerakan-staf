/* Service worker Pergerakan Staf JTMK — app boleh dibuka luar talian (papan terakhir dari cache app).
   Naikkan VERSI setiap kali index.html / app.js / app.css berubah → pengguna dapat "Muat semula". */
const VERSI = 'pergerakan-v1.0.0';
const FON = 'pergerakan-fon';
const SHELL = ['./', './index.html', './app.js', './app.css', './config.js', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png', './icons/favicon-32.png'];

self.addEventListener('install', e => { e.waitUntil(caches.open(VERSI).then(c => c.addAll(SHELL))); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(ks => Promise.all(ks.filter(k => k.startsWith('pergerakan-') && k !== VERSI && k !== FON).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                        // API Apps Script (POST) terus ke rangkaian
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (/\/(apps-script|docs)\//.test(url.pathname)) return;
    e.respondWith(rangkaianDulu(req));
  } else if (/^fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(cacheDulu(req));
});

async function rangkaianDulu(req) {
  const cache = await caches.open(VERSI);
  try {
    const res = await Promise.race([fetch(req), new Promise((_, rej) => setTimeout(() => rej(new Error('lambat')), 6000))]);
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch (err) {
    const hit = await cache.match(req, {ignoreSearch: true}) || (req.mode === 'navigate' ? (await cache.match('./index.html')) || (await cache.match('./')) : null);
    if (hit) return hit;
    throw err;
  }
}
async function cacheDulu(req) {
  const cache = await caches.open(FON), hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
  return res;
}
