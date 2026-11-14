import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, BackHandler } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { GlassScreen } from '../components/Glass';
import WorkspaceTabs from '../components/WorkspaceTabs';
import JobWorkflow from '../components/JobWorkflow';
import OfflineStatus from '../components/OfflineStatus';
import WorkLocation from '../components/WorkLocation';
import { ScreenHeader, InlineNotice, LoadingState, PrimaryButton, SecondaryButton, ConfirmationPanel } from '../components/MobileUI';
import { useWorkJobs, useWorkJob } from '../services/useWorkQueries';
import TechnicianHomeScreen from './TechnicianHomeScreen';
import ScheduleScreen from './ScheduleScreen';
import RouteScreen from './RouteScreen';
import SettingsScreen from './SettingsScreen';
import HomeScreen from './HomeScreen';

function RetainedPage({ visible, children }) {
  return <View style={{ flex: 1, display: visible ? 'flex' : 'none' }} pointerEvents={visible ? 'auto' : 'none'}
    accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}>{children}</View>;
}
export default function WorkspaceScreen() {
  const auth = useAuth(), { user, permissions, refreshUser } = auth, { palette } = useTheme();
  const [tab, setTab] = useState('home'), [period, setPeriod] = useState('day'), [selection, setSelection] = useState(null);
  const [notice, setNotice] = useState(''), [confirmLeave, setConfirmLeave] = useState(false), [interaction, setInteraction] = useState({ busy: false, hasDraft: false });
  const [managementAction, setManagementAction] = useState(null), managementSequence = useRef(0);
  const interactionRef = useRef(interaction), destination = useRef(null);
  const home = useWorkJobs('day', { enabled: permissions.isTechnician && tab === 'home' && !selection });
  const schedule = useWorkJobs(period, { enabled: tab === 'schedule' && !selection });
  const detail = useWorkJob(selection?.id, { enabled: !!selection });
  const accessStatus = detail.accessStatus || auth.accessStatus || 'ready';
  const canRead = detail.canReadWork ?? permissions.canAccess;
  const blocked = !!selection && (!canRead || detail.resourceDenied);
  const job = detail.job || selection?.snapshot || null;
  const onInteractionChange = useCallback(next => {
    interactionRef.current = next;
    setInteraction(previous => previous.busy === next.busy && previous.hasDraft === next.hasDraft ? previous : next);
  }, []);
  const closeSelection = useCallback(() => {
    setSelection(null); setConfirmLeave(false); setNotice('');
    interactionRef.current = { busy: false, hasDraft: false }; setInteraction(interactionRef.current);
    if (destination.current) { setTab(destination.current); destination.current = null; }
  }, []);
  const requestTab = useCallback(next => {
    if (interactionRef.current.busy) { setNotice('Finish or cancel the current photo or save operation before changing screens.'); return; }
    if (interactionRef.current.hasDraft) { destination.current = selection ? next : null; setNotice('Your draft is still here. Save it, or use Close to review discarding it before changing screens.'); return; }
    setSelection(null); setNotice(''); destination.current = null; setTab(next);
  }, [selection]);
  const openJob = useCallback(next => {
    if (!next?.id) return;
    destination.current = null; setNotice(''); setConfirmLeave(false);
    setSelection({ id: next.id, snapshot: next.companyId || next.userId ? next : null, origin: tab });
  }, [tab]);
  const openManagement = useCallback((kind, selected) => {
    if (!permissions.canManage || blocked || !canRead || interactionRef.current.busy || interactionRef.current.hasDraft) return;
    if (!selected?.id || (selected.companyId ? selected.companyId !== user.companyId : !!user.companyId || selected.userId !== user.id)) return;
    setManagementAction({ id: ++managementSequence.current, kind, job: selected });
    closeSelection(); setTab('home');
  }, [permissions.canManage, blocked, canRead, user.companyId, user.id, closeSelection]);
  const consumeManagementAction = useCallback(id => setManagementAction(current => current?.id === id ? null : current), []);
  const refreshWork = useCallback(async () => {
    // Mutation/sync refresh is explicit and updates retained lists as well as the
    // current detail; ordinary polling remains confined to the visible page.
    await Promise.all([home.refetch(), schedule.refetch(), ...(selection ? [detail.refetch()] : [])]);
  }, [home.refetch, schedule.refetch, detail.refetch, selection?.id]);
  useEffect(() => {
    if (!detail.job || detail.job.id !== selection?.id) return;
    setSelection(current => current && current.snapshot !== detail.job ? { ...current, snapshot: detail.job } : current);
  }, [detail.job, selection?.id]);
  useEffect(() => {
    const subscription = BackHandler?.addEventListener('hardwareBackPress', () => {
      if (selection) {
        if (interactionRef.current.busy || interactionRef.current.hasDraft) setNotice('Your draft is still here. Use Close in the work order to save or discard it safely.');
        else closeSelection();
        return true;
      }
      if (tab !== 'home') { requestTab('home'); return true; }
      return false;
    });
    return () => subscription?.remove();
  }, [selection, tab, requestTab, closeSelection]);
  const navigation = { navigate: requestTab, goBack: () => requestTab('home') };
  const pendingAccess = ['checking','unavailable'].includes(auth.accessStatus);
  return <GlassScreen><View style={{ flex: 1 }}>
    {!selection && pendingAccess && <View style={{ paddingHorizontal: 20, paddingTop: 8 }}><InlineNotice tone={auth.accessStatus === 'unavailable' ? 'error' : 'info'} message={auth.accessError?.message || auth.accessError || (auth.accessStatus === 'checking' ? 'Checking your workspace access…' : 'Access could not be checked. Reconnect or retry to continue.')}>
      {auth.accessStatus === 'unavailable' && <SecondaryButton title="Retry access check" onPress={refreshUser} />}
    </InlineNotice></View>}
    {!selection && !!notice && <View style={{ padding: 16 }}><InlineNotice message={notice} /></View>}
    <View style={{ flex: 1 }}>
    <View style={{ flex: 1 }} pointerEvents={selection ? 'none' : 'auto'} accessibilityElementsHidden={!!selection} importantForAccessibility={selection ? 'no-hide-descendants' : 'auto'}>
      <RetainedPage visible={tab === 'home'}>{permissions.isTechnician
        ? <TechnicianHomeScreen user={user} query={home} onOpenJob={openJob} onSchedule={() => requestTab('schedule')}>
          <OfflineStatus onSynced={refreshWork} /><WorkLocation jobs={home.jobs} jobsReady={home.dataChecked === true && home.accessStatus === 'ready'} />
        </TechnicianHomeScreen>
        : <HomeScreen navigation={navigation} embedded active={tab === 'home' && !selection} onInteractionChange={onInteractionChange}
          managementAction={managementAction} onManagementActionHandled={consumeManagementAction} />}
      </RetainedPage>
      <RetainedPage visible={tab === 'schedule'}><ScheduleScreen user={user} query={schedule} period={period} onPeriodChange={setPeriod} onOpenJob={openJob} /></RetainedPage>
      <RetainedPage visible={tab === 'route'}><RouteScreen user={user} active={tab === 'route' && !selection} onOpenJob={openJob} /></RetainedPage>
      <RetainedPage visible={tab === 'settings'}><SettingsScreen navigation={navigation} embedded /></RetainedPage>
    </View>
    {!!selection && <View accessibilityViewIsModal testID="selected-work-order" style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: palette.background }}>
      {!!job && <RetainedPage visible={!blocked}><JobWorkflow key={selection.id} job={job} onClose={closeSelection} onChanged={refreshWork} onInteractionChange={onInteractionChange}
        onEdit={permissions.canManage ? selected => openManagement('edit', selected) : undefined}
        onFollowUp={permissions.canManage ? selected => openManagement('follow-up', selected) : undefined} /></RetainedPage>}
      {(!job || blocked) && <View style={{ flex: 1, paddingBottom: 20 }}><ScreenHeader title="Work order" subtitle={user.companyName} />
        <View style={{ paddingHorizontal: 20, gap: 16 }}>{accessStatus === 'checking' || detail.isLoading ? <LoadingState message="Checking this work order…" />
          : <InlineNotice tone="error" message={detail.error?.message || auth.accessError?.message || auth.accessError || 'This work order could not be opened. It may have been reassigned, removed, or be unavailable while offline.'} />}
          {!detail.isLoading && <SecondaryButton title="Retry work order" onPress={() => detail.refetch()} />}
          <PrimaryButton title="Return to schedule" disabled={interaction.busy} onPress={() => { if (interactionRef.current.busy) return; destination.current = 'schedule'; if (interactionRef.current.hasDraft) setConfirmLeave(true); else closeSelection(); }} />
          {confirmLeave && <ConfirmationPanel title="Leave this work order?" message="Unsaved input on this page will close. Previously saved work and photos remain in the synchronization queue for review.">
            <SecondaryButton title="Keep draft open" onPress={() => setConfirmLeave(false)} /><PrimaryButton title="Leave work order" onPress={closeSelection} />
          </ConfirmationPanel>}
        </View>
      </View>}
      {!!detail.error && !!job && !blocked && <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}><InlineNotice tone="error" message={`${detail.error.message || 'Could not refresh this job.'} Your current draft is retained. Changes are checked again when saved.`} /></View>}
      {!!notice && <View style={{ padding: 16 }}><InlineNotice message={notice} /></View>}
    </View>}
    </View>
    <WorkspaceTabs active={tab} busy={interaction.busy} onSelect={requestTab} />
  </View></GlassScreen>;
}
