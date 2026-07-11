import React, { useState } from 'react';
import HeaderLiveButton from './HeaderLiveButton';

function Header({ setActiveScreen, isLive, countdownText, onInstallClick, showInstallButton, needRefresh, onUpdate, currentUser, onLogout }) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateButtonClick = () => {
    setIsUpdating(true);
    onUpdate();
  };

  return (
    <div className="header" style={{ position: 'relative', display: 'flex', alignItems: 'center', minHeight: '95px', paddingRight: '100px', boxSizing: 'border-box' }}>
      <div className="header-content-left" style={{ flex: 1, minWidth: 0 }}>
        <p className="tagline">Caribbean Content to a Global Stage.</p>
        <p className="headerTitle">NVA Network</p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
          {/* The Live Button is untouched */}
          <HeaderLiveButton 
              setActiveScreen={setActiveScreen} 
              isLive={isLive} 
              countdownText={countdownText} 
          />
          
          {/* Show the Install button if the app is not installed */}
          {showInstallButton && (
            <button
              onClick={onInstallClick}
              style={{
                backgroundColor: '#FFD700', color: '#0A0A0A', border: 'none',
                borderRadius: '20px', padding: '8px 16px', fontWeight: 'bold',
                cursor: 'pointer', fontSize: '14px', display: 'flex',
                alignItems: 'center', gap: '8px'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <span>Install App</span>
            </button>
          )}

          {/* If Install button is hidden AND an update is ready, show the Update button */}
          {!showInstallButton && needRefresh && (
            <button
              onClick={handleUpdateButtonClick}
              disabled={isUpdating}
              style={{
                backgroundColor: '#FFD700', color: '#0A0A0A', border: 'none',
                borderRadius: '20px', padding: '8px 16px', fontWeight: 'bold',
                cursor: 'pointer', fontSize: '14px', display: 'flex',
                alignItems: 'center', gap: '8px'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"></path></svg>
              <span>{isUpdating ? 'Updating...' : 'Update App'}</span>
            </button>
          )}
        </div>
      </div>
      
      {/* ABSOLUTE PINNED CONTROLS TO NEVER SQUISH OR DROP OUT OF HEADER CONTAINER */}
      <div className="header-right-group" style={{ position: 'absolute', right: '15px', top: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', zIndex: 10 }}>
        <img
          src="https://firebasestorage.googleapis.com/v0/b/nvanetworkapp.firebasestorage.app/o/NVA%20Network%20LOGO%203_BRIGHT%20BG.png?alt=media&token=95b8d741-2fbd-4fc1-af2f-42b95ff20eb1"
          alt="NVA Network Logo"
          className="headerLogo"
          style={{ width: '76px', height: 'auto', objectFit: 'contain' }}
        />
        {currentUser ? (
          <button
            onClick={onLogout}
            style={{
              backgroundColor: '#FFD700', color: '#0A0A0A', padding: '5px 15px',
              borderRadius: '25px', border: 'none', fontWeight: 'bold',
              fontSize: '12px', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.4)',
              textAlign: 'center', whiteSpace: 'nowrap'
            }}
          >
            Exit
          </button>
        ) : (
          <button
            onClick={() => setActiveScreen('Login')}
            style={{
              backgroundColor: 'transparent', color: '#00FFFF', padding: '4px 14px',
              borderRadius: '25px', border: '2px solid #00FFFF', fontWeight: 'bold',
              fontSize: '12px', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0, 0, 0, 0.4)',
              textAlign: 'center', whiteSpace: 'nowrap'
            }}
          >
            Login
          </button>
        )}
      </div>
    </div>
  );
}

export default Header;