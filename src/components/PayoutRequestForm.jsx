// src/components/PayoutRequestForm.jsx
import React, { useState } from 'react';
import { functions, httpsCallable } from '../firebase';

const PayoutRequestForm = ({ showMessage, setActiveScreen, currentUser, creatorProfile }) => {
    const [fullName, setFullName] = useState('');
    const [mmgNumber, setMmgNumber] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!fullName || !mmgNumber) { showMessage("Please fill all fields."); return; }
        
        setIsSubmitting(true);
        try {
            // Send request to secure server environment for validation
            const requestPayout = httpsCallable(functions, 'requestPayout');
            await requestPayout({ fullName, mmgNumber });

            showMessage("Payout request submitted! Admin will verify within 24-48h.");
            setActiveScreen('CreatorDashboard');
        } catch (error) {
            showMessage("Submission failed: " + error.message);
        } finally { setIsSubmitting(false); }
    };

    return (
        <div className="screenContainer" style={{ maxWidth: '500px', margin: '0 auto', paddingBottom: '100px' }}>
            <p className="heading" style={{ textAlign: 'center', fontSize: '24px', marginBottom: '10px' }}>Secure Withdrawal</p>
            <p className="subHeading" style={{ textAlign: 'center', color: '#888', marginBottom: '30px' }}>Verify your MMG details to receive your earnings.</p>

            <div style={{ 
                background: 'rgba(20, 20, 20, 0.6)', 
                backdropFilter: 'blur(15px)', 
                border: '1px solid rgba(255, 255, 255, 0.1)', 
                borderRadius: '20px', 
                padding: '30px', 
                boxShadow: '0 10px 40px rgba(0,0,0,0.4)'
            }}>
                {/* Balance Summary Bar */}
                <div style={{ 
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                    background: 'rgba(255, 215, 0, 0.05)', border: '1px solid rgba(255, 215, 0, 0.2)', 
                    padding: '15px 20px', borderRadius: '12px', marginBottom: '25px' 
                }}>
                    <span style={{ color: '#AAA', fontSize: '13px', fontWeight: '600' }}>Withdrawal Amount:</span>
                    <span style={{ color: '#FFD700', fontSize: '18px', fontWeight: '900' }}>{creatorProfile.totalEarnings.toLocaleString()} GYD</span>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="formGroup" style={{ marginBottom: '20px' }}>
                        <label className="formLabel" style={{ color: '#FFF', fontSize: '12px', fontWeight: '700', marginBottom: '8px', display: 'block' }}>MMG REGISTERED NAME</label>
                        <input 
                            type="text" 
                            className="formInput" 
                            value={fullName} 
                            onChange={e => setFullName(e.target.value)} 
                            placeholder="Exact name on MMG account" 
                            style={{ background: '#0A0A0A', border: '1px solid #333', borderRadius: '10px', padding: '12px 16px', color: '#FFF', width: '100%' }}
                            required 
                        />
                    </div>

                    <div className="formGroup" style={{ marginBottom: '30px' }}>
                        <label className="formLabel" style={{ color: '#FFF', fontSize: '12px', fontWeight: '700', marginBottom: '8px', display: 'block' }}>MMG PHONE NUMBER</label>
                        <input 
                            type="text" 
                            className="formInput" 
                            value={mmgNumber} 
                            onChange={e => setMmgNumber(e.target.value)} 
                            placeholder="e.g. 592-6XX-XXXX" 
                            style={{ background: '#0A0A0A', border: '1px solid #333', borderRadius: '10px', padding: '12px 16px', color: '#FFF', width: '100%' }}
                            required 
                        />
                    </div>

                    <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.08)', border: '2px dashed rgba(239, 68, 68, 0.5)', padding: '25px', borderRadius: '12px', marginBottom: '25px' }}>
                        <p style={{ color: '#FF5F5F', fontSize: '17px', fontWeight: '900', margin: 0, textAlign: 'center', lineHeight: '1.5', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            ⚠️ CRITICAL: Verify Your MMG Info
                        </p>
                        <p style={{ color: '#FFFFFF', fontSize: '14px', fontWeight: '700', margin: '10px 0 0 0', textAlign: 'center', lineHeight: '1.4' }}>
                            Incorrect details will lead to withdrawal rejection and funds being returned to your hub.
                        </p>
                        <p style={{ color: '#A3A3A3', fontSize: '12px', fontWeight: '500', margin: '18px 0 0 0', textAlign: 'center', lineHeight: '1.6', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '15px' }}>
                            <strong style={{ color: '#FFF' }}>DISCLAIMER:</strong> By submitting, you agree that NVA Network is not responsible for unauthorized withdrawals resulting from device theft or account compromise. All processed transactions are final and non-reversible.
                        </p>
                    </div>

                    <button 
                        type="submit" 
                        className="button" 
                        disabled={isSubmitting} 
                        style={{ 
                            width: '100%', margin: 0, padding: '16px', borderRadius: '12px',
                            backgroundColor: '#FFD700', color: '#000', fontWeight: '900', fontSize: '15px', 
                            textTransform: 'uppercase', letterSpacing: '1px', transition: 'all 0.2s'
                        }}
                    >
                        {isSubmitting ? 'SECURELY SUBMITTING...' : 'Submit Withdrawal Request'}
                    </button>
                </form>
            </div>

            <div style={{ textAlign: 'center', marginTop: '20px' }}>
                <button 
                    className="button" 
                    onClick={() => setActiveScreen('CreatorDashboard')} 
                    style={{ backgroundColor: 'transparent', border: 'none', color: '#666', fontSize: '13px', textDecoration: 'underline', cursor: 'pointer' }}
                >
                    Cancel and Return to Hub
                </button>
            </div>
        </div>
    );
};
export default PayoutRequestForm;