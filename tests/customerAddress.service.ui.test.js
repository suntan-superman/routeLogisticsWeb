const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), { createRequire } = require('node:module');
const web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const { transformSync } = web('esbuild');
let calls, failure, authenticated, companyId, permitted, matchResult;
const firebaseFunctions = new Set(['collection','doc','getDoc','updateDoc','getDocs','query','deleteDoc','orderBy','limit','startAfter','documentId']);
const trap = name => () => { throw Error(`Customer mutation must not use client Firestore ${name}.`); };
const cache = new Map();
function load(relative) {
  if (cache.has(relative)) return cache.get(relative);
  const file = path.resolve(__dirname, '../routeLogisticsWeb/src', relative), module = { exports: {} };
  const resolve = name => {
    if (name === 'firebase/firestore') return Object.fromEntries([...firebaseFunctions].map(key => [key, trap(key)]));
    if (name === './workspaceApi') return { readWorkspace: trap('readWorkspace'), callWorkspace: async (endpoint, data) => {
      calls.push({ endpoint, data }); if (failure) throw failure;
      if (endpoint === 'rlManageInquiry') return matchResult;
      return { id: data.id || 'server-customer', updatedAt: '2026-11-15T18:00:00.000Z', customer: { id: data.id || 'server-customer', ...data.customer, updatedAt: '2026-11-15T18:00:00.000Z' } };
    } };
    if (name === './firebase') return { db: {}, auth: { get currentUser() { return authenticated ? { uid: 'actor' } : null; } } };
    if (name === './tenancy') return { getClaims: () => ({ companyId }), requireCapability: capability => { assert.equal(capability, 'customers.manage'); if (!permitted) throw Error('Customer management is denied.'); } };
    if (name.startsWith('.')) {
      const full = path.resolve(path.dirname(file), name + (path.extname(name) ? '' : '.js'));
      return load(path.relative(path.resolve(__dirname, '../routeLogisticsWeb/src'), full));
    }
    throw Error('Unexpected dependency ' + name);
  };
  new Function('require','module','exports',transformSync(fs.readFileSync(file,'utf8'),{loader:'js',format:'cjs'}).code)(resolve,module,module.exports);
  cache.set(relative,module.exports); return module.exports;
}
const Service = load('services/customerService.js').default;
beforeEach(() => { calls=[];failure=null;authenticated=true;companyId='company';permitted=true;matchResult={matches:[],hasMore:false}; });

test('customer directory search uses the tenant-authorized backend instead of the first list page', async () => {
  matchResult = { matches: [{ customer: { id: 'outside-first-page', name: 'Stan Roy', email: 'sroy@prologixsa.com', isActive: true }, matchReasons: ['name', 'email'] }], hasMore: false };
  const result = await Service.searchCustomers('  Stan Roy  ');
  assert.equal(result.success, true);
  assert.equal(result.customers[0].id, 'outside-first-page');
  assert.deepEqual(calls, [{ endpoint: 'rlManageInquiry', data: { action: 'matches', query: 'Stan Roy' } }]);
  permitted = false;
  assert.equal((await Service.searchCustomers('Stan Roy')).success, false);
  assert.equal(calls.length, 1, 'An unauthorized search must not reach the backend');
});

for (const workspace of ['company',null]) test(`customer create uses server validation in ${workspace || 'solo'} workspace and omits untrusted fields`, async () => {
  companyId=workspace;
  const result=await Service.createCustomer({name:'Synthetic contact',address:'A typed property',city:'City',latitude:0,longitude:0,location:{lat:0,lng:0},companyId:'foreign',userId:'foreign',eligible:true,validated:true});
  assert.equal(result.success,true);assert.equal(result.customerId,'server-customer');assert.equal(calls.length,1);
  assert.equal(calls[0].endpoint,'rlManageCustomer');assert.equal(calls[0].data.action,'create');
  assert.deepEqual(calls[0].data.customer,{name:'Synthetic contact',address:'A typed property',city:'City'});
});

test('customer update sends the captured revision without a fresh read or separate client write',async()=>{
  const result=await Service.updateCustomer('selected-customer',{name:'Edited contact',address:'A new property'},'captured-original-version');
  assert.equal(result.success,true);assert.equal(calls.length,1);
  assert.deepEqual(calls[0],{endpoint:'rlManageCustomer',data:{action:'update',id:'selected-customer',customer:{name:'Edited contact',address:'A new property'},expectedVersion:'captured-original-version'}});
  assert.equal(result.customer.updatedAt,'2026-11-15T18:00:00.000Z');
});

test('address confirmation details survive the service boundary and no fallback write is attempted',async()=>{
  const addressValidation={status:'confirmation-required',message:'Review the suggested address.',suggestedAddress:'1600 Amphitheatre Parkway, Mountain View, CA 94043'};
  failure=Object.assign(Error(addressValidation.message),{details:{addressValidation}});
  const result=await Service.createCustomer({name:'Synthetic contact',address:'Unconfirmed property'});
  assert.deepEqual(result,{success:false,error:addressValidation.message,addressValidation});assert.equal(calls.length,1);
});

test('invalid/unavailable validation and stale customer errors retain actionable details without losing the draft payload',async()=>{
  for (const status of ['invalid','unavailable']) {
    const addressValidation={status,message:`Address ${status}.`};failure=Object.assign(Error(addressValidation.message),{details:{addressValidation}});
    const draft={address:'Retained typed property'};
    const result=await Service.updateCustomer('selected',draft,null);
    assert.equal(result.success,false);assert.deepEqual(result.addressValidation,addressValidation);assert.deepEqual(draft,{address:'Retained typed property'});
  }
  failure=Error('The customer changed. Reload before saving.');
  const stale=await Service.updateCustomer('selected',{name:'Retained name'},'old-version');
  assert.equal(stale.success,false);assert.match(stale.error,/customer changed/);assert.equal(stale.addressValidation,undefined);
});

test('customer mutations require an authenticated authorized caller before contacting the server',async()=>{
  authenticated=false;assert.equal((await Service.createCustomer({name:'Synthetic'})).success,false);assert.equal(calls.length,0);
  authenticated=true;permitted=false;assert.equal((await Service.updateCustomer('selected',{name:'Synthetic'},null)).success,false);assert.equal(calls.length,0);
});
