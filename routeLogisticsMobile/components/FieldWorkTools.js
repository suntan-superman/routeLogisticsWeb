import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
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
const hasApplicationDraft=application=>!!application&&Object.values(application).some(value=>String(value??'').trim().length>0);
const visitLabels = { arrived: 'Arrived', departed: 'Departed', 'access-blocked': 'Couldn’t access property' };
const visitSources = { manual: 'Reported manually', 'manual-gps': 'Reported manually with GPS evidence', 'gps-evidence': 'Estimated from GPS evidence' };
const visitTime = value => { const date = new Date(value); return Number.isNaN(date.getTime()) ? 'Time unavailable' : date.toLocaleString(); };
const manualVisit = (event,type,jobId) => event?.type===type&&['manual','manual-gps'].includes(event.source)&&!!event.id&&(!event.jobId||event.jobId===jobId)&&Number.isFinite(Date.parse(event.recordedAt));
const latestManual = (events,type,jobId) => events.filter(event=>manualVisit(event,type,jobId)).sort((a,b)=>Date.parse(b.recordedAt)-Date.parse(a.recordedAt))[0]||null;
function VisitAction({type,event,busy,pending,loading,historyError,cached,readOnly,onPress,onRepeat,awaitingDeparture=false}){
  const {palette,isDark}=useTheme(),name=type==='arrived'?'Arrival':'Departure',saved=!!event&&!pending;
  const color=saved?(isDark?'#A7F3D0':'#065F46'):(isDark?'#FDE68A':'#78350F'),backgroundColor=saved?(isDark?'#12382B':'#D1FAE5'):(isDark?'#382B0F':'#FEF3C7');
  const label=saved?`${name} recorded`:`Record ${name.toLowerCase()}`;
  return <View testID={`visit-control-${type}`} style={{gap:7}}>
    <Pressable testID={`visit-action-${type}`} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{disabled:!!busy||saved||!!loading||!!readOnly,busy:!!busy}} disabled={!!busy||saved||!!loading||!!readOnly}
      onPress={onPress} style={{minHeight:48,padding:13,borderRadius:14,borderWidth:1,borderColor:saved?'#059669':'#D97706',backgroundColor,alignItems:'center',justifyContent:'center'}}>
      <Text style={{color,fontSize:15,fontWeight:'700',lineHeight:23}}>{saved?'✓ ':''}{label}</Text>
    </Pressable>
    <Text accessibilityLiveRegion="polite" style={{color:saved?palette.accent:palette.secondary,fontSize:13,lineHeight:21}}>{saved?`${cached?'Saved earlier':'Saved'}: ${visitTime(event.recordedAt)} · ${visitSources[event.source]}.` : pending?'This new visit report is not saved yet.':loading?'Checking saved visit reports…':historyError?'Saved reports could not be refreshed. Review the error before recording another event.':awaitingDeparture?'No departure report saved since the latest manual arrival.':'No manual report saved for this visit.'}</Text>
    {saved&&!readOnly&&<SecondaryButton title={`Record another ${name.toLowerCase()}`} disabled={busy} onPress={onRepeat}/>}
  </View>;
}
const workNotes = job => ['pending', 'syncing'].includes(job?.syncState) && job?.syncPatch?.notes != null ? job.syncPatch.notes
  : job?.workNotes || (getClaims()?.role === 'technician' ? job?.notes : '') || '';

