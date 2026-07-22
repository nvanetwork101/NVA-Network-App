// src/components/HomeScreen.jsx

import { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, getDoc, collection, query, where, orderBy, onSnapshot, limit } from "firebase/firestore";

// --- Child Component Imports ---
import LikeButton from './LikeButton';
import DynamicThumbnail from './DynamicThumbnail';
import CompetitionHomeScreenBanner from './CompetitionHomeScreenBanner';
// Legacy PromotedSlot and Campaigns removed for CenterStage Engine

// --- Main HomeScreen Component ---
    const HomeScreen = ({ currentUser, creatorProfile, showMessage, handleVideoPress, handleLogout, setActiveScreen, activeCompetition, setSelectedUserId }) => {
    
    // --- STATE & REFS (Gutted Live Feed & Added Live Arenas) ---
    const [rawLayout, setRawLayout] = useState(null);
    const [rawAutomatedSlots, setRawAutomatedSlots] = useState(null);
    const [enrichedLayout, setEnrichedLayout] = useState({ featured: [], trending: [] });
    const [displayFeatured, setDisplayFeatured] = useState([]);
    const horizontalCarouselRef = useRef(null);
    const [isLayoutLoading, setIsLayoutLoading] = useState(true);

    // Live rooms tracking
    const [liveRooms, setLiveRooms] = useState([]);
    const [isLiveRoomsLoading, setIsLiveRoomsLoading] = useState(true);
    const [enrollmentConfig, setEnrollmentConfig] = useState(null); 
    const [enrollmentStatus, setEnrollmentStatus] = useState(null); // Real-time listener for current user's registration
    const [blockList, setBlockList] = useState(new Set());
    const [realtimeContent, setRealtimeContent] = useState(new Map());
    const [newCastingCount, setNewCastingCount] = useState(0);

    useEffect(() => {
        const lastSeen = parseInt(localStorage.getItem('last_viewed_casting') || '0');
        const q = query(collection(db, "opportunities"), where("status", "==", "active"), where("createdAt", ">", new Date(lastSeen)));
        const unsub = onSnapshot(q, (snap) => setNewCastingCount(snap.size));
        return () => unsub();
    }, []);

    // Real-time listener: Fetches all creators currently live on the platform [1]
    useEffect(() => {
        const q = query(
            collection(db, "creators"),
            where("isLive", "==", true)
        );
        const unsub = onSnapshot(q, (snapshot) => {
            setLiveRooms(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setIsLiveRoomsLoading(false);
        });
        return () => unsub();
    }, []);

    // EFFECT 1: This hook sets up all the live listeners.
    useEffect(() => {
        const appId = "production-app-id";
        
        const layoutDocRef = doc(db, "settings", "homeScreenLayout");
        const unsubLayout = onSnapshot(layoutDocRef, (docSnap) => {
            setRawLayout(docSnap.exists() ? docSnap.data() : {});
        });

        // --- ADD THIS BLOCK START ---
        const automatedSlotsRef = doc(db, "settings", "featuredContentSlots");
        const unsubAutomatedSlots = onSnapshot(automatedSlotsRef, (docSnap) => {
            setRawAutomatedSlots(docSnap.exists() ? docSnap.data() : {});
        });
        // --- ADD THIS BLOCK END ---

        const enrollmentConfigRef = doc(db, "settings", "enrollmentConfig");
        const unsubEnrollmentConfig = onSnapshot(enrollmentConfigRef, (docSnap) => {
            setEnrollmentConfig(docSnap.exists() ? docSnap.data() : null);
        });

        let unsubEnrollmentStatus = () => {};
        if (currentUser) {
            const enrollmentRef = doc(db, "enrollmentApplications", currentUser.uid);
            unsubEnrollmentStatus = onSnapshot(enrollmentRef, (docSnap) => {
                setEnrollmentStatus(docSnap.exists() ? docSnap.data() : null);
            });
        } else {
            setEnrollmentStatus(null);
        }
        
        let unsubBlockList = () => {};
        if (currentUser) {
            const blockedUsersRef = collection(db, "creators", currentUser.uid, "blockedUsers");
            const blockedByRef = collection(db, "creators", currentUser.uid, "blockedBy");
            const unsubBlocked = onSnapshot(blockedUsersRef, (snapshot) => setBlockList(prev => new Set([...prev, ...snapshot.docs.map(doc => doc.id)])));
            const unsubBlockedBy = onSnapshot(blockedByRef, (snapshot) => setBlockList(prev => new Set([...prev, ...snapshot.docs.map(doc => doc.id)])));
            unsubBlockList = () => { unsubBlocked(); unsubBlockedBy(); };
        } else { 
            setBlockList(new Set()); 
        }

        return () => { unsubLayout(); unsubAutomatedSlots(); unsubEnrollmentConfig(); unsubEnrollmentStatus(); unsubBlockList(); };
    }, [currentUser]);

    // EFFECT 2: Sets up real-time listeners for content items based on the layout.
   // EFFECT 2: Sets up real-time listeners for all content items.
    useEffect(() => {
        // Wait until both layout and slot data are available.
        if (!rawLayout || !rawAutomatedSlots) return;

        const appId = "production-app-id";

        // Gather IDs from the manual layout (featured and trending)
        const manualItems = [...(rawLayout.featuredItems || []), ...(rawLayout.trendingItems || [])];
        const manualContentIds = manualItems
            .filter(i => i.type === 'internal' && i.contentId)
            .map(i => i.contentId);

        // Gather IDs from the automated slots
        const automatedContentIds = Object.values(rawAutomatedSlots)
            .filter(slot => slot && slot.content && slot.content.id)
            .map(slot => slot.content.id);

        // Combine and get a unique set of all content IDs that need listeners.
        const allContentIds = [...new Set([...manualContentIds, ...automatedContentIds])];

        const unsubscribers = allContentIds.map(id => {
            if (!id) return () => {}; // Safety check for null/undefined IDs
            const docRef = doc(db, `artifacts/${appId}/public/data/content_items`, id);
            return onSnapshot(docRef, (docSnap) => {
                if (docSnap.exists()) {
                    setRealtimeContent(prevMap => new Map(prevMap).set(id, { id: docSnap.id, ...docSnap.data() }));
                } else {
                    // If a doc is deleted, remove it from our map to prevent displaying stale data.
                    setRealtimeContent(prevMap => {
                        const newMap = new Map(prevMap);
                        newMap.delete(id);
                        return newMap;
                    });
                }
            });
        });

        return () => {
            unsubscribers.forEach(unsub => unsub());
        };
    }, [JSON.stringify(rawLayout), JSON.stringify(rawAutomatedSlots)]); // MODIFIED: stringify keys to prevent infinite loops

    // EFFECT 3: Processes the layout with the latest real-time data.
    useEffect(() => {
        // THE DEFINITIVE FIX: Add a strict guard to ensure rawLayout is not null and has items.
        // This prevents the component from crashing during a re-render on navigation.
        if (!rawLayout || !rawLayout.trendingItems || !rawAutomatedSlots || !realtimeContent) {
            // If the essential data isn't here yet, do nothing and wait for the next effect run.
            return;
        }
        setIsLayoutLoading(true);

        const enrich = (items) => items.map(item => {
            if (item.type === 'internal') {
                return realtimeContent.has(item.contentId) ? { ...item, ...realtimeContent.get(item.contentId) } : null;
            }
            return item;
        }).filter(Boolean).filter(content => content.isActive === true || content.type === 'external');
        
        // --- CORRECTED FUSION LOGIC (SLOTS-FIRST) ---

        // 1. Get and strictly order the 6 primary slot items.
        const slotItems = [];
        const slotIds = new Set();
        for (let i = 1; i <= 6; i++) {
            const slot = rawAutomatedSlots[`slot_${i}`];
            if (slot && slot.content && slot.content.id) {
                const item = { ...slot.content, type: 'internal', contentId: slot.content.id };
                slotItems.push(item);
                slotIds.add(item.contentId); // Keep track of slot IDs for de-duplication
            }
        }

        // 2. Get manual items, filter out any that are already in the slots, and sort them.
        const manualTrendingItems = rawLayout.trendingItems || [];
        const uniqueManualItems = manualTrendingItems
            .filter(item => !slotIds.has(item.contentId)) // The crucial change: filter the manual list
            .sort((a, b) => (a.orderIndex || 999) - (b.orderIndex || 999));

        // 3. Combine the lists: The 6 ordered slots FIRST, then the sorted unique manual items.
        const combinedTrending = [...slotItems, ...uniqueManualItems];
        const enrichedTrending = enrich(combinedTrending); // No final sort is needed here

        // --- Process "Featured" section as before ---
        const enrichedFeatured = enrich(rawLayout.featuredItems || []).sort((a, b) => (a.orderIndex || 99) - (b.orderIndex || 99));

        // --- Final State Update ---
        const finalLayout = {
            featured: enrichedFeatured,
            trending: enrichedTrending
        };

        setEnrichedLayout(finalLayout);
        setDisplayFeatured(finalLayout.featured.length > 3 ? [...finalLayout.featured, ...finalLayout.featured.slice(0, 3)] : finalLayout.featured);
        setIsLayoutLoading(false);

    }, [rawLayout, rawAutomatedSlots, realtimeContent]);

    useEffect(() => {
        const carousel = horizontalCarouselRef.current;
        if (!carousel || displayFeatured.length <= 3) return;
        const originalItemCount = enrichedLayout.featured.length;
        if (originalItemCount === 0) return;
        const interval = setInterval(() => {
            const firstItem = carousel.querySelector('.horizontal-carousel-item');
            if (!firstItem) return;
            const itemWidth = firstItem.offsetWidth + 15;
            const scrollEnd = originalItemCount * itemWidth;
            if (carousel.scrollLeft >= scrollEnd - itemWidth) {
                carousel.style.scrollBehavior = 'auto';
                carousel.scrollLeft = 0;
                setTimeout(() => {
                    carousel.style.scrollBehavior = 'smooth';
                    carousel.scrollLeft += itemWidth;
                }, 50);
            } else {
                carousel.scrollLeft += itemWidth;
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [displayFeatured, enrichedLayout.featured]);

    // --- HANDLERS ---
    const handleHorizontalScroll = (direction) => {
        const carousel = horizontalCarouselRef.current;
        if (carousel) {
            const itemWidth = carousel.children[0]?.offsetWidth + 15;
            carousel.scrollBy({ left: direction === 'prev' ? -itemWidth : itemWidth, behavior: 'smooth' });
        }
    };
    
    const handleItemClick = (item) => {
        if (!currentUser) {
            showMessage("Please log in to view content.");
            return;
        }
        if (item.type === 'external') {
            window.open(item.externalLink, '_blank');
            return;
        }
        const urlToPlay = item.embedUrl || item.mainUrl;
        if (urlToPlay) {
            handleVideoPress(urlToPlay, item);
        } else {
            showMessage("This item has no valid link to play.");
        }
    };

    // --- RENDER LOGIC ---
    const statusLower = enrollmentStatus?.status?.toLowerCase() || '';
    const opts = enrollmentStatus?.selectedOptions || [];

    // 1. Identify if User is ALREADY a verified member of a track
    const isFilmClubMember = creatorProfile?.isFilmClub || creatorProfile?.isClassMember;
    const isDocuSeriesMember = creatorProfile?.isContestant;

    // 2. Identify if User has an ACTIVE (Pending/Approved) application for a track
    // If status is 'declined' or 'cancelled', we ignore the application so the banner can reappear.
    const hasActiveApp = statusLower !== 'declined' && statusLower !== 'cancelled' && statusLower !== '';
    const isApplyingForFilm = hasActiveApp && opts.some(o => typeof o === 'string' && o.toLowerCase().includes('film'));
    const isApplyingForDocu = hasActiveApp && opts.some(o => typeof o === 'string' && o.toLowerCase().includes('docu'));

    // 3. Determine if the track is "Available" to this specific user
    const isFilmClubOpen = enrollmentConfig?.filmClubOpen === true || String(enrollmentConfig?.filmClubOpen).toLowerCase() === "true";
    const isDocuSeriesOpen = enrollmentConfig?.docuSeriesOpen === true || String(enrollmentConfig?.docuSeriesOpen).toLowerCase() === "true";

    // Banner logic: Show if track is open. 
    // FIX: Admins ignore membership/application checks so they can always verify the banner is live.
    const isAdmin = creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority';
    const canRegisterFilm = isFilmClubOpen && (isAdmin || (!isFilmClubMember && !isApplyingForFilm));
    const canRegisterDocu = isDocuSeriesOpen && (isAdmin || (!isDocuSeriesMember && !isApplyingForDocu));

    // The banner appears if either track is open and the user is eligible (or an Admin).
    const shouldShowBanner = canRegisterFilm || canRegisterDocu;

    return (
        <div className="screenContainer">
            {/* ONLY render the banner if a valid, active competition is currently loaded */}
            {activeCompetition && activeCompetition.id && (
                <CompetitionHomeScreenBanner setActiveScreen={setActiveScreen} activeCompetition={activeCompetition} />
            )}

            {/* --- MODERNIZED: Gradient Tinted Glassmorphic Enrollment Banner --- */}
            {currentUser && shouldShowBanner && (
                <div 
                    className="enrollmentBanner" 
                    onClick={() => setActiveScreen('EnrollmentHub')} 
                    style={{
                        background: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(0, 0, 0, 0.4) 100%)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        border: '1px solid rgba(255, 215, 0, 0.3)',
                        color: '#FFF',
                        padding: '18px 15px',
                        borderRadius: '16px',
                        marginTop: '15px',
                        marginBottom: '10px',
                        cursor: 'pointer',
                        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5), inset 0 0 15px rgba(255, 215, 0, 0.05)',
                        textAlign: 'center',
                        transition: 'transform 0.2s ease',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '4px'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.01)'}
                    onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                    <p style={{ margin: 0, fontSize: '15px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '2px', color: '#FFD700', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        🎬 NVA Enrollment is Open
                    </p>
                    <p style={{ margin: 0, fontSize: '12px', color: '#AAA', fontWeight: '500', letterSpacing: '0.5px' }}>
                        Apply for active programs & Docu-Series challenges
                    </p>
                </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
                <p className="sectionTitle" style={{ margin: 0, fontSize: '18px' }}>Highlights</p>
                <div className="topRightButtonContainer" style={{ position: 'static', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <style>{`
                        /* Base VIP Glass Style - Unified & Polished */
                        .btn-glass {
                            backdrop-filter: blur(8px) !important;
                            border-radius: 6px !important; 
                            padding: 8px 12px !important; /* Slightly tighter padding for better fit */
                            font-size: 13px !important;
                            font-weight: 900 !important;
                            cursor: pointer !important;
                            transition: all 0.25s ease !important;
                            text-transform: uppercase !important;
                            letter-spacing: 0.8px !important;
                            display: inline-flex !important;
                            align-items: center !important;
                            justify-content: center !important;
                            min-height: 38px !important; /* Changed from height to min-height */
                            border-width: 2px !important;
                            border-style: solid !important;
                            text-align: center !important;
                            line-height: 1.2 !important; /* Prevents text from hitting borders when wrapping */
                        }

                        /* CenterStage - Deep Indigo/Gold Glow */
                        .centerstage-btn {
                            background: rgba(79, 70, 229, 0.15) !important;
                            color: #FFF !important;
                            border-color: #4F46E5 !important;
                            box-shadow: 0 0 15px rgba(79, 70, 229, 0.4);
                        }
                        .centerstage-btn:hover { background: rgba(79, 70, 229, 0.3) !important; box-shadow: 0 0 25px rgba(79, 70, 229, 0.7); transform: scale(1.03); }

                        /* Film Arena - Neon Purple Glow */
                        .custom-arena-btn {
                            background: rgba(168, 85, 247, 0.15) !important;
                            color: #FFF !important;
                            border-color: #a855f7 !important;
                            box-shadow: 0 0 15px rgba(168, 85, 247, 0.4);
                        }
                        .custom-arena-btn:hover { background: rgba(168, 85, 247, 0.3) !important; box-shadow: 0 0 25px rgba(168, 85, 247, 0.7); transform: scale(1.03); }

                        /* Music Charts - White/Black High-Contrast Aesthetic */
                        .music-charts-btn {
                            background: #FFFFFF !important;
                            color: #000000 !important;
                            border-color: #FFFFFF !important;
                            box-shadow: 0 0 10px rgba(255, 255, 255, 0.3) !important;
                            text-shadow: none !important;
                        }
                        .music-charts-btn:hover { background: #E0E0E0 !important; box-shadow: 0 0 20px rgba(255, 255, 255, 0.5) !important; transform: scale(1.03); }

                        /* Explore Hub & Login - Darkened Cyan Style */
                        .discover-btn {
                            background: rgba(0, 255, 255, 0.03) !important; /* Same darkened background tint */
                            color: #FFFFFF !important; /* White text */
                            border-color: #00FFFF !important; /* Match cyan borders */
                            box-shadow: none !important; /* No glow */
                        }
                        .discover-btn:hover { background: rgba(0, 255, 255, 0.1) !important; }

                        /* Responsive Mobile Scaling to Prevent Text Cutoffs */
                        @media (max-width: 768px) {
                            .btn-glass {
                                padding: 6px 12px !important;
                                font-size: 11px !important;
                                height: 32px !important;
                                letter-spacing: 0.5px !important;
                            }
                        }
                    `}</style>

                    <button 
                        onClick={() => setActiveScreen('CenterStage')}
                        className="btn-glass centerstage-btn"
                    >
                        CenterStage 🎭
                    </button>
                    <button 
                        onClick={() => setActiveScreen('FilmArena')}
                        className="btn-glass custom-arena-btn"
                    >
                        Film Arena 🍿
                    </button>
                    <button 
                        onClick={() => setActiveScreen('FilmClubHub')}
                        className="btn-glass custom-arena-btn"
                        style={{ borderColor: '#A855F7', background: 'rgba(168, 85, 247, 0.15)', textShadow: '0 0 10px rgba(168, 85, 247, 0.4)' }}
                    >
                        Film Club 🎬
                    </button>
                </div>
            </div>

            <div className="carousel-wrapper">
                {displayFeatured.length > 3 && (
                    <>
                        <button className="carousel-nav-btn prev-horizontal" onClick={() => handleHorizontalScroll('prev')}>◀</button>
                        <button className="carousel-nav-btn next-horizontal" onClick={() => handleHorizontalScroll('next')}>▶</button>
                    </>
                )}
                <div className="horizontal-carousel-container" ref={horizontalCarouselRef}>
                    {isLayoutLoading ? (
                        Array.from({ length: 5 }).map((_, i) => <div key={i} className="horizontal-carousel-item" style={{ backgroundColor: '#2A2A2A' }}></div>)
                    ) : (
                        displayFeatured.map((item, index) => (
                            <div key={`${item.id || item.title}-${index}`} className="horizontal-carousel-item" onClick={() => handleItemClick(item)} style={{ cursor: 'pointer' }}>
                                <img src={item.customThumbnailUrl || item.imageUrl} alt={item.title} className="carousel-image" />
                                {currentUser && item.type === 'internal' && item.id && <LikeButton contentItem={item} currentUser={currentUser} showMessage={showMessage} itemType={'content'} />}
                            </div>
                        ))
                    )}
                </div>
            </div>

            {/* --- TRENDING HEADER WITH CTA BUTTONS --- */}
            <div className="sectionHeaderWithButton" style={{ flexWrap: 'wrap', gap: '12px', marginBottom: '16px', marginTop: '24px' }}>
                <p className="sectionTitle">Trending</p>
                {!currentUser ? (
                    <button className="sectionHeaderButton" onClick={() => setActiveScreen('SignUp')}>Join NVA Network</button>
                ) : (
                    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', opacity: isLayoutLoading ? 0 : 1, transition: 'opacity 0.3s ease', pointerEvents: isLayoutLoading ? 'none' : 'auto' }}>
                        {rawLayout && rawLayout.showMusicCharts !== false && (
                            <button 
                                className="btn-glass music-charts-btn" 
                                style={{ position: 'relative' }}
                                onClick={() => setActiveScreen('MusicCharts')}
                            >
                                <span style={{ fontSize: '1.08em' }}>NVA Billboard</span> 
                                <span style={{ filter: 'grayscale(100%) contrast(200%) brightness(0)', marginLeft: '6px' }}>🎵</span>
                            </button>
                        )}
                        <button 
                            className="btn-glass discover-btn" 
                            onClick={() => setActiveScreen('Discover')}
                        >
                            Explore Hub
                        </button>
                    </div>
                )}
            </div>

            {/* ====== RESTORED DYNAMIC TRENDING GRID ====== */}
            {isLayoutLoading ? (
                <p style={{ color: 'white', padding: '10px' }}>Loading trending...</p>
            ) : (
                <div className="contentGrid" style={{ marginBottom: '30px' }}>
                    {enrichedLayout.trending.map((item, index) => (
                        <div key={`${item.id || item.title}-${index}`} className="contentCard">
                            <DynamicThumbnail item={item} onClick={() => handleItemClick(item)} />
                            <p className="contentTitle">{item.title}</p>
                            {item.type === 'internal' && (
                                <div style={{ padding: '0 10px 10px 10px', display: 'flex', alignItems: 'center', gap: '5px', color: '#AAA', fontSize: '12px' }}>
                                    <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'currentColor' }}><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 10c-2.48 0-4.5-2.02-4.5-4.5S9.52 5.5 12 5.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5zM12 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>
                                    <span>{(item.viewCount || 0).toLocaleString()} views</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* ====== LIVE ARENAS TRAY (EMBER THEME - Wrapped in Global Admin Kill-Switch) ====== */}
            {enrollmentConfig?.isLiveArenaEnabled === true && (
                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #222', paddingBottom: '10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                        <button 
                            onClick={() => setActiveScreen('LiveDirectory')}
                            style={{ 
                                background: 'linear-gradient(90deg, #FF4500, #8B0000)', color: '#FFF', border: '1px solid #FF4500', 
                                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: '900', 
                                textTransform: 'uppercase', letterSpacing: '1px', cursor: 'pointer', 
                                boxShadow: '0 0 15px rgba(255,69,0,0.4)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0
                            }}
                        >
                            🔴 Open Live Area
                        </button>
                        <span style={{ color: '#888', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            {liveRooms.length} Active
                        </span>
                    </div>
                    {isLiveRoomsLoading ? (
                        <p style={{ color: '#666', fontSize: '12px' }}>Loading active arenas...</p>
                    ) : liveRooms.length > 0 ? (
                        <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '10px' }}>
                            {liveRooms.map(room => (
                                <div 
                                    key={room.id} 
                                    onClick={() => {
                                        if (room.liveRoomType === 'roast') {
                                            setSelectedUserId(room.id);
                                            setActiveScreen('RoastRoom'); // FIX: Navigates directly to the Arena
                                            showMessage(`Dropping into ${room.creatorName}'s Live Roast Room...`);
                                        }
                                    }}
                                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer', flexShrink: 0 }}
                                >
                                    <div style={{ position: 'relative', width: '64px', height: '64px', borderRadius: '50%', padding: '3px', background: 'linear-gradient(45deg, #FF4500, #FFD700)', boxShadow: '0 0 12px rgba(255, 69, 0, 0.4)' }}>
                                        <img src={room.profilePictureUrl || 'https://placehold.co/64'} alt={room.creatorName} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', background: '#000' }} />
                                        <span style={{ position: 'absolute', bottom: '-4px', left: '50%', transform: 'translateX(-50%)', backgroundColor: '#FF4500', color: '#FFF', fontSize: '8px', fontWeight: '900', padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', border: '1px solid #000' }}>LIVE</span>
                                    </div>
                                    <span style={{ color: '#FFF', fontSize: '11px', marginTop: '6px', fontWeight: 'bold', maxWidth: '70px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{room.creatorName}</span>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p style={{ color: '#737373', fontSize: '12px', fontStyle: 'italic' }}>No active live rooms. Start one from your dashboard!</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default HomeScreen;