// src/components/ChatMessageScreen.jsx

import React, { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc } from 'firebase/firestore';
import { functions } from '../firebase';
import { httpsCallable } from 'firebase/functions';

const ChatMessageScreen = ({
    chatId, currentUser, creatorProfile, setActiveScreen, showMessage, setSelectedUserId,
    setShowConfirmationModal, setConfirmationTitle, setConfirmationMessage, setOnConfirmationAction
}) => {
    const [messages, setMessages] = useState([]);
    const [chatDetails, setChatDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef(null);
    const longPressTimer = useRef();

    const [newMessage, setNewMessage] = useState('');
    const [otherParticipantProfile, setOtherParticipantProfile] = useState(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    
    const [isSearchVisible, setIsSearchVisible] = useState(false);
    const [searchText, setSearchText] = useState('');
    const [filteredMessages, setFilteredMessages] = useState([]);
    
    const [menuState, setMenuState] = useState({ visible: false, x: 0, y: 0, message: null });
    const [replyingToMessage, setReplyingToMessage] = useState(null);

  // --- NEW: ReactionPills Component ---
    // Renders the reaction emojis below a message bubble.
    const ReactionPills = ({ reactions, messageId }) => {
        if (!reactions || Object.keys(reactions).length === 0) return null;

        return (
            <div style={{ display: 'flex', gap: '4px', marginTop: '4px', paddingLeft: '5px' }}>
                {Object.entries(reactions).map(([emoji, uids]) => {
                    if (uids.length === 0) return null;
                    const hasReacted = uids.includes(currentUser.uid);
                    return (
                        <div key={emoji}
                             style={{
                                 display: 'flex', alignItems: 'center', gap: '3px',
                                 background: hasReacted ? 'rgba(135, 206, 235, 0.15)' : '#4A4A4A',
                                 color: '#FFF',
                                 borderRadius: '12px', padding: '2px 8px', fontSize: '13px'
                             }}>
                            <span>{emoji}</span>
                            <span>{uids.length}</span>
                        </div>
                    );
                })}
            </div>
        );
    };

    const handleViewProfile = () => { if (otherParticipantUid) { setSelectedUserId(otherParticipantUid); setActiveScreen('UserProfile'); } };

    const formatLastSeen = (timestamp) => {
        if (!timestamp) return 'Status unknown';
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            const now = new Date();
            const diffInSeconds = Math.floor((now - date) / 1000);
            if (diffInSeconds < 120) return 'Online';
            const diffInMinutes = Math.floor(diffInSeconds / 60);
            if (diffInMinutes < 60) return `Active ${diffInMinutes}m ago`;
            const diffInHours = Math.floor(diffInMinutes / 60);
            if (diffInHours < 24) return `Active ${diffInHours}h ago`;
            return `Active on ${date.toLocaleDateString()}`;
        } catch (e) { return 'Status unknown'; }
    };

    const handleAddEmoji = (emoji) => setNewMessage(prev => prev + emoji);
    const emojis = ['👍', '👎', '❤️', '😂', '🔥', '😢', '😡', '✅', '❌', '🙏'];

     const prevMessagesLength = useRef(0);
    const scrollContainerRef = useRef(null); // <-- NEW: Ref for the scroll container

    // --- FINAL, DEFINITIVE SCROLL FIX ---
    useLayoutEffect(() => {
        const scrollContainer = scrollContainerRef.current;
        if (!scrollContainer) return;

        // Case 1: Initial Load.
        // Manually setting scrollTop to scrollHeight is the most reliable method.
        // It happens before the browser paints, so the user never sees the top.
        if (messages.length > 0 && prevMessagesLength.current === 0) {
            scrollContainer.scrollTop = scrollContainer.scrollHeight;
        }
        // Case 2: New Message Added.
        // For subsequent new messages, scrollIntoView is reliable and gives a smooth effect.
        else if (messages.length > prevMessagesLength.current) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }

        // Update the ref for the next render cycle.
        prevMessagesLength.current = messages.length;
    }, [messages]);

    // This stable effect now only handles fetching data, which prevents the "flicker".
    useEffect(() => {
        if (!chatId) return;
        setLoading(true);
        const chatDocRef = doc(db, 'chats', chatId);
        const unsubscribeChatDetails = onSnapshot(chatDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setChatDetails(docSnap.data());
            } else {
                showMessage("Chat not found.");
                setActiveScreen('ChatList');
            }
        });
        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const q = query(messagesRef, orderBy('timestamp', 'asc'));
        const unsubscribeMessages = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMessages(msgs);
            setLoading(false);
        });
        return () => {
            unsubscribeChatDetails();
            unsubscribeMessages();
        };
    }, [chatId]);

    // Effect for fetching the other participant's profile details
    useEffect(() => {
        const participantId = chatDetails?.participants.find(uid => uid !== currentUser?.uid);
        if (!participantId) return;
        const profileRef = doc(db, 'creators', participantId);
        const unsubscribeProfile = onSnapshot(profileRef, docSnap => setOtherParticipantProfile(docSnap.exists() ? docSnap.data() : null));
        return () => unsubscribeProfile();
    }, [chatDetails, currentUser]);
    
    // Effect for client-side message filtering (for the search feature)
    useEffect(() => { 
        setFilteredMessages(searchText.trim() === '' ? messages : messages.filter(msg => !msg.isDeleted && msg.text.toLowerCase().includes(searchText.toLowerCase()))); 
    }, [messages, searchText]);

        // --- "MARK AS READ" LOGIC ---
