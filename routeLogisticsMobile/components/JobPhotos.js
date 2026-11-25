import { readWorkspace, callWorkspace } from '../services/workspaceApi';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Image, ScrollView } from 'react-native';
import { GlassButton as Button, GlassInput } from './Glass';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { cachedRead, savePhotoOffline, queuedWork, subscribeOffline, resolveOffline } from '../services/offline';
import { beginNativeInteraction } from '../services/nativeInteraction';
import { useTheme } from '../theme/ThemeProvider';
import { useJobResourceRefresh } from '../services/useJobResources';

const accessDenied = error => ['functions/permission-denied', 'functions/unauthenticated', 'functions/not-found'].includes(error?.code);
const photoState = photo => {
  if (photo.metadata?.referenceCategory) {
    if (photo.state === 'synced') return 'Reference proposal submitted · check Property Profile for approval status';
    if (photo.uploadedAt) return ['failed', 'conflict'].includes(photo.state) ? 'Uploaded · proposal needs attention' : 'Uploaded · proposal pending synchronization';
    if (['failed', 'conflict'].includes(photo.state)) return 'Upload needs attention';
    return photo.state === 'syncing' ? 'Upload pending' : 'Saved locally · upload pending';
  }
  return ({ pending: 'Queued on this device', syncing: 'Uploading…', failed: 'Upload failed', conflict: 'Upload needs review' }[photo.state] || photo.state || 'Uploaded photo');
};

