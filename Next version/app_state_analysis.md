# Comprehensive System Architecture & Feature Document: Recall

Recall is a Telegram-first AI knowledge management system with a companion 3D web dashboard. This document details the exact, current state of the codebase, covering every feature, system component, database structure, security mechanism, background job, and frontend room.

---

## 1. System Architecture Overview

The system is built on a free-tier compatible stack designed for latency-sensitive capturing and high-fidelity 3D visualization.

```
┌────────────────────────────────────────────────────────┐
│                      ENTRY SURFACES                    │
│   ┌────────────────────────┐      ┌────────────────┐   │
│   │      Telegram Bot      │      │ Web App / TWA  │   │
│   └───────────┬────────────┘      └───────┬────────┘   │
└───────────────┼───────────────────────────┼────────────┘
                │                           │
                ▼                           ▼
┌────────────────────────────────────────────────────────┐
│                    FASTAPI BACKEND                     │
│                [Gated by Semaphore(3)]                 │
│  ┌───────────────────────┐     ┌─────────────────────┐ │
│  │   Webhook Receiver    │     │  REST & WS Routers  │ │
│  └───────────┬───────────┘     └──────────┬──────────┘ │
└──────────────┼────────────────────────────┼────────────┘
               │                            │
               ▼ (LPUSH recall:tasks)       │ (SQL queries / WS events)
┌──────────────────────────────┐            │
│        UPSTASH REDIS         │            │
│   Task Queue & Rate Limits   │            │
└──────────────┬───────────────┘            │
               │ (BRPOP)                    │
               ▼                            │
┌──────────────────────────────┐            │
│      BACKGROUND WORKER       │            │
│   Multimodal Ingest Pipeline │            │
└──────────────┬───────────────┘            │
               │                            │
               ├────────────────────────────┘
               ▼
┌────────────────────────────────────────────────────────┐
│                 NEON POSTGRESQL DATASTORE              │
│       [pgvector HNSW Cosine + pg_trgm GIN Indexes]     │
│   - partitioned items      - quizzes       - users     │
│   - reminders              - hubs          - DLQ       │
└────────────────────────────────────────────────────────┘
```

### Infrastructure Layout
*   **Backend**: FastAPI, run in asynchronous event loops, deployed on Render.
*   **Frontend**: React (v18.3) + Vite (v5.3) single page application, deployed on Vercel.
*   **Datastore**: Neon Serverless PostgreSQL 16 equipped with `pgvector` and `pg_trgm` extensions.
*   **Caching & Queue**: Upstash Redis (Serverless) utilizing REST-based polling and native WebSocket client support.
*   **Serverless Compute**: Modal GPU cloud instances for heavy AI workloads (Whisper, LLMs, Embeddings).

---

## 2. Database Schema & Indices

The database operates with several tables and specialized indices to handle cosine vector distance calculations and trigram text search.

### PostgreSQL Extensions
*   `vector`: pgvector extension facilitating sub-10 ms approximate nearest-neighbor search.
*   `pg_trgm`: Trigram GIN index for fuzzy text filtering.

### Relational Schema

