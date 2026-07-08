import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from backend.config import settings
from backend.services.chunker import split_into_sections, semantic_chunk_text, cosine_similarity
from backend.scripts.reindex_chunks import reindex_batch

def test_split_into_sections():
    text = (
        "Intro sentence 1.\n"
        "Intro sentence 2.\n"
        "# Section 1 Heading\n"
        "Section 1 sentence 1.\n"
        "[Page 2]\n"
        "Section 2 sentence 1."
    )
    sections = split_into_sections(text)
    assert len(sections) == 3
    assert sections[0]["title"] == "Intro"
    assert "Intro sentence" in sections[0]["content"]
    assert sections[1]["title"] == "# Section 1 Heading"
    assert "Section 1 sentence" in sections[1]["content"]
    assert sections[2]["title"] == "[Page 2]"
    assert "Section 2 sentence" in sections[2]["content"]

@pytest.mark.asyncio
async def test_semantic_chunk_text_heading_isolation():
    # Large target words to avoid length-based splitting, forcing splits only on headings
    settings_override = {
        "CHUNK_TARGET_WORDS": 500,
        "CHUNK_MIN_WORDS": 200,
        "CHUNK_MAX_WORDS": 1000,
        "CHUNK_OVERLAP_SENTENCES": 1
    }
    with patch.multiple(settings, **settings_override):
        text = (
            "# Heading A\n"
            "This is the first sentence under heading A. "
            "This is the second sentence under heading A.\n"
            "## Heading B\n"
            "This is the first sentence under heading B. "
            "This is the second sentence under heading B."
        )
        chunks = await semantic_chunk_text(text)
        # Should have split strictly at ## Heading B without overlapping or merging across headings
        assert len(chunks) == 2
        assert "heading A" in chunks[0]
        assert "heading B" not in chunks[0]
        assert "heading B" in chunks[1]
        assert "heading A" not in chunks[1]

@pytest.mark.asyncio
async def test_semantic_chunk_text_contrast_split():
    # Override settings to force semantic splitting with contrasting sentences
    settings_override = {
        "CHUNK_MIN_WORDS": 2,
        "CHUNK_MAX_WORDS": 20,
        "SEMANTIC_SPLIT_THRESHOLD": 0.8,
        "CHUNK_OVERLAP_SENTENCES": 0
    }
    
    # Mock embed_text_batch to return contrasting mock vectors for different topics
    async def mock_embed(texts):
        res = []
        for t in texts:
            if "programming" in t or "code" in t:
                # Topic A vector
                res.append([1.0] + [0.0] * 383)
            else:
                # Topic B vector (orthogonal, cosine similarity = 0)
                res.append([0.0, 1.0] + [0.0] * 382)
        return res

    with patch("backend.services.chunker.embed_text_batch", side_effect=mock_embed):
        with patch.multiple(settings, **settings_override):
            text = (
                "Writing programming code requires syntax validation. "
                "Developers run unit programming tests to check system code.\n"
                "Making chocolate chip cookies needs flour and butter. "
                "Bake the mixture at three hundred degrees fahrenheit."
            )
            chunks = await semantic_chunk_text(text)
            # Should have split semantically between programming syntax block and cookie recipe block
            assert len(chunks) == 2
            assert "programming" in chunks[0]
            assert "cookies" in chunks[1]

@pytest.mark.asyncio
async def test_reindex_batch_transactional_swap():
    """
    Test transactional reindexing of chunks for a target item using a mock DB.
    """
    mock_cursor = AsyncMock()
    mock_conn = AsyncMock()
    
    from contextlib import asynccontextmanager
    @asynccontextmanager
    async def mock_cursor_ctx():
        yield mock_cursor
        
    mock_conn.cursor = mock_cursor_ctx
    
    mock_pool = MagicMock()
    
    @asynccontextmanager
    async def mock_conn_ctx():
        yield mock_conn
        
    mock_pool.connection = mock_conn_ctx

    item_id = 9999
    user_id = 8888
    items_to_migrate = [{
        "id": item_id,
        "user_id": user_id,
        "raw_text": "This is raw body content",
        "title": "Migration Test Item",
        "source_url": None
    }]
    
    import backend.db.connection as db_conn
    with patch.object(db_conn, "_pool", new=mock_pool):
        with patch("backend.scripts.reindex_chunks.embed_text", new_callable=AsyncMock, return_value=[0.1]*384):
            success = await reindex_batch(items_to_migrate)
            assert success is True
            
            # Check execute calls
            insert_called = False
            delete_called = False
            for call in mock_cursor.execute.call_args_list:
                sql, params = call[0]
                if "INSERT INTO item_chunks" in sql:
                    insert_called = True
                    assert params[0] == item_id
                    assert params[1] == user_id
                    assert "Migration Test Item" in params[3]
                    assert params[4] == [0.1]*384
                elif "DELETE FROM item_chunks" in sql:
                    delete_called = True
                    assert params == (item_id,)
            assert insert_called is True
            assert delete_called is True
            mock_conn.commit.assert_called_once()


