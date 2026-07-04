# ADR-006: Three.js / React Three Fiber 3D Observatory Visualizer

* **Status**: Accepted
* **Deciders**: Frontend & UX Team
* **Date**: 2026-07-04

## Context
Visualizing relationships across hundreds of personal knowledge items requires an engaging, immersive spatial interface.

## Decision
We build the frontend interface (**3D Observatory**) as a React 18 SPA using Three.js / React Three Fiber. Nodes are laid out in a force-directed 3D constellation (`/map`) and glass archive cylinder (`/archive`). Interactive RAG citation badges trigger camera auto-flight and aura flare transforms.

## Alternatives Considered
* **2D Canvas (D3.js / Cytoscape)**: Less visual impact and poorer spatial density for large graphs.

## Consequences
* **Positive**: High user engagement (60 FPS 3D rendering); intuitive spatial memory exploration.
* **Negative**: Requires GPU acceleration on client browsers.

## Implementation References
* Map Room: [Map.jsx](../../frontend/src/pages/Map.jsx)
* Map Canvas: [MapCanvas.jsx](../../frontend/src/canvas/MapCanvas.jsx)
