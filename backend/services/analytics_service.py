"""
backend/services/analytics_service.py
=====================================
Analytics service for logging user engagement events and AI cost metadata.
All operations are executed asynchronously in tracked background tasks.

Policy:
- Analytics logging is best-effort. Data lost during unexpected process shutdowns
  or unhandled background task cancellations is acceptable.
- Performs all database writes exclusively through public get_connection helpers.
"""

import asyncio
import json
import logging
import hmac
import hashlib
from typing import Any, Dict, Set
from backend.config import settings
from backend.db.connection import get_connection

logger = logging.getLogger(__name__)

# Active background tasks tracker for garbage collection safety and graceful shutdown
_background_tasks: Set[asyncio.Task] = set()

# A flag to prevent accepting new analytics events during shutdown
_shutting_down: bool = False

def spawn_background_task(coro, name: str) -> asyncio.Task | None:
    """
    Spawns and tracks a background task safely. Logs unhandled exceptions.
    Returns the created task, or None if the system is shutting down.
    """
    global _shutting_down
    if _shutting_down:
        logger.warning("Rejecting background task %s — application is shutting down.", name)
        return None

    task = asyncio.create_task(coro, name=name)
    _background_tasks.add(task)

    def on_complete(t: asyncio.Task):
        _background_tasks.discard(t)
        try:
            if not t.cancelled() and t.exception():
                logger.error(
                    "Background task %s failed with exception: %s",
                    t.get_name(),
                    t.exception(),
                    exc_info=t.exception()
                )
        except asyncio.CancelledError:
            pass

    task.add_done_callback(on_complete)
    return task


async def shutdown_background_tasks(timeout: float = 5.0) -> None:
    """
    Stops accepting new tasks, awaits outstanding tasks up to a timeout,
    and cancels any remaining tasks.
    """
    global _shutting_down
    _shutting_down = True
    
    if not _background_tasks:
        logger.info("No active analytics background tasks to clean up.")
        return

    logger.info(
        "Awaiting %d outstanding analytics background tasks (timeout = %.1f s)...",
        len(_background_tasks),
        timeout
    )
    
    # Wait for tasks to complete
    tasks_list = list(_background_tasks)
    try:
        await asyncio.wait_for(asyncio.gather(*tasks_list, return_exceptions=True), timeout=timeout)
        logger.info("All analytics background tasks finished gracefully.")
    except asyncio.TimeoutError:
        remaining = len(_background_tasks)
        logger.warning(
            "Timed out waiting for background tasks. Cancelling %d remaining tasks...",
            remaining
        )
        for t in _background_tasks:
            t.cancel()
        # Allow cancellation to propagate
        await asyncio.gather(*_background_tasks, return_exceptions=True)
        logger.info("Remaining background tasks cancelled.")


def hash_client_ip(ip: str) -> str:
    """
    Hashes an IP address using HMAC-SHA256 with settings.LOG_HASH_SECRET.
    Guarantees deterministic hashing while preventing rainbow-table attacks.
    """
    if not ip:
        return ""
    key = settings.LOG_HASH_SECRET.encode("utf-8")
    return hmac.new(key, ip.encode("utf-8"), hashlib.sha256).hexdigest()[:16]


def emit_engagement(user_id: int, event_type: str, details: Dict[str, Any]) -> None:
    """
    Fires a background task to persist an engagement event without blocking user latency.
    """
    spawn_background_task(
        _persist_engagement(user_id, event_type, details),
        name=f"analytics_engagement_{event_type}_{user_id}"
    )


def emit_ai_cost(
    user_id: int,
    request_id: str,
    provider: str,
    model_name: str,
    operation: str,
    input_tokens: int,
    output_tokens: int,
    cost_usd: float,
    success: bool,
    retry_count: int,
    cache_hit: bool
) -> None:
    """
    Fires a background task to persist an AI execution cost log.
    """
    spawn_background_task(
        _persist_ai_cost(
            user_id, request_id, provider, model_name, operation,
            input_tokens, output_tokens, cost_usd, success, retry_count, cache_hit
        ),
        name=f"analytics_ai_cost_{operation}_{user_id}"
    )


async def _persist_engagement(user_id: int, event_type: str, details: Dict[str, Any]) -> None:
    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    "INSERT INTO engagement_events (user_id, event_type, details) VALUES (%s, %s, %s);",
                    (user_id, event_type, json.dumps(details))
                )
                await conn.commit()
    except Exception as e:
        logger.error("Failed to persist engagement event asynchronously: %s", e)


async def _persist_ai_cost(
    user_id: int,
    request_id: str,
    provider: str,
    model_name: str,
    operation: str,
    input_tokens: int,
    output_tokens: int,
    cost_usd: float,
    success: bool,
    retry_count: int,
    cache_hit: bool
) -> None:
    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    INSERT INTO ai_cost_logs 
                    (user_id, request_id, provider, model_name, operation, input_tokens, output_tokens, cost_usd, success, retry_count, cache_hit) 
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s);
                    """,
                    (user_id, request_id, provider, model_name, operation, input_tokens, output_tokens, cost_usd, success, retry_count, cache_hit)
                )
                await conn.commit()
    except Exception as e:
        logger.error("Failed to persist AI cost log asynchronously: %s", e)


async def run_retention_cleanup() -> int:
    """
    Cleans up engagement events and cost logs older than 90 days.
    Executes in batches of 5000 rows to prevent exclusive lock escalation and table locks.
    Returns the total number of deleted rows.
    """
    deleted_total = 0
    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                # 1. Prune engagement events
                while True:
                    await cur.execute(
                        """
                        DELETE FROM engagement_events 
                        WHERE id IN (
                            SELECT id FROM engagement_events 
                            WHERE created_at < NOW() - INTERVAL '90 days' 
                            LIMIT 5000
                        );
                        """
                    )
                    rows = cur.rowcount
                    await conn.commit()
                    deleted_total += rows
                    if rows < 5000:
                        break

                # 2. Prune AI cost logs
                while True:
                    await cur.execute(
                        """
                        DELETE FROM ai_cost_logs 
                        WHERE id IN (
                            SELECT id FROM ai_cost_logs 
                            WHERE created_at < NOW() - INTERVAL '90 days' 
                            LIMIT 5000
                        );
                        """
                    )
                    rows = cur.rowcount
                    await conn.commit()
                    deleted_total += rows
                    if rows < 5000:
                        break

        logger.info("Observability retention cleanup finished. Deleted %d old rows.", deleted_total)
    except Exception as cleanup_err:
        logger.error("Failed to run observability retention cleanup: %s", cleanup_err)
    return deleted_total

