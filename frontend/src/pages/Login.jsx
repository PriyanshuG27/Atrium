import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [error, setError] = useState('');

  // Load the live Telegram Login widget
  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-telegram-login", "RecallTestBot");
    script.setAttribute("data-size", "large");
    script.setAttribute("data-auth-url", "/auth/telegram");
    script.setAttribute("data-request-access", "write");
    script.async = true;
    
    const container = document.getElementById('telegram-widget-container');
    if (container) {
      container.appendChild(script);
    }
  }, []);

  const handleDeveloperBypass = async () => {
    try {
      const res = await fetch('/auth/telegram?id=12345&mock=true');
      if (res.ok) {
        const check = await fetch('/auth/me');
        if (check.ok) {
          const profile = await check.json();
          login({ id: profile.id, chat_id: profile.chat_id });
        }
      } else {
        setError('Bypass login failed.');
      }
    } catch (err) {
      console.error(err);
      setError('Connection error.');
    }
  };

  return (
    <div className="page-container">
      <div className="login-card glass-panel">
        <div>
          <h2 className="gradient-text" style={{ fontSize: '2rem' }}>Recall</h2>
          <p style={{ marginTop: '0.25rem' }}>Your personal constellation mind map</p>
        </div>

        {error && (
          <div style={{ color: '#ef4444', fontSize: '0.9rem', backgroundColor: 'rgba(239, 68, 68, 0.1)', padding: '0.5rem', borderRadius: '6px' }}>
            {error}
          </div>
        )}

        <div className="widget-container" id="telegram-widget-container">
          {/* Telegram Login Widget is loaded here */}
        </div>

        <div className="divider">Or Developer Access</div>

        <button className="btn btn-primary" onClick={handleDeveloperBypass}>
          ⚡ Developer Bypass Login
        </button>
      </div>
    </div>
  );
}
