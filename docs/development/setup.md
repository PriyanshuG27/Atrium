---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Local Development Setup

This guide details shortcuts, Makefile tasks, and configuration steps for local developers.

---

## 1. Quick Start Commands
Atrium uses a `Makefile` to simplify common development tasks.

| Command | Action |
|---|---|
| `make dev-backend` | Starts uvicorn backend on port 8000 with reload. |
| `make dev-frontend` | Starts react-vite dev server on port 5173. |
| `make test` | Runs backend unit tests using pytest. |
| `make schema` | Runs migrations to initialize database tables. |
| `make tunnel` | Spins up ngrok tunnel on port 8000. |
| `make fernet` | Generates a secure random 32-byte Fernet key. |
| `make jwt-secret` | Generates a 32-byte JWT secret hex. |

---

## 2. Setting Up Database Migrations
If you are initializing a database schema from scratch:
1. Configure `DATABASE_URL` in `.env.local` to point to your target PostgreSQL database.
2. Run the schema migrations target:
   ```bash
   make schema
   ```
This script runs the DDL schema commands in `backend/db/schema.sql`. It enables `vector` and `pg_trgm` extensions, creates the database tables, registers indices (HNSW/GIN), and binds Pl/pgSQL triggers to handle cascade updates.

---

## 3. Seed Testing Data
To generate mock nodes, hubs, and quizzes in your database:
```bash
python scripts/generate_test_data.py
```
This utility inserts dummy user profiles, mock PDF/image signals, active review quizzes, and links into tables to populate your spatial canvas for testing.

---

## Evidence & Inspected Files
This document was generated from:
- `Makefile`
  - Configured command shortcuts.
- `scripts\generate_test_data.py`
  - Database seed logic.
- `backend\db\schema.sql`
  - Schema configuration.
- `backend\db\connection.py`
  - Connection pool configuration and setup hooks.
