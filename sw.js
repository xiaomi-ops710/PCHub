// PC Hub Service Worker: オフラインでも起動できるようにキャッシュ
// ファイルを更新したら VERSION を変えると、iPadのアプリも新しい版に切り替わります。
const VERSION = 'pc-hub-v4';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// ネットワーク優先、失敗したらキャッシュ。Googleフォント（アイコン・日本語書体）も初回に保存され、以後はオフラインでも表示されます。
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request).then(r => {
      if (r && (r.ok || r.type === 'opaque')) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return r;
    }).catch(() => caches.match(e.request).then(m => m || caches.match('index.html')))
  );
});
