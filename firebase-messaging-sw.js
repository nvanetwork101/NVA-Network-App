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

// --- THIS IS THE DEFINITIVE FIX ---
messaging.onBackgroundMessage((payload) => {
  // When the app is in the background, FCM places all data, including the
  // title and body, inside the `payload.data` object. We must read from there.
  const notificationTitle = payload.data.title;
  const notificationOptions = {
    body: payload.data.body,
    icon: '/icons/icon-192x192.png',
    badge: '/icons/badge-72x72.png',
    data: {
      link: payload.data.link || '/'
    }
  };

  // This now passes a valid title and body, which will produce a correct, audible notification.
  return self.registration.showNotification(notificationTitle, notificationOptions);
});
// --- END OF FIX ---

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data.link || '/';
  const fullUrl = new URL(link, self.location.origin).href;
  event.waitUntil(clients.openWindow(fullUrl));
});