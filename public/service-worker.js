const CACHE_NAME = 'pact-v4';
const OFFLINE_URL = '/offline.html';
const STATIC_CACHE = 'pact-static-v2';
const API_CACHE = 'pact-api-v2';
const DYNAMIC_CACHE = 'pact-dynamic-v1';

const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/pact-logo-192.png',
  '/pact-logo-512.png',
  '/icons/icon-192x192.png',
  '/icons/icon-72x72.png',
  '/notification.mp3'
];

const API_CACHE_PATTERNS = [
  '/rest/v1/mmp_site_entries',
  '/rest/v1/profiles',
  '/rest/v1/projects',
  '/rest/v1/mmps',
  '/rest/v1/budgets',
  '/rest/v1/wallets',
  '/rest/v1/hubs',
  '/rest/v1/states',
  '/rest/v1/localities',
  '/rest/v1/master_sites',
  '/rest/v1/roles',
  '/rest/v1/notifications',
  '/rest/v1/cost_submissions',
  '/rest/v1/user_roles',
  '/rest/v1/classifications',
];

const SYNC_TAGS = {
  PENDING_ACTIONS: 'sync-pending-actions',
  SITE_VISITS: 'sync-site-visits',
  LOCATIONS: 'sync-locations',
  COST_SUBMISSIONS: 'sync-cost-submissions',
  NOTIFICATIONS: 'sync-notifications',
};

