// src/components/SupportUsScreen.jsx

import React, { useState, useEffect } from 'react';
import { db, doc, onSnapshot, getDoc } from '../firebase';

const SupportUsScreen = ({
    setActiveScreen,
    currentUser,
    creatorProfile,
    showMessage,
    setPledgeContext,
    liveEvent, // The general billboard event (fallback)
    pledgeContext // The specific event passed from DiscoverScreen (priority)
}) => {
    const [content, setContent] = useState(null);
    const [loading, setLoading] = useState(true);
    const [premiumPrice, setPremiumPrice] = useState(1.99);
    
    // --- NEW LOGIC: Determine the correct event to display ---
    // If we have a specific event from pledgeContext, use it. Otherwise, fall back to the general liveEvent.
    const eventForPurchase = pledgeContext?.type === 'eventTicket' ? pledgeContext : liveEvent;

    useEffect(() => {
        const contentRef = doc(db, "settings", "supportHubContent");
        const pricingRef = doc(db, "settings", "socialLinks");

        const unsubContent = onSnapshot(contentRef, (snap) => setContent(snap.exists() ? snap.data() : {}));
        const unsubPricing = onSnapshot(pricingRef, (snap) => setPremiumPrice(snap.exists() ? snap.data().premiumPrice || 1.99 : 1.99));
        
        Promise.all([getDoc(contentRef), getDoc(pricingRef)]).then(() => setLoading(false));

        return () => { unsubContent(); unsubPricing(); };
    }, []);

    const handlePledge = (type) => {
        if (!currentUser) {
            showMessage("Please log in or sign up to continue.");
            setActiveScreen('Login');
            return;
        }

        let context;
        if (type === 'premium') {
            context = { type: 'premium', amount: premiumPrice };
        } else if (type === 'eventTicket') {
            // Use the determined eventForPurchase for creating the final pledge
            if (!eventForPurchase?.isTicketed && !eventForPurchase?.amount) {
                showMessage("There is no ticketed event currently available for purchase.");
                return;
            }
            context = {
                type: 'eventTicket',
                amount: eventForPurchase.amount || eventForPurchase.ticketPrice || 0,
                targetEventId: eventForPurchase.targetEventId || eventForPurchase.eventId,
                targetEventTitle: eventForPurchase.targetEventTitle || eventForPurchase.eventTitle
            };
        } else { return; }
        
        // THIS IS THE FIX: Only set the context. The useEffect in App.jsx
        // will now handle the navigation automatically, preventing the race condition.
        setPledgeContext(context);
    };

    const isVerified = creatorProfile?.isVerifiedAdvertiser && creatorProfile.verifiedAdvertiserExpiresAt?.toDate() > new Date();

    if (loading || !content) {
        return <div className="screenContainer" style={{ textAlign: 'center' }}><p className="heading">Loading...</p></div>;
    }

    return (
        <div className="screenContainer">
            <p className="heading">{content.hubTitle || "Support the NVA Network"}</p>
            <p className="subHeading">{content.hubSubtitle || "Your support empowers creators."}</p>

            <div className="allCampaignsList">
                 {/* --- THIS IS THE FIX (PART 2) --- */}
                {/* The entire "Buy Ticket" section is now conditional on a valid, ticketed liveEvent. */}
                {liveEvent?.isTicketed && (
                    <div className="allCampaignsListItem" onClick={() => handlePledge('eventTicket')} style={{cursor: 'pointer', borderLeft: '5px solid #00FF00'}}>                 
                
                        <div className="campaignListContent">
                            <p className="campaignListTitle" style={{color: '#00FF00'}}>
                                Buy Ticket: {liveEvent.eventTitle || "Live Premiere Event"}
                            </p>
                            <p className="campaignListDescription">
                                Purchase a single-use ticket for our next live premiere event for ${liveEvent.ticketPrice?.toFixed(2) || 'see details'}.
                            </p>
                        </div>
                    </div>
                )}

                <div className="allCampaignsListItem" onClick={() => setActiveScreen('PremiumPerks')} style={{borderLeft: '5px solid #FFD700'}}>
                    <div className="campaignListContent">
                        <p className="campaignListTitle">{content.card1Title || "Become a Premium Member"}</p>
                        <p className="campaignListDescription">{content.card1Desc || "Get exclusive access and support the platform."}</p>
                    </div>
                </div>

                <div className="allCampaignsListItem" onClick={() => setActiveScreen('AdvertiserPerks')} style={{borderLeft: '5-px solid #00FFFF'}}>
                    <div className="campaignListContent">
                        <p className="campaignListTitle" style={{color: '#00FFFF'}}>{content.card2Title || "Become a Verified Advertiser"}</p>
                        <p className="campaignListDescription">{content.card2Desc || "Promote your brand and post to Creator Connect."}</p>
                    </div>
                </div>

                <div className="allCampaignsListItem" onClick={() => setActiveScreen('AllCampaigns')} style={{borderLeft: '5px solid #CCC'}}>
                    <div className="campaignListContent">
                        <p className="campaignListTitle" style={{color: '#FFF'}}>{content.card3Title || "Support a Creator Campaign"}</p>
                        <p className="campaignListDescription">{content.card3Desc || "Directly fund a creator's project."}</p>
                    </div>
                </div>

                <div style={{borderTop: '1px solid #444', margin: '20px 0'}}></div>

                <div className="allCampaignsListItem" onClick={() => {
                        if (isVerified) { setActiveScreen('BookStatus'); } 
                        else if (!currentUser) { showMessage("Please log in to book a slot."); setActiveScreen('Login'); } 
                        else { showMessage("This feature is for Verified Advertisers only."); setActiveScreen('AdvertiserPerks'); }
                    }} 
                    style={{cursor: 'pointer', opacity: (currentUser && isVerified) ? 1 : 0.6}}>
                    <div className="campaignListContent">
                        <p className="campaignListTitle" style={{color: '#FFF'}}>Book Billboard Slot</p>
                        <p className="campaignListDescription">Promote your brand on the homepage. (Verified Advertisers Only)</p>
                    </div>
                </div>
            </div>
            
            <button className="button" onClick={() => setActiveScreen('Home')} style={{ backgroundColor: '#3A3A3A', marginTop: '30px' }}>
                <span className="buttonText light">Back to Home</span>
            </button>
        </div>
    );
};

export default SupportUsScreen;