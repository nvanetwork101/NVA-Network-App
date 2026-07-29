// src/components/DiscoverUsersScreen.jsx

import React, { useState } from 'react';
import { db, collection, query, where, getDocs, limit, orderBy, startAfter } from '../firebase';
import RoleBadge from './RoleBadge'; // <-- ADD THIS IMPORT

const CREATOR_SUB_CATEGORIES = {
    'Comedian': ['Stand-up', 'Skits', 'Host / MC'],
    'Craft & Services': ['Salon & Aesthetics', 'Barber', 'Culinary & Catering', 'Event Decor', 'Gift Sets'],
    'Health & Fitness': ['Trainer', 'Gym / Fitness Center', 'Nutritionist / Dietitian', 'Physiotherapy'],
    'Designer': ['Fashion / Seamstress', 'Graphic Designer', 'Interior Designer'],
    'Influencer': ['Content Creator', 'Brand Ambassador', 'Podcaster'],
    'Poet': ['Spoken Word', 'Writer', 'Slam Poet'],
    'Musician': ['Singer', 'DJ', 'Producer', 'Band / Live Music'],
    'Filmmaker': ['Director', 'Videographer', 'Editor', 'Screenwriter'],
    'Actor': ['Screen Actor', 'Stage Actor', 'Voice Actor']
};

const DiscoverUsersScreen = ({ showMessage, setActiveScreen, setSelectedUserId, currentUser, creatorProfile }) => {
    // THE FIX: SessionStorage integration for "MemoryZ"
    const [searchTerm, setSearchTerm] = useState(() => sessionStorage.getItem('nva_search_term') || '');
    const [roleFilter, setRoleFilter] = useState(() => sessionStorage.getItem('nva_role_filter') || 'All');
    const [subRoleFilter, setSubRoleFilter] = useState(() => sessionStorage.getItem('nva_sub_role_filter') || 'All');
    const [searchResults, setSearchResults] = useState(() => {
        const saved = sessionStorage.getItem('nva_search_results');
        return saved ? JSON.parse(saved) : [];
    });
    const [isLoading, setIsLoading] = useState(false);
    const [hasSearched, setHasSearched] = useState(() => sessionStorage.getItem('nva_has_searched') === 'true');
    
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
                    const matchesRole = roleFilter === 'All' || [
                        user.creatorField === 'Craft' ? 'Craft & Services' : user.creatorField,
                        user.creatorRole, 
                        user.talent, 
                        user.talentRole, 
                        user.artisticRole
                    ].some(f => f && f.toLowerCase() === roleInput);

                    const matchesSubRole = subRoleFilter === 'All' || (user.creatorSubField || '').toLowerCase() === subRoleFilter.toLowerCase();

                    return matchesName && matchesRole && matchesSubRole;
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
            const newResults = isLoadMore ? [...searchResults, ...enrichedResults] : enrichedResults;
            setSearchResults(newResults);
            
            // SAVE STATE TO MEMORYZ
            sessionStorage.setItem('nva_search_term', searchTerm);
            sessionStorage.setItem('nva_role_filter', roleFilter);
            sessionStorage.setItem('nva_sub_role_filter', subRoleFilter);
            sessionStorage.setItem('nva_has_searched', 'true');
            sessionStorage.setItem('nva_search_results', JSON.stringify(newResults));
            
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
            <p className="heading" style={{ marginBottom: '5px' }}>Discover Creators</p>
            <p style={{ color: '#888', fontSize: '12px', margin: '0 0 20px 0', lineHeight: '1.4' }}>
                🔍 Filter by role to find actors, filmmakers, comedians, and craftsmen to build your creative network.
            </p>
            <form onSubmit={handleSearch} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <div className="formGroup" style={{ flex: 2, minWidth: '200px' }}>
                        <label htmlFor="userSearch" className="formLabel">Search by Name:</label>
                        <input type="text" id="userSearch" className="formInput" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Enter name..." />
                    </div>
                    <div className="formGroup" style={{ flex: 1, minWidth: '140px' }}>
                        <label htmlFor="roleFilter" className="formLabel">Filter by Role:</label>
                        <select 
                                id="roleFilter" 
                                className="formInput" 
                                value={roleFilter} 
                                onChange={(e) => {
                                    setRoleFilter(e.target.value);
                                    setSubRoleFilter('All');
                                }}
                                style={{ backgroundColor: '#1A1A1A', color: '#FFF' }}
                            >
                                <option value="All">All Roles</option>
                                {['Actor', 'Comedian', 'Craft & Services', 'Designer', 'Filmmaker', 'Health & Fitness', 'Influencer', 'Musician', 'Poet'].map(role => (
                                    <option key={role} value={role}>{role}</option>
                                ))}
                            </select>
                    </div>
                    <div className="formGroup" style={{ flex: 1, minWidth: '150px' }}>
                        <label htmlFor="subRoleFilter" className="formLabel">Specialization:</label>
                        <select 
                            id="subRoleFilter" 
                            className="formInput" 
                            value={subRoleFilter} 
                            onChange={(e) => setSubRoleFilter(e.target.value)}
                            style={{ backgroundColor: '#1A1A1A', color: '#FFF' }}
                        >
                            <option value="All">All Specializations</option>
                            {roleFilter !== 'All' && CREATOR_SUB_CATEGORIES[roleFilter] ? (
                                CREATOR_SUB_CATEGORIES[roleFilter].map(sub => (
                                    <option key={sub} value={sub}>{sub}</option>
                                ))
                            ) : (
                                Object.values(CREATOR_SUB_CATEGORIES).flat().map(sub => (
                                    <option key={sub} value={sub}>{sub}</option>
                                ))
                            )}
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
                                Role: {user.creatorField || user.creatorRole || user.talent || user.artisticRole || 'Creator'}
                                {user.creatorSubField && (
                                    <span style={{ color: '#00FFFF', fontWeight: 'bold', marginLeft: '6px' }}>
                                        • {user.creatorSubField}
                                    </span>
                                )}
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