// src/components/DynamicThumbnail.jsx

import React, { useState, useEffect } from 'react';
// CORRECTED: Import the complete helper and firebase functions
import { extractVideoInfo, functions, httpsCallable } from '../firebase';

const GENERIC_THUMBNAIL_PLACEHOLDER = 'https://placehold.co/300x200/2A2A2A/FFF?text=NVA';

function DynamicThumbnail({ item, onClick }) {
    const [thumbnailSrc, setThumbnailSrc] = useState(GENERIC_THUMBNAIL_PLACEHOLDER);
    
    useEffect(() => {
        // This flag prevents state updates if the component unmounts during a fetch
        let isCancelled = false;

        const getThumbnail = async () => {
            // Priority 1: Always use an explicit image URL if provided.
            if (item.customThumbnailUrl || item.imageUrl) {
                if (!isCancelled) {
                    setThumbnailSrc(item.customThumbnailUrl || item.imageUrl);
                }
                return;
            }

            const info = extractVideoInfo(item.mainUrl || item.externalLink);

            // Priority 2: Use YouTube's reliable direct link.
            if (info.platform === 'youtube') {
                if (!isCancelled) {
                    setThumbnailSrc(info.thumbnailUrl);
                }
                return;
            }

            // Priority 3: For platforms that need it, call our secure proxy.
            if (info.platform === 'tiktok' || info.platform === 'vimeo') {
                try {
                    const oEmbedProxyCallable = httpsCallable(functions, 'oEmbedProxy');
                    
                    let oEmbedUrl = '';
                    if (info.platform === 'tiktok') {
                        oEmbedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(item.mainUrl || item.externalLink)}`;
                    }
                    if (info.platform === 'vimeo') {
                        oEmbedUrl = `https://vimeo.com/api/oembed.json?url=${encodeURIComponent(item.mainUrl || item.externalLink)}`;
                    }

                    const result = await oEmbedProxyCallable({ url: oEmbedUrl });

                    if (!isCancelled && result.data && result.data.thumbnail_url) {
                        setThumbnailSrc(result.data.thumbnail_url);
                    }
                } catch (error) {
                    console.error("oEmbed fetch failed for", info.platform, error);
                    // If the proxy fails, we will fall back to the generic placeholder.
                }
                return;
            }
            
            // If none of the above worked, the placeholder will remain.
        };

        getThumbnail();

        // Cleanup function to set the flag when the component unmounts
        return () => {
            isCancelled = true;
        };
    }, [item]); // Re-run only when the item itself changes.

    return (
        <div className="thumbnailPlaceholder" style={{backgroundImage: `url(${thumbnailSrc})`, backgroundSize: 'cover', backgroundPosition: 'center', position: 'relative'}} onClick={onClick}>
           <svg className="playIcon" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"></path></svg>
       </div>
   );
};

export default DynamicThumbnail;