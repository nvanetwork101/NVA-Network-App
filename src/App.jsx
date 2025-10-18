// src/App.jsx

import PromotedStatusScreen from './components/PromotedStatusScreen';
import BookStatusScreen from './components/BookStatusScreen';

import NotificationInboxScreen from './components/NotificationInboxScreen';
import notificationSound from './Notification 2.mp3';

import PostSubmissionUpsellScreen from './components/PostSubmissionUpsellScreen';
import MyFollowsScreen from './components/MyFollowsScreen';
import FollowersScreen from './components/FollowersScreen';

import { useState, useEffect, useCallback } from 'react';
import PremiumPerksScreen from './components/PremiumPerksScreen';
import FollowingFeedScreen from './components/FollowingFeedScreen';

import SubscriptionPledgeScreen from './components/SubscriptionPledgeScreen';
import { doc, getDoc, onSnapshot, collection, query, where, orderBy, limit, updateDoc } from "firebase/firestore"; // CORRECT: getDoc and updateDoc are imported
import BlockedListScreen from './components/BlockedListScreen';
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from './firebase.js';
import { httpsCallable } from 'firebase/functions';
import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { messaging } from './firebase.js';
import { functions } from './firebase.js'; // This line is also needed

// Import all your components
import Header from './components/Header';
import NavigationBar from './components/NavigationBar';

// Core Screens
import HomeScreen from './components/HomeScreen';
import AboutScreen from './components/AboutScreen';
import NvaNetworkChartsScreen from './components/NvaNetworkChartsScreen';
import ContactScreen from './components/ContactScreen';
import CompetitionScreen from './components/CompetitionScreen';

import PrivacyPolicyScreen from './components/PrivacyPolicyScreen';
import TermsOfServiceScreen from './components/TermsOfServiceScreen';

import DiscoverScreen from './components/DiscoverScreen';
import DiscoverUsersScreen from './components/DiscoverUsersScreen';

// Auth Flow
import LoginScreen from './components/LoginScreen';
import CreatorSignUpScreen from './components/CreatorSignUpScreen';
import UserSignUpScreen from './components/UserSignUpScreen';
import VerifyEmailScreen from './components/VerifyEmailScreen';
import ForgotPasswordScreen from './components/ForgotPasswordScreen';
import SuspendedScreen from './components/SuspendedScreen';
import BannedScreen from './components/BannedScreen';

// Crowdfunding Flow
import CreateCampaignScreen from './components/CreateCampaignScreen';
import AllCampaignsScreen from './components/AllCampaignsScreen';
import CampaignDetailsScreen from './components/CampaignDetailsScreen';
import DonationPledgeScreen from './components/DonationPledgeScreen';
import PendingConfirmationScreen from './components/PendingConfirmationScreen';

// Support & Perks Flow
import SupportUsScreen from './components/SupportUsScreen';
import AdvertiserPerksScreen from './components/AdvertiserPerksScreen';

// Creator Connect Flow
import CreatorConnectScreen from './components/CreatorConnectScreen';
import OpportunityDetailsScreen from './components/OpportunityDetailsScreen';
import PostOpportunityForm from './components/PostOpportunityForm';
import MyListingsScreen from './components/MyListingsScreen';
import SavedOpportunitiesScreen from './components/SavedOpportunitiesScreen';
import AdminOpportunityDetailsScreen from './components/AdminOpportunityDetailsScreen';

// User & Creator Screens
import ProfilePictureModal from './components/ProfilePictureModal';
import UserProfileScreen from './components/UserProfileScreen';
import CreatorDashboardScreen from './components/CreatorDashboardScreen';
import MyContentLibraryScreen from './components/MyContentLibraryScreen';
import VideoPlayerModal from './components/VideoPlayerModal';

// Admin Screens & Modals
import AdminDashboardScreen from './components/AdminDashboardScreen';
import AdminReportReviewScreen from './components/AdminReportReviewScreen';
import AdminContentManagerScreen from './components/AdminContentManagerScreen';
import AdminCurationModal from './components/AdminCurationModal';
import AdminCompetitionManager from './components/AdminCompetitionManager';
import AdminCampaignDetailsScreen from './components/AdminCampaignDetailsScreen';
import AdminEventManagerScreen from './components/AdminEventManagerScreen';
import AdminSiteManagerScreen from './components/AdminSiteManagerScreen';
import AnalyticsDashboardScreen from './components/AnalyticsDashboardScreen';
import AdminStatusReviewScreen from './components/AdminStatusReviewScreen';

import AdminModerationCenter from './components/AdminModerationCenter';
import AdminModerationQueue from './components/AdminModerationQueue';
import AdminAppealsQueue from './components/AdminAppealsQueue';
import SuspensionModal from './components/SuspensionModal';
import ConfirmationModal from './components/ConfirmationModal';
import ReportContentModal from './components/ReportContentModal';
import CommentsModal from './components/CommentsModal';
import ContentAppealModal from './components/ContentAppealModal';
import LikesModal from './components/LikesModal';

