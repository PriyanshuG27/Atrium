"""
backend/routes/bridges.py
=========================
FastAPI router for Cognitive Bridges and Thought Compatibility.
Allows users to connect, compare minds, and generate Spotify-style Blends.
"""

import string
import random
import logging
from typing import List, Optional, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from backend.middleware.twa_auth import get_current_user, UserContext
from backend.db.connection import get_db
import psycopg

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/bridges", tags=["bridges"])

# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class BridgeListItem(BaseModel):
    id: int
    friend_id: int
    friend_name: str
    friend_mind_type: Optional[str] = None
    friend_initials: str
    compatibility_score: float
    created_at: str

class ConnectionRequest(BaseModel):
    code: str

class InviteResponse(BaseModel):
    code: str

class ThoughtBrief(BaseModel):
    id: int
    title: str
    summary: str

class SynapsePair(BaseModel):
    item_a: ThoughtBrief
    item_b: ThoughtBrief
    similarity: float

class BridgeDetailsResponse(BaseModel):
    id: int
    friend_name: str
    friend_mind_type: Optional[str]
    user_mind_type: Optional[str] = None
    friend_initials: str
    compatibility_score: float
    synapses: List[SynapsePair]
    unique_user: List[str]
    unique_friend: List[str]
    time_cadence_user: Dict[str, int]
    time_cadence_friend: Dict[str, int]
    synergy_narrative: str

# ── Synergy Profile Generator ──────────────────────────────────────────────────

async def generate_synergy_profile(type_1: Optional[str], type_2: Optional[str], synapses: list) -> str:
    if not type_1 or not type_2:
        return "Your minds share an interesting overlap in specific subjects. Keep saving thoughts to map your full synergy!"
        
    from backend.services.ai_cascade import AICascade
    
    ARCHETYPES_DESC = {
        "BLVN": "Warp Navigator (broad, creative, high novelty, hyper-linked)",
        "FLVN": "Quantum Catalyst (focused, analytical, high novelty, hyper-linked)",
        "BLSN": "Nebula Weaver (broad, creative, deep history, hyper-linked)",
        "FLSN": "Alchemy Core (focused, analytical, deep history, hyper-linked)",
        "BLVR": "Ingestion Matrix (broad, creative, high novelty, refined focus)",
        "FLVR": "Laser Synthesizer (focused, analytical, high novelty, refined focus)",
        "BLSR": "Codex Cartographer (broad, creative, deep history, refined focus)",
        "FLSR": "Monolith Architect (focused, analytical, deep history, refined focus)",
        "BIVN": "Void Collector (broad, creative, high novelty, independent nodes)",
        "FIVN": "Recon Scout (focused, analytical, high novelty, independent nodes)",
        "BISN": "Archival Explorer (broad, creative, deep history, independent nodes)",
        "FISN": "Deep Diver (focused, analytical, deep history, independent nodes)",
        "BIVR": "Cyclone Curator (broad, creative, high novelty, structured nodes)",
        "FIVR": "Sentinel Core (focused, analytical, high novelty, structured nodes)",
        "BISR": "Silent Librarian (broad, creative, deep history, structured nodes)",
        "FISR": "Singular Vault (focused, analytical, deep history, structured nodes)"
    }
    
    desc_1 = ARCHETYPES_DESC.get(type_1, type_1)
    desc_2 = ARCHETYPES_DESC.get(type_2, type_2)
    
    overlap_themes = [f"'{s['item_a']['title']}' vs '{s['item_b']['title']}'" for s in synapses[:3]]
    themes_str = ", ".join(overlap_themes)
    
    prompt = (
        f"You are a cognitive profiling engine.\n"
        f"Provide a brief, engaging, high-end synergy profile (3 sentences max) "
        f"analyzing the compatibility between two minds.\n\n"
        f"User A is a {desc_1}.\n"
        f"User B is a {desc_2}.\n"
        f"Their overlapping themes include: {themes_str}.\n\n"
        f"Write a premium, inspiring description of how their cognitive styles interact, "
        f"referencing their archetypes and themes. Be direct, conversational, and futuristic."
    )
    try:
        cascade = AICascade()
        res = await cascade.call_llm(prompt)
        if res and "Mock completion" not in res:
            return res
    except Exception:
        pass
        
    return f"As a {type_1} and {type_2}, you merge {type_1[:2]} exploration with {type_2[:2]} synthesis. Your closest synaptic link centers around {synapses[0]['item_a']['title'] if synapses else 'shared concepts'}."

