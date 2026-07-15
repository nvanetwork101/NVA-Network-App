// src/components/CenterStageScreen.jsx

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db, functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { 
    collection, query, where, onSnapshot, doc, setDoc, updateDoc, increment, getDoc 
} from 'firebase/firestore';
import RoleBadge from './RoleBadge';

// Utility to get the correct embed URL and aspect ratio for CenterStage videos
const extractVideoInfo = (url) => {
    if (!url || typeof url !== 'string') return { embedUrl: null, isVertical: false };
    const ytShortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (ytShortsMatch) {
        return { embedUrl: `https://www.youtube.com/embed/${ytShortsMatch[1]}`, isVertical: true };
    }
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/);
    if (ytMatch) {
        return { embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}`, isVertical: false };
    }
    const tiktokMatch = url.match(/tiktok\.com\/.*\/video\/(\d+)/);
    if (tiktokMatch) {
        return { embedUrl: `https://www.tiktok.com/embed/v2/${tiktokMatch[1]}`, isVertical: true };
    }
    if (url.includes('facebook.com')) {
        return { embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=0`, isVertical: false };
    }
    return { embedUrl: url, isVertical: false };
};

// --- THE NVA TOKEN CATALOG (Fun Names, Your Prices) ---
const GIFT_TOKENS = [
    { id: 'spotlight', name: 'Warm Spotlight', price: 500, actorReceives: 425, platformFee: 75, icon: '🔦' },
    { id: 'popcorn', name: 'Golden Popcorn', price: 1000, actorReceives: 850, platformFee: 150, icon: '🍿' },
    { id: 'flare', name: 'Rainbow Flare', price: 2500, actorReceives: 2125, platformFee: 375, icon: '🌈' },
    { id: 'chair', name: "Director's Chair", price: 5000, actorReceives: 4250, platformFee: 750, icon: '🎬' },
    { id: 'producer', name: 'The Executive Producer', price: 10000, actorReceives: 8500, platformFee: 1500, icon: '💎' },
];

const PLATFORM_FEE_PERCENTAGE = 0.15; // 15% NVA Platform Fee
const MMG_NUMBER = "592-672-3204";

const CenterStageScreen = ({ setActiveScreen, currentUser, showMessage, targetContestantId, handleVideoPress }) => {
    const [showEarningsConfirm, setShowEarningsConfirm] = useState(false);

    // --- SLEEK PATRON STRIPE RENDERER (Clean, 30-Day Check) ---
    const renderPatronStripe = (profile) => {
        if (!profile) return null;
        
        // Enforce the 30-day expiration check
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
                marginLeft: '6px',
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
    const [contestants, setContestants] = useState([]);
    const [competitionState, setCompetitionState] = useState(null);
    const [activeMobileTab, setActiveMobileTab] = useState('arena'); // MOVED UP TO PREVENT CRASH

    // --- AUTOMATED TOP SUPPORTERS TICKER STATES & REFS ---
    const [topSupporters, setTopSupporters] = useState([]);
    const [supporterIndex, setSupporterIndex] = useState(0);
    const [currentSupporterAvatar, setCurrentSupporterAvatar] = useState(null);
    const touchStartX = useRef(0);
    const touchEndX = useRef(0);

    // On-demand avatar fetcher as the ticker rotates
    useEffect(() => {
        const activeSupporter = topSupporters[supporterIndex];
        if (!activeSupporter || activeSupporter.isAnonymous) {
            setCurrentSupporterAvatar(null);
            return;
        }

        const userRef = doc(db, "creators", activeSupporter.userId);
        getDoc(userRef).then(snap => {
            if (snap.exists()) {
                setCurrentSupporterAvatar(snap.data().profilePictureUrl || '');
            }
        }).catch(err => console.error("Error loading supporter avatar:", err));
    }, [supporterIndex, topSupporters]);

    // Query and aggregate real, approved gift transactions for active contestants
    useEffect(() => {
        if (contestants.length === 0) return;
        
        const q = query(
            collection(db, "paymentPledges"),
            where("status", "==", "approved"),
            where("paymentType", "==", "giftToken")
        );

        const unsub = onSnapshot(q, (snapshot) => {
            const aggregates = {};
            
            snapshot.docs.forEach(docSnap => {
                const p = docSnap.data();
                // Filter: Only count donors who gave specifically to contestants in this arena
                const isContestantRecipient = contestants.some(c => c.id === p.targetUserId);
                if (!isContestantRecipient) return;

                const donorId = p.isAnonymous ? `anonymous_${docSnap.id}` : p.userId;
                const donorName = p.isAnonymous ? "Anonymous Supporter" : (p.userName || "NVA Supporter");

                if (!aggregates[donorId]) {
                    aggregates[donorId] = {
                        userId: p.userId,
                        userName: donorName,
                        amount: 0,
                        isAnonymous: !!p.isAnonymous
                    };
                }
                aggregates[donorId].amount += p.amount || 0;
            });

            // Sort by highest amount given
            const sortedSupporters = Object.values(aggregates)
                .sort((a, b) => b.amount - a.amount);

            setTopSupporters(sortedSupporters);
        });

        return () => unsub();
    }, [contestants]);

    // Auto-scroll the ticker every 4 seconds (Jumps by 10 in Supporters Tab for seamless pagination)
    useEffect(() => {
        if (topSupporters.length <= 1) return;
        const interval = setInterval(() => {
            setSupporterIndex(prev => {
                const step = activeMobileTab === 'supporters' ? 10 : 1;
                return (prev + step) % topSupporters.length;
            });
        }, activeMobileTab === 'supporters' ? 6000 : 4000); // Gives users slightly longer to read the expanded list
        return () => clearInterval(interval);
    }, [topSupporters, activeMobileTab]);

    // Touch Swipe Handlers for mobile sliding (Adapts math to current tab view)
    const handleTouchStart = (e) => { touchStartX.current = e.targetTouches[0].clientX; };
    const handleTouchMove = (e) => { touchEndX.current = e.targetTouches[0].clientX; };
    const handleTouchEnd = () => {
        if (topSupporters.length <= 1) return;
        const diff = touchStartX.current - touchEndX.current;
        const step = activeMobileTab === 'supporters' ? 10 : 1;
        if (diff > 50) setSupporterIndex(prev => (prev + step) % topSupporters.length); // Swipe Left
        else if (diff < -50) setSupporterIndex(prev => (prev - (step % topSupporters.length) + topSupporters.length) % topSupporters.length); // Swipe Right
    };
    
    const [isLoading, setIsLoading] = useState(true);
    const [hasOpenedDeepLink, setHasOpenedDeepLink] = useState(false);
    const [creatorProfile, setCreatorProfile] = useState(null);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [viewingStageIndex, setViewingStageIndex] = useState(null); // Track which round user is looking at

    // Modal State
    const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
    const [isPlaybackModalOpen, setIsPlaybackModalOpen] = useState(false);
    const [playbackUrl, setPlaybackUrl] = useState(null);
    const [playbackTitle, setPlaybackTitle] = useState('');
    const [targetActor, setTargetActor] = useState(null);
    const [giftTokens, setGiftTokens] = useState(GIFT_TOKENS);
    const [selectedToken, setSelectedToken] = useState(GIFT_TOKENS[0]);

    // Dynamic database subscription
    useEffect(() => {
        const unsub = onSnapshot(doc(db, "settings", "tokenEconomics"), (snap) => {
            if (snap.exists() && snap.data().giftTokens) {
                const gTokens = snap.data().giftTokens;
                setGiftTokens(gTokens);
                setSelectedToken(prev => gTokens.find(t => t.id === prev.id) || gTokens[0]);
            }
        });
        return () => unsub();
    }, []);
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [paymentId, setPaymentId] = useState('');
    const [screenshotBase64, setScreenshotBase64] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [successMode, setSuccessMode] = useState('earnings');

    // Fetch Current User Profile
    useEffect(() => {
        if (!currentUser) return;
        const unsub = onSnapshot(doc(db, "creators", currentUser.uid), (doc) => {
            if (doc.exists()) setCreatorProfile(doc.data());
        });
        return () => unsub();
    }, [currentUser]);

    // Fetch Competition State (for dynamic stages)
    useEffect(() => {
        const unsub = onSnapshot(doc(db, "settings", "competitionDisplayState"), (snap) => {
            if (snap.exists()) setCompetitionState(snap.data());
        });
        return () => unsub();
    }, []);

    // Fetch Contestants
    useEffect(() => {
        const q = query(collection(db, "creators"), where("isContestant", "==", true));
        const unsub = onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setContestants(fetched);
            setIsLoading(false);
        });
        return () => unsub();
    }, []);

    // Build dynamic stages from competitionState or fallback
    const stages = useMemo(() => {
        if (competitionState?.stages && Array.isArray(competitionState.stages)) {
            return competitionState.stages;
        }
        return ['Round 1', 'Semifinals', 'Finals'];
    }, [competitionState]);

    const currentStageIndex = competitionState?.currentStageIndex || 0;
    
    const activeViewingStageName = useMemo(() => {
        let index = viewingStageIndex !== null ? viewingStageIndex : currentStageIndex;
        if (index > currentStageIndex) index = currentStageIndex; // Strict Time-Lock Security Fallback
        return stages[index] || 'Round 1';
    }, [viewingStageIndex, currentStageIndex, stages]);

    // --- DYNAMIC ARENA SORTING (Time Machine Enabled) ---
    const arenaData = useMemo(() => {
        const active = [];
        const eliminated = [];

        const isViewingHistory = viewingStageIndex !== null && viewingStageIndex !== currentStageIndex;

        const viewIdx = viewingStageIndex !== null ? viewingStageIndex : currentStageIndex;

        contestants.forEach(c => {
            let showAsEliminated = false;

            // The Logic: 
            // 1. If viewing a round BEFORE they were eliminated, they MUST show as active.
            // 2. If viewing the round they were eliminated in (or after), they show as eliminated.
            
            const eliminationIdx = c.eliminatedAtStageIndex !== undefined && c.eliminatedAtStageIndex !== null 
                ? c.eliminatedAtStageIndex 
                : (c.isEliminated ? 0 : 999);

            if (viewIdx < eliminationIdx) {
                showAsEliminated = false; // They were still in the competition at this point in time
            } else if (viewIdx >= eliminationIdx && (c.isEliminated || c.competitionStatus === 'eliminated')) {
                showAsEliminated = true; // They are out by this round
            }

            if (showAsEliminated) {
                eliminated.push(c);
            } else {
                active.push(c);
            }
        });

        // Strict Round-Aware Sorting: History Snapshot -> Live Data Fallback -> 0
        const isCurrent = viewingStageIndex === null || viewingStageIndex === currentStageIndex;
        
        active.sort((a, b) => {
            const valA = isCurrent ? (a.voteCount || 0) : (a.performances?.[activeViewingStageName]?.votes ?? a.voteCount ?? 0);
            const valB = isCurrent ? (b.voteCount || 0) : (b.performances?.[activeViewingStageName]?.votes ?? b.voteCount ?? 0);
            return valB - valA;
        });
        
        const headliner = active.length > 0 ? active[0] : null;

        const topProducer = active.length > 0 
            ? [...active].sort((a, b) => {
                const earnA = isCurrent ? (a.giftsReceived || 0) : (a.performances?.[activeViewingStageName]?.earnings ?? a.giftsReceived ?? 0);
                const earnB = isCurrent ? (b.giftsReceived || 0) : (b.performances?.[activeViewingStageName]?.earnings ?? b.giftsReceived ?? 0);
                return earnB - earnA;
              })[0] 
            : null;

        return { headliner, topProducer, callSheet: active, eliminated };
    }, [contestants, viewingStageIndex, currentStageIndex, activeViewingStageName]);

    // --- HANDLERS ---
    const handleFreeVote = useCallback(async (actorId) => {
        if (viewingStageIndex !== null && viewingStageIndex !== currentStageIndex) {
            showMessage("Results for this round are locked. You can only vote in the current live round!");
            return;
        }
        if (!currentUser?.uid) { showMessage("Please sign up to vote!"); setActiveScreen('SignUp'); return; }
        const lastVoteKey = `nva_free_vote_${currentUser.uid}_${actorId}`;
        const lastVoteTime = localStorage.getItem(lastVoteKey);
        if (lastVoteTime && Date.now() - parseInt(lastVoteTime) < 86400000) {
            showMessage("You already used your free vote today. Come back tomorrow!");
            return;
        }
        showMessage("Casting vote...");
        try {
            const actorDocRef = doc(db, "creators", actorId);
            await updateDoc(actorDocRef, { voteCount: increment(1) });
            localStorage.setItem(lastVoteKey, Date.now().toString());
            showMessage("Vote cast! Talent recognized.");
        } catch (e) {
            console.error("Vote error:", e);
            if (e.message?.includes('permission')) {
                showMessage("Permission denied. Are you logged in?");
            } else {
                showMessage(`Vote failed: ${e.message}`);
            }
        }
    }, [currentUser, showMessage, setActiveScreen]);

    const openGiftModal = useCallback((actor) => {
        if (viewingStageIndex !== null && viewingStageIndex !== currentStageIndex) {
            showMessage("Gifting is closed for past rounds. You can only send support to contestants in the active live round!");
            return;
        }
        if (!currentUser) { showMessage("You must be logged in to send a gift."); setActiveScreen('Login'); return; }
        setTargetActor(actor);
        setSelectedToken(GIFT_TOKENS[0]);
        setIsAnonymous(false);
        setPaymentId('');
        setScreenshotBase64(null);
        setSubmitSuccess(false);
        setIsGiftModalOpen(true);
    }, [currentUser, showMessage, setActiveScreen, viewingStageIndex, currentStageIndex]);

    const openPlayback = useCallback((url, title) => {
        // Force the use of the local CenterStage modal to bypass App.jsx's Home redirect
        setPlaybackUrl(url);
        setPlaybackTitle(title || 'Performance');
        setIsPlaybackModalOpen(true);
    }, []);

    const submitGiftPledge = useCallback(async () => {
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
                targetUserId: targetActor.id,
                targetActorName: targetActor.creatorName || '', // Saves name
                giftName: selectedToken?.name || 'Gift',
                isAnonymous: isAnonymous,
                screenshotUrl: screenshotBase64,
                createdAt: new Date().toISOString()
            });
            
            // THE FIX: Keep modal open, show success state, and close after 3 seconds
            setPaymentId('');
            setScreenshotBase64(null);
            setSuccessMode('mmg');
            setSubmitSuccess(true);
            
            setTimeout(() => {
                setSubmitSuccess(false);
                setIsGiftModalOpen(false);
            }, 3000);
        } catch (error) {
            console.error("Gift error:", error);
            showMessage("Failed to process gift.");
        } finally {
            setIsSubmitting(false);
        }
    }, [paymentId, screenshotBase64, currentUser, creatorProfile, targetActor, selectedToken, isAnonymous, showMessage]);

    const handleShare = useCallback(async (e, actorId = null, actorName = '', isWinner = false) => {
        e.stopPropagation();
        const baseUrl = window.location.origin;
        const shareUrl = actorId ? `${baseUrl}/CenterStage/${actorId}` : `${baseUrl}/CenterStage`;
        
        let text = "Check out the active Docu-Series Challenges on NVA Network! Vote for your favorite performers:";
        if (actorId) {
            text = isWinner 
                ? `🏆 ${actorName} won the NVA Docu-Series Challenge! Check out the official champion's showcase:`
                : `Support ${actorName} in the NVA Docu-Series Challenge! Tap here to vote and send a gift:`;
        }

        if (navigator.share) {
            try {
                await navigator.share({
                    title: "NVA CenterStage",
                    text: text,
                    url: shareUrl
                });
            } catch (err) {
                if (err.name !== 'AbortError') console.error("Sharing failed:", err);
            }
        } else {
            navigator.clipboard.writeText(shareUrl).then(() => {
                showMessage("Link copied! Share to gather votes.");
            }).catch(() => showMessage("Failed to copy link."));
        }
    }, [showMessage]);

    // Deep link auto-open
    useEffect(() => {
        if (targetContestantId && contestants.length > 0 && !isGiftModalOpen && !hasOpenedDeepLink) {
            const target = contestants.find(c => c.id === targetContestantId);
            if (target) { setHasOpenedDeepLink(true); openGiftModal(target); }
        }
    }, [targetContestantId, contestants, isGiftModalOpen, hasOpenedDeepLink, openGiftModal]);

    if (isLoading) {
        return <div className="screenContainer" style={{ textAlign: 'center', paddingTop: '50px' }}><p className="heading">Entering the Arena...</p></div>;
    }

    return (
        <div className="screenContainer" style={{ paddingBottom: '40px', background: '#000000', minHeight: '100vh', position: 'relative' }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

                /* ====== STAGE TIMELINE ====== */
                .stage-timeline { display: flex; align-items: center; gap: 8px; margin-bottom: 32px; overflow-x: auto; padding-bottom: 8px; }
                .stage-pill { padding: 8px 20px; border-radius: 100px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; white-space: nowrap; border: 1px solid #2A2A2A; background: #111111; color: #737373; transition: all 0.3s ease; cursor: default; }
                .stage-pill.active { border-color: #A855F7; color: #FFFFFF; background: rgba(168, 85, 247, 0.1); box-shadow: 0 0 12px rgba(168, 85, 247, 0.3); }
                .stage-pill.completed { border-color: #4ADE80; color: #4ADE80; background: rgba(74, 222, 128, 0.05); }
                .stage-connector { flex: 1; height: 2px; background: #2A2A2A; min-width: 20px; position: relative; }
                .stage-connector-fill { position: absolute; top: 0; left: 0; height: 100%; background: linear-gradient(90deg, #4ADE80, #A855F7); border-radius: 2px; transition: width 0.5s ease; }

                /* ====== THEATER / JUMBOTRON ====== */
                .theater-section { background: #000; border: 1px solid #333; border-radius: 16px; overflow: hidden; margin-bottom: 40px; position: relative; }
                .theater-label { background: linear-gradient(135deg, #FFD700, #FF8C00); color: #000; font-size: 10px; font-weight: 900; padding: 4px 12px; position: absolute; top: 12px; left: 12px; border-radius: 4px; z-index: 5; letter-spacing: 1px; }
                .play-trigger { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(255, 215, 0, 0.9); color: #000; border: none; width: 80px; height: 80px; border-radius: 50%; font-size: 30px; cursor: pointer; box-shadow: 0 0 40px rgba(255, 215, 0, 0.5); transition: all 0.3s ease; display: flex; align-items: center; justify-content: center; padding-left: 5px; }
                .play-trigger:hover { transform: translate(-50%, -50%) scale(1.1); background: #FFD700; box-shadow: 0 0 60px rgba(255, 215, 0, 0.8); }
                .team-play-trigger { position: absolute; bottom: 12px; right: 12px; background: rgba(0,0,0,0.8); color: #FFD700; border: 1px solid #FFD700; padding: 8px 16px; border-radius: 8px; font-size: 12px; font-weight: 700; cursor: pointer; z-index: 5; transition: all 0.2s; }
                .team-play-trigger:hover { background: #FFD700; color: #000; }

                /* ====== DUAL MARQUEE ====== */
                .marquee-container { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 40px; }
                @media (max-width: 1024px) { .marquee-container { grid-template-columns: 1fr; } }
                @media (max-width: 768px) { 
                    .marquee-card { padding: 32px 16px !important; transform: scale(1.02); box-shadow: 0 15px 40px rgba(0,0,0,0.6) !important; z-index: 10; margin-bottom: 8px; }
                    .marquee-name { font-size: 1.4rem !important; }
                    .award-label { font-size: 12px !important; letter-spacing: 0.1em !important; margin-bottom: 16px !important; }
                    .marquee-avatar { width: 100px !important; height: 100px !important; }
                }
                
                .marquee-card { border-radius: 16px; padding: 24px; text-align: center; position: relative; overflow: hidden; transition: transform 0.3s ease; }
                .marquee-card:hover { transform: translateY(-4px); }
                /* TRUE METALLIC GOLD & SILVER OVERHAUL */
                .marquee-card.headliner { 
                    background: linear-gradient(145deg, #0f0c02 0%, #050505 100%); 
                    border: 2px solid;
                    border-image: linear-gradient(to bottom right, #BF953F, #FCF6BA, #B38728, #FBF5B7, #AA771C) 1;
                    box-shadow: 0 0 40px rgba(191, 149, 63, 0.35), inset 0 0 15px rgba(251, 245, 183, 0.05); 
                    position: relative; 
                }
                .marquee-card.producer { 
                    background: linear-gradient(145deg, #1A1A1A 0%, #050505 100%); 
                    border: 2px solid; 
                    border-image: linear-gradient(to bottom right, #C0C0C0, #FFFFFF, #8E8E8E, #F2F2F2, #BDBDBD) 1;
                    box-shadow: 0 0 30px rgba(192, 192, 192, 0.2); 
                }
                
                /* METALLIC SHIMMER EFFECT */
                .marquee-card::before { content: ''; position: absolute; top: 0; left: -100%; width: 50%; height: 100%; background: linear-gradient(to right, transparent, rgba(251, 245, 183, 0.2), transparent); transform: skewX(-20deg); animation: glimmer 4s infinite; }
                .marquee-card.producer::before { background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.15), transparent); }
                @keyframes glimmer { 0% { left: -100%; } 100% { left: 200%; } }
                
                .award-label { font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.12em; margin: 0 0 12px 0; }
                .award-label.gold { color: #D4AF37; text-shadow: 0 0 8px rgba(212, 175, 55, 0.4); }
                .award-label.silver { color: #C0C0C0; }
                .marquee-avatar { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 12px; }
                .marquee-name { font-size: 1.3rem; font-weight: 800; color: #FFF; margin: 0; }
                .marquee-stats { font-size: 14px; font-weight: 700; margin-top: 8px; }
                .marquee-stats.gold { color: #D4AF37; text-shadow: 0 0 10px rgba(212, 175, 55, 0.5); }
                .marquee-stats.silver { color: #C0C0C0; }
                .marquee-action { margin-top: 16px; padding: 10px 24px; border-radius: 8px; border: none; font-weight: 700; font-size: 12px; cursor: pointer; transition: all 0.2s; text-transform: uppercase; letter-spacing: 0.05em; }
                .marquee-action.gold { background: #FFD700; color: #000; }
                .marquee-action.gold:hover { background: #FFEA50; box-shadow: 0 0 20px rgba(255, 215, 0, 0.4); }
                .marquee-action.silver { background: #C0C0C0; color: #000; }
                .marquee-action.silver:hover { background: #E8E8E8; box-shadow: 0 0 20px rgba(192, 192, 192, 0.4); }

                /* ====== CALL SHEET GRID ====== */
                .call-sheet-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 12px; margin-bottom: 40px; }
                @media (max-width: 768px) { 
                    .call-sheet-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; } 
                    .card-body { padding: 12px !important; }
                    .c-name { font-size: 14px !important; }
                    .c-role { font-size: 10px !important; margin-bottom: 8px !important; }
                    .vote-count { font-size: 16px !important; }
                    .action-btn { padding: 8px 4px !important; font-size: 11px !important; letter-spacing: 0px !important; }
                    .btn-share { padding: 8px !important; }
                    .team-tag { padding: 4px 8px !important; font-size: 8px !important; }
                }
                
                .contestant-card { background: #111111; border: 1px solid #2A2A2A; border-radius: 16px; overflow: hidden; position: relative; transition: all 0.3s ease; }
                .contestant-card:hover { transform: translateY(-4px); border-color: #FFD700; box-shadow: 0 8px 32px rgba(255, 215, 0, 0.08); }
                .card-media { position: relative; width: 100%; aspect-ratio: 16/9; overflow: hidden; cursor: pointer; background: #0a0a0a; }
                .card-media img { width: 100%; height: 100%; object-fit: contain; transition: transform 0.5s ease; }
                .contestant-card:hover .card-media img { transform: scale(1.05); }
                .card-play-btn { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(255, 215, 0, 0.9); color: #000; border: none; width: 56px; height: 56px; border-radius: 50%; font-size: 22px; cursor: pointer; opacity: 0; transition: all 0.3s ease; display: flex; align-items: center; justify-content: center; padding-left: 4px; }
                .card-media:hover .card-play-btn { opacity: 1; }
                .card-body { padding: 20px; }
                .c-name { font-size: 18px; font-weight: 700; color: #FFFFFF; margin: 0 0 4px 0; }
                .c-role { font-size: 12px; color: #737373; margin: 0 0 12px 0; text-transform: uppercase; letter-spacing: 0.05em; }
                .vote-bar-track { width: 100%; height: 6px; background: #1A1A1A; border-radius: 3px; margin-bottom: 12px; overflow: hidden; }
                .vote-bar-fill { height: 100%; background: linear-gradient(90deg, #FFD700, #FF8C00); border-radius: 3px; transition: width 0.5s ease; box-shadow: 0 0 8px rgba(255, 215, 0, 0.3); }
                .vote-count { font-family: 'JetBrains Mono', monospace; font-size: 20px; font-weight: 700; color: #FFD700; margin: 0; }
                .vote-pct { font-size: 12px; color: #737373; margin: 0 0 16px 0; }
                .card-actions { display: flex; gap: 8px; }
                .action-btn { flex: 1; padding: 12px; border-radius: 10px; font-size: 13px; font-weight: 700; cursor: pointer; border: none; transition: all 0.2s ease; text-transform: uppercase; letter-spacing: 0.02em; text-align: center; }
                .btn-vote { background: #FFD700; color: #000000; }
                .btn-vote:hover { background: #FFEA50; }
                .btn-vote.voted { background: #4ADE80; color: #000; }
                .btn-gift { background: transparent; border: 1px solid #FFD700; color: #FFD700; }
                .btn-gift:hover { background: rgba(255, 215, 0, 0.1); }
                .btn-share { background: #1A1A1A; border: 1px solid #333; color: #A3A3A3; padding: 12px; border-radius: 10px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; justify-content: center; }
                                .btn-share:hover { border-color: '#FFD700'; color: '#FFD700'; }
                
                .team-tag { position: absolute; top: 12px; left: 12px; background: linear-gradient(135deg, rgba(124, 58, 237, 0.7) 0%, rgba(168, 85, 247, 0.7) 100%); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); color: #FFFFFF; font-size: 10px; font-weight: 900; padding: 4px 14px; border-radius: 100px; text-transform: uppercase; letter-spacing: 0.1em; border: 1.5px solid rgba(192, 132, 252, 0.8); box-shadow: 0 0 16px rgba(168, 85, 247, 0.6), inset 0 0 4px rgba(255, 255, 255, 0.3); z-index: 3; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5); }

                .gift-badge-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; padding-top: 10px; border-top: 1px solid #1A1A1A; }
                .gift-badge { display: flex; align-items: center; gap: 3px; background: rgba(255, 215, 0, 0.06); border: 1px solid rgba(255, 215, 0, 0.2); border-radius: 6px; padding: 3px 8px; font-size: 11px; color: '#FFD700'; font-weight: 600; }

                /* ====== ELIMINATED SECTION ====== */
                .eliminated-section { border-top: 1px dashed #2A2A2A; padding-top: 40px; margin-top: 40px; }
                .eliminated-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
                @media (max-width: 768px) { .eliminated-grid { grid-template-columns: repeat(2, 1fr); } }
                .eliminated-card { background: #0A0A0A; border: 1px solid #1A1A1A; border-radius: 12px; padding: 16px; text-align: center; filter: grayscale(100%) opacity(0.5); transition: all 0.3s ease; }
                .eliminated-card:hover { filter: grayscale(0%) opacity(1); border-color: #333; }
                .eliminated-card img { width: 60px; height: 60px; border-radius: 50%; object-fit: cover; margin-bottom: 8px; }
                .eliminated-card .name { font-size: 14px; font-weight: 600; color: #737373; margin: 0; text-decoration: line-through; }
                .eliminated-card .status { font-size: 11px; color: #737373; margin: 4px 0 0 0; text-transform: uppercase; letter-spacing: 0.08em; }

                /* ====== TOP SUPPORTERS SIDEBAR ====== */
                .supporters-panel { background: #111111; border: 1px solid #2A2A2A; border-radius: 16px; padding: 20px; margin-bottom: 32px; }
                .supporters-title { font-size: 11px; font-weight: 700; color: #737373; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 16px 0; }
                .supporter-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid #1A1A1A; }
                .supporter-row:last-child { border-bottom: none; }
                .supporter-rank { font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 700; color: #FFD700; min-width: 24px; }
                .supporter-rank.regular { color: #737373; }
                .supporter-avatar { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
                .supporter-name { flex: 1; font-size: 14px; font-weight: 500; color: #FFFFFF; }
                .supporter-amount { font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 700; color: #FFD700; }
                .supporter-highlight { background: rgba(255, 215, 0, 0.05); border-left: 2px solid #FFD700; margin: 0 -20px; padding: 8px 20px; }

                /* ====== ARENA NAV TABS (Universal Filtering) ====== */
                .mobile-tab-bar { display: flex; position: sticky; top: 0; left: 0; right: 0; background: rgba(0,0,0,0.95); backdrop-filter: blur(20px); border-bottom: 1px solid #2A2A2A; z-index: 105; padding: 12px 16px; gap: 8px; margin: 0 -16px 24px -16px; box-shadow: 0 10px 25px rgba(0,0,0,0.5); align-items: center; justify-content: center; flex-wrap: wrap; } 
                
                /* ====== ARENA NAV TABS (Universal View) ====== */
                
                /* Force Tab Bar Visibility Everywhere */
                .mobile-tab-bar { display: flex !important; }

                /* Tab Filtering Logic (Desktop & Mobile) */
                
                /* Standings: Hide Grid & Sidebar */
                .mobile-tab-standings .arena-section,
                .mobile-tab-standings .eliminated-section,
                .mobile-tab-standings .desktop-sidebar { display: none !important; }
                
                /* Eliminated: Hide Grid & Sidebar */
                .mobile-tab-eliminated .marquee-container,
                .mobile-tab-eliminated .arena-section,
                .mobile-tab-eliminated .desktop-sidebar { display: none !important; }
                
                /* Supporters: Hide Main Content Column */
                .mobile-tab-supporters .main-content-column { display: none !important; }
                /* Expanded Supporters View on Desktop when clicked */
                @media (min-width: 1025px) {
                    .mobile-tab-supporters .desktop-sidebar { width: 100%; max-width: 800px; margin: 0 auto; }
                }

                @media (max-width: 1024px) {
                    .desktop-layout { flex-direction: column !important; }
                    .desktop-sidebar { width: 100% !important; order: -1; margin-bottom: 24px; }
                    .desktop-layout { flex-direction: column !important; }
                    .desktop-sidebar { width: 100% !important; order: -1; margin-bottom: 24px; }
                    
                    /* Arena Tab: Shows EVERYTHING (Default View - No display:none) */
                    
                    /* Standings Tab: Headliner and Executive Producer only */
                    .mobile-tab-standings .arena-section,
                    .mobile-tab-standings .eliminated-section,
                    .mobile-tab-standings .desktop-sidebar { display: none !important; }
                    
                    /* Eliminated Tab: Eliminated array only */
                    .mobile-tab-eliminated .marquee-container,
                    .mobile-tab-eliminated .arena-section,
                    .mobile-tab-eliminated .desktop-sidebar { display: none !important; }
                    
                    /* Supporters Tab: Top Supporters only */
                    .mobile-tab-supporters .main-content-column { display: none !important; }
                }
                .mob-tab { padding: 6px 14px; border-radius: 100px; font-size: 11px; font-weight: 700; white-space: nowrap; border: 1px solid #2A2A2A; background: #0A0A0A; color: #737373; cursor: pointer; transition: all 0.2s; text-transform: uppercase; }
                .mob-tab.active { background: #FFD700; color: #000; border-color: #FFD700; }

                /* ====== GIFT MODAL ====== */
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

/* ====== FUTURISTIC GLASS PLAYBACK MODAL ====== */
.cs-video-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.88);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
}
.cs-video-container {
    width: 100%;
    display: flex;
    flex-direction: column;
    background: rgba(18, 18, 18, 0.65);
    border: 1px solid rgba(255, 215, 0, 0.2);
    border-radius: 24px;
    overflow: hidden;
    backdrop-filter: blur(30px);
    -webkit-backdrop-filter: blur(30px);
    box-shadow: 0 30px 100px rgba(0,0,0,0.9), inset 0 1px 1px rgba(255,255,255,0.08);
    transition: max-width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.cs-video-container.vertical {
    max-width: 420px;
    height: 85vh;
}
.cs-video-container.horizontal {
    max-width: 900px;
}
.cs-video-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 18px 24px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    background: rgba(0, 0, 0, 0.25);
}
.cs-video-branding {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: #FFD700;
    text-shadow: 0 0 10px rgba(255, 215, 0, 0.3);
}
.cs-video-title {
    color: #FFF;
    font-weight: 800;
    margin: 4px 0 0 0;
    font-size: 15px;
    letter-spacing: -0.01em;
}
.cs-video-close {
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #FFF;
    font-size: 16px;
    cursor: pointer;
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s;
}
.cs-video-close:hover {
    background: #DC3545;
    border-color: #DC3545;
    transform: scale(1.08);
}
.cs-video-body {
    flex: 1;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
    position: relative;
}
.cs-video-frame-container {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}
.cs-video-frame-container.vertical {
    aspect-ratio: 9/16;
    max-height: 100%;
}
.cs-video-frame-container.horizontal {
    aspect-ratio: 16/9;
    width: 100%;
}
.cs-video-iframe {
    width: 100%;
    height: 100%;
    border: none;
}
            `}</style>

            {/* ====== ARENA HEADER ====== */}
            <div style={{ textAlign: 'center', marginBottom: '32px', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <button onClick={(e) => handleShare(e)} 
                    style={{ alignSelf: 'flex-end', marginBottom: '10px', background: 'transparent', border: '1px solid #333', color: '#A3A3A3', padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', fontWeight: 600, transition: 'all 0.2s' }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor='#FFD700'; e.currentTarget.style.color='#FFD700'; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor='#333'; e.currentTarget.style.color='#A3A3A3'; }}>
                    <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
                    Share Arena
                </button>
                <p className="section-label" style={{ marginBottom: '12px' }}>NVA Film Club — Docu-Series Challenges</p>
                <h1 style={{ fontSize: 'clamp(32px, 5vw, 56px)', fontWeight: 900, color: '#FFFFFF', margin: 0, textTransform: 'uppercase', letterSpacing: '-1px', lineHeight: 0.9 }}>Spotlight Arena</h1>
                <p style={{ color: '#737373', fontSize: '14px', marginTop: '12px' }}>Vote for your favorite performers. The bottom contestants face elimination.</p>
            </div>

            {/* ====== STAGE TIMELINE (Interactive History) ====== */}
            <div className="stage-timeline">
                {stages.map((stage, idx) => {
                    const isFuture = idx > currentStageIndex;
                    const isSelected = viewingStageIndex !== null ? viewingStageIndex === idx : idx === currentStageIndex;
                    return (
                        <React.Fragment key={stage}>
                            <div 
                                className={`stage-pill ${idx < currentStageIndex ? 'completed' : ''} ${isSelected ? 'active' : ''}`}
                                onClick={() => !isFuture && setViewingStageIndex(idx)}
                                style={{ 
                                    cursor: isFuture ? 'not-allowed' : 'pointer', 
                                    opacity: isFuture ? 0.2 : 1,
                                    filter: isFuture ? 'grayscale(1)' : 'none',
                                    pointerEvents: isFuture ? 'none' : 'auto',
                                    borderColor: isSelected ? '#A855F7' : (idx < currentStageIndex ? '#4ADE80' : '#2A2A2A')
                                    cursor: isFuture ? 'not-allowed' : 'pointer', 
                                    opacity: isFuture ? 0.35 : 1,
                                    pointerEvents: isFuture ? 'none' : 'auto'
                                }}
                                title={isFuture ? "Stage Locked — Has Not Started" : ""}
                            >
                                {idx < currentStageIndex ? '✓ ' : ''}{stage}
                                {isFuture ? ' 🔒' : ''}
                            </div>
                            {idx < stages.length - 1 && (
                            <div className="stage-connector">
                                <div className="stage-connector-fill" style={{ 
                                    width: (idx < (viewingStageIndex !== null ? viewingStageIndex : currentStageIndex)) ? '100%' : '0%',
                                    background: idx < currentStageIndex ? '#4ADE80' : '#2A2A2A'
                                }} />
                            </div>
                        )}
                        </React.Fragment>
                    );
                })}
            </div>

           {/* ====== WINNER CELEBRATION OVERRIDE ====== */}
            {((activeViewingStageName.toLowerCase().includes('winner') || activeViewingStageName.toLowerCase().includes('champion') || activeViewingStageName.toLowerCase() === 'finale') && arenaData.headliner) && (
                <div style={{ background: 'linear-gradient(135deg, rgba(255,215,0,0.15), rgba(0,0,0,0.95))', border: '2px solid #FFD700', borderRadius: '16px', padding: '40px 20px', textAlign: 'center', marginBottom: '40px', position: 'relative', overflow: 'hidden' }}>
                    {competitionState?.championMediaUrl ? (
                        competitionState.championMediaType === 'video' ? (
                            <video src={competitionState.championMediaUrl} autoPlay loop muted playsInline style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.18, pointerEvents: 'none' }} />
                        ) : (
                            <img src={competitionState.championMediaUrl} alt="Champion Background" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.18, pointerEvents: 'none' }} />
                        )
                    ) : (
                        <div style={{ position: 'absolute', inset: 0, background: 'url(https://media.giphy.com/media/l41YkxvU8c7J7Bba0/giphy.gif) center/cover', opacity: 0.1, pointerEvents: 'none' }} />
                    )}
                    <p style={{ color: '#FFD700', fontSize: '14px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.2em', margin: '0 0 16px 0', position: 'relative', zIndex: 2 }}>🏆 Official Champion 🏆</p>
                    <img src={arenaData.headliner.profilePictureUrl} alt="Winner" style={{ width: '120px', height: '120px', borderRadius: '50%', border: '4px solid #FFD700', boxShadow: '0 0 40px rgba(255,215,0,0.5)', marginBottom: '16px' }} />
                    <h2 style={{ color: '#FFF', fontSize: '36px', fontWeight: 900, margin: '0 0 8px 0', textTransform: 'uppercase' }}>{arenaData.headliner.creatorName}</h2>
                    <p style={{ color: '#AAA', fontSize: '16px', margin: 0 }}>With {arenaData.headliner.voteCount || 0} Votes & {arenaData.headliner.giftsReceived || 0} Gifts!</p>
                    <button 
                        onClick={(e) => handleShare(e, arenaData.headliner.id, arenaData.headliner.creatorName, true)} 
                        style={{ background: 'transparent', border: '1px solid #FFD700', color: '#FFD700', margin: '20px auto 0 auto', padding: '8px 18px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'transform 0.2s' }}
                    >
                        <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
                        Share Champion
                    </button>
                </div>
            )}

            {/* ====== MAIN THEATER (History Capable) ====== */}
            {(() => {
                // Resolve dynamic stage media for the currently viewed round
                const stageMedia = competitionState?.roundMedia?.[activeViewingStageName] || {};
                const activeLink = stageMedia.link || '';
                const activeThumb = stageMedia.thumbnail || '';

                if (!activeLink && !activeThumb) return null;

                const ytMatch = activeLink.match(/[?&]v=([^&]+)/) || activeLink.match(/youtu\.be\/([^?]+)/);
                const ytId = ytMatch ? ytMatch[1] : null;
                const displayThumb = activeThumb || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : 'https://placehold.co/1200x675/050505/333?text=WATCH+THE+CHALLENGE');

                return (
                    <div className="theater-section">
                        <div className="theater-label">🎬 {activeViewingStageName} CHALLENGE FILM</div>
                        <div className="card-media" style={{ aspectRatio: '16/9', background: '#0a0a0a', cursor: activeLink ? 'pointer' : 'default', position: 'relative' }} onClick={() => activeLink && openPlayback(activeLink, `${activeViewingStageName} Group Film`)}>
                            <img src={displayThumb} alt="Group Challenge" style={{ objectFit: 'contain' }} />
                            {activeLink && <button className="play-trigger" style={{ zIndex: 10 }}>▶</button>}
                        </div>
                        <div style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <p style={{ margin: 0, color: '#FFFFFF', fontWeight: 700, fontSize: '16px' }}>{activeViewingStageName} Performance</p>
                                <p style={{ margin: '4px 0 0 0', color: '#737373', fontSize: '12px' }}>Featuring all active contestants</p>
                            </div>
                            {activeLink && (
                                <button className="team-play-trigger" onClick={() => openPlayback(activeLink, `${activeViewingStageName} Group Film`)}>
                                    ▶ Watch Now
                                </button>
                            )}
                        </div>
                    </div>
                );
            })()}
                    
            {/* ====== MOBILE TAB BAR (Sticky Top) ====== */}
            <div className="mobile-tab-bar">
                <button className={`mob-tab ${activeMobileTab === 'arena' ? 'active' : ''}`} onClick={() => setActiveMobileTab('arena')}>Arena</button>
                <button className={`mob-tab ${activeMobileTab === 'standings' ? 'active' : ''}`} onClick={() => setActiveMobileTab('standings')}>Standings</button>
                <button className={`mob-tab ${activeMobileTab === 'eliminated' ? 'active' : ''}`} onClick={() => setActiveMobileTab('eliminated')}>Eliminated</button>
                <button className={`mob-tab ${activeMobileTab === 'supporters' ? 'active' : ''}`} onClick={() => setActiveMobileTab('supporters')}>Supporters</button>
            </div>

            {/* ====== DESKTOP LAYOUT: Content + Sidebar ====== */}
            <div className={`desktop-layout mobile-tab-${activeMobileTab}`} style={{ display: 'flex', gap: '24px' }}>
                <div className="main-content-column" style={{ flex: 1, minWidth: 0 }}>

                    {/* ====== DUAL MARQUEES ====== */}
                    <div className="marquee-container">
                        {arenaData.headliner && (
                            <div className="marquee-card headliner">
                                <p className="award-label gold">👑 THE HEADLINER — Most Votes</p>
                                {(() => {
                                    const roundPerf = arenaData.headliner.performances?.[activeViewingStageName];
                                    const url = roundPerf?.link || (viewingStageIndex === null || viewingStageIndex === currentStageIndex ? arenaData.headliner.currentChallengeLink : '');
                                    const ytMatch = url?.match(/[?&]v=([^&]+)/) || url?.match(/youtu\.be\/([^?]+)/);
                                    const ytId = ytMatch ? ytMatch[1] : null;
                                    const headlinerThumb = roundPerf?.thumbnail || (viewingStageIndex === null || viewingStageIndex === currentStageIndex ? arenaData.headliner.currentChallengeThumbnail : null) || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : null);
                                    
                                    return headlinerThumb ? (
                                        <div className="card-media" style={{ borderRadius: '12px', marginBottom: '16px', aspectRatio: '16/9' }} onClick={() => openPlayback(arenaData.headliner.currentChallengeLink, `${arenaData.headliner.creatorName}'s Performance`)}>
                                            <img src={headlinerThumb} alt={arenaData.headliner.creatorName} style={{ borderRadius: '12px', objectFit: 'contain' }} />
                                            <button className="card-play-btn" style={{ opacity: 1, width: '48px', height: '48px', fontSize: '18px' }}>▶</button>
                                        </div>
                                    ) : (
                                        <img src={arenaData.headliner.profilePictureUrl} alt={arenaData.headliner.creatorName} className="marquee-avatar" style={{ width: '80px', height: '80px', border: '3px solid #FFD700', boxShadow: '0 0 20px rgba(255,215,0,0.3)', objectFit: 'cover' }} />
                                    );
                                })()}
                                <h2 className="marquee-name" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                    {arenaData.headliner.creatorName}
                                    {renderPatronStripe(arenaData.headliner)}
                                </h2>
                                <p className="marquee-stats gold" style={{ marginBottom: '4px' }}>
                                    {((viewingStageIndex === null || viewingStageIndex === currentStageIndex) 
                                        ? (arenaData.headliner.voteCount || 0) 
                                        : (arenaData.headliner.performances?.[activeViewingStageName]?.votes ?? arenaData.headliner.voteCount ?? 0)
                                    )} VOTES
                                </p>
                                
                                {/* EXACT GIFTS RECEIVED */}
                                {(() => {
                                    const isCurrent = viewingStageIndex === null || viewingStageIndex === currentStageIndex;
                                    const inventory = isCurrent ? (arenaData.headliner.giftInventory || {}) : (arenaData.headliner.performances?.[activeViewingStageName]?.gifts || {});
                                    if (Object.keys(inventory).length === 0) return null;
                                    return (
                                        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                                            {giftTokens.map(token => {
                                                const count = inventory[token.name] || 0;
                                                if (count === 0) return null;
                                                return (
                                                    <div key={token.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(255, 215, 0, 0.1)', border: '1px solid rgba(255, 215, 0, 0.3)', borderRadius: '6px', padding: '2px 8px', fontSize: '13px' }}>
                                                        <span>{token.icon}</span><span style={{ color: '#FFD700', fontWeight: 'bold' }}>x{count}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}

                                {(() => {
                                    const roundPerf = arenaData.headliner.performances?.[activeViewingStageName];
                                    const activeLink = roundPerf?.link || (viewingStageIndex === null || viewingStageIndex === currentStageIndex ? arenaData.headliner.currentChallengeLink : '');
                                    return (
                                        <button 
                                            className="marquee-action gold" 
                                            onClick={() => activeLink && openPlayback(activeLink, `${arenaData.headliner.creatorName}'s Performance`)}
                                            disabled={!activeLink}
                                            style={{ opacity: activeLink ? 1 : 0.5, cursor: activeLink ? 'pointer' : 'not-allowed' }}
                                        >
                                            {activeLink ? '▶ Watch Performance' : 'No Performance Yet'}
                                        </button>
                                    );
                                })()}
                            </div>
                        )}
                        {arenaData.topProducer && (
                            <div className="marquee-card producer">
                                <p className="award-label silver">🎬 EXECUTIVE PRODUCER'S CHOICE — Most Gifts</p>
                                <img src={arenaData.topProducer.profilePictureUrl} alt={arenaData.topProducer.creatorName} className="marquee-avatar" style={{ border: '3px solid #C0C0C0', boxShadow: '0 0 20px rgba(192,192,192,0.2)' }} />
                                <h2 className="marquee-name" style={{ color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '2px' }}>
                                    {arenaData.topProducer.creatorName}
                                    {renderPatronStripe(arenaData.topProducer)}
                                </h2>
                                <p className="marquee-stats silver" style={{ marginBottom: '4px' }}>
                                    {((viewingStageIndex === null || viewingStageIndex === currentStageIndex) 
                                        ? (arenaData.topProducer.giftsReceived || 0) 
                                        : (arenaData.topProducer.performances?.[activeViewingStageName]?.earnings ?? arenaData.topProducer.giftsReceived ?? 0)
                                    )} GIFTS RECEIVED
                                </p>

                                {/* EXACT GIFTS RECEIVED */}
                                {(() => {
                                    const isCurrent = viewingStageIndex === null || viewingStageIndex === currentStageIndex;
                                    const inventory = isCurrent ? (arenaData.topProducer.giftInventory || {}) : (arenaData.topProducer.performances?.[activeViewingStageName]?.gifts || {});
                                    if (Object.keys(inventory).length === 0) return null;
                                    return (
                                        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                                            {giftTokens.map(token => {
                                                const count = inventory[token.name] || 0;
                                                if (count === 0) return null;
                                                return (
                                                    <div key={token.id} style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(192, 192, 192, 0.1)', border: '1px solid rgba(192, 192, 192, 0.3)', borderRadius: '6px', padding: '2px 8px', fontSize: '13px' }}>
                                                        <span>{token.icon}</span><span style={{ color: '#C0C0C0', fontWeight: 'bold' }}>x{count}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    );
                                })()}

                                <button className="marquee-action silver" onClick={() => openGiftModal(arenaData.topProducer)}>🎁 Send a Gift</button>
                            </div>
                        )}
                    </div>

                    {/* ====== ARENA SECTION ====== */}
                    <div className="arena-section">
                        <p className="section-title">The Call Sheet — {arenaData.callSheet.length} Active</p>

                        {/* ====== CONTESTANT GRID ====== */}
                        <div className="call-sheet-grid">
                        {arenaData.callSheet.map(actor => {
                            const maxVotes = arenaData.headliner?.voteCount || 1;
                            const pct = Math.min(100, Math.max(5, ((actor.voteCount || 0) / maxVotes) * 100));
                            return (
                                <div key={actor.id} className="contestant-card">
                                    {/* Team Tag */}
                                    {actor.teamTag && <span className="team-tag">{actor.teamTag}</span>}
                                    
                                    {/* Performance Thumbnail with History Support */}
                                    {(() => {
                                        const roundPerf = actor.performances?.[activeViewingStageName];
                                        const activeLink = roundPerf?.link || (viewingStageIndex === null || viewingStageIndex === currentStageIndex ? actor.currentChallengeLink : null);
                                        const activeThumb = roundPerf?.thumbnail || (viewingStageIndex === null || viewingStageIndex === currentStageIndex ? actor.currentChallengeThumbnail : null);

                                        const ytMatch = activeLink?.match(/[?&]v=([^&]+)/) || activeLink?.match(/youtu\.be\/([^?]+)/);
                                        const ytId = ytMatch ? ytMatch[1] : null;
                                        const cardThumb = activeThumb || (ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : actor.profilePictureUrl);

                                        return (
                                            <div className="card-media" onClick={() => activeLink && openPlayback(activeLink, `${actor.creatorName} - ${activeViewingStageName}`)}>
                                                <img src={cardThumb} alt={actor.creatorName} style={{ objectFit: 'contain', opacity: activeLink ? 1 : 0.4 }} />
                                                {!activeLink && (
                                                    <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666', fontSize: '10px', fontWeight: 800, textAlign: 'center', padding: '10px' }}>
                                                        NO VIDEO IN THIS ROUND
                                                    </div>
                                                )}
                                                {activeLink && <button className="card-play-btn">▶</button>}
                                            </div>
                                        );
                                    })()}
                                    
                                    <div className="card-body">
                                        <h3 className="c-name" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '2px' }}>
                                            {actor.creatorName}
                                            {renderPatronStripe(actor)}
                                        </h3>
                                        <p className="c-role">{actor.teamTag ? `Team ${actor.teamTag}` : 'Contestant'} {actor.creatorField ? `• ${actor.creatorField}` : ''}</p>
                                        
                                        {/* Supporter Badge */}
                                        {actor.badges?.includes('Supporter') && (
                                            <span style={{ display: 'inline-block', background: 'rgba(255, 215, 0, 0.1)', border: '1px solid rgba(255, 215, 0, 0.3)', color: '#FFD700', fontSize: '10px', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>🔥 SUPPORTER</span>
                                        )}
                                        
                                        {/* Vote Bar */}
                                        <div className="vote-bar-track"><div className="vote-bar-fill" style={{ width: `${pct}%` }} /></div>
                                        <p className="vote-count">
                                            {((viewingStageIndex === null || viewingStageIndex === currentStageIndex) 
                                                ? (actor.voteCount || 0) 
                                                : (actor.performances?.[activeViewingStageName]?.votes ?? actor.voteCount ?? 0)
                                            )} <span style={{ fontSize: '12px', fontWeight: 400, color: '#737373' }}>votes</span>
                                        </p>
                                        <p className="vote-pct">{pct.toFixed(1)}% of Headliner</p>
                                        
                                        {/* GIFT BADGE ROW — Strict Specific Emojis Only */}
                                        {(() => {
                                            const isCurrent = viewingStageIndex === null || viewingStageIndex === currentStageIndex;
                                            const inventory = isCurrent ? (actor.giftInventory || {}) : (actor.performances?.[activeViewingStageName]?.gifts || {});
                                            if (Object.keys(inventory).length === 0) return null;
                                            return (
                                                <div className="gift-badge-row" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '10px', paddingTop: '10px', marginBottom: '12px', borderTop: '1px solid #1A1A1A' }}>
                                                    {giftTokens.map(token => {
                                                        const count = inventory[token.name] || 0;
                                                        if (count === 0) return null;
                                                        return (
                                                            <div key={token.id} style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'rgba(255, 215, 0, 0.1)', border: '1px solid rgba(255, 215, 0, 0.2)', borderRadius: '6px', padding: '2px 6px', fontSize: '11px' }} title={`${token.name} — ${count} received`}>
                                                                <span>{token.icon}</span>
                                                                <span style={{ color: '#FFD700', fontWeight: 'bold' }}>x{count}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            );
                                        })()}
                                        
                                        {/* Actions */}
                                        <div className="card-actions">
                                            <button className="action-btn btn-vote" onClick={() => handleFreeVote(actor.id)}>Vote</button>
                                            <button className="action-btn btn-gift" onClick={() => openGiftModal(actor)}>Gift</button>
                                            <button className="btn-share" onClick={(e) => handleShare(e, actor.id, actor.creatorName, false)} title="Share">
                                                <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                        </div>
                    </div>

                    {/* ====== ELIMINATED SECTION ====== */}
                    {arenaData.eliminated.length > 0 && (
                        <div className="eliminated-section">
                            <p className="section-title" style={{ textAlign: 'center' }}>The Cutting Room Floor — {arenaData.eliminated.length} Eliminated</p>
                            <div className="eliminated-grid">
                                {arenaData.eliminated.map(actor => (
                                    <div key={actor.id} className="eliminated-card">
                                        <img src={actor.profilePictureUrl || 'https://placehold.co/60'} alt={actor.creatorName} />
                                        <p className="name">{actor.creatorName}</p>
                                        <p className="status">Eliminated</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* ====== DESKTOP SIDEBAR ====== */}
                <div className="desktop-sidebar" style={{ width: '300px', flexShrink: 0 }}>
                    <div className="supporters-panel" style={{ padding: 0, overflow: 'hidden', border: '1px solid #2A2A2A' }}>
                        
                        {/* SPONSOR BANNER INSIDE TOP SUPPORTERS */}
                        {(() => {
                            const stageSponsor = competitionState?.roundSponsors?.[activeViewingStageName] || {};
                            if (!stageSponsor.sponsorMediaUrl) return null;
                            return (
                                <div 
                                    style={{ display: 'block', width: '100%', borderBottom: '1px solid #2A2A2A', background: '#0A0A0A', position: 'relative', cursor: stageSponsor.sponsorLink ? 'pointer' : 'default' }}
                                    onClick={() => { if (stageSponsor.sponsorLink) window.open(stageSponsor.sponsorLink, '_blank', 'noopener,noreferrer'); }}
                                >
                                    <div style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.8)', color: '#FFD700', fontSize: '10px', fontWeight: 800, padding: '4px 8px', borderRadius: '4px', textTransform: 'uppercase', zIndex: 2, backdropFilter: 'blur(4px)' }}>Sponsored By {stageSponsor.sponsorTitle || 'Partner'}</div>
                                    <img src={stageSponsor.sponsorMediaUrl} alt={stageSponsor.sponsorTitle || "Sponsor"} style={{ width: '100%', maxHeight: '160px', objectFit: 'contain', display: 'block', padding: '10px', margin: '0 auto', transition: 'transform 0.3s ease' }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.05)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'} />
                                </div>
                            );
                        })()}

                        <div style={{ padding: '20px' }}>
                            <p className="supporters-title">🏆 Top Supporters</p>
                            
                            {topSupporters.length > 0 ? (
                                <div 
                                    onTouchStart={handleTouchStart}
                                    onTouchMove={handleTouchMove}
                                    onTouchEnd={handleTouchEnd}
                                >
                                    {Array.from({ length: activeMobileTab === 'supporters' ? Math.min(10, topSupporters.length) : 1 }).map((_, i) => {
                                        const actualIdx = (supporterIndex + i) % topSupporters.length;
                                        const supporter = topSupporters[actualIdx];
                                        return (
                                            <div 
                                                key={supporter.userId || actualIdx}
                                                onClick={() => {
                                                    if (!supporter.isAnonymous) {
                                                        window.dispatchEvent(new CustomEvent('navigateToUserProfile', { detail: { userId: supporter.userId } }));
                                                    }
                                                }}
                                                style={{ 
                                                    background: 'rgba(255, 215, 0, 0.04)', 
                                                    borderLeft: '3px solid #FFD700', 
                                                    margin: i === 0 ? '12px -20px 0 -20px' : '4px -20px 0 -20px', 
                                                    padding: '16px 20px', 
                                                    display: 'flex', 
                                                    alignItems: 'center', 
                                                    justifyContent: 'space-between',
                                                    cursor: supporter.isAnonymous ? 'default' : 'pointer',
                                                    transition: 'all 0.3s ease',
                                                    borderBottom: activeMobileTab === 'supporters' ? '1px solid #1A1A1A' : 'none'
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                    <span className="supporter-rank" style={{ fontSize: '14px', color: actualIdx === 0 ? '#FFD700' : actualIdx === 1 ? '#C0C0C0' : actualIdx === 2 ? '#CD7F32' : '#AAA', width: '24px' }}>
                                                        #{actualIdx + 1}
                                                    </span>
                                                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', overflow: 'hidden', background: '#222', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #333', flexShrink: 0 }}>
                                                        {supporter.isAnonymous ? (
                                                            <span style={{ fontSize: '14px' }}>👤</span>
                                                        ) : (
                                                            <img 
                                                                src={i === 0 && currentSupporterAvatar ? currentSupporterAvatar : `https://ui-avatars.com/api/?name=${encodeURIComponent(supporter.userName)}&background=222&color=FFD700`} 
                                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                                alt="Supporter" 
                                                                onError={(e) => { e.target.onerror = null; e.target.src = 'https://placehold.co/32?text=👑'; }}
                                                            />
                                                        )}
                                                    </div>
                                                    <div style={{ overflow: 'hidden' }}>
                                                        <span className="supporter-name" style={{ display: 'block', fontWeight: 'bold', fontSize: '13px', color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {supporter.userName}
                                                        </span>
                                                        <span style={{ fontSize: '10px', color: '#888' }}>
                                                            {supporter.isAnonymous ? 'Anonymous' : 'Verified Patron'}
                                                        </span>
                                                    </div>
                                                </div>
                                                <span className="supporter-amount" style={{ fontFamily: 'monospace', color: '#FFD700', fontWeight: 'bold', fontSize: '14px', flexShrink: 0, paddingLeft: '8px' }}>
                                                    {(supporter.amount || 0).toLocaleString()} GYD
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p style={{ color: '#737373', fontSize: '12px', textAlign: 'center', margin: '16px 0 0 0', padding: '16px', borderTop: '1px solid #1A1A1A' }}>
                                    Top supporters will appear here once gifts start flowing.
                                </p>
                            )}
                            
                            {/* Visual navigation dots (Hidden in Supporters tab since it's a full list) */}
                            {topSupporters.length > 1 && activeMobileTab !== 'supporters' && (
                                <div style={{ display: 'flex', justifyContent: 'center', gap: '4px', marginTop: '12px' }}>
                                    {topSupporters.map((_, idx) => (
                                        <div 
                                            key={idx} 
                                            style={{ 
                                                width: '6px', 
                                                height: '6px', 
                                                borderRadius: '50%', 
                                                background: idx === supporterIndex ? '#FFD700' : '#333',
                                                transition: 'background 0.3s' 
                                            }} 
                                        />
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ====== GIFT MODAL ====== */}
            {isGiftModalOpen && targetActor && (
                <div className="gift-modal-overlay" onClick={() => !isSubmitting && setIsGiftModalOpen(false)}>
                    <div className="gift-modal" onClick={e => e.stopPropagation()}>
                        {!submitSuccess ? (
                            <>
                                <div className="modal-header">
                                    <div>
                                        <p style={{ color: '#737373', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Send a Gift To</p>
                                        <h2 style={{ color: '#FFFFFF', fontSize: '24px', fontWeight: 800, margin: '4px 0 0 0' }}>{targetActor.creatorName}</h2>
                                    </div>
                                    <button className="modal-close" onClick={() => setIsGiftModalOpen(false)}>✕</button>
                                </div>

                                <p style={{ color: '#737373', fontSize: '12px', margin: '0 0 20px 0' }}>Select a Token. Gifts support the actor financially. Votes decide the Headliner.</p>

                                <div style={{ maxHeight: '280px', overflowY: 'auto', marginBottom: '16px', paddingRight: '4px' }}>
                                    {giftTokens.map(token => {
                                        const platformFee = token.price * 0.15;
                                        const actorReceives = token.price * 0.85;
                                        return (
                                            <div key={token.id} className={`token-card ${selectedToken.id === token.id ? 'selected' : ''}`} onClick={() => setSelectedToken(token)}>
                                                <div className="token-icon">
                                                    {token.id === 'spotlight' && '🔦'}
                                                    {token.id === 'popcorn' && '🍿'}
                                                    {token.id === 'flare' && '🌈'}
                                                    {token.id === 'chair' && '🎬'}
                                                    {token.id === 'producer' && '💎'}
                                                </div>
                                                <div className="token-info">
                                                    <p className="token-name">{token.name}</p>
                                                    <p className="token-breakdown">Actor: {actorReceives.toLocaleString()} GYD &nbsp;•&nbsp; Fee: {platformFee.toLocaleString()} GYD (15%)</p>
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
                                        <span className="breakdown-label positive">Actor Receives</span>
                                        <span className="breakdown-value positive">{((selectedToken?.price || 0) * 0.85).toLocaleString()} GYD ✓</span>
                                    </div>
                                </div>

                                {/* THE NEW GLASSMORPHIC EARNINGS GIFT BUTTON */}
                                <div style={{ marginBottom: '15px' }}>
                                    <button 
                                        type="button"
                                        className="earnings-btn" 
                                        disabled={isSubmitting || (creatorProfile?.totalEarnings || 0) < (selectedToken?.price || 0)}
                                        onClick={() => setShowEarningsConfirm(true)}
                                    >
                                        Send with Earnings — {(selectedToken?.price || 0).toLocaleString()} GYD
                                    </button>
                                </div>

                                {/* Anonymous Toggle */}
                                <label className="anon-toggle">
                                    <input type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} />
                                    <span>Gift anonymously (hide my name from public toasts)</span>
                                </label>

                                {/* MMG Instructions */}
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
                                    <button className="action-btn btn-ghost" style={{ flex: 1 }} onClick={() => setIsGiftModalOpen(false)} disabled={isSubmitting}>Cancel</button>
                                    <button className="submit-btn" style={{ flex: 2 }} onClick={submitGiftPledge} disabled={isSubmitting || !paymentId || !screenshotBase64}>
                                        {isSubmitting ? 'Verifying...' : `Submit Gift — ${(selectedToken?.price || 0).toLocaleString()} GYD`}
                                    </button>
                                </div>
                            </>
                        ) : submitSuccess ? (
                            <div className="success-state">
                                <div className="success-check">✓</div>
                                <h3 style={{ color: '#FFFFFF', fontSize: '24px', fontWeight: 900, margin: '0 0 12px 0', letterSpacing: '0.02em' }}>
                                    {successMode === 'earnings' ? 'Transfer Complete!' : 'Gift Sent!'}
                                </h3>
                                <p style={{ color: '#AAA', fontSize: '14px', margin: 0, lineHeight: '1.6' }}>
                                    {successMode === 'earnings' 
                                        ? <>Your <strong style={{color: '#FFD700'}}>{selectedToken?.name || 'Gift'}</strong> has been securely transferred to {targetActor.creatorName}.</>
                                        : "Your receipt has been submitted for verification. The gift will be delivered once approved."}
                                </p>
                            </div>
                        ) : null}
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
                                                    targetUserId: targetActor.id,
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

            {/* ====== PLAYBACK MODAL ====== */}
            {isPlaybackModalOpen && playbackUrl && (() => {
                const { embedUrl, isVertical } = extractVideoInfo(playbackUrl);
                return (
                    <div className="cs-video-overlay" onClick={() => { setIsPlaybackModalOpen(false); setPlaybackUrl(null); }}>
                        <div className={`cs-video-container ${isVertical ? 'vertical' : 'horizontal'}`} onClick={e => e.stopPropagation()}>
                            <div className="cs-video-header">
                                <div>
                                    <div className="cs-video-branding">
                                        <span style={{ color: '#A855F7' }}>●</span> CenterStage Arena
                                    </div>
                                    <p className="cs-video-title">{playbackTitle}</p>
                                </div>
                                <button className="cs-video-close" onClick={() => { setIsPlaybackModalOpen(false); setPlaybackUrl(null); }}>✕</button>
                            </div>
                            <div className="cs-video-body">
                                <div className={`cs-video-frame-container ${isVertical ? 'vertical' : 'horizontal'}`}>
                                    {embedUrl ? (
                                        <iframe 
                                            className="cs-video-iframe"
                                            src={embedUrl} 
                                            title={playbackTitle}
                                            allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                                            allowFullScreen
                                        />
                                    ) : (
                                        <p style={{ color: '#888' }}>Invalid Video Source</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

export default CenterStageScreen;