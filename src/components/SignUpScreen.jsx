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

    const createProfile = async (user) => {
        const createUserProfile = httpsCallable(functions, 'createUserProfile');
        await createUserProfile({
            uid: user.uid,
            email: user.email,
            role: 'user',
            displayName: displayName || user.displayName || ''
        });
    };

    const executeSignUpLogic = async (isGoogle = false) => {
        setIsLoading(true);
        try {
            let user;
            if (isGoogle) {
                const credential = await signInWithPopup(auth, googleProvider);
                user = credential.user;
                // The Cloud Function createUserProfile already handles creation safely [1]
                await createProfile(user);
            } else {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                user = userCredential.user;
                await createProfile(user);
                await sendEmailVerification(user);
            }

            // REDUNDANT SETDOC REMOVED: This was causing a race condition error with the backend [1]

            if (isGoogle) {
                showMessage(`Welcome to NVA Network!`);
                // No need to manually set screen; App.jsx listener will detect the new profile and route you [1]
            } else {
                showMessage(`Account created! Please check your inbox to verify your email.`);
                setActiveScreen('VerifyEmail');
            }
        } catch (error) {
            console.error("Error signing up:", error);
            let errorMessage = "Failed to sign up. Please try again.";
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = "This email is already in use. Please log in instead.";
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = "Invalid email address format.";
            } else if (error.code === 'auth/weak-password') {
                errorMessage = "Password is too weak.";
            } else if (error.code === 'auth/popup-closed-by-user') {
                errorMessage = "Sign-in popup was closed.";
            } else if (error.code === 'auth/account-exists-with-different-credential') {
                errorMessage = "Account exists with different sign-in method.";
            }
            showMessage(errorMessage);
        } finally {
            setIsLoading(false);
        }
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

        executeSignUpLogic(false);
    };

    const handleGoogleSignUp = async () => {
        executeSignUpLogic(true);
    };

    const signupStyles = `
        .auth-card-container {
            max-width: 480px;
            width: 100%;
            margin: 40px auto;
            background: rgba(15, 15, 15, 0.7);
            border: 1px solid rgba(255, 215, 0, 0.15);
            border-radius: 20px;
            padding: 40px;
            box-shadow: 0 15px 40px rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(12px);
            -webkit-backdrop-filter: blur(12px);
            text-align: center;
        }
        .auth-input-group {
            position: relative;
            margin-bottom: 20px;
            text-align: left;
        }
        .auth-input-field {
            width: 100%;
            background: rgba(255, 255, 255, 0.03);
            border: 1px solid rgba(255, 255, 255, 0.08);
            color: #FFF;
            padding: 14px 16px;
            border-radius: 10px;
            font-size: 14px;
            outline: none;
            transition: all 0.25s ease;
        }
        .auth-input-field:focus {
            border-color: #FFD700;
            background: rgba(255, 215, 0, 0.02);
            box-shadow: 0 0 12px rgba(255, 215, 0, 0.15);
        }
        .google-auth-btn {
            width: 100%;
            padding: 14px;
            background: #FFFFFF;
            color: #0A0A0A;
            border: none;
            border-radius: 10px;
            font-weight: 700;
            font-size: 14px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
            margin-bottom: 24px;
            transition: transform 0.2s, box-shadow 0.2s;
        }
        .google-auth-btn:hover {
            box-shadow: 0 0 15px rgba(255, 255, 255, 0.3);
            transform: translateY(-1px);
        }
        .auth-divider {
            display: flex;
            align-items: center;
            gap: 15px;
            margin-bottom: 24px;
        }
        .auth-divider-line {
            flex: 1;
            height: 1px;
            background: rgba(255, 255, 255, 0.1);
        }
        .auth-divider-text {
            color: #666;
            font-size: 12px;
            text-transform: uppercase;
            font-weight: 700;
            letter-spacing: 0.05em;
        }
        .auth-submit-btn {
            width: 100%;
            padding: 14px;
            background: #FFD700;
            color: #0A0A0A;
            border: none;
            border-radius: 10px;
            font-size: 15px;
            font-weight: 800;
            cursor: pointer;
            text-transform: uppercase;
            letter-spacing: 0.03em;
            transition: all 0.2s;
        }
        .auth-submit-btn:hover {
            background: #FFEA50;
            box-shadow: 0 0 20px rgba(255, 215, 0, 0.25);
        }
        .auth-submit-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        .auth-footer-link {
            color: #888;
            font-size: 13px;
            margin-top: 20px;
            display: block;
            text-decoration: none;
        }
        .auth-footer-link a {
            color: #FFD700;
            font-weight: 700;
            text-decoration: none;
            margin-left: 4px;
        }
        .auth-footer-link a:hover {
            text-shadow: 0 0 8px rgba(255, 215, 0, 0.4);
        }
        .custom-select-wrapper {
            position: relative;
            width: 100%;
        }
        .custom-select-wrapper select {
            appearance: none;
            -webkit-appearance: none;
            cursor: pointer;
        }
        .custom-select-wrapper select option {
            background-color: #111111; /* Forces dropdown list background dark */
            color: #FFFFFF;            /* Forces option text visible */
        }
        .custom-select-arrow {
            position: absolute;
            right: 16px;
            top: 50%;
            transform: translateY(-50%);
            color: #FFD700;
            pointer-events: none;
            font-size: 10px;
        }
    `;

    return (
        <>
            <style>{signupStyles}</style>
            <div className="screenContainer" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '90vh', padding: '20px 0' }}>
                <div className="auth-card-container">
                    <p className="heading" style={{ fontSize: '28px', marginBottom: '8px', color: '#FFF' }}>Join NVA Network</p>
                    <p className="subHeading" style={{ marginBottom: '32px', fontSize: '13px', color: '#888' }}>
                        Sign up to access exclusive Caribbean content, film classes, and connect with creators.
                    </p>

                    {/* Google Sign-Up */}
                    <button type="button" className="google-auth-btn" onClick={handleGoogleSignUp} disabled={isLoading}>
                        <svg width="18" height="18" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                        </svg>
                        Continue with Google
                    </button>

                    <div className="auth-divider">
                        <div className="auth-divider-line"></div>
                        <span className="auth-divider-text">or email registration</span>
                        <div className="auth-divider-line"></div>
                    </div>

                    {/* Registration Form */}
                    <form onSubmit={handleEmailSignUp}>
                        <div className="auth-input-group">
                            <label htmlFor="signupEmail" className="formLabel" style={{ marginBottom: '6px', fontSize: '11px', textTransform: 'uppercase', color: '#888', fontWeight: '700' }}>Email Address</label>
                            <input
                                type="email"
                                id="signupEmail"
                                className="auth-input-field"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoComplete="email"
                                disabled={isLoading}
                            />
                        </div>

                        <div className="auth-input-group">
                            <label htmlFor="signupName" className="formLabel" style={{ marginBottom: '6px', fontSize: '11px', textTransform: 'uppercase', color: '#888', fontWeight: '700' }}>Display Name (Optional)</label>
                            <input
                                type="text"
                                id="signupName"
                                className="auth-input-field"
                                value={displayName}
                                onChange={(e) => setDisplayName(e.target.value)}
                                placeholder="How you want to be known"
                                autoComplete="name"
                                disabled={isLoading}
                            />
                        </div>

                        <div className="auth-input-group">
                            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '6px' }}>
                                <label htmlFor="signupPassword" className="formLabel" style={{ margin: '0 10px 0 0', fontSize: '11px', textTransform: 'uppercase', color: '#888', fontWeight: '700' }}>Password</label>
                                <button
                                    type="button"
                                    onClick={() => setIsPasswordVisible(prev => !prev)}
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: '0', display: 'flex', alignItems: 'center' }}
                                    aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                                >
                                    {isPasswordVisible ? (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                    ) : (
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>
                                    )}
                                </button>
                            </div>
                            <input
                                type={isPasswordVisible ? 'text' : 'password'}
                                id="signupPassword"
                                className="auth-input-field"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                autoComplete="new-password"
                                disabled={isLoading}
                            />
                            <p className="smallText" style={{ color: '#FFD700', marginTop: '6px', fontSize: '11px', fontWeight: '600' }}>
                                Must be 8+ characters with a number and capital letter.
                            </p>
                        </div>

                        <div className="auth-input-group" style={{ marginBottom: '24px' }}>
                            <div className="checkboxItem" style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                <input
                                    type="checkbox"
                                    id="agreeTerms"
                                    checked={agreedToTerms}
                                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                                    required
                                    style={{ marginTop: '3px', width: '16px', height: '16px', accentColor: '#FFD700' }}
                                />
                                <label htmlFor="agreeTerms" style={{ cursor: 'pointer', fontSize: '12px', color: '#AAA', lineHeight: '1.4', textAlign: 'left' }}>
                                    I agree to the{' '}
                                    <a href="#" className="termsLink" style={{ color: '#FFD700', fontWeight: '700', textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); setActiveScreen('TermsOfService'); }}>Terms of Service</a>
                                    {' and '}
                                    <a href="#" className="termsLink" style={{ color: '#FFD700', fontWeight: '700', textDecoration: 'none' }} onClick={(e) => { e.preventDefault(); setActiveScreen('PrivacyPolicy'); }}>Privacy Policy</a>.
                                </label>
                            </div>
                        </div>

                        <button type="submit" className="auth-submit-btn" disabled={isLoading}>
                            {isLoading ? 'Creating Account...' : 'Sign Up'}
                        </button>
                    </form>

                    <span className="auth-footer-link">
                        Already have an account?
                        <a href="#" onClick={(e) => { e.preventDefault(); setActiveScreen('Login'); }}>Log In</a>
                    </span>

                    <button
                        className="button"
                        onClick={() => setActiveScreen('Home')}
                        style={{ backgroundColor: '#1A1A1A', border: '1px solid #333', marginTop: '30px', width: '100%', padding: '12px' }}
                    >
                        <span className="buttonText light">Back to Home</span>
                    </button>
                </div>
            </div>
        </>
    );
};

export default SignUpScreen;