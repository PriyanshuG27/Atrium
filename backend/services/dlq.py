"""
backend/services/dlq.py
=======================
Dead Letter Queue (DLQ) service for Recall.
Saves failed task payloads and error messages for admin retry,
and sends user-friendly error messages to the Telegram chat.
"""

import json
import logging
import httpx
from psycopg import AsyncConnection

logger = logging.getLogger(__name__)

# User-facing failure messages per Phase 6 spec — short, calm, no personality
TEMPLATES = {
    "voice": "Couldn't process that. Try again in a moment.",
    "pdf": "Couldn't process that. Try again in a moment.",
    "url": "That URL isn't accessible right now. Try again later.",
    "photo": "Couldn't process that. Try again in a moment.",
    "image": "Couldn't process that. Try again in a moment.",
    "text": "Couldn't process that. Try again in a moment.",
}
DEFAULT_TEMPLATE = "Something went wrong. Try again in a moment."

async def write_to_dlq(user_id: int, task_payload: dict, error_message: str, db: AsyncConnection) -> None:
    """
    Saves a failed task payload and error message to the dead_letter_queue table.
    Enforces that this function NEVER raises an exception (last line of defense).
    """
    try:
        # Validate task_payload as valid JSON
        try:
            json_payload = json.dumps(task_payload)
        except (TypeError, ValueError) as json_err:
            logger.error("Failed to serialize task_payload to JSON for DLQ: %s. Payload: %s", json_err, task_payload)
            return

        # Perform the database insert using parameterized statements
        async with db.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO dead_letter_queue (user_id, task_payload, error_message)
                VALUES (%s, %s, %s);
                """,
                (user_id, json_payload, error_message)
            )
            await db.commit()
            logger.info("Successfully wrote task for user %d to dead_letter_queue.", user_id)
            
    except Exception as e:
        logger.error("CRITICAL: Failed to write to dead_letter_queue for user %d: %s", user_id, e)

async def send_failure_message(chat_id: str, content_type: str) -> None:
    """
    Sends a user-friendly failure message to the user's Telegram chat.
    Does not leak any technical details or stack traces.
    """
    from backend.config import settings
    
    chat_id_str = str(chat_id)
    template = TEMPLATES.get(content_type, DEFAULT_TEMPLATE)
    
    url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {
        "chat_id": chat_id_str,
        "text": template
    }
    
    try:
        from backend.services.http_client import get_http_client
        client = get_http_client()
        resp = await client.post(url, json=payload, timeout=5.0)
        resp.raise_for_status()
        logger.info("Sent failure notification to chat_id %s for content_type %s", chat_id_str, content_type)
    except Exception as e:
        logger.error("Failed to send Telegram failure notification to chat_id %s: %s", chat_id_str, e)
