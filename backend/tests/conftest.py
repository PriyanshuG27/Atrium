"""
backend/tests/conftest.py
==========================
Shared pytest fixtures and configuration for the Recall test suite.

Ensures:
  - sys.path is set so `from backend.x import y` works from any CWD.
  - A valid mock environment is injected for all tests that need settings.
  - All external calls (DB, Redis, AI APIs) are mocked — zero network calls in CI.
"""

import sys
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Path setup — add project root to sys.path so `backend.*` imports resolve
# ---------------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parents[2]  # D:\Recall
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


import os

# ---------------------------------------------------------------------------
# Shared mock environment
# ---------------------------------------------------------------------------
VALID_ENV = {
    "TELEGRAM_BOT_TOKEN": "1234567890:ABCdefGHIjklmnoPQRstuvwxyZ123456789",
    "DATABASE_URL": "postgresql://user:pass@localhost:5432/db?sslmode=require",
    "UPSTASH_REDIS_REST_URL": "https://dev-recall-redis.upstash.io",
    "UPSTASH_REDIS_REST_TOKEN": "dev_upstash_redis_token",
    # Valid Fernet key (32 bytes decoded from URL-safe base64)
    "FERNET_KEY": "yF4P-W965hF17Bq_Q7g_oG5l8S631P9_9z-d8v7d8sA=",
    "JWT_SECRET": "8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b",
    "WEBSITE_URL": "http://localhost:5173",
    "ENV": "test",
    "ENABLE_RERANKING": "False",
}

# Pre-populate environment before any backend imports are evaluated
for k, v in VALID_ENV.items():
    os.environ.setdefault(k, v)
    os.environ[k] = v


@pytest.fixture()
def mock_env(monkeypatch):
    """
    Inject a complete valid environment for tests that need settings to load.
    Usage:
        def test_something(mock_env):
            from backend.config import Settings
            s = Settings()
            ...
    """
    for key, value in VALID_ENV.items():
        monkeypatch.setenv(key, value)
    return VALID_ENV


@pytest.fixture(autouse=True)
def reset_http_client_cache():
    """
    Clears the cached HTTP client so that each test gets a fresh client
    and respects test-level monkeypatching of httpx.AsyncClient.
    """
    import backend.services.http_client as hc
    hc._client = None
    hc._loop_bound = None


@pytest.fixture(autouse=True)
def reset_ai_cascade_singleton():
    """
    Resets the shared AICascade singleton force_production_llm state
    and clears any mocked instance-level methods to prevent test pollution.
    """
    from backend.services.ai_cascade import AICascade
    cascade = AICascade()
    cascade._force_production_llm = False
    
    # Remove any dynamically mocked instance-level methods to restore class methods
    for attr in list(cascade.__dict__.keys()):
        if attr not in ("_force_production_llm", "_initialized"):
            try:
                delattr(cascade, attr)
            except AttributeError:
                pass


@pytest.fixture(autouse=True)
def cleanup_test_redis():
    """
    Scans for and deletes all keys in the 'test:*' namespace at the end of each test.
    """
    yield
    from backend.services.redis_client import redis
    from unittest.mock import Mock
    
    # Only run actual Redis cleanup if we have an initialized client and are not mocked
    if hasattr(redis, "_client") and redis._client is not None and not isinstance(redis._request, Mock):
        try:
            import asyncio
            async def run_cleanup():
                keys_data = await redis._request("", ["KEYS", "test:*"])
                keys = keys_data.get("result", []) if isinstance(keys_data, dict) else []
                if keys:
                    for key in keys:
                        await redis.delete(key)
            
            try:
                loop = asyncio.get_running_loop()
            except RuntimeError:
                loop = None

            if loop and loop.is_running():
                loop.create_task(run_cleanup())
            else:
                asyncio.run(run_cleanup())
        except Exception as e:
            import sys
            print(f"Warning: Failed to cleanup test Redis keys: {e}", file=sys.stderr)
