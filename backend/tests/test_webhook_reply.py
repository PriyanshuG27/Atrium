import pytest
import json
import unittest.mock as mock
from fastapi.testclient import TestClient

from backend.main import app

# Mocks for database connection
class MockReplyCursor:
    def __init__(self):
        self.executed = []
        self.tags = ["initial_tag"]
        self.rowcount = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

    async def execute(self, query, params=None):
        self.executed.append((query, params))
        query_upper = query.upper()
        if "INSERT INTO PROCESSED_UPDATES" in query_upper:
            self.rowcount = 1
        elif "INSERT INTO USERS" in query_upper:
            self.rowcount = 1
        elif "UPDATE ITEMS SET TAGS" in query_upper:
            self.tags = params[0]
            self.rowcount = 1
        elif "UPDATE ITEMS SET CONTEXT_NOTE" in query_upper:
            self.rowcount = 1

    async def fetchone(self):
        last_query = self.executed[-1][0].upper()
        if "SELECT TAGS" in last_query:
            return (self.tags,)
        elif "SELECT ID" in last_query:
            return (1,)
        elif "SELECT COUNT(*)" in last_query:
            return (3,)
        return None

class MockReplyConnection:
    def __init__(self):
        self._cursor = MockReplyCursor()

    def cursor(self):
        return self._cursor

    async def commit(self):
        pass

@pytest.fixture()
def db_conn():
    return MockReplyConnection()

@pytest.fixture(autouse=True)
def override_db(db_conn):
    from backend.db.connection import get_db
    async def _mock_get_db():
        yield db_conn
    app.dependency_overrides[get_db] = _mock_get_db
    yield
    app.dependency_overrides.pop(get_db, None)

@pytest.fixture(autouse=True)
def mock_redis():
    with mock.patch("backend.routes.webhook.redis", new_callable=mock.AsyncMock) as m:
        m.get.return_value = None
        yield m

@pytest.fixture()
def mock_telegram_ack():
    with mock.patch("backend.routes.webhook.send_telegram_ack", new_callable=mock.AsyncMock) as m:
        yield m

@pytest.fixture(autouse=True)
def mock_rate_limit():
    with mock.patch("backend.routes.webhook.check_rate_limit", new_callable=mock.AsyncMock) as m:
        yield m

@pytest.fixture()
def client():
    with mock.patch("backend.db.connection.open_pool", return_value=None), \
         mock.patch("backend.db.connection.close_pool", return_value=None):
        with TestClient(app) as c:
            yield c

def test_reply_to_bot_message_with_tags(client, db_conn, mock_redis, mock_telegram_ack):
    """Replying to a bot confirmation message with tags updates the item tags."""
    # Mock redis mapping message_id 123 -> item_id 456
    mock_redis.get.side_effect = lambda key: "456" if "message_to_item:12345:123" in key else None

    payload = {
        "update_id": 9999,
        "message": {
            "message_id": 124,
            "chat": {"id": 12345},
            "text": "#ai #testing",
            "reply_to_message": {
                "message_id": 123,
                "text": "Saved."
            }
        }
    }

    response = client.post("/webhook", json=payload)
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "detail": "reply_tags_saved"}

    # Verify database tag update was called
    executed_queries = [q[0] for q in db_conn._cursor.executed]
    assert any("UPDATE items SET tags" in q for q in executed_queries)
    
    # Verify new tags contain both original and reply tags (merged and sorted/unique)
    assert set(db_conn._cursor.tags) == {"initial_tag", "ai", "testing"}

    # Verify telegram ACK was sent
    mock_telegram_ack.assert_called_once()
    args = mock_telegram_ack.call_args[0]
    assert args[0] == "12345"
    assert "Tags updated" in args[1]
    assert "#ai" in args[1]
    assert "#testing" in args[1]
    assert "#initial_tag" in args[1]

