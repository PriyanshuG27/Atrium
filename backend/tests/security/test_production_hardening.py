import pytest
import asyncio
import hmac
import psycopg
import psycopg_pool
from fastapi.testclient import TestClient
from fastapi import HTTPException
from unittest.mock import AsyncMock, MagicMock, patch

from backend.main import app
from backend.config import settings
from backend.routes.api import verify_internal_key

# ===========================================================================
# 1. Timing-Safe Key Verification Tests
# ===========================================================================

def test_verify_internal_key_timing_safe(monkeypatch):
    monkeypatch.setattr(settings, "INTERNAL_API_KEY", "super_secret_admin_key")
    
    # 1. Valid Key
    verify_internal_key(x_internal_key="super_secret_admin_key")
    
    # 2. Invalid Key
    with pytest.raises(HTTPException) as exc:
        verify_internal_key(x_internal_key="wrong_key")
    assert exc.value.status_code == 401
    assert "Invalid internal API key" in exc.value.detail

    # 3. Empty Header
    with pytest.raises(HTTPException) as exc:
        verify_internal_key(x_internal_key="")
    assert exc.value.status_code == 401

    # 4. None/Null Header
    with pytest.raises(HTTPException) as exc:
        verify_internal_key(x_internal_key=None)
    assert exc.value.status_code == 401


# ===========================================================================
# 2. Worker Pool Import & Monkeypatching Verification
# ===========================================================================

def test_worker_dynamic_pool_monkeypatch():
    import backend.db.connection as db_conn
    import backend.worker as worker
    
    mock_pool_a = AsyncMock(spec=psycopg_pool.AsyncConnectionPool)
    mock_pool_b = AsyncMock(spec=psycopg_pool.AsyncConnectionPool)
    
    # 1. Verify we can change the reference at db_conn
    db_conn._pool = mock_pool_a
    assert worker.db_conn._pool is mock_pool_a
    
    # 2. Verify changing to B is picked up dynamically
    db_conn._pool = mock_pool_b
    assert worker.db_conn._pool is mock_pool_b
    
    # Clean up
    db_conn._pool = None


# ===========================================================================
# 3. Invite Concurrency Parallel Stress Test
# ===========================================================================

@pytest.mark.asyncio
async def test_invite_acceptance_concurrency_race(monkeypatch):
    import backend.db.connection as db_conn
    from backend.routes.hearth import accept_invite
    from backend.middleware.twa_auth import UserContext
    from pydantic import BaseModel
    
    mock_conn = AsyncMock()
    mock_cur = AsyncMock()
    
    # Set up async context manager mock for cursor
    mock_cursor_cm = AsyncMock()
    mock_cursor_cm.__aenter__.return_value = mock_cur
    mock_conn.cursor = MagicMock(return_value=mock_cursor_cm)
    
    # Mock transaction async context manager on db
    mock_tx_cm = AsyncMock()
    mock_conn.transaction = MagicMock(return_value=mock_tx_cm)
    
    invite_checked = False
    
    async def mock_execute(query, params=None):
        nonlocal invite_checked
        # Simulate locking delay/check
        if "SELECT id, inviter_id FROM journey_invites" in query:
            # Yield to event loop to simulate concurrency context switching
            await asyncio.sleep(0.01)
            if invite_checked:
                mock_cur.fetchone.return_value = None
            else:
                invite_checked = True
                mock_cur.fetchone.return_value = {"id": 1, "inviter_id": 42}
        elif "SELECT 1 FROM journey_pairs" in query:
            mock_cur.fetchone.return_value = None
            
    mock_cur.execute = mock_execute
    
    # Mock user contexts
    class AcceptBody(BaseModel):
        invite_code: str
        
    body = AcceptBody(invite_code="RCL-TEST-CODE")
    
    user_context = UserContext(id=99, telegram_chat_id="999")
    
    # Mock Telegram notification helper to prevent real API calls and timeouts
    with patch("backend.routes.hearth._notify_telegram", new_callable=AsyncMock) as mock_notify:
        # Simulate 30 concurrent accepts
        async def run_accept():
            try:
                await accept_invite(body=body, user=user_context, db=mock_conn)
                return "success"
            except HTTPException as e:
                return f"fail_{e.status_code}"
                
        tasks = [run_accept() for _ in range(30)]
        results = await asyncio.gather(*tasks)
    
    # Assert exactly one success, 29 failures
    success_count = results.count("success")
    fail_count = len(results) - success_count
    
    assert success_count == 1
    assert fail_count == 29
