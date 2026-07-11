// src/components/RoastRoomScreen.jsx
import React, { useState, useEffect, useRef } from 'react';
import { LiveKitRoom, RoomAudioRenderer, useTracks, VideoTrack, useRoomContext } from '@livekit/components-react';
import { Track } from 'livekit-client';
import "@livekit/components-styles";
import { db, functions, doc, onSnapshot, updateDoc, httpsCallable } from '../firebase';

// SECURITY FIX: Deployed HTTPS sites require wss:// (WebSocket Secure). 
// You MUST point this to a domain with a valid SSL certificate (e.g., livekit.nvanetworkapp.com) [1]
const LIVEKIT_URL = "wss://livekit.nvanetworkapp.com";

// --- MODERN VIEW COUNT COMPONENT ---
const ViewerCount = () => {
    const room = useRoomContext();
    const [count, setCount] = useState(0);
    useEffect(() => {
        const i = setInterval(() => setCount(room.numParticipants), 2000);
        return () => clearInterval(i);
    }, [room]);
    return (
        <div className="glass-pill" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#FF2A2A', boxShadow: '0 0 10px #FF2A2A', animation: 'pulse 1.5s infinite' }}></div>
            <span style={{ color: '#FFF', fontSize: '11px', fontWeight: '800', letterSpacing: '0.05em' }}>{count}</span>
            <svg viewBox="0 0 24 24" fill="currentColor" width="12" height="12" style={{ color: '#888' }}><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 10c-2.48 0-4.5-2.02-4.5-4.5S9.52 5.5 12 5.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5zM12 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>
        </div>
    );
};

