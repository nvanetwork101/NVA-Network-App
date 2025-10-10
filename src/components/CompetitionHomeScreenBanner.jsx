// src/components/CompetitionHomeScreenBanner.jsx

import React, { useState, useEffect } from 'react';
import Countdown from 'react-countdown';
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


   // EFFECT 3: The DEFINITIVE server-synchronized timer logic.
    useEffect(() => {
        let timer;
        if (!activeCompetition) {
            setBannerText('');
            setCountdown('');
            return;
        }

        const startSynchronizedCountdown = async () => {
            try {
                const getServerTime = httpsCallable(functions, 'getServerTime');
                const result = await getServerTime();
                const timeOffset = new Date(result.data.serverTime).getTime() - new Date().getTime();

                timer = setInterval(() => {
                    const nowMs = new Date().getTime() + timeOffset;
                    const entryDeadlineMs = activeCompetition.entryDeadline?.toDate().getTime();
                    const competitionEndMs = activeCompetition.competitionEnd?.toDate().getTime();
                    
                    let nextBannerText = '';
                    let deadlineMs = null;

                    switch (activeCompetition.status) {
                        case 'Accepting Entries':
                            deadlineMs = entryDeadlineMs;
                            nextBannerText = nowMs < deadlineMs ? "Entries close in" : "Entries are closed";
                            break;
                        case 'Live Voting':
                            deadlineMs = competitionEndMs;
                            nextBannerText = nowMs < deadlineMs ? "Voting ends in" : "Voting has ended";
                            break;
                        case 'Judging':
                            nextBannerText = "Judging in Progress";
                            break;
                        case 'Results Visible':
                            nextBannerText = "Results Are In!";
                            break;
                        default:
                            nextBannerText = "Competition status is pending.";
                            break;
                    }

                    if (deadlineMs && nowMs < deadlineMs) {
                        const distance = deadlineMs - nowMs;
                        const renderer = ({ days, hours, minutes, seconds }) => `${days}d ${hours}h ${minutes}m ${seconds}s`;
                        setCountdown(<Countdown date={Date.now() + distance} renderer={renderer} />);
                    } else {
                         setCountdown(activeCompetition.status === 'Accepting Entries' ? "Waiting for voting..." : "Waiting for judging...");
                    }
                    setBannerText(nextBannerText);
                }, 1000);
            } catch (error) {
                console.error("Failed to synchronize with server time:", error);
                setBannerText("Error syncing clock");
            }
        };

        startSynchronizedCountdown();
        return () => { if (timer) clearInterval(timer); };
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