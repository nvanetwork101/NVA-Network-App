// src/components/CompetitionEntryForm.jsx

import React, { useState, useRef } from 'react';
import { db, storage, functions, extractVideoInfo } from '../firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { collection, doc, setDoc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

const MMG_NUMBER = "592-672-3204";

const CompetitionEntryForm = ({ competition, currentUser, creatorProfile, onClose, showMessage }) => {
    // --- COMPETITION TYPE LOGIC ---
    const isPhotoComp = competition?.competitionType === 'Photo';

    // --- PAYMENT GATEWAY STATE ---
    const entryFee = competition?.entryFee || 0;
    const hasFee = entryFee > 0;
    const userEarnings = creatorProfile?.totalEarnings || 0;
    const hasEnoughEarnings = userEarnings >= entryFee;

    const [mmgName, setMmgName] = useState('');
    const [paymentId, setPaymentId] = useState('');
    const [screenshotBase64, setScreenshotBase64] = useState(null);
    const [hasAgreed, setHasAgreed] = useState(false); // Checkbox state

    // --- FORM STATE ---
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitSuccess, setSubmitSuccess] = useState(false);
    const [successMode, setSuccessMode] = useState('earnings');
    const [uploadingImage, setUploadingImage] = useState(false);
    const [alreadyEntered, setAlreadyEntered] = useState(false);
    const [checkingEntry, setCheckingEntry] = useState(true);
    const fileInputRef = useRef(null);

    // Securely check if user already has an active entry in this tournament
    React.useEffect(() => {
        const checkExistingEntry = async () => {
            if (!competition?.id || !currentUser?.uid) {
                setCheckingEntry(false);
                return;
            }
            try {
                const entryDocRef = doc(db, "competitions", competition.id, "entries", currentUser.uid);
                const docSnap = await getDoc(entryDocRef);
                if (docSnap.exists()) {
                    setAlreadyEntered(true);
                }
            } catch (err) {
                console.error("Error checking existing entry:", err);
            } finally {
                setCheckingEntry(false);
            }
        };
        checkExistingEntry();
    }, [competition?.id, currentUser?.uid]);

    const [form, setForm] = useState({
        competitionId: competition?.id || '',
        title: '',
        contactNumber: '',
        bio: '',
        submissionUrl: '',
        photoUrl: '', // Entry Photo
        customThumbnailUrl: '', // Video Preview
    });

    // --- LOGIC: AUTO-PULL VIDEO METADATA ---
    const handleUrlChange = (url) => {
        setForm(prev => ({ ...prev, submissionUrl: url }));
        const info = extractVideoInfo(url);
        if (info && info.thumbnailUrl && info.platform !== 'generic') {
            setForm(prev => ({ ...prev, customThumbnailUrl: info.thumbnailUrl }));
            showMessage("Video preview synchronized!");
        }
    };

    // --- LOGIC: IMAGE UPLOAD ---
    const handleImageUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        setUploadingImage(true);
        showMessage("Uploading artwork...");
        
        try {
            const filePath = `competition_entries/${competition.id}/${currentUser.uid}/${Date.now()}_entry`;
            const storageRef = ref(storage, filePath);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);
            
            setForm(prev => ({ ...prev, photoUrl: url }));
            showMessage("Upload successful!");
        } catch (err) {
            showMessage("Upload failed: " + err.message);
        } finally {
            setUploadingImage(false);
        }
    };

    const validateForm = () => {
        if (!form.title.trim()) return "Entry title is required.";
        if (!form.contactNumber.trim()) return "Contact number is required.";
        
        // THE FIX: Check if an image is still processing before allowing submission
        if (uploadingImage) return "Please wait for your image upload to finish...";

        if (isPhotoComp) {
            if (!form.photoUrl) return "Please upload your photo entry.";
        } else {
            if (!form.submissionUrl.trim()) return "Please provide your video link.";
            if (!form.photoUrl && !form.customThumbnailUrl) {
                return "The system could not pull a preview. Please click 'UPLOAD PHOTO' to add a thumbnail image.";
            }
        }
        
        if (!hasAgreed) return "You must check the box to agree to the tournament terms.";
        
        return null;
    };

    // --- PATH A: DASHBOARD EARNINGS SUBMISSION ---
    const handleEarningsSubmit = async () => {
        const error = validateForm();
        if (error) return showMessage(error);

        // Immediate check for sufficient funds
        if (!hasEnoughEarnings) {
            return showMessage(`Insufficient balance. You need ${entryFee.toLocaleString()} GYD, but your balance is ${userEarnings.toLocaleString()} GYD.`);
        }

        setIsSubmitting(true);
        showMessage("Processing Earnings Payment & Entry...");

        try {
            const submitFunc = httpsCallable(functions, 'submitCompetitionEntry');
            await submitFunc({ ...form, status: 'active', paymentMethod: 'earnings' });
            
            setSuccessMode('earnings');
            setSubmitSuccess(true);
            setTimeout(() => {
                onClose();
            }, 3500); // Auto-close after 3.5s
        } catch (error) {
            console.error("Submission Error:", error);
            showMessage(error.message || "Failed to submit entry.");
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- PATH B: MMG / FREE SUBMISSION ---
    const handleMMGSubmit = async () => {
        const error = validateForm();
        if (error) return showMessage(error);

        if (hasFee) {
            if (!mmgName) return showMessage("Please provide your Registered Name on MMG.");
            if (!paymentId) return showMessage("Please provide your MMG Payment ID.");
            if (!screenshotBase64) return showMessage("Please upload your receipt screenshot.");
        }

        setIsSubmitting(true);
        showMessage("Submitting entry to CenterStage...");

        try {
            const status = hasFee ? 'pending' : 'active';
            const submitFunc = httpsCallable(functions, 'submitCompetitionEntry');
            await submitFunc({ ...form, status });

            if (hasFee) {
                // Generate a Payment Pledge for Admin Verification
                const pledgeRef = doc(collection(db, "paymentPledges"));
                await setDoc(pledgeRef, {
                    pledgeId: paymentId,
                    internalId: pledgeRef.id,
                    userId: currentUser.uid,
                    userName: creatorProfile?.creatorName || currentUser.email,
                    mmgName: mmgName, // Save the registered MMG name
                    /* THE FIX: Changed to match the backend expected string 'competitionEntry' */
                    paymentType: 'competitionEntry', 
                    amount: entryFee,
                    status: 'pending',
                    targetEventTitle: `[Competition] ${competition.title}`,
                    competitionId: competition.id,
                    screenshotUrl: screenshotBase64,
                    createdAt: new Date().toISOString()
                });
            }
            
            setSuccessMode('mmg');
            setSubmitSuccess(true);
            setTimeout(() => {
                onClose();
            }, 3500); // Auto-close after 3.5s
        } catch (error) {
            console.error("Submission Error:", error);
            showMessage(error.message || "Failed to submit entry.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="modal-overlay" style={{ zIndex: 10000, position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
            <style>{`
                .earnings-btn {
                    width: 100%; padding: 16px; border-radius: 14px; font-size: 14px; font-weight: 900; cursor: pointer; transition: all 0.2s ease-out; text-transform: uppercase; letter-spacing: 0.05em;
                    background: rgba(255, 215, 0, 0.04); border: 1px solid rgba(255, 215, 0, 0.25); color: #FFD700; box-shadow: 0 4px 15px rgba(255, 215, 0, 0.05);
                }
                .earnings-btn:hover:not(:disabled) { background: rgba(255, 215, 0, 0.1); border-color: rgba(255, 215, 0, 0.5); box-shadow: 0 0 15px rgba(255, 215, 0, 0.15); }
                .earnings-btn:active:not(:disabled) { background: #FFD700; color: #000; border-color: #FFD700; transform: scale(0.98); }
                .earnings-btn:disabled { opacity: 0.35; cursor: not-allowed; border-color: rgba(255,255,255,0.05); color: #666; background: rgba(255,255,255,0.02); }
                
                .mmg-instructions { background: rgba(0,255,255,0.03); border-left: 3px solid #00FFFF; border-radius: 0 12px 12px 0; padding: 16px; margin: 20px 0; font-size: 12px; text-align: left; line-height: 1.6; color: #CCC; }
                .submit-btn { width: 100%; padding: 16px; background: linear-gradient(135deg, #FFD700 0%, #FFA500 100%); color: #000; border: none; border-radius: 14px; font-size: 14px; font-weight: 900; cursor: pointer; transition: all 0.2s; text-transform: uppercase; letter-spacing: 0.05em; box-shadow: 0 10px 20px rgba(255,215,0,0.2); }
                .submit-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 25px rgba(255,215,0,0.3); }
                .submit-btn:disabled { background: #333; color: #666; box-shadow: none; cursor: not-allowed; }
            `}</style>

            <div className="modal-content" style={{ background: 'linear-gradient(180deg, #111111 0%, #050505 100%)', border: '1px solid rgba(255,215,0,0.15)', borderRadius: '24px', width: '100%', maxWidth: '480px', padding: '30px', boxShadow: '0 30px 60px rgba(0,0,0,0.9)', maxHeight: '90vh', overflowY: 'auto' }}>
                
                {checkingEntry ? (
                    <div style={{ textAlign: 'center', padding: '50px 20px', color: '#AAA', fontSize: '14px' }}>
                        Verifying entry eligibility...
                    </div>
                ) : alreadyEntered ? (
                    <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                        <div style={{ width: '70px', height: '70px', borderRadius: '50%', border: '2px solid #FF3333', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 0 20px rgba(255,51,51,0.15)' }}>
                            <span style={{ color: '#FF3333', fontSize: '32px', fontWeight: 'bold' }}>✕</span>
                        </div>
                        <h3 style={{ color: '#FFFFFF', fontSize: '24px', fontWeight: 900, margin: '0 0 16px 0', letterSpacing: '0.02em' }}>
                            Already Entered!
                        </h3>
                        <p style={{ color: '#AAA', fontSize: '14px', margin: '0 0 24px 0', lineHeight: '1.6' }}>
                            You have already submitted an entry to this tournament. Each user is limited to exactly <strong style={{color: '#FFD700'}}>one entry</strong> per competition.
                        </p>
                        <button onClick={onClose} className="submit-btn" style={{ background: '#222', color: '#FFF', border: '1px solid #444', boxShadow: 'none' }}>
                            Close Window
                        </button>
                    </div>
                ) : !submitSuccess ? (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '25px' }}>
                    <div>
                        <p style={{ color: '#00FFFF', fontSize: '10px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '2px', margin: '0 0 5px 0' }}>CenterStage Entry</p>
                        <h2 style={{ color: '#FFF', fontSize: '24px', fontWeight: '800', margin: 0 }}>Join Tournament</h2>
                    </div>
                    <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#FFF', width: '32px', height: '32px', borderRadius: '50%', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.2s' }}>✕</button>
                </div>

                {hasFee && (
                    <div style={{ background: 'rgba(0, 255, 255, 0.05)', border: '1px dashed rgba(0, 255, 255, 0.3)', padding: '15px', borderRadius: '12px', marginBottom: '20px', textAlign: 'center' }}>
                        <p style={{ margin: 0, color: '#00FFFF', fontSize: '14px', fontWeight: '900', textTransform: 'uppercase', letterSpacing: '1px' }}>Tournament Entry Fee</p>
                        <p style={{ margin: '5px 0 0 0', color: '#FFF', fontSize: '24px', fontWeight: '900', fontFamily: 'monospace' }}>{entryFee.toLocaleString()} GYD</p>
                    </div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    
                    {/* --- CORE FORM FIELDS --- */}
                    <div>
                        <label style={{ fontSize: '11px', color: '#888', fontWeight: 600, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Entry Title</label>
                        <input type="text" placeholder="Give your entry a name..." value={form.title} onChange={e => setForm({...form, title: e.target.value})} style={{ width: '100%', background: '#0D0D0D', border: '1px solid #333', color: '#FFF', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', outline: 'none' }} />
                    </div>

                    <div>
                        <label style={{ fontSize: '11px', color: '#888', fontWeight: 600, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Contact Number (WhatsApp/Phone)</label>
                        <input type="text" placeholder="Required for verification..." value={form.contactNumber} onChange={e => setForm({...form, contactNumber: e.target.value})} style={{ width: '100%', background: '#0D0D0D', border: '1px solid #333', color: '#FFF', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', outline: 'none' }} />
                    </div>

                    {/* DYNAMIC FIELD: Video Link (Hidden if Photo Competition) */}
                    {!isPhotoComp && (
                        <div>
                            <label style={{ fontSize: '11px', color: '#888', fontWeight: 600, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Video Link (Vimeo/YouTube)</label>
                            <input type="url" placeholder="Paste link to auto-pull thumbnail..." value={form.submissionUrl} onChange={e => handleUrlChange(e.target.value)} style={{ width: '100%', background: '#0D0D0D', border: '1px solid #333', color: '#FFF', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', outline: 'none' }} />
                        </div>
                    )}

                    {/* DYNAMIC FIELD: Image Upload (Label adapts based on Comp Type) */}
                    <div>
                        <label style={{ fontSize: '11px', color: '#888', fontWeight: 600, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>
                            {isPhotoComp ? "Upload Photo Entry" : "Video Thumbnail (Upload override if auto-pull fails)"}
                        </label>
                        <div style={{ display: 'flex', gap: '15px', alignItems: 'center', background: 'rgba(25,25,25,0.4)', padding: '10px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                            <div style={{ width: '80px', height: '80px', borderRadius: '8px', overflow: 'hidden', background: '#111', border: '1px solid #333' }}>
                                {(form.photoUrl || form.customThumbnailUrl) ? (
                                    <img src={form.photoUrl || form.customThumbnailUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Entry" />
                                ) : (
                                    <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>🖼️</div>
                                )}
                            </div>
                            <div style={{ flex: 1 }}>
                                <button type="button" onClick={() => fileInputRef.current.click()} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid rgba(255,215,0,0.5)', background: 'rgba(255,215,0,0.05)', color: '#FFD700', fontWeight: '800', fontSize: '12px', cursor: 'pointer' }}>
                                    {uploadingImage ? "UPLOADING..." : "UPLOAD PHOTO"}
                                </button>
                                <input type="file" ref={fileInputRef} onChange={handleImageUpload} hidden accept="image/*" />
                            </div>
                        </div>
                    </div>

                    <div>
                        <label style={{ fontSize: '11px', color: '#888', fontWeight: 600, display: 'block', marginBottom: '6px', textTransform: 'uppercase' }}>Bio / Description</label>
                        <textarea style={{ width: '100%', height: '80px', background: '#0D0D0D', border: '1px solid #333', color: '#FFF', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', outline: 'none', resize: 'vertical' }} placeholder="Tell the audience why they should vote for you..." value={form.bio} onChange={e => setForm({...form, bio: e.target.value})} />
                    </div>

                    {/* --- DISCLAIMER & TERMS --- */}
                    <div style={{ background: 'rgba(255, 0, 0, 0.05)', border: '1px solid rgba(255, 0, 0, 0.2)', padding: '12px', borderRadius: '10px' }}>
                        <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
                            <input 
                                type="checkbox" 
                                checked={hasAgreed} 
                                onChange={(e) => setHasAgreed(e.target.checked)}
                                style={{ width: '18px', height: '18px', marginTop: '2px', accentColor: '#FFD700', cursor: 'pointer' }} 
                            />
                            <span style={{ fontSize: '11px', color: '#CCC', lineHeight: '1.4' }}>
                                <strong>Read & Agreed:</strong> I confirm I own the rights to the uploaded content. All transactions are final; please verify your information carefully. If payment details are incorrect and cannot be identified, admins are not liable and refunds will not be issued.
                            </span>
                        </label>
                    </div>

                    {/* --- PAYMENT GATEWAY --- */}
                    {hasFee && (
                        <>
                            <hr style={{ border: 'none', borderTop: '1px solid rgba(255,255,255,0.1)', margin: '10px 0' }} />
                            
                            <button 
                                type="button"
                                className="earnings-btn" 
                                /* Button remains live to provide feedback pings */
                                disabled={isSubmitting}
                                onClick={handleEarningsSubmit}
                            >
                                Send with Earnings — {entryFee.toLocaleString()} GYD
                            </button>

                            <div style={{ textAlign: 'center', color: '#555', fontSize: '12px', fontWeight: 'bold', margin: '5px 0' }}>— OR —</div>

                            <div className="mmg-instructions">
                                <p style={{ color: '#00FFFF', fontWeight: 'bold', marginBottom: '10px' }}>⚠️ Note: Your Name and Contact Number must match your MMG transaction exactly.</p>
                                <p>1. Send <strong>{entryFee.toLocaleString()} GYD</strong> to <strong>{MMG_NUMBER}</strong></p>
                                <p>2. Copy the Transaction ID from your receipt</p>
                                <p>3. Fill out your MMG details below</p>
                            </div>

                            <div>
                                <label style={{ fontSize: '11px', color: '#737373', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Registered Name on MMG</label>
                                <input type="text" value={mmgName} onChange={e => setMmgName(e.target.value)} placeholder="e.g. John Doe" style={{ width: '100%', background: '#0D0D0D', border: '1px solid #333', color: '#FFF', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', outline: 'none' }} />
                            </div>

                            <div>
                                <label style={{ fontSize: '11px', color: '#737373', fontWeight: 600, display: 'block', marginBottom: '6px' }}>MMG Payment ID</label>
                                <input type="text" value={paymentId} onChange={e => setPaymentId(e.target.value)} placeholder="e.g. TXN12345678" style={{ width: '100%', background: '#0D0D0D', border: '1px solid #333', color: '#FFF', padding: '12px 16px', borderRadius: '10px', fontSize: '14px', outline: 'none' }} />
                            </div>

                            <div>
                                <label style={{ fontSize: '11px', color: '#737373', fontWeight: 600, display: 'block', marginBottom: '6px' }}>Receipt Screenshot</label>
                                <input type="file" accept="image/*" onChange={e => {
                                    const file = e.target.files[0];
                                    if (file) {
                                        const reader = new FileReader();
                                        reader.onloadend = () => setScreenshotBase64(reader.result);
                                        reader.readAsDataURL(file);
                                    }
                                }} style={{ fontSize: '12px', color: '#737373', width: '100%' }} />
                            </div>
                        </>
                    )}

                    <div style={{ marginTop: '10px' }}>
                        <button 
                            type="button" 
                            /* THE FIX: Removed uploadingImage restriction. Clicking now triggers the wait message from Step A. */
                            disabled={isSubmitting} 
                            onClick={handleMMGSubmit}
                            className="submit-btn"
                        >
                            {isSubmitting ? "PROCESSING..." : hasFee ? `SUBMIT WITH MMG — ${entryFee.toLocaleString()} GYD` : "SUBMIT FREE ENTRY"}
                        </button>
                    </div>

                </div>
                    </>
                ) : (
                    <div style={{ textAlign: 'center', padding: '50px 20px' }}>
                        <div style={{ width: '70px', height: '70px', borderRadius: '50%', border: '2px solid #4ADE80', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 0 20px rgba(74,222,128,0.15)' }}>
                            <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="#4ADE80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                        </div>
                        <h3 style={{ color: '#FFFFFF', fontSize: '26px', fontWeight: 900, margin: '0 0 16px 0', letterSpacing: '0.02em' }}>
                            {successMode === 'earnings' ? 'Payment Complete!' : 'Entry Submitted!'}
                        </h3>
                        <p style={{ color: '#AAA', fontSize: '14px', margin: 0, lineHeight: '1.6' }}>
                            {successMode === 'earnings' || !hasFee
                                ? <>Your entry fee has been securely transferred from your earnings. You are now <strong style={{color: '#FFD700'}}>live</strong> in the arena.</>
                                : <>Your MMG receipt has been received. Your entry will go live once verified by an Admin.</>}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CompetitionEntryForm;