// JobWorkflow keeps one instance mounted for its selected job. The native picker
// is presented from that screen, never while swapping React Native modals.
export default function JobPhotos({ job, onBusyChange, onDraftChange, onLocalSave, onProgressChange, active = true }) {
  const { palette } = useTheme();
  const [photos, setPhotos] = useState([]), [busy, setBusy] = useState(false), [draft, setDraft] = useState(null);
  const [actionError, setActionError] = useState(''), [loadError, setLoadError] = useState(''), [message, setMessage] = useState('');
  const [referenceCategory, setReferenceCategory] = useState(''), [referenceCaption, setReferenceCaption] = useState(''), [referenceMode, setReferenceMode] = useState(false);
  const [ready, setReady] = useState(null), refresh = useRef(null);
  const mounted = useRef(false), generation = useRef(0), loading = useRef(0), locked = useRef(false), selected = useRef(null), retrying = useRef(new Set());
  const deniedRead = useRef(null);
  const target = useRef(job), callbacks = useRef({ onBusyChange, onDraftChange, onLocalSave, onProgressChange });
  target.current = job; callbacks.current = { onBusyChange, onDraftChange, onLocalSave, onProgressChange };
  const current = (ticket, id) => mounted.current && generation.current === ticket && target.current?.id === id;
  const activity = value => { locked.current = value; if (mounted.current) { setBusy(value); callbacks.current.onBusyChange?.(value); } };
  const remember = value => { selected.current = value; if (mounted.current) { setDraft(value); callbacks.current.onDraftChange?.(!!value); } };
  const load = useCallback(async ({ force = false, query = false } = {}) => {
    const id = target.current?.id, ticket = generation.current, request = ++loading.current;
    if (!id) return;
    if (force) deniedRead.current = null;
    const [saved, local] = await Promise.allSettled([
      deniedRead.current ? Promise.reject(deniedRead.current) : cachedRead(`photos:${id}`, async () => (await readWorkspace('photos', { jobId: id })).photos), Promise.resolve().then(() => queuedWork()),
    ]);
    if (!current(ticket, id) || request !== loading.current) return;
    if (saved.status === 'rejected' && accessDenied(saved.reason)) {
      deniedRead.current = saved.reason;
      setPhotos([]); setLoadError(saved.reason.message); if (query) throw saved.reason; return;
    }
    const remote = saved.status === 'fulfilled' ? saved.value : [];
    const photoRows = local.status === 'fulfilled' ? local.value.filter(row => row.kind === 'photo' && row.jobId === id && row.state !== 'discarded') : [];
    const merged = [...remote.map(photo => {
      const operation = photoRows.find(row => `${row.attribution?.userId}_${row.id}` === photo.id && row.metadata?.referenceCategory);
      return operation ? { ...photo, state: operation.state, metadata: operation.metadata, uploadedAt: operation.uploadedAt, error: operation.error } : photo;
    }), ...photoRows.filter(row => row.state !== 'synced' && !remote.some(photo => photo.id === `${row.attribution?.userId}_${row.id}`)).map(row => ({ id: row.id, url: row.localUri, state: row.state, error: row.error, metadata: row.metadata, uploadedAt: row.uploadedAt }))];
    setPhotos(merged);
    callbacks.current.onProgressChange?.({ hasPhotos: merged.length > 0, count: merged.length });
    setLoadError([saved.status === 'rejected' ? `Could not load uploaded photos: ${saved.reason.message}` : '', local.status === 'rejected' ? `Could not read saved photos: ${local.reason.message}` : ''].filter(Boolean).join('\n'));
    if (query && saved.status === 'rejected') throw saved.reason;
    if (query && local.status === 'rejected') throw local.reason;
    return merged;
  }, []);
  const resource = useJobResourceRefresh('photos', job?.id, load, { enabled: ready === job?.id && active }); refresh.current = resource.refetch;
  useEffect(() => {
    mounted.current = true; generation.current++; locked.current = false; selected.current = null; deniedRead.current = null;
    setPhotos([]); setDraft(null); setBusy(false); setActionError(''); setLoadError(''); setMessage(''); setReferenceMode(false); setReferenceCategory(''); setReferenceCaption('');
    callbacks.current.onBusyChange?.(false); callbacks.current.onDraftChange?.(false); callbacks.current.onProgressChange?.({ hasPhotos: false, count: 0 });
    setReady(job?.id);
    const unsubscribe = subscribeOffline(() => refresh.current?.());
    return () => {
      mounted.current = false; generation.current++; loading.current++; unsubscribe();
      callbacks.current.onBusyChange?.(false); callbacks.current.onDraftChange?.(false);
    };
  }, [job?.id, load]);
  const persist = async (value, work, ticket) => {
    let compressed = value.compressed;
    if (!compressed) {
      const width = Number(value.asset.width), height = Number(value.asset.height);
      const dimension = width >= height ? 'width' : 'height', pixels = Math.max(width, height);
      const transforms = Number.isFinite(pixels) && pixels > 1600 ? [{ resize: { [dimension]: 1600 } }] : [];
      compressed = await manipulateAsync(value.asset.uri, transforms, { compress: 0.8, format: SaveFormat.JPEG });
      if (!current(ticket, work.id)) return;
      value = { ...value, compressed }; remember(value);
    }
    if (!current(ticket, work.id)) return;
    await savePhotoOffline(work, compressed.uri, {
      source: value.source, fileName: value.asset.fileName || null, mimeType: 'image/jpeg',
      width: compressed.width || value.asset.width, height: compressed.height || value.asset.height,
      ...(value.referenceCategory ? { referenceCategory: value.referenceCategory, referenceCaption: value.referenceCaption } : {}),
    });
    if (!current(ticket, work.id)) return;
    remember(null); setReferenceMode(false); setReferenceCategory(''); setReferenceCaption(''); setMessage(value.referenceCategory ? 'Photo and property reference proposal saved on this device. Management must approve it after synchronization.' : 'Photo saved on this device. Upload status is shown below.'); callbacks.current.onLocalSave?.({ state: 'pending' }); await load();
  };
  const capture = async camera => {
    if (locked.current || selected.current || !target.current?.id) return;
    const work = { ...target.current }, ticket = generation.current, release = beginNativeInteraction();
    activity(true); setActionError(''); setMessage('');
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!current(ticket, work.id)) return;
        if (!permission.granted) throw new Error('Camera permission is required. Open iPhone Settings → Route Logistics → Camera, then try again. You can also choose a gallery photo.');
      }
      if (!current(ticket, work.id)) return;
      const options = { mediaTypes: ['images'], allowsEditing: false, quality: 0.85, exif: false, base64: false, presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN };
      const result = await (camera ? ImagePicker.launchCameraAsync(options) : ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: false }));
      if (!current(ticket, work.id)) return;
      if (result.canceled) { setMessage('Photo selection cancelled. You can continue with this job.'); return; }
      const asset = result.assets?.[0];
      if (!asset?.uri) throw new Error('The picker returned no photo. Please take or select the photo again.');
      const value = { asset: { ...asset }, source: camera ? 'camera' : 'library', referenceCategory, referenceCaption };
      remember(value); await persist(value, work, ticket);
    } catch (error) {
      if (current(ticket, work.id)) setActionError(`${error.message || 'Could not save this photo.'}${selected.current ? ' Your selected photo is retained. Retry saving it below.' : ' Please try again, or choose a gallery photo.'}`);
    } finally { release(); if (current(ticket, work.id)) activity(false); }
  };
  const retryDraft = async () => {
    if (locked.current || !selected.current) return;
    const work = { ...target.current }, ticket = generation.current, value = selected.current;
    activity(true); setActionError('');
    try { await persist(value, work, ticket); }
    catch (error) { if (current(ticket, work.id)) setActionError(`${error.message || 'Could not save this photo.'} Your selected photo is retained. Retry saving it below.`); }
    finally { if (current(ticket, work.id)) activity(false); }
  };
  const retryPhoto = async id => {
    if (retrying.current.has(id)) return;
    retrying.current.add(id); const workId = target.current?.id, ticket = generation.current;
    try { await resolveOffline(id, 'retry'); if (current(ticket, workId)) await load(); }
    catch (error) { if (current(ticket, workId)) setActionError(error.message || 'Could not retry this photo. Try again.'); }
    finally { retrying.current.delete(id); }
  };
  if (!job?.id) return null;
  const error = [actionError, loadError].filter(Boolean).join('\n');
  return <View style={{ gap: 12 }}>
    <Text style={{ color: palette.text, fontWeight: '700', fontSize: 17 }}>Photo purpose: {referenceMode ? referenceCategory ? `Property reference · ${referenceCategory}` : 'Choose a reference category' : 'Job evidence'}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Button title="Take photo" icon="camera-outline" iconPlacement="above" style={{ flexGrow: 1, minWidth: 120 }} disabled={busy || !!draft || referenceMode && !referenceCategory} onPress={() => capture(true)} /><Button title="Choose photo" icon="images-outline" iconPlacement="above" style={{ flexGrow: 1, minWidth: 120 }} disabled={busy || !!draft || referenceMode && !referenceCategory} onPress={() => capture(false)} /></View>
    {!!(job.customerId && (job.servicePropertyId || job.serviceProperty?.propertyId)) && <View style={{ gap: 8 }}>
      <Button title={referenceMode ? 'Use as job evidence instead' : 'Propose as property reference (optional)'} secondary disabled={busy || !!draft} onPress={() => { setReferenceMode(value => !value); setReferenceCategory(''); setReferenceCaption(''); }} />
      {referenceMode && <><Text style={{ color: palette.secondary, fontSize: 13, lineHeight: 19 }}>The photo stays as job evidence. Management approves any permanent reference.</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>{[['exterior', 'Exterior'], ['entrance', 'Gate'], ['access', 'Access'], ['equipment', 'Equipment'], ['treatment', 'Treatment area'], ['safety', 'Safety'], ['other', 'Other']].map(([id, label]) => <Button key={id} title={label} secondary={referenceCategory !== id} style={{ flexGrow: 1, minWidth: 96, paddingHorizontal: 8, paddingVertical: 8 }} disabled={busy} onPress={() => setReferenceCategory(id)} />)}</View>
        {!!referenceCategory && <GlassInput label="Reference caption (optional)" value={referenceCaption} maxLength={500} onChangeText={setReferenceCaption} />}
      </>}
    </View>}
    {busy && <Text accessibilityLiveRegion="polite" style={{ color: palette.secondary }}>Preparing and saving your photo…</Text>}
    {!!draft && <View><Image accessibilityLabel="Selected job photo" source={{ uri: draft.compressed?.uri || draft.asset.uri }} style={{ width: 140, height: 140, margin: 5, borderRadius: 8 }} /><Text style={{ color: palette.secondary }}>Selected photo has not been saved yet.</Text>{!busy && <><Button title="Retry saving photo" onPress={retryDraft} /><Button title="Discard selected photo" onPress={() => { if (!locked.current) { remember(null); setActionError(''); setMessage('Selected photo discarded.'); } }} /></>}</View>}
    <Text style={{ color: palette.secondary, fontSize: 12 }}>Photos save on this device before uploading.</Text>
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: palette.secondary }}>{message}</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: palette.danger }}>{error}</Text>}
    {!!loadError && <Button title="Retry loading photos" disabled={busy} onPress={() => load({ force: true })} />}
    {!!photos.length && <ScrollView horizontal contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>{photos.map(photo => <View key={photo.id} style={{ width: 116, gap: 4 }}><PrivatePhoto photo={photo} style={{ width: 108, height: 88, borderRadius: 9 }} /><Text style={{ color: palette.secondary, fontSize: 12 }}>{photo.metadata?.referenceCategory ? `${photo.metadata.referenceCategory} · ` : ''}{photoState(photo)}</Text>{!!photo.error && <Text accessibilityRole="alert" style={{ color: palette.danger }}>{photo.error}</Text>}{['failed', 'conflict'].includes(photo.state) && <Button title="Retry photo upload" onPress={() => retryPhoto(photo.id)} />}</View>)}</ScrollView>}
  </View>;
}

function PrivatePhoto({ photo, style }) {
  const [uri, setUri] = useState(photo.url || ''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const mounted = useRef(false), request = useRef(0);
  useEffect(() => { mounted.current = true; setUri(photo.url || ''); setError(''); return () => { mounted.current = false; request.current++; }; }, [photo.id, photo.url]);
  const read = async () => {
    const ticket = ++request.current; setBusy(true); setError('');
    try { const result = await callWorkspace('rlJobPhoto', { action: 'read', photoId: photo.id }); if (mounted.current && ticket === request.current) setUri(result.dataUri); }
    catch (failure) { if (mounted.current && ticket === request.current) setError(failure.message || 'Could not load this photo. Try again.'); }
    finally { if (mounted.current && ticket === request.current) setBusy(false); }
  };
  return <View>{uri ? <Image source={{ uri }} style={style} /> : <Button title={busy ? 'Loading photo…' : 'View photo'} disabled={busy} onPress={read} />}{!!error && <Text accessibilityRole="alert">{error}</Text>}</View>;
}
