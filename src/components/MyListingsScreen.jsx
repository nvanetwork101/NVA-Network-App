import React, { useState, useEffect } from 'react';
import { db, functions } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, limit, doc } from 'firebase/firestore';
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

    const getStatusStyles = (status) => {
        switch (status) {
            case 'active': return { bg: 'rgba(0, 255, 0, 0.1)', border: 'rgba(0, 255, 0, 0.3)', text: '#00FF00', label: 'Active' };
            case 'pending': return { bg: 'rgba(255, 215, 0, 0.1)', border: 'rgba(255, 215, 0, 0.3)', text: '#FFD700', label: 'Pending Review' };
            case 'rejected': return { bg: 'rgba(220, 53, 69, 0.1)', border: 'rgba(220, 53, 69, 0.3)', text: '#DC3545', label: 'Rejected' };
            default: return { bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', text: '#888', label: 'Expired' };
        }
    };

    const customStyles = `
        .casting-card { background: #111; border: 1px solid #222; border-radius: 16px; overflow: hidden; margin-bottom: 20px; transition: all 0.3s ease; display: flex; flex-direction: column; }
        .casting-card:hover { border-color: #FFD700; box-shadow: 0 8px 32px rgba(255, 215, 0, 0.04); }
        .card-banner { position: relative; width: 100%; aspect-ratio: 16/9; background: #050505; overflow: hidden; }
        .card-banner img { width: 100%; height: 100%; object-fit: contain; }
        .card-status-badge { position: absolute; top: 12px; left: 12px; font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 100px; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid; z-index: 3; }
        
        .card-body { padding: 20px; }
        .card-title { font-size: 20px; font-weight: 800; color: #FFF; margin: 0 0 12px 0; }
        
        .progress-container { background: #0A0A0A; border: 1px solid #222; border-radius: 8px; padding: 12px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; }
        .progress-item { display: flex; align-items: center; gap: 8px; }
        .progress-val { font-family: monospace; font-size: 15px; font-weight: bold; color: #FFF; }

        .btn-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .btn-pills { flex: 1; padding: 10px 16px; border-radius: 100px; font-size: 12px; font-weight: 800; cursor: pointer; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid; transition: all 0.2s; text-align: center; }
        .btn-close { background: rgba(255, 140, 0, 0.1); border-color: rgba(255, 140, 0, 0.4); color: #FF8C00; }
        .btn-close:hover { background: #FF8C00; color: #000; }
        .btn-manage { background: rgba(0, 255, 255, 0.1); border-color: rgba(0, 255, 255, 0.4); color: #00FFFF; }
        .btn-manage:hover { background: #00FFFF; color: #000; }
        .btn-delete { background: rgba(220, 53, 69, 0.1); border-color: rgba(220, 53, 69, 0.4); color: #DC3545; }
        .btn-delete:hover { background: #DC3545; color: #FFF; }
    `;

    return (
        <>
            <style>{customStyles}</style>
            <div className="screenContainer" style={{ paddingBottom: '40px' }}>
                <p className="heading">My Casting Calls</p>
                <p className="subHeading" style={{ marginBottom: '30px' }}>Track the status of your casting calls. Your 10 most recent listings are shown here.</p>
                
                {loading ? <p className="dashboardItem" style={{textAlign: 'center'}}>Loading your listings...</p> : (
                    <div className="allCampaignsList">
                        {myListings.length === 0 ? <p className="dashboardItem" style={{textAlign: 'center'}}>You have not posted any casting calls yet.</p> :
                            myListings.map(opp => {
                                const styles = getStatusStyles(opp.status);
                                return (
                                    <div key={opp.id} className="casting-card">
                                        
                                        {/* WIDESCREEN 16:9 POSTER BANNER */}
                                        <div className="card-banner">
                                            <span className="card-status-badge" style={{ backgroundColor: styles.bg, borderColor: styles.border, color: styles.text }}>
                                                {styles.label}
                                            </span>
                                            <img 
                                                src={opp.flyerImageUrl || 'https://placehold.co/1200x675/1A2A2A/FFF?text=NO+FLYER+UPLOADED'} 
                                                alt={opp.title}
                                            />
                                        </div>

                                        <div className="card-body">
                                            <p className="card-title">{opp.title}</p>

                                            {/* REAL-TIME AUDITION ANALYTICS PANEL */}
                                            <div className="progress-container">
                                                <div className="progress-item">
                                                    <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: '#00FFFF' }}><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 10c-2.48 0-4.5-2.02-4.5-4.5S9.52 5.5 12 5.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5zM12 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>
                                                    <span className="progress-val">{opp.viewCount || 0}</span>
                                                    <span style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase' }}>Views</span>
                                                </div>
                                                <div className="progress-item">
                                                    <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: '#00FF00' }}><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"></path></svg>
                                                    <span className="progress-val">{opp.applyClickCount || 0}</span>
                                                    <span style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase' }}>Applications</span>
                                                </div>
                                            </div>

                                            {/* ACTION CONTROL BUTTON PILLS */}
                                            <div className="btn-row">
                                                {opp.status === 'active' && (
                                                    <button className="btn-pills btn-close" onClick={() => handleClose(opp.id)}>Close Listing</button>
                                                )}
                                                <button className="btn-pills btn-manage" onClick={() => handleOpenManageModal(opp)}>Manage</button>
                                                <button className="btn-pills btn-delete" onClick={() => handleDelete(opp.id)}>Delete</button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
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
        </>
    );
};

export default MyListingsScreen;