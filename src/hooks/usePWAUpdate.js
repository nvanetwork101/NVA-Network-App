import { useState, useEffect, useRef } from 'react';
import { registerSW } from 'virtual:pwa-register';

export function usePWAUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // A ref is used to track the update state. This prevents the event listener
  // from having a "stale" reference to the `isUpdating` state.
  const isUpdateInProgressRef = useRef(false);
  
  // By setting the state, we also immediately update the ref.
  const setUpdateState = (updating) => {
    isUpdateInProgressRef.current = updating;
    setIsUpdating(updating);
  };

  // The registerSW function is configured once. The `updateServiceWorker` function
  // it returns is what we'll call when the user clicks the button.
  const updateServiceWorker = registerSW({
    onNeedRefresh() {
      // This is called when a new service worker is downloaded and waiting.
      // We set needRefresh to true to show the "Update" button in the UI.
      setNeedRefresh(true);
    },
    onRegisterError(error) {
      console.error('Service Worker registration error:', error);
    }
  });

  // This effect sets up a PERSISTENT listener for the `controllerchange` event.
  // It runs only once when the hook is first mounted.
  useEffect(() => {
    const handleControllerChange = () => {
      // This event fires when a new service worker takes control.
      // We check our ref to see if this change was triggered by our update process.
      if (isUpdateInProgressRef.current) {
        // If it was, we perform the reload to complete the update.
        window.location.reload();
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);
    }

    // Cleanup: remove the event listener when the component unmounts.
    return () => {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      }
    };
  }, []); // The empty dependency array ensures this runs only once.

  // This is the function called when the user clicks the "Update" button.
  const handleUpdate = () => {
    // 1. Set the state to "updating". This shows "Updating..." in the UI.
    setUpdateState(true);
    // 2. Call the function from registerSW. This sends the "SKIP_WAITING"
    //    message to the new service worker in the background.
    // The persistent listener will now handle the reload automatically.
    updateServiceWorker();
  };

  return { needRefresh, isUpdating, handleUpdate };
}