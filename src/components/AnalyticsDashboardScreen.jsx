// src/components/AnalyticsDashboardScreen.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { db, functions, httpsCallable, doc, onSnapshot, collection, query, orderBy } from '../firebase';

// --- Sub-Components for UI structure ---
const StatCard = ({ title, value }) => (
    <div className="dashboardSection" style={{ flex: 1, textAlign: 'center', minWidth: '150px' }}>
        <p className="dashboardItem" style={{ color: '#AAA', marginBottom: '5px' }}>{title}</p>
        <p className="premiumFeatureTitle" style={{ fontSize: '28px', margin: 0 }}>
            {(value || 0).toLocaleString()}
        </p>
    </div>
);

const BreakdownTable = ({ title, data }) => (
    <div className="dashboardSection" style={{ flex: 1, minWidth: '250px' }}>
        <p className="dashboardSectionTitle">{title}</p>
        {!data ? <p>Loading...</p> : Object.entries(data).map(([key, value]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #3A3A3A', textTransform: 'capitalize' }}>
                <span>{key.replace(/_/g, ' ')}</span>
                <span style={{ fontWeight: 'bold' }}>{value.toLocaleString()}</span>
            </div>
        ))}
    </div>
);

// --- Main Analytics Component ---
function AnalyticsDashboardScreen({ showMessage, setActiveScreen }) {
    const [platformStats, setPlatformStats] = useState(null);
    const [creators, setCreators] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [sortBy, setSortBy] = useState('lifetimeViews');

    useEffect(() => {
        const statsRef = doc(db, "statistics", "platformOverview");
        const unsubStats = onSnapshot(statsRef, (doc) => {
            if (doc.exists()) {
                setPlatformStats(doc.data());
            }
            setLoading(false);
        });

        const creatorsRef = collection(db, "creators");
        const creatorsQuery = query(creatorsRef, orderBy('lifetimeViews', 'desc'));
        const unsubCreators = onSnapshot(creatorsQuery, (snapshot) => {
            setCreators(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });

        return () => {
            unsubStats();
            unsubCreators();
        };
    }, []);

    const handleRefreshStats = async () => {
        setIsRefreshing(true);
        showMessage("Requesting stats refresh...");
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

    const sortedCreators = useMemo(() => {
        return [...creators].sort((a, b) => (b[sortBy] || 0) - (a[sortBy] || 0));
    }, [creators, sortBy]);

    if (loading) {
        return <div className="screenContainer"><p className="heading">Loading Analytics...</p></div>;
    }

    return (
        <div className="screenContainer">
            <div className="flex justify-between items-center mb-4">
                <p className="heading" style={{ margin: 0 }}>Platform Health Dashboard</p>
                <div>
                    <button className="button" onClick={handleRefreshStats} disabled={isRefreshing} style={{ margin: '0 10px 0 0', backgroundColor: '#FF8C00' }}>
                        <span className="buttonText">{isRefreshing ? '...' : 'Refresh Stats'}</span>
                    </button>
                    <button className="button" onClick={() => setActiveScreen('AdminDashboard')} style={{ margin: 0, backgroundColor: '#555' }}>
                        <span className="buttonText">Back</span>
                    </button>
                </div>
            </div>
            <p className="subHeading" style={{ textAlign: 'left' }}>
                A high-level overview of platform activity. Last updated: {platformStats ? new Date(platformStats.lastUpdated).toLocaleString() : 'N/A'}
            </p>

            <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                <StatCard title="Total Users" value={platformStats?.totalUsers} />
                <StatCard title="Active Users (30d)" value={platformStats?.activeUsers30Days} />
                <StatCard title="New Users (7d)" value={platformStats?.newUsers7Days} />
                <StatCard title="Content Items" value={platformStats?.totalContentItems} />
            </div>

            <div style={{ display: 'flex', gap: '15px', marginTop: '20px', flexWrap: 'wrap' }}>
                <BreakdownTable title="User Roles" data={platformStats?.userRoleBreakdown} />
                <BreakdownTable title="Campaign Status" data={platformStats?.campaignStatusBreakdown} />
            </div>

            <div className="dashboardSection" style={{ marginTop: '20px' }}>
                <p className="dashboardSectionTitle">Creator Performance (Lifetime)</p>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #FFD700' }}>
                            <th style={{ textAlign: 'left', paddingBottom: '10px' }}>Creator</th>
                            <th onClick={() => setSortBy('lifetimeViews')} style={{ cursor: 'pointer', textAlign: 'right', padding: '0 10px 10px 10px' }}>Views {sortBy === 'lifetimeViews' && '▼'}</th>
                            <th onClick={() => setSortBy('lifetimeLikes')} style={{ cursor: 'pointer', textAlign: 'right', padding: '0 10px 10px 10px' }}>Likes {sortBy === 'lifetimeLikes' && '▼'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedCreators.map(creator => (
                            <tr key={creator.id} style={{ borderBottom: '1px solid #3A3A3A' }}>
                                <td style={{ padding: '10px 0', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <img src={creator.profilePictureUrl || 'https://placehold.co/40x40/888/FFF?text=P'} alt={creator.creatorName} style={{ width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover' }} />
                                    <span style={{ fontWeight: 'bold' }}>{creator.creatorName}</span>
                                </td>
                                <td style={{ textAlign: 'right', fontSize: '16px', fontWeight: 'bold', color: sortBy === 'lifetimeViews' ? '#FFD700' : '#FFF', padding: '0 10px' }}>{(creator.lifetimeViews || 0).toLocaleString()}</td>
                                <td style={{ textAlign: 'right', fontSize: '16px', fontWeight: 'bold', color: sortBy === 'lifetimeLikes' ? '#FFD700' : '#FFF', padding: '0 10px' }}>{(creator.lifetimeLikes || 0).toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

export default AnalyticsDashboardScreen;