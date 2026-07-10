# Recall Exhaustive Production Deployment Manual

This document provides a highly granular, step-by-step deployment guide for **Recall** in a production environment using a **Split Architecture (Profile G)**. 

---

## 📈 The Chronological Order of Operations (Start Here)

Deploying a multi-platform app often presents a "chicken-and-egg" problem: the backend needs to know the frontend URL for CORS, the frontend needs to know the backend URL for API calls, and both need Google credentials which require both URLs. 

To prevent validation crashes and circular configuration errors, you **must** follow this exact chronological sequence:

```
[1. Neon & Upstash] ──> [2. Telegram Bot] ──> [3. Azure Student VM] 
                                                        │
[6. Koyeb Backend] <── [5. Google Cloud] <── [4. Vercel Frontend (1st Pass)]
       │
       └──> [7. Vercel Frontend (Redeploy)] ──> [8. Set Telegram Webhook]
```

### 📋 Sequential Deployment Timeline

#### 1️⃣ Step 1: Managed Cloud Storage (Neon & Upstash)
*   **Why first?**: Koyeb's FastAPI code runs Pydantic verification at startup. If `DATABASE_URL` or `UPSTASH_REDIS_REST_URL` are missing or empty, the Koyeb build/deployment will fail to start.
*   **Action**: Provision Neon PostgreSQL (pooled connection) and Upstash Redis. Record connection variables.

#### 2️⃣ Step 2: Telegram Bot Registry (@BotFather)
*   **Why second?**: The bot token is required in the Koyeb backend settings, and the bot username is compiled into the Vite frontend build.
*   **Action**: Register your bot with `@BotFather` and retrieve the API token and bot username.

#### 3️⃣ Step 3: Azure Student VM (AI Service & Cobalt)
*   **Why third?**: The Koyeb backend needs your Azure VM IP address for `REMOTE_AI_URL` and `COBALT_API_URL`. Deploying this first ensures you have a live IP address ready.
*   **Action**: Spin up the VM, allocate swap, install Docker/Python, run the microservices, and copy the VM's public IP.

#### 4️⃣ Step 4: Vercel Frontend SPA (First Pass)
*   **Why fourth?**: You need Vercel to generate a public domain (e.g., `https://recall.vercel.app`) *before* you can authorize it in the Google Cloud Console or set the backend `WEBSITE_URL` parameter.
*   **Action**: Import the project into Vercel, select the `frontend` root, and deploy with dummy values for `VITE_API_URL` to secure your domain address.

#### 5️⃣ Step 5: Google Cloud Console Credentials
*   **Why fifth?**: Google OAuth requires you to lock down the Authorized Javascript Origins (Vercel frontend domain) and Redirect URIs (Koyeb backend callback domain) before it issues your Client ID and Client Secret.
*   **Action**: Enable Google Drive API, configure the consent screen, add your redirect URLs (using the Vercel domain from Step 4 and Koyeb domain from Step 6), and grab the Client ID/Secret keys.

#### 6️⃣ Step 6: Koyeb Backend (FastAPI Server)
*   **Why sixth?**: Now that you have every single database, bot, VM, Vercel, and Google credential, you can input the full set of environment variables on Koyeb and deploy the backend.
*   **Action**: Create the Koyeb app, input all 20+ variables, and trigger the build. Note your final live API endpoint (e.g. `https://recall-api.koyeb.app`).

#### 7️⃣ Step 7: Vercel Frontend SPA (Second Pass / Redeploy)
*   **Why seventh?**: Now that your Koyeb backend is live and you have the URL, you must update the frontend's API reference so it knows where to send requests.
*   **Action**: Go to Vercel Settings -> Environment Variables, change `VITE_API_URL` to point to `https://recall-api.koyeb.app`, and click **Redeploy**.

#### 8️⃣ Step 8: Webhook Linkage & Verification
*   **Why last?**: The Telegram API needs your live Koyeb URL to establish the webhook pathway.
*   **Action**: Curl the `/setWebhook` endpoint and perform end-to-end user tests.

---

## 🗺️ System Topology & Data Flow

