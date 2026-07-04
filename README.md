# Recall — Your Thoughts Deserve More Than a Graveyard of Bookmarks

<p align="center">
  <strong>Recall turns scattered voice notes, articles, PDFs, and screenshots into an interactive 3D spatial knowledge graph you can explore, talk to, and actually remember.</strong>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-blue.svg" alt="License"></a>
  <a href="https://python.org"><img src="https://img.shields.io/badge/Python-3.11+-3776AB.svg?logo=python&logoColor=white" alt="Python"></a>
  <a href="backend/main.py"><img src="https://img.shields.io/badge/FastAPI-0.111+-009688.svg?logo=fastapi&logoColor=white" alt="FastAPI"></a>
  <a href="frontend/src/App.jsx"><img src="https://img.shields.io/badge/React-18.3+-61DAFB.svg?logo=react&logoColor=black" alt="React"></a>
  <a href="backend/db/schema.sql"><img src="https://img.shields.io/badge/PostgreSQL-pgvector-4169E1.svg?logo=postgresql&logoColor=white" alt="PostgreSQL"></a>
  <a href="docs/INDEX.md"><img src="https://img.shields.io/badge/Docs-Engineering_Manual-purple.svg" alt="Docs"></a>
</p>

---

## 🎬 Primary Demo

> *Imagine dropping a voice note while walking, bookmarking an article on your phone, and clipping a technical diagram from your browser—then exploring all three inside a living, spatial constellation.*

```
┌───────────────────────────────────────────────────────────────────────────────────────────┐
│                                   [ DEMO SHOWCASE GIF ]                                   │
│                                                                                           │
│  Recommended Spec: 1200x675 GIF / MP4 Video Loop                                         │
│  Showcases: Telegram voice drop -> 3D Constellation rendering -> RAG camera auto-flight   │
└───────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 💭 The Problem: The Bookmark Graveyard

Every week, we discover incredible ideas:

* A 30-minute podcast episode listened to during a morning commute
* A complex 20-page research PDF saved to a downloads folder
* A code snippet clipped from Twitter late at night
* A spontaneous voice thought recorded on a walk

**What happens to them?**

They end up buried in static bookmark folders, forgotten phone screenshots, and unopened tabs. 80% of what we save is never seen again. Traditional note-taking tools demand manual tagging, strict folder hierarchies, and tedious copy-pasting—turning personal learning into administrative chores.

---

## 💡 Why Recall Exists

Recall was built on a simple premise: **Capturing knowledge should be effortless, and retrieving it should feel magic.**

Instead of forcing you to organize your notes, Recall processes your raw inputs in the background, extracts core concepts, and maps them mathematically into a **60 FPS 3D spatial constellation**.

When you need an answer weeks later, you don't hunt through folders. You ask Recall in plain English. Your second brain answers with precise sources and **auto-pilots the 3D camera straight to the exact node where that thought lives**.

---

## 🔄 The Recall Journey

```
    ┌─────────────┐
    │ 1. CAPTURE  │ ──► Send voice notes, links, or PDFs via Telegram or Chrome Clipper
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │2. UNDERSTAND│ ──► Automated AI summarization, OCR image parsing, and Whisper transcription
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │ 3. CONNECT  │ ──► 384-dimensional vector embeddings cluster related thoughts in 3D space
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │   4. ASK    │ ──► Conversational RAG with interactive camera auto-flight citation badges
    └──────┬──────┘
           │
    ┌──────▼──────┐
    │ 5. REMEMBER │ ──► Active recall flashcards scheduled automatically via SuperMemo SM-2
    └─────────────┘
