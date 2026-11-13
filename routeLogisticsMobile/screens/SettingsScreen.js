import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useTheme } from '../theme/ThemeProvider';
import { GlassScreen, GlassCard, GlassButton, GlassInput, IconButton } from '../components/Glass';
import ServiceSelectionScreen from './ServiceSelectionScreen';

export default function SettingsScreen({ navigation }) {
  const { user, permissions, updateUserProfile, signOut, refreshUser } = useAuth();
  const { language, changeLanguage } = useLanguage();
  const { palette, mode, changeMode } = useTheme();
  const [name, setName] = useState(user.name || ''), [phone, setPhone] = useState(user.phoneNumber || '');
  const [businessName, setBusinessName] = useState(user.businessName || ''), [address, setAddress] = useState(user.businessAddress || '');
  const [notifications, setNotifications] = useState({}), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [selectServices, setSelectServices] = useState(false);
  useEffect(() => { setName(user.name || ''); setPhone(user.phoneNumber || ''); setBusinessName(user.businessName || ''); setAddress(user.businessAddress || ''); setNotifications({ notificationsEnabled: user.notificationsEnabled ?? true, emailNotifications: user.emailNotifications ?? true, smsNotifications: user.smsNotifications ?? false }); }, [user]);
  const save = async extra => {
    setBusy(true); setMessage(''); setError('');
    try {
      const result = await updateUserProfile(extra || { name: name.trim(), phoneNumber: phone.trim(), ...notifications, ...(!user.companyId ? { businessName: businessName.trim(), address: address.trim() } : {}) });
      if (!result.success) throw new Error(result.error?.message || 'Could not save your preferences.');
      setMessage('Your changes are saved.');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const title = text => <Text style={{ fontSize: 13, fontWeight: '700', color: palette.secondary, letterSpacing: 1, textTransform: 'uppercase', marginTop: 8 }}>{text}</Text>;
  const detail = (label, value, icon) => <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}><Ionicons name={icon} size={20} color={palette.accent} /><View style={{ flex: 1, gap: 4 }}><Text style={{ color: palette.secondary, fontSize: 12 }}>{label}</Text><Text style={{ color: palette.text, fontSize: 15, lineHeight: 22 }}>{value || 'Not provided'}</Text></View></View>;
  if (selectServices && !user.companyId && permissions.canManage) return <ServiceSelectionScreen navigation={{ goBack: () => setSelectServices(false) }} initialServices={user.services} onServicesSelected={services => { setSelectServices(false); save({ services, serviceCategories: services }); }} />;
  return <GlassScreen>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingVertical: 12 }}><IconButton icon="arrow-back" label="Back to Home" onPress={navigation.goBack} /><Text style={{ color: palette.text, fontSize: 24, fontWeight: '700' }}>Settings</Text></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 22, paddingTop: 8, gap: 16, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
      <GlassCard><View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}><View style={{ width: 48, height: 48, backgroundColor: palette.input, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="person-outline" size={24} color={palette.accent} /></View><View style={{ flex: 1, gap: 4 }}><Text style={{ color: palette.text, fontSize: 18, fontWeight: '700' }}>{user.name}</Text><Text style={{ color: palette.secondary, fontSize: 13 }}>{user.email}</Text></View></View><Text style={{ color: palette.accent, textTransform: 'capitalize', fontWeight: '600' }}>{user.companyName || user.businessName || 'Personal workspace'} · {user.role || 'Independent business'}</Text></GlassCard>
      {title('Appearance')}
      <GlassCard><Text style={{ color: palette.secondary, lineHeight: 21 }}>Choose your appearance. Saved only on this device.</Text><View style={{ flexDirection: 'row', gap: 8 }}>{[['system','phone-portrait-outline','System'],['light','sunny-outline','Light'],['dark','moon-outline','Dark']].map(([value,icon,label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: mode === value }} disabled={busy} onPress={async () => { setBusy(true); try { await changeMode(value); } catch { setError('Could not save appearance on this device.'); } finally { setBusy(false); } }} style={{ flex: 1, alignItems: 'center', gap: 9, paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: mode === value ? palette.accent : palette.border, backgroundColor: mode === value ? palette.glow : palette.input }}><Ionicons name={icon} size={22} color={mode === value ? palette.accent : palette.secondary} /><Text style={{ color: mode === value ? palette.accent : palette.secondary, fontWeight: '600' }}>{label}</Text></Pressable>)}</View></GlassCard>
      {title(user.companyId ? 'Company' : 'Business')}
      <GlassCard>
        {user.companyId ? <>{detail('Business name', user.businessName, 'business-outline')}{detail('Business phone', user.businessPhone, 'call-outline')}{detail('Business address', user.businessAddress, 'location-outline')}<Text style={{ color: palette.secondary, fontSize: 12, lineHeight: 19 }}>Shared company information is managed by the company owner.</Text>{permissions.canEditCompany && <GlassButton secondary title="Open company settings on the web" icon="open-outline" onPress={() => Linking.openURL('https://route-logistics.com/company-setup').catch(() => setError('Could not open the browser.'))} />}</> : <><GlassInput label="Business name" value={businessName} onChangeText={setBusinessName} /><GlassInput label="Business address" value={address} onChangeText={setAddress} multiline /></>}
        <Text style={{ color: palette.text, fontWeight: '700', marginTop: 4 }}>Services · {user.services?.length || 0}</Text>
        {user.services?.length ? user.services.map(service => <View key={service} style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start' }}><Ionicons name="checkmark-circle-outline" size={18} color={palette.accent} /><Text style={{ flex: 1, color: palette.secondary, lineHeight: 21 }}>{service}</Text></View>) : <Text style={{ color: palette.secondary }}>No services have been configured.</Text>}
        {!user.companyId && permissions.canManage && <GlassButton secondary title="Manage services" icon="construct-outline" onPress={() => setSelectServices(true)} />}
        {user.companyId && <GlassButton secondary title="Refresh company information" icon="refresh-outline" disabled={busy} onPress={async () => { setBusy(true); const result = await refreshUser(); if (!result.success) setError(result.error?.message); setBusy(false); }} />}
      </GlassCard>
      {title('Your profile')}
      <GlassCard><GlassInput label="Display name" value={name} onChangeText={setName} editable={!busy} /><GlassInput label="Your phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" editable={!busy} /><Text style={{ color: palette.secondary, fontSize: 13 }}>Language</Text><View style={{ flexDirection: 'row', gap: 10 }}>{[['en','English'],['es','Español']].map(([value,label]) => <GlassButton key={value} secondary={language !== value} title={label} onPress={() => changeLanguage(value)} style={{ flex: 1 }} />)}</View></GlassCard>
      {title('Notification preferences')}
      <GlassCard>{[['notificationsEnabled','Push notifications'],['emailNotifications','Email notifications'],['smsNotifications','SMS notifications']].map(([key,label]) => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ color: palette.text, flex: 1 }}>{label}</Text><Switch accessibilityLabel={label} value={!!notifications[key]} disabled={busy} onValueChange={value => setNotifications(current => ({ ...current, [key]: value }))} trackColor={{ false: palette.border, true: palette.button }} thumbColor="#FFFFFF" /></View>)}</GlassCard>
      {!!error && <Text accessibilityRole="alert" style={{ color: palette.danger }}>{error}</Text>}{!!message && <Text accessibilityLiveRegion="polite" style={{ color: palette.accent }}>{message}</Text>}
      <GlassButton title="Save profile & preferences" busy={busy} onPress={() => save()} icon="checkmark" />
      <GlassButton secondary title="Sign out" icon="log-out-outline" disabled={busy} onPress={() => Alert.alert('Sign out?', 'Your appearance preference stays on this device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', onPress: signOut }])} />
    </ScrollView>
  </GlassScreen>;
}
