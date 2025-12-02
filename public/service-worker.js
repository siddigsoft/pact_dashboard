const CACHE_NAME = 'pact-v3';
const OFFLINE_URL = '/offline.html';

const STATIC_CACHE = 'pact-static-v1';
const API_CACHE = 'pact-api-v1';

const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/pact-logo.png',
  '/icons/icon-192x192.png',
  '/icons/icon-72x72.png',
  '/notification.mp3'
];

const API_CACHE_URLS = [
  '/rest/v1/mmp_site_entries',
  '/rest/v1/profiles',
  '/rest/v1/projects',
];

const NOTIFICATION_SOUNDS = {
  default: '/notification.mp3',
  urgent: '/notification.mp3',
  message: '/notification.mp3'
};

const VIBRATION_PATTERNS = {
  default: [100, 50, 100],
  urgent: [200, 100, 200, 100, 200],
  message: [100, 50, 100, 50, 100],
  silent: []
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(CACHE_NAME).then((cache) => {
        return cache.addAll([
          '/offline.html',
          '/notification.mp3'
        ]).catch((err) => {
          console.log('[SW] Core cache failed:', err);
        });
      }),
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.addAll(STATIC_ASSETS).catch((err) => {
          console.log('[SW] Static cache failed:', err);
        });
      })
    ])
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  const validCaches = [CACHE_NAME, STATIC_CACHE, API_CACHE];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !validCaches.includes(name))
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const priority = data.priority || 'default';
    const silent = data.silent || false;
    
    const notificationOptions = {
      body: data.body || data.message || '',
      icon: data.icon || '/icons/icon-192x192.png',
      badge: '/icons/icon-72x72.png',
      tag: data.tag || `pact-${Date.now()}`,
      renotify: true,
      requireInteraction: priority === 'urgent',
      silent: silent,
      timestamp: data.timestamp || Date.now(),
      data: {
        url: data.url || data.link || '/',
        notificationId: data.id,
        type: data.type || 'info',
        priority: priority,
        category: data.category || 'system'
      },
      vibrate: silent ? VIBRATION_PATTERNS.silent : (VIBRATION_PATTERNS[priority] || VIBRATION_PATTERNS.default),
      actions: data.actions || getDefaultActions(data.type)
    };

    if (data.image) {
      notificationOptions.image = data.image;
    }

    event.waitUntil(
      (async () => {
        await self.registration.showNotification(
          data.title || 'PACT Notification', 
          notificationOptions
        );
        
        const allClients = await clients.matchAll({ includeUncontrolled: true });
        allClients.forEach(client => {
          client.postMessage({
            type: 'PUSH_RECEIVED',
            payload: data
          });
        });
      })()
    );
  } catch (error) {
    console.error('Error showing push notification:', error);
    
    event.waitUntil(
      self.registration.showNotification('PACT Update', {
        body: 'You have a new notification',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-72x72.png'
      })
    );
  }
});

function getDefaultActions(type) {
  switch (type) {
    case 'assignment':
      return [
        { action: 'view', title: 'View Site', icon: '/icons/view.png' },
        { action: 'dismiss', title: 'Dismiss', icon: '/icons/close.png' }
      ];
    case 'approval':
      return [
        { action: 'approve', title: 'Approve', icon: '/icons/check.png' },
        { action: 'view', title: 'Review', icon: '/icons/view.png' }
      ];
    case 'payment':
      return [
        { action: 'view', title: 'View Details', icon: '/icons/view.png' }
      ];
    default:
      return [
        { action: 'view', title: 'View', icon: '/icons/view.png' },
        { action: 'dismiss', title: 'Dismiss', icon: '/icons/close.png' }
      ];
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const action = event.action;
  const data = event.notification.data || {};
  let urlToOpen = data.url || '/';

  if (action === 'dismiss') {
    notifyClients('NOTIFICATION_DISMISSED', data.notificationId);
    return;
  }

  if (action === 'approve' && data.type === 'approval') {
    urlToOpen = `/mmp?action=approve&id=${data.notificationId}`;
  } else if (action === 'view') {
    urlToOpen = data.url || '/notifications';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          await client.focus();
          client.postMessage({
            type: 'NAVIGATE_TO',
            url: urlToOpen,
            notificationId: data.notificationId
          });
          return;
        }
      }
      
      if (clients.openWindow) {
        return clients.openWindow(urlToOpen);
      }
    })
  );
});

self.addEventListener('notificationclose', (event) => {
  const notificationId = event.notification.data?.notificationId;
  if (notificationId) {
    notifyClients('NOTIFICATION_CLOSED', notificationId);
  }
});

async function notifyClients(type, notificationId) {
  const allClients = await clients.matchAll({ includeUncontrolled: true });
  allClients.forEach((client) => {
    client.postMessage({
      type: type,
      notificationId: notificationId
    });
  });
}

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const newSubscription = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: self.vapidPublicKey
        });
        
        const allClients = await clients.matchAll({ includeUncontrolled: true });
        allClients.forEach((client) => {
          client.postMessage({
            type: 'SUBSCRIPTION_CHANGED',
            subscription: newSubscription
          });
        });
      } catch (error) {
        console.error('Failed to resubscribe:', error);
      }
    })()
  );
});

self.addEventListener('message', (event) => {
  if (event.data) {
    switch (event.data.type) {
      case 'SET_VAPID_KEY':
        self.vapidPublicKey = event.data.key;
        break;
      case 'SKIP_WAITING':
        self.skipWaiting();
        break;
      case 'GET_VERSION':
        event.ports[0].postMessage({ version: CACHE_NAME });
        break;
    }
  }
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(OFFLINE_URL);
      })
    );
    return;
  }

  if (event.request.url.includes('/notification.mp3')) {
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      })
    );
    return;
  }

  const isApiRequest = API_CACHE_URLS.some(apiUrl => url.pathname.includes(apiUrl));
  if (isApiRequest && event.request.method === 'GET') {
    event.respondWith(staleWhileRevalidate(event.request, API_CACHE));
    return;
  }

  const isStaticAsset = STATIC_ASSETS.some(asset => url.pathname === asset) ||
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|woff2?)$/);
  if (isStaticAsset) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }
});

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  const fetchPromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  }).catch((error) => {
    console.log('[SW] Network fetch failed, using cache:', error);
    return null;
  });

  if (cachedResponse) {
    fetchPromise.catch(() => {});
    return cachedResponse;
  }

  const networkResponse = await fetchPromise;
  if (networkResponse) {
    return networkResponse;
  }

  return new Response(JSON.stringify({ error: 'Offline', cached: false }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' }
  });
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cachedResponse = await cache.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log('[SW] Cache-first fetch failed:', error);
    return new Response('Offline', { status: 503 });
  }
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-notifications') {
    event.waitUntil(syncNotifications());
  }
});

async function syncNotifications() {
  try {
    const allClients = await clients.matchAll({ includeUncontrolled: true });
    allClients.forEach((client) => {
      client.postMessage({
        type: 'SYNC_NOTIFICATIONS'
      });
    });
  } catch (error) {
    console.error('Failed to sync notifications:', error);
  }
}
