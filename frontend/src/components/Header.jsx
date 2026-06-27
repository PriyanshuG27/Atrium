import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { MagnifyingGlass, GoogleLogo, CloudX, CloudArrowUp, SignOut, CaretDown, CaretUp, ShareNetwork, List, Gear } from '@phosphor-icons/react';
import ConnectionStatus from './ConnectionStatus';
import ConnectDriveCard from './ConnectDriveCard';
import { useToast } from './Toast';
import axios from '../api/client';
import StreakBadge from './StreakBadge';
import StreakPanel from './StreakPanel';

export default function Header({ onSearch, dueQuizCount, viewMode = 'nodes', onViewModeChange, searchInputRef: externalSearchInputRef, searchQuery = '', onSettingsClick, onStatsClick }) {
  const { user, logout, checkAuth } = useAuth();
  const { addToast } = useToast();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [searchVal, setSearchVal] = useState('');
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const dropdownRef = useRef(null);
  const internalSearchInputRef = useRef(null);
  const searchInputRef = externalSearchInputRef || internalSearchInputRef;
  const isFirstRender = useRef(true);
  const [stats, setStats] = useState(null);
  const [profileData, setProfileData] = useState(null);
  const [streakPanelOpen, setStreakPanelOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      try {
        const res = await fetch('/api/quizzes/stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data);
        }
      } catch (err) {
        console.error('Failed to fetch quiz stats in header:', err);
      }
    };

    const fetchProfile = async () => {
      try {
        const res = await fetch('/api/me');
        if (res.ok) {
          const data = await res.json();
          setProfileData(data);
        }
      } catch (err) {
        console.error('Failed to fetch profile settings in header:', err);
      }
    };

    fetchStats();
    fetchProfile();

    const handleUpdate = () => {
      fetchStats();
      fetchProfile();
    };

    window.addEventListener('quiz-answered', handleUpdate);
    window.addEventListener('online-refetch', handleUpdate);
    window.addEventListener('items-updated', handleUpdate);
    return () => {
      window.removeEventListener('quiz-answered', handleUpdate);
      window.removeEventListener('online-refetch', handleUpdate);
      window.removeEventListener('items-updated', handleUpdate);
    };
  }, [user]);


  // Listen for message events (e.g. from OAuth popup)
  useEffect(() => {
    const handleMessage = (event) => {
      if (event.data === 'google_connected') {
        checkAuth();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [checkAuth]);

  // Synchronize with external search query clearing
  useEffect(() => {
    if (searchQuery === '') {
      setSearchVal('');
      setIsSearchExpanded(false);
    }
  }, [searchQuery]);

  // Close dropdown on clicking outside

  // Close dropdown on clicking outside
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, []);

  // Debounced search logic (300 ms exactly)
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const handler = setTimeout(() => {
      onSearch(searchVal);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchVal, onSearch]);

  const handleSearchChange = (e) => {
    setSearchVal(e.target.value);
  };

  const handleClearSearch = () => {
    setSearchVal('');
    onSearch('');
    setIsSearchExpanded(false);
  };

  // Auto-focus search input when expanded
  useEffect(() => {
    if (isSearchExpanded && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isSearchExpanded]);

  const handleSearchContainerClick = () => {
    if (!isSearchExpanded) {
      setIsSearchExpanded(true);
    }
  };

  const handleSearchBlur = () => {
    if (!searchVal.trim()) {
      setIsSearchExpanded(false);
    }
  };

  const handleConnectDrive = () => {
    const width = 500;
    const height = 600;
    const left = window.screen.width / 2 - width / 2;
    const top = window.screen.height / 2 - height / 2;
    window.open(
      '/auth/google?popup=true',
      'Connect Google Drive',
      `width=${width},height=${height},top=${top},left=${left},scrollbars=yes`
    );
    setDropdownOpen(false);
  };

  const handleDisconnectDrive = async () => {
    try {
      const res = await axios.delete('/api/drive');
      if (res.status === 204) {
        addToast('Google Drive disconnected.', 'success');
        checkAuth();
      } else {
        addToast('Failed to disconnect Google Drive.', 'error');
      }
    } catch (err) {
      console.error('Disconnect Drive failed:', err);
      addToast('Error disconnecting Google Drive.', 'error');
    } finally {
      setDropdownOpen(false);
    }
  };

  const handleSyncDrive = async () => {
    try {
      const res = await axios.post('/api/drive/sync');
      if (res.status === 202 || res.status === 200) {
        addToast('Sync triggered successfully!', 'success');
      } else {
        addToast('Failed to trigger sync.', 'error');
      }
    } catch (err) {
      console.error('Sync failed:', err);
      addToast('Failed to trigger sync.', 'error');
    } finally {
      setDropdownOpen(false);
    }
  };

  return (
    <header className="app-header">
      <div className="header-left">
        <a href="/" className="header-logo gradient-text">
          Recall
        </a>
        {user && (
          <div 
            onClick={handleSearchContainerClick}
            className={`search-bar-container ${isSearchExpanded ? 'expanded' : ''}`}
            data-testid="search-container"
          >
            <span 
              className="search-icon" 
              data-testid="search-icon-trigger"
              role="button"
              tabIndex={0}
              aria-label="Expand search"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleSearchContainerClick();
                }
              }}
            >
              <MagnifyingGlass size={16} aria-hidden="true" />
            </span>
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search your brain..."
              value={searchVal}
              onChange={handleSearchChange}
              onFocus={() => setIsSearchExpanded(true)}
              onBlur={handleSearchBlur}
              className="search-input"
            />
            {searchVal && (
              <button onClick={handleClearSearch} className="clear-search-btn">
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      <div className="header-right">
        {user && (
          <>
            <div className="view-toggle">
              <button 
                className={`toggle-btn ${viewMode === 'nodes' ? 'active' : ''}`}
                onClick={() => onViewModeChange && onViewModeChange('nodes')}
                aria-label="Switch to Nodes View"
              >
                🌌 Nodes
              </button>
              <button 
                className={`toggle-btn ${viewMode === 'hubs' ? 'active' : ''}`}
                onClick={() => onViewModeChange && onViewModeChange('hubs')}
                aria-label="Switch to Hubs View"
              >
                🌐 Hubs
              </button>
              <button 
                className={`toggle-btn ${viewMode === 'feed' ? 'active' : ''}`}
                onClick={() => onViewModeChange && onViewModeChange('feed')}
                aria-label="Switch to Feed View"
              >
                📋 Feed
              </button>
            </div>

            <button className="quiz-badge-btn" onClick={onStatsClick}>
              <span>Quiz</span>
              {dueQuizCount > 0 && (
                <span className="quiz-badge-count">{dueQuizCount}</span>
              )}
            </button>

            {stats && (
              <div 
                className="quiz-stats-card" 
                onClick={onStatsClick}
                title="View detailed quiz performance history"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onStatsClick && onStatsClick();
                  }
                }}
              >
                <span>Due: <span className="stat-val">{stats.due_today}</span></span>
                <span style={{ color: 'rgba(255,255,255,0.12)' }}>|</span>
                <span>Mastered: <span className="stat-val">{stats.mastered}</span></span>
                <span style={{ color: 'rgba(255,255,255,0.12)' }}>|</span>
                <span>Avg ease: <span className="stat-val">{stats.avg_ease_factor.toFixed(1)}</span></span>
              </div>
            )}

            {profileData && (
              <div style={{ position: 'relative' }}>
                <StreakBadge 
                  streakCount={profileData.streak_count} 
                  onClick={() => setStreakPanelOpen(!streakPanelOpen)} 
                />
                <StreakPanel 
                  isOpen={streakPanelOpen}
                  onClose={() => setStreakPanelOpen(false)}
                  streakCount={profileData.streak_count}
                  lastActivityDate={profileData.last_activity_date}
                  last7DaysActivity={profileData.last_7_days_activity}
                />
              </div>
            )}

            <ConnectionStatus />

            <div className="profile-menu-container" ref={dropdownRef}>
              <button
                className="profile-trigger"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                aria-expanded={dropdownOpen}
                aria-haspopup="true"
                aria-label="Profile menu"
              >
                <div className="avatar-circle">
                  {user.chat_id ? user.chat_id.substring(0, 1) : 'U'}
                </div>
                <span>User {user.chat_id}</span>
                <span style={{ display: 'flex', alignItems: 'center', marginLeft: '0.25rem' }}>
                  {dropdownOpen ? <CaretUp size={12} aria-hidden="true" /> : <CaretDown size={12} aria-hidden="true" />}
                </span>
              </button>

              {dropdownOpen && (
                <div className="dropdown-menu glass-panel" role="menu" style={{ width: '280px' }}>
                  <div className="dropdown-header" role="presentation">Drive Integration</div>
                  <div style={{ padding: '0.25rem 0.5rem' }}>
                    <ConnectDriveCard />
                  </div>

                  <div
                    className="dropdown-header"
                    role="presentation"
                    style={{
                      borderTop: '1px solid var(--border-glass)',
                      marginTop: '0.25rem',
                    }}
                  >
                    Account
                  </div>
                  <button
                    className="dropdown-item"
                    onClick={() => {
                      onSettingsClick && onSettingsClick();
                      setDropdownOpen(false);
                    }}
                    role="menuitem"
                  >
                    <Gear size={16} aria-hidden="true" /> Settings
                  </button>
                  <button
                    className="dropdown-item logout-item"
                    onClick={logout}
                    role="menuitem"
                    style={{ fontWeight: '600' }}
                  >
                    <SignOut size={16} aria-hidden="true" /> Logout
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
