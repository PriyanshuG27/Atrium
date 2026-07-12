---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Deployment Manual

This guide describes how to deploy Atrium's backend (FastAPI) and frontend (React SPA).

---

## 1. Backend Deployment

Atrium's backend is a Python service running uvicorn.

- **Build Target**: Exposes port 8000.
- **Start Command**:
  ```bash
  uvicorn backend.main:app --host 0.0.0.0 --port 8000
  ```
- **Dependencies**: Requires a Neon PostgreSQL instance and an Upstash Redis rest endpoint.

### Koyeb Configurations
The environment variables for Koyeb are defined in `koyeb.env`. Ensure your Koyeb dashboard is configured with all required keys (see the [Configuration Reference](../getting-started/configuration.md)).

---

## 2. Frontend Deployment

The React frontend compiles into static assets using Vite:

- **Build Script**: `npm run build`
- **Output Directory**: `dist/` (contains index.html, JS bundles, and static assets).
- **Target Hosting**: Vercel configuration (`vercel.json`) redirects all requests to `index.html` to support client-side routing popstate snapshots:
  ```json
  {
    "rewrites": [
      {
        "source": "/(.*)",
        "destination": "/index.html"
      }
    ]
  }
  ```

---

## 3. Webhook Registration in Production
Once both backend and frontend are running:
1. Ensure your backend configuration environment contains:
   ```env
   WEBSITE_URL=https://your-frontend-deployment.vercel.app
   TELEGRAM_WEBHOOK_SECRET=your_secure_secret_token
   ```
2. The backend startup lifecycle automatically registers your Telegram Webhook URL pointing to `https://your-backend-deployment/webhook` on boot.

---

## Evidence & Inspected Files
This document was generated from:
- `backend\main.py`
  - Lifespan webhook registration hooks.
- `frontend\package.json`
  - Vite static build packaging controls.
- `frontend\vercel.json`
  - Vercel URL rewrite configurations.
- `koyeb.env`
  - Koyeb deployment variable mappings.
- `vercel.env`
  - Vercel configuration mappings.