```mermaid
flowchart TD
    subgraph Public_Internet ["Public Internet"]
        User["User Browser"]
        TG_API["Telegram Gateway"]
    end

    subgraph Vercel_Host ["Vercel (Frontend SPA)"]
        FE["React + Vite UI\n(Port 443 / HTTPS)"]
    end

    subgraph Koyeb_Host ["Koyeb (Core App & Scheduler)"]
        BE["FastAPI Core\n(In-process Queue Worker)"]
    end

    subgraph Azure_VM ["Azure Student VM (1 GB RAM)"]
        AI_SVC["Unified AI Service\n(FastEmbed, Reranker, spaCy)\n(Port 8001)"]
        COBALT["Cobalt Scraper Container\n(Port 9000)"]
        WARP["Cloudflare WARP Client\n(SOCKS5 Proxy on Port 1080)"]
    end

    subgraph Cloud_API_Tiers ["Serverless API Tiers"]
        NeonDB[(Neon Serverless DB)]
        UpstashCache[(Upstash Redis REST)]
        NIM_OCR[NVIDIA NIM OCR]
        Gemini[Google Gemini API]
        Groq[Groq API]
    end

    User -->|HTTPS| FE
    FE -->|API Requests| BE
    TG_API -->|Webhooks| BE
    
    BE -->|Query execution| NeonDB
    BE -->|Task coordination| UpstashCache
    BE -->|NVIDIA NIM OCR requests| NIM_OCR
    BE -->|Multimodal fallback / Summary| Gemini
    BE -->|Whisper Transcription| Groq
    
    BE -->|Semantic Embeddings / Rerank / spaCy| AI_SVC
    BE -->|Video scraping| COBALT
    COBALT -->|Scraper traffic| WARP
    WARP -->|Clean proxy connection| Public_Internet
```

---

## 🔑 Phase 1: Acquiring Connection Strings and Keys

