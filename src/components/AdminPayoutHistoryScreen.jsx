// src/components/AdminPayoutHistoryScreen.jsx
import React, { useState, useEffect } from 'react';
import { db, collection, query, orderBy, limit, getDocs, where } from '../firebase';

const AdminPayoutHistoryScreen = () => {
    const [history, setHistory] = useState([]);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(false);

    const fetchHistory = async () => {
        setLoading(true);
        const ref = collection(db, "payoutHistory");
        let q = query(ref, orderBy("processedAt", "desc"), limit(50));
        
        if (search) {
            // Search by exact MMG number or TXN ID
            q = query(ref, where("searchIndex", "array-contains", search.toLowerCase()), limit(50));
        }

        const snap = await getDocs(q);
        setHistory(snap.docs.map(d => ({id: d.id, ...d.data()})));
        setLoading(false);
    };

    useEffect(() => { fetchHistory(); }, []);

    return (
        <div className="dashboardSection">
            <div style={{display: 'flex', gap: '10px', marginBottom: '20px'}}>
                <input className="cs-input" placeholder="Search by Name, MMG #, or TXN ID..." value={search} onChange={e => setSearch(e.target.value)} />
                <button className="adminActionButton approve" onClick={fetchHistory} style={{margin: 0}}>Search</button>
            </div>
            {loading ? <p>Searching archives...</p> : (
                <div style={{display: 'flex', flexDirection: 'column', gap: '10px'}}>
                    {history.map(h => {
                        // THE FIX: Dynamic date parser handles both string ISO dates and Firestore Timestamps
                        const formattedDate = h.processedAt?.toDate 
                            ? h.processedAt.toDate().toLocaleString() 
                            : (h.processedAt ? new Date(h.processedAt).toLocaleString() : 'N/A');

                        return (
                            <div key={h.id} style={{background: '#111', padding: '15px', borderRadius: '8px', border: '1px solid #222'}}>
                                <p style={{color: '#00FF00', fontWeight: 'bold', margin: 0}}>Paid: {h.amount.toLocaleString()} GYD</p>
                                <p style={{fontSize: '12px', color: '#FFF', margin: '5px 0'}}>Creator: {h.creatorName} | MMG: {h.mmgNumber}</p>
                                <p style={{fontSize: '11px', color: '#FFD700', margin: 0}}>Ref ID: {h.adminTxId}</p>
                                <p style={{fontSize: '10px', color: '#555', marginTop: '5px'}}>Date: {formattedDate}</p>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
export default AdminPayoutHistoryScreen;