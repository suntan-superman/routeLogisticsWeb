import React, { useEffect, useRef, useState } from 'react';
import { Alert, Switch, Text, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { GlassButton, GlassCard, GlassInput } from './Glass';

export default function DeleteAccountSettings() {
  const { user, permissions, getAccountDeletionSummary, deleteAccount, signOut } = useAuth();
  const { palette } = useTheme();
  const [step, setStep] = useState('closed'), [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState(''), [discard, setDiscard] = useState(false);
  const [completionMessage, setCompletionMessage] = useState('');
  const [cleanupPending, setCleanupPending] = useState(false);
  const [error, setError] = useState(''), [recentLogin, setRecentLogin] = useState(false);
  const mounted = useRef(true), request = useRef(0), deleting = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; request.current++; }; }, []);
  const pendingOperations = Number(summary?.pendingOperations) || 0, pendingPhotos = Number(summary?.pendingPhotos) || 0;
  const pendingWork = pendingOperations + pendingPhotos;
  const blockers = (summary?.blockers || []).map(blocker => typeof blocker === 'string' ? blocker : blocker.message).filter(Boolean);
  if (summary?.requiresOwnershipTransfer && !blockers.length) blockers.push('Transfer company ownership on the web before deleting your account while other staff remain.');
  const canDelete = !busy && !loading && (cleanupPending || confirmation === 'DELETE' && (!pendingWork || discard) && !blockers.length);
  const close = () => {
    if (deleting.current) return;
    request.current++; setStep('closed'); setSummary(null); setLoading(false); setConfirmation(''); setDiscard(false); setError(''); setRecentLogin(false);
  };
  const review = async () => {
    const current = ++request.current;
    setStep('review'); setLoading(true); setSummary(null); setError(''); setRecentLogin(false); setConfirmation(''); setDiscard(false);
    try {
      const result = await getAccountDeletionSummary();
      if (mounted.current && current === request.current) setSummary(result);
    } catch (failure) {
      if (mounted.current && current === request.current) setError(failure.message || 'Could not check unsynced work. Retry the review before deleting your account.');
    } finally { if (mounted.current && current === request.current) setLoading(false); }
  };
  const submit = async () => {
    if (!canDelete || deleting.current) return;
    deleting.current = true; setBusy(true); setError(''); setRecentLogin(false);
    try {
      const result = await deleteAccount({ confirmation: 'DELETE', discardPendingWork: discard });
      if (!result?.success && result?.deletionRecorded && result?.localCleanupPending) {
        const message = result.error?.message || 'Your account deletion is confirmed, but this device could not remove its saved data. Retry device cleanup, or remove the app and its data before using another account.';
        if (mounted.current) { setCleanupPending(true); setError(message); }
        else Alert.alert('Device cleanup incomplete', message);
        return;
      }
      if (!result?.success) throw Object.assign(new Error(result?.error?.message || 'Your account could not be deleted. Try again.'), { code: result?.error?.code });
      const message = result.deletionPending ? 'Your deletion request was accepted. Your access is revoked and remaining cleanup will retry automatically.' : 'Your Route Logistics account was deleted.';
      // The successful context action signs out, so Settings may already have
      // unmounted. Show the result after it finishes without changing old state.
      Alert.alert(result.deletionPending ? 'Deletion requested' : 'Account deleted', message);
      if (mounted.current) { setCompletionMessage(message); setStep('deleted'); }
    } catch (failure) {
      if (mounted.current) {
        const requiresLogin = !cleanupPending && (/requires-recent-login|recent-login|recent-sign-in/.test(failure.code || '') || /sign (?:back )?in again|sign out and sign back in|recent sign.in/i.test(failure.message || ''));
        setRecentLogin(requiresLogin);
        setError(requiresLogin ? 'For security, sign out and sign back in, then return here to delete your account. Your account has not been deleted.' : failure.message || 'Your account could not be deleted. Check your connection and try again.');
      }
    } finally { deleting.current = false; if (mounted.current) setBusy(false); }
  };
  return <GlassCard>
    <Text style={{ color: palette.text, fontSize: 17, fontWeight: '700' }}>Delete account</Text>
    {step === 'deleted' ? <Text accessibilityLiveRegion="polite" style={{ color: palette.accent }}>{completionMessage}</Text> : <>
      <Text style={{ color: palette.secondary, lineHeight: 21 }}>Permanently delete your personal Route Logistics account and sign-in access on web and mobile.</Text>
      {step === 'closed' ? <GlassButton secondary title="Delete my account" icon="trash-outline" onPress={review} /> : <View style={{ gap: 12 }}>
        <Text style={{ color: palette.text, fontWeight: '700' }}>{cleanupPending ? 'Finish clearing this device' : step === 'review' ? 'Review account deletion' : 'Confirm permanent deletion'}</Text>
        <Text style={{ color: palette.secondary, lineHeight: 21 }}>Account: {user.email}</Text>
        <Text style={{ color: palette.secondary, lineHeight: 21 }}>Your personal profile, device registrations, location-sharing access, and Route Logistics login will be removed. Company-owned customers, jobs, invoices, photos, and service history remain with the company.</Text>
        {!cleanupPending && (user.role === 'owner' || permissions.canEditCompany) && <Text style={{ color: palette.secondary, lineHeight: 21 }}>If other staff remain in your company, transfer ownership in company settings on the web before deleting your account. The server checks ownership before deletion.</Text>}
        {loading && <Text accessibilityLiveRegion="polite" style={{ color: palette.secondary }}>Checking unsynced work on this device…</Text>}
        {summary && <Text accessibilityLiveRegion="polite" style={{ color: pendingWork ? palette.danger : palette.secondary, lineHeight: 21 }}>{pendingWork ? `${pendingOperations} unsynced edit${pendingOperations === 1 ? '' : 's'} and ${pendingPhotos} unsynced photo${pendingPhotos === 1 ? '' : 's'} on this device.` : 'No unsynced edits or photos found on this device.'}</Text>}
        {blockers.map(blocker => <Text key={blocker} accessibilityRole="alert" style={{ color: palette.danger, lineHeight: 21 }}>{blocker}</Text>)}
        {step === 'review' && summary && <GlassButton title="Continue to confirmation" disabled={loading || !!blockers.length} onPress={() => setStep('confirm')} />}
        {step === 'review' && !loading && !summary && <GlassButton secondary title="Retry account deletion review" onPress={review} />}
        {step === 'confirm' && !cleanupPending && <>
          <Text style={{ color: palette.danger, lineHeight: 21 }}>This is permanent. Your remaining unsynced work on this device will be removed and cannot be recovered.</Text>
          <GlassInput label="Type DELETE to confirm" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" autoCorrect={false} editable={!busy} />
          {!!pendingWork && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ color: palette.text, lineHeight: 21, flex: 1 }}>I agree to permanently discard the unsynced edits and photos on this device.</Text><Switch accessibilityLabel="Discard unsynced work on this device" value={discard} disabled={busy} onValueChange={setDiscard} trackColor={{ false: palette.border, true: palette.button }} thumbColor="#FFFFFF" /></View>}
          <GlassButton title="Permanently delete my account" icon="trash-outline" busy={busy} disabled={!canDelete} onPress={submit} />
        </>}
        {cleanupPending && <><Text style={{ color: palette.danger, lineHeight: 21 }}>Your deletion request is already accepted and account access is revoked. It cannot be cancelled. Retry only removes this account’s remaining saved data from this device.</Text><GlassButton title="Retry device cleanup" busy={busy} disabled={!canDelete} onPress={submit} /></>}
        {!!error && <Text accessibilityRole="alert" style={{ color: palette.danger, lineHeight: 21 }}>{error}</Text>}
        {!!error && step === 'confirm' && !recentLogin && !cleanupPending && <GlassButton secondary title="Review unsynced work again" disabled={busy} onPress={review} />}
        {recentLogin && <GlassButton secondary title="Sign out to verify your identity" disabled={busy} onPress={async () => { try { await signOut(); } catch { setError('Could not sign out. Try again before deleting your account.'); } }} />}
        {!cleanupPending && <GlassButton secondary title="Cancel account deletion" disabled={busy} onPress={close} />}
      </View>}
    </>}
  </GlassCard>;
}
