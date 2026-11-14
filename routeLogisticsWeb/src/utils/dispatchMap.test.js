import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addressKey, mapPoint, createDispatchAddressResolver } from './dispatchMap.js';

const job = (address, extra = {}) => ({ id: address, address, ...extra });
function provider(response) {
  const requests = [], imports = [];
  return { requests, imports, load: async () => ({ importLibrary: async library => { imports.push(library); assert.equal(library, 'routes'); return { Route: { computeRoutes: async request => { requests.push(request); return typeof response === 'function' ? response(request) : response; } } }; } }) };
}

test('Maps point normalization supports literals, DirectionalLocation getters, LatLng methods and rejects invalid values', () => {
  assert.deepEqual(mapPoint({ lat: 35, lng: -119 }), { lat: 35, lng: -119 });
  assert.deepEqual(mapPoint({ lat() { return this.latitude; }, lng() { return this.longitude; }, latitude: 35, longitude: -119 }), { lat: 35, lng: -119 });
  assert.deepEqual(mapPoint({ toJSON: () => ({ lat: 35, lng: -119 }) }), { lat: 35, lng: -119 });
  for (const point of [null, {}, { lat: null, lng: null }, { lat: 91, lng: 0 }, { lat: 0, lng: Infinity }]) assert.equal(mapPoint(point), null);
});

test('coordinate jobs bypass paid address requests and duplicate addresses share cached points across polls', async () => {
  const api = provider({ routes: [{ legs: [{ startLocation: { lat: () => 35, lng: () => -119 }, endLocation: { lat: 35.1, lng: -119.1 } }] }] });
  const resolver = createDispatchAddressResolver(api.load);
  const known = job('Known', { latitude: 36, longitude: -120 });
  await resolver.resolve([known]); assert.equal(api.imports.length, 0); assert.equal(api.requests.length, 0);
  const jobs = [known, job('1 Main Street'), job('  1   main street  '), job('2 Field Road')];
  const result = await resolver.resolve(jobs);
  assert.equal(api.requests.length, 1); assert.equal(result.processed, 2); assert.equal(result.pending, 0); assert.equal(result.failed, 0);
  assert.deepEqual(result.points[addressKey('1 Main Street')], { lat: 35, lng: -119 });
  assert.deepEqual(result.points[addressKey('2 Field Road')], { lat: 35.1, lng: -119.1 });
  await resolver.resolve(jobs.map(row => ({ ...row, status: 'completed' }))); assert.equal(api.requests.length, 1);
});

test('single-address lookup uses a real existing anchor and takes the destination location', async () => {
  const api = provider({ routes: [{ legs: [{ startLocation: { lat: 34, lng: -118 }, endLocation: { lat: () => 35, lng: () => -119 } }] }] });
  const result = await createDispatchAddressResolver(api.load).resolve([job('Single address')], { anchor: { lat: 34, lng: -118 } });
  assert.deepEqual(api.requests[0].origin, { lat: 34, lng: -118 }); assert.equal(api.requests[0].destination, 'Single address');
  assert.deepEqual(result.points[addressKey('Single address')], { lat: 35, lng: -119 });
});

test('same-address zero results never invent coordinates and only explicit retry repeats the request', async () => {
  let succeeds = false;
  const api = provider(() => succeeds ? { routes: [{ legs: [], path: [{ lat: 35, lng: -119 }] }] } : { routes: [] });
  const resolver = createDispatchAddressResolver(api.load), jobs = [job('Only service address')];
  const failure = await resolver.resolve(jobs); assert.equal(failure.failed, 1); assert.deepEqual(failure.points, {}); assert.match(failure.error, /could not be located/);
  await resolver.resolve(jobs.map(row => ({ ...row }))); assert.equal(api.requests.length, 1);
  succeeds = true; const retried = await resolver.resolve(jobs, { retry: true });
  assert.equal(api.requests.length, 2); assert.deepEqual(retried.points[addressKey(jobs[0].address)], { lat: 35, lng: -119 }); assert.equal(retried.failed, 0);
});

test('each lookup handles at most 25 unique addresses and preserves intermediate order', async () => {
  const api = provider(request => {
    const addresses = [request.origin, ...request.intermediates.map(row => row.location), request.destination];
    return { routes: [{ legs: addresses.slice(1).map((_address, i) => ({ startLocation: { lat: 35 + i / 1000, lng: -119 }, endLocation: { lat: 35 + (i + 1) / 1000, lng: -119 } })) }] };
  });
  const resolver = createDispatchAddressResolver(api.load), jobs = Array.from({ length: 30 }, (_value, i) => job(`Service address ${i}`));
  const first = await resolver.resolve(jobs); assert.equal(first.processed, 25); assert.equal(first.pending, 5); assert.equal(api.requests[0].intermediates.length, 23);
  const second = await resolver.resolve(jobs); assert.equal(second.processed, 5); assert.equal(second.pending, 0); assert.equal(Object.keys(second.points).length, 30);
});

test('cancelled asynchronous lookup cannot publish stale results and cache prevents a repeated paid request', async () => {
  let resolve, active = true;
  const api = provider(() => new Promise(done => { resolve = done; }));
  const resolver = createDispatchAddressResolver(api.load), jobs = [job('1 First Street'), job('2 Second Street')];
  const pending = resolver.resolve(jobs, { isCurrent: () => active });
  for (let i = 0; i < 5 && !resolve; i++) await Promise.resolve();
  assert.equal(api.requests.length, 1); active = false;
  resolve({ routes: [{ legs: [{ startLocation: { lat: 35, lng: -119 }, endLocation: { lat: 35.1, lng: -119.1 } }] }] });
  assert.equal((await pending).cancelled, true);
  const reused = await resolver.resolve(jobs); assert.equal(api.requests.length, 1); assert.equal(reused.processed, 0); assert.equal(Object.keys(reused.points).length, 2);
});
