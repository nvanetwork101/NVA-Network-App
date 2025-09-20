// src/App.jsx

import PromotedStatusScreen from './components/PromotedStatusScreen';
import BookStatusScreen from './components/BookStatusScreen';

import NotificationInboxScreen from './components/NotificationInboxScreen';
import notificationSound from './Notification 2.mp3';

import PostSubmissionUpsellScreen from './components/PostSubmissionUpsellScreen';
import MyFollowsScreen from './components/MyFollowsScreen';
import FollowersScreen from './components/FollowersScreen';

import { useState, useEffect } from 'react';
import PremiumPerksScreen from './components/PremiumPerksScreen';
import FollowingFeedScreen from './components/FollowingFeedScreen';

import SubscriptionPledgeScreen from './components/SubscriptionPledgeScreen';
import { doc, getDoc, onSnapshot, collection, query, where, orderBy, limit, updateDoc } from "firebase/firestore"; // CORRECT: getDoc and updateDoc are imported
import BlockedListScreen from './components/BlockedListScreen';
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, db } from './firebase.js';
import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase.js'; // This line is also needed

// Import all your components
import Header from './components/Header';
import NavigationBar from './components/NavigationBar';

// Core Screens
import HomeScreen from './components/HomeScreen';
import NvaNetworkChartsScreen from './components/NvaNetworkChartsScreen';
import ContactScreen from './components/ContactScreen';
import CompetitionScreen from './components/CompetitionScreen';

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

import { useNotifications } from './hooks/useNotifications';
import NotificationToast from './components/NotificationToast';
import { useRef } from 'react';

