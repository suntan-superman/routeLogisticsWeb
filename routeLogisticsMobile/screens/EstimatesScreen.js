import React, { useEffect, useRef, useState } from 'react';
import { AppState, Image, Pressable, Text, View, findNodeHandle } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { GlassButton, GlassCard, GlassInput } from '../components/Glass';
import QuarterHourTimeField from '../components/QuarterHourTimePicker';
import { KeyboardAwareScrollView, ScreenHeader } from '../components/MobileUI';
import { CustomerService } from '../services/firebase';
import { beginNativeInteraction } from '../services/nativeInteraction';
import { callEstimate, prepareEstimatePhoto } from '../services/estimateService';
import { blankEstimate, blankLine, draftFromEstimate, estimateInput, money, conversionInput } from '../../functions/shared/estimateClient';
import { useJobResourceRefresh } from '../services/useJobResources';
import NetInfo from '@react-native-community/netinfo';
import { loadEstimateDraft, saveEstimateDraft, retainEstimatePhoto, discardEstimateDraft, estimateDraftStateLabel } from '../services/estimateDraftStore';
import { estimateContextFromVisit } from '../services/estimateVisitPolicy';
import { recordOfflineTiming } from '../services/offlineTimings';
import { formatPhone, displayPhone } from '../services/phoneFormat';
import NoteAudience from '../components/NoteAudience';

async function measuredSync(kind, work) {
  const startedAt = Date.now();
  try { const result = await work(); recordOfflineTiming(kind, 'sync', startedAt); return result; }
  catch (error) { recordOfflineTiming(kind, 'sync', startedAt, ['aborted','failed-precondition','permission-denied'].includes(String(error?.code || '').split('/').pop()) ? 'conflict' : 'failed'); throw error; }
}

