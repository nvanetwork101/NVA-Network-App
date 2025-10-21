import { useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export function usePWAUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false); // Added for "Updating..." text

  // The registerSW function from the PWA library returns its own update function.
  const updateServiceWorker = registerSW({
    onNeedRefresh() {
      setNeedRefresh(true);
    },
    onRegisterError(error) {
      console.error('Service Worker registration error:', error);
    }
  });

  // This is now the definitive, one-line fix for the update loop.
  const handleUpdate = () => {
    setIsUpdating(true); // Visually confirm the update has started.
    
    // By passing `true` to the library's own update function, we are telling it:
    // "Take care of everything. Tell the service worker to skip waiting, activate,
    // and then perform a graceful reload yourself, only after you have reset
    // your internal state." This prevents the update loop.
    updateServiceWorker(true);
  };

  return { needRefresh, isUpdating, handleUpdate };
}