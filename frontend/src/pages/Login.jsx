import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import GraphCanvas from '../canvas/GraphCanvas';
import { Microphone, Link as LinkIcon, FilePdf } from '@phosphor-icons/react';

// Pre-calculated coordinates for a 5-node star constellation layout
const demoNodes = [
  { id: 1, title: 'Voice Notes', x: 200, y: 150, type: 'node', source_type: 'voice' },
  { id: 2, title: 'Links', x: 120, y: 350, type: 'node', source_type: 'url' },
  { id: 3, title: 'PDFs', x: 380, y: 250, type: 'node', source_type: 'pdf' },
  { id: 4, title: 'Recall', x: 450, y: 480, type: 'node', source_type: 'text' },
  { id: 5, title: 'Zero Friction', x: 280, y: 550, type: 'node', source_type: 'default' }
];

const demoEdges = [
  { id: 1, source: 1, target: 3, weight: 0.8 },
  { id: 2, source: 2, target: 4, weight: 0.9 },
  { id: 3, source: 3, target: 5, weight: 0.7 }
];

export default function Login() {
  const { login } = useAuth();
  const [error, setError] = useState('');
  const [customChatId, setCustomChatId] = useState('');
  const [showDeveloperBypass, setShowDeveloperBypass] = useState(false);

  // Load the live Telegram Login widget
  useEffect(() => {
    const script = document.createElement('script');
    script.src = "https://telegram.org/js/telegram-web-app.js";
    script.setAttribute("data-telegram-login", import.meta.env.VITE_BOT_USERNAME || "");
    script.setAttribute("data-size", "large");
    script.setAttribute("data-radius", "8");
    script.setAttribute("data-auth-url", `${import.meta.env.VITE_API_URL || ""}/auth/telegram`);
    script.async = true;
    
    const container = document.getElementById('telegram-widget-container');
    if (container) {
      container.appendChild(script);
    }

    return () => {
      if (container) {
        container.innerHTML = '';
      }
    };
  }, []);

  const handleDeveloperBypass = async () => {
    try {
      const targetId = customChatId.trim() || '12345';
      const res = await fetch(`/auth/telegram?id=${targetId}&mock=true`);
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
    <div style={{
      position: 'relative',
      width: '100%',
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      backgroundColor: '#030307',
      overflow: 'hidden',
      fontFamily: "'Outfit', sans-serif"
    }}>
      {/* Dynamic Keyframe Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes slideUpFade {
          from {
            opacity: 0;
            transform: translateY(24px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        .slide-up-fade {
          animation: slideUpFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        .feature-pill {
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .feature-pill:hover {
          background: rgba(255, 255, 255, 0.08) !important;
          border-color: rgba(0, 212, 170, 0.3) !important;
          transform: translateY(-1px);
        }
        .bypass-toggle {
          cursor: pointer;
          font-size: 0.75rem;
          color: var(--color-text-muted);
          text-decoration: underline;
          margin-top: 1.5rem;
          transition: color 0.2s ease;
        }
        .bypass-toggle:hover {
          color: var(--color-text);
        }
      `}} />

      {/* Floating Nebula Blobs (Cosmic Noir Atmosphere) */}
      <div className="nebula-blob nebula-violet" style={{ top: '10%', left: '5%', width: '450px', height: '450px', position: 'absolute', pointerEvents: 'none' }} />
      <div className="nebula-blob nebula-mint" style={{ bottom: '10%', right: '5%', width: '500px', height: '500px', position: 'absolute', pointerEvents: 'none' }} />

      {/* 30% Opacity Hero Constellation Graph Background */}
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: 0.3,
        pointerEvents: 'none',
        zIndex: 0
      }}>
        <GraphCanvas 
          activeNodes={demoNodes} 
          edges={demoEdges} 
          pan={{ x: 0, y: 0 }}
          zoom={1}
        />
      </div>

      {/* Double-Bezel (Doppelrand) Nested Card Architecture */}
      <div className="slide-up-fade" style={{
        zIndex: 1,
        width: '100%',
        maxWidth: '440px',
        padding: '6px',
        borderRadius: '24px',
        background: 'rgba(255, 255, 255, 0.03)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(32px)',
        WebkitBackdropFilter: 'blur(32px)',
        boxShadow: '0 24px 60px rgba(0, 0, 0, 0.5)'
      }}>
        <div className="glass-card" style={{
          padding: '2.5rem 2rem',
          borderRadius: '18px',
          background: 'rgba(7, 7, 15, 0.9)',
          border: '1px solid rgba(255, 255, 255, 0.03)',
          boxShadow: 'inset 0 1px 1px rgba(255, 255, 255, 0.1)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center'
        }}>
          {/* Logo Branding */}
          <h1 style={{
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 700,
            fontSize: '32px',
            margin: 0,
            color: '#F1F1F6',
            letterSpacing: '-0.02em',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}>
            ✦ Recall
          </h1>

          {/* Tagline */}
          <p style={{
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 400,
            fontSize: '18px',
            margin: '0.5rem 0 1.5rem 0',
            color: '#8E8E9F'
          }}>
            Your second brain. Zero friction.
          </p>

          {/* Feature Pills */}
          <div style={{
            display: 'flex',
            gap: '0.6rem',
            marginBottom: '2rem',
            justifyContent: 'center',
            flexWrap: 'wrap'
          }}>
            <div className="feature-pill" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.8rem',
              borderRadius: '20px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '0.8125rem',
              color: '#F1F1F6'
            }}>
              <Microphone size={14} weight="light" />
              <span>Voice Notes</span>
            </div>
            <div className="feature-pill" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.8rem',
              borderRadius: '20px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '0.8125rem',
              color: '#F1F1F6'
            }}>
              <LinkIcon size={14} weight="light" />
              <span>Links</span>
            </div>
            <div className="feature-pill" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.35rem',
              padding: '0.4rem 0.8rem',
              borderRadius: '20px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              fontSize: '0.8125rem',
              color: '#F1F1F6'
            }}>
              <FilePdf size={14} weight="light" />
              <span>PDFs</span>
            </div>
          </div>

          {/* CTA: Telegram Login Widget Container */}
          <div 
            className="glass-card" 
            id="telegram-widget-container" 
            style={{
              width: '100%',
              minHeight: '64px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid #00D4AA',
              borderRadius: '8px',
              background: 'rgba(0, 212, 170, 0.02)',
              boxShadow: '0 0 15px rgba(0, 212, 170, 0.05)',
              margin: '0.5rem 0'
            }}
          />

          {/* Error Message */}
          {error && (
            <div style={{
              color: '#ef4444',
              fontSize: '0.8125rem',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              marginTop: '1rem',
              width: '100%',
              border: '1px solid rgba(239, 68, 68, 0.2)'
            }}>
              {error}
            </div>
          )}

          {/* Footer Statement */}
          <p style={{
            fontSize: '0.75rem',
            color: '#8E8E9F',
            marginTop: '2rem',
            marginBottom: 0
          }}>
            Free. No signup form. Works in &lt; 5 seconds.
          </p>

          {/* Developer Bypass Panel */}
          <div style={{
            width: '100%',
            marginTop: '1.5rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.6rem'
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', width: '100%' }}>
              <label htmlFor="custom-chat-id" style={{ fontSize: '0.8125rem', color: '#8E8E9F', textAlign: 'left' }}>
                Telegram Chat ID to view your bot items
              </label>
              <input
                id="custom-chat-id"
                type="text"
                value={customChatId}
                onChange={(e) => setCustomChatId(e.target.value)}
                placeholder="e.g. 123456789"
                style={{
                  width: '100%',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  color: '#F1F1F6',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '6px',
                  outline: 'none',
                  fontSize: '0.875rem',
                  transition: 'border-color 0.2s ease'
                }}
                onFocus={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.2)'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(255, 255, 255, 0.08)'}
              />
            </div>

            <button 
              className="btn btn-primary" 
              onClick={handleDeveloperBypass}
              style={{
                width: '100%',
                padding: '0.5rem 1rem',
                fontSize: '0.875rem',
                borderRadius: '6px',
                fontWeight: '600',
                cursor: 'pointer',
                background: '#6C63FF',
                border: 'none',
                color: 'white',
                transition: 'opacity 0.2s ease'
              }}
              onMouseOver={(e) => e.target.style.opacity = '0.9'}
              onMouseOut={(e) => e.target.style.opacity = '1'}
            >
              ⚡ Developer Bypass Login
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
