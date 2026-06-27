import { VITE_API_URL } from './config.js';

function xorCipher(text, key) {
  let result = "";
  for (let i = 0; i < text.length; i++) {
    const textChar = text.charCodeAt(i);
    const keyChar = key.charCodeAt(i % key.length);
    result += String.fromCharCode(textChar ^ keyChar);
  }
  return result;
}

function decryptToken(encryptedBase64, extensionId) {
  try {
    const encrypted = atob(encryptedBase64);
    return xorCipher(encrypted, extensionId);
  } catch (e) {
    return null;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const loadingState = document.getElementById("account-status-loading");
  const loggedInState = document.getElementById("account-status-logged-in");
  const loggedOutState = document.getElementById("account-status-logged-out");
  const usernameEl = document.getElementById("telegram-username");
  
  const btnLogout = document.getElementById("btn-logout");
  const toggleNotifications = document.getElementById("toggle-notifications");
  const inputApiUrl = document.getElementById("input-api-url");
  const btnSaveApi = document.getElementById("btn-save-api");
  const saveStatus = document.getElementById("save-status");

  const extensionId = chrome.runtime.id;

  // 1. Load preferences
  const storageData = await chrome.storage.local.get(["jwt", "api_url", "notifications_enabled"]);
  
  const isNotificationsEnabled = storageData.notifications_enabled !== false;
  toggleNotifications.checked = isNotificationsEnabled;

  const currentApiUrl = storageData.api_url || VITE_API_URL;
  inputApiUrl.value = currentApiUrl;

  // 2. Fetch User Profile
  if (storageData.jwt) {
    const decryptedToken = decryptToken(storageData.jwt, extensionId);
    if (decryptedToken) {
      try {
        const response = await fetch(`${currentApiUrl}/api/me`, {
          headers: {
            "Authorization": `Bearer ${decryptedToken}`
          }
        });

        if (response.ok) {
          const userData = await response.json();
          const displayName = userData.telegram_chat_id || "User";
          usernameEl.textContent = displayName;
          loadingState.classList.add("hidden");
          loggedInState.classList.remove("hidden");
        } else {
          await handleLogoutReset();
        }
      } catch (err) {
        console.error("Failed to query user profile:", err);
        usernameEl.textContent = "Offline Session";
        loadingState.classList.add("hidden");
        loggedInState.classList.remove("hidden");
      }
    } else {
      await handleLogoutReset();
    }
  } else {
    loadingState.classList.add("hidden");
    loggedOutState.classList.remove("hidden");
  }

  // 3. Save Preferences Click Handlers
  btnSaveApi.addEventListener("click", async () => {
    let newUrl = inputApiUrl.value.trim();
    if (!newUrl) {
      newUrl = VITE_API_URL;
    }
    if (newUrl.endsWith("/")) {
      newUrl = newUrl.slice(0, -1);
    }
    
    await chrome.storage.local.set({ api_url: newUrl });
    showSaveSuccess();
  });

  toggleNotifications.addEventListener("change", async () => {
    await chrome.storage.local.set({
      notifications_enabled: toggleNotifications.checked
    });
  });

  btnLogout.addEventListener("click", async () => {
    await handleLogoutReset();
  });

  async function handleLogoutReset() {
    await chrome.storage.local.clear();
    toggleNotifications.checked = true;
    inputApiUrl.value = VITE_API_URL;
    
    loggedInState.classList.add("hidden");
    loadingState.classList.add("hidden");
    loggedOutState.classList.remove("hidden");
  }

  function showSaveSuccess() {
    saveStatus.classList.remove("hidden");
    setTimeout(() => {
      saveStatus.classList.add("hidden");
    }, 2500);
  }
});
