// src/components/VideoPlayerModal.jsx
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, functions, httpsCallable, doc, onSnapshot, getDoc } from '../firebase';
import LikeButton from './LikeButton.jsx';
import RoleBadge from './RoleBadge.jsx';

const appId = 'production-app-id';
import ShareButton from './ShareButton';
const extractVideoInfo = (url) => {
    if (!url || typeof url !== 'string') return { embedUrl: null, isVertical: false, platform: 'unknown' };

    // --- NEW FACEBOOK LOGIC ---
    if (url.includes('facebook.com') || url.includes('fb.watch')) {
        const encodedFbUrl = encodeURIComponent(url);
        // Returns the special player URL that Facebook requires for embedding.
        return { embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodedFbUrl}&show_text=false&autoplay=true&mute=1`, isVertical: false, platform: 'facebook' };
    }
    // --- END NEW LOGIC ---

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
        return { embedUrl: `https://www.tiktok.com/embed/v2/${tiktokMatch[1]}`, isVertical: true, platform: 'tiktok' };
    }
    return { embedUrl: url, isVertical: false, platform: 'unknown' };
};

const VideoPlayerModal = ({ videoUrl, onClose, contentItem, currentUser, showMessage, openCommentsProp }) => {
    const [liveContentItem, setLiveContentItem] = useState(contentItem);
    const [creatorProfile, setCreatorProfile] = useState(null);
    const [descriptionExpanded, setDescriptionExpanded] = useState(false);
    const viewCountedRef = useRef(false);
    // const tiktokContainerRef = useRef(null); // REMOVED
    const itemType = useMemo(() => liveContentItem?.eventTitle ? 'event' : 'content', [liveContentItem]);
    const { embedUrl, isVertical, platform } = useMemo(() => extractVideoInfo(videoUrl), [videoUrl]);

    // The entire useEffect hook for TikTok script injection is now REMOVED.


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

    useEffect(() => {
        // This effect runs when the modal opens and checks the 'openCommentsProp'.
        // It's in a timeout to ensure the modal's animation completes and the liveContentItem state is set.
        if (openCommentsProp && liveContentItem?.id) {
            const timer = setTimeout(() => {
                window.dispatchEvent(new CustomEvent('openCommentsModal', { detail: { item: liveContentItem, itemType: itemType } }));
            }, 500); // A short delay for a smoother user experience
            return () => clearTimeout(timer);
        }
    }, [openCommentsProp, liveContentItem, itemType]);

    if (!videoUrl) return null;

    const displayViewCount = itemType === 'event' ? liveContentItem?.totalViewCount : liveContentItem?.viewCount;

    return (
        <div className="videoModalOverlay flex justify-center items-center">
            {/* THE FIX: For vertical video, constrain the HEIGHT. For horizontal, constrain the WIDTH. */}
            <div className={`bg-[#1A1A1A] w-full h-full md:max-w-[95vw] md:max-h-[95vh] md:rounded-lg overflow-hidden relative flex flex-col`}>
                <button className="closeButton" onClick={onClose}>×</button>
                
                {/* This container grows to fill parent, centers content, and provides the black background for letterboxing */}
                <div className="flex-1 min-h-0 flex justify-center items-center bg-black">
                
                    {/* 
                      This is the final, robust fix. It uses a simple, declarative approach.
                      - Horizontal videos get a full-width, 16:9 container.
                      - Vertical videos get a full-height, 9:16 container.
                      This properly constrains all video types within the modal.
                    */}
                    <div className={`
                        ${platform === 'facebook' 
                            ? 'w-full aspect-video' 
                            : `w-full h-full md:w-auto md:h-auto ${isVertical ? 'md:h-full md:aspect-[9/16]' : 'md:h-full md:aspect-video'}`
                        }
                    `}>
                        <iframe
                            src={embedUrl}
                            className="w-full h-full border-none"
                            allow="autoplay; encrypted-media; picture-in-picture;"
                            allowFullScreen
                            title="Embedded Video Content"
                        />
                    </div>

                </div>
                
                {/* This container for info does not grow */}
                <div className="bg-[#1A1A1A] p-3 md:p-4 overflow-y-auto w-full flex-shrink-0">
                    <div className="flex justify-between items-start mb-3 gap-4">
                        <h2 className="m-0 text-lg text-white font-semibold leading-tight flex-1">
                            {liveContentItem?.title}
                        </h2>
                        <div className="flex items-center gap-2 flex-shrink-0">
                            <ShareButton
                                title={liveContentItem?.title || 'NVA Content'}
                                text={`Check out "${liveContentItem?.title || 'this content'}" on NVA Network!`}
                                url={`/content/${liveContentItem?.id}`}
                                showMessage={showMessage}
                            />
                            <button
                                onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('openReportModal', { detail: liveContentItem })); }}
                                className="bg-[#3A3A3A] border-none rounded-full w-9 h-9 flex items-center justify-center cursor-pointer text-white"
                                title="More options"
                            >
                                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>
                            </button>
                        </div>
                    </div>
                    
                    <div className="flex justify-between items-center mb-3 gap-4">
                        <div 
                            className="flex items-center gap-2.5 cursor-pointer min-w-0"
                            onClick={() => {
                                window.dispatchEvent(new CustomEvent('navigateToUserProfile', { detail: { userId: liveContentItem.creatorId } }));
                                onClose();
                            }}
                        >
                            <img 
                                src={creatorProfile?.profilePictureUrl || 'https://placehold.co/40x40/555/FFF?text=P'} 
                                alt={creatorProfile?.creatorName} 
                                className="w-10 h-10 rounded-full object-cover"
                            />
                            <div className="min-w-0">
                                <div className="m-0 text-sm text-white font-bold flex items-center flex-wrap gap-y-1">
                                    <span className="whitespace-nowrap overflow-hidden text-ellipsis">
                                        {creatorProfile?.creatorName}
                                    </span>
                                    <RoleBadge profile={creatorProfile} />
                                </div>
                            </div>
                        </div>

                        {/* THE FIX: This block now checks for the 'isPromotion' flag before rendering */}
                        {currentUser && liveContentItem?.id && !liveContentItem.isPromotion && (
                            <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                                <LikeButton contentItem={liveContentItem} currentUser={currentUser} showMessage={showMessage} itemType={itemType} />
                                <button
                                    onClick={() => window.dispatchEvent(new CustomEvent('openCommentsModal', { detail: { item: liveContentItem, itemType: itemType } }))}
                                    className="bg-[#3A3A3A] border-none rounded-full flex items-center cursor-pointer text-white gap-1.5 px-3 h-9"
                                >
                                    <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M21.99 4c0-1.1-.89-2-1.99-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h14l4 4-.01-18z"></path></svg>
                                    <span>{(liveContentItem?.commentCount || 0).toLocaleString()}</span>
                                </button>
                            </div>
                        )}
                    </div>

                    {liveContentItem?.description && (
                        <div 
                            className="bg-[#2A2A2A] p-3 rounded-xl cursor-pointer"
                            onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                        >
                            {/* THE FIX: The View Count is now also hidden for promotions */}
                            {!liveContentItem.isPromotion && (
                                <p className="m-0 mb-2 text-sm text-white font-bold">
                                    {(displayViewCount || 0).toLocaleString()} Views
                                </p>
                            )}
                            <p className={`m-0 text-sm text-[#DDDDDD] leading-normal whitespace-pre-wrap ${!descriptionExpanded && 'line-clamp-2'}`}>
                                {liveContentItem.description}
                            </p>
                            {/* Only show 'more' if the description is actually long enough to be clamped */}
                            {(liveContentItem.description.length > 100) && (
                                <span className="text-[#AAAAAA] text-xs font-bold mt-1 inline-block">
                                    {descriptionExpanded ? 'Show less' : '...more'}
                                </span>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VideoPlayerModal;