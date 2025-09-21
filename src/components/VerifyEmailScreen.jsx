import React, { useState } from 'react';
import { auth } from '../firebase'; // Import the auth instance
import { sendEmailVerification } from 'firebase/auth';

// --- THIS IS THE FIX: The component now receives 'unverifiedUser' and 'handleLogout' from App.jsx ---
const VerifyEmailScreen = ({ unverifiedUser, showMessage, setActiveScreen, handleLogout }) => {
    const [isSending, setIsSending] = useState(false);
    const [isChecking, setIsChecking] = useState(false);

    const handleResend = async () => {
        // It now uses the specific 'unverifiedUser' prop
        if (!unverifiedUser) return;
        setIsSending(true);
        showMessage("Resending verification email...");
        try {
            await sendEmailVerification(unverifiedUser);
            showMessage("A new verification email has been sent.");
        } catch (error) {
            console.error("Error resending verification email:", error);
            showMessage("Failed to resend email. Please try again in a few moments.");
        } finally {
            setIsSending(false);
        }
    };

    const handleCheckVerification = async () => {
        if (!auth.currentUser) return;
        setIsChecking(true);
        await auth.currentUser.reload();

        // --- THIS IS THE CRITICAL FIX TO RESTORE FUNCTIONALITY ---
        // After reloading, we check the status directly.
        if (auth.currentUser.emailVerified) {
            // If verified, we navigate to a neutral screen like 'Home'.
            // This navigation is ESSENTIAL to trigger the main onAuthStateChanged listener in App.jsx,
            // which will then see the newly verified user and redirect them to their correct dashboard.
            setActiveScreen('Home');
        } else {
            // If they are still not verified, we provide clear feedback.
            showMessage("Email has not been verified yet. Please click the link in your email.");
        }
        // --- END OF FIX ---
        
        setIsChecking(false);
    };

    // The component no longer has its own logout logic. It uses the main one from App.jsx.

    return (
        <div className="screenContainer" style={{textAlign: 'center', paddingTop: '50px'}}>
            <p className="heading">Please Verify Your Email</p>
            <p className="subHeading">
                You have successfully signed in, but your account is not active yet.
                <br/>A verification link was sent to: <br/><strong style={{color: '#FFD700'}}>{unverifiedUser?.email}</strong>
            </p>
            <p className="paragraph" style={{color: '#AAA', maxWidth: '400px', margin: '20px auto'}}>
                To complete your sign-up, please click the link in the email.
                <br/><strong style={{color: '#FFD700'}}>If you don't see it, please check your spam or junk folder.</strong>
            </p>
            
            <button className="button" onClick={handleCheckVerification} disabled={isChecking}>
                <span className="buttonText">{isChecking ? 'Checking...' : 'I Have Verified My Email'}</span>
            </button>
            
            <p className="smallText" style={{marginTop: '20px'}}>Didn't receive an email?</p>
            
            <div style={{display: 'flex', justifyContent: 'center', gap: '15px', marginTop: '10px'}}>
                <button className="button" onClick={handleResend} disabled={isSending} style={{backgroundColor: '#3A3A3A', margin: 0}}>
                    <span className="buttonText light">{isSending ? 'Sending...' : 'Resend Verification Email'}</span>
                </button>
                <button className="button" onClick={handleLogout} style={{backgroundColor: '#555', margin: 0}}>
                    <span className="buttonText light">Logout</span>
                </button>
            </div>
        </div>
    );
};

export default VerifyEmailScreen;