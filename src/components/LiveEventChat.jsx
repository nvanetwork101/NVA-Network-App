// src/components/LiveEventChat.jsx

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, functions, httpsCallable, collection, query, orderBy, onSnapshot } from '../firebase';
import ConfirmationModal from './ConfirmationModal';
import RoleBadge from './RoleBadge'; // <-- ADD THIS IMPORT

const timeAgo = (date) => {
    if (!date) return '';
    const seconds = Math.floor((new Date() - date.toDate()) / 1000);
    let interval = seconds / 31536000; if (interval > 1) return Math.floor(interval) + "y";
    interval = seconds / 2592000; if (interval > 1) return Math.floor(interval) + "mo";
    interval = seconds / 86400; if (interval > 1) return Math.floor(interval) + "d";
    interval = seconds / 3600; if (interval > 1) return Math.floor(interval) + "h";
    interval = seconds / 60; if (interval > 1) return Math.floor(interval) + "m";
    return Math.floor(seconds) + "s ago";
};

    const getUserColor = (userId) => {
    if (!userId) return '#FFFFFF'; // A default color
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        const char = userId.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0; // Convert to 32bit integer
    }
    const hue = Math.abs(hash % 360);
    // Using HSL for a vibrant, consistent palette. Saturation: 75%, Lightness: 60%.
    return `hsl(${hue}, 75%, 60%)`;
};

