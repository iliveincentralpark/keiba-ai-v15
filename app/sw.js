// AI Keiba PWA Service Worker (V16: 馬評価特化)
const CACHE_NAME = 'keiba-ai-v18-cache';
const ASSETS = [
    './',
    './index.html',
    './simulation.html',
    './css/style_v3.css?v=13',
    './js/app_v15.js?v=20260418b',
    './icon.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => Promise.all(
            keys
                .filter((key) => key !== CACHE_NAME)
                .map((key) => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', (e) => {
    // API呼び出しはキャッシュせずネットワークへ
    if (e.request.url.includes('/api/')) {
        e.respondWith(fetch(e.request));
        return;
    }
    // その他のリソースはネットワーク優先 (Network First, fallback to cache)
    e.respondWith(
        fetch(e.request).catch(() => caches.match(e.request))
    );
});
