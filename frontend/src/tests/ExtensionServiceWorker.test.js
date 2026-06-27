import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

function encryptToken(token, extensionId) {
  let result = "";
  for (let i = 0; i < token.length; i++) {
    const textChar = token.charCodeAt(i);
    const keyChar = extensionId.charCodeAt(i % extensionId.length);
    result += String.fromCharCode(textChar ^ keyChar);
  }
  return btoa(result);
}

function executeServiceWorkerScript() {
  const scriptPath = path.resolve(__dirname, '../../extension/service_worker.js');
  const rawCode = fs.readFileSync(scriptPath, 'utf-8');
  const executableCode = rawCode.replace(
    "import { VITE_API_URL } from './config.js';",
    "const VITE_API_URL = 'http://localhost:8000';"
  );
  const run = new Function(executableCode);
  run();
}

describe('Chrome Extension Service Worker', () => {
  let onInstalledCallback = null;
  let onClickedCallback = null;
  let onCommandCallback = null;
  let onMessageCallback = null;

  beforeEach(() => {
    vi.useFakeTimers();

    global.chrome = {
      runtime: {
        id: "mock-extension-id",
        onInstalled: {
          addListener: vi.fn(cb => { onInstalledCallback = cb; })
        },
        onMessage: {
          addListener: vi.fn(cb => { onMessageCallback = cb; })
        },
        lastError: null
      },
      contextMenus: {
        create: vi.fn(),
        onClicked: {
          addListener: vi.fn(cb => { onClickedCallback = cb; })
        }
      },
      commands: {
        onCommand: {
          addListener: vi.fn(cb => { onCommandCallback = cb; })
        }
      },
      storage: {
        local: {
          get: vi.fn(),
          set: vi.fn(),
          remove: vi.fn()
        }
      },
      action: {
        setBadgeText: vi.fn()
      },
      notifications: {
        create: vi.fn((options, cb) => { if (cb) cb(); })
      },
      tabs: {
        query: vi.fn()
      }
    };

    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('registers context menus on installed event', () => {
    executeServiceWorkerScript();
    
    expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalled();
    onInstalledCallback();

    expect(chrome.contextMenus.create).toHaveBeenCalledWith({
      id: "recall-save-link",
      title: "Save to Recall",
      contexts: ["link", "page", "selection"]
    });
  });

  it('aborts context menu click if user is unauthenticated', async () => {
    executeServiceWorkerScript();
    chrome.storage.local.get.mockResolvedValue({});

    await onClickedCallback(
      { menuItemId: "recall-save-link", pageUrl: "https://mysite.com" },
      { title: "My Page", url: "https://mysite.com" }
    );

    expect(chrome.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Error",
        message: "Please log in via the Recall extension first."
      }),
      expect.any(Function)
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('saves active webpage when right-clicking page context', async () => {
    executeServiceWorkerScript();

    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(JSON.stringify({ sub: "42", exp: Math.floor(Date.now() / 1000) + 3600 }));
    const mockToken = `${header}.${payload}.signature`;
    const encryptedToken = encryptToken(mockToken, "mock-extension-id");

    chrome.storage.local.get.mockResolvedValue({ jwt: encryptedToken });
    fetch.mockResolvedValue({ ok: true, status: 201 });

    await onClickedCallback(
      { menuItemId: "recall-save-link", pageUrl: "https://google.com/search" },
      { title: "Google Search", url: "https://google.com/search" }
    );

    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/api/extension/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mockToken}`
      },
      body: JSON.stringify({
        url: 'https://google.com/search',
        text: '',
        title: 'Google Search'
      })
    });

    expect(chrome.action.setBadgeText).toHaveBeenCalledWith({ text: "✓" });

    vi.advanceTimersByTime(3000);
    expect(chrome.action.setBadgeText).toHaveBeenLastCalledWith({ text: "" });

    expect(chrome.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Saved to Recall",
        message: "Google Search"
      }),
      expect.any(Function)
    );
  });

  it('saves text selection as a text item rather than a URL link', async () => {
    executeServiceWorkerScript();

    const header = btoa(JSON.stringify({ alg: "HS256", typ: "JWT" }));
    const payload = btoa(JSON.stringify({ sub: "42", exp: Math.floor(Date.now() / 1000) + 3600 }));
    const mockToken = `${header}.${payload}.signature`;
    const encryptedToken = encryptToken(mockToken, "mock-extension-id");

    chrome.storage.local.get.mockResolvedValue({ jwt: encryptedToken });
    fetch.mockResolvedValue({ ok: true, status: 201 });

    await onClickedCallback(
      { menuItemId: "recall-save-link", selectionText: "selected text paragraph", pageUrl: "https://wikipedia.org" },
      { title: "Wikipedia", url: "https://wikipedia.org" }
    );

    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/api/extension/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mockToken}`
      },
      body: JSON.stringify({
        url: 'https://wikipedia.org',
        text: 'selected text paragraph',
        title: 'Selection from Wikipedia'
      })
    });
  });

  it('detects expired JWT, wipes storage, and returns error notification', async () => {
    executeServiceWorkerScript();

    const header = btoa(JSON.stringify({ alg: "HS256" }));
    const payload = btoa(JSON.stringify({ sub: "42", exp: 1000 }));
    const mockToken = `${header}.${payload}.signature`;
    const encryptedToken = encryptToken(mockToken, "mock-extension-id");

    chrome.storage.local.get.mockResolvedValue({ jwt: encryptedToken });

    await onClickedCallback(
      { menuItemId: "recall-save-link", pageUrl: "https://google.com" },
      { title: "Google", url: "https://google.com" }
    );

    expect(chrome.storage.local.remove).toHaveBeenCalledWith("jwt");
    expect(chrome.notifications.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Session Expired",
        message: "Please log in again."
      }),
      expect.any(Function)
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it('handles save-current-page keyboard command shortcut', async () => {
    executeServiceWorkerScript();

    const header = btoa(JSON.stringify({ alg: "HS256" }));
    const payload = btoa(JSON.stringify({ sub: "42", exp: Math.floor(Date.now() / 1000) + 3600 }));
    const mockToken = `${header}.${payload}.signature`;
    const encryptedToken = encryptToken(mockToken, "mock-extension-id");

    chrome.storage.local.get.mockResolvedValue({ jwt: encryptedToken });
    chrome.tabs.query.mockResolvedValue([{ url: "https://wikipedia.org", title: "Wikipedia" }]);
    fetch.mockResolvedValue({ ok: true, status: 201 });

    await onCommandCallback("save-current-page");

    expect(fetch).toHaveBeenCalledWith('http://localhost:8000/api/extension/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mockToken}`
      },
      body: JSON.stringify({
        url: 'https://wikipedia.org',
        text: '',
        title: 'Wikipedia'
      })
    });
  });
});