function RoastRoomContent({ battleState, currentUser, creatorProfile, showMessage, handleExit }) {
    const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
    const isHost = creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority';

    // --- 4-PHASE HUD & MUTUALLY EXCLUSIVE AUDIO LOGIC ---
    const isSuspense = battleState.status === 'suspense'; 
    const isBattle = battleState.status === 'battle';     
    const isFinalSeconds = isBattle && battleState.timer > 0 && battleState.timer <= 5;
    
    const tickAudioRef = useRef(null);
    
    useEffect(() => {
        tickAudioRef.current = new Audio('/sounds/high-tension-tick.mp3');
        return () => { 
            if (tickAudioRef.current) {
                tickAudioRef.current.pause();
                tickAudioRef.current = null;
            }
        };
    }, []);

    useEffect(() => {
        if (!tickAudioRef.current) return;
        if (isSuspense || isFinalSeconds) {
            tickAudioRef.current.loop = true;
            tickAudioRef.current.play().catch(() => {});
        } else {
            tickAudioRef.current.pause();
            tickAudioRef.current.currentTime = 0;
        }
    }, [isSuspense, isFinalSeconds]);

    const [faceCoords, setFaceCoords] = useState({ x: 50, y: 30, width: 20, height: 20 }); 
    const [flyingEmojis, setFlyingEmojis] = useState([]);
    const faceDetectionRef = useRef(null);

    useEffect(() => {
        let active = true;
        let animationFrameId = null;

        const initFaceDetection = async () => {
            try {
                const { FaceDetection } = await import('@mediapipe/face_detection');
                const detector = new FaceDetection({
                    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
                });

                detector.setOptions({
                    model: 'short',
                    minDetectionConfidence: 0.5
                });

                detector.onResults((results) => {
                    if (!active || !results.detections || results.detections.length === 0) return;
                    const detection = results.detections[0];
                    const box = detection.boundingBox;
                    
                    const x = (box.xCenter + (box.width / 2)) * 100;
                    const y = (box.yCenter + (box.height / 2)) * 100;
                    const width = box.width * 100;
                    const height = box.height * 100;

                    setFaceCoords({ x, y, width, height });
                });

                faceDetectionRef.current = detector;
            } catch (err) {
                console.error("Face detection failed to load:", err);
            }
        };

        initFaceDetection();

        const processVideo = async () => {
            if (faceDetectionRef.current) {
                const localVideo = document.querySelector('video');
                if (localVideo && localVideo.readyState >= 2) {
                    try {
                        await faceDetectionRef.current.send({ image: localVideo });
                    } catch (e) {}
                }
            }
            animationFrameId = requestAnimationFrame(processVideo);
        };
        processVideo();

        return () => {
            active = false;
            if (animationFrameId) cancelAnimationFrame(animationFrameId);
            if (faceDetectionRef.current) {
                faceDetectionRef.current.close();
            }
        };
    }, []);

    const handleReaction = async (type) => {
        if ((creatorProfile?.roastTokens || 0) < 1) {
            showMessage("1 Pass required. Top up in the Vault.");
            return;
        }

        const id = Date.now();
        setFlyingEmojis(prev => [...prev, { id, type }]);
        setTimeout(() => setFlyingEmojis(prev => prev.filter(e => e.id !== id)), 1500);

        try {
            const sendFunc = httpsCallable(functions, 'sendRoastReaction');
            await sendFunc({ reactionType: type });
        } catch (err) { showMessage("Reaction failed."); }
    };

    const handleClockIn = async () => {
        if ((creatorProfile?.roastTokens || 0) < 5) {
            showMessage("5 Passes required to Step to the Mic.");
            return;
        }
        try {
            const clockFunc = httpsCallable(functions, 'clockIntoRoast');
            await clockFunc();
        } catch (err) { showMessage(err.message); }
    };

    const handleShareArena = async (e) => {
        e.stopPropagation();
        const shareUrl = battleState.hostId ? `${window.location.origin}/user/${battleState.hostId}` : `${window.location.origin}/LiveDirectory`;
        const text = `🔴 The Roast Arena is LIVE! Step into the heat and witness the battle:`;
        
        if (navigator.share) {
            try { await navigator.share({ title: 'Live Roast Arena', text: text, url: shareUrl }); }
            catch (err) { if (err.name !== 'AbortError') console.error("Sharing failed:", err); }
        } else {
            navigator.clipboard.writeText(`${text} ${shareUrl}`).then(() => {
                showMessage("Arena link copied!");
            }).catch(() => showMessage("Failed to copy link."));
        }
    };

    return (
        <div className={`${isFinalSeconds ? 'shake-active' : ''} ${isSuspense ? 'hud-warning-border' : ''}`} style={{ height: '100%', width: '100%', position: 'relative', display: 'flex', flexDirection: 'column', backgroundColor: '#050505', overflow: 'hidden', transition: 'box-shadow 0.3s ease' }}>
            <style>{`
                @keyframes screen-shake { 0% { transform: translate(2px, 1px) rotate(0deg); } 10% { transform: translate(-1px, -2px) rotate(-1deg); } 20% { transform: translate(-3px, 0px) rotate(1deg); } 30% { transform: translate(3px, 2px) rotate(0deg); } 40% { transform: translate(1px, -1px) rotate(1deg); } 50% { transform: translate(-1px, 2px) rotate(-1deg); } 60% { transform: translate(-3px, 1px) rotate(0deg); } 70% { transform: translate(3px, 1px) rotate(-1deg); } 80% { transform: translate(-1px, -1px) rotate(1deg); } 90% { transform: translate(1px, 2px) rotate(0deg); } 100% { transform: translate(1px, -2px) rotate(-1deg); } }
                @keyframes fly-up { 0% { transform: translateY(0) scale(1); opacity: 1; } 100% { transform: translateY(-120px) scale(2.5); opacity: 0; } }
                @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
                @keyframes ignite {
                    0% { transform: translate(-50%, -20%) scale(0); opacity: 0; filter: hue-rotate(0deg) brightness(2); }
                    20% { transform: translate(-50%, -50%) scale(1.3); opacity: 1; }
                    80% { transform: translate(-50%, -55%) scale(1.1); opacity: 1; }
                    100% { transform: translate(-50%, -60%) scale(0.8); opacity: 0; }
                }
                @keyframes splat {
                    0% { transform: translate(-50%, -50%) scale(0.2); opacity: 1; }
                    30% { transform: translate(-50%, -50%) scale(1.4) rotate(15deg); opacity: 1; }
                    50% { transform: translate(-50%, -45%) scale(1.5) skewX(10deg); opacity: 0.9; }
                    100% { transform: translate(-50%, -35%) scale(1.3) skewX(15deg); opacity: 0; }
                }
                
                .hud-warning-border { box-shadow: inset 0 0 60px 15px rgba(255, 0, 0, 0.8) !important; }
                .shake-active { animation: screen-shake 0.3s infinite; box-shadow: inset 0 0 40px 10px rgba(255, 69, 0, 0.6); }
                
                /* Sleek Premium Utilities */
                .glass-pill { background: rgba(15, 15, 15, 0.65); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 100px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
                .text-truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                
                /* Video Layout */
                .video-grid { display: grid; gap: 8px; width: 100%; height: 100%; padding: 0; margin: 0; }
                .video-cell { position: relative; background: #000; overflow: hidden; border-radius: 0; }
                @media (min-width: 768px) { .video-grid { padding: 16px; gap: 16px; } .video-cell { border-radius: 24px; border: 1px solid rgba(255,255,255,0.05); } }
            `}</style>
            
            {/* --- TOP FLOATING HEADER --- */}
            <div style={{ position: 'absolute', top: '16px', left: '16px', right: '16px', zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pointerEvents: 'none' }}>
                <div style={{ display: 'flex', gap: '8px', pointerEvents: 'auto' }}>
                    <ViewerCount />
                    <div className="glass-pill" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', color: '#FFD700', fontSize: '11px', fontWeight: '800' }}>
                        <span>🎟️</span>
                        <span>{creatorProfile?.roastTokens || 0} PASSES</span>
                    </div>
                    <button onClick={handleShareArena} className="glass-pill" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', cursor: 'pointer', color: '#FFF', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(15,15,15,0.65)'}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
                    </button>
                </div>

                <button onClick={handleExit} className="glass-pill" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', cursor: 'pointer', pointerEvents: 'auto', border: '1px solid rgba(255, 42, 42, 0.3)' }}>
                    <span style={{ color: '#FF2A2A', fontSize: '11px', fontWeight: '900', letterSpacing: '0.05em' }}>EXIT</span>
                </button>
            </div>

            {/* --- THE STREAK HUD --- */}
            <div style={{ position: 'absolute', top: '70px', left: '50%', transform: 'translateX(-50%)', zIndex: 100, pointerEvents: 'none' }}>
                <div className="glass-pill" style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '8px 24px', border: `1px solid ${battleState.hostStreak >= 0 ? 'rgba(0,255,255,0.2)' : 'rgba(255,42,42,0.2)'}` }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ color: '#AAA', fontSize: '9px', fontWeight: '800', letterSpacing: '0.1em', textTransform: 'uppercase' }}>zero points streak</span>
                        <span style={{ color: '#FFF', fontSize: '16px', fontWeight: '900', fontFamily: 'monospace' }}>
                            {battleState.hostStreak >= 0 ? `+${battleState.hostStreak}` : battleState.hostStreak}
                        </span>
                    </div>
                    {battleState.timer > 0 && (
                        <>
                            <div style={{ width: '1px', height: '24px', background: 'rgba(255,255,255,0.1)' }}></div>
                            <div style={{ color: '#FFD700', fontSize: '20px', fontWeight: '900', fontFamily: 'monospace', textShadow: '0 0 15px rgba(255,215,0,0.4)' }}>
                                00:{battleState.timer < 10 ? `0${battleState.timer}` : battleState.timer}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* --- THE VIDEO STAGE --- */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {(() => {
                    const visibleTracks = tracks.filter(t => {
                        const pId = t.participant.identity;
                        return pId === battleState.hostId || pId === battleState.roasterId;
                    });
                    
                    return (
                        <div className="video-grid" style={{ gridTemplateColumns: visibleTracks.length > 1 ? '1fr 1fr' : '1fr', gridTemplateRows: visibleTracks.length > 1 && window.innerWidth < 768 ? '1fr 1fr' : '1fr' }}>
                            {visibleTracks.length > 0 ? visibleTracks.map((t, idx) => {
                                const isPrimaryTarget = t.participant.identity === currentUser?.uid; 
                                
                                return (
                                    <div key={`${t.participant.identity}-${t.source}`} className="video-cell">
                                        <VideoTrack trackRef={t} style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
                                        
                                        {/* EMOJI ANCHOR */}
                                        {isPrimaryTarget && (
                                            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50 }}>
                                                {flyingEmojis.filter(e => e.type === 'fire').map(e => (
                                                    <div key={e.id} style={{
                                                        position: 'absolute',
                                                        top: `${faceCoords.y - (faceCoords.height * 0.65)}%`,
                                                        left: `${faceCoords.x}%`,
                                                        transform: 'translate(-50%, -50%)',
                                                        fontSize: `${faceCoords.width * 1.5}px`,
                                                        animation: 'ignite 1.5s ease-out forwards',
                                                        pointerEvents: 'none',
                                                        zIndex: 100,
                                                        filter: 'drop-shadow(0 0 20px #FF4500)'
                                                    }}>
                                                        🔥
                                                    </div>
                                                ))}
                                                {flyingEmojis.filter(e => e.type === 'tomato').map(e => (
                                                    <div key={e.id} style={{
                                                        position: 'absolute',
                                                        top: `${faceCoords.y}%`,
                                                        left: `${faceCoords.x}%`,
                                                        transform: 'translate(-50%, -50%)',
                                                        fontSize: `${faceCoords.width * 1.2}px`,
                                                        animation: 'splat 1.5s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards',
                                                        pointerEvents: 'none',
                                                        zIndex: 101,
                                                        filter: 'drop-shadow(0 8px 16px rgba(0,0,0,0.4))'
                                                    }}>
                                                        💥🍅💦
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* CLEAN PARTICIPANT TAG (Bottom Left) */}
                                        <div style={{ position: 'absolute', bottom: visibleTracks.length > 1 && window.innerWidth < 768 && idx === 1 ? '100px' : '20px', left: '16px', right: '16px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', zIndex: 60, pointerEvents: 'none' }}>
                                            <div className="glass-pill" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', maxWidth: '70%' }}>
                                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ADE80', boxShadow: '0 0 8px #4ADE80' }}></div>
                                                <span className="text-truncate" style={{ color: '#FFF', fontSize: '13px', fontWeight: '800' }}>
                                                    {t.participant.name || 'User'}
                                                </span>
                                            </div>
                                    
                                    {isHost && !t.participant.isLocal && (
                                        <button 
                                            onClick={async (e) => {
                                                e.stopPropagation();
                                                try {
                                                    const kickFunc = httpsCallable(functions, 'kickParticipant');
                                                    await kickFunc({ identity: t.participant.identity });
                                                } catch (err) { showMessage("Kick failed."); }
                                            }}
                                            className="glass-pill"
                                            style={{ background: 'rgba(220,53,69,0.8)', border: '1px solid #DC3545', color: '#FFF', padding: '6px 12px', fontSize: '10px', fontWeight: '900', cursor: 'pointer', textTransform: 'uppercase', pointerEvents: 'auto' }}
                                        >
                                            Drop
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    }) : (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#333' }}>
                            <div style={{ width: '80px', height: '80px', borderRadius: '50%', border: '1px solid #333', background: 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '16px' }}>
                                <span style={{ fontSize: '24px', opacity: 0.5 }}>🎙️</span>
                            </div>
                            <p style={{ fontWeight: '800', fontSize: '11px', letterSpacing: '0.1em', color: '#666' }}>AWAITING SIGNAL...</p>
                        </div>
                    )}
                </div>
            </div>

            {/* --- INTERACTIVE ACTION TRAY (FLOATING BOTTOM) --- */}
            <div style={{ position: 'absolute', bottom: '24px', left: '0', right: '0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', zIndex: 100, pointerEvents: 'none' }}>
                
                {/* Only visible to viewers during Idle phase */}
                {battleState.status === 'idle' && !isHost && (
                    <button 
                        onClick={handleClockIn} 
                        style={{ pointerEvents: 'auto', background: 'rgba(255,69,0,0.15)', color: '#FF4500', padding: '8px 20px', borderRadius: '20px', fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', border: '1px solid #FF4500', cursor: 'pointer', backdropFilter: 'blur(10px)', transition: 'transform 0.1s', display: 'flex', alignItems: 'center', gap: '6px' }}
                        onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
                        onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        <span>🎙️</span> ROAST
                    </button>
                )}

                {/* THE REACTION DOCK */}
                <div className="glass-pill" style={{ pointerEvents: 'auto', display: 'flex', gap: '8px', padding: '8px', background: 'rgba(10,10,10,0.75)', boxShadow: '0 15px 40px rgba(0,0,0,0.6)' }}>
                    {['🔥', '😂', '💀', '🍅'].map(emoji => (
                        <button 
                            key={emoji} 
                            onClick={() => handleReaction(emoji === '🔥' ? 'fire' : 'tomato')}
                            style={{ width: '44px', height: '44px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '50%', cursor: 'pointer', transition: 'all 0.15s ease' }}
                            onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
                            onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                        >
                            {emoji}
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
}

function RoastRoomScreen({ setActiveScreen, currentUser, creatorProfile, showMessage }) {
    const [token, setToken] = useState(null);
    const [battleState, setBattleState] = useState({ status: 'idle', hostStreak: 0, timer: 0 });

    useEffect(() => {
        const fetchToken = async () => {
            try {
                const getFunc = httpsCallable(functions, 'getRoastRoomToken');
                const res = await getFunc({ roomName: "main-arena" });
                setToken(res.data.token);
            } catch (err) { showMessage("Arena handshake failed."); }
        };
        fetchToken();
        const unsub = onSnapshot(doc(db, "live_arena", "main-arena"), (s) => s.exists() && setBattleState(s.data()));
        
        return () => {
            unsub();
            if (currentUser) {
                updateDoc(doc(db, "creators", currentUser.uid), { isLive: false, liveRoomType: null }).catch(() => {});
            }
        };
    }, [creatorProfile, currentUser]);

    const handleExit = async () => {
        if (creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority') {
            try {
                await updateDoc(doc(db, "creators", currentUser.uid), { isLive: false });
            } catch (e) { console.error(e); }
        }
        setActiveScreen('Home');
    };

    if (!token) {
        return (
            <div className="screenContainer" style={{ backgroundColor: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
                <style>{`
                    @keyframes pulse-ring { 0% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(255, 69, 0, 0.7); } 70% { transform: scale(1); box-shadow: 0 0 0 20px rgba(255, 69, 0, 0); } 100% { transform: scale(0.8); box-shadow: 0 0 0 0 rgba(255, 69, 0, 0); } }
                `}</style>
                <div style={{ width: '80px', height: '80px', borderRadius: '50%', background: '#FF4500', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '32px', animation: 'pulse-ring 2s infinite', marginBottom: '32px' }}>
                    🎙️
                </div>
                <p style={{ color: '#FFF', fontWeight: '800', letterSpacing: '0.1em', fontSize: '14px', textTransform: 'uppercase' }}>Entering the Arena...</p>
            </div>
        );
    }

    return (
        <div className="screenContainer" style={{ padding: 0, backgroundColor: '#000', height: '100vh', overflow: 'hidden' }}>
            {/* THE FIX: Auto-trigger camera/mic only if user is an authorized Host [1] */}
            <LiveKitRoom 
                serverUrl={LIVEKIT_URL} 
                token={token} 
                connect={true} 
                video={currentUser?.uid === battleState.hostId || currentUser?.uid === battleState.roasterId}
                audio={currentUser?.uid === battleState.hostId || currentUser?.uid === battleState.roasterId}
                style={{ width: '100%', height: '100%' }}
            >
                <RoastRoomContent battleState={battleState} currentUser={currentUser} creatorProfile={creatorProfile} showMessage={showMessage} handleExit={handleExit} />
                <RoomAudioRenderer />
            </LiveKitRoom>
        </div>
    );
}

export default RoastRoomScreen;