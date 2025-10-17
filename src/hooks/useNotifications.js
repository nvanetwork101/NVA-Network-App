// Corrected Code for src/hooks/useNotifications.js

import { useState, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, query, orderBy, onSnapshot, where, getDocs, limit } from "firebase/firestore";
import { app, db } from '../firebase.js';

export const useNotifications = (currentUser) => {
    // --- START: DEFINITIVE FIX ---
    // 1. Separate state for each data source to prevent race conditions.
    const [privateNotifications, setPrivateNotifications] = useState([]);
    const [broadcastNotifications, setBroadcastNotifications] = useState([]);
    
    // 2. Final, merged state that will be sent to the App.
    const [notifications, setNotifications] = useState([]); 
    
    const [isLoading, setIsLoading] = useState(true);

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
    
    // 3. Effect to FETCH data. This just populates the raw data arrays.
    useEffect(() => {
        if (!currentUser) {
            setPrivateNotifications([]);
            setBroadcastNotifications([]);
            setIsLoading(false);
            return () => {};
        }

        setIsLoading(true);

        // Private notifications listener
        const privateNotifRef = collection(db, "notifications");
        const privateQuery = query(privateNotifRef, where("userId", "==", currentUser.uid), orderBy("timestamp", "desc"), limit(20));
        const unsubscribePrivate = onSnapshot(privateQuery, (snapshot) => {
            const fetchedPrivate = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isBroadcast: false }));
            setPrivateNotifications(fetchedPrivate); // Only updates its own state
        });

        // Broadcast notifications listener
        const broadcastNotifRef = collection(db, "broadcast_notifications");
        const userCreationDate = new Date(currentUser.metadata.creationTime);
        const broadcastQuery = query(broadcastNotifRef, where("timestamp", ">", userCreationDate), orderBy("timestamp", "desc"));
        const unsubscribeBroadcast = onSnapshot(broadcastQuery, (snapshot) => {
            const fetchedBroadcast = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isBroadcast: true }));
            setBroadcastNotifications(fetchedBroadcast); // Only updates its own state
        });

        return () => {
            unsubscribePrivate();
            unsubscribeBroadcast();
        };
    }, [currentUser]);

    // 4. Effect to PROCESS data. This runs only when the raw data changes.
    // This is the single source of truth for creating the final notification list.
    useEffect(() => {
        if (!currentUser) {
            setNotifications([]);
            return;
        }

        const mergeAndSetNotifications = async () => {
            const seenRef = collection(db, "creators", currentUser.uid, "seenNotifications");
            const seenSnapshot = await getDocs(seenRef);
            const seenIds = new Set(seenSnapshot.docs.map(doc => doc.id));

            // Combine the latest raw data from both states
            const combined = [...privateNotifications, ...broadcastNotifications];
            
            // Filter out any toasts that have already been seen
            const unseen = combined.filter(n => !seenIds.has(n.id));

            // Remove any potential duplicates from the combined list
            const unique = Array.from(new Map(unseen.map(item => [item.id, item])).values());
            
            // Sort the final list
            unique.sort((a, b) => {
                const timeA = a.timestamp?.toDate()?.getTime() || 0;
                const timeB = b.timestamp?.toDate()?.getTime() || 0;
                return timeB - timeA;
            });
            
            // Set the final state ONE time. This prevents the duplicate toast bug.
            setNotifications(unique);
            setIsLoading(false);
        };

        mergeAndSetNotifications();

    }, [privateNotifications, broadcastNotifications, currentUser]);
    // --- END: DEFINITIVE FIX ---

    return { notifications, isLoading, markToastAsSeen, markNotificationAsRead };
};