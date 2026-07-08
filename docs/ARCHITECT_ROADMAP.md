# Recall Architectural Roadmap

This document outlines the priority development phases, guidelines, and restrictions for stabilizing and scaling **Recall**.

---

## Roadmap Overview

```text
Phase 1
Core Completion
│
├── Branching
├── AI Cascade
├── Cleanup
├── Refactor
└── Stable Architecture
        │
        ▼
Phase 2
Knowledge Quality (Intelligence Upgrade)
│
├── Unstructured
├── Instructor
├── Better Chunking
├── Reranker
├── Parent Retrieval
├── Metadata Filtering
├── Context Compression
├── Entity Extraction
└── Better Search
        │
        ▼
Phase 3
Production Hardening
│
├── Security
├── Logging
├── Analytics
├── Testing
├── Performance
├── Sentry
├── Monitoring
├── Deployment
└── Backups
        │
        ▼
Release Candidate
│
├── Internal Testing
├── Bug Fixes
├── Performance Validation
└── Final QA
        │
        ▼
Production Launch
        │
        ▼
Phase 4
Knowledge Evolution
        │
        ▼
Phase 5
Scale & Infrastructure
```

## Strategy & Rationale
We perform **intelligence and quality upgrades first (Phase 2) before production hardening (Phase 3)** because production hardening is easier, cleaner, and more stable when the core intelligence layer is already in place.
* **Avoid Analytics Rework**: Introducing a reranker, semantic chunking, or custom search scoring first means we only instrument analytics once for the actual production pipeline.
* **Avoid Logging Rework**: Implementing structured logging across ingestion pipelines is cleaner when we don't have to rewrite the ingestion and parsing pipeline right after.
* **Avoid Security Rework**: Introducing structured extraction and parsing logic before hardening ensures the PII masking and security boundaries are designed around the final data shape.

---

## Phase 1 — Core Completion ✅
Finish what already exists to establish a stable architecture.
* **Branching**: Branching logic fully integrated into the backend core services.
* **AI Cascade**: Legacy paths, duplicate executions, duplicate planners, and dead code removed. All queries routed through the unified cascade router.
* **Cleanup & Refactor**: Eliminate duplicate services, old prompts, unused models, duplicate websocket code, and old retry logic.
* **Stable Architecture**: Achieve architectural consistency across all modules.

---

## Phase 2 — Intelligence Upgrade (Knowledge Quality) 🧠
Add improvements that dramatically increase Recall's quality **without changing the product or introducing new user-visible features**.

### 1. Structured Output & Retrieval
* **Instructor**: Integrate Instructor/Outlines for structured outputs.
* **Better JSON Enforcement**: Ensure robust, parseable JSON schema enforcement.
* **Metadata Extraction**: Enhance extraction of document properties, dates, authors, and source tags.

### 2. Document Understanding
* **Unstructured / Parsers**: Integrate robust PDF, HTML, DOCX, and email parsing pipelines.

### 3. Retrieval & Scoring
* **Reranker**: Integrate a high-quality reranking model (Mixedbread or BGE).
* **Metadata Filtering**: Enable precise, database-level metadata filters.
* **Parent-Child Retrieval**: Store small chunks for search but retrieve parent chunks for context.
* **Context Compression**: Minimize tokens sent to the LLM.
* **Better Hybrid Scoring**: Refine fusion of vector and text scores.

### 4. Advanced Chunking
* **Semantic Chunking**: Chunk documents based on semantic shifts.
* **Hierarchical / Adaptive Chunking**: Dynamically adjust chunk sizes.

### 5. Knowledge Graph Quality
* **Entity & Relationship Extraction**: Extract key nodes and edges to build clean, localized semantic links.
* **Hub Detection**: Detect high-centrality concepts to link items.

### 6. Search
* **BM25 Tuning**: Enhance lexical search.
* **Vector Fusion**: Optimize reciprocal rank fusion (RRF) parameters.
* **Query Rewriting**: Standardize and expand search queries before execution.

