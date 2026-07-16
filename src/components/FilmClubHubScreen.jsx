import React, { useState, useEffect, useRef, useMemo } from 'react';
import { LiveKitRoom, RoomAudioRenderer, useTracks, VideoTrack, useRoomContext } from '@livekit/components-react';
import { Track } from 'livekit-client';
import "@livekit/components-styles";
import { db, functions, doc, collection, onSnapshot, updateDoc, setDoc, getDoc, addDoc, query, orderBy, limit, where } from '../firebase';
import { httpsCallable } from 'firebase/functions';

// THE DEFINITIVE SECURITY FIX: Synchronized with SSL-certified infrastructure [1]
const LIVEKIT_URL = "wss://livekit.nvanetworkapp.com";

// --- CHILD COMPONENT: CLASSROOM VIEWER COUNT ---
const ClassroomViewerCount = () => {
    const room = useRoomContext();
    const [count, setCount] = useState(0);
    useEffect(() => {
        const i = setInterval(() => setCount(room.numParticipants), 2000);
        return () => clearInterval(i);
    }, [room]);
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'rgba(0,0,0,0.5)', padding: '4px 10px', borderRadius: '12px', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#A855F7', boxShadow: '0 0 8px #A855F7' }}></div>
            <span style={{ color: '#FFF', fontSize: '11px', fontWeight: 'bold' }}>{count} ENROLLED IN CLASS</span>
        </div>
    );
};

// --- MAIN CLASSROOM SYSTEM (TAB 3 - STAGE) ---
function ClassroomStage({ currentUser, creatorProfile, showMessage, handleExit }) {
    const [token, setToken] = useState(null);
    const [classState, setClassState] = useState({ status: 'idle', admittedUsers: [], spotlightedUids: [] });
    const isHost = creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority' || creatorProfile?.role === 'super_admin';

    useEffect(() => {
        const fetchToken = async () => {
            try {
                const getFunc = httpsCallable(functions, 'getRoastRoomToken'); // Reused token generator
                const res = await getFunc({ roomName: "film-club-class" });
                setToken(res.data.token);
            } catch (err) { showMessage("handshake failed."); }
        };
        fetchToken();

        const unsubClass = onSnapshot(doc(db, "live_arena", "film-club-class"), (snap) => {
            if (snap.exists()) setClassState(snap.data());
        });

        return () => unsubClass();
    }, [creatorProfile, isHost]);

    if (!token) {
        return (
            <div style={{ padding: '40px', textAlign: 'center', color: '#888' }}>
                <p>Initializing secure LiveKit connection...</p>
            </div>
        );
    }

    return (
        /* FORCE AUDIO-ONLY: Bypasses webcam conflicts and stops disconnect loops */
        <LiveKitRoom 
            serverUrl={LIVEKIT_URL} 
            token={token} 
            connect={true}
            video={false} 
            audio={true} 
        >
            <ClassroomStageContent 
                classState={classState} 
                currentUser={currentUser} 
                creatorProfile={creatorProfile} 
                showMessage={showMessage} 
                handleExit={handleExit} 
                isHost={isHost}
            />
            <RoomAudioRenderer />
        </LiveKitRoom>
    );
}

// --- DYNAMIC CLASSROOM CARD (Replaces black screens with live pulsing avatars) ---
function ClassroomParticipantCard({ track, roleColor = '#A855F7' }) {
    const [studentProfile, setStudentProfile] = useState(null);
    const isSpeaking = track.participant.isSpeaking;
    const isCameraOn = track.participant.isCameraEnabled;

    useEffect(() => {
        const unsub = onSnapshot(doc(db, "creators", track.participant.identity), (snap) => {
            if (snap.exists()) setStudentProfile(snap.data());
        }, () => {});
        return () => unsub();
    }, [track.participant.identity]);

    const isDirector = studentProfile?.role === 'admin' || studentProfile?.role === 'authority' || studentProfile?.role === 'super_admin';

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: '180px', borderRadius: '16px', overflow: 'hidden', border: `2px solid ${isSpeaking ? '#4ADE80' : (isDirector ? '#A855F7' : roleColor)}`, background: '#050505', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: isSpeaking ? '0 0 20px rgba(74, 222, 128, 0.2)' : 'none', transition: 'all 0.3s ease' }}>
            
            {/* Clean, Centered Symmetrical Audio Avatar Display */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '12px', textAlign: 'center' }}>
                <div style={{ position: 'relative', display: 'inline-block' }}>
                    {/* Pulse Ring when speaking */}
                    <div style={{ position: 'absolute', inset: -4, borderRadius: '50%', border: isSpeaking ? '3px solid #4ADE80' : 'none', animation: isSpeaking ? 'pulse-mic 1.5s infinite' : 'none' }}></div>
                    <img 
                        src={studentProfile?.profilePictureUrl || 'https://placehold.co/100?text=👤'} 
                        alt="Avatar" 
                        style={{ width: '90px', height: '90px', borderRadius: '50%', objectFit: 'cover', border: `2px solid ${isSpeaking ? '#4ADE80' : '#444'}`, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }} 
                    />
                </div>
                <span style={{ color: isDirector ? '#A855F7' : '#FFF', fontSize: '13px', fontWeight: '800', letterSpacing: '0.5px' }}>
                    {isDirector ? "🎬 DIRECTOR" : `@${studentProfile?.creatorName?.toUpperCase() || 'STUDENT'}`}
                </span>
            </div>

            {/* Float Badge */}
            <div style={{ position: 'absolute', top: '15px', left: '15px', background: isSpeaking ? 'rgba(74, 222, 128, 0.85)' : 'rgba(10,10,10,0.75)', padding: '4px 12px', borderRadius: '20px', color: '#FFF', fontSize: '10px', fontWeight: '900', letterSpacing: '0.5px', textTransform: 'uppercase', backdropFilter: 'blur(5px)', border: '1px solid rgba(255,255,255,0.1)' }}>
                {isSpeaking ? "🎙️ Speaking" : "Muted"}
            </div>
        </div>
    );
}

