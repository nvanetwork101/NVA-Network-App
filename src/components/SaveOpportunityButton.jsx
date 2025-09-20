// src/components/SaveOpportunityButton.jsx

import React, { useState, useEffect } from 'react';
import { db, functions, doc, onSnapshot, deleteDoc, setDoc, httpsCallable } from '../firebase';

const SaveOpportunityButton = ({ currentUser, opportunityId, showMessage }) => {
    const [isSaved, setIsSaved] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!currentUser) {
            setIsLoading(false);
            return;
        }
        // Listen directly to the document in the user's subcollection
        const savedDocRef = doc(db, "creators", currentUser.uid, "savedOpportunities", opportunityId);
        const unsubscribe = onSnapshot(savedDocRef, (docSnap) => {
            setIsSaved(docSnap.exists());
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, [currentUser, opportunityId]);

    const handleToggleSave = async (e) => {
        e.stopPropagation(); // Prevents the parent list item from being clicked
        if (!currentUser || isLoading) return;
        
        setIsLoading(true);
        const savedDocRef = doc(db, "creators", currentUser.uid, "savedOpportunities", opportunityId);
        
        try {
            if (isSaved) {
                await deleteDoc(savedDocRef);
                showMessage("Opportunity removed from Saved.");
            } else {
                await setDoc(savedDocRef, { savedAt: new Date() });
                showMessage("Opportunity Saved!");
            }
        } catch (error) {
            console.error("Error toggling saved opportunity:", error);
            showMessage("An error occurred. Please try again.");
        } 
        // No finally block needed, the onSnapshot listener will set loading to false
    };
    
    const bookmarkIconPath = "M17 3H7c-1.1 0-2 .9-2 2v16l7-3 7 3V5c0-1.1-.9-2-2-2z";

    return (
        <button 
            onClick={handleToggleSave} 
            disabled={isLoading} 
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '5px' }}
            title={isSaved ? "Unsave this opportunity" : "Save this opportunity"}
        >
            <svg viewBox="0 0 24 24" style={{ width: '24px', height: '24px', fill: isSaved ? '#FFD700' : '#FFF', opacity: isLoading ? 0.5 : 1 }}>
                <path d={bookmarkIconPath}></path>
            </svg>
        </button>
    );
};

export default SaveOpportunityButton;