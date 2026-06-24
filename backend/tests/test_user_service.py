import pytest
import asyncio
from backend.services.user_service import upsert_user

class MockUserDbState:
    def __init__(self):
        self.users = {}  # telegram_chat_id -> internal_id
        self.next_id = 1
        self.committed = False

class MockUserCursor:
    def __init__(self, state):
        self.state = state
        self._last_insert_id = None
        self._last_selected_id = None
        
    async def __aenter__(self):
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass
        
    async def execute(self, query, params=None):
        query_upper = query.upper()
        if "INSERT INTO USERS" in query_upper:
            chat_id = params[0]
            if chat_id in self.state.users:
                self._last_insert_id = None
            else:
                user_id = self.state.next_id
                self.state.users[chat_id] = user_id
                self.state.next_id += 1
                self._last_insert_id = user_id
        elif "SELECT ID FROM USERS" in query_upper:
            chat_id = params[0]
            self._last_selected_id = self.state.users.get(chat_id)
            
    async def fetchone(self):
        if self._last_insert_id is not None:
            val = (self._last_insert_id,)
            self._last_insert_id = None
            return val
        if self._last_selected_id is not None:
            val = (self._last_selected_id,)
            self._last_selected_id = None
            return val
        return None

class MockUserConnection:
    def __init__(self, state):
        self.state = state
        self._cursor = MockUserCursor(state)
        
    def cursor(self):
        return self._cursor
        
    async def commit(self):
        self.state.committed = True

@pytest.mark.asyncio
async def test_upsert_user_new():
    state = MockUserDbState()
    conn = MockUserConnection(state)
    
    # First call: creates user and returns ID 1
    user_id = await upsert_user("12345", conn)
    assert user_id == 1
    assert state.committed is True
    assert "12345" in state.users
    assert state.users["12345"] == 1

@pytest.mark.asyncio
async def test_upsert_user_idempotent():
    state = MockUserDbState()
    conn = MockUserConnection(state)
    
    # First call
    user_id_1 = await upsert_user("12345", conn)
    assert user_id_1 == 1
    
    state.committed = False
    
    # Second call with same chat_id
    user_id_2 = await upsert_user("12345", conn)
    assert user_id_2 == 1
    # Check that it did not create a new row
    assert len(state.users) == 1
    assert state.next_id == 2
