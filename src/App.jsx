// src/App.jsx

import notificationSound from './Notification 2.mp3';
import { useState, useEffect, useCallback, lazy, Suspense, useRef, useMemo } from 'react';
import { doc, getDoc, setDoc, onSnapshot, collection, query, where, orderBy, limit, updateDoc } from "firebase/firestore";
import { getDatabase, ref, onValue, onDisconnect, set, serverTimestamp } from "firebase/database";
import { onAuthStateChanged, signOut, applyActionCode } from "firebase/auth";
import { auth, db } from './firebase.js';
import { httpsCallable } from 'firebase/functions';
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { functions, app } from './firebase.js';

// MODALS & CORE UI (Loaded immediately)
import ContentPlayerModal from './components/ContentPlayerModal';
import Header from './components/Header';
import NavigationBar from './components/NavigationBar';
import VideoPlayerModal from './components/VideoPlayerModal';
import ConfirmationModal from './components/ConfirmationModal';
import ReportContentModal from './components/ReportContentModal';
import CommentsModal from './components/CommentsModal';
import ContentAppealModal from './components/ContentAppealModal';
import LikesModal from './components/LikesModal';

// LAZY-LOADED SCREENS (Loaded on demand)
const CenterStageScreen = lazy(() => import('./components/CenterStageScreen'));
const NotificationInboxScreen = lazy(() => import('./components/NotificationInboxScreen'));
const MyFollowsScreen = lazy(() => import('./components/MyFollowsScreen'));
const FollowersScreen = lazy(() => import('./components/FollowersScreen'));
const EnrollmentHubScreen = lazy(() => import('./components/EnrollmentHubScreen'));
const EnrollmentPaymentScreen = lazy(() => import('./components/EnrollmentPaymentScreen'));
const FilmArenaScreen = lazy(() => import('./components/FilmArenaScreen'));
const FollowingFeedScreen = lazy(() => import('./components/FollowingFeedScreen'));
const BlockedListScreen = lazy(() => import('./components/BlockedListScreen'));
const HomeScreen = lazy(() => import('./components/HomeScreen'));
const AboutScreen = lazy(() => import('./components/AboutScreen'));
const ContactScreen = lazy(() => import('./components/ContactScreen'));
const CompetitionScreen = lazy(() => import('./components/CompetitionScreen'));
const PrivacyPolicyScreen = lazy(() => import('./components/PrivacyPolicyScreen'));
const TermsOfServiceScreen = lazy(() => import('./components/TermsOfServiceScreen'));
const DiscoverScreen = lazy(() => import('./components/DiscoverScreen'));
const DiscoverUsersScreen = lazy(() => import('./components/DiscoverUsersScreen'));
const LoginScreen = lazy(() => import('./components/LoginScreen'));
const SignUpScreen = lazy(() => import('./components/SignUpScreen'));
const VerifyEmailScreen = lazy(() => import('./components/VerifyEmailScreen'));
const ForgotPasswordScreen = lazy(() => import('./components/ForgotPasswordScreen'));
const SuspendedScreen = lazy(() => import('./components/SuspendedScreen'));
const BannedScreen = lazy(() => import('./components/BannedScreen'));
const PendingConfirmationScreen = lazy(() => import('./components/PendingConfirmationScreen'));
const CreatorConnectScreen = lazy(() => import('./components/CreatorConnectScreen'));
const OpportunityDetailsScreen = lazy(() => import('./components/OpportunityDetailsScreen'));
const PostOpportunityForm = lazy(() => import('./components/PostOpportunityForm'));
const MyListingsScreen = lazy(() => import('./components/MyListingsScreen'));
const SavedOpportunitiesScreen = lazy(() => import('./components/SavedOpportunitiesScreen'));
const AdminOpportunityDetailsScreen = lazy(() => import('./components/AdminOpportunityDetailsScreen'));
const UserProfileScreen = lazy(() => import('./components/UserProfileScreen'));
const CreatorDashboardScreen = lazy(() => import('./components/CreatorDashboardScreen'));
const MyContentLibraryScreen = lazy(() => import('./components/MyContentLibraryScreen'));
const PayoutRequestForm = lazy(() => import('./components/PayoutRequestForm')); // THE FIX: Import the form
const AdminDashboardScreen = lazy(() => import('./components/AdminDashboardScreen'));
const AdminReportReviewScreen = lazy(() => import('./components/AdminReportReviewScreen'));
const AdminEventManagerScreen = lazy(() => import('./components/AdminEventManagerScreen'));
const AnalyticsDashboardScreen = lazy(() => import('./components/AnalyticsDashboardScreen'));
const ChatListScreen = lazy(() => import('./components/ChatListScreen'));
const ChatMessageScreen = lazy(() => import('./components/ChatMessageScreen'));
const MusicChartsScreen = lazy(() => import('./components/MusicChartsScreen'));
const RoastRoomScreen = lazy(() => import('./components/RoastRoomScreen')); // NEW: LiveKit Roast Arena
const LiveDirectoryScreen = lazy(() => import('./components/LiveDirectoryScreen')); // NEW: Global Directory
const FilmClubHubScreen = lazy(() => import('./components/FilmClubHubScreen')); // NEW: Cinematic Classroom Hub

import IosInstallPrompt from './components/IosInstallPrompt'; // <-- ADD THIS LINE

import { useNotifications } from './hooks/useNotifications';
import NotificationToast from './components/NotificationToast';
import CompetitionHomeScreenBanner from './components/CompetitionHomeScreenBanner'; // THE FIX: Define the missing component
// --- PWA UPDATE FIX: Import our new custom hook and the component ---
import { usePWAUpdate } from './hooks/usePWAUpdate';

