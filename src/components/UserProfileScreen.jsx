// src/components/UserProfileScreen.jsx

import React, { useState, useEffect } from 'react';
import { db, functions, doc, onSnapshot, collection, query, where, getDocs, orderBy, limit, httpsCallable, updateDoc, getDoc, setDoc } from '../firebase';
import { Timestamp } from 'firebase/firestore';
import ProfilePictureModal from './ProfilePictureModal'; 
import RoleBadge from './RoleBadge'; // <-- ADD THIS IMPORT

// --- Reusable Child Component for Stats ---
import ShareButton from './ShareButton';

const ContentStats = ({ item, currentUser, showMessage }) => {
    const LikeButtonVisual = () => (
         <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: 'rgba(10,10,10,0.7)', padding: '4px 12px', borderRadius: '15px', border: '1px solid #444' }}>
            <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: '#FFD700' }}>
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path>
            </svg>
            <span style={{color: '#FFF', fontSize: '12px'}}>{(item.likeCount || 0).toLocaleString()}</span>
        </div>
    );

    return (
        <div style={{ padding: '0 10px 10px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '5px', color: '#AAA', fontSize: '12px', background: '#2A2A2A', borderBottomLeftRadius: '10px', borderBottomRightRadius: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <svg viewBox="0 0 24 24" style={{ width: '16px', height: '16px', fill: 'currentColor' }}><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5C21.27 7.61 17 4.5 12 4.5zm0 10c-2.48 0-4.5-2.02-4.5-4.5S9.52 5.5 12 5.5s4.5 2.02 4.5 4.5-2.02 4.5-4.5 4.5zM12 8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"></path></svg>
                <span>{(item.viewCount || 0).toLocaleString()}</span>
            </div>
            <LikeButtonVisual />
        </div>
    );
};


const UserProfileScreen = ({ 
    selectedUserId, 
    setActiveScreen,
    setSelectedCampaignId,
    setSelectedChatId, // <-- ADD THIS NEW PROP
    showMessage, 
    currentUser, 
    creatorProfile, 
    setOnConfirmationAction, 
    setShowConfirmationModal, 
    setConfirmationTitle, 
    setConfirmationMessage, 
    handleVideoPress,
    previousScreen
}) => {
    const [profile, setProfile] = useState(null);
    const [loadingProfile, setLoadingProfile] = useState(true);
    const [activeCampaign, setActiveCampaign] = useState(null);
    const [isFollowing, setIsFollowing] = useState(false);
    const [isFollowLoading, setIsFollowLoading] = useState(true);
    const [isBlocked, setIsBlocked] = useState(false);
    const [isBlockLoading, setIsBlockLoading] = useState(true);
    const [pinnedContent, setPinnedContent] = useState([]);
    const [allContent, setAllContent] = useState([]);
    const [loadingContent, setLoadingContent] = useState(true);
    const [showPfpModal, setShowPfpModal] = useState(false);
    
    const [isUpdatingRole, setIsUpdatingRole] = useState(false);

    useEffect(() => {
        if (!selectedUserId) { setActiveScreen('DiscoverUsers'); return; }
        
        const userDocRef = doc(db, "creators", selectedUserId);
        const unsubscribeProfile = onSnapshot(userDocRef, (userDocSnap) => {
            if (userDocSnap.exists()) {
                const profileData = { id: userDocSnap.id, ...userDocSnap.data() };
                setProfile(profileData);
                fetchContentLibrary(profileData.id, profileData.pinnedContent || []);
            } else {
                showMessage("This user profile could not be found.");
                setActiveScreen('DiscoverUsers');
            }
            setLoadingProfile(false);
        });

        const campaignsRef = collection(db, `artifacts/production-app-id/public/data/campaigns`);
        const q = query(campaignsRef, where("creatorId", "==", selectedUserId), where("status", "==", "active"), limit(1));
        const unsubscribeCampaign = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                setActiveCampaign({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
            } else {
                setActiveCampaign(null);
            }
        });

        let unsubscribeFollow = () => {};
        let unsubscribeBlock = () => {};
        if (currentUser) {
            const followDocRef = doc(db, "creators", selectedUserId, "followers", currentUser.uid);
            unsubscribeFollow = onSnapshot(followDocRef, (snap) => setIsFollowing(snap.exists()));
            setIsFollowLoading(false);

            const blockDocRef = doc(db, "creators", currentUser.uid, "blockedUsers", selectedUserId);
            unsubscribeBlock = onSnapshot(blockDocRef, (snap) => setIsBlocked(snap.exists()));
            setIsBlockLoading(false);
        } else {
            setIsFollowLoading(false);
            setIsBlockLoading(false);
        }

        return () => { unsubscribeProfile(); unsubscribeCampaign(); unsubscribeFollow(); unsubscribeBlock(); };
    }, [selectedUserId, currentUser]);

    const fetchContentLibrary = async (userId, pinnedIds) => {
        setLoadingContent(true);
        try {
            const contentRef = collection(db, `artifacts/production-app-id/public/data/content_items`);
            
            if (pinnedIds && pinnedIds.length > 0) {
                const pinnedQuery = query(contentRef, where("__name__", "in", pinnedIds), where("isActive", "==", true));
                const pinnedSnapshot = await getDocs(pinnedQuery);
                const pinnedData = pinnedSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                pinnedData.sort((a, b) => pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id));
                setPinnedContent(pinnedData);
            } else {
                setPinnedContent([]);
            }

            const allContentQuery = query(contentRef, where("creatorId", "==", userId), where("isActive", "==", true), orderBy("createdAt", "desc"));
            const allContentSnapshot = await getDocs(allContentQuery);
            const allContentData = allContentSnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(item => !(pinnedIds && pinnedIds.includes(item.id))); 
            setAllContent(allContentData);

        } catch (error) {
            showMessage("Could not load the creator's content library.");
            console.error("Error fetching content library:", error);
        } finally {
            setLoadingContent(false);
        }
    };
    
    // ====================== START: MODIFIED CODE BLOCK (ADMIN HANDLERS) ======================
    const handleFollowToggle = async () => {
        if (!currentUser) {
            showMessage("Please log in to follow creators.");
            setActiveScreen('Login');
            return;
        }
        if (isFollowLoading) return; // Prevent double-clicks

        setIsFollowLoading(true);
        const newFollowState = !isFollowing; // Determine the action we are about to take

        try {
            const toggleFollowFunction = httpsCallable(functions, 'toggleFollow');
            await toggleFollowFunction({ 
                targetUserId: selectedUserId, 
                isFollowing: newFollowState 
            });
            // No need to show a success message here, as the UI will update instantly
            // via the onSnapshot listener, which is a better user experience.
        } catch (error) {
            showMessage(`An error occurred: ${error.message}`);
            console.error("Error toggling follow:", error);
            // The onSnapshot listener will automatically revert the UI if the backend call fails.
        } finally {
            setIsFollowLoading(false);
        }
    };
    const handleToggleBlock = async () => {
        if (!currentUser) {
            showMessage("Please log in to block users.");
            setActiveScreen('Login');
            return;
        }
        if (isBlockLoading) return;

        setIsBlockLoading(true);

        try {
            const toggleBlockUserCallable = httpsCallable(functions, 'toggleBlockUser');
            const result = await toggleBlockUserCallable({ targetUserId: selectedUserId });
            showMessage(result.data.message);
            // If the user was just blocked, navigate away from their profile.
            if (!isBlocked) { 
                setActiveScreen('DiscoverUsers');
            }
        } catch (error) {
            showMessage(`An error occurred: ${error.message}`);
            console.error("Error toggling block:", error);
        } finally {
            setIsBlockLoading(false);
        }
    };

    const handleMessageClick = async () => {
    if (!currentUser || !creatorProfile) {
        showMessage("Please log in to send messages.");
        setActiveScreen('Login');
        return;
    }

    const targetUserUid = profile.id;
    if (currentUser.uid === targetUserUid) {
        showMessage("You cannot start a conversation with yourself.");
        return;
    }

    // Generate a predictable, canonical chat ID
    const participants = [currentUser.uid, targetUserUid].sort();
    const chatId = participants.join('_');
    
    try {
        const chatDocRef = doc(db, 'chats', chatId);
        const chatDocSnap = await getDoc(chatDocRef);

        if (!chatDocSnap.exists()) {
            const newChatData = {
                participants: participants,
                createdAt: Timestamp.now(),
                lastMessage: null,
                lastMessageTimestamp: null,
                participantDetails: {
                    [currentUser.uid]: {
                        creatorName: creatorProfile.creatorName || "Unknown User",
                        profilePictureUrl: creatorProfile.profilePictureUrl || null
                    },
                    [targetUserUid]: {
                        creatorName: profile.creatorName,
                        profilePictureUrl: profile.profilePictureUrl || null
                    }
                }
            };
            await setDoc(chatDocRef, newChatData);
        }

        setSelectedChatId(chatId);
        setActiveScreen('ChatMessageScreen');

    } catch (error) {
        console.error("Error starting chat:", error);
        showMessage("Could not start a conversation. Please try again later.");
    }
};

