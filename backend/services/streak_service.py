import logging
from datetime import date, timedelta
from psycopg import AsyncConnection

logger = logging.getLogger(__name__)

async def update_streak(user_id: int, db: AsyncConnection) -> int:
    """
    Updates the consecutive daily save streak for a given user.
    Executed after an item has been successfully saved and committed.
    
    Streak tracking rules:
    - If last_activity_date == today: No-op (does not increment).
    - If last_activity_date == today - 1 day: Increments streak_count by 1.
    - Otherwise (greater gap or first activity): Resets streak_count to 1.
    """
    today = date.today()
    
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
        if not row:
            logger.warning("User %d not found, cannot update streak.", user_id)
            return 0
            
        streak_count, last_activity_date = row
        if streak_count is None:
            streak_count = 0
            
        if last_activity_date == today:
            # Already active today. Do not increment.
            logger.info("User %d active today (%s). Streak remains %d.", user_id, today, streak_count)
        elif last_activity_date == today - timedelta(days=1):
            # Active yesterday. Increment streak.
            streak_count += 1
            last_activity_date = today
            await cur.execute(
                """
                UPDATE users
                SET streak_count = %s, last_activity_date = %s
                WHERE id = %s;
                """,
                (streak_count, last_activity_date, user_id)
            )
            logger.info("User %d streak incremented to %d.", user_id, streak_count)
        else:
            # First save ever or gap greater than 1 day. Reset streak to 1.
            streak_count = 1
            last_activity_date = today
            await cur.execute(
                """
                UPDATE users
                SET streak_count = %s, last_activity_date = %s
                WHERE id = %s;
                """,
                (streak_count, last_activity_date, user_id)
            )
            logger.info("User %d streak reset to 1.", user_id)
            
    return streak_count
