// Tăng CACHE khi đổi danh sách tệp. Tệp của app lấy từ mạng trước để luôn có bản mới.
const CACHE = 'nkb-v1';
const SHELL = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'js/app.js',
  'js/stats.js',
  'js/store.js',
  'js/store-demo.js',
  'js/todos.js',
  'js/growth.js',
  'js/vaccines.js',
  'js/appointments.js',
  'js/voice.js',
  'js/members.js',
  'js/firebase-config.js',
  'js/vendor/marked.esm.js',
  'posts/index.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
];
const SDK = ['app', 'auth', 'firestore'].map(
  (name) => `https://www.gstatic.com/firebasejs/12.6.0/firebase-${name}.js`,
);

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(SHELL);
    await Promise.all(SDK.map(async (url) => {
      const res = await fetch(url, { mode: 'cors' });
      if (res.ok) await cache.put(url, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (SDK.includes(request.url)) {
    event.respondWith(caches.match(request.url).then((hit) => hit || fetch(request)));
    return;
  }
  if (url.origin !== location.origin) return;

  event.respondWith((async () => {
    try {
      const res = await fetch(request);
      if (res.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(request, res.clone());
      }
      return res;
    } catch (err) {
      const hit = await caches.match(request, { ignoreSearch: true })
        || (request.mode === 'navigate' ? await caches.match('./') : undefined);
      if (hit) return hit;
      throw err;
    }
  })());
});
