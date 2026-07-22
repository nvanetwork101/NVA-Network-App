import React, { useState, useEffect, useRef } from 'react';
import { db, functions, doc, onSnapshot, collection, query, where, getDocs, orderBy, limit, httpsCallable, updateDoc, getDoc, setDoc } from '../firebase';
import { Timestamp } from 'firebase/firestore';
import ProfilePictureModal from './ProfilePictureModal';
import { compressImage, uploadToR2 } from '../utils/r2Upload';

// --- THE NVA TOKEN CATALOG ---
const GIFT_TOKENS = [
    { id: 'spotlight', name: 'Warm Spotlight', price: 500, actorReceives: 425, platformFee: 75, icon: '🔦' },
    { id: 'popcorn', name: 'Golden Popcorn', price: 1000, actorReceives: 850, platformFee: 150, icon: '🍿' },
    { id: 'flare', name: 'Rainbow Flare', price: 2500, actorReceives: 2125, platformFee: 375, icon: '🌈' },
    { id: 'chair', name: "Director's Chair", price: 5000, actorReceives: 4250, platformFee: 750, icon: '🎬' },
    { id: 'producer', name: 'The Executive Producer', price: 10000, actorReceives: 8500, platformFee: 1500, icon: '💎' },
];

const MMG_NUMBER = "592-672-3204"; 
import RoleBadge from './RoleBadge'; 
import formatCurrency from '../utils/formatCurrency';

// --- Shared Role Colors Map ---
const ROLE_COLORS = {
    'Comedian': '#FF4500', 'Craft': '#D2691E', 'Health & Fitness': '#20B2AA',
    'Designer': '#FF1493', 'Influencer': '#00BFFF', 'Poet': '#9370DB',
    'Musician': '#32CD32', 'Filmmaker': '#FFD700', 'Actor': '#DC143C'
};

// --- Reusable Child Component for Stats ---
import ShareButton from './ShareButton';

