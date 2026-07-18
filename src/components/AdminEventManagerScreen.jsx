// src/components/AdminEventManagerScreen.jsx

import React, { useState, useEffect } from 'react';
import { db, functions } from '../firebase'; 
import { httpsCallable } from 'firebase/functions'; // Correct: httpsCallable is now imported
import { collection, onSnapshot, doc, setDoc, addDoc, deleteDoc, updateDoc, query, orderBy, Timestamp, where, getDocs } from 'firebase/firestore';
import { uploadManager } from '../utils/uploadManager';
import EventForm from './EventForm';
import { uploadMovieToR2 } from '../utils/r2Uploader';

// Centralized Media Server IP pointed to your Tokyo Oracle Instance
const MEDIA_SERVER_URL = "http://158.179.184.80:5000";

// --- DEDICATED COMPONENT FOR THE LIVE DASHBOARD (CORRECTED LOGIC) ---
const LiveDashboard = ({ showMessage }) => {
    const [liveEvent, setLiveEvent] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const liveEventDocRef = doc(db, "settings", "liveEvent");
        let masterUnsubscribe = () => {}; // Function to stop the inner listener

        const billboardUnsubscribe = onSnapshot(liveEventDocRef, (billboardDoc) => {
            // First, clean up any listener from a previous event
            masterUnsubscribe();

            if (billboardDoc.exists() && billboardDoc.data().eventId && billboardDoc.data().status !== 'no_event_scheduled') {
                const masterEventDocRef = doc(db, "events", billboardDoc.data().eventId);
                
                // Set up a new listener for the specific event's master document
                masterUnsubscribe = onSnapshot(masterEventDocRef, (masterDoc) => {
                    if (masterDoc.exists()) {
                        setLiveEvent(masterDoc.data());
                    } else {
                        // The event on the billboard was deleted from the master list
                        setLiveEvent(null);
                    }
                    // Only set loading to false AFTER we get the result from the master list
                    setIsLoading(false);
                });
            } else {
                // There is no event on the billboard
                setLiveEvent(null);
                setIsLoading(false);
            }
        });

        // Cleanup function for when the whole component unmounts
        return () => {
            billboardUnsubscribe();
            masterUnsubscribe();
        };
    }, []); // Empty array ensures this runs only once on mount

    if (isLoading) {
        return <p className="dashboardSectionTitle" style={{padding: '1rem'}}>Loading Live Dashboard...</p>;
    }

    if (!liveEvent) {
        return (
            <div className="dashboardSection">
                <p className="dashboardSectionTitle" style={{color: '#FFC107'}}>Live Dashboard: No Event Promoted</p>
                <p className="paragraph">The automation has not promoted an event to the public billboard. Check the Master Library below to ensure an event is created, published, and scheduled for the future.</p>
            </div>
        );
    }

    return (
        <div className="dashboardSection" style={{ border: '2px solid #FFD700', marginTop: '20px' }}>
            <p className="dashboardSectionTitle">Live Dashboard: <span style={{color: '#FFF'}}>{liveEvent.eventTitle}</span></p>
            <p className="paragraph" style={{marginTop: '0'}}>Status: <span className={`status-badge status-${liveEvent.status}`}>{liveEvent.status?.toUpperCase()}</span></p>
            <div className="grid-2-col">
                <div className="adminDashboardItem" style={{flexDirection: 'column', alignItems: 'flex-start', background: '#1A1A1A'}}>
                    <p className="dashboardItem">Total Tickets Sold</p>
                    <p className="premiumFeatureTitle">{liveEvent.ticketsSold || 0}</p>
                </div>
                <div className="adminDashboardItem" style={{flexDirection: 'column', alignItems: 'flex-start', background: '#1A1A1A'}}>
                    <p className="dashboardItem">Total Gross Revenue (USD)</p>
                    <p className="premiumFeatureTitle">${(liveEvent.totalRevenue || 0).toFixed(2)}</p>
                </div>
            </div>
        </div>
    );
};

