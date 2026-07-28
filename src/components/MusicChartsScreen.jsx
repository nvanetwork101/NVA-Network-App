// src/components/MusicChartsScreen.jsx

import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs, limit, doc, getDoc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { db } from '../firebase';

function MusicChartsScreen({ setActiveScreen, currentUser, creatorProfile, handleVideoPress, showMessage }) {
    const [tracks, setTracks] = useState([]);
    const [premieres, setPremieres] = useState([]); // THE FIX: Music Video Premieres State
    const [loading, setLoading] = useState(true);
    const [nowTime, setNowTime] = useState(Date.now());

    useEffect(() => {
        const timer = setInterval(() => setNowTime(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const fetchMusicCharts = async () => {
            try {
                // 1. Query Upcoming & Active Live Music Premieres (Self-Healing Sync)
                const premieresQuery = query(
                    collection(db, 'movies'),
                    where('type', '==', 'musicVideoPremiere'),
                    limit(10)
                );
                const premieresSnap = await getDocs(premieresQuery);
                const fetchedPremieres = await Promise.all(premieresSnap.docs.map(async (docSnap) => {
                    const data = docSnap.data();
                    const itemId = docSnap.id;
                    
                    // Self-healing check: ensure event doc exists so comments never fail
                    try {
                        const eventRef = doc(db, "events", itemId);
                        const eventDoc = await getDoc(eventRef);
                        if (!eventDoc.exists()) {
                            await setDoc(eventRef, {
                                eventTitle: data.title || 'Music Premiere',
                                eventDescription: data.credits || 'Live Music Video Premiere',
                                liveStreamUrl: data.videoUrl || '',
                                thumbnailUrl: data.posterUrl || data.songPosterUrl || '',
                                scheduledStartTime: data.premiereDate ? new Date(data.premiereDate) : new Date(),
                                status: 'upcoming',
                                room: data.room || 'Room 1',
                                creatorId: data.creatorId || data.suggestedBy || '',
                                creatorName: data.creatorName || data.suggestedByName || 'Musician',
                                isTicketed: !!data.isTicketed,
                                ticketPrice: Number(data.ticketPrice) || 0
                            });
                        }
                    } catch (e) {
                        console.error("Error healing event doc:", e);
                    }

                    return { id: itemId, ...data };
                }));
                
                // THE FIX: Automatically hide premieres post-duration & sort earliest scheduled date first
                const nowMs = Date.now();
                const activePremieres = fetchedPremieres
                    .filter(p => {
                        const pTime = p.premiereDate ? (p.premiereDate.toMillis ? p.premiereDate.toMillis() : new Date(p.premiereDate).getTime()) : 0;
                        const durSecs = Number(p.durationTotalSec) || 0;
                        const windowMs = durSecs > 0 ? (durSecs * 1000) : (15 * 60 * 1000);
                        return pTime === 0 || nowMs < (pTime + windowMs);
                    })
                    .sort((a, b) => {
                        const tA = a.premiereDate ? (a.premiereDate.toMillis ? a.premiereDate.toMillis() : new Date(a.premiereDate).getTime()) : 0;
                        const tB = b.premiereDate ? (b.premiereDate.toMillis ? b.premiereDate.toMillis() : new Date(b.premiereDate).getTime()) : 0;
                        return tA - tB; // Earliest premiere date first
                    });
                setPremieres(activePremieres);

                // 2. Queries the live library strictly for "Music" categorized content
                const collectionRef = collection(db, 'artifacts/production-app-id/public/data/content_items');
                const q = query(
                    collectionRef,
                    where('contentType', '==', 'Music'),
                    where('isActive', '==', true),
                    orderBy('viewCount', 'desc'),
                    limit(50) // The NVA HOT 50
                );

                const snapshot = await getDocs(q);
                const fetchedTracks = snapshot.docs.map((doc, index) => {
                    const data = doc.data();
                    const rank = index + 1;
                    
                    // Deterministic Math to generate realistic historical Billboard stats
                    const idHash = doc.id.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                    
                    // Weeks on Chart: Time since creation mapped to weeks, bounded by hash variance
                    let createdAtMs = Date.now();
                    if (data.createdAt?.toMillis) createdAtMs = data.createdAt.toMillis();
                    else if (data.createdAt?.seconds) createdAtMs = data.createdAt.seconds * 1000;
                    
                    const actualWeeks = Math.max(1, Math.floor((Date.now() - createdAtMs) / (1000 * 60 * 60 * 24 * 7)));
                    const weeksOnChart = Math.min(actualWeeks, (idHash % 12) + 1);

                    // Peak Position Logic
                    const peakPosition = rank === 1 ? 1 : Math.max(1, rank - (idHash % 5));

                    // Trend Generation
                    const previousRank = rank === 1 ? (weeksOnChart > 1 ? 1 : 3) : rank + ((idHash % 3) - 1);
                    let trend = '➖';
                    let trendColor = '#888';
                    if (previousRank > rank) { trend = '▲'; trendColor = '#00FF00'; }
                    else if (previousRank < rank) { trend = '▼'; trendColor = '#FF0000'; }

                    // Units Sold calculation ($475 GYD = 1 Unit)
                    const contentEarnings = (data.donationsSum || data.donationsTotal || 0) + (data.ticketSalesTotal || data.ticketEarnings || 0);
                    const unitsSold = typeof data.unitsSold === 'number' ? data.unitsSold : Math.floor(contentEarnings / 475);

                    return {
                        id: doc.id,
                        ...data,
                        rank,
                        weeksOnChart,
                        peakPosition,
                        trend,
                        trendColor,
                        unitsSold
                    };
                });

                setTracks(fetchedTracks);
            } catch (error) {
                console.error("Error fetching music charts:", error);
                showMessage("Failed to load charts.");
            } finally {
                setLoading(false);
            }
        };

        fetchMusicCharts();
    }, [showMessage]);

    const playTrack = (item) => {
        if (!currentUser) {
            showMessage("Please log in to play music.");
            setActiveScreen('Login');
            return;
        }
        handleVideoPress(item.embedUrl || item.mainUrl || item.liveStreamUrl, item);
    };

    if (loading) {
        return (
            <div className="screenContainer" style={{ textAlign: 'center', paddingTop: '100px' }}>
                <div style={{ color: '#FFD700', fontSize: '24px', fontWeight: '900', letterSpacing: '4px', animation: 'pulse 1.5s infinite' }}>
                    CALCULATING CHARTS...
                </div>
            </div>
        );
    }

    const numberOne = tracks[0];
    const restOfTracks = tracks.slice(1);

    return (
        <div className="screenContainer" style={{ padding: '0', backgroundColor: '#050505', minHeight: '100vh', paddingBottom: '100px' }}>
            {/* Header */}
            <div style={{ padding: '40px 20px 20px', textAlign: 'center', background: 'linear-gradient(to bottom, #1A1A1A, #050505)', borderBottom: '1px solid #222' }}>
                <h1 style={{ margin: 0, fontSize: '38px', fontWeight: '900', color: '#FFD700', textTransform: 'uppercase', letterSpacing: '4px', textShadow: '0 0 20px rgba(255, 215, 0, 0.4)' }}>
                    NVA HOT 50
                </h1>
                <p style={{ margin: '10px 0 0', color: '#888', fontSize: '14px', letterSpacing: '2px', textTransform: 'uppercase' }}>
                    The most streamed music on the network
                </p>
            </div>

            {/* ====== THE STUDIO PREMIERE STAGE (DISTINCT GREEN TRAY) ====== */}
            {premieres.length > 0 && (
                <div style={{ maxWidth: '800px', margin: '25px auto 10px', padding: '0 20px' }}>
                    <div style={{ background: 'rgba(50, 205, 50, 0.03)', border: '1px solid #32CD32', borderRadius: '20px', padding: '20px', boxShadow: '0 0 30px rgba(50, 205, 50, 0.1)' }}>
                        <p style={{ color: '#32CD32', fontSize: '14px', fontWeight: '900', letterSpacing: '3px', textTransform: 'uppercase', margin: '0 0 15px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            🎵 THE STUDIO: UPCOMING LIVE PREMIERES
                        </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        {premieres.map((prem) => {
                            const pTime = prem.premiereDate ? (prem.premiereDate.toMillis ? prem.premiereDate.toMillis() : new Date(prem.premiereDate).getTime()) : 0;
                            const isLive = pTime > 0 && nowTime >= pTime;
                            const shareUrl = `${window.location.origin}/content/${prem.id}`;

                            return (
                                <div 
                                    key={prem.id}
                                    style={{ 
                                        position: 'relative',
                                        background: 'linear-gradient(135deg, rgba(8, 25, 12, 0.95) 0%, rgba(2, 10, 4, 0.98) 100%)',
                                        border: '1px solid rgba(50, 205, 50, 0.4)',
                                        borderRadius: '18px',
                                        padding: '18px',
                                        boxShadow: '0 12px 35px rgba(0, 0, 0, 0.8), inset 0 1px 1px rgba(255, 255, 255, 0.1), 0 0 20px rgba(50, 205, 50, 0.15)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '20px',
                                        flexWrap: 'wrap',
                                        backdropFilter: 'blur(12px)',
                                        WebkitBackdropFilter: 'blur(12px)'
                                    }}
                                >
                                    {/* Cinematic Poster Frame with Glass Accent */}
                                    <div style={{ width: '110px', height: '110px', borderRadius: '14px', overflow: 'hidden', border: '2px solid #32CD32', flexShrink: 0, position: 'relative', boxShadow: '0 8px 20px rgba(0,0,0,0.6)' }}>
                                        <img src={prem.posterUrl || prem.songPosterUrl || 'https://placehold.co/110'} alt={prem.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 60%)' }} />
                                    </div>

                                    {/* Main Info */}
                                    <div style={{ flex: 1, minWidth: '220px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                            <span style={{ 
                                                background: isLive ? 'linear-gradient(90deg, #DC3545, #FF4500)' : 'linear-gradient(90deg, #32CD32, #20B2AA)', 
                                                color: isLive ? '#FFF' : '#000', 
                                                fontSize: '9px', 
                                                fontWeight: '900', 
                                                padding: '3px 10px', 
                                                borderRadius: '100px', 
                                                textTransform: 'uppercase',
                                                letterSpacing: '1px',
                                                boxShadow: isLive ? '0 0 12px rgba(220, 53, 69, 0.6)' : '0 0 10px rgba(50, 205, 50, 0.4)'
                                            }}>
                                                {isLive ? '🔴 LIVE NOW' : `🔒 ${prem.isTicketed ? `${prem.ticketPrice} GYD` : 'FREE NOW'}`}
                                            </span>
                                            <span style={{ color: '#00FFFF', fontSize: '11px', fontWeight: 'bold', background: 'rgba(0,255,255,0.08)', padding: '2px 8px', borderRadius: '6px', border: '1px solid rgba(0,255,255,0.2)' }}>
                                                📍 {prem.room || 'Room 1'}
                                            </span>
                                        </div>

                                        <h3 style={{ margin: 0, fontSize: '22px', fontWeight: '900', color: '#FFF', letterSpacing: '0.5px', textShadow: '0 2px 10px rgba(0,0,0,0.8)' }}>{prem.title}</h3>
                                        <p style={{ margin: '3px 0 10px 0', fontSize: '13px', color: '#32CD32', fontWeight: '800', letterSpacing: '0.5px' }}>{prem.creatorName || prem.suggestedByName || 'Musician'}</p>

                                        <div style={{ display: 'flex', gap: '14px', alignItems: 'center', flexWrap: 'wrap', fontSize: '12px', color: '#888' }}>
                                            {(() => {
                                                const diff = pTime - nowTime;
                                                let countdownStr = 'SCHEDULED';
                                                if (pTime > 0) {
                                                    if (diff <= 0) {
                                                        countdownStr = '🔴 LIVE NOW';
                                                    } else {
                                                        const d = Math.floor(diff / (1000 * 60 * 60 * 24));
                                                        const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
                                                        const m = Math.floor((diff / (1000 * 60)) % 60);
                                                        const s = Math.floor((diff / 1000) % 60);
                                                        countdownStr = `⏳ ${d > 0 ? d + 'd ' : ''}${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
                                                    }
                                                }
                                                return (
                                                    <span style={{ color: diff <= 0 && pTime > 0 ? '#DC3545' : '#FFD700', fontWeight: '900', fontVariantNumeric: 'tabular-nums', textShadow: '0 0 10px rgba(255,215,0,0.3)' }}>
                                                        {countdownStr}
                                                    </span>
                                                );
                                            })()}
                                            <span>•</span>
                                            <span style={{ color: '#00FFFF', fontWeight: 'bold', display: 'inline-flex', alignItems: 'center', gap: '5px', textShadow: '0 0 8px rgba(0,255,255,0.3)' }}>
                                                📀 {prem.unitsSold || Math.floor(((prem.ticketSalesTotal || 0) + (prem.donationsTotal || 0)) / 475)} Units Sold
                                            </span>
                                        </div>
                                    </div>

                                    {/* Action Buttons: Enter Waiting Room, Comments, Share & Staff Take Down */}
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center', width: '100%', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '14px', flexWrap: 'wrap' }}>
                                        <button 
                                            onClick={() => {
                                                sessionStorage.setItem('nva_target_premiere_event_id', prem.id);
                                                sessionStorage.setItem('nva_target_discover_tab', 'Premieres');
                                                setActiveScreen('Discover');
                                            }}
                                            style={{ background: 'linear-gradient(90deg, #32CD32 0%, #20B2AA 100%)', color: '#000', border: 'none', padding: '10px 20px', borderRadius: '10px', fontSize: '12px', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', boxShadow: '0 0 15px rgba(50, 205, 50, 0.4)', textTransform: 'uppercase', letterSpacing: '0.5px' }}
                                        >
                                            🍿 Enter Theater
                                        </button>

                                        <button 
                                            onClick={() => {
                                                window.dispatchEvent(new CustomEvent('openCommentsModal', {
                                                    detail: { item: prem, itemType: 'event' }
                                                }));
                                            }}
                                            style={{ background: '#1A1A1A', border: '1px solid #333', color: '#FFF', padding: '10px 18px', borderRadius: '10px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                        >
                                            💬 Comments
                                        </button>

                                        <button 
                                            onClick={async () => {
                                                if (navigator.share) {
                                                    navigator.share({ title: prem.title, text: `Watch the Live Music Premiere of ${prem.title} on NVA Network!`, url: shareUrl }).catch(() => {});
                                                } else {
                                                    await navigator.clipboard.writeText(shareUrl);
                                                    showMessage("Premiere link copied!");
                                                }
                                            }}
                                            style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.2)', color: '#FFF', padding: '10px 18px', borderRadius: '10px', fontSize: '12px', fontWeight: '900', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                                        >
                                            🔗 Share
                                        </button>

                                        {/* Staff Take Down Button */}
                                        {['super_admin', 'admin', 'authority', 'moderator'].includes(creatorProfile?.role) && (
                                            <button 
                                                onClick={async () => {
                                                    if (window.confirm(`TAKE DOWN PREMIERE?\nAre you sure you want to remove "${prem.title}" and place a 72-hour payout lock on the artist?`)) {
                                                        try {
                                                            await deleteDoc(doc(db, "movies", prem.id));
                                                            try { await deleteDoc(doc(db, "events", prem.id)); } catch (e) {}
                                                            
                                                            const artistId = prem.creatorId || prem.suggestedBy;
                                                            if (artistId) {
                                                                const lockUntil = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
                                                                await updateDoc(doc(db, "creators", artistId), { payoutLockUntil: lockUntil });
                                                            }
                                                            setPremieres(prev => prev.filter(p => p.id !== prem.id));
                                                            showMessage("Premiere taken down and 72-hour payout lock applied.");
                                                        } catch (err) {
                                                            showMessage("Failed to take down premiere: " + err.message);
                                                        }
                                                    }
                                                }}
                                                style={{ background: 'rgba(220, 53, 69, 0.2)', color: '#DC3545', border: '1px solid #DC3545', padding: '10px 18px', borderRadius: '10px', fontSize: '11px', fontWeight: '900', cursor: 'pointer', marginLeft: 'auto', textTransform: 'uppercase' }}
                                            >
                                                🚫 Staff Take Down
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        )}

            {/* ====== DISTINCT CHART START DIVIDER ====== */}
            <div style={{ maxWidth: '800px', margin: '30px auto 15px', textAlign: 'center', borderTop: '1px solid #333', paddingTop: '20px' }}>
                <span style={{ background: '#050505', color: '#FFD700', padding: '6px 20px', borderRadius: '20px', border: '1px solid #FFD700', fontSize: '12px', fontWeight: '900', letterSpacing: '3px', textTransform: 'uppercase', boxShadow: '0 0 15px rgba(255,215,0,0.2)' }}>
                    🏆 OFFICIAL NVA HOT 50 CHART 🏆
                </span>
            </div>

            {/* HERO: The Number 1 Spot */}
            {numberOne && (
                <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
                    <div 
                        onClick={() => playTrack(numberOne)}
                        style={{ 
                            position: 'relative', 
                            borderRadius: '16px', 
                            overflow: 'hidden', 
                            cursor: 'pointer',
                            boxShadow: '0 20px 50px rgba(255, 215, 0, 0.2)',
                            border: '1px solid rgba(255, 215, 0, 0.4)',
                            background: '#000',
                            transition: 'transform 0.3s ease'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                        onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
                    >
                        <div style={{ position: 'relative', width: '100%', aspectRatio: '16/9' }}>
                            <img src={numberOne.customThumbnailUrl || numberOne.imageUrl} alt={numberOne.title} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} />
                            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, background: 'linear-gradient(to top, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 60%)' }} />
                            
                            {/* Giant #1 Badge */}
                            <div style={{ position: 'absolute', top: '15px', left: '15px', background: '#FFD700', color: '#000', fontSize: '42px', fontWeight: '900', padding: '0 15px', borderRadius: '12px', boxShadow: '0 5px 15px rgba(0,0,0,0.5)' }}>
                                1
                            </div>
                        </div>

                        <div style={{ padding: '25px', position: 'relative', marginTop: '-60px', zIndex: 10 }}>
                            <div style={{ color: '#FFD700', fontSize: '12px', fontWeight: '900', letterSpacing: '2px', marginBottom: '8px' }}>
                                {numberOne.weeksOnChart} {numberOne.weeksOnChart === 1 ? 'WEEK' : 'WEEKS'} AT NO. 1 🏆
                            </div>
                            <h2 style={{ margin: '0 0 5px 0', fontSize: '32px', color: '#FFF', fontWeight: '900', lineHeight: 1.2 }}>{numberOne.title}</h2>
                            <p style={{ margin: 0, color: '#AAA', fontSize: '18px' }}>{numberOne.creatorName}</p>
                            
                            <div style={{ display: 'flex', gap: '20px', marginTop: '20px', borderTop: '1px solid #333', paddingTop: '15px', flexWrap: 'wrap' }}>
                                <div style={{ color: '#FFF', fontSize: '12px' }}><span style={{ color: '#888' }}>PEAK:</span> {numberOne.peakPosition}</div>
                                <div style={{ color: '#FFF', fontSize: '12px' }}><span style={{ color: '#888' }}>WKS ON CHART:</span> {numberOne.weeksOnChart}</div>
                                <div style={{ color: '#FFF', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ color: '#888' }}>TREND:</span> 
                                    <span style={{ color: numberOne.trendColor, fontWeight: 'bold' }}>{numberOne.trend}</span>
                                </div>
                                <div style={{ color: '#00FFFF', fontSize: '12px', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '6px', textShadow: '0 0 10px rgba(0,255,255,0.4)', borderLeft: '1px solid #333', paddingLeft: '20px' }}>
                                    <svg viewBox="0 0 24 24" width="16" height="16" style={{ filter: 'drop-shadow(0 0 4px #FFD700)', flexShrink: 0 }}>
                                        <circle cx="12" cy="12" r="10" fill="url(#heroGoldGrad)" stroke="#FFE55C" strokeWidth="1"/>
                                        <circle cx="12" cy="12" r="7" fill="none" stroke="#B8860B" strokeWidth="0.8" strokeDasharray="1.5 1.5"/>
                                        <circle cx="12" cy="12" r="3.5" fill="#111" stroke="#FFD700" strokeWidth="0.8"/>
                                        <circle cx="12" cy="12" r="1" fill="#FFD700"/>
                                        <defs>
                                            <radialGradient id="heroGoldGrad" cx="30%" cy="30%" r="70%">
                                                <stop offset="0%" stopColor="#FFE57F"/>
                                                <stop offset="50%" stopColor="#FFD700"/>
                                                <stop offset="100%" stopColor="#B8860B"/>
                                            </radialGradient>
                                        </defs>
                                    </svg>
                                    UNITS: {(numberOne.unitsSold || 0).toLocaleString()}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* List: Tracks 2-50 */}
            <div style={{ maxWidth: '800px', margin: '20px auto 0', padding: '0 10px' }}>
                {restOfTracks.map((track) => (
                    <div 
                        key={track.id} 
                        onClick={() => playTrack(track)}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            padding: '15px', 
                            background: '#111', 
                            marginBottom: '10px', 
                            borderRadius: '12px',
                            cursor: 'pointer',
                            border: '1px solid #222',
                            transition: 'all 0.2s ease'
                        }}
                        onMouseOver={(e) => { e.currentTarget.style.background = '#1A1A1A'; e.currentTarget.style.borderColor = '#444'; }}
                        onMouseOut={(e) => { e.currentTarget.style.background = '#111'; e.currentTarget.style.borderColor = '#222'; }}
                    >
                        {/* Rank */}
                        <div style={{ width: '50px', textAlign: 'center', flexShrink: 0 }}>
                            <div style={{ fontSize: '24px', fontWeight: '900', color: track.rank <= 5 ? '#FFD700' : '#888' }}>
                                {track.rank}
                            </div>
                            <div style={{ fontSize: '10px', color: track.trendColor, marginTop: '2px' }}>
                                {track.trend}
                            </div>
                        </div>

                        {/* Thumbnail */}
                        <div style={{ width: '80px', height: '80px', flexShrink: 0, margin: '0 15px', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
                            <img src={track.customThumbnailUrl || track.imageUrl} alt={track.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.2s' }} className="play-overlay">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="#FFF"><path d="M8 5v14l11-7z"/></svg>
                            </div>
                            <style>{`
                                div:hover > .play-overlay { opacity: 1 !important; }
                            `}</style>
                        </div>

                        {/* Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: 'bold', color: '#FFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {track.title}
                            </p>
                            <p style={{ margin: '0 0 8px 0', fontSize: '13px', color: '#AAA', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {track.creatorName}
                            </p>
                            
                            {/* Desktop Stats (Hidden on very small screens for clean UI) */}
                            <div style={{ display: 'flex', gap: '15px', fontSize: '11px', color: '#666', fontWeight: 'bold', flexWrap: 'wrap', alignItems: 'center' }}>
                                <span>PEAK: {track.peakPosition}</span>
                                <span>WKS: {track.weeksOnChart}</span>
                                <span style={{ color: '#444' }}>•</span>
                                <span style={{ color: '#00FFFF', textShadow: '0 0 5px rgba(0,255,255,0.3)', fontWeight: '900', letterSpacing: '0.5px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                    <svg viewBox="0 0 24 24" width="13" height="13" style={{ filter: 'drop-shadow(0 0 3px #FFD700)', flexShrink: 0 }}>
                                        <circle cx="12" cy="12" r="10" fill="url(#listGoldGrad)" stroke="#FFE55C" strokeWidth="1"/>
                                        <circle cx="12" cy="12" r="7" fill="none" stroke="#B8860B" strokeWidth="0.8" strokeDasharray="1.5 1.5"/>
                                        <circle cx="12" cy="12" r="3.5" fill="#111" stroke="#FFD700" strokeWidth="0.8"/>
                                        <circle cx="12" cy="12" r="1" fill="#FFD700"/>
                                        <defs>
                                            <radialGradient id="listGoldGrad" cx="30%" cy="30%" r="70%">
                                                <stop offset="0%" stopColor="#FFE57F"/>
                                                <stop offset="50%" stopColor="#FFD700"/>
                                                <stop offset="100%" stopColor="#B8860B"/>
                                            </radialGradient>
                                        </defs>
                                    </svg>
                                    UNITS: {(track.unitsSold || 0).toLocaleString()}
                                </span>
                                <span style={{ color: '#444' }}>•</span>
                                <span>{track.viewCount || 0} STREAMS</span>
                            </div>
                        </div>
                    </div>
                ))}
                
                {tracks.length === 0 && !loading && (
                    <div style={{ textAlign: 'center', padding: '50px 20px', color: '#666' }}>
                        No music tracks are currently charting. Upload content categorized as "Music" to see it here!
                    </div>
                )}
            </div>
        </div>
    );
}

export default MusicChartsScreen;