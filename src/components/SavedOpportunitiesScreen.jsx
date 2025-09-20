// src/components/SavedOpportunitiesScreen.jsx

import React, { useState, useEffect } from 'react';
import { db, collection, query, where, onSnapshot, getDocs } from '../firebase';
import SaveOpportunityButton from './SaveOpportunityButton'; // Import the new button

const SavedOpportunitiesScreen = ({ showMessage, setActiveScreen, currentUser, setSelectedOpportunity }) => {
    const [savedOpportunities, setSavedOpportunities] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!currentUser) {
            setActiveScreen('Login');
            return;
        }
        
        // This listener will automatically update the list if a saved opportunity is removed elsewhere
        const savedRef = collection(db, "creators", currentUser.uid, "savedOpportunities");
        const unsubscribe = onSnapshot(savedRef, async (snapshot) => {
            setLoading(true);
            const savedIds = snapshot.docs.map(doc => doc.id);

            if (savedIds.length > 0) {
                const oppsRef = collection(db, "opportunities");
                // Fetch the full data for all saved opportunity IDs
                // This automatically handles cases where a listing was deleted - it just won't be found.
                const q = query(oppsRef, where("__name__", "in", savedIds));
                const oppsSnapshot = await getDocs(q);
                const fetchedOpps = oppsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                // Sort by the date they were originally posted
                fetchedOpps.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());

                setSavedOpportunities(fetchedOpps);
            } else {
                setSavedOpportunities([]);
            }
            setLoading(false);
        });
        
        return () => unsubscribe();
    }, [currentUser]);

    return (
        <div className="screenContainer">
            <p className="heading">My Saved Opportunities</p>
            <p className="subHeading">All the listings you've bookmarked. They will be removed from this list if they expire or are deleted.</p>
            
            <div className="dashboardContentList" style={{marginTop: '20px'}}>
                {loading ? <p className="dashboardItem">Loading saved listings...</p> : (
                    savedOpportunities.length === 0 ? (
                        <p className="dashboardItem" style={{textAlign: 'center'}}>You have not saved any opportunities yet.</p>
                    ) : (
                        savedOpportunities.map(opp => (
                            <div key={opp.id} className="adminDashboardItem">
                                <div 
                                    style={{flexGrow: 1, cursor: 'pointer'}} 
                                    onClick={() => { setSelectedOpportunity(opp); setActiveScreen('OpportunityDetails'); }}
                                >
                                    <p className="adminDashboardItemTitle" style={{fontWeight: 'bold'}}>{opp.title}</p>
                                    <p style={{fontSize: '12px', color: '#CCC'}}>by {opp.providerName}</p>
                                    {/* --- REQUIREMENT FULFILLED: Displaying the creation date --- */}
                                    <p style={{fontSize: '11px', color: '#888', marginTop: '5px'}}>
                                        Posted on: {new Date(opp.createdAt.toDate()).toLocaleDateString()}
                                    </p>
                                </div>
                                <SaveOpportunityButton 
                                    currentUser={currentUser} 
                                    opportunityId={opp.id} 
                                    showMessage={showMessage} 
                                />
                            </div>
                        ))
                    )
                )}
            </div>

            <button className="button" onClick={() => setActiveScreen('CreatorDashboard')} style={{ backgroundColor: '#3A3A3A', marginTop: '30px' }}>
                <span className="buttonText light">Back to Dashboard</span>
            </button>
        </div>
    );
};

export default SavedOpportunitiesScreen;