// --- MAIN PARENT COMPONENT (UNCHANGED LOGIC) ---
function AdminEventManagerScreen({ showMessage, setActiveScreen, setShowConfirmationModal, setConfirmationTitle, setConfirmationMessage, setOnConfirmationAction }) {
   
    // --- HANDLER FOR THE MANUAL AUTOMATION TRIGGER ---
    const handleManualTrigger = async () => {
        showMessage("Manually triggering automation engine...");
        try {
            const triggerFunction = httpsCallable(functions, 'triggerManualAutomation');
            const result = await triggerFunction();
            // Use the custom modal to show detailed results
            setConfirmationTitle("Automation Run Complete");
            // Create a multi-line message for the modal body
            const messageBody = (
                <div>
                    <p style={{margin: 0, fontWeight: 'bold'}}>Status Manager:</p>
                    <p style={{margin: '0 0 10px 0'}}>{result.data.results.statusMessage}</p>
                    <p style={{margin: 0, fontWeight: 'bold'}}>Promoter:</p>
                    <p style={{margin: 0}}>{result.data.results.promoterMessage}</p>
                </div>
            );
            setConfirmationMessage(messageBody);
            // This makes the modal act like an "OK" dialog with no action on confirm
            setOnConfirmationAction(() => () => {});
            setShowConfirmationModal(true);
        } catch (error) {
            console.error("Error triggering manual automation:", error);
            showMessage(`Error: ${error.message}`);
        }
    };

    const [events, setEvents] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isFormVisible, setIsFormVisible] = useState(false);
    const [eventToEdit, setEventToEdit] = useState(null);

    const [isPublishModalVisible, setIsPublishModalVisible] = useState(false);
    const [eventToPublish, setEventToPublish] = useState(null);
    const [vodCategories, setVodCategories] = useState([]);
    const [selectedVodCategory, setSelectedVodCategory] = useState('');

    const [uploadState, setUploadState] = useState(() => ({
        uploadProgress: uploadManager.uploadProgress,
        isUploadingMovie: uploadManager.isUploadingMovie,
        statusMessage: uploadManager.statusMessage,
        movieFile: uploadManager.movieFile,
        targetEventId: uploadManager.targetEventId
    }));

    useEffect(() => {
        const unsubscribe = uploadManager.subscribe((newState) => {
            setUploadState(newState);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        const eventsCollectionRef = collection(db, "events");
        const q = query(eventsCollectionRef, orderBy("scheduledStartTime", "desc"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            setEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            setIsLoading(false);
        });
        return () => unsubscribe();
    }, []);

        useEffect(() => {
        const categoriesRef = collection(db, "content_categories");
        const q = query(categoriesRef, where("isActive", "==", true), orderBy("orderIndex"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const categories = snapshot.docs.map(doc => doc.data().name).filter(name => name !== 'Live Premieres');
            setVodCategories(categories);
            if (categories.length > 0) {
                setSelectedVodCategory(categories[0]);
            }
        });
        return () => unsubscribe();
    }, []);

    const handleShowCreateForm = () => { setEventToEdit(null); setIsFormVisible(true); };
    const handleShowEditForm = (event) => { setEventToEdit(event); setIsFormVisible(true); };
    const handleCloseForm = () => { setIsFormVisible(false); setEventToEdit(null); };

    // THE FIX: Brought in the Global Free Tag Engine
    const handleToggleFreeTag = async (event) => {
        try {
            const nextStatus = !event.isNowShowingFree;
            if (nextStatus) {
                const qMovies = query(collection(db, "movies"), where("isNowShowingFree", "==", true));
                const snapMovies = await getDocs(qMovies);
                await Promise.all(snapMovies.docs.map(d => updateDoc(d.ref, { isNowShowingFree: false })));
                
                const qEvents = query(collection(db, "events"), where("isNowShowingFree", "==", true));
                const snapEvents = await getDocs(qEvents);
                await Promise.all(snapEvents.docs.map(d => updateDoc(d.ref, { isNowShowingFree: false })));
            }
            await updateDoc(doc(db, "events", event.id), { isNowShowingFree: nextStatus });
            await updateDoc(doc(db, "movies", event.id), { isNowShowingFree: nextStatus }).catch(() => {});
            showMessage(nextStatus ? "🔓 Marked as 'Now Showing: Free'!" : "Removed 'Now Showing: Free' tag.");
        } catch (error) {
            showMessage("Failed to update Free Screening status.");
        }
    };

    // THE FIX: Brought in the Universal Pin Engine
    const handleTogglePin = async (event) => {
        try {
            const pinnedEventsSnap = await getDocs(query(collection(db, "events"), where("isPinned", "==", true)));
            const pinnedMoviesSnap = await getDocs(query(collection(db, "movies"), where("isPinned", "==", true)));
            const totalPinned = pinnedEventsSnap.size + pinnedMoviesSnap.size;

            if (!event.isPinned && totalPinned >= 2) {
                showMessage("You can only pin a maximum of 2 films globally.");
                return;
            }
            await updateDoc(doc(db, "events", event.id), { isPinned: !event.isPinned });
            await updateDoc(doc(db, "movies", event.id), { isPinned: !event.isPinned }).catch(() => {});
            showMessage(!event.isPinned ? "📌 Pinned to Cinemas!" : "Unpinned from Cinemas.");
        } catch (error) {
            showMessage("Failed to update pin status.");
        }
    };

    const handleSaveEvent = async (eventData) => {
        showMessage("Saving event...");
        try {
            if (eventData.id) {
                const eventRef = doc(db, "events", eventData.id);
                const { id, ...dataToUpdate } = eventData;
                await updateDoc(eventRef, dataToUpdate);
                showMessage("Event updated successfully!");
            } else {
                const { id, ...dataToCreate } = eventData;
                const finalData = {
                    ...dataToCreate,
                    status: "upcoming",
                    ticketsSold: 0,
                    totalRevenue: 0,
                    isPromotedToBillboard: false // THE FIX: Explicitly disables auto-promotion on save
                };
                const newEventRef = await addDoc(collection(db, "events"), finalData);
                await updateDoc(newEventRef, { eventId: newEventRef.id });
                showMessage("New event created successfully!");
            }
            handleCloseForm();
        } catch (error) {
            console.error("Error saving event:", error);
            showMessage(`Error: ${error.message}`);
        }
    };

    const handleDeleteEvent = (event) => {
        setConfirmationTitle("Delete Event?");
        setConfirmationMessage(`Are you sure you want to permanently delete the event: "${event.eventTitle}"? This cannot be undone.`);
        setOnConfirmationAction(() => async () => {
            try {
                await deleteDoc(doc(db, "events", event.id));
                showMessage("Event deleted successfully.");
            } catch (error) {
                showMessage(`Error: ${error.message}`);
            }
        });
        setShowConfirmationModal(true);
    };

    const handleDuplicateEvent = (event) => {
        const { id, status, ...duplicatedData } = event;
        setEventToEdit(duplicatedData);
        setIsFormVisible(true);
    };

        const handleConfirmPublish = async () => {
    if (!eventToPublish || !selectedVodCategory) {
        showMessage("Error: No event or category selected.");
        return;
    }
    showMessage("Publishing event as VOD...");
    try {
        const publishFunction = httpsCallable(functions, 'publishEventAsContent');
        await publishFunction({
            eventId: eventToPublish.id,
            categoryName: selectedVodCategory
        });
        showMessage("Event successfully published as VOD!");
    } catch (error) {
        console.error("Error publishing event:", error);
        showMessage(`Error: ${error.message}`);
    } finally {
        setIsPublishModalVisible(false);
        setEventToPublish(null);
    }
  };

    const handlePublishEvent = (event) => {
        setEventToPublish(event);
        setIsPublishModalVisible(true);
    };

    const handleMovieUpload = async () => {
        if (!uploadState.movieFile) return showMessage("Please select a movie file first!");
        if (!uploadState.targetEventId) return showMessage("Please select a target event from the dropdown!");
        if (!uploadState.targetSlotNum) return showMessage("Please select a target slot from the dropdown!");
        uploadManager.startUpload(uploadState.movieFile, uploadState.targetEventId, uploadState.targetSlotNum, MEDIA_SERVER_URL, showMessage);
    };

    const formatDate = (timestamp) => {
        if (!timestamp || !timestamp.toDate) return 'Not set';
        return timestamp.toDate().toLocaleString();
    };
    
    return (
        <>
            {/* God-Tier CSS Overrides for Responsive Clearance */}
            <style>{`
                /* Unified Uploader Flex-Grid */
                .uploader-grid-system {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 12px;
                    width: 100%;
                    margin-top: 15px;
                }
                .uploader-select-item, .uploader-file-item, .uploader-button-item {
                    width: 100% !important;
                    box-sizing: border-box;
                }
                
                /* Master List Control Table & Card Mechanics */
                .library-wrapper {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    width: 100%;
                }
                .desktop-th {
                    display: none;
                }
                .modern-row-card {
                    display: flex;
                    flex-direction: column;
                    background: #111;
                    border: 1px solid #222;
                    border-radius: 10px;
                    padding: 16px;
                    gap: 14px;
                }
                .card-meta-line {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    border-bottom: 1px dashed #222;
                    padding-bottom: 10px;
                }
                .top-action-jumble {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    width: 100%;
                }
                .top-action-jumble button {
                    width: 100%;
                }

                /* Media Query: Scale to Desktop Grid */
                @media (min-width: 992px) {
                    .uploader-grid-system {
                        grid-template-columns: 180px 180px 1fr 220px;
                        align-items: center;
                        gap: 16px;
                    }
                    .top-action-jumble {
                        flex-direction: row;
                    }
                    .top-action-jumble button {
                        width: auto;
                    }
                    .desktop-th {
                        display: grid;
                        grid-template-columns: 80px 2.5fr 1fr 1.8fr 100px 2.5fr;
                        padding: 12px 16px;
                        font-weight: 900;
                        text-transform: uppercase;
                        font-size: 11px;
                        letter-spacing: 1px;
                        color: #666;
                        border-bottom: 1px solid #222;
                        gap: 16px;
                    }
                    .modern-row-card {
                        display: grid;
                        grid-template-columns: 80px 2.5fr 1fr 1.8fr 100px 2.5fr;
                        align-items: center;
                        border-radius: 6px;
                        padding: 12px 16px;
                        gap: 16px;
                    }
                    .card-meta-line {
                        display: contents; /* Strip card rules, inherit desktop grid positioning */
                    }
                    .mobile-label {
                        display: none !important;
                    }
                }
            `}</style>

            <p className="heading">Event Management Hub</p>
            <p className="subHeading">This is the master library of all events. The automation engine will manage their status and promotion.</p>
            
            <LiveDashboard showMessage={showMessage} />

            <div className="dashboardSection">
                <div className="top-action-jumble">
                    <button className="button" onClick={handleShowCreateForm}>Create New Event</button>
                    <button className="button" style={{backgroundColor: '#DC3545'}} onClick={handleManualTrigger}>Run Automation Manually</button>
                </div>
            </div>

            <div className="dashboardSection" style={{ border: '1px solid #007BFF', background: '#111' }}>
                <p className="dashboardSectionTitle" style={{ color: '#007BFF' }}>Cinema Live-Slot Engine (5 Slots)</p>
                <p className="paragraph" style={{ fontSize: '12px', marginBottom: '10px' }}>Upload a movie to one of the 5 isolated slots. Use the controls below to ping Cloudflare Edge Servers or delete heavy files from R2 to save space. <strong style={{color: '#DC3545'}}>Background Upload Mode active!</strong></p>
                
                <div className="uploader-grid-system" style={{ marginBottom: '20px' }}>
                    <select 
                        value={uploadState.targetEventId}
                        onChange={(e) => uploadManager.setTargetEventId(e.target.value)} 
                        className="uploader-select-item"
                        style={{ background: '#222', color: '#FFF', padding: '12px 8px', borderRadius: '4px', border: '1px solid #333', fontSize: '13px' }}
                    >
                        <option value="">Select Target Event for Upload...</option>
                        {events.map(ev => (
                            <option key={ev.id} value={ev.id}>{ev.eventTitle}</option>
                        ))}
                    </select>
                    <select 
                        value={uploadState.targetSlotNum}
                        onChange={(e) => uploadManager.setTargetSlotNum(e.target.value)} 
                        className="uploader-select-item"
                        style={{ background: '#222', color: '#FFF', padding: '12px 8px', borderRadius: '4px', border: '1px solid #333', fontSize: '13px' }}
                    >
                        <option value="1">Upload to Slot 1</option>
                        <option value="2">Upload to Slot 2</option>
                        <option value="3">Upload to Slot 3</option>
                        <option value="4">Upload to Slot 4</option>
                        <option value="5">Upload to Slot 5</option>
                    </select>
                    <input type="file" accept="video/mp4" onChange={(e) => uploadManager.setMovieFile(e.target.files[0])} className="paragraph uploader-file-item" style={{ background: '#222', padding: '9px 5px', borderRadius: '4px' }} />
                    <button className="button uploader-button-item" style={{ backgroundColor: uploadState.isUploadingMovie ? '#555' : '#007BFF', minWidth: '220px', height: '44px' }} onClick={handleMovieUpload} disabled={uploadState.isUploadingMovie}>
                        {uploadState.isUploadingMovie ? uploadState.statusMessage || `Processing...` : 'Upload to Target Event'}
                    </button>
                </div>
                {uploadState.isUploadingMovie && (
                    <div style={{ width: '100%', height: '4px', background: '#333', marginTop: '10px', borderRadius: '2px', overflow: 'hidden', marginBottom: '20px' }}>
                        <div style={{ width: `${uploadState.uploadProgress}%`, height: '100%', background: '#007BFF', transition: 'width 0.2s' }}></div>
                    </div>
                )}

                {/* THE 5-SLOT MANAGEMENT UI */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                    {[1, 2, 3, 4, 5].map(slotNum => {
                        // FIND THE ASSIGNED EVENT FOR THIS SLOT
                        const assignedEvent = events.find(ev => ev.cinemaSlot === slotNum.toString() || ev.cinemaSlot === slotNum);
                        
                        return (
                            <div key={slotNum} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1A1A1A', padding: '12px 16px', borderRadius: '8px', border: '1px solid #333', flexWrap: 'wrap', gap: '10px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '15px', flexWrap: 'wrap' }}>
                                    <span style={{ color: '#FFD700', fontWeight: '900', fontSize: '16px' }}>SLOT {slotNum}</span>
                                    {assignedEvent ? (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                            <span style={{ color: '#00FF00', fontWeight: 'bold', fontSize: '13px' }}>✅ READY:</span>
                                            <span style={{ color: '#FFF', fontWeight: 'bold', fontSize: '13px' }}>{assignedEvent.eventTitle}</span>
                                            <span style={{ color: '#FFD700', fontWeight: 'bold', fontSize: '12px', background: 'rgba(255,215,0,0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                                                💰 Gross: ${(assignedEvent.totalRevenue || 0).toFixed(2)}
                                            </span>
                                        </div>
                                    ) : (
                                        <span style={{ color: '#888', fontSize: '12px' }}>Awaiting Assignment / Empty</span>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                    <button 
                                        onClick={async () => {
                                            showMessage(`Warming up Slot ${slotNum}...`);
                                            try {
                                                const warmFunc = httpsCallable(functions, 'warmUpR2File');
                                                await warmFunc({ publicUrl: `https://media.nvanetworkapp.com/live-slots/slot-${slotNum}.mp4` });
                                                showMessage(`🔥 Slot ${slotNum} Warmed Up!`);
                                            } catch (e) { showMessage("Warm up failed."); }
                                        }}
                                        className="adminActionButton" 
                                        style={{ backgroundColor: '#FF8C00', color: '#FFF', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                                    >
                                        🔥 Warm Up
                                    </button>
                                    <button 
                                        onClick={async () => {
                                            if(!window.confirm(`Permanently delete the file in Slot ${slotNum} from R2 Storage?`)) return;
                                            showMessage(`Deleting Slot ${slotNum}...`);
                                            try {
                                                const delFunc = httpsCallable(functions, 'deleteR2File');
                                                await delFunc({ filePath: `live-slots/slot-${slotNum}.mp4` });
                                                showMessage(`🗑️ Slot ${slotNum} Cleared!`);
                                            } catch (e) { showMessage("Delete failed."); }
                                        }}
                                        className="adminActionButton" 
                                        style={{ backgroundColor: '#DC3545', color: '#FFF', border: 'none', padding: '8px 16px', borderRadius: '6px', fontWeight: 'bold', cursor: 'pointer' }}
                                    >
                                        🗑️ Delete File
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            
            <div className="dashboardSection">
                <p className="dashboardSectionTitle">Master Event Library</p>
                {isLoading ? <p>Loading events...</p> : (
                    <div className="library-wrapper">
                        {/* Tabular Header (Auto-Hides on Phone Screen Sizes) */}
                        <div className="desktop-th">
                            <div>Image</div>
                            <div>Event Title</div>
                            <div>Status</div>
                            <div>Schedule</div>
                            <div style={{ textAlign: 'center' }}>Ticketed</div>
                            <div style={{ textAlign: 'right' }}>Actions</div>
                        </div>

                        {/* List Items (Fluid Stack on Mobile, Native Grid Rows on Desktop) */}
                        {events.map(event => (
                            <div key={event.id} className="modern-row-card">
                                
                                {/* Image / Media Element */}
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <img src={event.thumbnailUrl || 'https://placehold.co/100x56/2A2A2A/FFF?text=N/A'} alt={event.eventTitle} style={{ width: '70px', height: '40px', borderRadius: '4px', objectFit: 'cover', border: '1px solid #222' }}/>
                                    <div className="mobile-label" style={{ fontSize: '11px', color: '#666', fontWeight: '900', textTransform: 'uppercase' }}>Preview Thumb</div>
                                </div>

                                {/* Title Header */}
                                <div className="card-meta-line">
                                    <div className="mobile-label" style={{ fontSize: '11px', color: '#666', fontWeight: '900', textTransform: 'uppercase' }}>Event Title</div>
                                    <div style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', textAlign: 'right' }}>
                                        {event.isPinned && <span style={{color: '#FFD700'}} title="Pinned to Cinemas">📌</span>}
                                        {event.isNowShowingFree && <span style={{backgroundColor: '#00FF00', color: '#000', fontSize: '9px', padding: '2px 4px', borderRadius: '3px'}} title="Global Free Entry">🔓 FREE</span>}
                                        <span>{event.eventTitle}</span>
                                    </div>
                                </div>

                                {/* Status Area */}
                                <div className="card-meta-line">
                                    <div className="mobile-label" style={{ fontSize: '11px', color: '#666', fontWeight: '900', textTransform: 'uppercase' }}>Event Status</div>
                                    <div><span className={`status-badge status-${event.status}`}>{event.status?.toUpperCase() || 'UNKNOWN'}</span></div>
                                </div>

                                {/* Date/Schedule Component */}
                                <div className="card-meta-line">
                                    <div className="mobile-label" style={{ fontSize: '11px', color: '#666', fontWeight: '900', textTransform: 'uppercase' }}>Air Schedule</div>
                                    <div style={{ fontSize: '12px', color: '#FFF', fontWeight: 'bold', textAlign: 'right' }}>
                                        <div>🟢 {formatDate(event.scheduledStartTime)}</div>
                                        <div style={{color: '#888', marginTop: '2px'}}>🔴 {formatDate(event.scheduledEndTime)}</div>
                                    </div>
                                </div>

                                {/* Ticket / Admission Status */}
                                <div className="card-meta-line">
                                    <div className="mobile-label" style={{ fontSize: '11px', color: '#666', fontWeight: '900', textTransform: 'uppercase' }}>Admission</div>
                                    <div style={{ textAlign: 'right', color: event.isTicketed ? '#00FF00' : '#888', fontWeight: 'bold', fontSize: '14px' }}>
                                        {event.isTicketed ? `🎟️ $${event.ticketPrice}` : 'Free'}
                                    </div>
                                </div>

                                {/* Action Buttons Panel (Touch Target Compliant) */}
                                <div className="flex gap-2 justify-end flex-wrap" style={{ borderTop: '1px dashed #222', paddingTop: '10px', width: '100%' }}>
                                    {/* THE FIX: Manual Billboard Promotion Toggle */}
                                    <button 
                                        onClick={async () => {
                                            const nextStatus = !event.isPromotedToBillboard;
                                            await updateDoc(doc(db, "events", event.id), { isPromotedToBillboard: nextStatus });
                                            if (nextStatus) {
                                                await updateDoc(doc(db, "settings", "liveEvent"), { eventId: event.id, status: event.status });
                                            } else {
                                                await updateDoc(doc(db, "settings", "liveEvent"), { eventId: null, status: 'no_event_scheduled' });
                                            }
                                            showMessage(nextStatus ? "Pushed to Billboard!" : "Removed from Billboard.");
                                        }} 
                                        className="adminActionButton" 
                                        style={{backgroundColor: event.isPromotedToBillboard ? '#E91E63' : '#333', color: '#FFF', minHeight: '36px', padding: '0 12px'}} 
                                        title="Toggle Billboard Promotion"
                                    >
                                        📺 Billboard
                                    </button>
                                    <button onClick={() => handleTogglePin(event)} className="adminActionButton" style={{backgroundColor: event.isPinned ? '#FFD700' : '#333', color: event.isPinned ? '#000' : '#FFF', minHeight: '36px', minWidth: '36px'}} title="Pin to Cinemas">📌</button>
                                    <button onClick={() => handleToggleFreeTag(event)} className="adminActionButton" style={{backgroundColor: event.isNowShowingFree ? '#00FF00' : '#333', color: event.isNowShowingFree ? '#000' : '#FFF', minHeight: '36px', minWidth: '36px'}} title="Enable Global Free Entry">🔓</button>
                                    <button onClick={() => handleShowEditForm(event)} className="adminActionButton" style={{minHeight: '36px', padding: '0 12px'}}>Edit</button>
                                    <button onClick={() => handleDuplicateEvent(event)} className="adminActionButton" style={{backgroundColor: '#007BFF', minHeight: '36px', padding: '0 12px'}}>Copy</button>
                                    {event.status === 'completed' && !event.isPublishedAsVOD && (
                                        <button onClick={() => handlePublishEvent(event)} className="adminActionButton" style={{backgroundColor: '#28a745', minHeight: '36px', padding: '0 12px'}}>Publish</button>
                                    )}
                                    <button onClick={() => handleDeleteEvent(event)} className="adminActionButton reject" style={{minHeight: '36px', padding: '0 12px'}}>Delete</button>
                                </div>

                            </div>
                        ))}
                    </div>
                )}
            </div>
            
            <button className="button" onClick={() => setActiveScreen('AdminDashboard')} style={{ backgroundColor: '#3A3A3A' }}>Back to Admin Dashboard</button>
            
            {isFormVisible && (
                <EventForm eventToEdit={eventToEdit} onSave={handleSaveEvent} onClose={handleCloseForm} showMessage={showMessage} />
            )}
       
                {isPublishModalVisible && eventToPublish && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <p className="heading">Publish as VOD</p>
                        <p>Publishing event: <strong>{eventToPublish.eventTitle}</strong></p>
                        <div className="formGroup">
                            <label className="formLabel">Select a Category:</label>
                            {/* --- CUSTOM SCROLLABLE LISTBOX --- */}
                            <div style={{
                                border: '1px solid #555',
                                borderRadius: '5px',
                                maxHeight: '130px', // Sets the height to show ~3 items
                                overflowY: 'auto', // Enables the scrollbar
                                backgroundColor: '#1A1A1A'
                            }}>
                                {vodCategories.map(cat => (
                                    <div
                                        key={cat}
                                        onClick={() => setSelectedVodCategory(cat)}
                                        style={{
                                            padding: '12px',
                                            cursor: 'pointer',
                                            backgroundColor: selectedVodCategory === cat ? '#007BFF' : 'transparent',
                                            color: selectedVodCategory === cat ? '#FFFFFF' : '#DDDDDD',
                                            borderBottom: '1px solid #3A3A3A'
                                        }}
                                        // Add hover effects for better UX
                                        onMouseOver={(e) => { if (selectedVodCategory !== cat) e.currentTarget.style.backgroundColor = '#333'; }}
                                        onMouseOut={(e) => { if (selectedVodCategory !== cat) e.currentTarget.style.backgroundColor = 'transparent'; }}
                                    >
                                        {cat}
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="flex justify-end gap-4 mt-4">
                            <button className="button" style={{backgroundColor: '#6c757d'}} onClick={() => setIsPublishModalVisible(false)}>Cancel</button>
                            <button className="button" onClick={handleConfirmPublish}>Confirm & Publish</button>
                        </div>
                    </div>
                </div>
            )}

        </>
    );
}

export default AdminEventManagerScreen;