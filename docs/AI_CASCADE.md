# AI_CASCADE — Recall

| Field | Value |
|-------|-------|
| Version | 0.2.0 |
| Date | 2026-06-24 |
| Status | Active |

---

## Overview

Every AI task follows a multi-tier cascade. Each tier is attempted in order; on failure, the next tier is tried. The final tier (Bookmark) guarantees no data loss.

```
Task received
    |
    v
[Tier 0: Modal GPU] ----FAIL----> [Tier 1: Groq] ----FAIL----> [Tier 2: Gemini]
                                                                      |
                                                                    FAIL
                                                                      v
                                                          [Tier 3: Bookmark]
```

---

## Tier 0 — Modal Serverless GPU (PRIMARY)

| Property | Value |
|----------|-------|
| Models | Whisper large-v3 (STT) + Llama 3.3 70B (summary/quiz) + MiniLM-L6-v2 (embed) |
| Why position 0 | Highest quality; self-hosted; pay-per-second (no monthly cost when idle) |
| Limits | Modal free tier: 30 GPU-hours/month; cold start 2-5 s |
| Failover trigger | HTTP error, timeout > 30 s, or Modal service unavailable |
| Fallback output | Full transcript + summary + 384-dim embedding + quiz |

**Cold start behaviour**: First call after idle may take 2-5 s (up to 10s depending on container spin-up) for GPU container to warm. Keep the Telegram bot's response asynchronous. Immediately reply with "Processing your [content type]..." so the user knows the system is active, while the background queue waits for Modal to warm up. Groq (Tier 1) handles concurrent requests during warmup.

---

## Tier 1 — Groq Cloud API (PRIMARY CLOUD FALLBACK)

| Property | Value |
|----------|-------|
| Models | Whisper large-v3-turbo (STT, fallback to Whisper large-v3) + qwen/qwen3.6-27b (Primary LLM) + openai/gpt-oss-120b (Overflow LLM) |
| Why position 1 | Fastest external inference; free tier; excellent for burst; qwen/qwen3.6-27b offers high-speed and high-fidelity reasoning |
| Limits | Standard API rate limits apply (RPM/TPM caps) |
| Failover trigger | 429 (rate limited), 5xx, or timeout > 20 s |
| Fallback output | Full transcript + summary + (embedding via MiniLM fallback) |

> Groq does not serve embedding models. MiniLM embedding falls back to Modal or is computed locally if Groq is used for STT/summary.
> **Overflow routing**: `qwen/qwen3.6-27b` is the primary for general text tasks and quizzes. `openai/gpt-oss-120b` is selected for long-document/PDF contexts and as an overflow model.
> **STT Fallback**: If `whisper-large-v3-turbo` fails or returns an error on Groq, the ingestion service automatically falls back to `whisper-large-v3` on Groq before attempting Tier 2.

---

## Tier 2 — Gemini 3.1 Flash-Lite (SECONDARY CLOUD FALLBACK)

| Property | Value |
|----------|-------|
| Models | Gemini 3.1 Flash-Lite (multimodal: text, summary, STT via audio upload) |
| Why position 2 | Generous free limits (30 RPM / 1500 RPD / 1M TPM); large context window |
| Limits | 30 RPM hard cap; 1500 requests/day |
| Failover trigger | 429, 5xx, quota exhausted |
| Fallback output | Summary only (no transcript for voice; uses audio-to-text capability) |

---

## Tier 3 — Bookmark Fallback (GUARANTEED)

| Property | Value |
|----------|-------|
| Action | Save item as bookmark with minimal metadata (source_url, title if extractable) |
| Why position 3 | Zero data loss guarantee; always succeeds |
| Limits | None |
| Trigger | All Tiers 0-2 have failed |
| Output | Item inserted with source_type preserved; raw_text=NULL; summary=NULL; embedding=NULL |
| User notification | "Could not process [content type]. Saved as bookmark. We'll retry later." |
| Retry path | Task payload written to dead_letter_queue; admin can re-enqueue |

---

## Cascade Decision Matrix

| Content Type | Tier 0 Task | Tier 1 Task | Tier 2 Task | T3 (Bookmark) |
|-------------|-------------|-------------|-------------|-----|
| Voice/Audio | Whisper STT + Llama 3.3 70B | Groq Whisper-Turbo + qwen/qwen3.6-27b | Gemini STT+summary | Bookmark |
| YouTube URL | yt-dlp + Whisper STT + Llama 3.3 70B | yt-dlp + Groq Whisper-Turbo | yt-dlp + Gemini | Bookmark |
| Plain URL | Scrape + MiniLM embed + Llama 3.3 70B | Scrape + qwen/qwen3.6-27b summary | Scrape + Gemini | Bookmark |
| PDF | PyMuPDF + MiniLM + Llama 3.3 70B | PyMuPDF + openai/gpt-oss-120b | PyMuPDF + Gemini | Bookmark |
| Image | Tesseract + MiniLM + Llama 3.3 70B | Tesseract + qwen/qwen3.6-27b | Tesseract + Gemini | Bookmark |
| Text | MiniLM + Llama 3.3 70B | qwen/qwen3.6-27b | Gemini | Bookmark |

---

## Cascade Timeout Budget

| Tier | Timeout |
|------|---------|
| 0 — Modal | 30 s |
| 1 — Groq | 20 s |
| 2 — Gemini | 20 s |
| Total max | ~70 s (extreme case) |

In practice, Tier 0 or Tier 1 handles >95% of requests.

---

## Override

Set `COMPUTE_PROVIDER` env var to `groq`, `gemini`, or `modal` to pin to a specific tier. For testing and CI only.
