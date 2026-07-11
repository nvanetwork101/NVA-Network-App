import React, { useState, useEffect } from 'react';
import { db, storage, functions } from '../firebase';
import { collection, doc, setDoc, query, where, onSnapshot } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';

const MMG_NUMBER = "090-4491"; 

// Simple debounce hook for real-time recipient search
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
        return () => { clearTimeout(handler); };
    }, [value, delay]);
    return debouncedValue;
};

const GiftTicketModal = ({ onClose, eventDetails, currentUser, creatorProfile, showMessage }) => {
    const isDonation = eventDetails?.isDonationMode;
    // THE FIX: Safeguards targetUserId from being undefined by adding suggestedBy fallback
    const targetUserId = eventDetails?.creatorId || eventDetails?.userId || eventDetails?.suggestedBy || '';
    const targetName = eventDetails?.creatorName || eventDetails?.title || eventDetails?.eventTitle;
    
    // Purchase Limits & Host Guards
    const isHost = targetUserId === currentUser?.uid;
    const alreadyOwnsTicket = !!creatorProfile?.purchasedTickets?.[eventDetails?.id];
    
    // Default to Gifting Mode if they are the host or already own a ticket
    const [isGiftMode, setIsGiftMode] = useState(isHost || alreadyOwnsTicket);

    // Dynamic Token/Ticket Tiers
    const tokens = isDonation ? [
        { id: 't1', name: 'Popcorn Drop', price: 500, icon: '🍿' },
        { id: 't2', name: 'Director\'s Chair', price: 1500, icon: '🎬' },
        { id: 't3', name: 'Standing Ovation', price: 5000, icon: '👏' },
        { id: 't4', name: 'Executive Producer', price: 20000, icon: '⭐' }
    ] : [
        { id: 'ticket', name: 'Live Premiere Ticket', price: Number(eventDetails?.ticketPrice || 5.00), icon: '🎟️' }
    ];

    const [selectedToken, setSelectedToken] = useState(tokens[0]);
    const [isAnonymous, setIsAnonymous] = useState(false);
    const [paymentId, setPaymentId] = useState('');
    const [screenshotBase64, setScreenshotBase64] = useState('');
    
    // THE FIX: Listen for any pending self-purchase ticket pledges for this event
    const [hasPendingSelfPledge, setHasPendingSelfPledge] = useState(false);
    useEffect(() => {
        if (!currentUser || !eventDetails?.id) return;
        const q = query(
            collection(db, "paymentPledges"),
            where("userId", "==", currentUser.uid),
            where("targetEventId", "==", eventDetails.id),
            where("status", "==", "pending")
        );
        const unsub = onSnapshot(q, (snap) => {
            // Client-side mapping prevents expensive indexing and is 100% crash-proof
            const isSelfPending = snap.docs.some(d => {
                const data = d.data();
                return !data.recipientId && data.paymentType === 'eventTicket';
            });
            setHasPendingSelfPledge(isSelfPending);
        });
        return () => unsub();
    }, [currentUser, eventDetails?.id]);

    // THE FIX: Force Gifting Mode if user already owns or has a pending ticket under review
    const cannotBuyForSelf = isHost || alreadyOwnsTicket || hasPendingSelfPledge;
    useEffect(() => {
        if (cannotBuyForSelf) {
            setIsGiftMode(true);
        }
    }, [cannotBuyForSelf]);
    
    // Recipient Search States (Gifting)
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);
    const debouncedSearch = useDebounce(searchTerm, 300);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [isEarningsSuccess, setIsEarningsSuccess] = useState(false);
    const [showEarningsConfirm, setShowEarningsConfirm] = useState(false);

    // Search for recipient on-demand
    useEffect(() => {
        if (!isGiftMode || debouncedSearch.length < 3) {
            setSearchResults([]);
            return;
        }
        setIsSearching(true);
        const searchFunc = httpsCallable(functions, 'searchForUser');
        searchFunc({ searchTerm: debouncedSearch })
            .then(res => setSearchResults(res.data.users || []))
            .catch(() => showMessage("Failed to search creators."))
            .finally(() => setIsSearching(false));
    }, [debouncedSearch, isGiftMode]);

    // Close on Escape key
    useEffect(() => {
        const handleEsc = (e) => { if (e.key === 'Escape' && !isSubmitting) onClose(); };
        window.addEventListener('keydown', handleEsc);
        return () => window.removeEventListener('keydown', handleEsc);
    }, [isSubmitting, onClose]);

    // Handle standard MMG Pledge
    const submitGiftPledge = async () => {
        if (isGiftMode && !selectedUser) {
            showMessage("Please select a recipient to gift this ticket to.");
            return;
        }
        if (!paymentId || !screenshotBase64) {
            showMessage("Please provide the MMG Transaction ID and screenshot proof.");
            return;
        }
        setIsSubmitting(true);
        try {
            const pledgeId = `pledge_${Date.now()}_${currentUser.uid}`;
            const imageRef = ref(storage, `pledge_receipts/${pledgeId}`);
            await uploadString(imageRef, screenshotBase64, 'data_url');
            const receiptUrl = await getDownloadURL(imageRef);

            const pledgeData = {
                userId: currentUser.uid,
                userName: isAnonymous ? "Anonymous User" : (creatorProfile?.creatorName || currentUser.displayName || currentUser.email),
                isAnonymous: isAnonymous,
                paymentType: isDonation ? 'giftToken' : 'eventTicket',
                amount: Number(selectedToken.price),
                receiptUrl: receiptUrl,
                paymentId: paymentId,
                status: 'pending',
                timestamp: new Date().toISOString(),
                targetUserId: isGiftMode ? selectedUser.userId : targetUserId,
                targetEventId: eventDetails.id,
                targetEventTitle: eventDetails.title || eventDetails.eventTitle,
                recipientId: isGiftMode ? selectedUser.userId : null,
                recipientName: isGiftMode ? selectedUser.creatorName : null,
                giftName: isDonation ? selectedToken.name : "Premiere Ticket",
                isFilmmakerDonation: !!isDonation // THE FIX: Forces boolean, preventing Firestore 'undefined' crash
            };

            await setDoc(doc(db, "paymentPledges", pledgeId), pledgeData);
            setIsEarningsSuccess(false); // Triggers correct MMG pending message
            setSubmitSuccess(true);
            setTimeout(() => { onClose(); }, 4000);
        } catch (error) {
            showMessage("Submission failed: " + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    // Handle Pay with Earnings
    const confirmEarningsPayment = async () => {
        if (isGiftMode && !selectedUser) {
            showMessage("Please select a recipient to gift this ticket to.");
            return;
        }
        setShowEarningsConfirm(false);
        setIsSubmitting(true);
        try {
            const func = httpsCallable(functions, 'sendGiftWithEarnings');
            await func({ 
                targetUserId: isGiftMode ? (selectedUser?.userId || '') : (targetUserId || ''), 
                giftName: isGiftMode ? "Gift Ticket" : (isDonation ? selectedToken.name : "Premiere Ticket"), 
                amount: Number(selectedToken.price),
                eventId: eventDetails?.id || '',
                targetEventId: eventDetails?.id || '', // THE FIX: Standardized safe key for Cloud Function transaction
                recipientId: isGiftMode ? selectedUser.userId : null,
                recipientName: isGiftMode ? selectedUser.creatorName : null,
                targetEventTitle: eventDetails?.title || eventDetails?.eventTitle || 'Event Ticket',
                isFilmmakerDonation: !!isDonation // THE FIX: Forces boolean to ensure safe cloud function payload
            });
            setIsEarningsSuccess(true); // Triggers instant delivery message
            setSubmitSuccess(true);
            setTimeout(() => { onClose(); }, 4000);
        } catch (error) {
            showMessage("Payment failed: " + error.message);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="gift-modal-overlay" style={{ zIndex: 9999 }}>
            <style>{`
                .gift-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; padding: 16px; }
                .gift-modal { background: linear-gradient(180deg, #111111 0%, #050505 100%); border: 1px solid rgba(255,215,0,0.15); border-radius: 24px; width: 100%; max-width: 440px; max-height: 90vh; overflow-y: auto; padding: 32px; box-shadow: 0 30px 60px rgba(0,0,0,0.9); text-align: left; }
                .modal-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
                .modal-close { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #FFF; font-size: 18px; cursor: pointer; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: all 0.2s; }
                .modal-close:hover { background: #DC3545; border-color: #DC3545; transform: scale(1.05); }
                .token-card { display: flex; align-items: center; gap: 16px; padding: 14px 16px; border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; margin-bottom: 12px; cursor: pointer; transition: all 0.3s; background: rgba(25,25,25,0.4); }
                .token-card:hover { background: rgba(255,215,0,0.03); border-color: rgba(255,215,0,0.3); transform: translateY(-2px); }
                .token-card.selected { background: linear-gradient(90deg, rgba(255,215,0,0.1) 0%, rgba(255,215,0,0.02) 100%); border-color: #FFD700; box-shadow: 0 0 20px rgba(255,215,0,0.1); position: relative; }
                .token-card.selected::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: #FFD700; border-radius: 4px 0 0 4px; }
                .token-icon { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(0,0,0,0.5)); border: 1px solid rgba(255,255,255,0.05); }
                .token-info { flex: 1; }
                .token-name { font-size: 15px; font-weight: 800; color: #FFF; margin: 0 0 4px 0; }
                .token-breakdown { font-size: 10px; color: #888; margin: 0; text-transform: uppercase; font-weight: 600; }
                .token-price { font-family: monospace; font-size: 16px; font-weight: 900; color: #FFD700; background: rgba(0,0,0,0.5); padding: 4px 10px; border-radius: 8px; border: 1px solid rgba(255,215,0,0.2); }
                .breakdown-detail { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 20px; margin: 20px 0; }
                .breakdown-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; font-weight: 600; }
                .breakdown-row.border { border-bottom: 1px dashed rgba(255,255,255,0.1); margin-bottom: 8px; padding-bottom: 12px; }
                .breakdown-label { color: #888; text-transform: uppercase; font-size: 11px; }
                .breakdown-value { color: #FFF; font-family: monospace; }
                .mmg-instructions { background: rgba(0,255,255,0.03); border-left: 3px solid #00FFFF; border-radius: 0 12px 12px 0; padding: 16px; margin: 20px 0; font-size: 12px; color: #CCC; line-height: 1.6; }
                .submit-btn { width: 100%; padding: 16px; background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); color: #000; border: none; border-radius: 14px; font-size: 14px; font-weight: 900; cursor: pointer; transition: all 0.2s; text-transform: uppercase; box-shadow: 0 10px 20px rgba(255,215,0,0.2); }
                .submit-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 25px rgba(255,215,0,0.3); }
                .submit-btn:disabled { opacity: 0.5; cursor: not-allowed; }
                .submit-btn.cancel-btn { background: #222; border: 1px solid #444; color: #FFF; }
                .submit-btn.cancel-btn:hover { background: #333; }
                .earnings-btn { width: 100%; padding: 16px; border-radius: 14px; background: rgba(255, 215, 0, 0.04); border: 1px solid rgba(255, 215, 0, 0.25); color: #FFD700; font-weight: 900; text-transform: uppercase; cursor: pointer; transition: all 0.2s; }
                .earnings-btn:hover:not(:disabled) { background: rgba(255, 215, 0, 0.15); box-shadow: 0 0 15px rgba(255,215,0,0.2); }
                .earnings-btn:disabled { opacity: 0.2; cursor: not-allowed; border-color: rgba(255,255,255,0.1); color: #555; }
                .user-list { list-style: none; padding: 0; margin: 10px 0; max-height: 140px; overflow-y: auto; }
                .user-list-item { display: flex; alignItems: center; gap: 10px; padding: 8px; border-radius: 8px; transition: background 0.2s; }
                .user-avatar { width: 28px; height: 28px; border-radius: 50%; object-fit: cover; }
            `}</style>
            
            <div className="gift-modal" onClick={e => e.stopPropagation()}>
                {!isSubmitting && !submitSuccess ? (
                    <>
                        <div className="modal-header">
                            <div>
                                <p style={{ color: '#00FFFF', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', margin: '0 0 6px 0' }}>
                                    {isDonation ? 'Secure Token Transfer' : 'Secure Ticket Purchase'}
                                </p>
                                <h2 style={{ color: '#FFFFFF', fontSize: '24px', fontWeight: 800, margin: 0 }}>
                                    {isDonation ? targetName : `🎟️ ${targetName}`}
                                </h2>
                            </div>
                            <button className="modal-close" onClick={onClose}>✕</button>
                        </div>

                        {/* TAB INTERFACE: Enforces limits & locks self-purchases */}
                        {!isDonation && (
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
                                <button 
                                    onClick={() => setIsGiftMode(false)}
                                    disabled={cannotBuyForSelf}
                                    style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid', borderColor: !isGiftMode ? '#FFD700' : '#333', background: !isGiftMode ? 'rgba(255,215,0,0.1)' : 'transparent', color: !isGiftMode ? '#FFD700' : '#888', fontWeight: 'bold', cursor: cannotBuyForSelf ? 'not-allowed' : 'pointer', fontSize: '12px' }}
                                >
                                    Buy for Self
                                </button>
                                <button 
                                    onClick={() => setIsGiftMode(true)}
                                    style={{ flex: 1, padding: '10px', borderRadius: '8px', border: '1px solid', borderColor: isGiftMode ? '#FFD700' : '#333', background: isGiftMode ? 'rgba(255,215,0,0.1)' : 'transparent', color: isGiftMode ? '#FFD700' : '#888', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px' }}
                                >
                                    Gift to Friend
                                </button>
                            </div>
                        )}

                        {/* EXPLANATORY COGNITIVE LABELS */}
                        {isHost && !isDonation && (
                            <p style={{ color: '#FFD700', fontSize: '12px', background: 'rgba(255,215,0,0.05)', padding: '10px', borderRadius: '8px', border: '1px dashed rgba(255,215,0,0.2)', margin: '0 0 15px 0' }}>
                                ⚠️ You are the Host of this watch party (No ticket required).
                            </p>
                        )}
                        {alreadyOwnsTicket && !isHost && !isDonation && (
                            <p style={{ color: '#00FFFF', fontSize: '12px', background: 'rgba(0,255,255,0.05)', padding: '10px', borderRadius: '8px', border: '1px dashed rgba(0,255,255,0.2)', margin: '0 0 15px 0' }}>
                                ✅ Ticket secured! You already have an active ticket on your dashboard.
                            </p>
                        )}
                        {hasPendingSelfPledge && !isHost && !isDonation && (
                            <p style={{ color: '#FFD700', fontSize: '12px', background: 'rgba(255,215,0,0.05)', padding: '10px', borderRadius: '8px', border: '1px dashed rgba(255,215,0,0.2)', margin: '0 0 15px 0' }}>
                                ⚠️ Your ticket purchase proof is currently under review by Admin. Only Gifting to friends is active.
                            </p>
                        )}

                        {/* RECIPIENT SEARCH BOX (GIFT MODE ONLY) */}
                        {isGiftMode && !isDonation && (
                            <div style={{ marginBottom: '15px' }}>
                                <input 
                                    type="text" 
                                    className="formInput" 
                                    placeholder="Search friend's Stage/Brand Name..." 
                                    value={searchTerm} 
                                    onChange={e => setSearchTerm(e.target.value)} 
                                    style={{ width: '100%', background: '#000', border: '1px solid #333' }}
                                />
                                {isSearching && <p style={{ fontSize: '11px', color: '#888', margin: '4px 0 0 4px' }}>Searching creators...</p>}
                                {searchResults.length > 0 && (
                                    <ul className="user-list">
                                        {searchResults.map(user => (
                                            <li 
                                                key={user.userId} 
                                                onClick={() => setSelectedUser(user)}
                                                style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '10px', padding: '8px', borderRadius: '8px', background: selectedUser?.userId === user.userId ? '#FFD700' : 'transparent', color: selectedUser?.userId === user.userId ? '#000' : '#FFF' }}
                                            >
                                                <img src={user.profilePictureUrl || 'https://placehold.co/32'} className="user-avatar" alt="pfp" />
                                                <span style={{ fontWeight: 'bold' }}>{user.creatorName}</span>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}

                        {isDonation && (
                            <div style={{ maxHeight: '200px', overflowY: 'auto', marginBottom: '16px' }}>
                                {tokens.map(token => (
                                    <div key={token.id} className={`token-card ${selectedToken.id === token.id ? 'selected' : ''}`} onClick={() => setSelectedToken(token)}>
                                        <div className="token-icon">{token.icon}</div>
                                        <div className="token-info">
                                            <p className="token-name">{token.name}</p>
                                            <p className="token-breakdown">Actor: {(token.price * 0.85).toLocaleString()} GYD &nbsp;•&nbsp; Fee: {(token.price * 0.15).toLocaleString()} GYD</p>
                                        </div>
                                        <span className="token-price">{token.price.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="breakdown-detail" style={{ margin: isDonation ? '0 0 20px 0' : '20px 0' }}>
                            <div className="breakdown-row border">
                                <span className="breakdown-label">Total Amount</span>
                                <span className="breakdown-value">{(selectedToken?.price || 0).toLocaleString()} GYD</span>
                            </div>
                            <div className="breakdown-row">
                                <span className="breakdown-label">Platform Fee (15%)</span>
                                <span className="breakdown-value" style={{ color: '#F87171' }}>-{(selectedToken?.price * 0.15 || 0).toLocaleString()} GYD</span>
                            </div>
                            <div className="breakdown-row" style={{ marginTop: '8px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                <span className="breakdown-label" style={{ color: '#4ADE80' }}>{isDonation ? 'Creator Receives' : 'Host Box Office'}</span>
                                <span className="breakdown-value" style={{ color: '#4ADE80', fontSize: '14px' }}>{(selectedToken?.price * 0.85 || 0).toLocaleString()} GYD ✓</span>
                            </div>
                        </div>

                        {/* Pay with Earnings (Enabled strictly if balance matches price) */}
                        <div style={{ marginBottom: '15px' }}>
                            <button 
                                type="button"
                                className="earnings-btn" 
                                disabled={isHost && !isGiftMode} // Host cannot buy for self
                                style={{ display: ((creatorProfile?.totalEarnings || 0) >= (selectedToken?.price || 0)) ? 'block' : 'none' }}
                                onClick={() => setShowEarningsConfirm(true)}
                            >
                                Pay with Earnings Balance
                            </button>
                            {((creatorProfile?.totalEarnings || 0) < (selectedToken?.price || 0)) && (
                                <button type="button" className="earnings-btn" disabled style={{ opacity: 0.2 }}>
                                    Insufficient Earnings
                                </button>
                            )}
                        </div>

                        <div className="mmg-instructions">
                            <p>📱 <strong>Or Pay with MMG</strong></p>
                            <p>1. Send <strong>{(selectedToken?.price || 0).toLocaleString()} GYD</strong> to <strong>{MMG_NUMBER}</strong>.</p>
                            <p>2. Paste your Transaction ID and upload the receipt below.</p>
                        </div>

                        <div style={{ marginBottom: '16px' }}>
                            <input type="text" value={paymentId} onChange={e => setPaymentId(e.target.value)} placeholder="MMG Transaction ID (e.g. TXN12345)" 
                                style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFF', padding: '14px 16px', borderRadius: '12px', fontSize: '14px', outline: 'none' }} />
                        </div>

                        <div style={{ marginBottom: '24px' }}>
                            <input type="file" accept="image/*" onChange={e => {
                                const file = e.target.files[0];
                                if (file) {
                                    const reader = new FileReader();
                                    reader.onloadend = () => setScreenshotBase64(reader.result);
                                    reader.readAsDataURL(file);
                                }
                            }} style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.15)', color: '#FFF' }} />
                        </div>

                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button className="submit-btn cancel-btn" style={{ flex: 1 }} onClick={onClose}>Cancel</button>
                            <button className="submit-btn" style={{ flex: 2 }} onClick={submitGiftPledge} disabled={!paymentId || !screenshotBase64 || isSubmitting || (isGiftMode && !selectedUser)}>
                                {isSubmitting ? 'Processing...' : (isDonation ? 'Complete Transfer' : 'Purchase Ticket')}
                            </button>
                        </div>
                    </>
                ) : (
                    <div className="success-state" style={{ textAlign: 'center', padding: '30px 20px' }}>
                        <div className="success-check" style={{ width: '64px', height: '64px', background: 'rgba(74, 222, 128, 0.1)', border: '2px solid #4ADE80', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '28px', color: '#4ADE80' }}>✓</div>
                        {isEarningsSuccess ? (
                            <>
                                <h3 style={{ color: '#FFFFFF', fontSize: '24px', fontWeight: 900, margin: '0 0 12px 0' }}>
                                    {isDonation ? 'Gift Sent!' : (isGiftMode ? 'Gift Ticket Sent!' : 'Ticket Active!')}
                                </h3>
                                <p style={{ color: '#AAA', fontSize: '14px', margin: 0, lineHeight: '1.6' }}>
                                    {isDonation 
                                        ? "Your donation has been instantly transferred to the filmmaker's box office ledger." 
                                        : (isGiftMode 
                                            ? `Your gift ticket has been instantly delivered to ${selectedUser?.creatorName || 'your friend'}.`
                                            : "Your ticket has been instantly verified and issued to your dashboard!")}
                                </p>
                            </>
                        ) : (
                            <>
                                <h3 style={{ color: '#FFFFFF', fontSize: '24px', fontWeight: 900, margin: '0 0 12px 0' }}>
                                    {isDonation ? 'Donation Received' : 'Ticket Purchased'}
                                </h3>
                                <p style={{ color: '#AAA', fontSize: '14px', margin: 0, lineHeight: '1.6' }}>
                                    {isDonation 
                                        ? "Your donation will be delivered to the filmmaker after Admin payment verification."
                                        : "Your ticket will be delivered to your dashboard after Admin payment verification."}
                                </p>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Earnings Confirmation Modal Overlay */}
            {showEarningsConfirm && (
                <div className="gift-modal-overlay" style={{ zIndex: 10000, background: 'rgba(0,0,0,0.9)' }}>
                    <div className="gift-modal" style={{ maxWidth: '360px', border: '1px solid #FFD700', textAlign: 'center' }}>
                        <p style={{ color: '#FFD700', fontSize: '18px', fontWeight: '900', textTransform: 'uppercase', marginBottom: '16px' }}>Authorize Transfer</p>
                        <p style={{ color: '#FFF', fontSize: '14px', lineHeight: '1.5', marginBottom: '24px' }}>
                            Deduct <strong style={{color: '#FFD700'}}>{selectedToken?.price.toLocaleString()} GYD</strong> from your earnings balance?
                        </p>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button className="submit-btn cancel-btn" onClick={() => setShowEarningsConfirm(false)} style={{ flex: 1, margin: 0 }}>Cancel</button>
                            <button className="submit-btn" style={{ flex: 1.5, margin: 0 }} onClick={confirmEarningsPayment}>Confirm</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GiftTicketModal;