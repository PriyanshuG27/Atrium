import base64
import hashlib
import hmac
import json
import time
import urllib.parse
from typing import Optional

from fastapi import Depends, HTTPException, Request, Response
from pydantic import BaseModel

from backend.config import settings
from backend.db.connection import get_db
import psycopg

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------
class UserContext(BaseModel):
    id: int
    telegram_chat_id: str


# ---------------------------------------------------------------------------
# Base64url Helpers (Zero-dependency)
# ---------------------------------------------------------------------------
def base64url_decode(s: str) -> bytes:
    """Decode base64url-encoded string with padding correction."""
    padding = '=' * (4 - (len(s) % 4))
    return base64.urlsafe_b64decode(s + padding)


def base64url_encode(data: bytes) -> str:
    """Encode bytes to base64url string without padding."""
    return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


# ---------------------------------------------------------------------------
# JWT Helpers (Zero-dependency HS256)
# ---------------------------------------------------------------------------
def verify_jwt(token: str, secret: str) -> dict:
    """Verify and decode a JWT using standard library HS256 algorithm."""
    parts = token.split('.')
    if len(parts) != 3:
        raise ValueError("Invalid JWT format: must have 3 parts")
    header_segment, payload_segment, signature_segment = parts
    
    # Verify signature
    signing_input = f"{header_segment}.{payload_segment}".encode('utf-8')
    expected_signature_bytes = hmac.new(
        secret.encode('utf-8'), 
        signing_input, 
        hashlib.sha256
    ).digest()
    expected_signature = base64url_encode(expected_signature_bytes)
    
    if not hmac.compare_digest(signature_segment, expected_signature):
        raise ValueError("JWT signature verification failed")
        
    # Decode and parse payload
    try:
        payload_bytes = base64url_decode(payload_segment)
        payload = json.loads(payload_bytes.decode('utf-8'))
    except Exception as e:
        raise ValueError(f"Failed to parse JWT payload: {e}")
        
    # Validate expiry (exp)
    exp = payload.get('exp')
    if exp is not None:
        if time.time() > exp:
            raise ValueError("JWT token expired")
            
    return payload


def generate_jwt(payload: dict, secret: str) -> str:
    """Generate a signed JWT using standard library HS256 algorithm."""
    header = {"alg": "HS256", "typ": "JWT"}
    header_segment = base64url_encode(json.dumps(header).encode('utf-8'))
    payload_segment = base64url_encode(json.dumps(payload).encode('utf-8'))
    signing_input = f"{header_segment}.{payload_segment}".encode('utf-8')
    signature_bytes = hmac.new(
        secret.encode('utf-8'), 
        signing_input, 
        hashlib.sha256
    ).digest()
    signature_segment = base64url_encode(signature_bytes)
    return f"{header_segment}.{payload_segment}.{signature_segment}"


# ---------------------------------------------------------------------------
# TWA Verification Logic
# ---------------------------------------------------------------------------
def verify_twa_init_data(init_data_raw: str, bot_token: str) -> int:
    """
    Validates the Telegram Mini App initData HMAC and returns the user's Telegram ID.
    
    Security requirements:
      - Uses hmac.compare_digest for timing-attack resistance.
      - Never logs initData content (it contains sensitive user data).
      - Replay protection: auth_date must be within 1 hour (3600 seconds).
    """
    # 1. Parse URL-encoded key-value pairs.
    params = dict(urllib.parse.parse_qsl(init_data_raw, keep_blank_values=True))
    
    # 2. Extract and remove 'hash' field.
    if 'hash' not in params:
        raise HTTPException(status_code=401, detail="Missing hash")
    received_hash = params.pop('hash')
    
    # 3. Sort remaining pairs alphabetically.
    sorted_pairs = sorted(params.items())
    
    # 4. Construct data_check_string = "key=value\nkey=value\n..."
    data_check_string = "\n".join(f"{k}={v}" for k, v in sorted_pairs)
    
    # 5. secret_key = HMAC-SHA256(key=b"WebAppData", data=TELEGRAM_BOT_TOKEN.encode())
    secret_key = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    
    # 6. expected_hash = HMAC-SHA256(key=secret_key, data=data_check_string.encode()).hexdigest()
    expected_hash = hmac.new(secret_key, data_check_string.encode(), hashlib.sha256).hexdigest()
    
    # 7. Compare expected_hash and received_hash.
    if not hmac.compare_digest(expected_hash, received_hash):
        raise HTTPException(status_code=401, detail="Invalid hash")
        
    # 8. Validate: auth_date within 3600 seconds (1 hour).
    auth_date_str = params.get('auth_date')
    if not auth_date_str:
        raise HTTPException(status_code=401, detail="Missing auth_date")
    try:
        auth_date = int(auth_date_str)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid auth_date")
        
    now = int(time.time())
    if abs(now - auth_date) > 3600:
        raise HTTPException(status_code=401, detail="Expired auth_date")
        
    # 9. Extract user.id from initData.
    user_json = params.get('user')
    if not user_json:
        raise HTTPException(status_code=401, detail="Missing user field")
    try:
        user_data = json.loads(user_json)
    except json.JSONDecodeError:
        raise HTTPException(status_code=401, detail="Invalid user JSON")
        
    telegram_user_id = user_data.get('id')
    if telegram_user_id is None:
        raise HTTPException(status_code=401, detail="Missing user id")
        
    return telegram_user_id


