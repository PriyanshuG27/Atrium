<div align="center">

# ✦ Recall — Personal Knowledge OS & 3D Observatory

*"Your second brain, connected. Forward anything. Find everything."*

---

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.111+-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-18.3-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-6.4-646CFF?style=for-the-badge&logo=vite&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Three.js](https://img.shields.io/badge/Three.js-R3F-000000?style=for-the-badge&logo=three.js&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/Neon_PostgreSQL-pgvector-4169E1?style=for-the-badge&logo=postgresql&logoColor=white)
![Upstash](https://img.shields.io/badge/Upstash-Redis_Queue-00E599?style=for-the-badge&logo=redis&logoColor=white)
![OpenRouter](https://img.shields.io/badge/OpenRouter-GPT--OSS-6566F1?style=for-the-badge)
![NVIDIA](https://img.shields.io/badge/NVIDIA-NIM_API-76B900?style=for-the-badge&logo=nvidia&logoColor=white)
![Groq](https://img.shields.io/badge/Groq_API-Qwen_/_GPT--OSS-FF6C37?style=for-the-badge)
![Gemini](https://img.shields.io/badge/Google_Gemini-3.1_Flash_Lite-8E75B2?style=for-the-badge&logo=google&logoColor=white)

</div>

---

## 🧭 What is Recall?

**Recall** is an AI-powered personal knowledge management system presented as a live **3D Observatory Environment**. 

Whether it is a voice note recorded on the move, a multi-page PDF document, an image screenshot, an Instagram reel, or an Obsidian Vault export — Recall ingests, transcribes, categorizes, embeds, and connects every piece of information into a dynamic 3D mind map.

---

## 🌟 Comprehensive Feature Set

### 🤖 1. Multi-Task AI Cascade Engine (`backend/services/ai_cascade.py`)
Recall implements task-specific provider fallback cascades with automatic failover, anti-thinking XML sanitization, and Dead Letter Queue recovery:

#### A. Document Ingestion & Summarization Cascade (`_run_summary_cascade`)
* **Tier 1 — Modal Serverless GPU (`_call_modal_summary`)**: Self-hosted GPU endpoint (`pri27--llama-summary.modal.run/summarize`) executing Llama 3 70B Instruct for high-speed document summarization.
* **Tier 2 — Groq API Model Rotation (`_call_groq_summary`)**: Multi-model rotation across `qwen/qwen3.6-27b` ➔ `openai/gpt-oss-120b` ➔ `openai/gpt-oss-20b` with prompt token budget calculation (`min(2048, max(512, 7400 - prompt_tokens))`) and unclosed `<think>` tag truncation recovery.
* **Tier 3 — Google Gemini API (`_call_gemini_summary`)**: `gemini-3.1-flash-lite` `v1beta` endpoint execution with `responseMimeType="application/json"` structured output.
* **Tier 4 — Bookmark & Dead Letter Queue (DLQ)**: If all summary tiers fail, item is saved as a bookmark item and task payload is written to `dead_letter_queue` for admin retry.

#### B. Conversational RAG & Assistant Cascade (`answer_question` & `answer_graph_question`)
* **Tier 1 — OpenRouter API (`_call_openrouter_rag`)**: Primary RAG model using `openai/gpt-oss-120b:free`.
* **Tier 2 — NVIDIA NIM API (`_call_nvidia_rag`)**: Secondary RAG fallback using `meta/llama3-70b-instruct` on NVIDIA NIM infrastructure.
* **Tier 3 — Google Gemini API (`_call_gemini_llm`)**: `gemini-3.1-flash-lite` conversational execution.
* **Tier 4 — Modal GPU & Groq Fallbacks**: `_call_modal_rag` (`pri27--llama-summary.modal.run/rag`) & `_call_groq_llm`.

#### C. Voice Note Speech-to-Text (`transcribe`)
* **Tier 1 — Modal GPU Whisper (`_call_modal_transcribe`)**: `pri27--llama-summary.modal.run/transcribe`.
* **Tier 2 — Groq API Whisper (`_call_groq_transcribe`)**: Primary `whisper-large-v3-turbo` with automatic fallback to `whisper-large-v3`.
* **Tier 3 — Gemini Audio (`_call_gemini_transcribe`)**: Direct multimodal audio processing.

#### D. Specialized Intelligence Modules
* **Genre-Adaptive Summary Templates (Variants A–F)**:
  - **Variant A (Academic/Research)**: Abstract, Methodology, Key Findings with LaTeX math (`\(x^2\)` / `\[E=mc^2\]`), Critical Implications.
  - **Variant B (Business/Financial)**: Executive Overview, Key Metrics, Strategic Insights & SWOT, Actionable Recommendations.
  - **Variant C (Technical/Dev Docs)**: System Overview, Setup & Installation, Code Snippets (` ```python `), Warnings & Troubleshooting.
  - **Variant D (Legal/Contracts)**: Document Purpose & Parties, Core Obligations, Key Dates & Deadlines, Liabilities & Risks.
  - **Variant E (General/Creative/Articles)**: Main Idea, Core Themes & Highlights, Key Takeaways.
  - **Variant F (Social Media & Video)**: Core Hook, Practical Highlights & Tools, Call to Action.
* **Phonetic Brand & Entity Sanitization (`sanitize_transcript`)**: LLM-based transcript correction replacing misheard audio terms (e.g. `Mobin` ➔ `Mobbin`, `Heikey` ➔ `Haikei`, `Aceternity` ➔ `Aceternity UI`, `shad cn` ➔ `shadcn/ui`, `tail wind` ➔ `Tailwind CSS`, `framermotion` ➔ `Framer Motion`, and `TestSprite`).
* **Strict Tension Insight Engine (`generate_insight`)**: Evaluates conceptual tensions between items saved weeks apart (Groq ➔ Gemini). Enforces `NO_GENUINE_TENSION` output to prevent false/forced metaphorical connections.
* **8 Psychological Mood Angles (`MOODS`)**: Generates targeted follow-up questions across 8 contextual categories (`curiosity`, `timing`, `future`, `friction`, `identity`, `connection`, `stakes`, `surprise`).
* **Prompt Injection Shield (`check_prompt_injection`)**: Security layer filtering XML breakout tags (`</user_query>`), code block escapes (` ``` `), system role mimicry (`system:`), and prompt override keywords.

---

### 🎨 2. UI Observatory Rooms (`frontend/src/App.jsx`)
Recall features 5 primary application rooms with Cyber-Noir styling:
* **Map Room (`/map`)**: Interactive Mind Map Canvas (`MapCanvas.jsx`) with 2D/3D force-directed node layouts, cluster tags, citation flares, and search overlays.
* **Archive Room (`/archive`)**: 3D Glass Archive Cylinder View (`ArchiveCylinder.jsx` / `ArchiveCard.jsx`) for browsing saved items with smooth inertia scroll physics and category filters.
* **Drill Room (`/drill`)**: Spaced repetition active recall drill room with flashcards (`TransmissionCard.jsx`), SuperMemo SM-2 quality ratings, `StreakBadge`, `DrillProgress`, and `DrillSummary`.
* **Profile Room (`/profile`)**: Cognitive profile room with mind portrait pulse score (`/api/pulse`), radar chart distribution, milestone unlocks, and GDPR streaming export.
* **Settings Room (`/settings`)**: Configuration panel (`SettingsPanel.jsx`) with Telegram bot pairing, Google Drive OAuth connect, timezone management, and account deletion.

---

### 🔍 3. Interactive RAG Citations (Camera Auto-Flight)
* **Smart Citation Badges**: AI Assistant responses in `ChatDrawer.jsx` render clickable citation badges (`[1]`, `[2]`).
* **Auto-Flight Camera Transform**: Clicking any citation badge automatically switches to Map view (`/map`), smoothly translates and scales the camera matrix to $k = 1.35$ centered on the cited item, selects the node, highlights adjacent connection lines, and animates a 3-second golden aura flare ring.

---

### 📥 4. Multi-Format & Multi-Source Ingestion Pipeline
* **Telegram Bot (`@RecallBrainBot`)**: Ingest text, voice notes, audio files, images, PDFs, URLs, and geographical locations.
* **Voice Note Transcription**: Automated speech-to-text using Whisper for `.ogg`, `.mp3`, `.wav`, and `.m4a` files.
* **Image OCR Preprocessing**: Image contrast enhancement (Pillow 2.0x, grayscale conversion, sharpening) followed by Tesseract OCR text extraction for screenshots and documents.
* **PDF Document Ingestion**: Automatic PDF text extraction via `pdfplumber` / `PyPDF2` chunking with summary and embedding generation.
* **Rich Media & Video Scraping**: Extract YouTube and Instagram reel metadata via Cobalt API with OpenGraph HTML fallback scraping.
* **Chrome Extension & Web Clipper**: Sidepanel popup (`ExtensionPopup.jsx`) and background service worker (`background.js`) for 1-click web clipping, URL check (`/api/extension/check`), and AI tag suggestions (`/api/extension/suggest_tags`).
* **Mobile PWA Web Share Target (`/api/share-target`)**: Native share sheet integration allowing users to tap "Share via Recall" directly from iOS / Android apps.

---

### 📦 5. Obsidian Vault Import & Export (OKF Standard)
* **Obsidian Vault Export (`GET /api/export/zip`)**: Generates and downloads a pre-packaged ZIP containing all user notes formatted as Open Knowledge Format (OKF) Markdown files with YAML frontmatter, tags, and wiki-links (`[[link]]`).
* **Obsidian Vault Import (`POST /api/import/zip`)**: Upload an Obsidian Vault ZIP archive to automatically parse frontmatter, extract text, generate embeddings, and construct knowledge graph edges.

---

### 📂 6. Google Drive Sync Integration
* **Google Doc Synchronization (`POST /api/drive/sync`)**: One-click sync exported items directly into Google Drive as structured Google Docs using OAuth `drive.file` scope.
* **Account Disconnect (`DELETE /api/drive`)**: Secure token revocation and account unbinding.

---

### ⏰ 7. Spaced Repetition (SuperMemo SM-2) & Active Recall
* **SuperMemo SM-2 Quiz Engine (`/quizzes`)**: Daily multiple-choice and flashcard quiz generation (`/drill`) using SuperMemo SM-2 scheduling (`interval`, `repetition`, `easiness_factor`).
* **Streak & Accuracy Tracking**: Real-time streak tracking (`StreakBadge.jsx`), quiz accuracy stats (`QuizStatsPanel.jsx`), and review history graphs.

---

### 📊 8. Cognitive Mind Portrait & Pulse Metrics
* **Cognitive Pulse Score (`GET /api/pulse`)**: Real-time calculation of cognitive velocity, radar chart distribution, and interest metrics.
* **Node Milestone Unlocks (`GET /api/user/milestones`)**: Unlocks badges and visual rewards as knowledge node counts grow (10, 50, 100 nodes).
* **Self-Description Statement (`POST /api/user/self-description`)**: Save personal cognitive focus areas to tailor AI summaries.

---

### 📍 9. Passive Context & Day 1–5 Onboarding
* **Passive Context Ingestion (`compute_passive_context`)**: Passive tracking of user posting frequency, dominant topics, and review habits without manual input.
* **Location Timezone Auto-Detection**: Telegram location updates auto-calculate timezone offset via `round(lon / 15.0 * 2) / 2` and update user preferences.
* **Day 1–5 Onboarding State Machine**: Guided onboarding sequence leading users from bot pairing to their first mind map exploration and active recall quiz.
* **Silent User Re-Engagement**: Automated cron scanner triggering subtle Telegram nudge notifications for dormant users with pending reviews.

---

### 🤝 10. Telegram Thought-Compatibility Game (`/match`)
* **5-Question Compatibility Quiz**: Interactive Telegram command `/match` presenting 5 thought-provoking questions.
* **Referral Link & Synergy Scoring**: Generates custom referral link (`https://t.me/RecallBot?start=match_{user_id}`), matches answers with friends, and calculates tag synergy percentage scores.

---

### 🎵 11. Cybernetic Audio & Micro-Animations
* **AudioEngine Synthesizer (`AudioEngine.js`)**: Web Audio API synthesizer triggering room transition sounds, node selection clicks, and completion chimes.
* **Custom Cyber Cursor (`CustomCursor.jsx`)**: Glowing cursor dot + lag flare ring with smooth velocity physics (`useMouseVelocity.js`).
* **Glitch Text Effects (`GlitchText.jsx`)**: Cyber-noir typography animations for room headers and status alerts.
* **Floating PWA Banner (`PWAInstallBanner.jsx`)**: Install prompt banner with gold monogram logo and visit counter tracking.

---

### ⚡ 12. Hybrid Search, Streaming Export & Security
* **Hybrid Vector & Trigram Search**: HNSW cosine similarity vector search (`< 10 ms`) combined with GIN trigram text search (`< 5 ms`) on Neon PostgreSQL.
* **Command+K Global Finder (`SearchOverlay.jsx`)**: Instant modal search with keyboard shortcuts (`Ctrl+K` / `Cmd+K`), category filtering, and direct node jumping.
* **GDPR Streaming Data Export (`GET /api/export`)**: Streaming JSON/Markdown export endpoint for complete data portability.
* **Live WebSocket Channel (`WebSocket /api/ws`)**: Authenticated real-time WebSocket connection for live mind map updates and status notifications.
* **Security & Encryption**: 100% parameterised SQL queries (zero string interpolation) and Fernet encryption at rest (`gAAAAA...`) for sensitive content and OAuth tokens.

---

## 🏗️ System Architecture

```mermaid
graph TB
    subgraph INGESTION["📡 Ingestion Channels"]
        TG["🤖 Telegram Bot<br/>@RecallBrainBot"]
        EXT["🔌 Chrome Extension<br/>Web Clipper"]
        SHARE["📱 Mobile PWA<br/>Web Share Target"]
        ZIP["📦 Obsidian Vault<br/>ZIP Import"]
    end

    subgraph BACKEND["⚙️ FastAPI Backend  :8000"]
        API["API Gateway<br/>JWT / HMAC Auth"]
        TRACER["X-Request-ID<br/>Tracing Middleware"]
        LIMITER["Upstash Redis<br/>Sliding Rate Limiter"]
        WS["WebSocket Server<br/>/api/ws"]
    end

    subgraph QUEUE["🔄 Background Worker Pipeline"]
        REDIS["Upstash Redis Queue"]
        WORKER["Worker Process<br/>worker.py"]
        DLQ["Dead Letter Queue<br/>DLQ Admin Retry"]
    end

    subgraph AI_CASCADE["🧠 Multi-Task AI Cascade Engine (ai_cascade.py)"]
        RAG["RAG Answers:<br/>OpenRouter ➔ NVIDIA NIM ➔ Gemini ➔ Modal ➔ Groq"]
        SUM["Summarization:<br/>Modal GPU ➔ Groq Rotation ➔ Gemini"]
        STT["Voice STT:<br/>Modal Whisper ➔ Groq Whisper ➔ Gemini Audio"]
        VISION["Vision Caption:<br/>Gemini 3.1 Flash Lite"]
    end

    subgraph STORAGE["🗄️ Database & Vector Index"]
        NEON[("Neon PostgreSQL<br/>pgvector + pg_trgm")]
        HNSW["HNSW Cosine Index<br/>Vector Search < 10ms"]
        GIN["GIN Trigram Index<br/>Text Search < 5ms"]
    end

    subgraph FRONTEND["🎨 3D Observatory SPA  :3000"]
        MAP["🗺️ Interactive Map Room<br/>MapCanvas.jsx (/map)"]
        CYLINDER["🏛️ Glass Archive Cylinder<br/>ArchiveCylinder.jsx (/archive)"]
        ASSISTANT["💬 AI Assistant & Citations<br/>ChatDrawer.jsx"]
        DRILL["🧠 Active Recall & SM-2<br/>Drill.jsx (/drill)"]
        PULSE["📊 Cognitive Profile & Pulse<br/>Profile.jsx (/profile)"]
    end

    TG & EXT & SHARE & ZIP --> API
    API --> TRACER --> LIMITER --> REDIS
    API --> WS
    REDIS --> WORKER
    WORKER --> DLQ
    WORKER --> RAG & SUM & STT & VISION
    WORKER --> NEON
    NEON --> HNSW & GIN
    API --> FRONTEND
    MAP & CYLINDER & ASSISTANT & DRILL & PULSE --> FRONTEND
```

---

## 🔄 Request Lifecycle: Ingestion to 3D Mind Map

```mermaid
sequenceDiagram
    participant User as 👤 User / Telegram / PWA
    participant API as ⚙️ FastAPI Gateway
    participant Queue as 🔄 Upstash Redis Queue
    participant Worker as 🛠️ Background Worker
    participant AI as 🧠 AI Cascade (Modal/Groq/Gemini/OpenRouter/NVIDIA)
    participant DB as 🗄️ Neon PostgreSQL
    participant FE as 🎨 3D Observatory SPA

    User->>API: Sends Voice Note / Link / Text / Obsidian ZIP
    API->>API: Validate TWA HMAC / JWT Cookie (< 50 ms)
    API->>Queue: Enqueue ingestion task (X-Request-ID)
    API-->>User: HTTP 200 OK ACK (< 50 ms)

    Queue->>Worker: Dequeue task
    Worker->>Worker: OCR / Whisper / Web Scraping / ZIP Parsing
    Worker->>AI: Execute AI Cascade (Summary + Key Themes)
    AI-->>Worker: Structured Markdown & Embeddings (1536-dim)
    Worker->>DB: Encrypt raw text (Fernet) & Store Item + HNSW Vector
    Worker->>DB: Compute graph edge connections (Cosine > 0.75)

    User->>FE: Opens 3D Observatory (/map)
    FE->>API: GET /api/graph
    API->>DB: Query nodes & edges (WHERE user_id = verified)
    DB-->>API: Graph JSON data
    API-->>FE: Render 3D Constellation Nodes & Edges (60 FPS)
```

---

## 🧠 AI Cascade Flowcharts

### 1. Ingestion Summarization Flowchart (`_run_summary_cascade`)
```mermaid
flowchart LR
    A["📥 Ingested Media\nText / Voice / Image / PDF / Vault"] --> B{"Tier 1: Modal GPU\nllama-summary.modal.run"}
    B -->|"Success"| E["Extract Metadata &\nGenerate Summary"]
    B -->|"Failure / Timeout"| C{"Tier 2: Groq Rotation\nqwen3.6-27b / gpt-oss-120b"}
    C -->|"Success"| E
    C -->|"Failure / 429 Rate Limit"| D{"Tier 3: Gemini\n3.1-flash-lite"}
    D -->|"Success"| E
    D -->|"Failure"| F["Tier 4: Bookmark & DLQ\nTask saved for retry"]
    E --> G["Phonetic Brand Repair\ne.g. Mobbin, Haikei, TestSprite"]
    G --> H["OpenAI text-embedding-3-small\n1536-dim Vector"]

    style A fill:#1a1a2e,color:#e0e0e0
    style B fill:#16213e,color:#e0e0e0
    style E fill:#0f3460,color:#e0e0e0
    style F fill:#581845,color:#e0e0e0
```

---

### 2. Conversational RAG & Assistant Flowchart (`answer_question`)
```mermaid
flowchart LR
    Q["💬 User RAG Query\nvia ChatDrawer"] --> R1{"Tier 1: OpenRouter\ngpt-oss-120b:free"}
    R1 -->|"Success"| ANS["Synthesized Answer\n+ Citation Badges"]
    R1 -->|"Failure"| R2{"Tier 2: NVIDIA NIM\nllama3-70b-instruct"}
    R2 -->|"Success"| ANS
    R2 -->|"Failure"| R3{"Tier 3: Gemini\n3.1-flash-lite"}
    R3 -->|"Success"| ANS
    R3 -->|"Failure"| R4{"Tier 4: Modal / Groq\nFallback"}
    R4 -->|"Success"| ANS

    style Q fill:#1a1a2e,color:#e0e0e0
    style R1 fill:#16213e,color:#e0e0e0
    style ANS fill:#0f3460,color:#e0e0e0
```

---

## 📦 Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Backend Framework** | FastAPI (Python 3.11+) | Asynchronous REST API & Telegram Webhook receiver |
| **Frontend Framework** | React 18 + Vite 6 | Single-Page Application with custom hooks |
| **3D Rendering** | Three.js + React Three Fiber | 60 FPS 3D Observatory Mind Map & Glass Archive Cylinder |
| **Database** | Neon PostgreSQL | Managed Postgres with `pgvector` & `pg_trgm` extensions |
| **Vector Index** | HNSW Cosine Similarity | Sub-10ms vector similarity retrieval ($m=16, ef=64$) |
| **Background Queue** | Upstash Redis | Asynchronous ingestion worker queue |
| **AI Processing** | Modal GPU + Groq + Gemini + OpenRouter + NVIDIA NIM | Task-specific multi-tier LLM cascade, Whisper voice, & OCR |
| **Audio Synthesizer** | Web Audio API (`AudioEngine.js`) | Cybernetic room transition & interaction sound effects |
| **Testing Frameworks** | Pytest + Vitest + k6 | Backend unit/integration tests & Frontend component tests |

---

## 🚀 Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+
- Neon PostgreSQL database instance with `pgvector` enabled
- Upstash Redis account

### 1. Clone Repository

```bash
git clone https://github.com/PriyanshuG27/Recall.git
cd Recall
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv .venv
.venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Configure environment variables
cp .env.example .env.local

# Run FastAPI backend server
uvicorn backend.main:app --reload --port 8000
```

---

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start Vite dev server
npm run dev
```

> 🌐 **App live at** `http://localhost:3000`

---

## 🧪 Testing & Quality Verification

```bash
# Run Backend Pytest Suite (525 Passed, 0 Failed, 62.11% Coverage)
.venv\Scripts\pytest backend/tests/

# Run Frontend Vitest Suite (199 Passed, 0 Failed, 75.26% Coverage)
npm --prefix frontend test

# Run Production Smoke Test
python backend/scripts/smoke_test.py --api-url http://localhost:8000
```

---

## 📚 Technical Documentation

- 🚀 [Deployment & Environment Setup Guide](file:///d:/Recall/docs/DEPLOYMENT.md)
- 🔄 [CI/CD Pipeline Architecture](file:///d:/Recall/docs/CI_CD_PIPELINE_GUIDE.md)
- 🛡️ [Security Scan & Hardening Report](file:///d:/Recall/docs/SECURITY_SCAN_REPORT.md)
- ⚡ [Performance & Load Benchmark Audit](file:///d:/Recall/docs/PERFORMANCE_BENCHMARKS.md)
- 📋 [Manual UI Verification Guide](file:///d:/Recall/docs/MANUAL_VERIFICATION_RECALL_EVOLUTION.md)

---

<div align="center">

Built with ❤️ for frictionless knowledge capture and 3D exploration.

</div>
