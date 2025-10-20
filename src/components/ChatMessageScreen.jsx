// src/components/ChatMessageScreen.jsx

import React, { useState, useEffect, useRef } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc } from 'firebase/firestore';

const ChatMessageScreen = ({ chatId, currentUser, creatorProfile, setActiveScreen, showMessage }) => {
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [chatDetails, setChatDetails] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef(null);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false); // <-- ADD STATE FOR EMOJI PICKER

    // --- ADD EMOJI LOGIC ---
    const handleAddEmoji = (emoji) => setNewMessage(prev => prev + emoji);
    const emojis = ['👍', '👎', '❤️', '😂', '🔥', '😢', '😡', '✅', '❌', '🙏'];
    
    // Effect for scrolling to the bottom of the chat
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Effect for fetching chat details and messages
    useEffect(() => {
        if (!chatId || !currentUser) {
            showMessage("Could not open chat. Please try again.");
            setActiveScreen('ChatList');
            return;
        }

        let unsubscribeMessages = () => {};
        setLoading(true);

        const fetchChatDetails = async () => {
            const chatDocRef = doc(db, 'chats', chatId);
            const docSnap = await getDoc(chatDocRef);
            if (docSnap.exists()) {
                setChatDetails(docSnap.data());
            } else {
                 showMessage("Chat not found.");
                 setActiveScreen('ChatList');
            }
        };
        fetchChatDetails();

        const messagesRef = collection(db, 'chats', chatId, 'messages');
        const q = query(messagesRef, orderBy('timestamp', 'asc'));

        unsubscribeMessages = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setMessages(msgs);
            setLoading(false);
        });

        return () => {
            unsubscribeMessages();
        };

    }, [chatId, currentUser, setActiveScreen, showMessage]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (newMessage.trim() === '' || isSending) return;
        
        setIsSending(true);

        const messagePayload = {
            text: newMessage.trim(),
            senderId: currentUser.uid,
            timestamp: serverTimestamp(),
            senderName: creatorProfile.creatorName,
            senderProfilePicture: creatorProfile.profilePictureUrl || null
        };
        
        try {
            const messagesRef = collection(db, 'chats', chatId, 'messages');
            await addDoc(messagesRef, messagePayload);

            const chatDocRef = doc(db, 'chats', chatId);
            await updateDoc(chatDocRef, {
                lastMessage: {
                    text: messagePayload.text,
                    senderId: messagePayload.senderId,
                },
                lastMessageTimestamp: serverTimestamp()
            });

            setNewMessage('');
            setShowEmojiPicker(false); // Hide picker on send
        } catch (error) {
            console.error("Error sending message:", error);
            showMessage("Failed to send message.");
        } finally {
            setIsSending(false);
        }
    };
    
    const otherParticipantUid = chatDetails?.participants.find(uid => uid !== currentUser?.uid);
    const otherUserDetails = chatDetails?.participantDetails?.[otherParticipantUid] || {};


    return (
        <div className="screenContainer" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 120px)' /* Adjust based on your header/nav heights */ }}>
            
            {/* --- Chat Header --- */}
            <div style={{ padding: '10px', backgroundColor: '#1A1A1A', display: 'flex', alignItems: 'center', gap: '15px', borderBottom: '1px solid #3A3A3A', flexShrink: 0 }}>
                <button onClick={() => setActiveScreen('ChatList')} className="button" style={{margin: 0, padding: '8px', background: 'transparent'}}>
                    <svg fill="#FFF" viewBox="0 0 24 24" style={{ width: '24px', height: '24px' }}><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"></path></svg>
                </button>
                 <img src={otherUserDetails.profilePictureUrl || 'https://placehold.co/100x100/555/FFF?text=P'} alt="Profile" style={{width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover'}} />
                <p style={{ margin: 0, color: '#FFF', fontWeight: 'bold' }}>
                    {otherUserDetails.creatorName || 'Loading...'}
                </p>
            </div>

            {/* --- Messages Area --- */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '15px' }} onClick={() => setShowEmojiPicker(false)} /* Hide picker on message area click */>
                {loading ? <p style={{ textAlign: 'center', color: '#AAA' }}>Loading messages...</p> : (
                    <>
                        {messages.map(msg => (
                            <div key={msg.id} style={{ display: 'flex', justifyContent: msg.senderId === currentUser.uid ? 'flex-end' : 'flex-start', marginBottom: '10px' }}>
                                <div style={{ maxWidth: '70%', padding: '10px 15px', borderRadius: '18px', backgroundColor: msg.senderId === currentUser.uid ? '#FFD700' : '#3A3A3A', color: msg.senderId === currentUser.uid ? '#0A0A0A' : '#FFF' }}>
                                    {msg.text}
                                </div>
                            </div>
                        ))}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>

            {/* --- MODIFIED Message Input Form --- */}
            <div style={{ borderTop: '1px solid #3A3A3A', flexShrink: 0, background: '#1A1A1A' }}>
                {showEmojiPicker && (
                    <div className="emojiPicker" style={{ padding: '10px', display: 'flex', justifyContent: 'space-around', background: '#2A2A2A' }}>
                         {emojis.map(e => <button key={e} className="emojiButton" onClick={() => handleAddEmoji(e)}>{e}</button>)}
                    </div>
                )}
                <form onSubmit={handleSendMessage} style={{ display: 'flex', alignItems: 'center', padding: '10px' }}>
                     {/* Emoji Toggle Button */}
                    <button type="button" className="button" style={{ marginRight: '10px', background: 'transparent', padding: '8px' }} onClick={() => setShowEmojiPicker(!showEmojiPicker)}>
                         <svg fill="#FFF" viewBox="0 0 24 24" style={{ width: '24px', height: '24px' }}><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"></path></svg>
                    </button>
                    <input
                        type="text"
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Type a message..."
                        className="formInput"
                        style={{ flex: 1, marginRight: '10px', borderRadius: '20px' }}
                        disabled={isSending}
                        onFocus={() => setShowEmojiPicker(false)} // Hide picker on text input focus
                    />
                    <button type="submit" className="button" style={{ borderRadius: '50%', width: '44px', height: '44px', padding: 0 }} disabled={!newMessage.trim() || isSending}>
                       <svg fill={isSending ? "#555" : "#0A0A0A"} viewBox="0 0 24 24" style={{ width: '24px', height: '24px', margin: 'auto' }}><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"></path></svg>
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ChatMessageScreen;