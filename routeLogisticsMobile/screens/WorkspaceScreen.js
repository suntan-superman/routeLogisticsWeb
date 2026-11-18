import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, BackHandler, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { GlassScreen } from '../components/Glass';
import WorkspaceTabs from '../components/WorkspaceTabs';
import WorkspaceModeSelector from '../components/WorkspaceModeSelector';
import JobWorkflow from '../components/JobWorkflow';
import OfflineStatus from '../components/OfflineStatus';
import WorkLocation from '../components/WorkLocation';
import NativePushBridge from '../components/NativePushBridge';
import { ScreenHeader, InlineNotice, LoadingState, PrimaryButton, SecondaryButton, ConfirmationPanel } from '../components/MobileUI';
import { useWorkJobs, useWorkJob } from '../services/useWorkQueries';
import TechnicianHomeScreen from './TechnicianHomeScreen';
import ScheduleScreen from './ScheduleScreen';
import RouteScreen from './RouteScreen';
import SettingsScreen from './SettingsScreen';
import HomeScreen from './HomeScreen';
import EstimatesScreen from './EstimatesScreen';
import ManagementScreen from './ManagementScreen';
import { canUseManagementMode, loadWorkspaceMode, saveWorkspaceMode, permittedMode } from '../services/mobileMode';
import { estimateVisitSnapshot } from '../services/estimateVisitPolicy';

