// src/components/NotificationInboxScreen.jsx
import React, { useState, useEffect } from 'react';
import { db, collection, query, where, orderBy, onSnapshot, limit, httpsCallable, functions } from '../firebase.js';

const NotificationInboxScreen = ({ currentUser, setActiveScreen, dismissNotification, markNotificationAsRead, markAllAsRead }) => {
    const [inboxNotifications, setInboxNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    // This useEffect is now removed. The logic has been moved to the handleClearRead button.

    useEffect(() => {
        if (!currentUser) {
            setLoading(false);
            return;
        };

        setLoading(true);
        const notificationsRef = collection(db, "notifications");
        
        // THE DEFINITIVE FIX: Query using the correct 'timestamp' field that the backend now uses.
        const q = query(
            notificationsRef,
            where("userId", "==", currentUser.uid),
            orderBy("timestamp", "desc"), // This now matches the backend and the Firestore index.
            limit(100)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const allUserNotifications = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));

            // Client-side filtering for 'inbox' is a good practice and is preserved.
            const inboxOnlyNotifications = allUserNotifications.filter(n => n.deliveryType && n.deliveryType.includes('inbox'));
            
            setInboxNotifications(inboxOnlyNotifications);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching inbox notifications:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser]);

    const handleClearRead = () => {
        if (markAllAsRead) {
            markAllAsRead();
        }
    };

    const handleNotificationClick = (notification) => {
        if (!notification.link) return;
        if (!notification.isRead) {
            markNotificationAsRead(notification.id);
        }
        const path = notification.link;
        const parts = path.split('/').filter(Boolean);
        if (parts.length === 0) {
            setActiveScreen('Home');
            return;
        }
        const screen = parts[0];
        const id = parts[1];
        switch (screen) {
            case 'user':
                if (id) window.dispatchEvent(new CustomEvent('navigateToUser', { detail: { id: id } }));
                break;
            case 'opportunity':
                if (id) window.dispatchEvent(new CustomEvent('navigateToOpportunity', { detail: { id: id } }));
                break;
            case 'content':
                if (id) window.dispatchEvent(new CustomEvent('navigateToContent', { detail: { id: id, openComments: true } }));
                break;
            case 'competition':
                setActiveScreen('CompetitionScreen');
                break;
            default:
                const screenName = screen.charAt(0).toUpperCase() + screen.slice(1);
                setActiveScreen(screenName);
                break;
        }
    };

    const handleDismiss = (notificationId, event) => {
        event.stopPropagation();
        setInboxNotifications(prev => prev.filter(n => n.id !== notificationId));
        dismissNotification(notificationId);
    };

    return (
        <div className="screenContainer">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p className="heading">Notifications</p>
                {/* NEW BUTTON to clear old/read notifications */}
                <button onClick={handleClearRead} className="adminActionButton" style={{ marginRight: '10px' }}>Clear Read</button>
            </div>
            <div className="dashboardContentList">
                {loading ? (
                    <p className="dashboardItem" style={{textAlign: 'center'}}>Loading...</p>
                ) : inboxNotifications.length === 0 ? (
                    <p className="dashboardItem" style={{textAlign: 'center'}}>You have no notifications.</p>
                ) : (
                    inboxNotifications.map(item => (
                        <div
                            key={item.id}
                            className="adminDashboardItem"
                            style={{
                                cursor: 'pointer',
                                borderLeft: item.isRead ? '4px solid transparent' : '4px solid #FFD700',
                                flexDirection: 'column',
                                alignItems: 'flex-start'
                            }}
                            onClick={() => handleNotificationClick(item)}
                        >
                            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                {/* Displaying 'item.body' is correct, as this matches the backend. */}
                                <p className="adminDashboardItemTitle" style={{fontWeight: 'normal', flexGrow: 1}}>{item.body}</p>
                                <button 
                                    className="adminActionButton reject"
                                    style={{ marginLeft: '15px' }} 
                                    onClick={(e) => handleDismiss(item.id, e)}
                                >
                                    Dismiss
                                </button>
                            </div>
                            {/* THE DEFINITIVE FIX: Display 'item.timestamp' to match the query and backend. */}
                            <p style={{fontSize: '12px', color: '#AAA'}}>{item.timestamp ? new Date(item.timestamp.toDate()).toLocaleString() : 'No date'}</p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default NotificationInboxScreen;