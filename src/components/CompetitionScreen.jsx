// src/components/CompetitionScreen.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, query, where, orderBy, onSnapshot, limit } from "firebase/firestore";
import { extractVideoInfo } from '../firebase';
import ShareButton from './ShareButton';

// --- Real Component Imports ---
import PrizesModal from './PrizesModal';
import CompetitionEntryForm from './CompetitionEntryForm';
import CompetitionLikeButton from './CompetitionLikeButton';
import EnlargedPhotoViewer from './EnlargedPhotoViewer';

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
        const calculateScore = (entry) => {
            const likes = entry.likeCount || 0;
            const views = entry.viewCount || 0;
            return (likes * 5) + views;
        };

        return entries
            .filter(entry => (entry.title?.toLowerCase() || '').includes(searchTerm.toLowerCase()) || (entry.userName?.toLowerCase() || '').includes(searchTerm.toLowerCase()))
            .sort((a, b) => calculateScore(b) - calculateScore(a));
    }, [entries, searchTerm]);
    
    // ====================== START: MODIFIED CODE BLOCK (HANDLERS) ======================
    const handleEnterCompetition = () => {
        if (!currentUser) {
            showMessage("Please log in to enter the competition.");
            setActiveScreen('Login');
            return;
        }
        setShowEntryForm(true);
    };

    const handleEntryClick = (entry) => {
        // THE FIX: Add a check for the 'Accepting Entries' status first.
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
    // ======================= END: MODIFIED CODE BLOCK (HANDLERS) =======================


    // --- RENDER LOGIC ---
    if (loading) {
        return <div className="screenContainer" style={{textAlign: 'center'}}><p className="heading">Loading Competition...</p></div>;
    }
    if (!competition) {
        return (
            <div className="screenContainer" style={{textAlign: 'center', paddingTop: '50px'}}>
                <p className="heading">No Active Competition</p>
                <p className="subHeading">There is no competition running at the moment. Please check back later!</p>
                <button className="button" onClick={() => setActiveScreen('Home')} style={{ backgroundColor: '#3A3A3A' }}><span className="buttonText light">Back to Home</span></button>
            </div>
        );
    }

    return (
        <div className="screenContainer" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Header section */}
            <div style={{ flexShrink: 0, paddingBottom: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', gap: '15px' }}>
                    <button onClick={() => setActiveScreen('Home')} style={{ background: 'none', border: '1px solid #00FFFF', color: '#00FFFF', borderRadius: '50%', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                        &#x2190;
                    </button>
                    <p className="heading" style={{ margin: 0, textAlign: 'center', flexGrow: 1, color: '#00FFFF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {competition.title}
                    </p>
                    <div style={{ flexShrink: 0 }}>
                        <ShareButton
                            title={competition.title}
                            text={`Join the "${competition.title}" competition on NVA Network!`}
                            url="/competition"
                            showMessage={showMessage}
                        />
                    </div>
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
                        <div className="dashboardItem" style={{flex: 1, textAlign: 'center', padding: '10px', border: '1px solid #00FFFF', borderRadius: '8px'}}>
                            <p style={{margin: 0, color: '#00FFFF', fontWeight: 'bold'}}>Voting is now Live!</p>
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

            {/* Entries list */}
            <div style={{ flex: '1 1 auto', overflowY: 'auto', paddingTop: '15px' }}>
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
                                <div key={entry.id} className="allCampaignsListItem" style={{borderLeft: '5px solid #00FFFF', position: 'relative', cursor: 'pointer'}} onClick={() => handleEntryClick(entry)}>
                                    <div style={{position: 'absolute', top: '-1px', left: '-1px', backgroundColor: '#00FFFF', color: '#0A0A0A', padding: '5px 10px', borderTopLeftRadius: '8px', borderBottomRightRadius: '8px', fontWeight: 'bold'}}>#{index + 1}</div>
                                    <img src={entry.photoUrl || entry.customThumbnailUrl || extractVideoInfo(entry.submissionUrl).thumbnailUrl || entry.userProfilePicture} alt={entry.title} className="creator-campaign-thumbnail" style={{width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px'}}/>
                                    <div className="campaignListContent">
                                        <p className="campaignListTitle" style={{color: '#FFF'}}>{entry.title}</p>
                                        <div className="campaignListCreator"><img src={entry.userProfilePicture || 'https://placehold.co/24x24/555/FFF?text=P'} alt={entry.userName} className="campaignListCreatorProfilePic"/><span>by {entry.userName}</span></div>
                                        <div className="campaignListStats" style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                                            <div>
                                                <span>Score: <span className="campaignListGoal">{(entry.likeCount || 0) * 5 + (entry.viewCount || 0)}</span></span>
                                            </div>
                                            {/* Only show like button during live voting */}
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

            {/* Modals are still functional but will now only be opened by logged-in users */}
            {showPrizesModal && <PrizesModal competition={competition} onClose={() => setShowPrizesModal(false)} />}
            {showEntryForm && <CompetitionEntryForm competition={competition} onClose={() => setShowEntryForm(false)} currentUser={currentUser} creatorProfile={creatorProfile} showMessage={showMessage} />}
            {selectedEntry && <EnlargedPhotoViewer competition={competition} entry={selectedEntry} currentUser={currentUser} showMessage={showMessage} onClose={() => setSelectedEntry(null)} />}
        </div>
    );
}

export default CompetitionScreen;