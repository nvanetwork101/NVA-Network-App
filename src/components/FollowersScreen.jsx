// src/components/FollowersScreen.jsx

import React, { useState, useEffect } from 'react';
import { db, collection, query, where, getDocs, onSnapshot, orderBy } from '../firebase'; // Note: onSnapshot and orderBy are added for the fix

const FollowersScreen = ({ currentUser, setActiveScreen, setSelectedUserId, showMessage }) => {
    const [followers, setFollowers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!currentUser) {
            setActiveScreen('Login');
            return; // Early exit
        }

        setLoading(true);
        // THIS IS THE FIX: We now listen directly to the 'followers' subcollection in real-time.
        // All the data we need (name, profile pic) is denormalized here from our backend fix.
        // This avoids the second, permission-failing query to the main 'creators' collection.
        const followersRef = collection(db, "creators", currentUser.uid, "followers");
        const q = query(followersRef, orderBy("followedAt", "desc"));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const followersData = snapshot.docs.map(doc => ({
                id: doc.id, // The ID is the user ID of the follower
                ...doc.data() // This contains creatorName and profilePictureUrl
            }));
            setFollowers(followersData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching followers:", error);
            if (showMessage) showMessage("Failed to load your followers list.");
            setLoading(false);
        });

        // Cleanup the real-time listener when the component unmounts
        return () => unsubscribe();

    }, [currentUser]); // Dependency array is now simpler

    const viewProfile = (userId) => {
        setSelectedUserId(userId);
        setActiveScreen('UserProfile');
    };

    if (loading) {
        return <div className="screenContainer"><p className="heading">Loading Your Followers...</p></div>;
    }

    return (
        <div className="screenContainer">
            <p className="heading">Your Followers</p>
            <p className="subHeading">This is a list of all the creators and users following you.</p>

            <div className="user-search-list">
                {followers.length === 0 ? (
                    <p className="dashboardItem" style={{textAlign: 'center'}}>You don't have any followers yet.</p>
                ) : (
                    followers.map(user => (
                        <div key={user.id} className="user-search-item" style={{cursor: 'pointer'}} onClick={() => viewProfile(user.id)}>
                            <img src={user.profilePictureUrl || 'https://placehold.co/100x100/555/FFF?text=P'} alt={user.creatorName} className="user-search-pfp"/>
                            <div className="user-search-info">
                                <p className="user-search-name">{user.creatorName}</p>
                                {/* The 'role' is not available in our efficient query, so we display a generic label. */}
                                <p className="user-search-role">Creator/User</p>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <button className="button" onClick={() => setActiveScreen('CreatorDashboard')} style={{ backgroundColor: '#3A3A3A', color: '#FFF', marginTop: '30px' }}>
                <span className="buttonText">Back to Dashboard</span>
            </button>
        </div>
    );
};

export default FollowersScreen;