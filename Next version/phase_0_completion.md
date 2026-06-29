# Phase 0 Completion Report: Insight Quality Validation

This document summarizes the accomplishments of **Phase 0 (Insight Quality Validation)** and outlines the immediate integration steps for **Phase 1 (Foundation)**.

---

## 1. What We Accomplished

### Prompt Engineering & Iterations
*   **The Hallucination Problem**: Our initial run showed that the fallback model (Gemini 2.5 Flash) was "too creative" and forced abstract, metaphorical connections on unrelated items (e.g., linking a *Sourdough Recipe* and *Kubernetes Scheduling* as "complex living systems").
*   **The Fix**: We hardened the prompt by adding a strict **Anti-Forcing Rule** (prohibiting high-level abstract connections) and a **Stretched-Metaphor Negative Example** (explicitly instructing the model to return `NO_GENUINE_TENSION` for a *Dune Movie Review* and a *Rust Borrow Checker Guide*).
*   **100% Pass Rate**: The updated prompt successfully passed **all 20 test cases (20/20)** on both the Primary Model (Qwen/Llama) and the Fallback Model (Gemini Flash), achieving a perfect 100% score.

### Test Artifacts Created
All evaluation scripts and datasets are stored in the conversation's scratch directory for future regression testing:
1.  **[eval_dataset.json](file:///C:/Users/pri27/.gemini/antigravity/brain/aba9287c-477a-49c7-91b6-f42adb83d874/scratch/eval_dataset.json)**: The 20 fabricated pairs across 4 test categories (True Tensions, Surface Overlaps, Completely Unrelated, and Psychological Traps).
2.  **[run_eval.py](file:///C:/Users/pri27/.gemini/antigravity/brain/aba9287c-477a-49c7-91b6-f42adb83d874/scratch/run_eval.py)**: The batch evaluation runner script, updated to execute with a 7.5-second delay (targeting 8 requests per minute) to protect your API limits.
3.  **[run_single_eval.py](file:///C:/Users/pri27/.gemini/antigravity/brain/aba9287c-477a-49c7-91b6-f42adb83d874/scratch/run_single_eval.py)**: An interactive single-pair script allowing you to test individual pairs from the command line.
4.  **[clean_eval_results.json](file:///C:/Users/pri27/.gemini/antigravity/brain/aba9287c-477a-49c7-91b6-f42adb83d874/scratch/clean_eval_results.json)**: The final, cleaned output log containing the responses from both models for all 20 pairs.

---

## 2. What We Need to Do Next (Phase 1 Integration)

We are ready to transition to **Phase 1 (Foundation)**. Here is our implementation plan:

### 2.1 AI Cascade Integration
*   Add the validated `INSIGHT_SYSTEM_PROMPT` and `GEMINI_INSIGHT_CONSTRAINT` to [ai_cascade.py](file:///d:/Recall/backend/services/ai_cascade.py).
*   Implement `generate_insight` inside the `AICascade` class to handle prompt construction and provider failover.

### 2.2 Database Migration
*   Create a migration script to add the nullable `context_note` column to the parent `items` table, allowing PostgreSQL to propagate it to all monthly partitions.

### 2.3 Webhook & Ingestion Layer
*   **Redis Debounce**: Modify the webhook handler in [webhook.py](file:///d:/Recall/backend/routes/webhook.py) to queue burst messages in a Redis list and process them together after a 4-second delay.
*   **Conversational Seeding**: Build the optional, text-based onboarding questions for new users to seed their first 3 nodes.
*   **Context Note Capture**: Match the user's immediate reply after a steady-state save to populate the `context_note` field.

---

## 3. The Validated Prompts

Below are the actual prompts developed and verified during this phase:

### 3.1 Primary System Prompt
```
You are analyzing two items a person saved to their personal knowledge graph, weeks apart. Your only job is to state the SPECIFIC TENSION OR RECURRING QUESTION connecting them — not a summary of either item.

RULES (violating any of these is a failed output):
1. Name both items by their literal subject, not a category.
   WRONG: "You've saved content about systems and disasters."
   RIGHT: "You saved a chapter on aviation checklists, then weeks later, Chernobyl."
2. State a QUESTION or TENSION the person seems to be circling — never a trait or interest label.
   WRONG: "You're interested in systems thinking."
   RIGHT: "What happens when a system has no checks left to fail."
3. If a context_note exists, treat it as the strongest signal of intent and weave it in directly — it is the person's own words about why this mattered to them.
4. Maximum 3 sentences. No hedging language ("it seems", "perhaps", "you might be"). State it as an observation, not a guess.
5. Do NOT force an insight or use highly abstract, metaphorical, or poetic connections (such as "both are about control", "both are complex systems", or "both deal with chemical manipulation"). If the items do not share a direct, logical, real-world conceptual tension, or if they only share a surface category (e.g., both are recipes, both are tech articles), output exactly: NO_GENUINE_TENSION. A forced connection breaks user trust. Be extremely conservative.
6. Never include a diagnostic or psychological label for the person (no "anxiety", "avoidance", "control issues", clinical terms of any kind). Describe the pattern in what was saved, never the person's psychology.

FEW-SHOT EXAMPLES:

Input: item_a="Kobe Bryant's 4am practice routine", item_b="Feynman technique for learning", 63 days apart
Output: "Kobe's obsession with fundamentals, then weeks later, Feynman's method for proving you actually understand something. Both are about the gap between looking competent and being competent."

Input: item_a="Dune: Part Two Movie Review", item_b="Rust Borrow Checker Guide", 49 days apart
Output: NO_GENUINE_TENSION

Input: item_a="10 best laptop bags 2026", item_b="best noise-cancelling headphones", 4 days apart
Output: NO_GENUINE_TENSION
```

### 3.2 Gemini Fallback Formatting Constraint
```
Output ONLY the final insight sentence(s) or NO_GENUINE_TENSION.
Do not include any preamble, explanation of your reasoning, or meta-commentary about the task. The first character of your response must be the first character of the insight itself.
```
