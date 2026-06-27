import { VITE_API_URL, WEBSITE_URL } from './config.js';

document.addEventListener("DOMContentLoaded", async () => {
  const loggedOutState = document.getElementById("auth-state-logged-out");
  const loggedInState = document.getElementById("auth-state-logged-in");
  const btnLogin = document.getElementById("btn-login");
  const btnSave = document.getElementById("btn-save");
  const tabTitleEl = document.getElementById("tab-title");
  const tabUrlEl = document.getElementById("tab-url");
  const statusEl = document.getElementById("status-message");

  let currentTab = null;
  let jwtToken = null;

  btnLogin.addEventListener("click", () => {
    chrome.tabs.create({ url: `${WEBSITE_URL}/auth/telegram` });
  });

  btnSave.addEventListener("click", async () => {
    if (!jwtToken || !currentTab) return;
    
    btnSave.disabled = true;
    btnSave.innerHTML = '<span class="spinner"></span>Saving...';
    hideStatus();

    chrome.runtime.sendMessage({ type: "SAVE_CURRENT_TAB" }, (response) => {
      if (chrome.runtime.lastError) {
        showError("Communication failed.");
        btnSave.disabled = false;
        btnSave.textContent = "Save to Recall";
        return;
      }

      if (response && response.success) {
        showSuccess("Saved ✓");
        btnSave.textContent = "Save to Recall";
      } else {
        const errMsg = (response && response.error) || "Failed to save.";
        showError(errMsg);
        btnSave.disabled = false;
        btnSave.textContent = "Save to Recall";
      }
    });
  });

  function xorCipher(text, key) {
    let result = "";
    for (let i = 0; i < text.length; i++) {
      const textChar = text.charCodeAt(i);
      const keyChar = key.charCodeAt(i % key.length);
      result += String.fromCharCode(textChar ^ keyChar);
    }
    return result;
  }

  function encryptToken(token, extensionId) {
    const encrypted = xorCipher(token, extensionId);
    return btoa(encrypted);
  }

  function decryptToken(encryptedBase64, extensionId) {
    try {
      const encrypted = atob(encryptedBase64);
      return xorCipher(encrypted, extensionId);
    } catch (e) {
      return null;
    }
  }

  async function checkAuthentication() {
    const extensionId = chrome.runtime.id;
    try {
      const data = await chrome.storage.local.get("jwt");
      if (data.jwt) {
        const decrypted = decryptToken(data.jwt, extensionId);
        if (decrypted) return decrypted;
      }
    } catch (err) {
      console.error("Local storage read failed:", err);
    }

    try {
      const cookie = await chrome.cookies.get({
        url: WEBSITE_URL,
        name: "jwt"
      });
      if (cookie && cookie.value) {
        const encrypted = encryptToken(cookie.value, extensionId);
        await chrome.storage.local.set({ jwt: encrypted });
        return cookie.value;
      }
    } catch (err) {
      console.error("Cookie detection failed:", err);
    }

    return null;
  }

  async function loadActiveTab() {
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0) {
        currentTab = tabs[0];
        tabTitleEl.textContent = currentTab.title || "Untitled Link";
        tabUrlEl.textContent = currentTab.url || "";
      } else {
        tabTitleEl.textContent = "No active tab";
        tabUrlEl.textContent = "";
        btnSave.disabled = true;
      }
    } catch (err) {
      console.error("Query active tab failed:", err);
      tabTitleEl.textContent = "Tab error";
      tabUrlEl.textContent = "";
      btnSave.disabled = true;
    }
  }

  function showSuccess(msg) {
    statusEl.textContent = msg;
    statusEl.className = "status-message success";
  }

  function showError(msg) {
    statusEl.textContent = msg;
    statusEl.className = "status-message error";
  }

  function hideStatus() {
    statusEl.textContent = "";
    statusEl.className = "status-message hidden";
  }

  jwtToken = await checkAuthentication();
  if (jwtToken) {
    loggedOutState.classList.add("hidden");
    loggedInState.classList.remove("hidden");
    await loadActiveTab();
  } else {
    loggedInState.classList.add("hidden");
    loggedOutState.classList.remove("hidden");
  }
});
