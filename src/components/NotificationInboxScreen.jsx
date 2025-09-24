// src/components/NotificationInboxScreen.jsx
import React, { useState, useEffect } from 'react';
import { doc, updateDoc, setDoc } from "firebase/firestore";
import { db, auth } from '../firebase.js'; // Correctly import from firebase.js

const NotificationInboxScreen = ({ notifications, setActiveScreen, dismissNotification, markAllAsRead }) => {
    const [localNotifications, setLocalNotifications] = useState(notifications);

    useEffect(() => {
        // On component mount, call the function passed from App.jsx to clear the unread count.
        markAllAsRead();
    }, []); // The empty dependency array ensures this runs only once when the screen opens.

    useEffect(() => {
        setLocalNotifications(notifications);
    }, [notifications]);

    const handleNotificationClick = (notification) => {
        // This function should now ONLY handle navigation.
        // Marking as read is the explicit job of the "Dismiss" button.
        if (notification.link) {
            const screen = notification.link.replace('/', '');
            setActiveScreen(screen);
        }
    };

    const handleDismiss = (notificationId, event) => {
        event.stopPropagation();
        setLocalNotifications(prev => prev.filter(n => n.id !== notificationId));
        dismissNotification(notificationId);
    };

    return (
        <div className="screenContainer">
            <p className="heading">Notifications</p>
            <div className="dashboardContentList">
                {localNotifications.length === 0 ? (
                    <p className="dashboardItem" style={{textAlign: 'center'}}>You have no new notifications.</p>
                ) : (
                    localNotifications.map(item => (
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
                            <p style={{fontSize: '12px', color: '#AAA'}}>{new Date(item.timestamp.toDate()).toLocaleString()}</p>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default NotificationInboxScreen;