// src/components/AdminReportReviewScreen.jsx

import React, { useState, useEffect } from 'react';
import { db, functions, httpsCallable, doc, getDoc, extractVideoInfo } from '../firebase';
import SuspensionModal from './SuspensionModal';

function AdminReportReviewScreen({
    showMessage,
    setActiveScreen,
    currentUser, // Pass this down if needed for cloud functions
    selectedReportGroup,
    setShowConfirmationModal,
    setConfirmationTitle,
    setConfirmationMessage,
    setOnConfirmationAction
}) {
    const [content, setContent] = useState(null);
    const [loadingContent, setLoadingContent] = useState(true);
    const [showSuspensionModal, setShowSuspensionModal] = useState(false);

    // --- REAL-TIME DATA FETCHING ---
    useEffect(() => {
        if (!selectedReportGroup) {
            showMessage("No report selected. Returning to dashboard.");
            setActiveScreen('AdminDashboard');
            return;
        }

        setLoadingContent(true);
        const fetchContent = async () => {
            try {
                // Fetch the actual content document from Firestore
                const contentRef = doc(db, `artifacts/production-app-id/public/data/content_items`, selectedReportGroup.contentId);
                const docSnap = await getDoc(contentRef);
                if (docSnap.exists()) {
                    setContent({ id: docSnap.id, ...docSnap.data() });
                } else {
                    showMessage("Could not find the reported content. It may have been deleted.");
                    setContent(null); // Set to null if not found
                }
            } catch (error) {
                showMessage("Error fetching content details.");
                console.error("Error fetching content:", error);
            } finally {
                setLoadingContent(false);
            }
        };

        fetchContent();
    }, [selectedReportGroup]);

    const handleAction = (action, details = {}) => {
        let confirmationTitle, confirmationMessage, functionName;
        const appId = "production-app-id";
        const { contentId, reportedUserId, reports } = selectedReportGroup;
        const reportIds = reports.map(r => r.id);
        const basePayload = { reportIds, contentId, appId };

        switch(action) {
            case 'dismiss_reports':
                functionName = 'dismissContentReports';
                confirmationTitle = "Dismiss Reports?";
                confirmationMessage = `Are you sure you want to dismiss all reports? This implies the content is not in violation.`;
                break;
            case 'remove_content':
                functionName = 'removeReportedContent';
                confirmationTitle = "Remove Content?";
                confirmationMessage = `This will make the content unavailable and resolve all reports. Are you sure?`;
                break;
            case 'suspend_user':
                setShowSuspensionModal(true);
                return;
            case 'confirm_suspend':
                functionName = 'suspendReportedUser';
                confirmationTitle = `Suspend ${selectedReportGroup.reportedUserName}?`;
                confirmationMessage = `This will suspend the user for ${details.duration} hours and resolve all reports. Proceed?`;
                break;
            default: return;
        }
        
        const actionLogic = async () => {
             try {
                const callable = httpsCallable(functions, functionName);
                // Construct payload based on action
                const payload = functionName === 'suspendReportedUser'
                    ? { ...basePayload, userId: reportedUserId, durationHours: details.duration }
                    : basePayload;
                
                const result = await callable(payload);
                showMessage(result.data.message);
                setActiveScreen('AdminDashboard');
            } catch (error) {
                showMessage(`Error: ${error.message}`);
            }
        };

        setConfirmationTitle(confirmationTitle);
        setConfirmationMessage(confirmationMessage);
        setOnConfirmationAction(() => actionLogic); 
        setShowConfirmationModal(true);
    };
    
    if (!selectedReportGroup) return null;

    const { embedUrl, isVertical } = content ? extractVideoInfo(content.mainUrl) : {};

    return (
        <>
            <div className="screenContainer">
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px' }}>
                    <button onClick={() => setActiveScreen('AdminDashboard')} style={{ background: 'none', border: '1px solid #FFD700', color: '#FFD700', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginRight: '15px' }}>
                        &#x2190;
                    </button>
                    <p className="heading" style={{ margin: 0, textAlign: 'left', flexGrow: 1 }}>Review Content</p>
                </div>

                <div className="dashboardSection">
                    <p className="dashboardItem"><strong>Content:</strong> {selectedReportGroup.contentTitle}</p>
                    <p className="dashboardItem"><strong>Creator:</strong> {selectedReportGroup.reportedUserName}</p>
                    {loadingContent ? <p className="dashboardItem">Loading content for review...</p> : 
                     content ? (
                        <div className={`videoModalContent ${isVertical ? 'vertical' : ''}`} style={{position: 'relative', width: '100%', height: 'auto', minHeight: '300px', boxShadow: 'none', background: '#0A0A0A', marginTop: '15px'}}>
                            <div className={`videoIframeContainer ${isVertical ? 'vertical' : ''}`}>
                                <iframe src={embedUrl || content.mainUrl} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen title="Reported Content"></iframe>
                            </div>
                        </div>
                    ) : <p className="dashboardItem" style={{color: '#DC3545', fontWeight: 'bold'}}>Could not load video player. The content may have been deleted.</p>}
                </div>

                <div className="dashboardSection" style={{ border: '2px solid #DC3545', marginTop: '20px' }}>
                    <p className="dashboardSectionTitle">Moderator Actions</p>
                    <div style={{ display: 'flex', justifyContent: 'space-around', gap: '10px', flexWrap: 'wrap', marginTop: '15px' }}>
                        <button className="button" style={{ backgroundColor: '#008000' }} onClick={() => handleAction('dismiss_reports')}>
                            <span className="buttonText">Dismiss All Reports</span>
                        </button>
                        <button className="button" style={{ backgroundColor: '#FF8C00' }} onClick={() => handleAction('remove_content')}>
                            <span className="buttonText">Remove Content</span>
                        </button>
                        <button className="button" style={{ backgroundColor: '#DC3545' }} onClick={() => handleAction('suspend_user')}>
                            <span className="buttonText">Suspend User</span>
                        </button>
                    </div>
                </div>

                <div className="dashboardSection" style={{ marginTop: '20px' }}>
                    <p className="dashboardSectionTitle">Reports ({selectedReportGroup.reports?.length || 0})</p>
                    <div className="dashboardContentList" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                        {(selectedReportGroup.reports || []).map((report, index) => (
                           <div key={index} className="adminDashboardItem" style={{flexDirection: 'column', alignItems: 'flex-start'}}>
                                <div style={{display: 'flex', justifyContent: 'space-between', width: '100%'}}>
                                    <p className="adminDashboardItemTitle">{report.reason || "No Reason"}</p>
                                    <p style={{fontSize: '12px', color: '#AAA'}}>{report.createdAt?.toDate().toLocaleString() || 'N/A'}</p>
                                </div>
                                <p style={{fontSize: '12px', color: '#CCC'}}>by {report.reporterName || 'Anonymous'}</p>
                                {report.note && <p className="paragraph" style={{fontSize:'13px', backgroundColor:'#1A1A1A', padding:'8px', borderRadius:'5px', width:'100%', margin:'5px 0 0 0'}}>{report.note}</p>}
                            </div>
                        ))}
                    </div>
                </div>
                 <button className="button" onClick={() => setActiveScreen('AdminDashboard')} style={{ backgroundColor: '#3A3A3A', marginTop: '30px' }}><span className="buttonText light">Back to Admin</span></button>
            </div>

            {showSuspensionModal && (
                <SuspensionModal 
                    userName={selectedReportGroup.reportedUserName}
                    onCancel={() => setShowSuspensionModal(false)}
                    onConfirm={(duration) => {
                        setShowSuspensionModal(false);
                        handleAction('confirm_suspend', { duration });
                    }}
                />
            )}
        </>
    );
}

export default AdminReportReviewScreen;