import React from 'react';
import GlitchText from './GlitchText';

/* ============================================================
   TransmissionCard — The terminal quiz card for The Drill.

   Displays question on the front, flips 180deg to show answer
   and rating buttons on the back.
   Uses CRT-inspired styling: phosphor glow, scanlines,
   monospace typography, and 3D card flip.
   ============================================================ */
export default function TransmissionCard({
  card,
  cardNumber,
  totalCards,
  revealed,
  feedback,
  onReveal,
  onRate,
}) {
  if (!card) return null;

  const question = card.question || card.front || card.summary || 'No question';
  const answer = card.answer || card.back || card.raw_text || 'No answer';

  // CRT corner decorator component
  const CornerDecorators = () => (
    <>
      {['top-left', 'top-right', 'bottom-left', 'bottom-right'].map(corner => (
        <div key={corner} style={{
          position: 'absolute',
          width: 12,
          height: 12,
          border: '1px solid rgba(143, 163, 130, 0.4)',
          ...(corner.includes('top') ? { top: 8 } : { bottom: 8 }),
          ...(corner.includes('left') ? { left: 8 } : { right: 8 }),
          ...(corner.includes('top') && corner.includes('left') ? { borderRight: 'none', borderBottom: 'none' } : {}),
          ...(corner.includes('top') && corner.includes('right') ? { borderLeft: 'none', borderBottom: 'none' } : {}),
          ...(corner.includes('bottom') && corner.includes('left') ? { borderRight: 'none', borderTop: 'none' } : {}),
          ...(corner.includes('bottom') && corner.includes('right') ? { borderLeft: 'none', borderTop: 'none' } : {}),
        }} />
      ))}
    </>
  );

  return (
    <div className="transmission-card-container" style={{
      perspective: 1200,
      width: 'min(640px, 90vw)',
      height: '380px',
      position: 'relative',
      zIndex: 2,
    }}>
      <div className={`transmission-card-inner ${revealed ? 'revealed' : ''}`} style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        transition: 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
        transformStyle: 'preserve-3d',
      }}>
        {/* ── CARD FRONT (Question & Reveal Prompt) ── */}
        <div className="transmission-card-face transmission-card-front" style={{
          position: 'absolute',
          inset: 0,
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          borderRadius: 4,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'rgba(10, 12, 10, 0.95)',
          border: '1px solid rgba(143, 163, 130, 0.2)',
          boxShadow: '0 0 60px rgba(143, 163, 130, 0.06), 0 24px 64px rgba(0, 0, 0, 0.7), inset 0 0 40px rgba(8, 250, 145, 0.01)',
        }}>
          <CornerDecorators />
          
          <div>
            {/* Header */}
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'rgba(143, 163, 130, 0.6)',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              marginBottom: '1.5rem',
              display: 'flex',
              justifyContent: 'space-between',
            }}>
              <span>TRANSMISSION {String(cardNumber).padStart(2, '0')} / {String(totalCards).padStart(2, '0')}</span>
              <span style={{ color: 'rgba(207, 163, 101, 0.4)' }}>
                {card.source_type?.toUpperCase() || 'SIGNAL'}
              </span>
            </div>
            {/* Separator */}
            <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(143,163,130,0.3), transparent)', marginBottom: '1.5rem' }} />
            {/* Question */}
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: 18,
              lineHeight: 1.65,
              color: 'rgba(244, 239, 235, 0.9)',
              textShadow: '0 0 20px rgba(143, 163, 130, 0.4)',
              maxHeight: '160px',
              overflowY: 'auto',
            }}>
              {question}
            </div>
          </div>

          <button
            onClick={onReveal}
            className="pulse-btn"
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              color: 'rgba(207, 163, 101, 0.7)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              background: 'transparent',
              border: '1px solid rgba(207, 163, 101, 0.2)',
              borderRadius: 3,
              padding: '0.625rem 1.25rem',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              width: '100%',
            }}
            onMouseEnter={e => {
              e.target.style.color = 'var(--accent-gold)';
              e.target.style.borderColor = 'rgba(207,163,101,0.5)';
            }}
            onMouseLeave={e => {
              e.target.style.color = 'rgba(207,163,101,0.7)';
              e.target.style.borderColor = 'rgba(207,163,101,0.2)';
            }}
          >
            [ SPACE — Reveal ]
          </button>
        </div>

        {/* ── CARD BACK (Answer & Ratings) ── */}
        <div className="transmission-card-face transmission-card-back" style={{
          position: 'absolute',
          inset: 0,
          backfaceVisibility: 'hidden',
          WebkitBackfaceVisibility: 'hidden',
          borderRadius: 4,
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'rgba(10, 12, 10, 0.95)',
          border: '1px solid rgba(143, 163, 130, 0.2)',
          boxShadow: '0 0 60px rgba(143, 163, 130, 0.06), 0 24px 64px rgba(0, 0, 0, 0.7), inset 0 0 40px rgba(8, 250, 145, 0.01)',
          transform: 'rotateY(180deg)',
        }}>
          <CornerDecorators />

          <div>
            {/* Header */}
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'rgba(143, 163, 130, 0.6)',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              marginBottom: '1rem',
              display: 'flex',
              justifyContent: 'space-between',
            }}>
              <span>TRANSMISSION {String(cardNumber).padStart(2, '0')} / {String(totalCards).padStart(2, '0')}</span>
              <span style={{ color: 'rgba(207, 163, 101, 0.4)' }}>
                ANSWER
              </span>
            </div>
            {/* Separator */}
            <div style={{ height: 1, background: 'linear-gradient(90deg, rgba(143,163,130,0.3), transparent)', marginBottom: '1.25rem' }} />
            
            {/* Small Question context */}
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: 12,
              color: 'rgba(244, 239, 235, 0.4)',
              lineHeight: 1.4,
              marginBottom: '1rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}>
              Q: {question}
            </div>

            {/* Answer text with glitch reveal */}
            <div style={{
              fontFamily: 'var(--font-body)',
              fontSize: 15,
              lineHeight: 1.6,
              color: 'rgba(143, 163, 130, 0.95)',
              textShadow: '0 0 12px rgba(143, 163, 130, 0.5)',
              borderLeft: '2px solid rgba(143, 163, 130, 0.3)',
              paddingLeft: '1rem',
              maxHeight: '130px',
              overflowY: 'auto',
            }}>
              <GlitchText trigger={revealed} duration={150}>
                {answer}
              </GlitchText>
            </div>
          </div>

          {/* Rating buttons */}
          <div className="rating-container">
            {[
              { key: 1, label: 'LOCKED IN', hint: '1', color: 'var(--accent-sage)', glow: 'rgba(143,163,130,0.4)' },
              { key: 2, label: 'SHAKY', hint: '2', color: 'var(--accent-gold)', glow: 'rgba(207,163,101,0.4)' },
              { key: 3, label: 'MISS', hint: '3', color: '#e07070', glow: 'rgba(224,112,112,0.4)' },
            ].map(({ key, label, hint, color, glow }) => (
              <button
                key={key}
                onClick={() => onRate(key)}
                className="kbd-cap-btn"
                style={{
                  flex: 1,
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: '0.12em',
                  color,
                  background: `${color}14`,
                  border: `1px solid ${color}44`,
                  borderRadius: 3,
                  padding: '0.75rem 0.5rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.35rem',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.background = `${color}20`;
                  e.currentTarget.style.boxShadow = `0 0 16px ${glow}`;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.background = `${color}14`;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                {/* Style as keyboard key cap */}
                <kbd
                  className="card-kbd"
                  style={{
                    border: `1px solid ${color}66`,
                    borderRadius: '3px',
                    background: 'rgba(0, 0, 0, 0.4)',
                    padding: '1px 6px',
                    fontSize: '9px',
                    color,
                    boxShadow: '0 1.5px 0 rgba(255, 255, 255, 0.1)',
                  }}
                >
                  {hint}
                </kbd>
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Feedback overlays */}
      {feedback === 'locked' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(143, 163, 130, 0.08)',
          borderRadius: 4,
          pointerEvents: 'none',
          animation: 'feedbackFadeOut 0.6s ease forwards',
          zIndex: 10,
        }} />
      )}
      {feedback === 'miss' && (
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(224, 112, 112, 0.05)',
          borderRadius: 4,
          pointerEvents: 'none',
          animation: 'missGlitch 0.15s ease forwards',
          zIndex: 10,
        }} />
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes feedbackFadeOut {
          0%   { opacity: 1; }
          60%  { opacity: 0.8; }
          100% { opacity: 0; }
        }
        @keyframes missGlitch {
          0%   { transform: translateX(0); }
          20%  { transform: translateX(-4px); }
          40%  { transform: translateX(4px); }
          60%  { transform: translateX(-2px); }
          80%  { transform: translateX(2px); }
          100% { transform: translateX(0); }
        }
        .transmission-card-inner.revealed {
          transform: rotateY(180deg);
        }
      `}} />
    </div>
  );
}
