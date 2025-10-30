import React, { useState } from 'react';
import { auth } from '../firebase';
import { sendPasswordResetEmail, confirmPasswordReset } from 'firebase/auth';

const ForgotPasswordScreen = ({ showMessage, setActiveScreen, actionCode }) => {
    const [email, setEmail] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [isSending, setIsSending] = useState(false);

    const handleResetRequest = async (e) => {
        e.preventDefault();
        if (!email) {
            showMessage("Please enter your email address.");
            return;
        }
        setIsSending(true);
        try {
            await sendPasswordResetEmail(auth, email);
            showMessage("If an account with that email exists, a password reset link has been sent.");
            setActiveScreen('Login');
        } catch (error) {
            console.error("Password reset error:", error);
            showMessage("An error occurred. Please check the email format and try again.");
        } finally {
            setIsSending(false);
        }
    };

    const handleConfirmReset = async (e) => {
        e.preventDefault();
        if (newPassword.length < 8 || !/\d/.test(newPassword) || !/[A-Z]/.test(newPassword)) {
            showMessage('Password must be at least 8 characters, with a number and a capital letter.');
            return;
        }
        setIsSending(true);
        try {
            await confirmPasswordReset(auth, actionCode, newPassword);
            showMessage("Password has been successfully reset! You can now log in with your new password.");
            setActiveScreen('Login');
        } catch (error) {
            console.error("Error confirming password reset:", error);
            showMessage("Failed to reset password. The link may be invalid or expired. Please try again.");
            setActiveScreen('Login');
        } finally {
            setIsSending(false);
        }
    };

    // CONDITIONAL RENDER: Check if we are in "reset" mode.
    if (actionCode) {
        return (
            <div className="screenContainer">
                <p className="heading">Set Your New Password</p>
                <form onSubmit={handleConfirmReset} className="loginForm">
                    <div className="formGroup">
                        <label htmlFor="newPassword" className="formLabel">New Password:</label>
                        <input
                            type="password"
                            id="newPassword"
                            className="formInput"
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            required
                        />
                         <p className="smallText" style={{ textAlign: 'left', color: '#FFD700', marginTop: '5px' }}>
                            Must be at least 8 characters, with a number and a capital letter.
                        </p>
                    </div>
                    <button type="submit" className="button" disabled={isSending}>
                        <span className="buttonText">{isSending ? 'Saving...' : 'Save New Password'}</span>
                    </button>
                </form>
            </div>
        );
    }

    // Default "request" mode.
    return (
        <div className="screenContainer">
            <p className="heading">Reset Your Password</p>
            <p className="subHeading">Enter your account's email address for a password reset link.</p>
            <form onSubmit={handleResetRequest} className="loginForm">
                <div className="formGroup">
                    <label htmlFor="resetEmail" className="formLabel">Email:</label>
                    <input
                        type="email"
                        id="resetEmail"
                        className="formInput"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your.email@example.com"
                        required
                        autoComplete="email"
                    />
                </div>
                <button type="submit" className="button" disabled={isSending}>
                    <span className="buttonText">{isSending ? 'Sending...' : 'Send Reset Link'}</span>
                </button>
            </form>
            <button
                className="button"
                onClick={() => setActiveScreen('Login')}
                style={{ backgroundColor: '#3A3A3A', marginTop: '20px' }}
            >
                <span className="buttonText light">Back to Login</span>
            </button>
        </div>
    );
};

export default ForgotPasswordScreen;