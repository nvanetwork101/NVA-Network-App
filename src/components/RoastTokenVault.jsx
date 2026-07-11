// src/components/RoastTokenVault.jsx
import React, { useState, useEffect } from 'react';
import { db, collection, doc, setDoc, functions, httpsCallable } from '../firebase';
import { onSnapshot } from 'firebase/firestore';

const TOKEN_PACKAGES = [
    { id: 'pack_1', tokens: 20, price: 500, label: 'Scorch Pack', icon: '🎟️', subtext: 'Get 20 Tokens' },
    { id: 'pack_5', tokens: 90, price: 2000, label: 'Hot Seat Bundle', icon: '🔥', subtext: 'Get 90 Tokens' },
    { id: 'pack_15', tokens: 250, price: 5000, label: 'Roast Master', icon: '💀', subtext: 'Get 250 Tokens' },
];

const MMG_NUMBER = "592-672-3204"; 

const RoastTokenVault = ({ isOpen, onClose, currentUser, creatorProfile, showMessage }) => {
    const [packages, setPackages] = useState(TOKEN_PACKAGES);
    const [selectedPack, setSelectedPack] = useState(TOKEN_PACKAGES[1]);
    const [paymentId, setPaymentId] = useState('');
    const [screenshotBase64, setScreenshotBase64] = useState(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [showEarningsConfirm, setShowEarningsConfirm] = useState(false); // Confirmation overlay state

    // Dynamic database subscription for Token Economics
    useEffect(() => {
        if (!isOpen) return;
        const unsub = onSnapshot(doc(db, "settings", "tokenEconomics"), (snap) => {
            if (snap.exists() && snap.data().roastTokens) {
                const rPacks = snap.data().roastTokens;
                setPackages(rPacks);
                setSelectedPack(prev => rPacks.find(p => p.id === prev.id) || rPacks[1]);
            }
        });
        return () => unsub();
    }, [isOpen]);

    if (!isOpen) return null;

    const currentEarnings = creatorProfile?.totalEarnings || 0;
    const canAffordWithEarnings = currentEarnings >= selectedPack.price;

    const platformFee = selectedPack.price * 0.15;
    const netValue = selectedPack.price * 0.85;

    const handleBuyWithEarnings = async () => {
        if (!canAffordWithEarnings) {
            showMessage("Insufficient earnings balance.");
            return;
        }
        setIsProcessing(true);
        try {
            const purchaseTokens = httpsCallable(functions, 'purchaseRoastTokensWithEarnings');
            await purchaseTokens({ costGYD: selectedPack.price, tokenAmount: selectedPack.tokens });
            showMessage(`Success! Added ${selectedPack.tokens} tokens to your vault.`);
            setSubmitSuccess(true);
            setTimeout(() => {
                setSubmitSuccess(false);
                onClose();
            }, 3000);
        } catch (error) {
            showMessage(`Error: ${error.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const submitTokenPledge = async () => {
        if (!paymentId || !screenshotBase64) {
            showMessage("Please provide Payment ID and Receipt Screenshot.");
            return;
        }
        setIsProcessing(true);
        try {
            const pledgeRef = doc(collection(db, "paymentPledges"));
            await setDoc(pledgeRef, {
                pledgeId: paymentId,
                internalId: pledgeRef.id,
                userId: currentUser.uid,
                userName: creatorProfile?.creatorName || currentUser.email,
                paymentType: 'roastTokens',
                amount: selectedPack.price,
                tokenAmount: selectedPack.tokens,
                status: 'pending',
                targetUserId: currentUser.uid, 
                targetActorName: creatorProfile?.creatorName || '',
                giftName: `${selectedPack.tokens} Roast Tokens`,
                isAnonymous: false,
                screenshotUrl: screenshotBase64,
                createdAt: new Date().toISOString()
            });
            setPaymentId('');
            setScreenshotBase64(null);
            setSubmitSuccess(true);
            showMessage(`Pledge Received! Once verified, your tokens will be delivered.`);
            setTimeout(() => {
                setSubmitSuccess(false);
                onClose();
            }, 3000);
        } catch (error) {
            console.error("Token transaction error:", error);
            showMessage("Failed to process transaction.");
        } finally {
            setIsProcessing(false);
        }
    };

    const premiumVaultStyles = `
        .vault-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); display: flex; align-items: center; justify-content: center; z-index: 10000; padding: 16px; }
        .vault-modal { background: linear-gradient(180deg, #111111 0%, #050505 100%); border: 1px solid rgba(255,69,0,0.2); border-radius: 24px; width: 100%; max-width: 440px; max-height: 90vh; overflow-y: auto; padding: 32px; box-shadow: 0 30px 60px rgba(0,0,0,0.9), inset 0 1px 1px rgba(255,255,255,0.05); text-align: left; }

        .vault-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
        .vault-close { background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); color: #FFF; font-size: 18px; cursor: pointer; padding: 0; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; transition: all 0.2s; }
        .vault-close:hover { background: #FF4500; border-color: #FF4500; transform: scale(1.05); }

        .vault-card { display: flex; align-items: center; gap: 16px; padding: 14px 16px; border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; margin-bottom: 12px; cursor: pointer; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); background: rgba(25,25,25,0.4); text-align: left; position: relative; overflow: hidden; }
        .vault-card:hover { background: rgba(255,69,0,0.03); border-color: rgba(255,69,0,0.3); transform: translateY(-2px); }
        .vault-card.selected { background: linear-gradient(90deg, rgba(255,69,0,0.1) 0%, rgba(255,69,0,0.02) 100%); border-color: #FF4500; box-shadow: 0 0 20px rgba(255,69,0,0.1); }
        .vault-card.selected::before { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: #FF4500; border-radius: 4px 0 0 4px; }

        .vault-icon { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0; background: linear-gradient(135deg, rgba(255,255,255,0.1), rgba(0,0,0,0.5)); border: 1px solid rgba(255,255,255,0.05); box-shadow: inset 0 2px 5px rgba(255,255,255,0.1); }
        .vault-info { flex: 1; }
        .vault-name { font-size: 15px; font-weight: 800; color: #FFFFFF; margin: 0 0 4px 0; letter-spacing: 0.02em; }
        .vault-breakdown { font-size: 10px; color: #00FFFF; margin: 0; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; }
        .vault-price { font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 900; color: #FFD700; flex-shrink: 0; background: rgba(0,0,0,0.5); padding: 4px 10px; border-radius: 8px; border: 1px solid rgba(255,215,0,0.2); }

        .vault-detail { background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.05); border-radius: 16px; padding: 20px; margin: 20px 0; text-align: left; }
        .vault-row { display: flex; justify-content: space-between; padding: 8px 0; font-size: 13px; font-weight: 600; }
        .vault-row.border { border-bottom: 1px dashed rgba(255,255,255,0.1); margin-bottom: 8px; padding-bottom: 12px; }
        .vault-label { color: #888; text-transform: uppercase; letter-spacing: 0.05em; font-size: 11px; }
        .vault-value { color: #FFF; font-family: 'JetBrains Mono', monospace; }
        .vault-value.negative { color: #F87171; }
        .vault-value.positive { color: #4ADE80; font-size: 14px; text-shadow: 0 0 10px rgba(74,222,128,0.3); }

        .vault-instructions { background: rgba(255,69,0,0.03); border-left: 3px solid #FF4500; border-radius: 0 12px 12px 0; padding: 16px; margin: 20px 0; font-size: 12px; text-align: left; line-height: 1.6; color: #CCC; }
        .vault-instructions p { margin: 0 0 8px 0; }
        .vault-instructions p:last-child { margin: 0; }
        .vault-instructions strong { color: #FF4500; font-family: 'JetBrains Mono', monospace; }

        .vault-btn { width: 100%; padding: 16px; background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); color: #000; border: none; border-radius: 14px; font-size: 14px; font-weight: 900; cursor: pointer; transition: all 0.2s; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 8px; box-shadow: 0 10px 20px rgba(255,215,0,0.2); }
        .vault-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 25px rgba(255,215,0,0.3); }
        .vault-btn.cancel-btn { background: #1A1A1A; color: #FFF; border: 1px solid #333; box-shadow: none; }
        .vault-btn.cancel-btn:hover { background: #222; border-color: #444; }
        
        /* THE GLASSMORPHIC EARNINGS BUTTON */
        .earnings-btn {
            width: 100%; padding: 16px; border-radius: 14px; font-size: 14px; font-weight: 900; cursor: pointer; transition: all 0.2s ease-out; text-transform: uppercase; letter-spacing: 0.05em;
            background: rgba(255, 215, 0, 0.04); 
            border: 1px solid rgba(255, 215, 0, 0.25); 
            color: #FFD700; 
            backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
            box-shadow: 0 4px 15px rgba(255, 215, 0, 0.05);
        }
        .earnings-btn:hover:not(:disabled) {
            background: rgba(255, 215, 0, 0.1);
            border-color: rgba(255, 215, 0, 0.5);
            box-shadow: 0 0 15px rgba(255, 215, 0, 0.15);
        }
        .earnings-btn:active:not(:disabled) {
            background: #FFD700; color: #000; border-color: #FFD700; box-shadow: 0 0 30px rgba(255,215,0,0.7); transform: scale(0.98);
        }
        .earnings-btn:disabled { opacity: 0.35; cursor: not-allowed; border-color: rgba(255,255,255,0.05); color: #666; background: rgba(255,255,255,0.02); }

        .vault-success { text-align: center; padding: 30px 20px; }
        .vault-check { width: 64px; height: 64px; background: rgba(74, 222, 128, 0.1); border: 2px solid #4ADE80; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 28px; color: #4ADE80; box-shadow: 0 0 30px rgba(74,222,128,0.2); }
    `;

    return (
        <>
            <style>{premiumVaultStyles}</style>
            <div className="vault-modal-overlay" onClick={() => { if (!isProcessing) onClose(); }}>
                <div className="vault-modal" onClick={e => e.stopPropagation()}>
                    {!isProcessing && !submitSuccess ? (
                        <>
                            <div className="vault-header">
                                <div>
                                    <p style={{ color: '#FF4500', fontSize: '10px', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', margin: '0 0 6px 0' }}>ROAST ROOM WALLET</p>
                                    <h2 style={{ color: '#FFFFFF', fontSize: '24px', fontWeight: 800, margin: 0 }}>Get Roast Tokens</h2>
                                </div>
                                <button type="button" className="vault-close" onClick={onClose}>✕</button>
                            </div>

                            <p style={{ color: '#888', fontSize: '13px', margin: '0 0 24px 0', lineHeight: '1.5' }}>
                                Select a Package. Tokens allow you to react and step to the mic in the Arena.
                            </p>

                            <div style={{ maxHeight: '280px', overflowY: 'auto', marginBottom: '16px', paddingRight: '6px' }}>
                                {packages.map(pack => (
                                    <div key={pack.id} className={`vault-card ${selectedPack.id === pack.id ? 'selected' : ''}`} onClick={() => setSelectedPack(pack)}>
                                        <div className="vault-icon">{pack.icon}</div>
                                        <div className="vault-info">
                                            <p className="vault-name">{pack.label}</p>
                                            <p className="vault-breakdown">{pack.subtext}</p>
                                        </div>
                                        <span className="vault-price">{pack.price.toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="vault-detail">
                                <div className="vault-row border">
                                    <span className="vault-label">Cost</span>
                                    <span className="vault-value">{selectedPack.price.toLocaleString()} GYD</span>
                                </div>
                                <div className="vault-row">
                                    <span className="vault-label">Platform Fee (15%)</span>
                                    <span className="vault-value negative">-{platformFee.toLocaleString()} GYD</span>
                                </div>
                                <div className="vault-row" style={{ marginTop: '8px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                                    <span className="vault-label" style={{ color: '#4ADE80' }}>Net Value Added</span>
                                    <span className="vault-value positive">{netValue.toLocaleString()} GYD ✓</span>
                                </div>
                            </div>

                            {/* THE NEW GLASSMORPHIC EARNINGS BUTTON */}
                            <div style={{ marginTop: '15px' }}>
                                <button 
                                    className="earnings-btn" 
                                    onClick={() => setShowEarningsConfirm(true)}
                                    disabled={!canAffordWithEarnings || isProcessing}
                                >
                                    Buy With Earnings — {selectedPack.price.toLocaleString()} GYD
                                </button>
                            </div>

                            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '24px', paddingTop: '15px' }}>
                                <div className="vault-instructions">
                                    <p>📱 <strong>MMG Payment Protocol</strong></p>
                                    <p>1. Send <strong>{selectedPack.price.toLocaleString()} GYD</strong> to <strong>{MMG_NUMBER}</strong>.</p>
                                    <p>2. Copy the Transaction ID from your receipt.</p>
                                    <p>3. Paste the ID and upload your receipt screenshot below.</p>
                                </div>

                                <div style={{ marginBottom: '16px', textAlign: 'left' }}>
                                    <label style={{ fontSize: '11px', color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>MMG Payment ID</label>
                                    <input type="text" value={paymentId} onChange={e => setPaymentId(e.target.value)} placeholder="e.g. TXN12345678" 
                                        style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFF', padding: '14px 16px', borderRadius: '12px', fontSize: '14px', outline: 'none', transition: 'all 0.2s', fontFamily: 'monospace' }}
                                        onFocus={e => { e.target.style.borderColor = '#FF4500'; e.target.style.background = 'rgba(255,69,0,0.02)'; }}
                                        onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.1)'; e.target.style.background = 'rgba(255,255,255,0.03)'; }} />
                                </div>

                                <div style={{ marginBottom: '24px', textAlign: 'left' }}>
                                    <label style={{ fontSize: '11px', color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: '8px' }}>Receipt Screenshot</label>
                                    <input type="file" accept="image/*" onChange={e => {
                                        const file = e.target.files[0];
                                        if (file) {
                                            const reader = new FileReader();
                                            reader.onloadend = () => setScreenshotBase64(reader.result);
                                            reader.readAsDataURL(file);
                                        }
                                    }} style={{ fontSize: '13px', color: '#888', width: '100%', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: '12px', border: '1px dashed rgba(255,255,255,0.15)' }} />
                                </div>

                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button type="button" className="vault-btn cancel-btn" style={{ flex: 1 }} onClick={onClose} disabled={isProcessing}>Cancel</button>
                                    <button type="button" className="vault-btn" style={{ flex: 2 }} onClick={submitTokenPledge} disabled={isProcessing || !paymentId || !screenshotBase64}>
                                        {isProcessing ? 'Verifying...' : `Submit MMG Receipt — ${selectedPack.price.toLocaleString()} GYD`}
                                    </button>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="vault-success">
                            <div className="vault-check">✓</div>
                            <h3 style={{ color: '#FFFFFF', fontSize: '24px', fontWeight: 900, margin: '0 0 12px 0', letterSpacing: '0.02em' }}>Transfer Initiated!</h3>
                            <p style={{ color: '#AAA', fontSize: '14px', margin: 0, lineHeight: '1.6' }}>Your receipt has been submitted for verification. Tokens will be added to your vault once approved.</p>
                        </div>
                    )}
                    {/* CUSTOM EARNINGS CONFIRMATION MODAL OVERLAY */}
                    {showEarningsConfirm && (
                        <div className="vault-modal-overlay" style={{ zIndex: 11000, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(15px)' }}>
                            <div className="vault-modal" style={{ maxWidth: '360px', border: '1px solid #FF4500', textAlign: 'center', boxShadow: '0 20px 80px rgba(0,0,0,0.9)' }}>
                                <p style={{ color: '#FF4500', fontSize: '18px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '16px' }}>Authorize Purchase</p>
                                <p style={{ color: '#FFF', fontSize: '14px', lineHeight: '1.5', marginBottom: '24px' }}>
                                    Are you sure you want to deduct <strong style={{color: '#FFD700'}}>{selectedPack.price.toLocaleString()} GYD</strong> from your earnings to purchase <strong style={{color: '#FFD700'}}>{selectedPack.tokens} Roast Passes</strong>?
                                </p>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button className="vault-btn cancel-btn" onClick={() => setShowEarningsConfirm(false)} style={{ flex: 1, margin: 0 }}>Cancel</button>
                                    <button 
                                        className="vault-btn" 
                                        style={{ flex: 1.5, margin: 0 }}
                                        onClick={() => {
                                            setShowEarningsConfirm(false);
                                            handleBuyWithEarnings();
                                        }}
                                    >
                                        Confirm
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default RoastTokenVault;