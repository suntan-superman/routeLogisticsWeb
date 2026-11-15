const { test } = require('node:test');
const assert = require('node:assert/strict');
const { servicePropertySite, serviceAreaWorkflow, propertyAddress } = require('../functions/serviceAreaWorkflows');
const { projectJob } = require('../functions/workData');

const address = '101 Service Street, Example, CA 93301';
const property = { address, formattedAddress: address, postalCode: '93301', latitude: 35, longitude: -119, validated: true };

test('an explicit service property replaces conflicting legacy address and coordinates', () => {
  const site = servicePropertySite({ serviceProperty: property, address: 'Billing address', latitude: 0, longitude: 0 });
  assert.deepEqual(site, { address, city: '', state: '', zipCode: '93301', latitude: 35, longitude: -119, location: { latitude: 35, longitude: -119 } });
});

test('an explicit property without valid coordinates does not inherit another location', () => {
  for (const point of [{}, { latitude: 91, longitude: 0 }, { latitude: NaN, longitude: 0 }, { latitude: '35', longitude: '-119' }]) {
    const site = servicePropertySite({ serviceProperty: { address, ...point }, latitude: 0, longitude: 0, location: { latitude: 0, longitude: 0 } });
    assert.equal(site.address, address);
    assert.equal(site.latitude, null);
    assert.equal(site.longitude, null);
    assert.equal(site.location, null);
  }
});

test('explicit string and empty property snapshots remain authoritative', () => {
  assert.equal(servicePropertySite({ serviceProperty: address, address: 'Billing address' }).address, address);
  assert.equal(servicePropertySite({ serviceProperty: {}, address: 'Billing address' }).address, '');
});

test('legacy records without an explicit property retain their original location behavior', () => {
  assert.equal(servicePropertySite({ address, latitude: 35, longitude: -119 }), null);
  const job = projectJob('legacy-job', { address, latitude: 35, longitude: -119 }, 'manager');
  assert.equal(job.address, address);
  assert.equal(job.latitude, 35);
  assert.equal(job.longitude, -119);
});

test('all authorized workspace projections use explicit service-property coordinates', () => {
  for (const role of ['owner', 'admin', 'manager', 'technician']) {
    const job = projectJob('property-job', { serviceProperty: property, address: 'Billing address', latitude: 0, longitude: 0 }, role);
    assert.equal(job.address, address);
    assert.equal(job.latitude, 35);
    assert.equal(job.longitude, -119);
  }
});

test('workspace projections remove stale root coordinates when a property point is unavailable', () => {
  for (const role of ['owner', 'manager', 'technician']) {
    const job = projectJob('property-job', { serviceProperty: { address }, address: 'Billing address', latitude: 0, longitude: 0 }, role);
    assert.equal(job.address, address);
    assert(job.latitude == null);
    assert(job.longitude == null);
  }
});
test('legacy RPC addresses avoid duplicate locality text and partial edits validate the combined intended address', async () => {
  assert.equal(propertyAddress({ address, city: 'Example', state: 'CA', zipCode: '93301' }), address);
  let checked;
  const workflow = serviceAreaWorkflow({}, { serviceAreas: { checkForWorkflow: async input => { checked = input.propertyAddress; return { eligible: true, status: 'unconfigured', settingsRevision: 0, property: { formattedAddress: checked, latitude: 35, longitude: -119, postalCode: '93312' } }; } } });
  await workflow.prepare({ uid: 'solo-owner', role: 'owner', companyId: null }, { city: 'New City' }, { address: '100 Main Street', city: 'Old City', state: 'CA', zipCode: '93312' });
  assert.equal(checked, '100 Main Street, New City, CA, 93312');
  for (const input of [{ address: '' }, { serviceProperty: { address: '' } }]) await assert.rejects(workflow.prepare({ uid: 'owner', role: 'owner', companyId: 'company' }, input, { address }), error => error.code === 'failed-precondition' && error.details.addressValidation.status === 'invalid');
});
