import { useState, useEffect } from 'react';
import { registerSW } from 'virtual:pwa-register';

export function usePWAUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);

  // This is the update function provided by the PWA library.
  // We will call it later.
  const updateServiceWorker = registerSW({
    onNeedRefresh() {
      setNeedRefresh(true);
    },
  });

  useEffect(() => {
    // This effect runs only when the component mounts.
    // It listens for the 'controllerchange' event, which is the browser's
    // signal that a new service worker has successfully taken control.
    const listener = () => {
      // Once the new worker is in charge, we force a reload.
      window.location.reload();
    };

    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('controllerchange', listener);
    }

    // Cleanup function to remove the listener when the component is unmounted.
    return () => {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('controllerchange', listener);
      }
    };
  }, []); // The empty array ensures this effect runs only once.

  const handleUpdate = () => {
    // When the user clicks the button, we simply tell the service worker
    // to skip waiting. We DO NOT reload here.
    // The 'controllerchange' listener above will handle the reload
    // at the correct time, preventing the race condition.
    updateServiceWorker(true);
  };

  return { needRefresh, handleUpdate };
}