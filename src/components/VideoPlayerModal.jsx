// src/components/VideoPlayerModal.jsx
import React, { useState, useEffect, useRef } from 'react';
import { db, functions, httpsCallable, doc, onSnapshot } from '../firebase';
import LikeButton from './LikeButton.jsx';

const appId = 'production-app-id';

const GENERIC_THUMBNAIL_PLACEHOLDER = 'https://placehold.co/300x200/2A2A2A/FFF?text=NVA';
const extractVideoInfo = (url) => {
    if (!url || typeof url !== 'string') {
        return { videoId: null, thumbnailUrl: GENERIC_THUMBNAIL_PLACEHOLDER, embedUrl: null, platform: 'unknown', isVertical: false };
    }
    const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/ ]{11})/;
    const youtubeMatch = url.match(youtubeRegex);
    if (youtubeMatch && youtubeMatch[1]) {
        const videoId = youtubeMatch[1];
        const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
        const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
        const isVertical = url.includes('/shorts/');
        return { videoId, thumbnailUrl, embedUrl, platform: 'youtube', isVertical };
    }
    const vimeoRegex = /vimeo\.com\/(?:video\/)?(\d+)/;
    const vimeoMatch = url.match(vimeoRegex);
    if (vimeoMatch && vimeoMatch[1]) {
        const videoId = vimeoMatch[1];
        const embedUrl = `https://player.vimeo.com/video/${videoId}?autoplay=1`;
        return { videoId, thumbnailUrl: GENERIC_THUMBNAIL_PLACEHOLDER, embedUrl, platform: 'vimeo', isVertical: false };
    }
    const tiktokRegex = /tiktok\.com\/.*\/video\/(\d+)/;
    const tiktokMatch = url.match(tiktokRegex);
    if (tiktokMatch && tiktokMatch[1]) {
        const videoId = tiktokMatch[1];
        const embedUrl = `https://www.tiktok.com/embed/v2/${videoId}`;
        return { videoId, thumbnailUrl: GENERIC_THUMBNAIL_PLACEHOLDER, embedUrl, platform: 'tiktok', isVertical: true };
    }
    const facebookRegex = /facebook\.com\/(?:watch\/?\?v=|.*\/videos\/|.*\/reel\/)(\d+)/;
    const facebookMatch = url.match(facebookRegex);
    if(facebookMatch && facebookMatch[1]) {
        const videoId = facebookMatch[1];
        const embedUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&autoplay=true`;
        return { videoId, thumbnailUrl: GENERIC_THUMBNAIL_PLACEHOLDER, embedUrl, platform: 'facebook', isVertical: url.includes('/reel/') };
    }
    return { videoId: null, thumbnailUrl: GENERIC_THUMBNAIL_PLACEHOLDER, embedUrl: url, platform: 'generic', isVertical: false };
};

const VideoPlayerModal = ({ videoUrl, onClose, contentItem, currentUser, showMessage }) => {
    const [liveContentItem, setLiveContentItem] = useState(contentItem);
    const viewCountedRef = useRef(false);

    const itemType = liveContentItem?.itemType || (contentItem?.eventTitle ? 'event' : 'content');

    useEffect(() => {
        if (!contentItem?.id) return;

        const initialItemType = contentItem?.eventTitle ? 'event' : 'content';
        const itemId = contentItem.originalContentId || contentItem.id;

        let docPath;
        if (initialItemType === 'event') {
            docPath = `events/${itemId}`;
        } else {
            docPath = `artifacts/${appId}/public/data/content_items/${itemId}`;
        }

        const unsub = onSnapshot(doc(db, docPath), (doc) => {
            if (doc.exists()) {
                setLiveContentItem({ id: doc.id, ...doc.data(), itemType: initialItemType });
            } else {
                console.warn(`Real-time listener could not find document at path: ${docPath}`);
            }
        }, (error) => {
            console.error(`Error listening to document at ${docPath}:`, error);
        });

        return () => unsub();
    }, [contentItem]);

    useEffect(() => {
        if (!liveContentItem || !currentUser || viewCountedRef.current) { return; }

        const authorId = liveContentItem.hostId || liveContentItem.creatorId || liveContentItem.createdBy;
        const itemId = liveContentItem.originalContentId || liveContentItem.id;

        if (currentUser.uid === authorId) { return; }

        const timer = setTimeout(async () => {
            if (viewCountedRef.current) return;
            viewCountedRef.current = true;
            try {
                const incrementViewFunction = httpsCallable(functions, 'incrementViewCount');
                await incrementViewFunction({ itemId: itemId, itemType: itemType });
            } catch (error) { console.error("Error calling incrementViewCount function:", error); }
        }, 10000);

        return () => { clearTimeout(timer); };
    }, [liveContentItem, currentUser, itemType]);

    if (!videoUrl) return null;

    const { embedUrl, isVertical } = extractVideoInfo(videoUrl);

    const displayViewCount = itemType === 'event' ? liveContentItem?.totalViewCount : liveContentItem?.viewCount;

    return (
        <div className="videoModalOverlay">
            <div className={`videoModalContent ${isVertical ? 'vertical' : ''}`}>
                <button className="closeButton" onClick={onClose}>×</button>
                <div className={`videoIframeContainer ${isVertical ? 'vertical' : ''}`}>
                    <iframe src={embedUrl} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen title="Embedded Video Content"></iframe>
                </div>
                
                {/* --- THIS IS THE FIX: START OF NEW CREATOR INFO BLOCK --- */}
                {liveContentItem && liveContentItem.creatorId !== 'nva-system' && !liveContentItem.isCurated && (
                    <div className="video-details-container" style={{ padding: '15px', color: '#FFF' }}>
                        <h2 className="video-title" style={{ margin: '0 0 8px 0', fontSize: '1.4rem' }}>{liveContentItem.title}</h2>
                        <p 
                            className="video-creator-name" 
                            style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#FFD700', cursor: 'pointer' }}
                            onClick={() => {
                                const event = new CustomEvent('navigateToUserProfile', { detail: { userId: liveContentItem.creatorId } });
                                window.dispatchEvent(event);
                                onClose(); // Close the modal after clicking the profile name
                            }}
                        >
                            by {liveContentItem.creatorName}
                        </p>
                        <p className="video-description" style={{ margin: 0, fontSize: '0.9rem', color: '#DDD', maxHeight: '60px', overflowY: 'auto' }}>
                            {liveContentItem.description}
                        </p>
                    </div>
                )}
                {/* --- END OF NEW CREATOR INFO BLOCK --- */}
                
                <div 
                    onClick={() => {
                        if (liveContentItem?.likeCount > 0) {
                            const event = new CustomEvent('openLikesModal', { detail: { contentItem: liveContentItem } });
                            window.dispatchEvent(event);
                        } else {
                            showMessage("No likes to display yet.");
                        }
                    }}
                    style={{
                        position: 'absolute', bottom: '20px', left: '15px', backgroundColor: 'rgba(10, 10, 10, 0.7)',
                        border: '1px solid #FFD700', borderRadius: '50px', padding: '0 10px', height: '32px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        cursor: liveContentItem?.likeCount > 0 ? 'pointer' : 'default'
                    }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="Views">
                        <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px', fill: '#FFF' }}><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 10c-2.48 0-4.5-2.02-4.5-4.5S9.52 5.5 12 5.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5zM12 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>
                        <span style={{ color: '#FFF', fontSize: '12px', fontWeight: 'bold' }}>{(displayViewCount || 0).toLocaleString()}</span>
                    </div>
                    <div style={{width: '1px', height: '16px', backgroundColor: '#555'}}></div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }} title="View who liked this">
                        <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px', fill: '#FFD700' }}><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path></svg>
                        <span style={{ color: '#FFF', fontSize: '12px', fontWeight: 'bold' }}>{(liveContentItem?.likeCount || 0).toLocaleString()}</span>
                    </div>
                </div>

                {currentUser && liveContentItem && liveContentItem.id && (
                    <div style={{ position: 'absolute', bottom: '20px', right: '15px', display: 'flex', gap: '10px' }}>
                        <LikeButton contentItem={liveContentItem} currentUser={currentUser} showMessage={showMessage} itemType={itemType} />
                        
                        <button
                            onClick={() => window.dispatchEvent(new CustomEvent('openCommentsModal', { detail: { item: liveContentItem, itemType: itemType } }))}
                            title="View comments"
                            style={{
                                backgroundColor: 'rgba(10, 10, 10, 0.7)', border: '1px solid #FFD700', borderRadius: '50px',
                                width: 'auto', minWidth: '32px', height: '32px', padding: '0 10px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', color: '#FFF', gap: '6px'
                            }}
                        >
                            <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px', fill: 'currentColor' }}><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18zM18 14H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"></path></svg>
                            <span style={{ fontSize: '12px', fontWeight: 'bold' }}>{(liveContentItem?.commentCount || 0).toLocaleString()}</span>
                        </button>

                        <button
                            onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('openReportModal', { detail: liveContentItem })); }}
                            title="More options"
                            style={{
                                backgroundColor: 'rgba(10, 10, 10, 0.7)', border: '1px solid #FFD700', borderRadius: '50%',
                                width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', color: '#FFF'
                            }}
                        >
                            <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px', fill: 'currentColor' }}><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default VideoPlayerModal;