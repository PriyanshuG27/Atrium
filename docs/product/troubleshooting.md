---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Troubleshooting Guide

Solutions to common issues with ingestion, task processing, and server configurations based on Atrium's codebase details.

---

## 1. Telegram Ingestion Failures

### Issue: Bot is not responding to messages
- **Verification**: Check if the webhook is registered. Run a curl check on the webhook status:
  ```bash
  curl http://localhost:8000/health/readiness
  ```
- ** ngrok Tunnel expired**: If debugging locally, your ngrok URL might have changed. Re-run `make tunnel` and call:
  ```bash
  curl "http://localhost:8000/setup-webhook?url=YOUR_NEW_NGROK_URL/webhook"
  ```

---

## 2. Ingestion Tasks Stalled in Queue

### Issue: Signal sent on Telegram but does not show in the dashboard
- **Verification**: Atrium processes items using a Redis queue. Check if the worker loop is running:
  - In development, the worker runs inline in the FastAPI application thread by default (`RUN_WORKER_INLINE=True`). If disabled, check if you started the worker process manually via:
    ```bash
    python scripts/run_worker.py
    ```
- **Dead Letter Queue (DLQ)**: If task processing fails repeatedly (e.g., due to downstream AI API timeouts), the worker writes the task details and error stack trace into the `dead_letter_queue` table before saving a minimal bookmark fallback item.
  - Check DLQ table entries:
    ```sql
    SELECT * FROM dead_letter_queue ORDER BY failed_at DESC LIMIT 5;
    ```
  - Re-run/retry a failed DLQ task via the API endpoint:
    ```bash
    POST /api/admin/dlq/{id}/retry
    ```

---

## 3. Caching and Graph Refresh issues

### Issue: Node graph does not display recently saved signals
- **Verification**: Atrium caches the computed Louvain graph communities in Redis to ensure fast loading:
  - Cache key: `graph:{user_id}`.
  - The cache is automatically cleared when you save or delete items, but you can manually clear the cache key using `redis-cli` or by trigger-syncing from the settings panel.

---
