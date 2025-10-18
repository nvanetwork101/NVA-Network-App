// src/components/GiftTicketModal.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebase';

// Simple debounce hook
const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
};

const GiftTicketModal = ({ onClose, eventDetails, setPledgeContext, setActiveScreen, showMessage }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [results, setResults] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [selectedUser, setSelectedUser] = useState(null);

    const debouncedSearchTerm = useDebounce(searchTerm, 300); // 300ms delay

    const searchForUser = useCallback(async (term) => {
        if (term.length < 3) {
            setResults([]);
            setError('');
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const searchFunction = httpsCallable(functions, 'searchForUser');
            const response = await searchFunction({ searchTerm: term });
            setResults(response.data.users || []);
        } catch (err) {
            console.error("Error searching for user:", err);
            setError("An error occurred. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        searchForUser(debouncedSearchTerm);
    }, [debouncedSearchTerm, searchForUser]);

    const handleConfirmGift = () => {
        if (!selectedUser) {
            showMessage("Please select a user to gift the ticket to.");
            return;
        }

        // Set the context for the pledge screen, including the recipientId
        setPledgeContext({
            type: 'eventTicket',
            amount: eventDetails.ticketPrice,
            targetEventId: eventDetails.id,
            targetEventTitle: eventDetails.eventTitle,
            recipientId: selectedUser.userId, // The key addition for gifting
            recipientName: selectedUser.creatorName // For display on the next screen
        });
        
        // THIS IS THE FIX: Navigate directly to the screen designed to handle pledges,
        // not the general support menu.
        setActiveScreen('SubscriptionPledgeScreen');
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                <div className="modal-header">
                    <p className="modal-title">Gift a Ticket for "{eventDetails.eventTitle}"</p>
                    <button className="modal-close-button" onClick={onClose}>&times;</button>
                </div>
                <div className="modal-body">
                    <p className="paragraph" style={{ textAlign: 'center', marginBottom: '15px' }}>
                        Search for a user on the NVA Network to send this ticket to.
                    </p>
                    <input
                        type="text"
                        className="formInput"
                        placeholder="Search by Creator Name..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoFocus
                    />
                    
                    <div className="search-results-container" style={{ minHeight: '150px', marginTop: '10px' }}>
                        {isLoading && <p style={{ textAlign: 'center' }}>Searching...</p>}
                        {error && <p style={{ textAlign: 'center', color: 'red' }}>{error}</p>}
                        {!isLoading && !error && results.length === 0 && debouncedSearchTerm.length >= 3 && (
                            <p style={{ textAlign: 'center' }}>No users found.</p>
                        )}
                        {!isLoading && !error && results.length === 0 && debouncedSearchTerm.length < 3 && (
                            <p style={{ textAlign: 'center', color: '#888' }}>Enter at least 3 characters to search.</p>
                        )}
                        {!isLoading && !error && results.length > 0 && (
                            <ul className="user-list">
                                {results.map(user => (
                                    <li
                                        key={user.userId}
                                        className={`user-list-item ${selectedUser?.userId === user.userId ? 'selected' : ''}`}
                                        onClick={() => setSelectedUser(user)}
                                        style={{
                                            cursor: 'pointer',
                                            // THIS IS THE FIX: Adds a prominent visual style to the selected user.
                                            backgroundColor: selectedUser?.userId === user.userId ? '#FFD700' : 'transparent',
                                            color: selectedUser?.userId === user.userId ? '#0A0A0A' : 'inherit',
                                            fontWeight: selectedUser?.userId === user.userId ? 'bold' : 'normal',
                                            padding: '10px',
                                            borderRadius: '8px'
                                        }}
                                    >
                                        <img
                                            src={user.profilePictureUrl || 'https://placehold.co/40x40/2A2A2A/FFF?text=N/A'}
                                            alt={user.creatorName}
                                            className="user-avatar"
                                        />
                                        <span>{user.creatorName}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
                <div className="modal-footer">
                    <button 
                        className="button" 
                        onClick={onClose}
                        style={{ backgroundColor: '#0A0A0A', border: '1px solid #FFD700' }}
                    >
                        <span className="buttonText" style={{ color: '#FFD700' }}>Cancel</span>
                    </button>
                    <button className="button" onClick={handleConfirmGift} disabled={!selectedUser}>
                        <span className="buttonText">Confirm Gift</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default GiftTicketModal;