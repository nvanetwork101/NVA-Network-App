import { useState, useEffect } from 'react';
import { db, functions } from '../firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

const EnrollmentPaymentScreen = ({ currentUser, showMessage, setActiveScreen, creatorProfile }) => {
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
        } catch (error) {
            console.error("Payment submission error:", error);
            showMessage(`Failed to submit payment: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    if (!application || !config) {
        return (
            <div className="screenContainer" style={{ textAlign: 'center', paddingTop: '50px' }}>
                <p className="heading">Loading...</p>
            </div>
        );
    }

    const items = application.selectedOptions.map(opt => ({
        label: opt === 'filmClub' ? 'Film Club Classes' : 'Docu-Series Challenge',
        amount: opt === 'filmClub' ? (config.filmClubFee || 2500) : (config.docuSeriesFee || 500)
    }));

    return (
        <div className="screenContainer">
            <p className="heading">Complete Your Enrollment</p>
            <p className="subHeading">Your application was approved! Make your payment to finalize enrollment.</p>

            {/* Amount Breakdown */}
            <div style={{
                backgroundColor: '#1A1A1A',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px'
            }}>
                <p style={{ margin: '0 0 15px', fontSize: '16px', fontWeight: 'bold', color: '#FFF' }}>
                    Payment Summary
                </p>
                {items.map((item, i) => (
                    <div key={i} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '10px',
                        fontSize: '14px'
                    }}>
                        <span style={{ color: '#AAA' }}>{item.label}</span>
                        <span style={{ color: '#FFF' }}>${item.amount.toLocaleString()} GYD</span>
                    </div>
                ))}
                {items.length === 2 && config.bothDiscount > 0 && (
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: '10px',
                        fontSize: '14px'
                    }}>
                        <span style={{ color: '#00FF00' }}>Bundle Discount</span>
                        <span style={{ color: '#00FF00' }}>-${config.bothDiscount.toLocaleString()} GYD</span>
                    </div>
                )}
                <div style={{
                    borderTop: '1px solid #444',
                    marginTop: '10px',
                    paddingTop: '10px',
                    display: 'flex',
                    justifyContent: 'space-between'
                }}>
                    <span style={{ color: '#FFF', fontWeight: 'bold' }}>Total</span>
                    <span style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '20px' }}>
                        ${application.totalAmount?.toLocaleString()} GYD
                    </span>
                </div>
            </div>

            {/* MMG Instructions */}
            <div style={{
                backgroundColor: 'rgba(255, 215, 0, 0.08)',
                border: '1px solid #FFD700',
                borderRadius: '12px',
                padding: '20px',
                marginBottom: '20px'
            }}>
                <p style={{ margin: '0 0 10px', fontSize: '16px', fontWeight: 'bold', color: '#FFD700' }}>
                    MMG Payment Instructions
                </p>
                <p style={{ color: '#CCC', fontSize: '14px', lineHeight: 1.6, margin: '0 0 10px' }}>
                    Send <strong style={{ color: '#FFF' }}>${application.totalAmount?.toLocaleString()} GYD</strong> via MMG to:
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
                onClick={() => setActiveScreen('CreatorDashboard')}
                style={{ backgroundColor: '#3A3A3A', marginTop: '20px' }}
            >
                <span className="buttonText light">Back to Dashboard</span>
            </button>
        </div>
    );
};

export default EnrollmentPaymentScreen;