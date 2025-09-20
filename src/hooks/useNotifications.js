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
            const notifRef = doc(db, "notifications", notificationId);
            await updateDoc(notifRef, { isRead: true });
        } catch (error) {
            console.error("Failed to mark notification as read:", error);
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
            
            const unseenBroadcasts = broadcastNotifications.filter(b => !seenIds.has(b.id));
            
            const combined = [...privateNotifications, ...unseenBroadcasts];
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
        const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
        const broadcastQuery = query(broadcastNotifRef, where("timestamp", ">", fiveDaysAgo), orderBy("timestamp", "desc"));
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