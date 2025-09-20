// src/components/TopCreatorsScreen.jsx

import React, { useState, useEffect } from 'react';
import { db, collection, query, orderBy, limit, getDocs, startAfter } from '../firebase';

const TopCreatorsScreen = ({ setActiveScreen }) => {
    const [chartsData, setChartsData] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [lastVisible, setLastVisible] = useState(null);
    const [hasMore, setHasMore] = useState(true);

    const fetchInitialCreators = async () => {
        setIsLoading(true);
        try {
            const creatorsRef = collection(db, "creators");
            const q = query(creatorsRef, orderBy("weeklyViews", "desc"), limit(25));
            const documentSnapshots = await getDocs(q);

            const creators = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const lastDoc = documentSnapshots.docs[documentSnapshots.docs.length - 1];
            
            setChartsData(creators);
            setLastVisible(lastDoc);
            setHasMore(documentSnapshots.docs.length === 25);
        } catch (error) {
            console.error("Error fetching initial NVA Network Charts:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchInitialCreators();
    }, []);

    const handleLoadMore = async () => {
        if (!lastVisible || isLoadingMore) return;
        setIsLoadingMore(true);
        try {
            const creatorsRef = collection(db, "creators");
            const q = query(creatorsRef, orderBy("weeklyViews", "desc"), startAfter(lastVisible), limit(25));
            const documentSnapshots = await getDocs(q);

            const newCreators = documentSnapshots.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const lastDoc = documentSnapshots.docs[documentSnapshots.docs.length - 1];

            setChartsData(prevData => [...prevData, ...newCreators]);
            setLastVisible(lastDoc);
            setHasMore(documentSnapshots.docs.length === 25);
        } catch (error) {
            console.error("Error fetching more NVA Network Charts:", error);
        } finally {
            setIsLoadingMore(false);
        }
    };

    const handleCreatorClick = (userId) => {
        const event = new CustomEvent('navigateToUserProfile', { detail: { userId } });
        window.dispatchEvent(event);
    };

    return (
        <div className="screenContainer">
            <p className="heading">NVA Network Charts</p>
            <p className="subHeading">
                The official Top 50 ranking. Updated daily based on weekly performance.
            </p>

            <div className="leaderboard-list">
                {isLoading ? (
                    <p className="paragraph">Loading Charts...</p>
                ) : (
                    chartsData.map((creator, index) => (
                        <div 
                            key={creator.id} 
                            className={`leaderboard-item rank-${index + 1}`}
                            onClick={() => handleCreatorClick(creator.id)}
                        >
                            <div className="leaderboard-rank">#{index + 1}</div>
                            <img src={creator.profilePictureUrl || 'https://placehold.co/60x60/2A2A2A/FFF?text=N/A'} alt={creator.creatorName} className="leaderboard-pfp" />
                            <div className="leaderboard-info">
                                <p className="leaderboard-name">{creator.creatorName}</p>
                            </div>
                            <div className="leaderboard-stats">
                                <span className="leaderboard-stat-value">{creator.weeklyViews?.toLocaleString() || 0}</span>
                                <span className="leaderboard-stat-label">Weekly Views</span>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <div style={{textAlign: 'center', marginTop: '20px'}}>
                {isLoadingMore ? (
                     <p className="paragraph">Loading...</p>
                ) : hasMore && (
                    <button className="button" onClick={handleLoadMore}>
                        <span className="buttonText">Load More (26-50)</span>
                    </button>
                )}
            </div>

            <button
                className="button"
                onClick={() => setActiveScreen('Home')}
                style={{ backgroundColor: '#3A3A3A', marginTop: '30px' }}
            >
                <span className="buttonText light">Back to Home</span>
            </button>
        </div>
    );
};

export default TopCreatorsScreen;