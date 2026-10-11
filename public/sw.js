self.addEventListener('push', e => { const d = e.data ? e.data.json() : {}; e.waitUntil(self.registration.showNotification(d.title || 'Fermer Tog‘a AI', { body: d.body || '' })); });
self.addEventListener('notificationclick', e => { e.notification.close(); e.waitUntil(clients.openWindow('/#/reminders')); });
