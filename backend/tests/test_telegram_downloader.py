"""
backend/tests/test_telegram_downloader.py
==========================================
Unit tests for robust Telegram downloader service.
"""

import pytest
import httpx
import os
import asyncio
import unittest.mock as mock
from backend.services.telegram_downloader import get_telegram_file_info, download_telegram_file_robust
from backend.config import settings

class MockStreamContext:
    def __init__(self, response):
        self.response = response
    async def __aenter__(self):
        return self.response
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

@pytest.mark.asyncio
async def test_get_telegram_file_info_success(monkeypatch):
    mock_resp = mock.Mock()
    mock_resp.status_code = 200
    mock_resp.json = mock.Mock(return_value={
        "ok": True,
        "result": {
            "file_path": "voice/file_0.ogg",
            "file_size": 1024
        }
    })
    
    async def mock_get(self_client, url, *args, **kwargs):
        return mock_resp
        
    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)
    
    file_path, file_size = await get_telegram_file_info("file_id_123")
    assert file_path == "voice/file_0.ogg"
    assert file_size == 1024

@pytest.mark.asyncio
async def test_get_telegram_file_info_empty_path(monkeypatch):
    mock_resp = mock.Mock()
    mock_resp.status_code = 200
    mock_resp.json = mock.Mock(return_value={
        "ok": True,
        "result": {}
    })
    
    async def mock_get(self_client, url, *args, **kwargs):
        return mock_resp
        
    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)
    
    with pytest.raises(ValueError, match="Telegram getFile returned empty file_path"):
        await get_telegram_file_info("file_id_123")

@pytest.mark.asyncio
async def test_get_telegram_file_info_network_error_retry(monkeypatch):
    mock_resp = mock.Mock()
    mock_resp.status_code = 200
    mock_resp.json = mock.Mock(return_value={
        "ok": True,
        "result": {
            "file_path": "voice/file_0.ogg",
            "file_size": 1024
        }
    })
    
    calls = []
    async def mock_get(self_client, url, *args, **kwargs):
        calls.append(url)
        if len(calls) == 1:
            raise httpx.ReadTimeout("Timeout")
        return mock_resp
        
    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)
    
    # Mock sleep to run fast
    async def mock_sleep(seconds):
        pass
    monkeypatch.setattr("asyncio.sleep", mock_sleep)
    
    file_path, file_size = await get_telegram_file_info("file_id_123")
    assert file_path == "voice/file_0.ogg"
    assert file_size == 1024
    assert len(calls) == 2

@pytest.mark.asyncio
async def test_get_telegram_file_info_all_attempts_fail(monkeypatch):
    async def mock_get(self_client, url, *args, **kwargs):
        raise httpx.NetworkError("Network down")
        
    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)
    
    async def mock_sleep(seconds):
        pass
    monkeypatch.setattr("asyncio.sleep", mock_sleep)
    
    with pytest.raises(httpx.NetworkError):
        await get_telegram_file_info("file_id_123")

@pytest.mark.asyncio
async def test_get_telegram_file_info_unexpected_error(monkeypatch):
    async def mock_get(self_client, url, *args, **kwargs):
        raise RuntimeError("Unexpected")
        
    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)
    
    async def mock_sleep(seconds):
        pass
    monkeypatch.setattr("asyncio.sleep", mock_sleep)
    
    with pytest.raises(RuntimeError, match="Unexpected"):
        await get_telegram_file_info("file_id_123")

@pytest.mark.asyncio
async def test_get_telegram_file_info_missing_token(monkeypatch):
    orig_token = settings.TELEGRAM_BOT_TOKEN
    monkeypatch.setattr(settings, "TELEGRAM_BOT_TOKEN", "")
    try:
        with pytest.raises(ValueError, match="TELEGRAM_BOT_TOKEN is not set"):
            await get_telegram_file_info("file_id_123")
    finally:
        settings.TELEGRAM_BOT_TOKEN = orig_token

@pytest.mark.asyncio
async def test_download_telegram_file_robust_oversized(monkeypatch):
    mock_resp = mock.Mock()
    mock_resp.status_code = 200
    mock_resp.json = mock.Mock(return_value={
        "ok": True,
        "result": {
            "file_path": "voice/file_0.ogg",
            "file_size": 999999
        }
    })
    
    async def mock_get(self_client, url, *args, **kwargs):
        return mock_resp
        
    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)
    
    with pytest.raises(ValueError, match="exceeds limit"):
        await download_telegram_file_robust("file_id_123", "dummy.ogg", max_size_bytes=100)

