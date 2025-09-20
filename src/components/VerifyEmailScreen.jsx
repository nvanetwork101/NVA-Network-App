import React, { useState } from 'react';
import { auth } from '../firebase'; // Import the auth instance
import { sendEmailVerification, signOut } from 'firebase/auth';

const VerifyEmailScreen = ({ currentUser, showMessage, setActiveScreen }) => {
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
            console.error("Error resending verification email:", error);
            showMessage("Failed to resend email. Please try again in a few moments.");
        } finally {
            setIsSending(false);
        }
    };

    const handleCheckVerification = async () => {
        if (!currentUser) return;
        setIsChecking(true);
        // The reload method is on the user object from auth, not the state variable
        await auth.currentUser.reload(); 
        if (auth.currentUser.emailVerified) {
            showMessage("Thank you for verifying! Redirecting...");
            // After verification, the main onAuthStateChanged in App.jsx will handle the redirect.
            // We just need to trigger a state change to make it re-check.
            // A simple navigation to Home is a good way to do this.
            setActiveScreen('Home');
        } else {
            showMessage("Email has not been verified yet. Please click the link in your email.");
        }
        setIsChecking(false);
    };

    const handleLogout = () => {
        signOut(auth);
        showMessage("You have been logged out.");
    };

    return (
        <div className="screenContainer" style={{textAlign: 'center', paddingTop: '50px'}}>
            <p className="heading">Please Verify Your Email</p>
            <p className="subHeading">A verification link has been sent to: <br/><strong style={{color: '#FFD700'}}>{currentUser?.email}</strong></p>
            <p className="paragraph" style={{color: '#AAA', maxWidth: '400px', margin: '20px auto'}}>Please check your inbox (and spam folder) and click the link to activate your account.</p>
            
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