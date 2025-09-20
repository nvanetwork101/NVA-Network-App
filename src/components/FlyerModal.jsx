import React from 'react';

const FlyerModal = ({ imageUrl, onClose }) => {
    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="flyer-modal-overlay" onClick={handleOverlayClick}>
            <div className="flyer-modal-content">
                <img src={imageUrl} alt="Enlarged flyer" className="flyer-modal-image" />
                <button className="closeButton" onClick={onClose}>×</button>
            </div>
        </div>
    );
};

export default FlyerModal;