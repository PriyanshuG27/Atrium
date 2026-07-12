---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Architecture Overview

Atrium is organized into decoupled layers designed for low latency, secure data ownership, and real-time frontend feedback.

---

## 1. High-Level Component Layout

Atrium's architecture spans six layers:

```
┌────────────────────────────────────────────────────────┐
│ 1. Ingestion Layer                                     │
│    Telegram Bot Webhook / Chrome clipper extension     │
└───────────┬────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│ 2. Gateway API Layer                                   │
│    FastAPI router, Rate-limit (Redis), CORS, TWA Auth  │
└───────────┬────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│ 3. Processing Queue                                    │
│    Upstash Redis queue list (atrium:tasks)             │
└───────────┬────────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────────────────────┐
│ 4. Asynchronous Workers & Schedulers                   │
│    Worker pool (Semaphore=3), APScheduler              │
└───────────┬────────────────┬───────────────────────────┘
            │                │
            ▼                ▼
┌──────────────────────┐  ┌──────────────────────────────┐
│ 5. AI Pipelines      │  │ 6. Storage & Search          │
│    STT (Whisper)     │  │    Neon Postgres 16          │
│    OCR (NIM/Gemini)  │  │    pgvector (HNSW)           │
│    LLM Cascade       │  │    pg_trgm (GIN)             │
└──────────────────────┘  └──────────────────────────────┘
```

---

## 2. Ingestion Lifecycles

### Lifecycles of a Telegram Capture
1. **Webhook ACK**: User records a voice memo or text note on Telegram. Telegram hits `/webhook`. The webhook handler validates the signature, pushes a task JSON to the `atrium:tasks` list in Redis, and returns a fast response immediately to prevent duplicate Telegram retries.
2. **Worker Processing**: The asynchronous worker fetches the task from Redis using `brpoplpush` (to ensure atomic retrieval and avoid task losses).
3. **AI pipeline**:
   - Converts audio to text using Groq Whisper.
   - Extracts OCR text for images/PDFs using NVIDIA NIM with a Gemini fallback.
   - Generates summary, categories, and tags using the LLM Cascade.
   - Computes a 384-dimensional vector embedding.
4. **Database Write**: Raw text is encrypted using Fernet AES-128 and saved into Neon PostgreSQL, and chunks are saved into the partitioned `item_chunks` table.
5. **Real-time Stream**: The worker publishes a node-created event to Redis Pub/Sub, which is broadcast to active WebSockets, pushing real-time updates to the web client.

---

## Evidence & Inspected Files
This document was generated from:
- `backend\main.py`
  - Lifecycle open/close pool handlers and app setups.
- `backend\worker.py`
  - Processing loops fetching items from Redis `atrium:tasks`.
- `backend\routes\webhook.py`
  - Hook handler and fast response returns.
- `backend\routes\websocket.py`
  - WebSocket subscription to Redis events channel.
