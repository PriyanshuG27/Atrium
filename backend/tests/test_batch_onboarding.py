import pytest
import json
import hashlib
from unittest.mock import patch, MagicMock, AsyncMock
from backend.worker import process_task

@pytest.fixture
def mock_db_connection():
    conn = MagicMock()
    cursor_mock = AsyncMock()
    conn.cursor.return_value.__aenter__.return_value = cursor_mock
    conn.execute = AsyncMock()
    conn.commit = AsyncMock()
    return conn, cursor_mock

@pytest.mark.asyncio
async def test_process_onboarding_task_normal(mock_db_connection):
    """Test process_onboarding_task saves normal user input and advances onboarding step."""
    with patch("backend.worker.upsert_user", new_callable=AsyncMock) as mock_upsert, \
         patch("backend.worker.send_telegram_message", new_callable=AsyncMock) as mock_send, \
         patch("backend.worker.AICascade") as mock_cascade_cls, \
         patch("backend.worker.embed_text", new_callable=AsyncMock) as mock_embed, \
         patch("backend.worker._pool") as mock_pool, \
         patch("backend.routes.webhook.advance_onboarding_step", new_callable=AsyncMock) as mock_advance:
         
        mock_upsert.return_value = 1
        conn, cursor = mock_db_connection
        mock_pool.connection.return_value.__aenter__.return_value = conn
        
        # Mock AICascade response
        mock_cascade = MagicMock()
        mock_cascade.summarise = AsyncMock(return_value={"summary": "An interest in Python", "tags": ["code", "python"]})
        mock_cascade_cls.return_value = mock_cascade
        
        mock_embed.return_value = [0.1] * 384
        cursor.fetchone.return_value = (42,) # item_id
        
        task_payload = {
            "chat_id": "12345",
            "content_type": "text",
            "text": "I really enjoy building backend APIs with Python and FastAPI.",
            "is_onboarding": True,
            "onboarding_step": 1
        }
        
        await process_task(task_payload)
        
        # Verify onboarding flow executed
        mock_cascade.summarise.assert_called_once_with("I really enjoy building backend APIs with Python and FastAPI.", "12345", task="onboarding")
        mock_send.assert_called_once_with("12345", "Saved: I really enjoy building backend APIs with Python and FastAPI. ✓", reply_to_message_id=None)
        mock_advance.assert_called_once()


@pytest.mark.asyncio
async def test_process_onboarding_task_spam(mock_db_connection):
    """Test process_onboarding_task handles spam input by prompting retry / skip button."""
    with patch("backend.worker.upsert_user", new_callable=AsyncMock) as mock_upsert, \
         patch("backend.worker.AICascade") as mock_cascade_cls, \
         patch("backend.worker._pool") as mock_pool, \
         patch("httpx.AsyncClient") as mock_client_cls:
         
        mock_upsert.return_value = 1
        conn, cursor = mock_db_connection
        mock_pool.connection.return_value.__aenter__.return_value = conn
        
        # Mock AICascade response as invalid onboarding input
        mock_cascade = MagicMock()
        mock_cascade.summarise = AsyncMock(return_value="INVALID_ONBOARDING_INPUT")
        mock_cascade_cls.return_value = mock_cascade
        
        # Mock httpx AsyncClient post
        mock_client = AsyncMock()
        mock_client.post = AsyncMock()
        mock_client_cls.return_value.__aenter__.return_value = mock_client
        
        task_payload = {
            "chat_id": "12345",
            "content_type": "text",
            "text": "asdfasdfasdfasdfasdf",
            "is_onboarding": True,
            "onboarding_step": 1
        }
        
        await process_task(task_payload)
        
        # Verify skip button payload sent to Telegram API
        mock_client.post.assert_called_once()
        args, kwargs = mock_client.post.call_args
        payload = kwargs["json"]
        assert "Skip Question" in payload["reply_markup"]["inline_keyboard"][0][0]["text"]


@pytest.mark.asyncio
async def test_process_batch_task_combining(mock_db_connection):
    """Test process_batch_task groups similar saves, saves joint item, and chunks content."""
    with patch("backend.worker.upsert_user", new_callable=AsyncMock) as mock_upsert, \
         patch("backend.worker.send_telegram_message", new_callable=AsyncMock) as mock_send, \
         patch("backend.worker.AICascade") as mock_cascade_cls, \
         patch("backend.worker.embed_text", new_callable=AsyncMock) as mock_embed, \
         patch("backend.worker._pool") as mock_pool, \
         patch("backend.routes.websocket.broadcast", new_callable=AsyncMock) as mock_broadcast:
         
        mock_upsert.return_value = 1
        conn, cursor = mock_db_connection
        mock_pool.connection.return_value.__aenter__.return_value = conn
        
        # Mock AICascade joint summaries
        mock_cascade = MagicMock()
        mock_cascade.generate_joint_summary_and_title = AsyncMock(return_value={
            "title": "Combined Python APIs",
            "summary": "Joint summary of python API projects"
        })
        # Single item summarisation mocking
        mock_cascade.summarise = AsyncMock(return_value={"summary": "Single summary", "tags": ["python"]})
        mock_cascade_cls.return_value = mock_cascade
        
        # Mock embedding return
        mock_embed.return_value = [0.2] * 384
        
        # Simulate database select returns for 2 saved items
        # row: id, title, summary, tags, embedding::text, source_type, source_url, raw_text
        cursor.fetchall.side_effect = [
            # First fetchall inside process_batch_task to retrieve saved details
            [
                (101, "Python API 1", "Summary 1", ["python"], "[0.2,0.2]", "text", None, "Python API content 1"),
                (102, "Python API 2", "Summary 2", ["python", "dev"], "[0.2,0.2]", "text", None, "Python API content 2")
            ],
            # fetchall in broadcast block (empty or mocked)
            []
        ]
        
        # fetchone for insertion returns parent_id
        def smart_fetchone():
            import datetime
            if not cursor.execute.call_args:
                return None
            last_query = cursor.execute.call_args[0][0].upper()
            if "INSERT INTO ITEMS" in last_query:
                return (500,)
            elif "STREAK_COUNT" in last_query:
                return (1, datetime.date.today())
            elif "SELECT ID, TITLE, SOURCE_TYPE" in last_query:
                return (500, "Combined Python APIs", "combined", datetime.datetime.now())
            elif "SELECT CONTEXT_PROMPT" in last_query:
                return ("Saved! Since these are related, what is the main link between them that you want to remember?",)
            return None
        cursor.fetchone.side_effect = smart_fetchone
        
        task_payload = {
            "chat_id": "12345",
            "is_batch": True,
            "items": [
                {"update_id": "b1", "content_type": "text", "text": "Python API content 1"},
                {"update_id": "b2", "content_type": "text", "text": "Python API content 2"}
            ]
        }
        
        # We also mock the single item processing to just return the IDs
        with patch("backend.worker.process_single_item", new_callable=AsyncMock) as mock_single:
            mock_single.side_effect = [101, 102]
            
            await process_task(task_payload)
            
            # Verify combined item is saved
            mock_cascade.generate_joint_summary_and_title.assert_called_once()
            # Original items should be deleted
            # Chunks should be saved
            assert cursor.execute.call_count >= 3
            # Combined telegram notification should be sent
            mock_send.assert_any_call("12345", "Saved! Since these are related, what is the main link between them that you want to remember?")
