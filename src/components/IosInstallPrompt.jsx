import React from 'react';

// This component provides the installation instructions for iOS users.
const IosInstallPrompt = ({ onClose }) => {
    // This is the SVG path for the iOS "Share" icon (box with an arrow).
    const shareIconPath = "M12 4v10M12 4l3 3M12 4L9 7m9 5v5c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2v-5";

    return (
        <div style={{
            position: 'fixed',
            bottom: '70px', // Positioned above the navigation bar
            left: '50%',
            transform: 'translateX(-50%)',
            width: 'calc(100% - 30px)',
            maxWidth: '450px',
            backgroundColor: '#2A2A2A',
            color: '#FFFFFF',
            borderRadius: '12px',
            padding: '15px',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.5)',
            border: '1px solid #444',
            zIndex: 2000,
            display: 'flex',
            alignItems: 'center',
            gap: '15px'
        }}>
            <div style={{ flexShrink: 0 }}>
                <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#00FFFF"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                >
                    <path d={shareIconPath} />
                </svg>
            </div>
            <div style={{ flexGrow: 1, fontSize: '14px', lineHeight: '1.4' }}>
                To install the app, tap the <strong>Share</strong> button and then select <strong>'Add to Home Screen'</strong>.
            </div>
            <button
                onClick={onClose}
                style={{
                    background: 'none',
                    border: 'none',
                    color: '#888',
                    fontSize: '24px',
                    cursor: 'pointer',
                    padding: '0 5px'
                }}
                aria-label="Close install prompt"
            >
                &times;
            </button>
        </div>
    );
};

export default IosInstallPrompt;