function App() {
  const [messagingInstance, setMessagingInstance] = useState(null); // <-- ADD THIS LINE
  // --- PWA UPDATE FIX: Logic to handle the update prompt ---
  const { needRefresh, handleUpdate } = usePWAUpdate();
  

  // ======================= START: DEFINITIVE EMAIL ACTION HANDLER ========================
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const actionCode = params.get('oobCode');

    if (!actionCode) return; // If there's no code, do nothing.

    const handleEmailAction = async () => {
      try {
        if (mode === 'verifyEmail') {
          await applyActionCode(auth, actionCode);
          showMessage("Your email has been successfully verified! Please log in.");
          await signOut(auth); // Ensure clean state
          setActiveScreen('Login');
        } else if (mode === 'resetPassword') {
          // If it's a password reset, pass the code to the ForgotPasswordScreen
          // and switch to that screen.
          setActionCode(actionCode); // A new state we will add
          setActiveScreen('ForgotPassword');
        }
      } catch (error) {
        console.error(`Error handling action code for mode '${mode}':`, error);
        showMessage("Invalid or expired link. Please try again.");
        setActiveScreen('Login'); // Default to login on error
      } finally {
        // Clean the URL to prevent the code from being re-used.
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    };

    handleEmailAction();
  }, []); // Empty dependency array ensures this runs only once.
  // ======================== END: DEFINITIVE EMAIL ACTION HANDLER =========================
      
   // AGGRESSIVE CACHE NUKE REMOVED: Prevents the 60-second reload loop. 
  // The PWA Update prompt now manages versioning cleanly [1].
  
  // --- END OF PWA UPDATE FIX ---

  // --- STATE MANAGEMENT ---
  const routingDoneRef = useRef(false);
  
  const [currentUser, setCurrentUser] = useState(null);
  const [creatorProfile, setCreatorProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [contentPlayerData, setContentPlayerData] = useState(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true); // <-- FIX: New state for one-time video
  const [installPromptEvent, setInstallPromptEvent] = useState(null); // <-- PWA FIX: Stores the install event

  const [isStandalone, setIsStandalone] = useState(false); // <-- PWA FIX: Checks if app is already installed
  const [activeScreen, setActiveScreen] = useState('Home');
  const [activeCompetition, setActiveCompetition] = useState(null);
  const [previousScreen, setPreviousScreen] = useState(null);
  const isProgrammaticPopRef = useRef(false); // <-- PREVENTS DUAL POPSTATE COLLISION
  const [shouldOpenGiftModalOnLoad, setShouldOpenGiftModalOnLoad] = useState(false); // <-- ADD THIS GLOBAL COMMAND STATE
  
  // --- GLOBAL CREATOR GIFT MODAL STATE ---
  const [showGiftingModal, setShowGiftingModal] = useState(false);
  const [giftingRecipient, setGiftingRecipient] = useState(null);
  const [message, setMessage] = useState('');
  const [showIosInstallPrompt, setShowIosInstallPrompt] = useState(false); // <-- iOS PWA FIX
  const [liveEvent, setLiveEvent] = useState(null);
  const [isLive, setIsLive] = useState(false);
  
  const [currencyRates] = useState({}); // Legacy Currency Rates deactivated [1]
  const [selectedCurrency, setSelectedCurrency] = useState('USD');

  const [showVideoModal, setShowVideoModal] = useState(false);
  const [currentVideoUrl, setCurrentVideoUrl] = useState('');
  const [currentContentItem, setCurrentContentItem] = useState(null);
  const [countdownText, setCountdownText] = useState('');
  // --- THIS IS THE FIX: State for the Top Creators feature ---
  const [featuredContentSlots, setFeaturedContentSlots] = useState(null);
  // -----------------------------------------------------------

  // --- Master standalone ad banner state ---
  const [headerAd, setHeaderAd] = useState(null);

  useEffect(() => {
    let unsubscribe = () => {};
    if (!authLoading) {
      unsubscribe = onSnapshot(doc(db, "settings", "headerAd"), (snap) => {
        if (snap.exists()) {
          setHeaderAd(snap.data());
        } else {
          setHeaderAd(null);
        }
      });
    }
    return () => unsubscribe();
  }, [authLoading]);

  const [centerStageTargetId, setCenterStageTargetId] = useState(null);
  const [deepLinkedReplayId, setDeepLinkedReplayId] = useState(null);
  const [selectedChatId, setSelectedChatId] = useState(null);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);
  
  // State for payment and confirmation flows
  const [pledgeContext, setPledgeContext] = useState(null);
  const [pledgeIdForConfirmation, setPledgeIdForConfirmation] = useState(null);

  // State for Admin Dashboard and Modals
  const [selectedAdminSubScreen, setSelectedAdminSubScreen] = useState('Overview');
  const [selectedCompAdmin, setSelectedCompAdmin] = useState(null);
  const [selectedReportGroup, setSelectedReportGroup] = useState(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [confirmationTitle, setConfirmationTitle] = useState('');
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [onConfirmationAction, setOnConfirmationAction] = useState(null);

  const [showReportModal, setShowReportModal] = useState(false);
  const [contentToReport, setContentToReport] = useState(null);
  
  const [suspensionDetails, setSuspensionDetails] = useState(null);
  const [showCommentsModal, setShowCommentsModal] = useState(false);
  const [showContentAppealModal, setShowContentAppealModal] = useState(false);
  const [notificationToAppeal, setNotificationToAppeal] = useState(null);
  const [itemForComments, setItemForComments] = useState(null);
  const [itemTypeForComments, setItemTypeForComments] = useState('');
  const [showLikesModal, setShowLikesModal] = useState(false);
  const [contentForLikes, setContentForLikes] = useState(null);
  const [openCommentsOnLoad, setOpenCommentsOnLoad] = useState(false); // <-- Add this line

  const [actionCode, setActionCode] = useState(null);

    const [hasNewFollowerContent, setHasNewFollowerContent] = useState(false);

    // --- Notification Toast System State ---
  const { notifications, markToastAsSeen, markNotificationAsRead } = useNotifications(currentUser);
  const [toastQueue, setToastQueue] = useState([]);
  const [currentToast, setCurrentToast] = useState(null);
  const processedToastIds = useRef(new Set()); // Use a ref to prevent re-renders
  const notificationSoundRef = useRef(null);
  const [notificationBadgeCount, setNotificationBadgeCount] = useState(0);
    
    const [unreadChatCount, setUnreadChatCount] = useState(0); // For the chat icon badge

    const markAllAsRead = async () => {
        try {
            // This makes a SINGLE, powerful call to the correct backend function.
            const markAllFunction = httpsCallable(functions, 'markAllNotificationsAsRead');
            await markAllFunction();
            // The onSnapshot listener in NotificationInboxScreen will handle the UI update.
        } catch (error) {
            console.error("Error marking all notifications as read:", error);
            showMessage("An error occurred. Please try again.");
        }
    };

  const [isAudioPrimed, setIsAudioPrimed] = useState(false);

  const showMessage = (msg) => {
    
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

      const handleToastClose = useCallback(() => {
    setCurrentToast(null);
    setToastQueue(prev => prev.slice(1));
  }, []);

        const dismissNotification = async (notificationId) => {
    try {
        const deleteNotificationFunction = httpsCallable(functions, 'deleteNotification');
        await deleteNotificationFunction({ notificationId: notificationId });
        // The UI updates optimistically, so no success message is needed.
    } catch (error) {
        console.error("Error dismissing notification:", error);
        showMessage("Failed to dismiss. Please try again.");
    }
  };

    // Legacy Currency Rates Firestore listener removed [1]

  // The new navigation handler that tracks screen history AND syncs with browser history
  const handleNavigate = useCallback((newScreen) => {
    setActiveScreen(prevScreen => {
      if (newScreen !== prevScreen) {
        setPreviousScreen(prevScreen);
        // This is the fix: Push a new state to the browser's history stack
        window.history.pushState({ screen: newScreen }, '');
      }
      return newScreen;
    });
  }, []);

  // ======================= START: POST-LOGIN REDIRECT FIX =======================
  useEffect(() => {
    if (currentUser && !authLoading) {
      const guestScreens = ['Login', 'SignUp', 'ForgotPassword', 'VerifyEmail'];
      // THE FIX: Ensure auto-redirects don't hijack the screen during a Gifting transition
      if (guestScreens.includes(activeScreen) && !shouldOpenGiftModalOnLoad) {
        const creationTime = new Date(currentUser.metadata.creationTime).getTime();
        const isNewUser = (new Date().getTime() - creationTime) < 30000; 
        setActiveScreen(isNewUser ? 'CreatorDashboard' : 'Home');
      }
    }
  }, [currentUser, authLoading, activeScreen]);
  // ======================== END: POST-LOGIN REDIRECT FIX ========================

  const handleLogout = useCallback(async () => {
    try {
      await signOut(auth);
      window.location.href = '/';
    } catch (error) {
      console.error("Logout failed:", error);
      showMessage("An error occurred during logout.");
    }
  }, []);

  const handleVideoPress = useCallback((url, item) => {
    setCurrentVideoUrl(url);
    setCurrentContentItem(item);
    setShowVideoModal(true);
  }, []);

    const handleInstallClick = () => {
    // If the app is already installed, do nothing.
    if (isStandalone) {
      showMessage("The app is already installed on your device.");
      return;
    }

    // --- Standard PWA Install (Android/Desktop Chrome) ---
    // If we have a saved install event, trigger the browser's native prompt.
    if (installPromptEvent) {
      installPromptEvent.prompt();
      // The browser handles the rest. Our 'appinstalled' event listener will hide the button later.
      return;
    }

    // --- iOS Manual Install Instructions ---
    // If there's no event, check if the user is on iOS and show our instruction modal.
    const isIos = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
    if (isIos) {
      setShowIosInstallPrompt(true);
      return;
    }
    
    // --- Fallback for other browsers (e.g., Firefox) ---
    // For browsers that don't support the PWA install event, show a generic message.
    showMessage("To install, use the 'Add to Home Screen' option in your browser's menu.");
  };

  // ========================== START: BULLETPROOF AUTHENTICATION LISTENER ==========================
  useEffect(() => {
    let unsubProfile = () => {};
    let unsubFollowing = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      unsubProfile();
      unsubFollowing();
      setAuthLoading(true);

      // 1. HANDLE ROUTING LOGIC FIRST (Regardless of Auth Status)
      if (!routingDoneRef.current) {
          routingDoneRef.current = true;
          const path = window.location.pathname;
          const parts = path.split('/').filter(Boolean);
          
          if (parts.length > 0) {
            const screen = parts[0];
            const id = parts[1];
            
            switch (screen) {
              case 'opportunity': 
                if (id) { setSelectedOpportunity({ id }); setActiveScreen('OpportunityDetails'); } 
                break;
              case 'discover': 
                setActiveScreen('Discover'); 
                break;
              case 'user': 
                if (id) { 
                   if (user && id === user.uid) { setActiveScreen('CreatorDashboard'); } 
                   else { setSelectedUserId(id); setActiveScreen('UserProfile'); } 
                } 
                break;
              case 'competition': 
                setActiveScreen('CompetitionScreen'); 
                break;
              case 'promotedStatus': 
                if (id) { setActiveScreen('Home'); } 
                break;
              case 'CenterStage':
                if (id) { setCenterStageTargetId(id); }
                setActiveScreen('CenterStage');
                break;
              case 'content': 
                if (id) { 
                  (async () => { 
                    try { 
                      const appId = import.meta.env.VITE_APP_ID; 
                      let docSnap = await getDoc(doc(db, "artifacts", appId, "public", "data", "content_items", id)); 
                      if (docSnap.exists()) { 
                        const item = { id: docSnap.id, ...docSnap.data() }; 
                        handleVideoPress(item.embedUrl || item.mainUrl, item); 
                      } else { 
                        docSnap = await getDoc(doc(db, "events", id)); 
                        if (docSnap.exists() && docSnap.data().status === 'completed') { 
                          setDeepLinkedReplayId(id); 
                          setActiveScreen('Discover'); 
                        } else { 
                          showMessage("Shared content could not be found."); 
                        } 
                      } 
                    } catch (error) { 
                      showMessage("Error loading shared content."); 
                    } 
                  })(); 
                } 
                break;
            }
          }
      }

      try {
          if (!user) {
            // THE FIX: Total State Purge on Logout to prevent Notification ghosting/leaks
            setCurrentUser(null);
            setCreatorProfile(null);
            setHasNewFollowerContent(false);
            setNotificationBadgeCount(0);
            setUnreadChatCount(0);
            setToastQueue([]);
            processedToastIds.current.clear();
            return;
          }

          // THE DEFINITIVE FIX: Force a reload of the user object from Firebase servers.
          await user.reload();
          await user.getIdToken(true); // <-- FORCE REFRESH TO SYNC NEW CLAIMS (E.G. ADMIN ROLE) INSTANTLY!
          
          setCurrentUser(user);

        if (!user.emailVerified) {
          setCreatorProfile(null);
          setActiveScreen('VerifyEmail');
          return;
        }

        const userDocRef = doc(db, "creators", user.uid);
        let docSnap = await getDoc(userDocRef);

        // SILENT SYNC FIX: If doc doesn't exist yet, wait 2 seconds for the signup function to finish [1]
        if (!docSnap.exists()) {
            await new Promise(res => setTimeout(res, 2000));
            docSnap = await getDoc(userDocRef);
        }

        let profileData;
        if (!docSnap.exists()) {
          // Final Fallback: Only create if the signup function truly failed after waiting [1]
          const pendingField = localStorage.getItem('pendingCreatorField');
          profileData = {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || '',
            photoURL: user.photoURL || '',
            role: pendingField ? 'creator' : 'user',
            ...(pendingField && { creatorField: pendingField }),
            createdAt: new Date(),
            lastLoginTimestamp: new Date(),
            banned: false,
            suspendedUntil: null,
            unreadNotificationCount: 0
          };
          await setDoc(userDocRef, profileData);
        } else {
          profileData = docSnap.data();
        }
        
        // Zero-dust cleanup: Purge the cache flag regardless of how the profile was generated
        localStorage.removeItem('pendingCreatorField');

        if (profileData.banned) {
          setActiveScreen('Banned');
          await signOut(auth);
          return;
        }
        if (profileData.suspendedUntil && profileData.suspendedUntil.toDate() > new Date()) {
          const expiryDate = profileData.suspendedUntil.toDate().toLocaleString();
          setCreatorProfile(profileData);
          setSuspensionDetails({ email: profileData.email, expiryDate });
          setActiveScreen('Suspended');
          return;
        }

        // Only attempt to update and listen if the profile document exists [1]
        if (docSnap.exists()) {
            await updateDoc(userDocRef, { 
                lastLoginTimestamp: new Date(),
                location: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown' 
            });
        }

        unsubProfile = onSnapshot(userDocRef, (snap) => {
          if (snap.exists()) {
            const profileData = snap.data();
            // GOD-TIER ROLE ENFORCEMENT
            if (user.email === 'nvanetwork101@gmail.com' && profileData.role !== 'super_admin') {
                updateDoc(userDocRef, { role: 'super_admin' }).catch(() => {});
            }
            // THE FIX: Synchronous Badge Update. Ensures UI doesn't lag on reload.
            setCreatorProfile(profileData);
            setNotificationBadgeCount(profileData.unreadNotificationCount || 0);
          } else if (user) {
            // Only sign out if the user is authenticated but the doc is missing
            signOut(auth);
          }
        });

        const q = query(collection(db, "creators", user.uid, "following"), where("hasNewContent", "==", true));
        unsubFollowing = onSnapshot(q, (snapshot) => setHasNewFollowerContent(!snapshot.empty));

      } catch (error) {
        console.error("Authentication Sync Warning:", error);
        // THE FIX: Only log out if it's a genuine Auth failure. 
        // Do NOT log out for secondary permission errors (like presence or following-count lag) [1].
        if (error.code === 'auth/user-token-expired' || error.code === 'auth/user-not-found') {
            await signOut(auth);
            showMessage("Session expired. Please log in again.");
        }
      } finally {
        setAuthLoading(false);
        setIsInitialLoad(false);
      }
    });

    return () => {
      unsubscribeAuth();
      unsubProfile();
      unsubFollowing();
    };
  }, []);
  // =========================== END: BULLETPROOF AUTHENTICATION LISTENER ===========================
 
    // ======================= START: USER PRESENCE SYSTEM (REALTIME DB) ========================
  useEffect(() => {
    if (!currentUser) {
        return;
    }

    const dbRT = getDatabase();
    const myStatusRef = ref(dbRT, '/status/' + currentUser.uid);

    const isOnlineForDB = {
        state: 'online',
        last_changed: serverTimestamp(),
    };
    
    const isOfflineForDB = {
        state: 'offline',
        last_changed: serverTimestamp(),
    };

    const connectedRef = ref(dbRT, '.info/connected');
    const unsubscribe = onValue(connectedRef, (snap) => {
        if (snap.val() === true) {
            onDisconnect(myStatusRef).set(isOfflineForDB).catch(() => {});
            set(myStatusRef, isOnlineForDB).catch(() => {});
        }
    });

    return () => {
        unsubscribe();
        if (currentUser) {
            set(myStatusRef, isOfflineForDB).catch(() => {});
        }
    };
  }, [currentUser]);
  // ========================= END: USER PRESENCE SYSTEM (REALTIME DB) ==========================

       // ======================= START: UNREAD CHAT COUNT LISTENER ========================
   useEffect(() => {
    if (!currentUser) {
        setUnreadChatCount(0);
        return;
    }

    // THIS IS THE DEFINITIVE FIX:
    // This query now directly and efficiently counts only the chats that are marked as unread FOR the current user.
    const q = query(
        collection(db, "chats"),
        where("unreadBy", "array-contains", currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
        // The number of documents in the result is the unread count.
        setUnreadChatCount(snapshot.size);
    });

    return () => unsubscribe();
  }, [currentUser]);
  // ========================= END: UNREAD CHAT COUNT LISTENER ========================== 

       // ======================= START: PUSH NOTIFICATION SETUP =======================
