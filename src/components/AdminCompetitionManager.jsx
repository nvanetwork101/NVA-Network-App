// src/components/AdminCompetitionManager.jsx

import React, { useState, useEffect, useRef } from 'react';
import { db, functions, httpsCallable, storage, ref, uploadBytes, getDownloadURL, extractVideoInfo } from '../firebase';
import { collection, onSnapshot, query, orderBy, doc, setDoc, getDocs, writeBatch, increment, limit } from 'firebase/firestore';
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
    const [entryFee, setEntryFee] = useState(''); // Initialize empty string to prevent leading zero issues [1]
    const [isFeeEnabled, setIsFeeEnabled] = useState(false); // Added master fee toggle state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [flyerFile, setFlyerFile] = useState(null);
    const flyerInputRef = useRef(null);

    const [originalFlyerFile, setOriginalFlyerFile] = useState(null);

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

    // Live Fail-Safe Champion Override States
    const [editingOverrideCompId, setEditingOverrideCompId] = useState(null);
    const [overrideUrl, setOverrideUrl] = useState('');
    const [overrideType, setOverrideType] = useState('Photo');

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

    // Effect for the "smart" URL and file preview
    useEffect(() => {
        if (flyerFile) {
            const objectUrl = URL.createObjectURL(flyerFile);
            setFlyerPreview(objectUrl);
            return () => URL.revokeObjectURL(objectUrl);
        }
        if (!flyerUrl) {
            setFlyerPreview('');
            return;
        }
        const videoInfo = extractVideoInfo(flyerUrl);
        if (videoInfo && videoInfo.thumbnailUrl) {
            setFlyerPreview(videoInfo.thumbnailUrl);
        } else {
            setFlyerPreview('');
        }
    }, [flyerUrl, flyerFile]);

    // --- HANDLERS ---
    const clearForm = () => {
        setTitle('');
        setCompetitionType('Photo');
        setDescription('');
        setRules('');
        setPrizesText('');
        setEntryFee(''); // Reset entry fee blank [1]
        setIsFeeEnabled(false); // Reset master toggle state
        setFlyerUrl('');
        setEntryDeadline('');
        setCompetitionEnd('');
        setResultsDate('');
        setFlyerFile(null);
        setFlyerPreview('');
        setOriginalFlyerFile(null);
        setEnableFlyerLink(false);
        setFlyerLinkUrl('');
        setFlyerLinkDescription('Learn More');
        
        if (flyerInputRef.current) flyerInputRef.current.value = null;
    };

    const handleFileSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setOriginalFlyerFile(file); // <-- ADD THIS LINE
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
            let thumbnailUrl = '';
            let highResUrl = '';

            // Scenario 1: A file was uploaded.
            if (flyerFile && originalFlyerFile) {
                // Upload the thumbnail (resized version)
                showMessage("Uploading thumbnail...");
                const thumbPath = `competition_flyers/${Date.now()}_thumb_${flyerFile.name}`;
                const thumbRef = ref(storage, thumbPath);
                await uploadBytes(thumbRef, flyerFile);
                thumbnailUrl = await getDownloadURL(thumbRef);

                // Upload the original, high-resolution file
                showMessage("Uploading high-resolution flyer...");
                const highResPath = `competition_flyers/${Date.now()}_highres_${originalFlyerFile.name}`;
                const highResRef = ref(storage, highResPath);
                await uploadBytes(highResRef, originalFlyerFile);
                highResUrl = await getDownloadURL(highResRef);
                
                showMessage("Flyers uploaded.");
            } 
            // Scenario 2: Only a URL was pasted in.
            else if (flyerUrl) {
                // In this case, both URLs will be the same.
                thumbnailUrl = flyerUrl;
                highResUrl = flyerUrl;
            }

            const competitionData = {
                title, competitionType, description, rules, prizesText,
                entryFee: isFeeEnabled ? (parseInt(entryFee, 10) || 0) : 0, // Parse integer safely [1]
                prizePool: 0, // Initialize prize pool
                flyerImageUrl: thumbnailUrl,
                flyerImageUrl_highRes: highResUrl,
                // THE FIX: Use the new state variables, controlled by the toggle.
                flyerLinkUrl: enableFlyerLink ? flyerLinkUrl : null,
                flyerLinkDescription: enableFlyerLink ? flyerLinkDescription : null,
                entryDeadline: entryDeadline ? new Date(entryDeadline).toISOString() : null,
                competitionEnd: competitionEnd ? new Date(competitionEnd).toISOString() : null,
                resultsRevealTime: resultsDate ? new Date(resultsDate).toISOString() : null,
            };

            const createCompFunction = httpsCallable(functions, 'createCompetition');
            const result = await createCompFunction(competitionData);

            // THE FIX: Authoritatively mirror the active competition to the Banner state
            await setDoc(doc(db, "settings", "competitionDisplayState"), {
                title: title,
                displayMessage: description.slice(0, 60) + "...",
                status: "Accepting Entries",
                isActive: true,
                countdownTarget: new Date(entryDeadline),
                entryFee: isFeeEnabled ? (parseInt(entryFee, 10) || 0) : 0, // Parse integer safely [1]
                prizePool: 0 // Mirror initial prize pool
            }, { merge: true });

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

    // --- SECURE CLIENT-SIDE 60/25/15 PRIZE DISTRIBUTOR ---
    const handleDistributePrizes = (comp) => {
        const totalPool = comp.prizePool || 0;
        if (totalPool === 0) {
            showMessage("The Prize Pool is empty. No earnings to distribute!");
            return;
        }

        setConfirmationTitle("Distribute Tournament Prizes?");
        setConfirmationMessage(`You are about to distribute a total prize pool of ${totalPool.toLocaleString()} GYD to the Top 3 winners (60% / 25% / 15%). This will lock the tournament as paid and credit their dashboards. Proceed?`);
        
        setOnConfirmationAction(() => async () => {
            showMessage("Executing prize distribution...");
            try {
                // 1. Fetch entries sorted by votes (likeCount) descending
                const entriesRef = collection(db, "competitions", comp.id, "entries");
                const q = query(entriesRef, orderBy("likeCount", "desc"), limit(3));
                const snap = await getDocs(q);

                if (snap.empty) {
                    showMessage("No entries found inside the competition!");
                    return;
                }

                const winners = snap.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
                
                // 2. Calculate the golden-ratio split
                const payout1st = Math.round(totalPool * 0.60);
                const payout2nd = Math.round(totalPool * 0.25);
                const payout3rd = Math.round(totalPool * 0.15);

                const batch = writeBatch(db);

                // 3. Update the competition status and distribute funds
                batch.update(doc(db, "competitions", comp.id), {
                    prizesDistributed: true,
                    status: "Concluded" // Marks it paid & locked!
                });

                // Write 1st Place Winnings
                if (winners[0]) {
                    batch.update(doc(db, "creators", winners[0].userId), { totalEarnings: increment(payout1st) });
                    batch.set(doc(collection(db, "notifications")), {
                        userId: winners[0].userId,
                        title: "1st Place Winner! 🏆",
                        body: `${payout1st.toLocaleString()} GYD was credited to your account for 1st place in "${comp.title}"!`,
                        link: "/CreatorDashboard",
                        deliveryType: ["inbox", "push"],
                        notificationType: "TOURNAMENT_WIN",
                        sound: true,
                        isRead: false,
                        status: "pending",
                        timestamp: new Date()
                    });
                    batch.update(doc(db, "creators", winners[0].userId), { unreadNotificationCount: increment(1) });
                }

                // Write 2nd Place Winnings
                if (winners[1]) {
                    batch.update(doc(db, "creators", winners[1].userId), { totalEarnings: increment(payout2nd) });
                    batch.set(doc(collection(db, "notifications")), {
                        userId: winners[1].userId,
                        title: "2nd Place Winner! 🥈",
                        body: `${payout2nd.toLocaleString()} GYD was credited to your account for 2nd place in "${comp.title}"!`,
                        link: "/CreatorDashboard",
                        deliveryType: ["inbox", "push"],
                        notificationType: "TOURNAMENT_WIN",
                        sound: true,
                        isRead: false,
                        status: "pending",
                        timestamp: new Date()
                    });
                    batch.update(doc(db, "creators", winners[1].userId), { unreadNotificationCount: increment(1) });
                }

                // Write 3rd Place Winnings
                if (winners[2]) {
                    batch.update(doc(db, "creators", winners[2].userId), { totalEarnings: increment(payout3rd) });
                    batch.set(doc(collection(db, "notifications")), {
                        userId: winners[2].userId,
                        title: "3rd Place Winner! 🥉",
                        body: `${payout3rd.toLocaleString()} GYD was credited to your account for 3rd place in "${comp.title}"!`,
                        link: "/CreatorDashboard",
                        deliveryType: ["inbox", "push"],
                        notificationType: "TOURNAMENT_WIN",
                        sound: true,
                        isRead: false,
                        status: "pending",
                        timestamp: new Date()
                    });
                    batch.update(doc(db, "creators", winners[2].userId), { unreadNotificationCount: increment(1) });
                }

                await batch.commit();
                showMessage("Prizes distributed and winners notified successfully!");
            } catch (err) {
                console.error("Payout Distribution Failed:", err);
                showMessage("Failed to distribute prizes.");
            }
        });
        setShowConfirmationModal(true);
    };

    const handleManage = (comp) => {
        setSelectedComp(comp);
        setShowManageModal(true);
    };

    const handleForceRevealResults = (comp) => {
        setConfirmationTitle("Force Reveal Results?");
        setConfirmationMessage(`Are you sure you want to manually force the results visible for "${comp.title}"? This will instantly change the stage to 'Results Visible', broadcast it to the network, and notify the winners.`);
        setOnConfirmationAction(() => async () => {
            showMessage("Revealing results... Please wait.");
            try {
                const revealFunc = httpsCallable(functions, 'revealCompetitionResults');
                const result = await revealFunc({ competitionId: comp.id });
                showMessage(result.data.message);
            } catch (error) {
                showMessage(`Error revealing results: ${error.message}`);
            }
        });
        setShowConfirmationModal(true);
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
                    
                    {/* TOURNAMENT ENTRY FEE CONFIGURE (With Master Toggle) */}
                    <div className="formGroup">
                        <label className="formLabel" style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
                            <input 
                                type="checkbox" 
                                checked={isFeeEnabled} 
                                onChange={(e) => {
                                    const checked = e.target.checked;
                                    setIsFeeEnabled(checked);
                                    if (!checked) {
                                        setEntryFee(0); // Reset fee to 0 if unchecked
                                    }
                                }} 
                                style={{ width: '18px', height: '18px', accentColor: '#00FFFF', cursor: 'pointer' }} 
                            />
                            <span style={{ color: '#FFF', fontSize: '13px', fontWeight: 'bold' }}>Require Paid Entry Fee</span>
                        </label>
                    </div>

                    {isFeeEnabled && (
                        <div className="formGroup">
                            <label className="formLabel">Tournament Entry Fee (GYD)</label>
                            <input 
                                type="number" 
                                className="formInput" 
                                value={entryFee} 
                                onChange={e => setEntryFee(e.target.value === '' ? '' : parseInt(e.target.value, 10))} // Allow empty string [1]
                                placeholder="e.g. 2500" 
                            />
                        </div>
                    )}

                    <div className="formGroup"><label className="formLabel">Promotional Flyer Image</label><input type="file" ref={flyerInputRef} className="formInput" accept="image/*" onChange={handleFileSelect} style={{display: 'none'}} /><button type="button" className="button" style={{ width: '100%', backgroundColor: '#3A3A3A' }} onClick={() => flyerInputRef.current.click()}><span className="buttonText light">Upload Custom Flyer</span></button></div>
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
                <style>{`
                    .admin-comp-list {
                        max-height: 450px;
                        overflow-y: auto;
                        padding-right: 8px;
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                    }
                    .admin-comp-card {
                        background: rgba(255, 255, 255, 0.02);
                        backdrop-filter: blur(12px);
                        -webkit-backdrop-filter: blur(12px);
                        border: 1px solid rgba(255, 255, 255, 0.06);
                        border-radius: 12px;
                        padding: 16px;
                        display: flex;
                        flex-direction: column;
                        gap: 14px;
                        box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.2);
                        transition: all 0.2s ease;
                    }
                    .admin-comp-card:hover {
                        border-color: rgba(255, 255, 255, 0.1);
                        background: rgba(255, 255, 255, 0.03);
                    }
                    .admin-comp-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-start;
                        width: 100%;
                        gap: 12px;
                    }
                    .admin-comp-actions {
                        display: flex;
                        gap: 8px;
                        flex-wrap: wrap;
                        justify-content: flex-end;
                        align-items: center;
                        width: 100%;
                    }
                    @media (max-width: 650px) {
                        .admin-comp-header {
                            flex-direction: column;
                            gap: 6px;
                        }
                        .admin-comp-actions {
                            justify-content: flex-start;
                            border-top: 1px solid rgba(255,255,255,0.04);
                            padding-top: 12px;
                        }
                    }
                `}</style>
                <p className="dashboardSectionTitle">Existing Competitions</p>
                {loadingComps ? <p>Loading competitions...</p> : (
                    <div className="admin-comp-list">
                        {competitions.length === 0 ? <p className="dashboardItem">No competitions found.</p> :
                            competitions.map(comp => (
                                <div key={comp.id} className="admin-comp-card">
                                    <div className="admin-comp-header">
                                        <div style={{ flex: 1 }}>
                                            <p className="adminDashboardItemTitle" style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#FFF' }}>{comp.title}</p>
                                            <p style={{ fontSize: '12px', color: '#888', margin: '2px 0 0 0' }}>Type: {comp.competitionType}</p>
                                        </div>
                                        <span className="adminDashboardItemStatus" style={{ 
                                            color: comp.status === 'Pending' ? '#FFD700' : comp.status === 'Results Visible' ? '#00FF00' : '#00FFFF', 
                                            fontWeight: '900',
                                            fontSize: '11px',
                                            textTransform: 'uppercase',
                                            letterSpacing: '1px',
                                            background: 'rgba(0,0,0,0.3)',
                                            padding: '4px 10px',
                                            borderRadius: '6px',
                                            border: '1px solid rgba(255,255,255,0.03)'
                                        }}>{comp.status}</span>
                                    </div>

                                    {/* ACTIVE COMPETITION PREVIEW CARD: Shows all schedules, flyers, and active settings instantly [1] */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '80px 1fr', gap: '15px', background: 'rgba(0,0,0,0.3)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.03)', textAlign: 'left', fontSize: '12px', color: '#BBB' }}>
                                        <div style={{ width: '80px', height: '80px', borderRadius: '6px', overflow: 'hidden', border: '1px solid #333', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {comp.flyerImageUrl ? (
                                                <img src={comp.flyerImageUrl} alt="Flyer" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                            ) : (
                                                <span style={{ fontSize: '10px', color: '#444' }}>No Image</span>
                                            )}
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            <p style={{ margin: 0 }}><strong>Entry Fee:</strong> <span style={{ color: comp.entryFee > 0 ? '#4ADE80' : '#AAA', fontWeight: 'bold' }}>{comp.entryFee > 0 ? `${comp.entryFee.toLocaleString()} GYD` : 'Free'}</span> | <strong>Prize Pool:</strong> <span style={{ color: '#00FFFF', fontWeight: 'bold' }}>{(comp.prizePool || 0).toLocaleString()} GYD</span></p>
                                            <p style={{ margin: 0 }}><strong>Auditions Close:</strong> <span style={{ color: '#FFF' }}>{comp.entryDeadline ? new Date(comp.entryDeadline).toLocaleString() : 'N/A'}</span></p>
                                            <p style={{ margin: 0 }}><strong>Voting Ends:</strong> <span style={{ color: '#FFF' }}>{comp.competitionEnd ? new Date(comp.competitionEnd).toLocaleString() : 'N/A'}</span></p>
                                            <p style={{ margin: 0 }}><strong>Reveal Schedule:</strong> <span style={{ color: '#FFF' }}>{comp.resultsRevealTime ? new Date(comp.resultsRevealTime).toLocaleString() : 'N/A'}</span></p>
                                        </div>
                                    </div>

                                    <div className="admin-comp-actions">
                                        <button className="adminActionButton reject" style={{ margin: 0 }} onClick={() => handleDelete(comp)}>Delete</button>
                                        <button className="adminActionButton approve" style={{ margin: 0 }} onClick={() => handleManage(comp)}>Manage</button>
                                        <button className="adminActionButton approve" style={{ borderColor: '#00FFFF', color: '#00FFFF', background: 'transparent', margin: 0 }} onClick={() => {
                                            setEditingOverrideCompId(editingOverrideCompId === comp.id ? null : comp.id);
                                            setOverrideUrl(comp.championOverrideUrl || '');
                                            setOverrideType(comp.championOverrideType || 'Photo');
                                        }}>{editingOverrideCompId === comp.id ? 'Close' : 'Override'}</button>
                                        {comp.status === 'Judging' && (
                                            <button 
                                                className="adminActionButton approve" 
                                                style={{ borderColor: '#FF69B4', color: '#FF69B4', background: 'transparent', margin: 0 }} 
                                                onClick={() => handleForceRevealResults(comp)}
                                            >
                                                Reveal Results
                                            </button>
                                        )}
                                        {comp.status === 'Results Visible' && !comp.prizesDistributed && (
                                            <button 
                                                className="adminActionButton approve" 
                                                style={{ borderColor: '#FFD700', color: '#FFD700', margin: 0 }} 
                                                onClick={() => handleDistributePrizes(comp)}
                                            >
                                                Distribute
                                            </button>
                                        )}
                                    </div>

                                    {/* FAIL-SAFE CHAMPION OVERRIDE FORM */}
                                    {editingOverrideCompId === comp.id && (
                                        <div style={{ background: '#111', padding: '15px', borderRadius: '8px', marginTop: '12px', border: '1px solid #333' }}>
                                            <p style={{ color: '#00FFFF', fontSize: '13px', fontWeight: 'bold', margin: '0 0 10px 0' }}>🏆 Champion Billboard Fail-Safe Override</p>
                                            
                                            <div style={{ marginBottom: '10px' }}>
                                                <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Override Media URL (YouTube Link or Image Direct Link)</label>
                                                <input 
                                                    type="text" 
                                                    className="formInput" 
                                                    style={{ margin: 0 }}
                                                    value={overrideUrl} 
                                                    onChange={e => setOverrideUrl(e.target.value)} 
                                                    placeholder="Paste Image URL or Video URL..." 
                                                />
                                            </div>

                                            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                                <div style={{ flex: 1 }}>
                                                    <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' }}>Override Type</label>
                                                    <select 
                                                        className="formInput" 
                                                        style={{ margin: 0 }}
                                                        value={overrideType} 
                                                        onChange={e => setOverrideType(e.target.value)}
                                                    >
                                                        <option value="Photo">Image</option>
                                                        <option value="Video">Video (YouTube Embed)</option>
                                                    </select>
                                                </div>
                                                <button 
                                                    className="adminActionButton approve" 
                                                    style={{ padding: '10px 20px', alignSelf: 'flex-end', height: '36px' }}
                                                    onClick={async () => {
                                                        showMessage("Saving override values...");
                                                        try {
                                                            await setDoc(doc(db, "competitions", comp.id), {
                                                                championOverrideUrl: overrideUrl,
                                                                championOverrideType: overrideType
                                                            }, { merge: true });
                                                            showMessage("Override Saved Successfully!");
                                                            setEditingOverrideCompId(null);
                                                        } catch(e) {
                                                            showMessage("Failed to save override values.");
                                                        }
                                                    }}
                                                >
                                                    Save Override
                                                </button>
                                            </div>
                                        </div>
                                    )}
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