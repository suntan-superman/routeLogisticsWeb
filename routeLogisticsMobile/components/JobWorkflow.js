import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator, Linking } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { GlassButton, GlassInput } from './Glass';
import { Card, ScreenHeader, SectionHeader, StatusBadge, InlineNotice, ConfirmationPanel } from './MobileUI';
import JobPhotos from './JobPhotos';
import FieldWorkTools from './FieldWorkTools';
import ServiceChecklist from './ServiceChecklist';
import { completeJob } from '../services/jobCompletion';
import { getQueuedOperation, resolveOffline } from '../services/offline';

const emptyDraft = () => ({ actualWorkDone: '', actualHours: '', completionNotes: '' });
function workAccessReason(job, user, permissions) {
  if (!user?.emailVerified || !permissions?.canAccess || !permissions.can?.('jobs.work')) return 'Verify your email and refresh your workspace before changing this job.';
  if (!job?.id) return 'Reopen the job from your job list.';
  if (job.companyId ? job.companyId !== user.companyId : !!user.companyId || job.userId !== user.id) return 'This job does not belong to your current workspace.';
  if (permissions.isTechnician && job.assignedTo !== user.membershipId) return 'This job is no longer assigned to you. Ask your manager to check its assignment.';
  return '';
}

// One mounted workspace, with exclusive inline pages. No native Modal presents
// another Modal or the camera, and the photo owner survives child-page changes.
export default function JobWorkflow({ job, onClose, onChanged, onEdit, onFollowUp, onInteractionChange }) {
  const { user, permissions } = useAuth(), { palette } = useTheme();
  const [mode, setMode] = useState('details'), [draft, setDraft] = useState(emptyDraft);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false), [reviewing, setReviewing] = useState(false), [photoBusy, setPhotoBusy] = useState(false), [photoDraft, setPhotoDraft] = useState(false);
  const [workBusy, setWorkBusy] = useState(false), [workDraft, setWorkDraft] = useState(false);
  const [serviceBusy, setServiceBusy] = useState(false), [serviceDraft, setServiceDraft] = useState(false);
  const [retryOperationId, setRetryOperationId] = useState(null), [savedChange, setSavedChange] = useState(null);
  const [submitted, setSubmitted] = useState(null), [closeRequested, setCloseRequested] = useState(false);
  const mounted = useRef(true), generation = useRef(0), submitting = useRef(null), reviewPending = useRef(null), photoBusyRef = useRef(false), photoDraftRef = useRef(false);
  const workBusyRef = useRef(false), workDraftRef = useRef(false);
  const serviceBusyRef = useRef(false), serviceDraftRef = useRef(false);
  const notify = useRef(onInteractionChange); notify.current = onInteractionChange;
  const hasCompletionDraft = Object.values(draft).some(value => String(value).trim());
  const hasDraft = photoDraft || workDraft || serviceDraft || hasCompletionDraft, busy = saving || reviewing || photoBusy || workBusy || serviceBusy;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; notify.current?.({ busy: false, hasDraft: false }); }; }, []);
  useEffect(() => { notify.current?.({ busy, hasDraft }); }, [busy, hasDraft]);
  useEffect(() => {
    generation.current++; submitting.current = null; reviewPending.current = null;
    setMode('details'); setDraft(emptyDraft()); setError(''); setNotice(''); setSaving(false); setReviewing(false);
    setPhotoBusy(false); setPhotoDraft(false); photoBusyRef.current = false; photoDraftRef.current = false;
    setWorkBusy(false); setWorkDraft(false); workBusyRef.current = false; workDraftRef.current = false;
    setServiceBusy(false); setServiceDraft(false); serviceBusyRef.current = false; serviceDraftRef.current = false;
    setRetryOperationId(null); setSavedChange(null); setSubmitted(null); setCloseRequested(false);
  }, [job?.id]);
  useEffect(() => {
    if (!submitted || submitted.jobId !== job?.id) return;
    if (['failed', 'conflict'].includes(job.syncState)) {
      setDraft(submitted.draft); setRetryOperationId(job.syncOperationId || submitted.operationId);
      setSubmitted(null); setMode('completion'); setNotice('');
      setError(job.syncError || 'The saved completion could not synchronize. Review the current job and retry, or discard the saved change.');
    } else if (job.status === 'completed' && !['pending', 'syncing'].includes(job.syncState)) {
      setSubmitted(null); setNotice('Job completed and synchronized.');
    } else if (!['pending', 'syncing'].includes(job.syncState) && job.updatedAt && job.updatedAt !== submitted.baseVersion) {
      // A fresh server version may have reopened/cancelled work after completion.
      // Do not let an earlier local success permanently override that status.
      setSubmitted(null); setNotice(`Job updated online. Current status: ${job.status || 'unknown'}.`);
    }
  }, [job, submitted]);
  const updatePhotoBusy = useCallback(value => { photoBusyRef.current = value; if (mounted.current) setPhotoBusy(value); }, []);
  const updatePhotoDraft = useCallback(value => { photoDraftRef.current = value; if (mounted.current) setPhotoDraft(value); }, []);
  const updateWorkBusy = useCallback(value => { workBusyRef.current = value; if (mounted.current) setWorkBusy(value); }, []);
  const updateWorkDraft = useCallback(value => { workDraftRef.current = value; if (mounted.current) setWorkDraft(value); }, []);
  const updateServiceBusy = useCallback(value => { serviceBusyRef.current = value; if (mounted.current) setServiceBusy(value); }, []);
  const updateServiceDraft = useCallback(value => { serviceDraftRef.current = value; if (mounted.current) setServiceDraft(value); }, []);
  const accessReason = workAccessReason(job, user, permissions);
  const displayJob = submitted?.jobId === job?.id ? { ...job, ...submitted.draft, status: 'completed' } : job;
  const canComplete = !accessReason && ['scheduled', 'en-route', 'in-progress'].includes(displayJob?.status);
  const explainBlockedPhoto = () => {
    if (photoBusyRef.current) { setError('Finish or cancel the camera/photo selection before leaving this job.'); return true; }
    if (photoDraftRef.current) { setError('Save or discard the selected photo before leaving this page.'); return true; }
    return false;
  };
  const close = () => {
    if (submitting.current !== null || reviewPending.current !== null || workBusyRef.current || serviceBusyRef.current || explainBlockedPhoto()) return;
    if (hasCompletionDraft || workDraftRef.current || serviceDraftRef.current || retryOperationId) { setCloseRequested(true); return; }
    onClose?.();
  };
  const openCompletion = () => {
    if (explainBlockedPhoto()) return;
    if (workDraftRef.current || serviceDraftRef.current) { setError('Save or cancel your work notes, product application, visit record or service checklist draft before completing the visit.'); return; }
    if (!canComplete) { setError(accessReason || (displayJob?.status === 'cancelled' ? 'This job was cancelled. A manager must reopen it before it can be completed.' : 'This job is already completed. Refresh the job list.')); return; }
    setError(''); setNotice(''); setCloseRequested(false); setMode('completion');
  };
  const review = async () => {
    if (reviewPending.current !== null || submitting.current !== null) return;
    if (explainBlockedPhoto()) return;
    if (accessReason) { setError(accessReason); return; }
    if (!draft.actualWorkDone.trim()) { setError('Describe the work completed before submitting.'); return; }
    if (draft.actualHours.trim() && (!Number.isFinite(Number(draft.actualHours)) || Number(draft.actualHours) < 0 || Number(draft.actualHours) > 744)) { setError('Enter actual work hours between 0 and 744, or leave the optional field empty.'); return; }
    setError('');
    const ticket = generation.current;
    reviewPending.current = ticket; setReviewing(true);
    try {
      const saved = retryOperationId ? await getQueuedOperation(retryOperationId) : null;
      if (!mounted.current || generation.current !== ticket) return;
      setSavedChange(saved); setMode('confirm');
    } catch (failure) {
      if (mounted.current && generation.current === ticket) setError(failure.message || 'Could not read the saved completion. Reopen the job and check saved work.');
    } finally {
      if (reviewPending.current === ticket) reviewPending.current = null;
      if (mounted.current && generation.current === ticket) setReviewing(false);
    }
  };
  const submit = async () => {
    if (submitting.current !== null || explainBlockedPhoto()) return;
    const ticket = generation.current, selected = job;
    submitting.current = ticket; setSaving(true); setError('');
    try {
      const result = await completeJob(selected, draft, { retryOperationId });
      if (!mounted.current || generation.current !== ticket) return;
      const completedDraft = { ...draft };
      setSubmitted({ ...result, jobId: selected.id, draft: completedDraft, baseVersion: selected.updatedAt });
      setNotice(result.message || (result.status === 'synced' ? 'Job completed and synchronized.' : 'Completion is saved on this device and awaiting authorized synchronization.'));
      setDraft(emptyDraft()); setRetryOperationId(null); setSavedChange(null); setMode('details');
      try { await onChanged?.(); }
      catch (failure) { if (mounted.current && generation.current === ticket) setError(`Completion was saved. Refresh the job list: ${failure.message || 'The updated list could not be loaded.'}`); }
    } catch (failure) {
      if (!mounted.current || generation.current !== ticket) return;
      setRetryOperationId(failure.operationId || retryOperationId); setError(failure.message || 'Could not complete this job. Check your connection and retry.'); setMode('completion');
    } finally {
      if (submitting.current === ticket) submitting.current = null;
      if (mounted.current && generation.current === ticket) setSaving(false);
    }
  };
  const discardAndClose = async () => {
    if (submitting.current !== null || explainBlockedPhoto()) return;
    const ticket = generation.current; submitting.current = ticket; setSaving(true); setError('');
    try {
      if (retryOperationId) await resolveOffline(retryOperationId, 'discard');
      if (mounted.current && generation.current === ticket) onClose?.();
    } catch (failure) { if (mounted.current && generation.current === ticket) setError(failure.message || 'Could not discard this saved completion. Keep this screen open and retry.'); }
    finally { if (submitting.current === ticket) submitting.current = null; if (mounted.current && generation.current === ticket) setSaving(false); }
  };
  const edit = () => { if (explainBlockedPhoto() || workBusyRef.current || workDraftRef.current || serviceBusyRef.current || serviceDraftRef.current || hasCompletionDraft || retryOperationId) { if (!photoBusyRef.current && !photoDraftRef.current) setError('Save or discard your work draft before editing the job.'); return; } onEdit?.(job); };
  if (!job?.id) return <View><InlineNotice tone="error" message="Reopen the job from your job list." /><GlassButton title="Return to jobs" onPress={onClose} /></View>;
  const address = [displayJob.address, displayJob.city, displayJob.state, displayJob.zipCode].filter(value => typeof value === 'string' && value.trim()).join(', ');
  const destination = typeof displayJob.latitude === 'number' && typeof displayJob.longitude === 'number' ? displayJob.latitude + ',' + displayJob.longitude : address;
  const navigate = () => Linking.openURL('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(destination) + '&travelmode=driving').catch(failure => setError(failure.message || 'Navigation could not open. Check your map application.'));
  return <View testID="job-workflow" style={{ flex: 1, backgroundColor: palette.background }}>
    <ScreenHeader title={mode === 'details' ? 'Job Details' : mode === 'completion' ? 'Complete job' : 'Review completion'} subtitle={mode === 'details' ? 'Your assigned work order' : displayJob.customerName || 'Assigned visit'}>
      <GlassButton secondary title="Close" accessibilityLabel="Close job details" disabled={busy} onPress={close} />
    </ScreenHeader>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 20 }}>
      {!!error && <InlineNotice tone="error" message={error} />}
      {!!notice && <InlineNotice tone="success" message={notice} />}
      {busy && <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><ActivityIndicator color={palette.accent} /><Text style={{ flex: 1, color: palette.secondary, fontSize: 14, lineHeight: 21 }}>{saving ? 'Saving completion…' : reviewing ? 'Loading saved work…' : workBusy ? 'Saving your work…' : 'Finish or cancel the photo picker to continue.'}</Text></View>}
      {closeRequested && <ConfirmationPanel title="Keep your work?" message="Your work draft is still here. Keep editing, or explicitly discard it before closing.">
        <GlassButton secondary title="Keep editing" disabled={busy} onPress={() => setCloseRequested(false)} /><GlassButton title="Discard draft and close" disabled={busy} onPress={discardAndClose} />
      </ConfirmationPanel>}
      <Card>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><StatusBadge status={displayJob.status} />{!!job.syncState && <StatusBadge syncState={job.syncState} />}</View>
        <Text style={{ color: palette.text, fontSize: 25, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5 }}>{displayJob.customerName || 'Assigned customer'}</Text>
        <Text style={{ color: palette.secondary, fontSize: 16, lineHeight: 24 }}>{displayJob.serviceType || 'Service visit'}</Text>
        <Text style={{ color: palette.text, fontSize: 15, lineHeight: 23, fontWeight: '600' }}>{[displayJob.date, displayJob.time || 'Time not set'].filter(Boolean).join(' · ')}</Text>
        <Text style={{ color: palette.secondary, fontSize: 13, lineHeight: 20 }}>Status: {displayJob.status}{submitted?.status === 'queued' ? ' · awaiting synchronization' : ''}</Text>
        {!!job.syncError && <InlineNotice tone="error" message={job.syncError} />}
        {(displayJob.estimatedDuration ?? displayJob.duration) != null && <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 22 }}>Estimated duration: {displayJob.estimatedDuration ?? displayJob.duration} hours</Text>}
        {permissions.can?.('jobs.pricing') && (displayJob.estimatedCost ?? displayJob.totalCost) != null && <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 22 }}>Estimated cost: {'$' + Number(displayJob.estimatedCost ?? displayJob.totalCost).toFixed(2)}</Text>}
      </Card>
      {mode === 'details' && <Card><SectionHeader title="Service location" />
        <Text style={{ color: palette.text, fontSize: 15, lineHeight: 23 }}>{address || 'No service address supplied. Contact your manager before travelling.'}</Text>
        {!!displayJob.serviceInstructions && <Text style={{ color: palette.text, fontSize: 15, lineHeight: 23 }}>Service instructions: {displayJob.serviceInstructions}</Text>}
        {!!destination && <GlassButton secondary title="Navigate to job" icon="navigate-outline" onPress={navigate} />}
        {!!displayJob.customerPhone && <GlassButton secondary title="Call customer" icon="call-outline" onPress={() => Linking.openURL('tel:' + String(displayJob.customerPhone).replace(/[^+0-9]/g, '')).catch(failure => setError(failure.message || 'The phone application could not open.'))} />}
      </Card>}
      {mode === 'details' && !!accessReason && <InlineNotice tone="error" message={accessReason} />}
      <View style={{ display: mode === 'details' ? 'flex' : 'none' }} accessibilityElementsHidden={mode !== 'details'} importantForAccessibility={mode === 'details' ? 'auto' : 'no-hide-descendants'} pointerEvents={mode === 'details' ? 'auto' : 'none'}>
        <FieldWorkTools key={job.id} job={job} readOnly={!!accessReason || ['completed', 'cancelled', 'canceled'].includes(displayJob.status)} showNavigation={false} onChanged={onChanged} onBusyChange={updateWorkBusy} onDraftChange={updateWorkDraft} />
      </View>
      <View style={{ display: mode === 'details' ? 'flex' : 'none' }} accessibilityElementsHidden={mode !== 'details'} importantForAccessibility={mode === 'details' ? 'auto' : 'no-hide-descendants'} pointerEvents={mode === 'details' ? 'auto' : 'none'}>
        <Card><SectionHeader title="Visit photos" subtitle="Document the site and completed work. Saved photos show their upload status." />
          <JobPhotos key={job.id} job={job} onBusyChange={updatePhotoBusy} onDraftChange={updatePhotoDraft} />
        </Card>
      </View>
      <View style={{ display: mode === 'details' ? 'flex' : 'none' }} accessibilityElementsHidden={mode !== 'details'} importantForAccessibility={mode === 'details' ? 'auto' : 'no-hide-descendants'} pointerEvents={mode === 'details' ? 'auto' : 'none'}>
        <ServiceChecklist key={job.id} job={job} readOnly={!!accessReason || ['completed','cancelled','canceled'].includes(displayJob.status)} onBusyChange={updateServiceBusy} onDraftChange={updateServiceDraft} />
      </View>
      {mode === 'details' && (displayJob.actualWorkDone || displayJob.completedAt || displayJob.completionNotes) && <Card><SectionHeader title="Completion summary" />
        {!!displayJob.actualWorkDone && <Text style={{ color: palette.text, fontSize: 15, lineHeight: 23 }}>Work completed: {displayJob.actualWorkDone}</Text>}
        {displayJob.actualHours != null && displayJob.actualHours !== '' && <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 22 }}>Actual hours: {displayJob.actualHours}</Text>}
        {!!displayJob.completedAt && <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 22 }}>Completed: {new Date(displayJob.completedAt).toLocaleString()}</Text>}
        {!!displayJob.completionNotes && <Text style={{ color: palette.secondary, fontSize: 15, lineHeight: 23 }}>Completion notes: {displayJob.completionNotes}</Text>}
      </Card>}
      {mode === 'details' && <View style={{ gap: 10 }}>
        {canComplete && <GlassButton title={hasCompletionDraft ? 'Resume completion' : 'Complete'} secondary={displayJob.status !== 'in-progress'} disabled={busy} onPress={openCompletion} />}
        {permissions.canManage && onEdit && !submitted && <GlassButton secondary title="Edit job" disabled={busy} onPress={edit} />}
        {permissions.canManage && onFollowUp && displayJob.status === 'completed' && <GlassButton secondary title="Schedule follow-up" disabled={busy} onPress={() => { if (!explainBlockedPhoto() && !workDraftRef.current && !serviceDraftRef.current && !hasCompletionDraft) onFollowUp(displayJob); }} />}
      </View>}
      {mode === 'completion' && <Card><SectionHeader title="Document completed work" subtitle="Work description is required. Actual hours and completion notes are optional." />
        <GlassInput label="Work completed" value={draft.actualWorkDone} onChangeText={value => setDraft(current => ({ ...current, actualWorkDone: value }))} editable={!saving} multiline />
        <GlassInput label="Actual hours worked" value={draft.actualHours} onChangeText={value => setDraft(current => ({ ...current, actualHours: value }))} editable={!saving} keyboardType="decimal-pad" />
        <GlassInput label="Completion notes" value={draft.completionNotes} onChangeText={value => setDraft(current => ({ ...current, completionNotes: value }))} editable={!saving} multiline />
        <GlassButton title="Review completion" disabled={busy} onPress={review} /><GlassButton secondary title="Cancel completion" disabled={busy} onPress={() => { setError(''); setMode('details'); }} />
      </Card>}
      {mode === 'confirm' && <ConfirmationPanel title="Confirm completed work" message="Your current assignment is checked before synchronization. Offline work remains saved on this device until that check succeeds.">
        <Text style={{ color: palette.text, fontSize: 16, lineHeight: 24 }}>{draft.actualWorkDone}</Text>
        {!!draft.actualHours.trim() && <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 22 }}>Actual hours: {draft.actualHours}</Text>}
        {!!draft.completionNotes.trim() && <Text style={{ color: palette.secondary, fontSize: 15, lineHeight: 23 }}>{draft.completionNotes}</Text>}
        {!!savedChange?.server && <View style={{ gap: 7 }}><SectionHeader title="Review the latest online work" /><Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 22 }}>Status: {savedChange.server.status || 'Not supplied'}</Text><Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 22 }}>Work completed: {savedChange.server.actualWorkDone || 'Not recorded'}</Text><Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 22 }}>Notes: {savedChange.server.notes || savedChange.server.completionNotes || 'Not recorded'}</Text><Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 22 }}>Confirm only after reviewing these changes. Your saved completion will be checked against the latest job again.</Text></View>}
        <GlassButton title="Confirm completion" busy={saving} disabled={busy} onPress={submit} /><GlassButton secondary title="Back to completion" disabled={busy} onPress={() => setMode('completion')} />
      </ConfirmationPanel>}
    </ScrollView>
  </View>;
}
