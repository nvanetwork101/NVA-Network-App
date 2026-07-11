import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, functions, httpsCallable, collection, query, orderBy, onSnapshot } from '../firebase';
import { addDoc, serverTimestamp } from 'firebase/firestore';
import ConfirmationModal from './ConfirmationModal';
import RoleBadge from './RoleBadge';

const timeAgo = (date) => {
    if (!date) return '';
    const seconds = Math.floor((new Date() - date.toDate()) / 1000);
    let interval = seconds / 31536000; if (interval > 1) return Math.floor(interval) + "y";
    interval = seconds / 2592000; if (interval > 1) return Math.floor(interval) + "mo";
    interval = seconds / 86400; if (interval > 1) return Math.floor(interval) + "d";
    interval = seconds / 3600; if (interval > 1) return Math.floor(interval) + "h";
    interval = seconds / 60; if (interval > 1) return Math.floor(interval) + "m";
    return Math.floor(seconds) + "s";
};

const getUserColor = (userId) => {
    if (!userId) return '#FFFFFF';
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        const char = userId.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 75%, 60%)`;
};

const ChatMessage = ({ message, currentUser, creatorProfile, onReply, onDelete, onMuteToggle, isMuted, isReply = false }) => {
    const isViewerModerator = creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority';
    const isMessageAuthor = currentUser?.uid === message.userId;
    const canDelete = isViewerModerator || isMessageAuthor;
    const canMute = isViewerModerator && !isMessageAuthor;

    return (
        <div style={{ 
            display: 'flex', 
            alignItems: 'flex-start', 
            gap: '8px', 
            padding: '5px 8px', 
            marginLeft: isReply ? '30px' : '0', 
            borderBottom: '1px solid rgba(255,255,255,0.03)',
            fontSize: '13px'
        }}>
            <img 
                src={message.userProfilePicture || 'https://placehold.co/80x80/555/FFF?text=P'} 
                alt={message.userName} 
                style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} 
            />
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 'bold', color: getUserColor(message.userId), cursor: 'pointer' }}>{message.userName}</span>
                    <RoleBadge profile={{ role: message.authorRole }} />
                    <span style={{ fontSize: '10px', color: '#666' }}>{message.createdAt ? timeAgo(message.createdAt) : '...'}</span>
                </div>
                {message.replyTo && (
                    <p style={{ margin: '1px 0', fontSize: '11px', color: '#888', fontStyle: 'italic' }}>
                        Replying to {message.replyTo.userName}
                    </p>
                )}
                <p style={{ margin: '2px 0 0 0', color: '#E0E0E0', wordBreak: 'break-word' }}>{message.text}</p>
                <div style={{ display: 'flex', gap: '8px', marginTop: '2px' }}>
                    <button className="replyButton" style={{ fontSize: '11px', color: '#666', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }} onClick={() => onReply(message)}>Reply</button>
                    {canDelete && (
                        <button className="replyButton" style={{ fontSize: '11px', color: '#DC3545', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: '6px' }} onClick={() => onDelete(message)}>Delete</button>
                    )}
                    {canMute && (
                        <button className="replyButton" style={{ fontSize: '11px', color: isMuted ? '#4ade80' : '#FFD700', background: 'none', border: 'none', cursor: 'pointer', padding: 0, marginLeft: '6px' }} onClick={() => onMuteToggle(message)}>{isMuted ? 'Unmute' : 'Mute'}</button>
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
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [mutedUsers, setMutedUsers] = useState(new Set());
    const [modalConfig, setModalConfig] = useState(null);
    const [expandedReplies, setExpandedReplies] = useState(new Set());
    
    const messagesAreaRef = useRef(null);
    const emojis = ['👍', '👎', '❤️', '😂', '🔥', '😢', '😡'];
    const handleAddEmoji = (emoji) => setNewMessageText(prev => prev + emoji);

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
        replies.forEach(replyList => {
            if (replyList[0]?.createdAt?.toDate) {
                replyList.sort((a, b) => a.createdAt.toDate() - b.createdAt.toDate());
            }
        });
        return { topLevelMessages: topLevel, repliesMap: replies };
    }, [messages]);

    const toggleReplies = (messageId) => {
        setExpandedReplies(prev => {
            const newSet = new Set(prev);
            newSet.has(messageId) ? newSet.delete(messageId) : newSet.add(messageId);
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
            console.error(error);
            showMessage("Could not load chat messages.");
            setLoading(false);
        });
        return () => unsubscribe();
    }, [eventId, currentUser]);

    useEffect(() => {
        // THE FIX: Allows all users to load the mute list so their input bars lock down when muted
        if (!eventId || !currentUser) {
            setMutedUsers(new Set());
            return;
        }
        const mutedRef = collection(db, `events/${eventId}/mutedUsers`);
        const unsubscribe = onSnapshot(mutedRef, (snapshot) => {
            setMutedUsers(new Set(snapshot.docs.map(doc => doc.id)));
        }, (error) => {
            console.error("Mute listener error:", error);
        });
        return () => unsubscribe();
    }, [eventId, currentUser]);

    // THE FIX: Enables smooth cinematic slide-up animation for new messages
    useEffect(() => {
        if (messagesAreaRef.current) {
            messagesAreaRef.current.scrollTo({
                top: messagesAreaRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    }, [messages]);
    
    const handleSubmitMessage = async () => {
        if (!newMessageText.trim()) return;
        if (isSubmitting) return;
        setIsSubmitting(true);
        try {
            // DIRECT WRITE: Bypasses 500 Cloud Function crash and executes instantly
            await addDoc(collection(db, `events/${eventId}/chatMessages`), {
                userId: currentUser.uid,
                userName: creatorProfile?.creatorName || creatorProfile?.displayName || currentUser.displayName || 'NVA User',
                userProfilePicture: creatorProfile?.profilePictureUrl || currentUser.photoURL || '',
                authorRole: creatorProfile?.role || 'user',
                text: newMessageText.trim(),
                replyTo: replyingTo ? { id: replyingTo.id, userName: replyingTo.userName, userId: replyingTo.userId } : null,
                createdAt: serverTimestamp()
            });
            setNewMessageText('');
            setReplyingTo(null);
        } catch (error) {
            console.warn("Direct write rejected, attempting Cloud Function fallback:", error);
            try {
                const postChatMessageFunction = httpsCallable(functions, 'postChatMessage');
                await postChatMessageFunction({
                    eventId: eventId,
                    text: newMessageText.trim(),
                    replyTo: replyingTo ? { id: replyingTo.id, userName: replyingTo.userName, userId: replyingTo.userId } : null
                });
                setNewMessageText('');
                setReplyingTo(null);
            } catch (fallbackError) {
                showMessage(`Error sending message: ${fallbackError.message}`);
            }
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleDeleteMessage = (message) => {
        setModalConfig({
            title: "Delete Message",
            message: `Are you sure you want to permanently delete this message?`,
            onConfirm: async () => {
                try {
                    const deleteChatMessageFunction = httpsCallable(functions, 'deleteChatMessage');
                    await deleteChatMessageFunction({ eventId: eventId, messageId: message.id });
                } catch (error) {
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
                    showMessage(`Error: ${error.message}`);
                }
            },
            onCancel: () => setModalConfig(null)
        });
    };

    const renderChatInput = () => {
        // Condition A: Chat completely disabled by moderator
        if (eventDetails?.isChatEnabled === false) {
            return (
                <div style={{ textAlign: 'center', padding: '15px', backgroundColor: '#1A1A1A' }}>
                    <p className="subHeading" style={{ margin: 0, fontSize: '12px', color: '#888' }}>Live chat is disabled by a moderator.</p>
                </div>
            );
        }

        // Condition B: Current user has been muted by moderator
        if (mutedUsers.has(currentUser?.uid)) {
            return (
                <div style={{ textAlign: 'center', padding: '15px', backgroundColor: '#1A1A1A', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <p className="subHeading" style={{ margin: 0, fontSize: '12px', color: '#DC3545', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                        🔒 You have been muted in this chat by a moderator.
                    </p>
                </div>
            );
        }

        // Condition C: Normal Active Chat input - Snapped to bottom navigation
        return (
            <div className="commentInputContainer" style={{ 
                flexShrink: 0, 
                width: '100%', 
                padding: '2px 8px', 
                background: '#050505',
                borderTop: '1px solid rgba(255,215,0,0.1)', 
                position: 'relative', 
                zIndex: 10 
            }}>
                {replyingTo && ( 
                    <div className="replyingToBanner" style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 8px', background: 'rgba(255,215,0,0.1)', borderRadius: '4px', marginBottom: '6px', fontSize: '11px' }}> 
                        <span style={{ color: '#FFD700' }}>Replying to <strong>{replyingTo.userName}</strong></span> 
                        <button style={{ background: 'none', border: 'none', color: '#FFF', cursor: 'pointer' }} onClick={() => setReplyingTo(null)}>×</button> 
                    </div> 
                )}
                {showEmojiPicker && (
                    <div style={{ display: 'flex', gap: '10px', padding: '6px 5px', marginBottom: '6px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '6px', justifyContent: 'center' }}>
                        {emojis.map(e => (
                            <button key={e} style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer' }} onClick={() => { handleAddEmoji(e); setShowEmojiPicker(false); }}>{e}</button>
                        ))}
                    </div>
                )}
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                    <input 
                        type="text"
                        value={newMessageText} 
                        onChange={(e) => setNewMessageText(e.target.value)} 
                        placeholder={replyingTo ? 'Write a reply...' : 'Type a message...'}
                        style={{ flex: 1, background: '#181818', border: '1px solid #222', color: '#FFF', borderRadius: '6px', padding: '6px 10px', fontSize: '13px', outline: 'none' }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleSubmitMessage(); } }}
                    />
                    <button 
                        onClick={handleSubmitMessage} 
                        disabled={isSubmitting || !newMessageText.trim()}
                        style={{ background: '#00FFFF', border: 'none', borderRadius: '6px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', opacity: (isSubmitting || !newMessageText.trim()) ? 0.5 : 1 }} 
                    >
                        <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: '#000', transform: 'rotate(45deg) translate(-1px, 1px)' }}><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" /></svg>
                    </button>
                    <button 
                        onClick={() => setShowEmojiPicker(!showEmojiPicker)} 
                        style={{ background: '#222', border: '1px solid #333', borderRadius: '6px', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} 
                    >
                        <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: showEmojiPicker ? '#FFD700' : '#888' }}><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5s.67 1.5 1.5 1.5zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" /></svg>
                    </button>
                </div>
            </div>
        );
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
            <div className="liveChatContainer" style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%', minHeight: 0, flex: '1', background: 'transparent', border: 'none', borderRadius: 0, overflow: 'hidden', boxSizing: 'border-box' }}>
                <div 
                    ref={messagesAreaRef}
                    className="liveChatMessagesArea" 
                    style={{ flex: '1 1 0', minHeight: 0, overflowY: 'auto', padding: '10px 0', display: 'flex', flexDirection: 'column', gap: '2px', background: 'transparent' }}
                >
                    {loading && <p style={{ textAlign: 'center', color: '#666', fontSize: '12px' }}>Loading Chat...</p>}
                    {!loading && messages.length === 0 && <p style={{ textAlign: 'center', padding: '40px 0', color: '#444', fontSize: '12px' }}>Join the premiere! Send the first message.</p>}
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
                                {messageReplies.length > 0 && (
                                    <button
                                        className="replyButton"
                                        style={{ marginLeft: '45px', color: '#FFD700', fontSize: '11px', marginTop: '2px' }}
                                        onClick={() => toggleReplies(msg.id)}
                                    >
                                        {isExpanded ? '— Hide replies' : `+ View ${messageReplies.length} replies`}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* THE FIX: Decoupled Input Area Helper */}
                {renderChatInput()}
            </div>
        </>
    );
}

export default LiveEventChat;