---

## Phase 3 — Production Hardening 🔒
Focus on making Recall safe, observable, and reliable based on the finalized intelligence pipeline.

### 1. Security
* **TWA HMAC Verification**: Validate Telegram HMAC.
* **Encryption**: Fernet-encrypt sensitive tokens (`google_refresh_token`, `raw_text`).
* **Sensitive Document Detection / PII Masking**: Prevent sending sensitive data to external AI models.

### 2. Logging & Analytics
* **Structured Logging**: Implement `structlog` with unified request/user/task context.
* **PostgreSQL Analytics**: Product, AI, and cost analytics tracked inside PostgreSQL.

### 3. Observability & Performance
* **Sentry**: Crash and error reporting.
* **Monitoring & Alerts**: API/Database query latency, queue depth monitoring.
* **Performance Tuning**: Ensure vector search (< 10ms) and text search (< 5ms) targets.

### 4. Deploy & Backups
* **Deployment Automation**: Configs for Vercel, Render, Modal.
* **Backup & Rollback Procedures**: Automated database backups and zero-downtime rollback scripts.

### 5. Infrastructure & Concurrency
* **Decouple Web Server and Task Worker (Fixes Event Loop Freezes)**:
  * Modify `backend/main.py` to disable background worker startup inside the FastAPI lifespan.
  * Add a standalone worker entrypoint in `backend/worker.py` (`if __name__ == "__main__": asyncio.run(start_worker_task())`).
  * Run them as separate OS processes in production (e.g. Process 1: Web Server via Uvicorn; Process 2: Worker Service via Python).
  * *Result:* CPU-bound queue tasks will never block the API server's event loop, keeping Webhook ACKs and WebSockets fully responsive.
* **Native TCP Redis Protocol (Fixes Connection Latency)**:
  * Replace the `upstash-redis` HTTP REST client with the standard `redis` library.
  * Connect using the native TCP/SSL protocol (`rediss://` format).
  * Use an asyncio connection pool (`import redis.asyncio as aioredis; redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)`).
  * *Result:* Redis latency drops from 20–50ms (HTTP REST) to 1–3ms (TCP), making rate-limiting and queueing instantaneous.

---

## Release Candidate 🧪
Deploy internally and validate correctness.
* **Internal Testing**: Dogfood the app internally.
* **Bug Fixes**: Resolve edge cases uncovered during active use.
* **Performance Validation**: Load and stress test API endpoints.
* **Final QA**: Ensure all tests run with 100% success rate.

---

## Production Launch 🚀
Ship Recall to production users.

---

## Phase 4 — Knowledge Evolution 🧬
Evolve the system to support advanced memory and traversal capabilities.
* **Typed Memory**: Segment memory into working, episodic, and semantic layers.
* **Memory Consolidation**: Implement background consolidation of old memories.
* **Better Graph Traversal & GraphRAG**: Local and global query answering over the knowledge graph.
* **Evaluation Pipelines**: Continuous integration testing for retrieval and generation quality (e.g., Ragas/DSPy).
* **Knowledge Health Scoring**: Periodically check for broken links and outdated information.

---

## Phase 5 — Scale & Infrastructure ⚙️
Only after users and metrics justify it:
* **Vector & Graph DBs**: Transition to standalone Qdrant or Neo4j.
* **Orchestration**: Implement LangGraph or advanced worker setups.
* **Observability**: OpenTelemetry instrumentation.
* **Analytics**: Move analytics to ClickHouse.
* **Infrastructure**: Migrate to Kubernetes or distributed queues if needed.

---

## Excluded Frameworks & Tools (DO NOT USE)
Do not spend time adopting:
* **Qdrant / Neo4j / Memgraph / FalkorDB** (until Phase 5; keep standard PGvector + trigrams)
* **Mem0 / Haystack / LangChain / LlamaIndex / CrewAI / AutoGen / Semantic Kernel**
* **ClickHouse / Kafka / Kubernetes** (until Phase 5)
