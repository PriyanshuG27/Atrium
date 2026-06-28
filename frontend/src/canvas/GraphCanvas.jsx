import React, { useRef, useEffect, useMemo, useCallback } from 'react';
import { Canvas } from '@react-three/fiber';
import * as d3 from 'd3';
import Graph3DScene from './Graph3DScene';

/* ============================================================
   GraphCanvas — THE MIND MAP (WebGL edition)

   Architecture:
   • D3 force simulation runs outside the Canvas, mutating
     simNodesRef.current in-place (positions update live).
   • R3F Canvas renders Graph3DScene which reads simNodesRef
     every animation frame — zero re-renders for physics.
   • Keeps the same props interface as the old canvas2D version
     so Dashboard.jsx needs minimal changes.

   Backward-compat export:
   • drawNodeShape is kept for any tests that still import it.
   ============================================================ */

// Kept for backward compat with existing unit tests
export function drawNodeShape(ctx, x, y, radius) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
}

function getHubColor() { return '#A89880'; }
function getNodeRadius(node, hubs = []) {
  if (node.type === 'hub' || node.id < 0) {
    const hubId = node.id < 0 ? -node.id : node.id;
    const hub = hubs.find(h => h.id === hubId);
    const mc = hub?.member_ids?.length || 0;
    return Math.max(14, 14 + Math.min(12, mc) * 0.7);
  }
  return 5.5;
}

// D3 layout: 1200×900 virtual canvas space (same as before)
const LAYOUT_W = 1200;
const LAYOUT_H = 900;

