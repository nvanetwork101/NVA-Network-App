// src/components/NotificationBell.jsx
import React from 'react';

const NotificationBell = ({ count, onClick }) => {
    return (
        <button className="navButton" onClick={onClick} style={{ position: 'relative', backgroundColor: '#0A0A0A', border: '1px solid #FFD700' }}>
            <span className="navButtonText" style={{ color: '#FFD700' }}>
                <svg viewBox="0 0 24 24" style={{ width: '24px', height: '24px', fill: 'currentColor' }}>
                    <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
                </svg>
            </span>
            {count > 0 && (
                <div style={{
                    position: 'absolute',
                    top: '-5px',
                    right: '-5px',
                    backgroundColor: '#DC3545',
                    color: '#FFF',
                    borderRadius: '50%',
                    width: '20px',
                    height: '20px',
                    display: 'flex',
                    justifyContent: 'center',
                    alignItems: 'center',
                    fontSize: '12px',
                    fontWeight: 'bold'
                }}>
                    {count}
                </div>
            )}
        </button>
    );
};

export default NotificationBell;