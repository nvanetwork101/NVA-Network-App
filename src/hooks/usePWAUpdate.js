import { useState, useEffect, useRef } from 'react'; // <-- ADD useRef
import { registerSW } from 'virtual:pwa-register';

export function usePWAUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  
  // This ref will act as a flag to ensure we only reload when we mean to.
  const isUpdateInProgress = useRef(false);

  // The registerSW function from the PWA library
  const updateServiceWorker = registerSW({
    onNeedRefresh() {
      // This is called when a new service worker is waiting.
      setNeedRefresh(true);
    },
    onRegisterError(error) {
      // Added for robust error handling
      console.error('Service Worker registration error:', error);
    }
  });

  useEffect(() => {
    // This listener waits for the browser to confirm a new SW has taken control.
    const controllerChangeListener = () => {
      // We only reload if our flag is true, preventing accidental reloads.
      if (isUpdateInProgress.current) {
        window.location.reload();
      }
    };

    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('controllerchange', controllerChangeListener);
    }

    // Cleanup the listener on component unmount
    return () => {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('controllerchange', controllerChangeListener);
      }
    };
  }, []); // The empty array ensures this effect runs only once.

  const handleUpdate = () => {
    // Step 1: Set our flag so the listener knows to act.
    isUpdateInProgress.current = true;
    
    // Step 2: Tell the new service worker to take over.
    // We don't need to pass `true` because our listener is handling the reload.
    updateServiceWorker(); 
  };

  return { needRefresh, handleUpdate };
}