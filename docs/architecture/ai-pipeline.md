---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# AI Pipeline & LLM Cascade

Atrium processes unstructured text, audio, and visual inputs through a multi-tier, resilient AI pipeline.

---

## 1. Input Processing Modules

When raw signals are popped from the queue, they are routed through specific ingesting services:

- **Voice Notes (`backend/services/voice_ingester.py`)**: Audio files are downloaded from Telegram and sent to Groq's Whisper API using the configured model.
- **Images & Visual PDFs (`backend/services/ocr_service.py`)**: Checks for text inside uploaded graphics using NVIDIA NIM as the primary OCR engine. If confidence scores fall below threshold limits, it falls back to Gemini 2.5 Flash API.
- **PDF Documents (`backend/services/pdf_ingester.py`)**: PyMuPDF extracts text, which is parsed and chunked.
- **Web scraping (`backend/services/url_ingester.py`)**: Scrapes clean body text, titles, and metadata tags from target URLs, including YouTube transcript extraction via `yt-dlp`.

---

## 2. LLM Failover Cascade
All LLM operations (such as summarization, tag generation, query expansion, and quiz questions creation) are wrapped in a robust three-tier cascade wrapper to prevent downtime:

1. **Tier 1 (Groq API)**: Default engine targeting Groq for fast summary and entity extraction.
2. **Tier 2 (Gemini API)**: Secondary fallback targeting Gemini if Groq fails or rate limits.
3. **Tier 3 (OpenRouter API)**: Tertiary failover route using OpenRouter backend.
4. **DLQ Safeguard**: If all three AI services time out or return errors, the worker writes the task to the database `dead_letter_queue` table and executes a fallback bookmark save.

---

## 3. Embedding Generation
- **Model**: ONNX-compiled embeddings model (or a remote AI VM if configured).
- **Dimension**: Outputs **384-dimensional floating point vectors** saved in Neon PostgreSQL.
- **Reranker**: Configuration-defined Xenova cross-encoder model reranks search results.

---

## Evidence & Inspected Files
This document was generated from:
- `backend\services\ai_cascade\facade.py`
  - structured three-tier validation facade and error checks.
- `backend\worker.py`
  - Processing loops orchestrating input modules and transcription fallbacks.
- `backend\services\ocr_service.py`
  - Image OCR configurations.
- `backend\services\voice_ingester.py`
  - Voice transcribing hooks.
- `backend\services\pdf_ingester.py`
  - PDF segment parsing logic.
- `backend\services\url_ingester.py`
  - Scraper services.
