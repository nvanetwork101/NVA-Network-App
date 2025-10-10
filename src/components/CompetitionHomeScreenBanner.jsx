// src/components/CompetitionHomeScreenBanner.jsx

import React, { useState, useEffect } from 'react';
import Countdown from 'react-countdown';
import { db } from '../firebase';
import { doc, onSnapshot } from "firebase/firestore";

function CompetitionHomeScreenBanner({ setActiveScreen }) {
    const [displayState, setDisplayState] = useState(null);

    // This single effect listens to the server-authoritative state and does nothing else.
    useEffect(() => {
        const displayStateRef = doc(db, "settings", "competitionDisplayState");
        const unsubscribe = onSnapshot(displayStateRef, (docSnap) => {
            if (docSnap.exists() && docSnap.data().isActive) {
                setDisplayState(docSnap.data());
            } else {
                setDisplayState(null); // Hides banner if no active competition or error state.
            }
        });
        // Cleanup listener on component unmount.
        return () => unsubscribe();
    }, []); // Runs only once.

    // Renders the countdown timer based on the authoritative target from the server.
    const renderCountdown = () => {
        if (!displayState || !displayState.countdownTarget) {
            // Handle statuses that do not have a countdown.
            if (displayState?.status === 'Accepting Entries') return "Waiting for voting...";
            if (displayState?.status === 'Live Voting') return "Waiting for judging...";
            return null;
        }

        const targetTime = displayState.countdownTarget.toDate();
        const renderer = ({ days, hours, minutes, seconds, completed }) => {
            if (completed) {
                // Fallback text while waiting for the next 1-minute server update.
                return displayState.status === 'Accepting Entries' ? "Entries are closed" : "Voting has ended";
            }
            return `${days}d ${hours}h ${minutes}m ${seconds}s`;
        };

        return <Countdown date={targetTime} renderer={renderer} />;
    };

    // If there is no active competition state, render nothing.
    if (!displayState) {
        return null;
    }

    return (
        <div
            onClick={() => setActiveScreen('CompetitionScreen')}
            className="header-live-button"
            style={{
                width: 'auto',
                maxWidth: '400px',
                backgroundColor: 'rgba(0, 255, 255, 0.8)',
                color: '#0A0A0A',
                cursor: 'pointer',
                justifyContent: 'center',
                margin: '0 auto 15px auto'
            }}
        >
            <span>🏆</span>
            {/* The entire display is now driven by the pre-calculated server state */}
            <span>{displayState.title}: {displayState.displayMessage} {renderCountdown()}</span>
        </div>
    );
}

export default CompetitionHomeScreenBanner;