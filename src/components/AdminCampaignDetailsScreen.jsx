import React, { useState, useEffect } from 'react';
import { db, functions, httpsCallable, doc, onSnapshot, updateDoc, appId } from '../firebase';
import CampaignDetailsScreen from './CampaignDetailsScreen'; // Reusing the existing component

const AdminCampaignDetailsScreen = ({
    showMessage,
    setActiveScreen,
    currentUser,
    selectedAdminCampaignId,
    setShowConfirmationModal,
    setConfirmationTitle,
    setConfirmationMessage,
    setOnConfirmationAction,
    selectedCurrency,
    currencyRates
}) => {
    const [campaign, setCampaign] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!selectedAdminCampaignId) {
            showMessage("No campaign selected for review.");
            setActiveScreen('AdminDashboard');
            return;
        }
        const campaignDocRef = doc(db, `artifacts/${appId}/public/data/campaigns`, selectedAdminCampaignId);
        const unsubscribe = onSnapshot(campaignDocRef, (docSnap) => {
            if (docSnap.exists()) {
                setCampaign({ id: docSnap.id, ...docSnap.data() });
            } else {
                showMessage("Campaign not found.");
                setActiveScreen('AdminDashboard');
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [selectedAdminCampaignId]);

    const handleStatusUpdate = async (newStatus) => {
        if (!campaign || !currentUser) return;
        const actionText = newStatus === 'active' ? 'Approving' : 'Rejecting';
        showMessage(`${actionText} campaign...`);
        try {
            const campaignDocRef = doc(db, `artifacts/${appId}/public/data/campaigns`, campaign.id);
            await updateDoc(campaignDocRef, {
                status: newStatus,
                [`${newStatus}By`]: currentUser.uid,
                [`${newStatus}At`]: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
            showMessage(`Campaign "${campaign.title}" has been ${newStatus}.`);
            setActiveScreen('AdminDashboard');
        } catch (error) {
            showMessage(`Failed to update campaign: ${error.message}`);
        }
    };
    
    const confirmAction = (status) => {
        const title = status === 'active' ? 'Approve Campaign?' : 'Reject Campaign?';
        const message = `Are you sure you want to ${status === 'active' ? 'APPROVE' : 'REJECT'} the campaign "${campaign.title}"?`;
        setConfirmationTitle(title);
        setConfirmationMessage(message);
        setOnConfirmationAction(() => () => handleStatusUpdate(status));
        setShowConfirmationModal(true);
    };

    if (loading) {
        return <div className="screenContainer" style={{ textAlign: 'center' }}><p className="heading">Loading Campaign for Review...</p></div>;
    }

    if (!campaign) return null;

    return (
        <div className="screenContainer">
            {/* Reuse the public-facing component to display all the details */}
            <CampaignDetailsScreen 
                showMessage={showMessage} 
                setActiveScreen={setActiveScreen} 
                selectedCampaignId={selectedAdminCampaignId} 
                currentUser={currentUser} 
                setPledgeContext={() => {}} // Dummy function as admin won't pledge
                isAdminReview={true} // <-- THE FIX
            />
            
            {/* Add the admin-specific action panel */}
            <div className="dashboardSection" style={{ border: '2px solid #FFD700', marginTop: '20px' }}>
                <p className="dashboardSectionTitle">Admin Actions</p>
                <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '20px' }}>
                    <button className="adminActionButton approve" onClick={() => confirmAction('active')}>Approve Campaign</button>
                    <button className="adminActionButton reject" onClick={() => confirmAction('rejected')}>Reject Campaign</button>
                </div>
            </div>
            
            <button className="button" onClick={() => setActiveScreen('AdminDashboard')} style={{ backgroundColor: '#3A3A3A', marginTop: '30px' }}>
                <span className="buttonText light">Back to Admin Dashboard</span>
            </button>
        </div>
    );
};

export default AdminCampaignDetailsScreen;