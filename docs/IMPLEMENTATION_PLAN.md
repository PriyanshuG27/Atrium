# IMPLEMENTATION_PLAN — Recall

| Field | Value |
|-------|-------|
| Version | 0.1.0 |
| Date | 2026-06-19 |
| Status | Draft |

---

## Phase Overview

```
Phase 0: Project Foundation (Local Env, DB DDL, Config Loader)
Phase 1: Core Webhook & Bot Commands
Phase 2: Ingestion Pipeline & AI Cascade (Text, Voice, PDF, Image, URLs)
Phase 3: Embeddings & Semantic Search (pgvector, Hybrid Search)
Phase 4: Web Dashboard Foundation & UI (React/Vite)
Phase 5: Canvas Interactive Mind Map (Force-Directed Graph)
Phase 6: Web Authentication & WebSockets (Telegram JWT, TWA, WS)
Phase 7: Spaced Repetition Quizzes (SM-2 Algorithm)
Phase 8: Scheduler & Cron Jobs (APScheduler)
Phase 9: Google Drive Sync & Link Ingestion + Chrome Extension
Phase 10: Automated Testing Suite (Pytest, Vitest, k6)
Phase 11: Deployment, Security & Observability (GitHub Actions, Render)
```

---

## Phase 1 — DB Setup + Webhook + Basic Save (text/URL)

**Deliverables**:
- Neon DB provisioned; all 8 tables created; all indices created.
- FastAPI app on Render with POST /webhook and GET /health.
- Bot receives text and URL messages; saves to items with source_type='text' or 'url'.
- BeautifulSoup scraping for URLs.
- Telegram idempotency (processed_updates).
- Bot replies with title + scraped text snippet.

**Acceptance Criteria**:
- Forwarding a URL to bot results in an items row with title and source_url.
- GET /health returns 200.
- Duplicate Telegram update_id results in no duplicate row.
- Webhook returns 200 in < 200 ms.

**Dependencies**: Neon, Upstash Redis, Telegram bot token, Render.

---

## Phase 2 — Voice Transcription + AI Summarisation

**Deliverables**:
- Modal endpoints: Whisper, LLM.
- AI cascade: Tier 0 (Modal) -> Tier 1 (Groq) -> Tier 2 (Gemini) -> Tier 3 (bookmark).
- Voice note ingestion: yt-dlp download -> Whisper -> summary.
- Fernet encryption of raw_text.
- Dead letter queue + user notification on cascade exhaustion.
- Rate limiter (Redis sliding window).

**Acceptance Criteria**:
- Voice note to bot produces transcribed text + summary in items within 15 s.
- raw_text column is Fernet-encrypted in DB.
- Sending >20 messages/min results in bookmark saves (rate limiter active).
- Failed cascade results in dead_letter_queue entry + user notification message.

**Dependencies**: Phase 1, Modal account, Groq API key, FERNET_KEY.

---

## Phase 3 — Semantic Search + Embeddings

**Deliverables**:
- Modal endpoint: MiniLM-L6-v2 embedding.
- All items get 384-dim embedding on save.
- HNSW index applied.
- POST /api/search: vector search + GIN trigram hybrid.
- /search command in Telegram bot.
- PDF ingestion: PyMuPDF + chunking + per-chunk embedding + summary.
- Image ingestion: Tesseract OCR + embedding + summary.

**Acceptance Criteria**:
- /search "machine learning" returns semantically relevant items, not just keyword matches.
- PDF forwarded to bot produces a row with full summary within 30 s.
- Image with text returns OCR extract + summary.
- Vector search completes in < 10 ms (measured via EXPLAIN ANALYZE).

**Dependencies**: Phase 2, MiniLM Modal endpoint.

---

## Phase 4 — Mind Map Frontend (Canvas)

**Deliverables**:
- React/Vite project scaffolded on Vercel.
- GET /api/graph endpoint: returns nodes + edges.
- Force-directed Canvas renderer at 60 FPS.
- Node types: orbital, hub, pulse.
- Node click -> side panel (title, summary, source, tags).
- Telegram TWA layout (375px).

**Acceptance Criteria**:
- Graph renders 100 nodes at >= 60 FPS (measured via Chrome DevTools).
- Clicking a node opens side panel with correct data.
- TWA opens inside Telegram Mini App.

