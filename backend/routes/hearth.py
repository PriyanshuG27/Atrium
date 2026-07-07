"""
backend/routes/hearth.py
========================
Hearth feature endpoints — shared home progression for two paired users.

All endpoints require JWT cookie auth (get_current_user).
Partner data exposed: name only — never items, raw_text, or embeddings.
Invite codes use secrets.token_urlsafe — cryptographically random, expire 7 days.
"""

import logging
import secrets
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.middleware.twa_auth import get_current_user, UserContext
from backend.db.connection import get_db
from backend.config import settings
from backend.services.http_client import get_http_client

logger = logging.getLogger(__name__)
router = APIRouter(tags=["hearth"])


# ── Score formula ────────────────────────────────────────────────────────────

def shared_days_to_score(days: int) -> float:
    """
    Maps shared active days → 0–96 POC score.
    Curved: fast early (breeze first month), slow later (1 year to Villa).
    """
    if days <= 20:   return days * 0.80
    if days <= 40:   return 16 + (days - 20) * 0.85
    if days <= 65:   return 33 + (days - 40) * 0.76
    if days <= 120:  return 52 + (days - 65) * 0.38
    return min(96.0, 73 + (days - 120) * 0.30)


STAGE_THRESHOLDS = [
    (0,   "Hut"),
    (20,  "Cottage"),
    (40,  "House"),
    (65,  "Manor"),
    (120, "Villa"),
    (200, "Castle"),
]


def get_stage(days: int) -> str:
    stage = "Hut"
    for threshold, name in STAGE_THRESHOLDS:
        if days >= threshold:
            stage = name
    return stage


# ── Telegram helper ──────────────────────────────────────────────────────────

async def _notify_telegram(chat_id: str, text: str) -> None:
    """Send a Telegram message. Fire-and-forget — never raises."""
    try:
        url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
        client = get_http_client()
        await client.post(url, json={"chat_id": chat_id, "text": text}, timeout=5.0)
    except Exception as exc:
        logger.error("Hearth: Telegram notify failed for chat_id %s: %s", chat_id, exc)


# ── Request bodies ───────────────────────────────────────────────────────────

