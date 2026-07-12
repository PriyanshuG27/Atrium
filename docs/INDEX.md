---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Atrium Technical Documentation Hub

Welcome to the engineering index for **Atrium**, a personal knowledge OS. Navigate the documentation library using the directory structure below.

---

## 📖 Directory Navigation

### 1. Getting Started
- [⚙️ Installation Guide](getting-started/installation.md) — Local setup steps for backend, frontend, and Docker components.
- [🔧 Configuration Reference](getting-started/configuration.md) — Required and optional environment settings.
- [🤖 First Workspace Connection](getting-started/first-workspace.md) — Telegram bot setup and workspace linking.
- [❓ FAQ](getting-started/faq.md) — Frequently asked questions about system stacks, ingest formats, and limits.

### 2. Product Documentation
- [💡 Overview](product/overview.md) — High-level knowledge flow and overview of Atrium dashboard rooms.
- [📋 Features Matrix](product/features.md) — Status indicators of implemented capture modalities and active/experimental states.
- [💬 Conversational RAG](product/ai-chat.md) — AI assistant chat drawer mechanics, keyboard shortcuts, and failovers.
- [🔍 Search Mechanics](product/search.md) — Hybrid vector and trigram search and RRF score calculation details.
- [🧠 Knowledge Operations](product/knowledge-management.md) — Quizzes, Spaced Repetition (SM-2), Reminders, Hearth workspaces, and OKF backups.
- [🛠️ Troubleshooting](product/troubleshooting.md) — Common error resolution, task queues, and Dead Letter Queue retries.

### 3. Architecture Specifications
- [🚀 Architecture Overview](architecture/overview.md) — Layered layout and message sequence logs.
- [🎨 Frontend Client](architecture/frontend.md) — SPA routing, Three.js/R3F observatory viewports, and WebSockets.
- [🔌 Backend Router](architecture/backend.md) — API router endpoints, main app, and background scheduled tasks.
- [🤖 AI Pipeline](architecture/ai-pipeline.md) — Ingestion processing modules and LLM cascade failover logic.
- [🗄️ Database Design](architecture/database.md) — Neon Postgres table models, indices (HNSW/GIN), triggers, and range partitions.
- [⚡ Caching & Queues](architecture/caching.md) — Redis task queuing, pub/sub connections, and sliding-window rate limiters.
- [🔑 Authentication](architecture/authentication.md) — Telegram widget auth and JWT secure cookies.
- [🛡️ Security & Privacy](architecture/security.md) — Fernet AES-128 encryption, log masking, and Sentry PII filters.
- [📊 Visual Diagrams](architecture/diagrams/README.md) — Visual design, ingestion, and ER Mermaid diagrams.

### 4. Developer Manual
- [🛠️ Development Setup](development/setup.md) — Local testing, seed tools, and Makefile shortcuts.
- [🧪 Testing Strategy](development/testing.md) — Running Pytest/Vitest and mock context rules.
- [🔌 API Endpoints](development/api.md) — Mapped paths and endpoints.
- [☁️ Deployment Target](development/deployment.md) — Hosting guidelines for Vercel and Koyeb.
- [📏 Coding Standards](development/coding-standards.md) — DB query parameterized constraints and Windows loop policies.
- [🤝 Contributing Checklist](development/contributing.md) — Pull Request guidelines.

### 5. Historical Archive
- [🗄️ Obsolete Archives](archive/) — Obsolete roadmaps, superseded ADRs, completed tasks, and old notes.

---
