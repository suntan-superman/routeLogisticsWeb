import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { GlassInput } from './Glass';
import { Card, SectionHeader, InlineNotice, PrimaryButton, SecondaryButton } from './MobileUI';
import { REASSIGNMENT_REASONS } from '../../functions/shared/jobExceptions';
import { canRequestReassignment, newExceptionOperationId, requestJobReassignment } from '../services/jobExceptionOperations';

// An inline form keeps the existing single work-order presentation lifecycle.
// A request never removes an assignment or changes an appointment's status.
export default function JobReassignmentRequest({ job, user, permissions, onChanged, onBusyChange, onDraftChange, active = true, readOnly = false }) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(false), [review, setReview] = useState(false);
  const [reason, setReason] = useState('unavailable'), [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirmed, setConfirmed] = useState(null);
  const attempt = useRef(null), confirmedJob = useRef(null), current = useRef({}), alive = useRef(false), lock = useRef(false);
  const callbacks = useRef({ onChanged, onBusyChange, onDraftChange });
  callbacks.current = { onChanged, onBusyChange, onDraftChange };
  const identity = JSON.stringify([job?.id, user?.id, user?.companyId, user?.membershipId, user?.role, user?.emailVerified]);
  current.current = { identity, job, user, permissions, active, readOnly };
  const eligible = !readOnly && canRequestReassignment(job, user, permissions);
  const visible = !!user?.emailVerified && !!permissions?.canAccess && !!user.companyId && job?.companyId === user.companyId
    && (job.assignedTo === user.membershipId && (!job.assignedToUid || job.assignedToUid === user.id) || job.assignedToUid === user.id || permissions.can?.('dispatch.manage'));
  const pending = job?.reassignmentRequest?.status === 'pending' ? job.reassignmentRequest : confirmed;
  useEffect(() => {
    alive.current = true; lock.current = false; attempt.current = null;
    setOpen(false); setReview(false); setReason('unavailable'); setNotes(''); setBusy(false); setError(''); setConfirmed(null);
    return () => { alive.current = false; callbacks.current.onBusyChange?.(false); callbacks.current.onDraftChange?.(false); };
  }, [identity]);
  useEffect(() => { callbacks.current.onBusyChange?.(busy); }, [busy]);
  useEffect(() => { callbacks.current.onDraftChange?.(open && visible); }, [open, visible]);
  useEffect(() => { if (confirmed && confirmedJob.current !== job) { setConfirmed(null); confirmedJob.current = null; } }, [job, confirmed]);
  const valid = expected => alive.current && current.current.identity === expected;
  const cancel = () => {
    if (lock.current) return;
    if (attempt.current) {
      setOpen(false); setReview(false);
      setError('The request may already be recorded. Closing this editor does not cancel a submitted request. Refresh the job to check its status, or reopen this editor to retry the same request.');
      return;
    }
    setOpen(false); setReview(false); setError(''); setNotes(''); attempt.current = null;
  };
  const submit = async () => {
    const state = current.current;
    if (lock.current || !review || !state.active || state.readOnly || !canRequestReassignment(state.job, state.user, state.permissions)) return;
    if (!Object.hasOwn(REASSIGNMENT_REASONS, reason) || notes.trim().length > 2000) { setError('Choose a reason and keep notes within 2,000 characters.'); return; }
    // A retry of an ambiguous response uses exactly the same immutable request.
    attempt.current ||= { job: state.job, options: { reason, notes: notes.trim(), operationId: newExceptionOperationId() } };
    const saved = attempt.current, expected = state.identity;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await requestJobReassignment(saved.job, saved.options);
      if (!valid(expected)) return;
      if (!result.request?.id || result.request.status !== 'pending') throw new Error('Refresh the work order to confirm the request status before trying again.');
      confirmedJob.current = state.job; setConfirmed(result.request); setOpen(false); setReview(false); setNotes(''); attempt.current = null;
      try { await callbacks.current.onChanged?.(); }
      catch { if (valid(expected)) setError('Your request is saved. The schedule could not refresh; reopen it to see the latest status.'); }
    } catch (failure) {
      if (valid(expected)) setError(failure.message || 'The request could not be confirmed. Reconnect and retry; your reason and notes are retained.');
    } finally { if (valid(expected)) { lock.current = false; setBusy(false); } }
  };
  if (!visible || !eligible && !pending && !open) return null;
  return <Card><SectionHeader title="Assignment support" />
    {!!error && <InlineNotice tone="error" message={error} />}
    {pending ? <>
      <InlineNotice message="Reassignment requested — waiting for management. This job remains assigned to you until management changes it." />
      <Text style={{ color: palette.text, lineHeight: 22 }}>{REASSIGNMENT_REASONS[pending.reason] || 'Management review requested'}</Text>
      {!!pending.notes && <Text style={{ color: palette.secondary, lineHeight: 22 }}>{pending.notes}</Text>}
      {open && <View style={{ gap: 10 }}><InlineNotice message="A saved request is now present. Your unsubmitted local draft is retained below; cancel that draft to leave this work order." />
        {!!notes.trim() && <Text style={{ color: palette.secondary, lineHeight: 22 }}>{notes.trim()}</Text>}
        <SecondaryButton title={attempt.current ? 'Close request editor' : 'Cancel request draft'} disabled={busy} onPress={cancel} />
      </View>}
    </> : !open ? <SecondaryButton title={attempt.current ? 'Review unconfirmed request' : 'Request Reassignment'} disabled={!active || !eligible} onPress={() => { setOpen(true); setReview(!!attempt.current); setError(''); }} /> : <View style={{ gap: 12 }}>
      {!eligible && <InlineNotice tone="error" message="This job no longer allows a reassignment request. Your draft is retained; cancel the request draft to return to the work order." />}
      <InlineNotice message="Tell management why you cannot perform this visit. The request does not cancel the appointment or change your assignment." />
      {!review ? <>
        {Object.entries(REASSIGNMENT_REASONS).map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={label}
          accessibilityState={{ checked: reason === value, disabled: busy }} disabled={busy} onPress={() => setReason(value)}
          style={{ padding: 12, borderRadius: 12, borderWidth: 1, minHeight: 46, borderColor: reason === value ? palette.accent : palette.border, backgroundColor: reason === value ? palette.glow : palette.input }}>
          <Text style={{ color: palette.text, lineHeight: 22 }}>{label}</Text>
        </Pressable>)}
        <GlassInput label="Reassignment notes (optional)" multiline maxLength={2000} value={notes} editable={!busy} onChangeText={setNotes} />
        <PrimaryButton title="Review reassignment request" disabled={busy || !eligible || !active} onPress={() => { setError(''); setReview(true); }} />
      </> : <>
        <SectionHeader title="Send this request to management?" />
        <Text style={{ color: palette.text, lineHeight: 22 }}>{REASSIGNMENT_REASONS[reason]}</Text>
        {!!notes.trim() && <Text style={{ color: palette.secondary, lineHeight: 22 }}>{notes.trim()}</Text>}
        <PrimaryButton title={attempt.current ? 'Retry reassignment request' : 'Send reassignment request'} busy={busy} disabled={!eligible || !active} onPress={submit} />
        {!attempt.current && <SecondaryButton title="Edit request" disabled={busy} onPress={() => setReview(false)} />}
      </>}
      <SecondaryButton title={attempt.current ? 'Close request editor' : 'Cancel request draft'} disabled={busy} onPress={cancel} />
    </View>}
  </Card>;
}
