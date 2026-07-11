// src/components/AdminBoxOfficeScreen.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';

const AdminBoxOfficeScreen = ({ showMessage }) => {
    const [ticketedEvents, setTicketedEvents] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const eventsRef = collection(db, "events");
        const q = query(
            eventsRef,
            where("isTicketed", "==", true),
            orderBy("scheduledStartTime", "desc")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const eventsData = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setTicketedEvents(eventsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching ticketed events:", error);
            showMessage("Failed to load Box Office data.");
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const filteredEvents = ticketedEvents.filter(event =>
        (event.eventTitle || '').toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Dynamic aggregated financial insights
    const totalTicketsSold = ticketedEvents.reduce((acc, curr) => acc + (curr.ticketsSold || 0), 0);
    const totalRevenue = ticketedEvents.reduce((acc, curr) => acc + (curr.totalRevenue || 0), 0);
    const avgTicketPrice = ticketedEvents.length > 0 
        ? (ticketedEvents.reduce((acc, curr) => acc + (curr.ticketPrice || 0), 0) / ticketedEvents.length).toFixed(2) 
        : "0.00";

    const topPerformingEvent = [...ticketedEvents].sort((a, b) => (b.totalRevenue || 0) - (a.totalRevenue || 0))[0];

    const formatDate = (timestamp) => {
        if (!timestamp || !timestamp.toDate) return 'N/A';
        return timestamp.toDate().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
    };

    const getStatusIndicator = (timestamp) => {
        if (!timestamp || !timestamp.toDate) return { text: 'Unknown', color: '#888', bg: '#222' };
        const now = new Date();
        const eventTime = timestamp.toDate();
        if (eventTime > now) {
            return { text: 'Upcoming Stream', color: '#00FFFF', bg: 'rgba(0, 255, 255, 0.1)' };
        }
        return { text: 'Recorded VOD', color: '#AAA', bg: 'rgba(255, 255, 255, 0.05)' };
    };

    if (loading) {
        return <p className="dashboardSectionTitle" style={{ color: '#FFD700', textAlign: 'center', padding: '40px' }}>Loading Box Office Records...</p>;
    }

    return (
        <div className="dashboardSection" style={{ border: '1px solid #222', borderRadius: '12px', padding: '20px', backgroundColor: '#0A0A0A' }}>
            <p className="heading" style={{ color: '#FFD700', margin: '0 0 4px 0' }}>Box Office Ledger</p>
            <p className="subHeading" style={{ color: '#888', marginBottom: '24px' }}>Real-time revenue indicators and ticketing statistics across your theater assets.</p>

            {/* KPI METRICS OVERVIEW PANELS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '25px' }}>
                <div style={{ backgroundColor: '#111', padding: '16px', borderRadius: '8px', border: '1px solid #222', textAlign: 'center' }}>
                    <p style={{ margin: 0, color: '#888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>Total gross sales</p>
                    <p style={{ margin: '8px 0 0 0', fontSize: '24px', fontWeight: 'bold', color: '#00FF00' }}>${totalRevenue.toFixed(2)} USD</p>
                </div>
                <div style={{ backgroundColor: '#111', padding: '16px', borderRadius: '8px', border: '1px solid #222', textAlign: 'center' }}>
                    <p style={{ margin: 0, color: '#888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>Total Tickets Sold</p>
                    <p style={{ margin: '8px 0 0 0', fontSize: '24px', fontWeight: 'bold', color: '#FFF' }}>{totalTicketsSold} Tickets</p>
                </div>
                <div style={{ backgroundColor: '#111', padding: '16px', borderRadius: '8px', border: '1px solid #222', textAlign: 'center' }}>
                    <p style={{ margin: 0, color: '#888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>Average Ticket Price</p>
                    <p style={{ margin: '8px 0 0 0', fontSize: '24px', fontWeight: 'bold', color: '#FFD700' }}>${avgTicketPrice} USD</p>
                </div>
                <div style={{ backgroundColor: '#111', padding: '16px', borderRadius: '8px', border: '1px solid #222', textAlign: 'center' }}>
                    <p style={{ margin: 0, color: '#888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px' }}>Top Performing Show</p>
                    <p style={{ margin: '8px 0 0 0', fontSize: '13px', fontWeight: 'bold', color: '#00FFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {topPerformingEvent ? `${topPerformingEvent.eventTitle} ($${(topPerformingEvent.totalRevenue || 0).toFixed(0)})` : 'None'}
                    </p>
                </div>
            </div>

            {/* LIVE EVENTS FILTER */}
            <div className="formGroup" style={{ marginBottom: '20px' }}>
                <input
                    type="text"
                    className="formInput"
                    placeholder="🔍 Search theater events..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{ backgroundColor: '#111', border: '1px solid #222', borderRadius: '8px', padding: '12px 16px', color: '#FFF' }}
                />
            </div>

            {/* EVENT LISTINGS */}
            <div className="admin-box-office-list" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                {filteredEvents.length > 0 ? (
                    filteredEvents.map(event => {
                        const status = getStatusIndicator(event.scheduledStartTime);
                        return (
                            <div key={event.id} className="adminDashboardItem" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '20px', padding: '15px', backgroundColor: '#121212', border: '1px solid #222', borderRadius: '10px' }}>
                                <div style={{ position: 'relative', width: '128px', height: '72px', borderRadius: '6px', overflow: 'hidden', flexShrink: 0 }}>
                                    <img 
                                        src={event.thumbnailUrl || 'https://placehold.co/128x72/2A2A2A/FFF?text=N/A'} 
                                        alt={event.eventTitle}
                                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                    <span style={{ position: 'absolute', top: '4px', left: '4px', backgroundColor: 'rgba(0,0,0,0.85)', color: '#FFD700', fontSize: '9px', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold' }}>
                                        ${event.ticketPrice || 0} USD
                                    </span>
                                </div>
                                <div style={{ flex: '1 1 300px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '8px' }}>
                                        <p className="adminDashboardItemTitle" style={{ margin: 0, fontSize: '18px', color: '#FFF' }}>{event.eventTitle}</p>
                                        <span style={{ fontSize: '10px', fontWeight: 'bold', color: status.color, backgroundColor: status.bg, padding: '3px 8px', borderRadius: '4px', border: `1px solid ${status.color}33` }}>
                                            {status.text}
                                        </span>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px', fontSize: '13px', color: '#CCC' }}>
                                        <div>
                                            <p style={{ margin: 0, color: '#666', fontSize: '11px', textTransform: 'uppercase' }}>Show Time</p>
                                            <p style={{ margin: '4px 0 0 0', fontWeight: 'bold' }}>{formatDate(event.scheduledStartTime)}</p>
                                        </div>
                                        <div>
                                            <p style={{ margin: 0, color: '#666', fontSize: '11px', textTransform: 'uppercase' }}>Ticket Volume</p>
                                            <p style={{ margin: '4px 0 0 0', fontWeight: 'bold' }}>{event.ticketsSold || 0} sold</p>
                                        </div>
                                        <div>
                                            <p style={{ margin: 0, color: '#666', fontSize: '11px', textTransform: 'uppercase' }}>Net Gross Revenue</p>
                                            <p style={{ margin: '4px 0 0 0', fontWeight: 'bold', color: '#00FF00' }}>${(event.totalRevenue || 0).toFixed(2)} USD</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div style={{ textAlign: 'center', padding: '40px', backgroundColor: '#111', borderRadius: '8px', border: '1px dashed #222' }}>
                        <p style={{ color: '#888', margin: 0 }}>No active ticketed theater assets found.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminBoxOfficeScreen;