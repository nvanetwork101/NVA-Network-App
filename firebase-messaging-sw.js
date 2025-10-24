// firebase-messaging-sw.js (in project root)

importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || []);

const firebaseConfig = {
  apiKey: "AIzaSyBo3DM-4ZwrZdzcYQAMWAVHu70vWUdB7J4",
  authDomain: "nvanetworkapp.firebaseapp.com",
  projectId: "nvanetworkapp",
  storageBucket: "nvanetworkapp.firebasestorage.app",
  messagingSenderId: "122220543439",
  appId: "1:122220543439:web:e36ccce435463b7939a6ba",
  measurementId: "G-6RNS6DH3G0"
};

  // --- AGGRESSIVE UPDATE LOGIC ---
// This forces the new service worker to activate as soon as it's finished installing.
self.addEventListener('install', () => {
  self.skipWaiting();
});
// --- END AGGRESSIVE UPDATE ---

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
  // --- HARDENED PUSH HANDLER ---
  // This safety check prevents the service worker from crashing if a malformed
  // push is received (e.g., from the Firebase Console without a title).
  if (!payload.data || !payload.data.title) {
    console.warn("Received a background message without a data payload or title. Ignoring.");
    return;
  }

  const notificationTitle = payload.data.title;
  const notificationOptions = {
    body: payload.data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    data: {
      link: payload.data.link || '/'
    }
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data.link || '/';
  const fullUrl = new URL(link, self.location.origin).href;
  event.waitUntil(clients.openWindow(fullUrl));
});