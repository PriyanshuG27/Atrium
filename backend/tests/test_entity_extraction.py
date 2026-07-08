import pytest
from unittest.mock import AsyncMock, MagicMock, patch
import numpy as np

from backend.services.entity_extractor import (
    normalize_entity_name,
    extract_and_resolve_entities,
    VALID_ENTITY_TYPES
)

# ---------------------------------------------------------------------------
# 1. Lexical Normalization Unit Tests
# ---------------------------------------------------------------------------
def test_normalize_entity_name_casing_and_whitespace():
    """Verify casing is lowercased and double whitespaces are collapsed."""
    assert normalize_entity_name("  FASTapi  ") == "fastapi"
    assert normalize_entity_name("Open   AI") == "open ai"

def test_normalize_entity_name_accents_and_punctuation():
    """Verify unicode accents are decomposed and terminal punctuation is trimmed."""
    # Priyánshu has an acute accent on a
    assert normalize_entity_name("Priyánshu") == "priyanshu"
    assert normalize_entity_name("Recall™") == "recall"
    assert normalize_entity_name("...Recall...") == "recall"
    assert normalize_entity_name("") == ""

# ---------------------------------------------------------------------------
# 2. Ingestion Resolution & Idempotency Integration Tests
# ---------------------------------------------------------------------------
class AsyncContextManagerMock:
    def __init__(self, return_value):
        self.return_value = return_value
    async def __aenter__(self):
        return self.return_value
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        pass

@pytest.mark.asyncio
@patch("backend.services.entity_extractor.AICascade")
@patch("backend.services.entity_extractor.embed_text")
async def test_extract_and_resolve_entities_exact_match(mock_embed, mock_cascade_cls):
    """Verify exact-match shortcut maps to existing entity instantly without AI resolution calls."""
    mock_cascade = AsyncMock()
    mock_cascade_cls.return_value = mock_cascade

    # Mock extract payload: returns one entity and one relationship
    mock_cascade.call_llm.side_effect = [
        # Extraction call
        '{"entities": [{"name": "FastAPI", "type": "Technology", "description": "Web framework"}], "relationships": []}'
    ]

    # Mock DB cursor
    mock_cur = AsyncMock()
    # First query (select exact match): returns ID 42
    mock_cur.fetchone.side_effect = [
        (42, "Existing description")
    ]
    
    mock_conn = MagicMock()
    mock_conn.cursor.return_value = AsyncContextManagerMock(mock_cur)
    mock_conn.commit = AsyncMock()

    # Execute extraction
    await extract_and_resolve_entities(
        item_id=1,
        user_id=10,
        text="FastAPI web application.",
        db=mock_conn
    )

    # Assert status update to running, then completed
    assert mock_cur.execute.call_count >= 3
    # Check that exact match query was executed
    first_query_args = mock_cur.execute.call_args_list[1][0]
    assert "SELECT id, description FROM entities" in first_query_args[0]
    assert first_query_args[1] == (10, "fastapi", "Technology")

    # Assert mention insertion with resolved ID 42
    mention_args = mock_cur.execute.call_args_list[2][0]
    assert "INSERT INTO entity_mentions" in mention_args[0]
    assert mention_args[1] == (10, 42, 1, "Web framework")

    # Assert no similarity embeddings were generated because of exact match shortcut
    mock_embed.assert_not_called()

@pytest.mark.asyncio
@patch("backend.services.entity_extractor.AICascade")
@patch("backend.services.entity_extractor.embed_text")
async def test_extract_and_resolve_entities_pgvector_resolution(mock_embed, mock_cascade_cls):
    """Verify pgvector distance check + AI confirmation resolves fuzzy matches to existing canonical record."""
    mock_cascade = AsyncMock()
    mock_cascade_cls.return_value = mock_cascade

    # Mock extraction response and confirmation response (YES)
    mock_cascade.call_llm.side_effect = [
        # 1. Extraction response
        '{"entities": [{"name": "Postgres", "type": "Technology", "description": "Database"}], "relationships": []}',
        # 2. Resolution confirmation call
        'YES'
    ]

    # Vector embedding mock
    mock_embed.return_value = np.zeros(384).tolist()

    # Mock DB cursor
    mock_cur = AsyncMock()
    # 1. Exact match lookup (return None)
    # 2. Similarity candidate scan (return PostgreSQL, ID 88, similarity 0.92)
    # 3. Mention insert (returns rows/None)
    mock_cur.fetchone.side_effect = [
        None,  # exact match check
    ]
    mock_cur.fetchall.side_effect = [
        [(88, "PostgreSQL", "Relational database", 0.92)]  # similarity lookup candidate
    ]

    mock_conn = MagicMock()
    mock_conn.cursor.return_value = AsyncContextManagerMock(mock_cur)
    mock_conn.commit = AsyncMock()

    await extract_and_resolve_entities(
        item_id=1,
        user_id=10,
        text="Using Postgres database.",
        db=mock_conn
    )

    # Confirm embed_text was called with normalized representation
    mock_embed.assert_called_with("name: postgres | type: technology")

    # Verify confirmation query was sent to AICascade
    assert mock_cascade.call_llm.call_count == 2
    confirm_prompt = mock_cascade.call_llm.call_args_list[1][0][0]
    assert "Postgres" in confirm_prompt
    assert "PostgreSQL" in confirm_prompt

    # Verify we inserted mention under candidate ID 88
    mention_call = mock_cur.execute.call_args_list[3][0]
    assert "INSERT INTO entity_mentions" in mention_call[0]
    assert mention_call[1] == (10, 88, 1, "Database")

@pytest.mark.asyncio
@patch("backend.services.entity_extractor.AICascade")
@patch("backend.services.entity_extractor.embed_text")
async def test_extract_and_resolve_entities_homonyms_isolation(mock_embed, mock_cascade_cls):
    """Verify homonyms with different types (e.g. Apple company vs Apple fruit) remain isolated."""
    mock_cascade = AsyncMock()
    mock_cascade_cls.return_value = mock_cascade

    # Mock extract: yields Apple as Organization
    mock_cascade.call_llm.side_effect = [
        '{"entities": [{"name": "Apple", "type": "Organization", "description": "Tech giant"}], "relationships": []}'
    ]
    mock_embed.return_value = np.zeros(384).tolist()

    mock_cur = AsyncMock()
    # 1. Exact match lookup for user_id, normalized_name='apple', type='Organization' -> returns None
    # 2. Similarity search for same user and type -> returns empty list
    # 3. New entity insert RETURNING id -> returns 101
    mock_cur.fetchone.side_effect = [
        None,  # exact match check
        (101,) # insert RETURNING id
    ]
    mock_cur.fetchall.side_effect = [
        [] # similarity search candidates
    ]

    mock_conn = MagicMock()
    mock_conn.cursor.return_value = AsyncContextManagerMock(mock_cur)
    mock_conn.commit = AsyncMock()

    await extract_and_resolve_entities(
        item_id=2,
        user_id=10,
        text="Apple released a new chip.",
        db=mock_conn
    )

    # Exact match query must check for type='Organization'
    exact_match_args = mock_cur.execute.call_args_list[1][0]
    assert exact_match_args[1] == (10, "apple", "Organization")

    # Insert must specify Organization
    insert_args = mock_cur.execute.call_args_list[3][0]
    assert "INSERT INTO entities" in insert_args[0]
    assert insert_args[1] == (10, "Apple", "apple", "Organization", "Tech giant", mock_embed.return_value)