const handleShareClick = async () => {
    const shareUrl = `${window.location.origin}/user/${profile.id}`;
    if (navigator.share) {
        try {
            await navigator.share({
                title: profile.creatorName,
                text: `Check out ${profile.creatorName}'s profile on NVA Network!`,
                url: shareUrl
            });
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error("Sharing failed:", error);
                showMessage("Could not share profile at this time.");
            }
        }
    } else {
        try {
            await navigator.clipboard.writeText(shareUrl);
            showMessage("Profile URL copied to clipboard!");
        } catch (err) {
            console.error('Failed to copy: ', err);
            showMessage("Could not copy URL. Your browser may not support this feature.");
        }
    }
};
    
    const handleRoleChange = async (newRole) => { /* ... existing logic ... */ };
    
    const handleToggleBan = () => {
        const action = profile.banned ? 'Unban' : 'Ban';
        setConfirmationTitle(`${action} User?`);
        setConfirmationMessage(`Are you sure you want to ${action.toLowerCase()} user ${profile.creatorName}?`);
        setOnConfirmationAction(() => async () => {
            showMessage(`Processing ${action}...`);
            try {
                const toggleBanFunction = httpsCallable(functions, 'toggleUserBanStatus');
                const result = await toggleBanFunction({ targetUserId: profile.id });
                showMessage(result.data.message);
            } catch (error) {
                showMessage(`Error: ${error.message}`);
            }
        });
        setShowConfirmationModal(true);
    };
    
    const handleLiftSuspension = () => {
        setConfirmationTitle("Lift Suspension?");
        setConfirmationMessage(`Are you sure you want to immediately lift the suspension for ${profile.creatorName}?`);
        setOnConfirmationAction(() => async () => {
            showMessage("Lifting suspension...");
            try {
                const liftSuspensionFunction = httpsCallable(functions, 'liftUserSuspension');
                const result = await liftSuspensionFunction({ targetUserId: profile.id });
                showMessage(result.data.message);
            } catch (error) {
                showMessage(`Error: ${error.message}`);
            }
        });
        setShowConfirmationModal(true);
    };

    const handleDeleteUser = () => {
        setConfirmationTitle("🛑 PERMANENTLY DELETE USER? 🛑");
        setConfirmationMessage(`You are about to delete '${profile.creatorName}' and ALL of their data. This action is irreversible. Are you absolutely sure?`);
        setOnConfirmationAction(() => async () => {
            showMessage("Initiating permanent deletion...");
            try {
                const deleteUserCallable = httpsCallable(functions, 'deleteUserAccount');
                const result = await deleteUserCallable({ userIdToDelete: profile.id });
                showMessage(result.data.message);
                setActiveScreen('AdminDashboard');
            } catch (error) {
                console.error("Error deleting user:", error);
                showMessage(`Deletion failed: ${error.message}`);
            }
        });
        setShowConfirmationModal(true);
    };
    // ======================= END: MODIFIED CODE BLOCK (ADMIN HANDLERS) =======================

    if (loadingProfile) { return <div className="screenContainer"><p className="heading">Loading Profile...</p></div>; }
    if (!profile) return null;

    const canManageUser = creatorProfile && (creatorProfile.role === 'admin' || creatorProfile.role === 'authority') && currentUser?.uid !== profile.id;
    const isSuspended = profile.suspendedUntil && profile.suspendedUntil.toDate() > new Date();

    return (
        <>
            <div className="screenContainer">
                <div className="dashboardSection">
                    <div style={{display: 'flex', alignItems: 'center', gap: '20px'}}>
                        <img src={profile.profilePictureUrl || 'https://placehold.co/100x100/555/FFF?text=P'} alt="Profile" style={{width: '80px', height: '80px', borderRadius: '50%', border: '2px solid #FFD700', objectFit: 'cover', cursor: 'pointer'}} onClick={() => setShowPfpModal(true)} />
                        <div style={{flexGrow: 1, minWidth: 0}}>
                            <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '5px' }}>
                                <p className="dashboardItem" style={{fontSize: '20px', fontWeight: 'bold', color: '#FFF', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'}}>
                                    {profile.creatorName}
                                </p>
                                <RoleBadge profile={profile} />
                                {activeCampaign && (
                                    <span className="user-search-campaign-badge" style={{cursor: 'pointer'}} onClick={() => {
                                        setSelectedCampaignId(activeCampaign.id);
                                        setActiveScreen('CampaignDetails');
                                    }}>
                                        Active Campaign
                                    </span>
                                )}
                            </div>
                            <p className="dashboardItem" style={{ color: '#AAA', margin: '0 0 10px 0' }}>
                                Role: {profile.role}
                            </p>
                            <div className="follow-stats">
                                <div className="follow-stat-item"><span className="follow-stat-value">{profile.followerCount || 0}</span><span className="follow-stat-label">Followers</span></div>
                                <div className="follow-stat-item"><span className="follow-stat-value">{profile.followingCount || 0}</span><span className="follow-stat-label">Following</span></div>
                            </div>
                        </div>
                    </div>

                    {currentUser && currentUser.uid !== selectedUserId && (
    <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginTop: '15px'}}>
        <button 
            className="button" 
            onClick={handleFollowToggle} 
            disabled={isFollowLoading}
            style={{
                margin: 0,
                backgroundColor: isFollowing ? 'transparent' : '#FFD700',
                border: '1px solid #FFD700',
                flex: 1 /* Let this button grow */
            }}
        >
            <span className="buttonText" style={{ color: isFollowing ? '#FFD700' : '#0A0A0A', fontWeight: 'bold' }}>
                {isFollowLoading ? '...' : (isFollowing ? 'Following' : 'Follow')}
            </span>
        </button>
        
        {/* --- ICON BUTTONS --- */}
        <button title="Message User" className="button" onClick={handleMessageClick} style={{margin: 0, backgroundColor: '#3A3A3A', flexShrink: 0, width: '44px', height: '44px', padding: '10px' }}>
            <svg fill="#FFFFFF" viewBox="0 0 24 24" style={{ width: '24px', height: '24px' }}><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z"></path></svg>
        </button>
         <button title="Share Profile" className="button" onClick={handleShareClick} style={{margin: 0, backgroundColor: '#3A3A3A', flexShrink: 0, width: '44px', height: '44px', padding: '10px' }}>
           <svg fill="#FFFFFF" viewBox="0 0 24 24" style={{ width: '24px', height: '24px' }}><path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"></path></svg>
        </button>
        {/* --- END ICON BUTTONS --- */}

        <button className="button" onClick={handleToggleBlock} disabled={isBlockLoading} style={{margin: 0, backgroundColor: isBlocked ? '#FF8C00' : '#DC3545', flex: 1 /* Let this button grow */ }}>
            <span className="buttonText">{isBlockLoading ? '...' : (isBlocked ? 'Unblock' : 'Block')}</span>
        </button>
    </div>
)}
                    
                    <div style={{borderTop: '1px solid #3A3A3A', paddingTop: '15px', marginTop: '15px'}}>
                        <p className="dashboardItem"><strong>Bio:</strong> {profile.bio || "No bio provided."}</p>
                        <p className="dashboardItem"><strong>Categories:</strong> {profile.categories?.length > 0 ? profile.categories.join(', ') : "No categories set."}</p>
                    </div>
                </div>

                {canManageUser && (
                    <div className="dashboardSection" style={{border: '2px solid #DC3545'}}>
                        <p className="dashboardSectionTitle">Admin Controls</p>
                        {(() => {
                            const isTargetAdminOrAuthority = profile.role === 'admin' || profile.role === 'authority';
                            const viewerIsAuthority = creatorProfile.role === 'authority';
                            const isDisabled = viewerIsAuthority && isTargetAdminOrAuthority;

                            return <>
                                <div className="formGroup">
                                    <label className="formLabel">Change Role:</label>
                                    <select className="formInput" value={profile.role} onChange={(e) => handleRoleChange(e.target.value)} disabled={isDisabled || viewerIsAuthority}>
                                        <option value="user">User</option>
                                        <option value="creator">Creator</option>
                                        <option value="authority">Authority</option>
                                        {creatorProfile.role === 'admin' && <option value="admin">Admin</option>}
                                    </select>
                                </div>
                                <div style={{display: 'flex', gap: '10px', marginTop: '15px'}}>
                                    {isSuspended ? (
                                        <button className="button" onClick={handleLiftSuspension} style={{flex: 1, margin: 0, backgroundColor: '#008000'}} disabled={isDisabled}>
                                            <span className="buttonText">Lift Suspension</span>
                                        </button>
                                    ) : (
                                        <button className="button" onClick={handleToggleBan} style={{flex: 1, margin: 0, backgroundColor: profile.banned ? '#008000' : '#DC3545'}} disabled={isDisabled}>
                                            <span className="buttonText">{profile.banned ? 'Unban User' : 'Ban User'}</span>
                                        </button>
                                    )}
                                    {/* Delete is an admin-only action */}
                                    {creatorProfile.role === 'admin' && (
                                        <button className="button" onClick={handleDeleteUser} style={{flex: 1, margin: 0, backgroundColor: '#a00000'}}>
                                            <span className="buttonText">Permanently Delete User</span>
                                        </button>
                                    )}
                                </div>
                                {isDisabled && <p className="smallText" style={{textAlign: 'center', color: '#FFD700', marginTop: '10px'}}>Authorities cannot take administrative action against other Authorities or Admins.</p>}
                            </>;
                        })()}
                    </div>
                )}
                
                <div className="profile-content-section">
                    <p className="sectionTitle">Pinned Content</p>
                    {loadingContent ? <p className="dashboardItem">Loading content...</p> : pinnedContent.length === 0 ? <p className="dashboardItem">This creator hasn't pinned any content yet.</p> : (
                        <div className="contentGrid">
                            {pinnedContent.map(item => (
                                <div key={item.id} className="pinned-item-card">
                                    <div onClick={() => handleVideoPress(item.embedUrl || item.mainUrl, item)} style={{cursor: 'pointer'}}>
                                        <div className="pinned-indicator-icon"><svg viewBox="0 0 24 24"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"></path></svg></div>
                                        <img src={item.customThumbnailUrl} alt={item.title} className="pinned-item-thumbnail" />
                                        <p className="contentTitle">{item.title}</p>
                                    </div>
                                    <ContentStats item={item} currentUser={currentUser} showMessage={showMessage} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                
                <div className="profile-content-section">
                    <p className="sectionTitle">All Content</p>
                    {loadingContent ? <p className="dashboardItem">Loading content...</p> : allContent.length === 0 ? <p className="dashboardItem">This creator hasn't uploaded any other content.</p> : (
                        <div className="contentGrid">
                            {allContent.map(item => (
                                <div key={item.id} className="contentCard">
                                    <div onClick={() => handleVideoPress(item.embedUrl || item.mainUrl, item)} style={{cursor: 'pointer'}}>
                                        <img src={item.customThumbnailUrl} className="thumbnailPlaceholder" alt={item.title} style={{height: '100px', objectFit: 'cover'}} onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/300x150/444/FFF?text=...'; }}/>
                                        <p className="contentTitle">{item.title}</p>
                                    </div>
                                    <ContentStats item={item} currentUser={currentUser} showMessage={showMessage} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                <div style={{display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px'}}>
                    {/* --- THIS IS THE FIX: Contextual Back Button --- */}
                    {previousScreen === 'TopCreators' ? (
                        <button className="button button-contextual" onClick={() => setActiveScreen('TopCreators')}>
                            <span className="buttonText light">Back to Charts</span>
                        </button>
                    ) : previousScreen === 'Discover' ? (
                        <button className="button button-contextual" onClick={() => setActiveScreen('Discover')}>
                            <span className="buttonText light">Back to Discover</span>
                        </button>
                    ) : (
                        <button className="button" onClick={() => setActiveScreen('DiscoverUsers')} style={{ backgroundColor: '#3A3A3A' }}>
                            <span className="buttonText light">Back to Search</span>
                        </button>
                    )}
                    {/* ------------------------------------------- */}
                    {canManageUser && (
                         <button className="button" onClick={() => setActiveScreen('AdminDashboard')} style={{ backgroundColor: '#555' }}>
                            <span className="buttonText light">Back to Admin</span>
                        </button>
                    )}
                </div>
            </div>
            {showPfpModal && profile && <ProfilePictureModal imageUrl={profile.profilePictureUrl || 'https://placehold.co/400x400/555/FFF?text=No+Image'} onClose={() => setShowPfpModal(false)} />}
        </>
    );
};

export default UserProfileScreen;