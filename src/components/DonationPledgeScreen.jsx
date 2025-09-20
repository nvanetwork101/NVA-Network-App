import React, { useState, useEffect } from 'react'; // Correctly import useEffect
import { db } from '../firebase';
import { doc, collection, setDoc } from 'firebase/firestore';
import formatCurrency from '../utils/formatCurrency'; // Correctly import at the top level

const DonationPledgeScreen = ({ showMessage, setActiveScreen, currentUser, creatorProfile, pledgeContext, setPledgeIdForConfirmation, currencyRates, selectedCurrency }) => {
    const [amount, setAmount] = useState('');
    const [userName, setUserName] = useState(creatorProfile?.creatorName || currentUser?.email.split('@')[0] || '');
    const [agreedToTerms, setAgreedToTerms] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Safety check to prevent rendering without proper context from the previous screen
    if (!pledgeContext || pledgeContext.type !== 'donation') {
        // Silently navigate away if the context is wrong
        useEffect(() => setActiveScreen('AllCampaigns'), []);
        return null;
    }

    const handleSubmitPledge = async (e) => {
        e.preventDefault();
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            showMessage("Please enter a valid, positive donation amount.");
            return;
        }
        if (!userName.trim()) {
            showMessage("Please enter your name.");
            return;
        }
        if (!agreedToTerms) {
            showMessage("You must agree to the payment terms.");
            return;
        }

        setIsSubmitting(true);
        const pledgeId = `NVA-${Date.now().toString().slice(-6).toUpperCase()}`;

        try {
            const pledgeRef = doc(collection(db, "paymentPledges"), pledgeId);
            await setDoc(pledgeRef, {
                pledgeId,
                userId: currentUser.uid,
                userName: userName.trim(),
                userEmail: currentUser.email,
                paymentType: 'donation',
                amount: parsedAmount,
                status: 'pending',
                targetCampaignId: pledgeContext.campaignId,
                targetCampaignTitle: pledgeContext.campaignTitle,
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
            <p className="heading">Support Campaign</p>
            <p className="subHeading">You are supporting "{pledgeContext.campaignTitle}" by {pledgeContext.creatorName}.</p>
            
            <form onSubmit={handleSubmitPledge}>
                <div className="formGroup">
                    {amount > 0 && (
                        <p style={{ textAlign: 'center', color: '#FFD700', fontWeight: 'bold', fontSize: '18px', marginBottom: '10px' }}>
                            {formatCurrency(parseFloat(amount), selectedCurrency, currencyRates)}
                        </p>
                    )}
                    <label htmlFor="donationAmount" className="formLabel">Donation Amount (USD):</label>
                    <input
                        type="number"
                        id="donationAmount"
                        className="formInput"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        min="1"
                        step="any"
                        placeholder="e.g., 10.00"
                        required
                    />
                </div>

                {/* --- THIS IS THE FIX: START OF NEW TRANSPARENCY BLOCK --- */}
                {parseFloat(amount) > 0 && (
                    <div className="invoice-style-box" style={{ margin: '20px 0', backgroundColor: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '8px', border: '1px solid #444' }}>
                        <div className="invoice-row" style={{display: 'flex', justifyContent: 'space-between', marginBottom: '10px'}}>
                            <span>Your Donation:</span>
                            <span>{formatCurrency(parseFloat(amount), selectedCurrency, currencyRates)}</span>
                        </div>
                        <div className="invoice-row" style={{display: 'flex', justifyContent: 'space-between', marginBottom: '10px'}}>
                            <span>Platform Fee (7%):</span>
                            <span style={{color: '#DC3545'}}>-{formatCurrency(parseFloat(amount) * 0.07, selectedCurrency, currencyRates)}</span>
                        </div>
                        <hr style={{borderColor: '#444', margin: '10px 0'}} />
                        <div className="invoice-row" style={{display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem'}}>
                            <strong>Creator Receives:</strong>
                            <strong style={{color: '#00FF00'}}>{formatCurrency(parseFloat(amount) * 0.93, selectedCurrency, currencyRates)}</strong>
                        </div>
                    </div>
                )}
                {/* --- END OF NEW TRANSPARENCY BLOCK --- */}

                <div className="formGroup">
                    <label htmlFor="pledgeName" className="formLabel">Your Name:</label>
                    <input
                        type="text"
                        id="pledgeName"
                        className="formInput"
                        value={userName}
                        onChange={(e) => setUserName(e.target.value)}
                        required
                    />
                </div>

                <div className="formGroup">
                    <p className="termsText" style={{textAlign: 'left', color: '#CCC'}}>
                        This is a manual payment process. After submitting your pledge, you will be given instructions to complete your payment via MMG.
                    </p>
                </div>

                <div className="formGroup">
                    <div className="checkboxItem">
                        <input
                            type="checkbox"
                            id="agreeToTerms"
                            checked={agreedToTerms}
                            onChange={(e) => setAgreedToTerms(e.target.checked)}
                            required
                        />
                        <label htmlFor="agreeToTerms" style={{cursor: 'pointer'}}>I understand and agree to the payment terms.</label>
                    </div>
                </div>

                <button type="submit" className="button" disabled={isSubmitting}>
                    <span className="buttonText">{isSubmitting ? "Generating..." : "Submit Pledge & Get Payment Info"}</span>
                </button>
            </form>

            <button
                className="button"
                onClick={() => setActiveScreen('CampaignDetails')}
                style={{ backgroundColor: '#3A3A3A', marginTop: '20px' }}
            >
                <span className="buttonText light">Back to Campaign</span>
            </button>
        </div>
    );
};

export default DonationPledgeScreen;