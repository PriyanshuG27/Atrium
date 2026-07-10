"""
backend/middleware/structured_logging_middleware.py
===================================================
Middleware to inject correlation IDs, hash client IPs, and log API duration.
"""

import time
import uuid
from fastapi import Request
import structlog
from structlog.contextvars import bind_contextvars, clear_contextvars
from backend.services.analytics_service import hash_client_ip
from backend.config import settings

logger = structlog.get_logger()

async def structured_logging_middleware(request: Request, call_next):
    """
    FastAPI middleware to trace HTTP requests.
    Generates/propagates correlation IDs and logs duration metrics.
    """
    clear_contextvars()
    
    # Propagate or generate a correlation ID
    correlation_id = request.headers.get("x-correlation-id") or request.headers.get("x-request-id") or str(uuid.uuid4())
    
    # Hash IP for privacy
    client_ip = request.client.host if request.client else None
    hashed_ip = hash_client_ip(client_ip) if client_ip else ""
    
    bind_contextvars(
        correlation_id=correlation_id,
        method=request.method,
        path=request.url.path,
        client_ip_hash=hashed_ip
    )
    
    start_time = time.perf_counter()
    try:
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start_time) * 1000
        
        # Add correlation ID header to the response
        response.headers["x-correlation-id"] = correlation_id
        
        # Track webhook latency if path matches
        if request.url.path.startswith("/api/webhook"):
            try:
                from backend.services.redis_client import redis
                await redis._request("", ["LPUSH", "metrics:system:webhook_latencies", str(duration_ms)])
                await redis._request("", ["LTRIM", "metrics:system:webhook_latencies", "0", "49"])
            except Exception:
                pass

        # Log successful completion (skip health checks to avoid log flooding)
        if request.url.path not in ("/health", "/healthcheck"):
            logger.info(
                "request_processed",
                status_code=response.status_code,
                duration_ms=round(duration_ms, 2)
            )
        return response
    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.error(
            "request_failed",
            error=str(e),
            duration_ms=round(duration_ms, 2),
            exc_info=True
        )
        raise
