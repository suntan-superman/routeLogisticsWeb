import { useEffect, useState } from 'react';
import { callWorkspace } from '../services/workspaceApi';
import { manageInquiry } from '../services/inquiryService';
import { compressImage, listJobPhotos } from '../services/photoService';
import SelectControl from './SelectControl';
import AuthorizedPhotoPreview from './AuthorizedPhotoPreview';

const tabs = ['Overview', 'Alerts', 'Photos', 'Service History', 'Material History'];
const categories = [['exterior', 'Property exterior'], ['entrance', 'Entrance or gate'], ['access', 'Access instructions'], ['equipment', 'Equipment'], ['treatment', 'Treatment area'], ['safety', 'Safety reference'], ['other', 'Other']];
const button = 'rounded-lg border border-primary-600 px-3 py-2 text-sm text-primary-700 hover:bg-primary-50 disabled:opacity-50';
const fileBase64 = blob => new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = reject; reader.readAsDataURL(blob); });

export default function PropertyProfile({ customerId, propertyId, jobId, canManage = false, onSectionChange }) {
  const [properties, setProperties] = useState([]), [selected, setSelected] = useState(propertyId || ''), [tab, setTab] = useState('Overview');
  const [overview, setOverview] = useState(null), [rows, setRows] = useState([]), [next, setNext] = useState(null), [sourcePhotos, setSourcePhotos] = useState([]);
  const [category, setCategory] = useState('exterior'), [caption, setCaption] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [status, setStatus] = useState('');
  useEffect(() => { setSelected(propertyId || ''); setProperties([]); setOverview(null); }, [customerId, propertyId]);
  useEffect(() => {
    if (!customerId || propertyId || !canManage) return;
    let live = true;
    manageInquiry('properties', { customerId }).then(result => { if (live) { setProperties(result.properties || []); setSelected(current => current || result.properties?.[0]?.id || ''); } }).catch(failure => { if (live) setError(failure.message); });
    return () => { live = false; };
  }, [customerId, propertyId, canManage]);
  const request = (action, values = {}) => callWorkspace('rlPropertyProfile', { action, customerId, propertyId: selected, ...(jobId ? { jobId } : {}), ...values });
  const load = async (target = tab, cursor = null) => {
    if (!selected) return;
    setBusy(true); setError('');
    try {
      if (target === 'Overview' || target === 'Alerts') setOverview(await request('overview'));
      else {
        const action = target === 'Photos' ? 'listPhotos' : target === 'Service History' ? 'history' : 'materials';
        const result = await request(action, cursor ? { after: cursor } : {});
        setRows(previous => cursor ? [...previous, ...(result.rows || result.photos || [])] : result.rows || result.photos || []);
        setNext(result.next || null);
        if (target === 'Photos' && canManage && jobId) setSourcePhotos(await listJobPhotos(jobId));
      }
    } catch (failure) { setError(failure.message || 'Property information is unavailable.'); }
    finally { setBusy(false); }
  };
  useEffect(() => { setRows([]); setNext(null); void load(tab); }, [selected, tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = value => { setSelected(value); setTab('Overview'); setRows([]); setOverview(null); };
  const upload = async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setBusy(true); setError(''); setStatus('Preparing photo…');
    try {
      const blob = await compressImage(file);
      if (blob.size > 2 * 1024 * 1024) throw new Error('Choose a smaller photo. The compressed limit is 2 MB.');
      setStatus('Uploading private property reference…');
      await request('upload', { operationId: crypto.randomUUID(), category, caption, base64: await fileBase64(blob) });
      setStatus('Property reference saved.'); await load('Photos');
    } catch (failure) { setError(failure.message || 'Upload failed. Select the photo and retry.'); }
    finally { setBusy(false); }
  };
  const changePhoto = async (action, id, values = {}) => { setBusy(true); setError(''); try { const result = await request(action, { photoId: id, ...values }); setStatus(action === 'approve' ? 'Reference approved.' : action === 'archive' ? result.status === 'rejected' ? 'Proposal rejected; original job evidence is preserved.' : 'Reference archived; original evidence is preserved.' : 'Photo proposed for management review.'); await load('Photos'); } catch (failure) { setError(failure.message); } finally { setBusy(false); } };
  if (!customerId) return null;
  return <section aria-label="Property Profile" className="space-y-3 rounded-xl border p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-semibold">Property Profile</h3>{properties.length > 1 && <label className="text-sm">Property <SelectControl className="ml-2 rounded border p-2" value={selected} onChange={event => choose(event.target.value)}>{properties.map(row => <option key={row.id} value={row.id}>{row.label || 'Property'} · {row.address}</option>)}</SelectControl></label>}</div>
    {!selected && <p>Choose a saved service property to see its profile. Legacy visits without a reliable property link are not assigned automatically.</p>}
    {!!selected && <><div role="tablist" aria-label="Property sections" className="flex flex-wrap gap-2">{tabs.map(name => <button key={name} type="button" role="tab" aria-selected={tab === name} className={tab === name ? 'rounded-lg bg-primary-700 px-3 py-2 text-sm text-white' : button} onClick={() => { setTab(name); onSectionChange?.(); }}>{name}{name === 'Photos' && tab === 'Photos' && rows.filter(photo => photo.status === 'proposed').length > 0 ? ` (${rows.filter(photo => photo.status === 'proposed').length} pending)` : ''}</button>)}</div>
      {busy && <p role="status">Loading property information…</p>}{error && <p role="alert" className="text-red-700">{error} <button className="underline" onClick={() => load(tab)}>Retry</button></p>}{status && <p role="status" className="text-primary-700">{status}</p>}
      {(tab === 'Overview' || tab === 'Alerts') && overview && <div className="space-y-2 text-sm">
        {tab === 'Overview' && <><p className="font-semibold">{overview.property.label || 'Service property'} · {overview.property.address}</p><p>Customer: {overview.customer.name || 'Name unavailable'}</p>{overview.property.type && <p>Property type: {overview.property.type}</p>}{overview.property.accessInstructions && <p>Access instructions (internal): {overview.property.accessInstructions}</p>}<p>Active plans: {overview.plans.length ? overview.plans.map(row => row.serviceType).join(', ') : 'None linked to this property'}</p><p>Last completed: {overview.lastCompleted ? `${overview.lastCompleted.serviceType} · ${overview.lastCompleted.date}` : 'No explicitly linked completed visit'}</p><p>Upcoming: {overview.upcoming.length ? overview.upcoming.map(row => `${row.serviceType} · ${row.date}${row.rescheduleRequired ? ' · rescheduling required' : ''}`).join('; ') : 'No linked appointments'}</p>{overview.historyLimited && <p>Recent overview is bounded. Open Service History for older linked visits.</p>}</>}
        <h4 className="font-semibold">Important and critical alerts</h4>{overview.alerts.filter(row => ['important', 'critical'].includes(row.severity)).map(row => <p key={row.id} className="rounded border p-2">{row.severity === 'critical' ? '⚠ ' : ''}{row.title}: {row.description}</p>)}{!overview.alerts.some(row => ['important', 'critical'].includes(row.severity)) && <p>No active important or critical property alerts.</p>}
      </div>}
      {tab === 'Photos' && <div className="space-y-5 text-sm">
        {canManage && <div className="flex flex-wrap gap-2"><SelectControl aria-label="Reference category" value={category} onChange={event => setCategory(event.target.value)} className="max-w-full rounded border p-2">{categories.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</SelectControl><input aria-label="Reference caption" placeholder="Caption (optional)" maxLength={500} value={caption} onChange={event => setCaption(event.target.value)} className="min-w-0 basis-full rounded border p-2 sm:flex-1 sm:basis-auto" /><label className={button}>Upload reference photo<input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={upload} /></label></div>}
        {[
          ['Approved property references', rows.filter(photo => photo.status === 'approved')],
          ['Pending technician proposals', rows.filter(photo => photo.status === 'proposed')],
          ['Archived references', rows.filter(photo => ['archived', 'rejected'].includes(photo.status))],
        ].map(([heading, photos]) => <section key={heading} aria-label={heading} className="space-y-2">
          <h4 className="font-semibold">{heading} ({photos.length})</h4>
          {!photos.length && heading === 'Approved property references' && <p>No approved reference photographs yet.</p>}
          {photos.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{photos.map(photo => <figure key={photo.id} className="min-w-0 rounded-lg border p-2">
            <AuthorizedPhotoPreview photo={photo} kind="property" customerId={customerId} propertyId={selected} jobId={jobId} readable={photo.status !== 'proposed' || canManage} />
            <figcaption className="mt-2 break-words text-xs"><strong>{categories.find(([id]) => id === photo.category)?.[1] || 'Other'}</strong><span className="block">{photo.caption || 'No caption'}</span>{photo.status !== 'approved' && <span className="block capitalize">{photo.status === 'proposed' ? 'Awaiting management approval' : photo.status}</span>}</figcaption>
            {canManage && photo.status === 'proposed' && <button className={button} disabled={busy} onClick={() => changePhoto('approve', photo.id)}>Approve</button>}
            {canManage && !['archived', 'rejected'].includes(photo.status) && <button className={button} disabled={busy} onClick={() => changePhoto('archive', photo.id)}>{photo.status === 'proposed' ? 'Reject proposal' : 'Archive'}</button>}
          </figure>)}</div>}
        </section>)}
        {canManage && sourcePhotos.length > 0 && <section aria-label="Job evidence for reference" className="space-y-2"><h4 className="font-semibold">Job evidence available for reference ({sourcePhotos.length})</h4><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{sourcePhotos.map(photo => <figure key={photo.id} className="min-w-0 rounded-lg border p-2"><AuthorizedPhotoPreview photo={photo} /><figcaption className="mt-2 break-words text-xs">{photo.caption || 'Job evidence'}</figcaption><button className={button} disabled={busy} onClick={() => changePhoto('propose', photo.id, { operationId: crypto.randomUUID(), category, caption })}>Propose as reference</button></figure>)}</div></section>}
      </div>}
      {(tab === 'Service History' || tab === 'Material History') && <div className="space-y-2 text-sm">{rows.map(row => <div className="rounded border p-3" key={row.id}>{tab === 'Service History' ? <><strong>{row.date} · {row.serviceType}</strong><p>{row.technician || 'Technician not recorded'} · {row.outcome}</p>{row.notes && <p>{row.notes}</p>}{row.hasEvidence && <p>Job photo evidence recorded. Open the authorized job to review it.</p>}</> : <><strong>{row.date} · {row.product}</strong><p>{row.quantity} {row.unit} · {row.location || 'Location not recorded'} · {row.method || 'Method not recorded'}</p></>}</div>)}{!rows.length && !busy && <p>No records explicitly linked to this property. Older visits cannot be assigned by address alone.</p>}</div>}
      {next && <button className={button} disabled={busy} onClick={() => load(tab, next)}>Load more</button>}
    </>}
  </section>;
}
