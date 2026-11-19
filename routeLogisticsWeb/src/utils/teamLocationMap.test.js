import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentOrNextJob, serviceAddress, serviceVehicleMarkerElement, teamLocationPopupElement } from './teamLocationMap.js';

class FakeNode {
  constructor(tag) { this.tag = tag; this.children = []; this.style = {}; this.dataset = {}; this.attributes = {}; this._text = ''; this.innerHTML = ''; }
  appendChild(child) { this.children.push(child); return child; }
  setAttribute(name, value) { this.attributes[name] = value; }
  set textContent(value) { this._text = String(value); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(''); }
}
const documentRef = { createElement: tag => new FakeNode(tag) };
const location = { memberId: 'tech-1', userId: 'uid-1', name: 'Luis Gonzales', lat: 35.1, lng: -119.1, accuracy: 12, capturedAt: '2026-11-19T16:00:00.000Z' };

test('current work takes priority over the next scheduled job and stays scoped to the selected staff identity', () => {
  const jobs = [
    { id: 'other', assignedTo: 'tech-2', status: 'in-progress', customerName: 'Other staff job', date: '2026-11-19', time: '08:00' },
    { id: 'next', assignedTo: 'tech-1', status: 'scheduled', customerName: 'Next Customer', date: '2026-11-19', time: '10:00' },
    { id: 'current', assignedToUid: 'uid-1', status: 'in-progress', customerName: 'Current Customer', date: '2026-11-19', time: '09:00' },
  ];
  const assignment = currentOrNextJob(location, jobs);
  assert.equal(assignment.kind, 'current'); assert.equal(assignment.job.id, 'current');
  assert.equal(currentOrNextJob(location, jobs.filter(job => job.id !== 'current')).job.id, 'next');
});

test('vehicle marker and popup provide accessible staff, GPS and service-stop detail without reverse geocoding', () => {
  const marker = serviceVehicleMarkerElement(location, 'live', documentRef);
  assert.equal(marker.dataset.markerType, 'service-vehicle'); assert.match(marker.attributes['aria-label'], /Luis Gonzales service vehicle/); assert.match(marker.innerHTML, /<svg/);
  const job = { customerName: 'Drew Brees', serviceType: 'Pest inspection', time: '09:00', address: '4500 Stockdale Hwy', city: 'Bakersfield', state: 'CA', zipCode: '93309' };
  const popup = teamLocationPopupElement({ location, assignment: { kind: 'next', job }, stateLabel: 'Current GPS location' }, documentRef);
  assert.match(popup.textContent, /Luis Gonzales/); assert.match(popup.textContent, /Next job/); assert.match(popup.textContent, /Drew Brees/); assert.match(popup.textContent, /Service address: 4500 Stockdale Hwy, Bakersfield, CA, 93309/);
  assert.equal(serviceAddress(job), '4500 Stockdale Hwy, Bakersfield, CA, 93309');
});
