import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, ActivityIndicator } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { GlassButton, GlassInput } from './Glass';
import JobPhotos from './JobPhotos';
import FieldWorkTools from './FieldWorkTools';
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
  const [retryOperationId, setRetryOperationId] = useState(null), [savedChange, setSavedChange] = useState(null);
  const [submitted, setSubmitted] = useState(null), [closeRequested, setCloseRequested] = useState(false);
  const mounted = useRef(true), generation = useRef(0), submitting = useRef(null), reviewPending = useRef(null), photoBusyRef = useRef(false), photoDraftRef = useRef(false);
  const notify = useRef(onInteractionChange); notify.current = onInteractionChange;
  const hasCompletionDraft = Object.values(draft).some(value => String(value).trim());
  const hasDraft = photoDraft || hasCompletionDraft, busy = saving || reviewing || photoBusy;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; notify.current?.({ busy: false, hasDraft: false }); }; }, []);
  useEffect(() => { notify.current?.({ busy, hasDraft }); }, [busy, hasDraft]);
  useEffect(() => {
    generation.current++; submitting.current = null; reviewPending.current = null;
    setMode('details'); setDraft(emptyDraft()); setError(''); setNotice(''); setSaving(false); setReviewing(false);
    setPhotoBusy(false); setPhotoDraft(false); photoBusyRef.current = false; photoDraftRef.current = false;
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
  const accessReason = workAccessReason(job, user, permissions);
  const displayJob = submitted?.jobId === job?.id ? { ...job, ...submitted.draft, status: 'completed' } : job;
  const canComplete = !accessReason && ['scheduled', 'en-route', 'in-progress'].includes(displayJob?.status);
  const explainBlockedPhoto = () => {
    if (photoBusyRef.current) { setError('Finish or cancel the camera/photo selection before leaving this job.'); return true; }
    if (photoDraftRef.current) { setError('Save or discard the selected photo before leaving this page.'); return true; }
    return false;
  };
  const close = () => {
    if (submitting.current !== null || explainBlockedPhoto()) return;
    if (hasCompletionDraft || retryOperationId) { setCloseRequested(true); return; }
    onClose?.();
  };
  const openCompletion = () => {
    if (explainBlockedPhoto()) return;
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
  const edit = () => { if (explainBlockedPhoto() || hasCompletionDraft || retryOperationId) { if (!photoBusyRef.current && !photoDraftRef.current) setError('Finish or discard your completion draft before editing the job.'); return; } onEdit?.(job); };
  if (!job?.id) return <View><Text style={{ color: palette.danger }}>Reopen the job from your job list.</Text><GlassButton title="Return to jobs" onPress={onClose} /></View>;
  return <View testID="job-workflow" style={{ flex: 1, backgroundColor: palette.background, padding: 18, gap: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><Text accessibilityRole="header" style={{ flex: 1, fontSize: 23, fontWeight: '700', color: palette.text }}>{mode === 'details' ? 'Job Details' : mode === 'completion' ? 'Complete job' : 'Review completion'}</Text><GlassButton secondary title="Close" accessibilityLabel="Close job details" disabled={busy} onPress={close} /></View>
    {!!error && <Text accessibilityRole="alert" style={{ color: palette.danger, lineHeight: 21 }}>{error}</Text>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={{ color: palette.accent, lineHeight: 21 }}>{notice}</Text>}
    {busy && <View style={{ flexDirection: 'row', gap: 8 }}><ActivityIndicator color={palette.accent} /><Text style={{ color: palette.secondary }}>{saving ? 'Saving completion…' : reviewing ? 'Loading saved work…' : 'Finish or cancel the photo picker to continue.'}</Text></View>}
    {closeRequested && <View style={{ gap: 8 }}><Text style={{ color: palette.text }}>Your completion draft is still here. Keep editing, or explicitly discard it before closing.</Text><GlassButton secondary title="Keep editing" disabled={busy} onPress={() => setCloseRequested(false)} /><GlassButton title="Discard draft and close" disabled={busy} onPress={discardAndClose} /></View>}
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 15, paddingBottom: 28 }}>
      <Text style={{ color: palette.text, fontSize: 18, fontWeight: '700' }}>{displayJob.customerName || displayJob.serviceType || 'Assigned job'}</Text>
      {mode === 'details' && <View style={{ gap: 10 }}>
        <Text style={{ color: palette.secondary }}>{[displayJob.serviceType, displayJob.date, displayJob.time].filter(Boolean).join(' · ')}</Text>
        <Text style={{ color: palette.text }}>Status: {displayJob.status}{submitted?.status === 'queued' ? ' · awaiting synchronization' : ''}</Text>
        {!!job.syncState && <Text accessibilityLiveRegion="polite" style={{ color: palette.secondary }}>Saved work: {job.syncState}</Text>}
        {!!job.syncError && <Text accessibilityRole="alert" style={{ color: palette.danger }}>{job.syncError}</Text>}
        {(displayJob.estimatedDuration ?? displayJob.duration) != null && <Text style={{ color: palette.secondary }}>Estimated duration: {displayJob.estimatedDuration ?? displayJob.duration} hours</Text>}
        {permissions.can?.('jobs.pricing') && (displayJob.estimatedCost ?? displayJob.totalCost) != null && <Text style={{ color: palette.secondary }}>Estimated cost: ${Number(displayJob.estimatedCost ?? displayJob.totalCost).toFixed(2)}</Text>}
        {!!displayJob.address && <Text style={{ color: palette.secondary }}>{[displayJob.address, displayJob.city, displayJob.state, displayJob.zipCode].filter(Boolean).join(', ')}</Text>}
        {!!displayJob.notes && <Text style={{ color: palette.text }}>{displayJob.notes}</Text>}
        {!!displayJob.actualWorkDone && <Text style={{ color: palette.text }}>Work completed: {displayJob.actualWorkDone}</Text>}
        {displayJob.actualHours != null && displayJob.actualHours !== '' && <Text style={{ color: palette.secondary }}>Actual hours: {displayJob.actualHours}</Text>}
        {!!displayJob.completedAt && <Text style={{ color: palette.secondary }}>Completed: {new Date(displayJob.completedAt).toLocaleString()}</Text>}
        {!!displayJob.completionNotes && <Text style={{ color: palette.secondary }}>Completion notes: {displayJob.completionNotes}</Text>}
        {!!accessReason && <Text accessibilityRole="alert" style={{ color: palette.danger }}>{accessReason}</Text>}
        {!accessReason && !['completed', 'cancelled'].includes(displayJob.status) && <FieldWorkTools key={job.id} job={job} onChanged={onChanged} />}
      </View>}
      <View style={{ display: mode === 'details' ? 'flex' : 'none' }} accessibilityElementsHidden={mode !== 'details'} importantForAccessibility={mode === 'details' ? 'auto' : 'no-hide-descendants'} pointerEvents={mode === 'details' ? 'auto' : 'none'}>
        <JobPhotos key={job.id} job={job} onBusyChange={updatePhotoBusy} onDraftChange={updatePhotoDraft} />
      </View>
      {mode === 'details' && <View style={{ gap: 10 }}>
        {canComplete && <GlassButton title={hasCompletionDraft ? 'Resume completion' : 'Complete'} disabled={busy} onPress={openCompletion} />}
        {permissions.canManage && onEdit && !submitted && <GlassButton secondary title="Edit job" disabled={busy} onPress={edit} />}
        {permissions.canManage && onFollowUp && displayJob.status === 'completed' && <GlassButton secondary title="Schedule follow-up" disabled={busy} onPress={() => { if (!explainBlockedPhoto()) onFollowUp(displayJob); }} />}
      </View>}
      {mode === 'completion' && <View style={{ gap: 13 }}>
        <GlassInput label="Work completed" value={draft.actualWorkDone} onChangeText={value => setDraft(current => ({ ...current, actualWorkDone: value }))} editable={!saving} multiline />
        <GlassInput label="Actual hours worked" value={draft.actualHours} onChangeText={value => setDraft(current => ({ ...current, actualHours: value }))} editable={!saving} keyboardType="decimal-pad" />
        <GlassInput label="Completion notes" value={draft.completionNotes} onChangeText={value => setDraft(current => ({ ...current, completionNotes: value }))} editable={!saving} multiline />
        <GlassButton title="Review completion" disabled={busy} onPress={review} />
        <GlassButton secondary title="Cancel completion" disabled={busy} onPress={() => { setError(''); setMode('details'); }} />
      </View>}
      {mode === 'confirm' && <View style={{ gap: 12 }}>
        <Text style={{ color: palette.text }}>{draft.actualWorkDone}</Text>
        {!!draft.actualHours.trim() && <Text style={{ color: palette.secondary }}>Actual hours: {draft.actualHours}</Text>}
        {!!draft.completionNotes.trim() && <Text style={{ color: palette.secondary }}>{draft.completionNotes}</Text>}
        {!!savedChange?.server && <View style={{ gap: 7 }}><Text style={{ color: palette.text, fontWeight: '700' }}>Review the latest online work</Text><Text style={{ color: palette.secondary }}>Status: {savedChange.server.status || 'Not supplied'}</Text><Text style={{ color: palette.secondary }}>Work completed: {savedChange.server.actualWorkDone || 'Not recorded'}</Text><Text style={{ color: palette.secondary }}>Notes: {savedChange.server.notes || savedChange.server.completionNotes || 'Not recorded'}</Text><Text style={{ color: palette.secondary }}>Confirm only after reviewing these changes. Your saved completion will be checked against the latest job again.</Text></View>}
        <Text style={{ color: palette.secondary }}>Completion is checked against your current assignment. Offline submissions remain saved on this device until authorized synchronization succeeds.</Text>
        <GlassButton title="Confirm completion" busy={saving} disabled={busy} onPress={submit} />
        <GlassButton secondary title="Back to completion" disabled={busy} onPress={() => setMode('completion')} />
      </View>}
    </ScrollView>
  </View>;
}
