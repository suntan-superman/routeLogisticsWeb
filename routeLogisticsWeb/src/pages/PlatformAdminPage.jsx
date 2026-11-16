import SelectControl from '../components/SelectControl';
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import toast from 'react-hot-toast';
import { sendEmailVerification } from 'firebase/auth';
import { useAuth } from '../contexts/AuthContext';
import { callWorkspace } from '../services/workspaceApi';
import { auth } from '../services/firebase';
import { usePrincipalQuery } from '../hooks/usePrincipalQuery';
import { workspaceAccessError } from '../services/workspaceQueryPolicy';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import { CONTENT_TYPES, CONTENT_STATUSES, contentPath, contentSlug, contentSnapshot, normaliseContent, readableDate } from '../utils/platformContent';
import { PlatformContentArticle } from '../components/PlatformContentView';

const emptyDashboard = { counts: {}, recentAudit: [] };
const inputClass = 'mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-200';
const primaryActionClass = 'rounded-lg bg-primary-700 px-4 py-2 font-medium text-white transition-colors hover:bg-primary-800 focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-2 disabled:opacity-50';

export default function PlatformAdminPage() {
  const { currentUser, loading, refreshSession } = useAuth();
  const uid = currentUser?.uid || '', verified = currentUser?.emailVerified === true;
  const accessQuery = usePrincipalQuery('rl-platform-access', uid, ['status'], () => callWorkspace('rlPlatformCms', { action: 'status' }), { enabled: verified && !loading, intervalMs: 60_000, current: value => auth.currentUser?.uid === value && auth.currentUser?.emailVerified === true });
  const access = { uid, authorized: accessQuery.data?.authorized === true, error: accessQuery.error?.message || 'This account does not have platform administration access. Company ownership and team roles do not grant this permission.' };
  const checking = loading || !!uid && verified && accessQuery.isPending && !accessQuery.error;
  return <div className="min-h-screen bg-gray-50 text-gray-900">
    <Helmet><title>Platform administration | Route Logistics</title><meta name="robots" content="noindex,nofollow" /></Helmet>
    <header className="border-b border-gray-200 bg-white"><div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-5 sm:px-8"><Link to="/" className="text-lg font-bold text-primary-700">Route Logistics</Link><span className="text-sm text-gray-600">Platform administration</span></div></header>
    <main className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
      {checking ? <p role="status" className="py-12">Checking platform access…</p> : !uid ? <section className="mx-auto max-w-xl space-y-5 rounded-2xl border border-gray-200 bg-white p-7"><h1 className="text-2xl font-bold">Platform administration</h1><p>Sign in with an account explicitly authorized to manage Route Logistics platform content.</p><Link className={primaryActionClass + ' inline-block'} to="/login?next=%2Fplatform-admin">Sign in</Link></section> : !verified ? <PlatformEmailVerification key={uid} user={currentUser} refreshSession={refreshSession} /> : access.authorized && access.uid === uid ? <PlatformAdminWorkspace key={uid} accountEmail={currentUser.email} /> : <section className="mx-auto max-w-xl space-y-5 rounded-2xl border border-gray-200 bg-white p-7"><h1 className="text-2xl font-bold">Platform access required</h1><p role="alert">{access.error}</p><p className="text-sm text-gray-600">Signed in as {currentUser.email || 'your account'}. Contact the platform operator if this account should be authorized.</p><button type="button" className="btn-secondary" onClick={() => accessQuery.refetch()}>Check access again</button><Link to="/" className="ml-4 text-primary-700 underline">Return to Route Logistics</Link></section>}
    </main>
  </div>;
}

