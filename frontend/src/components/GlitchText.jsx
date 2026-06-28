import React, { useRef, useEffect, useState } from 'react';

/* ============================================================
   GlitchText — Utility component.

   On trigger (prop change to true), randomises characters
   for `duration` ms then resolves to the real children text.
   Pure CSS + JS — no WebGL.

   Spec: 150ms glitch snap duration.
   ============================================================ */

const GLITCH_CHARS = '▓░█▒▄▐▌▀ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&';

function randomChar() {
  return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
}

export default function GlitchText({ children, trigger, duration = 150 }) {
  const [displayText, setDisplayText] = useState(children);
  const intervalRef = useRef(null);
  const startRef = useRef(null);
  const targetRef = useRef(children);

  useEffect(() => {
    targetRef.current = children;
  }, [children]);

  useEffect(() => {
    if (!trigger) return;

    const target = String(targetRef.current || '');
    startRef.current = performance.now();

    // Immediately show glitched version
    setDisplayText(target.split('').map(c => c === ' ' ? ' ' : randomChar()).join(''));

    // Rapidly randomise characters then resolve
    const FRAME_MS = 30;
    intervalRef.current = setInterval(() => {
      const elapsed = performance.now() - startRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Reveal characters left-to-right proportional to progress
      const revealedChars = Math.floor(progress * target.length);
      const glitched = target.split('').map((c, i) => {
        if (c === ' ' || c === '\n') return c;
        if (i < revealedChars) return c; // revealed
        return randomChar(); // still glitching
      }).join('');

      setDisplayText(glitched);

      if (progress >= 1) {
        clearInterval(intervalRef.current);
        setDisplayText(target);
      }
    }, FRAME_MS);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [trigger, duration]);

  return (
    <span
      style={{
        fontFamily: 'inherit',
        whiteSpace: 'pre-wrap',
      }}
      aria-label={String(children || '')}
    >
      {displayText}
    </span>
  );
}
