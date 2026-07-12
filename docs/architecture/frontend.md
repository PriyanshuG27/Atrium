---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Frontend Client Architecture

Atrium's frontend is a single-page React application optimized for rendering large-scale 3D constellations at high frame rates.

---

## 1. Structure & Tech Stack
- **Framework**: React 18 + Vite 6
- **Routing**: Pathname-driven routing mapped in `App.jsx`. Path change transitions use popstate snapshots.
- **3D Graphics Layer**: Three.js integrated via React Three Fiber (R3F) and `@react-three/drei`.
- **Animations**: Framer Motion and GSAP (GreenSock) for micro-animations and transition controls.
- **Web Audio**: Tone.js for auditory synthesiser feedback when navigating nodes.

---

## 2. Canvas Room Engines

### A. Constellation Map (`/map`)
- **File**: `frontend/src/canvas/MapCanvas.jsx`
- **Render Engine**: R3F Force-directed node graph. Node positions are calculated in three dimensions using a force-directed model.
- **Clustering**: Nodes are colored based on Louvain community clustering metadata computed in the database.
- **Camera Pilot**: Click citation links in `ChatDrawer.jsx` to trigger a camera fly-to animation. The camera interpolates its position towards the cited coordinate coordinates.

### B. Glass Cylinder Archive (`/archive`)
- **File**: `frontend/src/canvas/ArchiveCylinder.jsx`
- **Render Engine**: Displays saved cards in a 3D cylindrical carousel.
- **Physics**: Uses custom wheel events and dragging coordinates to simulate inertial rotation. Clicking a card rotates the cylinder to center the item and pulls up the detail panel.

---

## 3. Real-Time Updates (WebSockets)
- **File**: `frontend/src/context/SocketContext.jsx`
- **Logic**: Establishes a WebSocket connection to `/api/ws` when authenticated.
- **Streaming**: Listens for `new_node` events pushed by workers. Pushing a new node triggers Tone.js synthesized sound, displays a Toast notice, and dynamically adds the node to the graph without requiring page refreshes.

---

## Evidence & Inspected Files
This document was generated from:
- `frontend\src\App.jsx`
  - Mapped client routing definitions.
- `frontend\src\canvas\ArchiveCylinder.jsx`
  - 3D Cylinder rendering canvas logic.
- `frontend\src\canvas\MapCanvas.jsx`
  - 3D force graph constellation canvas.
- `frontend\src\context\SocketContext.jsx`
  - WS connection setup and message handlers.
- `frontend\package.json`
  - Package dependencies showing React 18, Three.js, and R3F versions.
