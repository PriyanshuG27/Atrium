"""
backend/tests/test_observability.py
===================================
Observability, telemetry, and structured logging unit tests for Recall.
"""

import sys
import asyncio
import json
import pytest
from unittest.mock import AsyncMock, patch, MagicMock

# Enforce SelectorEventLoopPolicy on Windows for async DB tests
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

from backend.config import settings
from backend.services.analytics_service import (
    hash_client_ip,
    emit_engagement,
    emit_ai_cost,
    spawn_background_task,
    shutdown_background_tasks,
    _background_tasks,
    run_retention_cleanup
)
from backend.services.observability_helper import observe, aobserve
from backend.services.redis_client import UpstashRedis
import backend.services.analytics_service as analytics_service


@pytest.fixture(autouse=True)
def reset_observability_state():
    analytics_service._shutting_down = False
    analytics_service._background_tasks.clear()
    yield
    analytics_service._shutting_down = False
    analytics_service._background_tasks.clear()


def test_ip_hmac_hashing():
    """Verify that IP hashing uses HMAC-SHA256 with key separation."""
    ip = "192.168.1.1"
    
    # Hash under default secret
    hash_1 = hash_client_ip(ip)
    assert len(hash_1) == 16
    assert hash_1 != ip
    
    # Rotate LOG_HASH_SECRET and verify hash changes
    with patch.object(settings, "LOG_HASH_SECRET", "rotated_secret_key"):
        hash_2 = hash_client_ip(ip)
        assert len(hash_2) == 16
        assert hash_1 != hash_2


def test_observability_timing_sync():
    """Verify that the sync observe context manager logs duration and trace name."""
    with patch("backend.services.observability_helper.logger") as mock_logger:
        with observe("test_sync_trace"):
            pass
            
        mock_logger.info.assert_called_once()
        args, kwargs = mock_logger.info.call_args
        assert args[0] == "observability_trace"
        assert kwargs["trace_name"] == "test_sync_trace"
        assert kwargs["status"] == "success"
        assert "duration_ms" in kwargs


@pytest.mark.asyncio
async def test_observability_timing_async():
    """Verify that the async aobserve context manager logs duration and trace name."""
    with patch("backend.services.observability_helper.logger") as mock_logger:
        async with aobserve("test_async_trace"):
            await asyncio.sleep(0.01)
            
        mock_logger.info.assert_called_once()
        args, kwargs = mock_logger.info.call_args
        assert args[0] == "observability_trace"
        assert kwargs["trace_name"] == "test_async_trace"
        assert kwargs["status"] == "success"
        assert "duration_ms" in kwargs


@pytest.mark.asyncio
async def test_observability_timing_failure():
    """Verify that observe logs failed events and propagates exceptions."""
    with patch("backend.services.observability_helper.logger") as mock_logger:
        with pytest.raises(ValueError):
            with observe("failed_sync_trace"):
                raise ValueError("test_error")
                
        mock_logger.error.assert_called_once()
        args, kwargs = mock_logger.error.call_args
        assert args[0] == "observability_trace"
        assert kwargs["trace_name"] == "failed_sync_trace"
        assert kwargs["status"] == "failed"
        assert kwargs["exc_info"] is True


@pytest.mark.asyncio
async def test_tracked_background_tasks():
    """Verify that background tasks are tracked and cleaned up on complete."""
    async def dummy_coro():
        await asyncio.sleep(0.05)
        
    task = spawn_background_task(dummy_coro(), name="test_dummy_task")
    assert task in _background_tasks
    await task
    assert task not in _background_tasks


@pytest.mark.asyncio
async def test_analytics_async_persistence():
    """Verify that emit_engagement and emit_ai_cost spawn background tasks."""
    mock_cursor = AsyncMock()
    mock_conn = MagicMock()
    
    class AsyncCursorContextManagerMock:
        async def __aenter__(self):
            return mock_cursor
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    mock_conn.cursor.return_value = AsyncCursorContextManagerMock()
    
    class AsyncContextManagerMock:
        async def __aenter__(self):
            return mock_conn
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    with patch("backend.services.analytics_service.get_connection", new_callable=MagicMock) as mock_get_conn:
        mock_get_conn.return_value = AsyncContextManagerMock()
        
        emit_engagement(user_id=1, event_type="test_event", details={"meta": "data"})
        emit_ai_cost(
            user_id=1, request_id="req123", provider="google", model_name="gemini",
            operation="summary", input_tokens=10, output_tokens=20, cost_usd=0.005,
            success=True, retry_count=0, cache_hit=False
        )
        
        # Await pending background tasks
        await shutdown_background_tasks(timeout=2.0)
        
        # Verify db cursors executed INSERTs
        assert mock_cursor.execute.call_count >= 2
        
        # Check first query is engagement INSERT
        first_call_args = mock_cursor.execute.call_args_list[0][0]
        assert "INSERT INTO engagement_events" in first_call_args[0]
        
        # Check second query is cost log INSERT
        second_call_args = mock_cursor.execute.call_args_list[1][0]
        assert "INSERT INTO ai_cost_logs" in second_call_args[0]


