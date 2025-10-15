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

// HANDLER 1: Receive data-only messages and display the notification.
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received data-only background message: ', payload);

  // THE FIX: Extract title and body from the `data` payload.
  const notificationTitle = payload.data.title;
  const notificationOptions = {
    body: payload.data.body,
    icon: '/icons/icon-192x192.png', 
    badge: '/icons/badge-72x72.png', // THE FIX: Adds the badge for app icon
    data: {
      link: payload.data.link 
    }
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// HANDLER 2: This is the one part that was working correctly.
// It handles the click and opens the app to the correct link.
self.addEventListener('notificationclick', (event) => {
  event.notification.close(); 

  const link = event.notification.data.link || '/';
  const fullUrl = new URL(link, self.location.origin).href;

  event.waitUntil(clients.openWindow(fullUrl));
});