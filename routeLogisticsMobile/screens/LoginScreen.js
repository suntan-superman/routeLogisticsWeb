import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { GlassScreen, GlassCard, GlassButton, GlassInput, IconButton } from '../components/Glass';

const EMAIL_KEY = 'rl-login-email-v1';
export default function LoginScreen({ navigation }) {
  const { signIn, requestStaffCode, signInWithCode, resetPassword } = useAuth();
  const { palette, isDark, changeMode } = useTheme();
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [code, setCode] = useState('');
  const [mode, setMode] = useState('password'), [showPassword, setShowPassword] = useState(false), [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [challenge, setChallenge] = useState(null), [resendAt, setResendAt] = useState(0), [clock, setClock] = useState(Date.now());
  useEffect(() => { let mounted = true; AsyncStorage.getItem(EMAIL_KEY).then(value => { if (mounted && value) { setEmail(value); setRemember(true); } }).catch(() => {}); return () => { mounted = false; }; }, []);
  useEffect(() => { if (!challenge) return; const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, [challenge]);
  const switchMode = next => { setMode(next); setPassword(''); setCode(''); setChallenge(null); setError(''); setNotice(''); };
  const rememberEmail = async () => { if (remember) await AsyncStorage.setItem(EMAIL_KEY, email.trim().toLowerCase()); else await AsyncStorage.removeItem(EMAIL_KEY); };
  const sendCode = async () => {
    const result = await requestStaffCode(email);
    setChallenge(result.challengeId); setCode(''); setNotice(result.message);
    setResendAt(Date.now() + 60000); setClock(Date.now());
  };
  const run = async (resend = false) => {
    if (busy) return;
    setError(''); setNotice('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter your email address.'); return; }
    if (mode === 'password' && !password) { setError('Enter your password.'); return; }
    if (mode === 'code' && challenge && !resend && !/^\d{6}$/.test(code)) { setError('Enter the six-digit code from your email.'); return; }
    setBusy(true);
    try {
      await rememberEmail();
      if (mode === 'reset') {
        const result = await resetPassword(email.trim());
        if (!result.success) throw new Error(result.error?.message);
        setNotice('If this account supports password sign-in, a reset link will arrive shortly. Check your inbox and junk folder.');
      } else if (mode === 'code' && (!challenge || resend)) await sendCode();
      else {
        const result = mode === 'code' ? await signInWithCode(challenge, code) : await signIn(email, password);
        if (!result.success) throw new Error(result.error?.message || 'Unable to sign in.');
        setPassword(''); setCode('');
      }
    } catch (failure) { setError(failure.code === 'functions/internal' ? 'Sign-in is temporarily unavailable. Please try again.' : failure.message || 'Unable to sign in.'); }
    finally { setBusy(false); }
  };
  const remaining = Math.max(0, Math.ceil((resendAt - clock) / 1000));
  return <GlassScreen><KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.page}>
      <View style={styles.top}><View style={[styles.mark, { backgroundColor: palette.button }]}><Ionicons name="navigate" size={25} color="#FFFFFF" /></View>
        <Text style={[styles.brand, { color: palette.text }]}>Route Logistics</Text>
        <IconButton icon={isDark ? 'sunny-outline' : 'moon-outline'} label={isDark ? 'Use light appearance' : 'Use dark appearance'} onPress={() => changeMode(isDark ? 'light' : 'dark').catch(() => setError('Could not save appearance on this device.'))} />
      </View>
      <View style={{ gap: 9, marginTop: 32, marginBottom: 26 }}><Text style={[styles.title, { color: palette.text }]}>Your day, in order.</Text><Text style={[styles.description, { color: palette.secondary }]}>Sign in to your team, your schedule, and the work ahead.</Text></View>
      <GlassCard contentStyle={{ gap: 20 }}>
        <Text style={{ fontSize: 21, fontWeight: '700', color: palette.text }}>{mode === 'reset' ? 'Reset your password' : 'Welcome back'}</Text>
        {mode !== 'reset' && <View style={[styles.segment, { backgroundColor: palette.input }]}>{[['password','Password'],['code','Email code']].map(([value,label]) => <Pressable key={value} accessibilityRole="tab" accessibilityState={{ selected: mode === value }} disabled={busy} onPress={() => switchMode(value)} style={[styles.tab, mode === value && { backgroundColor: palette.surface }]}><Text style={{ color: mode === value ? palette.accent : palette.secondary, fontWeight: '600' }}>{label}</Text></Pressable>)}</View>}
        <GlassInput label="Email address" value={email} onChangeText={setEmail} placeholder="you@company.com" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" textContentType="emailAddress" editable={!busy && !challenge} />
        {mode === 'password' && <GlassInput label="Password" value={password} onChangeText={setPassword} placeholder="Your password" secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete="current-password" textContentType="password" editable={!busy} onSubmitEditing={() => run()} right={<Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'} onPress={() => setShowPassword(value => !value)} style={{ padding: 14 }}><Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={21} color={palette.secondary} /></Pressable>} />}
        {mode === 'code' && !challenge && <Text style={[styles.hint, { color: palette.secondary }]}>We’ll email a six-digit code to your verified account. This signs you in; company invitations must still be accepted separately.</Text>}
        {mode === 'code' && challenge && <><GlassInput label="Six-digit sign-in code" value={code} onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={6} editable={!busy} style={{ letterSpacing: 8, fontSize: 22 }} /><Text style={[styles.hint, { color: palette.secondary }]}>Use the newest code. It expires in 10 minutes. Delivery may take a minute.</Text></>}
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: remember }} disabled={busy} onPress={() => { setRemember(value => !value); if (remember) AsyncStorage.removeItem(EMAIL_KEY).catch(() => setError('Could not remove the saved email.')); }} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 36 }}><Ionicons name={remember ? 'checkbox' : 'square-outline'} color={palette.accent} size={23} /><Text style={{ color: palette.secondary }}>Remember my email on this device</Text></Pressable>
        {!!error && <Text accessibilityRole="alert" style={[styles.hint, { color: palette.danger }]}>{error}</Text>}
        {!!notice && <Text accessibilityLiveRegion="polite" style={[styles.hint, { color: palette.accent }]}>{notice}</Text>}
        <GlassButton title={mode === 'reset' ? 'Send reset link' : mode === 'code' && !challenge ? 'Email a sign-in code' : 'Sign in'} busy={busy} onPress={() => run()} icon="arrow-forward" />
        {mode === 'code' && challenge && <View style={{ gap: 10 }}><GlassButton secondary title={remaining ? `Resend in ${remaining}s` : 'Resend code'} disabled={busy || remaining > 0} onPress={() => run(true)} /><GlassButton secondary title="Use a different email" disabled={busy} onPress={() => { setChallenge(null); setCode(''); setNotice(''); }} /></View>}
        <Pressable disabled={busy} onPress={() => switchMode(mode === 'reset' ? 'password' : 'reset')} style={{ alignItems: 'center', padding: 5 }}><Text style={{ color: palette.accent, fontWeight: '600' }}>{mode === 'reset' ? 'Back to sign in' : 'Forgot password?'}</Text></Pressable>
      </GlassCard>
      <Pressable disabled={busy} onPress={() => navigation.navigate('signup')} style={{ paddingVertical: 22 }}><Text style={{ color: palette.secondary, textAlign: 'center' }}>New to Route Logistics? <Text style={{ color: palette.accent, fontWeight: '700' }}>Create an account</Text></Text></Pressable>
    </ScrollView>
  </KeyboardAvoidingView></GlassScreen>;
}
const styles = StyleSheet.create({ page: { padding: 22, paddingBottom: 28, width: '100%', maxWidth: 560, alignSelf: 'center', flexGrow: 1 }, top: { flexDirection: 'row', alignItems: 'center', gap: 12 }, mark: { width: 43, height: 43, borderRadius: 15, alignItems: 'center', justifyContent: 'center' }, brand: { fontSize: 19, fontWeight: '700', flex: 1 }, title: { fontSize: 32, fontWeight: '700', letterSpacing: -0.8 }, description: { fontSize: 16, lineHeight: 24 }, hint: { fontSize: 13, lineHeight: 20 }, segment: { flexDirection: 'row', padding: 4, borderRadius: 13, gap: 4 }, tab: { flex: 1, alignItems: 'center', borderRadius: 10, paddingVertical: 11 } });
