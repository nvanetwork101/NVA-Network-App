// src/components/SetVerificationExpiryModal.jsx

import React, { useState } from 'react';

const SetVerificationExpiryModal = ({ onConfirm, onCancel, userName }) => {
    const [duration, setDuration] = useState(1); // Default to 1 month

    return (
        <div className="confirmationModalOverlay">
            <div className="confirmationModalContent">
                <p className="confirmationModalTitle">Set Verification Duration</p>
                <p className="confirmationModalMessage">
                    Select an expiration duration for <strong>{userName}</strong>. Their Verified Advertiser status will automatically expire after this period.
                </p>
                <div className="formGroup" style={{marginTop: '15px'}}>
                    <label className="formLabel">Verification Duration:</label>
                    <select className="formInput" value={duration} onChange={(e) => setDuration(e.target.value)}>
                        <option value="1">1 Month</option>
                        <option value="3">3 Months</option>
                        <option value="6">6 Months</option>
                        <option value="12">1 Year</option>
                    </select>
                </div>
                <div className="confirmationModalButtons">
                    <button className="confirmationButton cancel" onClick={onCancel}>
                        Cancel
                    </button>
                    <button className="confirmationButton confirm" onClick={() => onConfirm(duration)}>
                        Confirm & Set
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SetVerificationExpiryModal;