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
        if (!currentUser) {
            setNotifications([]);
            setIsLoading(false);
            return () => {};
        }

        setIsLoading(true);
        let privateNotifications = [];
        let broadcastNotifications = [];

        const mergeAndSetNotifications = async () => {
            const seenRef = collection(db, "creators", currentUser.uid, "seenNotifications");
            const seenSnapshot = await getDocs(seenRef);
            const seenIds = new Set(seenSnapshot.docs.map(doc => doc.id));
            
            // Filter out broadcasts that have already been marked as seen by the user.
            const unseenBroadcasts = broadcastNotifications.filter(b => !seenIds.has(b.id));

            // --- THIS IS THE DEFINITIVE FIX ---
            // Filter out private notifications that are already marked as read in the database.
            const unreadPrivateNotifications = privateNotifications.filter(p => !p.isRead);
            
            // Now, combine only the unread private notifications with the unseen broadcasts.
            const combined = [...unreadPrivateNotifications, ...unseenBroadcasts];
            const filtered = combined.filter(n => !pendingDeletes.has(n.id));
            const unique = Array.from(new Map(filtered.map(item => [item.id, item])).values());
            
            unique.sort((a, b) => b.timestamp.toDate().getTime() - a.timestamp.toDate().getTime());
            
            setNotifications(unique);
            setIsLoading(false);
        };

        const privateNotifRef = collection(db, "notifications");
        const privateQuery = query(privateNotifRef, where("userId", "==", currentUser.uid), orderBy("timestamp", "desc"), limit(20));
        const unsubscribePrivate = onSnapshot(privateQuery, (snapshot) => {
            privateNotifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isBroadcast: false }));
            mergeAndSetNotifications();
        });

        const broadcastNotifRef = collection(db, "broadcast_notifications");
        
        // --- THIS IS THE FIX ---
        // Get the user's account creation date.
        const userCreationDate = new Date(currentUser.metadata.creationTime);

        // Query for broadcasts created AFTER the user signed up.
        const broadcastQuery = query(broadcastNotifRef, where("timestamp", ">", userCreationDate), orderBy("timestamp", "desc"));
        // --- END OF FIX ---

        const unsubscribeBroadcast = onSnapshot(broadcastQuery, (snapshot) => {
            broadcastNotifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isBroadcast: true }));
            mergeAndSetNotifications();
        });

        return () => {
            unsubscribePrivate();
            unsubscribeBroadcast();
        };

    }, [currentUser, pendingDeletes]);

    return { notifications, isLoading, dismissNotification, markBroadcastAsSeen, markNotificationAsRead };
};