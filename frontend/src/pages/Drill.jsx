import React, { useEffect, useState, useCallback, useRef } from 'react';
import axios from '../api/client';
import TransmissionCard from '../components/TransmissionCard';
import DrillProgress from '../components/DrillProgress';
import DrillSummary from '../components/DrillSummary';
import AudioEngine from '../utils/AudioEngine';

/* ============================================================
   Drill — Room 3: "Recall as a ritual."

   A full-screen terminal-style spaced repetition deck.
   Fetches due quiz cards, presents them one by one.
   Space reveals the answer; 1/2/3 rates the card.
   ============================================================ */
export default function Drill() {
  const [cards, setCards] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [sessionDone, setSessionDone] = useState(false);
  const [scores, setScores] = useState({ locked: 0, shaky: 0, miss: 0 });
  const [feedback, setFeedback] = useState(null); // 'locked' | 'shaky' | 'miss'
  
  // New States for Boot Sequence & Celebration Screen
  const [bootPhase, setBootPhase] = useState('booting'); // 'booting' | 'session'
  const [bootText, setBootText] = useState('');
  const [showDueText, setShowDueText] = useState(false);
  const [showBeginButton, setShowBeginButton] = useState(false);
  const [nextReviewAt, setNextReviewAt] = useState(null);
  const [streak, setStreak] = useState(0);
  const [cardExiting, setCardExiting] = useState(false);

  const feedbackTimer = useRef(null);

  /* ── Fetch streak count on mount ───────────────────────────────────────── */
  useEffect(() => {
    const fetchStreak = async () => {
      try {
        const res = await fetch('/api/me');
        if (res.ok) {
          const data = await res.json();
          setStreak(data.streak_count || 0);
        }
      } catch (err) {
        console.error('Failed to fetch streak in Drill:', err);
      }
    };
    fetchStreak();
  }, []);

  /* ── Fetch due cards ─────────────────────────────────────────────────── */
  const fetchCards = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/quizzes/due');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const due = data.quizzes || data || [];
      setCards(due);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  /* ── Typing effect for boot screen ───────────────────────────────────── */
  useEffect(() => {
    if (loading || cards.length === 0 || bootPhase !== 'booting') return;

    const targetText = 'INITIALIZING SIGNAL RETRIEVAL...';
    // Reset text on each run so re-entries don't double-append
    setBootText('');
    let charIndex = 0;
    const typeInterval = setInterval(() => {
      if (charIndex >= targetText.length) {
        clearInterval(typeInterval);
        return;
      }
      setBootText(targetText.slice(0, charIndex + 1));
      charIndex++;
    }, 30);

    const dueTimeout = setTimeout(() => {
      setShowDueText(true);
    }, 800);

    const buttonTimeout = setTimeout(() => {
      setShowBeginButton(true);
    }, 1000);

    return () => {
      clearInterval(typeInterval);
      clearTimeout(dueTimeout);
      clearTimeout(buttonTimeout);
    };
  }, [loading, cards.length, bootPhase]);

  /* ── Rate a card ─────────────────────────────────────────────────────── */
  const rateCard = useCallback(async (rating) => {
    const card = cards[currentIndex];
    if (!card || feedback) return;

    const ratingLabel = rating === 1 ? 'locked' : rating === 2 ? 'shaky' : 'miss';
    const qualityVal = rating === 1 ? 5 : rating === 2 ? 3 : 1; // Translate rating to quality

    setFeedback(ratingLabel);
    setScores(prev => ({
      ...prev,
      [ratingLabel]: prev[ratingLabel] + 1,
    }));

    // Post rating to API
    try {
      const res = await fetch(`/api/quizzes/${card.quiz_id || card.id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quality: qualityVal }),
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        // Dispatch quiz-answered to alert other components to update
        window.dispatchEvent(new CustomEvent('quiz-answered'));
        if (data.next_review) {
          setNextReviewAt(data.next_review);
        }
      }
    } catch (err) {
      console.warn('Failed to submit quiz rating:', err.message);
    }

    // Flash duration: just enough to register the colour, then exit fast
    const flashDuration = ratingLabel === 'locked' ? 150 : 200;
    const exitDuration  = 180; // card slide-out

    feedbackTimer.current = setTimeout(() => {
      setCardExiting(true);                  // trigger card exit animation
      setTimeout(() => {
        setFeedback(null);
        setCardExiting(false);
        setRevealed(false);
        if (currentIndex + 1 >= cards.length) {
          setSessionDone(true);
        } else {
          setCurrentIndex(prev => prev + 1);
        }
      }, exitDuration);
    }, flashDuration);
  }, [cards, currentIndex, feedback]);

  /* ── Keyboard shortcuts ──────────────────────────────────────────────── */
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        const paths = { archive: '/archive', map: '/map', drill: '/drill', settings: '/settings' };
        window.history.pushState({}, '', paths.archive);
        window.dispatchEvent(new PopStateEvent('popstate'));
        return;
      }

      if (bootPhase !== 'session') return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        if (!revealed) setRevealed(true);
        return;
      }
      if (revealed) {
        if (e.key === '1') rateCard(1);
        if (e.key === '2') rateCard(2);
        if (e.key === '3') rateCard(3);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [revealed, rateCard, bootPhase]);

  /* ── Mobile Swipe Gestures (MB-3) ────────────────────────────────────────── */
  useEffect(() => {
    if (bootPhase !== 'session' || feedback) return;

    let startX = 0;
    let startY = 0;

    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }
    };

    const onTouchEnd = (e) => {
      if (e.changedTouches.length === 1 && startX !== 0) {
        const endX = e.changedTouches[0].clientX;
        const endY = e.changedTouches[0].clientY;
        const diffX = endX - startX;
        const diffY = endY - startY;

        if (!revealed) {
          // Tap card to reveal (small delta)
          if (Math.abs(diffX) < 15 && Math.abs(diffY) < 15) {
            setRevealed(true);
          }
          return;
        }

        // Horizontal swipe (Right: Locked / Left: Miss)
        if (Math.abs(diffX) > Math.abs(diffY)) {
          if (diffX > 60) {
            rateCard(1);
          } else if (diffX < -60) {
            rateCard(3);
          }
        } else {
          // Vertical swipe (Up: Shaky)
          if (diffY < -60) {
            rateCard(2);
          }
        }
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [bootPhase, revealed, rateCard, feedback]);

  /* ── Cleanup timer on unmount ────────────────────────────────────────── */
  useEffect(() => {
    return () => { if (feedbackTimer.current) clearTimeout(feedbackTimer.current); };
  }, []);

  /* ── Loading ─────────────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div style={{ width: '100%', height: '100vh', background: 'var(--bg-void)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(207,163,101,0.2)', borderTopColor: 'var(--accent-gold)', animation: 'spin 1s linear infinite' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '0.1em' }}>LOADING TRANSMISSIONS…</span>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  /* ── Error ───────────────────────────────────────────────────────────── */
  if (error) {
    return (
      <div style={{ width: '100%', height: '100vh', background: 'var(--bg-void)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: '#e07070', letterSpacing: '0.08em' }}>
          TRANSMISSION ERROR — {error}
        </div>
      </div>
    );
  }

  /* ── No cards due ────────────────────────────────────────────────────── */
  if (!loading && cards.length === 0) {
    return (
      <div style={{ width: '100%', height: '100vh', background: 'var(--bg-void)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', color: 'var(--accent-gold)', opacity: 0.4 }}>⚡</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-signal)', letterSpacing: '0.08em' }}>
          NO TRANSMISSIONS DUE
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)', maxWidth: 300, textAlign: 'center', lineHeight: 1.6 }}>
          All signals reviewed. Return tomorrow for your next session.
        </div>
      </div>
    );
  }

  /* ── Session done ────────────────────────────────────────────────────── */
  if (sessionDone) {
    return (
      <div style={{ width: '100%', height: '100vh', background: 'var(--bg-void)' }}>
        <DrillSummary 
          scores={scores} 
          total={cards.length} 
          nextReviewAt={nextReviewAt} 
          streak={streak} 
          onNavigate={(roomId) => {
            const paths = { archive: '/archive', map: '/map', drill: '/drill', settings: '/settings' };
            window.history.pushState({}, '', paths[roomId]);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }}
        />
      </div>
    );
  }

  /* ── Boot screen ── */
  if (!loading && cards.length > 0 && bootPhase === 'booting') {
    return (
      <div 
        className="drill-room crt-flicker"
        style={{ 
          width: '100%', 
          height: '100vh', 
          background: 'var(--bg-void)', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          flexDirection: 'column', 
          gap: '1.5rem',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* CRT scanline overlay */}
        <div style={{
          position: 'absolute',
          inset: 0,
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(8,250,145,0.01) 0px, rgba(8,250,145,0.01) 1px, transparent 1px, transparent 3px)',
          pointerEvents: 'none',
          zIndex: 10,
        }} />
        
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--accent-gold)', letterSpacing: '0.08em', minHeight: 20 }}>
          {bootText}
        </div>
        
        <div style={{ 
          fontFamily: 'var(--font-mono)', 
          fontSize: 14, 
          color: 'var(--text-signal)', 
          letterSpacing: '0.12em',
          opacity: showDueText ? 0.7 : 0,
          transition: 'opacity 0.4s ease',
          fontWeight: 'bold'
        }}>
          [{cards.length} TRANSMISSIONS DUE]
        </div>

        <button
          onClick={() => {
            AudioEngine.playClick();
            setBootPhase('session');
          }}
          className="pulse-btn"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--accent-gold)',
            background: 'rgba(207, 163, 101, 0.06)',
            border: '1px solid rgba(207, 163, 101, 0.2)',
            borderRadius: 3,
            padding: '0.625rem 1.5rem',
            cursor: 'pointer',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            opacity: showBeginButton ? 1 : 0,
            transform: showBeginButton ? 'translateY(0)' : 'translateY(4px)',
            transition: 'opacity 0.4s ease, transform 0.4s ease, background 0.2s ease, border-color 0.2s ease',
            marginTop: '1rem',
          }}
        >
          Begin Session ›
        </button>
      </div>
    );
  }

  const currentCard = cards[currentIndex];

  return (
    <div
      className={`drill-room ${feedback === 'miss' ? 'viewport-shake' : ''}`}
      style={{
        width: '100%',
        height: '100vh',
        background: 'var(--bg-void)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: feedback === 'miss' ? 'inset 0 0 60px rgba(224,112,112,0.15)' : 'none',
        transition: 'box-shadow 0.4s ease',
      }}
    >
      {/* ── CRT scanline overlay ── */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(8,250,145,0.01) 0px, rgba(8,250,145,0.01) 1px, transparent 1px, transparent 3px)',
        pointerEvents: 'none',
        zIndex: 10,
      }} />

      {/* ── Subtle green room tint ── */}
      <div style={{
        position: 'absolute',
        inset: 0,
        background: 'radial-gradient(ellipse at center, rgba(143,163,130,0.03) 0%, transparent 70%)',
        pointerEvents: 'none',
      }} />

      {/* ── Locked Full-screen flash overlay ── */}
      {feedback === 'locked' && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(143, 163, 130, 0.06)',
          zIndex: 99,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          animation: 'crtFlicker 0.2s ease',
        }}>
          <span style={{ fontSize: '6rem', color: 'rgba(143, 163, 130, 0.25)', fontWeight: 'bold' }}>✓</span>
        </div>
      )}

      {/* ── Progress indicator ── */}
      <DrillProgress current={currentIndex + 1} total={cards.length} />

      {/* ── Transmission card ── */}
      <div
        key={currentIndex}
        style={{
          animation: cardExiting ? 'cardExit 0.18s cubic-bezier(0.4,0,1,1) forwards' : 'cardEnter 0.22s cubic-bezier(0.16,1,0.3,1) forwards',
        }}
      >
        <TransmissionCard
          card={currentCard}
          cardNumber={currentIndex + 1}
          totalCards={cards.length}
          revealed={revealed}
          feedback={feedback}
          onReveal={() => setRevealed(true)}
          onRate={rateCard}
        />
      </div>

      {/* ── Keyboard Shortcut Hint Bar ── */}
      {!feedback && (
        <div style={{
          position: 'absolute',
          bottom: '2.5rem',
          display: 'flex',
          gap: '1.25rem',
          opacity: 0.3,
          zIndex: 5,
        }}>
          {[
            ['SPACE', 'reveal'],
            ['1', 'locked in'],
            ['2', 'shaky'],
            ['3', 'miss'],
            ['ESC', 'quit']
          ].map(([key, label]) => (
            <span key={key} style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--text-primary)',
              letterSpacing: '0.06em',
            }}>
              <kbd style={{
                border: '1px solid rgba(240, 237, 232, 0.15)',
                borderRadius: '3px',
                padding: '2px 6px',
                marginRight: '6px',
                background: 'rgba(255, 255, 255, 0.05)',
              }}>{key}</kbd>
              {label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
