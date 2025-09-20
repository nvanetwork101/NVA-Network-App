

import React, { useState, useEffect } from 'react';
import { db, collection, query, orderBy, onSnapshot } from '../firebase';
	const MyFollowsScreen = ({ currentUser, setActiveScreen, setSelectedUserId, showMessage }) => {
            const [followedCreators, setFollowedCreators] = useState([]);
            const [loading, setLoading] = useState(true);

            useEffect(() => {
                if (!currentUser) {
                    setActiveScreen('Login');
                    return; // Early exit if not logged in
                }

                setLoading(true);
                // THIS IS THE FIX: We now listen directly to the 'following' subcollection with onSnapshot.
                // All the data we need (name, profile pic) is now denormalized here from our backend fix.
                // This avoids the second, permission-failing query to the main 'creators' collection.
                const followingRef = collection(db, "creators", currentUser.uid, "following");
                const q = query(followingRef, orderBy("followedAt", "desc"));

                const unsubscribe = onSnapshot(q, (snapshot) => {
                    const creatorsData = snapshot.docs.map(doc => ({
                        id: doc.id, // The ID is the user ID of the person being followed
                        ...doc.data() // This contains creatorName and profilePictureUrl
                    }));
                    setFollowedCreators(creatorsData);
                    setLoading(false);
                }, (error) => {
                    console.error("Error fetching followed creators:", error);
                    showMessage("Failed to load your followed creators list.");
                    setLoading(false);
                });

                // Cleanup listener on component unmount
                return () => unsubscribe();

            }, [currentUser]);

            const viewProfile = (userId) => {
                setSelectedUserId(userId);
                setActiveScreen('UserProfile');
            };

            if (loading) {
                return <div className="screenContainer"><p className="heading">Loading Followed Creators...</p></div>;
            }

            return (
                <div className="screenContainer">
                    <p className="heading">Creators You Follow</p>
                    <p className="subHeading">Here is a list of all the creators you are currently following.</p>

                    <div className="user-search-list">
                        {followedCreators.length === 0 ? (
                            <p className="dashboardItem" style={{textAlign: 'center'}}>You are not following any creators yet.</p>
                        ) : (
                            followedCreators.map(user => (
                                <div key={user.id} className="user-search-item" style={{cursor: 'pointer'}} onClick={() => viewProfile(user.id)}>
                                    <img src={user.profilePictureUrl || 'https://placehold.co/100x100/555/FFF?text=P'} alt={user.creatorName} className="user-search-pfp"/>
                                    <div className="user-search-info">
                                        <p className="user-search-name">{user.creatorName}</p>
                                        {/* The 'role' is no longer available in this efficient query, so we can show a generic label or remove it. */}
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

export default MyFollowsScreen;