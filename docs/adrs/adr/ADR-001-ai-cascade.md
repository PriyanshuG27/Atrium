# ADR-001: Multi-Provider AI Cascade & RAG Failover Strategy

* **Status**: Accepted
* **Deciders**: Core Architecture Team
* **Date**: 2026-07-04

## Context
Recall requires high-availability LLM processing for document summarization, entity extraction, transcription, and conversational RAG Q&A. Relying on a single AI provider risks service outages, rate limit blocks, and latencies.

## Decision
We implement dedicated multi-provider failover cascades in `backend/services/ai_cascade.py`:

### 1. Content Ingestion & Summarization Cascade (`_run_summary_cascade`)
Attempts cycle dynamically through:
1. **Modal GPU**: `modal.run/summarize`
2. **Groq (3-Tier Model Rotation)**: `qwen/qwen-2.5-32b-instruct` -> `openai/gpt-oss-120b` -> `openai/gpt-oss-20b`
3. **Google Gemini**: `gemini-3.1-flash-lite`
4. **Bookmark Fallback / DLQ**: On failure, task payload writes to `dead_letter_queue` table and bookmark item is saved.

### 2. Conversational RAG Q&A Cascade (`answer_question` & `answer_graph_question`)
Attempts cycle dynamically through:
1. **OpenRouter**: `openai/gpt-oss-120b:free`
2. **NVIDIA NIM**: `meta/llama3-70b-instruct`
3. **Google Gemini**: `gemini-3.1-flash-lite`
4. **Modal / Groq**: Extended fallbacks if configured.

## Alternatives Considered
* **Single LLM Provider**: Rejected due to API rate limit risks during high ingestion bursts.
* **Local In-Process LLM**: Rejected due to high memory footprint and startup latencies in web servers.

## Consequences
* **Positive**: High availability for AI processing and zero task loss; cost optimization by leveraging low-cost tiers first.
* **Negative**: Multiple API key configurations in `backend/config.py`.

## Implementation References
* Source: [ai_cascade.py](../../backend/services/ai_cascade.py)
* Config: [config.py](../../backend/config.py)
* DLQ: [dlq.py](../../backend/services/dlq.py)
