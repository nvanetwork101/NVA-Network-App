// src/components/ChatListScreen.jsx

import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';

// A helper function to format timestamps into a user-friendly string
const formatTimestamp = (timestamp) => {
    if (!timestamp) return '';
    try {
        const date = timestamp.toDate();
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);
        
        if (diffInSeconds < 5) return 'just now';
        if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) return `${diffInHours}h ago`;
        
        return date.toLocaleDateString();
    } catch (e) {
        // Fallback for cases where timestamp might not be a Firestore Timestamp object yet
        return '';
    }
};

const ChatListScreen = ({ setActiveScreen, currentUser, setSelectedChatId, showMessage }) => {
    const [chats, setChats] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!currentUser) {
            setActiveScreen('Login');
            showMessage("Please log in to view your messages.");
            return;
        }

        const chatsRef = collection(db, 'chats');
        const q = query(
            chatsRef, 
            where('participants', 'array-contains', currentUser.uid),
            orderBy('lastMessageTimestamp', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const conversations = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setChats(conversations);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching chat list: ", error);
            showMessage("Could not load conversations.");
            setLoading(false);
        });

        // Cleanup the listener when the component unmounts
        return () => unsubscribe();

    }, [currentUser, setActiveScreen, showMessage]);

    const handleChatSelect = (chatId) => {
        setSelectedChatId(chatId);
        setActiveScreen('ChatMessageScreen');
    };

    return (
        <div className="screenContainer">
            <div className="dashboardSection">
                <p className="dashboardSectionTitle" style={{ marginBottom: '20px' }}>Conversations</p>

                {loading ? (
                    <p className="dashboardItem">Loading conversations...</p>
                ) : chats.length === 0 ? (
                    <p className="dashboardItem">You have no conversations yet. Find a user and press the 'Message' button to start a chat!</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {chats.map(chat => {
                            // Find the other person in the chat
                            const otherParticipantUid = chat.participants.find(uid => uid !== currentUser.uid);
                            if (!otherParticipantUid) return null; // Should not happen in a 2-person chat
                            
                            // Get their details from the denormalized data
                            const otherUserDetails = chat.participantDetails?.[otherParticipantUid] || {};

                            return (
                                <div 
                                    key={chat.id} 
                                    onClick={() => handleChatSelect(chat.id)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '15px',
                                        padding: '10px',
                                        backgroundColor: '#2A2A2A',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        border: '1px solid #3A3A3A'
                                    }}
                                >
                                    <img 
                                        src={otherUserDetails.profilePictureUrl || 'https://placehold.co/100x100/555/FFF?text=P'} 
                                        alt={otherUserDetails.creatorName}
                                        style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover' }}
                                    />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ margin: 0, fontWeight: 'bold', color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {otherUserDetails.creatorName || 'Unknown User'}
                                        </p>
                                        <p style={{ margin: '4px 0 0', color: '#AAA', fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {chat.lastMessage?.text || "No messages yet..."}
                                        </p>
                                    </div>
                                    <span style={{ color: '#888', fontSize: '12px', marginLeft: 'auto' }}>
                                        {formatTimestamp(chat.lastMessageTimestamp)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                )}
                 <button className="button button-contextual" onClick={() => setActiveScreen('Home')} style={{marginTop: '20px'}}>
                     <span className="buttonText">Back to Home</span>
                </button>
            </div>
        </div>
    );
};

export default ChatListScreen;