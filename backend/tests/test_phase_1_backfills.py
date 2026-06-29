import pytest
import unittest.mock as mock
import json
from datetime import datetime, timezone, timedelta

# Create Mock Redis
class MockRedis:
    def __init__(self):
        self.store = {}
        self.zset = {}

    async def get(self, key):
        return self.store.get(key)

    async def setex(self, key, seconds, value):
        self.store[key] = str(value)
        return True

    async def delete(self, key):
        if key in self.store:
            del self.store[key]
            return 1
        return 0

    async def _request(self, path, payload):
        command = payload[0].upper()
        if command == "INCR":
            key = payload[1]
            curr = int(self.store.get(key, 0))
            new_val = curr + 1
            self.store[key] = str(new_val)
            return new_val
        return None

# Patch redis
from backend.services.redis_client import redis
mock_redis = MockRedis()

@pytest.fixture(autouse=True)
def setup_redis():
    orig_get = redis.get
    orig_setex = redis.setex
    orig_delete = redis.delete
    orig_request = redis._request

    redis.get = mock_redis.get
    redis.setex = mock_redis.setex
    redis.delete = mock_redis.delete
    redis._request = mock_redis._request
    yield
    redis.get = orig_get
    redis.setex = orig_setex
    redis.delete = orig_delete
    redis._request = orig_request

# Import components to test
from backend.worker import compute_passive_context
from backend.scheduler.scheduler import onboarding_sequence_dispatcher, mid_graph_re_engagement_dispatcher
from backend.routes.webhook import router

# Helper to create mock database connection
class MockCursor:
    def __init__(self, fetch_val=None, fetchall_val=None):
        self.fetch_val = fetch_val
        self.fetchall_val = fetchall_val
        self.executed_queries = []

    async def execute(self, query, params=None):
        self.executed_queries.append((query, params))
        return True

    async def fetchone(self):
        if callable(self.fetch_val):
            return await self.fetch_val()
        return self.fetch_val

    async def fetchall(self):
        if callable(self.fetchall_val):
            return await self.fetchall_val()
        return self.fetchall_val or []

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

class MockConnection:
    def __init__(self, cursor_inst):
        self.cursor_inst = cursor_inst
        self.executed_statements = []

    async def execute(self, statement, params=None):
        self.executed_statements.append((statement, params))

    def cursor(self):
        return self.cursor_inst

    async def commit(self):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass


@pytest.mark.asyncio
async def test_compute_passive_context_morning():
    # Test case where timezone offset is GMT+5:30 (330 min) and UTC is 3:00 AM (local is 8:30 AM -> morning)
    cursor_fetch_sequence = [(330,), (2,), (datetime(2026, 6, 29, 1, 0, 0, tzinfo=timezone.utc),)]
    
    async def seq_fetchone():
        return cursor_fetch_sequence.pop(0) if cursor_fetch_sequence else None

    cursor = MockCursor(fetch_val=seq_fetchone)
    conn = MockConnection(cursor)

    with mock.patch("backend.worker.datetime") as mock_dt:
        # Mock UTC time to be 2026-06-29 03:00:00 UTC (8:30 AM local)
        mock_dt.now.return_value = datetime(2026, 6, 29, 3, 0, 0, tzinfo=timezone.utc)
        mock_dt.side_effect = lambda *args, **kwargs: datetime(*args, **kwargs)

        res_str = await compute_passive_context(1, "text", conn)
        res = json.loads(res_str)

        assert res["time_of_day"] == "morning"
        assert res["day_of_week"] == "Monday"
        assert res["prior_cluster_activity_24h"] == 2
        assert res["input_method"] == "text"
        assert res["session_gap_hours"] == 2.0  # 3:00 UTC minus 1:00 UTC = 2.0 hours


@pytest.mark.asyncio
async def test_compute_passive_context_night():
    # Timezone offset GMT-8 (PST, -480 min). UTC is 6:00 AM (local is 10:00 PM -> night)
    cursor_fetch_sequence = [(-480,), (0,), (datetime(2026, 6, 28, 20, 0, 0, tzinfo=timezone.utc),)]
    async def seq_fetchone():
        return cursor_fetch_sequence.pop(0) if cursor_fetch_sequence else None

    cursor = MockCursor(fetch_val=seq_fetchone)
    conn = MockConnection(cursor)

    with mock.patch("backend.worker.datetime") as mock_dt:
        mock_dt.now.return_value = datetime(2026, 6, 29, 6, 0, 0, tzinfo=timezone.utc)
        
        res_str = await compute_passive_context(1, "url", conn)
        res = json.loads(res_str)

        assert res["time_of_day"] == "night"
        assert res["day_of_week"] == "Sunday"
        assert res["prior_cluster_activity_24h"] == 0
        assert res["input_method"] == "url"
        assert res["session_gap_hours"] == 10.0  # 6:00 UTC minus 20:00 UTC yesterday = 10.0 hours


@pytest.mark.asyncio
async def test_onboarding_sequence_dispatcher_day0():
    # User at day 0 with first save 3 hours ago (eligible for Day 0 message)
    mock_redis.store.clear()
    
    cursor_fetchall_sequence = [[(12, "chat_123", 101)], [], [], []]
    async def seq_fetchall():
        return cursor_fetchall_sequence.pop(0) if cursor_fetchall_sequence else []

    cursor = MockCursor(fetchall_val=seq_fetchall)
    conn = MockConnection(cursor)
    
    with mock.patch("backend.scheduler.scheduler.get_pool") as mock_get_pool, \
         mock.patch("backend.scheduler.scheduler.send_telegram_message", return_value=True) as mock_send:
        
        # Mock pool
        mock_pool = mock.MagicMock()
        mock_pool.connection.return_value = conn
        mock_get_pool.return_value = mock_pool
        
        await onboarding_sequence_dispatcher()
        
        # Verify telegram message was sent with Day 0 buttons
        mock_send.assert_called_once()
        args, kwargs = mock_send.call_args
        assert "was this for you" in args[1]
        assert len(kwargs["reply_markup"]["inline_keyboard"]) == 3
        
        # Check that redis pending_context key was set for item 101
        pending = await mock_redis.get("pending_context:chat_123")
        assert pending == "101"
        
        # Check database update query was executed
        update_queries = [q for q in cursor.executed_queries if "UPDATE users" in q[0]]
        assert len(update_queries) > 0
        assert update_queries[0][1] == (12,)


