# ADR-003: Telegram-First Webhook Ingestion Architecture

* **Status**: Accepted
* **Deciders**: Product & Ingestion Team
* **Date**: 2026-07-04

## Context
Users require friction-free knowledge capture across mobile and desktop devices without opening a complex web application.

## Decision
We adopt Telegram (`@RecallBrainBot`) as the primary mobile ingestion interface. Webhook `POST /webhook` acknowledges requests in **< 50 ms** after queuing task JSON to Upstash Redis queue (`recall:tasks`). Media ingestion pipelines handle voice notes, screenshots, PDFs, and links.

## Alternatives Considered
* **Native Mobile Apps (iOS/Android)**: Rejected for high initial development and maintenance overhead.
* **Email Ingestion**: Higher latency and weaker real-time feedback loops.

## Consequences
* **Positive**: Instant universal capture on mobile; zero app installation friction for users.
* **Negative**: Dependent on Telegram Webhook API availability.

## Implementation References
* Router: [webhook.py](../../backend/routes/webhook.py)
* Worker: [worker.py](../../backend/worker.py)
