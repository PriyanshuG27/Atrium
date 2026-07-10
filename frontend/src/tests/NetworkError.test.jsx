import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from '../App';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../components/Toast';

// Mock the lazy-loaded Archive room to render synchronously in tests
vi.mock('../pages/Archive', () => ({
  default: () => <div>No signals received yet.</div>
}));

describe('Network and Offline Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();

    vi.spyOn(window, 'fetch').mockImplementation((url) => {
      if (url === '/auth/me' || url === '/api/me') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 1, chat_id: '12345', streak_count: 0, total_saves: 0 }),
        });
      }
      if (url === '/api/quizzes/stats') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ streak: 0, total_reviewed: 0 }),
        });
      }
      return Promise.resolve({ ok: false });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('triggers offline toast on offline event and removes it on online event', async () => {
    render(
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    );

    // Wait for the app to finish loading the Dashboard/Auth state and show the archive room mock
    await waitFor(() => {
      expect(screen.getByText(/No signals received yet/i)).toBeInTheDocument();
    });

    // Trigger offline event
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });

    // Verify offline toast is shown
    expect(screen.getByText("You're offline")).toBeInTheDocument();

    // Set up a listener for custom 'online-refetch' event
    const refetchSpy = vi.fn();
    window.addEventListener('online-refetch', refetchSpy);

    // Trigger online event
    act(() => {
      window.dispatchEvent(new Event('online'));
    });

    // Verify toast is removed
    expect(screen.queryByText("You're offline")).not.toBeInTheDocument();
    
    // Verify online-refetch was dispatched
    expect(refetchSpy).toHaveBeenCalled();
    window.removeEventListener('online-refetch', refetchSpy);
  });
});
