// src/components/ConfirmationModal.jsx

import React from 'react';

function ConfirmationModal({ title, message, onConfirm, onCancel }) {
    
    const handleConfirm = () => {
        // First, execute the action that was passed in from the parent component.
        if (typeof onConfirm === 'function') {
            onConfirm();
        }
        // Then, call the onCancel function to close the modal.
        onCancel();
    };

    return (
        <div className="confirmationModalOverlay">
            <div className="confirmationModalContent">
                <p className="confirmationModalTitle">{title}</p>
                <div className="confirmationModalMessage">{message}</div>
                <div className="confirmationModalButtons">
                    <button className="confirmationButton cancel" onClick={onCancel}>
                        Cancel
                    </button>
                    <button className="confirmationButton confirm" onClick={handleConfirm}>
                        Confirm
                    </button>
                </div>
            </div>
        </div>
    );
}

export default ConfirmationModal;