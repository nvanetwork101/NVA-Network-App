// src/components/AdminAppealsQueue.jsx

import React, { useState, useEffect } from 'react';
import { db, functions, httpsCallable, collection, query, where, onSnapshot } from '../firebase';

const AdminAppealsQueue = ({ showMessage }) => {
    const [appeals, setAppeals] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(null); // Tracks the ID of the appeal being processed

    useEffect(() => {
        const appealsRef = collection(db, "appeals");
        // Query for all appeals with a 'pending' status.
        const q = query(appealsRef, where("status", "==", "pending"));

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const appealsData = [];
            querySnapshot.forEach((doc) => {
                appealsData.push({ id: doc.id, ...doc.data() });
            });
            // Sort to show urgent 'suspension' appeals first
            appealsData.sort((a, b) => {
                if (a.appealType === 'suspension' && b.appealType !== 'suspension') return -1;
                if (a.appealType !== 'suspension' && b.appealType === 'suspension') return 1;
                // Secondary sort by date
                return (b.createdAt?.toDate() || 0) - (a.createdAt?.toDate() || 0);
            });
            setAppeals(appealsData);
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching appeals:", error);
            showMessage("Error: Could not fetch appeals queue.");
            setIsLoading(false);
        });

        // Cleanup subscription on component unmount
        return () => unsubscribe();
    }, [showMessage]);

    const handleAppealAction = async (appeal, action) => {
        setIsProcessing(appeal.id);
        const functionName = action === 'reinstate' ? 'reinstateUser' : 'dismissAppeal';
        const actionMessage = action === 'reinstate' ? 'Reinstating user...' : 'Dismissing appeal...';
        
        showMessage(actionMessage);
        try {
            const actionFunction = httpsCallable(functions, functionName);
            const result = await actionFunction({
                userId: appeal.userId,
                appealId: appeal.id
            });
            showMessage(result.data.message);
        } catch (error) {
            showMessage(`Error: ${error.message}`);
        } finally {
            setIsProcessing(null); // Reset processing state regardless of outcome
        }
    };

    if (isLoading) {
        return <p className="paragraph" style={{textAlign: 'center', marginTop: '20px'}}>Loading appeals...</p>;
    }

    return (
        <div className="adminSubScreenContainer">
            <p className="dashboardSectionTitle">Pending Appeals ({appeals.length})</p>
            {appeals.length === 0 ? (
                <p className="paragraph" style={{textAlign: 'center', marginTop: '20px'}}>There are no pending appeals.</p>
            ) : (
                <div className="appealsList">
                    {appeals.map(appeal => {
                        // Dynamically add a CSS class for color-coding based on appeal type.
                        const itemClass = appeal.appealType === 'suspension'
                            ? "appealItem appealItem--suspension"
                            : "appealItem";
                        
                        return (
                            <div key={appeal.id} className={itemClass}>
                                 <p className="appealHeader">
                                    <strong>{appeal.userName}</strong> ({appeal.userEmail})
                                    <span className="appealTimestamp">
                                        {appeal.createdAt?.toDate().toLocaleString()}
                                    </span>
                                </p>
                                <p className="appealType">
                                    Type: <strong>{appeal.appealType === 'suspension' ? 'Account Suspension' : 'Content Takedown'}</strong>
                                </p>
                                <p className="appealMessage">{appeal.message}</p>
                                <div className="appealActions">
                                    <button 
                                        className="adminActionButton reject"
                                        onClick={() => handleAppealAction(appeal, 'dismiss')}
                                        disabled={isProcessing === appeal.id}
                                    >
                                        {isProcessing === appeal.id ? 'Processing...' : 'Dismiss Appeal'}
                                    </button>
                                    <button 
                                        className="adminActionButton approve"
                                        onClick={() => handleAppealAction(appeal, 'reinstate')}
                                        disabled={isProcessing === appeal.id || appeal.appealType !== 'suspension'}
                                    >
                                        {isProcessing === appeal.id ? 'Processing...' : 'Reinstate User'}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

export default AdminAppealsQueue;