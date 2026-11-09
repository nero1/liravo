const STATIC_CACHE = 'liravo-static-v3';
const exportDownloads = new Map();
const OFFLINE_PATH = '/offline';
const PUBLIC_ASSETS = ['/offline', '/offline.js', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/badge-72.png'];

function assetKey(url) {
  if (url.origin !== self.location.origin) return null;
  const key = new URL(url.pathname, self.location.origin);
  if (url.pathname === '/manifest.json') {
    const locale = url.searchParams.get('locale') ?? 'en';
    if (!['en', 'fr', 'de'].includes(locale)) return null;
    key.searchParams.set('locale', locale);
    return key.href;
  }
  if (PUBLIC_ASSETS.includes(url.pathname) || url.pathname.startsWith('/_next/static/') && /\.(js|css|woff2?|ttf|otf|png|jpe?g|webp|svg|wasm)$/i.test(url.pathname)) return key.href;
  return null;
}

function cacheable(response, url) {
  if (!response.ok || response.redirected || !['basic', 'default'].includes(response.type)) return false;
  if (/private|no-store/i.test(response.headers.get('Cache-Control') ?? '') || /(?:\*|cookie|authorization)/i.test(response.headers.get('Vary') ?? '')) return false;
  const type = response.headers.get('Content-Type') ?? '';
  if (url.pathname === OFFLINE_PATH) return response.headers.get('X-Liravo-Offline') === '1' && type.includes('text/html');
  return !type.includes('text/html');
}

function publicCopy(response) {
  const headers = new Headers();
  for (const name of ['Content-Type', 'Cache-Control', 'Content-Security-Policy', 'X-Content-Type-Options', 'X-Robots-Tag', 'X-Liravo-Offline']) {
    const value = response.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(response.clone().body, { status: response.status, statusText: response.statusText, headers });
}

async function refreshPublicShell() {
  const cache = await caches.open(STATIC_CACHE);
  await Promise.allSettled(PUBLIC_ASSETS.map(async path => {
    const url = new URL(path, self.location.origin);
    const response = await fetch(url.href, { credentials: 'omit', cache: 'reload', redirect: 'error' });
    if (cacheable(response, url)) await cache.put(url.href, publicCopy(response));
  }));
}

async function clearLegacyCaches() {
  const names = await caches.keys();
  const unsafe = names.some(name => name === 'liravo-static-v1' || name.startsWith('liravo-dynamic-'));
  await Promise.all(names.filter(name => /^liravo-(?:static|dynamic)-/.test(name) && name !== STATIC_CACHE).map(name => caches.delete(name)));
  return unsafe;
}

self.addEventListener('install', event => {
  event.waitUntil(refreshPublicShell().catch(() => {}).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const unsafe = await clearLegacyCaches().catch(() => true);
    try {
      const cache = await caches.open(STATIC_CACHE);
      if (!await cache.match(new URL(OFFLINE_PATH, self.location.origin).href) || !await cache.match(new URL('/offline.js', self.location.origin).href)) await refreshPublicShell();
    } catch {}
    await self.clients.claim();
    if (unsafe) {
      const windows = await self.clients.matchAll({ type: 'window' });
      await Promise.allSettled(windows.map(client => client.navigate?.(client.url)));
    }
  })());
});

self.addEventListener('message', event => {
  if(event.data?.type==='LIRAVO_EXPORT'){
    const port=event.ports[0],client=event.source,{id,filename,format}=event.data;
    if(!port||!client?.id||new URL(client.url).origin!==self.location.origin||!/^[a-f0-9-]{36}$/.test(id)||!/^liravo-export-\d{4}-\d{2}-\d{2}\.(json|csv)$/.test(filename)||!['json','csv'].includes(format))return;
    if(exportDownloads.size>=32){port.postMessage({type:'cancel'});port.close();return;}
    const path='/__exports/'+id;
    const registration={port,clientId:client.id,filename,format,timer:setTimeout(()=>{exportDownloads.delete(path);port.postMessage({type:'cancel'});port.close();},60000)};
    exportDownloads.set(path,registration);
    port.onmessage=message=>{if(message.data?.type==='download')port.postMessage({type:'url',url:self.location.origin+path});};
    port.postMessage({type:'ready'});
    return;
  }
  if (event.data?.type === 'LIRAVO_CACHE_PUBLIC_SHELL') event.waitUntil(clearLegacyCaches().catch(() => {}).then(refreshPublicShell).catch(() => {}));
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || request.headers.has('Authorization')) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if(url.pathname.startsWith('/__exports/')){
    const entry=exportDownloads.get(url.pathname);
    if(!entry||event.clientId&&event.clientId!==entry.clientId&&request.mode!=='navigate'){event.respondWith(new Response('Download unavailable',{status:404}));return;}
    exportDownloads.delete(url.pathname);clearTimeout(entry.timer);
    let waiting=null,closed=false;
    const fail=()=>{if(closed)return;closed=true;if(waiting){waiting.reject(Error('Download interrupted'));waiting=null;}entry.port.close();};
    const stream=new ReadableStream({
      start(controller){entry.port.onmessage=message=>{const data=message.data;if(!waiting)return;const pending=waiting;waiting=null;clearTimeout(pending.timer);if(data?.type==='chunk'&&data.bytes instanceof Uint8Array&&data.bytes.byteLength<=4000000){controller.enqueue(data.bytes);pending.resolve();}else if(data?.type==='end'){closed=true;controller.close();entry.port.postMessage({type:'complete'});entry.port.close();pending.resolve();}else{closed=true;controller.error(Error('Download interrupted'));entry.port.close();pending.reject(Error('Download interrupted'));}};},
      pull(){if(closed)return;return new Promise((resolve,reject)=>{waiting={resolve,reject,timer:setTimeout(fail,180000)};entry.port.postMessage({type:'pull'});});},
      cancel(){entry.port.postMessage({type:'cancel'});fail();}
    },{highWaterMark:1});
    event.respondWith(new Response(stream,{headers:{'Content-Type':entry.format==='csv'?'text/csv; charset=utf-8':'application/json','Content-Disposition':'attachment; filename="'+entry.filename+'"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}}));return;
  }
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => { try { return (await (await caches.open(STATIC_CACHE)).match(new URL(OFFLINE_PATH, self.location.origin).href)) ?? Response.error(); } catch { return Response.error(); } }));
    return;
  }
  const key = assetKey(url);
  if (!key) return;
  event.respondWith((async () => {
    let cache;
    try { cache = await caches.open(STATIC_CACHE); } catch { return fetch(request).catch(() => Response.error()); }
    const cached = await cache.match(key).catch(() => undefined);
    if (cached && url.pathname !== '/manifest.json') return cached;
    try {
      const response = await fetch(request);
      if (cacheable(response, url)) event.waitUntil(cache.put(key, publicCopy(response)).catch(() => {}));
      return response;
    } catch { return cached ?? Response.error(); }
  })());
});
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
  let url;
  try { const target = new URL(event.notification.data?.url ?? '/', self.location.origin); url = target.origin === self.location.origin && !target.username && !target.password ? target.href : self.location.origin + '/'; } catch { url = self.location.origin + '/'; }
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

