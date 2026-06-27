import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import StreakPanel from '../components/StreakPanel';

describe('StreakPanel Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  const last7DaysActivityMock = [true, false, true, true, false, true, false];
  const lastActivityDateMock = new Date(Date.now() - 3600000 * 2).toISOString(); // 2 hours ago

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <StreakPanel 
        isOpen={false} 
        onClose={() => {}} 
        streakCount={5} 
        lastActivityDate={lastActivityDateMock}
        last7DaysActivity={last7DaysActivityMock}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders when open showing streak count, relative time, and calendar grid', () => {
    render(
      <StreakPanel 
        isOpen={true} 
        onClose={() => {}} 
        streakCount={5} 
        lastActivityDate={lastActivityDateMock}
        last7DaysActivity={last7DaysActivityMock}
      />
    );

    expect(screen.getByText('5 Day Streak!')).toBeInTheDocument();
    expect(screen.getByText('Last saved: 2h ago')).toBeInTheDocument();
    expect(screen.getByText('Last 7 Days')).toBeInTheDocument();

    // Verify calendar grid rendering
    // There should be 7 day circles rendered
    for (let i = 0; i < 7; i++) {
      expect(screen.getByTestId(`streak-day-${i}`)).toBeInTheDocument();
    }
  });

  it('calls onClose when close button is clicked', () => {
    const onCloseMock = vi.fn();
    render(
      <StreakPanel 
        isOpen={true} 
        onClose={onCloseMock} 
        streakCount={5} 
        lastActivityDate={lastActivityDateMock}
        last7DaysActivity={last7DaysActivityMock}
      />
    );

    const closeBtn = screen.getByRole('button', { name: /Close streak panel/i });
    fireEvent.click(closeBtn);
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', () => {
    const onCloseMock = vi.fn();
    render(
      <StreakPanel 
        isOpen={true} 
        onClose={onCloseMock} 
        streakCount={5} 
        lastActivityDate={lastActivityDateMock}
        last7DaysActivity={last7DaysActivityMock}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape', code: 'Escape' });
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when clicking outside the panel', () => {
    const onCloseMock = vi.fn();
    render(
      <div>
        <div data-testid="outside-element">Outside</div>
        <StreakPanel 
          isOpen={true} 
          onClose={onCloseMock} 
          streakCount={5} 
          lastActivityDate={lastActivityDateMock}
          last7DaysActivity={last7DaysActivityMock}
        />
      </div>
    );

    fireEvent.mouseDown(screen.getByTestId('outside-element'));
    expect(onCloseMock).toHaveBeenCalledTimes(1);
  });
});
