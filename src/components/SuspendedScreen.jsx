// src/components/SuspendedScreen.jsx

import React, { useState } from 'react';
import { httpsCallable } from "firebase/functions";
import { signOut } from "firebase/auth";
import { auth, functions } from '../firebase';

function SuspendedScreen({ showMessage, setActiveScreen, suspensionDetails }) {
    const [message, setMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmitAppeal = async (e) => {
        e.preventDefault();
        if (!message.trim()) {
            showMessage("Please provide a reason for your appeal.");
            return;
        }
        setIsSubmitting(true);
        try {
            const appealFunction = httpsCallable(functions, 'submitSuspensionAppeal');
            // THE FIX: The backend now uses the user's auth token, so we only need to send the message.
            const result = await appealFunction({
                message: message
            });
            showMessage(result.data.message);
            // After successfully submitting, the user is still jailed, but we can clear the form.
            setMessage('');
        } catch (error) {
            showMessage(`Error: ${error.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    // THIS IS THE NEW, REQUIRED LOGOUT FUNCTION FOR THE EXIT PATH
    const handleReturnHome = async () => {
        await signOut(auth);
        setActiveScreen('Home');
    };

    if (!suspensionDetails) {
        setActiveScreen('Home');
        return null;
    }

    return (
        <div className="screenContainer" style={{textAlign: 'center', paddingTop: '50px'}}>
            <p className="heading" style={{color: '#DC3545'}}>Account Suspended</p>
            <p className="subHeading">
                Your account has been temporarily suspended and you cannot access app features.
            </p>
            <p className="paragraph">
                Reason: Violation of community guidelines. <br/>
                Your access will be restored on: <br/>
                <strong style={{color: '#FFD700', fontSize: '16px'}}>{suspensionDetails.expiryDate}</strong>
            </p>

            <div className="dashboardSection" style={{marginTop: '20px', textAlign: 'left'}}>
                <p className="dashboardSectionTitle">Submit an Appeal</p>
                <p className="dashboardItem" style={{color: '#AAA', lineHeight: 1.4, marginBottom: '15px'}}>
                    If you believe this was an error, you may submit one appeal for review.
                </p>
                <form onSubmit={handleSubmitAppeal}>
                    {/* Form elements remain the same */}
                    <div className="formGroup">
                        <label className="formLabel">Your Email:</label>
                        <input type="email" className="formInput" value={suspensionDetails.email} disabled />
                    </div>
                    <div className="formGroup">
                        <label className="formLabel">Reason for Appeal:</label>
                        <textarea 
                            className="formTextarea" 
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Please explain why your suspension should be reviewed." 
                            required
                        ></textarea>
                    </div>
                    <button type="submit" className="button" disabled={isSubmitting}>
                        <span className="buttonText">{isSubmitting ? 'Submitting...' : 'Submit Appeal'}</span>
                    </button>
                </form>
            </div>

            {/* THIS IS THE NEW EXIT PATH BUTTON */}
            <button
                className="button"
                onClick={handleReturnHome}
                style={{ backgroundColor: '#3A3A3A', marginTop: '30px' }}
            >
                <span className="buttonText light">Back to Home</span>
            </button>
        </div>
    );
};
export default SuspendedScreen;