import time
import logging
import asyncio
import httpx
import json
from typing import Optional, Tuple
from datetime import date, datetime, timezone, time as dt_time, timedelta

from fastapi import APIRouter, Depends, Request, BackgroundTasks
from pydantic import BaseModel
from backend.services.sm2 import update_sm2

from backend.config import settings
from backend.db.connection import get_db
from backend.services.user_service import upsert_user
from backend.services.rate_limiter import check_rate_limit, RateLimitExceeded
import psycopg

logger = logging.getLogger(__name__)
router = APIRouter()

# ---------------------------------------------------------------------------
# Content Type ACK Messages
# ---------------------------------------------------------------------------
ACK_MESSAGES = {
    "voice": "Processing your voice note...",
    "pdf": "Processing your PDF...",
    "url": "Processing your link...",
    "photo": "Processing your image...",
    "text": "Processing your text...",
    "unsupported": "Sorry, I can only process voice notes, PDFs, links, images, and text."
}


# check_rate_limit is imported from backend.services.rate_limiter


# ---------------------------------------------------------------------------
# Content Type Detection Helper
# ---------------------------------------------------------------------------
def detect_content_type(message: dict) -> Tuple[str, Optional[str], Optional[str]]:
    """
    Detects the content type of a Telegram message and extracts necessary content.
    Returns (content_type, text_content, file_id).
    """
    # 1. Voice & Audio
    if "voice" in message:
        file_id = message["voice"].get("file_id")
        return "voice", None, file_id
        
    if "audio" in message:
        file_id = message["audio"].get("file_id")
        return "voice", None, file_id
        
    # 2. PDF & Audio Documents
    if "document" in message:
        doc = message["document"]
        mime_type = doc.get("mime_type") or ""
        file_name = doc.get("file_name") or ""
        if "pdf" in mime_type.lower() or file_name.lower().endswith(".pdf"):
            return "pdf", None, doc.get("file_id")
        elif "audio/" in mime_type.lower() or file_name.lower().endswith((".mp3", ".m4a", ".wav", ".aac", ".ogg", ".opus", ".flac")):
            return "voice", None, doc.get("file_id")
            
    # 3. Photo (extract largest size)
    if "photo" in message:
        photo_sizes = message["photo"]
        if photo_sizes:
            file_id = photo_sizes[-1].get("file_id")
            return "photo", None, file_id
            
    # 4. Text/URL
    if "text" in message:
        text = message["text"]
        entities = message.get("entities", [])
        is_url = False
        for entity in entities:
            if entity.get("type") == "url":
                is_url = True
                break
        if not is_url:
            if text.strip().startswith(("http://", "https://", "www.")):
                is_url = True
        
        if is_url:
            return "url", text, None
        else:
            return "text", text, None
            
    return "unsupported", None, None


# ---------------------------------------------------------------------------
# Global HTTP Client Session for Connection Pooling
# ---------------------------------------------------------------------------
http_client = httpx.AsyncClient(timeout=15.0)


# ---------------------------------------------------------------------------
# Upstash Redis REST Command Helper
# ---------------------------------------------------------------------------
async def run_upstash_command(command: list) -> dict:
    """Sends a REST request to Upstash Redis using the shared connection pool."""
    url = settings.UPSTASH_REDIS_REST_URL
    token = settings.UPSTASH_REDIS_REST_TOKEN
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    resp = await http_client.post(url, json=command, headers=headers)
    resp.raise_for_status()
    return resp.json()


# ---------------------------------------------------------------------------
# Telegram API sendMessage Helper
# ---------------------------------------------------------------------------
async def send_telegram_ack(chat_id: str, ack_message: str):
    """Sends an immediate message back to the Telegram chat using the shared connection pool."""
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": ack_message
    }
    try:
        resp = await http_client.post(url, json=payload)
        resp.raise_for_status()
        logger.info("Telegram ACK successfully sent to chat_id %s: '%s'", chat_id, ack_message)
    except Exception as e:
        logger.error("Failed to send Telegram ACK to chat_id %s: %s", chat_id, e)


async def send_telegram_media(chat_id: str, source_type: str, file_id: str, caption: Optional[str] = None):
    """Sends a stored file back to the Telegram chat using its file_id."""
    bot_token = settings.TELEGRAM_BOT_TOKEN
    method = "sendDocument"
    param_name = "document"
    
    if source_type == "voice":
        method = "sendVoice"
        param_name = "voice"
    elif source_type in ("photo", "image"):
        method = "sendPhoto"
        param_name = "photo"
        
    url = f"https://api.telegram.org/bot{bot_token}/{method}"
    payload = {
        "chat_id": chat_id,
        param_name: file_id
    }
    if caption:
        payload["caption"] = caption
        
    try:
        resp = await http_client.post(url, json=payload)
        resp.raise_for_status()
        logger.info("Successfully sent %s media to chat_id %s using file_id %s", source_type, chat_id, file_id)
    except Exception as e:
        logger.error("Failed to send %s media to chat_id %s: %s", source_type, chat_id, e)



