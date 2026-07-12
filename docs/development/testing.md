---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Testing Strategy

Atrium has a comprehensive automated test suite to validate security, rates, RAG search, SM-2 math, and webhooks.

---

## 1. Running Tests

### Backend Test Suite (Pytest)
Ensure your virtual environment is active, then run:
```bash
# Run the entire test suite
make test

# Or run tests manually with specific flags
cd backend
pytest -v --cov=.
```
- **Configuration**: Test settings are configured in `pytest.ini`.
- **Mocks**: By default, backend tests are designed to execute with **zero external API calls**. Downstream LLM APIs (Groq, Gemini, OpenRouter), Telegram APIs, Google APIs, and Redis connections are automatically mocked out in `backend/tests/conftest.py`.

### Frontend Test Suite (Vitest)
Navigate to the frontend directory and run:
```bash
cd frontend
npm run test
```
- **Configuration**: Managed in `frontend/vitest.config.js`.
- **Scope**: Asserts React component rendering, Axios response interceptors, custom cursors, and UI state contexts.

---

## 2. In-Code Test Layout

Backend tests are organized under `backend/tests/` and cover:
- **`test_auth.py`**: Asserts JWT cookie setting, Telegram widget auth, and logout.
- **`test_ai_cascade_reliability.py`**: Verifies that when Groq fails, Gemini is hit, and when all fail, it writes to the DLQ.
- **`test_search.py`**: Validates RRF ranking logic and vector nearest-neighbor calculations.
- **`test_webhook_idempotency.py`**: Ensures duplicate Telegram updates (matching `update_id` in `processed_updates` table) are rejected to prevent duplicate queues.
- **`test_sm2.py`**: Verifies mathematical interval calculation updates based on user confidence ratings.
- **`test_rate_limiter.py`**: Asserts that requests exceeding routes sliding-window limits are blocked.

---

## Evidence & Inspected Files
This document was generated from:
- `backend\tests\conftest.py`
  - Global mock setups for external services and DB pools.
- `backend\tests\test_ai_cascade_reliability.py`
  - Assertions verifying LLM failover behaviors.
- `backend\tests\test_search.py`
  - Validations checking hybrid search query expansions and RRF formulas.
- `backend\tests\test_sm2.py`
  - Quizzes interval updates testing checks.
- `backend\tests\test_webhook_idempotency.py`
  - Duplication checks on Telegram updates.
- `pytest.ini`
  - Pytest global execution flags.
- `frontend\vitest.config.js`
  - Vitest settings.
- `frontend\package.json`
  - Node commands scripts configuration.