```

---

## ☀️ A Day with Recall

> **8:15 AM — Morning Walk**  
> You record a 45-second voice note on Telegram: *"Research how pgvector HNSW index construction parameters impact search latency under concurrency."*  
> *Recall transcribes the audio via Whisper, extracts key technical entities, and embeds the thought in vector space.*

> **1:30 PM — Lunch Research**  
> You find an insightful technical paper on vector indexing while browsing on your laptop. You click the Recall Chrome extension button once.  
> *Recall extracts the page text, generates a concise summary, and connects it to your morning voice note in the 3D graph.*

> **9:00 PM — Evening Reflection**  
> You open Recall (`/map`) and type into the RAG drawer: *"What did I learn today about vector search optimization?"*  
> Recall responds with a synthesis and a citation badge `[1]`. You click `[1]`.  
> *The 3D camera smoothly flies across your constellation, zooming directly onto the node created from your morning voice note.*

> **9:05 PM — Active Retention**  
> You open `/drill`. Recall has automatically generated a flashcard testing your retention of HNSW `ef_construction` parameters. You rate your recall confidence, and SuperMemo SM-2 schedules the next review interval.

---

## 🖼️ Visual Gallery

All visual assets and interaction demos for Recall are detailed below:

| Feature / Interface | Recommended Asset Specs | Interaction Purpose |
|---|---|---|
| **3D Constellation Map** | 1920x1080 Screenshot (`/map`) | 60 FPS spatial node graph with Louvain community color clusters |
| **Glass Archive Cylinder** | 1920x1080 Screenshot (`/archive`) | 3D glass cylinder browsing with inertia scroll and tag filters |
| **Conversational RAG Drawer** | 800x450 GIF | Clicking citation `[1]` triggers smooth 3D camera flight to cited node |
| **SuperMemo SM-2 Flashcard Room** | 1920x1080 Screenshot (`/drill`) | Active recall testing room with SM-2 interval confidence ratings |
| **Telegram & Chrome Capture** | 800x450 GIF | 1-click web clipping and instant Telegram voice note processing |
| **Cognitive Bridges** | 1920x1080 Screenshot (`/bridges`) | Mind-pairing synergy score visualization and Kintsugi gold decay lines |

---

## ⚡ Feature Highlights

::: callout
### 📱 Capture Anywhere
Save ideas in seconds without context-switching.  
* **How it feels**: Send voice notes, photos of book pages, PDFs, or article links to your Telegram bot or click the Chrome sidepanel.  
* **Under the hood**: Powered by Whisper audio transcription, Hugging Face PaddleOCR, and asynchronous Upstash Redis worker queues.
:::

::: callout
### 🌌 3D Observatory
Watch your personal universe of thoughts grow.  
* **How it feels**: Walk through a spatial 3D graph of your mind (`/map`) or scroll through a glass archive cylinder (`/archive`).  
* **Under the hood**: Rendered with Three.js and React Three Fiber at 60 FPS using force-directed graph positioning and vector cosine similarity.
:::

::: callout
### 💬 Conversational RAG & Camera Flight
Ask your second brain questions and see where the answers came from.  
* **How it feels**: Type a question in plain English. Click a citation badge `[1]` in the answer, and the 3D camera pilots straight to the source item.  
* **Under the hood**: Reciprocal Rank Fusion (RRF) combining `pgvector` HNSW cosine vector search and `pg_trgm` GIN trigram text search with multi-tier LLM failover.
:::

::: callout
### 🎴 Spaced Repetition (SuperMemo SM-2)
Never forget what you save.  
* **How it feels**: Review auto-generated flashcards (`/drill`) tailored to your saved content. Rate your recall (Again, Shaky, Locked) to space out future reviews.  
* **Under the hood**: SuperMemo SM-2 interval algorithm dynamically computing ease factors and review schedules in PostgreSQL.
:::

::: callout
### 📝 Obsidian Vault Sync
Maintain total ownership over your data.  
* **How it feels**: Two-way sync your Recall knowledge base with your local Obsidian vault using standard Markdown files.  
* **Under the hood**: Open Knowledge Format (OKF) specification with YAML frontmatter metadata, supporting full ZIP import and export.
:::

---

## 🔄 Workflow Comparison

| Everyday Knowledge Capture | The Recall Experience |
|---|---|
| ❌ Bookmarks buried in unread browser tabs | ✅ 1-click capture via Telegram & Chrome extension |
| ❌ Manual tagging, categorization, and folder fatigue | ✅ Automatic AI summarization, entity extraction, and tagging |
| ❌ Keyword search fails when exact terms are forgotten | ✅ Hybrid Vector (HNSW) + Trigram (GIN) semantic search |
| ❌ Static notes that sit unread forever | ✅ Automated flashcard drills scheduled via SuperMemo SM-2 |
| ❌ Text-only answer outputs | ✅ Interactive RAG citations with 3D camera auto-flight |
| ❌ Plaintext database storage | ✅ Fernet AES-128 cryptographic encryption at rest |

---

## 🏗️ High-Level System Architecture

```mermaid
flowchart TB
    subgraph Clients["Ingestion Channels"]
        TG["Telegram Bot"]
        EXT["Chrome Extension"]
        SPA["React SPA"]
    end

    subgraph API["FastAPI Application"]
        HOOK["Webhook Handler"]
        ITEMS["API Router"]
        AUTH["Auth Router"]
    end

    subgraph Async["Background Engine"]
        REDIS["Upstash Redis Queue"]
        WORKER["Async Worker Loop"]
        SCHED["22 Scheduler Jobs"]
    end

    subgraph Data["Storage & Intelligence"]
        DB[("Neon PostgreSQL 16
(pgvector + pg_trgm)")]
        AI["AI Multi-Tier Cascade"]
    end

    TG --> HOOK
    EXT --> ITEMS
    SPA --> AUTH
    HOOK --> REDIS
    REDIS --> WORKER
    WORKER --> AI
    WORKER --> DB
    SCHED --> DB
```

> 📖 *For deep architectural specs, sequence diagrams, and DB schemas, explore the [System Architecture Guide](docs/ARCHITECTURE.md).*

---

## ⚡ Quick Start

Launch Recall locally in under 3 minutes.

### 1. Clone & Setup Backend

```bash
git clone https://github.com/PriyanshuG27/Recall.git
cd Recall/backend

# Create virtual environment
python -m venv .venv

# Activate environment (Windows: .venv\Scripts\activate | Linux/macOS: source .venv/bin/activate)
source .venv/bin/activate

# Install requirements & configure env
pip install -r requirements.txt
cp .env.example .env.local

# Start FastAPI server
uvicorn backend.main:app --reload --port 8000
```

### 2. Launch Frontend (Separate Terminal)

```bash
cd Recall/frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

> 🛠️ *For Makefile targets, testing suites, and environment details, read the [Development Guide](docs/DEVELOPMENT.md).*

---

## 📚 Technical Documentation Suite

Recall is backed by a comprehensive engineering manual inside `docs/`:

* 🚀 [System Architecture Guide](docs/ARCHITECTURE.md) — System design, sequence diagrams, and lifecycles.
* 🗄️ [Database Reference](docs/DATABASE.md) — DDL schemas, `pgvector` HNSW indexes, and production queries.
* 🔌 [API Reference](docs/API.md) — Complete specification for all 50 FastAPI REST & WebSocket endpoints.
* 🌟 [Feature Status Matrix](docs/FEATURES.md) — Feature status breakdown across production, dev, and legacy code.
* 🛠️ [Development Guide](docs/DEVELOPMENT.md) — Environment setup, `Makefile` targets, and contributor workflows.
* ☁️ [Deployment Guide](docs/DEPLOYMENT.md) — Hosting setup (Koyeb, Vercel, Modal) and 27 environment variables.
* 🛡️ [Security Architecture](docs/SECURITY.md) — Cryptography, Fernet AES-128, HMAC verification, and PII masking.
* 🧪 [Testing Strategy](docs/TESTING.md) — Test pyramid breakdown across 151 test files.
* 🤝 [Contributing Guidelines](docs/CONTRIBUTING.md) — Coding standards, workspace rules, and PR checklist.
* 📊 [Visual Diagrams Collection](docs/DIAGRAMS.md) — 10 code-derived Mermaid diagrams.
* 📋 [Architecture Decision Records (ADRs)](docs/adr/README.md) — Formal records (`ADR-001` through `ADR-006`).

---

## 🤝 Contributing

Contributions are welcome! Please review the [Contributing Guidelines](docs/CONTRIBUTING.md) before submitting pull requests.

---

## 📜 License

Recall is open-source software released under the MIT License.
