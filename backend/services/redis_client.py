"""
backend/services/redis_client.py
================================
Asynchronous wrapper for Upstash Redis running over TCP protocol.
Maintains absolute backward-compatibility with REST command execution formats
for unit testing mock scopes, while running on standard TCP pools in production.
"""

import asyncio
import logging
import urllib.parse
from typing import List, Tuple, Optional, Union
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

class RedisUnavailableError(Exception):
    """Exception raised when Upstash Redis is unavailable or times out."""
    pass

class RedisAuthError(Exception):
    """Exception raised when Upstash Redis authentication fails."""
    pass

class UpstashRedis:
    def __init__(self):
        self._pool: Optional[aioredis.ConnectionPool] = None
        self._client: Optional[aioredis.Redis] = None

    def _get_client(self) -> aioredis.Redis:
        if self._client is None:
            from backend.config import settings
            
            # Determine connection URL
            redis_url = getattr(settings, "REDIS_URL", None) or getattr(settings, "UPSTASH_REDIS_URL", None)
            if not redis_url:
                rest_url = settings.UPSTASH_REDIS_REST_URL or ""
                token = settings.UPSTASH_REDIS_REST_TOKEN or ""
                
                host = rest_url.replace("https://", "").replace("http://", "").split("/")[0].split(":")[0]
                if not host or host in ("localhost", "127.0.0.1"):
                    redis_url = "redis://localhost:6379"
                else:
                    escaped_token = urllib.parse.quote(token)
                    redis_url = f"rediss://default:{escaped_token}@{host}:6379"
            
            logger.info("Initializing TCP Redis Connection Pool...")
            self._pool = aioredis.ConnectionPool.from_url(
                redis_url,
                max_connections=20,
                decode_responses=True,
                socket_timeout=10.0,
                socket_connect_timeout=5.0
            )
            self._client = aioredis.Redis(connection_pool=self._pool)
        return self._client

    def _redact(self, msg: str) -> str:
        """Redacts the Upstash Redis REST token/password from any string message."""
        from backend.config import settings
        if settings and settings.UPSTASH_REDIS_REST_TOKEN:
            return msg.replace(settings.UPSTASH_REDIS_REST_TOKEN, "<REDACTED>")
        return msg

    def _hash_key(self, key: str) -> str:
        if not isinstance(key, str):
            return key
        import hashlib
        from backend.config import settings

        prefix = ""
        if settings and settings.ENV == "test":
            if not key.startswith("test:"):
                prefix = "test:"

        parts = key.split(":")
        hashed_parts = []
        for part in parts:
            is_numeric = False
            if part.isdigit():
                is_numeric = True
            elif part.startswith("-") and part[1:].isdigit():
                is_numeric = True
                
            if is_numeric:
                hashed = hashlib.sha256(part.encode("utf-8")).hexdigest()[:16]
                hashed_parts.append(hashed)
            else:
                hashed_parts.append(part)
        return prefix + ":".join(hashed_parts)

    async def _request(self, endpoint: str, json_data, timeout: Optional[float] = None) -> Union[dict, list]:
        """
        Executes raw commands on the TCP Redis client, mapping inputs and outputs
        to mock the REST HTTP structure for test compatibility.
        """
        # Hash keys inside command arrays
        if json_data:
            if endpoint == "pipeline":
                if isinstance(json_data, list):
                    for cmd in json_data:
                        if isinstance(cmd, list) and len(cmd) > 1:
                            cmd_name = cmd[0].upper() if isinstance(cmd[0], str) else ""
                            if cmd_name == "EVAL" and len(cmd) > 2:
                                try:
                                    num_keys = int(cmd[2])
                                    for idx in range(3, min(3 + num_keys, len(cmd))):
                                        cmd[idx] = self._hash_key(cmd[idx])
                                except ValueError:
                                    pass
                            else:
                                cmd[1] = self._hash_key(cmd[1])
                                if len(cmd) > 2 and cmd_name == "BRPOPLPUSH":
                                    cmd[2] = self._hash_key(cmd[2])
            else:
                if isinstance(json_data, list) and len(json_data) > 0:
                    cmd_name = json_data[0].upper() if isinstance(json_data[0], str) else ""
                    if cmd_name == "EVAL" and len(json_data) > 2:
                        try:
                            num_keys = int(json_data[2])
                            for idx in range(3, min(3 + num_keys, len(json_data))):
                                json_data[idx] = self._hash_key(json_data[idx])
                        except ValueError:
                            pass
                    elif len(json_data) > 1:
                        json_data[1] = self._hash_key(json_data[1])
                        if len(json_data) > 2 and cmd_name == "BRPOPLPUSH":
                            json_data[2] = self._hash_key(json_data[2])


        try:
            client = self._get_client()
            if endpoint == "pipeline":
                async with client.pipeline(transaction=True) as pipe:
                    for cmd in json_data:
                        pipe.execute_command(*cmd)
                    res = await pipe.execute()
                # Map standard outputs to REST format: [{"result": val}, ...]
                return [{"result": r} for r in res]
            else:
                res = await client.execute_command(*json_data)
                return {"result": res}
        except aioredis.AuthenticationError as ae:
            raise RedisAuthError(self._redact(str(ae)))
        except aioredis.RedisError as re:
            raise RedisUnavailableError(self._redact(str(re)))

    async def lpush(self, key: str, value: str) -> int:
        """Push a value to the head of a list."""
        data = await self._request("", ["LPUSH", key, value])
        if isinstance(data, dict) and "error" in data:
            raise RedisUnavailableError(self._redact(data["error"]))
        return int(data.get("result", 0))

    async def llen(self, key: str) -> int:
        """Return the length of a list."""
        data = await self._request("", ["LLEN", key])
        if isinstance(data, dict) and "error" in data:
            raise RedisUnavailableError(self._redact(data["error"]))
        return int(data.get("result", 0))

    async def lindex(self, key: str, index: int) -> Optional[str]:
        """Get an element from a list by its index."""
        data = await self._request("", ["LINDEX", key, str(index)])
        if isinstance(data, dict) and "error" in data:
            raise RedisUnavailableError(self._redact(data["error"]))
        return data.get("result")

    async def brpop(self, key: str, timeout: int = 5) -> Optional[Tuple[str, str]]:
        """Blocks and pops a value from the tail of a list."""
        data = await self._request("", ["BRPOP", key, str(timeout)], timeout=float(timeout + 5))
        if isinstance(data, dict):
            if "error" in data:
                raise RedisUnavailableError(self._redact(data["error"]))
            result = data.get("result")
            if result is not None and len(result) >= 2:
                return (result[0], result[1])
        return None

    async def pipeline(self, commands: List[List]) -> List:
        """Sends a batch of commands to the Redis pipeline."""
        data = await self._request("pipeline", commands)
        if not isinstance(data, list):
            raise RedisUnavailableError(f"Unexpected pipeline response: {self._redact(str(data))}")
            
        out = []
        for item in data:
            if isinstance(item, dict) and "error" in item:
                raise RedisUnavailableError(self._redact(item["error"]))
            if isinstance(item, dict) and "result" in item:
                out.append(item["result"])
            else:
                out.append(item)
        return out

    async def get(self, key: str) -> Optional[str]:
        """Get the value of a key."""
        data = await self._request("", ["GET", key])
        if isinstance(data, dict):
            if "error" in data:
                raise RedisUnavailableError(self._redact(data["error"]))
            return data.get("result")
        return None

    async def setex(self, key: str, seconds: int, value: str) -> bool:
        """Set key value with timeout."""
        data = await self._request("", ["SET", key, value, "EX", str(seconds)])
        if isinstance(data, dict):
            if "error" in data:
                raise RedisUnavailableError(self._redact(data["error"]))
            return data.get("result") == "OK"
        return False

    async def delete(self, key: str) -> int:
        """Delete a key."""
        data = await self._request("", ["DEL", key])
        if isinstance(data, dict):
            if "error" in data:
                raise RedisUnavailableError(self._redact(data["error"]))
            return int(data.get("result", 0))
        return 0

    async def expire(self, key: str, seconds: int) -> bool:
        """Set a timeout on key."""
        data = await self._request("", ["EXPIRE", key, str(seconds)])
        if isinstance(data, dict):
            if "error" in data:
                raise RedisUnavailableError(self._redact(data["error"]))
            return int(data.get("result", 0)) == 1
        return False

    async def zadd(self, key: str, score: float, member: str) -> int:
        """Add member with score to a sorted set."""
        data = await self._request("", ["ZADD", key, str(score), member])
        if isinstance(data, dict) and "error" in data:
            raise RedisUnavailableError(self._redact(data["error"]))
        return int(data.get("result", 0))

    async def zrem(self, key: str, member: str) -> int:
        """Remove member from a sorted set."""
        data = await self._request("", ["ZREM", key, member])
        if isinstance(data, dict) and "error" in data:
            raise RedisUnavailableError(self._redact(data["error"]))
        return int(data.get("result", 0))

    async def zrangebyscore(self, key: str, min_score: float | str, max_score: float | str) -> List[str]:
        """Return members in sorted set by score."""
        data = await self._request("", ["ZRANGEBYSCORE", key, str(min_score), str(max_score)])
        if isinstance(data, dict) and "error" in data:
            raise RedisUnavailableError(self._redact(data["error"]))
        return data.get("result", [])

    async def eval(self, script: str, numkeys: int, *args) -> Optional[Union[dict, list, str, int]]:
        """Execute a Lua script on the Redis server."""
        payload = ["EVAL", script, str(numkeys)] + list(args)
        data = await self._request("", payload)
        if isinstance(data, dict) and "error" in data:
            raise RedisUnavailableError(self._redact(data["error"]))
        return data.get("result")

    async def rpush(self, key: str, value: str) -> int:
        """Push a value to the tail of a list."""
        data = await self._request("", ["RPUSH", key, value])
        if isinstance(data, dict) and "error" in data:
            raise RedisUnavailableError(self._redact(data["error"]))
        return int(data.get("result", 0))

    async def lrange(self, key: str, start: int, stop: int) -> List[str]:
        """Return a range of elements from a list."""
        data = await self._request("", ["LRANGE", key, str(start), str(stop)])
        if isinstance(data, dict) and "error" in data:
            raise RedisUnavailableError(self._redact(data["error"]))
        return data.get("result", [])

    async def brpoplpush(self, source: str, destination: str, timeout: int) -> Optional[str]:
        """Blocking pop from source and push to destination."""
        data = await self._request("", ["BRPOPLPUSH", source, destination, str(timeout)], timeout=float(timeout + 5))
        if isinstance(data, dict) and "error" in data:
            raise RedisUnavailableError(self._redact(data["error"]))
        return data.get("result")

    async def lrem(self, key: str, count: int, value: str) -> int:
        """Remove occurrences of a value from a list."""
        data = await self._request("", ["LREM", key, str(count), value])
        if isinstance(data, dict) and "error" in data:
            raise RedisUnavailableError(self._redact(data["error"]))
        return int(data.get("result", 0))

    async def sadd(self, key: str, member: str) -> int:
        """Add a member to a set."""
        data = await self._request("", ["SADD", key, member])
        if isinstance(data, dict) and "error" in data:
            raise RedisUnavailableError(self._redact(data["error"]))
        return int(data.get("result", 0))

    async def srem(self, key: str, member: str) -> int:
        """Remove a member from a set."""
        data = await self._request("", ["SREM", key, member])
        if isinstance(data, dict) and "error" in data:
            raise RedisUnavailableError(self._redact(data["error"]))
        return int(data.get("result", 0))

    async def smembers(self, key: str) -> List[str]:
        """Return all members in a set."""
        data = await self._request("", ["SMEMBERS", key])
        if isinstance(data, dict) and "error" in data:
            raise RedisUnavailableError(self._redact(data["error"]))
        return data.get("result", [])

    async def sismember(self, key: str, member: str) -> int:
        """Check set membership."""
        data = await self._request("", ["SISMEMBER", key, member])
        if isinstance(data, dict) and "error" in data:
            raise RedisUnavailableError(self._redact(data["error"]))
        return int(data.get("result", 0))

    async def ping(self) -> bool:
        """Checks liveness of the Redis instance."""
        try:
            data = await self._request("", ["PING"])
            if isinstance(data, dict) and data.get("result") in ("PONG", True):
                return True
            return False
        except Exception as e:
            logger.warning("Redis ping failed: %s", self._redact(str(e)))
            return False

# Expose singleton instance at module level
redis = UpstashRedis()
