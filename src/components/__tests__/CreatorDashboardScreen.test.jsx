import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import CreatorDashboardScreen from '../CreatorDashboardScreen';

describe('CreatorDashboardScreen Real-Time State Bindings', () => {
    const mockCurrentUser = { uid: 'test_creator_123', email: 'creator@nva.com' };
    const baseProfile = {
        creatorName: 'Golden Director',
        totalEarnings: 15000,
        giftsReceived: 5,
        roastTokens: 90,
        role: 'creator',
        creatorField: 'Filmmaker'
    };

    it('immediately reflects real-time totalEarnings on prop updates', () => {
        // 1. Render dashboard with base earnings (15,000 GYD)
        const { rerender } = render(
            <CreatorDashboardScreen 
                currentUser={mockCurrentUser}
                creatorProfile={baseProfile}
                showMessage={vi.fn()}
            />
        );

        // Earnings Display Card should show 15,000
        expect(screen.getByText('15,000 GYD')).toBeInTheDocument();

        // 2. Simulate a real-time transaction completing (balance increases to 25,000 GYD)
        const updatedProfile = { ...baseProfile, totalEarnings: 25000 };
        rerender(
            <CreatorDashboardScreen 
                currentUser={mockCurrentUser}
                creatorProfile={updatedProfile}
                showMessage={vi.fn()}
            />
        );

        // Earnings must immediately update on screen without refresh!
        expect(screen.getByText('25,000 GYD')).toBeInTheDocument();
        expect(screen.queryByText('15,000 GYD')).not.toBeInTheDocument();
    });

    it('immediately reflects real-time roastTokens count on prop updates', () => {
        const { rerender } = render(
            <CreatorDashboardScreen 
                currentUser={mockCurrentUser}
                creatorProfile={baseProfile}
                showMessage={vi.fn()}
            />
        );

        expect(screen.getByText('90')).toBeInTheDocument(); // Base tokens

        // Update tokens on the fly
        const updatedProfile = { ...baseProfile, roastTokens: 150 };
        rerender(
            <CreatorDashboardScreen 
                currentUser={mockCurrentUser}
                creatorProfile={updatedProfile}
                showMessage={vi.fn()}
            />
        );

        expect(screen.getByText('150')).toBeInTheDocument();
    });
});