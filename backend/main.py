"""
backend/main.py
===============
FastAPI application entry point for Recall API.

Startup sequence:
  1. validate_crypto_keys() — fast-fail if FERNET_KEY / JWT_SECRET / BOT_TOKEN are invalid.
  2. open_pool()            — open async psycopg3 connection pool.

Shutdown sequence:
  1. close_pool()           — drain and close pool gracefully.

Security:
  - CORS allows ONLY settings.WEBSITE_URL — never wildcard.
  - Global exception handler returns generic 500 — no stack traces to clients.
  - /docs and /redoc are DISABLED in production (ENV=production).
"""

import logging
import re
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# ---------------------------------------------------------------------------
# Logging — structured, nothing sensitive
# ---------------------------------------------------------------------------
class SecretMaskingFilter(logging.Filter):
    """
    Filters all log messages and redacts sensitive information such as
    the Telegram Bot Token, Fernet key, JWT secret, database passwords,
    and other API keys.
    """
    def __init__(self):
        super().__init__()
        self.telegram_pattern = re.compile(r"bot\d+:[A-Za-z0-9_-]+")

    def mask_text(self, text: str) -> str:
        # Mask Telegram bot tokens in URLs (e.g., bot8764400085:AAFo3...)
        text = self.telegram_pattern.sub("bot<REDACTED>", text)
        
        try:
            from backend.config import settings
            if settings:
                secrets = [
                    settings.TELEGRAM_BOT_TOKEN,
                    settings.FERNET_KEY,
                    settings.JWT_SECRET,
                    settings.UPSTASH_REDIS_REST_TOKEN,
                ]
                
                # Extract and mask DB password if present
                db_url = settings.DATABASE_URL
                if db_url:
                    # Match password component in connection string
                    match = re.search(r":([^@:]+)@", db_url)
                    if match:
                        secrets.append(match.group(1))
                
                # Mask other optional API keys/secrets
                for key in ["MODAL_API_TOKEN", "GROQ_API_KEY", "GEMINI_API_KEY", "ZENROWS_KEY", "SCRAPINGBEE_KEY", "SCRAPERAPI_KEY"]:
                    val = getattr(settings, key, None)
                    if val:
                        secrets.append(val)
                
                for secret in secrets:
                    if secret and len(secret) > 4:
                        text = text.replace(secret, "<REDACTED>")
        except Exception:
            pass
            
        return text

    def filter(self, record: logging.LogRecord) -> bool:
        if isinstance(record.msg, str):
            record.msg = self.mask_text(record.msg)
        if record.args:
            new_args = []
            for arg in record.args:
                if isinstance(arg, str):
                    new_args.append(self.mask_text(arg))
                else:
                    new_args.append(arg)
            record.args = tuple(new_args)
        return True

# Initialize standard logging configuration
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)

# Apply secret masking filter to all handlers on the root logger
mask_filter = SecretMaskingFilter()
root_logger = logging.getLogger()
root_logger.addFilter(mask_filter)
for handler in root_logger.handlers:
    handler.addFilter(mask_filter)

# Suppress verbose httpx request logging to prevent token leakage in info logs
logging.getLogger("httpx").setLevel(logging.WARNING)

