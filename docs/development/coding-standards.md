---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Coding Standards

Developers contributing to Atrium must strictly adhere to the following architectural, performance, and security constraints defined by the project workspace rules (`AGENTS.md`).

---

## 1. Architectural Rules
- **Stack Consistency**: The stack is fixed: FastAPI (backend) · React+Vite (frontend) · Neon PostgreSQL+pgvector+pg_trgm · Upstash Redis · Modal GPU · Render · Vercel. Do not introduce new libraries without explicit justification.
- **No Direct Connection Pool Imports**: Never import connection variables directly by value (`from backend.db.connection import _pool`), as it binds to `None` at load time. Instead, import the module reference and access the property dynamically:
  ```python
  import backend.db.connection as db_conn
  # Access db_conn._pool after connection setup
  ```
- **Windows Selector Loop Policy**: Standard python scripts performing asynchronous database queries on Windows must enforce the `SelectorEventLoop` policy:
  ```python
  import sys
  import asyncio
  if sys.platform == "win32":
      asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
  ```

---

## 2. Security Guards
- **Strict Parameterized Queries**: All database queries must use parameterized statements (using `%s` placeholders). Zero string interpolation into SQL is allowed.
- **Fernet Encryption at Rest**: Raw text (`raw_text`) and Google Drive tokens (`google_refresh_token`) must be Fernet-encrypted before writing to the database.
- **Scoped User Queries**: Every database select, delete, or update query targeting user items, reminders, or quizzes must include `WHERE user_id = <verified_user_id>` to prevent IDOR vulnerabilities.
- **Secure Cookies**: JWT session cookies must always be set with `httpOnly=True`, `secure=True` (in production), and `SameSite="Lax"`.
- **HMAC Comparison**: TWA headers or Telegram data signatures must be compared using `hmac.compare_digest()` to prevent timing attacks.

---

## 3. Database Constraints
- **Percent Escaping**: When executing SQL `LIKE` queries with wildcards (e.g., `LIKE 'Test%'`), you must escape the percent symbol by doubling it (`LIKE 'Test%%'`) to prevent psycopg3 formatting errors.
- **Composite Primary Keys**: Because the `items` table is partitioned by range on the creation date, it uses a composite primary key `(id, created_at)`.
- **Foreign Keys**: Standard foreign keys pointing to the partitioned `items` table are not supported in PostgreSQL. Retain reference mapping using basic integer columns and handle deletes using Pl/pgSQL triggers (`cascade_delete_item_chunks()`).

---

## Evidence & Inspected Files
This document was generated from:
- `.agents\AGENTS.md`
  - Project level architectural and security guidelines.
- `backend\db\connection.py`
  - Connection pool configuration, dynamic imports, and connection bindings.
- `backend\db\schema.sql`
  - Table models, partitioning composite keys, and cascade delete Pl/pgSQL trigger definitions.
