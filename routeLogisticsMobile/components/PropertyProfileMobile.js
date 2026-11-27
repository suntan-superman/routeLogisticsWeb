import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import NetInfo from '@react-native-community/netinfo';
import { auth } from '../constants/firebase';
import { cachedRead, propertyCacheAccountSegment, queuedWork, subscribeOffline } from '../services/offline';
import { callWorkspace } from '../services/workspaceApi';
import { useTheme } from '../theme/ThemeProvider';
import { Card, SectionHeader } from './MobileUI';
import { GlassButton } from './Glass';
import { tokensForDensity, touchTarget } from '../theme/designTokens';

const tabs = [
  { label: 'Overview', icon: 'home-outline' },
  { label: 'Alerts', icon: 'shield-checkmark-outline' },
  { label: 'Photos', icon: 'images-outline' },
  { label: 'History', icon: 'time-outline' },
  { label: 'Materials', icon: 'clipboard-outline' },
];
const readableDate = value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return value || 'Date not recorded';
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};
const proposalState = row => row.state === 'synced' ? 'Awaiting management approval' : row.state === 'failed' || row.state === 'conflict' ? row.uploadedAt ? 'Uploaded · proposal needs attention' : 'Upload needs attention' : row.uploadedAt ? 'Uploaded · proposal pending synchronization' : row.state === 'syncing' ? 'Upload pending' : 'Saved locally · upload pending';
const photoFile = (jobId, photoId) => `${FileSystem.documentDirectory}rl-property-refs/${propertyCacheAccountSegment(auth.currentUser?.uid)}/${jobId}/${photoId}.jpg`;
async function cachePhoto(jobId, photoId, loader) {
  const uri = photoFile(jobId, photoId);
  if ((await FileSystem.getInfoAsync(uri)).exists) return uri;
  const { dataUri } = await loader();
  if (typeof dataUri !== 'string' || !dataUri.startsWith('data:image/jpeg;base64,')) throw new Error('This reference photo is unavailable for offline use.');
  await FileSystem.makeDirectoryAsync(uri.slice(0, uri.lastIndexOf('/')), { intermediates: true });
  await FileSystem.writeAsStringAsync(uri, dataUri.split(',')[1], { encoding: FileSystem.EncodingType.Base64 });
  return uri;
}

