import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Crypto from 'expo-crypto';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { GlassButton, GlassCard, GlassInput } from '../components/Glass';
import { ScreenHeader } from '../components/MobileUI';
import { CustomerService } from '../services/firebase';
import { beginNativeInteraction } from '../services/nativeInteraction';
import { callEstimate, prepareEstimatePhoto, shareEstimatePdf } from '../services/estimateService';
import { blankEstimate, blankLine, draftFromEstimate, estimateInput, money, conversionInput } from '../../functions/shared/estimateClient';

export default function EstimatesScreen({ onInteractionChange, active = true }) {
  const { user, permissions, accessStatus = 'ready' } = useAuth(), { palette } = useTheme();
  const allowed = permissions.can('estimates.manage'), scope = [user.id, user.companyId, user.role, user.membershipId].join(':');
  const [rows, setRows] = useState([]), [customers, setCustomers] = useState([]), [enabled, setEnabled] = useState(false), [emailEnabled, setEmailEnabled] = useState(false);
  const [editing, setEditing] = useState(false), [record, setRecord] = useState(null), [draft, setDraft] = useState(blankEstimate), [photos, setPhotos] = useState([]), [versions, setVersions] = useState([]);
  const [search, setSearch] = useState(''), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [uncertain, setUncertain] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [confirm, setConfirm] = useState(null);
  const [schedule, setSchedule] = useState({ date: '', time: '09:00' });
  const [createCustomer, setCreateCustomer] = useState(false), [conversionCustomerId, setConversionCustomerId] = useState('');
  const [delivery, setDelivery] = useState(null);
  const live = useRef(false), generation = useRef(0), locked = useRef(false), callbacks = useRef(onInteractionChange), pendingSave = useRef(null), target = useRef(record), photoRef = useRef(photos);
  callbacks.current = onInteractionChange; target.current = record; photoRef.current = photos;
  useEffect(() => { callbacks.current?.({ busy, hasDraft: dirty || uncertain }); }, [busy, dirty, uncertain]);
  const current = ticket => live.current && generation.current === ticket;
  const load = async () => {
    const ticket = generation.current; if (!allowed || accessStatus !== 'ready') return;
    const result = await callEstimate('list'); if (!current(ticket)) return;
    setRows(result.estimates || []); setEnabled(result.enabled === true); setEmailEnabled(result.emailEnabled === true);
    const customerResult = await CustomerService.getCustomers(); if (current(ticket) && customerResult.success) setCustomers(customerResult.customers || []);
  };
  useEffect(() => { live.current = true; generation.current++; setRows([]); setEditing(false); setPhotos([]); setRecord(null); setDirty(false); setUncertain(false); pendingSave.current = null;
    if (allowed && active && accessStatus === 'ready') load().catch(failure => { if (live.current) setError(failure.message); });
    return () => { live.current = false; generation.current++; callbacks.current?.({ busy: false, hasDraft: false }); };
  }, [scope, allowed]);
  useEffect(() => { if (active && allowed && accessStatus === 'ready' && !editing) load().catch(failure => { if (live.current) setError(failure.message); }); }, [active, accessStatus]);
  const change = (name, value) => { if (locked.current || uncertain) return; setDraft(previous => ({ ...previous, [name]: value })); setDirty(true); };
  const run = async work => {
    if (locked.current || accessStatus !== 'ready') return;
    locked.current = true; const ticket = generation.current; setBusy(true); setError(''); setMessage('');
    try { await work(ticket); } catch (failure) { if (current(ticket)) setError(failure.message || 'The estimate operation failed. Your current draft and photo selection are retained.'); }
    finally { if (current(ticket)) { locked.current = false; setBusy(false); } }
  };
  const open = estimate => run(async ticket => {
    const result = await callEstimate('get', { estimateId: estimate.id }); if (!current(ticket)) return;
    setRecord(result.estimate); setDraft(draftFromEstimate(result.estimate)); setPhotos((result.photos || []).map(photo => ({ ...photo, remoteId: photo.id, attached: true }))); setVersions(result.versions || []); setEmailEnabled(result.emailEnabled === true); setDelivery(result.delivery || null); setEditing(true); setDirty(false); setUncertain(false); setConfirm(null); setCreateCustomer(false); setConversionCustomerId(''); pendingSave.current = null;
  });
  const startNew = () => { setRecord(null); setDraft(blankEstimate()); setPhotos([]); setVersions([]); setEditing(true); setDirty(true); setUncertain(false); setError(''); setMessage(''); pendingSave.current = null; };
  const save = () => run(async ticket => {
    let next = record, values = estimateInput(draft), contentSaved = false;
    const persist = async data => {
      if (!pendingSave.current) pendingSave.current = { operationId: Crypto.randomUUID(), ...(next ? { estimateId: next.id, expectedVersion: next.version } : {}), data };
      setUncertain(true);
      const result = await callEstimate('save', pendingSave.current); if (!current(ticket)) return null;
      next = result.estimate; pendingSave.current = null; contentSaved = true; setUncertain(false); setRecord(next); return next;
    };
    if (!next || pendingSave.current || next.status !== 'draft' || !photoRef.current.some(photo => !photo.remoteId)) { if (!(await persist(values))) return; }
    const uploaded = [...photoRef.current];
    for (let index = 0; index < uploaded.length; index++) {
      if (uploaded[index].remoteId) continue;
      let photo = uploaded[index];
      if (!photo.compressed) { const compressed = await prepareEstimatePhoto(photo.asset); if (!current(ticket)) return; photo = { ...photo, compressed }; uploaded[index] = photo; setPhotos([...uploaded]); }
      const result = await callEstimate('photo-upload', { estimateId: next.id, operationId: photo.id, base64: photo.compressed.base64, caption: photo.caption || '' }); if (!current(ticket)) return;
      uploaded[index] = { ...photo, remoteId: result.id }; setPhotos([...uploaded]);
    }
    const photoIds = uploaded.map(photo => photo.remoteId).filter(Boolean);
    if (photoIds.join() !== (next.photoIds || []).join() || (!contentSaved && dirty)) { values = { ...values, photoIds }; if (!(await persist(values))) return; }
    if (!current(ticket)) return;
    setDraft(draftFromEstimate(next)); setPhotos(uploaded.map(photo => ({ ...photo, attached: true }))); setDirty(false); setVersions(previous => [{ version: next.version, status: next.status, totalCents: next.totalCents }, ...previous.filter(item => item.version !== next.version)]); setMessage('Estimate saved. Amounts and this version were calculated on the server.'); await load();
  });
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
      setPhotos(previous => [...previous, { id: Crypto.randomUUID(), asset, uri: asset.uri, caption: '' }]); setDirty(true); setMessage('Photo selected. Save the estimate to upload and attach it to the next version.');
    } finally { release(); }
  });
  if (!allowed) return <View><Text accessibilityRole="alert" style={{ color: palette.danger }}>Estimate management is not available for your role.</Text></View>;
  const editable = enabled && !record?.legacy && !record?.convertedJobId && !record?.jobId && !['approved', 'converted'].includes(record?.status), fieldsDisabled = busy || uncertain || !editable;
  const canConvert = permissions.can('customers.manage') && permissions.can('jobs.schedule');
  const input = (label, name, options = {}) => <GlassInput label={label} value={String(draft[name] || '')} editable={!fieldsDisabled} onChangeText={value => change(name, value)} {...options} />;
  const close = () => { if (dirty || uncertain) setConfirm('leave'); else setEditing(false); };
  return <View style={{ flex: 1 }}><ScreenHeader title="Estimates" subtitle="Photos, scope and a priced proposal" onBack={editing ? close : undefined} />
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 16 }}>
      {!!error && <Text accessibilityRole="alert" style={{ color: palette.danger, lineHeight: 22 }}>{error}</Text>}{!!message && <Text accessibilityLiveRegion="polite" style={{ color: palette.accent, lineHeight: 22 }}>{message}</Text>}
      {!enabled && <Text style={{ color: palette.secondary }}>New estimate workflows await production activation. Existing estimates remain available to review.</Text>}
      {!editing ? <><GlassButton title="New photo estimate" disabled={busy || !enabled || accessStatus !== 'ready'} onPress={startNew} /><GlassButton secondary title="Refresh estimates" disabled={busy} onPress={() => run(load)} />
        {rows.map(estimate => <GlassCard key={estimate.id}><Text style={{ color: palette.text, fontSize: 17, fontWeight: '700' }}>{estimate.title || estimate.serviceType || 'Legacy estimate'}</Text><Text style={{ color: palette.secondary }}>{estimate.customerName || estimate.recipient?.name || estimate.prospect?.name || 'Customer'} · {estimate.status || 'Legacy'} · {estimate.legacy ? 'Read-only legacy' : `v${estimate.version}`}</Text>{Number.isFinite(estimate.totalCents) && <Text style={{ color: palette.text }}>{money(estimate.totalCents)}</Text>}<GlassButton secondary title="Open estimate" onPress={() => open(estimate)} disabled={busy} /></GlassCard>)}
        {!rows.length && <Text style={{ color: palette.secondary }}>No estimates yet. Start with photos of the requested work.</Text>}</> : <>
        {record && <GlassCard><Text style={{ color: palette.text, fontWeight: '700' }}>{record.legacy ? 'Read-only legacy estimate' : `Version ${record.version} · ${record.status}`}</Text>{Number.isFinite(record.totalCents) && <><Text style={{ color: palette.secondary }}>Subtotal {money(record.subtotalCents)} · Tax {money(record.taxCents)}</Text><Text style={{ color: palette.text, fontSize: 22, fontWeight: '700' }}>Server total {money(record.totalCents)}</Text></>}{dirty && <Text style={{ color: palette.secondary }}>Changes and selected photos are not part of the saved version yet.</Text>}</GlassCard>}
        {record && !editable && enabled && <GlassButton secondary title="Copy scope and pricing to a new draft" disabled={busy} onPress={() => { setDraft({ ...draftFromEstimate(record), photoIds: [] }); setRecord(null); setPhotos([]); setVersions([]); setDelivery(null); setConfirm(null); setDirty(true); setMessage('New draft copied. Original approvals, photos and jobs remain unchanged. Add photos for this new proposal.'); }} />}
        <GlassCard><Text style={{ color: palette.text, fontWeight: '700' }}>Work photos · {photos.length}/6</Text>{editable && <><GlassButton title="Take estimate photo" disabled={fieldsDisabled} onPress={() => pick(true)} /><GlassButton secondary title="Choose estimate photo" disabled={fieldsDisabled} onPress={() => pick(false)} /></>}
          {photos.map((photo, index) => <View key={photo.id} style={{ gap: 8 }}>{(photo.uri || photo.dataUri) ? <Image source={{ uri: photo.uri || photo.dataUri }} style={{ height: 180, borderRadius: 12 }} resizeMode="cover" /> : <GlassButton secondary title={`View saved photo ${index + 1}`} disabled={busy} onPress={() => run(async ticket => { const result = await callEstimate('photo-read', { estimateId: record.id, photoId: photo.remoteId }); if (current(ticket)) setPhotos(previous => previous.map(item => item.id === photo.id ? { ...item, dataUri: result.dataUri } : item)); })} />}<Text style={{ color: palette.secondary }}>{photo.attached ? 'Attached to saved version' : photo.remoteId ? 'Uploaded · save to attach' : 'Selected · retained for upload'}</Text>{!photo.attached && <GlassInput label={`Photo ${index + 1} caption`} value={photo.caption || ''} editable={!fieldsDisabled} onChangeText={caption => { setPhotos(previous => previous.map(item => item.id === photo.id ? { ...item, caption } : item)); setDirty(true); }} />}</View>)}
        </GlassCard>
        <GlassCard><Text style={{ color: palette.text, fontWeight: '700' }}>Customer or prospect</Text><GlassInput label="Find customer" value={search} onChangeText={setSearch} editable={!fieldsDisabled} />
          {draft.customerId && <Text style={{ color: palette.accent }}>Linked customer: {customers.find(customer => customer.id === draft.customerId)?.name || record?.customerName || draft.customerId}</Text>}
          {!fieldsDisabled && customers.filter(customer => search && customer.name?.toLowerCase().includes(search.toLowerCase())).slice(0, 6).map(customer => <GlassButton key={customer.id} secondary title={customer.name} onPress={() => { change('customerId', customer.id); setSearch(''); }} />)}
          <GlassButton secondary title={draft.customerId ? 'Use a prospect instead' : 'Refresh customer choices'} disabled={fieldsDisabled} onPress={() => draft.customerId ? change('customerId', '') : run(load)} />
          {!draft.customerId && ['name', 'email', 'phone', 'address'].map(name => <GlassInput key={name} label={`Prospect ${name}`} value={draft.prospect[name] || ''} editable={!fieldsDisabled} keyboardType={name === 'email' ? 'email-address' : name === 'phone' ? 'phone-pad' : 'default'} autoCapitalize={name === 'email' ? 'none' : 'sentences'} onChangeText={value => change('prospect', { ...draft.prospect, [name]: value })} />)}
        </GlassCard>
        <GlassCard>{input('Estimate title', 'title')}{input('Service type', 'serviceType')}{input('Scope of work', 'scopeOfWork', { multiline: true })}{input('Customer notes', 'notes', { multiline: true })}
          {draft.lineItems.map((line, index) => <View key={index} style={{ gap: 10, paddingVertical: 12, borderTopWidth: 1, borderColor: palette.border }}><Text style={{ color: palette.text, fontWeight: '600' }}>{line.kind} line {index + 1}</Text>{[['description', 'Description'], ['quantity', 'Quantity'], ['unitPrice', 'Unit price ($)']].map(([field, label]) => <GlassInput key={field} label={`${label} ${index + 1}`} value={String(line[field] ?? '')} editable={!fieldsDisabled} keyboardType={field === 'description' ? 'default' : 'decimal-pad'} onChangeText={value => change('lineItems', draft.lineItems.map((item, at) => at === index ? { ...item, [field]: value } : item))} />)}{editable && <GlassButton secondary title={`Remove line ${index + 1}`} disabled={fieldsDisabled} onPress={() => change('lineItems', draft.lineItems.filter((_item, at) => at !== index))} />}</View>)}
          {editable && <View style={{ gap: 8 }}><GlassButton secondary title="Add labor line" disabled={fieldsDisabled} onPress={() => change('lineItems', [...draft.lineItems, blankLine('labor')])} /><GlassButton secondary title="Add material line" disabled={fieldsDisabled} onPress={() => change('lineItems', [...draft.lineItems, blankLine('material')])} /></View>}
          {input('Tax rate (%)', 'taxRate', { keyboardType: 'decimal-pad' })}{input('Valid for days (1–90)', 'validDays', { keyboardType: 'number-pad' })}
          {editable && <GlassButton title={uncertain ? 'Retry saved request' : 'Save estimate version'} busy={busy} disabled={busy || !dirty || accessStatus !== 'ready'} onPress={save} />}
          {uncertain && <Text style={{ color: palette.secondary }}>The previous save needs confirmation. Retry that same request before editing; a retry will not create a duplicate estimate.</Text>}
        </GlassCard>
        {record && !record.legacy && <GlassCard><Text style={{ color: palette.text, fontWeight: '700' }}>Share and approval</Text><Text style={{ color: palette.secondary }}>Save all changes before generating a PDF or emailing the current version. Revising a proposal requires approval of the new version.</Text><GlassButton secondary title="Share estimate PDF" disabled={busy || dirty || uncertain} onPress={() => run(() => shareEstimatePdf(record.id, record.version))} />
          <GlassButton title="Email estimate for approval" disabled={busy || dirty || uncertain || !emailEnabled || !editable} onPress={() => setConfirm('deliver')} />{!emailEnabled && <Text style={{ color: palette.secondary }}>Estimate email delivery is not enabled.</Text>}
          <Text style={{ color: palette.secondary }}>Email status: {{ queued: 'Queued', sending: 'Sending', sent: 'Accepted by email service', failed: 'Failed', cancelled: 'Cancelled' }[delivery?.status] || delivery?.status || 'Not queued for this version'}{delivery ? ` · ${delivery.attempts || 0} attempts` : ''}{delivery?.failureCode ? ` · ${delivery.failureCode}` : ''}{delivery?.sentAt ? ` · ${new Date(delivery.sentAt).toLocaleString()}` : ''}. Estimate status “sent” alone does not verify email delivery.</Text>
          <GlassButton secondary title="Refresh delivery status" disabled={busy} onPress={() => run(async ticket => { const latest = await callEstimate('get', { estimateId: record.id }); if (current(ticket)) { setDelivery(latest.delivery || null); setVersions(latest.versions || []); if (latest.estimate.version === record.version) setRecord(latest.estimate); else setMessage('A newer estimate version exists. Return to the list and reopen it before continuing.'); } })} />
          {record.status === 'approved' && !record.convertedJobId && !record.jobId && canConvert && <>
            <Text style={{ color: palette.text, fontWeight: '700' }}>Convert approved estimate</Text>
            {!record.customerId && <><Text style={{ color: palette.secondary }}>Use an existing customer with the approved prospect’s email, or explicitly create a customer from that approved contact.</Text>
              {customers.filter(customer => customer.email?.toLowerCase().trim() === record.recipient?.email?.toLowerCase().trim()).slice(0, 10).map(customer => <GlassButton secondary key={customer.id} title={`${conversionCustomerId === customer.id ? '✓ ' : ''}Use ${customer.name}`} onPress={() => { setConversionCustomerId(customer.id); setCreateCustomer(false); }} disabled={busy} />)}
              <Pressable accessibilityRole="checkbox" accessibilityLabel="Create customer from approved prospect" accessibilityState={{ checked: createCustomer }} onPress={() => { setCreateCustomer(value => !value); setConversionCustomerId(''); }} disabled={busy} style={{ minHeight: 48, padding: 12, borderWidth: 1, borderColor: palette.border, borderRadius: 12 }}><Text style={{ color: palette.text }}>{createCustomer ? '☑' : '☐'} Create customer from approved prospect</Text></Pressable>
            </>}
            <GlassInput label="Job service date (YYYY-MM-DD)" value={schedule.date} onChangeText={date => setSchedule(previous => ({ ...previous, date }))} />
            <GlassInput label="Job time (HH:mm)" value={schedule.time} onChangeText={time => setSchedule(previous => ({ ...previous, time }))} />
            <GlassButton title="Convert approved estimate to job" disabled={busy || dirty || (!record.customerId && !createCustomer && !conversionCustomerId)} onPress={() => setConfirm('convert')} />
          </>}
          {!!(record.convertedJobId || record.jobId) && <Text style={{ color: palette.accent }}>Converted job: {record.convertedJobId || record.jobId}. Repeating conversion will not create another job.</Text>}
        </GlassCard>}
        {!!versions.length && <GlassCard><Text style={{ color: palette.text, fontWeight: '700' }}>Version history</Text>{versions.map(version => <Text key={version.version} style={{ color: palette.secondary }}>v{version.version} · {version.status} · {money(version.totalCents)}</Text>)}</GlassCard>}
        {confirm && <GlassCard><Text style={{ color: palette.text, lineHeight: 22 }}>{confirm === 'leave' ? 'Leave this estimate and discard unsaved input and selected photos? Saved server versions remain.' : confirm === 'deliver' ? `Email saved version ${record.version} to its customer/prospect for approval?` : createCustomer ? 'Create a customer from the approved prospect and an unassigned scheduled job?' : 'Create an unassigned scheduled job from this approved estimate?'}</Text><GlassButton title={confirm === 'leave' ? 'Discard input and close' : confirm === 'deliver' ? 'Confirm estimate email' : 'Confirm job conversion'} disabled={busy} onPress={() => confirm === 'leave' ? (setEditing(false), setDirty(false), setUncertain(false), pendingSave.current = null, setConfirm(null)) : run(async ticket => { const result = await callEstimate(confirm === 'deliver' ? 'deliver' : 'convert', { estimateId: record.id, expectedVersion: record.version, ...(confirm === 'convert' ? conversionInput(schedule, { customerId: conversionCustomerId, createCustomer }) : {}) }); if (!current(ticket)) return; setConfirm(null); setMessage(confirm === 'deliver' ? 'Estimate email queued. Delivery status is recorded by the email worker.' : `Approved estimate converted to job ${result.jobId}.`); const latest = await callEstimate('get', { estimateId: record.id }); if (current(ticket)) { setRecord(latest.estimate); setDraft(draftFromEstimate(latest.estimate)); setVersions(latest.versions || []); setDelivery(latest.delivery || null); } })} /><GlassButton secondary title="Keep estimate open" disabled={busy} onPress={() => setConfirm(null)} /></GlassCard>}
      </>}
    </ScrollView>
  </View>;
}
