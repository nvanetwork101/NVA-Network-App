// src/components/AdminSiteManagerScreen.jsx

import React, { useState, useEffect } from 'react';
import { db, functions, httpsCallable, collection, doc, getDoc, onSnapshot, query, orderBy, updateDoc, setDoc, deleteDoc, where } from '../firebase';
    import formatCurrency from '../utils/formatCurrency';

    function AdminSiteManagerScreen({ showMessage, setActiveScreen, setShowConfirmationModal, setConfirmationTitle, setConfirmationMessage, setOnConfirmationAction, creatorProfile, allUsers, setSelectedUserId }) {
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
    const [submissionsSearchTerm, setSubmissionsSearchTerm] = useState('');
    const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(true);
    const [selectedSubmission, setSelectedSubmission] = useState(null);
    const [diagnosticResults, setDiagnosticResults] = useState(null);
    const [isDiagnosing, setIsDiagnosing] = useState(false);
    const [mmgNumber, setMmgNumber] = useState('');
    const [isCleaning, setIsCleaning] = useState(false);
    const [cleanupResults, setCleanupResults] = useState(null);
    const [isAuditing, setIsAuditing] = useState(false);
    const [auditResults, setAuditResults] = useState(null);

    const [isClearingPins, setIsClearingPins] = useState(false);

    const [isCleaningGhostAccounts, setIsCleaningGhostAccounts] = useState(false);
    const [ghostAccountCleanupResults, setGhostAccountCleanupResults] = useState(null);

    const [isRecalibrating, setIsRecalibrating] = useState(false);
    const [isCleaningTokens, setIsCleaningTokens] = useState(false);
    const [isRecalibratingBadge, setIsRecalibratingBadge] = useState(false); // <-- ADD THIS LINE
    
    // --- STATE FOR ENROLLMENT CONFIG ---
    const [enrollmentConfig, setEnrollmentConfig] = useState({
        filmClubOpen: true,
        docuSeriesOpen: true,
        filmClubFee: 2500,
        docuSeriesFee: 500,
        bothDiscount: 0,
        mmgNumber: '',
        mmgInstructions: '',
        requireProfilePhoto: true,
        requireExperience: true,
        requirePhone: true,
        autoVerifyPayments: false
    });
    const [isEnrollmentConfigLoading, setIsEnrollmentConfigLoading] = useState(true);
    const [hasEnrollmentChanges, setHasEnrollmentChanges] = useState(false);
    
    // --- STATE FOR PAYOUT HISTORY ---
    const [payoutHistory, setPayoutHistory] = useState([]);
    const [payoutHistorySearchTerm, setPayoutHistorySearchTerm] = useState('');
    
    // --- STATE FOR DESTRUCTIVE ACTIONS ---
    const [isResetting, setIsResetting] = useState(false);
    const [resetConfirmationText, setResetConfirmationText] = useState('');
    const [isPurgingFinancials, setIsPurgingFinancials] = useState(false); // [1]

    const handlePurgeFinancials = () => {
        setConfirmationTitle("🚨 Nuke Financial Ledgers?");
        setConfirmationMessage("This will permanently delete all payment pledges, payout requests, payout history logs, transactions, and expenses, and reset all creator totalEarnings to 0. Are you absolutely sure? [1]");
        setOnConfirmationAction(() => async () => {
            setIsPurgingFinancials(true);
            showMessage("Purging financial system records...");
            try {
                const purgeFinancialsCallable = httpsCallable(functions, 'purgeSystemFinancials');
                const result = await purgeFinancialsCallable();
                showMessage(result.data.message);
            } catch (error) {
                showMessage(`Error: ${error.message}`);
            } finally {
                setIsPurgingFinancials(false);
            }
        });
        setShowConfirmationModal(true);
    };
    
    const [isLoadingHistory, setIsLoadingHistory] = useState(true);
    const [isHistoryExpanded, setIsHistoryExpanded] = useState(false); // Start collapsed
    const [isDataIntegrityExpanded, setIsDataIntegrityExpanded] = useState(true);
    // --- STATE FOR SUPPORT HUB CONTENT ---
    const [supportHubContent, setSupportHubContent] = useState({
        hubTitle: '', hubSubtitle: '',
        card1Title: '', card1Desc: '',
        card2Title: '', card2Desc: '',
        card3Title: '', card3Desc: '',
        premiumPerks: [], advertiserPerks: []
    });
    
     // --- STATE FOR LEGAL CONTENT ---
    const [legalContent, setLegalContent] = useState({ privacyPolicy: '', termsOfService: '' });
    const [isLoadingLegalContent, setIsLoadingLegalContent] = useState(true);
    const [hasLegalContentChanges, setHasLegalContentChanges] = useState(false);
    
    const [newPremiumPerk, setNewPremiumPerk] = useState('');
    const [newAdvertiserPerk, setNewAdvertiserPerk] = useState('');
    const [isLoadingSupportContent, setIsLoadingSupportContent] = useState(true);
    const [hasSupportContentChanges, setHasSupportContentChanges] = useState(false);

    useEffect(() => {
        const socialLinksDocRef = doc(db, "settings", "socialLinks");
        const supportHubDocRef = doc(db, "settings", "supportHubContent");

        const homeLayoutDocRef = doc(db, "settings", "homeScreenLayout");

        const legalContentDocRef = doc(db, "settings", "legalContent");

        const unsubSocial = onSnapshot(socialLinksDocRef, (docSnap) => {
           if (docSnap.exists()) {
                const data = docSnap.data();
                setSocialLinks(Array.isArray(data.links) ? [...data.links].sort((a, b) => a.name.localeCompare(b.name)) : []);
                const legalContentDocRef = doc(db, "settings", "legalContent");
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

        const unsubLegal = onSnapshot(legalContentDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setLegalContent(docSnap.data());
            }
            setIsLoadingLegalContent(false);
        });

        const enrollmentConfigDocRef = doc(db, "settings", "enrollmentConfig");
        const unsubEnrollmentConfig = onSnapshot(enrollmentConfigDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setEnrollmentConfig(docSnap.data());
            }
            setIsEnrollmentConfigLoading(false);
        });

        return () => {
            unsubSocial();
            unsubSupport();
            unsubLayout();
            unsubLegal();
            unsubEnrollmentConfig();
        };
    }, []);

        // --- NEW EFFECT FOR PAYOUT HISTORY ---
    useEffect(() => {
        // FIX: Allow both Admin and Super Admin roles to load payout history
        if (creatorProfile.role === 'admin' || creatorProfile.role === 'super_admin') {
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
        } else {
            // For non-admins, simply set loading to false to prevent errors.
            setIsLoadingHistory(false);
        }
    }, [creatorProfile.role]); // Add dependency to re-run if profile changes.

    const handleSupportContentChange = (field, value) => {
        setSupportHubContent(prev => ({ ...prev, [field]: value }));
        setHasSupportContentChanges(true);
    };

        const handleLegalContentChange = (field, value) => {
        setLegalContent(prev => ({ ...prev, [field]: value }));
        setHasLegalContentChanges(true);
    };

    const handleEnrollmentConfigChange = (field, value) => {
        setEnrollmentConfig(prev => ({ ...prev, [field]: value }));
        setHasEnrollmentChanges(true);
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
        setIsSaving(true);
        if (section === 'supportHub') {
            if (!hasSupportContentChanges) { setIsSaving(false); return; }
            showMessage("Saving Support Hub content...");
            try {
                const supportHubDocRef = doc(db, "settings", "supportHubContent");
                await setDoc(supportHubDocRef, supportHubContent, { merge: true });
                showMessage("Support Hub content saved successfully!");
                setHasSupportContentChanges(false);
            } catch (error) { showMessage(`Error: ${error.message}`); }
        } else if (section === 'legalContent') {
            if (!hasLegalContentChanges) { setIsSaving(false); return; }
            showMessage("Saving legal documents...");
            try {
                const legalContentDocRef = doc(db, "settings", "legalContent");
                await setDoc(legalContentDocRef, { ...legalContent, lastUpdatedAt: new Date().toISOString() }, { merge: true });
                showMessage("Legal documents saved successfully!");
                setHasLegalContentChanges(false);
            } catch (error) { showMessage(`Error: ${error.message}`); }
        } else if (section === 'enrollmentConfig') {
            if (!hasEnrollmentChanges) { setIsSaving(false); return; }
            showMessage("Saving Enrollment configurations...");
            try {
                const enrollmentConfigDocRef = doc(db, "settings", "enrollmentConfig");
                await setDoc(enrollmentConfigDocRef, {
                    ...enrollmentConfig,
                    filmClubFee: parseFloat(enrollmentConfig.filmClubFee) || 0,
                    docuSeriesFee: parseFloat(enrollmentConfig.docuSeriesFee) || 0,
                    bothDiscount: parseFloat(enrollmentConfig.bothDiscount) || 0
                }, { merge: true });
                showMessage("Enrollment settings saved successfully!");
                setHasEnrollmentChanges(false);
            } catch (error) { showMessage(`Error: ${error.message}`); }
        } else {
            if (!hasChanges) { setIsSaving(false); return; }
            showMessage("Saving site settings...");
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
        }
        setIsSaving(false);
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
    
   
    const handleFcmTokenCleanup = async () => {
        setIsCleaningTokens(true);
        showMessage("Cleaning up duplicate push notification tokens...");
        try {
            const cleanupFunction = httpsCallable(functions, 'cleanupDuplicateFCMTokens');
            const result = await cleanupFunction();
            showMessage(result.data.message);
        } catch (error) {
            showMessage(`Token cleanup failed: ${error.message}`);
        } finally {
            setIsCleaningTokens(false);
        }
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
     
        const handleRecalibrateBadge = () => {
        const RecalibrateBadgeComponent = () => {
            const [searchTerm, setSearchTerm] = useState('');
            const [selectedUser, setSelectedUser] = useState(null);

            const searchResults = searchTerm.length < 2 ? [] : allUsers
                .filter(user => 
                    user.creatorName?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                    user.email?.toLowerCase().includes(searchTerm.toLowerCase())
                )
                .slice(0, 5);

            const executeRecalibration = async (userId) => {
                setShowConfirmationModal(false);
                setIsRecalibratingBadge(true);
                showMessage(`Recalibrating badge for user: ${userId}...`);
                try {
                    const recalibrateFunction = httpsCallable(functions, 'recalculateUnreadNotifications');
                    const result = await recalibrateFunction({ targetUserId: userId });
                    showMessage(result.data.message);
                } catch (error) {
                    showMessage(`Error: ${error.message}`);
                } finally {
                    setIsRecalibratingBadge(false);
                }
            };

            if (selectedUser) {
                return (
                    <div>
                        <p>Are you sure you want to recalibrate the notification badge for this user?</p>
                        <div className="adminDashboardItem" style={{margin: '20px 0', backgroundColor: '#1A1A1A'}}>
                            <img src={selectedUser.profilePictureUrl || 'https://placehold.co/40x40'} alt="profile" style={{width: 40, height: 40, borderRadius: '50%', marginRight: 15}} />
                            <div style={{flexGrow: 1}}>
                                <p className="adminDashboardItemTitle">{selectedUser.creatorName}</p>
                                <p style={{fontSize: 12, color: '#AAA'}}>{selectedUser.id}</p>
                            </div>
                        </div>
                        <div className="confirmationModalButtons">
                            <button className="confirmationButton cancel" onClick={() => setSelectedUser(null)}>Back to Search</button>
                            <button className="confirmationButton confirm" style={{backgroundColor: '#6A5ACD'}} onClick={() => executeRecalibration(selectedUser.id)}>Confirm & Recalibrate</button>
                        </div>
                    </div>
                );
            }

            return (
                <div>
                    <p>Search for a user by name or email to fix their ghost notification badge.</p>
                    <div className="formGroup" style={{margin: '20px 0'}}>
                        <input 
                            type="text" 
                            className="formInput" 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Start typing to search for a user..."
                            style={{borderColor: '#FFD700'}}
                        />
                    </div>
                    {searchResults.length > 0 && (
                        <div className="dashboardContentList">
                            {searchResults.map(user => (
                                <div key={user.id} className="adminDashboardItem" style={{cursor: 'pointer'}} onClick={() => setSelectedUser(user)}>
                                    <img src={user.profilePictureUrl || 'https://placehold.co/40x40'} alt="profile" style={{width: 40, height: 40, borderRadius: '50%', marginRight: 15}} />
                                    <div style={{flexGrow: 1}}>
                                        <p className="adminDashboardItemTitle">{user.creatorName}</p>
                                        <p style={{fontSize: 12, color: '#AAA'}}>{user.email}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        };

        setConfirmationTitle("Recalibrate User Notification Badge");
        setConfirmationMessage(<RecalibrateBadgeComponent />);
        setOnConfirmationAction(() => () => {}); 
        setShowConfirmationModal(true);
    };

       const handleClearPinnedContent = () => {
        // This component will be rendered inside the confirmation modal
        const ConfirmationComponent = () => {
            const [targetUserId, setTargetUserId] = useState('');

            return (
                <div>
                    <p>This will permanently reset the pinned content array for a specific user. This is useful for correcting data corruption where a user cannot pin new content despite having fewer than 3 visible pins.</p>
                    <div className="formGroup" style={{marginTop: '20px'}}>
                        <label className="formLabel">Enter the User ID to clear:</label>
                        <input 
                            type="text" 
                            className="formInput" 
                            value={targetUserId}
                            onChange={(e) => setTargetUserId(e.target.value)}
                            placeholder="User ID"
                            style={{borderColor: '#FFD700', textAlign: 'center'}}
                        />
                    </div>
                    {/* This button is now inside the modal and handles the final action */}
                    <button 
                        className="button" 
                        style={{backgroundColor: '#DC3545', marginTop: '10px'}}
                        onClick={() => {
                            if (!targetUserId.trim()) {
                                showMessage("User ID cannot be empty.");
                                return;
                            }
                            setShowConfirmationModal(false); // Close the modal first
                            
                            // Define and immediately call the async action
                            (async () => {
                                setIsClearingPins(true);
                                showMessage("Attempting to clear pinned content...");
                                try {
                                    const clearPinsFunction = httpsCallable(functions, 'clearPinnedContent');
                                    const result = await clearPinsFunction({ targetUserId: targetUserId.trim() });
                                    showMessage(result.data.message);
                                } catch (error) {
                                    showMessage(`Error: ${error.message}`);
                                } finally {
                                    setIsClearingPins(false);
                                }
                            })();
                        }}
                    >
                        <span className="buttonText">Clear Pinned Content</span>
                    </button>
                </div>
            );
        };

        // Configure and show the main confirmation modal
        setConfirmationTitle("Clear User's Pinned Content");
        setConfirmationMessage(<ConfirmationComponent />);
        // Set a dummy action for the modal's default "Confirm" button, as our custom component handles the logic.
        setOnConfirmationAction(() => () => {}); 
        setShowConfirmationModal(true);
    };

     const handleResetAllData = () => {
        // This function's only job is to open the modal.
        // It passes a function to the modal that will be executed on confirm.
        const confirmAction = async (inputValue) => {
            if (inputValue !== 'DELETE ALL') {
                showMessage("Confirmation text did not match. Aborting reset.");
                return;
            }
            setIsResetting(true);
            showMessage("Initiating full data reset...");
            try {
                const resetFunction = httpsCallable(functions, 'deleteAllUserDataAndContent');
                const result = await resetFunction();
                showMessage(result.data.message);
            } catch (error) {
                showMessage(`CRITICAL ERROR: ${error.message}`);
            } finally {
                setIsResetting(false);
            }
        };

        // We now need a more advanced confirmation modal that can accept text input.
        // For now, we will use the existing modal and a local state variable.
        // This is the definitive fix for the text input issue.
        const ConfirmationComponent = () => {
            const [inputText, setInputText] = useState('');
            return (
                <div>
                    <p>This will permanently delete ALL users, content, campaigns, events, competitions, pledges, reports, and submissions. Only the admin settings will remain.</p>
                    <p style={{ color: '#DC3545', fontWeight: 'bold' }}>THIS ACTION CANNOT BE UNDONE.</p>
                    <div className="formGroup" style={{marginTop: '20px'}}>
                        <label className="formLabel">To confirm, please type 'DELETE ALL' in the box below:</label>
                        <input 
                            type="text" 
                            className="formInput" 
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value)}
                            placeholder="DELETE ALL"
                            style={{borderColor: '#DC3545', textAlign: 'center'}}
                        />
                    </div>
                    {/* This passes the local input text up to the confirmation action */}
                    <button 
                        className="button" 
                        style={{backgroundColor: '#DC3545', marginTop: '10px'}}
                        onClick={() => {
                            setShowConfirmationModal(false);
                            confirmAction(inputText);
                        }}
                    >
                        <span className="buttonText">PERMANENTLY DELETE ALL DATA</span>
                    </button>
                </div>
            );
        };
        
        // This bypasses the simple setOnConfirmationAction for our custom component
        setConfirmationTitle("⚠️ CONFIRM FULL DATABASE RESET ⚠️");
        setConfirmationMessage(<ConfirmationComponent />);
        setOnConfirmationAction(() => () => {}); // Set a dummy action, as the button inside the component handles it
        setShowConfirmationModal(true);
        };

        const handleAdminTestHostLive = async () => {
            if (!creatorProfile?.uid) {
                showMessage("Error: Admin profile UID not found.");
                return;
            }
            showMessage("Igniting admin-only Live Arena...");
            try {
                await Promise.all([
                    updateDoc(doc(db, "creators", creatorProfile.uid), { isLive: true, liveRoomType: 'roast' }),
                    setDoc(doc(db, "live_arena", creatorProfile.uid), { hostId: creatorProfile.uid, status: 'idle' }, { merge: true })
                ]);
                if (typeof setSelectedUserId === 'function') {
                    setSelectedUserId(creatorProfile.uid);
                }
                setActiveScreen('RoastRoom');
            } catch (error) {
                showMessage(`Test ignition failed: ${error.message}`);
            }
        };
    
        const handleClearOwnFeed = () => {
        setConfirmationTitle("Clear Your Personal Feed?");
        setConfirmationMessage("This will delete all items from your 'My Feed' screen, which is useful for clearing test data after a reset. Are you sure?");
        setOnConfirmationAction(() => async () => {
            showMessage("Clearing your feed...");
            try {
                const clearFeedFunction = httpsCallable(functions, 'clearAdminFeed');
                const result = await clearFeedFunction();
                showMessage(result.data.message);
            } catch (error) {
                showMessage(`Error: ${error.message}`);
            }
        });
        setShowConfirmationModal(true);
    };
    
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
            
            {/* 1. SOCIAL LINKS MANAGER [1] */}
            <div className="dashboardSection">
                <div className="flex justify-between items-center mb-4">
                    <p className="dashboardSectionTitle" style={{marginBottom: 0}}>Social Links Manager</p>
                    <button className="button" onClick={() => handleSaveChanges('siteSettings')} disabled={!hasChanges || isSaving}>
                        <span className="buttonText">{isSaving ? 'Saving...' : 'Save Changes'}</span>
                    </button>
                </div>
                <div className="dashboardContentList">
                    {socialLinks.map((link, index) => (
                        <div key={link.name || index} className="adminDashboardItem" style={{flexDirection: 'column', alignItems: 'stretch', gap: '10px'}}>
                            <div className="flex justify-between items-center">
                                <p className="adminDashboardItemTitle">{link.name}</p>
                                <label className="flex items-center cursor-pointer">
                                    <span className="mr-3 text-sm font-medium text-gray-300">{link.isEnabled ? 'Visible' : 'Hidden'}</span>
                                    <div className="relative">
                                        <input type="checkbox" className="sr-only" checked={link.isEnabled} onChange={(e) => handleUpdateField(`${index}-isEnabled`, e.target.checked)} />
                                        <div className={`block w-14 h-8 rounded-full ${link.isEnabled ? 'bg-green-500' : 'bg-gray-600'}`}></div>
                                        <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${link.isEnabled ? 'transform translate-x-6' : ''}`}></div>
                                    </div>
                                </label>
                            </div>
                            <div className="formGroup" style={{marginBottom: 0}}>
                                <label className="formLabel" style={{fontSize: '12px', color: '#AAA'}}>URL:</label>
                                <input type="url" className="formInput" value={link.url} onChange={(e) => handleUpdateField(`${index}-url`, e.target.value)} placeholder={`Enter full URL for ${link.name}`} />
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            
            {/* 2. LEGAL CONTENT MANAGER [1] */}
            <div className="dashboardSection" style={{ border: '2px solid #00FFFF', marginTop: '20px' }}>
                <div className="flex justify-between items-center mb-4">
                    <p className="dashboardSectionTitle" style={{marginBottom: 0, color: '#00FFFF'}}>Legal Content Manager</p>
                    <button className="button" onClick={() => handleSaveChanges('legalContent')} disabled={!hasLegalContentChanges || isSaving}>
                        <span className="buttonText">{isSaving ? 'Saving...' : 'Save Legal Content'}</span>
                    </button>
                </div>
                {isLoadingLegalContent ? <p>Loading legal content...</p> : (
                    <>
                        {legalContent.lastUpdatedAt && <p className="smallText" style={{textAlign: 'right', color: '#AAA'}}>Last Updated: {new Date(legalContent.lastUpdatedAt).toLocaleString()}</p>}
                        <div className="formGroup">
                            <label className="formLabel">Privacy Policy:</label>
                            <textarea 
                                className="formTextarea" 
                                value={legalContent.privacyPolicy} 
                                onChange={(e) => handleLegalContentChange('privacyPolicy', e.target.value)}
                                rows="15"
                                placeholder="Enter the full text of your Privacy Policy here."
                            />
                        </div>
                        <hr style={{borderColor: '#444', margin: '20px 0'}}/>
                        <div className="formGroup">
                            <label className="formLabel">Terms of Service:</label>
                            <textarea 
                                className="formTextarea" 
                                value={legalContent.termsOfService} 
                                onChange={(e) => handleLegalContentChange('termsOfService', e.target.value)}
                                rows="15"
                                placeholder="Enter the full text of your Terms of Service here."
                            />
                        </div>
                    </>
                )}
            </div>
           {/* --- END: PAYOUT HISTORY SECTION --- */}

            <div className="dashboardSection" style={{marginTop: '20px'}}>
                <p className="dashboardSectionTitle">Contact Form Submissions</p>
                <div className="formGroup" style={{ marginBottom: '1rem' }}>
                    <input
                        type="text"
                        className="formInput"
                        placeholder="Search by name, email, or query type..."
                        value={submissionsSearchTerm}
                        onChange={(e) => setSubmissionsSearchTerm(e.target.value)}
                    />
                </div>
                {isLoadingSubmissions ? <p>Loading submissions...</p> : (
                    <div className="dashboardContentList" style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '10px' }}>
                        {submissions.length === 0 ? <p className="dashboardItem">No submissions yet.</p> : (
                            submissions
                                .filter(sub => 
                                    sub.userName?.toLowerCase().includes(submissionsSearchTerm.toLowerCase()) ||
                                    sub.userEmail?.toLowerCase().includes(submissionsSearchTerm.toLowerCase()) ||
                                    sub.queryType?.toLowerCase().includes(submissionsSearchTerm.toLowerCase())
                                )
                                .map(sub => (
                                    <div key={sub.id} className="adminDashboardItem" onClick={() => handleViewSubmission(sub)} style={{cursor: 'pointer', borderLeft: sub.status === 'New' ? '4px solid #FFD700' : '4px solid transparent'}}>
                                        <div style={{flexGrow: 1}}>
                                            <p className="adminDashboardItemTitle">{sub.queryType} - <span style={{fontWeight: 'normal'}}>{sub.userName}</span></p>
                                            <p style={{fontSize: '12px', color: '#AAA'}}>{new Date(sub.submittedAt).toLocaleString()}</p>
                                        </div>
                                        <span className="adminDashboardItemStatus">{sub.status}</span>
                                    </div>
                                ))
                        )}
                    </div>
                )}
            
            <div className="adminDashboardItem" style={{flexDirection: 'column', alignItems: 'stretch', borderTop: '1px solid #555', marginTop: '20px', paddingTop: '20px'}}>
                        <p className="adminDashboardItemTitle">Clear My Own Feed</p>
                        <p className="paragraph" style={{color: '#AAA', fontSize: '14px'}}>
                            Use this utility after a full data reset to clear any lingering test items from your personal "My Feed" screen.
                        </p>
                        <button className="button" onClick={handleClearOwnFeed} style={{ backgroundColor: '#FF8C00', marginTop: '10px' }}>
                            <span className="buttonText">Clear My Feed</span>
                        </button>
                    </div>

            {selectedSubmission && (<div className="confirmationModalOverlay" style={{zIndex: 2500}}><div className="confirmationModalContent" style={{textAlign: 'left', maxWidth: '500px'}}><p className="confirmationModalTitle">{selectedSubmission.queryType}</p><div className="dashboardItem"><strong>From:</strong> {selectedSubmission.userName}</div><div className="dashboardItem"><strong>Email:</strong> <a href={`mailto:${selectedSubmission.userEmail}`} className="termsLink">{selectedSubmission.userEmail}</a></div><div className="dashboardItem"><strong>Date:</strong> {new Date(selectedSubmission.submittedAt).toLocaleString()}</div><hr style={{borderColor: '#333', margin: '15px 0'}}/><p className="paragraph" style={{backgroundColor: '#0A0A0A', padding: '10px', borderRadius: '5px', whiteSpace: 'pre-wrap'}}>{selectedSubmission.message}</p><div className="confirmationModalButtons"><button className="confirmationButton cancel" onClick={() => confirmDeleteSubmission(selectedSubmission)}>Delete</button><button className="confirmationButton confirm" onClick={() => setSelectedSubmission(null)}>Close</button></div></div></div>)}</div>
            <div className="dashboardSection" style={{ border: '2px solid #FF8C00', marginTop: '20px' }}>
                <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsDataIntegrityExpanded(!isDataIntegrityExpanded)}>
                    <p className="dashboardSectionTitle" style={{ marginBottom: 0 }}>Data Integrity Tools</p>
                    <span className="text-xl font-bold text-white">{isDataIntegrityExpanded ? '▼' : '▶'}</span>
                </div>
                <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isDataIntegrityExpanded ? 'max-h-[5000px]' : 'max-h-0'}`}>
                    <div className="pt-4 border-t mt-4" style={{borderColor: '#3A3A3A'}}>
                        <div className="dashboardSection" style={{ border: '4px solid #DC3545', marginTop: '20px' }}>
                            <p className="dashboardSectionTitle" style={{color: '#DC3545'}}>Destructive Actions</p>
                            <div className="adminDashboardItem" style={{flexDirection: 'column', alignItems: 'stretch'}}>
                                <p className="adminDashboardItemTitle">Reset All User and Content Data</p>
                                <p className="paragraph" style={{color: '#AAA', fontSize: '14px'}}>
                                    This will permanently delete all user-generated data (accounts, content, campaigns, etc.) to prepare the site for public launch. System settings will be preserved.
                                </p>
                                <button className="button" onClick={handleResetAllData} style={{ backgroundColor: '#B22222', marginTop: '10px' }} disabled={isResetting}>
                                    <span className="buttonText">{isResetting ? 'DELETING...' : 'Initiate Full Data Reset'}</span>
                                </button>
                            </div>

                            {/* Airtight Financial Purge Option [1] */}
                            <div className="adminDashboardItem" style={{flexDirection: 'column', alignItems: 'stretch', borderTop: '1px solid rgba(220, 53, 69, 0.2)', marginTop: '20px', paddingTop: '20px'}}>
                                <p className="adminDashboardItemTitle" style={{color: '#FFD700'}}>Purge & Reset System Financials</p>
                                <p className="paragraph" style={{color: '#AAA', fontSize: '14px'}}>
                                    This will permanently wipe all financial pledges, payout requests, history logs, transactions, and expenses. It resets all creator earnings and virtual token balances to zero [1].
                                </p>
                                <button className="button" onClick={handlePurgeFinancials} style={{ backgroundColor: '#DC3545', marginTop: '10px' }} disabled={isPurgingFinancials}>
                                    <span className="buttonText">{isPurgingFinancials ? 'PURGING...' : 'Nuke Financial Ledgers'}</span>
                                </button>
                            </div>
                        </div>
                        <p className="dashboardItem" style={{ color: '#AAA', marginBottom: '20px' }}>Use these tools to perform database maintenance. These are powerful actions. Use with caution.</p>
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
                        
                        <div style={{ borderTop: '1px solid #444', paddingTop: '20px', marginBottom: '20px' }}>
                            <button className="button" onClick={handleRecalibrateBadge} style={{ backgroundColor: '#6A5ACD' }} disabled={isRecalibratingBadge}>
                                <span className="buttonText">{isRecalibratingBadge ? 'Working...' : 'Recalibrate User Notification Badge'}</span>
                            </button>
                            <p className="paragraph" style={{color: '#AAA', fontSize: '14px', marginTop: '10px'}}>
                                Fixes any user's account if their notification bell shows a count but their inbox is empty.
                            </p>
                        </div>
                        
                        <div style={{ borderTop: '1px solid #444', paddingTop: '20px', marginBottom: '20px' }}>
                            <button className="button" onClick={handleFcmTokenCleanup} style={{ backgroundColor: '#1E90FF' }} disabled={isCleaningTokens}>
                                <span className="buttonText">{isCleaningTokens ? 'Cleaning...' : 'Clean Up FCM Tokens'}</span>
                            </button>
                            <p className="paragraph" style={{color: '#AAA', fontSize: '14px', marginTop: '10px'}}>
                                Removes duplicate push notification tokens from all user profiles for better performance.
                            </p>
                        </div>
                        <div style={{ borderTop: '1px solid #444', paddingTop: '20px', marginBottom: '20px' }}>
                            <button className="button" onClick={handleClearPinnedContent} style={{ backgroundColor: '#4F46E5' }} disabled={isClearingPins}>
                                <span className="buttonText">{isClearingPins ? 'Clearing...' : 'Clear User Pinned Content'}</span>
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
                </div>
            </div>
            {/* === ADMIN LIVE ARENA TESTER (HIDDEN FROM PUBLIC) === */}
            <div className="dashboardSection" style={{ border: '2px solid #FF4500', marginTop: '20px' }}>
                <p className="dashboardSectionTitle" style={{ color: '#FF4500' }}>🛠️ Admin Live Arena Tester</p>
                <p className="paragraph" style={{ color: '#AAA', fontSize: '13px', marginBottom: '15px' }}>
                    Surgically launch and enter the Live Arena under your Admin account for end-to-end sandbox testing. This bypasses all public dashboard listings.
                </p>
                <button className="button" onClick={handleAdminTestHostLive} style={{ backgroundColor: '#FF4500', margin: 0 }}>
                    <span className="buttonText">🎙️ Host Test Live (Admin-Only)</span>
                </button>
            </div>

            <div className="dashboardSection" style={{ border: '2px solid #00FFFF', marginTop: '20px' }}><p className="dashboardSectionTitle">System Status</p><button className="button" onClick={handleRunDiagnostics} style={{ backgroundColor: '#008080' }} disabled={isDiagnosing}><span className="buttonText">{isDiagnosing ? 'Running...' : 'Run System Diagnostics'}</span></button>{diagnosticResults && (<div style={{ marginTop: '15px', color: '#FFF' }}>{diagnosticResults.error ? (<p style={{ color: '#DC3545' }}>Error: {diagnosticResults.error}</p>) : (<table style={{ width: '100%', borderCollapse: 'collapse' }}><tbody><tr style={{ borderBottom: '1px solid #3A3A3A' }}><td style={{ padding: '8px 0', fontWeight: 'bold' }}>Project ID:</td><td style={{ textAlign: 'right' }}>{diagnosticResults.projectID}</td></tr><tr style={{ borderBottom: '1px solid #3A3A3A' }}><td style={{ padding: '8px 0', fontWeight: 'bold' }}>Database Connectivity:</td><td style={{ textAlign: 'right', color: diagnosticResults.dbConnectivity === 'Success' ? '#00FF00' : '#DC3545', fontWeight: 'bold' }}>{diagnosticResults.dbConnectivity}</td></tr></tbody></table>)}</div>)}</div>
        </div>
    );
}

export default AdminSiteManagerScreen;