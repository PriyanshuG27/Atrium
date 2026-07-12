---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Caching, Queues & Redis

Atrium utilizes Upstash Redis as a multi-purpose cache, task queue, and pub/sub broker to orchestrate asynchronous tasks and real-time dashboard events.

---

## 1. Asynchronous Ingestion Queue
The background worker ingestion pipeline is managed entirely through a Redis-backed queue:

- **Enqueuing**: The Telegram Webhook endpoint or API endpoints serialize the ingestion payload and push it to the queue list:
  - **Key**: `atrium:tasks`
  - **Command**: `LPUSH`
- **Worker Processing**: The worker performs an atomic poll to retrieve tasks:
  - **Command**: `BRPOPLPUSH` from `atrium:tasks` to `atrium:processing`
  - **Fail-safety**: Using `brpoplpush` guarantees that if a worker crashes mid-task, the payload remains inside the `atrium:processing` list and is not lost.

---

## 2. Graph & Community Caching
To maintain high frame rates in the frontend and prevent heavy database query recalculations, Atrium caches computed Louvain community node clusters:

- **Key**: `graph:{user_id}`
- **TTL**: Cached with a configured time-to-live (`CACHE_TTL_SECONDS`).
- **Invalidation**: The cache is automatically deleted when new items are added, modified, or deleted by the user.

---

## 3. Sliding Window Rate Limiting
API endpoints are guarded using sliding window rate limiters backed by Redis sorted sets to track requests:

- **Key**: `rate_limit:{user_id}:{route}`
- **Algorithm**: Request timestamps are added to a Redis sorted set (`ZADD`). The worker removes old keys outside the window (`ZREMRANGEBYSCORE`) and checks the set size (`ZCARD`) against limits.
- **Failover**: If Redis is unreachable, the rate limiter logs warning signs and fails open to prevent API downtime.

---

## 4. WebSocket Event Pub/Sub
To push real-time updates from background workers to the frontend SPA:
- The worker publishes a JSON event payload to a Redis channel:
  - **Channel**: `ws:connections:user:{id}`
- The WebSocket router subscribes to the channel and broadcasts the `new_node` message to active client connections.

---

## Evidence & Inspected Files
This document was generated from:
- `backend\services\redis_client.py`
  - Upstash Redis REST wrapper configurations and cache fetch functions.
- `backend\services\rate_limiter.py`
  - ZADD / ZCARD sorting sets rate limits algorithms.
- `backend\worker.py`
  - BRPOPLPUSH task fetching loops.
- `backend\routes\websocket.py`
  - WebSocket subscription handling to Redis channels.
- `backend\routes\webhook.py`
  - Enqueuing logic using LPUSH to push payloads to `atrium:tasks`.
