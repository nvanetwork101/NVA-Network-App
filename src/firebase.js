// src/firebase.js

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { 
    initializeFirestore,
    persistentLocalCache,
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    increment,
    runTransaction,
    startAfter
} from "firebase/firestore";
import { 
    getStorage,
    ref,
    uploadBytes,
    getDownloadURL 
} from "firebase/storage";
import { getAnalytics } from "firebase/analytics";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getMessaging } from "firebase/messaging";

// Your web app's Firebase configuration using environment variables
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: "1:122220543439:web:e36ccce435463b7939a6ba", // DEFINITIVE FIX: Hardcode the correct appId.
  measurementId: "G-6RNS6DH3G0"
};

// --- INITIALIZE FIREBASE ---
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
// THE DEFINITIVE FIX: Force Firestore to use a more stable connection method.
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  localCache: persistentLocalCache({})
});
const storage = getStorage(app);
const functions = getFunctions(app);
let messaging; // We will initialize this later, manually.
// const analytics = getAnalytics(app);

// --- UTILITY FUNCTIONS ---
const GENERIC_THUMBNAIL_PLACEHOLDER = 'https://placehold.co/300x200/2A2A2A/FFF?text=NVA';

const extractVideoInfo = (url) => {
    if (!url || typeof url !== 'string') {
        return { videoId: null, thumbnailUrl: GENERIC_THUMBNAIL_PLACEHOLDER, embedUrl: null, platform: 'unknown', isVertical: false };
    }
    const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/ ]{11})/;
    const youtubeMatch = url.match(youtubeRegex);
    if (youtubeMatch && youtubeMatch[1]) {
        const videoId = youtubeMatch[1];
        return { videoId, thumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`, embedUrl: `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`, platform: 'youtube', isVertical: url.includes('/shorts/') };
    }
    const vimeoRegex = /vimeo\.com\/(?:video\/)?(\d+)/;
    const vimeoMatch = url.match(vimeoRegex);
    if (vimeoMatch && vimeoMatch[1]) {
        return { videoId: vimeoMatch[1], thumbnailUrl: GENERIC_THUMBNAIL_PLACEHOLDER, embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}?autoplay=1`, platform: 'vimeo', isVertical: false };
    }
    const tiktokRegex = /tiktok\.com\/.*\/video\/(\d+)/;
    const tiktokMatch = url.match(tiktokRegex);
    if (tiktokMatch && tiktokMatch[1]) {
        return { videoId: tiktokMatch[1], thumbnailUrl: GENERIC_THUMBNAIL_PLACEHOLDER, embedUrl: `https://www.tiktok.com/embed/v2/${tiktokMatch[1]}`, platform: 'tiktok', isVertical: true };
    }
    const facebookRegex = /facebook\.com\/(?:watch\/?\?v=|.*\/videos\/|.*\/reel\/)(\d+)/;
    const facebookMatch = url.match(facebookRegex);
    if(facebookMatch && facebookMatch[1]) {
        return { videoId: facebookMatch[1], thumbnailUrl: GENERIC_THUMBNAIL_PLACEHOLDER, embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true`, platform: 'facebook', isVertical: url.includes('/reel/') };
    }
    return { videoId: null, thumbnailUrl: GENERIC_THUMBNAIL_PLACEHOLDER, embedUrl: url, platform: 'generic', isVertical: false };
};


// --- EXPORT ALL SERVICES AND FUNCTIONS ---
export { 
    app, 
    auth, 
    db, 
    storage, 
    functions, 
    messaging, // <-- THIS LINE IS ADDED
    // analytics, // Temporarily disabled to prevent console errors
    // Firestore Functions
    addDoc,
    collection,
    doc,
    getDoc,
    getDocs,
    setDoc,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    onSnapshot,
    increment,
    runTransaction,
    startAfter,
    // Functions Functions
    httpsCallable,
    // Storage Functions
    ref,
    uploadBytes,
    getDownloadURL,
    // Utilities
    extractVideoInfo
};
    // --- CENTRAL APP ID ---
export const appId = "production-app-id";

window.fb = {
    getFunctions: getFunctions,
    httpsCallable: httpsCallable
};