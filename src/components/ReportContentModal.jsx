// src/components/ReportContentModal.jsx

import React, { useState } from 'react';
import { functions, httpsCallable } from '../firebase';

const ReportContentModal = ({ showMessage, onCancel, contentToReport, currentUser }) => {
    const [reason, setReason] = useState('');
    const [note, setNote] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const reportReasons = [ "Harassment or Bullying", "Hate Speech", "Nudity or Sexual Content", "Spam or Misleading", "Copyright Infringement", "Violent or Graphic Content", "Other" ];
    
    if (!contentToReport) return null;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!reason) {
            showMessage("Please select a reason for the report.");
            return;
        }
        setIsSubmitting(true);
        try {
            const reportFunction = httpsCallable(functions, 'createContentReport');
            const result = await reportFunction({
                contentId: contentToReport.id,
                appId: "production-app-id",
                reason: reason,
                note: note
            });
            showMessage(result.data.message);
            onCancel(); // Close the modal on success
        } catch (error) {
            showMessage(`Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="confirmationModalOverlay" style={{ zIndex: 3000 }}>
            <div className="confirmationModalContent" style={{ textAlign: 'left', maxWidth: '500px' }}>
                <p className="confirmationModalTitle">Report Content</p>
                <p className="subHeading" style={{textAlign: 'left', fontSize: '14px', margin: '0 0 15px 0'}}>
                    You are reporting: <strong>{contentToReport.title}</strong>
                </p>
                <form onSubmit={handleSubmit}>
                    <div className="formGroup">
                        <label className="formLabel">Reason:</label>
                        {reportReasons.map(r => (
                            <div key={r} className="checkboxItem" style={{marginBottom: '8px'}}>
                                <input type="radio" id={`reason-${r}`} name="report_reason" value={r} checked={reason === r} onChange={(e) => setReason(e.target.value)} style={{width: '16px', height: '16px'}} />
                                <label htmlFor={`reason-${r}`} style={{marginLeft: '8px', fontWeight: 'normal'}}>{r}</label>
                            </div>
                        ))}
                    </div>
                    <div className="formGroup">
                        <label className="formLabel">Additional Notes (Optional):</label>
                        <textarea className="formTextarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Provide any additional context or timestamps." />
                    </div>
                    <div className="confirmationModalButtons">
                        <button type="button" className="confirmationButton cancel" onClick={onCancel}>Cancel</button>
                        <button type="submit" className="confirmationButton confirm" disabled={isSubmitting} style={{backgroundColor: '#DC3545'}}>
                            {isSubmitting ? 'Submitting...' : 'Submit Report'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default ReportContentModal;