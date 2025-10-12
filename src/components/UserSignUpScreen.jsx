import React, { useState } from 'react';
import { auth, db } from '../firebase'; // Import auth and db from your firebase config
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

const UserSignUpScreen = ({ showMessage, setActiveScreen }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [agreedToTerms, setAgreedToTerms] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!agreedToTerms) {
            showMessage('Please agree to the Terms & Conditions to sign up.');
            return;
        }
        if (password.length < 8 || !/\d/.test(password) || !/[A-Z]/.test(password)) {
            showMessage('Password must be at least 8 characters, with a number and a capital letter.');
            return;
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;
            await sendEmailVerification(user);
            const creatorRef = doc(db, "creators", user.uid);
            await setDoc(creatorRef, {
                email: user.email,
                creatorName: user.email.split('@')[0] || "", // Default name from email
                bio: "",
                categories: [],
                existingWorkLink: "",
                profilePictureUrl: '',
                createdAt: new Date().toISOString(),
                role: 'user', // Explicitly set role to 'user'
                banned: false,
                followerCount: 0,
                followingCount: 0
            });

            showMessage(`Account created successfully for ${email}! Please check your inbox to verify your account.`);
            setActiveScreen('VerifyEmail');
        }
        catch (error) {
            console.error("Error signing up user:", error);
            let errorMessage = "Failed to sign up. Please try again.";
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = "This email is already in use. Please use a different email or sign in.";
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = "Invalid email address format.";
            } else if (error.code === 'auth/weak-password') {
                errorMessage = "Password is too weak. Please choose a stronger password.";
            }
            showMessage(errorMessage);
        }
    };

    return (
        <div className="screenContainer">
            <p className="heading">Create Your Account</p>
            <p className="subHeading">Sign up to access exclusive content and support creators!</p>

            <form onSubmit={handleSubmit}>
                <div className="formGroup">
                    <label htmlFor="userEmail" className="formLabel">Email:</label>
                    <input
                        type="email"
                        id="userEmail"
                        className="formInput"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        autoComplete="email"
                    />
                </div>

                <div className="formGroup">
                    <label htmlFor="userPassword" className="formLabel">Password:</label>
                    <input
                        type="password"
                        id="userPassword"
                        className="formInput"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        autoComplete="new-password"
                    />
                    <p className="smallText" style={{ textAlign: 'left', color: '#FFD700', marginTop: '5px' }}>
                        Password must be at least 8 characters long, include at least one number and one capital letter.
                    </p>
                </div>

                <div className="formGroup">
                    <div className="checkboxItem">
                        <input
                            type="checkbox"
                            id="agreeUserTerms"
                            checked={agreedToTerms}
                            onChange={(e) => setAgreedToTerms(e.target.checked)}
                            required
                        />
                        <label htmlFor="agreeUserTerms" style={{cursor: 'pointer', lineHeight: 1.5}}>
                        I agree to the{' '}
                        <a href="#" className="termsLink" onClick={(e) => { e.preventDefault(); setActiveScreen('TermsOfService'); }}>Terms of Service</a>
                        {' and '}
                        <a href="#" className="termsLink" onClick={(e) => { e.preventDefault(); setActiveScreen('PrivacyPolicy'); }}>Privacy Policy</a>.
                        </label>
                    </div>
                </div>

                <button type="submit" className="button">
                    <span className="buttonText">Sign Up</span>
                </button>
            </form>

            <p className="smallText" style={{ marginTop: '20px' }}>
                Already have an account?{' '}
                <a href="#" className="termsLink" onClick={(e) => { e.preventDefault(); setActiveScreen('Login'); }}>Login Here</a>
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

export default UserSignUpScreen;