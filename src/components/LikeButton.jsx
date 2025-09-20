// src/components/LikeButton.jsx

import React, { useState, useEffect } from 'react';
import { db, functions, httpsCallable, doc, onSnapshot } from '../firebase';

// Accept the new itemType prop
function LikeButton({ contentItem, currentUser, showMessage, itemType }) {
    const [isLiked, setIsLiked] = useState(false);
    const [likeCount, setLikeCount] = useState(contentItem.likeCount || 0);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    // CORRECTED: This now matches your application's actual App ID.
    const appId = "production-app-id"; 
    const contentDocId = contentItem.originalContentId || contentItem.id;

    useEffect(() => {
        if (!currentUser || !contentDocId) {
            setIsLoading(false);
            return;
        }

        let basePath;
        if (itemType === 'event') {
            basePath = `events/${contentDocId}`;
        } else {
            basePath = `artifacts/${appId}/public/data/content_items/${contentDocId}`;
        }

        // Listener for the user's specific like on this item (now with dynamic path)
        const likeRef = doc(db, `${basePath}/likes`, currentUser.uid);
        const unsubscribeLike = onSnapshot(likeRef, (docSnap) => {
            setIsLiked(docSnap.exists());
            setIsLoading(false);
        });

        // Listener for the total like count on the item (now with dynamic path)
        const contentRef = doc(db, basePath);
        const unsubscribeContent = onSnapshot(contentRef, (docSnap) => {
            if (docSnap.exists()) {
                setLikeCount(docSnap.data().likeCount || 0);
            }
        });

        return () => {
            unsubscribeLike();
            unsubscribeContent();
        };
    }, [contentDocId, currentUser, appId, itemType]); // Add itemType to dependency array

    const handleLike = async (e) => {
        e.stopPropagation(); // Prevent the click from bubbling up to the parent card
        if (!currentUser) {
            showMessage("Please log in to like content.");
            return;
        }
        if (isLoading || isProcessing) return;

        setIsProcessing(true);
        const newLikedState = !isLiked;
        
        // Optimistic UI update for immediate feedback
        setIsLiked(newLikedState);
        setLikeCount(prevCount => newLikedState ? prevCount + 1 : prevCount - 1);

        try {
            const updateLikeFunction = httpsCallable(functions, 'updateLikeCount');
            // Pass the dynamic itemId and itemType to the updated function.
            await updateLikeFunction({ itemId: contentDocId, itemType: itemType, isLiking: newLikedState });
        } catch (error) {
            showMessage("An error occurred. Please try again.");
            // Revert UI on failure
            setIsLiked(!newLikedState);
            setLikeCount(prevCount => newLikedState ? prevCount - 1 : prevCount + 1);
        } finally {
            setIsProcessing(false);
        }
    };

    const heartIconPath = "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

    return (
        // CORRECTED: Styles updated to work inside a flex container.
        <button
            onClick={handleLike}
            disabled={isLoading || isProcessing}
            style={{
                backgroundColor: 'rgba(10, 10, 10, 0.7)',
                border: '1px solid #FFD700',
                borderRadius: '50px',
                width: 'auto',
                minWidth: '32px',
                height: '32px',
                padding: '0 5px 0 10px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                gap: '4px',
                transition: 'transform 0.2s'
            }}
        >
            <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px', fill: isLiked ? '#FFD700' : '#FFF' }}>
                <path d={heartIconPath}></path>
            </svg>
            <div 
                onClick={(e) => {
                    e.stopPropagation();
                    if (likeCount > 0) {
                         const event = new CustomEvent('openLikesModal', { detail: { contentItem } });
                         window.dispatchEvent(event);
                    } else {
                        showMessage("No likes to display yet.");
                    }
                }}
                title="View who liked this"
                style={{ padding: '0 5px', cursor: likeCount > 0 ? 'pointer' : 'default' }}
            >
                <span style={{ color: '#FFF', fontSize: '12px', fontWeight: 'bold' }}>{likeCount}</span>
            </div>
        </button>
    );
}

export default LikeButton;