export default function PropertyProfileMobile({ job }) {
  const { palette, tokens: suppliedTokens } = useTheme();
  const tokens = suppliedTokens || tokensForDensity();
  const propertyId = job?.servicePropertyId || job?.serviceProperty?.propertyId;
  const [tab, setTab] = useState('Overview'), [overview, setOverview] = useState(null), [rows, setRows] = useState([]), [next, setNext] = useState(null);
  const [images, setImages] = useState({}), [localProposals, setLocalProposals] = useState([]), [cached, setCached] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const context = `${job?.id || ''}:${job?.customerId || ''}:${propertyId || ''}`;
  const activeContext = useRef(context);
  activeContext.current = context;
  const input = { customerId: job?.customerId, propertyId, jobId: job?.id };
  const loadPhoto = photo => cachePhoto(job.id, photo.id, () => photo.status === 'approved'
    ? callWorkspace('rlPropertyProfile', { ...input, action: 'readPhoto', photoId: photo.id })
    : callWorkspace('rlJobPhoto', { action: 'read', photoId: photo.id }));
  const load = useCallback(async (selected = tab, cursor = null) => {
    if (!input.customerId || !propertyId) return;
    const requestContext = `${job.id}:${input.customerId}:${propertyId}`;
    setBusy(true); setError('');
    try {
      const action = selected === 'Overview' || selected === 'Alerts' ? 'overview' : selected === 'Photos' ? 'listPhotos' : selected === 'History' ? 'history' : 'materials';
      const name = `property:${job.id}:${propertyId}:${action}:${cursor || 'first'}`;
      const result = await cachedRead(name, () => callWorkspace('rlPropertyProfile', { ...input, action, ...(cursor ? { after: cursor } : {}) }));
      if (activeContext.current !== requestContext) return;
      const connectivity = await NetInfo.fetch();
      if (activeContext.current !== requestContext) return;
      setCached(connectivity.isConnected === false || connectivity.isInternetReachable === false);
      if (action === 'overview') {
        setOverview(result);
        // Cache only the first three explicitly authorized references. Never download the full gallery.
        for (const photo of (result.photos || []).slice(0, 3)) {
          try { const uri = await loadPhoto(photo); if (activeContext.current === requestContext) setImages(previous => ({ ...previous, [photo.id]: uri })); } catch { /* The profile remains usable when one image is unavailable. */ }
        }
      } else {
        setRows(previous => cursor ? [...previous, ...(result.rows || result.photos || [])] : result.rows || result.photos || []);
        setNext(result.next || null);
      }
      if (selected === 'Photos') {
        const saved = await queuedWork();
        if (activeContext.current === requestContext) setLocalProposals(saved.filter(row => row.kind === 'photo' && row.jobId === job.id && row.propertyId === propertyId && row.metadata?.referenceCategory && row.state !== 'discarded'));
        void Promise.allSettled((result.photos || []).filter(row => row.status === 'approved' || row.sourceJobId).slice(0, 6).map(async photo => {
          const uri = await loadPhoto(photo);
          if (activeContext.current === requestContext) setImages(previous => ({ ...previous, [photo.id]: uri }));
        })); // Captions remain available while thumbnails load or if one fails.
      }
    } catch (failure) { if (activeContext.current === requestContext) setError(failure.message || 'Property information is unavailable. Open this profile online to cache it.'); }
    finally { if (activeContext.current === requestContext) setBusy(false); }
  }, [job?.id, job?.customerId, propertyId, tab]);
  useEffect(() => { setOverview(null); setRows([]); setLocalProposals([]); setNext(null); setImages({}); setSelectedPhoto(null); setTab('Overview'); }, [job?.id, propertyId]);
  useEffect(() => { void load(tab); }, [tab, load]);
  useEffect(() => { let active = true; const unsubscribe = subscribeOffline(() => { if (tab === 'Photos') void queuedWork().then(rows => { if (active && activeContext.current === context) setLocalProposals(rows.filter(row => row.kind === 'photo' && row.jobId === job.id && row.propertyId === propertyId && row.metadata?.referenceCategory && row.state !== 'discarded')); }).catch(() => {}); }); return () => { active = false; unsubscribe(); }; }, [tab, context]);
  const body = (value, extra = {}) => <Text style={{ color: palette.text, ...tokens.type.body, ...extra }}>{value}</Text>;
  const muted = value => <Text style={{ color: palette.secondary, ...tokens.type.support }}>{value}</Text>;
  const itemStyle = { padding: tokens.spacing.card, gap: tokens.spacing.xs, borderRadius: tokens.radius.control, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.input };
  const empty = value => <View style={{ paddingVertical: tokens.spacing.sm }}>{muted(value)}</View>;
  const photoStatus = photo => photo.status === 'approved' ? 'Approved reference' : photo.status === 'archived' ? 'Archived reference' : photo.status === 'rejected' ? 'Rejected by management · original job photo retained' : 'Awaiting management approval';
  const photoCard = photo => <View key={photo.id} style={{ ...itemStyle, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: tokens.spacing.sm }}>
    {images[photo.id] ? <Pressable accessibilityRole="button" accessibilityLabel={`View ${photo.category} reference photograph`} onPress={() => setSelectedPhoto(current => current === photo.id ? null : photo.id)}><Image source={{ uri: images[photo.id] }} style={{ width: 76, height: 76, borderRadius: 9 }} /></Pressable> : <Pressable accessibilityRole={photo.status === 'approved' || photo.sourceJobId ? 'button' : 'image'} accessibilityLabel={photo.status === 'approved' || photo.sourceJobId ? `Load ${photo.category} reference photograph` : `${photo.category} reference thumbnail unavailable`} onPress={photo.status === 'approved' || photo.sourceJobId ? async () => { try { const uri = await loadPhoto(photo); setImages(previous => ({ ...previous, [photo.id]: uri })); } catch (failure) { setError(failure.message || 'This photo is unavailable.'); } } : undefined} style={{ width: 76, height: 76, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.surface }}><Ionicons name="image-outline" size={25} color={palette.secondary} /></Pressable>}
    <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 160, gap: 3 }}>{body(photo.category || 'Reference photo', { fontWeight: '700', textTransform: 'capitalize' })}{muted(photo.caption || 'No caption')}{<Text style={{ color: photo.status === 'rejected' ? palette.danger : palette.accent, ...tokens.type.support, fontWeight: '700' }}>{photoStatus(photo)}</Text>}</View>
  </View>;
  if (!propertyId || !job?.customerId) return <Card>{empty('This job has no saved property link. Historical work cannot be matched by address alone.')}</Card>;
  const property = overview?.property || job?.serviceProperty || {};
  const address = property.address || job?.address || 'Address unavailable';
  const syncLabel = error ? 'Property information needs attention' : cached ? 'Saved on device · may be older' : overview ? 'Current server information' : 'Checking property information';
  return <View testID="property-profile-content" style={{ gap: tokens.spacing.section }}>
    <Card><View style={{ gap: 5 }}>{body(property.label || 'Service property', { ...tokens.type.section })}{muted(address)}<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}><Ionicons name={error ? 'alert-circle-outline' : cached ? 'cloud-offline-outline' : 'checkmark-circle-outline'} size={tokens.icon.inline} color={error ? palette.danger : cached ? palette.secondary : palette.accent} /><Text accessibilityLiveRegion="polite" style={{ color: error ? palette.danger : palette.secondary, ...tokens.type.support, flexShrink: 1 }}>{syncLabel}</Text></View></View></Card>
    <ScrollView testID="property-profile-tabs" horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
      {tabs.map(({ label, icon }) => <Pressable key={label} testID={`property-tab-${label.toLowerCase()}`} accessibilityRole="tab" accessibilityLabel={label} accessibilityState={{ selected: tab === label }} onPress={() => { if (tab !== label) { setRows([]); setNext(null); setError(''); } setSelectedPhoto(null); setTab(label); }} style={{ minHeight: touchTarget(Platform.OS), minWidth: 66, paddingHorizontal: 5, paddingVertical: 5, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: tokens.radius.control, borderWidth: 1, borderColor: tab === label ? palette.accent : palette.border, backgroundColor: tab === label ? palette.glow : palette.surface }}><Ionicons name={icon} size={tokens.icon.inline} color={tab === label ? palette.accent : palette.secondary} /><Text numberOfLines={1} style={{ color: tab === label ? palette.accent : palette.text, fontSize: 11, fontWeight: tab === label ? '700' : '600' }}>{label}</Text></Pressable>)}
    </ScrollView>
    <Card>
      {tab !== 'Photos' && <SectionHeader title={tab === 'History' ? 'Service history' : tab === 'Materials' ? 'Material history' : tab === 'Alerts' ? 'Property alerts' : 'Property overview'} />}
      {busy && muted('Loading property information…')}{!!error && <><Text accessibilityRole="alert" style={{ color: palette.danger }}>{error}</Text><GlassButton secondary title="Retry property profile" onPress={() => load(tab)} /></>}
      {tab === 'Overview' && overview && <View style={{ gap: 8 }}>
        {body(`Customer: ${overview.customer?.name || 'Name unavailable'}`)}
        {!!property.accessInstructions && <View style={itemStyle}>{body('Access instructions', { fontWeight: '700' })}{body(property.accessInstructions)}</View>}
        {body(`Active plans: ${overview.plans?.length ? overview.plans.map(row => row.serviceType).join(', ') : 'None linked'}`)}
        {body(`Last service: ${overview.lastCompleted ? `${overview.lastCompleted.serviceType} · ${readableDate(overview.lastCompleted.date)}` : 'No linked completed visit'}`)}
        {body(`Upcoming: ${overview.upcoming?.length ? overview.upcoming.map(row => `${readableDate(row.date)} · ${row.serviceType}`).join('; ') : 'None linked'}`)}
        {!!overview.alerts?.some(row => row.severity === 'critical') && <Text style={{ color: palette.danger, fontWeight: '700' }}>Critical property alert — open Alerts before work</Text>}
      </View>}
      {tab === 'Alerts' && overview && <View style={{ gap: 8 }}>{overview.alerts?.length ? overview.alerts.map(row => <View key={row.id} style={{ ...itemStyle, borderColor: row.severity === 'critical' ? palette.danger : palette.border }}><Text style={{ color: row.severity === 'critical' ? palette.danger : palette.accent, fontSize: 12, fontWeight: '700' }}>{row.severity === 'critical' ? '⚠ Critical' : row.severity === 'important' ? 'Important' : 'Information'}</Text>{body(row.title, { fontWeight: '700' })}{body(row.description)}</View>) : empty('No active property alerts.')}</View>}
      {tab === 'Photos' && <View style={{ gap: tokens.spacing.section }}>
        <SectionHeader title="Approved references" />
        {rows.filter(photo => photo.status === 'approved').length ? rows.filter(photo => photo.status === 'approved').map(photoCard) : !busy && empty('No approved references yet.')}
        {selectedPhoto && images[selectedPhoto] && <Pressable accessibilityRole="button" accessibilityLabel="Close enlarged reference photograph" onPress={() => setSelectedPhoto(null)}><Image source={{ uri: images[selectedPhoto] }} resizeMode="contain" style={{ width: '100%', height: 260, borderRadius: 12, backgroundColor: palette.input }} /></Pressable>}
        <View testID="property-proposals-heading" style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: tokens.spacing.sm }}><Text accessibilityRole="header" style={{ color: palette.text, ...tokens.type.section, maxWidth: '100%' }}>Your proposals</Text><Pressable testID="refresh-proposal-status" accessibilityRole="button" accessibilityLabel="Refresh proposal status" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={() => load('Photos')} style={{ minWidth: touchTarget(Platform.OS), minHeight: touchTarget(Platform.OS), marginLeft: 'auto', alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radius.control, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.input }}>{busy ? <ActivityIndicator color={palette.accent} /> : <Ionicons name="refresh-outline" size={tokens.icon.inline} color={palette.accent} />}</Pressable></View>
        {rows.filter(photo => ['proposed', 'rejected'].includes(photo.status)).map(photoCard)}
        {localProposals.filter(row => !rows.some(photo => photo.id === `${row.attribution?.userId}_${row.id}`)).map(row => <View key={row.id} style={{ ...itemStyle, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: tokens.spacing.sm }}>{!!row.localUri && <Image source={{ uri: row.localUri }} style={{ width: 76, height: 76, borderRadius: 9 }} />}<View style={{ flexGrow: 1, flexShrink: 1, minWidth: 160, gap: 3 }}>{body(row.metadata.referenceCategory, { fontWeight: '700', textTransform: 'capitalize' })}{muted(row.metadata.referenceCaption || 'No caption')}{muted(proposalState(row))}{!!row.error && <Text style={{ color: palette.danger, ...tokens.type.support }}>{row.error}</Text>}</View></View>)}
        {!rows.some(photo => ['proposed', 'rejected'].includes(photo.status)) && !localProposals.some(row => !rows.some(photo => photo.id === `${row.attribution?.userId}_${row.id}`)) && !busy && empty('No proposals from you or this device yet.')}
        {rows.some(photo => photo.status === 'archived') && <><SectionHeader title="Archived references" />{rows.filter(photo => photo.status === 'archived').map(photoCard)}</>}
        {muted('To propose a reference, choose a category in this visit’s Photos and evidence, then capture a photo.')}
      </View>}
      {tab === 'History' && <View style={{ gap: 8 }}>{!rows.length && !busy && empty('No service visits linked to this property yet.')}{rows.map(row => <View key={row.id} style={itemStyle}>{muted(readableDate(row.date))}{body(row.serviceType || 'Service visit', { fontWeight: '700' })}{muted(row.outcome === 'completed' ? 'Completed' : row.outcome === 'quote_needed' ? 'Quote needed' : row.outcome || 'Status unavailable')}{!!row.notes && body(row.notes)}{row.hasEvidence && muted('Photo evidence available in the authorized work order')}</View>)}</View>}
      {tab === 'Materials' && <View style={{ gap: 8 }}>{!rows.length && !busy && empty('No material applications linked to this property yet.')}{rows.map(row => <View key={row.id} style={itemStyle}>{muted(readableDate(row.date))}{body(row.product || 'Material', { fontWeight: '700' })}{body(`${row.quantity || 'Quantity not recorded'} ${row.unit || ''}`.trim())}{muted([row.location, row.method].filter(Boolean).join(' · ') || 'Location and method not recorded')}</View>)}</View>}
      {!!next && <GlassButton secondary title="Load more" disabled={busy} onPress={() => load(tab, next)} />}
    </Card>
  </View>;
}
