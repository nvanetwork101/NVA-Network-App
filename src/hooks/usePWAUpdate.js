import { useState, useEffect } from 'react';
// THIS IS THE GUARANTEED-TO-WORK IMPORT
import { registerSW } from 'virtual:pwa-register';

export function usePWAUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);

  const updateServiceWorker = registerSW({
    onNeedRefresh() {
      // This function is called by the service worker when an update is found.
      setNeedRefresh(true);
    },
    onOfflineReady() {
      // You could add logic here for when the app is ready to work offline.
    }
  });

  const handleUpdate = () => {
    // This closes the prompt and triggers the actual update and page reload.
    setNeedRefresh(false);
    updateServiceWorker(true);
  };

  return { needRefresh, handleUpdate };
}