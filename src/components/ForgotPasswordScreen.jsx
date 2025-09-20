import React, { useState } from 'react';
import { auth } from '../firebase'; // Import the auth instance from your firebase config
import { sendPasswordResetEmail } from 'firebase/auth';

const ForgotPasswordScreen = ({ showMessage, setActiveScreen }) => {
    const [email, setEmail] = useState('');
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
            // This generic message is a security best practice, as it doesn't confirm whether an email exists in the system.
            showMessage("If an account with that email exists, a password reset link has been sent.");
            setActiveScreen('Login');
        } catch (error) {
            console.error("Password reset error:", error);
            // Provide a generic error to the user for security.
            showMessage("An error occurred. Please check the email format and try again.");
        } finally {
            setIsSending(false);
        }
    };

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