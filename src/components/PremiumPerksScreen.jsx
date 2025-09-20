import React, { useState, useEffect } from 'react';
import { db, doc, onSnapshot } from '../firebase';

const PremiumPerksScreen = ({ setActiveScreen, currentUser, showMessage, setPledgeContext }) => {
    const [perks, setPerks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [premiumPrice, setPremiumPrice] = useState(1.99); // Default price

    useEffect(() => {
        // This listener fetches both perks and the live price
        const settingsDocRef = doc(db, "settings", "supportHubContent");
        const pricingDocRef = doc(db, "settings", "socialLinks"); // Pricing is in this doc

        const unsubPerks = onSnapshot(settingsDocRef, (docSnap) => {
            if (docSnap.exists() && Array.isArray(docSnap.data().premiumPerks)) {
                setPerks(docSnap.data().premiumPerks);
            }
        });

        const unsubPricing = onSnapshot(pricingDocRef, (docSnap) => {
            if (docSnap.exists() && typeof docSnap.data().premiumPrice === 'number') {
                setPremiumPrice(docSnap.data().premiumPrice);
            }
            setLoading(false); // Set loading to false after pricing is fetched
        });

        return () => {
            unsubPerks();
            unsubPricing();
        };
    }, []);

    const handlePledge = () => {
        if (!currentUser) {
            showMessage("Please log in or sign up to become a Premium Member.");
            setActiveScreen('Login');
            return;
        }
        
        const context = { type: 'premium', amount: premiumPrice };
        setPledgeContext(context);
        setActiveScreen('SubscriptionPledge');
    };

    return (
        <div className="screenContainer">
            <p className="heading">Premium Member Perks</p>
            <p className="subHeading">Unlock the ultimate NVA Network experience.</p>
            
            {loading ? (
                <p className="dashboardItem" style={{textAlign: 'center'}}>Loading perks...</p>
            ) : (
                perks.map((perk, index) => (
                    <div key={index} className="premiumFeatureCard">
                        <p className="premiumFeatureDescription">✓ {perk}</p>
                    </div>
                ))
            )}

            <button className="button" onClick={handlePledge} style={{marginTop: '20px'}}>
                <span className="buttonText">Become a Premium Member</span>
            </button>
            <button className="button" onClick={() => setActiveScreen('SupportUsScreen')} style={{ backgroundColor: '#3A3A3A', marginTop: '10px' }}>
                <span className="buttonText light">Back to Support Hub</span>
            </button>
        </div>
    );
};

export default PremiumPerksScreen;