import pytest
from datetime import date, timedelta
from backend.services.streak_service import update_streak

class MockDbState:
    def __init__(self, streak_count=0, last_activity_date=None):
        self.streak_count = streak_count
        self.last_activity_date = last_activity_date
        self.user_exists = True
        self.committed = False
        self.updated_streak = None
        self.updated_date = None

class MockCursor:
    def __init__(self, state):
        self.state = state
        self._query_result = None

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

    async def execute(self, query, params=None):
        query_upper = query.upper()
        if "SELECT" in query_upper:
            if self.state.user_exists:
                self._query_result = (self.state.streak_count, self.state.last_activity_date)
            else:
                self._query_result = None
        elif "UPDATE" in query_upper:
            self.state.updated_streak = params[0]
            self.state.updated_date = params[1]

    async def fetchone(self):
        res = self._query_result
        self._query_result = None
        return res

class MockConnection:
    def __init__(self, state):
        self.state = state
        self._cursor = MockCursor(state)

    def cursor(self):
        return self._cursor

    async def commit(self):
        self.state.committed = True

@pytest.mark.asyncio
async def test_update_streak_first_save():
    # User's first save ever (streak=0, last_activity_date=None)
    state = MockDbState(streak_count=0, last_activity_date=None)
    conn = MockConnection(state)
    
    streak = await update_streak(1, conn)
    assert streak == 1
    assert state.updated_streak == 1
    assert state.updated_date == date.today()

@pytest.mark.asyncio
async def test_update_streak_consecutive_day():
    # User saved yesterday
    yesterday = date.today() - timedelta(days=1)
    state = MockDbState(streak_count=3, last_activity_date=yesterday)
    conn = MockConnection(state)
    
    streak = await update_streak(1, conn)
    assert streak == 4
    assert state.updated_streak == 4
    assert state.updated_date == date.today()

@pytest.mark.asyncio
async def test_update_streak_same_day():
    # User already saved today
    today = date.today()
    state = MockDbState(streak_count=5, last_activity_date=today)
    conn = MockConnection(state)
    
    streak = await update_streak(1, conn)
    assert streak == 5
    # Should not trigger an update statement since it's the same day
    assert state.updated_streak is None
    assert state.updated_date is None

@pytest.mark.asyncio
async def test_update_streak_gap_day():
    # User saved 2 days ago (streak resets to 1)
    two_days_ago = date.today() - timedelta(days=2)
    state = MockDbState(streak_count=5, last_activity_date=two_days_ago)
    conn = MockConnection(state)
    
    streak = await update_streak(1, conn)
    assert streak == 1
    assert state.updated_streak == 1
    assert state.updated_date == date.today()

@pytest.mark.asyncio
async def test_update_streak_user_missing():
    # User doesn't exist
    state = MockDbState()
    state.user_exists = False
    conn = MockConnection(state)
    
    streak = await update_streak(999, conn)
    assert streak == 0
    assert state.updated_streak is None

@pytest.mark.asyncio
async def test_update_streak_none_streak_count():
    # User exists but streak_count is None
    state = MockDbState(streak_count=None, last_activity_date=None)
    conn = MockConnection(state)
    
    streak = await update_streak(1, conn)
    assert streak == 1
    assert state.updated_streak == 1