// --- CLASSROOM CONTENT CONTROLLER ---
function ClassroomStageContent({ classState, currentUser, creatorProfile, showMessage, handleExit, isHost }) {
    const room = useRoomContext();
    const tracks = useTracks([{ source: Track.Source.Camera, withPlaceholder: true }]);
    const [isMicEnabled, setIsMicEnabled] = useState(false);

    // Sync microphone state on room connection
    useEffect(() => {
        if (room?.localParticipant) {
            setIsMicEnabled(room.localParticipant.isMicrophoneEnabled);
        }
    }, [room]);

    const handleToggleMic = async () => {
        if (!room) return;
        try {
            const newState = !isMicEnabled;
            await room.localParticipant.setMicrophoneEnabled(newState);
            setIsMicEnabled(newState);
            showMessage(newState ? "🎤 Microphone Unmuted" : "🔇 Microphone Muted");
        } catch (err) {
            showMessage("Failed to access microphone.");
        }
    };
    
    // Firestore Admittance check for students
    const isAdmitted = useMemo(() => {
        if (isHost) return true;
        return Array.isArray(classState.admittedUsers) && classState.admittedUsers.includes(currentUser?.uid);
    }, [classState.admittedUsers, currentUser, isHost]);

    // Handle Mute All (Host Only)
    const handleMuteAll = async () => {
        try {
            showMessage("Muting all microphones...");
            const muteFunc = httpsCallable(functions, 'muteAllClassroomParticipants');
            await muteFunc();
        } catch (err) { showMessage("Failed to mute participants."); }
    };

    // Handle admitting a user
    const handleAdmitUser = async (studentUid) => {
        try {
            const currentAdmitted = Array.isArray(classState.admittedUsers) ? classState.admittedUsers : [];
            if (!currentAdmitted.includes(studentUid)) {
                await updateDoc(doc(db, "live_arena", "film-club-class"), {
                    admittedUsers: [...currentAdmitted, studentUid]
                });
                showMessage("Student admitted to class.");
            }
        } catch (err) { showMessage("Admit failed."); }
    };

    // Handle dropping/kicking a user
    const handleDropUser = async (studentUid) => {
        try {
            const currentAdmitted = Array.isArray(classState.admittedUsers) ? classState.admittedUsers : [];
            const updated = currentAdmitted.filter(id => id !== studentUid);
            const currentSpotlight = Array.isArray(classState.spotlightedUids) ? classState.spotlightedUids : [];
            const updatedSpotlight = currentSpotlight.filter(id => id !== studentUid);

            await updateDoc(doc(db, "live_arena", "film-club-class"), {
                admittedUsers: updated,
                spotlightedUids: updatedSpotlight
            });
            showMessage("Student removed from class.");
        } catch (err) { showMessage("Drop failed."); }
    };

    // Handle Spotlight Toggle
    const handleToggleSpotlight = async (studentUid) => {
        try {
            const currentSpotlight = Array.isArray(classState.spotlightedUids) ? classState.spotlightedUids : [];
            let updatedSpotlight = [];
            if (currentSpotlight.includes(studentUid)) {
                updatedSpotlight = currentSpotlight.filter(id => id !== studentUid);
                showMessage("Student removed from spotlight.");
            } else {
                updatedSpotlight = [...currentSpotlight, studentUid];
                showMessage("Student spotlighted side-by-side.");
            }
            await updateDoc(doc(db, "live_arena", "film-club-class"), {
                spotlightedUids: updatedSpotlight
            });
        } catch (err) { showMessage("Spotlight toggle failed."); }
    };

    // THE FIX: Filter admitted/authorized tracks securely first to prevent runtime undefined reference crashes
    const admittedTracks = useMemo(() => {
        return tracks.filter(t => {
            const pId = t.participant.identity;
            return pId === creatorProfile?.uid || (Array.isArray(classState.admittedUsers) && classState.admittedUsers.includes(pId));
        });
    }, [tracks, classState.admittedUsers, creatorProfile]);

    // Separate spotlighted vs non-spotlighted tracks
    const { spotlightedTracks, galleryTracks } = useMemo(() => {
        const spotlightSet = new Set(classState.spotlightedUids || []);
        const sTracks = [];
        const gTracks = [];

        admittedTracks.forEach(t => {
            const pId = t.participant.identity;
            if (spotlightSet.has(pId)) {
                sTracks.push(t);
            } else {
                gTracks.push(t);
            }
        });

        // THE FIX: Key names in return statement now match destructured variables perfectly to prevent undefined crashes
        if (sTracks.length === 0) {
            return { spotlightedTracks: admittedTracks, galleryTracks: [] };
        }
        return { spotlightedTracks: sTracks, galleryTracks: gTracks };
    }, [admittedTracks, classState.spotlightedUids]);

    // --- RENDER GREEN ROOM / WAITING LOBBY (For Students) ---
    if (!isAdmitted) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', textAlign: 'center', background: '#050505', minHeight: '50vh', borderRadius: '16px', border: '1px dashed #333' }}>
                <div style={{ fontSize: '48px', animation: 'pulse-mic 2s infinite', marginBottom: '20px' }}>🚪</div>
                <h3 style={{ color: '#FFF', fontSize: '20px', fontWeight: 'bold', margin: '0 0 10px 0' }}>The Green Room</h3>
                <p style={{ color: '#888', fontSize: '14px', maxWidth: '300px', margin: 0, lineHeight: '1.5' }}>
                    Welcome! You are safely checked in. Please wait here comfortably while the Director admits you into the classroom.
                </p>
                <button onClick={handleExit} style={{ marginTop: '25px', background: 'rgba(255,255,255,0.05)', border: '1px solid #444', color: '#FFF', padding: '10px 24px', borderRadius: '20px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer' }}>
                    Exit Lobby
                </button>
            </div>
        );
    }

    return (
        <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', background: '#0A0A0A', borderRadius: '16px', overflow: 'hidden', border: '1px solid #222' }}>
            
            {/* Stage Header (Fully Responsive Dual-Row Wrap) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '15px 20px', background: '#111', borderBottom: '1px solid #222' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                    <ClassroomViewerCount />
                    {isHost && <span style={{ background: '#A855F7', color: '#000', fontSize: '10px', fontWeight: '900', padding: '3px 8px', borderRadius: '4px' }}>DIRECTOR</span>}
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end', flexGrow: 1 }}>
                    {/* Share Class Link Button */}
                    <button 
                        onClick={async () => {
                            const shareUrl = `${window.location.origin}/FilmClubHub`;
                            const text = `🎬 Join our Live Film Club Class Room now! Tap to attend:`;
                            if (navigator.share) {
                                try { await navigator.share({ title: 'Film Club Live Class', text, url: shareUrl }); }
                                catch (err) { if (err.name !== 'AbortError') showMessage("Share failed."); }
                            } else {
                                navigator.clipboard.writeText(`${text} ${shareUrl}`).then(() => {
                                    showMessage("Classroom link copied!");
                                }).catch(() => showMessage("Failed to copy link."));
                            }
                        }}
                        style={{ 
                            background: 'rgba(168, 85, 247, 0.1)', 
                            border: '1px solid #A855F7', 
                            color: '#A855F7', 
                            padding: '6px 15px', 
                            borderRadius: '6px', 
                            fontSize: '12px', 
                            fontWeight: 'bold', 
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                    >
                        <span>🔗 Share Class</span>
                    </button>

                    {/* Live Microphone Controller */}
                    <button 
                        onClick={handleToggleMic} 
                        style={{ 
                            background: isMicEnabled ? 'rgba(74, 222, 128, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
                            border: isMicEnabled ? '1px solid #4ADE80' : '1px solid #EF4444', 
                            color: isMicEnabled ? '#4ADE80' : '#EF4444', 
                            padding: '6px 15px', 
                            borderRadius: '6px', 
                            fontSize: '12px', 
                            fontWeight: 'bold', 
                            cursor: 'pointer' 
                        }}
                    >
                        {isMicEnabled ? "🎙️ Mute" : "🔇 Unmute"}
                    </button>

                    {isHost && (
                        <button onClick={handleMuteAll} style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #EF4444', color: '#EF4444', padding: '6px 15px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                            Mute All Mics
                        </button>
                    )}
                    
                    <button onClick={handleExit} style={{ background: 'rgba(255, 0, 0, 0.15)', border: '1px solid #FF0000', color: '#FF0000', padding: '6px 15px', borderRadius: '6px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}>
                        Leave Stage
                    </button>
                </div>
            </div>

            {/* Stage Layout (Grid + Side Panel for Host) */}
            <div style={{ flex: 1, display: 'flex', minHeight: '500px' }}>
                
                {/* Main Video Arena */}
                <div style={{ flex: 3, display: 'flex', flexDirection: 'column', padding: '15px', gap: '15px', background: '#050505' }}>
                    
                    {/* Spotlight Scene Grid */}
                    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: spotlightedTracks.length > 1 ? '1fr 1fr' : '1fr', gap: '15px' }}>
                        {spotlightedTracks.map(t => (
                            <div key={`${t.participant.identity}-${t.source}`} style={{ position: 'relative', width: '100%', height: '100%' }}>
                                <ClassroomParticipantCard track={t} roleColor="#A855F7" />
                            </div>
                        ))}
                    </div>

                    {/* Minimized Gallery (For non-spotlighted students) */}
                    {galleryTracks.length > 0 && (
                        <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '5px', height: '180px', background: '#111', borderRadius: '12px' }}>
                            {galleryTracks.map(t => (
                                <div key={`${t.participant.identity}-${t.source}`} style={{ position: 'relative', width: '160px', height: '100%', flexShrink: 0 }}>
                                    <ClassroomParticipantCard track={t} roleColor="#444" />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Director Sidebar Control Center (Host Only) */}
                {isHost && (
                    <div style={{ flex: 1, background: '#111', borderLeft: '1px solid #222', padding: '15px', display: 'flex', flexDirection: 'column', gap: '15px', overflowY: 'auto' }}>
                        <p style={{ margin: 0, color: '#A855F7', fontSize: '11px', fontWeight: '900', letterSpacing: '1px', textTransform: 'uppercase' }}>STUDENT COMMAND CENTER</p>
                        
                        {/* ADMIT ALL BUTTON */}
                        <button 
                            onClick={async () => {
                                try {
                                    const currentAdmitted = Array.isArray(classState.admittedUsers) ? classState.admittedUsers : [];
                                    const pendingIds = tracks
                                        .map(t => t.participant.identity)
                                        .filter(id => id !== currentUser?.uid && !currentAdmitted.includes(id));
                                    
                                    if (pendingIds.length > 0) {
                                        await updateDoc(doc(db, "live_arena", "film-club-class"), {
                                            admittedUsers: [...currentAdmitted, ...pendingIds]
                                        });
                                        showMessage("All pending students admitted!");
                                    } else {
                                        showMessage("No pending students to admit.");
                                    }
                                } catch (e) { showMessage("Admit All failed."); }
                            }}
                            style={{ width: '100%', padding: '12px', background: 'rgba(34, 197, 94, 0.1)', border: '1px solid #22C55E', color: '#22C55E', borderRadius: '8px', fontWeight: '900', fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer', transition: 'all 0.2s' }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#22C55E'; e.currentTarget.style.color = '#000'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(34, 197, 94, 0.1)'; e.currentTarget.style.color = '#22C55E'; }}
                        >
                            ➕ Admit All Students
                        </button>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {tracks.map(t => {
                                const isSelf = t.participant.identity === currentUser?.uid;
                                if (isSelf) return null;

                                const isStudentAdmitted = Array.isArray(classState.admittedUsers) && classState.admittedUsers.includes(t.participant.identity);
                                const isStudentSpotlighted = Array.isArray(classState.spotlightedUids) && classState.spotlightedUids.includes(t.participant.identity);

                                return (
                                    <div key={t.participant.identity} style={{ background: '#1A1A1A', borderRadius: '8px', padding: '10px', border: '1px solid #222' }}>
                                        <p style={{ margin: '0 0 8px 0', color: '#FFF', fontWeight: 'bold', fontSize: '13px' }}>@{t.participant.name || t.participant.identity.slice(0,8)}</p>
                                        
                                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                                            {!isStudentAdmitted ? (
                                                <button onClick={() => handleAdmitUser(t.participant.identity)} style={{ flex: 1, background: '#22C55E', color: '#000', border: 'none', padding: '5px', borderRadius: '4px', fontSize: '10px', fontWeight: '900', cursor: 'pointer' }}>ADMIT</button>
                                            ) : (
                                                <>
                                                    <button onClick={() => handleToggleSpotlight(t.participant.identity)} style={{ flex: 1, background: isStudentSpotlighted ? '#FFD700' : '#444', color: isStudentSpotlighted ? '#000' : '#FFF', border: 'none', padding: '5px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                                                        {isStudentSpotlighted ? 'UNPIN' : 'SCENE PIN'}
                                                    </button>
                                                    <button onClick={() => handleDropUser(t.participant.identity)} style={{ flex: 1, background: '#DC3545', color: '#FFF', border: 'none', padding: '5px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}>
                                                        DROP
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// --- MAIN HUB VIEW ---
const FilmClubHubScreen = ({ setActiveScreen, currentUser, creatorProfile, showMessage }) => {
    const [activeTab, setActiveScreenTab] = useState('notices'); // 'notices', 'lounge', 'stage'
    const [enrollmentConfig, setEnrollmentConfig] = useState(null);
    const [notices, setNotices] = useState([]);
    const [newNotice, setNewNotice] = useState('');
    const [loungeMessages, setLoungeMessages] = useState([]);
    const [newMsg, setNewMsg] = useState('');
    const [isSubmittingLead, setIsSubmittingLead] = useState(false);
    const chatEndRef = useRef(null);

    // --- LOUNGE LOCAL BADGE ENGINE ---
    const [unreadLoungeCount, setUnreadLoungeCount] = useState(0);
    const [showLoungeEmoji, setShowLoungeEmoji] = useState(false);

    // --- REAL-TIME TYPING ENGINE ---
    const [typers, setTypers] = useState([]);
    const typingTimeoutRef = useRef(null);

    // --- LOUNGE THREADED REPLY ENGINE ---
    const [replyTo, setReplyTo] = useState(null);
    const isModerator = creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority' || creatorProfile?.role === 'super_admin';

    // Dynamic Date Separator Formatter [1.1.6]
    const formatMessageDate = (dateString) => {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '';
        
        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(today.getDate() - 1);
        
        if (date.toDateString() === today.toDateString()) return 'Today';
        if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
        return date.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' });
    };

    // Symmetrical Sequential Color Assigner (Zero Collisions & Stable per User) [1.1.6]
    const userColorsMap = useMemo(() => {
        const colors = [
            'rgba(255, 69, 0, 0.05)',   // Red-Orange
            'rgba(0, 191, 255, 0.05)',  // Deep Sky Blue
            'rgba(74, 222, 128, 0.05)',  // Lime Green
            'rgba(168, 85, 247, 0.05)',  // Purple
            'rgba(236, 72, 153, 0.05)',  // Deep Pink
            'rgba(234, 179, 8, 0.05)',   // Gold
            'rgba(6, 182, 212, 0.05)'    // Cyan
        ];
        const borders = [
            'rgba(255, 69, 0, 0.2)',
            'rgba(0, 191, 255, 0.2)',
            'rgba(74, 222, 128, 0.2)',
            'rgba(168, 85, 247, 0.2)',
            'rgba(236, 72, 153, 0.2)',
            'rgba(234, 179, 8, 0.2)',
            'rgba(6, 182, 212, 0.2)'
        ];
        const mapping = {};
        let colorIdx = 0;

        loungeMessages.forEach(msg => {
            if (msg.userId && !mapping[msg.userId]) {
                mapping[msg.userId] = {
                    background: colors[colorIdx],
                    borderColor: borders[colorIdx]
                };
                colorIdx = (colorIdx + 1) % colors.length; // Dynamic loop-back [1.1.6]
            }
        });
        return mapping;
    }, [loungeMessages]);

    const [lastViewedLounge, setLastViewedLounge] = useState(() => {
        return Number(localStorage.getItem(`film_lounge_last_viewed_${currentUser?.uid}`)) || Date.now();
    });

    const handleTabChange = (tabName) => {
        setActiveScreenTab(tabName);
        if (tabName === 'lounge') {
            setUnreadLoungeCount(0);
            const now = Date.now();
            setLastViewedLounge(now);
            localStorage.setItem(`film_lounge_last_viewed_${currentUser?.uid}`, now.toString());
        }
    };

    const handleInputChange = (e) => {
        setNewMsg(e.target.value);
        triggerTypingIndicator();
    };

    const triggerTypingIndicator = async () => {
        if (!currentUser) return;
        
        if (!typingTimeoutRef.current) {
            // Write to Firestore that I am currently typing
            const typingRef = doc(db, "film_club_typing", currentUser.uid);
            setDoc(typingRef, {
                uid: currentUser.uid,
                userName: creatorProfile?.creatorName || 'Student',
                isTyping: true,
                updatedAt: new Date().toISOString()
            }).catch(() => {});
        }

        if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

        // Remove my typing status after 2.5 seconds of inactivity
        typingTimeoutRef.current = setTimeout(async () => {
            const typingRef = doc(db, "film_club_typing", currentUser.uid);
            updateDoc(typingRef, { isTyping: false }).catch(() => {});
            typingTimeoutRef.current = null;
        }, 2500);
    };

    const hasClubAccess = useMemo(() => {
        return creatorProfile?.isFilmClub || creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority' || creatorProfile?.role === 'super_admin';
    }, [creatorProfile]);

    const isEnrollmentOpen = useMemo(() => {
        return enrollmentConfig?.filmClubOpen === true;
    }, [enrollmentConfig]);

    // Data Load Stream
    useEffect(() => {
        const configRef = doc(db, "settings", "enrollmentConfig");
        const unsubConfig = onSnapshot(configRef, (docSnap) => {
            if (docSnap.exists()) setEnrollmentConfig(docSnap.data());
        });

        if (hasClubAccess) {
            // Stream notices
            const noticesQuery = query(collection(db, "film_club_notices"), orderBy("createdAt", "desc"), limit(20));
            const unsubNotices = onSnapshot(noticesQuery, (snap) => {
                setNotices(snap.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            });

            // Stream lounge chat (Audited to fetch newest 200 messages instead of oldest 50)
            const loungeQuery = query(collection(db, "film_club_lounge"), orderBy("createdAt", "desc"), limit(200));
            const unsubLounge = onSnapshot(
                loungeQuery, 
                (snap) => {
                    const msgs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    msgs.reverse(); // Display oldest to newest on screen
                    setLoungeMessages(msgs);

                    // If user is on a different tab, calculate the unread count since they last viewed
                    if (activeTab !== 'lounge') {
                        const count = msgs.filter(m => {
                            const createdTime = new Date(m.createdAt).getTime();
                            return createdTime > lastViewedLounge;
                        }).length;
                        setUnreadLoungeCount(count);
                    }
                },
                () => {}
            );

            // Stream real-time typers list
            const typingQuery = query(collection(db, "film_club_typing"), where("isTyping", "==", true));
            const unsubTyping = onSnapshot(
                typingQuery,
                (snap) => {
                    const activeTypers = snap.docs
                        .map(d => d.data())
                        .filter(t => t.uid !== currentUser?.uid) // Exclude myself
                        .map(t => t.userName);
                    setTypers(activeTypers);
                },
                () => {}
            );

            return () => { unsubConfig(); unsubNotices(); unsubLounge(); unsubTyping(); };
        }

        return () => unsubConfig();
    }, [hasClubAccess, activeTab, lastViewedLounge]);

    // Auto scroll chat
    useEffect(() => {
        if (activeTab === 'lounge') {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [loungeMessages, activeTab]);

    // Handle posting a notice (Host Only)
    const handlePostNotice = async () => {
        if (!newNotice.trim()) return;
        try {
            await addDoc(collection(db, "film_club_notices"), {
                text: newNotice.trim(),
                creatorName: creatorProfile?.creatorName || 'Director',
                createdAt: new Date().toISOString()
            });
            setNewNotice('');
            showMessage("Notice published to board.");
        } catch (err) { showMessage("Notice post failed."); }
    };

    // Handle posting a message to Lounge (Supports nested quoting)
    const handleSendLoungeMsg = async () => {
        if (!newMsg.trim()) return;
        try {
            const payload = {
                text: newMsg.trim(),
                userId: currentUser.uid,
                userName: creatorProfile?.creatorName || 'Student',
                userAvatar: creatorProfile?.profilePictureUrl || '',
                createdAt: new Date().toISOString()
            };

            // Attach quote map if replying
            if (replyTo) {
                payload.replyTo = {
                    messageId: replyTo.id,
                    text: replyTo.text,
                    userName: replyTo.userName
                };
            }

            await addDoc(collection(db, "film_club_lounge"), payload);
            setNewMsg('');
            setReplyTo(null);
        } catch (err) { showMessage("Send failed."); }
    };

    // Handle submitting lead to Waiting List
    const handleJoinWaitlist = async (e) => {
        e.preventDefault();
        const email = document.getElementById('waitlistEmailInput').value;
        const phone = document.getElementById('waitlistPhoneInput').value;
        if (!email) { showMessage("Email is required."); return; }

        setIsSubmittingLead(true);
        try {
            await addDoc(collection(db, "filmClubWaitingList"), {
                userId: currentUser?.uid || 'guest',
                userName: creatorProfile?.creatorName || 'Guest User',
                email: email.trim(),
                phone: phone.trim(),
                createdAt: new Date().toISOString()
            });
            showMessage("🎉 Successfully joined the waiting list!");
            document.getElementById('waitlistForm').reset();
        } catch (err) { showMessage("Failed to register."); }
        finally { setIsSubmittingLead(false); }
    };

    // --- VIEW A: THE ACCESS GATEWAY (SOFT-GATE / WAITLIST) ---
    if (!hasClubAccess) {
        return (
            <div className="screenContainer" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
                <style>{`
                    .gate-box { background: rgba(20, 20, 20, 0.6); backdrop-filter: blur(12px); border: 1px solid rgba(255, 215, 0, 0.2); border-radius: 20px; padding: 40px 30px; max-width: 480px; width: 100%; box-shadow: 0 10px 40px rgba(0,0,0,0.8); }
                    .gate-title { color: #FFD700; font-size: 26px; font-weight: 900; margin: 0 0 8px 0; text-transform: uppercase; letter-spacing: 1px; }
                    .gate-desc { color: #CCC; fontSize: 14px; margin: 0 0 25px 0; line-height: 1.6; }
                `}</style>
                
                <div className="gate-box">
                    <div style={{ fontSize: '48px', marginBottom: '15px' }}>🎬</div>
                    
                    {isEnrollmentOpen ? (
                        <>
                            <h2 className="gate-title">Enrollment Open</h2>
                            <p className="gate-desc">
                                Join the exclusive NVA Film Club! Unlock the private Lounge, Notice Boards, and cinematic live classroom rehearsals with professional Directors.
                            </p>
                            <button className="button" onClick={() => setActiveScreen('EnrollmentHub')} style={{ background: '#FFD700', color: '#000', fontWeight: '900', width: '100%', margin: 0 }}>
                                Apply for Film Club Membership
                            </button>
                        </>
                    ) : (
                        <>
                            <h2 className="gate-title" style={{ color: '#EF4444' }}>Classroom Full</h2>
                            <p className="gate-desc">
                                Film Club enrollment is currently closed as this cohort's classes are underway. Join the priority waitlist to get notified the second registration reopens!
                            </p>
                            <form id="waitlistForm" onSubmit={handleJoinWaitlist} style={{ display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'left' }}>
                                <div>
                                    <label className="formLabel" style={{ fontSize: '11px', color: '#888' }}>Email Address</label>
                                    <input id="waitlistEmailInput" type="email" className="formInput" required placeholder="name@example.com" style={{ margin: 0 }} />
                                </div>
                                <div>
                                    <label className="formLabel" style={{ fontSize: '11px', color: '#888' }}>Phone Number (Optional)</label>
                                    <input id="waitlistPhoneInput" type="tel" className="formInput" placeholder="e.g. 592-123-4567" style={{ margin: 0 }} />
                                </div>
                                <button type="submit" className="button" style={{ width: '100%', background: '#FFF', color: '#000', fontWeight: 'bold', margin: '10px 0 0 0' }} disabled={isSubmittingLead}>
                                    {isSubmittingLead ? 'Registering...' : 'Join Waitlist'}
                                </button>
                            </form>
                        </>
                    )}
                    
                    <button onClick={() => setActiveScreen('Home')} style={{ background: 'none', border: 'none', color: '#666', fontSize: '12px', marginTop: '20px', textDecoration: 'underline', cursor: 'pointer' }}>
                        Back to Home
                    </button>
                </div>
            </div>
        );
    }

    // --- VIEW B: THE GATED CLUB HUB (FOR REGISTERED MEMBERS) ---
    return (
        <div className="screenContainer" style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: 0 }}>
            <style>{`
                .hub-header { display: flex; justify-content: space-between; align-items: center; padding: 15px 20px; background: rgba(10,10,10,0.55); border-bottom: 1px solid #222; backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); }
                .tab-bar { display: flex; gap: 5px; padding: 10px; background: #0D0D0D; border-bottom: 1px solid #1A1A1A; }
                .tab-btn { flex: 1; padding: 10px; background: none; border: none; color: #737373; font-weight: bold; font-size: 13px; cursor: pointer; transition: all 0.2s; border-radius: 8px; }
                .tab-btn.active { color: #FFD700; background: rgba(255,215,0,0.05); border: 1px solid rgba(255,215,0,0.15); }
                .notice-card { background: rgba(255,255,255,0.02); border: 1px solid #222; border-radius: 12px; padding: 15px; margin-bottom: 10px; }
                        .chat-msg-row { display: flex; gap: 10px; margin-bottom: 12px; align-items: flex-start; }
                        .publish-btn { width: 100%; padding: 12px; background: rgba(255,215,0,0.05); border: 1px solid rgba(255,215,0,0.3); color: #FFD700; border-radius: 8px; font-weight: bold; cursor: pointer; transition: all 0.2s ease-in-out; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; margin: 0; }
                        .publish-btn:hover { background: #FFD700; color: #000; box-shadow: 0 0 15px rgba(255,215,0,0.4); }
                        .publish-btn:active { transform: scale(0.98); }
                    `}</style>

            {/* Hub Header */}
            <div className="hub-header">
                <div>
                    <h2 style={{ margin: 0, color: '#FFF', fontSize: '18px', fontWeight: '900', letterSpacing: '1px' }}>🎬 NVA FILM CLUB</h2>
                    <p style={{ margin: '2px 0 0 0', color: '#888', fontSize: '11px', textTransform: 'uppercase' }}>Interactive Student Studio</p>
                </div>
                <button onClick={() => setActiveScreen('Home')} style={{ background: 'transparent', border: '1px solid #444', color: '#FFF', padding: '6px 15px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }}>
                    Home
                </button>
            </div>

            {/* Tab Swapper */}
            <div className="tab-bar">
                <button className={`tab-btn ${activeTab === 'notices' ? 'active' : ''}`} onClick={() => handleTabChange('notices')}>📌 Bulletin</button>
                <button className={`tab-btn ${activeTab === 'lounge' ? 'active' : ''}`} onClick={() => handleTabChange('lounge')}>
                    💬 Lounge {unreadLoungeCount > 0 && (
                        <span style={{ background: '#EF4444', color: '#FFF', fontSize: '10px', padding: '2px 7px', borderRadius: '10px', marginLeft: '6px', fontWeight: '900' }}>{unreadLoungeCount}</span>
                    )}
                </button>
                <button className={`tab-btn ${activeTab === 'stage' ? 'active' : ''}`} onClick={() => handleTabChange('stage')}>🎭 Club Room</button>
            </div>

            {/* Tab Views */}
            <div style={{ flex: 1, padding: '20px', overflowY: 'auto' }}>
                
                {/* Tab 1: Notice Board */}
                {activeTab === 'notices' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {/* Notice Board Input (Host & Super Admin Bypass) */}
                        {(creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority' || creatorProfile?.role === 'super_admin') && (
                            <div style={{ background: 'rgba(255,215,0,0.02)', border: '1px solid rgba(255,215,0,0.2)', padding: '15px', borderRadius: '12px' }}>
                                <p style={{ margin: '0 0 10px 0', color: '#FFD700', fontSize: '12px', fontWeight: '900' }}>📣 POST NEW BULLETIN NOTICE</p>
                                <textarea className="formTextarea" placeholder="Write announcement details..." value={newNotice} onChange={e => setNewNotice(e.target.value)} style={{ marginBottom: '10px' }} />
                                <button className="publish-btn" onClick={handlePostNotice}>Publish Announcement</button>
                            </div>
                        )}

                        <div>
                            {notices.length > 0 ? notices.map(notice => (
                                <div key={notice.id} className="notice-card">
                                    <p style={{ margin: '0 0 10px 0', color: '#FFF', fontSize: '14px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>{notice.text}</p>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', color: '#555', fontSize: '11px', fontWeight: 'bold' }}>
                                        <span>By: {notice.creatorName}</span>
                                        <span>{new Date(notice.createdAt).toLocaleString()}</span>
                                    </div>
                                </div>
                            )) : (
                                <p style={{ color: '#666', fontSize: '13px', textAlign: 'center', fontStyle: 'italic' }}>No active bulletin notices at this time.</p>
                            )}
                        </div>
                    </div>
                )}

                {/* Tab 2: The Lounge (Discussion Forum) */}
                {activeTab === 'lounge' && (
                    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                        <div style={{ flex: 1, overflowY: 'auto', paddingRight: '5px', marginBottom: '15px' }}>
                            {(() => {
                                let lastDate = null;
                                return loungeMessages.length > 0 ? loungeMessages.map(msg => {
                                    const msgDate = new Date(msg.createdAt).toDateString();
                                    const showDateSeparator = msgDate !== lastDate;
                                    lastDate = msgDate;

                                    const bubbleStyle = userColorsMap[msg.userId] || { background: 'rgba(255,255,255,0.02)', borderColor: '#222' };
                                    const dateLabel = formatMessageDate(msg.createdAt);

                                    return (
                                        <div key={msg.id}>
                                            {/* Center-Aligned Date Badge Separator */}
                                            {showDateSeparator && (
                                                <div style={{ display: 'flex', justifyContent: 'center', margin: '20px 0', position: 'relative', alignItems: 'center' }}>
                                                    <div style={{ position: 'absolute', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.05)', zIndex: 1 }}></div>
                                                    <span style={{ position: 'relative', zIndex: 2, background: '#0D0D0D', padding: '4px 14px', borderRadius: '12px', fontSize: '10px', color: '#888', fontWeight: '900', letterSpacing: '1px', textTransform: 'uppercase', border: '1px solid rgba(255,255,255,0.05)' }}>
                                                        {dateLabel}
                                                    </span>
                                                </div>
                                            )}
                                            <div className="chat-msg-row">
                                                <img src={msg.userAvatar || 'https://placehold.co/36'} alt="avatar" style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} />
                                                <div style={{ flex: 1, padding: '10px', borderRadius: '8px', background: bubbleStyle.background, border: `1px solid ${bubbleStyle.borderColor}`, backdropFilter: 'blur(5px)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', alignItems: 'center' }}>
                                                        <span style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '12px' }}>{msg.userName}</span>
                                                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                            <span style={{ color: '#555', fontSize: '10px' }}>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                                                            {/* Reply Trigger */}
                                                            <span 
                                                                onClick={() => setReplyTo({ id: msg.id, text: msg.text, userName: msg.userName })}
                                                                style={{ cursor: 'pointer', color: '#888', fontSize: '11px' }}
                                                                title="Reply to message"
                                                            >↩️</span>
                                                            {/* Author & Moderator Delete Trigger */}
                                                            {(currentUser?.uid === msg.userId || isModerator) && (
                                                                <span 
                                                                    onClick={async () => {
                                                                        if (window.confirm("Delete this message?")) {
                                                                            await deleteDoc(doc(db, "film_club_lounge", msg.id)).catch(() => {});
                                                                        }
                                                                    }}
                                                                    style={{ cursor: 'pointer', color: '#EF4444', fontSize: '11px' }}
                                                                    title="Delete message"
                                                                >🗑️</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    {/* Threaded Reply Box */}
                                                    {msg.replyTo && (
                                                        <div style={{ background: 'rgba(0,0,0,0.3)', borderLeft: '3px solid #FFD700', padding: '6px 12px', borderRadius: '4px', marginBottom: '8px', fontSize: '11px', color: '#BBB', fontStyle: 'italic', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                                                            <strong style={{ color: '#FFD700', fontSize: '10px', display: 'block', marginBottom: '2px', fontStyle: 'normal' }}>@{msg.replyTo.userName}</strong>
                                                            {msg.replyTo.text}
                                                        </div>
                                                    )}
                                                    <p style={{ margin: 0, color: '#FFF', fontSize: '13px', lineHeight: '1.4' }}>{msg.text}</p>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                }) : (
                                    <p style={{ color: '#666', fontSize: '13px', textAlign: 'center', fontStyle: 'italic' }}>Welcome to the Lounge! Start a relaxed discussion on any acting or film topic...</p>
                                );
                            })()}
                            <div ref={chatEndRef} />
                        </div>

                        {/* Reply Closeable Indicator Strip */}
                        {replyTo && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(255,215,0,0.05)', border: '1px solid rgba(255,215,0,0.15)', borderLeft: '3px solid #FFD700', padding: '8px 16px', borderRadius: '8px', marginBottom: '8px' }}>
                                <div style={{ fontSize: '11px', color: '#DDD', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: '85%' }}>
                                    <span style={{ color: '#FFD700', fontWeight: 'bold' }}>Replying to @{replyTo.userName}: </span>
                                    <span style={{ fontStyle: 'italic' }}>"{replyTo.text}"</span>
                                </div>
                                <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '16px' }}>&times;</button>
                            </div>
                        )}

                        {/* Input Row */}
                        <div style={{ display: 'flex', gap: '8px', background: '#0D0D0D', padding: '10px', borderRadius: '8px', border: '1px solid #222', position: 'relative' }}>
                            <input className="formInput" placeholder="Say something..." value={newMsg} onChange={handleInputChange} onKeyDown={e => { if (e.key === 'Enter') handleSendLoungeMsg(); }} style={{ flex: 1, margin: 0, background: '#000' }} />
                            
                            {/* Scrollable 50-Emoji Popover Picker */}
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                                {showLoungeEmoji && (
                                    <div style={{ position: 'absolute', bottom: '50px', right: 0, width: '260px', height: '180px', overflowY: 'auto', background: '#111', border: '1px solid #333', borderRadius: '12px', padding: '10px', display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px', zIndex: 100, boxShadow: '0 10px 30px rgba(0,0,0,0.8)' }}>
                                        {['😀','😂','🤣','😊','😍','🥰','😘','😜','😎','🤩','🥳','😏','😒','😔','🥺','😭','😤','😡','🤯','😳','😱','🥱','😴','🤐','🤔','🤫','😬','🙄','😮','👾','👽','🐱','🐶','🦊','🦁','🍉','🍓','🍕','🍔','🍟','🎉','🔥','🎈','⚡','👀','💯','🎬','👑','🎭','🤝'].map(emo => (
                                            <button key={emo} onClick={() => { setNewMsg(prev => prev + emo); setShowLoungeEmoji(false); }} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', transition: 'transform 0.1s' }} onMouseDown={e => e.currentTarget.style.transform='scale(0.9)'} onMouseUp={e => e.currentTarget.style.transform='scale(1)'}>
                                                {emo}
                                            </button>
                                        ))}
                                    </div>
                                )}
                                <button onClick={() => setShowLoungeEmoji(!showLoungeEmoji)} style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '0 4px', color: showLoungeEmoji ? '#FFD700' : '#FFF' }}>
                                    😀
                                </button>
                            </div>

                            {/* Modern Glassmorphic Send Button */}
                            <button 
                                className="button" 
                                onClick={handleSendLoungeMsg} 
                                style={{ 
                                    margin: 0, 
                                    padding: '0 24px', 
                                    background: 'rgba(255, 215, 0, 0.04)', 
                                    border: '1px solid rgba(255, 215, 0, 0.25)', 
                                    color: '#FFD700', 
                                    fontWeight: '900',
                                    fontSize: '12px',
                                    textTransform: 'uppercase',
                                    letterSpacing: '1px',
                                    borderRadius: '10px',
                                    backdropFilter: 'blur(10px)',
                                    transition: 'all 0.2s ease-out',
                                    boxShadow: '0 4px 15px rgba(255, 215, 0, 0.03)'
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255, 215, 0, 0.12)'; e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.5)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255, 215, 0, 0.04)'; e.currentTarget.style.borderColor = 'rgba(255, 215, 0, 0.25)'; }}
                            >
                                Send
                            </button>
                        </div>
                    </div>
                )}

                {/* Tab 3: The Stage (Live Classroom) */}
                {activeTab === 'stage' && (
                    <ClassroomStage 
                        currentUser={currentUser} 
                        creatorProfile={creatorProfile} 
                        showMessage={showMessage} 
                        handleExit={() => setActiveScreenTab('notices')} 
                    />
                )}

            </div>
        </div>
    );
};

export default FilmClubHubScreen;