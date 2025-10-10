// src/components/CompetitionHomeScreenBanner.jsx

import React, { useState, useEffect } from 'react';
import { db, functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { doc, onSnapshot } from "firebase/firestore";

function CompetitionHomeScreenBanner({ setActiveScreen }) {
    const [competitionId, setCompetitionId] = useState(null);
    const [activeCompetition, setActiveCompetition] = useState(null);
    const [countdown, setCountdown] = useState('');
    const [bannerText, setBannerText] = useState('');

    // EFFECT 1: Listens for the global event that carries ONLY the competition ID.
    useEffect(() => {
        const handleCompetitionUpdate = (event) => {
            // event.detail is now just the ID string (or null)
            setCompetitionId(event.detail); 
        };
        window.addEventListener('competitionUpdated', handleCompetitionUpdate);
        window.dispatchEvent(new CustomEvent('requestCompetitionState')); 
        return () => {
            window.removeEventListener('competitionUpdated', handleCompetitionUpdate);
        };
    }, []);

    // EFFECT 2: Listens for changes to the ID and fetches authoritative data from Firestore.
    useEffect(() => {
        // If there's no ID, there's no competition. Reset everything.
        if (!competitionId) {
            setActiveCompetition(null);
            return;
        }

        // Set up a direct listener to the competition document.
        const unsub = onSnapshot(doc(db, "competitions", competitionId), (docSnap) => {
            if (docSnap.exists()) {
                // This guarantees we always have the freshest, most complete data.
                setActiveCompetition({ id: docSnap.id, ...docSnap.data() });
            } else {
                // If the competition is deleted, reset the state.
                setActiveCompetition(null);
            }
        });

        // Clean up the listener when the ID changes or the component unmounts.
        return () => unsub();

    }, [competitionId]); // This effect runs whenever a new competition ID is received.


    // EFFECT 3: The DEFINITIVE server-synchronized timer logic using pure milliseconds.
    useEffect(() => {
        let timer; 

        if (!activeCompetition) {
            setBannerText('');
            setCountdown('');
            return;
        }

        const startSynchronizedCountdown = async () => {
            try {
                // 1. Get server time and calculate offset
                const getServerTime = httpsCallable(functions, 'getServerTime');
                const result = await getServerTime();
                const serverNowMs = new Date(result.data.serverTime).getTime();
                const clientNowMs = new Date().getTime();
                const timeOffset = serverNowMs - clientNowMs;

                // 2. Start the authoritative timer
                timer = setInterval(() => {
                    // This is the synchronized "now" in pure, timezone-agnostic milliseconds.
                    const nowMs = new Date().getTime() + timeOffset; 
                    
                    // Get all deadlines in pure, timezone-agnostic milliseconds.
                    const entryDeadlineMs = activeCompetition.entryDeadline?.toDate().getTime();
                    const competitionEndMs = activeCompetition.competitionEnd?.toDate().getTime();
                    const resultsRevealTimeMs = activeCompetition.resultsRevealTime?.toDate().getTime();
                    
                    let nextBannerText = '';
                    let nextCountdownText = '';
                    let deadlineMs = null;

                    // This logic now uses 100% reliable numerical comparisons.
                    switch (activeCompetition.status) {
                        case 'Accepting Entries':
                            deadlineMs = entryDeadlineMs;
                            if (deadlineMs && nowMs < deadlineMs) {
                                nextBannerText = "Entries close in";
                            } else {
                                nextBannerText = "Entries are closed";
                                nextCountdownText = "Waiting for voting...";
                            }
                            break;
                        case 'Live Voting':
                            deadlineMs = competitionEndMs;
                            if (deadlineMs && nowMs < deadlineMs) {
                                nextBannerText = "Voting ends in";
                            } else {
                                nextBannerText = "Voting has ended";
                                nextCountdownText = "Waiting for judging...";
                            }
                            break;
                        case 'Judging':
                            deadlineMs = resultsRevealTimeMs;
                            if (deadlineMs && nowMs < deadlineMs) {
                                nextBannerText = "Results revealed in";
                            } else {
                                nextBannerText = "Judging in Progress";
                                nextCountdownText = "Results Soon!";
                            }
                            break;
                        case 'Results Visible':
                            nextBannerText = "Results Are In!";
                            nextCountdownText = "View Now!";
                            break;
                        default:
                            break;
                    }

                    if (deadlineMs && nowMs < deadlineMs) {
                        const distance = deadlineMs - nowMs; // Pure subtraction of numbers
                        const days = Math.floor(distance / (1000 * 60 * 60 * 24));
                        const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                        const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                        const seconds = Math.floor((distance % (1000 * 60)) / 1000);
                        nextCountdownText = `${days}d ${hours}h ${minutes}m ${seconds}s`;
                    }

                    setBannerText(nextBannerText);
                    setCountdown(nextCountdownText);

                }, 1000);

            } catch (error) {
                console.error("Failed to synchronize with server time:", error);
                setBannerText("Error syncing clock");
                setCountdown("");
            }
        };

        startSynchronizedCountdown();

        // 3. Cleanup
        return () => {
            if (timer) {
                clearInterval(timer);
            }
        };
    }, [activeCompetition]);

    if (!activeCompetition) {
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
            <span>{activeCompetition.title}: {bannerText} {countdown}</span>
        </div>
    );
}

export default CompetitionHomeScreenBanner;