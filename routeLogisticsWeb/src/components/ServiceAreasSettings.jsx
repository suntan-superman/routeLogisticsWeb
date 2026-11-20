import SelectControl from './SelectControl';
import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { callWorkspace } from '../services/workspaceApi';
import { loadMaps } from '../services/maps';
import { useUnsavedChanges } from '../hooks/useUnsavedChanges';
import ServicePropertyEligibility from './ServicePropertyEligibility';
import AddressValidationNotice from './AddressValidationNotice';
import { useWorkspaceQuery } from '../hooks/useWorkspaceQuery';
import { workspaceAccessError } from '../services/workspaceQueryPolicy';

const inputClass = 'mt-1 block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500';
const actionClass = 'rounded-lg bg-primary-700 px-4 py-2 font-medium text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-50';
const splitZips = text => [...new Set(String(text || '').split(/[\s,;]+/).map(value => value.trim()).filter(Boolean))];
const formFor = (settings = {}) => ({
  operatingAddress: settings.operatingAddress || '', method: settings.method || 'zip', zipCodesText: (settings.zipCodes || []).join(', '), radiusMiles: String(settings.radiusMiles ?? 25),
  categoryOverrides: (settings.categoryOverrides || []).map(row => ({ serviceCategory: row.serviceCategory || '', method: row.method || 'zip', zipCodesText: (row.zipCodes || []).join(', '), radiusMiles: String(row.radiusMiles ?? 25) })),
  acceptingNewCustomers: settings.acceptingNewCustomers === true, publishCoverage: settings.publishCoverage === true, allowOutOfAreaRequests: settings.allowOutOfAreaRequests === true,
});
const payloadFor = form => ({
  operatingAddress: form.operatingAddress.trim(), method: form.method, zipCodes: splitZips(form.zipCodesText), radiusMiles: Number(form.radiusMiles),
  categoryOverrides: form.categoryOverrides.map(row => ({ serviceCategory: row.serviceCategory, method: row.method, zipCodes: splitZips(row.zipCodesText), radiusMiles: Number(row.radiusMiles) })),
  acceptingNewCustomers: form.acceptingNewCustomers, publishCoverage: form.publishCoverage, allowOutOfAreaRequests: form.allowOutOfAreaRequests,
});
function validation(form) {
  if (form.operatingAddress.length > 278) return 'Keep the operating address to 278 characters.';
  const rows = [form, ...form.categoryOverrides];
  if (rows.some(row => row.method === 'radius') && !form.operatingAddress.trim()) return 'Enter the business operating address before using radius coverage.';
  for (const row of rows) {
    if (row.method === 'radius' && (!Number.isFinite(Number(row.radiusMiles)) || Number(row.radiusMiles) < 0.1 || Number(row.radiusMiles) > 300)) return 'Choose a radius between 0.1 and 300 miles.';
    const zips = splitZips(row.zipCodesText);
    if (row.method === 'zip' && (!zips.length || zips.length > 500 || zips.some(zip => !/^\d{5}(?:-\d{4})?$/.test(zip)))) return 'Enter between 1 and 500 valid US ZIP codes, separated by commas or spaces.';
  }
  if (form.categoryOverrides.some(row => !row.serviceCategory.trim())) return 'Choose a service category for each coverage override.';
  if (new Set(form.categoryOverrides.map(row => row.serviceCategory.toLowerCase())).size !== form.categoryOverrides.length) return 'Each service category can have only one coverage override.';
  return '';
}

export default function ServiceAreasSettings({ company: suppliedCompany }) {
  const { company: sessionCompany, currentUser, role } = useAuth();
  const company = suppliedCompany || sessionCompany;
  const owner = !!company && company.ownerId === currentUser?.uid;
  const allowed = !!company?.id && (owner || ['admin', 'manager'].includes(role));
  return <ServiceAreasForm key={`${currentUser?.uid || ''}:${company?.id || ''}:${role || ''}`} company={company} allowed={allowed} />;
}

