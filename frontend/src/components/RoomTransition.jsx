import React, { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';

/* ============================================================
   RoomTransition — GSAP-powered room change overlay.

   On room change, a full-screen void panel slashes across
   the screen (different direction per transition pair),
   covering the old room, then retracting to reveal the new one.

   Transition pairs:
   archive → nebula : vertical slash up (cards dissolve to stars)
   nebula  → drill  : horizontal flash left (stars collapse to terminal)
   drill   → archive: radial wipe from centre (terminal fades to cylinder)
   any other pair   : simple fade

   Props:
     fromRoom   — previous room id
     toRoom     — current room id
     children   — new room content
     onDone     — called when entry animation completes
   ============================================================ */

const TRANSITION_DURATION = 0.55;

const ROOM_ORDER = { archive: 0, map: 1, drill: 2, settings: 3 };

function getTransitionStyle(from, to) {
  const fromOrder = ROOM_ORDER[from] !== undefined ? ROOM_ORDER[from] : 0;
  const toOrder = ROOM_ORDER[to] !== undefined ? ROOM_ORDER[to] : 0;

  if (fromOrder < toOrder) {
    return { clip: 'up', color: '#08070A', accent: '#CFA365' };
  } else if (fromOrder > toOrder) {
    return { clip: 'down', color: '#08070A', accent: '#CFA365' };
  }
  return { clip: 'fade', color: '#08070A', accent: '#CFA365' };
}

export default function RoomTransition({ fromRoom, toRoom, children, onDone }) {
  const overlayRef  = useRef(null);
  const accentRef   = useRef(null);
  const contentRef  = useRef(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!fromRoom || fromRoom === toRoom) {
      setReady(true);
      if (onDone) onDone();
      return;
    }

    const { clip, color, accent } = getTransitionStyle(fromRoom, toRoom);
    const overlay = overlayRef.current;
    const accentEl = accentRef.current;
    const content = contentRef.current;

    if (!overlay || !content) {
      setReady(true);
      return;
    }

    const tl = gsap.timeline({
      onComplete: () => {
        setReady(true);
        if (onDone) onDone();
      },
    });

    // ── Phase 1: slam overlay in ────────────────────────────────
    if (clip === 'up') {
      tl.fromTo(overlay,
        { scaleY: 0, transformOrigin: 'bottom center', opacity: 1 },
        { scaleY: 1, duration: TRANSITION_DURATION * 0.45, ease: 'power3.in' }
      );
    } else if (clip === 'down') {
      tl.fromTo(overlay,
        { scaleY: 0, transformOrigin: 'top center', opacity: 1 },
        { scaleY: 1, duration: TRANSITION_DURATION * 0.45, ease: 'power3.in' }
      );
    } else {
      tl.to(overlay, { opacity: 1, duration: TRANSITION_DURATION * 0.45, ease: 'power2.in' });
    }

    // ── Accent flash at peak ─────────────────────────────────────
    tl.fromTo(accentEl,
      { opacity: 0 },
      { opacity: 0.6, duration: 0.08, ease: 'none' },
      `-=${TRANSITION_DURATION * 0.05}`
    ).to(accentEl, { opacity: 0, duration: 0.12, ease: 'none' });

    // ── Reveal new content + retract overlay ─────────────────────
    tl.fromTo(content,
      { opacity: 0, y: clip === 'up' ? 16 : clip === 'down' ? -16 : 0 },
      { opacity: 1, y: 0, duration: TRANSITION_DURATION * 0.4, ease: 'power2.out' },
      '>'
    );

    if (clip === 'up') {
      tl.to(overlay,
        { scaleY: 0, transformOrigin: 'top center', duration: TRANSITION_DURATION * 0.4, ease: 'power3.out' },
        '<'
      );
    } else if (clip === 'down') {
      tl.to(overlay,
        { scaleY: 0, transformOrigin: 'bottom center', duration: TRANSITION_DURATION * 0.4, ease: 'power3.out' },
        '<'
      );
    } else {
      tl.to(overlay, { opacity: 0, duration: TRANSITION_DURATION * 0.4, ease: 'power2.out' }, '<');
    }

    return () => { tl.kill(); };
  }, [fromRoom, toRoom, onDone]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Transition overlay */}
      <div
        ref={overlayRef}
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: '#08070A',
          zIndex: 200,
          pointerEvents: 'none',
          opacity: fromRoom && fromRoom !== toRoom ? 1 : 0,
          transform: 'scaleY(0) scaleX(1)',
        }}
      >
        {/* Accent line flash */}
        <div
          ref={accentRef}
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(135deg, rgba(207,163,101,0.6), rgba(143,163,130,0.4))',
            opacity: 0,
          }}
        />
      </div>

      {/* Room content */}
      <div
        ref={contentRef}
        style={{ width: '100%', height: '100%', opacity: fromRoom && fromRoom !== toRoom ? 0 : 1 }}
      >
        {children}
      </div>
    </div>
  );
}
