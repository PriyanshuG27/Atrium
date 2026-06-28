import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import GraphCanvas, { drawNodeShape } from '../canvas/GraphCanvas';

describe('GraphCanvas Component', () => {
  const mockNodes = [
    { id: -1, title: 'Machine Learning', source_type: 'url', created_at: new Date().toISOString(), type: 'hub' },
    { id: 2, title: 'Transformers', source_type: 'pdf', created_at: new Date().toISOString(), type: 'orbital' },
    { id: 3, title: 'Voice Note', source_type: 'voice', created_at: new Date().toISOString(), type: 'orbital' }
  ];

  const mockEdges = [
    { source: -1, target: 2, weight: 0.8 }
  ];

  const mockHubs = [
    { id: 1, label: 'AI Guides', member_ids: [2, 3] }
  ];

  // Helper to render and force a rerender so that useEffect runs and populates the simNodesRef
  const renderCanvas = (activeNodes = mockNodes, edges = mockEdges, hubs = mockHubs, mode = 'nodes', extraProps = {}) => {
    const utils = render(
      <GraphCanvas activeNodes={activeNodes} edges={edges} hubs={hubs} mode={mode} {...extraProps} />
    );
    utils.rerender(
      <GraphCanvas activeNodes={activeNodes} edges={edges} hubs={hubs} mode={mode} {...extraProps} />
    );
    return utils;
  };

  it('renders canvas component and node meshes', () => {
    renderCanvas(mockNodes, mockEdges, mockHubs, 'graph');

    // Canvas should mount
    expect(screen.getByTestId('r3f-canvas')).toBeInTheDocument();

    // Node meshes should mount in the virtual DOM
    expect(screen.getByTestId('node-mesh--1')).toBeInTheDocument();
    expect(screen.getByTestId('node-mesh-2')).toBeInTheDocument();
    expect(screen.getByTestId('node-mesh-3')).toBeInTheDocument();
  });

  it('triggers click handlers when node meshes are clicked', () => {
    const onNodeClick = vi.fn();
    renderCanvas(mockNodes, mockEdges, mockHubs, 'graph', { onNodeClick });

    const mesh = screen.getByTestId('node-mesh--1');
    fireEvent.click(mesh);

    expect(onNodeClick).toHaveBeenCalledWith(expect.objectContaining({ id: -1, title: 'Machine Learning' }));
  });

  it('triggers click handlers using handleNodeClick fallback', () => {
    const handleNodeClick = vi.fn();
    renderCanvas(mockNodes, mockEdges, mockHubs, 'graph', { handleNodeClick });

    const mesh = screen.getByTestId('node-mesh-2');
    fireEvent.click(mesh);

    expect(handleNodeClick).toHaveBeenCalledWith(expect.objectContaining({ id: 2, title: 'Transformers' }));
  });

  it('filters displayed nodes based on mode prop', async () => {
    // Mode: hubs (should display only hub nodes)
    const utils = renderCanvas(mockNodes, mockEdges, mockHubs, 'hubs');

    // Node -1 is a hub, Node 2 & 3 are orbitals
    expect(screen.getByTestId('node-mesh--1')).toBeInTheDocument();
    expect(screen.queryByTestId('node-mesh-2')).not.toBeInTheDocument();
    expect(screen.queryByTestId('node-mesh-3')).not.toBeInTheDocument();

    // Mode: nodes (should display only orbitals)
    utils.rerender(
      <GraphCanvas activeNodes={mockNodes} edges={mockEdges} hubs={mockHubs} mode="nodes" />
    );

    // Yield to the event loop to let React run the useEffect cleanup and mount effects
    await new Promise(resolve => setTimeout(resolve, 0));

    // Force a rerender so it reads the newly populated simNodesRef.current
    utils.rerender(
      <GraphCanvas activeNodes={mockNodes} edges={mockEdges} hubs={mockHubs} mode="nodes" />
    );

    await waitFor(() => {
      expect(screen.queryByTestId('node-mesh--1')).not.toBeInTheDocument();
      expect(screen.getByTestId('node-mesh-2')).toBeInTheDocument();
      expect(screen.getByTestId('node-mesh-3')).toBeInTheDocument();
    });
  });
});

describe('GraphCanvas helper functions', () => {
  it('exports drawNodeShape function for backwards compatibility', () => {
    expect(typeof drawNodeShape).toBe('function');
    const mockCtx = {
      beginPath: vi.fn(),
      arc: vi.fn()
    };
    drawNodeShape(mockCtx, 10, 20, 5);
    expect(mockCtx.beginPath).toHaveBeenCalled();
    expect(mockCtx.arc).toHaveBeenCalledWith(10, 20, 5, 0, Math.PI * 2);
  });
});