### Step 1: Set Up Neon PostgreSQL
- [ ] **Step 1.1**: Open your web browser and go to [Neon Console](https://neon.tech).
- [ ] **Step 1.2**: Log in using your email or GitHub account.
- [ ] **Step 1.3**: Click the **Create Project** button in the dashboard.
- [ ] **Step 1.4**: Name your project `recall-prod`.
- [ ] **Step 1.5**: Set the database version to PostgreSQL 16 (default).
- [ ] **Step 1.6**: Under **Region**, select the region closest to where you plan to host the Koyeb backend (e.g. AWS N. Virginia `us-east-1` or Frankfurt `eu-central-1`) to minimize database query latency.
- [ ] **Step 1.7**: Click **Create Project**.
- [ ] **Step 1.8**: When the "Connection Details" dialog appears, look for the select dropdown under **Connection String**.
- [ ] **Step 1.9**: Change the selection from **Direct** to **Pooled** (this targets PgBouncer on port 5432, which is required to prevent connection exhaustion in serverless environments).
- [ ] **Step 1.10**: Copy the connection string. It will look like this:
  `postgresql://recall_owner:abc123xyz@ep-flat-water-123456-pooler.us-east-2.aws.neon.tech/neondb`
- [ ] **Step 1.11**: Append `?sslmode=require` to the end of your copied connection string.
- [ ] **Step 1.12**: Save this connection string as your `DATABASE_URL`.

### Step 2: Set Up Upstash Redis
- [ ] **Step 2.1**: Go to [console.upstash.com](https://console.upstash.com) in your browser.
- [ ] **Step 2.2**: Log in.
- [ ] **Step 2.3**: Under the Redis tab, click **Create Database**.
- [ ] **Step 2.4**: Set the name to `recall-redis-prod`.
- [ ] **Step 2.5**: Set the region to match your Neon database/Koyeb server.
- [ ] **Step 2.6**: Leave other settings as default and click **Create**.
- [ ] **Step 2.7**: Scroll down to the **REST API** section of your new database.
- [ ] **Step 2.8**: Click the copy button next to the Endpoint URL. Save this as your `UPSTASH_REDIS_REST_URL`.
- [ ] **Step 2.9**: Click the copy button next to the Password Token. Save this as your `UPSTASH_REDIS_REST_TOKEN`.

### Step 3: Create your Telegram Bot
- [ ] **Step 3.1**: Open your Telegram App.
- [ ] **Step 3.2**: Search for the official verified bot `@BotFather`.
- [ ] **Step 3.3**: Send the command `/newbot`.
- [ ] **Step 3.4**: When prompted, enter a friendly name for your bot (e.g. `Recall Ledger`).
- [ ] **Step 3.5**: Enter a username ending in `bot` or `_bot` (e.g. `RecallLedgerProdBot`).
- [ ] **Step 3.6**: Copy the HTTP API token printed in the success message (looks like `1234567890:ABCdefGHIjklmnoPQRstuvwxyZ123456789`). Save this as your `TELEGRAM_BOT_TOKEN`.
- [ ] **Step 3.7**: Save the username without the `@` symbol (e.g. `RecallLedgerProdBot`). Save this as your `VITE_BOT_USERNAME`.

### Step 4: Generate Cryptographic Keys
- [ ] **Step 4.1**: Open a terminal window on your local machine (PowerShell on Windows, Terminal on macOS/Linux).
- [ ] **Step 4.2**: Verify Python is installed by running `python --version`.
- [ ] **Step 4.3**: Run the following command to generate a Fernet symmetric key:
  ```bash
  python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
  ```
- [ ] **Step 4.4**: Copy the generated string. Save this as your `FERNET_KEY`.
- [ ] **Step 4.5**: Run the following command to generate a JWT signing secret:
  ```bash
  python -c "import secrets; print(secrets.token_hex(32))"
  ```
- [ ] **Step 4.6**: Copy the generated hex string. Save this as your `JWT_SECRET`.

### Step 5: Configure Google Drive API & OAuth credentials
- [ ] **Step 5.1**: Go to [console.cloud.google.com](https://console.cloud.google.com).
- [ ] **Step 5.2**: Click **Select a Project** -> **New Project** in the top bar.
- [ ] **Step 5.3**: Name your project `Recall` and click **Create**.
- [ ] **Step 5.4**: Navigate to **APIs & Services > Library** via the sidebar.
- [ ] **Step 5.5**: Search for `Google Drive API`, click on it, and click **Enable**.
- [ ] **Step 5.6**: Go to **APIs & Services > OAuth consent screen** in the sidebar.
- [ ] **Step 5.7**: Under User Type select **External**, then click **Create**.
- [ ] **Step 5.8**: Complete the required fields:
  *   App Name: `Recall`
  *   User Support Email: (your email)
  *   Developer Contact Email: (your email)
  *   Click **Save and Continue**.
- [ ] **Step 5.9**: Under **Scopes**, click **Add or Remove Scopes**:
  *   In the text filter, paste `https://www.googleapis.com/auth/drive.file`.
  *   Check the box next to it, click **Add to table**, and click **Update**.
  *   Click **Save and Continue**.
- [ ] **Step 5.10**: Under **Test Users**, click **Add Users**:
  *   Type in the Gmail address you will use to log in and authorize the app.
  *   Click **Add** -> **Save and Continue**.
- [ ] **Step 5.11**: Navigate to **APIs & Services > Credentials** in the sidebar.
- [ ] **Step 5.12**: Click **Create Credentials** -> **OAuth Client ID**.
- [ ] **Step 5.13**: Set Application Type to **Web application**.
- [ ] **Step 5.14**: Under **Authorized JavaScript Origins**, click **Add URI**:
  *   Add `http://localhost:5173` (for local development).
  *   Add `https://recall.vercel.app` (or your Vercel deployment URL).
- [ ] **Step 5.15**: Under **Authorized Redirect URIs**, click **Add URI**:
  *   Add `http://localhost:8000/auth/google/callback` (for local development).
  *   Add `https://recall-api.koyeb.app/auth/google/callback` (or your Koyeb backend URL).
- [ ] **Step 5.16**: Click **Create**.
- [ ] **Step 5.17**: Copy the **Client ID** (this is `GOOGLE_CLIENT_ID`) and the **Client Secret** (this is `GOOGLE_CLIENT_SECRET`).

### Step 6: Acquire AI Inference Keys
- [ ] **Step 6.1 (Groq)**: Go to [console.groq.com](https://console.groq.com), click **API Keys** -> **Create API Key**, name it `recall-prod`, and copy the key. Save this as `GROQ_API_KEY`.
- [ ] **Step 6.2 (Gemini)**: Go to [aistudio.google.com](https://aistudio.google.com), click **Get API Key** -> **Create API Key** (either inside a new or existing GCP project), and copy it. Save this as `GEMINI_API_KEY`.
- [ ] **Step 6.3 (NVIDIA)**: Go to [build.nvidia.com](https://build.nvidia.com), choose a model (e.g. OCR), click **Get API Key**, and copy it. Save this as `NVIDIA_API_KEY`.

---

## ☁️ Phase 2: Provisioning & Configuring the Azure Student VM

### Step 7: Create the Ubuntu Virtual Machine
- [ ] **Step 7.1**: Log in to [portal.azure.com](https://portal.azure.com).
- [ ] **Step 7.2**: Search for "Virtual machines" and click **Create > Azure virtual machine**.
- [ ] **Step 7.3**: Resource group: Click **Create new** and name it `recall-rg`.
- [ ] **Step 7.4**: Virtual machine name: `recall-ai-host`.
- [ ] **Step 7.5**: Region: Select your closest region (e.g. `East US` or `West Europe`).
- [ ] **Step 7.6**: Security type: Set to `Standard`.
- [ ] **Step 7.7**: Image: Select `Ubuntu Server 22.04 LTS - x64 Gen2`.
- [ ] **Step 7.8**: Size: Select `Standard_B1ms` (2 GB RAM, 1 vCPU - Recommended) or `Standard_B1s` (1 GB RAM, 1 vCPU).
- [ ] **Step 7.9**: Authentication type: Select `SSH public key`.
  *   Username: `ubuntu`
  *   Key pair name: `recall-key`
- [ ] **Step 7.10**: Inbound port rules: Select **Allow selected ports**, and check **SSH (22)**.
- [ ] **Step 7.11**: Click **Review + create**, then click **Create**.
- [ ] **Step 7.12**: When prompted, click **Download private key and create resource**. Save the `.pem` file to your computer.
- [ ] **Step 7.13**: Once deployment finishes, go to the resource page and copy the **Public IP Address**.

### Step 8: Configure Swap Space
- [ ] **Step 8.1**: Secure your SSH key file.
  *   On Linux/macOS: Run `chmod 400 /path/to/recall-key.pem`.
  *   On Windows (PowerShell): Navigate to your key folder and restrict file access so only your user has read rights.
- [ ] **Step 8.2**: Connect to the VM via SSH:
  ```bash
  ssh -i /path/to/recall-key.pem ubuntu@<your-vm-ip>
  ```
- [ ] **Step 8.3**: Allocate a 2 GB swap file to prevent memory starvation crashes:
  ```bash
  sudo fallocate -l 2G /swapfile
  ```
- [ ] **Step 8.4**: Set proper system permissions:
  ```bash
  sudo chmod 600 /swapfile
  ```
- [ ] **Step 8.5**: Set up the file as Linux Swap space:
  ```bash
  sudo mkswap /swapfile
  ```
- [ ] **Step 8.6**: Activate the swap file immediately:
  ```bash
  sudo swapon /swapfile
  ```
- [ ] **Step 8.7**: Append the swap persistence flag to `/etc/fstab` to ensure it starts automatically on reboot:
  ```bash
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
  ```

### Step 9: Install Docker & Python Dependencies
- [ ] **Step 9.1**: Update the OS package registry:
  ```bash
  sudo apt update && sudo apt upgrade -y
  ```
- [ ] **Step 9.2**: Install Git, Python build tools, virtual env packages, and Docker:
  ```bash
  sudo apt install -y docker.io python3-pip python3-venv git
  ```
- [ ] **Step 9.3**: Start Docker and configure it to run on startup:
  ```bash
  sudo systemctl start docker
  sudo systemctl enable docker
  ```
- [ ] **Step 9.4**: Add the `ubuntu` user to the docker group so you don't need `sudo` for docker commands:
  ```bash
  sudo usermod -aG docker ubuntu
  ```
- [ ] **Step 9.5**: Log out of the SSH session (`exit`) and connect again to apply docker group changes.

### Step 10: Run the AI Service under Systemd
- [ ] **Step 10.1**: Clone your repository to `/home/ubuntu/recall`:
  ```bash
  git clone <your-repo-url> /home/ubuntu/recall
  cd /home/ubuntu/recall
  ```
- [ ] **Step 10.2**: Create a Python virtual environment:
  ```bash
  python3 -m venv .venv
  ```
- [ ] **Step 10.3**: Activate the environment:
  ```bash
  source .venv/bin/activate
  ```
- [ ] **Step 10.4**: Install project backend dependencies:
  ```bash
  pip install --upgrade pip
  pip install -r backend/requirements.txt
  ```
- [ ] **Step 10.5**: Install additional OCR and image dependencies on the VM (required for the remote PaddleOCR engine to run successfully on `/ocr` calls):
  ```bash
  pip install paddleocr opencv-python-headless
  ```
- [ ] **Step 10.6**: Create a Systemd service config file:
  ```bash
  sudo nano /etc/systemd/system/recall-ai.service
  ```
- [ ] **Step 10.7**: Paste the following block (replace `<your_shared_internal_admin_token>` with a secure shared password of your choice):
  ```ini
  [Unit]
  Description=Recall Unified AI Service
  After=network.target

  [Service]
  User=ubuntu
  WorkingDirectory=/home/ubuntu/recall
  ExecStart=/home/ubuntu/recall/.venv/bin/uvicorn scripts.ai_service:app --host 0.0.0.0 --port 8001
  Restart=always
  Environment=ENV=production
  Environment=INTERNAL_API_KEY=<your_shared_internal_admin_token>

  [Install]
  WantedBy=multi-user.target
  ```
  *(Press `Ctrl+O` then `Enter` to save, and `Ctrl+X` to exit)*.
  
  > [!NOTE]
  > Double-check the `ExecStart` uvicorn module targeting: it runs `scripts.ai_service:app` which exposes the FastAPI app endpoints on port `8001` (not the client module `remote_ai_client`).

- [ ] **Step 10.8**: Reload the Systemd daemon to register the new service:
  ```bash
  sudo systemctl daemon-reload
  ```
- [ ] **Step 10.9**: Start the AI Service:
  ```bash
  sudo systemctl start recall-ai
  ```
- [ ] **Step 10.10**: Enable the service to start automatically on system boot:
  ```bash
  sudo systemctl enable recall-ai
  ```
- [ ] **Step 10.11**: Monitor logs to ensure the server starts up without any model dependency loading issues:
  ```bash
  journalctl -u recall-ai -f -n 100
  ```

### Step 11: Setup Cobalt Media Downloader & Cloudflare WARP Proxy
- [ ] **Step 11.1**: Create a dedicated directory on the VM:
  ```bash
  mkdir -p /home/ubuntu/cobalt-stack
  cd /home/ubuntu/cobalt-stack
  ```
- [ ] **Step 11.2**: Create a `docker-compose.yml` file:
  ```bash
  nano docker-compose.yml
  ```
- [ ] **Step 11.3**: Paste the following configuration (replace `<your-azure-ip>` with your VM's public IP address):
  ```yaml
  version: '3.8'

  services:
    warp:
      image: caa1ecoo/cloudflare-warp:latest
      container_name: warp
      restart: always
      ports:
        - "1080:1080"
        
    cobalt:
      image: ghcr.io/imputnet/cobalt:latest
      container_name: cobalt
      restart: always
      ports:
        - "9000:9000"
      depends_on:
        - warp
      environment:
        - API_URL=http://<your-azure-ip>:9000
        - API_LISTEN_ADDRESS=0.0.0.0
        - HTTP_PROXY=socks5://warp:1080
        - HTTPS_PROXY=socks5://warp:1080
  ```
  *(Press `Ctrl+O` then `Enter` to save, and `Ctrl+X` to exit)*.
- [ ] **Step 11.4**: Start the Docker Compose stack:
  ```bash
  docker compose up -d
  ```

### Step 12: Configure Azure Firewall (Inbound Rules)
- [ ] **Step 12.1**: Go to the virtual machine page on the [Azure Portal](https://portal.azure.com).
- [ ] **Step 12.2**: Click on **Networking** (or **Network Security Group**) under settings in the left menu.
- [ ] **Step 12.3**: Click the **Add inbound port rule** button.
- [ ] **Step 12.4**: Complete the rule form:
  *   Source: `IP Addresses`
  *   Source IP addresses: (Set to the outbound IP address block of your Koyeb server, or leave as `*` temporarily if checking connectivity, but make sure to lock it down before production).
  *   Destination port ranges: `8001,9000`
  *   Protocol: `TCP`
  *   Action: `Allow`
  *   Priority: `110`
  *   Name: `Allow_Koyeb_AI_and_Cobalt`
- [ ] **Step 12.5**: Click **Add**.

---

## ⚙️ Phase 3: Deploying the Koyeb Backend

### Step 13: Create the Koyeb Application
- [ ] **Step 13.1**: Log in to your [Koyeb Console](https://koyeb.com).
- [ ] **Step 13.2**: Click **Create App** in the dashboard.
- [ ] **Step 13.3**: Select your GitHub repository containing the Recall codebase.
- [ ] **Step 13.4**: Set the deployment Branch to `main`.

### Step 14: Configure Build & Run Commands
- [ ] **Step 14.1**: Under the Builder options, select **Buildpack** (it will auto-detect Python).
- [ ] **Step 14.2**: Under **Instance Size**, select the **Free** instance (512 MB RAM, 0.1 vCPU).
- [ ] **Step 14.3**: Under Run Command, select override and enter:
  ```bash
  python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
  ```

### Step 15: Input Environment Variables
- [ ] **Step 15.1**: Locate the **Environment Variables** section on the creation screen.
- [ ] **Step 15.2**: Add the following keys (ensure you set the type to **Secret** for all sensitive tokens):

| Variable Key | Value to enter | Secret Option |
| :--- | :--- | :---: |
| `ENV` | `production` | Plaintext |
| `DATABASE_URL` | Your Neon pooled connection string from Step 1 | **Secret** |
| `UPSTASH_REDIS_REST_URL` | Your Upstash REST URL from Step 2 | Plaintext |
| `UPSTASH_REDIS_REST_TOKEN` | Your Upstash REST token from Step 2 | **Secret** |
| `FERNET_KEY` | Generated base64 key from Step 4 | **Secret** |
| `JWT_SECRET` | Generated hex signing secret from Step 4 | **Secret** |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from Step 3 | **Secret** |
| `WEBSITE_URL` | `https://recall.vercel.app` (your frontend Vercel URL from Phase 4) | Plaintext |
| `REMOTE_AI_URL` | `http://<your-azure-vm-ip>:8001` | Plaintext |
| `COBALT_API_URL` | `http://<your-azure-vm-ip>:9000` | Plaintext |
| `INTERNAL_API_KEY` | Shared admin token matching Step 10 | **Secret** |
| `RUN_WORKER_INLINE` | `true` | Plaintext |
| `EMBEDDING_PROVIDER` | `remote` | Plaintext |
| `RERANKER_PROVIDER` | `remote` | Plaintext |
| `SENTENCE_SPLITTER` | `remote` | Plaintext |
| `GEMINI_API_KEY` | Google Gemini key from Step 6 | **Secret** |
| `GROQ_API_KEY` | Groq key from Step 6 | **Secret** |
| `NVIDIA_API_KEY` | NVIDIA key from Step 6 | **Secret** |
| `GOOGLE_CLIENT_ID` | Google Client ID from Step 5 | Plaintext |
| `GOOGLE_CLIENT_SECRET` | Google Client Secret from Step 5 | **Secret** |
| `GOOGLE_REDIRECT_URI` | `https://recall-api.koyeb.app/auth/google/callback` | Plaintext |
| `SENTRY_DSN` | DSN key from Sentry | Plaintext |

- [ ] **Step 15.3**: Click **Deploy**.
- [ ] **Step 15.4**: Once Koyeb completes building and provisioning your server, copy the public URL from the dashboard (e.g. `https://recall-api.koyeb.app`). This is your Koyeb API URL.

---

## 🎨 Phase 4: Deploying the Vercel Frontend

### Step 16: Deploy Frontend SPA
- [ ] **Step 16.1**: Open your [Vercel Dashboard](https://vercel.com).
- [ ] **Step 16.2**: Click **Add New** -> **Project**.
- [ ] **Step 16.3**: Select your GitHub repository.
- [ ] **Step 16.4**: On the configuration page, set the **Root Directory** option to `frontend`.
- [ ] **Step 16.5**: Ensure the Framework Preset is set to `Vite`.
- [ ] **Step 16.6**: Under Environment Variables, add:
  *   `VITE_API_URL` = `https://recall-api.koyeb.app` (your Koyeb API URL from Step 15)
  *   `VITE_BOT_USERNAME` = `RecallLedgerProdBot` (your bot username from Step 3)
- [ ] **Step 16.7**: Click **Deploy**.
- [ ] **Step 16.8**: Save the generated Vercel domain name (e.g. `https://recall.vercel.app`).
- [ ] **Step 16.9**: *Post-deploy update*: If your Vercel domain name does not match the placeholder `https://recall.vercel.app` you set in Step 5 and Step 15, go back to Google Cloud Console and your Koyeb settings and update the origins/redirect variables to match this domain.

---

## 🚀 Phase 5: Connect Telegram Webhooks & Verify Ingestion

### Step 17: Register Webhook with Telegram
- [ ] **Step 17.1**: Open a terminal on your computer.
- [ ] **Step 17.2**: Trigger the webhook binding by running the following command (substituting your actual bot token and Koyeb API URL):
  ```bash
  curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://recall-api.koyeb.app/api/v1/telegram/webhook"
  ```
- [ ] **Step 17.3**: Check the response output. It must read:
  ```json
  {"ok":true,"result":true,"description":"Webhook was set"}
  ```

### Step 18: End-to-End Live System Verification
- [ ] **Step 18.1**: In Telegram, search for your bot and send a message `/start`.
- [ ] **Step 18.2**: Send a sample text note:
  `Setting up a remote AI service using standard ONNX pipelines.`
- [ ] **Step 18.3**: Open your Vercel frontend URL in your browser.
- [ ] **Step 18.4**: Click **Login via Telegram** and follow the authentication prompts.
- [ ] **Step 18.5**: Verify that the text note card successfully renders on your visual canvas.
- [ ] **Step 18.6**: Test the search bar on the dashboard by searching `ONNX` or `remote`. Confirm the card is retrieved within 10ms.
- [ ] **Step 18.7**: Send an image to the Telegram Bot. Confirm that the image's text is parsed via NVIDIA NIM OCR and searchable on the dashboard.
- [ ] **Step 18.8**: Send an audio file or voice message to the Bot. Confirm that it is transcribed via Groq Whisper and successfully renders on the canvas.

---

## 🔍 Troubleshooting & VM Health Monitoring

### A. Testing Port Exposure
If your Koyeb server logs report HTTP connection errors to `REMOTE_AI_URL`, test if the VM's ports are reachable from external sources:
1. From your local command line, run:
   ```bash
   nc -zv <your-azure-ip> 8001
   nc -zv <your-azure-ip> 9000
   ```
2. If connection is refused/timed out, double-check your inbound rules in the Azure Portal NSG settings.

### B. Toggling Mock Mode for Rapid Testing
If you want to test network pipelines and configurations without downloading the large ONNX model files (which might take time on standard student VM connections):
1. Open your systemd file:
   ```bash
   sudo nano /etc/systemd/system/recall-ai.service
   ```
2. Add the environment toggle under `[Service]`:
   ```ini
   Environment=MOCK_AI=True
   ```
3. Restart the service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl restart recall-ai
   ```
This bypasses ONNX and PaddleOCR libraries, immediately returning mock embeddings and mock OCR text, allowing you to debug the API connection instantly. Remember to remove this variable when moving to production!
