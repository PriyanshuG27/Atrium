"""
backend/services/user_service.py
================================
Service layer for user operations in Recall.
"""

import logging
from psycopg import AsyncConnection

logger = logging.getLogger(__name__)

async def upsert_user(chat_id: str, db: AsyncConnection) -> int:
    """
    Idempotently inserts a user by telegram_chat_id (stored as VARCHAR).
    If a conflict occurs, fetches the existing user's internal ID.
    
    Returns:
        int: The internal user ID (primary key).
    """
    chat_id_str = str(chat_id)
    
    async with db.cursor() as cur:
        # Attempt to insert, returning the ID on success
        await cur.execute(
            """
            INSERT INTO users (telegram_chat_id)
            VALUES (%s)
            ON CONFLICT (telegram_chat_id) DO NOTHING
            RETURNING id;
            """,
            (chat_id_str,)
        )
        row = await cur.fetchone()
        
        if row is not None:
            user_id = int(row[0])
            await db.commit()
            logger.info("Created new user with ID %d for chat_id %s", user_id, chat_id_str)
            return user_id
            
        # Conflict occurred, fetch the existing ID
        await cur.execute(
            "SELECT id FROM users WHERE telegram_chat_id = %s;",
            (chat_id_str,)
        )
        row = await cur.fetchone()
        if row is not None:
            user_id = int(row[0])
            logger.info("Found existing user with ID %d for chat_id %s", user_id, chat_id_str)
            return user_id
            
        raise RuntimeError(f"Failed to upsert user for chat_id {chat_id_str}")
