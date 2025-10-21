import { useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export function usePWAUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);

  // The registerSW function returns a function to trigger the update.
  // We don't need to call it until the user clicks the button.
  const updateServiceWorker = registerSW({
    onNeedRefresh() {
      // This is called when a new service worker is waiting.
      setNeedRefresh(true);
    },
    onRegisterError(error) {
      console.error('Service Worker registration error:', error);
    }
  });

  // This is the new, more reliable update handler.
  const handleUpdate = () => {
    // We create a temporary, one-time listener that will trigger the reload.
    const reloadOnUpdate = () => {
      // IMPORTANT: We must remove the listener to prevent it from ever
      // firing again accidentally on a future controller change.
      if (navigator.serviceWorker) {
          navigator.serviceWorker.removeEventListener('controllerchange', reloadOnUpdate);
      }
      window.location.reload();
    };

    // We attach this listener right before we ask the service worker to update.
    // This guarantees we will catch the event.
    if (navigator.serviceWorker) {
        navigator.serviceWorker.addEventListener('controllerchange', reloadOnUpdate);
    }
    
    // Now, tell the new service worker to take over.
    updateServiceWorker();
  };

  return { needRefresh, handleUpdate };
}