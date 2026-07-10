let unauthorizedHandler = null;
let toastHandler = null;

export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler;
}

export function setToastHandler(handler) {
  toastHandler = handler;
}

export async function apiFetch(url, options = {}) {
  // 1. Automatically inject Telegram headers if available
  if (typeof window !== 'undefined' && window.Telegram?.WebApp?.initData) {
    options.headers = {
      ...options.headers,
      'Authorization': `TelegramInitData ${window.Telegram.WebApp.initData}`
    };
  }

  // 2. Set credentials default
  options.credentials = options.credentials || 'include';

  try {
    const response = await fetch(url, options);
    
    // 3. Centralized error handling
    if (!response.ok) {
      const status = response.status;
      const urlStr = String(url);
      const isAuthEndpoint = urlStr.startsWith('/auth/') || urlStr.includes('/auth/me') || urlStr.includes('/auth/logout');
      
      if (status === 401 && !isAuthEndpoint) {
        if (unauthorizedHandler) {
          unauthorizedHandler();
        }
      } else if (status === 429) {
        if (toastHandler) {
          const data = await response.clone().json().catch(() => ({}));
          const retryAfter = data?.retry_after;
          const msg = retryAfter 
            ? `Too many requests — please retry in ${retryAfter}s.` 
            : 'Too many requests — please wait';
          toastHandler(msg, 'warning');
        }
      } else if (status === 503) {
        if (toastHandler) {
          toastHandler('Server unavailable — retrying in 30 s', 'error');
        }
      }
    }
    return response;
  } catch (error) {
    if (toastHandler && navigator.onLine) {
      toastHandler('Connection lost — check your internet', 'error');
    }
    throw error;
  }
}

// Retain a dummy default client export to prevent import breaks in unused code or tests
const dummyClient = {
  get: (url, config) => apiFetch(url, { ...config, method: 'GET' }),
  post: (url, data, config) => apiFetch(url, { ...config, method: 'POST', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json', ...config?.headers } }),
  put: (url, data, config) => apiFetch(url, { ...config, method: 'PUT', body: JSON.stringify(data), headers: { 'Content-Type': 'application/json', ...config?.headers } }),
  delete: (url, config) => apiFetch(url, { ...config, method: 'DELETE' }),
  interceptors: {
    request: { use: () => {}, eject: () => {} },
    response: { use: () => {}, eject: () => {} }
  }
};

export default dummyClient;