class AcceptBody(BaseModel):
    invite_code: str


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.get("/api/hearth")
async def get_hearth(
    user: UserContext = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Return the current user's Hearth state.
    If not paired → { is_paired: false }.
    If paired   → full state with score, partner info, activity status.
    """
    pair = await db.fetchrow(
        """
        SELECT id, user_a_id, user_b_id, shared_days, created_at
        FROM journey_pairs
        WHERE (user_a_id = $1 OR user_b_id = $1) AND status = 'active'
        LIMIT 1
        """,
        user.id,
    )

    if not pair:
        return {
            "is_paired":   False,
            "score":       0,
            "shared_days": 0,
            "stage":       "Hut",
        }

    partner_id = pair["user_b_id"] if pair["user_a_id"] == user.id else pair["user_a_id"]

    partner = await db.fetchrow(
        "SELECT first_name, username FROM users WHERE id = $1",
        partner_id,
    )

    # Did partner save anything today?
    partner_active_today = await db.fetchval(
        """
        SELECT 1 FROM items
        WHERE user_id = $1 AND created_at::date = CURRENT_DATE
        LIMIT 1
        """,
        partner_id,
    )

    # Did I save anything today?
    self_active_today = await db.fetchval(
        """
        SELECT 1 FROM items
        WHERE user_id = $1 AND created_at::date = CURRENT_DATE
        LIMIT 1
        """,
        user.id,
    )

    days  = pair["shared_days"]
    score = shared_days_to_score(days)

    return {
        "is_paired":            True,
        "score":                round(score, 2),
        "shared_days":          days,
        "stage":                get_stage(days),
        "partner_name":         partner["first_name"] or partner["username"] or "Partner",
        "partner_active_today": bool(partner_active_today),
        "self_active_today":    bool(self_active_today),
        "paired_since":         pair["created_at"].isoformat(),
    }


@router.get("/api/hearth/status")
async def get_hearth_status(
    user: UserContext = Depends(get_current_user),
    db=Depends(get_db),
):
    """Quick check: is the user paired? Does they have a pending invite?"""
    is_paired = bool(await db.fetchval(
        """
        SELECT 1 FROM journey_pairs
        WHERE (user_a_id = $1 OR user_b_id = $1) AND status = 'active'
        LIMIT 1
        """,
        user.id,
    ))

    has_pending_invite = bool(await db.fetchval(
        """
        SELECT 1 FROM journey_invites
        WHERE inviter_id = $1 AND status = 'pending' AND expires_at > NOW()
        LIMIT 1
        """,
        user.id,
    ))

    return {"is_paired": is_paired, "has_pending_invite": has_pending_invite}


@router.post("/api/hearth/invite")
async def create_invite(
    user: UserContext = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Generate a Hearth invite code for the current user.
    Raises 400 if already in an active Hearth.
    Returns invite_code and invite_url.
    """
    existing_pair = await db.fetchval(
        """
        SELECT id FROM journey_pairs
        WHERE (user_a_id = $1 OR user_b_id = $1) AND status = 'active'
        LIMIT 1
        """,
        user.id,
    )
    if existing_pair:
        raise HTTPException(status_code=400, detail="Already in an active Hearth")

    # Return existing pending invite if one exists
    existing_invite = await db.fetchrow(
        """
        SELECT invite_code FROM journey_invites
        WHERE inviter_id = $1 AND status = 'pending' AND expires_at > NOW()
        ORDER BY created_at DESC LIMIT 1
        """,
        user.id,
    )
    if existing_invite:
        code = existing_invite["invite_code"]
        return {
            "invite_code": code,
            "invite_url":  f"https://t.me/recall_bot?start=hearth_{code}",
            "expires_in":  "7 days",
        }

    # Generate new code: format RCL-XXXX-XXXX
    raw  = secrets.token_urlsafe(9).upper().replace("-", "").replace("_", "")[:8]
    code = f"RCL-{raw[:4]}-{raw[4:8]}"

    await db.execute(
        """
        INSERT INTO journey_invites (inviter_id, invite_code)
        VALUES ($1, $2)
        """,
        user.id,
        code,
    )

    return {
        "invite_code": code,
        "invite_url":  f"https://t.me/recall_bot?start=hearth_{code}",
        "expires_in":  "7 days",
    }


@router.post("/api/hearth/accept")
async def accept_invite(
    body: AcceptBody,
    user: UserContext = Depends(get_current_user),
    db=Depends(get_db),
):
    """
    Accept a Hearth invite code and create the pair.
    Both users receive a Telegram notification.
    """
    invite = await db.fetchrow(
        """
        SELECT id, inviter_id FROM journey_invites
        WHERE invite_code = $1
          AND status = 'pending'
          AND expires_at > NOW()
        """,
        body.invite_code,
    )

    if not invite:
        raise HTTPException(status_code=404, detail="Invalid or expired invite code")

    if invite["inviter_id"] == user.id:
        raise HTTPException(status_code=400, detail="Cannot pair with yourself")

    # Check neither user is already paired
    already_paired = await db.fetchval(
        """
        SELECT 1 FROM journey_pairs
        WHERE (user_a_id = $1 OR user_b_id = $1
            OR user_a_id = $2 OR user_b_id = $2)
          AND status = 'active'
        LIMIT 1
        """,
        user.id,
        invite["inviter_id"],
    )
    if already_paired:
        raise HTTPException(status_code=400, detail="One of you is already in an active Hearth")

    # Canonical ordering: smaller id = user_a
    a_id, b_id = sorted([invite["inviter_id"], user.id])

    # Transaction: create pair + mark invite accepted
    async with db.transaction():
        await db.execute(
            """
            INSERT INTO journey_pairs (user_a_id, user_b_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
            """,
            a_id,
            b_id,
        )
        await db.execute(
            "UPDATE journey_invites SET status = 'accepted' WHERE id = $1",
            invite["id"],
        )

    # Notify the inviter via Telegram (fire-and-forget)
    inviter = await db.fetchrow(
        "SELECT telegram_chat_id, first_name FROM users WHERE id = $1",
        invite["inviter_id"],
    )
    accepter_name = await db.fetchval(
        "SELECT COALESCE(first_name, username, 'Someone') FROM users WHERE id = $1",
        user.id,
    )

    await _notify_telegram(
        inviter["telegram_chat_id"],
        f"🔥 {accepter_name} lit your Hearth. Your journey begins.",
    )

    return {"success": True, "message": "Hearth lit"}
