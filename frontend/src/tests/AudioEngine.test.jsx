import { describe, it, expect, vi, beforeEach } from 'vitest';
import AudioEngine from '../utils/AudioEngine';

describe('AudioEngine Utility', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('defaults to muted if localStorage value is not set', () => {
    expect(AudioEngine.isMuted()).toBe(true);
  });

  it('updates muting state in localStorage and dispatches window event', () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    
    AudioEngine.setMuted(false);
    expect(AudioEngine.isMuted()).toBe(false);
    expect(localStorage.getItem('recall_muted')).toBe('false');
    
    // Should dispatch custom recall-mute-toggle event
    expect(dispatchSpy).toHaveBeenCalled();
    const event = dispatchSpy.mock.calls[0][0];
    expect(event.type).toBe('recall-mute-toggle');
    expect(event.detail).toBe(false);
  });

  it('safely handles click play when muted', () => {
    // Should not throw or initialize AudioContext when muted
    expect(() => AudioEngine.playClick()).not.toThrow();
  });
});
