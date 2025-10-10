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
        event.eventTitle.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const formatDate = (timestamp) => {
        if (!timestamp || !timestamp.toDate) return 'N/A';
        return timestamp.toDate().toLocaleDateString();
    };

    if (loading) {
        return <p className="dashboardSectionTitle">Loading Box Office Records...</p>;
    }

    return (
        <div className="dashboardSection">
            <p className="heading">Box Office Records</p>
            <p className="subHeading">Revenue and ticket sales for all ticketed events.</p>

            <div className="formGroup" style={{ marginBottom: '20px' }}>
                <input
                    type="text"
                    className="formInput"
                    placeholder="Search by event title..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="admin-box-office-list">
                {filteredEvents.length > 0 ? (
                    filteredEvents.map(event => (
                        <div key={event.id} className="adminDashboardItem" style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            <img 
                                src={event.thumbnailUrl || 'https://placehold.co/128x72/2A2A2A/FFF?text=N/A'} 
                                alt={event.eventTitle}
                                style={{
                                    width: '128px',
                                    height: '72px',
                                    borderRadius: '8px',
                                    objectFit: 'cover',
                                    flexShrink: 0
                                }}
                            />
                            <div style={{ flexGrow: 1 }}>
                                <p className="adminDashboardItemTitle" style={{ marginBottom: '10px' }}>{event.eventTitle}</p>
                                <div className="grid-3-col" style={{ gap: '15px', fontSize: '14px', color: '#CCC' }}>
                                    <div>
                                        <p style={{ margin: 0, color: '#888', fontSize: '12px' }}>Date Aired</p>
                                        <p style={{ margin: 0, fontWeight: 'bold' }}>{formatDate(event.scheduledStartTime)}</p>
                                    </div>
                                    <div>
                                        <p style={{ margin: 0, color: '#888', fontSize: '12px' }}>Tickets Sold</p>
                                        <p style={{ margin: 0, fontWeight: 'bold' }}>{event.ticketsSold || 0}</p>
                                    </div>
                                    <div>
                                        <p style={{ margin: 0, color: '#888', fontSize: '12px' }}>Total Revenue</p>
                                        <p style={{ margin: 0, fontWeight: 'bold', color: '#00FF00' }}>${(event.totalRevenue || 0).toFixed(2)} USD</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))
                ) : (
                    <p>No ticketed events found.</p>
                )}
            </div>
        </div>
    );
};

export default AdminBoxOfficeScreen;