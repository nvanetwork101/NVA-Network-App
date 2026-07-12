// firebase-messaging-sw.js (in project root)

importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Bulletproof cache cleanup of old versions
workbox.precaching.cleanupOutdatedCaches();

// Store the single reference to satisfy Workbox's strict rules
const precacheList = self.__WB_MANIFEST || [];
workbox.precaching.precacheAndRoute(precacheList);

// --- SPA NAVIGATION FALLBACK (Fixes Facebook/External Link Loading) ---
// This tells the Service Worker to serve index.html for any unknown route (like /content/123)
// FIX: We check if index.html is actually cached before registering the route.
// This prevents the "Uncaught non-precached-url" error during Development.
const isIndexCached = precacheList.some(entry => entry.url === 'index.html' || entry.url === '/index.html');

if (isIndexCached) {
  const handler = workbox.precaching.createHandlerBoundToURL('index.html');
  const navigationRoute = new workbox.routing.NavigationRoute(handler, {
    denylist: [
      /^\/_/,             // Exclude URLs starting with _ (Firebase internal)
      /\/[^/?]+\.[^/]+$/, // Exclude URLs with file extensions (images, css, js)
    ],
  });
  workbox.routing.registerRoute(navigationRoute);
}
// ---------------------------------------------------------------------

const firebaseConfig = {
  apiKey: "AIzaSyBo3DM-4ZwrZdzcYQAMWAVHu70vWUdB7J4",
  authDomain: "nvanetworkapp.firebaseapp.com",
  projectId: "nvanetworkapp",
  storageBucket: "nvanetworkapp.firebasestorage.app",
  messagingSenderId: "122220543439",
  appId: "1:122220543439:web:e36ccce435463b7939a6ba",
  measurementId: "G-6RNS6DH3G0"
};

  // AGGRESSIVE UPDATE REMOVED: Managed by React UI to prevent reload loops [1]

self.addEventListener('install', (event) => {
  // REMOVED self.skipWaiting(); 
  // It now safely enters the "waiting" state so your Update UI triggers properly.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== workbox.core.cacheNames.precache && cacheName !== workbox.core.cacheNames.runtime) {
            return caches.delete(cacheName); // Clears all orphaned/dust cache from old builds
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Background message received:', payload);

  if (!payload.data || !payload.data.title) {
    console.error('[SW] Payload is missing data or title. Cannot display notification.');
    return;
  }

  const notificationTitle = payload.data.title;
  const notificationOptions = {
    body: payload.data.body,
    icon: '/icon-192x192.png',
    data: {
      link: payload.data.link || '/'
    }
  };

  console.log('[SW] Attempting to show notification with title:', notificationTitle);

  const notificationPromise = self.registration.showNotification(notificationTitle, notificationOptions);
  
  notificationPromise.catch(error => {
    console.error('[SW] Error showing notification:', error);
  });

  return notificationPromise;
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data.link || '/';
  const fullUrl = new URL(link, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // 1. If a window is already open on this exact link, focus it
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === fullUrl && 'focus' in client) {
          return client.focus();
        }
      }
      // 2. Otherwise, navigate any open window of our site to the new path and focus it
      if (windowClients.length > 0) {
        const client = windowClients[0];
        if ('navigate' in client) {
          client.navigate(fullUrl);
        }
        if ('focus' in client) {
          return client.focus();
        }
      }
      // 3. Fallback: If no tabs are open, spawn a new window
      if (clients.openWindow) {
        return clients.openWindow(fullUrl);
      }
    })
  );
});