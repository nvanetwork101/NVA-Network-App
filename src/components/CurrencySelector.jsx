// src/components/CurrencySelector.jsx

import React from 'react';

function CurrencySelector({ selectedCurrency, onCurrencyChange, currencyRates }) {
  // Define a curated list of currencies to display for a cleaner UI
  const supportedCurrencies = ['USD', 'GYD', 'CAD', 'GBP', 'EUR'];

  // Don't render the component if the rates haven't been loaded yet
  if (!currencyRates) {
    return null; 
  }

  return (
    <select 
      value={selectedCurrency}
      onChange={(e) => onCurrencyChange(e.target.value)}
      style={{
        backgroundColor: '#FFD700',
        color: '#0A0A0A',
        padding: '8px 12px',
        borderRadius: '25px',
        border: 'none',
        fontWeight: '600',
        fontSize: '14px',
        cursor: 'pointer',
        boxShadow: '0 4px 5px rgba(0, 0, 0, 0.3)',
      }}
      aria-label="Select Currency"
    >
      {supportedCurrencies.map(currencyCode => (
        // Only show the currency as an option if its rate exists in the data
        currencyRates[currencyCode] && (
          <option key={currencyCode} value={currencyCode}>
            {currencyCode}
          </option>
        )
      ))}
    </select>
  );
}

export default CurrencySelector;