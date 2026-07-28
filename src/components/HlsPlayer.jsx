import React, { useEffect, useRef, useState, useMemo } from 'react';
import Hls from 'hls.js';
import { doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from '../firebase.js';

const HlsPlayer = ({ src, startTime, isTicketed, isAdmin, eventId }) => {
    const videoRef = useRef(null);
    const [hasJoined, setHasJoined] = useState(false);
    const [hasEnded, setHasEnded] = useState(false);
    const pauseTimeRef = useRef(null);

    // Converts Timestamp objects to numeric primitives to bypass reference re-renders
    const startTimeMillis = useMemo(() => {
        if (!startTime) return 0;
        if (startTime.toMillis) return startTime.toMillis();
        if (startTime.seconds) return startTime.seconds * 1000;
        return new Date(startTime).getTime();
    }, [startTime]);

    useEffect(() => {
        const video = videoRef.current;
        if (!video || !src) return;

        let hls;

        const handleEnded = () => {
            setHasEnded(true);
        };

        video.addEventListener('ended', handleEnded);

        if (Hls.isSupported()) {
            hls = new Hls({
                debug: false, 
                enableWorker: true,
                lowLatencyMode: true,
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
                backBufferLength: 15,
                manifestLoadingMaxRetry: 10,
                manifestLoadingRetryDelay: 500,
                liveSyncPosition: 0, // Force instant sync to active live segment edge
                capLevelToPlayerSize: true
            });
            
            hls.loadSource(src);
            hls.attachMedia(video);
            
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
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
                    if (video) video.currentTime += 0.1;
                }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // Safari Native Live HLS Fallback
            video.src = src;
            video.play().catch(() => {});
        }

        return () => {
            if (hls) hls.destroy();
            video.removeEventListener('ended', handleEnded);
        };
    }, [src]);

    // --- ADMIN TIMELESS PAUSE/PLAY GLOBAL SYNCHRONIZER ---
    useEffect(() => {
        const video = videoRef.current;
        if (!video || !isAdmin || !eventId) return;

        const handlePlay = async () => {
            if (pauseTimeRef.current) {
                const pauseDurationMs = Date.now() - pauseTimeRef.current;
                pauseTimeRef.current = null;
                
                if (pauseDurationMs > 1000) { // filter micro-stutter triggers
                    try {
                        const eventRef = doc(db, "events", eventId);
                        const newStartTimeMillis = startTimeMillis + pauseDurationMs;
                        await updateDoc(eventRef, {
                            actualStartTime: Timestamp.fromMillis(newStartTimeMillis)
                        });
                        console.log("🎬 [ADMIN] Sync playhead shifted forward globally by", (pauseDurationMs / 1000).toFixed(2), "seconds.");
                    } catch (e) {
                        console.error("Error updating stream playhead: ", e);
                    }
                }
            }
        };

        const handlePause = () => {
            pauseTimeRef.current = Date.now();
        };

        video.addEventListener('play', handlePlay);
        video.addEventListener('pause', handlePause);

        return () => {
            video.removeEventListener('play', handlePlay);
            video.removeEventListener('pause', handlePause);
        };
    }, [isAdmin, eventId, startTimeMillis]);

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
            
            {/* Dedicated Volume Control Overlay (Lock-safe: Allows Volume & Mute, Blocks Seeking) */}
            <div style={{ position: 'absolute', bottom: '15px', right: '15px', zIndex: 30, display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', padding: '6px 14px', borderRadius: '30px', border: '1px solid rgba(255,255,255,0.15)' }}>
                <button 
                    onClick={handleJoinTheater}
                    style={{ background: 'none', border: 'none', color: '#FFD700', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                    title="Toggle Mute / Unmute"
                >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor">
                        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                    </svg>
                </button>
                <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.05"
                    defaultValue="1"
                    onChange={(e) => {
                        if (videoRef.current) {
                            videoRef.current.volume = Number(e.target.value);
                            videoRef.current.muted = Number(e.target.value) === 0;
                            if (!hasJoined) setHasJoined(true);
                        }
                    }}
                    style={{ width: '60px', accentColor: '#FFD700', cursor: 'pointer' }}
                />
            </div>
        </div>
    );
};

export default HlsPlayer;