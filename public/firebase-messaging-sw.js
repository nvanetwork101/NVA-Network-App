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

  // THIS IS THE CORRECT PATH TO THE LINK DATA
  const link = event.notification.data.link;
  
  if (link) {
    event.waitUntil(clients.openWindow(link));
  }
});