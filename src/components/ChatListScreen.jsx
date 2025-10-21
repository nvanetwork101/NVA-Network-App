// src/components/ChatListScreen.jsx

import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, onSnapshot, orderBy, doc } from 'firebase/firestore';

import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';

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
        return '';
    }
};

// --- DEFINITIVE TIMESTAMP FIX: New robust helper function ---
const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Offline';
    try {
        // This is the fix: It correctly handles both Firestore Timestamps (with a .toDate() method)
        // AND ISO date strings (which the Date constructor can parse directly).
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diffInSeconds = Math.floor((now - date) / 1000);

        if (diffInSeconds < 120) return 'Online'; // If seen within last 2 mins, show as Online
        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) return `Active ${diffInMinutes}m ago`;
        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) return `Active ${diffInHours}h ago`;
        
        return `Active on ${date.toLocaleDateString()}`;
    } catch (e) {
        // If parsing fails for any reason, fall back safely.
        return 'Offline';
    }
};


const ChatListScreen = ({ 
    setActiveScreen, 
    currentUser, 
    setSelectedChatId, 
    showMessage, 
    setShowConfirmationModal, 
    setConfirmationTitle, 
    setConfirmationMessage, 
    setOnConfirmationAction 
}) => {
    const [rawChats, setRawChats] = useState([]);
    const [blockedUserIds, setBlockedUserIds] = useState(new Set());
    const [filteredChats, setFilteredChats] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hoveredChatId, setHoveredChatId] = useState(null);

    // --- TIMESTAMP FIX: New state to hold live profile data ---
    const [liveParticipantProfiles, setLiveParticipantProfiles] = useState({});

    // Effect to fetch initial data (chats and block list)
    useEffect(() => {
        if (!currentUser) {
            setActiveScreen('Login');
            showMessage("Please log in to view your messages.");
            return;
        }
        
        const blockListRef = collection(db, 'creators', currentUser.uid, 'blockedUsers');
        const unsubBlocks = onSnapshot(blockListRef, (snapshot) => {
            const blockedIds = new Set(snapshot.docs.map(doc => doc.id));
            setBlockedUserIds(blockedIds);
        });

        const chatsRef = collection(db, 'chats');
        const q = query(chatsRef, where('participants', 'array-contains', currentUser.uid), orderBy('lastMessageTimestamp', 'desc'));
        const unsubChats = onSnapshot(q, (snapshot) => {
            const conversations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRawChats(conversations);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching chat list: ", error);
            showMessage("Could not load conversations.");
            setLoading(false);
        });
        return () => {
            unsubBlocks();
            unsubChats();
        };
    }, [currentUser]); // Dependencies simplified for stability

    // Effect to filter the chat list
    useEffect(() => {
        if (!loading && currentUser) {
            const filtered = rawChats.filter(chat => {
                const isHidden = chat.hiddenFor?.includes(currentUser.uid);
                if (isHidden) return false;
                const otherParticipantUid = chat.participants.find(uid => uid !== currentUser.uid);
                const isBlocked = otherParticipantUid && blockedUserIds.has(otherParticipantUid);
                if (isBlocked) return false;
                return true;
            });
            setFilteredChats(filtered);
        }
    }, [rawChats, blockedUserIds, loading, currentUser]);

    // --- TIMESTAMP FIX: New effect to listen for real-time profile updates ---
    useEffect(() => {
        const participantIds = new Set(
            filteredChats.map(chat => chat.participants.find(uid => uid !== currentUser.uid)).filter(Boolean)
        );

        const unsubscribers = {};

        participantIds.forEach(id => {
            const userDocRef = doc(db, 'creators', id);
            unsubscribers[id] = onSnapshot(userDocRef, (docSnap) => {
                if (docSnap.exists()) {
                    setLiveParticipantProfiles(prevProfiles => ({
                        ...prevProfiles,
                        [id]: docSnap.data()
                    }));
                }
            });
        });

        return () => {
            Object.values(unsubscribers).forEach(unsub => unsub());
        };
    }, [filteredChats, currentUser]);


    const handleChatSelect = (chatId) => {
        setSelectedChatId(chatId);
        setActiveScreen('ChatMessageScreen');
    };

    const handleDeleteChat = (chatId, event) => {
        event.stopPropagation();
        setConfirmationTitle("Delete Conversation");
        setConfirmationMessage("Are you sure you want to permanently delete this conversation from your list? This action cannot be undone.");
        setOnConfirmationAction(() => async () => {
            try {
                const hideChatFunction = httpsCallable(functions, 'hideChatForUser');
                await hideChatFunction({ chatId: chatId });
                showMessage("Conversation deleted.");
            } catch (error) {
                console.error("Error deleting chat:", error);
                showMessage("Could not delete conversation. Please try again.");
            }
        });
        setShowConfirmationModal(true);
    };

    return (
    <div className="screenContainer">
        <div className="dashboardSection">
            <p className="dashboardSectionTitle" style={{ marginBottom: '20px' }}>Conversations</p>

           {loading ? (
                <p className="dashboardItem">Loading conversations...</p>
            ) : filteredChats.length === 0 ? (
                <p className="dashboardItem">You have no conversations yet. Find a user and press the 'Message' button to start a chat!</p>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {filteredChats.map(chat => {
                        const otherParticipantUid = chat.participants.find(uid => uid !== currentUser.uid);
                        if (!otherParticipantUid) return null;
                        
                        const staleUserDetails = chat.participantDetails?.[otherParticipantUid] || {};
                        const liveUserDetails = liveParticipantProfiles[otherParticipantUid] || {};
                        const finalUserDetails = { ...staleUserDetails, ...liveUserDetails };

                        // --- DEFINITIVE FIX: Check the new 'unreadBy' array ---
                        const isUnread = chat.unreadBy?.includes(currentUser.uid);

                        return (
                            <div 
                                key={chat.id} 
                                onClick={() => handleChatSelect(chat.id)}
                                onMouseEnter={() => setHoveredChatId(chat.id)}
                                onMouseLeave={() => setHoveredChatId(null)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '15px', padding: '10px',
                                    backgroundColor: '#2A2A2A', borderRadius: '8px', cursor: 'pointer',
                                    border: '1px solid #3A3A3A', position: 'relative'
                                }}
                            >
                                <button 
                                    onClick={(e) => handleDeleteChat(chat.id, e)}
                                    className="button"
                                    style={{
                                        position: 'absolute', top: '50%', right: '10px',
                                        transform: 'translateY(-50%)', background: 'transparent',
                                        padding: '8px', margin: 0, zIndex: 2
                                    }}
                                    title="Delete this conversation"
                                >
                                    <svg fill={hoveredChatId === chat.id ? '#F44336' : '#616161'} viewBox="0 0 24 24" style={{ width: '22px', height: '22px', transition: 'fill 0.2s' }}>
                                        <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path>
                                    </svg>
                                </button>

                                <div style={{position: 'relative', flexShrink: 0}}>
                                    <img 
                                        src={finalUserDetails.profilePictureUrl || 'https://placehold.co/100x100/555/FFF?text=P'} 
                                        alt={finalUserDetails.creatorName}
                                        style={{ width: '50px', height: '50px', borderRadius: '50%', objectFit: 'cover' }}
                                    />
                                    {/* --- DEFINITIVE FIX: Show green dot ONLY when online --- */}
                                    {finalUserDetails.isOnline && (
                                        <div style={{ position: 'absolute', bottom: '1px', right: '1px', width: '12px', height: '12px', backgroundColor: '#4CAF50', borderRadius: '50%', border: '2px solid #2A2A2A' }}></div>
                                    )}
                                </div>
                                
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <p style={{ margin: 0, fontWeight: 'bold', color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {finalUserDetails.creatorName || 'Unknown User'}
                                        </p>
                                        {/* --- DEFINITIVE FIX: Use the 'isUnread' variable --- */}
                                        {isUnread && (
                                            <span style={{
                                                backgroundColor: '#FFD700',
                                                borderRadius: '50%',
                                                width: '10px',
                                                height: '10px',
                                                flexShrink: 0
                                            }}></span>
                                        )}
                                    </div>
                                    {/* --- TYPING INDICATOR FEATURE --- */}
                                    {chat.typing?.[otherParticipantUid] ? (
                                        <p style={{
                                            margin: '4px 0 0', color: '#FFD700', fontSize: '14px',
                                            fontStyle: 'italic', fontWeight: 'bold'
                                        }}>
                                            is typing...
                                        </p>
                                    ) : (
                                        <p style={{
                                            margin: '4px 0 0', color: isUnread ? '#FFFFFF' : '#AAA',
                                            fontSize: '14px', whiteSpace: 'nowrap', overflow: 'hidden',
                                            textOverflow: 'ellipsis', fontWeight: isUnread ? 'bold' : 'normal'
                                        }}>
                                            {chat.lastMessage?.text || "No messages yet..."}
                                        </p>
                                    )}
                                </div>

                                <div style={{textAlign: 'right', marginLeft: 'auto', paddingRight: '40px', flexShrink: 0}}>
                                     <span style={{ color: '#888', fontSize: '12px' }}>
                                        {formatTimestamp(chat.lastMessageTimestamp)}
                                    </span>
                                    {/* --- DEFINITIVE FIX: Show 'Online' OR the formatted last seen time --- */}
                                    <p style={{ margin: '4px 0 0', color: finalUserDetails.isOnline ? '#4CAF50' : '#888', fontSize: '12px' }}>
                                        {finalUserDetails.isOnline ? 'Online' : formatLastSeen(finalUserDetails.lastSeen)}
                                    </p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
             {/* --- UI FIX: The home button has been REMOVED --- */}
        </div>
    </div>
    );
};

export default ChatListScreen;