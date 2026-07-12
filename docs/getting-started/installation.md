---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Setup & Installation

This guide details the steps to set up and run the Atrium application locally. Atrium consists of a FastAPI backend and a React (Vite) frontend.

---

## Prerequisites

Ensure you have the following installed on your local machine:
- **Python**: Version 3.11 or higher.
- **Node.js**: Version 18.0 or higher, with `npm`.
- **Database**: PostgreSQL (with the `pgvector` and `pg_trgm` extensions enabled) or a Neon serverless instance.
- **Queue/Cache**: An Upstash Redis instance (REST API compatible).

---

## 1. Backend Setup

The backend handles ingestion, task scheduling, vector embeddings, and API routers.

### Step 1.1: Clone the Repository
```bash
git clone https://github.com/PriyanshuG27/Recall.git Atrium
cd Atrium/backend
```

### Step 1.2: Initialize Virtual Environment
Create and activate a virtual environment to manage dependencies:
```bash
# On macOS/Linux
python -m venv .venv
source .venv/bin/activate

# On Windows (PowerShell)
python -m venv .venv
.venv\Scripts\Activate.ps1
```

### Step 1.3: Install Dependencies
```bash
pip install -r requirements.txt
```

### Step 1.4: Configure Environment Variables
Copy the template configuration file to a local configuration:
```bash
cp .env.example .env.local
```
Edit `.env.local` with your database URLs, Redis keys, bot tokens, and AI credentials. (See the [Configuration Guide](configuration.md) for variable details).

### Step 1.5: Initialize Database Schema
Run the database migration command to initialize tables, range partitions, and pgvector indexes:
```bash
# Using the Makefile target
make schema

# Or manually running python
python -c "import asyncio; from backend.db.connection import init_schema; asyncio.run(init_schema())"
```

### Step 1.6: Launch FastAPI Server
```bash
# Using the Makefile target
make dev-backend

# Or manually running uvicorn
uvicorn main:app --reload --port 8000
```
The API documentation will be available at `http://localhost:8000/docs` (if `ENV=development`).

---

## 2. Frontend Setup

The frontend is a single-page application built on React 18, Vite 6, and Three.js.

### Step 2.1: Install Node Dependencies
Open a separate terminal window and navigate to the frontend directory:
```bash
cd Atrium/frontend
npm install
```

### Step 2.2: Configure Environment Variables
If required, create a `.env.local` file inside the `frontend` folder:
```
VITE_API_URL=http://localhost:8000
```

### Step 2.3: Launch Frontend Dev Server
```bash
# Using the Makefile target
make dev-frontend

# Or manually running vite
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 3. Running Background Services Locally

### Docker AI Service (Optional)
If you want to run the ONNX embeddings, rerank, and sentence splitting processes locally rather than calling cloud providers, you can spin up the standalone AI service:
```bash
# Build the service
docker build -f Dockerfile.aiservice -t atrium-ai-service .

# Run the container
docker run -p 7860:7860 atrium-ai-service
```
Update your `.env.local` configuration to route local requests:
```env
EMBEDDING_PROVIDER=local
RERANKER_PROVIDER=local
REMOTE_AI_URL=http://localhost:7860
```

---
