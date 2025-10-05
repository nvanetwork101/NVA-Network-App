// public/firebase-messaging-sw.js

importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyBo3DM-4ZwrZdzcYQAMWAVHu70vWUdB7J4",
  authDomain: "nvanetworkapp.firebaseapp.com",
  projectId: "nvanetworkapp",
  storageBucket: "nvanetworkapp.firebasestorage.app",
  messagingSenderId: "122220543439",
  appId: "1:122220543439:web:e36ccce435463b7939a6ba",
  measurementId: "G-6RNS6DH3G0"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// The onBackgroundMessage handler is no longer needed. 
// Firebase automatically displays notifications. This prevents duplicates.

// --- THIS IS THE FIX ---
// Add an event listener for when a user clicks on a notification.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  // Get the link from the notification payload.
  const link = event.notification.data.link; // e.g., "/user/123"
  
  if (link) {
    // Construct the full, absolute URL required to open a window.
    const fullUrl = new URL(link, self.location.origin).href;
    
    // This logic finds an already-open app window with the same path and focuses it.
    // If it can't find one, it opens a new window to the correct URL.
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        for (const client of clientList) {
          const clientUrl = new URL(client.url);
          if (clientUrl.pathname === link && 'focus' in client) {
            return client.focus();
          }
        }
        if (clients.openWindow) {
          return clients.openWindow(fullUrl);
        }
      })
    );
  }
});