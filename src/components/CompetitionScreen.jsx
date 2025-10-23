// src/components/CompetitionScreen.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, limit } from "firebase/firestore";
import ShareButton from './ShareButton';

// --- Component Imports ---
import PrizesModal from './PrizesModal';
import CompetitionEntryForm from './CompetitionEntryForm.jsx';
import CompetitionLikeButton from './CompetitionLikeButton';
import CompetitionVideoViewer from './CompetitionVideoViewer';
import EnlargedPhotoViewer from './EnlargedPhotoViewer';

// --- CSS Styles for the "Times Square" Theme ---
const TimesSquareStyles = `
  @keyframes pulse-indigo {
    0% { text-shadow: 0 0 5px #4B0082, 0 0 10px #4B0082, 0 0 15px #8A2BE2, 0 0 20px #8A2BE2; }
    50% { text-shadow: 0 0 10px #4B0082, 0 0 15px #9400D3, 0 0 20px #9400D3, 0 0 25px #9932CC; }
    100% { text-shadow: 0 0 5px #4B0082, 0 0 10px #4B0082, 0 0 15px #8A2BE2, 0 0 20px #8A2BE2; }
  }

  .times-square-bg {
    background-color: #0a0a0a;
    background-image: url('https://www.transparenttextures.com/patterns/dark-denim-3.png');
  }

  .neon-indigo-text {
    color: #E6E6FA;
    font-family: 'Arial Black', Gadget, sans-serif;
    font-weight: bold;
    text-shadow: 0 0 5px #4B0082, 0 0 10px #4B0082, 0 0 15px #8A2BE2, 0 0 20px #8A2BE2;
    animation: pulse-indigo 4s infinite ease-in-out;
  }
  
  .billboard-panel {
    background-color: rgba(26, 26, 26, 0.6);
    border: 1px solid #4B0082;
    box-shadow: 0 0 15px rgba(75, 0, 130, 0.5);
    border-radius: 8px;
    padding: 15px;
    margin-bottom: 15px;
  }
`;

