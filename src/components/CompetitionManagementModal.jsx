// src/components/CompetitionManagementModal.jsx

import React, { useState, useEffect } from 'react';
import { functions, httpsCallable } from '../firebase';

function CompetitionManagementModal({ competition, onClose, showMessage }) {
    // --- STATE MANAGEMENT ---
    const [editableComp, setEditableComp] = useState({ ...competition });
    const [isSaving, setIsSaving] = useState(false);

    // This effect ensures the form state is correct when the modal opens or the competition prop changes.
     useEffect(() => {
        const convertTimestamp = (ts) => {
            if (!ts) return '';
            const date = ts.toDate ? ts.toDate() : new Date(ts);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return `${year}-${month}-${day}T${hours}:${minutes}`;
        };

        setEditableComp({
            ...competition,
            entryDeadline: convertTimestamp(competition.entryDeadline),
            competitionEnd: convertTimestamp(competition.competitionEnd),
            resultsRevealTime: convertTimestamp(competition.resultsRevealTime),
            
            winnersToNotify: competition.winnersToNotify !== undefined ? String(competition.winnersToNotify) : '',
            
        });
    }, [competition]);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setEditableComp(prev => ({ ...prev, [name]: value }));
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        showMessage("Saving changes...");

        try {
            // Create a mutable copy of the state to prepare for sending
            const updatesToSend = { ...editableComp };

            // Convert date strings to full ISO 8601 strings for the backend
            updatesToSend.entryDeadline = updatesToSend.entryDeadline ? new Date(updatesToSend.entryDeadline).toISOString() : null;
            updatesToSend.competitionEnd = updatesToSend.competitionEnd ? new Date(updatesToSend.competitionEnd).toISOString() : null;
            updatesToSend.resultsRevealTime = updatesToSend.resultsRevealTime ? new Date(updatesToSend.resultsRevealTime).toISOString() : null;
            
            // Convert winnersToNotify to a number, defaulting to 0
            updatesToSend.winnersToNotify = updatesToSend.winnersToNotify ? parseInt(updatesToSend.winnersToNotify, 10) : 0;
            
            // Explicitly delete the winnerIds string property so it's not sent to the backend
            delete updatesToSend.winnerIds;

            const updateFunction = httpsCallable(functions, 'updateCompetition');
            await updateFunction({
                competitionId: competition.id,
                updates: updatesToSend 
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
                
                    {/* --- NEW WINNERS SECTION --- */}
                    <hr style={{borderColor: '#333', margin: '20px 0'}}/>
                    <p className="formLabel" style={{marginBottom: '10px'}}>Manage Winners</p>
                    <div className="formGroup">
                        <label className="formLabel">Number of Top Winners to Notify</label>
                        <input
                            type="number"
                            name="winnersToNotify"
                            className="formInput"
                            value={editableComp.winnersToNotify || ''}
                            onChange={handleInputChange}
                            placeholder="e.g., 3"
                        />
                    </div>
                    {/* --- END NEW WINNERS SECTION --- */}

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