useEffect(() => {
    if (!currentUser || !messagingInstance) return;

    const setupNotifications = async () => {
        try {
            // FINAL FIX: Only request permission if it hasn't been granted or denied yet.
            if (Notification.permission === 'default') {
                console.log("Notification permission is default. Requesting permission...");
                await Notification.requestPermission();
            }

            // Proceed only if permission is granted.
            if (Notification.permission === 'granted') {
                console.log("Notification permission is granted. Ensuring Service Worker is active...");
                
                // Ensure service worker is fully ready and activated before asking for a token
                if ('serviceWorker' in navigator) {
                    await navigator.serviceWorker.ready;
                }

                console.log("Acquiring token...");
                const currentToken = await getToken(messagingInstance, {
                    vapidKey: import.meta.env.VITE_FCM_VAPID_KEY || 'BEZWeaGgXfqqK2CT8VAkbHssB_uQN3we9XxunByTBl2mERHHu8q9E_ZGOv9cG0f369hBBNm8WITA6fncyIjnam0',
                });

                if (currentToken) {
                    const saveTokenFunction = httpsCallable(functions, 'saveFCMToken');
                    await saveTokenFunction({ token: currentToken });
                    console.log("FCM Token acquired and saved successfully.");
                }
            } else {
                console.log("Notification permission was not granted.");
            }
        } catch (error) {
            console.error("An error occurred during notification setup.", error);
        }
    };

    // Add a small delay to give the messaging instance a moment to stabilize on mobile.
    const timer = setTimeout(() => {
        setupNotifications();
    }, 1000); // 1-second delay

    const unsubscribeOnMessage = onMessage(messagingInstance, (payload) => {
        console.log("Foreground push notification received, but toast is handled by Firestore listener:", payload);
    });

    return () => {
        clearTimeout(timer);
        unsubscribeOnMessage();
    };

}, [currentUser, messagingInstance]);
// ======================== END: PUSH NOTIFICATION SETUP ========================
    
     
    // Legacy Campaign View Handler removed for NVA CenterStage

  // ======================= START: NOTIFICATION INBOX HANDLERS =======================
