import { useState, useEffect } from 'react';
import { auth, googleProvider } from '../firebase';
import { signInWithEmailAndPassword, signInWithPopup } from 'firebase/auth';

const LoginScreen = ({ showMessage, setActiveScreen, setSuspensionDetails }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await signInWithEmailAndPassword(auth, email, password);
            // Auth listener handles navigation
        } catch (error) {
            console.error("Error logging in:", error);
            let errorMessage = "Login failed. Please try again.";
            if (error.code === 'auth/invalid-credential') {
                errorMessage = "Incorrect email or password. Please try again or reset your password.";
            }
            showMessage(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    const handleGoogleLogin = async () => {
        setIsLoading(true);
        try {
            await signInWithPopup(auth, googleProvider);
            // Auth listener in App.jsx handles navigation automatically
        } catch (error) {
            console.error("Google login error:", error);
            let errorMessage = "Google sign-in failed. Please try again.";
            if (error.code === 'auth/popup-closed-by-user') {
                errorMessage = "Sign-in popup was closed.";
            } else if (error.code === 'auth/account-exists-with-different-credential') {
                errorMessage = "An account exists with this email using a different method.";
            }
            showMessage(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="screenContainer">
            <p className="heading">Creator Login</p>
            <p className="subHeading">Access your dashboard to manage your content and campaigns.</p>
            
            {/* --- Google Sign-In Button --- */}
            <button 
                type="button"
                onClick={handleGoogleLogin}
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
                <span style={{ color: '#888', fontSize: '13px' }}>or log in with email</span>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#444' }}></div>
            </div>

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
                        disabled={isLoading}
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
                        disabled={isLoading}
                    />
                </div>
                <button type="submit" className="button" disabled={isLoading}>
                    <span className="buttonText">{isLoading ? 'Logging in...' : 'Login'}</span>
                </button>
            </form>

            <p className="smallText" style={{ marginTop: '20px' }}>
                Don't have an account?{' '}
                <a href="#" className="termsLink" onClick={(e) => { e.preventDefault(); setActiveScreen('SignUp'); }}>
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