#### 1. `users`
Tracks user accounts, metadata, consecutive streak values, and encrypted authentication tokens.
*   `id` (SERIAL PRIMARY KEY): Surrogate key referenced by child tables.
*   `telegram_chat_id` (VARCHAR(50) UNIQUE NOT NULL): Telegram ID mapping users.
*   `google_refresh_token` (TEXT): Fernet AES-128 encrypted refresh token.
*   `timezone_offset` (INT DEFAULT 0): User timezone offset in minutes.
*   `streak_count` (INT DEFAULT 0): Streak counter based on daily saves.
*   `last_activity_date` (DATE): Tracks last active item insertion.
*   `drive_nudge_sent` (BOOLEAN DEFAULT FALSE): Nudge guard logic for connected Drive account warnings.
*   `digest_enabled` (BOOLEAN DEFAULT TRUE): Toggles morning Telegram summaries.
*   `google_last_sync` (TIMESTAMP): Time of last backup upload to Drive.
*   `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP): Account timestamp.

#### 2. `items` (Partitioned Table)
Stores saved bookmarks, raw documents, and vectors. Partitioned monthly by range based on `created_at`.
*   `id` (SERIAL): Primary identity.
*   `user_id` (INT REFERENCES users(id) ON DELETE CASCADE): Owner relation.
*   `source_type` (VARCHAR(20) NOT NULL): Ingestion source: `url`, `voice`, `pdf`, `image`, or `text`.
*   `source_url` (TEXT): URL origin (null for direct text/files).
*   `raw_text` (TEXT): Encrypted content (Fernet AES-128 at rest).
*   `summary` (TEXT): Plaintext summary for indexing.
*   `title` (VARCHAR(500)): Extracted or AI-generated headline.
*   `embedding` (VECTOR(384)): MiniLM-L6-v2 vector representations.
*   `tags` (TEXT[]): AI-generated tag array.
*   `content_hash` (VARCHAR(16)): Unique MD5/SHA subset for deduplication.
*   `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP): Partition key.
*   *Composite Primary Key*: `(id, created_at)`.
*   *Current Active Partitions*:
    *   `items_y2026m06` (Values from `2026-06-01` to `2026-07-01`).
    *   `items_y2026m07` (Values from `2026-07-01` to `2026-08-01`).

#### 3. `quizzes`
Active recall questionnaire cards generated by the AI cascade.
*   `id` (SERIAL PRIMARY KEY).
*   `user_id` (INT REFERENCES users(id) ON DELETE CASCADE).
*   `item_id` (INT NOT NULL): Corresponds to item source (no foreign key due to items partitioning).
*   `question` (TEXT NOT NULL): Quiz prompt.
*   `options` (JSONB NOT NULL): Four-choice array `["A", "B", "C", "D"]`.
*   `correct_index` (INT NOT NULL): 0-3 index.
*   `explanation` (TEXT): Explanation displayed on answer submission.
*   `ease_factor` (FLOAT DEFAULT 2.5): SuperMemo-2 ease multiplier.
*   `interval_days` (INT DEFAULT 1): Review frequency multiplier.
*   `next_review` (DATE DEFAULT CURRENT_DATE): scheduled SM-2 review timestamp.
*   `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).

#### 4. `quiz_answers`
Audit log of historical quiz attempts.
*   `id` (SERIAL PRIMARY KEY).
*   `user_id` (INT REFERENCES users(id) ON DELETE CASCADE).
*   `quiz_id` (INT REFERENCES quizzes(id) ON DELETE CASCADE).
*   `quality` (INT NOT NULL): SM-2 response quality score (0 to 5).
*   `answered_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).

#### 5. `reminders`
Scheduled push reminders sent through the Telegram Bot.
*   `id` (SERIAL PRIMARY KEY).
*   `user_id` (INT REFERENCES users(id) ON DELETE CASCADE).
*   `item_id` (INT): Optional item linkage.
*   `message` (TEXT NOT NULL): Alert contents.
*   `remind_at` (TIMESTAMP NOT NULL): Delivery timestamp.
*   `status` (VARCHAR(20) DEFAULT 'pending'): `pending`, `sent`, or `failed`.
*   `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).

#### 6. `semantic_hubs`
Louvain clustering groups representing semantic topics inside the graph constellation.
*   `id` (SERIAL PRIMARY KEY).
*   `user_id` (INT REFERENCES users(id) ON DELETE CASCADE).
*   `label` (VARCHAR(200) NOT NULL): AI-generated cluster summary name.
*   `centroid` (VECTOR(384)): Average coordinates of nodes in the cluster.
*   `member_ids` (INT[]): Array of child items in the cluster.
*   `created_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).

