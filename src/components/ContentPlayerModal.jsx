// src/components/ContentPlayerModal.jsx

import React from 'react';

const ContentPlayerModal = ({ mediaUrl, description, onClose }) => {
    if (!mediaUrl) {
        return null;
    }

    const handleOverlayClick = (e) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const isVideo = mediaUrl.match(/\.(mp4|webm|mov)$/i);

    return (
        <div 
            className="videoModalOverlay"
            onClick={handleOverlayClick}
        >
            <div className="bg-[#1A1A1A] w-full h-full md:max-w-[90vw] md:max-h-[90vh] md:rounded-lg overflow-hidden relative flex flex-col p-4">
                
                <button 
                    className="closeButton" 
                    onClick={onClose}
                    style={{ zIndex: 10 }}
                >
                    ×
                </button>
                
                {/* 1. THE MEDIA CONTAINER */}
                <div className="flex-1 min-h-0 grid place-items-center bg-black rounded-lg">
                    {isVideo ? (
                        <video controls className="w-full h-full object-contain">
                            <source src={mediaUrl} type="video/mp4" />
                            Your browser does not support the video tag.
                        </video>
                    ) : (
                        <div 
                            style={{
                                width: '100%',
                                height: '100%',
                                backgroundImage: `url(${mediaUrl})`,
                                backgroundSize: 'contain',
                                backgroundPosition: 'center',
                                backgroundRepeat: 'no-repeat'
                            }}
                            aria-label={description || "Enlarged content"}
                        ></div>
                    )}
                </div>
                
                {/* 2. THE DESCRIPTION SECTION */}
                {description && (
                    <div className="flex-shrink-0 pt-3 overflow-y-auto border-t border-gray-700 mt-3" style={{ maxHeight: '100px' }}>
                        <p className="m-0 text-base text-[#DDDDDD] leading-normal whitespace-pre-wrap">
                            {description}
                        </p>
                    </div>
                )}

                {/* 3. THE ACTION & INFO BAR has been completely removed as requested. */}

            </div>
        </div>
    );
};

export default ContentPlayerModal;