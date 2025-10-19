// src/components/AdminDashboardScreen.jsx

import React, { useState, useEffect } from 'react';
import { db, functions, httpsCallable, collection, onSnapshot, query, where, orderBy, doc, updateDoc, deleteDoc, limit } from '../firebase';
import AdminModerationCenter from './AdminModerationCenter';
import AdminContentManagerScreen from './AdminContentManagerScreen';
import AdminCompetitionManager from './AdminCompetitionManager';
import AdminCategoryManagerScreen from './AdminCategoryManagerScreen';

import AdminPayoutRequestScreen from './AdminPayoutRequestScreen';

import AdminEventManagerScreen from './AdminEventManagerScreen';

import AdminBoxOfficeScreen from './AdminBoxOfficeScreen'; // <-- ADD THIS LINE

import AdminSiteManagerScreen from './AdminSiteManagerScreen';
import SetVerificationExpiryModal from './SetVerificationExpiryModal';
import SuspensionModal from './SuspensionModal';
import formatCurrency from '../utils/formatCurrency';
import RoleBadge from './RoleBadge'; // <-- ADD THIS IMPORT

const AdminDashboardScreen = ({
    showMessage,
    setActiveScreen,
    currentUser,
    creatorProfile,
    selectedAdminSubScreen,
    setSelectedAdminSubScreen,
    setShowConfirmationModal,
    setConfirmationTitle,
    setConfirmationMessage,
    setOnConfirmationAction,
    setSelectedUserId,
    setSelectedAdminCampaignId,
    setSelectedOpportunity,
    setSelectedStatus,
    setSelectedCompAdmin,
    setSelectedReportGroup,
    featuredContentSlots,
    currencyRates,
    selectedCurrency
}) => {
    
    // State for UI
    const [loading, setLoading] = useState(true);
    const [isUserManagementExpanded, setIsUserManagementExpanded] = useState(true);
    const [isPendingCampaignsExpanded, setIsPendingCampaignsExpanded] = useState(true);
    const [isActiveCampaignsExpanded, setIsActiveCampaignsExpanded] = useState(true);
    const [isPaymentsExpanded, setIsPaymentsExpanded] = useState(true);
    const [isActiveOpportunitiesExpanded, setIsActiveOpportunitiesExpanded] = useState(true);
    const [isPendingOpportunitiesExpanded, setIsPendingOpportunitiesExpanded] = useState(true);
    const [isPendingBillboardExpanded, setIsPendingBillboardExpanded] = useState(true);
    const [showExpiryModal, setShowExpiryModal] = useState(false);
    const [userToVerify, setUserToVerify] = useState(null);
    const [showSuspensionModal, setShowSuspensionModal] = useState(false);
    const [isPayoutRequestsExpanded, setIsPayoutRequestsExpanded] = useState(true);
    
    const [userToSuspend, setUserToSuspend] = useState(null);

    // State for Data
    const [allUsers, setAllUsers] = useState([]);
    const [pendingCampaigns, setPendingCampaigns] = useState([]);
    const [activeCampaigns, setActiveCampaigns] = useState([]);
    const [pendingPledges, setPendingPledges] = useState([]);
    
    const [payoutRequests, setPayoutRequests] = useState([]);

    const [liveStatus, setLiveStatus] = useState(null);
    const [pendingOpportunities, setPendingOpportunities] = useState([]);
    const [activeOpportunities, setActiveOpportunities] = useState([]);
    const [pendingStatuses, setPendingStatuses] = useState([]);

    // State for Filters & Sorting
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRole, setSelectedRole] = useState('All');
    const [pledgeSearchTerm, setPledgeSearchTerm] = useState('');
    const [pledgeSortType, setPledgeSortType] = useState('date');
    const [campaignSearchTerm, setCampaignSearchTerm] = useState('');
    const [pendingCampaignsSearchTerm, setPendingCampaignsSearchTerm] = useState('');
    const [pendingBillboardSearchTerm, setPendingBillboardSearchTerm] = useState('');
    const [pendingOpportunitiesSearchTerm, setPendingOpportunitiesSearchTerm] = useState('');
    const [activeOpportunitiesSearchTerm, setActiveOpportunitiesSearchTerm] = useState('');
    const [payoutRequestsSearchTerm, setPayoutRequestsSearchTerm] = useState('');

    // State for Notification Badges
    const [pendingReportsCount, setPendingReportsCount] = useState(0);
    const [pendingAppealsCount, setPendingAppealsCount] = useState(0);

    const [newSubmissionsCount, setNewSubmissionsCount] = useState(0);

    // --- DATA FETCHING EFFECTS ---
    
    // Hook for the Live Billboard Status
    useEffect(() => {
        const statusesRef = collection(db, "promotedStatuses");
        const now = new Date();
        const q = query(
            statusesRef,
            where("status", "==", "approved_and_scheduled"),
            where("startTime", "<=", now),
            where("expiresAt", ">", now),
            orderBy("expiresAt", "asc"),
            limit(1)
        );
        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                setLiveStatus({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
            } else {
                setLiveStatus(null);
            }
        });
        return () => unsubscribe();
    }, []);

    // Main hook for all other dashboard data
    useEffect(() => {
        const appId = "production-app-id";
        const unsubscribers = [];

        unsubscribers.push(onSnapshot(collection(db, "creators"), (snapshot) => {
            setAllUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        }));
        unsubscribers.push(onSnapshot(query(collection(db, "opportunities"), where('status', '==', 'pending')), (s) => setPendingOpportunities(s.docs.map(d=>({id:d.id,...d.data()})))));
        unsubscribers.push(onSnapshot(query(collection(db, "opportunities"), where('status', '==', 'active'), where('expiresAt', '>', new Date())), (s) => setActiveOpportunities(s.docs.map(d=>({id:d.id,...d.data()})))));

        // --- THIS IS THE FIX ---
        // Queries restricted to 'admin' or 'authority' roles.
        if (creatorProfile.role === 'admin' || creatorProfile.role === 'authority') {
            unsubscribers.push(onSnapshot(query(collection(db, `artifacts/${appId}/public/data/campaigns`), where('status', '==', 'pending')), (s) => setPendingCampaigns(s.docs.map(d=>({id:d.id,...d.data()})))));
            unsubscribers.push(onSnapshot(query(collection(db, `artifacts/${appId}/public/data/campaigns`), where('status', '==', 'active')), (s) => setActiveCampaigns(s.docs.map(d=>({id:d.id,...d.data()})))));
            unsubscribers.push(onSnapshot(query(collection(db, "promotedStatuses"), where('status', '==', 'content_review_pending')), (s) => setPendingStatuses(s.docs.map(d=>({id:d.id,...d.data()})))));
            unsubscribers.push(onSnapshot(query(collection(db, "reports"), where("status", "==", "pending")), (s) => setPendingReportsCount(s.size)));
            unsubscribers.push(onSnapshot(query(collection(db, "appeals"), where("status", "==", "pending")), (s) => setPendingAppealsCount(s.size)));
        }
        
        // Queries restricted to 'admin' role only.
        if (creatorProfile.role === 'admin') {
            unsubscribers.push(onSnapshot(query(collection(db, "paymentPledges"), where('status', '==', 'pending')), (s) => setPendingPledges(s.docs.map(d=>({id:d.id,...d.data()})))));
            unsubscribers.push(onSnapshot(query(collection(db, "payoutRequests"), where("status", "==", "pending"), orderBy("requestedAt", "desc")), (s) => setPayoutRequests(s.docs.map(d=>({id:d.id,...d.data()})))));
        }

        unsubscribers.push(onSnapshot(query(collection(db, "contactSubmissions"), where("status", "==", "New")), (s) => setNewSubmissionsCount(s.size)));

        return () => unsubscribers.forEach(unsub => unsub());
    }, [creatorProfile.role]);
           
    const filteredUsers = allUsers.filter(user => {
        // First, check if the user matches the search term. If not, exclude them immediately.
        const matchesSearch = searchTerm === '' || user.creatorName?.toLowerCase().includes(searchTerm.toLowerCase()) || user.email?.toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchesSearch) return false;

        // If the filter is 'All', no more checks are needed.
        if (selectedRole === 'All') return true;

        // Define user statuses based on their data.
        const now = new Date();
        const isPremium = user.premiumExpiresAt && user.premiumExpiresAt.toDate() > now;
        const isVerified = user.isVerifiedAdvertiser && user.verifiedAdvertiserExpiresAt?.toDate() > now;
        const isSuspended = user.suspendedUntil && user.suspendedUntil.toDate() > now;
        const isBanned = user.banned === true;

        // Use a switch to handle the different filter options.
        switch (selectedRole) {
            case 'premium':
                return isPremium;
            case 'verified':
                return isVerified;
            case 'suspended':
                return isSuspended;
            case 'banned':
                return isBanned;
            // The default case handles the standard role filters ('user', 'creator', etc.).
            default:
                return user.role === selectedRole;
        }
    });

    const filteredAndSortedPledges = pendingPledges
        .filter(p => pledgeSearchTerm === '' || p.pledgeId?.toLowerCase().includes(pledgeSearchTerm.toLowerCase()) || p.userName?.toLowerCase().includes(pledgeSearchTerm.toLowerCase()))
        .sort((a, b) => pledgeSortType === 'date' ? new Date(b.createdAt) - new Date(a.createdAt) : a.paymentType.localeCompare(b.paymentType));

    const handleRoleChange = (targetUser, newRole) => {
        setConfirmationTitle("Change User Role?");
        setConfirmationMessage(`Are you sure you want to change ${targetUser.creatorName}'s role to "${newRole}"?`);
        setOnConfirmationAction(() => async () => {
            showMessage("Updating role...");
            try {
                const changeRoleFunction = httpsCallable(functions, 'changeUserRole');
                const result = await changeRoleFunction({ targetUserId: targetUser.id, newRole: newRole });
                showMessage(result.data.message);
            } catch (error) {
                showMessage(`Error: ${error.message}`);
            }
        });
        setShowConfirmationModal(true);
    };
    
    const handleToggleBan = (userToBan) => {
        const action = userToBan.banned ? 'Unban' : 'Ban';
        setConfirmationTitle(`${action} User?`);
        setConfirmationMessage(`Are you sure you want to ${action.toLowerCase()} user ${userToBan.creatorName}? This action is immediate.`);
        setOnConfirmationAction(() => async () => {
            showMessage(`Processing ${action}...`);
            try {
                const toggleBanFunction = httpsCallable(functions, 'toggleUserBanStatus');
                const result = await toggleBanFunction({ targetUserId: userToBan.id });
                showMessage(result.data.message);
            } catch (error) {
                showMessage(`Error: ${error.message}`);
            }
        });
        setShowConfirmationModal(true);
    };

    const handleLiftCooldown = (userToLift) => {
    setConfirmationTitle("Lift Campaign Cooldown?");
    setConfirmationMessage(`This will immediately allow ${userToLift.creatorName} to create a new campaign. Are you sure?`);
    setOnConfirmationAction(() => async () => {
        showMessage("Lifting cooldown...");
        try {
            const liftCooldownFunction = httpsCallable(functions, 'liftCampaignCooldown');
            const result = await liftCooldownFunction({ targetUserId: userToLift.id });
            showMessage(result.data.message);
        } catch (error) {
            showMessage(`Error: ${error.message}`);
        }
    });
    setShowConfirmationModal(true);
};

    const handleLiftSuspension = (userToReinstate) => {
        setConfirmationTitle("Lift Suspension?");
        setConfirmationMessage(`Are you sure you want to immediately lift the suspension for ${userToReinstate.creatorName}? They will be able to log in right away.`);
        setOnConfirmationAction(() => async () => {
            showMessage("Lifting suspension...");
            try {
                const liftSuspensionFunction = httpsCallable(functions, 'liftUserSuspension');
                const result = await liftSuspensionFunction({ targetUserId: userToReinstate.id });
                showMessage(result.data.message);
            } catch (error) {
                showMessage(`Error: ${error.message}`);
            }
        });
        setShowConfirmationModal(true);
    };

    const handleApprovePledge = async (pledgeId) => {
        showMessage(`Approving pledge ${pledgeId}...`);
        try {
            const approvePledgeCallable = httpsCallable(functions, 'approvePledge');
            const result = await approvePledgeCallable({
                pledgeId: pledgeId,
                appId: "production-app-id"
            });
            showMessage(result.data.message);
        } catch (error) {
            console.error("Error calling approvePledge function:", error);
            showMessage(`Error: ${error.message}`);
        }
    };
    const denyPledgeLogic = async (pledgeId) => { await deleteDoc(doc(db, "paymentPledges", pledgeId)); showMessage("Pledge denied."); };
    
    const handleToggleVerified = (user) => {
        const isCurrentlyVerified = user.isVerifiedAdvertiser && user.verifiedAdvertiserExpiresAt?.toDate() > new Date();
        if (isCurrentlyVerified) {
             setOnConfirmationAction(() => () => revokeVerifiedStatus(user));
             setConfirmationTitle("Revoke Verification?");
             setConfirmationMessage(`Are you sure you want to immediately revoke Verified Advertiser status for ${user.creatorName}?`);
             setShowConfirmationModal(true);
        } else {
            setUserToVerify(user);
            setShowExpiryModal(true);
        }
    };

    const setVerifiedStatus = async (durationInMonths) => {
        if (!userToVerify) return;
        setShowExpiryModal(false);
        try {
            const setStatusFunction = httpsCallable(functions, 'setVerifiedAdvertiserStatus');
            await setStatusFunction({ userId: userToVerify.id, durationInMonths });
            showMessage(`${userToVerify.creatorName}'s status set to Verified.`);
        } catch (error) { showMessage(`Error: ${error.message}`); }
        finally { setUserToVerify(null); }
    };

    const revokeVerifiedStatus = async (user) => {
        try {
            const revokeFunction = httpsCallable(functions, 'revokeVerifiedAdvertiserStatus');
            await revokeFunction({ userId: user.id });
            showMessage(`${user.creatorName}'s status has been revoked.`);
        } catch (error) { showMessage(`Error: ${error.message}`); }
    };

    const handleOpenSuspendModal = (user) => {
        setUserToSuspend(user);
        setShowSuspensionModal(true);
    };

   const handleConfirmSuspend = async (duration) => {
        if (!userToSuspend) return;
        setShowSuspensionModal(false);
        
        showMessage(`Suspending ${userToSuspend.creatorName}...`);
        try {
            const suspendFunction = httpsCallable(functions, 'suspendUserDirectly');
            const result = await suspendFunction({
                userId: userToSuspend.id,
                durationHours: duration
            });
            showMessage(result.data.message);
        } catch (error) {
            showMessage(`Error: ${error.message}`);
            console.error("Error during direct suspension:", error);
        } finally {
            setUserToSuspend(null);
        }
    };

        // --- NEW: Payout Request Handler ---
