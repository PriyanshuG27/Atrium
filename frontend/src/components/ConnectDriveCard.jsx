import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from './Toast';
import axios from '../api/client';
import { GoogleDriveLogo, CloudArrowUp, CheckCircle } from '@phosphor-icons/react';

export default function ConnectDriveCard() {
  const { user, checkAuth } = useAuth();
  const { addToast } = useToast();
  
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  
  const popupRef = useRef(null);
  const pollIntervalRef = useRef(null);

  // Close popup and clear connecting state when drive becomes connected
  useEffect(() => {
    if (user?.drive_connected) {
      if (popupRef.current && !popupRef.current.closed) {
        popupRef.current.close();
      }
      popupRef.current = null;
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setConnecting(false);
    }
  }, [user?.drive_connected]);

  // Clean up timers and popups on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  const handleConnect = () => {
    if (connecting) return;
    setConnecting(true);

    const width = 600;
    const height = 700;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;

    const popup = window.open(
      "/auth/google",
      "recall-drive-auth",
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes`
    );
    
    popupRef.current = popup;

    // Poll to detect if user closed the popup manually
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(() => {
      if (!popup || popup.closed) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        setConnecting(false);
        popupRef.current = null;
      }
    }, 1000);
  };

  const handleSync = async () => {
    if (syncing || disconnecting) return;
    setSyncing(true);
    try {
      const res = await axios.post('/api/drive/sync');
      if (res.status === 200 || res.status === 202) {
        addToast('Google Drive sync completed successfully!', 'success');
        // Refresh profile stats to pull updated last sync timestamp
        await checkAuth();
      } else {
        addToast('Failed to trigger Google Drive sync.', 'error');
      }
    } catch (err) {
      console.error('Sync Drive error:', err);
      addToast('Error during Google Drive sync.', 'error');
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    if (disconnecting || syncing) return;
    if (!confirm('Are you sure you want to disconnect Google Drive? Recall will no longer back up your data.')) return;
    
    setDisconnecting(true);
    try {
      const res = await axios.delete('/api/drive');
      if (res.status === 204 || res.status === 200) {
        addToast('Google Drive disconnected successfully.', 'success');
        await checkAuth();
      } else {
        addToast('Failed to disconnect Google Drive.', 'error');
      }
    } catch (err) {
      console.error('Disconnect Drive error:', err);
      addToast('Error disconnecting Google Drive.', 'error');
    } finally {
      setDisconnecting(false);
    }
  };

  const formatDate = (isoString) => {
    if (!isoString) return 'Never';
    try {
      const d = new Date(isoString);
      return d.toLocaleString();
    } catch (e) {
      return isoString;
    }
  };

  const isConnected = !!user?.drive_connected;

  return (
    <div 
      className="glass-card connect-drive-card" 
      style={{
        padding: '1.25rem',
        borderRadius: '12px',
        border: '1px solid var(--border-glass)',
        background: 'rgba(255, 255, 255, 0.02)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        marginTop: '0.5rem'
      }}
    >
      {!isConnected ? (
        // State A: Google Drive Not Connected
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <div style={{ color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CloudArrowUp size={32} aria-hidden="true" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text)' }}>
              Back up to Google Drive
            </h4>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--color-text-muted)', lineHeight: 1.4 }}>
              Connect your Drive to export your knowledge as a searchable Google Doc.
            </p>
            <button
              onClick={handleConnect}
              disabled={connecting}
              className="btn btn-primary"
              style={{
                marginTop: '0.5rem',
                alignSelf: 'flex-start',
                fontSize: '0.8125rem',
                minHeight: '36px',
                padding: '0.25rem 1rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              {connecting ? (
                <>
                  <span className="spinner" style={{ display: 'inline-block', width: '12px', height: '12px', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                  Connecting...
                </>
              ) : (
                'Connect Google Drive'
              )}
            </button>
          </div>
        </div>
      ) : (
        // State B: Google Drive Connected
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <div style={{ color: '#00D4AA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <CheckCircle size={32} aria-hidden="true" />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
            <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 600, color: 'var(--color-text)' }}>
              Google Drive connected
            </h4>
            <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              Last synced: {formatDate(user?.google_last_sync)}
            </p>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button
                onClick={handleSync}
                disabled={syncing || disconnecting}
                className="btn btn-primary"
                style={{
                  fontSize: '0.75rem',
                  minHeight: '32px',
                  padding: '0.25rem 0.75rem'
                }}
              >
                {syncing ? 'Syncing...' : 'Sync Now'}
              </button>
              <button
                onClick={handleDisconnect}
                disabled={disconnecting || syncing}
                className="btn btn-secondary"
                style={{
                  fontSize: '0.75rem',
                  minHeight: '32px',
                  padding: '0.25rem 0.75rem'
                }}
              >
                {disconnecting ? 'Disconnecting...' : 'Disconnect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
