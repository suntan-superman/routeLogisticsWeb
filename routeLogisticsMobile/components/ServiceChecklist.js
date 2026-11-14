import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../theme/ThemeProvider';
import { callWorkspace } from '../services/workspaceApi';
import { cachedRead, queuedWork, saveServiceFormOffline, subscribeOffline } from '../services/offline';
import { Card, SectionHeader, PrimaryButton, SecondaryButton, FormField, InlineNotice } from './MobileUI';
const { validateAnswers } = require('../../functions/shared/serviceFormSchema');

export default function ServiceChecklist({ job, readOnly = false, onBusyChange, onDraftChange }) {
  const { permissions } = useAuth(), { palette } = useTheme();
  const [data, setData] = useState(null), [catalog, setCatalog] = useState([]), [answers, setAnswers] = useState({}), [pending, setPending] = useState(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false), [loading, setLoading] = useState(true);
  const mounted = useRef(false), sequence = useRef(0), lock = useRef(false), dirtyRef = useRef(false), currentJob = useRef(job), callbacks = useRef({ onBusyChange, onDraftChange }), formRef = useRef(null);
  currentJob.current = job; callbacks.current = { onBusyChange, onDraftChange };
  const load = useCallback(async () => {
    const id = currentJob.current?.id, ticket = ++sequence.current;
    try {
      const [result, rows] = await Promise.all([cachedRead(`service-form:${id}`, () => callWorkspace('rlServiceForms', { action: 'read', jobId: id })), queuedWork()]);
      if (!mounted.current || ticket !== sequence.current) return;
      const saved = rows.find(row => row.kind === 'service-form' && row.jobId === id && !['synced','discarded'].includes(row.state));
      setPending(saved || null);
      if (dirtyRef.current && formRef.current?.assignmentVersion !== result.form?.assignmentVersion) { setError('The assigned template changed online. Your draft is retained. Save it for review or discard it explicitly before refreshing.'); return; }
      setData(result); formRef.current = result.form;
      if (!dirtyRef.current) setAnswers(saved?.record.answers || result.form?.answers || {});
      setError('');
    } catch (failure) {
      if (mounted.current && ticket === sequence.current) { if (['permission-denied','unauthenticated'].includes(String(failure.code || '').split('/').pop())) setData(null); setError(failure.message || 'Service form could not be loaded. Open it while connected first.'); }
    } finally { if (mounted.current && ticket === sequence.current) setLoading(false); }
  }, []);
  useEffect(() => {
    mounted.current = true; setData(null); setAnswers({}); setPending(null); setError(''); setNotice(''); setDirty(false); dirtyRef.current = false; formRef.current = null; setLoading(true); setCatalog([]);
    load(); const unsubscribe = subscribeOffline(load);
    if (permissions.canManage) cachedRead('service-template-catalog', () => callWorkspace('rlServiceForms', { action: 'catalog' })).then(result => { if (mounted.current) setCatalog(result.templates || []); }).catch(() => {});
    return () => { mounted.current = false; sequence.current++; unsubscribe(); callbacks.current.onBusyChange?.(false); callbacks.current.onDraftChange?.(false); };
  }, [job.id, load, permissions.canManage]);
  useEffect(() => { callbacks.current.onDraftChange?.(dirty); }, [dirty]);
  const change = (field, value) => { if (lock.current) return; setAnswers(previous => ({ ...previous, [field.id]: value })); dirtyRef.current = true; setDirty(true); setNotice(''); };
  const perform = async action => {
    if (lock.current) return;
    lock.current = true; setBusy(true); callbacks.current.onBusyChange?.(true); setError(''); setNotice('');
    try { await action(); } catch (failure) { if (mounted.current) setError(failure.message || 'Service form could not be saved. Your draft is retained.'); }
    finally { lock.current = false; if (mounted.current) { setBusy(false); callbacks.current.onBusyChange?.(false); } }
  };
  const save = status => perform(async () => {
    const form = formRef.current;
    if (!form || !data?.enabled || pending || readOnly || ['completed','cancelled','canceled'].includes(job.status)) throw new Error('This form is read-only or has saved work requiring synchronization.');
    const numeric = { ...answers };
    for (const field of form.template.fields) if (field.type === 'number' && numeric[field.id] !== '' && numeric[field.id] != null) numeric[field.id] = Number(numeric[field.id]);
    const clean = validateAnswers(form.template, numeric, { complete: status === 'completed' });
    await saveServiceFormOffline(job, { templateId: form.template.id, templateVersion: form.template.version, assignmentVersion: form.assignmentVersion, expectedVersion: form.responseVersion, answers: clean, status });
    if (!mounted.current) return;
    dirtyRef.current = false; setDirty(false); setNotice('Service report saved on this device. Synchronization verifies your current assignment and template version.'); await load();
  });
  const assign = template => perform(async () => {
    if (dirtyRef.current || pending) throw new Error('Save or explicitly discard current service answers before changing templates.');
    await callWorkspace('rlServiceForms', { action: 'assign', jobId: job.id, templateId: template.id, templateVersion: template.version, expectedVersion: data?.form?.assignmentVersion || 0 }); await load();
  });
  const form = data?.form, editable = !!data?.enabled && !!form && !readOnly && !pending && !['completed','cancelled','canceled'].includes(job.status);
  const choice = (field, value, checked, label = value) => <Pressable key={value} accessibilityRole={field.type === 'select' ? 'radio' : 'checkbox'} accessibilityLabel={label} accessibilityState={{ checked, disabled: !editable || busy }} disabled={!editable || busy}
    onPress={() => change(field, field.type === 'select' ? value : checked ? (answers[field.id] || []).filter(item => item !== value) : [...(answers[field.id] || []), value])}
    style={{ minHeight: 48, flexDirection: 'row', gap: 10, paddingVertical: 10, alignItems: 'center' }}><Text style={{ color: palette.accent }}>{checked ? '☑' : '☐'}</Text><Text style={{ flex: 1, color: palette.text, fontSize: 15, lineHeight: 23 }}>{label}</Text></Pressable>;
  return <Card><SectionHeader title="Service checklist" subtitle="Versioned service observations. Chemical application records remain separate." />
    {loading && <Text style={{ color: palette.secondary }}>Loading service template…</Text>}{!!error && <InlineNotice tone="error" message={error} />}{!!notice && <InlineNotice tone="success" message={notice} />}
    {data && !data.enabled && <InlineNotice message="Service forms are not enabled yet. Your existing job workflow and chemical records remain available." />}
    {data && !form && <Text style={{ color: palette.secondary, lineHeight: 22 }}>No service template is attached. A manager can select a template for this job.</Text>}
    {form && <><SectionHeader title={form.template.name} subtitle={`${form.template.industry} · template v${form.template.version} · report revision ${form.responseVersion} · service date ${form.serviceDate || 'not set'}`} />
      {!!form.template.description && <Text style={{ color: palette.secondary, lineHeight: 22 }}>{form.template.description}</Text>}
      {form.template.fields.map(field => <View key={field.id} style={{ gap: 5 }}>
        <Text style={{ color: palette.text, fontSize: 15, lineHeight: 23, fontWeight: '600' }}>{field.label}{field.required ? ' *' : ''}{field.unit ? ` (${field.unit})` : ''}</Text>
        {['text','notes','number'].includes(field.type) && <FormField label={field.label} value={String(answers[field.id] ?? '')} onChangeText={value => change(field, value)} editable={editable && !busy} multiline={field.type !== 'number'} keyboardType={field.type === 'number' ? 'decimal-pad' : 'default'} maxLength={field.maxLength || 100} />}
        {['select','checklist'].includes(field.type) && field.options.map(value => choice(field, value, field.type === 'select' ? answers[field.id] === value : (answers[field.id] || []).includes(value)))}
        {field.type === 'photos' && <><Text style={{ color: palette.secondary, lineHeight: 21 }}>Choose existing uploaded job photos (up to {field.maxPhotos}). Upload in Visit photos, then refresh this checklist. Images remain private.</Text>
          {(data.photos || []).map((photo,index) => choice(field, photo.id, (answers[field.id] || []).includes(photo.id), photo.caption || `Job photo ${index + 1}`))}{!(data.photos || []).length && <Text style={{ color: palette.secondary }}>No uploaded photos available yet.</Text>}</>}
      </View>)}
      {pending && <InlineNotice tone={['failed','conflict'].includes(pending.state) ? 'error' : 'info'} message={`Service report ${pending.state}. ${pending.error || 'Open Saved work to review or synchronize this revision.'}`} />}
      {editable && <><SecondaryButton title="Save service draft" disabled={busy} onPress={() => save('draft')} /><PrimaryButton title="Finalize service report" disabled={busy} onPress={() => save('completed')} /></>}
      {dirty && <SecondaryButton title="Discard unsaved service answers" disabled={busy} onPress={() => { dirtyRef.current = false; setDirty(false); setAnswers(form.answers || {}); load(); }} />}
    </>}
    {!!data?.enabled && permissions.canManage && !readOnly && !form && catalog.map(template => <SecondaryButton key={`${template.id}:${template.version}`} title={`Use ${template.name} v${template.version}${template.status === 'foundation' ? ' (foundation)' : ''}`} disabled={busy} onPress={() => assign(template)} />)}
    <SecondaryButton title="Refresh service checklist" disabled={busy || loading} onPress={load} />
    {!!data?.reports?.length && <View style={{ gap: 8 }}><SectionHeader title="Saved service reports" />{data.reports.slice(0, 5).map(report => <View key={report.id} style={{ gap: 4 }}><Text style={{ color: palette.text, fontWeight: '600' }}>{report.report.templateName} v{report.report.templateVersion} · revision {report.responseVersion} · {report.status}</Text><Text style={{ color: palette.secondary }}>{new Date(report.createdAt).toLocaleString()}</Text>{report.report.fields.filter(field => field.value != null).map(field => <Text key={field.id} style={{ color: palette.secondary, lineHeight: 21 }}>{field.label}: {Array.isArray(field.value) ? field.type === 'photos' ? `${field.value.length} private photos` : field.value.join(', ') : String(field.value)}{field.unit ? ` ${field.unit}` : ''}</Text>)}</View>)}</View>}
  </Card>;
}