def test_reply_to_bot_message_with_context_note(client, db_conn, mock_redis, mock_telegram_ack):
    """Replying to a bot confirmation message with text saves it as a context note."""
    # Mock redis mapping message_id 123 -> item_id 456
    mock_redis.get.side_effect = lambda key: "456" if "message_to_item:12345:123" in key else None

    payload = {
        "update_id": 9999,
        "message": {
            "message_id": 124,
            "chat": {"id": 12345},
            "text": "This is a great reference for testing",
            "reply_to_message": {
                "message_id": 123,
                "text": "Saved."
            }
        }
    }

    response = client.post("/webhook", json=payload)
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "detail": "reply_context_note_saved"}

    # Verify database context note update was called
    executed_queries = db_conn._cursor.executed
    update_note_query = next(item for item in executed_queries if "UPDATE items SET context_note" in item[0])
    assert update_note_query[1][0] == "This is a great reference for testing"
    assert update_note_query[1][1] == 456  # item_id

    # Verify telegram ACK was sent
    mock_telegram_ack.assert_called_once()
    args = mock_telegram_ack.call_args[0]
    assert args[0] == "12345"
    assert "Context note saved" in args[1]
    assert "This is a great reference for testing" in args[1]

def test_reply_to_user_own_message_with_context_note(client, db_conn, mock_redis, mock_telegram_ack):
    """Replying to user's own original message with text saves it as a context note."""
    # Mock redis mapping of user's original message_id 122 -> item_id 456
    mock_redis.get.side_effect = lambda key: "456" if "message_to_item:12345:122" in key else None

    payload = {
        "update_id": 9999,
        "message": {
            "message_id": 124,
            "chat": {"id": 12345},
            "text": "It's dippr burger",
            "reply_to_message": {
                "message_id": 122,
                "text": "https://www.instagram.com/reel/abc/"
            }
        }
    }

    response = client.post("/webhook", json=payload)
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "detail": "reply_context_note_saved"}

    # Verify database context note update was called
    executed_queries = db_conn._cursor.executed
    update_note_query = next(item for item in executed_queries if "UPDATE items SET context_note" in item[0])
    assert update_note_query[1][0] == "It's dippr burger"
    assert update_note_query[1][1] == 456  # item_id

    # Verify telegram ACK was sent
    mock_telegram_ack.assert_called_once()
    args = mock_telegram_ack.call_args[0]
    assert args[0] == "12345"
    assert "Context note saved" in args[1]
    assert "It's dippr burger" in args[1]

def test_reply_deferred_during_processing(client, db_conn, mock_redis, mock_telegram_ack):
    """Replying to user's own original message that is still processing gets deferred and queued in Redis."""
    # Mock redis get to return None (item is not saved yet, so no message_to_item mapping exists)
    mock_redis.get.return_value = None

    payload = {
        "update_id": 9999,
        "message": {
            "message_id": 124,
            "chat": {"id": 12345},
            "text": "It's dippr burger",
            "reply_to_message": {
                "message_id": 122,
                "text": "https://www.instagram.com/reel/abc/"
            }
        }
    }

    response = client.post("/webhook", json=payload)
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "detail": "reply_deferred"}

    # Verify that the reply is pushed to the deferred list in Redis
    mock_redis.rpush.assert_called_once()
    args = mock_redis.rpush.call_args[0]
    assert args[0] == "deferred_replies:12345:122"
    reply_payload = json.loads(args[1])
    assert reply_payload["text"] == "It's dippr burger"
    assert reply_payload["message_id"] == 124

    # Verify that the Redis expiration is set
    mock_redis.expire.assert_called_once_with("deferred_replies:12345:122", 3600)

    # Verify telegram ACK was sent with "Context note queued"
    mock_telegram_ack.assert_called_once()
    args = mock_telegram_ack.call_args[0]
    assert args[0] == "12345"
    assert "Context note queued" in args[1]
    assert "It's dippr burger" in args[1]
