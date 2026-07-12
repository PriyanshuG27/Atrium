---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Product Overview

Atrium is an AI-powered personal knowledge management system that bridges the gap between passive ingestion and active retention. It processes scattered web links, audio memos, documents, and screenshots, building a visual 3D constellation map of your mind.

---

## The Knowledge Flow

Atrium operates on a closed-loop ingestion-retrieval-retention pipeline:

```
┌──────────────┐      ┌─────────────────┐      ┌─────────────────┐
│  Capture     ├─────►│   Process &     ├─────►│    Analyze &    │
│  (Ingestion) │      │   Structure     │      │    Connect      │
└──────────────┘      └─────────────────┘      └────────┬────────┘
                                                        │
┌──────────────┐      ┌─────────────────┐               │
│  Retain      │◄─────┤   Retrieve &    │◄──────────────┘
│  (SM-2 Quiz) │      │   Q&A (RAG)     │
└──────────────┘      └─────────────────┘
```

1. **Ingest**: Send voice notes, website URLs, photos, or PDF documents to your Telegram bot. They are quickly acknowledged and pushed to a secure Upstash Redis queue.
2. **Process**: The asynchronous worker transcodes audio, runs OCR extraction, scrapes text, generates semantic categories, and creates 384-dimensional vector embeddings.
3. **Connect**: Thoughts are mathematically mapped to a Three.js 3D Force-Directed Constellation Graph based on vector cosine similarity and Louvain clustering.
4. **Retrieve**: Ask questions via the web-dashboard chat drawer. The search engine executes hybrid RAG, answers your query, and auto-pilots the camera directly to cited nodes.
5. **Retain**: Atrium schedules active recall flashcards using the SuperMemo SM-2 algorithm. Users review cards to reinforce memory retention.

---

## System Workspaces

Atrium organizes your second brain into primary views or "rooms":
- **Archive Room (`/archive`)** `[Stable]`: A 3D Glass Cylinder card viewer showing all captured signals. Use scroll inertia to browse cards chronologically, and click cards to open details.
- **Constellation Map (`/map`)** `[Stable]`: A force-directed 3D spatial node graph representing concepts and their connections, grouped in colored communities.
- **Drill Room (`/drill`)** `[Stable]`: Spaced repetition review card console displaying due flashcards.
- **Hearth Room (`/hearth`)** `[Stable]`: Shared partnership dashboard where you connect with a study partner to view collective metrics.
- **Profile Hub (`/profile`)** `[Stable]`: Metrics dashboards detailing your current activity streak, overall pulse score, unlocked milestones, and mind type trajectory.
- **Branching Workspaces (`/poc/branching`)** `[Experimental]`: Proof-of-concept room showcasing spatial branching layouts.

---
