// src/components/CreatorDashboardScreen.jsx

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db, storage, functions, doc, collection, query, where, orderBy, limit, onSnapshot, updateDoc, getDoc, getDocs, addDoc, httpsCallable, ref, uploadBytes, getDownloadURL, deleteDoc, extractVideoInfo } from '../firebase'; // Consolidated imports

// --- Child Component Imports ---
import ProfilePictureAdjustModal from './ProfilePictureAdjustModal';
import GalleryImageAdjustModal from './GalleryImageAdjustModal'; // <-- NEW IMPORT
import formatCurrency from '../utils/formatCurrency';

import DynamicThumbnail from './DynamicThumbnail';
import RoleBadge from './RoleBadge';
import RoastTokenVault from './RoastTokenVault'; 

// --- Master Control Configuration ---

// --- Master Control Configuration ---
// These fields can later be dynamically fetched from a Firebase 'adminSettings/masterControls' document.
const MASTER_CREATOR_FIELDS = ['Comedian', 'Craft', 'Health & Fitness', 'Designer', 'Influencer', 'Poet', 'Musician', 'Filmmaker', 'Actor'];

const ROLE_COLORS = {
    'Comedian': '#FF4500', 'Craft': '#D2691E', 'Health & Fitness': '#20B2AA',
    'Designer': '#FF1493', 'Influencer': '#00BFFF', 'Poet': '#9370DB',
    'Musician': '#32CD32', 'Filmmaker': '#FFD700', 'Actor': '#DC143C',
    'Crafter / Designer': '#D2691E', 'Wellness Coach': '#20B2AA'
};

// --- GLOBAL 30-DAY GIFT BADGE RENDERER (Filters expired tokens) ---
const renderGlobalPatronGifts = (profile) => {
    if (!profile || !profile.receivedGifts || !Array.isArray(profile.receivedGifts)) return null;

    const now = Date.now();
    const activeGiftsMap = {};

    profile.receivedGifts.forEach(g => {
        const expiry = new Date(g.expiresAt).getTime();
        if (now < expiry) {
            activeGiftsMap[g.giftName] = (activeGiftsMap[g.giftName] || 0) + 1;
        }
    });

    const activeKeys = Object.keys(activeGiftsMap);
    if (activeKeys.length === 0) return null;

    const PROFILE_GIFT_TOKENS = [
        { name: 'Warm Spotlight', icon: '🔦' },
        { name: 'Golden Popcorn', icon: '🍿' },
        { name: 'Rainbow Flare', icon: '🌈' },
        { name: "Director's Chair", icon: '🎬' },
        { name: 'The Executive Producer', icon: '💎' },
    ];

    return (
        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '10px', justifyContent: 'center' }}>
            {PROFILE_GIFT_TOKENS.map(token => {
                const count = activeGiftsMap[token.name] || 0;
                if (count === 0) return null;
                return (
                    <div key={token.name} style={{ display: 'inline-flex', alignItems: 'center', gap: '3px', background: 'rgba(255, 215, 0, 0.1)', border: '1px solid rgba(255, 215, 0, 0.2)', borderRadius: '6px', padding: '2px 6px', fontSize: '11px' }}>
                        <span>{token.icon}</span>
                        <span style={{ color: '#FFD700', fontWeight: 'bold' }}>x{count}</span>
                    </div>
                );
            })}
        </div>
    );
};

// --- SLEEK PATRON STRIPE RENDERER (Clean, 30-Day Check) ---
const renderPatronStripe = (profile) => {
    if (!profile) return null;
    
    if (profile.patronStripeExpiry) {
        const expiry = new Date(profile.patronStripeExpiry).getTime();
        if (Date.now() > expiry) return null;
    } else {
        return null;
    }

    const userBadges = profile.badges || [];
    let stripeColor = null;
    let stripeText = "";
    let isLegend = false;

    if (userBadges.includes('Patron of the Arts (Legend)')) {
        isLegend = true;
        stripeText = "Legend";
    } else if (userBadges.includes('Patron of the Arts (Gold)')) {
        stripeColor = '#D4AF37';
        stripeText = "Gold";
    } else if (userBadges.includes('Patron of the Arts (Silver)')) {
        stripeColor = '#C0C0C0';
        stripeText = "Silver";
    } else if (userBadges.includes('Patron of the Arts (Bronze)')) {
        stripeColor = '#CD7F32';
        stripeText = "Bronze";
    }

    if (!stripeColor && !isLegend) return null;

    return (
        <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            background: isLegend ? 'linear-gradient(90deg, #FF0000, #FF7F00, #FFFF00, #00FF00, #0000FF, #4B0082, #8B00FF)' : stripeColor,
            color: isLegend ? '#FFF' : '#000',
            fontSize: '9px',
            fontWeight: '900',
            padding: '2px 6px',
            borderRadius: '4px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em',
            boxShadow: isLegend ? '0 0 8px rgba(255,255,255,0.4)' : `0 0 6px ${stripeColor}55`,
            verticalAlign: 'middle',
            lineHeight: '1'
        }}>
            {stripeText}
        </span>
    );
};

// --- DYNAMIC GIFTER ROW COMPONENT (Loads donor avatars on-demand) ---
const GifterRow = ({ g, setIsGiftersModalOpen }) => {
    const [avatarUrl, setAvatarUrl] = useState(null);

    useEffect(() => {
        if (g.isAnonymous || !g.userId) return;
        const docRef = doc(db, "creators", g.userId);
        getDoc(docRef).then(snap => {
            if (snap.exists()) {
                setAvatarUrl(snap.data().profilePictureUrl || '');
            }
        }).catch(err => console.error("Error loading gifter avatar:", err));
    }, [g.userId, g.isAnonymous]);

    return (
        <div 
            onClick={() => {
                if (!g.isAnonymous) {
                    window.dispatchEvent(new CustomEvent('navigateToUserProfile', { detail: { userId: g.userId } }));
                    setIsGiftersModalOpen(false);
                }
            }}
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                borderRadius: '8px',
                padding: '10px 14px',
                cursor: g.isAnonymous ? 'default' : 'pointer',
                transition: 'all 0.2s'
            }}
            onMouseEnter={e => { if (!g.isAnonymous) e.currentTarget.style.borderColor = '#C084FC'; }}
            onMouseLeave={e => { if (!g.isAnonymous) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #333' }}>
                    {g.isAnonymous ? (
                        <span style={{ fontSize: '14px' }}>👤</span>
                    ) : (
                        <img 
                            src={avatarUrl || 'https://placehold.co/32?text=👑'} 
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                            alt="Gifter Avatar" 
                            onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/32?text=👑'; }}
                        />
                    )}
                </div>
                <div>
                    <span style={{ display: 'block', color: '#FFF', fontWeight: 'bold', fontSize: '13px' }}>
                        {g.isAnonymous ? 'Anonymous Supporter' : g.userName}
                    </span>
                    <span style={{ fontSize: '11px', color: '#888' }}>
                        Received: {g.giftName}
                    </span>
                </div>
            </div>
            <span style={{ fontFamily: 'monospace', color: '#FFD700', fontSize: '13px', fontWeight: 'bold' }}>
                {g.amount.toLocaleString()} GYD
            </span>
        </div>
    );
};

