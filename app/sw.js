// AI Keiba PWA Service Worker (V16)
const CACHE_NAME = 'keiba-ai-v16-cache';
const ASSETS = [
    './',
    './index.html',
    './simulation.html',
    './css/style_v3.css?v=13',
    './js/app_v15.js',
    './icon.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
    );
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