const ChatMessage = ({ message, currentUser, creatorProfile, onReply, onDelete, onMuteToggle, isMuted, isReply = false }) => {
    // This correctly determines if the VIEWER is a moderator for enabling actions.
    const isViewerModerator = creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority';
    const isMessageAuthor = currentUser?.uid === message.userId;
    const canDelete = isViewerModerator || isMessageAuthor;
    const canMute = isViewerModerator && !isMessageAuthor;

    // THIS IS THE FIX: This checks the role of the message AUTHOR for styling.
    const isAuthorModerator = message.authorRole === 'admin' || message.authorRole === 'authority';
    const messageClass = isAuthorModerator ? "chatMessageItem moderator" : "chatMessageItem";

    return (
        <div className={messageClass} style={{ marginLeft: isReply ? '40px' : '0', transition: 'margin-left 0.2s ease-in-out' }}>
            <img src={message.userProfilePicture || 'https://placehold.co/80x80/555/FFF?text=P'} alt={message.userName} className="commentPfp" />
            <div className="commentContent">
                <div className="commentHeader">
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <span className="commentAuthor" style={{ color: getUserColor(message.userId) }}>{message.userName}</span>
                        {/* For live chat, we only have the role, so we pass a partial profile */}
                        <RoleBadge profile={{ role: message.authorRole }} />
                    </div>
                    <span className="commentTimestamp">{message.createdAt ? timeAgo(message.createdAt) : '...'}</span>
                </div>
                {message.replyTo && <p style={{fontSize: '12px', color: '#AAA', fontStyle: 'italic', marginBottom: '5px'}}>Replying to {message.replyTo.userName}</p>}
                <p className="commentText">{message.text}</p>
                <div className="commentActions">
                    <button className="replyButton" onClick={() => onReply(message)}>Reply</button>
                    {canDelete && (
                        <button className="replyButton" style={{ color: '#DC3545', marginLeft: '10px' }} onClick={() => onDelete(message)}>
                            Delete
                        </button>
                    )}
                    {canMute && (
                        <button className="replyButton" style={{ color: isMuted ? '#4ade80' : '#FFD700', marginLeft: '10px' }} onClick={() => onMuteToggle(message)}>
                            {isMuted ? 'Unmute' : 'Mute'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

function LiveEventChat({ eventId, eventDetails, currentUser, creatorProfile, showMessage }) {
    const [messages, setMessages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newMessageText, setNewMessageText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [replyingTo, setReplyingTo] = useState(null);
    const [mutedUsers, setMutedUsers] = useState(new Set());
    const [modalConfig, setModalConfig] = useState(null);
    const chatEndRef = useRef(null);
    const emojis = ['👍', '👎', '❤️', '😂', '🔥', '😢', '😡'];

        const [expandedReplies, setExpandedReplies] = useState(new Set());

    const { topLevelMessages, repliesMap } = useMemo(() => {
        const topLevel = [];
        const replies = new Map();
        messages.forEach(message => {
            if (message.replyTo && message.replyTo.id) {
                const parentId = message.replyTo.id;
                if (!replies.has(parentId)) {
                    replies.set(parentId, []);
                }
                replies.get(parentId).push(message);
            } else {
                topLevel.push(message);
            }
        });
        // Sort replies by oldest first for correct conversation flow
        replies.forEach(replyList => {
            if (replyList[0]?.createdAt?.toDate) { // Ensure createdAt is a Firestore Timestamp
                replyList.sort((a, b) => a.createdAt.toDate() - b.createdAt.toDate());
            }
        });
        return { topLevelMessages: topLevel, repliesMap: replies };
    }, [messages]);

    const toggleReplies = (messageId) => {
        setExpandedReplies(prev => {
            const newSet = new Set(prev);
            if (newSet.has(messageId)) {
                newSet.delete(messageId);
            } else {
                newSet.add(messageId);
            }
            return newSet;
        });
    };

    useEffect(() => {
        if (!eventId || !currentUser) return;
        setLoading(true);
        const messagesRef = collection(db, `events/${eventId}/chatMessages`);
        const q = query(messagesRef, orderBy('createdAt', 'asc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setMessages(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        }, (error) => {
            console.error("Error listening to chat messages:", error);
            showMessage("Could not load chat messages.");
            setLoading(false);
        });
        return () => unsubscribe();
    }, [eventId, currentUser]);

    useEffect(() => {
        const isModerator = creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority';
        if (!eventId || !currentUser || !isModerator) {
            setMutedUsers(new Set()); // Ensure muted list is empty for non-mods
            return;
        }

        const mutedRef = collection(db, `events/${eventId}/mutedUsers`);
        const unsubscribe = onSnapshot(mutedRef, (snapshot) => {
            const mutedIds = snapshot.docs.map(doc => doc.id);
            setMutedUsers(new Set(mutedIds));
        }, (error) => {
            // Even with the check, include error handling in case of intermittent permission issues.
            console.error("Moderator failed to listen to muted users:", error);
            showMessage("Could not load moderator data.");
        });

        return () => unsubscribe();
    }, [eventId, currentUser, creatorProfile]);

    useEffect(() => {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);
    
    const handleAddEmoji = (emoji) => setNewMessageText(prev => prev + emoji);

    const handleSubmitMessage = async () => {
        if (!newMessageText.trim()) return;
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            const postChatMessageFunction = httpsCallable(functions, 'postChatMessage');
            await postChatMessageFunction({
                eventId: eventId,
                text: newMessageText,
                replyTo: replyingTo ? { id: replyingTo.id, userName: replyingTo.userName, userId: replyingTo.userId } : null
            });
            setNewMessageText('');
            setReplyingTo(null);
        } catch (error) {
            console.error("Error posting chat message:", error);
            showMessage(`Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteMessage = (message) => {
        setModalConfig({
            title: "Delete Message",
            message: `Are you sure you want to permanently delete this message from ${message.userName}?`,
            onConfirm: async () => {
                try {
                    const deleteChatMessageFunction = httpsCallable(functions, 'deleteChatMessage');
                    await deleteChatMessageFunction({ eventId: eventId, messageId: message.id });
                } catch (error) {
                    console.error("Error deleting chat message:", error);
                    showMessage(`Error: ${error.message}`);
                }
            },
            onCancel: () => setModalConfig(null)
        });
    };

    const handleMuteToggle = (message) => {
        const isMuted = mutedUsers.has(message.userId);
        const action = isMuted ? 'unmute' : 'mute';
        const functionName = isMuted ? 'unmuteUserInChat' : 'muteUserInChat';

        setModalConfig({
            title: `${action.charAt(0).toUpperCase() + action.slice(1)} User`,
            message: `Are you sure you want to ${action} ${message.userName}?`,
            onConfirm: async () => {
                try {
                    const muteFunction = httpsCallable(functions, functionName);
                    
                    const payload = { eventId: eventId };
                    if (isMuted) {
                        payload.userIdToUnmute = message.userId;
                    } else {
                        payload.userIdToMute = message.userId;
                        payload.durationHours = 0;
                    }
                    
                    await muteFunction(payload);
                    showMessage(`${message.userName} has been ${action}d.`);

                } catch (error) {
                    console.error(`Error ${action}ing user:`, error);
                    showMessage(`Error: ${error.message}`);
                }
            },
            onCancel: () => setModalConfig(null)
        });
    };

    return (
        <>
            {modalConfig && (
                <ConfirmationModal 
                    title={modalConfig.title}
                    message={modalConfig.message}
                    onConfirm={modalConfig.onConfirm}
                    onCancel={() => setModalConfig(null)}
                />
            )}
            <div className="liveChatContainer">
                <div className="liveChatHeader"><p className="heading" style={{ margin: 0 }}>Live Chat</p></div>
                <div className="liveChatMessagesArea">
                    {loading && <p style={{ textAlign: 'center' }}>Loading Chat...</p>}
                    {!loading && messages.length === 0 && <p style={{ textAlign: 'center', padding: '20px 0', color: '#AAA' }}>Be the first to send a message!</p>}
                    {topLevelMessages.map(msg => {
                        const messageReplies = repliesMap.get(msg.id) || [];
                        const isExpanded = expandedReplies.has(msg.id);

                        return (
                            <div key={msg.id}>
                                <ChatMessage
                                    message={msg}
                                    currentUser={currentUser}
                                    creatorProfile={creatorProfile}
                                    onReply={setReplyingTo}
                                    onDelete={handleDeleteMessage}
                                    onMuteToggle={handleMuteToggle}
                                    isMuted={mutedUsers.has(msg.userId)}
                                />

                                {/* Render replies if expanded */}
                                {isExpanded && messageReplies.map(reply => (
                                    <ChatMessage
                                        key={reply.id}
                                        message={reply}
                                        currentUser={currentUser}
                                        creatorProfile={creatorProfile}
                                        onReply={setReplyingTo}
                                        onDelete={handleDeleteMessage}
                                        onMuteToggle={handleMuteToggle}
                                        isMuted={mutedUsers.has(reply.userId)}
                                        isReply={true}
                                    />
                                ))}

                                {/* Render the toggle button if there are replies */}
                                {messageReplies.length > 0 && (
                                    <button
                                        className="replyButton"
                                        style={{ marginLeft: '55px', color: '#FFD700', fontSize: '12px' }}
                                        onClick={() => toggleReplies(msg.id)}
                                    >
                                        {isExpanded ? '— Hide replies' : `+ View ${messageReplies.length} replies`}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                    <div ref={chatEndRef} />
                </div>
                {eventDetails?.isChatEnabled !== false ? (
    <div className="commentInputContainer">
        {replyingTo && ( <div className="replyingToBanner"> <span>Replying to <strong>{replyingTo.userName}</strong></span> <button onClick={() => setReplyingTo(null)}>×</button> </div> )}
        <textarea 
            className="commentTextarea" 
            value={newMessageText} 
            onChange={(e) => setNewMessageText(e.target.value)} 
            placeholder={replyingTo ? 'Write your reply...' : 'Send a message...'}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitMessage(); }
            }}
        />
        <div className="commentSubmitBar">
            <div className="emojiPicker">{emojis.map(e => <button key={e} className="emojiButton" onClick={() => handleAddEmoji(e)}>{e}</button>)}</div>
            <button className="button send-chat-button" onClick={handleSubmitMessage} disabled={isSubmitting}>
                <span className="buttonText">{isSubmitting ? '...' : 'Send'}</span>
            </button>
        </div>
    </div>
      ) : (
        <div className="commentInputContainer disabled" style={{ padding: '15px', textAlign: 'center', color: '#AAA' }}>
        <p>Chat is currently disabled by the host.</p>
      </div>
         )}
            </div>
        </>
    );
}

export default LiveEventChat;