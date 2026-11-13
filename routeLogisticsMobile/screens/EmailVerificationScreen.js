import React, { useState } from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
export default function EmailVerificationScreen() {
  const { user, sendEmailVerification, refreshUser, signOut } = useAuth();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [sentAt, setSentAt] = useState(0);
  const run = async (resend) => {
    setBusy(true);
    try {
      if (resend) {
        if (Date.now() - sentAt < 60000) throw new Error('Please wait a minute before requesting another email.');
        const result = await sendEmailVerification();
        if (!result.success) throw new Error(result.error?.message || 'Could not send email.');
        setSentAt(Date.now()); setMessage('Verification email sent. Check your inbox and spam folder.');
      } else {
        const result = await refreshUser();
        setMessage(result.user?.emailVerified ? '' : 'Your email has not been verified yet.');
      }
    } catch (error) { setMessage(error.message); }
    finally { setBusy(false); }
  };
  return <View style={styles.page}><Text style={styles.title}>Verify your email</Text><Text>Open the verification link sent to {user?.email}, then return here.</Text><Button title="I verified my email" disabled={busy} onPress={() => run(false)} /><Button title="Resend verification email" disabled={busy} onPress={() => run(true)} /><Text accessibilityRole="alert">{message}</Text><Button title="Sign out" onPress={signOut} /></View>;
}
const styles = StyleSheet.create({ page: { flex: 1, justifyContent: 'center', padding: 28, gap: 18, backgroundColor: '#fff' }, title: { fontSize: 28, fontWeight: '700' } });
