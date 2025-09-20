// src/components/AdminModerationQueue.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { db, collection, query, where, orderBy, onSnapshot } from '../firebase';

function AdminModerationQueue({ showMessage, setActiveScreen, setSelectedReportGroup }) {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);

    // --- REAL-TIME DATA FETCHING ---
    useEffect(() => {
        const reportsRef = collection(db, "reports");
        const q = query(reportsRef, where("status", "==", "pending"), orderBy("createdAt", "asc"));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setReports(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoading(false);
        }, (error) => {
            console.error("Error fetching reports:", error);
            showMessage("Failed to load moderation queue.");
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // --- "SMART GROUPING" LOGIC ---
    // This hook automatically groups and sorts the reports whenever the raw `reports` state changes.
    const groupedReports = useMemo(() => {
        const groups = new Map();
        reports.forEach(report => {
            const key = report.contentId;
            if (!groups.has(key)) {
                groups.set(key, {
                    contentId: report.contentId,
                    contentTitle: report.contentTitle,
                    reportedUserId: report.reportedUserId,
                    reportedUserName: report.reportedUserName,
                    reportCount: 0,
                    reports: []
                });
            }
            const group = groups.get(key);
            group.reportCount++;
            group.reports.push(report);
        });
        // Convert the map to an array and sort it to show the most reported items first.
        return Array.from(groups.values()).sort((a, b) => b.reportCount - a.reportCount);
    }, [reports]);


    const handleReviewClick = (reportGroup) => {
        setSelectedReportGroup(reportGroup);
        setActiveScreen('AdminReportReview');
    };

    return (
        <div className="dashboardSection">
            <p className="heading" style={{ fontSize: '20px', margin: '0 0 5px 0' }}>Moderation Queue</p>
            <p className="subHeading" style={{ textAlign: 'center', margin: '0 0 20px 0' }}>Content reported by the community. Items with the most reports are shown first.</p>
            
            {loading ? (
                <p className="dashboardItem">Loading reports...</p>
            ) : groupedReports.length === 0 ? ( // Changed from mockReports to groupedReports
                <p className="dashboardItem" style={{ textAlign: 'center' }}>The queue is empty. No pending reports.</p>
            ) : (
                <div className="dashboardContentList">
                    {groupedReports.map(group => ( // Changed from mockReports to groupedReports
                        <div key={group.contentId} className="adminDashboardItem" style={{ borderLeft: '4px solid #DC3545' }}>
                            <div style={{ flexGrow: 1 }}>
                                <p className="adminDashboardItemTitle">{group.contentTitle}</p>
                                <p style={{ fontSize: '12px', color: '#CCC' }}>
                                    by {group.reportedUserName}
                                </p>
                            </div>
                            <div style={{ textAlign: 'center', margin: '0 15px' }}>
                                <p className="adminDashboardItemTitle" style={{ fontSize: '20px', color: '#FFD700' }}>{group.reportCount}</p>
                                <p style={{ fontSize: '12px', color: '#AAA' }}>Report(s)</p>
                            </div>
                            <button 
                                className="adminActionButton approve"
                                onClick={() => handleReviewClick(group)}
                            >
                                Review
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default AdminModerationQueue;