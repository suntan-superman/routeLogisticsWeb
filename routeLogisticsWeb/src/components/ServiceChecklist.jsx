import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getClaims } from '../services/tenancy';
import { callWorkspace } from '../services/workspaceApi';
import { serviceAnswers, serviceReportText } from '../utils/serviceForms';
import ServiceTemplateEditor from './ServiceTemplateEditor';
export default function ServiceChecklist({ job, readOnly = false }) {
  const { currentUser, company, role, can } = useAuth(), claims = getClaims();
  const draftKey = `rl-service-form-v1:${currentUser.uid}:${company?.id || 'solo'}:${role}:${claims?.membershipId || ''}:${job.id}`;
  const [data, setData] = useState(null), [templates, setTemplates] = useState([]), [answers, setAnswers] = useState({}), [selectedTemplate, setSelectedTemplate] = useState(''), [editing, setEditing] = useState(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false), [dirty, setDirty] = useState(false);
  const [previousDraft, setPreviousDraft] = useState(null);
  const live = useRef(false), lock = useRef(false), attempt = useRef(null), dirtyRef = useRef(false), latest = useRef(null), request = useRef(0);
  const invalidate = useCallback(() => { live.current = false; request.current++; }, []);
  const load = useCallback(async () => {
    const ticket = ++request.current;
    try {
      const result = await callWorkspace('rlServiceForms', { action: 'read', jobId: job.id });
      if (!live.current || ticket !== request.current) return;
      latest.current = result;
      if (dirtyRef.current) { if (data?.form?.assignmentVersion !== result.form?.assignmentVersion) setError('The assigned template changed. Your browser draft is retained for review.'); return; }
      setData(result); setError('');
      let saved = null; try { saved = JSON.parse(localStorage.getItem(draftKey) || 'null'); setPreviousDraft(JSON.parse(localStorage.getItem(`${draftKey}:previous-current`) || 'null')); } catch { /* Invalid local draft cannot replace authorized server answers. */ }
      if (saved && saved.assignmentVersion === result.form?.assignmentVersion && saved.templateId === result.form?.template.id && saved.templateVersion === result.form?.template.version) { setAnswers(saved.answers || {}); attempt.current = saved.attempt || null; setDirty(true); dirtyRef.current = true; setNotice('Your unsaved browser draft has been restored.'); }
      else { setAnswers(result.form?.answers || {}); if (saved) { localStorage.setItem(`${draftKey}:previous:${saved.assignmentVersion}`,JSON.stringify(saved)); localStorage.setItem(`${draftKey}:previous-current`,JSON.stringify(saved)); setPreviousDraft(saved); setNotice('An older template draft has been preserved separately in this browser. Review those answers before entering the new template.'); } }
    } catch (failure) { if (live.current && ticket === request.current) { if (['permission-denied','unauthenticated'].includes(String(failure.code || '').split('/').pop())) { setData(null); setPreviousDraft(null); } setError(failure.message || 'Service checklist could not be loaded.'); } }
  }, [job.id, draftKey, data?.form?.assignmentVersion]);
  useEffect(() => {
    live.current = true; dirtyRef.current = false; attempt.current = null; setDirty(false); setData(null); setAnswers({}); setEditing(null); setPreviousDraft(null); load();
    if (can('jobs.schedule')) callWorkspace('rlServiceForms', { action: 'catalog' }).then(result => { if (live.current) setTemplates(result.templates || []); }).catch(() => {});
    return invalidate;
    // A job/scope change owns this form. Poll/response revisions must not reset drafts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, draftKey, invalidate]);
  useEffect(() => { const leave = event => { if (dirtyRef.current) { event.preventDefault(); event.returnValue = ''; } }; window.addEventListener('beforeunload', leave); return () => window.removeEventListener('beforeunload', leave); }, []);
  const change = (field, value) => {
    if (lock.current || attempt.current) return;
    const next = { ...answers, [field.id]: value }; setAnswers(next); setDirty(true); dirtyRef.current = true; setNotice('');
    try { localStorage.setItem(draftKey, JSON.stringify({ assignmentVersion: data.form.assignmentVersion, templateId: data.form.template.id, templateVersion: data.form.template.version, template: data.form.template, answers: next })); } catch { setError('Browser storage is unavailable. Keep this page open until the service report is saved.'); }
  };
  const perform = async action => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { if (!navigator.onLine) throw new Error('Reconnect to save this service report. Your browser draft is retained.'); await action(); }
    catch (failure) { if (live.current) setError(failure.message || 'The service report was not saved. Your draft is retained.'); }
    finally { lock.current = false; if (live.current) setBusy(false); }
  };
  const save = status => perform(async () => {
    const form = data.form;
    const payload = attempt.current || { action: 'save', jobId: job.id, operationId: crypto.randomUUID(), templateId: form.template.id, templateVersion: form.template.version, assignmentVersion: form.assignmentVersion, expectedVersion: form.responseVersion, status, answers: serviceAnswers(form.template, answers, status === 'completed') };
    localStorage.setItem(draftKey,JSON.stringify({assignmentVersion:form.assignmentVersion,templateId:form.template.id,templateVersion:form.template.version,template:form.template,answers,attempt:payload}));
    attempt.current = payload;
    const result = await callWorkspace('rlServiceForms', payload);
    if (!live.current) return;
    if (result.status === 'conflict') { attempt.current = null; latest.current = { ...data, form: result.server }; throw new Error('This service report changed online. Your draft is retained. Review the latest report before retrying.'); }
    attempt.current = null; dirtyRef.current = false; setDirty(false); localStorage.removeItem(draftKey); setNotice('Service report saved. This does not change the job status.'); await load();
  });
  const assign = () => perform(async () => {
    if (dirtyRef.current) throw new Error('Save or discard your current service answers before changing templates.');
    const template = templates.find(row => `${row.id}:${row.version}` === selectedTemplate); if (!template) throw new Error('Choose a service template.');
    await callWorkspace('rlServiceForms', { action: 'assign', jobId: job.id, templateId: template.id, templateVersion: template.version, expectedVersion: data.form?.assignmentVersion || 0 }); await load();
  });
  const editable = !!data?.enabled && !!data.form && !readOnly && !['completed','cancelled','canceled'].includes(job.status), manager = can('jobs.schedule');
  const download = row => { const url = URL.createObjectURL(new Blob([serviceReportText(row)], { type: 'text/plain;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = `service-report-${job.id}-${row.responseVersion}.txt`; link.click(); URL.revokeObjectURL(url); };
  return <section className="space-y-4 rounded border bg-white p-4" aria-label="Service checklist"><h3 className="text-lg font-semibold">Service checklist</h3><p className="text-sm text-gray-600">Versioned service observations. Chemical application records remain separate.</p>
    {error && <p role="alert" className="text-red-700">{error}</p>}{notice && <p role="status">{notice}</p>}{!data && !error && <p role="status">Loading service template…</p>}
    {previousDraft && <details className="rounded border bg-amber-50 p-3"><summary className="min-h-11 cursor-pointer font-medium">Review retained earlier service answers</summary><p className="text-sm">{previousDraft.template?.name || 'Earlier service template'} · template v{previousDraft.templateVersion}. These answers are retained for review and are not submitted to a different template automatically.</p>{Object.entries(previousDraft.answers || {}).map(([key,value]) => { const field=previousDraft.template?.fields?.find(row=>row.id===key); return <p className="mt-1 whitespace-pre-wrap text-sm" key={key}>{field?.label || key}: {Array.isArray(value) ? field?.type === 'photos' ? `${value.length} private photo references` : value.join(', ') : String(value)}{field?.unit ? ` ${field.unit}` : ''}</p>; })}</details>}
    {data && !data.enabled && <p>Service forms are not enabled yet.</p>}{data && !data.form && <p>No service template attached. A manager can select one for this job.</p>}
    {data?.form && <><h4 className="font-semibold">{data.form.template.name} · template v{data.form.template.version}</h4><p className="text-sm">Service date: {data.form.serviceDate || 'Not set'} · report revision {data.form.responseVersion} · {data.form.status}</p><p className="text-sm">{data.form.template.description}</p>
      {data.form.template.fields.map(field => <div key={field.id}><label className="block font-medium" htmlFor={`service-${job.id}-${field.id}`}>{field.label}{field.required ? ' *' : ''}{field.unit ? ` (${field.unit})` : ''}</label>
        {['text','notes'].includes(field.type) && <textarea id={`service-${job.id}-${field.id}`} className="input-field mt-1 w-full" value={answers[field.id] || ''} maxLength={field.maxLength} disabled={!editable || busy || !!attempt.current} onChange={event => change(field,event.target.value)} />}
        {field.type === 'number' && <input id={`service-${job.id}-${field.id}`} type="number" step="any" min={field.min} max={field.max} className="input-field mt-1" value={answers[field.id] ?? ''} disabled={!editable || busy || !!attempt.current} onChange={event => change(field,event.target.value)} />}
        {field.type === 'select' && <select id={`service-${job.id}-${field.id}`} className="input-field mt-1" value={answers[field.id] || ''} disabled={!editable || busy || !!attempt.current} onChange={event => change(field,event.target.value)}><option value="">Choose…</option>{field.options.map(option => <option key={option}>{option}</option>)}</select>}
        {['checklist','photos'].includes(field.type) && <>{field.type === 'photos' && <p className="text-sm text-gray-600">Upload photos with the existing private photo controls, then refresh. Choose up to {field.maxPhotos}.</p>}{(field.type === 'photos' ? data.photos.map((photo,index) => ({ value: photo.id,label: photo.caption || `Job photo ${index+1}` })) : field.options.map(option => ({ value: option,label: option }))).map(option => <label key={option.value} className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={(answers[field.id] || []).includes(option.value)} disabled={!editable || busy || !!attempt.current} onChange={event => change(field,event.target.checked ? [...(answers[field.id] || []),option.value] : (answers[field.id] || []).filter(value => value !== option.value))} />{option.label}</label>)}</>}
      </div>)}
      {editable && <div className="flex flex-wrap gap-3"><button className="btn-secondary" disabled={busy} onClick={() => save('draft')}>{attempt.current ? 'Retry saved attempt' : 'Save service draft'}</button>{!attempt.current && <button className="btn-primary" disabled={busy} onClick={() => save('completed')}>Finalize service report</button>}</div>}
      {dirty && <button className="min-h-11 underline" disabled={busy} onClick={() => { attempt.current = null; dirtyRef.current = false; setDirty(false); localStorage.removeItem(draftKey); setData(latest.current || data); setAnswers((latest.current || data).form?.answers || {}); setNotice('Unsaved service answers discarded.'); }}>Discard unsaved service answers</button>}
    </>}
    {data?.enabled && manager && !readOnly && !['completed','cancelled','canceled'].includes(job.status) && <div className="space-y-3 border-t pt-3"><label className="block">Service template<select className="input-field mt-1 block" value={selectedTemplate} onChange={event => setSelectedTemplate(event.target.value)}><option value="">Choose a template</option>{templates.map(template => <option key={`${template.id}:${template.version}`} value={`${template.id}:${template.version}`}>{template.name} v{template.version}{template.status === 'foundation' ? ' — foundation' : ''}</option>)}</select></label>
      <button className="btn-secondary" disabled={busy || dirty || !selectedTemplate} onClick={assign}>Assign template version</button><button className="ml-3 underline" disabled={busy || !selectedTemplate} onClick={() => setEditing(templates.find(row => `${row.id}:${row.version}` === selectedTemplate))}>Customize company template</button>
      {editing && <ServiceTemplateEditor key={`${editing.id}:${editing.version}`} starter={editing} busy={busy} onCancel={() => setEditing(null)} onPublish={template => perform(async () => { const result = await callWorkspace('rlServiceForms', { action: 'publish',template }); setTemplates(previous => [...previous.filter(row => row.id !== result.template.id),result.template]); setSelectedTemplate(`${result.template.id}:${result.template.version}`); setEditing(null); setNotice('New template version published. Assign it explicitly to a job.'); })} />}
    </div>}
    <button className="min-h-11 underline" disabled={busy} onClick={load}>Refresh service checklist</button>
    {!!data?.reports?.length && <section className="space-y-2"><h4 className="font-semibold">Service report history</h4>{data.reports.map(row => <article key={row.id} className="rounded border p-3"><p>{row.report.templateName} v{row.report.templateVersion} · revision {row.responseVersion} · {row.status}</p><p className="text-sm">{new Date(row.createdAt).toLocaleString()}</p><button className="min-h-11 underline" onClick={() => download(row)}>Download service report</button></article>)}</section>}
  </section>;
}
