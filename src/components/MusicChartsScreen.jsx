// src/components/MusicChartsScreen.jsx

import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, getDocs, limit } from "firebase/firestore";
import { db } from '../firebase';

function MusicChartsScreen({ setActiveScreen, currentUser, handleVideoPress, showMessage }) {
    const [tracks, setTracks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchMusicCharts = async () => {
            try {
                // Queries the live library strictly for "Music" categorized content
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

                    return {
                        id: doc.id,
                        ...data,
                        rank,
                        weeksOnChart,
                        peakPosition,
                        trend,
                        trendColor
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
                            
                            <div style={{ display: 'flex', gap: '20px', marginTop: '20px', borderTop: '1px solid #333', paddingTop: '15px' }}>
                                <div style={{ color: '#FFF', fontSize: '12px' }}><span style={{ color: '#888' }}>PEAK:</span> {numberOne.peakPosition}</div>
                                <div style={{ color: '#FFF', fontSize: '12px' }}><span style={{ color: '#888' }}>WKS ON CHART:</span> {numberOne.weeksOnChart}</div>
                                <div style={{ color: '#FFF', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <span style={{ color: '#888' }}>TREND:</span> 
                                    <span style={{ color: numberOne.trendColor, fontWeight: 'bold' }}>{numberOne.trend}</span>
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
                            <div style={{ display: 'flex', gap: '15px', fontSize: '11px', color: '#666', fontWeight: 'bold' }}>
                                <span>PEAK: {track.peakPosition}</span>
                                <span>WKS: {track.weeksOnChart}</span>
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