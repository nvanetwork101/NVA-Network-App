// src/components/ShareButton.jsx

import React, { useState } from 'react';

const ShareButton = ({ title, text, url, showMessage }) => {
  const [isSharing, setIsSharing] = useState(false);

  const handleShare = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isSharing) return;

    const shareUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;

    if (navigator.share) {
      setIsSharing(true);
      try {
        await navigator.share({
          title: title,
          text: text,
          url: shareUrl,
        });
      } catch (error) {
        if (error.name !== 'AbortError') {
          // PC/InvalidState Fallback: Force copy to clipboard if native share crashes or locks
          try {
            await navigator.clipboard.writeText(shareUrl);
            showMessage('Link Copied to Clipboard!');
          } catch (err) {
            showMessage('Could not share at this time.');
          }
        }
      } finally {
        setTimeout(() => setIsSharing(false), 500); // 500ms debounce unlocks the button safely
      }
    } else {
      try {
        await navigator.clipboard.writeText(shareUrl);
        showMessage('Link Copied!');
      } catch (error) {
        showMessage('Could not copy link.');
      }
    }
  };

  const shareIcon = (
    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
      <path d="M13.5 1a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zM11 2.5a2.5 2.5 0 1 1 .603 1.628l-6.718 3.12a2.499 2.499 0 0 1 0 1.504l6.718 3.12a2.5 2.5 0 1 1-.488.876l-6.718-3.12a2.5 2.5 0 1 1 0-3.256l6.718-3.12A2.5 2.5 0 0 1 11 2.5zm-8.5 4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm11 5.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z"/>
    </svg>
  );

  return (
    <button
      onClick={handleShare}
      title="Share"
      style={{ 
        background: 'none',
        border: '1px solid #8A2BE2', // Indigo border to match theme
        color: '#E6E6FA', // Light lavender icon color
        borderRadius: '50%',
        width: '40px',
        height: '40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer'
      }}
    >
      {shareIcon}
    </button>
  );
};

export default ShareButton;