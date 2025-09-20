// src/components/ContentAppealModal.jsx

import React, { useState } from 'react';
import { functions, httpsCallable } from '../firebase';

const ContentAppealModal = ({ notification, showMessage, onClose }) => {
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    if (!notification || !notification.isAppealable) {
        return null;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!message.trim()) {
            showMessage("Please provide a reason for your appeal.");
            return;
        }
        setIsSubmitting(true);
        try {
            const appealFunction = httpsCallable(functions, 'submitContentAppeal');
            const result = await appealFunction({
                contentId: notification.contentId,
                message: message
            });
            showMessage(result.data.message);
            onClose(); // Close the modal on success
        } catch (error) {
            showMessage(`Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="confirmationModalOverlay" style={{ zIndex: 3000 }}>
            <div className="confirmationModalContent" style={{ textAlign: 'left', maxWidth: '500px' }}>
                <p className="confirmationModalTitle">Appeal Content Removal</p>
                <p className="subHeading" style={{textAlign: 'left', fontSize: '14px', margin: '0 0 15px 0'}}>
                    You are appealing the removal of your content. Your appeal will be sent to the moderation team for review.
                </p>
                <form onSubmit={handleSubmit}>
                    <div className="formGroup">
                        <label className="formLabel">Reason for Appeal:</label>
                        <textarea 
                            className="formTextarea" 
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Please explain why you believe this decision should be reviewed." 
                            required
                            rows="5"
                        ></textarea>
                    </div>
                    <div className="confirmationModalButtons">
                        <button type="button" className="confirmationButton cancel" onClick={onClose} disabled={isSubmitting}>
                            Cancel
                        </button>
                        <button type="submit" className="confirmationButton confirm" disabled={isSubmitting}>
                            {isSubmitting ? 'Submitting...' : 'Submit Appeal'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ContentAppealModal;