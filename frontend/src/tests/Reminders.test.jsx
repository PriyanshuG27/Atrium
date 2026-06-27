import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Reminders from '../pages/Reminders';

const mockReminders = [
  {
    id: 1,
    user_id: 42,
    message: 'Check article about spaced repetition',
    remind_at: '2026-06-28T09:00:00Z',
    status: 'pending',
    created_at: '2026-06-27T10:00:00Z'
  },
  {
    id: 2,
    user_id: 42,
    message: 'Review ML notes',
    remind_at: '2026-06-29T14:00:00Z',
    status: 'pending',
    created_at: '2026-06-27T10:05:00Z'
  },
  {
    id: 3,
    user_id: 42,
    message: 'Google Drive sync reminder',
    remind_at: '2026-06-25T11:00:00Z',
    status: 'sent',
    created_at: '2026-06-24T11:00:00Z'
  }
];

describe('Reminders Page Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Global fetch mock
    window.fetch = vi.fn();
    // confirm mock
    window.confirm = vi.fn(() => true);
  });

  it('renders loading state then the reminders list', async () => {
    window.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockReminders
    });

    render(<Reminders />);

    expect(screen.getByText('Loading reminders...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('Check article about spaced repetition')).toBeInTheDocument();
    });

    expect(screen.getByText('Review ML notes')).toBeInTheDocument();
    
    // Check that pending active reminders are displayed by default (count = 2)
    expect(screen.getByText(/Active reminders:/i)).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
  });

  it('filters reminders when tabs are clicked', async () => {
    window.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockReminders
    });

    render(<Reminders />);

    await waitFor(() => {
      expect(screen.getByText('Review ML notes')).toBeInTheDocument();
    });

    // Sent tab
    const sentTab = screen.getByRole('button', { name: 'Sent' });
    fireEvent.click(sentTab);

    // Sent reminder is displayed, pending is not
    expect(screen.getByText('Google Drive sync reminder')).toBeInTheDocument();
    expect(screen.queryByText('Review ML notes')).not.toBeInTheDocument();

    // All tab
    const allTab = screen.getByRole('button', { name: 'All' });
    fireEvent.click(allTab);

    expect(screen.getByText('Review ML notes')).toBeInTheDocument();
    expect(screen.getByText('Google Drive sync reminder')).toBeInTheDocument();
  });

  it('disables delete button for sent reminders', async () => {
    window.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockReminders
    });

    render(<Reminders />);

    await waitFor(() => {
      expect(screen.getByText('Review ML notes')).toBeInTheDocument();
    });

    // Go to "All" tab so we see both
    const allTab = screen.getByRole('button', { name: 'All' });
    fireEvent.click(allTab);

    const deleteButtons = screen.getAllByRole('button', { name: /Delete/i });
    
    // Index 0 (pending) should be enabled
    expect(deleteButtons[0]).not.toBeDisabled();
    // Index 1 (pending) should be enabled
    expect(deleteButtons[1]).not.toBeDisabled();
    // Index 2 (sent) should be disabled
    expect(deleteButtons[2]).toBeDisabled();
  });

  it('calls delete endpoint and removes item from UI when delete is clicked', async () => {
    window.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockReminders
      })
      .mockResolvedValueOnce({
        status: 204,
        ok: true
      });

    render(<Reminders />);

    await waitFor(() => {
      expect(screen.getByText('Review ML notes')).toBeInTheDocument();
    });

    const deleteButtons = screen.getAllByRole('button', { name: /Delete/i });
    fireEvent.click(deleteButtons[0]);

    // confirm called
    expect(window.confirm).toHaveBeenCalled();

    // fetch called with DELETE method
    expect(window.fetch).toHaveBeenCalledWith('/api/reminders/1', expect.objectContaining({
      method: 'DELETE'
    }));

    // Item should be removed from view
    await waitFor(() => {
      expect(screen.queryByText('Check article about spaced repetition')).not.toBeInTheDocument();
    });
  });
});