function ServiceAreasForm({ company, allowed }) {
  const [data, setData] = useState(null), [form, setForm] = useState(null), [saved, setSaved] = useState('');
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [addressValidation, setAddressValidation] = useState(null);
  const [overrideUnverified, setOverrideUnverified] = useState(false);
  const [preview, setPreview] = useState(false), [previewCategory, setPreviewCategory] = useState(''), [property, setProperty] = useState({ address: '', serviceCategory: '' });
  const runtime = useRef({ mounted: false, sequence: 0, busy: false });
  const dirty = allowed && !!form && JSON.stringify(form) !== saved;
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const settingsQuery = useWorkspaceQuery(['service-areas', company?.id], () => callWorkspace('rlServiceAreas', { action: 'status', companyId: company.id }), { enabled: allowed, intervalMs: 60000 });
  const { confirmDiscard } = useUnsavedChanges(dirty, { message: 'You have unsaved service-area changes. Leave without saving them?', scope: `service-areas:${company?.id || ''}` });
  const invoke = useCallback(async (kind, operation, onSuccess) => {
    const state = runtime.current;
    if (!state.mounted || state.busy) return;
    state.busy = true; const sequence = ++state.sequence;
    setBusy(kind); setError(''); setMessage(''); setAddressValidation(null);
    try {
      const result = await operation();
      if (state.mounted && sequence === state.sequence) onSuccess(result);
    } catch (failure) {
      if (state.mounted && sequence === state.sequence) {
        setError(failure.message || 'Service areas could not be updated. Your changes are available to retry.');
        setAddressValidation(failure.details?.addressValidation || null);
        if (['functions/permission-denied', 'functions/unauthenticated'].includes(failure.code)) { setForm(null); setData(null); setPreview(false); }
        if (kind === 'save') toast.error(failure.message || 'Service areas were not saved.');
      }
    } finally { state.busy = false; if (state.mounted && sequence === state.sequence) setBusy(''); }
  }, []);
  const accept = useCallback(response => {
    const next = formFor(response.onboardingSettings || response.settings);
    setData(response); setForm(next); setSaved(JSON.stringify(formFor(response.settings))); setProperty({ address: '', serviceCategory: '' }); setOverrideUnverified(false);
  }, []);
  useEffect(() => {
    const state = runtime.current;
    state.mounted = true;
    return () => { state.mounted = false; state.sequence++; state.busy = false; };
  }, [allowed, company?.id]);
  useEffect(() => {
    if (!settingsQuery.data || dirtyRef.current || runtime.current.busy) return;
    const next = formFor(settingsQuery.data.onboardingSettings || settingsQuery.data.settings);
    setData(settingsQuery.data); setForm(next); setSaved(JSON.stringify(formFor(settingsQuery.data.settings)));
    // Property-check input is an independent draft; polling settings must not
    // erase the address the dispatcher is currently checking.
  }, [settingsQuery.data, busy]);
  useEffect(() => { if (workspaceAccessError(settingsQuery.error)) { setForm(null); setData(null); setPreview(false); } }, [settingsQuery.error]);
  if (!allowed) return <section className="rounded-xl border border-gray-200 bg-white p-6"><h2 className="text-xl font-semibold">Service Areas</h2><p className="mt-2">Company owners, administrators, and managers manage service territories. Technicians cannot change coverage or approve exceptions.</p></section>;
  const categories = (company.serviceCategories || []).filter(value => typeof value === 'string' && value.trim());
  const validationError = form ? validation(form) : '';
  const patch = change => { setForm(previous => ({ ...previous, ...change })); setMessage(''); if (Object.hasOwn(change, 'operatingAddress')) { setAddressValidation(null); setOverrideUnverified(false); } };
  const updateOverride = (index, changes) => setForm(previous => ({ ...previous, categoryOverrides: previous.categoryOverrides.map((row, position) => position === index ? { ...row, ...changes } : row) }));
  const save = () => {
    if (!dirty || validationError) return;
    invoke('save', () => callWorkspace('rlServiceAreas', { action: 'save', companyId: company.id, expectedRevision: data.settings?.revision || 0, settings: payloadFor(form), ...(overrideUnverified ? { allowUnverifiedOperatingAddress: true } : {}) }), response => {
      settingsQuery.setData(response); accept(response);
      const unverified = !response.settings?.operatingLocation;
      setMessage(unverified ? 'Service-area choices saved with an unverified operating address. Radius coverage is pending verification; existing internal scheduling is preserved and public radius checks remain unavailable.' : 'Service areas saved. Existing appointments and history are unchanged.');
      toast.success(unverified ? 'Service areas saved; operating location remains unverified.' : 'Service areas saved.');
    });
  };
  const retryVerification = () => {
    if (dirty || !form || data?.settings?.addressVerification !== 'owner-overridden') return;
    invoke('verify', () => callWorkspace('rlServiceAreas', { action: 'save', companyId: company.id, expectedRevision: data.settings.revision, settings: payloadFor(form) }), response => {
      settingsQuery.setData(response); accept(response);
      setMessage('Operating address verified. Saved coverage is now active.');
      toast.success('Operating address verified.');
    });
  };
  const reload = async () => { if (dirty && !await confirmDiscard()) return; invoke('load', async () => { const result = await settingsQuery.refetch(); if (result.error) throw result.error; return result.data; }, accept); };
  const previewRule = data?.settings?.categoryOverrides?.find(row => row.serviceCategory === previewCategory) || data?.settings;
  return <section aria-label="Service area settings" className="space-y-6 rounded-xl border border-gray-200 bg-white p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="text-xl font-semibold">Service Areas</h2><p className="mt-1 max-w-3xl text-sm text-gray-600">Define coverage around the service property. Changes apply to future checks and do not rewrite existing appointments, customer locations or service history.</p></div><button type="button" className="text-sm font-medium text-primary-700 underline disabled:opacity-50" disabled={!!busy} onClick={reload}>Reload service areas</button></div>
    {(error || settingsQuery.error) && !addressValidation && <p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{error || settingsQuery.error.message}</p>}
    <AddressValidationNotice validation={addressValidation} onAccept={operatingAddress => patch({ operatingAddress })} disabled={!!busy || !allowed || !form} />
    {addressValidation && data?.canOverrideOperatingAddress && <label className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"><input type="checkbox" className="mt-1" checked={overrideUnverified} onChange={event => setOverrideUnverified(event.target.checked)} /><span><strong className="block">Save this operating address without Google verification</strong>The company owner can keep the entered address and coverage settings. Radius eligibility and its map remain unavailable until the operating location is verified. ZIP coverage uses the saved ZIP list.</span></label>}
    {message && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-emerald-900">{message}</p>}
    {!form && !error && <p role="status">Loading service areas…</p>}
    {form && <>
      {data.settings?.configured === false && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{data.onboardingSettings ? 'Your onboarding address and coverage choices are ready below, but service areas are not yet active. Review and save them.' : data.settings?.addressVerification === 'owner-overridden' ? 'Your radius settings are saved, but coverage remains pending until the operating location is verified. Existing internal scheduling is preserved; public radius checks remain unavailable.' : 'No service area is configured yet. Existing work is preserved. Save valid coverage before accepting future public service requests.'}</p>}
      {data.settings?.configured && !data.settings?.operatingLocation && <p role="status" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">The saved operating address is unverified. Radius eligibility and its map are unavailable until Google verifies it.</p>}
      <fieldset disabled={!!busy} className="space-y-5">
        <label className="block text-sm font-medium">Business operating address<input aria-label="Business operating address" className={inputClass} maxLength={278} autoComplete="street-address" placeholder="Street, city, state and ZIP code" value={form.operatingAddress} onChange={event => patch({ operatingAddress: event.target.value })} /><span className="mt-1 block text-sm font-normal text-gray-600">Radius coverage is measured from this validated location. Saving requests address validation; typing does not look up addresses.</span></label>
        <CoverageFields rule={form} label="Default company coverage" onChange={patch} />
        <div className="space-y-4 rounded-xl border border-gray-200 p-4">
          <div><h3 className="font-semibold">Service-category overrides</h3><p className="text-sm text-gray-600">A category override replaces default coverage for that category. Other services use default company coverage.</p></div>
          {!categories.length && <p className="text-sm text-gray-600">Add service categories in company settings before creating an override.</p>}
          {form.categoryOverrides.map((row, index) => <div className="space-y-3 rounded-lg bg-gray-50 p-4" key={index}>
            <label className="block text-sm font-medium">Override {index + 1} service category<SelectControl aria-label={`Override ${index + 1} service category`} className={inputClass} value={row.serviceCategory} onChange={event => updateOverride(index, { serviceCategory: event.target.value })}><option value="">Choose a category</option>{categories.map(category => <option key={category} value={category}>{category}</option>)}</SelectControl></label>
            <CoverageFields rule={row} label={`Override ${index + 1}`} onChange={change => updateOverride(index, change)} />
            <button type="button" className="text-sm text-red-800 underline" onClick={() => patch({ categoryOverrides: form.categoryOverrides.filter((_row, position) => position !== index) })}>Remove override {index + 1}</button>
          </div>)}
          <button type="button" className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium" disabled={!categories.length || form.categoryOverrides.length >= Math.min(categories.length, 30)} onClick={() => patch({ categoryOverrides: [...form.categoryOverrides, { serviceCategory: categories.find(category => !form.categoryOverrides.some(row => row.serviceCategory === category)) || '', method: 'zip', zipCodesText: '', radiusMiles: '25' }] })}>Add category override</button>
        </div>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={form.acceptingNewCustomers} onChange={event => patch({ acceptingNewCustomers: event.target.checked })} className="mt-1" /><span><strong className="block">Accepting new customers</strong>Future new-customer requests check this setting. Existing appointments remain valid.</span></label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={form.publishCoverage} onChange={event => patch({ publishCoverage: event.target.checked })} className="mt-1" /><span><strong className="block">Allow public sharing of coverage</strong>Keep this off to keep boundaries private. Customer property addresses do not expand coverage automatically.</span></label>
        <label className="flex items-start gap-3 text-sm"><input type="checkbox" checked={form.allowOutOfAreaRequests} onChange={event => patch({ allowOutOfAreaRequests: event.target.checked })} className="mt-1" /><span><strong className="block">Allow owner-approved out-of-area exceptions</strong>Only the company owner can approve a specific property; an exception does not change the territory.</span></label>
        {dirty && validationError && <p role="alert" className="text-sm text-red-800">{validationError}</p>}
        <button type="button" className={actionClass} disabled={!dirty || !!validationError || !!busy} onClick={save}>{busy === 'save' ? 'Saving and validating…' : 'Save service areas'}</button>
        {!dirty && data.settings?.addressVerification === 'owner-overridden' && <button type="button" className="ml-3 rounded-lg border border-primary-700 px-4 py-2 font-medium text-primary-700 disabled:opacity-50" disabled={!!busy} onClick={retryVerification}>{busy === 'verify' ? 'Verifying…' : 'Retry Google verification'}</button>}
      </fieldset>
      <section aria-label="Saved coverage preview" className="space-y-3 border-t border-gray-200 pt-5">
        <h3 className="font-semibold">Saved coverage preview</h3>
        <p className="text-sm text-gray-600">{dirty ? 'Save your changes to update this preview and property checks.' : 'Preview uses the last saved coverage.'}</p>
        {!!data.settings?.categoryOverrides?.length && <label className="block text-sm font-medium">Preview service category<SelectControl aria-label="Preview service category" className={inputClass} value={previewCategory} onChange={event => setPreviewCategory(event.target.value)}><option value="">Default company coverage</option>{data.settings.categoryOverrides.map(row => <option key={row.serviceCategory} value={row.serviceCategory}>{row.serviceCategory}</option>)}</SelectControl></label>}
        {previewRule?.method === 'zip' ? <div className="flex flex-wrap gap-2" aria-label="Saved ZIP-code coverage">{previewRule.zipCodes?.length ? previewRule.zipCodes.map(zip => <span className="rounded bg-emerald-50 px-3 py-1 text-sm text-emerald-900" key={zip}>{zip}</span>) : <p className="text-sm text-gray-600">No ZIP codes saved.</p>}</div> : <p>{previewRule?.radiusMiles} mile radius{data.settings?.operatingLocation ? ' from the validated operating location.' : ' saved; the operating location must be verified before radius checks can run.'}</p>}
        {data.settings?.operatingLocation?.formattedAddress && <p className="text-sm">Operating location: {data.settings.operatingLocation.formattedAddress}</p>}
        <button type="button" className="text-sm font-medium text-primary-700 underline disabled:opacity-50" disabled={dirty || !data.settings?.configured || !data.settings?.operatingLocation} onClick={() => setPreview(value => !value)}>{preview ? 'Hide coverage map' : 'Show coverage map'}</button>
        {preview && <CoverageMap settings={data.settings} rule={previewRule} />}
      </section>
      {!dirty && <ServicePropertyEligibility companyId={company.id} serviceCategories={categories} policy={data} value={property} onChange={setProperty} />}
    </>}
  </section>;
}

function CoverageFields({ rule, label, onChange }) {
  return <div className="grid gap-4 sm:grid-cols-2">
    <label className="block text-sm font-medium">{label} method<SelectControl aria-label={`${label} method`} className={inputClass} value={rule.method} onChange={event => onChange({ method: event.target.value })}><option value="zip">ZIP codes</option><option value="radius">Radius from operating location</option></SelectControl></label>
    {rule.method === 'zip' ? <label className="block text-sm font-medium">{label} ZIP codes<textarea aria-label={`${label} ZIP codes`} className={inputClass} value={rule.zipCodesText} maxLength={6000} rows={3} onChange={event => onChange({ zipCodesText: event.target.value })} placeholder="93312, 93311" /><span className="mt-1 block text-sm font-normal text-gray-600">US ZIP codes, separated by commas or spaces. ZIP+4 entries are normalized to five digits.</span></label> : <label className="block text-sm font-medium">{label} radius in miles<input aria-label={`${label} radius in miles`} className={inputClass} type="number" min="0.1" max="300" step="0.1" value={rule.radiusMiles} onChange={event => onChange({ radiusMiles: event.target.value })} /></label>}
  </div>;
}

function CoverageMap({ settings, rule }) {
  const element = useRef(null), map = useRef(null), circle = useRef(null);
  const [error, setError] = useState('');
  const latitude = settings.operatingLocation?.latitude, longitude = settings.operatingLocation?.longitude;
  useEffect(() => {
    let active = true;
    (async () => {
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('A validated operating location is required for the map.');
      const maps = await loadMaps(), { Map: GoogleMap, Circle } = await maps.importLibrary('maps');
      if (!active) return;
      const center = { lat: latitude, lng: longitude };
      map.current ||= new GoogleMap(element.current, { center, zoom: 12, streetViewControl: false, mapTypeControl: false });
      circle.current?.setMap(null);
      circle.current = new Circle({ center, map: map.current, radius: rule.method === 'radius' ? Number(rule.radiusMiles) * 1609.344 : 60, strokeColor: '#047857', strokeWeight: 2, fillColor: '#10b981', fillOpacity: rule.method === 'radius' ? 0.15 : 0.7, clickable: false });
      if (rule.method === 'radius') { const bounds = circle.current.getBounds(); if (bounds) map.current.fitBounds(bounds); } else { map.current.setCenter(center); map.current.setZoom(13); }
      setError('');
    })().catch(failure => { if (active) setError(failure.message || 'Coverage map is unavailable. The saved ZIP/radius settings remain available above.'); });
    return () => { active = false; circle.current?.setMap(null); };
  }, [latitude, longitude, rule.method, rule.radiusMiles]);
  return <div className="space-y-2"><div ref={element} className="h-80 w-full rounded-xl border border-gray-200" role="region" aria-label="Service coverage map" />{rule.method === 'zip' && <p className="text-sm text-gray-600">The map shows the operating location only. ZIP-code coverage is the saved list above; no estimated ZIP boundaries are drawn.</p>}{error && <p role="alert" className="text-sm text-red-800">{error}</p>}</div>;
}