import ImageViewerModal from './components/ImageViewerModal';

import IosInstallPrompt from './components/IosInstallPrompt'; // <-- ADD THIS LINE

import { useNotifications } from './hooks/useNotifications';
import NotificationToast from './components/NotificationToast';
import { useRef } from 'react';

function App() {
  // --- STATE MANAGEMENT ---
  const routingDoneRef = useRef(false);
  
  const [currentUser, setCurrentUser] = useState(null);
  const [creatorProfile, setCreatorProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [unverifiedUser, setUnverifiedUser] = useState(null); // <-- NEW STATE for the "limbo" user
  const [isInitialLoad, setIsInitialLoad] = useState(true); // <-- FIX: New state for one-time video
  const [installPromptEvent, setInstallPromptEvent] = useState(null); // <-- PWA FIX: Stores the install event

  const [isStandalone, setIsStandalone] = useState(false); // <-- PWA FIX: Checks if app is already installed
  const [activeScreen, setActiveScreen] = useState('Home');
  const [activeCompetition, setActiveCompetition] = useState(null);
  const [previousScreen, setPreviousScreen] = useState(null);
  const [message, setMessage] = useState('');
  const [showIosInstallPrompt, setShowIosInstallPrompt] = useState(false); // <-- iOS PWA FIX
  const [liveEvent, setLiveEvent] = useState(null);
  const [isLive, setIsLive] = useState(false);
  
  const [currencyRates, setCurrencyRates] = useState(null);
  const [selectedCurrency, setSelectedCurrency] = useState('USD');

  const [showVideoModal, setShowVideoModal] = useState(false);
  const [currentVideoUrl, setCurrentVideoUrl] = useState('');
  const [currentContentItem, setCurrentContentItem] = useState(null);
  const [countdownText, setCountdownText] = useState('');
  const [liveThumbnail, setLiveThumbnail] = useState('');

  // --- THIS IS THE FIX: State for the Top Creators feature ---
  const [featuredContentSlots, setFeaturedContentSlots] = useState(null);
  // -----------------------------------------------------------

  // State for navigating to specific content
  const [selectedCampaignId, setSelectedCampaignId] = useState(null);
  
  const [deepLinkedReplayId, setDeepLinkedReplayId] = useState(null); // <-- ADD THIS LINE
  
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedOpportunity, setSelectedOpportunity] = useState(null);
  
  // State for payment and confirmation flows
  const [pledgeContext, setPledgeContext] = useState(null);
  const [pledgeIdForConfirmation, setPledgeIdForConfirmation] = useState(null);

  // State for Admin Dashboard and Modals
  const [selectedAdminSubScreen, setSelectedAdminSubScreen] = useState('Overview');
  const [selectedAdminCampaignId, setSelectedAdminCampaignId] = useState(null);
  const [selectedStatus, setSelectedStatus] = useState(null);
  const [selectedCompAdmin, setSelectedCompAdmin] = useState(null);
  const [selectedReportGroup, setSelectedReportGroup] = useState(null);
  const [showConfirmationModal, setShowConfirmationModal] = useState(false);
  const [confirmationTitle, setConfirmationTitle] = useState('');
  const [confirmationMessage, setConfirmationMessage] = useState('');
  const [onConfirmationAction, setOnConfirmationAction] = useState(null);
  const [opportunityToPromote, setOpportunityToPromote] = useState(null);

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

   const [showImageViewerModal, setShowImageViewerModal] = useState(false);
  const [imageViewerData, setImageViewerData] = useState({ imageUrl: '', description: '' }); 

    const [hasNewFollowerContent, setHasNewFollowerContent] = useState(false);

    // --- Notification Toast System State ---
  const { notifications, markToastAsSeen, markNotificationAsRead } = useNotifications(currentUser);
  const [toastQueue, setToastQueue] = useState([]);
  const [currentToast, setCurrentToast] = useState(null);
  const processedToastIds = useRef(new Set()); // Use a ref to prevent re-renders
  const notificationSoundRef = useRef(null);
  const unreadCount = notifications.filter(n => !n.isBroadcast && !n.isRead).length;
  const [notificationBadgeCount, setNotificationBadgeCount] = useState(0);
       
    const markAllAsRead = () => {
    notifications.forEach(notification => {
      if (!notification.isBroadcast && !notification.isRead) {
        // We use the existing function from our hook to ensure consistency.
              
        markNotificationAsRead(notification.id);
      }
    });
  };

  const [isAudioPrimed, setIsAudioPrimed] = useState(false);

  const showMessage = (msg) => {
    
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

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

    useEffect(() => {
        // This now efficiently listens for the server-updated currency rates from Firestore.
        // This makes zero calls to the external currency API.
        let unsubscribe = () => {};

        // THE DEFINITIVE FIX: Do not attach the listener until the initial auth check is complete.
        if (!authLoading) {
            const ratesDocRef = doc(db, "settings", "currencyRates");
            unsubscribe = onSnapshot(ratesDocRef, (docSnap) => {
                if (docSnap.exists() && docSnap.data().rates) {
                    setCurrencyRates(docSnap.data().rates);
                } else {
                    console.warn("Currency rates document not found in Firestore!");
                }
            });
        }
        return () => unsubscribe(); // Cleanup listener on unmount
    }, [authLoading]); // Dependency on authLoading ensures this runs when the state is ready.

  // The new navigation handler that tracks screen history AND syncs with browser history
  const handleNavigate = useCallback((newScreen) => {
    if (newScreen !== activeScreen) {
      setPreviousScreen(activeScreen);
      // This is the fix: Push a new state to the browser's history stack
      // This makes the browser's back button aware of in-app navigation
      window.history.pushState({ screen: newScreen }, '');
    }
    setActiveScreen(newScreen);
  }, [activeScreen]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      // --- THE DEFINITIVE FIX ---
      // Force a full page reload. This action by the browser guarantees that all component
      // states, active listeners, and in-memory data are completely wiped out,
      // preventing any possibility of a race condition.
      window.location.href = '/';
    } catch (error) {
      console.error("Logout failed:", error);
      showMessage("An error occurred during logout.");
    }
  };

  const handleVideoPress = (url, item) => {
    // THE FIX: Remove the faulty currentUser check.
    // The VideoPlayerModal itself will handle what a non-logged-in user can or cannot do (e.g., comment).
    // This function's only job is to open the modal.
    setCurrentVideoUrl(url);
    setCurrentContentItem(item);
    setShowVideoModal(true);
  };

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

  // ========================== START: DEFINITIVE AUTH FLOW FIX ==========================
    // ========================== START: LOGOUT RACE CONDITION FIX ==========================
  useEffect(() => {
    // These 'unsubscribe' variables live in the useEffect's scope.
    // They will be assigned when a user logs in and called when that user logs out.
    let unsubProfile = () => {};
    let unsubFollowing = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      // --- THIS IS THE CORE FIX ---
      // The very first step on ANY auth change is to tear down all existing user-specific listeners.
      // This prevents race conditions on logout.
      unsubProfile();
      unsubFollowing();

      setAuthLoading(true);

      if (user && !user.emailVerified) {
        setCurrentUser(null);
        setCreatorProfile(null);
        setUnverifiedUser(user);
        setActiveScreen('VerifyEmail');
        setAuthLoading(false);
        setIsInitialLoad(false);
        return;
      }

      setUnverifiedUser(null);

      if (user) { // This is now a fully verified and logged-in user
        const userDocRef = doc(db, "creators", user.uid);
        try {
          const docSnap = await getDoc(userDocRef);

          if (docSnap.exists()) {
            const profileData = docSnap.data();

            if (profileData.banned) {
                showMessage("This account is permanently banned.");
                setActiveScreen('Banned');
                signOut(auth); // Use internal signOut, no need for handleLogout
                return;
            }

            if (profileData.suspendedUntil && profileData.suspendedUntil.toDate() > new Date()) {
                const expiryDate = profileData.suspendedUntil.toDate().toLocaleString();
                setCurrentUser(user);
                setCreatorProfile(profileData);
                setSuspensionDetails({ email: profileData.email, expiryDate });
                setActiveScreen('Suspended');
                return;
            }

            await updateDoc(userDocRef, { lastLoginTimestamp: new Date() });

            // --- Re-initialize all user-specific listeners here ---
            unsubProfile = onSnapshot(userDocRef, (snap) => {
    if (snap.exists()) {
        const profileData = snap.data();
        setCurrentUser(user); // Keep currentUser in sync
        setCreatorProfile(profileData);
        // THIS IS THE FIX: Get the count directly from the user's document
        setNotificationBadgeCount(profileData.unreadNotificationCount || 0);
    } else {
        // If the profile is deleted from under the user, log them out.
        signOut(auth);
    }
  });

            const followingRef = collection(db, "creators", user.uid, "following");
            const q = query(followingRef, where("hasNewContent", "==", true));
            unsubFollowing = onSnapshot(q, (snapshot) => {
                setHasNewFollowerContent(!snapshot.empty);
            });
            // --- End of listener initialization ---

            // This logic now checks if the URL path is empty. It will only perform its default
            // navigation if the user landed on the root domain, preventing it from
            // overwriting a deep link handled by the new router.
            const path = window.location.pathname;
            if (path === '/' || path === '') {
              if (['Login', 'CreatorSignUp', 'UserSignUp', 'VerifyEmail', 'Suspended', 'Banned'].includes(activeScreen)) {
                if (profileData.role === 'creator' || profileData.role === 'admin' || profileData.role === 'authority') {
                  setActiveScreen('CreatorDashboard');
                } else {
                  setActiveScreen('Home');
                }
              }
            }

            // --- START: DEFINITIVE ROUTING & DEEP LINKING LOGIC ---
            if (!routingDoneRef.current) {
                routingDoneRef.current = true; // Lock this logic so it only runs once per page load.
                
                const path = window.location.pathname;
                const parts = path.split('/').filter(Boolean);
                let navigated = false; // Flag to see if we handled the deep link

                if (parts.length > 0) {
                    const screen = parts[0];
                    const id = parts[1];

                    switch (screen) {
                        case 'opportunity':
                            if (id) { setSelectedOpportunity({ id }); setActiveScreen('OpportunityDetails'); navigated = true; }
                            break;
                        case 'discover':
                            setActiveScreen('Discover');
                            navigated = true;
                            break;
                        case 'user':
                            if (id) { setSelectedUserId(id); setActiveScreen('UserProfile'); navigated = true; }
                            break;
                        case 'competition':
                            setActiveScreen('CompetitionScreen');
                            navigated = true;
                            break;
                        case 'promotedStatus': // <-- NEW AD LOGIC ADDED
                            if (id) {
                                setActiveScreen('Home'); 
                                navigated = true;
                            }
                            break;
                        case 'content':
                            if (id) {
                                (async () => {
                                    try {
                                        // First, check for a standard VOD content item
                                        const appId = "production-app-id";
                                        const contentRef = doc(db, "artifacts", appId, "public", "data", "content_items", id);
                                        let docSnap = await getDoc(contentRef);

                                        if (docSnap.exists()) {
                                            // It's a standard VOD item, play it in the modal directly
                                            const contentData = { id: docSnap.id, ...docSnap.data() };
                                            handleVideoPress(contentData.embedUrl || contentData.mainUrl, contentData);
                                        } else {
                                            // If not found, check if it's a replay from the events collection
                                            const eventRef = doc(db, "events", id);
                                            docSnap = await getDoc(eventRef);
                                            if (docSnap.exists() && docSnap.data().status === 'completed') {
                                                // It IS a replay. Set the ID and navigate to the Discover screen.
                                                setDeepLinkedReplayId(id);
                                                setActiveScreen('Discover');
                                            } else {
                                                // It was not found in either location.
                                                showMessage("The shared content could not be found.");
                                            }
                                        }
                                    } catch (error) {
                                        console.error("Deep link fetch error:", error);
                                        showMessage("Error loading shared content.");
                                    }
                                })();
                                navigated = true; // Mark as handled
                            }
                            break;
                    }
                }

                // If a deep link was NOT handled, proceed with default navigation.
                if (!navigated && ['Login', 'CreatorSignUp', 'UserSignUp', 'VerifyEmail', 'Suspended', 'Banned'].includes(activeScreen)) {
                    if (profileData.role === 'creator' || profileData.role === 'admin' || profileData.role === 'authority') {
                        setActiveScreen('CreatorDashboard');
                    } else {
                        setActiveScreen('Home');
                    }
                }
            }
            // --- END: DEFINITIVE ROUTING & DEEP LINKING LOGIC ---

          } else {
            showMessage("User profile not found. Logging out.");
            signOut(auth);
          }
        } catch (error) {
          console.error("Auth check failed:", error);
          showMessage("Could not verify account status.");
          signOut(auth);
        } finally {
          setAuthLoading(false);
          setIsInitialLoad(false);
        }
      } else { // This user is fully logged out.
        setCurrentUser(null);
        setCreatorProfile(null);
        setHasNewFollowerContent(false); // Explicitly reset state related to listeners
        setNotificationBadgeCount(0); // Reset badge count on logout
        const protectedScreens = ['CreatorDashboard', 'AdminDashboard', 'MyListings', 'SavedOpportunities', 'CreateCampaign', 'PostOpportunityForm', 'MyFeed'];
        if (protectedScreens.includes(activeScreen)) {
            setActiveScreen('Home');
        }
        setAuthLoading(false);
        setIsInitialLoad(false);
      }
    });

    return () => {
      // This cleanup runs when the App component unmounts entirely.
      unsubscribeAuth();
      unsubProfile();
      unsubFollowing();
    };
   }, [activeScreen]); // Dependency remains the same
  // =========================== END: LOGOUT RACE CONDITION FIX ===========================
 
        // ======================= START: PUSH NOTIFICATION SETUP =======================
