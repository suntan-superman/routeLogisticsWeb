import React from 'react';
import { Text } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

const labels = {
  management: '🔒 Management only',
  internal: '👥 Internal — management and assigned technicians',
  customer: '📄 Customer-facing after management approval',
};

// The audience is fixed by the field's server projection, never by a mobile flag.
export default function NoteAudience({ audience = 'internal' }) {
  const { palette } = useTheme();
  return <Text accessibilityLabel={labels[audience] || labels.internal} style={{ color: palette.secondary, fontSize: 12, lineHeight: 18, marginBottom: 5 }}>
    {labels[audience] || labels.internal}
  </Text>;
}
