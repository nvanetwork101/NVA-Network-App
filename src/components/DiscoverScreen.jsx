// src/components/DiscoverScreen.jsx

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, getDocs, limit, startAfter } from "firebase/firestore";
import { getDatabase, ref, set, onDisconnect, onValue, remove, serverTimestamp } from "firebase/database";
import { db, functions, httpsCallable, extractVideoInfo } from '../firebase.js';
import LiveEventChat from './LiveEventChat';
import GiftTicketModal from './GiftTicketModal';
import HlsPlayer from './HlsPlayer';

// High-Fidelity Components integrated directly into our Tab system
import CenterStageScreen from './CenterStageScreen'; 
import CreatorConnectScreen from './CreatorConnectScreen';
import DiscoverUsersScreen from './DiscoverUsersScreen'; // FIX: Added missing import

// --- Replay Card Component ---
import ShareButton from './ShareButton';
const ReplayEventCard = ({ event, onClick }) => {
    const thumbnailUrl = event.customThumbnailUrl || event.thumbnailUrl || 'https://placehold.co/128x72/2A2A2A/FFF?text=N/A';
    const formatDate = (timestamp) => {
        if (!timestamp) return 'Unknown Date';
        if (timestamp.toDate) return timestamp.toDate().toLocaleDateString();
        if (timestamp.toMillis) return new Date(timestamp.toMillis()).toLocaleDateString();
        if (timestamp.seconds) return new Date(timestamp.seconds * 1000).toLocaleDateString();
        const parsed = new Date(timestamp);
        return isNaN(parsed.getTime()) ? 'Unknown Date' : parsed.toLocaleDateString();
    };
    return (
        <div className="replay-card" onClick={onClick}>
            <img src={thumbnailUrl} alt={event.eventTitle} className="replay-card-image" />
            <div className="replay-card-info">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <p className="replay-card-title">{event.eventTitle}</p>
                    {event.isTicketed && <span style={{ fontSize: '16px' }}>🎟️</span>}
                </div>
                <p className="replay-card-details">Aired: {formatDate(event.scheduledStartTime)}</p>
            </div>
            <div className="replay-card-play-button">
                <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
            </div>
        </div>
    );
};

// --- Dynamic Thumbnail for other VOD content ---
const DynamicThumbnail = ({ item, onClick }) => {
    const thumbnailUrl = item.customThumbnailUrl || item.imageUrl || 'https://placehold.co/300x200/2A2A2A/FFF?text=NVA';
    return (
        <div className="thumbnailPlaceholder" style={{backgroundImage: `url(${thumbnailUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative'}} onClick={onClick}>
            <svg className="playIcon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
        </div>
    );
};

// --- NVA AUTHORITATIVE SYNC PLAYER (SHIELDED) ---
const StableIframePlayer = React.memo(({ eventId, streamUrl, schedTime, isModUser, isUnlocked }) => {
    const urlRef = useRef('');
    const lastEventIdRef = useRef(null);

    // URL is hard-locked into a ref on the very first render. It will NEVER recalculate or restart.
    if (lastEventIdRef.current !== eventId) {
        let startTimeMs = 0;
        if (schedTime?.toMillis) startTimeMs = schedTime.toMillis();
        else if (schedTime?.toDate) startTimeMs = schedTime.toDate().getTime();
        else if (schedTime?.seconds) startTimeMs = schedTime.seconds * 1000;
        else if (typeof schedTime === 'number') startTimeMs = schedTime < 10000000000 ? schedTime * 1000 : schedTime;
        else if (schedTime) {
            const parsed = new Date(schedTime).getTime();
            if (!isNaN(parsed)) startTimeMs = parsed;
        }
        if (startTimeMs === 0) startTimeMs = Date.now();

        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startTimeMs) / 1000));
        let url = '';
        const isFacebook = streamUrl.includes('facebook.com') || streamUrl.includes('fb.watch');

        if (isFacebook) {
            const encodedFbUrl = encodeURIComponent(streamUrl);
            const timeParam = elapsedSeconds > 0 ? `&t=${elapsedSeconds}` : '';
            url = `https://www.facebook.com/plugins/video.php?href=${encodedFbUrl}&show_text=false&autoplay=true&mute=0${timeParam}`;
        } else {
            const extracted = extractVideoInfo(streamUrl);
            const embedUrl = extracted ? extracted.embedUrl : streamUrl;
            if (embedUrl) {
                const separator = embedUrl.includes('?') ? '&' : '?';
                const controls = isModUser ? '1' : '0';
                const disablekb = isModUser ? '0' : '1';
                const startParam = elapsedSeconds > 0 ? `&start=${elapsedSeconds}` : '';
                /* THE FIX: Added &loop=0 and rel=0 to prevent the video from restarting/suggesting others when finished */
url = `${embedUrl}${separator}autoplay=1&mute=0&controls=${controls}&disablekb=${disablekb}&modestbranding=1&rel=0&loop=0&enablejsapi=1${startParam}`;
            }
        }
        urlRef.current = url;
        lastEventIdRef.current = eventId;
    }

    return (
            <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', backgroundColor: '#000' }}>
                {/* THE FIX: Overlay now blocks clicks until specifically unlocked */}
                {!isUnlocked && (
                    <div 
                        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10, cursor: 'default' }} 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); }} 
                    />
                )}
                <iframe
                key={`nva-sync-player-${eventId}`} 
                src={urlRef.current}
                className="w-full h-full border-0"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
                title="Live Premiere"
                style={{ width: '100%', height: '100%', pointerEvents: 'auto' }} 
            ></iframe>
        </div>
    );
}, (prev, next) => prev.eventId === next.eventId && prev.isModUser === next.isModUser && prev.isUnlocked === next.isUnlocked);

