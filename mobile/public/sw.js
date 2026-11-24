/* Pass-through SW: installable PWA without aggressive offline cache. */
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {});

self.addEventListener('push', (event) => {
  let payload = { title: 'RFA Union', body: '', url: '/alertes?alerte=atteints' };
  try {
    payload = Object.assign(payload, event.data && event.data.json());
  } catch (error) {
    payload.body = event.data ? event.data.text() : '';
  }
  event.waitUntil(self.registration.showNotification(payload.title, {
    body: payload.body,
    data: { url: payload.url || '/alertes?alerte=atteints' },
    icon: '/logo192.png',
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/alertes?alerte=atteints';
  event.waitUntil(self.clients.openWindow(url));
});
