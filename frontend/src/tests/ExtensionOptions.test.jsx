import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// XOR Cipher Helper matching implementation to prepare mock storage values
function encryptToken(token, extensionId) {
  let result = "";
  for (let i = 0; i < token.length; i++) {
    const textChar = token.charCodeAt(i);
    const keyChar = extensionId.charCodeAt(i % extensionId.length);
    result += String.fromCharCode(textChar ^ keyChar);
  }
  return btoa(result);
}

const htmlContent = `
  <div class="options-wrapper">
    <div id="account-status-loading">Checking account status...</div>
    <div id="account-status-logged-in" class="hidden">
      <strong id="telegram-username"></strong>
      <button id="btn-logout">Logout</button>
    </div>
    <div id="account-status-logged-out" class="hidden">Not logged in.</div>
    <input type="checkbox" id="toggle-notifications" checked>
    <input type="text" id="input-api-url">
    <button id="btn-save-api">Save API URL</button>
    <div id="save-status" class="hidden">Settings saved ✓</div>
  </div>
`;

function executeOptionsScript() {
  const scriptPath = path.resolve(__dirname, '../../extension/options.js');
  const rawCode = fs.readFileSync(scriptPath, 'utf-8');
  const executableCode = rawCode.replace(
    "import { VITE_API_URL } from './config.js';",
    "const VITE_API_URL = 'http://localhost:8000';"
  );
  const run = new Function(executableCode);
  run();
}

describe('Chrome Extension Options Page', () => {
  beforeEach(() => {
    document.body.innerHTML = htmlContent;

    global.chrome = {
      runtime: {
        id: "mock-extension-id"
      },
      storage: {
        local: {
          get: vi.fn(),
          set: vi.fn(),
          clear: vi.fn()
        }
      }
    };

    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders logged-out experience if no token is present in storage', async () => {
    chrome.storage.local.get.mockResolvedValue({});

    executeOptionsScript();
    document.dispatchEvent(new Event("DOMContentLoaded"));

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(document.getElementById("account-status-loading").classList.contains("hidden")).toBe(true);
    expect(document.getElementById("account-status-logged-out").classList.contains("hidden")).toBe(false);
    expect(document.getElementById("account-status-logged-in").classList.contains("hidden")).toBe(true);
  });

  it('renders logged-in state calling backend /api/me with decrypted token', async () => {
    const mockToken = "header.payload.signature";
    const encryptedToken = encryptToken(mockToken, "mock-extension-id");

    chrome.storage.local.get.mockResolvedValue({
      jwt: encryptedToken,
      api_url: "http://localhost:8000",
      notifications_enabled: true
    });

    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ telegram_chat_id: 'TestUser123' })
    });

    executeOptionsScript();
    document.dispatchEvent(new Event("DOMContentLoaded"));

    await new Promise(resolve => setTimeout(resolve, 10));

    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/api/me', {
      headers: {
        'Authorization': `Bearer ${mockToken}`
      }
    });

    expect(document.getElementById("telegram-username").textContent).toBe('TestUser123');
    expect(document.getElementById("account-status-logged-in").classList.contains("hidden")).toBe(false);
  });

  it('persists notification preferences in local storage on check state changes', async () => {
    chrome.storage.local.get.mockResolvedValue({});

    executeOptionsScript();
    document.dispatchEvent(new Event("DOMContentLoaded"));

    await new Promise(resolve => setTimeout(resolve, 10));

    const toggle = document.getElementById("toggle-notifications");
    toggle.checked = false;
    toggle.dispatchEvent(new Event("change"));

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      notifications_enabled: false
    });
  });

  it('saves customizable API url override in storage and handles trailing slashes', async () => {
    chrome.storage.local.get.mockResolvedValue({});

    executeOptionsScript();
    document.dispatchEvent(new Event("DOMContentLoaded"));

    await new Promise(resolve => setTimeout(resolve, 10));

    const input = document.getElementById("input-api-url");
    input.value = "https://myapi.custom.com/path/";

    const saveBtn = document.getElementById("btn-save-api");
    saveBtn.click();

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      api_url: "https://myapi.custom.com/path"
    });
  });

  it('wipes session storage and resets inputs to defaults on logout', async () => {
    chrome.storage.local.get.mockResolvedValue({ jwt: "some-encrypted-token" });
    fetch.mockResolvedValue({ ok: false }); // force auth check fail to verify logout triggers

    executeOptionsScript();
    document.dispatchEvent(new Event("DOMContentLoaded"));

    await new Promise(resolve => setTimeout(resolve, 10));

    const logoutBtn = document.getElementById("btn-logout");
    logoutBtn.click();

    expect(chrome.storage.local.clear).toHaveBeenCalled();
    expect(document.getElementById("toggle-notifications").checked).toBe(true);
    expect(document.getElementById("input-api-url").value).toBe("http://localhost:8000");
  });
});
