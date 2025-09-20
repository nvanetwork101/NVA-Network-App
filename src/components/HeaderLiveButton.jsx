// src/components/HeaderLiveButton.jsx

import React from 'react';

function HeaderLiveButton({ setActiveScreen, isLive, countdownText }) {
    // This component no longer has its own state or timers.
    // It receives everything it needs as props from App.jsx.

    if (!countdownText) {
        return null; // The component is invisible if there's no countdown text.
    }

    const bannerClass = isLive ? 'header-live-button live' : 'header-live-button countdown';
    const icon = isLive ? '🔴' : '⏳';
    const text = isLive ? `Live Premieres: ${countdownText}` : `Live Premieres In: ${countdownText}`;

    return (
        <div className={bannerClass} onClick={() => setActiveScreen('Discover')}>
            <span>{icon}</span>
            <span>{text}</span>
        </div>
    );
}

export default HeaderLiveButton;