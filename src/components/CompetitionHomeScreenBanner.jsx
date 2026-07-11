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
            style={{
                width: '95%',
                maxWidth: '600px',
                background: 'linear-gradient(90deg, #00FFFF 0%, #8A2BE2 100%)',
                color: '#000',
                cursor: 'pointer',
                margin: '10px auto 20px auto',
                padding: '12px 20px',
                borderRadius: '12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: '0 0 20px rgba(0, 255, 255, 0.3)',
                fontWeight: '900',
                fontSize: '14px',
                textTransform: 'uppercase',
                letterSpacing: '1px'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '20px' }}>🏆</span>
                <span>{displayState.title}: {displayState.status}</span>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.1)', padding: '4px 10px', borderRadius: '6px', fontFamily: 'monospace' }}>
                {renderCountdown()}
            </div>
        </div>
    );
}

export default CompetitionHomeScreenBanner;