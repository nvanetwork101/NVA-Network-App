// src/components/LikesModal.jsx

import React, { useState, useEffect } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

const LikesModal = ({ contentItem, onClose }) => {
    const [likers, setLikers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchLikers = async () => {
            // Assume 'content' type if not specified, for VODs/events it must be 'event'
            const itemType = contentItem.itemType || 'content'; 
            const itemId = contentItem.id;

            if (!itemId) {
                console.error("LikesModal: No content item ID provided.");
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                const functions = getFunctions();
                const getLikedByUsers = httpsCallable(functions, 'getLikedByUsers');
                const response = await getLikedByUsers({ itemId, itemType });
                
                if (response.data.users) {
                    setLikers(response.data.users);
                }
            } catch (error) {
                console.error("Could not load list of likes via Cloud Function.", error);
            } finally {
                setLoading(false);
            }
        };

        fetchLikers();
    }, [contentItem]);

    const handleViewProfile = (userId) => {
        // This global event will be caught by App.jsx to handle the navigation.
        const event = new CustomEvent('navigateToUserProfile', { detail: { userId } });
        window.dispatchEvent(event);
    };
    
    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="likesModalOverlay" onClick={handleOverlayClick}>
            <div className="likesModalContent">
                <div className="likesModalHeader">
                    <p className="likesModalTitle">Liked By</p>
                    <button className="closeButton" onClick={onClose}>×</button>
                </div>
                <div className="likesList">
                    {loading && <p style={{textAlign: 'center'}}>Loading...</p>}
                    {!loading && likers.length === 0 && <p style={{textAlign: 'center'}}>No likes yet.</p>}
                    {likers.map(user => (
                        <div key={user.id} className="likeItem" onClick={() => handleViewProfile(user.id)}>
                            <img src={user.profilePictureUrl || 'https://placehold.co/80x80/555/FFF?text=P'} alt={user.creatorName} className="likeItemPfp" />
                            <p className="likeItemName">{user.creatorName}</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default LikesModal;