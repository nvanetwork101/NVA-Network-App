import React, { useState, useEffect } from 'react';
import { db, functions } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, limit } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import ManageOpportunityModal from './ManageOpportunityModal';

const MyListingsScreen = ({ showMessage, setActiveScreen, currentUser }) => {
    const [myListings, setMyListings] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showManageModal, setShowManageModal] = useState(false);
    const [opportunityToManage, setOpportunityToManage] = useState(null);

    useEffect(() => {
        if (!currentUser) {
            setActiveScreen('Login');
            return;
        }
        const opportunitiesRef = collection(db, "opportunities");
        const q = query(opportunitiesRef, where("postedByUid", "==", currentUser.uid), orderBy("createdAt", "desc"), limit(10));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setMyListings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        });
        return () => unsubscribe();
    }, [currentUser, setActiveScreen]);
    
    const handleDelete = async (opportunityId) => {
        showMessage("Deleting listing...");
        try {
            const deleteFunction = httpsCallable(functions, 'deleteOpportunity');
            await deleteFunction({ opportunityId });
            showMessage("Listing deleted successfully.");
        } catch (error) { showMessage(`Error: ${error.message}`); }
    };

    const handleClose = async (opportunityId) => {
        showMessage("Closing listing...");
        try {
            const closeFunction = httpsCallable(functions, 'closeOpportunityListing');
            await closeFunction({ opportunityId });
            showMessage("Listing closed successfully.");
        } catch (error) { showMessage(`Error: ${error.message}`); }
    };

        const handleOpenManageModal = (opportunity) => {
        setOpportunityToManage(opportunity);
        setShowManageModal(true);
    };

    const handleSaveChanges = async (opportunityId, updates) => {
        try {
            const updateFunction = httpsCallable(functions, 'updateOpportunityDetails');
            await updateFunction({ opportunityId, updates });
            showMessage("Listing updated successfully!");
        } catch (error) {
            showMessage(`Update failed: ${error.message}`);
            throw error;
        }
    };

    const getStatusStyle = (status) => {
        switch (status) {
            case 'active': return { color: '#00FF00', fontWeight: 'bold' };
            case 'pending': return { color: '#FFD700', fontWeight: 'bold' };
            case 'rejected': return { color: '#DC3545', fontWeight: 'bold' };
            case 'expired': return { color: '#888', fontWeight: 'bold' };
            default: return {};
        }
    };

    return (
        <div className="screenContainer">
            <p className="heading">My Opportunity Listings</p>
            <p className="subHeading">Track the status of your posts. Your 10 most recent listings are shown here.</p>
            
            {loading ? <p className="dashboardItem" style={{textAlign: 'center'}}>Loading your listings...</p> : (
                <div className="allCampaignsList">
                    {myListings.length === 0 ? <p className="dashboardItem" style={{textAlign: 'center'}}>You have not posted any opportunities yet.</p> :
                        myListings.map(opp => (
                            <div key={opp.id} className="allCampaignsListItem" style={{alignItems: 'center'}}>
                                <img 
                                    src={opp.flyerImageUrl || 'https://placehold.co/80x80/2A2A2A/FFF?text=N/A'} 
                                    alt={opp.title}
                                    style={{width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', marginRight: '15px'}}
                                />
                                <div className="campaignListContent">
                                    <p className="campaignListTitle" style={{marginBottom: '5px'}}>{opp.title}</p>
                                    <p className="campaignListCreator" style={{marginBottom: '10px'}}>
                                        Status: <span style={getStatusStyle(opp.status)}>{opp.status.charAt(0).toUpperCase() + opp.status.slice(1)}</span>
                                    </p>

                                    {/* --- THIS IS THE FIX: START OF NEW ANALYTICS BLOCK --- */}
                                    <div className="campaignListStats" style={{marginTop: '10px', paddingTop: '10px', borderTop: '1px solid #3A3A3A', display: 'flex', gap: '20px'}}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }} title="Total times your listing has been viewed">
                                            <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px', fill: '#FFF' }}><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 10c-2.48 0-4.5-2.02-4.5-4.5S9.52 5.5 12 5.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5zM12 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>
                                            <span style={{color: '#FFF', fontSize: '14px', fontWeight: 'bold'}}>{(opp.viewCount || 0).toLocaleString()} Views</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }} title="Total times users clicked 'How to Apply'">
                                            <svg viewBox="0 0 24 24" style={{ width: '18px', height: '18px', fill: '#00FF00' }}><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"></path></svg>
                                            <span style={{color: '#FFF', fontSize: '14px', fontWeight: 'bold'}}>{(opp.applyClickCount || 0).toLocaleString()} Clicks</span>
                                        </div>
                                    </div>
                                    {/* --- END OF NEW ANALYTICS BLOCK --- */}

                                    <div className="videoActions" style={{justifyContent: 'flex-start', marginTop: '15px'}}>
                                        {opp.status === 'active' && (
                                            <button className="actionButton" style={{backgroundColor: '#FF8C00'}} onClick={() => handleClose(opp.id)}>Close Listing</button>
                                        )}
                                        <button className="actionButton" onClick={() => handleOpenManageModal(opp)}>Manage</button>
                                        <button className="actionButton remove" onClick={() => handleDelete(opp.id)}>Delete</button>
                                    </div>
                                </div>
                            </div>
                        ))
                    }
                </div>
            )}
             <button className="button" onClick={() => setActiveScreen('CreatorDashboard')} style={{ backgroundColor: '#3A3A3A', marginTop: '30px' }}>
                <span className="buttonText light">Back to Dashboard</span>
            </button>
        
            {showManageModal && (
                <ManageOpportunityModal
                    opportunity={opportunityToManage}
                    onSave={handleSaveChanges}
                    onClose={() => setShowManageModal(false)}
                    showMessage={showMessage}
                />
            )}
        
        </div>
    );
};

export default MyListingsScreen;