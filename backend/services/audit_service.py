import json
import logging
from typing import Any, Dict, Optional
from psycopg import AsyncConnection

logger = logging.getLogger(__name__)

async def log_audit(
    db: AsyncConnection,
    user_id: int,
    action: str,
    details: Dict[str, Any],
    request_id: Optional[str] = None
) -> None:
    """
    Inserts a structured audit log into the database.
    Guarantees no raw string interpolation into SQL queries.
    """
    try:
        details_json = json.dumps(details)
        async with db.cursor() as cur:
            await cur.execute(
                """
                INSERT INTO audit_logs (user_id, action, details, request_id)
                VALUES (%s, %s, %s, %s);
                """,
                (user_id, action, details_json, request_id)
            )
        logger.info(
            "Audit Log - Mutation logged: user_id=%s, action=%s, request_id=%s",
            user_id, action, request_id
        )
    except Exception as e:
        logger.error(
            "Failed to write audit log: user_id=%s, action=%s, error=%s",
            user_id, action, str(e)
        )
