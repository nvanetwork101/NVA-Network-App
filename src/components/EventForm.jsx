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

                {/* --- NEW PUBLISH CONTROL --- */}
                <div className="adminDashboardItem" style={{flexDirection: 'column', alignItems: 'stretch', gap: '10px', background: '#222', padding: '10px', borderRadius: '8px', border: '1px solid #FFD700', marginTop: '20px'}}>
                    <p className="formLabel" style={{marginBottom: 0}}>Publish To Public</p>
                    <p className="smallText" style={{textAlign: 'left', color: '#AAA', margin: '0 0 5px 0'}}>When enabled, the automation will pick this event up and display it on the public billboard when its turn comes.</p>
                    <label className="flex items-center cursor-pointer">
                        <div className="relative">
                            <input type="checkbox" name="isPublished" className="sr-only" checked={eventData.isPublished || false} onChange={handleInputChange} />
                            <div className={`block w-14 h-8 rounded-full ${eventData.isPublished ? 'bg-green-500' : 'bg-gray-600'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${eventData.isPublished ? 'transform translate-x-6' : ''}`}></div>
                        </div>
                        <span className="ml-3 text-sm font-medium text-gray-300">{eventData.isPublished ? 'Published' : 'Draft'}</span>
                    </label>
                </div>

                <div className="adminDashboardItem" style={{flexDirection: 'column', alignItems: 'stretch', gap: '10px', background: '#222', padding: '10px', borderRadius: '8px', border: '1px solid #444'}}>
                    <p className="formLabel" style={{marginBottom: 0}}>Enable Ticket Sales</p>
                    <label className="flex items-center cursor-pointer">
                        <div className="relative">
                            <input type="checkbox" name="isTicketed" className="sr-only" checked={eventData.isTicketed || false} onChange={handleInputChange} />
                            <div className={`block w-14 h-8 rounded-full ${eventData.isTicketed ? 'bg-green-500' : 'bg-gray-600'}`}></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${eventData.isTicketed ? 'transform translate-x-6' : ''}`}></div>
                        </div>
                        <span className="ml-3 text-sm font-medium text-gray-300">{eventData.isTicketed ? 'Enabled' : 'Disabled'}</span>
                    </label>
                    <div className="adminDashboardItem" style={{padding: '0', background: 'none'}}><p className="formLabel" style={{marginBottom: 0, flexGrow: 1}}>Ticket Price (USD)</p><input type="number" name="ticketPrice" className="formInput" value={eventData.ticketPrice || ''} onChange={handleInputChange} style={{width: '100px', textAlign: 'right'}} disabled={!eventData.isTicketed}/></div>
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