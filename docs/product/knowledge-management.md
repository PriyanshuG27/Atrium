---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Knowledge & Retention Management

Atrium includes active learning tools, backup systems, and collaborative features designed to support memory retention.

---

## 1. Spaced Repetition (SuperMemo SM-2)
Atrium generates review questions for saved items. Quizzes are reviewed in the **Drill Room (`/drill`)**.

### The SM-2 Algorithm
When you answer a quiz, you select a confidence rating (mapped to `Again`, `Shaky`, `Locked` in the UI). The backend computes the next review date using:
- **Ease Factor (EF)**: Modified based on user response quality:
  $$EF' = EF + (0.1 - (5 - q) \times (0.08 + (5 - q) \times 0.02))$$
  where $q$ is quality. Min EF is capped at 1.3.
- **Interval (I)**: The spacing gap (in days) is calculated as:
  - $I(1) = 1$
  - $I(2) = 6$
  - $I(n) = I(n-1) \times EF$ (for $n > 2$)

Active review cards are automatically dispatched during offpeak hours via the backend scheduler.

---

## 2. Rituals & Reminders
Located in the **Settings panel (Rituals tab)**:
- Users can create scheduled reminders.
- A background dispatcher polls the `reminders` table, sends pending alerts to Telegram, and marks their status as `sent`.

---

## 3. Hearth Partnerships
Hearth connects two users in a shared study workspace.
- **Invite Codes**: A user generates an invite code (`POST /api/hearth/invite`).
- **Connection**: The partner accepts the code (`POST /api/hearth/accept`).
- **Dashboard**: Partners share study streak badges, unlock milestones collectively, and view daily active hubs.

---

## 4. Obsidian OKF Backups
Atrium supports exporting and importing notes as zipped Open Knowledge Format (OKF) archives.
- **OKF Format**: A standard Markdown file containing a YAML frontmatter header followed by the note body:
  ```markdown
  ---
  title: "Note Title"
  tags: ["ai", "database"]
  saved_date: 2026-07-12 18:00:00
  source_url: "https://example.com"
  category: "text"
  ---
  Note body content goes here.
  ```
- **ZIP Export**: Generates a ZIP file containing OKF markdown files for all saved signals (`GET /api/export/zip`).
- **ZIP Import**: Uploads a ZIP file, parses the Markdown/YAML, generates vector embeddings and text chunks, and inserts them into the database (`POST /api/import/zip`).

---
