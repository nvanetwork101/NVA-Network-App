// src/components/SuspensionModal.jsx

import React, { useState } from 'react';

function SuspensionModal({ onConfirm, onCancel, userName }) {
    // State to manage the selected duration from the dropdown
    const [duration, setDuration] = useState(24); // Default to 24 hours

    return (
        <div className="confirmationModalOverlay">
            <div className="confirmationModalContent">
                <p className="confirmationModalTitle">Suspend User</p>
                <p className="confirmationModalMessage">
                    Select a suspension duration for <strong>{userName}</strong>. They will be logged out and unable to log back in until the duration expires.
                </p>
                <div className="formGroup" style={{ marginTop: '15px' }}>
                    <label className="formLabel">Suspension Duration:</label>
                    <select 
                        className="formInput" 
                        value={duration} 
                        onChange={(e) => setDuration(parseInt(e.target.value, 10))}
                    >
                        <option value="24">24 Hours</option>
                        <option value="72">3 Days</option>
                        <option value="168">1 Week</option>
                        <option value="720">30 Days</option>
                    </select>
                </div>
                <div className="confirmationModalButtons">
                    <button className="confirmationButton cancel" onClick={onCancel}>
                        Cancel
                    </button>
                    {/* The onConfirm function receives the selected duration */}
                    <button className="confirmationButton confirm" onClick={() => onConfirm(duration)} style={{ backgroundColor: '#DC3545' }}>
                        Confirm Suspension
                    </button>
                </div>
            </div>
        </div>
    );
}

export default SuspensionModal;