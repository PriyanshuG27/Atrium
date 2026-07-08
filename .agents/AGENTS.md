# Workspace Rules

The following rules apply to all tasks and files in this codebase:

## ARCHITECTURE RULES
- Stack is fixed: FastAPI (backend) · React+Vite (frontend) · Neon PostgreSQL+pgvector+pg_trgm · Upstash Redis · Modal GPU · Render · Vercel.
- No new libraries without explicit justification. Prefer stdlib or already-approved packages.
- All DB queries must use parameterised statements — zero string interpolation into SQL.
- Webhook handler must return 200 to Telegram in < 50 ms. All heavy work goes to background queue.
- asyncio.Semaphore(3) caps concurrent AI tasks. Never raise this limit without justification.

## SECURITY RULES — NON-NEGOTIABLE
- TELEGRAM_BOT_TOKEN, FERNET_KEY, JWT_SECRET must NEVER appear in logs, responses, or frontend code.
- raw_text and google_refresh_token must be Fernet-encrypted before any DB write. No exceptions.
- All /api/* routes must validate either the TWA HMAC or the JWT cookie before processing.
- HMAC comparison must use hmac.compare_digest() — never == for secret comparison.
- All user data queries must include WHERE user_id = <verified_user_id> — no cross-user data access.
- Google OAuth scope must be drive.file only — never broader scopes.
- httpOnly + Secure + SameSite=Lax on all cookies.

## PERFORMANCE RULES
- Vector search target: < 10 ms (HNSW cosine, m=16, ef_construction=64).
- Text search target: < 5 ms (GIN trigram on summary column only — not raw_text).
- Canvas render target: 60 FPS at 500 nodes.
- Webhook ACK target: < 50 ms.
- Every DB query touching items must include user_id in WHERE clause (uses idx_items_user B-tree).

## TESTING RULES
- Every new function must have at least one unit test before the prompt is considered complete.
- All tests must run with zero external API calls — mock all AI tiers, Telegram API, and Redis.
- Use pytest for backend, Vitest for frontend.
- Test the failure path, not just the happy path.

## ERROR HANDLING RULES
- Every AI cascade tier must be wrapped in try/except with specific exception types.
- Dead letter queue entry must be written before the bookmark fallback item is saved.
- User-facing error messages must never expose internal error details or stack traces.
- All scheduler jobs must have misfire_grace_time=60 set.

## VERIFICATION RULES
- Always verify all changes yourself by running all automated tests and verification/execution scripts before completing a task.
- After completing any implementation or task, always provide clear, step-by-step manual verification steps for the user to verify the correctness of the changes via the UI, avoiding the use of scripts.

## STANDALONE & SCRATCH SCRIPT RULES
- **Windows Asyncio Selector Loop**: Standalone Python scripts performing asynchronous database queries on Windows must enforce the `SelectorEventLoop` policy (psycopg3 does not support the default `ProactorEventLoop` for async DB operations on Windows):
  ```python
  import sys
  import asyncio
  if sys.platform == "win32":
      asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
  ```
- **Connection Pool Import Reference**: Never import connection variables by value (`from backend.db.connection import _pool`), as it permanently binds to `None` at module load time. Instead, import the module reference dynamically:
  ```python
  import backend.db.connection as db_conn
  # Access db_conn._pool after calling open_pool()
  ```
- **Wildcard Escaping in psycopg3**: When executing SQL `LIKE` queries with wildcards (e.g., `LIKE 'Test%'`), you must escape the percent symbol by doubling it (`LIKE 'Test%%'`) to prevent psycopg3 formatting placeholder errors.
- **Partitioned Table Constraints**: Avoid setting up standard foreign key constraints targeting the `items` table on child tables since `items` is partitioned. Retain reference mapping using basic integer columns.




