import React, { useState, useEffect, useCallback } from 'react';
import { functions, httpsCallable } from '../firebase';

const AdminEnrollmentManager = ({ showMessage, setActiveScreen, setSelectedUserId }) => {
    const [applications, setApplications] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('pending');
    const [error, setError] = useState('');

    const getEnrollmentApplications = useCallback(httpsCallable(functions, 'getEnrollmentApplications'), []);
    const approveEnrollmentApplication = useCallback(httpsCallable(functions, 'approveEnrollmentApplication'), []);
    const declineEnrollmentApplication = useCallback(httpsCallable(functions, 'declineEnrollmentApplication'), []);
    const verifyEnrollmentPayment = useCallback(httpsCallable(functions, 'verifyEnrollmentPayment'), []);

    const fetchApplications = useCallback(async (status) => {
        setIsLoading(true);
        setError('');
        try {
            const result = await getEnrollmentApplications({ statusFilter: status });
            setApplications(result.data.applications);
        } catch (err) {
            setError('Failed to fetch applications.');
            showMessage(err.message);
        } finally {
            setIsLoading(false);
        }
    }, [getEnrollmentApplications, showMessage]);

    useEffect(() => {
        fetchApplications(activeTab);
    }, [activeTab, fetchApplications]);

    const handleAction = async (actionFunc, targetUserId, successMessage) => {
        try {
            await actionFunc({ targetUserId });
            showMessage(successMessage);
            fetchApplications(activeTab); // Refresh the list
        } catch (err) {
            showMessage(`Error: ${err.message}`);
        }
    };

    const handleDecline = (targetUserId) => {
        const reason = prompt("Optional: Provide a reason for declining this application.");
        handleAction(() => declineEnrollmentApplication({ targetUserId, reason }), targetUserId, "Application declined.");
    };

    const ApplicationCard = ({ app }) => (
        <div className="adminDashboardItem" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <img
                    src={app.profilePictureUrl || 'https://placehold.co/60x60/333/FFF?text=N/A'}
                    alt={app.userName}
                    style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', cursor: 'pointer' }}
                    onClick={() => { setSelectedUserId(app.userId); setActiveScreen('UserProfile'); }}
                />
                <div>
                    <p className="adminDashboardItemTitle">{app.userName}</p>
                    <p className="smallText" style={{ color: '#AAA' }}>{app.userEmail}</p>
                </div>
            </div>
            <div className="pt-3 mt-3 border-t" style={{ borderColor: '#333' }}>
            <p><strong>Applying For:</strong>
                {app.selectedOptions?.includes('filmClub') ? 'Film Club' : ''}
                {app.selectedOptions?.includes('filmClub') && app.selectedOptions?.includes('docuSeries') ? ' & ' : ''}
                {app.selectedOptions?.includes('docuSeries') ? 'Docu-Series' : ''}
            </p>
            <p><strong>Phone Number:</strong> <span style={{color: '#FFD700'}}>{app.phone || 'None provided'}</span></p> {/* <-- ADDED PHONE VIEW */}
            <p><strong>Total Fee:</strong> ${app.totalAmount?.toLocaleString()} GYD</p>
                {app.status === 'paymentPending' && app.paymentDetails && (
                     <div>
                        <p><strong>Payment ID:</strong> {app.paymentDetails.paymentId}</p>
                        <a href={app.paymentDetails.screenshotUrl} target="_blank" rel="noopener noreferrer" className="termsLink">View Screenshot</a>
                    </div>
                )}
            </div>
            <div className="flex justify-end gap-2 mt-3">
                {app.status === 'pending' && (
                    <>
                        <button className="adminActionButton reject" onClick={() => handleDecline(app.userId)}>Decline</button>
                        <button className="adminActionButton approve" onClick={() => handleAction(approveEnrollmentApplication, app.userId, "Application Approved.")}>Approve</button>
                    </>
                )}
                {app.status === 'paymentPending' && (
                    <button className="adminActionButton" style={{backgroundColor: '#00FF00', color: '#0A0A0A'}} onClick={() => handleAction(verifyEnrollmentPayment, app.userId, "Payment Verified & Enrolled.")}>Verify Payment</button>
                )}
            </div>
        </div>
    );

    return (
        <div className="dashboardSection">
             <p className="dashboardSectionTitle">Enrollment Management</p>
             <div className="admin-nav-container">
                 <button className={`admin-nav-button ${activeTab === 'pending' ? 'active' : ''}`} onClick={() => setActiveTab('pending')}>Pending Review</button>
                 <button className={`admin-nav-button ${activeTab === 'paymentPending' ? 'active' : ''}`} onClick={() => setActiveTab('paymentPending')}>Pending Payment Verification</button>
                 <button className={`admin-nav-button ${activeTab === 'approved' ? 'active' : ''}`} onClick={() => setActiveTab('approved')}>Approved</button>
                 <button className={`admin-nav-button ${activeTab === 'enrolled' ? 'active' : ''}`} onClick={() => setActiveTab('enrolled')}>Enrolled</button>
                 <button className={`admin-nav-button ${activeTab === 'declined' ? 'active' : ''}`} onClick={() => setActiveTab('declined')}>Declined</button>
             </div>
             <div style={{maxHeight: '60vh', overflowY: 'auto', padding: '10px'}}>
                {isLoading ? <p>Loading...</p> : error ? <p>{error}</p> :
                    applications.length > 0 ? applications.map(app => <ApplicationCard key={app.id} app={app} />) : <p>No applications found with status: {activeTab}</p>
                }
             </div>
        </div>
    );
};

export default AdminEnrollmentManager;