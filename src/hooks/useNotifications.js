// Original code for src/hooks/useNotifications.js

import { useState, useEffect, useCallback } from 'react';
import { getFunctions, httpsCallable } from "firebase/functions";
import { collection, query, orderBy, onSnapshot, where, getDocs, limit } from "firebase/firestore";
import { app, db } from '../firebase.js';

export const useNotifications = (currentUser) => {
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

            const unseenPrivate = privateNotifications.filter(p => !p.isRead && !seenIds.has(p.id));
            const unseenBroadcasts = broadcastNotifications.filter(b => !seenIds.has(b.id));

            const combined = [...unseenPrivate, ...unseenBroadcasts];
            
            const unique = Array.from(new Map(combined.map(item => [item.id, item])).values());
            
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
        const userCreationDate = new Date(currentUser.metadata.creationTime);
        const broadcastQuery = query(broadcastNotifRef, where("timestamp", ">", userCreationDate), orderBy("timestamp", "desc"));
        const unsubscribeBroadcast = onSnapshot(broadcastQuery, (snapshot) => {
            broadcastNotifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), isBroadcast: true }));
            mergeAndSetNotifications();
        });

        return () => {
            unsubscribePrivate();
            unsubscribeBroadcast();
        };
    }, [currentUser]);

    // Note: dismissNotification is removed as it's part of the inbox screen's specific logic.
    return { notifications, isLoading, markToastAsSeen, markNotificationAsRead };
};