useEffect(() => {
    const handleNavToOpp = (event) => {
        const { id } = event.detail;
        setSelectedOpportunity({ id: id });
        handleNavigate('OpportunityDetailsScreen');
    };
    const handleNavToUser = (event) => {
        const { id } = event.detail;

        // This is the definitive fix:
        if (currentUser && id === currentUser.uid) {
            // If the notification link is for the logged-in user, go to their private dashboard.
            handleNavigate('CreatorDashboard');
        } else {
            // Otherwise, go to the public profile of the other user.
            setSelectedUserId(id);
            handleNavigate('UserProfile');
        }
    };

    window.addEventListener('navigateToOpportunity', handleNavToOpp);
    window.addEventListener('navigateToUser', handleNavToUser);

    return () => {
        window.removeEventListener('navigateToOpportunity', handleNavToOpp);
        window.removeEventListener('navigateToUser', handleNavToUser);
    };
}, [handleNavigate, currentUser]); // Added `currentUser` to the dependency array // Dependency on handleNavigate is correct
// ======================== END: NOTIFICATION INBOX HANDLERS ========================

    // ======================= START: CONTENT NOTIFICATION HANDLER =======================
  useEffect(() => {
    const handleNavToContent = async (event) => {
        const { id, openComments, type } = event.detail; 
        if (!id) return;

        try {
            // THE FIX: Dynamic Content Resolution. Checks BOTH Library and Events (Replays)
            const appId = import.meta.env.VITE_APP_ID || "production-app-id";
            let contentData = null;

            const libraryRef = doc(db, "artifacts", appId, "public", "data", "content_items", id);
            const librarySnap = await getDoc(libraryRef);

            if (librarySnap.exists()) {
                contentData = { id: librarySnap.id, ...librarySnap.data() };
            } else {
                const eventRef = doc(db, "events", id);
                const eventSnap = await getDoc(eventRef);
                if (eventSnap.exists()) contentData = { id: eventSnap.id, ...eventSnap.data() };
            }

            if (contentData) {
                // Handle Auto-Comments
                if (openComments) setOpenCommentsOnLoad(true);
                
                // If the notification is a Monetization Approval, force a profile refresh to show badges
                if (type === 'VIDEO_APPROVED') {
                    setActiveScreen('CreatorDashboard'); 
                    showMessage("🎉 Your video is now LIVE & Monetized!");
                }

                handleVideoPress(contentData.embedUrl || contentData.mainUrl || contentData.liveStreamUrl, contentData);
            } else {
                showMessage("Content no longer available.");
            }
        } catch (error) {
            console.error("Deep-Link Error:", error);
            showMessage("Failed to open content.");
        }
    };

    window.addEventListener('navigateToContent', handleNavToContent);

    return () => {
        window.removeEventListener('navigateToContent', handleNavToContent);
    };
  }, []); 
  // ======================== END: CONTENT NOTIFICATION HANDLER ========================

	useEffect(() => {
        const requestHandler = () => {
            // THE DEFINITIVE FIX: When a component requests the state, dispatch ONLY the ID
            // from the activeCompetition object, or null if it doesn't exist.
            // This makes it consistent with the main data listener.
            const competitionId = activeCompetition ? activeCompetition.id : null;
            window.dispatchEvent(new CustomEvent('competitionUpdated', { detail: competitionId }));
        };
        window.addEventListener('requestCompetitionState', requestHandler);
        return () => {
            window.removeEventListener('requestCompetitionState', requestHandler);
        };
    }, [activeCompetition]); // Dependency array ensures it always sends the latest data

  useEffect(() => {
    const openModalHandler = (event) => {
        setContentToReport(event.detail);
        setShowReportModal(true);
    };
    window.addEventListener('openReportModal', openModalHandler);
    return () => window.removeEventListener('openReportModal', openModalHandler);
  }, []);

    useEffect(() => {
        const initializeMessaging = async () => {
          if ('serviceWorker' in navigator) {
            try {
              const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
              const messagingService = getMessaging(app, { serviceWorkerRegistration: registration });
              setMessagingInstance(messagingService);
              console.log('Firebase Messaging service initialized successfully.');
            } catch (error) {
              console.error('Service Worker registration or Messaging init failed:', error);
            }
          }
        };
        initializeMessaging();
    }, []); // Empty dependency array ensures this runs only once.

    useEffect(() => {
    const openModalHandler = (event) => {
        setContentForLikes(event.detail.contentItem);
        setShowLikesModal(true);
    };
    window.addEventListener('openLikesModal', openModalHandler);
    return () => {
        window.removeEventListener('openLikesModal', openModalHandler);
    };
  }, []);

  useEffect(() => {
    const navigateHandler = (event) => {
        const { userId } = event.detail;
        // This function will close ALL modals and then navigate.
        setShowVideoModal(false);
        setShowLikesModal(false); 
        setShowCommentsModal(false);
        setSelectedUserId(userId);
        // THE FIX: Use our smart navigation function to preserve history
        handleNavigate('UserProfile');
    };
    window.addEventListener('navigateToUserProfile', navigateHandler);
    return () => {
        window.removeEventListener('navigateToUserProfile', navigateHandler);
    };
  }, [activeScreen]);

    useEffect(() => {
    const openCommentsHandler = (event) => {
        setItemForComments(event.detail.item);
        setItemTypeForComments(event.detail.itemType);
        setShowCommentsModal(true);
    };
    window.addEventListener('openCommentsModal', openCommentsHandler);
    return () => {
        window.removeEventListener('openCommentsModal', openCommentsHandler);
    };
  }, []);

  // --- GLOBAL NAVIGATION HANDLER FOR GIFTING FROM ANY SCREEN ---
  useEffect(() => {
    const handleNavigateAndGift = (event) => {
        const recipientProfile = event.detail;
        if (recipientProfile && recipientProfile.id) {
            // THE MASTER FIX: Sync previousScreen and history stack to prevent Dashboard background-loading
            isProgrammaticPopRef.current = true;
            
            setShowVideoModal(false);
            setShowLikesModal(false); 
            setShowCommentsModal(false);

            setSelectedUserId(recipientProfile.id);
            setShouldOpenGiftModalOnLoad(true); 

            // Hard-set the history state and React state synchronously
            window.history.replaceState({ screen: 'UserProfile' }, '');
            setPreviousScreen('Discover'); 
            setActiveScreen('UserProfile');
        }
    };
    window.addEventListener('navigateToProfileAndGift', handleNavigateAndGift);
    return () => {
        window.removeEventListener('navigateToProfileAndGift', handleNavigateAndGift);
    };
  }, [handleNavigate]); // Dependency ensures the latest navigation function is used

  // --- GLOBAL CREATOR GIFT EVENT BUS LISTENER ---
  useEffect(() => {
    const openGiftHandler = (event) => {
        setGiftingRecipient(event.detail);
        setShowGiftingModal(true);
    };
    window.addEventListener('openGiftModal', openGiftHandler);
    return () => {
        window.removeEventListener('openGiftModal', openGiftHandler);
    };
  }, []);

        useEffect(() => {
    const openContentPlayerHandler = (event) => {
        setContentPlayerData(event.detail);
    };
    window.addEventListener('openContentPlayer', openContentPlayerHandler);
    return () => {
        window.removeEventListener('openContentPlayer', openContentPlayerHandler);
    };
}, []);

      // --- VIDEO MODAL BACK BUTTON HANDLING ---
    useEffect(() => {
        const handleModalCloseOnBack = (event) => {
            if (!event.state || event.state.modal !== 'video') {
                setShowVideoModal(false);
            }
        };

        if (showVideoModal) {
            window.history.pushState({ modal: 'video' }, '');
            window.addEventListener('popstate', handleModalCloseOnBack);
        }

        return () => {
            window.removeEventListener('popstate', handleModalCloseOnBack);
            // THE FIX: Added check for !shouldOpenGiftModalOnLoad to prevent the back-pop collision
            if (showVideoModal && window.history.state?.modal === 'video' && !shouldOpenGiftModalOnLoad) {
                isProgrammaticPopRef.current = true;
                window.history.back();
            }
        };
    }, [showVideoModal, shouldOpenGiftModalOnLoad]); // THE FIX: Added shouldOpenGiftModalOnLoad to dependencies  
       
        useEffect(() => {
        let unsubscribe = () => {};

        // THE DEFINITIVE FIX: Do not attach the listener until the initial auth check is complete.
        if (!authLoading) {
            const docRef = doc(db, "settings", "featuredContentSlots");
            unsubscribe = onSnapshot(docRef, (docSnap) => {
                if (docSnap.exists()) {
                    setFeaturedContentSlots(docSnap.data());
                } else {
                    console.warn("Featured content document not found!");
                    setFeaturedContentSlots({}); // Set to empty object to prevent errors
                }
            });
        }
        return () => unsubscribe(); // Cleanup listener on unmount
    }, [authLoading]);
    // --------------------------------------------------------------------------------

        useEffect(() => {
        let unsubscribe = () => {};

        // THE DEFINITIVE FIX: Do not attach the listener until the initial auth check is complete.
        if (!authLoading) {
            const compRef = collection(db, "competitions");
            const q = query(compRef, where("status", "in", ["Accepting Entries", "Live Voting", "Judging", "Results Visible"]), orderBy("createdAt", "desc"), limit(1));
            unsubscribe = onSnapshot(q, (snapshot) => {
                let competitionData = null;
                if (!snapshot.empty) {
                    competitionData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
                }
                // Set the state for components that still use the prop
                setActiveCompetition(competitionData);
                
                // THIS IS THE FIX: Broadcast ONLY the ID (or null if no competition exists).
                // This forces the banner to fetch its own, fresh data.
                window.dispatchEvent(new CustomEvent('competitionUpdated', { detail: competitionData ? competitionData.id : null }));
            });
        }
        return () => unsubscribe();
    }, [authLoading]);

        useEffect(() => {
        let unsubscribeSettings = () => {};
        let unsubscribeMasterEvent = () => {};

        if (!authLoading) {
            const liveEventDocRef = doc(db, "settings", "liveEvent");
            
            unsubscribeSettings = onSnapshot(liveEventDocRef, (docSnap) => {
                // Instantly clean up any previous master listener
                unsubscribeMasterEvent();

                if (docSnap.exists() && docSnap.data().eventId && docSnap.data().status !== 'no_event_scheduled') {
                    const eventId = docSnap.data().eventId;
                    
                    // Listen to the master document in the 'events' collection for live status changes (e.g. 'completed')
                    unsubscribeMasterEvent = onSnapshot(doc(db, "events", eventId), (masterSnap) => {
                        if (masterSnap.exists()) {
                            const eventData = { id: masterSnap.id, ...masterSnap.data() };
                            setLiveEvent(eventData);
                            window.dispatchEvent(new CustomEvent('liveEventUpdated', { detail: eventData }));
                        } else {
                            setLiveEvent(null);
                            window.dispatchEvent(new CustomEvent('liveEventUpdated', { detail: null }));
                        }
                    });
                } else {
                    setLiveEvent(null);
                    window.dispatchEvent(new CustomEvent('liveEventUpdated', { detail: null }));
                }
            });
        }
        
        return () => {
            unsubscribeSettings();
            unsubscribeMasterEvent();
        };
    }, [authLoading]);

         // ================= START: THE DEFINITIVE LIVE EVENT SYNC FIX =================
    useEffect(() => {
        let timer;
        
        if (!liveEvent || !liveEvent.scheduledStartTime || liveEvent.status === 'completed' || liveEvent.status === 'no_event_scheduled') {
            setIsLive(false);
            setCountdownText('');
            return;
        }

        if (liveEvent.status === 'live') {
            setIsLive(true);
            setCountdownText('LIVE NOW');
            return;
        }

    const startSynchronizedCountdown = async () => {
        try {
            // Get the server's time once to calculate the offset.
            const getServerTime = httpsCallable(functions, 'getServerTime');
            const result = await getServerTime();
            const serverNow = new Date(result.data.serverTime).getTime();
            const clientNow = new Date().getTime();
            const timeOffset = serverNow - clientNow;

            // Start the single, authoritative timer.
            timer = setInterval(() => {
                const now = new Date().getTime() + timeOffset; // Apply offset for a synchronized "now"
                const startTime = liveEvent.scheduledStartTime.toDate().getTime();
                const distance = startTime - now;

                if (distance < 0) {
                    setIsLive(true);
                    setCountdownText('LIVE NOW');
                    clearInterval(timer); // Stop the timer once the event is live.
                } else {
                    setIsLive(false);
                    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
                    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
                    const seconds = Math.floor((distance % (1000 * 60)) / 1000);
                    setCountdownText(`${days}d ${hours}h ${minutes}m ${seconds}s`);
                }
            }, 1000);

        } catch (error) {
            console.error("Failed to synchronize with server time:", error);
            setCountdownText('Error syncing clock...');
        }
    };

    startSynchronizedCountdown();

    // Cleanup function to clear the interval when the component unmounts or the event changes.
    return () => {
        if (timer) {
            clearInterval(timer);
        }
    };
}, [liveEvent]); // This entire effect is driven by the liveEvent object.
// ================== END: THE DEFINITIVE LIVE EVENT SYNC FIX ==================

        // --- NATIVE BACK BUTTON LOGIC ---
  useEffect(() => {
    const handleBackButton = (event) => {
      // Bypasses global screen navigation if we are closing a modal
      if (isProgrammaticPopRef.current) {
        isProgrammaticPopRef.current = false;
        return;
      }
      if (showVideoModal) {
        return;
      }

      // If we have a screen history, navigate back within the app
      if (previousScreen) {
        setActiveScreen(previousScreen);
        // This is a crucial step: we are now managing history ourselves,
        // so we must also manage what the "previous" screen is after going back.
        // For simplicity in this architecture, we can set it to a sensible default like 'Home'.
        // A more advanced implementation might use a history stack array.
        setPreviousScreen('Home'); 
      } else {
        // If there's no previous screen, we are likely at the initial Home screen
        if (!message) {
          showMessage('Press back again to exit');
          // Prevent the app from closing by pushing the current state back into history
          window.history.pushState({ screen: 'Home' }, '');
        } else {
          // If the message is showing, allow the default back action to exit the app
          isProgrammaticPopRef.current = true;
          window.history.back();
        }
      }
    };
    
    // Listen for the popstate event, which fires on browser back button clicks
    window.addEventListener('popstate', handleBackButton);

    return () => {
      window.removeEventListener('popstate', handleBackButton);
    };
  }, [activeScreen, previousScreen, message, showMessage, showVideoModal]);
        
            // --- Audio Priming for Browser Autoplay Policy ---
    useEffect(() => {
        const primeAudio = () => {
            // This function will be triggered by the first user click anywhere on the page.
            if (!isAudioPrimed) {
                const audio = notificationSoundRef.current;
                if (audio) {
                    // We play and immediately pause. This is enough to get browser permission.
                    // The promise might be rejected if the user hasn't interacted, but that's okay.
                    audio.play().catch(() => {});
                    audio.pause();
                }
                setIsAudioPrimed(true); // Mark as primed so this only runs once.
                window.removeEventListener('mousedown', primeAudio); // Clean up the listener.
            }
        };
        // Add the listener.
        window.addEventListener('mousedown', primeAudio);
        // Cleanup in case the component unmounts before any interaction.
        return () => {
            window.removeEventListener('mousedown', primeAudio);
        };
    }, [isAudioPrimed]); // Dependency ensures the effect doesn't re-run unnecessarily.

        // --- PWA Installation Logic ---
    useEffect(() => {
        // First, check if the app is already running in standalone (installed) mode
        if (window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone) {
            setIsStandalone(true);
            return; // Don't set up listeners if already installed.
        }

        // Listen for the browser's install prompt event (for Android/Desktop)
        const handleBeforeInstallPrompt = (event) => {
            event.preventDefault(); // Prevent the default browser prompt
            setInstallPromptEvent(event); // Save the event so our button can trigger it
        };
        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        // Listen for when the app has been successfully installed
        const handleAppInstalled = () => {
            setIsStandalone(true); // This will cause the install button to disappear
            setInstallPromptEvent(null); // Clear the saved event
        };
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []); // This effect should only run once on mount.

         // --- GUARANTEED NAVIGATION FOR PLEDGE FLOW ---
  useEffect(() => {
    if (pledgeContext && pledgeContext.type === 'eventTicket') {
        // Only routing event tickets now, legacy premium removed.
        // Update to point to correct pledge component if needed in future
    }
  }, [pledgeContext]);

        // New Code to Add
  // --- Notification Toast System Logic ---
useEffect(() => {
      // Manage Memory Leak: Clean up processed IDs that no longer exist in notifications
      if (processedToastIds.current.size > 100) {
          const activeIds = new Set(notifications.map(n => n.id));
          for (const id of processedToastIds.current) {
              if (!activeIds.has(id)) processedToastIds.current.delete(id);
          }
      }

      // Step 1: Add new, unseen notifications to the queue.
      const newNotifications = notifications.filter(n => !processedToastIds.current.has(n.id));
      if (newNotifications.length > 0) {
          setToastQueue(prevQueue => [...prevQueue, ...newNotifications]);
          newNotifications.forEach(n => processedToastIds.current.add(n.id));
      }

      // Step 2: If there's no active toast, process the next item from the queue.
      if (!currentToast && toastQueue.length > 0) {
          const nextToast = toastQueue[0];

          // --- START: DEFINITIVE CHAT TOAST SUPPRESSION FIX ---
          // Check if the incoming notification is for a chat message.
          const isChatMessage = nextToast.link && nextToast.link.startsWith('/chat');
          
          // Check if the user is currently on a screen where the toast would be redundant.
          const isUserInChatContext = activeScreen === 'ChatList' || activeScreen === 'ChatMessageScreen';

          // If both are true, suppress the toast and move to the next item in the queue.
          if (isChatMessage && isUserInChatContext) {
              // We still need to mark it as "seen" to prevent it from showing up later.
              markToastAsSeen(nextToast.id);
              // And we must remove it from the queue.
              setToastQueue(prev => prev.slice(1));
              // Exit this effect run, preventing the toast from being set.
              return; 
          }
          // --- END: DEFINITIVE CHAT TOAST SUPPRESSION FIX ---

          setCurrentToast(nextToast);
          
          const mutedPrivateTypes = ['NEW_COMMENT'];
          const mutedBroadcastTypes = ['DONATION', 'EVENT_LIVE'];

          let shouldPlaySound = true;
          if (nextToast.isBroadcast) {
              if (mutedBroadcastTypes.includes(nextToast.broadcastType)) {
                  shouldPlaySound = false;
              }
          } else {
              if (mutedPrivateTypes.includes(nextToast.type)) {
                  shouldPlaySound = false;
              }
          }

          if (shouldPlaySound) {
              notificationSoundRef.current?.play().catch(e => console.error("Audio play failed:", e));
          }

          markToastAsSeen(nextToast.id);
      }
  // The stable dependencies that correctly drive the toast logic
  }, [notifications, currentToast, toastQueue, markToastAsSeen, activeScreen]); // <-- 'activeScreen' is added as a dependency

   const renderScreen = () => {
    
    // --- THE DEFINITIVE VERIFICATION GATEKEEPER ---
    // This check runs on EVERY re-render, before anything else.
    // If a user is logged in but their email is not verified...
    if (currentUser && !currentUser.emailVerified) {
      // ...force the VerifyEmailScreen to be displayed, ignoring the activeScreen state.
      return <VerifyEmailScreen currentUser={currentUser} showMessage={showMessage} setActiveScreen={handleNavigate} handleLogout={handleLogout} />;
    }
    
    if (activeScreen === 'Banned') return <BannedScreen setActiveScreen={handleNavigate} />;
    if (activeScreen === 'Suspended') return <SuspendedScreen showMessage={showMessage} setActiveScreen={handleNavigate} suspensionDetails={suspensionDetails} />;
    
     switch (activeScreen) {
      case 'CenterStage':
        return <CenterStageScreen 
            setActiveScreen={handleNavigate} 
            currentUser={currentUser} 
            showMessage={showMessage} 
            targetContestantId={centerStageTargetId} 
            handleVideoPress={handleVideoPress} 
        />;
      case 'About': return <AboutScreen setActiveScreen={handleNavigate} />;
      case 'BlockedList': return <BlockedListScreen currentUser={currentUser} setActiveScreen={handleNavigate} showMessage={showMessage} />;
      case 'Login': return <LoginScreen setActiveScreen={handleNavigate} showMessage={showMessage} />;
      case 'SignUp': return <SignUpScreen showMessage={showMessage} setActiveScreen={handleNavigate} />;
      case 'VerifyEmail': return <VerifyEmailScreen currentUser={currentUser} showMessage={showMessage} setActiveScreen={handleNavigate} handleLogout={handleLogout} />;
      case 'ForgotPassword': return <ForgotPasswordScreen showMessage={showMessage} setActiveScreen={handleNavigate} actionCode={actionCode} />;
      case 'EnrollmentPayment': return <EnrollmentPaymentScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} pledgeContext={pledgeContext} />;
      case 'FilmArena': return <FilmArenaScreen setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} showMessage={showMessage} setPledgeContext={setPledgeContext} />;
      case 'PendingConfirmation': return <PendingConfirmationScreen showMessage={showMessage} setActiveScreen={handleNavigate} pledgeIdForConfirmation={pledgeIdForConfirmation} currencyRates={currencyRates} selectedCurrency={selectedCurrency} />;
      case 'EnrollmentHub': return <EnrollmentHubScreen setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} showMessage={showMessage} />;
      case 'CreatorConnect': return <CreatorConnectScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} setSelectedOpportunity={setSelectedOpportunity} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} />;
      case 'OpportunityDetails': return <OpportunityDetailsScreen showMessage={showMessage} setActiveScreen={handleNavigate} selectedOpportunity={selectedOpportunity} currentUser={currentUser} creatorProfile={creatorProfile} />;
      case 'PostOpportunityForm': return <PostOpportunityForm showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} />;
      case 'MyListings': return <MyListingsScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} />;
      case 'SavedOpportunities': return <SavedOpportunitiesScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} setSelectedOpportunity={setSelectedOpportunity} />;
      case 'UserProfile': return <UserProfileScreen selectedUserId={selectedUserId} setActiveScreen={handleNavigate} setSelectedChatId={setSelectedChatId} showMessage={showMessage} currentUser={currentUser} creatorProfile={creatorProfile} setOnConfirmationAction={setOnConfirmationAction} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} handleVideoPress={handleVideoPress} previousScreen={previousScreen} shouldOpenGiftModalOnLoad={shouldOpenGiftModalOnLoad} setShouldOpenGiftModalOnLoad={setShouldOpenGiftModalOnLoad} />;
      case 'MyFollows': return <MyFollowsScreen currentUser={currentUser} setActiveScreen={handleNavigate} setSelectedUserId={setSelectedUserId} showMessage={showMessage} />;
      case 'Followers': return <FollowersScreen currentUser={currentUser} setActiveScreen={handleNavigate} setSelectedUserId={setSelectedUserId} showMessage={showMessage} />;
      case 'MyContentLibrary': return <MyContentLibraryScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} setCreatorProfile={setCreatorProfile} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} handleVideoPress={handleVideoPress} />;
      case 'PayoutRequestForm': return <PayoutRequestForm showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} />; // THE FIX: Added route
      case 'CreatorDashboard': return <CreatorDashboardScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} setCreatorProfile={setCreatorProfile} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} liveEvent={liveEvent} currencyRates={currencyRates} selectedCurrency={selectedCurrency} handleVideoPress={handleVideoPress} />;
