// src/components/VideoPlayerModal.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, functions, httpsCallable, doc, onSnapshot, getDoc, setDoc } from '../firebase';
import { collection, query, orderBy } from 'firebase/firestore';
import LikeButton from './LikeButton.jsx';
import RoleBadge from './RoleBadge.jsx';

// --- THE NVA TOKEN CATALOG ---
const GIFT_TOKENS = [
    { id: 'spotlight', name: 'Warm Spotlight', price: 500, actorReceives: 425, platformFee: 75, icon: '🔦' },
    { id: 'popcorn', name: 'Golden Popcorn', price: 1000, actorReceives: 850, platformFee: 150, icon: '🍿' },
    { id: 'flare', name: 'Rainbow Flare', price: 2500, actorReceives: 2125, platformFee: 375, icon: '🌈' },
    { id: 'chair', name: "Director's Chair", price: 5000, actorReceives: 4250, platformFee: 750, icon: '🎬' },
    { id: 'producer', name: 'The Executive Producer', price: 10000, actorReceives: 8500, platformFee: 1500, icon: '💎' },
];

const MMG_NUMBER = "592-672-3204";

// Generate vibrant, unique colors for user tags
const generateColorFromId = (id) => {
    if (!id) return '#FFFFFF';
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = '#';
    for (let i = 0; i < 3; i++) {
        let value = (hash >> (i * 8)) & 0xFF;
        value = Math.floor(128 + (value % 128)); 
        color += ('00' + value.toString(16)).substr(-2);
    }
    return color;
};

const appId = 'production-app-id';

const extractVideoInfo = (url) => {
    if (!url || typeof url !== 'string') return { embedUrl: null, isVertical: false, platform: 'unknown' };

    // --- NEW FACEBOOK LOGIC ---
    if (url.includes('facebook.com') || url.includes('fb.watch')) {
        const encodedFbUrl = encodeURIComponent(url);
        // Returns the special player URL that Facebook requires for embedding.
        return { embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodedFbUrl}&show_text=false&autoplay=true&mute=1`, isVertical: false, platform: 'facebook' };
    }
    // --- END NEW LOGIC ---

    const ytShortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (ytShortsMatch) {
        return { embedUrl: `https://www.youtube.com/embed/${ytShortsMatch[1]}`, isVertical: true, platform: 'youtube' };
    }
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/);
    if (ytMatch) {
        return { embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}`, isVertical: false, platform: 'youtube' };
    }
    const tiktokMatch = url.match(/tiktok\.com\/.*\/video\/(\d+)/);
    if (tiktokMatch) {
        return { embedUrl: `https://www.tiktok.com/embed/v2/${tiktokMatch[1]}`, isVertical: true, platform: 'tiktok' };
    }
    return { embedUrl: url, isVertical: false, platform: 'unknown' };
};

