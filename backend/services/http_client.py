"""
backend/services/http_client.py
===============================
Thread-safe, loop-safe shared httpx.AsyncClient singleton wrapper.
Prevents connection and socket port exhaustion by reusing connection pools.
Includes custom SafeAsyncioBackend to prevent SSRF and DNS rebinding attacks.
"""

import httpx
from typing import Optional
import asyncio
import httpcore
import socket
import ipaddress
import urllib.parse
from backend.config import settings

_client: Optional[httpx.AsyncClient] = None
_loop_bound: Optional[asyncio.AbstractEventLoop] = None


class SafeAsyncioBackend(httpcore.AnyIOBackend):
    async def connect_tcp(
        self,
        host: str,
        port: int,
        timeout: float | None = None,
        local_address: str | None = None,
        **kwargs,
    ) -> httpcore.AsyncNetworkStream:
        # If ALLOW_PRIVATE_IPS is enabled (e.g. during testing/local dev), bypass SSRF check
        if settings and settings.ALLOW_PRIVATE_IPS:
            return await super().connect_tcp(host, port, timeout, local_address, **kwargs)
            
        # 1. DNS Resolution: resolve all A and AAAA records
        try:
            loop = asyncio.get_running_loop()
            addr_info = await loop.getaddrinfo(host, port, type=socket.SOCK_STREAM, proto=socket.IPPROTO_TCP)
        except Exception as dns_err:
            raise ValueError(f"SSRF block: Failed to resolve hostname '{host}': {dns_err}") from dns_err
            
        if not addr_info:
            raise ValueError(f"SSRF block: No IP addresses resolved for hostname '{host}'")
            
        # 2. Verify ALL resolved IP addresses
        safe_ip = None
        for family, type_, proto, canonname, sockaddr in addr_info:
            ip_str = sockaddr[0]
            try:
                ip = ipaddress.ip_address(ip_str)
            except Exception as ip_err:
                raise ValueError(f"SSRF block: Resolved address '{ip_str}' is invalid: {ip_err}") from ip_err
                
            # Block private, loopback, link-local, multicast, unspecified, reserved
            if (ip.is_private or 
                ip.is_loopback or 
                ip.is_link_local or 
                ip.is_multicast or 
                ip.is_unspecified or 
                ip.is_reserved):
                # Emit structured telemetry log event name SSRF_BLOCKED
                import logging
                logging.getLogger("backend.security").error(
                    "Security telemetry: event=SSRF_BLOCKED reason=private_ip ip=%s host=%s",
                    ip_str, host
                )
                raise ValueError(f"SSRF block: Resolved address '{ip_str}' for host '{host}' is private/forbidden.")
                
            if safe_ip is None:
                safe_ip = ip_str
                
        # 3. Pin connection to the validated IP to prevent DNS rebinding while maintaining original hostname/SNI for TLS
        return await super().connect_tcp(safe_ip, port, timeout, local_address, **kwargs)


def validate_url_scheme(url: str) -> None:
    """Validate that the URL scheme is strictly http or https (case-insensitive)."""
    if not url:
        raise ValueError("SSRF block: URL is empty")
    # Clean URL of leading/trailing spaces
    url = url.strip()
    parsed = urllib.parse.urlparse(url)
    scheme = parsed.scheme.lower()
    if scheme not in ("http", "https"):
        raise ValueError(f"SSRF block: Invalid scheme '{scheme}'. Only HTTP and HTTPS are allowed.")


class SafeAsyncHTTPTransport(httpx.AsyncHTTPTransport):
    def __init__(self, *args, **kwargs):
        network_backend = kwargs.pop("network_backend", None)
        super().__init__(*args, **kwargs)
        if network_backend is not None:
            import httpcore
            self._pool = httpcore.AsyncConnectionPool(
                ssl_context=self._pool._ssl_context,
                max_connections=self._pool._max_connections,
                max_keepalive_connections=self._pool._max_keepalive_connections,
                keepalive_expiry=self._pool._keepalive_expiry,
                http1=self._pool._http1,
                http2=self._pool._http2,
                uds=self._pool._uds,
                local_address=self._pool._local_address,
                retries=self._pool._retries,
                socket_options=self._pool._socket_options,
                network_backend=network_backend
            )


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
        backend = SafeAsyncioBackend()
        transport = SafeAsyncHTTPTransport(
            limits=httpx.Limits(max_connections=100, max_keepalive_connections=20),
            network_backend=backend
        )
        _client = httpx.AsyncClient(
            timeout=30.0,
            transport=transport
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