export default function GraphCanvas({
  activeNodes = [],
  edges = [],
  matchingNodeIds = null,
  pan = { x: 0, y: 0 },    // kept for API compat, ignored (camera does pan)
  zoom = 1,                  // kept for API compat, ignored (camera does zoom)
  handleNodeClick,
  onNodeClick,
  selectedNodeId = null,
  mode = 'nodes',
  hubs = [],
}) {
  const clickHandler = onNodeClick || handleNodeClick;

  // ── D3 simulation runs entirely in refs ────────────────────────────────────
  const simNodesRef  = useRef([]);
  const simulationRef = useRef(null);

  // ── Camera fly-to target (set on node select) ─────────────────────────────
  const flyTargetRef = useRef(null);

  // ── Filter nodes & edges by mode ──────────────────────────────────────────
  const { displayNodes, displayEdges } = useMemo(() => {
    const isHub  = n => n.type === 'hub' || n.id < 0;
    const isItem = n => n.id > 0;

    let dNodes, dEdges;
    if (mode === 'graph') {
      dNodes = activeNodes;
      dEdges = edges;
    } else if (mode === 'hubs') {
      dNodes = activeNodes.filter(isHub);
      // Hub-to-hub edges
      const itemToHub = new Map();
      hubs.forEach(h => {
        const hubNodeId = -h.id;
        h.member_ids?.forEach(mid => itemToHub.set(mid, hubNodeId));
      });
      const hubEdgeMap = new Map();
      edges.forEach(e => {
        const s = typeof e.source === 'object' ? e.source.id : e.source;
        const t = typeof e.target === 'object' ? e.target.id : e.target;
        if (s > 0 && t > 0) {
          const hs = itemToHub.get(s), ht = itemToHub.get(t);
          if (hs && ht && hs !== ht) {
            const k = `${Math.min(hs, ht)}_${Math.max(hs, ht)}`;
            if (!hubEdgeMap.has(k)) hubEdgeMap.set(k, { source: hs, target: ht, weight: 1 });
          }
        }
      });
      dEdges = Array.from(hubEdgeMap.values());
    } else {
      dNodes = activeNodes.filter(isItem);
      dEdges = edges.filter(e => {
        const s = typeof e.source === 'object' ? e.source.id : e.source;
        const t = typeof e.target === 'object' ? e.target.id : e.target;
        return s > 0 && t > 0;
      });
    }
    return { displayNodes: dNodes, displayEdges: dEdges };
  }, [activeNodes, edges, hubs, mode]);

  // ── Build / restart D3 simulation when nodes change ───────────────────────
  useEffect(() => {
    if (!displayNodes || displayNodes.length === 0) {
      if (simulationRef.current) {
        simulationRef.current.stop();
        simulationRef.current = null;
      }
      simNodesRef.current = [];
      return;
    }

    // Clone nodes so D3 can mutate x/y/vx/vy without touching React state
    const simNodes = displayNodes.map(n => ({
      ...n,
      // Seed position from layoutNodes (Dashboard pre-computes x/y)
      x:  n.x ?? (LAYOUT_W / 2 + (Math.random() - 0.5) * 100),
      y:  n.y ?? (LAYOUT_H / 2 + (Math.random() - 0.5) * 100),
      vx: n.vx ?? 0,
      vy: n.vy ?? 0,
    }));

    const simLinks = displayEdges
      .map(e => ({
        source: typeof e.source === 'object' ? e.source.id : e.source,
        target: typeof e.target === 'object' ? e.target.id : e.target,
        weight: e.weight ?? 0.5,
      }))
      .filter(e => {
        const hasS = simNodes.some(n => n.id === e.source);
        const hasT = simNodes.some(n => n.id === e.target);
        return hasS && hasT;
      });

    // Create hub → orbital force attractors
    const memberHubMap = {};
    hubs.forEach(hub => {
      const hubNodeId = -hub.id;
      hub.member_ids?.forEach(mid => { memberHubMap[mid] = hubNodeId; });
    });

    if (simulationRef.current) simulationRef.current.stop();

    const sim = d3.forceSimulation(simNodes)
      .force('link', d3.forceLink(simLinks)
        .id(d => d.id)
        .distance(d => 160 + (1 - (d.weight || 0.5)) * 80)   // wider: was 80 + 40
        .strength(0.25))
      .force('charge', d3.forceManyBody().strength(-360).distanceMax(600))  // more repulsion
      .force('collide', d3.forceCollide()
        .radius(n => getNodeRadius(n, hubs) + 24)   // bigger collision bubble
        .strength(0.85))
      // Pull each orbital toward its hub
      .force('hubX', d3.forceX(n => {
        const hubId = memberHubMap[n.id];
        if (!hubId) return n.x;
        const hubNode = simNodes.find(sn => sn.id === hubId);
        return hubNode ? hubNode.x : n.x;
      }).strength(n => memberHubMap[n.id] ? 0.045 : 0))
      .force('hubY', d3.forceY(n => {
        const hubId = memberHubMap[n.id];
        if (!hubId) return n.y;
        const hubNode = simNodes.find(sn => sn.id === hubId);
        return hubNode ? hubNode.y : n.y;
      }).strength(n => memberHubMap[n.id] ? 0.045 : 0))
      .alpha(0.8)
      .alphaDecay(0.012)
      .velocityDecay(0.5);

    // Pin hub nodes at their seeded positions
    simNodes.forEach(n => {
      if (n.type === 'hub' || n.id < 0) {
        n.fx = n.x;
        n.fy = n.y;
      }
    });

    // Publish positions for R3F to read each frame
    sim.on('tick', () => {
      simNodesRef.current = [...simNodes];
    });

    simulationRef.current = sim;
    simNodesRef.current = [...simNodes];

    return () => { sim.stop(); };
  }, [displayNodes.length, displayEdges.length, hubs]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Camera fly-to on node select ──────────────────────────────────────────
  useEffect(() => {
    if (selectedNodeId === null) {
      flyTargetRef.current = null;
      return;
    }
    const node = simNodesRef.current.find(n => n.id === selectedNodeId);
    if (node) {
      flyTargetRef.current = {
        x: node.x - 600,
        y: -(node.y - 450),
        z: 200,   // closer than default 700
      };
    }
  }, [selectedNodeId]);

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        background: '#0C0B0F',
        position: 'absolute',
        inset: 0,
      }}
    >
      <Canvas
        camera={{ position: [0, 0, 950], fov: 55, near: 1, far: 6000 }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          outputColorSpace: 'srgb',
        }}
        dpr={[1, Math.min(window.devicePixelRatio, 2)]}
        style={{ background: '#0C0B0F' }}
      >
        <Graph3DScene
          simNodesRef={simNodesRef}
          edges={displayEdges}
          hubs={hubs}
          matchingNodeIds={matchingNodeIds}
          selectedNodeId={selectedNodeId}
          onNodeClick={clickHandler}
          flyTargetRef={flyTargetRef}
          mode={mode}
        />
      </Canvas>
    </div>
  );
}
