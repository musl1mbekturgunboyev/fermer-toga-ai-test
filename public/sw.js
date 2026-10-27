self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'Fermer Tog‘a AI', {
    body: d.body || 'Yangi eslatma vaqti yaqinlashdi!',
    icon: '/logo-icon.png',
    badge: '/favicon.png',
    vibrate: [200, 100, 200]
  }));
});
self.addEventListener('message', e => {
  const d = e.data || {};
  if (d.type === 'NOTIFY') {
    self.registration.showNotification(d.title || 'Fermer Tog‘a AI', {
      body: d.body || '',
      icon: '/logo-icon.png',
      badge: '/favicon.png',
      vibrate: [200, 100, 200]
    });
  }
});
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(clients.openWindow('/#/reminders'));
});
