import React, { useState, useEffect } from 'react';
import { db, collection, doc, setDoc } from '../firebase';
import formatCurrency from '../utils/formatCurrency'; // Import the REAL formatting function

const SubscriptionPledgeScreen = ({
    showMessage,
    setActiveScreen,
    currentUser,
    creatorProfile,
    pledgeContext,
    setPledgeIdForConfirmation,
    selectedCurrency,
    currencyRates
}) => {
    const [userName, setUserName] = useState((creatorProfile?.creatorName) || (currentUser?.email.split('@')[0]) || '');
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Determine content based on the pledge context
    const isTicket = pledgeContext.type === 'eventTicket';
    const title = isTicket ? "Purchase Event Ticket" : "Get NVA Premium";
    const subtitle = isTicket ? `Ticket for: "${pledgeContext.targetEventTitle}"` : "Unlock exclusive content and an ad-free experience.";
    const priceText = isTicket ? 'one-time purchase' : 'per month';

    const handleSubmitPledge = async (e) => {
        e.preventDefault();
        if (!userName.trim()) { 
            showMessage("Please enter your name."); 
            return; 
        }
        if (!agreedToTerms) { 
            showMessage("You must agree to the terms."); 
            return; 
        }
        setIsSubmitting(true);
        
        const pledgeId = `NVA-${Date.now().toString().slice(-6).toUpperCase()}`;
        try {
            const pledgeRef = doc(db, "paymentPledges", pledgeId);
            await setDoc(pledgeRef, {
                pledgeId,
                userId: currentUser.uid,
                userName,
                userEmail: currentUser.email,
                paymentType: pledgeContext.type,
                amount: pledgeContext.amount,
                status: 'pending',
                targetEventId: pledgeContext.targetEventId || null, 
                targetEventTitle: pledgeContext.targetEventTitle || null,
                createdAt: new Date().toISOString(),
            });
            setPledgeIdForConfirmation(pledgeId);
            setActiveScreen('PendingConfirmation');
        } catch (error) {
            showMessage(`An error occurred: ${error.message}`);
            setIsSubmitting(false);
        }
    };
    
    return (
        <div className="screenContainer">
            <p className="heading">{title}</p>
            <p className="subHeading">{subtitle}</p>
            <form onSubmit={handleSubmitPledge}>
                <div className="formGroup">
                    <label htmlFor="pledgeName" className="formLabel">Your Name:</label>
                    <input type="text" id="pledgeName" className="formInput" value={userName} onChange={(e) => setUserName(e.target.value)} required />
                </div>
                <div className="premiumFeatureCard">
                    <p className="premiumFeatureTitle" style={{textAlign: 'center'}}>{isTicket ? 'Event Ticket' : 'Premium Subscription'}</p>
                    <p className="premiumFeatureDescription" style={{fontSize: '24px', fontWeight: 'bold', textAlign: 'center', color: '#FFF'}}>
                        {formatCurrency(pledgeContext.amount, selectedCurrency, currencyRates)}
                    </p>
                    <p className="premiumFeatureDescription" style={{textAlign: 'center'}}>{priceText}</p>
                </div>
                <div className="formGroup"><p className="termsText" style={{textAlign: 'left', color: '#CCC'}}>This is a manual payment process. You will be given instructions to complete your payment via MMG after submitting.</p></div>
                <div className="formGroup"><div className="checkboxItem"><input type="checkbox" id="agreeToTerms" checked={agreedToTerms} onChange={(e) => setAgreedToTerms(e.target.checked)} required /><label htmlFor="agreeToTerms">I understand and agree to the payment terms.</label></div></div>
                <button type="submit" className="button" disabled={isSubmitting}>
                    <span className="buttonText">{isSubmitting ? "Generating..." : "Submit Pledge & Get Payment Info"}</span>
                </button>
            </form>
            <button className="button" onClick={() => setActiveScreen('PremiumPerks')} style={{ backgroundColor: '#3A3A3A', marginTop: '20px' }}>
                <span className="buttonText">Back</span>
            </button>
        </div>
    );
};

export default SubscriptionPledgeScreen;