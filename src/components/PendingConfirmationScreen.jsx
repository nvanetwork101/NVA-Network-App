import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import formatCurrency from '../utils/formatCurrency'; // Import the REAL formatting function

// --- Main PendingConfirmationScreen Component ---

const PendingConfirmationScreen = ({ showMessage, setActiveScreen, pledgeIdForConfirmation, currencyRates, selectedCurrency }) => {
    const [pledgeDetails, setPledgeDetails] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [mmgNumber, setMmgNumber] = useState('');

   useEffect(() => {
        // THE FIX: Only run the logic if pledgeIdForConfirmation has been passed from the parent.
        // If it's undefined, this hook will wait for the next render when the prop is available.
        if (pledgeIdForConfirmation) {
            // Fetch the MMG number from settings
            const settingsRef = doc(db, "settings", "socialLinks");
            getDoc(settingsRef).then(settingsSnap => {
                if (settingsSnap.exists()) {
                    setMmgNumber(settingsSnap.data().mmgNumber || 'Admin Not Set');
                }
            });

            // Listen for real-time updates on the pledge
            const pledgeRef = doc(db, "paymentPledges", pledgeIdForConfirmation);
            const unsubscribe = onSnapshot(pledgeRef, (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setPledgeDetails(data);
                    setIsLoading(false);
                    if (data.status === 'approved') {
                        showMessage("Payment confirmed successfully!");
                        unsubscribe(); // Stop listening once confirmed
                        setTimeout(() => setActiveScreen('Home'), 3000);
                    }
                    // This 'denied' case is handled by the 'else' block below.
                } else {
                    // This block now correctly handles a pledge that was denied (deleted).
                    showMessage("This payment pledge was denied or is no longer valid.");
                    unsubscribe();
                    setActiveScreen('Home');
                }
            });

            return () => unsubscribe();
        }
    }, [pledgeIdForConfirmation, setActiveScreen, showMessage]);

    if (isLoading) {
        return (
            <div className="screenContainer" style={{ textAlign: 'center', paddingTop: '50px' }}>
                <p className="heading">Generating Your Payment Details...</p>
            </div>
        );
    }

    if (pledgeDetails.status === 'approved') {
        return (
            <div className="screenContainer" style={{textAlign: 'center'}}>
                <p className="heading" style={{color: '#00FF00'}}>Payment Confirmed!</p>
                <p className="subHeading">Thank you for your support. Redirecting you home...</p>
            </div>
        );
    }

    return (
        <div className="screenContainer">
            <p className="heading">Complete Your Payment</p>
            <p className="subHeading" style={{color: '#FFD700'}}>Action Required</p>
            
            <div className="premiumFeatureCard" style={{textAlign: 'center'}}>
                <p className="premiumFeatureDescription" style={{marginBottom: '5px'}}>Please send the equivalent of:</p>
                <p className="premiumFeatureTitle" style={{fontSize: '32px', color: '#FFF'}}>{formatCurrency(pledgeDetails.amount, selectedCurrency, currencyRates)}</p>
                <p className="premiumFeatureDescription" style={{marginTop: '10px'}}>To our MMG account along with screenshot of your confirmed Payment Receipt:</p>
                <p className="premiumFeatureTitle" style={{fontSize: '24px'}}>{mmgNumber || 'Contact Admin for Payment Info'}</p>
            </div>

            <div className="dashboardSection" style={{marginTop: '20px'}}>
                <p className="dashboardSectionTitle">Crucial Final Step:</p>
                <p className="paragraph">
                    In the MMG "Enter Description" Field you **MUST** include the following Pledge ID.
                    Failure to do so will result in your payment not being processed.
                </p>
                <p className="heading" style={{fontSize: '28px', backgroundColor: '#0A0A0A', padding: '10px', borderRadius: '8px', border: '1px solid #FFD700', userSelect: 'all'}}>
                    {pledgeIdForConfirmation}
                </p>
            </div>

            <p className="paragraph" style={{textAlign: 'center', marginTop: '20px'}}>This screen is listening for updates. Once we manually verify your MMG transaction, this screen will automatically confirm it.</p>
             <p className="smallText">You can safely navigate away and come back later if needed.</p>

            <button className="button" onClick={() => setActiveScreen('Home')} style={{backgroundColor: '#3A3A3A', marginTop: '10px'}}>
                <span className="buttonText light">I have paid. Back to Home</span>
            </button>
        </div>
    );
};

export default PendingConfirmationScreen;