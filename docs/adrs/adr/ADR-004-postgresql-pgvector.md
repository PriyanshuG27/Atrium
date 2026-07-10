# ADR-004: PostgreSQL Serverless + pgvector Unified Storage

* **Status**: Accepted
* **Deciders**: Database Architecture Team
* **Date**: 2026-07-04

## Context
Recall requires relational storage for users, quizzes, and reminders, alongside vector storage for 384-dimensional embeddings.

## Decision
We standardize on Neon PostgreSQL 16 serverless database with `pgvector` (`VECTOR(384)`) and `pg_trgm` extensions enabled. HNSW cosine indexes (`m=16, ef_construction=64`) provide sub-10ms vector retrieval. Range partitioning on `created_at` optimizes long-term query performance.

## Alternatives Considered
* **Pinecone / Weaviate + PostgreSQL**: Rejected due to dual-database synchronization issues and split transactions.

## Consequences
* **Positive**: Single ACID-compliant database for relational and vector data; unified SQL parameters.
* **Negative**: Partition PK rules require custom trigger for `item_chunks` cascade deletion (`trigger_cascade_delete_item_chunks`).

## Implementation References
* Schema: [schema.sql](../../backend/db/schema.sql)
* Connection Pool: [connection.py](../../backend/db/connection.py)
