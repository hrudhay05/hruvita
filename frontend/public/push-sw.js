/* HRUVITA PWA Web Push Service Worker Handler */
self.addEventListener('push', (event) => {
  let data = {
    title: 'HRUVITA',
    body: 'You have a new update from HRUVITA.',
    url: '/account?section=orders',
    tag: 'hruvita-update',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'HRUVITA', {
      body: data.body,
      icon: '/pwa-192.png',
      badge: '/pwa-192.png',
      tag: data.tag || 'hruvita-update',
      renotify: true,
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification?.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
