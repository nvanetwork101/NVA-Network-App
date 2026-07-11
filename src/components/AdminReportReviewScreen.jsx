// src/components/AdminReportReviewScreen.jsx

import React, { useState, useEffect } from 'react';
import { db, functions, httpsCallable, doc, getDoc, extractVideoInfo } from '../firebase';
import SuspensionModal from './SuspensionModal';

function AdminReportReviewScreen({
    showMessage,
    setActiveScreen,
    currentUser, 
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
                const contentRef = doc(db, `artifacts/production-app-id/public/data/content_items`, selectedReportGroup.contentId);
                const docSnap = await getDoc(contentRef);
                if (docSnap.exists()) {
                    setContent({ id: docSnap.id, ...docSnap.data() });
                } else {
                    showMessage("Could not find the reported content. It may have been deleted.");
                    setContent(null);
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

    const customStyles = `
        /* SPLIT SCREEN LAYOUT */
        .moderator-command-grid {
            display: grid;
            grid-template-columns: 1.2fr 1fr;
            gap: 24px;
            width: 100%;
            margin-top: 20px;
        }
        @media (max-width: 1024px) {
            .moderator-command-grid {
                grid-template-columns: 1fr;
                gap: 20px;
            }
        }

        /* METADATA BANNER */
        .command-header-card {
            background: linear-gradient(135deg, rgba(255, 215, 0, 0.05) 0%, rgba(10, 10, 10, 0.8) 100%);
            border: 1px solid rgba(255, 215, 0, 0.15);
            border-radius: 16px;
            padding: 20px;
            margin-bottom: 24px;
            display: flex;
            justify-content: space-between;
            align-items: center;
            flex-wrap: wrap;
            gap: 15px;
        }
        .header-meta-group { display: flex; flex-direction: column; gap: 4px; text-align: left; }
        .meta-label { font-size: 11px; text-transform: uppercase; color: #888; font-weight: 700; letter-spacing: 0.05em; }
        .meta-val { font-size: 16px; color: #FFF; font-weight: 800; margin: 0; }
        .meta-val.warning { color: #FFD700; }

        /* SCROLLABLE PANEL FOR REPORTS */
        .reports-list-container {
            max-height: 400px;
            overflow-y: auto;
            padding-right: 8px;
        }
        .reports-list-container::-webkit-scrollbar { width: 6px; }
        .reports-list-container::-webkit-scrollbar-thumb { background: #333; border-radius: 10px; }

        /* PREMIUM REPORT CARD */
        .report-incident-card {
            background: rgba(255, 255, 255, 0.02);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 12px;
            text-align: left;
            transition: border-color 0.2s;
        }
        .report-incident-card:hover {
            border-color: rgba(255, 215, 0, 0.15);
        }
        .incident-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
        .incident-reason { font-size: 14px; font-weight: 800; color: #FFF; margin: 0; }
        .incident-time { font-size: 11px; color: #666; font-weight: 600; }
        .incident-reporter { font-size: 12px; color: #FFD700; font-weight: 700; margin: 0 0 8px 0; }
        .incident-note { font-size: 13px; color: #CCC; line-height: 1.4; background: rgba(0, 0, 0, 0.3); padding: 12px; border-radius: 8px; border-left: 3px solid #555; margin: 0; }

        /* AUTOPLAY THEATER PREVIEW PANEL */
        .theater-preview-panel {
            background: #000;
            border: 1px solid #222;
            border-radius: 16px;
            overflow: hidden;
            position: relative;
            width: 100%;
            aspect-ratio: 16 / 9; /* Enforces clean landscape ratio */
            box-shadow: 0 10px 40px rgba(0,0,0,0.8);
        }
        .theater-preview-panel.vertical {
            aspect-ratio: 9 / 16; /* Enforces clean vertical ratio */
            max-width: 340px;
            margin: 0 auto;
        }
        .theater-iframe {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border: none;
        }

        /* CONTROL BUTTONS */
        .mod-action-card {
            background: rgba(30, 30, 30, 0.3);
            border: 1px solid rgba(255, 255, 255, 0.05);
            border-radius: 16px;
            padding: 24px;
            text-align: left;
        }
        .mod-btn-group { display: flex; flex-direction: column; gap: 12px; margin-top: 15px; }
        .mod-btn {
            width: 100%;
            padding: 14px;
            border-radius: 10px;
            font-size: 13px;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            cursor: pointer;
            border: 1px solid transparent;
            transition: all 0.25s ease;
            text-align: center;
        }
        .mod-btn.dismiss { background: rgba(0, 128, 0, 0.1); border-color: rgba(0, 128, 0, 0.3); color: #4ADE80; }
        .mod-btn.dismiss:hover { background: #008000; color: #FFF; box-shadow: 0 0 15px rgba(0, 128, 0, 0.4); }
        .mod-btn.remove { background: rgba(255, 140, 0, 0.1); border-color: rgba(255, 140, 0, 0.3); color: #FB923C; }
        .mod-btn.remove:hover { background: #FF8C00; color: #000; box-shadow: 0 0 15px rgba(255, 140, 0, 0.4); }
        .mod-btn.suspend { background: rgba(220, 53, 69, 0.1); border-color: rgba(220, 53, 69, 0.3); color: #F87171; }
        .mod-btn.suspend:hover { background: #DC3545; color: #FFF; box-shadow: 0 0 15px rgba(220, 53, 69, 0.4); }
    `;

    return (
        <>
            <style>{customStyles}</style>
            <div className="screenContainer" style={{ paddingBottom: '40px' }}>
                {/* --- NAVIGATION AND HEADING --- */}
                <div style={{ display: 'flex', alignItems: 'center', marginBottom: '24px' }}>
                    <button 
                        onClick={() => setActiveScreen('AdminDashboard')} 
                        style={{ 
                            background: 'none', 
                            border: '1px solid #FFD700', 
                            color: '#FFD700', 
                            borderRadius: '50%', 
                            width: '40px', 
                            height: '40px', 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center', 
                            cursor: 'pointer', 
                            marginRight: '15px',
                            transition: 'background 0.2s'
                        }}
                    >
                        &#x2190;
                    </button>
                    <p className="heading" style={{ margin: 0, textAlign: 'left', flexGrow: 1 }}>Incident Center</p>
                </div>

                {/* --- TARGET METADATA CARD --- */}
                <div className="command-header-card">
                    <div className="header-meta-group">
                        <span className="meta-label">Reported Item</span>
                        <span className="meta-val">{selectedReportGroup.contentTitle}</span>
                    </div>
                    <div className="header-meta-group">
                        <span className="meta-label">Content Creator</span>
                        <span className="meta-val warning">@{selectedReportGroup.reportedUserName}</span>
                    </div>
                    <div className="header-meta-group">
                        <span className="meta-label">Reports</span>
                        <span className="meta-val" style={{ color: '#F87171' }}>{selectedReportGroup.reports?.length || 0}</span>
                    </div>
                </div>

                <div className="moderator-command-grid">
                    {/* LEFT COLUMN: THEATER VIDEO PREVIEW */}
                    <div className={`theater-preview-panel ${isVertical ? 'vertical' : ''}`}>
                        {loadingContent ? (
                            <p style={{ color: '#888', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', margin: 0 }}>Analyzing content...</p>
                        ) : content ? (
                            <iframe 
                                className="theater-iframe"
                                src={embedUrl || content.mainUrl} 
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
                                allowFullScreen 
                                title="Incident Evidence Replay"
                            />
                        ) : (
                            <div style={{ padding: '24px', textAlign: 'center', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: '100%' }}>
                                <p style={{ color: '#F87171', fontWeight: '800', margin: '0 0 8px 0' }}>Evidence Offline</p>
                                <p style={{ color: '#666', fontSize: '11px', margin: 0 }}>The reported video may have been deleted by the creator.</p>
                            </div>
                        )}
                    </div>

                    {/* RIGHT COLUMN: ACTIONS & LOGS */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                        {/* Action Panel */}
                        <div className="mod-action-card">
                            <p className="dashboardSectionTitle" style={{ margin: 0, fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Authorize Enforcement</p>
                            <div className="mod-btn-group">
                                <button className="mod-btn dismiss" onClick={() => handleAction('dismiss_reports')}>
                                    Dismiss All Reports
                                </button>
                                <button className="mod-btn remove" onClick={() => handleAction('remove_content')}>
                                    Remove Content
                                </button>
                                <button className="mod-btn suspend" onClick={() => handleAction('suspend_user')}>
                                    Suspend User Account
                                </button>
                            </div>
                        </div>

                        {/* Incident Log Panel */}
                        <div className="mod-action-card">
                            <p className="dashboardSectionTitle" style={{ margin: '0 0 15px 0', fontSize: '13px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Incident Logs</p>
                            <div className="reports-list-container">
                                {(selectedReportGroup.reports || []).map((report, index) => (
                                    <div key={index} className="report-incident-card">
                                        <div className="incident-header">
                                            <p className="incident-reason">{report.reason || "Guideline Infraction"}</p>
                                            <span className="incident-time">
                                                {report.createdAt?.toDate ? report.createdAt.toDate().toLocaleDateString() : 'N/A'}
                                            </span>
                                        </div>
                                        <p className="incident-reporter" style={{ color: '#FFD700', fontWeight: '700' }}>
    Flagged by: {report.reporterName || 'Unknown'} ({report.reporterEmail || 'No Email'})
</p>
                                        {report.note && (
                                            <p className="incident-note">{report.note}</p>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Back Button */}
                <button 
                    className="button" 
                    onClick={() => setActiveScreen('AdminDashboard')} 
                    style={{ backgroundColor: '#1A1A1A', border: '1px solid #333', marginTop: '30px', maxWidth: '200px' }}
                >
                    <span className="buttonText light">Exit Command Panel</span>
                </button>
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