# Suppress psycopg.pool connection warnings on shutdown/cancellation
logging.getLogger("psycopg.pool").setLevel(logging.ERROR)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Lifespan: startup + shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Runs startup logic before yield, shutdown logic after."""
    # --- STARTUP ---
    from backend.config import settings
    from backend.db.connection import open_pool

    if settings is None:
        raise RuntimeError(
            "CRITICAL: Settings failed to load. "
            "Check that all required environment variables are set."
        )

    # Validate cryptographic keys — raises ValueError on bad format
    settings.validate_crypto_keys()
    logger.info("Recall API started — crypto keys validated.")

    # Open the async DB connection pool
    await open_pool()

    yield  # ← application runs here

    # --- SHUTDOWN ---
    from backend.db.connection import close_pool
    await close_pool()
    logger.info("Recall API shutdown complete.")


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------
def _get_docs_url() -> str | None:
    """Disable Swagger UI in production."""
    try:
        from backend.config import settings
        if settings and settings.ENV == "production":
            return None
    except Exception:
        pass
    return "/docs"


def _get_redoc_url() -> str | None:
    """Disable ReDoc in production."""
    try:
        from backend.config import settings
        if settings and settings.ENV == "production":
            return None
    except Exception:
        pass
    return "/redoc"


app = FastAPI(
    title="Recall API",
    version="0.1.0",
    description=(
        "Recall — AI-powered second brain. "
        "Ingest links, voice notes, PDFs and images via Telegram. "
        "Search, map, and quiz your knowledge via the web dashboard."
    ),
    lifespan=lifespan,
    docs_url=_get_docs_url(),
    redoc_url=_get_redoc_url(),
)


# ---------------------------------------------------------------------------
# CORS — restrict to frontend origin ONLY (never wildcard)
# ---------------------------------------------------------------------------
def _get_allowed_origins() -> list[str]:
    try:
        from backend.config import settings
        if settings and settings.WEBSITE_URL:
            return [settings.WEBSITE_URL]
    except Exception:
        pass
    # Fallback for local dev only — never used in production
    return ["http://localhost:5173"]


app.add_middleware(
    CORSMiddleware,
    allow_origins=_get_allowed_origins(),
    allow_credentials=True,       # Required for httpOnly cookie auth
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


# ---------------------------------------------------------------------------
# Global exception handler — NEVER expose internal details to clients
# ---------------------------------------------------------------------------
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """
    Catch-all for unhandled exceptions.
    Logs the full traceback internally but returns only a generic message
    to the client — no stack traces, no exception types.
    """
    logger.exception(
        "Unhandled exception on %s %s",
        request.method,
        request.url.path,
    )
    return JSONResponse(
        status_code=500,
        content={"error": "internal_server_error"},
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
from backend.routes.webhook import router as webhook_router
from backend.routes.auth import router as auth_router
from backend.routes.api import router as api_router

app.include_router(webhook_router)
app.include_router(auth_router)
app.include_router(api_router)

@app.get(
    "/health",
    tags=["ops"],
    summary="Health check",
    response_description="Service is alive",
)
async def health() -> dict:
    """
    Lightweight liveness probe — no DB queries, no external calls.
    Target response time: < 5 ms.
    Used by Render health checks and Uptime Robot monitoring.
    """
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------------------
# OpenAPI Customisation & Security Definitions
# ---------------------------------------------------------------------------
from fastapi.openapi.utils import get_openapi
from backend.config import settings

def custom_openapi():
    if app.openapi_schema:
        return app.openapi_schema
        
    openapi_schema = get_openapi(
        title="Recall API",
        version="0.1.0",
        description=(
            "Recall — AI-powered second brain. "
            "Ingest links, voice notes, PDFs and images via Telegram. "
            "Search, map, and quiz your knowledge via the web dashboard."
        ),
        routes=app.routes,
    )
    
    # Custom security schemes definitions
    openapi_schema["components"]["securitySchemes"] = {
        "bearerAuth": {
            "type": "apiKey",
            "in": "cookie",
            "name": "recall_session",
            "description": "JWT stored in the httpOnly 'recall_session' cookie.",
        },
        "telegramInitData": {
            "type": "apiKey",
            "in": "header",
            "name": "Authorization",
            "description": "Telegram Web App initData in Authorization header (format: TelegramInitData <init_data>).",
        }
    }
    
    # Associate security schemes dynamically with all /api/* endpoints
    for path, path_item in openapi_schema.get("paths", {}).items():
        if path.startswith("/api/"):
            for method in path_item:
                path_item[method]["security"] = [
                    {"bearerAuth": []},
                    {"telegramInitData": []}
                ]
                
    app.openapi_schema = openapi_schema
    return app.openapi_schema

app.openapi = custom_openapi

# Explicitly disable Swagger UI & ReDoc in production mode
if settings and settings.ENV == "production":
    app.docs_url = None
    app.redoc_url = None
