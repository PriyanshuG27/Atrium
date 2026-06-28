import React, { useState, useEffect, useRef } from 'react';
import { ShareNetwork, Rows, Lightning, User, MagnifyingGlass } from '@phosphor-icons/react';

/* ============================================================
   GraphControls — floating bottom pill in graph mode.

   [ ⊞ Graph ]  [ ≡ Feed ]  [ ◎ Quiz 3 ]  [ ● Avatar ]

   • Hover any icon → label slides up above it
   • Avatar click → dropdown with profile/drive/logout
   • Search icon click or '/' key → triggers onSearchOpen
   ============================================================ */

export default function GraphControls({
  viewMode,
  onViewModeChange,
  dueQuizCount = 0,
  user,
  onLogout,
  onSettingsClick,
  onSearchOpen,
}) {
  const [tooltip, setTooltip]   = useState(null);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const avatarRef = useRef(null);

  // Close avatar dropdown on outside click
  useEffect(() => {
    const onClick = (e) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target)) {
        setAvatarOpen(false);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // '/' key to open search
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
        e.preventDefault();
        onSearchOpen?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSearchOpen]);

  const initial = user?.first_name?.[0] || user?.username?.[0] || '?';

  const pillBtn = (id, icon, label, onClick, active = false, badge = null) => (
    <button
      key={id}
      onClick={onClick}
      onMouseEnter={() => setTooltip(id)}
      onMouseLeave={() => setTooltip(null)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 36,
        height: 36,
        borderRadius: '50%',
        border: 'none',
        background: active ? 'rgba(201,137,60,0.18)' : 'transparent',
        color: active ? 'rgba(201,137,60,0.9)' : 'rgba(240,237,232,0.5)',
        cursor: 'pointer',
        transition: 'background 0.2s ease, color 0.2s ease',
      }}
    >
      {icon}
      {badge > 0 && (
        <span style={{
          position: 'absolute',
          top: 2, right: 2,
          width: 14, height: 14,
          borderRadius: '50%',
          background: '#C9893C',
          color: '#0C0B0F',
          fontSize: '0.5rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          {badge > 9 ? '9+' : badge}
        </span>
      )}
      {/* Tooltip label */}
      {tooltip === id && (
        <span style={{
          position: 'absolute',
          bottom: '110%',
          left: '50%',
          transform: 'translateX(-50%)',
          whiteSpace: 'nowrap',
          background: 'rgba(12,11,15,0.95)',
          border: '1px solid rgba(240,237,232,0.08)',
          borderRadius: 4,
          padding: '3px 8px',
          fontSize: '0.65rem',
          color: 'rgba(240,237,232,0.7)',
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          pointerEvents: 'none',
          animation: 'tooltipUp 0.15s ease both',
        }}>
          {label}
        </span>
      )}
    </button>
  );

  return (
    <>
      {/* Floating bottom pill */}
      <div style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 500,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        padding: '6px 12px',
        background: 'rgba(12, 11, 15, 0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(240, 237, 232, 0.08)',
        borderRadius: 999,
        boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      }}>
        {/* Search */}
        {pillBtn('search',
          <MagnifyingGlass size={16} weight="regular" />,
          'Search  /',
          () => onSearchOpen?.()
        )}

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: 'rgba(240,237,232,0.08)', margin: '0 2px' }} />

        {/* Graph */}
        {pillBtn('graph',
          <ShareNetwork size={16} weight="regular" />,
          'Graph',
          () => onViewModeChange('graph'),
          viewMode === 'graph'
        )}

        {/* Feed */}
        {pillBtn('feed',
          <Rows size={16} weight="regular" />,
          'Feed',
          () => onViewModeChange('feed'),
          viewMode === 'feed'
        )}

        {/* Quiz */}
        {pillBtn('quiz',
          <Lightning size={16} weight="regular" />,
          'Quiz',
          () => onViewModeChange('quiz'),
          viewMode === 'quiz',
          dueQuizCount
        )}

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: 'rgba(240,237,232,0.08)', margin: '0 2px' }} />

        {/* Avatar */}
        <div ref={avatarRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setAvatarOpen(o => !o)}
            onMouseEnter={() => setTooltip('avatar')}
            onMouseLeave={() => setTooltip(null)}
            aria-label="Profile menu"
            style={{
              width: 32, height: 32,
              borderRadius: '50%',
              border: '1px solid rgba(240,237,232,0.15)',
              background: 'rgba(201,137,60,0.2)',
              color: 'rgba(201,137,60,0.9)',
              fontFamily: 'Outfit, sans-serif',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {initial.toUpperCase()}
          </button>

          {tooltip === 'avatar' && !avatarOpen && (
            <span style={{
              position: 'absolute',
              bottom: '120%',
              left: '50%',
              transform: 'translateX(-50%)',
              whiteSpace: 'nowrap',
              background: 'rgba(12,11,15,0.95)',
              border: '1px solid rgba(240,237,232,0.08)',
              borderRadius: 4,
              padding: '3px 8px',
              fontSize: '0.65rem',
              color: 'rgba(240,237,232,0.7)',
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              pointerEvents: 'none',
            }}>
              Profile
            </span>
          )}

          {/* Avatar dropdown */}
          {avatarOpen && (
            <div style={{
              position: 'absolute',
              bottom: '110%',
              right: 0,
              minWidth: 180,
              background: 'rgba(20, 18, 24, 0.97)',
              border: '1px solid rgba(240,237,232,0.08)',
              borderRadius: 8,
              padding: '6px',
              boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}>
              <div style={{
                padding: '6px 10px 8px',
                borderBottom: '1px solid rgba(240,237,232,0.06)',
                marginBottom: 2,
              }}>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: '0.8125rem', color: '#F0EDE8', fontWeight: 500 }}>
                  {user?.first_name || user?.username || 'User'}
                </div>
                <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.6rem', color: '#4A4845', marginTop: 2 }}>
                  ID {user?.chat_id}
                </div>
              </div>

              <button
                onClick={() => { setAvatarOpen(false); onSettingsClick?.(); }}
                style={dropdownItemStyle}
              >
                Settings
              </button>
              <button
                onClick={() => { setAvatarOpen(false); onLogout?.(); }}
                style={{ ...dropdownItemStyle, color: 'rgba(239,68,68,0.8)' }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Recall. watermark — bottom-left */}
      <div style={{
        position: 'fixed',
        bottom: 28,
        left: 24,
        fontFamily: "'Outfit', sans-serif",
        fontSize: '0.8125rem',
        fontWeight: 600,
        letterSpacing: '-0.03em',
        color: 'rgba(240, 237, 232, 0.12)',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 400,
      }}>
        Recall.
      </div>

      <style>{`
        @keyframes tooltipUp {
          from { opacity: 0; transform: translateX(-50%) translateY(4px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes hoverCardIn {
          from { opacity: 0; transform: translateY(6px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0)   scale(1); }
        }
      `}</style>
    </>
  );
}

const dropdownItemStyle = {
  padding: '7px 10px',
  background: 'transparent',
  border: 'none',
  borderRadius: 4,
  color: 'rgba(240,237,232,0.65)',
  fontFamily: 'Inter, sans-serif',
  fontSize: '0.8125rem',
  textAlign: 'left',
  width: '100%',
  cursor: 'pointer',
  transition: 'background 0.15s ease, color 0.15s ease',
};
