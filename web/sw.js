// Service worker: caches the app shell so the app opens with no signal.
// IMPORTANT: when you change any web file, bump VERSION here (keep it equal to APP_VERSION in config.js)
// so phones download the new files.

const VERSION = '0.2.2';
const CACHE = `ncm-shell-${VERSION}`;

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './config.js',
  './css/app.css',
  './i18n/ar.json',
  './i18n/en.json',
  './js/app.js',
  './js/api.js',
  './js/dates.js',
  './js/db.js',
  './js/home.js',
  './js/i18n.js',
  './js/login.js',
  './js/mock-api.js',
  './js/mock-data.js',
  './js/pin.js',
  './js/refdata.js',
  './js/session.js',
  './js/tasks.js',
  './js/ui.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the browser HTTP cache so a new version gets fresh files.
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })))),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('ncm-shell-') && k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Only the app's own files. API calls to Apps Script (another origin, POST) go straight to the network.
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    try {
      return await fetch(request);
    } catch (err) {
      if (request.mode === 'navigate') return cache.match('./index.html');
      throw err;
    }
  })());
});