function PlatformEmailVerification({ user, refreshSession }) {
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  const verify = async action => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const current = auth.currentUser;
      if (!current || current.uid !== user.uid) throw new Error('Your sign-in changed. Refresh this page before continuing.');
      if (action === 'send') {
        await sendEmailVerification(current); setMessage('Verification email sent. Open its link, then return here and check verification.');
      } else {
        await current.reload(); await current.getIdToken(true); await refreshSession();
        if (!current.emailVerified) setMessage('Email verification is not confirmed yet. Open the email link, then check again.');
      }
    } catch (failure) { setError(failure.message || 'Email verification could not be completed. Please try again.'); }
    finally { setBusy(false); }
  };
  return <section className="mx-auto max-w-xl space-y-5 rounded-2xl border border-gray-200 bg-white p-7"><h1 className="text-2xl font-bold">Verify your email first</h1><p>Verify {user.email || 'your sign-in email'} before platform access can be checked. Verification does not grant platform administration.</p>{error && <p role="alert" className="text-red-700">{error}</p>}{message && <p role="status">{message}</p>}<div className="flex flex-wrap gap-3"><button type="button" className={primaryActionClass} disabled={busy} onClick={() => verify('send')}>Send verification email</button><button type="button" className="btn-secondary" disabled={busy} onClick={() => verify('check')}>Check verification</button></div></section>;
}

