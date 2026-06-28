import React, { createContext, useContext } from 'react';
import useFPSMonitor from '../hooks/useFPSMonitor';

/* ============================================================
   PerfContext — exposes { fps, lowPerf } to all rooms.

   All shader passes, particle counts, and blur effects
   should read lowPerf and simplify when it's true.
   ============================================================ */

const PerfContext = createContext({ fps: 60, lowPerf: false });

export function PerfProvider({ children }) {
  const { fps, lowPerf } = useFPSMonitor();

  return (
    <PerfContext.Provider value={{ fps, lowPerf }}>
      {children}
    </PerfContext.Provider>
  );
}

export function usePerf() {
  return useContext(PerfContext);
}
