const CACHE_NAME = 'faminis-static-v5'
const APP_SHELL = ['/', '/manifest.json']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone()
      void caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy))
    }
    return response
  }).catch(() => caches.match(event.request).then((cached) => cached ?? caches.match('/'))))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const existingClient = clients.find((client) => 'focus' in client)
    if (existingClient) return existingClient.focus()
    return self.clients.openWindow('/')
  }))
})

self.addEventListener('push', (event) => {
  const payload = event.data?.json() ?? { title: 'Faminis', body: 'Ada pembaruan operasional.' }
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: '/icons/faminis-192.svg',
    badge: '/icons/faminis-192.svg',
    data: { url: payload.url ?? '/' },
    tag: `faminis-${payload.transfer_id ?? 'update'}`,
  }))
})
