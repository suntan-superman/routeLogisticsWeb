import { readWorkspace, callWorkspace } from '../services/workspaceApi';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Button, Image, ScrollView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { cachedRead, savePhotoOffline, queuedWork, subscribeOffline, resolveOffline } from '../services/offline';
import { beginNativeInteraction } from '../services/nativeInteraction';
import { useTheme } from '../theme/ThemeProvider';

const accessDenied = error => ['functions/permission-denied', 'functions/unauthenticated', 'functions/not-found'].includes(error?.code);
const photoState = state => ({ pending: 'Queued on this device', syncing: 'Uploading…', failed: 'Upload failed', conflict: 'Upload needs review' }[state] || state);

// JobWorkflow keeps one instance mounted for its selected job. The native picker
// is presented from that screen, never while swapping React Native modals.
export default function JobPhotos({ job, onBusyChange, onDraftChange }) {
  const { palette } = useTheme();
  const [photos, setPhotos] = useState([]), [busy, setBusy] = useState(false), [draft, setDraft] = useState(null);
  const [actionError, setActionError] = useState(''), [loadError, setLoadError] = useState(''), [message, setMessage] = useState('');
  const mounted = useRef(false), generation = useRef(0), loading = useRef(0), locked = useRef(false), selected = useRef(null), retrying = useRef(new Set());
  const target = useRef(job), callbacks = useRef({ onBusyChange, onDraftChange });
  target.current = job; callbacks.current = { onBusyChange, onDraftChange };
  const current = (ticket, id) => mounted.current && generation.current === ticket && target.current?.id === id;
  const activity = value => { locked.current = value; if (mounted.current) { setBusy(value); callbacks.current.onBusyChange?.(value); } };
  const remember = value => { selected.current = value; if (mounted.current) { setDraft(value); callbacks.current.onDraftChange?.(!!value); } };
  const load = useCallback(async () => {
    const id = target.current?.id, ticket = generation.current, request = ++loading.current;
    if (!id) return;
    const [saved, local] = await Promise.allSettled([
      cachedRead(`photos:${id}`, async () => (await readWorkspace('photos', { jobId: id })).photos), Promise.resolve().then(() => queuedWork()),
    ]);
    if (!current(ticket, id) || request !== loading.current) return;
    if (saved.status === 'rejected' && accessDenied(saved.reason)) {
      setPhotos([]); setLoadError(saved.reason.message); return;
    }
    const remote = saved.status === 'fulfilled' ? saved.value : [];
    const queued = local.status === 'fulfilled' ? local.value.filter(row => row.kind === 'photo' && row.jobId === id && !['synced', 'discarded'].includes(row.state)).map(row => ({ id: row.id, url: row.localUri, state: row.state, error: row.error, metadata: row.metadata })) : [];
    setPhotos([...remote, ...queued.filter(row => !remote.some(photo => photo.id === row.id))]);
    setLoadError([saved.status === 'rejected' ? `Could not load uploaded photos: ${saved.reason.message}` : '', local.status === 'rejected' ? `Could not read saved photos: ${local.reason.message}` : ''].filter(Boolean).join('\n'));
  }, []);
  useEffect(() => {
    mounted.current = true; generation.current++; locked.current = false; selected.current = null;
    setPhotos([]); setDraft(null); setBusy(false); setActionError(''); setLoadError(''); setMessage('');
    callbacks.current.onBusyChange?.(false); callbacks.current.onDraftChange?.(false);
    if (job?.id) load();
    const unsubscribe = subscribeOffline(load);
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
    });
    if (!current(ticket, work.id)) return;
    remember(null); setMessage('Photo saved on this device. Upload status is shown below.'); await load();
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
      const value = { asset: { ...asset }, source: camera ? 'camera' : 'library' };
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
  return <View style={{ marginVertical: 16 }}>
    <Text style={{ color: palette.text, fontWeight: '700', fontSize: 18, marginBottom: 8 }}>Job photos</Text>
    <View style={{ flexDirection: 'row', gap: 12 }}><Button title="Take photo" disabled={busy || !!draft} onPress={() => capture(true)} /><Button title="Choose photo" disabled={busy || !!draft} onPress={() => capture(false)} /></View>
    {busy && <Text accessibilityLiveRegion="polite" style={{ color: palette.secondary }}>Preparing and saving your photo…</Text>}
    {!!draft && <View><Image accessibilityLabel="Selected job photo" source={{ uri: draft.compressed?.uri || draft.asset.uri }} style={{ width: 140, height: 140, margin: 5, borderRadius: 8 }} /><Text style={{ color: palette.secondary }}>Selected photo has not been saved yet.</Text>{!busy && <><Button title="Retry saving photo" onPress={retryDraft} /><Button title="Discard selected photo" onPress={() => { if (!locked.current) { remember(null); setActionError(''); setMessage('Selected photo discarded.'); } }} /></>}</View>}
    <Text style={{ color: palette.secondary, marginVertical: 6 }}>Photos stay on this device until uploaded. Sync resumes while the app is open and connected.</Text>
    {!!message && <Text accessibilityLiveRegion="polite" style={{ color: palette.secondary }}>{message}</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: palette.danger }}>{error}</Text>}
    <Button title="Refresh photos" disabled={busy} onPress={load} />
    <ScrollView horizontal>{photos.map(photo => <View key={photo.id}><PrivatePhoto photo={photo} style={{ width: 140, height: 140, margin: 5, borderRadius: 8 }} /><Text style={{ color: palette.secondary }}>{photo.state ? photoState(photo.state) : 'Uploaded photo'}</Text>{!!photo.error && <Text accessibilityRole="alert" style={{ color: palette.danger }}>{photo.error}</Text>}{['failed', 'conflict'].includes(photo.state) && <Button title="Retry photo upload" onPress={() => retryPhoto(photo.id)} />}</View>)}</ScrollView>
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
