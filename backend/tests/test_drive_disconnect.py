import pytest
import httpx
from fastapi.testclient import TestClient
import unittest.mock as mock

from backend.main import app
from backend.middleware.twa_auth import generate_jwt
from backend.config import settings
from backend.db.connection import get_db
from backend.services.encryption import encrypt

# Mock environment variables
VALID_ENV = {
    "TELEGRAM_BOT_TOKEN": "1234567890:ABCdefGHIjklmnoPQRstuvwxyZ123456789",
    "DATABASE_URL": "postgresql://user:pass@localhost:5432/db?sslmode=require",
    "UPSTASH_REDIS_REST_URL": "https://dev-recall-redis.upstash.io",
    "UPSTASH_REDIS_REST_TOKEN": "dev_upstash_redis_token",
    "FERNET_KEY": "yF4P-W965hF17Bq_Q7g_oG5l8S631P9_9z-d8v7d8sA=",
    "JWT_SECRET": "8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b",
    "WEBSITE_URL": "http://localhost:5173",
    "ENV": "test",
}

@pytest.fixture(autouse=True)
def patch_env(monkeypatch):
    for k, v in VALID_ENV.items():
        monkeypatch.setenv(k, v)

class MockCursor:
    def __init__(self, refresh_token_val=None):
        self.executed = []
        self.refresh_token_val = refresh_token_val
        
    async def __aenter__(self):
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass
        
    async def execute(self, query, params=None):
        self.executed.append((query, params))
        
    async def fetchone(self):
        last_query = self.executed[-1][0].lower() if self.executed else ""
        if "select google_refresh_token from users" in last_query:
            return (self.refresh_token_val,)
        if "telegram_chat_id" in last_query or "users" in last_query:
            return (42, "123456789")
        return None

class MockConnection:
    def __init__(self, cursor_inst):
        self.cursor_inst = cursor_inst
        
    def cursor(self):
        return self.cursor_inst
        
    async def commit(self):
        pass

@pytest.fixture()
def client():
    with mock.patch("backend.db.connection.open_pool", return_value=None), \
         mock.patch("backend.db.connection.close_pool", return_value=None):
        with TestClient(app) as c:
            yield c

def test_drive_disconnect_requires_auth(client):
    """DELETE /api/drive requires a valid JWT cookie."""
    cursor = MockCursor(refresh_token_val=None)
    conn = MockConnection(cursor)
    
    async def _mock_get_db():
        yield conn
        
    app.dependency_overrides[get_db] = _mock_get_db
    
    resp = client.delete("/api/drive")
    assert resp.status_code == 401
    
    app.dependency_overrides.pop(get_db, None)

def test_drive_disconnect_already_null(client):
    """If google_refresh_token is already NULL, return 204 directly without updates or network calls."""
    cursor = MockCursor(refresh_token_val=None)
    conn = MockConnection(cursor)
    
    async def _mock_get_db():
        yield conn
        
    app.dependency_overrides[get_db] = _mock_get_db
    
    payload = {"sub": "42", "chat_id": "123456789"}
    token = generate_jwt(payload, settings.JWT_SECRET)
    
    resp = client.delete("/api/drive", cookies={"atrium_session": token})
    assert resp.status_code == 204
    
    # Verify no UPDATE users SET google_refresh_token = NULL queries were run
    queries = [q[0] for q in cursor.executed]
    assert not any("UPDATE users" in q for q in queries)
    
    app.dependency_overrides.pop(get_db, None)

@pytest.mark.anyio
async def test_drive_disconnect_success(client):
    """Successfully decrypts token, calls Google revoke, updates DB to NULL, returns 204."""
    plain_token = "my_google_refresh_token"
    enc_token = encrypt(plain_token)
    
    cursor = MockCursor(refresh_token_val=enc_token)
    conn = MockConnection(cursor)
    
    async def _mock_get_db():
        yield conn
        
    app.dependency_overrides[get_db] = _mock_get_db
    
    # Mock Google revoke request returning 200
    mock_resp = mock.MagicMock()
    mock_resp.status_code = 200
    mock_resp.raise_for_status = mock.MagicMock()
    mock_post = mock.AsyncMock(return_value=mock_resp)
    
    payload = {"sub": "42", "chat_id": "123456789"}
    token = generate_jwt(payload, settings.JWT_SECRET)
    
    with mock.patch("httpx.AsyncClient.post", mock_post):
        resp = client.delete("/api/drive", cookies={"atrium_session": token})
        assert resp.status_code == 204
        mock_post.assert_called_once()
        # Verify URL called has the correct plain refresh token
        args, kwargs = mock_post.call_args
        called_url = args[0]
        assert plain_token in called_url
        assert "revoke" in called_url
        
    # Verify database update to set refresh_token and last_sync to NULL
    queries = [q[0] for q in cursor.executed]
    assert any("UPDATE users" in q and "google_refresh_token = NULL" in q for q in queries)
    assert any("google_last_sync = NULL" in q for q in queries)
    
    app.dependency_overrides.pop(get_db, None)

@pytest.mark.anyio
@pytest.mark.parametrize("google_status", [400, 503])
async def test_drive_disconnect_google_error(client, google_status):
    """If Google revoke fails with status 400 or 503, database should still be set to NULL."""
    plain_token = "my_google_refresh_token"
    enc_token = encrypt(plain_token)
    
    cursor = MockCursor(refresh_token_val=enc_token)
    conn = MockConnection(cursor)
    
    async def _mock_get_db():
        yield conn
        
    app.dependency_overrides[get_db] = _mock_get_db
    
    # Mock Google revoke request returning error
    mock_resp = mock.MagicMock()
    mock_resp.status_code = google_status
    mock_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
        message=f"Error status {google_status}",
        request=mock.MagicMock(),
        response=mock_resp
    )
    mock_post = mock.AsyncMock(return_value=mock_resp)
    
    payload = {"sub": "42", "chat_id": "123456789"}
    token = generate_jwt(payload, settings.JWT_SECRET)
    
    with mock.patch("httpx.AsyncClient.post", mock_post):
        resp = client.delete("/api/drive", cookies={"atrium_session": token})
        assert resp.status_code == 204
        mock_post.assert_called_once()
        
    # Verify local columns are still updated to NULL
    queries = [q[0] for q in cursor.executed]
    assert any("UPDATE users" in q and "google_refresh_token = NULL" in q for q in queries)
    
    app.dependency_overrides.pop(get_db, None)

@pytest.mark.anyio
async def test_drive_disconnect_network_error(client):
    """If a network error occurs, database should still be set to NULL."""
    plain_token = "my_google_refresh_token"
    enc_token = encrypt(plain_token)
    
    cursor = MockCursor(refresh_token_val=enc_token)
    conn = MockConnection(cursor)
    
    async def _mock_get_db():
        yield conn
        
    app.dependency_overrides[get_db] = _mock_get_db
    
    # Mock network connection error
    mock_post = mock.AsyncMock(side_effect=httpx.ConnectError("Connection refused"))
    
    payload = {"sub": "42", "chat_id": "123456789"}
    token = generate_jwt(payload, settings.JWT_SECRET)
    
    with mock.patch("httpx.AsyncClient.post", mock_post):
        resp = client.delete("/api/drive", cookies={"atrium_session": token})
        assert resp.status_code == 204
        mock_post.assert_called_once()
        
    # Verify local columns are still updated to NULL
    queries = [q[0] for q in cursor.executed]
    assert any("UPDATE users" in q and "google_refresh_token = NULL" in q for q in queries)
    
    app.dependency_overrides.pop(get_db, None)
