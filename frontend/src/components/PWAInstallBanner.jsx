import React, { useState, useEffect } from 'react';

/**
 * PWA Install Banner Component
 * Floating dark-mode banner prompting users to install Recall natively.
 */
export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [visible, setVisible] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    // Detect iOS & Mobile status
    const userAgent = window.navigator.userAgent || '';
    const ios = /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
    const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    
    setIsIOS(ios);
    setIsMobile(mobile);

    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // Show banner if not dismissed in session
      const dismissed = sessionStorage.getItem('atrium_pwa_banner_dismissed');
      if (!dismissed) {
        setVisible(true);
      }
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    // If mobile and not already standalone, show banner with instructions (as fallback)
    const isStandalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches;
    if (mobile && !isStandalone) {
      const dismissed = sessionStorage.getItem('atrium_pwa_banner_dismissed');
      if (!dismissed) {
        setVisible(true);
      }
    } else if (isStandalone) {
      setVisible(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setVisible(false);
    }
    setDeferredPrompt(null);
  };

  const handleClose = () => {
    setVisible(false);
    sessionStorage.setItem('atrium_pwa_banner_dismissed', 'true');
  };

  if (!visible) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 'calc(100% - 32px)',
        maxWidth: '460px',
        background: 'rgba(23, 24, 37, 0.95)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '20px',
        padding: '0.75rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        animation: 'pwaBannerIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards'
      }}
    >
      {/* Left section: Icon + App Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #1e1e2d 0%, #0d0d15 100%)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.25rem',
            fontWeight: 800,
            color: 'var(--accent-gold, #CFA365)',
            boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1), 0 4px 12px rgba(0,0,0,0.4)',
            flexShrink: 0
          }}
        >
          A
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              color: '#ffffff',
              fontWeight: 700,
              fontSize: '0.975rem',
              letterSpacing: '-0.01em',
              lineHeight: 1.2
            }}
          >
            Install Atrium
          </span>
          <span
            style={{
              color: 'rgba(255, 255, 255, 0.45)',
              fontSize: '0.8125rem',
              fontWeight: 500,
              lineHeight: 1.3
            }}
          >
            {deferredPrompt ? (
              window.location.hostname || 'atrium.onrender.com'
            ) : isIOS ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                Tap Share <span role="img" aria-label="share">📤</span> and "Add to Home Screen"
              </span>
            ) : (
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                Tap menu <span role="img" aria-label="menu">⁝</span> and select "Add to Home Screen"
              </span>
            )}
          </span>
        </div>
      </div>

      {/* Right section: Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.15rem' }}>
        {deferredPrompt && (
          <button
            onClick={handleInstall}
            style={{
              background: 'none',
              border: 'none',
              color: '#a3e635',
              fontWeight: 700,
              fontSize: '0.9375rem',
              cursor: 'pointer',
              padding: 0,
              transition: 'opacity 0.2s'
            }}
            onMouseEnter={(e) => (e.target.style.opacity = '0.8')}
            onMouseLeave={(e) => (e.target.style.opacity = '1.0')}
          >
            Install
          </button>
        )}
        <button
          onClick={handleClose}
          style={{
            background: 'none',
            border: 'none',
            color: 'rgba(255, 255, 255, 0.6)',
            fontWeight: 600,
            fontSize: '0.9375rem',
            cursor: 'pointer',
            padding: 0,
            transition: 'opacity 0.2s'
          }}
          onMouseEnter={(e) => (e.target.style.opacity = '0.8')}
          onMouseLeave={(e) => (e.target.style.opacity = '1.0')}
        >
          Close
        </button>
      </div>

      <style>{`
        @keyframes pwaBannerIn {
          from {
            opacity: 0;
            transform: translate(-50%, 24px);
          }
          to {
            opacity: 1;
            transform: translate(-50%, 0);
          }
        }
      `}</style>
    </div>
  );
}
