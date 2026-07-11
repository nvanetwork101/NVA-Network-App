// src/components/EventForm.jsx

import React, { useState, useEffect, useRef } from 'react';
import { storage, ref, uploadBytes, getDownloadURL, extractVideoInfo } from '../firebase';
import { Timestamp } from 'firebase/firestore';

// A new, reusable component for both creating and editing events.
function EventForm({ eventToEdit, onSave, onClose, showMessage }) {
    // --- STATE MANAGEMENT ---
    const [eventData, setEventData] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [thumbnailFile, setThumbnailFile] = useState(null);
    const [thumbnailPreview, setThumbnailPreview] = useState('');
    const thumbFileInputRef = useRef(null);

    // --- EFFECT 1: Populates the form when an event is passed for editing ---
    useEffect(() => {
        if (eventToEdit) {
            const data = eventToEdit;
            const formattedData = { ...data };

            // Convert Firestore Timestamps back to a string format for the datetime-local input.
            // This helper function correctly handles the timezone offset.
            const formatTimestampForInput = (timestamp) => {
                if (timestamp && timestamp.toDate) {
                    const date = timestamp.toDate();
                    const tzoffset = (new Date()).getTimezoneOffset() * 60000; // offset in milliseconds
                    const localISOTime = (new Date(date.getTime() - tzoffset)).toISOString().slice(0, 16);
                    return localISOTime;
                }
                return '';
            };

            formattedData.scheduledStartTime = formatTimestampForInput(data.scheduledStartTime);
            formattedData.scheduledEndTime = formatTimestampForInput(data.scheduledEndTime);

            setEventData(formattedData);
        } else {
            // If no event is passed, clear the form for a new entry.
            setEventData({
                eventTitle: '',
                eventDescription: '',
                liveStreamUrl: '',
                trailerUrl: '', // Added trailerUrl
                isTicketed: false,
                ticketPrice: 10,
                scheduledStartTime: '',
                scheduledEndTime: '',
                thumbnailUrl: ''
            });
        }
    }, [eventToEdit]); // Re-run this effect if the event to edit changes.

    // --- EFFECT 2: Manages the thumbnail preview ---
    useEffect(() => {
        if (thumbnailFile) {
            const objectUrl = URL.createObjectURL(thumbnailFile);
            setThumbnailPreview(objectUrl);
            return () => URL.revokeObjectURL(objectUrl);
        }
        
        if (eventData.thumbnailUrl) {
            setThumbnailPreview(eventData.thumbnailUrl);
            return;
        }

        if (eventData.liveStreamUrl) {
            setThumbnailPreview(extractVideoInfo(eventData.liveStreamUrl).thumbnailUrl);
        } else {
            setThumbnailPreview('');
        }
    }, [thumbnailFile, eventData.liveStreamUrl, eventData.thumbnailUrl]);

    const handleThumbnailSelect = (e) => {
        const file = e.target.files[0];
        if (file) {
            setThumbnailFile(file);
        }
    };

    // --- HANDLERS ---
    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setEventData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    };

    const handleSaveEvent = async () => {
        // STEP 1: Rigorous Validation
        if (!eventData.eventTitle || !eventData.scheduledStartTime || !eventData.scheduledEndTime) {
            showMessage("Event Title, Start Time, and End Time are all required.");
            return;
        }

        setIsSaving(true);
        showMessage("Validating and preparing event data...");

        try {
            // STEP 2: Handle thumbnail upload FIRST to get the final URL.
            let finalThumbnailUrl = eventData.thumbnailUrl || thumbnailPreview || '';
            if (thumbnailFile) {
                showMessage("Uploading thumbnail...");
                const filePath = `event_thumbnails/${Date.now()}_${thumbnailFile.name}`;
                const storageRef = ref(storage, filePath);
                const snapshot = await uploadBytes(storageRef, thumbnailFile);
                finalThumbnailUrl = await getDownloadURL(snapshot.ref);
            }

            // STEP 3: Build a new, perfectly clean data object from scratch.
            const cleanData = {
                id: eventData.id,
                
                eventTitle: eventData.eventTitle || '',
                eventDescription: eventData.eventDescription || '',
                liveStreamUrl: eventData.liveStreamUrl || '',
                trailerUrl: eventData.trailerUrl || '', // Added trailerUrl
                isTicketed: eventData.isTicketed || false,
                ticketPrice: Number(eventData.ticketPrice) || 0,
                thumbnailUrl: finalThumbnailUrl,

                // --- THIS IS THE FIX ---
                // Ensure the isPublished field is always a boolean.
                isPublished: eventData.isPublished || false,

                scheduledStartTime: Timestamp.fromDate(new Date(eventData.scheduledStartTime)),
                scheduledEndTime: Timestamp.fromDate(new Date(eventData.scheduledEndTime)),
            };
            
            // STEP 4: Call the onSave prop with the fully sanitized data.
            onSave(cleanData);

        } catch (error) {
            console.error("CRITICAL ERROR preparing event data:", error);
            showMessage(`CRITICAL ERROR: ${error.message}`);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="modal-backdrop">
            <div className="modal-content">
                <p className="heading">{eventToEdit ? 'Edit Event' : 'Create New Event'}</p>
                <p className="subHeading">Fill out the details for the master event library. Automation will handle the rest.</p>
                
                <div className="formGroup"><label className="formLabel">Event Title:</label><input type="text" name="eventTitle" className="formInput" value={eventData.eventTitle || ''} onChange={handleInputChange} placeholder="e.g., NVA Summer Comedy Slam" /></div>
                <div className="formGroup"><label className="formLabel">Event Description:</label><textarea name="eventDescription" className="formTextarea" value={eventData.eventDescription || ''} onChange={handleInputChange} placeholder="A short, catchy description."></textarea></div>
                <div className="formGroup"><label className="formLabel">Scheduled Start Time:</label><input type="datetime-local" name="scheduledStartTime" className="formInput" value={eventData.scheduledStartTime || ''} onChange={handleInputChange} /></div>
                
                {/* --- NEW REQUIRED FIELD --- */}
                <div className="formGroup"><label className="formLabel">Scheduled End Time:</label><input type="datetime-local" name="scheduledEndTime" className="formInput" value={eventData.scheduledEndTime || ''} onChange={handleInputChange} /></div>
                
                <div className="formGroup"><label className="formLabel">Embed URL (for live stream):</label><input type="url" name="liveStreamUrl" className="formInput" value={eventData.liveStreamUrl || ''} onChange={handleInputChange} placeholder="e.g., YouTube, Vimeo embed link" /></div>

                <div className="formGroup"><label className="formLabel">Trailer URL (Optional - Adds a Watch Trailer button):</label><input type="url" name="trailerUrl" className="formInput" value={eventData.trailerUrl || ''} onChange={handleInputChange} placeholder="e.g., YouTube, Vimeo trailer link" /></div>

                {/* --- NVA PUBLISH CONTROL --- */}
                <div className="adminDashboardItem" style={{flexDirection: 'column', alignItems: 'stretch', gap: '15px', background: '#0A0A0A', padding: '16px', borderRadius: '12px', border: eventData.isPublished ? '2px solid #00FF00' : '1px solid #333', marginTop: '20px', transition: 'all 0.3s'}}>
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="formLabel" style={{marginBottom: '4px', color: '#00FF00', fontSize: '14px', fontWeight: 'bold'}}>📡 Publish To Billboard</p>
                            <p className="smallText" style={{color: '#888', margin: 0, fontSize: '12px'}}>Automation engine will cycle this into the global Live Banner.</p>
                        </div>
                        <label className="flex items-center cursor-pointer">
                            <div className="relative">
                                <input type="checkbox" name="isPublished" className="sr-only" checked={eventData.isPublished || false} onChange={handleInputChange} />
                                <div className={`block w-14 h-8 rounded-full transition-colors ${eventData.isPublished ? 'bg-[#00FF00]' : 'bg-gray-700'}`}></div>
                                <div className={`dot absolute left-1 top-1 bg-black w-6 h-6 rounded-full transition-transform ${eventData.isPublished ? 'transform translate-x-6' : ''}`}></div>
                            </div>
                        </label>
                    </div>
                </div>

                {/* --- NVA TICKET SALES CONTROL --- */}
                <div className="adminDashboardItem" style={{flexDirection: 'column', alignItems: 'stretch', gap: '15px', background: '#0A0A0A', padding: '16px', borderRadius: '12px', border: eventData.isTicketed ? '2px solid #FFD700' : '1px solid #333', marginTop: '15px', transition: 'all 0.3s'}}>
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="formLabel" style={{marginBottom: '4px', color: '#FFD700', fontSize: '14px', fontWeight: 'bold'}}>🎟️ Box Office Ticketing</p>
                            <p className="smallText" style={{color: '#888', margin: 0, fontSize: '12px'}}>Gate this event. Viewers must purchase a ticket pledge.</p>
                        </div>
                        <label className="flex items-center cursor-pointer">
                            <div className="relative">
                                <input type="checkbox" name="isTicketed" className="sr-only" checked={eventData.isTicketed || false} onChange={handleInputChange} />
                                <div className={`block w-14 h-8 rounded-full transition-colors ${eventData.isTicketed ? 'bg-[#FFD700]' : 'bg-gray-700'}`}></div>
                                <div className={`dot absolute left-1 top-1 bg-black w-6 h-6 rounded-full transition-transform ${eventData.isTicketed ? 'transform translate-x-6' : ''}`}></div>
                            </div>
                        </label>
                    </div>
                    {eventData.isTicketed && (
                        <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#1A1A1A', padding: '12px', borderRadius: '8px', border: '1px solid #444'}}>
                            <p className="formLabel" style={{marginBottom: 0, color: '#FFF'}}>Ticket Price (USD)</p>
                            <div className="flex items-center gap-2">
                                <span style={{color: '#00FF00', fontWeight: 'bold', fontSize: '18px'}}>$</span>
                                <input type="number" name="ticketPrice" className="formInput" value={eventData.ticketPrice || ''} onChange={handleInputChange} style={{width: '120px', textAlign: 'right', margin: 0, fontSize: '16px', fontWeight: 'bold', borderColor: '#00FF00'}} placeholder="10.00" />
                            </div>
                        </div>
                    )}
                </div>

                <div className="formGroup">
                    <label className="formLabel">Event Thumbnail:</label>
                    <input type="file" accept="image/*" ref={thumbFileInputRef} onChange={handleThumbnailSelect} style={{ display: 'none' }} />
                    <button type="button" className="button" style={{backgroundColor: '#3A3A3A', width: 'auto'}} onClick={() => thumbFileInputRef.current.click()}>
                        <span className="buttonText light">Upload Image</span>
                    </button>
                    {thumbnailPreview && (
                        <img src={thumbnailPreview} alt="Thumbnail Preview" style={{ maxWidth: '200px', borderRadius: '8px', marginTop: '10px' }} />
                    )}
                </div>
               
                <div className="flex gap-4 mt-4">
                    <button onClick={handleSaveEvent} className="button" disabled={isSaving}>
                        {isSaving ? 'Saving...' : 'Save Event'}
                    </button>
                    <button onClick={onClose} className="button" style={{backgroundColor: '#555'}} disabled={isSaving}>
                        Cancel
                    </button>
                </div>
            </div>
        </div>
    );
}

export default EventForm;