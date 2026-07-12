// src/components/RoastRoomScreen.jsx
import React, { useState, useEffect, useRef } from 'react';
import { LiveKitRoom, RoomAudioRenderer, useTracks, VideoTrack, useRoomContext } from '@livekit/components-react';
import { Track } from 'livekit-client';
import "@livekit/components-styles";
import { db, functions, doc, onSnapshot, updateDoc, httpsCallable } from '../firebase';

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

function RoastRoomContent({ battleState, currentUser, creatorProfile, showMessage, handleExit, setLocalMediaIntent }) {
    const room = useRoomContext();
    const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
    const isHost = currentUser?.uid === battleState.hostId;
    const isRoaster = currentUser?.uid === battleState.roasterId;

    // Dynamic extraction of the Host's real name from WebRTC participants or Firestore profile
    const hostTrack = tracks.find(t => t.participant.identity === battleState.hostId);
    const hostRealName = hostTrack?.participant.name || 
                         (currentUser?.uid === battleState.hostId ? (creatorProfile?.creatorName || creatorProfile?.displayName) : null) || 
                         "NVA Host";

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

    const handleSendReaction = async (emoji) => {
        if ((creatorProfile?.roastTokens || 0) < 1) {
            showMessage("1 Pass required. Top up in the Vault.");
            return;
        }

        const id = Date.now();
        const randomX = Math.floor(Math.random() * 60) + 20;
        setFlyingEmojis(prev => [...prev, { id, emoji, x: randomX }]);
        setTimeout(() => setFlyingEmojis(prev => prev.filter(e => e.id !== id)), 2000);

        // Broadcast to other participants in the room
        if (room) {
            const encoder = new TextEncoder();
            const data = encoder.encode(JSON.stringify({ type: 'reaction', emoji }));
            room.localParticipant.publishData(data, { reliable: true }).catch(() => {});
        }

        try {
            const sendFunc = httpsCallable(functions, 'sendRoastReaction');
            await sendFunc({ reactionType: emoji === '🔥' ? 'fire' : 'tomato' });
        } catch (err) { 
            console.error("Firebase reaction sync failed:", err); 
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
        if ((creatorProfile?.roastTokens || 0) < 5) {
            showMessage("5 Passes required to Step to the Mic.");
            return;
        }
        try {
            setLocalMediaIntent(true);
            const clockFunc = httpsCallable(functions, 'clockIntoRoast');
            await clockFunc();
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
            
            {/* --- TOP FLOATING HEADER --- */}
            <div style={{ position: 'absolute', top: '16px', left: '16px', right: '16px', zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', pointerEvents: 'none' }}>
                <div style={{ display: 'flex', gap: '8px', pointerEvents: 'auto' }}>
                    <ViewerCount />
                    <div className="glass-pill" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', color: '#FFD700', fontSize: '11px', fontWeight: '800' }}>
                        <span>🎟️</span>
                        <span>{creatorProfile?.roastTokens || 0} PASSES</span>
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

            {/* --- THE STREAK HUD (TOP CENTER, TRANSPARENT & STYLISH) --- */}
            <div style={{ position: 'absolute', top: '70px', left: '50%', transform: 'translateX(-50%)', zIndex: 100, pointerEvents: 'none' }}>
                <div className="glass-pill" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '6px 16px', border: `1px solid ${battleState.hostStreak >= 0 ? 'rgba(0,255,255,0.15)' : 'rgba(255,42,42,0.15)'}`, background: 'rgba(10, 10, 10, 0.4)', backdropFilter: 'blur(5px)', boxShadow: '0 4px 15px rgba(0,0,0,0.2)' }}>
                    <span style={{ color: '#AAA', fontSize: '9px', fontWeight: '800', letterSpacing: '0.1em', textTransform: 'uppercase' }}>zero points streak</span>
                    <span style={{ color: '#FFF', fontSize: '14px', fontWeight: '900', fontFamily: 'monospace' }}>
                        {battleState.hostStreak >= 0 ? `+${battleState.hostStreak}` : battleState.hostStreak}
                    </span>
                    {battleState.timer > 0 && (
                        <>
                            <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.15)' }}></div>
                            <div style={{ color: '#FFD700', fontSize: '14px', fontWeight: '900', fontFamily: 'monospace', textShadow: '0 0 10px rgba(255,215,0,0.4)' }}>
                                00:{battleState.timer < 10 ? `0${battleState.timer}` : battleState.timer}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* --- EMOJI TOKEN COUNTS (TOP LEFT, DIRECTLY UNDER VIEW COUNT) --- */}
            <div style={{ position: 'absolute', top: '64px', left: '16px', zIndex: 100, pointerEvents: 'none' }}>
                <div className="glass-pill" style={{ display: 'flex', flexDirection: 'column', gap: '6px', padding: '8px 12px', background: 'rgba(10, 10, 10, 0.4)', backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 4px 15px rgba(0,0,0,0.2)', alignItems: 'flex-start' }}>
                    {['🔥', '😂', '💀', '🍅'].map(em => {
                        const count = em === '🔥' ? battleState.fireCount : em === '🍅' ? battleState.tomatoCount : em === '😂' ? battleState.laughCount : battleState.skullCount;
                        return (
                            <span key={em} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: '#FFF', fontWeight: 'bold' }}>
                                {em} <span style={{ color: '#FFD700', fontFamily: 'monospace', fontSize: '11px' }}>x{count || 0}</span>
                            </span>
                        );
                    })}
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
                        
                        return (
                            <div className="video-grid" style={{ gridTemplateColumns: visibleTracks.length > 1 ? '1fr 1fr' : '1fr', gridTemplateRows: visibleTracks.length > 1 && window.innerWidth < 768 ? '1fr 1fr' : '1fr', width: '100%', height: '100%' }}>
                                {visibleTracks.length > 0 ? visibleTracks.map((t) => {
                                    return (
                                        <div key={`${t.participant.identity}-${t.source}`} className="video-cell">
                                            <VideoTrack trackRef={t} style={{ height: '100%', width: '100%', objectFit: 'cover' }} />
                                            
                                            {/* Renders a clean indicator with a Drop button ONLY on the Roaster's video cell */}
                                            {t.participant.identity === battleState.roasterId && (
                                                <div className="glass-pill" style={{ position: 'absolute', bottom: '16px', left: '16px', display: 'flex', alignItems: 'center', gap: '8px', zIndex: 60, maxWidth: '80%' }}>
                                                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FF4500', boxShadow: '0 0 8px #FF4500' }}></div>
                                                    <span className="text-truncate" style={{ color: '#FFF', fontSize: '12px', fontWeight: '900' }}>
                                                        {t.participant.name?.toUpperCase() || 'CONTENDER'}
                                                    </span>
                                                    {isHost && (
                                                        <button 
                                                            onClick={async (e) => {
                                                                e.stopPropagation();
                                                                try {
                                                                    const kickFunc = httpsCallable(functions, 'kickParticipant');
                                                                    await kickFunc({ identity: t.participant.identity });
                                                                } catch (err) { showMessage("Kick failed."); }
                                                            }}
                                                            style={{ border: 'none', background: 'rgba(220,53,69,0.85)', borderRadius: '20px', color: '#FFF', padding: '3px 8px', marginLeft: '6px', fontSize: '9px', fontWeight: '900', cursor: 'pointer', textTransform: 'uppercase' }}
                                                        >
                                                            Drop
                                                        </button>
                                                    )}
                                                </div>
                                            )}
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
                        {['🔥', '😂', '💀', '🍅'].map(emoji => (
                            <button 
                                key={emoji} 
                                onClick={() => handleSendReaction(emoji)}
                                style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '22px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '50%', cursor: 'pointer', transition: 'all 0.15s ease' }}
                                onMouseDown={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.background = 'rgba(255,255,255,0.15)'; }}
                                onMouseUp={(e) => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                            >
                                {emoji}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function RoastRoomScreen({ setActiveScreen, currentUser, creatorProfile, showMessage }) {
    const [token, setToken] = useState(null);
    const [battleState, setBattleState] = useState({ status: 'idle', hostStreak: 0, timer: 0 });
    const [localMediaIntent, setLocalMediaIntent] = useState(false);

    // Immediate compile-time checks bypass browser dynamic hardware blocks
    const isAdmin = creatorProfile?.role === 'admin' || creatorProfile?.role === 'super_admin' || creatorProfile?.role === 'authority';
    const isRoaster = currentUser?.uid === battleState.roasterId;
    const shouldPublish = isAdmin || isRoaster || localMediaIntent;

    // Host Auto-Claim System: Instantly registers the Admin as the active stream Host
    useEffect(() => {
        if (currentUser && creatorProfile && isAdmin) {
            updateDoc(doc(db, "creators", currentUser.uid), { isLive: true, liveRoomType: "roast" }).catch(() => {});
            updateDoc(doc(db, "live_arena", "main-arena"), { hostId: currentUser.uid }).catch(() => {});
        }
    }, [currentUser, creatorProfile, isAdmin]);

    useEffect(() => {
        if (battleState.roasterId !== currentUser?.uid) {
            setLocalMediaIntent(false);
        }
    }, [battleState.roasterId, currentUser?.uid]);

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
    }, [currentUser?.uid]); // Stable dependency prevents unmount loops and connection drop-offs

    const handleExit = async () => {
        setLocalMediaIntent(false);
        try {
            const isStreamHost = currentUser?.uid === battleState.hostId;
            const isActiveRoaster = currentUser?.uid === battleState.roasterId;

            if (isStreamHost) {
                await updateDoc(doc(db, "live_arena", "main-arena"), {
                    status: 'idle',
                    hostId: null,
                    roasterId: null,
                    currentReceiver: 'none',
                    timer: 0,
                    hostStreak: 0,
                    fireCount: 0,
                    tomatoCount: 0,
                    laughCount: 0,
                    skullCount: 0
                });
                await updateDoc(doc(db, "creators", currentUser.uid), { isLive: false, liveRoomType: null });
            } else if (isActiveRoaster) {
                await updateDoc(doc(db, "live_arena", "main-arena"), {
                    status: 'idle',
                    roasterId: null,
                    currentReceiver: 'host',
                    timer: 0,
                    hostStreak: 0,
                    fireCount: 0,
                    tomatoCount: 0,
                    laughCount: 0,
                    skullCount: 0
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
                video={shouldPublish}
                audio={shouldPublish}
                style={{ width: '100%', height: '100%' }}
            >
                <RoastRoomContent battleState={battleState} currentUser={currentUser} creatorProfile={creatorProfile} showMessage={showMessage} handleExit={handleExit} setLocalMediaIntent={setLocalMediaIntent} />
                <RoomAudioRenderer />
            </LiveKitRoom>
        </div>
    );
}

export default RoastRoomScreen;