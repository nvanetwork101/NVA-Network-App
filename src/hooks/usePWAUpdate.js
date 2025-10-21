// This is the function called when the user clicks the "Update" button.
  const handleUpdate = () => {
    // 1. Set the state to "updating". This shows "Updating..." in the UI.
    setUpdateState(true);

    // 2. Add a fallback timer. This is the critical change.
    // We've increased the delay to 7 seconds to give the service worker ample time to
    // activate. If it succeeds, the `onControllerChange` listener will fire and reload early.
    // If it gets stuck, this timer guarantees a reload, solving the "multiple click" issue.
    const fallbackTimeout = setTimeout(() => {
        console.warn('PWA Update: controllerchange event did not fire within 7 seconds. Forcing reload.');
        window.location.reload();
    }, 7000); // Increased to a 7-second delay

    // 3. Set up a one-time, highly-reliable listener for the successful update.
    // This will ideally fire before the timeout, providing a faster update experience.
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