// src/components/DiscoverUsersScreen.jsx

import React, { useState } from 'react';
import { db, collection, query, where, getDocs, limit, orderBy, startAfter } from '../firebase';
import RoleBadge from './RoleBadge'; // <-- ADD THIS IMPORT

const DiscoverUsersScreen = ({ showMessage, setActiveScreen, setSelectedUserId, currentUser, creatorProfile }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [roleFilter, setRoleFilter] = useState('All');
    const [searchResults, setSearchResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    
    // THE FIX: Pagination State
    const [lastUserDoc, setLastUserDoc] = useState(null);
    const [hasMoreUsers, setHasMoreUsers] = useState(false);

    const handleSearch = async (e, isLoadMore = false) => {
        if (e) e.preventDefault();
        if (!currentUser) {
            showMessage("Please log in to find creators.");
            setActiveScreen('Login');
            return;
        }

        setIsLoading(true);
        if (!isLoadMore) {
            setHasSearched(true);
            setSearchResults([]);
            setLastUserDoc(null);
        }
        
        try {
            const usersRef = collection(db, "creators");
            
            // 1. Fetch blocks
            const blockedUsersRef = collection(db, "creators", currentUser.uid, "blockedUsers");
            const blockedByRef = collection(db, "creators", currentUser.uid, "blockedBy");
            const [blockedUsersSnap, blockedBySnap] = await Promise.all([getDocs(blockedUsersRef), getDocs(blockedByRef)]);
            const blockedIds = new Set([...blockedUsersSnap.docs.map(doc => doc.id), ...blockedBySnap.docs.map(doc => doc.id)]);

            // 2. Build Query
            let qConstraints = [orderBy("creatorName", "asc")];
            
            // Security: Non-admins only see users/creators
            if (creatorProfile?.role !== 'admin' && creatorProfile?.role !== 'authority') {
                qConstraints.push(where('role', 'in', ['user', 'creator']));
            }
            
            if (isLoadMore && lastUserDoc) {
                qConstraints.push(startAfter(lastUserDoc));
            }

            // We pull a larger batch (40) to ensure we find enough matches after filtering blocks/roles
            const q = query(usersRef, ...qConstraints, limit(40));
            const querySnapshot = await getDocs(q);

            // 3. Intelligent Scanner
            const filteredResults = querySnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(user => {
                    if (user.id === currentUser.uid || blockedIds.has(user.id)) return false;
                    
                    const nameInput = searchTerm.trim().toLowerCase();
                    const matchesName = nameInput === '' || (user.creatorName || '').toLowerCase().includes(nameInput);
                    
                    const roleInput = roleFilter.toLowerCase();
                    // THE FIX: Added 'creatorField' to the scanner. This matches your Dashboard's save logic.
                    const matchesRole = roleFilter === 'All' || [
                        user.creatorField, // Matches Dashboard field
                        user.creatorRole, 
                        user.talent, 
                        user.talentRole, 
                        user.artisticRole
                    ].some(f => f && f.toLowerCase() === roleInput);

                    return matchesName && matchesRole;
                });

            // 4. Enrich with Campaign Status
            const enrichedResults = await Promise.all(
                filteredResults.map(async (user) => {
                    const campaignsRef = collection(db, `artifacts/production-app-id/public/data/campaigns`);
                    const campQ = query(campaignsRef, where('creatorId', '==', user.id), where('status', '==', 'active'), limit(1));
                    const campSnap = await getDocs(campQ);
                    return { ...user, hasActiveCampaign: !campSnap.empty };
                })
            );
            
            // THE FIX: If enrichedResults is empty but querySnapshot had a full batch (40), 
            // it means we need to keep searching further down the database.
            setSearchResults(prev => isLoadMore ? [...prev, ...enrichedResults] : enrichedResults);
            
            const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1] || null;
            setLastUserDoc(lastDoc);
            
            // If the DB returned a full page, there is more to scan, even if this specific batch had 0 matches.
            setHasMoreUsers(querySnapshot.docs.length === 40);

            if (enrichedResults.length === 0 && querySnapshot.docs.length === 40) {
                showMessage("Scanning more users for matches...");
                // Automatically trigger the next batch to find that role
                handleSearch(null, true); 
            }

        } catch (error) {
            console.error("Discovery Error:", error);
            showMessage("Failed to load talent.");
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
            <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <div className="formGroup" style={{ flex: 2, minWidth: '200px' }}>
                        <label htmlFor="userSearch" className="formLabel">Search by Name:</label>
                        <input type="text" id="userSearch" className="formInput" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Enter name..." />
                    </div>
                    <div className="formGroup" style={{ flex: 1, minWidth: '150px' }}>
                        <label htmlFor="roleFilter" className="formLabel">Filter by Role:</label>
                        <select 
                                id="roleFilter" 
                                className="formInput" 
                                value={roleFilter} 
                                onChange={(e) => setRoleFilter(e.target.value)}
                                style={{ backgroundColor: '#1A1A1A', color: '#FFF' }}
                            >
                                <option value="All">All Roles</option>
                                {['Actor', 'Comedian', 'Craft', 'Designer', 'Filmmaker', 'Health & Fitness', 'Influencer', 'Musician', 'Poet'].map(role => (
                                    <option key={role} value={role}>{role}</option>
                                ))}
                            </select>
                    </div>
                </div>
                <button type="submit" className="button" disabled={isLoading} style={{ marginTop: '0' }}>
                    <span className="buttonText">{isLoading ? 'Filtering Creators...' : 'Find Talent'}</span>
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
                            <div className="user-search-name" style={{ display: 'flex', alignItems: 'center' }}>
                                {user.creatorName}
                                <RoleBadge profile={user} />
                            </div>
                            <p className="user-search-role">
                                Role: {user.creatorRole || user.talent || user.artisticRole || 'Creator'}
                                {user.hasActiveCampaign && <span className="user-search-campaign-badge" style={{ marginLeft: '10px' }}>Active Campaign</span>}
                            </p>
                        </div>
                    </div>
                ))}

                {/* THE FIX: Load More Button logic safely placed after the map but inside the list container */}
                {!isLoading && hasMoreUsers && (
                    <button 
                        className="button" 
                        onClick={() => handleSearch(null, true)} 
                        style={{ backgroundColor: '#1A1A1A', border: '1px solid #333', marginTop: '20px', width: '100%' }}
                    >
                        <span className="buttonText">Load More Creators</span>
                    </button>
                )}
                
                {isLoading && searchResults.length > 0 && (
                    <p style={{ textAlign: 'center', color: '#FFD700', fontSize: '12px', marginTop: '10px' }}>Fetching more talent...</p>
                )}
            </div>
        </div>
    );
};

export default DiscoverUsersScreen;