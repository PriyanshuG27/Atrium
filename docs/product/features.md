---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Features Matrix

Atrium supports multiple capture mechanisms, background pipelines, and dashboard rooms. This matrix details the status and technical specifics of each capability.

---

## 1. Ingestion & Capture Capabilities

### 📱 Telegram Bot Ingestion `[Stable]`
- **Description**: Users send signals directly to the bot.
- **Processing Details**: Supports text notes, voice audio, web URLs, and media documents. It yields a fast HTTP response, delegating processing to Redis queue workers.

### 🎙️ Audio Transcription `[Stable]`
- **Description**: Transcribes voice notes into text.
- **Processing Details**: Utilizes Groq Whisper API to yield text transcripts. Phonetic sanitization is applied to filter transcript artifacts.

### 🖼️ Optical Character Recognition (OCR) `[Stable]`
- **Description**: Extracts text from uploaded images and PDF documents.
- **Processing Details**: NVIDIA NIM API acts as the primary OCR scanner. If confidence checks fail, it falls back to Gemini 2.5 Flash API.

### 📄 PDF Document Chunking `[Stable]`
- **Description**: Ingests, parses, and splits PDF documents.
- **Processing Details**: PyMuPDF extracts text. Chunks are split into configured segments and indexed in the `item_chunks` table for granular retrieval.

### 🔗 Web Clipper / URL Ingester `[Stable]`
- **Description**: Bookmarks article and media links.
- **Processing Details**: Extracts title, main body text, and OpenGraph tags. YouTube links are processed to capture video transcripts. Social media URLs are routed via Cobalt API wrappers.

---

## 2. Capabilities & Features Matrix

| Feature | Status | In-Code Details |
|---|---|---|
| **3D Constellation Map** | Stable | 3D force-directed interactive node graph displaying clusters. |
| **3D Glass Cylinder Archive** | Stable | Carousel review room using mouse drag and wheel scroll. |
| **Active Recall Quizzes** | Stable | Generates flashcards with SM-2 confidences (Again, Shaky, Locked). |
| **Hearth Partnerships** | Stable | Shared dashboards showing partners' streaks and active hubs. |
| **Obsidian Vault Sync** | Stable | Vault import/export utilizing standard OKF ZIP archives. |
| **Google Drive Sync** | Stable | Syncs files from linked Drive folders. |
| **Scheduled Reminders** | Stable | Dispatches scheduled Telegram alerts from the database. |
| **Branching Workspaces** | Experimental | POC for branching node workspaces accessible under `/poc/branching`. |
| **Flat Feed View** | Deprecated / Archived | Legacy feed review page. Not wired into App routing. |
| **Reminders Page** | Deprecated / Archived | Standalone reminders screen. Replaced by tab in Settings panel. |

---
