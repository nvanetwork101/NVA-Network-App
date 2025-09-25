// src/components/VideoPlayerModal.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, functions, httpsCallable, doc, onSnapshot, getDoc } from '../firebase';
import LikeButton from './LikeButton.jsx';
import RoleBadge from './RoleBadge.jsx';

const appId = 'production-app-id';

const extractVideoInfo = (url) => {
    if (!url || typeof url !== 'string') return { embedUrl: null, isVertical: false, platform: 'unknown' };
    const ytShortsMatch = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/);
    if (ytShortsMatch) {
        return { embedUrl: `https://www.youtube.com/embed/${ytShortsMatch[1]}?autoplay=1&rel=0`, isVertical: true, platform: 'youtube' };
    }
    const ytMatch = url.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/ ]{11})/);
    if (ytMatch) {
        return { embedUrl: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0`, isVertical: false, platform: 'youtube' };
    }
    const tiktokMatch = url.match(/tiktok\.com\/.*\/video\/(\d+)/);
    if (tiktokMatch) {
        return { embedUrl: url, isVertical: true, platform: 'tiktok' };
    }
    return { embedUrl: url, isVertical: false, platform: 'unknown' };
};

const VideoPlayerModal = ({ videoUrl, onClose, contentItem, currentUser, showMessage }) => {
    const [liveContentItem, setLiveContentItem] = useState(contentItem);
    const [creatorProfile, setCreatorProfile] = useState(null);
    const [descriptionExpanded, setDescriptionExpanded] = useState(false);
    const viewCountedRef = useRef(false);
    const tiktokContainerRef = useRef(null);
    const itemType = useMemo(() => liveContentItem?.eventTitle ? 'event' : 'content', [liveContentItem]);
    const { embedUrl, isVertical, platform } = useMemo(() => extractVideoInfo(videoUrl), [videoUrl]);

    useEffect(() => {
        if (platform === 'tiktok' && tiktokContainerRef.current) {
            tiktokContainerRef.current.innerHTML = '';
            const blockquote = document.createElement('blockquote');
            blockquote.className = 'tiktok-embed';
            blockquote.cite = embedUrl;
            blockquote.setAttribute('data-video-id', embedUrl.match(/video\/(\d+)/)[1]);
            blockquote.style.width = '100%';
            blockquote.style.height = '100%';
            blockquote.style.margin = '0';
            const script = document.createElement('script');
            script.src = 'https://www.tiktok.com/embed.js';
            script.async = true;
            tiktokContainerRef.current.appendChild(blockquote);
            document.body.appendChild(script);
            return () => {
                const existingScript = document.querySelector('script[src="https://www.tiktok.com/embed.js"]');
                if (existingScript) document.body.removeChild(existingScript);
            };
        }
    }, [platform, embedUrl]);

    useEffect(() => {
        if (!contentItem?.id) return;
        const itemId = contentItem.originalContentId || contentItem.id;
        const docPath = contentItem?.eventTitle ? `events/${itemId}` : `artifacts/${appId}/public/data/content_items/${itemId}`;
        const unsubContent = onSnapshot(doc(db, docPath), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setLiveContentItem({ id: docSnap.id, ...data });
                if (data.creatorId && data.creatorId !== creatorProfile?.id) {
                    getDoc(doc(db, "creators", data.creatorId)).then(creatorSnap => {
                        if (creatorSnap.exists()) setCreatorProfile({ id: creatorSnap.id, ...creatorSnap.data() });
                    });
                }
            }
        });
        return () => unsubContent();
    }, [contentItem, creatorProfile?.id]);

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

    const videoContainerStyle = {
        backgroundColor: '#000',
        margin: '0 auto',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        ...(isVertical 
            ? { 
                aspectRatio: '9 / 16',
                width: 'auto',
                height: '100%',
                maxHeight: 'calc(100vh - 180px)', // Reserve space for info panel
              }
            : { 
                aspectRatio: '16 / 9',
                width: '100%',
                maxWidth: '1200px',
              }
        )
    };

    const iframeStyle = {
        width: '100%',
        height: '100%',
        border: 'none',
    };

    const displayViewCount = itemType === 'event' ? liveContentItem?.totalViewCount : liveContentItem?.viewCount;

    return (
        <div className="videoModalOverlay">
            <div className="videoModalContent">
                <button className="closeButton" onClick={onClose}>×</button>
                
                <div className="videoIframeContainer" style={videoContainerStyle}>
                    {platform === 'tiktok' ? (
                        <div ref={tiktokContainerRef} style={{ width: '100%', height: '100%' }}></div>
                    ) : (
                        <iframe src={embedUrl} style={iframeStyle} allow="autoplay; encrypted-media;" allowFullScreen title="Embedded Video Content"></iframe>
                    )}
                </div>
                
                <div style={{ padding: '12px 15px', backgroundColor: '#1A1A1A', overflowY: 'auto', width: '100%', flexShrink: 0 }}>
                    <h2 style={{ margin: '0 0 12px 0', fontSize: '1.2rem', color: '#FFFFFF', fontWeight: '600', lineHeight: '1.4' }}>
                        {liveContentItem?.title}
                    </h2>
                    
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', gap: '15px' }}>
                        <div 
                            style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', minWidth: 0 }}
                            onClick={() => {
                                window.dispatchEvent(new CustomEvent('navigateToUserProfile', { detail: { userId: liveContentItem.creatorId } }));
                                onClose();
                            }}
                        >
                            <img 
                                src={creatorProfile?.profilePictureUrl || 'https://placehold.co/40x40/555/FFF?text=P'} 
                                alt={creatorProfile?.creatorName} 
                                style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }}
                            />
                            <div>
                                <div style={{ margin: 0, fontSize: '0.9rem', color: '#FFFFFF', fontWeight: 'bold', display: 'flex', alignItems: 'center' }}>
                                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {creatorProfile?.creatorName}
                                    </span>
                                    <RoleBadge profile={creatorProfile} />
                                </div>
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