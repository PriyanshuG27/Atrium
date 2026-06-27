import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import QuizStatsPanel from '../components/QuizStatsPanel';
import { ToastProvider } from '../components/Toast';

describe('QuizStatsPanel Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();

    const mockContext = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      createLinearGradient: vi.fn(() => ({
        addColorStop: vi.fn()
      })),
      createRadialGradient: vi.fn(() => ({
        addColorStop: vi.fn()
      })),
      fillText: vi.fn(),
      setLineDash: vi.fn(),
      clip: vi.fn(),
      roundRect: vi.fn()
    };

    HTMLCanvasElement.prototype.getContext = vi.fn().mockImplementation((type) => {
      if (type === '2d') return mockContext;
      return null;
    });
  });

  const mockStats = {
    total: 10,
    due_today: 3,
    answered_all_time: 25,
    avg_ease_factor: 2.75,
    mastered: 4,
    mastered_definition: "ease_factor >= 2.5 AND interval_days >= 7",
    last_7_days: [
      { day: 'Mon', date: '2026-06-22', count: 2 },
      { day: 'Tue', date: '2026-06-23', count: 0 },
      { day: 'Wed', date: '2026-06-24', count: 5 },
      { day: 'Thu', date: '2026-06-25', count: 1 },
      { day: 'Fri', date: '2026-06-26', count: 0 },
      { day: 'Sat', date: '2026-06-27', count: 3 },
      { day: 'Sun', date: '2026-06-28', count: 4 }
    ]
  };

  it('renders nothing when isOpen is false', () => {
    render(
      <ToastProvider>
        <QuizStatsPanel isOpen={false} onClose={() => {}} />
      </ToastProvider>
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('renders quiz stats data and canvas chart when open', async () => {
    const fetchSpy = vi.spyOn(window, 'fetch').mockImplementation((url) => {
      if (url === '/api/quizzes/stats') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockStats),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(
      <ToastProvider>
        <QuizStatsPanel isOpen={true} onClose={() => {}} />
      </ToastProvider>
    );

    // Verify loading state/message or initial render
    expect(screen.getByText('Analyzing performance history...')).toBeInTheDocument();

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/quizzes/stats');
      expect(screen.getByText('Quiz Performance')).toBeInTheDocument();
      
      // Core metrics grid
      expect(screen.getByText('3')).toBeInTheDocument(); // due_today
      expect(screen.getByText('4')).toBeInTheDocument(); // mastered

      // Performance Summary
      expect(screen.getByText('25')).toBeInTheDocument(); // answered_all_time
      expect(screen.getByText('2.75')).toBeInTheDocument(); // avg_ease_factor
      expect(screen.getByText('10')).toBeInTheDocument(); // total
      expect(screen.getByText('ease_factor >= 2.5 AND interval_days >= 7')).toBeInTheDocument(); // definition
    });
  });

  it('triggers onClose when close button is clicked', async () => {
    const onCloseMock = vi.fn();
    vi.spyOn(window, 'fetch').mockImplementation((url) => {
      if (url === '/api/quizzes/stats') {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve(mockStats),
        });
      }
      return Promise.resolve({ ok: false });
    });

    render(
      <ToastProvider>
        <QuizStatsPanel isOpen={true} onClose={onCloseMock} />
      </ToastProvider>
    );

    await waitFor(() => {
      expect(screen.getByText('Quiz Performance')).toBeInTheDocument();
    });

    const closeBtn = screen.getByRole('button', { name: /Close statistics panel/i });
    fireEvent.click(closeBtn);
    expect(onCloseMock).toHaveBeenCalled();
  });
});
