import React, { useState } from 'react'; // <-- ADD useState
import HeaderLiveButton from './HeaderLiveButton';

const CurrencySelector = ({ currencyRates, selectedCurrency, onCurrencyChange }) => {
    if (!currencyRates) {
        return null;
    }
    const supportedCurrencies = ['USD', 'GYD', 'CAD', 'GBP', 'EUR'];
    const availableCurrencies = supportedCurrencies.filter(c => currencyRates[c]);

    return (
        <select
            value={selectedCurrency}
            onChange={(e) => onCurrencyChange(e.target.value)}
            style={{
                backgroundColor: '#FFD700', color: '#0A0A0A', padding: '8px 12px',
                borderRadius: '25px', border: 'none', fontWeight: '600',
                fontSize: '14px', cursor: 'pointer', boxShadow: '0 4px 5px rgba(0, 0, 0, 0.3)',
                appearance: 'none', textAlign: 'center'
            }}
        >
            {availableCurrencies.map(currency => (
                <option key={currency} value={currency}>
                    {currency}
                </option>
            ))}
        </select>
    );
};

// --- ADD needRefresh and onUpdate to the props ---
function Header({ setActiveScreen, currencyRates, selectedCurrency, onCurrencyChange, isLive, countdownText, onInstallClick, showInstallButton, needRefresh, onUpdate }) {
  const [isUpdating, setIsUpdating] = useState(false);

  const handleUpdateButtonClick = () => {
    setIsUpdating(true);
    onUpdate(); // This now calls the function from App.jsx
  };

  return (
    <div className="header">
      <div className="header-content-left">
        <p className="tagline">Caribbean Content to a Global Stage.</p>
        <p className="headerTitle">NVA Network</p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px' }}>
          {/* The Live Button is untouched and will always show if there's an event */}
          <HeaderLiveButton 
              setActiveScreen={setActiveScreen} 
              isLive={isLive} 
              countdownText={countdownText} 
          />
          
          {/* LOGIC 1: Show the Install button if the app is not installed */}
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

          {/* LOGIC 2: If Install button is hidden AND an update is ready, show the Update button */}
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
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>
              <span>{isUpdating ? 'Updating...' : 'Update App'}</span>
            </button>
          )}
        </div>
      </div>
      <div className="header-right-group">
        <img
          src="https://firebasestorage.googleapis.com/v0/b/nvanetworkapp.firebasestorage.app/o/NVA%20Network%20LOGO%203_BRIGHT%20BG.png?alt=media&token=95b8d741-2fbd-4fc1-af2f-42b95ff20eb1"
          alt="NVA Network Logo"
          className="headerLogo"
        />
        <CurrencySelector 
            currencyRates={currencyRates}
            selectedCurrency={selectedCurrency}
            onCurrencyChange={onCurrencyChange}
        />
      </div>
    </div>
  );
}

export default Header;