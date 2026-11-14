import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Linking, Pressable, AppState } from 'react-native';
import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import { JobService } from '../services/firebase';
import { saveApplicationOffline, cachedRead, queuedWork, subscribeOffline, isOffline } from '../services/offline';
import { readWorkspace, callWorkspace } from '../services/workspaceApi';
import { getClaims } from '../services/tenancy';
import { useTheme } from '../theme/ThemeProvider';
import { Card, SectionHeader, PrimaryButton, SecondaryButton, FormField, InlineNotice, StatusBadge } from './MobileUI';

const applicationFields = { product: 'Product', targetPest: 'Target pest', amount: 'Quantity', unit: 'Unit', epaRegNo: 'EPA registration', areaTreated: 'Area treated', method: 'Method', applicatorLicense: 'Applicator license', notes: 'Application notes' };
const emptyApplication = () => Object.fromEntries(Object.keys(applicationFields).map(key => [key, '']));
const visitLabels = { arrived: 'Arrived', departed: 'Departed', 'access-blocked': 'Couldn’t access property' };
const visitSources = { manual: 'Reported manually', 'manual-gps': 'Reported manually with GPS evidence', 'gps-evidence': 'Estimated from GPS evidence' };
const visitTime = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString(); };
const workNotes = job => ['pending', 'syncing'].includes(job?.syncState) && job?.syncPatch?.notes != null ? job.syncPatch.notes
  : job?.workNotes || (getClaims()?.role === 'technician' ? job?.notes : '') || '';