useEffect(() => {
    if (!currentUser) return; // Only run for logged-in users

    // Define an async function inside the effect
    const requestPermissionAndSaveToken = async () => {
        // Check if we've already asked for permission this session to avoid spamming the user
        if (sessionStorage.getItem('notificationPermissionRequested')) {
            return;
        }
        sessionStorage.setItem('notificationPermissionRequested', 'true');

        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                console.log("Notification permission granted.");
                
                // Get the token
                const currentToken = await getToken(messaging, { vapidKey: 'BEZWeaGgXfqqK2CT8VAkbHssB_uQN3we9XxunByTBl2mERHHu8q9E_ZGOv9cG0f369hBBNm8WITA6fncyIjnam0' });
                
                if (currentToken) {
                    // Send the token to your server
                    const saveTokenFunction = httpsCallable(functions, 'saveFCMToken');
                    await saveTokenFunction({ token: currentToken });
                    console.log("FCM Token saved successfully.");
                } else {
                    console.warn("No registration token available. Request permission to generate one.");
                }
            } else {
                console.warn("Notification permission denied.");
            }
        } catch (error) {
            console.error("An error occurred while getting token. ", error);
        }
    };

    requestPermissionAndSaveToken();

     // Handle messages that arrive while the app is in the foreground
    const unsubscribeOnMessage = onMessage(messaging, (payload) => {
        // THE FIX: The onSnapshot listener from the useNotifications hook is the
        // single source of truth for creating toast notifications. This onMessage
        // listener must NOT create a duplicate. We will log the incoming push for 
        // debugging purposes but will not add it to the toast queue.
        console.log("Foreground push received and intentionally ignored to prevent duplicate toast:", payload);
    });

    // Cleanup function to unsubscribe when the component unmounts or user logs out
    return () => {
        unsubscribeOnMessage();
    };

}, [currentUser]); // This effect runs once when a user logs in
// ======================== END: PUSH NOTIFICATION SETUP ========================
    
     
    // ======================= START: CAMPAIGN VIEW HANDLER =======================