@pytest.mark.asyncio
async def test_onboarding_sequence_dispatcher_day1():
    # User at day 1 at 8:00 AM local time
    mock_redis.store.clear()
    
    # sequence of queries: first gets day0 users (empty), second gets day1 users
    cursor_fetchall_sequence = [[], [(15, "chat_456", 202, "Sony XM5 Review")], [], []]
    async def seq_fetchall():
        return cursor_fetchall_sequence.pop(0) if cursor_fetchall_sequence else []

    cursor = MockCursor(fetchall_val=seq_fetchall)
    conn = MockConnection(cursor)
    
    with mock.patch("backend.scheduler.scheduler.get_pool") as mock_get_pool, \
         mock.patch("backend.scheduler.scheduler.send_telegram_message", return_value=True) as mock_send:
        
        mock_pool = mock.MagicMock()
        mock_pool.connection.return_value = conn
        mock_get_pool.return_value = mock_pool
        
        # Trigger dispatcher
        await onboarding_sequence_dispatcher()
        
        # Verify Day 1 check telegram message sent
        assert mock_send.call_count >= 1
        args, kwargs = mock_send.call_args
        assert "Still thinking about" in args[1]
        assert "Sony XM5 Review" in args[1]
        
        pending = await mock_redis.get("pending_context:chat_456")
        assert pending == "202"


@pytest.mark.asyncio
async def test_mid_graph_re_engagement_dispatcher():
    # User silent for 5 days with 12 items
    mock_redis.store.clear()
    
    cursor = MockCursor(fetchall_val=[(99, "chat_99", 12, 303, "Clean Architecture Book", datetime.now())])
    conn = MockConnection(cursor)
    
    with mock.patch("backend.scheduler.scheduler.get_pool") as mock_get_pool, \
         mock.patch("backend.scheduler.scheduler.send_telegram_message", return_value=True) as mock_send:
        
        mock_pool = mock.MagicMock()
        mock_pool.connection.return_value = conn
        mock_get_pool.return_value = mock_pool
        
        await mid_graph_re_engagement_dispatcher()
        
        # Verify telegram message sent
        mock_send.assert_called_once()
        args, kwargs = mock_send.call_args
        assert "haven't heard from you in a few days" in args[1]
        assert "Clean Architecture Book" in args[1]
        
        # Verify de-duplication key in Redis
        is_sent = await mock_redis.get("re_engagement_sent:99:303")
        assert is_sent == "1"


@pytest.mark.asyncio
async def test_get_onboarding_settings_payload_not_connected():
    from backend.routes.webhook import get_onboarding_settings_payload
    # Query returns (None, None, 180) -> google_refresh_token is None, google_last_sync is None, timezone is GMT+3
    cursor = MockCursor(fetch_val=(None, None, 180))
    conn = MockConnection(cursor)
    
    with mock.patch("backend.db.connection._pool") as mock_pool:
        mock_pool.connection.return_value = conn
        settings_msg, markup = await get_onboarding_settings_payload("chat_123", 1, "Welcome!")
        
        # Verify timezone format
        assert "GMT+03:00" in settings_msg
        # Verify drive connection description
        assert "Secure automated daily backups" in settings_msg
        # Verify buttons (Set Timezone, Web Dashboard and Backup to Drive are in the inline keyboard)
        buttons = markup["inline_keyboard"]
        assert len(buttons) >= 2
        assert buttons[0][0]["text"] == "Set Timezone ⏰"
        assert any(btn.get("text") == "Backup to Drive 💾" for row in buttons for btn in row)
        assert any(btn.get("text") == "Web Dashboard 🌐" for row in buttons for btn in row)
        
        # Verify lvh.me rewrite
        assert any("lvh.me" in btn.get("url", "") for row in buttons for btn in row)


@pytest.mark.asyncio
async def test_get_onboarding_settings_payload_connected():
    from backend.routes.webhook import get_onboarding_settings_payload
    # Query returns ('refresh_token', datetime(2026, 6, 29, 12, 0, 0), -300) -> connected, last sync, GMT-5
    last_sync = datetime(2026, 6, 29, 12, 0, 0)
    cursor = MockCursor(fetch_val=("encrypted_token", last_sync, -300))
    conn = MockConnection(cursor)
    
    with mock.patch("backend.db.connection._pool") as mock_pool:
        mock_pool.connection.return_value = conn
        settings_msg, markup = await get_onboarding_settings_payload("chat_123", 1, "Welcome!")
        
        # Verify timezone format
        assert "GMT-05:00" in settings_msg
        # Verify drive connected status
        assert "Connected ✅" in settings_msg
        assert "Last sync: 29 Jun 12:00" in settings_msg
        
        buttons = markup["inline_keyboard"]
        # Connected view should have Sync Drive Now and Disconnect Drive buttons
        assert any(btn.get("text") == "Sync Drive Now 🔄" for row in buttons for btn in row)
        assert any(btn.get("text") == "Disconnect Drive 🔌" for row in buttons for btn in row)
        # Should not show connect backup button
        assert not any(btn.get("text") == "Backup to Drive 💾" for row in buttons for btn in row)