function RetainedPage({ visible, children }) {
  return <View style={{ flex: 1, display: visible ? 'flex' : 'none' }} pointerEvents={visible ? 'auto' : 'none'}
    accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}>{children}</View>;
}
export default function WorkspaceScreen() {
  const auth = useAuth(), { user, permissions, refreshUser } = auth, { palette } = useTheme();
  const identity = `${user.id}:${user.companyId || 'solo'}`, eligible = canUseManagementMode(user, permissions);
  const workIdentity = `${identity}:${user.role || 'solo'}:${user.membershipId || ''}`;
  const [modePreference, setModePreference] = useState({ identity, mode: 'field', ready: false });
  const [managementTab, setManagementTab] = useState('overview'), modeTicket = useRef(0);
  const mode = modePreference.identity === identity ? permittedMode(modePreference.mode, user, permissions) : 'field';
  const companyField = !!user.companyId, fieldVisible = mode === 'field';
  const [tab, setTab] = useState('home'), [period, setPeriod] = useState('day'), [selection, setSelection] = useState(null);
  const [estimateVisit, setEstimateVisit] = useState(null);
  const [notice, setNotice] = useState(''), [confirmLeave, setConfirmLeave] = useState(false), [interaction, setInteraction] = useState({ busy: false, hasDraft: false });
  const [shiftBusy, setShiftBusy] = useState(false), shiftInteractionRef = useRef(false);
  const [managementAction, setManagementAction] = useState(null), managementSequence = useRef(0);
  const interactionRef = useRef(interaction), destination = useRef(null);
  const currentSelection = selection?.identity === workIdentity ? selection : null;
  const home = useWorkJobs('day', { personal: companyField, enabled: companyField && fieldVisible && tab === 'home' && !currentSelection });
  const schedule = useWorkJobs(period, { personal: companyField, enabled: fieldVisible && tab === 'schedule' && !currentSelection });
  const detail = useWorkJob(currentSelection?.id, { enabled: !!currentSelection });
  const accessStatus = detail.accessStatus || auth.accessStatus || 'ready';
  const canRead = detail.canReadWork ?? permissions.canAccess;
  const blocked = !!currentSelection && (!canRead || detail.resourceDenied);
  const job = detail.job?.id === currentSelection?.id ? detail.job : currentSelection?.snapshot || null;
  useEffect(() => {
    const ticket = ++modeTicket.current;
    setModePreference({ identity, mode: 'field', ready: !eligible });
    if (eligible) loadWorkspaceMode(AsyncStorage, user, permissions).then(value => {
      if (ticket === modeTicket.current) setModePreference({ identity, mode: value, ready: true });
    }).catch(() => {
      if (ticket === modeTicket.current) { setModePreference({ identity, mode: 'field', ready: true }); setNotice('Your saved mode could not be loaded. Field Mode is ready; try switching again.'); }
    });
    return () => { modeTicket.current++; };
  }, [identity, eligible]);
  const onInteractionChange = useCallback(next => {
    interactionRef.current = next;
    setInteraction(previous => previous.busy === next.busy && previous.hasDraft === next.hasDraft ? previous : next);
  }, []);
  const onShiftInteractionChange = useCallback(next => {
    shiftInteractionRef.current = !!next?.busy;
    setShiftBusy(!!next?.busy);
  }, []);
  const closeSelection = useCallback(() => {
    setSelection(null); setConfirmLeave(false); setNotice('');
    interactionRef.current = { busy: false, hasDraft: false }; setInteraction(interactionRef.current);
    if (destination.current) {
      if (destination.current.management) setManagementTab(destination.current.management);
      else setTab(destination.current);
      destination.current = null;
    }
  }, []);
  const requestTab = useCallback(next => {
    if (next === 'estimates' && !permissions.can('estimates.manage') && !permissions.can('estimates.prepareAssigned')) return;
    if ((interactionRef.current.busy || shiftInteractionRef.current)) { setNotice('Finish or cancel the current photo or save operation before changing screens.'); return; }
    if (interactionRef.current.hasDraft) { destination.current = selection ? next : null; setNotice('Your draft is still here. Save it, or use Close to review discarding it before changing screens.'); return; }
    setSelection(null); setNotice(''); destination.current = null; setTab(next);
  }, [selection, permissions]);
  const requestMode = useCallback(next => {
    if (!eligible || !modePreference.ready || modePreference.identity !== identity || !['field', 'management'].includes(next) || next === mode) return;
    if ((interactionRef.current.busy || shiftInteractionRef.current)) { setNotice('Finish or cancel the current photo or save operation before switching modes.'); return; }
    if (interactionRef.current.hasDraft) { setNotice('Your draft is still here. Save it or use Close to review discarding it before switching modes.'); return; }
    setSelection(null); setNotice(''); destination.current = null;
    setModePreference({ identity, mode: next, ready: true });
    const ticket = modeTicket.current;
    saveWorkspaceMode(AsyncStorage, user, permissions, next).catch(() => {
      if (ticket === modeTicket.current) setNotice('Mode changed, but it could not be remembered on this device. Try switching again when device storage is available.');
    });
  }, [eligible, modePreference.ready, modePreference.identity, identity, mode, user, permissions]);
  const requestManagementTab = useCallback(next => {
    if (!eligible || !['overview', 'team', 'map', 'schedule', 'estimates'].includes(next)) return;
    if ((interactionRef.current.busy || shiftInteractionRef.current)) { setNotice('Finish or cancel the current save operation before changing screens.'); return; }
    if (interactionRef.current.hasDraft) { setNotice('Your draft is still here. Save or cancel it before changing management screens.'); return; }
    setSelection(null); setNotice(''); setManagementTab(next);
  }, [eligible]);
  const openJob = useCallback(next => {
    if (!next?.id || !permissions.canAccess || (interactionRef.current.busy || shiftInteractionRef.current) || interactionRef.current.hasDraft) return;
    if (next.companyId && next.companyId !== user.companyId) return;
    if (next.userId && !next.companyId && (user.companyId || next.userId !== user.id)) return;
    destination.current = null; setNotice(''); setConfirmLeave(false);
    setSelection({ id: next.id, identity: workIdentity, snapshot: next.companyId || next.userId ? next : null, origin: mode === 'management' ? managementTab : tab });
  }, [tab, managementTab, mode, workIdentity, permissions.canAccess, user.companyId, user.id]);
  const openManagement = useCallback((kind, selected) => {
    if (!permissions.canManage || blocked || !canRead || (interactionRef.current.busy || shiftInteractionRef.current) || interactionRef.current.hasDraft) return;
    if (!selected?.id || (selected.companyId ? selected.companyId !== user.companyId : !!user.companyId || selected.userId !== user.id)) return;
    if (user.companyId) {
      setNotice('Scheduling, full job editing and follow-up creation continue on the web. Your work order remains open here.');
      Linking.openURL('https://route-logistics.com/jobs').catch(() => setNotice('Could not open the web workspace. Visit route-logistics.com/jobs to edit or schedule this work.'));
      return;
    }
    setManagementAction({ id: ++managementSequence.current, kind, job: selected });
    closeSelection(); setTab('home');
  }, [permissions.canManage, blocked, canRead, user.companyId, user.id, closeSelection]);
  const prepareEstimate = useCallback(selected => {
    if (!selected?.id || !permissions.can('estimates.manage') && !permissions.can('estimates.prepareAssigned')) return;
    if (selected.companyId !== user.companyId || selected.appointmentKind !== 'estimate_visit') return;
    const visit = estimateVisitSnapshot(selected);
    if (!visit) { setNotice('This estimate visit is missing the cached customer or property context needed to prepare an estimate. Reopen it online and try again.'); return; }
    setEstimateVisit(visit);
    destination.current = 'estimates';
    closeSelection();
  }, [permissions, user.companyId, closeSelection]);
  const returnToEstimateVisit = useCallback(visit => {
    const selected = visit?.snapshot;
    if (!selected?.id || selected.companyId !== user.companyId) { setNotice('The originating work order is no longer available in this workspace. Return to your schedule and reopen it.'); return; }
    setEstimateVisit(null); openJob(selected);
  }, [openJob, user.companyId]);
  const consumeManagementAction = useCallback(id => setManagementAction(current => current?.id === id ? null : current), []);
  const refreshWork = useCallback(async () => {
    // Mutation/sync refresh is explicit and updates retained lists as well as the
    // current detail; ordinary polling remains confined to the visible page.
    await home.refreshWork();
  }, [home.refreshWork]);
  useEffect(() => {
    if (!detail.job || detail.job.id !== currentSelection?.id) return;
    setSelection(current => current && current.snapshot !== detail.job ? { ...current, snapshot: detail.job } : current);
  }, [detail.job, currentSelection?.id]);
  useEffect(() => {
    const subscription = BackHandler?.addEventListener('hardwareBackPress', () => {
      if (currentSelection) {
        if ((interactionRef.current.busy || shiftInteractionRef.current) || interactionRef.current.hasDraft) setNotice('Your draft is still here. Use Close in the work order to save or discard it safely.');
        else closeSelection();
        return true;
      }
      if (mode === 'management' && managementTab !== 'overview') { requestManagementTab('overview'); return true; }
      if (mode === 'field' && tab !== 'home') { requestTab('home'); return true; }
      return false;
    });
    return () => subscription?.remove();
  }, [currentSelection, tab, mode, managementTab, requestTab, requestManagementTab, closeSelection]);
  const navigation = { navigate: requestTab, goBack: () => requestTab('home') };
  const pendingAccess = ['checking','unavailable'].includes(auth.accessStatus);
  return <WorkLocation active={companyField && fieldVisible && tab === 'home' && !currentSelection} disabled={interaction.busy || interaction.hasDraft} onInteractionChange={onShiftInteractionChange}>
    {({ button, dialog }) => <GlassScreen><View style={{ flex: 1 }}>
    <View style={{ flex: 1 }} pointerEvents={dialog ? 'none' : 'auto'} accessibilityElementsHidden={!!dialog} importantForAccessibility={dialog ? 'no-hide-descendants' : 'auto'}>
    <NativePushBridge onOpenJob={openJob} onUpdate={refreshWork} blocked={interaction.busy || shiftBusy || interaction.hasDraft} />
    {eligible && <WorkspaceModeSelector mode={mode} onSelect={requestMode} disabled={interaction.busy || shiftBusy || !modePreference.ready || modePreference.identity !== identity} />}
    {!currentSelection && pendingAccess && <View style={{ paddingHorizontal: 20, paddingTop: 8 }}><InlineNotice tone={auth.accessStatus === 'unavailable' ? 'error' : 'info'} message={auth.accessError?.message || auth.accessError || (auth.accessStatus === 'checking' ? 'Checking your workspace access…' : 'Access could not be checked. Reconnect or retry to continue.')}>
      {auth.accessStatus === 'unavailable' && <SecondaryButton title="Retry access check" onPress={refreshUser} />}
    </InlineNotice></View>}
    {!currentSelection && !!notice && <View style={{ padding: 16 }}><InlineNotice message={notice} /></View>}
    <View style={{ flex: 1 }}>
    <View style={{ flex: 1 }} pointerEvents={currentSelection ? 'none' : 'auto'} accessibilityElementsHidden={!!currentSelection} importantForAccessibility={currentSelection ? 'no-hide-descendants' : 'auto'}>
      <RetainedPage visible={fieldVisible && tab === 'home'}>{companyField
        ? <TechnicianHomeScreen user={user} query={home} onOpenJob={openJob} onSchedule={() => requestTab('schedule')} headerAction={button}>
          <OfflineStatus onSynced={refreshWork} />
        </TechnicianHomeScreen>
        : <HomeScreen navigation={navigation} embedded active={fieldVisible && tab === 'home' && !currentSelection} onInteractionChange={onInteractionChange}
          managementAction={managementAction} onManagementActionHandled={consumeManagementAction} />}
      </RetainedPage>
      <RetainedPage visible={fieldVisible && tab === 'schedule'}><ScheduleScreen user={user} query={schedule} period={period} onPeriodChange={setPeriod} onOpenJob={openJob} /></RetainedPage>
      <RetainedPage visible={fieldVisible && tab === 'route'}><RouteScreen user={user} active={fieldVisible && tab === 'route' && !currentSelection} onOpenJob={openJob} /></RetainedPage>
      <RetainedPage visible={fieldVisible && tab === 'settings'}><SettingsScreen navigation={navigation} embedded active={fieldVisible && tab === 'settings' && !currentSelection} /></RetainedPage>
      {(permissions.can('estimates.manage') || permissions.can('estimates.prepareAssigned')) && <RetainedPage visible={fieldVisible && tab === 'estimates'}><EstimatesScreen active={fieldVisible && tab === 'estimates' && !currentSelection} initialVisit={estimateVisit} onVisitConsumed={() => setEstimateVisit(null)} onReturnToVisit={returnToEstimateVisit} onInteractionChange={onInteractionChange} /></RetainedPage>}
      {eligible && <RetainedPage visible={!fieldVisible && managementTab !== 'estimates'}><ManagementScreen user={user} permissions={permissions} active={!fieldVisible && managementTab !== 'estimates' && !currentSelection} view={managementTab} onViewChange={requestManagementTab} onOpenJob={openJob} onChanged={refreshWork} onInteractionChange={onInteractionChange} /></RetainedPage>}
      {eligible && permissions.can('estimates.manage') && <RetainedPage visible={!fieldVisible && managementTab === 'estimates'}><EstimatesScreen active={!fieldVisible && managementTab === 'estimates' && !currentSelection} onInteractionChange={onInteractionChange} /></RetainedPage>}
    </View>
    {!!currentSelection && <View accessibilityViewIsModal testID="selected-work-order" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: palette.background }}>
      {!!job && <RetainedPage visible={!blocked}><JobWorkflow key={currentSelection.id} job={job} onClose={closeSelection} onChanged={refreshWork} onInteractionChange={onInteractionChange}
        onPrepareEstimate={prepareEstimate}
        onEdit={permissions.canManage ? selected => openManagement('edit', selected) : undefined}
        onFollowUp={permissions.canManage ? selected => openManagement('follow-up', selected) : undefined} /></RetainedPage>}
      {(!job || blocked) && <View style={{ flex: 1, paddingBottom: 20 }}><ScreenHeader title="Work order" subtitle={user.companyName} />
        <View style={{ paddingHorizontal: 20, gap: 16 }}>{accessStatus === 'checking' || detail.isLoading ? <LoadingState message="Checking this work order…" />
          : <InlineNotice tone="error" message={detail.error?.message || auth.accessError?.message || auth.accessError || 'This work order could not be opened. It may have been reassigned, removed, or be unavailable while offline.'} />}
          {!detail.isLoading && <SecondaryButton title="Retry work order" onPress={() => detail.refetch()} />}
          <PrimaryButton title="Return to schedule" disabled={interaction.busy} onPress={() => { if ((interactionRef.current.busy || shiftInteractionRef.current)) return; destination.current = mode === 'management' ? { management: 'schedule' } : 'schedule'; if (interactionRef.current.hasDraft) setConfirmLeave(true); else closeSelection(); }} />
          {confirmLeave && <ConfirmationPanel title="Leave this work order?" message="Unsaved input on this page will close. Previously saved work and photos remain in the synchronization queue for review.">
            <SecondaryButton title="Keep draft open" onPress={() => setConfirmLeave(false)} /><PrimaryButton title="Leave work order" onPress={closeSelection} />
          </ConfirmationPanel>}
        </View>
      </View>}
      {!!detail.error && !!job && !blocked && <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}><InlineNotice tone="error" message={`${detail.error.message || 'Could not refresh this job.'} Your current draft is retained. Changes are checked again when saved.`} /></View>}
      {!!notice && <View style={{ padding: 16 }}><InlineNotice message={notice} /></View>}
    </View>}
    </View>
    <WorkspaceTabs mode={mode} active={mode === 'management' ? managementTab : tab} busy={interaction.busy || shiftBusy} onSelect={mode === 'management' ? requestManagementTab : requestTab} />
    </View>{dialog}
  </View></GlassScreen>}
  </WorkLocation>;
}
