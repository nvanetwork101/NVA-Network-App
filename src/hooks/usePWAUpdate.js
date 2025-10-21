import { useState, useRef } from 'react';
import { registerSW } from 'virtual:pwa-register';

export function usePWAUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  const isUpdateInProgressRef = useRef(false);
  
  const setUpdateState = (updating) => {
    isUpdateInProgressRef.current = updating;
    setIsUpdating(updating);
  };

  const updateServiceWorker = registerSW({
    onNeedRefresh() {
      setNeedRefresh(true);
    },
    onRegisterError(error) {
      console.error('Service Worker registration error:', error);
    }
  });
  
  const handleUpdate = () => {
    setUpdateState(true);

    const fallbackTimeout = setTimeout(() => {
        console.warn('PWA Update: controllerchange event did not fire within 7 seconds. Forcing reload.');
        window.location.reload();
    }, 7000); // Increased to a 7-second delay

    const onControllerChange = () => {
        clearTimeout(fallbackTimeout);
        window.location.reload();
    };

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, { once: true });
    }

    updateServiceWorker();
  };

  return { needRefresh, isUpdating, handleUpdate };
}