case 'AdminDashboard': return <AdminDashboardScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} selectedAdminSubScreen={selectedAdminSubScreen} setSelectedAdminSubScreen={setSelectedAdminSubScreen} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} setSelectedUserId={setSelectedUserId} setSelectedOpportunity={setSelectedOpportunity} setSelectedCompAdmin={setSelectedCompAdmin} setSelectedReportGroup={setSelectedReportGroup} featuredContentSlots={featuredContentSlots} currencyRates={currencyRates} selectedCurrency={selectedCurrency} handleVideoPress={handleVideoPress} />;
      case 'MyFeed': return <FollowingFeedScreen currentUser={currentUser} setActiveScreen={handleNavigate} handleVideoPress={handleVideoPress} showMessage={showMessage} />;
      case 'AdminEventManager': return <AdminEventManagerScreen showMessage={showMessage} setActiveScreen={handleNavigate} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} />;
      case 'AdminOpportunityDetails': return <AdminOpportunityDetailsScreen showMessage={showMessage} setActiveScreen={handleNavigate} selectedOpportunity={selectedOpportunity} />;
      case 'AdminReportReview': return <AdminReportReviewScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} selectedReportGroup={selectedReportGroup} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} />;
      // THE FIX: Pass full competition context and a handle for the "Vote" action to ensure seamless real-time syncing
      case 'CompetitionScreen': 
        return (
          <CompetitionScreen 
            showMessage={showMessage} 
            setActiveScreen={handleNavigate} 
            currentUser={currentUser} 
            creatorProfile={creatorProfile} 
            activeCompetition={activeCompetition}
            handleVideoPress={handleVideoPress} // Professional apps allow video review during voting
            setSelectedUserId={setSelectedUserId} // Allows visiting participant profiles
          />
        );
      case 'Discover': return <DiscoverScreen showMessage={showMessage} currentUser={currentUser} creatorProfile={creatorProfile} setActiveScreen={handleNavigate} handleVideoPress={handleVideoPress} liveEvent={liveEvent} setPledgeContext={setPledgeContext} isLive={isLive} countdownText={countdownText} deepLinkedReplayId={deepLinkedReplayId} setSelectedOpportunity={setSelectedOpportunity} />;
      case 'DiscoverUsers': return <DiscoverUsersScreen showMessage={showMessage} setActiveScreen={handleNavigate} setSelectedUserId={setSelectedUserId} currentUser={currentUser} creatorProfile={creatorProfile} />;
      case 'AnalyticsDashboard': return <AnalyticsDashboardScreen showMessage={showMessage} setActiveScreen={handleNavigate} />;
      case 'Contact': return <ContactScreen setActiveScreen={handleNavigate} showMessage={showMessage} currentUser={currentUser} />;
      case 'MusicCharts': return <MusicChartsScreen setActiveScreen={handleNavigate} currentUser={currentUser} handleVideoPress={handleVideoPress} showMessage={showMessage} />;
      case 'RoastRoom': return <RoastRoomScreen setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} showMessage={showMessage} />;
      case 'LiveDirectory': return <LiveDirectoryScreen setActiveScreen={handleNavigate} currentUser={currentUser} showMessage={showMessage} />;
      case 'FilmClubHub': return <FilmClubHubScreen setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} showMessage={showMessage} />;

      case 'NotificationInbox': return <NotificationInboxScreen setActiveScreen={handleNavigate} currentUser={currentUser} dismissNotification={dismissNotification} markNotificationAsRead={markNotificationAsRead} markAllAsRead={markAllAsRead} />;
      case 'ChatList': return <ChatListScreen currentUser={currentUser} setActiveScreen={handleNavigate} setSelectedChatId={setSelectedChatId} showMessage={showMessage} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} />;
      case 'ChatMessageScreen': return <ChatMessageScreen chatId={selectedChatId} currentUser={currentUser} creatorProfile={creatorProfile} setActiveScreen={handleNavigate} showMessage={showMessage} setSelectedUserId={setSelectedUserId} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} />;
      case 'PrivacyPolicy': return <PrivacyPolicyScreen setActiveScreen={handleNavigate} />;
      case 'TermsOfService': return <TermsOfServiceScreen setActiveScreen={handleNavigate} />;
      case 'Home': default: return <HomeScreen currentUser={currentUser} creatorProfile={creatorProfile} showMessage={showMessage} handleVideoPress={handleVideoPress} handleLogout={handleLogout} setActiveScreen={handleNavigate} featuredContentSlots={featuredContentSlots} activeCompetition={activeCompetition} />;
    }
  };

  // --- NVA PARENT SHIELD: Isolates the screen from global state updates ---
  const memoizedScreen = useMemo(() => renderScreen(), [
    activeScreen, 
    currentUser?.uid, 
    creatorProfile?.role, 
    JSON.stringify(creatorProfile?.purchasedTickets || {}),
    selectedUserId, 
    selectedOpportunity?.id, 
    liveEvent?.id, 
    isLive,
    countdownText,
    deepLinkedReplayId,
    pledgeContext,
    selectedChatId,
    selectedAdminSubScreen // THE FIX: Restores functionality to Admin Dashboard tabs
  ]);

