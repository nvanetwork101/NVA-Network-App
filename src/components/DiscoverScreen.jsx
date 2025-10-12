// src/components/DiscoverScreen.jsx

import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, getDoc, getDocs, limit, startAfter } from "firebase/firestore";
import { db, functions, httpsCallable, extractVideoInfo } from '../firebase.js';
import LiveEventChat from './LiveEventChat';

// --- Replay Card Component ---
import ShareButton from './ShareButton';
const ReplayEventCard = ({ event, onClick }) => {
    const thumbnailUrl = event.customThumbnailUrl || event.thumbnailUrl || 'https://placehold.co/128x72/2A2A2A/FFF?text=N/A';
    const formatDate = (timestamp) => {
        if (!timestamp || !timestamp.toDate) return 'Unknown Date';
        return timestamp.toDate().toLocaleDateString();
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
    deepLinkedReplayId // <-- NEW PROP
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
    const viewCounted = React.useRef(false);
    const [countdownDistance, setCountdownDistance] = useState(null); // Milliseconds remaining until start
    
    // --- DATA FETCHING LOGIC ---
    
    // --- DEEP LINK HANDLING EFFECT (NEW) ---
    useEffect(() => {
        if (deepLinkedReplayId && currentUser !== undefined) { // Wait for auth check to complete
            const fetchAndPlayReplay = async () => {
                showMessage("Loading shared replay...");
                const replayRef = doc(db, "events", deepLinkedReplayId);
                const replaySnap = await getDoc(replayRef);

                if (replaySnap.exists() && replaySnap.data().status === 'completed') {
                    const replayData = { id: replaySnap.id, ...replaySnap.data() };
                    // Use the new, more flexible hasAccess function
                    if (hasAccess(replayData)) {
                        handleVideoPress(replayData.liveStreamUrl || replayData.embedUrl || replayData.mainUrl, replayData);
                    } else {
                        // If access is denied, show the correct reason.
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
    }, [deepLinkedReplayId, currentUser, creatorProfile]); // Re-run if user/profile changes
    
    useEffect(() => {
        if (liveEvent && liveEvent.eventId) {
            const masterEventRef = doc(db, "events", liveEvent.eventId);
            const unsubscribe = onSnapshot(masterEventRef, (docSnap) => {
                if (docSnap.exists()) {
                    setMasterEventDetails({ id: docSnap.id, ...docSnap.data() });
                } else {
                    setMasterEventDetails(null);
                }
            });
            return () => unsubscribe();
        } else {
            setMasterEventDetails(null);
        }
    }, [liveEvent]);

    useEffect(() => {
        const categoriesRef = collection(db, "content_categories");
        const q = query(categoriesRef, where("isActive", "==", true), orderBy("orderIndex", "asc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoadingCategories(false);
        });
        return () => unsubscribe();
    }, []);

        
    
    // --- ORIGINAL LOGIC FOR "PAST EVENTS" (REPLAYS) ---
    useEffect(() => {
        // This listener fetches ALL completed events for the client-side search.
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


    // --- NEW SCALABLE LOGIC FOR VOD CATEGORIES ---
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
        // This effect now ONLY runs for VOD categories.
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

        // --- New Effect to Increment View Count ---
    useEffect(() => {
        const eventIsLive = masterEventDetails?.status === 'live';
        const userHasAccess = hasAccess(); // Assuming hasAccess is defined and stable

        if (eventIsLive && userHasAccess && !viewCounted.current) {
            viewCounted.current = true; // Set immediately to prevent re-triggers
            const incrementViewFunction = httpsCallable(functions, 'incrementEventView');
            incrementViewFunction({ eventId: masterEventDetails.id })
                .catch(error => console.error("Error incrementing view count:", error));
        }
    }, [masterEventDetails, currentUser, creatorProfile]); // Dependencies that define access

    // --- New Effect to Check Like Status ---
    useEffect(() => {
        if (!masterEventDetails?.id || !currentUser?.uid) return;

        const likeRef = doc(db, `events/${masterEventDetails.id}/likes`, currentUser.uid);
        const unsubscribe = onSnapshot(likeRef, (docSnap) => {
            setHasLiked(docSnap.exists());
        });

        return () => unsubscribe();
    }, [masterEventDetails?.id, currentUser?.uid]);

    // --- New Handler for the Like Button with Optimistic Update ---
    const handleLike = async () => {
        if (isLiking || !masterEventDetails?.id || !currentUser) return;
        setIsLiking(true);

        const originalHasLiked = hasLiked;
        const originalLikeCount = masterEventDetails.likeCount || 0;

        // 1. Optimistically update the UI immediately
        setHasLiked(!originalHasLiked);
        setMasterEventDetails(prevDetails => ({
            ...prevDetails,
            likeCount: originalHasLiked ? originalLikeCount - 1 : originalLikeCount + 1
        }));

        try {
            // 2. Call the backend function
            const likeFunction = httpsCallable(functions, 'likeLiveEvent');
            await likeFunction({ eventId: masterEventDetails.id });
            // The onSnapshot listener will eventually sync the true state from the DB.
        } catch (error) {
            console.error("Error liking event:", error);
            showMessage("There was an error liking the event.");
            // 3. Revert the UI on failure
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
        const isModerator = creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority';
        if (!isModerator) {
            showMessage("You do not have permission to change chat settings.");
            return;
        }

        const newChatStatus = !(masterEventDetails.isChatEnabled !== false); // Default to true if undefined
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

    // --- PREMIERE RENDER LOGIC (REBUILT WITH CORRECT STRUCTURE) ---
    const renderPremiereContent = () => {
        
        if (liveEvent && !masterEventDetails) {
            return <div style={{textAlign: 'center', paddingTop: '50px'}}><p className="heading">Loading Event Details...</p></div>;
        }

        if (masterEventDetails?.status === 'live') {
            if (hasAccess()) {
                const { embedUrl } = extractVideoInfo(masterEventDetails.liveStreamUrl || '');
                const finalUrl = embedUrl.includes('?') 
                    ? `${embedUrl}&autoplay=1&mute=1&modestbranding=1&rel=0`
                    : `${embedUrl}?autoplay=1&mute=1&modestbranding=1&rel=0`;
                return (
                    // This parent div is the fix. It provides a stable block container for the
                    // centered, max-width video player, preventing it from collapsing inside the
                    // parent flex layout.
                    <div>
                        <div className="w-full max-w-[900px] mx-auto bg-black md:rounded-lg overflow-hidden aspect-video">
                            <iframe 
                                src={finalUrl}
                                className="w-full h-full border-0"
                                allow="autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope;" 
                                allowFullScreen
                                title="Live Premiere"
                            ></iframe>
                        </div>
                        
                        {/* --- UI FOR STATS AND LIKE BUTTON (Now outside the video container) --- */}
                        <div className="live-event-controls" style={{ maxWidth: '900px', margin: '10px auto 0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px', backgroundColor: '#1A1A1A', borderRadius: '8px' }}>
                            <div className="event-stats" style={{ display: 'flex', gap: '20px', color: '#FFF' }}>
                                <span>👀 {masterEventDetails.totalViewCount || 0} Viewers</span>
                                <span>❤️ {masterEventDetails.likeCount || 0} Likes</span>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                <ShareButton
                                    title={masterEventDetails.eventTitle}
                                    text={`Watch the live premiere of "${masterEventDetails.eventTitle}" on NVA Network!`}
                                    url={'/discover'}
                                    showMessage={showMessage}
                                />
                                <button 
                                    className={`button ${hasLiked ? 'liked' : ''}`} 
                                    onClick={handleLike} 
                                    disabled={isLiking || !currentUser}
                                    style={{
                                        backgroundColor: hasLiked ? '#DC3545' : '#007BFF',
                                        color: 'white',
                                        border: 'none',
                                        padding: '10px 20px',
                                        borderRadius: '5px',
                                        cursor: 'pointer',
                                        margin: 0
                                    }}
                                >
                                    {hasLiked ? 'Liked' : 'Like'}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            } else if (masterEventDetails.isTicketed) {
                // If access is denied AND it's a ticketed event, show the paywall.
                return (
                    <div 
                        style={{ textAlign: 'center', paddingTop: '20px', cursor: 'pointer' }} 
                        onClick={() => showMessage("Please click the button to purchase your ticket and join the stream.")}
                    >
                        {masterEventDetails.thumbnailUrl && <img src={masterEventDetails.thumbnailUrl} alt="Event Live" style={{ display: 'block', margin: '0 auto 20px auto', width: '100%', maxWidth: '480px', borderRadius: '10px', border: '2px solid #DC3545' }} />}
                        <p className="heading" style={{color: '#DC3545'}}>The Premiere is LIVE!</p>
                        <button
                            className="button"
                            style={{ backgroundColor: '#B91C1C', color: 'white', display: 'block', margin: '10px auto 0 auto' }}
                            onClick={(e) => {
                                e.stopPropagation();
                                setPledgeContext({
                                    type: 'eventTicket',
                                    amount: masterEventDetails.ticketPrice,
                                    targetEventId: masterEventDetails.id,
                                    targetEventTitle: masterEventDetails.eventTitle
                                });
                                setActiveScreen(currentUser ? 'SupportUsScreen' : 'Login');
                            }}
                        >
                            {`Get Your Ticket ($${(masterEventDetails.ticketPrice || 0).toFixed(2)})`}
                        </button>
                    </div>
                );
            } else {
                // If access is denied but it's a FREE event, it means the user just needs to log in.
                return (
                     <div 
                        style={{ textAlign: 'center', paddingTop: '20px', cursor: 'pointer' }} 
                        onClick={() => setActiveScreen('Login')}
                    >
                        {masterEventDetails.thumbnailUrl && <img src={masterEventDetails.thumbnailUrl} alt="Event Live" style={{ display: 'block', margin: '0 auto 20px auto', width: '100%', maxWidth: '480px', borderRadius: '10px', border: '2px solid #007BFF' }} />}
                        <p className="heading">The Premiere is LIVE!</p>
                        <button
                            className="button"
                            style={{ display: 'block', margin: '10px auto 0 auto', color: '#0A0A0A' }}
                            onClick={() => setActiveScreen('Login')}
                        >
                            Log In or Sign Up to Watch
                        </button>
                    </div>
                );
            }
        } else if (masterEventDetails?.status === 'upcoming') {
            return (
                <div style={{ textAlign: 'center', paddingTop: '20px' }}>
                    {masterEventDetails.thumbnailUrl && <img src={masterEventDetails.thumbnailUrl} alt="Coming Soon" style={{ display: 'block', margin: '0 auto', width: '100%', maxWidth: '480px', borderRadius: '10px' }} />}
                    <div style={{ marginTop: '20px' }}><p className="heading">{masterEventDetails.eventTitle}</p><p className="paragraph">{masterEventDetails.eventDescription}</p></div>
                    <div style={{ marginTop: '20px', backgroundColor: '#1A1A1A', padding: '15px', borderRadius: '10px', border: '1px solid #FFD700', display: 'inline-block' }}>
                        <p className="heading">Premiere Begins In:</p>
                        <p className="subHeading" style={{ color: '#FFD700', fontSize: '28px', margin: 0 }}>{countdownText}</p>
                    </div>
                    <div style={{ marginTop: '20px' }}>
                        <ShareButton
                            title={masterEventDetails.eventTitle}
                            text={`Join me for the live premiere of "${masterEventDetails.eventTitle}" on NVA Network!`}
                            url={'/discover'}
                            showMessage={showMessage}
                        />
                    </div>
                    {masterEventDetails.isTicketed && !hasAccess() && (
                        <button 
                            className="button" 
                            style={{ backgroundColor: '#B91C1C', color: 'white', display: 'block', margin: '20px auto 0 auto' }} 
                            onClick={() => {
                                setPledgeContext({
                                    type: 'eventTicket',
                                    amount: masterEventDetails.ticketPrice,
                                    targetEventId: masterEventDetails.id,
                                    targetEventTitle: masterEventDetails.eventTitle
                                });
                                setActiveScreen('SupportUsScreen');
                            }}
                        >
                            Purchase Ticket (${(masterEventDetails.ticketPrice || 0).toFixed(2)})
                        </button>
                    )}
                </div>
            );
        } else if (masterEventDetails?.status === 'completed') {
            return (
                <div style={{ textAlign: 'center', paddingTop: '20px' }}>
                    {masterEventDetails.thumbnailUrl && <img src={masterEventDetails.thumbnailUrl} alt="Event Ended" style={{ display: 'block', margin: '0 auto', width: '100%', maxWidth: '480px', borderRadius: '10px', opacity: 0.5 }} />}
                    <div style={{ marginTop: '20px', backgroundColor: '#1A1A1A', padding: '15px', borderRadius: '10px', border: '1px solid #007BFF', display: 'inline-block' }}>
                        <p className="heading">{masterEventDetails.eventTitle}</p>
                        <p className="subHeading">This premiere has ended.</p>
                        <button className="button" onClick={() => handleContentItemClick(masterEventDetails)}>Watch The Replay Now</button>
                    </div>
                </div>
            );
        } else {
            return (
                <div style={{ textAlign: 'center', paddingTop: '50px' }}>
                    <p className="heading">Stream Offline</p>
                    <p className="subHeading">No live premiere is currently scheduled.</p>
                </div>
            );
        }
    };

    const isEventLive = masterEventDetails?.status === 'live';
    
     // --- UNIFIED ACCESS CONTROL FUNCTION ---
    const hasAccess = (eventToCheck) => {
        if (!eventToCheck) return false; // Cannot check access for a null event

        // Rule 1: Moderators and Premium members always have access.
        if (creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority') return true;
        if (creatorProfile?.premiumExpiresAt?.toDate() > new Date()) return true;

        // Rule 2: For a FREE event, the only requirement is to be logged in.
        if (!eventToCheck.isTicketed) {
            return !!currentUser;
        }

        // Rule 3: For a TICKETED event, you must be logged in AND have a specific ticket.
        if (eventToCheck.isTicketed) {
            if (!currentUser) return false;
            return !!creatorProfile.purchasedTickets?.[eventToCheck.id];
        }

        return false; // Default to no access
    };

    // --- MAIN RENDER ---
    return (
        <div className="screenContainer">
            {loadingCategories ? <p>Loading...</p> : (
                <div className="categoryTabs">
                    {categories.slice(0, 2).map(c => (
                        <button key={c.id} className={`categoryTab ${activeCategory === c.name ? 'activeCategoryTab' : ''}`} onClick={() => handleCategoryClick(c.name)}>
                            <span className={`categoryTabText ${activeCategory === c.name ? 'activeCategoryTabText' : ''}`}>{c.name}</span>
                        </button>
                    ))}
                    {categories.length > 2 && (
                        <div className="more-content-button">
                            <button className="categoryTab" onClick={() => setShowMore(!showMore)}>
                                <span className="categoryTabText">More...</span>
                            </button>
                            {showMore && (
                                <div className="more-content-dropdown" style={{ width: 'max-content' }}>
                                    {categories.slice(2).map(c => (
                                        <button
                                            key={c.id}
                                            className={`categoryTab ${activeCategory === c.name ? 'activeCategoryTab' : ''}`}
                                            onClick={() => handleCategoryClick(c.name)}
                                            style={{
                                                whiteSpace: 'nowrap',
                                                width: '100%',
                                                padding: '6px 16px',
                                                // Flexbox properties for perfect centering
                                                display: 'flex',
                                                justifyContent: 'center',
                                                alignItems: 'center'
                                            }}
                                        >
                                            <span className={`categoryTabText ${activeCategory === c.name ? 'activeCategoryTabText' : ''}`}>{c.name}</span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
            
            <div className="categoryContent">{activeCategory === 'Live Premieres' && renderPremiereContent()}</div>     
            
           {/* --- HYBRID CONTENT DISPLAY --- */}
            {activeCategory !== 'Live Premieres' && !isEventLive && (
                <div className="dashboardSection" style={{ marginTop: '30px' }}>
                    {/* Scalable Search Bar for VOD */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                        <input type="text" className="formInput" placeholder={`Search in ${activeCategory}...`} value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleSearch()} />
                        <button className="button" onClick={handleSearch} style={{margin: 0, minWidth: '80px'}}><span className="buttonText">Search</span></button>
                        {searchTerm && <button className="button" onClick={handleClearSearch} style={{margin: 0, backgroundColor: '#555'}}><span className="buttonText light">Clear</span></button>}
                    </div>
                    {/* VOD Content Display */}
                    {loadingContent ? <p style={{textAlign: 'center'}}>Loading content...</p> : content.length === 0 ? <p style={{textAlign: 'center'}}>{searchTerm ? `No results found for "${searchTerm}".` : "No content here yet."}</p> : (
                        <>
                            <div className="contentGrid">
                                {content.map((item) => (<div key={item.id} className="contentCard" onClick={() => handleContentItemClick(item)}><DynamicThumbnail item={item} /><p className="contentTitle">{item.title}</p></div>))}
                            </div>
                            {hasMore && (
                                <div style={{ textAlign: 'center', marginTop: '30px' }}>
                                    <button className="button" onClick={() => fetchVODData(true)} disabled={isFetching}><span className="buttonText light">{isFetching ? 'Loading...' : 'Load More'}</span></button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            )}

            {activeCategory === 'Live Premieres' && !isEventLive && (
                <div className="dashboardSection" style={{ marginTop: '30px' }}>
                    {/* Original Client-Side Search for Replays */}
                    <div className="flex justify-between items-center mb-4">
                        <p className="dashboardSectionTitle mb-0">Past Events & Replays</p>
                        <input type="text" className="formInput" placeholder="Search replays by title or date..." value={replaySearchTerm} onChange={(e) => setReplaySearchTerm(e.target.value)} style={{width: '300px'}}/>
                    </div>
                    {/* Replays Content Display */}
                    {pastEvents.length > 0 ? (
                        <div className="replay-grid-container">
                            {pastEvents
                                .filter(event => 
                                    event.eventTitle.toLowerCase().includes(replaySearchTerm.toLowerCase()) ||
                                    (event.scheduledStartTime?.toDate().toLocaleDateString() || '').includes(replaySearchTerm)
                                )
                                .map((event) => (<ReplayEventCard key={event.id} event={event} onClick={() => handleContentItemClick(event)} />
                            ))}
                        </div>
                    ) : (
                        <p style={{textAlign: 'center'}}>No past events found.</p>
                    )}
                </div>
            )}

            {/* --- CHAT RENDER LOGIC (Unchanged) --- */}
            {activeCategory === 'Live Premieres' && isEventLive && hasAccess() && (
                <div className="dashboardSection" style={{ marginTop: '30px', maxWidth: '900px', margin: '30px auto 0 auto' }}>
                    {(creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority') && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#2A2A2A', padding: '10px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #444' }}>
                            <span style={{ fontWeight: 'bold', color: '#FFF' }}>Moderator Control:</span>
                            <div className="checkboxItem">
                                <input type="checkbox" id="chatToggle" checked={masterEventDetails.isChatEnabled !== false} onChange={handleToggleChat} />
                                <label htmlFor="chatToggle">Live Chat Enabled</label>
                            </div>
                        </div>
                    )}
                    {masterEventDetails?.isChatEnabled !== false ? (
                        <LiveEventChat eventId={masterEventDetails.id} eventDetails={masterEventDetails} currentUser={currentUser} creatorProfile={creatorProfile} showMessage={showMessage} />
                    ) : (
                        <div style={{ textAlign: 'center', padding: '20px', backgroundColor: '#1A1A1A', borderRadius: '8px' }}>
                            <p className="subHeading">Live chat is currently disabled by a moderator.</p>
                        </div>
                    )}
                </div>
            )}

        </div>
    );
}

export default DiscoverScreen;