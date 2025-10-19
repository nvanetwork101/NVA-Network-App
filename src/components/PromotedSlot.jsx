// src/components/PromotedSlot.jsx

import React, { useState, useEffect } from 'react';
import { db, onSnapshot, collection, query, where, limit } from '../firebase';

// A minimal version of this helper is included for self-containment
const extractVideoInfo = (url) => {
    if (!url || typeof url !== 'string') return { embedUrl: null };
    const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/ ]{11})/;
    const youtubeMatch = url.match(youtubeRegex);
    if (youtubeMatch && youtubeMatch[1]) {
        return { embedUrl: `https://www.youtube.com/embed/${youtubeMatch[1]}?autoplay=1&rel=0` };
    }
    // Add other platforms if needed, otherwise return the original url for embedding
    return { embedUrl: url };
};

function PromotedSlot({ showMessage, handleVideoPress, currentUser }) {
    const [livePromo, setLivePromo] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const statusesRef = collection(db, "promotedStatuses");
        const now = new Date();
        const q = query(
            statusesRef,
            where("status", "==", "approved_and_scheduled"),
            where("startTime", "<=", now),
            where("expiresAt", ">", now),
            limit(1)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                setLivePromo({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
            } else {
                setLivePromo(null);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const handlePromoClick = () => {
        if (!livePromo || !livePromo.content) return;
        const { content } = livePromo;

        // Priority 1: Handle Video Content
        if (content.adVideoUrl) {
            const { embedUrl } = extractVideoInfo(content.adVideoUrl);
            
            // THE DEFINITIVE FIX: Create a minimal object with an explicit 'isPromotion' flag.
            const promoContentItem = {
                id: livePromo.id,
                title: content.title,
                description: content.description,
                isPromotion: true // This is the new, critical flag
            };

            handleVideoPress(embedUrl || content.adVideoUrl, promoContentItem);
        
        // Priority 2: Handle External Links
        } else if (content.destinationUrl) {
            window.open(content.destinationUrl, '_blank');
        
        // Priority 3: Handle Image-Only promotions (remains the same)
       } else if (content.flyerImageUrl) {
            window.dispatchEvent(new CustomEvent('openImageViewer', { 
                detail: { 
                    imageUrl: content.flyerImageUrl,
                    description: content.description,
                    itemId: livePromo.id,         // <--- CRITICAL: Pass the Ad ID
                    itemType: 'promotedStatus'    // <--- CRITICAL: Pass the Ad Type
                } 
            }));
        
        // Fallback
        } else {
            showMessage("This promotion has no content attached.");
        }
    };

    if (loading || !livePromo) {
        return null; 
    }

    return (
        <div 
            className="allCampaignsListItem" 
            style={{border: '2px solid #00FFFF', background: 'rgba(0, 255, 255, 0.05)', cursor: 'pointer', marginBottom: '20px', alignItems: 'center'}}
            onClick={handlePromoClick}
        >
            <div style={{
                width: '80px',
                height: '80px',
                flexShrink: 0, 
                marginRight: '15px',
                borderRadius: '8px',
                overflow: 'hidden',
                backgroundColor: '#1A1A1A'
            }}>
                <img
                    src={livePromo.content.flyerImageUrl}
                    alt={livePromo.content.title}
                    style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover'
                    }}
                    onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/100x100/1A1A1A/00FFFF?text=Ad'; }}
                />
            </div>

            <div className="campaignListContent" style={{ minWidth: 0 }}>
                <div className="campaignListTitle" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                    <span style={{color: '#00FFFF'}}>{livePromo.content.title}</span> 
                    <span style={{fontSize: '12px', color: '#0A0A0A', backgroundColor: '#00FFFF', padding: '3px 8px', borderRadius: '10px', fontWeight: 'bold'}}>★ Promoted</span>
                </div>
                <>
                    {/* This paragraph ONLY appears if a description exists. */}
                    {livePromo.content.description && (
                        <p className="campaignListDescription" style={{ WebkitLineClamp: 2, marginBottom: '4px' }}>
                            {livePromo.content.description}
                        </p>
                    )}
                    {/* This paragraph ONLY appears if a clickable link exists. */}
                    {(livePromo.content.adVideoUrl || livePromo.content.destinationUrl) && (
                         <p className="campaignListDescription" style={{ WebkitLineClamp: 1, color: '#00FFFF', opacity: 0.8, fontSize: '13px' }}>
                            Click to learn more.
                        </p>
                    )}
                </>
            </div>
        </div>
    );
};

export default PromotedSlot;