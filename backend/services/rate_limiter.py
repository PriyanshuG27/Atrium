"""
backend/services/rate_limiter.py
================================
Redis sliding window rate limiter for Recall.
Limits users (per chat_id) to 20 requests per 60 seconds rolling window.
"""

import time
import uuid
import logging
from backend.services.redis_client import redis

logger = logging.getLogger(__name__)

class RateLimitExceeded(Exception):
    """Exception raised when a user exceeds their rolling window request quota."""
    def __init__(self, retry_after: float):
        self.retry_after = retry_after
        super().__init__(f"Rate limit exceeded. Retry after {retry_after:.1f} seconds.")

async def check_rate_limit(chat_id: str) -> None:
    """
    Checks if a user is within their rate limit of 20 requests per 60 seconds.
    If exceeded, raises RateLimitExceeded with the calculated wait time.
    """
    key = f"rate:{chat_id}"
    now = int(time.time() * 1000)  # Current timestamp in ms
    window_start = now - 60_000     # 60 seconds rolling window start
    
    # Member format: {timestamp_ms}-{uuid} to ensure uniqueness of every request
    member_id = f"{now}-{uuid.uuid4()}"
    
    # 5 commands in a single atomic pipeline:
    # 1. Evict expired entries older than 60s
    # 2. Add current request timestamp
    # 3. Card/Count requests in the active window
    # 4. Set TTL slightly > window (61s) to save memory
    # 5. Fetch oldest entry to calculate precise retry_after
    commands = [
        ["ZREMRANGEBYSCORE", key, "0", str(window_start)],
        ["ZADD", key, str(now), member_id],
        ["ZCARD", key],
        ["EXPIRE", key, "61"],
        ["ZRANGE", key, "0", "0"]
    ]
    
    try:
        results = await redis.pipeline(commands)
        
        # results: [removed_count, added_count, active_count, expire_result, oldest_member_list]
        count = int(results[2])
        
        if count > 20:
            oldest_member_list = results[4]
            oldest_score = now  # Fallback
            
            if oldest_member_list and len(oldest_member_list) > 0:
                try:
                    # Extract timestamp from member string
                    oldest_score = int(oldest_member_list[0].split("-")[0])
                except Exception:
                    pass
                    
            elapsed_since_oldest = now - oldest_score
            retry_after = 60.0 - (elapsed_since_oldest / 1000.0)
            
            # Bound retry_after between [0, 60] seconds
            retry_after = max(0.0, min(60.0, retry_after))
            
            logger.warning("Rate limit exceeded for chat_id %s: count=%d, retry_after=%.2fs", chat_id, count, retry_after)
            raise RateLimitExceeded(retry_after=retry_after)
            
    except RateLimitExceeded:
        raise
    except Exception as e:
        # Fail open: log error but do not crash webhook or block user if Redis fails
        logger.exception("Rate limiter error for chat_id %s. Failing open: %s", chat_id, e)
