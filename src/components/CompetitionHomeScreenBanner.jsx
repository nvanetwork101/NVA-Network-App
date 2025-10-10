// src/components/CompetitionHomeScreenBanner.jsx

import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
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


    // EFFECT 3: The timer logic. This is now 100% reliable because it's driven by fresh data.
    useEffect(() => {
        if (!activeCompetition) {
            setBannerText('');
            setCountdown('');
            return;
        }

        // The timer will now automatically restart and correct itself whenever activeCompetition changes.
        const interval = setInterval(() => {
            const now = new Date();
            const entryDeadline = activeCompetition.entryDeadline?.toDate();
            const competitionEnd = activeCompetition.competitionEnd?.toDate();
            const resultsRevealTime = activeCompetition.resultsRevealTime?.toDate();
            
            let nextBannerText = '';
            let nextCountdownText = '';
            let deadline = null;

            switch (activeCompetition.status) {
                case 'Accepting Entries':
                    deadline = entryDeadline;
                    if (deadline && now < deadline) {
                        nextBannerText = "Entries close in";
                    } else {
                        nextBannerText = "Entries are closed";
                        nextCountdownText = "Waiting for voting...";
                    }
                    break;
                case 'Live Voting':
                    deadline = competitionEnd;
                    if (deadline && now < deadline) {
                        nextBannerText = "Voting ends in";
                    } else {
                        nextBannerText = "Voting has ended";
                        nextCountdownText = "Waiting for judging...";
                    }
                    break;
                case 'Judging':
                    deadline = resultsRevealTime;
                    if (deadline && now < deadline) {
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

            if (deadline && now < deadline) {
                const distance = deadline - now;
                const days = Math.floor(distance / (1000 * 60 * 60 * 24));
                const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((distance % (1000 * 60)) / 1000);
                nextCountdownText = `${days}d ${hours}h ${minutes}m ${seconds}s`;
            }

            setBannerText(nextBannerText);
            setCountdown(nextCountdownText);

        }, 1000);

        return () => clearInterval(interval);
    }, [activeCompetition]); // This dependency on the fresh data is the key.

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