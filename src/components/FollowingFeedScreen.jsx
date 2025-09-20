// src/components/FollowingFeedScreen.jsx

import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, onSnapshot, doc, getDocs } from 'firebase/firestore';
import { db, functions, httpsCallable } from '../firebase';
import LikeButton from './LikeButton';

const timeSince = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    if (isNaN(date)) return '';
    const seconds = Math.floor((new Date() - date) / 1000);
    let interval = seconds / 31536000; if (interval > 1) return `${Math.floor(interval)}y ago`;
    interval = seconds / 2592000; if (interval > 1) return `${Math.floor(interval)}mo ago`;
    interval = seconds / 86400; if (interval > 1) return `${Math.floor(interval)}d ago`;
    interval = seconds / 3600; if (interval > 1) return `${Math.floor(interval)}h ago`;
    interval = seconds / 60; if (interval > 1) return `${Math.floor(interval)}m ago`;
    return `${Math.floor(seconds)}s ago`;
};

function FollowingFeedScreen({ currentUser, setActiveScreen, handleVideoPress, showMessage }) {
  const [feedItems, setFeedItems] = useState([]);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (!currentUser) { setLoading(false); return; }

    const clearFlags = async () => {
      try {
        const clearNewContentFlags = httpsCallable(functions, 'clearNewContentFlags');
        await clearNewContentFlags();
      } catch (error) { showMessage("Could not refresh feed status."); }
    };
    clearFlags();

    const blockedUsersRef = collection(db, "creators", currentUser.uid, "blockedUsers");
    const blockedByRef = collection(db, "creators", currentUser.uid, "blockedBy");
    const feedRef = collection(db, "creators", currentUser.uid, "feed");

    const processFeed = (feedDocs, blockList) => {
        const items = feedDocs.map(doc => ({ id: doc.id, ...doc.data() }));
        const filteredItems = items.filter(item => !blockList.has(item.creatorId));
        setFeedItems(filteredItems);
        setLoading(false);
    };

    let feedDocs = [];
    let blockList = new Set();
    
    const unsubFeed = onSnapshot(query(feedRef, orderBy("createdAt", "desc"), limit(50)), (snapshot) => {
        feedDocs = snapshot.docs;
        processFeed(feedDocs, blockList);
    });
    
    const unsubBlocked = onSnapshot(blockedUsersRef, (snapshot) => {
        snapshot.docs.forEach(doc => blockList.add(doc.id));
        processFeed(feedDocs, blockList);
    });

    const unsubBlockedBy = onSnapshot(blockedByRef, (snapshot) => {
        snapshot.docs.forEach(doc => blockList.add(doc.id));
        processFeed(feedDocs, blockList);
    });

    return () => { unsubFeed(); unsubBlocked(); unsubBlockedBy(); };
  }, [currentUser]);

  if (loading) {
    return (
      <div className="screenContainer" style={{ textAlign: 'center' }}>
        <p className="heading">Loading My Feed...</p>
      </div>
    );
  }

  return (
    // --- START: NEW LAYOUT STRUCTURE ---
    <div className="screenContainer" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* --- THIS IS THE NEW, FIXED HEADER --- */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: '20px', flexShrink: 0, borderBottom: '1px solid #333', paddingBottom: '10px' }}>
        <button 
            onClick={() => setActiveScreen('Home')}
            style={{ background: 'none', border: '1px solid #FFD700', color: '#FFD700', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginRight: '15px' }}
        >
            &#x2190;
        </button>
        <h1 style={{ fontSize: '24px', color: '#E0A03F', margin: 0, textAlign: 'center', flexGrow: 1, fontWeight: 'bold' }}>My Feed</h1>
        <div style={{ width: '55px' }}></div> {/* Spacer to keep title perfectly centered */}
      </div>
      
      {/* --- THIS IS THE NEW, SCROLLABLE CONTENT AREA --- */}
      <div style={{ flex: '1 1 auto', overflowY: 'auto', paddingRight: '10px' }}>
        {feedItems.length === 0 ? (
          <div style={{ textAlign: 'center', paddingTop: '50px' }}>
            <p className="heading">Your Feed is Empty</p>
            <p className="subHeading">Follow creators to see their latest content here.</p>
            <button className="button" onClick={() => setActiveScreen('DiscoverUsers')}><span className="buttonText">Discover Creators</span></button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '30px', maxWidth: '800px', margin: '0 auto' }}>
            {feedItems.map(item => (
              <div key={item.id || item.originalContentId} style={styles.contentCard}>
                <div style={styles.cardHeader}>
                  <img src={item.creatorProfilePictureUrl || 'https://placehold.co/40x40/555/FFF?text=P'} alt={item.creatorName} style={styles.profilePic} />
                  <div style={styles.creatorInfo}>
                    <span style={styles.creatorName}>{item.creatorName}</span>
                    <span style={styles.timestamp}>{timeSince(item.createdAt)}</span>
                  </div>
                </div>
                <div style={styles.thumbnailContainer} onClick={() => handleVideoPress(item.mainUrl || item.embedUrl, item)}>
                   <img src={item.customThumbnailUrl} alt={item.title} style={styles.thumbnail} />
                   <div style={styles.playIcon}>▶</div>
                </div>
                <div style={styles.cardFooter}>
                   <h3 style={styles.contentTitle}>{item.title}</h3>
                   <div style={styles.statsContainer}>
                      <span style={styles.viewCount}>{(item.viewCount || 0).toLocaleString()} views</span>
                      <LikeButton
                          contentItem={item}
                          currentUser={currentUser}
                          showMessage={showMessage}
                      />
                   </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    // --- END: NEW LAYOUT STRUCTURE ---
  );
}

// Inline CSS (Unchanged from your version)
const styles = {
  contentCard: { backgroundColor: '#1A1A1A', borderRadius: '8px', overflow: 'hidden', border: '1px solid #282828' },
  cardHeader: { display: 'flex', alignItems: 'center', padding: '10px 15px' },
  profilePic: { width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', marginRight: '10px' },
  creatorInfo: { display: 'flex', flexDirection: 'column' },
  creatorName: { fontWeight: 'bold', color: '#f0f0f0' },
  timestamp: { fontSize: '12px', color: '#888' },
  thumbnailContainer: { position: 'relative', cursor: 'pointer' },
  thumbnail: { width: '100%', display: 'block', aspectRatio: '16 / 9', objectFit: 'cover', backgroundColor: '#000' },
  playIcon: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '50px', color: 'rgba(255, 255, 255, 0.8)', textShadow: '0 0 10px rgba(0,0,0,0.5)' },
  cardFooter: { padding: '10px 15px' },
  contentTitle: { fontSize: '18px', margin: '0 0 10px 0', color: '#f0f0f0' },
  statsContainer: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  viewCount: { fontSize: '14px', color: '#888' },
};

export default FollowingFeedScreen;