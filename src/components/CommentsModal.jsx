// src/components/CommentsModal.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { db, functions, httpsCallable, collection, query, orderBy, onSnapshot } from '../firebase';

const appId = 'production-app-id';

// --- FIX: UTILITY FOR UNIQUE USER COLORS ---
const generateColorFromId = (id) => {
    if (!id) return '#FFFFFF'; // Default color
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    let color = '#';
    for (let i = 0; i < 3; i++) {
        let value = (hash >> (i * 8)) & 0xFF;
        // Adjust the formula to generate brighter, more pleasant colors
        value = Math.floor(128 + (value % 128)); 
        color += ('00' + value.toString(16)).substr(-2);
    }
    return color;
};

const CommentsModal = ({ item, itemType, currentUser, creatorProfile, showMessage, onClose }) => {
    const [comments, setComments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newCommentText, setNewCommentText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [replyingTo, setReplyingTo] = useState(null);
    const [expandedReplies, setExpandedReplies] = useState(new Set());

    // --- FIX: CORRECTLY HANDLE 'event' ITEM TYPE FOR VODs ---
    const collectionPath = useMemo(() => {
        if (!item || !item.id) return null;
        switch(itemType) {
            case 'content':
                return `artifacts/${appId}/public/data/content_items/${item.id}/comments`;
            case 'event': // This case was missing
                return `events/${item.id}/comments`;
            case 'opportunity':
                return `opportunities/${item.id}/comments`;
            default:
                console.error("Unknown itemType for comments:", itemType);
                return null;
        }
    }, [item, itemType]);

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

    useEffect(() => {
        if (!currentUser || !collectionPath) {
            setLoading(false);
            return;
        }

        setLoading(true);
        const commentsRef = collection(db, collectionPath);
        const q = query(commentsRef, orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedComments = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setComments(fetchedComments);
            setLoading(false);
        }, (error) => {
            console.error("Error listening to comments:", error);
            showMessage("Could not load comments.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, [collectionPath, currentUser]);

    const { topLevelComments, repliesMap } = useMemo(() => {
        const topLevel = [];
        const replies = new Map();
        comments.forEach(comment => {
            if (comment.replyTo && comment.replyTo.id) {
                const parentId = comment.replyTo.id;
                if (!replies.has(parentId)) {
                    replies.set(parentId, []);
                }
                replies.get(parentId).push(comment);
            } else {
                topLevel.push(comment);
            }
        });
        replies.forEach(replyList => replyList.sort((a, b) => a.createdAt?.toDate() - b.createdAt?.toDate()));
        return { topLevelComments: topLevel, repliesMap: replies };
    }, [comments]);

    const toggleReplies = (commentId) => {
        setExpandedReplies(prev => {
            const newSet = new Set(prev);
            newSet.has(commentId) ? newSet.delete(commentId) : newSet.add(commentId);
            return newSet;
        });
    };

    const handleSubmit = async () => {
        if (!newCommentText.trim()) return showMessage("Comment cannot be empty.");
        if (isSubmitting) return;

        setIsSubmitting(true);
        try {
            const postCommentFunction = httpsCallable(functions, 'postComment');
            await postCommentFunction({
                itemId: item.id,
                itemType: itemType,
                text: newCommentText,
                replyTo: replyingTo ? { id: replyingTo.id, name: replyingTo.userName, userId: replyingTo.userId } : null
            });
            setNewCommentText('');
            setReplyingTo(null);
        } catch (error) {
            console.error("Error posting comment:", error);
            showMessage(error.message);
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const handleViewProfile = (userId) => {
        window.dispatchEvent(new CustomEvent('navigateToUserProfile', { detail: { userId } }));
    };

    const handleAddEmoji = (emoji) => setNewCommentText(prev => prev + emoji);
    const emojis = ['👍', '👎', '❤️', '😂', '🔥', '😢', '😡'];

    const handleDelete = async (comment) => {
        try {
            const deleteCommentFunction = httpsCallable(functions, 'deleteComment');
            await deleteCommentFunction({ itemId: item.id, itemType: itemType, commentId: comment.id });
            showMessage("Comment deleted.");
        } catch (error) {
            showMessage(`Error: ${error.message}`);
        }
    };

    // --- FIX: COMPONENT TO RENDER COMMENTS WITH ROLE-BASED STYLING ---
    const Comment = ({ comment, isReply = false }) => {
        const isModerator = creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority';
        const isCommentAuthor = currentUser?.uid === comment.userId;
        const isContentOwner = currentUser?.uid === item.creatorId || currentUser?.uid === item.postedByUid;
        const canDelete = isModerator || isCommentAuthor || isContentOwner;

        // Determine CSS class based on authorRole
        const authorClass = `commentAuthor commentAuthor--${comment.authorRole || 'user'}`;
        // Determine unique color style for the user's name
        const authorStyle = { color: generateColorFromId(comment.userId) };

        return (
            <div className="commentItem" style={{ marginLeft: isReply ? '40px' : '0' }}>
                <img src={comment.userProfilePicture || 'https://placehold.co/80x80/555/FFF?text=P'} alt={comment.userName} className="commentPfp" onClick={() => handleViewProfile(comment.userId)} />
                <div className="commentContent">
                    <div className="commentHeader">
                        <span className={authorClass} style={authorStyle} onClick={() => handleViewProfile(comment.userId)}>{comment.userName}</span>
                        <span className="commentTimestamp">{comment.createdAt ? timeAgo(comment.createdAt) : '...'}</span>
                    </div>
                    {comment.replyTo && <p style={{fontSize: '12px', color: '#AAA', fontStyle: 'italic', marginBottom: '5px'}}>Replying to {comment.replyTo.name}</p>}
                    <p className="commentText">{comment.text}</p>
                    <div className="commentActions">
                        <button className="replyButton" onClick={() => setReplyingTo(comment)}>Reply</button>
                        {canDelete && <button className="replyButton" style={{ color: '#DC3545', marginLeft: '10px' }} onClick={() => handleDelete(comment)}>Delete</button>}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className="likesModalOverlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="commentsModalContent">
                <div className="likesModalHeader"><p className="likesModalTitle">Comments</p><button className="closeButton" onClick={onClose}>×</button></div>
                <div className="commentsList">
                    {loading && <p style={{textAlign: 'center'}}>Loading comments...</p>}
                    {!loading && comments.length === 0 && <p style={{textAlign: 'center', padding: '20px 0'}}>{currentUser ? 'Be the first to comment!' : 'Please log in to view and post comments.'}</p>}
                     {topLevelComments.map(comment => {
                        const commentReplies = repliesMap.get(comment.id) || [];
                        const isExpanded = expandedReplies.has(comment.id);
                        return (
                            <div key={comment.id}>
                                <Comment comment={comment} />
                                {isExpanded && commentReplies.map(reply => <Comment key={reply.id} comment={reply} isReply={true} />)}
                                {commentReplies.length > 0 && (
                                    <button className="replyButton" style={{ marginLeft: '55px', color: '#FFD700' }} onClick={() => toggleReplies(comment.id)}>
                                        {isExpanded ? 'Hide replies' : `View ${commentReplies.length} replies...`}
                                    </button>
                                )}
                            </div>
                        );
                    })}
                </div>
                {currentUser && (
                    <div className="commentInputContainer">
                        {replyingTo && ( <div className="replyingToBanner"> <span>Replying to <strong>{replyingTo.userName}</strong></span> <button onClick={() => setReplyingTo(null)}>×</button> </div> )}
                        <textarea className="commentTextarea" value={newCommentText} onChange={(e) => setNewCommentText(e.target.value)} placeholder="Add a comment..." />
                        <div className="commentSubmitBar">
                            <div className="emojiPicker">{emojis.map(e => <button key={e} className="emojiButton" onClick={() => handleAddEmoji(e)}>{e}</button>)}</div>
                            <button className="button" onClick={handleSubmit} disabled={isSubmitting}><span className="buttonText">{isSubmitting ? '...' : 'Post'}</span></button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CommentsModal;