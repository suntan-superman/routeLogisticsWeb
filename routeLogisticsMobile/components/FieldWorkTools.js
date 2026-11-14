import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Linking } from 'react-native';
import { JobService } from '../services/firebase';
import { saveApplicationOffline, cachedRead, queuedWork, subscribeOffline } from '../services/offline';
import { readWorkspace } from '../services/workspaceApi';
import { getClaims } from '../services/tenancy';
import { useTheme } from '../theme/ThemeProvider';
import { Card, SectionHeader, PrimaryButton, SecondaryButton, FormField, InlineNotice, StatusBadge } from './MobileUI';

const applicationFields = { product: 'Product', targetPest: 'Target pest', amount: 'Quantity', unit: 'Unit', epaRegNo: 'EPA registration', areaTreated: 'Area treated', method: 'Method', applicatorLicense: 'Applicator license', notes: 'Application notes' };
const emptyApplication = () => Object.fromEntries(Object.keys(applicationFields).map(key => [key, '']));
const workNotes = job => ['pending', 'syncing'].includes(job?.syncState) && job?.syncPatch?.notes != null ? job.syncPatch.notes
  : job?.workNotes || (getClaims()?.role === 'technician' ? job?.notes : '') || '';

export default function FieldWorkTools({ job, onChanged, onDraftChange, onBusyChange, showNavigation = true, readOnly = false }) {
  const { palette } = useTheme();
  const [notes, setNotes] = useState(() => workNotes(job)), [dirty, setDirty] = useState(false), [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [records, setRecords] = useState([]), [recordsError, setRecordsError] = useState('');
  const mounted = useRef(false), generation = useRef(0), lock = useRef(false), sequence = useRef(0), dirtyRef = useRef(false);
  const callbacks = useRef({ onChanged, onDraftChange, onBusyChange }), target = useRef(job);
  callbacks.current = { onChanged, onDraftChange, onBusyChange }; target.current = job;
  const current = (ticket, id) => mounted.current && generation.current === ticket && target.current?.id === id;
  const allowWork = !readOnly && !['completed', 'cancelled', 'canceled'].includes(job?.status);
  const loadRecords = useCallback(async () => {
    const selected = target.current, ticket = generation.current, request = ++sequence.current;
    if (!selected?.id) return;
    const [remote, local] = await Promise.allSettled([
      cachedRead(`applications:${selected.id}`, async () => (await readWorkspace('serviceLogs', { jobId: selected.id })).logs),
      Promise.resolve().then(() => queuedWork()),
    ]);
    if (!current(ticket, selected.id) || request !== sequence.current) return;
    if (remote.status === 'rejected' && ['functions/permission-denied', 'functions/unauthenticated'].includes(remote.reason?.code)) {
      setRecords([]); setRecordsError(remote.reason.message); return;
    }
    const saved = remote.status === 'fulfilled' ? remote.value || [] : [];
    const pending = local.status === 'fulfilled' ? local.value.filter(row => row.kind === 'application' && row.jobId === selected.id && !['synced', 'discarded'].includes(row.state)).map(row => ({ ...row.record, id: row.id, syncState: row.state, error: row.error })) : [];
    setRecords([...saved, ...pending]);
    setRecordsError([remote.status === 'rejected' ? remote.reason.message : '', local.status === 'rejected' ? local.reason.message : ''].filter(Boolean).join('\n'));
  }, []);
  useEffect(() => {
    mounted.current = true; generation.current++; lock.current = false; dirtyRef.current = false;
    setNotes(workNotes(job)); setDirty(false); setForm(null); setBusy(false); setError(''); setNotice(''); setRecords([]); setRecordsError('');
    loadRecords(); const unsubscribe = subscribeOffline(loadRecords);
    return () => { mounted.current = false; generation.current++; sequence.current++; unsubscribe(); callbacks.current.onBusyChange?.(false); callbacks.current.onDraftChange?.(false); };
  }, [job?.id, loadRecords]);
  useEffect(() => { if (!dirtyRef.current) setNotes(workNotes(job)); }, [job?.workNotes, job?.notes, job?.syncPatch?.notes, job?.syncState]);
  useEffect(() => { callbacks.current.onDraftChange?.(dirty || !!form); }, [dirty, form]);
  const perform = async action => {
    if (lock.current || !allowWork) return;
    const selected = { ...target.current }, ticket = generation.current;
    lock.current = true; setBusy(true); callbacks.current.onBusyChange?.(true); setError(''); setNotice('');
    try { await action(selected, ticket); }
    catch (failure) { if (current(ticket, selected.id)) setError(failure.message || 'Could not save this work. Your draft is retained; try again.'); }
    finally {
      lock.current = false;
      if (current(ticket, selected.id)) { setBusy(false); callbacks.current.onBusyChange?.(false); }
    }
  };
  const changed = async (ticket, id) => {
    try { await callbacks.current.onChanged?.(); }
    catch (failure) { if (current(ticket, id)) setError(`Work is saved. The updated schedule could not be refreshed: ${failure.message || 'Try pull-to-refresh.'}`); }
  };
  const save = patch => perform(async (selected, ticket) => {
    const result = await JobService.updateJob(selected.id, patch);
    if (!result.success) throw new Error(result.error?.message || result.error || 'Unable to save work. Try again.');
    if (!current(ticket, selected.id)) return;
    if ('notes' in patch) { dirtyRef.current = false; setDirty(false); }
    setNotice(result.queued ? 'Work saved on this device. Synchronization will check your current assignment.' : 'Work saved.');
    await changed(ticket, selected.id);
  });
  const saveApplication = () => {
    if (!form.product.trim() || !form.targetPest.trim() || !Number.isFinite(Number(form.amount)) || Number(form.amount) <= 0) { setError('Enter a product, target pest and positive quantity before saving.'); return; }
    const record = { ...form, amount: Number(form.amount) };
    perform(async (selected, ticket) => {
      await saveApplicationOffline(selected.id, record);
      if (!current(ticket, selected.id)) return;
      setForm(null); setNotice('Application saved on this device. Check synchronization status before leaving.'); await loadRecords(); await changed(ticket, selected.id);
    });
  };
  if (!job?.id) return null;
  const address = [job.address, job.city, job.state, job.zipCode].filter(value => typeof value === 'string').join(', ');
  const destination = typeof job.latitude === 'number' && typeof job.longitude === 'number' ? `${job.latitude},${job.longitude}` : address;
  return <View style={{ gap: 20 }}>
    {!!error && <InlineNotice tone="error" message={error} />}
    {!!notice && <InlineNotice tone="success" message={notice} />}
    {showNavigation && !!destination && <SecondaryButton title="Navigate to job" icon="navigate-outline" onPress={() => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`).catch(failure => setError(failure.message || 'Navigation could not open. Check your map application.'))} />}
    {allowWork && ['scheduled', 'en-route'].includes(job.status) && <Card><SectionHeader title="Work progress" subtitle="Update your progress as you travel and begin the visit." />
      {job.status === 'scheduled' && <PrimaryButton title="Mark en route" busy={busy} onPress={() => save({ status: 'en-route' })} />}
      <SecondaryButton title="Start work" busy={busy} onPress={() => save({ status: 'in-progress' })} />
    </Card>}
    <Card><SectionHeader title="Work notes" subtitle="Document observations and work instructions for this visit." />
      {allowWork ? <><FormField label="Work notes" value={notes} onChangeText={value => { dirtyRef.current = true; setNotes(value); setDirty(true); }} editable={!busy} multiline />
        <SecondaryButton title="Save work notes" disabled={!dirty} busy={busy} onPress={() => save({ notes })} /></> : <Text style={{ color: palette.text, fontSize: 15, lineHeight: 23 }}>{notes || 'No work notes recorded.'}</Text>}
    </Card>
    <Card><SectionHeader title="Product applications" subtitle="Application records for this assigned visit." />
      {!!recordsError && <InlineNotice tone="error" message={recordsError} />}
      {!records.length && !recordsError && <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 22 }}>No product applications recorded.</Text>}
      {records.map(record => <View key={record.id} style={{ gap: 5, paddingVertical: 12, borderTopWidth: 1, borderColor: palette.border }}>
        <Text style={{ color: palette.text, fontSize: 16, lineHeight: 23, fontWeight: '600' }}>{record.product}</Text><Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 21 }}>{[record.targetPest, record.amount != null ? `${record.amount} ${record.unit || ''}`.trim() : '', record.areaTreated].filter(Boolean).join(' · ')}</Text>
        {!!record.epaRegNo && <Text style={{ color: palette.secondary, fontSize: 13, lineHeight: 20 }}>EPA registration: {record.epaRegNo}</Text>}{!!record.notes && <Text style={{ color: palette.text, fontSize: 14, lineHeight: 21 }}>{record.notes}</Text>}
        {!!record.syncState && <StatusBadge syncState={record.syncState} />}{!!record.error && <InlineNotice tone="error" message={record.error} />}
      </View>)}
      {allowWork && (!form ? <SecondaryButton title="Record product application" icon="add-outline" disabled={busy} onPress={() => { setError(''); setForm(emptyApplication()); }} /> : <View style={{ gap: 12 }}>
        {Object.entries(applicationFields).map(([key, label]) => <FormField key={key} label={label} value={form[key]} onChangeText={value => setForm(previous => ({ ...previous, [key]: value }))} editable={!busy} multiline={key === 'notes'} keyboardType={key === 'amount' ? 'decimal-pad' : 'default'} />)}
        <PrimaryButton title="Save application" busy={busy} onPress={saveApplication} /><SecondaryButton title="Cancel application" disabled={busy} onPress={() => { setForm(null); setError(''); }} />
      </View>)}
    </Card>
  </View>;
}
