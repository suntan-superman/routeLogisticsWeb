import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, Linking, Keyboard, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { GlassButton, GlassInput } from './Glass';
import { Card, ScreenHeader, SectionHeader, StatusBadge, InlineNotice, ActionDialog, KeyboardAwareScrollView } from './MobileUI';
import JobPhotos from './JobPhotos';
import PropertyProfileMobile from './PropertyProfileMobile';
import FieldWorkTools from './FieldWorkTools';
import ServiceChecklist from './ServiceChecklist';
import JobReassignmentRequest from './JobReassignmentRequest';
import { isEstimateVisit, ESTIMATE_OUTCOMES, completionEstimateOutcome } from '../services/estimateVisitPolicy';
import { jobDestination, formatAppointment } from '../services/workPresentation';
import { completeJob } from '../services/jobCompletion';
import { getQueuedOperation, resolveOffline, readJobAlerts, saveAlertAcknowledgmentOffline, subscribeOffline, alertKey } from '../services/offline';
import NoteAudience from './NoteAudience';
import { tokensForDensity, touchTarget } from '../theme/designTokens';

const emptyDraft = () => ({ actualWorkDone: '', actualHours: '', completionNotes: '', departureExceptionReason: '' });
const workflowSteps = [
  ['arrival', 'Arrival'], ['work', 'Work details'], ['photos', 'Photos and evidence'], ['departure', 'Departure'], ['review', 'Review and completion'],
];
function WorkflowSteps({ active, completed, onSelect, palette, disabled = false, criticalPending = false, syncState, localSteps = {} }) {
  const next = workflowSteps.find(([id]) => !completed[id])?.[0];
  return <View testID="workflow-steps" style={{ borderWidth: 1, borderColor: palette.border, borderRadius: 16, backgroundColor: palette.surface, overflow: 'hidden' }}>
    {workflowSteps.map(([id, label], index) => {
      const done = !!completed[id], selected = active === id, blocked = criticalPending && id !== 'arrival';
      const summary = done ? ({ arrival: 'Arrival saved', work: 'Work details saved', photos: 'Evidence reviewed', departure: 'Departure saved', review: 'Completion saved' }[id]) : 'Not completed';
      const needsAttention = done && (['failed', 'conflict'].includes(syncState) || ['failed', 'conflict'].includes(localSteps[id]));
      const localState = localSteps[id];
      const status = blocked ? 'Review critical alert' : needsAttention ? 'Needs attention' : done && localState === 'syncing' ? 'Waiting to sync' : done && localState === 'pending' ? 'Saved on device' : done ? 'Completed' : id === next ? 'Next step' : 'Not started';
      return <Pressable key={id} accessibilityRole="button" accessibilityLabel={`${label}${done ? ', completed, ' + summary : ''}${selected ? ', current step' : ''}`} accessibilityHint={status}
        accessibilityState={{ disabled: disabled || blocked }} disabled={disabled || blocked} onPress={() => onSelect(id)}
        style={({ pressed }) => ({ minHeight: Platform.OS === 'ios' ? 44 : 48, paddingHorizontal: 12, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: index ? 1 : 0, borderColor: palette.border, opacity: disabled || blocked ? 0.5 : pressed ? 0.7 : 1 })}>
        <Ionicons name={needsAttention ? 'alert-circle-outline' : done ? 'checkmark-circle' : 'ellipse-outline'} size={19} color={needsAttention ? palette.danger : done ? palette.accent : palette.secondary} />
        <Text style={{ flex: 1, color: palette.text, fontSize: 14, lineHeight: 20, fontWeight: id === next ? '700' : '600' }}>{index + 1}. {label}</Text>
        <Text style={{ color: needsAttention ? palette.danger : done ? palette.accent : palette.secondary, fontSize: 11, lineHeight: 16, textAlign: 'right', maxWidth: 92 }}>{status}</Text>
        <Ionicons name="chevron-forward" size={15} color={palette.secondary} />
      </Pressable>;
    })}
  </View>;
}
function LocationAction({ icon, label, accessibilityLabel = label, onPress, palette }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}
    style={({ pressed }) => ({ flexGrow: 1, flexBasis: 82, minHeight: Platform.OS === 'ios' ? 44 : 48, paddingHorizontal: 6, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: palette.border, backgroundColor: palette.input, alignItems: 'center', justifyContent: 'center', gap: 2, opacity: pressed ? 0.75 : 1 })}>
    <Ionicons name={icon} size={18} color={palette.accent} />
    <Text numberOfLines={1} style={{ color: palette.text, fontSize: 13, fontWeight: '700', textAlign: 'center' }}>{label}</Text>
  </Pressable>;
}
function workAccessReason(job, user, permissions) {
  if (!user?.emailVerified || !permissions?.canAccess || !permissions.can?.('jobs.work')) return 'Verify your email and refresh your workspace before changing this job.';
  if (!job?.id) return 'Reopen the job from your job list.';
  if (job.companyId ? job.companyId !== user.companyId : !!user.companyId || job.userId !== user.id) return 'This job does not belong to your current workspace.';
  if (permissions.isTechnician && job.assignedTo !== user.membershipId) return 'This job is no longer assigned to you. Ask your manager to check its assignment.';
  return '';
}

