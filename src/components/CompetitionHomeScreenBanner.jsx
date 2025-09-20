// src/components/CompetitionHomeScreenBanner.jsx

import React, { useState, useEffect } from 'react';

// This is the final, synchronized version of the banner.
function CompetitionHomeScreenBanner({ setActiveScreen }) {
    // This component now manages its own state, but it's populated by a global event, not a direct DB call.
    const [activeCompetition, setActiveCompetition] = useState(null);
    const [countdown, setCountdown] = useState('');
    const [bannerText, setBannerText] = useState('');

    // EFFECT 1: Listens for the global event broadcast from App.jsx
    useEffect(() => {
        const handleCompetitionUpdate = (event) => {
            setActiveCompetition(event.detail);
        };
        window.addEventListener('competitionUpdated', handleCompetitionUpdate);

        // Request initial state on mount in case the event was missed
        // This is a robust way to handle component mounting after the initial event has fired
        window.dispatchEvent(new CustomEvent('requestCompetitionState')); 

        return () => {
            window.removeEventListener('competitionUpdated', handleCompetitionUpdate);
        };
    }, []);

    // EFFECT 2: The corrected timer logic.
    useEffect(() => {
        if (!activeCompetition) {
            setBannerText('');
            setCountdown('');
            return;
        }

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
    }, [activeCompetition]);

    // If there is no competition, the component renders nothing.
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