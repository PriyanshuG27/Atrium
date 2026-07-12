---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# API Route Reference

This document maps all API endpoints registered across Atrium's routers.

---

## 1. Items & Extension Endpoints (`backend/routes/api.py`)

| Method | Path | Function | Description |
|---|---|---|---|
| **GET** | `/api/items` | `get_items` | Returns a paginated list of saved items for the user, with pagination and filters. |
| **POST** | `/api/items` | `create_item` | Saves a new item directly from the web client. |
| **GET** | `/api/extension/download` | `extension_download` | Serves extension installation assets. |
| **GET** | `/api/extension/check` | `extension_check` | Validates clipper extension status. |
| **GET** | `/api/extension/suggest_tags` | `extension_suggest_tags` | Auto-suggests tags for clipped URLs. |
| **POST** | `/api/extension/save` | `extension_save` | Saves bookmarked signals from clipper. |
| **GET** | `/api/tags` | `get_tags` | Returns all tags used by the user. |
| **GET** | `/api/tags/portraits` | `get_tag_portraits` | Returns user tag portraits (descriptions & icons). |
| **GET** | `/api/items/{item_id}` | `get_item` | Returns details of a specific item. |
| **DELETE** | `/api/items/{item_id}` | `delete_item` | Deletes a saved item. |
| **POST** | `/api/search` | `search_items` | Executes hybrid search and returns RAG response. |
| **GET** | `/api/graph` | `get_graph` | Returns the Louvain-clustered node graph payload. |
| **GET** | `/api/candidates/active` | `get_active_candidates` | Returns daily insights. |
| **GET** | `/api/quizzes/due` | `get_due_quizzes` | Returns due quizzes for the Spaced Repetition Drill room. |
| **POST** | `/api/quizzes/{id}/answer` | `answer_quiz` | Submits answers and updates SM-2 dates. |
| **GET** | `/api/quizzes/stats` | `get_quiz_stats` | Returns current user streak and count metrics. |
| **GET** | `/api/reminders` | `get_reminders` | Returns user reminders list. |
| **POST** | `/api/reminders` | `create_new_reminder` | Schedules a new reminder. |
| **DELETE** | `/api/reminders/{id}` | `delete_reminder` | Cancels a pending reminder. |
| **POST** | `/api/drive/sync` | `sync_drive` | Triggers a manual sync of linked Google Drive folders. |
| **DELETE** | `/api/drive` | `disconnect_drive` | Disconnects the user's Google Drive backup. |
| **GET** | `/api/admin/queue` | `get_admin_queue` | Returns current worker queue status. |
| **POST** | `/api/admin/dlq/{id}/retry` | `retry_dlq_task` | Retries a task registered in the Dead Letter Queue. |
| **GET** | `/api/me` | `get_user_me` | Returns user preferences. |
| **PATCH** | `/api/me` | `update_user_me` | Updates user settings (digest settings, timezone). |
| **DELETE** | `/api/me` | `delete_user_me` | Permanently deletes user profile and data. |
| **GET** | `/api/export` | `export_user_data` | Exposes a JSON data dump of user items. |
| **GET** | `/api/export/zip` | `export_zip` | Downloads all notes formatted as OKF Markdown files in a ZIP. |
| **POST** | `/api/import/zip` | `import_zip` | Imports notes from a zipped OKF vault. |
| **GET** | `/api/user/milestones` | `get_user_milestones` | Returns unlocked user node milestones. |
| **POST** | `/api/user/self-description` | `post_self_description` | Updates user self-description prompt. |
| **GET** | `/api/user/profile` | `get_user_profile` | Returns user profile summary card data. |
| **GET** | `/api/pulse` | `get_user_pulse` | Returns daily engagement pulse scores. |
| **POST** | `/api/user/profile/detailed` | `get_detailed_profile` | Returns LLM-generated mind trajectory profile. |
| **POST** | `/api/share-target` | `handle_pwa_share_target` | Handles PWA mobile share sheet submissions. |

---

## 2. Authentication Endpoints (`backend/routes/auth.py`)

| Method | Path | Function | Description |
|---|---|---|---|
| **GET** | `/auth/telegram` | `auth_telegram` | Web widget authentication redirect. Sets session cookie. |
| **GET** | `/auth/bot-session/init` | `bot_session_init` | Initializes bot widget pairing sessions. |
| **GET** | `/auth/bot-session/poll` | `bot_session_poll` | Polls pairing status. |
| **POST** | `/auth/logout` | `auth_logout` | Destroys authentication session cookies. |
| **GET** | `/auth/me` | `auth_me` | Returns current user session context. |
| **GET** | `/auth/google` | `auth_google` | Initiates Google OAuth sequence. |
| **GET** | `/auth/google/callback` | `auth_google_callback` | Handles Google OAuth callback code. |

---

## 3. Hearth & Partnership Endpoints (`backend/routes/hearth.py`)

| Method | Path | Function | Description |
|---|---|---|---|
| **GET** | `/api/hearth` | `get_hearth` | Returns partnership details and partner's stats. |
| **GET** | `/api/hearth/status` | `get_hearth_status` | Checks active invite/partnership status. |
| **POST** | `/api/hearth/invite` | `create_invite` | Generates a 16-character invite code. |
| **POST** | `/api/hearth/accept` | `accept_invite` | Connects users using an invite code. |
| **DELETE** | `/api/hearth/leave/{pair_id}` | `leave_journey` | Terminates active Hearth partnerships. |

---

## 4. WebSocket & Webhook Systems

| Method | Path | Function | File | Description |
|---|---|---|---|---|
| **POST** | `/webhook` | `telegram_webhook` | `routes/webhook.py` | Telegram webhook listener. Pushes to Redis queue. |
| **WEBSOCKET** | `/api/ws` | `websocket_endpoint` | `routes/websocket.py` | Real-time browser socket channel connection. |

---

## Evidence & Inspected Files
This document was generated from:
- `backend\routes\api.py`
  - Definition of main functional API routes.
- `backend\routes\auth.py`
  - Definition of OAuth and web widget routes.
- `backend\routes\hearth.py`
  - Mapped partnership routes.
- `backend\routes\metrics.py`
  - API and system metrics routes.
- `backend\routes\webhook.py`
  - Bot ingestion payload webhook handler.
- `backend\routes\websocket.py`
  - WS connection stream setups.
