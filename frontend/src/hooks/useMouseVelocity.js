import { useRef, useState, useEffect, useCallback } from 'react';

/* ============================================================
   useMouseVelocity — tracks cursor speed in world units/ms.

   Returns:
     { vx, vy, speed, normalised }
   where `normalised` is speed clamped to [0, 1]
   (maxSpeed = 2.5 px/ms ≈ 150 px per frame at 60fps)

   Used by:
   - NebulaCanvas  → shockwave trigger
   - CustomCursor  → reticle scale
   ============================================================ */

const MAX_SPEED = 2.5; // px/ms

export default function useMouseVelocity() {
  const lastPos  = useRef({ x: 0, y: 0, t: 0 });
  const velRef   = useRef({ vx: 0, vy: 0, speed: 0, normalised: 0 });
  const rafId    = useRef(null);
  const [, tick] = useState(0); // forces re-render on decay

  const handleMove = useCallback((e) => {
    const now = performance.now();
    const dt  = Math.max(now - lastPos.current.t, 1);
    const vx  = (e.clientX - lastPos.current.x) / dt;
    const vy  = (e.clientY - lastPos.current.y) / dt;
    const speed = Math.sqrt(vx * vx + vy * vy);

    velRef.current = {
      vx,
      vy,
      speed,
      normalised: Math.min(speed / MAX_SPEED, 1),
    };

    lastPos.current = { x: e.clientX, y: e.clientY, t: now };
  }, []);

  useEffect(() => {
    // Exponential decay loop
    const decay = () => {
      velRef.current = {
        ...velRef.current,
        speed:      velRef.current.speed      * 0.88,
        normalised: velRef.current.normalised * 0.88,
        vx:         velRef.current.vx         * 0.88,
        vy:         velRef.current.vy         * 0.88,
      };
      tick(t => t + 1);
      rafId.current = requestAnimationFrame(decay);
    };

    window.addEventListener('mousemove', handleMove, { passive: true });
    rafId.current = requestAnimationFrame(decay);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [handleMove]);

  return velRef.current;
}
