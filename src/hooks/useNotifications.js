// src/hooks/useNotifications.js

import { useState, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { doc, setDoc, updateDoc, collection, query, orderBy, onSnapshot, where, getDocs, limit } from "firebase/firestore";
import { app, db } from '../firebase.js'; // Correctly import from your firebase.js

export const useNotifications = (currentUser) => {
    const [notifications, setNotifications] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [pendingDeletes, setPendingDeletes] = useState(new Set());

    const dismissNotification = useCallback((notificationId) => {
        setPendingDeletes(prev => new Set(prev).add(notificationId));
        const functions = getFunctions(app); // Use the imported 'app'
        const deleteNotificationCallable = httpsCallable(functions, 'deleteNotification');
        
        deleteNotificationCallable({ notificationId })
            .catch(error => {
                console.error("Failed to dismiss notification:", error);
                setPendingDeletes(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(notificationId);
                    return newSet;
                });
            });
    }, []);

    const markBroadcastAsSeen = useCallback(async (notificationId) => {
        if (!currentUser) return;
        try {
            const seenRef = doc(db, "creators", currentUser.uid, "seenNotifications", notificationId);
            await setDoc(seenRef, { seenAt: new Date() });
        } catch (error) {
            console.error("Failed to mark broadcast as seen:", error);
        }
    }, [currentUser]);

    const markNotificationAsRead = useCallback(async (notificationId) => {
        if (!currentUser) return;
        try {
            // This now calls the secure Cloud Function instead of writing directly.
            const functions = getFunctions(app);
            const markAsReadFunction = httpsCallable(functions, 'markNotificationAsRead');
            await markAsReadFunction({ notificationId: notificationId });
        } catch (error) {
            // The Cloud Function will throw its own detailed, secure error.
            console.error("Failed to mark notification as read via Cloud Function:", error);
        }
    }, [currentUser]);
    
    useEffect(() => {
        // --- THIS IS THE FIX ---
        // 1. Define placeholder unsubscribe functions that do nothing by default.
        let unsubscribePrivate = () => {};
        let unsubscribeBroadcast = () => {};

        // 2. Check if a user exists.
        if (currentUser) {
            // 3. All listener setup logic is now safely inside this block.
            setIsLoading(true);
            let privateNotifications = [];
            let broadcastNotifications = [];

            const mergeAndSetNotifications = async () => {
                const seenRef = collection(db, "creators", currentUser.uid, "seenNotifications");
                const seenSnapshot = await getDocs(seenRef);
                const seenIds = new Set(seenSnapshot.docs.map(doc => doc.id));
                
                const unseenBroadcasts = broadcastNotifications.filter(b => !seenIds.has(b.id));
                
                // THIS IS THE FIX: The global 'notifications' state should ONLY contain UNREAD items
                // to prevent old toasts from reappearing on login.
                const unreadPrivateNotifications = privateNotifications.filter(p => !p.isRead);
                
                const combined = [...unreadPrivateNotifications, ...unseenBroadcasts];
                const filtered = combined.filter(n => !pendingDeletes.has(n.id));
                const unique = Array.from(new Map(filtered.map(item => [item.id, item])).values());
                
                unique.sort((a, b) => b.timestamp.toDate().getTime() - a.timestamp.toDate().getTime());
                
                setNotifications(unique);
                setIsLoading(false);
            };

            const privateNotifRef = collection(db, "notifications");
            const privateQuery = query(privateNotifRef, where("userId", "==", currentUser.uid), orderBy("timestamp", "desc"), limit(20));
            // Assign the real unsubscribe function from the listener
            unsubscribePrivate = onSnapshot(privateQuery, (snapshot) => {
                privateNotifications = snapshot.docs.map(doc => {
                    const data = doc.data();
                    // --- THIS IS THE FIX ---
                    // Ensure that every notification object has a 'type' property.
                    // If data.type is missing or null, assign a default 'generic' type.
                    return { 
                        id: doc.id, 
                        ...data, 
                        type: data.type || 'generic', // Guarantees the 'type' field always exists
                        isBroadcast: false 
                    };
                });
                mergeAndSetNotifications();
            });

            const broadcastNotifRef = collection(db, "broadcast_notifications");
            const userCreationDate = new Date(currentUser.metadata.creationTime);
            const broadcastQuery = query(broadcastNotifRef, where("timestamp", ">", userCreationDate), orderBy("timestamp", "desc"));
            // Assign the real unsubscribe function from the listener
            unsubscribeBroadcast = onSnapshot(broadcastQuery, (snapshot) => {
                broadcastNotifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isBroadcast: true }));
                mergeAndSetNotifications();
            });
        } else {
            // 4. If there is no user, simply clear the state.
            setNotifications([]);
            setIsLoading(false);
        }

        // 5. This cleanup function is now ALWAYS returned. When the effect re-runs
        //    due to currentUser becoming null, it calls the unsubscribe functions
        //    captured from the PREVIOUS render, correctly detaching the listeners.
        return () => {
            unsubscribePrivate();
            unsubscribeBroadcast();
        };
        // --- END OF FIX ---
    }, [currentUser, pendingDeletes]);

    return { notifications, isLoading, dismissNotification, markBroadcastAsSeen, markNotificationAsRead };
};