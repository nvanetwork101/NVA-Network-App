// src/components/AdminStatusReviewScreen.jsx

import React, { useState, useEffect } from 'react';
import { db, functions, httpsCallable, doc, getDoc } from '../firebase';

const AdminStatusReviewScreen = ({ showMessage, setActiveScreen, selectedStatus }) => {
    const [submitter, setSubmitter] = useState(null);
    
    useEffect(() => {
        const fetchSubmitter = async () => {
            if (selectedStatus && selectedStatus.postedByUid) {
                try {
                    const userRef = doc(db, "creators", selectedStatus.postedByUid);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        setSubmitter(userSnap.data());
                    } else {
                        showMessage("Could not find the profile of the submitter.");
                    }
                } catch (error) {
                    showMessage("Error fetching submitter's profile.");
                }
            }
        };
        fetchSubmitter();
    }, [selectedStatus]); // This effect runs when the component mounts or selectedStatus changes

    // Safety check: If a user navigates here directly without a selection, redirect them.
    if (!selectedStatus) {
        // Use a useEffect to avoid state update during render warnings
        React.useEffect(() => {
            setActiveScreen('AdminDashboard');
        }, []);
        return null;
    }

    const handleReviewAction = async (action) => {
        const functionName = action === 'approve' ? 'approveStatusContent' : 'rejectStatusContent';
        const actionText = action === 'approve' ? 'Approving' : 'Rejecting';
        
        showMessage(`${actionText} content...`);
        try {
            const reviewFunction = httpsCallable(functions, functionName);
            const result = await reviewFunction({ bookingId: selectedStatus.id });
            showMessage(result.data.message);
            setActiveScreen('AdminDashboard'); // Navigate back on success
        } catch (error) {
            showMessage(`Error: ${error.message}`);
        }
    };

    const { content } = selectedStatus;

    return (
        <div className="screenContainer">
            <p className="heading">Review Billboard Content</p>
            <p className="subHeading">Booking for: {new Date(selectedStatus.startTime.toDate()).toLocaleDateString()}</p>
            
            <div className="dashboardSection">
                <p className="dashboardSectionTitle">Submitted Ad Details</p>
                <p className="dashboardItem"><strong>Ad Title:</strong> {content.title}</p>
                
                <p className="dashboardItem"><strong>Submitted By:</strong> {submitter ? submitter.creatorName : 'Loading user...'}</p>
                
                <p className="dashboardItem"><strong>Destination URL:</strong> {content.destinationUrl ? <a href={content.destinationUrl} target="_blank" rel="noopener noreferrer" className="termsLink">{content.destinationUrl}</a> : "Not Provided"}</p>
                <p className="dashboardItem"><strong>Ad Video URL:</strong> {content.adVideoUrl ? <a href={content.adVideoUrl} target="_blank" rel="noopener noreferrer" className="termsLink">{content.adVideoUrl}</a> : "Not Provided"}</p>
                
                {content.flyerImageUrl && (
                    <div style={{marginTop: '15px'}}>
                        <p className="formLabel"><strong>Submitted Flyer / Thumbnail:</strong></p>
                        <img 
                            src={content.flyerImageUrl} 
                            alt="Ad Flyer" 
                            style={{
                                maxWidth: '100%', 
                                maxHeight: '400px',
                                objectFit: 'contain',
                                display: 'block',
                                margin: '10px auto',
                                borderRadius: '8px'
                            }}
                        />
                    </div>
                )}
            </div>

            <div className="dashboardSection" style={{ border: '2px solid #FFD700' }}>
                <p className="dashboardSectionTitle">Moderator Actions</p>
                <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: '20px' }}>
                    <button className="adminActionButton reject" onClick={() => handleReviewAction('reject')}>Reject Content</button>
                    <button className="adminActionButton approve" onClick={() => handleReviewAction('approve')}>Approve & Schedule</button>
                </div>
            </div>
             <button className="button" onClick={() => setActiveScreen('AdminDashboard')} style={{ backgroundColor: '#3A3A3A', marginTop: '30px' }}>
                <span className="buttonText light">Back to Admin Dashboard</span>
            </button>
        </div>
    );
};

export default AdminStatusReviewScreen;