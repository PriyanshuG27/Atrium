"""
backend/services/logging_config.py
==================================
Setup configuration for structlog (structured JSON or pretty console logging).
Routes standard library logging logs into structlog pipelines.
"""

import logging
import logging.config
import sys
import structlog
from backend.config import settings

# Identify sensitive values dynamically from settings to avoid hardcoding secrets
_SENSITIVE_PATTERNS = ("SECRET", "TOKEN", "PASSWORD", "PRIVATE_KEY", "FERNET", "API_KEY")
_SENSITIVE_VALUES = set()

def _initialize_secrets():
    global _SENSITIVE_VALUES
    if not _SENSITIVE_VALUES:
        for attr in dir(settings):
            if any(p in attr.upper() for p in _SENSITIVE_PATTERNS):
                val = getattr(settings, attr, None)
                if isinstance(val, str) and len(val) > 4:
                    _SENSITIVE_VALUES.add(val)

def _redact_value(val):
    if isinstance(val, str):
        # Mask JWT tokens in WebSocket path logs
        if "/api/ws/" in val:
            import re
            val = re.sub(r"/api/ws/[^\s\"']+", "/api/ws/[REDACTED_TOKEN]", val)
        for secret in _SENSITIVE_VALUES:
            if secret in val:
                val = val.replace(secret, "[REDACTED]")
        return val
    elif isinstance(val, dict):
        return {_redact_value(k): _redact_value(v) for k, v in val.items()}
    elif isinstance(val, list):
        return [_redact_value(item) for item in val]
    elif isinstance(val, tuple):
        return tuple(_redact_value(item) for item in val)
    return val

def structlog_secret_masker(logger, method_name, event_dict):
    _initialize_secrets()
    for k, v in list(event_dict.items()):
        event_dict[k] = _redact_value(v)
    return event_dict

def configure_logging() -> None:
    """Configures structured logging for the application."""
    
    # Processors pipeline
    processors = [
        structlog_secret_masker,
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso", utc=True),
    ]

    if settings.LOG_JSON:
        # JSON renderer for production environments
        processors.append(structlog.processors.format_exc_info)
        processors.append(structlog.processors.JSONRenderer())
    else:
        # Colorized renderer for development/testing
        processors.append(structlog.dev.ConsoleRenderer(colors=True))

    structlog.configure(
        processors=processors,
        logger_factory=structlog.PrintLoggerFactory(),
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        cache_logger_on_first_use=True,
    )

    # Route standard logging output through structlog
    handler = logging.StreamHandler(sys.stdout)
    if settings.LOG_JSON:
        handler.setFormatter(structlog.stdlib.ProcessorFormatter(
            processor=structlog.processors.JSONRenderer()
        ))
    else:
        handler.setFormatter(structlog.stdlib.ProcessorFormatter(
            processor=structlog.dev.ConsoleRenderer(colors=True)
        ))

    root_logger = logging.getLogger()
    # Remove existing handlers to avoid duplicates
    for h in root_logger.handlers[:]:
        root_logger.removeHandler(h)
    root_logger.addHandler(handler)
    root_logger.setLevel(logging.INFO)
    
    # Mute noisy libraries
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("httpx").setLevel(logging.WARNING)

    # 12. Register UvicornTokenFilter to sanitize JWT tokens from all loggers (access, errors, root)
    import re
    class UvicornTokenFilter(logging.Filter):
        def filter(self, record: logging.LogRecord) -> bool:
            if record.args and isinstance(record.args, (tuple, list)) and len(record.args) >= 3:
                # record.args[2] is usually the full HTTP path in uvicorn access logs
                path = record.args[2]
                if isinstance(path, str) and "/api/ws/" in path:
                    args_list = list(record.args)
                    args_list[2] = re.sub(r"/api/ws/[^\s\"']+", "/api/ws/[REDACTED_TOKEN]", path)
                    record.args = tuple(args_list)
            if isinstance(record.msg, str) and "/api/ws/" in record.msg:
                record.msg = re.sub(r"/api/ws/[^\s\"']+", "/api/ws/[REDACTED_TOKEN]", record.msg)
            return True

    token_filter = UvicornTokenFilter()
    for uvicorn_logger_name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        ul = logging.getLogger(uvicorn_logger_name)
        ul.addFilter(token_filter)
