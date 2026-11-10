// Quest service worker. It only shows notifications; it never caches pages,
// so a new deploy is always what loads.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    // A push without a readable body still has to show something.
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Quest', {
      body: data.body || '',
      icon: '/apple-icon',
      badge: '/icon.png',
      data: { url: data.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  let target = new URL('/', self.location.origin)
  try {
    const wanted = new URL(event.notification.data?.url || '/', self.location.origin)
    if (wanted.origin === self.location.origin) target = wanted
  } catch {
    // Keep the home screen.
  }

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const open = windows.find((client) => 'focus' in client)
      if (open) {
        await open.focus()
        if ('navigate' in open) await open.navigate(target.href).catch(() => {})
        return
      }
      await self.clients.openWindow(target.href)
    })(),
  )
})
