import React, { createContext, useContext, useState, useEffect } from 'react';

const RoomStateContext = createContext(null);

const DEFAULT_STATE = {
  archive: { version: 1, scrollTop: 0, expandedId: null },
  map: { version: 1, cameraX: 0, cameraY: 0, zoom: 1, selectedClusterId: null },
  search: { version: 1, query: '', filters: {} }
};

export function RoomStateProvider({ children }) {
  const [roomStates, setRoomStates] = useState(DEFAULT_STATE);
  const [isVisible, setIsVisible] = useState(!document.hidden);

  // Central visibility listener
  useEffect(() => {
    const handleVisibility = () => {
      setIsVisible(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  const updateRoomState = React.useCallback((room, newState) => {
    setRoomStates((prev) => ({
      ...prev,
      [room]: {
        ...prev[room],
        ...newState,
        version: DEFAULT_STATE[room].version // keep version locked
      }
    }));
  }, []);

  const providerValue = React.useMemo(() => ({ roomStates, updateRoomState, isVisible }), [roomStates, updateRoomState, isVisible]);

  return (
    <RoomStateContext.Provider value={providerValue}>
      {children}
    </RoomStateContext.Provider>
  );
}

export function useRoomState() {
  const context = useContext(RoomStateContext);
  if (!context) {
    throw new Error('useRoomState must be used within a RoomStateProvider');
  }
  return context;
}
