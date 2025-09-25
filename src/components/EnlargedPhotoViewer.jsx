// src/components/EnlargedPhotoViewer.jsx

import React, { useEffect, useRef, useMemo } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import CompetitionLikeButton from './CompetitionLikeButton';

// THE FIX: Use the more robust video info extractor.
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

function EnlargedPhotoViewer({ competition, entry, currentUser, showMessage, onClose }) {
    const viewCountedRef = useRef(false);

    // Memoize derived state for performance.
    const isPhoto = useMemo(() => competition.competitionType === 'Photo', [competition.competitionType]);
    const { embedUrl, isVertical } = useMemo(() => isPhoto ? {} : extractVideoInfo(entry.submissionUrl), [isPhoto, entry.submissionUrl]);

    // Effect to count a "view" after a delay (no changes needed here).
    useEffect(() => {
        if (isPhoto || !currentUser || currentUser.uid === entry.userId) return;
        const timer = setTimeout(() => {
            if (viewCountedRef.current) return;
            viewCountedRef.current = true;
            const viewFunction = httpsCallable(functions, 'incrementCompetitionView');
            viewFunction({ competitionId: competition.id, entryId: entry.id })
                .catch(err => console.error("Failed to increment view count:", err.message));
        }, 10000);
        return () => clearTimeout(timer);
    }, [competition, entry, currentUser, isPhoto]);

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    // THE FIX: A complete replacement of the render logic with a robust, proven structure.
    return (
        <div className="videoModalOverlay flex justify-center items-center" onClick={handleOverlayClick}>
            <div className={`bg-[#1A1A1A] w-full h-full md:max-w-[95vw] md:max-h-[95vh] md:rounded-lg overflow-hidden relative flex flex-col ${isVertical ? 'md:h-[90vh]' : 'md:w-[90vw]'}`}>
                <button className="closeButton" onClick={onClose}>×</button>
                
                {/* Main content area that centers the media */}
                <div className="flex-1 min-h-0 flex justify-center items-center bg-black">
                    {isPhoto ? (
                        // High-quality photo viewer
                        <img 
                            src={entry.photoUrl} 
                            alt={entry.title} 
                            className="max-w-full max-h-full object-contain" 
                        />
                    ) : (
                        // High-quality video viewer with correct aspect ratio
                        <div className={`w-full h-full md:w-auto md:h-auto ${isVertical ? 'aspect-[9/16]' : 'aspect-video'}`}>
                            <iframe
                                src={embedUrl}
                                className="w-full h-full border-none"
                                allow="autoplay; encrypted-media"
                                allowFullScreen
                                title={entry.title}
                            />
                        </div>
                    )}
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

export default EnlargedPhotoViewer;