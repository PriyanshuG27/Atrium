# Phase 8 Completion Report — Recall

This document details the completed implementation of **Phase 8 (Scheduler & Cron Jobs, Bot Commands & Reminders, Streaks, and Rate Limits)** for the Recall AI-powered Second Brain.

---

## 1. Requirement Mapping & Completion Status

The following table maps Phase 8 requirements to their components, code files, and completion status.

| SS # | Feature / Component | Key Code Files | Status |
| :--- | :--- | :--- | :--- |
| **063** | APScheduler Setup + All 6 Jobs | [scheduler.py](file:///d:/Recall/backend/scheduler/scheduler.py) | **Completed** (Reminders, daily digests, Louvain, DB partitioning, Drive nudges, and cleanup jobs) |
| **064** | Streak Counter + Drive Nudge Logic | [streak_service.py](file:///d:/Recall/backend/services/streak_service.py), [worker.py](file:///d:/Recall/backend/worker.py), [webhook.py](file:///d:/Recall/backend/routes/webhook.py) | **Completed** (Consecutive-day streak increments, Telegram `/streak` command, and Drive nudge sender) |
| **065** | Daily Digest Morning Bot Message | [scheduler.py](file:///d:/Recall/backend/scheduler/scheduler.py), [test_daily_digest.py](file:///d:/Recall/backend/tests/test_daily_digest.py) | **Completed** (Hourly checking, 8:00 AM local timezone offset filter, items count + quizzes due + streak formatting) |
| **066** | Bot `/remind` Command + NLP Parsing | [reminder_service.py](file:///d:/Recall/backend/services/reminder_service.py), [webhook.py](file:///d:/Recall/backend/routes/webhook.py), [test_reminder_service.py](file:///d:/Recall/backend/tests/test_reminder_service.py) | **Completed** (Natural language relative/absolute parsing, UTC translation, 20 active limits, 500-char truncation, item ID references) |
| **067** | Reminder UI on Website | [Reminders.jsx](file:///d:/Recall/frontend/src/pages/Reminders.jsx), [NodePanel.jsx](file:///d:/Recall/frontend/src/components/NodePanel.jsx), [api.py](file:///d:/Recall/backend/routes/api.py), [Reminders.test.jsx](file:///d:/Recall/frontend/src/tests/Reminders.test.jsx) | **Completed** (Inline date-picker form, chronological list page, Pending/Sent/All status filters, count badges, and IDOR-safe DELETE route) |
| **068** | API Rate Limit for Web Endpoints | [rate_limiter.py](file:///d:/Recall/backend/services/rate_limiter.py), [api.py](file:///d:/Recall/backend/routes/api.py), [client.js](file:///d:/Recall/frontend/src/api/client.js), [test_api_rate_limit.py](file:///d:/Recall/backend/tests/test_api_rate_limit.py) | **Completed** (FastAPI route dependency factory, sliding-window Redis keys, custom HTTP 429 Retry-After headers, and UI countdown toasts) |

---

## 2. Core Features & Implementation Details

### A. Background Job Scheduler (SS 063)
*   **APScheduler Integration**: Configures `AsyncIOScheduler` executing 6 recurring jobs:
    1.  `reminders_dispatcher` (Runs every 1 minute)
    2.  `daily_digest_sender` (Runs hourly at minute 0 UTC)
    3.  `louvain_clustering` (Runs daily at 02:00 UTC)
    4.  `drive_nudge_sender` (Runs daily at 10:00 UTC)
    5.  `processed_updates_cleanup` (Runs weekly on Sundays at 03:00 UTC)
    6.  `partition_creator` (Runs monthly on the 25th at 00:00 UTC)

### B. Daily Streak & Drive Integration Nudges (SS 064)
*   **Daily Streaks**: Recalculates user's streak consecutive counts on new item saves. Same-day saves act as no-op. Gaps of 2 or more days reset the streak count to 1.
*   **Google Drive Nudge**: The daily `drive_nudge_sender` scans the database for active users who haven't connected Google Drive and delivers a polite message to configure exports.

### C. Timezone-Aware Daily Digest (SS 065)
*   **Local Time Mapping**: Runs hourly to calculate users currently experiencing their **8:00 AM local morning hour** based on their stored `timezone_offset` (in minutes).
*   **Digest Format**: Summarizes yesterday's saved items, lists up to 3 titles, shows due quizzes, and highlights their current learning streak. Omits yesterday's saves if none were saved.

### D. Bot Reminders & Natural Language Time Parsing (SS 066)
*   **Natural Language Parser**: Supports relative delta offsets (`15m`, `2h`, `3d`) and absolute tokens (`tomorrow`, `tomorrow morning` at 9:00 AM local, `tomorrow evening` at 7:00 PM local, `next week` at 9:00 AM local). Translates timestamps back to UTC.
*   **Active Limit & Truncation**: Enforces a strict limit of **20 pending reminders per user** and truncates message text exceeding 500 characters.
*   **Item ID References**: Allows scheduling a reminder for a specific saved item using its ID (e.g. `/remind 2h 123` or `/remind 2h item:123`). Binds the reminder to the item title and generates a retrieve link (`/file_123`).

### E. Dashboard Reminders Page & UI (SS 067)
*   **Inline Date Picker**: Select any node in the graph, open the panel, choose `Set Reminder`, select a future time, and click **Confirm**.
*   **Reminders Page**: Displays a chronological list of pending and sent reminders, showing an `Active reminders: X / 20` badge. Supports client-side status filter switching.
*   **Delete Integration**: Restricts deletion of sent reminders (read-only state). Deleting a pending reminder calls `DELETE /api/reminders/{id}` containing IDOR user checks.

### F. API Rate Limiting for Web Endpoints (SS 068)
*   **FastAPI Dependency Factory**: Generates sliding-window Redis keys (`rate:{prefix}:{user_id}`) for Search (60/min), Items (120/min), Graph (30/min), Quiz answers (120/min), and Sync (5/hour).
*   **UI Countdown Toasts**: Intercepts HTTP 429 status codes, extracts the `Retry-After` header, and displays a warning toast: `Too many requests — please retry in {seconds}s.`.

---

## 3. Testing & Verification

Both frontend and backend test suites are verified with 100% green passing results:

### A. Frontend Tests (Vitest)
* `Reminders.test.jsx` (Renders list, badge count, filter tabs, disabled delete for sent, delete event triggers)
* `NodePanel.test.jsx` (Confirmation button lookup, open reminder form, submit handler triggers)

```text
 ✓ src/tests/Reminders.test.jsx  (4 tests) 771ms
 ✓ src/tests/NodePanel.test.jsx  (6 tests) 903ms

 Test Files  2 passed (2)
      Tests  10 passed (10)
   Duration  6.91s
```

### B. Backend Tests (Pytest)
* `test_api_rate_limit.py` (Search/items/graph limits, custom HTTP 429 bodies, Retry-After header, auth exemptions)
* `test_rate_limiter.py` (Sliding window key format checks, window reset limits)
* `test_daily_digest.py` (Local hour timezone query filters, formatting states, async delivery isolation)
* `test_reminder_service.py` (Natural time token parsing, 20 active reminder limits, 500-char truncation check)
* `test_idor.py` (Deletion ownership security guards)

```text
===================== 268 passed, 118 warnings in 10.76s ======================
```