#### 7. `processed_updates`
Protects the webhook from reprocessing Telegram requests.
*   `update_id` (VARCHAR(50) PRIMARY KEY): Unique Telegram message identifier.
*   `processed_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).

#### 8. `dead_letter_queue` (DLQ)
Quarantines crashed ingestion jobs for administrative review.
*   `id` (SERIAL PRIMARY KEY).
*   `user_id` (INT REFERENCES users(id) ON DELETE CASCADE).
*   `task_payload` (JSONB NOT NULL): Original payload contents.
*   `error_message` (TEXT): Logged traceback/exception context.
*   `failed_at` (TIMESTAMP DEFAULT CURRENT_TIMESTAMP).
*   `retried` (BOOLEAN DEFAULT FALSE): Boolean flag ensuring items are retried once.

### Index Configuration
*   `idx_items_user` (B-Tree on `items(user_id)`): Optimizes list retrievals.
*   `idx_items_embedding` (HNSW on `items(embedding)` using `vector_cosine_ops` with configuration `m=16, ef_construction=64`): Optimizes similarity-based vector searches.
*   `idx_items_text_gin` (GIN on `items(summary)` using `gin_trgm_ops`): Optimizes fuzzy title and keyword matching.
*   `idx_reminders_time_status` (B-Tree on `reminders(remind_at, status)`): Optimizes dispatch queue lookups.

---

## 3. Ingestion & Ingest Pipeline

The core capturing flow parses multiple document types and processes them through an asynchronous queue.

```
Telegram Webhook ──► [Idempotency & Rate Limit checks] ──► Immediate ACK (200 OK)
                                                                 │
                                                      (LPUSH task to Redis)
                                                                 ▼
                                                  [Redis Queue "recall:tasks"]
                                                                 │
                                                      (BRPOP by Worker Loop)
                                                                 ▼
                                                    [Worker Process Task]
                                                                 │
                                                       (Gated by Semaphore)
                                                                 ▼
                                                   [Ingestion Service Pipeline]
                                                                 │
                                                                 ├── Voice/Audio (Whisper)
                                                                 ├── URLs & YouTube (BeautifulSoup / yt-dlp / ZenRows)
                                                                 ├── Documents (PyMuPDF)
                                                                 └── Images (Tesseract OCR)
                                                                 │
                                                                 ▼
                                                          [AI Cascade Engine]
                                                                 │
                                                       (Generate Summary,
                                                        Tags, and Embedding)
                                                                 ▼
                                                     [Database Commit & WS]
```

### Asynchronous Queue Routing
1.  **Webhook Ingestion**: `/webhook` parses incoming Telegram updates. It checks idempotency against `processed_updates`.
2.  **Immediate ACK**: Telegram requests must be acknowledged within 50 ms. The server stores `update_id`, `chat_id`, `content_type`, and message bodies, pushes the task (`LPUSH recall:tasks`), and immediately returns `200 OK`.
3.  **Worker Loop**: The worker loop processes tasks using `BRPOP` with a 5-second timeout, running tasks inside a concurrency-limiting semaphore (`asyncio.Semaphore(3)`).
4.  **Deduplication Checks**: Early deduplication checks for URLs and notes using content hashing (`content_hash`) prevent duplicate database writes and duplicate AI API consumption.

### Media Ingest Pipelines
*   **Voice notes**: Uses `yt-dlp` or local downloading, routing audio bytes to Whisper for transcription.
*   **URLs & YouTube/Instagram**:
    *   Crawls web addresses using BeautifulSoup with rotating user agents.
    *   YouTube and Instagram media links are resolved using `yt-dlp`.
    *   For Instagram Reels blocked by authentication challenges, the crawler falls back to parsing metadata headers (OpenGraph tags) via scraping providers (ZenRows / ScrapingBee / ScraperAPI).
*   **PDFs**: Uses PyMuPDF (`fitz`) to parse text. Splitting files into 512-token chunks allows the system to compute average vector positions for large documents.
*   **Images**: Uses PyTesseract OCR. Captures text from screenshots and forwards OCR outputs to summary endpoints.

---

## 4. AI Cascade Engine

All AI pipeline interactions follow a tiered fallback architecture to ensure high availability and prevent data loss.

```
       Task Received
             │
             ▼
     ┌───────────────┐
     │    TIER 0     │  (Whisper large-v3 STT / Llama 3.3 70B LLM)
     │   Modal GPU   ├───► SUCCESS ───► Save to DB
     └───────┬───────┘
             │ (Fail / Timeout > 30s)
             ▼
     ┌───────────────┐
     │    TIER 1     │  (Whisper-Turbo STT / Qwen 2.5 27B / GPT-OSS 120B)
     │  Groq Cloud   ├───► SUCCESS ───► Save to DB
     └───────┬───────┘
             │ (Fail / Timeout > 20s)
             ▼
     ┌───────────────┐
     │    TIER 2     │  (Gemini 2.5 Flash / Flash-Lite multimodal)
     │  Gemini API   ├───► SUCCESS ───► Save to DB
     └───────┬───────┘
             │ (Fail / Timeout > 20s)
             ▼
     ┌───────────────┐
     │    TIER 3     │  (Bookmark Fallback)
     │ Local Database├───► SUCCESS ───► Save Minimal Metadata
     └───────────────┘
