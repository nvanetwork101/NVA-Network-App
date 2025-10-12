// src/components/PrivacyPolicyScreen.jsx
import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { doc, onSnapshot } from 'firebase/firestore';

const PrivacyPolicyScreen = ({ setActiveScreen }) => {
    const [content, setContent] = useState('');
    const [lastUpdated, setLastUpdated] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const legalContentDocRef = doc(db, "settings", "legalContent");
        const unsubscribe = onSnapshot(legalContentDocRef, (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                setContent(data.privacyPolicy || 'Privacy Policy content has not been set yet.');
                if (data.lastUpdatedAt) {
                    setLastUpdated(new Date(data.lastUpdatedAt).toLocaleDateString());
                }
            } else {
                setContent('Privacy Policy content could not be loaded.');
            }
            setIsLoading(false);
        });

        return () => unsubscribe(); // Cleanup listener on unmount
    }, []);

    return (
        <div className="screenContainer" style={{ textAlign: 'left', paddingBottom: '80px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <button onClick={() => window.history.back()} className="backButton">
                    &#x2190; Back
                </button>
                <p className="heading" style={{ margin: 0, flexGrow: 1, textAlign: 'center' }}>Privacy Policy</p>
                <div style={{ width: '70px' }}></div> {/* Spacer */}
            </div>

            <div className="dashboardSection" style={{ padding: '20px', lineHeight: 1.6 }}>
                {isLoading ? (
                    <p className="paragraph">Loading...</p>
                ) : (
                    <>
                        <p className="paragraph" style={{ fontStyle: 'italic', color: '#AAA' }}>
                            Last updated: {lastUpdated}
                        </p>
                        {/* This renders the text and respects newline characters */}
                        <div className="paragraph" style={{ whiteSpace: 'pre-wrap' }}>
                            {content}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default PrivacyPolicyScreen;