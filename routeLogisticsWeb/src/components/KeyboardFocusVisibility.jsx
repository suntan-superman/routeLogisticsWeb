import { useEffect } from 'react';
import { installKeyboardFocusVisibility } from '../utils/keyboardFocusVisibility';

export default function KeyboardFocusVisibility() {
  useEffect(() => installKeyboardFocusVisibility(), []);
  return null;
}