function App() {
  // --- STATE MANAGEMENT ---
  const [currentUser, setCurrentUser] = useState(null);
  const [creatorProfile, setCreatorProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true); // <-- FIX: New state for one-time video
  const [installPromptEvent, setInstallPromptEvent] = useState(null); // <-- PWA FIX: Stores the install event
  const [showInstallModal, setShowInstallModal] = useState(false); // <-- PWA FIX: Controls our custom modal
  const [isStandalone, setIsStandalone] = useState(false); // <-- PWA FIX: Checks if app is already installed
  const [activeScreen, setActiveScreen] = useState('Home');
  const [activeCompetition, setActiveCompetition] = useState(null);
  const [previousScreen, setPreviousScreen] = useState(null);
  const [message, setMessage] = useState('');
  
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

    const [hasNewFollowerContent, setHasNewFollowerContent] = useState(false);

    // --- Notification Toast System State ---
  const { notifications, markBroadcastAsSeen, markNotificationAsRead } = useNotifications(currentUser);
  const [toastQueue, setToastQueue] = useState([]);
  const [currentToast, setCurrentToast] = useState(null);
  const [processedToastIds, setProcessedToastIds] = useState(new Set());
  const notificationSoundRef = useRef(null);
  const unreadCount = notifications.filter(n => !n.isBroadcast && !n.isRead).length;

  const [isAudioPrimed, setIsAudioPrimed] = useState(false);

  const showMessage = (msg) => {
    
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

    useEffect(() => {
        const fetchRates = async () => {
            try {
                const getRatesFunction = httpsCallable(functions, 'getExchangeRates');
                const result = await getRatesFunction();
                if (result.data && result.data.rates) {
                    setCurrencyRates(result.data.rates);
                }
            } catch (error) {
                console.error("Could not fetch currency rates:", error);
                showMessage("Currency conversion is currently unavailable.");
            }
        };
        fetchRates();
    }, []);

  // The new navigation handler that tracks screen history
  const handleNavigate = (newScreen) => {
    // --- PWA FIX: Aggressive re-prompt on every navigation ---
    // If the install event is ready and the app isn't installed, show the prompt.
    if (installPromptEvent && !isStandalone) {
        setShowInstallModal(true);
    }
    // --------------------------------------------------------

    // Only update history if navigating to a genuinely new screen
    if (newScreen !== activeScreen) {
      setPreviousScreen(activeScreen);
    }
    setActiveScreen(newScreen);
  };

  const handleLogout = async () => {
    await signOut(auth);
    setActiveScreen('Home');
    showMessage('You have been logged out.');
  };

  const handleVideoPress = (url, item) => {
    if (!currentUser) {
        showMessage("Please sign up or log in to engage with content!");
        return;
    }
    setCurrentVideoUrl(url);
    setCurrentContentItem(item);
    setShowVideoModal(true);
  };

  // ========================== START: DEFINITIVE AUTH FLOW FIX ==========================
    useEffect(() => {
    let unsubProfile = () => {};

    const unsubscribeAuth = onAuthStateChanged(auth, async (user) => {
      unsubProfile();
      setAuthLoading(true);

      if (user) {
        const userDocRef = doc(db, "creators", user.uid);
        try {
          const docSnap = await getDoc(userDocRef);

          if (docSnap.exists()) {
            const profileData = docSnap.data();

            if (profileData.banned) {
                showMessage("This account is permanently banned.");
                setActiveScreen('Banned');
                signOut(auth);
                return; // Stop further execution
            }

            if (profileData.suspendedUntil && profileData.suspendedUntil.toDate() > new Date()) {
                const expiryDate = profileData.suspendedUntil.toDate().toLocaleString();
                setCurrentUser(user);
                setCreatorProfile(profileData);
                setSuspensionDetails({ email: profileData.email, expiryDate });
                if (activeScreen !== 'Suspended') {
                    setActiveScreen('Suspended');
                }
                return; // Stop further execution
            }
            
            await updateDoc(userDocRef, { lastLoginTimestamp: new Date() });

            unsubProfile = onSnapshot(userDocRef, (snap) => {
                if (snap.exists()) {
                    setCurrentUser(user);
                    setCreatorProfile(snap.data());
                } else {
                    signOut(auth);
                }
            });

            if (!user.emailVerified) {
              setActiveScreen('VerifyEmail');
            } else if (['Login', 'CreatorSignUp', 'UserSignUp', 'VerifyEmail', 'Suspended', 'Banned'].includes(activeScreen)) {
              setActiveScreen('CreatorDashboard');
            }
            
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
          setIsInitialLoad(false); // <-- FIX: Turn off initial load video
        }
      } else {
        setCurrentUser(null);
        setCreatorProfile(null);
        const protectedScreens = ['CreatorDashboard', 'AdminDashboard', 'MyListings', 'SavedOpportunities', 'CreateCampaign', 'PostOpportunityForm', 'MyFeed'];
        if (protectedScreens.includes(activeScreen)) {
            setActiveScreen('Home');
        }
        setAuthLoading(false);
        setIsInitialLoad(false); // <-- FIX: Turn off initial load video
      }
    });

    return () => {
      unsubscribeAuth();
      unsubProfile();
    };
   }, [activeScreen]);
  // =========================== END: DEFINITIVE AUTH FLOW FIX ===========================

	useEffect(() => {
        const requestHandler = () => {
            // When a component requests the state, re-dispatch the last known state.
            window.dispatchEvent(new CustomEvent('competitionUpdated', { detail: activeCompetition }));
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
        const fetchRates = async () => {
            try {
                const getRatesFunction = httpsCallable(functions, 'getExchangeRates');
                const result = await getRatesFunction();
                if (result.data && result.data.rates) {
                    setCurrencyRates(result.data.rates);
                }
            } catch (error) {
                console.error("Could not fetch currency rates:", error);
                showMessage("Currency conversion is currently unavailable.");
            }
        };
        fetchRates();
    }, []);
        
        useEffect(() => {
        const docRef = doc(db, "settings", "featuredContentSlots");
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                setFeaturedContentSlots(docSnap.data());
            } else {
                console.warn("Featured content document not found!");
                setFeaturedContentSlots({}); // Set to empty object to prevent errors
            }
        });
        return () => unsubscribe(); // Cleanup listener on unmount
    }, []);
    // --------------------------------------------------------------------------------

        useEffect(() => {
        const compRef = collection(db, "competitions");
        const q = query(compRef, where("status", "in", ["Accepting Entries", "Live Voting", "Judging", "Results Visible"]), orderBy("createdAt", "desc"), limit(1));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            let competitionData = null;
            if (!snapshot.empty) {
                competitionData = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
            }
            // Set the state for components that still use the prop
            setActiveCompetition(competitionData); 
            
            // Broadcast the change to any component that is listening
            window.dispatchEvent(new CustomEvent('competitionUpdated', { detail: competitionData }));
        });
        return () => unsubscribe();
    }, []);

        useEffect(() => {
        const liveEventDocRef = doc(db, "settings", "liveEvent");

        const unsubscribe = onSnapshot(liveEventDocRef, (docSnap) => {
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

        // The timer and complex logic are removed. App.jsx's only job is to fetch the data.
        return () => unsubscribe();
    }, []);

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

        useEffect(() => {
                let unsubscribe = () => {};
                if (currentUser) {
                    const followingRef = collection(db, "creators", currentUser.uid, "following");
                    const q = query(followingRef, where("hasNewContent", "==", true));
                    unsubscribe = onSnapshot(q, (snapshot) => {
                        setHasNewFollowerContent(!snapshot.empty);
                    });
                } else {
                    setHasNewFollowerContent(false);
                }
                return () => unsubscribe();
            }, [currentUser]);

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

        // --- PWA FIX: Listen for browser's install prompt event ---
    useEffect(() => {
        // Check if the app is already running in standalone (installed) mode
        if (window.matchMedia('(display-mode: standalone)').matches) {
            setIsStandalone(true);
        }

        const handleBeforeInstallPrompt = (event) => {
            event.preventDefault(); // Prevent the default browser prompt
            setInstallPromptEvent(event); // Save the event
            // Show our custom modal immediately if the app isn't installed
            if (!sessionStorage.getItem('installDismissed')) {
                 setShowInstallModal(true);
            }
        };

        window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

        // This event fires after the user has successfully installed the app
        const handleAppInstalled = () => {
            setIsStandalone(true);
            setInstallPromptEvent(null);
            setShowInstallModal(false);
        };
        window.addEventListener('appinstalled', handleAppInstalled);

        return () => {
            window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
            window.removeEventListener('appinstalled', handleAppInstalled);
        };
    }, []);

        // New Code to Add
  // --- Notification Toast System Logic ---
  useEffect(() => {
      // 1. Identify new, unread notifications that haven't been processed yet.
      const newNotifications = notifications.filter(n => {
          const isUnread = n.isBroadcast ? true : !n.isRead; // Broadcasts are always "new" until seen
          return isUnread && !processedToastIds.has(n.id);
      });

      if (newNotifications.length > 0) {
          // 2. Add them to the queue and mark them as processed to prevent re-adding.
          setToastQueue(prev => [...prev, ...newNotifications]);
          setProcessedToastIds(prev => new Set([...prev, ...newNotifications.map(n => n.id)]));
      }
  }, [notifications]); // This effect runs whenever the main notification list changes.

  useEffect(() => {
      // If there is no active toast but there are items in the queue, show the next one.
      if (!currentToast && toastQueue.length > 0) {
          const nextToast = toastQueue[0];
          setCurrentToast(nextToast);
          
          // Play sound for the new notification.
          notificationSoundRef.current?.play().catch(e => console.error("Audio play failed:", e));

          // --- THIS IS THE FIX ---
          // Immediately mark the notification as processed in the database.
          // This prevents it from being shown again on the next login.
          if (nextToast.isBroadcast) {
              markBroadcastAsSeen(nextToast.id);
          } else {
              markNotificationAsRead(nextToast.id);
          }
          // --- END OF FIX ---
      }
  }, [toastQueue, currentToast, markBroadcastAsSeen, markNotificationAsRead]); // <-- Dependencies added

   const renderScreen = () => {
    if (activeScreen === 'Banned') return <BannedScreen setActiveScreen={handleNavigate} />;
    if (activeScreen === 'Suspended') return <SuspendedScreen showMessage={showMessage} setActiveScreen={handleNavigate} suspensionDetails={suspensionDetails} />;
    
     switch (activeScreen) {
      case 'BlockedList': return <BlockedListScreen currentUser={currentUser} setActiveScreen={handleNavigate} showMessage={showMessage} />;
      case 'Login': return <LoginScreen setActiveScreen={handleNavigate} showMessage={showMessage} />;
      case 'CreatorSignUp': return <CreatorSignUpScreen showMessage={showMessage} setActiveScreen={handleNavigate} />;
      case 'VerifyEmail': return <VerifyEmailScreen currentUser={currentUser} showMessage={showMessage} setActiveScreen={handleNavigate} handleLogout={handleLogout} />;
      case 'UserSignUp': return <UserSignUpScreen showMessage={showMessage} setActiveScreen={handleNavigate} />;
      case 'ForgotPassword': return <ForgotPasswordScreen showMessage={showMessage} setActiveScreen={handleNavigate} />;
      case 'CreateCampaign': return <CreateCampaignScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} />;
      case 'AllCampaigns': return <AllCampaignsScreen showMessage={showMessage} setActiveScreen={handleNavigate} setSelectedCampaignId={setSelectedCampaignId} currencyRates={currencyRates} selectedCurrency={selectedCurrency} />;
      case 'CampaignDetails': return <CampaignDetailsScreen showMessage={showMessage} setActiveScreen={handleNavigate} selectedCampaignId={selectedCampaignId} currentUser={currentUser} setPledgeContext={setPledgeContext} currencyRates={currencyRates} selectedCurrency={selectedCurrency} />;
      case 'DonationPledge': return <DonationPledgeScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} pledgeContext={pledgeContext} setPledgeIdForConfirmation={setPledgeIdForConfirmation} currencyRates={currencyRates} selectedCurrency={selectedCurrency} />;
      case 'SubscriptionPledge': return <SubscriptionPledgeScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} pledgeContext={pledgeContext} setPledgeIdForConfirmation={setPledgeIdForConfirmation} selectedCurrency={selectedCurrency} currencyRates={currencyRates} />;
      case 'PendingConfirmation': return <PendingConfirmationScreen showMessage={showMessage} setActiveScreen={handleNavigate} pledgeIdForConfirmation={pledgeIdForConfirmation} currencyRates={currencyRates} selectedCurrency={selectedCurrency} />;
      case 'SupportUsScreen': return <SupportUsScreen setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} showMessage={showMessage} setPledgeContext={setPledgeContext} liveEvent={liveEvent} pledgeContext={pledgeContext} />;
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
      case 'MyContentLibrary': return <MyContentLibraryScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} handleVideoPress={handleVideoPress} />;
      case 'CreatorDashboard': return <CreatorDashboardScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} setCreatorProfile={setCreatorProfile} setSelectedCampaignId={setSelectedCampaignId} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} liveEvent={liveEvent} currencyRates={currencyRates} selectedCurrency={selectedCurrency} />;
      case 'AdminDashboard': return <AdminDashboardScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} selectedAdminSubScreen={selectedAdminSubScreen} setSelectedAdminSubScreen={setSelectedAdminSubScreen} setSelectedAdminCampaignId={setSelectedAdminCampaignId} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} setSelectedUserId={setSelectedUserId} setSelectedOpportunity={setSelectedOpportunity} setSelectedStatus={setSelectedStatus} setSelectedCompAdmin={setSelectedCompAdmin} setSelectedReportGroup={setSelectedReportGroup} featuredContentSlots={featuredContentSlots} currencyRates={currencyRates} selectedCurrency={selectedCurrency} />;
      case 'MyFeed': return <FollowingFeedScreen currentUser={currentUser} setActiveScreen={handleNavigate} handleVideoPress={handleVideoPress} showMessage={showMessage} />;
      case 'AdminEventManager': return <AdminEventManagerScreen showMessage={showMessage} setActiveScreen={handleNavigate} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} />;
      case 'AdminCampaignDetails': return <AdminCampaignDetailsScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} selectedAdminCampaignId={selectedAdminCampaignId} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} />;
      case 'AdminOpportunityDetails': return <AdminOpportunityDetailsScreen showMessage={showMessage} setActiveScreen={handleNavigate} selectedOpportunity={selectedOpportunity} />;
      case 'AdminReportReview': return <AdminReportReviewScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} selectedReportGroup={selectedReportGroup} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} />;
      case 'AdminStatusReview': return <AdminStatusReviewScreen showMessage={showMessage} setActiveScreen={handleNavigate} selectedStatus={selectedStatus} />;
      case 'CompetitionScreen': return <CompetitionScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} creatorProfile={creatorProfile} activeCompetition={activeCompetition} />;
      case 'Discover': return <DiscoverScreen showMessage={showMessage} currentUser={currentUser} creatorProfile={creatorProfile} setActiveScreen={handleNavigate} handleVideoPress={handleVideoPress} liveEvent={liveEvent} setPledgeContext={setPledgeContext} isLive={isLive} countdownText={countdownText} />;
      case 'DiscoverUsers': return <DiscoverUsersScreen showMessage={showMessage} setActiveScreen={handleNavigate} setSelectedUserId={setSelectedUserId} currentUser={currentUser} creatorProfile={creatorProfile} />;
      case 'PromotedStatus': return <PromotedStatusScreen showMessage={showMessage} setActiveScreen={handleNavigate} currentUser={currentUser} setShowConfirmationModal={setShowConfirmationModal} setConfirmationTitle={setConfirmationTitle} setConfirmationMessage={setConfirmationMessage} setOnConfirmationAction={setOnConfirmationAction} />;
      case 'BookStatus': return <BookStatusScreen showMessage={showMessage} setActiveScreen={handleNavigate} setPledgeIdForConfirmation={setPledgeIdForConfirmation} currentUser={currentUser} creatorProfile={creatorProfile} opportunityToPromote={opportunityToPromote} setOpportunityToPromote={setOpportunityToPromote} previousScreen={activeScreen} currencyRates={currencyRates} selectedCurrency={selectedCurrency} />;
      case 'PostSubmissionUpsell': return <PostSubmissionUpsellScreen showMessage={showMessage} setActiveScreen={handleNavigate} opportunityToPromote={opportunityToPromote} setOpportunityToPromote={setOpportunityToPromote} />;
      case 'AnalyticsDashboard': return <AnalyticsDashboardScreen showMessage={showMessage} setActiveScreen={handleNavigate} />;
      case 'Contact': return <ContactScreen setActiveScreen={handleNavigate} showMessage={showMessage} currentUser={currentUser} />;
      case 'NvaNetworkCharts': return <NvaNetworkChartsScreen setActiveScreen={handleNavigate} />;
      case 'NotificationInbox': return <NotificationInboxScreen notifications={notifications} setActiveScreen={handleNavigate} dismissNotification={() => {}} />;
      case 'Home': default: return <HomeScreen currentUser={currentUser} showMessage={showMessage} handleVideoPress={handleVideoPress} handleLogout={handleLogout} setActiveScreen={handleNavigate} featuredContentSlots={featuredContentSlots} activeCompetition={activeCompetition} />;
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
              unreadCount={unreadCount}
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
                  onClose={() => setShowVideoModal(false)}
                  contentItem={currentContentItem}
                  currentUser={currentUser}
                  showMessage={showMessage}
                  setActiveScreen={handleNavigate}
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

      {/* --- PWA FIX: The new, custom install modal --- */}
      {showInstallModal && installPromptEvent && !isStandalone && (
          <div className="modal-backdrop" style={{zIndex: 1001}}>
              <div className="modal-content" style={{maxWidth: '400px'}}>
                  <div className="modal-header">
                      <p className="modal-title">Install NVA Network</p>
                  </div>
                  <div className="modal-body" style={{textAlign: 'center'}}>
                      <p>For the best experience, add NVA Network to your home screen!</p>
                  </div>
                  <div className="modal-footer">
                      <button className="button" style={{backgroundColor: '#555'}} onClick={() => {
                          setShowInstallModal(false);
                          sessionStorage.setItem('installDismissed', 'true'); // Remember dismissal for this session
                      }}>
                          <span className="buttonText light">Later</span>
                      </button>
                      <button className="button" onClick={() => {
                          setShowInstallModal(false);
                          installPromptEvent.prompt();
                      }}>
                          <span className="buttonText">Install App</span>
                      </button>
                  </div>
              </div>
          </div>
      )}
      {/* --- END OF FIX --- */}
      </>
      )}
    </>
  );
}

export default App;