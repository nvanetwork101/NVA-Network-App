// public/firebase-messaging-sw.js

// Import the Firebase scripts
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

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

self.addEventListener('install', (event) => {
  console.log('Service worker installing...');
  // Force the waiting service worker to become the active service worker.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service worker activating...');
  // Take control of all clients as soon as the service worker is activated.
  event.waitUntil(clients.claim());
});

// Safely initialize Firebase
// This check prevents the "already exists" error if the script is ever run multiple times.
if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const messaging = firebase.messaging();

// HANDLER 1: SHOW THE NOTIFICATION (This was the part that was accidentally deleted)
// Intercept background messages to construct and display the notification.
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message: ', payload);

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: '/icons/icon-192x192.png', // Default icon
    data: {
      link: payload.data.link // CRITICAL: Pass the link data through
    }
  };

  // Display the notification to the user.
  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// HANDLER 2: HANDLE THE CLICK
// Add a simple, reliable event listener for when a user clicks a notification.
self.addEventListener('notificationclick', (event) => {
  event.notification.close(); // Close the notification drawer

  // Get the link from the data payload, with a fallback to the home page.
  const link = event.notification.data.link || '/';
  const fullUrl = new URL(link, self.location.origin).href;

  // This is the most reliable action: unconditionally open a new window to the correct URL.
  event.waitUntil(clients.openWindow(fullUrl));
});