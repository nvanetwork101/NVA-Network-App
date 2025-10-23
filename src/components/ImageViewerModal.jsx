// src/components/ImageViewerModal.jsx

import React from 'react';

const ImageViewerModal = ({ imageUrl, description, onClose }) => {
    if (!imageUrl) {
        return null;
    }

    return (
        <div 
            className="videoModalOverlay" // This MUST have centering styles (display: flex)
            onClick={(e) => {
                if (e.target === e.currentTarget) {
                    onClose();
                }
            }}
        >
            <div className="bg-[#1A1A1A] w-full h-full md:max-w-[90vw] md:max-h-[90vh] md:rounded-lg overflow-hidden relative flex flex-col p-4">
                <button 
                    className="closeButton" 
                    onClick={onClose}
                    style={{ zIndex: 10 }}
                >
                    ×
                </button>
                
                {/* This container grows to fill all available space in the modal */}
                <div className="flex-1 min-h-0 grid place-items-center bg-black rounded-lg">
                    {/*
                      THE DEFINITIVE FIX IS HERE:
                      - 'w-full' and 'h-full' command the image to STRETCH and fill this container.
                      - 'object-contain' commands the stretched image to MAINTAIN ITS ASPECT RATIO without cropping.
                      This solves both problems: shrinking large images and stretching small ones.
                    */}
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