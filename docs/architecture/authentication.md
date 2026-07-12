---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Authentication System

Atrium integrates web dashboard client security with Telegram OAuth widget verification and secure cookie management.

---

## 1. Authentication Modalities

### A. Telegram Web App (TWA) Header Auth
When Atrium is running as a Web App directly inside Telegram:
- **Authorization Header**: The client sends the TWA `initData` query string in the request headers:
  - Format: `TelegramInitData <init_data_raw>`
- **HMAC Signature Check**: The backend extracts the verification `hash` from the data. It computes the SHA-256 HMAC of the sorted key-value pairs using the bot token as the secret:
  - **Secret**: `HMAC-SHA256(key="WebAppData", msg=TELEGRAM_BOT_TOKEN)`
  - **Hash**: `HMAC-SHA256(key=secret, msg=sorted_init_data)`
  - **Verification**: The computed hash is compared with the payload hash using `hmac.compare_digest()` to prevent timing attacks.

### B. Telegram Login Widget
When accessing via external web browsers:
- **Login Widget**: The user authenticates using the Telegram widget widget on the login screen.
- **Signature Check**: The widget returns parameter data (ID, first name, hash, auth date) which is verified by the backend using the same HMAC SHA-256 bot token signature process.

---

## 2. Session Cookies & JWT
Once the Telegram signature is verified:
- **JWT payload**: The backend signs a JWT payload containing the verified user ID and Telegram chat ID.
- **Cookies**: The JWT is set in the client's browser cookies:
  - **Key**: `atrium_session`
  - **Parameters**: `httpOnly=True`, `secure=True` (in production), `samesite="Lax"`, and a set expiration timestamp.
  - Using `httpOnly` cookies prevents Cross-Site Scripting (XSS) token access.

---

## Evidence & Inspected Files
This document was generated from:
- `backend\routes\auth.py`
  - HMAC checks on login widget inputs and `atrium_session` cookie setting.
- `backend\middleware\twa_auth.py`
  - Parsing and checking raw `initData` keys using HMAC SHA-256.
- `frontend\src\api\client.js`
  - Axios headers interceptors setting headers for request authentications.
- `frontend\src\context\AuthContext.jsx`
  - Context wrapper checking auth states and sessions.
