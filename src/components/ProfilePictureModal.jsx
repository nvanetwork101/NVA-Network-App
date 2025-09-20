// src/components/ProfilePictureModal.jsx

import React from 'react';

const ProfilePictureModal = ({ imageUrl, onClose }) => {
    // Allows closing by clicking the dark overlay
    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="pfpModalOverlay" onClick={handleOverlayClick}>
            <div className="pfpModalContent">
                <img src={imageUrl} alt="Enlarged profile picture" className="pfpModalImage" />
                <button className="closeButton" onClick={onClose}>×</button>
            </div>
        </div>
    );
};

export default ProfilePictureModal;