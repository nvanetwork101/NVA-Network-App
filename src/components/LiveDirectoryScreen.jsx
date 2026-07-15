// src/components/LiveDirectoryScreen.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, doc } from "firebase/firestore";

const LiveDirectoryScreen = ({ setActiveScreen, currentUser, showMessage, setSelectedUserId }) => {
    const [liveCreators, setLiveCreators] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedCategory, setSelectedCategory] = useState(null);
    const [lobbyAd, setLobbyAd] = useState(null);

    const ROOM_CATEGORIES = [
        { id: 'shoot_shot', title: "Shoot Your Shot", icon: "💘", desc: "Dating & Matchmaking" },
        { id: 'debate', title: "That's Debatable", icon: "⚖️", desc: "Head-to-head topical debates" },
        { id: 'cypher', title: "The Cypher Stage", icon: "🎤", desc: "Audio-only freestyles" },
        { id: 'roast', title: "Comedy Roast", icon: "🔥", desc: "Vocal critiques & roasts" },
        { id: 'pitch', title: "Elevator Pitch", icon: "💼", desc: "Pitch your business or hustle" }
    ];

    useEffect(() => {
        const unsubAd = onSnapshot(
            doc(db, "settings", "lobbyAd"), 
            (snap) => {
                if (snap.exists() && snap.data().isActive) setLobbyAd(snap.data());
                else setLobbyAd(null);
            },
            (error) => {
                console.warn("Lobby ad sync postponed due to initialization rules.");
            }
        );
        return () => unsubAd();
    }, []);

    useEffect(() => {
        const q = query(collection(db, "creators"), where("isLive", "==", true), orderBy("followerCount", "desc"));
        const unsub = onSnapshot(q, (snapshot) => {
            setLiveCreators(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            setIsLoading(false);
        });
        return () => unsub();
    }, []);

    const filteredCreators = selectedCategory ? liveCreators.filter(c => c.liveRoomType === selectedCategory) : liveCreators;

    const handleJoinArena = (room) => {
        if (!currentUser) {
            showMessage("Please log in to join a Live Arena.");
            return;
        }
        showMessage(`Connecting to ${room.creatorName}'s Arena...`);
        setSelectedUserId(room.id);
        // Navigate globally to Roast Room
        setActiveScreen('RoastRoom');
    };

    const handleShareBroadcast = async (e, creator) => {
        e.stopPropagation(); // Prevent clicking the card and joining the room accidentally
        const shareUrl = `${window.location.origin}/user/${creator.id}`;
        const text = `🔴 ${creator.creatorName} is LIVE on NVA Network! Tap in to watch and join the arena:`;
        
        if (navigator.share) {
            try { await navigator.share({ title: `${creator.creatorName} is LIVE`, text: text, url: shareUrl }); }
            catch (err) { if (err.name !== 'AbortError') console.error("Sharing failed:", err); }
        } else {
            navigator.clipboard.writeText(`${text} ${shareUrl}`).then(() => {
                showMessage("Live link copied! Paste to invite viewers.");
            }).catch(() => showMessage("Failed to copy link."));
        }
    };

    return (
        <div className="screenContainer" style={{ padding: '0 0 80px 0' }}>
            <style>{`
                @keyframes dynamic-pulsate {
                    0% { transform: scale(0.9); opacity: 0.6; box-shadow: 0 0 0 0 rgba(255, 69, 0, 0.7); }
                    50% { transform: scale(1.1); opacity: 1; box-shadow: 0 0 0 8px rgba(255, 69, 0, 0); }
                    100% { transform: scale(0.9); opacity: 0.6; box-shadow: 0 0 0 0 rgba(255, 69, 0, 0); }
                }
                .pulsing-live-dot {
                    width: 10px;
                    height: 10px;
                    background-color: #FF4500;
                    border-radius: 50%;
                    display: inline-block;
                    box-shadow: 0 0 8px #FF4500;
                    animation: dynamic-pulsate 2s infinite ease-in-out;
                }
                .glass-header {
                    position: sticky;
                    top: 0;
                    background: rgba(10, 10, 10, 0.55) !important;
                    backdrop-filter: blur(20px) !webkit-backdrop-filter: blur(20px) !important;
                    z-index: 100;
                    padding: 20px;
                    border-bottom: 1px solid rgba(255, 69, 0, 0.15) !important;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8), inset 0 0 30px rgba(255, 69, 0, 0.05) !important;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                }
            `}</style>
            {/* Cinematic Header */}
            <div className="glass-header">
                <div>
                    <h1 style={{ margin: 0, color: '#FFF', fontSize: '24px', fontWeight: '900', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span className="pulsing-live-dot" /> LIVE ARENA
                    </h1>
                    <p style={{ margin: '4px 0 0 0', color: '#888', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {liveCreators.length} Broadcasts Active
                    </p>
                </div>
                <button onClick={() => setActiveScreen('Home')} style={{ background: 'transparent', border: '1px solid #444', color: '#FFF', padding: '6px 16px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s', textTransform: 'uppercase' }} onMouseOver={(e) => { e.currentTarget.style.borderColor = '#FFD700'; e.currentTarget.style.color = '#FFD700'; }} onMouseOut={(e) => { e.currentTarget.style.borderColor = '#444'; e.currentTarget.style.color = '#FFF'; }}>
                    Back
                </button>
            </div>

            <div style={{ padding: '20px' }}>
                
                {lobbyAd && !selectedCategory && (
                    <div 
                        onClick={() => lobbyAd.link && window.open(lobbyAd.link, '_blank')}
                        style={{ width: '100%', marginBottom: '20px', borderRadius: '16px', overflow: 'hidden', position: 'relative', cursor: lobbyAd.link ? 'pointer' : 'default', border: '1px solid rgba(255,215,0,0.3)', boxShadow: '0 8px 30px rgba(0,0,0,0.5)' }}
                    >
                        <img src={lobbyAd.imageUrl} alt="Sponsor" style={{ width: '100%', height: '100px', objectFit: 'cover', display: 'block' }} />
                        <div style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(5px)', color: '#FFD700', fontSize: '9px', fontWeight: '900', padding: '4px 8px', borderRadius: '8px', letterSpacing: '1px', textTransform: 'uppercase', border: '1px solid rgba(255,215,0,0.5)' }}>
                            SPONSORED
                        </div>
                    </div>
                )}

                {!selectedCategory ? (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '20px' }}>
                        {ROOM_CATEGORIES.map(cat => {
                            const count = liveCreators.filter(c => c.liveRoomType === cat.id).length;
                            return (
                                <div key={cat.id} onClick={() => setSelectedCategory(cat.id)} style={{ background: 'rgba(30,30,30,0.8)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '20px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', transition: 'transform 0.2s' }} onMouseDown={e => e.currentTarget.style.transform='scale(0.95)'} onMouseUp={e => e.currentTarget.style.transform='scale(1)'}>
                                    <span style={{ fontSize: '40px', marginBottom: '10px' }}>{cat.icon}</span>
                                    <h3 style={{ margin: 0, color: '#FFF', fontSize: '16px', fontWeight: '900' }}>{cat.title}</h3>
                                    <p style={{ margin: '5px 0 10px 0', color: '#888', fontSize: '11px' }}>{cat.desc}</p>
                                    <span style={{ background: '#FFD700', color: '#000', padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', marginTop: '10px' }}>{count} ACTIVE</span>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div style={{ marginBottom: '20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <button onClick={() => setSelectedCategory(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#FFF', padding: '8px 16px', borderRadius: '20px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>← Back</button>
                            <h2 style={{ margin: 0, color: '#FFF', fontSize: '18px' }}>{ROOM_CATEGORIES.find(c => c.id === selectedCategory)?.title}</h2>
                        </div>
                        <button 
                            onClick={async () => {
                                showMessage(`Starting broadcast in ${ROOM_CATEGORIES.find(c => c.id === selectedCategory)?.title}...`);
                                try {
                                    const { updateDoc, doc } = await import('firebase/firestore');
                                    const userRef = doc(db, "creators", currentUser.uid);
                                    await updateDoc(userRef, { isLive: true, liveRoomType: selectedCategory });
                                    setActiveScreen('RoastRoom');
                                } catch (e) { showMessage("Failed to start stream."); }
                            }}
                            style={{ background: '#FFD700', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '13px', fontWeight: '900', cursor: 'pointer', boxShadow: '0 0 15px rgba(255,215,0,0.4)', textTransform: 'uppercase' }}
                        >
                            🎙️ Start Broadcast Here
                        </button>
                    </div>
                )}

                {isLoading ? (
                    <div style={{ textAlign: 'center', color: '#666', marginTop: '40px', fontSize: '14px', fontStyle: 'italic' }}>
                        Scanning frequencies...
                    </div>
                ) : filteredCreators.length === 0 && selectedCategory ? (
                    <div style={{ textAlign: 'center', background: 'rgba(255,255,255,0.02)', padding: '40px 20px', borderRadius: '12px', border: '1px dashed #333', marginTop: '20px' }}>
                        <p style={{ margin: 0, color: '#888', fontSize: '14px' }}>No active broadcasts in this arena.</p>
                        <p style={{ margin: '10px 0 0 0', color: '#555', fontSize: '12px' }}>Check back later or go live from your Dashboard.</p>
                    </div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '15px' }}>
                        {filteredCreators.map((creator, index) => {
                            // "IN HEAT" if a specific flag is active (future-proofing for battle status), else "IDLE"
                            const isBattleActive = creator.battleStatus === 'IN HEAT';
                            const influenceRank = index + 1; // Since query is ordered by followerCount

                            return (
                                <div 
                                    key={creator.id} 
                                    onClick={() => handleJoinArena(creator)}
                                    style={{ 
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        background: isBattleActive ? 'rgba(255,69,0,0.05)' : 'rgba(30,30,30,0.5)',
                                        border: isBattleActive ? '1px solid rgba(255,69,0,0.5)' : '1px solid rgba(255,255,255,0.05)',
                                        borderRadius: '12px', padding: '15px', cursor: 'pointer', transition: 'all 0.2s',
                                        boxShadow: isBattleActive ? '0 0 15px rgba(255,69,0,0.1)' : 'none'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                                        {/* Avatar with Live Ring */}
                                        <div style={{ position: 'relative', width: '50px', height: '50px', borderRadius: '50%', padding: '2px', background: isBattleActive ? 'linear-gradient(45deg, #FF4500, #FFD700)' : '#444' }}>
                                            <img 
                                                src={creator.profilePictureUrl || 'https://placehold.co/50'} 
                                                alt={creator.creatorName} 
                                                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', background: '#000' }} 
                                            />
                                        </div>
                                        
                                        <div>
                                            <h3 style={{ margin: 0, color: '#FFF', fontSize: '15px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                {creator.creatorName}
                                                <span style={{ background: '#222', color: '#FFD700', padding: '2px 6px', borderRadius: '4px', fontSize: '9px', border: '1px solid #444', letterSpacing: '0.5px' }}>
                                                    RANK #{influenceRank}
                                                </span>
                                            </h3>
                                            <p style={{ margin: '4px 0 0 0', color: '#888', fontSize: '11px', maxWidth: '200px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {creator.bio || "Live Now"}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Dynamic Battle Status Tag & Share Button */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <button 
                                            onClick={(e) => handleShareBroadcast(e, creator)}
                                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFF', padding: '6px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}
                                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#00FFFF'; e.currentTarget.style.color = '#00FFFF'; }}
                                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; e.currentTarget.style.color = '#FFF'; }}
                                            title="Share Live Broadcast"
                                        >
                                            <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/></svg>
                                        </button>
                                        <div style={{ 
                                            background: isBattleActive ? '#FF4500' : 'rgba(255,255,255,0.05)', 
                                            color: isBattleActive ? '#000' : '#888', 
                                            padding: '6px 10px', borderRadius: '6px', fontSize: '10px', 
                                            fontWeight: '900', letterSpacing: '1px', border: isBattleActive ? 'none' : '1px solid rgba(255,255,255,0.1)' 
                                        }}>
                                            {isBattleActive ? 'IN HEAT 🔥' : 'IDLE ❄️'}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default LiveDirectoryScreen;