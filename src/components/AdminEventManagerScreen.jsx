// src/components/AdminEventManagerScreen.jsx

import React, { useState, useEffect } from 'react';
import { db, functions } from '../firebase'; // Correct: functions is now imported
import { httpsCallable } from 'firebase/functions'; // Correct: httpsCallable is now imported
import { collection, onSnapshot, doc, setDoc, addDoc, deleteDoc, updateDoc, query, orderBy, Timestamp, where } from 'firebase/firestore';
import EventForm from './EventForm';

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
                    totalRevenue: 0
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

    const formatDate = (timestamp) => {
        if (!timestamp || !timestamp.toDate) return 'Not set';
        return timestamp.toDate().toLocaleString();
    };
    
    return (
        <>
            <p className="heading">Event Management Hub</p>
            <p className="subHeading">This is the master library of all events. The automation engine will manage their status and promotion.</p>
            
            <LiveDashboard showMessage={showMessage} />

            <div className="dashboardSection">
                <div className="flex gap-4">
                    <button className="button" onClick={handleShowCreateForm}>Create New Event</button>
                    <button className="button" style={{backgroundColor: '#DC3545'}} onClick={handleManualTrigger}>Run Automation Manually</button>
                </div>
            </div>
            
            <div className="dashboardSection">
                <p className="dashboardSectionTitle">Master Event Library</p>
                {isLoading ? <p>Loading events...</p> : (
                    <div className="event-list-container" style={{ overflowX: 'auto' }}>
                        <div className="event-list-header" style={{ minWidth: '850px' }}>
                            <div style={{ flex: '0 0 70px' }}>Image</div>
                            <div style={{ flex: '2 1 0%' }}>Event Title</div>
                            <div style={{ flex: '1 1 0%' }}>Status</div>
                            <div style={{ flex: '1.5 1 0%' }}>Schedule</div>
                            <div style={{ flex: '0 0 100px', textAlign: 'center' }}>Ticketed</div>
                            <div style={{ flex: '1.5 1 0%', textAlign: 'right' }}>Actions</div>
                        </div>
                        <div className="event-list-body">
                            {events.map(event => (
                                <div key={event.id} className="event-list-item" style={{ minWidth: '850px' }}>
                                    <div style={{ flex: '0 0 70px' }}><img src={event.thumbnailUrl || 'https://placehold.co/100x56/2A2A2A/FFF?text=N/A'} alt={event.eventTitle} style={{ width: '60px', height: '34px', borderRadius: '4px', objectFit: 'cover' }}/></div>
                                    <div style={{ flex: '2 1 0%', fontWeight: 'bold' }}>{event.eventTitle}</div>
                                    <div style={{ flex: '1 1 0%' }}><span className={`status-badge status-${event.status}`}>{event.status?.toUpperCase() || 'UNKNOWN'}</span></div>
                                    <div style={{ flex: '1.5 1 0%', fontSize: '12px', color: '#ccc' }}>
                                        <div>Starts: {formatDate(event.scheduledStartTime)}</div>
                                        <div>Ends: {formatDate(event.scheduledEndTime)}</div>
                                    </div>
                                    <div style={{ flex: '0 0 100px', textAlign: 'center', color: event.isTicketed ? '#4CAF50' : '#FFC107', fontWeight: 'bold' }}>{event.isTicketed ? `Yes ($${event.ticketPrice})` : 'No'}</div>
                                   <div className="flex gap-2 justify-end" style={{ flex: '1.5 1 0%'}}>
                                        <button onClick={() => handleShowEditForm(event)} className="adminActionButton">Edit</button>
                                        <button onClick={() => handleDuplicateEvent(event)} className="adminActionButton" style={{backgroundColor: '#007BFF'}}>Duplicate</button>
                                        {event.status === 'completed' && !event.isPublishedAsVOD && (
                                            <button onClick={() => handlePublishEvent(event)} className="adminActionButton" style={{backgroundColor: '#28a745'}}>Publish VOD</button>
                                        )}
                                        <button onClick={() => handleDeleteEvent(event)} className="adminActionButton reject">Delete</button>
                                    </div>
                                </div>
                            ))}
                        </div>
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