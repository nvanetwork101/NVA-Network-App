import React from 'react';
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

function Header({ setActiveScreen, currencyRates, selectedCurrency, onCurrencyChange, isLive, countdownText, onInstallClick, showInstallButton }) {
  return (
    <div className="header">
      <div className="header-content-left">
        <p className="tagline">Caribbean Content to a Global Stage.</p>
        <p className="headerTitle">NVA Network</p>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '10px' }}>
          <HeaderLiveButton 
              setActiveScreen={setActiveScreen} 
              isLive={isLive} 
              countdownText={countdownText} 
          />
          {showInstallButton && (
            <button
              onClick={onInstallClick}
              style={{
                backgroundColor: '#FFD700',
                color: '#0A0A0A',
                border: 'none',
                borderRadius: '20px',
                padding: '8px 16px',
                fontWeight: 'bold',
                cursor: 'pointer',
                fontSize: '14px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <span>Install App</span>
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