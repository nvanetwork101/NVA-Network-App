// src/components/ImageViewerModal.jsx

import React from 'react';

const ImageViewerModal = ({ imageUrl, description, onClose }) => {
    if (!imageUrl) {
        return null;
    }

    return (
        <div 
            className="videoModalOverlay" // Reuse existing styles for consistency
            onClick={(e) => {
                // Close the modal if the overlay (background) is clicked
                if (e.target === e.currentTarget) {
                    onClose();
                }
            }}
        >
            <div className="bg-[#1A1A1A] w-full h-full md:max-w-[90vw] md:max-h-[90vh] md:rounded-lg overflow-hidden relative flex flex-col p-4">
                <button 
                    className="closeButton" 
                    onClick={onClose}
                    style={{ zIndex: 10 }} // Ensure it's on top
                >
                    ×
                </button>
                
                {/* Image container that grows to fill space */}
                <div className="flex-1 min-h-0 flex justify-center items-center bg-black rounded-lg">
                    <img
                        src={imageUrl}
                        alt="Promotional Content"
                        className="w-full h-full object-contain"
                    />
                </div>
                
                {/* Description container */}
                {description && (
                    <div className="w-full flex-shrink-0 pt-3 overflow-y-auto">
                        <p className="m-0 text-base text-[#DDDDDD] leading-normal whitespace-pre-wrap">
                            {description}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ImageViewerModal;