const API_CACHE_MAX_AGE = 5 * 60 * 1000;
const STALE_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

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
  console.log('[SW] Installing service worker v4...');
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
  console.log('[SW] Activating service worker v4...');
  const validCaches = [CACHE_NAME, STATIC_CACHE, API_CACHE, DYNAMIC_CACHE];
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
    const payload = event.data.json();
    const n = payload.notification || {};
    const d = payload.data || payload || {};

    const title = payload.title || n.title || d.title || 'PACT Notification';
    const body = payload.body || n.body || d.body || d.message || '';
    const icon = payload.icon || n.icon || d.icon || '/icons/icon-192x192.png';
    const image = payload.image || n.image || d.image;
    const priority = d.priority || payload.priority || 'default';
    const silent = (d.silent ?? payload.silent) || false;
    const link = (payload.fcmOptions && payload.fcmOptions.link) || (payload.fcm_options && payload.fcm_options.link) || d.url || d.link || '/';
    const type = d.type || payload.type || 'info';
    const category = d.category || payload.category || 'system';
    const tag = d.tag || payload.tag || `pact-${Date.now()}`;

    const notificationOptions = {
      body,
      icon,
      badge: '/icons/icon-72x72.png',
      tag,
      renotify: true,
      requireInteraction: priority === 'urgent',
      silent: !!silent,
      timestamp: d.timestamp || payload.timestamp || Date.now(),
      data: {
        url: link,
        notificationId: d.id || payload.id,
        type,
        priority,
        category,
      },
      vibrate: silent ? VIBRATION_PATTERNS.silent : (VIBRATION_PATTERNS[priority] || VIBRATION_PATTERNS.default),
      actions: d.actions || payload.actions || getDefaultActions(type)
    };

    if (image) {
      notificationOptions.image = image;
    }

    event.waitUntil(
      (async () => {
        await self.registration.showNotification(title, notificationOptions);

        const allClients = await clients.matchAll({ includeUncontrolled: true });
        allClients.forEach(client => {
          client.postMessage({
            type: 'PUSH_RECEIVED',
            payload
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

async function notifyClients(type, notificationId, additionalData = {}) {
  const allClients = await clients.matchAll({ includeUncontrolled: true });
  allClients.forEach((client) => {
    client.postMessage({
      type: type,
      notificationId: notificationId,
      ...additionalData
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
      case 'TRIGGER_SYNC':
        triggerBackgroundSync(event.data.tag || SYNC_TAGS.PENDING_ACTIONS);
        break;
      case 'CLEAR_API_CACHE':
        clearApiCache(event.data.pattern);
        break;
      case 'INVALIDATE_CACHE':
        invalidateCacheEntry(event.data.url);
        break;
      case 'GET_CACHE_STATS':
        getCacheStats().then(stats => {
          if (event.ports && event.ports[0]) {
            event.ports[0].postMessage(stats);
          }
        });
        break;
      case 'PREFETCH_API':
        prefetchApiEndpoints(event.data.urls);
        break;
    }
  }
});

async function triggerBackgroundSync(tag) {
  if ('sync' in self.registration) {
    try {
      await self.registration.sync.register(tag);
      console.log(`[SW] Background sync registered: ${tag}`);
    } catch (error) {
      console.error('[SW] Background sync registration failed:', error);
      notifyClients('SYNC_FALLBACK', null, { tag });
    }
  } else {
    notifyClients('SYNC_FALLBACK', null, { tag });
  }
}

async function clearApiCache(pattern) {
  const cache = await caches.open(API_CACHE);
  const keys = await cache.keys();
  const deletions = keys
    .filter(request => !pattern || request.url.includes(pattern))
    .map(request => cache.delete(request));
  await Promise.all(deletions);
  console.log(`[SW] API cache cleared${pattern ? ` for pattern: ${pattern}` : ''}`);
}

async function invalidateCacheEntry(url) {
  const cacheNames = [API_CACHE, DYNAMIC_CACHE];
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    await cache.delete(url);
  }
  console.log(`[SW] Cache invalidated for: ${url}`);
}

async function getCacheStats() {
  const stats = {
    staticCache: 0,
    apiCache: 0,
    dynamicCache: 0,
    totalSize: 0
  };

  try {
    const staticCache = await caches.open(STATIC_CACHE);
    const staticKeys = await staticCache.keys();
    stats.staticCache = staticKeys.length;

    const apiCache = await caches.open(API_CACHE);
    const apiKeys = await apiCache.keys();
    stats.apiCache = apiKeys.length;

    const dynamicCache = await caches.open(DYNAMIC_CACHE);
    const dynamicKeys = await dynamicCache.keys();
    stats.dynamicCache = dynamicKeys.length;
  } catch (error) {
    console.error('[SW] Error getting cache stats:', error);
  }

  return stats;
}

async function prefetchApiEndpoints(urls) {
  if (!urls || !Array.isArray(urls)) return;
  
  const cache = await caches.open(API_CACHE);
  const fetchPromises = urls.map(async (url) => {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const cacheResponse = response.clone();
        const headers = new Headers(cacheResponse.headers);
        headers.set('sw-cache-timestamp', Date.now().toString());
        
        const body = await cacheResponse.blob();
        const cachedResponse = new Response(body, {
          status: cacheResponse.status,
          statusText: cacheResponse.statusText,
          headers
        });
        await cache.put(url, cachedResponse);
        console.log(`[SW] Prefetched: ${url}`);
      }
    } catch (error) {
      console.log(`[SW] Prefetch failed for: ${url}`, error);
    }
  });

  await Promise.allSettled(fetchPromises);
}

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

  const isApiRequest = API_CACHE_PATTERNS.some(pattern => url.pathname.includes(pattern));
  
  if (isApiRequest && event.request.method === 'GET') {
    event.respondWith(networkFirstWithCache(event.request, API_CACHE));
    return;
  }

  if (isApiRequest && (event.request.method === 'POST' || event.request.method === 'PATCH' || event.request.method === 'DELETE')) {
    event.respondWith(handleMutationRequest(event.request));
    return;
  }

  const isStaticAsset = STATIC_ASSETS.some(asset => url.pathname === asset) ||
    url.pathname.match(/\.(js|css|png|jpg|jpeg|svg|woff2?|ico)$/);
  if (isStaticAsset) {
    event.respondWith(cacheFirst(event.request, STATIC_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(event.request, DYNAMIC_CACHE));
  }
});

async function networkFirstWithCache(request, cacheName) {
  const cache = await caches.open(cacheName);

  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const responseToCache = networkResponse.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-timestamp', Date.now().toString());
      
      const body = await responseToCache.blob();
      const cachedResponse = new Response(body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers
      });
      
      cache.put(request, cachedResponse);
    }
    
    return networkResponse;
  } catch (error) {
    console.log('[SW] Network failed, checking cache:', request.url);
    
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
      const cacheTimestamp = cachedResponse.headers.get('sw-cache-timestamp');
      const cacheAge = cacheTimestamp ? Date.now() - parseInt(cacheTimestamp) : 0;
      
      if (cacheAge < STALE_CACHE_MAX_AGE) {
        console.log('[SW] Returning cached response, age:', Math.round(cacheAge / 1000), 's');
        
        notifyClients('SERVING_FROM_CACHE', null, {
          url: request.url,
          cacheAge: cacheAge
        });
        
        return cachedResponse;
      } else {
        console.log('[SW] Cached response too old, removing');
        await cache.delete(request);
      }
    }
    
    return new Response(JSON.stringify({ 
      error: 'Offline', 
      cached: false,
      message: 'No network connection and no cached data available'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

async function handleMutationRequest(request) {
  try {
    const response = await fetch(request);
    
    if (response.ok) {
      const url = new URL(request.url);
      await clearApiCache(url.pathname.split('?')[0]);
      
      notifyClients('MUTATION_SUCCESS', null, {
        url: request.url,
        method: request.method
      });
    }
    
    return response;
  } catch (error) {
    console.log('[SW] Mutation request failed, queuing for sync:', request.url);
    
    triggerBackgroundSync(SYNC_TAGS.PENDING_ACTIONS);
    
    notifyClients('MUTATION_FAILED', null, {
      url: request.url,
      method: request.method,
      error: error.message,
      syncRegistered: true
    });
    
    return new Response(JSON.stringify({
      error: 'Offline',
      queued: true,
      syncRegistered: true,
      message: 'Request will be retried when online'
    }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

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
  console.log('[SW] Sync event triggered:', event.tag);
  
  switch (event.tag) {
    case SYNC_TAGS.PENDING_ACTIONS:
      event.waitUntil(syncPendingActions());
      break;
    case SYNC_TAGS.SITE_VISITS:
      event.waitUntil(syncSiteVisits());
      break;
    case SYNC_TAGS.LOCATIONS:
      event.waitUntil(syncLocations());
      break;
    case SYNC_TAGS.COST_SUBMISSIONS:
      event.waitUntil(syncCostSubmissions());
      break;
    case SYNC_TAGS.NOTIFICATIONS:
      event.waitUntil(syncNotifications());
      break;
    default:
      console.log('[SW] Unknown sync tag:', event.tag);
  }
});

async function syncPendingActions() {
  console.log('[SW] Starting background sync for pending actions');
  try {
    const allClients = await clients.matchAll({ includeUncontrolled: true });
    
    if (allClients.length > 0) {
      allClients.forEach((client) => {
        client.postMessage({
          type: 'TRIGGER_SYNC_MANAGER',
          syncType: 'all'
        });
      });
      console.log('[SW] Notified clients to trigger sync manager');
    } else {
      console.log('[SW] No clients available for sync');
    }
  } catch (error) {
    console.error('[SW] Failed to sync pending actions:', error);
    throw error;
  }
}

async function syncSiteVisits() {
  console.log('[SW] Starting background sync for site visits');
  try {
    const allClients = await clients.matchAll({ includeUncontrolled: true });
    allClients.forEach((client) => {
      client.postMessage({
        type: 'TRIGGER_SYNC_MANAGER',
        syncType: 'site_visits'
      });
    });
  } catch (error) {
    console.error('[SW] Failed to sync site visits:', error);
    throw error;
  }
}

async function syncLocations() {
  console.log('[SW] Starting background sync for locations');
  try {
    const allClients = await clients.matchAll({ includeUncontrolled: true });
    allClients.forEach((client) => {
      client.postMessage({
        type: 'TRIGGER_SYNC_MANAGER',
        syncType: 'locations'
      });
    });
  } catch (error) {
    console.error('[SW] Failed to sync locations:', error);
    throw error;
  }
}

async function syncCostSubmissions() {
  console.log('[SW] Starting background sync for cost submissions');
  try {
    const allClients = await clients.matchAll({ includeUncontrolled: true });
    allClients.forEach((client) => {
      client.postMessage({
        type: 'TRIGGER_SYNC_MANAGER',
        syncType: 'cost_submissions'
      });
    });
  } catch (error) {
    console.error('[SW] Failed to sync cost submissions:', error);
    throw error;
  }
}

async function syncNotifications() {
  console.log('[SW] Starting background sync for notifications');
  try {
    const allClients = await clients.matchAll({ includeUncontrolled: true });
    allClients.forEach((client) => {
      client.postMessage({
        type: 'SYNC_NOTIFICATIONS'
      });
    });
  } catch (error) {
    console.error('[SW] Failed to sync notifications:', error);
    throw error;
  }
}

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'periodic-sync-data') {
    console.log('[SW] Periodic sync triggered');
    event.waitUntil(performPeriodicSync());
  }
});

async function performPeriodicSync() {
  try {
    const allClients = await clients.matchAll({ includeUncontrolled: true });
    allClients.forEach((client) => {
      client.postMessage({
        type: 'PERIODIC_SYNC',
        timestamp: Date.now()
      });
    });
  } catch (error) {
    console.error('[SW] Periodic sync failed:', error);
  }
}

setInterval(async () => {
  const now = Date.now();
  const cacheNames = [API_CACHE, DYNAMIC_CACHE];
  
  for (const cacheName of cacheNames) {
    try {
      const cache = await caches.open(cacheName);
      const keys = await cache.keys();
      
      for (const request of keys) {
        const response = await cache.match(request);
        if (response) {
          const timestamp = response.headers.get('sw-cache-timestamp');
          if (timestamp) {
            const age = now - parseInt(timestamp);
            if (age > STALE_CACHE_MAX_AGE) {
              await cache.delete(request);
              console.log('[SW] Cleaned stale cache entry:', request.url);
            }
          }
        }
      }
    } catch (error) {
      console.error('[SW] Cache cleanup error:', error);
    }
  }
}, 60 * 60 * 1000);
