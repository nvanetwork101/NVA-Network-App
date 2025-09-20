// src/components/AdminOpportunityDetailsScreen.jsx

import React from 'react';
import { functions, httpsCallable } from '../firebase';
import OpportunityDetailsScreen from './OpportunityDetailsScreen'; // Re-using the public view

const AdminOpportunityDetailsScreen = ({ showMessage, setActiveScreen, selectedOpportunity }) => {

    if (!selectedOpportunity) {
        React.useEffect(() => {
            setActiveScreen('AdminDashboard');
        }, []);
        return null;
    }

    const getStatusStyle = (status) => {
        switch (status) {
            case 'active': return { color: '#00FF00', fontWeight: 'bold' };
            case 'pending': return { color: '#FFD700', fontWeight: 'bold' };
            case 'rejected': return { color: '#DC3545', fontWeight: 'bold' };
            case 'expired': return { color: '#888', fontWeight: 'bold' };
            default: return {};
        }
    };

    const handleReviewAction = async (action, functionName) => {
        showMessage(`Processing ${action}...`);
        try {
            const reviewFunction = httpsCallable(functions, functionName);
            const result = await reviewFunction({ opportunityId: selectedOpportunity.id });
            showMessage(result.data.message);
            setActiveScreen('AdminDashboard');
        } catch (error) {
            showMessage(`Error: ${error.message}`);
        }
    };

    return (
        <div className="screenContainer">
            <div className="sectionHeaderWithButton" style={{ borderBottom: '1px solid #333', paddingBottom: '10px'}}>
                <p className="heading" style={{margin: 0, textAlign: 'left'}}>Admin Review</p>
                <span style={getStatusStyle(selectedOpportunity.status)}>
                    STATUS: {selectedOpportunity.status.toUpperCase()}
                </span>
            </div>

            {/* THE FIX: The redundant URL block has been removed from here. */}

            <OpportunityDetailsScreen 
                showMessage={showMessage} 
                setActiveScreen={setActiveScreen} 
                selectedOpportunity={selectedOpportunity} 
            />

            <div className="dashboardSection" style={{ border: '2px solid #FFD700', marginTop: '20px' }}>
                <p className="dashboardSectionTitle">Moderator Actions</p>
                <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '20px' }}>
                    {selectedOpportunity.status === 'pending' && (
                        <>
                            <button className="adminActionButton approve" onClick={() => handleReviewAction('approval', 'approveOpportunity')}>Approve Listing</button>
                            <button className="adminActionButton reject" onClick={() => handleReviewAction('rejection', 'rejectOpportunity')}>Reject Listing</button>
                        </>
                    )}
                    {selectedOpportunity.status === 'active' && (
                        <button className="adminActionButton" style={{backgroundColor: '#FF8C00'}} onClick={() => handleReviewAction('ending', 'endOpportunityByAdmin')}>End Listing Manually</button>
                    )}
                    {(selectedOpportunity.status === 'rejected' || selectedOpportunity.status === 'expired') && (
                         <p className="dashboardItem">No actions available for this listing status.</p>
                    )}
                </div>
            </div>
             <button className="button" onClick={() => setActiveScreen('AdminDashboard')} style={{ backgroundColor: '#3A3A3A', marginTop: '30px' }}>
                <span className="buttonText light">Back to Admin Dashboard</span>
            </button>
        </div>
    );
};

export default AdminOpportunityDetailsScreen;