// src/components/CompetitionLikeButton.jsx

import React, { useState, useEffect } from 'react';
import { db, functions } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

function CompetitionLikeButton({ competition, entry, currentUser, showMessage }) {
    const [isLiked, setIsLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(entry.likeCount || 0);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (!currentUser) {
            setIsLoading(false);
            return;
        }
        // Listener for the user's specific like on this entry
        const likeRef = doc(db, `competitions/${competition.id}/entries/${entry.id}/likes`, currentUser.uid);
        const unsubscribeLike = onSnapshot(likeRef, (docSnap) => {
            setIsLiked(docSnap.exists());
            setIsLoading(false);
        });

        // Listener for the total like count on the entry document itself
        const entryRef = doc(db, `competitions/${competition.id}/entries/${entry.id}`);
        const unsubscribeEntry = onSnapshot(entryRef, (docSnap) => {
            if (docSnap.exists()) {
                setLikeCount(docSnap.data().likeCount || 0);
            }
        });

        return () => {
            unsubscribeLike();
            unsubscribeEntry();
        };
    }, [competition.id, entry.id, currentUser]);

    const handleLike = async (e) => {
        e.stopPropagation(); // Prevent modal from opening if button is inside a clickable card
        if (!currentUser) {
            showMessage("Please log in to vote for entries.");
            return;
        }
        if (isLoading || isProcessing) return;

        setIsProcessing(true);
        const newLikedState = !isLiked;
        
        // Optimistic UI update for instant feedback
        setIsLiked(newLikedState);
        setLikeCount(prev => newLikedState ? prev + 1 : prev - 1);

        try {
            const likeFunction = httpsCallable(functions, 'incrementCompetitionLike');
            await likeFunction({
                competitionId: competition.id,
                entryId: entry.id,
                isLiking: newLikedState
            });
        } catch (error) {
            showMessage(`Error: ${error.message}`);
            // Revert UI on failure
            setIsLiked(!newLikedState);
            setLikeCount(prev => newLikedState ? prev - 1 : prev + 1);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <button
            onClick={handleLike}
            disabled={isLoading || isProcessing}
            style={{
                background: 'rgba(10, 10, 10, 0.7)',
                border: '1px solid #00FFFF',
                borderRadius: '50px',
                padding: '0 10px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer'
            }}
        >
            <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px', fill: isLiked ? '#00FFFF' : '#FFF' }}>
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path>
            </svg>
            <span style={{ color: '#FFF', fontSize: '12px', fontWeight: 'bold' }}>{likeCount}</span>
        </button>
    );
}

export default CompetitionLikeButton;