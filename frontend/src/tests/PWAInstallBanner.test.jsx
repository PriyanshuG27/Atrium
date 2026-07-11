import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import PWAInstallBanner from '../components/PWAInstallBanner';

describe('PWAInstallBanner Component', () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders nothing by default when beforeinstallprompt is not fired', () => {
    const { container } = render(<PWAInstallBanner />);
    expect(container.firstChild).toBeNull();
  });

  it('shows banner when beforeinstallprompt event is dispatched and installs app', async () => {
    render(<PWAInstallBanner />);

    const mockPromptEvent = new Event('beforeinstallprompt');
    mockPromptEvent.prompt = vi.fn();
    mockPromptEvent.userChoice = Promise.resolve({ outcome: 'accepted' });

    act(() => {
      window.dispatchEvent(mockPromptEvent);
    });

    expect(screen.getByText('Install Atrium')).toBeInTheDocument();

    const installBtn = screen.getByRole('button', { name: 'Install' });
    await act(async () => {
      fireEvent.click(installBtn);
    });

    expect(mockPromptEvent.prompt).toHaveBeenCalled();
  });

  it('dismisses banner on close button click and sets sessionStorage', () => {
    render(<PWAInstallBanner />);

    const mockPromptEvent = new Event('beforeinstallprompt');
    mockPromptEvent.prompt = vi.fn();
    mockPromptEvent.userChoice = Promise.resolve({ outcome: 'dismissed' });

    act(() => {
      window.dispatchEvent(mockPromptEvent);
    });

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);

    expect(sessionStorage.getItem('atrium_pwa_banner_dismissed')).toBe('true');
    expect(screen.queryByText('Install Atrium')).not.toBeInTheDocument();
  });

  it('renders custom installation prompt on iOS', () => {
    const originalUserAgent = navigator.userAgent;
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X)',
      configurable: true
    });
    
    Object.defineProperty(window.navigator, 'standalone', {
      value: false,
      configurable: true
    });

    render(<PWAInstallBanner />);

    expect(screen.getByText('Install Atrium')).toBeInTheDocument();
    expect(screen.getByText(/Tap Share/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install' })).not.toBeInTheDocument();

    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);

    expect(sessionStorage.getItem('atrium_pwa_banner_dismissed')).toBe('true');
    expect(screen.queryByText('Install Atrium')).not.toBeInTheDocument();

    Object.defineProperty(navigator, 'userAgent', { value: originalUserAgent, configurable: true });
    Object.defineProperty(window.navigator, 'standalone', { value: undefined, configurable: true });
  });
});
