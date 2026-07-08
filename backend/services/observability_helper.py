"""
backend/services/observability_helper.py
========================================
Lightweight context managers to trace and log execution times of code blocks
in both synchronous and asynchronous contexts.
"""

import time
import logging
from contextlib import contextmanager, asynccontextmanager
import structlog

logger = structlog.get_logger()

@contextmanager
def observe(name: str):
    """
    Synchronous context manager to measure duration of a code block.
    Usage:
        with observe("some_operation"):
            ...
    """
    start = time.perf_counter()
    try:
        yield
        duration = (time.perf_counter() - start) * 1000
        logger.info(
            "observability_trace",
            trace_name=name,
            status="success",
            duration_ms=round(duration, 2)
        )
    except Exception as e:
        duration = (time.perf_counter() - start) * 1000
        logger.error(
            "observability_trace",
            trace_name=name,
            status="failed",
            duration_ms=round(duration, 2),
            exc_info=True
        )
        raise


@asynccontextmanager
async def aobserve(name: str):
    """
    Asynchronous context manager to measure duration of an async code block.
    Usage:
        async with aobserve("some_async_operation"):
            await ...
    """
    start = time.perf_counter()
    try:
        yield
        duration = (time.perf_counter() - start) * 1000
        logger.info(
            "observability_trace",
            trace_name=name,
            status="success",
            duration_ms=round(duration, 2)
        )
    except Exception as e:
        duration = (time.perf_counter() - start) * 1000
        logger.error(
            "observability_trace",
            trace_name=name,
            status="failed",
            duration_ms=round(duration, 2),
            exc_info=True
        )
        raise
