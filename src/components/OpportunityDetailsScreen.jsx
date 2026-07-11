import React, { useState, useEffect, useRef } from 'react';
import { db, functions, httpsCallable } from '../firebase';
import { doc, getDoc, collection, query, orderBy, limit, getDocs, startAfter, addDoc, serverTimestamp } from "firebase/firestore";
import FlyerModal from './FlyerModal';
import ShareButton from './ShareButton';

const OpportunityDetailsScreen = ({ showMessage, setActiveScreen, selectedOpportunity, currentUser, creatorProfile }) => {
    const [opportunityDetails, setOpportunityDetails] = useState(null);
    const popularEmojis = ['🙂', '☹️', '😭', '😍', '👏', '🔥', '💯'];
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const viewCountedRef = useRef(false);

    // --- COMMENTS STATE ---
    const [comments, setComments] = useState([]);
    const [lastCommentDoc, setLastCommentDoc] = useState(null);
    const [hasMoreComments, setHasMoreComments] = useState(true);
    const [newComment, setNewComment] = useState("");
    const [isPostingComment, setIsPostingComment] = useState(false);

    // --- FETCH INITIAL COMMENTS ---
    useEffect(() => {
        if (!selectedOpportunity?.id) return;
        const fetchComments = async () => {
            const q = query(collection(db, "opportunities", selectedOpportunity.id, "comments"), orderBy('createdAt', 'desc'), limit(10));
            const snap = await getDocs(q);
            if (!snap.empty) {
                setComments(snap.docs.map(d => ({id: d.id, ...d.data()})));
                setLastCommentDoc(snap.docs[snap.docs.length - 1]);
                if (snap.docs.length < 10) setHasMoreComments(false);
            } else {
                setHasMoreComments(false);
            }
        };
        fetchComments();
    }, [selectedOpportunity?.id]);

    const handleLoadMoreComments = async () => {
        if (!lastCommentDoc || !selectedOpportunity?.id) return;
        const q = query(collection(db, "opportunities", selectedOpportunity.id, "comments"), orderBy('createdAt', 'desc'), startAfter(lastCommentDoc), limit(10));
        const snap = await getDocs(q);
        if (!snap.empty) {
            setComments(prev => [...prev, ...snap.docs.map(d => ({id: d.id, ...d.data()}))]);
            setLastCommentDoc(snap.docs[snap.docs.length - 1]);
            if (snap.docs.length < 10) setHasMoreComments(false);
        } else {
            setHasMoreComments(false);
        }
    };

    const handlePostComment = async () => {
        if (!newComment.trim()) return;
        // Logic fix: Ensure we check for the UID specifically to verify auth object presence
        if (!currentUser || !currentUser.uid) { 
            showMessage("Login required to comment."); 
            console.log("Auth State:", { currentUser, creatorProfile }); // Debug log
            return; 
        }
        setIsPostingComment(true);
        try {
            await addDoc(collection(db, "opportunities", selectedOpportunity.id, "comments"), {
                text: newComment.trim(),
                userId: currentUser.uid,
                userName: creatorProfile?.creatorName || currentUser.email || 'Anonymous',
                userPhoto: creatorProfile?.profilePictureUrl || 'https://placehold.co/100',
                createdAt: serverTimestamp()
            });
            setNewComment("");
            showMessage("Comment posted!");
            // Optimistic UI Update (Prepend immediately)
            setComments(prev => [{
                id: Date.now().toString(),
                text: newComment.trim(),
                userId: currentUser.uid,
                userName: creatorProfile?.creatorName || currentUser.email || 'Anonymous',
                userPhoto: creatorProfile?.profilePictureUrl || 'https://placehold.co/100',
                createdAt: { toDate: () => new Date() }
            }, ...prev]);
        } catch (e) {
            showMessage("Failed to post comment.");
        }
        setIsPostingComment(false);
    };

    useEffect(() => {
        if (!selectedOpportunity || !selectedOpportunity.id) {
            setLoading(false);
            return;
        }

        const fetchOpportunity = async () => {
            try {
                const docRef = doc(db, "opportunities", selectedOpportunity.id);
                const docSnap = await getDoc(docRef);
                if (docSnap.exists()) {
                    setOpportunityDetails({ id: docSnap.id, ...docSnap.data() });
                } else {
                    showMessage("Casting Call details could not be found.");
                    setActiveScreen('CreatorConnect');
                }
            } catch (error) {
                console.error("Error fetching opportunity details:", error);
                showMessage("An error occurred while loading details.");
            } finally {
                setLoading(false);
            }
        };

        fetchOpportunity();
    }, [selectedOpportunity.id]);

    useEffect(() => {
        if (opportunityDetails && !viewCountedRef.current) {
            viewCountedRef.current = true;
            const incrementView = async () => {
                try {
                    const incrementViewFunction = httpsCallable(functions, 'incrementOpportunityView');
                    await incrementViewFunction({ opportunityId: opportunityDetails.id });
                } catch (error) {
                    console.error("Error incrementing view count:", error);
                }
            };
            incrementView();
        }
    }, [opportunityDetails]);

    if (loading) {
        return (
            <div className="screenContainer" style={{textAlign: 'center', paddingTop: '100px'}}>
                <p className="heading" style={{ color: '#00FFFF' }}>Entering the Audition Room...</p>
            </div>
        );
    }

    if (!opportunityDetails) {
        return (
             <div className="screenContainer" style={{textAlign: 'center', paddingTop: '100px'}}>
                <p className="heading" style={{ color: '#EF4444' }}>Casting Call Not Found</p>
                <button className="button" onClick={() => setActiveScreen('CreatorConnect')}>
                    <span className="buttonText">Back to Casting Calls</span>
                </button>
            </div>
        );
    }

    const customStyles = `
        .casting-hero { position: relative; width: 100%; aspect-ratio: 16/9; background: #050505; border: 1px solid rgba(0, 255, 255, 0.2); border-radius: 16px; overflow: hidden; margin-bottom: 24px; cursor: pointer; box-shadow: 0 8px 32px rgba(0, 255, 255, 0.08); }
        .casting-hero img { width: 100%; height: 100%; object-fit: contain; transition: transform 0.4s ease; }
        .casting-hero:hover img { transform: scale(1.02); }
        .casting-badge-label { background: linear-gradient(135deg, #FFD700, #FF8C00); color: #000; font-size: 10px; font-weight: 900; padding: 4px 12px; position: absolute; top: 12px; left: 12px; border-radius: 4px; z-index: 5; letter-spacing: 1px; }
        .casting-title { font-size: 32px; font-weight: 900; color: #FFF; margin: 0 0 6px 0; letter-spacing: -0.5px; }
        .casting-subtitle { font-size: 14px; color: #888; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 24px 0; }
        
        .casting-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 12px; margin-bottom: 24px; }
        .casting-stat-card { background: rgba(30, 30, 30, 0.4); border: 1px solid rgba(255, 255, 255, 0.06); border-radius: 12px; padding: 16px; text-align: center; backdrop-filter: blur(8px); }
        .casting-stat-val { font-size: 14px; font-weight: bold; color: #FFF; margin: 0 0 4px 0; text-transform: uppercase; }
        .casting-stat-val.gold { color: #FFD700; }
        .casting-stat-label { font-size: 10px; color: #666; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; }

        .glass-panel { background: rgba(20, 20, 20, 0.6); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 16px; padding: 24px; margin-bottom: 20px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4); }
        .glass-title { font-size: 14px; font-weight: 800; color: #FFD700; text-transform: uppercase; letter-spacing: 0.1em; margin: 0 0 12px 0; }
        .glass-body { font-size: 14px; color: #DDD; line-height: 1.6; margin: 0; }
    `;

    return (
        <>
            <style>{customStyles}</style>
            <div className="screenContainer" style={{ paddingBottom: '120px' }}>
                
                {/* WIDESCREEN HERO FLYER */}
                {opportunityDetails.flyerImageUrl && (
                    <div className="casting-hero" onClick={() => setIsModalOpen(true)}>
                        <div className="casting-badge-label">🎬 AUDITION FLYER</div>
                        <img src={opportunityDetails.flyerImageUrl} alt="Casting Flyer" />
                    </div>
                )}

                <h1 className="casting-title">{opportunityDetails.title}</h1>
                <p className="casting-subtitle">Posted by {opportunityDetails.providerName}</p>
                
                {/* CORE STATISTICS GRID */}
                <div className="casting-grid">
                    <div className="casting-stat-card" style={{ borderLeft: '3px solid #00FFFF' }}>
                        <p className="casting-stat-val" style={{ color: '#00FFFF' }}>{opportunityDetails.opportunityType}</p>
                        <p className="casting-stat-label">Production Type</p>
                    </div>
                    <div className="casting-stat-card" style={{ borderLeft: '3px solid #C084FC' }}>
                        <p className="casting-stat-val" style={{ color: '#C084FC' }}>{opportunityDetails.location}</p>
                        <p className="casting-stat-label">Location</p>
                    </div>
                    <div className="casting-stat-card" style={{ borderLeft: '3px solid #FFD700' }}>
                        <p className="casting-stat-val gold">{opportunityDetails.compensationType}</p>
                        <p className="casting-stat-label">Compensation</p>
                    </div>
                    {opportunityDetails.expiresAt && (
                        <div className="casting-stat-card" style={{ borderLeft: '3px solid #EF4444' }}>
                            <p className="casting-stat-val" style={{ color: '#EF4444' }}>{new Date(opportunityDetails.expiresAt.toDate()).toLocaleDateString()}</p>
                            <p className="casting-stat-label">Audition Deadline</p>
                        </div>
                    )}
                </div>

                {/* DESCRIPTION PANEL */}
                <div className="glass-panel">
                    <p className="glass-title">Role & Project Description</p>
                    <p className="glass-body" style={{ whiteSpace: 'pre-wrap' }}>{opportunityDetails.description}</p>
                </div>

                {/* PROJECT LINK */}
                {opportunityDetails.mainUrl && (
                     <div className="glass-panel" style={{ border: '1px solid rgba(0, 255, 255, 0.2)', background: 'rgba(0, 255, 255, 0.02)' }}>
                        <p className="glass-title" style={{color: '#00FFFF'}}>🔗 Reference / Script Link</p>
                        <a href={opportunityDetails.mainUrl} target="_blank" rel="noopener noreferrer" className="termsLink" style={{ fontSize: '14px', fontWeight: 'bold' }}>
                            Click here to access script material
                        </a>
                    </div>
                )}

                {/* HOW TO APPLY PANEL */}
                <div className="glass-panel" style={{ border: '1px solid rgba(255, 215, 0, 0.3)', background: 'rgba(255, 215, 0, 0.02)' }}>
                    <p className="glass-title" style={{ color: '#FFD700' }}>📣 Audition Instructions</p>
                    <p className="glass-body" style={{ whiteSpace: 'pre-wrap', color: '#FFF' }}>{opportunityDetails.howToApply}</p>
                </div>
                
                {/* --- INLINE COMMENTS SECTION --- */}
                <div style={{ marginTop: '40px', paddingTop: '24px', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                    <h3 style={{ fontSize: '16px', fontWeight: 900, color: '#FFF', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '20px' }}>Discussion Board</h3>
                    
                    {/* Emoji Quick Bar */}
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', overflowX: 'auto', paddingBottom: '4px' }}>
                        {popularEmojis.map(emoji => (
                            <button key={emoji} onClick={() => setNewComment(prev => prev + emoji)} style={{ background: '#1A1A1A', border: '1px solid #333', borderRadius: '8px', padding: '6px 10px', cursor: 'pointer', fontSize: '16px' }}>{emoji}</button>
                        ))}
                    </div>

                    {/* Add Comment Input */}
                    <div style={{ display: 'flex', gap: '10px', marginBottom: '24px' }}>
                        <input 
                            type="text" 
                            placeholder="Ask a question or leave a comment..." 
                            value={newComment}
                            onChange={e => setNewComment(e.target.value)}
                            style={{ flex: 1, background: 'rgba(0,0,0,0.6)', border: '1px solid #333', color: '#FFF', padding: '14px 20px', borderRadius: '30px', fontSize: '14px', outline: 'none' }}
                            onFocus={e => e.target.style.borderColor = '#00FFFF'}
                            onBlur={e => e.target.style.borderColor = '#333'}
                        />
                        <button 
                            onClick={handlePostComment} 
                            disabled={isPostingComment || !newComment.trim()}
                            style={{ background: '#00FFFF', color: '#000', fontWeight: 900, padding: '0 24px', borderRadius: '30px', border: 'none', cursor: isPostingComment || !newComment.trim() ? 'not-allowed' : 'pointer', opacity: isPostingComment || !newComment.trim() ? 0.5 : 1, textTransform: 'uppercase' }}
                        >
                            Post
                        </button>
                    </div>

                    {/* Comments Feed */}
                    {comments.length === 0 ? (
                        <p style={{ color: '#666', textAlign: 'center', fontSize: '14px', fontStyle: 'italic', padding: '20px 0' }}>No comments yet. Be the first to start the discussion!</p>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {comments.map(c => (
                                <div key={c.id} style={{ display: 'flex', gap: '12px', background: 'rgba(20,20,20,0.6)', padding: '16px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)', backdropFilter: 'blur(8px)' }}>
                                    <img src={c.userPhoto || 'https://placehold.co/100'} alt={c.userName} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #333' }} />
                                    <div style={{ flex: 1 }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <p style={{ fontSize: '13px', fontWeight: 900, color: '#00FFFF', margin: 0 }}>{c.userName}</p>
                                            <span style={{ fontSize: '10px', color: '#666' }}>{c.createdAt?.toDate ? c.createdAt.toDate().toLocaleDateString() : 'Just now'}</span>
                                        </div>
                                        <p style={{ fontSize: '14px', color: '#DDD', margin: 0, lineHeight: 1.5 }}>{c.text}</p>
                                    </div>
                                </div>
                            ))}
                            
                            {hasMoreComments && (
                                <button onClick={handleLoadMoreComments} style={{ background: 'transparent', color: '#00FFFF', border: '1px solid #00FFFF', padding: '8px 24px', borderRadius: '20px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', margin: '10px auto 0 auto', display: 'block' }}>
                                    Load More Comments
                                </button>
                            )}
                        </div>
                    )}
                </div>

                {/* --- FIXED FLOATING ACTION BAR (True Scroll Resistant) --- */}
                <div style={{ 
                    position: 'fixed', 
                    bottom: '80px', // Sits perfectly above your main navigation bar
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 1000, 
                    display: 'flex', 
                    justifyContent: 'center', 
                    alignItems: 'center', 
                    gap: '12px', 
                    background: 'rgba(15,15,15,0.95)', 
                    backdropFilter: 'blur(20px)', 
                    padding: '10px 20px', 
                    borderRadius: '100px', 
                    border: '1px solid rgba(0, 255, 255, 0.3)', 
                    boxShadow: '0 10px 30px rgba(0,0,0,0.8)', 
                    width: 'max-content'
                }}>
                    <ShareButton
                        title={opportunityDetails.title}
                        text={`Check out the casting call "${opportunityDetails.title}" on NVA Network!`}
                        url={`/opportunity/${opportunityDetails.id}`}
                        showMessage={showMessage}
                    />
                    <button className="button" onClick={() => setActiveScreen('CreatorConnect')} style={{ backgroundColor: '#222', border: '1px solid #444', margin: 0, borderRadius: '100px', padding: '10px 20px' }}>
                        <span className="buttonText light" style={{ fontSize: '13px' }}>Back to Casting Calls</span>
                    </button>
                </div>

            </div>

            {isModalOpen && (
                <FlyerModal 
                    imageUrl={opportunityDetails.flyerImageUrl} 
                    onClose={() => setIsModalOpen(false)} 
                />
            )}
        </>
    );
};

export default OpportunityDetailsScreen;