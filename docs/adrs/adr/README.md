# Architecture Decision Records (ADR) — Recall

> **Audience**: Maintainers, System Architects, Contributors  
> **Estimated Reading Time**: 3 min  
> **Documentation Level**: Release Candidate (RC-1)

This directory contains the formal **Architecture Decision Records (ADRs)** for **Recall**. Each record documents a critical architectural decision, its context, alternatives considered, and consequences.

---

## 📋 ADR Index

| ADR ID | Title | Status | Primary Component |
|---|---|---|---|
| [ADR-001](ADR-001-ai-cascade.md) | Multi-Provider AI Cascade Failover Strategy | Accepted | `ai_cascade.py` |
| [ADR-002](ADR-002-hybrid-search.md) | Reciprocal Rank Fusion (RRF) Hybrid Search | Accepted | `search_service.py` |
| [ADR-003](ADR-003-telegram-first-ingestion.md) | Telegram-First Webhook Ingestion Architecture | Accepted | `webhook.py`, `worker.py` |
| [ADR-004](ADR-004-postgresql-pgvector.md) | PostgreSQL Serverless + pgvector Unified Storage | Accepted | `schema.sql` |
| [ADR-005](ADR-005-upstash-queue.md) | Upstash Redis Serverless Task Queue & Concurrency Capping | Accepted | `worker.py`, `redis_client.py` |
| [ADR-006](ADR-006-3d-observatory.md) | Three.js / React Three Fiber 3D Observatory Visualizer | Accepted | `Map.jsx`, `MapCanvas.jsx` |

---

## 🔗 Related Documentation

← [ARCHITECTURE](../ARCHITECTURE.md) | [INDEX](../INDEX.md) →
