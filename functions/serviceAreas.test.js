const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cleanSettings, distanceMiles, evaluateCoverage, createGoogleGeocoder, propertyAddress, trustedProperty } = require('./serviceAreas');
const point = { latitude: 35.4, longitude: -119, postalCode: '93312', countryCode: 'US', locationType: 'PREMISE', streetAddressVerified: true, formattedAddress: '100 Main Street, Bakersfield, CA 93312, USA' };
const input = { operatingAddress: point.formattedAddress, method: 'zip', zipCodes: ['93312'], radiusMiles: 10, categoryOverrides: [], acceptingNewCustomers: true };
const configured = { ...cleanSettings(input), configured: true, operatingLocation: point };
function response(overrides = {}) {
  const result = { verdict: { addressComplete: true, validationGranularity: 'PREMISE', geocodeGranularity: 'PREMISE' }, address: { formattedAddress: point.formattedAddress, postalAddress: { regionCode: 'US', postalCode: '93312-1234' }, addressComponents: [{ componentType: 'street_number', confirmationLevel: 'CONFIRMED' }, { componentType: 'route', confirmationLevel: 'CONFIRMED' }] }, geocode: { location: { latitude: point.latitude, longitude: point.longitude }, placeId: 'synthetic-place' } };
  return { ...result, ...overrides };
}
test('ZIP lists normalize ZIP+4, deduplicate and keep boundaries private by default', () => {
  const clean = cleanSettings({ ...input, zipCodes: ['93312-1234', '93312', '93301'] });
  assert.deepEqual(clean.zipCodes, ['93301', '93312']); assert.equal(clean.publishCoverage, false); assert.equal(clean.allowOutOfAreaRequests, false); assert.equal(clean.operatingLocation, undefined);
  assert.equal(evaluateCoverage({ ...configured, zipCodes: ['93312'] }, point, '').eligible, true);
  assert.equal(evaluateCoverage(configured, { ...point, postalCode: '93301' }, '').status, 'outside');
});
test('radius uses validated service coordinates, includes its boundary and rejects missing/invalid coordinates', () => {
  const second = { ...point, latitude: 35.5 }, miles = distanceMiles(point, second), area = { ...configured, method: 'radius', radiusMiles: miles };
  assert.equal(evaluateCoverage(area, second, '').eligible, true); assert.equal(evaluateCoverage({ ...area, radiusMiles: miles - 0.01 }, second, '').eligible, false);
  assert.equal(evaluateCoverage(area, { ...point, latitude: NaN }, '').status, 'invalid-address'); assert.throws(() => distanceMiles(point, { latitude: 91, longitude: 0 }));
});
test('category overrides narrow coverage and valid categories without overrides use the base policy', () => {
  const area = { ...configured, categoryOverrides: [{ serviceCategory: 'Pool Care', method: 'zip', zipCodes: ['93301'], radiusMiles: 5 }] }, options = { categories: ['Pest Control', 'Pool Care'] };
  assert.equal(evaluateCoverage(area, point, 'pool care', options).status, 'outside'); assert.equal(evaluateCoverage(area, point, ' PEST CONTROL ', options).eligible, true);
  for (const category of ['', 'unknown']) assert.equal(evaluateCoverage(area, point, category, options).status, 'invalid-category');
  assert.throws(() => cleanSettings({ ...input, categoryOverrides: [{ serviceCategory: 'Unknown', method: 'radius', radiusMiles: 5 }] }, options.categories), { code: 'invalid-argument' });
});
test('unconfigured internal workflows preserve legacy behavior while future public requests fail safely', () => {
  assert.equal(evaluateCoverage(null, null, '').eligible, true); assert.equal(evaluateCoverage(null, null, '', { publicRequest: true }).eligible, false);
  assert.equal(evaluateCoverage({ ...configured, acceptingNewCustomers: false }, point, '', { publicRequest: true }).status, 'not-accepting');
  assert.equal(evaluateCoverage({ ...configured, acceptingNewCustomers: false }, point, '').eligible, true);
});
test('invalid ZIPs, radii, addresses and client coordinate flags cannot form trusted settings', () => {
  for (const update of [{ zipCodes: ['9331'] }, { zipCodes: [] }, { method: 'radius', radiusMiles: 0 }, { method: 'radius', radiusMiles: 301 }, { operatingAddress: 'P.O. Box 123, Bakersfield, CA 93312' }, { operatingAddress: 'x'.repeat(279) }]) assert.throws(() => cleanSettings({ ...input, ...update }), { code: 'invalid-argument' });
  const clean = cleanSettings({ ...input, eligible: true, operatingLocation: { latitude: 0, longitude: 0 } }); assert.equal(clean.eligible, undefined); assert.equal(clean.operatingLocation, undefined);
  assert.throws(() => propertyAddress({ address: '100 Main Street' }), { code: 'invalid-argument' });
});
test('Google Address Validation uses server OAuth without exposing credentials or putting them in URLs', async () => {
  let calls = 0;
  const validate = createGoogleGeocoder({ getAccessToken: async () => 'synthetic-oauth-token', fetchImpl: async (url, options) => {
    calls++; assert.equal(url, 'https://addressvalidation.googleapis.com/v1:validateAddress'); assert.equal(options.method, 'POST'); assert.equal(options.headers.Authorization, 'Bearer synthetic-oauth-token'); assert.equal(options.headers['X-Goog-User-Project'], 'mi-factotum-field-service'); assert.deepEqual(JSON.parse(options.body), { address: { regionCode: 'US', addressLines: [point.formattedAddress] } }); return { ok: true, json: async () => ({ result: response() }) };
  } });
  const result = await validate(point.formattedAddress); assert.equal(calls, 1); assert.equal(result.postalCode, '93312'); assert.equal(result.source, 'google-address-validation'); assert.equal(JSON.stringify(result).includes('synthetic-oauth-token'), false);
});
test('Google validation fails closed on incomplete, approximate, uncertain or replaced street addresses', async () => {
  const invalid = [response({ verdict: { addressComplete: false, validationGranularity: 'PREMISE', geocodeGranularity: 'PREMISE' } }), response({ verdict: { addressComplete: true, validationGranularity: 'PREMISE', geocodeGranularity: 'LOCALITY' } }), response({ verdict: { addressComplete: true, validationGranularity: 'PREMISE', geocodeGranularity: 'PREMISE', hasUnconfirmedComponents: true } })];
  for (const field of ['missingComponentTypes', 'unconfirmedComponentTypes', 'unresolvedTokens']) { const row = response(); row.address[field] = ['street_number']; invalid.push(row); }
  for (const flag of ['inferred', 'replaced']) { const row = response(); row.address.addressComponents[0][flag] = true; invalid.push(row); }
  const wrongCountry = response(); wrongCountry.address.postalAddress.regionCode = 'CA'; invalid.push(wrongCountry);
  for (const result of invalid) await assert.rejects(createGoogleGeocoder({ getAccessToken: async () => 'synthetic', fetchImpl: async () => ({ ok: true, json: async () => ({ result }) }) })(point.formattedAddress), { code: 'failed-precondition' });
});
test('noncritical ZIP suffix inference is allowed but invalid provider responses and provider failures stay sanitized', async () => {
  const row = response(); row.verdict.hasInferredComponents = true; row.address.addressComponents.push({ componentType: 'postal_code_suffix', confirmationLevel: 'CONFIRMED', inferred: true });
  const validate = createGoogleGeocoder({ getAccessToken: async () => 'synthetic', fetchImpl: async () => ({ ok: true, json: async () => ({ result: row }) }) }); assert.equal((await validate(point.formattedAddress)).postalCode, '93312');
  await assert.rejects(createGoogleGeocoder({ getAccessToken: async () => 'PRIVATE TOKEN', fetchImpl: async () => { throw Error('PRIVATE TOKEN provider body'); } })(point.formattedAddress), error => error.code === 'unavailable' && !error.message.includes('PRIVATE'));
  await assert.rejects(createGoogleGeocoder()(point.formattedAddress), { code: 'unavailable' });
  assert.throws(() => trustedProperty({ ...point, longitude: Infinity }, Date.now()), { code: 'failed-precondition' });
});
