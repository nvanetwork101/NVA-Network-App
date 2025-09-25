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
        // Define placeholder unsubscribe functions. They will be reassigned if a user is logged in.
        let unsubscribePrivate = () => {};
        let unsubscribeBroadcast = () => {};

        // --- THE DEFINITIVE FIX ---
        // Only attempt to set up listeners if a currentUser object exists.
        if (currentUser) {
            setIsLoading(true);
            let privateNotifications = [];
            let broadcastNotifications = [];

            // This function merges private and public notifications, filters out seen broadcasts,
            // and then updates the component's state.
            const mergeAndSetNotifications = async () => {
                // Get the IDs of broadcast notifications the user has already seen.
                const seenRef = collection(db, "creators", currentUser.uid, "seenNotifications");
                const seenSnapshot = await getDocs(seenRef);
                const seenIds = new Set(seenSnapshot.docs.map(doc => doc.id));

                const unseenBroadcasts = broadcastNotifications.filter(b => !seenIds.has(b.id));
                const unreadPrivateNotifications = privateNotifications.filter(p => !p.isRead);

                const combined = [...unreadPrivateNotifications, ...unseenBroadcasts];
                
                // Filter out any items that are pending deletion to avoid UI flicker.
                const filtered = combined.filter(n => !pendingDeletes.has(n.id));
                
                // Ensure uniqueness, just in case of race conditions.
                const unique = Array.from(new Map(filtered.map(item => [item.id, item])).values());
                
                // Sort the final list chronologically.
                unique.sort((a, b) => b.timestamp.toDate().getTime() - a.timestamp.toDate().getTime());
                
                setNotifications(unique);
                setIsLoading(false);
            };

            // Set up the listener for private, user-specific notifications.
            const privateNotifRef = collection(db, "notifications");
            const privateQuery = query(privateNotifRef, where("userId", "==", currentUser.uid), orderBy("timestamp", "desc"), limit(20));
            unsubscribePrivate = onSnapshot(privateQuery, (snapshot) => {
                privateNotifications = snapshot.docs.map(doc => {
                    const data = doc.data();
                    return { 
                        id: doc.id, 
                        ...data, 
                        type: data.type || 'generic', // Guarantee a 'type' field exists.
                        isBroadcast: false 
                    };
                });
                mergeAndSetNotifications();
            }, (error) => {
                console.error("Error listening to private notifications:", error);
                // Optionally handle the error, e.g., show a message to the user.
            });

            // Set up the listener for public, broadcast notifications.
            const broadcastNotifRef = collection(db, "broadcast_notifications");
            const userCreationDate = new Date(currentUser.metadata.creationTime);
            const broadcastQuery = query(broadcastNotifRef, where("timestamp", ">", userCreationDate), orderBy("timestamp", "desc"));
            unsubscribeBroadcast = onSnapshot(broadcastQuery, (snapshot) => {
                broadcastNotifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isBroadcast: true }));
                mergeAndSetNotifications();
            }, (error) => {
                console.error("Error listening to broadcast notifications:", error);
            });

        } else {
            // If there is no user, clear any existing notifications and stop loading.
            setNotifications([]);
            setIsLoading(false);
        }

        // The cleanup function. This will run when the component unmounts OR when
        // `currentUser` changes. If a user logs out, it correctly calls the
        // `unsubscribe` functions that were assigned during their session.
        return () => {
            unsubscribePrivate();
            unsubscribeBroadcast();
        };
    }, [currentUser, pendingDeletes]);

    return { notifications, isLoading, dismissNotification, markBroadcastAsSeen, markNotificationAsRead };
};