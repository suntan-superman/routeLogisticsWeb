const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeJobLocation, jobDestination, formatAppointment } = require('../services/workPresentation');

test('home appointment labels keep company-local dates and identify the configured time zone', () => {
  assert.match(formatAppointment({ date: '2026-11-25', time: '09:00' }, 'America/Los_Angeles', 'en-US'), /Wed, Nov 25, 2026 · 9:00 AM PST/);
  assert.match(formatAppointment({ date: '2026-07-25', time: '09:00' }, 'America/Los_Angeles', 'en-US'), /Sat, Jul 25, 2026 · 9:00 AM PDT/);
  assert.match(formatAppointment({ date: '2026-11-25', time: '09:00' }, 'America/New_York', 'en-US'), /Wed, Nov 25, 2026 · 9:00 AM EST/);
  assert.equal(formatAppointment({ date: '2026-11-25', time: '' }, 'America/Los_Angeles', 'en-US'), 'Wed, Nov 25, 2026 · Time not set');
});

test('legacy object service addresses are normalized without using a different customer location', () => {
  const job = { id: 'job', companyId: 'acme', address: { street: '3 Service Street', city: 'Bakersfield', state: 'CA', zipCode: '93312' }, status: 'scheduled' };
  const result = normalizeJobLocation(job, { address: { street: '9 Billing Street', city: 'Other city' }, phoneNumber: '555-0100', latitude: 40, longitude: -100 });
  assert.equal(job.address.street, '3 Service Street');
  assert.equal(jobDestination(result), '3 Service Street, Bakersfield, CA, 93312');
  assert.equal(result.customerPhone, '555-0100');
  assert.equal(result.latitude, undefined);
});

test('safe authorized customer details restore missing location/contact without copying private fields', () => {
  const result = normalizeJobLocation({ id: 'job', companyId: 'acme', assignedTo: 'technician' }, {
    firstName: 'Field', lastName: 'Customer', address: { line1: '1 Field Street', city: 'Bakersfield', state: 'CA', zipCode: '93312' },
    phone: '555-0101', serviceInstructions: 'Use the side gate.', latitude: 35, longitude: -119,
    id: 'customer', email: 'private@example.com', totalRevenue: 9999, role: 'owner', companyId: 'other', assignedTo: 'another', notes: 'Private billing note',
  });
  assert.equal(result.id, 'job'); assert.equal(result.companyId, 'acme'); assert.equal(result.assignedTo, 'technician');
  assert.equal(result.customerName, 'Field Customer'); assert.equal(result.customerPhone, '555-0101'); assert.equal(result.serviceInstructions, 'Use the side gate.');
  assert.equal(jobDestination(result), '35,-119'); assert.equal(result.address, '1 Field Street');
  for (const field of ['email', 'totalRevenue', 'role', 'notes']) assert.equal(result[field], undefined);
});

test('existing service address, coordinates, contact and work data retain priority', () => {
  const result = normalizeJobLocation({ id: 'job', address: '2 Job Street', customerPhone: '555-0200', latitude: 34, longitude: -118, workNotes: 'Observed activity' },
    { address: { street: '3 Customer Street', city: 'Different city' }, phone: '555-0100', latitude: 35, longitude: -119 });
  assert.equal(result.address, '2 Job Street'); assert.equal(result.city, ''); assert.equal(result.customerPhone, '555-0200');
  assert.equal(jobDestination(result), '34,-118'); assert.equal(result.workNotes, 'Observed activity');
});

test('selected service-property snapshot controls address, unit access and navigation instead of billing defaults',()=>{
 const original={id:'estimate',appointmentKind:'estimate_visit',servicePropertyId:'rental',address:'9 Old Billing Street',city:'Billing City',latitude:40,longitude:-100,serviceProperty:{address:'22 Rental Street, Bakersfield, CA',label:'Rental',unit:'B',latitude:35,longitude:-119},propertyAccessInstructions:'Enter gate 2468'};
 const normalized=normalizeJobLocation(original,{address:'99 New Billing Street',city:'Another City',latitude:42,longitude:-101,serviceInstructions:'Wrong property code'});
 assert.equal(normalized.address,original.serviceProperty.address);assert.equal(normalized.city,'');assert.equal(normalized.serviceInstructions,'');assert.equal(normalized.propertyAccessInstructions,'Enter gate 2468');assert.equal(normalized.serviceProperty.unit,'B');assert.equal(jobDestination(normalized),'35,-119');assert.equal(original.address,'9 Old Billing Street');
});

test('unmapped selected property navigates by its own address without stale customer or job coordinates',()=>{
 const normalized=normalizeJobLocation({id:'estimate',servicePropertyId:'rental',latitude:40,longitude:-100,address:'Wrong old street',serviceProperty:{address:'Correct rental address'}},{address:'Billing address',latitude:42,longitude:-101});
 assert.equal(normalized.latitude,undefined);assert.equal(normalized.longitude,undefined);assert.equal(jobDestination(normalized),'Correct rental address');
});
