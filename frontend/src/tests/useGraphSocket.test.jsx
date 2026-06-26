import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.unmock('../hooks/useGraphSocket');
import { useGraphSocket } from '../hooks/useGraphSocket';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/Toast';

// Mock useAuth
vi.mock('../context/AuthContext', () => ({
  useAuth: vi.fn(() => ({
    checkAuth: vi.fn(),
  })),
}));

// Mock useToast
vi.mock('../components/Toast', () => ({
  useToast: vi.fn(() => ({
    addToast: vi.fn(),
  })),
}));

// Mock legacy useGraphSocket context hook
vi.mock('../context/SocketContext', () => ({
  useGraphSocket: vi.fn(() => ({
    connectionStatus: 'connected_from_context',
    lastSyncTime: 999999,
  })),
}));

describe('useGraphSocket hook', () => {
  let wsMockInstances = [];
  let originalWindowWebSocket;
  let originalGlobalWebSocket;
  const mockToken = 'mock-jwt-token';
  const mockInitialGraph = {
    nodes: [{ id: '1', title: 'Node 1', source_type: 'text' }],
    edges: [{ source: '1', target: '2', weight: 0.5 }],
    hubs: [{ id: '1', label: 'Hub 1', member_ids: [1, 2] }],
  };

  beforeEach(() => {
    vi.useFakeTimers();
    originalWindowWebSocket = window.WebSocket;
    originalGlobalWebSocket = global.WebSocket;
    wsMockInstances = [];

    const MockWS = class MockWebSocket {
      static CONNECTING = 0;
      static OPEN = 1;
      static CLOSING = 2;
      static CLOSED = 3;
      constructor(url) {
        this.url = url;
        this.readyState = 0; // CONNECTING
        wsMockInstances.push(this);
      }
      send = vi.fn();
      close = vi.fn();
    };

    window.WebSocket = MockWS;
    global.WebSocket = MockWS;
  });

  afterEach(() => {
    window.WebSocket = originalWindowWebSocket;
    global.WebSocket = originalGlobalWebSocket;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('falls back to legacy context values when no token is provided', () => {
    const { result } = renderHook(() => useGraphSocket(null));
    expect(result.current.connectionStatus).toBe('connected_from_context');
    expect(result.current.lastSyncTime).toBe(999999);
  });

  it('establishes connection on mount with correct token and initial graph data', () => {
    const { result } = renderHook(() => useGraphSocket(mockToken, mockInitialGraph));

    expect(wsMockInstances.length).toBe(1);
    expect(wsMockInstances[0].url).toContain(`/ws/${mockToken}`);
    expect(result.current.nodes).toEqual(mockInitialGraph.nodes);
    expect(result.current.edges).toEqual(mockInitialGraph.edges);
    expect(result.current.hubs).toEqual(mockInitialGraph.hubs);
    expect(result.current.connectionStatus).toBe('connecting');
  });

  it('updates connectionStatus on open and close', () => {
    const { result } = renderHook(() => useGraphSocket(mockToken, mockInitialGraph));
    const ws = wsMockInstances[0];

    act(() => {
      ws.readyState = 1; // OPEN
      if (ws.onopen) ws.onopen();
    });
    expect(result.current.connectionStatus).toBe('connected');

    act(() => {
      ws.readyState = 3; // CLOSED
      if (ws.onclose) ws.onclose({ code: 1000 }); // Normal closure (no reconnect)
    });
    expect(result.current.connectionStatus).toBe('disconnected');
  });

  it('handles ping events by sending pongs', () => {
    renderHook(() => useGraphSocket(mockToken, mockInitialGraph));
    const ws = wsMockInstances[0];

    act(() => {
      ws.readyState = 1; // OPEN
      if (ws.onopen) ws.onopen();
    });

    act(() => {
      if (ws.onmessage) {
        ws.onmessage({ data: JSON.stringify({ type: 'ping' }) });
      }
    });

    expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'pong' }));
  });

  it('adds new_node to state as pulse and clears pulse styling after 5 minutes', () => {
    const { result } = renderHook(() => useGraphSocket(mockToken, mockInitialGraph));
    const ws = wsMockInstances[0];

    act(() => {
      ws.readyState = 1;
      if (ws.onopen) ws.onopen();
    });

    const newNode = { id: '99', title: 'New Node', source_type: 'url' };
    act(() => {
      if (ws.onmessage) {
        ws.onmessage({ data: JSON.stringify({ type: 'new_node', node: newNode }) });
      }
    });

    // Node should be appended to state and marked as 'pulse'
    expect(result.current.nodes.length).toBe(2);
    const addedNode = result.current.nodes.find((n) => n.id === '99');
    expect(addedNode).toBeDefined();
    expect(addedNode.type).toBe('pulse');

    // Advance time by 4 minutes -> still pulse
    act(() => {
      vi.advanceTimersByTime(4 * 60 * 1000);
    });
    expect(result.current.nodes.find((n) => n.id === '99').type).toBe('pulse');

    // Advance past 5 minutes -> pulse styling removed
    act(() => {
      vi.advanceTimersByTime(1.1 * 60 * 1000);
    });
    expect(result.current.nodes.find((n) => n.id === '99').type).toBeUndefined();
  });

  it('handles hubs_updated events by replacing hubs and adding updated_at', () => {
    const { result } = renderHook(() => useGraphSocket(mockToken, mockInitialGraph));
    const ws = wsMockInstances[0];

    act(() => {
      ws.readyState = 1;
      if (ws.onopen) ws.onopen();
    });

    const updatedHubs = [{ id: '9', label: 'Updated Hub', member_ids: [1, 2, 3] }];
    act(() => {
      if (ws.onmessage) {
        ws.onmessage({ data: JSON.stringify({ type: 'hubs_updated', hubs: updatedHubs }) });
      }
    });

    expect(result.current.hubs.length).toBe(1);
    expect(result.current.hubs[0].label).toBe('Updated Hub');
    expect(result.current.hubs[0].updated_at).toBeDefined();
  });

  it('handles google_connected events by calling checkAuth', () => {
    const checkAuthMock = vi.fn();
    vi.mocked(useAuth).mockReturnValue({ checkAuth: checkAuthMock });

    renderHook(() => useGraphSocket(mockToken, mockInitialGraph));
    const ws = wsMockInstances[0];

    act(() => {
      ws.readyState = 1;
      if (ws.onopen) ws.onopen();
    });

    act(() => {
      if (ws.onmessage) {
        ws.onmessage({ data: JSON.stringify({ type: 'google_connected' }) });
      }
    });

    expect(checkAuthMock).toHaveBeenCalled();
  });

  it('reconnects with exponential backoff up to 5 times', () => {
    const addToastMock = vi.fn();
    vi.mocked(useToast).mockReturnValue({ addToast: addToastMock });

    const { result } = renderHook(() => useGraphSocket(mockToken, mockInitialGraph));

    expect(wsMockInstances.length).toBe(1);
    const ws1 = wsMockInstances[0];

    // Trigger open and close to start reconnects
    act(() => {
      ws1.readyState = 1;
      if (ws1.onopen) ws1.onopen();
    });
    act(() => {
      ws1.readyState = 3;
      if (ws1.onclose) ws1.onclose({ code: 1006 }); // Abnormal closure
    });

    // Reconnect 1 (1s backoff)
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(wsMockInstances.length).toBe(2);
    const ws2 = wsMockInstances[1];

    // Reconnect 2 (2s backoff)
    act(() => {
      ws2.readyState = 3;
      if (ws2.onclose) ws2.onclose({ code: 1006 });
    });
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(wsMockInstances.length).toBe(3);
    const ws3 = wsMockInstances[2];

    // Reconnect 3 (4s backoff)
    act(() => {
      ws3.readyState = 3;
      if (ws3.onclose) ws3.onclose({ code: 1006 });
    });
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(wsMockInstances.length).toBe(4);
    const ws4 = wsMockInstances[3];

    // Reconnect 4 (8s backoff)
    act(() => {
      ws4.readyState = 3;
      if (ws4.onclose) ws4.onclose({ code: 1006 });
    });
    act(() => {
      vi.advanceTimersByTime(8000);
    });
    expect(wsMockInstances.length).toBe(5);
    const ws5 = wsMockInstances[4];

    // Reconnect 5 (16s backoff)
    act(() => {
      ws5.readyState = 3;
      if (ws5.onclose) ws5.onclose({ code: 1006 });
    });
    act(() => {
      vi.advanceTimersByTime(16000);
    });
    expect(wsMockInstances.length).toBe(6);
    const ws6 = wsMockInstances[5];

    // Close the 5th attempt -> transition to failed and toast
    act(() => {
      ws6.readyState = 3;
      if (ws6.onclose) ws6.onclose({ code: 1006 });
    });

    expect(result.current.connectionStatus).toBe('failed');
    expect(addToastMock).toHaveBeenCalledWith(
      'Real-time updates unavailable. Refresh to retry.',
      'error'
    );
  });

  it('closes connection and clears timers on unmount', () => {
    const { unmount } = renderHook(() => useGraphSocket(mockToken, mockInitialGraph));
    const ws = wsMockInstances[0];

    unmount();
    expect(ws.close).toHaveBeenCalledWith(1000);
  });
});
