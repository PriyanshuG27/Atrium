"""
backend/models/schemas.py
==========================
Pydantic schemas for the Recall API.
Ensures proper response structures and that raw_text never leaks.
"""

from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, date

# ---------------------------------------------------------------------------
# Items schemas
# ---------------------------------------------------------------------------
class ItemResponse(BaseModel):
    id: int = Field(..., description="Internal surrogate ID of the item.")
    user_id: int = Field(..., description="Owner's internal user ID.")
    source_type: str = Field(..., description="Type of ingest source (e.g. url, voice, pdf, image, text).")
    source_url: Optional[str] = Field(None, description="Original source URL.")
    summary: str = Field(..., description="LLM-generated plain-text summary.")
    title: Optional[str] = Field(None, description="Extracted or generated title.")
    tags: List[str] = Field(default_factory=list, description="List of auto-generated tags.")
    created_at: datetime = Field(..., description="Item creation timestamp.")

class ItemCreateRequest(BaseModel):
    url: str = Field(..., description="The URL of the item to add.")
    title: Optional[str] = Field(None, description="The optional title of the item.")

# ---------------------------------------------------------------------------
# Search schemas
# ---------------------------------------------------------------------------
class SearchRequest(BaseModel):
    query: str = Field(..., description="Search query string.")

class SearchResultItem(BaseModel):
    item: ItemResponse = Field(..., description="Matched item metadata.")
    score: float = Field(..., description="Relevance score (cosine similarity or text match rank).")

class SearchResponse(BaseModel):
    results: List[SearchResultItem] = Field(..., description="List of matched items sorted by relevance.")

# ---------------------------------------------------------------------------
# Mind Map Graph schemas
# ---------------------------------------------------------------------------
class GraphNode(BaseModel):
    id: str = Field(..., description="Node ID (e.g. 'item_12' or 'hub_5').")
    type: str = Field(..., description="Node type: 'orbital', 'hub', or 'pulse'.")
    label: str = Field(..., description="Node display label.")
    x: Optional[float] = Field(None, description="Optional X coordinate for Mind Map layout.")
    y: Optional[float] = Field(None, description="Optional Y coordinate for Mind Map layout.")
    item_id: Optional[int] = Field(None, description="Direct item ID if this node represents a saved item.")

class GraphEdge(BaseModel):
    source: str = Field(..., description="Source node ID.")
    target: str = Field(..., description="Target node ID.")
    weight: float = Field(..., description="Edge weight representing similarity.")

class GraphResponse(BaseModel):
    nodes: List[GraphNode] = Field(..., description="All items and semantic hub nodes.")
    edges: List[GraphEdge] = Field(..., description="Connections between nodes representing similarity.")

# ---------------------------------------------------------------------------
# Quizzes schemas
# ---------------------------------------------------------------------------
class QuizResponse(BaseModel):
    id: int = Field(..., description="Quiz ID.")
    user_id: int = Field(..., description="Owner's internal user ID.")
    item_id: int = Field(..., description="Reference to the tested item.")
    question: str = Field(..., description="LLM-generated question.")
    options: List[str] = Field(..., description="List of answer choices.")
    correct_index: int = Field(..., description="0-based index of correct option.")
    explanation: Optional[str] = Field(None, description="LLM-generated explanation.")
    ease_factor: float = Field(..., description="SM-2 ease factor.")
    interval_days: int = Field(..., description="SM-2 interval in days.")
    next_review: date = Field(..., description="Scheduled review date.")
    created_at: datetime = Field(..., description="Quiz creation timestamp.")

class QuizAnswerRequest(BaseModel):
    quality: int = Field(..., ge=0, le=5, description="SM-2 response quality score (0 to 5).")

class QuizStatsResponse(BaseModel):
    total_quizzes: int = Field(..., description="Total quizzes created.")
    due_today: int = Field(..., description="Quizzes due for review today.")
    completed_reviews: int = Field(..., description="Number of reviewed quizzes.")
    average_ease_factor: float = Field(..., description="Average SM-2 ease factor.")
    streak: int = Field(..., description="Current review streak count.")

# ---------------------------------------------------------------------------
# Reminders schemas
# ---------------------------------------------------------------------------
class ReminderResponse(BaseModel):
    id: int = Field(..., description="Reminder ID.")
    user_id: int = Field(..., description="Owner's internal user ID.")
    item_id: Optional[int] = Field(None, description="Optional linked item ID.")
    message: str = Field(..., description="Reminder text message.")
    remind_at: datetime = Field(..., description="Scheduled delivery timestamp (UTC).")
    status: str = Field(..., description="Delivery status ('pending', 'sent', 'failed').")
    created_at: datetime = Field(..., description="Reminder creation timestamp.")

class ReminderCreateRequest(BaseModel):
    item_id: Optional[int] = Field(None, description="Optional linked item ID.")
    message: str = Field(..., description="Reminder message body.")
    remind_at: datetime = Field(..., description="Scheduled delivery timestamp (UTC).")

# ---------------------------------------------------------------------------
# Error response schemas
# ---------------------------------------------------------------------------
class ErrorResponse(BaseModel):
    error: str = Field(..., description="Programmatic error code.")
    message: str = Field(..., description="Human-readable error description.")
