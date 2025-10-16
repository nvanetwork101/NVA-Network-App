// src/components/NotificationToast.jsx
import React, { useEffect, useState } from 'react';

// FIX 1: Accept setActiveScreen as a prop for navigation
const NotificationToast = ({ notification, onClose, setActiveScreen }) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        setIsVisible(true);
        const timer = setTimeout(() => {
            setIsVisible(false);
            setTimeout(onClose, 500);
        }, 6000);
        return () => clearTimeout(timer);
    }, [onClose]);

    // FIX 2: Create a new handler for clicks that checks for a link
    const handleToastClick = () => {
        // Check if there's a link and a navigation function
        if (notification.link && setActiveScreen) {
            // Parse the link to get the screen name (e.g., "/MyListings" -> "MyListings")
            const screenName = notification.link.startsWith('/')
                ? notification.link.substring(1)
                : notification.link;
            
            // Perform navigation if a valid screen name is found
            if (screenName) {
                setActiveScreen(screenName);
            }
        }
        // Close the toast regardless of navigation
        setIsVisible(false);
        setTimeout(onClose, 500);
    };

    const toastStyle = {
        position: 'fixed',
        bottom: '20px',
        left: '20px',
        backgroundColor: 'rgba(10, 10, 10, 0.9)',
        color: '#FFFFFF',
        padding: '15px 20px',
        borderRadius: '12px',
        border: '1px solid #FFD700',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        zIndex: 2000,
        maxWidth: '350px',
        transform: isVisible ? 'translateY(0)' : 'translateY(50px)',
        opacity: isVisible ? 1 : 0,
        transition: 'transform 0.5s ease-out, opacity 0.5s ease-out',
    };

    const iconStyle = {
        color: '#FFD700',
        marginRight: '15px',
        fontSize: '24px',
        flexShrink: 0,
    };

    const renderMessage = () => {
        if (notification.broadcastType === 'DONATION') {
            return (
                <span>
                    <strong style={{ color: '#FFD700' }}>{notification.userName}</strong>
                    {' just donated '}
                    <strong style={{ color: '#FFD700' }}>${notification.amount.toFixed(2)}</strong>
                    {' to "'}
                    <strong style={{ color: '#FFD700' }}>{notification.targetCampaignTitle}</strong>
                    {'".'}
                </span>
            );
        }
        return <span>{notification.message || notification.title}</span>;
    };

    return (
        <div 
            style={{...toastStyle, cursor: 'pointer'}} 
            onClick={handleToastClick} // FIX 3: Use the new, smarter handler
            title={notification.link ? "Click to view" : "Click to dismiss"} // Dynamic title
        >
            <div style={iconStyle}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                </svg>
            </div>
            <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.4' }}>{renderMessage()}</p>
        </div>
    );
};

export default NotificationToast;