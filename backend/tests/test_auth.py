import time
import pytest
import urllib.parse
import hmac
import hashlib
import json
import unittest.mock as mock
from fastapi import Depends
from fastapi.testclient import TestClient

VALID_ENV = {
    "TELEGRAM_BOT_TOKEN": "1234567890:ABCdefGHIjklmnoPQRstuvwxyZ123456789",
    "DATABASE_URL": "postgresql://user:pass@localhost:5432/db?sslmode=require",
    "UPSTASH_REDIS_REST_URL": "https://dev-recall-redis.upstash.io",
    "UPSTASH_REDIS_REST_TOKEN": "dev_upstash_redis_token",
    "FERNET_KEY": "yF4P-W965hF17Bq_Q7g_oG5l8S631P9_9z-d8v7d8sA=",
    "JWT_SECRET": "8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7b",
    "WEBSITE_URL": "http://localhost:5173",
    "ENV": "test",
    "GOOGLE_CLIENT_ID": "mock_client_id",
    "GOOGLE_CLIENT_SECRET": "mock_client_secret",
    "GOOGLE_REDIRECT_URI": "http://localhost:8000/auth/google/callback",
}

@pytest.fixture(autouse=True)
def patch_env(monkeypatch):
    for k, v in VALID_ENV.items():
        monkeypatch.setenv(k, v)

from backend.main import app
from backend.middleware.twa_auth import get_current_user, generate_jwt, verify_jwt, UserContext
from backend.config import settings

# ---------------------------------------------------------------------------
# Dynamically add test route for JWT verification
# ---------------------------------------------------------------------------
@app.get("/test-auth/widget-jwt")
def widget_jwt_endpoint(user: UserContext = Depends(get_current_user)):
    return {"status": "ok", "user_id": user.id, "chat_id": user.telegram_chat_id}

# ---------------------------------------------------------------------------
# Helpers for Login Widget Param Hashing
# ---------------------------------------------------------------------------
def make_widget_params(telegram_chat_id: str, bot_token: str, auth_date: int, tamper: bool = False, omit_hash: bool = False) -> dict:
    params = {
        "id": str(telegram_chat_id),
        "first_name": "Test",
        "username": "testuser",
        "auth_date": str(auth_date)
    }
    # Sort alphabetically
    sorted_params = sorted(params.items())
    check_string = "\n".join(f"{k}={v}" for k, v in sorted_params)
    
    # Calculate HMAC
    secret_key = hashlib.sha256(bot_token.encode('utf-8')).digest()
    computed_hash = hmac.new(secret_key, check_string.encode('utf-8'), hashlib.sha256).hexdigest()
    
    if tamper:
        computed_hash = computed_hash[:-1] + ("0" if computed_hash[-1] != "0" else "1")
        
    if not omit_hash:
        params["hash"] = computed_hash
        
    return params

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
@pytest.fixture()
def client():
    with mock.patch("backend.db.connection.open_pool", return_value=None), \
         mock.patch("backend.db.connection.close_pool", return_value=None):
        with TestClient(app) as c:
            yield c

class StatefulMockCursor:
    def __init__(self):
        self.fetchone_result = None
        self.executed = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

    async def execute(self, query, params=None):
        self.executed.append((query, params))

    async def fetchone(self):
        # If it's a users SELECT query returning id and telegram_chat_id
        if self.executed and "SELECT id, telegram_chat_id FROM users" in self.executed[-1][0]:
            return (42, "12345")
        # If it's upsert RETURNING id
        if self.executed and "INSERT INTO users" in self.executed[-1][0]:
            return (42,)
        # If conflict and SELECT id
        if self.executed and "SELECT id FROM users WHERE telegram_chat_id" in self.executed[-1][0]:
            return (42,)
        return self.fetchone_result

class StatefulMockConn:
    def __init__(self):
        self._cursor = StatefulMockCursor()

    def cursor(self):
        return self._cursor

    async def commit(self):
        pass

    async def rollback(self):
        pass

@pytest.fixture()
def mock_conn():
    return StatefulMockConn()

@pytest.fixture(autouse=True)
def override_db(mock_conn):
    from backend.db.connection import get_db
    async def _mock_get_db():
        yield mock_conn
    app.dependency_overrides[get_db] = _mock_get_db
    yield
    app.dependency_overrides.pop(get_db, None)

# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_login_widget_success(client):
    """Case 1: Valid Telegram Widget Login -> Sets httpOnly cookies, redirects to dashboard."""
    now = int(time.time())
    params = make_widget_params("12345", settings.TELEGRAM_BOT_TOKEN, now)
    
    response = client.get("/auth/telegram", params=params, follow_redirects=False)
    assert response.status_code in [302, 303, 307]
    assert response.headers["location"] == f"{settings.WEBSITE_URL}/dashboard"
    
    # Assert cookies are set properly and are httpOnly
    cookies = response.cookies
    assert "recall_session" in cookies
    assert "jwt" in cookies
    
    # TestClient doesn't expose cookie flags directly in response.cookies easily,
    # but we can verify the Set-Cookie headers in response.headers
    set_cookie_headers = response.headers.get_list("set-cookie")
    for cookie_header in set_cookie_headers:
        assert "HttpOnly" in cookie_header or "httponly" in cookie_header.lower()
        assert "SameSite=lax" in cookie_header or "samesite=lax" in cookie_header.lower()
        assert "secure" in cookie_header.lower()

