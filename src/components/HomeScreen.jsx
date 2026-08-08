// src/components/HomeScreen.jsx

import { useState, useEffect, useRef } from 'react';
import { db, storage, ref, uploadBytes, getDownloadURL, functions, extractVideoInfo } from '../firebase';
import { doc, getDoc, collection, query, where, orderBy, onSnapshot, limit, addDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, increment } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

// --- Child Component Imports ---
import LikeButton from './LikeButton';
import DynamicThumbnail from './DynamicThumbnail';
import CompetitionHomeScreenBanner from './CompetitionHomeScreenBanner';
import RoastTokenVault from './RoastTokenVault';
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
    const [algoTrending, setAlgoTrending] = useState([]); // NEW: Algorithmic Trending State

    // --- NEW SHOWCASE FEED STATES ---
    const [showcaseFeed, setShowcaseFeed] = useState([]);
    const [loadingShowcase, setLoadingShowcase] = useState(true);
    const [showcaseLimit, setShowcaseLimit] = useState(15); // Added for Pagination
    const showcaseModalBlockRef = useRef(false);

    // Global Pause Hook: Freezes background videos when any modal opens
    useEffect(() => {
        const toggleBlock = (e) => {
            showcaseModalBlockRef.current = e.detail;
            if (e.detail) {
                Object.values(showcaseVideoRefs.current || {}).forEach(el => {
                    if (el && typeof el.pause === 'function') el.pause();
                });
            }
        };
        window.addEventListener('nva_modal_toggled', toggleBlock);
        return () => window.removeEventListener('nva_modal_toggled', toggleBlock);
    }, []);
    const showcaseVideoRefs = useRef({});

    // --- FLASH STORIES SYSTEM STATES & HOOKS ---
    const [flashStories, setFlashStories] = useState([]); // Flat background data
    const [groupedStories, setGroupedStories] = useState([]); // WhatsApp-style user groups
    const [activeUserIndex, setActiveUserIndex] = useState(null); // Which user's stack is open
    const [activeSubStoryIndex, setActiveSubStoryIndex] = useState(0); // Which story in the stack is playing
    const [showUploaderModal, setShowUploaderModal] = useState(false);
    const [isUploadingStory, setIsUploadingStory] = useState(false);

    // Multi-Mode Media States (Video, Photo, Text)
    const [mediaType, setMediaType] = useState('video'); // 'video' | 'slideshow' | 'text'
    const [storyImages, setStoryImages] = useState([]); // Max 5 photos
    const [slideshowIndex, setSlideshowIndex] = useState(0); // Auto-pacing
    const [storyBgColor, setStoryBgColor] = useState('#0D0D0D'); // Text Mode Background
    const [storyLink, setStoryLink] = useState(''); // Clickable overlay link
    
    // Custom In-App Camera States & Refs
    const [showCamera, setShowCamera] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordingProgress, setRecordingProgress] = useState(0);
    const [cameraFacingMode, setCameraFacingMode] = useState('user'); // Camera Flip State
    const liveCameraRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const recordedChunksRef = useRef([]);
    const cameraStreamRef = useRef(null);
    const recordingTimerRef = useRef(null);

    // High-Fidelity Creator Suite States
    const [storyFile, setStoryFile] = useState(null);
    const [videoPanX, setVideoPanX] = useState(50); // Controls left/right cropping
    const [textWidthPercent, setTextWidthPercent] = useState(70); // Locks text width while moving
    const [isResizingText, setIsResizingText] = useState(false); // Tracks edge resizing
    const [textColor, setTextColor] = useState('#FFFFFF'); // Text color
    const [textSize, setTextSize] = useState(14); // Text size in px
    const fullScreenVideoRef = useRef(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [playProgress, setPlayProgress] = useState(0);
    const [storyPreviewUrl, setStoryPreviewUrl] = useState('');
    const [editingStoryId, setEditingStoryId] = useState(null);
    
    // Vault & Action States
    const [isVaultOpen, setIsVaultOpen] = useState(false);
    const [showOptionsId, setShowOptionsId] = useState(null);
    const [trimStart, setTrimStart] = useState(0);
    const [trimEnd, setTrimEnd] = useState(15);
    const [videoDuration, setVideoDuration] = useState(0);
    const [storyCaption, setStoryCaption] = useState('');
    const [textCoords, setTextCoords] = useState({ x: 50, y: 50 });
    const [isDraggingText, setIsDraggingText] = useState(false);
    const [textFont, setTextFont] = useState('sans-serif'); // 'sans-serif' | 'serif' | 'monospace' | 'cursive'
    const [storyAudience, setStoryAudience] = useState('public');
    const [taggedFriends, setTaggedFriends] = useState([]);
    const [showFriendsSheet, setShowFriendsSheet] = useState(false);
    const [friendSearchQuery, setFriendSearchQuery] = useState('');
    const [myFriendsList, setMyFriendsList] = useState([]);
    
    // Reward Preset States
    const [hasReward, setHasReward] = useState(false);
    const [rewardType, setRewardType] = useState('ticket');
    const [rewardValue, setRewardValue] = useState('');
    const [rewardCap, setRewardCap] = useState('50');
    
    // Lifespan (15m, 2h default, 6h max)
    const [storyLifespan, setStoryLifespan] = useState('2h');
    
    // Reward Claim & Analytics Overlay
    const [claimingRewardStory, setClaimingRewardStory] = useState(null);
    const [deletingStory, setDeletingStory] = useState(null);
    const [claimedCode, setClaimedCode] = useState(null);
    const [isClaiming, setIsClaiming] = useState(false);
    const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);
    
    // View & Like Tracking
    const [viewedStories, setViewedStories] = useState(new Set());
    const [likedStories, setLikedStories] = useState(new Set());
    const [likeAnimId, setLikeAnimId] = useState(null);
    const [flameAnimId, setFlameAnimId] = useState(null);
    const [showTokenPrompt, setShowTokenPrompt] = useState(false);
    
    // Pagination & Drag Scroll Refs
    const storyTrayRef = useRef(null);
    const [storyPage, setStoryPage] = useState(0);
    
    // Video Preview & Battery Refs
    const previewVideoRef = useRef(null);
    const storyVideoRefs = useRef({});
    const [isMuted, setIsMuted] = useState(true); // iOS Auto-Play Black Screen Shield
    const [isPreviewMuted, setIsPreviewMuted] = useState(true);
    const [showVolumeControl, setShowVolumeControl] = useState(true);

    // Custom In-App Camera Logic (WhatsApp/IG Style)
    const openInAppCamera = async (mode = cameraFacingMode) => {
        if (cameraStreamRef.current) {
            cameraStreamRef.current.getTracks().forEach(track => track.stop());
        }
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: mode }, audio: true });
            cameraStreamRef.current = stream;
            setCameraFacingMode(mode);
            setShowCamera(true);
            setTimeout(() => {
                if (liveCameraRef.current) liveCameraRef.current.srcObject = stream;
            }, 100);
        } catch (err) {
            showMessage("Camera/Microphone permission denied.");
        }
    };

    const flipCamera = () => {
        const newMode = cameraFacingMode === 'user' ? 'environment' : 'user';
        openInAppCamera(newMode);
    };

    const closeInAppCamera = () => {
        if (cameraStreamRef.current) {
            cameraStreamRef.current.getTracks().forEach(track => track.stop()); // Releases the hardware camera light
            cameraStreamRef.current = null;
        }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        clearInterval(recordingTimerRef.current);
        setIsRecording(false);
        setRecordingProgress(0);
        setShowCamera(false);
    };

    const startRecording = () => {
        if (!cameraStreamRef.current) return;
        recordedChunksRef.current = [];
        
        // Let the browser automatically choose the best supported codec for mobile compatibility
        const recorder = new MediaRecorder(cameraStreamRef.current);
        mediaRecorderRef.current = recorder;
        recorder.ondataavailable = e => { if (e.data.size > 0) recordedChunksRef.current.push(e.data); };
        
        recorder.onstop = () => {
            const blob = new Blob(recordedChunksRef.current, { type: 'video/mp4' });
            const file = new File([blob], `story_${Date.now()}.mp4`, { type: 'video/mp4' });
            setStoryFile(file);
            setStoryPreviewUrl(URL.createObjectURL(file));
            closeInAppCamera();
        };
        
        recorder.start();
        setIsRecording(true);
        setRecordingProgress(0);

        const startTime = Date.now();
        recordingTimerRef.current = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const progress = (elapsed / 60000) * 100; // 60 seconds exact cap
            if (progress >= 100) {
                stopRecording();
            } else {
                setRecordingProgress(progress);
            }
        }, 100);
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            mediaRecorderRef.current.stop();
        }
        clearInterval(recordingTimerRef.current);
    };

    // Auto-Pause/Resume full-screen player when Token Vault or Prompts open
    useEffect(() => {
        if (fullScreenVideoRef.current) {
            if (showTokenPrompt || isVaultOpen) {
                fullScreenVideoRef.current.pause();
            } else {
                fullScreenVideoRef.current.play().catch(() => {});
            }
        }
    }, [showTokenPrompt, isVaultOpen]);

    // Battery & Data Saver: Pauses 3s previews when tab is hidden
    useEffect(() => {
        const handleVisibilityChange = () => {
            const isHidden = document.hidden;
            Object.values(storyVideoRefs.current).forEach(videoEl => {
                if (videoEl) {
                    if (isHidden) videoEl.pause();
                    else videoEl.play().catch(() => {});
                }
            });
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
    }, []);

    // Dual Navigation Listener (Catches both EventBus and Session Storage cross-page triggers)
    useEffect(() => {
        if (sessionStorage.getItem('open_flash_uploader') === 'true') {
            sessionStorage.removeItem('open_flash_uploader');
            setShowUploaderModal(true);
        }
        const handleOpenUploader = () => setShowUploaderModal(true);
        window.addEventListener('openFlashStoryUploader', handleOpenUploader);
        return () => window.removeEventListener('openFlashStoryUploader', handleOpenUploader);
    }, []);

    // Fetch user's friends/followers list for tagging
    useEffect(() => {
        if (!currentUser || !showFriendsSheet) return;
        const q = query(collection(db, "creators", currentUser.uid, "following"), limit(30));
        const unsub = onSnapshot(q, (snap) => {
            setMyFriendsList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, [currentUser, showFriendsSheet]);

    // Zero-Explosion Passive View Recorder
    useEffect(() => {
        if (activeUserIndex !== null && groupedStories[activeUserIndex]) {
            const currentStory = groupedStories[activeUserIndex][activeSubStoryIndex];
            if (currentStory && currentUser) {
                const storyId = currentStory.id;
                const isOwner = currentUser.uid === currentStory.userId;

                if (!isOwner && !viewedStories.has(storyId)) {
                    setViewedStories(prev => new Set(prev).add(storyId));
                    setFlashStories(prev => prev.map(s => s.id === storyId ? { ...s, viewCount: (s.viewCount || 0) + 1 } : s));
                    updateDoc(doc(db, "flash_stories", storyId), { viewCount: increment(1) }).catch(() => {});
                }
            }
        }
    }, [activeUserIndex, activeSubStoryIndex, groupedStories, currentUser]);

    // Zero-Cost Real-Time Listener & WhatsApp-Style Grouper
    useEffect(() => {
        const q = query(
            collection(db, "flash_stories"),
            where("expiresAt", ">", new Date()),
            orderBy("expiresAt", "asc"),
            limit(50)
        );
        const unsub = onSnapshot(q, (snap) => {
            const now = Date.now();
            const valid = snap.docs.map(docSnap => {
                const data = docSnap.data();
                const expiresAtMs = data.expiresAt?.toMillis ? data.expiresAt.toMillis() : new Date(data.expiresAt).getTime();
                // GOD-TIER FIX: Unresolved serverTimestamp() defaults to 'now' so new uploads aren't flagged as 56-year-old stuck stories
                const createdAtMs = data.createdAt?.toMillis ? data.createdAt.toMillis() : now;
                return { id: docSnap.id, ...data, expiresAtMs, createdAtMs };
            }).filter(story => {
                // INSTANT CACHE SHIELD: Purges stale cached expired stories on frame 1
                if (story.expiresAtMs <= now) return false;
                const isStuck = story.processing && (now - story.createdAtMs > 180000);
                if (isStuck) return false;
                return story.processing !== true || story.userId === currentUser?.uid;
            });
            setFlashStories(valid);

            // Group stories by userId mapping
            const groupsMap = new Map();
            valid.forEach(story => {
                if (!groupsMap.has(story.userId)) groupsMap.set(story.userId, []);
                groupsMap.get(story.userId).push(story);
            });
            setGroupedStories(Array.from(groupsMap.values()));
        });
        return () => unsub();
    }, []);

    const [isGlobalMuted, setIsGlobalMuted] = useState(true); // Modern Mute State

    // Force strict mute policy down to DOM nodes dynamically to appease WebKit
    useEffect(() => {
        Object.values(showcaseVideoRefs.current).forEach(el => {
            if (el) el.muted = isGlobalMuted;
        });
    }, [isGlobalMuted]);

    // NEW: Real-time intelligent algorithmic trending listener (Cost: capped at max 10 reads)
    useEffect(() => {
        const q = query(
            collection(db, "artifacts/production-app-id/public/data/content_items"), 
            where("isActive", "==", true), 
            orderBy("viewCount", "desc"), 
            limit(10)
        );
        const unsub = onSnapshot(q, (snap) => {
            setAlgoTrending(snap.docs.map(doc => ({ id: doc.id, type: 'internal', contentId: doc.id, ...doc.data() })));
        });
        return () => unsub();
    }, []);

    // NEW: Smart Showcase Feed (Shuffled & Fresh)
    useEffect(() => {
        setLoadingShowcase(true);
        const q = query(
            collection(db, "artifacts/production-app-id/public/data/content_items"),
            where("isActive", "==", true),
            orderBy("createdAt", "desc"),
            limit(showcaseLimit)
        );
        const unsub = onSnapshot(q, (snap) => {
            let items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            
            // 1. Seen Memory filter
            let seenIds = new Set();
            try { seenIds = new Set(JSON.parse(localStorage.getItem('nva_seen_feed') || '[]')); } catch(e) {}
            
            let unseen = items.filter(item => !seenIds.has(item.id));
            let seen = items.filter(item => seenIds.has(item.id));

            // 2. Shuffle unseen items so every app boot feels completely different
            unseen = unseen.sort(() => Math.random() - 0.5);
            
            // 3. Combine: Fresh content first, then older seen content. (No creator limits!)
            setShowcaseFeed([...unseen, ...seen]);
            setLoadingShowcase(false);
        });
        return () => unsub();
    }, [showcaseLimit]);

    // Mode B/C Static Engine Pacing (Safely at top level)
    useEffect(() => {
        if (activeUserIndex !== null && groupedStories[activeUserIndex]) {
            const currentStory = groupedStories[activeUserIndex][activeSubStoryIndex];
            if (currentStory && currentStory.mediaType !== 'video') {
                let totalDur = 5000;
                let slides = 1;
                if (currentStory.mediaType === 'slideshow') {
                    slides = currentStory.images?.length || 1;
                    totalDur = slides === 1 ? 15000 : slides === 2 ? 7500 : slides === 3 ? 5000 : slides === 4 ? 3750 : 3000;
                }
                let start = Date.now();
                const timer = setInterval(() => {
                    const prog = ((Date.now() - start) / totalDur) * 100;
                    if (prog >= 100) {
                        if (currentStory.mediaType === 'slideshow' && slideshowIndex < slides - 1) {
                            setSlideshowIndex(prev => prev + 1); start = Date.now(); setPlayProgress(0);
                        } else {
                            clearInterval(timer);
                            setPlayProgress(0); setSlideshowIndex(0);
                            if (activeSubStoryIndex < groupedStories[activeUserIndex].length - 1) {
                                setActiveSubStoryIndex(prev => prev + 1);
                            } else if (activeUserIndex < groupedStories.length - 1) {
                                setActiveSubStoryIndex(0);
                                setActiveUserIndex(prev => prev + 1);
                            } else {
                                setActiveUserIndex(null);
                            }
                        }
                    } else setPlayProgress(prog);
                }, 50);
                return () => clearInterval(timer);
            }
        }
    }, [activeUserIndex, activeSubStoryIndex, groupedStories, slideshowIndex]);

    // Mode B Zero-Glitch Image Pre-caching Guard (Safely at top level)
    useEffect(() => {
        if (activeUserIndex !== null && groupedStories[activeUserIndex]) {
            const currentStory = groupedStories[activeUserIndex][activeSubStoryIndex];
            if (currentStory && currentStory.mediaType === 'slideshow' && currentStory.images) {
                currentStory.images.forEach(src => { const img = new Image(); img.src = src; });
            }
        }
    }, [activeUserIndex, activeSubStoryIndex, groupedStories]);

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

        // 2. INTELLIGENT TRENDING: Use algorithmic feed, filter out Admin slot duplicates
        const uniqueAlgoItems = algoTrending.filter(item => !slotIds.has(item.contentId));

        // 3. Combine the lists: Enriched Admin slots FIRST, then fully-loaded algorithmic items
        const enrichedSlots = enrich(slotItems);
        const combinedTrending = [...enrichedSlots, ...uniqueAlgoItems];
        
        // FLAWLESS DEDUPLICATION: Final shield against duplicate IDs
        const seenIds = new Set();
        const enrichedTrending = combinedTrending.filter(item => {
            const idToCheck = item.id || item.contentId;

            if (seenIds.has(idToCheck)) return false;

            seenIds.add(idToCheck);
            return true;
        });

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

    }, [rawLayout, rawAutomatedSlots, realtimeContent, algoTrending]);

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
            const videoEl = showcaseVideoRefs.current[item.id];
            if (videoEl && typeof videoEl.pause === 'function') videoEl.pause(); // Keeps Ghost Audio fix
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

            {/* ====== CINEMATIC 9:16 VERTICAL FLASH STORY TILE TRAY ====== */}
            <div style={{ marginTop: '20px', marginBottom: '24px' }}>
                <div 
                    ref={storyTrayRef}
                    onScroll={() => {
                        if (storyTrayRef.current) {
                            const { scrollLeft, clientWidth } = storyTrayRef.current;
                            setStoryPage(Math.round(scrollLeft / (clientWidth * 0.75)));
                            sessionStorage.setItem('story_tray_scroll_pos', scrollLeft); // Save scroll memory
                        }
                    }}
                    onAnimationEnd={() => {
                        const saved = sessionStorage.getItem('story_tray_scroll_pos');
                        if (saved && storyTrayRef.current) storyTrayRef.current.scrollLeft = parseInt(saved, 10);
                    }}
                    style={{ 
                        display: 'flex', 
                        gap: '12px', 
                        overflowX: 'auto', 
                        paddingBottom: '12px', 
                        scrollSnapType: 'x mandatory', 
                        WebkitOverflowScrolling: 'touch',
                        scrollbarWidth: 'none',
                        cursor: 'grab'
                    }}
                >
                    
                    {/* CARD 1: Dashed Create Story Tile (Image-2 Style) */}
                    {currentUser && (
                        <div 
                            onClick={() => setShowUploaderModal(true)}
                            style={{ 
                                width: '125px', 
                                height: '195px', 
                                borderRadius: '16px', 
                                border: '2px dashed #FFD700', 
                                background: 'rgba(255,215,0,0.03)', 
                                display: 'flex', 
                                flexDirection: 'column', 
                                alignItems: 'center', 
                                justifyContent: 'center', 
                                cursor: 'pointer', 
                                flexShrink: 0,
                                scrollSnapAlign: 'start',
                                transition: 'transform 0.2s ease'
                            }}
                            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#FFD700', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 15px rgba(255,215,0,0.4)', marginBottom: '12px' }}>
                                <span style={{ fontSize: '28px', color: '#000', fontWeight: '900', lineHeight: 1 }}>+</span>
                            </div>
                            <span style={{ color: '#FFD700', fontSize: '12px', fontWeight: '900', letterSpacing: '0.5px' }}>Create story</span>
                        </div>
                    )}

                    {/* CARD 2+: WhatsApp-Style Grouped Preview Tiles */}
                    {groupedStories.map((userStories, idx) => {
                        const story = userStories[0]; // Preview first story in stack
                        const now = Date.now();
                        const diffSecs = Math.max(0, Math.floor((story.expiresAtMs - now) / 1000));
                        const minsLeft = Math.floor(diffSecs / 60);
                        const isExpiringSoon = minsLeft < 3;
                        const isLiveStreamer = liveRooms.some(r => r.id === story.userId);
                        const allViewed = userStories.every(s => viewedStories.has(s.id)); // Grey out ring if all viewed

                        return (
                            <div 
                                key={story.userId}
                                onClick={() => {
                                    if (!currentUser) {
                                        showMessage("You must be logged in to view full Flash Stories.");
                                        return;
                                    }
                                    // FIX: Allow the owner to click into a processing story so they can access the delete button if it gets stuck
                                    if (story.processing && story.userId !== currentUser?.uid) {
                                        showMessage("⚙️ Story is optimizing...");
                                        return;
                                    }
                                    const firstUnreadIdx = userStories.findIndex(s => !viewedStories.has(s.id));
                                    setActiveSubStoryIndex(firstUnreadIdx !== -1 ? firstUnreadIdx : 0);
                                    setActiveUserIndex(idx);
                                }}
                                style={{ 
                                    position: 'relative', width: '125px', height: '195px', borderRadius: '16px', overflow: 'hidden', 
                                    border: story.processing ? '2px dashed #FFD700' : (isExpiringSoon ? '2px solid #FF0000' : (allViewed ? '2px solid #555' : '2px solid #FFD700')),
                                    boxShadow: story.processing ? '0 0 15px rgba(255,215,0,0.4)' : (isExpiringSoon ? '0 0 20px rgba(255,0,0,0.6)' : (allViewed ? 'none' : '0 6px 20px rgba(0,0,0,0.6)')),
                                    cursor: 'pointer', flexShrink: 0, scrollSnapAlign: 'start', 
                                    background: story.mediaType === 'text' ? story.storyBgColor || '#0D0D0D' : '#0D0D0D', transition: 'transform 0.2s ease'
                                }}
                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                {/* Multi-Mode Background Renderer */}
                                {story.processing && (!story.videoUrl || !story.videoUrl.includes('/stories/')) ? (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#111', padding: '10px', textAlign: 'center' }}>
                                        <span style={{ fontSize: '28px', marginBottom: '8px' }}>⚙️</span>
                                        <span style={{ color: '#FFD700', fontSize: '10px', fontWeight: '900', letterSpacing: '0.5px' }}>Processing...</span>
                                    </div>
                                ) : story.mediaType === 'video' ? (
                                    <video ref={el => storyVideoRefs.current[story.id] = el} src={story.videoUrl} autoPlay muted playsInline preload="metadata" onTimeUpdate={(e) => { if (e.target.currentTime >= 3) { e.target.currentTime = 0; e.target.play().catch(() => {}); } }} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : story.mediaType === 'slideshow' ? (
                                    <img src={story.images?.[0]} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                ) : (
                                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '10px', textAlign: 'center' }}>
                                        <p style={{ color: story.textColor || '#FFF', fontSize: '10px', fontWeight: 'bold', fontFamily: story.textFont, wordBreak: 'break-word', margin: 0 }}>{(story.caption || '').substring(0, 50)}...</p>
                                    </div>
                                )}

                                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, transparent 40%, rgba(0,0,0,0.85) 100%)' }} />

                                {/* Segmented Group Count Badge */}
                                {userStories.length > 1 && (
                                    <div style={{ position: 'absolute', top: '8px', right: '8px', zIndex: 2, display: 'flex', gap: '2px' }}>
                                        {userStories.map((s, i) => (
                                            <div key={i} style={{ width: '6px', height: '6px', borderRadius: '50%', background: viewedStories.has(s.id) ? 'rgba(255,255,255,0.4)' : '#FFD700', boxShadow: '0 1px 2px rgba(0,0,0,0.8)' }} />
                                        ))}
                                    </div>
                                )}

                                {/* Top-Right Scarcity Timer Badge */}
                                <span style={{ position: 'absolute', top: userStories.length > 1 ? '18px' : '8px', right: '8px', zIndex: 2, background: 'rgba(0,0,0,0.65)', color: isExpiringSoon ? '#FF4500' : '#FFF', fontSize: '9px', fontWeight: '900', padding: '2px 6px', borderRadius: '10px', backdropFilter: 'blur(4px)' }}>
                                    ⏱️ {minsLeft > 60 ? `${Math.floor(minsLeft/60)}h` : `${minsLeft}m`}
                                </span>

                                <div style={{ position: 'absolute', top: '8px', left: '8px', zIndex: 2 }}>
                                    <img src={story.userProfilePicture || 'https://placehold.co/40'} alt={story.userName} style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: isLiveStreamer ? '2px solid #00FFFF' : (allViewed ? '2px solid #888' : '2px solid #FFD700'), boxShadow: '0 2px 8px rgba(0,0,0,0.8)' }} />
                                </div>
                                <p style={{ position: 'absolute', bottom: '10px', left: '10px', right: '10px', margin: 0, color: '#FFF', fontSize: '11px', fontWeight: '900', zIndex: 2, textShadow: '0 1px 4px rgba(0,0,0,0.9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{story.userId === currentUser?.uid ? 'Your story' : story.userName}</p>
                            </div>
                        );
                    })}
                </div>

                {/* Pagination Pill Dots (Yellow Active Pill + Grey Inactive Dots) */}
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '6px', marginTop: '6px' }}>
                    {Array.from({ length: Math.max(1, Math.ceil((flashStories.length + (currentUser ? 1 : 0)) / 2.5)) }).map((_, dotIdx) => (
                        <div 
                            key={dotIdx} 
                            style={{ 
                                width: storyPage === dotIdx ? '20px' : '6px', 
                                height: '6px', 
                                borderRadius: '3px', 
                                backgroundColor: storyPage === dotIdx ? '#FFD700' : '#444', 
                                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)' 
                            }} 
                        />
                    ))}
                </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginTop: '10px', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
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

            {/* ====== NEW 10-CUBE TRENDING TRAY ====== */}
            <div style={{ marginTop: '24px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                    <p className="sectionTitle" style={{ margin: 0 }}>🔥 Top 10 Trending</p>
                    <p style={{ color: '#888', fontSize: '11px', margin: '4px 0 0 0' }}>Most viewed & featured network content</p>
                </div>
                {currentUser && (
                    <div style={{ display: 'flex', gap: '8px' }}>
                        {rawLayout && rawLayout.showMusicCharts !== false && (
                            <button className="btn-glass music-charts-btn" onClick={() => setActiveScreen('MusicCharts')} style={{ minHeight: '30px !important', padding: '4px 10px !important', fontSize: '11px !important' }}>
                                NVA Billboard 🎵
                            </button>
                        )}
                        <button className="btn-glass discover-btn" onClick={() => setActiveScreen('Discover')} style={{ minHeight: '30px !important', padding: '4px 10px !important', fontSize: '11px !important' }}>
                            Explore
                        </button>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '15px', scrollSnapType: 'x mandatory', scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}>
                {isLayoutLoading ? (
                    <p style={{ color: '#AAA', fontSize: '12px' }}>Loading charts...</p>
                ) : (
                    enrichedLayout.trending.slice(0, 10).map((item, index) => (
                        <div 
                            key={item.id || index} 
                            onClick={() => handleItemClick(item)}
                            style={{ width: '130px', height: '130px', flexShrink: 0, scrollSnapAlign: 'start', borderRadius: '14px', overflow: 'hidden', position: 'relative', cursor: 'pointer', border: '1px solid #222', background: '#0A0A0A', boxShadow: '0 4px 10px rgba(0,0,0,0.5)', transition: 'transform 0.2s ease' }}
                            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.borderColor = '#FFD700'; }}
                            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = '#222'; }}
                        >
                            <img src={item.customThumbnailUrl || item.imageUrl || 'https://placehold.co/130x130/111/333'} alt={item.title} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} />
                            
                            {/* Gold Rank Ribbon */}
                            <div style={{ position: 'absolute', top: 0, left: 0, background: 'linear-gradient(135deg, #FFD700, #FF8C00)', color: '#000', fontSize: '13px', fontWeight: '900', padding: '4px 10px', borderBottomRightRadius: '10px', zIndex: 2, boxShadow: '2px 2px 10px rgba(0,0,0,0.5)' }}>
                                #{index + 1}
                            </div>
                            
                            {/* Title Gradient Guard */}
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(0deg, rgba(0,0,0,0.95) 0%, rgba(0,0,0,0.6) 60%, transparent 100%)', padding: '25px 10px 10px 10px', zIndex: 2 }}>
                                <p style={{ margin: 0, color: '#FFF', fontSize: '11px', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</p>
                                <p style={{ margin: '2px 0 0 0', color: '#AAA', fontSize: '9px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <svg viewBox="0 0 24 24" style={{ width: '10px', height: '10px', fill: 'currentColor' }}><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>
                                    {(item.viewCount || 0).toLocaleString()}
                                </p>
                            </div>
                        </div>
                    ))
                )}
            </div>

           {/* ====== THE SHOWCASE FEED (FACEBOOK-STYLE CONTINUOUS SCROLL) ====== */}
            <div style={{ marginTop: '20px', borderTop: '1px solid #222', paddingTop: '20px' }}>
                <p style={{ color: '#FFF', fontSize: '20px', fontWeight: '900', marginBottom: '5px' }}>📺 Showcase Feed</p>
                <p style={{ color: '#AAA', fontSize: '13px', marginBottom: '25px' }}>Original films, music videos, and creator content.</p>
                
                {loadingShowcase ? (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <div style={{ width: '30px', height: '30px', border: '3px solid rgba(0,255,255,0.2)', borderTopColor: '#00FFFF', borderRadius: '50%', animation: 'spin 1s linear infinite', margin: '0 auto 10px auto' }}></div>
                        <p style={{ color: '#00FFFF', fontSize: '12px', fontWeight: 'bold' }}>Loading your feed...</p>
                        <style>{`@keyframes spin { 100% { transform: rotate(360deg); } }`}</style>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '40px', paddingBottom: '60px' }}>
                        {showcaseFeed.map(item => (
                            <div 
                                key={item.id} 
                                style={{ background: '#080808', border: '1px solid #1A1A1A', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
                            >
                                {/* Creator Header */}
                                <div 
                                    onClick={() => {
                                        if (item.creatorId || item.userId) {
                                            window.dispatchEvent(new CustomEvent('navigateToUserProfile', { detail: { userId: item.creatorId || item.userId } }));
                                        }
                                    }}
                                    style={{ display: 'flex', alignItems: 'center', padding: '12px 16px', gap: '12px', cursor: 'pointer', borderBottom: '1px solid #111' }}
                                >
                                    <img src={item.creatorProfilePictureUrl || 'https://placehold.co/40'} style={{ width: '42px', height: '42px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #333' }} />
                                    <div style={{ flex: 1 }}>
                                        <p style={{ margin: 0, color: '#FFF', fontWeight: 'bold', fontSize: '14px' }}>{item.creatorName || 'NVA Creator'}</p>
                                        <p style={{ margin: 0, color: '#888', fontSize: '11px', marginTop: '2px' }}>{item.creatorRole || 'Artist'} • {item.createdAt ? new Date(item.createdAt?.toMillis ? item.createdAt.toMillis() : Date.now()).toLocaleDateString() : 'Recent'}</p>
                                    </div>
                                    {item.monetizationStatus === 'approved' && (
                                        <span style={{ background: 'linear-gradient(to right, #BF953F, #FCF6BA, #B38728)', color: '#000', fontSize: '9px', fontWeight: '900', padding: '4px 8px', borderRadius: '12px', boxShadow: '0 0 10px rgba(191, 149, 63, 0.3)' }}>🎁 MONETIZED</span>
                                    )}
                                </div>
                                
                                {/* Auto-Playing Video Player (Native MP4 + Embedded YouTube/FB Support) */}
                                <div style={{ width: '100%', position: 'relative', background: '#000', minHeight: '220px', cursor: 'pointer', overflow: 'hidden' }} onClick={() => handleItemClick(item)}>
                                    {(() => {
                                        const url = item.embedUrl || item.mainUrl || item.videoUrl || '';
                                        const isNative = /\.(mp4|webm|ogg|mov)$/i.test(url) || url.includes('firebasestorage') || url.includes('r2.dev');
                                        
                                        if (isNative) {
                                            return (
                                                <>
                                                    <video 
                                                        src={url} 
                                                        poster={item.customThumbnailUrl || item.imageUrl}
                                                        autoPlay defaultMuted muted={isGlobalMuted} playsInline 
                                                        style={{ width: '100%', maxHeight: '600px', objectFit: 'contain', display: 'block' }} 
                                                        onTimeUpdate={(e) => {
                                                            if (e.target.currentTime >= 15) {
                                                                e.target.pause(); 
                                                            }
                                                        }}
                                                        onEnded={(e) => {
                                                            e.target.pause();
                                                        }}
                                                        ref={(el) => {
                                                            if (!el) return;
                                                            showcaseVideoRefs.current[item.id] = el;
                                                            el.defaultMuted = true;
                                                            el.muted = isGlobalMuted;
                                                            el.setAttribute('playsinline', '');
                                                            if (el._nvaObserver) el._nvaObserver.disconnect();
                                                            const observer = new IntersectionObserver(([entry]) => {
                                                                if (entry.isIntersecting && !showcaseModalBlockRef.current && el.currentTime < 15 && !el.ended) {
                                                                    const playPromise = el.play();
                                                                    if (playPromise !== undefined) playPromise.catch(() => {});
                                                                } else {
                                                                    el.pause();
                                                                }
                                                            }, { threshold: 0.4 }); 
                                                            observer.observe(el);
                                                            el._nvaObserver = observer;
                                                        }}
                                                    />
                                                    <button 
                                                        onClick={(e) => { e.stopPropagation(); setIsGlobalMuted(!isGlobalMuted); }}
                                                        style={{ position: 'absolute', bottom: '15px', right: '15px', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s ease', boxShadow: '0 4px 15px rgba(0,0,0,0.4)', zIndex: 10 }}
                                                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.8)'}
                                                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(0,0,0,0.5)'}
                                                    >
                                                        {isGlobalMuted ? (
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><line x1="23" y1="9" x2="17" y2="15"></line><line x1="17" y1="9" x2="23" y2="15"></line></svg>
                                                        ) : (
                                                            <svg viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: '18px', height: '18px' }}><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path></svg>
                                                        )}
                                                    </button>
                                                </>
                                            );
                                        }

                                        const extracted = typeof extractVideoInfo === 'function' ? extractVideoInfo(url) : null;
                                        const embedUrl = extracted?.embedUrl || item.embedUrl;

                                        if (embedUrl) {
                                            const separator = embedUrl.includes('?') ? '&' : '?';
                                            const finalEmbedUrl = `${embedUrl}${separator}autoplay=1&mute=1&controls=0&disablekb=1&modestbranding=1&rel=0&enablejsapi=1&playsinline=1&end=15`;
                                            return (
                                                <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9', overflow: 'hidden', background: '#000' }}>
                                                    <iframe 
                                                        src={finalEmbedUrl} 
                                                        title={item.title || "Showcase Content"} 
                                                        style={{ width: '100%', height: '100%', border: 'none', pointerEvents: 'none' }} 
                                                        allow="autoplay; encrypted-media; picture-in-picture"
                                                    />
                                                </div>
                                            );
                                        }

                                        return (
                                            <>
                                                <img src={item.customThumbnailUrl || item.imageUrl || 'https://placehold.co/800x450/111/333'} style={{ width: '100%', maxHeight: '600px', objectFit: 'contain', display: 'block' }} alt={item.title || "Thumbnail"} />
                                                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.3)' }}>
                                                    <div style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: '2px solid #FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)' }}>
                                                        <svg viewBox="0 0 24 24" fill="#FFF" style={{ width: '30px', height: '30px', marginLeft: '4px' }}><path d="M8 5v14l11-7z"/></svg>
                                                    </div>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                                
                                {/* Interaction Bar & Meta */}
                                <div style={{ padding: '16px', cursor: 'pointer' }} onClick={() => handleItemClick(item)}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                                        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                                            {currentUser && (
                                                <div onClick={(e) => e.stopPropagation()}>
                                                    <LikeButton contentItem={item} currentUser={currentUser} showMessage={showMessage} itemType={'content'} />
                                                </div>
                                            )}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#AAA', fontSize: '13px', fontWeight: 'bold' }}>
                                                <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: '18px', height: '18px' }}><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 10c-2.48 0-4.5-2.02-4.5-4.5S9.52 5.5 12 5.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5zM12 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
                                                {(item.viewCount || 0).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <p style={{ color: '#FFF', fontSize: '15px', fontWeight: 'bold', margin: '0 0 6px 0' }}>{item.title}</p>
                                    {item.description && (
                                        <p style={{ color: '#888', fontSize: '13px', margin: 0, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', lineHeight: '1.4' }}>
                                            {item.description}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ))}
                        
                        {/* Pagination: Load More Button */}
                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '10px' }}>
                            <button 
                                onClick={() => setShowcaseLimit(prev => prev + 15)}
                                style={{ background: 'rgba(255,215,0,0.1)', color: '#FFD700', border: '1px solid #FFD700', padding: '12px 24px', borderRadius: '24px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s ease' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,215,0,0.2)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,215,0,0.1)'}
                            >
                                Load More Videos
                            </button>
                        </div>
                    </div>
                )}
            </div>

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

            {/* ====== FULL-SCREEN SEGMENTED MULTI-MODE STORY PLAYER ====== */}
            {activeUserIndex !== null && groupedStories[activeUserIndex] && (() => {
                const userStories = groupedStories[activeUserIndex];
                const currentStory = userStories[activeSubStoryIndex];
                if (!currentStory) return null;
                const isOwner = currentUser?.uid === currentStory.userId;

                const handleNextStory = () => {
                    setPlayProgress(0); setSlideshowIndex(0);
                    if (activeSubStoryIndex < userStories.length - 1) {
                        setActiveSubStoryIndex(prev => prev + 1);
                    } else if (activeUserIndex < groupedStories.length - 1) {
                        setActiveSubStoryIndex(0);
                        setActiveUserIndex(prev => prev + 1);
                    } else {
                        setActiveUserIndex(null);
                    }
                };

                const handlePrevStory = () => {
                    setPlayProgress(0); setSlideshowIndex(0);
                    if (activeSubStoryIndex > 0) {
                        setActiveSubStoryIndex(prev => prev - 1);
                    } else if (activeUserIndex > 0) {
                        const prevUserGroup = groupedStories[activeUserIndex - 1];
                        setActiveSubStoryIndex(prevUserGroup.length - 1);
                        setActiveUserIndex(prev => prev - 1);
                    }
                };

                return (
                    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        
                        {/* WhatsApp-Style Segmented Top Progress Bar */}
                        <div style={{ position: 'absolute', top: '4px', left: '4px', right: '4px', height: '3px', zIndex: 20, display: 'flex', gap: '4px' }}>
                            {userStories.map((s, idx) => (
                                <div key={s.id} style={{ flex: 1, height: '100%', background: 'rgba(255,255,255,0.3)', borderRadius: '2px', overflow: 'hidden' }}>
                                    <div style={{ height: '100%', background: '#FFD700', transition: idx === activeSubStoryIndex ? 'width 0.1s linear' : 'none', width: idx < activeSubStoryIndex ? '100%' : idx === activeSubStoryIndex ? `${playProgress}%` : '0%' }} />
                                </div>
                            ))}
                        </div>

                        {/* Multi-Mode Rendering Engine */}
                        {currentStory.processing && (!currentStory.videoUrl || !currentStory.videoUrl.includes('/stories/')) ? (
                            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#0D0D0D' }}>
                                <span style={{ fontSize: '40px', marginBottom: '10px' }}>⚙️</span>
                                <p style={{ color: '#FFD700', fontWeight: '900', letterSpacing: '1px' }}>Processing clip...</p>
                                <p style={{ color: '#888', fontSize: '10px', marginTop: '10px' }}>(If stuck here for minutes, delete & retry)</p>
                            </div>
                        ) : currentStory.mediaType === 'slideshow' ? (
                            <img src={currentStory.images?.[slideshowIndex]} alt="Slide" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : currentStory.mediaType === 'text' ? (
                            <div style={{ width: '100%', height: '100%', background: currentStory.storyBgColor || '#0D0D0D' }} />
                        ) : (
                            <div 
                                onClick={() => {
                                    setShowVolumeControl(true);
                                    if (window.volFadeTimer) clearTimeout(window.volFadeTimer);
                                    window.volFadeTimer = setTimeout(() => setShowVolumeControl(false), 3000);
                                }}
                                style={{ width: '100%', height: '100%', position: 'relative' }}
                            >
                                <video 
                                    ref={fullScreenVideoRef} src={currentStory.videoUrl} autoPlay playsInline muted={isMuted}
                                    onLoadedData={(e) => { 
                                        e.target.currentTime = currentStory.trimStart || 0; 
                                        setPlayProgress(0); 
                                        setShowVolumeControl(true);
                                        if (window.volFadeTimer) clearTimeout(window.volFadeTimer);
                                        window.volFadeTimer = setTimeout(() => setShowVolumeControl(false), 3000);
                                    }}
                                    onTimeUpdate={(e) => {
                                        const start = currentStory.trimStart || 0; const end = currentStory.trimEnd || (start + 60);
                                        setPlayProgress(Math.min(100, Math.max(0, ((e.target.currentTime - start) / Math.max(1, end - start)) * 100)));
                                        if (e.target.currentTime >= end) handleNextStory();
                                    }}
                                    onEnded={handleNextStory} 
                                    style={{ position: 'absolute', inset: 0, width: '100vw', height: '100vh', objectFit: 'cover', objectPosition: `${currentStory.videoPanX || 50}% 50%` }} 
                                />
                                {/* Auto-Fading Overlay Volume Button (Hides after 3 seconds) */}
                                <button 
                                    onClick={(e) => { 
                                        e.stopPropagation(); 
                                        setIsMuted(!isMuted); 
                                        setShowVolumeControl(true);
                                        if (window.volFadeTimer) clearTimeout(window.volFadeTimer);
                                        window.volFadeTimer = setTimeout(() => setShowVolumeControl(false), 3000);
                                    }} 
                                    style={{ 
                                        position: 'absolute', top: '70px', right: '15px', 
                                        background: 'rgba(0,0,0,0.6)', border: '1px solid #FFD700', borderRadius: '50%', color: '#FFF', 
                                        width: '36px', height: '36px', zIndex: 30, cursor: 'pointer', fontSize: '16px', 
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.8)',
                                        opacity: showVolumeControl ? 1 : 0,
                                        transition: 'opacity 0.5s ease',
                                        pointerEvents: showVolumeControl ? 'auto' : 'none'
                                    }}
                                >
                                    {isMuted ? '🔇' : '🔊'}
                                </button>
                            </div>
                        )}

                        {/* Styled Text Overlay on Full-Screen Player */}
                        {currentStory.caption && (
                            <div style={{ 
                                position: 'absolute', 
                                top: currentStory.textCoords ? `${currentStory.textCoords.y}%` : '50%', 
                                left: currentStory.textCoords ? `${currentStory.textCoords.x}%` : '50%', 
                                transform: 'translate(-50%, -50%)', 
                                background: 'rgba(0,0,0,0.7)', 
                                border: '1px solid #FFD700', 
                                color: currentStory.textColor || '#FFFFFF', 
                                padding: '8px 16px', 
                                borderRadius: '12px', 
                                fontSize: currentStory.textSize ? `${Math.round(currentStory.textSize * 1.25)}px` : '16px', 
                                fontWeight: '900', 
                                fontFamily: currentStory.textFont || 'sans-serif',
                                textAlign: 'center', 
                                textShadow: '0 2px 6px rgba(0,0,0,0.9)', 
                                width: currentStory.textWidthPercent ? `${currentStory.textWidthPercent}%` : '70%',
                                boxSizing: 'border-box',
                                wordBreak: 'break-word',
                                pointerEvents: 'none', 
                                zIndex: 6 
                            }}>
                                {currentStory.caption}
                            </div>
                        )}

                        {/* Header */}
                        <div style={{ position: 'absolute', top: '15px', left: '15px', right: '15px', zIndex: 10, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                            <div 
                                onClick={() => {
                                    setActiveUserIndex(null);
                                    window.dispatchEvent(new CustomEvent('navigateToUserProfile', { detail: { userId: currentStory.userId } }));
                                }}
                                style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(8px)', padding: '6px 12px', borderRadius: '20px', cursor: 'pointer', border: '1px solid rgba(255,255,255,0.1)' }}
                            >
                                <img src={currentStory.userProfilePicture || 'https://placehold.co/40'} alt="Avatar" style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.2)' }} />
                                <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <p style={{ margin: 0, color: '#FFF', fontWeight: 'bold', fontSize: '13px', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{currentStory.userName}</p>
                                        {currentStory.creatorRole && <span style={{ fontSize: '9px', background: 'rgba(255,215,0,0.1)', color: '#FFD700', padding: '1px 5px', borderRadius: '4px', border: '1px solid rgba(255,215,0,0.3)', fontWeight: 'bold' }}>{currentStory.creatorRole}</span>}
                                    </div>
                                    <p style={{ margin: 0, color: '#AAA', fontSize: '10px' }}>{isOwner ? 'Your Story' : '⏱️ Flash Story'} • {Math.max(1, Math.floor((currentStory.expiresAtMs - Date.now())/3600000))}h left</p>
                                </div>
                            </div>

                            {/* Top-Right Close Button (Isolated at absolute top right) */}
                            <button onClick={() => { setActiveUserIndex(null); setPlayProgress(0); setSlideshowIndex(0); }} style={{ background: 'rgba(0,0,0,0.5)', color: '#FFF', border: 'none', borderRadius: '50%', width: '32px', height: '32px', cursor: 'pointer', fontSize: '16px', zIndex: 11 }}>✕</button>
                        </div>
                        {/* Left/Right Tap Areas for Navigation */}
                        <div onClick={handlePrevStory} style={{ position: 'absolute', top: '100px', bottom: 0, left: 0, width: '35%', zIndex: 5 }} />
                        <div onClick={handleNextStory} style={{ position: 'absolute', top: '100px', bottom: 0, right: 0, width: '35%', zIndex: 5 }} />

                        {/* Centered Clickable Link Button */}
                        {currentStory.storyLink && (
                            <div style={{ position: 'absolute', bottom: '40px', left: '50%', transform: 'translateX(-50%)', zIndex: 20 }}>
                                <button 
                                    onClick={() => window.open(currentStory.storyLink, '_blank')}
                                    style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(10px)', border: '1px solid #00FFFF', color: '#00FFFF', padding: '10px 20px', borderRadius: '20px', fontSize: '13px', fontWeight: '900', letterSpacing: '1px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 15px rgba(0, 255, 255, 0.3)' }}
                                >
                                    🔗 Visit Link
                                </button>
                            </div>
                        )}

                        {/* Middle-Right Vertical Stats Stack */}
                        <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: '12px', zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                            <style>{`
                                @keyframes flameBurst { 
                                    0% { transform: scale(1) rotate(0deg); filter: drop-shadow(0 0 5px #FF4500); } 
                                    50% { transform: scale(2.2) rotate(-12deg); filter: drop-shadow(0 0 25px #FFD700) drop-shadow(0 0 50px #FF4500); } 
                                    100% { transform: scale(1) rotate(0deg); filter: drop-shadow(0 0 5px #FF4500); } 
                                }
                                .flame-burst-anim { animation: flameBurst 0.7s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; z-index: 50; }
                                @keyframes popAndMorph { 0% { transform: scale(1); } 50% { transform: scale(1.4); } 100% { transform: scale(1); } }
                                .morph-anim { animation: popAndMorph 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; display: inline-block; }
                            `}</style>
                            
                            {/* Reward Gift Box (Top of the Stack) */}
                            {currentStory.rewardTitle && (
                                <button 
                                    onClick={() => setClaimingRewardStory(currentStory)}
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', zIndex: 20, marginBottom: '4px' }}
                                >
                                    <div style={{ width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #FF1493', borderRadius: '10px', background: 'rgba(255, 20, 147, 0.1)', boxShadow: '0 0 10px rgba(255, 20, 147, 0.5), inset 0 0 8px rgba(255, 20, 147, 0.3)' }}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="#FF1493" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="18" height="18" style={{ filter: 'drop-shadow(0 0 4px #FF1493)' }}>
                                            <polyline points="20 12 20 22 4 22 4 12"></polyline>
                                            <rect x="2" y="7" width="20" height="5"></rect>
                                            <line x1="12" y1="22" x2="12" y2="7"></line>
                                            <path d="M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7z"></path>
                                            <path d="M12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z"></path>
                                        </svg>
                                    </div>
                                    <span style={{ color: '#FF1493', fontSize: '9px', fontWeight: '900', textTransform: 'uppercase', textShadow: '0 0 5px #FF1493' }}>Reward</span>
                                </button>
                            )}

                            {/* Flame Tip Button (Outlined Gradient) */}
                            {!isOwner && (
                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                    <button 
                                        onClick={async () => {
                                            if ((creatorProfile?.arenaTokens || 0) < 1) {
                                                setShowTokenPrompt(true);
                                                return;
                                            }
                                            
                                            setFlameAnimId(currentStory.id);
                                            setFlashStories(prev => prev.map(s => s.id === currentStory.id ? { ...s, tipCount: (s.tipCount || 0) + 1 } : s));
                                            
                                            try {
                                                const tipFunc = httpsCallable(functions, 'tipStoryCreator');
                                                await tipFunc({ storyId: currentStory.id, storyUserId: currentStory.userId });
                                                showMessage("🔥 Sent 1 Pass Tip to Creator!");
                                            } catch (e) {
                                                setFlashStories(prev => prev.map(s => s.id === currentStory.id ? { ...s, tipCount: Math.max(0, (s.tipCount || 1) - 1) } : s));
                                                showMessage("Transaction failed: " + (e.message || "Could not process tip."));
                                            } finally {
                                                setTimeout(() => setFlameAnimId(null), 850);
                                            }
                                        }}
                                        style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                    >
                                        <svg className={flameAnimId === currentStory.id ? "flame-burst-anim" : ""} viewBox="0 0 24 24" fill="#000" stroke="url(#flameGrad)" strokeWidth="2" width="38" height="38" style={{ filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.9))' }}>
                                            <defs>
                                                <linearGradient id="flameGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#FFD700"/>
                                                    <stop offset="100%" stopColor="#FF4500"/>
                                                </linearGradient>
                                            </defs>
                                            <path d="M11.66 1.489a1.002 1.002 0 0 0-1.258.463C8.423 5.86 6 8.544 6 12c0 3.309 2.691 6 6 6s6-2.691 6-6c0-4.041-3.666-8.083-6.175-10.435a1.006 1.006 0 0 0-.165-.076Zm-1.42 12.016c-.73-.807-1.124-1.89-1.238-3.048.804 1.34 2.213 2.502 3.633 2.923a4.015 4.015 0 0 1-1.636 1.55c.003-.54-.257-1.02-.759-1.425Z" />
                                        </svg>
                                    </button>
                                    <span style={{ color: '#FFF', fontSize: '11px', fontWeight: 'bold', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{currentStory.tipCount || 0}</span>
                                </div>
                            )}

                            {/* Like Button (Firestore-backed 1-Like-Per-User) */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                <button 
                                    onClick={async () => {
                                        const isLiked = currentStory.likedUsers?.includes(currentUser?.uid) || likedStories.has(currentStory.id);
                                        if (isOwner || isLiked || !currentUser) return;
                                        
                                        setLikedStories(prev => new Set(prev).add(currentStory.id));
                                        setLikeAnimId(currentStory.id);
                                        setFlashStories(prev => prev.map(s => s.id === currentStory.id ? { 
                                            ...s, 
                                            likeCount: (s.likeCount || 0) + 1,
                                            likedUsers: [...(s.likedUsers || []), currentUser.uid]
                                        } : s));

                                        try { 
                                            const { arrayUnion } = await import('firebase/firestore');
                                            await updateDoc(doc(db, "flash_stories", currentStory.id), { 
                                                likeCount: increment(1),
                                                likedUsers: arrayUnion(currentUser.uid)
                                            }); 
                                        } catch (e) { console.error("Like Error:", e); }
                                        setTimeout(() => setLikeAnimId(null), 400);
                                    }}
                                    style={{ background: 'transparent', border: 'none', cursor: isOwner ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <svg 
                                        className={likeAnimId === currentStory.id ? "morph-anim" : ""} 
                                        viewBox="0 0 24 24" 
                                        fill={(currentStory.likedUsers?.includes(currentUser?.uid) || likedStories.has(currentStory.id)) ? "#FFD700" : "#FFF"} 
                                        width="28" 
                                        height="28" 
                                        style={{ filter: (currentStory.likedUsers?.includes(currentUser?.uid) || likedStories.has(currentStory.id)) ? 'drop-shadow(0 0 12px #FFD700)' : 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))', transition: 'all 0.2s ease' }}
                                    >
                                        <path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z" />
                                    </svg>
                                </button>
                                <span style={{ color: (currentStory.likedUsers?.includes(currentUser?.uid) || likedStories.has(currentStory.id)) ? '#FFD700' : '#FFF', fontSize: '11px', fontWeight: 'bold', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{currentStory.likeCount || 0}</span>
                            </div>

                            {/* Views (Always visible) */}
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                                <div style={{ background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg viewBox="0 0 24 24" fill="#FFF" width="28" height="28" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}>
                                        <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 10c-2.48 0-4.5-2.02-4.5-4.5S9.52 5.5 12 5.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5zM12 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                                    </svg>
                                </div>
                                <span style={{ color: '#FFF', fontSize: '11px', fontWeight: 'bold', textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>{currentStory.viewCount || 0}</span>
                            </div>

                            {/* Share / Download Wrapper */}
                            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                <button 
                                    onClick={() => setShowOptionsId(showOptionsId === 'share' ? null : 'share')}
                                    style={{ background: 'transparent', border: 'none', color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}
                                >
                                    <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}>
                                        <path d="M11.666 4.757a1 1 0 011.666-.757l7.632 6.643a1 1 0 010 1.514l-7.632 6.643a1 1 0 01-1.666-.757V14.15C5.812 14.15 2 17.5 2 22c0-5.833 3.167-11.667 9.666-13.064V4.757z"/>
                                    </svg>
                                </button>
                                {showOptionsId === 'share' && (
                                    <div style={{ position: 'absolute', bottom: '40px', right: '40px', background: 'rgba(15,15,15,0.95)', border: '1px solid #333', borderRadius: '12px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '150px', zIndex: 50, backdropFilter: 'blur(10px)' }}>
                                        <button onClick={() => {
                                            setShowOptionsId(null);
                                            const url = `${window.location.origin}/story/${currentStory.id}`;
                                            if (navigator.share) { navigator.share({ title: 'NVA Story', url }); } 
                                            else { navigator.clipboard.writeText(url); showMessage('Link copied!'); }
                                        }} style={{ background: 'transparent', border: 'none', color: '#FFF', textAlign: 'left', padding: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>🔗 Share Link</button>
                                        
                                        <button onClick={async () => {
                                            setShowOptionsId(null);
                                            showMessage('Downloading video...');
                                            try {
                                                // GOD-TIER FIX: Fetches dedicated watermarked file for downloads
                                                const res = await fetch(currentStory.downloadUrl || currentStory.videoUrl);
                                                const blob = await res.blob();
                                                const a = document.createElement('a');
                                                a.href = URL.createObjectURL(blob);
                                                a.download = `NVA_Story_${currentStory.userName.replace(/\s+/g, '_')}.mp4`;
                                                a.click();
                                            } catch(e) { showMessage('Download failed.'); }
                                        }} style={{ background: 'transparent', border: 'none', color: '#FFF', textAlign: 'left', padding: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', borderTop: '1px solid #333' }}>📥 Download Video</button>
                                    </div>
                                )}
                            </div>

                            {/* Owner Edit Action (Sits in stack natively, Uploader intercepts without deleting) */}
                            {isOwner && (
                                <button 
                                    onClick={() => {
                                        setShowOptionsId(null);
                                        setActiveUserIndex(null);
                                        setEditingStoryId(currentStory.id);
                                        setStoryCaption(currentStory.caption || '');
                                        setTextFont(currentStory.textFont || 'sans-serif');
                                        setTextCoords(currentStory.textCoords || {x:50,y:50});
                                        setStoryAudience(currentStory.audience || 'public');
                                        setStoryPreviewUrl(currentStory.videoUrl);
                                        setVideoPanX(currentStory.videoPanX || 50);
                                        setTextWidthPercent(currentStory.textWidthPercent || 70);
                                        setTextColor(currentStory.textColor || '#FFFFFF');
                                        setTextSize(currentStory.textSize || 14);
                                        setTrimStart(currentStory.trimStart || 0);
                                        setTrimEnd(currentStory.trimEnd || 60);
                                        setHasReward(!!currentStory.rewardTitle);
                                        if(currentStory.rewardTitle) {
                                            setRewardValue(currentStory.rewardTitle);
                                            setRewardType(currentStory.rewardType);
                                            setRewardCap(currentStory.rewardCap);
                                        }
                                        setShowUploaderModal(true);
                                    }}
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px', marginTop: '4px' }}
                                >
                                    <svg viewBox="0 0 100 70" width="34" height="24" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}>
                                        <defs>
                                            <linearGradient id="neonCameraGradEdit" x1="0%" y1="0%" x2="100%" y2="100%">
                                                <stop offset="0%" stopColor="#EA4335" />
                                                <stop offset="30%" stopColor="#FBBC05" />
                                                <stop offset="60%" stopColor="#34A853" />
                                                <stop offset="85%" stopColor="#4285F4" />
                                                <stop offset="100%" stopColor="#FF007F" />
                                            </linearGradient>
                                        </defs>
                                        <path d="M35 15 L42 5 L58 5 L65 15 Z" fill="none" stroke="url(#neonCameraGradEdit)" strokeWidth="5" strokeLinejoin="round" />
                                        <rect x="5" y="15" width="90" height="50" rx="12" fill="none" stroke="url(#neonCameraGradEdit)" strokeWidth="5" />
                                        <circle cx="50" cy="40" r="16" fill="none" stroke="url(#neonCameraGradEdit)" strokeWidth="5" />
                                        <circle cx="50" cy="40" r="6" fill="url(#neonCameraGradEdit)" />
                                    </svg>
                                </button>
                            )}

                            {/* Trash Bin Delete Action (Owner, Admin, Super Admin, Moderator) */}
                            {(isOwner || creatorProfile?.role === 'admin' || creatorProfile?.role === 'super_admin' || creatorProfile?.role === 'moderator') && (
                                <button 
                                    onClick={() => setDeletingStory(currentStory)}
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px', marginTop: '4px' }}
                                    title="Delete Story"
                                >
                                    <svg viewBox="0 0 24 24" fill="#FF4500" width="28" height="28" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}>
                                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                                    </svg>
                                </button>
                            )}

                            {/* 3-Dots Menu (Strictly for Reports and Admin Deletion) */}
                            {(!isOwner || creatorProfile?.role === 'admin' || creatorProfile?.role === 'super_admin' || creatorProfile?.role === 'moderator') && (
                                <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                    <button 
                                        onClick={() => setShowOptionsId(showOptionsId === 'more' ? null : 'more')}
                                        style={{ background: 'transparent', border: 'none', color: '#FFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}
                                    >
                                        <svg viewBox="0 0 24 24" fill="currentColor" width="28" height="28" style={{ filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.8))' }}>
                                            <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                                        </svg>
                                    </button>

                                    {showOptionsId === 'more' && (
                                        <div style={{ position: 'absolute', bottom: '40px', right: '40px', background: 'rgba(15,15,15,0.95)', border: '1px solid #333', borderRadius: '12px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '150px', zIndex: 50, backdropFilter: 'blur(10px)' }}>
                                            {!isOwner && (
                                                <button onClick={() => {
                                                    setShowOptionsId(null);
                                                    window.dispatchEvent(new CustomEvent('openReportModal', { detail: currentStory }));
                                                }} style={{ background: 'transparent', border: 'none', color: '#EF4444', textAlign: 'left', padding: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold' }}>🚩 Report Content</button>
                                            )}

                                            {(creatorProfile?.role === 'admin' || creatorProfile?.role === 'super_admin' || creatorProfile?.role === 'moderator') && (
                                                <button onClick={() => {
                                                    setShowOptionsId(null);
                                                    if(window.confirm("ADMIN: Permanently remove this user's story?")) {
                                                        setActiveUserIndex(null);
                                                        if (currentStory.videoUrl && currentStory.videoUrl.includes('firebasestorage')) {
                                                            const fileRef = ref(storage, currentStory.videoUrl);
                                                            import('firebase/storage').then(({ deleteObject }) => deleteObject(fileRef)).catch(() => {});
                                                        }
                                                        deleteDoc(doc(db, "flash_stories", currentStory.id)).catch(() => {});
                                                        updateDoc(doc(db, "creators", currentStory.userId), { hasActiveStory: false }).catch(() => {});
                                                        showMessage("Story removed.");
                                                    }
                                                }} style={{ background: 'transparent', border: 'none', color: '#EF4444', textAlign: 'left', padding: '8px', cursor: 'pointer', fontSize: '13px', fontWeight: 'bold', borderTop: !isOwner ? '1px solid #333' : 'none' }}>🛡️ Admin: Delete</button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Token Purchase Prompt Modal */}
                        {showTokenPrompt && (
                            <div style={{ position: 'absolute', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <div style={{ position: 'relative', background: '#111', border: '1px solid #FF4500', borderRadius: '20px', padding: '25px', maxWidth: '300px', width: '90%', textAlign: 'center', boxShadow: '0 0 30px rgba(255,69,0,0.5)' }}>
                                    <button onClick={() => setShowTokenPrompt(false)} style={{ position: 'absolute', top: '12px', right: '12px', background: 'transparent', border: 'none', color: '#888', cursor: 'pointer', fontSize: '18px' }}>✕</button>
                                    <div style={{ fontSize: '40px', marginBottom: '10px' }}>🔥</div>
                                    <p style={{ color: '#FFF', fontSize: '16px', fontWeight: 'bold', margin: '0 0 10px 0' }}>Insufficient Tokens</p>
                                    <p style={{ color: '#AAA', fontSize: '12px', margin: '0 0 20px 0', lineHeight: '1.4' }}>You need at least 1 Arena Token to send a flame tip to this creator.</p>
                                    <button 
                                        onClick={() => {
                                            setShowTokenPrompt(false);
                                            setIsVaultOpen(true); // Player stays mounted in background and pauses
                                        }}
                                        style={{ width: '100%', background: 'linear-gradient(90deg, #FF4500, #FF8C00)', color: '#FFF', border: 'none', padding: '12px', borderRadius: '12px', fontWeight: '900', fontSize: '14px', cursor: 'pointer', boxShadow: '0 0 15px rgba(255,69,0,0.4)' }}
                                    >
                                        🎟️ Get Tokens
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* ====== IN-APP DELETE STORY CONFIRMATION MODAL ====== */}
            {deletingStory && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 12000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ background: '#111', border: '1px solid #FF4500', borderRadius: '20px', padding: '25px', maxWidth: '340px', width: '100%', textAlign: 'center', boxShadow: '0 0 30px rgba(255,69,0,0.4)' }}>
                        <div style={{ width: '50px', height: '50px', borderRadius: '50%', background: 'rgba(255,69,0,0.15)', border: '1px solid #FF4500', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 15px auto' }}>
                            <svg viewBox="0 0 24 24" fill="#FF4500" width="26" height="26">
                                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
                            </svg>
                        </div>

                        <p style={{ color: '#FFF', fontSize: '17px', fontWeight: '900', margin: '0 0 8px 0' }}>Delete Flash Story?</p>
                        <p style={{ color: '#AAA', fontSize: '12px', margin: '0 0 20px 0', lineHeight: '1.4' }}>This video and its stats will be permanently removed from the network.</p>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                            <button 
                                onClick={() => setDeletingStory(null)}
                                style={{ background: '#222', color: '#FFF', border: '1px solid #333', padding: '12px', borderRadius: '12px', fontWeight: 'bold', fontSize: '13px', cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                            <button 
                                onClick={async () => {
                                    const storyToDelete = deletingStory;
                                    setDeletingStory(null);
                                    setActiveUserIndex(null);
                                    setFlashStories(prev => prev.filter(s => s.id !== storyToDelete.id));

                                    try {
                                        if (storyToDelete.videoUrl && storyToDelete.videoUrl.includes('firebasestorage')) {
                                            const fileRef = ref(storage, storyToDelete.videoUrl);
                                            const { deleteObject } = await import('firebase/storage');
                                            deleteObject(fileRef).catch(() => {});
                                        }
                                        await deleteDoc(doc(db, "flash_stories", storyToDelete.id));
                                        await updateDoc(doc(db, "creators", storyToDelete.userId), { hasActiveStory: false }).catch(() => {});
                                        showMessage("Story deleted successfully.");
                                    } catch (e) {
                                        showMessage("Failed to delete story.");
                                    }
                                }}
                                style={{ background: 'linear-gradient(90deg, #FF4500, #DC2626)', color: '#FFF', border: 'none', padding: '12px', borderRadius: '12px', fontWeight: '900', fontSize: '13px', cursor: 'pointer', boxShadow: '0 0 15px rgba(255,69,0,0.4)' }}
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ====== IN-APP REWARD CLAIM MODAL ====== */}
            {claimingRewardStory && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
                    <div style={{ background: '#111', border: '1px solid #FFD700', borderRadius: '20px', padding: '25px', maxWidth: '360px', width: '100%', textAlign: 'center' }}>
                        <p style={{ color: '#FFD700', fontSize: '18px', fontWeight: '900', margin: '0 0 10px 0' }}>🎁 CLAIM REWARD</p>
                        <p style={{ color: '#FFF', fontSize: '14px', fontWeight: 'bold', margin: '0 0 5px 0' }}>{claimingRewardStory.rewardTitle}</p>
                        <p style={{ color: '#888', fontSize: '12px', margin: '0 0 20px 0' }}>Offered by {claimingRewardStory.userName}</p>

                        {claimedCode ? (
                            <div style={{ background: 'rgba(0,255,255,0.1)', border: '1px solid #00FFFF', padding: '15px', borderRadius: '12px', marginBottom: '20px' }}>
                                <p style={{ color: '#888', fontSize: '10px', textTransform: 'uppercase', margin: '0 0 4px 0' }}>Your Unique Reward Code</p>
                                <p style={{ color: '#00FFFF', fontSize: '22px', fontWeight: '900', letterSpacing: '2px', margin: 0, fontFamily: 'monospace' }}>{claimedCode}</p>
                            </div>
                        ) : (
                            <button 
                                disabled={isClaiming || (claimingRewardStory.claimedCount || 0) >= (claimingRewardStory.rewardCap || 50)}
                                onClick={async () => {
                                    setIsClaiming(true);
                                    try {
                                        const code = `NVA-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
                                        await updateDoc(doc(db, "flash_stories", claimingRewardStory.id), { claimedCount: increment(1) });
                                        
                                        // 1. Save Code to User's Profile
                                        await addDoc(collection(db, "creators", currentUser.uid, "claimedRewards"), {
                                            code,
                                            rewardTitle: claimingRewardStory.rewardTitle,
                                            creatorName: claimingRewardStory.userName,
                                            claimedAt: new Date()
                                        });

                                        // 2. Deliver Code directly to User's Inbox Notifications
                                        await addDoc(collection(db, "notifications"), {
                                            userId: currentUser.uid,
                                            title: "🎁 Reward Claimed!",
                                            message: `You claimed "${claimingRewardStory.rewardTitle}" from ${claimingRewardStory.userName}! Your Code: ${code}`,
                                            type: "REWARD_CLAIMED",
                                            createdAt: new Date(),
                                            read: false
                                        }).catch(() => {});

                                        setClaimedCode(code);
                                        showMessage("Reward claimed & code sent to your Inbox!");
                                    } catch (e) { showMessage("Claim failed"); }
                                    finally { setIsClaiming(false); }
                                }}
                                style={{ width: '100%', background: '#FFD700', color: '#000', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: '900', fontSize: '14px', cursor: 'pointer', marginBottom: '15px' }}
                            >
                                {isClaiming ? "Claiming..." : "🎁 Generate My Code"}
                            </button>
                        )}

                        <button onClick={() => { setClaimingRewardStory(null); setClaimedCode(null); }} style={{ background: 'transparent', color: '#888', border: 'none', cursor: 'pointer', fontSize: '12px' }}>Close</button>
                    </div>
                </div>
            )}

            {/* ====== IN-APP CUSTOM CAMERA OVERLAY (With Glowing Burnt Gold Ring) ====== */}
            {showCamera && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 11000, background: '#000', display: 'flex', flexDirection: 'column' }}>
                    {/* Top Bar */}
                    <div style={{ position: 'absolute', top: '20px', left: '20px', right: '20px', zIndex: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <button onClick={closeInAppCamera} style={{ background: 'rgba(0,0,0,0.5)', color: '#FFF', border: 'none', width: '36px', height: '36px', borderRadius: '50%', fontSize: '18px', cursor: 'pointer' }}>✕</button>
                        {isRecording && <div style={{ background: 'rgba(255,0,0,0.8)', color: '#FFF', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold', animation: 'pulse 1s infinite' }}>REC</div>}
                        <button onClick={flipCamera} disabled={isRecording} style={{ background: 'rgba(0,0,0,0.5)', color: '#FFF', border: 'none', width: '40px', height: '40px', borderRadius: '50%', fontSize: '18px', cursor: isRecording ? 'not-allowed' : 'pointer', opacity: isRecording ? 0.5 : 1 }}>
                            🔄
                        </button>
                    </div>

                    {/* Live Viewfinder */}
                    <video ref={liveCameraRef} autoPlay playsInline muted style={{ flex: 1, width: '100%', objectFit: 'cover' }} />

                    {/* Bottom Controls */}
                    <div style={{ position: 'absolute', bottom: '40px', left: 0, right: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 10 }}>
                        <div 
                            style={{ position: 'relative', width: '80px', height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            onMouseDown={!isRecording ? startRecording : stopRecording}
                            onTouchStart={!isRecording ? startRecording : stopRecording}
                        >
                            {/* SVG Glowing Progress Ring */}
                            <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'rotate(-90deg)', filter: isRecording ? 'drop-shadow(0 0 10px #FFD700)' : 'none' }}>
                                <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="6" />
                                <circle cx="50" cy="50" r="46" fill="none" stroke="#FFD700" strokeWidth="6" 
                                    strokeDasharray="289" strokeDashoffset={289 - (289 * recordingProgress) / 100} 
                                    style={{ transition: 'stroke-dashoffset 0.1s linear' }} 
                                />
                            </svg>
                            {/* Inner Record Button */}
                            <div style={{ width: isRecording ? '36px' : '56px', height: isRecording ? '36px' : '56px', backgroundColor: isRecording ? '#FF4500' : '#FFF', borderRadius: isRecording ? '8px' : '50%', transition: 'all 0.2s ease', zIndex: 2 }} />
                        </div>
                    </div>
                </div>
            )}

            {/* ====== REDESIGNED HIGH-FIDELITY FLASH STORY CREATOR SUITE ====== */}
            {showUploaderModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(15px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}>
                    <div style={{ background: '#0F0F0F', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px', padding: '20px', maxWidth: '440px', width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(0,0,0,0.9)' }}>
                        
                        {/* Header & Modes */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <div>
                                <p style={{ margin: 0, color: '#FFF', fontSize: '18px', fontWeight: '900', letterSpacing: '0.5px' }}>⚡ Post Flash Story</p>
                                <p style={{ margin: '2px 0 0 0', color: '#888', fontSize: '11px' }}>Auto-destructs when time runs out</p>
                            </div>
                            <button onClick={() => { setShowUploaderModal(false); setMediaType('video'); setStoryImages([]); setStoryLink(''); setEditingStoryId(null); }} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', color: '#FFF', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', fontSize: '16px' }}>✕</button>
                        </div>

                        {/* Media Mode Tabs */}
                        {!storyFile && storyImages.length === 0 && !editingStoryId && (
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', background: '#1A1A1A', padding: '4px', borderRadius: '12px' }}>
                                {['video', 'slideshow', 'text'].map(m => (
                                    <button 
                                        key={m} onClick={() => setMediaType(m)} 
                                        style={{ flex: 1, padding: '8px', borderRadius: '8px', border: 'none', background: mediaType === m ? '#FFD700' : 'transparent', color: mediaType === m ? '#000' : '#888', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', textTransform: 'capitalize' }}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* URL Sanitizer Overlay Guard */}
                        <div style={{ marginBottom: '15px' }}>
                            <input 
                                type="text" placeholder="🔗 Add a clickable link (e.g. yoursite.com)" value={storyLink} 
                                onChange={e => setStoryLink(e.target.value)} 
                                onBlur={() => { if (storyLink && !/^https?:\/\//i.test(storyLink)) setStoryLink(`https://${storyLink}`); }}
                                style={{ width: '100%', background: '#111', border: '1px solid #333', color: '#00FFFF', padding: '10px', borderRadius: '8px', fontSize: '12px', outline: 'none' }} 
                            />
                        </div>

                        <div style={{ marginBottom: '15px' }}>
                            {mediaType === 'video' && !storyFile && !editingStoryId ? (
                                <div>
                                    <div style={{ background: 'rgba(255,215,0,0.1)', border: '1px solid #FFD700', borderRadius: '10px', padding: '8px 12px', textAlign: 'center', marginBottom: '12px' }}>
                                        <p style={{ margin: 0, color: '#FFD700', fontSize: '11px', fontWeight: '900', letterSpacing: '0.5px' }}>⚡ FLASH STORIES ARE 1 MINUTE MAX</p>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', height: '160px' }}>
                                        <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #FFD700', borderRadius: '16px', background: 'rgba(255,215,0,0.03)', cursor: 'pointer', padding: '10px' }}>
                                            <span style={{ fontSize: '28px', marginBottom: '6px' }}>📁</span><span style={{ color: '#FFD700', fontSize: '12px', fontWeight: 'bold' }}>Gallery</span>
                                            <input type="file" accept="video/mp4,video/webm,video/*" onChange={e => {
                                                const file = e.target.files[0];
                                                if (file) { setStoryFile(file); setStoryPreviewUrl(URL.createObjectURL(file)); }
                                            }} style={{ display: 'none' }} />
                                        </label>
                                        <button type="button" onClick={openInAppCamera} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: '2px dashed #FF4500', borderRadius: '16px', background: 'rgba(255,69,0,0.03)', cursor: 'pointer', padding: '10px' }}>
                                            <span style={{ fontSize: '28px', marginBottom: '6px' }}>📹</span><span style={{ color: '#FF4500', fontSize: '12px', fontWeight: 'bold' }}>Camera</span>
                                        </button>
                                    </div>
                                </div>
                            ) : mediaType === 'slideshow' && storyImages.length === 0 ? (
                                <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '160px', border: '2px dashed #32CD32', borderRadius: '16px', background: 'rgba(50,205,50,0.03)', cursor: 'pointer' }}>
                                    <span style={{ fontSize: '28px', marginBottom: '6px' }}>📸</span><span style={{ color: '#32CD32', fontSize: '12px', fontWeight: 'bold' }}>Select Up to 5 Photos</span>
                                    <input type="file" accept="image/*" multiple onChange={e => {
                                        const files = Array.from(e.target.files).slice(0, 5);
                                        setStoryImages(files.map(f => ({ file: f, url: URL.createObjectURL(f) })));
                                    }} style={{ display: 'none' }} />
                                </label>
                            ) : mediaType === 'text' ? (
                                <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '10px', flexWrap: 'wrap' }}>
                                    {[
                                        '#0D0D0D', // Midnight Black
                                        'linear-gradient(45deg, #111111, #FFD700)', // Royal Gold
                                        'linear-gradient(45deg, #FF007F, #4A00E0)', // Cyberpunk Neon
                                        'linear-gradient(45deg, #FF4E50, #F9D423)', // Sunset Fire
                                        'linear-gradient(45deg, #0f0c29, #302b63, #24243e)' // Deep Space
                                    ].map((bg, i) => (
                                        <button key={i} onClick={() => setStoryBgColor(bg)} style={{ width: '28px', height: '28px', borderRadius: '50%', background: bg, border: storyBgColor === bg ? '2px solid #FFD700' : '1px solid #444', cursor: 'pointer', boxShadow: storyBgColor === bg ? '0 0 10px rgba(255,215,0,0.5)' : 'none' }} />
                                    ))}
                                </div>
                            ) : null}

                            {(storyFile || storyImages.length > 0 || mediaType === 'text') && (
                                <div style={{ position: 'relative', borderRadius: '16px', overflow: 'hidden', width: '100%', maxWidth: '300px', aspectRatio: '9/16', margin: '0 auto', background: mediaType === 'text' ? storyBgColor : '#000', border: '1px solid #333', touchAction: 'none' }}
                                    onMouseMove={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        if (isDraggingText) setTextCoords({ x: Math.max(5, Math.min(95, ((e.clientX - rect.left) / rect.width) * 100)), y: Math.max(5, Math.min(95, ((e.clientY - rect.top) / rect.height) * 100)) });
                                        else if (isResizingText) setTextWidthPercent(Math.max(25, Math.min(90, (Math.abs((e.clientX - rect.left) - ((textCoords.x / 100) * rect.width)) * 2 / rect.width) * 100)));
                                    }}
                                    onMouseUp={() => { setIsDraggingText(false); setIsResizingText(false); }} onMouseLeave={() => { setIsDraggingText(false); setIsResizingText(false); }}
                                    onTouchMove={(e) => {
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        if (isDraggingText) setTextCoords({ x: Math.max(5, Math.min(95, ((e.touches[0].clientX - rect.left) / rect.width) * 100)), y: Math.max(5, Math.min(95, ((e.touches[0].clientY - rect.top) / rect.height) * 100)) });
                                        else if (isResizingText) setTextWidthPercent(Math.max(25, Math.min(90, (Math.abs((e.touches[0].clientX - rect.left) - ((textCoords.x / 100) * rect.width)) * 2 / rect.width) * 100)));
                                    }}
                                    onTouchEnd={() => { setIsDraggingText(false); setIsResizingText(false); }}
                                >
                                    {mediaType === 'video' ? (
                                        <video ref={previewVideoRef} src={storyPreviewUrl || ''} crossOrigin="anonymous" autoPlay playsInline muted={isPreviewMuted} onLoadedMetadata={() => { if (previewVideoRef.current) { const dur = previewVideoRef.current.duration || 60; setVideoDuration(dur); setTrimEnd(Math.min(dur, 60)); } }} onTimeUpdate={() => { if (previewVideoRef.current && previewVideoRef.current.currentTime >= trimEnd) previewVideoRef.current.currentTime = trimStart; }} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: `${videoPanX}% 50%` }} />
                                    ) : mediaType === 'slideshow' ? (
                                        <img src={storyImages[0]?.url} alt="preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                    ) : null}

                                    {/* Video Clear & Mute Buttons */}
                                    {(storyFile || storyImages.length > 0) && (
                                        <div style={{ position: 'absolute', top: '10px', left: '10px', display: 'flex', gap: '8px', zIndex: 5 }}>
                                            <button onClick={() => { setStoryFile(null); setStoryImages([]); setStoryPreviewUrl(''); setEditingStoryId(null); }} style={{ background: 'rgba(220,53,69,0.9)', color: '#FFF', border: 'none', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer' }}>✕</button>
                                            {mediaType === 'video' && (
                                                <button onClick={() => setIsPreviewMuted(!isPreviewMuted)} style={{ background: 'rgba(0,0,0,0.7)', color: '#FFF', border: '1px solid #FFD700', borderRadius: '50%', width: '28px', height: '28px', cursor: 'pointer', fontSize: '12px' }}>
                                                    {isPreviewMuted ? '🔇' : '🔊'}
                                                </button>
                                            )}
                                        </div>
                                    )}

                                    {/* Positioned & Styled Text Overlay Preview */}
                                    {storyCaption && (
                                        <div 
                                            onMouseDown={(e) => { e.stopPropagation(); setIsDraggingText(true); }}
                                            onTouchStart={(e) => { e.stopPropagation(); setIsDraggingText(true); }}
                                            style={{ 
                                                position: 'absolute', 
                                                top: `${textCoords.y}%`, 
                                                left: `${textCoords.x}%`, 
                                                transform: 'translate(-50%, -50%)', 
                                                background: 'rgba(0,0,0,0.65)', 
                                                border: isDraggingText || isResizingText ? '2px dashed #00FFFF' : '1px solid #FFD700', 
                                                color: textColor, 
                                                padding: '6px 12px', 
                                                borderRadius: '8px', 
                                                fontSize: `${textSize}px`, 
                                                fontWeight: '900', 
                                                fontFamily: textFont,
                                                textAlign: 'center', 
                                                textShadow: '0 2px 4px rgba(0,0,0,0.9)', 
                                                width: `${textWidthPercent}%`,
                                                boxSizing: 'border-box',
                                                wordBreak: 'break-word',
                                                cursor: isDraggingText ? 'grabbing' : 'grab', 
                                                zIndex: 5,
                                                userSelect: 'none'
                                            }}>
                                            {storyCaption}

                                            {/* Right Resize Expansion Handle */}
                                            <div 
                                                onMouseDown={(e) => { e.stopPropagation(); setIsResizingText(true); }}
                                                onTouchStart={(e) => { e.stopPropagation(); setIsResizingText(true); }}
                                                style={{ position: 'absolute', right: '-6px', top: '50%', transform: 'translateY(-50%)', width: '12px', height: '12px', borderRadius: '50%', background: '#00FFFF', border: '2px solid #000', cursor: 'ew-resize', zIndex: 10 }}
                                                title="Drag to resize box width"
                                            />
                                            {/* Left Resize Expansion Handle */}
                                            <div 
                                                onMouseDown={(e) => { e.stopPropagation(); setIsResizingText(true); }}
                                                onTouchStart={(e) => { e.stopPropagation(); setIsResizingText(true); }}
                                                style={{ position: 'absolute', left: '-6px', top: '50%', transform: 'translateY(-50%)', width: '12px', height: '12px', borderRadius: '50%', background: '#00FFFF', border: '2px solid #000', cursor: 'ew-resize', zIndex: 10 }}
                                                title="Drag to resize box width"
                                            />
                                        </div>
                                    )}

                                    {/* Crop Panning & Dual-Thumb Scrubber */}
                                    <div style={{ position: 'absolute', bottom: '8px', left: '8px', right: '8px', background: 'rgba(0,0,0,0.85)', padding: '10px 14px', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '12px', zIndex: 4, border: '1px solid rgba(255,215,0,0.3)' }}>
                                        
                                        {/* Pan / Crop Slider */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <span style={{ fontSize: '14px', color: '#00FFFF', fontWeight: '900', letterSpacing: '2px', textShadow: '0 0 6px rgba(0,255,255,0.6)' }}>◀ ▶</span>
                                            <input 
                                                type="range" min="0" max="100" 
                                                value={videoPanX} onChange={(e) => setVideoPanX(Number(e.target.value))}
                                                style={{ flex: 1, accentColor: '#00FFFF' }} 
                                            />
                                        </div>

                                        <style>{`
                                            .dual-range { position: absolute; top: 0; left: 0; width: 100%; height: 100%; -webkit-appearance: none; background: transparent; pointer-events: none; margin: 0; outline: none; }
                                            .dual-range::-webkit-slider-thumb { pointer-events: auto; -webkit-appearance: none; width: 18px; height: 18px; border-radius: 50%; cursor: ew-resize; box-shadow: 0 2px 5px rgba(0,0,0,0.8); }
                                            .dual-range.start-thumb::-webkit-slider-thumb { background: #FFD700; border: 2px solid #FFF; }
                                            .dual-range.end-thumb::-webkit-slider-thumb { background: #FF4500; border: 2px solid #FFF; }
                                        `}</style>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: '#FFF', fontWeight: '900', letterSpacing: '0.5px' }}>
                                            <span>TRIM CLIP ({Math.round(trimEnd - trimStart)}s)</span>
                                            <span style={{ color: '#FFD700' }}>{trimStart.toFixed(1)}s — {trimEnd.toFixed(1)}s</span>
                                        </div>
                                        
                                        <div style={{ position: 'relative', width: '100%', height: '18px', display: 'flex', alignItems: 'center' }}>
                                            {/* Background Track */}
                                            <div style={{ position: 'absolute', width: '100%', height: '6px', background: '#333', borderRadius: '3px' }} />
                                            {/* Highlighted Range */}
                                            <div style={{ 
                                                position: 'absolute', 
                                                height: '6px', 
                                                background: 'linear-gradient(90deg, #FFD700, #FF4500)', 
                                                borderRadius: '3px',
                                                left: `${videoDuration > 0 ? (trimStart / videoDuration) * 100 : 0}%`,
                                                width: `${videoDuration > 0 ? ((trimEnd - trimStart) / videoDuration) * 100 : 100}%`
                                            }} />
                                            
                                            {/* Start Thumb */}
                                            <input 
                                                type="range" 
                                                className="dual-range start-thumb"
                                                min="0" 
                                                max={videoDuration || 60} 
                                                step="0.1" 
                                                value={trimStart} 
                                                onChange={e => { 
                                                    let val = Number(e.target.value); 
                                                    if (val > trimEnd - 1) val = trimEnd - 1; 
                                                    if (trimEnd - val > 60) setTrimEnd(val + 60); // Cap at 60s
                                                    setTrimStart(val); 
                                                    if (previewVideoRef.current) {
                                                        previewVideoRef.current.currentTime = val;
                                                        previewVideoRef.current.play().catch(() => {});
                                                    }
                                                }} 
                                            />
                                            {/* End Thumb */}
                                            <input 
                                                type="range" 
                                                className="dual-range end-thumb"
                                                min="0" 
                                                max={videoDuration || 60} 
                                                step="0.1" 
                                                value={trimEnd} 
                                                onChange={e => { 
                                                    let val = Number(e.target.value); 
                                                    if (val < trimStart + 1) val = trimStart + 1; 
                                                    if (val - trimStart > 60) setTrimStart(val - 60); // Cap at 60s
                                                    setTrimEnd(val); 
                                                    if (previewVideoRef.current) {
                                                        previewVideoRef.current.currentTime = val;
                                                        previewVideoRef.current.play().catch(() => {});
                                                    }
                                                }} 
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Caption Input + Position & Font Controls */}
                        <div style={{ marginBottom: '12px' }}>
                            <input type="text" placeholder="Add text overlay on video..." value={storyCaption} onChange={e => setStoryCaption(e.target.value)} style={{ width: '100%', background: '#1A1A1A', border: '1px solid #FFD700', color: '#FFF', padding: '10px 14px', borderRadius: '10px', fontSize: '12px', outline: 'none', marginBottom: '8px' }} />
                            
                            {/* Font Pills, Color Swatches & Size Controls */}
                            {storyCaption && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0, 255, 255, 0.1)', padding: '6px', borderRadius: '6px', border: '1px dashed #00FFFF' }}>
                                        <span style={{ fontSize: '10px', color: '#00FFFF', fontWeight: 'bold', letterSpacing: '0.5px' }}>👆 Drag text to move • Pull handles to expand</span>
                                    </div>
                                    
                                    {/* Font Family Selector (Expanded) */}
                                    <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        <span style={{ fontSize: '9px', color: '#888', fontWeight: 'bold', width: '45px' }}>FONT:</span>
                                        {[
                                            { id: 'sans-serif', label: 'Classic' },
                                            { id: 'Impact, sans-serif', label: 'Meme' },
                                            { id: '"Arial Black", sans-serif', label: 'Heavy' },
                                            { id: '"Comic Sans MS", cursive', label: 'Comic' },
                                            { id: '"Trebuchet MS", sans-serif', label: 'Modern' },
                                            { id: 'Georgia, serif', label: 'Story' },
                                            { id: 'monospace', label: 'Type' },
                                            { id: 'cursive', label: 'Script' }
                                        ].map(f => (
                                            <button key={f.id} type="button" onClick={() => setTextFont(f.id)} style={{ padding: '4px 8px', borderRadius: '6px', border: textFont === f.id ? '1px solid #00FFFF' : '1px solid #333', background: textFont === f.id ? '#00FFFF' : '#111', color: textFont === f.id ? '#000' : '#888', fontSize: '10px', fontWeight: 'bold', fontFamily: f.id, cursor: 'pointer' }}>
                                                {f.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Color Swatches & Size Selector in One Compact Row */}
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', justifyContent: 'space-between' }}>
                                        {/* Color Swatches */}
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <span style={{ fontSize: '9px', color: '#888', fontWeight: 'bold' }}>COLOR:</span>
                                            {['#FFFFFF', '#FFD700', '#00FFFF', '#FF1493', '#32CD32'].map(color => (
                                                <button 
                                                    key={color} 
                                                    type="button" 
                                                    onClick={() => setTextColor(color)} 
                                                    style={{ width: '18px', height: '18px', borderRadius: '50%', background: color, border: textColor === color ? '2px solid #FFF' : '1px solid #444', cursor: 'pointer', boxShadow: textColor === color ? `0 0 8px ${color}` : 'none', padding: 0 }} 
                                                />
                                            ))}
                                        </div>

                                        {/* Size Selector */}
                                        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                            <span style={{ fontSize: '9px', color: '#888', fontWeight: 'bold' }}>SIZE:</span>
                                            {[
                                                { sz: 11, lbl: 'S' },
                                                { sz: 14, lbl: 'M' },
                                                { sz: 18, lbl: 'L' }
                                            ].map(s => (
                                                <button 
                                                    key={s.sz} 
                                                    type="button" 
                                                    onClick={() => setTextSize(s.sz)} 
                                                    style={{ padding: '2px 8px', borderRadius: '6px', border: textSize === s.sz ? '1px solid #FFD700' : '1px solid #333', background: textSize === s.sz ? '#FFD700' : '#111', color: textSize === s.sz ? '#000' : '#888', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                                                >
                                                    {s.lbl}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Audience Selector (SYNTAX FIXED) */}
                        <div style={{ marginBottom: '15px' }}>
                            <p style={{ margin: '0 0 6px 0', fontSize: '10px', color: '#888', fontWeight: 'bold', textTransform: 'uppercase' }}>Who Can See This</p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                                {[
                                    { id: 'public', label: '🌐 Public' },
                                    { id: 'friends', label: '👥 Friends' },
                                    { id: 'close_friends', label: '⭐ Close Friends' }
                                ].map(opt => (
                                    <button key={opt.id} onClick={() => setStoryAudience(opt.id)} style={{ padding: '8px 4px', borderRadius: '8px', border: storyAudience === opt.id ? '1px solid #FFD700' : '1px solid #222', background: storyAudience === opt.id ? 'rgba(255,215,0,0.1)' : '#1A1A1A', color: storyAudience === opt.id ? '#FFD700' : '#888', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Tag Friends Section with Removable Avatar Chips */}
                        <div style={{ marginBottom: '15px', background: '#151515', padding: '12px', borderRadius: '12px', border: '1px solid #222' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '11px', color: '#AAA', fontWeight: 'bold' }}>Tag Friends</span>
                                <button onClick={() => setShowFriendsSheet(!showFriendsSheet)} style={{ background: 'transparent', border: 'none', color: '#FFD700', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}>+ Add</button>
                            </div>
                            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {taggedFriends.map(f => (
                                    <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(255,215,0,0.15)', border: '1px solid #FFD700', color: '#FFD700', padding: '2px 8px', borderRadius: '12px', fontSize: '10px', fontWeight: 'bold' }}>
                                        @{f.userName}
                                        <button onClick={() => setTaggedFriends(prev => prev.filter(item => item.id !== f.id))} style={{ background: 'none', border: 'none', color: '#FFD700', cursor: 'pointer', padding: 0 }}>✕</button>
                                    </span>
                                ))}
                                {taggedFriends.length === 0 && <span style={{ color: '#555', fontSize: '11px' }}>No friends tagged</span>}
                            </div>
                        </div>

                        {/* Friend Tagging Slide-Up Bottom Sheet (Debounced CPU Fix) */}
                        {showFriendsSheet && (
                            <div style={{ background: '#1A1A1A', border: '1px solid #333', borderRadius: '12px', padding: '12px', marginBottom: '15px', maxHeight: '160px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
                                <input type="text" placeholder="Search friends..." 
                                    onChange={e => {
                                        const val = e.target.value;
                                        if (window.friendSearchTimeout) clearTimeout(window.friendSearchTimeout);
                                        window.friendSearchTimeout = setTimeout(() => setFriendSearchQuery(val), 300); // UI un-freeze
                                    }} 
                                    style={{ width: '100%', background: '#000', border: '1px solid #333', color: '#FFF', padding: '6px 10px', borderRadius: '6px', fontSize: '11px', marginBottom: '8px' }} 
                                />
                                {myFriendsList.filter(f => (f.userName || '').toLowerCase().includes(friendSearchQuery.toLowerCase())).slice(0, 15).map(f => (
                                    <div key={f.id} onClick={() => { if (!taggedFriends.some(t => t.id === f.id)) setTaggedFriends([...taggedFriends, f]); }} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px', cursor: 'pointer', borderBottom: '1px solid #222' }}>
                                        <img src={f.userProfilePicture || 'https://placehold.co/30'} alt="Avatar" style={{ width: '24px', height: '24px', borderRadius: '50%' }} />
                                        <span style={{ fontSize: '12px', color: '#FFF' }}>{f.userName || 'Friend'}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Toggleable Preset Reward Giveaway */}
                        <div style={{ marginBottom: '15px', background: 'rgba(255,215,0,0.03)', border: '1px solid rgba(255,215,0,0.2)', padding: '12px', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ color: '#FFD700', fontSize: '12px', fontWeight: 'bold' }}>🎁 Attach a Reward</span>
                                <input type="checkbox" checked={hasReward} onChange={e => setHasReward(e.target.checked)} style={{ accentColor: '#FFD700', cursor: 'pointer' }} />
                            </div>
                            
                            {hasReward && (
                                <>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginBottom: '8px' }}>
                                        {[
                                            { id: 'ticket', label: '🎟️ Ticket' },
                                            { id: 'credits', label: '💎 Credits' },
                                            { id: 'discount', label: '🏷️ Discount' },
                                            { id: 'link', label: '🔗 Link' }
                                        ].map(t => (
                                            <button key={t.id} onClick={() => setRewardType(t.id)} style={{ padding: '6px 2px', borderRadius: '6px', border: rewardType === t.id ? '1px solid #FFD700' : '1px solid #333', background: rewardType === t.id ? '#FFD700' : '#111', color: rewardType === t.id ? '#000' : '#888', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                                                {t.label}
                                            </button>
                                        ))}
                                    </div>
                                    <input type="text" placeholder="Reward Code / Title (e.g. NVA2024)" value={rewardValue} onChange={e => setRewardValue(e.target.value)} style={{ width: '100%', background: '#000', border: '1px solid #333', color: '#FFF', padding: '8px', borderRadius: '6px', fontSize: '11px', marginBottom: '6px' }} />
                                    <input type="number" placeholder="Claim Cap (e.g. 50)" value={rewardCap} onChange={e => setRewardCap(e.target.value)} style={{ width: '100%', background: '#000', border: '1px solid #333', color: '#FFF', padding: '8px', borderRadius: '6px', fontSize: '11px' }} />
                                </>
                            )}
                        </div>

                        {/* Capped Story Lifespan Pills (15m, 2h default, 6h max) */}
                        <div style={{ marginBottom: '20px' }}>
                            <p style={{ margin: '0 0 6px 0', fontSize: '10px', color: '#888', fontWeight: 'bold', textTransform: 'uppercase' }}>Story Lifespan</p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px' }}>
                                {[
                                    { id: '15m', label: '15m (Flash)', hrs: 0.25 },
                                    { id: '2h', label: '2h (Standard)', hrs: 2 },
                                    { id: '6h', label: '6h (Max Cap)', hrs: 6 }
                                ].map(pill => (
                                    <button key={pill.id} onClick={() => setStoryLifespan(pill.id)} style={{ padding: '10px', borderRadius: '10px', border: storyLifespan === pill.id ? '2px solid #FF4500' : '1px solid #222', background: storyLifespan === pill.id ? 'rgba(255,69,0,0.15)' : '#1A1A1A', color: storyLifespan === pill.id ? '#FF4500' : '#888', fontSize: '11px', fontWeight: '900', cursor: 'pointer' }}>
                                        {pill.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Submit Actions */}
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button onClick={() => { setShowUploaderModal(false); setEditingStoryId(null); }} style={{ flex: 1, background: '#222', color: '#888', border: '1px solid #333', padding: '14px', borderRadius: '12px', cursor: 'pointer', fontWeight: 'bold' }}>Cancel</button>
                            <button 
                                disabled={(!storyFile && !editingStoryId) || isUploadingStory}
                                onClick={async () => {
                                    setIsUploadingStory(true);
                                    if (previewVideoRef.current) previewVideoRef.current.pause(); // FIX: Halts playback loop during upload
                                    try {
                                        let finalVideoUrl = storyPreviewUrl;
                                        let finalExpiresAtMs = Date.now() + (2 * 60 * 60 * 1000); // default

                                        let finalMediaUrls = [];
                                        const getR2Url = httpsCallable(functions, 'getR2UploadUrl');
                                        let rawFileKey = null;

                                        if (mediaType === 'video' && storyFile) {
                                            setUploadProgress(0);
                                            rawFileKey = `tmp-raw-uploads/${currentUser.uid}/raw_${Date.now()}.mp4`;

                                            // A. Upload raw file to R2 /tmp-raw-uploads/
                                            const { data: r2Data } = await getR2Url({ filePath: rawFileKey, contentType: storyFile.type || 'video/mp4' });

                                            await new Promise((resolve, reject) => {
                                                const xhr = new XMLHttpRequest();
                                                xhr.open('PUT', r2Data.uploadUrl, true);
                                                xhr.setRequestHeader('Content-Type', storyFile.type || 'video/mp4');
                                                
                                                xhr.upload.onprogress = (e) => {
                                                    if (e.lengthComputable) {
                                                        setUploadProgress(Math.round((e.loaded / e.total) * 100));
                                                    }
                                                };
                                                
                                                xhr.onload = () => {
                                                    if (xhr.status >= 200 && xhr.status < 300) resolve();
                                                    else reject(new Error('R2 Raw Upload Failed'));
                                                };
                                                xhr.onerror = () => reject(new Error('Network Error'));
                                                xhr.send(storyFile);
                                            });

                                            // Temporary video URL while Tokyo VPS processes 1080p watermark
                                            finalMediaUrls[0] = r2Data.publicUrl;

                                        } else if (mediaType === 'slideshow' && storyImages.length > 0) {
                                            setUploadProgress(-1);
                                            const promises = storyImages.map(async (imgObj, i) => {
                                                const filePath = `stories/${currentUser.uid}/photo_${Date.now()}_${i}.jpg`;
                                                const { data: r2Data } = await getR2Url({ filePath, contentType: imgObj.file.type || 'image/jpeg' });
                                                
                                                await fetch(r2Data.uploadUrl, {
                                                    method: 'PUT',
                                                    body: imgObj.file,
                                                    headers: { 'Content-Type': imgObj.file.type || 'image/jpeg' }
                                                });
                                                return r2Data.publicUrl;
                                            });
                                            finalMediaUrls = await Promise.all(promises);
                                            setUploadProgress(100);
                                        }

                                        const hrsMap = { '15m': 0.25, '2h': 2, '6h': 6 };
                                        const hrs = hrsMap[storyLifespan] || 2;
                                        finalExpiresAtMs = Date.now() + (hrs * 60 * 60 * 1000);

                                        const payload = {
                                            userId: currentUser.uid,
                                            userName: creatorProfile?.creatorName || currentUser.displayName || 'Creator',
                                            userProfilePicture: creatorProfile?.profilePictureUrl || currentUser.photoURL || '',
                                            mediaType: mediaType,
                                            videoUrl: mediaType === 'video' ? "" : finalMediaUrls[0], // FIX: Prevents raw 500MB file leak to UI
                                            images: mediaType === 'slideshow' ? finalMediaUrls : null,
                                            storyBgColor: mediaType === 'text' ? storyBgColor : null,
                                            storyLink: storyLink.trim() || null,
                                            caption: storyCaption.trim() || null,
                                            textCoords: textCoords,
                                            textFont: textFont,
                                            audience: storyAudience,
                                            taggedFriends: taggedFriends.map(f => ({ id: f.id, userName: f.userName })),
                                            expiresAt: new Date(finalExpiresAtMs),
                                            videoPanX: videoPanX,
                                            textWidthPercent: textWidthPercent,
                                            textColor: textColor,
                                            textSize: textSize,
                                            trimStart: trimStart,
                                            trimEnd: trimEnd,
                                            processing: mediaType === 'video', // Flag for processing state
                                            rewardTitle: hasReward ? rewardValue : null,
                                            rewardType: hasReward ? rewardType : null,
                                            rewardCap: hasReward ? (Number(rewardCap) || 50) : 0,
                                        };

                                        if (editingStoryId) {
                                            await updateDoc(doc(db, "flash_stories", editingStoryId), payload);
                                            showMessage("⚡ Flash Story updated!");
                                        } else {
                                            payload.createdAt = serverTimestamp();
                                            payload.claimedCount = 0;
                                            payload.viewCount = 0;
                                            payload.tipCount = 0;
                                            payload.likeCount = 0;
                                            
                                            const newDoc = await addDoc(collection(db, "flash_stories"), payload);
                                            await updateDoc(doc(db, "creators", currentUser.uid), { hasActiveStory: true });

                                            // GOD-TIER FIX: Uses Caddy HTTPS reverse proxy to bypass mobile browser mixed-content security blocks
                                            if (mediaType === 'video' && rawFileKey) {
                                                fetch('https://engine.nvanetworkapp.com/api/process-story', {
                                                    method: 'POST',
                                                    headers: { 
                                                        'Content-Type': 'application/json',
                                                        'Authorization': `Bearer ${import.meta.env.VITE_ENGINE_API_KEY}`
                                                    },
                                                    body: JSON.stringify({
                                                        rawFileKey: rawFileKey,
                                                        storyId: newDoc.id,
                                                        trimStart: Math.round(trimStart),
                                                        trimDuration: Math.round(trimEnd - trimStart)
                                                    })
                                                }).then(res => {
                                                    if (!res.ok) throw new Error("Server rejected API Key.");
                                                }).catch(async (e) => {
                                                    console.error("Tokyo Engine Ping Error:", e);
                                                    await updateDoc(doc(db, "flash_stories", newDoc.id), { processing: false, error: true }).catch(()=>{});
                                                    showMessage("Error: Server blocked request. Check API key.");
                                                });
                                            }
                                            
                                            taggedFriends.forEach(async (f) => {
                                                await addDoc(collection(db, "notifications"), {
                                                    userId: f.id, title: "🏷️ Tagged in a Flash Story!",
                                                    message: `${creatorProfile?.creatorName || 'A creator'} tagged you in a Flash Story.`,
                                                    type: "TAGGED_IN_STORY", createdAt: new Date(), read: false
                                                }).catch(() => {});
                                            });
                                            showMessage(mediaType === 'video' ? "Finishing up..." : "⚡ Flash Story posted!");
                                        }

                                        setShowUploaderModal(false);
                                        setEditingStoryId(null);
                                        setStoryFile(null);
                                        setStoryPreviewUrl('');
                                        setStoryCaption('');
                                        setTaggedFriends([]);
                                        setStoryImages([]);
                                        setStoryLink('');
                                        setMediaType('video');
                                        setUploadProgress(0);
                                    } catch (e) { showMessage("Upload failed: " + e.message); }
                                    finally { setIsUploadingStory(false); }
                                }}
                                style={{ flex: 1.5, background: 'linear-gradient(135deg, #FF4500 0%, #FF8C00 100%)', color: '#FFF', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: '900', cursor: 'pointer', fontSize: '13px', textTransform: 'uppercase', boxShadow: '0 0 20px rgba(255,69,0,0.4)' }}
                            >
                                {isUploadingStory ? (
                                    uploadProgress < 0 
                                        ? `Finalizing ${'.'.repeat(Math.abs(uploadProgress))}` 
                                        : `Uploading... [${uploadProgress}%]`
                                ) : (editingStoryId ? "💾 Save Updates" : "⚡ Publish Flash Story")}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Global Roast Token Vault */}
            <RoastTokenVault 
                isOpen={isVaultOpen} 
                onClose={() => setIsVaultOpen(false)} 
                currentUser={currentUser}
                creatorProfile={creatorProfile}
                showMessage={showMessage}
            />
        </div>
    );
};

export default HomeScreen;