# ── API Endpoints ─────────────────────────────────────────────────────────────

@router.get("", response_model=List[BridgeListItem])
async def list_bridges(
    user: UserContext = Depends(get_current_user),
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """List all established bridges for the user."""
    async with db.cursor() as cur:
        await cur.execute(
            """
            SELECT 
                b.id,
                b.user_id_1,
                b.user_id_2,
                b.compatibility_score,
                b.created_at,
                u1.first_name, u1.username, u1.mind_type,
                u2.first_name, u2.username, u2.mind_type
            FROM cognitive_bridges b
            JOIN users u1 ON b.user_id_1 = u1.id
            JOIN users u2 ON b.user_id_2 = u2.id
            WHERE b.user_id_1 = %s OR b.user_id_2 = %s
            ORDER BY b.created_at DESC;
            """,
            (user.id, user.id)
        )
        rows = await cur.fetchall()
        
        result = []
        for r in rows:
            bridge_id = r[0]
            uid1, uid2 = r[1], r[2]
            score = float(r[3])
            created_at_str = r[4].isoformat() if hasattr(r[4], "isoformat") else str(r[4])
            
            # Determine which user is the friend
            if uid1 == user.id:
                friend_id = uid2
                friend_name = r[8] or r[9] or f"User {uid2}"
                friend_mind_type = r[10]
            else:
                friend_id = uid1
                friend_name = r[5] or r[6] or f"User {uid1}"
                friend_mind_type = r[7]
                
            initials = friend_name[0].upper() if friend_name else '?'
            
            result.append(
                BridgeListItem(
                    id=bridge_id,
                    friend_id=friend_id,
                    friend_name=friend_name,
                    friend_mind_type=friend_mind_type,
                    friend_initials=initials,
                    compatibility_score=score,
                    created_at=created_at_str
                )
            )
        return result

@router.post("/invite", response_model=InviteResponse)
async def generate_invite(
    user: UserContext = Depends(get_current_user),
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Generate a single-use bridge connection code."""
    # Check milestone requirement
    async with db.cursor() as cur:
        await cur.execute("SELECT node_milestones FROM users WHERE id = %s;", (user.id,))
        row = await cur.fetchone()
        milestones = row[0] if row and row[0] else {"unlocked": []}
        # Fallback to direct count if milestones column is somehow empty
        await cur.execute("SELECT COUNT(*) FROM items WHERE user_id = %s;", (user.id,))
        count_row = await cur.fetchone()
        item_count = count_row[0] if count_row else 0
        
        unlocked = milestones.get("unlocked", [])
        if "compatibility" not in unlocked and item_count < 50:
            raise HTTPException(
                status_code=403,
                detail="Milestone locked. You need to save 50 items to unlock Cognitive Bridges."
            )
            
    # Generate random unique code
    chars = string.ascii_uppercase + string.digits
    code = "MIND-" + "".join(random.choices(chars, k=4)) + "-" + "".join(random.choices(chars, k=4))
    
    async with db.cursor() as cur:
        await cur.execute(
            "INSERT INTO bridge_invites (inviter_id, code) VALUES (%s, %s);",
            (user.id, code)
        )
        await db.commit()
        
    return InviteResponse(code=code)

@router.post("/connect", response_model=Dict[str, Any])
async def connect_bridge(
    req: ConnectionRequest,
    user: UserContext = Depends(get_current_user),
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Claim an invite code and establish a cognitive bridge connection."""
    # Check milestone requirement
    async with db.cursor() as cur:
        await cur.execute("SELECT node_milestones FROM users WHERE id = %s;", (user.id,))
        row = await cur.fetchone()
        milestones = row[0] if row and row[0] else {"unlocked": []}
        await cur.execute("SELECT COUNT(*) FROM items WHERE user_id = %s;", (user.id,))
        count_row = await cur.fetchone()
        item_count = count_row[0] if count_row else 0
        
        unlocked = milestones.get("unlocked", [])
        if "compatibility" not in unlocked and item_count < 50:
            raise HTTPException(
                status_code=403,
                detail="Milestone locked. You need to save 50 items to unlock Cognitive Bridges."
            )

    code = req.code.strip()
    
    # 1. Fetch invite
    async with db.cursor() as cur:
        await cur.execute(
            "SELECT inviter_id FROM bridge_invites WHERE code = %s;",
            (code,)
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=400, detail="Invalid or expired invite code.")
            
        inviter_id = row[0]
        if inviter_id == user.id:
            raise HTTPException(status_code=400, detail="You cannot connect with yourself.")
            
    # Determine canonical user order
    user_id_1 = min(user.id, inviter_id)
    user_id_2 = max(user.id, inviter_id)
    
    # 2. Check if already connected
    async with db.cursor() as cur:
        await cur.execute(
            "SELECT id FROM cognitive_bridges WHERE user_id_1 = %s AND user_id_2 = %s;",
            (user_id_1, user_id_2)
        )
        existing = await cur.fetchone()
        if existing:
            # Delete single-use invite code anyway
            await cur.execute("DELETE FROM bridge_invites WHERE code = %s;", (code,))
            await db.commit()
            return {"status": "already_connected", "bridge_id": existing[0]}
            
    # 3. Create Bridge
    async with db.cursor() as cur:
        # Calculate dynamic initial compatibility score
        await cur.execute("""
            SELECT AVG(similarity) FROM (
                SELECT (1.0 - (a.embedding <=> b.embedding)) AS similarity
                FROM items a
                CROSS JOIN items b
                WHERE a.user_id = %s AND b.user_id = %s 
                  AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
                  AND a.title NOT ILIKE 'Bookmark:%%'
                  AND b.title NOT ILIKE 'Bookmark:%%'
                  AND a.summary NOT ILIKE '%%Could not process%%'
                  AND b.summary NOT ILIKE '%%Could not process%%'
                ORDER BY a.embedding <=> b.embedding
                LIMIT 5
            ) as subquery;
        """, (user_id_1, user_id_2))
        avg_row = await cur.fetchone()
        avg_sim = float(avg_row[0]) if avg_row and avg_row[0] is not None else 0.4
        score = round(max(0.0, min(100.0, avg_sim * 100.0)), 1)
        
        await cur.execute(
            """
            INSERT INTO cognitive_bridges (user_id_1, user_id_2, compatibility_score)
            VALUES (%s, %s, %s)
            RETURNING id;
            """,
            (user_id_1, user_id_2, score)
        )
        new_row = await cur.fetchone()
        bridge_id = new_row[0]
        
        # Consume invite
        await cur.execute("DELETE FROM bridge_invites WHERE code = %s;", (code,))
        await db.commit()
        
    return {"status": "connected", "bridge_id": bridge_id}

@router.get("/{bridge_id}", response_model=BridgeDetailsResponse)
async def get_bridge_details(
    bridge_id: int,
    user: UserContext = Depends(get_current_user),
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Retrieve dynamic Spotify-style Blend compatibility details for a bridge."""
    async with db.cursor() as cur:
        # Fetch bridge details and check membership
        await cur.execute(
            """
            SELECT 
                b.id, b.user_id_1, b.user_id_2, b.compatibility_score,
                u1.first_name, u1.username, u1.mind_type,
                u2.first_name, u2.username, u2.mind_type
            FROM cognitive_bridges b
            JOIN users u1 ON b.user_id_1 = u1.id
            JOIN users u2 ON b.user_id_2 = u2.id
            WHERE b.id = %s;
            """,
            (bridge_id,)
        )
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Bridge not found.")
            
        uid1, uid2 = row[1], row[2]
        if user.id not in (uid1, uid2):
            raise HTTPException(status_code=403, detail="Access denied.")
            
        # Determine friend info
        if uid1 == user.id:
            friend_id = uid2
            friend_name = row[7] or row[8] or f"User {uid2}"
            friend_mind_type = row[9]
            user_mind_type = row[6]
        else:
            friend_id = uid1
            friend_name = row[4] or row[5] or f"User {uid1}"
            friend_mind_type = row[6]
            user_mind_type = row[9]
            
        initials = friend_name[0].upper() if friend_name else '?'
        
        # 1. Top Aligned Concepts (Synapses)
        await cur.execute("""
            SELECT 
                a.id AS a_id, a.title AS a_title, a.summary AS a_summary,
                b.id AS b_id, b.title AS b_title, b.summary AS b_summary,
                (1.0 - (a.embedding <=> b.embedding)) AS similarity
            FROM items a
            CROSS JOIN items b
            WHERE a.user_id = %s AND b.user_id = %s 
              AND a.embedding IS NOT NULL AND b.embedding IS NOT NULL
              AND a.title NOT ILIKE 'Bookmark:%%'
              AND b.title NOT ILIKE 'Bookmark:%%'
              AND a.summary NOT ILIKE '%%Could not process%%'
              AND b.summary NOT ILIKE '%%Could not process%%'
            ORDER BY a.embedding <=> b.embedding
            LIMIT 5;
        """, (user.id, friend_id))
        synapse_rows = await cur.fetchall()
        
        synapses = []
        total_sim = 0.0
        for sr in synapse_rows:
            sim = float(sr[6])
            total_sim += sim
            synapses.append(
                SynapsePair(
                    item_a=ThoughtBrief(id=sr[0], title=sr[1] or "Untitled", summary=sr[2] or ""),
                    item_b=ThoughtBrief(id=sr[3], title=sr[4] or "Untitled", summary=sr[5] or ""),
                    similarity=round(sim, 3)
                )
            )
            
        # Recalculate dynamic overall score based on latest thoughts
        avg_sim = (total_sim / len(synapses)) if synapses else 0.4
        score = round(max(0.0, min(100.0, avg_sim * 100.0)), 1)
        
        # 2. Unique Horizons (Distinct specialized tags)
        await cur.execute("SELECT tags FROM items WHERE user_id = %s AND tags IS NOT NULL;", (user.id,))
        tags_user_rows = await cur.fetchall()
        await cur.execute("SELECT tags FROM items WHERE user_id = %s AND tags IS NOT NULL;", (friend_id,))
        tags_friend_rows = await cur.fetchall()
        
        tags_user_counts = {}
        for r in tags_user_rows:
            for t in r[0]:
                tags_user_counts[t] = tags_user_counts.get(t, 0) + 1
                
        tags_friend_counts = {}
        for r in tags_friend_rows:
            for t in r[0]:
                tags_friend_counts[t] = tags_friend_counts.get(t, 0) + 1
                
        unique_user = [t for t, c in sorted(tags_user_counts.items(), key=lambda x: -x[1]) if t not in tags_friend_counts][:5]
        unique_friend = [t for t, c in sorted(tags_friend_counts.items(), key=lambda x: -x[1]) if t not in tags_user_counts][:5]
        
        # 3. Resonance (Time Bucket Comparison)
        await cur.execute("""
            SELECT save_time_bucket, COUNT(*) 
            FROM items 
            WHERE user_id = %s AND save_time_bucket IS NOT NULL
            GROUP BY save_time_bucket;
        """, (user.id,))
        times_user_rows = await cur.fetchall()
        
        await cur.execute("""
            SELECT save_time_bucket, COUNT(*) 
            FROM items 
            WHERE user_id = %s AND save_time_bucket IS NOT NULL
            GROUP BY save_time_bucket;
        """, (friend_id,))
        times_friend_rows = await cur.fetchall()
        
        time_cadence_user = {r[0]: r[1] for r in times_user_rows}
        time_cadence_friend = {r[0]: r[1] for r in times_friend_rows}
        
        # 4. Synergy Narrative (LLM-based)
        # Prepare synapses details to pass to generator
        synapses_raw = []
        for sy in synapses:
            synapses_raw.append({
                "item_a": {"title": sy.item_a.title},
                "item_b": {"title": sy.item_b.title}
            })
        narrative = await generate_synergy_profile(user_mind_type, friend_mind_type, synapses_raw)
        
        # Optional: Save updated score
        await cur.execute("UPDATE cognitive_bridges SET compatibility_score = %s WHERE id = %s;", (score, bridge_id))
        await db.commit()
        
        return BridgeDetailsResponse(
            id=bridge_id,
            friend_name=friend_name,
            friend_mind_type=friend_mind_type,
            user_mind_type=user_mind_type,
            friend_initials=initials,
            compatibility_score=score,
            synapses=synapses,
            unique_user=unique_user,
            unique_friend=unique_friend,
            time_cadence_user=time_cadence_user,
            time_cadence_friend=time_cadence_friend,
            synergy_narrative=narrative
        )

@router.delete("/{bridge_id}", response_model=Dict[str, str])
async def delete_bridge(
    bridge_id: int,
    user: UserContext = Depends(get_current_user),
    db: psycopg.AsyncConnection = Depends(get_db),
):
    """Delete a bridge connection."""
    async with db.cursor() as cur:
        await cur.execute("SELECT user_id_1, user_id_2 FROM cognitive_bridges WHERE id = %s;", (bridge_id,))
        row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Bridge not found.")
            
        uid1, uid2 = row[0], row[1]
        if user.id not in (uid1, uid2):
            raise HTTPException(status_code=403, detail="Access denied.")
            
        await cur.execute("DELETE FROM cognitive_bridges WHERE id = %s;", (bridge_id,))
        await db.commit()
        
    return {"status": "deleted"}
