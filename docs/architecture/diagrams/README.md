---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Visual Architecture Diagrams

This document contains visual Mermaid diagrams explaining Atrium's component layering, content ingestion pipelines, and database relations.

---

## 1. System Architecture & Components
This diagram maps client endpoints, API routers, background workers, and datastores:

```mermaid
flowchart TB
    subgraph Clients["Ingestion & Client Layer"]
        TG["Telegram Bot App\n(@AtriumBot)"]
        WEB["React SPA\n(Vite 6 / Port 5173)"]
        EXT["Chrome Web Clipper\n(Extension Popup)"]
        SHARE["Mobile Share Target\n(/api/share-target)"]
    end

    subgraph API["FastAPI Application Layer (backend/main.py)"]
        AUTH["Auth Router\n(backend/routes/auth.py)"]
        ITEMS["API Router\n(backend/routes/api.py)"]
        HOOK["Webhook Handler\n(backend/routes/webhook.py)"]
        WS["WebSocket Router\n(backend/routes/websocket.py)"]
    end

    subgraph Workers["Background Queue & Processing"]
        REDIS["Upstash Redis Queue\n(atrium:tasks)"]
        WORKER["Async Worker Loop\n(backend/worker.py\nSemaphore: 3)"]
        SCHED["APScheduler Engine\n(backend/scheduler/scheduler.py\nScheduled Jobs)"]
    end

    subgraph Storage["Data & Pipeline Layer"]
        DB[(Neon PostgreSQL 16\npgvector + pg_trgm)]
        DLQ[(Dead Letter Queue\ndead_letter_queue table)]
        AI_CASCADE["AI Cascade Engine\n(Groq / Gemini / OpenRouter)"]
        AI_SVC["Local/Remote AI helper\n(FastEmbed / Reranker / spaCy)"]
    end

    TG --> HOOK
    WEB --> AUTH
    WEB --> ITEMS
    WEB <--> WS
    EXT --> ITEMS
    SHARE --> ITEMS

    HOOK -- "Fast Webhook ACK" --> REDIS
    REDIS --> WORKER
    WORKER --> AI_CASCADE
    WORKER --> AI_SVC
    WORKER --> DB
    WORKER -- "On Failure" --> DLQ
    SCHED --> DB
    SCHED --> REDIS
```

---

## 2. Ingestion Sequence Diagram
This diagram outlines the sequential steps when a user uploads content via Telegram:

```mermaid
sequenceDiagram
    autonumber
    participant User as User (Telegram)
    participant Hook as Webhook Router (webhook.py)
    participant Redis as Upstash Redis (atrium:tasks)
    participant Worker as Async Worker (worker.py)
    participant Nvidia as NVIDIA NIM (Primary OCR)
    participant Gemini as Gemini API (OCR Fallback / Summarization)
    participant Embed as ONNX Embedding (FastEmbed)
    participant DB as Neon PostgreSQL (items)
    participant WS as WebSocket Router (websocket.py)
    participant SPA as React SPA (App.jsx)

    User->>Hook: Send voice note / text / link
    Hook->>Redis: Push task JSON to atrium:tasks
    Hook-->>User: Return HTTP 200 ACK
    
    Worker->>Redis: brpoplpush atrium:tasks atrium:processing
    Worker->>Nvidia: Extract OCR Text (Image/PDF)
    Nvidia-->>Worker: OCR Text (or low confidence failover)
    opt Low Confidence / Empty OCR
        Worker->>Gemini: OCR Fallback (Gemini 2.5 Flash)
        Gemini-->>Worker: Extracted text
    end
    Worker->>Gemini: Summarize & Extract Tags
    Gemini-->>Worker: Summary + Tags
    Worker->>Embed: Generate 384-dim Embedding
    Embed-->>Worker: Vector (384)
    Worker->>DB: Fernet encrypt raw_text & INSERT item
    Worker->>Redis: Publish event to ws:connections:user:{id}
    Redis->>WS: Push new_node event
    WS-->>SPA: Stream WebSocket event -> update graph
```

---

## 3. Database Entity-Relationship (ER) Diagram
This diagram visualizes database tables and relationships. Note that composite range-partitioned primary keys in `items` restrict standard foreign keys in target tables:

```mermaid
erDiagram
    users ||--o{ items : "owns"
    users ||--o{ quizzes : "owns"
    users ||--o{ reminders : "owns"
    users ||--o{ semantic_hubs : "owns"
    users ||--o{ dead_letter_queue : "owns"
    items ||--o{ item_chunks : "partitioned cascade delete (via Pl/pgSQL trigger)"
    quizzes ||--o{ quiz_answers : "tracks"

    users {
        int id PK
        string telegram_chat_id UK
        string google_refresh_token "Fernet Encrypted"
        int streak_count
        numeric pulse_score
    }

    items {
        int id PK
        int user_id FK
        string source_type
        string raw_text "Fernet Encrypted"
        string summary "GIN Trigram Indexed"
        vector_384 embedding "HNSW Cosine Indexed"
        timestamp created_at PK
    }

    item_chunks {
        int id PK
        int item_id "References items(id)"
        int user_id FK
        string chunk_text
        vector_384 embedding
    }
```

---

## Evidence & Inspected Files
This document was generated from:
- `backend\main.py`
  - Core app structure.
- `backend\worker.py`
  - Queue worker setup.
- `backend\db\schema.sql`
  - Mapped tables DDL structure.
- `docs\archive\DIAGRAMS.md`
  - Historical diagrams context.
