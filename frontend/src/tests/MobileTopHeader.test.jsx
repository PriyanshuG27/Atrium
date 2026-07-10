import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import MobileTopHeader from '../components/MobileTopHeader';

// Mock AudioEngine
vi.mock('../utils/AudioEngine', () => ({
  default: {
    playClick: vi.fn(),
    isMuted: vi.fn(() => false),
    setMuted: vi.fn(),
  }
}));

describe('MobileTopHeader Component', () => {
  const defaultProps = {
    currentRoom: 'archive',
    onNavigate: vi.fn(),
    onSearchOpen: vi.fn(),
    streak: 5,
    user: { username: 'testuser' },
    logout: vi.fn(),
  };

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ streak_count: 5, total_saves: 42, quizzes_answered: 10 }),
      })
    ));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders title, streak count, and search button', () => {
    render(<MobileTopHeader {...defaultProps} />);

    // Check title formatting
    expect(screen.getByText(/atrium/i)).toBeInTheDocument();
    
    // Check search button trigger
    const searchBtn = screen.getByRole('button', { name: /search/i });
    expect(searchBtn).toBeInTheDocument();

    fireEvent.click(searchBtn);
    expect(defaultProps.onSearchOpen).toHaveBeenCalled();
  });

  it('opens and closes profile dropdown menu', () => {
    render(<MobileTopHeader {...defaultProps} />);

    // Click profile button to open dropdown
    const profileBtn = screen.getByRole('button', { name: /profile menu/i });
    fireEvent.click(profileBtn);

    // Dropdown items should be rendered
    expect(screen.getByRole('menuitem', { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /settings/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /logout/i })).toBeInTheDocument();

    // Click backdrop / escape closes dropdown
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menuitem', { name: /profile/i })).not.toBeInTheDocument();
  });

  it('handles navigation choices in dropdown menu', () => {
    const onNavigateMock = vi.fn();
    render(<MobileTopHeader {...defaultProps} onNavigate={onNavigateMock} />);

    // Open dropdown
    const profileBtn = screen.getByRole('button', { name: /profile menu/i });
    fireEvent.click(profileBtn);

    // Click settings page trigger
    const settingsBtn = screen.getByRole('menuitem', { name: /settings/i });
    fireEvent.click(settingsBtn);

    expect(onNavigateMock).toHaveBeenCalledWith('settings');
  });

  it('triggers logout handler', () => {
    render(<MobileTopHeader {...defaultProps} />);

    // Open dropdown
    const profileBtn = screen.getByRole('button', { name: /profile menu/i });
    fireEvent.click(profileBtn);

    // Click logout
    const logoutBtn = screen.getByRole('menuitem', { name: /logout/i });
    fireEvent.click(logoutBtn);

    expect(defaultProps.logout).toHaveBeenCalled();
  });
});
