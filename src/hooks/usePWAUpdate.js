import { useState, useEffect, useRef } from 'react';
import { registerSW } from 'virtual:pwa-register';

export function usePWAUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);

  const updateServiceWorker = useRef(null);
  const isUpdateInProgress = useRef(false);

  // This effect sets up the core listeners for PWA updates.
  useEffect(() => {
    updateServiceWorker.current = registerSW({
      onNeedRefresh() {
        // This fires when a new version is downloaded, prompting the user.
        setNeedRefresh(true);
      },
      onRegisterError(error) {
        console.error('Service Worker registration error:', error);
      }
    });

    // This listener waits for the new service worker to take control.
    const handleControllerChange = () => {
      if (isUpdateInProgress.current) {
        window.location.reload();
      }
    };

    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    }

    // Cleanup the listener on unmount.
    return () => {
      if (navigator.serviceWorker) {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      }
    };
  }, []);

  // --- NEW: Automatic update on tab hide ---
  // This effect adds the automatic update functionality.
  useEffect(() => {
    const handleVisibilityChange = () => {
      // Check if an update is available AND the page is now hidden.
      if (document.visibilityState === 'hidden' && needRefresh) {
        // If so, trigger the same update logic as the manual button.
        // This will apply the update in the background.
        if (updateServiceWorker.current) {
          isUpdateInProgress.current = true;
          updateServiceWorker.current(true);
        }
      }
    };

    // Add the event listener.
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Clean up the event listener when the component unmounts.
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // This effect depends on `needRefresh` to ensure it only runs when an update is ready.
  }, [needRefresh]);

  // This function is called by the "Update App" button for manual updates.
  const handleUpdate = () => {
    if (updateServiceWorker.current) {
      isUpdateInProgress.current = true;
      updateServiceWorker.current(true);

      // This is the failsafe timeout. If the 'controllerchange' event fails,
      // this will force a reload after 5 seconds to prevent a stuck UI.
      setTimeout(() => {
        console.log("PWA Update Failsafe: Forcing reload.");
        window.location.reload();
      }, 5000);
    }
  };

  return { needRefresh, handleUpdate };
}