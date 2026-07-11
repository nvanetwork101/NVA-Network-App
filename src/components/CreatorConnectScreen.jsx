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
        setActiveScreen('PostOpportunityForm');
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
        <div className="screenContainer" style={{ padding: '0 0 40px 0' }}>
            <style>{`
                .casting-hero { background: linear-gradient(135deg, #111 0%, #000 100%); border: 1px solid #2A2A2A; border-radius: 16px; padding: 24px; margin-bottom: 24px; position: relative; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.8); }
                .casting-hero::before { content: ''; position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(0,255,255,0.05) 0%, transparent 60%); pointer-events: none; }
                .casting-hero-title { font-size: 28px; font-weight: 900; color: #FFF; margin: 0 0 8px 0; letter-spacing: -0.5px; text-transform: uppercase; }
                .casting-hero-sub { font-size: 14px; color: #888; margin: 0; line-height: 1.5; max-width: 600px; }
                .post-btn { background: linear-gradient(90deg, #FFD700, #FF8C00); color: #000; border: none; padding: 12px 24px; font-size: 14px; font-weight: 800; border-radius: 8px; cursor: pointer; text-transform: uppercase; letter-spacing: 0.5px; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 4px 15px rgba(255, 215, 0, 0.3); white-space: nowrap; }
                .post-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(255, 215, 0, 0.5); }
                
                .casting-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
                .casting-card { background: #0A0A0A; border: 1px solid #222; border-radius: 12px; padding: 20px; transition: all 0.3s ease; position: relative; cursor: pointer; display: flex; flex-direction: column; justify-content: space-between; min-height: 160px; overflow: hidden; }
                .casting-card:hover { transform: translateY(-4px); border-color: #00FFFF; box-shadow: 0 8px 25px rgba(0, 255, 255, 0.15); }
                .casting-card.promoted { background: linear-gradient(180deg, #1A1705 0%, #0A0A0A 100%); border-color: #FFD700; }
                .casting-card.promoted:hover { box-shadow: 0 8px 25px rgba(255, 215, 0, 0.2); }
                
                .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px; gap: 10px; }
                .card-title { font-size: 18px; font-weight: 800; color: #FFF; margin: 0; line-height: 1.3; }
                .card-provider { font-size: 12px; color: #888; margin: 4px 0 0 0; font-weight: 500; }
                .card-tags { display: flex; gap: 8px; flex-wrap: wrap; margin-top: auto; padding-top: 16px; }
                .tag { font-size: 10px; font-weight: 700; padding: 4px 10px; border-radius: 100px; text-transform: uppercase; letter-spacing: 0.5px; }
                .tag.loc { background: rgba(255,255,255,0.05); color: #CCC; border: 1px solid #333; }
                .tag.comp { background: rgba(0, 255, 255, 0.1); color: #00FFFF; border: 1px solid rgba(0, 255, 255, 0.3); }
                
                .promo-badge { position: absolute; top: 0; right: 0; background: #FFD700; color: #000; font-size: 9px; font-weight: 900; padding: 4px 12px; border-bottom-left-radius: 12px; text-transform: uppercase; letter-spacing: 1px; }
            `}</style>
            
            <div className="casting-hero">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                    <div>
                        <h1 className="casting-hero-title">The Casting Room</h1>
                        <p className="casting-hero-sub">
                            {currentUser 
                                ? "Discover opportunities for collaboration, casting, and more. Apply directly or save them for later."
                                : "Discover opportunities for collaboration, casting, and more. Sign up or log in to post and apply."
                            }
                        </p>
                    </div>
                    {currentUser && (
                        <button className="post-btn" onClick={handlePostClick}>
                            + Post Opportunity
                        </button>
                    )}
                </div>
            </div>

            {loading ? (
                <p style={{textAlign: 'center', color: '#888', fontWeight: 'bold'}}>Loading opportunities...</p>
            ) : (
                <div className="casting-grid">
                    {interleavedOpportunities.length === 0 ? (
                        <p style={{textAlign: 'center', color: '#888', gridColumn: '1 / -1'}}>No active opportunities at the moment. Check back soon!</p>
                    ) : (
                        interleavedOpportunities.map(opp => (
                            <div key={opp.id} className={`casting-card ${opp.listingTier === 'promoted' ? 'promoted' : ''}`} onClick={() => handleItemClick(opp)}>
                                {/* VIP Badge & Image Logic */}
                                {opp.listingTier === 'promoted' && <div className="promo-badge" style={{ zIndex: 2 }}>★ VIP Listing</div>}
                                {(opp.flyerImageUrl || opp.imageUrl || opp.thumbnailUrl) && (
                                    <div className="card-img-box">
                                        <img src={opp.flyerImageUrl || opp.imageUrl || opp.thumbnailUrl} alt={opp.title} />
                                    </div>
                                )}
                                
                                <div className="card-content">
                                    <div className="card-header">
                                        <div>
                                            <h3 className="card-title">{opp.title}</h3>
                                            <p className="card-provider">by {opp.providerName}</p>
                                        </div>
                                        {currentUser && (
                                            <div onClick={e => e.stopPropagation()}>
                                                <SaveOpportunityButton currentUser={currentUser} opportunityId={opp.id} showMessage={showMessage} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                
                                <div className="card-tags">
                                    <span className="tag loc">📍 {opp.location}</span>
                                    <span className="tag comp">💎 {opp.compensationType}</span>
                                </div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};

export default CreatorConnectScreen;