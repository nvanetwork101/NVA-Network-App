// src/components/HomeScreen.jsx

import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { doc, getDoc, collection, query, where, orderBy, onSnapshot, limit } from "firebase/firestore";

// --- Child Component Imports ---
import LikeButton from './LikeButton';
import DynamicThumbnail from './DynamicThumbnail';
import CompetitionHomeScreenBanner from './CompetitionHomeScreenBanner';
// CORRECTED: This is no longer a placeholder
import PromotedSlot from './PromotedSlot';

// --- Main HomeScreen Component ---
    const HomeScreen = ({ currentUser, showMessage, handleVideoPress, handleLogout, setActiveScreen, activeCompetition }) => {
    // --- STATE & REFS ---
    const [rawLayout, setRawLayout] = useState(null);
    const [rawAutomatedSlots, setRawAutomatedSlots] = useState(null); // <<< ADD THIS LINE
    const [enrichedLayout, setEnrichedLayout] = useState({ featured: [], trending: [] });
    const [displayFeatured, setDisplayFeatured] = useState([]);
    const [displayLiveFeed, setDisplayLiveFeed] = useState([]);
    const horizontalCarouselRef = useRef(null);
    const verticalCarouselRef = useRef(null);
    const [isLayoutLoading, setIsLayoutLoading] = useState(true);
    const [isLiveFeedLoading, setIsLiveFeedLoading] = useState(true);
    const [adminLiveFeed, setAdminLiveFeed] = useState([]);
    const [creatorFeaturedFeed, setCreatorFeaturedFeed] = useState([]);
    const [blockList, setBlockList] = useState(new Set());
    const [realtimeContent, setRealtimeContent] = useState(new Map());

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

        const liveFeedQuery = query(collection(db, `artifacts/${appId}/public/data/content_items`), where('isActive', '==', true), where('contentType', '==', 'Live Feed'), orderBy('createdAt', 'desc'), limit(20));
        const unsubLiveFeed = onSnapshot(liveFeedQuery, (snapshot) => setAdminLiveFeed(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))));
        
        const creatorFeaturedQuery = query(collection(db, `artifacts/${appId}/public/data/content_items`), where('isActive', '==', true), where('isFeatured', '==', true), orderBy('createdAt', 'desc'), limit(20));
        const unsubCreatorFeatured = onSnapshot(creatorFeaturedQuery, (snapshot) => setCreatorFeaturedFeed(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))));
        
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

        // MODIFIED: Added unsubAutomatedSlots to the cleanup function
        return () => { unsubLayout(); unsubAutomatedSlots(); unsubLiveFeed(); unsubCreatorFeatured(); unsubBlockList(); };
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
    }, [rawLayout, rawAutomatedSlots]); // MODIFIED: Dependency array now includes rawAutomatedSlots

    // EFFECT 3: Processes the layout with the latest real-time data.
    useEffect(() => {
        if (!rawLayout || !rawAutomatedSlots || !realtimeContent) return;
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

    // EFFECT 3: Combines and filters the live feed.
    useEffect(() => {
        setIsLiveFeedLoading(true);
        const combined = [...adminLiveFeed, ...creatorFeaturedFeed];
        const uniqueItems = Array.from(new Map(combined.map(item => [item.id, item])).values());
        const filteredItems = uniqueItems.filter(item => !blockList.has(item.creatorId));
        filteredItems.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setDisplayLiveFeed(filteredItems.length > 4 ? [...filteredItems, ...filteredItems.slice(0, 4)] : filteredItems);
        setIsLiveFeedLoading(false);
    }, [adminLiveFeed, creatorFeaturedFeed, blockList]);

    // AUTOSCROLL EFFECTS (Your original logic is preserved)
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

    useEffect(() => {
        const carousel = verticalCarouselRef.current;
        if (!carousel || displayLiveFeed.length <= 4) return;
        const originalItemCount = displayLiveFeed.length - 4;
        if (originalItemCount <= 0) return;
        const interval = setInterval(() => {
            const firstItem = carousel.querySelector('.vertical-carousel-item');
            if (!firstItem) return;
            const itemHeight = firstItem.offsetHeight + 15;
            const scrollEnd = originalItemCount * itemHeight;
            if (carousel.scrollTop >= scrollEnd - itemHeight) {
                carousel.style.scrollBehavior = 'auto';
                carousel.scrollTop = 0;
                setTimeout(() => {
                    carousel.style.scrollBehavior = 'smooth';
                    carousel.scrollTop += itemHeight;
                }, 50);
            } else {
                carousel.scrollTop += itemHeight;
            }
        }, 3000);
        return () => clearInterval(interval);
    }, [displayLiveFeed]);

    // --- HANDLERS ---
    // CORRECTED: Implemented your scroll handlers
    const handleHorizontalScroll = (direction) => {
        const carousel = horizontalCarouselRef.current;
        if (carousel) {
            const itemWidth = carousel.children[0]?.offsetWidth + 15;
            carousel.scrollBy({ left: direction === 'prev' ? -itemWidth : itemWidth, behavior: 'smooth' });
        }
    };
    const handleVerticalScroll = (direction) => {
        const carousel = verticalCarouselRef.current;
        if (carousel) {
            const itemHeight = carousel.children[0]?.offsetHeight + 15;
            carousel.scrollBy({ top: direction === 'up' ? -itemHeight : itemHeight, behavior: 'smooth' });
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
    return (
        <div className="screenContainer">
            <PromotedSlot showMessage={showMessage} handleVideoPress={handleVideoPress} currentUser={currentUser} />
            
            <CompetitionHomeScreenBanner setActiveScreen={setActiveScreen} activeCompetition={activeCompetition} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '20px' }}>
                <p className="sectionTitle" style={{ margin: 0, fontSize: '18px' }}>Featured Highlights</p>
                <div className="topRightButtonContainer" style={{ position: 'static' }}>
                    {/* THE FIX: This button is now only rendered if the value from settings/homeScreenLayout is true */}
                    {currentUser && rawLayout?.showNvaCharts && (
                        <button className="topButton" onClick={() => setActiveScreen('NvaNetworkCharts')}>NVA Network Charts</button>
                    )}
                    <button className="topButton" onClick={() => setActiveScreen('SupportUsScreen')}>Support Us</button>
                    {currentUser ? (<button className="topButton" onClick={handleLogout}>Logout</button>) : (<button className="topButton" onClick={() => setActiveScreen('Login')}>Login</button>)}
                </div>
            </div>
            <div className="carousel-wrapper">
                {displayFeatured.length > 3 && (<><button className="carousel-nav-btn prev-horizontal" onClick={() => handleHorizontalScroll('prev')}>◀</button><button className="carousel-nav-btn next-horizontal" onClick={() => handleHorizontalScroll('next')}>▶</button></>)}
                <div className="horizontal-carousel-container" ref={horizontalCarouselRef}>
                    {isLayoutLoading ? (Array.from({ length: 5 }).map((_, i) => <div key={i} className="horizontal-carousel-item" style={{ backgroundColor: '#2A2A2A' }}></div>)) : 
                    (displayFeatured.map((item, index) => (
                        <div key={`${item.id || item.title}-${index}`} className="horizontal-carousel-item" onClick={() => handleItemClick(item)} style={{cursor: 'pointer'}}>
                            <img src={item.customThumbnailUrl || item.imageUrl} alt={item.title} className="carousel-image" />
                            {currentUser && item.type === 'internal' && item.id && <LikeButton contentItem={item} currentUser={currentUser} showMessage={showMessage} />}
                        </div>
                    )))}
                </div>
            </div>

            <div className="sectionHeaderWithButton"><p className="sectionTitle">Trending</p>{!currentUser && (<div style={{display: 'flex', gap: '10px'}}><button className="sectionHeaderButton" onClick={() => setActiveScreen('UserSignUp')}>User Sign Up</button><button className="sectionHeaderButton" onClick={() => setActiveScreen('CreatorSignUp')}>Creator Sign Up</button></div>)}</div>
            {/* CORRECTED: The JSX for the trending grid is now fixed, removing the stray bracket */}
            {isLayoutLoading ? <p style={{color: 'white'}}>Loading trending...</p> : (
                <div className="contentGrid">
                    {enrichedLayout.trending.map((item) => (
                        <div key={item.id || item.title} className="contentCard">
                            <DynamicThumbnail item={item} onClick={() => handleItemClick(item)} />
                            <p className="contentTitle">{item.title}</p>
                            {item.type === 'internal' && (
                                <div style={{ padding: '0 10px 10px 10px', display: 'flex', alignItems: 'center', gap: '5px', color: '#AAA', fontSize: '12px' }}>
                                    <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'currentColor' }}><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 10c-2.48 0-4.5-2.02-4.5-4.5S9.52 5.5 12 5.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5zM12 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>
                                    <span>{item.viewCount || 0} views</span>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            <div className="sectionHeaderWithButton"><p className="sectionTitle">Live Feed</p>{currentUser && (<div style={{display: 'flex', gap: '10px'}}><button className="sectionHeaderButton" onClick={() => setActiveScreen('DiscoverUsers')}>Find Creators</button><button className="sectionHeaderButton" onClick={() => setActiveScreen('Discover')}>Discover All</button></div>)}</div>
            <div className="carousel-wrapper">
                {displayLiveFeed.length > 2 && (<><button className="carousel-nav-btn prev-vertical" onClick={() => handleVerticalScroll('up')}>▲</button><button className="carousel-nav-btn next-vertical" onClick={() => handleVerticalScroll('down')}>▼</button></>)}
                <div className="vertical-carousel-container" ref={verticalCarouselRef}>
                    {isLiveFeedLoading ? (Array.from({ length: 4 }).map((_, i) => <div key={i} className="vertical-carousel-item" style={{backgroundColor: '#1A1A1A'}}></div>)) : 
                    (displayLiveFeed.map((item, index) => (
                        <div key={`${item.id}-${index}`} className="vertical-carousel-item" onClick={() => handleItemClick(item)} style={{position: 'relative', cursor: 'pointer'}}>
                            <img src={item.customThumbnailUrl || item.imageUrl} alt={item.title} className="liveFeedThumbnail" />
                            <div className="liveFeedContent">
                                <p className="liveFeedTitle">{item.title}</p>
                                <p className="liveFeedCreator">by {item.creatorName}</p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: '#AAA', fontSize: '12px', marginTop: '4px' }}><svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'currentColor' }}><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 10c-2.48 0-4.5-2.02-4.5-4.5S9.52 5.5 12 5.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5zM12 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg><span>{item.viewCount || 0} views</span></div>
                            </div>
                            {currentUser && item.id && <LikeButton contentItem={item} currentUser={currentUser} showMessage={showMessage} />}
                        </div>
                    )))}
                </div>
            </div>
        </div>
    );
};

export default HomeScreen;