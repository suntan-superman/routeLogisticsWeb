import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, Alert, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { GlassScreen, GlassCard, GlassButton, GlassInput } from '../components/Glass';
import ServiceSelectionScreen from './ServiceSelectionScreen';
import { ScreenHeader } from '../components/MobileUI';
import { formatPhone, displayPhone } from '../services/phoneFormat';
import NativePushSettings from '../components/NativePushSettings';
import LegalAccountSettings from '../components/LegalAccountSettings';
import { useJobResourceRefresh } from '../services/useJobResources';
import { readWorkspace } from '../services/workspaceApi';
import { companyProfile } from '../services/workspacePolicy';

export default function SettingsScreen({ navigation, embedded = false, active = true }) {
  const { user: account, permissions, updateUserProfile, signOut } = useAuth();
  const metadata = useJobResourceRefresh('company-profile', account.companyId, async () => companyProfile((await readWorkspace('company')).company), { enabled: active && !!account.companyId, interval: 60000 });
  const user = metadata.data && account.companyId ? { ...account, ...metadata.data } : account;
  const { palette, mode, changeMode } = useTheme();
  const [name, setName] = useState(user.name || ''), [phone, setPhone] = useState(displayPhone(user.phoneNumber));
  const [businessName, setBusinessName] = useState(user.businessName || ''), [address, setAddress] = useState(user.businessAddress || '');
  const [notifications, setNotifications] = useState({}), [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const [selectServices, setSelectServices] = useState(false);
  const [servicesExpanded, setServicesExpanded] = useState(false);
  const [notificationsExpanded, setNotificationsExpanded] = useState(false);
  const [notificationsVisited, setNotificationsVisited] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { if (dirty) return; setName(account.name || ''); setPhone(displayPhone(account.phoneNumber)); setBusinessName(user.businessName || ''); setAddress(user.businessAddress || ''); setNotifications({ emailNotifications: account.emailNotifications ?? true, smsNotifications: account.smsNotifications ?? false }); }, [account, metadata.data, dirty]);
  const save = async extra => {
    setBusy(true); setMessage(''); setError('');
    try {
      const result = await updateUserProfile(extra || { name: name.trim(), phoneNumber: phone.trim(), ...notifications, ...(!user.companyId ? { businessName: businessName.trim(), address: address.trim() } : {}) });
      if (!result.success) throw new Error(result.error?.message || 'Could not save your preferences.');
      if (!extra) setDirty(false);
      setMessage('Your changes are saved.');
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  };
  const title = text => <Text style={{ fontSize: 13, fontWeight: '700', color: palette.secondary, letterSpacing: 1, textTransform: 'uppercase', marginTop: 8 }}>{text}</Text>;
  const detail = (label, value, icon) => <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}><Ionicons name={icon} size={20} color={palette.accent} /><View style={{ flex: 1, gap: 4 }}><Text style={{ color: palette.secondary, fontSize: 12 }}>{label}</Text><Text style={{ color: palette.text, fontSize: 15, lineHeight: 22 }}>{value || 'Not provided'}</Text></View></View>;
  const safeLink = async (url, label) => {
    setError('');
    try { await Linking.openURL(url); }
    catch { setError(`Could not open ${label}. Try again, or open ${url} in your browser.`); }
  };
  const sectionToggle = (label, expanded, onPress, count) => <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded }} onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 }}><Text style={{ color: palette.text, fontWeight: '700', flex: 1 }}>{label}{count === undefined ? '' : ` · ${count}`}</Text><Ionicons name={expanded ? 'chevron-up-outline' : 'chevron-down-outline'} size={20} color={palette.secondary} /></Pressable>;
  if (selectServices && !user.companyId && permissions.canManage) return <ServiceSelectionScreen navigation={{ goBack: () => setSelectServices(false) }} initialServices={user.services} onServicesSelected={services => { setSelectServices(false); save({ services, serviceCategories: services }); }} />;
  return <GlassScreen edges={embedded ? [] : undefined}>
    <ScreenHeader title="Settings" subtitle={user.companyName || user.businessName || 'Your preferences'} onBack={embedded ? undefined : navigation.goBack} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 22, paddingTop: 8, gap: 16, maxWidth: 680, width: '100%', alignSelf: 'center' }}>
      <GlassCard><View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}><View style={{ width: 48, height: 48, backgroundColor: palette.input, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="person-outline" size={24} color={palette.accent} /></View><View style={{ flex: 1, gap: 4 }}><Text style={{ color: palette.text, fontSize: 18, fontWeight: '700' }}>{user.name}</Text><Text style={{ color: palette.secondary, fontSize: 13 }}>{user.email}</Text></View></View><Text style={{ color: palette.accent, textTransform: 'capitalize', fontWeight: '600' }}>{user.companyName || user.businessName || 'Personal workspace'} · {user.role || 'Independent business'}</Text></GlassCard>
      {title('Appearance')}
      <GlassCard><Text style={{ color: palette.secondary, lineHeight: 21 }}>Choose your appearance. Saved only on this device.</Text><View style={{ flexDirection: 'row', gap: 8 }}>{[['system','phone-portrait-outline','System'],['light','sunny-outline','Light'],['dark','moon-outline','Dark']].map(([value,icon,label]) => <Pressable key={value} accessibilityRole="radio" accessibilityState={{ checked: mode === value }} disabled={busy} onPress={async () => { setBusy(true); try { await changeMode(value); } catch { setError('Could not save appearance on this device.'); } finally { setBusy(false); } }} style={{ flex: 1, alignItems: 'center', gap: 9, paddingVertical: 16, borderRadius: 16, borderWidth: 1, borderColor: mode === value ? palette.accent : palette.border, backgroundColor: mode === value ? palette.glow : palette.input }}><Ionicons name={icon} size={22} color={mode === value ? palette.accent : palette.secondary} /><Text style={{ color: mode === value ? palette.accent : palette.secondary, fontWeight: '600' }}>{label}</Text></Pressable>)}</View></GlassCard>
      {title(user.companyId ? 'Company' : 'Business')}
      <GlassCard>
        {user.companyId ? <>{detail('Business name', user.businessName, 'business-outline')}{detail('Business phone', displayPhone(user.businessPhone), 'call-outline')}{detail('Business address', user.businessAddress, 'location-outline')}<Text style={{ color: palette.secondary, fontSize: 12, lineHeight: 19 }}>Shared company information is managed by the company owner.</Text>{permissions.canEditCompany && <GlassButton secondary title="Open company settings on the web" icon="open-outline" onPress={() => safeLink('https://route-logistics.com/company-setup', 'company settings')} />}</> : <><GlassInput label="Business name" value={businessName} onChangeText={value => { setDirty(true); setBusinessName(value); }} /><GlassInput label="Business address" value={address} onChangeText={value => { setDirty(true); setAddress(value); }} multiline /></>}
        {sectionToggle('Services', servicesExpanded, () => setServicesExpanded(value => !value), user.services?.length || 0)}
        {servicesExpanded && <View style={{ gap: 12 }}>{user.services?.length ? user.services.map(service => <View key={service} style={{ flexDirection: 'row', gap: 9, alignItems: 'flex-start' }}><Ionicons name="checkmark-circle-outline" size={18} color={palette.accent} /><Text style={{ flex: 1, color: palette.secondary, lineHeight: 21 }}>{service}</Text></View>) : <Text style={{ color: palette.secondary }}>No services have been configured.</Text>}
        {!user.companyId && permissions.canManage && <GlassButton secondary title="Manage services" icon="construct-outline" onPress={() => setSelectServices(true)} />}</View>}
        {user.companyId && <GlassButton secondary title="Refresh company information" icon="refresh-outline" disabled={busy} onPress={async () => { setBusy(true); try { const result = await metadata.refetch(); if (result?.error) setError(result.error.message); } finally { setBusy(false); } }} />}
      </GlassCard>
      {title('Your profile')}
      <GlassCard><GlassInput label="Display name" value={name} onChangeText={value => { setDirty(true); setName(value); }} editable={!busy} /><GlassInput label="Your phone number" value={phone} onChangeText={value => { setDirty(true); setPhone(formatPhone(value)); }} keyboardType="phone-pad" autoComplete="tel" textContentType="telephoneNumber" placeholder="(661) 555-0123" editable={!busy} /></GlassCard>
      <GlassCard>{sectionToggle('Notification preferences', notificationsExpanded, () => { setNotificationsVisited(true); setNotificationsExpanded(value => !value); })}</GlassCard>
      {notificationsVisited && <View style={{ display: notificationsExpanded ? 'flex' : 'none', gap: 16 }} accessibilityElementsHidden={!notificationsExpanded} importantForAccessibility={notificationsExpanded ? 'auto' : 'no-hide-descendants'}>
        <NativePushSettings />
        <GlassCard>{[['emailNotifications','Email notifications'],['smsNotifications','SMS notifications']].map(([key,label]) => <View key={key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text style={{ color: palette.text, flex: 1 }}>{label}</Text><Switch accessibilityLabel={label} value={!!notifications[key]} disabled={busy} onValueChange={value => { setDirty(true); setNotifications(current => ({ ...current, [key]: value })); }} trackColor={{ false: palette.border, true: palette.button }} thumbColor="#FFFFFF" /></View>)}</GlassCard>
      </View>}
      {!!error && <Text accessibilityRole="alert" style={{ color: palette.danger }}>{error}</Text>}{!!message && <Text accessibilityLiveRegion="polite" style={{ color: palette.accent }}>{message}</Text>}
      {!!metadata.error && <Text accessibilityRole="alert" style={{ color: palette.danger }}>Company information could not refresh. {metadata.error.message}</Text>}
      <GlassButton title="Save profile & preferences" busy={busy} onPress={() => save()} icon="checkmark" />
      <LegalAccountSettings />
      <GlassButton secondary title="Sign out" icon="log-out-outline" disabled={busy} onPress={() => Alert.alert('Sign out?', 'Your appearance preference stays on this device.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', onPress: signOut }])} />
    </ScrollView>
  </GlassScreen>;
}
