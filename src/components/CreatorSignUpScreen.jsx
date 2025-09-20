import React, { useState } from 'react';
import { auth, db } from '../firebase'; // Import auth and db from your firebase config
import { createUserWithEmailAndPassword, sendEmailVerification } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';

const CreatorSignUpScreen = ({ showMessage, setActiveScreen }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [creatorName, setCreatorName] = useState('');
    const [bio, setBio] = useState('');
    const [selectedCategories, setSelectedCategories] = useState([]);
    const [existingWorkLink, setExistingWorkLink] = useState('');
    const [agreedToTerms, setAgreedToTerms] = useState(false);
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
            await sendEmailVerification(user);
            
            const creatorRef = doc(db, "creators", user.uid);
            // This ensures every new creator has the necessary count fields, preventing future data integrity problems.
            await setDoc(creatorRef, { 
                email: user.email, 
                creatorName: creatorName, 
                bio: bio, 
                categories: selectedCategories, 
                existingWorkLink: existingWorkLink, 
                profilePictureUrl: '', 
                createdAt: new Date().toISOString(), 
                role: 'creator', 
                banned: false,
                followerCount: 0,
                followingCount: 0
            });
            
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
                    <label htmlFor="password" className="formLabel">Password:</label>
                    <input type="password" id="password" className="formInput" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" />
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
                        <label htmlFor="agreeTerms" style={{cursor: 'pointer'}}>
                            I agree to the <a href="#" className="termsLink" onClick={(e) => { e.preventDefault(); showMessage('Simulating opening Creator Terms...'); }}>Creator Terms & Conditions</a>.
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