// src/components/AdminSiteManagerScreen.jsx

import React, { useState, useEffect } from 'react';
import { db, functions, httpsCallable, collection, doc, getDoc, onSnapshot, query, orderBy, updateDoc, setDoc, deleteDoc, where } from '../firebase';
    import formatCurrency from '../utils/formatCurrency';

    function AdminSiteManagerScreen({ showMessage, setActiveScreen, setShowConfirmationModal, setConfirmationTitle, setConfirmationMessage, setOnConfirmationAction, creatorProfile }) {
    const [socialLinks, setSocialLinks] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [hasChanges, setHasChanges] = useState(false);
    
    const [showNvaCharts, setShowNvaCharts] = useState(false);

    const [isLeaderboardEnabled, setIsLeaderboardEnabled] = useState(false);
    const [premiumPrice, setPremiumPrice] = useState(1.99);
    const [ticketPrice, setTicketPrice] = useState(5.00);
    const [promotedStatusPrice, setPromotedStatusPrice] = useState(10.00);
    const [isTicketedEvent, setIsTicketedEvent] = useState(false);
    const [submissions, setSubmissions] = useState([]);
    const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(true);
    const [selectedSubmission, setSelectedSubmission] = useState(null);
    const [diagnosticResults, setDiagnosticResults] = useState(null);
    const [isDiagnosing, setIsDiagnosing] = useState(false);
    const [mmgNumber, setMmgNumber] = useState('');
    const [isCleaning, setIsCleaning] = useState(false);
    const [cleanupResults, setCleanupResults] = useState(null);
    const [isAuditing, setIsAuditing] = useState(false);
    const [auditResults, setAuditResults] = useState(null);

    const [isCleaningGhostAccounts, setIsCleaningGhostAccounts] = useState(false);
    const [ghostAccountCleanupResults, setGhostAccountCleanupResults] = useState(null);

    // --- STATE FOR PAYOUT HISTORY ---
    const [payoutHistory, setPayoutHistory] = useState([]);
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [isHistoryExpanded, setIsHistoryExpanded] = useState(false); // Start collapsed

    // --- STATE FOR SUPPORT HUB CONTENT ---
    const [supportHubContent, setSupportHubContent] = useState({
        hubTitle: '', hubSubtitle: '',
        card1Title: '', card1Desc: '',
        card2Title: '', card2Desc: '',
        card3Title: '', card3Desc: '',
        premiumPerks: [], advertiserPerks: []
    });
    const [newPremiumPerk, setNewPremiumPerk] = useState('');
    const [newAdvertiserPerk, setNewAdvertiserPerk] = useState('');
    const [isLoadingSupportContent, setIsLoadingSupportContent] = useState(true);
    const [hasSupportContentChanges, setHasSupportContentChanges] = useState(false);

    useEffect(() => {
        const socialLinksDocRef = doc(db, "settings", "socialLinks");
        const supportHubDocRef = doc(db, "settings", "supportHubContent");

        const homeLayoutDocRef = doc(db, "settings", "homeScreenLayout");

        const unsubSocial = onSnapshot(socialLinksDocRef, (docSnap) => {
           if (docSnap.exists()) {
                const data = docSnap.data();
                setSocialLinks(Array.isArray(data.links) ? [...data.links].sort((a, b) => a.name.localeCompare(b.name)) : []);
                setIsLeaderboardEnabled(data.isLeaderboardEnabled ?? false);
                setPremiumPrice(data.premiumPrice ?? 1.99);
                setTicketPrice(data.ticketPrice ?? 5.00);
                setPromotedStatusPrice(data.promotedStatusPrice ?? 10.00);
                setIsTicketedEvent(data.isTicketedEvent ?? false);
                setMmgNumber(data.mmgNumber ?? '');
            }
            setIsLoading(false);
        });
        
        const unsubSupport = onSnapshot(supportHubDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setSupportHubContent(docSnap.data());
            }
            setIsLoadingSupportContent(false);
        });

        const unsubLayout = onSnapshot(homeLayoutDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setShowNvaCharts(docSnap.data().showNvaCharts ?? false);
            }
        });

        return () => {
            unsubSocial();
            unsubSupport();
            unsubLayout();
        };
    }, []);

        // --- NEW EFFECT FOR PAYOUT HISTORY ---
    useEffect(() => {
    const historyQuery = query(
        collection(db, "payoutRequests"),
        where("status", "in", ["paid", "dismissed"]),
        orderBy("requestedAt", "desc")
    );
    const unsubscribe = onSnapshot(historyQuery, (snapshot) => {
        setPayoutHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        setIsLoadingHistory(false);
    }, (error) => {
        showMessage("Failed to load payout history: " + error.message);
        setIsLoadingHistory(false);
    });

    return () => unsubscribe();
}, []);

    const handleSupportContentChange = (field, value) => {
        setSupportHubContent(prev => ({ ...prev, [field]: value }));
        setHasSupportContentChanges(true);
    };

    const handleAddPerk = (type) => {
        setHasSupportContentChanges(true);
        if (type === 'premium') {
            if (!newPremiumPerk.trim()) return;
            setSupportHubContent(prev => ({ ...prev, premiumPerks: [...prev.premiumPerks, newPremiumPerk] }));
            setNewPremiumPerk('');
        } else {
            if (!newAdvertiserPerk.trim()) return;
            setSupportHubContent(prev => ({ ...prev, advertiserPerks: [...prev.advertiserPerks, newAdvertiserPerk] }));
            setNewAdvertiserPerk('');
        }
    };
    
    const handleRemovePerk = (type, index) => {
        setHasSupportContentChanges(true);
        if (type === 'premium') {
            setSupportHubContent(prev => ({ ...prev, premiumPerks: prev.premiumPerks.filter((_, i) => i !== index) }));
        } else {
            setSupportHubContent(prev => ({ ...prev, advertiserPerks: prev.advertiserPerks.filter((_, i) => i !== index) }));
        }
    };
    
    const handleSaveChanges = async (section) => {
        if (section === 'supportHub') {
            if (!hasSupportContentChanges) return;
            setIsSaving(true); showMessage("Saving Support Hub content...");
            try {
                const supportHubDocRef = doc(db, "settings", "supportHubContent");
                await setDoc(supportHubDocRef, supportHubContent, { merge: true });
                showMessage("Support Hub content saved successfully!");
                setHasSupportContentChanges(false);
            } catch (error) { showMessage(`Error: ${error.message}`); }
            finally { setIsSaving(false); }
        } else {
             if (!hasChanges) return;
            setIsSaving(true); showMessage("Saving site settings...");
            try {
                const socialLinksDocRef = doc(db, "settings", "socialLinks");
                const homeLayoutDocRef = doc(db, "settings", "homeScreenLayout");
                await Promise.all([
                    setDoc(socialLinksDocRef, { links: socialLinks, premiumPrice: parseFloat(premiumPrice), ticketPrice: parseFloat(ticketPrice), promotedStatusPrice: parseFloat(promotedStatusPrice), isTicketedEvent, mmgNumber }, { merge: true }),
                    setDoc(homeLayoutDocRef, { showNvaCharts: showNvaCharts }, { merge: true })
                ]);
                showMessage("Site settings saved successfully!");
                setHasChanges(false);
            } catch (error) { showMessage(`Error saving changes: ${error.message}`); }
            finally { setIsSaving(false); }
        }
    };

    useEffect(() => { setIsLoadingSubmissions(true); const submissionsRef = collection(db, "contactSubmissions"); const q = query(submissionsRef, orderBy("submittedAt", "desc")); const unsubscribe = onSnapshot(q, (snapshot) => { setSubmissions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))); setIsLoadingSubmissions(false); }, (error) => { showMessage("Failed to load submissions."); setIsLoadingSubmissions(false); }); return () => unsubscribe(); }, []);
    const handleRunDiagnostics = async () => { setIsDiagnosing(true); setDiagnosticResults(null); showMessage("Running system diagnostics..."); try { const runDiagnosticsCallable = httpsCallable(functions, 'runSystemDiagnostics'); const result = await runDiagnosticsCallable(); setDiagnosticResults(result.data.diagnosticResults); showMessage("Diagnostics complete."); } catch (error) { showMessage(`Diagnostics failed: ${error.message}`); setDiagnosticResults({ error: error.message }); } finally { setIsDiagnosing(false); } };
    const handleCleanup = async () => { setIsCleaning(true); setCleanupResults("Initiating cleanup..."); showMessage("Starting ghost artifact cleanup..."); try { const cleanupCallable = httpsCallable(functions, 'cleanupGhostArtifacts'); const result = await cleanupCallable(); setCleanupResults(result.data.message); showMessage("Cleanup process finished!"); } catch (error) { const errorMessage = `Cleanup failed: ${error.message}`; setCleanupResults(errorMessage); showMessage(errorMessage); } finally { setIsCleaning(false); } };
    const confirmCleanup = () => { setConfirmationTitle("Confirm Database Cleanup"); setConfirmationMessage("This will permanently delete all old artifact documents that do not match the stable 'production-app-id'. This action is irreversible. Are you absolutely sure you want to proceed?"); setOnConfirmationAction(() => () => handleCleanup()); setShowConfirmationModal(true); };
    
    const handleGhostAccountCleanup = async () => {
        setIsCleaningGhostAccounts(true);
        setGhostAccountCleanupResults("Initiating cleanup...");
        showMessage("Starting ghost account cleanup...");
        try {
            const cleanupCallable = httpsCallable(functions, 'manualGhostCleanup');
            const result = await cleanupCallable();
            setGhostAccountCleanupResults(result.data.message);
            showMessage("Ghost account cleanup process finished!");
        } catch (error) {
            const errorMessage = `Ghost account cleanup failed: ${error.message}`;
            setGhostAccountCleanupResults(errorMessage);
            showMessage(errorMessage);
        } finally {
            setIsCleaningGhostAccounts(false);
        }
    };

    const confirmGhostAccountCleanup = () => {
        setConfirmationTitle("Confirm Ghost Account Cleanup");
        setConfirmationMessage("This will permanently delete user profiles from the database that no longer have a matching login account. This action is irreversible. Are you sure you want to proceed?");
        setOnConfirmationAction(() => () => handleGhostAccountCleanup());
        setShowConfirmationModal(true);
    };
    
    const handleBackfill = async () => {
        setIsCleaning(true); // Reuse existing loading state
        setCleanupResults("Initiating follower data backfill...");
        showMessage("Starting backfill...");
        try {
            const backfillFunction = httpsCallable(functions, 'backfillFollowerData');
            const result = await backfillFunction();
            setCleanupResults(result.data.message);
            showMessage("Backfill process finished!");
        } catch (error) {
            const errorMessage = `Backfill failed: ${error.message}`;
            setCleanupResults(errorMessage);
            showMessage(errorMessage);
        } finally {
            setIsCleaning(false);
        }
    };
    const handleRunAudit = async () => { setIsAuditing(true); setAuditResults("Starting data integrity audit..."); showMessage("Starting data integrity audit..."); try { const auditFunction = httpsCallable(functions, 'runDataIntegrityAudit'); const result = await auditFunction(); setAuditResults(result.data.summary); showMessage("Audit complete! See results below."); } catch (error) { const errorMessage = `Audit failed: ${error.message}`; setAuditResults({ error: errorMessage }); showMessage(errorMessage); } finally { setIsAuditing(false); } };
    const handleUpdateField = (fieldName, value) => {
        if (fieldName === 'showNvaCharts') {
            setShowNvaCharts(value);
        } else {
            const [index, field] = fieldName.split('-');
            const updatedLinks = [...socialLinks];
            updatedLinks[parseInt(index)][field] = value;
            setSocialLinks(updatedLinks);
        }
        setHasChanges(true);
    };
    const handleViewSubmission = async (submission) => { setSelectedSubmission(submission); if (submission.status === 'New') { try { await updateDoc(doc(db, "contactSubmissions", submission.id), { status: 'Read' }); } catch (error) { console.error("Error marking submission as read:", error); } } };
    const deleteSubmissionLogic = async (submissionId) => { showMessage("Deleting submission..."); try { await deleteDoc(doc(db, "contactSubmissions", submissionId)); setSelectedSubmission(null); showMessage("Submission deleted successfully."); } catch (error) { showMessage(`Failed to delete submission: ${error.message}`); } };
    const confirmDeleteSubmission = (submission) => { setSelectedSubmission(null); setConfirmationTitle("Delete Submission?"); setConfirmationMessage(`Are you sure you want to permanently delete this message from "${submission.userName}"? This action cannot be undone.`); setOnConfirmationAction(() => () => deleteSubmissionLogic(submission.id)); setShowConfirmationModal(true); };
    if (isLoading) { return <div className="screenContainer"><p className="heading">Loading Site Settings...</p></div>; }
    const currentUserRole = creatorProfile ? creatorProfile.role : 'user';

        return (
        <div className="screenContainer">
            <p className="heading">Site Management</p>
            
            <div className="dashboardSection" style={{ border: '2px solid #00FF00', marginTop: '20px' }}>
                <div className="flex justify-between items-center mb-4">
                    <p className="dashboardSectionTitle" style={{marginBottom: 0, color: '#00FF00'}}>Support Hub Content</p>
                    <button className="button" onClick={() => handleSaveChanges('supportHub')} disabled={!hasSupportContentChanges || isSaving}>
                        <span className="buttonText">{isSaving ? 'Saving...' : 'Save Hub Content'}</span>
                    </button>
                </div>
                {isLoadingSupportContent ? <p>Loading content...</p> : (
                    <>
                        <div className="formGroup"><label className="formLabel">Hub Main Title:</label><input type="text" className="formInput" value={supportHubContent.hubTitle} onChange={(e) => handleSupportContentChange('hubTitle', e.target.value)} /></div>
                        <div className="formGroup"><label className="formLabel">Hub Subtitle:</label><textarea className="formTextarea" value={supportHubContent.hubSubtitle} onChange={(e) => handleSupportContentChange('hubSubtitle', e.target.value)} /></div>
                        <hr style={{borderColor: '#444', margin: '20px 0'}}/>
                        <div className="formGroup"><label className="formLabel">Premium Card Title:</label><input type="text" className="formInput" value={supportHubContent.card1Title} onChange={(e) => handleSupportContentChange('card1Title', e.target.value)} /></div>
                        <div className="formGroup"><label className="formLabel">Premium Card Description:</label><input type="text" className="formInput" value={supportHubContent.card1Desc} onChange={(e) => handleSupportContentChange('card1Desc', e.target.value)} /></div>
                        <div className="formGroup"><label className="formLabel">Advertiser Card Title:</label><input type="text" className="formInput" value={supportHubContent.card2Title} onChange={(e) => handleSupportContentChange('card2Title', e.target.value)} /></div>
                        <div className="formGroup"><label className="formLabel">Advertiser Card Description:</label><input type="text" className="formInput" value={supportHubContent.card2Desc} onChange={(e) => handleSupportContentChange('card2Desc', e.target.value)} /></div>
                        <div className="formGroup"><label className="formLabel">Campaign Card Title:</label><input type="text" className="formInput" value={supportHubContent.card3Title} onChange={(e) => handleSupportContentChange('card3Title', e.target.value)} /></div>
                        <div className="formGroup"><label className="formLabel">Campaign Card Description:</label><input type="text" className="formInput" value={supportHubContent.card3Desc} onChange={(e) => handleSupportContentChange('card3Desc', e.target.value)} /></div>
                        <hr style={{borderColor: '#444', margin: '20px 0'}}/>
                        <div>
                            <label className="formLabel">Premium Perks List:</label>
                            {supportHubContent.premiumPerks?.map((perk, index) => (<div key={index} className="adminDashboardItem"><span className="flex-grow">{perk}</span><button onClick={() => handleRemovePerk('premium', index)} className="adminActionButton reject">Delete</button></div>))}
                            <div className="flex items-end gap-4 mt-2"><input type="text" className="formInput flex-grow" value={newPremiumPerk} onChange={(e) => setNewPremiumPerk(e.target.value)} placeholder="Add new perk..." /><button onClick={() => handleAddPerk('premium')} className="button m-0"><span className="buttonText">Add</span></button></div>
                        </div>
                        <hr style={{borderColor: '#444', margin: '20px 0'}}/>
                        <div>
                            <label className="formLabel">Advertiser Perks List:</label>
                            {supportHubContent.advertiserPerks?.map((perk, index) => (<div key={index} className="adminDashboardItem"><span className="flex-grow">{perk}</span><button onClick={() => handleRemovePerk('advertiser', index)} className="adminActionButton reject">Delete</button></div>))}
                            <div className="flex items-end gap-4 mt-2"><input type="text" className="formInput flex-grow" value={newAdvertiserPerk} onChange={(e) => setNewAdvertiserPerk(e.target.value)} placeholder="Add new perk..." /><button onClick={() => handleAddPerk('advertiser')} className="button m-0"><span className="buttonText">Add</span></button></div>
                        </div>
                    </>
                )}
            </div>

            <div className="dashboardSection"><div className="flex justify-between items-center mb-4"><p className="dashboardSectionTitle" style={{marginBottom: 0}}>Social Links Manager</p><button className="button" onClick={() => handleSaveChanges('siteSettings')} disabled={!hasChanges || isSaving}><span className="buttonText">{isSaving ? 'Saving...' : 'Save Changes'}</span></button></div><div className="dashboardContentList">{socialLinks.map((link, index) => (<div key={link.name || index} className="adminDashboardItem" style={{flexDirection: 'column', alignItems: 'stretch', gap: '10px'}}><div className="flex justify-between items-center"><p className="adminDashboardItemTitle">{link.name}</p><label className="flex items-center cursor-pointer"><span className="mr-3 text-sm font-medium text-gray-300">{link.isEnabled ? 'Visible' : 'Hidden'}</span><div className="relative"><input type="checkbox" className="sr-only" checked={link.isEnabled} onChange={(e) => handleUpdateField(`${index}-isEnabled`, e.target.checked)} /><div className={`block w-14 h-8 rounded-full ${link.isEnabled ? 'bg-green-500' : 'bg-gray-600'}`}></div><div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${link.isEnabled ? 'transform translate-x-6' : ''}`}></div></div></label></div><div className="formGroup" style={{marginBottom: 0}}><label className="formLabel" style={{fontSize: '12px', color: '#AAA'}}>URL:</label><input type="url" className="formInput" value={link.url} onChange={(e) => handleUpdateField(`${index}-url`, e.target.value)} placeholder={`Enter full URL for ${link.name}`} /></div></div>))}</div></div>
            <div className="dashboardSection"><p className="dashboardSectionTitle">Feature Toggles</p><div className="adminDashboardItem"><p className="adminDashboardItemTitle" style={{fontWeight: 'normal'}}>Show NVA Network Charts on Home Screen</p><label className="flex items-center cursor-pointer"><span className="mr-3 text-sm font-medium text-gray-300">{showNvaCharts ? 'Enabled' : 'Disabled'}</span><div className="relative"><input type="checkbox" className="sr-only" checked={showNvaCharts} onChange={(e) => handleUpdateField('showNvaCharts', e.target.checked)} /><div className={`block w-14 h-8 rounded-full ${showNvaCharts ? 'bg-green-500' : 'bg-gray-600'}`}></div><div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${showNvaCharts ? 'transform translate-x-6' : ''}`}></div></div></label></div></div>
            <div className="dashboardSection"><p className="dashboardSectionTitle">Monetization Settings</p><div className="adminDashboardItem"><p className="adminDashboardItemTitle" style={{fontWeight: 'normal'}}>Premium Subscription Price (USD)</p><input type="number" className="formInput" value={premiumPrice} onChange={(e) => { setPremiumPrice(e.target.value); setHasChanges(true); }} style={{width: '100px', textAlign: 'right'}} /></div><div className="adminDashboardItem"><p className="adminDashboardItemTitle" style={{fontWeight: 'normal'}}>Promoted Status Price (USD)</p><input type="number" className="formInput" value={promotedStatusPrice} onChange={(e) => { setPromotedStatusPrice(e.target.value); setHasChanges(true); }} style={{width: '100px', textAlign: 'right'}} /></div>{currentUserRole === 'admin' && (<div className="adminDashboardItem"><p className="adminDashboardItemTitle" style={{fontWeight: 'normal', color: '#FFD700'}}>MMG Account Number</p><input type="text" className="formInput" value={mmgNumber} onChange={(e) => { setMmgNumber(e.target.value); setHasChanges(true); }} placeholder="Enter MMG number..." style={{width: '200px', textAlign: 'right'}} /></div>)}</div>

                {/* --- START: PAYOUT HISTORY SECTION --- */}
            <div className="dashboardSection" style={{marginTop: '20px'}}>
                <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}>
                    <p className="dashboardSectionTitle" style={{ marginBottom: 0 }}>Payout History ({payoutHistory.length})</p>
                    <span className="text-xl font-bold text-white">{isHistoryExpanded ? '▼' : '▶'}</span>
                </div>
                <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isHistoryExpanded ? 'max-h-[5000px]' : 'max-h-0'}`}>
                    <div className="pt-4 border-t mt-4" style={{borderColor: '#3A3A3A'}}>
                        {isLoadingHistory ? <p>Loading history...</p> : payoutHistory.length === 0 ? <p className="dashboardItem">No processed payouts found.</p> : (
                            <div className="dashboardContentList" style={{maxHeight: '400px', overflowY: 'auto', paddingRight: '10px'}}>
                                {payoutHistory.map((req, index) => (
    <div key={req.id} style={{
        padding: '15px 0',
        borderBottom: index === payoutHistory.length - 1 ? 'none' : '1px solid #444' // Add separator to all but the last item
    }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center', marginBottom: '10px' }}>
            <div>
                <p className="adminDashboardItemTitle" style={{ margin: 0 }}>{req.campaignTitle}</p>
                <p className="text-sm" style={{ color: '#CCC', margin: 0 }}>by {req.creatorName} on {req.requestedAt?.toDate().toLocaleDateString()}</p>
            </div>
            <span style={{
                fontSize: '12px',
                fontWeight: 'bold',
                color: '#FFFFFF',
                backgroundColor: req.status === 'paid' ? '#28a745' : '#6c757d',
                padding: '5px 12px',
                borderRadius: '20px',
                textTransform: 'uppercase'
            }}>
                {req.status}
            </span>
        </div>

        <div style={{ fontSize: '14px', color: '#DDD', padding: '10px', backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: '6px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span><strong>Legal Name:</strong> {req.legalName || 'N/A'}</span>
                <span><strong>MMG Phone:</strong> {req.mmgPhoneNumber || 'N/A'}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #555', paddingTop: '8px' }}>
                <span>Total Raised: {formatCurrency(req.amountRaised, 'USD', { USD: 1 })}</span>
                <span style={{ color: '#DC3545' }}>Fee: -{formatCurrency(req.amountRaised * 0.07, 'USD', { USD: 1 })}</span>
                <strong style={{ color: '#00FF00' }}>Net Payout: {formatCurrency(req.netAmount, 'USD', { USD: 1 })}</strong>
            </div>
        </div>
    </div>
))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            {/* --- END: PAYOUT HISTORY SECTION --- */}

            <div className="dashboardSection" style={{marginTop: '20px'}}><p className="dashboardSectionTitle">Contact Form Submissions</p>{isLoadingSubmissions ? <p>Loading submissions...</p> : (<div className="dashboardContentList">{submissions.length === 0 ? <p className="dashboardItem">No submissions yet.</p> : (submissions.map(sub => (<div key={sub.id} className="adminDashboardItem" onClick={() => handleViewSubmission(sub)} style={{cursor: 'pointer', borderLeft: sub.status === 'New' ? '4px solid #FFD700' : '4px solid transparent'}}><div style={{flexGrow: 1}}><p className="adminDashboardItemTitle">{sub.queryType} - <span style={{fontWeight: 'normal'}}>{sub.userName}</span></p><p style={{fontSize: '12px', color: '#AAA'}}>{new Date(sub.submittedAt).toLocaleString()}</p></div><span className="adminDashboardItemStatus">{sub.status}</span></div>)))}</div>)}{selectedSubmission && (<div className="confirmationModalOverlay" style={{zIndex: 2500}}><div className="confirmationModalContent" style={{textAlign: 'left', maxWidth: '500px'}}><p className="confirmationModalTitle">{selectedSubmission.queryType}</p><div className="dashboardItem"><strong>From:</strong> {selectedSubmission.userName}</div><div className="dashboardItem"><strong>Email:</strong> <a href={`mailto:${selectedSubmission.userEmail}`} className="termsLink">{selectedSubmission.userEmail}</a></div><div className="dashboardItem"><strong>Date:</strong> {new Date(selectedSubmission.submittedAt).toLocaleString()}</div><hr style={{borderColor: '#333', margin: '15px 0'}}/><p className="paragraph" style={{backgroundColor: '#0A0A0A', padding: '10px', borderRadius: '5px', whiteSpace: 'pre-wrap'}}>{selectedSubmission.message}</p><div className="confirmationModalButtons"><button className="confirmationButton cancel" onClick={() => confirmDeleteSubmission(selectedSubmission)}>Delete</button><button className="confirmationButton confirm" onClick={() => setSelectedSubmission(null)}>Close</button></div></div></div>)}</div>
            <div className="dashboardSection" style={{ border: '2px solid #FF8C00', marginTop: '20px' }}>
    <p className="dashboardSectionTitle">Data Integrity Tools</p>
    <p className="dashboardItem" style={{ color: '#AAA', marginBottom: '20px' }}>Use these tools to perform database maintenance. These are powerful actions. Use with caution.</p>
    
    {/* --- THIS IS THE NEW SECTION FOR OUR GHOST ACCOUNT BUTTON --- */}
    <div style={{ marginBottom: '20px' }}>
        <button className="button" onClick={confirmGhostAccountCleanup} style={{ backgroundColor: '#B22222' }} disabled={isCleaningGhostAccounts}>
            <span className="buttonText">{isCleaningGhostAccounts ? 'Cleaning...' : 'Clean Up Ghost Accounts'}</span>
        </button>
        {ghostAccountCleanupResults && (
            <p className="paragraph" style={{ marginTop: '15px', backgroundColor: '#1A1A1A', padding: '10px', borderRadius: '5px', whiteSpace: 'pre-wrap' }}>
                {ghostAccountCleanupResults}
            </p>
        )}
    </div>

    {/* --- The existing tools are now separated for clarity --- */}
    <div style={{ borderTop: '1px solid #444', paddingTop: '20px', marginBottom: '20px' }}>
        <button className="button" onClick={confirmCleanup} style={{ backgroundColor: '#DC3545' }} disabled={isCleaning}>
            <span className="buttonText">{isCleaning ? 'Cleaning...' : 'Clean Up Ghost Artifacts'}</span>
        </button>
        {cleanupResults && (
            <p className="paragraph" style={{ marginTop: '15px', backgroundColor: '#1A1A1A', padding: '10px', borderRadius: '5px', whiteSpace: 'pre-wrap' }}>
                {cleanupResults}
            </p>
        )}
    </div>

    <div style={{ borderTop: '1px solid #444', paddingTop: '20px', marginBottom: '20px' }}>
        <button className="button" onClick={handleBackfill} style={{ backgroundColor: '#008000' }} disabled={isCleaning}>
            <span className="buttonText">{isCleaning ? 'Processing...' : 'Backfill Follower Data'}</span>
        </button>
    </div>

    <div style={{ borderTop: '1px solid #444', paddingTop: '20px' }}>
        <button className="button" onClick={handleRunAudit} style={{ backgroundColor: '#FFD700' }} disabled={isAuditing}>
            <span className="buttonText" style={{color: '#0A0A1A'}}>{isAuditing ? 'Auditing...' : 'Run Full Data Integrity Audit'}</span>
        </button>
        {auditResults && (
            <div style={{marginTop: '15px'}}>
                <p className="dashboardSectionTitle" style={{fontSize: '16px'}}>Audit Results:</p>
                <pre className="paragraph" style={{ backgroundColor: '#1A1A1A', padding: '10px', borderRadius: '5px', whiteSpace: 'pre-wrap', color: '#00FF00', fontSize: '12px' }}>
                    {JSON.stringify(auditResults, null, 2)}
                </pre>
            </div>
        )}
    </div>
</div>
            <div className="dashboardSection" style={{ border: '2px solid #00FFFF', marginTop: '20px' }}><p className="dashboardSectionTitle">System Status</p><button className="button" onClick={handleRunDiagnostics} style={{ backgroundColor: '#008080' }} disabled={isDiagnosing}><span className="buttonText">{isDiagnosing ? 'Running...' : 'Run System Diagnostics'}</span></button>{diagnosticResults && (<div style={{ marginTop: '15px', color: '#FFF' }}>{diagnosticResults.error ? (<p style={{ color: '#DC3545' }}>Error: {diagnosticResults.error}</p>) : (<table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody><tr style={{ borderBottom: '1px solid #3A3A3A' }}><td style={{ padding: '8px 0', fontWeight: 'bold' }}>Project ID:</td><td style={{ textAlign: 'right' }}>{diagnosticResults.projectID}</td></tr><tr style={{ borderBottom: '1px solid #3A3A3A' }}><td style={{ padding: '8px 0', fontWeight: 'bold' }}>Database Connectivity:</td><td style={{ textAlign: 'right', color: diagnosticResults.dbConnectivity === 'Success' ? '#00FF00' : '#DC3545', fontWeight: 'bold' }}>{diagnosticResults.dbConnectivity}</td></tr></tbody></table>)}</div>)}</div>
        </div>
    );
}

export default AdminSiteManagerScreen;