useEffect(() => {
    const handleViewCampaign = (event) => {
        const { campaignId } = event.detail;

        // This check uses the reliable, up-to-date currentUser state from App.jsx
        if (!currentUser) {
            showMessage("Please log in or sign up to view campaign details.");
            handleNavigate('Login'); // Use the navigation handler for history
            return;
        }

        // If the user is logged in, proceed to the campaign.
        setSelectedCampaignId(campaignId);
        handleNavigate('CampaignDetails'); // Use the navigation handler for history
    };

    window.addEventListener('viewCampaignDetails', handleViewCampaign);

    return () => {
        window.removeEventListener('viewCampaignDetails', handleViewCampaign);
    };
}, [currentUser, handleNavigate, showMessage]); // Dependencies ensure the function has the latest state
// ======================== END: CAMPAIGN VIEW HANDLER ========================

  // ======================= START: NOTIFICATION INBOX HANDLERS =======================
useEffect(() => {
    const handleNavToOpp = (event) => {
        const { id } = event.detail;
        setSelectedOpportunity({ id: id });
        handleNavigate('OpportunityDetailsScreen');
    };
    const handleNavToUser = (event) => {
        const { id } = event.detail;
        setSelectedUserId(id);
        handleNavigate('UserProfile');
    };

    window.addEventListener('navigateToOpportunity', handleNavToOpp);
    window.addEventListener('navigateToUser', handleNavToUser);

    return () => {
        window.removeEventListener('navigateToOpportunity', handleNavToOpp);
        window.removeEventListener('navigateToUser', handleNavToUser);
    };
}, [handleNavigate]); // Dependency on handleNavigate is correct
// ======================== END: NOTIFICATION INBOX HANDLERS ========================

    // ======================= START: CONTENT NOTIFICATION HANDLER =======================
  useEffect(() => {
    const handleNavToContent = async (event) => {
        const { id, openComments } = event.detail; // <-- Capture the new 'openComments' flag
        if (!id) return;

        try {
            const appId = "production-app-id";
            const contentRef = doc(db, "artifacts", appId, "public", "data", "content_items", id);
            const docSnap = await getDoc(contentRef);

            if (docSnap.exists()) {
                const contentData = { id: docSnap.id, ...docSnap.data() };
                if (openComments) {
                    setOpenCommentsOnLoad(true); // <-- Set the state flag before opening the modal
                }
                handleVideoPress(contentData.embedUrl || contentData.mainUrl, contentData);
            } else {
                showMessage("The content you are looking for could not be found.");
            }
        } catch (error) {
            console.error("Error fetching content for navigation:", error);
            showMessage("Error loading content.");
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

        useEffect(() => {
        const openImageViewerHandler = (event) => {
            // THE FIX: Explicitly extract the full item details from the dispatch
            const { imageUrl, description, itemId, itemType } = event.detail;
            setImageViewerData({ imageUrl, description, itemId, itemType }); // <--- Set all details
            setShowImageViewerModal(true);
        };
        window.addEventListener('openImageViewer', openImageViewerHandler);
        return () => {
            window.removeEventListener('openImageViewer', openImageViewerHandler);
        };
    }, []);

      // --- VIDEO MODAL BACK BUTTON HANDLING ---
    useEffect(() => {
        const handleModalCloseOnBack = () => {
            setShowVideoModal(false);
        };

        if (showVideoModal) {
            // Push a "modal" state into the history when the modal opens
            window.history.pushState({ modal: 'video' }, '');
            // Listen for the popstate event (back button press)
            window.addEventListener('popstate', handleModalCloseOnBack);
        }

        // Cleanup function
        return () => {
            window.removeEventListener('popstate', handleModalCloseOnBack);
        };
    }, [showVideoModal]);  
       
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
        let unsubscribe = () => {};

        // THE DEFINITIVE FIX: Do not attach the listener until the initial auth check is complete.
        if (!authLoading) {
            const liveEventDocRef = doc(db, "settings", "liveEvent");
            unsubscribe = onSnapshot(liveEventDocRef, (docSnap) => {
                if (docSnap.exists() && docSnap.data().status && docSnap.data().status !== 'no_event_scheduled') {
                    const eventData = { id: docSnap.id, ...docSnap.data() };
                    setLiveEvent(eventData);
                    // The global event dispatch is still useful for other components like the Header banner.
                    window.dispatchEvent(new CustomEvent('liveEventUpdated', { detail: eventData }));
                } else {
                    setLiveEvent(null);
                    window.dispatchEvent(new CustomEvent('liveEventUpdated', { detail: null }));
                }
            });
        }
        // The timer and complex logic are removed. App.jsx's only job is to fetch the data.
        return () => unsubscribe();
    }, [authLoading]);

        // ================= START: THE DEFINITIVE LIVE EVENT SYNC FIX =================
    useEffect(() => {
        let timer;
        // If there's no event or it's not upcoming, reset the state.
        if (!liveEvent || liveEvent.status !== 'upcoming' || !liveEvent.scheduledStartTime) {
        setIsLive(false);
        setCountdownText('');
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
          window.history.back();
        }
      }
    };
    
    // Listen for the popstate event, which fires on browser back button clicks
    window.addEventListener('popstate', handleBackButton);

    return () => {
      window.removeEventListener('popstate', handleBackButton);
    };
  }, [activeScreen, previousScreen, message, showMessage]);
        
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
    // This effect runs whenever the pledgeContext is changed.
    // It ensures that data is set *before* we navigate to the payment screen.
    if (pledgeContext && pledgeContext.type) {
        handleNavigate('SupportUsScreen');
    }
  }, [pledgeContext]); // Dependency array: this code runs only when pledgeContext changes.

        // New Code to Add
  // --- Notification Toast System Logic ---
  useEffect(() => {
      // This logic now correctly filters out notifications that have already been queued in this session.
      const newNotifications = notifications.filter(n => !processedToastIds.current.has(n.id));

      if (newNotifications.length > 0) {
          setToastQueue(prev => [...prev, ...newNotifications]);
          newNotifications.forEach(n => processedToastIds.current.add(n.id));
      }
  }, [notifications]);

  useEffect(() => {
      // If there is no active toast but there are items in the queue, show the next one.
      if (!currentToast && toastQueue.length > 0) {
          const nextToast = toastQueue[0];
          setCurrentToast(nextToast);
          
          // --- THIS IS THE FINAL, ISOLATED FIX ---
          // Define the list of notification types that should NOT play a sound.
          const soundMutedTypes = ['newComment', 'newPledge', 'livePremiere'];
          
          // Play sound only for allowed notification types, respecting broadcast vs. private.
          const mutedPrivateTypes = ['NEW_COMMENT']; // Mute private "new comment" notifications.
          const mutedBroadcastTypes = ['DONATION', 'EVENT_LIVE']; // Mute public donation and live event tickers.

          let shouldPlaySound = true;
          if (nextToast.isBroadcast) {
              // For public broadcasts, check against the broadcast type list.
              if (mutedBroadcastTypes.includes(nextToast.broadcastType)) {
                  shouldPlaySound = false;
              }
          } else {
              // For private notifications, check against the private type list.
              if (mutedPrivateTypes.includes(nextToast.type)) {
                  shouldPlaySound = false;
              }
          }

          // Play the sound only if it has not been muted.
          if (shouldPlaySound) {
              notificationSoundRef.current?.play().catch(e => console.error("Audio play failed:", e));
          }
          // --- END OF FIX ---

          // A toast appearing should now mark the item as "seen" in the database.
          markToastAsSeen(nextToast.id);
      }
  }, [toastQueue, currentToast, markToastAsSeen, markNotificationAsRead]);

   const renderScreen = () => {
    if (activeScreen === 'Banned') return <BannedScreen setActiveScreen={handleNavigate} />;
    if (activeScreen === 'Suspended') return <SuspendedScreen showMessage={showMessage} setActiveScreen={handleNavigate} suspensionDetails={suspensionDetails} />;
    
     switch (activeScreen) {
      case 'About': return <AboutScreen setActiveScreen={handleNavigate} />;
      case 'BlockedList': return <BlockedListScreen currentUser={currentUser} setActiveScreen={handleNavigate} showMessage={showMessage} />;
      case 'Login': return <LoginScreen setActiveScreen={handleNavigate} showMessage={showMessage} />;
      case 'CreatorSignUp': return <CreatorSignUpScreen showMessage={showMessage} setActiveScreen={handleNavigate} />;
      case 'VerifyEmail': return <VerifyEmailScreen unverifiedUser={unverifiedUser} showMessage={showMessage} setActiveScreen={handleNavigate} handleLogout={handleLogout} />;
      case 'UserSignUp': return <UserSignUpScreen showMessage={showMessage} setActiveScreen={handleNavigate} />;
      case 'ForgotPassword': return <ForgotPasswordScreen showMessage={showMessage} setActiveScreen={handleNavigate} />;
      case 'CreateCampaign': return <CreateCampaignScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} />;
      case 'AllCampaigns': return <AllCampaignsScreen showMessage={showMessage} setActiveScreen={handleNavigate} setSelectedCampaignId={setSelectedCampaignId} currencyRates={currencyRates} selectedCurrency={selectedCurrency} />;
      case 'CampaignDetails': return <CampaignDetailsScreen showMessage={showMessage} setActiveScreen={handleNavigate} selectedCampaignId={selectedCampaignId} currentUser={currentUser} setPledgeContext={setPledgeContext} currencyRates={currencyRates} selectedCurrency={selectedCurrency} />;
      case 'DonationPledge': return <DonationPledgeScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} pledgeContext={pledgeContext} setPledgeIdForConfirmation={setPledgeIdForConfirmation} currencyRates={currencyRates} selectedCurrency={selectedCurrency} />;
      case 'SubscriptionPledge': return <SubscriptionPledgeScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} pledgeContext={pledgeContext} setPledgeIdForConfirmation={setPledgeIdForConfirmation} selectedCurrency={selectedCurrency} currencyRates={currencyRates} />;
      case 'PendingConfirmation': return <PendingConfirmationScreen showMessage={showMessage} setActiveScreen={handleNavigate} pledgeIdForConfirmation={pledgeIdForConfirmation} currencyRates={currencyRates} selectedCurrency={selectedCurrency} />;
      case 'SupportUsScreen': return <SupportUsScreen setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} showMessage={showMessage} setPledgeContext={setPledgeContext} liveEvent={liveEvent} />;
      case 'PremiumPerks': return <PremiumPerksScreen setActiveScreen={handleNavigate} currentUser={currentUser} showMessage={showMessage} setPledgeContext={setPledgeContext} />;
      case 'AdvertiserPerks': return <AdvertiserPerksScreen setActiveScreen={handleNavigate} />;
      case 'CreatorConnect': return <CreatorConnectScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} setSelectedOpportunity={setSelectedOpportunity} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} />;
      case 'OpportunityDetails': return <OpportunityDetailsScreen showMessage={showMessage} setActiveScreen={handleNavigate} selectedOpportunity={selectedOpportunity} />;
      case 'PostOpportunityForm': return <PostOpportunityForm showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} setOpportunityToPromote={setOpportunityToPromote} />;
      case 'MyListings': return <MyListingsScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} />;
      case 'SavedOpportunities': return <SavedOpportunitiesScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} setSelectedOpportunity={setSelectedOpportunity} />;
      case 'UserProfile': return <UserProfileScreen selectedUserId={selectedUserId} setActiveScreen={handleNavigate} setSelectedCampaignId={setSelectedCampaignId} showMessage={showMessage} currentUser={currentUser} creatorProfile={creatorProfile} setOnConfirmationAction={setOnConfirmationAction} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} handleVideoPress={handleVideoPress} previousScreen={previousScreen} />;
      case 'MyFollows': return <MyFollowsScreen currentUser={currentUser} setActiveScreen={handleNavigate} setSelectedUserId={setSelectedUserId} showMessage={showMessage} />;
      case 'Followers': return <FollowersScreen currentUser={currentUser} setActiveScreen={handleNavigate} setSelectedUserId={setSelectedUserId} showMessage={showMessage} />;
      case 'MyContentLibrary': return <MyContentLibraryScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} setCreatorProfile={setCreatorProfile} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} handleVideoPress={handleVideoPress} />;
      case 'CreatorDashboard': return <CreatorDashboardScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} setCreatorProfile={setCreatorProfile} setSelectedCampaignId={setSelectedCampaignId} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} liveEvent={liveEvent} currencyRates={currencyRates} selectedCurrency={selectedCurrency} />;
      case 'AdminDashboard': return <AdminDashboardScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} selectedAdminSubScreen={selectedAdminSubScreen} setSelectedAdminSubScreen={setSelectedAdminSubScreen} setSelectedAdminCampaignId={setSelectedAdminCampaignId} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} setSelectedUserId={setSelectedUserId} setSelectedOpportunity={setSelectedOpportunity} setSelectedStatus={setSelectedStatus} setSelectedCompAdmin={setSelectedCompAdmin} setSelectedReportGroup={setSelectedReportGroup} featuredContentSlots={featuredContentSlots} currencyRates={currencyRates} selectedCurrency={selectedCurrency} />;
      case 'MyFeed': return <FollowingFeedScreen currentUser={currentUser} setActiveScreen={handleNavigate} handleVideoPress={handleVideoPress} showMessage={showMessage} />;
      case 'AdminEventManager': return <AdminEventManagerScreen showMessage={showMessage} setActiveScreen={handleNavigate} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} />;
      case 'AdminCampaignDetails': return <AdminCampaignDetailsScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} selectedAdminCampaignId={selectedAdminCampaignId} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} />;
      case 'AdminOpportunityDetails': return <AdminOpportunityDetailsScreen showMessage={showMessage} setActiveScreen={handleNavigate} selectedOpportunity={selectedOpportunity} />;
      case 'AdminReportReview': return <AdminReportReviewScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} selectedReportGroup={selectedReportGroup} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} />;
      case 'AdminStatusReview': return <AdminStatusReviewScreen showMessage={showMessage} setActiveScreen={handleNavigate} selectedStatus={selectedStatus} />;
      case 'CompetitionScreen': return <CompetitionScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} activeCompetition={activeCompetition} />;
      case 'Discover': return <DiscoverScreen showMessage={showMessage} currentUser={currentUser} creatorProfile={creatorProfile} setActiveScreen={handleNavigate} handleVideoPress={handleVideoPress} liveEvent={liveEvent} setPledgeContext={setPledgeContext} isLive={isLive} countdownText={countdownText} deepLinkedReplayId={deepLinkedReplayId} />;
      case 'DiscoverUsers': return <DiscoverUsersScreen showMessage={showMessage} setActiveScreen={handleNavigate} setSelectedUserId={setSelectedUserId} currentUser={currentUser} creatorProfile={creatorProfile} />;
      case 'PromotedStatus': return <PromotedStatusScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} />;
      case 'BookStatus': return <BookStatusScreen showMessage={showMessage} setActiveScreen={handleNavigate} setPledgeIdForConfirmation={setPledgeIdForConfirmation} currentUser={currentUser} creatorProfile={creatorProfile} opportunityToPromote={opportunityToPromote} setOpportunityToPromote={setOpportunityToPromote} previousScreen={activeScreen} currencyRates={currencyRates} selectedCurrency={selectedCurrency} />;
      case 'PostSubmissionUpsell': return <PostSubmissionUpsellScreen showMessage={showMessage} setActiveScreen={handleNavigate} opportunityToPromote={opportunityToPromote} setOpportunityToPromote={setOpportunityToPromote} />;
      case 'AnalyticsDashboard': return <AnalyticsDashboardScreen showMessage={showMessage} setActiveScreen={handleNavigate} />;
      case 'Contact': return <ContactScreen setActiveScreen={handleNavigate} showMessage={showMessage} currentUser={currentUser} />;
      case 'NvaNetworkCharts': return <NvaNetworkChartsScreen setActiveScreen={handleNavigate} />;
      case 'NotificationInbox': return <NotificationInboxScreen setActiveScreen={handleNavigate} currentUser={currentUser} dismissNotification={dismissNotification} markNotificationAsRead={markNotificationAsRead} markAllAsRead={markAllAsRead} />;
      case 'Home': default: return <HomeScreen currentUser={currentUser} showMessage={showMessage} handleVideoPress={handleVideoPress} handleLogout={handleLogout} setActiveScreen={handleNavigate} featuredContentSlots={featuredContentSlots} activeCompetition={activeCompetition} />;
    
      case 'PrivacyPolicy': return <PrivacyPolicyScreen setActiveScreen={handleNavigate} />;
      case 'TermsOfService': return <TermsOfServiceScreen setActiveScreen={handleNavigate} />;

    }
  };

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
          />
          <div className="container">
            {/* Step 3: Use the original authLoading for the quick, text-based loader during navigation. */}
            {authLoading ? (
                <div className="screenContainer" style={{textAlign: 'center', paddingTop: '50px'}}>
                  <p className="heading">Loading...</p>
                </div>
            ) : (
                renderScreen()
            )}
          </div>
          {!['Suspended', 'Banned'].includes(activeScreen) && (
            <NavigationBar
              activeScreen={activeScreen}
              setActiveScreen={handleNavigate}
              currentUser={currentUser}
              creatorProfile={creatorProfile}
              showMessage={showMessage}
              hasNewFollowerContent={hasNewFollowerContent}
              unreadCount={notificationBadgeCount}
            />
          )}

          {/* All modals and toasts remain here */}
          {currentToast && (
              <NotificationToast
                  key={currentToast.id}
                  notification={currentToast}
                  onClose={() => {
                      setCurrentToast(null);
                      setToastQueue(prev => prev.slice(1));
                  }}
                  setActiveScreen={handleNavigate} // THIS LINE IS THE FIX
              />
          )}
          <audio ref={notificationSoundRef} src={notificationSound} preload="auto" />

          {message && (
            <div className="messageBox">
              <p className="messageText">{message}</p>
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
                      setShowVideoModal(false);
                      setOpenCommentsOnLoad(false); // <-- Reset the flag when the modal is closed
                  }}
                  contentItem={currentContentItem}
                  currentUser={currentUser}
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
      
        {showImageViewerModal && (
        <ImageViewerModal
          imageUrl={imageViewerData.imageUrl}
          description={imageViewerData.description}
          itemId={imageViewerData.itemId} 
          itemType={imageViewerData.itemType}
          showMessage={showMessage} // <--- CRITICAL FIX: Pass the showMessage prop
          onClose={() => setShowImageViewerModal(false)}
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