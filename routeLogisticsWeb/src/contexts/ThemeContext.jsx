import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { createThemeStore } from '../services/theme';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [store] = useState(() => createThemeStore());
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => store.start(), [store]);
  const value = useMemo(() => ({ ...snapshot, setPreference: store.setPreference }), [snapshot, store]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('ThemeProvider is required for appearance controls.');
  return context;
}
