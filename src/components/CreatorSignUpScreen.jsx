import React, { useState } from 'react';
import { auth, functions } from '../firebase'; // Import auth and functions
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions'; // Import the httpsCallable function

const CreatorSignUpScreen = ({ showMessage, setActiveScreen }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [creatorName, setCreatorName] = useState('');
    const [bio, setBio] = useState('');
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [existingWorkLink, setExistingWorkLink] = useState('');
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const availableCategories = ['Skits', 'Short Films', 'Interviews', 'Live Premieres', 'Music', 'Documentary', 'Other'];

    const handleCategoryChange = (e) => {
        const { value, checked } = e.target;
        setSelectedCategories(prev => checked ? [...prev, value] : prev.filter(cat => cat !== value));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!agreedToTerms) {
            showMessage('Please agree to the Creator Terms & Conditions to sign up.');
            return;
        }
        if (password.length < 8 || !/\d/.test(password) || !/[A-Z]/.test(password)) {
            showMessage('Password must be at least 8 characters, with a number and a capital letter.');
            return;
        }

        try {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Call the secure Cloud Function to create the creator profile document.
            const createUserProfile = httpsCallable(functions, 'createUserProfile');
            await createUserProfile({
                uid: user.uid,
                email: user.email,
                role: 'creator', // Specify the role for this sign-up screen
                creatorName: creatorName,
                bio: bio,
                categories: selectedCategories,
                existingWorkLink: existingWorkLink
            });

            // NOW, send the verification email.
            await sendEmailVerification(user);

            showMessage(`Creator "${creatorName}" signed up! Please check your inbox to verify your account.`);
            setActiveScreen('VerifyEmail'); // Redirect to a screen prompting them to check their email
        } catch (error) {
            console.error("Error signing up creator:", error);
            let errorMessage = "Failed to sign up. Please try again.";
            if (error.code === 'auth/email-already-in-use') {
                errorMessage = "This email is already in use.";
            }
            showMessage(errorMessage);
        }
    };

    return (
        <div className="screenContainer">
            <p className="heading">Join NVA Network as a Creator!</p>
            <form onSubmit={handleSubmit}>
                <div className="formGroup">
                    <label htmlFor="email" className="formLabel">Email:</label>
                    <input type="email" id="email" className="formInput" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                </div>
                <div className="formGroup">
                    <div style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
                        <label htmlFor="password" className="formLabel" style={{ marginBottom: '0', marginRight: '10px' }}>Password:</label>
                        <button
                            type="button"
                            onClick={() => setIsPasswordVisible(prev => !prev)}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                cursor: 'pointer',
                                padding: '0'
                            }}
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
                        id="password"
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
                    <label htmlFor="creatorName" className="formLabel">Creator Name (Public):</label>
                    <input type="text" id="creatorName" className="formInput" value={creatorName} onChange={(e) => setCreatorName(e.target.value)} required autoComplete="nickname" />
                </div>
                <div className="formGroup">
                    <label htmlFor="bio" className="formLabel">Brief Bio/Description:</label>
                    <textarea id="bio" className="formTextarea" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell us about yourself!" required ></textarea>
                </div>
                <div className="checkboxGroup">
                    <p className="checkboxLabel">Content Categories:</p>
                    {availableCategories.map((cat) => (
                        <div key={cat} className="checkboxItem">
                            <input type="checkbox" id={`cat-${cat}`} value={cat} checked={selectedCategories.includes(cat)} onChange={handleCategoryChange} />
                            <label htmlFor={`cat-${cat}`}>{cat}</label>
                        </div>
                    ))}
                </div>
                <div className="formGroup">
                    <label htmlFor="existingWork" className="formLabel">Link to Existing Work (Optional):</label>
                    <input type="url" id="existingWork" className="formInput" value={existingWorkLink} onChange={(e) => setExistingWorkLink(e.target.value)} placeholder="e.g., YouTube channel" />
                </div>
                <div className="formGroup">
                    <div className="checkboxItem">
                        <input type="checkbox" id="agreeTerms" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} required />
                        <label htmlFor="agreeTerms" style={{cursor: 'pointer', lineHeight: 1.5}}>
                        I agree to the{' '}
                        <a href="#" className="termsLink" onClick={(e) => { e.preventDefault(); setActiveScreen('TermsOfService'); }}>Terms of Service</a>
                        {' and '}
                        <a href="#" className="termsLink" onClick={(e) => { e.preventDefault(); setActiveScreen('PrivacyPolicy'); }}>Privacy Policy</a>.
                    </label>
                    </div>
                </div>
                <button type="submit" className="button">
                    <span className="buttonText">Sign Up as Creator</span>
                </button>
            </form>
        </div>
    );
};

export default CreatorSignUpScreen;