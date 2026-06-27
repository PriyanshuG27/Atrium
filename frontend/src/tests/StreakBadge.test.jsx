import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StreakBadge from '../components/StreakBadge';

describe('StreakBadge Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    
    // Clear custom window.Telegram properties
    window.Telegram = {
      WebApp: {
        initData: '',
        platform: 'unknown'
      }
    };
    // Mock userAgent to represent a standard desktop browser
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  });

  it('renders streak count correctly', () => {
    render(<StreakBadge streakCount={5} onClick={() => {}} />);
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('🔥')).toBeInTheDocument();
    expect(screen.queryByTestId('icon-Flame')).not.toBeInTheDocument();
  });

  it('renders "1" correctly with mock API data', () => {
    render(<StreakBadge streakCount={1} onClick={() => {}} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('🔥')).toBeInTheDocument();
  });

  it('uses Flame icon on mobile in TWA (no emoji)', () => {
    // 1. Mock Telegram WebApp initData to simulate TWA environment
    window.Telegram = {
      WebApp: {
        initData: 'query_id=AA...',
        platform: 'ios'
      }
    };

    // 2. Mock userAgent to simulate mobile device browser
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15');

    render(<StreakBadge streakCount={3} onClick={() => {}} />);

    // Should render the mock Flame icon instead of the 🔥 emoji
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByTestId('flame-icon')).toBeInTheDocument();
    expect(screen.queryByText('🔥')).not.toBeInTheDocument();
  });

  it('triggers onClick handler on click', () => {
    const onClickMock = vi.fn();
    render(<StreakBadge streakCount={10} onClick={onClickMock} />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    expect(onClickMock).toHaveBeenCalledTimes(1);
  });
});