export default function FieldWorkTools({ job, onChanged, onDraftChange, onBusyChange, draftActionsRef, showNavigation = true, readOnly = false }) {
  const { palette } = useTheme();
  const [notes, setNotes] = useState(() => workNotes(job)), [dirty, setDirty] = useState(false), [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [records, setRecords] = useState([]), [recordsError, setRecordsError] = useState('');
  const [visits, setVisits] = useState([]), [visitsError, setVisitsError] = useState(''), [visitsLoading, setVisitsLoading] = useState(false), [visitsMore, setVisitsMore] = useState(false);
  const [visitDraft, setVisitDraft] = useState(null), [visitAttempted, setVisitAttempted] = useState(false);
  const [visitSaveError,setVisitSaveError]=useState(''),[visitsCached,setVisitsCached]=useState(false);
  const mounted = useRef(false), generation = useRef(0), lock = useRef(false), sequence = useRef(0), dirtyRef = useRef(false);
  const visitSequence = useRef(0), visitAttempt = useRef(null), lastVisitJob = useRef(job);
  const visitReceipts=useRef(new Map()),draftState=useRef({notes,form,visitDraft}),lastError=useRef(''),draftAPI=useRef(null);
  draftState.current={notes,form,visitDraft};
  const callbacks = useRef({ onChanged, onDraftChange, onBusyChange }), target = useRef(job);
  callbacks.current = { onChanged, onDraftChange, onBusyChange }; target.current = job;
  const current = (ticket, id) => mounted.current && generation.current === ticket && target.current?.id === id;
  const allowWork = !readOnly && !['completed', 'cancelled', 'canceled'].includes(job?.status);
  const reportError=(message,visit=false)=>{lastError.current=message;setError(message);if(visit)setVisitSaveError(message);};
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
      let serverRead=false;
      const acknowledged=new Map(visitReceipts.current);
      const result = await cachedRead(`visits:${selected.id}`, async() => {
        serverRead=true;const received=await callWorkspace('rlJobVisit', { action: 'list', jobId: selected.id });
        const known=current(ticket,selected.id)?visitReceipts.current:acknowledged;
        return {...received,events:[...new Map([...(received.events||[]),...known.values()].filter(event=>!event.jobId||event.jobId===selected.id).map(event=>[event.id,event])).values()]};
      });
      if (!current(ticket, selected.id) || request !== visitSequence.current) return;
      const saved=new Map([...(result.events||[]),...visitReceipts.current.values()].filter(event=>!event.jobId||event.jobId===selected.id).map(event=>[event.id,event]));
      setVisits([...saved.values()].sort((a,b)=>Date.parse(b.recordedAt)-Date.parse(a.recordedAt))); setVisitsMore(result.hasMore === true); setVisitsError('');setVisitsCached(!serverRead);
    } catch (failure) {
      if (!current(ticket, selected.id) || request !== visitSequence.current) return;
      if (['permission-denied', 'unauthenticated', 'not-found'].includes(String(failure.code || '').split('/').pop())) {visitReceipts.current.clear();setVisits([]);}
      setVisitsError(failure.message || 'Could not load the visit record. Retry while connected.');
    } finally { if (current(ticket, selected.id) && request === visitSequence.current) setVisitsLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; generation.current++; lock.current = false; dirtyRef.current = false;
    setNotes(workNotes(job)); setDirty(false); setForm(null); setBusy(false); setError(''); setNotice(''); setRecords([]); setRecordsError('');
    setVisits([]); setVisitsMore(false); setVisitsError('');setVisitsCached(false);setVisitSaveError(''); setVisitDraft(null); setVisitAttempted(false); visitAttempt.current = null;visitReceipts.current.clear();lastError.current='';draftState.current={notes:workNotes(job),form:null,visitDraft:null}; lastVisitJob.current = job;
    loadRecords(); loadVisits(); const unsubscribe = subscribeOffline(loadRecords);
    return () => { mounted.current = false; generation.current++; sequence.current++; visitSequence.current++; unsubscribe(); callbacks.current.onBusyChange?.(false); callbacks.current.onDraftChange?.(false); };
  }, [job?.id, loadRecords, loadVisits]);
  useEffect(() => { if (lastVisitJob.current !== job) { lastVisitJob.current = job; loadVisits(); } }, [job, loadVisits]);
  useEffect(() => { if (!dirtyRef.current) setNotes(workNotes(job)); }, [job?.workNotes, job?.notes, job?.syncPatch?.notes, job?.syncState]);
  useEffect(() => { callbacks.current.onDraftChange?.(dirty || hasApplicationDraft(form) || !!visitDraft); }, [dirty, form, visitDraft]);
  const perform = async (action,{visit=false}={}) => {
    if (lock.current || !allowWork) return false;
    const selected = { ...target.current }, ticket = generation.current;
    lock.current = true; setBusy(true); callbacks.current.onBusyChange?.(true); setError('');lastError.current='';if(visit)setVisitSaveError(''); setNotice('');
    try { const result=await action(selected, ticket);return result!==false&&current(ticket,selected.id); }
    catch (failure) { if (current(ticket, selected.id)) reportError(failure.message || 'Could not save this work. Your draft is retained; try again.',visit);return false; }
    finally {
      if (current(ticket, selected.id)) {lock.current = false; setBusy(false); callbacks.current.onBusyChange?.(false); }
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
    const application=draftState.current.form;
    if (!application?.product.trim() || !application?.targetPest.trim() || !Number.isFinite(Number(application?.amount)) || Number(application?.amount) <= 0) { reportError('Enter a product, target pest and positive quantity before saving.'); return Promise.resolve(false); }
    const record = { ...application, amount: Number(application.amount) };
    return perform(async (selected, ticket) => {
      await saveApplicationOffline(selected.id, record);
      if (!current(ticket, selected.id)) return;
      draftState.current.form=null;setForm(null); setNotice('Application saved on this device. Check synchronization status before leaving.'); await loadRecords(); await changed(ticket, selected.id);
    });
  };
  const openVisit = type => {
    if (lock.current || !allowWork || visitDraft) return;
    visitAttempt.current = null; setVisitAttempted(false); setError('');setVisitSaveError(''); setNotice('');
    const draft={ type, note: '', includeLocation: false, operationId: Crypto.randomUUID() };draftState.current.visitDraft=draft;setVisitDraft(draft);
  };
  const saveVisit = () => {
    const draft=draftState.current.visitDraft;
    if (!draft) return Promise.resolve(false);
    const note = draft.note.trim();
    if (note.length > 1000 || (draft.type === 'access-blocked' && !note)) { reportError(draft.type === 'access-blocked' && !note ? 'Describe why the property could not be accessed before recording this visit.' : 'Visit notes must be at most 1,000 characters.',true); return Promise.resolve(false); }
    return perform(async (selected, ticket) => {
      if (await isOffline()) throw new Error('Visit events require a connection and have not been queued. Your note is retained. Reconnect and retry.');
      if (!current(ticket, selected.id)) return;
      let payload = visitAttempt.current;
      if (!payload) {
        payload = { action: 'record', jobId: selected.id, type: draft.type, operationId: draft.operationId, note };
        if (draft.includeLocation) {
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
      if (!manualVisit(result.event,draft.type,selected.id)) throw new Error('The server did not confirm a saved manual visit report. Retry this same event to check its result safely.');
      visitReceipts.current.set(result.event.id,result.event);setVisits(previous => [result.event, ...previous.filter(row => row.id !== result.event.id)]);setVisitsCached(false);
      draftState.current.visitDraft=null;setVisitDraft(null); setVisitAttempted(false); visitAttempt.current = null;
      setNotice(result.duplicate ? 'This visit event was already recorded. No duplicate was added.' : 'Visit event recorded. This does not change the job status or verify property access.');
      await loadVisits(); await changed(ticket, selected.id);
    },{visit:true});
  };
  const inspectDrafts=()=>({notes:dirtyRef.current,application:hasApplicationDraft(draftState.current.form),visit:!!draftState.current.visitDraft,
    visitAttempted:!!visitAttempt.current,visitType:draftState.current.visitDraft?.type||null,
    hasDraft:dirtyRef.current||hasApplicationDraft(draftState.current.form)||!!draftState.current.visitDraft});
  const discardDrafts=()=>{
    if(lock.current)return{success:false,message:'Wait for the current save operation to finish.'};
    if(visitAttempt.current)return{success:false,unconfirmed:true,message:'This visit report may already be saved. Retry the same event to confirm its result before leaving; it cannot be discarded as an unsaved report.'};
    const restored=workNotes(target.current);dirtyRef.current=false;draftState.current={notes:restored,form:null,visitDraft:null};
    setNotes(restored);setDirty(false);setForm(null);setVisitDraft(null);setVisitAttempted(false);setError('');setVisitSaveError('');lastError.current='';
    callbacks.current.onDraftChange?.(false);return{success:true};
  };
  const saveDrafts=async()=>{
    if(lock.current)return{success:false,message:'Wait for the current save operation to finish.'};
    const selected=target.current?.id,ticket=generation.current;
    if(!allowWork)return{success:false,message:'This work order is no longer open for changes.'};
    const failed=()=>({success:false,message:lastError.current||'The draft could not be saved. Review the highlighted fields and retry.',unconfirmed:!!visitAttempt.current});
    if(dirtyRef.current&&!(await save({notes:draftState.current.notes})))return failed();
    if(!current(ticket,selected))return{success:false,message:'The work order changed. Reopen it before continuing.'};
    if(hasApplicationDraft(draftState.current.form)&&!(await saveApplication()))return failed();
    if(!current(ticket,selected))return{success:false,message:'The work order changed. Reopen it before continuing.'};
    if(draftState.current.visitDraft&&!(await saveVisit()))return failed();
    if(!current(ticket,selected))return{success:false,message:'The work order changed. Reopen it before continuing.'};
    const remaining=inspectDrafts().hasDraft;if(!remaining)callbacks.current.onDraftChange?.(false);
    return{success:!remaining,...(remaining?{message:'A work draft is still open. Save or discard it before continuing.'}:{})};
  };
  draftAPI.current={getDrafts:inspectDrafts,saveDrafts,discardDrafts};
  useImperativeHandle(draftActionsRef,()=>{
    const selected=job?.id;let ticket=null;
    // Imperative handles mount before the passive lifecycle starts its scoped
    // reads. Bind this handle to that generation on its first real inspection.
    const valid=()=>{if(!mounted.current||target.current?.id!==selected)return false;if(ticket===null)ticket=generation.current;return ticket===generation.current;};
    const unavailable=()=>({success:false,message:'The work order changed. Reopen it before continuing.'});
    const handle={getDrafts:()=>valid()?draftAPI.current.getDrafts():{notes:false,application:false,visit:false,visitAttempted:false,hasDraft:false,changed:true},
      saveDrafts:()=>valid()?draftAPI.current.saveDrafts():Promise.resolve(unavailable()),discardDrafts:()=>valid()?draftAPI.current.discardDrafts():unavailable()};
    return handle;
  },[draftActionsRef,job?.id]);
  if (!job?.id) return null;
  const arrivalRecord=latestManual(visits,'arrived',job.id),lastDeparture=latestManual(visits,'departed',job.id);
  const departureRecord=lastDeparture&&(!arrivalRecord||Date.parse(lastDeparture.recordedAt)>=Date.parse(arrivalRecord.recordedAt))?lastDeparture:null;
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
      {!!visitSaveError&&<InlineNotice tone="error" message={visitSaveError}/>}
      {allowWork && (!visitDraft ? <View style={{ gap: 14 }}>
        {['arrived','departed'].map(type=><VisitAction key={type} type={type} event={type==='arrived'?arrivalRecord:departureRecord} awaitingDeparture={type==='departed'&&!!arrivalRecord&&!departureRecord} busy={busy} loading={visitsLoading} historyError={visitsError} cached={visitsCached}
          onPress={()=>openVisit(type)} onRepeat={()=>openVisit(type)}/>)}
        <SecondaryButton title="Couldn't access property" disabled={busy} onPress={() => openVisit('access-blocked')} />
      </View> : <View style={{ gap: 12 }}>
        <SectionHeader title={visitLabels[visitDraft.type]} subtitle={visitDraft.type === 'access-blocked' ? 'A reason is required. Describe what prevented access.' : 'Add an optional note about this visit.'} />
        {['arrived','departed'].includes(visitDraft.type)&&<VisitAction type={visitDraft.type} pending busy={busy} readOnly/>}
        <FormField label="Visit note" value={visitDraft.note} maxLength={1000} onChangeText={value => {const draft={...draftState.current.visitDraft,note:value};draftState.current.visitDraft=draft;setVisitDraft(draft);}} editable={!busy && !visitAttempted} multiline />
        <Pressable accessibilityRole="checkbox" accessibilityLabel="Include current GPS" accessibilityState={{ checked: visitDraft.includeLocation, disabled: busy || visitAttempted }} disabled={busy || visitAttempted}
          onPress={() => {const draft={...draftState.current.visitDraft,includeLocation:!draftState.current.visitDraft.includeLocation};draftState.current.visitDraft=draft;setVisitDraft(draft);}}
          style={{ minHeight: 48, paddingVertical: 12, flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <Text style={{ color: palette.accent, fontSize: 18 }}>{visitDraft.includeLocation ? '☑' : '☐'}</Text><Text style={{ flex: 1, color: palette.text, fontSize: 15, lineHeight: 23 }}>Include current GPS</Text>
        </Pressable>
        <Text style={{ color: palette.secondary, fontSize: 13, lineHeight: 21 }}>Optional GPS uses existing location permission while this app is open. No permission prompt or continuous sharing is started here. A connection is required; visit events are not queued offline.</Text>
        {visitAttempted && <InlineNotice message="This attempt is retained for a safe retry. The same event ID and details will be sent again. Retry to confirm whether it was saved before leaving." />}
        <PrimaryButton title={visitAttempted ? 'Retry visit record' : 'Save visit record'} busy={busy} onPress={()=>saveVisit()} />
        <SecondaryButton title="Cancel visit record" disabled={busy||visitAttempted} onPress={() => {draftState.current.visitDraft=null;setVisitDraft(null); setVisitAttempted(false); visitAttempt.current = null; setError('');setVisitSaveError('');}} />
      </View>)}
    </Card>
    <Card><SectionHeader title="Work notes" subtitle="Document observations and work instructions for this visit." />
      {allowWork ? <><FormField label="Work notes" value={notes} onChangeText={value => { dirtyRef.current = true;draftState.current.notes=value; setNotes(value); setDirty(true); }} editable={!busy} multiline />
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
      {allowWork && (!form ? <SecondaryButton title="Record product application" icon="add-outline" disabled={busy} onPress={() => { setError('');const application=emptyApplication();draftState.current.form=application;setForm(application); }} /> : <View style={{ gap: 12 }}>
        {Object.entries(applicationFields).map(([key, label]) => <FormField key={key} label={label} value={form[key]} onChangeText={value => {const application={...draftState.current.form,[key]:value};draftState.current.form=application;setForm(application);}} editable={!busy} multiline={key === 'notes'} keyboardType={key === 'amount' ? 'decimal-pad' : 'default'} />)}
        <PrimaryButton title="Save application" busy={busy} onPress={()=>saveApplication()} /><SecondaryButton title="Cancel application" disabled={busy} onPress={() => {draftState.current.form=null;setForm(null); setError('');}} />
      </View>)}
    </Card>
  </View>;
}
