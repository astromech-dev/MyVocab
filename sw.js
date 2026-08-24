// Offline: cache the app shell on install, serve from cache first.
// Bump CACHE whenever a file below changes so browsers pick up the new version.
const CACHE = 'myvocab-v14';

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'js/app.js',
  'js/deckbar.js',
  'js/dom.js',
  'js/store.js',
  'js/srs.js',
  'js/study.js',
  'js/seed.js',
  'js/wordsformat.js',
  'js/screens/overview.js',
  'js/screens/onboarding.js',
  'js/screens/words.js',
  'js/screens/addwords.js',
  'js/screens/worddetail.js',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/favicon-16.png',
  'icons/favicon-32.png',
  'icons/favicon-48.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== location.origin) return;

  // Network first, so a normal (non-incognito) tab sees new deploys right
  // away instead of the previously cached version. Cache is only the
  // offline fallback.
  event.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
        return res;
      })
      .catch(() => caches.match(request).then((hit) => hit || caches.match('index.html')))
  );
});