# ---------------------------------------------------------------------------
# FastAPI Dependencies
# ---------------------------------------------------------------------------
async def get_twa_user(
    request: Request,
    db: psycopg.AsyncConnection = Depends(get_db)
) -> UserContext:
    """FastAPI dependency for verifying Telegram Web App initData in Authorization header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
        
    if not auth_header.startswith("TelegramInitData "):
        raise HTTPException(status_code=401, detail="Invalid Authorization header format")
        
    init_data_raw = auth_header[len("TelegramInitData "):]
    
    # Verify HMAC
    telegram_user_id = verify_twa_init_data(init_data_raw, settings.TELEGRAM_BOT_TOKEN)
    
    # Query database for user
    async with db.cursor() as cur:
        await cur.execute(
            "SELECT id, telegram_chat_id FROM users WHERE telegram_chat_id = %s",
            (str(telegram_user_id),)
        )
        row = await cur.fetchone()
        
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
        
    return UserContext(id=row[0], telegram_chat_id=row[1])


async def get_jwt_user(
    request: Request,
    response: Response,
    db: psycopg.AsyncConnection = Depends(get_db)
) -> UserContext:
    """FastAPI dependency for verifying JWT stored in 'recall_session' or 'jwt' cookie."""
    token = request.cookies.get("recall_session") or request.cookies.get("jwt")
    if not token:
        raise HTTPException(status_code=401, detail="Missing JWT cookie")
        
    try:
        payload = verify_jwt(token, settings.JWT_SECRET)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid JWT: {str(e)}")
        
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid JWT payload: missing sub")
        
    async with db.cursor() as cur:
        await cur.execute(
            "SELECT id, telegram_chat_id FROM users WHERE id = %s",
            (int(user_id),)
        )
        row = await cur.fetchone()
        
    if not row:
        raise HTTPException(status_code=401, detail="User not found")
        
    # Auto-refresh JWT if < 1 day (86400 seconds) remaining
    exp = payload.get("exp")
    if exp is not None:
        now = time.time()
        if exp - now < 86400:
            new_payload = {
                "sub": str(user_id),
                "chat_id": payload.get("chat_id"),
                "exp": int(now) + 7 * 86400
            }
            new_token = generate_jwt(new_payload, settings.JWT_SECRET)
            response.set_cookie(
                "recall_session",
                new_token,
                httponly=True,
                secure=True,
                samesite="lax",
                max_age=7 * 86400
            )
            response.set_cookie(
                "jwt",
                new_token,
                httponly=True,
                secure=True,
                samesite="lax",
                max_age=7 * 86400
            )
            
    return UserContext(id=row[0], telegram_chat_id=row[1])


async def get_current_user(
    request: Request,
    response: Response,
    db: psycopg.AsyncConnection = Depends(get_db)
) -> UserContext:
    """
    Unified auth dependency for /api/* routes.
    
    Tries JWT cookie first; if missing, tries TWA header; if both missing: 401.
    Does not double-authenticate.
    """
    # 1. Try JWT cookie first
    jwt_cookie = request.cookies.get("recall_session") or request.cookies.get("jwt")
    if jwt_cookie is not None:
        return await get_jwt_user(request, response, db)
        
    # 2. If cookie is missing, check TWA header
    auth_header = request.headers.get("Authorization")
    if auth_header is not None and auth_header.startswith("TelegramInitData "):
        return await get_twa_user(request, db)
        
    # 3. If both are missing
    raise HTTPException(status_code=401, detail="Not authenticated")
