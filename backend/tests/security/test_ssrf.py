import pytest
import asyncio
import socket
import ipaddress
import urllib.parse
import unittest.mock as mock
import httpx
from backend.services.http_client import get_http_client, validate_url_scheme, SafeAsyncioBackend
from backend.config import settings

@pytest.mark.asyncio
async def test_url_scheme_validation():
    # Valid schemes
    validate_url_scheme("http://example.com")
    validate_url_scheme("https://google.com")
    validate_url_scheme("HTTPS://yahoo.com")
    validate_url_scheme("  https://google.com/path  ")  # spaces stripped
    
    # Invalid schemes
    with pytest.raises(ValueError, match="Only HTTP and HTTPS are allowed"):
        validate_url_scheme("file:///etc/passwd")
    with pytest.raises(ValueError, match="Only HTTP and HTTPS are allowed"):
        validate_url_scheme("ftp://ftp.funet.fi")
    with pytest.raises(ValueError, match="Only HTTP and HTTPS are allowed"):
        validate_url_scheme("gopher://gopher.floodgap.com")
    with pytest.raises(ValueError, match="Only HTTP and HTTPS are allowed"):
        validate_url_scheme("javascript:alert(1)")
    with pytest.raises(ValueError, match="Only HTTP and HTTPS are allowed"):
        validate_url_scheme("data:text/html,<html>")
    with pytest.raises(ValueError, match="Only HTTP and HTTPS are allowed"):
        validate_url_scheme("file://user:pass@localhost:80/path")

@pytest.mark.asyncio
async def test_ssrf_validation_private_ips():
    backend = SafeAsyncioBackend()
    
    original_allow = settings.ALLOW_PRIVATE_IPS
    settings.ALLOW_PRIVATE_IPS = False
    
    try:
        # Test connecting to loopback IP (127.0.0.1)
        with pytest.raises(ValueError, match="SSRF block"):
            await backend.connect_tcp("127.0.0.1", 80)
            
        # Test connecting to loopback IPv6 (::1)
        with pytest.raises(ValueError, match="SSRF block"):
            await backend.connect_tcp("::1", 80)
            
        # Test connecting to private IPv4 (192.168.1.1)
        with pytest.raises(ValueError, match="SSRF block"):
            await backend.connect_tcp("192.168.1.1", 80)
            
        # Test connecting to private IPv4 (10.0.0.1)
        with pytest.raises(ValueError, match="SSRF block"):
            await backend.connect_tcp("10.0.0.1", 80)
    finally:
        settings.ALLOW_PRIVATE_IPS = original_allow

@pytest.mark.asyncio
async def test_ssrf_dns_rebinding_simulation():
    backend = SafeAsyncioBackend()
    original_allow = settings.ALLOW_PRIVATE_IPS
    settings.ALLOW_PRIVATE_IPS = False
    
    mock_addr_info = [
        (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("8.8.8.8", 80)),
        (socket.AF_INET, socket.SOCK_STREAM, socket.IPPROTO_TCP, "", ("127.0.0.1", 80)) # Rebinding attempt inside resolution
    ]
    
    try:
        # We patch the socket getaddrinfo to return our simulated mixed records
        with mock.patch("socket.getaddrinfo") as mock_dns:
            mock_dns.return_value = mock_addr_info
            with pytest.raises(ValueError, match="SSRF block: Resolved address '127.0.0.1' for host 'rebind-test.com' is private/forbidden"):
                await backend.connect_tcp("rebind-test.com", 80)
    finally:
        settings.ALLOW_PRIVATE_IPS = original_allow

@pytest.mark.asyncio
async def test_ssrf_bypass_when_allowed():
    backend = SafeAsyncioBackend()
    original_allow = settings.ALLOW_PRIVATE_IPS
    settings.ALLOW_PRIVATE_IPS = True
    
    with mock.patch("httpcore.AnyIOBackend.connect_tcp", new_callable=mock.AsyncMock) as mock_connect:
        mock_connect.return_value = mock.MagicMock()
        
        await backend.connect_tcp("127.0.0.1", 80)
        
        mock_connect.assert_called_once_with("127.0.0.1", 80, None, None)
        
    settings.ALLOW_PRIVATE_IPS = original_allow


@pytest.mark.asyncio
async def test_ssrf_telemetry_event_logging():
    backend = SafeAsyncioBackend()
    original_allow = settings.ALLOW_PRIVATE_IPS
    settings.ALLOW_PRIVATE_IPS = False
    
    try:
        with mock.patch("logging.Logger.error") as mock_log:
            with pytest.raises(ValueError, match="SSRF block"):
                await backend.connect_tcp("127.0.0.1", 80)
                
            # Verify that error was logged with structured telemetry name SSRF_BLOCKED
            mock_log.assert_called_once()
            log_args = mock_log.call_args[0]
            assert "event=SSRF_BLOCKED" in log_args[0]
            assert "reason=private_ip" in log_args[0]
            assert log_args[1] == "127.0.0.1"
    finally:
        settings.ALLOW_PRIVATE_IPS = original_allow


@pytest.mark.asyncio
async def test_credential_bearing_urls_and_ports():
    # Verify valid URLs with credentials, explicit ports, and mixed schemes do not raise validation errors
    validate_url_scheme("https://user:pass@example.com")
    validate_url_scheme("http://example.com:8080/path")
    validate_url_scheme("hTtP://google.com:443")
    validate_url_scheme("HTTPS://user:pass@google.com:80/abc?q=1")


@pytest.mark.asyncio
async def test_ssrf_redirect_chain_block():
    from backend.services.http_client import SafeAsyncHTTPTransport
    transport = SafeAsyncHTTPTransport(network_backend=SafeAsyncioBackend())
    
    original_allow = settings.ALLOW_PRIVATE_IPS
    settings.ALLOW_PRIVATE_IPS = False
    
    try:
        # Create an AsyncClient with our custom transport
        client = httpx.AsyncClient(transport=transport)
        
        original_handle = transport.handle_async_request
        
        async def mock_handle(request, *args, **kwargs):
            if "target.com" in str(request.url):
                # Return a 302 redirect response without making any socket connection
                return httpx.Response(
                    status_code=302,
                    headers={"Location": "http://127.0.0.1/sensitive"},
                    request=request
                )
            # Otherwise, fall back to the actual transport handle (which will call connect_tcp)
            return await original_handle(request, *args, **kwargs)
            
        with mock.patch.object(transport, "handle_async_request", mock_handle):
            with pytest.raises(Exception) as excinfo:
                await client.get("http://target.com/redirect", follow_redirects=True)
                
            # Assert that the error is indeed the SSRF block ValueError from connect_tcp
            assert "SSRF block" in str(excinfo.value) or (excinfo.value.__cause__ and "SSRF block" in str(excinfo.value.__cause__))
            
    finally:
        settings.ALLOW_PRIVATE_IPS = original_allow


