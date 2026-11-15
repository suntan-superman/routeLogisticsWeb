import React from 'react';
import { Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { GlassButton, GlassCard } from './Glass';

// Applying a suggestion only changes the draft. A separate Save validates it
// again; no client confirmation flag can bypass server address validation.
export default function AddressValidationNotice({ validation, onUseSuggested, disabled = false, editingEnabled = true }) {
  const { palette } = useTheme();
  if (!validation) return null;
  const suggestion = validation.status === 'confirmation-required' && typeof validation.suggestedAddress === 'string' && validation.suggestedAddress.trim();
  return <GlassCard>
    <View accessibilityRole="alert" style={{ gap: 10 }}>
      <Text style={{ color: palette.danger, fontWeight: '700' }}>{suggestion ? 'Review the suggested address' : validation.status === 'unavailable' ? 'Address verification is unavailable' : 'Address could not be verified'}</Text>
      <Text style={{ color: palette.text, lineHeight: 22 }}>{validation.message}</Text>
      {!!suggestion && <><Text style={{ color: palette.text, fontWeight: '600', lineHeight: 22 }}>{suggestion}</Text><Text style={{ color: palette.secondary, lineHeight: 21 }}>{editingEnabled ? 'Apply this suggestion if it is correct, then save again.' : 'Enable address editing to apply this suggestion, then save again.'}</Text></>}
    </View>
    {!!suggestion && onUseSuggested && <GlassButton secondary title="Use suggested address" disabled={disabled || !editingEnabled} onPress={() => { if (!disabled && editingEnabled) onUseSuggested(suggestion); }} />}
  </GlassCard>;
}
