import { useRef, useState, useEffect, useCallback } from 'react';

/* ============================================================
   useFPSMonitor — rolling 60-frame average FPS.

   Returns:
     { fps, lowPerf }
   where lowPerf = true when avg FPS < 45.

   Used by PerfContext to gate expensive effects.
   ============================================================ */

const SAMPLE_SIZE = 60;
const LOW_PERF_THRESHOLD = 45;

export default function useFPSMonitor() {
  const samples   = useRef([]);
  const lastTime  = useRef(performance.now());
  const rafId     = useRef(null);
  const [fps, setFps] = useState(60);

  useEffect(() => {
    const measure = (now) => {
      const dt = now - lastTime.current;
      lastTime.current = now;

      if (dt > 0 && dt < 500) { // ignore tab-switch spikes
        samples.current.push(1000 / dt);
        if (samples.current.length > SAMPLE_SIZE) {
          samples.current.shift();
        }
        const avg = samples.current.reduce((a, b) => a + b, 0) / samples.current.length;
        setFps(Math.round(avg));
      }

      rafId.current = requestAnimationFrame(measure);
    };

    rafId.current = requestAnimationFrame(measure);
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, []);

  return { fps, lowPerf: fps < LOW_PERF_THRESHOLD };
}
