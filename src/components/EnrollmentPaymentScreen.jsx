import { useState, useEffect, useMemo } from 'react';
import { db, functions, storage } from '../firebase';
import { doc, onSnapshot, updateDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';

const EnrollmentPaymentScreen = ({ currentUser, showMessage, setActiveScreen, creatorProfile, pledgeContext }) => {
    const isTicketCheckout = pledgeContext?.type === 'eventTicket';
    const [application, setApplication] = useState(null);
    const [config, setConfig] = useState(null);
    const [paymentId, setPaymentId] = useState('');
    const [screenshot, setScreenshot] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [uploadProgress, setUploadProgress] = useState(0);

    useEffect(() => {
        if (!currentUser) return;
        const unsub = onSnapshot(
            doc(db, "enrollmentApplications", currentUser.uid),
            (snap) => {
                if (snap.exists()) setApplication(snap.data());
            }
        );
        return () => unsub();
    }, [currentUser]);

    useEffect(() => {
        const unsub = onSnapshot(doc(db, "settings", "enrollmentConfig"), (snap) => {
            if (snap.exists()) setConfig(snap.data());
        });
        return () => unsub();
    }, []);

    const handleScreenshotChange = (e) => {
        const file = e.target.files[0];
        if (file && file.size > 5 * 1024 * 1024) {
            showMessage("Image must be under 5MB.");
            return;
        }
        setScreenshot(file);
    };

    const handleSubmitPayment = async (e) => {
        e.preventDefault();
        if (!screenshot) {
            showMessage("Please upload a screenshot of your payment.");
            return;
        }
        if (!paymentId.trim()) {
            showMessage("Please enter the payment ID from your MMG receipt.");
            return;
        }

        setIsSubmitting(true);
        setUploadProgress(25);

        try {
            // Convert screenshot to base64 for Cloud Function
            const toBase64 = (file) => new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = () => resolve(reader.result);
                reader.onerror = (e) => reject(e);
            });
            const base64Image = await toBase64(screenshot);
            setUploadProgress(60);

            if (isTicketCheckout) {
                // --- BOX OFFICE TICKETING PATH (CLIENT-SIDE DIRECT) ---
                // 1. Upload the receipt securely to Firebase Storage
                const receiptRef = ref(storage, `receipts/tickets/${currentUser.uid}_${Date.now()}`);
                await uploadString(receiptRef, base64Image, 'data_url');
                const receiptUrl = await getDownloadURL(receiptRef);
                setUploadProgress(80);

                // 2. Write the pledge directly into the Box Office Waiting Room
                await addDoc(collection(db, 'paymentPledges'), {
                    type: 'ticket',
                    eventId: pledgeContext.targetEventId,
                    eventTitle: pledgeContext.targetEventTitle,
                    userId: currentUser.uid,
                    userEmail: currentUser.email || '',
                    userName: creatorProfile?.displayName || 'Unknown',
                    paymentId: paymentId.trim(),
                    amount: pledgeContext.amount,
                    receiptUrl: receiptUrl,
                    status: 'pending',
                    createdAt: serverTimestamp()
                });

                setUploadProgress(100);
                showMessage("Ticket pledge submitted! Your ticket unlocks upon Box Office approval.");
                
                // Route back to the Premieres tab to wait
                setActiveScreen('Discover');
                setTimeout(() => window.dispatchEvent(new CustomEvent('switchDiscoverTab', { detail: 'Premieres' })), 50);
            } else {
                // --- ENROLLMENT PATH ---
                const submitPayment = httpsCallable(functions, 'submitEnrollmentPayment');
                const result = await submitPayment({
                    userId: currentUser.uid,
                    paymentId: paymentId.trim(),
                    screenshotBase64: base64Image,
                    autoVerify: config?.autoVerifyPayments !== false
                });
                setUploadProgress(100);

                if (result.data.verified) {
                    showMessage("Payment verified! You are now enrolled.");
                } else {
                    showMessage("Payment submitted! Pending admin verification.");
                }
                setActiveScreen('CreatorDashboard');
            }
        } catch (error) {
            console.error("Payment submission error:", error);
            showMessage(`Failed to submit payment: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // --- CONSOLIDATED SUBSCRIPTION & TRACK LOGIC ---
    // ARCHITECTURAL FIX: Hooks must always be called before early returns
    const isFilmClubRenewalWindow = useMemo(() => {
        if (!creatorProfile?.subscriptionExpiresAt || !creatorProfile?.isFilmClub) return false;
        const expiry = new Date(creatorProfile.subscriptionExpiresAt).getTime();
        const now = Date.now();
        const diffDays = Math.ceil((expiry - now) / (1000 * 60 * 60 * 24));
        return diffDays <= 7; // Only active 7 days before or during grace period
    }, [creatorProfile]);

    if (!config || (!application && !isTicketCheckout)) {
        return (
            <div className="screenContainer" style={{ textAlign: 'center', paddingTop: '50px' }}>
                <p className="heading">Loading Checkout...</p>
            </div>
        );
    }

    let items = [];
    let displayTotal = 0;
    
    // NVA DUAL-PURPOSE CHECKOUT LOGIC
    if (isTicketCheckout) {
        const ticketAmount = pledgeContext.amount || 0;
        items = [{
            label: `🎟️ Box Office Ticket: ${pledgeContext.targetEventTitle}`,
            amount: ticketAmount
        }];
        displayTotal = ticketAmount;
    } else {
        // FILTER: Only bill for tracks they don't have, or Film Club if it's renewal time.
        items = (application?.selectedOptions || [])
            .filter(opt => {
                if (opt === 'filmClub') {
                    const isGold = creatorProfile?.badges?.includes("Gold Club");
                    if (isGold) return false;
                    const isActive = creatorProfile?.isFilmClub || creatorProfile?.isClassMember;
                    return !(isActive && !isFilmClubRenewalWindow);
                }
                if (opt === 'docuSeries') {
                    return !creatorProfile?.isContestant;
                }
                return true;
            })
            .map(opt => ({
                id: opt,
                label: opt === 'filmClub' ? (isFilmClubRenewalWindow ? 'Film Club Renewal' : 'Film Club Classes') : 'Docu-Series Challenge',
                amount: opt === 'filmClub' ? (config.filmClubFee || 2500) : (config.docuSeriesFee || 500)
            }));
        // RECALCULATE TOTAL: Prevents charging for blocked tracks
        displayTotal = items.reduce((sum, item) => sum + item.amount, 0) - (items.length === 2 ? (config.bothDiscount || 0) : 0);
    }

    return (
        <div className="screenContainer" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <p className="heading" style={{ color: isTicketCheckout ? '#FFD700' : '#FFF', fontSize: '28px' }}>
                {isTicketCheckout ? 'Box Office Checkout' : 'Complete Your Enrollment'}
            </p>
            <p className="subHeading" style={{ marginBottom: '30px' }}>
                {isTicketCheckout 
                    ? `Secure your access to "${pledgeContext.targetEventTitle}".` 
                    : 'Your application was approved! Make your payment to finalize enrollment.'}
            </p>

            {/* Amount Breakdown */}
            <div style={{ backgroundColor: '#1A1A1A', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
                <p style={{ margin: '0 0 15px', fontSize: '16px', fontWeight: 'bold', color: '#FFF' }}>Payment Summary</p>
                
                {items.length > 0 ? items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', fontSize: '14px' }}>
                        <span style={{ color: '#AAA', flex: 1, paddingRight: '15px' }}>{item.label}</span>
                        <div style={{ textAlign: 'right' }}>
                            <span style={{ color: '#FFF', fontWeight: 'bold' }}>${item.amount.toLocaleString()} GYD</span>
                        </div>
                    </div>
                )) : <p style={{ color: '#888', fontSize: '13px' }}>No active payments required.</p>}

                {!isTicketCheckout && items.length === 2 && config.bothDiscount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', fontSize: '14px' }}>
                        <span style={{ color: '#00FF00' }}>Bundle Discount</span>
                        <span style={{ color: '#00FF00' }}>-${config.bothDiscount.toLocaleString()} GYD</span>
                    </div>
                )}
                
                <div style={{ borderTop: '1px solid #444', marginTop: '10px', paddingTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ color: '#FFF', fontWeight: 'bold' }}>Total Due Now</span>
                    <span style={{ color: '#FFD700', fontWeight: '900', fontSize: '24px' }}>
                        ${displayTotal.toLocaleString()} GYD
                    </span>
                </div>
            </div>

            {/* TRACK PROTECTION BANNERS (HIDDEN DURING TICKET CHECKOUT) */}
            {!isTicketCheckout && creatorProfile?.isFilmClub && !isFilmClubRenewalWindow && application?.selectedOptions.includes('filmClub') && (
                <div style={{ backgroundColor: 'rgba(0, 255, 255, 0.08)', border: '1px solid #00FFFF', borderRadius: '10px', padding: '12px', marginBottom: '20px' }}>
                    <p style={{ color: '#00FFFF', fontSize: '12px', margin: 0, textAlign: 'center' }}>
                        🛡️ <strong>Film Club Active:</strong> Your membership is current. Renewal payment opens 7 days before your expiration date.
                    </p>
                </div>
            )}

            {!isTicketCheckout && creatorProfile?.isContestant && application?.selectedOptions.includes('docuSeries') && (
                <div style={{ backgroundColor: 'rgba(255, 215, 0, 0.08)', border: '1px solid #FFD700', borderRadius: '10px', padding: '12px', marginBottom: '20px' }}>
                    <p style={{ color: '#FFD700', fontSize: '12px', margin: 0, textAlign: 'center' }}>
                        🏆 <strong>Contestant Status Active:</strong> You are already registered for the current Docu-Series Challenge.
                    </p>
                </div>
            )}

            {/* MMG Instructions */}
            <div style={{ backgroundColor: 'rgba(255, 215, 0, 0.05)', border: '1px solid #FFD700', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
                <p style={{ margin: '0 0 10px', fontSize: '16px', fontWeight: 'bold', color: '#FFD700' }}>MMG Payment Instructions</p>
                <p style={{ color: '#CCC', fontSize: '14px', lineHeight: 1.6, margin: '0 0 10px' }}>
                    Send <strong style={{ color: '#FFF' }}>${displayTotal.toLocaleString()} GYD</strong> via MMG to:
                </p>
                <div style={{
                    backgroundColor: '#0A0A0A',
                    borderRadius: '8px',
                    padding: '15px',
                    marginBottom: '10px'
                }}>
                    <p style={{ margin: '0 0 5px', color: '#AAA', fontSize: '13px' }}>MMG Number</p>
                    <p style={{ margin: 0, fontSize: '22px', fontWeight: 'bold', color: '#FFD700' }}>
                        {config.mmgNumber || 'Not configured'}
                    </p>
                </div>
                <p style={{ color: '#AAA', fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
                    {config.mmgInstructions || "Send the exact amount via MMG. Include your payment ID in the MMG notes. Take a screenshot of the confirmation and upload it below."}
                </p>
            </div>

            {/* Payment Proof Form */}
            <form onSubmit={handleSubmitPayment}>
                <div className="formGroup">
                    <label className="formLabel">Payment ID (from MMG receipt):</label>
                    <input
                        type="text"
                        className="formInput"
                        value={paymentId}
                        onChange={(e) => setPaymentId(e.target.value)}
                        placeholder="e.g. MMG-ABC123456"
                        required
                    />
                    <p className="smallText" style={{ color: '#888', marginTop: '5px' }}>
                        This ID helps us verify your payment. Include it in your MMG notes.
                    </p>
                </div>

                <div className="formGroup">
                    <label className="formLabel">Payment Screenshot:</label>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleScreenshotChange}
                        style={{ color: '#FFF' }}
                    />
                    {screenshot && (
                        <p className="smallText" style={{ color: '#00FF00', marginTop: '5px' }}>
                            Selected: {screenshot.name}
                        </p>
                    )}
                </div>

                {isSubmitting && (
                    <div style={{
                        backgroundColor: '#1A1A1A',
                        borderRadius: '8px',
                        padding: '15px',
                        marginBottom: '20px',
                        textAlign: 'center'
                    }}>
                        <p style={{ color: '#FFD700', margin: 0 }}>Uploading... {uploadProgress}%</p>
                        <div style={{
                            width: '100%',
                            height: '6px',
                            backgroundColor: '#333',
                            borderRadius: '3px',
                            marginTop: '10px',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: `${uploadProgress}%`,
                                height: '100%',
                                backgroundColor: '#FFD700',
                                transition: 'width 0.3s ease'
                            }} />
                        </div>
                    </div>
                )}

                <button
                    type="submit"
                    className="button"
                    disabled={isSubmitting}
                    style={{ opacity: isSubmitting ? 0.5 : 1 }}
                >
                    <span className="buttonText">
                        {isSubmitting ? 'Submitting...' : 'Submit Payment Proof'}
                    </span>
                </button>
            </form>

            <button
                className="button"
                onClick={() => {
                    if (isTicketCheckout) {
                        setActiveScreen('Discover');
                        setTimeout(() => window.dispatchEvent(new CustomEvent('switchDiscoverTab', { detail: 'Premieres' })), 50);
                    } else {
                        setActiveScreen('CreatorDashboard');
                    }
                }}
                style={{ backgroundColor: '#3A3A3A', marginTop: '20px', border: '1px solid #555' }}
            >
                <span className="buttonText light">
                    {isTicketCheckout ? 'Cancel Checkout' : 'Back to Dashboard'}
                </span>
            </button>
        </div>
    );
};

export default EnrollmentPaymentScreen;