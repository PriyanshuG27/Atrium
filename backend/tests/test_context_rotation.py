import pytest
import unittest.mock as mock

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

    async def zadd(self, key, score, member):
        if key not in self.zset:
            self.zset[key] = {}
        self.zset[key][member] = float(score)
        return 1

    async def zrem(self, key, member):
        if key in self.zset and member in self.zset[key]:
            del self.zset[key][member]
            return 1
        return 0

    async def zrangebyscore(self, key, min_score, max_score):
        if key not in self.zset:
            return []
        min_s = float("-inf") if min_score == "-inf" else float(min_score)
        max_s = float("+inf") if max_score == "+inf" else float(max_score)
        res = []
        for member, score in self.zset[key].items():
            if min_s <= score <= max_s:
                res.append(member)
        return res

    async def _request(self, path, payload):
        command = payload[0].upper()
        if command == "LRANGE":
            key = payload[1]
            return {"result": [x for x in self.store.get(key, [])]}
        elif command == "LPUSH":
            key = payload[1]
            val = payload[2]
            if key not in self.store:
                self.store[key] = []
            self.store[key].insert(0, val)
            return {"result": len(self.store[key])}
        elif command == "LTRIM":
            key = payload[1]
            start = int(payload[2])
            stop = int(payload[3])
            if key in self.store:
                self.store[key] = self.store[key][start:stop+1]
            return {"result": "OK"}
        elif command == "HGETALL":
            key = payload[1]
            res = []
            for k, v in self.store.get(key, {}).items():
                res.extend([k, str(v)])
            return {"result": res}
        elif command == "HSET":
            key = payload[1]
            field = payload[2]
            val = payload[3]
            if key not in self.store:
                self.store[key] = {}
            self.store[key][field] = val
            return {"result": 1}
        elif command == "HINCRBY":
            key = payload[1]
            field = payload[2]
            inc = int(payload[3])
            if key not in self.store:
                self.store[key] = {}
            curr = int(self.store[key].get(field, 0))
            new_val = curr + inc
            self.store[key][field] = new_val
            return {"result": new_val}
        elif command == "INCR":
            key = payload[1]
            curr = int(self.store.get(key, 0))
            new_val = curr + 1
            self.store[key] = str(new_val)
            return {"result": new_val}
        elif command == "HGET":
            key = payload[1]
            field = payload[2]
            val = self.store.get(key, {}).get(field)
            return {"result": val}
        return {"result": None}

# Patch redis before imports
from backend.services.redis_client import redis
mock_redis_inst = MockRedis()

@pytest.fixture(autouse=True)
def setup_redis():
    # Backup original methods
    orig_get = redis.get
    orig_setex = redis.setex
    orig_delete = redis.delete
    orig_zadd = redis.zadd
    orig_zrem = redis.zrem
    orig_zrangebyscore = redis.zrangebyscore
    orig_request = redis._request

    redis.get = mock_redis_inst.get
    redis.setex = mock_redis_inst.setex
    redis.delete = mock_redis_inst.delete
    redis.zadd = mock_redis_inst.zadd
    redis.zrem = mock_redis_inst.zrem
    redis.zrangebyscore = mock_redis_inst.zrangebyscore
    redis._request = mock_redis_inst._request
    yield

    # Restore original methods
    redis.get = orig_get
    redis.setex = orig_setex
    redis.delete = orig_delete
    redis.zadd = orig_zadd
    redis.zrem = orig_zrem
    redis.zrangebyscore = orig_zrangebyscore
    redis._request = orig_request

# Now safely import workers and callbacks
from backend.worker import get_next_mood_category, send_context_prompt_with_checks
from backend.routes.webhook import save_context_note

@pytest.mark.asyncio
async def test_get_next_mood_category_history_and_greedy():
    chat_id = "test_chat_123"
    
    # Reset mock redis
    mock_redis_inst.store.clear()
    mock_redis_inst.zset.clear()
    
    mood1 = await get_next_mood_category(chat_id)
    assert mood1 in ["curiosity", "timing", "future", "friction", "identity", "connection", "stakes", "surprise"]
    
    history = await mock_redis_inst._request("", ["LRANGE", f"context_prompt:history:{chat_id}", "0", "-1"])
    history_list = history.get("result", [])
    assert mood1 in history_list
    
    for _ in range(5):
        await get_next_mood_category(chat_id)
        
    history = await mock_redis_inst._request("", ["LRANGE", f"context_prompt:history:{chat_id}", "0", "-1"])
    history_list = history.get("result", [])
    assert len(history_list) <= 4

    await mock_redis_inst._request("", ["HSET", f"context_prompt:scores:{chat_id}", "friction", "100"])
    
    with mock.patch("random.random", return_value=0.0):
        await mock_redis_inst.delete(f"context_prompt:history:{chat_id}")
        selected = await get_next_mood_category(chat_id)
        assert selected == "friction"


