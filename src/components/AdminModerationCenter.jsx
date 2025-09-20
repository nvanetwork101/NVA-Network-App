// src/components/AdminModerationCenter.jsx

import React, { useState } from 'react';
import AdminModerationQueue from './AdminModerationQueue';
import AdminAppealsQueue from './AdminAppealsQueue';

function AdminModerationCenter({
    showMessage,
    setActiveScreen,
    setSelectedReportGroup,
    setShowConfirmationModal,
    setConfirmationTitle,
    setConfirmationMessage,
    setOnConfirmationAction
}) {
    const [activeTab, setActiveTab] = useState('reports');

    return (
        <>
            <p className="heading">Moderation Center</p>
            <p className="subHeading">Manage community reports and user appeals.</p>

            <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginBottom: '20px' }}>
                <button 
                    className="button" 
                    onClick={() => setActiveTab('reports')} 
                    style={{ backgroundColor: activeTab === 'reports' ? '#FFD700' : '#3A3A3A', color: activeTab === 'reports' ? '#0A0A0A' : '#FFF' }}>
                    <span className="buttonText">Reports Queue</span>
                </button>
                <button 
                    className="button" 
                    onClick={() => setActiveTab('appeals')} 
                    style={{ backgroundColor: activeTab === 'appeals' ? '#FFD700' : '#3A3A3A', color: activeTab === 'appeals' ? '#0A0A0A' : '#FFF' }}>
                    <span className="buttonText">Appeals Queue</span>
                </button>
            </div>

            {activeTab === 'reports' && (
                <AdminModerationQueue
                    showMessage={showMessage}
                    setActiveScreen={setActiveScreen}
                    setSelectedReportGroup={setSelectedReportGroup}
                />
            )}
            {activeTab === 'appeals' && (
                // vvv THIS IS THE UPDATED PART vvv
                // We now pass all the necessary props down to the Appeals Queue
                <AdminAppealsQueue
                    showMessage={showMessage}
                    setShowConfirmationModal={setShowConfirmationModal}
                    setConfirmationTitle={setConfirmationTitle}
                    setConfirmationMessage={setConfirmationMessage}
                    setOnConfirmationAction={setOnConfirmationAction}
                />
            )}
        </>
    );
}

export default AdminModerationCenter;