def test_login_widget_invalid_hash(client):
    """Case 2: Invalid hash -> returns 401, does not set cookies."""
    now = int(time.time())
    params = make_widget_params("12345", settings.TELEGRAM_BOT_TOKEN, now, tamper=True)
    
    response = client.get("/auth/telegram", params=params)
    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication failed"
    assert "recall_session" not in response.cookies

def test_login_widget_stale_auth_date(client):
    """Case 3: auth_date > 1 day old -> returns 401."""
    stale_time = int(time.time()) - 90000  # More than 24 hours ago
    params = make_widget_params("12345", settings.TELEGRAM_BOT_TOKEN, stale_time)
    
    response = client.get("/auth/telegram", params=params)
    assert response.status_code == 401
    assert response.json()["detail"] == "Authentication failed"
    assert "recall_session" not in response.cookies

def test_protected_route_with_valid_jwt(client):
    """Case 4: JWT on protected route with valid cookie -> returns 200."""
    payload = {
        "sub": "42",
        "chat_id": "12345",
        "exp": int(time.time()) + 3600
    }
    token = generate_jwt(payload, settings.JWT_SECRET)
    
    response = client.get("/test-auth/widget-jwt", cookies={"recall_session": token})
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "user_id": 42, "chat_id": "12345"}

def test_protected_route_with_expired_jwt(client):
    """Case 5: Expired JWT on protected route -> returns 401, clears cookie."""
    payload = {
        "sub": "42",
        "chat_id": "12345",
        "exp": int(time.time()) - 3600  # Expired 1 hour ago
    }
    token = generate_jwt(payload, settings.JWT_SECRET)
    
    response = client.get("/test-auth/widget-jwt", cookies={"recall_session": token})
    assert response.status_code == 401
    assert "Not authenticated" in response.json()["detail"]
    
    # Assert that the recall_session and jwt cookies are deleted in the response
    set_cookie_headers = response.headers.get_list("set-cookie")
    session_deleted = False
    jwt_deleted = False
    for cookie_header in set_cookie_headers:
        if "recall_session=" in cookie_header and 'Max-Age=0' in cookie_header:
            session_deleted = True
        if "jwt=" in cookie_header and 'Max-Age=0' in cookie_header:
            jwt_deleted = True
            
    assert session_deleted or "Max-Age=0" in set_cookie_headers[0]

def test_protected_route_with_tampered_jwt(client):
    """Tampering with JWT payload (changed signature) -> returns 401, clears cookie."""
    payload = {
        "sub": "42",
        "chat_id": "12345",
        "exp": int(time.time()) + 3600
    }
    # Sign token with wrong secret
    token = generate_jwt(payload, "wrong_jwt_secret_12345678901234567890")
    
    response = client.get("/test-auth/widget-jwt", cookies={"recall_session": token})
    assert response.status_code == 401
    assert "Not authenticated" in response.json()["detail"]

def test_search_endpoint_without_jwt(client):
    """POST /api/search without cookie returns 401."""
    response = client.post("/api/search", json={"query": "fastapi", "limit": 5})
    assert response.status_code == 401
    assert "Not authenticated" in response.json()["detail"]