# ---------------------------------------------------------------------------
# POST /webhook Endpoint
# ---------------------------------------------------------------------------
@router.post("/webhook")
async def telegram_webhook(
    request: Request,
    background_tasks: BackgroundTasks,
    db: psycopg.AsyncConnection = Depends(get_db)
):
    """
    FastAPI webhook handler for Telegram Bot updates.
    Enforces idempotency, parses message type, pushes tasks, and responds in < 50ms.
    """
    start_time = time.perf_counter()
    try:
        update = await request.json()
        update_id = update.get("update_id")
        message = update.get("message")
        callback_query = update.get("callback_query")
        
        if update_id is None or (not message and not callback_query):
            logger.warning("Received invalid/empty Telegram update (missing update_id or message/callback_query).")
            return {"status": "ok", "detail": "invalid_update"}
            
        update_id_str = str(update_id)
        
        if callback_query:
            message = callback_query.get("message", {})
            chat_id = str(message.get("chat", {}).get("id"))
        else:
            chat_id = str(message.get("chat", {}).get("id"))
            
        if not chat_id:
            logger.warning("Received update_id %s with missing chat ID.", update_id_str)
            return {"status": "ok", "detail": "invalid_chat"}
            
        logger.info("Processing Telegram update: update_id=%s, chat_id=%s", update_id_str, chat_id)

        # 3. Idempotency check: atomic INSERT ... ON CONFLICT DO NOTHING
        async with db.cursor() as cur:
            await cur.execute(
                "INSERT INTO processed_updates (update_id) VALUES (%s) ON CONFLICT (update_id) DO NOTHING",
                (update_id_str,)
            )
            rows_affected = cur.rowcount
            await db.commit()
            
        if rows_affected == 0:
            logger.info("Duplicate update_id %s received; silently discarding.", update_id_str)
            return {"status": "ok", "detail": "duplicate"}
            
        # 4. Rate limit check
        await check_rate_limit(chat_id)
        
        # 4.2 Handle Callback Query
        if callback_query:
            callback_query_id = callback_query.get("id")
            data = callback_query.get("data", "")
            user_id = await upsert_user(chat_id, db)
            
            if data == "quiz:next":
                # Acknowledge callback
                url_ans = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/answerCallbackQuery"
                payload_ans = {
                    "callback_query_id": callback_query_id
                }
                background_tasks.add_task(http_client.post, url_ans, json=payload_ans)
                
                async with db.cursor() as cur:
                    await cur.execute(
                        """
                        SELECT id, question, options, correct_index, explanation
                        FROM quizzes
                        WHERE user_id = %s
                          AND next_review <= CURRENT_DATE
                        ORDER BY next_review ASC
                        LIMIT 1;
                        """,
                        (user_id,)
                    )
                    row = await cur.fetchone()
                    
                url_edit = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/editMessageText"
                if not row:
                    payload_edit = {
                        "chat_id": chat_id,
                        "message_id": callback_query["message"]["message_id"],
                        "text": "🎉 No quizzes due! Come back tomorrow.",
                        "parse_mode": "HTML",
                        "reply_markup": {"inline_keyboard": []}
                    }
                    background_tasks.add_task(http_client.post, url_edit, json=payload_edit)
                    logger.info("Processed quiz:next: no quizzes left for chat_id %s", chat_id)
                else:
                    quiz_id, question, options_val, correct_index, explanation = row
                    if isinstance(options_val, str):
                        opts = json.loads(options_val)
                    else:
                        opts = options_val
                        
                    inline_keyboard = [
                        [
                            {"text": f"A. {opts[0]}", "callback_data": f"quiz:{quiz_id}:0"},
                            {"text": f"B. {opts[1]}", "callback_data": f"quiz:{quiz_id}:1"}
                        ],
                        [
                            {"text": f"C. {opts[2]}", "callback_data": f"quiz:{quiz_id}:2"},
                            {"text": f"D. {opts[3]}", "callback_data": f"quiz:{quiz_id}:3"}
                        ]
                    ]
                    
                    payload_edit = {
                        "chat_id": chat_id,
                        "message_id": callback_query["message"]["message_id"],
                        "text": f"<b>{question}</b>",
                        "parse_mode": "HTML",
                        "reply_markup": {
                            "inline_keyboard": inline_keyboard
                        }
                    }
                    background_tasks.add_task(http_client.post, url_edit, json=payload_edit)
                    logger.info("Processed quiz:next: loaded next quiz %d for chat_id %s", quiz_id, chat_id)
                    
                return {"status": "ok", "detail": "callback_query_processed"}
                
            elif data.startswith("quiz:"):
                parts = data.split(":")
                if len(parts) == 3:
                    try:
                        quiz_id = int(parts[1])
                        selected_idx = int(parts[2])
                    except ValueError:
                        # Silently ignore parsing errors
                        url_ans = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/answerCallbackQuery"
                        background_tasks.add_task(http_client.post, url_ans, json={"callback_query_id": callback_query_id})
                        return {"status": "ok", "detail": "callback_query_invalid_params"}
                        
                    async with db.cursor() as cur:
                        # Ownership check + fetch quiz data in one go
                        await cur.execute(
                            """
                            SELECT user_id, ease_factor, interval_days, correct_index, explanation, question, options, next_review
                            FROM quizzes
                            WHERE id = %s;
                            """,
                            (quiz_id,)
                        )
                        row = await cur.fetchone()
                        
                        if not row:
                            # Silently ignore if quiz doesn't exist
                            url_ans = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/answerCallbackQuery"
                            background_tasks.add_task(http_client.post, url_ans, json={"callback_query_id": callback_query_id})
                            logger.info("Stale callback/non-existent quiz ID %d: silently ignored", quiz_id)
                            return {"status": "ok", "detail": "quiz_not_found"}
                            
                        owner_id, ease_factor, interval_days, correct_index, explanation, question, options, next_review = row
                        
                        # Confirm user ownership
                        if owner_id != user_id:
                            # Reject cross-user interaction
                            url_ans = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/answerCallbackQuery"
                            background_tasks.add_task(
                                http_client.post,
                                url_ans,
                                json={"callback_query_id": callback_query_id, "text": "This quiz does not belong to you."}
                            )
                            logger.warning("Rejected cross-user quiz answer submission: user_id %d vs owner_id %d", user_id, owner_id)
                            return {"status": "ok", "detail": "quiz_ownership_rejected"}
                            
                        # Idempotency / stale button check
                        # If next_review is in the future, it has already been answered
                        if next_review > date.today():
                            # Silently ignore stale callback
                            url_ans = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/answerCallbackQuery"
                            background_tasks.add_task(http_client.post, url_ans, json={"callback_query_id": callback_query_id})
                            logger.info("Stale callback for already answered quiz ID %d: silently ignored", quiz_id)
                            return {"status": "ok", "detail": "stale_callback_ignored"}
                            
                        is_correct = (selected_idx == correct_index)
                        quality = 5 if is_correct else 2
                        
                        new_ef, new_interval = update_sm2(ease_factor, interval_days, quality)
                        new_next_review = date.today() + timedelta(days=new_interval)
                        
                        await cur.execute(
                            """
                            UPDATE quizzes
                            SET ease_factor = %s,
                                interval_days = %s,
                                next_review = %s
                            WHERE id = %s;
                            """,
                            (new_ef, new_interval, new_next_review, quiz_id)
                        )
                        # Log to quiz_answers
                        await cur.execute(
                            """
                            INSERT INTO quiz_answers (user_id, quiz_id, quality)
                            VALUES (%s, %s, %s);
                            """,
                            (user_id, quiz_id, quality)
                        )
                        await db.commit()
                        
                        # Acknowledge callback query
                        url_ans = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/answerCallbackQuery"
                        payload_ans = {
                            "callback_query_id": callback_query_id,
                            "text": "Correct! 🎉" if is_correct else "Incorrect. ❌"
                        }
                        background_tasks.add_task(http_client.post, url_ans, json=payload_ans)
                        
                        # Format option choices
                        if isinstance(options, str):
                            opts = json.loads(options)
                        else:
                            opts = options
                            
                        correct_option = opts[correct_index] if 0 <= correct_index < len(opts) else ""
                        explanation_text = explanation or ""
                        
                        if is_correct:
                            result_text = f"✅ Correct!\n\n{explanation_text}\n\nNext review: {new_next_review.strftime('%Y-%m-%d')}"
                        else:
                            result_text = f"❌ The answer was {correct_option}\n\n{explanation_text}\n\nReview again in 1 day."
                            
                        url_edit = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/editMessageText"
                        payload_edit = {
                            "chat_id": chat_id,
                            "message_id": callback_query["message"]["message_id"],
                            "text": result_text,
                            "parse_mode": "HTML",
                            "reply_markup": {
                                "inline_keyboard": [
                                    [{"text": "Next Quiz →", "callback_data": "quiz:next"}]
                                ]
                            }
                        }
                        background_tasks.add_task(http_client.post, url_edit, json=payload_edit)
                        logger.info("Processed callback_query answer for quiz %d, user %d", quiz_id, user_id)
                        
            return {"status": "ok", "detail": "callback_query_processed"}
        
        # 4.5 Check for bot commands
        text_content = message.get("text", "")
        if text_content and text_content.strip().startswith("/"):
            user_id = await upsert_user(chat_id, db)
            
            cleaned_text = text_content.strip()
            parts = cleaned_text.split(maxsplit=1)
            command_part = parts[0].split("@")[0].lower()  # Handle bot username suffix
            args = parts[1].strip() if len(parts) > 1 else ""
            
            # Map clickable /file_123 or /get_123 to command_part="/file" and args="123"
            if command_part.startswith("/file_"):
                args = command_part.replace("/file_", "")
                command_part = "/file"
            elif command_part.startswith("/get_"):
                args = command_part.replace("/get_", "")
                command_part = "/file"
            
            if command_part == "/start":
                welcome_msg = "Welcome to Recall! Forward me any link, voice note, PDF, or image and I'll remember it for you."
                background_tasks.add_task(send_telegram_ack, chat_id, welcome_msg)
                logger.info("Processed /start: created/retrieved user %d for chat_id %s", user_id, chat_id)
                return {"status": "ok", "detail": "welcome_sent"}
                
            elif command_part == "/help":
                help_msg = (
                    "📚 Recall Commands:\n\n"
                    "⚙️ Account & Setup:\n"
                    "/start — Set up your account\n"
                    "/connect_drive — Connect Google Drive backup\n"
                    "/digest — Toggle daily morning digests (enabled/disabled)\n\n"
                    "🔍 Search & Retrieval:\n"
                    "/search <query> — Search saved items\n"
                    "/list — Show your last 10 saves\n"
                    "/file <id> — Retrieve a saved item by ID\n"
                    "/tags — Show your top tags\n"
                    "/delete <id> — Delete an item by ID\n\n"
                    "⏰ Learning & Reminders:\n"
                    "/remind <time> <message> — Set a reminder (e.g., /remind 2h Review ML notes)\n"
                    "/remind <time> <item_id> — Set a reminder for an item (e.g., /remind tomorrow morning 123)\n"
                    "/quiz — Get a due quiz question\n"
                    "/streak — Show your daily save streak\n"
                    "/stats — View your knowledge stats\n\n"
                    "💡 Tip: Forward me any link, document, text, voice note, or image and I will save it automatically!"
                )
                background_tasks.add_task(send_telegram_ack, chat_id, help_msg)
                logger.info("Processed /help for chat_id %s", chat_id)
                return {"status": "ok", "detail": "help_sent"}

            elif command_part == "/tags":
                async with db.cursor() as cur:
                    await cur.execute(
                        """
                        SELECT DISTINCT unnest(tags) AS tag, COUNT(*) AS count
                        FROM items
                        WHERE user_id = %s
                        GROUP BY tag
                        ORDER BY count DESC
                        LIMIT 10;
                        """,
                        (user_id,)
                    )
                    rows = await cur.fetchall()

                if not rows:
                    tags_msg = "🏷 Your top tags:\nYou haven't saved any items with tags yet."
                else:
                    lines = ["🏷 Your top tags:"]
                    for idx, (tag, count) in enumerate(rows, 1):
                        lines.append(f"{idx}. {tag} ({count})")
                    tags_msg = "\n".join(lines)

                background_tasks.add_task(send_telegram_ack, chat_id, tags_msg)
                logger.info("Processed /tags command for chat_id %s, returned %d tags", chat_id, len(rows))
                return {"status": "ok", "detail": "tags_processed"}

            elif command_part == "/quiz":
                async with db.cursor() as cur:
                    await cur.execute(
                        """
                        SELECT id, question, options, correct_index, explanation
                        FROM quizzes
                        WHERE user_id = %s
                          AND next_review <= CURRENT_DATE
                        ORDER BY next_review ASC
                        LIMIT 1;
                        """,
                        (user_id,)
                    )
                    row = await cur.fetchone()
                    
                if not row:
                    quiz_msg = "🎉 No quizzes due! Come back tomorrow."
                    background_tasks.add_task(send_telegram_ack, chat_id, quiz_msg)
                    logger.info("Processed /quiz: no quizzes due for chat_id %s", chat_id)
                else:
                    quiz_id, question, options_val, correct_index, explanation = row
                    if isinstance(options_val, str):
                        opts = json.loads(options_val)
                    else:
                        opts = options_val
                        
                    inline_keyboard = [
                        [
                            {"text": f"A. {opts[0]}", "callback_data": f"quiz:{quiz_id}:0"},
                            {"text": f"B. {opts[1]}", "callback_data": f"quiz:{quiz_id}:1"}
                        ],
                        [
                            {"text": f"C. {opts[2]}", "callback_data": f"quiz:{quiz_id}:2"},
                            {"text": f"D. {opts[3]}", "callback_data": f"quiz:{quiz_id}:3"}
                        ]
                    ]
                        
                    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
                    payload = {
                        "chat_id": chat_id,
                        "text": f"<b>{question}</b>",
                        "parse_mode": "HTML",
                        "reply_markup": {
                            "inline_keyboard": inline_keyboard
                        }
                    }
                    background_tasks.add_task(http_client.post, url, json=payload)
                    logger.info("Processed /quiz: sent due quiz %d to chat_id %s", quiz_id, chat_id)
                    
                return {"status": "ok", "detail": "quiz_processed"}
                
            elif command_part in ("/file", "/get"):
                if not args:
                    file_msg = "Please provide an item ID: /file 42"
                    background_tasks.add_task(send_telegram_ack, chat_id, file_msg)
                else:
                    try:
                        item_id = int(args)
                        async with db.cursor() as cur:
                            await cur.execute(
                                "SELECT source_type, source_url, raw_text, title FROM items WHERE id = %s AND user_id = %s;",
                                (item_id, user_id)
                            )
                            row = await cur.fetchone()
                            
                        if not row:
                            file_msg = "Item not found."
                            background_tasks.add_task(send_telegram_ack, chat_id, file_msg)
                        else:
                            source_type, source_url, raw_text, title = row
                            if source_type in ("pdf", "voice", "photo", "image"):
                                if source_url:
                                    # Send the file back using its stored file_id
                                    caption = title or f"{source_type.capitalize()} file"
                                    background_tasks.add_task(send_telegram_media, chat_id, source_type, source_url, caption)
                                else:
                                    file_msg = f"This {source_type} item does not have a saved Telegram file ID."
                                    background_tasks.add_task(send_telegram_ack, chat_id, file_msg)
                            elif source_type == "url":
                                file_msg = f"🔗 Here is the link you saved:\n{source_url}"
                                background_tasks.add_task(send_telegram_ack, chat_id, file_msg)
                            else:
                                # Decrypt raw text for notes
                                from backend.services.encryption import decrypt
                                try:
                                    decrypted = decrypt(raw_text)
                                except Exception:
                                    decrypted = raw_text
                                file_msg = f"📝 Saved Note:\n{decrypted}"
                                background_tasks.add_task(send_telegram_ack, chat_id, file_msg)
                    except ValueError:
                        file_msg = "Please provide a valid item ID: /file 42"
                        background_tasks.add_task(send_telegram_ack, chat_id, file_msg)
                return {"status": "ok", "detail": "file_processed"}
                
            elif command_part == "/search":
                if not args:
                    search_msg = "Please provide a search query: /search machine learning"
                else:
                    from backend.services.search_service import hybrid_search
                    results = await hybrid_search(args, user_id, db)
                    if not results:
                        search_msg = f"🔍 No results found for \"{args}\"."
                    else:
                        # Limit to top-5 results
                        results_limited = results[:5]
                        
                        # Generate synthesised RAG answer if results count >= 3
                        answer = None
                        if len(results_limited) >= 3:
                            from backend.services.ai_cascade import AICascade
                            cascade = AICascade()
                            try:
                                summaries = [r["summary"] or "" for r in results_limited]
                                answer = await cascade.answer_question(args, summaries)
                            except Exception as e:
                                logger.error("RAG answer generation in bot /search failed: %s", e)
                                answer = None
                        
                        lines = [f"🔍 Query: {args}"]
                        if answer:
                            lines.append(f"💡 {answer}")
                        lines.append("")
                        lines.append("Sources:")
                        for idx, item in enumerate(results_limited, 1):
                            source_type = item["source_type"]
                            title = item["title"]
                            display_title = title or (
                                "Voice note" if source_type == "voice"
                                else "PDF" if source_type == "pdf"
                                else "Image" if source_type in ("photo", "image")
                                else "Link" if source_type == "url"
                                else "Text"
                            )
                            summary = item.get("summary") or ""
                            summary_snippet = summary[:100] + "..." if len(summary) > 100 else summary
                            summary_part = f" - {summary_snippet}" if summary_snippet else ""
                            lines.append(f"{idx}. [{source_type}] {display_title}{summary_part} — /file_{item['id']}")
                        search_msg = "\n".join(lines)
                        
                background_tasks.add_task(send_telegram_ack, chat_id, search_msg)
                logger.info("Processed /search %s for chat_id %s", args, chat_id)
                return {"status": "ok", "detail": "search_processed"}

            elif command_part == "/list":
                async with db.cursor() as cur:
                    await cur.execute(
                        """
                        SELECT id, title, source_type, created_at FROM items
                        WHERE user_id = %s
                        ORDER BY created_at DESC
                        LIMIT 10;
                        """,
                        (user_id,)
                    )
                    rows = await cur.fetchall()
                    
                if not rows:
                    list_msg = "📋 Your last 10 saves:\nYou haven't saved any items yet."
                else:
                    lines = ["📋 Your last 10 saves:"]
                    for idx, (item_id, title, source_type, created_at) in enumerate(rows, 1):
                        display_title = title or (
                            "Voice note" if source_type == "voice"
                            else "PDF" if source_type == "pdf"
                            else "Image" if source_type in ("photo", "image")
                            else "Link" if source_type == "url"
                            else "Text"
                        )
                        
                        if created_at.tzinfo is not None:
                            now = datetime.now(timezone.utc)
                        else:
                            now = datetime.now(timezone.utc).replace(tzinfo=None)
                            
                        diff = now - created_at
                        diff_seconds = int(diff.total_seconds())
                        
                        if diff_seconds < 60:
                            rel_time = "just now"
                        elif diff_seconds < 3600:
                            mins = diff_seconds // 60
                            rel_time = f"{mins} minute ago" if mins == 1 else f"{mins} minutes ago"
                        elif diff_seconds < 86400:
                            hours = diff_seconds // 3600
                            rel_time = f"{hours} hour ago" if hours == 1 else f"{hours} hours ago"
                        elif diff_seconds < 172800:
                            rel_time = "yesterday"
                        else:
                            days = diff.days
                            rel_time = f"{days} days ago"
                            
                        lines.append(f"{idx}. [{source_type}] {display_title} ({rel_time}) — /file_{item_id}")
                    list_msg = "\n".join(lines)
                    
                background_tasks.add_task(send_telegram_ack, chat_id, list_msg)
                logger.info("Processed /list for chat_id %s, items=%d", chat_id, len(rows))
                return {"status": "ok", "detail": "list_sent"}
                
            elif command_part == "/delete":
                if not args:
                    delete_msg = "Please provide a valid item ID: /delete 42"
                else:
                    try:
                        item_id = int(args)
                        async with db.cursor() as cur:
                            await cur.execute(
                                "DELETE FROM quizzes WHERE item_id = %s AND user_id = %s;",
                                (item_id, user_id)
                            )
                            await cur.execute(
                                "DELETE FROM item_chunks WHERE item_id = %s AND user_id = %s;",
                                (item_id, user_id)
                            )
                            await cur.execute(
                                "DELETE FROM items WHERE id = %s AND user_id = %s;",
                                (item_id, user_id)
                            )
                            rows_deleted = cur.rowcount
                            await db.commit()
                        if rows_deleted > 0:
                            delete_msg = "Deleted ✓"
                        else:
                            delete_msg = "Item not found."
                    except ValueError:
                        delete_msg = "Please provide a valid item ID: /delete 42"
                        
                background_tasks.add_task(send_telegram_ack, chat_id, delete_msg)
                logger.info("Processed /delete %s for chat_id %s", args, chat_id)
                return {"status": "ok", "detail": "delete_processed"}
                
            elif command_part == "/stats":
                async with db.cursor() as cur:
                    await cur.execute(
                        """
                        SELECT source_type, COUNT(*) 
                        FROM items 
                        WHERE user_id = %s 
                        GROUP BY source_type;
                        """,
                        (user_id,)
                    )
                    items_rows = await cur.fetchall()
                    
                    await cur.execute(
                        "SELECT COUNT(*) FROM quizzes WHERE user_id = %s;",
                        (user_id,)
                    )
                    quiz_row = await cur.fetchone()
                    quizzes_answered = quiz_row[0] if quiz_row else 0
                    
                    from backend.services.user_service import get_and_update_user_streak
                    streak_count = await get_and_update_user_streak(cur, user_id)
                    await db.commit()
                    
                total_saves = 0
                links_count = 0
                voice_count = 0
                pdfs_count = 0
                images_count = 0
                texts_count = 0
                
                for source_type, count in items_rows:
                    total_saves += count
                    if source_type == "url":
                        links_count = count
                    elif source_type == "voice":
                        voice_count = count
                    elif source_type in ("pdf", "document"):
                        pdfs_count = count
                    elif source_type in ("photo", "image"):
                        images_count = count
                    elif source_type == "text":
                        texts_count = count
                        
                stats_line = f"— Links: {links_count} | Voice: {voice_count} | PDFs: {pdfs_count} | Images: {images_count}"
                if texts_count > 0:
                    stats_line += f" | Texts: {texts_count}"
                    
                stats_msg = (
                    "📊 Your Recall stats:\n"
                    f"Total saves: {total_saves}\n"
                    f"{stats_line}\n"
                    f"Quizzes answered: {quizzes_answered}\n"
                    f"Current streak: 🔥 {streak_count} days"
                )
                background_tasks.add_task(send_telegram_ack, chat_id, stats_msg)
                logger.info("Processed /stats for chat_id %s", chat_id)
                return {"status": "ok", "detail": "stats_sent"}

            elif command_part == "/streak":
                async with db.cursor() as cur:
                    await cur.execute(
                        """
                        SELECT streak_count, last_activity_date
                        FROM users
                        WHERE id = %s;
                        """,
                        (user_id,)
                    )
                    row = await cur.fetchone()
                    streak_count = row[0] if (row and row[0] is not None) else 0
                    await db.commit()
                
                streak_msg = f"🔥 {streak_count} day streak! Keep saving knowledge."
                background_tasks.add_task(send_telegram_ack, chat_id, streak_msg)
                logger.info("Processed /streak for chat_id %s", chat_id)
                return {"status": "ok", "detail": "streak_sent"}

            elif command_part == "/digest":
                async with db.cursor() as cur:
                    await cur.execute(
                        "SELECT digest_enabled FROM users WHERE id = %s;",
                        (user_id,)
                    )
                    row = await cur.fetchone()
                    current_status = row[0] if (row and row[0] is not None) else True
                    
                    new_status = not current_status
                    await cur.execute(
                        "UPDATE users SET digest_enabled = %s WHERE id = %s;",
                        (new_status, user_id)
                    )
                    await db.commit()
                    
                if new_status:
                    digest_msg = "📬 Daily digest enabled! You will receive morning summaries at 08:00 AM local time."
                else:
                    digest_msg = "📬 Daily digest disabled. You will no longer receive morning summaries."
                    
                background_tasks.add_task(send_telegram_ack, chat_id, digest_msg)
                logger.info("Processed /digest for chat_id %s, set to %s", chat_id, new_status)
                return {"status": "ok", "detail": "digest_toggled"}

            elif command_part == "/remind":
                if not args:
                    remind_err = "Sorry, I didn't understand that time.\n\nTry:\n/remind 2h Read those notes"
                    background_tasks.add_task(send_telegram_ack, chat_id, remind_err)
                    return {"status": "ok", "detail": "remind_invalid"}
                    
                from backend.services.reminder_service import parse_time_expression, create_reminder
                delta, absolute_format, message = parse_time_expression(args)
                
                if delta is None and absolute_format is None:
                    remind_err = "Sorry, I didn't understand that time.\n\nTry:\n/remind 2h Read those notes"
                    background_tasks.add_task(send_telegram_ack, chat_id, remind_err)
                    return {"status": "ok", "detail": "remind_invalid"}
                    
                if not message:
                    remind_err = "Please provide a message for your reminder.\n\nTry:\n/remind 2h Read those notes"
                    background_tasks.add_task(send_telegram_ack, chat_id, remind_err)
                    return {"status": "ok", "detail": "remind_invalid"}
                
                # Detect if the reminder references a saved item ID
                cleaned_msg = message.strip()
                item_id_ref = None
                item_found = False
                item_title = ""
                
                # Check different reference formats:
                if cleaned_msg.isdigit():
                    item_id_ref = int(cleaned_msg)
                elif cleaned_msg.lower().startswith("item:") and cleaned_msg[5:].strip().isdigit():
                    item_id_ref = int(cleaned_msg[5:].strip())
                elif cleaned_msg.lower().startswith("file:") and cleaned_msg[5:].strip().isdigit():
                    item_id_ref = int(cleaned_msg[5:].strip())
                elif cleaned_msg.startswith("/file_") and cleaned_msg[6:].strip().isdigit():
                    item_id_ref = int(cleaned_msg[6:].strip())
                elif cleaned_msg.startswith("/get_") and cleaned_msg[5:].strip().isdigit():
                    item_id_ref = int(cleaned_msg[5:].strip())
                
                if item_id_ref is not None:
                    async with db.cursor() as cur:
                        await cur.execute(
                            "SELECT title FROM items WHERE id = %s AND user_id = %s;",
                            (item_id_ref, user_id)
                        )
                        item_row = await cur.fetchone()
                        if item_row:
                            item_title = item_row[0] or "Untitled Item"
                            message = f"Review Item: {item_title}\nRetrieve: /file_{item_id_ref}"
                            item_found = True
                
                # Fetch user's timezone_offset
                async with db.cursor() as cur:
                    await cur.execute(
                        "SELECT timezone_offset FROM users WHERE id = %s;",
                        (user_id,)
                    )
                    user_row = await cur.fetchone()
                    timezone_offset = user_row[0] if (user_row and user_row[0] is not None) else 0
                    
                # Calculate remind_at in UTC
                if delta is not None:
                    remind_at_utc = datetime.now(timezone.utc) + delta
                else:
                    utc_now = datetime.now(timezone.utc)
                    user_local = utc_now + timedelta(minutes=timezone_offset)
                    
                    if absolute_format in ("tomorrow", "tomorrow_morning"):
                        target_date = user_local.date() + timedelta(days=1)
                        target_local_dt = datetime.combine(target_date, dt_time(9, 0))
                    elif absolute_format == "tomorrow_evening":
                        target_date = user_local.date() + timedelta(days=1)
                        target_local_dt = datetime.combine(target_date, dt_time(19, 0))
                    elif absolute_format == "next_week":
                        target_date = user_local.date() + timedelta(days=7)
                        target_local_dt = datetime.combine(target_date, dt_time(9, 0))
                    else:
                        remind_err = "Sorry, I didn't understand that time.\n\nTry:\n/remind 2h Read those notes"
                        background_tasks.add_task(send_telegram_ack, chat_id, remind_err)
                        return {"status": "ok", "detail": "remind_invalid"}
                        
                    remind_at_utc = target_local_dt - timedelta(minutes=timezone_offset)
                    remind_at_utc = remind_at_utc.replace(tzinfo=timezone.utc)
                
                try:
                    reminder_id, final_message, was_truncated = await create_reminder(
                        user_id, message, remind_at_utc, db
                    )
                    await db.commit()
                except ValueError as val_err:
                    background_tasks.add_task(send_telegram_ack, chat_id, str(val_err))
                    return {"status": "ok", "detail": "remind_limit_exceeded"}
                except Exception as err:
                    logger.error("Failed to create reminder: %s", err)
                    background_tasks.add_task(send_telegram_ack, chat_id, "Failed to set reminder. Please try again.")
                    return {"status": "ok", "detail": "remind_failed"}
                
                # Format response datetime in user's local timezone
                user_local_target = remind_at_utc + timedelta(minutes=timezone_offset)
                formatted_dt = user_local_target.strftime("%d %b %Y at %H:%M")
                
                if item_found:
                    reply_msg = f"⏰ Reminder set for item '{item_title}' on {formatted_dt} ✓"
                else:
                    reply_msg = f"⏰ Reminder set for {formatted_dt} ✓"
                    
                if was_truncated:
                    reply_msg += "\n(Note: Your reminder message was truncated to 500 characters.)"
                    
                background_tasks.add_task(send_telegram_ack, chat_id, reply_msg)
                logger.info("Processed /remind: created reminder %d for user %d", reminder_id, user_id)
                return {"status": "ok", "detail": "remind_processed"}
                
            else:
                unknown_msg = "Unknown command. Type /help to see all commands."
                background_tasks.add_task(send_telegram_ack, chat_id, unknown_msg)
                logger.info("Processed unknown command %s for chat_id %s", command_part, chat_id)
                return {"status": "ok", "detail": "unknown_command_sent"}
            
        # 5. Detect content type
        content_type, text_content, file_id = detect_content_type(message)
        logger.info("Detected message content type '%s' for update_id=%s.", content_type, update_id_str)
        
        # 6. Dispatch immediate Telegram ACK
        ack_message = ACK_MESSAGES.get(content_type, ACK_MESSAGES["unsupported"])
        background_tasks.add_task(send_telegram_ack, chat_id, ack_message)
        
        # 7. Push task JSON to Upstash Redis queue (LPUSH recall:tasks) ONLY if supported
        if content_type != "unsupported":
            task = {
                "update_id": update_id_str,
                "chat_id": chat_id,
                "content_type": content_type
            }
            if content_type in ("text", "url"):
                task["text"] = text_content
            elif content_type in ("voice", "pdf", "photo"):
                task["file_id"] = file_id
                
            command = ["LPUSH", "recall:tasks", json.dumps(task)]
            background_tasks.add_task(run_upstash_command, command)
            logger.info(
                "Queued background task (Redis push) for update_id=%s, chat_id=%s, type=%s",
                update_id_str, chat_id, content_type
            )
        else:
            logger.info(
                "Skipped Redis queue push for unsupported content type on update_id=%s, chat_id=%s",
                update_id_str, chat_id
            )
        
    except RateLimitExceeded as e:
        logger.warning(
            "Rate limit exceeded for chat_id %s: returning 200 to Telegram (retry_after=%.1fs).",
            chat_id, e.retry_after
        )
        return {"status": "ok", "detail": "rate_limited"}
    except Exception as e:
        logger.exception("Exception caught in webhook handler: %s", e)
        # Always return 200 to stop delivery retry loop storms
        return {"status": "ok", "detail": "error_handled"}
        
    finally:
        elapsed = (time.perf_counter() - start_time) * 1000
        logger.info("Webhook request finished in %.2f ms", elapsed)
        
    return {"status": "ok"}
