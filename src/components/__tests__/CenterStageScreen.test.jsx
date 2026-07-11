import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CenterStageScreen from '../CenterStageScreen';

import * as firestore from 'firebase/firestore';

// Mock the local firebase import
vi.mock('../../firebase', () => ({
    db: {},
    functions: {}
}));

// THE FIX: Return structured descriptors so onSnapshot can safely route both Query and Document callbacks
vi.mock('firebase/firestore', () => ({
    collection: vi.fn((db, path) => ({ type: 'collection', path })),
    doc: vi.fn((db, path, docId) => ({ type: 'doc', path, docId })),
    query: vi.fn((ref) => ref),
    where: vi.fn(),
    onSnapshot: vi.fn(() => vi.fn()), 
    getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
    setDoc: vi.fn(),
    updateDoc: vi.fn(),
    increment: vi.fn()
}));

describe('CenterStageScreen Eliminations & Visual Grayscale rendering', () => {
    it('separates eliminated contestants and renders them under grayscaled visual cards', async () => {
        const mockContestants = [
            { id: 'active_1', creatorName: 'Star Singer', isContestant: true, voteCount: 10 },
            { id: 'eliminated_2', creatorName: 'Silent Actor', isContestant: true, voteCount: 2, isEliminated: true, competitionStatus: 'eliminated' }
        ];

        const mockGiftTokens = [
            { id: 'spotlight', name: 'Warm Spotlight', price: 500, icon: '🔦' },
            { id: 'popcorn', name: 'Golden Popcorn', price: 1000, icon: '🍿' }
        ];

        // Route the real-time callback based on what reference the component is listening to
        vi.spyOn(firestore, 'onSnapshot').mockImplementation((ref, callback) => {
            if (ref?.type === 'doc') {
                if (ref.docId === 'tokenEconomics') {
                    callback({
                        exists: () => true,
                        data: () => ({ giftTokens: mockGiftTokens })
                    });
                } else if (ref.docId === 'competitionDisplayState') {
                    callback({
                        exists: () => true,
                        data: () => ({ currentStageIndex: 0, stages: ['Round 1', 'Semifinals', 'Finals'] })
                    });
                } else {
                    // Fallback for user profile doc
                    callback({
                        exists: () => true,
                        data: () => ({ creatorName: 'Test User', totalEarnings: 0 })
                    });
                }
            } else if (ref?.type === 'collection') {
                if (ref.path === 'creators') {
                    callback({
                        docs: mockContestants.map(c => ({
                            id: c.id,
                            data: () => c
                        }))
                    });
                } else {
                    // Fallback for paymentPledges
                    callback({ docs: [] });
                }
            }
            return vi.fn(); // Mock unsubscribe
        });

        render(
            <CenterStageScreen 
                setActiveScreen={vi.fn()}
                currentUser={{ uid: 'user_123' }}
                showMessage={vi.fn()}
                targetContestantId={null}
                handleVideoPress={vi.fn()}
            />
        );

        // 1. Verify Star Singer is active and has full color
        const activeNames = screen.getAllByText('Star Singer');
        expect(activeNames.length).toBeGreaterThan(0);
        expect(activeNames[0]).toBeInTheDocument();

        // 2. Verify Silent Actor is correctly sorted into the "Cutting Room Floor" (eliminated section)
        const heading = screen.getByText(/The Cutting Room Floor/);
        expect(heading).toBeInTheDocument();

        // 3. Verify Silent Actor card is visually grayscaled to protect visual state bounds
        const eliminatedName = screen.getByText('Silent Actor');
        expect(eliminatedName).toBeInTheDocument();
        
        // Find the closest card container (parent element containing .eliminated-card styling class)
        const eliminatedCard = eliminatedName.closest('.eliminated-card');
        expect(eliminatedCard).toBeInTheDocument();
        
        // Check that CSS rules apply grayscale(100%) to visually signify their exit from the Arena
        const style = window.getComputedStyle(eliminatedCard);
        expect(style.filter).toContain('grayscale(100%)');
    });
});