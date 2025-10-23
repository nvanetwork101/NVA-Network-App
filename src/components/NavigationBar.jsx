import React, { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';
import NotificationBell from './NotificationBell';

const NavigationBar = (props) => {
    const { 
        activeScreen, 
        setActiveScreen, 
        currentUser, 
        creatorProfile, 
        showMessage, 
        hasNewFollowerContent, 
        unreadCount,
        unreadChatCount
    } = props;

    const [showMoreMenu, setShowMoreMenu] = useState(false);
    
    return (
        <div className="navigationBar" style={{
            position: 'relative',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            gap: '10px'
        }}>
            {/* --- Home Button --- */}
            <button 
                className="navButton" 
                onClick={() => setActiveScreen('Home')}
                style={{
                    backgroundColor: '#FFD700',
                    border: '1px solid #FFD700',
                    transition: 'box-shadow 0.2s ease-in-out',
                    boxShadow: activeScreen === 'Home' ? '0 0 10px #FFD700' : 'none'
                }}
            >
                <svg height="24px" width="24px" viewBox="0 0 24 24" fill="#0A0A0A">
                    <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
                </svg>
            </button>
            
            {currentUser && currentUser.emailVerified ? (
                <>
                    {/* --- Notifications Button --- */}
                    <NotificationBell count={unreadCount} onClick={() => setActiveScreen('NotificationInbox')} isActive={activeScreen === 'NotificationInbox'} />
                    
                    {/* --- My Feed Button --- */}
                    <button 
                        className="navButton" 
                        onClick={() => setActiveScreen('MyFeed')} 
                        style={{ backgroundColor: '#0A0A0A', border: '1px solid #FFD700', position: 'relative' }}
                    >
                        {hasNewFollowerContent && (
                            <span style={{ position: 'absolute', top: '2px', right: '5px', width: '10px', height: '10px', backgroundColor: '#DC3545', borderRadius: '50%', border: '1px solid #FFF' }}></span>
                        )}
                        <svg height="24px" width="24px" viewBox="0 0 24 24" fill={activeScreen === 'MyFeed' ? '#FFFFFF' : '#FFD700'} style={{ transition: 'fill 0.2s ease-in-out' }}>
                            <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                        </svg>
                    </button>

                    {/* --- Chat Button --- */}
                    <button 
                        className="navButton" 
                        onClick={() => setActiveScreen('ChatList')} 
                        style={{ backgroundColor: '#0A0A0A', border: '1px solid #FFD700', position: 'relative' }}
                    >
                        <svg height="24px" width="24px" viewBox="0 0 24 24" fill={(activeScreen === 'ChatList' || activeScreen === 'ChatMessageScreen') ? '#FFFFFF' : '#FFD700'} style={{ transition: 'fill 0.2s ease-in-out' }}>
                            <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                        </svg>
                        {unreadChatCount > 0 && (
                            <span className="notification-badge" style={{ position: 'absolute', top: '-5px', right: '-5px', backgroundColor: '#DC3545', color: 'white', borderRadius: '50%', width: '20px', height: '20px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #0A0A0A' }}>
                                {unreadChatCount}
                            </span>
                        )}
                    </button>

                    {/* --- Dashboard/Profile Button --- */}
                    <button 
                        className="navButton" 
                        onClick={() => setActiveScreen('CreatorDashboard')}
                        style={{
                            backgroundColor: '#FFD700',
                            border: '1px solid #FFD700',
                            transition: 'box-shadow 0.2s ease-in-out',
                            boxShadow: activeScreen === 'CreatorDashboard' ? '0 0 10px #FFD700' : 'none'
                        }}
                    >
                        <svg height="24px" width="24px" viewBox="0 0 24 24" fill="#0A0A0A">
                            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                        </svg>
                    </button>

                    {/* --- Admin Button (Conditionally Rendered) --- */}
                    {creatorProfile && (creatorProfile.role === 'admin' || creatorProfile.role === 'authority') && (
                        <button className="navButton" onClick={() => setActiveScreen('AdminDashboard')}>
                            <span className={activeScreen === 'AdminDashboard' ? 'activeNavButtonText navButtonText' : 'navButtonText'}>Admin</span>
                        </button>
                    )}
                </>
            ) : (
                <button className="navButton" onClick={() => setActiveScreen('CreatorConnect')}>
                    <span className="navButtonText">Creator Connect</span>
                </button>
            )}

            {/* --- More Button --- */}
            <button 
                className="navButton" 
                onClick={() => setShowMoreMenu(!showMoreMenu)}
                style={{ backgroundColor: '#0A0A0A', border: '1px solid #FFD700' }}
            >
                <svg height="24px" width="24px" viewBox="0 0 24 24" fill="#FFD700">
                    <path d="M6 10c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm12 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm-6 0c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                </svg>
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
                        <>
                            <button className="navButton" style={{width: '100%'}} onClick={() => { setActiveScreen('SupportUsScreen'); setShowMoreMenu(false); }}>
                                <span className="navButtonText">Support Hub</span>
                            </button>
                            <button className="navButton" style={{width: '100%'}} onClick={() => { setActiveScreen('CreatorConnect'); setShowMoreMenu(false); }}>
                                <span className="navButtonText">Creator Connect</span>
                            </button>
                            <button className="navButton" style={{width: '100%'}} onClick={() => { setActiveScreen('Contact'); setShowMoreMenu(false); }}>
                                <span className="navButtonText">Contact</span>
                            </button>
                        </>
                    )}
                
                    <div style={{ borderTop: '1px solid #333', margin: '5px 0' }}></div>
                    
                    <button className="navButton" style={{width: '100%'}} onClick={() => { setActiveScreen('About'); setShowMoreMenu(false); }}>
                        <span className="navButtonText">About</span>
                    </button>
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