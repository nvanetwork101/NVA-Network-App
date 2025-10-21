import { useState, useEffect, useRef } from 'react';
import { registerSW } from 'virtual:pwa-register';

export function usePWAUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);

  const updateServiceWorker = useRef(null);
  const isUpdateInProgress = useRef(false);

  useEffect(() => {
    updateServiceWorker.current = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onRegisterError(error) {
        console.error('Service Worker registration error:', error);
      }
    });

    const handleControllerChange = () => {
      if (isUpdateInProgress.current) {
        window.location.reload();
      }
    };

    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    }

    return () => {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      }
    };
  }, []);

  const handleUpdate = () => {
    if (updateServiceWorker.current) {
      isUpdateInProgress.current = true;
      updateServiceWorker.current(true);

      // --- THIS IS THE FIX: A failsafe timeout ---
      // If the 'controllerchange' event fails to fire for any reason,
      // this will force a reload after 5 seconds, preventing a permanently stuck UI.
      setTimeout(() => {
        console.log("PWA Update Failsafe: Forcing reload.");
        window.location.reload();
      }, 5000);
    }
  };

  return { needRefresh, handleUpdate };
}