function PlatformAdminWorkspace({ accountEmail }) {
  const uid = auth.currentUser?.uid || '';
  const [dashboard, setDashboard] = useState(emptyDashboard), [items, setItems] = useState([]), [type, setType] = useState('faq'), [filterStatus, setFilterStatus] = useState('');
  const [draft, setDraft] = useState(() => normaliseContent()), [saved, setSaved] = useState(() => contentSnapshot(normaliseContent())), [record, setRecord] = useState(null), [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [preview, setPreview] = useState(false), [imagePreview, setImagePreview] = useState('');
  const [nextCursor, setNextCursor] = useState(null), [listAttempt, setListAttempt] = useState(0), [pageCount, setPageCount] = useState(1);
  const alive = useRef(false), requestVersion = useRef(0), saving = useRef(false);
  const dirty = contentSnapshot(draft) !== saved;
  const { confirmDiscard } = useUnsavedChanges(dirty, { message: 'You have unsaved platform content. Leave without saving your changes?', scope: 'platform-content' });
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const contentQuery = usePrincipalQuery('rl-platform-content', uid, [type, filterStatus, listAttempt, pageCount], async () => {
    const overview = await callWorkspace('rlPlatformCms', { action: 'dashboard' });
    const rows = []; let cursor = null;
    for (let page = 0; page < pageCount; page++) {
      const list = await callWorkspace('rlPlatformCms', { action: 'list', type, ...(filterStatus ? { status: filterStatus } : {}), ...(cursor ? { cursor } : {}) });
      rows.push(...(list.items || []).filter(row => !rows.some(old => old.id === row.id))); cursor = list.nextCursor || null;
      if (!cursor) break;
    }
    return { overview, items: rows, nextCursor: cursor };
  }, { intervalMs: 60_000, current: value => auth.currentUser?.uid === value && auth.currentUser?.emailVerified === true });
  useEffect(() => { if (contentQuery.data) { setDashboard(contentQuery.data.overview); setItems(contentQuery.data.items); setNextCursor(contentQuery.data.nextCursor); setLoading(false); } }, [contentQuery.data]);
  useEffect(() => { if (contentQuery.error) { setError(contentQuery.error.message); setLoading(false); } }, [contentQuery.error]);
  const update = (field, value) => setDraft(previous => ({ ...previous, [field]: value }));
  const updateSeo = (field, value) => setDraft(previous => ({ ...previous, seo: { ...previous.seo, [field]: value } }));
  const resetEditor = item => {
    const value = normaliseContent(item, item?.type || type);
    setDraft(value); setSaved(contentSnapshot(value)); setRecord(item || null); setHistory([]); setPreview(false); setImagePreview(''); setError(''); setMessage('');
  };
  const chooseType = async value => {
    if (value === type || busy || !(await confirmDiscard())) return;
    setType(value); setPageCount(1); setLoading(true); resetEditor({ type: value });
  };
  const newContent = async () => { if (!busy && await confirmDiscard()) resetEditor({ type }); };
  const selectContent = async id => {
    if (busy || !(await confirmDiscard())) return;
    const version = ++requestVersion.current; setBusy(true); setError('');
    try {
      const [value, audit] = await Promise.all([callWorkspace('rlPlatformCms', { action: 'get', id }), callWorkspace('rlPlatformCms', { action: 'history', id })]);
      if (!alive.current || version !== requestVersion.current) return;
      resetEditor(value.item); setHistory(audit.items || []);
      if (value.item.imageId) {
        const image = await callWorkspace('rlPlatformContentImage', { action: 'get', imageId: value.item.imageId });
        if (alive.current && version === requestVersion.current) setImagePreview(`data:${image.image.contentType};base64,${image.image.data}`);
      }
    } catch (failure) { if (alive.current && version === requestVersion.current) setError(failure.message || 'This content could not be opened.'); }
    finally { if (alive.current && version === requestVersion.current) setBusy(false); }
  };
  const loadMore = () => { if (nextCursor && !busy && !contentQuery.isFetching) setPageCount(count => count + 1); };
  const save = async event => {
    event.preventDefault();
    if (!dirty || busy || saving.current) return;
    saving.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const value = await callWorkspace('rlPlatformCms', { action: 'save', content: draft, expectedRevision: record?.revision || 0 });
      if (!alive.current) return;
      const clean = normaliseContent(value.item, type); setDraft(clean); setSaved(contentSnapshot(clean)); setRecord(value.item);
      const notice = value.item.status === 'published' ? 'Content published successfully.' : value.item.status === 'archived' ? 'Content archived. It is no longer available publicly.' : 'Draft saved successfully.';
      setMessage(notice); toast.success(notice); setListAttempt(value => value + 1);
      try {
        const audit = await callWorkspace('rlPlatformCms', { action: 'history', id: value.item.id });
        if (alive.current) setHistory(audit.items || []);
      } catch { if (alive.current) setMessage(`${notice} Audit history could not be refreshed; reopen the content to try again.`); }
    } catch (failure) { if (alive.current) { const notice = failure.message || 'Content could not be saved. Your changes are available to retry.'; setError(notice); toast.error(notice); } }
    finally { saving.current = false; if (alive.current) setBusy(false); }
  };
  const uploadImage = async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!record?.id) { setError('Save the draft before adding an image.'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) { setError('Choose a JPEG, PNG or WebP image no larger than 2 MB.'); return; }
    if (!draft.imageAlt.trim()) { setError('Add a meaningful image description before uploading the image.'); return; }
    if (busy || saving.current) return;
    setBusy(true); setError('');
    try {
      const data = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('The image could not be read. Please choose it again.')); reader.readAsDataURL(file); });
      const result = await callWorkspace('rlPlatformContentImage', { action: 'upload', contentId: record.id, contentType: file.type, data, alt: draft.imageAlt });
      if (!alive.current) return;
      update('imageId', result.image.id); setImagePreview(`data:${file.type};base64,${data}`); setMessage('Image uploaded privately. Save content to attach it; publication follows the content status.');
    } catch (failure) { if (alive.current) setError(failure.message || 'Image upload failed. Your content is still available.'); }
    finally { if (alive.current) setBusy(false); }
  };
  const missingPublicationEvidence = draft.status === 'published' && draft.type !== 'faq' && (!draft.authenticity.confirmed || !draft.authenticity.reference.trim() || !draft.companyName.trim() || draft.type === 'testimonial' && !draft.attributionName.trim());
  const canSave = dirty && !busy && draft.title.trim() && draft.slug.trim().length >= 2 && (draft.status !== 'published' || !!draft.body.trim()) && (!draft.imageId || !!draft.imageAlt.trim()) && !missingPublicationEvidence && !(draft.isSynthetic && draft.status === 'published');
  if (workspaceAccessError(contentQuery.error)) return <p role="alert">Platform access could not be confirmed. Recheck your platform access before continuing.</p>;
  return <div className="space-y-7">
    <header className="flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-3xl font-bold">Platform content</h1><p className="mt-2 text-gray-600">Manage published website content. Platform access is independent of company roles.</p></div><p className="break-all text-sm text-gray-600">{accountEmail}</p></header>
    <section aria-label="Content dashboard" className="grid gap-4 sm:grid-cols-3">{Object.entries(CONTENT_TYPES).map(([key, category]) => <div key={key} className="rounded-xl border border-gray-200 bg-white p-5"><h2 className="font-semibold">{category.label}</h2><dl className="mt-3 flex flex-wrap gap-4 text-sm">{CONTENT_STATUSES.map(status => <div key={status}><dt className="capitalize text-gray-500">{status}</dt><dd className="mt-1 text-xl font-semibold">{dashboard.counts?.[key]?.[status] || 0}</dd></div>)}</dl></div>)}</section>
    {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</p>}{message && <p role="status" className="rounded-lg border border-green-200 bg-green-50 p-4 text-green-900">{message}</p>}
    <nav aria-label="Content type" className="flex flex-wrap gap-2">{Object.entries(CONTENT_TYPES).map(([key, category]) => <button type="button" key={key} aria-pressed={key === type} disabled={busy} className={key === type ? primaryActionClass : 'btn-secondary'} onClick={() => chooseType(key)}>{category.label}</button>)}</nav>
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(15rem,21rem)_minmax(0,1fr)]">
      <aside className="min-w-0 space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">{CONTENT_TYPES[type].label}</h2><button type="button" disabled={busy} className="text-sm font-semibold text-primary-700" onClick={newContent}>New {CONTENT_TYPES[type].singular.toLowerCase()}</button></div>
        <label className="block text-sm font-medium">Filter by status<SelectControl className={inputClass} value={filterStatus} disabled={busy} onChange={event => { setFilterStatus(event.target.value); setLoading(true); }}><option value="">All statuses</option>{CONTENT_STATUSES.map(status => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</SelectControl></label>
        {loading ? <p role="status" className="text-sm text-gray-600">Loading content…</p> : !items.length ? <p className="text-sm leading-relaxed text-gray-600">No {CONTENT_TYPES[type].label.toLowerCase()} match this view. Create a draft to get started.</p> : <ul className="space-y-2">{items.map(item => <li key={item.id}><button type="button" disabled={busy} aria-current={record?.id === item.id ? 'true' : undefined} className={`w-full rounded-lg border p-3 text-left ${record?.id === item.id ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'}`} onClick={() => selectContent(item.id)}><span className="block break-words font-medium">{item.title}</span><span className="mt-1 block text-xs capitalize text-gray-600">{item.status} · Updated {readableDate(item.updatedAt) || 'recently'}</span></button></li>)}</ul>}
        {nextCursor && <button type="button" className="btn-secondary w-full" disabled={busy} onClick={loadMore}>Load more content</button>}
        <button type="button" className="text-sm text-primary-700 underline" disabled={busy} onClick={() => { setLoading(true); setListAttempt(value => value + 1); }}>Refresh content list</button>
        <p className="border-t pt-4 text-xs leading-relaxed text-gray-500">Public testimonials and success stories require real experience and documented permission. No sample content is published automatically.</p>
      </aside>
      <section className="min-w-0 space-y-6">
        <form onSubmit={save} aria-label="Platform content editor" className="space-y-6 rounded-xl border border-gray-200 bg-white p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-xl font-semibold">{record?.id ? `Edit ${CONTENT_TYPES[type].singular.toLowerCase()}` : `New ${CONTENT_TYPES[type].singular.toLowerCase()}`}</h2><p className="mt-1 text-sm text-gray-500">{record?.id ? `Revision ${record.revision}` : 'Unsaved draft'}{dirty ? ' · Unsaved changes' : ''}</p></div><button type="button" className="btn-secondary" disabled={busy} onClick={() => setPreview(value => !value)}>{preview ? 'Hide preview' : 'Preview content'}</button></div>
          <fieldset disabled={busy} className="space-y-5">
            <label className="block text-sm font-medium">{type === 'faq' ? 'Question' : 'Title'}<input className={inputClass} aria-label="Content title" required maxLength={160} value={draft.title} onChange={event => update('title', event.target.value)} /></label>
            <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto]"><label className="block text-sm font-medium">URL slug<input className={inputClass} required minLength={2} maxLength={100} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={draft.slug} onChange={event => update('slug', event.target.value)} aria-describedby="cms-slug-help" /></label><button type="button" className="btn-secondary self-end" disabled={!draft.title.trim()} onClick={() => update('slug', contentSlug(draft.title))}>Use title for slug</button></div>
            <p id="cms-slug-help" className="-mt-2 break-all text-xs text-gray-500">Public path: {contentPath(type, draft.slug || 'your-page')}</p>
            <label className="block text-sm font-medium">Summary<textarea className={inputClass} rows={3} maxLength={600} value={draft.summary} onChange={event => update('summary', event.target.value)} /></label>
            <label className="block text-sm font-medium">{type === 'faq' ? 'Answer' : type === 'testimonial' ? 'Customer quotation' : 'Story'}<textarea className={inputClass} required={draft.status === 'published'} rows={10} maxLength={30000} value={draft.body} onChange={event => update('body', event.target.value)} aria-describedby="cms-body-help" /></label>
            <p id="cms-body-help" className="text-xs text-gray-500">Plain text. Separate paragraphs with a blank line. HTML is displayed as text.</p>
            {type !== 'faq' && <div className="grid gap-5 sm:grid-cols-2"><label className="block text-sm font-medium">Customer name<input className={inputClass} maxLength={120} value={draft.attributionName} onChange={event => update('attributionName', event.target.value)} /></label><label className="block text-sm font-medium">Role or title<input className={inputClass} maxLength={120} value={draft.attributionRole} onChange={event => update('attributionRole', event.target.value)} /></label><label className="block text-sm font-medium sm:col-span-2">Company name<input className={inputClass} maxLength={160} value={draft.companyName} onChange={event => update('companyName', event.target.value)} /></label></div>}
            <section aria-label="Content image" className="space-y-4 rounded-lg border border-gray-200 p-4"><h3 className="font-semibold">Image</h3><label className="block text-sm font-medium">Image description (alt text)<input className={inputClass} maxLength={240} value={draft.imageAlt} onChange={event => update('imageAlt', event.target.value)} /></label><label className="block text-sm font-medium">Upload image<input type="file" className="mt-2 block w-full text-sm" accept="image/jpeg,image/png,image/webp" disabled={!record?.id || busy} onChange={uploadImage} /></label><p className="text-xs text-gray-500">JPEG, PNG or WebP, up to 2 MB. Save a draft first. Add an image description before choosing the file. Uploaded images remain private until attached to published content.</p>{draft.imageId && <div className="space-y-3">{imagePreview && <img alt={draft.imageAlt || 'Content image preview'} src={imagePreview} className="max-h-48 max-w-full rounded-lg object-contain" />}<button type="button" className="text-sm font-medium text-red-700 underline" onClick={() => { update('imageId', ''); setImagePreview(''); }}>Remove image from content</button></div>}</section>
            <details className="rounded-lg border border-gray-200 p-4"><summary className="cursor-pointer font-semibold">Search and sharing metadata</summary><div className="mt-5 space-y-5"><label className="block text-sm font-medium">SEO title<input className={inputClass} maxLength={70} value={draft.seo.title} onChange={event => updateSeo('title', event.target.value)} /></label><label className="block text-sm font-medium">Meta description<textarea className={inputClass} rows={3} maxLength={180} value={draft.seo.description} onChange={event => updateSeo('description', event.target.value)} /></label><label className="block text-sm font-medium">Canonical URL<input type="url" className={inputClass} value={draft.seo.canonicalUrl} placeholder={`https://route-logistics.com${contentPath(type, draft.slug || 'your-page')}`} onChange={event => updateSeo('canonicalUrl', event.target.value)} /></label><p className="text-xs text-gray-500">Leave blank to use this page's Route Logistics URL. Draft and unpublished content stays excluded from search indexing.</p><label className="block text-sm font-medium">Open Graph title<input className={inputClass} maxLength={100} value={draft.seo.ogTitle} onChange={event => updateSeo('ogTitle', event.target.value)} /></label><label className="block text-sm font-medium">Open Graph description<textarea className={inputClass} rows={3} maxLength={220} value={draft.seo.ogDescription} onChange={event => updateSeo('ogDescription', event.target.value)} /></label></div></details>
            {type !== 'faq' && <section className="space-y-4 rounded-lg border border-amber-200 bg-amber-50 p-4"><h3 className="font-semibold">Authenticity and publication permission</h3><p className="text-sm leading-relaxed">Publish only a real customer experience with permission. Do not publish fictional customers, invented quotations or unverified results.</p><label className="flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={draft.authenticity.confirmed} onChange={event => setDraft(previous => ({ ...previous, authenticity: { ...previous.authenticity, confirmed: event.target.checked } }))} /><span>I confirm this is authentic and permission to publish has been documented.</span></label><label className="block text-sm font-medium">Permission and evidence reference<input className={inputClass} maxLength={500} value={draft.authenticity.reference} onChange={event => setDraft(previous => ({ ...previous, authenticity: { ...previous.authenticity, reference: event.target.value } }))} /></label><p className="text-xs text-gray-600">This reference stays private. Include a record reference, not confidential customer information.</p></section>}
            <label className="block max-w-xs text-sm font-medium">Publication status<SelectControl className={inputClass} value={draft.status} onChange={event => update('status', event.target.value)}>{CONTENT_STATUSES.map(status => <option key={status} value={status} disabled={draft.isSynthetic && status === 'published'}>{status[0].toUpperCase() + status.slice(1)}</option>)}</SelectControl></label>
            {draft.isSynthetic && <p className="text-sm text-amber-800">This is a synthetic acceptance fixture. It cannot be published.</p>}
            {missingPublicationEvidence && <p className="text-sm text-amber-800">Publishing requires authenticity confirmation, an evidence reference and the customer/company attribution above.</p>}
          </fieldset>
          <div className="flex flex-wrap items-center gap-4 border-t pt-5"><button type="submit" className={primaryActionClass} disabled={!canSave}>{busy ? 'Saving…' : 'Save content'}</button>{record?.status === 'published' && <a className="text-sm font-semibold text-primary-700 underline" href={contentPath(type, record.slug)} target="_blank" rel="noreferrer">View published page</a>}<p className="text-sm text-gray-500">{record?.publishedAt ? `First published ${readableDate(record.publishedAt)}` : 'Not yet published'}</p></div>
        </form>
        {preview && <section aria-label="Private content preview" className="rounded-xl border border-gray-200 bg-white p-6 sm:p-8"><PlatformContentArticle item={draft} imageUrl={imagePreview} preview /></section>}
        {record?.id && <section className="rounded-xl border border-gray-200 bg-white p-5 sm:p-7"><h2 className="text-lg font-semibold">Content audit history</h2>{history.length ? <ol className="mt-4 space-y-3">{history.map((entry, index) => <li key={entry.id || index} className="border-l-2 border-gray-200 pl-4 text-sm"><p className="font-medium">{entry.action || entry.event || 'Content updated'}{entry.status ? ` · ${entry.status}` : ''}{entry.revision ? ` · Revision ${entry.revision}` : ''}</p><p className="mt-1 text-gray-500">{readableDate(entry.createdAt || entry.at)}{entry.actorEmail ? ` · ${entry.actorEmail}` : ''}</p></li>)}</ol> : <p className="mt-3 text-sm text-gray-600">No audit entries are available yet.</p>}</section>}
      </section>
    </div>
  </div>;
}
