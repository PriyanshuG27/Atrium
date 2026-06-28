import { useRef, useState, useEffect } from 'react';

export default function useScrollVelocity() {
  const velocityRef = useRef(0);
  const lastTime = useRef(performance.now());
  const rafId = useRef(null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const onWheel = (e) => {
      const now = performance.now();
      const dt = now - lastTime.current;
      if (dt > 0) velocityRef.current = Math.min(Math.abs(e.deltaY) / dt / 2, 1);
      lastTime.current = now;
    };
    const decay = () => {
      velocityRef.current *= 0.92;
      setTick(t => t + 1);
      rafId.current = requestAnimationFrame(decay);
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    rafId.current = requestAnimationFrame(decay);
    return () => {
      window.removeEventListener('wheel', onWheel);
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  return velocityRef.current;
}