const ContentStats = ({ item, currentUser, showMessage }) => {
    const LikeButtonVisual = () => (
         <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'rgba(10,10,10,0.7)', padding: '4px 12px', borderRadius: '15px', border: '1px solid #444' }}>
            <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: '#FFD700' }}>
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path>
            </svg>
            <span style={{color: '#FFF', fontSize: '12px'}}>{(item.likeCount || 0).toLocaleString()}</span>
        </div>
    );

    return (
        <div style={{ padding: '0 10px 10px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '5px', color: '#AAA', fontSize: '12px', background: 'transparent', marginTop: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'currentColor' }}><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 10c-2.48 0-4.5-2.02-4.5-4.5S9.52 5.5 12 5.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5zM12 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>
                <span>{(item.viewCount || 0).toLocaleString()}</span>
            </div>
            <LikeButtonVisual />
        </div>
    );
};

// --- GLOBAL 30-DAY GIFT BADGE RENDERER ---
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

// --- SLEEK PATRON STRIPE RENDERER ---
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

const UserProfileScreen = ({ 
    selectedUserId, 
    setActiveScreen,
    setSelectedCampaignId,
    setSelectedChatId,
    showMessage, 
    currentUser, 
    creatorProfile, 
    setOnConfirmationAction, 
    setShowConfirmationModal, 
    setConfirmationTitle, 
    setConfirmationMessage, 
    handleVideoPress,
    previousScreen,
    currencyRates,
    selectedCurrency,
    shouldOpenGiftModalOnLoad,
    setShouldOpenGiftModalOnLoad
}) => {
    const [profile, setProfile] = useState(null);

    // --- GIFT MODAL STATE ---
    const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
    const [giftTokens, setGiftTokens] = useState(GIFT_TOKENS);
    const [selectedToken, setSelectedToken] = useState(GIFT_TOKENS[0]);

    // Live-sync creator gift tokens from database
    useEffect(() => {
        if (!isGiftModalOpen) return;
        const unsub = onSnapshot(doc(db, "settings", "tokenEconomics"), (snap) => {
            if (snap.exists() && snap.data().giftTokens) {
                const gTokens = snap.data().giftTokens;
                setGiftTokens(gTokens);
                setSelectedToken(prev => gTokens.find(t => t.id === prev.id) || gTokens[0]);
            }
        });
        return () => unsub();
    }, [isGiftModalOpen]);
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [paymentId, setPaymentId] = useState('');
    const [screenshotBase64, setScreenshotBase64] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [successMode, setSuccessMode] = useState('earnings');

    const submitGiftPledge = async () => {
        if (!paymentId || !screenshotBase64) {
            showMessage("Please provide Payment ID and Receipt Screenshot.");
            return;
        }
        setIsSubmitting(true);
        try {
            const pledgeRef = doc(collection(db, "paymentPledges"));
            await setDoc(pledgeRef, {
                pledgeId: paymentId,
                internalId: pledgeRef.id,
                userId: currentUser.uid,
                userName: creatorProfile?.creatorName || currentUser.email,
                paymentType: 'giftToken',
                amount: selectedToken?.price || 0,
                status: 'pending',
                targetUserId: profile.id,
                targetActorName: profile.creatorName || '',
                giftName: selectedToken?.name || 'Gift',
                isAnonymous: isAnonymous,
                screenshotUrl: screenshotBase64,
                createdAt: new Date().toISOString()
            });
            setIsGiftModalOpen(false);
            setPaymentId('');
            setScreenshotBase64(null);
            setSuccessMode('mmg');
            setSubmitSuccess(true);
            showMessage(`Pledge Received! Once verified, your gift will be delivered.`);
            setTimeout(() => setSubmitSuccess(false), 3000);
        } catch (error) {
            console.error("Gift error:", error);
            showMessage("Failed to process gift.");
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [isFollowing, setIsFollowing] = useState(false);
    const [isFollowLoading, setIsFollowLoading] = useState(true);
    const [isBlocked, setIsBlocked] = useState(false);
    const [isBlockLoading, setIsBlockLoading] = useState(true);
    const [pinnedContent, setPinnedContent] = useState([]);
    const [allContent, setAllContent] = useState([]);
    const [arenaMovies, setArenaMovies] = useState([]); // THE FIX: Track Arena films separately
    const [loadingContent, setLoadingContent] = useState(true);
    const [showPfpModal, setShowPfpModal] = useState(false);
    const [enrollmentStatus, setEnrollmentStatus] = useState(null); 
    const [isUpdatingRole, setIsUpdatingRole] = useState(false);
    
    // --- R2 UPLOAD STATES ---
    const [isUploadingPfp, setIsUploadingPfp] = useState(false);
    const hiddenFileInput = useRef(null);
    
    // --- LIGHTBOX STATE ---
    const [selectedExhibitionImage, setSelectedExhibitionImage] = useState(null);

    useEffect(() => {
        if (shouldOpenGiftModalOnLoad) {
            setIsGiftModalOpen(true);
            setShouldOpenGiftModalOnLoad(false); 
        }
    }, [shouldOpenGiftModalOnLoad, setShouldOpenGiftModalOnLoad]);

    useEffect(() => {
        if (!selectedUserId) {
            setActiveScreen('DiscoverUsers');
            return;
        }

        setLoadingProfile(true);
        setLoadingContent(true);
        setIsFollowLoading(true);
        setIsBlockLoading(true);

        const userDocRef = doc(db, "creators", selectedUserId);
        const unsubscribeProfile = onSnapshot(
            userDocRef, 
            (userDocSnap) => {
                if (userDocSnap.exists()) {
                    const profileData = { id: userDocSnap.id, ...userDocSnap.data() };
                    setProfile(profileData);
                    fetchContentLibrary(profileData.id, profileData.pinnedContent || []);
                } else {
                    showMessage("This user profile could not be found.");
                    setActiveScreen('DiscoverUsers');
                }
                setLoadingProfile(false);
            },
            () => { setLoadingProfile(false); }
        );

        const enrollmentAppRef = doc(db, "enrollmentApplications", selectedUserId);
        const unsubscribeEnrollment = onSnapshot(
            enrollmentAppRef, 
            (snap) => { setEnrollmentStatus(snap.exists() ? snap.data() : null); },
            () => {}
        );

        let unsubscribeFollow = () => {};
        let unsubscribeBlock = () => {};
        if (currentUser) {
            const followDocRef = doc(db, "creators", selectedUserId, "followers", currentUser.uid);
            unsubscribeFollow = onSnapshot(
                followDocRef, 
                (snap) => {
                    setIsFollowing(snap.exists());
                    setIsFollowLoading(false);
                },
                () => { setIsFollowLoading(false); }
            );

            const blockDocRef = doc(db, "creators", currentUser.uid, "blockedUsers", selectedUserId);
            unsubscribeBlock = onSnapshot(
                blockDocRef, 
                (snap) => {
                    setIsBlocked(snap.exists());
                    setIsBlockLoading(false);
                },
                () => { setIsBlockLoading(false); }
            );
        } else {
            setIsFollowLoading(false);
            setIsBlockLoading(false);
        }

        // THE FIX: Listen for this user's films in the Arena (Movies collection)
        const arenaQuery = query(collection(db, "movies"), where("creatorId", "==", selectedUserId));
        const unsubArena = onSnapshot(arenaQuery, (snap) => {
            setArenaMovies(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });

        return () => {
            unsubscribeProfile();
            unsubscribeEnrollment();
            unsubscribeFollow();
            unsubscribeBlock();
            unsubArena(); // FIXED: Clean up Arena listener
        };
    }, [selectedUserId, currentUser]);

    const fetchContentLibrary = async (userId, pinnedIds) => {
        setLoadingContent(true);
        try {
            const contentRef = collection(db, `artifacts/production-app-id/public/data/content_items`);
            
            if (pinnedIds && pinnedIds.length > 0) {
                const pinnedQuery = query(contentRef, where("__name__", "in", pinnedIds), where("isActive", "==", true));
                const pinnedSnapshot = await getDocs(pinnedQuery);
                const pinnedData = pinnedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                pinnedData.sort((a, b) => pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id));
                setPinnedContent(pinnedData);
            } else {
                setPinnedContent([]);
            }

            const allContentQuery = query(contentRef, where("creatorId", "==", userId), where("isActive", "==", true), orderBy("createdAt", "desc"));
            const allContentSnapshot = await getDocs(allContentQuery);
            const allContentData = allContentSnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(item => !(pinnedIds && pinnedIds.includes(item.id))); 
            setAllContent(allContentData);

        } catch (error) {
            showMessage("Could not load the creator's content library.");
            console.error("Error fetching content library:", error);
        } finally {
            setLoadingContent(false);
        }
    };
    
    const handleFollowToggle = async () => {
        if (!currentUser) {
            showMessage("Please log in to follow creators.");
            setActiveScreen('Login');
            return;
        }
        if (isFollowLoading) return; 

        setIsFollowLoading(true);
        const newFollowState = !isFollowing; 

        try {
            const toggleFollowFunction = httpsCallable(functions, 'toggleFollow');
            await toggleFollowFunction({ 
                targetUserId: selectedUserId, 
                isFollowing: newFollowState 
            });
        } catch (error) {
            showMessage(`An error occurred: ${error.message}`);
            console.error("Error toggling follow:", error);
        } finally {
            setIsFollowLoading(false);
        }
    };
    
    const handleToggleBlock = async () => {
        if (!currentUser) {
            showMessage("Please log in to block users.");
            setActiveScreen('Login');
            return;
        }
        if (isBlockLoading) return;

        setIsBlockLoading(true);

        try {
            const toggleBlockUserCallable = httpsCallable(functions, 'toggleBlockUser');
            const result = await toggleBlockUserCallable({ targetUserId: selectedUserId });
            showMessage(result.data.message);
            if (!isBlocked) { 
                setActiveScreen('DiscoverUsers');
            }
        } catch (error) {
            showMessage(`An error occurred: ${error.message}`);
            console.error("Error toggling block:", error);
        } finally {
            setIsBlockLoading(false);
        }
    };

    const handleMessageClick = async () => {
        if (!currentUser || !creatorProfile) {
            showMessage("Please log in to send messages.");
            setActiveScreen('Login');
            return;
        }

        const targetUserUid = profile.id;
        if (currentUser.uid === targetUserUid) {
            showMessage("You cannot start a conversation with yourself.");
            return;
        }

        const participants = [currentUser.uid, targetUserUid].sort();
        const chatId = participants.join('_');
        
        try {
            const chatDocRef = doc(db, 'chats', chatId);

            const initialChatData = {
                participants: participants,
                createdAt: Timestamp.now(),
                participantDetails: {
                    [currentUser.uid]: {
                        creatorName: creatorProfile.creatorName || "Unknown User",
                        profilePictureUrl: creatorProfile.profilePictureUrl || null
                    },
                    [targetUserUid]: {
                        creatorName: profile.creatorName,
                        profilePictureUrl: profile.profilePictureUrl || null
                    }
                },
                hiddenFor: []
            };

            await setDoc(chatDocRef, initialChatData, { merge: true });

            setSelectedChatId(chatId);
            setActiveScreen('ChatMessageScreen');
        } catch (error) {
            console.error("Error starting chat:", error);
            showMessage("Could not start a conversation. Please check your Firestore Rules for the 'chats' collection.");
        }
    };

    const handleShareClick = async () => {
        const shareUrl = `${window.location.origin}/user/${profile.id}`;
        if (navigator.share) {
            try {
                await navigator.share({
                    title: profile.creatorName,
                    text: `Check out ${profile.creatorName}'s profile on NVA Network!`,
                    url: shareUrl
                });
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error("Sharing failed:", error);
                    showMessage("Could not share profile at this time.");
                }
            }
        } else {
            try {
                await navigator.clipboard.writeText(shareUrl);
                showMessage("Profile URL copied to clipboard!");
            } catch (err) {
                console.error('Failed to copy: ', err);
                showMessage("Could not copy URL. Your browser may not support this feature.");
            }
        }
    };

    const handleShareGallery = async (e) => {
        e.stopPropagation();
        // INJECTED ?view=gallery parameter for Backend SSR Crawler Interception
        const shareUrl = `${window.location.origin}/user/${profile.id}?view=gallery#gallery`;
        const text = `🎨 Check out my creative Exhibition Room on NVA Network! View my custom design gallery:`;
        
        if (navigator.share) {
            try {
                await navigator.share({
                    title: `${profile.creatorName}'s Exhibition`,
                    text: text,
                    url: shareUrl
                });
            } catch (error) {
                if (error.name !== 'AbortError') console.error(error);
            }
        } else {
            try {
                await navigator.clipboard.writeText(shareUrl);
                showMessage("Exhibition link copied!");
            } catch (err) {
                showMessage("Could not copy link.");
            }
        }
    };
    
    const handleRoleChange = async (newRole) => { /* ... existing logic ... */ };
    
    const handleToggleBan = () => {
        const action = profile.banned ? 'Unban' : 'Ban';
        setConfirmationTitle(`${action} User?`);
        setConfirmationMessage(`Are you sure you want to ${action.toLowerCase()} user ${profile.creatorName}?`);
        setOnConfirmationAction(() => async () => {
            showMessage(`Processing ${action}...`);
            try {
                const toggleBanFunction = httpsCallable(functions, 'toggleUserBanStatus');
                const result = await toggleBanFunction({ targetUserId: profile.id });
                showMessage(result.data.message);
            } catch (error) {
                showMessage(`Error: ${error.message}`);
            }
        });
        setShowConfirmationModal(true);
    };
    
    const handleLiftSuspension = () => {
        setConfirmationTitle("Lift Suspension?");
        setConfirmationMessage(`Are you sure you want to immediately lift the suspension for ${profile.creatorName}?`);
        setOnConfirmationAction(() => async () => {
            showMessage("Lifting suspension...");
            try {
                const liftSuspensionFunction = httpsCallable(functions, 'liftUserSuspension');
                const result = await liftSuspensionFunction({ targetUserId: profile.id });
                showMessage(result.data.message);
            } catch (error) {
                showMessage(`Error: ${error.message}`);
            }
        });
        setShowConfirmationModal(true);
    };

    const handleDeleteUser = () => {
        setConfirmationTitle("🛑 PERMANENTLY DELETE USER? 🛑");
        setConfirmationMessage(`You are about to delete '${profile.creatorName}' and ALL of their data. This action is irreversible. Are you absolutely sure?`);
        setOnConfirmationAction(() => async () => {
            showMessage("Initiating permanent deletion...");
            try {
                const deleteUserCallable = httpsCallable(functions, 'deleteUserAccount');
                const result = await deleteUserCallable({ userIdToDelete: profile.id });
                showMessage(result.data.message);
                setActiveScreen('AdminDashboard');
            } catch (error) {
                console.error("Error deleting user:", error);
                showMessage(`Deletion failed: ${error.message}`);
            }
        });
        setShowConfirmationModal(true);
    };

    const handlePfpUpload = async (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        setIsUploadingPfp(true);
        showMessage("Compressing and uploading to Cloudflare R2...");
        
        try {
            // 1. Native Client-Side Compression
            const compressedFile = await compressImage(file, 1080, 0.85);
            
            // 2. Exact static overwrite path (Zero dust rule)
            const r2Path = `profile_pictures/user_${currentUser.uid}.jpg`;
            
            // 3. Backend Handshake & Direct PUT
            const publicUrl = await uploadToR2(compressedFile, r2Path, functions);
            
            // 4. Update Firestore Profile
            const userRef = doc(db, 'creators', currentUser.uid);
            await updateDoc(userRef, { profilePictureUrl: publicUrl });
            
            showMessage("Profile picture instantly updated via R2!");
        } catch (error) {
            console.error("Avatar R2 upload failed:", error);
            showMessage(`Upload failed: ${error.message}`);
        } finally {
            setIsUploadingPfp(false);
            event.target.value = null; // Clear input
        }
    };

    if (loadingProfile) { return <div className="screenContainer"><p className="heading">Loading Profile...</p></div>; }
    if (!profile) return null;

    const canManageUser = creatorProfile && (creatorProfile.role === 'admin' || creatorProfile.role === 'authority' || creatorProfile.role === 'super_admin') && currentUser?.uid !== profile.id;
    const isSuspended = profile.suspendedUntil && profile.suspendedUntil.toDate() > new Date();

    // Centralize roleColor derivation
    const roleColor = ROLE_COLORS[profile.creatorField] || '#444444';

    const modernRewardsStyles = `
        .rewards-stats-card { background: rgba(30, 30, 30, 0.7); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 12px; padding: 20px; display: flex; justify-content: space-between; margin-top: 20px; box-shadow: 0 4px 15px rgba(0,0,0,0.5); backdrop-filter: blur(10px); }
        .rewards-stat-col { text-align: center; flex: 1; border-right: 1px solid rgba(255, 255, 255, 0.1); }
        .rewards-stat-col:last-child { border-right: none; }
        .rewards-stat-value { font-size: 24px; font-weight: bold; color: #00FFFF; margin: 0; }
        .rewards-stat-value.gold { color: #FFD700; }
        .rewards-stat-label { font-size: 11px; color: #AAA; text-transform: uppercase; margin-top: 5px; letter-spacing: 0.5px; }
        .gift-btn { width: 100%; background: linear-gradient(135deg, #8A2BE2, #E539A1); color: white; border: none; padding: 15px; border-radius: 12px; font-size: 16px; font-weight: bold; margin-top: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 10px; transition: transform 0.2s; box-shadow: 0 4px 15px rgba(138, 43, 226, 0.4); }
        .gift-btn:active { transform: scale(0.98); }
        .leaderboard-card { background: rgba(20, 20, 20, 0.8); border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 12px; padding: 20px; margin-top: 20px; }
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
        .how-it-works-box { border: 1px dashed rgba(255, 255, 255, 0.2); border-radius: 12px; padding: 20px; margin-top: 20px; background: rgba(0,0,0,0.2); }
        .step-row { display: flex; align-items: flex-start; gap: 15px; margin-bottom: 15px; }
        .step-number { background: rgba(255, 255, 255, 0.1); color: #FFF; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0; }
        .step-text h4 { color: #FFF; font-size: 13px; margin: 0 0 3px 0; }
        .step-text p { color: #888; font-size: 11px; margin: 0; }
        .patron-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px; }
        .patron-tier { background: rgba(255, 255, 255, 0.05); padding: 12px; border-radius: 8px; text-align: left; }
        .tier-name { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #FFF; font-weight: bold; margin-bottom: 4px; }
        .tier-price { font-size: 11px; color: #888; }
        .dot { width: 8px; height: 8px; border-radius: 50%; }

        /* ====== UNIFIED ATELIER CSS ====== */
        .atelier-container {
            border-radius: 16px;
            padding: 24px;
            margin-bottom: 24px;
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            box-shadow: 0 10px 40px rgba(0,0,0,0.5);
        }
        .atelier-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 15px;
            width: 100%;
        }
        @media (max-width: 1024px) {
            .atelier-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
        }
        .atelier-card {
            transition: all 0.3s ease;
            position: relative;
            overflow: hidden;
            border-radius: 12px;
            cursor: pointer;
            display: flex;
            flex-direction: column;
            background: #111111;
            border: 1px solid #333;
        }
        .atelier-card:hover { transform: translateY(-4px); box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
        .atelier-card img { width: 100%; height: auto; display: block; transition: transform 0.5s ease; }
        .atelier-card:hover img { transform: scale(1.05); }
        .pinned-card { border: 2px solid #FFD700 !important; box-shadow: 0 0 20px rgba(255, 215, 0, 0.2); }
        .pinned-card::before { content: 'PINNED'; position: absolute; top: 8px; left: 50%; transform: translateX(-50%); background: #FFD700; color: #000; font-size: 8px; font-weight: 900; padding: 2px 10px; border-radius: 100px; z-index: 10; }

        /* ===== STUDIO GALLERY (OVERLAPPING COLLAGE MODEL - iOS WEBKIT OPTIMIZED) ===== */
        .studio-gallery-collage { 
            position: relative; 
            width: 100%; 
            max-width: 440px; 
            margin: 20px auto 0 auto; 
            aspect-ratio: 1 / 1; 
            background: rgba(0,0,0,0.15);
            border-radius: 20px;
            border: 1px solid rgba(255,255,255,0.04);
            padding: 15px;
            box-sizing: border-box;
        }
        .lightbox-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.95); backdrop-filter: blur(10px); z-index: 9999; display: flex; align-items: center; justify-content: center; cursor: zoom-out; padding: 20px; }
        .lightbox-image { max-width: 100%; max-height: 100vh; object-fit: contain; border-radius: 8px; box-shadow: 0 10px 50px rgba(0,0,0,0.8); }
        .gallery-slot { 
            position: absolute; 
            background: #0D0D0D; 
            border: 4px solid #FFFFFF; 
            box-shadow: 0 8px 24px rgba(0,0,0,0.5); 
            cursor: pointer; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1); 
            -webkit-transform: translate3d(0,0,0); 
            transform: translate3d(0,0,0); 
            box-sizing: border-box;
        }
        .gallery-slot:hover { 
            transform: scale(1.05) translateY(-2px); 
            z-index: 15 !important; 
            box-shadow: 0 12px 30px rgba(255,215,0,0.3);
            border-color: #FFD700;
        }
        .gallery-slot img { 
            width: 100%; 
            height: 100%; 
            object-fit: cover; 
        }
        .slot-0 { width: 38%; height: 38%; top: 4%; left: 31%; z-index: 1; }
        .slot-1 { width: 36%; height: 36%; top: 24%; left: 4%; z-index: 3; }
        .slot-2 { width: 36%; height: 36%; top: 24%; left: 60%; z-index: 2; }
        .slot-3 { width: 34%; height: 34%; top: 58%; left: 14%; z-index: 4; }
        .slot-4 { width: 34%; height: 34%; top: 58%; left: 52%; z-index: 1; }

        /* ====== GIFT MODAL INTERFACE ====== */
        .gift-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; z-index: 1200; padding: 16px; }
.gift-modal { background: linear-gradient(180deg, #111111 0%, #050505 100%); border: 1px solid rgba(255,215,0,0.15); border-radius: 24px; width: 100%; max-width: 440px; max-height: 90vh; overflow-y: auto; padding: 32px; box-shadow: 0 30px 60px rgba(0,0,0,0.9), inset 0 1px 1px rgba(255,255,255,0.05); text-align: left; }

.modal-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
.modal-close { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #FFF; font-size: 18px; cursor: pointer; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.2s; }
.modal-close:hover { background: #DC3545; border-color: #DC3545; transform: scale(1.05); }

/* Sleek Token Cards */
.token-card { display: flex; align-items: center; gap: 16px; padding: 14px 16px; border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; margin-bottom: 12px; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); background: rgba(25,25,25,0.4); text-align: left; position: relative; overflow: hidden; }
.token-card:hover { background: rgba(255,215,0,0.03); border-color: rgba(255,215,0,0.3); transform: translateY(-2px); }
.token-card.selected { background: linear-gradient(90deg, rgba(255,215,0,0.1) 0%, rgba(255,215,0,0.02) 100%); border-color: #FFD700; box-shadow: 0 0 20px rgba(255,215,0,0.1); }
.token-card.selected::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: #FFD700; border-radius: 4px 0 0 4px; }

.token-icon { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(0,0,0,0.5)); border: 1px solid rgba(255,255,255,0.05); box-shadow: inset 0 2px 5px rgba(255,255,255,0.1); }
.token-info { flex: 1; }
.token-name { font-size: 15px; font-weight: 800; color: #FFFFFF; margin: 0 0 4px 0; letter-spacing: 0.02em; }
.token-breakdown { font-size: 10px; color: #888; margin: 0; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
.token-price { font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 900; color: #FFD700; flex-shrink: 0; background: rgba(0,0,0,0.5); padding: 4px 10px; border-radius: 8px; border: 1px solid rgba(255,215,0,0.2); }

/* Premium Breakdown Box */
.breakdown-detail { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 20px; margin: 20px 0; text-align: left; }
.breakdown-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; font-weight: 600; }
.breakdown-row.border { border-bottom: 1px dashed rgba(255,255,255,0.1); margin-bottom: 8px; padding-bottom: 12px; }
.breakdown-label { color: #888; text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px; }
.breakdown-value { color: #FFF; font-family: 'JetBrains Mono', monospace; }
.breakdown-value.negative { color: #F87171; }
.breakdown-value.positive { color: #4ADE80; font-size: 14px; text-shadow: 0 0 10px rgba(74,222,128,0.3); }

/* Modern Instructions */
.mmg-instructions { background: rgba(0,255,255,0.03); border-left: 3px solid #00FFFF; border-radius: 0 12px 12px 0; padding: 16px; margin: 20px 0; font-size: 12px; text-align: left; line-height: 1.6; color: #CCC; }
.mmg-instructions p { margin: 0 0 8px 0; }
.mmg-instructions p:last-child { margin: 0; }
.mmg-instructions strong { color: #00FFFF; font-family: 'JetBrains Mono', monospace; }

/* THE GLASSMORPHIC EARNINGS BUTTON */
        .earnings-btn {
            width: 100%; padding: 16px; border-radius: 14px; font-size: 14px; font-weight: 900; cursor: pointer; transition: all 0.2s ease-out; text-transform: uppercase; letter-spacing: 0.05em;
            background: rgba(255, 215, 0, 0.04); 
            border: 1px solid rgba(255, 215, 0, 0.25); 
            color: #FFD700; 
            backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            box-shadow: 0 4px 15px rgba(255, 215, 0, 0.05);
        }
        .earnings-btn:hover:not(:disabled) {
            background: rgba(255, 215, 0, 0.1);
            border-color: rgba(255, 215, 0, 0.5);
            box-shadow: 0 0 15px rgba(255, 215, 0, 0.15);
        }
        .earnings-btn:active:not(:disabled) {
            background: #FFD700; color: #000; border-color: #FFD700; box-shadow: 0 0 30px rgba(255,215,0,0.7); transform: scale(0.98);
        }
        .earnings-btn:disabled { opacity: 0.35; cursor: not-allowed; border-color: rgba(255,255,255,0.05); color: #666; background: rgba(255,255,255,0.02); }

        .anon-toggle { display: flex; align-items: center; gap: 10px; margin: 16px 0; cursor: pointer; }
.anon-toggle:hover { border: 1px solid rgba(255,255,255,0.1); }
.anon-toggle span { font-size: 12px; color: #AAA; font-weight: 600; }

/* Sleek Submit Button */
.submit-btn { width: 100%; padding: 16px; background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); color: #000; border: none; border-radius: 14px; font-size: 14px; font-weight: 900; cursor: pointer; transition: all 0.2s; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 8px; box-shadow: 0 10px 20px rgba(255,215,0,0.2); }
.submit-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 25px rgba(255,215,0,0.3); }
.submit-btn.cancel-btn { background: #1A1A1A; color: #FFF; border: 1px solid #333; box-shadow: none; }
.submit-btn.cancel-btn:hover { background: #222; border-color: #444; }
.success-state { text-align: center; padding: 30px 20px; }
.success-check { width: 64px; height: 64px; background: rgba(74, 222, 128, 0.1); border: 2px solid #4ADE80; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 28px; color: #4ADE80; box-shadow: 0 0 30px rgba(74,222,128,0.2); }
    `;

    return (
        <>
            <style>{modernRewardsStyles}</style>
            <div className="screenContainer">
                <div className="dashboardSection" style={{ border: 'none', background: 'transparent', padding: '10px 0' }}>
                    {/* --- MODERN CENTERED PROFILE HEADER --- */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                        <div style={{ position: 'relative', display: 'inline-block' }}>
                            <img 
                                src={profile.profilePictureUrl || 'https://placehold.co/120x120/555/FFF?text=P'} 
                                alt="Profile" 
                                style={{ 
                                    width: '110px', 
                                    height: '110px', 
                                    borderRadius: '50%', 
                                    border: '3px solid #FFD700', 
                                    objectFit: 'cover', 
                                    cursor: 'pointer', 
                                    boxShadow: '0 0 20px rgba(255,215,0,0.3)', 
                                    opacity: isUploadingPfp ? 0.3 : 1, 
                                    transition: 'opacity 0.3s' 
                                }} 
                                onClick={() => {
                                    if (currentUser && currentUser.uid === profile.id) {
                                        // Owner triggers R2 upload pipeline
                                        hiddenFileInput.current.click();
                                    } else {
                                        // Strangers trigger the zoom modal
                                        setShowPfpModal(true);
                                    }
                                }} 
                            />
                            {isUploadingPfp && (
                                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', color: '#FFD700', fontWeight: '900', fontSize: '11px', background: 'rgba(0,0,0,0.7)', padding: '6px 10px', borderRadius: '20px', pointerEvents: 'none', whiteSpace: 'nowrap' }}>
                                    UPLOADING...
                                </div>
                            )}
                            <input 
                                type="file" 
                                accept="image/*" 
                                ref={hiddenFileInput} 
                                style={{ display: 'none' }} 
                                onChange={handlePfpUpload} 
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap', margin: '15px 0 5px 0' }}>
                            <span style={{ fontSize: '24px', fontWeight: 'bold', color: '#FFF' }}>
                                {profile.creatorName}
                            </span>
                            {renderPatronStripe(profile)}
                        </div>
                        {/* 🛡️ ADMIN AUDIT PORTAL */}
                        {creatorProfile && (creatorProfile.role === 'admin' || creatorProfile.role === 'authority' || creatorProfile.role === 'super_admin') && profile.realName && (
                            <div style={{ background: 'rgba(255, 215, 0, 0.05)', border: '1px dashed rgba(255, 215, 0, 0.3)', padding: '12px 15px', borderRadius: '12px', margin: '-4px auto 15px auto', fontSize: '11px', color: '#AAA', maxWidth: '320px', textAlign: 'left', lineHeight: '1.4' }}>
                                <p style={{ margin: '0 0 6px 0', color: '#FFD700', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>🛡️ Private Admin Verification Portal</p>
                                <div><span style={{ color: '#888' }}>Verified Legal Name:</span> <strong style={{ color: '#FFF' }}>{profile.realName}</strong></div>
                                {profile.dateOfBirth && (
                                    <div style={{ marginTop: '2px' }}><span style={{ color: '#888' }}>Date of Birth:</span> <strong style={{ color: '#FFF' }}>{profile.dateOfBirth}</strong> (Age: {(() => {
                                        const today = new Date();
                                        const birthDate = new Date(profile.dateOfBirth);
                                        let calculatedAge = today.getFullYear() - birthDate.getFullYear();
                                        const m = today.getMonth() - birthDate.getMonth();
                                        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
                                            calculatedAge--;
                                        }
                                        return calculatedAge;
                                    })()})</div>
                                )}
                            </div>
                        )}
                        <p style={{ color: '#AAA', fontSize: '13px', maxWidth: '85%', margin: '0 auto 10px auto', lineHeight: '1.4' }}>
                            {profile.bio || "Welcome to my profile! Supporting the arts."}
                        </p>
                        
                        {/* --- ATELIER & WELLNESS CUSTOM CTAs --- */}
                        {profile.creatorField === 'Crafter / Designer' && (
                            <button className="button" style={{ background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#000', fontWeight: '900', borderRadius: '25px', padding: '8px 24px', margin: '10px 0', border: 'none', boxShadow: '0 4px 15px rgba(255, 215, 0, 0.3)' }} onClick={() => showMessage('Commission request system unlocking soon!')}>
                                🎨 Commission Me
                            </button>
                        )}
                        {profile.creatorField === 'Wellness Coach' && (
                            <button className="button" style={{ background: 'linear-gradient(135deg, #00FFFF, #00BFFF)', color: '#000', fontWeight: '900', borderRadius: '25px', padding: '8px 24px', margin: '10px 0', border: 'none', boxShadow: '0 4px 15px rgba(0, 255, 255, 0.3)' }} onClick={() => showMessage('Consultation booking system unlocking soon!')}>
                                🧘 Book Consultation
                            </button>
                        )}
                        {(() => {
                            const statusLower = enrollmentStatus?.status?.toLowerCase() || '';
                            
                            const isDocuSeries = statusLower !== '' && (() => {
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
                            })();

                            const isFilmClubUser = profile.isFilmClub || (!isDocuSeries && (
                                statusLower === 'enrolled' || statusLower === 'approved' || statusLower === 'paid' || statusLower === 'success'
                            ));

                            const isContestantUser = profile.isContestant || 
                                                     (profile.badges && profile.badges.includes('Contestant')) ||
                                                     (isDocuSeries && (
                                                         statusLower === 'enrolled' || statusLower === 'approved' || statusLower === 'paid' || statusLower === 'success'
                                                     ));

                            return (
                                <>
                                    <RoleBadge profile={{
                                        ...profile,
                                        isFilmClub: isFilmClubUser,
                                        isContestant: isContestantUser
                                    }} />
                                    {renderGlobalPatronGifts(profile)}
                                </>
                            );
                        })()}
                    </div>

                    {/* --- REWARDS STATS BLOCK --- */}
                    {creatorProfile && (creatorProfile.role === 'admin' || creatorProfile.role === 'authority' || creatorProfile.role === 'super_admin') && (
                        <div className="rewards-stats-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '15px 0' }}>
                            <div className="rewards-stat-col">
                                <p className="rewards-stat-value gold">
                                    {formatCurrency(profile.totalEarnings || 0, selectedCurrency, currencyRates)}
                                </p>
                                <p className="rewards-stat-label">Main Earnings</p>
                            </div>
                            <div className="rewards-stat-col">
                                <p className="rewards-stat-value" style={{ color: '#00FFFF' }}>
                                    {formatCurrency(profile.boxOfficeLedger?.ticketSales || 0, selectedCurrency, currencyRates)}
                                </p>
                                <p className="rewards-stat-label">Ticket Sales</p>
                            </div>
                            <div className="rewards-stat-col">
                                <p className="rewards-stat-value" style={{ color: '#FFD700' }}>
                                    {formatCurrency(profile.boxOfficeLedger?.filmDonations || 0, selectedCurrency, currencyRates)}
                                </p>
                                <p className="rewards-stat-label">Arena Donations</p>
                            </div>
                            <div className="rewards-stat-col">
                                <p className="rewards-stat-value" style={{ color: '#C084FC' }}>{profile.giftsReceived || 0}</p>
                                <p className="rewards-stat-label">Gifts Received</p>
                            </div>
                        </div>
                    )}

                    {/* --- SEND A GIFT BUTTON --- */}
                    {currentUser && currentUser.uid !== profile.id && (
                        <button className="gift-btn" onClick={() => setIsGiftModalOpen(true)}>
                            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                                <path d="M20 6h-2.18c.11-.31.18-.65.18-1a2.5 2.5 0 0 0-5-1c-.59 0-1.12.26-1.5.67-.38-.41-.91-.67-1.5-.67a2.5 2.5 0 0 0-5 1c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-3c.83 0 1.5.67 1.5 1.5S15.83 5 15 5h-1.5V4c0-.83.67-1.5 1.5-1.5zM9 3.5c.83 0 1.5.67 1.5 1.5V5H9c-.83 0-1.5-.67-1.5-1.5S8.17 3.5 9 3.5zM4 8h7v3H4V8zm0 11v-6h7v8H4c-.55 0-1-.45-1-1zm16 0c0 .55-.45 1-1 1h-7v-8h8v7zm0-10h-8V8h7c.55 0 1 .45 1 1v1z"/>
                            </svg>
                            Send a Gift
                        </button>
                    )}
                    <p style={{textAlign: 'center', fontSize: '10px', color: '#888', marginTop: '8px'}}>Gifts include votes for the bi-weekly competition + 15% platform fee</p>

                    {/* --- SOCIAL-MEDIA ACTION BAR --- */}
                    {currentUser && currentUser.uid !== selectedUserId && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '20px', width: '100%' }}>
                            <button 
                                onClick={handleFollowToggle} 
                                disabled={isFollowLoading} 
                                style={{ 
                                    margin: 0, 
                                    height: '38px', 
                                    backgroundColor: isFollowing ? 'transparent' : 'rgba(255, 215, 0, 0.15)', 
                                    border: isFollowing ? '1px solid rgba(255, 255, 255, 0.2)' : '1px solid rgba(255, 215, 0, 0.5)', 
                                    borderRadius: '20px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    cursor: 'pointer',
                                    flex: 2
                                }}
                            >
                                <span style={{ color: isFollowing ? '#FFFFFF' : '#FFD700', fontWeight: 'bold', fontSize: '13px' }}>
                                    {isFollowLoading ? '...' : (isFollowing ? '✓ Following' : 'Follow')}
                                </span>
                            </button>

                            <button 
                                title="Message User" 
                                onClick={handleMessageClick} 
                                style={{ 
                                    margin: 0, 
                                    height: '38px', 
                                    width: '38px', 
                                    backgroundColor: '#222', 
                                    border: '1px solid #444', 
                                    borderRadius: '50%', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    cursor: 'pointer',
                                    padding: 0
                                }}
                            >
                                <svg fill="#FFFFFF" viewBox="0 0 24 24" style={{ width: '18px', height: '18px' }}><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"></path></svg>
                            </button>

                            <button 
                                title="Share Profile" 
                                onClick={handleShareClick} 
                                style={{ 
                                    margin: 0, 
                                    height: '38px', 
                                    width: '38px', 
                                    backgroundColor: '#222', 
                                    border: '1px solid #444', 
                                    borderRadius: '50%', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    cursor: 'pointer',
                                    padding: 0
                                }}
                            >
                                <svg fill="#FFFFFF" viewBox="0 0 24 24" style={{ width: '18px', height: '18px' }}><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"></path></svg>
                            </button>

                            <button 
                                title={isBlocked ? "Unblock User" : "Block User"} 
                                onClick={handleToggleBlock} 
                                disabled={isBlockLoading} 
                                style={{ 
                                    margin: 0, 
                                    height: '38px', 
                                    backgroundColor: isBlocked ? '#FF8C00' : 'rgba(220, 53, 69, 0.1)', 
                                    border: isBlocked ? '1px solid #FF8C00' : '1px solid rgba(220, 53, 69, 0.4)', 
                                    borderRadius: '20px', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center', 
                                    cursor: 'pointer',
                                    flex: 1
                                }}
                            >
                                <span style={{ color: isBlocked ? '#000' : '#DC3545', fontWeight: 'bold', fontSize: '12px' }}>
                                    {isBlockLoading ? '...' : (isBlocked ? 'Unblock' : 'Block')}
                                </span>
                            </button>
                        </div>
                    )}

                    {/* --- FOLLOW STATS --- */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '30px', marginTop: '20px', padding: '15px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px' }}>
                        <div className="follow-stat-item" style={{textAlign: 'center'}}><span style={{display: 'block', fontSize: '18px', fontWeight: 'bold', color: '#FFF'}}>{profile.followerCount || 0}</span><span style={{fontSize: '11px', color: '#888', textTransform: 'uppercase'}}>Followers</span></div>
                        <div className="follow-stat-item" style={{textAlign: 'center'}}><span style={{display: 'block', fontSize: '18px', fontWeight: 'bold', color: '#FFF'}}>{profile.followingCount || 0}</span><span style={{fontSize: '11px', color: '#888', textTransform: 'uppercase'}}>Following</span></div>
                    </div>
                </div>

                {/* --- THE AUDIT PANELS (Wrapped in Staff Restriction) --- */}
                {creatorProfile && (creatorProfile.role === 'admin' || creatorProfile.role === 'authority') && (
                    <>
                        <div className="leaderboard-card">
                            <div className="leaderboard-header">
                                <p className="leaderboard-title"><span style={{color: '#E539A1'}}>♡</span> Top Supporters</p>
                                <p className="leaderboard-subtitle">0 total</p>
                            </div>
                            <div className="leaderboard-row">
                                <p style={{color: '#888', fontSize: '13px', fontStyle: 'italic'}}>Be the first to support this creator!</p>
                            </div>
                        </div>
                        
                        <div className="leaderboard-card">
                            <div className="leaderboard-header">
                                <p className="leaderboard-title"><span style={{color: '#FFD700'}}>🏆</span> This Week's Top Earners</p>
                                <p className="leaderboard-subtitle">Bi-Weekly Competition</p>
                            </div>
                            {[1, 2, 3].map((rank) => (
                                <div key={rank} className="leaderboard-row">
                                    <div className="supporter-info">
                                        <div className={`rank-circle rank-${rank}`}>{rank}</div>
                                        <span className="supporter-name">Creator {rank}</span>
                                    </div>
                                    <span className="supporter-amount">---</span>
                                </div>
                            ))}
                            <p style={{textAlign: 'center', fontSize: '10px', color: '#888', marginTop: '15px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px'}}>Top performers qualify for the <strong>100K GYD</strong> bi-weekly prize</p>
                        </div>

                        <div className="how-it-works-box">
                            <p className="leaderboard-title" style={{marginBottom: '15px'}}><span style={{color: '#00FFFF'}}>📈</span> How Creator Rewards Work</p>
                            <div className="step-row"><div className="step-number">1</div><div className="step-text"><h4>Choose a Gift Token</h4><p>Warm Spotlight to Director's Chair — each includes competition votes</p></div></div>
                            <div className="step-row"><div className="step-number">2</div><div className="step-text"><h4>Pay via MMG</h4><p>Send through Mobile Money Guyana and submit your receipt</p></div></div>
                            <div className="step-row"><div className="step-number">3</div><div className="step-text"><h4>Verified in 24h</h4><p>Admin verifies receipt; gift is delivered instantly</p></div></div>
                            <div className="step-row"><div className="step-number">4</div><div className="step-text"><h4>Earn Your Stripe</h4><p>Collect Patron badges as you support more creators</p></div></div>
                            
                            <p className="leaderboard-title" style={{marginTop: '25px', marginBottom: '10px'}}><span style={{color: '#FFF'}}>🎖️</span> Patron Tiers</p>
                            <div className="patron-grid">
                                <div className="patron-tier"><div className="tier-name"><div className="dot" style={{background: '#CD7F32'}}></div> Patron of the Arts</div><div className="tier-price">GYD $1,000+</div></div>
                                <div className="patron-tier"><div className="tier-name"><div className="dot" style={{background: '#C0C0C0'}}></div> Silver Supporter</div><div className="tier-price">GYD $5,000+</div></div>
                                <div className="patron-tier"><div className="tier-name"><div className="dot" style={{background: '#FFD700'}}></div> Gold Producer</div><div className="tier-price">GYD $15,000+</div></div>
                                <div className="patron-tier"><div className="tier-name"><div className="dot" style={{background: '#00FFFF'}}></div> Legendary Benefactor</div><div className="tier-price">GYD $50,000+</div></div>
                            </div>
                        </div>
                    </>
                )}

                {/* --- MODERN GLASSMORPHIC ADMIN COMMAND HUB --- */}
                {canManageUser && (
                    <div style={{
                        background: 'rgba(255, 0, 0, 0.05)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        border: '1px solid rgba(220, 53, 69, 0.3)',
                        borderRadius: '24px',
                        padding: '30px',
                        marginTop: '40px',
                        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.8)',
                        position: 'relative',
                        overflow: 'hidden'
                    }}>
                        {/* Control Panel Label */}
                        <p style={{ color: '#DC3545', fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '2px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '14px' }}>🛡️</span> INTERNAL STAFF COMMAND HUB
                        </p>

                        {(() => {
                            const isTargetAdminOrAuthority = profile.role === 'admin' || profile.role === 'authority' || profile.role === 'super_admin';
                            const viewerIsAuthority = creatorProfile.role === 'authority';
                            const isDisabled = viewerIsAuthority && isTargetAdminOrAuthority;

                            return (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', alignItems: 'flex-end' }}>
                                        {/* Dynamic Role Selector */}
                                        <div className="formGroup" style={{ margin: 0 }}>
                                            <label className="formLabel" style={{ fontSize: '10px', opacity: 0.6, textTransform: 'uppercase', letterSpacing: '1px' }}>Privilege Assignment</label>
                                            <select 
                                                className="formInput" 
                                                value={profile.role} 
                                                onChange={(e) => handleRoleChange(e.target.value)} 
                                                disabled={isDisabled || viewerIsAuthority}
                                                style={{ 
                                                    background: 'rgba(0,0,0,0.4)', 
                                                    border: '1px solid rgba(255,255,255,0.1)', 
                                                    borderRadius: '12px', 
                                                    color: '#FFF', 
                                                    padding: '12px',
                                                    fontSize: '13px',
                                                    fontWeight: 'bold',
                                                    cursor: (isDisabled || viewerIsAuthority) ? 'not-allowed' : 'pointer'
                                                }}
                                            >
                                                <option value="user">Standard User</option>
                                                <option value="creator">Verified Creator</option>
                                                <option value="authority">NVA Authority</option>
                                                {(creatorProfile.role === 'admin' || creatorProfile.role === 'super_admin') && <option value="admin">System Admin</option>}
                                            </select>
                                        </div>

                                        {/* Action Button Cluster */}
                                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                            {isSuspended ? (
                                                <button onClick={handleLiftSuspension} disabled={isDisabled} style={{ flex: 1, height: '45px', background: 'rgba(0, 255, 0, 0.1)', border: '1px solid rgba(0, 255, 0, 0.3)', borderRadius: '12px', color: '#00FF00', fontWeight: '900', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}>
                                                    Lift Suspension
                                                </button>
                                            ) : (
                                                <button onClick={handleToggleBan} disabled={isDisabled} style={{ flex: 1, minWidth: '110px', height: '45px', background: 'rgba(220, 53, 69, 0.15)', border: '1px solid rgba(220, 53, 69, 0.4)', borderRadius: '12px', color: '#FF4D4D', fontWeight: '900', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}>
                                                    {profile.banned ? 'Unban User' : 'Ban User'}
                                                </button>
                                            )}

                                            {/* OVERRIDE: Unlock Ledger Holds */}
                                            {(profile.payoutLockUntil || allContent.some(f => f.type === 'premiere') || arenaMovies.some(f => f.type === 'premiere')) && (
                                                <button 
                                                    onClick={() => {
                                                        setConfirmationTitle("🔓 Lift Payout Lock?");
                                                        setConfirmationMessage(`You are about to force-unlock ${profile.creatorName}'s Box Office. This will immediately bypass the 72-hour security hold and takedown any live premieres.`);
                                                        setOnConfirmationAction(() => async () => {
                                                            try {
                                                                const liftFunc = httpsCallable(functions, 'liftBoxOfficeCooldown');
                                                                const result = await liftFunc({ targetUserId: profile.id });
                                                                showMessage(result.data.message);
                                                            } catch(e) { showMessage("Override Failed: " + e.message); }
                                                        });
                                                        setShowConfirmationModal(true);
                                                    }} 
                                                    style={{ flex: 1.2, minWidth: '140px', height: '45px', background: 'rgba(255, 140, 0, 0.15)', border: '1px solid rgba(255, 140, 0, 0.5)', borderRadius: '12px', color: '#FFA500', fontWeight: '900', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer', boxShadow: '0 0 15px rgba(255, 140, 0, 0.1)' }}
                                                >
                                                    🔓 Lift Lock
                                                </button>
                                            )}

                                            {(creatorProfile.role === 'admin' || creatorProfile.role === 'super_admin') && (
                                                <button onClick={handleDeleteUser} style={{ flex: 0.8, minWidth: '80px', height: '45px', background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '12px', color: '#888', fontWeight: '900', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}>
                                                    Delete
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {isDisabled && <p style={{ textAlign: 'center', color: '#FFD700', fontSize: '10px', fontWeight: 'bold', marginTop: '20px', opacity: 0.8 }}>⚠️ HIGHER-TIER ACCOUNTS ARE PROTECTED FROM LOCAL MODIFICATIONS.</p>}
                                </>
                            );
                        })()}
                    </div>
                )}
                
                {/* ====== THE HERO PRODUCT SHOWCASE CARD (Symmetrical Centered Dialogue) ====== */}
                {['Craft', 'Designer', 'Crafter / Designer'].includes(profile?.creatorField) && profile?.heroProduct?.imageUrl && (
                    <div className="atelier-container" style={{ 
                        padding: '28px', 
                        background: `linear-gradient(135deg, ${roleColor}1A 0%, rgba(10,10,10,0.98) 100%)`, 
                        border: `2px solid ${roleColor}88`, 
                        borderRadius: '32px 32px 32px 8px', // Asymmetric Speech Bubble Dialogue Box
                        marginTop: '30px', 
                        position: 'relative', 
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center', // Symmetrical alignment
                        textAlign: 'center',
                        boxShadow: `0 15px 50px rgba(0,0,0,0.8), 0 0 35px ${roleColor}15`
                    }}>
                        {/* Glowing Accent Top Line */}
                        <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '4px', background: `linear-gradient(90deg, transparent, ${roleColor}, transparent)` }}></div>
                        
                        {/* Centered Category Theme Label */}
                        <div style={{ marginBottom: '20px' }}>
                            <p style={{ margin: 0, color: '#FFF', fontSize: '18px', fontWeight: '900', letterSpacing: '3px', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                                🔥 <span style={{ color: roleColor, textShadow: `0 0 10px ${roleColor}33` }}>{profile.creatorField.includes('Design') ? "BUY MY FIT" : "BEST SELLER"}</span>
                            </p>
                            <p style={{ margin: '6px 0 0 0', color: '#666', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                Premium Featured Creation
                            </p>
                        </div>

                        {/* Symmetrical Centered Image Container with Glow Backdrop */}
                        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', marginBottom: '24px', width: '100%' }}>
                            {/* Radial Glow Backplate */}
                            <div style={{ position: 'absolute', width: '160px', height: '160px', borderRadius: '50%', background: roleColor, opacity: 0.15, filter: 'blur(30px)', zIndex: 1 }}></div>
                            
                            <div 
                                onClick={() => setSelectedExhibitionImage(profile.heroProduct.imageUrl)}
                                style={{ 
                                    width: '100%', 
                                    maxWidth: '240px', 
                                    aspectRatio: '1/1', 
                                    borderRadius: '28px 28px 28px 8px', // Matching speech bubble cuts
                                    border: `2px solid ${roleColor}55`, 
                                    overflow: 'hidden', 
                                    cursor: 'zoom-in', 
                                    boxShadow: `0 12px 30px rgba(0,0,0,0.6), 0 0 25px ${roleColor}22`,
                                    zIndex: 2,
                                    transition: 'transform 0.3s ease'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.02)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
                            >
                                <img src={profile.heroProduct.imageUrl} alt="Hero Product" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            </div>
                        </div>

                        {/* Centered Price Tag */}
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', marginBottom: '20px' }}>
                            <span style={{ fontSize: '10px', color: '#888', fontWeight: '900', letterSpacing: '2px', textTransform: 'uppercase' }}>PRICE TAG</span>
                            <span style={{ fontSize: '32px', fontWeight: '900', color: '#00FFFF', textShadow: '0 0 20px rgba(0, 255, 255, 0.4)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '-1px' }}>
                                {Number(profile.heroProduct.price || 0).toLocaleString()} <span style={{ fontSize: '16px', color: '#888', fontWeight: 'bold' }}>GYD</span>
                            </span>
                        </div>

                        {/* Symmetrical Centered WhatsApp Contact Button */}
                        {profile.heroProduct.whatsapp && (
                            <div 
                                onClick={() => {
                                    const cleanNum = profile.heroProduct.whatsapp.replace(/\D/g, '');
                                    const messageText = encodeURIComponent(`Hi ${profile.creatorName}, I saw your featured "${profile.creatorField.includes('Design') ? 'Fit' : 'Best Seller'}" on NVA Network and I am interested in buying it!`);
                                    window.open(`https://wa.me/${cleanNum}?text=${messageText}`, '_blank');
                                }}
                                style={{ 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    gap: '10px', 
                                    padding: '12px 28px', 
                                    borderRadius: '16px', 
                                    background: 'rgba(74, 222, 128, 0.08)', 
                                    border: '1px solid rgba(74, 222, 128, 0.3)', 
                                    cursor: 'pointer',
                                    width: 'auto',
                                    maxWidth: '220px',
                                    transition: 'all 0.2s ease-out',
                                    boxShadow: '0 4px 15px rgba(74, 222, 128, 0.05)'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#4ADE80'; e.currentTarget.style.background = 'rgba(74, 222, 128, 0.18)'; e.currentTarget.style.boxShadow = '0 0 20px rgba(74, 222, 128, 0.3)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(74, 222, 128, 0.3)'; e.currentTarget.style.background = 'rgba(74, 222, 128, 0.08)'; e.currentTarget.style.boxShadow = 'none'; }}
                            >
                                <svg viewBox="0 0 24 24" width="18" height="18" fill="#4ADE80"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.05 11.95.05c3.178.001 6.165 1.24 8.413 3.488 2.248 2.248 3.487 5.234 3.487 8.411-1.35 6.602-6.686 11.901-13.237 11.901-2.003 0-3.968-.505-5.714-1.464L0 24zm6.602-3.483l.416.247c1.472.873 3.167 1.334 4.887 1.335 5.926 0 10.749-4.793 10.752-10.692.001-2.857-1.111-5.541-3.13-7.561-2.019-2.02-4.704-3.132-7.567-3.132-5.932 0-10.759 4.797-10.763 10.696-.001 2.051.542 4.053 1.571 5.801l.271.46L1.87 21.6l4.789-1.083z"/></svg>
                                <span style={{ fontFamily: "'JetBrains Mono', monospace", color: '#FFF', fontSize: '13px', fontWeight: '800', letterSpacing: '0.5px' }}>
                                    {profile.heroProduct.whatsapp}
                                </span>
                            </div>
                        )}
                    </div>
                )}

                {/* --- STUDIO GALLERY (Specific Roles Only) --- */}
                {['Craft', 'Designer', 'Health & Fitness', 'Crafter / Designer', 'Wellness Coach'].includes(profile?.creatorField) && profile?.studioGallery && Object.keys(profile.studioGallery).length > 0 && (
                    <div className="atelier-container" style={{ background: `linear-gradient(180deg, ${roleColor}33 0%, #111111 100%)`, border: `1px solid ${roleColor}66`, marginTop: '30px' }} id="gallery">
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <p className="sectionTitle" style={{ color: roleColor, margin: 0 }}>The Exhibition Room</p>
                            <button 
                                onClick={handleShareGallery}
                                style={{ background: 'transparent', border: `1px solid ${roleColor}66`, color: roleColor, padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                                <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
                                Share Gallery
                            </button>
                        </div>
                        <div className="studio-gallery-collage">
                            {[0, 1, 2, 3, 4].map((index) => {
                                const imgUrl = profile.studioGallery[index];
                                return (
                                    <div 
                                        key={index} 
                                        className={`gallery-slot slot-${index}`} 
                                        onClick={() => imgUrl && setSelectedExhibitionImage(imgUrl)} 
                                        style={{ cursor: imgUrl ? 'zoom-in' : 'default' }}
                                    >
                                        {imgUrl ? (
                                            <div style={{ width: '100%', height: '100%', overflow: 'hidden', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                <img src={imgUrl} alt={`Exhibition ${index}`} />
                                            </div>
                                        ) : (
                                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.01)' }}>
                                                <span style={{ color: '#222', fontSize: '18px' }}>🎨</span>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* --- PINNED CONTENT TINTED ATELIER --- */}
                <div 
                    className="atelier-container" 
                    style={{ 
                        background: `linear-gradient(180deg, ${roleColor}33 0%, #111111 100%)`, 
                        border: `1px solid ${roleColor}66`,
                        marginTop: '30px'
                    }}
                >
                    <p className="sectionTitle" style={{ color: roleColor, marginBottom: '20px' }}>Pinned Content</p>
                    {loadingContent ? <p className="dashboardItem">Loading content...</p> : pinnedContent.length === 0 ? <p className="dashboardItem">This creator hasn't pinned any content yet.</p> : (
                        <div className="atelier-grid">
                            {pinnedContent.map(item => (
                                <div key={item.id} className="atelier-card pinned-card">
                                    <div onClick={() => handleVideoPress(item.embedUrl || item.mainUrl, item)}>
                                        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000' }}>
                                            <img src={item.customThumbnailUrl || item.imageUrl || 'https://placehold.co/400x225/111/333?text=NVA'} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                        </div>
                                        <div style={{ padding: '12px' }}>
                                            <p style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '900', color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</p>
                                            <p style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', fontWeight: '700' }}>{item.contentType}</p>
                                        </div>
                                    </div>
                                    <ContentStats item={item} currentUser={currentUser} showMessage={showMessage} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                {/* --- CREATIVE PORTFOLIO TINTED ATELIER --- */}
                <div 
                    className="atelier-container" 
                    style={{ 
                        background: `linear-gradient(180deg, ${roleColor}1A 0%, #111111 100%)`, 
                        border: `1px solid ${roleColor}4D`,
                        marginTop: '30px'
                    }}
                >
                    <p className="sectionTitle" style={{ color: roleColor, marginBottom: '20px' }}>Creative Portfolio</p>
                    {loadingContent ? <p className="dashboardItem">Loading gallery...</p> : allContent.length === 0 ? <p className="dashboardItem">This creator hasn't uploaded any content yet.</p> : (
                        <div className="atelier-grid">
                            {allContent.map(item => (
                                <div key={item.id} className="atelier-card">
                                    <div onClick={() => handleVideoPress(item.embedUrl || item.mainUrl, item)}>
                                        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000' }}>
                                            <img src={item.customThumbnailUrl || item.imageUrl || 'https://placehold.co/400x225/111/333?text=NVA'} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                        </div>
                                        <div style={{ padding: '12px' }}>
                                            <p style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: '900', color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</p>
                                            <p style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', fontWeight: '700' }}>{item.contentType}</p>
                                        </div>
                                    </div>
                                    <ContentStats item={item} currentUser={currentUser} showMessage={showMessage} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px'}}>
                    {/* Contextual Back Button */}
                    {previousScreen === 'TopCreators' ? (
                        <button className="button button-contextual" onClick={() => setActiveScreen('TopCreators')}>
                            <span className="buttonText light">Back to Charts</span>
                        </button>
                    ) : previousScreen === 'Discover' ? (
                        <button className="button button-contextual" onClick={() => setActiveScreen('Discover')}>
                            <span className="buttonText light">Back to Discover</span>
                        </button>
                    ) : (
                        <button className="button" onClick={() => setActiveScreen('DiscoverUsers')} style={{ backgroundColor: '#3A3A3A' }}>
                            <span className="buttonText light">Back to Search</span>
                        </button>
                    )}
                    {canManageUser && (
                         <button className="button" onClick={() => setActiveScreen('AdminDashboard')} style={{ backgroundColor: '#555' }}>
                            <span className="buttonText light">Back to Admin</span>
                        </button>
                    )}
                </div>
            </div>
            {showPfpModal && profile && <ProfilePictureModal imageUrl={profile.profilePictureUrl || 'https://placehold.co/400x400/555/FFF?text=No+Image'} onClose={() => setShowPfpModal(false)} />}

            {/* LIGHTBOX MODAL */}
            {selectedExhibitionImage && (
                <div className="lightbox-overlay" onClick={() => setSelectedExhibitionImage(null)}>
                    <img src={selectedExhibitionImage} alt="Zoomed Exhibition" className="lightbox-image" onClick={(e) => e.stopPropagation()} />
                    <button onClick={() => setSelectedExhibitionImage(null)} style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(255,255,255,0.1)', border: 'none', color: '#FFF', fontSize: '24px', width: '40px', height: '40px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                </div>
            )}

            {/* ====== THE INTERACTIVE MMG GIFT MODAL ====== */}
            {isGiftModalOpen && profile && (
                <div className="gift-modal-overlay" onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation(); 
                    if (!isSubmitting) setIsGiftModalOpen(false);
                }}>
                    <div className="gift-modal" onClick={e => e.stopPropagation()}>
                        {!submitSuccess ? (
                            <>
                                <div className="modal-header">
                                    <div>
                                        <p style={{ color: '#737373', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>SEND A GIFT TO</p>
                                        <h2 style={{ color: '#FFFFFF', fontSize: '24px', fontWeight: 800, margin: '4px 0 0 0' }}>{profile.creatorName}</h2>
                                    </div>
                                    <button type="button" className="modal-close" onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation(); 
                                        setIsGiftModalOpen(false);
                                    }}>✕</button>
                                </div>

                                <p style={{ color: '#737373', fontSize: '12px', margin: '0 0 20px 0' }}>Select a Token. Gifts support the creator financially. Tap here to send a gift [1]!</p>

                                <div style={{ maxHeight: '280px', overflowY: 'auto', marginBottom: '16px', paddingRight: '4px' }}>
                                    {giftTokens.map(token => {
                                        const platformFee = token.price * 0.15;
                                        const actorReceives = token.price * 0.85;
                                        return (
                                            <div key={token.id} className={`token-card ${selectedToken.id === token.id ? 'selected' : ''}`} onClick={() => setSelectedToken(token)}>
                                                <div className="token-icon">{token.icon}</div>
                                                <div className="token-info">
                                                    <p className="token-name">{token.name}</p>
                                                    <p className="token-breakdown">Creator: {actorReceives.toLocaleString()} GYD | Platform: {platformFee.toLocaleString()} GYD (15%)</p>
                                                </div>
                                                <span className="token-price">{token.price.toLocaleString()}</span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Selected Breakdown */}
                                <div className="breakdown-detail">
                                    <div className="breakdown-row border">
                                        <span className="breakdown-label">Token Price</span>
                                        <span className="breakdown-value">{(selectedToken?.price || 0).toLocaleString()} GYD</span>
                                    </div>
                                    <div className="breakdown-row">
                                        <span className="breakdown-label">Platform Fee (15%)</span>
                                        <span className="breakdown-value negative">-{((selectedToken?.price || 0) * 0.15).toLocaleString()} GYD</span>
                                    </div>
                                    <div className="breakdown-row" style={{ marginTop: '4px', paddingTop: '8px', borderTop: '1px solid #2A2A2A' }}>
                                        <span className="breakdown-label positive">Creator Receives</span>
                                        <span className="breakdown-value positive">{((selectedToken?.price || 0) * 0.85).toLocaleString()} GYD ✓</span>
                                    </div>
                                </div>

                                {/* THE NEW GLASSMORPHIC EARNINGS GIFT BUTTON */}
                                <div style={{ marginBottom: '15px' }}>
                                    <button 
                                        type="button"
                                        className="earnings-btn" 
                                        disabled={isSubmitting || (creatorProfile?.totalEarnings || 0) < (selectedToken?.price || 0)}
                                        onClick={async () => {
                                            setIsSubmitting(true);
                                            try {
                                                const giftFunc = httpsCallable(functions, 'sendGiftWithEarnings');
                                                await giftFunc({
                                                    targetUserId: profile.id,
                                                    giftName: selectedToken?.name || 'Gift',
                                                    amount: selectedToken?.price || 0
                                                });
                                                setSubmitSuccess(true);
                                                showMessage(`Your ${selectedToken?.name || 'Gift'} has been sent successfully!`);
                                                setTimeout(() => {
                                                    setSubmitSuccess(false);
                                                    setIsGiftModalOpen(false);
                                                }, 3000);
                                            } catch (err) {
                                                showMessage(`Gifting failed: ${err.message}`);
                                            } finally {
                                                setIsSubmitting(false);
                                            }
                                        }}
                                    >
                                        {isSubmitting ? 'Processing...' : `Send with Earnings — ${(selectedToken?.price || 0).toLocaleString()} GYD`}
                                    </button>
                                </div>

                                {/* Anonymous Toggle */}
                                <label className="anon-toggle">
                                    <input type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} />
                                    <span>Gift anonymously (hide my name from public toasts)</span>
                                </label>

                                <div className="mmg-instructions">
                                    <p><strong>📱 MMG Payment Instructions:</strong></p>
                                    <p>1. Send <strong>{(selectedToken?.price || 0).toLocaleString()} GYD</strong> to <strong>{MMG_NUMBER}</strong></p>
                                    <p>2. Copy the Transaction ID from your receipt</p>
                                    <p>3. Paste the ID and upload your receipt screenshot below</p>
                                </div>

                                <div style={{ marginBottom: '12px' }}>
                                    <label style={{ fontSize: '11px', color: '#737373', fontWeight: 600, display: 'block', marginBottom: '6px' }}>MMG Payment ID</label>
                                    <input type="text" value={paymentId} onChange={e => setPaymentId(e.target.value)} placeholder="e.g. TXN12345678" 
                                        style={{ width: '100%', background: '#0D0D0D', border: '1px solid #333', color: '#FFF', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', outline: 'none', transition: 'border-color 0.2s' }}
                                        onFocus={e => e.target.style.borderColor = '#FFD700'}
                                        onBlur={e => e.target.style.borderColor = '#333'} />
                                </div>

                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ fontSize: '11px', color: '#737373', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Receipt Screenshot</label>
                                    <input type="file" accept="image/*" onChange={e => {
                                        const file = e.target.files[0];
                                        if (file) {
                                            const reader = new FileReader();
                                            reader.onloadend = () => setScreenshotBase64(reader.result);
                                            reader.readAsDataURL(file);
                                        }
                                    }} style={{ fontSize: '12px', color: '#737373', width: '100%' }} />
                                </div>

                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button type="button" className="submit-btn" style={{ flex: 1, backgroundColor: '#333', color: '#888' }} onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation(); 
                                        setIsGiftModalOpen(false);
                                    }} disabled={isSubmitting}>Cancel</button>
                                    <button type="button" className="submit-btn" style={{ flex: 2 }} onClick={submitGiftPledge} disabled={isSubmitting || !paymentId || !screenshotBase64}>
                                        {isSubmitting ? 'Verifying...' : `Submit MMG Receipt — ${(selectedToken?.price || 0).toLocaleString()} GYD`}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="success-state">
                                <div className="success-check" style={{ margin: '0 auto 16px' }}>✓</div>
                                <h3 style={{ color: '#FFFFFF', fontSize: '24px', fontWeight: 900, margin: '0 0 12px 0', letterSpacing: '0.02em' }}>
                                    {successMode === 'earnings' ? 'Transfer Complete!' : 'Gift Sent!'}
                                </h3>
                                <p style={{ color: '#AAA', fontSize: '14px', margin: 0, lineHeight: '1.6' }}>
                                    {successMode === 'earnings' 
                                        ? <>Your <strong style={{color: '#FFD700'}}>{selectedToken?.name || 'Gift'}</strong> has been securely transferred to {profile.creatorName}.</>
                                        : "Your receipt has been submitted for verification. The gift will be delivered once approved."}
                                </p>
                            </div>
                        )}
                    </div>
                    {/* CUSTOM EARNINGS CONFIRMATION MODAL OVERLAY */}
                    {showEarningsConfirm && (
                        <div className="gift-modal-overlay" style={{ zIndex: 1300, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(15px)' }} onClick={(e) => { e.stopPropagation(); setShowEarningsConfirm(false); }}>
                            <div className="gift-modal" style={{ maxWidth: '360px', border: '1px solid #FFD700', textAlign: 'center', boxShadow: '0 20px 80px rgba(0,0,0,0.9)' }} onClick={(e) => e.stopPropagation()}>
                                <p style={{ color: '#FFD700', fontSize: '18px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>Authorize Transfer</p>
                                <p style={{ color: '#FFF', fontSize: '14px', lineHeight: '1.5', marginBottom: '24px' }}>
                                    Are you sure you want to deduct <strong style={{color: '#FFD700'}}>{(selectedToken?.price || 0).toLocaleString()} GYD</strong> from your earnings balance to send this gift?
                                </p>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button className="submit-btn cancel-btn" onClick={(e) => { e.stopPropagation(); setShowEarningsConfirm(false); }} style={{ flex: 1, margin: 0 }}>Cancel</button>
                                    <button 
                                        className="submit-btn" 
                                        style={{ flex: 1.5, margin: 0 }}
                                        onClick={async (e) => {
                                            e.stopPropagation();
                                            setShowEarningsConfirm(false);
                                            setIsSubmitting(true);
                                            try {
                                                const giftFunc = httpsCallable(functions, 'sendGiftWithEarnings');
                                                await giftFunc({
                                                    targetUserId: profile.id,
                                                    giftName: selectedToken?.name || 'Gift',
                                                    amount: selectedToken?.price || 0
                                                });
                                                setSuccessMode('earnings');
                                                setSubmitSuccess(true);
                                                showMessage(`Your ${selectedToken?.name || 'Gift'} has been sent successfully!`);
                                                setTimeout(() => {
                                                    setSubmitSuccess(false);
                                                    setIsGiftModalOpen(false);
                                                }, 3000);
                                            } catch (err) {
                                                showMessage(`Gifting failed: ${err.message}`);
                                            } finally {
                                                setIsSubmitting(false);
                                            }
                                        }}
                                    >
                                        Confirm
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </>
    );
};

export default UserProfileScreen;