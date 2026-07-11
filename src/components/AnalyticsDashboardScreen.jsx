// src/components/AnalyticsDashboardScreen.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { db, functions, httpsCallable, doc, onSnapshot, collection, query, orderBy } from '../firebase';

// --- SPONSOR-FOCUSED GLASSMORPHIC STAT CARD ---
const SponsorStatCard = ({ title, value, subtext, color = '#00FFFF', icon = '📊' }) => (
    <div style={{
        flex: '1 1 200px',
        background: 'rgba(20, 20, 20, 0.6)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: `1px solid ${color}44`,
        borderRadius: '16px',
        padding: '20px',
        boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
        position: 'relative',
        overflow: 'hidden'
    }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <span style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>{title}</span>
            <span style={{ fontSize: '18px' }}>{icon}</span>
        </div>
        <p style={{ fontSize: '28px', fontWeight: '900', color: color, margin: 0, fontFamily: 'monospace' }}>
            {value}
        </p>
        {subtext && <p style={{ fontSize: '11px', color: '#AAA', margin: '6px 0 0 0' }}>{subtext}</p>}
    </div>
);

const BreakdownTable = ({ title, data }) => (
    <div style={{
        flex: '1 1 300px',
        background: 'rgba(20, 20, 20, 0.6)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '16px',
        padding: '20px'
    }}>
        <p style={{ color: '#FFD700', fontSize: '14px', fontWeight: 'bold', margin: '0 0 15px 0', textTransform: 'uppercase', letterSpacing: '1px' }}>{title}</p>
        {!data ? <p style={{ color: '#666' }}>Loading breakdown...</p> : Object.entries(data).map(([key, value]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '13px' }}>
                <span style={{ color: '#DDD', textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
                <span style={{ fontWeight: 'bold', color: '#FFF', fontFamily: 'monospace' }}>{value.toLocaleString()}</span>
            </div>
        ))}
    </div>
);

function AnalyticsDashboardScreen({ showMessage, setActiveScreen }) {
    const [platformStats, setPlatformStats] = useState(null);
    const [creators, setCreators] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [sortBy, setSortBy] = useState('lifetimeViews');
    const [creatorSearchTerm, setCreatorSearchTerm] = useState('');

    useEffect(() => {
        const statsRef = doc(db, "statistics", "platformOverview");
        const unsubStats = onSnapshot(statsRef, (docSnap) => {
            if (docSnap.exists()) {
                setPlatformStats(docSnap.data());
            }
            setLoading(false);
        });

        const creatorsRef = collection(db, "creators");
        const creatorsQuery = query(creatorsRef, orderBy('lifetimeViews', 'desc'));
        const unsubCreators = onSnapshot(creatorsQuery, (snapshot) => {
            setCreators(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
        });

        return () => {
            unsubStats();
            unsubCreators();
        };
    }, []);

    const handleRefreshStats = async () => {
        setIsRefreshing(true);
        showMessage("Requesting real-time stats refresh...");
        try {
            const triggerUpdate = httpsCallable(functions, 'triggerPlatformStatsUpdate');
            const result = await triggerUpdate();
            showMessage(result.data.message);
        } catch (error) {
            showMessage(`Error: ${error.message}`);
        } finally {
            setIsRefreshing(false);
        }
    };

    // --- SPONSOR & AUDIENCE METRICS CALCULATIONS ($0 COST) ---
    const aggregatedMetrics = useMemo(() => {
        const totalViews = creators.reduce((sum, c) => sum + (c.lifetimeViews || 0), 0);
        const totalLikes = creators.reduce((sum, c) => sum + (c.lifetimeLikes || 0), 0);
        const totalGifts = creators.reduce((sum, c) => sum + (c.giftsReceived || 0), 0);
        
        // Engagement Rate = (Total Interactions / Total Views) * 100
        const avgEngagementRate = totalViews > 0 ? ((totalLikes / totalViews) * 100).toFixed(2) : '0.00';
        
        // Sponsor Readiness Score (0 - 100) based on engagement and active monthly base
        const activeUsers = platformStats?.activeUsers30Days || 0;
        const sponsorScore = Math.min(100, Math.round((parseFloat(avgEngagementRate) * 8) + (activeUsers * 0.2)));

        return {
            totalViews,
            totalLikes,
            totalGifts,
            avgEngagementRate,
            sponsorScore
        };
    }, [creators, platformStats]);

    const sortedCreators = useMemo(() => {
        return creators
            .filter(creator => 
                creator.creatorName?.toLowerCase().includes(creatorSearchTerm.toLowerCase())
            )
            .sort((a, b) => {
                if (sortBy === 'engagement') {
                    const rateA = (a.lifetimeViews || 0) > 0 ? ((a.lifetimeLikes || 0) / a.lifetimeViews) : 0;
                    const rateB = (b.lifetimeViews || 0) > 0 ? ((b.lifetimeLikes || 0) / b.lifetimeViews) : 0;
                    return rateB - rateA;
                }
                return (b[sortBy] || 0) - (a[sortBy] || 0);
            });
    }, [creators, sortBy, creatorSearchTerm]);

    if (loading) {
        return <div className="screenContainer" style={{ textAlign: 'center', paddingTop: '50px' }}><p className="heading" style={{ color: '#00FFFF' }}>Loading Sponsor Analytics...</p></div>;
    }

    return (
        <div className="screenContainer" style={{ background: '#050505', paddingBottom: '100px', minHeight: '100vh' }}>
            {/* HEADER CONTROL BAR */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                <div>
                    <h1 className="heading" style={{ margin: 0, fontSize: '24px' }}>🌍 Global Network & Audience Intelligence</h1>
                    <p style={{ color: '#888', fontSize: '12px', margin: '4px 0 0 0' }}>
                        International reach metrics, engagement intelligence, and network liquidity. Last sync: {platformStats?.lastUpdated ? new Date(platformStats.lastUpdated).toLocaleString() : 'Recent'}
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="button" onClick={handleRefreshStats} disabled={isRefreshing} style={{ margin: 0, backgroundColor: '#00FFFF', color: '#000', fontWeight: 'bold' }}>
                        <span className="buttonText">{isRefreshing ? 'Syncing...' : '🔄 Sync Live Data'}</span>
                    </button>
                    <button className="button" onClick={() => setActiveScreen('AdminDashboard')} style={{ margin: 0, backgroundColor: '#222', color: '#FFF', border: '1px solid #444' }}>
                        <span className="buttonText">Back</span>
                    </button>
                </div>
            </div>

            {/* NETWORK PERFORMANCE SUMMARY BANNER */}
            <div style={{
                background: 'linear-gradient(135deg, rgba(0,255,255,0.08) 0%, rgba(255,215,0,0.05) 100%)',
                border: '1px solid rgba(0, 255, 255, 0.25)',
                borderRadius: '20px',
                padding: '24px',
                marginBottom: '25px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '20px'
            }}>
                <div>
                    <span style={{ background: 'rgba(0,255,255,0.15)', color: '#00FFFF', padding: '4px 12px', borderRadius: '20px', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: '1px' }}>
                        INTERNATIONAL TRAFFIC OPTIMIZED
                    </span>
                    <h2 style={{ color: '#FFF', fontSize: '22px', fontWeight: '900', margin: '10px 0 4px 0' }}>Global Reach & Conversion Profile</h2>
                    <p style={{ color: '#AAA', fontSize: '13px', margin: 0, maxWidth: '550px' }}>
                        High-retention international traffic with a <strong style={{ color: '#4ADE80' }}>{aggregatedMetrics.avgEngagementRate}%</strong> performance ratio across global video showcases and tournaments.
                    </p>
                </div>
                <div style={{ textAlign: 'right', background: 'rgba(0,0,0,0.5)', padding: '15px 25px', borderRadius: '14px', border: '1px solid rgba(255,215,0,0.3)' }}>
                    <span style={{ fontSize: '11px', color: '#888', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 'bold' }}>NETWORK POWER</span>
                    <p style={{ fontSize: '36px', fontWeight: '900', color: '#FFD700', margin: 0, fontFamily: 'monospace' }}>
                        {aggregatedMetrics.sponsorScore}<span style={{ fontSize: '18px', color: '#888' }}>/100</span>
                    </p>
                </div>
            </div>

            {/* TOP METRICS GRID */}
            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', marginBottom: '25px' }}>
                <SponsorStatCard title="Total Impressions (Views)" value={aggregatedMetrics.totalViews.toLocaleString()} subtext="Cumulative Video & Premiere Views" color="#00FFFF" icon="👁️" />
                <SponsorStatCard title="Avg. Engagement Rate" value={`${aggregatedMetrics.avgEngagementRate}%`} subtext="Likes to Views Virality Ratio" color="#4ADE80" icon="⚡" />
                <SponsorStatCard title="Audience Support (Gifts)" value={aggregatedMetrics.totalGifts.toLocaleString()} subtext="Patron Token Transactions" color="#FFD700" icon="🎁" />
                <SponsorStatCard title="Active Audience (30d)" value={(platformStats?.activeUsers30Days || 0).toLocaleString()} subtext="Monthly Active Users (MAU)" color="#C084FC" icon="👥" />
            </div>

            {/* BREAKDOWN TABLES [1] */}
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginBottom: '25px' }}>
                <BreakdownTable title="User Demographics & Roles" data={platformStats?.userRoleBreakdown} />
                <BreakdownTable title="Geographic Reach (By Region)" data={platformStats?.geographyBreakdown} />
            </div>

            {/* INTERNATIONAL TALENT PERFORMANCE LEADERBOARD */}
            <div style={{
                background: 'rgba(20, 20, 20, 0.6)',
                backdropFilter: 'blur(12px)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                borderRadius: '20px',
                padding: '24px'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
                    <div>
                        <h3 style={{ color: '#FFF', fontSize: '18px', fontWeight: 'bold', margin: 0 }}>🏆 Global Talent Performance Index</h3>
                        <p style={{ color: '#888', fontSize: '12px', margin: '4px 0 0 0' }}>Top performing creators analyzed by international reach and audience retention.</p>
                    </div>
                    
                    {/* SEARCH & SORT CONTROLS */}
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                        <input
                            type="text"
                            placeholder="Search creator..."
                            value={creatorSearchTerm}
                            onChange={(e) => setCreatorSearchTerm(e.target.value)}
                            style={{
                                background: '#111',
                                border: '1px solid #333',
                                borderRadius: '8px',
                                padding: '8px 14px',
                                color: '#FFF',
                                fontSize: '13px',
                                outline: 'none'
                            }}
                        />
                        <select 
                            value={sortBy} 
                            onChange={(e) => setSortBy(e.target.value)}
                            style={{
                                background: '#111',
                                border: '1px solid #333',
                                borderRadius: '8px',
                                padding: '8px 14px',
                                color: '#FFD700',
                                fontSize: '13px',
                                fontWeight: 'bold',
                                outline: 'none'
                            }}
                        >
                            <option value="lifetimeViews">Sort by Views</option>
                            <option value="lifetimeLikes">Sort by Likes</option>
                            <option value="engagement">Sort by Engagement %</option>
                            <option value="giftsReceived">Sort by Gifts Received</option>
                        </select>
                    </div>
                </div>

                <div style={{ maxHeight: '500px', overflowY: 'auto', paddingRight: '5px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ borderBottom: '1px solid rgba(255, 215, 0, 0.3)', color: '#FFD700', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                                <th style={{ padding: '12px 10px' }}>Creator</th>
                                <th style={{ padding: '12px 10px', textAlign: 'right' }}>Total Views</th>
                                <th style={{ padding: '12px 10px', textAlign: 'right' }}>Total Likes</th>
                                <th style={{ padding: '12px 10px', textAlign: 'right' }}>Engagement Rate</th>
                                <th style={{ padding: '12px 10px', textAlign: 'right' }}>Gifts Received</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedCreators.map(creator => {
                                const views = creator.lifetimeViews || 0;
                                const likes = creator.lifetimeLikes || 0;
                                const gifts = creator.giftsReceived || 0;
                                const engRate = views > 0 ? ((likes / views) * 100).toFixed(2) : '0.00';

                                return (
                                    <tr key={creator.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)', fontSize: '14px' }}>
                                        <td style={{ padding: '12px 10px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <img src={creator.profilePictureUrl || 'https://placehold.co/40x40/333/FFF?text=P'} alt={creator.creatorName} style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(255,255,255,0.1)' }} />
                                            <div>
                                                <span style={{ fontWeight: 'bold', color: '#FFF', display: 'block' }}>{creator.creatorName || "NVA Creator"}</span>
                                                <span style={{ fontSize: '11px', color: '#888' }}>{creator.creatorField || 'Creator'}</span>
                                            </div>
                                        </td>
                                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#FFF', fontFamily: 'monospace' }}>{views.toLocaleString()}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#FFF', fontFamily: 'monospace' }}>{likes.toLocaleString()}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#4ADE80', fontFamily: 'monospace' }}>{engRate}%</td>
                                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#FFD700', fontFamily: 'monospace' }}>{gifts.toLocaleString()}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

export default AnalyticsDashboardScreen;