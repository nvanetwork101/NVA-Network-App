// Add a simpler, more reliable event listener for notification clicks.
self.addEventListener('notificationclick', (event) => {
  event.notification.close(); // Close the notification

  // Get the link from the data payload, with a fallback to the home page.
  const link = event.notification.data.link || '/';
  const fullUrl = new URL(link, self.location.origin).href;

  // This is the most reliable action: unconditionally open a new window.
  // This avoids the complexities of trying to find and focus an existing tab.
  event.waitUntil(clients.openWindow(fullUrl));
});