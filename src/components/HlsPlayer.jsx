import React, { useEffect, useRef, useState, useMemo } from 'react';
import Hls from 'hls.js';

const HlsPlayer = ({ src, startTime, isTicketed, isAdmin }) => {
    const videoRef = useRef(null);
    const [hasJoined, setHasJoined] = useState(false);
    const [hasEnded, setHasEnded] = useState(false);

    // Converts Timestamp objects to numeric primitives to bypass reference re-renders
    const startTimeMillis = useMemo(() => {
        if (!startTime) return 0;
        if (startTime.toMillis) return startTime.toMillis();
        if (startTime.seconds) return startTime.seconds * 1000;
        return new Date(startTime).getTime();
    }, [startTime]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !src || !startTimeMillis) return;

        let hls;
        
        const now = Date.now();
        const offsetSeconds = Math.max(0, (now - startTimeMillis) / 1000);
        console.log(`🎬 [DEBUG] Target Sync Time: ${offsetSeconds.toFixed(2)}s`);

        // Edge case handlers to prevent finished videos from warping back to 0:00 on unmount/rejoin
        const handleMetadata = () => {
            if (video.duration && offsetSeconds >= video.duration) {
                console.log("🎬 [DEBUG] Sync limit hit. Broadcast concluded.");
                setHasEnded(true);
            }
        };

        const handleEnded = () => {
            setHasEnded(true);
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible' && !hasEnded) {
                const freshOffset = Math.max(0, (Date.now() - startTimeMillis) / 1000);
                if (video && Math.abs(video.currentTime - freshOffset) > 2) {
                    video.currentTime = freshOffset;
                    video.play().catch(() => {});
                }
            }
        };

        video.addEventListener('loadedmetadata', handleMetadata);
        video.addEventListener('ended', handleEnded);
        document.addEventListener('visibilitychange', handleVisibilityChange);

        if (Hls.isSupported()) {
            hls = new Hls({
                debug: false, 
                startPosition: offsetSeconds > 0 ? offsetSeconds : -1, 
                enableWorker: true,
                lowLatencyMode: false,
                maxBufferLength: 120, // MASSIVE buffer to survive R2 cold-starts
                maxMaxBufferLength: 120,
                backBufferLength: 30,
                manifestLoadingMaxRetry: 15,
                manifestLoadingRetryDelay: 1000,
                levelLoadingMaxRetry: 15,
                fragLoadingMaxRetry: 15,
                fragLoadingRetryDelay: 1000,
                capLevelToPlayerSize: true // Saves bandwidth, stops unnecessary buffering
            });
            
            hls.loadSource(src);
            hls.attachMedia(video);
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                // Secondary check for playlist duration metadata directly from level
                hls.on(Hls.Events.LEVEL_LOADED, (event, data) => {
                    const dur = data.details.totalduration;
                    if (dur && offsetSeconds >= dur) {
                        setHasEnded(true);
                    }
                });
                video.play().catch(() => console.warn("Autoplay blocked"));
            });
            
            hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            hls.recoverMediaError();
                            break;
                        default:
                            hls.destroy();
                            break;
                    }
                } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && data.details === 'bufferStalledError') {
                    // Force the playhead over tiny encoding gaps that cause stalling
                    if (video) video.currentTime += 0.1;
                }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari Native Fallback
            video.src = src;
            video.addEventListener('loadedmetadata', () => {
                if (offsetSeconds > 0) {
                    if (video.duration && offsetSeconds >= video.duration) {
                        setHasEnded(true);
                    } else {
                        video.currentTime = offsetSeconds;
                    }
                }
                video.play().catch(() => {});
            });
        }

        return () => {
            if (hls) hls.destroy();
            video.removeEventListener('loadedmetadata', handleMetadata);
            video.removeEventListener('ended', handleEnded);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [src, startTimeMillis]);

    const handleJoinTheater = () => {
        if (videoRef.current) {
            videoRef.current.muted = false; // Unmute audio
            videoRef.current.play().catch(() => {}); // Ensure playing
            setHasJoined(true);
        }
    };

    if (hasEnded) {
        return (
            <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden shadow-2xl border border-gray-800 flex flex-col items-center justify-center text-center p-6" style={{ position: 'relative' }}>
                <span style={{ fontSize: '48px', marginBottom: '10px' }}>🎬</span>
                <h3 style={{ color: '#FFD700', fontSize: '20px', fontWeight: '900', textTransform: 'uppercase', margin: '0 0 8px 0' }}>Broadcast Concluded</h3>
                <p style={{ color: '#888', fontSize: '13px', maxWidth: '380px', margin: 0 }}>This scheduled cinema screening has concluded. Keep an eye on the multiplex lobby for upcoming showtimes!</p>
            </div>
        );
    }

    return (
        <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden shadow-2xl border border-gray-800" style={{ position: 'relative' }}>
            <video 
                ref={videoRef} 
                className="w-full h-full" 
                controls={isAdmin} // Admins receive full browser playback/seeking controls, standard users do not
                playsInline
                webkit-playsinline="true"
                x-webkit-airplay="allow"
                airplay="allow"
                muted // Browsers ALLOW autoplay if muted
                autoPlay
            />
            
            {!hasJoined && !isAdmin && (
                <button 
                    onClick={handleJoinTheater}
                    style={{ position: 'absolute', bottom: '20px', right: '20px', padding: '10px 20px', backgroundColor: 'rgba(0,0,0,0.7)', color: '#FFF', fontWeight: 'bold', fontSize: '12px', borderRadius: '30px', border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', zIndex: 20, backdropFilter: 'blur(5px)', display: 'flex', alignItems: 'center', gap: '8px', transition: 'all 0.2s ease', boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }}
                    onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,215,0,0.9)'; e.currentTarget.style.color = '#000'; }}
                    onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.7)'; e.currentTarget.style.color = '#FFF'; }}
                >
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
                    Tap to Unmute
                </button>
            )}
        </div>
    );
};

export default HlsPlayer;