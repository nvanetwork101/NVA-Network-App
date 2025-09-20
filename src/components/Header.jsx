import React from 'react';
import HeaderLiveButton from './HeaderLiveButton';

// --- THIS IS THE FIX ---
// The component is now defined to accept the necessary props from App.jsx
const CurrencySelector = ({ currencyRates, selectedCurrency, onCurrencyChange }) => {
    if (!currencyRates) {
        return null; // Don't render if the rates haven't loaded yet.
    }

    // A curated list of currencies to offer the user.
    const supportedCurrencies = ['USD', 'GYD', 'CAD', 'GBP', 'EUR'];
    // Filter the list to only show currencies that the API actually provided rates for.
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

// The Header component is now defined to accept and pass through the props.
function Header({ setActiveScreen, currencyRates, selectedCurrency, onCurrencyChange, isLive, countdownText }) {
  return (
    <div className="header">
      <div className="header-content-left">
        <p className="tagline">Caribbean Content to a Global Stage.</p>
        <p className="headerTitle">NVA Network</p>
        {/* THE FIX: Pass the isLive and countdownText props down to the button */}
        <HeaderLiveButton 
            setActiveScreen={setActiveScreen} 
            isLive={isLive} 
            countdownText={countdownText} 
        />
      </div>
      <div className="header-right-group">
        <img
          src="https://firebasestorage.googleapis.com/v0/b/nvanetworkapp.firebasestorage.app/o/NVA%20Network%20LOGO%203_BRIGHT%20BG.png?alt=media&token=95b8d741-2fbd-4fc1-af2f-42b95ff20eb1"
          alt="NVA Network Logo"
          className="headerLogo"
        />
        {/* The props are now correctly passed to the functional CurrencySelector */}
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