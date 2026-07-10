import time
import pytest
import unittest.mock as mock
from fastapi import Depends
from fastapi.testclient import TestClient

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

from backend.main import app
from backend.middleware.twa_auth import get_current_user, generate_jwt, UserContext
from backend.config import settings

# Register a test endpoint for checking auto-refresh dependency
@app.get("/test-logout/refresh")
def refresh_endpoint(user: UserContext = Depends(get_current_user)):
    return {"status": "ok", "user_id": user.id, "chat_id": user.telegram_chat_id}

class MockCursor:
    async def __aenter__(self):
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass
        
    async def execute(self, query, params=None):
        pass
        
    async def fetchone(self):
        return (42, "123456789")

class MockConnection:
    def cursor(self):
        return MockCursor()
        
    async def commit(self):
        pass

@pytest.fixture(autouse=True)
def override_db():
    from backend.db.connection import get_db
    async def _mock_get_db():
        yield MockConnection()
    app.dependency_overrides[get_db] = _mock_get_db
    yield
    app.dependency_overrides.pop(get_db, None)

@pytest.fixture()
def client():
    with mock.patch("backend.db.connection.open_pool", return_value=None), \
         mock.patch("backend.db.connection.close_pool", return_value=None):
        with TestClient(app) as c:
            yield c

def test_logout_clears_cookies(client):
    """POST /auth/logout clears atrium_session and jwt cookies with correct attributes."""
    response = client.post("/auth/logout")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "message": "Logged out"}
    
    # Check headers for deleted cookies
    cookies = response.cookies
    assert "atrium_session" not in cookies or cookies["atrium_session"] == ""
    assert "jwt" not in cookies or cookies["jwt"] == ""
    
    # Verify exact delete_cookie headers have correct attributes (httpOnly, Secure, SameSite=lax)
    headers = response.headers.get_list("set-cookie")
    for cookie_header in headers:
        assert "HttpOnly" in cookie_header
        assert "Secure" in cookie_header
        assert "samesite=lax" in cookie_header.lower()
        assert "max-age=0" in cookie_header or "expires=" in cookie_header

def test_jwt_auto_refresh(client):
    """JWT with < 1 day remaining gets refreshed automatically (new cookies issued)."""
    now = int(time.time())
    # 12 hours (43200 seconds) remaining
    payload = {
        "sub": "42",
        "chat_id": "123456789",
        "exp": now + 43200
    }
    token = generate_jwt(payload, settings.JWT_SECRET)
    
    # Trigger an authenticated request
    response = client.get("/test-logout/refresh", cookies={"atrium_session": token})
    assert response.status_code == 200
    assert response.json()["user_id"] == 42
    
    # Verify cookie was refreshed and set in response headers
    headers = response.headers.get_list("set-cookie")
    assert len(headers) >= 2 # sets both atrium_session and jwt
    
    atrium_session_header = next((h for h in headers if "atrium_session=" in h), None)
    jwt_header = next((h for h in headers if "jwt=" in h), None)
    
    assert atrium_session_header is not None
    assert "HttpOnly" in atrium_session_header
    assert "Secure" in atrium_session_header
    assert "samesite=lax" in atrium_session_header.lower()
    assert "Max-Age=604800" in atrium_session_header # 7 days
    
    assert jwt_header is not None
    assert "HttpOnly" in jwt_header
    assert "Secure" in jwt_header
    assert "samesite=lax" in jwt_header.lower()
    assert "Max-Age=604800" in jwt_header # 7 days

def test_jwt_no_refresh_if_plenty_time(client):
    """JWT with >= 1 day remaining is not refreshed."""
    now = int(time.time())
    # 6 days remaining
    payload = {
        "sub": "42",
        "chat_id": "123456789",
        "exp": now + 6 * 86400
    }
    token = generate_jwt(payload, settings.JWT_SECRET)
    
    response = client.get("/test-logout/refresh", cookies={"atrium_session": token})
    assert response.status_code == 200
    
    # Verify no cookies were set in response
    headers = response.headers.get_list("set-cookie")
    assert len(headers) == 0