return (
    <>
      {/* --- THIS IS THE FINAL FIX: --- */}
      {/* Step 1: Show the video ONLY on the very first load. */}
      {isInitialLoad ? (
        <div 
          style={{ 
            position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', 
            backgroundColor: '#0A0A0A', zIndex: 9999, display: 'flex', 
            alignItems: 'center', justifyContent: 'center' 
          }}
        >
          <video 
            src="/loading-video.mp4" 
            autoPlay 
            muted 
            playsInline
            onEnded={() => setIsInitialLoad(false)}
            onError={() => setIsInitialLoad(false)} 
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        </div>
      ) : (
        <>
          {/* Step 2: Once the video is done, show the rest of the app. */}
          <Header 
            setActiveScreen={handleNavigate}
            currencyRates={currencyRates}
            selectedCurrency={selectedCurrency}
            onCurrencyChange={setSelectedCurrency}
            isLive={isLive}
            countdownText={countdownText}
            // --- PWA Install Button Props ---
            onInstallClick={handleInstallClick}
            showInstallButton={!isStandalone}
            // --- PWA UPDATE PROPS ---
            needRefresh={needRefresh}
            onUpdate={handleUpdate}
            currentUser={currentUser} // <-- ADD THIS LINE
            onLogout={handleLogout}   // <-- ADD THIS LINE
          />

          {/* ====== STANDALONE GLASSMORPHIC HEADER BILLBOARD AD (Home Screen & Expiration Checked) ====== */}
          {activeScreen === 'Home' && headerAd && headerAd.imageUrl && (!headerAd.expiresAt || new Date() < new Date(headerAd.expiresAt)) && (
            <div style={{ display: 'flex', justifyContent: 'center', width: '100%', padding: '0 15px', boxSizing: 'border-box', marginTop: '12px' }}>
              <div 
                onClick={() => headerAd.destinationUrl && window.open(headerAd.destinationUrl, '_blank')}
                style={{
                  width: '100%', maxWidth: '520px', height: '74px',
                  borderRadius: '14px', overflow: 'hidden',
                  display: 'flex', alignItems: 'center', background: 'rgba(255, 255, 255, 0.03)',
                  backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.25), inset 0 1px 1px rgba(255,255,255,0.05)', 
                  cursor: headerAd.destinationUrl ? 'pointer' : 'default',
                  transition: 'all 0.2s ease-in-out', padding: '8px', boxSizing: 'border-box'
                }}
                onMouseEnter={(e) => {
                  if (headerAd.destinationUrl) {
                    e.currentTarget.style.transform = 'scale(1.02)';
                    e.currentTarget.style.borderColor = 'rgba(0, 255, 255, 0.35)';
                    e.currentTarget.style.boxShadow = '0 0 20px rgba(0, 255, 255, 0.2)';
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1.0)';
                  e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <img src={headerAd.imageUrl} alt={headerAd.title} style={{ width: '58px', height: '58px', borderRadius: '10px', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
                <div style={{ marginLeft: '14px', display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0, textAlign: 'left' }}>
                  <span style={{ fontSize: '9px', color: '#00FFFF', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '0.07em' }}>★ Sponsored</span>
                  <p style={{ margin: '2px 0 0', fontSize: '14px', color: '#FFF', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.2' }}>{headerAd.title}</p>
                  <p style={{ margin: 0, fontSize: '11px', color: '#BBB', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: '1.2' }}>{headerAd.description}</p>
                </div>
              </div>
            </div>
          )}

          <div className="container" style={{ paddingBottom: '100px' }}>
            {/* Step 3: Use the original authLoading for the quick, text-based loader during navigation. */}
            {authLoading ? (
                <div className="screenContainer" style={{textAlign: 'center', paddingTop: '50px'}}>
                  <p className="heading">Loading...</p>
                </div>
            ) : (
                <Suspense fallback={<div className="screenContainer" style={{textAlign: 'center', paddingTop: '50px'}}><p className="heading">Loading...</p></div>}>
                  {memoizedScreen}
                </Suspense>
            )}
          </div>
          {!['Suspended', 'Banned', 'SignUp', 'ChatMessageScreen', 'RoastRoom', 'LiveDirectory', 'FilmClubHub'].includes(activeScreen) && (
            <NavigationBar
              activeScreen={activeScreen}
              setActiveScreen={handleNavigate}
              currentUser={currentUser}
              creatorProfile={creatorProfile}
              hasNewFollowerContent={hasNewFollowerContent}
              unreadCount={notificationBadgeCount}
              unreadChatCount={unreadChatCount}
            />
          )}

          {/* All modals and toasts remain here */}
          {currentToast && (
              <NotificationToast
                  key={currentToast.id}
                  notification={currentToast}
                  onClose={handleToastClose}
                  setActiveScreen={handleNavigate}
              />
          )}
          <audio ref={notificationSoundRef} src={notificationSound} preload="auto" />

          {message && (
            /* THE FIX: Forced zIndex 20000 ensures messages float ABOVE the Tournament Modal (10000) */
            <div className="messageBox" style={{ zIndex: 20000 }}>
              <p className="messageText" style={{ color: '#FFF', fontWeight: 'bold' }}>{message}</p>
            </div>
          )}

          {showConfirmationModal && (
            <ConfirmationModal
                title={confirmationTitle}
                message={confirmationMessage}
                onConfirm={onConfirmationAction}
                onCancel={() => setShowConfirmationModal(false)}
            />
          )}

          {showReportModal && (
              <ReportContentModal
                  showMessage={showMessage}
                  onCancel={() => setShowReportModal(false)}
                  contentToReport={contentToReport}
                  currentUser={currentUser}
              />
          )}

            {showContentAppealModal && (
              <ContentAppealModal
                  notification={notificationToAppeal}
                  showMessage={showMessage}
                  onClose={() => setShowContentAppealModal(false)}
              />
          )}
          
          {showVideoModal && (
              <VideoPlayerModal
                  videoUrl={currentVideoUrl}
                  onClose={() => {
                      isProgrammaticPopRef.current = true; // Prevents popstate router leakage
                      setShowVideoModal(false);
                      setOpenCommentsOnLoad(false); // <-- Reset the flag when the modal is closed
                  }}
                  contentItem={currentContentItem}
                  currentUser={currentUser}
                  viewerProfile={creatorProfile}
                  showMessage={showMessage}
                  openCommentsProp={openCommentsOnLoad} // <-- Pass the flag as a prop
              />
          )}

            {showCommentsModal && itemForComments && (
              <CommentsModal
                  item={itemForComments}
                  itemType={itemTypeForComments}
                  currentUser={currentUser}
                  creatorProfile={creatorProfile}
                  showMessage={showMessage}
                  onClose={() => setShowCommentsModal(false)}
              />
          )}
            {showLikesModal && contentForLikes && (
          <LikesModal
              contentItem={contentForLikes}
              onClose={() => setShowLikesModal(false)}
          />
      )}
      
        {contentPlayerData && (
        <ContentPlayerModal
            mediaUrl={contentPlayerData.imageUrl}
            description={contentPlayerData.description}
            // We can add these other props later
            uploaderInfo={null} 
            stats={null}
            onClose={() => setContentPlayerData(null)}
        />
    )}
      
      {/* --- iOS PWA FIX: The new, styled install prompt for iPhones/iPads --- */}
      {showIosInstallPrompt && (
        <IosInstallPrompt onClose={() => setShowIosInstallPrompt(false)} />
      )}
      {/* --- END OF FIX --- */}
      </>
      )}
    </>
  );
}

export default App;