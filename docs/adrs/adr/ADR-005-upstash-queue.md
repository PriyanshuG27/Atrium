# ADR-005: Upstash Redis Serverless Task Queue & Concurrency Capping

* **Status**: Accepted
* **Deciders**: Infrastructure & Backend Team
* **Date**: 2026-07-04

## Context
Background tasks (summarization, OCR, embedding generation) must be decoupled from HTTP request loops. AI API rate limits require strict concurrency throttling.

## Decision
We implement serverless Redis task queue (`recall:tasks`) powered by Upstash Redis REST client. Background worker (`worker.py`) consumes tasks atomically via `brpoplpush("recall:tasks", "recall:processing")`. Concurrency is strictly capped using `asyncio.Semaphore(3)`.

## Alternatives Considered
* **Celery + RabbitMQ**: Required persistent Redis/RabbitMQ instance, conflicting with serverless cost goals.

## Consequences
* **Positive**: Zero task loss on worker crash; serverless scaling; rate limit protection.
* **Negative**: Requires Upstash REST API keys (`UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`).

## Implementation References
* Worker: [worker.py](../../backend/worker.py)
* Redis Client: [redis_client.py](../../backend/services/redis_client.py)
