// src/components/CreatorConnectScreen.jsx

import React, { useState, useEffect } from 'react';
import { db, functions, httpsCallable } from '../firebase'; // <-- FIX: Import functions and httpsCallable
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import SaveOpportunityButton from './SaveOpportunityButton';

// --- Main CreatorConnectScreen Component ---

const CreatorConnectScreen = ({ showMessage, setActiveScreen, currentUser, creatorProfile, setSelectedOpportunity, setShowConfirmationModal, setConfirmationTitle, setConfirmationMessage, setOnConfirmationAction }) => {
    const [promotedOpportunities, setPromotedOpportunities] = useState([]);
    const [standardOpportunities, setStandardOpportunities] = useState([]);
    const [loading, setLoading] = useState(true);

   useEffect(() => {
        // This listener now runs for ALL users.
        setLoading(true);
        const opportunitiesRef = collection(db, "opportunities");
        const now = new Date();

        const qPromoted = query(opportunitiesRef, where("status", "==", "active"), where("listingTier", "==", "promoted"), orderBy("createdAt", "desc"));
        const unsubPromoted = onSnapshot(qPromoted, (snapshot) => {
            const freshOpportunities = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(opp => opp.expiresAt && opp.expiresAt.toDate() > now);
            setPromotedOpportunities(freshOpportunities);
        });

        const qStandard = query(opportunitiesRef, where("status", "==", "active"), where("listingTier", "==", "standard"), orderBy("createdAt", "desc"));
        const unsubStandard = onSnapshot(qStandard, (snapshot) => {
            const freshOpportunities = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(opp => opp.expiresAt && opp.expiresAt.toDate() > now);
            setStandardOpportunities(freshOpportunities);
            setLoading(false); // Set loading false only after the second query returns.
        });

        return () => {
            unsubPromoted();
            unsubStandard();
        };
    }, []); // Dependency array is now empty as it doesn't depend on user.

    // THIS IS THE NEW UNIFIED CLICK HANDLER
    const handleItemClick = (opportunity) => {
        if (!currentUser) {
            showMessage("Please log in to view opportunity details.");
            return;
        }

        // --- THIS IS THE FIX: START OF CLICK COUNT TRACKING ---
        // We do this first, as it's a background task and shouldn't delay navigation.
        const incrementClick = async () => {
            try {
                const incrementClickFunction = httpsCallable(functions, 'incrementOpportunityApplyClick');
                await incrementClickFunction({ opportunityId: opportunity.id });
            } catch (error) {
                // This can fail silently.
                console.error("Error incrementing opportunity click count:", error);
            }
        };
        incrementClick();
        // --- END OF CLICK COUNT TRACKING ---

        setSelectedOpportunity(opportunity);
        setActiveScreen('OpportunityDetails');
    };
    // ======================= END: MODIFIED CODE BLOCK =======================

    const handlePostClick = () => {
        // This logic remains the same, as the button will only be visible to logged-in users.
        const isVerified = creatorProfile?.isVerifiedAdvertiser && creatorProfile.verifiedAdvertiserExpiresAt?.toDate() > new Date();
        const isPremium = creatorProfile?.premiumExpiresAt?.toDate() > new Date();

        if (isPremium || isVerified) {
            setActiveScreen('PostOpportunityForm');
            return;
        }
        
        setConfirmationTitle("Premium Feature");
        setConfirmationMessage("Posting to Creator Connect is a Premium feature. Upgrade your account to post your opportunities.");
        setOnConfirmationAction(() => () => setActiveScreen('PremiumPerks'));
        setShowConfirmationModal(true);
    };
    
    const interleavedOpportunities = [];
    if (!loading) {
        const promotedCopy = [...promotedOpportunities];
        const standardCopy = [...standardOpportunities];
        while (promotedCopy.length > 0 || standardCopy.length > 0) {
            interleavedOpportunities.push(...promotedCopy.splice(0, 3));
            interleavedOpportunities.push(...standardCopy.splice(0, 10));
        }
    }

    // The redirecting screen is no longer necessary.

    return (
        <div className="screenContainer">
            <div className="sectionHeaderWithButton">
                <p className="heading" style={{margin: 0, textAlign: 'left'}}>Creator Connect</p>
                {/* THIS IS THE FIX: The "Post" button is now only visible to logged-in users. */}
                {currentUser && (
                    <button className="button" onClick={handlePostClick} style={{margin: 0}}><span className="buttonText">Post an Opportunity</span></button>
                )}
            </div>
            <p className="subHeading" style={{textAlign: 'left', marginBottom: '20px'}}>
                {currentUser 
                    ? "Welcome to the Hub! Premium members can post one active listing at a time. All posts are subject to review."
                    : "Discover opportunities for collaboration, casting, and more. Sign up or log in to post and save listings."
                }
            </p>
            
            {loading ? <p className="dashboardItem" style={{textAlign: 'center'}}>Loading opportunities...</p> : (
                <div className="allCampaignsList">
                    {interleavedOpportunities.length === 0 ? <p className="dashboardItem" style={{textAlign: 'center'}}>No active opportunities at the moment. Check back soon!</p> :
                        interleavedOpportunities.map(opp => (
                            <div key={opp.id} 
                                className="allCampaignsListItem" 
                                style={opp.listingTier === 'promoted' ? {border: '2px solid #FFD700', background: 'rgba(255, 215, 0, 0.05)', cursor: 'pointer'} : {cursor: 'pointer'}} 
                                onClick={() => handleItemClick(opp)}> 
                                <div className="campaignListContent">
                                    <div className="campaignListTitle" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                        <span>{opp.title}</span> 
                                        <div style={{display: 'flex', alignItems: 'center', gap: '10px'}}>
                                            {opp.listingTier === 'promoted' && <span style={{fontSize: '12px', color: '#0A0A0A', backgroundColor: '#FFD700', padding: '3px 8px', borderRadius: '10px', fontWeight: 'bold'}}>★ Promoted</span>}
                                            {currentUser && (
                                                <SaveOpportunityButton currentUser={currentUser} opportunityId={opp.id} showMessage={showMessage} />
                                            )}
                                        </div>
                                    </div>
                                    <p className="campaignListCreator" style={{marginBottom: '10px'}}>by {opp.providerName}</p>
                                    <div className="campaignListStats"><span><span className="campaignListGoal">{opp.location}</span></span><span><span className="campaignListRaised">{opp.compensationType}</span></span></div>
                                </div>
                            </div>
                        ))
                    }
                </div>
            )}
        </div>
    );
};

export default CreatorConnectScreen;