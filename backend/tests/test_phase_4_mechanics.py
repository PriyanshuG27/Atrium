import pytest
import datetime
from datetime import timezone
import unittest.mock as mock
import json
import asyncio
from fastapi.testclient import TestClient

from backend.main import app
from backend.worker import check_user_milestones
from backend.scheduler.scheduler import (
    weekly_profile_text_generator,
    monthly_prediction_generator,
    monthly_discrepancy_scanner,
    monthly_forward_hook
)
from backend.middleware.twa_auth import generate_jwt
from backend.db.connection import get_db
from backend.config import settings

VALID_ENV = {
    "TELEGRAM_BOT_TOKEN": "1234567890:ABCdefGHIjklmnoPQRstuvwxyZ123456789",
    "DATABASE_URL": "postgresql://user:pass@localhost:5432/db?sslmode=require",
    "UPSTASH_REDIS_REST_URL": "https://dev-recall-redis.upstash.io",
    "UPSTASH_REDIS_REST_TOKEN": "dev_upstash_redis_token",
    "FERNET_KEY": "yF4P-W965hF17Bq_Q7g_oG5l8S631P9_9z-d8v7d8sA=",
    "JWT_SECRET": "8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b",
    "WEBSITE_URL": "http://localhost:5173",
    "ENV": "test",
}

@pytest.fixture(autouse=True)
def patch_env(monkeypatch):
    for k, v in VALID_ENV.items():
        monkeypatch.setenv(k, v)


# --- Mock Database Infrastructure ---

class MockCursor:
    def __init__(self, fetchone_result=None, fetchall_result=None):
        self.executed = []
        self.fetchone_result = fetchone_result
        self.fetchall_result = fetchall_result or []
        self.rowcount = 1

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

    async def execute(self, query, params=None):
        self.executed.append((query, params))

    async def fetchone(self):
        if self.fetchone_result is not None:
            return self.fetchone_result
        query_lower = self.executed[-1][0].lower() if self.executed else ""
        if "count(*)" in query_lower:
            return (5,) # Default node count
        if "node_milestones" in query_lower:
            return (json.dumps({"unlocked": []}),)
        if "users" in query_lower:
            return (42, "123456")
        return None

    async def fetchall(self):
        return self.fetchall_result


class MockConnection:
    def __init__(self, cursor_inst):
        self.cursor_inst = cursor_inst

    def cursor(self):
        return self.cursor_inst

    async def commit(self):
        pass


class MockPool:
    def __init__(self, conn_inst):
        self.conn_inst = conn_inst

    def connection(self):
        class ConnContext:
            def __init__(self, conn):
                self.conn = conn
            async def __aenter__(self):
                return self.conn
            async def __aexit__(self, exc_type, exc_val, exc_tb):
                pass
        return ConnContext(self.conn_inst)


# --- 1. Milestone Unlock Tests ---

@pytest.mark.asyncio
async def test_milestone_unlock_5_nodes():
    """Verify that reaching 5 nodes triggers the self-description collector question."""
    mock_cur = MockCursor(fetchone_result=None)
    # Force count(*) to 5, milestones to empty dict
    async def custom_fetchone():
        query = mock_cur.executed[-1][0].lower()
        if "count(*)" in query:
            return (5,)
        if "node_milestones" in query:
            return (json.dumps({"unlocked": []}),)
        return None
    mock_cur.fetchone = custom_fetchone

    mock_conn = MockConnection(mock_cur)
    
    with mock.patch("backend.db.connection._pool", MockPool(mock_conn)), \
         mock.patch("backend.worker.send_telegram_message") as mock_send, \
         mock.patch("backend.worker.redis.setex") as mock_redis_set:
        
        await check_user_milestones(42, "123456")
        
        # Verify milestone message and collector prompt sent
        assert mock_send.call_count == 2
        mock_send.assert_any_call("123456", "Your graph just crossed 5 nodes. First Pattern Report unlocks. \"Here is what your mind has been working on.\"")
        
        # Verify Redis state set
        mock_redis_set.assert_called_with("pending_self_description:123456", 604800, "1")


# --- 2. API Endpoint Gates Tests ---

