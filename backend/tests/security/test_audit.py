import pytest
import unittest.mock as mock
from fastapi.testclient import TestClient
import psycopg
import json

from backend.main import app
from backend.middleware.twa_auth import generate_jwt
from backend.config import settings
from backend.db.connection import get_db

@pytest.fixture()
def client():
    with mock.patch("backend.db.connection.open_pool", return_value=None), \
         mock.patch("backend.db.connection.close_pool", return_value=None):
        with TestClient(app) as c:
            yield c

def get_auth_token(user_id=42):
    payload = {
        "sub": str(user_id),
        "chat_id": "123456789",
        "exp": 9999999999
    }
    return generate_jwt(payload, settings.JWT_SECRET)

@pytest.mark.asyncio
async def test_audit_log_delete_item(client):
    token = get_auth_token(user_id=42)
    
    mock_db = mock.AsyncMock(spec=psycopg.AsyncConnection)
    mock_cur = mock.AsyncMock()
    mock_db.cursor.return_value.__aenter__.return_value = mock_cur
    
    # fetchone order:
    # 1. get_current_user -> (user_id, chat_id)
    # 2. delete item returning -> (item_id, source_type)
    mock_cur.fetchone.side_effect = [
        (42, "123456789"),
        (101, "url")
    ]
    
    async def mock_get_db():
        yield mock_db
        
    app.dependency_overrides[get_db] = mock_get_db
    
    try:
        # DELETE /api/items/101
        headers = {"x-request-id": "test-req-999"}
        resp = client.delete("/api/items/101", cookies={"atrium_session": token}, headers=headers)
        
        # Verify response code
        assert resp.status_code == 204
        
        # Verify log_audit database write
        calls = mock_cur.execute.call_args_list
        audit_call = None
        for call in calls:
            query = call[0][0]
            if "INSERT INTO audit_logs" in query:
                audit_call = call
                break
                
        assert audit_call is not None
        params = audit_call[0][1]
        
        # Params: (user_id, action, details_json, request_id)
        assert params[0] == 42
        assert params[1] == "delete_item"
        details = json.loads(params[2])
        assert details["item_id"] == 101
        assert details["source_type"] == "url"
        assert params[3] == "test-req-999"
    finally:
        app.dependency_overrides.pop(get_db, None)

@pytest.mark.asyncio
async def test_audit_log_update_settings(client):
    token = get_auth_token(user_id=42)
    
    mock_db = mock.AsyncMock(spec=psycopg.AsyncConnection)
    mock_cur = mock.AsyncMock()
    mock_db.cursor.return_value.__aenter__.return_value = mock_cur
    
    # fetchone order:
    # 1. get_current_user -> (user_id, chat_id)
    # 2. check user exists -> (timezone_offset,)
    # 3. fetch updated details -> (timezone_offset, streak, token, last_sync, digest)
    # 4. get_and_update_user_streak queries user table -> (timezone_offset, streak, token, last_sync, digest)
    # 5. total saves count -> (total_saves,)
    # 6. quizzes stats -> (quizzes_answered,)
    # 7. last_activity_date -> (last_activity_date,)
    mock_cur.fetchone.side_effect = [
        (42, "123456789"),
        (120,), 
        (180, 5, None, None, True), 
        (180, 5, None, None, True), 
        (10,), 
        (0,), 
        (None,), 
    ]
    mock_cur.fetchall.return_value = []
    
    async def mock_get_db():
        yield mock_db
        
    app.dependency_overrides[get_db] = mock_get_db
    
    try:
        # PATCH /api/me to change settings
        headers = {"x-request-id": "test-req-777"}
        req_payload = {"timezone_offset": 3.0, "digest_enabled": False}
        resp = client.patch("/api/me", json=req_payload, cookies={"atrium_session": token}, headers=headers)
        
        assert resp.status_code == 200
        
        # Verify log_audit database write
        calls = mock_cur.execute.call_args_list
        audit_call = None
        for call in calls:
            query = call[0][0]
            if "INSERT INTO audit_logs" in query:
                audit_call = call
                break
                
        assert audit_call is not None
        params = audit_call[0][1]
        
        # Params: (user_id, action, details_json, request_id)
        assert params[0] == 42
        assert params[1] == "update_settings"
        details = json.loads(params[2])
        assert details["timezone_offset"] == 3.0
        assert details["digest_enabled"] is False
        assert params[3] == "test-req-777"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_audit_log_hearth_actions(client):
    token = get_auth_token(user_id=42)
    
    mock_db = mock.AsyncMock(spec=psycopg.AsyncConnection)
    mock_cur = mock.AsyncMock()
    mock_db.cursor.return_value.__aenter__.return_value = mock_cur
    
    async def mock_get_db():
        yield mock_db
        
    app.dependency_overrides[get_db] = mock_get_db
    
    try:
        # fetchone side_effect for invite:
        # 1. get_current_user -> (user_id, chat_id)
        # 2. SELECT invite_code (existing pending invite check) -> None (forces new generation)
        mock_cur.fetchone.side_effect = [
            (42, "123456789"),
            None
        ]
        
        resp = client.post("/api/hearth/invite", cookies={"atrium_session": token})
        assert resp.status_code == 200
        
        # Verify log_audit database write for change_permissions / hearth_invite_created
        calls = mock_cur.execute.call_args_list
        audit_call = None
        for call in calls:
            query = call[0][0]
            if "INSERT INTO audit_logs" in query:
                audit_call = call
                break
        assert audit_call is not None
        assert audit_call[0][1][1] == "change_permissions"
        details = json.loads(audit_call[0][1][2])
        assert details["action_sub"] == "hearth_invite_created"
        
    finally:
        app.dependency_overrides.pop(get_db, None)

