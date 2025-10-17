import { useState, useEffect, useCallback, useRef } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, query, orderBy, onSnapshot, where, getDocs, limit } from "firebase/firestore";
import { app, db } from '../firebase.js';

export const useNotifications = (currentUser) => {
    const [privateNotifications, setPrivateNotifications] = useState([]);
    const [broadcastNotifications, setBroadcastNotifications] = useState([]);
    const [notifications, setNotifications] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    
    // THE FIX: useRef holds the timer ID for debouncing.
    const mergeTimer = useRef(null);

    const markToastAsSeen = useCallback(async (notificationId) => {
        if (!currentUser) return;
        try {
            const functions = getFunctions(app);
            const markAsSeenCallable = httpsCallable(functions, 'markToastAsSeen');
            await markAsSeenCallable({ notificationId });
        } catch (error) { console.error("Failed to mark toast as seen:", error); }
    }, [currentUser]);

    const markNotificationAsRead = useCallback(async (notificationId) => {
        if (!currentUser) return;
        try {
            const functions = getFunctions(app);
            const markAsReadFunction = httpsCallable(functions, 'markNotificationAsRead');
            await markAsReadFunction({ notificationId: notificationId });
        } catch (error) { console.error("Failed to mark notification as read:", error); }
    }, [currentUser]);
    
    useEffect(() => {
        if (!currentUser) {
            setPrivateNotifications([]);
            setBroadcastNotifications([]);
            setIsLoading(false);
            return () => {};
        }

        setIsLoading(true);
        
        const privateQuery = query(collection(db, "notifications"), where("userId", "==", currentUser.uid), orderBy("timestamp", "desc"), limit(20));
        const unsubscribePrivate = onSnapshot(privateQuery, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isBroadcast: false }));
            setPrivateNotifications(fetched);
        });

        const userCreationDate = new Date(currentUser.metadata.creationTime);
        const broadcastQuery = query(collection(db, "broadcast_notifications"), where("timestamp", ">", userCreationDate), orderBy("timestamp", "desc"));
        const unsubscribeBroadcast = onSnapshot(broadcastQuery, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isBroadcast: true }));
            setBroadcastNotifications(fetched);
        });

        return () => {
            unsubscribePrivate();
            unsubscribeBroadcast();
        };
    }, [currentUser]);

    useEffect(() => {
        if (!currentUser) {
            setNotifications([]);
            return;
        }

        // THE FIX: This entire block now debounces the state update.
        // It clears any pending timer and sets a new one for 50ms.
        // This bundles the two rapid-fire snapshot updates into a single execution.
        clearTimeout(mergeTimer.current);

        mergeTimer.current = setTimeout(async () => {
            const seenRef = collection(db, "creators", currentUser.uid, "seenNotifications");
            const seenSnapshot = await getDocs(seenRef);
            const seenIds = new Set(seenSnapshot.docs.map(doc => doc.id));
            const combined = [...privateNotifications, ...broadcastNotifications];
            const unseen = combined.filter(n => !seenIds.has(n.id));
            const unique = Array.from(new Map(unseen.map(item => [item.id, item])).values());
            unique.sort((a, b) => (b.timestamp?.toDate()?.getTime() || 0) - (a.timestamp?.toDate()?.getTime() || 0));
            
            setNotifications(unique); // The final state update happens only ONCE.
            setIsLoading(false);
        }, 50); // A 50ms delay is imperceptible to the user but plenty for the listeners to settle.

        // Cleanup the timer if the component unmounts.
        return () => clearTimeout(mergeTimer.current);

    }, [privateNotifications, broadcastNotifications, currentUser]);

    return { notifications, isLoading, markToastAsSeen, markNotificationAsRead };
};