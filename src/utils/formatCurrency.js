// src/utils/formatCurrency.js

/**
 * Formats a USD amount into the selected currency with a clear, readable string.
 * @param {number} usdAmount - The base amount in USD.
 * @param {string} selectedCurrency - The target currency code (e.g., 'GYD', 'CAD').
 * @param {object} currencyRates - The rates object fetched from the backend.
 * @returns {string} - The formatted currency string, e.g., "$50.00 USD (~$10,456 GYD)".
 */
const formatCurrency = (usdAmount, selectedCurrency, currencyRates) => {
  // Guard against missing data during initial load
  if (typeof usdAmount !== 'number' || !selectedCurrency || !currencyRates) {
    return usdAmount ? `$${usdAmount.toFixed(2)} USD` : '$0.00 USD';
  }

  const baseFormatted = `$${usdAmount.toFixed(2)} USD`;

  // If the selected currency is USD, no conversion is needed.
  if (selectedCurrency === 'USD') {
    return baseFormatted;
  }

  const rate = currencyRates[selectedCurrency];

  // If the rate for the selected currency isn't available, return the base format.
  if (!rate) {
    console.warn(`Currency rate for ${selectedCurrency} not found.`);
    return baseFormatted;
  }

  const convertedAmount = usdAmount * rate;

  let localFormatted;

  // Special formatting for GYD to show it as a whole number.
  if (selectedCurrency === 'GYD') {
    localFormatted = `~ G$${Math.round(convertedAmount).toLocaleString()}`;
  } else {
    // Standard formatting for other currencies with two decimal places.
    localFormatted = `~ ${convertedAmount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${selectedCurrency}`;
  }

  return `${baseFormatted} (${localFormatted})`;
};

export default formatCurrency;