import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

from backend.config import settings
from backend.services.search_service import (
    should_bypass_rewrite,
    rewrite_search_query,
    hybrid_search
)

# ---------------------------------------------------------------------------
# 1. Heuristic Bypass Unit Tests
# ---------------------------------------------------------------------------
def test_should_bypass_rewrite_rules():
    # 1. Short queries (<= 2 words)
    assert should_bypass_rewrite("postgres") is True
    assert should_bypass_rewrite("fastapi dev") is True
    assert should_bypass_rewrite("  python  ") is True

    # 2. Quoted queries
    assert should_bypass_rewrite('"fastapi concurrency"') is True
    assert should_bypass_rewrite("'asyncio semaphore'") is True

    # 3. Alphanumeric single tags
    assert should_bypass_rewrite("work") is True
    assert should_bypass_rewrite("#personal") is True

    # 4. Long conversational queries (should NOT bypass)
    assert should_bypass_rewrite("how to limit concurrency in fastapi") is False
    assert should_bypass_rewrite("stoicism rules for self control and discipline") is False


# ---------------------------------------------------------------------------
# 2. Query Rewriter Task Cancellation & Fallback Tests
# ---------------------------------------------------------------------------
@pytest.mark.asyncio
@patch("backend.services.ai_cascade.facade.AICascade")
async def test_rewrite_search_query_success(mock_cascade_cls):
    mock_cascade = MagicMock()
    mock_cascade.call_llm = AsyncMock(
        return_value='{"rewritten_query": "fastapi concurrency limits", "synonyms": ["semaphore", "limits", "concurrency"]}'
    )
    mock_cascade_cls.return_value = mock_cascade

    rewritten, synonyms = await rewrite_search_query("how to limit concurrency in fastapi")
    assert rewritten == "fastapi concurrency limits"
    # Synonyms should be lowercased, max 3, no duplicates, excluding rewritten and original
    assert len(synonyms) == 1
    assert "semaphore" in synonyms

@pytest.mark.asyncio
@patch("backend.services.ai_cascade.facade.AICascade")
async def test_rewrite_search_query_timeout(mock_cascade_cls):
    mock_cascade = MagicMock()
    # Simulate a slow LLM call
    async def slow_call(*args, **kwargs):
        await asyncio.sleep(5)
        return "result"
    mock_cascade.call_llm = slow_call
    mock_cascade_cls.return_value = mock_cascade

    # Set timeout extremely small to trigger it quickly
    with patch.object(settings, "QUERY_REWRITE_TIMEOUT_SECONDS", 0.05):
        rewritten, synonyms = await rewrite_search_query("how to limit concurrency in fastapi")
        # Should fallback to original query and return empty synonyms
        assert rewritten == "how to limit concurrency in fastapi"
        assert synonyms == []

@pytest.mark.asyncio
@patch("backend.services.ai_cascade.facade.AICascade")
async def test_rewrite_search_query_provider_error(mock_cascade_cls):
    mock_cascade = MagicMock()
    mock_cascade.call_llm = AsyncMock(side_effect=RuntimeError("Provider offline"))
    mock_cascade_cls.return_value = mock_cascade

    rewritten, synonyms = await rewrite_search_query("how to limit concurrency in fastapi")
    assert rewritten == "how to limit concurrency in fastapi"
    assert synonyms == []


# ---------------------------------------------------------------------------
# 3. SQL FTS Parameterization & Trigram Fallback Tests
# ---------------------------------------------------------------------------
class RecordingCursor:
    def __init__(self, rows=None):
        self.executed = []
        self.rows = rows or []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

    async def execute(self, query, params=None):
        self.executed.append((query, params))

    async def fetchall(self):
        return self.rows

class RecordingConnection:
    def __init__(self, cursor_inst):
        self.cursor_inst = cursor_inst

    def cursor(self):
        return self.cursor_inst

@pytest.mark.asyncio
@patch("backend.services.search_service.embed_text", new_callable=AsyncMock, return_value=[0.1]*384)
@patch("backend.services.search_service.rewrite_search_query", new_callable=AsyncMock)
async def test_hybrid_search_fts_sql_construction(mock_rewrite, mock_embed):
    # Mock query rewriter returning rewritten query and 2 synonyms
    mock_rewrite.return_value = ("fastapi concurrency limits", ["semaphore", "limits"])

    mock_cursor = RecordingCursor()
    mock_conn = RecordingConnection(mock_cursor)

    with patch.object(settings, "ENABLE_RERANKING", False):
        results = await hybrid_search("how to limit concurrency in fastapi", 42, mock_conn)
        assert len(mock_cursor.executed) == 1
        query, params = mock_cursor.executed[0]

        # Verify that FTS query joins on both rewritten query and synonyms
        assert "fts_search" in query
        assert "trigram_search" in query
        assert "ts_rank_cd" in query
        assert "to_tsvector('english'" in query
        assert "(SELECT (websearch_to_tsquery('english', %s) || to_tsquery('english', %s) || to_tsquery('english', %s))) AS query_ts(query_ts)" in query

        # Ensure all synonyms are parameterized as separate elements (no concatenation)
        assert params[10] == "fastapi concurrency limits"
        assert params[11] == "semaphore"
        assert params[12] == "limits"
        assert params[13] == 42 # user_id
        
        # Verify RRF parameters are correctly parameterized
        # rrf_scores params: VECTOR_WEIGHT, RRF_K, TEXT_WEIGHT, RRF_K
        assert settings.RRF_VECTOR_WEIGHT in params
        assert settings.RRF_TEXT_WEIGHT in params
        assert settings.RRF_K in params
