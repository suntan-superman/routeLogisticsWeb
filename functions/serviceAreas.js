const { randomUUID } = require('node:crypto');
const { HttpsError } = require('firebase-functions/v2/https');
const { requireCapability } = require('./access');
const { documentId, hash, rateLimit } = require('./security');

const PURPOSES = ['scheduling', 'estimate', 'public-request', 'booking'];
const LOCATION_TYPES = ['PREMISE', 'SUB_PREMISE', 'ROOFTOP', 'RANGE_INTERPOLATED'];
const DAY = 86400000;
const time = value => value?.toMillis ? value.toMillis() : value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(value || '');
const categoryKey = value => String(value || '').trim().toLowerCase();
const addressKey = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const finitePoint = value => typeof value?.latitude === 'number' && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90 && typeof value?.longitude === 'number' && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
const fail = (code, message) => { throw new HttpsError(code, message); };
const DEFAULT_SETTINGS = { configured: false, revision: 0, operatingAddress: '', operatingLocation: null, method: 'zip', zipCodes: [], radiusMiles: 25, categoryOverrides: [], acceptingNewCustomers: false, publishCoverage: false, allowOutOfAreaRequests: false };
const INVALID_ADDRESS = 'Google could not verify this street address. Check its street number, city, state and ZIP code.';
function addressValidationError(status, message, suggestedAddress) {
  const details = { status, message, ...(suggestedAddress ? { suggestedAddress } : {}) };
  return new HttpsError(status === 'unavailable' ? 'unavailable' : 'failed-precondition', message, { addressValidation: details });
}
function addressValidationDetails(error) {
  const source = error?.details?.addressValidation;
  const status = ['confirmation-required', 'invalid', 'unavailable'].includes(source?.status) ? source.status : error?.code === 'unavailable' ? 'unavailable' : 'invalid';
  const message = status === 'unavailable' ? 'Google address verification is temporarily unavailable. Retry before saving this address.' : status === 'confirmation-required' ? 'Google found a possible corrected address. Review it before saving.' : INVALID_ADDRESS;
  const suggestion = typeof source?.suggestedAddress === 'string' ? source.suggestedAddress.trim() : '';
  return { status, message, ...(status === 'confirmation-required' && suggestion.length >= 8 && suggestion.length <= 278 && !/[<>\u0000-\u001f]/.test(suggestion) ? { suggestedAddress: suggestion } : {}) };
}

