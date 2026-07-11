import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import NotificationBell from '../NotificationBell';

describe('NotificationBell UI State & Interaction', () => {
    it('renders the red badge only when unread count is greater than 0', () => {
        const { rerender } = render(
            <NotificationBell count={0} onClick={vi.fn()} isActive={false} />
        );

        // With count 0, the red badge should NOT exist in the DOM
        expect(screen.queryByText('0')).not.toBeInTheDocument();

        // Rerender with 3 unread notifications
        rerender(<NotificationBell count={3} onClick={vi.fn()} isActive={false} />);

        // Red badge with number 3 must render
        const badge = screen.getByText('3');
        expect(badge).toBeInTheDocument();
        expect(badge).toHaveStyle('background-color: #DC3545'); // Correct red warning color
    });

    it('fires the onClick trigger when clicked to allow state resets', () => {
        const clickMock = vi.fn();
        render(<NotificationBell count={1} onClick={clickMock} isActive={false} />);

        const button = screen.getByRole('button');
        fireEvent.click(button);

        // Click trigger must be invoked to clear/reset the counter on the database
        expect(clickMock).toHaveBeenCalledTimes(1);
    });
});