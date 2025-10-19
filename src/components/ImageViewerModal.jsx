// src/components/ImageViewerModal.jsx

import React from 'react';

const ImageViewerModal = ({ imageUrl, description, itemId, itemType, showMessage, onClose }) => {
    if (!imageUrl) {
        return null;
    }

    // Fallback URL assumes Promoted Status if itemType is not correctly passed.
    const calculatedItemType = itemType || 'promotedStatus';
    const shareUrl = `${window.location.origin}/${calculatedItemType}/${itemId}`;

    const fallbackCopy = () => {
        navigator.clipboard.writeText(shareUrl).then(() => {
            showMessage("Link copied to clipboard!");
            onClose();
        }).catch(err => {
            console.error('Could not copy text: ', err);
            showMessage("Failed to copy link. Please copy from the address bar.");
        });
    };

    const handleShare = async () => {
        // Validation check to prevent sharing a broken URL
        if (!itemId) {
            showMessage("Cannot share: Missing content ID.");
            return;
        }

        if (navigator.share) {
            try {
                await navigator.share({
                    title: description || "Promoted Content from NVA Network",
                    text: description || "Check out this ad on NVA Network!",
                    url: shareUrl,
                });
                onClose();
            } catch (error) {
                // If native share fails (e.g., user cancels, or not on a supported platform), fall back
                // We only call fallbackCopy() if the error is not a user abort error
                if (error.name !== 'AbortError') {
                    fallbackCopy();
                }
            }
        } else {
            // If native share is not available, use the clipboard fallback
            fallbackCopy();
        }
    };

    // The button should only be disabled if the necessary share data is missing
    const isShareDisabled = !itemId;

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
                {/* Header with Close and Share Button */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexShrink: 0 }}>
                    <button 
                        className="button"
                        onClick={handleShare}
                        disabled={isShareDisabled}
                        style={{ padding: '5px 15px', backgroundColor: '#00FFFF', color: '#0A0A0A', borderRadius: '5px', fontWeight: 'bold', opacity: isShareDisabled ? 0.5 : 1 }}
                    >
                        Share Ad
                    </button>
                    <button 
                        className="closeButton" 
                        onClick={onClose}
                        style={{ zIndex: 10, position: 'relative' }} 
                    >
                        ×
                    </button>
                </div>
                
                {/* Scrollable Content Area */}
                <div className="flex-1 min-h-0 overflow-y-auto">
                    {/* Square Image container */}
                    <div className="w-full aspect-square flex justify-center items-center bg-black rounded-lg">
                        <img
                            src={imageUrl}
                            alt="Promotional Content"
                            className="max-w-full max-h-full object-contain"
                        />
                    </div>

                    {/* Description container */}
                    {description && (
                        <div className="w-full pt-3">
                            <p className="m-0 text-base text-[#DDDDDD] leading-normal whitespace-pre-wrap">
                                {description}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ImageViewerModal;