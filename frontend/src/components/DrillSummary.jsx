import React, { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import AudioEngine from '../utils/AudioEngine';

/* ============================================================
   DrillSummary — Session-end screen after Drill completion.

   Shows counts for locked/shaky/miss, "next review" message,
   streak progress, and celebratory particle burst.
   ============================================================ */
export default function DrillSummary({ scores, total, nextReviewAt, streak, onNavigate }) {
  const containerRef = useRef(null);
  const itemsRef = useRef([]);

  const { locked = 0, shaky = 0, miss = 0 } = scores;

  // States for count-up animation
  const [displayLocked, setDisplayLocked] = useState(0);
  const [displayShaky, setDisplayShaky] = useState(0);
  const [displayMiss, setDisplayMiss] = useState(0);

  useEffect(() => {
    if (!containerRef.current) return;

    // GSAP Stagger entrance
    gsap.fromTo(
      itemsRef.current.filter(Boolean),
      { opacity: 0, y: 20 },
      {
        opacity: 1,
        y: 0,
        stagger: 0.12,
        duration: 0.6,
        ease: 'power2.out',
        delay: 0.2,
      }
    );

    // Count up scores over 800ms
    const duration = 800;
    const startTime = performance.now();

    const animate = (time) => {
      const elapsed = time - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = progress * (2 - progress); // easeOutQuad

      setDisplayLocked(Math.round(locked * ease));
      setDisplayShaky(Math.round(shaky * ease));
      setDisplayMiss(Math.round(miss * ease));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [locked, shaky, miss]);

  const stats = [
    { label: 'LOCKED IN', value: displayLocked, color: 'var(--accent-sage)', symbol: '●' },
    { label: 'SHAKY', value: displayShaky, color: 'var(--accent-gold)', symbol: '◐' },
    { label: 'TO REVISIT', value: displayMiss, color: '#e07070', symbol: '○' },
  ];

  const getNextReviewText = () => {
    if (!nextReviewAt) return 'next review: tomorrow, 09:00';
    try {
      const reviewDate = new Date(nextReviewAt);
      if (isNaN(reviewDate.getTime())) return `next review: ${nextReviewAt}`;
      
      const now = new Date();
      // Set to start of day for accurate day difference count
      now.setHours(0, 0, 0, 0);
      const tempReviewDate = new Date(reviewDate);
      tempReviewDate.setHours(0, 0, 0, 0);

      const diffTime = tempReviewDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      
      const options = { month: 'short', day: 'numeric' };
      const formattedDate = reviewDate.toLocaleDateString('en-US', options);
      
      if (diffDays <= 0) return `next review: due now · ${formattedDate}`;
      if (diffDays === 1) return `next review: back in 1 day · ${formattedDate}`;
      return `next review: back in ${diffDays} days · ${formattedDate}`;
    } catch (e) {
      return `next review: ${nextReviewAt}`;
    }
  };

  const isHighScore = total > 0 && (locked / total) >= 0.6;
  
  // Pre-calculate 20 particle angles & offsets
  const particles = Array.from({ length: 20 }).map((_, i) => {
    const angle = (i * 360) / 20;
    const distance = 80 + Math.random() * 80;
    return { angle, distance };
  });

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '2rem',
        padding: '2rem',
        position: 'relative',
      }}
    >
      {/* ── Celebrate CSS Particle Burst ── */}
      {isHighScore && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', pointerEvents: 'none', zIndex: 10 }}>
          {particles.map((p, idx) => (
            <div
              key={idx}
              className="summary-particle"
              style={{
                position: 'absolute',
                width: '4px',
                height: '4px',
                borderRadius: '50%',
                background: 'var(--accent-gold)',
                opacity: 0,
                transform: 'translate(-50%, -50%)',
                animation: 'particleBurst 1.2s cubic-bezier(0.1, 0.8, 0.3, 1) forwards',
                '--angle': `${p.angle}deg`,
                '--dist': `${p.distance}px`,
              }}
            />
          ))}
        </div>
      )}

      {/* Header */}
      <div
        ref={el => { itemsRef.current[0] = el; }}
        style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
      >
        <div style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 10,
          color: 'rgba(143, 163, 130, 0.6)',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          marginBottom: '0.75rem',
        }}>
          Session complete.
        </div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2rem, 5vw, 3.5rem)',
          fontWeight: 700,
          color: 'var(--text-signal)',
          letterSpacing: '-0.03em',
          lineHeight: 1.1,
        }}>
          {displayLocked} of {total} locked in.
        </div>

        {streak > 0 && (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
            color: 'var(--accent-gold)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            marginTop: '0.75rem',
          }}>
            <span>🔥</span>
            <span style={{ fontWeight: 'bold' }}>Day {streak} streak</span>
          </div>
        )}
      </div>

      {/* Separator */}
      <div
        ref={el => { itemsRef.current[1] = el; }}
        style={{
          width: 'min(400px, 80vw)',
          height: 1,
          background: 'linear-gradient(90deg, transparent, rgba(207,163,101,0.3), transparent)',
        }}
      />

      {/* Stats row */}
      <div
        ref={el => { itemsRef.current[2] = el; }}
        style={{
          display: 'flex',
          gap: '3rem',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {stats.map(({ label, value, color, symbol }) => (
          <div key={label} style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <div style={{
              fontFamily: 'var(--font-display)',
              fontSize: '2.5rem',
              fontWeight: 700,
              color,
              textShadow: `0 0 20px ${color}88`,
            }}>
              {value}
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 9,
              color: 'var(--text-muted)',
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
            }}>
              {symbol} {label}
            </div>
          </div>
        ))}
      </div>

      {/* Next review hint */}
      <div
        ref={el => { itemsRef.current[3] = el; }}
        style={{
          fontFamily: 'var(--font-mono)',
          fontSize: 11,
          color: 'rgba(207, 163, 101, 0.4)',
          letterSpacing: '0.1em',
          textAlign: 'center',
          lineHeight: 1.8,
        }}
      >
        {getNextReviewText()}
        <br />
        <span style={{ opacity: 0.6 }}>good signal work.</span>
      </div>

      {/* Action buttons */}
      <div 
        ref={el => { itemsRef.current[4] = el; }}
        style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}
      >
        <button
          onClick={() => {
            AudioEngine.playClick();
            onNavigate('archive');
          }}
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
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => {
            e.target.style.background = 'rgba(207,163,101,0.12)';
            e.target.style.borderColor = 'rgba(207,163,101,0.4)';
          }}
          onMouseLeave={e => {
            e.target.style.background = 'rgba(207,163,101,0.06)';
            e.target.style.borderColor = 'rgba(207,163,101,0.2)';
          }}
        >
          Browse Archive ›
        </button>
        <button
          onClick={() => {
            AudioEngine.playClick();
            onNavigate('map');
          }}
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--accent-sage)',
            background: 'rgba(143, 163, 130, 0.06)',
            border: '1px solid rgba(143, 163, 130, 0.2)',
            borderRadius: 3,
            padding: '0.625rem 1.5rem',
            cursor: 'pointer',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => {
            e.target.style.background = 'rgba(143,163,130,0.12)';
            e.target.style.borderColor = 'rgba(143,163,130,0.4)';
          }}
          onMouseLeave={e => {
            e.target.style.background = 'rgba(143,163,130,0.06)';
            e.target.style.borderColor = 'rgba(143,163,130,0.2)';
          }}
        >
          Explore Map ›
        </button>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes particleBurst {
          0% {
            transform: translate(-50%, -50%) rotate(var(--angle)) translateY(0);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) rotate(var(--angle)) translateY(var(--dist));
            opacity: 0;
          }
        }
      `}} />
    </div>
  );
}