const VideoPlayerModal = ({ videoUrl, onClose, contentItem, currentUser, viewerProfile, showMessage, openCommentsProp }) => {
    const [liveContentItem, setLiveContentItem] = useState(contentItem);
    const [showEarningsConfirm, setShowEarningsConfirm] = useState(false);
    const [creatorProfile, setCreatorProfile] = useState(null);
    const [descriptionExpanded, setDescriptionExpanded] = useState(false);
    const viewCountedRef = useRef(false);
    const itemType = useMemo(() => liveContentItem?.eventTitle ? 'event' : 'content', [liveContentItem]);
    const { embedUrl, isVertical, platform } = useMemo(() => extractVideoInfo(videoUrl), [videoUrl]);

    // Embedded Comments Engine State
    const [comments, setComments] = useState([]);
    const [newCommentText, setNewCommentText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const commentsEndRef = useRef(null);

    // --- GIFT MODAL STATE ---
    const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
    const [giftTokens, setGiftTokens] = useState(GIFT_TOKENS);
    const [selectedToken, setSelectedToken] = useState(GIFT_TOKENS[0]);
    const [isAnonymous, setIsAnonymous] = useState(false);

    // Dynamic database subscription
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
    const [paymentId, setPaymentId] = useState('');
    const [screenshotBase64, setScreenshotBase64] = useState(null);
    const [isSubmittingGift, setIsSubmittingGift] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [successMode, setSuccessMode] = useState('earnings');

    const submitGiftPledge = async () => {
        if (!paymentId || !screenshotBase64) {
            showMessage("Please provide Payment ID and Receipt Screenshot.");
            return;
        }
        setIsSubmittingGift(true);
        try {
            const pledgeRef = doc(collection(db, "paymentPledges"));
            await setDoc(pledgeRef, {
                pledgeId: paymentId,
                internalId: pledgeRef.id,
                userId: currentUser.uid,
                userName: viewerProfile?.creatorName || currentUser.email,
                paymentType: 'giftToken',
                amount: selectedToken?.price || 0,
                status: 'pending',
                targetUserId: liveContentItem.creatorId, // Content owner UID
                targetActorName: creatorProfile?.creatorName || liveContentItem.creatorName || '',
                targetEventTitle: `[Showcase Video] ${liveContentItem.title}`, // Marks it clearly for the Admin!
                giftName: selectedToken?.name || 'Gift',
                isAnonymous: isAnonymous,
                screenshotUrl: screenshotBase64,
                createdAt: new Date().toISOString()
            });
            setPaymentId('');
            setScreenshotBase64(null);
            setSuccessMode('mmg');
            setSubmitSuccess(true);
            showMessage(`Pledge Received! Once verified, your gift will be delivered.`);
            setTimeout(() => {
                setSubmitSuccess(false);
                setIsGiftModalOpen(false);
            }, 4000);
        } catch (error) {
            console.error("Gift error:", error);
            showMessage("Failed to process gift.");
        } finally {
            setIsSubmittingGift(false);
        }
    };

    // Resolve exact database comment path based on VOD/Event Type
    const collectionPath = useMemo(() => {
        if (!liveContentItem?.id) return null;
        return itemType === 'event'
            ? `events/${liveContentItem.id}/comments`
            : `artifacts/production-app-id/public/data/content_items/${liveContentItem.id}/comments`;
    }, [liveContentItem, itemType]);

    // Real-time listener for upward-scrolling comment stream
    useEffect(() => {
        if (!collectionPath || !currentUser) return;
        const commentsRef = collection(db, collectionPath);
        const q = query(commentsRef, orderBy('createdAt', 'asc')); // Ascending pushes new comments upwards

        const unsubscribe = onSnapshot(q, (snapshot) => {
            setComments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
        return () => unsubscribe();
    }, [collectionPath, currentUser]);

    // Keep comments box scrolled to the bottom (newest comments flow up)
    useEffect(() => {
        commentsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [comments]);

    const handleSubmitComment = async () => {
        if (!newCommentText.trim()) return;
        setIsSubmitting(true);
        try {
            const postCommentFunction = httpsCallable(functions, 'postComment');
            await postCommentFunction({
                itemId: liveContentItem.id,
                itemType: itemType,
                text: newCommentText.trim(),
                replyTo: null
            });
            setNewCommentText('');
        } catch (error) {
            console.error(error);
            showMessage("Failed to submit comment.");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleShareVideo = async (e) => {
        e.stopPropagation();
        const shareUrl = `${window.location.origin}/content/${liveContentItem?.id}`;
        const text = `Check out "${liveContentItem?.title || 'this video'}" on NVA Network!`;
        
        if (navigator.share) {
            try { await navigator.share({ title: liveContentItem?.title || 'NVA Content', text: text, url: shareUrl }); }
            catch (err) { if (err.name !== 'AbortError') console.error("Sharing failed:", err); }
        } else {
            navigator.clipboard.writeText(`${text} ${shareUrl}`).then(() => {
                showMessage("Link copied to clipboard!");
            }).catch(() => showMessage("Failed to copy link."));
        }
    };


    useEffect(() => {
        if (!contentItem?.id) return;
        const itemId = contentItem.originalContentId || contentItem.id;
        const currentAppId = appId; 
        const docPath = contentItem?.eventTitle ? `events/${itemId}` : `artifacts/${currentAppId}/public/data/content_items/${itemId}`;
        const unsubContent = onSnapshot(doc(db, docPath), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setLiveContentItem({ id: docSnap.id, ...data });
                if (data.creatorId) {
                    getDoc(doc(db, "creators", data.creatorId)).then(creatorSnap => {
                        if (creatorSnap.exists()) setCreatorProfile({ id: creatorSnap.id, ...creatorSnap.data() });
                    });
                }
            }
        });
        return () => unsubContent();
    }, [contentItem?.id, contentItem?.originalContentId, contentItem?.eventTitle]);

    useEffect(() => {
        if (!liveContentItem || !liveContentItem.id || !currentUser || viewCountedRef.current || currentUser.uid === liveContentItem.creatorId) return;
        const timer = setTimeout(async () => {
            viewCountedRef.current = true;
            try {
                const incrementViewFunction = httpsCallable(functions, 'incrementViewCount');
                await incrementViewFunction({ itemId: liveContentItem.id, itemType });
            } catch (err) {
                console.error("View increment failed", err);
            }
        }, 10000);
        return () => clearTimeout(timer);
    }, [liveContentItem, currentUser, itemType]);

    useEffect(() => {
        if (openCommentsProp && liveContentItem?.id) {
            const timer = setTimeout(() => {
                window.dispatchEvent(new CustomEvent('openCommentsModal', { detail: { item: liveContentItem, itemType: itemType } }));
            }, 500); 
            return () => clearTimeout(timer);
        }
    }, [openCommentsProp, liveContentItem, itemType]);

    // SURGICAL FIX: Safe navigation bridge to prevent race conditions with history stack popping
    const executeSafeNavigation = (eventName, eventDetail) => {
        let popStateResolved = false;
        const resolveNavigation = () => {
            if (popStateResolved) return;
            popStateResolved = true;
            window.removeEventListener('popstate', resolveNavigation);
            
            setTimeout(() => {
                window.dispatchEvent(new CustomEvent(eventName, { detail: eventDetail }));
            }, 20); 
        };
        
        window.addEventListener('popstate', resolveNavigation);
        onClose(); 
        setTimeout(resolveNavigation, 300);
    };

    if (!videoUrl) return null;

    const displayViewCount = itemType === 'event' ? liveContentItem?.totalViewCount : liveContentItem?.viewCount;

    // NVA TICKETING SYSTEM: Local Client Check (0 Database Reads)
    const isAdminOrCreator = viewerProfile?.role === 'admin' || viewerProfile?.role === 'authority' || currentUser?.uid === liveContentItem?.creatorId;
    const hasTicket = !!viewerProfile?.purchasedTickets?.[liveContentItem?.id];
    const isLocked = itemType === 'event' && liveContentItem?.isTicketed && !hasTicket && !isAdminOrCreator;
    const now = new Date();
    const eventTime = liveContentItem?.scheduledStartTime?.toDate ? liveContentItem.scheduledStartTime.toDate() : new Date();
    const isLive = eventTime <= now;

    const memoizedPlayer = useMemo(() => {
        if (isLocked) {
            return (
                <div className="w-full h-full flex flex-col items-center justify-center bg-[#0A0A0A] p-6 text-center shadow-inner relative" style={{ aspectRatio: '16 / 9', backgroundImage: `linear-gradient(rgba(10,10,10,0.85), rgba(10,10,10,0.98)), url(${liveContentItem?.thumbnailUrl || 'https://placehold.co/1280x720/111/333?text=NVA+Box+Office'})`, backgroundSize: 'cover', backgroundPosition: 'center', border: '1px solid #FFD700', borderRadius: '8px' }}>
                    <span className="text-6xl mb-4" style={{ filter: 'drop-shadow(0 0 10px rgba(255,215,0,0.5))' }}>🎟️</span>
                    <h3 style={{ color: '#FFD700', fontSize: '24px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 10px 0' }}>Box Office Ticket Required</h3>
                    <p className="text-white text-sm md:text-base mb-6 max-w-md font-bold">
                        {isLive ? '🔴 This premiere event is currently LIVE.' : `⏳ Premieres ${eventTime.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`} <br/>
                        Secure your pledge ticket to unlock playback.
                    </p>
                    <button 
                        className="gift-btn-pink-glow" 
                        style={{ height: '48px', padding: '0 24px', fontSize: '16px', background: 'rgba(255, 215, 0, 0.1)', color: '#FFD700', borderColor: '#FFD700', boxShadow: '0 0 15px rgba(255,215,0,0.2)' }}
                        onClick={(e) => {
                            e.stopPropagation();
                            window.dispatchEvent(new CustomEvent('openSubscriptionModal', { detail: liveContentItem }));
                        }}
                    >
                        <span>PURCHASE TICKET (${liveContentItem?.ticketPrice || 0} USD)</span>
                    </button>
                </div>
            );
        }

        return (
            <iframe
                src={embedUrl}
                className="w-full h-full border-none"
                style={{
                    width: '100%',
                    height: '100%',
                    border: 'none'
                }}
                allow="autoplay; encrypted-media; picture-in-picture;"
                allowFullScreen
                title="Embedded Video Content"
            />
        );
    }, [embedUrl, isVertical, isLocked, liveContentItem?.thumbnailUrl, liveContentItem?.ticketPrice, liveContentItem?.id, isLive]);

    return (
        <div className="videoModalOverlay flex justify-center items-center" style={{ backdropFilter: 'blur(10px)', backgroundColor: 'rgba(0,0,0,0.8)' }}>
            <style>{`
                .premium-glass-info { background: linear-gradient(to bottom, rgba(15,15,15,0.7), rgba(5,5,5,0.95)); backdrop-filter: blur(25px); border-top: 1px solid rgba(255,255,255,0.08); border-bottom-left-radius: 16px; border-bottom-right-radius: 16px; box-shadow: inset 0 1px 1px rgba(255,255,255,0.05); }
                
                /* Clean Gifting Button with NO GLOW and WHITE TEXT */
                .gift-btn-clean {
                    background: rgba(255, 255, 255, 0.05) !important;
                    color: #FFFFFF !important;
                    font-weight: 900; text-transform: uppercase; letter-spacing: 0.1em;
                    border: 1px solid rgba(255, 255, 255, 0.2) !important; border-radius: 8px; padding: 0 14px; height: 36px;
                    display: flex; align-items: center; gap: 8px; cursor: pointer;
                    transition: all 0.25s ease-in-out;
                }
                .gift-btn-clean:hover {
                    background: rgba(255, 255, 255, 0.1) !important;
                    transform: translateY(-1px);
                }

                /* ====== THE MODAL OVERLAY PORTAL ====== */
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

        .anon-toggle { display: flex; align-items: center; gap: 10px; margin: 16px 0; cursor: pointer; padding: 12px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px solid transparent; transition: border 0.2; }
.anon-toggle:hover { border: 1px solid rgba(255,255,255,0.1); }
.anon-toggle span { font-size: 12px; color: #AAA; font-weight: 600; }

/* Sleek Submit Button */
.submit-btn { width: 100%; padding: 16px; background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); color: #000; border: none; border-radius: 14px; font-size: 14px; font-weight: 900; cursor: pointer; transition: all 0.2s; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 8px; box-shadow: 0 10px 20px rgba(255,215,0,0.2); }
.submit-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 25px rgba(255,215,0,0.3); }
.submit-btn.cancel-btn { background: #1A1A1A; color: #FFF; border: 1px solid #333; box-shadow: none; }
.submit-btn.cancel-btn:hover { background: #222; border-color: #444; }
.success-state { text-align: center; padding: 30px 20px; }
.success-check { width: 64px; height: 64px; background: rgba(74, 222, 128, 0.1); border: 2px solid #4ADE80; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 28px; color: #4ADE80; box-shadow: 0 0 30px rgba(74,222,128,0.2); }
            `}</style>
            <div className={`w-full h-full md:max-w-[1150px] md:max-h-[98vh] md:rounded-2xl overflow-hidden relative flex flex-col shadow-2xl`} style={{ border: '1px solid rgba(255,255,255,0.1)' }}>
                <button type="button" className="closeButton" onClick={(e) => { e.stopPropagation(); onClose(); }}>×</button>
                
                {/* This container grows to fill parent, centers content, and provides the black background for letterboxing */}
                <div className="flex-1 min-h-[200px] flex justify-center items-center bg-black p-1 overflow-hidden">
                
                    {/* 
                      Aspect-Ratio Lock: Scaling to fill vertical space.
                      The video will now push "left and right" more to maintain 16:9 while filling the new vertical height.
                    */}
                    <div 
                        className="flex items-center justify-center relative"
                        style={{
                            width: 'auto',
                            height: '100%',
                            aspectRatio: isVertical && !isLocked ? '9 / 16' : '16 / 9',
                            maxWidth: '100%',
                            maxHeight: '100%'
                        }}
                    >
                        {memoizedPlayer}
                    </div>

                </div>
                
                {/* UI FIX: Parent container has NO padding to ensure scrollbar stays at the absolute edge */}
                <div className="premium-glass-info w-full flex-shrink-0 md:max-h-[48vh] flex flex-col" style={{ minHeight: '320px', overflow: 'hidden', padding: 0 }}>
                    
                    {/* 1. SNAPPED HEADER: Title & Share (Padded locally, No cutoff possible) */}
                    <div className="flex justify-between items-start gap-4 flex-shrink-0" style={{ padding: '16px 16px 12px 16px' }}>
                        <h2 className="m-0 text-lg text-white font-bold leading-tight flex-1" style={{ letterSpacing: '0.015em' }}>
                            {liveContentItem?.title}
                        </h2>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <button
                                type="button"
                                onClick={handleShareVideo}
                                className="bg-[#2A2A2A] border border-solid border-white/10 hover:border-white/20 rounded-full w-9 h-9 flex items-center justify-center cursor-pointer text-white transition-colors"
                                title="Share Video"
                            >
                                <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
                            </button>
                            <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('openReportModal', { detail: liveContentItem })); }}
                                className="bg-[#2A2A2A] border border-solid border-white/10 hover:border-white/20 rounded-full w-9 h-9 flex items-center justify-center cursor-pointer text-white transition-colors"
                                title="More options"
                            >
                                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>
                            </button>
                        </div>
                    </div>

                    {/* 2. SCROLLABLE AREA: Creator Info, Description, and Comments Area */}
                    <div className="overflow-y-auto flex-1" style={{ padding: '0 16px 16px 16px', overflowX: 'hidden' }}>
                        
                        {/* Creator Info & Action Row */}
                        <div className="flex justify-between items-center mb-4 gap-4">
                            <div 
                                className="flex items-center gap-2.5 cursor-pointer min-w-0"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    executeSafeNavigation('navigateToUserProfile', { userId: liveContentItem.creatorId });
                                }}
                            >
                                <img 
                                    src={creatorProfile?.profilePictureUrl || liveContentItem?.creatorProfilePictureUrl || contentItem?.creatorProfilePictureUrl || 'https://placehold.co/40x40/555/FFF?text=P'} 
                                    alt="Uploader Avatar" 
                                    className="w-10 h-10 rounded-full object-cover border border-solid border-white/10"
                                />
                                <div className="min-w-0">
                                    <div className="m-0 text-sm text-white font-bold flex items-center flex-wrap gap-y-1">
                                        <span className="whitespace-nowrap overflow-hidden text-ellipsis mr-1.5" style={{ fontSize: '15px' }}>
                                            {creatorProfile?.creatorName || liveContentItem?.creatorName || contentItem?.creatorName || 'NVA Artist'}
                                        </span>
                                        <RoleBadge profile={creatorProfile || { isFilmClub: liveContentItem?.isFilmClub, isContestant: liveContentItem?.isContestant }} />
                                    </div>
                                </div>
                            </div>

                            {currentUser && liveContentItem?.id && !liveContentItem.isPromotion && (
                                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                                    {liveContentItem.monetizationStatus === 'approved' && (
                                        <button 
                                            type="button"
                                            className="gift-btn-clean"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setIsGiftModalOpen(true);
                                            }}
                                        >
                                            <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'none', stroke: '#FFF', strokeWidth: '2.5', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                                                <polyline points="20 12 20 22 4 22 4 12"></polyline>
                                                <rect x="2" y="7" width="20" height="5"></rect>
                                                <line x1="12" y1="22" x2="12" y2="7"></line>
                                                <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path>
                                                <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path>
                                            </svg>
                                            <span>GIFT</span>
                                        </button>
                                    )}
                                    <LikeButton contentItem={liveContentItem} currentUser={currentUser} showMessage={showMessage} itemType={itemType} />
                                    <div className="bg-[#111] border border-solid border-white/10 rounded-full flex items-center text-white gap-1.5 px-3 h-9">
                                        <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z"></path></svg>
                                        <span>{(liveContentItem?.commentCount || comments.length).toLocaleString()}</span>
                                    </div>
                                </div>
                            )}
                        </div>

                    {liveContentItem?.description && (
                        <div 
                            className="bg-[#2A2A2A] p-3 rounded-xl cursor-pointer"
                            onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                        >
                            {!liveContentItem.isPromotion && (
                                <p className="m-0 mb-2 text-sm text-white font-bold">
                                    {(displayViewCount || 0).toLocaleString()} Views
                                </p>
                            )}
                            <p className={`m-0 text-sm text-[#DDDDDD] leading-normal whitespace-pre-wrap ${!descriptionExpanded && 'line-clamp-2'}`}>
                                {liveContentItem.description}
                            </p>
                            {(liveContentItem.description.length > 100) && (
                                <span className="text-[#AAAAAA] text-xs font-bold mt-1 inline-block">
                                    {descriptionExpanded ? 'Show less' : '...more'}
                                </span>
                            )}
                        </div>
                    )}

                    {/* SCROLLABLE COMMENTS AREA */}
                    <div style={{ marginTop: '15px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '15px' }}>
                        <p style={{ margin: '0 0 10px 0', fontSize: '12px', fontWeight: '900', color: '#FFD700', textTransform: 'uppercase', letterSpacing: '1px' }}>Audience Thoughts</p>
                        <div style={{ minHeight: '100px', background: '#0F0F0F', borderRadius: '8px', padding: '12px', border: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {comments.length > 0 ? comments.map(comment => (
                                <div key={comment.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', fontSize: '13px', lineHeight: '1.4' }}>
                                    <span style={{ fontWeight: 'bold', color: generateColorFromId(comment.userId), flexShrink: 0, cursor: 'pointer' }} onClick={() => executeSafeNavigation('navigateToUserProfile', { userId: comment.userId })}>{comment.userName}:</span>
                                    <span style={{ color: '#E0E0E0' }}>{comment.text}</span>
                                </div>
                            )) : (
                                <p style={{ color: '#666', fontSize: '12px', margin: 'auto 0', textAlign: 'center' }}>No comments yet. Share your thoughts below!</p>
                            )}
                            <div ref={commentsEndRef} />
                        </div>
                    </div>
                </div>

                {/* FIXED FOOTER: The Input section stays pinned to the bottom */}
                {currentUser && (
                    <div style={{ marginTop: 'auto', paddingTop: '15px', borderTop: '1px solid rgba(255,255,255,0.08)', background: 'transparent' }}>
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '8px', flexWrap: 'wrap' }}>
                            {['👍', '👎', '❤️', '😂', '🔥', '😢', '😡'].map(emoji => (
                                <button
                                    key={emoji}
                                    type="button"
                                    onClick={() => setNewCommentText(prev => prev + emoji)}
                                    style={{ background: 'transparent', border: 'none', fontSize: '18px', cursor: 'pointer', padding: '2px 6px', display: 'inline-block', transition: 'transform 0.1s' }}
                                    onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.2)'}
                                    onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                                >
                                    {emoji}
                                </button>
                            ))}
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <input 
                                id="commentsInput"
                                type="text" 
                                placeholder="Add to the conversation..." 
                                style={{ flex: 1, background: '#1F1F1F', border: '1px solid rgba(255,255,255,0.1)', color: '#FFF', borderRadius: '6px', padding: '10px 14px', fontSize: '14px', outline: 'none' }}
                                value={newCommentText}
                                onChange={(e) => setNewCommentText(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSubmitComment();
                                    }
                                }}
                            />
                            <button 
                                className="button" 
                                style={{ margin: 0, padding: '0 18px', height: '40px', background: '#FFD700', color: '#000', fontWeight: 'bold', borderRadius: '6px', border: 'none', cursor: 'pointer' }}
                                onClick={handleSubmitComment}
                                disabled={isSubmitting || !newCommentText.trim()}
                            >
                                {isSubmitting ? '...' : 'Send'}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
            
            {/* ====== THE INTERACTIVE OVERLAY MMG GIFT MODAL ====== */}
            {isGiftModalOpen && (
                <div className="gift-modal-overlay" style={{ zIndex: 1100 }} onClick={() => !isSubmittingGift && setIsGiftModalOpen(false)}>
                    <div className="gift-modal" onClick={e => e.stopPropagation()}>
                        {!submitSuccess ? (
                            <>
                                <div className="modal-header">
                                    <div>
                                        <p style={{ color: '#00FFFF', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', margin: '0 0 6px 0' }}>Secure Token Transfer</p>
                                        {/* Use either targetActor.creatorName or creatorProfile.creatorName depending on the file */}
                                        <h2 style={{ color: '#FFFFFF', fontSize: '24px', fontWeight: 800, margin: 0 }}>Support the Creator</h2>
                                    </div>
                                    <button className="modal-close" onClick={() => setIsGiftModalOpen(false)}>✕</button>
                                </div>

                                <p style={{ color: '#888', fontSize: '13px', margin: '0 0 24px 0', lineHeight: '1.5' }}>
                                    Select a token package below. Your gifts directly support creators and influence platform leaderboards.
                                </p>

                                <div style={{ maxHeight: '240px', overflowY: 'auto', marginBottom: '16px', paddingRight: '4px' }}>
                                    {giftTokens.map(token => {
                                        const platformFee = token.price * 0.15;
                                        const actorReceives = token.price * 0.85;
                                        return (
                                            <div key={token.id} className={`token-card ${selectedToken.id === token.id ? 'selected' : ''}`} onClick={() => setSelectedToken(token)}>
                                                <div className="token-icon">{token.icon}</div>
                                                <div className="token-info">
                                                    <p className="token-name">{token.name}</p>
                                                    <p className="token-breakdown">Creator: {actorReceives.toLocaleString()} GYD &nbsp;•&nbsp; Fee: {platformFee.toLocaleString()} GYD (15%)</p>
                                                </div>
                                                <span className="token-price">{token.price.toLocaleString()}</span>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Selected Breakdown */}
                                <div className="breakdown-detail">
                                    <div className="breakdown-row border">
                                        <span className="breakdown-label">Package Value</span>
                                        <span className="breakdown-value">{(selectedToken?.price || 0).toLocaleString()} GYD</span>
                                    </div>
                                    <div className="breakdown-row">
                                        <span className="breakdown-label">Platform Fee (15%)</span>
                                        <span className="breakdown-value negative">-{((selectedToken?.price || 0) * 0.15).toLocaleString()} GYD</span>
                                    </div>
                                    <div className="breakdown-row" style={{ marginTop: '8px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                        <span className="breakdown-label" style={{ color: '#4ADE80' }}>Creator Receives</span>
                                        <span className="breakdown-value positive">{((selectedToken?.price || 0) * 0.85).toLocaleString()} GYD ✓</span>
                                    </div>
                                </div>

                                {/* THE NEW GLASSMORPHIC EARNINGS GIFT BUTTON */}
                                <div style={{ marginBottom: '15px' }}>
                                    <button 
                                        type="button"
                                        className="earnings-btn" 
                                        disabled={isSubmittingGift || (viewerProfile?.totalEarnings || 0) < (selectedToken?.price || 0)}
                                        onClick={() => setShowEarningsConfirm(true)}
                                    >
                                        Send with Earnings — {(selectedToken?.price || 0).toLocaleString()} GYD
                                    </button>
                                </div>

                                {/* Anonymous Toggle */}
                                <label className="anon-toggle">
                                    <input type="checkbox" checked={isAnonymous} onChange={e => setIsAnonymous(e.target.checked)} style={{ accentColor: '#00FFFF', width: '16px', height: '16px' }} />
                                    <span>Gift anonymously (Hide my identity from public toasts)</span>
                                </label>

                                {/* MMG Instructions */}
                                <div className="mmg-instructions">
                                    <p><strong>📱 MMG Payment Instructions:</strong></p>
                                    <p>1. Send <strong>{(selectedToken?.price || 0).toLocaleString()} GYD</strong> to <strong>{MMG_NUMBER}</strong>.</p>
                                    <p>2. Copy the Transaction ID from your receipt.</p>
                                    <p>3. Paste the ID and upload your receipt screenshot below.</p>
                                </div>

                                <div style={{ marginBottom: '16px' }}>
                                    <label style={{ fontSize: '11px', color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>MMG Transaction ID</label>
                                    <input type="text" value={paymentId} onChange={e => setPaymentId(e.target.value)} placeholder="e.g. TXN12345678" 
                                        style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFF', padding: '14px 16px', borderRadius: '12px', fontSize: '14px', outline: 'none', transition: 'all 0.2s', fontFamily: 'monospace' }}
                                        onFocus={e => { e.target.style.borderColor = '#00FFFF'; e.target.style.background = 'rgba(0,255,255,0.02)'; }}
                                        onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.background = 'rgba(255,255,255,0.03)'; }} />
                                </div>

                                <div style={{ marginBottom: '24px' }}>
                                    <label style={{ fontSize: '11px', color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>Receipt Screenshot</label>
                                    <input type="file" accept="image/*" onChange={e => {
                                        const file = e.target.files[0];
                                        if (file) {
                                            const reader = new FileReader();
                                            reader.onloadend = () => setScreenshotBase64(reader.result);
                                            reader.readAsDataURL(file);
                                        }
                                    }} style={{ fontSize: '13px', color: '#888', width: '100%', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.15)' }} />
                                </div>

                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button className="submit-btn cancel-btn" style={{ flex: 1 }} onClick={() => setIsGiftModalOpen(false)} disabled={isSubmittingGift}>Cancel</button>
                                    <button className="submit-btn" style={{ flex: 2 }} onClick={submitGiftPledge} disabled={isSubmittingGift || !paymentId || !screenshotBase64}>
                                        {isSubmittingGift ? 'Verifying...' : `Transfer ${(selectedToken?.price || 0).toLocaleString()} GYD`}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="success-state">
                                <div className="success-check">✓</div>
                                <h3 style={{ color: '#FFFFFF', fontSize: '24px', fontWeight: 900, margin: '0 0 12px 0', letterSpacing: '0.02em' }}>
                                    {successMode === 'earnings' ? 'Transfer Complete!' : 'Gift Sent!'}
                                </h3>
                                <p style={{ color: '#AAA', fontSize: '14px', margin: 0, lineHeight: '1.6' }}>
                                    {successMode === 'earnings' 
                                        ? <>Your <strong style={{color: '#FFD700'}}>{selectedToken?.name || 'Gift'}</strong> has been securely transferred to the creator.</>
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
                                            setIsSubmittingGift(true);
                                            try {
                                                const giftFunc = httpsCallable(functions, 'sendGiftWithEarnings');
                                                await giftFunc({
                                                    targetUserId: liveContentItem.creatorId,
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
                                                setIsSubmittingGift(false);
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
        </div>
    );
};

export default VideoPlayerModal;