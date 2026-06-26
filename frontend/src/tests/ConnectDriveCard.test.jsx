import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import ConnectDriveCard from '../components/ConnectDriveCard';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { ToastProvider } from '../components/Toast';
import axios from 'axios';

vi.mock('axios', () => {
  const mockInstance = {
    create: vi.fn(() => mockInstance),
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() }
    }
  };
  return {
    default: mockInstance,
    ...mockInstance
  };
});

function SeedAuth({ user, children }) {
  const { login } = useAuth();
  React.useEffect(() => {
    if (user) login(user);
  }, [user]);
  return children;
}

describe('ConnectDriveCard Component', () => {
  let openSpy;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    localStorage.clear();
    
    // Spy on window.open
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => ({
      closed: false,
      close: vi.fn()
    }));

    vi.spyOn(window, 'confirm').mockImplementation(() => true);

    // Mock global fetch for auth
    vi.spyOn(window, 'fetch').mockImplementation((url) => {
      if (url === '/auth/me') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 42, chat_id: '99999', drive_connected: false }),
        });
      }
      return Promise.resolve({ ok: false });
    });
  });

  afterEach(() => {
    openSpy.mockRestore();
  });

  it('renders Not Connected state by default', async () => {
    render(
      <ToastProvider>
        <AuthProvider>
          <SeedAuth user={{ id: 42, chat_id: '99999', drive_connected: false }}>
            <ConnectDriveCard />
          </SeedAuth>
        </AuthProvider>
      </ToastProvider>
    );

    expect(screen.getByText('Back up to Google Drive')).toBeInTheDocument();
    expect(screen.getByText('Connect your Drive to export your knowledge as a searchable Google Doc.')).toBeInTheDocument();
    expect(screen.getByText('Connect Google Drive')).toBeInTheDocument();
  });

  it('triggers Google Drive authentication popup and displays loading state', async () => {
    render(
      <ToastProvider>
        <AuthProvider>
          <SeedAuth user={{ id: 42, chat_id: '99999', drive_connected: false }}>
            <ConnectDriveCard />
          </SeedAuth>
        </AuthProvider>
      </ToastProvider>
    );

    const connectButton = screen.getByText('Connect Google Drive');
    fireEvent.click(connectButton);

    expect(openSpy).toHaveBeenCalledWith(
      '/auth/google',
      'recall-drive-auth',
      expect.stringContaining('width=600')
    );

    // Button should show loading
    expect(screen.getByText('Connecting...')).toBeInTheDocument();
    expect(connectButton).toBeDisabled();
  });

  it('renders Connected state when drive_connected is true', async () => {
    const lastSyncTime = new Date('2026-06-26T12:00:00Z').toISOString();
    
    render(
      <ToastProvider>
        <AuthProvider>
          <SeedAuth user={{ id: 42, chat_id: '99999', drive_connected: true, google_last_sync: lastSyncTime }}>
            <ConnectDriveCard />
          </SeedAuth>
        </AuthProvider>
      </ToastProvider>
    );

    expect(screen.getByText('Google Drive connected')).toBeInTheDocument();
    expect(screen.getByText('Sync Now')).toBeInTheDocument();
    expect(screen.getByText('Disconnect')).toBeInTheDocument();
    expect(screen.getByText(/Last synced:/)).toBeInTheDocument();
  });

  it('triggers sync when Sync Now is clicked', async () => {
    axios.post.mockResolvedValue({ status: 202 });
    
    render(
      <ToastProvider>
        <AuthProvider>
          <SeedAuth user={{ id: 42, chat_id: '99999', drive_connected: true }}>
            <ConnectDriveCard />
          </SeedAuth>
        </AuthProvider>
      </ToastProvider>
    );

    const syncButton = screen.getByText('Sync Now');
    fireEvent.click(syncButton);

    await waitFor(() => {
      expect(axios.post).toHaveBeenCalledWith('/api/drive/sync');
      expect(screen.getByText('Google Drive sync completed successfully!')).toBeInTheDocument();
    });
  });

  it('triggers disconnect when Disconnect is clicked', async () => {
    axios.delete.mockResolvedValue({ status: 204 });

    render(
      <ToastProvider>
        <AuthProvider>
          <SeedAuth user={{ id: 42, chat_id: '99999', drive_connected: true }}>
            <ConnectDriveCard />
          </SeedAuth>
        </AuthProvider>
      </ToastProvider>
    );

    const disconnectButton = screen.getByText('Disconnect');
    fireEvent.click(disconnectButton);

    await waitFor(() => {
      expect(axios.delete).toHaveBeenCalledWith('/api/drive');
      expect(screen.getByText('Google Drive disconnected successfully.')).toBeInTheDocument();
    });
  });
});