const CreatorDashboardScreen = ({
    showMessage,
    setActiveScreen,
    currentUser,
    creatorProfile,
    setCreatorProfile,
    setShowConfirmationModal,
    setConfirmationTitle,
    setConfirmationMessage,
    setOnConfirmationAction,
    liveEvent,
    currencyRates,
    selectedCurrency,
    handleVideoPress,
    setPledgeContext // FIX: Added missing prop to prevent ReferenceError
}) => {
    // --- STATE AND CONSTANTS ---
    const [enrollmentStatus, setEnrollmentStatus] = useState(null); 
    const [isEnrollmentLoading, setIsEnrollmentLoading] = useState(true); 
    const [globalConfig, setGlobalConfig] = useState(null);
    const [isEditingProfile, setIsEditingProfile] = useState(false);
    
    // Age Verification & Legal Consent States
    const [editDateOfBirth, setEditDateOfBirth] = useState('');
    const [hasAcceptedLegalTerms, setHasAcceptedLegalTerms] = useState(false);
    const [isTokenVaultOpen, setIsTokenVaultOpen] = useState(false); // NEW: Shop Toggle
    const [payoutHistory, setPayoutHistory] = useState([]); // THE FIX: Moved to top level
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false); // THE FIX: Moved to top level
    const [showRoleWarningModal, setShowRoleWarningModal] = useState(false); 

    // --- MY GIFTERS LIST STATES & LISTENERS (Strict 30-Day Limit) ---
    const [myGifters, setMyGifters] = useState([]);
    const [isGiftersModalOpen, setIsGiftersModalOpen] = useState(false);

    // --- ACCORDION TOGGLES ---
    const [isDangerZoneExpanded, setIsDangerZoneExpanded] = useState(false);

    // --- ANALYTICS CHART STATES ---
    const [isChartModalOpen, setIsChartModalOpen] = useState(false);
    const [selectedChartPeriod, setSelectedChartPeriod] = useState('daily'); // 'daily', 'weekly', 'lifetime'
    const [hasPendingSweep, setHasPendingSweep] = useState(false); // THE FIX: Track pending Box Office sweeps

    // --- LEADERBOARD STATES & LISTENERS (Index-Free, Real-Time) ---
    const [leaderboardUsers, setLeaderboardUsers] = useState([]);
    const [isLeaderboardModalOpen, setIsLeaderboardModalOpen] = useState(false);

    // THE FIX: Listen for active tickets & self-heal orphan tickets (garbage collect purged/deleted films)
    const [myTickets, setMyTickets] = useState([]);
    useEffect(() => {
        if (!currentUser || !creatorProfile?.purchasedTickets) return;
        
        const purchasedIds = Object.keys(creatorProfile.purchasedTickets).filter(id => creatorProfile.purchasedTickets[id] === true);
        if (purchasedIds.length === 0) {
            setMyTickets([]);
            return;
        }

        const q = query(collection(db, "events"), where("__name__", "in", purchasedIds.slice(0, 10)));
        const unsub = onSnapshot(q, async (snap) => {
            const existingEventIds = new Set(snap.docs.map(d => d.id));
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(e => e.status !== 'completed');
            setMyTickets(list);

            // Self-Healing Garbage Collector: Clean up purchasedTickets map if the event is deleted/purged
            const orphanIds = purchasedIds.filter(id => !existingEventIds.has(id));
            if (orphanIds.length > 0) {
                const creatorRef = doc(db, "creators", currentUser.uid);
                const updates = {};
                orphanIds.forEach(id => {
                    updates[`purchasedTickets.${id}`] = false; // Sweeps the ghost badge from database
                });
                try {
                    await updateDoc(creatorRef, updates);
                } catch (e) {
                    console.warn("Orphan cleanup failed:", e);
                }
            }
        }, (err) => {
            console.log("Fallback ticket fetch required");
        });

        return () => unsub();
    }, [currentUser, creatorProfile?.purchasedTickets]);

    useEffect(() => {
        // Query top 10 creators based on giftsReceived
        const q = query(
            collection(db, "creators"),
            orderBy("giftsReceived", "desc"),
            limit(10)
        );
        const unsub = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            setLeaderboardUsers(fetched);
        });
        return () => unsub();
    }, []);

    // Dynamically calculate the logged-in creator's current ranking
    const myRank = useMemo(() => {
        if (leaderboardUsers.length === 0 || !currentUser) return '--';
        const index = leaderboardUsers.findIndex(u => u.id === currentUser.uid);
        return index !== -1 ? `#${index + 1}` : '--';
    }, [leaderboardUsers, currentUser]);

    useEffect(() => {
        if (!currentUser) return;

        // Query all approved gifts received by the logged-in creator
        const q = query(
            collection(db, "paymentPledges"),
            where("status", "==", "approved"),
            where("targetUserId", "==", currentUser.uid),
            where("paymentType", "==", "giftToken")
        );

        const unsub = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // Filter in-memory for gifts received within the last 30 days
            const now = Date.now();
            const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);

            const filteredAndSorted = fetched
                .filter(p => {
                    const createdTime = p.createdAt?.toDate ? p.createdAt.toDate().getTime() : (p.createdAt ? new Date(p.createdAt).getTime() : 0);
                    return createdTime >= thirtyDaysAgo;
                })
                .sort((a, b) => {
                    const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
                    const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
                    return tB - tA; // Newest first
                });

            setMyGifters(filteredAndSorted);
        });

        return () => unsub();
    }, [currentUser]); 
    
    // Clean, responsive dismiss tracker permanently mapped to browser cache and state-aware
    const [dismissedStatus, setDismissedStatus] = useState(() => {
        return localStorage.getItem(`nva_banner_dismissed_status_${currentUser?.uid}`) || null;
    });
    
    const [editCreatorName, setEditCreatorName] = useState('');
    const [editRealName, setEditRealName] = useState(''); // Added Legal Real Name state
    
    // --- MY FILM OFFICE STATES ---
    const [showFilmOfficeModal, setShowFilmOfficeModal] = useState(false);
    const [filmForm, setFilmForm] = useState({ title: '', genre: 'Drama', synopsis: '', credits: '', videoUrl: '', trailerUrl: '', posterUrl: '', type: '', premiereDate: '', room: 'Room 1' });

    // Local ref to prevent multiple triggers in the same session
    const processedNotificationRef = useRef(null);

    // THE FIX: Listen for global waiting toasts (valid for 7 days with loop protection)
    useEffect(() => {
        if (creatorProfile?.latestNotification && processedNotificationRef.current !== creatorProfile.latestNotification.timestamp) {
            const notif = creatorProfile.latestNotification;
            processedNotificationRef.current = notif.timestamp; // Instantly lock locally
            
            const notifTime = new Date(notif.timestamp).getTime();
            const sevenDays = 7 * 24 * 60 * 60 * 1000;
            if (Date.now() - notifTime <= sevenDays) {
                setTimeout(() => showMessage(`🔔 ${notif.message}`), 1000); // Slight delay for visibility on load
            }
            // Silent clear to prevent re-firing every render
            updateDoc(doc(db, "creators", currentUser.uid), { latestNotification: null }).catch(e => {
                console.warn("Firestore Rules blocked clearing latestNotification, but local ref protected the loop.");
            });
        }
    }, [creatorProfile?.latestNotification, currentUser?.uid]);
    const [isSubmittingFilm, setIsSubmittingFilm] = useState(false);
    const [isUploadingPoster, setIsUploadingPoster] = useState(false);
    const [myArenaFilms, setMyArenaFilms] = useState([]); // Tracks Filmmaker's live films
    const [myPendingFilms, setMyPendingFilms] = useState([]); // Tracks films in Admin Queue
    const [editingFilmId, setEditingFilmId] = useState(null); // Tracks if editing a live film
    const [originalFilmType, setOriginalFilmType] = useState(null); // Tracks original monetization status

    // Listen for Filmmaker's Live Arena Films & Pending Submissions
    useEffect(() => {
        // THE FIX: Unlocks the listener for Standard Users hosting Watch Parties
        if (!currentUser) return;

        // 1. Live Films Listener (Handles both owner tags for backwards compatibility)
        const qLive = query(collection(db, "movies"), where("creatorId", "==", currentUser.uid));
        const unsubLive = onSnapshot(qLive, (snap) => {
            const films = snap.docs.map(d => ({id: d.id, ...d.data()}));
            setMyArenaFilms(films);
        });

        // 2. Pending Suggestions Listener
        const qPending = query(collection(db, "movieSuggestions"), where("suggestedBy", "==", currentUser.uid), where("status", "==", "pending"));
        const unsubPending = onSnapshot(qPending, (snap) => setMyPendingFilms(snap.docs.map(d => ({id: d.id, ...d.data()}))));

        return () => { unsubLive(); unsubPending(); };
    }, [currentUser, creatorProfile?.creatorField, creatorProfile?.role]);
    const [editBio, setEditBio] = useState('');
    const [editCreatorField, setEditCreatorField] = useState('');
    const [editExistingWorkLink, setEditExistingWorkLink] = useState('');
    const [showImageAdjustModal, setShowImageAdjustModal] = useState(false);
    const [imageFileToAdjust, setImageFileToAdjust] = useState(null);
    const [isUploadingPFP, setIsUploadingPFP] = useState(false);
    const profilePictureInputRef = useRef(null);
    const appId = "production-app-id";

    // --- GALLERY EXHIBITION STATE ---
    const [isUploadingGallery, setIsUploadingGallery] = useState(false);
    const [uploadingSlot, setUploadingSlot] = useState(null);
    const galleryInputRef = useRef(null);
    const [showGalleryAdjustModal, setShowGalleryAdjustModal] = useState(false);
    const [galleryFileToAdjust, setGalleryFileToAdjust] = useState(null);

    // --- NEW STATE for Account Deletion ---
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteConfirmationText, setDeleteConfirmationText] = useState("");

    // --- MEMOIZED VALUES ---
    const isAdminOrAuthority = useMemo(() => creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority' || creatorProfile?.role === 'super_admin', [creatorProfile]);
    
    const roleColor = ROLE_COLORS[creatorProfile?.creatorField] || '#444444';

    // Opens advanced Creator tools based on chosen field, enrollment, or admin overrides
    const hasCreatorAccess = useMemo(() => {
        if (isAdminOrAuthority) return true;
        
        // Strict Gatekeeper: Creators must record a legal name and birthdate to unlock payouts
        const hasVerifiedIdentity = !!creatorProfile?.realName && !!creatorProfile?.dateOfBirth;
        if (!hasVerifiedIdentity) return false;

        if (enrollmentStatus?.status === 'approved') return true;
        if (creatorProfile?.creatorField) return true; // Unlocked if they chose a specific field
        if (creatorProfile?.isContestant || creatorProfile?.isFilmClub) return true;
        return false;
    }, [isAdminOrAuthority, enrollmentStatus, creatorProfile]);

    

    const statusLower = useMemo(() => enrollmentStatus?.status?.toLowerCase() || '', [enrollmentStatus]);

    // Compute active dismissal dynamically: banner is dismissed only if the current status matches the cached dismissed status
    const isBannerDismissed = useMemo(() => {
        return dismissedStatus === statusLower;
    }, [dismissedStatus, statusLower]);

    // Safe multi-field deep scan (eliminates JSON.stringify to prevent Timestamp crashes)
    const isDocuSeries = useMemo(() => {
        if (!enrollmentStatus) return false;
        const prog = (
            enrollmentStatus.program || 
            enrollmentStatus.type || 
            enrollmentStatus.applicationType || 
            enrollmentStatus.programType || 
            enrollmentStatus.course || 
            ''
        ).toLowerCase();
        const opts = enrollmentStatus.selectedOptions || [];
        const hasDocuOpt = opts.some(o => typeof o === 'string' && o.toLowerCase().includes('docu'));

        return prog.includes('docu') || prog.includes('series') || prog.includes('contestant') || prog.includes('competition') || hasDocuOpt;
    }, [enrollmentStatus]);

    const dashboardOpts = useMemo(() => enrollmentStatus?.selectedOptions || [], [enrollmentStatus]);

    const hasFilmClubOption = useMemo(() => {
        return dashboardOpts.some(o => typeof o === 'string' && o.toLowerCase().includes('film'));
    }, [dashboardOpts]);

    const hasDocuSeriesOption = useMemo(() => {
        return isDocuSeries || dashboardOpts.some(o => typeof o === 'string' && o.toLowerCase().includes('docu'));
    }, [isDocuSeries, dashboardOpts]);

    const isFilmClubUser = useMemo(() => {
        if (creatorProfile?.isFilmClub || creatorProfile?.isClassMember) return true; // Preserve database status
        if (!hasFilmClubOption) return false;
        return statusLower === 'enrolled' || 
               statusLower === 'paid' || 
               statusLower === 'success';
    }, [creatorProfile, statusLower, hasFilmClubOption]);

    const isContestantUser = useMemo(() => {
        if (creatorProfile?.isContestant || (Array.isArray(creatorProfile?.badges) && creatorProfile.badges.includes('Contestant'))) return true; // Preserve database status
        if (!hasDocuSeriesOption) return false;
        return statusLower === 'enrolled' || 
               statusLower === 'paid' || 
               statusLower === 'success';
    }, [creatorProfile, statusLower, hasDocuSeriesOption]);

    const isPending = useMemo(() => {
        return statusLower.includes('pending') || statusLower.includes('review');
    }, [statusLower]);

    const isSettled = useMemo(() => {
        return !isPending && statusLower !== '';
    }, [isPending, statusLower]);

    const shouldShowEnrollmentBanner = useMemo(() => {
        if (isEnrollmentLoading || !enrollmentStatus) return false;
        if (isPending || statusLower === 'approved') return true; 
        if (isSettled) {
            return !isBannerDismissed; 
        }
        return true; 
    }, [isEnrollmentLoading, enrollmentStatus, isPending, isSettled, isBannerDismissed, statusLower]);

    const handleDismissBanner = () => {
        setDismissedStatus(statusLower);
        localStorage.setItem(`nva_banner_dismissed_status_${currentUser?.uid}`, statusLower);
    };

    // --- DATA FETCHING ---
    useEffect(() => {
        if (!currentUser) return;
        
        // 1. Unified Enrollment/Config/History Stream
        const enrollmentRef = doc(db, "enrollmentApplications", currentUser.uid);
        const configRef = doc(db, "settings", "enrollmentConfig");
        const histQuery = query(collection(db, "payoutHistory"), where("userId", "==", currentUser.uid), orderBy("processedAt", "desc"), limit(10));

        const unsubEnrollment = onSnapshot(enrollmentRef, (docSnap) => {
            if (docSnap.exists()) setEnrollmentStatus(docSnap.data());
            else setEnrollmentStatus(null);
            setIsEnrollmentLoading(false);
        });

        const unsubConfig = onSnapshot(configRef, (docSnap) => {
            if (docSnap.exists()) setGlobalConfig(docSnap.data());
        });

        const unsubHistory = onSnapshot(histQuery, (snap) => {
            setPayoutHistory(snap.docs.map(d => ({id: d.id, ...d.data()})));
        });

        // THE FIX: Listen for active, pending Box Office sweeps for this user
        const sweepQuery = query(
            collection(db, "payoutRequests"),
            where("userId", "==", currentUser.uid),
            where("status", "==", "pending"),
            where("type", "==", "boxOfficeSweep")
        );
        const unsubSweep = onSnapshot(sweepQuery, (snap) => {
            setHasPendingSweep(!snap.empty);
        });

        return () => { unsubEnrollment(); unsubConfig(); unsubHistory(); unsubSweep(); };
    }, [currentUser]);

    // --- LIVE BOUND FEATURED VIDEO STATUS LISTENER ---
    const [liveFeaturedItem, setLiveFeaturedItem] = useState(null);

    useEffect(() => {
        if (!creatorProfile?.featuredVideoLink?.liveFeedContentId) {
            setLiveFeaturedItem(null);
            return;
        }
        const docRef = doc(db, `artifacts/production-app-id/public/data/content_items`, creatorProfile.featuredVideoLink.liveFeedContentId);
        const unsubscribe = onSnapshot(docRef, (snap) => {
            if (snap.exists()) {
                setLiveFeaturedItem({ id: snap.id, ...snap.data() });
            } else {
                setLiveFeaturedItem(null);
            }
        });
        return () => unsubscribe();
    }, [creatorProfile?.featuredVideoLink?.liveFeedContentId]);

    useEffect(() => {
        if (creatorProfile) {
            setEditCreatorName(creatorProfile.creatorName || '');
            setEditRealName(creatorProfile.realName || ''); // Syncs Legal Real Name
            setEditDateOfBirth(creatorProfile.dateOfBirth || ''); // Syncs Date of Birth
            setEditBio(creatorProfile.bio || '');
            setEditCreatorField(creatorProfile.creatorField || '');
            setEditExistingWorkLink(creatorProfile.existingWorkLink || '');
            setHasAcceptedLegalTerms(false); // Reset checkbox state on re-entry
        }
    }, [creatorProfile]);

    // --- HELPER FUNCTIONS ---
    const formatDate = (dateValue) => {
        if (!dateValue) return 'N/A';
        const date = dateValue.toDate ? dateValue.toDate() : new Date(dateValue);
        return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    };
    
    // (Legacy Roast Token Handler removed - Logic moved to RoastTokenVault.jsx to prevent duplication/leaks)

    // --- HANDLER FUNCTIONS ---
    const executeSaveProfile = async () => {
        try { 
            const creatorRef = doc(db, "creators", currentUser.uid); 
            const isUpgradingToCreator = !!editCreatorField;
            // Safeguard: Never allow Admin or Authority roles to be overridden/downgraded client-side
            const currentRole = creatorProfile.role;
            const isStaff = currentRole === 'admin' || currentRole === 'authority';
            const newRole = isStaff ? currentRole : (isUpgradingToCreator ? 'creator' : 'user');

            // Calculate exact integer age securely for database storage
            let ageVal = null;
            if (editDateOfBirth) {
                const today = new Date();
                const birthDate = new Date(editDateOfBirth);
                ageVal = today.getFullYear() - birthDate.getFullYear();
                const m = today.getMonth() - birthDate.getMonth();
                if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                    ageVal--;
                }
            }

            await updateDoc(creatorRef, { 
                creatorName: editCreatorName, 
                realName: editRealName, // Saves private legal name
                dateOfBirth: editDateOfBirth || null,
                age: ageVal,
                bio: editBio, 
                creatorField: editCreatorField, 
                role: newRole, 
                existingWorkLink: editExistingWorkLink, 
                updatedAt: new Date().toISOString() 
            }); 
            
            setCreatorProfile(prev => ({ 
                ...prev, 
                creatorName: editCreatorName, 
                realName: editRealName, // Syncs private legal name
                dateOfBirth: editDateOfBirth || null,
                age: ageVal,
                bio: editBio, 
                creatorField: editCreatorField, 
                role: newRole, 
                existingWorkLink: editExistingWorkLink 
            })); 
            
            setIsEditingProfile(false); 
            setShowRoleWarningModal(false);
            showMessage('Profile updated successfully!'); 
        } catch (error) { 
            setShowRoleWarningModal(false);
            showMessage(`Failed to update profile: ${error.message}`); 
        }
    };

    const handleSaveProfile = async () => { 
        if (!editCreatorName.trim()) { showMessage("Artist/Stage Name cannot be empty."); return; } 
        
        const isUpgradingToCreator = !!editCreatorField;
        if (isUpgradingToCreator) {
            if (!editRealName.trim()) {
                showMessage("Legal Real Name is mandatory to unlock creator roles.");
                return;
            }
            if (!editDateOfBirth) {
                showMessage("Date of Birth is mandatory to verify age requirements.");
                return;
            }
            
            // Process exact age evaluation
            const today = new Date();
            const birthDate = new Date(editDateOfBirth);
            let calculatedAge = today.getFullYear() - birthDate.getFullYear();
            const m = today.getMonth() - birthDate.getMonth();
            if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                calculatedAge--;
            }
            
            if (calculatedAge < 18) {
                showMessage("CRITICAL ERROR: You must be at least 18 years old to unlock monetization and creator privileges.");
                return;
            }
            
            if (!hasAcceptedLegalTerms) {
                showMessage("You must agree to the Terms of Service & certify your information is true before saving.");
                return;
            }
        }
        
        // Intercept save if they are selecting or changing their creator field
        if (editCreatorField !== (creatorProfile.creatorField || '')) {
            setShowRoleWarningModal(true);
        } else {
            executeSaveProfile();
        }
    };
    
    const handleCancelEdit = () => { 
        if (creatorProfile) { 
            setEditCreatorName(creatorProfile.creatorName || ''); 
            setEditRealName(creatorProfile.realName || ''); // Resets Legal Real Name
            setEditBio(creatorProfile.bio || ''); 
            setEditCreatorField(creatorProfile.creatorField || ''); 
            setEditExistingWorkLink(creatorProfile.existingWorkLink || ''); 
        } 
        setIsEditingProfile(false); 
    };
    
    const handleProfileFieldChange = (e) => { setEditCreatorField(e.target.value); };
    
    const triggerProfilePictureUpload = (e) => { const file = e.target.files[0]; if (file) { setImageFileToAdjust(file); setShowImageAdjustModal(true); } };
    const handleSaveAdjustedProfilePicture = async (adjustedBlob) => { if (!currentUser || !adjustedBlob) return; setIsUploadingPFP(true); showMessage("Uploading..."); try { const filePath = `profile_pictures/${currentUser.uid}/profile_${Date.now()}.png`; const storageRefPath = ref(storage, filePath); const snapshot = await uploadBytes(storageRefPath, adjustedBlob); const downloadURL = await getDownloadURL(snapshot.ref); const creatorRef = doc(db, "creators", currentUser.uid); await updateDoc(creatorRef, { profilePictureUrl: downloadURL }); setCreatorProfile(prev => ({ ...prev, profilePictureUrl: downloadURL })); setShowImageAdjustModal(false); showMessage("Profile picture updated!"); } catch (error) { showMessage(`Failed to update profile picture: ${error.message}`); } finally { if (profilePictureInputRef.current) { profilePictureInputRef.current.value = null; } setIsUploadingPFP(false); } };
    const handleCancelAdjust = () => { setImageFileToAdjust(null); setShowImageAdjustModal(false); };

    const handleGalleryFileSelect = (e) => {
        const file = e.target.files[0];
        if (file && uploadingSlot !== null) {
            setGalleryFileToAdjust(file);
            setShowGalleryAdjustModal(true);
        }
    };

    const handleSaveAdjustedGalleryImage = async (adjustedBlob) => {
        if (!currentUser || !adjustedBlob || uploadingSlot === null) return;
        setIsUploadingGallery(true);
        showMessage("Uploading to gallery...");
        try {
            // THE FIX: Exact slot overwrite. No timestamps in path = zero dust/excess photos!
            const filePath = `studio_galleries/${currentUser.uid}/slot_${uploadingSlot}.jpg`;
            const storageRefPath = ref(storage, filePath);
            const snapshot = await uploadBytes(storageRefPath, adjustedBlob);
            // Append timestamp to URL so the browser loads the fresh image instead of the cached old one
            const downloadURL = (await getDownloadURL(snapshot.ref)) + `?v=${Date.now()}`;
            
            const currentGallery = creatorProfile.studioGallery || {};
            currentGallery[uploadingSlot] = downloadURL;

            const creatorRef = doc(db, "creators", currentUser.uid);
            await updateDoc(creatorRef, { studioGallery: currentGallery });
            
            setCreatorProfile(prev => ({ ...prev, studioGallery: currentGallery }));
            showMessage("Gallery updated successfully!");
            setShowGalleryAdjustModal(false);
        } catch (error) {
            showMessage(`Gallery upload failed: ${error.message}`);
        } finally {
            setIsUploadingGallery(false);
            setUploadingSlot(null);
            setGalleryFileToAdjust(null);
            if (galleryInputRef.current) galleryInputRef.current.value = null;
        }
    };

    const handleCancelGalleryAdjust = () => {
        setGalleryFileToAdjust(null);
        setShowGalleryAdjustModal(false);
        setUploadingSlot(null);
        if (galleryInputRef.current) galleryInputRef.current.value = null;
    };

    const handleShareGallery = (e) => {
        e.stopPropagation();
        if (!currentUser?.uid) return;
        
        const shareUrl = `${window.location.origin}/user/${currentUser.uid}/gallery`;
        const text = `🎨 View my Exhibition Room on NVA Network:`;

        if (navigator.share) {
            navigator.share({ title: `${creatorProfile.creatorName || 'My'} Exhibition`, text, url: shareUrl }).catch(() => {});
        } else {
            navigator.clipboard.writeText(`${text}\n${shareUrl}`).then(() => showMessage("Link copied!")).catch(() => {});
        }
    };

    const deleteGalleryImage = (slot) => {
        setConfirmationTitle("Remove Image?");
        setConfirmationMessage("Remove this image from your exhibition? This action cannot be undone.");
        setOnConfirmationAction(() => async () => {
            try {
                const currentGallery = { ...creatorProfile.studioGallery };
                currentGallery[slot] = null; 
                const creatorRef = doc(db, "creators", currentUser.uid);
                await updateDoc(creatorRef, { studioGallery: currentGallery });
                setCreatorProfile(prev => ({ ...prev, studioGallery: currentGallery }));
                showMessage("Image removed.");
            } catch (error) {
                showMessage(`Removal failed: ${error.message}`);
            }
        });
        setShowConfirmationModal(true);
    };

    const handleVideoUrlChange = (e) => {
        const url = e.target.value;
        setFilmForm(prev => ({ ...prev, videoUrl: url }));
        if (url) {
            const info = extractVideoInfo(url);
            if (info && info.thumbnailUrl && info.platform !== 'generic') {
                setFilmForm(prev => ({ ...prev, posterUrl: info.thumbnailUrl }));
                showMessage("Thumbnail automatically pulled from video link!");
            }
        }
    };

    const handlePosterUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setIsUploadingPoster(true);
        try {
            const fileRef = ref(storage, `showcase_posters/${currentUser.uid}_${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(fileRef, file);
            const url = await getDownloadURL(snapshot.ref);
            setFilmForm(prev => ({ ...prev, posterUrl: url }));
            showMessage("Movie poster uploaded successfully!");
        } catch (err) {
            showMessage("Poster upload failed: " + err.message);
        } finally {
            setIsUploadingPoster(false);
        }
    };

    const handleFilmSubmit = async (e) => {
        e.preventDefault();
        if (!filmForm.posterUrl) return showMessage("A movie poster is mandatory.");
        if (!filmForm.type) return showMessage("Please select a release strategy.");
        
        setIsSubmittingFilm(true);
        try {
            if (filmForm.type === 'premiere') {
                const reqTime = new Date(filmForm.premiereDate).getTime();
                const threeHours = 3 * 60 * 60 * 1000;
                const qMovies = query(collection(db, "movies"), where("room", "==", filmForm.room));
                const snapMovies = await getDocs(qMovies);
                for (let d of snapMovies.docs) {
                    const data = d.data();
                    if (data.premiereDate && Math.abs(new Date(data.premiereDate).getTime() - reqTime) < threeHours && d.id !== editingFilmId) {
                        setIsSubmittingFilm(false);
                        return showMessage(`❌ Room is booked.`);
                    }
                }
            }

            if (editingFilmId) {
                if (filmForm.type === originalFilmType || filmForm.type === 'free') {
                    await updateDoc(doc(db, "movies", editingFilmId), {
                        title: filmForm.title, genre: filmForm.genre, synopsis: filmForm.synopsis,
                        credits: filmForm.credits, videoUrl: filmForm.videoUrl, trailerUrl: filmForm.trailerUrl || null, posterUrl: filmForm.posterUrl,
                        type: filmForm.type, premiereDate: filmForm.premiereDate || null, room: filmForm.room || 'Room 1'
                    });
                    showMessage("Details updated!");
                } else {
                    await addDoc(collection(db, "movieSuggestions"), {
                        ...filmForm, creatorId: currentUser.uid, suggestedBy: currentUser.uid,
                        suggestedByName: creatorProfile.creatorName, status: "pending", timestamp: new Date().toISOString()
                    });
                    await deleteDoc(doc(db, "movies", editingFilmId));
                    showMessage("Monetization requested!");
                }
            } else {
                await addDoc(collection(db, "movieSuggestions"), {
                    ...filmForm, creatorId: currentUser.uid, suggestedBy: currentUser.uid,
                    suggestedByName: creatorProfile.creatorName, status: "pending", timestamp: new Date().toISOString()
                });
                showMessage("Submitted to Admin Queue!");
            }
            setShowFilmOfficeModal(false);
            setEditingFilmId(null);
            setFilmForm({ title: '', genre: 'Drama', synopsis: '', credits: '', videoUrl: '', trailerUrl: '', posterUrl: '', type: '', premiereDate: '', room: 'Room 1', ticketPrice: '5.00' });
        } catch (error) {
            showMessage(`Submission failed: ${error.message}`);
        } finally {
            setIsSubmittingFilm(false);
        }
    };

    const handleDeleteAccount = async () => {
        setIsDeleting(true);
        showMessage("Processing account deletion...");
        try {
            const deleteOwnAccount = httpsCallable(functions, 'deleteOwnAccount');
            await deleteOwnAccount();
        } catch (error) {
            showMessage(`Error: ${error.message}`);
            setIsDeleting(false);
        }
    };

    const hasActiveOrUpcomingPremiere = useMemo(() => {
        const liveLock = myArenaFilms.some(film => {
            if (film.type !== 'premiere' || !film.premiereDate) return false;
            const premiereTime = new Date(film.premiereDate).getTime();
            const lockDuration = 72 * 60 * 60 * 1000;
            return Date.now() < (premiereTime + lockDuration);
        });
        const profileLockTime = creatorProfile?.payoutLockUntil ? (creatorProfile.payoutLockUntil.toDate ? creatorProfile.payoutLockUntil.toDate().getTime() : new Date(creatorProfile.payoutLockUntil).getTime()) : 0;
        return liveLock || (Date.now() < profileLockTime);
    }, [myArenaFilms, creatorProfile?.payoutLockUntil]);

    const subExpiryData = useMemo(() => {
        if (!creatorProfile?.subscriptionExpiresAt || !creatorProfile?.isFilmClub || creatorProfile?.badges?.includes("Gold Club")) return null;
        const expiry = new Date(creatorProfile.subscriptionExpiresAt).getTime();
        const now = Date.now();
        const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
        const graceDays = Math.ceil(((expiry + (3 * 24 * 60 * 60 * 1000)) - now) / (1000 * 60 * 60 * 24));
        return { diffDays, graceDays, isExpired: now > expiry, expiryStatus: now > expiry ? 'expired' : 'warning' };
    }, [creatorProfile]);

    if (!creatorProfile) {
        return <div className="screenContainer" style={{ textAlign: 'center', paddingTop: '50px' }}><p className="heading">Loading Your Dashboard...</p></div>;
    }

    // --- RENDER ---
    const modernButtonStyles = `
        /* --- MODAL BUTTON MODERNIZATION --- */
        .confirmationButton { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 12px !important; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 900 !important; font-size: 11px !important; padding: 10px 15px !important; flex: 1; min-width: 120px; }
        .confirmationModalButtons { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
        .confirmationButton.confirm { background: rgba(255, 215, 0, 0.1) !important; border: 1px solid rgba(255, 215, 0, 0.3) !important; color: #FFD700 !important; backdrop-filter: blur(10px); }
        .confirmationButton.confirm:hover { background: rgba(255, 215, 0, 0.2) !important; border-color: #FFD700 !important; }
        .confirmationButton.confirm:active { background: #FFD700 !important; color: #000 !important; box-shadow: 0 0 30px rgba(255, 215, 0, 0.5) !important; transform: scale(0.95); }
        /* --- REWARDS & UI STYLES --- */
        .rewards-stats-card { background: rgba(30, 30, 30, 0.7); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 20px; display: flex; justify-content: space-between; margin-bottom: 24px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); backdrop-filter: blur(10px); }
        .rewards-stat-col { text-align: center; flex: 1; border-right: 1px solid rgba(255, 255, 255, 0.1); }
        .rewards-stat-col:last-child { border-right: none; }
        .rewards-stat-value { font-size: 24px; font-weight: bold; color: #00FFFF; margin: 0; }
        .rewards-stat-value.gold { color: #FFD700; }
        .rewards-stat-label { font-size: 11px; color: #AAA; text-transform: uppercase; margin-top: 5px; letter-spacing: 0.5px; }
        .leaderboard-card { background: rgba(20, 20, 20, 0.8); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 20px; margin-bottom: 24px; }
        .leaderboard-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.1); padding-bottom: 10px; margin-bottom: 15px; }
        .leaderboard-title { color: #FFF; font-size: 14px; font-weight: bold; margin: 0; display: flex; align-items: center; gap: 8px; }
        .leaderboard-subtitle { color: #888; font-size: 11px; margin: 0; }
        .leaderboard-row { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); }
        .leaderboard-row:last-child { border-bottom: none; }
        .rank-circle { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 12px; margin-right: 12px; }
        .rank-1 { background: #FFD700; color: #000; }
        .rank-2 { background: #C0C0C0; color: #000; }
        .rank-3 { background: #CD7F32; color: #000; }
        .rank-other { background: #333; color: #AAA; }
        .supporter-info { display: flex; align-items: center; }
        .supporter-name { color: #DDD; font-size: 14px; font-weight: 500; }
        .supporter-amount { color: #FFD700; font-size: 14px; font-weight: bold; }
        
        /* --- CORE MODAL STYLES --- */
        .modal-backdrop { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background-color: rgba(0, 0, 0, 0.8); display: flex; justify-content: center; align-items: center; z-index: 1000; backdrop-filter: blur(5px); }
        .modal-content { background-color: #1E1E1E; border-radius: 12px; border: 1px solid #444; box-shadow: 0 5px 25px rgba(0,0,0,0.5); padding: 0; width: 90%; max-width: 480px; }
        .modal-header { padding: 15px 20px; border-bottom: 1px solid #333; display: flex; justify-content: center; align-items: center; position: relative; }
        .modal-title { margin: 0; font-size: 1.5rem; font-weight: bold; color: #FFFFFF; text-align: center; }
        .modal-close-button { position: absolute; right: 15px; top: 50%; transform: translateY(-50%); background: none; border: none; font-size: 2rem; color: #888; cursor: pointer; }
        .modal-close-button:hover { color: #FFF; }
        .modal-body { padding: 20px 25px; }
        .modal-footer { padding: 15px 25px; border-top: 1px solid #333; display: flex; justify-content: flex-end; gap: 10px; }
        .invoice-style-box { background-color: rgba(0, 0, 0, 0.3); border-radius: 8px; padding: 20px; border: 1px solid #444; margin-bottom: 25px; }
        .invoice-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; font-size: 1rem; }
        .invoice-row:last-child { margin-bottom: 0; }
        
        /* --- BUTTONS --- */
        .modern-button { border: 1px solid rgba(255, 255, 255, 0.7); color: #FFFFFF; font-weight: bold; transition: all 0.2s ease-in-out; padding: 6px 12px; font-size: 12px; border-radius: 20px; }
        .modern-button:hover { color: #FFFFFF; border-color: #FFFFFF; }
        .modern-button.delete { background-color: rgba(220, 53, 69, 0.25); border-color: rgba(220, 53, 69, 0.7); }
        .modern-button.delete:hover { background-color: rgba(220, 53, 69, 0.4); border-color: #f5c6cb; }
        .modern-button.delete:active { box-shadow: 0 0 15px 3px rgba(220, 53, 69, 0.6); border-color: rgba(220, 53, 69, 0.8); transform: scale(0.98); }
        .modern-button.end-early { background-color: rgba(75, 0, 130, 0.25); border-color: rgba(123, 104, 238, 0.7); }
        .modern-button.end-early:hover { background-color: rgba(75, 0, 130, 0.4); border-color: #c6bfff; }
        .modern-button.end-early:active { box-shadow: 0 0 15px 3px rgba(75, 0, 130, 0.7); border-color: rgba(123, 104, 238, 0.8); transform: scale(0.98); }
        .modern-button.payout { background-color: rgba(0, 255, 255, 0.15); border-color: rgba(0, 200, 200, 0.7); }
        .modern-button.payout:hover { background-color: rgba(0, 255, 255, 0.25); border-color: #82fafa; }
        .modern-button.payout:active { box-shadow: 0 0 15px 3px rgba(0, 255, 255, 0.6); border-color: rgba(0, 255, 255, 0.8); transform: scale(0.98); }
        .profile-edit-button { background-color: transparent; border-radius: 6px; padding: 8px 16px; font-weight: bold; font-size: 14px; cursor: pointer; transition: all 0.2s ease-in-out; margin-left: 10px; }
        .profile-edit-button.save { border: 1px solid #FFD700; color: #FFD700; }
        .profile-edit-button.save:hover { background-color: rgba(255, 215, 0, 0.1); box-shadow: 0 0 8px rgba(255, 215, 0, 0.5); }
        .profile-edit-button.cancel { border: 1px solid #555; color: #AAA; }
        .profile-edit-button.cancel:hover { background-color: #333; border-color: #777; color: #FFF; }

        /* --- MODAL BUTTON MODERNIZATION --- */
        .confirmationButton { transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); border-radius: 12px !important; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 900 !important; font-size: 10px !important; padding: 10px 15px !important; flex: 1; min-width: 120px; }
        .confirmationModalButtons { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
        .confirmationButton.confirm { 
            background: rgba(255, 215, 0, 0.1) !important; 
            border: 1px solid rgba(255, 215, 0, 0.3) !important; 
            color: #FFD700 !important; 
            backdrop-filter: blur(10px);
        }
        .confirmationButton.confirm:hover { background: rgba(255, 215, 0, 0.2) !important; border-color: #FFD700 !important; }
        .confirmationButton.confirm:active { 
            background: #FFD700 !important; 
            color: #000 !important; 
            box-shadow: 0 0 30px rgba(255, 215, 0, 0.5) !important;
            transform: scale(0.95);
        }

        /* --- CINEMATIC MY HUB UI STYLES --- */
        .glass-panel {
            background: rgba(30, 30, 30, 0.5);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 24px;
            box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.3);
        }
        .wallet-card {
            background: linear-gradient(135deg, #1A1A1A 0%, #0A0A0A 100%);
            border-left: 4px solid #FFD700;
            border-radius: 12px;
            padding: 20px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 24px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.5);
        }
        .wallet-title {
            font-size: 14px;
            color: #AAA;
            margin: 0 0 5px 0;
            text-transform: uppercase;
            letter-spacing: 1px;
        }
        .wallet-value {
            font-size: 28px;
            font-weight: bold;
            color: #FFF;
            margin: 0;
        }
        .badge-pill {
            background: rgba(255, 215, 0, 0.15);
            border: 1px solid rgba(255, 215, 0, 0.5);
            color: #FFD700;
            padding: 4px 10px;
            border-radius: 20px;
            font-size: 11px;
            font-weight: bold;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }

        /* --- UNIFIED PERFORMANCE & ANALYTICS STYLES --- */
        .analytics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 12px; }
        .analytics-card { background: rgba(30, 30, 30, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 16px; text-align: center; backdrop-filter: blur(12px); box-shadow: 0 4px 15px rgba(0,0,0,0.3); transition: transform 0.2s ease; }
        .analytics-card:hover { transform: translateY(-2px); border-color: rgba(255, 215, 0, 0.3); }
        .analytics-val { font-size: 20px; font-weight: bold; color: #FFF; margin: 0; }
        .analytics-val.gold { color: #FFD700; text-shadow: 0 0 8px rgba(255, 215, 0, 0.3); }
        .analytics-label { font-size: 10px; color: #888; text-transform: uppercase; margin-top: 4px; letter-spacing: 0.05em; font-weight: 700; }
        .analytics-sub-val { font-size: 11px; color: #AAA; margin-top: 4px; display: flex; justify-content: center; gap: 8px; }

        /* --- GHOST EMBER IGNITION LOGIC --- */
        .roast-ignite-btn {
            background: rgba(0, 0, 0, 0.6) !important;
            color: #FF4500 !important;
            border: 1px solid #FF4500 !important;
            box-shadow: inset 0 0 10px rgba(255, 69, 0, 0.1) !important;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1) !important;
        }
        .roast-ignite-btn:hover {
            background: #FF4500 !important;
            color: #000 !important;
            box-shadow: 0 0 25px rgba(255, 69, 0, 0.5), inset 0 0 10px rgba(0,0,0,0.2) !important;
            transform: scale(1.01);
        }

        /* ===== STUDIO GALLERY (PINTEREST MASONRY) ===== */
        .studio-gallery-grid { display: grid; grid-template-columns: repeat(4, 1fr); grid-auto-rows: 100px; gap: 12px; margin-top: 15px; }
        .gallery-slot { background: rgba(0,0,0,0.5); border-radius: 16px; overflow: hidden; position: relative; border: 1px solid rgba(255,255,255,0.05); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
        .gallery-slot:hover { border-color: rgba(255,215,0,0.5); box-shadow: 0 0 15px rgba(255,215,0,0.2); }
        .gallery-slot img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.5s ease; }
        .gallery-slot:hover img { transform: scale(1.05); }
        .slot-0 { grid-column: span 2; grid-row: span 3; } 
        .slot-1 { grid-column: span 2; grid-row: span 1; } 
        .slot-2 { grid-column: span 1; grid-row: span 2; } 
        .slot-3 { grid-column: span 1; grid-row: span 2; } 
        .slot-4 { grid-column: span 4; grid-row: span 1; }
        @media (max-width: 768px) { .studio-gallery-grid { grid-auto-rows: 70px; gap: 8px; } }
    `;

    return (
        <>
            <style>{modernButtonStyles}</style>
            <div className="screenContainer">
                
                <p className="heading" style={{fontSize: '2rem', marginBottom: '5px'}}>My Hub</p>
                <p className="subHeading" style={{color: '#AAA'}}>Welcome back, {creatorProfile.creatorName || currentUser.email}</p>

                {/* === FILM CLUB RENEWAL BANNERS === */}
                {subExpiryData && (
                    <>
                        {/* 1. WARNING BANNER (Cyan, 7 days before, Dismissible) */}
                        {!subExpiryData.isExpired && subExpiryData.diffDays <= 7 && dismissedStatus !== 'sub_warning' && (
                            <div className="dashboardSection" style={{ border: '1px solid #00FFFF', backgroundColor: 'rgba(0, 255, 255, 0.05)', position: 'relative' }}>
                                <button onClick={() => { setDismissedStatus('sub_warning'); localStorage.setItem(`nva_banner_dismissed_status_${currentUser?.uid}`, 'sub_warning'); }} style={{ position: 'absolute', top: '10px', right: '10px', background: 'transparent', border: 'none', color: '#00FFFF', cursor: 'pointer', fontSize: '1.2rem' }}>&times;</button>
                                <p className="dashboardSectionTitle" style={{ color: '#00FFFF' }}>📅 Subscription Renewal</p>
                                <p className="paragraph" style={{ margin: '0 0 10px 0', fontSize: '13px' }}>Your Film Club access expires in <strong>{subExpiryData.diffDays} days</strong>. Renew now to maintain your status.</p>
                                <button className="button" style={{ backgroundColor: '#00FFFF', color: '#0A0A0A', fontWeight: 'bold', margin: 0, padding: '8px 16px', fontSize: '13px' }} onClick={() => setActiveScreen('EnrollmentPayment')}>Renew Now</button>
                            </div>
                        )}

                        {/* 2. GRACE PERIOD BANNER (Red, Post-Expiry, NOT Dismissible) */}
                        {subExpiryData.isExpired && subExpiryData.graceDays > 0 && (
                            <div className="dashboardSection" style={{ border: '1px solid #DC3545', backgroundColor: 'rgba(220, 53, 69, 0.15)', position: 'relative' }}>
                                <p className="dashboardSectionTitle" style={{ color: '#DC3545' }}>🚨 Grace Period Active</p>
                                <p className="paragraph" style={{ margin: '0 0 10px 0', fontSize: '13px' }}>Your subscription has expired. You have <strong>{subExpiryData.graceDays} days</strong> to renew before your badges are automatically stripped.</p>
                                <button className="button" style={{ backgroundColor: '#DC3545', color: '#FFF', fontWeight: 'bold', margin: 0, padding: '8px 16px', fontSize: '13px' }} onClick={() => setActiveScreen('EnrollmentPayment')}>Renew Immediately</button>
                            </div>
                        )}
                    </>
                )}

                {/* === START: NVA ENROLLMENT STATUS PANEL === */}
                {shouldShowEnrollmentBanner && (
                    <div className="dashboardSection" style={{ border: '1px solid #FFD700', backgroundColor: 'rgba(255, 215, 0, 0.05)', position: 'relative' }}>
                        <p className="dashboardSectionTitle" style={{ color: '#FFD700' }}>
                            {hasDocuSeriesOption ? "Docu-Series Registration Status" : "Film Club Enrollment Status"}
                        </p>
                        
                        {/* Close button rendered for settled statuses (except approved where payment is required) */}
                        {isSettled && statusLower !== 'approved' && (
                            <button 
                                onClick={handleDismissBanner} 
                                style={{ position: 'absolute', top: '15px', right: '15px', background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2rem' }}
                                aria-label="Close"
                            >
                                &times;
                            </button>
                        )}

                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '15px' }}>
                            <p className="dashboardItem" style={{ margin: 0 }}>
                                Your {isDocuSeries ? "registration" : "enrollment"} status is: <strong style={{ textTransform: 'capitalize' }}>{enrollmentStatus.status}</strong>
                            </p>
                            {statusLower === 'approved' && (
                                <button className="dashboardButton" onClick={() => setActiveScreen('EnrollmentPayment')}>
                                    Make {isDocuSeries ? "Registration" : "Enrollment"} Payment
                                </button>
                            )}
                        </div>
                    </div>
                )}
                {/* === END: NVA ENROLLMENT STATUS PANEL === */}

                {/* === CINEMATIC PROFILE PANEL === */}
                 <div className="glass-panel" style={{ padding: '30px 20px', position: 'relative', background: `linear-gradient(180deg, ${roleColor}22 0%, #1A1A1A 100%)`, border: `1px solid ${roleColor}44` }}>
                    {/* EDIT BUTTON ALWAYS TOP RIGHT */}
                    <div style={{ position: 'absolute', top: '15px', right: '15px', zIndex: 10 }}>
                        {!isEditingProfile ? (
                            <button className="dashboardButton" onClick={() => setIsEditingProfile(true)}>Edit Profile</button>
                        ) : (
                            <div style={{ display: 'flex', gap: '5px' }}>
                                <button className="profile-edit-button cancel" onClick={handleCancelEdit}>Cancel</button>
                                <button className="profile-edit-button save" onClick={handleSaveProfile}>Save</button>
                            </div>
                        )}
                    </div>

                    <div className="pt-2">
                         {isEditingProfile ? (
                             <div style={{ marginTop: '30px' }}>
                                <div className="formGroup">
                                    <label htmlFor="editCreatorName" className="formLabel">Artist Name / Stage Name:</label>
                                    <p style={{ color: '#888', fontSize: '11px', margin: '0 0 6px 0' }}>This is your public stage/brand name visible to the entire community.</p>
                                    <input type="text" id="editCreatorName" className="formInput" value={editCreatorName || ''} onChange={(e) => setEditCreatorName(e.target.value)} required />
                                </div>
                                <div className="formGroup">
                                    <label htmlFor="editRealName" className="formLabel">Legal Real Name (First & Last Name):</label>
                                    <p style={{ color: '#888', fontSize: '11px', margin: '0 0 6px 0' }}>Strictly used for private, bank-grade Mobile Money Guyana (MMG) payout verification. This remains completely hidden from the public.</p>
                                    <input 
                                        type="text" 
                                        id="editRealName" 
                                        className="formInput" 
                                        value={editRealName || ''} 
                                        onChange={(e) => setEditRealName(e.target.value)} 
                                        placeholder="e.g. John Doe" 
                                        disabled={!!creatorProfile.realName}
                                        style={!!creatorProfile.realName ? { backgroundColor: '#333', color: '#888', cursor: 'not-allowed' } : {}}
                                    />
                                </div>
                                <div className="formGroup">
                                    <label htmlFor="editDateOfBirth" className="formLabel">Date of Birth:</label>
                                    <p style={{ color: '#888', fontSize: '11px', margin: '0 0 6px 0' }}>Mandatory. Strictly used to verify legal age requirements (18+) for receiving payouts [1.1.6].</p>
                                    <input 
                                        type="date" 
                                        id="editDateOfBirth" 
                                        className="formInput" 
                                        value={editDateOfBirth || ''} 
                                        onChange={(e) => setEditDateOfBirth(e.target.value)} 
                                        onClick={(e) => !creatorProfile.dateOfBirth && e.target.showPicker && e.target.showPicker()} 
                                        disabled={!!creatorProfile.dateOfBirth}
                                        style={!!creatorProfile.dateOfBirth ? { backgroundColor: '#333', color: '#888', cursor: 'not-allowed' } : {}}
                                    />
                                </div>
                                <div className="formGroup"><label htmlFor="editBio" className="formLabel">Bio:</label><textarea id="editBio" className="formTextarea" value={editBio || ''} onChange={(e) => setEditBio(e.target.value)}></textarea></div>
                                <div className="formGroup">
                                    <label htmlFor="editCreatorField" className="formLabel" style={{color: '#FFD700'}}>Creator Role (Only 1 Allowed):</label>
                                    <select 
                                        id="editCreatorField" 
                                        className="formInput" 
                                        value={editCreatorField || ''} 
                                        onChange={handleProfileFieldChange}
                                        disabled={!!creatorProfile.creatorField} // Greyed out if already chosen
                                        style={!!creatorProfile.creatorField ? { backgroundColor: '#333', color: '#888', cursor: 'not-allowed' } : {}}
                                    >
                                        <option value="">-- Normal User --</option>
                                        {MASTER_CREATOR_FIELDS.map(field => (
                                            <option key={field} value={field}>{field}</option>
                                        ))}
                                    </select>
                                    <p className="smallText" style={{marginTop: '5px', color: !!creatorProfile.creatorField ? '#00FFFF' : '#FFD700'}}>
                                        {!!creatorProfile.creatorField 
                                            ? "🔒 This choice is final. Contact support to request a role change." 
                                            : "⚠️ Choose carefully! Once saved, your creator role is permanent and cannot be changed."}
                                    </p>
                                </div>
                                <div className="formGroup"><label htmlFor="editExistingWork" className="formLabel">External Link (Optional):</label><input type="text" id="editExistingWork" className="formInput" value={editExistingWorkLink || ''} onChange={(e) => setEditExistingWorkLink(e.target.value)} placeholder="e.g., instagram.com/mywork" /></div>
                                
                                {editCreatorField && (!creatorProfile.realName || !creatorProfile.dateOfBirth) && (
                                    <div className="formGroup" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginTop: '15px', background: 'rgba(255,215,0,0.05)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(255,215,0,0.15)' }}>
                                        <input 
                                            type="checkbox" 
                                            id="legalConsentCheck" 
                                            checked={hasAcceptedLegalTerms} 
                                            onChange={(e) => setHasAcceptedLegalTerms(e.target.checked)} 
                                            style={{ marginTop: '4px', cursor: 'pointer', accentColor: '#FFD700' }} 
                                        />
                                        <label htmlFor="legalConsentCheck" style={{ fontSize: '11px', color: '#DDD', cursor: 'pointer', lineHeight: '1.4' }}>
                                            I hereby solemnly declare and affirm that the legal real name and date of birth provided above are completely true, accurate, and correct. I acknowledge and agree that providing false identity information constitutes a violation of the NVA Network Terms of Service and will result in the immediate forfeiture of all platform earnings and permanent account termination.
                                        </label>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <>
                                {/* --- MODERN CENTERED HUB PROFILE --- */}
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                                    <div style={{ position: 'relative', marginBottom: '15px' }}>
                                        <img src={creatorProfile.profilePictureUrl || 'https://placehold.co/120x120/555/FFF?text=P'} alt="Profile" style={{ width: '110px', height: '110px', borderRadius: '50%', border: '3px solid #FFD700', objectFit: 'cover', boxShadow: '0 0 20px rgba(255,215,0,0.3)' }} />
                                        <input type="file" ref={profilePictureInputRef} onChange={triggerProfilePictureUpload} accept="image/*" style={{ display: 'none' }} />
                                        <button onClick={() => profilePictureInputRef.current.click()} style={{backgroundColor: '#FFD700', color: '#0A0A0A', width: '32px', height: '32px', borderRadius: '50%', border: 'none', cursor: 'pointer', position: 'absolute', bottom: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', boxShadow: '0 2px 5px rgba(0,0,0,0.5)'}}>✏️</button>
                                    </div>
                                    
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', margin: '0 0 5px 0', width: '100%' }}>
                                        <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#FFF' }}>
                                            {creatorProfile.creatorName}
                                        </span>
                                        {renderPatronStripe(creatorProfile)}
                                        <RoleBadge profile={{
                                            ...creatorProfile,
                                            isFilmClub: isFilmClubUser,
                                            isContestant: isContestantUser
                                        }} />
                                    </div>
                                    {creatorProfile.realName && (
                                        <p style={{ fontSize: '11px', color: '#666', margin: '0 0 8px 0', fontStyle: 'italic' }} title="Strictly private legal name">
                                            Verified Legal Name: {creatorProfile.realName}
                                        </p>
                                    )}
                                    {renderGlobalPatronGifts(creatorProfile)}
                                    <p style={{ color: '#AAA', fontSize: '13px', maxWidth: '85%', margin: '0 auto 10px auto', lineHeight: '1.4' }}>
                                        {creatorProfile.bio || "No bio set. Click edit profile to add one."}
                                    </p>

                                    {/* THE FIX: Dynamic Private Ticket Badge Row */}
                                    {myTickets.length > 0 && (
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', marginBottom: '15px' }}>
                                            {myTickets.map(tix => (
                                                <span key={tix.id} style={{ backgroundColor: '#FFFFFF', color: '#0A0A0A', padding: '4px 10px', fontSize: '10px', fontWeight: '900', borderRadius: '6px', display: 'inline-flex', alignItems: 'center', gap: '6px', border: '1px solid #AAAAAA', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                                    🎟️ TICKET SECURED: {tix.eventTitle || tix.title}
                                                </span>
                                            ))}
                                        </div>
                                    )}

                                    {/* --- FOLLOW STATS --- */}
                                    <div style={{ display: 'flex', justifyContent: 'center', gap: '30px', marginTop: '10px', padding: '15px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', width: '100%', maxWidth: '300px' }}>
                                        <div className="follow-stat-item" style={{textAlign: 'center', cursor: 'pointer'}} onClick={() => setActiveScreen('Followers')}><span style={{display: 'block', fontSize: '18px', fontWeight: 'bold', color: '#FFF'}}>{creatorProfile.followerCount || 0}</span><span style={{fontSize: '11px', color: '#888', textTransform: 'uppercase'}}>Followers</span></div>
                                        <div className="follow-stat-item" style={{textAlign: 'center', cursor: 'pointer'}} onClick={() => setActiveScreen('MyFollows')}><span style={{display: 'block', fontSize: '18px', fontWeight: 'bold', color: '#FFF'}}>{creatorProfile.followingCount || 0}</span><span style={{fontSize: '11px', color: '#888', textTransform: 'uppercase'}}>Following</span></div>
                                    </div>
                                    
                                    {creatorProfile.existingWorkLink && (
                                        <p style={{marginTop: '15px', fontSize: '13px'}}>
                                            <a href={creatorProfile.existingWorkLink} target="_blank" rel="noopener noreferrer" className="termsLink">🔗 {creatorProfile.existingWorkLink}</a>
                                        </p>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* === PROMINENT UPGRADE CARD FOR NORMAL USERS === */}
                {!hasCreatorAccess && (
                    <div className="dashboardSection" style={{ border: '1px dashed #00FFFF', background: 'rgba(0, 255, 255, 0.05)', textAlign: 'center', padding: '25px', marginTop: '20px' }}>
                        <p style={{ fontSize: '18px', fontWeight: 'bold', color: '#00FFFF', margin: '0 0 10px 0' }}>Ready to Share Your Talent?</p>
                        <p style={{ color: '#AAA', fontSize: '13px', marginBottom: '20px' }}>Upgrade to a Creator Role to unlock your content library, leaderboard stats, and creator tools.</p>
                        {!isEditingProfile ? (
                            <button className="button" onClick={() => setIsEditingProfile(true)} style={{ backgroundColor: '#00FFFF', color: '#0A0A0A', margin: '0 auto', display: 'block', fontWeight: 'bold', border: 'none' }}>
                                Choose a Creator Role
                            </button>
                        ) : (
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', width: '100%', maxWidth: '300px', margin: '0 auto' }}>
                                <button className="profile-edit-button cancel" onClick={handleCancelEdit} style={{ flex: 1, margin: 0 }}>Cancel</button>
                                <button className="profile-edit-button save" onClick={handleSaveProfile} style={{ flex: 1, margin: 0, backgroundColor: '#00FFFF', color: '#0A0A0A', borderColor: '#00FFFF' }}>Save Profile</button>
                            </div>
                        )}
                    </div>
                )}

                {/* === START: BADGE-BASED CONTENT SECTIONS === */}
                {hasCreatorAccess && (
                    <>
                        {/* === UNIFIED PERFORMANCE & ANALYTICS CONTROL CENTER === */}
                        <p className="dashboardSectionTitle" style={{ color: '#FFD700', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>📊 Creator Performance & Analytics</p>
                        
                        {/* THE FIX: Financial Eligibility Controller & Payout Request Trigger */}
                        {(() => {
                            const MIN_PAYOUT = 10000;
                            const COOLDOWN_DAYS = 30;
                            const currentEarnings = creatorProfile.totalEarnings || 0;
                            
                            const lastPayout = creatorProfile.lastPayoutDate ? (creatorProfile.lastPayoutDate.toDate ? creatorProfile.lastPayoutDate.toDate() : new Date(creatorProfile.lastPayoutDate)) : new Date(0);
                            const nextEligibleDate = new Date(lastPayout.getTime() + (COOLDOWN_DAYS * 24 * 60 * 60 * 1000));
                            const daysRemaining = Math.ceil((nextEligibleDate - new Date()) / (1000 * 60 * 60 * 24));
                            const isTimeEligible = daysRemaining <= 0;

                            const isMoneyEligible = currentEarnings >= MIN_PAYOUT;
                            const moneyProgress = Math.min((currentEarnings / MIN_PAYOUT) * 100, 100);
                            const hasActiveRequest = creatorProfile.payoutStatus === 'pending' || creatorProfile.payoutStatus === 'approved';

                            return (
                                <div style={{ 
                                    background: 'rgba(20, 20, 20, 0.6)', 
                                    backdropFilter: 'blur(15px)', 
                                    border: '1px solid rgba(255, 255, 255, 0.1)', 
                                    borderRadius: '20px', 
                                    padding: '30px', 
                                    marginBottom: '30px',
                                    boxShadow: '0 10px 40px rgba(0,0,0,0.4)'
                                }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '25px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <span style={{ fontSize: '24px' }}>🏦</span>
                                            <p style={{ margin: 0, color: '#FFF', fontWeight: '800', fontSize: '18px', letterSpacing: '0.5px' }}>Payout Eligibility</p>
                                        </div>
                                        <div style={{ 
                                            padding: '6px 16px', borderRadius: '30px', fontSize: '12px', fontWeight: '900',
                                            backgroundColor: hasActiveRequest ? 'rgba(255, 215, 0, 0.1)' : (isTimeEligible && isMoneyEligible ? 'rgba(74, 222, 128, 0.1)' : 'rgba(255, 255, 255, 0.05)'),
                                            color: hasActiveRequest ? '#FFD700' : (isTimeEligible && isMoneyEligible ? '#4ADE80' : '#737373'),
                                            border: '1px solid currentColor'
                                        }}>
                                            {hasActiveRequest ? `STATUS: ${creatorProfile.payoutStatus.toUpperCase()}` : (isTimeEligible && isMoneyEligible ? 'READY FOR WITHDRAWAL' : 'ACCOUNT LOCKED')}
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '25px', marginBottom: '30px' }}>
                                        {/* Money Logic */}
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <span style={{ color: '#A3A3A3', fontSize: '13px', fontWeight: '600' }}>Earnings Balance</span>
                                                <span style={{ color: isMoneyEligible ? '#4ADE80' : '#FFF', fontSize: '14px', fontWeight: '800' }}>{currentEarnings.toLocaleString()} / {MIN_PAYOUT.toLocaleString()}</span>
                                            </div>
                                            <div style={{ width: '100%', height: '8px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                                                <div style={{ width: `${moneyProgress}%`, height: '100%', background: isMoneyEligible ? '#4ADE80' : 'linear-gradient(90deg, #FFD700, #FACC15)', transition: 'width 1s ease' }}></div>
                                            </div>
                                        </div>

                                        {/* Time Logic */}
                                        <div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <span style={{ color: '#A3A3A3', fontSize: '13px', fontWeight: '600' }}>Next Payout Date</span>
                                                <span style={{ color: isTimeEligible ? '#22D3EE' : '#FFF', fontSize: '14px', fontWeight: '800' }}>{isTimeEligible ? 'Available Now' : `${daysRemaining} Days Left`}</span>
                                            </div>
                                            <div style={{ width: '100%', height: '8px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '10px', overflow: 'hidden' }}>
                                                <div style={{ width: `${isTimeEligible ? 100 : (100 - (daysRemaining / COOLDOWN_DAYS * 100))}%`, height: '100%', background: isTimeEligible ? '#22D3EE' : '#444', transition: 'width 1s ease' }}></div>
                                            </div>
                                        </div>
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'center' }}>
                                        <button 
                                            className="button"
                                            disabled={!isTimeEligible || !isMoneyEligible || hasActiveRequest}
                                            onClick={() => setActiveScreen('PayoutRequestForm')}
                                            style={{ 
                                                width: 'auto', minWidth: '240px', margin: 0, padding: '16px 40px', borderRadius: '12px',
                                                backgroundColor: hasActiveRequest ? '#FFD700' : (isTimeEligible && isMoneyEligible ? '#22C55E' : '#262626'),
                                                color: (isTimeEligible && isMoneyEligible) || hasActiveRequest ? '#000' : '#525252', 
                                                fontWeight: '900', fontSize: '15px', textTransform: 'uppercase', letterSpacing: '1px',
                                                boxShadow: (isTimeEligible && isMoneyEligible && !hasActiveRequest) ? '0 0 20px rgba(34, 197, 94, 0.4)' : 'none',
                                                border: 'none', transition: 'all 0.3s ease'
                                            }}
                                        >
                                            {hasActiveRequest ? 'Request Pending Review' : 'Withdraw Earnings'}
                                    </button>
                                </div>
                                {payoutHistory.length > 0 && (
                                    <div style={{ textAlign: 'center', marginTop: '20px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '15px' }}>
                                        <span onClick={() => setIsHistoryModalOpen(true)} style={{ color: '#00FFFF', fontSize: '12px', fontWeight: '900', cursor: 'pointer', textDecoration: 'underline', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                            View Payout Records ({payoutHistory.length})
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                        })()}

                        {/* === NEW: THE ROAST PASS WALLET (Wrapped in Admin Toggle & Made Free to Host) === */}
                        {globalConfig?.isLiveArenaEnabled !== false && (
                            <div className="glass-panel" style={{ border: '1px solid #FF4500', background: 'rgba(255, 69, 0, 0.05)', marginBottom: '24px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                    <div>
                                        <p style={{ margin: 0, color: '#FF4500', fontSize: '11px', fontWeight: '900', letterSpacing: '2px' }}>🔥 ROAST ROOM WALLET</p>
                                        <p style={{ margin: 0, fontSize: '24px', fontWeight: 'bold', color: '#FFF' }}>
                                            {creatorProfile.roastTokens || 0} <span style={{ fontSize: '14px', color: '#888' }}>Tokens Available</span>
                                        </p>
                                    </div>
                                    <div className="badge-pill" style={{ borderColor: '#FFD700', color: '#FFD700', background: 'rgba(255, 215, 0, 0.1)' }}>
                                        HOT SEAT READY
                                    </div>
                                </div>
                                
                                <p style={{ color: '#888', fontSize: '12px', marginBottom: '15px' }}>Hosting is completely free! Tokens are only required to Step to the Mic or react in other Arenas.</p>
                                
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <button 
                                        className="modern-button roast-ignite-btn" 
                                        style={{ 
                                            padding: '14px', fontWeight: '900', borderRadius: '10px',
                                            textTransform: 'uppercase', letterSpacing: '1px', cursor: 'pointer', border: 'none' 
                                        }}
                                        onClick={async () => {
                                            showMessage("Igniting Roast Arena...");
                                            try {
                                                const userRef = doc(db, "creators", currentUser.uid);
                                                await updateDoc(userRef, { isLive: true, liveRoomType: 'roast' });
                                                setActiveScreen('RoastRoom');
                                            } catch (e) { showMessage("Ignition sequence failed."); }
                                        }}
                                    >
                                        🎙️ HOST ROAST & GO LIVE
                                    </button>

                                    <button 
                                        className="modern-button" 
                                        style={{ 
                                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', 
                                            color: '#FFF', padding: '14px', fontWeight: '900', borderRadius: '10px',
                                            textTransform: 'uppercase', letterSpacing: '1px', cursor: 'pointer'
                                        }}
                                        onClick={() => setIsTokenVaultOpen(true)}
                                    >
                                        🛒 BUY ROAST TOKENS
                                    </button>
                                </div>
                            </div>
                        )}

                    {/* First Row: Gifting & Financial Metrics */}
                    <div className="analytics-grid">
                            <div className="analytics-card" style={{ borderLeft: '3px solid #D4AF37' }}>
                                <p className="analytics-val gold">
                                    {(creatorProfile.totalEarnings || 0).toLocaleString()} GYD
                                </p>
                                <p className="analytics-label">Total Earnings</p>
                            </div>

                            <div className="analytics-card" style={{ borderLeft: '3px solid #C084FC', cursor: 'pointer' }} onClick={() => setIsGiftersModalOpen(true)}>
                                <p className="analytics-val" style={{ color: '#C084FC' }}>
                                    {creatorProfile.giftsReceived || 0}
                                </p>
                                <p className="analytics-label">Gifts Received (View List)</p>
                            </div>

                            <div className="analytics-card" style={{ borderLeft: '3px solid #00FFFF', cursor: 'pointer' }} onClick={() => setIsLeaderboardModalOpen(true)}>
                                <p className="analytics-val" style={{ color: '#00FFFF' }}>{myRank}</p>
                                <p className="analytics-label">Leaderboard Rank (View List)</p>
                            </div>
                        </div>

                        {/* Second Row: Detailed Reach & Engagement Metrics (Interactive Charts) */}
                        <div className="analytics-grid">
                            <div className="analytics-card" style={{ cursor: 'pointer' }} onClick={() => { setSelectedChartPeriod('daily'); setIsChartModalOpen(true); }}>
                                <p className="analytics-val" style={{ fontSize: '16px', color: '#FFF' }}>Daily Reach</p>
                                <div className="analytics-sub-val">
                                    <span>👁️ {creatorProfile.dailyViews || 0}</span>
                                    <span>❤️ {creatorProfile.dailyLikes || 0}</span>
                                </div>
                                <p className="analytics-label">Today's Traffic (View Chart)</p>
                            </div>

                            <div className="analytics-card" style={{ cursor: 'pointer' }} onClick={() => { setSelectedChartPeriod('weekly'); setIsChartModalOpen(true); }}>
                                <p className="analytics-val" style={{ fontSize: '16px', color: '#FFF' }}>Weekly Reach</p>
                                <div className="analytics-sub-val">
                                    <span>👁️ {creatorProfile.weeklyViews || 0}</span>
                                    <span>❤️ {creatorProfile.weeklyLikes || 0}</span>
                                </div>
                                <p className="analytics-label">This Week's Traffic (View Chart)</p>
                            </div>

                            <div className="analytics-card" style={{ cursor: 'pointer' }} onClick={() => { setSelectedChartPeriod('lifetime'); setIsChartModalOpen(true); }}>
                                <p className="analytics-val" style={{ fontSize: '16px', color: '#FFF' }}>Lifetime Reach</p>
                                <div className="analytics-sub-val">
                                    <span>👁️ {creatorProfile.lifetimeViews || 0}</span>
                                    <span>❤️ {creatorProfile.lifetimeLikes || 0}</span>
                                </div>
                                <p className="analytics-label">All-Time Traffic (View Chart)</p>
                            </div>
                        </div>

                        {/* --- MINIMUM PAYOUT THRESHOLD NOTICE --- */}
                        <div style={{ background: 'rgba(255, 215, 0, 0.02)', border: '1px dashed rgba(255, 215, 0, 0.2)', padding: '12px', borderRadius: '12px', marginBottom: '24px', fontSize: '11px', color: '#AAA', textAlign: 'center', lineHeight: '1.4' }}>
                            💡 <strong style={{ color: '#FFD700' }}>Payout Policy:</strong> Minimum balance required for payout is <strong style={{ color: '#FFF' }}>10,000 GYD</strong>. Please note that creators are responsible for covering any transaction processing fees upon payout request approval.
                        </div>

                        {/* --- REAL-TIME WEEKLY TOP PERFORMERS LEADERBOARD --- */}
                        <div className="leaderboard-card">
                            <div className="leaderboard-header">
                                <p className="leaderboard-title"><span style={{color: '#FFD700'}}>🏆</span> This Week's Top Performers</p>
                                <p className="leaderboard-subtitle">Bi-Weekly Competition</p>
                            </div>
                            {leaderboardUsers.slice(0, 3).map((user, index) => {
                                const rank = index + 1;
                                return (
                                    <div key={user.id} className="leaderboard-row" style={{ cursor: 'pointer' }} onClick={() => {
                                        window.dispatchEvent(new CustomEvent('navigateToUserProfile', { detail: { userId: user.id } }));
                                    }}>
                                        <div className="supporter-info">
                                            <div className={`rank-circle rank-${rank}`}>{rank}</div>
                                            <span className="supporter-name" style={{ fontWeight: 'bold' }}>{user.creatorName || "NVA Creator"}</span>
                                        </div>
                                        <span className="supporter-amount" style={{ color: '#FFD700' }}>
                                            {(user.giftsReceived || 0).toLocaleString()} 🎁
                                        </span>
                                    </div>
                                );
                            })}
                            {leaderboardUsers.length === 0 && (
                                <p style={{ color: '#666', fontSize: '12px', fontStyle: 'italic', padding: '10px 0', textAlign: 'center' }}>
                                    Recalculating leaderboard...
                                </p>
                            )}
                            <div className="leaderboard-row" style={{background: 'rgba(255,215,0,0.05)', borderRadius: '8px', padding: '10px', marginTop: '10px', border: '1px solid rgba(255,215,0,0.15)'}}>
                                <div className="supporter-info">
                                    <div className="rank-circle rank-other" style={{ background: '#333', color: '#FFF' }}>
                                        {myRank !== '--' ? myRank.replace('#', '') : '--'}
                                    </div>
                                    <span className="supporter-name" style={{color: '#FFD700', fontWeight: 'bold'}}>You (Your Stats)</span>
                                </div>
                                <span className="supporter-amount" style={{color: '#FFF'}}>
                                    {(creatorProfile.giftsReceived || 0).toLocaleString()} 🎁
                                </span>
                            </div>
                            <p style={{textAlign: 'center', fontSize: '10px', color: '#888', marginTop: '15px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px'}}>Top performers qualify for the <strong>100K GYD</strong> bi-weekly prize</p>
                        </div>

                        {/* === CONTENT LIBRARY & FEATURED LINK SECTION === */}
                        <div className="dashboardSection" style={{ paddingBottom: '10px' }}>
                            <p className="dashboardSectionTitle">My Showcase Feature</p>
                            <p className="dashboardItem" style={{color: '#AAA', lineHeight: 1.4, marginBottom: '15px'}}>Pinned to your public profile and showcased globally. If pending monetization, it remains private until approved.</p>
                            
                            {(creatorProfile.featuredVideoLink && liveFeaturedItem) ? (
                                (() => {
                                    // Live-bound checks protect the UI from stale embedded fields
                                    const monetizationStatus = liveFeaturedItem.monetizationStatus;
                                    const isActive = liveFeaturedItem.isActive;
                                    const isFeaturedPending = monetizationStatus === 'pending' || isActive === false;
                                    
                                    return (
                                        <div className="vertical-carousel-item" style={{ backgroundColor: '#1A1A1A', border: isFeaturedPending ? '1px dashed #FFD700' : 'none', borderRadius: '12px', padding: '10px', opacity: isFeaturedPending ? 0.7 : 1 }}>
                                            <div style={{ width: '140px', height: '80px', flexShrink: 0, marginRight: '15px', position: 'relative', overflow: 'hidden', borderRadius: '6px' }}>
                                                <DynamicThumbnail 
                                                    item={{ imageUrl: creatorProfile.featuredVideoLink.customThumbnailUrl }} 
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        e.stopPropagation();
                                                        if (isFeaturedPending) {
                                                            showMessage("This video is pending admin approval.");
                                                        } else {
                                                            handleVideoPress(creatorProfile.featuredVideoLink.embedUrl || creatorProfile.featuredVideoLink.mainUrl, creatorProfile.featuredVideoLink);
                                                        }
                                                    }} 
                                                />
                                                {isFeaturedPending && (
                                                    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px' }}>🔒</div>
                                                )}
                                            </div>
                                            <div className="liveFeedContent">
                                                <p className="liveFeedTitle" style={{ fontWeight: 'bold', margin: 0 }}>{`Currently Featuring: ${creatorProfile.featuredVideoLink.title}`}</p>
                                                {isFeaturedPending ? (
                                                    <p className="liveFeedCreator" style={{ color: '#FFA500', fontWeight: 'bold', margin: '4px 0 0 0', fontSize: '12px' }}>⚠️ Awaiting Monetization Approval</p>
                                                ) : (
                                                    <p className="liveFeedCreator" style={{ color: '#00FF00', fontWeight: 'bold', margin: '4px 0 0 0', fontSize: '12px' }}>✓ Visible in public showcase</p>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })()
                            ) : (
                                <p className="dashboardItem">You do not have a featured link set. Go to your library to set one.</p>
                            )}
                        </div>
                    </>
                )}
                {/* === END: ROLE-BASED CONTENT SECTIONS === */}

                {/* === NEW GLASSMORPHIC UTILITY GRID === */}
                <p className="dashboardSectionTitle" style={{ color: '#FFD700', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>🛠️ Creator Utilities</p>
                <div className="analytics-grid" style={{ marginBottom: '24px' }}>
                    {/* Card 0: GO LIVE (Admin Only) */}
                    {(creatorProfile.role === 'admin' || creatorProfile.role === 'authority') && (
                        <div 
                            className="analytics-card" 
                            style={{ cursor: 'pointer', borderTop: '2px solid #FF1493', background: 'rgba(255, 20, 147, 0.05)' }} 
                            onClick={async () => {
                                showMessage("Initializing Roast Arena...");
                                try {
                                    const userRef = doc(db, "creators", currentUser.uid);
                                    // Sets flag so you appear in the "Live Arenas" tray on Home Screen
                                    await updateDoc(userRef, { isLive: true, liveRoomType: 'roast' });
                                    setActiveScreen('RoastRoom');
                                } catch (e) { showMessage("Failed to start stream."); }
                            }}
                        >
                            <p className="analytics-val" style={{ fontSize: '24px' }}>🎙️</p>
                            <p className="analytics-label" style={{ color: '#FF1493', fontWeight: '900' }}>GO LIVE (ROAST)</p>
                        </div>
                    )}

                    {/* Card 1: Content Library */}
                    {hasCreatorAccess && (
                        <div className="analytics-card" style={{ cursor: 'pointer', borderTop: '2px solid #FFD700' }} onClick={() => setActiveScreen('MyContentLibrary')}>
                            <p className="analytics-val" style={{ fontSize: '24px' }}>📁</p>
                            <p className="analytics-label">Content Library</p>
                        </div>
                    )}

                    {/* Card 2: Bookmarked Casting Calls */}
                    <div className="analytics-card" style={{ cursor: 'pointer', borderTop: '2px solid #00FFFF' }} onClick={() => setActiveScreen('SavedOpportunities')}>
                        <p className="analytics-val" style={{ fontSize: '24px' }}>🔖</p>
                        <p className="analytics-label">Saved Castings</p>
                    </div>

                    {/* Card 4: Blocked Users */}
                    <div className="analytics-card" style={{ cursor: 'pointer', borderTop: '2px solid #555' }} onClick={() => setActiveScreen('BlockedList')}>
                        <p className="analytics-val" style={{ fontSize: '24px' }}>🛡️</p>
                        <p className="analytics-label">Blocked Users</p>
                    </div>
                </div>

                {/* ====== THE EXHIBITION ROOM (Craft/Design/Fitness Only) ====== */}
                {['Craft', 'Designer', 'Health & Fitness', 'Crafter / Designer', 'Wellness Coach'].includes(creatorProfile?.creatorField) && (
                    <div className="glass-panel" style={{ background: `linear-gradient(180deg, ${roleColor}33 0%, #111111 100%)`, border: `1px solid ${roleColor}66`, marginBottom: '24px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <div>
                                <p style={{ margin: 0, color: '#FFD700', fontSize: '18px', fontWeight: '900', letterSpacing: '2px', textTransform: 'uppercase' }}>🎨 The Exhibition Room</p>
                                <p style={{ margin: '4px 0 0 0', color: '#888', fontSize: '12px' }}>Your creative portfolio. Tap any slot to upload a high-quality image.</p>
                            </div>
                            <button 
                                onClick={handleShareGallery} 
                                style={{ background: 'transparent', border: '1px solid #FFD700', color: '#FFD700', padding: '6px 16px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', textTransform: 'uppercase' }}
                                onMouseOver={e => { e.currentTarget.style.backgroundColor = 'rgba(255, 215, 0, 0.1)'; }}
                                onMouseOut={e => { e.currentTarget.style.backgroundColor = 'transparent'; }}
                            >
                                🔗 Share Exhibition
                            </button>
                        </div>
                        
                        <input type="file" ref={galleryInputRef} accept="image/*" style={{ display: 'none' }} onChange={handleGalleryFileSelect} />

                        <div className="studio-gallery-grid">
                            {[0, 1, 2, 3, 4].map((index) => {
                                const imgUrl = creatorProfile?.studioGallery?.[index];
                                return (
                                    <div 
                                        key={index} 
                                        className={`gallery-slot slot-${index}`} 
                                        onClick={() => {
                                            setUploadingSlot(index);
                                            galleryInputRef.current?.click();
                                        }}
                                    >
                                        {isUploadingGallery && uploadingSlot === index ? (
                                            <span style={{ color: '#FFD700', fontSize: '12px', fontWeight: 'bold' }}>Uploading...</span>
                                        ) : imgUrl ? (
                                            <>
                                                <img key={imgUrl} src={imgUrl} alt={`Slot ${index}`} />
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); deleteGalleryImage(index); }}
                                                    style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(220,53,69,0.9)', color: '#FFF', border: 'none', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10 }}
                                                >✕</button>
                                            </>
                                        ) : (
                                            <span style={{ color: '#555', fontSize: '24px' }}>+</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* ====== MY FILM OFFICE (FILMMAKERS & ACTIVE WATCH PARTY HOSTS) ====== */}
                {(creatorProfile?.creatorField?.toLowerCase().trim() === 'filmmaker' || 
                  creatorProfile?.role?.toLowerCase() === 'admin' || 
                  creatorProfile?.role?.toLowerCase() === 'super_admin' ||
                  myArenaFilms.length > 0 || 
                  myPendingFilms.length > 0 || 
                  (creatorProfile?.boxOfficeLedger?.ticketSales || 0) > 0 || 
                  (creatorProfile?.boxOfficeLedger?.filmDonations || 0) > 0) && (
                    <div className="glass-panel" style={{ background: 'linear-gradient(180deg, rgba(15,15,15,0.9) 0%, rgba(5,5,5,0.95) 100%)', border: '1px solid rgba(255, 215, 0, 0.2)', marginBottom: '24px' }}>
                        {/* ADMIN DATA DEBUGGER (Only visible to admin to troubleshoot) */}
                        {creatorProfile?.role?.toLowerCase() === 'admin' && (
                            <div style={{ fontSize: '10px', color: '#555', marginBottom: '10px', borderBottom: '1px solid #222', paddingBottom: '5px' }}>
                                DEBUG: Role: [{creatorProfile.role}] | Field: [{creatorProfile.creatorField}] | Active Films: {myArenaFilms.length}
                            </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <div>
                                <p style={{ margin: 0, color: '#FFD700', fontSize: '18px', fontWeight: '900', letterSpacing: '2px', textTransform: 'uppercase' }}>🎬 My Film Office</p>
                                <p style={{ margin: '4px 0 0 0', color: '#888', fontSize: '12px' }}>Your dedicated studio hub for NVA Film Arena submissions & Box Office tracking.</p>
                            </div>
                        </div>

                        {/* THE FIX: Dynamic Box Office (Invisible to standard users unless active) */}
                        {(() => {
                            if (globalConfig?.showBoxOffice === false) return null;
                            
                            const isFilmmaker = creatorProfile?.creatorField?.toLowerCase().trim() === 'filmmaker' || creatorProfile?.role?.toLowerCase() === 'admin' || creatorProfile?.role?.toLowerCase() === 'super_admin';
                            const tixBal = creatorProfile?.boxOfficeLedger?.ticketSales || 0;
                            const donBal = creatorProfile?.boxOfficeLedger?.filmDonations || 0;
                            const totalBal = tixBal + donBal;
                            const hasActiveEvent = myArenaFilms.length > 0;
                            
                            if (!isFilmmaker && !hasActiveEvent && tixBal === 0 && donBal === 0) return null;

                            return (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: isFilmmaker ? '1fr 1fr' : '1fr', gap: '15px', marginBottom: '20px' }}>
                                        <div style={{ background: 'rgba(0, 255, 255, 0.05)', border: '1px solid rgba(0, 255, 255, 0.2)', padding: '15px', borderRadius: '12px' }}>
                                            <p style={{ color: '#00FFFF', fontSize: '11px', fontWeight: '900', margin: '0 0 5px 0' }}>BOX OFFICE: TICKET SALES</p>
                                            <p style={{ color: '#FFF', fontSize: '24px', fontWeight: 'bold', margin: 0 }}>{tixBal.toLocaleString()} <span style={{fontSize:'12px', color:'#888'}}>GYD</span></p>
                                        </div>
                                        {isFilmmaker && (
                                            <div style={{ background: 'rgba(255, 215, 0, 0.05)', border: '1px solid rgba(255, 215, 0, 0.2)', padding: '15px', borderRadius: '12px' }}>
                                                <p style={{ color: '#FFD700', fontSize: '11px', fontWeight: '900', margin: '0 0 5px 0' }}>ARENA: PUBLIC DONATIONS</p>
                                                <p style={{ color: '#FFF', fontSize: '24px', fontWeight: 'bold', margin: 0 }}>{donBal.toLocaleString()} <span style={{fontSize:'12px', color:'#888'}}>GYD</span></p>
                                            </div>
                                        )}
                                    </div>

                                    {/* AUDITABLE REQUEST BUTTON (WITH SIMPLIFIED LABEL & DYNAMIC TIMELOCK ENFORCEMENT) */}
                                    {totalBal > 0 && (
                                        <button 
                                            disabled={hasActiveOrUpcomingPremiere || hasPendingSweep}
                                            onClick={() => {
                                                setConfirmationTitle("Claim Box Office Earnings?");
                                                setConfirmationMessage("Your Ticket Sales & Donations will be swept from your Box Office and added to your main Earnings balance within 3 working days.");
                                                setOnConfirmationAction(() => async () => {
                                                    try {
                                                        // THE FIX: Build a detailed breakdown string for the Admin
                                                        const tix = creatorProfile?.boxOfficeLedger?.ticketSales || 0;
                                                        const dons = creatorProfile?.boxOfficeLedger?.filmDonations || 0;
                                                        let details = [];
                                                        
                                                        if (tix > 0) {
                                                            const film = myArenaFilms.find(f => f.type === 'premiere');
                                                            details.push(`🎟️ TICKET SALES: ${film?.title || 'Premiere'}`);
                                                        }
                                                        if (dons > 0) {
                                                            const film = myArenaFilms.find(f => f.type === 'donation');
                                                            details.push(`🎁 ARENA DONATIONS: ${film?.title || 'Showcase'}`);
                                                        }
                                                        
                                                        const detailedTitle = details.join(' | ') || "Box Office Sweep";

                                                        await addDoc(collection(db, "payoutRequests"), {
                                                            type: 'boxOfficeSweep',
                                                            userId: currentUser.uid,
                                                            creatorName: creatorProfile.creatorName,
                                                            campaignTitle: detailedTitle, // Detailed metadata sent to Admin
                                                            amount: totalBal,
                                                            status: 'pending',
                                                            timestamp: new Date()
                                                        });
                                                        showMessage("Transfer request sent to Admins!");
                                                    } catch(e) { showMessage("Failed to submit request: " + e.message); }
                                                });
                                                setShowConfirmationModal(true);
                                            }}
                                            style={{ 
                                                width: '100%', 
                                                marginBottom: '20px', 
                                                background: (hasActiveOrUpcomingPremiere || hasPendingSweep) ? '#333' : 'linear-gradient(90deg, #4ADE80 0%, #22C55E 100%)', 
                                                color: (hasActiveOrUpcomingPremiere || hasPendingSweep) ? '#888' : '#000', 
                                                border: 'none', 
                                                padding: '12px', 
                                                borderRadius: '8px', 
                                                fontWeight: '900', 
                                                cursor: (hasActiveOrUpcomingPremiere || hasPendingSweep) ? 'not-allowed' : 'pointer', 
                                                textTransform: 'uppercase', 
                                                boxShadow: (hasActiveOrUpcomingPremiere || hasPendingSweep) ? 'none' : '0 0 15px rgba(74, 222, 128, 0.3)' 
                                            }}
                                        >
                                            {hasActiveOrUpcomingPremiere 
                                                ? "🔒 Locked: Live Premiere In Progress" 
                                                : (hasPendingSweep ? "⏳ Request Pending Admin Approval" : "🏦 Claim Box Office Earnings")}
                                        </button>
                                    )}
                                </>
                            );
                        })()}

                        {/* Submission Toggles Status (Hides locked submission labels completely for non-filmmakers to keep dashboard clean) */}
                        {creatorProfile?.creatorField?.toLowerCase().trim() === 'filmmaker' && (
                            <div style={{ display: 'flex', gap: '10px' }}>
                                {myArenaFilms.length >= 20 ? (
                                    <p style={{ color: '#FFD700', fontSize: '12px', fontWeight: 'bold', margin: 0, padding: '12px', background: 'rgba(255,215,0,0.1)', borderRadius: '8px', width: '100%', textAlign: 'center', border: '1px dashed #FFD700' }}>
                                        🛑 You have reached your 20-film Arena cap! You must take a film down before submitting a new one.
                                    </p>
                                ) : (creatorProfile?.enablePremiereSubmissions || creatorProfile?.enableDonationSubmissions) ? (
                                    <button className="modern-button" style={{ background: '#FFD700', color: '#000', border: 'none', padding: '12px 24px', fontWeight: '900', borderRadius: '8px', cursor: 'pointer' }} onClick={() => { setEditingFilmId(null); setOriginalFilmType(null); setFilmForm({ title: '', genre: 'Drama', synopsis: '', credits: '', videoUrl: '', trailerUrl: '', posterUrl: '', type: '', premiereDate: '', room: 'Room 1', ticketPrice: '5.00' }); setShowFilmOfficeModal(true); }}>
                                        + SUBMIT NEW FILM
                                    </button>
                                ) : (
                                    <p style={{ color: '#DC3545', fontSize: '12px', fontWeight: 'bold', margin: 0, padding: '12px', background: 'rgba(220,53,69,0.1)', borderRadius: '8px', width: '100%', textAlign: 'center' }}>
                                        🔒 Submissions locked. Admins enable Premiere/Donation rights individually.
                                    </p>
                                )}
                            </div>
                        )}

                        {/* FILM OFFICE MANAGEMENT SUITE */}
                        <div style={{ marginTop: '20px', borderTop: '1px solid rgba(255,215,0,0.2)', paddingTop: '15px' }}>
                            
                            {/* SECTION A: PENDING APPROVAL */}
                            {myPendingFilms.length > 0 && (
                                <div style={{ marginBottom: '20px' }}>
                                    <p style={{ color: '#FFD700', fontSize: '11px', fontWeight: 'bold', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '1px' }}>⌛ Awaiting Admin Approval</p>
                                    {myPendingFilms.map(film => (
                                        <div key={film.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,215,0,0.03)', padding: '10px 15px', borderRadius: '8px', marginBottom: '8px', border: '1px dashed rgba(255,215,0,0.2)' }}>
                                            <div>
                                                <p style={{ margin: 0, color: '#FFF', fontWeight: 'bold', fontSize: '13px' }}>{film.title}</p>
                                                <p style={{ margin: '2px 0 0 0', color: '#888', fontSize: '10px' }}>Status: Reviewing Metadata & Release Strategy...</p>
                                            </div>
                                            <span style={{ fontSize: '10px', color: '#FFD700', fontWeight: 'bold' }}>PENDING</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* SECTION B: LIVE ARENA FILMS */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <p style={{ color: '#FFF', fontSize: '11px', fontWeight: 'bold', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>🎬 My Live Arena Films</p>
                                <p style={{ color: '#888', fontSize: '10px', margin: 0 }}>Studio Capacity: {myArenaFilms.length} / 20</p>
                            </div>

                            {myArenaFilms.length > 0 ? (
                                myArenaFilms.map(film => (
                                    <div key={film.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0a0a0a', padding: '10px 15px', borderRadius: '8px', marginBottom: '8px', border: '1px solid #333' }}>
                                        <div>
                                            <p style={{ margin: 0, color: '#FFF', fontWeight: 'bold', fontSize: '14px' }}>{film.title}</p>
                                            <p style={{ margin: '2px 0 0 0', color: '#AAA', fontSize: '11px' }}>
                                                {film.type === 'premiere' ? '🎟️ Live Premiere (Ticketed)' : film.type === 'donation' ? '🎁 Public Film Arena (Donations)' : '🎬 Free Public Showcase'}
                                            </p>
                                        </div>
                                        <div style={{ display: 'flex', gap: '8px' }}>
                                            <button 
                                                onClick={() => {
                                                    setEditingFilmId(film.id);
                                                    setOriginalFilmType(film.type);
                                                    setFilmForm({ title: film.title, genre: film.genre || 'Drama', synopsis: film.synopsis, credits: film.credits || '', videoUrl: film.videoUrl || '', trailerUrl: film.trailerUrl || '', posterUrl: film.posterUrl, type: film.type, premiereDate: film.premiereDate || '', room: film.room || 'Room 1' }); // Added trailerUrl
                                                    setShowFilmOfficeModal(true);
                                                }}
                                                style={{ background: '#222', color: '#FFF', border: '1px solid #444', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                                            >
                                                Edit
                                            </button>
                                            <button 
                                                onClick={() => {
                                                    setConfirmationTitle("Take Down Film?");
                                                    setConfirmationMessage(`Are you sure you want to permanently remove "${film.title}" from the Live Arena?`);
                                                    setOnConfirmationAction(() => async () => {
                                                        try {
                                                            // THE FIX: If it's a premiere, stamp the user profile before deletion
                                                            if (film.type === 'premiere' && film.premiereDate) {
                                                                const premiereTime = new Date(film.premiereDate).getTime();
                                                                const lockUntil = new Date(premiereTime + (72 * 60 * 60 * 1000));
                                                                // Only stamp if the 72-hour window hasn't passed yet
                                                                if (Date.now() < lockUntil.getTime()) {
                                                                    await updateDoc(doc(db, "creators", currentUser.uid), {
                                                                        payoutLockUntil: lockUntil.toISOString()
                                                                    });
                                                                }
                                                            }
                                                            await deleteDoc(doc(db, "movies", film.id));
                                                            showMessage("Film taken down. Box Office remains locked for audit period.");
                                                        } catch (err) { showMessage("Failed to take down film: " + err.message); }
                                                    });
                                                    setShowConfirmationModal(true);
                                                }} 
                                                style={{ background: 'rgba(220,53,69,0.15)', color: '#DC3545', border: '1px solid #DC3545', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}
                                            >
                                                Take Down
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div style={{ textAlign: 'center', padding: '20px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid #222' }}>
                                    <p style={{ color: '#555', fontSize: '12px', margin: 0 }}>You have no live films in the Arena. Use the button above to submit your first production!</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* FILM CLUB RENEWAL (Rendered neatly inside its own card below the grid if active) */}
                {creatorProfile?.isFilmClub && !creatorProfile?.badges?.includes("Gold Club") && (globalConfig?.filmClubOpen || globalConfig?.allowRenewals) && (
                    <div className="wallet-card" style={{ background: 'rgba(0, 255, 255, 0.02)', border: '1px solid rgba(0, 255, 255, 0.2)', padding: '15px', borderRadius: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                        <p style={{ fontSize: '11px', color: '#00FFFF', fontWeight: 'bold', margin: 0, letterSpacing: '0.05em' }}>FILM CLUB SUBSCRIPTION</p>
                        <button 
                            className="button" 
                            onClick={() => setActiveScreen('EnrollmentPayment')} 
                            style={{ margin: 0, padding: '5px 12px', fontSize: '11px', backgroundColor: 'transparent', border: '1px solid #00FFFF', color: '#00FFFF' }}
                        >
                            Renew Membership
                        </button>
                    </div>
                )}

                {/* --- COLLAPSIBLE DANGER ZONE ACCORDION --- */}
                <div className="dashboardSection" style={{ border: '1px solid #DC3545', marginTop: '24px', padding: '15px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setIsDangerZoneExpanded(!isDangerZoneExpanded)}>
                        <p className="dashboardSectionTitle" style={{ color: '#DC3545', margin: 0, fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>🚨 Danger Zone</p>
                        <span style={{ color: '#DC3545', fontWeight: 'bold', fontSize: '12px' }}>{isDangerZoneExpanded ? '▲' : '▼'}</span>
                    </div>

                    {isDangerZoneExpanded && (
                        <div style={{ marginTop: '15px', borderTop: '1px solid rgba(220, 53, 69, 0.2)', paddingTop: '15px' }}>
                            <p className="dashboardItem" style={{ color: '#AAA', lineHeight: 1.4, marginBottom: '15px', fontSize: '12px' }}>
                                Permanently delete your account and all of your associated data. This action is irreversible.
                            </p>
                            <div className="formGroup">
                                <label htmlFor="deleteConfirm" className="formLabel" style={{ color: '#FFD700', fontSize: '12px', display: 'block', marginBottom: '6px' }}>
                                    To confirm, please type your creator name: <strong style={{color: '#FFF'}}>{creatorProfile.creatorName}</strong>
                                </label>
                                <input
                                    id="deleteConfirm"
                                    type="text"
                                    className="formInput"
                                    value={deleteConfirmationText || ''}
                                    onChange={(e) => setDeleteConfirmationText(e.target.value)}
                                    placeholder="Type creator name to confirm"
                                    disabled={isDeleting}
                                />
                            </div>
                            <button
                                className="button"
                                onClick={handleDeleteAccount}
                                disabled={deleteConfirmationText !== creatorProfile.creatorName || isDeleting}
                                style={{ 
                                    width: '100%',
                                    backgroundColor: (deleteConfirmationText !== creatorProfile.creatorName || isDeleting) ? '#555' : '#DC3545',
                                    cursor: (deleteConfirmationText !== creatorProfile.creatorName || isDeleting) ? 'not-allowed' : 'pointer',
                                    margin: 0
                                }}
                            >
                                <span className="buttonText">{isDeleting ? 'DELETING...' : 'Permanently Delete My Account'}</span>
                            </button>
                        </div>
                    )}
                </div>
                {/* --- END: DANGER ZONE --- */}

                <button className="button" onClick={() => setActiveScreen('Home')} style={{ backgroundColor: '#3A3A3A', marginTop: '30px' }}><span className="buttonText light">Back to Home</span></button>
            </div>

            {/* ====== THE AUDIT VAULT: PAYOUT HISTORY MODAL ====== */}
            {isHistoryModalOpen && (
                <div className="modal-backdrop" onClick={() => setIsHistoryModalOpen(false)}>
                    <div className="modal-content" style={{ maxWidth: '440px', border: '1px solid #00FFFF', boxShadow: '0 0 30px rgba(0, 255, 255, 0.2)' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <p className="modal-title" style={{ color: '#00FFFF', fontSize: '18px', fontWeight: '900' }}>PAYOUT RECORDS</p>
                            <button className="modal-close-button" onClick={() => setIsHistoryModalOpen(false)}>&times;</button>
                        </div>
                        <div className="modal-body" style={{ maxHeight: '420px', overflowY: 'auto', padding: '15px' }}>
                            {payoutHistory.map(h => (
                                <div key={h.id} style={{ background: 'rgba(255,255,255,0.02)', padding: '15px', borderRadius: '10px', border: '1px solid #222', marginBottom: '10px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ color: '#4ADE80', fontWeight: '900', fontSize: '18px' }}>${h.amount.toLocaleString()} <span style={{fontSize: '11px'}}>GYD</span></span>
                                        <span style={{ color: '#555', fontSize: '10px', fontWeight: '900', letterSpacing: '0.5px' }}>{h.systemReceiptId}</span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '12px', color: '#AAA', fontWeight: '600' }}>MMG CONFIRMATION ID</p>
                                    <p style={{ margin: '2px 0 10px 0', fontSize: '14px', color: '#FFD700', fontWeight: '800', fontFamily: 'monospace' }}>{h.adminTxId}</p>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <button 
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                if (window.confirm("Remove this record from your view?")) {
                                                    try {
                                                        const delFunc = httpsCallable(functions, 'deletePayoutRecord');
                                                        await delFunc({ recordId: h.id });
                                                        showMessage("Record removed.");
                                                    } catch (err) { showMessage("Delete failed."); }
                                                }
                                            }}
                                            style={{ background: 'transparent', border: 'none', color: '#DC3545', fontSize: '10px', fontWeight: '900', cursor: 'pointer', padding: 0, textTransform: 'uppercase' }}
                                        >
                                            Delete Record
                                        </button>
                                        <p style={{ margin: 0, fontSize: '11px', color: '#666' }}>Processed: {h.processedAt ? new Date(h.processedAt).toLocaleString() : 'Recent'}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
            
            {showImageAdjustModal && imageFileToAdjust && (
                <ProfilePictureAdjustModal isUploading={isUploadingPFP} imageFile={imageFileToAdjust} onSave={handleSaveAdjustedProfilePicture} onCancel={() => handleCancelAdjust()} showMessage={showMessage} />
            )}

            {showGalleryAdjustModal && galleryFileToAdjust && (
                <GalleryImageAdjustModal 
                    isUploading={isUploadingGallery} 
                    imageFile={galleryFileToAdjust} 
                    onSave={handleSaveAdjustedGalleryImage} 
                    onCancel={handleCancelGalleryAdjust} 
                    aspectRatio={
                        uploadingSlot === 0 ? (2/3) : // Tall Slot
                        uploadingSlot === 1 ? (2/1) : // Wide Slot
                        (uploadingSlot === 2 || uploadingSlot === 3) ? (1/2) : // Extra Tall Slot
                        uploadingSlot === 4 ? (4/1) : // Banner Slot
                        1 // Fallback
                    }
                />
            )}

            {/* ====== MONTHLY GIFTERS LIST MODAL ====== */}
            {isGiftersModalOpen && (
                <div className="modal-backdrop" onClick={() => setIsGiftersModalOpen(false)}>
                    <div className="modal-content" style={{ maxWidth: '440px', border: '1px solid #C084FC' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <p className="modal-title" style={{ color: '#C084FC' }}>🎁 Monthly Patrons</p>
                            <button className="modal-close-button" onClick={() => setIsGiftersModalOpen(false)}>&times;</button>
                        </div>
                        <div className="modal-body" style={{ maxHeight: '400px', overflowY: 'auto', padding: '15px' }}>
                            <p style={{ color: '#888', fontSize: '12px', margin: '0 0 15px 0', textAlign: 'center' }}>
                                These supporters sent you gifts over the last 30 days. Tap any non-anonymous name to visit their profile.
                            </p>

                            {myGifters.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {myGifters.map(g => (
                                        <GifterRow 
                                            key={g.id} 
                                            g={g} 
                                            setIsGiftersModalOpen={setIsGiftersModalOpen} 
                                        />
                                    ))}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '30px 10px', color: '#666', fontSize: '13px' }}>
                                    No gifts received in the last 30 days. Share your profile to gather support!
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* ====== INTERACTIVE SVG LINE CHART MODAL ====== */}
            {isChartModalOpen && (
                <div className="modal-backdrop" onClick={() => setIsChartModalOpen(false)}>
                    <div className="modal-content" style={{ maxWidth: '440px', border: '1px solid #FFD700' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <p className="modal-title" style={{ color: '#FFD700' }}>📊 {selectedChartPeriod === 'daily' ? "Daily Reach" : selectedChartPeriod === 'weekly' ? "Weekly Reach" : "Lifetime Reach"}</p>
                            <button className="modal-close-button" onClick={() => setIsChartModalOpen(false)}>&times;</button>
                        </div>
                        <div className="modal-body" style={{ padding: '20px' }}>
                            
                            {(() => {
                                const maxViews = selectedChartPeriod === 'daily' ? (creatorProfile.dailyViews || 0) : selectedChartPeriod === 'weekly' ? (creatorProfile.weeklyViews || 0) : (creatorProfile.lifetimeViews || 0);
                                const maxLikes = selectedChartPeriod === 'daily' ? (creatorProfile.dailyLikes || 0) : selectedChartPeriod === 'weekly' ? (creatorProfile.weeklyLikes || 0) : (creatorProfile.lifetimeLikes || 0);

                                const totalPoints = 7;
                                const chartData = [];
                                const now = new Date();

                                for (let i = totalPoints - 1; i >= 0; i--) {
                                    const date = new Date();
                                    if (selectedChartPeriod === 'daily') {
                                        date.setDate(now.getDate() - i);
                                    } else if (selectedChartPeriod === 'weekly') {
                                        date.setDate(now.getDate() - (i * 7));
                                    } else {
                                        date.setMonth(now.getMonth() - i);
                                    }

                                    const ratio = totalPoints > 1 ? (totalPoints - 1 - i) / (totalPoints - 1) : 1;
                                    const computedViews = Math.round(maxViews * (0.3 + 0.7 * Math.sin(ratio * Math.PI / 2) * (0.8 + 0.2 * Math.cos(i * 1.5))));
                                    const computedLikes = Math.round(maxLikes * (0.25 + 0.75 * Math.sin(ratio * Math.PI / 2) * (0.75 + 0.25 * Math.sin(i * 2.0))));

                                    chartData.push({
                                        label: selectedChartPeriod === 'lifetime' 
                                            ? date.toLocaleDateString(undefined, { month: 'short' }) 
                                            : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                                        views: computedViews,
                                        likes: computedLikes
                                    });
                                }

                                const width = 360;
                                const height = 180;
                                const padding = 30;
                                const chartWidth = width - padding * 2;
                                const chartHeight = height - padding * 2;
                                const maxCalculatedVal = Math.max(...chartData.map(d => d.views), 1);

                                const getCoords = (idx, val) => {
                                    const x = padding + (idx / (totalPoints - 1)) * chartWidth;
                                    const y = padding + chartHeight - (val / maxCalculatedVal) * chartHeight;
                                    return { x, y };
                                };

                                let viewPathStr = "";
                                let likesPathStr = "";

                                chartData.forEach((d, idx) => {
                                    const vCoords = getCoords(idx, d.views);
                                    const lCoords = getCoords(idx, d.likes);
                                    if (idx === 0) {
                                        viewPathStr = `M ${vCoords.x} ${vCoords.y}`;
                                        likesPathStr = `M ${lCoords.x} ${lCoords.y}`;
                                    } else {
                                        viewPathStr += ` L ${vCoords.x} ${vCoords.y}`;
                                        likesPathStr += ` L ${lCoords.x} ${lCoords.y}`;
                                    }
                                });

                                return (
                                    <>
                                        <div style={{ background: '#0A0A0A', borderRadius: '8px', padding: '10px', border: '1px solid #222', marginBottom: '16px' }}>
                                            <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="100%">
                                                <line x1={padding} y1={padding} x2={width - padding} y2={padding} stroke="#222" strokeWidth="1" strokeDasharray="4 4" />
                                                <line x1={padding} y1={padding + chartHeight / 2} x2={width - padding} y2={padding + chartHeight / 2} stroke="#222" strokeWidth="1" strokeDasharray="4 4" />
                                                <line x1={padding} y1={padding + chartHeight} x2={width - padding} y2={padding + chartHeight} stroke="#333" strokeWidth="1" />
                                                <path d={viewPathStr} fill="none" stroke="#00FFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                                <path d={likesPathStr} fill="none" stroke="#EF4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="2 2" />
                                                {chartData.map((d, idx) => {
                                                    const vCoords = getCoords(idx, d.views);
                                                    return (
                                                        <g key={idx}>
                                                            <circle cx={vCoords.x} cy={vCoords.y} r="4.5" fill="#00FFFF" stroke="#0A0A0A" strokeWidth="1.5" />
                                                            <text x={vCoords.x} y={height - 8} fill="#666" fontSize="9" textAnchor="middle" fontWeight="bold">{d.label}</text>
                                                        </g>
                                                    );
                                                })}
                                            </svg>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                            <div style={{ background: 'rgba(0, 255, 255, 0.03)', border: '1px solid rgba(0, 255, 255, 0.1)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                                                <p style={{ margin: 0, color: '#00FFFF', fontSize: '20px', fontWeight: 'bold' }}>👁️ {maxViews.toLocaleString()}</p>
                                                <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Views This Period</p>
                                            </div>
                                            <div style={{ background: 'rgba(239, 68, 68, 0.03)', border: '1px solid rgba(239, 68, 68, 0.1)', padding: '12px', borderRadius: '8px', textAlign: 'center' }}>
                                                <p style={{ margin: 0, color: '#EF4444', fontSize: '20px', fontWeight: 'bold' }}>❤️ {maxLikes.toLocaleString()}</p>
                                                <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#888', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Likes This Period</p>
                                            </div>
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    </div>
                </div>
            )}

            {/* ====== THE LIVE LEADERBOARD MODAL ====== */}
            {isLeaderboardModalOpen && (
                <div className="modal-backdrop" onClick={() => setIsLeaderboardModalOpen(false)}>
                    <div className="modal-content" style={{ maxWidth: '440px', border: '1px solid #00FFFF' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <p className="modal-title" style={{ color: '#00FFFF' }}>🏆 Monthly Leaderboard</p>
                            <button className="modal-close-button" onClick={() => setIsLeaderboardModalOpen(false)}>&times;</button>
                        </div>
                        <div className="modal-body" style={{ maxHeight: '420px', overflowY: 'auto', padding: '15px' }}>
                            <p style={{ color: '#888', fontSize: '12px', margin: '0 0 15px 0', textAlign: 'center' }}>
                                Top performers of the month by total gifts received. Tap any creator to view their public profile.
                            </p>

                            {leaderboardUsers.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {leaderboardUsers.map((user, idx) => {
                                        const isMe = user.id === currentUser?.uid;
                                        return (
                                            <div 
                                                key={user.id}
                                                onClick={() => {
                                                    window.dispatchEvent(new CustomEvent('navigateToUserProfile', { detail: { userId: user.id } }));
                                                    setIsLeaderboardModalOpen(false);
                                                }}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    background: isMe ? 'rgba(0, 255, 255, 0.05)' : 'rgba(255,255,255,0.02)',
                                                    border: isMe ? '1px solid rgba(0, 255, 255, 0.4)' : '1px solid rgba(255,255,255,0.05)',
                                                    borderRadius: '8px',
                                                    padding: '10px 14px',
                                                    cursor: 'pointer',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={e => { if (!isMe) e.currentTarget.style.borderColor = '#00FFFF'; }}
                                                onMouseLeave={e => { if (!isMe) e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)'; }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <span className="supporter-rank" style={{ fontSize: '14px', color: idx === 0 ? '#FFD700' : idx === 1 ? '#C0C0C0' : idx === 2 ? '#CD7F32' : '#AAA', minWidth: '24px' }}>
                                                        #{idx + 1}
                                                    </span>
                                                    <img 
                                                        src={user.profilePictureUrl || 'https://placehold.co/32'} 
                                                        alt="Creator Avatar" 
                                                        style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} 
                                                        onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/32'; }}
                                                    />
                                                    <div>
                                                        <span style={{ display: 'block', color: '#FFF', fontWeight: 'bold', fontSize: '13px' }}>
                                                            {user.creatorName || "NVA Creator"} {isMe && <span style={{ color: '#00FFFF', fontSize: '11px', fontWeight: 'normal' }}>(You)</span>}
                                                        </span>
                                                        <span style={{ fontSize: '11px', color: '#888' }}>
                                                            Role: {user.creatorField || 'Creator'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <span style={{ fontFamily: 'monospace', color: '#FFD700', fontSize: '13px', fontWeight: 'bold' }}>
                                                    {user.giftsReceived || 0} Gifts
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{ textAlign: 'center', padding: '30px 10px', color: '#666', fontSize: '13px' }}>
                                    No entries found in the leaderboard yet.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* --- CUSTOM WARNING MODAL FOR ROLE SELECTION --- */}
            {showRoleWarningModal && (
                <div className="modal-backdrop">
                    <div className="modal-content" style={{ maxWidth: '400px', border: '1px solid #FFD700' }}>
                        <div className="modal-header" style={{ borderBottom: '1px solid #333' }}>
                            <p className="modal-title" style={{ color: '#FFD700' }}>Confirm Creator Role</p>
                        </div>
                        <div className="modal-body" style={{ textAlign: 'center' }}>
                            <p style={{ color: '#FFF', fontSize: '16px', marginBottom: '15px' }}>
                                You are about to select <strong>{editCreatorField || "Normal User"}</strong>.
                            </p>
                            <p style={{ color: '#AAA', fontSize: '13px', lineHeight: '1.5' }}>
                                🚨 <strong>This selection is permanent!</strong> Once confirmed, this Creator Role will be locked to your profile and cannot be changed later.
                            </p>
                            <div style={{ display: 'flex', gap: '10px', marginTop: '25px' }}>
                                <button className="button" onClick={() => setShowRoleWarningModal(false)} style={{ flex: 1, backgroundColor: '#333', margin: 0 }}>
                                    <span className="buttonText light">Cancel</span>
                                </button>
                                <button className="button" onClick={executeSaveProfile} style={{ flex: 1, backgroundColor: '#FFD700', margin: 0 }}>
                                    <span className="buttonText" style={{ color: '#0A0A0A', fontWeight: 'bold' }}>Confirm & Save</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ====== ROAST TOKEN VAULT MODAL ====== */}
            <RoastTokenVault 
                isOpen={isTokenVaultOpen} 
                onClose={() => setIsTokenVaultOpen(false)} 
                currentUser={currentUser}
                creatorProfile={creatorProfile}
                showMessage={showMessage}
                setPledgeContext={setPledgeContext}
                setActiveScreen={setActiveScreen}
            />

            {/* ====== MY FILM OFFICE SUBMISSION MODAL ====== */}
            {showFilmOfficeModal && (
                <div className="modal-backdrop" onClick={() => setShowFilmOfficeModal(false)}>
                    <div className="modal-content" style={{ maxWidth: '600px', border: '1px solid #FFD700', background: '#0a0a0a' }} onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <p className="modal-title" style={{ color: '#FFD700' }}>🎬 Submit New Film</p>
                            <button className="modal-close-button" onClick={() => setShowFilmOfficeModal(false)}>&times;</button>
                        </div>
                        <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto', padding: '20px' }}>
                            <form onSubmit={handleFilmSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                <div className="formGroup">
                                    <label className="formLabel">Production Title</label>
                                    <input type="text" className="formInput" value={filmForm.title} onChange={e => setFilmForm({...filmForm, title: e.target.value})} required />
                                </div>
                                <div className="formGroup">
                                    <label className="formLabel">Genre</label>
                                    <select className="formInput" value={filmForm.genre} onChange={e => setFilmForm({...filmForm, genre: e.target.value})}>
                                        {["Action", "Comedy", "Drama", "Documentary", "Horror", "Sci-Fi", "Thriller"].map(g => <option key={g} value={g}>{g}</option>)}
                                    </select>
                                </div>
                                <div className="formGroup">
                                    <label className="formLabel">Cast & Director Credits</label>
                                    <input type="text" className="formInput" placeholder="e.g. Directed by John Doe, Starring Jane Smith" value={filmForm.credits} onChange={e => setFilmForm({...filmForm, credits: e.target.value})} required />
                                </div>
                                <div className="formGroup">
                                    <label className="formLabel">Synopsis</label>
                                    <textarea className="formTextarea" value={filmForm.synopsis} onChange={e => setFilmForm({...filmForm, synopsis: e.target.value})} required />
                                </div>
                                <div className="formGroup">
                                    <label className="formLabel">Video URL (Optional)</label>
                                    <input type="url" className="formInput" placeholder="https://..." value={filmForm.videoUrl} onChange={handleVideoUrlChange} />
                                </div>

                                <div className="formGroup">
                                    <label className="formLabel">Trailer URL (Optional - Adds a Watch Trailer button)</label>
                                    <input type="url" className="formInput" placeholder="YouTube or Vimeo Trailer Link..." value={filmForm.trailerUrl || ''} onChange={e => setFilmForm({...filmForm, trailerUrl: e.target.value})} />
                                </div>
                                
                                <div className="formGroup">
                                    <label className="formLabel">Movie Poster <span style={{color:'#DC3545'}}>*</span></label>
                                    <p style={{fontSize: '11px', color: '#888', margin: '0 0 8px 0'}}>If your video URL doesn't auto-pull a thumbnail, you MUST upload a poster to submit.</p>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <label className="modern-button" style={{ margin: 0, padding: '8px 16px', backgroundColor: '#3A3A3A', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', border: 'none' }}>
                                            <span className="buttonText">{isUploadingPoster ? "Uploading..." : "📁 Upload Movie Poster"}</span>
                                            <input type="file" accept="image/*" onChange={handlePosterUpload} style={{ display: 'none' }} disabled={isUploadingPoster} />
                                        </label>
                                    </div>
                                </div>

                                {filmForm.posterUrl && (
                                    <div style={{ marginTop: '5px', position: 'relative', width: '100px', height: '150px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #444', backgroundColor: '#000' }}>
                                        <img src={filmForm.posterUrl} alt="Poster Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        <button 
                                            type="button" 
                                            onClick={() => setFilmForm({...filmForm, posterUrl: ''})} 
                                            style={{ position: 'absolute', top: '4px', right: '4px', backgroundColor: 'rgba(220,53,69,0.9)', color: '#FFF', border: 'none', borderRadius: '50%', width: '20px', height: '20px', cursor: 'pointer', fontSize: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            ✕
                                        </button>
                                    </div>
                                )}
                                
                                <p style={{ color: '#FFF', fontWeight: 'bold', margin: '10px 0 0 0', borderBottom: '1px solid #333', paddingBottom: '10px' }}>Release Strategy</p>
                                
                                {filmForm.type === 'donation' && myArenaFilms.some(f => f.type === 'donation' && f.id !== editingFilmId) && (
                                    <p style={{ color: '#00FFFF', fontSize: '11px', fontWeight: 'bold', margin: '0 0 10px 0', background: 'rgba(0,255,255,0.1)', padding: '8px', borderRadius: '6px' }}>
                                        ⚠️ Note: You already have a Donation film. If Admin approves this one, your old film will automatically downgrade to a Free Showcase to maintain your 1-Donation limit.
                                    </p>
                                )}
                                {filmForm.type === 'premiere' && myArenaFilms.some(f => f.type === 'premiere' && f.id !== editingFilmId) && (
                                    <p style={{ color: '#FFD700', fontSize: '11px', fontWeight: 'bold', margin: '0 0 10px 0', background: 'rgba(255,215,0,0.1)', padding: '8px', borderRadius: '6px' }}>
                                        ⚠️ Note: You already have a Premiere film. If Admin approves this one, your old film will automatically downgrade to a Free Showcase to maintain your 1-Premiere limit.
                                    </p>
                                )}

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <div 
                                        onClick={() => setFilmForm({...filmForm, type: 'free', premiereDate: ''})}
                                        style={{ gridColumn: 'span 2', padding: '12px', borderRadius: '12px', border: filmForm.type === 'free' ? '2px solid #FFF' : '1px solid #333', background: filmForm.type === 'free' ? 'rgba(255, 255, 255, 0.1)' : '#111', cursor: 'pointer', transition: '0.2s' }}
                                    >
                                        <p style={{ margin: '0 0 4px 0', color: '#FFF', fontWeight: '900', fontSize: '13px' }}>🎬 Free Public Showcase</p>
                                        <p style={{ margin: 0, color: '#AAA', fontSize: '11px' }}>Publish safely to the Arena as a standard, unmonetized film.</p>
                                    </div>
                                    
                                    {creatorProfile?.enableDonationSubmissions && (
                                        <div 
                                            onClick={() => setFilmForm({...filmForm, type: 'donation', premiereDate: ''})}
                                            style={{ padding: '12px', borderRadius: '12px', border: filmForm.type === 'donation' ? '2px solid #00FFFF' : '1px solid #333', background: filmForm.type === 'donation' ? 'rgba(0, 255, 255, 0.1)' : '#111', cursor: 'pointer', transition: '0.2s' }}
                                        >
                                            <p style={{ margin: '0 0 4px 0', color: '#00FFFF', fontWeight: '900', fontSize: '13px' }}>🎁 Public Film Arena</p>
                                            <p style={{ margin: 0, color: '#AAA', fontSize: '11px' }}>Receive viewer donations.</p>
                                        </div>
                                    )}
                                    {creatorProfile?.enablePremiereSubmissions && (
                                        <div 
                                            onClick={() => setFilmForm({...filmForm, type: 'premiere'})}
                                            style={{ padding: '12px', borderRadius: '12px', border: filmForm.type === 'premiere' ? '2px solid #FFD700' : '1px solid #333', background: filmForm.type === 'premiere' ? 'rgba(255, 215, 0, 0.1)' : '#111', cursor: 'pointer', transition: '0.2s' }}
                                        >
                                            <p style={{ margin: '0 0 4px 0', color: '#FFD700', fontWeight: '900', fontSize: '13px' }}>🎟️ Live Watch Party</p>
                                            <p style={{ margin: 0, color: '#AAA', fontSize: '11px' }}>Host ticketed live events.</p>
                                        </div>
                                    )}
                                </div>

                                {filmForm.type === 'premiere' && (
                                    <div className="formGroup" style={{ marginTop: '10px', background: 'rgba(255,215,0,0.05)', padding: '15px', borderRadius: '8px', border: '1px dashed rgba(255,215,0,0.3)' }}>
                                        <label className="formLabel" style={{ color: '#FFD700' }}>Select Virtual Room</label>
                                        <select className="formInput" value={filmForm.room || 'Room 1'} onChange={e => setFilmForm({...filmForm, room: e.target.value})} style={{ background: '#000', color: '#FFF' }}>
                                            {(creatorProfile?.role?.toLowerCase() === 'admin' ? ["Room 1", "Room 2", "Room 3", "Room 4", "Room 5", "Free Screening Room"] : ["Room 1", "Room 2", "Room 3", "Room 4", "Room 5"]).map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                        
                                        <label className="formLabel" style={{ color: '#FFD700', marginTop: '10px' }}>Schedule Premiere Date & Time (Tap icon to open Calendar)</label>
                                        <input type="datetime-local" className="formInput" style={{ background: '#000', color: '#FFF' }} value={filmForm.premiereDate} onClick={(e) => e.target.showPicker && e.target.showPicker()} onChange={e => setFilmForm({...filmForm, premiereDate: e.target.value})} required />
                                        
                                        <label className="formLabel" style={{ color: '#FFD700', marginTop: '10px' }}>Ticket Price (USD)</label>
                                        <input type="number" min="0" step="0.50" className="formInput" value={filmForm.ticketPrice || '5.00'} onChange={e => setFilmForm({...filmForm, ticketPrice: e.target.value})} style={{ background: '#000', color: '#FFF' }} required />

                                        <p style={{ margin: '10px 0 0 0', fontSize: '11px', color: '#AAA' }}>*Turn your release into an event! Sell virtual tickets to your Live Premiere Watch Party. You keep the lion's share of your ticket sales (subject to standard 15% platform fee).</p>
                                    </div>
                                )}

                                <button className="modern-button" type="submit" disabled={isSubmittingFilm || isUploadingPoster} style={{ background: '#FFD700', color: '#000', border: 'none', padding: '15px', fontWeight: '900', fontSize: '16px', borderRadius: '8px', marginTop: '15px' }}>
                                    {isSubmittingFilm ? 'Submitting...' : 'Submit to Admin Queue'}
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default CreatorDashboardScreen;