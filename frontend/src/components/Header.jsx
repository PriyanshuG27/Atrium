import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Header() {
  const { user, logout } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown on clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleConnectDrive = () => {
    const width = 500;
    const height = 600;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    window.open(
      '/auth/google',
      'Connect Google Drive',
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes`
    );
    setDropdownOpen(false);
  };

  const handleDisconnectDrive = async () => {
    try {
      const res = await fetch('/api/drive', { method: 'DELETE' });
      if (res.status === 204) {
        alert('Google Drive disconnected.');
      } else {
        alert('Failed to disconnect Google Drive.');
      }
    } catch (err) {
      console.error('Disconnect Drive failed:', err);
      alert('Error disconnecting Google Drive.');
    } finally {
      setDropdownOpen(false);
    }
  };

  return (
    <header className="app-header">
      <a href="/" className="header-logo gradient-text">
        Recall
      </a>

      {user && (
        <div className="profile-menu-container" ref={dropdownRef}>
          <button 
            className="profile-trigger" 
            onClick={() => setDropdownOpen(!dropdownOpen)}
          >
            <div className="avatar-circle">
              {user.chat_id ? user.chat_id.substring(0, 1) : 'U'}
            </div>
            <span>User {user.chat_id}</span>
            <span style={{ fontSize: '0.7rem', transform: dropdownOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
              ▼
            </span>
          </button>

          {dropdownOpen && (
            <div className="dropdown-menu glass-panel">
              <div className="dropdown-header">Drive Integration</div>
              <button className="dropdown-item" onClick={handleConnectDrive}>
                🌐 Connect Google Drive
              </button>
              <button className="dropdown-item" onClick={handleDisconnectDrive}>
                🚫 Disconnect Drive
              </button>
              
              <div className="dropdown-header" style={{ borderTop: '1px solid var(--border-color)', marginTop: '0.25rem' }}>
                Account
              </div>
              <button 
                className="dropdown-item logout-item" 
                onClick={logout}
                style={{ fontWeight: '600' }}
              >
                🚪 Logout
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
}
