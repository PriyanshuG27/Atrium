import pytest
import unittest.mock as mock
from backend.services.ai_cascade.executor.engine import ExecutionEngine
from backend.services.ai_cascade.models import ExecutionContext, ExecutionPlan
from backend.services.pii_masker import mask_pii

@pytest.mark.asyncio
async def test_llm_payload_pii_masking_integration():
    # Construct an ExecutionContext with PII in prompts
    context = ExecutionContext(request_id="req-123")
    from backend.services.ai_cascade.models import AITask
    task = AITask(input_data={})
    plan = ExecutionPlan(
        task=task,
        pipeline="summarise",
        prompt_version="v1",
        schema_version="v1",
        providers=["mock-provider"]
    )
    
    system_prompt = "You are a summarizing assistant."
    user_prompt = "My email is test.user@gmail.com and my phone number is +1-123-456-7890. Please summarize this."
    
    mock_provider = mock.MagicMock()
    mock_provider.name = "mock-provider"
    
    mock_registry_model = mock.MagicMock()
    mock_registry_model.model_id = "mock-model"
    mock_registry_model.provider_name = "mock-provider"
    mock_registry_model.is_active = True
    # Model capability map
    from backend.services.ai_cascade.registry.model_registry import ModelCapability
    mock_registry_model.capabilities = [ModelCapability.TEXT_GENERATION]
    
    mock_validator = mock.MagicMock()
    mock_validator.parse_json.return_value = {"summary": "Masked summary", "tags": ["masked"]}
    mock_validator.auto_repair.return_value = {"summary": "Masked summary", "tags": ["masked"]}
    
    executor = ExecutionEngine()
    executor.provider_manager = mock.MagicMock()
    executor.provider_manager.get_provider.return_value = mock_provider
    executor.provider_manager.is_healthy = mock.AsyncMock(return_value=True)
    executor.provider_manager.report_success = mock.AsyncMock()
    executor.provider_manager.report_failure = mock.AsyncMock()
    
    # Mock retry engine execution to see the messages passed
    mock_execute = mock.AsyncMock(return_value='{"summary": "Masked summary", "tags": ["masked"]}')
    executor.retry_engine.execute_with_retry = mock_execute
    
    with mock.patch("backend.services.ai_cascade.config.settings.CascadeSettings.get_provider_config", return_value={"models": {"mock-model": {"status": "active"}}}), \
         mock.patch("backend.services.ai_cascade.registry.model_registry.ModelRegistry._models", {"mock-model": mock_registry_model}), \
         mock.patch("backend.services.ai_cascade.executor.engine.ValidatorRegistry.get_validator", return_value=mock_validator), \
         mock.patch("logging.Logger.info") as mock_log_info:
        
        result = await executor.execute_plan(
            plan=plan,
            context=context,
            system_prompt=system_prompt,
            user_prompt=user_prompt
        )
        
        # Verify call was made to LLM provider with MASKED messages
        mock_execute.assert_called_once()
        called_messages = mock_execute.call_args[1]["messages"]
        
        # Assert user_prompt was masked in the outgoing payload
        user_content = called_messages[1]["content"]
        assert "[EMAIL_MASKED]" in user_content
        assert "[PHONE_MASKED]" in user_content
        assert "test.user@gmail.com" not in user_content
        assert "123-456-7890" not in user_content
        
        # Assert original user_prompt argument was NOT modified in the call parameter reference (by-value check)
        assert "test.user@gmail.com" in user_prompt
        
        # Assert PII_MASK_APPLIED telemetry log was emitted
        any_mask_log = any("event=PII_MASK_APPLIED" in str(args) for args, kwargs in mock_log_info.call_args_list)
        assert any_mask_log


@pytest.mark.asyncio
async def test_pii_masking_db_store_original():
    from backend.main import app
    from backend.db.connection import get_db
    from backend.middleware.twa_auth import generate_jwt
    from backend.config import settings
    from fastapi.testclient import TestClient

    # Mock database connection and cursor
    import psycopg
    mock_db = mock.AsyncMock(spec=psycopg.AsyncConnection)
    mock_cur = mock.AsyncMock()
    mock_db.cursor.return_value.__aenter__.return_value = mock_cur
    
    # Mock current user exists, and insert returns row (item_id, created_at)
    mock_cur.fetchone.side_effect = [
        (42, "123456789"), # get_current_user
        (99, "2026-07-09T00:00:00") # insert return
    ]
    
    # Mock get_db dependency
    async def mock_get_db():
        yield mock_db
        
    app.dependency_overrides[get_db] = mock_get_db
    
    token = generate_jwt({"sub": "42", "chat_id": "123456789", "exp": 9999999999}, settings.JWT_SECRET)
    
    raw_payload_text = "confidential.user@domain.com phone is 555-0199"
    
    # Patch AICascade.summarise to avoid LLM calls
    mock_summarise = mock.AsyncMock(return_value={"summary": "Mock summary", "tags": ["mock"]})
    
    with mock.patch("backend.services.ai_cascade.AICascade.summarise", mock_summarise):
        with mock.patch("backend.services.encryption.encrypt") as mock_encrypt:
            mock_encrypt.return_value = b"encrypted-blob"
            
            with mock.patch("backend.db.connection.open_pool", return_value=None), \
                 mock.patch("backend.db.connection.close_pool", return_value=None):
                with TestClient(app) as client:
                    headers = {"x-request-id": "test-req-pii"}
                    resp = client.post(
                        "/api/items",
                        json={"url": None, "raw_text": raw_payload_text, "title": "PII Test"},
                        cookies={"atrium_session": token},
                        headers=headers
                    )
                    
                    # Assert response
                    assert resp.status_code == 201
                    
                    # Verify original, unmasked text was sent to encryption for DB storage
                    mock_encrypt.assert_called_with(raw_payload_text)
                    
                    # Verify that the unmasked text was encrypted and passed to DB execution
                    insert_call = None
                    for call in mock_cur.execute.call_args_list:
                        query = call[0][0]
                        if "INSERT INTO items" in query:
                            insert_call = call
                            break
                    assert insert_call is not None
                    # Params: (user_id, url, encrypted_raw_text, summary, title, embedding, tags)
                    params = insert_call[0][1]
                    assert params[1] == b"encrypted-blob" # The encrypted unmasked text!
            
    app.dependency_overrides.pop(get_db, None)