```

### The Tiers
1.  **Tier 0: Modal GPU (Private Serverless)**:
    *   *Models*: Whisper large-v3 (STT), Llama 3.3 70B (Summarization & Quizzes), MiniLM-L6-v2 (Embedding).
    *   *Properties*: Self-hosted serverless container models. 
    *   *Timeout*: 30 seconds.
2.  **Tier 1: Groq Cloud (API Fallback)**:
    *   *Models*: Whisper-large-v3-turbo (STT), `qwen/qwen3.6-27b` (General text & quizzes), `openai/gpt-oss-120b` (Large documents & overflow).
    *   *Timeout*: 20 seconds.
3.  **Tier 2: Gemini 2.5 Flash / Flash-Lite (API Fallback)**:
    *   *Models*: Gemini 2.5 Flash / Flash-Lite.
    *   *Properties*: Multimodal fallback processing for audio files and raw texts.
    *   *Timeout*: 20 seconds.
4.  **Tier 3: Bookmark Fallback (Guaranteed Completion)**:
    *   *Action*: Saves items as bookmarks with minimal metadata (extracted title, source URL, no summary or embeddings).
    *   *DLQ Insertion*: Logs failed operations to the Dead Letter Queue for manual admin retries.
    *   *User Alert*: Telegram alert: *"Could not process [content type]. Saved as bookmark."*

---

## 5. Background Scheduler

The background scheduler (implemented via `APScheduler`) runs 8 distinct cron and interval tasks:

1.  **`reminders_dispatcher`** (Interval: Every 1 minute):
    *   *Database-friendly check*: Queries Redis sorted set `reminders:active` first. If no reminders are due, it exits immediately without querying the Postgres database (allowing Neon database connections to scale down).
    *   *Dispatch*: Sends due reminders to users via Telegram and updates status to `sent` or `failed`.
2.  **`louvain_clustering`** (Cron: Daily at 02:00 UTC):
    *   *Clustering Threshold*: Scans for users with $\ge 10$ new items.
    *   *Partitioning*: Calculates NetworkX similarity graphs based on cosine distance ($>0.75$).
    *   *Centroid Computations*: Creates community groups using python-louvain, generates cluster labels via AICascade, updates `semantic_hubs`, invalidates Redis graph caches, and broadcasts `hubs_updated` WebSocket alerts.
3.  **`partition_creator`** (Cron: Monthly on the 25th at 00:00 UTC):
    *   *Calculates bounds*: Computes M+1 and M+2 boundaries to create the next month's items partition.
4.  **`drive_nudge_sender`** (Cron: Daily at 10:00 UTC):
    *   *Targeting*: Nudges active users with a streak $\ge 3$ who haven't connected their Google Drive accounts.
5.  **`processed_updates_cleanup`** (Cron: Weekly on Sundays at 03:00 UTC):
    *   *Pruning*: Deletes `processed_updates` rows older than 30 days.
6.  **`daily_digest_sender`** (Cron: Hourly, checked at minute 0):
    *   *Targeting*: Identifies users whose local timezone is currently in the 8:00 AM hour and who have `digest_enabled=True`.
    *   *Payload*: Sends active streak details, summaries of items saved yesterday, and outstanding quizzes count via Telegram.
7.  **`weekly_drive_sync`** (Cron: Weekly on Sundays at 04:00 UTC):
    *   *Backup*: Backs up all items for connected users to their Google Drive accounts.
8.  **`offpeak_quiz_generator`** (Cron: Daily at 22:00 UTC):
    *   *Automation*: Generates quizzes for new items saved during the day. Includes a 1-second delay between LLM calls to prevent API rate limit issues.

---

## 6. API Reference

All requests inside `/api/*` are authenticated via TWA HMAC headers or JWT session cookies.

### 🔐 Authentication Router (`/auth`)
*   `GET /auth/telegram`: Verifies the signature of Telegram login widget payloads, updates the database, and stores JWT credentials in httpOnly `recall_session` and `jwt` cookies.
*   `POST /auth/logout`: Invalidates session credentials by deleting auth cookies.
*   `GET /auth/me`: Returns user info, Telegram ID, and Google Drive connection state.
*   `GET /auth/google`: Starts Google OAuth consent flows using the `drive.file` scope.
*   `GET /auth/google/callback`: Processes Google authorization codes, stores encrypted refresh tokens, broadcasts connection status via WebSockets, and notifies users via Telegram.

### 📥 Core Features Router (`/api`)
*   `GET /api/items`: Returns paginated saved items for the user, with filters for `source_type`, `tag`, and date range.
*   `POST /api/items`: Saves a new text note or URL, checks for duplicates, updates streaks, and clears the Redis graph cache.
*   `GET /api/items/{item_id}`: Returns details of a specific item.
*   `DELETE /api/items/{item_id}`: Deletes an item, its associated quizzes, and chunks. Scoped to the authenticated user to prevent IDOR vulnerabilities.
*   `GET /api/tags`: Returns the user's top 50 tags.
*   `POST /api/search`: Performs hybrid vector searches (HNSW pgvector + GIN trigram text matching). Runs Map-Reduce RAG generation if at least 3 source documents are found.
*   `GET /api/graph`: Returns nodes, edges, and semantic hubs for the mind map graph. Cached in Redis (60-second TTL) to minimize database hits.
*   `GET /api/quizzes/due`: Returns the top 10 due quizzes for the user based on SM-2 reviews.
*   `POST /api/quizzes/{id}/answer`: Records quiz responses, recalculates SM-2 parameters, and logs attempts to `quiz_answers`.
*   `GET /api/quizzes/stats`: Returns quiz statistics (total, due today, mastered counts, and a 7-day review history).
*   `GET /api/reminders`: Returns the user's active reminders.
*   `POST /api/reminders`: Creates and schedules a new reminder, updating the database and the Redis sorted set.
*   `DELETE /api/reminders/{id}`: Cancels and deletes a scheduled reminder.
*   `POST /api/drive/sync`: Manually syncs the 50 most recent items into a Google Docs document. Rate limited to 5 requests per hour.
*   `DELETE /api/drive`: Disconnects Google Drive integration, revoking the OAuth token and clearing database fields.
*   `GET /api/me`: Returns settings, streak stats, and local timezone offset configuration.
*   `PATCH /api/me`: Updates user settings (timezone offset, daily digest toggles).
*   `DELETE /api/me`: Permanently deletes the user account, cascading deletions to all related data tables.
*   `GET /api/export`: Streams all user-owned data (decrypted items, quizzes, reminders) as a JSON file. Rate limited to 1 export per 24 hours.
*   `WS /api/ws`: Authenticates WebSocket connections using session cookies. Routes real-time events (`new_node`, `hubs_updated`, `google_connected`).

### 🛠 Administrative & Ingest APIs
*   `POST /webhook`: Telegram webhook receiver.
*   `POST /api/extension/save`: Receives page captures from the Chrome extension.
*   `GET /api/admin/queue`: Returns worker queue lengths, dead letter queue counts, and available processing slots. Gated by `X-Internal-Key` header validation.
*   `POST /api/admin/dlq/{id}/retry`: Re-enqueues failed DLQ tasks. Gated by `X-Internal-Key` header validation.

---

## 7. Frontend User Interface Pages

The interface is styled with a custom dark aesthetic, film grain effects, scanlines, and CSS animations.

```
                  BOOT SEQUENCE SPLASH SCREEN (SplashScreen.jsx)
                                       │
                                       ▼
                       LOGIN SURFACE (Login.jsx)
                                       │
                                       ▼
                    OBSERVATORY SYSTEM ROOMS NAVIGATION
                                       │
        ┌──────────────────┬───────────┴───────────┬──────────────────┐
        ▼                  ▼                       ▼                  ▼
  [3D MIND MAP]     [3D CYLINDER]           [TIMELINE FEED]     [ACTIVE DRILL]
     Map.jsx          Archive.jsx              Feed.jsx           Drill.jsx
        │                  │                       │                  │
        └──────────────────┴───────────┬───────────┴──────────────────┘
                                       ▼
                          GLOBAL SEARCH COMMAND+K OVERLAY
                                SearchOverlay.jsx
```

### Main Rooms

#### 1. Constellation Map (`Map.jsx` & `NebulaCanvas.jsx`)
*   *Layout*: Starry sky mind map rendered using Three.js and React Three Fiber (R3F).
*   *Interaction*: Nodes are rendered as glowing stars color-coded by content type. Quadratic Bezier curves connect similar nodes, with moving particle flows indicating the strength of the relationship.
*   *Sidebar*: Displays details (summary, tags, source URLs) of selected nodes.

#### 2. Archive Cylinder (`Archive.jsx` & `ArchiveCylinder.jsx`)
*   *Layout*: Renders saved items as glassmorphic cards arranged around a rotating 3D cylinder.
*   *Interaction*: Users drag or scroll to rotate the cylinder, and click cards to slide out detail panels.

#### 3. Content Timeline Feed (`Feed.jsx`)
*   *Layout*: A responsive timeline view of all saved items.
*   *Features*: Support for editing summaries and deleting items, with real-time keyword and tag filters.

#### 4. Spaced Repetition Drill (`Drill.jsx`)
*   *Layout*: A card-stack interface matching the cosmic theme.
*   *Interaction*: Animates card flips for active recall review. Displays results immediately and queues the next card on click.

#### 5. Reminders Scheduler (`Reminders.jsx`)
*   *Layout*: A scheduler interface to manage notifications.
*   *Features*: Users can schedule text-only alerts or link reminders to saved items.

#### 6. System Settings (`Settings.jsx`)
*   *Features*: Toggles daily digests, manages Google Drive connections, adjusts timezone offsets, exports data, and provides account deletion options.

### UI Shell Features
*   **Custom Lagging Cursor (`CustomCursor.jsx`)**: An interactive cursor consisting of a central amber dot and a trailing glass ring.
*   **Command+K Search Overlay (`SearchOverlay.jsx`)**: A keyboard shortcut overlay for quick search and tag filtering.
*   **Web Audio Synthesizer Engine (`AudioEngine.js`)**: Triggers retro sci-fi sounds (synthesized using oscillators) on page transitions and click events.
*   **Film Grain Overlay**: Applies a moving film grain effect (using a low-opacity SVG noise overlay) to create a warm, tactile aesthetic.

---

## 8. Security Controls & Standards

*   **Credential Protection**: Telegram Bot tokens, Fernet encryption keys, and JWT secrets are redacted in log files using a custom logging filter (`SecretMaskingFilter`).
*   **Encrypted Storage**: Sensitive fields (such as `raw_text` and `google_refresh_token`) are encrypted using Fernet (AES-128) before database insertion.
*   **CORS Protection**: CORS headers are restricted to the verified frontend URL (`WEBSITE_URL`).
*   **IDOR Protections**: All database queries involving user items include `WHERE user_id = <verified_user_id>` clauses.
*   **Cookie Security**: Session cookies are configured with `httpOnly`, `Secure`, and `SameSite=Lax` flags.
*   **Replay Attack Protection**: Webhook initData signatures are checked for a 1-hour expiration limit.
*   **Swagger Disabling**: Swagger API documentation is disabled in production environments (`ENV=production`).

---

## 9. Testing & Quality Assurance

The project includes test suites for both backend and frontend code to prevent regressions.

### Backend Tests (Pytest)
*   *Scope*: 309 unit tests across 53 files.
*   *Modules*: Validates rate limiting, encryption, database operations, worker loops, and Telegram callback routing.
*   *Mocks*: Mocks external APIs (Telegram, Google, Upstash Redis, Modal) to allow tests to run offline.

### Frontend Tests (Vitest)
*   *Scope*: 83 tests across 17 files.
*   *Modules*: Tests settings updates, keyboard overlays, transition timers, and audio engine states.
*   *Mocks*: Uses mock hooks to test DOM events and navigation changes.
