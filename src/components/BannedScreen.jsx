// src/components/BannedScreen.jsx

import React from 'react';

const BannedScreen = ({ setActiveScreen }) => {
    // This email can be updated later via the Admin Dashboard
    const appealEmail = "appeals@nvanetwork.gy";

    return (
        <div className="screenContainer" style={{textAlign: 'center', paddingTop: '50px'}}>
            <p className="heading" style={{color: '#DC3545'}}>Account Permanently Banned</p>
            <p className="subHeading">
                Your account has been permanently banned due to repeated or severe violations of our community guidelines.
            </p>
            <p className="paragraph">
                Access to this account has been revoked. If you believe this was a mistake, you may contact our support team for a manual review.
            </p>

            <div className="dashboardSection" style={{marginTop: '20px', textAlign: 'left'}}>
                <p className="dashboardSectionTitle">Appeal Process</p>
                <p className="dashboardItem" style={{color: '#AAA', lineHeight: 1.4, marginBottom: '15px'}}>
                    To appeal this decision, please send an email with your account details and a thorough explanation to the address below.
                </p>
                <p className="heading" style={{fontSize: '18px', userSelect: 'all'}}>
                    <a href={`mailto:${appealEmail}`} className="termsLink">{appealEmail}</a>
                </p>
            </div>
            
            <button className="button" onClick={() => setActiveScreen('Home')} style={{ backgroundColor: '#3A3A3A', marginTop: '30px' }}>
                <span className="buttonText light">Back to Home</span>
            </button>
        </div>
    );
};

export default BannedScreen;