@pytest.mark.asyncio
async def test_download_telegram_file_robust_success(monkeypatch, tmp_path):
    mock_resp = mock.Mock()
    mock_resp.status_code = 200
    mock_resp.json = mock.Mock(return_value={
        "ok": True,
        "result": {
            "file_path": "voice/file_0.ogg",
            "file_size": 100
        }
    })
    
    async def mock_get(self_client, url, *args, **kwargs):
        return mock_resp
        
    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)
    
    mock_stream_resp = mock.Mock()
    mock_stream_resp.status_code = 200
    mock_stream_resp.raise_for_status = mock.Mock()
    
    async def mock_aiter_bytes(*args, **kwargs):
        yield b"chunk1"
        yield b"chunk2"
        
    mock_stream_resp.aiter_bytes = mock_aiter_bytes
    
    def mock_stream(self_client, method, url, *args, **kwargs):
        return MockStreamContext(mock_stream_resp)
        
    monkeypatch.setattr("httpx.AsyncClient.stream", mock_stream)
    
    local_file = str(tmp_path / "downloaded.ogg")
    
    file_path = await download_telegram_file_robust("file_id_123", local_file, max_size_bytes=1000)
    assert file_path == "voice/file_0.ogg"
    
    with open(local_file, "rb") as f:
        content = f.read()
        assert content == b"chunk1chunk2"

@pytest.mark.asyncio
async def test_download_telegram_file_robust_retry_on_network_error(monkeypatch, tmp_path):
    mock_resp = mock.Mock()
    mock_resp.status_code = 200
    mock_resp.json = mock.Mock(return_value={
        "ok": True,
        "result": {
            "file_path": "voice/file_0.ogg",
            "file_size": 100
        }
    })
    
    async def mock_get(self_client, url, *args, **kwargs):
        return mock_resp
        
    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)
    
    mock_stream_resp = mock.Mock()
    mock_stream_resp.status_code = 200
    mock_stream_resp.raise_for_status = mock.Mock()
    
    async def mock_aiter_bytes(*args, **kwargs):
        yield b"content"
        
    mock_stream_resp.aiter_bytes = mock_aiter_bytes
    
    stream_calls = []
    def mock_stream(self_client, method, url, *args, **kwargs):
        stream_calls.append(url)
        if len(stream_calls) == 1:
            raise httpx.ReadTimeout("Timeout")
        return MockStreamContext(mock_stream_resp)
        
    monkeypatch.setattr("httpx.AsyncClient.stream", mock_stream)
    
    async def mock_sleep(seconds):
        pass
    monkeypatch.setattr("asyncio.sleep", mock_sleep)
    
    local_file = str(tmp_path / "downloaded_retry.ogg")
    
    file_path = await download_telegram_file_robust("file_id_123", local_file, max_size_bytes=1000)
    assert file_path == "voice/file_0.ogg"
    assert len(stream_calls) == 2

@pytest.mark.asyncio
async def test_download_telegram_file_robust_unexpected_error_fails(monkeypatch, tmp_path):
    mock_resp = mock.Mock()
    mock_resp.status_code = 200
    mock_resp.json = mock.Mock(return_value={
        "ok": True,
        "result": {
            "file_path": "voice/file_0.ogg",
            "file_size": 100
        }
    })
    
    async def mock_get(self_client, url, *args, **kwargs):
        return mock_resp
        
    monkeypatch.setattr("httpx.AsyncClient.get", mock_get)
    
    def mock_stream(self_client, method, url, *args, **kwargs):
        raise RuntimeError("Unexpected Stream Fail")
        
    monkeypatch.setattr("httpx.AsyncClient.stream", mock_stream)
    
    async def mock_sleep(seconds):
        pass
    monkeypatch.setattr("asyncio.sleep", mock_sleep)
    
    local_file = str(tmp_path / "downloaded_fail.ogg")
    
    with pytest.raises(RuntimeError, match="Unexpected Stream Fail"):
        await download_telegram_file_robust("file_id_123", local_file, max_size_bytes=1000)