export default function EstimatesScreen({ onInteractionChange, active = true, initialVisit = null, onVisitConsumed, onReturnToVisit }) {
  const { user, permissions, accessStatus = 'ready' } = useAuth(), { palette } = useTheme();
  const allowed = permissions.can('estimates.manage') || permissions.can('estimates.prepareAssigned'), scope = [user.id, user.companyId, user.role, user.membershipId].join(':');
  const [rows, setRows] = useState([]), [customers, setCustomers] = useState([]), [templates, setTemplates] = useState([]), [enabled, setEnabled] = useState(false), [availability, setAvailability] = useState('checking');
  const [editing, setEditing] = useState(false), [record, setRecord] = useState(null), [draft, setDraft] = useState(blankEstimate), [photos, setPhotos] = useState([]), [versions, setVersions] = useState([]);
  const [search, setSearch] = useState(''), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [confirm, setConfirm] = useState(null);
  const [schedule, setSchedule] = useState({ date: '', time: '09:00' });
  const [createCustomer, setCreateCustomer] = useState(false), [conversionCustomerId, setConversionCustomerId] = useState('');
  const [fieldErrors, setFieldErrors] = useState({}), [validationSummary, setValidationSummary] = useState('');
  const [draftIdentity, setDraftIdentity] = useState(''), [draftState, setDraftState] = useState('server'), [estimatePermissions, setEstimatePermissions] = useState({});
  const [originVisit, setOriginVisit] = useState(null);
  const live = useRef(false), generation = useRef(0), locked = useRef(false), callbacks = useRef(onInteractionChange), pendingSave = useRef(null), target = useRef(record), photoRef = useRef(photos), persistSequence = useRef(0), persistQueue = useRef(Promise.resolve()), visitHandled = useRef(''), saveRef = useRef(null), scrollRef = useRef(null), fieldRefs = useRef({});
  callbacks.current = onInteractionChange; target.current = record; photoRef.current = photos;
  useEffect(() => { callbacks.current?.({ busy, hasDraft: dirty || uncertain || ['device','waiting','syncing','conflict','failed'].includes(draftState) }); }, [busy, dirty, uncertain, draftState]);
  const current = ticket => live.current && generation.current === ticket;
  const load = async () => {
    const ticket = generation.current; if (!allowed || accessStatus !== 'ready') return;
    let result;
    try { result = await callEstimate('list'); } catch (failure) {
      const network = await NetInfo.fetch().catch(() => null), offline = network?.isConnected === false || network?.isInternetReachable === false;
      if (current(ticket)) { setAvailability(offline ? 'offline' : 'unavailable'); if (!offline) setError(failure.message || 'Could not refresh estimates.'); }
      throw failure;
    }
    if (!current(ticket)) return;
    setRows(result.estimates || []); setTemplates(result.templates || []); setEnabled(result.enabled === true); setAvailability(result.enabled === true ? 'enabled' : 'disabled');
    const customerResult = await CustomerService.getCustomers(); if (current(ticket) && customerResult.success) setCustomers(customerResult.customers || []);
    return result;
  };
  useEffect(() => { live.current = true; generation.current++; setRows([]); setEditing(false); setPhotos([]); setRecord(null); setDirty(false); setUncertain(false); setDraftIdentity(''); setDraftState('server'); setAvailability('checking'); setOriginVisit(null); pendingSave.current = null;
    return () => { live.current = false; generation.current++; callbacks.current?.({ busy: false, hasDraft: false }); };
  }, [scope, allowed]);
  const queueLocalDraft = (nextDraft, nextPhotos = photoRef.current) => {
    if (!draftIdentity) return Promise.resolve(null);
    const ticket = ++persistSequence.current, state = draftState === 'syncing' ? 'syncing' : draftState === 'waiting' ? 'waiting' : draftState === 'conflict' ? 'conflict' : 'device';
    const payload = { draft: nextDraft, photos: nextPhotos.map(photo => ({ id: photo.id, uri: photo.uri || photo.asset?.uri || '', caption: photo.caption || '', remoteId: photo.remoteId || null, attached: photo.attached === true })), estimateId: target.current?.id || null, baseVersion: target.current?.version || null, operationId: pendingSave.current?.operationId || null, syncState: state };
    persistQueue.current = persistQueue.current.catch(() => {}).then(() => saveEstimateDraft(draftIdentity, payload));
    persistQueue.current
      .then(() => { if (live.current && ticket === persistSequence.current && !['waiting','conflict'].includes(state)) setDraftState('device'); })
      .catch(failure => { if (live.current && ticket === persistSequence.current) { setDraftState('failed'); setError(failure.message || 'This estimate draft could not be saved on the device.'); } });
    return persistQueue.current;
  };
  useEffect(() => {
    if (!editing || !dirty || !draftIdentity) return;
    void queueLocalDraft(draft, photos);
  }, [draft, photos, dirty, draftIdentity, record?.id, record?.version]);
  useEffect(() => {
    if (!editing || !dirty || !draftIdentity) return;
    const listener = AppState.addEventListener('change', state => {
      if (state === 'active') return;
      const payload = { draft, photos: photoRef.current.map(photo => ({ id: photo.id, uri: photo.uri || photo.asset?.uri || '', caption: photo.caption || '', remoteId: photo.remoteId || null, attached: photo.attached === true })), estimateId: target.current?.id || null, baseVersion: target.current?.version || null, operationId: pendingSave.current?.operationId || null, syncState: draftState === 'waiting' ? 'waiting' : 'device' };
      persistQueue.current = persistQueue.current.catch(() => {}).then(() => saveEstimateDraft(draftIdentity, payload));
    });
    return () => listener.remove();
  }, [editing, dirty, draftIdentity, draft, draftState]);
  useEffect(() => NetInfo.addEventListener(state => { if (state.isConnected !== false && state.isInternetReachable !== false && draftState === 'waiting' && !locked.current) saveRef.current?.(); }), [draftState]);
  useJobResourceRefresh('estimates', user.id, load, { enabled: active && allowed && accessStatus === 'ready' && !editing });
  const clearFieldError = name => {
    if (!fieldErrors[name]) return;
    setFieldErrors(previous => { const next = { ...previous }; delete next[name]; return next; });
    setValidationSummary('');
  };
  const change = (name, value, errorKey = name) => { if (locked.current || uncertain) return; clearFieldError(errorKey); const next = { ...draft, [name]: value }; void queueLocalDraft(next); setDraft(next); setDirty(true); };
  const revealField = (name, focus = true) => {
    const input = fieldRefs.current[name] || fieldRefs.current.lineItems;
    if (!input) return;
    const schedule = globalThis.requestAnimationFrame || (callback => setTimeout(callback, 0));
    schedule(() => {
      if (focus) input.focus?.();
      const handle = findNodeHandle?.(input), responder = scrollRef.current?.getScrollResponder?.() || scrollRef.current;
      if (handle != null) responder?.scrollResponderScrollNativeHandleToKeyboard?.(handle, 140, true);
    });
  };
  const applyTemplate = template => {
    if (locked.current || uncertain || !template?.lineItems?.length) return;
    const next = { ...draft, title: template.name || draft.title, serviceType: template.serviceType || draft.serviceType, scopeOfWork: template.scopeOfWork || draft.scopeOfWork, notes: template.notes || draft.notes, validDays: String(template.validDays || 30), lineItems: template.lineItems.map(line => ({ ...line, quantity: String(line.quantity), unitPrice: Number(line.unitPrice).toFixed(2) })) };
    void queueLocalDraft(next); setDraft(next);
    setDirty(true); setMessage(`Applied ${template.name}. Its current prices were copied into this draft and will not change with the template.`);
  };
  const run = async work => {
    if (locked.current || accessStatus !== 'ready') return;
    locked.current = true; const ticket = generation.current; setBusy(true); setError(''); setMessage('');
    try { await work(ticket); } catch (failure) { if (current(ticket)) { const code = String(failure.code || '').split('/').pop(); if (failure.code === 'client-validation' && failure.fieldErrors) { setFieldErrors(failure.fieldErrors); setValidationSummary(failure.message || 'Review the highlighted estimate fields.'); setError('Review the highlighted fields below. Your estimate entries are still saved on this device.'); revealField(failure.firstField); } else { if (code === 'aborted' || code === 'failed-precondition' && /changed|version|review/i.test(failure.message || '')) setDraftState('conflict'); else if (['unavailable','deadline-exceeded','network-request-failed'].includes(code)) setDraftState('waiting'); else if (dirty) setDraftState('failed'); setError(failure.message || 'The estimate could not be saved. Your current draft and photo selection are retained.'); } } }
    finally { if (current(ticket)) { locked.current = false; setBusy(false); } }
  };
  const open = estimate => run(async ticket => {
    const result = await callEstimate('get', { estimateId: estimate.id }); if (!current(ticket)) return;
    const identity = result.estimate.sourceVisitId ? `visit:${result.estimate.sourceVisitId}` : `estimate:${result.estimate.id}`, local = await loadEstimateDraft(identity);
    const localDirty = !!local?.draft && local.syncState !== 'server';
    setRecord(result.estimate); setDraft(localDirty ? local.draft : draftFromEstimate(result.estimate)); setPhotos(localDirty ? (local.photos || []).map(photo => ({ ...photo, asset: photo.uri ? { uri: photo.uri } : undefined })) : (result.photos || []).map(photo => ({ ...photo, remoteId: photo.id, attached: true }))); setVersions(result.versions || []); setEstimatePermissions(result.permissions || {}); setEditing(true); setDirty(localDirty); setDraftIdentity(identity); setDraftState(localDirty && local.baseVersion && local.baseVersion !== result.estimate.version ? 'conflict' : localDirty ? 'device' : 'server'); setUncertain(false); setConfirm(null); setCreateCustomer(false); setConversionCustomerId(''); setFieldErrors({}); setValidationSummary(''); pendingSave.current = local?.operationId ? { operationId: local.operationId, ...(result.estimate ? { estimateId: result.estimate.id, expectedVersion: local.baseVersion } : {}), data: null } : null;
  });
  const startNew = () => { const identity = `new:${Crypto.randomUUID()}`; setRecord(null); setDraft(blankEstimate()); setPhotos([]); setVersions([]); setEditing(true); setDirty(true); setDraftIdentity(identity); setDraftState('device'); setUncertain(false); setError(''); setMessage(''); setFieldErrors({}); setValidationSummary(''); pendingSave.current = { operationId: identity.slice(4), data: null }; };
  const save = () => run(async ticket => {
    const network = await NetInfo.fetch(); if (network.isConnected === false || network.isInternetReachable === false) { setDraftState('waiting'); setMessage('Estimate saved on this device. It will synchronize when a connection is available.'); return; }
    setDraftState('syncing');
    let next = record, values = estimateInput(draft, { pricingRequired: permissions.can('estimates.manage') }), contentSaved = false;
    const persist = async data => {
      if (!pendingSave.current?.operationId) pendingSave.current = { operationId: Crypto.randomUUID() };
      pendingSave.current = { ...pendingSave.current, ...(next ? { estimateId: next.id, expectedVersion: next.version } : {}), data };
      setUncertain(true);
      const result = await measuredSync('estimate', () => callEstimate('save', pendingSave.current)); if (!current(ticket)) return null;
      next = result.estimate; pendingSave.current = null; contentSaved = true; setUncertain(false); setRecord(next); setEstimatePermissions(previous => ({ ...previous, canEdit: true, canSubmit: permissions.isTechnician === true })); return next;
    };
    if (!next || pendingSave.current || next.status !== 'draft' || !photoRef.current.some(photo => !photo.remoteId)) { if (!(await persist(values))) return; }
    const uploaded = [...photoRef.current];
    for (let index = 0; index < uploaded.length; index++) {
      if (uploaded[index].remoteId) continue;
      let photo = uploaded[index];
      if (!photo.compressed) { const compressed = await prepareEstimatePhoto(photo.asset || { uri: photo.uri }); if (!current(ticket)) return; photo = { ...photo, compressed }; uploaded[index] = photo; setPhotos([...uploaded]); }
      const result = await measuredSync('photo', () => callEstimate('photo-upload', { estimateId: next.id, operationId: photo.id, base64: photo.compressed.base64, caption: photo.caption || '' })); if (!current(ticket)) return;
      uploaded[index] = { ...photo, remoteId: result.id }; setPhotos([...uploaded]);
    }
    const photoIds = uploaded.map(photo => photo.remoteId).filter(Boolean);
    if (photoIds.join() !== (next.photoIds || []).join() || (!contentSaved && dirty)) { values = { ...values, photoIds }; if (!(await persist(values))) return; }
    if (!current(ticket)) return;
    const savedPhotos = uploaded.map(photo => ({ ...photo, attached: true })); setDraft(draftFromEstimate(next)); setDirty(false); setDraftState('server'); setVersions(previous => [{ version: next.version, status: next.status, totalCents: next.totalCents }, ...previous.filter(item => item.version !== next.version)]); setMessage('Estimate saved to the server. Amounts and this version were calculated there.'); await discardEstimateDraft(draftIdentity, savedPhotos); setPhotos(savedPhotos.map(photo => ({ id: photo.remoteId || photo.id, remoteId: photo.remoteId, attached: true, caption: photo.caption || '' }))); pendingSave.current = null; await load();
  });
  saveRef.current = save;
  const pick = camera => run(async ticket => {
    if (photos.length >= 6) throw new Error('An estimate can include up to six photos.');
    const release = beginNativeInteraction();
    try {
      if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) throw new Error('Allow camera access in device Settings, or choose a gallery photo.');
      if (!current(ticket)) return;
      const options = { mediaTypes: ['images'], allowsEditing: false, quality: 0.85, exif: false, base64: false, presentationStyle: ImagePicker.UIImagePickerPresentationStyle.FULL_SCREEN };
      const result = await (camera ? ImagePicker.launchCameraAsync(options) : ImagePicker.launchImageLibraryAsync({ ...options, allowsMultipleSelection: false })); if (!current(ticket)) return;
      if (result.canceled) { setMessage('Photo selection cancelled. Your estimate is still here.'); return; }
      const asset = result.assets?.[0]; if (!asset?.uri) throw new Error('No photo was returned. Choose the photo again.');
      const id = Crypto.randomUUID(), retained = await retainEstimatePhoto(draftIdentity, id, asset); if (!current(ticket)) return;
      const nextPhotos = [...photoRef.current, { id, asset: retained, uri: retained.uri, caption: '' }]; void queueLocalDraft(draft, nextPhotos); setPhotos(nextPhotos); setDirty(true); setDraftState('device'); setMessage('Photo retained on this device. Save or reconnect to upload it with the estimate.');
    } finally { release(); }
  });
  useEffect(() => {
    if (!active || !initialVisit?.id || visitHandled.current === initialVisit.id || !allowed || accessStatus !== 'ready') return;
    visitHandled.current = initialVisit.id; const identity = `visit:${initialVisit.id}`;
    setOriginVisit(initialVisit);
    run(async ticket => {
      const local = await loadEstimateDraft(identity); if (!current(ticket)) return;
      let context, restoredOffline = false;
      try {
        context = await callEstimate('visit-context', { visitId: initialVisit.id });
        if (current(ticket)) { setEnabled(true); setAvailability('enabled'); }
      } catch (failure) {
        const network = await NetInfo.fetch().catch(() => null), offline = network?.isConnected === false || network?.isInternetReachable === false;
        const fallback = local?.draft || estimateContextFromVisit(initialVisit);
        if (!offline || !fallback) throw failure;
        context = { existing: false, context: fallback };
        restoredOffline = true;
        setAvailability('offline');
      }
      if (!current(ticket)) return;
      if (context.estimate) {
        const result = await callEstimate('get', { estimateId: context.estimate.id }); if (!current(ticket)) return;
        const restored = local?.draft && local.syncState !== 'server';
        setRecord(result.estimate); setDraft(restored ? local.draft : draftFromEstimate(result.estimate)); setPhotos(restored ? (local.photos || []).map(photo => ({ ...photo, asset: photo.uri ? { uri: photo.uri } : undefined })) : (result.photos || []).map(photo => ({ ...photo, remoteId: photo.id, attached: true }))); setVersions(result.versions || []); setEstimatePermissions(result.permissions || {}); setEditing(true); setDirty(!!restored); setDraftIdentity(identity); setDraftState(restored && local.baseVersion !== result.estimate.version ? 'conflict' : restored ? 'device' : 'server'); setFieldErrors({}); setValidationSummary(''); pendingSave.current = local?.operationId ? { operationId: local.operationId, estimateId: result.estimate.id, expectedVersion: local.baseVersion, data: null } : null; setMessage(restored ? 'Saved estimate draft restored from this device.' : 'Linked estimate opened.'); onVisitConsumed?.(); return;
      }
      const next = local?.draft || { ...blankEstimate(), ...context.context, scopeOfWork: '', lineItems: [blankLine('labor'), blankLine('material')] };
      setRecord(null); setDraft(next); setPhotos((local?.photos || []).map(photo => ({ ...photo, asset: photo.uri ? { uri: photo.uri } : undefined }))); setVersions([]); setEditing(true); setDirty(true); setDraftIdentity(identity); setDraftState(local ? local.syncState || 'device' : 'device'); setFieldErrors({}); setValidationSummary(''); pendingSave.current = local?.operationId ? { operationId: local.operationId, data: null } : { operationId: Crypto.randomUUID(), data: null }; setMessage(local ? 'Saved estimate draft restored from this device.' : restoredOffline ? 'Estimate visit restored from the assigned work order. This draft is saved on this device and will be revalidated when it synchronizes.' : 'Estimate visit loaded. Add the inspection scope and optional pricing, then save or submit for review.'); onVisitConsumed?.();
    });
  }, [active, initialVisit?.id, allowed, accessStatus]);
  if (!allowed) return <View><Text accessibilityRole="alert" style={{ color: palette.danger }}>Estimate preparation is not available for your role.</Text></View>;
  const visitBound = !!draft.sourceVisitId, workflowAvailable = enabled || visitBound && availability !== 'disabled';
  const editable = workflowAvailable && !record?.legacy && !record?.convertedJobId && !record?.jobId && (!record || estimatePermissions.canEdit !== false && !['approved', 'converted', 'submitted-for-review'].includes(record.status)), fieldsDisabled = busy || uncertain || !editable;
  const canConvert = permissions.can('customers.manage') && permissions.can('jobs.schedule');
  const input = (label, name, options = {}) => <GlassInput label={label} value={String(draft[name] || '')} editable={!fieldsDisabled} inputRef={node => { fieldRefs.current[name] = node; }} error={fieldErrors[name]} onChangeText={value => change(name, value)} {...options} onFocus={event => { revealField(name, false); options.onFocus?.(event); }} />;
  const close = () => { if (dirty || uncertain) setConfirm('leave'); else setEditing(false); };
  const returnToVisit = async () => {
    if (!originVisit || busy) return;
    try { await persistQueue.current; } catch { setError('This estimate draft could not be confirmed on this device. Keep it open and retry before returning to the work order.'); return; }
    onReturnToVisit?.(originVisit);
  };
  return <View style={{ flex: 1 }}><ScreenHeader title="Estimates" subtitle="Photos, scope and a priced proposal" onBack={editing ? close : undefined} />
    <KeyboardAwareScrollView scrollRef={scrollRef} contentContainerStyle={{ padding: 20, gap: 16 }}>
      {!!error && <Text accessibilityRole="alert" style={{ color: palette.danger, lineHeight: 22 }}>{error}</Text>}{!!message && <Text accessibilityLiveRegion="polite" style={{ color: palette.accent, lineHeight: 22 }}>{message}</Text>}{editing && <Text accessibilityLiveRegion="polite" style={{ color: draftState === 'failed' || draftState === 'conflict' ? palette.danger : palette.secondary, fontWeight: '600' }}>{estimateDraftStateLabel(draftState)}</Text>}
      {!!validationSummary && <GlassCard><Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={{ color: palette.danger, fontWeight: '700', lineHeight: 22 }}>Please review this estimate</Text><Text style={{ color: palette.danger, lineHeight: 21 }}>{validationSummary}</Text></GlassCard>}
      {availability === 'disabled' && <Text style={{ color: palette.secondary }}>New estimate workflows are disabled by the current production configuration. Existing estimates remain available to review.</Text>}
      {availability === 'offline' && !visitBound && <Text style={{ color: palette.secondary }}>Reconnect to verify estimate availability. Assigned estimate-visit drafts that were opened or cached remain available offline.</Text>}
      {!!originVisit && <GlassButton secondary title="Return to originating work order" disabled={busy} onPress={returnToVisit} />}
      {!editing ? <>{permissions.can('estimates.manage') && <GlassButton title="New photo estimate" disabled={busy || !enabled || accessStatus !== 'ready'} onPress={startNew} />}<GlassButton secondary title="Refresh estimates" disabled={busy} onPress={() => run(load)} />
        {rows.map(estimate => <GlassCard key={estimate.id}><Text style={{ color: palette.text, fontSize: 17, fontWeight: '700' }}>{estimate.title || estimate.serviceType || 'Legacy estimate'}</Text><Text style={{ color: palette.secondary }}>{estimate.customerName || estimate.recipient?.name || estimate.prospect?.name || 'Customer'} · {estimate.status || 'Legacy'} · {estimate.legacy ? 'Read-only legacy' : `v${estimate.version}`}</Text>{Number.isFinite(estimate.totalCents) && <Text style={{ color: palette.text }}>{money(estimate.totalCents)}</Text>}<GlassButton secondary title="Open estimate" onPress={() => open(estimate)} disabled={busy} /></GlassCard>)}
        {!rows.length && <Text style={{ color: palette.secondary }}>No estimates yet. Start with photos of the requested work.</Text>}</> : <>
        {record && <GlassCard><Text style={{ color: palette.text, fontWeight: '700' }}>{record.legacy ? 'Read-only legacy estimate' : `Version ${record.version} · ${record.status}`}</Text>{Number.isFinite(record.totalCents) && <><Text style={{ color: palette.secondary }}>Subtotal {money(record.subtotalCents)} · Tax {money(record.taxCents)}</Text><Text style={{ color: palette.text, fontSize: 22, fontWeight: '700' }}>Server total {money(record.totalCents)}</Text></>}{dirty && <Text style={{ color: palette.secondary }}>Changes and selected photos are not part of the saved version yet.</Text>}</GlassCard>}
        {record && !editable && enabled && permissions.can('estimates.manage') && <GlassButton secondary title="Copy scope and pricing to a new draft" disabled={busy} onPress={() => { setDraft({ ...draftFromEstimate(record), photoIds: [], sourceVisitId: null, inquiryId: null, servicePropertyId: null }); setRecord(null); setPhotos([]); setVersions([]); setConfirm(null); setDirty(true); setMessage('New independent draft copied. Original approvals, visit links, photos and jobs remain unchanged. Add photos for this proposal.'); }} />}
        <GlassCard><Text style={{ color: palette.text, fontWeight: '700' }}>Work photos · {photos.length}/6</Text>{editable && <><GlassButton title="Take estimate photo" disabled={fieldsDisabled} onPress={() => pick(true)} /><GlassButton secondary title="Choose estimate photo" disabled={fieldsDisabled} onPress={() => pick(false)} /></>}
          {photos.map((photo, index) => <View key={photo.id} style={{ gap: 8 }}>{(photo.uri || photo.dataUri) ? <Image source={{ uri: photo.uri || photo.dataUri }} style={{ height: 180, borderRadius: 12 }} resizeMode="cover" /> : <GlassButton secondary title={`View saved photo ${index + 1}`} disabled={busy} onPress={() => run(async ticket => { const result = await callEstimate('photo-read', { estimateId: record.id, photoId: photo.remoteId }); if (current(ticket)) setPhotos(previous => previous.map(item => item.id === photo.id ? { ...item, dataUri: result.dataUri } : item)); })} />}<Text style={{ color: palette.secondary }}>{photo.attached ? 'Attached to saved version' : photo.remoteId ? 'Uploaded · save to attach' : 'Selected · retained for upload'}</Text>{!photo.attached && <GlassInput label={`Photo ${index + 1} caption`} value={photo.caption || ''} editable={!fieldsDisabled} onChangeText={caption => { const nextPhotos = photoRef.current.map(item => item.id === photo.id ? { ...item, caption } : item); void queueLocalDraft(draft, nextPhotos); setPhotos(nextPhotos); setDirty(true); }} />}</View>)}
        </GlassCard>
        <GlassCard><Text style={{ color: palette.text, fontWeight: '700' }}>Customer or prospect</Text><GlassInput label="Find customer" value={search} onChangeText={setSearch} editable={!fieldsDisabled && !visitBound} />
          {draft.customerId && <Text style={{ color: palette.accent }}>Linked customer: {customers.find(customer => customer.id === draft.customerId)?.name || record?.customerName || draft.customerId}</Text>}
          {!fieldsDisabled && !visitBound && customers.filter(customer => search && customer.name?.toLowerCase().includes(search.toLowerCase())).slice(0, 6).map(customer => <GlassButton key={customer.id} secondary title={customer.name} onPress={() => { change('customerId', customer.id); setSearch(''); }} />)}
          {!visitBound && <GlassButton secondary title={draft.customerId ? 'Use a prospect instead' : 'Refresh customer choices'} disabled={fieldsDisabled} onPress={() => draft.customerId ? change('customerId', '') : run(load)} />}
          {visitBound && <Text style={{ color: palette.secondary }}>This customer and service property come from the assigned estimate visit and cannot be changed here.</Text>}
          {!draft.customerId && ['name', 'email', 'phone', 'address'].map(name => { const key = `prospect.${name}`; return <GlassInput key={name} label={`Prospect ${name}`} value={name === 'phone' ? displayPhone(draft.prospect[name]) : draft.prospect[name] || ''} editable={!fieldsDisabled && !visitBound} inputRef={node => { fieldRefs.current[key] = node; }} error={fieldErrors[key]} keyboardType={name === 'email' ? 'email-address' : name === 'phone' ? 'phone-pad' : 'default'} autoCapitalize={name === 'email' ? 'none' : 'sentences'} onFocus={() => revealField(key, false)} onChangeText={value => change('prospect', { ...draft.prospect, [name]: name === 'phone' ? formatPhone(value) : value }, key)} />; })}
        </GlassCard>
        {editable && templates.some(template => template.lineItems?.length) && <GlassCard><Text style={{ color: palette.text, fontWeight: '700' }}>Company estimate templates</Text><Text style={{ color: palette.secondary }}>Selecting a template copies its current scope and prices into this draft.</Text>{templates.filter(template => template.lineItems?.length).map(template => <GlassButton key={template.id} secondary title={`Use ${template.name}`} disabled={fieldsDisabled} onPress={() => applyTemplate(template)} />)}</GlassCard>}
        <GlassCard>{input('Estimate title', 'title')}{input('Service type', 'serviceType')}{input('Scope of work', 'scopeOfWork', { multiline: true })}<NoteAudience audience="customer" />{input('Customer notes', 'notes', { multiline: true })}<NoteAudience />{input('Technician notes', 'technicianNotes', { multiline: true })}{permissions.can('estimates.manage') && <><NoteAudience audience="management" />{input('Internal review notes', 'internalReviewNotes', { multiline: true })}</>}
          {permissions.isTechnician && <Text style={{ color: palette.secondary }}>Pricing is optional for technicians. Record the inspection scope and evidence; management finalizes customer-facing quantities, pricing, tax, and delivery in the web app.</Text>}
          {draft.lineItems.map((line, index) => <View key={index} style={{ gap: 10, paddingVertical: 12, borderTopWidth: 1, borderColor: palette.border }}><Text style={{ color: palette.text, fontWeight: '600' }}>{line.kind} line {index + 1}</Text>{[['description', 'Description'], ['quantity', 'Quantity'], ['unitPrice', 'Unit price ($)']].map(([field, label]) => { const key = `lineItems.${index}.${field}`; return <GlassInput key={field} label={`${label} ${index + 1}`} value={String(line[field] ?? '')} editable={!fieldsDisabled} inputRef={node => { fieldRefs.current[key] = node; if (!fieldRefs.current.lineItems) fieldRefs.current.lineItems = node; }} error={fieldErrors[key] || field === 'description' && fieldErrors.lineItems} keyboardType={field === 'description' ? 'default' : 'decimal-pad'} onFocus={() => revealField(key, false)} onChangeText={value => change('lineItems', draft.lineItems.map((item, at) => at === index ? { ...item, [field]: value } : item), fieldErrors.lineItems ? 'lineItems' : key)} />; })}{editable && <GlassButton secondary title={`Remove line ${index + 1}`} disabled={fieldsDisabled} onPress={() => change('lineItems', draft.lineItems.filter((_item, at) => at !== index))} />}</View>)}
          {editable && <View style={{ gap: 8 }}><GlassButton secondary title="Add labor line" disabled={fieldsDisabled} onPress={() => change('lineItems', [...draft.lineItems, blankLine('labor')])} /><GlassButton secondary title="Add material line" disabled={fieldsDisabled} onPress={() => change('lineItems', [...draft.lineItems, blankLine('material')])} /></View>}
          {input('Tax rate (%)', 'taxRate', { keyboardType: 'decimal-pad' })}{input('Valid for days (1–90)', 'validDays', { keyboardType: 'number-pad' })}
          {editable && <GlassButton title={uncertain ? 'Retry saved request' : 'Save estimate version'} busy={busy} disabled={busy || !dirty || accessStatus !== 'ready'} onPress={save} />}
          {record && estimatePermissions.canSubmit && !dirty && <GlassButton title="Submit for Review" disabled={busy || uncertain || draftState !== 'server'} onPress={() => run(async ticket => { await callEstimate('submit-review', { estimateId: record.id, expectedVersion: record.version }); const latest = await callEstimate('get', { estimateId: record.id }); if (current(ticket)) { setRecord(latest.estimate); setEstimatePermissions(latest.permissions || {}); setDraftState('server'); setMessage('Estimate submitted for management review.'); } })} />}
          {uncertain && <Text style={{ color: palette.secondary }}>The previous save needs confirmation. Retry that same request before editing; a retry will not create a duplicate estimate.</Text>}
        </GlassCard>
        {record && !record.legacy && <GlassCard><Text style={{ color: palette.text, fontWeight: '700' }}>Management handoff</Text>
          <Text style={{ color: palette.secondary }}>{record.status === 'submitted-for-review' ? 'Submitted to management. This version is read-only while management reviews it in the Route Logistics web app.' : permissions.isTechnician ? 'Save this draft to the server, then submit it for review. Management finalizes pricing, previews the customer PDF, authorizes delivery, and sends the email from the web app.' : 'Formal review, PDF preview, delivery approval, and customer email are completed in the Route Logistics web app.'}</Text>
          {!!record.reviewComments && <Text style={{ color: palette.secondary }}>Management review: {record.reviewComments}</Text>}
          {record.status === 'approved' && !record.convertedJobId && !record.jobId && canConvert && <>
            <Text style={{ color: palette.text, fontWeight: '700' }}>Convert approved estimate</Text>
            {!record.customerId && <><Text style={{ color: palette.secondary }}>Use an existing customer with the approved prospect’s email, or explicitly create a customer from that approved contact.</Text>
              {customers.filter(customer => customer.email?.toLowerCase().trim() === record.recipient?.email?.toLowerCase().trim()).slice(0, 10).map(customer => <GlassButton secondary key={customer.id} title={`${conversionCustomerId === customer.id ? '✓ ' : ''}Use ${customer.name}`} onPress={() => { setConversionCustomerId(customer.id); setCreateCustomer(false); }} disabled={busy} />)}
              <Pressable accessibilityRole="checkbox" accessibilityLabel="Create customer from approved prospect" accessibilityState={{ checked: createCustomer }} onPress={() => { setCreateCustomer(value => !value); setConversionCustomerId(''); }} disabled={busy} style={{ minHeight: 48, padding: 12, borderWidth: 1, borderColor: palette.border, borderRadius: 12 }}><Text style={{ color: palette.text }}>{createCustomer ? '☑' : '☐'} Create customer from approved prospect</Text></Pressable>
            </>}
            <GlassInput label="Job service date (YYYY-MM-DD)" value={schedule.date} onChangeText={date => setSchedule(previous => ({ ...previous, date }))} />
            <QuarterHourTimeField label="Job time" value={schedule.time} disabled={busy} onChange={time => setSchedule(previous => ({ ...previous, time }))} />
            <GlassButton title="Convert approved estimate to job" disabled={busy || dirty || (!record.customerId && !createCustomer && !conversionCustomerId)} onPress={() => setConfirm('convert')} />
          </>}
          {!!(record.convertedJobId || record.jobId) && <Text style={{ color: palette.accent }}>Converted job: {record.convertedJobId || record.jobId}. Repeating conversion will not create another job.</Text>}
        </GlassCard>}
        {!!versions.length && <GlassCard><Text style={{ color: palette.text, fontWeight: '700' }}>Version history</Text>{versions.map(version => <Text key={version.version} style={{ color: palette.secondary }}>v{version.version} · {version.status} · {money(version.totalCents)}</Text>)}</GlassCard>}
        {confirm && <GlassCard><Text style={{ color: palette.text, lineHeight: 22 }}>{confirm === 'leave' ? 'Discard this device draft and its unsynchronized photos? Saved server versions remain.' : createCustomer ? 'Create a customer from the approved prospect and an unassigned scheduled job?' : 'Create an unassigned scheduled job from this approved estimate?'}</Text><GlassButton title={confirm === 'leave' ? 'Discard device draft and close' : 'Confirm job conversion'} disabled={busy} onPress={() => confirm === 'leave' ? run(async () => { await discardEstimateDraft(draftIdentity, photos); setEditing(false); setDirty(false); setDraftState('server'); setUncertain(false); pendingSave.current = null; setConfirm(null); }) : run(async ticket => { const result = await callEstimate('convert', { estimateId: record.id, expectedVersion: record.version, ...conversionInput(schedule, { customerId: conversionCustomerId, createCustomer }) }); if (!current(ticket)) return; setConfirm(null); setMessage(`Approved estimate converted to job ${result.jobId}.`); const latest = await callEstimate('get', { estimateId: record.id }); if (current(ticket)) { setRecord(latest.estimate); setDraft(draftFromEstimate(latest.estimate)); setVersions(latest.versions || []); setEstimatePermissions(latest.permissions || {}); } })} /><GlassButton secondary title="Keep estimate open" disabled={busy} onPress={() => setConfirm(null)} /></GlassCard>}
      </>}
    </KeyboardAwareScrollView>
  </View>;
}
