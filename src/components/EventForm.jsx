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
    
    // --- WATCH PARTY / TMDB STATE ---
    const [activeMode, setActiveMode] = useState('manual'); 
    const [tmdbQuery, setTmdbQuery] = useState('');
    const [tmdbResults, setTmdbResults] = useState([]);
    const [isSearchingTMDb, setIsSearchingTMDb] = useState(false);

    // Debounced As-You-Type Search
    useEffect(() => {
        const fetchTMDb = async () => {
            if (!tmdbQuery.trim()) {
                setTmdbResults([]);
                return;
            }
            setIsSearchingTMDb(true);
            try {
                const res = await fetch(`https://api.themoviedb.org/3/search/multi?api_key=3a5d4d1236db785a5f685d4bb4ca74c1&query=${encodeURIComponent(tmdbQuery)}`);
                const data = await res.json();
                setTmdbResults(data.results?.filter(r => r.media_type === 'movie' || r.media_type === 'tv') || []);
            } catch (err) {
                console.error("TMDb Search failed.", err);
            } finally {
                setIsSearchingTMDb(false);
            }
        };

        const timeoutId = setTimeout(() => {
            fetchTMDb();
        }, 500); // 500ms delay to wait until user stops typing

        return () => clearTimeout(timeoutId);
    }, [tmdbQuery]);

    const handleSelectTMDbMovie = (movie) => {
        const title = movie.title || movie.name;
        const synopsis = movie.overview || "No synopsis available.";
        const poster = movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : '';
        
        setEventData(prev => ({ ...prev, eventTitle: title, eventDescription: synopsis, thumbnailUrl: poster }));
        setThumbnailPreview(poster);
        setTmdbResults([]);
        setTmdbQuery('');
        showMessage(`✅ Auto-Filled: ${title}`);
    };

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
                room: eventData.room || 'Room 1', 

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
                
                <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
                    <button type="button" onClick={() => setActiveMode('manual')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: activeMode === 'manual' ? '#FFD700' : '#222', color: activeMode === 'manual' ? '#000' : '#FFF', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}>✍️ Manual Entry</button>
                    <button type="button" onClick={() => setActiveMode('tmdb')} style={{ flex: 1, padding: '10px', borderRadius: '8px', border: 'none', backgroundColor: activeMode === 'tmdb' ? '#00FFFF' : '#222', color: activeMode === 'tmdb' ? '#000' : '#FFF', fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s' }}>🍿 Watch Party (Auto-Fill)</button>
                </div>

                {activeMode === 'tmdb' && (
                    <div style={{ background: '#111', padding: '15px', borderRadius: '8px', border: '1px solid #00FFFF', marginBottom: '20px' }}>
                        <p style={{ color: '#00FFFF', fontWeight: 'bold', fontSize: '14px', margin: '0 0 10px 0' }}>Search TMDb Database</p>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <input type="text" className="formInput" placeholder="Start typing a movie or show title..." value={tmdbQuery} onChange={(e) => setTmdbQuery(e.target.value)} style={{ margin: 0, flex: 1 }} />
                            {isSearchingTMDb && <span style={{ color: '#00FFFF', fontSize: '12px', fontWeight: 'bold' }}>Searching...</span>}
                        </div>
                        {tmdbResults.length > 0 && (
                            <div style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {tmdbResults.map((movie) => (
                                    <div key={movie.id} onClick={() => handleSelectTMDbMovie(movie)} style={{ display: 'flex', gap: '12px', padding: '8px', backgroundColor: '#222', borderRadius: '6px', cursor: 'pointer' }}>
                                        <img src={movie.poster_path ? `https://image.tmdb.org/t/p/w92${movie.poster_path}` : 'https://placehold.co/50x75/111/FFF?text=N/A'} alt="Poster" style={{ width: '40px', height: '60px', objectFit: 'cover', borderRadius: '4px' }} />
                                        <div>
                                            <p style={{ fontWeight: 'bold', fontSize: '14px', color: '#FFF', margin: '0 0 4px 0' }}>{movie.title || movie.name}</p>
                                            <p style={{ fontSize: '11px', color: '#AAA', margin: 0 }}>⭐ {movie.vote_average || 'N/A'}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                <div className="formGroup"><label className="formLabel">Event Title:</label><input type="text" name="eventTitle" className="formInput" value={eventData.eventTitle || ''} onChange={handleInputChange} placeholder="e.g., NVA Summer Comedy Slam" /></div>
                <div className="formGroup"><label className="formLabel">Event Description:</label><textarea name="eventDescription" className="formTextarea" value={eventData.eventDescription || ''} onChange={handleInputChange} placeholder="A short, catchy description."></textarea></div>
                <div className="formGroup"><label className="formLabel">Scheduled Start Time:</label><input type="datetime-local" name="scheduledStartTime" className="formInput" value={eventData.scheduledStartTime || ''} onChange={handleInputChange} /></div>
                <div className="formGroup"><label className="formLabel">Scheduled End Time:</label><input type="datetime-local" name="scheduledEndTime" className="formInput" value={eventData.scheduledEndTime || ''} onChange={handleInputChange} /></div>
                
                {activeMode === 'tmdb' ? (
                    <div className="formGroup">
                        <label className="formLabel">Virtual Room (Bypasses Embed URL):</label>
                        <select name="room" className="formInput" value={eventData.room || 'Room 1'} onChange={handleInputChange}>
                            {["Room 1", "Room 2", "Room 3", "Room 4", "Room 5", "Free Screening Room"].map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                ) : (
                    <div className="formGroup"><label className="formLabel">Embed URL (for live stream):</label><input type="url" name="liveStreamUrl" className="formInput" value={eventData.liveStreamUrl || ''} onChange={handleInputChange} placeholder="e.g., YouTube, Vimeo embed link" /></div>
                )}

                <div className="formGroup"><label className="formLabel">Trailer URL (Optional - Adds a Watch Trailer button):</label><input type="url" name="trailerUrl" className="formInput" value={eventData.trailerUrl || ''} onChange={handleInputChange} placeholder="e.g., YouTube, Vimeo trailer link" /></div>

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