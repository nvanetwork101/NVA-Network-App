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
    const [giftMessage, setGiftMessage] = useState(''); // State for the optional gift message

    // Determine content based on the pledge context
    const isTicket = pledgeContext.type === 'eventTicket';
    const isGift = isTicket && !!pledgeContext.recipientId;

    const title = isGift ? "Gift a Ticket" : (isTicket ? "Purchase Event Ticket" : "Get NVA Premium");
    const subtitle = isGift 
        ? `You are gifting a ticket for "${pledgeContext.targetEventTitle}" to ${pledgeContext.recipientName}.`
        : (isTicket ? `Ticket for: "${pledgeContext.targetEventTitle}"` : "Unlock exclusive content and an ad-free experience.");
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
        
        // Prepare the base pledge data
        const pledgeData = {
            pledgeId,
            userId: currentUser.uid, // The buyer
            userName,
            userEmail: currentUser.email,
            paymentType: pledgeContext.type,
            amount: pledgeContext.amount,
            status: 'pending',
            targetEventId: pledgeContext.targetEventId || null, 
            targetEventTitle: pledgeContext.targetEventTitle || null,
            createdAt: new Date().toISOString(),
        };

        // If it's a gift, add the extra fields
        if (isGift) {
            pledgeData.recipientId = pledgeContext.recipientId;
            pledgeData.recipientName = pledgeContext.recipientName;
            if (giftMessage.trim()) {
                pledgeData.giftMessage = giftMessage.trim();
            }
        }

        try {
            const pledgeRef = doc(db, "paymentPledges", pledgeId);
            await setDoc(pledgeRef, pledgeData); // Save the complete data object
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
                
                {isGift && (
                    <div className="formGroup">
                        <label htmlFor="giftMessage" className="formLabel">Add a Personal Message (Optional):</label>
                        <textarea
                            id="giftMessage"
                            className="formInput"
                            value={giftMessage}
                            onChange={(e) => setGiftMessage(e.target.value)}
                            placeholder="e.g. Happy Birthday! Enjoy the show."
                            rows="3"
                            maxLength="200"
                        />
                    </div>
                )}

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