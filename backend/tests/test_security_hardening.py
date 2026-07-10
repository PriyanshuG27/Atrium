import pytest
import sys
import time
import hashlib
from unittest import mock
import structlog

from backend.config import settings
from backend.services.ai_cascade.facade import ai_cascade
from backend.services.ai_cascade.events.event_bus import event_bus, LLMRequestFinished
from backend.services.ai_cascade.security.filter import mask_pii
from backend.services.logging_config import structlog_secret_masker

def test_mask_pii_advanced():
    # Email masking
    assert "[EMAIL_MASKED]" in mask_pii("my email is contact@example.com")
    # Phone number masking
    assert "[PHONE_MASKED]" in mask_pii("phone: +1-555-555-0199")
    # API key masking
    assert "[CREDENTIAL_MASKED]" in mask_pii("api_key = \"sk-live-abcdef123456\"")
    # JWT / Bearer token masking (requires : or = as per regex definition)
    assert "[CREDENTIAL_MASKED]" in mask_pii("token = 'Bearer myjwttokenvalue'")
    # Credentials inside URLs
    assert "[CREDENTIAL_MASKED]" in mask_pii("postgres://localhost?password=mysecret")

def test_structlog_secret_redaction(mock_env):
    # Verify that secrets dynamically loaded from settings are masked
    event = {
        "event": "Starting application",
        "secret_token": settings.TELEGRAM_BOT_TOKEN,
        "nested": {
            "key": settings.JWT_SECRET,
            "list": [settings.FERNET_KEY, "safe_value"]
        }
    }
    
    masked_event = structlog_secret_masker(None, "info", event)
    
    assert masked_event["secret_token"] == "[REDACTED]"
    assert masked_event["nested"]["key"] == "[REDACTED]"
    assert masked_event["nested"]["list"][0] == "[REDACTED]"
    assert masked_event["nested"]["list"][1] == "safe_value"
    
    # Exception check: verify exception context strings redact secrets
    event_with_exc = {
        "event": "Database connection failed",
        "exception": f"ConnectionRefusedError: failed with password {settings.FERNET_KEY}"
    }
    masked_exc = structlog_secret_masker(None, "error", event_with_exc)
    assert "[REDACTED]" in masked_exc["exception"]
    assert settings.FERNET_KEY not in masked_exc["exception"]

@pytest.mark.asyncio
async def test_embedding_cache_key_hashing(monkeypatch):
    from backend.services.search_service import embed_text
    from backend.services.redis_client import redis
    
    # Bypass settings.ENV == "test" check to execute Redis cache paths
    monkeypatch.setattr(settings, "ENV", "production")
    
    # Mock redis get and setex
    redis_store = {}
    
    async def mock_get(key):
        return redis_store.get(key)
        
    async def mock_setex(key, ttl, value):
        redis_store[key] = value
        
    monkeypatch.setattr(redis, "get", mock_get)
    monkeypatch.setattr(redis, "setex", mock_setex)
    
    # Mock embedding generation
    monkeypatch.setattr(
        "backend.services.search_service._generate_embedding_uncached",
        mock.AsyncMock(return_value=[0.1] * 384)
    )
    
    query = "test user search query about machine learning"
    hashed = hashlib.sha256(query.encode("utf-8")).hexdigest()
    expected_key = f"embed:v1:{hashed}"
    
    # 1. First lookup (MISS)
    embedding = await embed_text(query)
    assert len(embedding) == 384
    assert expected_key in redis_store
    
    # 2. Second lookup (HIT)
    embedding_2 = await embed_text(query)
    assert embedding_2 == embedding

@pytest.mark.asyncio
async def test_event_bus_telemetry_fallback_regression(monkeypatch):
    # 1. Listen to the event bus
    events = []
    
    class MockHandler:
        async def handle(self, event):
            events.append(event)
            
    handler = MockHandler()
    
    # Ensure event bus is initialized for publishing
    was_initialized = event_bus._is_initialized
    if not was_initialized:
        event_bus._is_initialized = True
        
    event_bus.subscribe(LLMRequestFinished, handler)
    
    try:
        # Mock settings
        monkeypatch.setattr(settings, "USE_NEW_CASCADE", False)
        monkeypatch.setattr(settings, "COMPUTE_PROVIDER", "groq")
        monkeypatch.setattr(settings, "GROQ_API_KEY", "mock-groq-key")
        
        # Mock _call_groq_llm
        mock_response = "Onboarding summary completed successfully."
        monkeypatch.setattr(
            ai_cascade,
            "_call_groq_llm",
            mock.AsyncMock(return_value=mock_response)
        )
        
        # Trigger fallback onboarding cascade
        res = await ai_cascade._run_onboarding_cascade("my private email is user@example.com")
        
        # Assertions
        assert res == mock_response
        
        # Assert exactly one event published
        assert len(events) == 1
        event = events[0]
        assert isinstance(event, LLMRequestFinished)
        
        # Assert payload details match expected schema exactly
        assert event.provider == "groq"
        assert event.model == "groq-onboarding"
        assert event.success is True
        assert event.pipeline == "onboarding"
        assert event.prompt_version == "fallback"
        assert event.prompt_tokens > 0
        assert event.completion_tokens > 0
        assert event.latency_ms > 0
        
    finally:
        # Clean up subscription and restore initialization status
        event_bus.unsubscribe(LLMRequestFinished, handler)
        if not was_initialized:
            event_bus._is_initialized = False