export default function FieldWorkTools({ job, onChanged, onDraftChange, onBusyChange, showNavigation = true, readOnly = false }) {
  const { palette } = useTheme();
  const [notes, setNotes] = useState(() => workNotes(job)), [dirty, setDirty] = useState(false), [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [records, setRecords] = useState([]), [recordsError, setRecordsError] = useState('');
  const [visits, setVisits] = useState([]), [visitsError, setVisitsError] = useState(''), [visitsLoading, setVisitsLoading] = useState(false), [visitsMore, setVisitsMore] = useState(false);
  const [visitDraft, setVisitDraft] = useState(null), [visitAttempted, setVisitAttempted] = useState(false);
  const mounted = useRef(false), generation = useRef(0), lock = useRef(false), sequence = useRef(0), dirtyRef = useRef(false);
  const visitSequence = useRef(0), visitAttempt = useRef(null), lastVisitJob = useRef(job);
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
  const loadVisits = useCallback(async () => {
    const selected = target.current, ticket = generation.current, request = ++visitSequence.current;
    if (!selected?.id) return;
    setVisitsLoading(true);
    try {
      const result = await cachedRead(`visits:${selected.id}`, () => callWorkspace('rlJobVisit', { action: 'list', jobId: selected.id }));
      if (!current(ticket, selected.id) || request !== visitSequence.current) return;
      setVisits(result.events || []); setVisitsMore(result.hasMore === true); setVisitsError('');
    } catch (failure) {
      if (!current(ticket, selected.id) || request !== visitSequence.current) return;
      if (['permission-denied', 'unauthenticated', 'not-found'].includes(String(failure.code || '').split('/').pop())) setVisits([]);
      setVisitsError(failure.message || 'Could not load the visit record. Retry while connected.');
    } finally { if (current(ticket, selected.id) && request === visitSequence.current) setVisitsLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; generation.current++; lock.current = false; dirtyRef.current = false;
    setNotes(workNotes(job)); setDirty(false); setForm(null); setBusy(false); setError(''); setNotice(''); setRecords([]); setRecordsError('');
    setVisits([]); setVisitsMore(false); setVisitsError(''); setVisitDraft(null); setVisitAttempted(false); visitAttempt.current = null; lastVisitJob.current = job;
    loadRecords(); loadVisits(); const unsubscribe = subscribeOffline(loadRecords);
    return () => { mounted.current = false; generation.current++; sequence.current++; visitSequence.current++; unsubscribe(); callbacks.current.onBusyChange?.(false); callbacks.current.onDraftChange?.(false); };
  }, [job?.id, loadRecords, loadVisits]);
  useEffect(() => { if (lastVisitJob.current !== job) { lastVisitJob.current = job; loadVisits(); } }, [job, loadVisits]);
  useEffect(() => { if (!dirtyRef.current) setNotes(workNotes(job)); }, [job?.workNotes, job?.notes, job?.syncPatch?.notes, job?.syncState]);
  useEffect(() => { callbacks.current.onDraftChange?.(dirty || !!form || !!visitDraft); }, [dirty, form, visitDraft]);
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
  const openVisit = type => {
    if (lock.current || !allowWork || visitDraft) return;
    visitAttempt.current = null; setVisitAttempted(false); setError(''); setNotice('');
    setVisitDraft({ type, note: '', includeLocation: false, operationId: Crypto.randomUUID() });
  };
  const saveVisit = () => {
    if (!visitDraft) return;
    const note = visitDraft.note.trim();
    if (note.length > 1000 || (visitDraft.type === 'access-blocked' && !note)) { setError(visitDraft.type === 'access-blocked' && !note ? 'Describe why the property could not be accessed before recording this visit.' : 'Visit notes must be at most 1,000 characters.'); return; }
    return perform(async (selected, ticket) => {
      if (await isOffline()) throw new Error('Visit events require a connection and have not been queued. Your note is retained. Reconnect and retry.');
      if (!current(ticket, selected.id)) return;
      let payload = visitAttempt.current;
      if (!payload) {
        payload = { action: 'record', jobId: selected.id, type: visitDraft.type, operationId: visitDraft.operationId, note };
        if (visitDraft.includeLocation) {
          if (AppState.currentState !== 'active') throw new Error('Open Route Logistics in the foreground to include fresh GPS evidence.');
          const permission = await Location.getForegroundPermissionsAsync();
          if (!current(ticket, selected.id)) return;
          if (!permission.granted) throw new Error('Location permission is off. Turn off Include current GPS to record without location, or enable permission in device Settings.');
          let timeout;
          let position;
          try {
            position = await Promise.race([Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }), new Promise((_resolve, reject) => { timeout = setTimeout(() => reject(new Error('A fresh GPS fix could not be obtained. Try again outdoors, or turn off Include current GPS.')), 20000); })]);
          } finally { clearTimeout(timeout); }
          if (!current(ticket, selected.id)) return;
          if (AppState.currentState !== 'active') throw new Error('GPS recording was interrupted. Keep the app open and retry, or record without GPS.');
          const { latitude, longitude, accuracy } = position.coords || {};
          if (![latitude, longitude, accuracy].every(Number.isFinite) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180 || accuracy < 0
            || !Number.isFinite(position.timestamp) || Math.abs(Date.now() - position.timestamp) > 5 * 60000) throw new Error('The GPS fix is stale or invalid. Retry outdoors, or turn off Include current GPS.');
          Object.assign(payload, { latitude, longitude, accuracy, capturedAt: new Date(position.timestamp).toISOString() });
        }
        visitAttempt.current = payload; setVisitAttempted(true);
      }
      const result = await callWorkspace('rlJobVisit', payload);
      if (!current(ticket, selected.id)) return;
      if (result.event) setVisits(previous => [result.event, ...previous.filter(row => row.id !== result.event.id)]);
      setVisitDraft(null); setVisitAttempted(false); visitAttempt.current = null;
      setNotice(result.duplicate ? 'This visit event was already recorded. No duplicate was added.' : 'Visit event recorded. This does not change the job status or verify property access.');
      await loadVisits(); await changed(ticket, selected.id);
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
    <Card><SectionHeader title="Visit record" subtitle="Arrival and departure reports are separate from job status. GPS evidence does not verify property access." />
      {visitsLoading && <Text accessibilityLiveRegion="polite" style={{ color: palette.secondary, fontSize: 14, lineHeight: 22 }}>Refreshing visit record…</Text>}
      {!!visitsError && <InlineNotice tone="error" message={visitsError} />}
      {!visits.length && !visitsLoading && !visitsError && <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 22 }}>No visit events recorded.</Text>}
      {visits.map(visit => <View key={visit.id} style={{ gap: 5, paddingVertical: 12, borderTopWidth: 1, borderColor: palette.border }}>
        <Text style={{ color: palette.text, fontSize: 16, lineHeight: 23, fontWeight: '600' }}>{visitLabels[visit.type] || 'Visit event'}</Text>
        <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 22 }}>{visitTime(visit.capturedAt || visit.recordedAt)} · {visitSources[visit.source] || 'Reported visit event'}</Text>
        {Number.isFinite(visit.accuracy) && <Text style={{ color: palette.secondary, fontSize: 13, lineHeight: 21 }}>GPS accuracy: ±{Math.round(visit.accuracy)} m{Number.isFinite(visit.distanceMeters) ? ` · approximately ${Math.round(visit.distanceMeters)} m from the service location` : ''}</Text>}
        {!!visit.note && <Text style={{ color: palette.text, fontSize: 14, lineHeight: 22 }}>{visit.note}</Text>}
      </View>)}
      {visitsMore && <Text style={{ color: palette.secondary, fontSize: 13, lineHeight: 21 }}>Showing the latest 100 visit events.</Text>}
      <SecondaryButton title="Refresh visit record" disabled={busy || visitsLoading} onPress={loadVisits} />
      {allowWork && (!visitDraft ? <View style={{ gap: 10 }}>
        <SecondaryButton title="Record arrival" disabled={busy} onPress={() => openVisit('arrived')} />
        <SecondaryButton title="Record departure" disabled={busy} onPress={() => openVisit('departed')} />
        <SecondaryButton title="Couldn't access property" disabled={busy} onPress={() => openVisit('access-blocked')} />
      </View> : <View style={{ gap: 12 }}>
        <SectionHeader title={visitLabels[visitDraft.type]} subtitle={visitDraft.type === 'access-blocked' ? 'A reason is required. Describe what prevented access.' : 'Add an optional note about this visit.'} />
        <FormField label="Visit note" value={visitDraft.note} maxLength={1000} onChangeText={value => setVisitDraft(previous => ({ ...previous, note: value }))} editable={!busy && !visitAttempted} multiline />
        <Pressable accessibilityRole="checkbox" accessibilityLabel="Include current GPS" accessibilityState={{ checked: visitDraft.includeLocation, disabled: busy || visitAttempted }} disabled={busy || visitAttempted}
          onPress={() => setVisitDraft(previous => ({ ...previous, includeLocation: !previous.includeLocation }))}
          style={{ minHeight: 48, paddingVertical: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Text style={{ color: palette.accent, fontSize: 18 }}>{visitDraft.includeLocation ? '☑' : '☐'}</Text><Text style={{ flex: 1, color: palette.text, fontSize: 15, lineHeight: 23 }}>Include current GPS</Text>
        </Pressable>
        <Text style={{ color: palette.secondary, fontSize: 13, lineHeight: 21 }}>Optional GPS uses existing location permission while this app is open. No permission prompt or continuous sharing is started here. A connection is required; visit events are not queued offline.</Text>
        {visitAttempted && <InlineNotice message="This attempt is retained for a safe retry. The same event ID and details will be sent again." />}
        <PrimaryButton title={visitAttempted ? 'Retry visit record' : 'Save visit record'} busy={busy} onPress={saveVisit} />
        <SecondaryButton title="Cancel visit record" disabled={busy} onPress={() => { setVisitDraft(null); setVisitAttempted(false); visitAttempt.current = null; setError(''); }} />
      </View>)}
    </Card>
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
