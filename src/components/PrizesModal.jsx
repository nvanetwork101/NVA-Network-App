// src/components/PrizesModal.jsx

import React from 'react';

function PrizesModal({ competition, onClose }) {
    return (
        <div className="confirmationModalOverlay" style={{ zIndex: 2500 }}>
            <div className="confirmationModalContent" style={{ textAlign: 'left', maxWidth: '500px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <p className="confirmationModalTitle">{competition.title}</p>
                    <button className="closeButton" onClick={onClose} style={{ position: 'static' }}>×</button>
                </div>

                <div className="dashboardSection" style={{ padding: '10px', border: '1px solid #00FFFF', margin: '15px 0' }}>
                    <p className="dashboardSectionTitle" style={{ fontSize: '18px', color: '#00FFFF' }}>Prizes</p>
                    <p className="paragraph" style={{ whiteSpace: 'pre-wrap', color: '#FFF' }}>
                        {competition.prizesText || "Prize information will be updated soon."}
                    </p>
                </div>

                <div className="dashboardSection" style={{ padding: '10px', border: '1px solid #FFD700', margin: '15px 0' }}>
                    <p className="dashboardSectionTitle" style={{ fontSize: '18px', color: '#FFD700' }}>Rules & Requirements</p>
                    <p className="paragraph" style={{ whiteSpace: 'pre-wrap' }}>
                        {competition.rules || "No rules have been posted for this competition yet."}
                    </p>
                </div>
                
                <div className="confirmationModalButtons">
                    <button className="confirmationButton confirm" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}

export default PrizesModal;