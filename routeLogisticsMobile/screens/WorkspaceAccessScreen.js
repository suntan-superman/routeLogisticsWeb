import React, { useState } from 'react';
import { View, Text, ScrollView, KeyboardAvoidingView, Platform, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { GlassScreen, GlassCard, GlassButton, GlassInput } from '../components/Glass';
import LegalAccountSettings from '../components/LegalAccountSettings';

export default function WorkspaceAccessScreen() {
  const { user, accessStatus, refreshUser, acceptInvitation, signOut } = useAuth();
  const { palette } = useTheme();
  const [link, setLink] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const pending = user?.workspace?.status === 'pending';
  const unassociated = user?.workspace?.status === 'unassociated';
  const revoked = accessStatus === 'revoked';
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
    <Text style={{ color: palette.text, fontSize: 28, fontWeight: '700' }}>{pending ? 'Join your company' : unassociated ? "Your account is ready. You aren't connected to a company yet." : revoked ? 'Company access removed' : 'Company access needed'}</Text>
    <Text style={{ color: palette.secondary, lineHeight: 23 }}>Signed in as {user?.email}</Text>
    <GlassCard>
      {pending || unassociated ? <>
        {(user.workspace.invitations || []).map(invite => <View key={invite.id} style={{ gap: 5 }}><Text style={{ color: palette.text, fontWeight: '700', fontSize: 18 }}>{invite.companyName}</Text><Text style={{ color: palette.accent, textTransform: 'capitalize' }}>{invite.role} · {invite.expired ? 'Invitation expired' : 'Acceptance pending'}</Text></View>)}
        <Text style={{ color: palette.secondary, lineHeight: 22 }}>{pending ? 'Your email is verified. Open the “Join your team” invitation email and accept its invitation. Email verification alone does not join a company.' : 'Ask an existing company owner or manager to invite this verified email. Workside Software can authorize a new company through the web setup.'}</Text>
        <Text style={{ color: palette.secondary, lineHeight: 22 }}>Paste the complete invitation link below. Only an invitation for this verified email can grant company access.</Text>
        <GlassInput label="Invitation link" placeholder="https://route-logistics.com/accept-invite…" value={link} onChangeText={setLink} autoCapitalize="none" autoCorrect={false} editable={!busy} />
        <GlassButton title="Accept invitation" busy={busy} disabled={!link.trim()} onPress={() => run(true)} />
      </> : <Text style={{ color: palette.secondary, lineHeight: 22 }}>{revoked ? 'Your company membership was checked online and no longer grants access. Ask the company owner to review it. Your saved work and photos remain on this device.' : 'Your company membership is unavailable. Ask the company owner to check your membership, then refresh. Company access will remain closed until it is verified.'}</Text>}
      {!!error && <Text accessibilityRole="alert" style={{ color: palette.danger }}>{error}</Text>}
      <GlassButton secondary title={pending ? 'I accepted on the web — refresh' : 'Check company access'} disabled={busy} onPress={() => run(false)} />
      {unassociated && <GlassButton secondary title="Request new company access on the web" onPress={() => Linking.openURL('https://route-logistics.com/onboarding').catch(() => setError('Open route-logistics.com/onboarding in your browser.'))} />}
    </GlassCard>
    <GlassButton secondary title="Sign out" onPress={signOut} disabled={busy} />
    <LegalAccountSettings />
  </ScrollView></KeyboardAvoidingView></GlassScreen>;
}
