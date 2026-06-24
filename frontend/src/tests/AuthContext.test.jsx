import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AuthProvider, useAuth } from '../context/AuthContext';

function TestComponent() {
  const { user, loading, login, logout } = useAuth();
  if (loading) return <div>Loading...</div>;
  if (!user) return <div>Guest <button onClick={() => login({ id: 1, chat_id: '123' })}>Login</button></div>;
  return (
    <div>
      User: {user.chat_id}
      <button onClick={logout}>Logout</button>
    </div>
  );
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('checks session on mount and sets user context if authenticated', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 42, chat_id: '99999' }),
      })
    );

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByText('Loading...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('User: 99999')).toBeInTheDocument();
    });
  });

  it('sets user context to guest if not authenticated', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: false,
      })
    );

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Guest')).toBeInTheDocument();
    });
  });

  it('allows logging in programmatically', async () => {
    vi.spyOn(window, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: false,
      })
    );

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Guest')).toBeInTheDocument();
    });

    act(() => {
      screen.getByText('Login').click();
    });

    expect(screen.getByText('User: 123')).toBeInTheDocument();
  });

  it('clears state, localStorage, and sessionStorage on logout', async () => {
    vi.spyOn(window, 'fetch').mockImplementation((url, options) => {
      if (url === '/auth/me') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 42, chat_id: '99999' }),
        });
      }
      if (url === '/auth/logout' && options?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: 'ok' }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('User: 99999')).toBeInTheDocument();
    });

    // Seed some data in local/session storage to verify clearing
    localStorage.setItem('cached_key', 'some_cached_data');
    sessionStorage.setItem('session_key', 'session_data');

    act(() => {
      screen.getByText('Logout').click();
    });

    await waitFor(() => {
      expect(screen.getByText('Guest')).toBeInTheDocument();
    });

    expect(localStorage.getItem('cached_key')).toBeNull();
    expect(sessionStorage.getItem('session_key')).toBeNull();
  });
});