**Dependencies**: Phase 3, Vercel, VITE_API_URL, VITE_BOT_USERNAME.

---

## Phase 5 — Website + Unified Auth + WebSocket

**Deliverables**:
- Telegram Login Widget on website.
- GET /auth/telegram -> JWT issuance -> httpOnly cookie.
- TWA HMAC verification for in-Telegram access.
- WebSocket /ws/{token}: per-user real-time channel.
- WebSocket push on new item save (graph update).
- Canvas updates in real time on new item (pulse animation).

**Acceptance Criteria**:
- Website login via Telegram Login Widget works end-to-end.
- Forwarding item to bot causes new node to appear in open browser tab within 2 s.
- TWA opens and authenticates without redirect.

**Dependencies**: Phase 4, JWT_SECRET, WEBSITE_URL.

---

## Phase 6 — Spaced Repetition + Scheduler

**Deliverables**:
- Quiz generation via LLM (stored in quizzes table).
- GET /api/quizzes/due + POST /api/quizzes/{id}/answer.
- SM-2 algorithm: update ease_factor, interval_days, next_review.
- /quiz command in bot: inline keyboard with 4 options.
- APScheduler: all 5 jobs (reminders_dispatcher, louvain_clustering, partition_creator, drive_nudge_sender, processed_updates_cleanup).
- POST /api/reminders + Telegram /remind command.
- Streak counter (streak_count, last_activity_date).
- Louvain clustering -> semantic_hubs.
- Hub node type in Canvas.

**Acceptance Criteria**:
- Answering a quiz correctly increases interval_days.
- Louvain job runs at 02:00 UTC and creates hub rows if >= 10 new items.
- Reminder arrives within 1 minute of scheduled time.
- partition_creator creates next month's partition on 25th.

**Dependencies**: Phase 5, APScheduler configured.

---

## Phase 9 — Google Drive Integration & Chrome Extension

**Deliverables**:
- **OAuth Setup**: GET /auth/google + GET /auth/google/callback requesting `drive.file` and `drive.readonly` scopes.
- **Token Security**: Fernet encryption of refresh token at rest.
- **Drive Connect**: `/connect_drive` bot command + website connection button with real-time WS connection event.
- **Drive Link Parser**: Ingestion logic detecting `drive.google.com` links:
  - Public Links: Download and parse directly (PDF/Doc/audio) without token.
  - Private Links: If user has connected Google account, use `google_refresh_token` to generate access token and download. If not connected, reply with warning message.
  - Ephemeral Disk Safety: Limit concurrency using `asyncio.Semaphore(3)`, restrict file size to 100 MB max, save to unique paths under `/tmp/`, and delete inside a `finally` block immediately after parsing.
- **Drive Sync**: Export user's top summaries to a "Recall" Google Doc weekly or via manual dashboard trigger.
- **Chrome Extension**: Manifest V3 extension with popup button saving current tab URL to Recall database.

**Acceptance Criteria**:
- Connecting Google Drive stores Fernet-encrypted refresh token.
- Pasting a public Google Drive link (PDF/Doc/audio) successfully downloads, parses, and adds a node to the mind map.
- Pasting a private Google Drive link:
  - If connected: successfully downloads, parses, and adds a node.
  - If not connected: replies: `⚠️ I can't access that Google Drive link because it's private. Please connect your Google Drive first using /connect_drive or via the web dashboard.`
- Files > 100 MB are rejected immediately without filling the disk.
- Exported Doc appears in user's Drive under "Recall" folder.
- Clicking Chrome extension button on any webpage saves the URL.

**Dependencies**: Phase 6 & 8, Google OAuth credentials.

---

## Dependency Graph

```
Phase 1 (core)
    |
    v
Phase 2 (AI)
    |
    v
Phase 3 (search)
    |
    v
Phase 4 (canvas UI)
    |
    v
Phase 5 (interactive graph)
    |
    v
Phase 6 (web auth & websockets)
    |
    v
Phase 7 (quizzes)
    |
    v
Phase 8 (scheduler)
    |
    v
Phase 9 (Google Drive & Chrome Extension)
```
