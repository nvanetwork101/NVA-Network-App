// src/components/EnlargedPhotoViewer.jsx

import React, { useEffect, useRef } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import CompetitionLikeButton from './CompetitionLikeButton'; // We'll reuse the like button here

// This helper should eventually be moved to a shared utils.js file
const extractVideoInfo = (url) => {
    if (!url || typeof url !== 'string') {
        return { embedUrl: null, isVertical: false };
    }
    const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/ ]{11})/;
    const youtubeMatch = url.match(youtubeRegex);
    if (youtubeMatch && youtubeMatch[1]) {
        return {
            embedUrl: `https://www.youtube.com/embed/${youtubeMatch[1]}`,
            isVertical: url.includes('/shorts/')
        };
    }
    // Add other platform regex here if needed (Vimeo, TikTok, etc.)
    return { embedUrl: null, isVertical: false };
};


function EnlargedPhotoViewer({ competition, entry, currentUser, showMessage, onClose }) {
    const viewCountedRef = useRef(false);

    // Effect to count a "view" after a delay
    useEffect(() => {
        if (competition.competitionType !== 'Video' || !currentUser) return;
        if (currentUser.uid === entry.userId) return; // Don't count self-views

        const timer = setTimeout(() => {
            if (viewCountedRef.current) return;
            viewCountedRef.current = true;
            const viewFunction = httpsCallable(functions, 'incrementCompetitionView');
            viewFunction({ competitionId: competition.id, entryId: entry.id })
                .catch(err => console.error("Failed to increment view count:", err.message));
        }, 10000); // Count view after 10 seconds

        return () => clearTimeout(timer);
    }, [competition, entry, currentUser]);

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const { embedUrl, isVertical } = extractVideoInfo(entry.submissionUrl);

    let contentElement;
    if (competition.competitionType === 'Photo') {
        contentElement = <img src={entry.photoUrl} alt={entry.title} className="pfpModalImage" />;
    } else if (competition.competitionType === 'Video') {
        contentElement = (
            <div className={`videoIframeContainer ${isVertical ? 'vertical' : ''}`}>
                <iframe
                    src={embedUrl ? `${embedUrl}?autoplay=1` : entry.submissionUrl}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                    title={entry.title}
                ></iframe>
            </div>
        );
    } else { // 'External' type
        contentElement = (
             <div style={{textAlign: 'center', padding: '20px'}}>
                <p className="heading">External Link</p>
                <p className="subHeading">Click the button below to visit the submission.</p>
                <a href={entry.submissionUrl} target="_blank" rel="noopener noreferrer" className="button">
                    <span className="buttonText">Visit Link</span>
                </a>
            </div>
        );
    }

    return (
        <div className="videoModalOverlay" onClick={handleOverlayClick}>
            <div className={`videoModalContent ${isVertical ? 'vertical' : ''}`}>
                <button className="closeButton" onClick={onClose}>×</button>
                {contentElement}
                <div style={{ position: 'absolute', bottom: '20px', right: '15px' }}>
                    <CompetitionLikeButton 
                        competition={competition}
                        entry={entry}
                        currentUser={currentUser}
                        showMessage={showMessage}
                    />
                </div>
            </div>
        </div>
    );
}

export default EnlargedPhotoViewer;