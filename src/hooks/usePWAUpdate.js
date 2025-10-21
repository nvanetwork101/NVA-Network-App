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
  
  // This is the function called when the user clicks the "Update" button.
  const handleUpdate = () => {
    // 1. Set the state to "updating". This shows "Updating..." in the UI.
    setUpdateState(true);

    // 2. Add a fallback timer. This is the critical change.
    // If the `controllerchange` event fails to fire (which is the source of the stall),
    // this timer will forcefully reload the page after 3 seconds, guaranteeing the
    // user gets the updated version of the application.
    const fallbackTimeout = setTimeout(() => {
        console.warn('PWA Update: controllerchange event did not fire within 3 seconds. Forcing reload.');
        window.location.reload();
    }, 3000); // 3-second delay

    // 3. Set up a one-time, highly-reliable listener for the successful update.
    // We do this here instead of relying on the useEffect listener to avoid any
    // potential race conditions or stale closures.
    const onControllerChange = () => {
        // When the event fires, clear the fallback timer and reload immediately.
        clearTimeout(fallbackTimeout);
        window.location.reload();
    };

    // Register the listener just before we trigger the update.
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, { once: true });
    }

    // 4. Call the function from registerSW. This sends the "SKIP_WAITING"
    //    message to the new service worker in the background.
    updateServiceWorker();
  };

  return { needRefresh, isUpdating, handleUpdate };
}