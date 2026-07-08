import pytest
from backend.services.pii_masker import mask_pii, mask_payload

def test_mask_emails():
    text = "Contact me at john.doe123+test@gmail.com for details."
    masked = mask_pii(text)
    assert "[EMAIL_MASKED]" in masked
    assert "john.doe123" not in masked

def test_mask_ssns():
    text = "My SSN is 123-45-6789."
    masked = mask_pii(text)
    assert "[SSN_MASKED]" in masked
    assert "123-45" not in masked

def test_mask_phones():
    text = "Call +1 (123) 456-7890 or 123.456.7890."
    masked = mask_pii(text)
    assert "[PHONE_MASKED]" in masked
    
    # Verify it does not mask dates or model names
    assert mask_pii("Year 2026 or version 1.0.4") == "Year 2026 or version 1.0.4"
    assert mask_pii("Model GPT-4 or python version 3.10.12") == "Model GPT-4 or python version 3.10.12"

def test_mask_credentials():
    text1 = "password=secretpassword"
    text2 = "api_key: \"my_secret_api_key_123\""
    text3 = "token = 'tokenval'"
    
    assert "[CREDENTIAL_MASKED]" in mask_pii(text1)
    assert "[CREDENTIAL_MASKED]" in mask_pii(text2)
    assert "[CREDENTIAL_MASKED]" in mask_pii(text3)
    
    # Check that boolean settings are not masked
    assert mask_pii("digest_enabled = true") == "digest_enabled = true"

def test_mask_payload_recursive():
    payload = {
        "text": "Call me at 123-456-7890",
        "nested": {
            "email": "test@domain.com",
            "number": 42
        },
        "list": [
            "password: '123'",
            "no_pii"
        ]
    }
    masked = mask_payload(payload)
    
    assert masked["text"] == "Call me at [PHONE_MASKED]"
    assert masked["nested"]["email"] == "[EMAIL_MASKED]"
    assert masked["nested"]["number"] == 42
    assert "[CREDENTIAL_MASKED]" in masked["list"][0]
    assert masked["list"][1] == "no_pii"