// One mounted workspace, with exclusive inline pages. No native Modal presents
// another Modal or the camera, and the photo owner survives child-page changes.
export default function JobWorkflow({ job, visible = true, onClose, onChanged, onPrepareEstimate, onInteractionChange, onNavigationStateChange, navigationActionsRef }) {
  const { user, permissions } = useAuth(), { palette, tokens: suppliedTokens } = useTheme();
  const tokens = suppliedTokens || tokensForDensity();
  const [mode, setMode] = useState('details'), [draft, setDraft] = useState(emptyDraft);
  const [activeStep, setActiveStep] = useState(null), [stepProgress, setStepProgress] = useState({}), [localSteps, setLocalSteps] = useState({});
  const [expandedAlerts, setExpandedAlerts] = useState({}), [instructionsExpanded, setInstructionsExpanded] = useState(false);
  const [alertDetailsOpen, setAlertDetailsOpen] = useState(false), [summaryOpen, setSummaryOpen] = useState(false), [reassignmentOpen, setReassignmentOpen] = useState(false);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false), [reviewing, setReviewing] = useState(false), [photoBusy, setPhotoBusy] = useState(false), [photoDraft, setPhotoDraft] = useState(false);
  const [workBusy, setWorkBusy] = useState(false), [workDraft, setWorkDraft] = useState(false);
  const [serviceBusy, setServiceBusy] = useState(false), [serviceDraft, setServiceDraft] = useState(false);
  const [requestBusy,setRequestBusy]=useState(false),[requestDraft,setRequestDraft]=useState(false);
  const [retryOperationId, setRetryOperationId] = useState(null), [savedChange, setSavedChange] = useState(null);
  const [submitted, setSubmitted] = useState(null), [closeRequested, setCloseRequested] = useState(false);
  const [completionDialog, setCompletionDialog] = useState(null), [resolvingDrafts, setResolvingDrafts] = useState(false);
  const [alertStatus, setAlertStatus] = useState({ jobId: job?.id, alerts: job?.operationalAlerts || [], acknowledgments: [], local: [] });
  const [alertBusy, setAlertBusy] = useState('');
  const alertFingerprint = (job?.operationalAlerts || []).map(alert => `${alert.source}:${alert.id}:${alert.version}:${alert.active}`).join('|');
  const mounted = useRef(true), generation = useRef(0), submitting = useRef(null), reviewPending = useRef(null), photoBusyRef = useRef(false), photoDraftRef = useRef(false);
  const workBusyRef = useRef(false), workDraftRef = useRef(false);
  const serviceBusyRef = useRef(false), serviceDraftRef = useRef(false);
  const requestBusyRef=useRef(false),requestDraftRef=useRef(false);
  const workActionsRef = useRef(null), checklistActionsRef = useRef(null), draftAction = useRef(null);
  const scrollRef = useRef(null), scrollLayouts = useRef({}), pendingScroll = useRef(null), scrollOffset = useRef(0);
  const scrollBounds = useRef({ content: 0, viewport: 0 });
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const notify = useRef(onInteractionChange); notify.current = onInteractionChange;
  const hasCompletionDraft = Object.values(draft).some(value => String(value).trim());
  const hasDraft = photoDraft || workDraft || serviceDraft || requestDraft || hasCompletionDraft || !!completionDialog, busy = saving || reviewing || photoBusy || workBusy || serviceBusy || requestBusy || resolvingDrafts;
  useEffect(() => {
    let live = true;
    if (!job?.id || !visible) return undefined;
    setAlertStatus({ jobId: job.id, alerts: job.operationalAlerts || [], acknowledgments: [], local: [] });
    const refresh = () => readJobAlerts(job.id, job.operationalAlerts || []).then(result => { if (live) setAlertStatus({ ...result, jobId: job.id }); }).catch(failure => { if (live) setError(failure.message || 'Critical alerts could not be checked.'); });
    void refresh();
    const unsubscribe = subscribeOffline(() => { void refresh(); });
    return () => { live = false; unsubscribe(); };
  }, [job?.id, job?.updatedAt, alertFingerprint, visible]);
  const scrollToMeasured = useCallback(target => {
    const measured = scrollLayouts.current[target], scroller = scrollRef.current;
    if (!measured || !scroller?.scrollTo) return false;
    const { content, viewport } = scrollBounds.current;
    const maximum = content && viewport ? Math.max(0, content - viewport) : measured.y;
    scrollOffset.current = Math.min(Math.max(0, measured.y), maximum);
    scroller.scrollTo({ y: scrollOffset.current, animated: false });
    return true;
  }, []);
  const contentResized = useCallback((_width, height) => {
    scrollBounds.current.content = height;
    const { viewport } = scrollBounds.current;
    if (viewport && scrollOffset.current > Math.max(0, height - viewport)) {
      scrollOffset.current = Math.max(0, height - viewport);
      scrollRef.current?.scrollTo?.({ y: scrollOffset.current, animated: false });
    }
    if (pendingScroll.current) scrollToMeasured(pendingScroll.current);
  }, [scrollToMeasured]);
  const viewportResized = useCallback(event => {
    scrollBounds.current.viewport = event?.nativeEvent?.layout?.height || 0;
    if (pendingScroll.current) scrollToMeasured(pendingScroll.current);
  }, [scrollToMeasured]);
  const requestScroll = useCallback(target => {
    // A hidden stage can retain an old layout position after another stage or an
    // alert changes height. Wait for its new onLayout instead of using that y.
    delete scrollLayouts.current[target];
    pendingScroll.current = target;
    scrollOffset.current = 0;
    scrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }, []);
  const captureScrollLayout = useCallback((target, event) => {
    const layout = event?.nativeEvent?.layout;
    if (!layout || !Number.isFinite(layout.y)) return;
    scrollLayouts.current[target] = { y: layout.y, height: layout.height || 0 };
    if (pendingScroll.current === target && scrollToMeasured(target)) pendingScroll.current = null;
  }, [scrollToMeasured]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; generation.current++; notify.current?.({ busy: false, hasDraft: false }); }; }, []);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardOpen(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  useEffect(() => { notify.current?.({ busy, hasDraft }); }, [busy, hasDraft]);
  useEffect(() => {
    generation.current++; submitting.current = null; reviewPending.current = null; scrollLayouts.current = {}; scrollBounds.current = { content: 0, viewport: 0 }; scrollOffset.current = 0; pendingScroll.current = 'overview';
    setMode('details'); setActiveStep(null); setStepProgress({ arrival: !!job?.visitEvidence?.arrivedAt, departure: !!job?.visitEvidence?.departedAt, work: !!job?.workNotes, review: job?.status === 'completed' }); setLocalSteps({}); setExpandedAlerts({}); setAlertDetailsOpen(false); setSummaryOpen(false); setReassignmentOpen(false); setInstructionsExpanded(false); setDraft(emptyDraft()); setError(''); setNotice(''); setSaving(false); setReviewing(false);
    setPhotoBusy(false); setPhotoDraft(false); photoBusyRef.current = false; photoDraftRef.current = false;
    setWorkBusy(false); setWorkDraft(false); workBusyRef.current = false; workDraftRef.current = false;
    setServiceBusy(false); setServiceDraft(false); serviceBusyRef.current = false; serviceDraftRef.current = false;
    setRequestBusy(false);setRequestDraft(false);requestBusyRef.current=false;requestDraftRef.current=false;
    setRetryOperationId(null); setSavedChange(null); setSubmitted(null); setCloseRequested(false);
    draftAction.current = null; setCompletionDialog(null); setResolvingDrafts(false);
  }, [job?.id]);
  useEffect(() => {
    if (!submitted || submitted.jobId !== job?.id) return;
    if (['failed', 'conflict'].includes(job.syncState)) {
      setDraft(submitted.draft); setRetryOperationId(job.syncOperationId || submitted.operationId);
      setSubmitted(null); setMode('details'); setActiveStep('review'); setNotice('');
      setError(job.syncError || 'The saved completion could not synchronize. Review the current job and retry, or discard the saved change.');
      setCompletionDialog({ kind: 'error', title: 'Completion needs attention', tone: 'error', message: job.syncError || 'The saved completion could not synchronize. Review the current job and retry, or discard the saved change.' });
    } else if (job.status === 'completed' && !['pending', 'syncing'].includes(job.syncState)) {
      setSubmitted(null); setNotice('Job completed and synchronized.');
      setCompletionDialog(current => current?.kind === 'success' ? { kind: 'success', title: 'Visit Completed', tone: 'success', message: 'This visit is saved to the server.' } : current);
    } else if (!['pending', 'syncing'].includes(job.syncState) && job.updatedAt && job.updatedAt !== submitted.baseVersion) {
      // A fresh server version may have reopened/cancelled work after completion.
      // Do not let an earlier local success permanently override that status.
      setSubmitted(null); setNotice(`Job updated online. Current status: ${job.status || 'unknown'}.`);
      setCompletionDialog(current => current?.kind === 'success' ? { kind: 'saved', title: 'Work order updated', tone: 'info', message: `Job updated online. Current status: ${job.status || 'unknown'}.` } : current);
    }
  }, [job, submitted]);
  useEffect(() => {
    if (job?.status === 'completed') {
      setStepProgress(previous => previous.review ? previous : { ...previous, review: true });
      return;
    }
    if (!submitted && !['pending', 'syncing'].includes(job?.syncState)) {
      setStepProgress(previous => previous.review ? { ...previous, review: false } : previous);
    }
  }, [job?.status, job?.syncState, submitted]);
  const updatePhotoBusy = useCallback(value => { photoBusyRef.current = value; if (mounted.current) setPhotoBusy(value); }, []);
  const updatePhotoDraft = useCallback(value => { photoDraftRef.current = value; if (mounted.current) setPhotoDraft(value); }, []);
  const updateWorkBusy = useCallback(value => { workBusyRef.current = value; if (mounted.current) setWorkBusy(value); }, []);
  const updateWorkDraft = useCallback(value => { workDraftRef.current = value; if (mounted.current) setWorkDraft(value); }, []);
  const updateServiceBusy = useCallback(value => { serviceBusyRef.current = value; if (mounted.current) setServiceBusy(value); }, []);
  const updateServiceDraft = useCallback(value => { serviceDraftRef.current = value; if (mounted.current) setServiceDraft(value); }, []);
  const updateRequestBusy=useCallback(value=>{requestBusyRef.current=value;if(mounted.current)setRequestBusy(value);},[]);
  const updateRequestDraft=useCallback(value=>{requestDraftRef.current=value;if(mounted.current)setRequestDraft(value);},[]);
  const accessReason = workAccessReason(job, user, permissions);
  const displayJob = submitted?.jobId === job?.id ? { ...job, ...submitted.draft, status: submitted.status === 'synced' ? 'completed' : job.status, ...(submitted.status === 'queued' ? { syncState: 'pending', localCompletionPending: true } : {}), ...(isEstimateVisit(job) ? { estimateOutcome: completionEstimateOutcome(job, submitted.draft.estimateOutcome) } : {}) } : job;
  const estimateVisit = isEstimateVisit(displayJob);
  const canComplete = !submitted && !accessReason && ['scheduled', 'en-route', 'in-progress'].includes(displayJob?.status);
  const completeStep = useCallback((completed, message) => {
    setStepProgress(previous => ({ ...previous, [completed]: true }));
    setActiveStep(null); Keyboard?.dismiss?.(); requestScroll('overview'); if (message) setNotice(message);
  }, [requestScroll]);
  const workProgress = useCallback(progress => {
    setStepProgress(previous => ({ ...previous, arrival: !!progress.arrival, departure: !!progress.departure, work: previous.work || !!progress.notesSaved }));
    setLocalSteps(previous => ({ ...previous,
      ...(progress.arrival ? { arrival: progress.arrival.syncState || 'synced' } : {}),
      ...(progress.departure ? { departure: progress.departure.syncState || 'synced' } : {}),
    }));
  }, []);
  const localWorkSaved = useCallback((type, result) => {
    const step = ({ arrived: 'arrival', departed: 'departure', work: 'work' })[type];
    if (step) setLocalSteps(previous => ({ ...previous, [step]: result?.state || 'pending' }));
    if (type === 'arrived') completeStep('arrival', 'Arrival saved on this device.');
    else if (type === 'departed') completeStep('departure', 'Departure saved on this device.');
    else if (type === 'work') completeStep('work', 'Work details saved on this device.');
  }, [completeStep]);
  const photoProgress = useCallback(progress => {
    setStepProgress(previous => ({ ...previous, photos: previous.photos || !!progress.hasPhotos }));
  }, []);
  const returnToOverview = useCallback(() => {
    Keyboard?.dismiss?.(); setError(''); setActiveStep(null); requestScroll('overview');
  }, [requestScroll]);
  const openStage = useCallback(step => {
    setError(''); setNotice(''); pendingScroll.current = `stage:${step}`; setActiveStep(step);
    requestScroll(`stage:${step}`);
  }, [requestScroll]);
  const explainBlockedPhoto = () => {
    if (photoBusyRef.current) { setError('Finish or cancel the camera/photo selection before leaving this job.'); return true; }
    if (photoDraftRef.current) { setError('Save or discard the selected photo before leaving this page.'); return true; }
    return false;
  };
  const close = () => {
    if (completionDialog) { if (!busy) setCompletionDialog(null); return; }
    if (submitting.current !== null || reviewPending.current !== null || workBusyRef.current || serviceBusyRef.current || requestBusyRef.current || explainBlockedPhoto()) return;
    if(requestDraftRef.current){showCompletionProblem('Finish submitting or explicitly cancel the reassignment request before closing this work order. Its notes remain in the request section.');return;}
    if (hasCompletionDraft || workDraftRef.current || serviceDraftRef.current || retryOperationId) { setCloseRequested(true); return; }
    onClose?.();
  };
  const inspectDrafts = () => {
    const work = workActionsRef.current?.getDrafts?.(), checklist = checklistActionsRef.current?.getDrafts?.();
    const hasWork = work ? !!work.hasDraft : workDraftRef.current, hasChecklist = checklist ? !!checklist.hasDraft : serviceDraftRef.current;
    const messages = [];
    if (photoDraftRef.current) messages.push('A selected photo has not been saved. Save or discard it in Visit photos before completing this visit.');
    if (work?.notes) messages.push('Work notes have unsaved changes.');
    if (work?.application) messages.push('An optional product application is open and has not been saved.');
    if (work?.visit) messages.push(`${({ arrived: 'An arrival', departed: 'A departure', 'access-blocked': 'An access-blocked' })[work.visitType] || 'A visit'} record has not been saved on this device. Save its evidence or explicitly cancel the unsaved entry.`);
    if (hasWork && !work?.notes && !work?.application && !work?.visit) messages.push('Work notes, a product application or a visit record has unsaved changes.');
    if (hasChecklist) messages.push('The service checklist has unsaved answers.');
    if(requestDraftRef.current)messages.push('Finish submitting or explicitly cancel the reassignment request in its section before completing this work order. Request notes cannot be discarded by completion.');
    if (work?.visitAttempted) messages.push('The visit may already have reached the server. Retry its saved operation to confirm it; it cannot be discarded here.');
    const workReady = !hasWork || !!workActionsRef.current?.saveDrafts && !!workActionsRef.current?.discardDrafts;
    const checklistReady = !hasChecklist || !!checklistActionsRef.current?.saveDrafts && !!checklistActionsRef.current?.discardDrafts;
    return { work, hasWork, hasChecklist, hasDraft: photoDraftRef.current || hasWork || hasChecklist || requestDraftRef.current,
      canSave: !requestDraftRef.current && !photoDraftRef.current && workReady && checklistReady,
      canDiscard: !requestDraftRef.current && !photoDraftRef.current && !work?.visitAttempted && workReady && checklistReady, messages };
  };
  const blockedCompletionReason = () => accessReason || (['cancelled', 'canceled'].includes(displayJob?.status)
    ? 'This job was cancelled. A manager must reopen it before it can be completed.'
    : displayJob?.status === 'completed' ? 'This job is already completed. Refresh the job list.'
      : `This job is ${displayJob?.status || 'unavailable'} and cannot be completed. Ask your manager to check its status.`);
  const showCompletionProblem = (message, kind = 'error') => {
    setError(message); setCloseRequested(false); setCompletionDialog({ kind, title: 'Completion needs attention', message, tone: 'error' });
  };
  const showDrafts = (message = '') => {
    const current = inspectDrafts();
    setCloseRequested(false);
    setCompletionDialog({ kind: 'drafts', title: 'Save your work before completing?', tone: message ? 'error' : 'info',
      message: [message, ...current.messages, current.work?.application ? 'A new product application is optional.' : '', 'Save these entries, keep editing, or explicitly discard unsaved local drafts to continue.'].filter(Boolean).join('\n\n') });
  };
  const resolveDrafts = async (discard,closeAfter=false) => {
    if (draftAction.current !== null || submitting.current !== null || reviewPending.current !== null) return;
    const pending = inspectDrafts();
    if (discard ? !pending.canDiscard : !pending.canSave) { showDrafts('Save or cancel the selected draft in its work section before continuing.'); return; }
    const ticket = generation.current; draftAction.current = ticket; setResolvingDrafts(true); setError('');
    try {
      for (const [needed, actions] of [[pending.hasWork, workActionsRef.current], [pending.hasChecklist, checklistActionsRef.current]]) {
        if (!needed) continue;
        const result = await actions[discard ? 'discardDrafts' : 'saveDrafts']();
        if (!mounted.current || generation.current !== ticket) return;
        if (!result?.success) { showDrafts(result?.message || 'This work is not confirmed as saved. Review the draft and retry.'); return; }
      }
      if (!mounted.current || generation.current !== ticket) return;
      const remaining = inspectDrafts();
      if (remaining.hasDraft) { showDrafts('Some work still needs your attention. Save or cancel it before continuing.'); return; }
      workDraftRef.current = false; serviceDraftRef.current = false; setWorkDraft(false); setServiceDraft(false);
      if(closeAfter){setCompletionDialog(null);setCloseRequested(false);onClose?.();return;}
      if (!canComplete) { showCompletionProblem(blockedCompletionReason()); return; }
      setCompletionDialog(null); setCloseRequested(false); setError(''); setNotice('');
      await review(draft);
    } catch (failure) {
      if (mounted.current && generation.current === ticket) showDrafts(failure.message || 'The draft could not be saved. Your work remains here to retry.');
    } finally {
      if (draftAction.current === ticket) draftAction.current = null;
      if (mounted.current && generation.current === ticket) setResolvingDrafts(false);
    }
  };
  const prepareReview = async nextDraft => {
    if (reviewPending.current !== null || submitting.current !== null) return;
    setError('');
    const ticket = generation.current;
    reviewPending.current = ticket; setReviewing(true);
    try {
      const saved = retryOperationId ? await getQueuedOperation(retryOperationId) : null;
      if (!mounted.current || generation.current !== ticket) return;
      setDraft(nextDraft);
      if (saved?.server && !savedChange) {
        setSavedChange(saved);
        setCompletionDialog({ kind: 'latest', title: 'Review the latest online work', tone: 'error', message: 'The online work order changed after this completion was saved. Review the server details in Review & Complete, then select Complete Visit again. Authorization and assignment will be checked again.' });
        return;
      }
      setSavedChange(saved);
      await submit(nextDraft);
    } catch (failure) {
      if (mounted.current && generation.current === ticket) showCompletionProblem(failure.message || 'Could not read the saved completion. Reopen the job and check saved work.');
    } finally {
      if (reviewPending.current === ticket) reviewPending.current = null;
      if (mounted.current && generation.current === ticket) setReviewing(false);
    }
  };
  const review = async () => {
    if (reviewPending.current !== null || submitting.current !== null) return;
    if (missingCritical.length) { showCompletionProblem('Acknowledge the current critical alert before completing normal work.'); return; }
    if (inspectDrafts().hasDraft) { showDrafts(); return; }
    if (accessReason) { showCompletionProblem(accessReason); return; }
    if (!draft.actualWorkDone.trim()) { showCompletionProblem('Describe the work completed before submitting.'); return; }
    if (draft.actualWorkDone.trim().length > 10000 || draft.completionNotes.trim().length > 10000) { showCompletionProblem('Work details and completion notes must each be at most 10,000 characters.'); return; }
    if (draft.actualHours.trim() && (!Number.isFinite(Number(draft.actualHours)) || Number(draft.actualHours) < 0 || Number(draft.actualHours) > 744)) { showCompletionProblem('Enter actual work hours between 0 and 744, or leave the optional field empty.'); return; }
    const visit = workActionsRef.current?.getVisitStatus?.();
    if (visit?.arrival && !visit?.departure && !draft.departureExceptionReason.trim()) {
      setCompletionDialog({ kind: 'departure', title: 'Departure has not been recorded', tone: 'error', message: 'An arrival is saved for this visit, but no later departure is saved. Record departure now, or enter an explicit exception reason before continuing. No timestamp or GPS evidence will be created automatically.' });
      return;
    }
    await prepareReview(draft);
  };
  const recordDeparture = () => {
    if (busy) return;
    setCompletionDialog(null); setMode('details'); setActiveStep('departure'); setError(''); setNotice('Departure entry is open. Save it before completing the work order.'); requestScroll('stage:departure');
    workActionsRef.current?.beginDeparture?.();
  };
  const continueWithoutDeparture = async () => {
    const reason = draft.departureExceptionReason.trim();
    if (reason.length < 5 || reason.length > 1000) { setCompletionDialog(current => ({ ...current, tone: 'error', message: 'Enter a specific departure exception reason between 5 and 1,000 characters, or record departure.' })); return; }
    setCompletionDialog(null); await prepareReview({ ...draft, departureExceptionReason: reason });
  };
  const submit = async (completionDraft = draft) => {
    if (submitting.current !== null || explainBlockedPhoto()) return;
    const ticket = generation.current, selected = job;
    submitting.current = ticket; setSaving(true); setError('');
    try {
      const result = await completeJob(selected, completionDraft, { retryOperationId });
      if (!mounted.current || generation.current !== ticket) return;
      const completedDraft = { ...completionDraft };
      setSubmitted({ ...result, jobId: selected.id, draft: completedDraft, baseVersion: selected.updatedAt });
      setNotice(result.message || (result.status === 'synced' ? 'Job completed and synchronized.' : 'Completion is saved on this device and awaiting authorized synchronization.'));
      setCompletionDialog({ kind: 'success', title: result.status === 'queued' ? 'Saved on Device — Awaiting Synchronization' : 'Visit Completed', tone: 'success',
        message: result.status === 'queued' ? 'Your visit is safely saved on this device. Keep the app open after reconnecting so synchronization can finish.' : 'This visit is saved to the server.' });
      setDraft(emptyDraft()); setRetryOperationId(null); setSavedChange(null); setMode('details'); setActiveStep(null); requestScroll('overview');
      setStepProgress(previous => ({ ...previous, review: true })); setLocalSteps(previous => ({ ...previous, review: result.status === 'queued' ? 'pending' : 'synced' }));
      try { await onChanged?.(); }
      catch (failure) { if (mounted.current && generation.current === ticket) showCompletionProblem(`Completion was saved. Refresh the job list: ${failure.message || 'The updated list could not be loaded.'}`, 'saved'); }
    } catch (failure) {
      if (!mounted.current || generation.current !== ticket) return;
      setRetryOperationId(failure.operationId || retryOperationId); showCompletionProblem(failure.message || 'Could not complete this job. Check your connection and retry.'); setMode('details'); setActiveStep('review');
    } finally {
      if (submitting.current === ticket) submitting.current = null;
      if (mounted.current && generation.current === ticket) setSaving(false);
    }
  };
  const discardAndClose = async () => {
    if (submitting.current !== null || explainBlockedPhoto()) return;
    const ticket = generation.current; submitting.current = ticket; setSaving(true); setError('');
    try {
      const pending=inspectDrafts();
      if(!pending.canDiscard)throw new Error('Save or cancel the current draft in its section before leaving. Saved work remains on this device.');
      for(const [needed,actions] of [[pending.hasWork,workActionsRef.current],[pending.hasChecklist,checklistActionsRef.current]]){
        if(!needed)continue;
        const result=await actions.discardDrafts();
        if(!mounted.current||generation.current!==ticket)return;
        if(!result?.success)throw new Error(result?.message||'The draft could not be marked discarded. Your work is retained.');
      }
      if (retryOperationId) await resolveOffline(retryOperationId, 'discard');
      if (mounted.current && generation.current === ticket) onClose?.();
    } catch (failure) { if (mounted.current && generation.current === ticket) showCompletionProblem(failure.message || 'Could not discard this saved completion. Keep this screen open and retry.'); }
    finally { if (submitting.current === ticket) submitting.current = null; if (mounted.current && generation.current === ticket) setSaving(false); }
  };
  const handleNavigationBack = useCallback(() => {
    if (completionDialog) { if (!busy) setCompletionDialog(null); return true; }
    if (mode === 'property') { setMode('details'); requestScroll('overview'); return true; }
    if (activeStep) { returnToOverview(); return true; }
    close(); return true;
  }, [activeStep, busy, completionDialog, mode, requestScroll, returnToOverview]);
  useEffect(() => {
    if (navigationActionsRef) navigationActionsRef.current = { handleBack: handleNavigationBack, returnToOverview };
    return () => { if (navigationActionsRef?.current?.handleBack === handleNavigationBack) navigationActionsRef.current = null; };
  }, [handleNavigationBack, navigationActionsRef, returnToOverview]);
  useEffect(() => {
    const step = mode === 'details' ? activeStep : mode === 'property' ? 'property' : 'review';
    onNavigationStateChange?.({ jobId: job?.id, activeStep: step, mode, label: workflowSteps.find(([id]) => id === step)?.[1] || 'Visit Workflow' });
  }, [activeStep, job?.id, mode, onNavigationStateChange]);
  // A retained workflow keeps its scroll position on tab return and app resume.
  // Stage changes explicitly request a fresh measured position in openStage.
  if (!job?.id) return <View><InlineNotice tone="error" message="Reopen the job from your job list." /><GlassButton title="Return to jobs" onPress={onClose} /></View>;
  // Dispatch instructions are projected separately from editable work notes.
  // Offline work-note patches deliberately use the legacy `notes` field.
  const dispatchNotes = typeof displayJob.dispatchNotes === 'string' ? displayJob.dispatchNotes : '';
  const address = typeof displayJob.serviceProperty?.address === 'string' && displayJob.serviceProperty.address.trim() ? displayJob.serviceProperty.address : [displayJob.address, displayJob.city, displayJob.state, displayJob.zipCode].filter(value => typeof value === 'string' && value.trim()).join(', ');
  const destination = jobDestination(displayJob);
  const navigate = () => Linking.openURL('https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(destination) + '&travelmode=driving').catch(failure => setError(failure.message || 'Navigation could not open. Check your map application.'));
  const activeStepLabel = workflowSteps.find(([id]) => id === activeStep)?.[1];
  const activeStepNumber = workflowSteps.findIndex(([id]) => id === activeStep) + 1;
  const overview = mode === 'details' && !activeStep;
  const scopedAlertStatus = alertStatus.jobId === job?.id ? alertStatus : { alerts: displayJob.operationalAlerts || [], acknowledgments: [], local: [] };
  const currentAlerts = scopedAlertStatus.alerts || displayJob.operationalAlerts || [];
  const missingCritical = currentAlerts.filter(alert => alert.active && alert.severity === 'critical' && !scopedAlertStatus.acknowledgments?.some(row => row.alertKey === alertKey(alert)) && !scopedAlertStatus.local?.some(row => row.alertKey === alertKey(alert) && ['pending', 'syncing', 'synced'].includes(row.state)));
  const activeAlerts = currentAlerts.filter(alert => alert.active);
  const pendingAlertSync = activeAlerts.some(alert => ['pending', 'syncing'].includes(scopedAlertStatus.local?.find(row => row.alertKey === alertKey(alert))?.state));
  const activeHazards = activeAlerts.filter(alert => alert.severity === 'critical').length;
  const showAlertDetails = alertDetailsOpen || missingCritical.length > 0;
  const stageBack = mode === 'details' && !!activeStep;
  const visitStatus = workActionsRef.current?.getVisitStatus?.() || {};
  const completionRecorded = displayJob.status === 'completed' || !!submitted;
  const visitOutcome = estimateVisit ? ESTIMATE_OUTCOMES[completionEstimateOutcome(displayJob, draft.estimateOutcome)] : 'Service completed';
  const completionSummary = [
    ['Arrival', stepProgress.arrival || !!visitStatus.arrival ? 'Recorded' : 'Not recorded'],
    ['Work details', stepProgress.work || !!displayJob.workNotes ? 'Saved' : 'Not yet saved'],
    ['Photos and evidence', stepProgress.photos ? 'Reviewed' : 'No evidence marked reviewed'],
    ['Departure', stepProgress.departure || !!visitStatus.departure ? 'Recorded' : 'Not recorded'],
    ['Visit outcome', visitOutcome],
  ];
  const needsStageReview = !completionRecorded && completionSummary[0][1] === 'Recorded' && completionSummary[3][1] !== 'Recorded';
  const arrivalTime = Date.parse(visitStatus.arrival?.occurredAt || visitStatus.arrival?.recordedAt || displayJob.visitEvidence?.arrivedAt || '');
  const departureTime = Date.parse(visitStatus.departure?.occurredAt || visitStatus.departure?.recordedAt || displayJob.visitEvidence?.departedAt || '');
  const elapsedMinutes = Number.isFinite(arrivalTime) && Number.isFinite(departureTime) && departureTime >= arrivalTime ? Math.round((departureTime - arrivalTime) / 60000) : null;
  const duration = Number(displayJob.estimatedDuration ?? displayJob.duration);
  const durationLabel = Number.isFinite(duration) && duration > 0 ? `${duration} ${duration === 1 ? 'hour' : 'hours'}` : 'Duration not set';
  const appointmentLabel = formatAppointment(displayJob, user?.companyTimeZone || user?.timeZone || 'America/Los_Angeles');
  if (mode === 'property') return <View testID="job-property-profile" style={{ flex: 1, backgroundColor: palette.background }}>
    <ScreenHeader title="Property Profile" subtitle={displayJob.customerName || 'Assigned property'} onBack={() => { setMode('details'); requestScroll('overview'); }} />
    <KeyboardAwareScrollView contentContainerStyle={{ paddingHorizontal: 20, gap: tokens.spacing.section }}><PropertyProfileMobile job={displayJob} /></KeyboardAwareScrollView>
  </View>;
  return <View testID="job-workflow" style={{ flex: 1, backgroundColor: palette.background }}>
    <View style={{ flex: 1 }} pointerEvents={completionDialog||closeRequested ? 'none' : 'auto'} accessibilityElementsHidden={!!completionDialog||closeRequested} importantForAccessibility={completionDialog||closeRequested ? 'no-hide-descendants' : 'auto'}>
    <View testID="workflow-compact-header" style={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 6, gap: 2, borderBottomWidth: 1, borderColor: palette.border }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {stageBack && <Pressable accessibilityRole="button" accessibilityLabel="Back to Visit Workflow" onPress={returnToOverview} style={{ minWidth: touchTarget(Platform.OS), minHeight: touchTarget(Platform.OS), alignItems: 'center', justifyContent: 'center' }}><Ionicons name="arrow-back-outline" size={tokens.icon.navigation} color={palette.text} /></Pressable>}
        <View style={{ flex: 1, minWidth: 0 }}><Text accessibilityRole="header" numberOfLines={2} style={{ color: palette.text, ...tokens.type.title }}>{overview ? 'Visit Workflow' : activeStepLabel || 'Visit Workflow'}</Text><Text numberOfLines={2} style={{ color: palette.text, ...tokens.type.body, fontWeight: '600' }}>{displayJob.customerName || 'Assigned customer'} · {displayJob.serviceType || 'Service visit'}</Text></View>
        {overview && <GlassButton secondary title="Close" accessibilityLabel="Close job details" disabled={busy} onPress={close} style={{ minHeight: 44, paddingVertical: 6, paddingHorizontal: 12 }} />}
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 }}><Text style={{ flexShrink: 1, color: palette.secondary, ...tokens.type.support }}>{appointmentLabel} · Estimated duration: {durationLabel}</Text><StatusBadge status={displayJob.status} />{!!displayJob.syncState && <StatusBadge syncState={displayJob.syncState} />}{estimateVisit && <Text style={{ color: palette.accent, ...tokens.type.support, fontWeight: '700' }}>Estimate Visit</Text>}{submitted?.status === 'queued' && <Text style={{ color: palette.secondary, ...tokens.type.support }}>Awaiting synchronization</Text>}</View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <Text accessibilityLabel={activeStepNumber ? `Visit step ${activeStepNumber} of 5: ${activeStepLabel}` : `${Object.values(stepProgress).filter(Boolean).length} of 5 stages completed`} style={{ color: palette.secondary, ...tokens.type.support }}>{activeStepNumber ? `${activeStepNumber} / 5` : `${Object.values(stepProgress).filter(Boolean).length} / 5 done`}</Text>
        {!!activeAlerts.length && <Pressable testID="workflow-safety-indicator" accessibilityRole="button" accessibilityLabel={`${activeHazards} active critical ${activeHazards === 1 ? 'hazard' : 'hazards'}${missingCritical.length ? ', acknowledgment required' : pendingAlertSync ? ', acknowledgment waiting to sync' : ', acknowledged where required'}. Show warning details`} accessibilityState={{ expanded: showAlertDetails }} onPress={() => { if (!missingCritical.length) setAlertDetailsOpen(value => !value); }} style={{ minHeight: touchTarget(Platform.OS), flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ionicons name="warning-outline" size={tokens.icon.inline} color={missingCritical.length ? palette.danger : '#D97706'} /><Text style={{ color: missingCritical.length ? palette.danger : palette.secondary, ...tokens.type.support, fontWeight: '700' }}>{activeHazards ? `${activeHazards} active ${activeHazards === 1 ? 'hazard' : 'hazards'}` : `${activeAlerts.length} alerts`}{missingCritical.length ? ' · Review required' : pendingAlertSync ? ' · Sync pending' : activeHazards ? ' · Acknowledged' : ' · View'}</Text></Pressable>}
      </View>
    </View>
    <KeyboardAwareScrollView scrollRef={scrollRef} includeKeyboardOverlapPadding={false} onLayout={viewportResized} onContentSizeChange={contentResized} onScroll={event => { scrollOffset.current = event?.nativeEvent?.contentOffset?.y || 0; }} bounces={false} alwaysBounceVertical={false} contentContainerStyle={{ paddingHorizontal: 16, gap: tokens.spacing.section }}>
      {!!error && <InlineNotice tone="error" message={error} />}
      {!!notice && <InlineNotice tone="success" message={notice} />}
      {busy && <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}><ActivityIndicator color={palette.accent} /><Text style={{ flex: 1, color: palette.secondary, fontSize: 14, lineHeight: 21 }}>{saving ? 'Saving completion…' : reviewing ? 'Loading saved work…' : workBusy ? 'Saving your work…' : 'Finish or cancel the current action to continue.'}</Text></View>}
      {!!activeAlerts.length && showAlertDetails && <View testID="job-operational-alerts" style={{ borderWidth: 1, borderColor: missingCritical.length ? palette.danger : palette.border, borderRadius: tokens.radius.card, padding: tokens.spacing.card, gap: tokens.spacing.sm, backgroundColor: palette.surface }}>
        <Text accessibilityRole="header" style={{ color: palette.text, fontSize: 15, fontWeight: '700' }}>Property and job alerts · {activeAlerts.length} active</Text>
        {activeAlerts.map(alert => {
          const key = alertKey(alert), acknowledged = scopedAlertStatus.acknowledgments?.some(row => row.alertKey === key), local = scopedAlertStatus.local?.find(row => row.alertKey === key);
          const confirmed = acknowledged || local?.state === 'synced', onDevice = ['pending', 'syncing'].includes(local?.state);
          const compact = alert.severity === 'information' || alert.severity === 'informational' || alert.severity === 'critical' && (confirmed || onDevice);
          const expanded = expandedAlerts[key] ?? !compact;
          const status = confirmed ? 'Acknowledged and saved to server · hazard remains active' : onDevice ? 'Acknowledged on device · waiting to sync · hazard remains active' : local?.state === 'failed' || local?.state === 'conflict' ? `Needs attention: ${local.error || 'Refresh and acknowledge again.'}` : 'Acknowledgment required before normal work';
          return <View key={key} style={{ borderWidth: 1, borderColor: alert.severity === 'critical' && !confirmed && !onDevice ? palette.danger : palette.border, borderRadius: 11, padding: 9, gap: 5 }}>
            <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? 'Collapse' : 'Open'} ${alert.title} alert`} accessibilityState={{ expanded }} onPress={() => setExpandedAlerts(previous => ({ ...previous, [key]: !expanded }))} style={{ minHeight: Platform.OS === 'ios' ? 44 : 48, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
              <Ionicons name={alert.severity === 'critical' ? 'warning-outline' : 'information-circle-outline'} size={18} color={alert.severity === 'critical' ? (confirmed || onDevice ? '#D97706' : palette.danger) : palette.accent} />
              <Text style={{ color: palette.text, fontWeight: '700', fontSize: 14, flex: 1 }}>{alert.severity === 'critical' ? 'Critical' : alert.severity === 'important' ? 'Important' : 'Information'} · {alert.title}</Text>
              <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={17} color={palette.secondary} />
            </Pressable>
            {alert.severity === 'critical' && <Text accessibilityLiveRegion="polite" style={{ color: confirmed || onDevice ? '#D97706' : palette.danger, fontSize: 12, lineHeight: 17 }}>{status}</Text>}
            {expanded && <><Text selectable style={{ color: palette.text, fontSize: 14, lineHeight: 20 }}>{alert.description}</Text>
              {alert.severity === 'critical' && !confirmed && !onDevice && <GlassButton secondary title={alertBusy === key ? 'Saving acknowledgment…' : 'I have read this critical alert'} disabled={!!alertBusy} onPress={async () => { setAlertBusy(key); try { await saveAlertAcknowledgmentOffline(displayJob, alert); setAlertStatus(previous => ({ ...previous, local: [...(previous.local || []).filter(row => row.alertKey !== key), { alertKey: key, state: 'pending' }] })); } catch (failure) { setError(failure.message || 'The acknowledgment was not saved.'); } finally { setAlertBusy(''); } }} />}
            </>}
          </View>;
        })}
      </View>}
      {missingCritical.length > 0 && <InlineNotice tone="error" message="Read and acknowledge the current critical alert before recording normal work. Leave an unsafe property immediately; you can still report blocked access or contact management." />}
      {overview && <View testID="workflow-stage-selector" onLayout={event => captureScrollLayout('overview', event)}><WorkflowSteps active={activeStep} completed={stepProgress} palette={palette} disabled={busy} criticalPending={missingCritical.length > 0} syncState={displayJob.syncState} localSteps={localSteps} onSelect={openStage} /></View>}
      {overview && !!job.syncError && <InlineNotice tone="error" message={job.syncError} />}
      {overview && <Card><SectionHeader title="Service location" />
        <Text style={{ color: palette.text, fontSize: 15, lineHeight: 23 }}>{address || 'No service address supplied. Contact your manager before travelling.'}</Text>
        {!!displayJob.serviceInstructions && <Text style={{ color: palette.text, fontSize: 14, lineHeight: 21 }}>Service instructions: {displayJob.serviceInstructions}</Text>}
        {!!displayJob.propertyAccessInstructions && <Text testID="property-access-instructions" style={{ color: palette.text, fontSize: 15, lineHeight: 23 }}>Property access: {displayJob.propertyAccessInstructions}</Text>}
        {!!(displayJob.serviceProperty?.label || displayJob.serviceProperty?.unit) && <Text style={{ color: palette.secondary, fontSize: 14, lineHeight: 21 }}>Property: {displayJob.serviceProperty.label || 'Service property'}{displayJob.serviceProperty.unit ? ' · Unit ' + displayJob.serviceProperty.unit : ''}</Text>}
        {!estimateVisit && permissions.can?.('jobs.pricing') && (displayJob.estimatedCost ?? displayJob.totalCost) != null && <Text style={{ color: palette.secondary, fontSize: 13 }}>Estimated cost: {'$' + Number(displayJob.estimatedCost ?? displayJob.totalCost).toFixed(2)}</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
          {!!destination && <LocationAction icon="navigate-outline" label="Navigate" accessibilityLabel="Navigate to job" palette={palette} onPress={navigate} />}
          {!!displayJob.customerPhone && <LocationAction icon="call-outline" label="Call" accessibilityLabel="Call customer" palette={palette} onPress={() => Linking.openURL('tel:' + String(displayJob.customerPhone).replace(/[^+0-9]/g, '')).catch(failure => setError(failure.message || 'The phone application could not open.'))} />}
          <LocationAction icon="home-outline" label="Property" accessibilityLabel="Open Property Profile" palette={palette} onPress={() => setMode('property')} />
        </View>
      </Card>}
      {overview && !!dispatchNotes.trim() && <View style={{ borderWidth: 1, borderColor: palette.border, borderRadius: 16, paddingHorizontal: 12, backgroundColor: palette.surface }}>
        <Pressable accessibilityRole="button" accessibilityLabel="Job instructions" accessibilityState={{ expanded: instructionsExpanded }} onPress={() => setInstructionsExpanded(value => !value)} style={{ minHeight: Platform.OS === 'ios' ? 44 : 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: palette.text, fontSize: 14, fontWeight: '700' }}>Job instructions</Text><Ionicons name={instructionsExpanded ? 'chevron-up' : 'chevron-down'} size={17} color={palette.secondary} /></Pressable>
        {instructionsExpanded && <View style={{ paddingBottom: 10, gap: 6 }}><Text testID="job-dispatch-notes" selectable style={{ color: palette.text, fontSize: 14, lineHeight: 21 }}>{dispatchNotes}</Text></View>}
      </View>}
      {mode === 'details' && !!accessReason && <InlineNotice tone="error" message={accessReason} />}
      <View testID={activeStep && ['arrival','departure','work'].includes(activeStep) ? `workflow-stage-${activeStep}` : 'workflow-stage-work-tools'} onLayout={event => { if (activeStep && ['arrival','departure','work'].includes(activeStep)) captureScrollLayout(`stage:${activeStep}`, event); }} style={{ display: mode === 'details' && ['arrival','departure','work'].includes(activeStep) ? 'flex' : 'none' }} accessibilityElementsHidden={mode !== 'details' || !['arrival','departure','work'].includes(activeStep)} importantForAccessibility={mode === 'details' && ['arrival','departure','work'].includes(activeStep) ? 'auto' : 'no-hide-descendants'} pointerEvents={mode === 'details' && ['arrival','departure','work'].includes(activeStep) ? 'auto' : 'none'}>
        <FieldWorkTools key={job.id} job={job} section={activeStep === 'arrival' || activeStep === 'departure' || activeStep === 'work' ? activeStep : 'hidden'} active={mode === 'details' && !completionDialog} draftActionsRef={workActionsRef} readOnly={!!accessReason || ['completed', 'cancelled', 'canceled'].includes(displayJob.status)} criticalPending={missingCritical.length > 0} showNavigation={false} onChanged={onChanged} onBusyChange={updateWorkBusy} onDraftChange={updateWorkDraft} onProgressChange={workProgress} onLocalSave={localWorkSaved} />
      </View>
      <View style={{ display: mode === 'details' && activeStep === 'work' ? 'flex' : 'none' }} accessibilityElementsHidden={mode !== 'details' || activeStep !== 'work'} importantForAccessibility={mode === 'details' && activeStep === 'work' ? 'auto' : 'no-hide-descendants'} pointerEvents={mode === 'details' && activeStep === 'work' ? 'auto' : 'none'}>
        {estimateVisit && onPrepareEstimate && (permissions.can?.('estimates.manage') || permissions.can?.('estimates.prepareAssigned')) && !['cancelled', 'canceled'].includes(displayJob.status) && <Card><SectionHeader title="Inspection scope" /><GlassButton title={displayJob.estimateId ? 'View Estimate' : 'Prepare Estimate'} disabled={busy || hasDraft || missingCritical.length > 0} onPress={() => { if (!missingCritical.length) onPrepareEstimate(displayJob); }} /></Card>}
        {!estimateVisit && <ServiceChecklist key={job.id} job={job} active={mode === 'details' && activeStep === 'work' && !completionDialog} draftActionsRef={checklistActionsRef} readOnly={!!accessReason || ['completed','cancelled','canceled'].includes(displayJob.status)} criticalPending={missingCritical.length > 0} onBusyChange={updateServiceBusy} onDraftChange={updateServiceDraft} onLocalSave={result => { setLocalSteps(previous => ({ ...previous, work: result?.state || 'pending' })); completeStep('work', 'Service checklist saved on this device.'); }} />}
      </View>
      <View testID="workflow-stage-photos" onLayout={event => captureScrollLayout('stage:photos', event)} style={{ display: mode === 'details' && activeStep === 'photos' ? 'flex' : 'none' }} accessibilityElementsHidden={mode !== 'details' || activeStep !== 'photos'} importantForAccessibility={mode === 'details' && activeStep === 'photos' ? 'auto' : 'no-hide-descendants'} pointerEvents={mode === 'details' && activeStep === 'photos' ? 'auto' : 'none'}>
        <Card>
          <JobPhotos key={job.id} job={job} active={mode === 'details' && !completionDialog} criticalPending={missingCritical.length > 0} onBusyChange={updatePhotoBusy} onDraftChange={updatePhotoDraft} onProgressChange={photoProgress} onLocalSave={result => { setLocalSteps(previous => ({ ...previous, photos: result?.state || 'pending' })); completeStep('photos', 'Photo saved on this device.'); }} />
          <GlassButton secondary title="Mark evidence reviewed and return" disabled={busy || photoDraft || missingCritical.length > 0} onPress={() => completeStep('photos', 'Photo evidence reviewed.')} />
        </Card>
      </View>
      <View testID="workflow-stage-review" onLayout={event => captureScrollLayout('stage:review', event)} style={{display:mode==='details'&&activeStep==='review'?'flex':'none',gap:16}} accessibilityElementsHidden={mode!=='details'||activeStep!=='review'} importantForAccessibility={mode==='details'&&activeStep==='review'?'auto':'no-hide-descendants'} pointerEvents={mode==='details'&&activeStep==='review'?'auto':'none'}>
        <Card><SectionHeader title={completionRecorded ? 'Completed visit' : 'Review & complete'} />
          {needsStageReview && <InlineNotice tone="error" message="Departure has not been recorded. Record departure or document an exception before completing." />}
          <Pressable testID="completion-stage-summary-toggle" accessibilityRole="button" accessibilityLabel={summaryOpen || needsStageReview ? 'Hide visit stage summary' : 'Show visit stage summary'} accessibilityState={{ expanded: summaryOpen || needsStageReview }} onPress={() => setSummaryOpen(value => !value)} style={{ minHeight: touchTarget(Platform.OS), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: palette.text, ...tokens.type.body, fontWeight: '700' }}>Visit stages · {completionSummary.slice(0,4).filter(([,value]) => value === 'Recorded' || value === 'Saved' || value === 'Reviewed').length}/4 recorded</Text><Ionicons name={summaryOpen || needsStageReview ? 'chevron-up' : 'chevron-down'} size={tokens.icon.inline} color={palette.secondary} /></Pressable>
          {(summaryOpen || needsStageReview || completionRecorded) && <View style={{gap:4}}>{completionSummary.map(([label,value],index)=>index < 4 && !completionRecorded ? <Pressable key={label} accessibilityRole="button" accessibilityLabel={`Review ${label}: ${value}`} disabled={busy || missingCritical.length > 0} onPress={() => openStage(workflowSteps[index][0])} style={{minHeight:touchTarget(Platform.OS),flexDirection:'row',gap:12,alignItems:'center',justifyContent:'space-between',borderBottomWidth:1,borderColor:palette.border}}><Text style={{color:palette.secondary,...tokens.type.body}}>{label}</Text><Text style={{flex:1,color:palette.text,...tokens.type.body,fontWeight:'600',textAlign:'right'}}>{value}</Text><Ionicons name="chevron-forward" size={15} color={palette.secondary}/></Pressable> : <View key={label} style={{minHeight:36,flexDirection:'row',gap:12,alignItems:'center',justifyContent:'space-between'}}><Text style={{color:palette.secondary,...tokens.type.body}}>{label}</Text><Text style={{flex:1,color:palette.text,...tokens.type.body,fontWeight:'600',textAlign:'right'}}>{value}</Text></View>)}</View>}
          {elapsedMinutes !== null && <Text style={{ color: palette.secondary, ...tokens.type.support }}>Recorded visit duration: {Math.floor(elapsedMinutes / 60)}h {elapsedMinutes % 60}m · enter actual labor hours separately</Text>}
          {completionRecorded ? <View style={{gap:8}} testID="completed-visit-readonly">
            {!!displayJob.actualWorkDone&&<Text style={{color:palette.text,fontSize:15,lineHeight:23}}>Work completed: {displayJob.actualWorkDone}</Text>}
            {displayJob.actualHours!=null&&displayJob.actualHours!==''&&<Text style={{color:palette.secondary,fontSize:14,lineHeight:22}}>Actual hours: {displayJob.actualHours}</Text>}
            {!!displayJob.completionNotes&&<Text style={{color:palette.secondary,fontSize:15,lineHeight:23}}>Completion notes: {displayJob.completionNotes}</Text>}
            {!!displayJob.departureExceptionReason&&<InlineNotice tone="error" message={`Departure exception: ${displayJob.departureExceptionReason}`}/>}
            {!!displayJob.completedAt&&<Text style={{color:palette.secondary,fontSize:14,lineHeight:22}}>Completed: {new Date(displayJob.completedAt).toLocaleString()}</Text>}
            {submitted?.status==='queued'&&<InlineNotice message="Saved on Device — Awaiting Synchronization"/>}
          </View> : <View style={{gap:12}}>
            {estimateVisit&&<View style={{gap:8}}><SectionHeader title="Visit outcome" subtitle="Quote needed is selected by default. Customer delivery remains a management action."/>{Object.entries(ESTIMATE_OUTCOMES).filter(([value])=>value!=='estimate_pending').map(([value,label])=><GlassButton key={value} secondary={completionEstimateOutcome(displayJob,draft.estimateOutcome)!==value} title={label} accessibilityLabel={`Completion outcome: ${label}`} disabled={saving} onPress={()=>setDraft(current=>({...current,estimateOutcome:value}))}/>)}</View>}
            <GlassInput label="Work completed" value={draft.actualWorkDone} onChangeText={value=>setDraft(current=>({...current,actualWorkDone:value}))} editable={!saving} multiline/>
            <GlassInput label="Actual hours worked" value={draft.actualHours} onChangeText={value=>setDraft(current=>({...current,actualHours:value}))} editable={!saving} keyboardType="decimal-pad"/>
            <NoteAudience /><GlassInput label="Completion notes" value={draft.completionNotes} onChangeText={value=>setDraft(current=>({...current,completionNotes:value}))} editable={!saving} multiline/>
            {estimateVisit&&<InlineNotice message={displayJob.estimateId?'A draft estimate is linked to this visit. Management review and customer delivery remain separate.':'Completing this visit will place it in management’s Quote Needed queue. It will not create pricing or contact the customer.'}/>}
            {!!savedChange?.server&&<InlineNotice tone="error"><SectionHeader title="Review the latest online work"/><Text style={{color:palette.text,lineHeight:22}}>Status: {savedChange.server.status||'Not supplied'}</Text><Text style={{color:palette.text,lineHeight:22}}>Work completed: {savedChange.server.actualWorkDone||'Not recorded'}</Text><Text style={{color:palette.text,lineHeight:22}}>Notes: {savedChange.server.notes||savedChange.server.completionNotes||'Not recorded'}</Text></InlineNotice>}
            {!canComplete&&<InlineNotice tone={completionRecorded?'success':'error'} message={blockedCompletionReason()}/>}
          </View>}
        </Card>
        {!completionRecorded && <><Pressable accessibilityRole="button" accessibilityLabel={reassignmentOpen ? 'Hide request reassignment' : 'Request reassignment'} accessibilityState={{ expanded: reassignmentOpen }} onPress={() => setReassignmentOpen(value => !value)} style={{ minHeight: touchTarget(Platform.OS), justifyContent: 'center' }}><Text style={{ color: palette.accent, ...tokens.type.support, fontWeight: '700' }}>{reassignmentOpen ? 'Hide reassignment' : 'Request reassignment'}</Text></Pressable><View style={{ display: reassignmentOpen ? 'flex' : 'none' }} accessibilityElementsHidden={!reassignmentOpen} importantForAccessibility={reassignmentOpen ? 'auto' : 'no-hide-descendants'}><JobReassignmentRequest key={job.id} job={job} user={user} permissions={permissions} active={reassignmentOpen&&mode==='details'&&activeStep==='review'&&!completionDialog} readOnly={!!accessReason||['cancelled','canceled'].includes(displayJob.status)} onChanged={onChanged} onBusyChange={updateRequestBusy} onDraftChange={updateRequestDraft}/></View></>}
      </View>
    </KeyboardAwareScrollView>
    {activeStep === 'review' && canComplete && !keyboardOpen && <View testID="workflow-review-footer" style={{ paddingHorizontal: 16, paddingVertical: 6, borderTopWidth: 1, borderColor: palette.border, backgroundColor: palette.background }}><GlassButton title="Complete Visit" busy={saving || reviewing} disabled={busy || missingCritical.length > 0} onPress={review} /></View>}
    </View>
    {closeRequested&&!completionDialog&&<ActionDialog testID="close-work-drafts-dialog" title="Keep your work?" message="Save supported work drafts before closing. A failed save keeps the work order open and retains your text." busy={busy} onClose={()=>{if(!busy)setCloseRequested(false);}}>
      {(hasCompletionDraft||retryOperationId)&&<InlineNotice message="Resume or cancel the completion draft before saving and closing. Previously queued work remains on the device."/>}
      <GlassButton title="Save drafts and close" disabled={busy||hasCompletionDraft||!!retryOperationId||!inspectDrafts().canSave} busy={resolvingDrafts} onPress={()=>resolveDrafts(false,true)}/>
      <GlassButton secondary title="Keep editing" disabled={busy} onPress={()=>setCloseRequested(false)}/>
      <GlassButton secondary title="Discard draft and close" disabled={busy||!inspectDrafts().canDiscard} onPress={discardAndClose}/>
    </ActionDialog>}
    {!!completionDialog && <ActionDialog testID="completion-action-dialog" title={completionDialog.title} message={completionDialog.message} tone={completionDialog.tone} busy={busy} onClose={() => { if (!busy) setCompletionDialog(null); }}>
      {completionDialog.kind === 'drafts' && <>
        <GlassButton title="Save drafts and continue" busy={resolvingDrafts} disabled={busy || !inspectDrafts().canSave} onPress={() => resolveDrafts(false)} />
        <GlassButton secondary title="Discard unsaved drafts and continue" disabled={busy || !inspectDrafts().canDiscard} onPress={() => resolveDrafts(true)} />
      </>}
      {completionDialog.kind === 'departure' && <>
        <GlassInput label="Reason for completing without departure" value={draft.departureExceptionReason} maxLength={1000} multiline editable={!busy} onChangeText={value => setDraft(current => ({ ...current, departureExceptionReason: value }))} />
        <GlassButton title="Record departure" disabled={busy} onPress={recordDeparture} />
        <GlassButton secondary title="Continue with documented exception" disabled={busy || draft.departureExceptionReason.trim().length < 5} onPress={continueWithoutDeparture} />
      </>}
      {completionDialog.kind === 'success' && <>
        <GlassButton title="Return to My Work" disabled={busy} onPress={() => { if (!busy) onClose?.(); }} />
        <GlassButton secondary title="Review Visit" disabled={busy} onPress={() => { if (!busy) { setCompletionDialog(null); setMode('details'); setActiveStep('review'); requestScroll('stage:review'); } }} />
      </>}
      {!['departure','success'].includes(completionDialog.kind) && <GlassButton secondary title={completionDialog.kind === 'saved' ? 'Return to work order' : 'Keep editing'} disabled={busy} onPress={() => { if (!busy) setCompletionDialog(null); }} />}
    </ActionDialog>}
  </View>;
}