function DiscoverScreen({ 
    showMessage, 
    currentUser, 
    creatorProfile, 
    setActiveScreen, 
    handleVideoPress,
    liveEvent,
    setPledgeContext,
    isLive, 
    countdownText,
    deepLinkedReplayId,
    setSelectedOpportunity 
}) {
    // --- STATE MANAGEMENT ---
    const [masterEventDetails, setMasterEventDetails] = useState(null);
    const [categories, setCategories] = useState([]);
    const [activeCategory, setActiveCategory] = useState('Live Premieres');
    const [content, setContent] = useState([]);
    const [loadingCategories, setLoadingCategories] = useState(true);
    const [loadingContent, setLoadingContent] = useState(false);
    const [showMore, setShowMore] = useState(false);
    
    // State for original "Past Events" (Replays) functionality
    const [pastEvents, setPastEvents] = useState([]);
    const [replaySearchTerm, setReplaySearchTerm] = useState('');

    // State for NEW VOD pagination and search functionality
    const [lastDoc, setLastDoc] = useState(null); 
    const [hasMore, setHasMore] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [searchInput, setSearchInput] = useState('');
    const [hasLiked, setHasLiked] = useState(false);
    const [isLiking, setIsLiking] = useState(false);
    const [floatingLikes, setFloatingLikes] = useState([]);
    const [unlockPlayerControls, setUnlockPlayerControls] = useState(false);
    const viewCounted = React.useRef(false);

    const triggerFloatingLike = () => {
        const id = Date.now() + Math.random();
        setFloatingLikes(prev => [...prev, { id }]);
        setTimeout(() => setFloatingLikes(prev => prev.filter(like => like.id !== id)), 2000);
    };
    const [countdownDistance, setCountdownDistance] = useState(null); // Milliseconds remaining until start
    
    const [showGiftModal, setShowGiftModal] = useState(false);
    const showcaseTopRef = useRef(null); // THE FIX: Moved to top to prevent ReferenceError
        // THE FIX: Immediately boots into the correct tab if redirected from the Header Banner
        const [activeTab, setActiveTab] = useState(() => {
            const savedTab = sessionStorage.getItem('nva_target_discover_tab');
            if (savedTab) {
                sessionStorage.removeItem('nva_target_discover_tab');
                return savedTab;
            }
            return 'Showcase';
        }); 
        const [localCountdown, setLocalCountdown] = useState('SYNCING...');

    // --- UNIFIED ACCESS CONTROL FUNCTION (Host Allowed) ---
    const hasAccess = (eventToCheck) => {
        const event = eventToCheck || masterEventDetails;
        if (!event) return false;

        // Rule 0: The Creator/Host of the watch party always has access.
        const isHostUser = currentUser && (
            event.creatorId === currentUser.uid || 
            event.userId === currentUser.uid || 
            event.suggestedBy === currentUser.uid
        );
        if (isHostUser) return true;

        // Rule 1: Moderators always have access.
        if (creatorProfile?.role === 'super_admin' || creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority') return true;
        if (creatorProfile?.premiumExpiresAt?.toDate() > new Date()) return true;

        // RULE 1.5: "Now Showing: Free" Bypass. Grants instant access to logged-in users regardless of ticket price.
        if (event.isNowShowingFree) return !!currentUser;

        // Rule 2: For a FREE event, requirement is to be logged in.
        if (!event.isTicketed) {
            return !!currentUser;
        }

        // Rule 3: For a TICKETED event, you must have a specific ticket.
        if (event.isTicketed) {
            if (!currentUser) return false;
            return !!creatorProfile.purchasedTickets?.[event.id];
        }

        return false;
    };

    const isEventLive = masterEventDetails?.status === 'live';

   // THE FIX: Define isMod in the component scope so useMemo can track it correctly
    const isModUser = creatorProfile?.role === 'super_admin' || creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority';


    // --- DEEP LINK HANDLING EFFECT ---
    useEffect(() => {
        if (deepLinkedReplayId && currentUser !== undefined) { 
            const fetchAndPlayReplay = async () => {
                showMessage("Loading shared replay...");
                const replayRef = doc(db, "events", deepLinkedReplayId);
                const replaySnap = await getDoc(replayRef);

                if (replaySnap.exists() && replaySnap.data().status === 'completed') {
                    const replayData = { id: replaySnap.id, ...replaySnap.data() };
                    if (hasAccess(replayData)) {
                        handleVideoPress(replayData.liveStreamUrl || replayData.embedUrl || replayData.mainUrl, replayData);
                    } else {
                        if (!currentUser) {
                            showMessage("This is an exclusive replay. Please log in to see if you have access.");
                            setActiveScreen('Login');
                        } else if (replayData.isTicketed) {
                             showMessage("You need a valid ticket for this event to watch the replay.");
                        } else {
                            showMessage("You do not have permission to view this replay.");
                        }
                    }
                } else {
                    showMessage("The shared replay could not be found.");
                }
            };
            fetchAndPlayReplay();
        }
    }, [deepLinkedReplayId, currentUser, creatorProfile]); 
    
    // THE FIX: Immediately loads the specific room waiting area if redirected from the Header Banner
        // THE FIX: Immediately initializes state based on storage to prevent auto-loading the live stream on mount
        const [selectedEventId, setSelectedEventId] = useState(() => {
            const saved = sessionStorage.getItem('nva_target_premiere_event_id');
            if (saved === 'none') return null;
            return saved || null;
        });

        useEffect(() => {
            const savedEvent = sessionStorage.getItem('nva_target_premiere_event_id');
            if (savedEvent && activeTab === 'Premieres') {
                if (savedEvent === 'none') {
                    setSelectedEventId(null);
                } else {
                    setSelectedEventId(savedEvent);
                }
                // We keep the 'none' flag in storage slightly longer to block the liveEvent effect below
                setTimeout(() => { sessionStorage.removeItem('nva_target_premiere_event_id'); }, 500);
            }
        }, [activeTab]);

        useEffect(() => {
            // THE FIX: Bulletproof block against global live events hijacking the Multiplex Lobby
            const targetId = sessionStorage.getItem('nva_target_premiere_event_id');
            const isLobbyRequested = targetId === 'none';
            
            if (liveEvent?.eventId && !isLobbyRequested && !selectedEventId) {
                setSelectedEventId(liveEvent.eventId);
            }
        }, [liveEvent, selectedEventId]);

    useEffect(() => {
        const handleSetEvent = (e) => {
            if (e.detail?.eventId) {
                setSelectedEventId(e.detail.eventId);
            }
        };
        window.addEventListener('setPremiereActiveEvent', handleSetEvent);
        return () => window.removeEventListener('setPremiereActiveEvent', handleSetEvent);
    }, []);

    useEffect(() => {
        let fallbackUnsub = () => {};
        if (selectedEventId) {
            const unsubscribeEvents = onSnapshot(doc(db, "events", selectedEventId), (eventSnap) => {
                if (eventSnap.exists()) {
                    setMasterEventDetails({ id: eventSnap.id, ...eventSnap.data() });
                } else {
                    fallbackUnsub = onSnapshot(doc(db, "movies", selectedEventId), (movieSnap) => {
                        if (movieSnap.exists()) {
                            const movieData = movieSnap.data();
                            setMasterEventDetails({ 
                                id: movieSnap.id, 
                                eventTitle: movieData.title,
                                eventDescription: movieData.synopsis,
                                liveStreamUrl: movieData.videoUrl,
                                thumbnailUrl: movieData.posterUrl,
                                ticketPrice: movieData.ticketPrice,
                                scheduledStartTime: movieData.premiereDate,
                                isTicketed: movieData.type === 'premiere',
                                room: movieData.room,
                                creatorName: movieData.suggestedByName || "Director",
                                status: movieData.type === 'premiere' ? 'upcoming' : 'completed', // THE FIX: Force injects status to prevent falling into dead layout
                                ...movieData 
                            });
                        } else {
                            setMasterEventDetails(null);
                        }
                    });
                }
            });
            return () => { unsubscribeEvents(); fallbackUnsub(); };
        } else {
            setMasterEventDetails(null);
        }
    }, [selectedEventId, currentUser, creatorProfile]);

    // THE FIX: Dedicated Ticking Timer for the Waiting Room (Eliminates "SYNCING...")
    useEffect(() => {
        if (!masterEventDetails) return;
        
        // If the event isn't upcoming, don't show the syncing state
        if (masterEventDetails.status !== 'upcoming') {
            setLocalCountdown(masterEventDetails.status?.toUpperCase() || '...READY');
        }

        if (masterEventDetails.status === 'upcoming' && masterEventDetails.scheduledStartTime) {
            const target = masterEventDetails.scheduledStartTime.toMillis ? masterEventDetails.scheduledStartTime.toMillis() : new Date(masterEventDetails.scheduledStartTime).getTime();
            const updateTimer = () => {
                const diff = target - Date.now();
                if (diff <= 0) setLocalCountdown('LIVE NOW!');
                else {
                    const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                    const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
                    const m = Math.floor((diff / 1000 / 60) % 60);
                    const s = Math.floor((diff / 1000) % 60);
                    setLocalCountdown(`${d > 0 ? d + 'd ' : ''}${h}h ${m}m ${s}s`);
                }
            };
            updateTimer();
            const interval = setInterval(updateTimer, 1000);
            return () => clearInterval(interval);
        }
    }, [masterEventDetails]);

    useEffect(() => {
        const categoriesRef = collection(db, "content_categories");
        const q = query(categoriesRef, where("isActive", "==", true), orderBy("orderIndex", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoadingCategories(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const eventsRef = collection(db, "events");
        const q = query(eventsRef, where("status", "==", "completed"), orderBy("scheduledEndTime", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setPastEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        }, (error) => {
            console.error("Error fetching past events: ", error);
            showMessage("Failed to load past events.");
        });
        return () => unsubscribe();
    }, []);

    const [isFetching, setIsFetching] = useState(false);
    const PAGE_SIZE = 12;

    const fetchVODData = async (loadMore = false) => {
        if (isFetching) return;
        setIsFetching(true);
        if (!loadMore) {
            setLoadingContent(true);
            setContent([]);
            setLastDoc(null);
        }

        try {
            const collectionRef = collection(db, 'artifacts/production-app-id/public/data/content_items');
            const constraints = [
                where('contentType', '==', activeCategory),
                where('isActive', '==', true)
            ];

            if (searchTerm) {
                const searchTermLower = searchTerm.toLowerCase();
                constraints.push(where("title_lowercase", ">=", searchTermLower));
                constraints.push(where("title_lowercase", "<=", searchTermLower + '\uf8ff'));
            }
            
            constraints.push(orderBy("title_lowercase", "asc"));
            
            if (loadMore && lastDoc) {
                constraints.push(startAfter(lastDoc));
            }
            constraints.push(limit(PAGE_SIZE));

            const q = query(collectionRef, ...constraints);
            const snapshot = await getDocs(q);
            const newData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

            setContent(prev => loadMore ? [...prev, ...newData] : newData);
            setHasMore(newData.length === PAGE_SIZE);
            if (snapshot.docs.length > 0) {
                setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
            }
        } catch (error) {
            console.error("Error fetching VOD data:", error);
            showMessage("Failed to load content.");
        } finally {
            setLoadingContent(false);
            setIsFetching(false);
        }
    };
    
    useEffect(() => {
        if (activeCategory && activeCategory !== 'Live Premieres') {
            fetchVODData(false);
        }
    }, [activeCategory, searchTerm]);

    const handleSearch = () => {
        setSearchTerm(searchInput);
    };

    const handleClearSearch = () => {
        setSearchInput('');
        setSearchTerm('');
    };

    // --- NVA ACTIVE PRESENCE BRIDGE ($0 COST) ---
    // Tracks active viewers in Realtime Database and cleans up automatically on tab close/disconnect
    useEffect(() => {
        if (!masterEventDetails?.id || masterEventDetails.status !== 'live' || !currentUser) return;

        const dbRT = getDatabase();
        const viewerRef = ref(dbRT, `live_sessions/${masterEventDetails.id}/${currentUser.uid}`);

        // Set presence on mount
        set(viewerRef, {
            name: creatorProfile?.creatorName || currentUser.displayName || 'Guest',
            timestamp: serverTimestamp()
        });

        // The Magic: Automatically removes them from the count if they kill the app or lose connection
        onDisconnect(viewerRef).remove();

        const totalCountRef = ref(dbRT, `live_sessions/${masterEventDetails.id}`);
        const unsub = onValue(totalCountRef, (snapshot) => {
            const count = snapshot.exists() ? Object.keys(snapshot.val()).length : 1;
            setMasterEventDetails(prev => prev ? ({ ...prev, totalViewCount: count }) : null);
        });

        return () => { 
            remove(viewerRef); 
            unsub(); 
        };
    }, [masterEventDetails?.id, masterEventDetails?.status, !!currentUser]); 

    useEffect(() => {
        if (!masterEventDetails?.id || !currentUser?.uid) return;

        const likeRef = doc(db, `events/${masterEventDetails.id}/likes`, currentUser.uid);
        const unsubscribe = onSnapshot(likeRef, (docSnap) => {
            setHasLiked(docSnap.exists());
        });

        return () => unsubscribe();
    }, [masterEventDetails?.id, currentUser?.uid]);

    const handleLike = async () => {
        if (isLiking || !masterEventDetails?.id || !currentUser) return;
        setIsLiking(true);

        const originalHasLiked = hasLiked;
        const originalLikeCount = masterEventDetails.likeCount || 0;

        setHasLiked(!originalHasLiked);
        setMasterEventDetails(prevDetails => ({
            ...prevDetails,
            likeCount: originalHasLiked ? originalLikeCount - 1 : originalLikeCount + 1
        }));

        try {
            const likeFunction = httpsCallable(functions, 'likeLiveEvent');
            await likeFunction({ eventId: masterEventDetails.id });
        } catch (error) {
            console.error("Error liking event:", error);
            showMessage("There was an error liking the event.");
            setHasLiked(originalHasLiked);
            setMasterEventDetails(prevDetails => ({
                ...prevDetails,
                likeCount: originalLikeCount
             }));
        } finally {
            setIsLiking(false);
        }
    };

    const handleToggleChat = async () => {
        if (!masterEventDetails?.id || !currentUser) return;
        const isModerator = creatorProfile?.role === 'super_admin' || creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority';
        if (!isModerator) {
            showMessage("You do not have permission to change chat settings.");
            return;
        }

        const newChatStatus = !(masterEventDetails.isChatEnabled !== false); 
        showMessage(`Setting chat to ${newChatStatus ? 'enabled' : 'disabled'}...`);

        try {
            const toggleChatFunction = httpsCallable(functions, 'toggleEventChat');
            await toggleChatFunction({
                eventId: masterEventDetails.id,
                isChatEnabled: newChatStatus
            });
            showMessage(`Chat is now ${newChatStatus ? 'enabled' : 'disabled'}.`);
        } catch (error) {
            console.error("Error toggling chat:", error);
            showMessage(`Error: ${error.message}`);
        }
    };

    // --- EVENT HANDLERS ---
    const handleCategoryClick = (categoryName) => {
        if (!currentUser && categoryName !== 'Live Premieres') {
            showMessage("Please log in to discover more content."); return;
        }
        setActiveCategory(categoryName);
        setShowMore(false);
    };

    const handleContentItemClick = (item) => {
        // --- 0-COST LOCAL AFFINITY TRACKING ---
        try {
            if (item.contentType) {
                const affinityKey = `nva_affinity_${currentUser?.uid || 'guest'}`;
                const scores = JSON.parse(localStorage.getItem(affinityKey) || '{}');
                scores[item.contentType] = (scores[item.contentType] || 0) + 1; // Add +1 point to this genre
                localStorage.setItem(affinityKey, JSON.stringify(scores));
            }
        } catch (e) { console.error("Affinity error", e); }

        if (hasAccess(item)) {
            handleVideoPress(item.liveStreamUrl || item.embedUrl || item.mainUrl, item);
        } else {
            // If access is denied, show the appropriate message.
            if (!currentUser) {
                showMessage("Please log in to see if you have access to this content.");
                setActiveScreen('Login');
            } else if (item.isTicketed) {
                const message = item.status === 'completed' ? "You need a ticket for this event to watch the replay." : "You need a ticket to join this live event.";
                showMessage(message);
            } else {
                showMessage("You do not have the required permissions to view this content.");
            }
        }
    };

    // (renderPremiereContent block successfully removed to clean floating dust memory)

    // --- UPCOMING PREMIERES ENGINE & LAZY PURGE ($0 Cost Automation) ---
    const [upcomingPremieres, setUpcomingPremieres] = useState([]);

    useEffect(() => {
        // THE FIX: Removed the "isTicketed" restriction so Admin-created Free Events show up in the Multiplex Lobby alongside paid Watch Parties.
        const q = query(collection(db, "events"), where("status", "in", ["upcoming", "live"]));
        const unsub = onSnapshot(q, async (snap) => {
            const now = Date.now();
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
            const twentyFourHoursMs = 24 * 60 * 60 * 1000;
            const twoHoursMs = 2 * 60 * 60 * 1000; 
            const validPremieres = [];
            
            const parseTime = (t) => {
                if (!t) return 0;
                if (t.toMillis) return t.toMillis();
                if (t.seconds) return t.seconds * 1000;
                const parsed = new Date(t).getTime();
                return isNaN(parsed) ? 0 : parsed;
            };

            for (const docSnap of snap.docs) {
                const data = docSnap.data();
                
                const pTime = parseTime(data.scheduledStartTime);
                const appTime = data.createdAt ? new Date(data.createdAt).getTime() : now;
                
                // 1. 7-Day Hard Purge
                if (pTime > 0 && (now - pTime) > sevenDaysMs) {
                    try { 
                        await deleteDoc(doc(db, "events", docSnap.id)); 
                        await deleteDoc(doc(db, "movies", docSnap.id)); 
                    } catch(e) {}
                    continue;
                }

                // 2. 24-Hour Lazy Purge (Bypassed if newly approved for testing)
                if (pTime > 0 && pTime - now <= twentyFourHoursMs && pTime > now) {
                    if (now - appTime > twoHoursMs) {
                        if (!data.ticketsSold || data.ticketsSold === 0) {
                            try {
                                await deleteDoc(doc(db, "events", docSnap.id));
                                await deleteDoc(doc(db, "movies", docSnap.id));
                            } catch(e) {}
                            continue;
                        }
                    }
                }
                
                // Map event fields to match movie layout expectation
                validPremieres.push({ 
                    id: docSnap.id, 
                    title: data.eventTitle,
                    posterUrl: data.thumbnailUrl,
                    premiereDate: data.scheduledStartTime,
                    extractedTimeMs: pTime,
                    ...data 
                });
            }
            
            // Sort by earliest upcoming date first
            // THE FIX: Prioritizes active Live events first, then sorts upcoming by least time remaining
            validPremieres.sort((a, b) => {
                if (a.status === 'live' && b.status !== 'live') return -1;
                if (b.status === 'live' && a.status !== 'live') return 1;
                return (a.extractedTimeMs || 0) - (b.extractedTimeMs || 0);
            });
            setUpcomingPremieres(validPremieres);
        });
        return () => unsub();
    }, []);

    // --- UNIFIED GLOBAL SHOWCASE ENGINE STATE ---
    const [showcaseItems, setShowcaseItems] = useState([]);
    const [lastShowcaseDoc, setLastShowcaseDoc] = useState(null);
    const [loadingShowcase, setLoadingShowcase] = useState(false);
    const [hasMoreShowcase, setHasMoreShowcase] = useState(true);
    
    // THE FIX: In-Memory Filter State for Showcase Feed
    const [showcaseFilter, setShowcaseFilter] = useState('All');
    const [showcaseSearch, setShowcaseSearch] = useState(''); // NEW: Search state for Showcase content

    // --- DISCOVERY STATE SYSTEM ---
    const [communitySubTab, setCommunitySubTab] = useState('Feed'); // Controls the sub-tabs
    const [leaderboard, setLeaderboard] = useState([]);
    const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
    
    // Lazy-loaded timeline state to protect Firebase write/read metrics [3.5]
    const [followingFeed, setFollowingFeed] = useState([]);
    const [loadingFollowing, setLoadingFollowing] = useState(false);

    // Dynamic Deep-Link Tab Switcher
    useEffect(() => {
        if (deepLinkedReplayId) {
            setActiveTab('Premieres'); // Force focus on Premieres tab for stream VOD
        }
    }, [deepLinkedReplayId]);

    // Lazy load following timeline strictly when Community -> Feed is active
    useEffect(() => {
        if (activeTab === 'Community' && communitySubTab === 'Feed' && currentUser) {
            setLoadingFollowing(true);
            const fetchFollowingFeed = async () => {
                try {
                    const followingRef = collection(db, "creators", currentUser.uid, "following");
                    const followingSnap = await getDocs(followingRef);
                    const followedIds = followingSnap.docs.map(doc => doc.id);

                    if (followedIds.length === 0) {
                        setFollowingFeed([]);
                        setLoadingFollowing(false);
                        return;
                    }

                    const itemsRef = collection(db, 'artifacts/production-app-id/public/data/content_items');
                    const q = query(
                        itemsRef, 
                        where('userId', 'in', followedIds.slice(0, 10)),
                        where('isActive', '==', true),
                        orderBy('createdAt', 'desc'),
                        limit(15)
                    );
                    const feedSnap = await getDocs(q);
                    setFollowingFeed(feedSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                } catch (err) {
                    console.error("Following feed fetch failure:", err);
                    showMessage("Error fetching following feed.");
                } finally {
                    setLoadingFollowing(false);
                }
            };
            fetchFollowingFeed();
        }
    }, [activeTab, communitySubTab, currentUser]);

    // Fetch Leaderboards only when Community -> Leaderboard is active
    useEffect(() => {
        if (activeTab === 'Community' && communitySubTab === 'Leaderboard') {
            setLoadingLeaderboard(true);
            const creatorsRef = collection(db, "creators");
            const q = query(creatorsRef, orderBy("voteCount", "desc"), limit(10));
            
            const unsubscribe = onSnapshot(q, (snapshot) => {
                setLeaderboard(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
                setLoadingLeaderboard(false);
            }, (error) => {
                console.error("Leaderboard fetch failed:", error);
                setLoadingLeaderboard(false);
            });
            return () => unsubscribe();
        }
    }, [activeTab, communitySubTab]);

    // --- SHOWCASE ENGINE: DIRECT PIPELINE FETCH ---
    const fetchShowcase = async (isLoadMore = false) => {
        if (loadingShowcase || (!hasMoreShowcase && isLoadMore)) return;
        setLoadingShowcase(true);

        try {
            const showcaseRef = collection(db, 'artifacts/production-app-id/public/data/content_items');
            let q = query(
                showcaseRef,
                where('isActive', '==', true), // Restores query so all live content returns
                orderBy('createdAt', 'desc'),
                limit(12)
            );

            if (isLoadMore && lastShowcaseDoc) {
                q = query(q, startAfter(lastShowcaseDoc));
            }

            const snap = await getDocs(q);
            const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            setShowcaseItems(prev => {
                const combined = isLoadMore ? [...prev, ...items] : items;
                // SECTION 2.0: Client-Side Memory Cap (60 items)
                return combined.length > 60 ? combined.slice(-48) : combined;
            });

            setLastShowcaseDoc(snap.docs[snap.docs.length - 1] || null);
            setHasMoreShowcase(snap.docs.length === 12);
        } catch (err) {
            console.error("Showcase Error:", err);
        } finally {
            setLoadingShowcase(false);
        }
    };

    // Trigger Showcase on tab switch
    useEffect(() => {
        if (activeTab === 'Showcase' && showcaseItems.length === 0) {
            fetchShowcase();
        }
    }, [activeTab]);

    // THE FIX: Move listener logic out of JSX to prevent "Unexpected Token" errors
    useEffect(() => {
        const handleSwitch = (e) => setActiveTab(e.detail);
        window.addEventListener('switchDiscoverTab', handleSwitch);
        return () => window.removeEventListener('switchDiscoverTab', handleSwitch);
    }, []);

    // THE FIX: Move listener logic to component body to prevent JSX syntax errors
    useEffect(() => {
        const handleSwitch = (e) => setActiveTab(e.detail);
        window.addEventListener('switchDiscoverTab', handleSwitch);
        return () => window.removeEventListener('switchDiscoverTab', handleSwitch);
    }, []);

    return (
        <div className="screenContainer" ref={showcaseTopRef} style={{ 
            paddingBottom: masterEventDetails?.status === 'live' ? '0px' : '140px', 
            paddingTop: masterEventDetails?.status === 'live' ? '0px' : '5px',
            display: activeTab === 'Premieres' ? 'flex' : 'block',
            flexDirection: 'column',
            flex: activeTab === 'Premieres' ? 1 : 'none',
            minHeight: 0
        }}>
            <style>{`
                .showcase-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 40px; }
                @media (max-width: 1024px) { .showcase-grid { grid-template-columns: repeat(2, 1fr); } }
                @media (max-width: 768px) { .showcase-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; } }

                .showcase-card { background: #000; border: 1px solid #1A1A1A; border-radius: 12px; overflow: hidden; transition: transform 0.2s ease; cursor: pointer; }
                .showcase-card:active { transform: scale(0.98); }
                
                .showcase-media { width: 100%; aspect-ratio: 16/9; background: #0a0a0a; display: flex; alignItems: center; justify-content: center; position: relative; }
                .showcase-media img { width: 100%; height: 100%; object-fit: contain; }
                
                .showcase-play-overlay { position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; opacity: 0; transition: opacity 0.2s; }
                .showcase-card:hover .showcase-play-overlay { opacity: 1; }

                .showcase-info { padding: 15px; }
                .showcase-title { font-size: 16px; font-weight: 800; color: #FFF; margin: 0 0 4px 0; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
                .showcase-creator { font-size: 13px; color: #888; margin-bottom: 12px; display: flex; align-items: center; gap: 6px; }
                .showcase-badge { background: #FFD700; color: #000; font-size: 9px; font-weight: 900; padding: 2px 6px; border-radius: 4px; text-transform: uppercase; }

                .showcase-metrics { display: flex; gap: 15px; border-top: 1px solid #111; padding-top: 10px; }
                .metric-node { display: flex; align-items: center; gap: 5px; color: #666; font-size: 12px; }
                .metric-node svg { width: 14px; height: 14px; fill: currentColor; }

                .caught-up-anchor { text-align: center; padding: 40px 0; border-top: 1px dashed #222; margin-top: 20px; }
                .back-to-top { color: #00FFFF; font-weight: 800; cursor: pointer; text-decoration: underline; font-size: 14px; }
            `}</style>
            {/* --- The High-Fidelity 6-Tab Workspace Filter Bar --- */}
            <style>{`
                .categoryTabs::-webkit-scrollbar { display: none; }
                .tab-scroll-indicator { 
                    position: relative; 
                    margin-bottom: 20px; 
                }
                .tab-scroll-indicator::after {
                    content: ''; position: absolute; top: 0; right: 0; width: 40px; height: 100%;
                    background: linear-gradient(90deg, transparent, #000); pointer-events: none;
                }
            `}</style>
            {/* THE FIX: Hides top navigation during live playback to maximize theater space */}
            {masterEventDetails?.status !== 'live' ? (
                <div className="tab-scroll-indicator">
                    <div className="categoryTabs" style={{
                        display: 'flex',
                        alignItems: 'center',
                        backgroundColor: '#000',
                        padding: '4px',
                        borderRadius: '10px',
                        border: '1px solid #1A1A1A',
                        overflowX: 'auto',
                        whiteSpace: 'nowrap',
                        gap: '6px',
                        scrollbarWidth: 'none',
                        WebkitOverflowScrolling: 'touch'
                    }}>
                        {['Showcase', 'Premieres', 'Casting', 'Community'].map((tab) => (
                            <button 
                                key={tab} 
                                onClick={() => {
                                    if (!currentUser && tab !== 'Showcase' && tab !== 'Premieres') {
                                        showMessage("Please log in to access this tab.");
                                        return;
                                    }
                                    if (tab === 'Premieres') {
                                        sessionStorage.setItem('nva_target_premiere_event_id', 'none');
                                        setSelectedEventId(null);
                                    }
                                    setActiveTab(tab);
                                }}
                                style={{
                                    flex: '1',
                                    minWidth: '85px',
                                    padding: '8px 4px',
                                    backgroundColor: activeTab === tab ? 'rgba(0, 255, 255, 0.08)' : 'transparent',
                                    borderRadius: '6px',
                                    border: activeTab === tab ? '1px solid #00FFFF' : '1px solid transparent',
                                    boxShadow: activeTab === tab ? '0 0 12px rgba(0, 255, 255, 0.2)' : 'none',
                                    transition: 'all 0.2s ease',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    justifyContent: 'center',
                                    alignItems: 'center'
                                }}
                            >
                                <span style={{
                                    color: activeTab === tab ? '#00FFFF' : '#666',
                                    fontSize: '10px', 
                                    fontWeight: '900',
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px'
                                }}>
                                    {tab}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            ) : null}

            {/* ==================== TAB 1: GLOBAL SHOWCASE (MEDIA LIBRARY) ==================== */}
            <div className="tabContent" style={{ 
                display: activeTab === 'Showcase' ? 'block' : 'none', 
                animation: activeTab === 'Showcase' ? 'fadeIn 0.3s ease' : 'none' 
            }}>
                    {/* Subtle, high-contrast sub-label for Showcase */}
                    <p style={{ color: '#888', fontSize: '12px', margin: '-10px 0 20px 0', lineHeight: '1.4' }}>
                        🍿 Welcome to the VOD Library. Stream original indie productions and send direct financial <strong>Donations</strong> to support monetized creators.
                    </p>
                    
                    {/* THE FIX: Unified Dropdown + Search Bar for Showcase */}
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '25px', flexWrap: 'wrap' }}>
                        {/* NEW: Text Search Bar */}
                        <div style={{ position: 'relative', flex: 1, minWidth: '180px', maxWidth: '300px' }}>
                            <input 
                                type="text"
                                placeholder="Search titles or creators..."
                                value={showcaseSearch}
                                onChange={(e) => setShowcaseSearch(e.target.value)}
                                style={{
                                    width: '100%', padding: '8px 15px', borderRadius: '20px',
                                    backgroundColor: '#1A1A1A', color: '#FFF',
                                    border: '1px solid #333', fontWeight: 'normal', fontSize: '14px', outline: 'none'
                                }}
                            />
                        </div>

                        <div style={{ position: 'relative', flex: 1, minWidth: '160px', maxWidth: '220px' }}>
                            <select 
                                value={showcaseFilter}
                                onChange={(e) => setShowcaseFilter(e.target.value)}
                                style={{
                                    width: '100%', padding: '8px 35px 8px 15px', borderRadius: '20px',
                                    backgroundColor: showcaseFilter !== 'All' ? 'rgba(255, 215, 0, 0.1)' : '#1A1A1A',
                                    color: showcaseFilter !== 'All' ? '#FFD700' : '#FFF',
                                    border: '1px solid', borderColor: showcaseFilter !== 'All' ? '#FFD700' : '#333',
                                    fontWeight: 'bold', fontSize: '14px', cursor: 'pointer',
                                    appearance: 'none', outline: 'none'
                                }}
                            >
                                <option value="All">All Categories</option>
                                {/* THE FIX: Dynamically maps database categories while excluding system-level Live categories to match Admin/Library 1:1 */}
                                {categories
                                    .filter(cat => cat.name !== 'Live Premieres' && cat.name !== 'Live Feed')
                                    .map(cat => (
                                        <option key={cat.id} value={cat.name} style={{ backgroundColor: '#111', color: '#FFF' }}>
                                            {cat.name}
                                        </option>
                                    ))
                                }
                            </select>
                            <svg viewBox="0 0 24 24" style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', width: '18px', height: '18px', fill: showcaseFilter !== 'All' ? '#FFD700' : '#888', pointerEvents: 'none' }}>
                                <path d="M7 10l5 5 5-5z" />
                            </svg>
                        </div>
                    </div>

                    {/* THE FIX: Combined Content Genre Search Pipeline with ZERO-COST AFFINITY ALGORITHM */}
                    {(() => {
                        const search = showcaseSearch.toLowerCase();
                        const term = showcaseFilter.toLowerCase();
                        
                        // 1. Run the standard filters
                        const filtered = showcaseItems.filter(item => {
                            const matchesSearch = search === '' || (item.title || '').toLowerCase().includes(search) || (item.creatorName || '').toLowerCase().includes(search);
                            const matchesDropdown = showcaseFilter === 'All' || (item.category || item.contentType || '').toLowerCase().includes(term) || (item.creatorRole || '').toLowerCase().includes(term) || (Array.isArray(item.tags) ? item.tags.some(t => (t || '').toLowerCase().includes(term)) : false);
                            return matchesSearch && matchesDropdown;
                        });

                        // 2. Retrieve local affinity scores for $0 AI
                        let scores = {};
                        try {
                            const affinityKey = `nva_affinity_${currentUser?.uid || 'guest'}`;
                            scores = JSON.parse(localStorage.getItem(affinityKey) || '{}');
                        } catch (e) {}

                        // 3. Separate top 3 affinity items if no search is active
                        let forYouItems = [];
                        let standardItems = filtered;

                        if (search === '' && showcaseFilter === 'All' && Object.keys(scores).length > 0) {
                            const sortedByAffinity = [...filtered].sort((a, b) => (scores[b.contentType] || 0) - (scores[a.contentType] || 0));
                            // REVERTED AGGRESSION: Now requires at least 5 organic views of a category before suggesting it
                            forYouItems = sortedByAffinity.filter(item => (scores[item.contentType] || 0) >= 5).slice(0, 3);
                            
                            const forYouIds = new Set(forYouItems.map(i => i.id));
                            standardItems = filtered.filter(item => !forYouIds.has(item.id));
                        }

                        // Reusable Card Renderer
                        const renderCard = (item, isForYou = false) => (
                            <div key={item.id} className="showcase-card" onClick={() => handleContentItemClick(item)} style={isForYou ? { border: '1px solid #00FFFF', boxShadow: '0 0 15px rgba(0,255,255,0.1)' } : {}}>
                                <div className="showcase-media">
                                    <img src={item.customThumbnailUrl || item.imageUrl || 'https://placehold.co/400x225/0a0a0a/333?text=NVA'} alt={item.title} />
                                    <div className="showcase-play-overlay">
                                        <svg width="40" height="40" viewBox="0 0 24 24" fill="#FFF"><path d="M8 5v14l11-7z"/></svg>
                                    </div>
                                    {isForYou && <div style={{ position: 'absolute', top: '8px', left: '8px', background: '#00FFFF', color: '#000', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', boxShadow: '0 0 10px rgba(0,255,255,0.5)' }}>✨ For You</div>}
                                </div>
                                <div className="showcase-info">
                                    <p className="showcase-title">{item.title}</p>
                                    <div className="showcase-creator" style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                                        by {item.creatorName || 'NVA Artist'}
                                        {item.creatorRole && <span className="showcase-badge" style={{ background: '#333', color: '#FFF' }}>{item.creatorRole}</span>}
                                        {item.monetizationStatus === 'approved' && <span className="showcase-badge" style={{ background: 'linear-gradient(to right, #BF953F, #FCF6BA, #B38728)', color: '#000', fontSize: '9px', fontWeight: '900', boxShadow: '0 0 8px rgba(191, 149, 63, 0.4)' }}>🎁 Monetized</span>}
                                    </div>
                                    <div className="showcase-metrics">
                                        <div className="metric-node">
                                            <svg viewBox="0 0 24 24"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
                                            {item.viewCount || 0}
                                        </div>
                                        <div className="metric-node">
                                            <svg viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
                                            {item.likeCount || 0}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );

                        return (
                            <>
                                {forYouItems.length > 0 && (
                                    <>
                                        <p style={{ color: '#00FFFF', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 15px 0', fontSize: '13px' }}>✨ Recommended For You</p>
                                        <div className="showcase-grid" style={{ marginBottom: '20px' }}>
                                            {forYouItems.map(item => renderCard(item, true))}
                                        </div>
                                        <hr style={{ border: 'none', borderTop: '1px dashed #333', margin: '0 0 30px 0' }} />
                                    </>
                                )}
                                <div className="showcase-grid">
                                    {standardItems.map(item => renderCard(item, false))}
                                </div>
                            </>
                        );
                    })()}

                    {loadingShowcase && <p style={{ textAlign: 'center', color: '#FFD700' }}>Loading more inspiration...</p>}

                    {!loadingShowcase && hasMoreShowcase && (
                        <button 
                            className="button" 
                            style={{ margin: '0 auto 40px auto', display: 'block', backgroundColor: '#1A1A1A', border: '1px solid #333' }}
                            onClick={() => fetchShowcase(true)}
                        >
                            Load More
                        </button>
                    )}

                    {!hasMoreShowcase && showcaseItems.length > 0 && (
                        <div className="caught-up-anchor">
                            <p style={{ color: '#666', margin: '0 0 10px 0' }}>✨ You're all caught up!</p>
                            <span className="back-to-top" onClick={() => showcaseTopRef.current?.scrollIntoView({ behavior: 'smooth' })}>
                                [ ⬆️ Back to Top ]
                            </span>
                        </div>
                    )}
                </div>

            {/* ==================== TAB 3: PREMIERES (MULTIPLEX LOBBY & WAITING ROOM) ==================== */}
        <div className="tabContent" style={{ 
            display: activeTab === 'Premieres' ? 'flex' : 'none',
            flexDirection: 'column',
            flex: activeTab === 'Premieres' ? 1 : 0,
            minHeight: 0,
            animation: activeTab === 'Premieres' ? 'fadeIn 0.3s ease' : 'none'
        }}>
                
                {/* --- STATE 1: SPECIFIC EVENT SELECTED (WAITING ROOM OR LIVE PLAYER) --- */}
                {masterEventDetails ? (
                    <div style={{ marginBottom: masterEventDetails.status === 'live' ? '0px' : '30px', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
                        {masterEventDetails.status === 'live' && (
                            <style>{`
                                .container { padding-bottom: 0px !important; }
                                .navigationBar { display: none !important; }
                            `}</style>
                        )}
                        {/* THE FIX: Button ONLY shows in Waiting Room. In Live Mode, it is deleted to save space. */}
                        {masterEventDetails && masterEventDetails.status !== 'live' && (
                            <button className="topButton"
                                onClick={() => {
                                    // THE FIX: Resets to lobby and sets the 'none' flag to prevent live hijack
                                    sessionStorage.setItem('nva_target_premiere_event_id', 'none');
                                    setSelectedEventId(null);
                                }} 
                                style={{ backgroundColor: '#3A3A3A', color: '#FFF', marginBottom: '20px', border: '1px solid #555', alignSelf: 'flex-start' }}>
                                ← Back to Multiplex Lobby
                            </button>
                        )}
                        
                        {masterEventDetails.status === 'live' ? (
                            <>
                                <style>{`
                                    .live-layout-container {
                                        display: flex;
                                        flex-direction: column;
                                        width: 100%;
                                        flex: 1;
                                        min-height: 0;
                                        margin: 0 auto;
                                        max-width: 900px;
                                        gap: 0px;
                                        overflow: hidden;
                                        position: relative;
                                    }
                                    .live-layout-video-section {
                                        flex: 0 0 auto;
                                        width: 100%;
                                    }
                                    .live-video-wrapper {
                                        width: 100%;
                                        max-height: 40vh; /* Prevents video from consuming mobile screen */
                                        aspect-ratio: 16/9;
                                        margin: 0 auto;
                                    }
                                    .live-layout-chat-section {
                                        /* THE FIX: Clean flex-basis 0 allows pure remaining-space consumption */
                                        flex: 1 1 0; 
                                        min-height: 0;
                                        display: flex;
                                        flex-direction: column;
                                        width: 100%;
                                        background-color: #000;
                                        border-radius: 0px; 
                                        overflow: hidden;
                                        border: 1px solid #1A1A1A;
                                    }

                                    /* TABLET & DESKTOP SHIFT: Snaps chat to the right side automatically */
                                    @media (min-width: 850px) {
                                        .live-layout-container {
                                            flex-direction: row;
                                            max-width: 1300px; 
                                            height: 100%; 
                                            align-items: stretch; 
                                            gap: 15px;
                                        }
                                        .live-layout-video-section {
                                            flex: 1 1 65%; 
                                            max-width: 65%;
                                            display: flex;
                                            flex-direction: column;
                                        }
                                        .live-video-wrapper {
                                            max-width: 100%; 
                                            max-height: none;
                                        }
                                        .live-layout-chat-section {
                                            flex: 1 1 35%; 
                                            max-width: 35%;
                                            min-width: 320px;
                                        }
                                    }
                                `}</style>
                                
                                {/* THE FIX: CSS Media queries automatically shift layout to side-by-side on wide screens. */}
                                <style>{`
                                    @keyframes floatUpLike {
                                        0% { opacity: 1; transform: translateY(0) scale(1); }
                                        100% { opacity: 0; transform: translateY(-80px) scale(1.4); }
                                    }
                                `}</style>
                                <div className="live-layout-container">
                                    {/* THE FIX: Floating Back Button Overlay - does not disrupt flex layout */}
                                    <button 
                                        onClick={() => {
                                            sessionStorage.setItem('nva_target_premiere_event_id', 'none');
                                            setSelectedEventId(null);
                                        }}
                                        style={{ position: 'absolute', top: '10px', left: '10px', zIndex: 100, backgroundColor: 'rgba(0,0,0,0.7)', color: '#FFF', border: '1px solid rgba(255,255,255,0.2)', borderRadius: '20px', padding: '6px 14px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', backdropFilter: 'blur(4px)' }}
                                    >
                                        ← Back
                                    </button>
                                    <div className="live-layout-video-section" style={{ position: 'relative' }}>
                                        {hasAccess() ? (
                                            <>
                                                <div className="bg-black md:rounded-lg overflow-hidden live-video-wrapper" style={{ position: 'relative' }}>
                                                    {(masterEventDetails.liveStreamUrl && (masterEventDetails.liveStreamUrl.includes('.m3u8') || masterEventDetails.liveStreamUrl.includes('live-slot'))) ? (
                                                        <HlsPlayer 
                                                            src={masterEventDetails.liveStreamUrl} 
                                                            startTime={masterEventDetails.actualStartTime || masterEventDetails.scheduledStartTime}
                                                            isAdmin={isModUser && unlockPlayerControls}
                                                        />
                                                    ) : (
                                                        <StableIframePlayer 
                                                            eventId={masterEventDetails.id} 
                                                            streamUrl={masterEventDetails.liveStreamUrl || ''} 
                                                            schedTime={masterEventDetails.actualStartTime || masterEventDetails.scheduledStartTime}
                                                            isModUser={isModUser} 
                                                            isUnlocked={unlockPlayerControls}
                                                        />
                                                    )}
                                                </div>
                                                <div style={{ 
                                                    position: 'relative', display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                                                    padding: '8px 12px', marginTop: '5px', borderRadius: '10px',
                                                    background: 'rgba(26, 26, 26, 0.45)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                                                    border: '1px solid rgba(255, 255, 255, 0.08)', boxShadow: '0 4px 15px rgba(0, 0, 0, 0.2)',
                                                    gap: '10px', flexWrap: 'wrap'
                                                }}>
                                                    {/* Title & Info Banner */}
                                                    <div style={{ flex: 1, minWidth: '130px', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                                                        <span style={{ color: '#FFF', fontSize: '14px', fontWeight: '900', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', letterSpacing: '0.5px' }}>
                                                            {masterEventDetails.eventTitle || 'Live Event'}
                                                        </span>
                                                        <span style={{ color: '#00FFFF', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                                                            📍 {masterEventDetails.room || 'The Arena'}
                                                        </span>
                                                    </div>
                                                    
                                                    {/* Metrics & Actions Group */}
                                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                        
                                                        {/* Viewers Pill */}
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,0.5)', padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                            <span style={{ fontSize: '13px' }}>👀</span>
                                                            <span style={{ color: '#FFF', fontSize: '12px', fontWeight: 'bold' }}>{masterEventDetails.totalViewCount || 0}</span>
                                                        </div>
                                                        
                                                        {/* Like Total & Floating Animation Pill */}
                                                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,0.5)', padding: '4px 10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                            <button 
                                                                onClick={() => { triggerFloatingLike(); handleLike(); }} 
                                                                disabled={isLiking || !currentUser} 
                                                                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                                                            >
                                                                <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: hasLiked ? '#00FFFF' : '#888', filter: hasLiked ? 'drop-shadow(0 0 5px rgba(0,255,255,0.5))' : 'none', transition: 'all 0.2s ease' }}>
                                                                    <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
                                                                </svg>
                                                            </button>
                                                            <span style={{ color: '#FFF', fontSize: '12px', fontWeight: 'bold' }}>{masterEventDetails.likeCount || 0}</span>
                                                            
                                                            {/* Floating Elements Map */}
                                                            {floatingLikes.map(like => (
                                                                <div key={like.id} style={{ position: 'absolute', bottom: '30px', left: '0px', fontSize: '20px', animation: 'floatUpLike 2s ease-out forwards', pointerEvents: 'none', zIndex: 50 }}>
                                                                    {Math.random() > 0.5 ? '❤️' : '👍'}
                                                                </div>
                                                            ))}
                                                        </div>

                                                        {/* Share Button (Shrunk) */}
                                                        <div style={{ transform: 'scale(0.85)', transformOrigin: 'center' }}>
                                                            <ShareButton title={masterEventDetails.eventTitle} text={`Watch "${masterEventDetails.eventTitle}" LIVE in ${masterEventDetails.room || 'the Arena'}!`} url={`/content/${masterEventDetails.id}`} showMessage={showMessage} />
                                                        </div>
                                                    </div>
                                                </div>
                                            </>
                                        ) : (
                                            <div className="box-office-container" style={{ textAlign: 'center', padding: '30px 15px', backgroundColor: '#0A0A0A', borderRadius: '16px', border: '1px solid #FFD700', maxWidth: '600px', margin: '0 auto' }}>
                                                <span style={{ fontSize: '48px' }}>🎟️</span>
                                                <h3 style={{ color: '#FFD700', fontSize: '24px', fontWeight: '900', textTransform: 'uppercase', margin: '0 0 10px 0' }}>Ticket Required</h3>
                                                <p style={{ color: '#FFF', fontSize: '22px', margin: '10px 0' }}>{masterEventDetails.eventTitle}</p>
                                                <button onClick={() => setShowGiftModal(true)} style={{ width: '100%', maxWidth: '350px', height: '50px', backgroundColor: 'rgba(255, 215, 0, 0.15)', color: '#FFD700', border: '1px solid #FFD700', borderRadius: '8px', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>PURCHASE TICKET (${(masterEventDetails.ticketPrice || 0).toFixed(2)})</button>
                                            </div>
                                        )}
                                    </div>
                                    <div className="live-layout-chat-section">
                                    {/* THE FIX: Permanent Admin Header with Moderation Toggles */}
                                    <div style={{ padding: '8px 15px', backgroundColor: '#050505', borderBottom: '1px solid #111', color: '#FFD700', fontSize: '11px', fontWeight: '900', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span>⚡ LIVE CHAT</span>
                                        {(creatorProfile?.role === 'super_admin' || creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority') && (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                {/* THE FIX: Player Control Unlock Checkbox */}
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <input 
                                                        type="checkbox" 
                                                        id="unlockControlsToggle"
                                                        checked={unlockPlayerControls}
                                                        onChange={(e) => setUnlockPlayerControls(e.target.checked)}
                                                        style={{ width: '14px', height: '14px', accentColor: '#FFD700', cursor: 'pointer' }}
                                                    />
                                                    <label htmlFor="unlockControlsToggle" style={{ fontSize: '9px', color: '#888', cursor: 'pointer', whiteSpace: 'nowrap' }}>UNLOCK PLAYER</label>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                    <input 
                                                        type="checkbox" 
                                                        id="permModToggle"
                                                        checked={masterEventDetails?.isChatEnabled !== false}
                                                        onChange={async (e) => {
                                                            const newStatus = e.target.checked;
                                                            try {
                                                                const toggleFunc = httpsCallable(functions, 'toggleEventChat');
                                                                await toggleFunc({ eventId: masterEventDetails.id, isChatEnabled: newStatus });
                                                                showMessage(`Chat ${newStatus ? 'Enabled' : 'Disabled'}`);
                                                            } catch (err) { showMessage("Toggle failed"); }
                                                        }}
                                                        style={{ width: '14px', height: '14px', accentColor: '#FFD700', cursor: 'pointer' }}
                                                    />
                                                    <label htmlFor="permModToggle" style={{ fontSize: '9px', color: '#888', cursor: 'pointer', whiteSpace: 'nowrap' }}>MOD CHAT</label>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    <LiveEventChat eventId={masterEventDetails.id} eventDetails={masterEventDetails} currentUser={currentUser} creatorProfile={creatorProfile} showMessage={showMessage} />
                                </div>
                            </div>
                            </>
                        ) : (
                            <div className="box-office-container" style={{ textAlign: 'center', padding: '0 0 30px 0', backgroundColor: '#0A0A0A', borderRadius: '16px', maxWidth: '700px', margin: '0 auto', border: '1px solid #222' }}>
                                <div style={{ background: '#111', padding: '15px 0', borderBottom: '1px solid #333', marginBottom: '20px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '15px' }}>
                                    <span style={{ fontSize: '28px' }}>⏳</span>
                                    <div>
                                        <h3 style={{ color: '#FFF', fontSize: '18px', fontWeight: '900', textTransform: 'uppercase', margin: 0 }}>WAITING ROOM</h3>
                                        <p style={{ color: '#00FFFF', fontSize: '12px', fontWeight: 'bold', margin: '4px 0 0 0', letterSpacing: '1px' }}>📍 {masterEventDetails.room || 'Theater Room'}</p>
                                    </div>
                                </div>
                                
                                <div style={{ padding: '0 20px' }}>
                                    {masterEventDetails.thumbnailUrl && <img src={masterEventDetails.thumbnailUrl} alt="Coming Soon" style={{ display: 'block', margin: '0 auto', width: '100%', maxHeight: '350px', objectFit: 'contain', borderRadius: '12px', border: '1px solid #333', boxShadow: '0 10px 30px rgba(0,0,0,0.8)' }} />}
                                    
                                    <div style={{ marginTop: '20px', textAlign: 'center' }}>
                                        <p className="heading" style={{ color: '#FFD700', fontSize: '24px', margin: '0 0 5px 0' }}>{masterEventDetails.eventTitle}</p>
                                        <p style={{ color: '#00FFFF', fontSize: '12px', fontWeight: 'bold', margin: '0 0 15px 0', textTransform: 'uppercase' }}>A Film by: {masterEventDetails.creatorName || masterEventDetails.credits || 'NVA Creator'}</p>
                                        <p className="paragraph" style={{ color: '#AAA', fontSize: '13px', maxWidth: '500px', margin: '0 auto 20px auto', lineHeight: '1.6' }}>{masterEventDetails.eventDescription}</p>
                                    </div>
                                    
                                    <div style={{ marginTop: '10px', padding: '15px 40px', borderRadius: '12px', border: '2px solid #FFD700', display: 'inline-block' }}>
                                        <p style={{ margin: '0 0 5px 0', fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold' }}>DOORS OPEN IN</p>
                                        <p style={{ color: '#FFD700', fontSize: '32px', margin: 0, fontWeight: '900', fontVariantNumeric: 'tabular-nums' }}>{localCountdown}</p>
                                    </div>

                                    {masterEventDetails.isTicketed && (
                                        <div style={{ marginTop: '25px', paddingTop: '20px', borderTop: '1px dashed #333' }}>
                                            {creatorProfile?.purchasedTickets?.[masterEventDetails.id] ? (
                                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px' }}>
                                                    <div style={{ display: 'inline-block', backgroundColor: 'rgba(0, 255, 0, 0.1)', border: '1px solid #00FF00', color: '#00FF00', padding: '12px 24px', borderRadius: '8px', fontWeight: 'bold' }}>✅ TICKET SECURED</div>
                                                    <button 
                                                        style={{ margin: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', maxWidth: '280px', height: '45px', backgroundColor: 'rgba(255, 215, 0, 0.1)', color: '#FFD700', border: '1px solid #FFD700', borderRadius: '8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '1px' }} 
                                                        onClick={(e) => { e.stopPropagation(); setShowGiftModal(true); }}
                                                    >
                                                        🎁 Gift to a Friend
                                                    </button>
                                                </div>
                                            ) : (
                                                <button onClick={() => { if (!currentUser) return setActiveScreen('Login'); setShowGiftModal(true); }} style={{ width: '100%', maxWidth: '350px', height: '50px', backgroundColor: 'rgba(255, 215, 0, 0.15)', color: '#FFD700', border: '1px solid #FFD700', borderRadius: '8px', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 0 15px rgba(255,215,0,0.2)' }}>
                                                    🎟️ BUY OR GIFT TICKET (${(masterEventDetails.ticketPrice || 0).toFixed(2)})
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    /* --- STATE 2: THE MULTIPLEX LOBBY (NO EVENT SELECTED YET) --- */
                    <div style={{ marginBottom: '30px' }}>
                        <div style={{ textAlign: 'center', marginBottom: '30px', padding: '20px', background: 'linear-gradient(180deg, rgba(20,20,20,0.9) 0%, rgba(5,5,5,0.95) 100%)', borderRadius: '16px', border: '1px solid #333' }}>
                            <p style={{ color: '#FFD700', fontSize: '24px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 5px 0' }}>🍿 The NVA Multiplex</p>
                            <p style={{ color: '#AAA', fontSize: '13px', margin: 0 }}>Select a virtual theater room below to enter the waiting area or purchase tickets.</p>
                        </div>
                        
                        {upcomingPremieres.length > 0 ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
                                {upcomingPremieres.map(movie => {
                                    const pDate = movie.premiereDate;
                                    const premiereTime = pDate?.toMillis ? pDate.toMillis() : (pDate?.seconds ? pDate.seconds * 1000 : new Date(pDate).getTime());
                                    const validTime = isNaN(premiereTime) ? 0 : premiereTime;
                                    const hasPassed = Date.now() > validTime;
                                    const hasTicket = creatorProfile?.purchasedTickets?.[movie.id];
                                    
                                    // THE FIX: Remove TBA tag for Free movies and show Entry status instead
                                    // THE FIX: Aggressive check for free status to ensure label updates instantly
const isActuallyFree = movie.isNowShowingFree || movie.ticketPrice === 0 || movie.ticketPrice === '0' || !movie.isTicketed;
const roomLabel = isActuallyFree ? "🔓 NOW SHOWING: FREE" : ((movie.ticketsSold || 0) > 0 ? (movie.room || 'Theater Room') : "📍 TBA (THEATER ROOM)");
                                    const dateString = validTime > 0 ? new Date(validTime).toLocaleString() : 'TBA';
                                    
                                    return (
                                        <div key={movie.id} onClick={() => setSelectedEventId(movie.id)} style={{ 
                                            cursor: 'pointer', 
                                            background: '#0a0a0a', 
                                            border: movie.isNowShowingFree ? '1px solid #00FFFF' : '1px solid #333', // THE FIX: Cyan highlight for free items
                                            boxShadow: movie.isNowShowingFree ? '0 0 15px rgba(0, 255, 255, 0.1)' : 'none',
                                            borderRadius: '12px', 
                                            overflow: 'hidden', 
                                            transition: 'transform 0.2s', 
                                            // THE FIX: Do not greyscale if movie is Free or Live
                                            filter: (hasPassed && !movie.isNowShowingFree && movie.status !== 'live') ? 'grayscale(100%)' : 'none' 
                                        }} onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'} onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
                                            <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000' }}>
                                                <img src={movie.posterUrl} alt={movie.title} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                                <div style={{ position: 'absolute', top: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.8)', borderBottomRightRadius: '8px', padding: '6px 12px', border: movie.isNowShowingFree ? '1px solid #00FFFF' : '1px solid #333', borderTop: 'none', borderLeft: 'none' }}>
                                                    <p style={{ margin: 0, color: '#00FFFF', fontSize: '11px', fontWeight: '900', textTransform: 'uppercase' }}>{isActuallyFree ? "" : "📍 "}{roomLabel}</p>
                                                </div>
                                            </div>
                                            <div style={{ padding: '15px' }}>
                                                <p style={{ color: '#FFF', fontWeight: 'bold', fontSize: '16px', margin: '0 0 5px 0' }}>{movie.title}</p>
                                                {movie.status === 'live' ? (
                                                    <p style={{ color: '#DC3545', fontWeight: '900', fontSize: '13px', margin: '0 0 10px 0', animation: 'pulse 1.5s infinite' }}>🔴 LIVE NOW</p>
                                                ) : (
                                                    <p style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '12px', margin: '0 0 10px 0' }}>📅 {dateString}</p>
                                                )}
                                                
                                                {(!hasPassed || movie.status === 'live') && (
                                                isActuallyFree ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                                            <div style={{ width: '100%', padding: '10px', background: 'rgba(0,255,0,0.1)', color: '#00FF00', border: '1px solid #00FF00', borderRadius: '8px', fontWeight: 'bold', textAlign: 'center', fontSize: '12px', letterSpacing: '0.5px' }}>
                                                                🔓 FREE ENTRY ACTIVE
                                                            </div>
                                                            <div style={{ width: '100%', padding: '10px', background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid #FFD700', borderRadius: '8px', fontWeight: 'bold', textAlign: 'center', fontSize: '12px' }}>
                                                                🍿 ENTER THEATER
                                                            </div>
                                                        </div>
                                                    ) : hasTicket ? (
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
                                                            <div style={{ width: '100%', padding: '10px', background: 'rgba(0,255,0,0.1)', color: '#00FF00', border: '1px solid #00FF00', borderRadius: '8px', fontWeight: 'bold', textAlign: 'center', fontSize: '12px' }}>✅ TICKET SECURED</div>
                                                            <button 
                                                                onClick={(e) => {
                                                                    e.stopPropagation(); 
                                                                    setMasterEventDetails({
                                                                        id: movie.id,
                                                                        eventTitle: movie.title,
                                                                        ticketPrice: movie.ticketPrice,
                                                                        ...movie
                                                                    });
                                                                    setShowGiftModal(true);
                                                                }}
                                                                style={{ width: '100%', padding: '10px', background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid #FFD700', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px', textTransform: 'uppercase' }}
                                                            >
                                                                🎁 Gift to a Friend
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div style={{ width: '100%', padding: '10px', background: 'rgba(255,215,0,0.15)', color: '#FFD700', border: '1px solid #FFD700', borderRadius: '8px', fontWeight: 'bold', textAlign: 'center', fontSize: '12px' }}>
                                                            🎟️ ENTER LOBBY
                                                        </div>
                                                    )
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p style={{ textAlign: 'center', color: '#888', fontSize: '14px', marginTop: '40px' }}>No watch parties are currently scheduled in the Multiplex.</p>
                        )}

                        <div className="dashboardSection" style={{ marginTop: '40px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                                <p className="dashboardSectionTitle" style={{ margin: 0, fontSize: '18px', fontWeight: 'bold' }}>Past Events & Replays</p>
                                <input type="text" className="formInput" placeholder="Search replays..." value={replaySearchTerm} onChange={(e) => setReplaySearchTerm(e.target.value)} style={{ width: '100%', maxWidth: '240px', margin: 0 }} />
                            </div>
                            {pastEvents.length > 0 ? (
                                <div className="replay-grid-container" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '15px' }}>
                                    {pastEvents.filter(event => event.eventTitle.toLowerCase().includes(replaySearchTerm.toLowerCase())).map(event => (
                                        <ReplayEventCard key={event.id} event={event} onClick={() => handleContentItemClick(event)} />
                                    ))}
                                </div>
                            ) : (
                                <p style={{ textAlign: 'center', color: '#666' }}>No past events found.</p>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ==================== TAB 3.5: CASTING & AUDITIONS ==================== */}
            <div className="tabContent" style={{ 
                display: activeTab === 'Casting' ? 'block' : 'none', 
                animation: activeTab === 'Casting' ? 'fadeIn 0.3s ease' : 'none',
                marginBottom: '30px'
            }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(229, 57, 161, 0.02)', border: '1px dashed rgba(229, 57, 161, 0.25)', borderRadius: '16px', padding: '40px 24px', textAlign: 'center', gap: '15px' }}>
                    <span style={{ fontSize: '40px' }}>🎬</span>
                    <div>
                        <p style={{ margin: 0, color: '#FFF', fontWeight: 'bold', fontSize: '16px' }}>Casting Calls & Auditions</p>
                        <p style={{ margin: '6px 0 0 0', color: '#888', fontSize: '12px', lineHeight: '1.5', maxWidth: '380px' }}>
                            Casting calls, talent applications, and film tournament auditions unlock during active production cycles. 
                        </p>
                        <p style={{ margin: '4px 0 0 0', color: '#E539A1', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }}>
                            💡 Keep your Showcase Video updated to stay discoverable by directors!
                        </p>
                    </div>
                </div>
            </div>

            {/* ==================== TAB 4: COMMUNITY (FEED, TALENT, CHARTS) ==================== */}
            <div className="tabContent" style={{ 
                display: activeTab === 'Community' ? 'block' : 'none', 
                animation: activeTab === 'Community' ? 'fadeIn 0.3s ease' : 'none' 
            }}>
                
                {/* Smart Sub-Navigation */}
                <div style={{ display: 'flex', gap: '20px', marginBottom: '25px', borderBottom: '1px solid #222', overflowX: 'auto', scrollbarWidth: 'none' }}>
                    {['Feed', 'Discover Creators', 'Leaderboard'].map(sub => (
                        <div 
                            key={sub}
                            onClick={() => setCommunitySubTab(sub)} 
                            style={{ 
                                padding: '10px 4px', 
                                borderBottom: communitySubTab === sub ? '2px solid #00FFFF' : '2px solid transparent', 
                                cursor: 'pointer', 
                                color: communitySubTab === sub ? '#00FFFF' : '#888', 
                                fontWeight: 'bold',
                                fontSize: '14px',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.2s ease'
                            }}
                        >
                            {sub}
                        </div>
                    ))}
                </div>

                {/* SUB-TAB 1: FOLLOWING (LAZY FEED) */}
                {communitySubTab === 'Feed' && (
                    <div>
                        {loadingFollowing ? (
                            <p style={{ textAlign: 'center', color: '#FFD700' }}>Loading Feed...</p>
                        ) : followingFeed.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '16px', padding: '30px 15px', textAlign: 'center', gap: '12px' }}>
                                <span style={{ fontSize: '32px' }}>👥</span>
                                <div>
                                    <p style={{ margin: 0, color: '#FFF', fontWeight: 'bold', fontSize: '14px' }}>Your Feed is Empty</p>
                                    <p style={{ margin: '4px 0 0 0', color: '#888', fontSize: '12px', lineHeight: '1.4' }}>Follow your favorite local actors, musicians, and filmmakers to build your custom timeline.</p>
                                </div>
                                <button 
                                    className="modern-button" 
                                    onClick={() => setCommunitySubTab('Discover Creators')}
                                    style={{ background: 'rgba(0, 255, 255, 0.1)', color: '#00FFFF', border: '1px solid rgba(0, 255, 255, 0.3)', padding: '8px 16px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', textTransform: 'uppercase' }}
                                >
                                    Find Creators
                                </button>
                            </div>
                        ) : (
                            <div className="contentGrid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '15px' }}>
                                {followingFeed.map((item) => (
                                    <div key={item.id} className="contentCard" onClick={() => handleContentItemClick(item)} style={{ cursor: 'pointer' }}>
                                        <DynamicThumbnail item={item} />
                                        <p className="contentTitle" style={{ color: '#FFF', marginTop: '10px', fontWeight: 'bold' }}>{item.title}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* SUB-TAB 2: TALENT (FIND CREATORS) */}
                {communitySubTab === 'Discover Creators' && (
                    <div>
                        <DiscoverUsersScreen 
                            showMessage={showMessage} 
                            setActiveScreen={setActiveScreen} 
                            setSelectedUserId={(id) => {
                                window.dispatchEvent(new CustomEvent('navigateToUserProfile', { detail: { userId: id } }));
                            }}
                            currentUser={currentUser} 
                            creatorProfile={creatorProfile} 
                        />
                    </div>
                )}

                {/* SUB-TAB 3: TOP CHARTS (LEADERBOARD) */}
                {communitySubTab === 'Leaderboard' && (
                    <div>
                        {loadingLeaderboard ? (
                            <p style={{ textAlign: 'center', color: '#FFD700' }}>Recalculating Charts...</p>
                        ) : (
                            <div className="leaderboardList" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {leaderboard.map((creator, index) => {
                                    const rank = index + 1;
                                    const isTopThree = rank <= 3;
                                    return (
                                        <div 
                                            key={creator.id} 
                                            onClick={() => {
                                                setActiveScreen('UserProfile');
                                                window.dispatchEvent(new CustomEvent('navigateToUserProfile', { detail: { userId: creator.id } }));
                                            }}
                                            style={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                padding: '12px 16px',
                                                backgroundColor: rank === 1 ? 'rgba(255, 215, 0, 0.08)' : '#111',
                                                border: rank === 1 ? '1px solid #FFD700' : '1px solid #222',
                                                borderRadius: '12px',
                                                cursor: 'pointer',
                                                transition: 'transform 0.15s ease'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                                <span style={{
                                                    fontSize: '18px',
                                                    fontWeight: 'black',
                                                    color: rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : '#666',
                                                    width: '25px',
                                                    textAlign: 'center'
                                                }}>
                                                    {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank}
                                                </span>
                                                <img 
                                                    src={creator.photoURL || 'https://placehold.co/150/222/FFF?text=NVA'} 
                                                    alt={creator.displayName} 
                                                    style={{ width: '45px', height: '45px', borderRadius: '50%', objectFit: 'cover', border: isTopThree ? '2px solid' : '1px solid #333', borderColor: rank === 1 ? '#FFD700' : rank === 2 ? '#C0C0C0' : rank === 3 ? '#CD7F32' : '#333' }}
                                                />
                                                <div>
                                                    <p style={{ margin: 0, fontWeight: 'bold', color: '#FFF' }}>{creator.displayName || 'Anonymous Creator'}</p>
                                                    <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>@{creator.username || 'creator'}</p>
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right' }}>
                                                <p style={{ margin: 0, fontWeight: 'black', color: '#FFD700', fontSize: '15px' }}>{creator.voteCount || 0}</p>
                                                <p style={{ margin: 0, fontSize: '11px', color: '#555' }}>Cumulative Votes</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {showGiftModal && (
                <GiftTicketModal
                    onClose={() => {
                        setShowGiftModal(false);
                        // THE FIX: Release masterEventDetails if opened directly from the lobby to prevent getting trapped
                        if (!selectedEventId) {
                            setMasterEventDetails(null);
                        }
                    }}
                    eventDetails={masterEventDetails}
                    currentUser={currentUser}
                    creatorProfile={creatorProfile} // THE FIX: Resolves the disabled earnings button bug
                    setPledgeContext={setPledgeContext}
                    setActiveScreen={setActiveScreen}
                    showMessage={showMessage}
                />
            )}
        </div>
    );
}

export default DiscoverScreen;