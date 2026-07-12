---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Backend Server Architecture

Atrium's backend is built on FastAPI and configured to handle high-concurrency ingestion and background cron dispatchers.

---

## 1. Gateway Routers
The server initializes in `backend/main.py` and registers six distinct routers:

- **Webhook Router (`routes/webhook.py`)**: Receives and validates incoming Telegram payloads.
- **Auth Router (`routes/auth.py`)**: Handles Telegram Web App HMAC verification, Google Drive OAuth callbacks, and token session issuing.
- **API Router (`routes/api.py`)**: Main CRUD routing for saved items, tag portraits, search queries, reminders, and Obsidian ZIP backups.
- **Hearth Router (`routes/hearth.py`)**: Handles partnership invites, status checks, and connections.
- **Metrics Router (`routes/metrics.py`)**: Tracks AI provider latencies, cost, tokens, and health checks.
- **WebSocket Router (`routes/websocket.py`)**: Streams real-time updates to connected clients.

---

## 2. Background Scheduler (Scheduled Jobs)
Atrium utilizes APScheduler (`backend/scheduler/scheduler.py`) to run background calculations and database operations.
All jobs are configured with `misfire_grace_time=60` to ensure reliability. Notable jobs include:

- **louvain_clustering**: Runs the Louvain community partitioning algorithm to group nodes.
- **scan_insight_candidates_for_user**: Analyzes similarities between user items saved after a configured delay interval, generating daily retention insights.
- **run_nightly_mind_type_for_user**: Evaluates user activity vectors to classify their "Mind Type" category.
- **offpeak_quiz_generator**: Schedules and generates review quizzes during low-usage hours.
- **partition_creator**: Automatically creates range partition tables in Neon PostgreSQL for future months.
- **reminders_dispatcher**: Polls the `reminders` table every minute, firing scheduled notifications to Telegram.
- **daily_pulse_updater**: Recalculates user activity scores based on interactions.

---

## Evidence & Inspected Files
This document was generated from:
- `backend\main.py`
  - Initialization of the FastAPI application and registration of routers.
- `backend\scheduler\scheduler.py`
  - Setup of APScheduler, cron jobs, and background workers.
- `backend\routes\api.py`
  - Primary API router definitions.
- `backend\routes\auth.py`
  - Session verification routes.
- `backend\routes\hearth.py`
  - Hearth partnership routes.
- `backend\routes\webhook.py`
  - Telegram webhook handler routes.
