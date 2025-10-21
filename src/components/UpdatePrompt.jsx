// src/components/UpdatePrompt.jsx

import React from 'react';

// This is a self-contained component. All styles are defined directly inside.
const UpdatePrompt = ({ show, onUpdate }) => {
  if (!show) {
    return null; // Don't render anything if the prompt shouldn't be visible.
  }

  // --- Style Definitions ---
  
  // Style for the main container (the pop-up banner)
  const promptStyle = {
    position: 'fixed',
    bottom: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    padding: '12px 20px',
    background: 'rgba(30, 30, 30, 0.7)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    boxShadow: '0 4px 30px rgba(0, 0, 0, 0.2)',
    width: '90%',
    maxWidth: '400px',
  };

  // Style for the text message
  const messageStyle = {
    color: '#FFFFFF',
    margin: 0,
    fontSize: '15px',
    fontWeight: '500',
  };

  // Style for the glowing gold "Update" button
  const updateButtonStyle = {
    background: '#FFD700', // Gold color
    color: '#0A0A0A',
    border: 'none',
    borderRadius: '8px',
    padding: '10px 18px',
    fontSize: '15px',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginLeft: '15px',
    // --- THIS CREATES THE GLOWING EFFECT ---
    boxShadow: '0 0 5px #FFD700, 0 0 10px #FFD700, 0 0 15px #FF8C00',
    transition: 'box-shadow 0.3s ease-in-out',
  };

  return (
    <div style={promptStyle}>
      <p style={messageStyle}>A new version is available!</p>
      <button 
        style={updateButtonStyle}
        // Add a subtle effect on hover for desktop users
        onMouseOver={e => e.currentTarget.style.boxShadow = '0 0 8px #FFD700, 0 0 15px #FFD700, 0 0 25px #FF8C00'}
        onMouseOut={e => e.currentTarget.style.boxShadow = '0 0 5px #FFD700, 0 0 10px #FFD700, 0 0 15px #FF8C00'}
        onClick={onUpdate}
      >
        Update
      </button>
    </div>
  );
};

export default UpdatePrompt;