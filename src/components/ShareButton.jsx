// src/components/ShareButton.jsx

import React from 'react';

/**
 * A reusable share button that uses the Web Share API if available,
 * with a fallback to copying the link to the clipboard.
 * @param {object} props
 * @param {string} props.title - The title of the content to be shared.
 * @param {string} props.text - The descriptive text to accompany the share.
 * @param {string} props.url - The URL to be shared. Can be relative (e.g., '/user/123').
 * @param {function} props.showMessage - The global function to display a notification message.
 */
const ShareButton = ({ title, text, url, showMessage }) => {
  const handleShare = async () => {
    // Ensure the URL is absolute for sharing APIs
    const shareUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;

    // Check if the Web Share API is available on the user's device
    if (navigator.share) {
      try {
        await navigator.share({
          title: title,
          text: text,
          url: shareUrl,
        });
        // Success is handled by the native UI, so no message is needed here.
      } catch (error) {
        // We ignore the AbortError which is thrown when the user cancels the share dialog.
        if (error.name !== 'AbortError') {
          console.error('Error using Web Share API:', error);
          showMessage('Could not share at this time.');
        }
      }
    } else {
      // Fallback for desktop browsers or others without the Web Share API
      try {
        await navigator.clipboard.writeText(shareUrl);
        showMessage('Link Copied!');
      } catch (error) {
        console.error('Error copying link to clipboard:', error);
        showMessage('Could not copy link.');
      }
    }
  };

  const shareIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
      <path d="M13.5 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM11 2.5a2.5 2.5 0 1 1 .603 1.628l-6.718 3.12a2.499 2.499 0 0 1 0 1.504l6.718 3.12a2.5 2.5 0 1 1-.488.876l-6.718-3.12a2.5 2.5 0 1 1 0-3.256l6.718-3.12A2.5 2.5 0 0 1 11 2.5zm-8.5 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm11 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/>
    </svg>
  );

  return (
    <button
      onClick={handleShare}
      className="button"
      title="Share"
      style={{ 
        display: 'inline-flex', 
        alignItems: 'center', 
        gap: '8px',
        backgroundColor: '#3A3A3A' // Neutral dark button color
      }}
    >
      {shareIcon}
      <span className="buttonText light">Share</span>
    </button>
  );
};

export default ShareButton;