@pytest.mark.asyncio
async def test_ignore_pauses_and_reply_scoring():
    chat_id = "test_chat_456"
    user_id = 9999
    item_id = 12345
    
    # Reset mock redis
    mock_redis_inst.store.clear()
    mock_redis_inst.zset.clear()
    
    with mock.patch("backend.worker.send_telegram_message", return_value=True) as mock_send:
        # First save: prompt delivered
        await send_context_prompt_with_checks(chat_id, user_id, item_id, "Prompt 1", "curiosity")
        assert mock_send.call_count == 1
        assert await mock_redis_inst.get(f"pending_context:{chat_id}") == str(item_id)
        assert await mock_redis_inst.get(f"pending_context_variant:{chat_id}") == "curiosity"
        
        # Second save (without reply, i.e., ignore): increments ignore count to 1, prompts again
        mock_send.reset_mock()
        prev_pending = await mock_redis_inst.get(f"pending_context:{chat_id}")
        if prev_pending:
            await mock_redis_inst.delete(f"pending_context:{chat_id}")
            await mock_redis_inst.delete(f"pending_context_variant:{chat_id}")
            await mock_redis_inst._request("", ["INCR", f"context_prompt:ignore_count:{chat_id}"])
            
        await send_context_prompt_with_checks(chat_id, user_id, item_id + 1, "Prompt 2", "timing")
        assert mock_send.call_count == 1
        ignore_cnt = await mock_redis_inst.get(f"context_prompt:ignore_count:{chat_id}")
        assert ignore_cnt == "1"
        
        # Third save: ignore count to 2, prompts again
        mock_send.reset_mock()
        prev_pending = await mock_redis_inst.get(f"pending_context:{chat_id}")
        if prev_pending:
            await mock_redis_inst.delete(f"pending_context:{chat_id}")
            await mock_redis_inst.delete(f"pending_context_variant:{chat_id}")
            await mock_redis_inst._request("", ["INCR", f"context_prompt:ignore_count:{chat_id}"])
            
        await send_context_prompt_with_checks(chat_id, user_id, item_id + 2, "Prompt 3", "future")
        assert mock_send.call_count == 1
        ignore_cnt = await mock_redis_inst.get(f"context_prompt:ignore_count:{chat_id}")
        assert ignore_cnt == "2"

        # Fourth save (ignore count reaches 3): triggers pause_saves=5, does NOT prompt!
        mock_send.reset_mock()
        prev_pending = await mock_redis_inst.get(f"pending_context:{chat_id}")
        if prev_pending:
            await mock_redis_inst.delete(f"pending_context:{chat_id}")
            await mock_redis_inst.delete(f"pending_context_variant:{chat_id}")
            ignore_count_resp = await mock_redis_inst._request("", ["INCR", f"context_prompt:ignore_count:{chat_id}"])
            ignore_count = int(ignore_count_resp.get("result", 0))
            if ignore_count >= 3:
                await mock_redis_inst.setex(f"context_prompt:pause_saves:{chat_id}", 86400, "5")
                await mock_redis_inst.delete(f"context_prompt:ignore_count:{chat_id}")
                
        await send_context_prompt_with_checks(chat_id, user_id, item_id + 3, "Prompt 4", "friction")
        assert mock_send.call_count == 0  # Paused!
        assert await mock_redis_inst.get(f"context_prompt:pause_saves:{chat_id}") == "4"

    # Simulate Reply and Scoring
    await mock_redis_inst.delete(f"context_prompt:pause_saves:{chat_id}")
    await mock_redis_inst.setex(f"pending_context:{chat_id}", 600, str(item_id))
    await mock_redis_inst.setex(f"pending_context_variant:{chat_id}", 600, "stakes")
    await mock_redis_inst.setex(f"context_prompt:ignore_count:{chat_id}", 600, "2")
    
    mock_pool = mock.MagicMock()
    mock_conn = mock.AsyncMock()
    mock_pool.connection = mock.MagicMock(return_value=mock_conn)
    
    with mock.patch("backend.routes.webhook.send_telegram_ack", mock.AsyncMock()):
        with mock.patch("backend.db.connection._pool", mock_pool):
            await save_context_note(item_id, user_id, "This is a great note with 27 chars!", chat_id)
            
            # Verification:
            assert await mock_redis_inst.get(f"context_prompt:ignore_count:{chat_id}") is None
            assert await mock_redis_inst.get(f"pending_context_variant:{chat_id}") is None
            score_resp = await mock_redis_inst._request("", ["HGET", f"context_prompt:scores:{chat_id}", "stakes"])
            score_val = score_resp.get("result")
            assert int(score_val) == len("This is a great note with 27 chars!")