@pytest.mark.asyncio
async def test_redis_llen_and_lindex():
    """Verify llen and lindex requests against UpstashRedis mock."""
    client = UpstashRedis()
    
    with patch.object(client, "_request", new_callable=AsyncMock) as mock_request:
        mock_request.return_value = {"result": 5}
        length = await client.llen("mykey")
        assert length == 5
        mock_request.assert_called_once_with("", ["LLEN", "mykey"])
        
    with patch.object(client, "_request", new_callable=AsyncMock) as mock_request:
        mock_request.return_value = {"result": "val"}
        val = await client.lindex("mykey", -1)
        assert val == "val"
        mock_request.assert_called_once_with("", ["LINDEX", "mykey", "-1"])


@pytest.mark.asyncio
async def test_observability_retention_cleanup():
    """Verify that retention cleanup deletes old logs using batched SQL statements."""
    mock_cursor = AsyncMock()
    mock_cursor.rowcount = 1000  # returns 1000 rows first batch, then 0
    
    mock_conn = MagicMock()
    mock_conn.commit = AsyncMock()
    class AsyncCursorContextManagerMock:
        async def __aenter__(self):
            return mock_cursor
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    mock_conn.cursor.return_value = AsyncCursorContextManagerMock()
    
    class AsyncContextManagerMock:
        async def __aenter__(self):
            return mock_conn
        async def __aexit__(self, exc_type, exc_val, exc_tb):
            pass

    with patch("backend.services.analytics_service.get_connection", new_callable=MagicMock) as mock_get_conn:
        mock_get_conn.return_value = AsyncContextManagerMock()
        
        from unittest.mock import PropertyMock
        # Mock rowcount sequence to terminate the loop: first call returns 5000, next returns 2000
        # (meaning 1 batch of 5000 is deleted, second batch of 2000 is deleted, then terminates)
        type(mock_cursor).rowcount = PropertyMock(side_effect=[5000, 2000, 5000, 1000])
        
        deleted = await run_retention_cleanup()
        assert deleted == 13000  # (5000+2000) for events + (5000+1000) for cost logs = 13000
        assert mock_cursor.execute.call_count == 4


@pytest.mark.asyncio
async def test_observability_metrics_logger():
    """Verify that the scheduled metrics logger collects and logs queue depth, age, and DB pool stats."""
    from backend.scheduler.scheduler import observability_metrics_logger
    import backend.db.connection as db_conn
    
    mock_redis = AsyncMock()
    mock_redis.llen.return_value = 1
    mock_redis.lindex.return_value = json.dumps({"created_at": "2026-07-09T01:47:19.123456+00:00"})
    
    mock_pool = MagicMock()
    mock_pool.pop_stats.return_value = {
        "pool_size": 3,
        "pool_available": 2,
        "requests_waiting": 1
    }
    
    with patch("backend.services.redis_client.redis", mock_redis), \
         patch("backend.db.connection._pool", mock_pool), \
         patch("structlog.get_logger") as mock_logger:
         
         log_instance = MagicMock()
         mock_logger.return_value = log_instance
         
         await observability_metrics_logger()
         
         mock_redis.llen.assert_called_once_with("atrium:tasks")
         mock_redis.lindex.assert_called_once_with("atrium:tasks", -1)
         mock_pool.pop_stats.assert_called_once()
         
         log_instance.info.assert_called_once()
         args, kwargs = log_instance.info.call_args
         assert args[0] == "observability_metrics"
         assert kwargs["queue_depth"] == 1
         assert kwargs["db_pool"]["pool_size"] == 3
         assert "oldest_job_age_seconds" in kwargs


