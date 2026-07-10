import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiFetch, setUnauthorizedHandler, setToastHandler } from '../api/client';

describe('API Client apiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    setUnauthorizedHandler(null);
    setToastHandler(null);
    window.fetch = vi.fn();
  });

  it('passes through successful responses', async () => {
    const mockRes = { ok: true, status: 200, json: () => Promise.resolve({ ok: true }) };
    window.fetch.mockResolvedValue(mockRes);

    const res = await apiFetch('/api/test');
    expect(res).toBe(mockRes);
  });

  it('handles network error (no response)', async () => {
    const toastSpy = vi.fn();
    setToastHandler(toastSpy);
    window.fetch.mockRejectedValue(new Error('Network Error'));
    
    // Simulate navigator.onLine = true
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });

    await expect(apiFetch('/api/test')).rejects.toThrow('Network Error');
    expect(toastSpy).toHaveBeenCalledWith('Connection lost — check your internet', 'error');
  });

  it('handles 401 unauthorized response', async () => {
    const unauthSpy = vi.fn();
    setUnauthorizedHandler(unauthSpy);
    const mockRes = { ok: false, status: 401 };
    window.fetch.mockResolvedValue(mockRes);

    await apiFetch('/api/test');
    expect(unauthSpy).toHaveBeenCalled();
  });

  it('handles 429 with retry_after', async () => {
    const toastSpy = vi.fn();
    setToastHandler(toastSpy);
    
    const mockClone = {
      json: () => Promise.resolve({ retry_after: 5 })
    };
    const mockRes = {
      ok: false,
      status: 429,
      clone: () => mockClone
    };
    window.fetch.mockResolvedValue(mockRes);

    await apiFetch('/api/test');
    expect(toastSpy).toHaveBeenCalledWith('Too many requests — please retry in 5s.', 'warning');
  });
});
