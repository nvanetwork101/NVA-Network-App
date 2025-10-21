// public/firebase-messaging-sw.js

// Import Workbox caching library
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');

// Import the Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// This line tells Workbox to manage the entire update lifecycle and caching.
// The manual 'activate' and 'message' listeners have been removed to prevent conflicts.
// The `vite-plugin-pwa` library will handle sending 'SKIP_WAITING' messages automatically.
workbox.precaching.precacheAndRoute(self.__WB_MANIFEST || []);

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBo3DM-4ZwrZdzcYQAMWAVHu70vWUdB7J4",
  authDomain: "nvanetworkapp.firebaseapp.com",
  projectId: "nvanetworkapp",
  storageBucket: "nvanetworkapp.firebasestorage.app",
  messagingSenderId: "122220543439",
  appId: "1:122220543439:web:e36ccce435463b7939a6ba",
  measurementId: "G-6RNS6DH3G0"
};

// Safely initialize Firebase for push notifications.
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const messaging = firebase.messaging();

// HANDLER 1: Show background push notifications. This is application logic and should remain.
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message: ', payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icons/icon-192x192.png',
    data: {
      link: payload.data.link
    }
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// HANDLER 2: Handle the click action on a notification. This is also application logic.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const link = event.notification.data.link || '/';
  const fullUrl = new URL(link, self.location.origin).href;

  event.waitUntil(clients.openWindow(fullUrl));
});