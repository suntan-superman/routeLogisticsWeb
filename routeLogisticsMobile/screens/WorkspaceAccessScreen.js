import React, { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { GlassScreen, GlassCard, GlassButton, GlassInput } from '../components/Glass';

export default function WorkspaceAccessScreen() {
  const { user, refreshUser, acceptInvitation, signOut } = useAuth();
  const { palette } = useTheme();
  const [link, setLink] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = user?.workspace?.status === 'pending';
  const run = async accept => {
    setBusy(true); setError('');
    try {
      const result = await (accept ? acceptInvitation(link) : refreshUser());
      if (!result.success) throw new Error(result.error?.message || 'Could not refresh your workspace.');
      if (accept) setLink('');
    } catch (failure) { setError(failure.message || 'Could not open your workspace.'); }
    finally { setBusy(false); }
  };
  return <GlassScreen><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}><ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 24, gap: 20, flexGrow: 1, justifyContent: 'center', maxWidth: 560, width: '100%', alignSelf: 'center' }}>
    <Ionicons name="people-outline" size={38} color={palette.accent} />
    <Text style={{ color: palette.text, fontSize: 28, fontWeight: '700' }}>{pending ? 'Join your company' : 'Company access needed'}</Text>
    <Text style={{ color: palette.secondary, lineHeight: 23 }}>Signed in as {user?.email}</Text>
    <GlassCard>
      {pending ? <>
        {(user.workspace.invitations || []).map(invite => <View key={invite.id} style={{ gap: 5 }}><Text style={{ color: palette.text, fontWeight: '700', fontSize: 18 }}>{invite.companyName}</Text><Text style={{ color: palette.accent, textTransform: 'capitalize' }}>{invite.role} · {invite.expired ? 'Invitation expired' : 'Acceptance pending'}</Text></View>)}
        <Text style={{ color: palette.secondary, lineHeight: 22 }}>Your email is verified. To access company jobs and services, open the “Join your team” invitation email and accept its invitation. The email verification link does not join the company.</Text>
        <Text style={{ color: palette.secondary, lineHeight: 22 }}>You can also copy the complete invitation link from that email and accept it here. Ask the owner for a new invitation if it has expired.</Text>
        <GlassInput label="Invitation link" placeholder="https://route-logistics.com/accept-invite…" value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} editable={!busy} />
        <GlassButton title="Accept invitation" busy={busy} disabled={!link.trim()} onPress={() => run(true)} />
      </> : <Text style={{ color: palette.secondary, lineHeight: 22 }}>Your company membership is unavailable. Ask the company owner to check your membership, then refresh. Company access will remain closed until it is verified.</Text>}
      {!!error && <Text accessibilityRole="alert" style={{ color: palette.danger }}>{error}</Text>}
      <GlassButton secondary title="I accepted on the web — refresh" disabled={busy} onPress={() => run(false)} />
    </GlassCard>
    <GlassButton secondary title="Sign out" onPress={signOut} disabled={busy} />
  </ScrollView></KeyboardAvoidingView></GlassScreen>;
}
