# Testing & Quality Verification Guide — Recall

This document details the automated testing framework, test coverage standards, and verification procedures across **Recall**.

---

## 1. Test Pyramid & Suite Architecture (151 Test Files Total)

The test suite is organized into 4 distinct verification layers:

| Layer | Framework | Location | File Count | Command |
|---|---|---|---|---|
| **Backend Unit & Integration** | Pytest | `backend/tests/` | **90 files** | `pytest` or `make test` |
| **Frontend Component & Context** | Vitest | `frontend/src/tests/` | **53 files** | `cd frontend && npm test` |
| **End-to-End User Journeys** | Playwright | `e2e/` | **1 file** (`auth_flows.spec.js`) | `npx playwright test` |
| **Load & Spike Benchmarks** | k6 | `backend/tests/load/` | **7 files** | `k6 run backend/tests/load/<script>.js` |

---

## 2. Backend Pytest Suite (90 Files)

* **Configuration**: `pytest.ini` (`-n 12 -W ignore --cov=backend --cov-report=term-missing`).
* **Test Isolation**: All tests run with zero external API calls by mocking AI tiers, Telegram API, and Redis connections.
* **Key Test Modules**: `test_auth.py`, `test_items.py`, `test_search.py`, `test_ai_cascade.py`, `test_worker.py`, `test_security_pen.py`.

---

## 3. Frontend Vitest Suite (53 Files)

* **Environment**: `jsdom` with setup file `frontend/src/tests/setup.js`.
* **Coverage Exclusions**: Excludes heavy 3D canvas scenes (`src/canvas/*`) and experimental pages.

---

## 4. Playwright E2E & k6 Load Suites

* **Playwright E2E**: `e2e/auth_flows.spec.js` testing WebApp login, desktop widget login fallback, token expiration, and logout.
* **k6 Load Benchmarks**: 7 load test scripts in `backend/tests/load/` evaluating search throughput (< 10ms target) and webhook spike handling (< 50ms ACK target).


---

## 🔗 Related Documentation

[README](../README.md) · [INDEX](INDEX.md) · [ARCHITECTURE](ARCHITECTURE.md) · [DATABASE](DATABASE.md) · [API](API.md) · [FEATURES](FEATURES.md)  
[DEVELOPMENT](DEVELOPMENT.md) · [DEPLOYMENT](DEPLOYMENT.md) · [SECURITY](SECURITY.md) · **TESTING** · [CONTRIBUTING](CONTRIBUTING.md) · [DIAGRAMS](DIAGRAMS.md)
