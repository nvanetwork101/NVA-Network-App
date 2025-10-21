import { useState, useEffect, useRef } from 'react';
import { registerSW } from 'virtual:pwa-register';

export function usePWAUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);

  // Use a ref to hold the update function from the PWA library.
  const updateServiceWorker = useRef(null);
  
  // Use a ref as a flag to indicate that a user-initiated update is in progress.
  const isUpdateInProgress = useRef(false);

  // This effect runs once on mount to set up all the PWA event listeners.
  useEffect(() => {
    // registerSW returns a function that we can call to trigger the update.
    updateServiceWorker.current = registerSW({
      onNeedRefresh() {
        // This callback fires when a new service worker is downloaded and waiting.
        setNeedRefresh(true);
      },
      onRegisterError(error) {
        console.error('Service Worker registration error:', error);
      }
    });

    // THE DEFINITIVE FIX: Listen for the browser's native 'controllerchange' event.
    // This event fires ONLY when a new service worker has successfully taken control of the page.
    const handleControllerChange = () => {
      // We only reload the page if we know it was our button click that started the update.
      if (isUpdateInProgress.current) {
        window.location.reload();
      }
    };

    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    }

    // Cleanup function to remove the event listener when the component unmounts.
    return () => {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      }
    };
  }, []); // The empty dependency array ensures this setup runs only once.

  // This is the function called by the "Update App" button in the Header.
  const handleUpdate = () => {
    if (updateServiceWorker.current) {
      // Step 1: Set our flag to true. The controllerchange listener is now armed.
      isUpdateInProgress.current = true;
      
      // Step 2: Call the library's update function. This sends the 'SKIP_WAITING'
      // message to the service worker, which then activates and takes control.
      // The page does NOT reload here.
      updateServiceWorker.current(true);
    }
  };

  // The Header component manages its own "isUpdating" text state.
  // We only need to provide the trigger state and the update function.
  return { needRefresh, handleUpdate };
}