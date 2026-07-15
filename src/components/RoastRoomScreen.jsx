// src/components/RoastRoomScreen.jsx
import React, { useState, useEffect, useRef } from 'react';
import { LiveKitRoom, RoomAudioRenderer, useTracks, VideoTrack, useRoomContext } from '@livekit/components-react';
import { Track } from 'livekit-client';
import "@livekit/components-styles";
import { db, functions, doc, onSnapshot, updateDoc, setDoc, httpsCallable } from '../firebase';

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

function RoastRoomContent({ battleState, currentUser, creatorProfile, showMessage, handleExit, setLocalMediaIntent, hostId }) {
    const room = useRoomContext();
    const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
    const isHost = currentUser?.uid === battleState.hostId || currentUser?.uid === hostId;
    const isRoaster = currentUser?.uid === battleState.roasterId;

    // --- LOCAL TICKING ENGINE (Bypasses Firestore Latency) ---
    const [localTimer, setLocalTimer] = useState(0);

    useEffect(() => {
        setLocalTimer(battleState.timer);
    }, [battleState.timer, battleState.status]);

    useEffect(() => {
        if (localTimer <= 0) {
            // Trigger authoritative phase transition only if you are the Host
            if (isHost && battleState.status !== 'idle') {
                const advanceFunc = httpsCallable(functions, 'advanceArenaPhase');
                advanceFunc({ hostId }).catch(() => {});
            }
            return;
        }
        const interval = setInterval(() => {
            setLocalTimer(prev => Math.max(0, prev - 1));
        }, 1000);
        return () => clearInterval(interval);
    }, [localTimer, isHost, battleState.status]);

    // --- AUTOMATIC AUDIO MUTING (Isolates the active speaker) ---
    useEffect(() => {
        if (!room) return;
        const shouldMuteHost = isHost && battleState.status === 'battle' && battleState.currentReceiver === 'roaster';
        const shouldUnmuteHost = isHost && battleState.status === 'battle' && battleState.currentReceiver === 'host';
        
        if (shouldMuteHost) {
            room.localParticipant.setMicrophoneEnabled(false).catch(() => {});
        } else if (shouldUnmuteHost) {
            room.localParticipant.setMicrophoneEnabled(true).catch(() => {});
        }
    }, [room, battleState.status, battleState.currentReceiver, isHost]);

    // --- ROASTER CHOOSE WEAPON STATE ---
    const [roasterMediaChoice, setRoasterMediaChoice] = useState(null);

    useEffect(() => {
        if (battleState.status === 'idle') {
            setRoasterMediaChoice(null);
        }
    }, [battleState.status]);

    const selectRoasterHardware = async (choice) => {
        setRoasterMediaChoice(choice);
        if (!room) return;
        try {
            if (choice === 'both') {
                await room.localParticipant.setCameraEnabled(true);
                await room.localParticipant.setMicrophoneEnabled(true);
            } else {
                await room.localParticipant.setCameraEnabled(false);
                await room.localParticipant.setMicrophoneEnabled(true);
            }
        } catch (err) {
            showMessage("Hardware permission denied.");
        }
    };

    // Dynamic extraction of the Host's real name from WebRTC participants or Firestore profile
    const hostTrack = tracks.find(t => t.participant.identity === battleState.hostId);
    const hostRealName = hostTrack?.participant.name || 
                         (currentUser?.uid === battleState.hostId ? (creatorProfile?.creatorName || creatorProfile?.displayName) : null) || 
                         "NVA Host";

    // --- 4-PHASE HUD & MUTUALLY EXCLUSIVE AUDIO LOGIC ---
    const isSuspense = battleState.status === 'suspense'; 
    const isBattle = battleState.status === 'battle';     
    const isFinalSeconds = isBattle && localTimer > 0 && localTimer <= 5;
    
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

    // --- REAL-TIME DATA CHANNEL MESSAGING & REACTION LISTENER ---
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    const [showChat, setShowChat] = useState(true);
    const [showEmojiPicker, setShowEmojiPicker] = useState(false);
    const [flyingEmojis, setFlyingEmojis] = useState([]);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        if (messagesEndRef.current) {
            messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [chatMessages]);

    useEffect(() => {
        if (!room) return;

        const handleDataReceived = (payload, participant) => {
            const decoder = new TextDecoder();
            const messageStr = decoder.decode(payload);
            try {
                const packet = JSON.parse(messageStr);
                
                if (packet.type === 'chat') {
                    setChatMessages(prev => [...prev, {
                        id: Date.now() + Math.random(),
                        sender: participant?.name || 'User',
                        text: packet.text,
                        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    }]);
                } else if (packet.type === 'reaction') {
                    const id = Date.now();
                    const randomX = Math.floor(Math.random() * 60) + 20; // 20% to 80% screen offset
                    setFlyingEmojis(prev => [...prev, { id, emoji: packet.emoji, x: randomX }]);
                    setTimeout(() => setFlyingEmojis(prev => prev.filter(e => e.id !== id)), 2000);
                }
            } catch (e) {
                console.error("Failed to parse data message:", e);
            }
        };

        room.on('dataReceived', handleDataReceived);
        return () => {
            room.off('dataReceived', handleDataReceived);
        };
    }, [room]);

    const handleSendReaction = async (emojiString) => {
        if ((creatorProfile?.arenaTokens || 0) < 1) {
            showMessage("1 Token required. Top up in the Vault.");
            return;
        }

        // Determine emoji symbol based on string ID for local flight
        let localEmoji = emojiString;
        if (emojiString === 'fire') localEmoji = '🔥';
        if (emojiString === 'tomato') localEmoji = '🍅';
        if (emojiString === 'laugh') localEmoji = '😂';
        if (emojiString === 'theme') {
            if (battleState.liveRoomType === 'shoot_shot') localEmoji = '🌹';
            else if (battleState.liveRoomType === 'debate') localEmoji = '💯';
            else if (battleState.liveRoomType === 'cypher') localEmoji = '🎤';
            else if (battleState.liveRoomType === 'pitch') localEmoji = '💼';
            else localEmoji = '💀';
        }

        const id = Date.now();
        const randomX = Math.floor(Math.random() * 60) + 20;
        setFlyingEmojis(prev => [...prev, { id, emoji: localEmoji, x: randomX }]);
        setTimeout(() => setFlyingEmojis(prev => prev.filter(e => e.id !== id)), 2000);

        if (room) {
            const encoder = new TextEncoder();
            const data = encoder.encode(JSON.stringify({ type: 'reaction', emoji: localEmoji }));
            room.localParticipant.publishData(data, { reliable: true }).catch(() => {});
        }

        try {
            const sendFunc = httpsCallable(functions, 'sendArenaReaction');
            await sendFunc({ reactionType: emojiString, hostId });
        } catch (err) { 
            console.error("Reaction sync failed:", err); 
        }
    };

    const handleSendChat = (e) => {
        e.preventDefault();
        if (!chatInput.trim() || !room) return;

        const payload = { type: 'chat', text: chatInput };
        const encoder = new TextEncoder();
        const data = encoder.encode(JSON.stringify(payload));

        room.localParticipant.publishData(data, { reliable: true })
            .then(() => {
                setChatMessages(prev => [...prev, {
                    id: Date.now(),
                    sender: creatorProfile?.creatorName || 'Me',
                    text: chatInput,
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                }]);
                setChatInput('');
            })
            .catch(() => showMessage("Failed to send text message."));
    };

    const handleClockIn = async () => {
        if ((creatorProfile?.arenaTokens || 0) < 5) {
            showMessage("5 Tokens required to Step to the Mic.");
            return;
        }
        try {
            setLocalMediaIntent(true);
            const clockFunc = httpsCallable(functions, 'clockIntoArena');
            await clockFunc({ hostId });
        } catch (err) { 
            setLocalMediaIntent(false);
            showMessage(err.message); 
        }
    };

    const handleShareArena = async (e) => {
        e.stopPropagation();
        const shareUrl = battleState.hostId ? `${window.location.origin}/user/${battleState.hostId}` : `${window.location.origin}/LiveDirectory`;
        const text = `🔴 The Roast Arena is LIVE! Step into the heat:`;
        
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
                @keyframes float-emoji-up { 
                    0% { transform: translateY(100vh) scale(0.6); opacity: 0; } 
                    10% { opacity: 1; }
                    90% { opacity: 0.9; }
                    100% { transform: translateY(-20vh) scale(2); opacity: 0; } 
                }
                @keyframes pulse { 0% { opacity: 1; } 50% { opacity: 0.5; } 100% { opacity: 1; } }
                
                .hud-warning-border { box-shadow: inset 0 0 60px 15px rgba(255, 0, 0, 0.8) !important; }
                .shake-active { animation: screen-shake 0.3s infinite; box-shadow: inset 0 0 40px 10px rgba(255, 69, 0, 0.6); }
                
                /* Streak Animation FX */
                @keyframes card-burn {
                    0% { box-shadow: 0 0 10px #FF4500, inset 0 0 10px #FF4500; border-color: #FF4500; }
                    50% { box-shadow: 0 0 30px #FFD700, inset 0 0 20px #FF8C00; border-color: #FFD700; }
                    100% { box-shadow: 0 0 10px #FF4500, inset 0 0 10px #FF4500; border-color: #FF4500; }
                }
                @keyframes card-splat {
                    0% { transform: scale(1); filter: sepia(50%) hue-rotate(-50deg); }
                    50% { transform: scale(0.95); filter: sepia(80%) hue-rotate(-50deg); }
                    100% { transform: scale(1); filter: sepia(50%) hue-rotate(-50deg); }
                }
                .fire-streak {
                    animation: card-burn 1.5s infinite alternate !important;
                    border: 3px solid #FF4500 !important;
                }
                .tomato-streak {
                    animation: card-splat 1s infinite alternate !important;
                    border: 3px solid #DC3545 !important;
                }
                .tomato-splat-overlay {
                    position: absolute;
                    inset: 0;
                    background: url('/images/tomato-splat.png') no-repeat center;
                    background-size: contain;
                    pointer-events: none;
                    z-index: 10;
                    opacity: 0.85;
                }
                
                @keyframes pulse-hud {
                    0% { transform: translate(-50%, -50%) scale(1); opacity: 0.9; }
                    50% { transform: translate(-50%, -50%) scale(1.08); opacity: 1; text-shadow: 0 0 25px currentColor; }
                    100% { transform: translate(-50%, -50%) scale(1); opacity: 0.9; }
                }
                .game-hud-overlay {
                    position: absolute;
                    top: 45%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 150;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    pointer-events: none;
                    animation: pulse-hud 1.2s infinite ease-in-out;
                    width: 90%;
                    text-align: center;
                }
                .hud-headline {
                    font-family: 'Impact', 'Arial Black', sans-serif;
                    font-size: 38px;
                    font-weight: 900;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    margin: 0;
                    padding: 0;
                    line-height: 1.1;
                }
                .hud-sub {
                    font-family: monospace;
                    font-size: 13px;
                    font-weight: 800;
                    color: #FFF;
                    letter-spacing: 0.2em;
                    margin-top: 8px;
                    text-transform: uppercase;
                    opacity: 0.8;
                }
                
                /* Premium Design Utilities */
                
                @keyframes pulse-hud {
                    0% { transform: translate(-50%, -50%) scale(1); opacity: 0.9; }
                    50% { transform: translate(-50%, -50%) scale(1.08); opacity: 1; text-shadow: 0 0 25px currentColor; }
                    100% { transform: translate(-50%, -50%) scale(1); opacity: 0.9; }
                }
                .game-hud-overlay {
                    position: absolute;
                    top: 45%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    z-index: 150;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    pointer-events: none;
                    animation: pulse-hud 1.2s infinite ease-in-out;
                    width: 90%;
                    text-align: center;
                }
                .hud-headline {
                    font-family: 'Impact', 'Arial Black', sans-serif;
                    font-size: 38px;
                    font-weight: 900;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    margin: 0;
                    padding: 0;
                    line-height: 1.1;
                }
                .hud-sub {
                    font-family: monospace;
                    font-size: 13px;
                    font-weight: 800;
                    color: #FFF;
                    letter-spacing: 0.2em;
                    margin-top: 8px;
                    text-transform: uppercase;
                    opacity: 0.8;
                }
                
                /* Premium Design Utilities */
                .glass-pill { background: rgba(15, 15, 15, 0.65); backdrop-filter: blur(20px); -webkit-backdrop-filter: blur(20px); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 100px; box-shadow: 0 4px 20px rgba(0,0,0,0.3); }
                .text-truncate { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                
                /* Video Layout */
                .video-grid { display: grid; gap: 8px; width: 100%; height: 100%; padding: 0; margin: 0; }
                .video-cell { position: relative; background: #000; overflow: hidden; border-radius: 0; display: flex; align-items: center; justify-content: center; }
                
                /* Transparent TikTok Style Chat Overlay */
                .arena-full-stage { position: absolute; inset: 0; display: flex; width: 100%; height: 100%; overflow: hidden; }
                .chat-overlay { position: absolute; bottom: 190px; left: 16px; right: 16px; max-width: 320px; max-height: 250px; display: flex; flex-direction: column; z-index: 90; pointer-events: none; }
                .chat-messages-container { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding-bottom: 8px; scrollbar-width: none; pointer-events: auto; mask-image: linear-gradient(to top, black 80%, transparent 100%); -webkit-mask-image: linear-gradient(to top, black 80%, transparent 100%); }
                .chat-messages-container::-webkit-scrollbar { display: none; }
                .chat-input-wrapper { display: flex; gap: 8px; align-items: center; margin-top: 4px; pointer-events: auto; }
                
                @media (min-width: 768px) { 
                    .video-grid { padding: 0; gap: 0; } 
                    .video-cell { border-radius: 0; border: none; } 
                }
            `}</style>
            
            {/* --- ESPORTS GAME-HUD OVERLAY --- */}
            {battleState.status !== 'idle' && localTimer > 0 && (() => {
                let headlineText = "";
                let subtextText = "";
                let colorGradient = "linear-gradient(180deg, #FF4500 0%, #FF0000 100%)";
                let shadowColor = "rgba(255, 69, 0, 0.8)";

                const receiver = battleState.currentReceiver;

                if (battleState.status === 'suspense' && receiver === 'none') {
                    if (battleState.roasterId && !battleState.hostStreak) {
                        headlineText = `WARNING: ROAST INCOMING IN ${localTimer}s`;
                        subtextText = `${battleState.roasterName || 'Contender'} is stepping to the mic`;
                        colorGradient = "linear-gradient(180deg, #FFF 30%, #FF0055 100%)";
                        shadowColor = "rgba(255, 0, 85, 0.9)";
                    } else {
                        headlineText = `CLAPBACK IN ${localTimer}s`;
                        subtextText = "Prepare your defense";
                        colorGradient = "linear-gradient(180deg, #FFF 30%, #00FFFF 100%)";
                        shadowColor = "rgba(0, 255, 255, 0.9)";
                    }
                } else if (battleState.status === 'battle') {
                    if (receiver === 'roaster' && localTimer <= 5) {
                        headlineText = `ROAST ENDS IN ${localTimer}s`;
                        subtextText = "Times running out";
                        colorGradient = "linear-gradient(180deg, #FFF 30%, #FF8C00 100%)";
                        shadowColor = "rgba(255, 140, 0, 0.9)";
                    } else if (receiver === 'host' && localTimer <= 5) {
                        headlineText = `CLAPBACK ENDS IN ${localTimer}s`;
                        subtextText = "Returning to idle";
                        colorGradient = "linear-gradient(180deg, #FFF 30%, #9932CC 100%)";
                        shadowColor = "rgba(153, 50, 204, 0.9)";
                    }
                }

                if (!headlineText) return null;

                return (
                    <div className="game-hud-overlay">
                        <h2 className="hud-headline" style={{ background: colorGradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', color: '#FFF', textShadow: `0 0 20px ${shadowColor}` }}>
                            {headlineText}
                        </h2>
                        <span className="hud-sub">{subtextText}</span>
                    </div>
                );
            })()}

            {/* --- ESPORTS GAME-HUD OVERLAY --- */}
            {battleState.status !== 'idle' && localTimer > 0 && (() => {
                let headlineText = "";
                let subtextText = "";
                let colorGradient = "linear-gradient(180deg, #FF4500 0%, #FF0000 100%)";
                let shadowColor = "rgba(255, 69, 0, 0.8)";

                const receiver = battleState.currentReceiver;

                if (battleState.status === 'suspense' && receiver === 'none') {
                    if (battleState.roasterId && !battleState.hostStreak) {
                        headlineText = `WARNING: ROAST INCOMING IN ${localTimer}s`;
                        subtextText = `${battleState.roasterName || 'Contender'} is stepping to the mic`;
                        colorGradient = "linear-gradient(180deg, #FFF 30%, #FF0055 100%)";
                        shadowColor = "rgba(255, 0, 85, 0.9)";
                    } else {
                        headlineText = `CLAPBACK IN ${localTimer}s`;
                        subtextText = "Prepare your defense";
                        colorGradient = "linear-gradient(180deg, #FFF 30%, #00FFFF 100%)";
                        shadowColor = "rgba(0, 255, 255, 0.9)";
                    }
                } else if (battleState.status === 'battle') {
                    if (receiver === 'roaster' && localTimer <= 5) {
                        headlineText = `ROAST ENDS IN ${localTimer}s`;
                        subtextText = "Times running out";
                        colorGradient = "linear-gradient(180deg, #FFF 30%, #FF8C00 100%)";
                        shadowColor = "rgba(255, 140, 0, 0.9)";
                    } else if (receiver === 'host' && localTimer <= 5) {
                        headlineText = `CLAPBACK ENDS IN ${localTimer}s`;
                        subtextText = "Returning to idle";
                        colorGradient = "linear-gradient(180deg, #FFF 30%, #9932CC 100%)";
                        shadowColor = "rgba(153, 50, 204, 0.9)";
                    }
                }

                if (!headlineText) return null;

                return (
                    <div className="game-hud-overlay">
                        <h2 className="hud-headline" style={{ background: colorGradient, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', color: '#FFF', textShadow: `0 0 20px ${shadowColor}` }}>
                            {headlineText}
                        </h2>
                        <span className="hud-sub">{subtextText}</span>
                    </div>
                );
            })()}

            {/* --- TOP FLOATING HEADER --- */}
            <div style={{ position: 'absolute', top: '16px', left: '16px', right: '16px', zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pointerEvents: 'none' }}>
                <div style={{ display: 'flex', gap: '8px', pointerEvents: 'auto' }}>
                    <ViewerCount />
                    <div className="glass-pill" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', color: '#FFD700', fontSize: '11px', fontWeight: '800' }}>
                        <span>🎟️</span>
                        <span>{creatorProfile?.arenaTokens || 0} TOKENS</span>
                    </div>
                    <button onClick={handleShareArena} className="glass-pill" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', cursor: 'pointer', color: '#FFF', border: '1px solid rgba(255, 255, 255, 0.1)', background: 'rgba(15, 15, 15, 0.65)', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'} onMouseLeave={e => e.currentTarget.style.background = 'rgba(15,15,15,0.65)'}>
                        <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
                    </button>
                    {/* CHAT TOGGLE BUTTON MOVED TO BOTTOM ACTION TRAY */}
                </div>

                <button onClick={handleExit} className="glass-pill" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', cursor: 'pointer', pointerEvents: 'auto', border: '1px solid rgba(255, 42, 42, 0.3)' }}>
                    <span style={{ color: '#FF2A2A', fontSize: '11px', fontWeight: '900', letterSpacing: '0.05em' }}>EXIT</span>
                </button>
            </div>

            {/* --- TUG OF WAR SCALE & STREAK HUD --- */}
            <div style={{ position: 'absolute', top: '70px', left: '50%', transform: 'translateX(-50%)', zIndex: 100, pointerEvents: 'none', width: '80%', maxWidth: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div className="glass-pill" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 16px', border: '1px solid rgba(0,255,255,0.15)', background: 'rgba(10, 10, 10, 0.7)', backdropFilter: 'blur(5px)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>
                    <span style={{ color: '#FFD700', fontSize: '12px', fontWeight: '900' }}>HOST WINS: {battleState.hostStreak || 0}</span>
                    <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.15)' }}></div>
                    <span style={{ color: '#FF4500', fontSize: '12px', fontWeight: '900' }}>GUEST WINS: {battleState.guestStreak || 0}</span>
                    {localTimer > 0 && (
                        <>
                            <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.15)' }}></div>
                            <div style={{ color: '#FFF', fontSize: '14px', fontWeight: '900', fontFamily: 'monospace', textShadow: '0 0 10px rgba(255,255,255,0.5)' }}>00:{localTimer < 10 ? `0${localTimer}` : localTimer}</div>
                        </>
                    )}
                </div>
                
                {/* 50/50 Balance Bar (Renders only during battle) */}
                {battleState.roasterId && (
                    <div style={{ width: '100%', height: '12px', background: '#111', borderRadius: '10px', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.2)', position: 'relative', boxShadow: '0 0 10px rgba(0,0,0,0.8)' }}>
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${battleState.scale !== undefined ? battleState.scale : 50}%`, background: 'linear-gradient(90deg, #FF4500, #FFD700)', transition: 'width 0.4s cubic-bezier(0.4, 0, 0.2, 1)' }}></div>
                        <div style={{ position: 'absolute', left: '50%', top: 0, bottom: 0, width: '2px', background: '#FFF', transform: 'translateX(-50%)', opacity: 0.5, boxShadow: '0 0 5px #FFF' }}></div>
                    </div>
                )}
            </div>

            {/* --- EMOJI TOKEN COUNTS (Badges of Honor) --- */}
            <div style={{ position: 'absolute', top: '64px', left: '16px', zIndex: 100, pointerEvents: 'none' }}>
                <div className="glass-pill" style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 12px', background: 'rgba(10, 10, 10, 0.4)', backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', alignItems: 'flex-start' }}>
                    {(() => {
                        let themeEmoji = '💀'; 
                        if (battleState.liveRoomType === 'shoot_shot') themeEmoji = '🌹';
                        if (battleState.liveRoomType === 'debate') themeEmoji = '💯';
                        if (battleState.liveRoomType === 'cypher') themeEmoji = '🎤';
                        if (battleState.liveRoomType === 'pitch') themeEmoji = '💼';
                        
                        return [
                            { e: '🔥', c: battleState.fireCount },
                            { e: '😂', c: battleState.laughCount },
                            { e: themeEmoji, c: battleState.themeCount },
                            { e: '🍅', c: battleState.tomatoCount }
                        ].map(item => (
                            <span key={item.e} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#FFF', fontWeight: 'bold' }}>
                                {item.e} <span style={{ color: '#FFD700', fontFamily: 'monospace', fontSize: '11px' }}>x{item.c || 0}</span>
                            </span>
                        ));
                    })()}
                </div>
            </div>

            {/* --- TIKTOK STYLE FULL SCREEN STAGE (VIDEO + CHAT OVERLAY) --- */}
            <div className="arena-full-stage">
                
                {/* --- THE VIDEO STAGE (FULL BACKGROUND) --- */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                    {(() => {
                        const visibleTracks = tracks.filter(t => {
                            const pId = t.participant.identity;
                            return pId === battleState.hostId || pId === battleState.roasterId;
                        });
                        
                        const hasRoaster = !!battleState.roasterId;
                        
                        return (
                            <div className="video-grid" style={{ gridTemplateColumns: hasRoaster ? '1fr 1fr' : '1fr', width: '100%', height: '100%' }}>
                                {/* CARD 1: THE HOST */}
                                {(() => {
                                    const isSuperSaiyan = battleState.superSaiyanMode === 'host';
                                    const isSplatted = battleState.splatMode === 'host';
                                    const isMuted = battleState.hostMutePenalty;
                                    const scaleState = battleState.scale !== undefined ? battleState.scale : 50;
                                    const hostDominance = 100 - scaleState; 
                                    const avatarSize = 100 + (hostDominance / 2);
                                    const glowIntensity = hostDominance > 70 ? '0 0 40px #FFD700' : '0 8px 32px rgba(0,0,0,0.5)';

                                    return (
                                        <div className={`video-cell ${isSuperSaiyan ? 'fire-streak' : isSplatted ? 'tomato-streak' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '15px', position: 'relative' }}>
                                            {isSplatted && <div className="tomato-splat-overlay" />}
                                            <div style={{ 
                                                width: `${avatarSize}px`, height: `${avatarSize}px`, borderRadius: '50%', 
                                                background: isSuperSaiyan ? 'linear-gradient(45deg, #FFD700, #FF4500)' : 'linear-gradient(45deg, #1a1a1a, #333)', 
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px', 
                                                border: isSuperSaiyan ? '4px solid #FFF' : '2px solid rgba(255,255,255,0.1)', 
                                                boxShadow: isSuperSaiyan ? '0 0 60px #FFD700, inset 0 0 20px #FFF' : glowIntensity,
                                                transition: 'all 0.3s ease-out'
                                            }}>
                                                {isMuted ? '🔇' : isSuperSaiyan ? '🔥' : '🎙️'}
                                            </div>
                                            </div>
                                            <span style={{ color: '#FFF', fontSize: '14px', fontWeight: '900', letterSpacing: '0.05em' }}>
                                                {hostRealName.toUpperCase()} (HOST)
                                            </span>
                                            
                                            {/* Authoritative Mic Activation button for Host */}
                                            {isHost && !room?.localParticipant?.isMicrophoneEnabled && (
                                                <button 
                                                    onClick={async (e) => {
                                                        e.preventDefault();
                                                        try { await room.localParticipant.setMicrophoneEnabled(true); } 
                                                        catch (err) { showMessage("Microphone blocked."); }
                                                    }}
                                                    style={{ background: '#4ADE80', color: '#000', padding: '10px 20px', borderRadius: '20px', fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', border: 'none', cursor: 'pointer', pointerEvents: 'auto', zIndex: 100 }}
                                                >
                                                    🎙️ ACTIVATE MIC
                                                </button>
                                            )}
                                        </div>
                                    );
                                })()}

                                {/* CARD 2: THE CHALLENGER (Only renders if a user is clocked in) */}
                                {hasRoaster && (() => {
                                    const isSuperSaiyan = battleState.superSaiyanMode === 'roaster';
                                    const isSplatted = battleState.splatMode === 'roaster';
                                    const scaleState = battleState.scale !== undefined ? battleState.scale : 50;
                                    const guestDominance = scaleState;
                                    const avatarSize = 100 + (guestDominance / 2);
                                    const glowIntensity = guestDominance > 70 ? '0 0 40px #FFD700' : '0 8px 32px rgba(0,0,0,0.5)';

                                    return (
                                        <div className={`video-cell ${isSuperSaiyan ? 'fire-streak' : isSplatted ? 'tomato-streak' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: '15px', position: 'relative' }}>
                                            {isSplatted && <div className="tomato-splat-overlay" />}
                                            <div style={{ 
                                                width: `${avatarSize}px`, height: `${avatarSize}px`, borderRadius: '50%', 
                                                background: isSuperSaiyan ? 'linear-gradient(45deg, #FFD700, #FF4500)' : 'linear-gradient(45deg, #111, #222)', 
                                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '48px', 
                                                border: isSuperSaiyan ? '4px solid #FFF' : '2px solid #FF4500', 
                                                boxShadow: isSuperSaiyan ? '0 0 60px #FFD700, inset 0 0 20px #FFF' : glowIntensity,
                                                transition: 'all 0.3s ease-out'
                                            }}>
                                                {isSuperSaiyan ? '🔥' : '⚡'}
                                            </div>
                                            </div>
                                            <span style={{ color: '#FFF', fontSize: '14px', fontWeight: '900', letterSpacing: '0.05em' }}>
                                                {battleState.roasterName ? battleState.roasterName.toUpperCase() : 'CONTENDER'}
                                            </span>

                                            {/* Authoritative Mic Activation button for Challenger */}
                                            {isRoaster && !room?.localParticipant?.isMicrophoneEnabled && (
                                                <button 
                                                    onClick={async (e) => {
                                                        e.preventDefault();
                                                        try { await room.localParticipant.setMicrophoneEnabled(true); } 
                                                        catch (err) { showMessage("Microphone blocked."); }
                                                    }}
                                                    style={{ background: '#FF4500', color: '#FFF', padding: '10px 20px', borderRadius: '20px', fontSize: '12px', fontWeight: '900', textTransform: 'uppercase', border: 'none', cursor: 'pointer', pointerEvents: 'auto', zIndex: 100 }}
                                                >
                                                    🎙️ ACTIVATE MIC
                                                </button>
                                            )}
                                        </div>
                                    );
                                })()}
                            </div>
                        );
                    })()}
                </div>

                {/* --- FLOATING CHAT OVERLAY (MESSAGES ONLY, ABOVE ACTION TRAY) --- */}
                {showChat && (
                    <div className="chat-overlay">
                        {/* Scrollable Message List */}
                        <div className="chat-messages-container">
                            {chatMessages.map((msg) => (
                                <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ color: ['#FF4500','#00FF7F','#00CED1','#FFD700','#FF69B4','#1E90FF','#9370DB'][Math.abs(msg.sender.split('').reduce((a,c)=>a+c.charCodeAt(0),0))%7], fontSize: '12px', fontWeight: '900', textShadow: '1px 1px 2px rgba(0,0,0,0.8)' }}>
                                        {msg.sender}
                                    </span>
                                    <p style={{ color: '#FFF', fontSize: '14px', margin: 0, lineHeight: '1.3', wordBreak: 'break-word', textShadow: '1px 1px 3px rgba(0,0,0,0.9)', fontWeight: '500' }}>
                                        {msg.text}
                                    </p>
                                </div>
                            ))}
                            <div ref={messagesEndRef} style={{ height: '1px' }} />
                        </div>
                    </div>
                )}
            </div>

            {/* --- GLOBAL FLOATING EMOJI CANVAS PANEL --- */}
            <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 85 }}>
                {flyingEmojis.map((e) => (
                    <div key={e.id} style={{
                        position: 'absolute',
                        bottom: '0px',
                        left: `${e.x}%`,
                        fontSize: '32px',
                        animation: 'float-emoji-up 2.0s cubic-bezier(0.08, 0.82, 0.17, 1) forwards',
                        filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.5))',
                    }}>
                        {e.emoji}
                    </div>
                ))}
            </div>

            {/* --- INTERACTIVE ACTION TRAY (FLOATING BOTTOM) --- */}
            <div style={{ position: 'absolute', bottom: '16px', left: '16px', right: '16px', display: 'flex', flexDirection: 'column', gap: '12px', zIndex: 100, pointerEvents: 'none' }}>
                
                {/* 1. HOST NAME & ROAST MIC ROW */}
                <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '40px', pointerEvents: 'auto', width: '100%' }}>
                    {/* Host Name on the Left */}
                    <div className="glass-pill" style={{ position: 'absolute', left: '8px', display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 12px', background: 'rgba(15, 15, 15, 0.7)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ADE80', boxShadow: '0 0 8px #4ADE80' }}></div>
                        <span className="text-truncate" style={{ color: '#FFF', fontSize: '11px', fontWeight: '900', maxWidth: '120px', letterSpacing: '0.05em' }}>
                            {hostRealName.toUpperCase()}
                        </span>
                    </div>

                    {/* Roast Button perfectly centered */}
                    {battleState.status === 'idle' && !isHost && (
                        <button 
                            onClick={handleClockIn} 
                            style={{ background: 'rgba(255,69,0,0.15)', color: '#FF4500', padding: '8px 24px', borderRadius: '24px', fontSize: '13px', fontWeight: '900', textTransform: 'uppercase', border: '1px solid #FF4500', cursor: 'pointer', backdropFilter: 'blur(10px)', transition: 'transform 0.1s', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 4px 15px rgba(0,0,0,0.5)' }}
                            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
                            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            <span>🎙️</span> ROAST
                        </button>
                    )}
                </div>

                {/* 2. CHAT INPUT & TOGGLE ROW */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center', pointerEvents: 'auto' }}>
                    {/* CHAT TOGGLE (Icon only, turns burnt orange and X when closed) */}
                    <button 
                        onClick={() => setShowChat(!showChat)}
                        style={{ width: '40px', height: '40px', borderRadius: '50%', background: !showChat ? 'rgba(255,69,0,0.9)' : 'rgba(255,255,255,0.1)', border: !showChat ? '1px solid #FF4500' : '1px solid rgba(255,255,255,0.2)', color: !showChat ? '#FFF' : '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', backdropFilter: 'blur(10px)', transition: 'all 0.2s', flexShrink: 0 }}
                    >
                        {!showChat ? (
                            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                        ) : (
                            <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"/></svg>
                        )}
                    </button>

                    {/* CHAT INPUT BAR WITH EMOJI BUTTON */}
                    <form onSubmit={handleSendChat} style={{ flex: 1, display: 'flex', alignItems: 'center', background: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255, 69, 0, 0.3)', borderRadius: '24px', padding: '4px 6px 4px 16px', gap: '8px' }}>
                        <input 
                            type="text" 
                            placeholder="Add a comment..." 
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            maxLength={140}
                            id="roast-chat-input"
                            style={{ flex: 1, background: 'transparent', border: 'none', color: '#FFF', fontSize: '13px', outline: 'none', padding: '8px 0' }}
                        />
                        
                        {/* FUNCTIONAL EMOJI POPOVER */}
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            {showEmojiPicker && (
                                <div className="glass-pill" style={{ position: 'absolute', bottom: '40px', right: '-10px', padding: '8px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px', background: 'rgba(15,15,15,0.95)', border: '1px solid rgba(255,69,0,0.3)', zIndex: 110 }}>
                                    {['😀','😂','💀','🔥','🍅','💯','👀','🧢'].map(emo => (
                                        <button key={emo} type="button" onClick={(e) => { e.preventDefault(); setChatInput(prev => prev + emo); setShowEmojiPicker(false); }} style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', transition: 'transform 0.1s' }} onMouseDown={e => e.currentTarget.style.transform='scale(0.9)'} onMouseUp={e => e.currentTarget.style.transform='scale(1)'}>
                                            {emo}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <button type="button" onClick={() => setShowEmojiPicker(!showEmojiPicker)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '0 4px', filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.5))', color: showEmojiPicker ? '#FF4500' : '#FFF' }}>
                                😀
                            </button>
                        </div>

                        <button type="submit" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '50%', background: '#FF4500', border: 'none', cursor: 'pointer', color: '#FFF', flexShrink: 0 }}>
                            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                        </button>
                    </form>
                </div>

                {/* 3. REACTION DOCK */}
                <div style={{ display: 'flex', justifyContent: 'center', pointerEvents: 'auto' }}>
                    <div className="glass-pill" style={{ display: 'flex', gap: '12px', padding: '8px 16px', background: 'rgba(10,10,10,0.85)', boxShadow: '0 10px 30px rgba(0,0,0,0.6)' }}>
                        {(() => {
                            let themeEmoji = '💀'; 
                            if (battleState.liveRoomType === 'shoot_shot') themeEmoji = '🌹';
                            if (battleState.liveRoomType === 'debate') themeEmoji = '💯';
                            if (battleState.liveRoomType === 'cypher') themeEmoji = '🎤';
                            if (battleState.liveRoomType === 'pitch') themeEmoji = '💼';
                            
                            return ['🔥', '😂', themeEmoji, '🍅'].map(emoji => (
                                <button 
                                    key={emoji} 
                                    onClick={() => handleSendReaction(emoji === '🍅' ? 'tomato' : emoji === '🔥' ? 'fire' : emoji === '😂' ? 'laugh' : 'theme')}
                                    style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', cursor: 'pointer', transition: 'all 0.15s ease' }}
                                    onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
                                    onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                                >
                                    {emoji}
                                </button>
                            ));
                        })()}
                    </div>
                </div>
            </div>
        </div>
    );
}

function RoastRoomScreen({ setActiveScreen, currentUser, creatorProfile, showMessage, hostId }) {
    const [token, setToken] = useState(null);
    const [battleState, setBattleState] = useState({ status: 'idle', hostStreak: 0, timer: 0 });
    const [localMediaIntent, setLocalMediaIntent] = useState(false);

    // Fail-safe locks Host role to prevent ROAST button from ever rendering to the stream creator
    const isStreamHost = currentUser?.uid === battleState.hostId || currentUser?.uid === hostId;
    const isRoaster = currentUser?.uid === battleState.roasterId;

    useEffect(() => {
        if (currentUser && currentUser.uid === hostId) {
            const roomType = creatorProfile?.liveRoomType || 'roast';
            updateDoc(doc(db, "creators", currentUser.uid), { isLive: true, liveRoomType: roomType }).catch(() => {});
            setDoc(doc(db, "live_arena", hostId), { hostId: currentUser.uid, status: 'idle', liveRoomType: roomType, scale: 50 }, { merge: true }).catch(() => {});
        }
    }, [currentUser, hostId, creatorProfile]);

    useEffect(() => {
        const fetchToken = async () => {
            try {
                const getFunc = httpsCallable(functions, 'getRoastRoomToken');
                const res = await getFunc({ roomName: hostId });
                setToken(res.data.token);
            } catch (err) { showMessage("Arena handshake failed."); }
        };
        fetchToken();
        const unsub = onSnapshot(doc(db, "live_arena", hostId), (s) => s.exists() && setBattleState(s.data()));
        
        return () => {
            unsub();
            if (currentUser && currentUser.uid === hostId) {
                updateDoc(doc(db, "creators", currentUser.uid), { isLive: false, liveRoomType: null }).catch(() => {});
            }
        };
    }, [currentUser?.uid, hostId]); // Stable dependency prevents unmount loops and connection drop-offs

    const handleExit = async () => {
        setLocalMediaIntent(false);
        try {
            const isStreamHost = currentUser?.uid === battleState.hostId;
            const isActiveRoaster = currentUser?.uid === battleState.roasterId;

            if (isStreamHost) {
                await updateDoc(doc(db, "live_arena", hostId), {
                    status: 'idle',
                    hostId: null,
                    roasterId: null,
                    currentReceiver: 'none',
                    timer: 0,
                    scale: 50,
                    superSaiyanMode: false,
                    splatMode: false
                });
                await updateDoc(doc(db, "live_arena", hostId), { hostStreak: 0, guestStreak: 0, fireCount: 0, tomatoCount: 0, laughCount: 0, themeCount: 0 }).catch(() => {});
                await updateDoc(doc(db, "creators", currentUser.uid), { isLive: false, liveRoomType: null });
            } else if (isActiveRoaster) {
                await updateDoc(doc(db, "live_arena", hostId), {
                    status: 'idle',
                    roasterId: null,
                    currentReceiver: 'host',
                    timer: 0,
                    scale: 50,
                    superSaiyanMode: false,
                    splatMode: false
                });
            }
        } catch (e) {
            console.error("Clean exit failed:", e);
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
            <LiveKitRoom 
                serverUrl={LIVEKIT_URL} 
                token={token} 
                connect={true} 
                video={false} // <-- FORCED AUDIO-ONLY
                audio={isStreamHost || localMediaIntent}
                style={{ width: '100%', height: '100%' }}
            >
                <RoastRoomContent battleState={battleState} currentUser={currentUser} creatorProfile={creatorProfile} showMessage={showMessage} handleExit={handleExit} setLocalMediaIntent={setLocalMediaIntent} hostId={hostId} />
                <RoomAudioRenderer />
            </LiveKitRoom>
        </div>
    );
}

export default RoastRoomScreen;