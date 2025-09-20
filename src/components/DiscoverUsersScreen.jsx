// src/components/DiscoverUsersScreen.jsx

import React, { useState } from 'react';
import { db, collection, query, where, getDocs, limit } from '../firebase';

const DiscoverUsersScreen = ({ showMessage, setActiveScreen, setSelectedUserId, currentUser, creatorProfile }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!currentUser) {
            showMessage("You must be logged in to search for creators.");
            setActiveScreen('Login');
            return;
        }
        if (!searchTerm.trim()) {
            setSearchResults([]);
            return;
        }

        setIsLoading(true);
        setHasSearched(true);
        
        try {
            const usersRef = collection(db, "creators");
            const q = (creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority')
                ? query(usersRef)
                : query(usersRef, where('role', 'in', ['user', 'creator']));

            const querySnapshot = await getDocs(q);

            const blockedUsersRef = collection(db, "creators", currentUser.uid, "blockedUsers");
            const blockedByRef = collection(db, "creators", currentUser.uid, "blockedBy");
            const [blockedUsersSnap, blockedBySnap] = await Promise.all([
                getDocs(blockedUsersRef),
                getDocs(blockedByRef)
            ]);
            const blockedIds = new Set([...blockedUsersSnap.docs.map(doc => doc.id), ...blockedBySnap.docs.map(doc => doc.id)]);

            const users = querySnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(user => 
                    user.id !== currentUser.uid &&
                    !blockedIds.has(user.id) &&
                    user.creatorName && user.creatorName.toLowerCase().includes(searchTerm.toLowerCase())
                );
            
            // --- NEW: Fetch campaign status for each result ---
            const usersWithCampaignStatus = await Promise.all(
                users.map(async (user) => {
                    const campaignsRef = collection(db, `artifacts/production-app-id/public/data/campaigns`);
                    const campaignQuery = query(campaignsRef, where('creatorId', '==', user.id), where('status', '==', 'active'), limit(1));
                    const campaignSnapshot = await getDocs(campaignQuery);
                    return {
                        ...user,
                        hasActiveCampaign: !campaignSnapshot.empty,
                    };
                })
            );
            
            setSearchResults(usersWithCampaignStatus);

        } catch (error) {
            console.error("Error searching users:", error);
            showMessage("Failed to search for users. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const viewProfile = (userId) => {
        setSelectedUserId(userId);
        setActiveScreen('UserProfile');
    };

    return (
        <div className="screenContainer">
            <p className="heading">Discover Creators</p>
            <form onSubmit={handleSearch}>
                <div className="formGroup">
                    <label htmlFor="userSearch" className="formLabel">Creator Name:</label>
                    <input type="text" id="userSearch" className="formInput" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Enter a creator's name..." />
                </div>
                <button type="submit" className="button" disabled={isLoading}>
                    <span className="buttonText">{isLoading ? 'Searching...' : 'Search'}</span>
                </button>
            </form>

            <div className="user-search-list">
                {isLoading && <p className="dashboardItem" style={{textAlign: 'center'}}>Searching...</p>}
                {!isLoading && hasSearched && searchResults.length === 0 && (
                    <p className="dashboardItem" style={{textAlign: 'center'}}>No users found matching "{searchTerm}".</p>
                )}
                {!isLoading && searchResults.map(user => (
                    <div key={user.id} className="user-search-item" style={{cursor: 'pointer'}} onClick={() => viewProfile(user.id)}>
                        <img src={user.profilePictureUrl || 'https://placehold.co/100x100/555/FFF?text=P'} alt={user.creatorName} className="user-search-pfp"/>
                        <div className="user-search-info">
                            <p className="user-search-name">
                                {user.creatorName}
                                {user.hasActiveCampaign && <span className="user-search-campaign-badge">Active Campaign</span>}
                            </p>
                            <p className="user-search-role">Role: {user.role}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default DiscoverUsersScreen;