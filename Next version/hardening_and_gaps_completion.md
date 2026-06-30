# Recall Production Hardening & Roadmap Gaps Completion Report

This document outlines the successful implementation, testing, and delivery of all Phase 1 Production Hardening tasks and Phase 3–6 Roadmap Specification Gaps in the Recall codebase.

---

## 1. Production Hardening (Phase 1 Baseline Consolidation)

### Database pool connection & safe migration checks
- **Schema Alignment**: Added `last_active_at` (TIMESTAMP) and `streak_days` (INTEGER) to the `semantic_hubs` table inside [schema.sql](file:///d:/Recall/backend/db/schema.sql). Implemented automatic schema alteration statements during database pool connection startup check in [connection.py](file:///d:/Recall/backend/db/connection.py).
- **Orphaned References**: Configured `delete_item` inside [api.py](file:///d:/Recall/backend/routes/api.py) to delete all references from `reminders` and `insight_candidates` inside a single transaction block on deletion.

### Pairwise Vectorization & Concurrency Controls
- **NumPy Matrix Multiplication**: Vectorized pairwise similarity checks using matrix multiplication (`np.dot`) and upper-triangle coordinates (`np.triu_indices`) inside [scheduler.py](file:///d:/Recall/backend/scheduler/scheduler.py) to prevent CPU starvation.
- **Concurrency Cap**: AI tasks are restricted to a maximum concurrency of 3 using `asyncio.Semaphore(3)`.

### Durability & Recovery (Safe Queue Transaction Pattern)
- **Transactional Polling**: Configured workers to poll tasks atomically from `recall:tasks` using `BRPOPLPUSH` into a processing queue `recall:processing` in [redis_client.py](file:///d:/Recall/backend/services/redis_client.py) and [worker.py](file:///d:/Recall/backend/worker.py).
- **Startup Recovery**: On boot, any leftover tasks inside the backup queue are automatically re-enqueued to prevent task loss during worker crashes.
- **Execution Cleanup**: Enforced task cleanup via `LREM` inside a `finally` block in `process_task`.

### Multi-Server Scale-Out WebSockets
- **Distributed Registry**: Replaced local in-memory dictionaries with a distributed Redis user connection set (`ws:connections:user:{user_id}`) and heartbeats inside [websocket.py](file:///d:/Recall/backend/routes/websocket.py).
- **Queue-Backed Listening**: WebSocket loops poll connection-specific queues (`ws:user:{user_id}:{connection_id}`) using blocking pops (`BRPOP`).
- **Backward Compatibility**: Restored `active_connections` inside `websocket.py` to maintain 100% compatibility with legacy endpoints (like `/api/ws` in [api.py](file:///d:/Recall/backend/routes/api.py)) and existing unit tests.

---

## 2. Specification Gaps Completed (Phases 3–6 Gaps)

### pgvector HNSW Index Bypass on `/graph` (Phase 3 Gap)
- **Lateral Join Query**: Modified `/graph` in [api.py](file:///d:/Recall/backend/routes/api.py) to leverage pgvector's HNSW cosine distance index first, then filter for shared hub membership in Python.
- **Candidate Near-Miss Response**: Updated the `/api/candidates/active` query to return both `delivered` and `near_miss` candidates, allowing the frontend to receive and render near-miss dashed lines.

### Timezone-Routed Alerts & Cooldowns (Phase 3 & 6 Gaps)
- **Timezone Routing**: Created a daily timezone-routed alert dispatcher in [scheduler.py](file:///d:/Recall/backend/scheduler/scheduler.py):
  - **Hour 8**: Morning Mystery clues (restricted to `confirmed` bucket only).
  - **Hour 11**: Near-Miss alerts with a 3-day Redis cooldown.
  - **Hour 16**: Living Graph warnings with a 10-day Redis cooldown (lapse alert warning if 3+ clusters drop below 40% temperature).
- **Near-Miss Sweeper**: Automatically expires pending near-misses older than 72 hours on every run of the dispatcher.
- **Extension Promo**: Appended a complementary Chrome Web Store link to the Day 0 onboarding message.

### Visual Hub Inactivity Decay & Separation (Phase 3 & 6 Gaps)
- **Node Interpolation**: Hub nodes smoothly fade from gold/amber (`#CFA365`) to gray (`#8A8582`) based on inactivity from 1 to 7 days in [MapCanvas.jsx](file:///d:/Recall/frontend/src/canvas/MapCanvas.jsx).
- **Layout Push**: Faded/cold hubs (inactivity $\ge 7$ days) have their D3 edge force link strength dampened, physically pushing them to the outskirts of the layout.
- **Liveness Tracking**: Registered active liveness in Redis on every graph load.

### Near-Miss Hover Edges & Solid Steppers (Phase 3 Gap)
- **Dashed Hover Edges**: Near-miss candidates are invisible by default and render as a faint gray dashed line only when the user hovers over one of the endpoints.
- **Solid Steppers**: Added `position: relative; z-index: 3;` to `.stepper-dot` and updated the unlocked background to a solid radial gradient (`#231c19` to `#0c0a0f`) in [Profile.jsx](file:///d:/Recall/frontend/src/pages/Profile.jsx), completely masking the progress line segment behind the checkmark circles.

### "Why Now" Trace Panel & Timer (Phase 3 & 4 Gaps)
- **Details Drawer Integration**: Implemented a connection trace card inside [NodePanel.jsx](file:///d:/Recall/frontend/src/components/NodePanel.jsx) displaying similarity %, days gap, and custom LLM tension insights.
- **Ticking Timer**: Active connection windows show a live ticking countdown timer, while near-miss windows display a stable `NEAR-MISS (COOLDOWN)` badge.

### Node Drag Click Detection (UX Bug Fix)
- **Tolerant Click Handler**: Solved canvas mouse click blocking in `MapCanvas.jsx` by implementing coordinate tracking on mousedown/touchstart. Clicks/taps with less than 15px wiggling correctly call `onNodeClick` instead of being swallowed as drags, resolving unresponsive canvas nodes on desktop.

---

## 3. Testing and Regression Verification
- **Websocket Coverage**: Updated `backend/tests/test_websocket.py` to mock Redis calls globally, preventing blocking tests and validating the new Redis-backed broadcast pipeline (`10 passed`).
- **Scheduler Coverage**: Refactored `backend/tests/test_scheduler.py` queries verification to align with the added daily near-miss sweep query (`10 passed`).
- **Regression Checks**: All modified tests passed successfully:
  ```bash
  $ pytest backend/tests/test_websocket.py backend/tests/test_scheduler.py
  ===================== 20 passed in 3.63s ======================
  ```

---

## 4. Manual Verification Steps
Please refer to the walkthrough file [walkthrough.md](file:///C:/Users/pri27/.gemini/antigravity/brain/ba0398e3-7a72-43da-94ff-ce5809ca40b4/walkthrough.md) for step-by-step instructions on manually verifying these changes via the UI.
