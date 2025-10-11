// src/components/CompetitionVideoViewer.jsx

import React, { useMemo } from 'react';
import CompetitionLikeButton from './CompetitionLikeButton';

// Utility to get the correct embed URL and aspect ratio
const extractVideoInfo = (url) => {
    if (!url || typeof url !== 'string') return { embedUrl: null, isVertical: false };
    const ytShortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (ytShortsMatch) {
        return { embedUrl: `https://www.youtube.com/embed/${ytShortsMatch[1]}?autoplay=1&rel=0`, isVertical: true };
    }
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/);
    if (ytMatch) {
        return { embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0`, isVertical: false };
    }
    const tiktokMatch = url.match(/tiktok\.com\/.*\/video\/(\d+)/);
    if (tiktokMatch) {
        return { embedUrl: `https://www.tiktok.com/embed/v2/${tiktokMatch[1]}`, isVertical: true };
    }
    return { embedUrl: url, isVertical: false };
};

function CompetitionVideoViewer({ competition, entry, currentUser, showMessage, onClose }) {
    // Memoize derived state for performance
    const { embedUrl, isVertical } = useMemo(() => extractVideoInfo(entry.submissionUrl), [entry.submissionUrl]);

    // Close the modal if the overlay is clicked, but not the content inside
    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="videoModalOverlay flex justify-center items-center" onClick={handleOverlayClick}>
            <div className="bg-[#1A1A1A] w-full h-full md:max-w-[95vw] md:max-h-[95vh] md:rounded-lg overflow-hidden relative flex flex-col">
                <button className="closeButton" onClick={onClose}>×</button>
                
                {/* Main content area that centers the video */}
                <div className="flex-1 min-h-0 flex justify-center items-center bg-black">
                    {/* This is the proven video container that handles aspect ratios correctly */}
                    <div className={isVertical ? 'h-full aspect-[9/16]' : 'max-w-full max-h-full w-full aspect-video'}>
                        <iframe
                            src={embedUrl}
                            className="w-full h-full border-none"
                            allow="autoplay; encrypted-media"
                            allowFullScreen
                            title={entry.title}
                        />
                    </div>
                </div>

                {/* Info and actions panel at the bottom */}
                <div className="bg-[#1A1A1A] p-3 md:p-4 w-full flex-shrink-0 flex justify-between items-center gap-4">
                    <div>
                        <h2 className="m-0 text-lg text-white font-semibold leading-tight">{entry.title}</h2>
                        <p className="m-0 text-sm text-gray-400">by {entry.userName}</p>
                    </div>
                    {/* Like button is only visible during the Live Voting stage */}
                    {competition.status === 'Live Voting' && (
                        <CompetitionLikeButton 
                            competition={competition}
                            entry={entry}
                            currentUser={currentUser}
                            showMessage={showMessage}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

export default CompetitionVideoViewer;