def test_api_milestones_endpoint():
    """Verify api GET /api/user/milestones retrieves correct data."""
    mock_jwt = generate_jwt({"sub": "42"}, settings.JWT_SECRET)
    headers = {"Authorization": f"Bearer {mock_jwt}"}

    mock_cur = MockCursor()
    async def custom_fetchone():
        query = mock_cur.executed[-1][0].lower()
        if "telegram_chat_id" in query:
            return (42, "123456")
        if "count(*)" in query:
            return (8,)
        if "node_milestones" in query:
            return (json.dumps({"unlocked": ["pattern_report"]}),)
        return None
    mock_cur.fetchone = custom_fetchone

    mock_conn = MockConnection(mock_cur)

    # Override dependency
    async def mock_get_db():
        return mock_conn

    app.dependency_overrides[get_db] = mock_get_db

    client = TestClient(app)
    response = client.get("/api/user/milestones", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["node_count"] == 8
    assert "pattern_report" in data["unlocked"]

    app.dependency_overrides.clear()


def test_api_detailed_profile_insufficient_nodes():
    """Verify detailed profile endpoint returns 403 when nodes < 15."""
    mock_jwt = generate_jwt({"sub": "42"}, settings.JWT_SECRET)
    headers = {"Authorization": f"Bearer {mock_jwt}"}

    mock_cur = MockCursor()
    async def custom_fetchone():
        query = mock_cur.executed[-1][0].lower()
        if "telegram_chat_id" in query:
            return (42, "123456")
        if "count(*)" in query:
            return (10,) # less than 15
        return None
    mock_cur.fetchone = custom_fetchone
    mock_conn = MockConnection(mock_cur)

    async def mock_get_db():
        return mock_conn

    app.dependency_overrides[get_db] = mock_get_db

    client = TestClient(app)
    response = client.post("/api/user/profile/detailed", headers=headers)
    assert response.status_code == 403
    assert "unlocks at 15 nodes" in response.json()["detail"]

    app.dependency_overrides.clear()


# --- 3. Weekly Trajectory Cron Tests ---

@pytest.mark.asyncio
async def test_weekly_profile_text_generator():
    """Verify weekly trajectory cron filters local Sunday 8 PM timezones and generates summaries."""
    mock_cur = MockCursor()
    
    async def custom_fetchall():
        q = mock_cur.executed[-1][0].lower()
        if "from users" in q or "users" in q:
            return [(42, "123456", 330, "FLSR")]
        if "semantic_hubs" in q:
            return [("Software",), ("Aviation",)]
        return []
    mock_cur.fetchall = custom_fetchall

    mock_conn = MockConnection(mock_cur)

    # Mock Sunday 8:00 PM IST (GMT+5:30)
    # Sunday 8:00 PM IST is Sunday 2:30 PM UTC
    gmt_sunday_2_30_pm = datetime.datetime(2026, 6, 28, 14, 30, 0, tzinfo=timezone.utc)

    with mock.patch("backend.scheduler.scheduler.get_pool", return_value=MockPool(mock_conn)), \
         mock.patch("backend.scheduler.scheduler.datetime.datetime") as mock_dt, \
         mock.patch("backend.scheduler.scheduler.AICascade") as mock_cascade, \
         mock.patch("backend.worker.send_telegram_message") as mock_send:
        
        mock_dt.now.return_value = gmt_sunday_2_30_pm
        mock_dt.timedelta = datetime.timedelta
        
        # Mock LLM return
        cascade_inst = mock.MagicMock()
        cascade_inst.call_llm = mock.AsyncMock(return_value="Your mind heavily details Software Architecture and aviation checklists.")
        mock_cascade.return_value = cascade_inst

        await weekly_profile_text_generator()
        
        # Verify LLM was called
        cascade_inst.call_llm.assert_called()
        # Verify Telegram was called with correct message
        mock_send.assert_called_with("123456", mock.ANY)


# --- 4. Discrepancy & Confession Scanner Tests ---

@pytest.mark.asyncio
async def test_discrepancy_scanner_aligned_no_gap():
    """Verify discrepancy scanner does not create candidate if LLM returns ALIGNED_NO_GAP."""
    mock_cur = MockCursor()
    
    # Mock database responses with correct priority to prevent subquery false-matches
    async def custom_fetchall():
        q = mock_cur.executed[-1][0].lower()
        if "from users" in q or "users u" in q:
            return [(42, "123456", "I love software design", None)]
        if "semantic_hubs" in q:
            return [("Software", 10), ("Aviation", 5)]
        if "from items" in q or "items where" in q:
            return [("Title A", "Summary A"), ("Title B", "Summary B")]
        return []
    mock_cur.fetchall = custom_fetchall
    
    mock_conn = MockConnection(mock_cur)

    with mock.patch("backend.scheduler.scheduler.get_pool", return_value=MockPool(mock_conn)), \
         mock.patch("backend.scheduler.scheduler.AICascade") as mock_cascade:
        
        cascade_inst = mock.MagicMock()
        cascade_inst.call_llm = mock.AsyncMock(return_value="ALIGNED_NO_GAP")
        mock_cascade.return_value = cascade_inst

        await monthly_discrepancy_scanner()
        
        # Verify no INSERT was executed for candidates
        executed_queries = [x[0] for x in mock_cur.executed]
        assert not any("insert into insight_candidates" in q.lower() for q in executed_queries)


# --- 5. Monthly Prediction Engine Tests ---

@pytest.mark.asyncio
async def test_monthly_prediction_generator_low_confidence():
    """Verify monthly predictions reject entries below 0.72 confidence threshold."""
    mock_cur = MockCursor()
    async def custom_fetchall():
        q = mock_cur.executed[-1][0].lower()
        if "from users" in q:
            return [(42, "123456", None)]
        if "from items" in q:
            return [("Title A", "Summary A")]
        return []
    mock_cur.fetchall = custom_fetchall
    mock_conn = MockConnection(mock_cur)

    with mock.patch("backend.scheduler.scheduler.get_pool", return_value=MockPool(mock_conn)), \
         mock.patch("backend.scheduler.scheduler.AICascade") as mock_cascade:
        
        cascade_inst = mock.MagicMock()
        # Mock confidence output <= 0.72
        cascade_inst.call_llm = mock.AsyncMock(return_value='{"prediction": "Fails", "confidence": 0.50}')
        mock_cascade.return_value = cascade_inst

        await monthly_prediction_generator()

        # Verify no prediction candidate was inserted
        executed_queries = [x[0] for x in mock_cur.executed]
        assert not any("insert into insight_candidates" in q.lower() for q in executed_queries)
