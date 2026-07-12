---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Conversational RAG & Chat

Atrium includes an interactive AI Chat drawer that allows you to converse with your second brain, referencing the exact items in your knowledge graph.

---

## 1. Chat Drawer UI
The Chat Drawer is accessible on the dashboard by clicking the chat icon or using the keyboard shortcut:
- **Shortcut**: `Ctrl + Shift + A` (or `Cmd + Shift + A` on macOS)

### Citation Flight Control
When you ask a question, the response generates inline citations styled as clickable badges: e.g., `[1]`, `[2]`.
- Clicking a citation badge (`[1]`) triggers a smooth 3D camera auto-flight in the Force-Directed Map, piloting the camera directly to the cited node.

---

## 2. The AI Failover Cascade
To ensure reliability even during provider outages, the chat engine operates a structured, three-tier failover cascade:

```
┌────────────────────────┐
│  Tier 1: Groq API      ├─────► Success (Return Answer)
│                        │
└───────────┬────────────┘
            │ (On Timeout / Exception)
            ▼
┌────────────────────────┐
│  Tier 2: Gemini API    ├─────► Success (Return Answer)
│                        │
└───────────┬────────────┘
            │ (On Timeout / Exception)
            ▼
┌────────────────────────┐
│  Tier 3: OpenRouter    ├─────► Success (Return Answer)
│                        │
└───────────┬────────────┘
            │ (On Total Outage)
            ▼
┌────────────────────────┐
│  Bookmark Fallback     │
│  (Save to DLQ)         │
└────────────────────────┘
```

1. **Tier 1 (Groq API)**: Default engine targeting Groq for fast summary and entity extraction.
2. **Tier 2 (Gemini API)**: Falls back to Gemini if Groq fails or times out.
3. **Tier 3 (OpenRouter API)**: Falls back to secondary models via OpenRouter.
4. **DLQ Recovery**: If all providers fail, the system logs the incident in the `dead_letter_queue` table and falls back to a clean bookmark save to prevent user data loss.

---

## 3. Dynamic Context Prompts (Moods)
During ingestion, the bot doesn't just save your notes; it engages you. The worker selects from multiple psychological mood angles to generate a custom context prompt question designed to deepen retention.

### Ignore Pause Guard
To prevent notification fatigue, the system monitors user response history:
- If a user ignores (does not reply to) the bot's context prompt multiple times sequentially, the bot pauses prompting for the next few saves.

---