const handleUpdateRequestStatus = (requestId, newStatus) => {
    const actionText = newStatus === 'paid' ? 'Mark as Paid' : 'Dismiss';
    const confirmationMsg = `Are you sure you want to ${actionText.toLowerCase()} this payout request? This action cannot be undone.`;
    
    const actionFunction = async () => {
        showMessage("Updating status...");
        try {
            const requestRef = doc(db, "payoutRequests", requestId);
            await updateDoc(requestRef, { status: newStatus });
            showMessage(`Request has been marked as ${newStatus}.`);
        } catch (error) {
            showMessage(`Error updating status: ${error.message}`);
        }
    };

    setConfirmationTitle(`${actionText}?`);
    setConfirmationMessage(confirmationMsg);
    setOnConfirmationAction(() => actionFunction);
    setShowConfirmationModal(true);
};

    const getUserStatusBadges = (user) => {
    const badges = [];
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    if (user.banned) {
        badges.push({ text: 'Banned', color: '#DC3545' });
    } else if (user.suspendedUntil && user.suspendedUntil.toDate() > now) {
        badges.push({ text: 'Suspended', color: '#FF8C00' });
    } else {
        const lastLogin = user.lastLoginTimestamp?.toDate();
        if (lastLogin) {
            if (lastLogin >= today) {
                badges.push({ text: 'Active Today', color: '#00FF00' });
            } else if (lastLogin >= oneWeekAgo) {
                badges.push({ text: 'Active This Week', color: '#90EE90' });
            } else {
                const daysAgo = Math.floor((now - lastLogin) / (1000 * 60 * 60 * 24));
                badges.push({ text: `Inactive: ${daysAgo}d`, color: '#FFA500' });
            }
        } else {
            badges.push({ text: 'Inactive', color: '#808080' });
        }
    }

        if (user.premiumExpiresAt && user.premiumExpiresAt.toDate() > now) {
            badges.push({ text: 'Premium', color: '#FFD700' });
        }
        if (user.isVerifiedAdvertiser && user.verifiedAdvertiserExpiresAt && user.verifiedAdvertiserExpiresAt.toDate() > now) {
            badges.push({ text: 'Verified', color: '#00FFFF' });
        }
        return badges;
    };
    
    if (loading) { return <div className="screenContainer" style={{ textAlign: 'center' }}><p className="heading">Loading Admin Data...</p></div>; }
    
    const pendingOverviewCount = pendingCampaigns.length + pendingPledges.length + pendingOpportunities.length + pendingStatuses.length + payoutRequests.length;
    
    return (
        <>
            <div className="screenContainer">
                <p className="heading">Admin Dashboard</p>
               <div className="admin-nav-container">
                    <button className={`admin-nav-button ${selectedAdminSubScreen === 'Overview' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('Overview')}>
                        Overview {pendingOverviewCount > 0 && <span style={{color: '#DC3545', fontWeight: 'bold'}}>({pendingOverviewCount})</span>}
                    </button>
                    <button className={`admin-nav-button ${selectedAdminSubScreen === 'ModerationCenter' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('ModerationCenter')}>
                        Moderation {(pendingReportsCount + pendingAppealsCount) > 0 && <span style={{color: '#DC3545', fontWeight: 'bold'}}>({pendingReportsCount + pendingAppealsCount})</span>}
                    </button>
                                                       
                    <button className={`admin-nav-button ${selectedAdminSubScreen === 'ContentManagement' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('ContentManagement')}>
                        Curation {(pendingOpportunities.length + pendingStatuses.length) > 0 && <span style={{color: '#DC3545', fontWeight: 'bold'}}>({pendingOpportunities.length + pendingStatuses.length})</span>}
                    </button>
                    <button className={`admin-nav-button ${selectedAdminSubScreen === 'Competitions' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('Competitions')}>Competitions</button>
                    <button className={`admin-nav-button ${selectedAdminSubScreen === 'EventManager' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('EventManager')}>Event Manager</button>
                    {/* An Authority cannot manage categories */}
                    {creatorProfile.role === 'admin' && (
                        <button className={`admin-nav-button ${selectedAdminSubScreen === 'CategoryManager' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('CategoryManager')}>Category Manager</button>
                    )}
                    
                    {/* Admins-only button for the new Box Office screen */}
                    {creatorProfile.role === 'admin' && (
                        <button className={`admin-nav-button ${selectedAdminSubScreen === 'BoxOffice' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('BoxOffice')}>Box Office</button>
                    )}

                    <button className={`admin-nav-button ${selectedAdminSubScreen === 'SiteManagement' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('SiteManagement')}>
                    Settings {newSubmissionsCount > 0 && <span style={{color: '#DC3545', fontWeight: 'bold'}}>({newSubmissionsCount})</span>}
                    </button>
                    <button className="admin-nav-button" onClick={() => setActiveScreen('AnalyticsDashboard')}>Analytics</button>
                </div>

                {selectedAdminSubScreen === 'Overview' && (
                    <>
                        {/* --- START: NEW PAYOUT REQUESTS SECTION (ADMIN ONLY) --- */}
                        {creatorProfile.role === 'admin' && (
                            <section className="dashboardSection" style={{border: '2px solid #00FF00'}}>
                                <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsPayoutRequestsExpanded(!isPayoutRequestsExpanded)}>
                                <p className="dashboardSectionTitle" style={{marginBottom: 0, color: '#00FF00'}}>Payout Requests ({payoutRequests.length})</p>
                                <span className="text-xl font-bold text-white">{isPayoutRequestsExpanded ? '▼' : '▶'}</span>
                            </div>
                            <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isPayoutRequestsExpanded ? 'max-h-[5000px]' : 'max-h-0'}`}>
                                <div className="pt-4 border-t mt-4" style={{borderColor: '#333'}}>
                                    <div className="formGroup" style={{ marginBottom: '1rem' }}>
                                        <input
                                            type="text"
                                            className="formInput"
                                            placeholder="Search by campaign, creator, or phone..."
                                            value={payoutRequestsSearchTerm}
                                            onChange={(e) => setPayoutRequestsSearchTerm(e.target.value)}
                                        />
                                    </div>
                                    <div style={{maxHeight: '400px', overflowY: 'auto', paddingRight: '10px'}}>
                                        {payoutRequests.length === 0 ? <p className="dashboardItem">No pending payout requests.</p> : payoutRequests
                                            .filter(req => 
                                                req.campaignTitle?.toLowerCase().includes(payoutRequestsSearchTerm.toLowerCase()) ||
                                                req.creatorName?.toLowerCase().includes(payoutRequestsSearchTerm.toLowerCase()) ||
                                                req.mmgPhoneNumber?.includes(payoutRequestsSearchTerm)
                                            )
                                            .map(req => (
                                            <div key={req.id} className="adminDashboardItem" style={{flexDirection: 'column', alignItems: 'stretch', gap: '10px'}}>
                                                <div style={{display: 'flex', justifyContent: 'space-between', width: '100%'}}>
                                                    <p className="adminDashboardItemTitle" style={{margin: 0}}>{req.campaignTitle}</p>
                                                    <p style={{color: '#00FF00', fontWeight: 'bold', fontSize: '1.1rem'}}>{formatCurrency(req.netAmount, selectedCurrency, currencyRates)}</p>
                                                </div>
                                                <div style={{fontSize: '13px', color: '#CCC'}}>
                                                    <p style={{margin: 0}}><strong>Creator:</strong> {req.creatorName}</p>
                                                    <p style={{margin: '4px 0'}}><strong>Legal Name:</strong> {req.legalName}</p>
                                                    <p style={{margin: 0}}><strong>MMG Phone:</strong> {req.mmgPhoneNumber}</p>
                                                </div>
                                                <div style={{display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px'}}>
                                                    <button className="adminActionButton reject" onClick={() => handleUpdateRequestStatus(req.id, 'dismissed')}>Dismiss</button>
                                                    <button className="adminActionButton approve" onClick={() => handleUpdateRequestStatus(req.id, 'paid')}>Mark as Paid</button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            </section>
                        )}
                        {/* --- END: NEW PAYOUT REQUESTS SECTION --- */}

                        {liveStatus && (
                            <section className="dashboardSection" style={{border: '2px solid #DC3545'}}>
                                <p className="dashboardSectionTitle" style={{color: '#DC3545'}}>Live Billboard Control</p>
                                                           
                                <div className="adminDashboardItem">
                                    <div style={{flexGrow: 1}}>
                                        <p className="adminDashboardItemTitle">{liveStatus.content.title}</p>
                                        <p style={{fontSize: '12px', color: '#CCC'}}>Expires: {new Date(liveStatus.expiresAt.toDate()).toLocaleString()}</p>
                                    </div>
                                    <button 
                                        className="adminActionButton reject"
                                        onClick={() => {
                                            setConfirmationTitle("Confirm Takedown");
                                            setConfirmationMessage(`Are you sure you want to immediately take down the live ad "${liveStatus.content.title}"?`);
                                            setOnConfirmationAction(() => async () => {
                                                const endFunction = httpsCallable(functions, 'endPromotedStatusByAdmin');
                                                await endFunction({ bookingId: liveStatus.id });
                                                showMessage("Ad has been taken down.");
                                            });
                                            setShowConfirmationModal(true);
                                        }}
                                    >
                                        Take Down Now
                                    </button>
                                </div>
                            </section>
                        )}

                        <section className="dashboardSection">
                            <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsUserManagementExpanded(!isUserManagementExpanded)}>
                                <p className="dashboardSectionTitle" style={{ marginBottom: 0 }}>User Management</p>
                                <span className="text-xl font-bold text-white">{isUserManagementExpanded ? '▼' : '▶'}</span>
                            </div>
                            <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isUserManagementExpanded ? 'max-h-[5000px]' : 'max-h-0'}`}>
                                <div className="pt-4 border-t" style={{ borderColor: '#3A3A3A', marginTop: '1rem' }}>
                                    <div className="formGroup"><label className="formLabel">Search Users:</label><input type="text" className="formInput" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Search by name or email" /></div>
                                    <div className="formGroup"><label className="formLabel">Filter by Role or Status:</label>
                                        <select className="formInput" value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
                                            <option value="All">All Roles & Statuses</option>
                                            <optgroup label="By Role">
                                                <option value="user">User</option>
                                                <option value="creator">Creator</option>
                                                <option value="authority">Authority</option>
                                                <option value="admin">Admin</option>
                                            </optgroup>
                                            <optgroup label="By Status">
                                                <option value="premium">Premium</option>
                                                <option value="verified">Verified</option>
                                                <option value="suspended">Suspended</option>
                                                <option value="banned">Banned</option>
                                            </optgroup>
                                        </select>
                                    </div>
                                    <div className="dashboardContentList" style={{maxHeight: '400px', overflowY: 'auto', paddingRight: '10px'}}>
                                        {filteredUsers.map(user => {
                                            const statusBadges = getUserStatusBadges(user);
                                            const primaryStatus = statusBadges[0] || {text: 'Unknown', color: '#CCC'};
                                            const secondaryBadges = statusBadges.slice(1);
                                            const isSuspended = primaryStatus.text === 'Suspended';
                                            return (
                                                <div key={user.id} className="adminDashboardItem admin-user-card" style={{alignItems: 'flex-start'}}>
                                                    <div style={{display: 'flex', alignItems: 'center', flexGrow: 1, marginRight: '10px', cursor: 'pointer'}} onClick={() => {setSelectedUserId(user.id); setActiveScreen('UserProfile');}}>
                                                        <img src={user.profilePictureUrl || 'https://placehold.co/50x50/555/FFF?text=P'} alt={user.creatorName} style={{width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover', marginRight: '15px'}} />
                                                        <div>
                                                            <div className="adminDashboardItemTitle" style={{ display: 'flex', alignItems: 'center' }}>
                                                                {user.creatorName}
                                                                <RoleBadge profile={user} />
                                                            </div>
                                                            <p style={{ fontSize: '12px', color: '#AAA' }}>{user.email} • Role: {user.role}</p>
                                                            <p style={{ fontSize: '12px', color: primaryStatus.color, fontWeight: 'bold' }}>Status: {primaryStatus.text}</p>
                                                        </div>
                                                    </div>
                                                    <div className="admin-user-card-actions" style={{display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end', flexShrink: 0}}>
                                                        {(() => {
                                                            const isTargetAdmin = user.role === 'admin';
                                                            const isTargetAuthority = user.role === 'authority';
                                                            const viewerIsAdmin = creatorProfile.role === 'admin';
                                                            const viewerIsAuthority = creatorProfile.role === 'authority';

                                                            // RULE 1: An authority cannot take action on another authority or an admin.
                                                            const authorityActionIsDisabled = viewerIsAuthority && (isTargetAdmin || isTargetAuthority);
                                                            
                                                            // RULE 2: An admin cannot take action on another admin.
                                                            const adminOnAdminActionIsDisabled = viewerIsAdmin && isTargetAdmin;

                                                            // Combine rules for destructive actions.
                                                            const isActionDisabled = authorityActionIsDisabled || adminOnAdminActionIsDisabled;

                                                            return <>
                                                                <select className="formInput" defaultValue={user.role} onChange={(e) => handleRoleChange(user, e.target.value)} style={{padding: '5px', fontSize: '12px', width: '120px'}} disabled={isActionDisabled}>
                                                                    <option value="user">User</option>
                                                                    <option value="creator">Creator</option>
                                                                    {/* Only Admins can see or assign Authority/Admin roles */}
                                                                    {viewerIsAdmin && <option value="authority">Authority</option>}
                                                                    {viewerIsAdmin && <option value="admin">Admin</option>}
                                                                </select>
                                                                <div style={{display: 'flex', gap: '5px', justifyContent: 'flex-end', width: '120px'}}>
                                                                    {isSuspended ? (
                                                                        <button className="adminActionButton approve" style={{flex: 1}} onClick={() => handleLiftSuspension(user)} disabled={isActionDisabled}>Reactivate</button>
                                                                    ) : (
                                                                        !user.banned && <button className="adminActionButton" style={{backgroundColor: '#FF8C00', flex: 1}} onClick={() => handleOpenSuspendModal(user)} disabled={isActionDisabled}>Suspend</button>
                                                                    )}
                                                                    <button className={`adminActionButton ${user.banned ? 'approve' : 'reject'}`} style={{flex: 1}} onClick={() => handleToggleBan(user)} disabled={isActionDisabled}>{user.banned ? 'Unban' : 'Ban'}</button>
                                                                </div>
                                                                <button className="adminActionButton" onClick={() => handleToggleVerified(user)} style={{backgroundColor: '#00FFFF', color: '#0A0A0A', width: '120px'}} disabled={adminOnAdminActionIsDisabled}>
                                                                    {getUserStatusBadges(user).some(b => b.text === 'Verified') ? 'Revoke' : 'Verify'}
                                                                </button>
                                                            </>;
                                                        })()}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="dashboardSection">
                            <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsPendingCampaignsExpanded(!isPendingCampaignsExpanded)}>
                                <p className="dashboardSectionTitle" style={{ marginBottom: 0 }}>Pending Campaigns ({pendingCampaigns.length})</p>
                                <span className="text-xl font-bold text-white">{isPendingCampaignsExpanded ? '▼' : '▶'}</span>
                            </div>
                            <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isPendingCampaignsExpanded ? 'max-h-[400px]' : 'max-h-0'}`}>
                                <div className="pt-4 border-t mt-4" style={{borderColor: '#3A3A3A'}}>
                                    <div className="formGroup" style={{ marginBottom: '1rem' }}>
                                        <input type="text" className="formInput" placeholder="Search pending campaigns..." value={pendingCampaignsSearchTerm} onChange={(e) => setPendingCampaignsSearchTerm(e.target.value)} />
                                    </div>
                                    <div style={{maxHeight: '300px', overflowY: 'auto', paddingRight: '10px'}}>
                                        {pendingCampaigns.length === 0 ? <p className="dashboardItem">No campaigns pending review.</p> : pendingCampaigns.filter(c => c.title.toLowerCase().includes(pendingCampaignsSearchTerm.toLowerCase())).map(c => <div key={c.id} className="adminDashboardItem" onClick={() => {setSelectedAdminCampaignId(c.id); setActiveScreen('AdminCampaignDetails');}} style={{cursor: 'pointer'}}><img src={c.imageUrl || 'https://placehold.co/80x45/3A3A3A/FFF?text=N/A'} alt="Thumb" style={{width:'80px', height:'45px', objectFit:'cover', borderRadius:'4px', marginRight:'15px'}}/><div className="flex-grow"><p className="adminDashboardItemTitle">{c.title}</p><p className="text-sm" style={{color:'#CCC'}}>by {c.creatorName}</p></div><button className="adminActionButton approve">Review</button></div>)}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="dashboardSection">
                            <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsActiveCampaignsExpanded(!isActiveCampaignsExpanded)}>
                                <p className="dashboardSectionTitle" style={{ marginBottom: 0 }}>Active Campaigns ({activeCampaigns.length})</p>
                                <span className="text-xl font-bold text-white">{isActiveCampaignsExpanded ? '▼' : '▶'}</span>
                            </div>
                             <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isActiveCampaignsExpanded ? 'max-h-[400px]' : 'max-h-0'}`}>
                                <div className="pt-4 border-t mt-4" style={{borderColor: '#3A3A3A'}}>
                                    <div className="formGroup" style={{ marginBottom: '1rem' }}>
                                        <input type="text" className="formInput" placeholder="Search by campaign title or creator name..." value={campaignSearchTerm} onChange={(e) => setCampaignSearchTerm(e.target.value)} />
                                    </div>
                                    <div style={{maxHeight: '300px', overflowY: 'auto', paddingRight: '10px'}}>
                                        {activeCampaigns.length === 0 ? <p className="dashboardItem">No campaigns currently active.</p> : activeCampaigns
                                            .filter(c => c.title.toLowerCase().includes(campaignSearchTerm.toLowerCase()) || c.creatorName.toLowerCase().includes(campaignSearchTerm.toLowerCase()))
                                            .map(c => (
                                                <div key={c.id} className="adminDashboardItem" onClick={() => {setSelectedAdminCampaignId(c.id); setActiveScreen('AdminCampaignDetails');}} style={{cursor: 'pointer'}}>
                                                    <img src={c.imageUrl || 'https://placehold.co/80x45/3A3A3A/FFF?text=N/A'} alt="Thumb" style={{width:'80px', height:'45px', objectFit:'cover', borderRadius:'4px', marginRight:'15px'}}/>
                                                    <div className="flex-grow">
                                                        <p className="adminDashboardItemTitle">{c.title}</p>
                                                        <p className="text-sm" style={{color:'#CCC'}}>by {c.creatorName}</p>
                                                    </div>
                                                    <button className="adminActionButton">Manage</button>
                                                </div>
                                            ))
                                        }
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="dashboardSection" style={{border: '2px solid #00FFFF'}}>
                            <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsPendingBillboardExpanded(!isPendingBillboardExpanded)}>
                                <p className="dashboardSectionTitle" style={{marginBottom: 0, color: '#00FFFF'}}>Pending Billboard Content ({pendingStatuses.length})</p>
                                <span className="text-xl font-bold text-white">{isPendingBillboardExpanded ? '▼' : '▶'}</span>
                            </div>
                            <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isPendingBillboardExpanded ? 'max-h-[400px]' : 'max-h-0'}`}>
                                <div className="pt-4 border-t mt-4" style={{borderColor: '#333'}}>
                                    <div className="formGroup" style={{ marginBottom: '1rem' }}>
                                        <input type="text" className="formInput" placeholder="Search pending billboard content..." value={pendingBillboardSearchTerm} onChange={(e) => setPendingBillboardSearchTerm(e.target.value)} />
                                    </div>
                                    <div style={{maxHeight: '300px', overflowY: 'auto', paddingRight: '10px'}}>
                                        {pendingStatuses.length === 0 ? <p className="dashboardItem">No billboard content is pending review.</p> : pendingStatuses.filter(s => (s.content?.title || "Untitled Ad").toLowerCase().includes(pendingBillboardSearchTerm.toLowerCase())).map(s => <div key={s.id} className="adminDashboardItem"><p className="flex-grow">{s.content?.title || "Untitled Ad"}<span className="text-sm" style={{color:'#CCC'}}> for {new Date(s.startTime.toDate()).toLocaleDateString()}</span></p><button className="adminActionButton approve" onClick={() => { setSelectedStatus(s); setActiveScreen('AdminStatusReview'); }}>Review</button></div>)}
                                    </div>
                                </div>
                            </div>
                        </section>

                        {creatorProfile.role === 'admin' &&
                            <section className="dashboardSection" style={{border: '2px solid #FFD700'}}>
                                <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsPaymentsExpanded(!isPaymentsExpanded)}>
                                    <p className="dashboardSectionTitle" style={{marginBottom: 0, color: '#FFD700'}}>Pending Payments ({pendingPledges.length})</p>
                                    <span className="text-xl font-bold text-white">{isPaymentsExpanded ? '▼' : '▶'}</span>
                                </div>
                                <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isPaymentsExpanded ? 'max-h-[400px]' : 'max-h-0'}`}>
                                    <div className="pt-4 border-t mt-4" style={{borderColor: '#444'}}>
                                        <input type="text" className="formInput" placeholder="Search by Pledge ID or User Name..." value={pledgeSearchTerm} onChange={(e) => setPledgeSearchTerm(e.target.value)} />
                                        <div style={{maxHeight: '300px', overflowY: 'auto', paddingRight: '10px'}}>
                                            {filteredAndSortedPledges.map(p => (
                                                <div key={p.id} className="adminDashboardItem" style={{flexDirection: 'column', alignItems: 'stretch', gap: '8px'}}>
                                                    <div className="flex justify-between w-full">
                                                        <p className="adminDashboardItemTitle" style={{margin: 0}}>{p.targetCampaignTitle || `[${p.paymentType.toUpperCase()}] Pledge`}</p>
                                                        <p style={{color:'#FFD700', fontWeight: 'bold', fontSize: '1.1rem'}}>{formatCurrency(p.amount, selectedCurrency, currencyRates)}</p>
                                                    </div>
                                                    <div style={{fontSize: '13px', color: '#CCC', borderTop: '1px solid #444', paddingTop: '8px'}}>
                                                        <p style={{margin: 0}}><strong>Pledged By:</strong> {p.userName}</p>
                                                        <p style={{margin: '4px 0'}}><strong>Pledge ID:</strong> {p.pledgeId || p.id}</p>
                                                        <p style={{margin: 0}}><strong>Date:</strong> {new Date(p.createdAt).toLocaleString()}</p>
                                                    </div>
                                                    <div className="flex justify-end gap-4 mt-2">
                                                        <button className="adminActionButton reject" onClick={() => denyPledgeLogic(p.id)}>Deny</button>
                                                        <button className="adminActionButton approve" onClick={() => handleApprovePledge(p.id)}>Approve</button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </section>
                        }

                        <section className="dashboardSection">
                             <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsPendingOpportunitiesExpanded(!isPendingOpportunitiesExpanded)}>
                                <p className="dashboardSectionTitle" style={{ marginBottom: 0 }}>Pending Opportunities ({pendingOpportunities.length})</p>
                                <span className="text-xl font-bold text-white">{isPendingOpportunitiesExpanded ? '▼' : '▶'}</span>
                            </div>
                             <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isPendingOpportunitiesExpanded ? 'max-h-[400px]' : 'max-h-0'}`}>
                                <div className="pt-4 border-t mt-4" style={{borderColor: '#3A3A3A'}}>
                                    <div className="formGroup" style={{ marginBottom: '1rem' }}>
                                        <input type="text" className="formInput" placeholder="Search pending opportunities..." value={pendingOpportunitiesSearchTerm} onChange={(e) => setPendingOpportunitiesSearchTerm(e.target.value)} />
                                    </div>
                                    <div style={{maxHeight: '300px', overflowY: 'auto', paddingRight: '10px'}}>
                                        {pendingOpportunities.filter(o => o.title.toLowerCase().includes(pendingOpportunitiesSearchTerm.toLowerCase())).map(o => <div key={o.id} className="adminDashboardItem"><p className="flex-grow">{o.title}<span className="text-sm" style={{color:'#CCC'}}> by {o.providerName}</span></p><button className="adminActionButton approve" onClick={() => {setSelectedOpportunity(o); setActiveScreen('AdminOpportunityDetails');}}>Review</button></div>)}
                                    </div>
                                </div>
                            </div>
                        </section>

                        <section className="dashboardSection">
                            <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsActiveOpportunitiesExpanded(!isActiveOpportunitiesExpanded)}>
                                <p className="dashboardSectionTitle" style={{ marginBottom: 0 }}>Active Opportunities ({activeOpportunities.length})</p>
                                <span className="text-xl font-bold text-white">{isActiveOpportunitiesExpanded ? '▼' : '▶'}</span>
                            </div>
                             <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isActiveOpportunitiesExpanded ? 'max-h-[400px]' : 'max-h-0'}`}>
                                <div className="pt-4 border-t mt-4" style={{borderColor: '#3A3A3A'}}>
                                    <div className="formGroup" style={{ marginBottom: '1rem' }}>
                                        <input type="text" className="formInput" placeholder="Search active opportunities..." value={activeOpportunitiesSearchTerm} onChange={(e) => setActiveOpportunitiesSearchTerm(e.target.value)} />
                                    </div>
                                    <div style={{maxHeight: '300px', overflowY: 'auto', paddingRight: '10px'}}>
                                        {activeOpportunities.filter(o => o.title.toLowerCase().includes(activeOpportunitiesSearchTerm.toLowerCase())).map(o => <div key={o.id} className="adminDashboardItem"><p className="flex-grow">{o.title}<span className="text-sm" style={{color:'#CCC'}}> by {o.providerName}</span></p><button className="adminActionButton" onClick={() => {setSelectedOpportunity(o); setActiveScreen('AdminOpportunityDetails');}}>Manage</button></div>)}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </>
                )}
                
                {selectedAdminSubScreen === 'ModerationCenter' && <AdminModerationCenter {...{showMessage, setActiveScreen, setSelectedReportGroup, setShowConfirmationModal, setConfirmationTitle, setConfirmationMessage, setOnConfirmationAction}} />}
                {selectedAdminSubScreen === 'ContentManagement' && <AdminContentManagerScreen {...{showMessage, setActiveScreen, featuredContentSlots, setShowConfirmationModal, setConfirmationTitle, setConfirmationMessage, setOnConfirmationAction}} />}
                {selectedAdminSubScreen === 'Competitions' && <AdminCompetitionManager {...{showMessage, setShowConfirmationModal, setConfirmationTitle, setConfirmationMessage, setOnConfirmationAction}} />}
                {selectedAdminSubScreen === 'EventManager' && <AdminEventManagerScreen {...{showMessage, setActiveScreen, setShowConfirmationModal, setConfirmationTitle, setConfirmationMessage, setOnConfirmationAction}} />} 
                {selectedAdminSubScreen === 'CategoryManager' && <AdminCategoryManagerScreen {...{showMessage}} />}
                
                {selectedAdminSubScreen === 'BoxOffice' && <AdminBoxOfficeScreen {...{showMessage}} />}

                {selectedAdminSubScreen === 'SiteManagement' && (
            <AdminSiteManagerScreen 
                {...{showMessage, setShowConfirmationModal, setConfirmationTitle, setConfirmationMessage, setOnConfirmationAction, creatorProfile}} 
                 onReconcileUsers={() => {
            setConfirmationTitle("Reconcile Auth & Firestore Users?");
            setConfirmationMessage("This will scan for and delete any user profiles in the database that no longer have a matching Authentication account. This is useful for clearing 'ghost' users. Proceed?");
            setOnConfirmationAction(() => async () => {
                showMessage("Starting reconciliation...");
                try {
                    const reconcileFunction = httpsCallable(functions, 'reconcileAuthAndFirestoreUsers');
                    const result = await reconcileFunction();
                    showMessage(result.data.message);
                } catch (error) {
                    showMessage(`Error: ${error.message}`);
                }
            });
            setShowConfirmationModal(true);
        }}
    />
)}
            </div>
            
            {showExpiryModal && userToVerify && (
                <SetVerificationExpiryModal
                    userName={userToVerify.creatorName}
                    onCancel={() => setShowExpiryModal(false)}
                    onConfirm={setVerifiedStatus}
                />
            )}

            {showSuspensionModal && userToSuspend && (
                <SuspensionModal
                    userName={userToSuspend.creatorName}
                    onCancel={() => setShowSuspensionModal(false)}
                    onConfirm={handleConfirmSuspend}
                />
            )}
        </>
    );
  }
export default AdminDashboardScreen;