function propertyAddress(value) {
  if (typeof value !== 'string') fail('invalid-argument', 'Enter the service property street address.');
  const text = value.trim().replace(/\s+/g, ' ');
  if (text.length < 8 || text.length > 278 || /[<>\u0000-\u001f]|\bP\.?\s*O\.?\s*BOX\b/i.test(text) || !/\d/.test(text) || !/[A-Za-z]/.test(text)) fail('invalid-argument', 'Enter a physical service property street address, including city, state and ZIP code (278 characters maximum).');
  return text;
}
function zipCode(value) {
  const text = String(value || '').trim();
  if (!/^\d{5}(?:-\d{4})?$/.test(text)) fail('invalid-argument', 'Use valid US ZIP codes (five digits or ZIP+4).');
  return text.slice(0, 5);
}
function coverageRule(input) {
  if (!input || !['zip', 'radius'].includes(input.method)) fail('invalid-argument', 'Choose ZIP-code or radius coverage.');
  const zips = input.zipCodes === undefined ? [] : input.zipCodes;
  if (!Array.isArray(zips) || zips.length > 500) fail('invalid-argument', 'Include at most 500 ZIP codes.');
  const zipCodes = [...new Set(zips.map(zipCode))].sort();
  const radiusMiles = Number(input.radiusMiles ?? 25);
  if (!Number.isFinite(radiusMiles) || radiusMiles < 0.1 || radiusMiles > 300) fail('invalid-argument', 'Choose a radius between 0.1 and 300 miles.');
  if (input.method === 'zip' && !zipCodes.length) fail('invalid-argument', 'Include at least one ZIP code for ZIP-code coverage.');
  return { method: input.method, zipCodes, radiusMiles };
}
function companyCategories(company) {
  return [...new Map((Array.isArray(company?.serviceCategories) ? company.serviceCategories : []).filter(v => typeof v === 'string' && v.trim()).map(v => [categoryKey(v), v.trim().slice(0, 100)])).values()];
}
function cleanSettings(input, categories = []) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('invalid-argument', 'Choose service-area settings.');
  const operatingAddress = propertyAddress(input.operatingAddress), rule = coverageRule(input);
  const overrides = input.categoryOverrides || [];
  if (!Array.isArray(overrides) || overrides.length > 30) fail('invalid-argument', 'Include at most 30 service-category overrides.');
  const known = new Map(categories.map(v => [categoryKey(v), v])), seen = new Set();
  const categoryOverrides = overrides.map(row => {
    const key = categoryKey(row?.serviceCategory);
    if (!key || !known.has(key) || seen.has(key)) fail('invalid-argument', 'Each override must name a distinct service category offered by this company.');
    seen.add(key); return { serviceCategory: known.get(key), ...coverageRule(row) };
  }).sort((a, b) => a.serviceCategory.localeCompare(b.serviceCategory));
  return { operatingAddress, ...rule, categoryOverrides, acceptingNewCustomers: input.acceptingNewCustomers === true, publishCoverage: input.publishCoverage === true, allowOutOfAreaRequests: input.allowOutOfAreaRequests === true };
}
function distanceMiles(first, second) {
  if (!finitePoint(first) || !finitePoint(second)) fail('invalid-argument', 'Valid geographic coordinates are required.');
  const rad = n => n * Math.PI / 180, latitude = rad(second.latitude - first.latitude), longitude = rad(second.longitude - first.longitude);
  const a = Math.sin(latitude / 2) ** 2 + Math.cos(rad(first.latitude)) * Math.cos(rad(second.latitude)) * Math.sin(longitude / 2) ** 2;
  return 3958.7613 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}
