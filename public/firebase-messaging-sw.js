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

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

// HANDLER 1: Receive data-only messages and display the notification.
messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received data-only background message: ', payload);

  // THE FIX: Extract title and body from the `data` payload, not the `notification` payload.
  const notificationTitle = payload.data.title;
  const notificationOptions = {
    body: payload.data.body,
    icon: '/icons/icon-192x192.png', // A default icon for the notification
    badge: '/icons/badge-72x72.png', // THE FIX: Add a monochrome badge for the status bar and app icon
    data: {
      link: payload.data.link // Pass the link data through
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