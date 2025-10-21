import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import NotificationBell from './NotificationBell'; // This line ensures the correct, separate component is imported

// --- Main NavigationBar Component ---

const NavigationBar = (props) => {
    // Correctly destructure all props received from App.jsx
    const { 
        activeScreen, 
        setActiveScreen, 
        currentUser, 
        creatorProfile, 
        showMessage, 
    hasNewFollowerContent, 
    unreadCount,
    unreadChatCount // <-- ADD THIS LINE
} = props;

const [showMoreMenu, setShowMoreMenu] = useState(false);
    
    return (
        <div className="navigationBar" style={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'center', // This property groups the buttons in the center.
            alignItems: 'center',     // This property prevents vertical stretching.
            gap: '10px'                // This adds a consistent space between each button.
        }}>
            <button 
                className="navButton" 
                onClick={() => setActiveScreen('Home')}
                style={{
                    backgroundColor: '#FFD700',
                    border: '1px solid #FFD700',
                    transition: 'box-shadow 0.2s ease-in-out',
                    // Add a glow effect when the Home screen is active
                    boxShadow: activeScreen === 'Home' ? '0 0 10px #FFD700' : 'none'
                }}
            >
                <svg 
                    height="24px" 
                    width="24px" 
                    viewBox="0 0 24 24" 
                    fill="#0A0A0A" // Black icon color
                >
                    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                </svg>
            </button>
            
            {/* --- THIS IS THE FIX: All user-specific buttons now check for email verification --- */}
            {currentUser && currentUser.emailVerified ? (
                <>
                    <NotificationBell count={unreadCount} onClick={() => setActiveScreen('NotificationInbox')} />
                    
                    <button 
                        className="navButton" 
                        onClick={() => setActiveScreen('ChatList')} 
                        style={{ backgroundColor: '#0A0A0A', border: '1px solid #FFD700', position: 'relative' }}
                    >
                        <svg 
                            height="24px" 
                            width="24px" 
                            viewBox="0 0 24 24" 
                            fill={ (activeScreen === 'ChatList' || activeScreen === 'ChatMessageScreen') ? '#FFFFFF' : '#FFD700' } // Brighter when active
                            style={{ transition: 'fill 0.2s ease-in-out' }}
                        >
                        <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                    </svg>
                    {unreadChatCount > 0 && (
                        // --- THIS IS THE FIX ---
                        // Negative values for top and right push the badge outside the button's boundary.
                        <span className="notification-badge" style={{top: '-8px', right: '-8px'}}>
                            {unreadChatCount}
                        </span>
                    )}
                </button>
                
                <button 
                    className="navButton"
                        onClick={() => setActiveScreen('CreatorConnect')}
                    >
                        <span className="navButtonText">Creator Connect</span>
                    </button>

                    <button 
                        className="navButton" 
                        onClick={() => setActiveScreen('MyFeed')} 
                        style={{ backgroundColor: '#0A0A0A', border: '1px solid #FFD700', position: 'relative' }}
                    >
                        {hasNewFollowerContent && (
                            <span style={{
                                position: 'absolute',
                                top: '2px',
                                right: '5px',
                                width: '10px',
                                height: '10px',
                                backgroundColor: '#DC3545',
                                borderRadius: '50%',
                                border: '1px solid #FFF'
                            }}></span>
                        )}
                        <span className="navButtonText" style={{ color: '#FFD700' }}>My Feed</span>
                    </button>

                    <button className="navButton" onClick={() => setActiveScreen('CreatorDashboard')}>
                        <span className={activeScreen === 'CreatorDashboard' ? 'activeNavButtonText navButtonText' : 'navButtonText'}>Dashboard</span>
                    </button>
                    
                    {creatorProfile && (creatorProfile.role === 'admin' || creatorProfile.role === 'authority') && (
                        <button className="navButton" onClick={() => setActiveScreen('AdminDashboard')}>
                            <span className={activeScreen === 'AdminDashboard' ? 'activeNavButtonText navButtonText' : 'navButtonText'}>Admin</span>
                        </button>
                    )}
                </>
            ) : (
                // If not verified, only show the public Creator Connect button
                <button 
                    className="navButton" 
                    onClick={() => setActiveScreen('CreatorConnect')}
                >
                    <span className="navButtonText">Creator Connect</span>
                </button>
            )}
            {/* --- END OF FIX --- */}

            <button className="navButton" onClick={() => setShowMoreMenu(!showMoreMenu)}>
                <span className="navButtonText">More</span>
            </button>

            {showMoreMenu && (
                <div style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 5px)',
                    right: '15px',
                    backgroundColor: '#1A1A1A',
                    borderRadius: '10px',
                    boxShadow: '0 -2px 10px rgba(0,0,0,0.5)',
                    border: '1px solid #333',
                    zIndex: 1100,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '5px',
                    padding: '10px'
                }}>
                    {currentUser && currentUser.emailVerified && (
                        <button className="navButton" style={{width: '100%'}} onClick={() => { setActiveScreen('SupportUsScreen'); setShowMoreMenu(false); }}>
                            <span className="navButtonText">Support Hub</span>
                        </button>
                    )}
                    <button className="navButton" style={{width: '100%'}} onClick={() => { setActiveScreen('About'); setShowMoreMenu(false); }}>
                        <span className="navButtonText">About</span>
                    </button>
                    <button className="navButton" style={{width: '100%'}} onClick={() => { setActiveScreen('Contact'); setShowMoreMenu(false); }}>
                        <span className="navButtonText">Contact</span>
                    </button>
                
                    <div style={{ borderTop: '1px solid #333', margin: '5px 0' }}></div>
                    <button className="navButton" style={{width: '100%'}} onClick={() => { setActiveScreen('PrivacyPolicy'); setShowMoreMenu(false); }}>
                        <span className="navButtonText">Privacy Policy</span>
                    </button>
                    <button className="navButton" style={{width: '100%'}} onClick={() => { setActiveScreen('TermsOfService'); setShowMoreMenu(false); }}>
                        <span className="navButtonText">Terms of Service</span>
                    </button>
                
                </div>
            )}
        </div>
    );
};

export default NavigationBar;