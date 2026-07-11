import { getIdToken, sendEmailVerification } from 'firebase/auth';
import React, { useState } from 'react';
import { auth } from '../firebase';

const VerifyEmailScreen = ({ currentUser, showMessage, handleLogout }) => {
    const [isSending, setIsSending] = useState(false);
    const [isChecking, setIsChecking] = useState(false);

    const handleResend = async () => {
        if (!currentUser) return;
        setIsSending(true);
        showMessage("Resending verification email...");
        try {
            await sendEmailVerification(currentUser);
            showMessage("A new verification email has been sent.");
        } catch (error) {
            showMessage("Failed to resend. Please try again in a moment.");
        } finally {
            setIsSending(false);
        }
    };

    const handleCheckVerification = async () => {
        setIsChecking(true);
        try {
            if (!auth.currentUser) throw new Error("User session not found.");
            
            // AUTHORITATIVE SYNC: Force Firebase to re-fetch user metadata from server [1]
            await auth.currentUser.reload();
            await getIdToken(auth.currentUser, true);

            if (auth.currentUser.emailVerified) {
                showMessage("Verification successful! Opening your Hub...");
                window.location.reload(); // Hard reload to trigger verified state in App.jsx [1]
            } else {
                showMessage("Email not verified yet. Please check your inbox.");
            }
        } catch (error) {
            showMessage("Error during verification check.");
        } finally {
            setIsChecking(false);
        }
    };

    const glassStyles = `
        .verify-card {
            max-width: 480px; width: 90%; margin: 60px auto;
            background: rgba(15, 15, 15, 0.6);
            backdrop-filter: blur(15px); -webkit-backdrop-filter: blur(15px);
            border: 1px solid rgba(255, 255, 255, 0.08);
            border-radius: 24px; padding: 40px 30px;
            box-shadow: 0 20px 50px rgba(0,0,0,0.5);
            text-align: center;
        }
        .verify-main-btn {
            width: 100%; padding: 16px; border-radius: 14px;
            font-size: 15px; font-weight: 900; text-transform: uppercase;
            letter-spacing: 1px; cursor: pointer; transition: all 0.2s ease;
            background: rgba(255, 215, 0, 0.08); 
            border: 1px solid rgba(255, 215, 0, 0.3);
            color: #FFD700;
            margin-top: 25px;
        }
        .verify-main-btn:hover:not(:disabled) {
            background: rgba(255, 215, 0, 0.15);
            border-color: rgba(255, 215, 0, 0.6);
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.1);
        }
        /* YELLOW GLOW TRIGGER: Lights up fully yellow on click [1] */
        .verify-main-btn:active:not(:disabled) {
            background: #FFD700 !important;
            color: #000 !important;
            box-shadow: 0 0 30px rgba(255, 215, 0, 0.6) !important;
            transform: scale(0.98);
        }
        .verify-main-btn:disabled { opacity: 0.4; cursor: not-allowed; }
        .secondary-btn {
            background: rgba(255, 255, 255, 0.03); border: 1px solid rgba(255,255,255,0.1);
            color: #AAA; padding: 10px 20px; border-radius: 12px; font-size: 12px;
            font-weight: bold; cursor: pointer; transition: 0.2s;
        }
        .secondary-btn:hover { background: rgba(255,255,255,0.08); color: #FFF; }
    `;

    return (
        <div className="screenContainer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '90vh' }}>
            <style>{glassStyles}</style>
            <div className="verify-card">
                <div style={{ fontSize: '50px', marginBottom: '20px' }}>✉️</div>
                <h1 className="heading" style={{ fontSize: '26px', marginBottom: '10px' }}>Verify Your Email</h1>
                <p className="subHeading" style={{ color: '#888', fontSize: '14px', lineHeight: '1.5' }}>
                    We sent a verification link to: <br/>
                    <strong style={{ color: '#FFD700', fontSize: '16px' }}>{currentUser?.email}</strong>
                </p>

                <div style={{ background: 'rgba(255, 215, 0, 0.03)', border: '1px dashed rgba(255, 215, 0, 0.2)', padding: '15px', borderRadius: '14px', marginTop: '20px' }}>
                    <p style={{ color: '#CCC', fontSize: '13px', margin: 0 }}>
                        Please check your <strong style={{ color: '#FFF' }}>Inbox</strong> or <strong style={{ color: '#FFF' }}>Spam</strong> folder and click the link to activate your account.
                    </p>
                </div>

                <button className="verify-main-btn" onClick={handleCheckVerification} disabled={isChecking}>
                    {isChecking ? 'Checking Status...' : 'I Have Verified My Email'}
                </button>

                <div style={{ marginTop: '35px', paddingTop: '25px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <p style={{ color: '#666', fontSize: '12px', marginBottom: '15px' }}>Didn't receive the email?</p>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '10px' }}>
                        <button className="secondary-btn" onClick={handleResend} disabled={isSending}>
                            {isSending ? 'Sending...' : 'Resend Email'}
                        </button>
                        <button className="secondary-btn" onClick={handleLogout} style={{ color: '#EF4444' }}>
                            Logout
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default VerifyEmailScreen;