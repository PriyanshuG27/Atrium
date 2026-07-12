---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Security & Cryptography Design

Atrium enforces strict data confidentiality, cryptographic verification, and observability auditing parameters to protect personal second brain information.

---

## 1. Cryptography at Rest (Fernet AES-128)
Sensitive user data must never be saved as plaintext in PostgreSQL:
- **Scope**: User credentials (such as Google Drive refresh tokens) and all raw note texts (`raw_text` in the `items` table) are encrypted.
- **Algorithm**: Fernet symmetric encryption helper wrapping AES-128 in CBC mode with HMAC-SHA256 signatures.
- **Key Vault**: Cryptographic keys are loaded from the environment variable `FERNET_KEY` and validated during the API boot cycle:
  - The key must be a valid URL-safe base64 string decoding to exactly 32 bytes.

---

## 2. Structured Log Masking & Sentry PII Filters
To prevent credentials or PII from leaking into logs or external services:
- **SecretMaskingFilter**: A custom logging filter intercepts log entries and matches standard patterns. It replaces secrets (tokens, DB strings, Fernet keys, and bot API strings) with the string `<REDACTED>`.
- **Sentry PII scrubber**: If Sentry is enabled (`SENTRY_DSN`), the app configures custom `before_send` event callbacks:
  - Recursively scrubs keys from event payloads.
  - Scrubs local variables in exception stack frames before sending data to prevent stack trace leaks.

---

## 3. Database Security Parameters
To prevent cross-user data leakage and injection attacks:
- **No String Interpolation**: All SQL queries are executed using parameterized statements (using `psycopg` placeholders `%s`). String interpolation is prohibited.
- **Strict ID Scoping**: Every database select, delete, or update query targeting items, reminders, or quizzes must include a verified user ID in its WHERE clause (e.g. `WHERE user_id = %s`).

---

## Evidence & Inspected Files
This document was generated from:
- `backend\services\encryption.py`
  - Fernet encryption and decryption functions.
- `backend\services\pii_masker.py`
  - Recursive masking logic for Sentry integration payloads.
- `backend\config.py`
  - Logging filter (`SecretMaskingFilter`) keys mappings.
- `backend\main.py`
  - Sentry before_send filters, CORS setup, and parameterized migrations.
- `backend\middleware\structured_logging_middleware.py`
  - Request logging details.
- `backend\middleware\twa_auth.py`
  - Secure string validation checks.
- `backend\db\schema.sql`
  - Indexing scoping.
