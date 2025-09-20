// src/components/NotificationToast.jsx
import React, { useEffect, useState } from 'react';

const NotificationToast = ({ notification, onClose }) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        // Mount animation
        setIsVisible(true);

        // Set timer to close
        const timer = setTimeout(() => {
            setIsVisible(false);
            // Allow animation to finish before calling onClose
            setTimeout(onClose, 500);
        }, 6000); // Stays on screen for 6 seconds

        return () => clearTimeout(timer);
    }, [onClose]);

    // Style for the toast container with animation
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

    // Style for the checkmark icon
    const iconStyle = {
        color: '#FFD700',
        marginRight: '15px',
        fontSize: '24px',
        flexShrink: 0,
    };

    // Helper to render the message with highlighted parts
    const renderMessage = () => {
        if (notification.broadcastType === 'DONATION') {
            // Special formatting for donation tickers
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
        // Default message rendering
        return <span>{notification.message}</span>;
    };

    return (
        <div style={toastStyle}>
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