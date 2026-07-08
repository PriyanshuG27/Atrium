import pytest
import asyncio
import time
from backend.services.ai_cascade.cache_manager import LocalTTLCache, CacheManager
from backend.config import settings

@pytest.mark.asyncio
async def test_local_ttl_cache_eviction():
    # Cache with size 2, TTL 10s
    cache = LocalTTLCache(maxsize=2, ttl=10.0)
    
    cache.set("key1", "val1")
    cache.set("key2", "val2")
    
    assert cache.get("key1") == "val1"
    assert cache.get("key2") == "val2"
    
    # Exceed capacity
    cache.set("key3", "val3")
    
    # key1 (oldest) should be evicted
    assert cache.get("key1") is None
    assert cache.get("key2") == "val2"
    assert cache.get("key3") == "val3"

@pytest.mark.asyncio
async def test_local_ttl_cache_expiry():
    # Cache with size 5, TTL 0.1s
    cache = LocalTTLCache(maxsize=5, ttl=0.1)
    
    cache.set("key1", "val1")
    assert cache.get("key1") == "val1"
    
    # Sleep to allow expiry
    await asyncio.sleep(0.15)
    
    assert cache.get("key1") is None

@pytest.mark.asyncio
async def test_cache_manager_integration():
    # Ensure cache manager uses our custom cache
    assert isinstance(CacheManager._memory_cache, LocalTTLCache)
    
    # Set and retrieve a transcription via memory cache fallback
    # (By mocking redis or since we don't have redis connection in unit test, it will fallback to memory)
    from unittest.mock import patch
    with patch("backend.services.ai_cascade.cache_manager.redis.get", side_effect=Exception("Redis down")):
        await CacheManager.set_transcription("hash123", "Hello World Transcription")
        res = await CacheManager.get_transcription("hash123")
        assert res == "Hello World Transcription"
