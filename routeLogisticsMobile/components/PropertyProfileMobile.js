import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Image, Text, View } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import NetInfo from '@react-native-community/netinfo';
import { auth } from '../constants/firebase';
import { cachedRead, propertyCacheAccountSegment, queuedWork, subscribeOffline } from '../services/offline';
import { callWorkspace } from '../services/workspaceApi';
import { useTheme } from '../theme/ThemeProvider';
import { Card, SectionHeader } from './MobileUI';
import { GlassButton } from './Glass';

const tabs = ['Overview', 'Alerts', 'Photos', 'Service History', 'Material History'];
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
  const { palette } = useTheme();
  const propertyId = job?.servicePropertyId || job?.serviceProperty?.propertyId;
  const [tab, setTab] = useState('Overview'), [overview, setOverview] = useState(null), [rows, setRows] = useState([]), [next, setNext] = useState(null);
  const [images, setImages] = useState({}), [localProposals, setLocalProposals] = useState([]), [cached, setCached] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const context = `${job?.id || ''}:${job?.customerId || ''}:${propertyId || ''}`;
  const activeContext = useRef(context);
  activeContext.current = context;
  const input = { customerId: job?.customerId, propertyId, jobId: job?.id };
  const load = useCallback(async (selected = tab, cursor = null) => {
    if (!input.customerId || !propertyId) return;
    const requestContext = `${job.id}:${input.customerId}:${propertyId}`;
    setBusy(true); setError('');
    try {
      const action = selected === 'Overview' || selected === 'Alerts' ? 'overview' : selected === 'Photos' ? 'listPhotos' : selected === 'Service History' ? 'history' : 'materials';
      const name = `property:${job.id}:${propertyId}:${action}:${cursor || 'first'}`;
      const result = await cachedRead(name, () => callWorkspace('rlPropertyProfile', { ...input, action, ...(cursor ? { after: cursor } : {}) }));
      if (activeContext.current !== requestContext) return;
      const connectivity = await NetInfo.fetch();
      if (activeContext.current !== requestContext) return;
      setCached(connectivity.isConnected === false);
      if (action === 'overview') {
        setOverview(result);
        // Cache only the first three explicitly authorized references. Never download the full gallery.
        for (const photo of (result.photos || []).slice(0, 3)) {
          try { const uri = await cachePhoto(job.id, photo.id, () => callWorkspace('rlPropertyProfile', { ...input, action: 'readPhoto', photoId: photo.id })); if (activeContext.current === requestContext) setImages(previous => ({ ...previous, [photo.id]: uri })); } catch { /* The profile remains usable when one image is unavailable. */ }
        }
      } else {
        setRows(previous => cursor ? [...previous, ...(result.rows || result.photos || [])] : result.rows || result.photos || []);
        setNext(result.next || null);
      }
      if (selected === 'Photos') { const saved = await queuedWork(); if (activeContext.current === requestContext) setLocalProposals(saved.filter(row => row.kind === 'photo' && row.jobId === job.id && row.propertyId === propertyId && row.metadata?.referenceCategory && row.state !== 'discarded')); }
    } catch (failure) { if (activeContext.current === requestContext) setError(failure.message || 'Property information is unavailable. Open this profile online to cache it.'); }
    finally { if (activeContext.current === requestContext) setBusy(false); }
  }, [job?.id, job?.customerId, propertyId, tab]);
  useEffect(() => { setOverview(null); setRows([]); setLocalProposals([]); setNext(null); setImages({}); setTab('Overview'); }, [job?.id, propertyId]);
  useEffect(() => { void load(tab); }, [tab, load]);
  useEffect(() => { let active = true; const unsubscribe = subscribeOffline(() => { if (tab === 'Photos') void queuedWork().then(rows => { if (active && activeContext.current === context) setLocalProposals(rows.filter(row => row.kind === 'photo' && row.jobId === job.id && row.propertyId === propertyId && row.metadata?.referenceCategory && row.state !== 'discarded')); }).catch(() => {}); }); return () => { active = false; unsubscribe(); }; }, [tab, context]);
  const line = (key, value) => <Text key={key} style={{ color: palette.text, fontSize: 14, lineHeight: 22 }}>{value}</Text>;
  if (!propertyId || !job?.customerId) return <Card><SectionHeader title="Property Profile" /><Text style={{ color: palette.secondary }}>This job has no stable saved property link. Historical work cannot be matched by address alone.</Text></Card>;
  return <Card><SectionHeader title="Property Profile" subtitle="Internal details for this assigned work order." />
    <Text style={{ color: palette.secondary }}>{cached ? 'Saved on this device · information may be older' : 'Current server information'}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{tabs.map(name => <GlassButton key={name} title={name} secondary={tab !== name} onPress={() => setTab(name)} />)}</View>
    {busy && line('loading', 'Loading property information…')}{!!error && <><Text accessibilityRole="alert" style={{ color: palette.danger }}>{error}</Text><GlassButton secondary title="Retry property profile" onPress={() => load(tab)} /></>}
    {(tab === 'Overview' || tab === 'Alerts') && overview && <View style={{ gap: 7 }}>
      {tab === 'Overview' && <>{line('property', `${overview.property.label || 'Property'} · ${overview.property.address}`)}{line('customer', `Customer: ${overview.customer.name || 'Name unavailable'}`)}{!!overview.property.accessInstructions && line('access', `Access instructions: ${overview.property.accessInstructions}`)}{line('plans', `Active plans: ${overview.plans.length ? overview.plans.map(row => row.serviceType).join(', ') : 'None linked'}`)}{line('last', `Last service: ${overview.lastCompleted ? `${overview.lastCompleted.serviceType} · ${overview.lastCompleted.date}` : 'No explicitly linked visit'}`)}{line('next', `Upcoming: ${overview.upcoming.length ? overview.upcoming.map(row => `${row.date} ${row.serviceType}`).join('; ') : 'None linked'}`)}</>}
      {overview.alerts.filter(row => ['critical', 'important'].includes(row.severity)).map(row => line(row.id, `${row.severity === 'critical' ? '⚠ Critical' : 'Important'} · ${row.title}: ${row.description}`))}
      {!overview.alerts.some(row => ['critical', 'important'].includes(row.severity)) && line('none', 'No active important or critical property alerts.')}
    </View>}
    {tab === 'Photos' && <View style={{ gap: 10 }}>
      {line('approved-heading', 'Approved property references')}
      {!rows.some(photo => photo.status === 'approved') && line('empty', 'No approved permanent reference photographs yet.')}
      {rows.filter(photo => photo.status === 'approved').map(photo => <View key={photo.id} style={{ gap: 4 }}>{line(photo.id, `${photo.category} · ${photo.caption || 'No caption'} · Approved`)}{images[photo.id] ? <Image source={{ uri: images[photo.id] }} style={{ width: 180, height: 140, borderRadius: 8 }} /> : <GlassButton secondary title="View reference photo" onPress={async () => { try { const uri = await cachePhoto(job.id, photo.id, () => callWorkspace('rlPropertyProfile', { ...input, action: 'readPhoto', photoId: photo.id })); setImages(previous => ({ ...previous, [photo.id]: uri })); } catch (failure) { setError(failure.message); } }} />}</View>)}
      {line('proposals-heading', 'Your reference proposals')}
      <GlassButton secondary title="Refresh proposal status" disabled={busy} onPress={() => load('Photos')} />
      {rows.filter(photo => ['proposed', 'rejected'].includes(photo.status)).map(photo => line(photo.id, `${photo.category} · ${photo.caption || 'No caption'} · ${photo.status === 'rejected' ? 'Rejected by management · original job photo retained' : 'Awaiting management approval'}`))}
      {localProposals.filter(row => !rows.some(photo => photo.id === `${row.attribution?.userId}_${row.id}`)).map(row => line(row.id, `${row.metadata.referenceCategory} · ${proposalState(row)}${row.error ? ` · ${row.error}` : ''}`))}
      {!rows.some(photo => ['proposed', 'rejected'].includes(photo.status)) && !localProposals.some(row => !rows.some(photo => photo.id === `${row.attribution?.userId}_${row.id}`)) && line('no-proposals', 'No proposals from this device or authorized account.')}
    </View>}
    {(tab === 'Service History' || tab === 'Material History') && <View style={{ gap: 9 }}>{!rows.length && !busy && line('empty', 'No records with an explicit link to this property. Ambiguous older addresses are omitted.')}{rows.map(row => line(row.id, tab === 'Service History' ? `${row.date} · ${row.serviceType} · ${row.outcome}${row.notes ? `\n${row.notes}` : ''}${row.hasEvidence ? '\nJob photo evidence recorded; open the authorized work order to review it.' : ''}` : `${row.date} · ${row.product} · ${row.quantity} ${row.unit} · ${row.location || 'Location not recorded'} · ${row.method || 'Method not recorded'}`))}</View>}
    {!!next && <GlassButton secondary title="Load more" disabled={busy} onPress={() => load(tab, next)} />}
    {tab === 'Photos' && line('proposal', 'To propose a new reference, open Photos and evidence in this job and select a reference category before taking or choosing a photo.')}
  </Card>;
}
