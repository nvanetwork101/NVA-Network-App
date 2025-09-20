import React, { useState, useEffect } from 'react';
import { db, functions, httpsCallable, collection, onSnapshot, query, where, getDocs } from '../firebase';

const BlockedListScreen = ({ currentUser, setActiveScreen, showMessage }) => {
    const [blockedUsers, setBlockedUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    // This listener automatically keeps the blocked list up-to-date.
    useEffect(() => {
        if (!currentUser) {
            setActiveScreen('Login');
            return;
        }

        const blockedUsersRef = collection(db, "creators", currentUser.uid, "blockedUsers");
        
        // This onSnapshot will re-run whenever a user is blocked or unblocked.
        const unsubscribe = onSnapshot(blockedUsersRef, async (snapshot) => {
            setLoading(true);
            const blockedIds = snapshot.docs.map(doc => doc.id);

            if (blockedIds.length > 0) {
                // Now, fetch the full profile for each blocked user to display their info.
                const creatorsRef = collection(db, "creators");
                const q = query(creatorsRef, where("__name__", "in", blockedIds));
                const creatorsSnapshot = await getDocs(q);
                const creatorsData = creatorsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setBlockedUsers(creatorsData);
            } else {
                setBlockedUsers([]);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser]);

    // This function calls the SAME cloud function as the block button.
    const handleUnblock = async (targetUserId) => {
        showMessage("Unblocking user...");
        try {
            const toggleBlockUserCallable = httpsCallable(functions, 'toggleBlockUser');
            const result = await toggleBlockUserCallable({ targetUserId: targetUserId });
            showMessage(result.data.message);
            // The onSnapshot listener will automatically remove the user from the list.
        } catch (error) {
            console.error("Error unblocking user:", error);
            showMessage(`An error occurred: ${error.message}`);
        }
    };

    if (loading) {
        return <div className="screenContainer"><p className="heading">Loading Blocked List...</p></div>;
    }

    return (
        <div className="screenContainer">
            <p className="heading">Manage Blocked Users</p>
            <p className="subHeading">This is a list of all the users you have blocked. They cannot see your profile, and you cannot see theirs.</p>

            <div className="user-search-list">
                {blockedUsers.length === 0 ? (
                    <p className="dashboardItem" style={{textAlign: 'center'}}>You have not blocked any users.</p>
                ) : (
                    blockedUsers.map(user => (
                        <div key={user.id} className="user-search-item">
                            <img src={user.profilePictureUrl || 'https://placehold.co/100x100/555/FFF?text=P'} alt={user.creatorName} className="user-search-pfp"/>
                            <div className="user-search-info">
                                <p className="user-search-name">{user.creatorName}</p>
                                <p className="user-search-role">Role: {user.role}</p>
                            </div>
                            <button 
                                className="button" 
                                onClick={() => handleUnblock(user.id)}
                                style={{backgroundColor: '#FF8C00', margin: 0}}
                            >
                                <span className="buttonText">Unblock</span>
                            </button>
                        </div>
                    ))
                )}
            </div>

            <button className="button" onClick={() => setActiveScreen('CreatorDashboard')} style={{ backgroundColor: '#3A3A3A', marginTop: '30px' }}>
                <span className="buttonText light">Back to Dashboard</span>
            </button>
        </div>
    );
};

export default BlockedListScreen;