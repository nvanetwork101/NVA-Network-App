// src/components/AdminPayoutRequestScreen.jsx
import React, { useState } from 'react';
import { db, doc, updateDoc, setDoc, deleteDoc, functions, httpsCallable } from '../firebase'; // FIXED: Added missing imports
import { serverTimestamp } from 'firebase/firestore';

const AdminPayoutRequestScreen = ({ requests, showMessage, setShowConfirmationModal, setConfirmationTitle, setConfirmationMessage, setOnConfirmationAction }) => {
    const [txIds, setTxIds] = useState({});

    // Track A: Handle cash-out requests securely (Deducts totalEarnings and Archives MMG receipt)
    const handleProcessCashPayout = async (req) => {
        const mmgId = txIds[req.id];
        if (!mmgId) { showMessage("MMG TRANSACTION ID REQUIRED"); return; }
        
        const systemReceiptId = `NVA-REC-${req.id.slice(0, 8).toUpperCase()}`;

        try {
            await setDoc(doc(db, "payoutHistory", req.id), {
                ...req,
                systemReceiptId,
                adminTxId: mmgId,
                status: 'paid',
                processedAt: new Date().toISOString(),
                searchIndex: [req.creatorName.toLowerCase(), req.mmgNumber, mmgId.toLowerCase(), systemReceiptId.toLowerCase()]
            });

            await updateDoc(doc(db, "creators", req.userId), {
                totalEarnings: 0,
                payoutStatus: 'none',
                lastPayoutDate: serverTimestamp()
            });

            await deleteDoc(doc(db, "payoutRequests", req.id));
            showMessage(`PAID & ARCHIVED: ${systemReceiptId}`);
        } catch (error) {
            showMessage("ERROR: Check Firestore Permissions");
        }
    };

    // Track B: Handle ledger sweeps through secure Cloud Function (requires no manual MMG ID input)
    const handleProcessLedgerSweep = async (req) => {
        showMessage("Processing dynamic ledger sweep...");
        try {
            const approveSweepCallable = httpsCallable(functions, 'approveBoxOfficeSweep');
            const result = await approveSweepCallable({ requestId: req.id });
            
            showMessage(result.data.message);
        } catch (error) {
            showMessage(`Sweep Failed: ${error.message}`);
        }
    };

    const handleDismissRequest = async (reqId) => {
        if (!window.confirm("Are you sure you want to dismiss this request?")) return;
        try {
            await deleteDoc(doc(db, "payoutRequests", reqId));
            showMessage("Request dismissed.");
        } catch(e) { showMessage("Dismissal failed."); }
    };

    if (requests.length === 0) return <p style={{textAlign: 'center', padding: '40px', color: '#888', fontSize: '18px'}}>Zero Pending Payouts</p>;

    return (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))', gap: '20px', padding: '10px' }}>
            {requests.map(req => {
                const systemIdPreview = `NVA-REC-${req.id.slice(0, 8).toUpperCase()}`;
                const isSweep = req.type === 'boxOfficeSweep';

                return (
                    <div key={req.id} style={{ background: '#111', border: isSweep ? '1px solid #00FFFF' : '1px solid #333', borderRadius: '12px', overflow: 'hidden' }}>
                        {/* Header: System Info - High Contrast */}
                        <div style={{ background: '#222', padding: '10px 15px', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #333' }}>
                            <span style={{ color: isSweep ? '#00FFFF' : '#FFD700', fontSize: '11px', fontWeight: '900' }}>
                                {isSweep ? '🎟️ INTERNAL LEDGER SWEEP' : `SYSTEM ID: ${systemIdPreview}`}
                            </span>
                            <span style={{ color: '#FFF', fontSize: '11px', fontWeight: '700' }}>
                                {req.requestedAt?.toDate ? new Date(req.requestedAt.toDate()).toLocaleString() : 'N/A'}
                            </span>
                        </div>

                        <div style={{ padding: '15px' }}>
                            {/* Amount & Name Section */}
                            <div style={{ marginBottom: '15px' }}>
                                <p style={{ color: '#00FF00', fontSize: '28px', fontWeight: '900', margin: 0 }}>
                                    {req.amount?.toLocaleString()} <span style={{fontSize: '14px'}}>GYD</span>
                                </p>
                                <p style={{ color: '#FFF', fontSize: '16px', fontWeight: '800', margin: '4px 0' }}>{req.creatorName}</p>
                            </div>

                            {isSweep ? (
                                /* PATHWAY B: INTERNAL SWEEP FLOW */
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ background: '#000', padding: '12px', borderRadius: '8px', border: '1px dashed #00FFFF' }}>
                                        <p style={{ color: '#00FFFF', fontSize: '10px', fontWeight: '900', margin: '0 0 4px 0', textTransform: 'uppercase' }}>SOURCE & FILM BREAKDOWN</p>
                                        <p style={{ color: '#FFF', fontSize: '14px', fontWeight: '700', margin: 0, lineHeight: '1.4' }}>{req.campaignTitle || 'General Arena Earnings'}</p>
                                        <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #222', display: 'flex', justifyContent: 'space-between' }}>
                                            <span style={{ color: '#888', fontSize: '10px', fontWeight: 'bold' }}>AUDIT TYPE: DYNAMIC SWEEP</span>
                                            <span style={{ color: '#00FF00', fontSize: '10px', fontWeight: 'bold' }}>SECURE CLOUD ROUTE</span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                                        <button 
                                            onClick={() => handleProcessLedgerSweep(req)}
                                            style={{ flex: 1.5, padding: '12px', background: '#00FFFF', color: '#000', border: 'none', borderRadius: '6px', fontWeight: '900', fontSize: '13px', cursor: 'pointer' }}
                                        >
                                            APPROVE INTERNAL SWEEP
                                        </button>
                                        <button 
                                            onClick={() => handleDismissRequest(req.id)}
                                            style={{ flex: 1, padding: '12px', background: '#333', color: '#FFF', border: 'none', borderRadius: '6px', fontWeight: '800', fontSize: '13px', cursor: 'pointer' }}
                                        >
                                            DISMISS
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                /* PATHWAY A: HARD CASH OUT FLOW */
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#000', padding: '12px', borderRadius: '8px' }}>
                                        <div>
                                            <p style={{ color: '#FFD700', fontSize: '10px', fontWeight: '900', margin: 0 }}>MMG NUMBER</p>
                                            <p style={{ color: '#FFF', fontSize: '14px', fontWeight: '700', margin: 0 }}>{req.mmgNumber}</p>
                                        </div>
                                        <div>
                                            <p style={{ color: '#FFD700', fontSize: '10px', fontWeight: '900', margin: 0 }}>LEGAL NAME</p>
                                            <p style={{ color: '#FFF', fontSize: '14px', fontWeight: '700', margin: 0 }}>{req.fullName}</p>
                                        </div>
                                    </div>

                                    <div style={{ marginBottom: '5px' }}>
                                        <p style={{ color: '#AAA', fontSize: '10px', fontWeight: '800', marginBottom: '5px' }}>MMG TRANSACTION REFERENCE</p>
                                        <input 
                                            type="text" 
                                            placeholder="Enter MMG reference ID..." 
                                            value={txIds[req.id] || ''}
                                            onChange={(e) => setTxIds({...txIds, [req.id]: e.target.value})}
                                            style={{ width: '100%', padding: '10px', background: '#000', border: '1px solid #444', color: '#00FF00', borderRadius: '6px', fontWeight: 'bold' }}
                                        />
                                    </div>

                                    <div style={{ display: 'flex', gap: '10px' }}>
                                        <button 
                                            onClick={() => handleProcessCashPayout(req)}
                                            style={{ flex: 1.5, padding: '12px', background: '#22C55E', color: '#000', border: 'none', borderRadius: '6px', fontWeight: '900', fontSize: '13px', cursor: 'pointer' }}
                                        >
                                            APPROVE & ARCHIVE PAYOUT
                                        </button>
                                        <button 
                                            onClick={() => handleDismissRequest(req.id)}
                                            style={{ flex: 1, padding: '12px', background: '#333', color: '#FFF', border: 'none', borderRadius: '6px', fontWeight: '800', fontSize: '13px', cursor: 'pointer' }}
                                        >
                                            DISMISS
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
export default AdminPayoutRequestScreen;