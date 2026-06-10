const CACHE_VERSION = 'v1';
const STATIC_CACHE = `liravo-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `liravo-dynamic-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/discover',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS.filter(Boolean)))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== STATIC_CACHE && k !== DYNAMIC_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and API calls (don't cache mutations)
  if (request.method !== 'GET') return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.hostname !== self.location.hostname) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;

      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const clone = response.clone();
            caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Offline fallback
          if (request.headers.get('Accept')?.includes('text/html')) {
            return caches.match('/');
          }
        });
    })
  );
});

// ─── Web Push ─────────────────────────────────────────────────────────────────

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'Liravo', body: event.data.text() };
  }

  const title = payload.title ?? 'Liravo';
  const options = {
    body: payload.body ?? '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-72.png',
    data: { url: payload.url ?? '/' },
    tag: payload.tag ?? 'liravo-notification',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

