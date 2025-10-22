// src/components/AdminCompetitionManager.jsx

import React, { useState, useEffect, useRef } from 'react';
import { db, functions, httpsCallable, storage, ref, uploadBytes, getDownloadURL, extractVideoInfo } from '../firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import ThumbnailAdjustModal from './ThumbnailAdjustModal';
import CompetitionManagementModal from './CompetitionManagementModal';

function AdminCompetitionManager({ showMessage, setShowConfirmationModal, setConfirmationTitle, setConfirmationMessage, setOnConfirmationAction }) {    // --- STATE MANAGEMENT ---
    const [title, setTitle] = useState('');
    const [competitionType, setCompetitionType] = useState('Photo');
    const [description, setDescription] = useState('');
    const [rules, setRules] = useState('');
    const [prizesText, setPrizesText] = useState('');
    const [flyerUrl, setFlyerUrl] = useState('');
    const [entryDeadline, setEntryDeadline] = useState('');
    const [competitionEnd, setCompetitionEnd] = useState('');
    const [resultsDate, setResultsDate] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [flyerFile, setFlyerFile] = useState(null);
    const flyerInputRef = useRef(null);

    const [enableFlyerLink, setEnableFlyerLink] = useState(false);
    const [flyerLinkUrl, setFlyerLinkUrl] = useState('');
    const [flyerLinkDescription, setFlyerLinkDescription] = useState('Learn More');

    // New state for previews and the crop modal
    const [flyerPreview, setFlyerPreview] = useState('');
    const [imageToCrop, setImageToCrop] = useState(null);
    const [showCropModal, setShowCropModal] = useState(false);
    const [showManageModal, setShowManageModal] = useState(false);
    const [selectedComp, setSelectedComp] = useState(null);

    const [competitions, setCompetitions] = useState([])
    const [loadingComps, setLoadingComps] = useState(true);

    // --- DATA FETCHING ---
    useEffect(() => {
        setLoadingComps(true);
        const compRef = collection(db, "competitions");
        const q = query(compRef, orderBy("createdAt", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setCompetitions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoadingComps(false);
        });
        return () => unsubscribe();
    }, []);

    // Effect for the "smart" URL and file preview (STABILIZED)
    useEffect(() => {
        // Priority 1: If a file is uploaded, use it for the preview.
        if (flyerFile) {
            const objectUrl = URL.createObjectURL(flyerFile);
            setFlyerPreview(objectUrl);
            return () => URL.revokeObjectURL(objectUrl); // Cleanup function
        }

        // Priority 2: If no file, use the URL field.
        if (flyerUrl) {
            // Try to get a video thumbnail from the URL.
            const videoInfo = extractVideoInfo(flyerUrl);
            if (videoInfo && videoInfo.thumbnailUrl) {
                setFlyerPreview(videoInfo.thumbnailUrl);
            } else {
                // If it's not a video, assume it's a direct image URL.
                setFlyerPreview(flyerUrl);
            }
        } else {
            // If both are empty, clear the preview.
            setFlyerPreview('');
        }
    }, [flyerUrl, flyerFile]); // This hook only runs when the URL or file changes.

    // --- HANDLERS ---
    const clearForm = () => {
        setTitle('');
        setCompetitionType('Photo');
        setDescription('');
        setRules('');
        setPrizesText('');
        setFlyerUrl('');
        setEntryDeadline('');
        setCompetitionEnd('');
        setResultsDate('');
        setFlyerFile(null);
        setFlyerPreview('');
        if (flyerInputRef.current) flyerInputRef.current.value = null;
        // --- FIX: These lines are now correctly inside the function ---
        setEnableFlyerLink(false);
        setFlyerLinkUrl('');
        setFlyerLinkDescription('Learn More');
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageToCrop(URL.createObjectURL(file));
            setShowCropModal(true);
        }
        e.target.value = null;
    };

    const handleCropComplete = (imageBlob) => {
        if (imageBlob) {
            const croppedFile = new File([imageBlob], 'cropped_flyer.png', { type: 'image/png' });
            setFlyerFile(croppedFile);
            // The line clearing the flyerUrl has been removed.
        }
        setShowCropModal(false);
        setImageToCrop(null);
    };

    const handleSaveAsDraft = async (e) => {
        e.preventDefault();
        if (!title.trim() || !entryDeadline || !competitionEnd) {
            showMessage("Title and both deadline dates are required.");
            return;
        }
        setIsSubmitting(true);
        showMessage("Saving competition draft...");

        try {
            let finalFlyerUrl = '';
            if (flyerFile) {
                showMessage("Uploading flyer image...");
                const filePath = `competition_flyers/${Date.now()}_${flyerFile.name}`;
                const storageRef = ref(storage, filePath);
                const snapshot = await uploadBytes(storageRef, flyerFile);
                finalFlyerUrl = await getDownloadURL(snapshot.ref);
                showMessage("Flyer uploaded.");
            } else {
                finalFlyerUrl = flyerPreview; // Use the fetched preview from the URL
            }

            // THE FIX: Convert local datetime strings to full ISO 8601 strings (UTC).
            // This ensures the server interprets the time correctly, regardless of its timezone.
            const competitionData = {
                title, competitionType, description, rules, prizesText,
                flyerImageUrl: finalFlyerUrl,
                flyerLinkUrl: enableFlyerLink ? flyerLinkUrl : null,
                flyerLinkDescription: enableFlyerLink ? flyerLinkDescription : null,
                entryDeadline: entryDeadline ? new Date(entryDeadline).toISOString() : null,
                competitionEnd: competitionEnd ? new Date(competitionEnd).toISOString() : null,
                resultsRevealTime: resultsDate ? new Date(resultsDate).toISOString() : null,
            };

            const createCompFunction = httpsCallable(functions, 'createCompetition');
            const result = await createCompFunction(competitionData);

            showMessage(result.data.message);
            clearForm();
        } catch (error) {
            showMessage(`Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDelete = (compToDelete) => {
        setConfirmationTitle("Confirm Deletion");
        setConfirmationMessage(`Are you sure you want to permanently delete the competition "${compToDelete.title}"? This will also delete all associated entries and cannot be undone.`);
        setOnConfirmationAction(() => async () => {
            showMessage("Deleting competition... Please wait.");
            try {
                const deleteFunction = httpsCallable(functions, 'deleteCompetition');
                const result = await deleteFunction({ competitionId: compToDelete.id });
                showMessage(result.data.message);
            } catch (error) {
                showMessage(`Error deleting competition: ${error.message}`);
            }
        });
        setShowConfirmationModal(true);
    };

    const handleManage = (comp) => {
        setSelectedComp(comp);
        setShowManageModal(true);
    };
    
    // --- RENDER LOGIC ---
     return (
        <>
            {showCropModal && <ThumbnailAdjustModal imageUrl={imageToCrop} onSave={handleCropComplete} onCancel={() => setShowCropModal(false)} showMessage={showMessage} isUploading={isSubmitting} />}
            {showManageModal && selectedComp && <CompetitionManagementModal competition={selectedComp} onClose={() => setShowManageModal(false)} showMessage={showMessage} />}
            <p className="heading">Competition Manager</p>
            <p className="subHeading">Create and manage competitions for the NVA Network community.</p>

            <div className="dashboardSection">
                <p className="dashboardSectionTitle">Create New Competition</p>
                <form onSubmit={handleSaveAsDraft}>
                    <div className="formGroup"><label className="formLabel">Competition Title</label><input type="text" className="formInput" value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g., NVA Summer Photo Challenge" required /></div>
                    <div className="formGroup"><label className="formLabel">Competition Type</label><select className="formInput" value={competitionType} onChange={e => setCompetitionType(e.target.value)}><option value="Photo">Photo Submission</option><option value="Video">Video Submission</option><option value="External">External Link Submission</option></select></div>
                    <div className="formGroup"><label className="formLabel">Description (Public)</label><textarea className="formTextarea" value={description} onChange={e => setDescription(e.target.value)} placeholder="A brief, exciting summary of the competition." /></div>
                    <div className="formGroup"><label className="formLabel">Official Rules & Requirements</label><textarea className="formTextarea" value={rules} onChange={e => setRules(e.target.value)} placeholder="Detail the rules, eligibility, and how to win." /></div>
                    <div className="formGroup"><label className="formLabel">Prizes (Simple Text)</label><textarea className="formTextarea" value={prizesText} onChange={e => setPrizesText(e.target.value)} placeholder="e.g., 1st Place: $500, 2nd Place: Gift Basket..." /></div>
                    
                    <div className="formGroup"><label className="formLabel">Promotional Flyer Image</label><input type="file" ref={flyerInputRef} className="formInput" accept="image/*" onChange={handleFileSelect} style={{display: 'none'}} /><button type="button" className="button" style={{ width: '100%', backgroundColor: '#3A3A3A' }} onClick={() => flyerInputRef.current.click()}><span className="buttonText light">Upload Custom Flyer</span></button></div>
                    
                    {/* --- START: Corrected Block for Flyer Link --- */}
                    <div className="formGroup">
                        <label className="formLabel" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span>Enable External Link on Flyer</span>
                            <label className="switch">
                                <input type="checkbox" checked={enableFlyerLink} onChange={() => setEnableFlyerLink(!enableFlyerLink)} />
                                <span className="slider round"></span>
                            </label>
                        </label>
                    </div>

                    {enableFlyerLink && (
                        <>
                            <div className="formGroup">
                                <label className="formLabel">Link URL</label>
                                <input type="url" className="formInput" value={flyerLinkUrl} onChange={e => setFlyerLinkUrl(e.target.value)} placeholder="https://www.sponsor-site.com" required />
                            </div>
                            <div className="formGroup">
                                <label className="formLabel">Link Description (Button Text)</label>
                                <input type="text" className="formInput" value={flyerLinkDescription} onChange={e => setFlyerLinkDescription(e.target.value)} placeholder="e.g., Learn More, Visit Sponsor" required />
                            </div>
                        </>
                    )}
                    {/* --- END: Corrected Block for Flyer Link --- */}

                    {flyerPreview && (
                        <div className="formGroup">
                            <label className="formLabel">Flyer Preview:</label>
                            <img src={flyerPreview} alt="Preview" style={{ maxWidth: '240px', borderRadius: '8px', marginTop: '5px', border: '1px solid #444' }} onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/240x135/555/FFF?text=No+Preview'; }} />
                        </div>
                    )}

                    <div className="formGroup"><label className="formLabel">Entry Deadline</label><input type="datetime-local" className="formInput" value={entryDeadline} onChange={(e) => setEntryDeadline(e.target.value)} required /></div>
                    <div className="formGroup"><label className="formLabel">Competition End Date (Voting/Judging Ends)</label><input type="datetime-local" className="formInput" value={competitionEnd} onChange={(e) => setCompetitionEnd(e.target.value)} required /></div>
                    <div className="formGroup"><label className="formLabel">Results Announcement Date (Optional)</label><input type="datetime-local" className="formInput" value={resultsDate} onChange={(e) => setResultsDate(e.target.value)} /></div>

                    <button type="submit" className="button" disabled={isSubmitting}>
                        <span className="buttonText">{isSubmitting ? 'Saving...' : 'Save as Draft'}</span>
                    </button>
                </form>
            </div>

            <div className="dashboardSection" style={{marginTop: '30px'}}>
                <p className="dashboardSectionTitle">Existing Competitions</p>
                {loadingComps ? <p>Loading competitions...</p> : (
                    <div className="dashboardContentList" style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}>
                        {competitions.length === 0 ? <p className="dashboardItem">No competitions found.</p> :
                            competitions.map(comp => (
                                <div key={comp.id} className="adminDashboardItem">
                                    <div style={{flexGrow: 1}}>
                                        <p className="adminDashboardItemTitle">{comp.title}</p>
                                        <p style={{fontSize: '12px', color: '#CCC'}}>Type: {comp.competitionType}</p>
                                    </div>
                                    <span className="adminDashboardItemStatus" style={{color: comp.status === 'Pending' ? '#FFD700' : '#00FF00', margin: '0 10px'}}>{comp.status}</span>
                                    <button className="adminActionButton reject" onClick={() => handleDelete(comp)}>Delete</button>
                                    <button className="adminActionButton approve" style={{marginLeft: '10px'}} onClick={() => handleManage(comp)}>Manage</button>
                                </div>
                            ))
                        }
                    </div>
                )}
            </div>
        </>
    );
}

export default AdminCompetitionManager;