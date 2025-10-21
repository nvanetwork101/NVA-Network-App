import { useState, useEffect } from 'react';
import { registerSW } from 'virtual:pwa-register';

export function usePWAUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);

  const updateServiceWorker = registerSW({
    onNeedRefresh() {
      setNeedRefresh(true);
    },
  });

  useEffect(() => {
    const listener = () => {
      // The perfect scenario: browser signals it's ready, we reload immediately.
      window.location.reload();
    };

    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('controllerchange', listener);
    }

    return () => {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('controllerchange', listener);
      }
    };
  }, []);

  const handleUpdate = () => {
    // 1. Command the update to start.
    updateServiceWorker(true);

    // 2. THE FAILSAFE: If the 'controllerchange' event above doesn't fire
    // within 3 seconds, force the reload anyway. This prevents stalling.
    setTimeout(() => {
        window.location.reload();
    }, 3000);
  };

  return { needRefresh, handleUpdate };
}