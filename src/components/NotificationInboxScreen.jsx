// src/components/NotificationInboxScreen.jsx
import React, { useState, useEffect } from 'react';
import { db, collection, query, where, orderBy, onSnapshot, limit } from '../firebase.js';

const NotificationInboxScreen = ({ currentUser, setActiveScreen, dismissNotification, markNotificationAsRead, markAllAsRead }) => {
    // This component now manages its own state completely.
    const [inboxNotifications, setInboxNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    // Effect 1: Clear the global unread count when the screen is opened.
    useEffect(() => {
        if (markAllAsRead) {
            markAllAsRead();
        }
    }, [markAllAsRead]);

    // Effect 2: Fetch and listen for this user's notifications directly from Firestore.
    useEffect(() => {
        if (!currentUser) {
            setLoading(false);
            return;
        };

        setLoading(true);
        const notificationsRef = collection(db, "notifications");
        const q = query(
            notificationsRef,
            where("userId", "==", currentUser.uid),
            orderBy("timestamp", "desc"),
            limit(50) // Fetch a reasonable history of the last 50 notifications
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedNotifications = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setInboxNotifications(fetchedNotifications);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching inbox notifications:", error);
            setLoading(false);
        });

        // Cleanup the listener when the component unmounts or the user changes.
        return () => unsubscribe();

    }, [currentUser]);

    const handleNotificationClick = (notification) => {
        if (!notification.link) return;

        // Mark as read when clicked to navigate
        if (!notification.isRead) {
            markNotificationAsRead(notification.id); // <-- This is the specific fix
        }

        const path = notification.link;
        const parts = path.split('/').filter(Boolean); // e.g., /user/123 -> ['user', '123']

        if (parts.length === 0) {
            setActiveScreen('Home'); // Root path
            return;
        }

        const screen = parts[0];
        const id = parts[1];

        // This logic mimics the routing in App.jsx
        switch (screen) {
            case 'competition':
                setActiveScreen('CompetitionScreen');
                break;
            case 'opportunity':
                if (id) {
                    // We need a way to pass the selected ID back up to App.jsx
                    // The best way is to fire a custom event that App.jsx can listen for.
                    window.dispatchEvent(new CustomEvent('navigateToOpportunity', { detail: { id: id } }));
                }
                break;
            case 'user':
                if (id) {
                    window.dispatchEvent(new CustomEvent('navigateToUser', { detail: { id: id } }));
                }
                break;
            default:
                // For simple, non-dynamic links like /CreatorDashboard
                const screenName = screen.charAt(0).toUpperCase() + screen.slice(1);
                setActiveScreen(screenName);
                break;
        }
    };

    const handleDismiss = (notificationId, event) => {
        event.stopPropagation();
        // Optimistically remove from the local list for instant UI feedback.
        setInboxNotifications(prev => prev.filter(n => n.id !== notificationId));
        // Call the function from App.jsx to update the database.
        dismissNotification(notificationId);
    };

    return (
        <div className="screenContainer">
            <p className="heading">Notifications</p>
            <div className="dashboardContentList">
                {loading ? (
                    <p className="dashboardItem" style={{textAlign: 'center'}}>Loading notifications...</p>
                ) : inboxNotifications.length === 0 ? (
                    <p className="dashboardItem" style={{textAlign: 'center'}}>You have no notifications.</p>
                ) : (
inboxNotifications.map(item => (
                        <div
                            key={item.id}
                            className="adminDashboardItem"
                            style={{
                                cursor: 'pointer',
                                borderLeft: (item.isBroadcast || item.isRead === true) ? '4px solid transparent' : '4px solid #FFD700',
                                flexDirection: 'column',
                                alignItems: 'flex-start'
                            }}
                            onClick={() => handleNotificationClick(item)}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                <p className="adminDashboardItemTitle" style={{fontWeight: 'normal', flexGrow: 1}}>{item.message}</p>
                                {/* THE FIX: The button now appears for ANY private notification, read or unread. */}
                                {!item.isBroadcast && (
                                    <button 
                                        className="adminActionButton reject"
                                        style={{ marginLeft: '15px' }} 
                                        onClick={(e) => handleDismiss(item.id, e)}
                                    >
                                        Dismiss
                                    </button>
                                )}
                            </div>
                            <p style={{fontSize: '12px', color: '#AAA'}}>{item.timestamp ? new Date(item.timestamp.toDate()).toLocaleString() : 'No date'}</p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default NotificationInboxScreen;