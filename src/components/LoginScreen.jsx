import React, { useState } from 'react';
import { auth } from '../firebase'; // Import the auth instance from your firebase config
import { signInWithEmailAndPassword } from 'firebase/auth';

const LoginScreen = ({ showMessage, setActiveScreen, setSuspensionDetails }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await signInWithEmailAndPassword(auth, email, password);
            // On successful login, the onAuthStateChanged listener in the main App.jsx
            // will automatically handle state changes and screen redirection.
            // We don't need to call setActiveScreen here.
        } catch (error) {
            console.error("Error logging in:", error);
            let errorMessage = "Login failed. Please try again.";
            
            // This modern Firebase error code securely handles both wrong passwords and non-existent users
            // without revealing which one is the cause, preventing user enumeration attacks.
            if (error.code === 'auth/invalid-credential') {
                errorMessage = "Incorrect email or password. Please try again or reset your password.";
            }
            showMessage(errorMessage);
        }
    };

    return (
        <div className="screenContainer">
            <p className="heading">Creator Login</p>
            <p className="subHeading">Access your dashboard to manage your content and campaigns.</p>
            
            <form onSubmit={handleSubmit} className="loginForm">
                <div className="formGroup">
                    <label htmlFor="loginEmail" className="formLabel">Email:</label>
                    <input 
                        type="email" 
                        id="loginEmail" 
                        className="formInput" 
                        value={email} 
                        onChange={(e) => setEmail(e.target.value)} 
                        required 
                        autoComplete="email"
                    />
                </div>
                <div className="formGroup">
                    <label htmlFor="loginPassword" className="formLabel">Password:</label>
                    <input 
                        type="password" 
                        id="loginPassword" 
                        className="formInput" 
                        value={password} 
                        onChange={(e) => setPassword(e.target.value)} 
                        required 
                        autoComplete="current-password"
                    />
                </div>
                <button type="submit" className="button">
                    <span className="buttonText">Login</span>
                </button>
            </form>

            <p className="smallText" style={{ marginTop: '20px' }}>
                Don't have an account?{' '}
                <a href="#" className="termsLink" onClick={(e) => { e.preventDefault(); setActiveScreen('CreatorSignUp'); }}>
                    Sign Up Here
                </a>
            </p>
            
            <p className="smallText" style={{ marginTop: '10px' }}>
                <a href="#" className="termsLink" onClick={(e) => { e.preventDefault(); setActiveScreen('ForgotPassword'); }}>
                    Forgot Password?
                </a>
            </p>

            <button 
                className="button" 
                onClick={() => setActiveScreen('Home')} 
                style={{ backgroundColor: '#3A3A3A', marginTop: '30px' }}
            >
                <span className="buttonText light">Back to Home</span>
            </button>
        </div>
    );
};

export default LoginScreen;