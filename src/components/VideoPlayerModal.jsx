// src/components/VideoPlayerModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { db, functions, httpsCallable, doc, onSnapshot, getDoc } from '../firebase';
import LikeButton from './LikeButton.jsx';
import RoleBadge from './RoleBadge.jsx'; // We will use the badge component here

const appId = 'production-app-id';

const extractVideoInfo = (url) => {
    if (!url || typeof url !== 'string') return { isVertical: false, embedUrl: null };
    if (/(youtube\.com\/shorts|tiktok\.com)/.test(url)) {
        const youtubeMatch = url.match(/(?:youtube\.com\/shorts\/)([^"&?\/ ]{11})/);
        if (youtubeMatch) return { embedUrl: `https://www.youtube.com/embed/${youtubeMatch[1]}?autoplay=1&rel=0`, isVertical: true };
        const tiktokMatch = url.match(/tiktok\.com\/.*\/video\/(\d+)/);
        if (tiktokMatch) return { embedUrl: `https://www.tiktok.com/embed/v2/${tiktokMatch[1]}`, isVertical: true };
    }
    const youtubeMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/);
    if (youtubeMatch) return { embedUrl: `https://www.youtube.com/embed/${youtubeMatch[1]}?autoplay=1&rel=0`, isVertical: false };
    return { embedUrl: url, isVertical: false };
};

const VideoPlayerModal = ({ videoUrl, onClose, contentItem, currentUser, showMessage }) => {
    const [liveContentItem, setLiveContentItem] = useState(contentItem);
    const [creatorProfile, setCreatorProfile] = useState(null);
    const [descriptionExpanded, setDescriptionExpanded] = useState(false);
    const viewCountedRef = useRef(false);
    const itemType = liveContentItem?.itemType || (contentItem?.eventTitle ? 'event' : 'content');

    useEffect(() => {
        if (!contentItem?.id) return;
        const itemId = contentItem.originalContentId || contentItem.id;
        const docPath = contentItem?.eventTitle ? `events/${itemId}` : `artifacts/${appId}/public/data/content_items/${itemId}`;
        const unsubContent = onSnapshot(doc(db, docPath), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setLiveContentItem({ id: docSnap.id, ...data });
                if (data.creatorId && data.creatorId !== creatorProfile?.id) {
                    const creatorRef = doc(db, "creators", data.creatorId);
                    getDoc(creatorRef).then(creatorSnap => {
                        if (creatorSnap.exists()) {
                            setCreatorProfile({ id: creatorSnap.id, ...creatorSnap.data() });
                        }
                    });
                }
            }
        });
        return () => unsubContent();
    }, [contentItem]);

    useEffect(() => {
        if (!liveContentItem || !currentUser || viewCountedRef.current || currentUser.uid === liveContentItem.creatorId) return;
        const timer = setTimeout(async () => {
            viewCountedRef.current = true;
            const incrementViewFunction = httpsCallable(functions, 'incrementViewCount');
            await incrementViewFunction({ itemId: liveContentItem.id, itemType });
        }, 10000);
        return () => clearTimeout(timer);
    }, [liveContentItem, currentUser, itemType]);

    if (!videoUrl) return null;

    const { embedUrl, isVertical } = extractVideoInfo(videoUrl);
    const displayViewCount = itemType === 'event' ? liveContentItem?.totalViewCount : liveContentItem?.viewCount;

    return (
        <div className="videoModalOverlay">
            <div className={`videoModalContent ${isVertical ? 'vertical' : ''}`}>
                <button className="closeButton" onClick={onClose}>×</button>
                <div className={`videoIframeContainer ${isVertical ? 'vertical' : ''}`}>
                    <iframe src={embedUrl} allow="autoplay; encrypted-media;" allowFullScreen title="Embedded Video Content"></iframe>
                </div>
                
                {/* --- DEFINITIVE YOUTUBE-STYLE LAYOUT --- */}
                <div style={{ padding: '12px 15px', backgroundColor: '#1A1A1A' }}>
                    <h2 style={{ margin: '0 0 12px 0', fontSize: '1.2rem', color: '#FFFFFF', fontWeight: '600', lineHeight: '1.4' }}>
                        {liveContentItem?.title}
                    </h2>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '15px' }}>
                        <div 
                            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', minWidth: 0 }}
                            onClick={() => {
                                const event = new CustomEvent('navigateToUserProfile', { detail: { userId: liveContentItem.creatorId } });
                                window.dispatchEvent(event);
                                onClose();
                            }}
                        >
                            <img 
                                src={creatorProfile?.profilePictureUrl || 'https://placehold.co/40x40/555/FFF?text=P'} 
                                alt={creatorProfile?.creatorName} 
                                style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
                            />
                            <div style={{ minWidth: 0 }}>
                                <p style={{ margin: 0, fontSize: '0.9rem', color: '#FFFFFF', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {creatorProfile?.creatorName}
                                    </span>
                                    <RoleBadge profile={creatorProfile} />
                                </p>
                            </div>
                        </div>

                        {currentUser && liveContentItem?.id && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                <LikeButton contentItem={liveContentItem} currentUser={currentUser} showMessage={showMessage} itemType={itemType} />
                                <button
                                    onClick={() => window.dispatchEvent(new CustomEvent('openCommentsModal', { detail: { item: liveContentItem, itemType: itemType } }))}
                                    style={{ background: '#3A3A3A', border: 'none', borderRadius: '50px', display: 'flex', alignItems: 'center', cursor: 'pointer', color: '#FFF', gap: '6px', padding: '0 12px', height: '36px' }}
                                >
                                    <svg viewBox="0 0 24 24" style={{ width: '20px', height: '20px', fill: 'currentColor' }}><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z"></path></svg>
                                    <span>{(liveContentItem?.commentCount || 0).toLocaleString()}</span>
                                </button>
                                <button
                                    onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('openReportModal', { detail: liveContentItem })); }}
                                    style={{ background: '#3A3A3A', border: 'none', borderRadius: '50%', width: '36px', height: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#FFF' }}
                                >
                                    <svg viewBox="0 0 24 24" style={{ width: '20px', height: '20px', fill: 'currentColor' }}><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>
                                </button>
                            </div>
                        )}
                    </div>

                    {liveContentItem?.description && (
                        <div 
                            style={{ backgroundColor: '#2A2A2A', padding: '12px', borderRadius: '12px', cursor: 'pointer' }}
                            onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                        >
                            <p style={{ margin: '0 0 8px 0', fontSize: '0.9rem', color: '#FFFFFF', fontWeight: 'bold' }}>
                                {(displayViewCount || 0).toLocaleString()} Views
                            </p>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#DDDDDD', lineHeight: 1.5, whiteSpace: 'pre-wrap',
                                ...(descriptionExpanded ? {} : { overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' })
                            }}>
                                {liveContentItem.description}
                            </p>
                            <span style={{ color: '#AAAAAA', fontSize: '0.8rem', fontWeight: 'bold', marginTop: '4px', display: 'inline-block' }}>
                                {descriptionExpanded ? 'Show less' : '...more'}
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VideoPlayerModal;