useEffect(() => {
    // This effect runs when the component loads.
    // It calls the cloud function to mark this chat as read.
    if (chatId) {
        const markAsRead = httpsCallable(functions, 'markChatAsRead');
        markAsRead({ chatId: chatId }).catch(error => {
            console.error("Could not mark chat as read:", error);
        });
    }
}, [chatId]); // It runs only when the chatId changes.

    // --- FIX #2: THE FULLY REWRITTEN handleSendMessage FUNCTION ---
    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (newMessage.trim() === '' || isSending) return;

        setIsSending(true);

        // This object no longer needs serverTimestamp, the backend will handle it.
        const messagePayload = {
            text: newMessage,
            senderId: currentUser.uid,
            senderName: creatorProfile.creatorName || "NVA User",
        };

        if (replyingToMessage) {
            messagePayload.replyTo = {
                id: replyingToMessage.id,
                text: replyingToMessage.text,
                senderId: replyingToMessage.senderId,
                senderName: replyingToMessage.senderName
            };
        }

        try {
            // This is the secure Cloud Function call that replaces the direct DB write.
            const sendChatMessageFunction = httpsCallable(functions, 'sendChatMessagePrivate');
            await sendChatMessageFunction({
                chatId: chatId,
                messageData: messagePayload
            });

            // Optimistically clear the input fields on successful function call.
            setNewMessage('');
            setReplyingToMessage(null);
            setShowEmojiPicker(false);
        } catch (error) {
            console.error("Error sending message via Cloud Function:", error);
            showMessage(error.message || "Failed to send message. You may have been blocked or removed from this chat.");
        } finally {
            setIsSending(false);
        }
    };

    const openMenu = (x, y, message) => {
        const menuWidth = 320;
        const screenWidth = window.innerWidth;
        const finalX = Math.max((menuWidth / 2) + 20, Math.min(x, screenWidth - (menuWidth / 2) - 20));
        setMenuState({ visible: true, x: finalX, y, message });
    };

    const handleCloseMenu = () => setMenuState({ visible: false, x: 0, y: 0, message: null });
    const handleTouchStart = (e, msg) => { longPressTimer.current = setTimeout(() => { e.preventDefault(); openMenu(e.touches[0].clientX, e.touches[0].clientY, msg); }, 500); };
    const handleTouchEnd = () => clearTimeout(longPressTimer.current);
    const handleContextMenu = (e, msg) => { e.preventDefault(); openMenu(e.clientX, e.clientY, msg); };

    const handleReaction = async (messageToReactTo, emoji) => {
        if (!chatId || !messageToReactTo?.id || !emoji) {
            showMessage("Error: Cannot react to message.");
            return;
        }
        try {
            const reactToMessageFunction = httpsCallable(functions, 'reactToChatMessagePrivate');
            await reactToMessageFunction({
                chatId: chatId,
                messageId: messageToReactTo.id,
                emoji: emoji,
                senderId: currentUser.uid
            });
        } catch (error) {
            console.error("Error reacting to message:", error);
            showMessage(error.message || "Could not add reaction.");
        }
    };

    const handleMenuAction = (action, emoji = null) => {
        const messageToActOn = menuState.message;
        handleCloseMenu();

        if (action === 'delete') {
            setConfirmationTitle("Delete Message");
            setConfirmationMessage("Are you sure you want to permanently delete this message? This cannot be undone.");
            setOnConfirmationAction(() => async () => {
                if (!chatId || !messageToActOn?.id) {
                    showMessage("Error: Cannot identify the message to delete."); return;
                }
                try {
                    const deleteMessageFunction = httpsCallable(functions, 'deleteChatMessagePrivate');
                    await deleteMessageFunction({ chatId: chatId, messageId: messageToActOn.id });
                    showMessage("Message deleted.");
                } catch (error) {
                    console.error("Error calling deleteChatMessagePrivate function:", error);
                    showMessage(error.message || "You do not have permission to delete this.");
                }
            });
            setShowConfirmationModal(true);
        } else if (action === 'reply') {
            setReplyingToMessage(messageToActOn);
        } else if (action === 'react') {
            handleReaction(messageToActOn, emoji);
        }
    };
    
    const otherParticipantUid = chatDetails?.participants.find(uid => uid !== currentUser?.uid);
    const finalOtherUserDetails = { ...(chatDetails?.participantDetails?.[otherParticipantUid] || {}), ...(otherParticipantProfile || {}) };

    return (
        <div className="screenContainer" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header */}
            <div style={{ padding: '10px', backgroundColor: '#1A1A1A', display: 'flex', flexDirection: 'column', gap: '10px', borderBottom: '1px solid #3A3A3A', flexShrink: 0 }}>
                 <div style={{display: 'flex', alignItems: 'center', width: '100%'}}>
                    <button onClick={() => setActiveScreen('ChatList')} className="button" style={{ margin: 0, padding: '8px', background: 'transparent', alignSelf: 'center' }}>
                        <svg fill="#FFF" viewBox="0 0 24 24" style={{ width: '24px', height: '24px' }}><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"></path></svg>
                    </button>
                    <div onClick={handleViewProfile} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '15px', cursor: 'pointer', minWidth: 0 }}>
                        <div style={{position: 'relative'}}>
                            <img src={finalOtherUserDetails.profilePictureUrl || 'https://placehold.co/100x100/555/FFF?text=P'} alt="Profile" style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                            {finalOtherUserDetails.isOnline && ( <div style={{ position: 'absolute', bottom: '0px', right: '0px', width: '12px', height: '12px', backgroundColor: '#4CAF50', borderRadius: '50%', border: '2px solid #1A1A1A' }}></div> )}
                        </div>
                        <div style={{flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <p style={{ margin: 0, color: '#FFF', fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{finalOtherUserDetails.creatorName || 'Loading...'}</p>
                            <p style={{ margin: '2px 0 0', color: '#888', fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{finalOtherUserDetails.isOnline ? 'Online' : formatLastSeen(finalOtherUserDetails.lastSeen)}</p>
                        </div>
                    </div>
                    <button onClick={() => setIsSearchVisible(!isSearchVisible)} className="button" style={{ margin: 0, padding: '8px', background: 'transparent' }}>
                        <svg fill={isSearchVisible ? '#FFD700' : '#FFF'} viewBox="0 0 24 24" style={{ width: '24px', height: '24px' }}><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"></path></svg>
                    </button>
                </div>
                {isSearchVisible && (
                    <div style={{ padding: '0 10px 10px 10px' }}>
                        <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Search in conversation..." className="formInput" style={{width: '100%', borderRadius: '18px'}} />
                    </div>
                )}
            </div>

            {/* Message Area */}
            <div ref={scrollContainerRef} style={{ flex: 1, overflowY: 'auto', padding: '15px' }} onClick={handleCloseMenu}>
                 {loading ? <p style={{ textAlign: 'center', color: '#AAA' }}>Loading messages...</p> : (
                    <>
                       {filteredMessages.map(msg => {
                            const isMyMessage = msg.senderId === currentUser.uid;
                            return (
                                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMyMessage ? 'flex-end' : 'flex-start', marginBottom: '15px' }}>
                                    {msg.replyTo && (
                                <div style={{ padding: '5px 12px', marginBottom: '-2px', backgroundColor: 'rgba(135, 206, 235, 0.15)', borderRadius: '12px 12px 0 0', border: '1px solid rgba(135, 206, 235, 0.3)', borderBottom: 'none', maxWidth: '65%', alignSelf: isMyMessage ? 'flex-end' : 'flex-start' }}>
                                <p style={{ margin: 0, fontSize: '11px', color: '#FFD700', fontWeight: 'bold' }}>Replying to {msg.replyTo.senderName}</p>
                                <p style={{ margin: '2px 0 0', fontSize: '12px', color: '#FFFFFF', fontStyle: 'italic', opacity: 0.8, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{msg.replyTo.text}</p>
                                </div>
                                )}
                                    <div onTouchStart={(e) => !msg.isDeleted && handleTouchStart(e, msg)} onTouchEnd={handleTouchEnd} onContextMenu={(e) => !msg.isDeleted && handleContextMenu(e, msg)} >
                                        <div style={{
                                            maxWidth: '100%', padding: '10px 15px',
                                            borderRadius: msg.replyTo ? (isMyMessage ? '18px 4px 18px 18px' : '4px 18px 18px 18px') : '18px',
                                            backgroundColor: menuState.message?.id === msg.id ? '#5A5A5A' : (isMyMessage ? (msg.isDeleted ? '#555' : '#FFD700') : '#3A3A3A'),
                                            color: isMyMessage ? '#0A0A0A' : '#FFF', fontStyle: msg.isDeleted ? 'italic' : 'normal',
                                            opacity: msg.isDeleted ? 0.7 : 1, transition: 'background-color 0.2s',
                                        }}>
                                            {msg.isDeleted ? "This message was deleted" : msg.text}
                                        </div>
                                    </div>
                                    {/* --- FIX #1: THE NEW REACTION PILLS UI IS ADDED HERE --- */}
                                    <ReactionPills reactions={msg.reactions} messageId={msg.id} />
                                </div>
                            );
                        })}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>
            
            {/* Context Menu */}
            {menuState.visible && (
                <div style={{
                    position: 'fixed', top: menuState.y, left: menuState.x,
                    zIndex: 100, transform: 'translate(-50%, -120%)',
                    background: 'rgba(40, 40, 40, 0.7)',
                    backdropFilter: 'blur(10px)',
                    borderRadius: '20px', padding: '5px',
                    display: 'flex', alignItems: 'center', gap: '5px',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    boxShadow: '0 4px 30px rgba(0,0,0,0.1), 0 0 20px 2px rgba(138, 43, 226, 0.3)'
                }}>
                    {['👍', '❤️', '😂', '💯', '🙏'].map(emoji => (
                         <button key={emoji} className="button" onClick={() => handleMenuAction('react', emoji)} style={{background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', padding: '6px'}}>{emoji}</button>
                    ))}
                    <div style={{borderLeft: '1px solid rgba(255, 255, 255, 0.2)', height: '25px', margin: '0 5px'}}></div>
                    <button title="Reply" className="button" onClick={() => handleMenuAction('reply')} style={{background: 'none', border: 'none', cursor: 'pointer', padding: '8px'}}>
                        <svg fill="#FFF" viewBox="0 0 24 24" style={{width: '20px', height: '20px'}}><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"></path></svg>
                    </button>
                    {menuState.message.senderId === currentUser.uid && (
                        <button title="Delete Message" className="button" onClick={() => handleMenuAction('delete')} style={{background: 'none', border: 'none', cursor: 'pointer', padding: '8px'}}>
                            <svg fill="#FF5C5C" viewBox="0 0 24 24" style={{width: '20px', height: '20px'}}><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"></path></svg>
                        </button>
                    )}
                </div>
            )}
            
            {/* Input Form */}
            <div style={{ borderTop: '1px solid #3A3A3A', flexShrink: 0, background: '#1A1A1A' }}>
                {replyingToMessage && (
                    <div style={{padding: '8px 15px', backgroundColor: '#2A2A2A', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                        <div>
                            <p style={{margin: 0, fontSize: '12px', color: '#AAA', fontWeight: 'bold'}}>Replying to {replyingToMessage.senderName}</p>
                            <p style={{margin: '2px 0 0', fontSize: '13px', color: '#CCC', fontStyle: 'italic', opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{replyingToMessage.text.substring(0, 80)}...</p>
                        </div>
                        <button onClick={() => setReplyingToMessage(null)} style={{background: 'transparent', border: 'none', color: '#AAA', cursor: 'pointer', fontSize: '20px'}}>&times;</button>
                    </div>
                )}
               {showEmojiPicker && (
                    <div className="emojiPicker" style={{
                        // --- Core UI from your example ---
                        background: 'rgba(40, 40, 80, 0.3)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                        borderRadius: '50px',
                        border: '1px solid rgba(255, 255, 255, 0.15)',

                        // --- Scrolling and Layout ---
                        display: 'flex',
                        alignItems: 'center',
                        gap: '20px', // Space between emojis
                        padding: '8px 25px',
                        margin: '0 10px 10px 10px',
                        overflowX: 'auto', // CRITICAL: This enables side-scrolling
                        whiteSpace: 'nowrap', // Prevents emojis from wrapping
                        scrollbarWidth: 'none', // Hides the scrollbar for Firefox
                        msOverflowStyle: 'none' // Hides the scrollbar for IE/Edge
                        // Note: A CSS pseudo-selector is needed to hide the scrollbar on Webkit (Chrome/Safari)
                        // but this inline style ensures functionality and a clean look for most users.
                    }}>
                        {emojis.map(e => (
                             <button key={e} className="button" onClick={() => handleAddEmoji(e)} style={{
                                background: 'none', border: 'none', fontSize: '26px', cursor: 'pointer', padding: '0',
                                transform: 'scale(1)', transition: 'transform 0.15s ease'
                            }}
                            onMouseOver={e => e.currentTarget.style.transform = 'scale(1.2)'}
                            onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                {e}
                            </button>
                        ))}
                    </div>
                )}
                <form onSubmit={handleSendMessage} style={{ display: 'flex', alignItems: 'center', padding: '10px' }}>
                    <button type="button" className="button" style={{ marginRight: '10px', background: 'transparent', padding: '8px' }} onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
                        <svg fill="#FFF" viewBox="0 0 24 24" style={{ width: '24px', height: '24px' }}><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"></path></svg>
                    </button>
                    <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Type a message..." className="formInput" style={{ flex: 1, marginRight: '10px', borderRadius: '20px' }} disabled={isSending} onFocus={() => setShowEmojiPicker(false)} />
                    <button type="submit" className="button" style={{ borderRadius: '50%', width: '44px', height: '44px', padding: 0 }} disabled={!newMessage.trim() || isSending}>
                       <svg fill={isSending ? "#555" : "#0A0A0A"} viewBox="0 0 24 24" style={{ width: '24px', height: '24px', margin: 'auto' }}><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ChatMessageScreen;