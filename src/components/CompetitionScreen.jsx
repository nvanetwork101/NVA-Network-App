import React, { useState, useEffect, useMemo } from 'react';
import { db, functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';
import { collection, query, where, orderBy, onSnapshot, limit, doc, setDoc } from "firebase/firestore";
import ShareButton from './ShareButton';

// --- Component Imports ---
import PrizesModal from './PrizesModal';
import CompetitionEntryForm from './CompetitionEntryForm.jsx';
import CompetitionLikeButton from './CompetitionLikeButton';
import CompetitionVideoViewer from './CompetitionVideoViewer';
import EnlargedPhotoViewer from './EnlargedPhotoViewer';

// --- THE NVA TOKEN CATALOG ---
const GIFT_TOKENS = [
    { id: 'spotlight', name: 'Warm Spotlight', price: 500, actorReceives: 425, platformFee: 75, icon: '🔦' },
    { id: 'popcorn', name: 'Golden Popcorn', price: 1000, actorReceives: 850, platformFee: 150, icon: '🍿' },
    { id: 'flare', name: 'Rainbow Flare', price: 2500, actorReceives: 2125, platformFee: 375, icon: '🌈' },
    { id: 'chair', name: "Director's Chair", price: 5000, actorReceives: 4250, platformFee: 750, icon: '🎬' },
    { id: 'producer', name: 'The Executive Producer', price: 10000, actorReceives: 8500, platformFee: 1500, icon: '💎' },
];

const MMG_NUMBER = "592-672-3204";

function CompetitionScreen({ showMessage, setActiveScreen, currentUser, creatorProfile }) {
    // --- STATE MANAGEMENT ---
    const [competition, setCompetition] = useState(null);
    const [showEarningsConfirm, setShowEarningsConfirm] = useState(false);
    const [loading, setLoading] = useState(true);
    const [entries, setEntries] = useState([]);
    const [loadingEntries, setLoadingEntries] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showPrizesModal, setShowPrizesModal] = useState(false);
    const [showEntryForm, setShowEntryForm] = useState(false);
    const [selectedEntry, setSelectedEntry] = useState(null);

    // --- GIFT MODAL STATE ---
    const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
    const [targetEntryForGift, setTargetEntryForGift] = useState(null);
    const [giftTokens, setGiftTokens] = useState(GIFT_TOKENS);
    const [selectedToken, setSelectedToken] = useState(GIFT_TOKENS[0]);

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
                targetUserId: targetEntryForGift.userId, // Creator UID
                targetActorName: targetEntryForGift.userName || '',
                targetEventTitle: `[Competition] ${competition.title}`, // Marks it clearly for the Admin!
                competitionId: competition.id, // Associated Competition
                entryId: targetEntryForGift.id, // Associated Entry ID
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
            setIsSubmitting(false);
        }
    };

    const handleShareWinner = async (e) => {
        e.stopPropagation();
        const baseUrl = window.location.origin;
        const shareUrl = `${baseUrl}/competition/${competition.id}`;
        const text = `🎉 ${rankedEntries[0].userName} won the "${competition.title}" tournament on NVA Network! Check out their winning showcase entry:`;
        
        if (navigator.share) {
            try {
                await navigator.share({
                    title: "NVA Tournament Winner",
                    text: text,
                    url: shareUrl
                });
            } catch (err) {
                if (err.name !== 'AbortError') console.error("Sharing failed:", err);
            }
        } else {
            navigator.clipboard.writeText(shareUrl).then(() => {
                showMessage("Winner link copied!");
            }).catch(() => showMessage("Failed to copy link."));
        }
    };

    // --- DATA FETCHING ---
    useEffect(() => {
        const compRef = collection(db, "competitions");
        const q = query(compRef, where("status", "in", ["Accepting Entries", "Live Voting", "Judging", "Results Visible"]), orderBy("createdAt", "desc"), limit(1));
        const unsubscribeComp = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                setCompetition({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
            } else {
                setCompetition(null);
            }
            setLoading(false);
        });
        return () => unsubscribeComp();
    }, []);

    useEffect(() => {
        if (!competition) {
            setEntries([]);
            setLoadingEntries(false);
            return;
        }
        setLoadingEntries(true);
        const entriesRef = collection(db, "competitions", competition.id, "entries");
        const q = query(entriesRef, orderBy("createdAt", "desc"));
        const unsubscribeEntries = onSnapshot(q, (snapshot) => {
            setEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoadingEntries(false);
        });
        return () => unsubscribeEntries();
    }, [competition]);

    // --- DERIVED STATE ---
    const rankedEntries = useMemo(() => {
        const calculateScore = (entry) => entry.likeCount || 0;
        return entries
            .filter(entry => {
                const isSearchMatch = (entry.title?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || (entry.userName?.toLowerCase() || '').includes(searchTerm.toLowerCase());
                if (!isSearchMatch) return false;

                const isPending = entry.status === 'pending';
                if (isPending) {
                    // Only show pending entries if they belong to the currently logged-in user!
                    return currentUser && entry.userId === currentUser.uid;
                }
                return true;
            })
            .sort((a, b) => calculateScore(b) - calculateScore(a));
    }, [entries, searchTerm, currentUser]);
    
    // --- HANDLERS ---
    const handleEnterCompetition = () => {
        if (!currentUser) {
            showMessage("Please log in to enter the competition.");
            setActiveScreen('Login');
            return;
        }
        setShowEntryForm(true);
    };

    const handleEntryClick = (entry) => {
        if (competition?.status === 'Accepting Entries') {
            showMessage("Voting has not yet begun. Please check back later!");
            return;
        }
        if (competition?.status === 'Results Visible') {
            showMessage("This competition has ended. Viewing entries is disabled.");
            return;
        }
        if (!currentUser) {
            showMessage("Please log in to view entry details.");
            setActiveScreen('Login');
            return;
        }
        setSelectedEntry(entry);
    };
    
    const handlePrizesClick = () => {
        if (!currentUser) {
            showMessage("Please log in to view prizes and rules.");
            setActiveScreen('Login');
            return;
        }
        setShowPrizesModal(true);
    };

    const handleFlyerClick = () => {
        const imageUrl = competition?.flyerImageUrl_highRes || competition?.flyerImageUrl;
        if (imageUrl) {
            window.dispatchEvent(new CustomEvent('openContentPlayer', {
                detail: {
                    imageUrl: imageUrl,
                    description: competition.title
                }
            }));
        }
    };

    const getEntryThumbnail = (entry) => {
        if (entry.photoUrl) return entry.photoUrl;
        if (entry.customThumbnailUrl) return entry.customThumbnailUrl;
        if (entry.submissionUrl && (entry.submissionUrl.includes('youtu.be') || entry.submissionUrl.includes('youtube.com'))) {
            const videoIdMatch = entry.submissionUrl.match(/(?:youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)([^#\&\?]{11})/);
            if (videoIdMatch && videoIdMatch[1]) {
                return `https://img.youtube.com/vi/${videoIdMatch[1]}/hqdefault.jpg`;
            }
        }
        return entry.userProfilePicture || 'https://placehold.co/80x80/2A2A2A/FFF?text=N/A';
    };

    if (loading) {
        return <div className="screenContainer" style={{textAlign: 'center', background: '#050505'}}><p className="heading" style={{ color: '#E6E6FA' }}>Loading Competition...</p></div>;
    }
    if (!competition) {
        return (
            <div className="screenContainer" style={{textAlign: 'center', paddingTop: '50px', background: '#050505'}}>
                <p className="heading" style={{ color: '#E6E6FA' }}>No Active Competition</p>
                <p className="subHeading" style={{ color: '#AAA' }}>There is no competition running at the moment. Please check back later!</p>
                <button className="button" onClick={() => setActiveScreen('Home')} style={{ backgroundColor: '#3A3A3A' }}><span className="buttonText light">Back to Home</span></button>
            </div>
        );
    }

    return (
        <div className="screenContainer" style={{ background: '#050505', paddingBottom: '100px', minHeight: '100vh' }}>
            <style>{`
                /* Premium Glassmorphism UI Theme [1] */
                .comp-header { background: rgba(5, 5, 5, 0.7); padding: 20px 10px; position: sticky; top: 0; z-index: 100; backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border-bottom: 1px solid rgba(138, 43, 226, 0.35); box-shadow: 0 4px 30px rgba(0, 0, 0, 0.5); }
                .comp-billboard { width: 100%; border-radius: 20px; border: 1px solid rgba(0, 255, 255, 0.25); overflow: hidden; box-shadow: 0 0 35px rgba(0, 255, 255, 0.15); margin-bottom: 25px; background: #000; position: relative; }
                .comp-notice { background: rgba(255, 215, 0, 0.03); border: 1px solid rgba(255, 215, 0, 0.25); border-radius: 12px; padding: 15px; margin-bottom: 25px; display: flex; gap: 12px; align-items: flex-start; backdrop-filter: blur(10px); }
                .comp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 20px; }
                .comp-card { background: rgba(25, 25, 25, 0.55); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); overflow: hidden; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); position: relative; }
                .comp-card:hover { border-color: #00FFFF; transform: translateY(-8px); box-shadow: 0 15px 30px rgba(0, 255, 255, 0.2); }
                .rank-tag { position: absolute; top: 12px; left: 12px; background: #00FFFF; color: #000; padding: 4px 12px; border-radius: 8px; font-weight: 900; font-size: 14px; z-index: 10; box-shadow: 0 4px 10px rgba(0,0,0,0.5); }
                .hero-btn { background: rgba(0, 255, 255, 0.12); color: #00FFFF; font-weight: 900; border: 1px solid #00FFFF; padding: 16px 20px; border-radius: 12px; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; transition: all 0.2s; backdrop-filter: blur(10px); }
                .hero-btn:hover { transform: scale(1.02); background: #00FFFF; color: #000; box-shadow: 0 0 20px rgba(0,255,255,0.3); }
                .hero-btn:disabled { background: #333; color: #666; cursor: not-allowed; box-shadow: none; }
                .search-container { position: relative; margin-bottom: 30px; }
                .search-input { width: 100%; padding: 14px 20px 14px 45px; background: rgba(255, 255, 255, 0.02); border: 1px solid rgba(255,255,255,0.08); border-radius: 14px; color: #FFF; outline: none; transition: border-color 0.2s; font-size: 15px; }
                .search-input:focus { border-color: #00FFFF; }

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

.anon-toggle { display: flex; align-items: center; gap: 10px; margin: 16px 0; cursor: pointer; padding: 12px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px solid transparent; transition: border 0.2s; }
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

            {/* CINEMATIC NAVIGATION */}
            <div className="comp-header">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '1100px', margin: '0 auto', gap: '15px' }}>
                    <button onClick={() => setActiveScreen('Home')} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFF', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifycontent: 'center', fontSize: '18px' }}>&#x2190;</button>
                    <h1 style={{ fontSize: '20px', margin: 0, textAlign: 'center', flex: 1, color: '#E6E6FA' }}>{competition.title}</h1>
                    <ShareButton title={competition.title} url={`/competition/${competition.id}`} showMessage={showMessage} />
                </div>
            </div>

            <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '20px 15px' }}>
                
                {/* THE BILLBOARD HERO (Flyer Panel - Only Visible Prior to Results Revelation) */}
                {competition.status !== 'Results Visible' && competition.flyerImageUrl && (
                    <div className="comp-billboard" style={{ marginBottom: '15px', border: '1px solid rgba(0, 255, 255, 0.2)' }}>
                        <img 
                            src={competition.flyerImageUrl_highRes || competition.flyerImageUrl} 
                            alt={competition.title}
                            onClick={handleFlyerClick}
                            style={{ width: '100%', maxHeight: '45vh', objectFit: 'contain', cursor: 'pointer', display: 'block' }}
                        />
                    </div>
                )}

                {/* THE REAL-TIME TOURNAMENT PRIZE POOL (With 60/25/15 Payout Splits) */}
                {competition.entryFee > 0 && competition.prizePool !== undefined && (
                    <div style={{ background: 'linear-gradient(135deg, rgba(0, 255, 255, 0.12) 0%, rgba(0,0,0,0.95) 100%)', border: '1px solid #00FFFF', borderRadius: '16px', padding: '20px', marginBottom: '25px', boxShadow: '0 0 25px rgba(0,255,255,0.12)', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <p style={{ margin: 0, color: '#00FFFF', fontSize: '11px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '2px' }}>🔥 Tournament Prize Pool</p>
                                <p style={{ margin: '4px 0 0 0', color: '#FFF', fontSize: '13px', opacity: 0.8 }}>Dynamic split based on active entries!</p>
                            </div>
                            <p style={{ margin: 0, color: '#00FFFF', fontSize: '32px', fontWeight: '900', textShadow: '0 0 10px rgba(0,255,255,0.4)', fontFamily: 'monospace' }}>
                                {competition.prizePool.toLocaleString()} GYD
                            </p>
                        </div>
                        
                        {/* 3-WAY REWARDS BREAKDOWN PILLS */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', borderTop: '1px solid rgba(0, 255, 255, 0.15)', paddingTop: '12px', textAlign: 'center', fontSize: '11px' }}>
                            <div style={{ background: 'rgba(255, 215, 0, 0.04)', border: '1px solid rgba(255, 215, 0, 0.2)', padding: '8px', borderRadius: '8px' }}>
                                <span style={{ display: 'block', color: '#FFD700', fontWeight: 'bold', marginBottom: '2px', textTransform: 'uppercase', fontSize: '9px', letterSpacing: '0.5px' }}>🥇 1st (60%)</span>
                                <span style={{ color: '#FFF', fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace' }}>{Math.round(competition.prizePool * 0.60).toLocaleString()}</span>
                            </div>
                            <div style={{ background: 'rgba(192, 192, 192, 0.04)', border: '1px solid rgba(192, 192, 192, 0.2)', padding: '8px', borderRadius: '8px' }}>
                                <span style={{ display: 'block', color: '#C0C0C0', fontWeight: 'bold', marginBottom: '2px', textTransform: 'uppercase', fontSize: '9px', letterSpacing: '0.5px' }}>🥈 2nd (25%)</span>
                                <span style={{ color: '#FFF', fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace' }}>{Math.round(competition.prizePool * 0.25).toLocaleString()}</span>
                            </div>
                            <div style={{ background: 'rgba(205, 127, 50, 0.04)', border: '1px solid rgba(205, 127, 50, 0.2)', padding: '8px', borderRadius: '8px' }}>
                                <span style={{ display: 'block', color: '#CD7F32', fontWeight: 'bold', marginBottom: '2px', textTransform: 'uppercase', fontSize: '9px', letterSpacing: '0.5px' }}>🥉 3rd (15%)</span>
                                <span style={{ color: '#FFF', fontSize: '13px', fontWeight: 'bold', fontFamily: 'monospace' }}>{Math.round(competition.prizePool * 0.15).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                )}

                {/* THE BULLETIN (Notice) */}
                {competition.noticeText && (
                    <div className="comp-notice">
                        <span style={{ fontSize: '24px' }}>📢</span>
                        <div>
                            <p style={{ color: '#FFD700', fontSize: '12px', fontWeight: '900', margin: '0 0 5px 0', textTransform: 'uppercase', letterSpacing: '1px' }}>Official Announcement</p>
                            <p style={{ color: '#EEE', fontSize: '14px', margin: 0, lineHeight: '1.5' }}>{competition.noticeText}</p>
                        </div>
                    </div>
                )}

                {/* MAIN ACTIONS */}
                <div style={{ display: 'flex', gap: '15px', marginBottom: '40px', flexWrap: 'wrap' }}>
                    {competition.status === 'Accepting Entries' && (
                        <button className="hero-btn" style={{ flex: 2 }} onClick={handleEnterCompetition}>Enter Competition</button>
                    )}
                    {competition.status === 'Live Voting' && (
                        <div className="hero-btn" style={{ flex: 2, background: 'rgba(0, 255, 255, 0.1)', color: '#00FFFF', border: '2px solid #00FFFF', textAlign: 'center', cursor: 'default', boxShadow: 'none' }}>Voting is Currently Live</div>
                    )}
                    {(competition.status === 'Judging' || competition.status === 'Results Visible') && (
                        <div className="hero-btn" style={{ flex: 2, background: 'rgba(255, 215, 0, 0.1)', color: '#FFD700', border: '2px solid #FFD700', textAlign: 'center', cursor: 'default', boxShadow: 'none' }}>
                            {competition.status === 'Judging' ? 'Reviewing Performance...' : 'Tournament Concluded'}
                        </div>
                    )}
                    <button className="hero-btn" style={{ flex: 1, background: '#222', color: '#FFF', boxShadow: 'none', border: '1px solid #444' }} onClick={handlePrizesClick}>Prizes & Rules</button>
                </div>

                {/* SEARCH BAR */}
                <div className="search-container">
                    <input 
                        type="text" 
                        className="search-input" 
                        placeholder="Search for contenders or entries..." 
                        value={searchTerm} 
                        onChange={(e) => setSearchTerm(e.target.value)} 
                    />
                    <span style={{ position: 'absolute', left: '18px', top: '50%', transform: 'translateY(-50%)', fontSize: '18px' }}>🔍</span>
                </div>

                {/* TOURNAMENT BATTLE GRID */}
                {(() => {
                    const isModerator = creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority';
                    const isJudging = competition.status === 'Judging'; // [1]

                    if (loadingEntries) return <p style={{ textAlign: 'center', color: '#00FFFF', fontWeight: 'bold', padding: '40px' }}>Loading Battle Data...</p>;

                    if (rankedEntries.length === 0) return (
                        <div style={{ textAlign: 'center', padding: '60px 20px', background: 'rgba(255,255,255,0.02)', borderRadius: '20px', border: '1px dashed #333' }}>
                            <p style={{ color: '#666', fontWeight: 'bold', fontSize: '18px' }}>The arena is empty. Be the first to enter!</p>
                        </div>
                    );

                    return (
                        <>
                            {/* Transparency Shield: Display active judging notice but keep the final scores fully visible on screen [1] */}
                            {isJudging && (
                                <div style={{ 
                                    background: 'rgba(138, 43, 226, 0.08)', 
                                    backdropFilter: 'blur(15px)', 
                                    border: '1px solid rgba(138, 43, 226, 0.35)', 
                                    borderRadius: '16px', 
                                    padding: '24px', 
                                    marginBottom: '30px', 
                                    textAlign: 'center',
                                    boxShadow: '0 0 25px rgba(138, 43, 226, 0.15)'
                                }}>
                                    <p style={{ fontSize: '32px', margin: '0 0 8px 0' }}>⚖️</p>
                                    <h2 style={{ color: '#FFD700', fontWeight: '900', fontSize: '20px', margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '1px' }}>Final Judging In Progress</h2>
                                    <p style={{ color: '#DDD', fontSize: '13px', margin: 0, lineHeight: '1.4' }}>
                                        <strong>Transparency Shield Active:</strong> Voting is closed. All final vote tallies are displayed in the background exactly as they stood when the tournament ended. Leaderboard audits are in progress.
                                    </p>
                                </div>
                            )}
                            {/* ====== CHAMPION'S SPOTLIGHT PODIUM (Transformed into Cyan Glassmorphic Media Backdrop) ====== */}
                            {competition.status === 'Results Visible' && rankedEntries.length > 0 && (() => {
                                const champion = rankedEntries[0];
                                const useOverride = !!competition.championOverrideUrl;
                                const mediaUrl = useOverride ? competition.championOverrideUrl : (competition.competitionType === 'Photo' ? champion.photoUrl : champion.submissionUrl);
                                const mediaType = useOverride ? competition.championOverrideType : (competition.competitionType === 'Photo' ? 'Photo' : 'Video');

                                const ytMatch = mediaUrl?.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/);
                                const ytId = ytMatch ? ytMatch[1] : null;

                                return (
                                    <div style={{ 
                                        position: 'relative', 
                                        border: '2px solid #00FFFF', 
                                        borderRadius: '16px', 
                                        padding: '40px 20px', 
                                        textAlign: 'center', 
                                        marginBottom: '35px', 
                                        overflow: 'hidden', 
                                        boxShadow: '0 0 30px rgba(0, 255, 255, 0.2)',
                                        background: '#000'
                                    }}>
                                        {/* Dynamic Media Backdrop Layer */}
                                        <div style={{ position: 'absolute', inset: 0, zIndex: 1, overflow: 'hidden' }}>
                                            {mediaType === 'Video' && ytId ? (
                                                <iframe
                                                    src={`https://www.youtube.com/embed/${ytId}?autoplay=1&mute=1&playlist=${ytId}&loop=1&controls=0&showinfo=0&rel=0&modestbranding=1`}
                                                    style={{ position: 'absolute', top: '-50%', left: '-50%', width: '200%', height: '200%', border: 'none', transform: 'scale(0.55)', pointerEvents: 'none' }}
                                                    title="Champion Showcase Video"
                                                />
                                            ) : (
                                                <img 
                                                    src={mediaUrl || champion.userProfilePicture || 'https://placehold.co/1200x675'} 
                                                    alt="Champion Showcase" 
                                                    style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                                                />
                                            )}
                                            {/* Advanced Cyan Gradient Overlay Tint for content readability */}
                                            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(0, 255, 255, 0.25) 0%, rgba(5, 5, 5, 0.95) 100%)', zIndex: 2, pointerEvents: 'none' }} />
                                        </div>

                                        {/* Spotlight Container Contents (Mounted safely at Z-Index 3) */}
                                        <div style={{ position: 'relative', zIndex: 3 }}>
                                            <p style={{ color: '#00FFFF', fontSize: '13px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.25em', margin: '0 0 16px 0' }}>🏆 CONGRATULATIONS TO OUR CHAMPION 🏆</p>
                                            
                                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: '15px', cursor: 'pointer' }} onClick={() => handleEntryClick(rankedEntries[0])}>
                                                <img src={rankedEntries[0].userProfilePicture || 'https://placehold.co/100'} alt="Champion Avatar" style={{ width: '100px', height: '100px', borderRadius: '50%', border: '4px solid #00FFFF', boxShadow: '0 0 25px rgba(0,255,255,0.4)', objectFit: 'cover' }} />
                                                <div>
                                                    <h2 style={{ color: '#FFF', fontSize: '32px', fontWeight: 900, margin: '0 0 4px 0', textTransform: 'uppercase', letterSpacing: '-0.5px', lineHeight: '1' }}>{rankedEntries[0].userName}</h2>
                                                    <p style={{ color: '#00FFFF', fontSize: '18px', fontWeight: '900', margin: 0 }}>WINNING ENTRY: "{rankedEntries[0].title}"</p>
                                                    <p style={{ color: '#888', fontSize: '14px', margin: '6px 0 0 0', fontWeight: 'bold' }}>With a decisive score of {rankedEntries[0].likeCount || 0} Votes! 🥇</p>
                                                    <button 
                                                        onClick={handleShareWinner} 
                                                        style={{ background: 'transparent', border: '1px solid #00FFFF', color: '#00FFFF', margin: '15px auto 0 auto', padding: '8px 18px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', transition: 'transform 0.2s' }}
                                                    >
                                                        <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
                                                        Share Champion
                                                    </button>
                                                </div>
                                            </div>
                                            
                                            {/* 72-HOUR AUDIT VERIFICATION NOTICE [1] */}
                                            <p style={{ color: '#DDD', fontSize: '11px', margin: '20px auto 0 auto', fontStyle: 'italic', maxWidth: '440px', lineHeight: '1.4', borderTop: '1px solid rgba(0,255,255,0.15)', paddingTop: '12px' }}>
                                                ⏳ <strong>Audit Pending:</strong> Cash rewards undergo a standard 72-hour verification audit before being credited to the winners' dashboard balances.
                                            </p>
                                        </div>
                                    </div>
                                );
                            })()}

                            <div className="comp-grid">
                            {rankedEntries.map((entry, index) => {
                                const score = entry.likeCount || 0;
                                const rank = index + 1;
                                const isTop3 = rank <= 3;
                                const isEntryPending = entry.status === 'pending';
                                
                                return (
                                    <div 
                                        key={entry.id} 
                                        className="comp-card" 
                                        onClick={() => !isEntryPending && !isJudging && handleEntryClick(entry)} // Lock clicking during judging
                                        style={{ 
                                            filter: isEntryPending ? 'grayscale(100%) opacity(0.6)' : (isJudging ? 'grayscale(35%) opacity(0.85)' : 'none'), // Frosted glass styling during judging [1]
                                            cursor: (isEntryPending || isJudging) ? 'default' : 'pointer'
                                        }}
                                    >
                                        {/* Greyed-out Pending Approval Overlay */}
                                        {isEntryPending && (
                                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                                                <span style={{ fontSize: '28px', marginBottom: '8px', animation: 'neonPulse 2s infinite alternate' }}>⏳</span>
                                                <span style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>Pending Approval</span>
                                            </div>
                                        )}
                                            <div className="rank-tag" style={{ background: rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : '#00FFFF', color: '#000' }}>
                                                {isTop3 ? ['🥇', '🥈', '🥉'][index] : `#${rank}`}
                                            </div>
                                            <div style={{ width: '100%', aspectRatio: '16/9', background: '#0a0a0a', overflow: 'hidden' }}>
                                                <img src={getEntryThumbnail(entry)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} alt={entry.title} />
                                            </div>
                                            <div style={{ padding: '20px' }}>
                                                <p style={{ color: '#FFF', fontSize: '18px', fontWeight: '800', margin: '0 0 8px 0', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{entry.title}</p>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                                    <img src={entry.userProfilePicture || 'https://placehold.co/24'} style={{ width: '28px', height: '28px', borderRadius: '50%', border: '1px solid #444', objectFit: 'cover' }} alt="PFP" />
                                                    <span style={{ color: '#AAA', fontSize: '13px', fontWeight: '700' }}>{entry.userName}</span>
                                                </div>

                                                {/* SPECIFIC GIFT EMOJIS RECEIVED (Only shows if they actually have received them) */}
                                                {entry.giftInventory && Object.keys(entry.giftInventory).length > 0 && (
                                                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '16px', borderTop: '1px solid #1A1A1A', paddingTop: '10px' }}>
                                                        {giftTokens.map(token => {
                                                            const count = entry.giftInventory[token.name] || 0;
                                                            if (count === 0) return null;
                                                            return (
                                                                <div key={token.id} style={{ display: 'flex', alignItems: 'center', gap: '3px', background: 'rgba(255, 215, 0, 0.1)', border: '1px solid rgba(255, 215, 0, 0.2)', borderRadius: '6px', padding: '2px 6px', fontSize: '11px' }}>
                                                                    <span>{token.icon}</span><span style={{ color: '#FFD700', fontWeight: 'bold' }}>x{count}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}

                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #222', paddingTop: '15px' }}>
                                                    <div>
                                                        <p style={{ color: '#555', fontSize: '10px', fontWeight: '900', margin: 0, textTransform: 'uppercase', letterSpacing: '1px' }}>Total Votes</p>
                                                        <p style={{ color: isTop3 ? '#FFD700' : '#00FFFF', fontSize: '22px', fontWeight: '900', margin: 0 }}>{score.toLocaleString()}</p>
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                        {currentUser && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setTargetEntryForGift(entry); setIsGiftModalOpen(true); }}
                                                                style={{
                                                                    background: 'rgba(255, 255, 255, 0.05)',
                                                                    border: '1px solid rgba(255, 255, 255, 0.2)',
                                                                    borderRadius: '12px',
                                                                    padding: '8px 14px',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    gap: '8px',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s',
                                                                }}
                                                                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
                                                                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; }}
                                                            >
                                                                {/* Minimalist White Outline Gift SVG */}
                                                                <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'none', stroke: '#FFF', strokeWidth: '2.5', strokeLinecap: 'round', strokeLinejoin: 'round' }}>
                                                                    <polyline points="20 12 20 22 4 22 4 12"></polyline>
                                                                    <rect x="2" y="7" width="20" height="5"></rect>
                                                                    <line x1="12" y1="22" x2="12" y2="7"></line>
                                                                    <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path>
                                                                    <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path>
                                                                </svg>
                                                                <span style={{ color: '#FFF', fontSize: '13px', fontWeight: '900' }}>GIFT</span>
                                                            </button>
                                                        )}
                                                        {currentUser && competition.status === 'Live Voting' && (
                                                            <CompetitionLikeButton competition={competition} entry={entry} currentUser={currentUser} showMessage={showMessage} />
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    );
                })()}
            </div>

            {/* MODALS */}
            {showPrizesModal && <PrizesModal competition={competition} onClose={() => setShowPrizesModal(false)} />}
            {showEntryForm && <CompetitionEntryForm competition={competition} onClose={() => setShowEntryForm(false)} currentUser={currentUser} creatorProfile={creatorProfile} showMessage={showMessage} />}
            {selectedEntry && (
                competition.competitionType === 'Photo' ? (
                    <EnlargedPhotoViewer competition={competition} entry={selectedEntry} currentUser={currentUser} showMessage={showMessage} onClose={() => setSelectedEntry(null)} />
                ) : (
                    <CompetitionVideoViewer competition={competition} entry={selectedEntry} currentUser={currentUser} showMessage={showMessage} onClose={() => setSelectedEntry(null)} />
                )
            )}

            {/* ====== THE INTERACTIVE MMG GIFT MODAL ====== */}
            {isGiftModalOpen && targetEntryForGift && (
                <div className="gift-modal-overlay" onClick={() => !isSubmitting && setIsGiftModalOpen(false)}>
                    <div className="gift-modal" onClick={e => e.stopPropagation()}>
                        {!submitSuccess ? (
                            <>
                                <div className="modal-header">
                                    <div>
                                        <p style={{ color: '#737373', fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', margin: 0 }}>Send a Gift To</p>
                                        <h2 style={{ color: '#FFFFFF', fontSize: '24px', fontWeight: 800, margin: '4px 0 0 0' }}>{targetEntryForGift.userName}</h2>
                                    </div>
                                    <button className="modal-close" onClick={() => setIsGiftModalOpen(false)}>✕</button>
                                </div>

                                <p style={{ color: '#737373', fontSize: '12px', margin: '0 0 20px 0' }}>Select a Token. Gifts support the creator financially. Votes decide the tournament winner [1].</p>

                                <div style={{ maxHeight: '280px', overflowY: 'auto', marginBottom: '16px', paddingRight: '4px' }}>
                                    {giftTokens.map(token => {
                                        const platformFee = token.price * 0.15;
                                        const actorReceives = token.price * 0.85;
                                        return (
                                            <div key={token.id} className={`token-card ${selectedToken.id === token.id ? 'selected' : ''}`} onClick={() => setSelectedToken(token)}>
                                                <div className="token-icon">
                                                    {token.icon}
                                                </div>
                                                <div className="token-info">
                                                    <p className="token-name">{token.name}</p>
                                                    <p className="token-breakdown">Actor: {actorReceives.toLocaleString()} GYD | Platform: {platformFee.toLocaleString()} GYD (15%)</p>
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
                                        <span className="breakdown-label" style={{ color: '#4ADE80' }}>Actor Receives</span>
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
                                    <button className="submit-btn" style={{ flex: 1, backgroundColor: '#333', color: '#888' }} onClick={() => setIsGiftModalOpen(false)} disabled={isSubmitting}>Cancel</button>
                                    <button className="submit-btn" style={{ flex: 2 }} onClick={submitGiftPledge} disabled={isSubmitting || !paymentId || !screenshotBase64}>
                                        {isSubmitting ? 'Verifying...' : `Submit Gift — ${(selectedToken?.price || 0).toLocaleString()} GYD`}
                                    </button>
                                </div>
                            </>
                        ) : (
                            <div className="success-state">
                                <div className="success-check" style={{ margin: '0 auto 16px' }}>✓</div>
                                <h3 style={{ color: '#FFFFFF', fontSize: '24px', fontWeight: 900, margin: '0 0 12px 0', letterSpacing: '0.02em' }}>
                                    Gift Sent!
                                </h3>
                                <p style={{ color: '#AAA', fontSize: '14px', margin: 0, lineHeight: '1.6' }}>
                                    {successMode === 'mmg' 
                                        ? "Your receipt has been submitted for verification. The gift will be delivered once approved." 
                                        : <>Your <strong style={{color: '#FFD700'}}>{selectedToken?.name || 'Gift'}</strong> has been delivered to {targetEntryForGift.userName}.</>}
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
                                                    targetUserId: targetEntryForGift.userId,
                                                    giftName: selectedToken?.name || 'Gift',
                                                    amount: selectedToken?.price || 0,
                                                    competitionId: competition.id,
                                                    entryId: targetEntryForGift.id
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
        </div>
    );
};

export default CompetitionScreen;