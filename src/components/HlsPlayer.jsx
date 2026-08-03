import React, { useEffect, useRef, useState, useMemo } from 'react';
import Hls from 'hls.js';
import { doc, updateDoc, Timestamp } from "firebase/firestore";
import { db } from '../firebase.js';

const HlsPlayer = ({ src, startTime, isTicketed, isAdmin, eventId }) => {
    const videoRef = useRef(null);
    const [hasJoined, setHasJoined] = useState(false);
    const [hasEnded, setHasEnded] = useState(false);
    const [showControls, setShowControls] = useState(false);
    const [isMuted, setIsMuted] = useState(true);
    const controlsTimeoutRef = useRef(null);
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

    const handleJoinTheater = (e) => {
        if (e) e.stopPropagation();
        if (videoRef.current) {
            videoRef.current.muted = false; // Unmute audio
            videoRef.current.play().catch(() => {}); // Ensure playing
            setIsMuted(false);
            setHasJoined(true);
            triggerControls(); // Show volume bar immediately after unmuting
        }
    };

    const triggerControls = () => {
        setShowControls(true);
        if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
        controlsTimeoutRef.current = setTimeout(() => {
            setShowControls(false);
        }, 5000); // Fades out after 5 seconds
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
        <div 
            className="relative w-full aspect-video bg-black rounded-lg overflow-hidden shadow-2xl border border-gray-800" 
            style={{ position: 'relative' }}
            onClick={triggerControls}
        >
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

            {/* THE FIX: Absolute Tap To Unmute Priority Overlay */}
            {isMuted && !hasJoined && (
                <button
                    type="button"
                    onClick={handleJoinTheater}
                    style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 40, backgroundColor: 'rgba(0, 0, 0, 0.85)', color: '#FFD700', border: '2px solid #FFD700', borderRadius: '30px', padding: '12px 24px', fontSize: '14px', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 0 25px rgba(255, 215, 0, 0.5)', backdropFilter: 'blur(8px)' }}
                >
                    🔇 TAP TO UNMUTE
                </button>
            )}
            
            {/* Dedicated Volume Control Overlay (Lock-safe: Allows Volume & Mute, Blocks Seeking) */}
            <div style={{ 
                position: 'absolute', bottom: '15px', right: '15px', zIndex: 30, display: 'flex', alignItems: 'center', gap: '8px', 
                background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)', padding: '6px 14px', borderRadius: '30px', border: '1px solid rgba(255,255,255,0.15)',
                opacity: showControls ? 1 : 0, transition: 'opacity 0.3s ease', pointerEvents: showControls ? 'auto' : 'none' 
            }}>
                <button 
                    onClick={(e) => {
                        e.stopPropagation();
                        if (videoRef.current) {
                            videoRef.current.muted = !videoRef.current.muted;
                            setIsMuted(videoRef.current.muted);
                        }
                    }}
                    style={{ background: 'none', border: 'none', color: isMuted ? '#DC3545' : '#FFD700', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                    title="Toggle Mute / Unmute"
                >
                    {isMuted ? (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>
                    ) : (
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>
                    )}
                </button>
                <input 
                    type="range" 
                    min="0" 
                    max="1" 
                    step="0.05"
                    defaultValue="1"
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                        if (videoRef.current) {
                            const val = Number(e.target.value);
                            videoRef.current.volume = val;
                            videoRef.current.muted = val === 0;
                            setIsMuted(val === 0);
                            if (!hasJoined) setHasJoined(true);
                            triggerControls();
                        }
                    }}
                    style={{ width: '60px', accentColor: '#FFD700', cursor: 'pointer' }}
                />
            </div>
        </div>
    );
};

export default HlsPlayer;