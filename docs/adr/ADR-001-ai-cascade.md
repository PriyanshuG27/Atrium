# ADR-001: Multi-Provider AI Cascade Failover Strategy

* **Status**: Accepted
* **Deciders**: Core Architecture Team
* **Date**: 2026-07-04

## Context
Recall requires high-availability LLM processing for document summarization, entity extraction, and conversational RAG Q&A. Relying on a single AI provider risks service outages, rate limit blocks, and latencies.

## Decision
We implement a multi-provider failover engine (**AI Cascade**) in `backend/services/ai_cascade.py`. Summarization and extraction attempts cycle dynamically through:
1. Primary: Groq (`llama-3.3-70b-versatile`)
2. Secondary: Google Gemini (`gemini-2.5-flash`)
3. Tertiary: OpenRouter API
4. Quaternary: NVIDIA NIM API
5. Serverless Fallback: Modal GPU endpoints (`backend/modal_apps/`)

## Alternatives Considered
* **Single LLM Provider (Groq only)**: Rejected due to API rate limit risks during high ingestion bursts.
* **Local In-Process LLM**: Rejected due to high memory footprint and startup latencies in web servers.

## Consequences
* **Positive**: 99.99% availability for AI processing; cost optimization by leveraging low-cost tiers first.
* **Negative**: Multiple API key configurations required in `backend/config.py`.

## Implementation References
* Source: [ai_cascade.py](../../backend/services/ai_cascade.py)
* Config: [config.py](../../backend/config.py)
