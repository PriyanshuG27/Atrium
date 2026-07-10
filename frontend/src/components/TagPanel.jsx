import React, { useRef, useEffect, useCallback } from 'react';
import gsap from 'gsap';
import ArchiveCard from './ArchiveCard';

/* ============================================================
   TagPanel — Slides in from the right when a Nebula tag
   is clicked. Shows all items associated with that tag
   in Archive card format.
   ============================================================ */
export default function TagPanel({ tag, onClose }) {
  const panelRef = useRef(null);

  /* ── Slide-in entrance ── */
  useEffect(() => {
    if (!panelRef.current) return;
    gsap.fromTo(
      panelRef.current,
      { x: '100%', opacity: 0 },
      { x: '0%', opacity: 1, duration: 0.4, ease: 'power3.out' }
    );
  }, [tag]);

  /* ── Slide-out on close ── */
  const handleClose = useCallback(() => {
    if (!panelRef.current) {
      onClose();
      return;
    }
    gsap.to(panelRef.current, {
      x: '100%',
      opacity: 0,
      duration: 0.3,
      ease: 'power2.in',
      onComplete: onClose,
    });
  }, [onClose]);

  /* ── Close on Escape ── */
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleClose]);

  const items = tag?.items || [];

  return (
    <>
      {/* ── Backdrop ── */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(8, 7, 10, 0.4)',
          zIndex: 50,
        }}
      />

      {/* ── Panel ── */}
      <div
        ref={panelRef}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 'min(560px, 90vw)',
          height: '100dvh',
          background: 'rgba(17, 15, 20, 0.97)',
          borderLeft: '1px solid rgba(207, 163, 101, 0.12)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          zIndex: 51,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
        role="dialog"
        aria-label={`Tag: ${tag?.name}`}
      >
        {/* ── Header ── */}
        <div style={{
          padding: '1.5rem 1.75rem',
          borderBottom: '1px solid rgba(207, 163, 101, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'rgba(207, 163, 101, 0.5)',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              marginBottom: '0.25rem',
            }}>
              CONSTELLATION
            </div>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '1.5rem',
              fontWeight: 600,
              color: 'var(--accent-gold)',
              letterSpacing: '-0.02em',
            }}>
              #{tag?.name}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--text-muted)',
              marginTop: '0.25rem',
            }}>
              {items.length} signal{items.length !== 1 ? 's' : ''}
            </div>
          </div>

          <button
            onClick={handleClose}
            aria-label="Close tag panel"
            style={{
              background: 'transparent',
              border: '1px solid rgba(207, 163, 101, 0.2)',
              borderRadius: 6,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              width: 32,
              height: 32,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(207,163,101,0.06)';
              e.currentTarget.style.color = 'var(--text-signal)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--text-muted)';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* ── Items list ── */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem 1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}>
          {items.length === 0 ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'var(--text-muted)',
              letterSpacing: '0.08em',
            }}>
              No signals in this constellation.
            </div>
          ) : (
            items.map(item => (
              <div
                key={item.id}
                style={{
                  background: 'rgba(8, 7, 10, 0.6)',
                  border: '1px solid rgba(207, 163, 101, 0.08)',
                  borderRadius: 10,
                  padding: '1rem 1.25rem',
                  cursor: 'default',
                }}
              >
                <div style={{
                  fontFamily: 'var(--font-body)',
                  fontSize: 14,
                  fontWeight: 500,
                  color: 'var(--text-signal)',
                  marginBottom: '0.375rem',
                  lineHeight: 1.4,
                }}>
                  {item.title || item.summary?.slice(0, 80) || 'Untitled Signal'}
                </div>
                {item.summary && (
                  <div style={{
                    fontFamily: 'var(--font-body)',
                    fontSize: 12,
                    color: 'var(--text-muted)',
                    lineHeight: 1.6,
                    display: '-webkit-box',
                    WebkitLineClamp: 3,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                  }}>
                    {item.summary}
                  </div>
                )}
                <div style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginTop: '0.5rem',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}>
                  <span style={{
                    fontFamily: 'var(--font-mono)',
                    fontSize: 9,
                    color: 'rgba(207,163,101,0.5)',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    background: 'rgba(207,163,101,0.06)',
                    padding: '1px 6px',
                    borderRadius: 3,
                  }}>
                    {item.source_type || 'signal'}
                  </span>
                  {(item.tags || []).slice(0, 3).map(t => (
                    <span key={t} style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 9,
                      color: 'rgba(207,163,101,0.4)',
                    }}>
                      #{t}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}
