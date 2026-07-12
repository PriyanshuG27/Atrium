---
Last Verified
Repository: Atrium
Branch: main
Commit: 5d4b39561d30e5c63fd7aae34991ceb3c0b8f072
Verification Date: 2026-07-12
---

# Connecting Your First Workspace

This guide explains how to configure a Telegram bot, register the bot webhook, and authenticate your account using the Telegram Web App login widget.

---

## 1. Creating Your Telegram Bot

Atrium uses a Telegram bot as the primary capture interface. All voice messages, links, images, and PDFs sent to the bot are automatically pushed to the queue.

### Step 1.1: Start BotFather
1. Open Telegram and search for the official account `@BotFather`.
2. Send the command `/newbot`.
3. Give your bot a name (e.g., `Atrium Space`) and a username ending in `bot` (e.g., `atrium_brain_bot`).
4. Save the **HTTP API Token** provided by BotFather.

### Step 1.2: Set Up Web App and Commands
To enable interactive settings and search drawers from within the Telegram interface, configure the Web App:
1. In `@BotFather`, send the `/setmenubutton` command.
2. Select your bot, send the URL of your deployed website (e.g., `https://atrium-spa.vercel.app/`), and set the button title to `Open Atrium`.
3. Set the commands list by running `/setcommands` and pasting:
   ```
   start - Establish workspace and verify user session
   help - Get usage instructions for capturing thoughts
   sync - Trigger a manual sync of linked folders
   ```

---

## 2. Setting Up Webhook URL

For the bot to respond to Telegram events in real time, you must register a Webhook URL that routes messages to your FastAPI server.

### Local Development (Using ngrok tunnel)
Telegram requires HTTPS endpoints. If running locally, you must establish a public HTTPS tunnel:
```bash
# Start ngrok tunnel on port 8000
make tunnel
```
Call the webhook setup endpoint from your browser or via curl:
```bash
curl "http://localhost:8000/setup-webhook?url=https://YOUR_FORWARDING_ID.ngrok-free.app/webhook"
```
Verify the response returns `{"status": "ok", "detail": "Webhook configured"}`.

### Production Environment
In production, standard lifecycles register webhooks. Verify the webhook URL is configured:
```env
TELEGRAM_WEBHOOK_SECRET=your_custom_secure_secret_token
```
The application startup lifecycle automatically binds the webhook on boot.

---

## 3. Logging in to the Web Dashboard

The Atrium dashboard matches your secure Telegram session.

### Step 3.1: Widget Authentication
1. Open the web client.
2. You will be greeted with the Login screen.
3. If running inside a Telegram Web App (TWA), auth headers are signed and verified automatically via HMAC comparison.
4. If accessing via a web browser, log in using the Telegram Login widget by entering your Telegram-registered phone number and verifying the confirmation prompt inside your Telegram application.

### Step 3.2: Verification and Sessions
The backend performs a cryptographic signature verification on the initData/widget hash using the `TELEGRAM_BOT_TOKEN`.
- **Session Tokens**: On success, the backend sets an `atrium_session` httpOnly secure cookie containing the signed JWT, redirecting the user to `/archive`.

---
