import { createContext, useContext } from 'react';

export const KeyboardScrollContext = createContext(null);
export const useKeyboardScroll = () => useContext(KeyboardScrollContext);
