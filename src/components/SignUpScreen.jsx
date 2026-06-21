import { useState, useEffect } from 'react';
import { auth, functions, googleProvider } from '../firebase';
import { createUserWithEmailAndPassword, sendEmailVerification, signInWithPopup } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';

const SignUpScreen = ({ showMessage, setActiveScreen }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [displayName, setDisplayName] = useState('');
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const validatePassword = (pw) => {
        return pw.length >= 8 && /\d/.test(pw) && /[A-Z]/.test(pw);
    };

    const createProfile = async (user, extraData = {}) => {
        const createUserProfile = httpsCallable(functions, 'createUserProfile');
        await createUserProfile({
            uid: user.uid,
            email: user.email,
            role: 'user',
            displayName: displayName || user.displayName || '',
            ...extraData
        });
    };

    const handleEmailSignUp = async (e) => {
        e.preventDefault();
        
        if (!agreedToTerms) {
            showMessage('Please agree to the Terms & Conditions to sign up.');
            return;
        }
        if (!validatePassword(password)) {
            showMessage('Password must be at least 8 characters, with a number and a capital letter.');
            return;
        }

        setIsLoading(true);
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            await createProfile(user);
            await sendEmailVerification(user);
            showMessage(`Account created! Please check your inbox to verify your email.`);
            setActiveScreen('VerifyEmail');
        } catch (error) {
            console.error("Error signing up:", error);
            let errorMessage = "Failed to sign up. Please try again.";
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = "This email is already in use. Please log in instead.";
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = "Invalid email address format.";
            } else if (error.code === 'auth/weak-password') {
                errorMessage = "Password is too weak.";
            }
            showMessage(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleSignUp = async () => {
        setIsLoading(true);
        try {
            await signInWithPopup(auth, googleProvider);
            // Auth listener auto-creates profile + redirects
        } catch (error) {
            console.error("Google sign-up error:", error);
            let errorMessage = "Google sign-in failed. Please try again.";
            if (error.code === 'auth/popup-closed-by-user') {
                errorMessage = "Sign-in popup was closed.";
            } else if (error.code === 'auth/account-exists-with-different-credential') {
                errorMessage = "Account exists with different sign-in method.";
            }
            showMessage(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="screenContainer">
            <p className="heading">Join NVA Network</p>
            <p className="subHeading">Sign up to access exclusive Caribbean content, film classes, and connect with creators.</p>

            {/* --- Google Sign-In Button --- */}
            <button 
                type="button"
                onClick={handleGoogleSignUp}
                disabled={isLoading}
                style={{
                    width: '100%',
                    padding: '12px',
                    backgroundColor: '#fff',
                    color: '#0A0A0A',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '600',
                    fontSize: '15px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    marginBottom: '20px'
                }}
            >
                <svg width="18" height="18" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '20px' }}>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#444' }}></div>
                <span style={{ color: '#888', fontSize: '13px' }}>or sign up with email</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#444' }}></div>
            </div>

            <form onSubmit={handleEmailSignUp}>
                <div className="formGroup">
                    <label htmlFor="signupEmail" className="formLabel">Email:</label>
                    <input
                        type="email"
                        id="signupEmail"
                        className="formInput"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                    />
                </div>

                <div className="formGroup">
                    <label htmlFor="signupName" className="formLabel">Display Name (Optional):</label>
                    <input
                        type="text"
                        id="signupName"
                        className="formInput"
                        value={displayName}
                        onChange={(e) => setDisplayName(e.target.value)}
                        placeholder="How you want to be known"
                        autoComplete="name"
                    />
                </div>

                <div className="formGroup">
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                        <label htmlFor="signupPassword" className="formLabel" style={{ marginBottom: '0', marginRight: '10px' }}>Password:</label>
                        <button
                            type="button"
                            onClick={() => setIsPasswordVisible(prev => !prev)}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0' }}
                            aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                        >
                            {isPasswordVisible ? (
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            ) : (
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                            )}
                        </button>
                    </div>
                    <input
                        type={isPasswordVisible ? 'text' : 'password'}
                        id="signupPassword"
                        className="formInput"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                    />
                    <p className="smallText" style={{ textAlign: 'left', color: '#FFD700', marginTop: '5px' }}>
                        Must be 8+ characters with a number and capital letter.
                    </p>
                </div>

                <div className="formGroup">
                    <div className="checkboxItem">
                        <input
                            type="checkbox"
                            id="agreeTerms"
                            checked={agreedToTerms}
                            onChange={(e) => setAgreedToTerms(e.target.checked)}
                            required
                        />
                        <label htmlFor="agreeTerms" style={{ cursor: 'pointer', lineHeight: 1.5 }}>
                            I agree to the{' '}
                            <a href="#" className="termsLink" onClick={(e) => { e.preventDefault(); setActiveScreen('TermsOfService'); }}>Terms of Service</a>
                            {' and '}
                            <a href="#" className="termsLink" onClick={(e) => { e.preventDefault(); setActiveScreen('PrivacyPolicy'); }}>Privacy Policy</a>.
                        </label>
                    </div>
                </div>

                <button type="submit" className="button" disabled={isLoading}>
                    <span className="buttonText">{isLoading ? 'Creating Account...' : 'Sign Up'}</span>
                </button>
            </form>

            <p className="smallText" style={{ marginTop: '20px' }}>
                Already have an account?{' '}
                <a href="#" className="termsLink" onClick={(e) => { e.preventDefault(); setActiveScreen('Login'); }}>Log In</a>
            </p>

            <button
                className="button"
                onClick={() => setActiveScreen('Home')}
                style={{ backgroundColor: '#3A3A3A', marginTop: '20px' }}
            >
                <span className="buttonText light">Back to Home</span>
            </button>
        </div>
    );
};

export default SignUpScreen;