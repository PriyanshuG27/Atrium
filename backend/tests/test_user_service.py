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


class MockStreakCursor:
    def __init__(self, active_dates, max_created_at):
        self.active_dates = active_dates
        self.max_created_at = max_created_at
        self.queries = []
        self.updated_streak = None
        self.updated_last_activity_date = None
        self._rows = []

    async def execute(self, query, params=None):
        self.queries.append((query, params))
        query_upper = query.upper()
        if "SELECT DISTINCT" in query_upper:
            self._rows = [(d,) for d in self.active_dates]
        elif "SELECT MAX(CREATED_AT)" in query_upper:
            self._rows = [(self.max_created_at,)]
        elif "UPDATE USERS" in query_upper:
            self.updated_streak = params[0]
            self.updated_last_activity_date = params[1]
            self._rows = []

    async def fetchall(self):
        return self._rows

    async def fetchone(self):
        return self._rows[0] if self._rows else None


from datetime import datetime, timezone, timedelta
from backend.services.user_service import get_and_update_user_streak

@pytest.mark.asyncio
async def test_streak_calculation_today_and_yesterday():
    today = datetime.now(timezone.utc).date()
    yesterday = today - timedelta(days=1)
    
    # Active today and yesterday
    active_dates = [today, yesterday]
    max_created_at = datetime.now(timezone.utc)
    
    cursor = MockStreakCursor(active_dates, max_created_at)
    streak = await get_and_update_user_streak(cursor, user_id=42, force_dynamic=True)
    
    assert streak == 2
    assert cursor.updated_streak == 2
    assert cursor.updated_last_activity_date == max_created_at


@pytest.mark.asyncio
async def test_streak_calculation_yesterday_only():
    today = datetime.now(timezone.utc).date()
    yesterday = today - timedelta(days=1)
    
    # Active yesterday only
    active_dates = [yesterday]
    max_created_at = datetime.now(timezone.utc) - timedelta(days=1)
    
    cursor = MockStreakCursor(active_dates, max_created_at)
    streak = await get_and_update_user_streak(cursor, user_id=42, force_dynamic=True)
    
    assert streak == 1
    assert cursor.updated_streak == 1
    assert cursor.updated_last_activity_date == max_created_at


@pytest.mark.asyncio
async def test_streak_calculation_gap():
    today = datetime.now(timezone.utc).date()
    yesterday = today - timedelta(days=1)
    day_before = today - timedelta(days=2)
    
    # Active day_before only (gap yesterday and today)
    active_dates = [day_before]
    max_created_at = datetime.now(timezone.utc) - timedelta(days=2)
    
    cursor = MockStreakCursor(active_dates, max_created_at)
    streak = await get_and_update_user_streak(cursor, user_id=42, force_dynamic=True)
    
    assert streak == 0
    assert cursor.updated_streak == 0
    assert cursor.updated_last_activity_date == max_created_at


@pytest.mark.asyncio
async def test_streak_calculation_empty():
    cursor = MockStreakCursor([], None)
    streak = await get_and_update_user_streak(cursor, user_id=42, force_dynamic=True)
    
    assert streak == 0
    assert cursor.updated_streak == 0
    assert cursor.updated_last_activity_date is None

