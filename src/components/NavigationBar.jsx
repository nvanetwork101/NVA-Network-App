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
        unreadCount 
    } = props;

    const [showMoreMenu, setShowMoreMenu] = useState(false);
    
    return (
        <div className="navigationBar" style={{ position: 'relative' }}>
            <button className="navButton" onClick={() => setActiveScreen('Home')}>
                <span className={activeScreen === 'Home' ? 'activeNavButtonText navButtonText' : 'navButtonText'}>Home</span>
            </button>
            
            {/* --- THIS IS THE FIX: All user-specific buttons now check for email verification --- */}
            {currentUser && currentUser.emailVerified ? (
                <>
                    <NotificationBell count={unreadCount} onClick={() => setActiveScreen('NotificationInbox')} />
                    
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