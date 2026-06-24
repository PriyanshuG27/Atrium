import pytest
import json
import httpx
import unittest.mock as mock
from backend.services.dlq import write_to_dlq, send_failure_message, TEMPLATES, DEFAULT_TEMPLATE

class MockDlqCursor:
    def __init__(self):
        self.queries = []
        
    async def __aenter__(self):
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass
        
    async def execute(self, query, params=None):
        self.queries.append((query, params))

class MockDlqConnection:
    def __init__(self):
        self._cursor = MockDlqCursor()
        self.committed = False
        
    def cursor(self):
        return self._cursor
        
    async def commit(self):
        self.committed = True

@pytest.mark.asyncio
async def test_write_to_dlq_success():
    conn = MockDlqConnection()
    payload = {
        "chat_id": "123456789",
        "content_type": "voice",
        "file_id": "file_123",
        "update_id": "9999",
        "attempted_tiers": [0, 1, 2, 3],
        "last_error": "Modal Timeout"
    }
    
    await write_to_dlq(42, payload, "Verification error", conn)
    
    # Assert DB query executed and committed
    assert conn.committed is True
    assert len(conn._cursor.queries) == 1
    
    query, params = conn._cursor.queries[0]
    assert "INSERT INTO dead_letter_queue" in query
    assert params[0] == 42
    
    # Assert payload was serialized correctly
    parsed_payload = json.loads(params[1])
    assert parsed_payload["chat_id"] == "123456789"
    assert parsed_payload["attempted_tiers"] == [0, 1, 2, 3]
    assert params[2] == "Verification error"

@pytest.mark.asyncio
async def test_write_to_dlq_no_raise_on_db_error():
    # A connection that raises exceptions on everything
    class BrokenConnection:
        def cursor(self):
            raise RuntimeError("Database connection lost")
            
    # Should not raise any exceptions
    payload = {"key": "val"}
    await write_to_dlq(42, payload, "DB Error Test", BrokenConnection())

@pytest.mark.asyncio
async def test_write_to_dlq_invalid_payload():
    # Payload containing something non-serializable (like a set)
    payload = {"invalid_field": {1, 2, 3}}
    conn = MockDlqConnection()
    
    # Should not raise any exceptions, and should not write to DB
    await write_to_dlq(42, payload, "JSON Error Test", conn)
    assert len(conn._cursor.queries) == 0
    assert conn.committed is False

@pytest.mark.asyncio
async def test_send_failure_message_templates():
    for content_type, template in TEMPLATES.items():
        mock_resp = mock.Mock()
        mock_resp.status_code = 200
        
        with mock.patch("httpx.AsyncClient.post", new_callable=mock.AsyncMock) as mock_post:
            mock_post.return_value = mock_resp
            
            await send_failure_message("123456789", content_type)
            
            # Verify the correct text was sent to Telegram
            mock_post.assert_called_once()
            call_kwargs = mock_post.call_args[1]
            assert call_kwargs["json"]["chat_id"] == "123456789"
            assert call_kwargs["json"]["text"] == template

@pytest.mark.asyncio
async def test_send_failure_message_fallback():
    mock_resp = mock.Mock()
    mock_resp.status_code = 200
    
    with mock.patch("httpx.AsyncClient.post", new_callable=mock.AsyncMock) as mock_post:
        mock_post.return_value = mock_resp
        
        await send_failure_message("123456789", "unsupported_type")
        
        mock_post.assert_called_once()
        call_kwargs = mock_post.call_args[1]
        assert call_kwargs["json"]["text"] == DEFAULT_TEMPLATE