function CompetitionScreen({ showMessage, setActiveScreen, currentUser, creatorProfile }) {
    // --- STATE MANAGEMENT ---
    const [competition, setCompetition] = useState(null);
    const [loading, setLoading] = useState(true);
    const [entries, setEntries] = useState([]);
    const [loadingEntries, setLoadingEntries] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showPrizesModal, setShowPrizesModal] = useState(false);
    const [showEntryForm, setShowEntryForm] = useState(false);
    const [selectedEntry, setSelectedEntry] = useState(null);

    // --- DATA FETCHING ---
    useEffect(() => {
        const compRef = collection(db, "competitions");
        const q = query(compRef, where("status", "in", ["Accepting Entries", "Live Voting", "Judging", "Results Visible"]), orderBy("createdAt", "desc"), limit(1));
        const unsubscribeComp = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                setCompetition({ id: snapshot.docs[0].id, ...snapshot.docs[0].data() });
            } else {
                setCompetition(null);
            }
            setLoading(false);
        });
        return () => unsubscribeComp();
    }, []);

    useEffect(() => {
        if (!competition) {
            setEntries([]);
            setLoadingEntries(false);
            return;
        }
        setLoadingEntries(true);
        const entriesRef = collection(db, "competitions", competition.id, "entries");
        const q = query(entriesRef, orderBy("createdAt", "desc"));
        const unsubscribeEntries = onSnapshot(q, (snapshot) => {
            setEntries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setLoadingEntries(false);
        });
        return () => unsubscribeEntries();
    }, [competition]);

    // --- DERIVED STATE ---
    const rankedEntries = useMemo(() => {
        const calculateScore = (entry) => (entry.likeCount || 0) * 5 + (entry.viewCount || 0);
        return entries
            .filter(entry => (entry.title?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || (entry.userName?.toLowerCase() || '').includes(searchTerm.toLowerCase()))
            .sort((a, b) => calculateScore(b) - calculateScore(a));
    }, [entries, searchTerm]);
    
    // --- HANDLERS ---
    const handleEnterCompetition = () => {
        if (!currentUser) {
            showMessage("Please log in to enter the competition.");
            setActiveScreen('Login');
            return;
        }
        setShowEntryForm(true);
    };

    const handleEntryClick = (entry) => {
        if (competition?.status === 'Accepting Entries') {
            showMessage("Voting has not yet begun. Please check back later!");
            return;
        }
        if (competition?.status === 'Results Visible') {
            showMessage("This competition has ended. Viewing entries is disabled.");
            return;
        }
        if (!currentUser) {
            showMessage("Please log in to view entry details.");
            setActiveScreen('Login');
            return;
        }
        setSelectedEntry(entry);
    };
    
    const handlePrizesClick = () => {
        if (!currentUser) {
            showMessage("Please log in to view prizes and rules.");
            setActiveScreen('Login');
            return;
        }
        setShowPrizesModal(true);
    };

        const handleFlyerClick = () => {
        const imageUrl = competition?.flyerImageUrl_highRes || competition?.flyerImageUrl;
        if (imageUrl) {
            // THE FIX: Dispatch the new 'openContentPlayer' event that App.jsx is listening for.
            window.dispatchEvent(new CustomEvent('openContentPlayer', {
                detail: {
                    imageUrl: imageUrl,
                    description: competition.title
                    // The new modal doesn't need itemId or itemType yet, so we send a cleaner object.
                }
            }));
        }
    };

    const getEntryThumbnail = (entry) => {
        if (entry.photoUrl) return entry.photoUrl;
        if (entry.customThumbnailUrl) return entry.customThumbnailUrl;
        if (entry.submissionUrl && (entry.submissionUrl.includes('youtu.be') || entry.submissionUrl.includes('youtube.com'))) {
            const videoIdMatch = entry.submissionUrl.match(/(?:youtube\.com\/(?:shorts\/|watch\?v=)|youtu\.be\/)([^#\&\?]{11})/);
            if (videoIdMatch && videoIdMatch[1]) {
                return `https://img.youtube.com/vi/${videoIdMatch[1]}/mqdefault.jpg`;
            }
        }
        return entry.userProfilePicture || 'https://placehold.co/80x80/2A2A2A/FFF?text=N/A';
    };

    // --- RENDER LOGIC ---
    if (loading) {
        return <div className="screenContainer times-square-bg" style={{textAlign: 'center'}}><p className="heading neon-indigo-text">Loading Competition...</p></div>;
    }
    if (!competition) {
        return (
            <div className="screenContainer times-square-bg" style={{textAlign: 'center', paddingTop: '50px'}}>
                <p className="heading neon-indigo-text">No Active Competition</p>
                <p className="subHeading">There is no competition running at the moment. Please check back later!</p>
                <button className="button" onClick={() => setActiveScreen('Home')} style={{ backgroundColor: '#3A3A3A' }}><span className="buttonText light">Back to Home</span></button>
            </div>
        );
    }

    return (
        <>
            <style>{TimesSquareStyles}</style>
            <div className="screenContainer times-square-bg">
                {/* Header section */}
                <div style={{ flexShrink: 0, paddingBottom: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '15px', gap: '15px' }}>
                        <button onClick={() => setActiveScreen('Home')} style={{ background: 'none', border: '1px solid #8A2BE2', color: '#E6E6FA', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                            &#x2190;
                        </button>
                        <p className="heading neon-indigo-text" style={{ margin: 0, textAlign: 'center', flexGrow: 1 }}>
                            {competition.title}
                        </p>
                        <div style={{ flexShrink: 0, width: '40px', height: '40px' }}>
                            <ShareButton
                                title={competition.title}
                                text={`Join the "${competition.title}" competition on NVA Network!`}
                                url={`/competition/${competition.id}`}
                                showMessage={showMessage}
                            />
                        </div>
                    </div>
                    
                    <div className="billboard-panel">
                        {competition.flyerImageUrl && (
                            <img 
                                src={competition.flyerImageUrl} 
                                alt={competition.title}
                                onClick={handleFlyerClick}
                                style={{ width: '100%', display: 'block', borderRadius: '4px', cursor: 'pointer' }}
                            />
                        )}
                        {competition.flyerLinkUrl && (
                            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '15px' }}>
                                <a href={competition.flyerLinkUrl} target="_blank" rel="noopener noreferrer" className="button" style={{ backgroundColor: '#4B0082' }}>
                                    <span className="buttonText light">{competition.flyerLinkDescription || 'Learn More'}</span>
                                </a>
                            </div>
                        )}
                    </div>
                    
                    {competition.noticeText && (
                        <div className="dashboardSection" style={{padding: '10px', border: '1px solid #FFD700', margin: '0 0 10px 0'}}>
                            <p className="dashboardSectionTitle" style={{fontSize: '14px', marginBottom: '5px'}}>Notice</p>
                            <p className="dashboardItem" style={{fontSize: '12px', color: '#CCC', margin: 0, whiteSpace: 'pre-wrap'}}>{competition.noticeText}</p>
                        </div>
                    )}
                    <div className="formGroup" style={{marginBottom: '10px'}}><input type="text" className="formInput" placeholder="Search entries by name or title..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} /></div>
                    <div style={{display: 'flex', gap: '10px'}}>
                        {competition.status === 'Accepting Entries' && (
                            <button className="button" onClick={handleEnterCompetition} style={{flex: 1, margin: 0}}><span className="buttonText">Enter Competition</span></button>
                        )}
                        {competition.status === 'Live Voting' && (
                            <div className="dashboardItem" style={{flex: 1, textAlign: 'center', padding: '10px', border: '1px solid #8A2BE2', borderRadius: '8px'}}>
                                <p style={{margin: 0, color: '#E6E6FA', fontWeight: 'bold'}}>Voting is now Live!</p>
                            </div>
                        )}
                        {(competition.status === 'Judging' || competition.status === 'Results Visible') && (
                            <div className="dashboardItem" style={{flex: 1, textAlign: 'center', padding: '10px', border: `1px solid ${competition.status === 'Judging' ? '#FFD700' : '#00FF00'}`, borderRadius: '8px'}}>
                                <p style={{margin: 0, color: competition.status === 'Judging' ? '#FFD700' : '#00FF00', fontWeight: 'bold'}}>
                                    {competition.status === 'Judging' ? 'Judging in Progress' : 'Results Are In!'}
                                </p>
                            </div>
                        )}
                        <button className="button" onClick={handlePrizesClick} style={{flex: 1, margin: 0, backgroundColor: '#3A3A3A'}}><span className="buttonText light">View Prizes & Rules</span></button>
                    </div>
                </div>

                <div style={{ flex: 1, overflowY: 'auto', paddingTop: '15px' }}>
                    {(() => {
                        const isModerator = creatorProfile?.role === 'admin' || creatorProfile?.role === 'authority';
                        const isJudgingPublicView = competition.status === 'Judging' && !isModerator;

                        if (isJudgingPublicView) {
                            return (
                                <div style={{textAlign: 'center', paddingTop: '40px'}}>
                                    <p className="heading" style={{color: '#FFD700'}}>Judging In Progress</p>
                                    <p className="subHeading">The competition has ended. Results will be out soon!</p>
                                </div>
                            );
                        }

                        if (loadingEntries) {
                            return <p className="dashboardItem" style={{textAlign: 'center'}}>Loading entries...</p>;
                        }

                        if (rankedEntries.length === 0) {
                            return <p className="dashboardItem" style={{textAlign: 'center'}}>No entries yet. Be the first!</p>;
                        }

                        return (
                            <div className="allCampaignsList">
                                {rankedEntries.map((entry, index) => (
                                    <div key={entry.id} className="allCampaignsListItem" style={{borderLeft: '5px solid #8A2BE2', position: 'relative', cursor: 'pointer', backgroundColor: 'rgba(26, 26, 26, 0.6)'}} onClick={() => handleEntryClick(entry)}>
                                        <div style={{position: 'absolute', top: '-1px', left: '-1px', backgroundColor: '#8A2BE2', color: '#FFF', padding: '5px 10px', borderTopLeftRadius: '8px', borderBottomRightRadius: '8px', fontWeight: 'bold'}}>#{index + 1}</div>
                                        <img src={getEntryThumbnail(entry)} alt={entry.title} className="creator-campaign-thumbnail" style={{width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px'}} onError={(e) => { e.target.onerror = null; e.target.src='https://placehold.co/80x80/2A2A2A/FFF?text=N/A'; }}/>
                                        <div className="campaignListContent">
                                            <p className="campaignListTitle" style={{color: '#FFF'}}>{entry.title}</p>
                                            <div className="campaignListCreator"><img src={entry.userProfilePicture || 'https://placehold.co/24x24/555/FFF?text=P'} alt={entry.userName} className="campaignListCreatorProfilePic"/><span>by {entry.userName}</span></div>
                                            <div className="campaignListStats" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                                <div>
                                                    <span>Score: <span className="campaignListGoal">{(entry.likeCount || 0) * 5 + (entry.viewCount || 0)}</span></span>
                                                </div>
                                                {currentUser && competition.status === 'Live Voting' && (
                                                    <CompetitionLikeButton competition={competition} entry={entry} currentUser={currentUser} showMessage={showMessage} />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        );
                    })()}
                </div>

                {/* Modals */}
                {showPrizesModal && <PrizesModal competition={competition} onClose={() => setShowPrizesModal(false)} />}
                {showEntryForm && <CompetitionEntryForm competition={competition} onClose={() => setShowEntryForm(false)} currentUser={currentUser} creatorProfile={creatorProfile} showMessage={showMessage} />}
                {selectedEntry && (
                    competition.competitionType === 'Photo' ? (
                        <EnlargedPhotoViewer
                            competition={competition}
                            entry={selectedEntry}
                            currentUser={currentUser}
                            showMessage={showMessage}
                            onClose={() => setSelectedEntry(null)}
                        />
                    ) : (
                        <CompetitionVideoViewer
                            competition={competition}
                            entry={selectedEntry}
                            currentUser={currentUser}
                            showMessage={showMessage}
                            onClose={() => setSelectedEntry(null)}
                        />
                    )
                )}
            </div>
        </>
    );
}

export default CompetitionScreen;