function evaluateCoverage(settings, property, serviceCategory, { categories = [], publicRequest = false } = {}) {
  if (!settings?.configured) return { eligible: !publicRequest, status: 'unconfigured', reason: 'service-area-not-configured', message: publicRequest ? 'This provider has not configured service coverage.' : 'Service areas are not configured; existing scheduling behavior is preserved.' };
  if (publicRequest && settings.acceptingNewCustomers !== true) return { eligible: false, status: 'not-accepting', reason: 'not-accepting-new-customers', message: 'This provider is not currently accepting new customer requests.' };
  if (!finitePoint(property) || !/^\d{5}$/.test(property?.postalCode || '')) return { eligible: false, status: 'invalid-address', reason: 'property-address-unvalidated', message: 'The service property address could not be validated. Correct the address before continuing.' };
  const key = categoryKey(serviceCategory), known = categories.map(categoryKey), overrides = settings.categoryOverrides || [];
  if ((overrides.length || publicRequest && known.length) && (!key || !known.includes(key))) return { eligible: false, status: 'invalid-category', reason: 'service-category-required', message: 'Choose an offered service category before checking this property.' };
  const rule = overrides.find(row => categoryKey(row.serviceCategory) === key) || settings;
  if (rule.method === 'zip') {
    const inside = rule.zipCodes?.includes(property.postalCode) === true;
    return { eligible: inside, status: inside ? 'inside' : 'outside', reason: inside ? 'zip-covered' : 'zip-outside-coverage', message: inside ? 'The service property ZIP code is covered.' : 'The service property ZIP code is outside this provider’s coverage.' };
  }
  if (rule.method !== 'radius' || !finitePoint(settings.operatingLocation) || !Number.isFinite(rule.radiusMiles) || rule.radiusMiles < 0.1 || rule.radiusMiles > 300) return { eligible: false, status: 'invalid-address', reason: 'coverage-location-unavailable', message: 'The provider’s operating location must be validated before this property can be checked.' };
  const distance = distanceMiles(settings.operatingLocation, property), inside = distance <= rule.radiusMiles + 1e-9;
  return { eligible: inside, status: inside ? 'inside' : 'outside', reason: inside ? 'radius-covered' : 'radius-outside-coverage', message: inside ? 'The service property is inside the provider’s coverage radius.' : 'The service property is outside this provider’s coverage radius.', distanceMiles: Math.round(distance * 100) / 100 };
}
function trustedProperty(value, now) {
  if (!finitePoint(value) || !/^\d{5}$/.test(value?.postalCode || '') || value?.countryCode !== 'US' || !LOCATION_TYPES.includes(value?.locationType) || value?.streetAddressVerified !== true || typeof value.formattedAddress !== 'string' || value.formattedAddress.length < 8 || value.formattedAddress.length > 278 || /[<>\u0000-\u001f]/.test(value.formattedAddress)) fail('failed-precondition', 'The street address could not be validated precisely enough. Correct it before continuing.');
  return { address: value.formattedAddress, formattedAddress: value.formattedAddress, latitude: value.latitude, longitude: value.longitude, postalCode: value.postalCode, countryCode: 'US', locationType: value.locationType, streetAddressVerified: true, placeId: typeof value.placeId === 'string' ? value.placeId.slice(0, 300) : '', source: 'google-address-validation', validatedAt: new Date(now).toISOString() };
}
function createGoogleGeocoder({ getAccessToken, projectId = 'mi-factotum-field-service', fetchImpl = fetch } = {}) {
  return async address => {
    if (typeof getAccessToken !== 'function' || !/^[a-z][a-z0-9-]{4,62}$/.test(projectId)) throw addressValidationError('unavailable', 'Google address verification is not configured. Contact your company owner.');
    const validatedInput = propertyAddress(address);
    let response, data;
    try {
      const token = await getAccessToken(); if (typeof token !== 'string' || !token) throw Error('provider-token');
      response = await fetchImpl('https://addressvalidation.googleapis.com/v1:validateAddress', { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'X-Goog-User-Project': projectId, 'Content-Type': 'application/json' }, body: JSON.stringify({ address: { regionCode: 'US', addressLines: [validatedInput] } }), signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (!response.ok) throw Error('provider-http'); data = await response.json();
    }
    catch { throw addressValidationError('unavailable', 'Google address verification is temporarily unavailable. Please retry.'); }
    const result = data?.result, verdict = result?.verdict, checked = result?.address, postal = checked?.postalAddress, components = checked?.addressComponents || [];
    const precise = ['PREMISE', 'SUB_PREMISE'];
    const street = type => components.find(row => row.componentType === type);
    const critical = components.filter(row => ['street_number', 'route', 'premise', 'subpremise', 'locality', 'administrative_area_level_1', 'postal_code'].includes(row.componentType));
    const preciseCandidate = verdict?.addressComplete === true && precise.includes(verdict.validationGranularity) && precise.includes(verdict.geocodeGranularity)
      && postal?.regionCode === 'US' && /^\d{5}(?:-\d{4})?$/.test(postal?.postalCode || '') && finitePoint(result?.geocode?.location)
      && street('street_number') && street('route') && critical.every(row => row.confirmationLevel === 'CONFIRMED')
      && verdict.hasUnconfirmedComponents !== true && !checked?.missingComponentTypes?.length && !checked?.unconfirmedComponentTypes?.length && !checked?.unresolvedTokens?.length;
    // Explicitly resubmitting Google's precise, confirmed canonical address is
    // sufficient review even when Google retains normalization flags.
    const canonicalInput = typeof checked?.formattedAddress === 'string' && addressKey(checked.formattedAddress) === addressKey(validatedInput);
    // A confirmed ZIP/locality or postal-format enrichment does not change the
    // identified property. Only changes to the physical street/unit need review.
    const physicalCorrection = !canonicalInput && critical.some(row => ['street_number', 'route', 'premise', 'subpremise'].includes(row.componentType) && (row.inferred === true || row.replaced === true));
    if (verdict?.addressComplete !== true || !precise.includes(verdict.validationGranularity) || !precise.includes(verdict.geocodeGranularity) || verdict.hasUnconfirmedComponents === true
      || checked?.missingComponentTypes?.length || checked?.unconfirmedComponentTypes?.length || checked?.unresolvedTokens?.length || postal?.regionCode !== 'US'
      || !street('street_number') || !street('route') || physicalCorrection || critical.some(row => row.confirmationLevel !== 'CONFIRMED')) {
      const suggested = preciseCandidate && typeof checked.formattedAddress === 'string' && checked.formattedAddress.length <= 278 && !/[<>\u0000-\u001f]/.test(checked.formattedAddress) && addressKey(checked.formattedAddress) !== addressKey(validatedInput) ? checked.formattedAddress : null;
      throw addressValidationError(suggested ? 'confirmation-required' : 'invalid', suggested ? 'Google found a possible corrected address. Review it before saving.' : INVALID_ADDRESS, suggested);
    }
    return trustedProperty({ latitude: result.geocode?.location?.latitude, longitude: result.geocode?.location?.longitude, postalCode: String(postal.postalCode || '').slice(0, 5), countryCode: 'US', locationType: verdict.geocodeGranularity, streetAddressVerified: true, formattedAddress: checked.formattedAddress, placeId: result.geocode?.placeId }, Date.now());
  };
}
function serviceAreaHandlers(db, config = {}) {
  const now = config.now || (() => Date.now()), geocode = config.geocode || createGoogleGeocoder({ getAccessToken: config.getAccessToken, projectId: config.projectId });
  const issuedResults = new WeakMap();
  const issue = result => { issuedResults.set(result, hash(JSON.stringify(result))); return result; };
  const policyRef = companyId => db.doc(`rlServiceAreas/${documentId(companyId, 'company')}`);
  const exceptionRef = id => db.doc(`rlServiceAreaExceptions/${documentId(id, 'exception')}`);
  const snapshot = snap => ({ ...DEFAULT_SETTINGS, ...(snap.exists ? snap.data() : {}), configured: snap.get('configured') === true, revision: snap.get('revision') || 0 });
  const providerFingerprint = company => hash(JSON.stringify({ ownerId: company.get('ownerId') || null, active: company.exists && company.get('isActive') !== false, deleted: !!company.get('deletedAt'), categories: companyCategories(company.data()).map(categoryKey).sort() }));
  async function resolve(companyId, input) {
    const address = propertyAddress(input), key = hash(`${companyId}:${addressKey(address)}`), ref = db.doc(`rlServiceAreaGeocodes/${key}`), cached = await ref.get();
    if (cached.exists && cached.get('addressKey') === addressKey(address) && time(cached.get('expiresAt')) > now()) {
      try { return trustedProperty(cached.get('property'), time(cached.get('validatedAt')) || now()); } catch { /* Revalidate an unusable private cache record. */ }
    }
    const property = trustedProperty(await geocode(address), now());
    await ref.set({ ...(companyId.startsWith('user:') ? { userId: companyId.slice(5) } : { companyId }), addressKey: addressKey(address), property, validatedAt: new Date(now()), expiresAt: new Date(now() + 30 * DAY) });
    return property;
  }
  async function validateAddress(scope, address) {
    const key = scope.companyId || (scope.uid ? `user:${scope.uid}` : null);
    if (!key) fail('permission-denied', 'An authorized workspace is required to verify an address.');
    try { return await resolve(key, address); }
    catch (error) { const details = addressValidationDetails(error); throw addressValidationError(details.status, details.message, details.suggestedAddress); }
  }
  const propertyFingerprint = property => hash(`${addressKey(property.formattedAddress)}:${property.latitude}:${property.longitude}:${property.postalCode}`);
  function exceptionValid(row, company, input, result) {
    return row.exists && row.get('status') === 'approved' && row.get('companyId') === input.companyId && row.get('settingsRevision') === result.settingsRevision && row.get('propertyFingerprint') === result.propertyFingerprint && row.get('serviceCategory') === categoryKey(input.serviceCategory) && row.get('purpose') === input.purpose && row.get('approvedByUid') === company.get('ownerId') && time(row.get('expiresAt')) > now();
  }
  async function checkForWorkflow(input = {}) {
    const { companyId } = input, purpose = input.purpose || 'scheduling', publicRequest = input.publicRequest === true || ['public-request', 'booking'].includes(purpose);
    const internalContinuationAllowed = !publicRequest && purpose === 'scheduling' && input.allowUnverifiedAddress === true;
    if (!PURPOSES.includes(purpose)) fail('invalid-argument', 'Choose a supported service-area check purpose.');
    const requestAddressHash = hash(addressKey(input.propertyAddress)), base = { companyId: companyId || null, purpose, serviceCategory: categoryKey(input.serviceCategory), requestAddressHash, checkedAt: new Date(now()).toISOString(), property: null };
    const [stored, company] = companyId ? await Promise.all([policyRef(companyId).get(), db.doc(`companies/${documentId(companyId)}`).get()]) : [null, null];
    const settings = stored ? snapshot(stored) : { ...DEFAULT_SETTINGS }, state = { ...base, settingsRevision: settings.revision, coverageConfigured: settings.configured === true, policyExists: stored?.exists === true, ...(company ? { providerFingerprint: providerFingerprint(company) } : {}) };
    if (company && (!company.exists || company.get('isActive') === false || company.get('deletedAt'))) return issue({ ...state, eligible: false, status: 'unavailable', reason: 'provider-unavailable', message: 'This provider is not available for new service requests.' });
    if (publicRequest && (!settings.configured || settings.acceptingNewCustomers !== true)) return issue({ ...state, ...evaluateCoverage(settings, null, input.serviceCategory, { publicRequest }) });
    // Unconfigured coverage is not an exemption from verifying a supplied address.
    // Addressless historical/contact-only records are preserved until one is entered.
    if (!settings.configured && !String(input.propertyAddress || '').trim()) return issue({ ...state, ...evaluateCoverage(settings, null, input.serviceCategory, { publicRequest }) });
    let property;
    try { property = await validateAddress({ companyId, uid: input.uid }, input.propertyAddress); }
    catch (error) {
      const addressValidation = addressValidationDetails(error), entered = typeof input.propertyAddress === 'string' ? input.propertyAddress.trim() : '';
      const safeText = entered.length > 0 && entered.length <= 278 && !/[<>\u0000-\u001f]/.test(entered);
      if (internalContinuationAllowed && safeText) {
        const categories = companyCategories(company?.data()).map(categoryKey), key = categoryKey(input.serviceCategory);
        if (settings.configured && settings.categoryOverrides?.length && (!key || !categories.includes(key))) return issue({ ...state, eligible: false, status: 'invalid-category', reason: 'service-category-required', message: 'Choose an offered service category before checking this property.' });
        const message = `${addressValidation.status === 'unavailable' ? 'Google address verification is unavailable.' : addressValidation.suggestedAddress ? 'Google suggests a different address.' : 'Google could not confirm this address.'} You can save this internal job using the entered address. Coverage and map location remain unverified.`;
        return issue({ ...state, eligible: false, status: 'address-unverified', reason: 'operator-entered-address-unverified', internalContinuation: true, message, addressValidation: { ...addressValidation, message, warningOnly: true } });
      }
      return issue({ ...state, eligible: false, status: 'invalid-address', reason: 'property-address-unvalidated', message: addressValidation.message, addressValidation });
    }
    const result = { ...state, ...evaluateCoverage(settings, property, input.serviceCategory, { categories: companyCategories(company?.data()), publicRequest }), property, propertyFingerprint: propertyFingerprint(property) };
    if (result.status === 'outside' && settings.allowOutOfAreaRequests && input.exceptionId) {
      const exception = await exceptionRef(input.exceptionId).get();
      if (exceptionValid(exception, company, { ...input, purpose }, result)) return issue({ ...result, eligible: true, status: 'exception-approved', reason: 'owner-approved-out-of-area', message: 'The company owner approved this service property outside coverage.', exceptionId: exception.id, exceptionExpiresAt: new Date(time(exception.get('expiresAt'))).toISOString() });
    }
    return issue(result);
  }
  async function assertWorkflowCurrent(tx, input) {
    const { companyId, result } = input;
    const internalContinuation = result?.internalContinuation === true && result.status === 'address-unverified' && result.eligible === false && input.purpose === 'scheduling' && input.publicRequest !== true;
    if (!result || issuedResults.get(result) !== hash(JSON.stringify(result)) || result.companyId !== (companyId || null) || !result.eligible && !internalContinuation || result.purpose !== input.purpose || result.serviceCategory !== categoryKey(input.serviceCategory) || ![result.requestAddressHash, hash(addressKey(result.property?.formattedAddress))].includes(hash(addressKey(input.propertyAddress)))) fail('failed-precondition', 'Recheck service coverage for this service property before saving.');
    if (!companyId) { if (['public-request', 'booking'].includes(input.purpose)) fail('failed-precondition', 'Provider coverage is not configured.'); return; }
    const [current, company] = await Promise.all([tx.get(policyRef(companyId)), tx.get(db.doc(`companies/${documentId(companyId)}`))]);
    if (current.exists !== result.policyExists || (current.get('revision') || 0) !== result.settingsRevision) fail('aborted', 'Service coverage changed. Recheck the service property before saving.');
    if (!company.exists || company.get('isActive') === false || company.get('deletedAt') || providerFingerprint(company) !== result.providerFingerprint) fail('aborted', 'The provider or service categories changed. Recheck the service property before saving.');
    if (result.exceptionId) {
      const exception = await tx.get(exceptionRef(result.exceptionId));
      if (current.get('allowOutOfAreaRequests') !== true || !exceptionValid(exception, company, { ...input, exceptionId: result.exceptionId }, result)) fail('failed-precondition', 'The owner’s out-of-area approval is no longer valid. Request a fresh approval.');
    }
  }
  async function handle(request) {
    const scope = await requireCapability(db, request, 'jobs.schedule'), data = request.data || {};
    if (!scope.companyId) fail('permission-denied', 'A company workspace is required for service areas.');
    if (data.companyId !== undefined && data.companyId !== scope.companyId) fail('permission-denied', 'Service-area settings belong to another company.');
    await rateLimit(db, 'service-area', scope.uid, 30, 60000, now());
    const target = policyRef(scope.companyId), company = scope.company, categories = companyCategories(company.data());
    if (data.action === 'status') return { settings: snapshot(await target.get()), availableCategories: categories, canManageSettings: ['owner', 'admin', 'manager'].includes(scope.role), canApproveExceptions: company.get('ownerId') === scope.uid };
    if (data.action === 'save') {
      if (!['owner', 'admin', 'manager'].includes(scope.role)) fail('permission-denied', 'Only an authorized company owner, administrator, or manager can change service areas.');
      if (!Number.isInteger(data.expectedRevision) || data.expectedRevision < 0) fail('invalid-argument', 'Refresh the current service-area settings before saving.');
      const clean = cleanSettings(data.settings, categories), before = await target.get();
      if ((before.get('revision') || 0) !== data.expectedRevision) fail('aborted', 'Service areas changed in another session. Refresh before saving.');
      const oldLocation = before.get('operatingLocation');
      const operatingLocation = addressKey(before.get('operatingAddress')) === addressKey(clean.operatingAddress) && finitePoint(oldLocation) ? trustedProperty(oldLocation, time(oldLocation.validatedAt) || now()) : await resolve(scope.companyId, clean.operatingAddress);
      const settings = await db.runTransaction(async tx => {
        const [current, liveCompany, liveMember] = await Promise.all([tx.get(target), tx.get(db.doc(`companies/${scope.companyId}`)), scope.role !== 'owner' && scope.memberId ? tx.get(db.doc(`teamMembers/${scope.memberId}`)) : Promise.resolve(null)]);
        if (!liveCompany.exists || (scope.role === 'owner' ? liveCompany.get('ownerId') !== scope.uid : !liveMember?.exists || liveMember.get('uid') !== scope.uid || liveMember.get('companyId') !== scope.companyId || liveMember.get('status') !== 'active' || liveMember.get('role') !== scope.role || !['admin', 'manager'].includes(liveMember.get('role')))) fail('permission-denied', 'Current company owner, administrator, or manager authorization is required.');
        cleanSettings(clean, companyCategories(liveCompany.data()));
        if ((current.get('revision') || 0) !== data.expectedRevision) fail('aborted', 'Service areas changed in another session. Refresh before saving.');
        const next = { ...clean, operatingLocation, configured: true, revision: data.expectedRevision + 1, createdAt: current.get('createdAt') || new Date(now()), updatedAt: new Date(now()), updatedBy: scope.uid };
        tx.set(target, next); tx.create(db.doc(`rlServiceAreaAudit/${randomUUID()}`), { companyId: scope.companyId, action: 'settings.save', revision: next.revision, actorId: scope.uid, createdAt: new Date(now()), settings: next }); return next;
      });
      return { settings, availableCategories: categories, canManageSettings: true, canApproveExceptions: company.get('ownerId') === scope.uid };
    }
    if (data.action === 'check' || data.action === 'approveException') {
      const input = { companyId: scope.companyId, propertyAddress: data.propertyAddress, serviceCategory: data.serviceCategory, purpose: data.purpose || 'scheduling', exceptionId: data.exceptionId, ...(data.action === 'check' && (!data.purpose || data.purpose === 'scheduling') ? { allowUnverifiedAddress: true } : {}) }, result = await checkForWorkflow(input);
      if (data.action === 'check') return { result };
      if (company.get('ownerId') !== scope.uid) fail('permission-denied', 'Only the company owner can approve an out-of-area property.');
      if (result.status !== 'outside') fail('failed-precondition', 'Only a validated property outside configured coverage can receive an exception.');
      const reason = typeof data.reason === 'string' ? data.reason.trim() : '';
      if (!reason || reason.length > 1000 || /[\u0000-\u001f]/.test(reason)) fail('invalid-argument', 'Record the reason for this explicit out-of-area approval.');
      const id = randomUUID(), createdAt = new Date(now()), expiresAt = new Date(now() + DAY);
      await db.runTransaction(async tx => {
        const [current, liveCompany] = await Promise.all([tx.get(target), tx.get(db.doc(`companies/${scope.companyId}`))]);
        if (liveCompany.get('ownerId') !== scope.uid) fail('permission-denied', 'Only the current company owner can approve an exception.');
        if (current.get('revision') !== result.settingsRevision) fail('aborted', 'Service coverage changed. Recheck before approving this property.');
        if (current.get('allowOutOfAreaRequests') !== true) fail('failed-precondition', 'Enable optional out-of-area approvals before granting an exception.');
        const exception = { companyId: scope.companyId, status: 'approved', settingsRevision: result.settingsRevision, propertyFingerprint: result.propertyFingerprint, serviceCategory: categoryKey(data.serviceCategory), purpose: input.purpose, property: result.property, reason, approvedByUid: scope.uid, createdAt, expiresAt };
        tx.create(exceptionRef(id), exception); tx.create(db.doc(`rlServiceAreaAudit/${randomUUID()}`), { companyId: scope.companyId, action: 'exception.approve', exceptionId: id, actorId: scope.uid, reason, settingsRevision: result.settingsRevision, createdAt });
      });
      return { exceptionId: id, expiresAt: expiresAt.toISOString(), result: { ...result, eligible: true, status: 'exception-approved', reason: 'owner-approved-out-of-area', message: 'The company owner approved this service property outside coverage.', exceptionId: id } };
    }
    fail('invalid-argument', 'Choose a supported service-area action.');
  }
  function publicEligibility(result) { return { eligible: result.eligible === true, status: result.status, message: result.message }; }
  return { handle, checkForWorkflow, assertWorkflowCurrent, publicEligibility, validateAddress };
}
module.exports = { serviceAreaHandlers, createGoogleGeocoder, DEFAULT_SETTINGS, cleanSettings, coverageRule, distanceMiles, evaluateCoverage, trustedProperty, propertyAddress, categoryKey, companyCategories, addressValidationDetails };
