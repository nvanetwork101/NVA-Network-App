import { useState, useEffect, useCallback, useRef } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, query, orderBy, onSnapshot, where, limit } from "firebase/firestore";
import { app, db } from '../firebase.js';

export const useNotifications = (currentUser) => {
    const [privateNotifications, setPrivateNotifications] = useState([]);
    const [broadcastNotifications, setBroadcastNotifications] = useState([]);
    const [seenIds, setSeenIds] = useState(null); // Initialize as null to block evaluation during loading
    const [notifications, setNotifications] = useState([]); 
    const [isLoading, setIsLoading] = useState(true);
    const sessionStartTime = useRef(new Date()); // Session baseline timestamp to prevent backlog toast storms

    const markToastAsSeen = useCallback(async (notificationId) => {
        if (!currentUser) return;
        try {
            const functions = getFunctions(app);
            const markAsSeenCallable = httpsCallable(functions, 'markToastAsSeen');
            await markAsSeenCallable({ notificationId });
        } catch (error) {
            console.error("Failed to mark toast as seen:", error);
        }
    }, [currentUser]);

    const markNotificationAsRead = useCallback(async (notificationId) => {
        if (!currentUser) return;
        try {
            const functions = getFunctions(app);
            const markAsReadFunction = httpsCallable(functions, 'markNotificationAsRead');
            await markAsReadFunction({ notificationId: notificationId });
        } catch (error) {
            console.error("Failed to mark notification as read:", error);
        }
    }, [currentUser]);
    
    // 1. Listen to Private and Broadcast notifications separately
    useEffect(() => {
        if (!currentUser) {
            setPrivateNotifications([]);
            setBroadcastNotifications([]);
            setIsLoading(false);
            return () => {};
        }

        setIsLoading(true);

        const privateNotifRef = collection(db, "notifications");
        const privateQuery = query(privateNotifRef, where("userId", "==", currentUser.uid), orderBy("timestamp", "desc"), limit(20));
        const unsubscribePrivate = onSnapshot(privateQuery, (snapshot) => {
            const fetchedPrivate = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isBroadcast: false }));
            setPrivateNotifications(fetchedPrivate);
        });

        const broadcastNotifRef = collection(db, "broadcast_notifications");
        const userCreationDate = new Date(currentUser.metadata.creationTime);
        const broadcastQuery = query(broadcastNotifRef, where("timestamp", ">", userCreationDate), orderBy("timestamp", "desc"));
        const unsubscribeBroadcast = onSnapshot(broadcastQuery, (snapshot) => {
            const fetchedBroadcast = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isBroadcast: true }));
            setBroadcastNotifications(fetchedBroadcast);
        });

        return () => {
            unsubscribePrivate();
            unsubscribeBroadcast();
        };
    }, [currentUser]);

    // 2. Real-time caching of Seen Notification IDs to completely bypass getDocs recursion
    useEffect(() => {
        if (!currentUser) {
            setSeenIds(new Set());
            return () => {};
        }
        const seenRef = collection(db, "creators", currentUser.uid, "seenNotifications");
        const unsubscribeSeen = onSnapshot(seenRef, (snapshot) => {
            setSeenIds(new Set(snapshot.docs.map(doc => doc.id)));
        });
        return () => unsubscribeSeen();
    }, [currentUser]);

    // 3. Merging processed and filtered notifications safely
    useEffect(() => {
        if (!currentUser || seenIds === null) {
            // Block notifications from building until seen cache is fully built
            return;
        }

        const combined = [...privateNotifications, ...broadcastNotifications];
        const unseen = combined.filter(n => {
            if (seenIds.has(n.id)) return false;
            
            // Only toast notifications that were actually created after the app loaded
            const notifTime = n.timestamp?.toDate ? n.timestamp.toDate() : new Date(n.timestamp);
            return notifTime > sessionStartTime.current;
        });
        const unique = Array.from(new Map(unseen.map(item => [item.id, item])).values());
        
        unique.sort((a, b) => {
            const timeA = a.timestamp?.toDate()?.getTime() || 0;
            const timeB = b.timestamp?.toDate()?.getTime() || 0;
            return timeB - timeA;
        });
        
        setNotifications(unique);
        setIsLoading(false);
    }, [privateNotifications, broadcastNotifications, seenIds, currentUser]);

    return { notifications, isLoading, markToastAsSeen, markNotificationAsRead };
};