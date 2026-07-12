---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Contributing Guidelines

Thank you for contributing to Atrium! This document outlines coding standards, tests, and pull request workflows.

---

## 1. Development Principles
- **Keep it Simple**: Write clean, self-documenting code.
- **Maintain Coverage**: Every new feature, endpoint, or utility must be covered by at least one unit test under `backend/tests/` (backend) or `frontend/src/tests/` (frontend).
- **No Mock Outages**: Tests must run without making external API calls. Ensure all AI service wrappers, Google API clients, and Redis parameters are properly mocked.

---

## 2. Pull Request Checklist
Before opening a Pull Request (PR) to merge changes, verify that your branch satisfies the following checklist:

1. **Branding Check**: Verify all public-facing titles, badges, and documentation pages reference **Atrium** or **Atrium AI** instead of the old project name.
2. **Coding Standards**:
   - Ensure all database queries utilize parameterized statements.
   - Verify that all queries touching user items, reminders, or quizzes filter on the verified `user_id`.
   - On Windows, ensure any database script executes with `SelectorEventLoopPolicy`.
3. **Tests Run**: Make sure the backend test suite completes with no errors.
4. **Markdown Links**: Check all markdown page links inside the `docs/` folder to ensure there are no broken links.
5. **No Hallucinations**: Verify you have only documented features and capabilities that are fully coded and functional in the codebase.

---

## Evidence & Inspected Files
This document was generated from:
- `.agents\AGENTS.md`
  - Codebase conventions and test requirements.
- `Makefile`
  - Testing shortcodes and build tools.
- `backend\tests\`
  - Directory of all pytest tests verifying coverage metrics.
