---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Database Schema & Indexing

Atrium uses Neon PostgreSQL 16 as its primary database. It utilizes range partitioning and vector indexing to support low-latency spatial queries.

---

## 1. Table Partitioning
The primary `items` table is partitioned by range based on the creation timestamp (`created_at`):

```sql
CREATE TABLE IF NOT EXISTS items (
    id           SERIAL,
    user_id      INT REFERENCES users(id) ON DELETE CASCADE,
    source_type  VARCHAR(20) NOT NULL,
    source_url   TEXT,
    raw_text     TEXT,       -- Fernet AES-128 Encrypted
    summary      TEXT,       -- Plaintext
    title        VARCHAR(500),
    embedding    VECTOR(384),
    tags         TEXT[],
    created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);
```
- **Partitions**: Child partition tables are created automatically by the backend scheduler (e.g. `items_y2026m06`, `items_y2026m07`).
- **Composite Primary Key**: The primary key is composite `(id, created_at)` to support range partitioning.
- **Foreign Key Constraints**: Standard foreign keys pointing to partitioned tables are not supported in PostgreSQL. Therefore, tables referencing items (like `quizzes`, `item_chunks`) store `item_id` as a basic integer and enforce constraints using database level triggers.

---

## 2. Index Optimization

Atrium applies four main indexes on the `items` table to keep queries fast:

### A. B-Tree User Index (`idx_items_user`)
- **SQL**: `CREATE INDEX IF NOT EXISTS idx_items_user ON items(user_id);`
- **Purpose**: Restricts all item queries to the authenticated user.

### B. HNSW Vector Index (`idx_items_embedding`)
- **SQL**: `CREATE INDEX IF NOT EXISTS idx_items_embedding ON items USING hnsw (embedding vector_cosine_ops) WITH (m=16, ef_construction=64);`
- **Purpose**: Supports low-latency nearest-neighbor vector similarity cosine search.

### C. GIN Trigram Text Index (`idx_items_text_gin`)
- **SQL**: `CREATE INDEX IF NOT EXISTS idx_items_text_gin ON items USING gin (summary gin_trgm_ops);`
- **Purpose**: Supports performant fuzzy keyword text matches.

### D. Summary Full-Text Search Index (`idx_items_summary_fts_gin`)
- **SQL**: `CREATE INDEX IF NOT EXISTS idx_items_summary_fts_gin ON items USING gin (to_tsvector('english', COALESCE(summary, '')));`
- **Purpose**: Speeds up English stemming and full-text searches.

---

## Evidence & Inspected Files
This document was generated from:
- `backend\db\schema.sql`
  - Tables, indices, primary composite keys, and Pl/pgSQL triggers definitions.
- `backend\db\connection.py`
  - Connection pool configuration handlers.
- `backend\scheduler\scheduler.py`
  - `partition_creator` scheduler job that issues partitioning DDLs.
