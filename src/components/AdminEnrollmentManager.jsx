import React, { useState, useEffect, useCallback } from 'react';
// DEFINITIVE FIX: Imported getDocs, query, and where for direct creator lookups
import { db, functions, httpsCallable, doc, onSnapshot, setDoc, collection, deleteDoc, getDocs, query, where, updateDoc, getDoc } from '../firebase';
import RoleBadge from './RoleBadge'; // THE FIX: Import the badge component to prevent the ReferenceError

const AdminEnrollmentManager = ({ showMessage, setActiveScreen, setSelectedUserId }) => {
    const [applications, setApplications] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('pending');
    const [error, setError] = useState('');
    const [declineUserId, setDeclineUserId] = useState(null); 
    const [declineReason, setDeclineReason] = useState(''); 
    
    // DEFINITIVE FIX: Add state to track badge counts for all tabs (including contestants and revoked)
    const [tabCounts, setTabCounts] = useState({ pending: 0, paymentPending: 0, approved: 0, enrolled: 0, contestants: 0, declined: 0, revoked: 0 });

    // In-App Deletion Modal States
    const [appToDelete, setAppToDelete] = useState(null);

    // --- ENROLLMENT CONFIG STATE ---
    const [enrollmentConfig, setEnrollmentConfig] = useState({ filmClubOpen: true, docuSeriesOpen: true, filmClubFee: 2500, docuSeriesFee: 500, bothDiscount: 0, mmgNumber: '', mmgInstructions: '', requireProfilePhoto: true, requireExperience: true, requirePhone: true, autoVerifyPayments: false });
    const [isEnrollmentConfigLoading, setIsEnrollmentConfigLoading] = useState(true);
    const [hasEnrollmentChanges, setHasEnrollmentChanges] = useState(false);
    const [isSavingConfig, setIsSavingConfig] = useState(false);

    // Listen for global enrollment configuration
    useEffect(() => {
        const enrollmentConfigDocRef = doc(db, "settings", "enrollmentConfig");
        const unsub = onSnapshot(enrollmentConfigDocRef, (docSnap) => {
            if (docSnap.exists()) setEnrollmentConfig(docSnap.data());
            setIsEnrollmentConfigLoading(false);
        });
        return () => unsub();
    }, []);

    const handleEnrollmentConfigChange = (field, value) => {
        setEnrollmentConfig(prev => ({ ...prev, [field]: value }));
        setHasEnrollmentChanges(true);
    };

    const handleSaveConfig = async () => {
        if (!hasEnrollmentChanges) return;
        setIsSavingConfig(true);
        showMessage("Saving via Cloud Function...");
        try {
            // THE PERMISSION FIX: Call the Cloud Function instead of writing to Firestore directly
            const updateConfig = httpsCallable(functions, 'updateEnrollmentConfig');
            await updateConfig({
                newConfig: {
                    ...enrollmentConfig,
                    filmClubFee: parseFloat(enrollmentConfig.filmClubFee) || 0,
                    docuSeriesFee: parseFloat(enrollmentConfig.docuSeriesFee) || 0,
                    bothDiscount: parseFloat(enrollmentConfig.bothDiscount) || 0
                }
            });
            showMessage("Global settings updated successfully!");
            setHasEnrollmentChanges(false);
        } catch (err) {
            showMessage(`Error: ${err.message}`);
        } finally {
            setIsSavingConfig(false);
        }
    };

    // DEFINITIVE FIX: Move all Cloud Function references OUTSIDE the component rendering scope to keep references static and stable [2]
    const getEnrollmentApplications = httpsCallable(functions, 'getEnrollmentApplications');
    const approveEnrollmentApplication = httpsCallable(functions, 'approveEnrollmentApplication');
    const declineEnrollmentApplication = httpsCallable(functions, 'declineEnrollmentApplication');
    const verifyEnrollmentPayment = httpsCallable(functions, 'verifyEnrollmentPayment');
    const clearEnrollmentHold = httpsCallable(functions, 'clearEnrollmentHold');
    const deleteEnrollmentApplication = httpsCallable(functions, 'deleteEnrollmentApplication');

    // DEFINITIVE FIX: Stable fetch reference with no external dynamic triggers [2]
    // Stable Ref to capture unstable parent notifications without causing recursive fetch cycles [2]
    const showMessageRef = React.useRef(showMessage);
    useEffect(() => {
        showMessageRef.current = showMessage;
    }, [showMessage]);

    const fetchApplicationsAndCounts = useCallback(async (status) => {
        setIsLoading(true);
        setError('');
        try {
            // DEFECT RESOLUTION: Removed 'enrolled' and added 'revoked' to backend query array to track kicks
            const statuses = ['pending', 'paymentPending', 'approved', 'declined', 'revoked'];
            const promises = statuses.map(s => getEnrollmentApplications({ statusFilter: s }));
            
            // DEFINITIVE FIX: Query /creators directly for active participants to avoid "Orphaned Enrollment Views"
            const filmClubQuery = query(collection(db, "creators"), where("isClassMember", "==", true));
            const contestantsQuery = query(collection(db, "creators"), where("isContestant", "==", true));

            const [
                pendingRes, paymentPendingRes, approvedRes, declinedRes, revokedRes,
                filmClubSnap, contestantsSnap
            ] = await Promise.all([
                ...promises,
                getDocs(filmClubQuery),
                getDocs(contestantsQuery)
            ]);
            
            const activeFilmClubIds = new Set(filmClubSnap.docs.map(doc => doc.id));
            const activeContestantIds = new Set(contestantsSnap.docs.map(doc => doc.id));

            const injectActiveFlags = (apps) => (apps || []).map(app => ({
                ...app,
                isActiveFilmClub: activeFilmClubIds.has(app.userId),
                isActiveContestant: activeContestantIds.has(app.userId)
            }));

            const resultsData = {
                pending: injectActiveFlags(pendingRes.data.applications),
                paymentPending: injectActiveFlags(paymentPendingRes.data.applications),
                approved: injectActiveFlags(approvedRes.data.applications),
                declined: injectActiveFlags(declinedRes.data.applications),
                revoked: injectActiveFlags(revokedRes.data.applications)
            };

            // Helper to map creator docs into the application card schema gracefully
            const mapCreatorToApp = (creatorDoc, programType) => {
                const data = creatorDoc.data();
                return {
                    id: creatorDoc.id,
                    userId: creatorDoc.id,
                    userName: data.creatorName || data.name || 'Unknown User',
                    userEmail: data.email || 'N/A', 
                    profilePictureUrl: data.profilePictureUrl || data.photoURL || '',
                    selectedOptions: [programType],
                    badges: data.badges || [], // DEFINITIVE FIX: Map badges for Gold Club toggle support
                    phone: data.phone || data.phoneNumber || 'N/A',
                    age: data.age || 'N/A',
                    experience: data.experience || 'Available on full profile view.',
                    bio: data.bio || 'Available on full profile view.',
                    totalAmount: 0, // Fallback since real cost is handled during checkout
                    status: 'enrolled' // Suppresses approve/decline buttons
                };
            };

            const enrolledApps = filmClubSnap.docs.map(doc => mapCreatorToApp(doc, 'filmClub'));
            const contestantApps = contestantsSnap.docs.map(doc => mapCreatorToApp(doc, 'docuSeries'));

            const newCounts = { 
                pending: resultsData.pending.length, 
                paymentPending: resultsData.paymentPending.length, 
                approved: resultsData.approved.length, 
                enrolled: enrolledApps.length, 
                contestants: contestantApps.length, 
                declined: resultsData.declined.length,
                revoked: resultsData.revoked.length
            };
            
            setTabCounts(newCounts);

            // Populate the active list based on selected tab
            if (status === 'enrolled') {
                setApplications(enrolledApps);
            } else if (status === 'contestants') {
                setApplications(contestantApps);
            } else if (resultsData[status]) {
                setApplications(resultsData[status]);
            } else {
                setApplications([]);
            }

        } catch (err) {
            setError('Failed to fetch applications.');
            if (showMessageRef.current) {
                showMessageRef.current(err.message);
            }
        } finally {
            setIsLoading(false);
        }
    }, []); // Empty array ensures this callback is perfectly static [2]

    useEffect(() => {
        fetchApplicationsAndCounts(activeTab);
    }, [activeTab, fetchApplicationsAndCounts]);

    const handleAction = async (actionFunc, targetUserId, successMessage) => {
        try {
            await actionFunc({ targetUserId });
            if (showMessageRef.current) showMessageRef.current(successMessage);
            fetchApplicationsAndCounts(activeTab); // Refresh the list and counts
        } catch (err) {
            if (showMessageRef.current) showMessageRef.current(`Error: ${err.message}`);
        }
    };

    const handleDeclineSubmit = async () => {
        if (!declineUserId) return;
        try {
            await declineEnrollmentApplication({ targetUserId: declineUserId, reason: declineReason.trim() });
            showMessage("Application declined.");
            setDeclineUserId(null);
            setDeclineReason('');
            fetchApplicationsAndCounts(activeTab); // Refresh the list and counts
        } catch (err) {
            showMessage(`Error: ${err.message}`);
        }
    };

    // Trigger in-app confirmation modal for deletion (Replaced window.confirm browser alert) [2]
    const handleDeleteApplication = (app) => {
        setAppToDelete(app);
    };

    const confirmDeleteApplication = async () => {
        if (!appToDelete) return;
        const targetId = appToDelete.userId;

        // Determine which track to revoke based on the current tab
        // If in 'enrolled' or 'contestants', revoke specifically.
        // If in any other tab (pending, approved, etc), revoke 'all' tracks.
        const trackToRevoke = activeTab === 'enrolled' ? 'filmClub' : 
                             activeTab === 'contestants' ? 'docuSeries' : 'all';

        setApplications(prev => prev.filter(app => app.userId !== targetId));
        setTabCounts(prev => ({ ...prev, [activeTab]: Math.max(0, prev[activeTab] - 1) }));
        setAppToDelete(null);
        showMessage(`Revoking ${trackToRevoke === 'filmClub' ? 'Film Club' : 'Docu-Series'}...`);

        try {
            // Send the specific track to the backend
            await deleteEnrollmentApplication({ targetUserId: targetId, program: trackToRevoke });
            showMessage("User revoked from program. Cooldown applied.");
            
            setTimeout(() => { fetchApplicationsAndCounts(activeTab); }, 1000);
        } catch (err) {
            showMessage(`Error: ${err.message}`);
            fetchApplicationsAndCounts(activeTab);
        }
    };

    const ApplicationCard = ({ app }) => (
        <div className="adminDashboardItem" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <img
                        src={app.profilePictureUrl || 'https://placehold.co/60x60/333/FFF?text=N/A'}
                        alt={app.userName}
                        style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', cursor: 'pointer' }}
                        onClick={() => { setSelectedUserId(app.userId); setActiveScreen('UserProfile'); }}
                    />
                    <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <p className="adminDashboardItemTitle" style={{ margin: 0 }}>{app.userName}</p>
                        <RoleBadge profile={{ ...app, role: 'user' }} />
                    </div>
                    <p className="smallText" style={{ color: '#AAA' }}>{app.userEmail}</p>
                </div>
                </div>
                {/* BESTOW GOLD CLUB BUTTON */}
                <button 
                    onClick={() => handleAction(httpsCallable(functions, 'toggleGoldClubStatus'), app.userId, "Gold Club Member Enrolled.")}
                    style={{ 
                        background: app.badges?.includes("Gold Club") ? '#D4AF37' : 'transparent',
                        color: app.badges?.includes("Gold Club") ? '#000' : '#D4AF37',
                        border: '1px solid #D4AF37',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        cursor: 'pointer'
                    }}
                >
                    {app.badges?.includes("Gold Club") ? '⭐ GOLD CLUB' : '➕ GOLD CLUB'}
                </button>
            </div>
            <div className="pt-3 mt-3 border-t" style={{ borderColor: '#333', fontSize: '14px', lineHeight: '1.6' }}>
            {/* 1. ACTIVE MEMBERSHIP LINE */}
            <p><strong>Active Membership:</strong> 
                <span style={{ color: '#FFD700', marginLeft: '5px' }}>
                    {(() => {
                        const active = [];
                        if (app.isActiveFilmClub) active.push('Film Club');
                        if (app.isActiveContestant) active.push('Docu-Series');
                        return active.length > 0 ? active.join(' & ') : 'None';
                    })()}
                </span>
            </p>

            {/* 2. APPLYING FOR LINE (Only shows what is NOT active and NOT revoked) */}
            <p><strong>Applying For:</strong> 
                <span style={{ color: '#00FFFF', marginLeft: '5px' }}>
                    {(() => {
                        const applying = (app.selectedOptions || []).filter(opt => 
                            (opt === 'filmClub' && !app.isActiveFilmClub) || 
                            (opt === 'docuSeries' && !app.isActiveContestant)
                        );
                        return applying.length > 0 ? applying.map(t => t === 'filmClub' ? 'Film Club' : 'Docu-Series').join(' & ') : 'N/A';
                    })()}
                </span>
            </p>
            <p><strong>Phone Number:</strong> <span style={{color: '#FFD700'}}>{app.phone || 'N/A'}</span></p>
            <p><strong>Age:</strong> <span style={{color: '#00FFFF'}}>{app.age || 'N/A'}</span></p> {/* <-- DISPLAY AGE */}
            <p><strong>Performing Arts Experience:</strong></p>
            <p style={{ color: '#CCC', margin: '4px 0 10px', backgroundColor: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
                {app.experience || 'None provided'}
            </p>
            <p><strong>Sign-up Bio:</strong></p>
            <p style={{ color: '#AAA', margin: '4px 0 10px', fontStyle: 'italic', backgroundColor: 'rgba(0,0,0,0.1)', padding: '8px', borderRadius: '4px' }}>
                {app.bio || 'None provided'}
            </p>
            <p><strong>Total Fee:</strong> ${app.totalAmount?.toLocaleString()} GYD</p>
                {app.status === 'paymentPending' && app.paymentDetails && (
                     <div>
                        <p><strong>Payment ID:</strong> {app.paymentDetails.paymentId}</p>
                        <a href={app.paymentDetails.screenshotUrl} target="_blank" rel="noopener noreferrer" className="termsLink">View Screenshot</a>
                    </div>
                )}
                
                {(app.status === 'declined' || app.status === 'revoked') && (() => {
                    const history = app.history || [];
                    const wasEnrolled = app.status === 'revoked' || history.some(h => h.status === 'approved' || h.status === 'enrolled' || h.status === 'paymentPending');
                    const holdDays = wasEnrolled ? 30 : 3;
                    
                    let declinedTimestamp = app.declinedAt ? (app.declinedAt.toDate ? app.declinedAt.toDate().getTime() : new Date(app.declinedAt).getTime()) : null;
                    if (!declinedTimestamp) {
                        const lastDeclined = history.slice().reverse().find(h => h.status === 'declined' || h.status === 'revoked');
                        declinedTimestamp = lastDeclined ? new Date(lastDeclined.timestamp).getTime() : Date.now();
                    }
                    
                    const expirationTime = declinedTimestamp + (holdDays * 24 * 60 * 60 * 1000);
                    const daysLeft = Math.ceil((expirationTime - Date.now()) / (1000 * 60 * 60 * 24));
                    
                    // Display ONLY the tracks that are currently declined/revoked
                    const tracksLocked = (app.declinedOptions || []).map(t => t === 'filmClub' ? 'Film Club' : 'Docu-Series').join(' & ') || 'All Programs';
                    
                    return (
                        <div style={{ marginTop: '10px', padding: '10px', backgroundColor: 'rgba(220, 53, 69, 0.1)', border: '1px solid #DC3545', borderRadius: '6px' }}>
                            <p style={{ color: '#DC3545', margin: 0, fontWeight: 'bold', fontSize: '13px', marginBottom: '5px' }}>
                                ⛔ Locked Track(s): <span style={{ color: '#FFF' }}>{tracksLocked}</span>
                            </p>
                            <p style={{ color: '#DC3545', margin: 0, fontWeight: 'bold', fontSize: '13px' }}>
                                {daysLeft > 0 ? `🚨 ${holdDays}-Day Cooldown Active (${daysLeft} days remaining)` : `✅ Hold Expired. User can reapply.`}
                            </p>
                        </div>
                    );
                })()}
            </div>
            <div className="flex justify-end gap-2 mt-3">
                {/* Master Delete/Revoke Button: Unified negative action on the left */}
                <button 
                    className="adminActionButton reject" 
                    style={{ backgroundColor: '#DC3545', color: '#FFF', marginRight: 'auto' }} 
                    onClick={() => handleDeleteApplication(app)}
                >
                    🗑️ Delete Application
                </button>

                {/* Positive Progressions purely on the right */}
                {app.status === 'pending' && (
                    <button className="adminActionButton approve" onClick={() => handleAction(approveEnrollmentApplication, app.userId, "Application Approved.")}>Approve</button>
                )}
                {app.status === 'paymentPending' && (
                    <button className="adminActionButton" style={{backgroundColor: '#00FF00', color: '#0A0A0A'}} onClick={() => handleAction(verifyEnrollmentPayment, app.userId, "Payment Verified & Enrolled.")}>Verify Payment</button>
                )}
                {(app.status === 'declined' || app.status === 'revoked') && (
                    <button className="adminActionButton" style={{backgroundColor: '#FF8C00', color: '#FFF'}} onClick={() => handleAction(clearEnrollmentHold, app.userId, "Enrollment hold cleared. User can now reapply.")}>Clear Hold</button>
                )}
            </div>
    </div>
);

    return (
        <div className="dashboardSection">
             <p className="dashboardSectionTitle">Enrollment Management</p>
             <div className="admin-nav-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                 <button className={`admin-nav-button ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>
                     Pending Review {tabCounts.pending > 0 && <span style={{ background: activeTab === 'pending' ? '#0A0A0A' : '#FFD700', color: activeTab === 'pending' ? '#FFD700' : '#0A0A0A', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', marginLeft: '6px', fontWeight: 'bold' }}>{tabCounts.pending}</span>}
                 </button>
                 <button className={`admin-nav-button ${activeTab === 'paymentPending' ? 'active' : ''}`} onClick={() => setActiveTab('paymentPending')}>
                     Pending Payment {tabCounts.paymentPending > 0 && <span style={{ background: activeTab === 'paymentPending' ? '#0A0A0A' : '#FFD700', color: activeTab === 'paymentPending' ? '#FFD700' : '#0A0A0A', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', marginLeft: '6px', fontWeight: 'bold' }}>{tabCounts.paymentPending}</span>}
                 </button>
                 <button className={`admin-nav-button ${activeTab === 'approved' ? 'active' : ''}`} onClick={() => setActiveTab('approved')}>
                     Approved {tabCounts.approved > 0 && <span style={{ background: activeTab === 'approved' ? '#0A0A0A' : '#FFD700', color: activeTab === 'approved' ? '#FFD700' : '#0A0A0A', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', marginLeft: '6px', fontWeight: 'bold' }}>{tabCounts.approved}</span>}
                 </button>
                 <button className={`admin-nav-button ${activeTab === 'enrolled' ? 'active' : ''}`} onClick={() => setActiveTab('enrolled')}>
                     Enrolled (Film Club) {tabCounts.enrolled > 0 && <span style={{ background: activeTab === 'enrolled' ? '#0A0A0A' : '#FFD700', color: activeTab === 'enrolled' ? '#FFD700' : '#0A0A0A', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', marginLeft: '6px', fontWeight: 'bold' }}>{tabCounts.enrolled}</span>}
                 </button>
                 <button className={`admin-nav-button ${activeTab === 'contestants' ? 'active' : ''}`} onClick={() => setActiveTab('contestants')}>
                     Contestants {tabCounts.contestants > 0 && <span style={{ background: activeTab === 'contestants' ? '#0A0A0A' : '#FFD700', color: activeTab === 'contestants' ? '#FFD700' : '#0A0A0A', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', marginLeft: '6px', fontWeight: 'bold' }}>{tabCounts.contestants}</span>}
                 </button>
                 <button className={`admin-nav-button ${activeTab === 'declined' ? 'active' : ''}`} onClick={() => setActiveTab('declined')}>
                     Declined {tabCounts.declined > 0 && <span style={{ background: activeTab === 'declined' ? '#0A0A0A' : '#FFD700', color: activeTab === 'declined' ? '#FFD700' : '#0A0A0A', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', marginLeft: '6px', fontWeight: 'bold' }}>{tabCounts.declined}</span>}
                 </button>
                 <button className={`admin-nav-button ${activeTab === 'revoked' ? 'active' : ''}`} onClick={() => setActiveTab('revoked')}>
                     Revoked Members {tabCounts.revoked > 0 && <span style={{ background: activeTab === 'revoked' ? '#0A0A0A' : '#DC3545', color: activeTab === 'revoked' ? '#DC3545' : '#0A0A0A', padding: '2px 8px', borderRadius: '12px', fontSize: '12px', marginLeft: '6px', fontWeight: 'bold' }}>{tabCounts.revoked}</span>}
                 </button>
             </div>
             <div style={{maxHeight: '60vh', overflowY: 'auto', padding: '10px'}}>
                {isLoading ? <p>Loading...</p> : error ? <p>{error}</p> :
                    applications.length > 0 ? applications.map(app => <ApplicationCard key={app.id} app={app} />) : <p>No applications found with status: {activeTab}</p>
                }
             </div>
             
             {/* --- IN-APP DECLINE REASON MODAL --- */}
             {declineUserId && (
                 <div className="confirmationModalOverlay" style={{ zIndex: 3000 }}>
                     <div className="confirmationModalContent" style={{ textAlign: 'left', maxWidth: '400px' }}>
                         <p className="confirmationModalTitle" style={{ color: '#DC3545' }}>Decline Application</p>
                         <p className="paragraph" style={{ color: '#AAA', fontSize: '14px', marginBottom: '15px' }}>
                             Please provide a reason for declining this applicant. This message will be logged in their application status.
                         </p>
                         <div className="formGroup">
                             <textarea
                                 className="formTextarea"
                                 value={declineReason}
                                 onChange={(e) => setDeclineReason(e.target.value)}
                                 placeholder="Enter reason for rejection..."
                                 rows="4"
                                 required
                             />
                         </div>
                         <div className="confirmationModalButtons" style={{ marginTop: '20px' }}>
                             <button className="confirmationButton cancel" onClick={() => { setDeclineUserId(null); setDeclineReason(''); }}>
                                 Cancel
                             </button>
                             <button className="confirmationButton confirm" style={{ backgroundColor: '#DC3545' }} onClick={handleDeclineSubmit}>
                                 Decline Applicant
                             </button>
                         </div>
                     </div>
                 </div>
             )}

             {/* --- IN-APP DELETE APPLICATION CONFIRMATION MODAL --- */}
             {appToDelete && (
                 <div className="confirmationModalOverlay" style={{ zIndex: 4000 }}>
                     <div className="confirmationModalContent" style={{ textAlign: 'center', maxWidth: '380px' }}>
                         <p className="confirmationModalTitle" style={{ color: '#DC3545', fontWeight: 'bold' }}>⚠️ Delete Application?</p>
                         <p className="paragraph" style={{ color: '#AAA', fontSize: '14px', lineHeight: 1.5, marginBottom: '20px' }}>
                             Are you sure you want to permanently delete the enrollment application for <strong style={{ color: '#FFF' }}>{appToDelete.userName}</strong>? This action cannot be undone.
                         </p>
                         <div className="confirmationModalButtons" style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                             <button className="confirmationButton cancel" onClick={() => setAppToDelete(null)}>
                                 Cancel
                             </button>
                             <button className="confirmationButton confirm" style={{ backgroundColor: '#DC3545', color: '#FFF' }} onClick={confirmDeleteApplication}>
                                 Yes, Delete
                             </button>
                         </div>
                     </div>
                 </div>
             )}

             {/* --- START: ENROLLMENT CONFIG MANAGER --- */}
             <div className="dashboardSection" style={{ border: '2px solid #FFD700', marginTop: '40px', padding: '20px' }}>
                <div className="flex justify-between items-center mb-4">
                    <p className="dashboardSectionTitle" style={{ marginBottom: 0, color: '#FFD700' }}>Global Enrollment Settings</p>
                    <button className="button" onClick={handleSaveConfig} disabled={!hasEnrollmentChanges || isSavingConfig}>
                        <span className="buttonText">{isSavingConfig ? 'Saving...' : 'Save Settings'}</span>
                    </button>
                </div>
                {isEnrollmentConfigLoading ? <p>Loading enrollment settings...</p> : (
                    <>
                        {/* FILM CLUB PUBLIC TOGGLE */}
                        <div className="adminDashboardItem" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p className="adminDashboardItemTitle" style={{ fontWeight: 'normal' }}>Film Club Open (Public)</p>
                            <label className="flex items-center cursor-pointer">
                                <span className="mr-3 text-sm font-medium text-gray-300">{enrollmentConfig.filmClubOpen ? 'Open' : 'Closed'}</span>
                                <div className="relative">
                                    <input type="checkbox" className="sr-only" checked={enrollmentConfig.filmClubOpen} onChange={(e) => handleEnrollmentConfigChange('filmClubOpen', e.target.checked)} />
                                    <div className={`block w-14 h-8 rounded-full ${enrollmentConfig.filmClubOpen ? 'bg-green-500' : 'bg-gray-600'}`}></div>
                                    <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${enrollmentConfig.filmClubOpen ? 'transform translate-x-6' : ''}`}></div>
                                </div>
                            </label>
                        </div>

                        {/* NEW: PRIVATE RENEWAL TOGGLE (Allows existing members to pay even when public sign-ups are closed) */}
                        <div className="adminDashboardItem" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: '1px dashed #00FFFF', borderRadius: '8px', padding: '10px', margin: '10px 0' }}>
                            <p className="adminDashboardItemTitle" style={{ fontWeight: 'normal', color: '#00FFFF' }}>Allow Private Renewals (Hidden)</p>
                            <label className="flex items-center cursor-pointer">
                                <span className="mr-3 text-sm font-medium text-gray-300">{enrollmentConfig.allowRenewals ? 'Yes' : 'No'}</span>
                                <div className="relative">
                                    <input type="checkbox" className="sr-only" checked={enrollmentConfig.allowRenewals} onChange={(e) => handleEnrollmentConfigChange('allowRenewals', e.target.checked)} />
                                    <div className={`block w-14 h-8 rounded-full ${enrollmentConfig.allowRenewals ? 'bg-green-500' : 'bg-gray-600'}`}></div>
                                    <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${enrollmentConfig.allowRenewals ? 'transform translate-x-6' : ''}`}></div>
                                </div>
                            </label>
                        </div>
                        <div className="adminDashboardItem" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p className="adminDashboardItemTitle" style={{ fontWeight: 'normal' }}>Docu-Series Open</p>
                            <label className="flex items-center cursor-pointer">
                                <span className="mr-3 text-sm font-medium text-gray-300">{enrollmentConfig.docuSeriesOpen ? 'Open' : 'Closed'}</span>
                                <div className="relative">
                                    <input type="checkbox" className="sr-only" checked={enrollmentConfig.docuSeriesOpen} onChange={(e) => handleEnrollmentConfigChange('docuSeriesOpen', e.target.checked)} />
                                    <div className={`block w-14 h-8 rounded-full ${enrollmentConfig.docuSeriesOpen ? 'bg-green-500' : 'bg-gray-600'}`}></div>
                                    <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${enrollmentConfig.docuSeriesOpen ? 'transform translate-x-6' : ''}`}></div>
                                </div>
                            </label>
                        </div>
                        <div className="formGroup"><label className="formLabel">Film Club Fee (GYD):</label><input type="number" className="formInput" value={enrollmentConfig.filmClubFee || ''} onChange={(e) => handleEnrollmentConfigChange('filmClubFee', e.target.value)} /></div>
                        <div className="formGroup"><label className="formLabel">Docu-Series Fee (GYD):</label><input type="number" className="formInput" value={enrollmentConfig.docuSeriesFee || ''} onChange={(e) => handleEnrollmentConfigChange('docuSeriesFee', e.target.value)} /></div>
                        <div className="formGroup"><label className="formLabel">Bundle Discount (GYD):</label><input type="number" className="formInput" value={enrollmentConfig.bothDiscount || ''} onChange={(e) => handleEnrollmentConfigChange('bothDiscount', e.target.value)} /></div>
                        <div className="formGroup"><label className="formLabel">MMG Phone Number:</label><input type="text" className="formInput" value={enrollmentConfig.mmgNumber || ''} onChange={(e) => handleEnrollmentConfigChange('mmgNumber', e.target.value)} /></div>
                        <div className="formGroup"><label className="formLabel">MMG Payment Instructions:</label><textarea className="formTextarea" value={enrollmentConfig.mmgInstructions || ''} onChange={(e) => handleEnrollmentConfigChange('mmgInstructions', e.target.value)} /></div>
                        <hr style={{ borderColor: '#444', margin: '20px 0' }} />
                        <div className="adminDashboardItem" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p className="adminDashboardItemTitle" style={{ fontWeight: 'normal' }}>Require Profile Photo to Apply</p>
                            <label className="flex items-center cursor-pointer">
                                <div className="relative">
                                    <input type="checkbox" className="sr-only" checked={enrollmentConfig.requireProfilePhoto} onChange={(e) => handleEnrollmentConfigChange('requireProfilePhoto', e.target.checked)} />
                                    <div className={`block w-14 h-8 rounded-full ${enrollmentConfig.requireProfilePhoto ? 'bg-green-500' : 'bg-gray-600'}`}></div>
                                    <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${enrollmentConfig.requireProfilePhoto ? 'transform translate-x-6' : ''}`}></div>
                                </div>
                            </label>
                        </div>
                        <div className="adminDashboardItem" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p className="adminDashboardItemTitle" style={{ fontWeight: 'normal' }}>Require Experience/Bio to Apply</p>
                            <label className="flex items-center cursor-pointer">
                                <div className="relative">
                                    <input type="checkbox" className="sr-only" checked={enrollmentConfig.requireExperience} onChange={(e) => handleEnrollmentConfigChange('requireExperience', e.target.checked)} />
                                    <div className={`block w-14 h-8 rounded-full ${enrollmentConfig.requireExperience ? 'bg-green-500' : 'bg-gray-600'}`}></div>
                                    <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${enrollmentConfig.requireExperience ? 'transform translate-x-6' : ''}`}></div>
                                </div>
                            </label>
                        </div>
                        <div className="adminDashboardItem" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p className="adminDashboardItemTitle" style={{ fontWeight: 'normal' }}>Require Phone Number to Apply</p>
                            <label className="flex items-center cursor-pointer">
                                <div className="relative">
                                    <input type="checkbox" className="sr-only" checked={enrollmentConfig.requirePhone} onChange={(e) => handleEnrollmentConfigChange('requirePhone', e.target.checked)} />
                                    <div className={`block w-14 h-8 rounded-full ${enrollmentConfig.requirePhone ? 'bg-green-500' : 'bg-gray-600'}`}></div>
                                    <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${enrollmentConfig.requirePhone ? 'transform translate-x-6' : ''}`}></div>
                                </div>
                            </label>
                        </div>
                        <div className="adminDashboardItem" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p className="adminDashboardItemTitle" style={{ fontWeight: 'normal' }}>Auto-Verify Payments (Not Recommended)</p>
                            <label className="flex items-center cursor-pointer">
                                <div className="relative">
                                    <input type="checkbox" className="sr-only" checked={enrollmentConfig.autoVerifyPayments} onChange={(e) => handleEnrollmentConfigChange('autoVerifyPayments', e.target.checked)} />
                                    <div className={`block w-14 h-8 rounded-full ${enrollmentConfig.autoVerifyPayments ? 'bg-green-500' : 'bg-gray-600'}`}></div>
                                    <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${enrollmentConfig.autoVerifyPayments ? 'transform translate-x-6' : ''}`}></div>
                                </div>
                            </label>
                        </div>
                    </>
                )}
            </div>
            {/* --- END: ENROLLMENT CONFIG MANAGER --- */}
        </div>
    );
};

export default AdminEnrollmentManager;