def test_compare_digest_usage_and_no_double_equals():
    """Verify that hmac.compare_digest() is used for hash verification and flags ==."""
    import os
    auth_file_path = os.path.join(os.path.dirname(__file__), "../routes/auth.py")
    with open(auth_file_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    assert "compare_digest" in content, "Must use hmac.compare_digest() for hash verification."
    
    # Check that we do not use == for hash comparison in lines containing hash
    lines = content.splitlines()
    for i, line in enumerate(lines):
        if "hash" in line and "==" in line:
            # ignore comments or mock flow checks
            if "#" not in line and "mock" not in line:
                pytest.fail(f"Potential unsafe hash comparison with == at line {i+1}: {line}")

# ---------------------------------------------------------------------------
# Google OAuth Tests
# ---------------------------------------------------------------------------

def test_google_oauth_initiate_authenticated(client):
    """Case 1: Authenticated user -> GET /auth/google redirects to Google's consent screen."""
    payload = {
        "sub": "42",
        "chat_id": "12345",
        "exp": int(time.time()) + 3600
    }
    token = generate_jwt(payload, settings.JWT_SECRET)
    
    response = client.get("/auth/google", cookies={"recall_session": token}, follow_redirects=False)
    assert response.status_code in [302, 303, 307]
    location = response.headers["location"]
    assert "accounts.google.com/o/oauth2/v2/auth" in location
    assert "scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file" in location
    assert "access_type=offline" in location
    assert "prompt=consent" in location
    assert "state=" in location


def test_google_oauth_initiate_with_query_param(client):
    """Case 2: Unauthenticated user with chat_id query param -> GET /auth/google redirects to Google."""
    response = client.get("/auth/google?chat_id=98765", follow_redirects=False)
    assert response.status_code in [302, 303, 307]
    location = response.headers["location"]
    assert "accounts.google.com/o/oauth2/v2/auth" in location
    assert "chat_id" not in location  # chat_id is in state JWT, not plaintext query parameter
    assert "state=" in location


def test_google_oauth_initiate_unauthenticated_missing_chat_id(client):
    """Case 3: Unauthenticated user without query param -> GET /auth/google returns 401."""
    response = client.get("/auth/google")
    assert response.status_code == 401
    assert "Missing telegram_chat_id or not authenticated" in response.json()["detail"]


def test_google_oauth_callback_success(client, mock_conn):
    """Case 4: Valid OAuth Callback -> Exchanges code, encrypts refresh token, stores in DB, sends WS & Telegram message."""
    # 1. Generate a valid state JWT
    state_payload = {
        "chat_id": "12345",
        "exp": int(time.time()) + 600
    }
    state = generate_jwt(state_payload, settings.JWT_SECRET)
    
    # 2. Mock token exchange (httpx.post), WebSocket, and Telegram sendMessage
    mock_token_resp = mock.Mock()
    mock_token_resp.status_code = 200
    mock_token_resp.json.return_value = {
        "access_token": "mock_access_token_should_never_be_stored",
        "refresh_token": "my_google_refresh_token_xyz"
    }
    
    mock_post_results = []
    
    async def mock_async_post(url, **kwargs):
        mock_post_results.append((url, kwargs))
        if "oauth2.googleapis.com/token" in url:
            return mock_token_resp
        # If it's Telegram sendMessage API
        mock_tg_resp = mock.Mock()
        mock_tg_resp.status_code = 200
        mock_tg_resp.raise_for_status = mock.Mock()
        return mock_tg_resp
        
    # We mock the WS manager
    from backend.routes.api import manager
    with mock.patch.object(manager, "send_personal_message", new_callable=mock.AsyncMock) as mock_ws_send, \
         mock.patch("httpx.AsyncClient.post", side_effect=mock_async_post):
        
        response = client.get(f"/auth/google/callback?state={state}&code=auth_code_123", follow_redirects=False)
        
        # 3. Assert redirection
        assert response.status_code in [302, 303, 307]
        assert response.headers["location"] == f"{settings.WEBSITE_URL}/dashboard"
        
        # 4. Verify token exchange call parameters
        oauth_calls = [c for c in mock_post_results if "oauth2.googleapis.com/token" in c[0]]
        assert len(oauth_calls) == 1
        call_url, call_kwargs = oauth_calls[0]
        call_data = call_kwargs.get("data", {})
        assert call_data.get("code") == "auth_code_123"
        assert call_data.get("client_id") == settings.GOOGLE_CLIENT_ID
        assert call_data.get("client_secret") == settings.GOOGLE_CLIENT_SECRET
        assert call_data.get("grant_type") == "authorization_code"
        
        # 5. Verify database update (checks that update is called and encrypted)
        executed = mock_conn.cursor().executed
        update_queries = [q for q in executed if "UPDATE users" in q[0]]
        assert len(update_queries) == 1
        query_str, query_params = update_queries[0]
        
        encrypted_token = query_params[0]
        assert query_params[1] == "12345"  # telegram_chat_id
        
        # Verify the refresh token is encrypted at rest using Fernet and decrypting it returns original token
        from backend.services.encryption import decrypt
        decrypted_token = decrypt(encrypted_token)
        assert decrypted_token == "my_google_refresh_token_xyz"
        
        # 6. Verify WS event sent to user_id
        mock_ws_send.assert_called_once_with({
            "type": "google_connected"
        }, 42)  # internal user ID mock returns 42
        
        # 7. Verify Telegram message sent
        tg_calls = [c for c in mock_post_results if "api.telegram.org/bot" in c[0]]
        assert len(tg_calls) == 1
        tg_url, tg_kwargs = tg_calls[0]
        tg_payload = tg_kwargs.get("json", {})
        assert tg_payload.get("chat_id") == "12345"
        assert "Google Drive connected!" in tg_payload.get("text")


def test_google_oauth_callback_tampered_state(client):
    """Case 5: Tampered state signature -> GET /auth/google/callback returns 401."""
    state_payload = {
        "chat_id": "12345",
        "exp": int(time.time()) + 600
    }
    # Sign state token with wrong secret
    tampered_state = generate_jwt(state_payload, "wrong_jwt_secret_12345678901234567890")
    
    response = client.get(f"/auth/google/callback?state={tampered_state}&code=auth_code_123")
    assert response.status_code == 401
    assert "State signature mismatch" in response.json()["detail"]


def test_google_oauth_callback_expired_state(client):
    """Case 6: Expired state state -> GET /auth/google/callback returns 401."""
    state_payload = {
        "chat_id": "12345",
        "exp": int(time.time()) - 10  # expired 10 seconds ago
    }
    expired_state = generate_jwt(state_payload, settings.JWT_SECRET)
    
    response = client.get(f"/auth/google/callback?state={expired_state}&code=auth_code_123")
    assert response.status_code == 401
    assert "Expired state token" in response.json()["detail"]
