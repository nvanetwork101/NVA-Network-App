import React, { useState, useEffect, useRef } from 'react';
import { db, storage, ref, uploadBytes, getDownloadURL, extractVideoInfo } from '../firebase';
import GiftTicketModal from './GiftTicketModal';
import ShareButton from './ShareButton';
import { 
    collection, 
    doc, 
    query, 
    where, 
    orderBy, 
    onSnapshot, 
    setDoc, 
    getDocs, 
    updateDoc,
    deleteDoc,
    addDoc
} from 'firebase/firestore';

const TMDB_API_KEY = "3a5d4d1236db785a5f685d4bb4ca74c1"; 

// TMDb Genre ID Translator Map
const TMDB_GENRE_MAP = {
    28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime", 
    99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 
    36: "History", 27: "Horror", 10402: "Music", 9648: "Mystery", 
    10749: "Romance", 878: "Sci-Fi", 10770: "TV Movie", 53: "Thriller", 
    10752: "War", 37: "Western"
}; 

const FilmArenaScreen = ({ setActiveScreen, currentUser, creatorProfile, showMessage, setPledgeContext }) => {
    const [activeTab, setActiveTab] = useState('cinemas'); // 'cinemas' | 'multiplex' | 'arena' | 'discussions' | 'watchlist'
    const [movies, setMovies] = useState([]);
    const [selectedMovie, setSelectedMovie] = useState(null);
    
    // THE FIX: Removed the "isTicketed" restriction so Free events created in Admin Event Manager populate in the Arena.
    const [liveEvents, setLiveEvents] = useState([]);
    const [homeScreenLayout, setHomeScreenLayout] = useState({});
    
    useEffect(() => {
        const q = query(collection(db, "events")); 
        const unsub = onSnapshot(q, (snap) => {
            setLiveEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        const unsub = onSnapshot(doc(db, "settings", "homeScreenLayout"), (snap) => {
            if (snap.exists()) setHomeScreenLayout(snap.data());
        });
        return () => unsub();
    }, []);

    // Scroll Position Preservation System (Placed safely after state initialization)
    const scrollPositionRef = useRef(0);

    // Track vertical scrolling position using event capture for container scrolls
    useEffect(() => {
        const handleScroll = () => {
            if (!selectedMovie) {
                // Read from scrolling container div, falling back to window scroll
                const container = document.querySelector('.container') || document.querySelector('.screenContainer');
                if (container) {
                    scrollPositionRef.current = container.scrollTop;
                } else {
                    scrollPositionRef.current = window.scrollY || document.documentElement.scrollTop || document.body.scrollTop;
                }
            }
        };
        // Adding true (useCapture) ensures we catch scroll events on inner containers as well
        window.addEventListener('scroll', handleScroll, true);
        return () => window.removeEventListener('scroll', handleScroll, true);
    }, [selectedMovie]);

    // Automatically snap back to saved coordinates upon closing details
    useEffect(() => {
        if (!selectedMovie && scrollPositionRef.current > 0) {
            setTimeout(() => {
                const saved = scrollPositionRef.current;
                
                // Restore container scroll
                const container = document.querySelector('.container') || document.querySelector('.screenContainer');
                if (container) {
                    container.scrollTop = saved;
                } else {
                    // Fallback to window scroll
                    window.scrollTo(0, saved);
                    if (document.documentElement) document.documentElement.scrollTop = saved;
                    if (document.body) document.body.scrollTop = saved;
                }
            }, 50); // Mild timeout buffer to allow DOM render to settle
        }
    }, [selectedMovie]);
    const [feedFilter, setFeedFilter] = useState('all'); // 'all' | 'movie' | 'tv' | 'anime' | 'custom'
    const [searchTerm, setSearchTerm] = useState(''); // Live search input value

    // Edit Published Movie States
    const [isEditingMovie, setIsEditingMovie] = useState(false);
    const [editFormTitle, setEditFormTitle] = useState('');
    const [editFormPosterUrl, setEditFormPosterUrl] = useState('');
    const [editFormSynopsis, setEditFormSynopsis] = useState('');
    const [editFormVideoUrl, setEditFormVideoUrl] = useState('');
    const [editFormTrailerUrl, setEditFormTrailerUrl] = useState(''); // NEW
    const [editFormCategory, setEditFormCategory] = useState('movie');
    const [editFormGenre, setEditFormGenre] = useState('Drama');
    const [editFormTicketPrice, setEditFormTicketPrice] = useState('5.00');

    // Delete In-App Modal States
    const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false);
    const [movieToDeleteId, setMovieToDeleteId] = useState(null);
    
    // Suggestion Modal State
    const [showSuggestionModal, setShowSuggestionModal] = useState(false);
    const [isCustomProduction, setIsCustomProduction] = useState(false); 
    const [openedFromArenaTab, setOpenedFromArenaTab] = useState(false); // Tracks modal launching source
    const [suggestMediaType, setSuggestMediaType] = useState('movie'); // 'movie' | 'tv' | 'anime'
    const [tmdbStagingMovie, setTmdbStagingMovie] = useState(null);
    const [bookingRoom, setBookingRoom] = useState('Room 1');
    const [bookingDate, setBookingDate] = useState('');
    const [bookingPrice, setBookingPrice] = useState('5.00');
    const [showGiftModal, setShowGiftModal] = useState(false);
    const [modalEventDetails, setModalEventDetails] = useState(null);

    // THE FIX: 3-Hour Timeslot Clash Detector (Timestamp Safe)
    const checkTimeslotClash = async (room, timestamp) => {
        const reqTime = new Date(timestamp).getTime();
        const threeHours = 3 * 60 * 60 * 1000;
        
        const parseTime = (t) => {
            if (!t) return 0;
            if (t.toMillis) return t.toMillis();
            if (t.seconds) return t.seconds * 1000;
            const parsed = new Date(t).getTime();
            return isNaN(parsed) ? 0 : parsed;
        };

        const qMovies = query(collection(db, "movies"), where("room", "==", room));
        const snapMovies = await getDocs(qMovies);
        for(let doc of snapMovies.docs) {
            const d = doc.data();
            const bookedTime = parseTime(d.premiereDate);
            if(bookedTime > 0 && Math.abs(bookedTime - reqTime) < threeHours) return true;
        }
        
        const qSugg = query(collection(db, "movieSuggestions"), where("room", "==", room), where("status", "==", "pending"));
        const snapSugg = await getDocs(qSugg);
        for(let doc of snapSugg.docs) {
            const d = doc.data();
            const bookedTime = parseTime(d.premiereDate);
            if(bookedTime > 0 && Math.abs(bookedTime - reqTime) < threeHours) return true;
        }
        return false;
    };
    
    // TMDb Live Search State (With Pagination)
    const [tmdbQuery, setTmdbQuery] = useState('');
    const [tmdbResults, setTmdbResults] = useState([]);
    const [isSearchingTMDb, setIsSearchingTMDb] = useState(false);
    const [trendingItems, setTrendingItems] = useState([]);
    const [tmdbPage, setTmdbPage] = useState(1);
    const [tmdbTotalPages, setTmdbTotalPages] = useState(1);

    // Custom Production State
    const [customTitle, setCustomTitle] = useState('');
    const [customPoster, setCustomPoster] = useState('');
    const [customSynopsis, setCustomSynopsis] = useState('');
    const [customVideoUrl, setCustomVideoUrl] = useState('');
    const [customTrailerUrl, setCustomTrailerUrl] = useState(''); // NEW: Trailer Support
    const [uploadingImage, setUploadingImage] = useState(false);

    // Live Card Comments State Engine
    const [expandedCommentId, setExpandedCommentId] = useState(null);
    const [cardComments, setCardComments] = useState([]);
    const [newCardComment, setNewCardComment] = useState('');
    const [commentsLimit, setCommentsLimit] = useState(10);

    // Load comments dynamically when a card is expanded
    useEffect(() => {
        if (!expandedCommentId) {
            setCardComments([]);
            return;
        }
        const q = query(collection(db, "eventComments"), where("eventId", "==", expandedCommentId));
        const unsub = onSnapshot(q, (snap) => {
            const comments = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            comments.sort((a, b) => {
                const tA = a.timestamp?.toMillis ? a.timestamp.toMillis() : new Date(a.timestamp).getTime();
                const tB = b.timestamp?.toMillis ? b.timestamp.toMillis() : new Date(b.timestamp).getTime();
                return tB - tA; // Newest first
            });
            setCardComments(comments);
        });
        return () => unsub();
    }, [expandedCommentId, commentsLimit]);

    const handlePostCardComment = async (eventId) => {
        if (!currentUser) return showMessage("Please log in to comment.");
        if (!newCardComment.trim()) return;
        try {
            await addDoc(collection(db, "eventComments"), {
                eventId: eventId,
                userId: currentUser.uid,
                userName: creatorProfile?.creatorName || currentUser.displayName || "User",
                text: newCardComment.trim(),
                timestamp: new Date()
            });
            setNewCardComment('');
        } catch (error) {
            showMessage("Failed to post comment.");
        }
    };

    const handleDeleteCardComment = async (commentId) => {
        if (!window.confirm("Delete this comment?")) return;
        try { await deleteDoc(doc(db, "eventComments", commentId)); } 
        catch (e) { showMessage("Failed to delete."); }
    };

    // Admin Queue State
    const [pendingSuggestions, setPendingSuggestions] = useState([]);
    const [showAdminQueue, setShowAdminQueue] = useState(false);

    // Watchlist State
    const [watchlistIds, setWatchlistIds] = useState(new Set());

    // Discussions Board State
    const [discussions, setDiscussions] = useState([]);
    const [selectedThread, setSelectedThread] = useState(null);
    const [threadReplies, setThreadReplies] = useState([]);
    const [showNewThreadModal, setShowNewThreadModal] = useState(false);
    const [newThreadTitle, setNewThreadTitle] = useState('');
    const [newThreadText, setNewThreadText] = useState('');
    const [replyText, setReplyText] = useState('');

    // Option 2: Firestore-Synced Poll States & Managers
    const [pollConfig, setPollConfig] = useState(null);
    const [showPollManager, setShowPollManager] = useState(false);
    const [editMovieA, setEditMovieA] = useState('');
    const [editMovieB, setEditMovieB] = useState('');
    const [editQuestion, setEditQuestion] = useState('Which of these masterpieces had the better screenplay?');
    const [pollMatchFilter, setPollMatchFilter] = useState('movie'); // 'movie' | 'tv' | 'anime' | 'custom'
    const [pollGenreFilter, setPollGenreFilter] = useState('all'); // 'all' | 'Action' | 'Comedy' | 'Drama' | 'Horror' | 'Sci-Fi' | 'Documentary'

    // Custom Production form genre
    const [customGenre, setCustomGenre] = useState('Drama');

    // Review form state
    const [userReviewText, setUserReviewText] = useState('');
    const [userScore, setUserScore] = useState(50);
    const [isSubmittingReview, setIsSubmittingReview] = useState(false);
    const [movieReviews, setMovieReviews] = useState([]);

    // Role checks - THE FIX: Allow Super Admins to inherit Admin & Moderator controls
    const isAdmin = creatorProfile?.role === 'admin' || creatorProfile?.role === 'super_admin' || currentUser?.email === 'nvanetwork101@gmail.com';
    const isMod = creatorProfile?.role === 'moderator' || creatorProfile?.role === 'admin' || creatorProfile?.role === 'super_admin' || currentUser?.email === 'nvanetwork101@gmail.com';

    // Helper: Determine if TMDb payload is Japanese Anime
    const checkIsAnime = (item) => {
        const isAnimation = item.genre_ids?.includes(16) || item.genres?.some(g => g.id === 16);
        const isJapanese = item.original_language === 'ja' || item.origin_country?.includes('JP');
        return isAnimation && isJapanese;
    };

    
    // Listen for Movies

    // Listen for live Forum Discussions
    useEffect(() => {
        if (activeTab !== 'discussions') return;
        const q = query(collection(db, "discussions"));
        const unsub = onSnapshot(q, (snap) => {
            const docs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Safe in-memory sort by creation date descending
            docs.sort((a, b) => {
                const timeA = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime()) : 0;
                const timeB = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime()) : 0;
                return timeB - timeA;
            });
            setDiscussions(docs);
        });
        return () => unsub();
    }, [activeTab]);

    // Live Discussion Thread Creation
    const handleCreateThread = async () => {
        if (!newThreadTitle.trim() || !newThreadText.trim()) return;
        try {
            await addDoc(collection(db, "discussions"), {
                title: newThreadTitle.trim(),
                text: newThreadText.trim(),
                authorId: currentUser.uid,
                authorName: creatorProfile?.creatorName || currentUser.displayName || "Creator",
                createdAt: new Date(),
                replyCount: 0
            });
            showMessage("Discussion thread started!");
            setShowNewThreadModal(false);
            setNewThreadTitle('');
            setNewThreadText('');
        } catch (err) {
            showMessage("Failed to create thread.");
        }
    };

    // Admin/Mod Action: Enable/Disable RSVP Watch-Parties on TMDb movies/series/anime
    const handleToggleRSVP = async (movie) => {
        try {
            const nextStatus = !movie.hasActiveRSVP;
            await updateDoc(doc(db, "movies", movie.id), {
                hasActiveRSVP: nextStatus
            });
            setSelectedMovie(prev => ({ ...prev, hasActiveRSVP: nextStatus }));
            showMessage(nextStatus ? "RSVPs successfully enabled for this film!" : "RSVPs disabled.");
        } catch (err) {
            showMessage("Failed to update RSVP status.");
        }
    };

    // Admin/Mod Action: Enable/Disable "Watch" Button (Direct Video Link Access)
    const handleToggleWatchEnabled = async (movie) => {
        try {
            const nextStatus = !movie.watchEnabled;
            await updateDoc(doc(db, "movies", movie.id), {
                watchEnabled: nextStatus
            });
            setSelectedMovie(prev => ({ ...prev, watchEnabled: nextStatus }));
            showMessage(nextStatus ? '"Watch" link is now visible to users!' : '"Watch" link is now hidden.');
        } catch (err) {
            showMessage("Failed to update Watch status.");
        }
    };

    // Auto-Pull Thumbnail from Video URL
    const handleVideoUrlChange = (url) => {
        setCustomVideoUrl(url);
        const info = extractVideoInfo(url);
        if (info && info.thumbnailUrl && info.platform !== 'generic') {
            setCustomPoster(info.thumbnailUrl);
            showMessage("Pulled video thumbnail preview!");
        }
    };

    // Admin/Mod Action: 100% Client-Side Mutual Exclusion for "Now Showing: Free"
    const handleToggleFreeTag = async (movie) => {
        try {
            const nextStatus = !movie.isNowShowingFree;
            
            // If turning ON, hunt down any other active free screenings and disable them first
            if (nextStatus) {
                const qMovies = query(collection(db, "movies"), where("isNowShowingFree", "==", true));
                const snapMovies = await getDocs(qMovies);
                const updatesMovies = snapMovies.docs.map(d => updateDoc(d.ref, { isNowShowingFree: false }));
                await Promise.all(updatesMovies);
                
                const qEvents = query(collection(db, "events"), where("isNowShowingFree", "==", true));
                const snapEvents = await getDocs(qEvents);
                const updatesEvents = snapEvents.docs.map(d => updateDoc(d.ref, { isNowShowingFree: false }));
                await Promise.all(updatesEvents);
            }

            // Apply the status to the targeted film
            const targetCollection = (movie.eventTitle || movie.isEvent || movie.type === 'premiere') ? "events" : "movies";
            await updateDoc(doc(db, targetCollection, movie.id), { isNowShowingFree: nextStatus });
            
            // If it's a premiere, sync the duplicate document in the movies collection just in case
            if (targetCollection === "events") {
                await updateDoc(doc(db, "movies", movie.id), { isNowShowingFree: nextStatus }).catch(()=>console.log("No duplicate movie doc"));
            } else if (movie.type === 'premiere') {
                await updateDoc(doc(db, "events", movie.id), { isNowShowingFree: nextStatus }).catch(()=>console.log("No duplicate event doc"));
            }
            
            if (selectedMovie && selectedMovie.id === movie.id) {
                setSelectedMovie(prev => ({ ...prev, isNowShowingFree: nextStatus }));
            }
            showMessage(nextStatus ? "🔓 Marked as 'Now Showing: Free'!" : "Removed 'Now Showing: Free' tag.");
        } catch (error) {
            showMessage("Failed to update Free Screening status.");
        }
    };

    // Admin/Mod Action: Toggle Pin Status Universal (Handles both Movies & Live Events)
    const handleTogglePin = async (movie) => {
        const isEvent = !!movie.eventTitle || !!movie.isEvent;
        const targetCollection = isEvent ? "events" : "movies";
        
        const pinnedCountMovies = movies.filter(m => m.isPinned).length;
        const pinnedCountEvents = liveEvents.filter(m => m.isPinned).length;
        const totalPinned = pinnedCountMovies + pinnedCountEvents;

        if (!movie.isPinned && totalPinned >= 2) {
            showMessage("You can only pin a maximum of 2 films globally.");
            return;
        }
        try {
            await updateDoc(doc(db, targetCollection, movie.id), {
                isPinned: !movie.isPinned
            });
            if (selectedMovie && selectedMovie.id === movie.id) {
                setSelectedMovie(prev => ({ ...prev, isPinned: !movie.isPinned }));
            }
            showMessage(movie.isPinned ? "Unpinned from top." : "Pinned to the top!");
        } catch (error) {
            console.error("Pin error:", error);
            showMessage("Failed to update pin status.");
        }
    };

    // Direct Image Upload to Firebase Storage with automatic download URL state update
    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadingImage(true);
        try {
            const fileRef = ref(storage, `showcase_posters/${currentUser.uid}_${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            const downloadUrl = await getDownloadURL(fileRef);
            setCustomPoster(downloadUrl);
            showMessage("Poster artwork uploaded successfully!");
        } catch (err) {
            showMessage("Image upload failed.");
        } finally {
            setUploadingImage(false);
        }
    };

    // Listen for User's Watchlist (Synchronized with creators/{uid}/savedOpportunities)
    useEffect(() => {
        if (!currentUser?.uid) return;
        const q = query(collection(db, "creators", currentUser.uid, "savedOpportunities"));
        const unsub = onSnapshot(q, 
            (snap) => setWatchlistIds(new Set(snap.docs.map(doc => doc.id))),
            (err) => console.error("Watchlist listener failed:", err)
        );
        return () => unsub();
    }, [currentUser]);

    // Toggle Movie on Personal Watchlist
    const handleToggleWatchlist = async (movie) => {
        if (!currentUser) {
            showMessage("Please log in to manage your watchlist.");
            return;
        }
        const movieRef = doc(db, "creators", currentUser.uid, "savedOpportunities", movie.id);
        try {
            if (watchlistIds.has(movie.id)) {
                await deleteDoc(movieRef);
                showMessage("Removed from Watchlist.");
            } else {
                await setDoc(movieRef, {
                    title: movie.title,
                    posterUrl: movie.posterUrl,
                    category: movie.category || "movie",
                    type: movie.type || "free", // Preserves Multiplex type
                    premiereDate: movie.premiereDate || null, // Preserves Showtime
                    room: movie.room || null, // Preserves Room Number
                    criticScore: movie.criticScore || 0,
                    audienceScore: movie.audienceScore || 0,
                    timestamp: new Date()
                });
                showMessage("Added to Watchlist!");
            }
        } catch (err) {
            showMessage("Failed to update Watchlist.");
        }
    };

    // Option 3: 1-Click Local RSVP (Claim Ticket)
    const handleRSVP = async (movie) => {
        if (!currentUser) {
            showMessage("Please log in to RSVP.");
            return;
        }
        try {
            const rsvpId = `${movie.id}_${currentUser.uid}`;
            await setDoc(doc(db, "paymentPledges", rsvpId), {
                userId: currentUser.uid,
                userName: creatorProfile?.creatorName || currentUser.displayName || "Member",
                movieId: movie.id,
                movieTitle: movie.title,
                status: "pending", // Integrates directly into your Admin EventTicket / Check-In dashboard
                paymentType: "eventTicket", // FIXED: Matches backend approvePledge evaluation schema perfectly
                timestamp: new Date()
            });
            showMessage("RSVP claimed! Ticket registered to your dashboard.");
        } catch (err) {
            showMessage("RSVP failed. Try again.");
        }
    };

    // Listen for live globally synced matchup poll
    useEffect(() => {
        const unsub = onSnapshot(doc(db, "settings", "filmFaceOff"), (snap) => {
            if (snap.exists()) {
                setPollConfig(snap.data());
            } else {
                setPollConfig({
                    movieATitle: "Inception",
                    movieBTitle: "The Matrix",
                    question: "Which of these masterpieces had the better screenplay?",
                    votesA: 0,
                    votesB: 0,
                    votedUsers: {}
                });
            }
        });
        return () => unsub();
    }, []);

    // Cast Live Vote in Firestore (Protects against double voting)
    const handlePollVote = async (option) => {
        if (!currentUser) {
            showMessage("Please log in to vote.");
            return;
        }
        if (pollConfig?.votedUsers && pollConfig.votedUsers[currentUser.uid]) {
            showMessage("You have already voted in this matchup!");
            return;
        }
        try {
            const updatedVotes = option === 'A' ? (pollConfig.votesA || 0) + 1 : (pollConfig.votesA || 0);
            const updatedVotesB = option === 'B' ? (pollConfig.votesB || 0) + 1 : (pollConfig.votesB || 0);
            
            await updateDoc(doc(db, "settings", "filmFaceOff"), {
                votesA: updatedVotes,
                votesB: updatedVotesB,
                [`votedUsers.${currentUser.uid}`]: option
            });
            showMessage("Vote successfully cast!");
        } catch (err) {
            showMessage("Failed to cast vote.");
        }
    };

    // Admin/Mod Action: Dynamically Toggle Live Matchup Visibility
    const handleTogglePollActive = async (newStatus) => {
        try {
            await updateDoc(doc(db, "settings", "filmFaceOff"), {
                isActive: newStatus
            });
            showMessage(newStatus ? "Weekly Face-Off is now visible!" : "Weekly Face-Off has been hidden.");
        } catch (err) {
            showMessage("Failed to update visibility. Check if a matchup is deployed first.");
        }
    };

    // Deploy Custom Matchup (Admins can type any movie name, like 1950 classics)
    const handleDeployCustomPoll = async (e) => {
        e.preventDefault();
        if (!editMovieA.trim() || !editMovieB.trim()) return;
        try {
            await setDoc(doc(db, "settings", "filmFaceOff"), {
                movieATitle: editMovieA.trim(),
                movieBTitle: editMovieB.trim(),
                question: editQuestion.trim(),
                votesA: 0,
                votesB: 0,
                votedUsers: {},
                isActive: true // Force Visibility state to True upon deploying a fresh poll
            });
            showMessage("New matchup deployed live!");
            setShowPollManager(false);
            setEditMovieA('');
            setEditMovieB('');
        } catch (err) {
            showMessage("Failed to deploy matchup.");
        }
    };

    // Auto-Pick (Failsafe Category + Strict Same-Genre Matched Algorithm)
    const handleAutoPickPoll = () => {
        const categoryMovies = movies.filter(m => (m.category || 'movie') === pollMatchFilter);
        
        let pool = [];
        let selectedGenreForMatch = pollGenreFilter;

        if (pollGenreFilter === 'all') {
            // Group by genre to ensure we pick two of the EXACT SAME genre
            const groupedByGenre = {};
            categoryMovies.forEach(m => {
                const g = m.genre || 'Drama';
                if (!groupedByGenre[g]) groupedByGenre[g] = [];
                groupedByGenre[g].push(m);
            });
            
            // Find a genre with at least 2 movies
            const validGenres = Object.keys(groupedByGenre).filter(g => groupedByGenre[g].length >= 2);
            if (validGenres.length === 0) {
                showMessage(`Need at least 2 published items of the SAME genre in Category "${pollMatchFilter.toUpperCase()}" to auto-pick.`);
                return;
            }
            // Pick the valid genre with highest volume/score (defaulting to the first available valid pair)
            selectedGenreForMatch = validGenres[0]; 
            pool = groupedByGenre[selectedGenreForMatch];
        } else {
            pool = categoryMovies.filter(m => (m.genre || 'Drama') === pollGenreFilter);
        }
        
        if (pool.length < 2) {
            showMessage(`Need at least 2 published items matching Category "${pollMatchFilter.toUpperCase()}" & Genre "${selectedGenreForMatch.toUpperCase()}" to auto-pick.`);
            return;
        }

        const sorted = [...pool].sort((a, b) => {
            const scoreA = ((a.criticScore || 0) + (a.audienceScore || 0)) / 2;
            const scoreB = ((b.criticScore || 0) + (b.audienceScore || 0)) / 2;
            return scoreB - scoreA; // Highest rated first
        });

        setEditMovieA(sorted[0]?.title || "");
        setEditMovieB(sorted[1]?.title || "");

        // Auto-generate context-aware questions injected with the specific genre
        let questionText = `Which of these ${selectedGenreForMatch} masterpieces had the better screenplay?`;
        if (pollMatchFilter === 'tv') questionText = `Which ${selectedGenreForMatch} TV Series had the better plot twists?`;
        if (pollMatchFilter === 'anime') questionText = `Which ${selectedGenreForMatch} Anime featured the cooler animation?`;
        if (pollMatchFilter === 'custom') questionText = `Which ${selectedGenreForMatch} Indie Showcase had better cinematography?`;
        
        setEditQuestion(questionText);
        showMessage(`Auto-picked top 2 ${selectedGenreForMatch.toUpperCase()} ${pollMatchFilter.toUpperCase()}s! Review and click Deploy.`);
    };

    // Listen for Movies (With 7-Day Hard Purge & 24-Hour Zero Ticket Auto-Cancel)
    useEffect(() => {
        const q = query(collection(db, "movies"));
        const unsub = onSnapshot(q, (snap) => {
            const now = Date.now();
            const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
            const twentyFourHoursMs = 24 * 60 * 60 * 1000;
            const twoHoursMs = 2 * 60 * 60 * 1000; // THE FIX: 2-Hour Grace Period for testing
            const validMovies = [];
            
            snap.docs.forEach(docSnap => {
                const d = docSnap.data();
                if (d.type === 'premiere' && d.premiereDate) {
                    const pTime = new Date(d.premiereDate).getTime();
                    const appTime = d.approvedAt ? new Date(d.approvedAt).getTime() : now;
                    
                    // 1. 7-Day Hard Purge (After Premiere)
                    if (now - pTime > sevenDaysMs) {
                        deleteDoc(docSnap.ref).catch(e => console.log("Purge error:", e));
                        deleteDoc(doc(db, "events", docSnap.id)).catch(e => {}); // Purge event too
                        return; // Skip adding to state
                    }

                    // 2. 24-Hour Auto-Cancel for ZERO Tickets (Bypassed if newly approved for testing)
                    if (pTime - now <= twentyFourHoursMs && pTime > now) {
                        if (now - appTime > twoHoursMs) {
                            if (!d.ticketsSold || d.ticketsSold === 0) {
                                deleteDoc(docSnap.ref).catch(e => console.log("Auto-cancel error:", e));
                                deleteDoc(doc(db, "events", docSnap.id)).catch(e => {}); // Purge event too to prevent ghost events
                                if (d.creatorId || d.suggestedBy) {
                                    const targetUid = d.creatorId || d.suggestedBy;
                                    updateDoc(doc(db, "creators", targetUid), {
                                        latestNotification: { message: `Your Watch Party for "${d.title}" was canceled due to zero ticket sales 24 hours prior. Build anticipation and try again!`, timestamp: new Date().toISOString() }
                                    }).catch(e => console.log(e));
                                }
                                return; // Skip adding to state
                            }
                        }
                    }
                }
                validMovies.push({ id: docSnap.id, ...d });
            });
            setMovies(validMovies);
        });
        return () => unsub();
    }, []);

    // Fetch Weekly Trending TMDb Items on Mount to populate Suggestion Modal (with Bulletproof Offline Fallbacks)
    useEffect(() => {
        const fetchTrending = async () => {
            try {
                const res = await fetch(`https://api.themoviedb.org/3/trending/all/week?api_key=${TMDB_API_KEY}`);
                if (!res.ok) throw new Error("API call failed");
                const data = await res.json();
                setTrendingItems(data.results?.slice(0, 15) || []);
            } catch (err) {
                console.warn("TMDb API offline or unreachable. Loading local trending fallback...");
                setTrendingItems([
                    { id: 27205, title: "Inception", media_type: "movie", vote_average: 8.4, overview: "A thief who steals corporate secrets through the use of dream-sharing technology...", poster_path: "/oYu2v3CXvZ97SgY2g0v9G77g49C.jpg" },
                    { id: 155, title: "The Dark Knight", media_type: "movie", vote_average: 8.5, overview: "Batman raises the stakes in his war on crime...", poster_path: "/qJ2tW6WMUDg9s7m869cxUGBbI9U.jpg" },
                    { id: 603, title: "The Matrix", media_type: "movie", vote_average: 8.2, overview: "Set in the 22nd century, The Matrix tells the story of a computer hacker...", poster_path: "/f89U3wL3vOIsz66MRSTgGYCH64T.jpg" },
                    { id: 1399, title: "Game of Thrones", media_type: "tv", vote_average: 8.4, overview: "Seven noble families fight for control of the mythical land of Westeros...", poster_path: "/1XS1is8V8zG070ZCcOpm960u9vI.jpg" },
                    { id: 37854, title: "One Piece", media_type: "tv", genre_ids: [16], original_language: "ja", vote_average: 8.7, overview: "Luffy and his crew search for the ultimate treasure...", poster_path: "/c386Yg269RE7g76g96g5v9G77g49C.jpg" }
                ]);
            }
        };
        fetchTrending();
    }, []);

    // Listen for Reviews of selected movie (Client-side sorting to bypass Firestore composite index requirement)
    useEffect(() => {
        if (!selectedMovie?.id) {
            setMovieReviews([]);
            return;
        }
        const q = query(collection(db, "movieReviews"), where("movieId", "==", selectedMovie.id));
        const unsub = onSnapshot(q, (snap) => {
            const loadedReviews = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            loadedReviews.sort((a, b) => {
                const tA = a.timestamp?.toMillis ? a.timestamp.toMillis() : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
                const tB = b.timestamp?.toMillis ? b.timestamp.toMillis() : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
                return tA - tB;
            });
            setMovieReviews(loadedReviews);
        }, (err) => console.error("Reviews listener failed:", err));
        return () => unsub();
    }, [selectedMovie]);

    // Listen for Pending Suggestions
    useEffect(() => {
        if (!isAdmin) {
            setPendingSuggestions([]);
            return;
        }
        const q = query(collection(db, "movieSuggestions"), where("status", "==", "pending"));
        const unsub = onSnapshot(q, 
            (snap) => setPendingSuggestions(snap.docs.map(doc => ({ id: doc.id, ...doc.data() }))),
            (err) => console.error("Admin Queue listener failed:", err)
        );
        return () => unsub();
    }, [isAdmin]);

    // TMDb Live Search Engine (With Dynamic Page Requests)
    const handleTMDbSearch = async (e, pageNum = 1) => {
        if (e) e.preventDefault();
        if (!tmdbQuery.trim()) return;
        setIsSearchingTMDb(true);
        setTmdbPage(pageNum);
        try {
            const typeParam = suggestMediaType === 'anime' ? 'tv' : suggestMediaType;
            const res = await fetch(`https://api.themoviedb.org/3/search/${typeParam}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(tmdbQuery)}&page=${pageNum}`);
            const data = await res.json();
            setTmdbResults(data.results || []);
            setTmdbTotalPages(data.total_pages || 1);
        } catch (err) {
            showMessage("Search failed. Verify connectivity.");
        } finally {
            setIsSearchingTMDb(false);
        }
    };

    // Verify & Stage TMDb Movie before booking Room and Time
    const handleSelectTMDbMovie = async (movie) => {
        const targetTitle = movie.title || movie.name;
        if (!targetTitle) return;

        try {
            if (openedFromArenaTab) {
                // VOD PATHWAY: Ensure we don't suggest VOD duplicates
                const publishedQuery = query(collection(db, "movies"), where("title", "==", targetTitle), where("type", "!=", "premiere"));
                const publishedSnap = await getDocs(publishedQuery);
                if (!publishedSnap.empty) {
                    showMessage("This title is already published in the Arena!");
                    return;
                }

                const pendingQuery = query(
                    collection(db, "movieSuggestions"), 
                    where("title", "==", targetTitle),
                    where("status", "==", "pending"),
                    where("type", "!=", "premiere")
                );
                const pendingSnap = await getDocs(pendingQuery);
                if (!pendingSnap.empty) {
                    showMessage("This title has already been suggested and is awaiting review!");
                    return;
                }

                // Auto-suggest to Public Arena directly
                const initialScore = movie.vote_average ? Math.round(movie.vote_average * 10) : 75;
                const isAnimeResult = checkIsAnime(movie);
                const finalCategory = isAnimeResult ? 'anime' : (suggestMediaType === 'tv' ? 'tv' : 'movie');
                const primaryGenreId = movie.genre_ids && movie.genre_ids[0];
                const mappedGenre = primaryGenreId ? (TMDB_GENRE_MAP[primaryGenreId] || "Drama") : "Drama";

                await addDoc(collection(db, "movieSuggestions"), {
                    title: targetTitle,
                    posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : 'https://placehold.co/300x450/1A1A1A/FFF?text=NVA',
                    synopsis: movie.overview || "No synopsis available.",
                    suggestedBy: currentUser.uid,
                    suggestedByName: creatorProfile?.creatorName || currentUser.displayName || "User",
                    isCustomProduction: false,
                    initialCriticScore: initialScore,
                    category: finalCategory,
                    genre: mappedGenre,
                    type: 'free',
                    status: "pending",
                    timestamp: new Date()
                });
                showMessage("Film suggestion successfully submitted to standard VOD Arena suggestions!");
                setShowSuggestionModal(false);
            } else {
                // WATCH PARTY PATHWAY: Bypass VOD library checks & proceed directly to Room/Time Booking popup
                setTmdbStagingMovie(movie); 
            }
        } catch (err) {
            showMessage("Failed to verify movie.");
        }
    };

    const confirmTMDbBooking = async (e) => {
        e.preventDefault();
        if(!bookingDate) return showMessage("Please select a date and time.");
        const isClash = await checkTimeslotClash(bookingRoom, bookingDate);
        if(isClash) return showMessage(`❌ ${bookingRoom} is already booked within 3 hours of that time. Please pick another room or time.`);
        
        try {
            const movie = tmdbStagingMovie;
            const initialScore = movie.vote_average ? Math.round(movie.vote_average * 10) : 75;
            const isAnimeResult = checkIsAnime(movie);
            const finalCategory = isAnimeResult ? 'anime' : (suggestMediaType === 'tv' ? 'tv' : 'movie');
            const primaryGenreId = movie.genre_ids && movie.genre_ids[0];
            const mappedGenre = primaryGenreId ? (TMDB_GENRE_MAP[primaryGenreId] || "Drama") : "Drama";

            await addDoc(collection(db, "movieSuggestions"), {
                title: movie.title || movie.name,
                posterUrl: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : 'https://placehold.co/300x450/1A1A1A/FFF?text=NVA',
                synopsis: movie.overview || "No synopsis available.",
                suggestedBy: currentUser.uid,
                suggestedByName: creatorProfile?.creatorName || currentUser.displayName || "User",
                isCustomProduction: false,
                initialCriticScore: initialScore,
                category: finalCategory,
                genre: mappedGenre,
                room: bookingRoom,
                premiereDate: bookingDate,
                ticketPrice: Number(bookingPrice) || 5.00,
                type: 'premiere', // Forces it into the Watch Party engine
                status: "pending",
                timestamp: new Date()
            });
            showMessage("Watch Party requested! Awaiting Admin setup.");
            setShowSuggestionModal(false);
            setTmdbStagingMovie(null);
            setBookingDate('');
            setTmdbQuery('');
            setTmdbResults([]);
            setTmdbPage(1);
            setTmdbTotalPages(1);
        } catch(err) { showMessage("Failed to submit."); }
    };

    // Submit Custom Production with duplicate checks
    const handleCustomSubmit = async (e) => {
        e.preventDefault();
        const targetTitle = customTitle.trim();
        if (!targetTitle) return;

        try {
            // Check Case 1: Live published catalog
            const publishedQuery = query(collection(db, "movies"), where("title", "==", targetTitle));
            const publishedSnap = await getDocs(publishedQuery);
            if (!publishedSnap.empty) {
                showMessage("This custom production is already live in the Arena!");
                return;
            }

            // Check Case 2: Pending suggestions
            const pendingQuery = query(
                collection(db, "movieSuggestions"), 
                where("title", "==", targetTitle),
                where("status", "==", "pending")
            );
            const pendingSnap = await getDocs(pendingQuery);
            if (!pendingSnap.empty) {
                showMessage("This title is already in the queue awaiting review!");
                return;
            }

            await addDoc(collection(db, "movieSuggestions"), {
                title: targetTitle,
                posterUrl: customPoster.trim() || 'https://placehold.co/300x450/1A1A1A/FFF?text=My+Film',
                synopsis: customSynopsis.trim(),
                videoUrl: customVideoUrl.trim(),
                trailerUrl: customTrailerUrl.trim(),
                suggestedBy: currentUser.uid,
                suggestedByName: creatorProfile?.creatorName || currentUser.displayName || "Director",
                isCustomProduction: true,
                category: "custom",
                genre: customGenre, // Save user selected genre
                status: "pending",
                timestamp: new Date()
            });
            showMessage("Custom production submitted!");
            setCustomTitle('');
            setCustomPoster('');
            setCustomSynopsis('');
            setCustomVideoUrl('');
            setShowSuggestionModal(false);
        } catch (err) {
            showMessage("Failed to submit.");
        }
    };

    // Approve & Publish
    const handleApproveSuggestion = async (suggestion) => {
        try {
            // AUTOMATIC TAG SWAP INTERCEPTOR
            // If the incoming film requires a monetization slot, automatically downgrade their existing monetized film to 'free'
            if (suggestion.creatorId && (suggestion.type === 'donation' || suggestion.type === 'premiere')) {
                const oldQuery = query(collection(db, "movies"), where("creatorId", "==", suggestion.creatorId), where("type", "==", suggestion.type));
                const oldSnap = await getDocs(oldQuery);
                const downgradePromises = oldSnap.docs.map(d => updateDoc(d.ref, { type: 'free' }));
                await Promise.all(downgradePromises);
            }

            const movieRef = doc(collection(db, "movies"));
            await setDoc(movieRef, {
                title: suggestion.title,
                posterUrl: suggestion.posterUrl,
                synopsis: suggestion.synopsis,
                videoUrl: suggestion.videoUrl || null,
                trailerUrl: suggestion.trailerUrl || null,
                isCustomProduction: suggestion.isCustomProduction,
                category: suggestion.category || "movie",
                genre: suggestion.genre || "Drama", 
                creatorId: suggestion.creatorId || suggestion.suggestedBy, // STAMPS OWNERSHIP
                type: suggestion.type || 'free', // PRESERVES MONETIZATION TYPE
                criticScore: suggestion.initialCriticScore || 0,
                audienceScore: 0,
                watchEnabled: false,
                hasActiveRSVP: false,
                premiereDate: suggestion.premiereDate || null,
                room: suggestion.room || null,
                ticketPrice: suggestion.ticketPrice || 0,
                approvedAt: new Date().toISOString() // THE FIX: Adds creation timestamp to prevent instant deletion loop
            });

            // ⚡ NVA PIPELINE CONSOLIDATION: Instantly inject watch parties into Master Event Library
            if (suggestion.type === 'premiere' && suggestion.premiereDate) {
                await setDoc(doc(db, "events", movieRef.id), {
                    eventId: movieRef.id,
                    eventTitle: suggestion.title,
                    eventDescription: suggestion.synopsis,
                    thumbnailUrl: suggestion.posterUrl,
                    trailerUrl: suggestion.trailerUrl || null,
                    status: "upcoming",
                    scheduledStartTime: new Date(suggestion.premiereDate), 
                    isTicketed: true,
                    ticketPrice: Number(suggestion.ticketPrice) || 5.00,
                    ticketsSold: 0,
                    totalRevenue: 0,
                    creatorId: suggestion.creatorId || suggestion.suggestedBy,
                    room: suggestion.room,
                    createdAt: new Date().toISOString()
                });
            }

            await updateDoc(doc(db, "movieSuggestions", suggestion.id), {
                status: "approved"
            });
            
            // THE FIX: Issue Global Notification Toast
            const targetUid = suggestion.creatorId || suggestion.suggestedBy;
            if (targetUid) {
                const toastMsg = suggestion.type === 'premiere' 
                    ? `Your Watch Party for "${suggestion.title}" is approved! Share your link to start selling tickets.`
                    : `Your film "${suggestion.title}" is now LIVE in the Arena!`;
                await updateDoc(doc(db, "creators", targetUid), {
                    latestNotification: { message: toastMsg, timestamp: new Date().toISOString() }
                }).catch(e => console.log(e));
            }

            showMessage("Approved and published! Notification sent to creator.");
        } catch (err) {
            showMessage("Error approving suggestion.");
        }
    };

    // Reject Suggestion
    const handleRejectSuggestion = async (suggestionId) => {
        try {
            await updateDoc(doc(db, "movieSuggestions", suggestionId), {
                status: "rejected"
            });
            showMessage("Suggestion rejected.");
        } catch (err) {
            showMessage("Error updating status.");
        }
    };

    // Trigger Delete Confirmation Modal (Replaced window.confirm browser alert)
    const handleDeleteMovie = (movieId) => {
        setMovieToDeleteId(movieId);
        setShowDeleteConfirmModal(true);
    };

    // Execute actual deletion from Firestore after user clicks confirm inside our modal
    const confirmDeleteMovie = async () => {
        if (!movieToDeleteId) return;
        try {
            await deleteDoc(doc(db, "movies", movieToDeleteId));
            setSelectedMovie(null);
            setIsEditingMovie(false);
            setShowDeleteConfirmModal(false);
            setMovieToDeleteId(null);
            showMessage("Movie deleted successfully.");
        } catch (error) {
            showMessage("Failed to delete movie.");
        }
    };

    // Handles Poster Uploads strictly within the Edit Details screen
    const handleEditImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploadingImage(true);
        try {
            const fileRef = ref(storage, `showcase_posters/${currentUser.uid}_${Date.now()}_${file.name}`);
            await uploadBytes(fileRef, file);
            const downloadUrl = await getDownloadURL(fileRef);
            setEditFormPosterUrl(downloadUrl);
            showMessage("Poster artwork uploaded and updated!");
        } catch (err) {
            showMessage("Image upload failed.");
        } finally {
            setUploadingImage(false);
        }
    };

    // Pre-populate Edit Form and enter Edit State
    const startEditingMovie = (movie) => {
        setEditFormTitle(movie.title || '');
        setEditFormPosterUrl(movie.posterUrl || '');
        setEditFormSynopsis(movie.synopsis || '');
        setEditFormVideoUrl(movie.videoUrl || '');
        setEditFormTrailerUrl(movie.trailerUrl || '');
        setEditFormCategory(movie.category || 'movie');
        setEditFormGenre(movie.genre || 'Drama');
        setEditFormTicketPrice(movie.ticketPrice || '5.00');
        setIsEditingMovie(true);
    };

    // Save Published Movie modifications dynamically
    const handleSaveMovieEdit = async (e) => {
        e.preventDefault();
        if (!selectedMovie) return;
        try {
            const movieRef = doc(db, "movies", selectedMovie.id);
            const updatedFields = {
                title: editFormTitle.trim(),
                posterUrl: editFormPosterUrl.trim(),
                synopsis: editFormSynopsis.trim(),
                videoUrl: editFormVideoUrl.trim() || null,
                trailerUrl: editFormTrailerUrl.trim() || null,
                category: editFormCategory,
                genre: editFormGenre,
                ticketPrice: Number(editFormTicketPrice) || 5.00
            };
            await updateDoc(movieRef, updatedFields);
            setSelectedMovie(prev => ({ ...prev, ...updatedFields }));
            showMessage("Movie details updated successfully!");
            setIsEditingMovie(false);
        } catch (err) {
            showMessage("Failed to update movie details.");
        }
    };

    const handleShareReview = async (review) => {
        const shareUrl = `${window.location.origin}/content/${selectedMovie.id}`;
        const ratingEmoji = review.isCritic ? '🍅' : '🍿';
        const text = `${ratingEmoji} I gave "${selectedMovie.title}" a ${review.score}% rating!\n\n"${review.reviewText}"\n\nJoin the debate on NVA Network:`;
        
        if (navigator.share) {
            try { await navigator.share({ title: `${selectedMovie.title} Review`, text: text, url: shareUrl }); } 
            catch (e) { if (e.name !== 'AbortError') console.error(e); }
        } else {
            navigator.clipboard.writeText(`${text} ${shareUrl}`);
            showMessage("Review copied to clipboard!");
        }
    };

    const handleShareThread = async (thread) => {
        const shareUrl = `${window.location.origin}/FilmArena`;
        const text = `💬 Join the discussion: "${thread.title}" on NVA Network!`;
        
        if (navigator.share) {
            try { await navigator.share({ title: thread.title, text: text, url: shareUrl }); } 
            catch (e) { if (e.name !== 'AbortError') console.error(e); }
        } else {
            navigator.clipboard.writeText(`${text} ${shareUrl}`);
            showMessage("Discussion link copied!");
        }
    };

    const handleDeleteReview = async (reviewId) => {
        if (!window.confirm("Delete this review?")) return;
        try {
            await deleteDoc(doc(db, "movieReviews", reviewId));
            
            const reviewsQuery = query(collection(db, "movieReviews"), where("movieId", "==", selectedMovie.id));
            const reviewSnaps = await getDocs(reviewsQuery);
            const allReviews = reviewSnaps.docs.map(d => d.data());

            const critics = allReviews.filter(r => r.isCritic);
            const audience = allReviews.filter(r => !r.isCritic);

            const criticAvg = critics.length > 0 ? Math.round(critics.reduce((sum, r) => sum + r.score, 0) / critics.length) : 0;
            const audienceAvg = audience.length > 0 ? Math.round(audience.reduce((sum, r) => sum + r.score, 0) / audience.length) : 0;

            await updateDoc(doc(db, "movies", selectedMovie.id), {
                criticScore: criticAvg,
                audienceScore: audienceAvg
            });

            setSelectedMovie(prev => ({ ...prev, criticScore: criticAvg, audienceScore: audienceAvg }));
            showMessage("Review deleted.");
        } catch (error) {
            showMessage("Failed to delete review.");
        }
    };

    const handleToggleCritic = async (userId, reviewId, currentIsCritic) => {
        if (!window.confirm(currentIsCritic ? "Demote this user from Critic?" : "Promote this user to Critic?")) return;
        try {
            await updateDoc(doc(db, "creators", userId), { isCritic: !currentIsCritic });
            await updateDoc(doc(db, "movieReviews", reviewId), { isCritic: !currentIsCritic });

            const reviewsQuery = query(collection(db, "movieReviews"), where("movieId", "==", selectedMovie.id));
            const reviewSnaps = await getDocs(reviewsQuery);
            const allReviews = reviewSnaps.docs.map(d => d.data());

            const critics = allReviews.map(r => r.id === reviewId ? { ...r, isCritic: !currentIsCritic } : r).filter(r => r.isCritic);
            const audience = allReviews.map(r => r.id === reviewId ? { ...r, isCritic: !currentIsCritic } : r).filter(r => !r.isCritic);

            const criticAvg = critics.length > 0 ? Math.round(critics.reduce((sum, r) => sum + r.score, 0) / critics.length) : 0;
            const audienceAvg = audience.length > 0 ? Math.round(audience.reduce((sum, r) => sum + r.score, 0) / audience.length) : 0;

            await updateDoc(doc(db, "movies", selectedMovie.id), {
                criticScore: criticAvg,
                audienceScore: audienceAvg
            });

            setSelectedMovie(prev => ({ ...prev, criticScore: criticAvg, audienceScore: audienceAvg }));
            showMessage(currentIsCritic ? "Demoted from Critic." : "Promoted to Critic!");
        } catch (error) {
            showMessage("Failed to toggle status.");
        }
    };

    const handleReviewSubmit = async (e) => {
        e.preventDefault();
        if (!currentUser || !selectedMovie) return;
        setIsSubmittingReview(true);

        const isCritic = creatorProfile?.role === 'critic' || creatorProfile?.isCritic === true || isAdmin || isMod;

        try {
            const reviewRef = doc(db, "movieReviews", `${selectedMovie.id}_${currentUser.uid}`);
            await setDoc(reviewRef, {
                movieId: selectedMovie.id,
                userId: currentUser.uid,
                userName: creatorProfile?.creatorName || currentUser.displayName || "Anonymous",
                isCritic: isCritic,
                score: Number(userScore),
                reviewText: userReviewText.trim(),
                timestamp: new Date()
            });

            const reviewsQuery = query(collection(db, "movieReviews"), where("movieId", "==", selectedMovie.id));
            const reviewSnaps = await getDocs(reviewsQuery);
            const allReviews = reviewSnaps.docs.map(d => d.data());

            const critics = allReviews.filter(r => r.isCritic);
            const audience = allReviews.filter(r => !r.isCritic);

            const criticAvg = critics.length > 0 ? Math.round(critics.reduce((sum, r) => sum + r.score, 0) / critics.length) : 0;
            const audienceAvg = audience.length > 0 ? Math.round(audience.reduce((sum, r) => sum + r.score, 0) / audience.length) : 0;

            await updateDoc(doc(db, "movies", selectedMovie.id), {
                criticScore: criticAvg,
                audienceScore: audienceAvg
            });

            setSelectedMovie(prev => ({ ...prev, criticScore: criticAvg, audienceScore: audienceAvg }));
            showMessage("Review submitted!");
            setUserReviewText('');
            setUserScore(50);
        } catch (error) {
            showMessage("Failed to submit review.");
        } finally {
            setIsSubmittingReview(false);
        }
    };

    // Client-side Filter Logic for published Grid (Grouped by Genre and Filtered by Search)
    const filteredMovies = movies.filter(m => {
        const mCategory = m.category || 'movie';
        const matchesCategory = feedFilter === 'all' || mCategory === feedFilter;
        
        if (searchTerm.trim() !== '') {
            const searchLower = searchTerm.toLowerCase();
            const titleMatches = (m.title || '').toLowerCase().includes(searchLower);
            const genreMatches = (m.genre || '').toLowerCase().includes(searchLower);
            return matchesCategory && (titleMatches || genreMatches);
        }
        return matchesCategory;
    }).sort((a, b) => {
        // Primary Sort: Genre
        const genreA = a.genre || "Drama";
        const genreB = b.genre || "Drama";
        if (genreA < genreB) return -1;
        if (genreA > genreB) return 1;
        
        // Secondary Sort: Highest Rated
        const scoreA = ((a.criticScore || 0) + (a.audienceScore || 0)) / 2;
        const scoreB = ((b.criticScore || 0) + (b.audienceScore || 0)) / 2;
        return scoreB - scoreA;
    });

    return (
        <div className="screenContainer">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                <p className="heading" style={{ margin: 0, color: '#FFD700' }}>The Film Arena</p>
                <button className="topButton" onClick={() => { setSelectedMovie(null); setActiveScreen('Home'); }}>Back to Home</button>
            </div>

            {/* NEW GLASSMORPHIC ACTION BAR (Host Watch Party Advert & Admin Queue) */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,255,255,0.02)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px', padding: '12px 20px', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                    {currentUser && homeScreenLayout?.showHostWatchParty !== false && (
                        <button 
                            onClick={() => {
                                setOpenedFromArenaTab(false); // Flags as Watch Party request (disables custom upload)
                                setIsCustomProduction(false);
                                setSuggestMediaType('movie');
                                setTmdbStagingMovie(null);
                                setShowSuggestionModal(true);
                            }} 
                            style={{ background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: '900', cursor: 'pointer', boxShadow: '0 4px 15px rgba(255,215,0,0.2)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '8px' }}
                        >
                            <span style={{ fontSize: '18px' }}>🍿</span> Host Watch Party
                        </button>
                    )}
                    {isAdmin && (
                        <button onClick={() => setShowAdminQueue(!showAdminQueue)} style={{ background: showAdminQueue ? '#DC3545' : 'rgba(255,140,0,0.1)', color: showAdminQueue ? '#FFF' : '#FF8C00', border: '1px solid #FF8C00', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}>
                            📥 Admin Queue {pendingSuggestions.length > 0 ? `(${pendingSuggestions.length})` : ''}
                        </button>
                    )}
                </div>
            </div>
            {/* ADMIN PIPELINE QUEUE */}
            {showAdminQueue && isAdmin && (
                <div style={{ backgroundColor: '#0a0a0a', padding: '20px', borderRadius: '12px', marginBottom: '25px', border: '1px solid #FF8C00', boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}>
                    <p style={{ color: '#FF8C00', fontWeight: 'bold', fontSize: '18px', margin: '0 0 15px 0', textTransform: 'uppercase', letterSpacing: '1px' }}>Approval Pipeline</p>
                    {pendingSuggestions.length > 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            {pendingSuggestions.map((s) => (
                                <div key={s.id} style={{ display: 'flex', gap: '15px', backgroundColor: '#111', padding: '15px', borderRadius: '8px', border: '1px solid #333' }}>
                                    <img src={s.posterUrl} alt={s.title} style={{ width: '80px', height: '120px', objectFit: 'cover', borderRadius: '6px' }} />
                                    <div style={{ flex: 1 }}>
                                        <p style={{ fontWeight: 'bold', fontSize: '16px', margin: '0 0 4px 0', color: '#FFF' }}>
                                            {s.title} 
                                            <span style={{ backgroundColor: s.type === 'premiere' ? '#DC3545' : s.type === 'donation' ? '#00FFFF' : '#FFD700', color: s.type === 'premiere' ? '#FFF' : '#000', fontSize: '9px', padding: '3px 8px', borderRadius: '4px', marginLeft: '8px', fontWeight: '900', letterSpacing: '0.5px' }}>
                                                {s.type === 'premiere' ? `🎟️ LIVE PREMIERE (${s.room})` : s.type === 'donation' ? '🎁 PUBLIC DONATIONS' : '🎬 FREE SHOWCASE'}
                                            </span>
                                        </p>
                                        <p style={{ fontSize: '12px', color: '#888', margin: '0 0 8px 0' }}>Submitted by: <strong style={{color:'#CCC'}}>{s.suggestedByName}</strong></p>
                                        {s.type === 'premiere' && (
                                            <div style={{ background: 'rgba(255,255,255,0.05)', padding: '8px', borderRadius: '6px', display: 'inline-block', marginBottom: '8px' }}>
                                                <p style={{ margin: 0, fontSize: '11px', color: '#00FFFF', fontWeight: 'bold' }}>Requested Date: {new Date(s.premiereDate).toLocaleString()}</p>
                                                <p style={{ margin: 0, fontSize: '11px', color: '#FFD700', fontWeight: 'bold' }}>Ticket Price: {s.ticketPrice} GYD</p>
                                            </div>
                                        )}
                                        <p style={{ fontSize: '12px', color: '#AAA', lineHeight: 1.5 }}>{s.synopsis}</p>
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '12px', alignItems: 'center' }}>
                                            <button onClick={() => handleApproveSuggestion(s)} style={{ backgroundColor: '#00FF00', color: '#000', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '900' }}>Approve & Publish</button>
                                            
                                            <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap', background: 'rgba(220,53,69,0.1)', padding: '6px 12px', borderRadius: '6px', border: '1px dashed rgba(220,53,69,0.3)' }}>
                                                <select id={`rejectReason_${s.id}`} className="formInput" style={{ margin: 0, width: 'auto', padding: '4px 8px', fontSize: '11px', backgroundColor: '#222', border: '1px solid #DC3545', color: '#FFF' }}>
                                                    <option value="">-- Decline Reason --</option>
                                                    <option value="Timeslot Conflict">Timeslot Clash</option>
                                                    <option value="Copyright Concern">Copyright Concern</option>
                                                    <option value="Low Video Quality">Low Video Quality</option>
                                                    <option value="Incomplete Metadata">Incomplete Metadata</option>
                                                </select>
                                                <input type="text" id={`rejectCustom_${s.id}`} className="formInput" placeholder="Custom Msg..." style={{ margin: 0, width: '120px', padding: '4px 8px', fontSize: '11px' }} />
                                                <button onClick={async () => {
                                                    const reason = document.getElementById(`rejectReason_${s.id}`).value;
                                                    const custom = document.getElementById(`rejectCustom_${s.id}`).value;
                                                    if (!reason && !custom) return showMessage("Please provide a rejection reason.");
                                                    try {
                                                        await updateDoc(doc(db, "movieSuggestions", s.id), { status: "rejected", rejectReason: reason, rejectMessage: custom });
                                                        showMessage("Submission declined securely.");
                                                    } catch (err) { showMessage("Error updating status."); }
                                                }} style={{ backgroundColor: '#DC3545', color: '#FFF', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}>Decline</button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p style={{ color: '#888', fontSize: '14px', margin: 0 }}>Queue is clear.</p>
                    )}
                </div>
            )}

            {/* CINEMATIC NAVIGATION TABS */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '25px', overflowX: 'auto', paddingBottom: '10px', scrollbarWidth: 'none' }}>
                <button onClick={() => { setSelectedMovie(null); setIsEditingMovie(false); setActiveTab('cinemas'); }} style={{ flexShrink: 0, padding: '12px 24px', borderRadius: '12px', border: activeTab === 'cinemas' ? '1px solid #FFD700' : '1px solid #333', background: activeTab === 'cinemas' ? 'rgba(255,215,0,0.1)' : 'rgba(255,255,255,0.02)', color: activeTab === 'cinemas' ? '#FFD700' : '#888', fontWeight: '900', fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s' }}>🎬 In Cinemas Now</button>
                <button onClick={() => { setSelectedMovie(null); setIsEditingMovie(false); setActiveTab('arena'); }} style={{ flexShrink: 0, padding: '12px 24px', borderRadius: '12px', border: activeTab === 'arena' ? '1px solid #00FFFF' : '1px solid #333', background: activeTab === 'arena' ? 'rgba(0,255,255,0.1)' : 'rgba(255,255,255,0.02)', color: activeTab === 'arena' ? '#00FFFF' : '#888', fontWeight: '900', fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s' }}>🍅 Public Arena</button>
                <button onClick={() => { setSelectedMovie(null); setIsEditingMovie(false); setActiveTab('discussions'); }} style={{ flexShrink: 0, padding: '12px 24px', borderRadius: '12px', border: activeTab === 'discussions' ? '1px solid #FFF' : '1px solid #333', background: activeTab === 'discussions' ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.02)', color: activeTab === 'discussions' ? '#FFF' : '#888', fontWeight: '900', fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s' }}>💬 Forums</button>
                <button onClick={() => { setSelectedMovie(null); setIsEditingMovie(false); setActiveTab('watchlist'); }} style={{ flexShrink: 0, padding: '12px 24px', borderRadius: '12px', border: activeTab === 'watchlist' ? '1px solid #E539A1' : '1px solid #333', background: activeTab === 'watchlist' ? 'rgba(229,57,161,0.1)' : 'rgba(255,255,255,0.02)', color: activeTab === 'watchlist' ? '#E539A1' : '#888', fontWeight: '900', fontSize: '14px', cursor: 'pointer', transition: 'all 0.2s' }}>🔖 Watchlist</button>
            </div>

            {/* NEW TOP-LEVEL TAB ROUTING */}
            {['cinemas', 'multiplex', 'arena'].includes(activeTab) && (
                <div>
                    {!selectedMovie ? (
                        <div style={{ animation: 'fadeIn 0.3s ease' }}>
                            {activeTab === 'cinemas' && (
                                (() => {
                                    const now = Date.now();
                                    
                                    const getMs = (timeData) => {
                                        if (!timeData) return 0;
                                        if (timeData.toMillis) return timeData.toMillis();
                                        if (timeData.seconds) return timeData.seconds * 1000;
                                        const parsed = new Date(timeData).getTime();
                                        return isNaN(parsed) ? 0 : parsed;
                                    };

                                    // Strictly Pinned / Premium
                                    const freeAdminMovies = movies.filter(m => m.isPinned && (!m.ticketPrice || m.ticketPrice === 0));
                                    const premiumPinned = movies.filter(m => m.isPinned && m.ticketPrice > 0);
                                    
                                    // Watch Parties / Premieres (Both pinned and unpinned are safely caught here)
                                    const upcomingParties = liveEvents.filter(m => getMs(m.scheduledStartTime) > now - (4 * 3600 * 1000));
                                    
                                    // Recent Replays (Last 7 Days)
                                    const pastReplays = liveEvents.filter(m => {
                                        const ms = getMs(m.scheduledStartTime);
                                        return ms < now - (4 * 3600 * 1000) && ms > now - (7 * 24 * 3600 * 1000);
                                    });

                                    const UnifiedMovieRow = ({ title, items, themeColor, isReplay = false }) => {
                                        if (items.length === 0) return null;
                                        
                                        // THE FIX: Free Entry overrides sit at the absolute top, followed by Pinned, then chronological.
                                        const sortedItems = [...items].sort((a, b) => {
                                            const aFree = a.isNowShowingFree || a.isTicketed === false || a.ticketPrice === 0;
                                            const bFree = b.isNowShowingFree || b.isTicketed === false || b.ticketPrice === 0;
                                            
                                            const aPinned = a.isPinned || (a.id && movies.find(m => m.id === a.id)?.isPinned) || (a.id && liveEvents.find(m => m.id === a.id)?.isPinned);
                                            const bPinned = b.isPinned || (b.id && movies.find(m => m.id === b.id)?.isPinned) || (b.id && liveEvents.find(m => m.id === b.id)?.isPinned);
                                            
                                            if (aFree && !bFree) return -1;
                                            if (!aFree && bFree) return 1;
                                            
                                            if (aPinned && !bPinned) return -1;
                                            if (!aPinned && bPinned) return 1;
                                            
                                            const getTime = (obj) => {
                                                const t = obj.scheduledStartTime || obj.premiereDate;
                                                if (!t) return 0;
                                                if (t.toMillis) return t.toMillis();
                                                if (t.seconds) return t.seconds * 1000;
                                                return new Date(t).getTime();
                                            };
                                            return getTime(a) - getTime(b);
                                        });

                                        return (
                                            <div style={{ marginBottom: '35px' }}>
                                                <p style={{ fontSize: '16px', fontWeight: '900', color: themeColor, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '16px', borderLeft: `4px solid ${themeColor}`, paddingLeft: '10px' }}>{title}</p>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                                    {sortedItems.map((movie, index) => {
                                                        const isEventData = !!movie.eventTitle;
                                                        const isFreeEntry = movie.isNowShowingFree || movie.isTicketed === false || movie.ticketPrice === 0;
                                                        const isCurrentlyPinned = movie?.isPinned || (movie?.id && movies.find(m => m.id === movie.id)?.isPinned) || (movie?.id && liveEvents.find(m => m.id === movie.id)?.isPinned) || false;
                                                        
                                                        // THE FIX: Dynamic Cyan styles for Free entries, falling back to Yellow for Pinned, then Default
                                                        let cardBg = isReplay ? '#0A0A0A' : 'rgba(20,20,20,0.8)';
                                                        let cardBorder = isReplay ? '1px solid #222' : '1px solid rgba(255,255,255,0.08)';
                                                        let cardShadow = 'none';
                                                        let labelBg = themeColor;
                                                        
                                                        if (isFreeEntry && !isReplay) {
                                                            cardBg = 'rgba(0, 255, 255, 0.05)';
                                                            cardBorder = '1px solid #00FFFF';
                                                            cardShadow = '0 0 15px rgba(0, 255, 255, 0.15)';
                                                            labelBg = '#00FFFF';
                                                        } else if (isCurrentlyPinned && !isReplay) {
                                                            cardBg = 'rgba(255, 215, 0, 0.05)';
                                                            cardBorder = '1px solid #FFD700';
                                                            cardShadow = '0 0 15px rgba(255, 215, 0, 0.15)';
                                                            labelBg = '#FFD700';
                                                        }

                                                        const eventMs = getMs(movie.scheduledStartTime || movie.premiereDate);
                                                        const dateStr = eventMs ? new Date(eventMs).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Available Now';
                                                        const timeStr = eventMs ? new Date(eventMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                                                        
                                                        return (
                                                            <div 
                                                                key={movie.id} 
                                                                style={{ display: 'flex', flexDirection: 'column', background: cardBg, backdropFilter: 'blur(10px)', borderRadius: '12px', border: cardBorder, transition: 'all 0.3s ease', opacity: isReplay ? 0.7 : 1, boxShadow: cardShadow, overflow: 'hidden' }} 
                                                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.01)'} 
                                                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                                            >
                                                                <div
                                                                    onClick={(e) => {
                                                                        if (e.target.closest('button') || e.target.closest('.pin-btn')) return;

                                                                        const normalizedMovie = {
                                                                            ...movie,
                                                                            title: movie.title || movie.eventTitle || "Unknown Title",
                                                                            posterUrl: movie.posterUrl || movie.thumbnailUrl || 'https://placehold.co/300x450/1A1A1A/FFF?text=N/A',
                                                                            category: movie.category || (movie.isTicketed ? 'premiere' : 'free'),
                                                                        };

                                                                        // THE FIX: If it's a live/upcoming event (has eventTitle), force route to Multiplex regardless of ticket price.
                                                                        if (isReplay || (!movie.eventTitle && movie.type !== 'premiere')) {
                                                                            setSelectedMovie(normalizedMovie);
                                                                        } else {
                                                                            sessionStorage.setItem('nva_target_discover_tab', 'Premieres');
                                                                            sessionStorage.setItem('nva_target_premiere_event_id', 'none');
                                                                            window.dispatchEvent(new CustomEvent('switchDiscoverTab', { detail: 'Premieres' }));
                                                                            window.dispatchEvent(new CustomEvent('setPremiereActiveEvent', { detail: { eventId: null } }));
                                                                            setActiveScreen('Discover');
                                                                        }
                                                                    }}
                                                                    style={{ display: 'flex', gap: '15px', padding: '12px', cursor: 'pointer' }}
                                                                >
                                                                    <div style={{ position: 'relative', width: '100px', height: '145px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, border: `1px solid ${labelBg}` }}>
                                                                        <img src={movie.thumbnailUrl || movie.posterUrl} alt={movie.title || movie.eventTitle} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                        {!isReplay && (
                                                                            <div style={{ position: 'absolute', top: 0, left: 0, backgroundColor: labelBg, color: '#000', fontSize: '11px', fontWeight: '900', padding: '4px 8px', borderBottomRightRadius: '6px' }}>#{index + 1}</div>
                                                                        )}
                                                                    </div>
                                                                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                                                            <p style={{ fontWeight: '900', fontSize: '18px', color: '#FFF', margin: '0 0 6px 0', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                                                                                {isCurrentlyPinned && !isFreeEntry && <span style={{color: '#FFD700'}} title="Pinned">📌</span>}
                                                                                {isFreeEntry && <span style={{backgroundColor: '#00FFFF', color: '#000', fontSize: '9px', padding: '3px 6px', borderRadius: '4px', fontWeight: '900', letterSpacing: '0.5px'}}>🔓 FREE NOW</span>}
                                                                                <span>{movie.title || movie.eventTitle}</span>
                                                                            </p>
                                                                            {(isAdmin || isMod) && (
                                                                                <span 
                                                                                    className="pin-btn"
                                                                                    onClick={(e) => { 
                                                                                        e.preventDefault();
                                                                                        e.stopPropagation(); 
                                                                                        handleTogglePin({ id: movie.id, isPinned: isCurrentlyPinned, isEvent: isEventData, eventTitle: movie.eventTitle }); 
                                                                                    }}
                                                                                    style={{ cursor: 'pointer', fontSize: '18px', opacity: isCurrentlyPinned ? 1 : 0.4, transition: 'all 0.2s', padding: '4px', background: isCurrentlyPinned ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.1)', borderRadius: '50%' }}
                                                                                    title="Pin / Unpin Movie"
                                                                                >
                                                                                    📌
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <p style={{ fontSize: '12px', color: '#AAA', margin: '0 0 10px 0', display: 'flex', alignItems: 'center', flexWrap: 'wrap' }}>
                                                                            {dateStr} <span style={{margin: '0 6px'}}>•</span> 
                                                                            {/* THE FIX: Re-injected the Room Label next to the Free Entry status */}
                                                                            {isFreeEntry ? (
                                                                                <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                    <span style={{ color: '#00FFFF', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1px', textShadow: '0 0 10px rgba(0,255,255,0.3)' }}>🔓 NOW SHOWING FREE</span>
                                                                                    <span style={{ color: '#FFF', fontWeight: 'bold' }}>({movie.room || 'Theater Room'})</span>
                                                                                </span>
                                                                            ) : (
                                                                                <span style={{ color: (movie.ticketsSold || 0) > 0 ? themeColor : '#FFD700', fontWeight: 'bold' }}>{(movie.ticketsSold || 0) > 0 ? (movie.room || 'Theater Room') : "TBA (Pending 1st Sale)"}</span>
                                                                            )}
                                                                        </p>
                                                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', flexWrap: 'wrap', marginTop: 'auto' }}>
                                                                            {timeStr && (
                                                                                <span style={{ color: '#00FFFF', fontWeight: '900', background: 'rgba(0,255,255,0.1)', border: '1px solid rgba(0,255,255,0.2)', padding: '4px 10px', borderRadius: '4px', letterSpacing: '0.5px' }}>
                                                                                    ⏰ {timeStr}
                                                                                </span>
                                                                            )}
                                                                            {movie.trailerUrl && (
                                                                                <button onClick={(e) => { e.stopPropagation(); window.open(movie.trailerUrl, '_blank'); }} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', color: '#FFF', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
                                                                                    ▶ Trailer
                                                                                </button>
                                                                            )}
                                                                            <button onClick={(e) => { 
                                                                                e.stopPropagation(); 
                                                                                setExpandedCommentId(expandedCommentId === movie.id ? null : movie.id);
                                                                            }} style={{ background: expandedCommentId === movie.id ? 'rgba(255,215,0,0.2)' : 'rgba(255,255,255,0.05)', border: `1px solid ${expandedCommentId === movie.id ? '#FFD700' : 'rgba(255,255,255,0.2)'}`, color: expandedCommentId === movie.id ? '#FFD700' : '#FFF', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
                                                                                💬 Comments
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* EXPANDABLE COMMENT DRAWER */}
                                                                {expandedCommentId === movie.id && (
                                                                    <div style={{ padding: '0 12px 15px 12px', borderTop: '1px dashed #333', background: 'rgba(0,0,0,0.4)' }} onClick={e => e.stopPropagation()}>
                                                                        <div style={{ display: 'flex', gap: '8px', margin: '15px 0' }}>
                                                                            <input 
                                                                                type="text" 
                                                                                value={newCardComment} 
                                                                                onChange={e => setNewCardComment(e.target.value)} 
                                                                                placeholder="Share your thoughts on this event..." 
                                                                                style={{ flex: 1, background: '#000', border: '1px solid #333', color: '#FFF', padding: '10px', borderRadius: '6px', fontSize: '12px', outline: 'none' }} 
                                                                                onKeyDown={(e) => { if (e.key === 'Enter') handlePostCardComment(movie.id); }}
                                                                            />
                                                                            <button onClick={() => handlePostCardComment(movie.id)} style={{ background: '#FFD700', color: '#000', border: 'none', padding: '0 15px', borderRadius: '6px', fontWeight: '900', fontSize: '12px', cursor: 'pointer' }}>
                                                                                Post
                                                                            </button>
                                                                        </div>
                                                                        
                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '250px', overflowY: 'auto' }}>
                                                                            {cardComments.slice(0, commentsLimit).map(comment => (
                                                                                <div key={comment.id} style={{ background: '#111', padding: '10px 12px', borderRadius: '8px', border: '1px solid #222' }}>
                                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', alignItems: 'center' }}>
                                                                                        <span style={{ fontWeight: '900', fontSize: '11px', color: '#FFD700' }}>{comment.userName}</span>
                                                                                        {(isAdmin || currentUser?.uid === comment.userId) && (
                                                                                            <span onClick={() => handleDeleteCardComment(comment.id)} style={{ color: '#DC3545', fontSize: '10px', cursor: 'pointer', fontWeight: 'bold' }}>✕ Delete</span>
                                                                                        )}
                                                                                    </div>
                                                                                    <p style={{ margin: 0, fontSize: '12px', color: '#CCC', lineHeight: '1.4' }}>{comment.text}</p>
                                                                                </div>
                                                                            ))}
                                                                            {cardComments.length === 0 && (
                                                                                <p style={{ margin: '10px 0', fontSize: '12px', color: '#666', textAlign: 'center' }}>No feedback yet. Be the first!</p>
                                                                            )}
                                                                            {cardComments.length > commentsLimit && (
                                                                                <button onClick={() => setCommentsLimit(prev => prev + 10)} style={{ background: 'transparent', color: '#00FFFF', border: '1px dashed #00FFFF', borderRadius: '4px', padding: '6px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', margin: '5px auto', display: 'block' }}>
                                                                                    Load More Comments
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    };

                                    return (
                                        <div style={{ marginTop: '20px' }}>
                                            <UnifiedMovieRow title="🎬 Now Showing: Free Screenings" items={freeAdminMovies} themeColor="#00FFFF" />
                                            <UnifiedMovieRow title="🍿 Upcoming Watch Parties" items={upcomingParties} themeColor="#FFD700" />
                                            <UnifiedMovieRow title="🏆 Premium Cinema" items={premiumPinned} themeColor="#FFA500" />
                                            <UnifiedMovieRow title="⏪ Screened This Week" items={pastReplays} themeColor="#888" isReplay={true} />
                                            
                                            {(freeAdminMovies.length === 0 && premiumPinned.length === 0 && upcomingParties.length === 0 && pastReplays.length === 0) && (
                                                <p style={{ color: '#888', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>No movies are currently scheduled in cinemas.</p>
                                            )}
                                        </div>
                                    );
                                })()
                            )}

                            {activeTab === 'arena' && (
                                <div style={{ animation: 'fadeIn 0.3s ease' }}>
                                    {/* DYNAMIC UPLOAD/SUGGEST BUTTON */}
                                    {currentUser && (
                                        <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: '15px' }}>
                                            <button 
                                                onClick={() => {
                                                    setOpenedFromArenaTab(true); // Flags as Arena VOD request
                                                    setIsCustomProduction(true); // Defaults to custom production view
                                                    setShowSuggestionModal(true);
                                                }} 
                                                style={{ background: 'rgba(0, 255, 255, 0.1)', border: '1px solid #00FFFF', color: '#00FFFF', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                            >
                                                🎬 Suggest / Upload Original Film
                                            </button>
                                        </div>
                                    )}

                                    {/* DYNAMIC VOD FILTERS */}
                                    <div style={{ display: 'flex', gap: '8px', marginBottom: '15px', overflowX: 'auto', paddingBottom: '5px' }}>
                                        {['all', 'movie', 'tv', 'anime', 'custom'].map((cat) => (
                                            <button 
                                                key={cat} onClick={() => { setFeedFilter(cat); setSearchTerm(''); }}
                                                style={{ padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px', backgroundColor: feedFilter === cat ? '#00FFFF' : '#1A1A1A', color: feedFilter === cat ? '#000' : '#AAA', border: feedFilter === cat ? '1px solid #00FFFF' : '1px solid #333', whiteSpace: 'nowrap', transition: 'all 0.2s ease' }}
                                            >
                                                {cat === 'all' && '🔥 Hottest'}
                                                {cat === 'movie' && '🎬 Movies'}
                                                {cat === 'tv' && '📺 TV Series'}
                                                {cat === 'anime' && '🎌 Anime'}
                                                {cat === 'custom' && '🎥 Showcases'}
                                            </button>
                                        ))}
                                    </div>
                                    <div style={{ position: 'sticky', top: '0px', zIndex: 40, backgroundColor: '#0a0a0a', padding: '10px 0', marginBottom: '20px', borderBottom: '1px solid #1a1a1a' }}>
                                        <input type="text" className="formInput" placeholder="🔍 Search titles or genres..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ margin: 0, width: '100%', maxWidth: '400px', backgroundColor: '#151515', border: '1px solid #333', borderRadius: '8px', color: '#FFF' }} />
                                    </div>

                                    {/* VOD CONTENT RENDERER */}
                                    {feedFilter === 'all' ? (
                                        (() => {
                                            const getTop10 = (category) => {
                                                return movies.filter(m => (m.category || 'movie') === category && m.type !== 'premiere').slice(0, 10);
                                            };

                                            const showcaseRow = getTop10('custom');
                                            const movieRow = getTop10('movie');
                                            const tvRow = getTop10('tv');
                                            const animeRow = getTop10('anime');

                                            const MovieRow = ({ title, items }) => {
                                                if (items.length === 0) return null;
                                                return (
                                                    <div style={{ marginBottom: '35px' }}>
                                                        <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#FFD700', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', borderLeft: '4px solid #FFD700', paddingLeft: '10px' }}>{title}</p>
                                                        <div style={{ display: 'flex', gap: '15px', overflowX: 'auto', paddingBottom: '10px' }} className="carousel-container">
                                                            {items.map(movie => (
                                                                <div key={movie.id} onClick={() => setSelectedMovie(movie)} style={{ flexShrink: 0, width: '160px', cursor: 'pointer', backgroundColor: '#1A1A1A', borderRadius: '10px', padding: '10px', border: '1px solid #222' }}>
                                                                    <div style={{ position: 'relative', height: '220px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#000' }}>
                                                                        <img src={movie.posterUrl} alt={movie.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                    </div>
                                                                    <p style={{ fontWeight: 'bold', fontSize: '14px', color: '#FFF', margin: '8px 0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{movie.title}</p>
                                                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                                                        <span style={{ color: '#FFA500' }}>🍅 {movie.criticScore || 0}%</span>
                                                                        <span style={{ color: '#FFD700' }}>🍿 {movie.audienceScore || 0}%</span>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                );
                                            };

                                            return (
                                                <div style={{ marginTop: '20px' }}>
                                                    {/* POLL WIDGET (ONLY SHOWS IN ARENA TAB) */}
                                                    {(pollConfig?.isActive || isMod) && (
                                                        <div style={{ backgroundColor: '#111', border: pollConfig?.isActive ? '1px solid #FFD700' : '1px solid #444', borderRadius: '12px', padding: '20px', marginBottom: '30px', opacity: pollConfig?.isActive ? 1 : 0.6 }}>
                                                            <p style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '15px', textTransform: 'uppercase', letterSpacing: '1px', margin: '0 0 10px 0', textAlign: 'center' }}>🔥 Weekly Arena Face-Off 🔥</p>
                                                            <p style={{ color: '#FFF', fontSize: '14px', textAlign: 'center', marginBottom: '20px' }}>{pollConfig.question}</p>
                                                            
                                                            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                                                <button 
                                                                    onClick={() => handlePollVote('A')} 
                                                                    disabled={currentUser && pollConfig.votedUsers && !!pollConfig.votedUsers[currentUser.uid]}
                                                                    style={{ flex: 1, minWidth: '130px', padding: '12px', backgroundColor: '#1A1A1A', color: '#FFF', border: '1px solid #444', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                                                                    🎬 {pollConfig.movieATitle}
                                                                </button>
                                                                <button 
                                                                    onClick={() => handlePollVote('B')} 
                                                                    disabled={currentUser && pollConfig.votedUsers && !!pollConfig.votedUsers[currentUser.uid]}
                                                                    style={{ flex: 1, minWidth: '130px', padding: '12px', backgroundColor: '#1A1A1A', color: '#FFF', border: '1px solid #444', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}>
                                                                    🎬 {pollConfig.movieBTitle}
                                                                </button>
                                                            </div>
                                                        </div>
                                                    )}

                                                    <MovieRow title="🎥 Public Showcase (Donations)" items={showcaseRow} />
                                                    <MovieRow title="🎬 Free Movies" items={movieRow} />
                                                    <MovieRow title="📺 Free TV Series" items={tvRow} />
                                                    <MovieRow title="🎌 Anime Spotlight" items={animeRow} />
                                                </div>
                                            );
                                        })()
                                    ) : (
                                        /* CASE B: SEGMENTED TARGETED ROW VIEW */
                                        (() => {
                                            if (filteredMovies.length === 0) {
                                                return <p style={{ color: '#888', fontSize: '14px', textAlign: 'center', marginTop: '40px' }}>No content published in this category yet.</p>;
                                            }

                                            // Group filtered movies dynamically by genre
                                            const groupedByGenre = {};
                                            filteredMovies.forEach(movie => {
                                                const g = movie.genre || "Drama";
                                                if (!groupedByGenre[g]) groupedByGenre[g] = [];
                                                groupedByGenre[g].push(movie);
                                            });

                                            // Sort genre rows alphabetically
                                            const sortedGenres = Object.keys(groupedByGenre).sort();

                                            return (
                                                <div style={{ marginTop: '20px' }}>
                                                    {sortedGenres.map(genre => (
                                                        <div key={genre} style={{ marginBottom: '35px' }}>
                                                            <p style={{ fontSize: '16px', fontWeight: 'bold', color: '#FFD700', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px', borderLeft: '4px solid #FFD700', paddingLeft: '10px' }}>
                                                                {genre}
                                                            </p>
                                                            <div style={{ display: 'flex', gap: '15px', overflowX: 'auto', paddingBottom: '10px' }} className="carousel-container">
                                                                {groupedByGenre[genre].map(movie => (
                                                                    <div key={movie.id} onClick={() => setSelectedMovie(movie)} style={{ flexShrink: 0, width: '160px', cursor: 'pointer', backgroundColor: '#1A1A1A', borderRadius: '10px', padding: '10px', border: '1px solid #222' }}>
                                                                        <div style={{ position: 'relative', height: '220px', borderRadius: '6px', overflow: 'hidden', backgroundColor: '#000' }}>
                                                                            <img src={movie.posterUrl} alt={movie.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                                                            <span style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: 'rgba(0,0,0,0.85)', color: '#FFD700', fontSize: '10px', padding: '3px 8px', borderRadius: '4px', fontWeight: 'bold', border: '1px solid #FFD700' }}>
                                                                                {movie.category ? (movie.category === 'custom' ? 'SHOWCASE' : String(movie.category).toUpperCase()) : 'MOVIE'}
                                                                            </span>
                                                                        </div>
                                                                        <p style={{ fontWeight: 'bold', fontSize: '14px', color: '#FFF', margin: '8px 0 4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{movie.title}</p>
                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                                                            <span style={{ color: '#FFA500' }}>🍅 {movie.criticScore || 0}%</span>
                                                                            <span style={{ color: '#FFD700' }}>🍿 {movie.audienceScore || 0}%</span>
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })()
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Movie Detail View */
                        <div style={{ color: '#FFF' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', gap: '10px', flexWrap: 'wrap' }}>
                                <button className="topButton" onClick={() => { setSelectedMovie(null); setIsEditingMovie(false); }} style={{ backgroundColor: '#3A3A3A', color: '#FFF', margin: 0, fontWeight: 'bold', border: '1px solid #555' }}>← Back to Movies</button>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                    {isAdmin && (
                                        <button className="topButton" onClick={() => handleTogglePin(selectedMovie)} style={{ backgroundColor: selectedMovie.isPinned ? '#00FFFF' : '#222', color: selectedMovie.isPinned ? '#0A0A0A' : '#FFF', fontWeight: selectedMovie.isPinned ? 'bold' : 'normal', margin: 0 }}>
                                            {selectedMovie.isPinned ? '📌 In Cinemas (Pinned)' : '📌 Add to "In Cinemas"'}
                                        </button>
                                    )}
                                    {isAdmin && (
                                        <button className="topButton" onClick={() => handleToggleFreeTag(selectedMovie)} style={{ backgroundColor: selectedMovie.isNowShowingFree ? '#00FF00' : '#222', color: selectedMovie.isNowShowingFree ? '#0A0A0A' : '#FFF', fontWeight: selectedMovie.isNowShowingFree ? 'bold' : 'normal', margin: 0 }}>
                                            {selectedMovie.isNowShowingFree ? '🔓 Global Free Entry (ON)' : '🔓 Enable Global Free Entry'}
                                        </button>
                                    )}
                                    {isAdmin && (
                                        <button className="topButton" onClick={() => handleToggleRSVP(selectedMovie)} style={{ backgroundColor: selectedMovie.hasActiveRSVP ? '#00FFFF' : '#222', color: selectedMovie.hasActiveRSVP ? '#0A0A0A' : '#FFF', fontWeight: selectedMovie.hasActiveRSVP ? 'bold' : 'normal', margin: 0 }}>
                                            {selectedMovie.hasActiveRSVP ? '🎫 RSVP Enabled' : '🎫 Enable RSVP'}
                                        </button>
                                    )}
                                    {isAdmin && (
                                        <button className="topButton" onClick={() => handleToggleWatchEnabled(selectedMovie)} style={{ backgroundColor: selectedMovie.watchEnabled ? '#00FFFF' : '#222', color: selectedMovie.watchEnabled ? '#0A0A0A' : '#FFF', fontWeight: selectedMovie.watchEnabled ? 'bold' : 'normal', margin: 0 }}>
                                            {selectedMovie.watchEnabled ? '📺 Watch Link ON' : '📺 Watch Link OFF'}
                                        </button>
                                    )}
                                    {isAdmin && (
                                        <button className="topButton" onClick={() => { if (isEditingMovie) { setIsEditingMovie(false); } else { startEditingMovie(selectedMovie); } }} style={{ backgroundColor: isEditingMovie ? '#FF8C00' : '#222', color: '#FFF', margin: 0 }}>
                                            {isEditingMovie ? '✕ Cancel Edit' : '✏️ Edit Movie Details'}
                                        </button>
                                    )}
                                    {isAdmin && (
                                        <button className="topButton" onClick={() => handleDeleteMovie(selectedMovie.id)} style={{ backgroundColor: '#DC3545', margin: 0 }}>⚠️ Delete Movie</button>
                                    )}
                                </div>
                            </div>

                            {isEditingMovie ? (
                                /* COMPREHENSIVE EDIT MOVIE PANEL */
                                <form onSubmit={handleSaveMovieEdit} style={{ backgroundColor: '#1A1A1A', padding: '25px', borderRadius: '12px', border: '1px solid #FF8C00', marginBottom: '30px', display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                    <p style={{ color: '#FF8C00', fontWeight: 'bold', fontSize: '18px', margin: 0 }}>✏️ Edit Published Movie Details</p>
                                    
                                    <div className="formGroup">
                                        <label className="formLabel">Title:</label>
                                        <input type="text" className="formInput" value={editFormTitle} onChange={(e) => setEditFormTitle(e.target.value)} required />
                                    </div>

                                    <div className="formGroup">
                                        <label className="formLabel">Category:</label>
                                        <select value={editFormCategory} onChange={(e) => setEditFormCategory(e.target.value)} className="formInput" style={{ backgroundColor: '#222', color: '#FFF', border: '1px solid #444', borderRadius: '6px' }}>
                                            <option value="movie">🎬 Movie</option>
                                            <option value="tv">📺 TV Series</option>
                                            <option value="anime">🎌 Anime</option>
                                            <option value="custom">🎥 Showcase Film</option>
                                        </select>
                                    </div>

                                    <div className="formGroup">
                                        <label className="formLabel">Genre:</label>
                                        <select value={editFormGenre} onChange={(e) => setEditFormGenre(e.target.value)} className="formInput" style={{ backgroundColor: '#222', color: '#FFF', border: '1px solid #444', borderRadius: '6px' }}>
                                            {["Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Documentary", "Romance", "Thriller"].map(g => (
                                                <option key={g} value={g}>{g}</option>
                                            ))}
                                        </select>
                                    </div>

                                    <div className="formGroup">
                                        <label className="formLabel">Ticket Price (USD):</label>
                                        <input type="number" step="0.01" min="0" className="formInput" value={editFormTicketPrice} onChange={(e) => setEditFormTicketPrice(e.target.value)} placeholder="5.00" required />
                                    </div>

                                    <div className="formGroup">
                                        <label className="formLabel">Video Stream URL (Vimeo, YouTube, Movie Site link):</label>
                                        <input type="url" className="formInput" value={editFormVideoUrl} onChange={(e) => setEditFormVideoUrl(e.target.value)} placeholder="https://..." />
                                    </div>

                                    <div className="formGroup">
                                        <label className="formLabel">Trailer URL (Optional - Adds a Watch Trailer button):</label>
                                        <input type="url" className="formInput" value={editFormTrailerUrl} onChange={(e) => setEditFormTrailerUrl(e.target.value)} placeholder="YouTube or Vimeo Link..." />
                                    </div>

                                    <div className="formGroup">
                                        <label className="formLabel">Poster Artwork URL:</label>
                                        <input type="url" className="formInput" value={editFormPosterUrl} onChange={(e) => setEditFormPosterUrl(e.target.value)} placeholder="Poster image URL..." required />
                                    </div>

                                    <div className="formGroup">
                                        <label className="formLabel">Or Upload Custom Poster:</label>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                            <label className="button" style={{ margin: 0, padding: '8px 16px', backgroundColor: '#3A3A3A', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                                                <span className="buttonText">{uploadingImage ? "Uploading..." : "📁 Choose Local Image"}</span>
                                                <input type="file" accept="image/*" onChange={handleEditImageUpload} style={{ display: 'none' }} disabled={uploadingImage} />
                                            </label>
                                        </div>
                                    </div>

                                    {/* Real-Time uploaded artwork preview inside edit block */}
                                    {editFormPosterUrl && (
                                        <div style={{ marginTop: '5px', position: 'relative', width: '100%', height: '140px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #444', backgroundColor: '#000' }}>
                                            <img src={editFormPosterUrl} alt="Edit Artwork Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                        </div>
                                    )}

                                    <div className="formGroup">
                                        <label className="formLabel">Synopsis / Details:</label>
                                        <textarea className="formTextarea" value={editFormSynopsis} onChange={(e) => setEditFormSynopsis(e.target.value)} rows="5" required />
                                    </div>

                                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                        <button className="button" type="submit" style={{ backgroundColor: '#00FF00', color: '#000', margin: 0, width: 'auto', padding: '10px 25px' }}>
                                            <span className="buttonText">Save Changes</span>
                                        </button>
                                        <button className="button" type="button" onClick={() => setIsEditingMovie(false)} style={{ backgroundColor: '#3A3A3A', color: '#FFF', margin: 0, width: 'auto', padding: '10px 25px' }}>
                                            <span className="buttonText">Cancel</span>
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                /* STATIC MOVIE DETAILS DISPLAY */
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '30px', marginBottom: '30px' }}>
                                    <img src={selectedMovie.posterUrl} alt={selectedMovie.title} style={{ width: '240px', height: '360px', objectFit: 'cover', borderRadius: '12px', border: '1px solid #444' }} />
                                    <div style={{ flex: 1, minWidth: '300px' }}>
                                        <p style={{ fontSize: '28px', fontWeight: 'bold', margin: '0 0 10px 0', color: '#FFF' }}>
                                            {selectedMovie.title} 
                                            <span style={{ backgroundColor: '#FFD700', color: '#000', fontSize: '12px', padding: '4px 10px', borderRadius: '6px', marginLeft: '12px', fontWeight: 'bold' }}>
                                                {selectedMovie.category === 'custom' ? 'SHOWCASE' : String(selectedMovie.category).toUpperCase()}
                                            </span>
                                        </p>
                                        <div style={{ display: 'flex', gap: '30px', margin: '15px 0' }}>
                                            <div style={{ textAlign: 'center', backgroundColor: '#222', padding: '12px 24px', borderRadius: '10px', minWidth: '110px' }}>
                                                <p style={{ fontSize: '32px', margin: 0 }}>🍅</p>
                                                <p style={{ fontSize: '20px', fontWeight: 'bold', margin: '4px 0 0', color: '#FFA500' }}>{selectedMovie.criticScore || 0}%</p>
                                                <span style={{ fontSize: '11px', color: '#888' }}>Critics Score</span>
                                            </div>
                                            <div style={{ textAlign: 'center', backgroundColor: '#222', padding: '12px 24px', borderRadius: '10px', minWidth: '110px' }}>
                                                <p style={{ fontSize: '32px', margin: 0 }}>🍿</p>
                                                <p style={{ fontSize: '20px', fontWeight: 'bold', margin: '4px 0 0', color: '#FFD700' }}>{selectedMovie.audienceScore || 0}%</p>
                                                <span style={{ fontSize: '11px', color: '#888' }}>Audience Score</span>
                                            </div>
                                        </div>
                                        <p style={{ color: '#CCC', fontSize: '14px', lineHeight: 1.6, marginBottom: '20px' }}>{selectedMovie.synopsis}</p>
                                        
                                       {/* User Action Buttons */}
                                        <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
                                            <ShareButton 
                                                title={selectedMovie.title} 
                                                text={`Check out "${selectedMovie.title}" on the NVA Network Film Arena!`} 
                                                url={`/content/${selectedMovie.id}`} 
                                                showMessage={showMessage} 
                                            />
                                            
                                        {currentUser && (
                                            <>
                                                {/* Watchlist Toggle */}
                                                <button onClick={() => handleToggleWatchlist(selectedMovie)} className="button" style={{ margin: 0, width: 'auto', padding: '10px 20px', backgroundColor: watchlistIds.has(selectedMovie.id) ? '#DC3545' : '#FFD700', color: watchlistIds.has(selectedMovie.id) ? '#FFF' : '#000', fontWeight: 'bold' }}>
                                                    <span className="buttonText">{watchlistIds.has(selectedMovie.id) ? '➖ Remove Watchlist' : '➕ Add to Watchlist'}</span>
                                                </button>
                                                
                                                {/* Film Arena Donation Gifting (Unified Modal Route) */}
                                                {selectedMovie.type === 'donation' && selectedMovie.creatorId && (
                                                    <button 
                                                        onClick={() => {
                                                            setModalEventDetails({ ...selectedMovie, isDonationMode: true });
                                                            setShowGiftModal(true);
                                                        }} 
                                                        className="button" 
                                                        style={{ margin: 0, width: 'auto', padding: '10px 20px', background: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)', color: '#000', fontWeight: '900', boxShadow: '0 4px 15px rgba(255,215,0,0.3)', border: 'none' }}
                                                    >
                                                        <span className="buttonText">🎁 Support Filmmaker</span>
                                                    </button>
                                                )}
                                                
                                                {/* Ticket Purchasing (Unified Modal Route) */}
                                                {selectedMovie.hasActiveRSVP && (
                                                    <button 
                                                        onClick={() => {
                                                            setModalEventDetails(selectedMovie);
                                                            setShowGiftModal(true);
                                                        }} 
                                                        className="button" 
                                                        style={{ margin: 0, width: 'auto', padding: '10px 20px', backgroundColor: '#00FFFF', color: '#0A0A0A', fontWeight: 'bold' }}
                                                    >
                                                        <span className="buttonText">🎫 Buy Watch Party Ticket</span>
                                                    </button>
                                                )}
                                            </>
                                        )}
                                        </div>

                                        {/* Dynamic "Watch" Option */}
                                        {selectedMovie.watchEnabled && selectedMovie.videoUrl && (
                                            <div style={{ marginTop: '20px' }}>
                                                <a href={selectedMovie.videoUrl} target="_blank" rel="noopener noreferrer" className="button" style={{ display: 'inline-flex', backgroundColor: '#00FFFF', color: '#000', margin: 0 }}>
                                                    <span className="buttonText">📺 Watch</span>
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* User Review Submission */}
                            {currentUser && (
                                <form onSubmit={handleReviewSubmit} style={{ backgroundColor: '#1A1A1A', padding: '20px', borderRadius: '12px', marginBottom: '30px', border: '1px solid #333' }}>
                                    <p style={{ fontWeight: 'bold', fontSize: '18px', color: '#FFD700', marginBottom: '15px' }}>
                                        {creatorProfile?.role === 'critic' || creatorProfile?.isCritic || isAdmin ? '✍️ Write a Critic Review' : '🍿 Leave an Audience Rating'}
                                    </p>
                                    <div className="formGroup">
                                        <label className="formLabel">Your Rating: <span style={{ color: '#FFD700', fontWeight: 'bold' }}>{userScore}%</span></label>
                                        <input type="range" min="1" max="100" value={userScore} onChange={(e) => setUserScore(e.target.value)} style={{ width: '100%', accentColor: '#FFD700', cursor: 'pointer' }} />
                                    </div>
                                    <div className="formGroup">
                                        <label className="formLabel">Review Description:</label>
                                        <textarea className="formTextarea" value={userReviewText} onChange={(e) => setUserReviewText(e.target.value)} placeholder="Write your review here..." required />
                                    </div>
                                    <button className="button" type="submit" disabled={isSubmittingReview}>
                                        <span className="buttonText">{isSubmittingReview ? "Submitting..." : "Submit Review"}</span>
                                    </button>
                                </form>
                            )}

                            {/* Reviews Feed & Live Event Comments */}
                            <div style={{ marginTop: '20px', borderTop: '1px dashed #333', paddingTop: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                    <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#FFF', margin: 0 }}>💬 Feedback & Reviews</p>
                                    <span style={{ fontSize: '12px', color: '#888' }}>Real-time opinions from the community</span>
                                </div>
                                {movieReviews.length > 0 ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                        {movieReviews.map((review) => (
                                            <div key={review.id} style={{ padding: '15px', backgroundColor: '#151515', borderRadius: '10px', border: '1px solid #222' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{review.userName}</span>
                                                        {review.isCritic && (
                                                            <span style={{ backgroundColor: '#FFA500', color: '#0A0A0A', fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px' }}>CRITIC</span>
                                                        )}
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <span style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '14px' }}>
                                                            {review.isCritic ? '🍅' : '🍿'} {review.score}%
                                                        </span>
                                                        
                                                        {/* Universal Share Review Button */}
                                                        <button onClick={() => handleShareReview(review)} style={{ backgroundColor: 'rgba(0, 255, 255, 0.1)', border: '1px solid rgba(0, 255, 255, 0.3)', color: '#00FFFF', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
                                                            Share
                                                        </button>

                                                        {isMod && (
                                                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                                                                <button onClick={() => handleToggleCritic(review.userId, review.id, review.isCritic)} style={{ backgroundColor: 'transparent', border: 'none', color: review.isCritic ? '#FFA500' : '#888', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
                                                                    {review.isCritic ? '🎖️ Revoke Critic' : '🎖️ Make Critic'}
                                                                </button>
                                                                <button onClick={() => handleDeleteReview(review.id)} style={{ backgroundColor: 'transparent', border: 'none', color: '#DC3545', cursor: 'pointer', fontSize: '12px' }}>🗑️ Delete</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                                <p style={{ color: '#CCC', fontSize: '13px', margin: 0, fontStyle: 'italic' }}>"{review.reviewText}"</p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p style={{ color: '#888', fontSize: '14px' }}>No reviews yet.</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* SUGGESTION / UPLOAD FORM OVERLAY MODAL */}
            {showSuggestionModal && (
                <div className="confirmationModalOverlay" style={{ zIndex: 3000 }}>
                    <div className="confirmationModalContent" style={{ textAlign: 'left', maxWidth: '500px', maxHeight: '90vh', overflowY: 'auto' }}>
                        <p className="confirmationModalTitle" style={{ color: '#FFD700', margin: '0 0 10px 0' }}>Suggest / Upload to Arena</p>
                        
                        {/* Context-Aware Modal Headers & Selection Toggles */}
                        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
                            <button type="button" onClick={() => { setIsCustomProduction(false); setSuggestMediaType('movie'); setTmdbResults([]); setTmdbPage(1); }} style={{ flex: 1, minWidth: '100px', padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: !isCustomProduction && suggestMediaType === 'movie' ? '#FFD700' : '#222', color: !isCustomProduction && suggestMediaType === 'movie' ? '#000' : '#FFF', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>
                                🔎 Movies
                            </button>
                            <button type="button" onClick={() => { setIsCustomProduction(false); setSuggestMediaType('tv'); setTmdbResults([]); setTmdbPage(1); }} style={{ flex: 1, minWidth: '100px', padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: !isCustomProduction && suggestMediaType === 'tv' ? '#FFD700' : '#222', color: !isCustomProduction && suggestMediaType === 'tv' ? '#000' : '#FFF', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>
                                📺 Series
                            </button>
                            <button type="button" onClick={() => { setIsCustomProduction(false); setSuggestMediaType('anime'); setTmdbResults([]); setTmdbPage(1); }} style={{ flex: 1, minWidth: '100px', padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: !isCustomProduction && suggestMediaType === 'anime' ? '#FFD700' : '#222', color: !isCustomProduction && suggestMediaType === 'anime' ? '#000' : '#FFF', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>
                                🎌 Anime
                            </button>
                            {openedFromArenaTab && (
                                <button type="button" onClick={() => setIsCustomProduction(true)} style={{ flex: 1, minWidth: '100px', padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: isCustomProduction ? '#00FFFF' : '#222', color: isCustomProduction ? '#000' : '#FFF', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}>
                                    🎥 Showcase Film
                                </button>
                            )}
                        </div>

                        {!isCustomProduction ? (
                            <p style={{ color: '#888', fontSize: '12px', marginBottom: '15px' }}>Type any movie or show above. Admin will host the room and procure the stream for your audience!</p>
                        ) : (
                            <p style={{ color: '#888', fontSize: '12px', marginBottom: '15px' }}>Upload your original production. Once approved, it will be published in the Public Showcase and eligible for donations.</p>
                        )}

                        {/* CASE A: TMDB SEARCH & LIVE TRENDING (Top 15) */}
                        {!isCustomProduction ? (
                            tmdbStagingMovie ? (
                                <form onSubmit={confirmTMDbBooking} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'flex', gap: '15px', background: '#111', padding: '15px', borderRadius: '8px', border: '1px solid #333', marginBottom: '10px' }}>
                                        <img src={tmdbStagingMovie.poster_path ? `https://image.tmdb.org/t/p/w154${tmdbStagingMovie.poster_path}` : 'https://placehold.co/100x150/111/FFF?text=N/A'} alt="Poster" style={{ width: '60px', height: '90px', objectFit: 'cover', borderRadius: '4px' }} />
                                        <div>
                                            <p style={{ fontWeight: 'bold', fontSize: '16px', color: '#FFF', margin: '0 0 5px 0' }}>{tmdbStagingMovie.title || tmdbStagingMovie.name}</p>
                                            <p style={{ fontSize: '12px', color: '#AAA', margin: 0 }}>Select your Room and Showtime below to secure your 3-hour booking slot.</p>
                                        </div>
                                    </div>
                                    <div className="formGroup">
                                        <label className="formLabel" style={{ color: '#00FFFF' }}>Virtual Room</label>
                                        <select className="formInput" value={bookingRoom} onChange={e => setBookingRoom(e.target.value)} style={{ background: '#000' }}>
                                            {(isAdmin ? ["Room 1", "Room 2", "Room 3", "Room 4", "Room 5", "Free Screening Room"] : ["Room 1", "Room 2", "Room 3", "Room 4", "Room 5"]).map(r => <option key={r} value={r}>{r}</option>)}
                                        </select>
                                    </div>
                                    <div className="formGroup">
                                        <label className="formLabel" style={{ color: '#00FFFF' }}>Date & Time (Tap icon to open Calendar)</label>
                                        <input type="datetime-local" className="formInput" value={bookingDate} onClick={(e) => e.target.showPicker && e.target.showPicker()} onChange={e => setBookingDate(e.target.value)} style={{ background: '#000', color: '#FFF' }} required />
                                    </div>
                                    {bookingRoom !== "Free Screening Room" && (
                                        <div className="formGroup">
                                            <label className="formLabel" style={{ color: '#00FFFF' }}>Ticket Price (USD)</label>
                                            <input type="number" min="0" step="0.50" className="formInput" value={bookingPrice} onChange={e => setBookingPrice(e.target.value)} style={{ background: '#000' }} required />
                                        </div>
                                    )}
                                    <div style={{ backgroundColor: 'rgba(220, 53, 69, 0.1)', border: '1px solid #DC3545', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
                                        <p style={{ margin: 0, fontSize: '11px', color: '#FFD700', fontWeight: 'bold' }}>⚠️ ZERO-TICKET CANCELLATION POLICY:</p>
                                        <p style={{ margin: '4px 0 0 0', fontSize: '10px', color: '#CCC' }}>If your event secures 0 ticket sales 24 hours prior to showtime, the system will automatically cancel your booking to free up the room.</p>
                                    </div>
                                    <button className="button" type="submit" style={{ backgroundColor: '#00FFFF', color: '#000', fontWeight: 'bold' }}>
                                        <span className="buttonText">🎬 Request Booking</span>
                                    </button>
                                    <button type="button" onClick={() => setTmdbStagingMovie(null)} style={{ background: 'transparent', color: '#888', border: 'none', cursor: 'pointer', marginTop: '10px' }}>Cancel & Pick Another Movie</button>
                                </form>
                            ) : (
                                <div>
                                    <form onSubmit={handleTMDbSearch} style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                                        <input type="text" className="formInput" placeholder={`Type ${suggestMediaType} title...`} value={tmdbQuery} onChange={(e) => setTmdbQuery(e.target.value)} required />
                                        <button type="submit" className="button" style={{ margin: 0, width: 'auto', padding: '0 20px' }}>
                                            <span className="buttonText">{isSearchingTMDb ? "..." : "Search"}</span>
                                        </button>
                                    </form>

                                    {/* Dynamic Results View */}
                                    {tmdbResults.length > 0 ? (
                                        <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', borderBottom: '1px solid #333', paddingBottom: '15px', marginBottom: '15px' }}>
                                            {tmdbResults.map((movie) => {
                                                const isAnimeResult = checkIsAnime(movie);
                                                return (
                                                    <div key={movie.id} onClick={() => handleSelectTMDbMovie(movie)} style={{ display: 'flex', gap: '12px', padding: '8px', backgroundColor: '#222', borderRadius: '6px', cursor: 'pointer' }}>
                                                        <img src={movie.poster_path ? `https://image.tmdb.org/t/p/w154${movie.poster_path}` : 'https://placehold.co/100x150/111/FFF?text=N/A'} alt={movie.title} style={{ width: '45px', height: '65px', objectFit: 'cover', borderRadius: '4px' }} />
                                                        <div style={{ flex: 1 }}>
                                                            <p style={{ fontWeight: 'bold', fontSize: '14px', color: '#FFF', margin: '0 0 4px 0' }}>
                                                                {movie.title || movie.name}
                                                                {isAnimeResult && <span style={{ backgroundColor: '#FFA500', color: '#0A0A0A', fontSize: '9px', fontWeight: 'bold', padding: '2px 5px', borderRadius: '3px', marginLeft: '6px' }}>ANIME</span>}
                                                            </p>
                                                            <p style={{ fontSize: '11px', color: '#AAA', margin: 0 }}>Rating: ⭐ {movie.vote_average || 'N/A'}</p>
                                                        </div>
                                                    </div>
                                                );
                                            })}

                                            {/* TMDB PAGES NAVIGATION CONTROL PANELS */}
                                            {tmdbTotalPages > 1 && (
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0', backgroundColor: '#111', padding: '8px', borderRadius: '6px', border: '1px solid #333' }}>
                                                    <button 
                                                        type="button" 
                                                        disabled={tmdbPage <= 1 || isSearchingTMDb}
                                                        onClick={() => handleTMDbSearch(null, tmdbPage - 1)}
                                                        style={{ padding: '6px 12px', backgroundColor: '#222', border: '1px solid #333', color: '#FFF', cursor: 'pointer', borderRadius: '4px', opacity: tmdbPage <= 1 ? 0.5 : 1, fontSize: '12px', fontWeight: 'bold' }}
                                                    >
                                                        ◀ Prev
                                                    </button>
                                                    <span style={{ fontSize: '12px', color: '#AAA', fontWeight: 'bold' }}>Page {tmdbPage} of {tmdbTotalPages}</span>
                                                    <button 
                                                        type="button" 
                                                        disabled={tmdbPage >= tmdbTotalPages || isSearchingTMDb}
                                                        onClick={() => handleTMDbSearch(null, tmdbPage + 1)}
                                                        style={{ padding: '6px 12px', backgroundColor: '#222', border: '1px solid #333', color: '#FFF', cursor: 'pointer', borderRadius: '4px', opacity: tmdbPage >= tmdbTotalPages ? 0.5 : 1, fontSize: '12px', fontWeight: 'bold' }}
                                                    >
                                                        Next ▶
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        /* TOP 15 WEEKLY TRENDING LIST (Eliminates Blank Search Screen) */
                                        <div style={{ marginBottom: '15px' }}>
                                            <p style={{ color: '#FFD700', fontSize: '13px', fontWeight: 'bold', margin: '0 0 10px 0' }}>🔥 Trending Suggestions This Week:</p>
                                            <div style={{ maxHeight: '250px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                {trendingItems
                                                    .filter(item => {
                                                        if (suggestMediaType === 'anime') return checkIsAnime(item);
                                                        if (suggestMediaType === 'tv') return item.media_type === 'tv' && !checkIsAnime(item);
                                                        return item.media_type === 'movie';
                                                    })
                                                    .map((item) => (
                                                        <div key={item.id} onClick={() => handleSelectTMDbMovie(item)} style={{ display: 'flex', gap: '12px', padding: '8px', backgroundColor: '#222', borderRadius: '6px', cursor: 'pointer' }}>
                                                            <img src={item.poster_path ? `https://image.tmdb.org/t/p/w154${item.poster_path}` : 'https://placehold.co/100x150/111/FFF?text=N/A'} alt={item.title} style={{ width: '45px', height: '65px', objectFit: 'cover', borderRadius: '4px' }} />
                                                            <div style={{ flex: 1 }}>
                                                                <p style={{ fontWeight: 'bold', fontSize: '14px', color: '#FFF', margin: '0 0 4px 0' }}>{item.title || item.name}</p>
                                                                <p style={{ fontSize: '11px', color: '#AAA', margin: 0 }}>Rating: ⭐ {item.vote_average ? item.vote_average.toFixed(1) : 'N/A'}</p>
                                                            </div>
                                                        </div>
                                                    ))
                                                }
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )
                        ) : (
                            /* CASE B: CUSTOM SHOWCASE PRODUCTION FORM */
                            <form onSubmit={handleCustomSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                <div className="formGroup">
                                    <label className="formLabel">Production Title:</label>
                                    <input type="text" className="formInput" value={customTitle} onChange={(e) => setCustomTitle(e.target.value)} placeholder="e.g., Guyana Silence" required />
                                </div>

                                <div className="formGroup">
                                    <label className="formLabel">Genre:</label>
                                    <select 
                                        value={customGenre} 
                                        onChange={(e) => setCustomGenre(e.target.value)} 
                                        className="formInput" 
                                        style={{ backgroundColor: '#222', color: '#FFF', border: '1px solid #444', borderRadius: '6px' }}>
                                        {["Action", "Comedy", "Drama", "Horror", "Sci-Fi", "Documentary", "Romance", "Thriller"].map(g => (
                                            <option key={g} value={g}>{g}</option>
                                        ))}
                                    </select>
                                </div>
                                
                                <div className="formGroup">
                                    <label className="formLabel">Vimeo or YouTube Link (Full Movie/Stream):</label>
                                    <input type="url" className="formInput" value={customVideoUrl} onChange={(e) => handleVideoUrlChange(e.target.value)} placeholder="https://youtube.com/watch?v=..." required />
                                </div>

                                <div className="formGroup">
                                    <label className="formLabel">Trailer Link (Optional):</label>
                                    <input type="url" className="formInput" value={customTrailerUrl} onChange={(e) => setCustomTrailerUrl(e.target.value)} placeholder="YouTube Trailer Link..." />
                                </div>

                                <div className="formGroup">
                                    <label className="formLabel">Poster Artwork (URL):</label>
                                    <input type="url" className="formInput" value={customPoster} onChange={(e) => setCustomPoster(e.target.value)} placeholder="Image URL (will auto-pull if video link is entered above)" />
                                </div>

                                <div className="formGroup">
                                    <label className="formLabel">Or Upload Custom Poster:</label>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <label className="button" style={{ margin: 0, padding: '8px 16px', backgroundColor: '#3A3A3A', cursor: 'pointer', display: 'inline-flex', alignItems: 'center' }}>
                                            <span className="buttonText">{uploadingImage ? "Uploading..." : "📁 Choose Local Image"}</span>
                                            <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} disabled={uploadingImage} />
                                        </label>
                                    </div>
                                </div>

                                {/* LIVE THUMBNAIL / UPLOADED POSTER PREVIEW */}
                                {customPoster && (
                                    <div style={{ marginTop: '5px', position: 'relative', width: '100%', height: '160px', borderRadius: '8px', overflow: 'hidden', border: '1px solid #444', backgroundColor: '#000' }}>
                                        <img src={customPoster} alt="Artwork Preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                        <button 
                                            type="button" 
                                            onClick={() => setCustomPoster('')} 
                                            style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: 'rgba(220,53,69,0.95)', color: '#FFF', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontSize: '11px', fontWeight: 'bold' }}>
                                            ✕ Remove Artwork
                                        </button>
                                    </div>
                                )}

                                <div className="formGroup" style={{ marginTop: '10px' }}>
                                    <label className="formLabel">Synopsis / Cast / Directors:</label>
                                    <textarea className="formTextarea" value={customSynopsis} onChange={(e) => setCustomSynopsis(e.target.value)} placeholder="Describe the film production details..." required />
                                </div>

                                <button className="button" type="submit" style={{ backgroundColor: '#00FFFF', color: '#000' }} disabled={uploadingImage}>
                                    <span className="buttonText">{uploadingImage ? "Uploading Image..." : "Submit Showcase to Queue"}</span>
                                </button>
                            </form>
                        )}

                        <div className="confirmationModalButtons" style={{ marginTop: '20px' }}>
                            <button className="confirmationButton cancel" onClick={() => { setShowSuggestionModal(false); setTmdbResults([]); setTmdbQuery(''); setEditFormTicketPrice('5.00'); setTmdbStagingMovie(null); setBookingDate(''); }}>
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 2: DISCUSSIONS FORUM BOARD */}
            {activeTab === 'discussions' && (
                <div style={{ color: '#FFF' }}>
                    {/* Render active forum thread list */}
                    {!selectedThread ? (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <p className="subHeading" style={{ margin: 0 }}>Active Forums</p>
                                {currentUser && (
                                    <button className="button" style={{ margin: 0, width: 'auto', backgroundColor: '#FFD700', color: '#000' }} onClick={() => setShowNewThreadModal(true)}>
                                        <span className="buttonText">💬 Start Discussion</span>
                                    </button>
                                )}
                            </div>
                            
                            {/* Live Forum Board retrieved directly from Firestore */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                                {discussions.length > 0 ? (
                                    discussions.map((thread) => (
                                        <div key={thread.id} onClick={() => setSelectedThread(thread)} style={{ padding: '15px', backgroundColor: '#1A1A1A', borderRadius: '10px', border: '1px solid #333', cursor: 'pointer' }}>
                                            <p style={{ margin: '0 0 6px 0', fontSize: '16px', fontWeight: 'bold', color: '#FFD700' }}>{thread.title}</p>
                                            <p style={{ margin: 0, fontSize: '12px', color: '#888' }}>Started by: {thread.authorName} • {thread.replyCount || 0} replies</p>
                                        </div>
                                    ))
                                ) : (
                                    <p style={{ color: '#888', fontSize: '14px' }}>No active discussions. Be the first to start one!</p>
                                )}
                            </div>
                        </div>
                    ) : (
                        /* Expanded Thread View */
                        <div>
                            <button className="topButton" onClick={() => setSelectedThread(null)} style={{ backgroundColor: '#3A3A3A', marginBottom: '20px' }}>
                                ← Back to Forums
                            </button>
                            <div style={{ padding: '20px', backgroundColor: '#1A1A1A', borderRadius: '12px', border: '1px solid #FFD700', marginBottom: '20px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '15px' }}>
                                    <p style={{ fontSize: '20px', fontWeight: 'bold', color: '#FFD700', margin: '0 0 8px 0' }}>{selectedThread.title}</p>
                                    <button onClick={() => handleShareThread(selectedThread)} style={{ background: 'transparent', border: '1px solid #FFD700', color: '#FFD700', padding: '6px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                                        <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
                                        Share Topic
                                    </button>
                                </div>
                                <p style={{ fontSize: '12px', color: '#888', margin: '0 0 15px 0' }}>Posted by: {selectedThread.authorName}</p>
                                <p style={{ color: '#CCC', fontSize: '14px', lineHeight: 1.6, margin: 0 }}>{selectedThread.text}</p>
                            </div>

                            {/* Thread Replies */}
                            <p style={{ fontSize: '16px', fontWeight: 'bold', margin: '20px 0 10px 0' }}>Replies</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                                <div style={{ padding: '12px', backgroundColor: '#111', borderRadius: '8px', border: '1px solid #222' }}>
                                    <p style={{ fontSize: '12px', color: '#888', margin: '0 0 4px 0' }}>GuyanaFilmmaker • Just now</p>
                                    <p style={{ margin: 0, fontSize: '13px', color: '#CCC' }}>Agreed! The natural lighting and raw film stock made a massive difference.</p>
                                </div>
                            </div>

                            {/* Post a Reply */}
                            {currentUser && (
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <input type="text" className="formInput" placeholder="Write a reply..." value={replyText} onChange={(e) => setReplyText(e.target.value)} style={{ margin: 0 }} />
                                    <button className="button" onClick={() => { showMessage("Reply posted!"); setReplyText(''); }} style={{ margin: 0, width: 'auto', padding: '0 25px' }}>
                                        <span className="buttonText">Post</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* NEW THREAD MODAL OVERLAY */}
                    {showNewThreadModal && (
                        <div className="confirmationModalOverlay" style={{ zIndex: 4000 }}>
                            <div className="confirmationModalContent" style={{ textAlign: 'left', maxWidth: '400px' }}>
                                <p className="confirmationModalTitle" style={{ color: '#FFD700' }}>Start a New Thread</p>
                                <div className="formGroup">
                                    <label className="formLabel">Topic Title:</label>
                                    <input type="text" className="formInput" value={newThreadTitle} onChange={(e) => setNewThreadTitle(e.target.value)} required />
                                </div>
                                <div className="formGroup">
                                    <label className="formLabel">Message:</label>
                                    <textarea className="formTextarea" value={newThreadText} onChange={(e) => setNewThreadText(e.target.value)} rows="4" required />
                                </div>
                                <div className="confirmationModalButtons" style={{ marginTop: '20px' }}>
                                    <button className="confirmationButton cancel" onClick={() => setShowNewThreadModal(false)}>Cancel</button>
                                    <button className="confirmationButton confirm" style={{ backgroundColor: '#FFD700', color: '#000' }} onClick={handleCreateThread}>Create Thread</button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 3: WATCHLIST */}
            {activeTab === 'watchlist' && (
                <div style={{ color: '#FFF' }}>
                    <p className="subHeading" style={{ marginBottom: '20px' }}>My Watchlist</p>
                    {movies.filter(m => watchlistIds.has(m.id)).length > 0 ? (
                        <div className="contentGrid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '20px' }}>
                            {movies.filter(m => watchlistIds.has(m.id)).sort((a, b) => ((a.genre || "Drama") > (b.genre || "Drama") ? 1 : -1)).map((movie) => (
                                <div key={movie.id} className="contentCard" onClick={() => {
                                    if (movie.type === 'premiere') {
                                        // THE FIX: Routes cleanly to the Multiplex Lobby
                                        sessionStorage.setItem('nva_target_discover_tab', 'Premieres');
                                        sessionStorage.removeItem('nva_target_premiere_event_id');
                                        setActiveScreen('Discover');
                                    } else {
                                        setSelectedMovie(movie);
                                    }
                                }} style={{ cursor: 'pointer', padding: '10px', backgroundColor: '#1A1A1A', borderRadius: '12px', border: '1px solid #222' }}>
                                    <div style={{ position: 'relative' }}>
                                        <img src={movie.posterUrl} alt={movie.title} style={{ width: '100%', height: '240px', objectFit: 'cover', borderRadius: '8px' }} />
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); handleToggleWatchlist(movie); }} 
                                            style={{ position: 'absolute', top: '8px', right: '8px', backgroundColor: 'rgba(220,53,69,0.95)', color: '#FFF', border: 'none', borderRadius: '4px', cursor: 'pointer', padding: '4px 8px', fontSize: '11px', fontWeight: 'bold' }}>
                                            ✕ Remove
                                        </button>
                                    </div>
                                    <p style={{ fontWeight: 'bold', fontSize: '14px', color: '#FFF', margin: '10px 0 5px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{movie.title}</p>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px' }}>
                                        <span style={{ color: '#FFA500' }}>🍅 {movie.criticScore || 0}%</span>
                                        <span style={{ color: '#FFD700' }}>🍿 {movie.audienceScore || 0}%</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p style={{ color: '#888', fontSize: '14px' }}>Your Watchlist is empty. Add movies using the "➕ Watchlist" button on any film.</p>
                    )}
                </div>
            )}

            {/* IN-APP CONFIRMATION DELETE MODAL */}
            {showDeleteConfirmModal && (
                <div className="confirmationModalOverlay" style={{ zIndex: 5000 }}>
                    <div className="confirmationModalContent" style={{ textAlign: 'center', maxWidth: '350px' }}>
                        <p className="confirmationModalTitle" style={{ color: '#DC3545', margin: '0 0 10px 0', fontWeight: 'bold' }}>⚠️ Delete Movie?</p>
                        <p style={{ color: '#CCC', fontSize: '14px', lineHeight: 1.5, marginBottom: '20px' }}>
                            Are you sure you want to permanently delete this movie from the Arena? This action cannot be undone.
                        </p>
                        <div className="confirmationModalButtons" style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                            <button className="confirmationButton cancel" onClick={() => { setShowDeleteConfirmModal(false); setMovieToDeleteId(null); }}>
                                Cancel
                            </button>
                            <button className="confirmationButton confirm" style={{ backgroundColor: '#DC3545', color: '#FFF' }} onClick={confirmDeleteMovie}>
                                Yes, Delete
                            </button>
                        </div>
                    </div>
                </div>
           )}
                
                {showGiftModal && (
                    <GiftTicketModal
                        onClose={() => setShowGiftModal(false)}
                        eventDetails={modalEventDetails}
                        currentUser={currentUser}
                        creatorProfile={creatorProfile} // THE FIX: Resolves the disabled earnings button bug
                        setPledgeContext={setPledgeContext}
                        setActiveScreen={setActiveScreen}
                        showMessage={showMessage}
                    />
                )}
            </div>
        );
    };

    export default FilmArenaScreen;