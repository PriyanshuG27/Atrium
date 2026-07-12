---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Configuration Reference

Atrium loads configuration dynamically from environment variables, validating credentials at startup. This guide details required and optional settings.

---

## 1. Required Variables
These variables must be set. The backend will throw a validation error and fail to boot if any are missing:

| Variable | Description | Format / Context |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Bot API token obtained from @BotFather. | Token string matching bot format |
| `DATABASE_URL` | PostgreSQL connection string. | Valid database connection URL |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis connection endpoint. | REST client HTTP connection URL |
| `UPSTASH_REDIS_REST_TOKEN` | Authentication token for Upstash Redis. | Base64 token |
| `FERNET_KEY` | 32-byte key after base64 decoding. Used for encrypting raw texts and credentials. | Base64 encoded string |
| `JWT_SECRET` | Secret key used to sign session tokens. | Hex-encoded string (min 32 characters) |
| `WEBSITE_URL` | Main client URL. CORS middleware restricts access to this URL. | Client URL address |

---

## 2. Optional AI Provider Configuration
Atrium uses a multi-provider AI pipeline. Set API keys for the providers you enable:

| Variable | Description | Default |
|---|---|---|
| `GROQ_API_KEY` | Key for Groq. Used for Whisper audio transcription and Llama inference. | `None` |
| `GEMINI_API_KEY` | Key for Google Gemini. Used for OCR fallbacks, classification, and summarization. | `None` |
| `OPENROUTER_API_KEY` | Key for OpenRouter. Used for secondary failovers in the cascade. | `None` |
| `NVIDIA_API_KEY` | Key for NVIDIA NIM. Used as the primary OCR engine. | `None` |
| `CEREBRAS_API_KEY` | Key for Cerebras. | `None` |
| `COMPUTE_PROVIDER` | AI provider category override. | `None` |
| `HF_TOKEN` | Hugging Face token. Used if preloading/downloading models locally. | `None` |

---

## 3. Storage, Ingestion, and Search Tuning
Tweak these variables to customize chunk limits, similarity search weightings, and model locations:

| Variable | Description | Default |
|---|---|---|
| `ENV` | Environment stage: `development`, `production`, or `test`. | `development` |
| `RUN_WORKER_INLINE` | If true, worker runs in the same thread. | `True` |
| `USE_NEW_CASCADE` | Enables the three-tier cascade validation executor. | `True` |
| `EMBEDDING_PROVIDER` | Mapped to `"local"` (ONNX) or `"remote"` (VM api). | `"local"` |
| `OCR_PROVIDER` | OCR engine to trigger: `"local"`, `"remote"`, `"nvidia"`, or `"gemini"`. | `"nvidia"` |
| `REMOTE_AI_URL` | Target URL for local remote-AI helper service. | `http://127.0.0.1:8001` |
| `ENABLE_RERANKING` | Enable reranking of search queries. | `True` |
| `RERANKER_PROVIDER` | Reranker: `"local"` (ONNX Xenova model) or `"remote"`. | `"local"` |
| `RERANK_TOP_N` | Number of documents returned after rerank. | `5` |
| `RRF_VECTOR_WEIGHT` | Reciprocal Rank Fusion vector score multiplier. | `1.0` |
| `RRF_TEXT_WEIGHT` | Reciprocal Rank Fusion text score multiplier. | `1.0` |

---

## 4. Key Generator Utilities
You can generate valid keys directly using the CLI tool shortcuts provided in the `Makefile`:

### Generating a Cryptographically Secure Fernet Key
```bash
make fernet
# Outputs: A 32-byte URL-safe base64 string
```

### Generating a Secure JWT Secret Hex
```bash
make jwt-secret
# Outputs: A 64-character hex-encoded string
```

---
