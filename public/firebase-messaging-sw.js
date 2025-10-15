// Add an event listener for when a user clicks on a notification.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const link = event.notification.data.link || '/';
  const fullUrl = new URL(link, self.location.origin).href;

  // This more robust logic attempts to find an existing window,
  // but guarantees opening a new one if focusing fails.
  event.waitUntil(
    clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    }).then((windowClients) => {
      let matchingClient = null;
      for (const client of windowClients) {
        const clientUrl = new URL(client.url);
        if (clientUrl.href === fullUrl || clientUrl.pathname === link) {
          matchingClient = client;
          break;
        }
      }

      if (matchingClient) {
        return matchingClient.focus();
      } else {
        return clients.openWindow(fullUrl);
      }
    })
  );
});