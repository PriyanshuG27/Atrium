import hashlib
import logging
import json
from typing import Optional, Any
from backend.services.redis_client import redis, RedisUnavailableError

import collections
import time
from backend.config import settings

logger = logging.getLogger(__name__)


import threading


class LocalTTLCache:
    def __init__(self, maxsize: int, ttl: float):
        self.maxsize = maxsize
        self.ttl = ttl
        self._cache = {}
        self._keys_order = collections.deque()
        self._lock = threading.RLock()

    def get(self, key: str) -> Optional[Any]:
        with self._lock:
            if key not in self._cache:
                return None
            value, expiry = self._cache[key]
            if time.time() > expiry:
                self.delete(key)
                return None
            return value

    def set(self, key: str, value: Any) -> None:
        with self._lock:
            self.cleanup()
            expiry = time.time() + self.ttl
            if key in self._cache:
                self._cache[key] = (value, expiry)
                if key in self._keys_order:
                    self._keys_order.remove(key)
                self._keys_order.append(key)
            else:
                while len(self._cache) >= self.maxsize and self._keys_order:
                    oldest = self._keys_order.popleft()
                    self._cache.pop(oldest, None)
                self._cache[key] = (value, expiry)
                self._keys_order.append(key)

    def delete(self, key: str) -> None:
        with self._lock:
            self._cache.pop(key, None)
            try:
                self._keys_order.remove(key)
            except ValueError:
                pass

    def cleanup(self) -> None:
        with self._lock:
            now = time.time()
            expired = [k for k, v in self._cache.items() if now > v[1]]
            for k in expired:
                self.delete(k)

    def __setitem__(self, key: str, value: Any) -> None:
        self.set(key, value)

    def __getitem__(self, key: str) -> Any:
        with self._lock:
            val = self.get(key)
            if val is None:
                raise KeyError(key)
            return val


class CacheManager:
    _max_entries = settings.CACHE_MAX_ENTRIES if settings else 1000
    _ttl_seconds = settings.CACHE_TTL_SECONDS if settings else 3600
    _memory_cache = LocalTTLCache(maxsize=_max_entries, ttl=_ttl_seconds)

    @classmethod
    def generate_hash(cls, content: Any) -> str:
        """Generates a 16-character SHA-256 hash prefix for caching keys."""
        if not content:
            return ""
        if isinstance(content, str):
            content_bytes = content.encode("utf-8")
        elif isinstance(content, bytes):
            content_bytes = content
        else:
            try:
                content_bytes = json.dumps(content).encode("utf-8")
            except Exception:
                content_bytes = str(content).encode("utf-8")
        return hashlib.sha256(content_bytes).hexdigest()[:16]

    @classmethod
    async def get(cls, key: str) -> Optional[str]:
        try:
            val = await redis.get(key)
            if val is not None:
                return val
        except RedisUnavailableError as re:
            logger.warning("Upstash Redis unavailable during get for key %s: %s. Using memory fallback.", key, re)
        except Exception as e:
            logger.warning("Unexpected error during Redis get for key %s: %s. Using memory fallback.", key, e)
            
        return cls._memory_cache.get(key)

    @classmethod
    async def set(cls, key: str, value: str, ttl: Optional[int] = None) -> bool:
        # In-memory fallback caching
        cls._memory_cache[key] = value
        
        try:
            if ttl:
                await redis.setex(key, ttl, value)
            else:
                await redis.set(key, value)
            return True
        except RedisUnavailableError as re:
            logger.warning("Upstash Redis unavailable during set for key %s: %s.", key, re)
        except Exception as e:
            logger.warning("Unexpected error during Redis set for key %s: %s.", key, e)
            
        return False

    @classmethod
    def _hash_key(cls, **kwargs) -> str:
        """Deterministic SHA256 key generation based on input arguments."""
        serialized = json.dumps(kwargs, sort_keys=True)
        return hashlib.sha256(serialized.encode("utf-8")).hexdigest()

    @classmethod
    async def get_transcription(cls, audio_hash: str) -> Optional[str]:
        return await cls.get(f"ai_cascade:transcription:{audio_hash}")

    @classmethod
    async def set_transcription(cls, audio_hash: str, text: str) -> None:
        await cls.set(f"ai_cascade:transcription:{audio_hash}", text)

    @classmethod
    async def get_ocr(cls, document_hash: str) -> Optional[str]:
        return await cls.get(f"ai_cascade:ocr:{document_hash}")

    @classmethod
    async def set_ocr(cls, document_hash: str, text: str) -> None:
        await cls.set(f"ai_cascade:ocr:{document_hash}", text)

    @classmethod
    async def get_llm_response(
        cls,
        normalized_input: str,
        prompt_version: str,
        pipeline_name: str
    ) -> Optional[Any]:
        key = cls._hash_key(
            input=normalized_input,
            prompt_version=prompt_version,
            pipeline=pipeline_name
        )
        val = await cls.get(f"ai_cascade:llm_response:{key}")
        if val:
            try:
                return json.loads(val)
            except Exception:
                pass
        return None

    @classmethod
    async def set_llm_response(
        cls,
        normalized_input: str,
        prompt_version: str,
        pipeline_name: str,
        response_data: Any
    ) -> None:
        key = cls._hash_key(
            input=normalized_input,
            prompt_version=prompt_version,
            pipeline=pipeline_name
        )
        await cls.set(f"ai_cascade:llm_response:{key}", json.dumps(response_data), ttl=3600 * 24)
