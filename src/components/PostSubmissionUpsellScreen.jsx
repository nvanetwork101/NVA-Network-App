// src/components/PostSubmissionUpsellScreen.jsx

import React from 'react';

const PostSubmissionUpsellScreen = ({ 
    showMessage, 
    setActiveScreen, 
    opportunityToPromote, 
    setOpportunityToPromote 
}) => {
    // Safety check in case the user navigates here directly
    if (!opportunityToPromote) {
        setActiveScreen('CreatorDashboard');
        return null;
    }

    const handleBookSlot = () => {
        // The opportunityToPromote state is already set, so we just need to navigate.
        setActiveScreen('BookStatus');
    };

    const handleNoThanks = () => {
        // Clear the state and navigate to My Listings
        setOpportunityToPromote(null);
        setActiveScreen('MyListings');
    };

    return (
        <div className="screenContainer" style={{textAlign: 'center', paddingTop: '50px'}}>
            <p className="heading" style={{color: '#00FF00'}}>Success!</p>
            <p className="subHeading">Your opportunity listing has been submitted for review.</p>
            
            <div className="dashboardSection" style={{border: '1px solid #FFD700', marginTop: '30px'}}>
                <p className="dashboardSectionTitle">Want to Maximize Visibility?</p>
                <p className="paragraph">
                    Give your listing a massive boost by promoting it on the homepage "Billboard" for 24 hours.
                </p>
                <button className="button" onClick={handleBookSlot}>
                    <span className="buttonText">Book Billboard Slot</span>
                </button>
            </div>

            <button
                className="button"
                onClick={handleNoThanks}
                style={{ backgroundColor: '#3A3A3A', marginTop: '20px' }}
            >
                <span className="buttonText light">No, Thanks (View My Listings)</span>
            </button>
        </div>
    );
};

export default PostSubmissionUpsellScreen;