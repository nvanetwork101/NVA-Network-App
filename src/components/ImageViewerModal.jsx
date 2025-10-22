// src/components/ImageViewerModal.jsx

import React from 'react';

const ImageViewerModal = ({ imageUrl, description, onClose }) => {
    if (!imageUrl) {
        return null;
    }

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div 
            className="videoModalOverlay flex justify-center items-center"
            onClick={handleOverlayClick}
        >
            {/* Main modal container - Identical to VideoPlayerModal */}
            <div className="bg-[#1A1A1A] w-full h-full md:max-w-[95vw] md:max-h-[95vh] md:rounded-lg overflow-hidden relative flex flex-col">
                <button 
                    className="closeButton" 
                    onClick={onClose}
                >
                    ×
                </button>
                
                {/* Main black container for media - Identical to VideoPlayerModal */}
                <div className="flex-1 min-h-0 flex justify-center items-center bg-black">
                
                    {/* 
                      THIS IS THE DEFINITIVE FIX: A new sizing container DIV that wraps the image.
                      This perfectly mimics the structure of the working VideoPlayerModal.
                      The outer div is told to be full size, and the inner image is told to 'contain' itself within that full-size boundary.
                    */}
                    <div className="w-full h-full">
                        <img
                            src={imageUrl}
                            alt={description || "Enlarged view"}
                            className="w-full h-full object-contain"
                        />
                    </div>

                </div>
                
                {/* Description panel - Identical to VideoPlayerModal's structure */}
                {description && (
                    <div className="bg-[#1A1A1A] p-3 md:p-4 w-full flex-shrink-0 overflow-y-auto">
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