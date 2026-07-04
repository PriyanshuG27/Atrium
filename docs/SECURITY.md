# Security Architecture & Data Protection Guide — Recall

Security is an integral design requirement of **Recall**. This guide documents threat models, cryptographic mechanisms, authentication safeguards, data protection standards, and operational recovery procedures.

---

## 1. Threat Model & Safeguards

| Threat Vector | Potential Impact | Defense Implementation |
|---|---|---|
| **SQL Injection** | Unauthorized data access / manipulation | 100% Parameterized queries using `asyncpg` (`$1, $2`). Zero string interpolation. |
| **Data Breach at Rest** | Exposure of raw user text / OAuth tokens | Fernet AES-128 encryption prior to DB write (`encryption.py`). |
| **Telegram Authentication Forgery** | Account takeover via spoofed WebApp | HMAC-SHA256 signature verification (`twa_auth.py`) using `hmac.compare_digest()`. |
| **Adversarial Prompt Injection** | LLM jailbreak / system prompt override | `check_prompt_injection()` filtering XML breakouts and override phrases. |
| **Third-Party PII Exposure** | PII leakage to external LLM providers | `mask_pii()` regex engine masking email addresses and phone numbers. |
| **API Denial of Service (DoS)** | Resource exhaustion | Upstash Redis sliding window rate limiter (`rate_limiter.py`). |

---

## 2. Non-Negotiable Workspace Security Rules

1. **Secret Redaction**: `TELEGRAM_BOT_TOKEN`, `FERNET_KEY`, and `JWT_SECRET` must **NEVER** appear in application logs, HTTP response payloads, or client-side frontend code.
2. **Encryption at Rest**: `items.raw_text` and `users.google_refresh_token` MUST be Fernet AES-128 encrypted prior to database insertion. Unencrypted writes are strictly forbidden.
3. **Multi-Tenant Isolation**: Every user data query MUST include `WHERE user_id = <verified_user_id>`. Cross-user data access is strictly blocked.
4. **Timing-Safe Signatures**: All HMAC comparisons MUST use `hmac.compare_digest()`. Using `==` string comparison for secret validation is strictly prohibited.
5. **Restricted Scope**: Google OAuth scope is strictly limited to `https://www.googleapis.com/auth/drive.file`.
6. **Secure Session Cookies**: Session cookies MUST enforce `httpOnly=True`, `Secure=True` (in non-development environments), and `SameSite="Lax"`.


---

## 🔗 Related Documentation

[README](../README.md) · [INDEX](INDEX.md) · [ARCHITECTURE](ARCHITECTURE.md) · [DATABASE](DATABASE.md) · [API](API.md) · [FEATURES](FEATURES.md)  
[DEVELOPMENT](DEVELOPMENT.md) · [DEPLOYMENT](DEPLOYMENT.md) · **SECURITY** · [TESTING](TESTING.md) · [CONTRIBUTING](CONTRIBUTING.md) · [DIAGRAMS](DIAGRAMS.md)
