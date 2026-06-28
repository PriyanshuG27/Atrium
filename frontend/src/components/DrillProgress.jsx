import React, { useRef, useEffect } from 'react';
import gsap from 'gsap';

/* ============================================================
   DrillProgress — Thin gold sweep line between cards.

   Animates from 0 to current/total progress width via GSAP.
   A gold sweep line crosses the screen on each card advance.
   ============================================================ */
export default function DrillProgress({ current, total }) {
  const barRef = useRef(null);
  const sweepRef = useRef(null);
  const prevCurrent = useRef(0);

  const progress = total > 0 ? current / total : 0;

  useEffect(() => {
    if (!barRef.current) return;

    // Animate progress bar fill
    gsap.to(barRef.current, {
      scaleX: progress,
      duration: 0.5,
      ease: 'power2.out',
      transformOrigin: 'left center',
    });

    // Gold sweep line on card advance (skip first mount)
    if (prevCurrent.current > 0 && sweepRef.current) {
      gsap.fromTo(
        sweepRef.current,
        { x: '-100vw', opacity: 1 },
        { x: '100vw', opacity: 0.8, duration: 0.5, ease: 'power2.inOut' }
      );
    }

    prevCurrent.current = current;
  }, [current, progress]);

  return (
    <>
      {/* ── Progress bar ── */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        background: 'rgba(207, 163, 101, 0.1)',
        zIndex: 20,
      }}>
        <div
          ref={barRef}
          style={{
            height: '100%',
            background: 'linear-gradient(90deg, var(--accent-gold), rgba(207,163,101,0.6))',
            transformOrigin: 'left center',
            transform: `scaleX(${progress})`,
            boxShadow: '0 0 8px rgba(207, 163, 101, 0.6)',
          }}
        />
      </div>

      {/* ── Card counter ── */}
      <div style={{
        position: 'absolute',
        top: '1.5rem',
        right: '2rem',
        fontFamily: 'var(--font-mono)',
        fontSize: 10,
        color: 'rgba(207, 163, 101, 0.5)',
        letterSpacing: '0.12em',
        zIndex: 20,
      }}>
        {current} / {total}
      </div>

      {/* ── Gold sweep line (crosses screen between cards) ── */}
      <div
        ref={sweepRef}
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: 0,
          width: 3,
          background: 'linear-gradient(180deg, transparent, var(--accent-gold), transparent)',
          opacity: 0,
          zIndex: 20,
          pointerEvents: 'none',
          boxShadow: '0 0 20px rgba(207, 163, 101, 0.8)',
        }}
      />
    </>
  );
}
