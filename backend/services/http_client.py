"""
backend/services/http_client.py
===============================
Thread-safe, loop-safe shared httpx.AsyncClient singleton wrapper.
Prevents connection and socket port exhaustion by reusing connection pools.
"""

import httpx
from typing import Optional

import asyncio

_client: Optional[httpx.AsyncClient] = None
_loop_bound: Optional[asyncio.AbstractEventLoop] = None

def get_http_client() -> httpx.AsyncClient:
    """
    Returns a shared AsyncClient instance bound to the current running event loop.
    Re-creates the client if the event loop has changed (e.g. between tests).
    """
    global _client, _loop_bound
    try:
        current_loop = asyncio.get_running_loop()
    except RuntimeError:
        current_loop = None

    if _client is None or _client.is_closed or _loop_bound is not current_loop:
        _client = httpx.AsyncClient(
            timeout=30.0,
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20)
        )
        _loop_bound = current_loop
    return _client

async def close_http_client() -> None:
    """Closes the shared HTTP client connection pool gracefully."""
    global _client, _loop_bound
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None
    _loop_bound = None
