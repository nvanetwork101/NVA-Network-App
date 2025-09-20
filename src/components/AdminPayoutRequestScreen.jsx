// src/components/AdminPayoutRequestScreen.jsx

import React from 'react';
import { db, functions, httpsCallable, doc, updateDoc } from '../firebase';
import formatCurrency from '../utils/formatCurrency';

const AdminPayoutRequestScreen = ({ 
    requests, 
    showMessage, 
    setShowConfirmationModal, 
    setConfirmationTitle, 
    setConfirmationMessage, 
    setOnConfirmationAction,
    currencyRates,
    selectedCurrency
}) => {

    const handleUpdateRequest = async (requestId, newStatus) => {
        showMessage(`Updating request to "${newStatus}"...`);
        try {
            const requestRef = doc(db, "payoutRequests", requestId);
            await updateDoc(requestRef, { status: newStatus });
            showMessage("Request status updated successfully.");
        } catch (error) {
            showMessage(`Error updating status: ${error.message}`);
        }
    };

    const confirmUpdate = (request, newStatus) => {
        const action = newStatus === 'paid' ? 'Paid' : 'Dismissed';
        setConfirmationTitle(`Mark as ${action}?`);
        setConfirmationMessage(`Are you sure you want to mark the payout request for "${request.campaignTitle}" as ${newStatus}?`);
        setOnConfirmationAction(() => () => handleUpdateRequest(request.campaignId, newStatus));
        setShowConfirmationModal(true);
    };

    if (requests.length === 0) {
        return <p className="dashboardItem">There are no pending payout requests.</p>;
    }

    return (
        <div className="dashboardContentList">
            {requests.map(req => (
                <div key={req.campaignId} className="adminDashboardItem" style={{flexDirection: 'column', alignItems: 'stretch'}}>
                    <div>
                        <p className="adminDashboardItemTitle">{req.campaignTitle}</p>
                        <p className="text-sm" style={{color:'#CCC'}}>
                            Requested by: <span style={{color: '#FFD700'}}>{req.creatorName}</span>
                        </p>
                        <p className="text-sm" style={{color:'#CCC'}}>
                            Amount Raised: <span style={{color: '#00FFFF'}}>{formatCurrency(req.amountRaised, selectedCurrency, currencyRates)}</span>
                        </p>
                         <p className="text-sm" style={{color:'#AAA'}}>
                            Requested On: {new Date(req.requestedAt.toDate()).toLocaleString()}
                        </p>
                    </div>
                    <div style={{display: 'flex', justifyContent: 'flex-end', gap: '10px', width: '100%', marginTop: '10px', borderTop: '1px solid #2A2A2A', paddingTop: '10px'}}>
                        <button className="adminActionButton" style={{backgroundColor: '#555'}} onClick={() => confirmUpdate(req, 'dismissed')}>Dismiss</button>
                        <button className="adminActionButton approve" onClick={() => confirmUpdate(req, 'paid')}>Mark as Paid</button>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default AdminPayoutRequestScreen;