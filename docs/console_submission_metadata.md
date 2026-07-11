# Atrium — Developer Console Submission & Verification Metadata

This document provides copy-pasteable justification templates and metadata descriptions required when submitting Atrium's components for official developer verification.

---

## 1. Google Cloud Console — OAuth Verification Form

When submitting the OAuth Consent Screen for brand verification (required to remove the "unverified app" screen and bypass the 100-user limit), Google will ask for specific justifications for the requested scopes.

### 1.1 Project & Domain Metadata
*   **Application Name**: `Atrium`
*   **Authorized Domains**: `yourdomain.com`
*   **Privacy Policy Link**: `https://yourdomain.com/privacy.html`
*   **Terms of Service Link**: `https://yourdomain.com/terms.html`

### 1.2 Scope Justification: `drive.file`
*   **Google Prompt**: *Describe why your application needs access to this scope and how it will be used.*
*   **Copy-Paste Template**:
    > "Atrium is an interactive personal knowledge management and mind-mapping dashboard. We request the `https://www.googleapis.com/auth/drive.file` scope to allow users to securely back up their saved bookmarks, note summaries, and study guides. 
    >
    > Using this scope, Atrium creates a dedicated 'Atrium' backup folder in the user's Google Drive and exports their data as standard Google Documents. The application operates under the Principle of Least Privilege: it only accesses, modifies, or deletes the specific backup folders and files that it creates itself. It cannot read, view, or modify any other files or folders in the user's Google Drive."

### 1.3 OAuth Demo Video Submission Details
*   **YouTube Video Privacy**: Set the video to **Unlisted** (do not set to Private or Google reviewers won't be able to open it).
*   **Required Video Elements Checklist**:
    1.  Start the video by showing the browser's address bar clearly.
    2.  Navigate to the Atrium Web login dashboard and click "Connect Google Drive".
    3.  **Crucial**: Zoom in on the address bar of the Google login popup and show the `client_id` parameter in the URL.
    4.  Log in and show the consent screen showing the `drive.file` permission.
    5.  Authorize, return to the Atrium Web App, and show a document being successfully synced and created in your Google Drive.
    6.  Show where the user can disconnect/revoke access.

---

## 2. Chrome Web Store Developer Console — Manifest V3 Extension

When uploading the zipped extension package ([frontend/extension](file:///d:/Recall/frontend/extension/)), the Chrome Web Store console will request a detailed justification for every permission declared in your `manifest.json`.

### 2.1 Single Purpose Description
*   **Console Prompt**: *Describe the single purpose of your extension.*
*   **Copy-Paste Template**:
    > "Allows users to instantly save, bookmark, and clip the text content of their currently active web tab directly into their Atrium knowledge graph and mind map dashboard."

### 2.2 Permissions Justifications
You must explain why each permission is necessary for the single purpose:

*   **`activeTab`**:
    > "Needed to temporarily obtain host permission for the active tab only when the user explicitly clicks the extension icon, allowing the extension to read the URL and title of the page they wish to bookmark."
*   **`cookies`**:
    > "Needed to read the secure session authentication token (`jwt` or `atrium_session`) from our web dashboard domain (atrium.yourdomain.com) so the user is authenticated automatically without needing to re-login inside the extension popup."
*   **`scripting`**:
    > "Needed to inject a content script into the active tab to extract the main body text of the webpage, allowing the platform to generate an AI summary of the bookmarked page."
*   **`storage`**:
    > "Needed to store user preferences, active theme settings, and local cache metadata inside the extension."
*   **`contextMenus`**:
    > "Allows users to highlight specific text on a webpage, right-click, and select 'Save to Atrium' to clip snippets directly to their graph."
*   **`notifications`**:
    > "Used to show a brief toast notification informing the user that their page has been successfully summarized and added to their graph."

---

## 3. Telegram Bot Store — BotFather Configurations

To set up the Atrium Bot (`@AtriumBot` or your custom bot username) via Telegram's **BotFather**:

### 3.1 Bot Metadata
*   **Description (What can this bot do?)**:
    > "▲ Atrium is a zero-friction AI knowledge capture bot. Forward any link, voice note, PDF, or image here, and Atrium will automatically transcribe, summarize, and map everything into an interactive constellation mind map on your web dashboard."
*   **About Section**:
    > "AI knowledge capture bot for your personal mind-graph. Supported by ▲ Atrium Web."

### 3.2 Bot Commands List
Set these commands in BotFather (`/setcommands`):
*   `start` - Initialize your Atrium profile & onboarding
*   `dashboard` - Link to your interactive 3D mind-graph
*   `search` - Search your saved knowledge semantically
*   `quiz` - Trigger your due spaced-repetition quizzes
*   `connect_drive` - Connect Google Drive backup
*   `help` - View usage guide & commands
