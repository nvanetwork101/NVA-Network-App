// src/components/CompetitionManagementModal.jsx

import React, { useState, useEffect } from 'react';
import { functions, httpsCallable } from '../firebase';

function CompetitionManagementModal({ competition, onClose, showMessage }) {
    // --- STATE MANAGEMENT ---
    // Use local state to manage edits without affecting the main list until save.
    const [editableComp, setEditableComp] = useState({ 
        ...competition,
        winnerIds: Array.isArray(competition.winnerIds) ? competition.winnerIds.join('\n') : '' // Convert array to string for textarea
    });
    const [isSaving, setIsSaving] = useState(false);

    // This effect ensures that if the modal is re-opened for a different competition,
    // the state is correctly reset to the new competition's data.
     useEffect(() => {
        // This robustly converts a Firestore Timestamp into the local YYYY-MM-DDTHH:mm string
        // required by the datetime-local input, preventing timezone corruption.
        const convertTimestamp = (ts) => {
            if (!ts) return '';
            const date = ts.toDate ? ts.toDate() : new Date(ts);

            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0'); // padStart ensures "09" vs "9"
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
            // THE FIX: Create a new object with corrected, timezone-aware date strings.
            const updatesToSend = {
                ...editableComp,
                entryDeadline: editableComp.entryDeadline ? new Date(editableComp.entryDeadline).toISOString() : null,
                competitionEnd: editableComp.competitionEnd ? new Date(editableComp.competitionEnd).toISOString() : null,
                resultsRevealTime: editableComp.resultsRevealTime ? new Date(editableComp.resultsRevealTime).toISOString() : null,
                // Convert winnersToNotify to a number and winnerIds string to an array of strings
                winnersToNotify: editableComp.winnersToNotify ? parseInt(editableComp.winnersToNotify, 10) : 0,
                winnerIds: editableComp.winnerIds ? editableComp.winnerIds.split('\n').map(id => id.trim()).filter(id => id) : []
            };

            const updateFunction = httpsCallable(functions, 'updateCompetition');
            await updateFunction({
                competitionId: competition.id,
                updates: updatesToSend // Send the timezone-corrected object to the backend.
            });
            showMessage("Competition updated successfully!");
            onClose();
        } catch (error) {
            // THE SYNTAX FIX: Added the required curly braces.
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
                    <div className="formGroup">
                        <label className="formLabel">Winner User IDs (In order, 1st place first, one ID per line)</label>
                        <textarea 
                            name="winnerIds" 
                            className="formTextarea" 
                            value={editableComp.winnerIds || ''} 
                            onChange={handleInputChange} 
                            rows="5"
                            placeholder="Paste User ID for 1st Place...&#10;Paste User ID for 2nd Place...&#10;..."
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