import re
from typing import Any, Union, Dict, List

EMAIL_REGEX = re.compile(r'\b[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+\b')
SSN_REGEX = re.compile(r'\b\d{3}-\d{2}-\d{4}\b')

# Matches standard US and international formatting (e.g. +1-123-456-7890, (123) 456-7890, 123.456.7890)
# Minimum 10 digits total to prevent matching years or short version numbers.
PHONE_REGEX = re.compile(r'\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b')

# Key-value assignment matcher for passwords/secrets/keys
CREDENTIAL_REGEX = re.compile(
    r'(?i)\b(password|secret|api[-_]?key|token|bearer|refresh[-_]?token)\s*([:=])\s*(?:"([^"]*)"|\x27([^\x27]*)\x27|([a-zA-Z0-9_.-]+))'
)


def mask_pii(text: str) -> str:
    """
    Masks emails, SSNs, phone numbers, and credentials inside the text string.
    Ensures safe formatting to avoid false-positives on years or product names (e.g. GPT-4).
    """
    if not text or not isinstance(text, str):
        return text

    # Mask Emails
    text = EMAIL_REGEX.sub("[EMAIL_MASKED]", text)

    # Mask SSNs
    text = SSN_REGEX.sub("[SSN_MASKED]", text)

    # Mask Phones
    text = PHONE_REGEX.sub("[PHONE_MASKED]", text)

    # Mask Credentials (key-value patterns)
    def replace_cred(match):
        key = match.group(1)
        separator = match.group(2)
        val = match.group(3) or match.group(4) or match.group(5)
        if val:
            # Mask the value part, keeping the key and separator
            # Check if the matched value is actually a system tag/model name
            if val.lower() in ("true", "false", "null", "none"):
                return match.group(0)
            return f"{key}{separator}'[CREDENTIAL_MASKED]'"
        return match.group(0)

    text = CREDENTIAL_REGEX.sub(replace_cred, text)

    return text


def mask_payload(payload: Union[str, Dict[str, Any], List[Any]]) -> Union[str, Dict[str, Any], List[Any]]:
    """
    Recursively traverse and mask PII in a payload dict/list or string.
    """
    if isinstance(payload, str):
        return mask_pii(payload)
    elif isinstance(payload, dict):
        return {k: mask_payload(v) for k, v in payload.items()}
    elif isinstance(payload, list):
        return [mask_payload(item) for item in payload]
    return payload
