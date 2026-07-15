// src/components/AdminDashboardScreen.jsx

import React, { useState, useEffect } from 'react';
import { db, functions, storage, ref, uploadBytes, getDownloadURL, httpsCallable, collection, onSnapshot, query, where, orderBy, doc, deleteDoc, updateDoc, setDoc, getDocs, getDoc, increment } from '../firebase';

// --- Sub-Screens ---
import AdminPayoutRequestScreen from './AdminPayoutRequestScreen';
import AdminPayoutHistoryScreen from './AdminPayoutHistoryScreen'; // THE FIX: Add History Import
import AdminEnrollmentManager from './AdminEnrollmentManager';
import AdminModerationCenter from './AdminModerationCenter';
import AdminContentManagerScreen from './AdminContentManagerScreen';
import AdminCompetitionManager from './AdminCompetitionManager';
import AdminCategoryManagerScreen from './AdminCategoryManagerScreen';
import AdminEventManagerScreen from './AdminEventManagerScreen';
import AdminBoxOfficeScreen from './AdminBoxOfficeScreen';
import AdminSiteManagerScreen from './AdminSiteManagerScreen';
import SuspensionModal from './SuspensionModal';
import formatCurrency from '../utils/formatCurrency';
import RoleBadge from './RoleBadge';

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
    setSelectedOpportunity,
    setSelectedCompAdmin,
    setSelectedReportGroup,
    featuredContentSlots,
    currencyRates,
    selectedCurrency
}) => {
    
    // --- STATE ---
    const [loading, setLoading] = useState(true);
    const [allUsers, setAllUsers] = useState([]);

    // --- STAFF COMMISSION MATRIX & EXPENSE LOG STATES ---
    const [draftCommissions, setDraftCommissions] = useState({});
    const [expensesList, setExpensesList] = useState([]);
    const [transactionsList, setTransactionsList] = useState([]);
    const [expenseAmountInput, setExpenseAmountInput] = useState('');
    const [expenseCategoryInput, setExpenseCategoryInput] = useState('Electricity');
    const [expenseDescInput, setExpenseDescInput] = useState('');
    const [financeTimeframe, setFinanceTimeframe] = useState('monthly'); // daily, weekly, monthly, yearly
    
    // Token Economics Draft States
    const [draftRoastTokens, setDraftRoastTokens] = useState([]);
    const [draftGiftTokens, setDraftGiftTokens] = useState([]);
    const [centerStageContestants, setCenterStageContestants] = useState([]);
    const [pendingOpportunities, setPendingOpportunities] = useState([]);
    const [activeOpportunities, setActiveOpportunities] = useState([]);
    const [pendingPledges, setPendingPledges] = useState([]);
    const [monetizationQueue, setMonetizationQueue] = useState([]); 
    const [pendingPayouts, setPendingPayouts] = useState([]); 
    const [pendingAuctions, setPendingAuctions] = useState([]); 

    // --- SYSTEM FINANCE HUB STATES ---
    const [systemReportData, setSystemReportData] = useState(null);
    const [isGeneratingSystemReport, setIsGeneratingSystemReport] = useState(false);
    const [financeStartDate, setFinanceStartDate] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0]);
    const [financeEndDate, setFinanceEndDate] = useState(new Date().toISOString().split('T')[0]);

    const [competitionState, setCompetitionState] = useState(null);
    const [globalMedia, setGlobalMedia] = useState(null);
    const [homeScreenLayout, setHomeScreenLayout] = useState({}); // FIX: Home Screen State

    // UI Toggles
    const [isUserManagementExpanded, setIsUserManagementExpanded] = useState(true);
    const [isPaymentsExpanded, setIsPaymentsExpanded] = useState(true);
    const [showSuspensionModal, setShowSuspensionModal] = useState(false);
    const [userToSuspend, setUserToSuspend] = useState(null);

    // --- DEPRECATED TOGGLES REMOVED ---

    // Search & Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedRole, setSelectedRole] = useState('All');
    const [pledgeSearchTerm, setPledgeSearchTerm] = useState('');
    const [pledgeSortType, setPledgeSortType] = useState('date');
    const [pledgeFilterType, setPledgeFilterType] = useState('all'); // THE FIX: Tracks active payment filter

    // Badges
    const [pendingReportsCount, setPendingReportsCount] = useState(0);
    const [pendingAppealsCount, setPendingAppealsCount] = useState(0);
    const [pendingEnrollmentCount, setPendingEnrollmentCount] = useState(0);
    const [newSubmissionsCount, setNewSubmissionsCount] = useState(0);

    // Temporary input states for CenterStage editing
    const [editMediaInputs, setEditMediaInputs] = useState({});
    const [editTeamInputs, setEditTeamInputs] = useState({});
    const [editThumbInputs, setEditThumbInputs] = useState({});
    const [selectedStageToEdit, setSelectedStageToEdit] = useState(null); // FIX: Targeted Stage Editing
    const [isUploadingThumb, setIsUploadingThumb] = useState({});
    
    // Group challenge live previews
    const [groupFilmInput, setGroupFilmInput] = useState('');
    const [groupThumbInput, setGroupThumbInput] = useState('');

    // --- REWARDS & USER AUDIT REPORT STATES ---
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [reportTargetUser, setReportTargetUser] = useState(null);
    const [reportMonth, setReportMonth] = useState('2026-06'); // Format: YYYY-MM
    const [reportData, setReportData] = useState([]);
    const [userCompetitions, setUserCompetitions] = useState([]);
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);

    // Fetch active commission matrix when entering financials view
    useEffect(() => {
        if (selectedAdminSubScreen === 'Financials') {
            const fetchComms = async () => {
                try {
                    const commDoc = await getDoc(doc(db, "settings", "commissions"));
                    if (commDoc.exists()) {
                        setDraftCommissions(commDoc.data().staff || {});
                    }
                } catch (e) {
                    console.error("Failed to load commissions configuration.", e);
                }
            };
            fetchComms();
        }
    }, [selectedAdminSubScreen]);

    // Handle manual out-of-pocket expense logging
    const handleAddExpense = async (e) => {
        e.preventDefault();
        if (!expenseAmountInput || isNaN(expenseAmountInput) || Number(expenseAmountInput) <= 0) {
            showMessage("Please enter a valid expense amount.");
            return;
        }
        showMessage("Saving expense...");
        try {
            const expId = `EXP_${Date.now()}`;
            const expenseData = {
                id: expId,
                amount: Number(expenseAmountInput),
                category: expenseCategoryInput,
                description: expenseDescInput || '',
                createdAt: new Date().toISOString()
            };
            await setDoc(doc(db, "expenses", expId), expenseData);
            
            // Clean inputs and refresh ledger representation
            setExpenseAmountInput('');
            setExpenseDescInput('');
            showMessage("Expense logged successfully!");
            handleGenerateClientReport();
        } catch (err) {
            showMessage("Failed to save manual expense: " + err.message);
        }
    };

    // Matrix input change handler
    const handleMatrixValueChange = (staffUid, staffName, staffRole, columnKey, value) => {
        const numericVal = Math.max(0, Math.min(15, Number(value) || 0)); // Prevent negative numbers or numbers exceeding maximum 15%
        setDraftCommissions(prev => ({
            ...prev,
            [staffUid]: {
                ...prev[staffUid],
                name: staffName,
                role: staffRole,
                [columnKey]: numericVal
            }
        }));
    };

    // Commission limits matrix validation tool
    const getColumnTotal = (colKey) => {
        const staffList = allUsers.filter(u => u.role === 'admin' || u.role === 'authority' || u.role === 'moderator');
        return staffList.reduce((sum, u) => sum + Number(draftCommissions[u?.id]?.[colKey] || 0), 0);
    };

    // Write matrix values to Firestore settings
    const handleSaveCommissions = async () => {
        const columns = ['centerstage', 'competitions', 'film_arena', 'film_club', 'box_office', 'roast_arena', 'explore_hub'];
        const overLimit = columns.some(col => getColumnTotal(col) > 15);

        if (overLimit) {
            showMessage("Validation Error: Columns cannot exceed 15% total.");
            return;
        }

        showMessage("Saving commission settings...");
        try {
            await setDoc(doc(db, "settings", "commissions"), { staff: draftCommissions }, { merge: true });
            showMessage("Commission matrix saved!");
        } catch (e) {
            showMessage("Failed to save: " + e.message);
        }
    };

    // Client-Side Zero Cost report processor
    const handleGenerateClientReport = async () => {
        setIsGeneratingSystemReport(true);
        showMessage("Compiling system ledger...");
        try {
            // Ingest all transactions for the designated timeframe
            const txQuery = query(
                collection(db, "transactions"),
                where("createdAt", ">=", financeStartDate),
                where("createdAt", "<=", financeEndDate + 'T23:59:59Z')
            );
            const txSnap = await getDocs(txQuery);
            const parsedTransactions = txSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            setTransactionsList(parsedTransactions);

            // Ingest all manual expenses recorded for the designated timeframe
            const expQuery = query(
                collection(db, "expenses"),
                where("createdAt", ">=", financeStartDate),
                where("createdAt", "<=", financeEndDate + 'T23:59:59Z')
            );
            const expSnap = await getDocs(expQuery);
            const parsedExpenses = expSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            setExpensesList(parsedExpenses);

            // Math loop
            let sectionalData = {
                centerstage: { count: 0, gross: 0, revenue: 0, staffCuts: 0 },
                competitions: { count: 0, gross: 0, revenue: 0, staffCuts: 0 },
                film_arena: { count: 0, gross: 0, revenue: 0, staffCuts: 0 },
                film_club: { count: 0, gross: 0, revenue: 0, staffCuts: 0 },
                box_office: { count: 0, gross: 0, revenue: 0, staffCuts: 0 },
                roast_arena: { count: 0, gross: 0, revenue: 0, staffCuts: 0 },
                explore_hub: { count: 0, gross: 0, revenue: 0, staffCuts: 0 }
            };

            let grossSum = 0;
            let revenueSum = 0;
            let staffCutsSum = 0;

            parsedTransactions.forEach(tx => {
                const src = tx.source || 'explore_hub';
                if (!sectionalData[src]) {
                    sectionalData[src] = { count: 0, gross: 0, revenue: 0, staffCuts: 0 };
                }

                const grossVal = tx.amount || 0;
                const netFee = grossVal * 0.15; // Platform cut

                sectionalData[src].count += 1;
                sectionalData[src].gross += grossVal;
                sectionalData[src].revenue += netFee;

                grossSum += grossVal;
                revenueSum += netFee;

                // Process active staff cuts from matrix
                Object.entries(draftCommissions).forEach(([uid, setup]) => {
                    const commissionPercent = Number(setup[src] || 0) / 100;
                    const commissionValue = grossVal * commissionPercent;
                    sectionalData[src].staffCuts += commissionValue;
                    staffCutsSum += commissionValue;
                });
            });

            const expensesSum = parsedExpenses.reduce((sum, current) => sum + (current.amount || 0), 0);
            const netVaultSum = revenueSum - staffCutsSum - expensesSum;

            setSystemReportData({
                grandTotalGross: grossSum,
                grandTotalRevenue: revenueSum,
                grandTotalLiabilities: staffCutsSum,
                grandTotalExpenses: expensesSum,
                grandTotalVault: netVaultSum,
                sections: sectionalData
            });

            showMessage("System Audit compiled internally!");
        } catch (e) {
            console.error(e);
            showMessage("Failed to generate ledger.");
        } finally {
            setIsGeneratingSystemReport(false);
        }
    };

    // Timeframe grouping analyzer
    const getGroupedLedgerData = () => {
        if (!transactionsList.length) return {};
        const groups = {};
        transactionsList.forEach(tx => {
            const date = new Date(tx.createdAt);
            if (isNaN(date.getTime())) return;
            
            let groupKey = '';
            if (financeTimeframe === 'daily') {
                groupKey = date.toISOString().split('T')[0];
            } else if (financeTimeframe === 'weekly') {
                const diff = date.getDate() - date.getDay();
                const startOfWeek = new Date(date.setDate(diff));
                groupKey = `Week of ${startOfWeek.toISOString().split('T')[0]}`;
            } else if (financeTimeframe === 'yearly') {
                groupKey = `${date.getFullYear()}`;
            } else { 
                groupKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            }

            if (!groups[groupKey]) groups[groupKey] = { gross: 0, count: 0 };
            groups[groupKey].gross += tx.amount || 0;
            groups[groupKey].count += 1;
        });
        return groups;
    };

    // Dynamic, on-demand secure audit report compiler
    const generateUserAuditReport = async (targetUser, selectedMonth = reportMonth) => {
        setIsGeneratingReport(true);
        showMessage(`Generating audit report for ${targetUser.creatorName || 'user'}...`);
        try {
            // 1. Query all approved financial pledges targeting this creator
            const pledgesSnapshot = await getDocs(query(
                collection(db, "paymentPledges"),
                where("status", "==", "approved"),
                where("targetUserId", "==", targetUser.id)
            ));

            // 2. Query all tournaments this creator participated in
            const compsSnapshot = await getDocs(collection(db, "competitions"));
            const enteredComps = [];

            for (const compDoc of compsSnapshot.docs) {
                const entryDoc = await getDoc(doc(db, "competitions", compDoc.id, "entries", targetUser.id));
                if (entryDoc.exists()) {
                    enteredComps.push({
                        id: compDoc.id,
                        compTitle: compDoc.data().title,
                        entryTitle: entryDoc.data().title,
                        votes: entryDoc.data().likeCount || 0,
                        status: entryDoc.data().status || 'active'
                    });
                }
            }
            setUserCompetitions(enteredComps);

            // 3. Process, filter, and calculate net earnings after 15% NVA fee
            const logs = pledgesSnapshot.docs.map(d => {
                const p = d.data();
                const createdTime = p.createdAt?.toDate ? p.createdAt.toDate().getTime() : (p.createdAt ? new Date(p.createdAt).getTime() : 0);
                
                const date = new Date(createdTime);
                const formattedMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                
                // Filter strictly by the chosen month
                if (formattedMonth !== selectedMonth) return null;

                const gross = p.amount || 0;
                const net = Math.round((gross * (1 - 0.15)) * 100) / 100; // Deduct 15% platform fee [1]
                const donorUser = allUsers.find(u => u.id === p.userId);

                // Auto-reconstruct the precise source of older records based on ID existence
                let parsedSource = p.targetEventTitle || '';
                if (!parsedSource) {
                    if (p.competitionId && p.entryId) {
                        parsedSource = `[Tournament Entry] Audition ID: ${p.entryId}`;
                    } else if (p.paymentType === 'giftToken') {
                        parsedSource = "[CenterStage] Arena Gifting";
                    } else {
                        parsedSource = "Profile Gifting (General Support)";
                    }
                }

                return {
                    id: d.id,
                    giftName: p.giftName || 'Gifting Token',
                    gross: gross,
                    net: net,
                    date: date.toLocaleString(),
                    donorEmail: donorUser?.email || p.userName || 'N/A',
                    donorUid: p.userId || 'N/A',
                    source: parsedSource // Displays precise placement details [1]
                };
            }).filter(Boolean);

            setReportData(logs);
            setReportTargetUser(targetUser);
            setReportMonth(selectedMonth);
            setIsReportModalOpen(true);
            showMessage("Report compiled successfully!");
        } catch (err) {
            console.error("Audit Generation Failed:", err);
            showMessage("Failed to compile audit report.");
        } finally {
            setIsGeneratingReport(false);
        }
    };

    // --- DATA FETCHING ---
    useEffect(() => {
        const unsubscribers = [];

        const safeSubscribe = (q, onSuccess, name) => {
            unsubscribers.push(onSnapshot(q, onSuccess, () => {}));
        };

        // All Users
        unsubscribers.push(onSnapshot(collection(db, "creators"), 
            (snapshot) => {
                setAllUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setLoading(false);
            },
            () => setLoading(false)
        ));        

        // CenterStage Contestants
        safeSubscribe(query(collection(db, "creators"), where("isContestant", "==", true)), 
            (s) => setCenterStageContestants(s.docs.map(d => ({ id: d.id, ...d.data() }))), 'centerstage');
        
        // Opportunities
        safeSubscribe(query(collection(db, "opportunities"), where('status', '==', 'pending')), 
            (s) => setPendingOpportunities(s.docs.map(d=>({id:d.id,...d.data()}))), 'opportunities (pending)');
        safeSubscribe(query(collection(db, "opportunities"), where('status', '==', 'active'), where('expiresAt', '>', new Date())), 
            (s) => setActiveOpportunities(s.docs.map(d=>({id:d.id,...d.data()}))), 'opportunities (active)');

        // NEW: Monetization Queue Subscription
        const contentRef = collection(db, `artifacts/production-app-id/public/data/content_items`);
        safeSubscribe(query(contentRef, where('monetizationStatus', '==', 'pending')), 
            (s) => setMonetizationQueue(s.docs.map(d=>({id:d.id,...d.data()}))), 'monetizationQueue');

        // NEW: Bid Wars Approval Queue
        safeSubscribe(query(collection(db, "auctions"), where('status', '==', 'pending')), 
            (s) => setPendingAuctions(s.docs.map(d=>({id:d.id,...d.data()}))), 'pendingAuctions');

        // Admin Only Data
        if (creatorProfile.role === 'admin' || creatorProfile.role === 'authority' || creatorProfile.role === 'super_admin') {
            safeSubscribe(query(collection(db, "reports"), where("status", "==", "pending")), (s) => setPendingReportsCount(s.size), 'reports');
            safeSubscribe(query(collection(db, "appeals"), where("status", "==", "pending")), (s) => setPendingAppealsCount(s.size), 'appeals');
            safeSubscribe(query(collection(db, "enrollmentApplications"), where("status", "in", ["pending", "paymentPending"])), (s) => setPendingEnrollmentCount(s.size), 'enrollmentApps');
        }
        
        if (creatorProfile.role === 'admin' || creatorProfile.role === 'super_admin') {
            safeSubscribe(query(collection(db, "paymentPledges"), where('status', '==', 'pending')), 
                (s) => setPendingPledges(s.docs.map(d=>({id:d.id,...d.data()}))), 'paymentPledges');
        }

        safeSubscribe(query(collection(db, "contactSubmissions"), where("status", "==", "New")), 
            (s) => setNewSubmissionsCount(s.size), 'contactSubmissions');

        // THE FIX: Real-time listener for Payout Requests
        safeSubscribe(query(collection(db, "payoutRequests"), where("status", "==", "pending")), 
            (s) => setPendingPayouts(s.docs.map(d => ({ id: d.id, ...d.data() }))), 'payoutRequests');

        // NEW: Real-time listener for Home Screen layout overrides (Music Charts Toggle)
        safeSubscribe(doc(db, "settings", "homeScreenLayout"), 
            (snap) => { if (snap.exists()) setHomeScreenLayout(snap.data()); }, 'homeScreenLayout');

        // NEW: Real-time Token Economics Configuration
        safeSubscribe(doc(db, "settings", "tokenEconomics"), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setDraftRoastTokens(data.roastTokens || []);
                setDraftGiftTokens(data.giftTokens || []);
            } else {
                // Initialize default database template if totally empty
                setDraftRoastTokens([
                    { id: 'pack_1', tokens: 20, price: 500, label: 'Scorch Pack', icon: '🎟️', subtext: 'Get 20 Tokens' },
                    { id: 'pack_5', tokens: 90, price: 2000, label: 'Hot Seat Bundle', icon: '🔥', subtext: 'Get 90 Tokens' },
                    { id: 'pack_15', tokens: 250, price: 5000, label: 'Roast Master', icon: '💀', subtext: 'Get 250 Tokens' }
                ]);
                setDraftGiftTokens([
                    { id: 'spotlight', name: 'Warm Spotlight', price: 500, icon: '🔦' },
                    { id: 'popcorn', name: 'Golden Popcorn', price: 1000, icon: '🍿' },
                    { id: 'flare', name: 'Rainbow Flare', price: 2500, icon: '🌈' },
                    { id: 'chair', name: "Director's Chair", price: 5000, icon: '🎬' },
                    { id: 'producer', name: 'The Executive Producer', price: 10000, icon: '💎' }
                ]);
            }
        }, 'tokenEconomics');

        return () => unsubscribers.forEach(unsub => unsub());
    }, [creatorProfile?.role]);

    // Competition State (stages)
    useEffect(() => {
        const unsub = onSnapshot(doc(db, "settings", "competitionDisplayState"), (snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setCompetitionState(data);
                setGlobalMedia(data);
            }
        });
        return () => unsub();
    }, []);

    // --- FILTERS ---
    const filteredUsers = allUsers.filter(user => {
        const matchesSearch = searchTerm === '' || user.creatorName?.toLowerCase().includes(searchTerm.toLowerCase()) || user.email?.toLowerCase().includes(searchTerm.toLowerCase());
        if (!matchesSearch) return false;
        if (selectedRole === 'All') return true;

        const now = new Date();
        const isPremium = user.premiumExpiresAt && user.premiumExpiresAt.toDate() > now;
        const isSuspended = user.suspendedUntil && user.suspendedUntil.toDate() > now;
        const isBanned = user.banned === true;

        switch (selectedRole) {
            case 'premium': return isPremium;
            case 'suspended': return isSuspended;
            case 'banned': return isBanned;
            default: return user.role === selectedRole;
        }
    });

    const filteredAndSortedPledges = pendingPledges
        .filter(p => pledgeSearchTerm === '' || p.pledgeId?.toLowerCase().includes(pledgeSearchTerm.toLowerCase()) || p.userName?.toLowerCase().includes(pledgeSearchTerm.toLowerCase()))
        // THE FIX: Filter list dynamically by payment type (roastToken, giftToken, ticket) [2]
        .filter(p => pledgeFilterType === 'all' || (p.paymentType || p.type) === pledgeFilterType)
        .sort((a, b) => pledgeSortType === 'date' ? new Date(b.createdAt) - new Date(a.createdAt) : (a.paymentType || a.type || '').localeCompare(b.paymentType || b.type || ''));

    // --- USER MANAGEMENT HANDLERS ---
    const handleRoleChange = (targetUser, newRole) => {
        setConfirmationTitle("Change User Role?");
        setConfirmationMessage(`Change ${targetUser.creatorName}'s role to "${newRole}"?`);
        setOnConfirmationAction(() => async () => {
            showMessage("Updating role...");
            try {
                const changeRoleFunction = httpsCallable(functions, 'changeUserRole');
                const result = await changeRoleFunction({ targetUserId: targetUser.id, newRole: newRole });
                showMessage(result.data.message);
            } catch (error) { showMessage(`Error: ${error.message}`); }
        });
        setShowConfirmationModal(true);
    };
    
    const handleToggleBan = (userToBan) => {
        const action = userToBan.banned ? 'Unban' : 'Ban';
        setConfirmationTitle(`${action} User?`);
        setConfirmationMessage(`Are you sure you want to ${action.toLowerCase()} user ${userToBan.creatorName}?`);
        setOnConfirmationAction(() => async () => {
            showMessage(`Processing ${action}...`);
            try {
                const toggleBanFunction = httpsCallable(functions, 'toggleUserBanStatus');
                const result = await toggleBanFunction({ targetUserId: userToBan.id });
                showMessage(result.data.message);
            } catch (error) { showMessage(`Error: ${error.message}`); }
        });
        setShowConfirmationModal(true);
    };

    const handleLiftCooldown = (userToLift) => {
        setConfirmationTitle("Lift Campaign Cooldown?");
        setConfirmationMessage(`Allow ${userToLift.creatorName} to create a new campaign?`);
        setOnConfirmationAction(() => async () => {
            try {
                const liftCooldownFunction = httpsCallable(functions, 'liftCampaignCooldown');
                const result = await liftCooldownFunction({ targetUserId: userToLift.id });
                showMessage(result.data.message);
            } catch (error) { showMessage(`Error: ${error.message}`); }
        });
        setShowConfirmationModal(true);
    };

    const handleLiftSuspension = (userToReinstate) => {
        setConfirmationTitle("Lift Suspension?");
        setConfirmationMessage(`Lift suspension for ${userToReinstate.creatorName}?`);
        setOnConfirmationAction(() => async () => {
            try {
                const liftSuspensionFunction = httpsCallable(functions, 'liftUserSuspension');
                const result = await liftSuspensionFunction({ targetUserId: userToReinstate.id });
                showMessage(result.data.message);
            } catch (error) { showMessage(`Error: ${error.message}`); }
        });
        setShowConfirmationModal(true);
    };

    const handleConfirmSuspend = async (duration) => {
        if (!userToSuspend) return;
        setShowSuspensionModal(false);
        showMessage(`Suspending ${userToSuspend.creatorName}...`);
        try {
            const suspendFunction = httpsCallable(functions, 'suspendUserDirectly');
            const result = await suspendFunction({ userId: userToSuspend.id, durationHours: duration });
            showMessage(result.data.message);
        } catch (error) { showMessage(`Error: ${error.message}`); } 
        finally { setUserToSuspend(null); }
    };

    // --- BID WARS QUEUE HANDLERS ---
    const handleApproveAuction = async (auction) => {
        setConfirmationTitle("Approve Auction?");
        setConfirmationMessage(`Verify that the 10-second proof video for "${auction.title}" meets guidelines. This will allow the seller to pay 20 Tokens and launch it live.`);
        setOnConfirmationAction(() => async () => {
            showMessage("Approving auction...");
            try {
                await updateDoc(doc(db, "auctions", auction.id), { status: 'approved' });
                showMessage("Auction Approved!");
            } catch (error) { showMessage(`Error: ${error.message}`); }
        });
        setShowConfirmationModal(true);
    };

    const handleRejectAuction = async (auction) => {
        if (window.confirm("Reject and delete this auction?")) {
            try {
                await deleteDoc(doc(db, "auctions", auction.id));
                showMessage("Auction rejected and deleted.");
            } catch (error) { showMessage(`Error: ${error.message}`); }
        }
    };

    // --- MONETIZATION QUEUE HANDLERS ---
    const handleApproveMonetization = async (item) => {
        setConfirmationTitle("Approve Monetization?");
        setConfirmationMessage(`Verify original work for "${item.title}". Once approved, it will be LAUNCHED fresh at the top of the Showcase.`);
        setOnConfirmationAction(() => async () => {
            showMessage("Launching video...");
            try {
                const currentAppId = "production-app-id";
                const collectionRef = collection(db, `artifacts/${currentAppId}/public/data/content_items`);
                
                // Enforce "Only 1 Video Monetized" limit: Turn off monetization on any of this creator's other videos
                const otherApprovedQuery = query(
                    collectionRef, 
                    where("creatorId", "==", item.creatorId), 
                    where("monetizationStatus", "==", "approved")
                );
                const otherDocsSnap = await getDocs(otherApprovedQuery);
                const disablePromises = otherDocsSnap.docs.map(docSnap => {
                    if (docSnap.id === item.id) return Promise.resolve();
                    return updateDoc(docSnap.ref, { monetizationStatus: 'none' });
                });
                await Promise.all(disablePromises);

                // Set newly approved video as the single active monetized item
                const itemRef = doc(db, `artifacts/${currentAppId}/public/data/content_items`, item.id);
                await updateDoc(itemRef, {
                    isActive: true,
                    monetizationStatus: 'approved',
                    createdAt: new Date().toISOString()
                });

                // Server trigger onMonetizationStatusChange handles secure notification delivery automatically!

                showMessage("Video Approved & Launched!");
            } catch (error) { showMessage(`Error: ${error.message}`); }
        });
        setShowConfirmationModal(true);
    };

    const handleRejectMonetization = async (item) => {
        try {
            const currentAppId = "production-app-id";
            const itemRef = doc(db, `artifacts/${currentAppId}/public/data/content_items`, item.id);
            
            // Only flip status; the backend trigger will handle the secure notification delivery
            await updateDoc(itemRef, { monetizationStatus: 'rejected', isActive: false });

            // Server trigger onMonetizationStatusChange handles secure notification delivery automatically!

            showMessage("Monetization rejected.");
        } catch (error) { showMessage(`Error: ${error.message}`); }
    };

    // --- PLEDGE HANDLERS ---
    const handleApprovePledge = async (pledgeId) => {
        showMessage(`Approving pledge...`);
        try {
            // Server-Authoritative Sync: 100% of the financial math, ticket inventory,
            // and token/cash-value crediting is handled securely inside the backend transaction!
            const approvePledgeCallable = httpsCallable(functions, 'approvePledge');
            const result = await approvePledgeCallable({ pledgeId: pledgeId, appId: "production-app-id" });
            showMessage(result.data.message);
        } catch (error) { 
            showMessage(`Error: ${error.message}`); 
        }
    };
    const denyPledgeLogic = async (pledgeId) => { await deleteDoc(doc(db, "paymentPledges", pledgeId)); showMessage("Pledge denied."); };

    // --- CENTERSTAGE HANDLERS (Direct Firestore Client-Side Writes) ---
    const handleCenterStageAction = async (targetUserId, action, payload = {}) => {
        showMessage("Updating CenterStage...");
        try {
            const userRef = doc(db, "creators", targetUserId);
            let updatePayload = {};

            if (action === 'eliminate') {
                updatePayload = { 
                    isEliminated: true, 
                    competitionStatus: 'eliminated',
                    eliminatedAtStageIndex: competitionState?.currentStageIndex || 0 
                };
            } 
            else if (action === 'reinstate') {
                updatePayload = { 
                    isEliminated: false, 
                    competitionStatus: 'active',
                    eliminatedAtStageIndex: null 
                };
            } 
            else if (action === 'update_media') {
                const targetStage = payload.stageName || 'Round 1';
                updatePayload = { 
                    // Support legacy for now, but primary data goes to performances map
                    currentChallengeLink: payload.challengeLink || '', 
                    currentChallengeThumbnail: payload.customThumbnailUrl || '',
                    [`performances.${targetStage}`]: {
                        link: payload.challengeLink || '',
                        thumbnail: payload.customThumbnailUrl || ''
                    }
                };
            } 
            else if (action === 'assign_team') {
                updatePayload = { teamTag: payload.teamTag ? payload.teamTag.trim() : '' };
            }

            await updateDoc(userRef, updatePayload);
            showMessage("Update successful!");
        } catch (error) {
            showMessage(`Error: ${error.message}`);
        }
    };

    const handleNukeSeason = () => {
        setConfirmationTitle("NUKE CENTERSTAGE SEASON?");
        setConfirmationMessage("⚠️ WARNING: This will permanently wipe ALL historical round data, votes, gifts, media links, and team tags for all active contestants, and purge all saved storage folders. Proceed?");
        setOnConfirmationAction(() => async () => {
            showMessage("Nuking Season Data...");
            try {
                // Call storage backend purge function
                const purgeStorageFunc = httpsCallable(functions, 'nukeCenterStageStorage');
                await purgeStorageFunc();

                const nukePromises = centerStageContestants.map(c => updateDoc(doc(db, "creators", c.id), {
                    voteCount: 0,
                    giftsReceived: 0,
                    giftInventory: {},
                    currentChallengeLink: "",
                    currentChallengeThumbnail: "",
                    performances: {},
                    isEliminated: false,
                    eliminatedAtStageIndex: null,
                    teamTag: ""
                }));
                await Promise.all(nukePromises);
                
                await setDoc(doc(db, "settings", "competitionDisplayState"), {
                    currentStageIndex: 0,
                    roundMedia: {},
                    roundSponsors: {},
                    championMediaUrl: "",
                    championMediaType: ""
                }, { merge: true });

                showMessage("Season & Storage completely nuked! Fresh slate ready.");
            } catch (error) {
                showMessage(`Nuke failed: ${error.message}`);
            }
        });
        setShowConfirmationModal(true);
    };

    const getUserStatusBadges = (user) => {
        const badges = [];
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

        if (user.banned) badges.push({ text: 'Banned', color: '#DC3545' });
        else if (user.suspendedUntil && user.suspendedUntil.toDate() > now) badges.push({ text: 'Suspended', color: '#FF8C00' });
        else {
            const lastLogin = user.lastLoginTimestamp?.toDate();
            if (lastLogin) {
                if (lastLogin >= today) badges.push({ text: 'Active Today', color: '#00FF00' });
                else if (lastLogin >= oneWeekAgo) badges.push({ text: 'Active This Week', color: '#90EE90' });
                else {
                    const daysAgo = Math.floor((now - lastLogin) / (1000 * 60 * 60 * 24));
                    badges.push({ text: `Inactive: ${daysAgo}d`, color: '#FFA500' });
                }
            } else badges.push({ text: 'Inactive', color: '#808080' });
        }

        if (user.badges?.includes('Contestant')) badges.push({ text: 'Contestant', color: '#00FFFF' });
        if (user.badges?.includes('Film Student')) badges.push({ text: 'Film Club', color: '#FFD700' });
        return badges;
    };
    
    if (loading) return <div className="screenContainer" style={{ textAlign: 'center' }}><p className="heading">Loading Admin Data...</p></div>;
    
    // FIXED: Master count now includes Pledges, Opportunities, Monetization, Reports, and Appeals
    const pendingOverviewCount = pendingPledges.length + pendingOpportunities.length + monetizationQueue.length + pendingReportsCount + pendingAppealsCount;
    
    return (
        <>
            <style>{`
                .admin-nav-container { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; background: rgba(0,0,0,0.4); padding: 15px; border-radius: 12px; border: 1px solid #333; }
                .admin-nav-button { flex: 1 1 auto; min-width: 140px; background: #1A1A1A; border: 1px solid #444; color: #CCC; padding: 10px; border-radius: 8px; font-size: 13px; font-weight: bold; cursor: pointer; transition: all 0.2s ease; text-align: center; white-space: nowrap; }
                .admin-nav-button:hover { background: #333; color: #FFF; border-color: #666; }
                .admin-nav-button.active { background: #FFD700; color: #000; border-color: #FFD700; box-shadow: 0 0 10px rgba(255, 215, 0, 0.3); }
                .cs-card { background: #111; border: 1px solid #333; border-radius: 8px; padding: 15px; margin-bottom: 10px; }
                .cs-input { width: 100%; background: #222; border: 1px solid #444; color: #FFF; padding: 8px; border-radius: 4px; font-size: 12px; margin-bottom: 5px; }

                /* ====== AUTHORITATIVE ZERO-COST PRINT-TO-PDF OVERRIDES ====== */
                @media print {
                    /* Hide UI chrome, but KEEP screenContainer visible so children can print */
                    .admin-nav-container, .header, .navigation-bar, .modal-close-button, .adminActionButton, button, select, .formGroup {
                        display: none !important;
                    }

                    .screenContainer {
                        display: block !important;
                        background: #FFFFFF !important;
                        color: #000000 !important;
                        padding: 0 !important;
                        margin: 0 !important;
                        width: 100% !important;
                        height: auto !important;
                        overflow: visible !important;
                    }

                    /* Float and expand the modal content cleanly (for User Reports) */
                    .modal-backdrop {
                        position: absolute !important;
                        left: 0 !important;
                        top: 0 !important;
                        width: 100% !important;
                        background: transparent !important;
                        backdrop-filter: none !important;
                        box-shadow: none !important;
                        padding: 0 !important;
                    }
                    
                    /* THE UN-CROP FIX: Disable scrollbars and set infinite heights for printing */
                    .modal-content, .modal-body, .modal-backdrop {
                        max-height: none !important;
                        height: auto !important;
                        overflow: visible !important;
                        overflow-y: visible !important;
                    }

                    .modal-content {
                        background: #FFFFFF !important;
                        color: #000000 !important;
                        border: none !important;
                        box-shadow: none !important;
                        width: 100% !important;
                        max-width: 100% !important;
                        margin: 0 !important;
                    }
                    /* Force high-contrast black text for clean print outputs */
                    p, span, div, h2, strong, td, th, h1 {
                        color: #000000 !important;
                        text-shadow: none !important;
                    }
                    .adminDashboardItem, .patron-tier, .glass-panel {
                        background: none !important;
                        border: 1px solid #CCCCCC !important;
                    }
                    /* Force the printable section to be full width */
                    .printable-content {
                        border: none !important;
                        background: transparent !important;
                        width: 100% !important;
                        padding: 0 !important;
                    }
                }
            `}</style>

            <div className="screenContainer">
                <p className="heading">Admin Command Center</p>
                
                {/* OPTIMIZED NAVIGATION */}
                <div className="admin-nav-container">
                    <button className={`admin-nav-button ${selectedAdminSubScreen === 'Overview' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('Overview')}>
                        Overview {pendingOverviewCount > 0 && <span style={{color: '#DC3545'}}>({pendingOverviewCount})</span>}
                    </button>
                    <button className={`admin-nav-button ${selectedAdminSubScreen === 'Enrollments' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('Enrollments')}>
                        Enrollments {pendingEnrollmentCount > 0 && <span style={{color: '#DC3545'}}>({pendingEnrollmentCount})</span>}
                    </button>
                    <button className={`admin-nav-button ${selectedAdminSubScreen === 'ModerationCenter' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('ModerationCenter')}>
                        Moderation {(pendingReportsCount + pendingAppealsCount) > 0 && <span style={{color: '#FF0000'}}>({pendingReportsCount + pendingAppealsCount})</span>}
                    </button>
                    <button className={`admin-nav-button ${selectedAdminSubScreen === 'CenterStage' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('CenterStage')}>
                        CenterStage (Live)
                    </button>
                    <button className={`admin-nav-button ${selectedAdminSubScreen === 'ContentManagement' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('ContentManagement')}>Curation</button>
                    <button className={`admin-nav-button ${selectedAdminSubScreen === 'Competitions' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('Competitions')}>Competitions</button>
                    <button className={`admin-nav-button ${selectedAdminSubScreen === 'EventManager' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('EventManager')}>Events</button>
                    
                    {(creatorProfile.role === 'admin' || creatorProfile.role === 'super_admin') && (
                        <>
                            <button className={`admin-nav-button ${selectedAdminSubScreen === 'Payouts' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('Payouts')}>
                                Payouts {pendingPayouts.length > 0 && <span style={{color: '#00FF00'}}>({pendingPayouts.length})</span>}
                            </button>
                            <button className={`admin-nav-button ${selectedAdminSubScreen === 'PayoutHistory' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('PayoutHistory')}>
                                Payout History
                            </button>
                            <button className={`admin-nav-button ${selectedAdminSubScreen === 'CategoryManager' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('CategoryManager')}>Categories</button>
                            <button className={`admin-nav-button ${selectedAdminSubScreen === 'BoxOffice' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('BoxOffice')}>Box Office</button>
                            <button className={`admin-nav-button ${selectedAdminSubScreen === 'BidWars' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('BidWars')}>
                                Bid Wars {pendingAuctions.length > 0 && <span style={{color: '#FFD700'}}>({pendingAuctions.length})</span>}
                            </button>
                            {creatorProfile.role === 'super_admin' && (
                                <button className={`admin-nav-button ${selectedAdminSubScreen === 'Financials' ? 'active' : ''}`} style={{ borderColor: '#00FF00', color: '#00FF00' }} onClick={() => setSelectedAdminSubScreen('Financials')}>Finance Command</button>
                            )}
                        </>
                    )}
                    <button className={`admin-nav-button ${selectedAdminSubScreen === 'SiteManagement' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('SiteManagement')}>
                        Settings {newSubmissionsCount > 0 && <span style={{color: '#DC3545'}}>({newSubmissionsCount})</span>}
                    </button>
                    <button className={`admin-nav-button ${selectedAdminSubScreen === 'Economy' ? 'active' : ''}`} onClick={() => setSelectedAdminSubScreen('Economy')}>
                        Token Economy
                    </button>
                    <button className="admin-nav-button" onClick={() => setActiveScreen('AnalyticsDashboard')}>Analytics</button>
                </div>

                {/* --- SUB-SCREENS --- */}
                {selectedAdminSubScreen === 'Enrollments' && <AdminEnrollmentManager showMessage={showMessage} setActiveScreen={setActiveScreen} setSelectedUserId={setSelectedUserId} />}
                {selectedAdminSubScreen === 'ModerationCenter' && <AdminModerationCenter {...{showMessage, setActiveScreen, setSelectedReportGroup, setShowConfirmationModal, setConfirmationTitle, setConfirmationMessage, setOnConfirmationAction}} />}
                {selectedAdminSubScreen === 'ContentManagement' && <AdminContentManagerScreen {...{showMessage, setActiveScreen, featuredContentSlots, setShowConfirmationModal, setConfirmationTitle, setConfirmationMessage, setOnConfirmationAction}} />}
                {selectedAdminSubScreen === 'Competitions' && <AdminCompetitionManager {...{showMessage, setShowConfirmationModal, setConfirmationTitle, setConfirmationMessage, setOnConfirmationAction}} />}
                {selectedAdminSubScreen === 'EventManager' && <AdminEventManagerScreen {...{showMessage, setActiveScreen, setShowConfirmationModal, setConfirmationTitle, setConfirmationMessage, setOnConfirmationAction}} />} 
                {selectedAdminSubScreen === 'CategoryManager' && <AdminCategoryManagerScreen showMessage={showMessage} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} />}
                {selectedAdminSubScreen === 'BoxOffice' && <AdminBoxOfficeScreen showMessage={showMessage} />}
                
                {/* ====== BID WARS GATEKEEPER ====== */}
                {selectedAdminSubScreen === 'BidWars' && (
                    <section className="dashboardSection" style={{ border: '2px solid #FF8C00', background: 'rgba(255, 140, 0, 0.05)' }}>
                        <p className="dashboardSectionTitle" style={{ color: '#FF8C00', margin: 0 }}>🔨 Bid Wars: Approval Queue</p>
                        <p style={{ color: '#AAA', fontSize: '12px', margin: '8px 0 16px 0' }}>Verify the 10-second proof videos. Ensure the item powers on and matches the description.</p>
                        
                        {pendingAuctions.length > 0 ? (
                            <div className="dashboardContentList">
                                {pendingAuctions.map(auction => (
                                    <div key={auction.id} className="adminDashboardItem" style={{ display: 'flex', flexDirection: 'column', background: '#111', padding: '15px', border: '1px solid #333', borderRadius: '8px', marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
                                            <div>
                                                <p style={{ margin: 0, fontWeight: 'bold', fontSize: '16px', color: '#FFF' }}>{auction.title}</p>
                                                <p style={{ margin: '2px 0 0 0', fontSize: '12px', color: '#AAA' }}>Category: {auction.category} | Seller: <span style={{ color: '#FFD700' }}>{auction.sellerName}</span></p>
                                                <p style={{ margin: '6px 0 0 0', fontSize: '13px', color: '#DDD', maxWidth: '80%' }}>"{auction.description}"</p>
                                                <p style={{ margin: '6px 0 0 0', fontSize: '14px', color: '#4ADE80', fontWeight: 'bold' }}>Starting Bid: {auction.startingBid} GYD</p>
                                            </div>
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <button className="adminActionButton reject" onClick={() => handleRejectAuction(auction)}>Reject</button>
                                                <button className="adminActionButton approve" style={{ background: '#FF8C00', color: '#000', borderColor: '#FF8C00' }} onClick={() => handleApproveAuction(auction)}>Approve & Notify</button>
                                            </div>
                                        </div>
                                        
                                        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', background: '#000', padding: '10px', borderRadius: '6px', border: '1px solid #222' }}>
                                            {auction.imageUrls && auction.imageUrls.map((url, imgIdx) => (
                                                <div key={imgIdx} style={{ width: '120px', height: '120px', flexShrink: 0, borderRadius: '4px', overflow: 'hidden', border: '1px solid #333' }}>
                                                    <img src={url} alt={`Listing Pic ${imgIdx}`} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p style={{ color: '#888', fontSize: '13px', textAlign: 'center', padding: '20px 0' }}>No pending auctions in the queue.</p>
                        )}
                    </section>
                )}

                {/* ====== THE NVA FINANCIAL COMMAND CENTER ====== */}
                {selectedAdminSubScreen === 'Financials' && (
                    <section className="dashboardSection printable-content" style={{ border: '2px solid #00FF00', background: 'rgba(0, 255, 0, 0.02)' }}>
                        
                        {/* HEADER TITLE BAR */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                            <div>
                                <p className="dashboardSectionTitle" style={{ color: '#00FF00', margin: 0 }}>System P&L Hub & Ledger</p>
                                <p style={{ color: '#AAA', fontSize: '12px', margin: '4px 0 0 0' }}>Comprehensive internal reporting. Track inflow, outflow, manually logged expenses, and the NVA Vault.</p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button className="adminActionButton approve" onClick={() => window.print()} style={{ margin: 0, background: 'transparent', border: '1px solid #00FFFF', color: '#00FFFF' }}>📄 Export PDF</button>
                                <button 
                                    className="adminActionButton approve" 
                                    disabled={isGeneratingSystemReport}
                                    onClick={handleGenerateClientReport}
                                    style={{ margin: 0, minWidth: '160px' }}
                                >
                                    {isGeneratingSystemReport ? 'Calculating...' : '🔍 Generate Report'}
                                </button>
                            </div>
                        </div>

                        {/* DATE RANGE & TIME GROUP SELECTORS */}
                        <div style={{ display: 'flex', gap: '15px', background: '#0A0A0A', padding: '15px', borderRadius: '12px', border: '1px solid #222', marginBottom: '25px', flexWrap: 'wrap' }}>
                            <div style={{ flex: '1 1 180px' }}>
                                <label style={{ color: '#888', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Start Date</label>
                                <input type="date" className="cs-input" value={financeStartDate} onChange={(e) => setFinanceStartDate(e.target.value)} style={{ margin: 0 }} />
                            </div>
                            <div style={{ flex: '1 1 180px' }}>
                                <label style={{ color: '#888', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>End Date</label>
                                <input type="date" className="cs-input" value={financeEndDate} onChange={(e) => setFinanceEndDate(e.target.value)} style={{ margin: 0 }} />
                            </div>
                            <div style={{ flex: '1 1 180px' }}>
                                <label style={{ color: '#888', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', display: 'block', marginBottom: '5px' }}>Timeframe Grouping</label>
                                <select className="cs-input" value={financeTimeframe} onChange={(e) => setFinanceTimeframe(e.target.value)} style={{ margin: 0 }}>
                                    <option value="daily">Daily Grouping</option>
                                    <option value="weekly">Weekly Grouping</option>
                                    <option value="monthly">Monthly Grouping</option>
                                    <option value="yearly">Yearly Grouping</option>
                                </select>
                            </div>
                        </div>

                        {/* METRICS VIEW */}
                        {!systemReportData ? (
                            <div style={{ textAlign: 'center', padding: '60px 0', color: '#555' }}>
                                <p style={{ fontSize: '40px', margin: '0 0 10px 0' }}>📊</p>
                                <p>Select date range/grouping and click "Generate Report" to run calculations.</p>
                            </div>
                        ) : (
                            <>
                                {/* MASTER ACCOUNT BALANCE SHEET */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '15px', marginBottom: '25px' }}>
                                    <div style={{ background: '#0A0A0A', padding: '15px', borderRadius: '12px', border: '1px solid #222', textAlign: 'center' }}>
                                        <p style={{ color: '#AAA', fontSize: '10px', fontWeight: '900', margin: '0 0 6px 0', textTransform: 'uppercase' }}>TOTAL CASH VOLUME</p>
                                        <p style={{ color: '#FFF', fontSize: '22px', fontWeight: '900', margin: 0 }}>{systemReportData.grandTotalGross.toLocaleString()} <span style={{fontSize: '11px', color: '#888'}}>GYD</span></p>
                                    </div>
                                    <div style={{ background: 'rgba(74, 222, 128, 0.03)', padding: '15px', borderRadius: '12px', border: '1px solid #4ADE80', textAlign: 'center' }}>
                                        <p style={{ color: '#4ADE80', fontSize: '10px', fontWeight: '900', margin: '0 0 6px 0', textTransform: 'uppercase' }}>PLATFORM REVENUE (15% Cut)</p>
                                        <p style={{ color: '#4ADE80', fontSize: '22px', fontWeight: '900', margin: 0 }}>+{systemReportData.grandTotalRevenue.toLocaleString()} <span style={{fontSize: '11px'}}>GYD</span></p>
                                    </div>
                                    <div style={{ background: 'rgba(239, 68, 68, 0.03)', padding: '15px', borderRadius: '12px', border: '1px solid #EF4444', textAlign: 'center' }}>
                                        <p style={{ color: '#EF4444', fontSize: '10px', fontWeight: '900', margin: '0 0 6px 0', textTransform: 'uppercase' }}>STAFF PAYOUTS LIABILITY</p>
                                        <p style={{ color: '#EF4444', fontSize: '22px', fontWeight: '900', margin: 0 }}>-{systemReportData.grandTotalLiabilities.toLocaleString()} <span style={{fontSize: '11px'}}>GYD</span></p>
                                    </div>
                                    <div style={{ background: 'rgba(249, 115, 22, 0.03)', padding: '15px', borderRadius: '12px', border: '1px solid #F97316', textAlign: 'center' }}>
                                        <p style={{ color: '#F97316', fontSize: '10px', fontWeight: '900', margin: '0 0 6px 0', textTransform: 'uppercase' }}>OVERHEAD EXPENSES</p>
                                        <p style={{ color: '#F97316', fontSize: '22px', fontWeight: '900', margin: 0 }}>-{systemReportData.grandTotalExpenses.toLocaleString()} <span style={{fontSize: '11px'}}>GYD</span></p>
                                    </div>
                                    <div style={{ background: 'rgba(255, 215, 0, 0.06)', padding: '15px', borderRadius: '12px', border: '2px solid #FFD700', textAlign: 'center' }}>
                                        <p style={{ color: '#FFD700', fontSize: '11px', fontWeight: '900', margin: '0 0 6px 0', textTransform: 'uppercase', letterSpacing: '1px' }}>🛡️ NVA VAULT (Net Balance)</p>
                                        <p style={{ color: '#FFD700', fontSize: '24px', fontWeight: '900', margin: 0 }}>{systemReportData.grandTotalVault.toLocaleString()} <span style={{fontSize: '12px'}}>GYD</span></p>
                                    </div>
                                </div>

                                {/* THE 7 REVENUE PILLARS DETAILED BREAKDOWN */}
                                <p style={{ color: '#FFF', fontWeight: '900', fontSize: '14px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>💎 Operational Segment P&L Sheet</p>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '30px' }}>
                                    {Object.entries(systemReportData.sections).map(([sourceKey, data]) => {
                                        const netInflow = data.revenue - data.staffCuts;
                                        return (
                                            <div key={sourceKey} style={{ background: '#0F0F0F', border: '1px solid #222', padding: '15px', borderRadius: '8px' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #222', paddingBottom: '8px', marginBottom: '10px' }}>
                                                    <span style={{ color: '#FFD700', fontWeight: 'bold', textTransform: 'capitalize' }}>
                                                        {sourceKey.replace('_', ' ')}
                                                    </span>
                                                    <span style={{ color: '#888', fontSize: '11px' }}>{data.count} purchases</span>
                                                </div>
                                                <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ color: '#666' }}>Gross volume:</span>
                                                        <span style={{ color: '#EEE' }}>{data.gross.toLocaleString()} GYD</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ color: '#666' }}>15% platform cut:</span>
                                                        <span style={{ color: '#4ADE80' }}>+{data.revenue.toLocaleString()} GYD</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                                        <span style={{ color: '#666' }}>Staff commission slice:</span>
                                                        <span style={{ color: '#EF4444' }}>-{data.staffCuts.toLocaleString()} GYD</span>
                                                    </div>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #222', paddingTop: '5px', marginTop: '3px', fontWeight: 'bold' }}>
                                                        <span style={{ color: '#FFF' }}>Inflow to Vault:</span>
                                                        <span style={{ color: '#FFD700' }}>{netInflow.toLocaleString()} GYD</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* TIMEFRAME BASED TRANSACTIONS LOG */}
                                <p style={{ color: '#FFF', fontWeight: '900', fontSize: '14px', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>📅 Grouped Cash-Flow Ledger</p>
                                <div style={{ background: '#0A0A0A', border: '1px solid #222', borderRadius: '12px', overflow: 'hidden', marginBottom: '30px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                                        <thead>
                                            <tr style={{ background: '#161616', color: '#888' }}>
                                                <th style={{ padding: '12px 15px', borderBottom: '1px solid #222' }}>TIMEFRAME SECTION</th>
                                                <th style={{ padding: '12px 15px', borderBottom: '1px solid #222' }}>TRANSACTIONS</th>
                                                <th style={{ padding: '12px 15px', borderBottom: '1px solid #222', textAlign: 'right' }}>GROSS INFLOW</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(getGroupedLedgerData()).sort((a, b) => b[0].localeCompare(a[0])).map(([period, metrics]) => (
                                                <tr key={period} style={{ borderBottom: '1px solid #111' }}>
                                                    <td style={{ padding: '10px 15px', color: '#FFD700', fontWeight: 'bold' }}>{period}</td>
                                                    <td style={{ padding: '10px 15px', color: '#AAA' }}>{metrics.count} txns</td>
                                                    <td style={{ padding: '10px 15px', textAlign: 'right', color: '#FFF', fontWeight: 'bold' }}>{metrics.gross.toLocaleString()} GYD</td>
                                                </tr>
                                            ))}
                                            {Object.keys(getGroupedLedgerData()).length === 0 && (
                                                <tr>
                                                    <td colSpan="3" style={{ padding: '20px', textAlign: 'center', color: '#666' }}>No matching transaction logs discovered.</td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}

                        {/* --- THE STAFF COMMISSION MATRIX GRID --- */}
                        <div style={{ border: '1px solid #FFD700', background: 'rgba(255, 215, 0, 0.01)', padding: '20px', borderRadius: '12px', marginBottom: '30px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
                                <div>
                                    <p style={{ color: '#FFD700', fontSize: '15px', fontWeight: 'bold', margin: 0 }}>📊 Dynamic Commission Matrix</p>
                                    <p style={{ color: '#888', fontSize: '11px', margin: '4px 0 0 0' }}>Assign percentages (0% - 15%) per section. Total column assignment across all staff cannot exceed 15%.</p>
                                </div>
                                <button className="adminActionButton approve" onClick={handleSaveCommissions} style={{ margin: 0, padding: '8px 20px', fontSize: '12px' }}>
                                    💾 Save Matrix Setup
                                </button>
                            </div>

                            <div style={{ overflowX: 'auto', background: '#0A0A0A', borderRadius: '8px', border: '1px solid #222' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px', minWidth: '850px' }}>
                                    <thead>
                                        <tr style={{ background: '#161616', color: '#AAA', borderBottom: '1px solid #222' }}>
                                            <th style={{ padding: '12px', width: '150px' }}>STAFF MEMBER</th>
                                            <th style={{ padding: '12px' }}>CENTERSTAGE</th>
                                            <th style={{ padding: '12px' }}>COMPETITIONS</th>
                                            <th style={{ padding: '12px' }}>FILM ARENA</th>
                                            <th style={{ padding: '12px' }}>FILM CLUB</th>
                                            <th style={{ padding: '12px' }}>BOX OFFICE</th>
                                            <th style={{ padding: '12px' }}>ROAST ARENA</th>
                                            <th style={{ padding: '12px' }}>EXPLORE HUB</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allUsers.filter(u => u.role === 'admin' || u.role === 'authority' || u.role === 'moderator' || u.role === 'super_admin').map(staff => (
                                            <tr key={staff.id} style={{ borderBottom: '1px solid #111' }}>
                                                <td style={{ padding: '10px 12px' }}>
                                                    <span style={{ color: '#FFF', fontWeight: 'bold', display: 'block' }}>{staff.creatorName}</span>
                                                    <span style={{ color: '#888', fontSize: '10px', textTransform: 'uppercase' }}>{staff.role}</span>
                                                </td>
                                                {['centerstage', 'competitions', 'film_arena', 'film_club', 'box_office', 'roast_arena', 'explore_hub'].map(col => (
                                                    <td key={col} style={{ padding: '10px 6px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center' }}>
                                                            <input 
                                                                type="number" 
                                                                className="cs-input" 
                                                                style={{ width: '60px', margin: 0, padding: '4px', textAlign: 'center', borderColor: '#333' }}
                                                                value={draftCommissions[staff.id]?.[col] || 0}
                                                                onChange={(e) => handleMatrixValueChange(staff.id, staff.creatorName, staff.role, col, e.target.value)}
                                                                min="0"
                                                                max="15"
                                                            />
                                                            <span style={{ color: '#666', marginLeft: '3px' }}>%</span>
                                                        </div>
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                        {/* TOTAL COMMISSION VALIDATION HEADER TRACKER */}
                                        <tr style={{ background: '#161616', fontWeight: 'bold' }}>
                                            <td style={{ padding: '12px', color: '#FFF' }}>Sum Assigned (%):</td>
                                            {['centerstage', 'competitions', 'film_arena', 'film_club', 'box_office', 'roast_arena', 'explore_hub'].map(col => {
                                                const total = getColumnTotal(col);
                                                const isInvalid = total > 15;
                                                return (
                                                    <td key={col} style={{ padding: '12px 6px', color: isInvalid ? '#EF4444' : '#4ADE80' }}>
                                                        {total}% {isInvalid ? '⚠️ (>15)' : '✓'}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* --- EXPENSE TRACKER & LOGGER FORM --- */}
                        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                            {/* manual logging tool */}
                            <form onSubmit={handleAddExpense} style={{ flex: '1 1 300px', background: '#0A0A0A', padding: '20px', borderRadius: '12px', border: '1px solid #222' }}>
                                <p style={{ color: '#FFF', fontWeight: 'bold', fontSize: '14px', margin: '0 0 15px 0', textTransform: 'uppercase' }}>✍️ Manual Expense Logger</p>
                                
                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ fontSize: '10px', color: '#888', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>EXPENSE CATEGORY</label>
                                    <select className="cs-input" value={expenseCategoryInput} onChange={(e) => setExpenseCategoryInput(e.target.value)} style={{ margin: 0 }}>
                                        <option value="Electricity">Electricity Utility</option>
                                        <option value="Internet">Internet/Telecom</option>
                                        <option value="Server">Firebase/Server Costs</option>
                                        <option value="Rent">Office Rent</option>
                                        <option value="Marketing">Advertising/Marketing</option>
                                        <option value="Hardware">Equipment/Hardware</option>
                                        <option value="Miscellaneous">Miscellaneous Overhead</option>
                                    </select>
                                </div>

                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ fontSize: '10px', color: '#888', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>AMOUNT (GYD)</label>
                                    <input 
                                        type="number" 
                                        className="cs-input" 
                                        placeholder="e.g. 15000" 
                                        value={expenseAmountInput} 
                                        onChange={(e) => setExpenseAmountInput(e.target.value)} 
                                        style={{ margin: 0 }} 
                                    />
                                </div>

                                <div style={{ marginBottom: '15px' }}>
                                    <label style={{ fontSize: '10px', color: '#888', display: 'block', marginBottom: '4px', fontWeight: 'bold' }}>DESCRIPTION (Optional)</label>
                                    <input 
                                        type="text" 
                                        className="cs-input" 
                                        placeholder="e.g. June Internet Bill" 
                                        value={expenseDescInput} 
                                        onChange={(e) => setExpenseDescInput(e.target.value)} 
                                        style={{ margin: 0 }} 
                                    />
                                </div>

                                <button type="submit" className="adminActionButton approve" style={{ margin: 0, width: '100%', padding: '10px' }}>
                                    ➕ Save Expense entry
                                </button>
                            </form>

                            {/* logged expenses history list */}
                            <div style={{ flex: '2 1 450px', background: '#0A0A0A', padding: '20px', borderRadius: '12px', border: '1px solid #222' }}>
                                <p style={{ color: '#FFF', fontWeight: 'bold', fontSize: '14px', margin: '0 0 15px 0', textTransform: 'uppercase' }}>🧾 Active Expenses for designated range</p>
                                <div style={{ maxHeight: '230px', overflowY: 'auto', paddingRight: '5px' }}>
                                    {expensesList.map(exp => (
                                        <div key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '10px 15px', borderRadius: '8px', border: '1px solid #222', marginBottom: '8px' }}>
                                            <div>
                                                <span style={{ color: '#FF9900', fontWeight: 'bold', display: 'block', fontSize: '13px' }}>{exp.category}</span>
                                                <span style={{ color: '#666', fontSize: '11px', display: 'block' }}>{exp.description}</span>
                                                <span style={{ color: '#444', fontSize: '10px' }}>{new Date(exp.createdAt).toLocaleDateString()}</span>
                                            </div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                                <span style={{ color: '#EF4444', fontWeight: 'bold', fontSize: '14px' }}>-{exp.amount.toLocaleString()} GYD</span>
                                                <button 
                                                    onClick={async () => {
                                                        if (window.confirm("Permanently delete this expense?")) {
                                                            showMessage("Deleting expense...");
                                                            try {
                                                                await deleteDoc(doc(db, "expenses", exp.id));
                                                                showMessage("Expense entry deleted.");
                                                                handleGenerateClientReport();
                                                            } catch (err) { showMessage("Failed to delete."); }
                                                        }
                                                    }}
                                                    style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', fontSize: '13px' }}
                                                >
                                                    ❌
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {expensesList.length === 0 && (
                                        <p style={{ color: '#555', textAlign: 'center', padding: '40px 0', fontSize: '13px' }}>No expenses logged for this range.</p>
                                    )}
                                </div>
                            </div>
                        </div>

                    </section>
                )}

                {/* THE FIX: Logic to render the Payout Request Queue */}
                {selectedAdminSubScreen === 'Payouts' && (
                    <AdminPayoutRequestScreen 
                        requests={pendingPayouts} 
                        {...{showMessage, setShowConfirmationModal, setConfirmationTitle, setConfirmationMessage, setOnConfirmationAction, currencyRates, selectedCurrency}} 
                    />
                )}

                {/* THE FIX: Logic to render the Searchable Payout Audit History */}
                {selectedAdminSubScreen === 'PayoutHistory' && (
                    <AdminPayoutHistoryScreen showMessage={showMessage} />
                )}
                {selectedAdminSubScreen === 'SiteManagement' && (
                    <>
                        {/* THE FIX: Master Feature Toggles Panel */}
                        <section className="dashboardSection" style={{ border: '2px solid #333', background: '#0A0A0A', marginBottom: '20px' }}>
                            <p className="dashboardSectionTitle" style={{ margin: 0, color: '#FFF' }}>Homepage Feature Toggles</p>
                            <p style={{ color: '#AAA', fontSize: '12px', margin: '8px 0 16px 0' }}>Instantly show or hide core modules from the user home screen.</p>
                            
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '15px', borderRadius: '8px', border: '1px solid #222' }}>
                                <div>
                                    <p style={{ margin: 0, color: '#FFF', fontWeight: 'bold', fontSize: '15px' }}>🎵 NVA Billboard Charts</p>
                                    <p style={{ margin: '4px 0 0', color: '#888', fontSize: '12px' }}>Shows the Top 50 trending music tracks button on the Home Screen.</p>
                                </div>
                                <button 
                                    className={`adminActionButton ${homeScreenLayout?.showMusicCharts !== false ? 'reject' : 'approve'}`}
                                    style={{ margin: 0, minWidth: '130px' }}
                                    onClick={async () => {
                                        const isCurrentlyVisible = homeScreenLayout?.showMusicCharts !== false;
                                        showMessage(`${isCurrentlyVisible ? 'Disabling' : 'Enabling'} Music Charts...`);
                                        try {
                                            await setDoc(doc(db, "settings", "homeScreenLayout"), { showMusicCharts: !isCurrentlyVisible }, { merge: true });
                                            showMessage("Homepage layout updated!");
                                        } catch (error) {
                                            showMessage("Error updating layout.");
                                        }
                                    }}
                                >
                                    {homeScreenLayout?.showMusicCharts !== false ? 'Disable Charts' : 'Enable Charts'}
                                </button>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '15px', borderRadius: '8px', border: '1px solid #222', marginTop: '10px' }}>
                                <div>
                                    <p style={{ margin: '0', color: '#FF1493', fontWeight: 'bold', fontSize: '15px' }}>🏟️ Live Arena Ecosystem</p>
                                    <p style={{ margin: '4px 0 0', color: '#888', fontSize: '12px' }}>Hides the Live Arena globally while under construction. <strong style={{color: '#FFD700'}}>Super Admins bypass this to test freely.</strong></p>
                                </div>
                                <button 
                                    className={`adminActionButton ${homeScreenLayout?.showRoastArena !== false ? 'reject' : 'approve'}`}
                                    style={{ margin: 0, minWidth: '130px' }}
                                    onClick={async () => {
                                        const isCurrentlyVisible = homeScreenLayout?.showRoastArena !== false;
                                        showMessage(`${isCurrentlyVisible ? 'Disabling' : 'Enabling'} Live Arena Ecosystem...`);
                                        try {
                                            await Promise.all([
                                                setDoc(doc(db, "settings", "homeScreenLayout"), { showRoastArena: !isCurrentlyVisible }, { merge: true }),
                                                setDoc(doc(db, "settings", "enrollmentConfig"), { isLiveArenaEnabled: !isCurrentlyVisible }, { merge: true })
                                            ]);
                                            showMessage("Live Arena toggled globally!");
                                        } catch (error) { showMessage("Error updating layout."); }
                                    }}
                                >
                                    {homeScreenLayout?.showRoastArena !== false ? 'Disable Arena' : 'Enable Arena'}
                                </button>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '15px', borderRadius: '8px', border: '1px solid #222', marginTop: '10px' }}>
                                <div>
                                    <p style={{ margin: '0', color: '#FF8C00', fontWeight: 'bold', fontSize: '15px' }}>🔨 Bid Wars System</p>
                                    <p style={{ margin: '4px 0 0', color: '#888', fontSize: '12px' }}>Hides the Bid Wars panel globally while under construction. <strong style={{color: '#FFD700'}}>Super Admins bypass this to test freely.</strong></p>
                                </div>
                                <button 
                                    className={`adminActionButton ${homeScreenLayout?.showBidWars !== false ? 'reject' : 'approve'}`}
                                    style={{ margin: 0, minWidth: '130px' }}
                                    onClick={async () => {
                                        const isCurrentlyVisible = homeScreenLayout?.showBidWars !== false;
                                        showMessage(`${isCurrentlyVisible ? 'Disabling' : 'Enabling'} Bid Wars System...`);
                                        try {
                                            await Promise.all([
                                                setDoc(doc(db, "settings", "homeScreenLayout"), { showBidWars: !isCurrentlyVisible }, { merge: true }),
                                                setDoc(doc(db, "settings", "enrollmentConfig"), { isBidWarsEnabled: !isCurrentlyVisible }, { merge: true })
                                            ]);
                                            showMessage("Bid Wars toggled globally!");
                                        } catch (error) { showMessage("Error updating layout."); }
                                    }}
                                >
                                    {homeScreenLayout?.showBidWars !== false ? 'Disable Bid Wars' : 'Enable Bid Wars'}
                                </button>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '15px', borderRadius: '8px', border: '1px solid #222', marginTop: '10px' }}>
                                <div>
                                    <p style={{ margin: '0', color: '#4ADE80', fontWeight: 'bold', fontSize: '15px' }}>🎟️ Global Box Office</p>
                                    <p style={{ margin: '4px 0 0', color: '#888', fontSize: '12px' }}>Enable/Disable the entire Box Office & Ledger section on user dashboards.</p>
                                </div>
                                <button 
                                    className={`adminActionButton ${homeScreenLayout?.showBoxOffice !== false ? 'reject' : 'approve'}`}
                                    style={{ margin: 0, minWidth: '130px' }}
                                    onClick={async () => {
                                        const isCurrentlyVisible = homeScreenLayout?.showBoxOffice !== false;
                                        showMessage(`${isCurrentlyVisible ? 'Disabling' : 'Enabling'} Box Office...`);
                                        try {
                                            await Promise.all([
                                                setDoc(doc(db, "settings", "homeScreenLayout"), { showBoxOffice: !isCurrentlyVisible }, { merge: true }),
                                                setDoc(doc(db, "settings", "enrollmentConfig"), { showBoxOffice: !isCurrentlyVisible }, { merge: true })
                                            ]);
                                            showMessage("Box Office toggled globally!");
                                        } catch (error) { showMessage("Error updating layout."); }
                                    }}
                                >
                                    {homeScreenLayout?.showBoxOffice !== false ? 'Disable Box Office' : 'Enable Box Office'}
                                </button>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '15px', borderRadius: '8px', border: '1px solid #222', marginTop: '10px' }}>
                                <div>
                                    <p style={{ margin: '0', color: '#FFD700', fontWeight: 'bold', fontSize: '15px' }}>🍿 Host Watch Party Button</p>
                                    <p style={{ margin: '4px 0 0', color: '#888', fontSize: '12px' }}>Enable/Disable the "Host Watch Party" button in the Film Arena for all users.</p>
                                </div>
                                <button 
                                    className={`adminActionButton ${homeScreenLayout?.showHostWatchParty !== false ? 'reject' : 'approve'}`}
                                    style={{ margin: 0, minWidth: '130px' }}
                                    onClick={async () => {
                                        const isCurrentlyVisible = homeScreenLayout?.showHostWatchParty !== false;
                                        showMessage(`${isCurrentlyVisible ? 'Disabling' : 'Enabling'} Host Watch Party...`);
                                        try {
                                            await setDoc(doc(db, "settings", "homeScreenLayout"), { showHostWatchParty: !isCurrentlyVisible }, { merge: true });
                                            showMessage("Watch Party button toggled!");
                                        } catch (error) { showMessage("Error updating layout."); }
                                    }}
                                >
                                    {homeScreenLayout?.showHostWatchParty !== false ? 'Disable Button' : 'Enable Button'}
                                </button>
                            </div>
                        </section>

                        <AdminSiteManagerScreen 
                            {...{showMessage, setActiveScreen, setShowConfirmationModal, setConfirmationTitle, setConfirmationMessage, setOnConfirmationAction, creatorProfile, setSelectedUserId}} 
                            allUsers={allUsers}
                        onReconcileUsers={() => {
                            setConfirmationTitle("Reconcile Auth & Firestore Users?");
                            setConfirmationMessage("This will scan for and delete any user profiles in the database that no longer have a matching Authentication account. Proceed?");
                            setOnConfirmationAction(() => async () => {
                                showMessage("Starting reconciliation...");
                                try {
                                    const reconcileFunction = httpsCallable(functions, 'reconcileAuthAndFirestoreUsers');
                                    const result = await reconcileFunction();
                                    showMessage(result.data.message);
                                } catch (error) { showMessage(`Error: ${error.message}`); }
                            });
                            setShowConfirmationModal(true);
                        }}
                    />
                    </>
                )}

                {/* --- TOKEN ECONOMY MANAGER --- */}
                {selectedAdminSubScreen === 'Economy' && (
                    <section className="dashboardSection" style={{ border: '2px solid #FFD700', background: 'rgba(255, 215, 0, 0.03)', marginBottom: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                            <div>
                                <p className="dashboardSectionTitle" style={{ color: '#FFD700', margin: 0 }}>Global Token Economics</p>
                                <p style={{ color: '#AAA', fontSize: '12px', margin: '4px 0 0 0' }}>Adjust prices and rewards for virtual goods. Changes automatically sync across all apps.</p>
                            </div>
                            <button className="adminActionButton approve" style={{ margin: 0, padding: '10px 24px', fontSize: '13px' }} onClick={async () => {
                                showMessage("Saving token economics...");
                                try {
                                    await setDoc(doc(db, "settings", "tokenEconomics"), { roastTokens: draftRoastTokens, giftTokens: draftGiftTokens }, { merge: true });
                                    showMessage("Economics Updated Successfully!");
                                } catch(e) { showMessage("Failed to save."); }
                            }}>💾 Save Platform Economy</button>
                        </div>

                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px' }}>
                            {/* Roast Tokens Editor */}
                            <div style={{ flex: 1, minWidth: '300px', background: '#0A0A0A', padding: '20px', borderRadius: '12px', border: '1px solid #222' }}>
                                <p style={{ color: '#FF4500', fontWeight: 'bold', fontSize: '16px', margin: '0 0 15px 0' }}>🔥 Roast Room Packages</p>
                                {draftRoastTokens.map((pack, index) => (
                                    <div key={pack.id} style={{ background: '#111', padding: '15px', borderRadius: '8px', marginBottom: '10px', border: '1px solid #333' }}>
                                        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                                            <span style={{ fontSize: '24px' }}>{pack.icon}</span>
                                            <input type="text" className="cs-input" value={pack.label} onChange={(e) => {
                                                const newArr = [...draftRoastTokens];
                                                newArr[index].label = e.target.value;
                                                setDraftRoastTokens(newArr);
                                            }} style={{ margin: 0, fontWeight: 'bold' }} />
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase' }}>Tokens Provided</label>
                                                <input type="number" className="cs-input" value={pack.tokens} onChange={(e) => {
                                                    const newArr = [...draftRoastTokens];
                                                    newArr[index].tokens = Number(e.target.value);
                                                    newArr[index].subtext = `Get ${e.target.value} Tokens`;
                                                    setDraftRoastTokens(newArr);
                                                }} style={{ margin: 0 }} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase' }}>Cost (GYD)</label>
                                                <input type="number" className="cs-input" value={pack.price} onChange={(e) => {
                                                    const newArr = [...draftRoastTokens];
                                                    newArr[index].price = Number(e.target.value);
                                                    setDraftRoastTokens(newArr);
                                                }} style={{ margin: 0, color: '#FFD700', fontWeight: 'bold' }} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Gift Tokens Editor */}
                            <div style={{ flex: 1, minWidth: '300px', background: '#0A0A0A', padding: '20px', borderRadius: '12px', border: '1px solid #222' }}>
                                <p style={{ color: '#00FFFF', fontWeight: 'bold', fontSize: '16px', margin: '0 0 15px 0' }}>🎁 Creator Gift Tokens</p>
                                {draftGiftTokens.map((gift, index) => {
                                    const platformFee = gift.price * 0.15;
                                    const actorShare = gift.price * 0.85;
                                    return (
                                        <div key={gift.id} style={{ background: '#111', padding: '15px', borderRadius: '8px', marginBottom: '10px', border: '1px solid #333' }}>
                                            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
                                                <span style={{ fontSize: '24px' }}>{gift.icon}</span>
                                                <input type="text" className="cs-input" value={gift.name} onChange={(e) => {
                                                    const newArr = [...draftGiftTokens];
                                                    newArr[index].name = e.target.value;
                                                    setDraftGiftTokens(newArr);
                                                }} style={{ margin: 0, fontWeight: 'bold' }} />
                                            </div>
                                            <div style={{ marginBottom: '10px' }}>
                                                <label style={{ fontSize: '10px', color: '#888', textTransform: 'uppercase' }}>Price (GYD)</label>
                                                <input type="number" className="cs-input" value={gift.price} onChange={(e) => {
                                                    const newArr = [...draftGiftTokens];
                                                    newArr[index].price = Number(e.target.value);
                                                    setDraftGiftTokens(newArr);
                                                }} style={{ margin: 0, color: '#FFD700', fontWeight: 'bold' }} />
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', background: '#050505', padding: '8px 12px', borderRadius: '6px', border: '1px solid #222' }}>
                                                <span style={{ color: '#4ADE80', fontWeight: 'bold' }}>Creator Share: {actorShare.toLocaleString()}</span>
                                                <span style={{ color: '#F87171', fontWeight: 'bold' }}>NVA Fee: {platformFee.toLocaleString()}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </section>
                )}

                {/* --- CENTERSTAGE ADMIN MANAGER --- */}
                {selectedAdminSubScreen === 'CenterStage' && (
                    <section className="dashboardSection" style={{ border: '2px solid #4F46E5', background: 'rgba(79, 70, 229, 0.05)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                            <p className="dashboardSectionTitle" style={{ color: '#4F46E5', margin: 0 }}>Director's Cut: CenterStage Manager</p>
                            <button className="adminActionButton reject" onClick={handleNukeSeason} style={{ margin: 0, background: '#DC3545', color: '#FFF' }}>⚠️ Nuke Season Slate</button>
                        </div>
                        
                                                <p style={{ color: '#AAA', fontSize: '13px', marginBottom: '20px' }}>
                            Manage active Docu-Series contestants. Eliminating a contestant immediately grayscales them in the public arena.
                        </p>

                        {/* ====== STAGE CONFIGURATION ====== */}
                        <div style={{ background: '#1A1A1A', border: '1px solid #333', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
                            <p style={{ color: '#FFD700', fontSize: '14px', fontWeight: 700, margin: '0 0 16px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🎬 Competition Stage Control</p>
                            <p style={{ color: '#888', fontSize: '12px', margin: '0 0 12px 0' }}>
                                Define stage names and set the active stage. Contestants see this timeline in the arena.
                            </p>
                            
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ color: '#AAA', fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>Stage Names (comma-separated)</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <input 
                                        id="stageNamesInput"
                                        className="cs-input" 
                                        placeholder="Round 1, Semifinals, Finals"
                                        key={competitionState?.stages?.join(',') || 'stages-input'}
                                        defaultValue={competitionState?.stages?.join(', ') || 'Round 1, Semifinals, Finals'}
                                    />
                                    <button className="adminActionButton approve" onClick={async () => {
                                        const val = document.getElementById('stageNamesInput').value;
                                        const names = val.split(',').map(s => s.trim()).filter(Boolean);
                                        if (names.length === 0) return;
                                        showMessage("Updating stages...");
                                        try {
                                            await setDoc(doc(db, "settings", "competitionDisplayState"), { 
                                                stages: names,
                                                currentStageIndex: Math.min((competitionState?.currentStageIndex || 0), names.length - 1)
                                            }, { merge: true });
                                            showMessage("Stages Saved!");
                                        } catch (err) { showMessage("Failed to update stages."); }
                                    }}>Save</button>
                                </div>
                            </div>

                            {/* ENTRY FEE CONFIG REMOVED */}

                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ color: '#AAA', fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>Current Active Stage</label>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {(competitionState?.stages || ['Round 1', 'Semifinals', 'Finals']).map((stage, idx) => (
                                        <button
                                            key={stage}
                                            onClick={async () => {
                                                const prevStageName = competitionState?.stages?.[competitionState?.currentStageIndex] || 'Round 1';
                                                
                                                setConfirmationTitle(`Switch to ${stage}?`);
                                                setConfirmationMessage(`This will SNAPSHOT all current votes and gifts for "${prevStageName}" into history, and reset the LIVE arena to 0 for the new round. Proceed?`);
                                                setOnConfirmationAction(() => async () => {
                                                    showMessage(`Archiving ${prevStageName} and zeroing live arena...`);
                                                    try {
                                                        const snapshotPromises = centerStageContestants.map(c => {
                                                            const userRef = doc(db, "creators", c.id);
                                                            
                                                            // THE FIX: Prevent destructively overwriting history with 0s if the admin clicks around rapidly.
                                                            const safeVotes = c.voteCount > 0 ? c.voteCount : (c.performances?.[prevStageName]?.votes || 0);
                                                            const safeEarnings = c.giftsReceived > 0 ? c.giftsReceived : (c.performances?.[prevStageName]?.earnings || 0);
                                                            const hasLiveGifts = c.giftInventory && Object.keys(c.giftInventory).length > 0;
                                                            const safeGifts = hasLiveGifts ? c.giftInventory : (c.performances?.[prevStageName]?.gifts || {});

                                                            return updateDoc(userRef, {
                                                                [`performances.${prevStageName}.votes`]: safeVotes,
                                                                [`performances.${prevStageName}.earnings`]: safeEarnings,
                                                                [`performances.${prevStageName}.gifts`]: safeGifts,
                                                                [`performances.${prevStageName}.link`]: c.currentChallengeLink || (c.performances?.[prevStageName]?.link || ""),
                                                                [`performances.${prevStageName}.thumbnail`]: c.currentChallengeThumbnail || (c.performances?.[prevStageName]?.thumbnail || ""),
                                                                
                                                                // Zero out live fields safely
                                                                voteCount: 0,
                                                                giftsReceived: 0,
                                                                giftInventory: {},
                                                                currentChallengeLink: "",
                                                                currentChallengeThumbnail: ""
                                                            });
                                                        });
                                                        await Promise.all(snapshotPromises);
                                                        await setDoc(doc(db, "settings", "competitionDisplayState"), { currentStageIndex: idx }, { merge: true });
                                                        showMessage(`${prevStageName} Archived. ${stage} is now LIVE!`);
                                                    } catch (err) { showMessage("Failed to snapshot round."); }
                                                });
                                                setShowConfirmationModal(true);
                                            }}
                                            style={{ padding: '8px 16px', borderRadius: '8px', border: idx === (competitionState?.currentStageIndex || 0) ? '2px solid #A855F7' : '1px solid #444', background: idx === (competitionState?.currentStageIndex || 0) ? 'rgba(168, 85, 247, 0.2)' : '#111', color: idx === (competitionState?.currentStageIndex || 0) ? '#FFFFFF' : '#888', fontSize: '12px', fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}
                                        >
                                            {idx < (competitionState?.currentStageIndex || 0) ? '✓ ' : idx === (competitionState?.currentStageIndex || 0) ? '● ' : ''}{stage}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ borderTop: '1px solid #333', paddingTop: '16px', marginBottom: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                    <label style={{ color: '#FFD700', fontSize: '12px', fontWeight: 900, textTransform: 'uppercase' }}>🛠️ Stage Assets Editor</label>
                                    <select 
                                        className="cs-input" 
                                        style={{ width: 'auto', margin: 0, borderColor: '#FFD700' }}
                                        value={selectedStageToEdit || competitionState?.stages?.[competitionState?.currentStageIndex] || 'Round 1'}
                                        onChange={(e) => setSelectedStageToEdit(e.target.value)}
                                    >
                                        {(competitionState?.stages || ['Round 1', 'Semifinals', 'Finals']).map(s => <option key={s} value={s}>Editing for: {s}</option>)}
                                    </select>
                                </div>

                                {(() => {
                                    const targetStage = selectedStageToEdit || competitionState?.stages?.[competitionState?.currentStageIndex] || 'Round 1';
                                    const stageMedia = competitionState?.roundMedia?.[targetStage] || {};
                                    const stageSponsor = competitionState?.roundSponsors?.[targetStage] || {};
                                    
                                    const activeLink = groupFilmInput !== '' ? groupFilmInput : (stageMedia.link || '');
                                    const ytMatch = activeLink.match(/[?&]v=([^&]+)/) || activeLink.match(/youtu\.be\/([^?]+)/);
                                    const ytId = ytMatch ? ytMatch[1] : null;
                                    const activeThumb = groupThumbInput || stageMedia.thumbnail || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null);

                                    return (
                                        <div key={`editor_${targetStage}`}>
                                            <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '16px', marginBottom: '16px' }}>
                                                <label style={{ color: '#AAA', fontSize: '12px', fontWeight: 600, display: 'block', marginBottom: '8px' }}>🎬 Group Film URL for {targetStage}</label>
                                                
                                                {activeThumb && (
                                                    <div style={{ width: '100%', maxWidth: '320px', aspectRatio: '16/9', background: '#000', marginBottom: '12px', borderRadius: '4px', border: '1px solid #333', overflow: 'hidden' }}>
                                                        <img src={activeThumb} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt="Group Preview" />
                                                    </div>
                                                )}

                                                <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                                                    <input 
                                                        id="groupFilmUrlInput"
                                                        className="cs-input" 
                                                        placeholder="Paste video URL for the group performance..."
                                                        defaultValue={stageMedia.link || ''}
                                                        onChange={(e) => setGroupFilmInput(e.target.value)}
                                                        style={{ margin: 0 }}
                                                    />
                                                    <button className="adminActionButton approve" style={{ margin: 0, width: 'auto' }} onClick={async () => {
                                                        const val = document.getElementById('groupFilmUrlInput').value;
                                                        if (!val) return;
                                                        showMessage(`Saving ${targetStage} film...`);
                                                        try {
                                                            await setDoc(doc(db, "settings", "competitionDisplayState"), { 
                                                                roundMedia: { [targetStage]: { link: val, thumbnail: stageMedia.thumbnail || "" } }
                                                            }, { merge: true });
                                                            showMessage("Round Film Saved!");
                                                        } catch (err) { showMessage("Failed to save film."); }
                                                    }}>Save Round Film</button>
                                                    
                                                    {stageMedia.link && (
                                                        <button className="adminActionButton reject" style={{ margin: 0, width: 'auto' }} onClick={async () => {
                                                            showMessage("Removing group film...");
                                                            try {
                                                                await setDoc(doc(db, "settings", "competitionDisplayState"), { 
                                                                    roundMedia: { [targetStage]: { link: "", thumbnail: "" } }
                                                                }, { merge: true });
                                                                document.getElementById('groupFilmUrlInput').value = "";
                                                                setGroupFilmInput('');
                                                                setGroupThumbInput('');
                                                                showMessage("Group Film Removed!");
                                                            } catch (err) { showMessage("Failed to remove film."); }
                                                        }}>Delete</button>
                                                    )}
                                                </div>

                                                <label style={{ color: '#AAA', fontSize: '11px', display: 'block', marginBottom: '4px' }}>Custom Group Thumbnail (Optional)</label>
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <input 
                                                        id="groupImageInput"
                                                        type="file" accept="image/*"
                                                        className="cs-input" style={{ padding: '4px', flex: 1, margin: 0 }}
                                                        onChange={(e) => {
                                                            const file = e.target.files[0];
                                                            if (file) setGroupThumbInput(URL.createObjectURL(file));
                                                        }}
                                                    />
                                                    <button className="adminActionButton approve" style={{ margin: 0, width: 'auto' }} onClick={async () => {
                                                        const fileInput = document.getElementById('groupImageInput');
                                                        if (fileInput.files.length === 0) return;
                                                        showMessage("Uploading Thumbnail...");
                                                        try {
                                                            const file = fileInput.files[0];
                                                            const storageRef = ref(storage, `centerstage_thumbs/group_${targetStage.replace(/\s+/g, '')}_${Date.now()}`);
                                                            const snapshot = await uploadBytes(storageRef, file);
                                                            const url = await getDownloadURL(snapshot.ref);
                                                            await setDoc(doc(db, "settings", "competitionDisplayState"), { 
                                                                roundMedia: { [targetStage]: { link: stageMedia.link || "", thumbnail: url } }
                                                            }, { merge: true });
                                                            setGroupThumbInput('');
                                                            showMessage("Group Thumbnail Saved!");
                                                        } catch (err) { showMessage("Upload failed."); }
                                                    }}>Upload</button>
                                                </div>
                                            </div>

                                            <div style={{ background: '#111', border: '1px solid #222', borderRadius: '8px', padding: '16px' }}>
                                                <label style={{ color: '#FFD700', fontSize: '12px', fontWeight: 700, display: 'block', marginBottom: '8px' }}>🤝 Sponsored Banner for {targetStage}</label>
                                                
                                                {stageSponsor.sponsorMediaUrl && (
                                                    <div style={{ width: '100%', maxWidth: '200px', marginBottom: '12px', borderRadius: '4px', overflow: 'hidden', border: '1px solid #333' }}>
                                                        <img src={stageSponsor.sponsorMediaUrl} alt="Sponsor" style={{ width: '100%', display: 'block' }} />
                                                    </div>
                                                )}

                                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '10px' }}>
                                                    <input id="sponsorTitleInput" className="cs-input" style={{ flex: 1, minWidth: '200px' }} placeholder="Sponsor Name..." defaultValue={stageSponsor.sponsorTitle || ''} />
                                                    <input id="sponsorLinkInput" className="cs-input" style={{ flex: 2, minWidth: '250px' }} placeholder="Sponsor Target URL..." defaultValue={stageSponsor.sponsorLink || ''} />
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <input id="sponsorImageInput" type="file" accept="image/*" className="cs-input" style={{ padding: '4px', flex: 1 }} />
                                                    <button className="adminActionButton approve" onClick={async () => {
                                                        showMessage("Saving Sponsor Info...");
                                                        try {
                                                            const title = document.getElementById('sponsorTitleInput').value;
                                                            const link = document.getElementById('sponsorLinkInput').value;
                                                            const fileInput = document.getElementById('sponsorImageInput');
                                                            
                                                            let updateData = { sponsorTitle: title, sponsorLink: link };

                                                            if (fileInput.files.length > 0) {
                                                                const file = fileInput.files[0];
                                                                const storageRef = ref(storage, `centerstage_sponsor/${targetStage.replace(/\s+/g, '')}_${Date.now()}`);
                                                                const snapshot = await uploadBytes(storageRef, file);
                                                                updateData.sponsorMediaUrl = await getDownloadURL(snapshot.ref);
                                                            }

                                                            await setDoc(doc(db, "settings", "competitionDisplayState"), {
                                                                roundSponsors: { [targetStage]: { ...stageSponsor, ...updateData } }
                                                            }, { merge: true });
                                                            showMessage("Stage Sponsor Data Saved!");
                                                        } catch (err) { showMessage("Failed to save Sponsor data."); }
                                                    }}>Save Stage Sponsor</button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        {/* 🏆 CHAMPION SHOWCASE CONTROL */}
                        <div style={{ background: '#1A1A1A', border: '1px solid #333', borderRadius: '12px', padding: '20px', marginBottom: '24px' }}>
                            <p style={{ color: '#FFD700', fontSize: '14px', fontWeight: 700, margin: '0 0 12px 0', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🏆 Season Champion Showcase</p>
                            <p style={{ color: '#888', fontSize: '12px', margin: '0 0 16px 0' }}>Upload the official champion's media. This replaces the default fallback animation on the CenterStage screen when a champion stage is selected.</p>
                            
                            {competitionState?.championMediaUrl && (
                                <div style={{ width: '100%', maxWidth: '320px', marginBottom: '16px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #333' }}>
                                    {competitionState.championMediaType === 'video' ? (
                                        <video src={competitionState.championMediaUrl} controls style={{ width: '100%' }} />
                                    ) : (
                                        <img src={competitionState.championMediaUrl} alt="Champion Asset" style={{ width: '100%' }} />
                                    )}
                                </div>
                            )}

                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <input 
                                    id="championAssetInput" 
                                    type="file" 
                                    accept="image/*,video/*" 
                                    className="cs-input" 
                                    style={{ padding: '4px', flex: 1, margin: 0 }} 
                                />
                                <button className="adminActionButton approve" style={{ margin: 0, width: 'auto' }} onClick={async () => {
                                    const fileInput = document.getElementById('championAssetInput');
                                    if (fileInput.files.length === 0) return;
                                    showMessage("Uploading Champion Asset...");
                                    try {
                                        const file = fileInput.files[0];
                                        const fileType = file.type.startsWith('video/') ? 'video' : 'image';
                                        
                                        // Overwrite static path to avoid storage costs
                                        const storageRef = ref(storage, 'centerstage_assets/champion_showcase_file');
                                        const snapshot = await uploadBytes(storageRef, file);
                                        const url = await getDownloadURL(snapshot.ref);
                                        
                                        await setDoc(doc(db, "settings", "competitionDisplayState"), {
                                            championMediaUrl: url,
                                            championMediaType: fileType
                                        }, { merge: true });
                                        
                                        showMessage("Champion Asset Saved & Overwritten!");
                                    } catch (err) {
                                        console.error(err);
                                        showMessage("Failed to upload champion asset.");
                                    }
                                }}>Upload Asset</button>

                                {competitionState?.championMediaUrl && (
                                    <button className="adminActionButton reject" style={{ margin: 0, width: 'auto' }} onClick={async () => {
                                        try {
                                            await setDoc(doc(db, "settings", "competitionDisplayState"), {
                                                championMediaUrl: "",
                                                championMediaType: ""
                                            }, { merge: true });
                                            showMessage("Champion Asset Cleared!");
                                        } catch (err) { showMessage("Failed to clear."); }
                                    }}>Clear</button>
                                )}
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
                            {centerStageContestants.sort((a, b) => {
                                const target = selectedStageToEdit || competitionState?.stages?.[competitionState?.currentStageIndex] || 'Round 1';
                                return (b.performances?.[target]?.votes || 0) - (a.performances?.[target]?.votes || 0);
                            }).map(c => {
                                const target = selectedStageToEdit || competitionState?.stages?.[competitionState?.currentStageIndex] || 'Round 1';
                                const targetIdx = competitionState?.stages?.indexOf(target) || 0;
                                const elimIdx = c.eliminatedAtStageIndex !== undefined && c.eliminatedAtStageIndex !== null ? c.eliminatedAtStageIndex : (c.isEliminated ? 0 : 999);
                                const isElimInThisRound = targetIdx >= elimIdx;

                                return (
                                    <div key={c.id} className="cs-card" style={{ filter: isElimInThisRound ? 'grayscale(100%) opacity(0.7)' : 'none' }}>
                                        {/* Profile Row */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
                                            <img src={c.profilePictureUrl || 'https://placehold.co/50'} alt={c.creatorName} style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover' }} />
                                            <div style={{ flex: 1 }}>
                                                <p style={{ margin: 0, fontWeight: 'bold', color: '#FFF' }}>{c.creatorName}</p>
                                                {(() => {
                                                    const target = selectedStageToEdit || competitionState?.stages?.[competitionState?.currentStageIndex] || 'Round 1';
                                                    const roundStats = c.performances?.[target];
                                                    return (
                                                        <p style={{ margin: 0, fontSize: '12px', color: '#D4AF37' }}>
                                                            {roundStats?.votes || 0} Round Votes | {roundStats?.earnings || 0} GYD Round Earnings
                                                        </p>
                                                    );
                                                })()}
                                            </div>
                                            <button 
                                                className={`adminActionButton ${c.isEliminated ? 'approve' : 'reject'}`} 
                                                onClick={() => handleCenterStageAction(c.id, c.isEliminated ? 'reinstate' : 'eliminate')}
                                            >
                                                {c.isEliminated ? 'Reinstate' : 'Eliminate'}
                                            </button>
                                        </div>

                                        <div style={{ background: '#1A1A1A', padding: '10px', borderRadius: '6px' }}>
                                            {/* Preview Thumbnail */}
                                            {(() => {
                                                const target = selectedStageToEdit || competitionState?.stages?.[competitionState?.currentStageIndex] || 'Round 1';
                                                const roundPerf = c.performances?.[target] || {};
                                                const activeLink = editMediaInputs[c.id] !== undefined ? editMediaInputs[c.id] : (roundPerf.link || '');
                                                const ytMatch = activeLink.match(/[?&]v=([^&]+)/) || activeLink.match(/youtu\.be\/([^?]+)/);
                                                const ytId = ytMatch ? ytMatch[1] : null;
                                                const activeThumb = editThumbInputs[c.id] || roundPerf.thumbnail || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null);
                                                
                                                return activeThumb ? (
                                                    <div style={{ width: '100%', aspectRatio: '16/9', background: '#000', marginBottom: '10px', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
                                                        <img src={activeThumb} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Preview" />
                                                        {isUploadingThumb[c.id] && <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#00FFFF', fontSize: '12px', fontWeight: 'bold' }}>Uploading...</div>}
                                                    </div>
                                                ) : null;
                                            })()}

                                            {/* Video Link Save Input */}
                                            <p style={{ fontSize: '11px', color: '#888', margin: '0 0 5px 0' }}>Challenge Media (YouTube/FB Link)</p>
                                            <div style={{ display: 'flex', gap: '5px', marginBottom: '10px' }}>
                                                {(() => {
                                                    const target = selectedStageToEdit || competitionState?.stages?.[competitionState?.currentStageIndex] || 'Round 1';
                                                    const roundVal = c.performances?.[target]?.link || '';
                                                    return (
                                                        <input 
                                                            id={`videoInput_${c.id}`}
                                                            key={`${c.id}_${target}_${roundVal}`}
                                                            className="cs-input" 
                                                            placeholder="Paste Video Link..." 
                                                            defaultValue={roundVal}
                                                            onChange={(e) => setEditMediaInputs({...editMediaInputs, [c.id]: e.target.value})}
                                                        />
                                                    );
                                                })()}
                                                <button className="adminActionButton approve" onClick={async () => {
                                                    const val = document.getElementById(`videoInput_${c.id}`).value;
                                                    const targetStage = selectedStageToEdit || competitionState?.stages?.[competitionState?.currentStageIndex] || 'Round 1';
                                                    await handleCenterStageAction(c.id, 'update_media', { 
                                                        stageName: targetStage,
                                                        challengeLink: val, 
                                                        customThumbnailUrl: editThumbInputs[c.id] || c.performances?.[targetStage]?.thumbnail || '' 
                                                    });
                                                }}>Save for {selectedStageToEdit || 'Current'}</button>
                                            </div>

                                            {/* Custom Thumbnail Selector */}
                                            <p style={{ fontSize: '11px', color: '#888', margin: '0 0 5px 0' }}>Custom Thumbnail (Optional Upload)</p>
                                        <input 
                                            id={`thumbInput_${c.id}`}
                                            type="file" 
                                            accept="image/*"
                                            style={{ fontSize: '10px', color: '#AAA', marginBottom: '10px', width: '100%' }} 
                                            onChange={async (e) => {
                                                const file = e.target.files[0];
                                                if (file) {
                                                    const localPreviewUrl = URL.createObjectURL(file);
                                                    setEditThumbInputs({...editThumbInputs, [c.id]: localPreviewUrl});
                                                    setIsUploadingThumb({...isUploadingThumb, [c.id]: true});
                                                    try {
                                                        const storageRef = ref(storage, `centerstage_thumbs/${c.id}_${Date.now()}`);
                                                        const snapshot = await uploadBytes(storageRef, file);
                                                        const url = await getDownloadURL(snapshot.ref);
                                                        setEditThumbInputs({...editThumbInputs, [c.id]: url}); // Swap local for live URL
                                                    } catch (err) {
                                                        console.error(err);
                                                        showMessage("Upload failed. Check Storage Rules.");
                                                    } finally {
                                                        setIsUploadingThumb({...isUploadingThumb, [c.id]: false});
                                                    }
                                                }
                                            }}
                                        />
                                        {(c.currentChallengeThumbnail || editThumbInputs[c.id]) && (
                                            <button 
                                                className="adminActionButton reject" 
                                                style={{ fontSize: '10px', padding: '4px 8px', marginBottom: '10px', width: 'auto', display: 'block' }}
                                                onClick={async () => {
                                                    const currentVideoVal = editMediaInputs[c.id] !== undefined ? editMediaInputs[c.id] : (c.currentChallengeLink || '');
                                                    await handleCenterStageAction(c.id, 'update_media', { 
                                                        challengeLink: currentVideoVal, 
                                                        customThumbnailUrl: '' 
                                                    });
                                                    setEditThumbInputs({ ...editThumbInputs, [c.id]: '' });
                                                }}
                                            >
                                                🗑️ Reset to Auto-Thumbnail
                                            </button>
                                        )}

                                            {/* Team Tag Selector */}
                                            <p style={{ fontSize: '11px', color: '#888', margin: '10px 0 5px 0' }}>Team Tag (Groups contestants in UI)</p>
                                            <div style={{ display: 'flex', gap: '5px' }}>
                                                <input 
                                                    id={`teamInput_${c.id}`}
                                                    className="cs-input" 
                                                    placeholder="e.g., Team Alpha" 
                                                    defaultValue={c.teamTag || ''}
                                                />
                                                <button className="adminActionButton approve" onClick={async () => {
                                                    const val = document.getElementById(`teamInput_${c.id}`).value;
                                                    await handleCenterStageAction(c.id, 'assign_team', { teamTag: val });
                                                }}>Tag</button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>
                )}

                {/* --- OVERVIEW TAB (CLEANED UP) --- */}
                {selectedAdminSubScreen === 'Overview' && (
                    <>
                        {/* NEW: MONETIZATION REVIEW QUEUE (Persistent) */}
                        <section className="dashboardSection" style={{ border: '2px solid #FFD700', background: 'rgba(255, 215, 0, 0.02)', marginBottom: '24px' }}>
                            <p className="dashboardSectionTitle" style={{ color: '#FFD700', margin: 0 }}>🎬 Showcase Monetization Review</p>
                            <p style={{ color: '#AAA', fontSize: '12px', margin: '8px 0 16px 0' }}>Verify original content. Approval launches the video fresh to the top of the Showcase feed.</p>
                            
                            {monetizationQueue.length > 0 ? (
                                <div className="dashboardContentList">
                                    {monetizationQueue.map(item => (
                                        <div key={item.id} className="adminDashboardItem" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#111', padding: '12px', border: '1px solid #333', borderRadius: '8px', marginBottom: '8px' }}>
                                            <div 
                                                style={{ display: 'flex', gap: '15px', alignItems: 'center', cursor: 'pointer' }} 
                                                title="Click to play and review video content" 
                                                onClick={() => window.open(item.mainUrl || item.embedUrl, '_blank')}
                                            >
                                                <div style={{ position: 'relative', width: '80px', height: '45px', background: '#000', borderRadius: '4px', overflow: 'hidden' }}>
                                                    <img src={item.customThumbnailUrl || 'https://placehold.co/100x56'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Thumb" />
                                                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <span style={{ fontSize: '9px', color: '#00FFFF', fontWeight: '900', letterSpacing: '1px' }}>👁️ REVIEW</span>
                                                    </div>
                                                </div>
                                                <div>
                                                    <p style={{ margin: 0, fontWeight: 'bold', fontSize: '14px', color: '#FFF' }}>{item.title}</p>
                                                    <p style={{ margin: '2px 0 0 0', fontSize: '11px', color: '#888' }}>Creator: <span style={{ color: '#FFD700' }}>{item.creatorName}</span></p>
                                                </div>
                                            </div>
                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                <button className="adminActionButton reject" onClick={() => handleRejectMonetization(item)}>Reject</button>
                                                <button className="adminActionButton approve" onClick={() => handleApproveMonetization(item)}>Approve & Launch</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ color: '#888', fontSize: '13px' }}>No videos pending monetization review.</p>
                            )}
                        </section>

                        {/* PENDING PLEDGES */}
                        {/* THE FIX: Expand role check to include super_admin so the review queue renders properly */}
                        {(creatorProfile.role === 'admin' || creatorProfile.role === 'super_admin') && (
                            <section className="dashboardSection" style={{ border: '2px solid #FFD700' }}>
                                <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsPaymentsExpanded(!isPaymentsExpanded)}>
                                    <p className="dashboardSectionTitle" style={{marginBottom: 0, color: '#FFD700'}}>Pending Payments / Gifts ({pendingPledges.length})</p>
                                    <span className="text-xl font-bold text-white">{isPaymentsExpanded ? '▼' : '▶'}</span>
                                </div>
                                <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isPaymentsExpanded ? 'max-h-[800px]' : 'max-h-0'}`}>
                                   <div className="pt-4 border-t mt-4" style={{borderColor: '#444'}}>
                                    {/* THE FIX: Combined Search and Category Filter dropdowns */}
                                    <div style={{ display: 'flex', gap: '10px', marginBottom: '10px' }}>
                                        <input type="text" className="formInput" placeholder="Search by Pledge ID or User Name..." value={pledgeSearchTerm} onChange={(e) => setPledgeSearchTerm(e.target.value)} style={{ flex: 2, margin: 0 }} />
                                        <select className="formInput" value={pledgeFilterType} onChange={(e) => setPledgeFilterType(e.target.value)} style={{ flex: 1, margin: 0, padding: '5px' }}>
                                            <option value="all">All Payments</option>
                                            <option value="roastToken">Roast Tokens</option>
                                            <option value="giftToken">Gift Tokens</option>
                                            <option value="ticket">Event Tickets</option>
                                        </select>
                                    </div>
                                    <div style={{maxHeight: '400px', overflowY: 'auto', paddingRight: '10px'}}>
                                            {filteredAndSortedPledges.map(p => {
                                                // Extract profiles directly from memory
                                                const donorProfile = allUsers.find(u => u.id === p.userId);
                                                const recipientProfile = allUsers.find(u => u.id === p.targetUserId);

                                                return (
                                                    <div key={p.id} className="adminDashboardItem" style={{flexDirection: 'column', alignItems: 'stretch', gap: '0', padding: 0, overflow: 'hidden', background: '#111'}}>
                                                        <div style={{ padding: '16px', background: '#1A1A1A', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
    <div>
        {p.type === 'ticket' ? (
            <p className="adminDashboardItemTitle" style={{margin: 0, fontSize: '16px', color: '#FFD700'}}>🎟️ Box Office: {p.eventTitle}</p>
        ) : (
            <p className="adminDashboardItemTitle" style={{margin: 0, fontSize: '16px'}}>{p.targetEventTitle || p.giftName || `[${(p.paymentType || p.type || 'Pledge').toUpperCase()}] Pledge`}</p>
        )}
        <p style={{margin: '4px 0 0', fontSize: '12px', color: '#888'}}>Transaction ID: {p.pledgeId || p.id}</p>
    </div>
                                                            <p style={{color:'#00FF00', fontWeight: '900', fontSize: '1.2rem', margin: 0}}>{formatCurrency(p.amount, selectedCurrency, currencyRates)}</p>
                                                        </div>
                                                        
                                                        <div style={{ padding: '16px' }}>
                                                            {/* RICH DONOR SECTION */}
                                                            <div style={{ marginBottom: '16px' }}>
                                                                <p style={{ margin: '0 0 6px 0', color: '#888', fontWeight: 'bold', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Donor Profile</p>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                                    <img src={donorProfile?.profilePictureUrl || 'https://placehold.co/40'} alt="Donor" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                                                                    <div>
                                                                        <p style={{ margin: 0, color: '#FFF', fontWeight: 'bold' }}>{donorProfile?.creatorName || p.userName}</p>
                                                                        <p style={{ margin: 0, fontSize: '12px', color: '#AAA' }}>{donorProfile?.email || 'No email associated'}</p>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* RICH RECIPIENT SECTION (CONDITIONAL) */}
                                                            {p.type !== 'ticket' && (
                                                                <div style={{ background: 'rgba(255, 215, 0, 0.03)', border: '1px solid rgba(255, 215, 0, 0.1)', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                                                                    <p style={{ margin: '0 0 8px 0', color: '#FFD700', fontWeight: 'bold', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recipient Actor</p>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                                        <img src={recipientProfile?.profilePictureUrl || 'https://placehold.co/32'} alt="Recipient" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} />
                                                                        <div>
                                                                            <p style={{ margin: 0, color: '#FFF', fontWeight: 'bold' }}>{recipientProfile?.creatorName || p.targetActorName || 'Unknown Actor'}</p>
                                                                            <p style={{ margin: 0, fontSize: '11px', color: '#888' }}>{recipientProfile?.creatorField || 'Docu-Series Contestant'}</p>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}

                                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '6px', fontSize: '12px', background: '#0A0A0A', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>
                                                                <div><span style={{color: '#888'}}>Date Submitted:</span> {p.createdAt?.toDate ? p.createdAt.toDate().toLocaleString() : (p.createdAt && !isNaN(Date.parse(p.createdAt)) ? new Date(p.createdAt).toLocaleString() : 'Processing...')}</div>
                                                                <div><span style={{color: '#888'}}>Sender UID:</span> <span style={{ fontFamily: 'monospace', color: '#AAA' }}>{p.userId}</span></div>
                                                                {p.type !== 'ticket' && (
                                                                    <div><span style={{color: '#888'}}>Recipient UID:</span> <span style={{ fontFamily: 'monospace', color: '#AAA' }}>{p.targetUserId}</span></div>
                                                                )}
                                                            </div>
                                                            
                                                            {(p.screenshotUrl || p.screenshotBase64) && (
                                                                <button 
                                                                    type="button"
                                                                    className="adminActionButton" 
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        // THE FIX: Launch the screenshot inside your existing, global, un-cropped Content Player Modal [1]
                                                                        window.dispatchEvent(new CustomEvent('openContentPlayer', {
                                                                            detail: {
                                                                                imageUrl: p.screenshotUrl || p.screenshotBase64,
                                                                                description: `Receipt for: ${p.targetEventTitle || p.giftName || 'Audition Entry'}`
                                                                            }
                                                                        }));
                                                                    }} 
                                                                    style={{ background: '#1A1A1A', border: '1px solid #4F46E5', color: '#4F46E5', width: '100%', padding: '12px', borderRadius: '8px', fontWeight: 'bold', margin: '0 0 16px 0', transition: 'all 0.2s' }}
                                                                >
                                                                    📄 View Receipt Screenshot
                                                                </button>
                                                            )}

                                                            <div style={{ display: 'flex', gap: '10px' }}>
                                                                <button className="adminActionButton reject" style={{ flex: 1, padding: '12px' }} onClick={() => denyPledgeLogic(p.id)}>Deny Request</button>
                                                                <button className="adminActionButton approve" style={{ flex: 1, padding: '12px' }} onClick={() => handleApprovePledge(p.id)}>Approve Payment</button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                            {filteredAndSortedPledges.length === 0 && <p style={{color: '#888'}}>No pending payments.</p>}
                                        </div>
                                    </div>
                                </div>
                            </section>
                        )}

                        {/* USER MANAGEMENT */}
                        <section className="dashboardSection">
                            <div className="flex justify-between items-center cursor-pointer" onClick={() => setIsUserManagementExpanded(!isUserManagementExpanded)}>
                                <p className="dashboardSectionTitle" style={{ marginBottom: 0 }}>User Management ({filteredUsers.length})</p>
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
                                                <option value="suspended">Suspended</option>
                                                <option value="banned">Banned</option>
                                            </optgroup>
                                        </select>
                                    </div>
                                    <div className="dashboardContentList" style={{maxHeight: '400px', overflowY: 'auto', paddingRight: '10px'}}>
                                        {filteredUsers.map(user => {
                                            const statusBadges = getUserStatusBadges(user);
                                            const primaryStatus = statusBadges[0] || {text: 'Unknown', color: '#CCC'};
                                            const isSuspended = primaryStatus.text === 'Suspended';
                                            return (
                                                <div key={user.id} className="adminDashboardItem admin-user-card" style={{alignItems: 'flex-start'}}>
                                                    <div style={{display: 'flex', alignItems: 'center', flexGrow: 1, marginRight: '10px', cursor: 'pointer'}} onClick={() => {setSelectedUserId(user.id); setActiveScreen('UserProfile');}}>
                                                        <img src={user.profilePictureUrl || 'https://placehold.co/50'} alt={user.creatorName} style={{width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover', marginRight: '15px'}} />
                                                        <div>
                                                            <div className="adminDashboardItemTitle" style={{ display: 'flex', alignItems: 'center' }}>
                                                                {user.creatorName}
                                                                <RoleBadge profile={user} />
                                                            </div>
                                                            <p style={{ fontSize: '12px', color: '#AAA', margin: '4px 0' }}>{user.email}</p>
                                                            
                                                            {/* DYNAMIC CREATOR FIELD BADGE DROP-DOWN */}
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: '4px 0' }}>
                                                                <span style={{ fontSize: '11px', color: '#666' }}>Badge Role:</span>
                                                                <select 
                                                                    value={user.creatorField || ''} 
                                                                    onClick={(e) => e.stopPropagation()} // Prevents navigating to user profile when selecting field
                                                                    onChange={async (e) => {
                                                                        showMessage(`Updating ${user.creatorName} to ${e.target.value}...`);
                                                                        try {
                                                                            await updateDoc(doc(db, "creators", user.id), { creatorField: e.target.value || null });
                                                                            showMessage("Badge role updated!");
                                                                        } catch(err) {
                                                                            showMessage("Failed to update badge role.");
                                                                        }
                                                                    }}
                                                                    style={{ background: '#1A1A1A', border: '1px solid #444', color: '#FFD700', fontSize: '11px', padding: '2px 6px', borderRadius: '4px', cursor: 'pointer' }}
                                                                >
                                                                    <option value="">No Badge Role</option>
                                                                    <option value="Comedian">🎭 Comedian</option>
                                                                    <option value="Craft">🎨 Craft</option>
                                                                    <option value="Health & Fitness">💪 Health & Fitness</option>
                                                                    <option value="Designer">📐 Designer</option>
                                                                    <option value="Influencer">🌟 Influencer</option>
                                                                    <option value="Poet">✍️ Poet</option>
                                                                    <option value="Musician">🎵 Musician</option>
                                                                    <option value="Filmmaker">🎬 Filmmaker</option>
                                                                    <option value="Actor">🎭 Actor</option>
                                                                </select>
                                                            </div>

                                                            <p style={{ fontSize: '12px', color: primaryStatus.color, fontWeight: 'bold', margin: 0 }}>Status: {primaryStatus.text}</p>
                                                        </div>
                                                    </div>
                                                    <div className="admin-user-card-actions" style={{display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end', flexShrink: 0}}>
                                                        {(() => {
                                                            const isTargetAdmin = user.role === 'admin';
                                                            const isTargetAuthority = user.role === 'authority';
                                                            const viewerIsAdmin = creatorProfile.role === 'admin' || creatorProfile.role === 'super_admin';
                                                            const viewerIsAuthority = creatorProfile.role === 'authority';
                                                            const isActionDisabled = (viewerIsAuthority && (isTargetAdmin || isTargetAuthority)) || (viewerIsAdmin && isTargetAdmin && creatorProfile.role !== 'super_admin') || user.role === 'super_admin';

                                                            return (
                                                                <>
                                                                    <select className="formInput" defaultValue={user.role} onChange={(e) => handleRoleChange(user, e.target.value)} style={{padding: '5px', fontSize: '12px', width: '120px'}} disabled={isActionDisabled}>
                                                                        <option value="user">User</option>
                                                                        <option value="creator">Creator</option>
                                                                        {viewerIsAdmin && <option value="authority">Authority</option>}
                                                                        {viewerIsAdmin && <option value="admin">Admin</option>}
                                                                        {user.role === 'super_admin' && <option value="super_admin">Super Admin</option>}
                                                                    </select>
                                                                    {/* COMPACT PILL BUTTON ROW (Sus, Ban, Rep) */}
                                                                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', width: '100%', maxWidth: '160px', marginTop: '4px' }}>
                                                                        {isSuspended ? (
                                                                            <button className="adminActionButton approve" style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '100px', margin: 0 }} onClick={() => handleLiftSuspension(user)} disabled={isActionDisabled}>Reac</button>
                                                                        ) : (
                                                                            !user.banned && <button className="adminActionButton" style={{ backgroundColor: '#FF8C00', fontSize: '10px', padding: '4px 8px', borderRadius: '100px', margin: 0 }} onClick={() => handleOpenSuspendModal(user)} disabled={isActionDisabled}>Sus</button>
                                                                        )}
                                                                        <button className={`adminActionButton ${user.banned ? 'approve' : 'reject'}`} style={{ fontSize: '10px', padding: '4px 8px', borderRadius: '100px', margin: 0 }} onClick={() => handleToggleBan(user)} disabled={isActionDisabled}>{user.banned ? 'Unb' : 'Ban'}</button>
                                                                        <button className="adminActionButton approve" style={{ border: '1px solid #FFD700', color: '#FFD700', backgroundColor: 'transparent', fontSize: '10px', padding: '4px 8px', borderRadius: '100px', margin: 0 }} onClick={() => generateUserAuditReport(user)} disabled={isGeneratingReport}>Rep</button>
                                                                    </div>

                                                                    {/* FILMMAKER TOGGLES & BOX OFFICE SWEEP */}
                                                                    {user.creatorField === 'Filmmaker' && viewerIsAdmin && (
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '8px', width: '100%', maxWidth: '160px', background: 'rgba(255,215,0,0.05)', padding: '8px', borderRadius: '6px', border: '1px dashed rgba(255,215,0,0.3)' }}>
                                                                            <label style={{ fontSize: '10px', color: '#FFD700', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                                                                                Donations: <input type="checkbox" checked={user.enableDonationSubmissions || false} onChange={async (e) => await updateDoc(doc(db, "creators", user.id), { enableDonationSubmissions: e.target.checked })} />
                                                                            </label>
                                                                            <label style={{ fontSize: '10px', color: '#00FFFF', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                                                                                Premieres: <input type="checkbox" checked={user.enablePremiereSubmissions || false} onChange={async (e) => await updateDoc(doc(db, "creators", user.id), { enablePremiereSubmissions: e.target.checked })} />
                                                                            </label>
                                                                            {(user.boxOfficeLedger?.ticketSales > 0 || user.boxOfficeLedger?.filmDonations > 0) && (
                                                                                <button 
                                                                                    className="adminActionButton approve" 
                                                                                    style={{ fontSize: '10px', padding: '6px', margin: '6px 0 0 0', width: '100%' }}
                                                                                    onClick={() => {
                                                                                        setConfirmationTitle("Transfer Box Office?");
                                                                                        setConfirmationMessage(`Transfer pending ledger funds to ${user.creatorName}'s main total earnings balance?`);
                                                                                        setOnConfirmationAction(() => async () => {
                                                                                            showMessage("Transferring funds via backend sweep...");
                                                                                            try {
                                                                                                const sweepFunc = httpsCallable(functions, 'transferBoxOfficeToUser');
                                                                                                // Calls the new backend sweep logic
                                                                                                await sweepFunc({ targetUserId: user.id }); 
                                                                                                showMessage("Box Office Transferred and Ledgers Cleared!");
                                                                                            } catch(e) { showMessage(`Sweep Failed: ${e.message}`); }
                                                                                        });
                                                                                        setShowConfirmationModal(true);
                                                                                    }}
                                                                                >
                                                                                    Sweep Ledger to Earnings
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </>
                                                            );
                                                        })()}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </section>
                    </>
                )}
            </div>

            {/* ====== THE INTERACTIVE REWARDS & AUDIT REPORT MODAL ====== */}
            {isReportModalOpen && reportTargetUser && (
                <div className="modal-backdrop" onClick={() => setIsReportModalOpen(false)}>
                    <div className="modal-content" style={{ maxWidth: '560px', border: '1px solid #FFD700' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <p className="modal-title" style={{ color: '#FFD700', fontSize: '1.2rem', margin: 0 }}>📊 Financial & Tournament Audit</p>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginRight: '30px' }}>
                                <button 
                                    className="adminActionButton approve" 
                                    style={{ margin: 0, padding: '4px 12px', fontSize: '11px', borderRadius: '100px', border: '1px solid #4ADE80', color: '#4ADE80', backgroundColor: 'transparent' }}
                                    onClick={() => window.print()}
                                >
                                    📄 Export Audit PDF
                                </button>
                            </div>
                            <button className="modal-close-button" onClick={() => setIsReportModalOpen(false)}>&times;</button>
                        </div>
                        <div className="modal-body" style={{ maxHeight: '480px', overflowY: 'auto', padding: '20px' }}>
                            
                            {/* Profile details */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px', background: '#111', padding: '12px', borderRadius: '8px' }}>
                                <img src={reportTargetUser.profilePictureUrl || 'https://placehold.co/40'} alt="Audited" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                                <div>
                                    <p style={{ margin: 0, color: '#FFF', fontWeight: 'bold', fontSize: '15px' }}>{reportTargetUser.creatorName}</p>
                                    <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>UID: <span style={{ fontFamily: 'monospace' }}>{reportTargetUser.id}</span></p>
                                </div>
                            </div>

                            {/* Monthly Selector (Dynamically generates the last rolling 12 calendar months) */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                <label style={{ color: '#AAA', fontSize: '13px', fontWeight: 'bold' }}>Audit Month:</label>
                                <select 
                                    className="formInput" 
                                    value={reportMonth} 
                                    onChange={(e) => generateUserAuditReport(reportTargetUser, e.target.value)}
                                    style={{ width: '160px', padding: '6px', fontSize: '12px', margin: 0 }}
                                >
                                    {(() => {
                                        const options = [];
                                        const date = new Date();
                                        // Loop 12 months backward from today to dynamically populate the selector
                                        for (let i = 0; i < 12; i++) {
                                            const tempDate = new Date(date.getFullYear(), date.getMonth() - i, 1);
                                            const yyyy = tempDate.getFullYear();
                                            const mm = String(tempDate.getMonth() + 1).padStart(2, '0');
                                            const val = `${yyyy}-${mm}`;
                                            const label = tempDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
                                            options.push(<option key={val} value={val}>{label}</option>);
                                        }
                                        return options;
                                    })()}
                                </select>
                            </div>

                            {/* TOURNAMENT PARTICIPATION SUMMARY */}
                            <p style={{ margin: '20px 0 8px 0', color: '#00FFFF', fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1px' }}>🏆 Tournament Activity</p>
                            {userCompetitions.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '20px' }}>
                                    {userCompetitions.map(comp => (
                                        <div key={comp.id} style={{ background: '#0F0F0F', padding: '10px 14px', borderRadius: '8px', border: '1px solid #222', fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <span style={{ display: 'block', color: '#FFF', fontWeight: 'bold' }}>{comp.compTitle}</span>
                                                <span style={{ fontSize: '11px', color: '#888' }}>Entry: "{comp.entryTitle}" ({comp.status})</span>
                                            </div>
                                            <span style={{ color: '#00FFFF', fontWeight: 'bold' }}>{comp.votes} Votes</span>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p style={{ color: '#666', fontSize: '12px', fontStyle: 'italic', marginBottom: '20px' }}>No tournament entries found for this creator.</p>
                            )}

                            {/* DETAILED LEDGER ENTRIES */}
                            <p style={{ margin: '0 0 8px 0', color: '#FFD700', fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1px' }}>💸 Income Ledger (85% Split Payout) [1]</p>
                            {reportData.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {reportData.map(log => (
                                        <div key={log.id} style={{ background: '#0A0A0A', border: '1px solid #222', borderRadius: '8px', padding: '12px', fontSize: '13px', lineHeight: '1.4' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1A1A1A', paddingBottom: '6px', marginBottom: '6px' }}>
                                                <span style={{ color: '#FFD700', fontWeight: 'bold' }}>{log.giftName}</span>
                                                <span style={{ color: '#00FF00', fontWeight: 'bold' }}>Net: {log.net.toLocaleString()} GYD</span>
                                            </div>
                                            <div style={{ fontSize: '11px', color: '#AAA' }}>
                                                <div><span style={{color: '#666'}}>Gross Sent:</span> {log.gross.toLocaleString()} GYD (15% Fee deducted)</div>
                                                <div><span style={{color: '#666'}}>Date:</span> {log.date}</div>
                                                <div><span style={{color: '#666'}}>Donor Email:</span> {log.donorEmail}</div>
                                                <div><span style={{color: '#666'}}>Donor UID:</span> <span style={{ fontFamily: 'monospace' }}>{log.donorUid}</span></div>
                                                <div><span style={{color: '#666'}}>Placed On:</span> <strong style={{ color: '#FFF' }}>{log.source}</strong></div>
                                            </div>
                                        </div>
                                    ))}
                                    <div style={{ borderTop: '2px solid #222', paddingTop: '10px', marginTop: '10px', display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '15px' }}>
                                        <span style={{ color: '#FFF' }}>Total Net Earnings:</span>
                                        <span style={{ color: '#00FF00' }}>
                                            {reportData.reduce((sum, item) => sum + item.net, 0).toLocaleString()} GYD
                                        </span>
                                    </div>
                                </div>
                            ) : (
                                <p style={{ color: '#666', fontSize: '12px', fontStyle: 'italic' }}>No approved earnings recorded for this month.</p>
                            )}

                        </div>
                    </div>
                </div>
            )}

            {/* MODALS */}
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