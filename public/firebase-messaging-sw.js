// public/firebase-messaging-sw.js

// Import Workbox caching library
importScripts('https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js');

// Import the Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// This line is the placeholder that vite-plugin-pwa will replace with the file manifest.
workbox.precaching.precacheAndRoute(self.__WB_MANIFEST);

// --- START: PWA PROMPT MODE LISTENERS ---
// These listeners are required by the `registerType: 'prompt'` configuration in vite.config.js.

// This listener waits for the message from our `usePWAUpdate.js` hook.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    // This command tells the new service worker to stop waiting and begin activating.
    self.skipWaiting();
  }
});

// This listener fires once the worker begins activating.
self.addEventListener('activate', (event) => {
  // This command tells the service worker to take immediate control of all open
  // application tabs, which is crucial for the update to apply seamlessly.
  event.waitUntil(self.clients.claim());
});
// --- END: PWA PROMPT MODE LISTENERS ---


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

// HANDLER 1: Show background push notifications. This is application logic and must remain.
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