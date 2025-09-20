import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

const AdvertiserPerksScreen = ({ setActiveScreen }) => {
    const [perks, setPerks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const docRef = doc(db, "settings", "supportHubContent");
        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists() && Array.isArray(docSnap.data().advertiserPerks)) {
                setPerks(docSnap.data().advertiserPerks);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);
    
    return (
        <div className="screenContainer">
            <p className="heading" style={{color: '#00FFFF'}}>Verified Advertiser Perks</p>
            <p className="subHeading">Maximize your brand's visibility and connect with top talent.</p>
            
            {loading ? (
                <p className="dashboardItem" style={{textAlign: 'center'}}>Loading perks...</p>
            ) : (
                perks.map((perk, index) => (
                    <div key={index} className="premiumFeatureCard" style={{borderLeft: '3px solid #00FFFF'}}>
                        <p className="premiumFeatureDescription">✓ {perk}</p>
                    </div>
                ))
            )}

             <button className="button" onClick={() => setActiveScreen('Contact')} style={{marginTop: '20px', backgroundColor: '#0A0A0A', border: '1px solid #00FFFF'}}>
                <span className="buttonText" style={{color: '#00FFFF'}}>Contact Us for Verification</span>
            </button>
            <button className="button" onClick={() => setActiveScreen('SupportUsScreen')} style={{ backgroundColor: '#3A3A3A', marginTop: '10px' }}>
                <span className="buttonText light">Back to Support Hub</span>
            </button>
        </div>
    );
};

export default AdvertiserPerksScreen;