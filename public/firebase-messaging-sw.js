importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

let vapidKey = null;
let firebaseInitialized = false;
let messaging = null;

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SET_VAPID_KEY') {
    vapidKey = event.data.key;
  }
  
  if (event.data && event.data.type === 'INIT_FIREBASE' && !firebaseInitialized) {
    try {
      const config = event.data.config;
      if (config && config.apiKey && config.projectId) {
        firebase.initializeApp(config);
        messaging = firebase.messaging();
        firebaseInitialized = true;
        console.log('[firebase-messaging-sw.js] Firebase initialized via postMessage');
        
        messaging.onBackgroundMessage((payload) => {
          console.log('[firebase-messaging-sw.js] Received background message:', payload);
          handleBackgroundMessage(payload);
        });
      }
    } catch (err) {
      console.error('[firebase-messaging-sw.js] Firebase init error:', err);
    }
  }
});

function handleBackgroundMessage(payload) {
  const notificationTitle = payload.notification?.title || payload.data?.title || 'PACT Notification';
  const notificationOptions = {
    body: payload.notification?.body || payload.data?.body || '',
    icon: '/pact-logo-192.png',
    badge: '/pact-logo-192.png',
    tag: payload.data?.tag || `pact-notification-${Date.now()}`,
    data: {
      ...payload.data,
      url: payload.data?.url || payload.data?.link || '/notifications',
    },
    requireInteraction: payload.data?.priority === 'urgent' || payload.data?.priority === 'high',
    actions: [
      { action: 'open', title: 'Open' },
      { action: 'dismiss', title: 'Dismiss' }
    ],
    vibrate: [100, 50, 100]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
}

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    console.log('[firebase-messaging-sw.js] Push event received:', payload);
    
    event.waitUntil(
      handleBackgroundMessage(payload)
    );
  } catch (error) {
    console.error('[firebase-messaging-sw.js] Push event error:', error);
    
    event.waitUntil(
      self.registration.showNotification('PACT Notification', {
        body: 'You have a new notification',
        icon: '/pact-logo-192.png',
        badge: '/pact-logo-192.png'
      })
    );
  }
});

self.addEventListener('notificationclick', (event) => {
  console.log('[firebase-messaging-sw.js] Notification click:', event);
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  const urlToOpen = event.notification.data?.url || event.notification.data?.link || '/notifications';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.postMessage({ type: 'NOTIFICATION_CLICK', url: urlToOpen });
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

self.addEventListener('install', (event) => {
  console.log('[firebase-messaging-sw.js] Installing...');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[firebase-messaging-sw.js] Activated');
  event.waitUntil(clients.claim());
});
