// src/components/CompetitionManagementModal.jsx

import React, { useState, useEffect } from 'react';
import { functions, httpsCallable } from '../firebase';

function CompetitionManagementModal({ competition, onClose, showMessage }) {
    // --- STATE MANAGEMENT ---
    // Use local state to manage edits without affecting the main list until save.
    const [editableComp, setEditableComp] = useState({ ...competition });
    const [isSaving, setIsSaving] = useState(false);

    // This effect ensures that if the modal is re-opened for a different competition,
    // the state is correctly reset to the new competition's data.
     useEffect(() => {
        // This robust function handles both Firestore Timestamps and date strings
        const convertTimestamp = (ts) => {
            if (!ts) return ''; // Handle null or undefined safely
            // If it's a Firestore Timestamp, convert it
            if (typeof ts.toDate === 'function') {
                return new Date(ts.toDate()).toISOString().slice(0, 16);
            }
            // If it's already a string, just use it
            if (typeof ts === 'string') {
                return ts.slice(0, 16);
            }
            // Provide a safe fallback for any other unexpected type
            return '';
        };

        setEditableComp({
            ...competition,
            entryDeadline: convertTimestamp(competition.entryDeadline),
            competitionEnd: convertTimestamp(competition.competitionEnd),
            resultsRevealTime: convertTimestamp(competition.resultsRevealTime),
        });
    }, [competition]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setEditableComp(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        showMessage("Saving changes...");

        // Prepare only the changed data to send to the function
        const updates = {};
        for (const key in editableComp) {
            if (editableComp[key] !== competition[key]) {
                updates[key] = editableComp[key];
            }
        }
        
        try {
            const updateFunction = httpsCallable(functions, 'updateCompetition');
            await updateFunction({
                competitionId: competition.id,
                updates: editableComp // Send the whole object for simplicity on the backend
            });
            showMessage("Competition updated successfully!");
            onClose();
        } catch (error) {
            showMessage(`Error: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="confirmationModalOverlay" style={{ zIndex: 3500 }}>
            <div className="confirmationModalContent" style={{ textAlign: 'left', maxWidth: '600px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p className="confirmationModalTitle">Manage: {competition.title}</p>
                    <button className="closeButton" onClick={onClose} style={{ position: 'static' }}>×</button>
                </div>

                <div style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: '15px' }}>
                    <div className="formGroup">
                        <label className="formLabel">Competition Status</label>
                        <select name="status" className="formInput" value={editableComp.status || ''} onChange={handleInputChange}>
                            <option value="Pending">Pending (Draft)</option>
                            <option value="Accepting Entries">Accepting Entries (Go Live)</option>
                            <option value="Live Voting">Live Voting</option>
                            <option value="Judging">Judging (Results Soon)</option>
                            <option value="Results Visible">Results Visible (Make Public)</option>
                            <option value="Archived">Archived (Keep Private)</option>
                        </select>
                    </div>

                    <div className="formGroup"><label className="formLabel">Title</label><input type="text" name="title" className="formInput" value={editableComp.title || ''} onChange={handleInputChange} /></div>
                    <div className="formGroup"><label className="formLabel">Description</label><textarea name="description" className="formTextarea" value={editableComp.description || ''} onChange={handleInputChange} /></div>
                    <div className="formGroup"><label className="formLabel">Rules</label><textarea name="rules" className="formTextarea" value={editableComp.rules || ''} onChange={handleInputChange} /></div>
                    <div className="formGroup"><label className="formLabel">Prizes</label><textarea name="prizesText" className="formTextarea" value={editableComp.prizesText || ''} onChange={handleInputChange} /></div>
                    <div className="formGroup"><label className="formLabel">Notice to Participants (Displays on public screen)</label><textarea name="noticeText" className="formTextarea" value={editableComp.noticeText || ''} onChange={handleInputChange} /></div>
                    <hr style={{borderColor: '#333', margin: '20px 0'}}/>
                    <p className="formLabel" style={{marginBottom: '10px'}}>Manage Deadlines</p>
                    <div className="formGroup"><label className="formLabel">Entry Deadline</label><input type="datetime-local" name="entryDeadline" className="formInput" value={editableComp.entryDeadline || ''} onChange={handleInputChange} /></div>
                    <div className="formGroup"><label className="formLabel">Competition End (Voting Ends)</label><input type="datetime-local" name="competitionEnd" className="formInput" value={editableComp.competitionEnd || ''} onChange={handleInputChange} /></div>
                    <div className="formGroup"><label className="formLabel">Results Reveal Time (Optional)</label><input type="datetime-local" name="resultsRevealTime" className="formInput" value={editableComp.resultsRevealTime || ''} onChange={handleInputChange} /></div>
                </div>

                <div className="confirmationModalButtons" style={{marginTop: '20px'}}>
                    <button className="confirmationButton cancel" onClick={onClose} disabled={isSaving}>Cancel</button>
                    <button className="confirmationButton confirm" onClick={handleSaveChanges} disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save Changes'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default CompetitionManagementModal;