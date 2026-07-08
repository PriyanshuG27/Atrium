import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import * as d3 from 'd3';
import MapCanvas from '../canvas/MapCanvas';

// Mock AudioEngine
vi.mock('../utils/AudioEngine', () => ({
  default: {
    playClick: vi.fn(),
    playTransition: vi.fn(),
  }
}));

// Mock d3 library to prevent force simulation loop and canvas dependencies
vi.mock('d3', () => {
  const chain = () => {
    const obj = {};
    const fn = vi.fn(() => obj);
    obj.id = fn;
    obj.distance = fn;
    obj.strength = fn;
    obj.distanceMax = fn;
    obj.radius = fn;
    return fn;
  };

  const mockSim = {
    force: vi.fn().mockReturnThis(),
    velocityDecay: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
    tick: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis(),
    alpha: vi.fn().mockReturnThis(),
    restart: vi.fn().mockReturnThis(),
  };

  const mockZoom = {
    scaleExtent: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis()
  };

  const mockSelection = {
    call: vi.fn().mockReturnThis(),
    on: vi.fn().mockReturnThis()
  };

  return {
    forceSimulation: vi.fn(() => mockSim),
    forceLink: chain(),
    forceManyBody: chain(),
    forceX: chain(),
    forceY: chain(),
    forceCollide: chain(),
    select: vi.fn(() => mockSelection),
    zoom: vi.fn(() => mockZoom),
    drag: vi.fn(() => mockSelection)
  };
});


describe('MapCanvas Component', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('renders correctly with nodes and edges', () => {
    const mockNodes = [
      { id: 1, title: 'Node 1', type: 'item', source_type: 'url' },
      { id: -1, title: 'Hub 1', type: 'hub', source_type: 'hub', daysSince: 0 }
    ];
    const mockEdges = [
      { source: 1, target: -1 }
    ];

    render(
      <MapCanvas 
        nodes={mockNodes} 
        edges={mockEdges} 
        filterType="all"
        showLabels="hover"
      />
    );

    // Canvas element should be in the document
    const canvas = document.querySelector('canvas');
    expect(canvas).toBeInTheDocument();
  });

  it('does not recreate or restart D3 force simulation when searchQuery changes', () => {
    const mockNodes = [
      { id: 1, title: 'Node 1', type: 'item', source_type: 'url' },
      { id: -1, title: 'Hub 1', type: 'hub', source_type: 'hub', daysSince: 0 }
    ];
    const mockEdges = [{ source: 1, target: -1 }];
    const { rerender } = render(
      <MapCanvas 
        nodes={mockNodes} 
        edges={mockEdges} 
        filterType="all"
        searchQuery=""
      />
    );

    // Simulation should be created once on mount
    expect(d3.forceSimulation).toHaveBeenCalledTimes(1);
    const mockSim = d3.forceSimulation.mock.results[0].value;
    expect(mockSim.restart).toHaveBeenCalledTimes(1);

    // Rerender with a search query change
    rerender(
      <MapCanvas 
        nodes={mockNodes} 
        edges={mockEdges} 
        filterType="all"
        searchQuery="Node"
      />
    );

    // Simulation should NOT be recreated and restart should not be called again
    expect(d3.forceSimulation).toHaveBeenCalledTimes(1);
    expect(mockSim.restart).toHaveBeenCalledTimes(1);
  });
});
