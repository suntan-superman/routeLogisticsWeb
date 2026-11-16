import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { Card, SectionHeader, SecondaryButton, PrimaryButton, InlineNotice } from './MobileUI';
import { ESTIMATE_OUTCOMES, estimateOutcome, estimateOutcomeLabel } from '../services/estimateVisitPolicy';
import { saveEstimateVisitOutcome } from '../services/estimateVisitOperations';

export default function EstimateVisitOutcome({ job, active = true, readOnly = false, onChanged, onBusyChange, onDraftChange }) {
  const { palette } = useTheme();
  const [open, setOpen] = useState(false), [selected, setSelected] = useState(() => estimateOutcome(job));
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(null), [retry, setRetry] = useState(null);
  const lifetime = useRef({ alive: true, ticket: 0, pending: null }), notifyBusy = useRef(onBusyChange), notifyDraft = useRef(onDraftChange);
  const sourceJob = useRef(job);
  notifyBusy.current = onBusyChange; notifyDraft.current = onDraftChange;
  useEffect(() => { const state = lifetime.current; state.alive = true; return () => { state.alive = false; state.ticket++; notifyBusy.current?.(false); notifyDraft.current?.(false); }; }, []);
  useEffect(() => { lifetime.current.ticket++; lifetime.current.pending = null; setBusy(false); setOpen(false); setSelected(estimateOutcome(job)); setNotice(null); setRetry(null); }, [job.id]);
  useEffect(() => { if (active) { onBusyChange?.(busy); onDraftChange?.(open); } }, [active, busy, open, onBusyChange, onDraftChange]);
  const show = () => { if (active && !readOnly && !busy) { sourceJob.current = job; setSelected(estimateOutcome(job)); setNotice(null); setRetry(null); setOpen(true); } };
  const save = async () => {
    if (lifetime.current.pending !== null || busy || readOnly || !active) return;
    const state = lifetime.current, ticket = state.ticket; state.pending = ticket; setBusy(true); setNotice(null);
    try {
      const result = await saveEstimateVisitOutcome(retry ? job : sourceJob.current, selected, { retryOperationId: retry });
      if (!state.alive || state.ticket !== ticket) return;
      setNotice({ tone: 'success', message: result.message }); setRetry(null); setOpen(false);
      try { await onChanged?.(); } catch { if (state.alive && state.ticket === ticket) setNotice({ message: `${result.message} Refresh the visit to load its latest details.` }); }
    } catch (error) { if (state.alive && state.ticket === ticket) { setRetry(error.operationId || retry); setNotice({ tone: 'error', message: error.message || 'The outcome could not be saved. Your selection is retained.' }); } }
    finally { if (state.pending === ticket) state.pending = null; if (state.alive && state.ticket === ticket) setBusy(false); }
  };
  return <Card><SectionHeader title="Estimate visit outcome" subtitle="This visit is nonbillable. Its completion does not approve paid work or create an invoice." />
      <Text testID="estimate-visit-outcome" style={{ color: palette.text, lineHeight: 23 }}>{estimateOutcomeLabel(job)}</Text>
      {!!job.inquiryId && <Text style={{ color: palette.secondary, lineHeight: 21 }}>Inquiry reference: {job.inquiryId}</Text>}
      {!open && notice && <InlineNotice {...notice} />}
      {!readOnly && !open && <SecondaryButton title="Record visit outcome" disabled={busy || !active} onPress={show} />}
    {open && <View testID="estimate-outcome-editor" style={{ gap: 10 }}>
      <Text style={{ color: palette.secondary, lineHeight: 22 }}>Choose the observed outcome. No estimate, customer approval or invoice is created here.</Text>
      {notice && <InlineNotice {...notice} />}
      {Object.entries(ESTIMATE_OUTCOMES).filter(([value]) => job.status !== 'completed' || value !== 'estimate_pending').map(([value, label]) => <Pressable key={value} accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{ checked: selected === value, disabled: busy || readOnly || !active }} disabled={busy || readOnly || !active} onPress={() => { setSelected(value); setRetry(null); }} style={{ padding: 12, minHeight: 46, borderRadius: 12, borderWidth: 1, borderColor: selected === value ? palette.accent : palette.border, backgroundColor: selected === value ? palette.glow : palette.input }}><Text style={{ color: palette.text, fontWeight: selected === value ? '700' : '400', lineHeight: 22 }}>{label}</Text></Pressable>)}
      <PrimaryButton title={retry ? 'Retry saved outcome' : 'Save outcome'} busy={busy} disabled={busy || readOnly || !active || selected === estimateOutcome(job) && !retry} onPress={save} />
      <SecondaryButton title="Keep current outcome" disabled={busy} onPress={() => setOpen(false)} />
    </View>}
  </Card>;
}
