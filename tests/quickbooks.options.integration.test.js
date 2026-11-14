const { test: nodeTest, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const req = require('node:module').createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { quickBooksHandlers, mappingId } = require('../functions/quickbooks');
const { hash } = require('../functions/security');
let app, db, sequence = 0;
const test = (name, run) => nodeTest(name, { timeout: 30000 }, run);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

before(() => {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('Local emulator required; production access is prohibited.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'qb-options-tests'); db = getFirestore(app);
});
after(async () => { if (app) await deleteApp(app); });

async function fixture() {
  const prefix = `qb-options-${++sequence}`, identities = {}, calls = [], gates = {};
  const env = { queryStatus: null, verifyStatus: null, refreshFailure: false, malformedQuery: false, nullQuery: false, nullCollection: false, invalidJson: false, networkFailure: false, account: {}, item: {}, accounts: null, items: null, refreshCount: 0 };
  const config = { enabled: () => true, environment: () => 'sandbox', credentialEnvironment: () => 'sandbox', productionApproved: () => false, writesEnabled: () => false, clientId: () => 'fixture-options-platform-client', clientSecret: () => 'fixture-options-platform-secret' };
  const connection = tenant => db.doc(`rlQuickBooksConnections/${mappingId(identities[tenant].companyId, 'sandbox', 'connection', 'current')}`);
  const request = (tenant, data = {}) => ({ auth: identities[tenant].auth, data });
  const transport = async (url, options) => {
    const parsed = new URL(url);
    calls.push({ url, method: options.method, body: options.body, authorization: options.headers.Authorization });
    if (parsed.pathname.includes('/tokens/bearer')) {
      env.refreshCount++;
      if (env.refreshFailure) return { ok: false, status: 400, json: async () => ({ error: 'invalid_grant', error_description: 'fixture-options-provider-private-detail' }) };
      return { ok: true, json: async () => ({ access_token: 'fixture-options-rotated-access', refresh_token: 'fixture-options-rotated-refresh', expires_in: 3600, x_refresh_token_expires_in: 8640000 }) };
    }
    assert.equal(parsed.hostname, 'sandbox-quickbooks.api.intuit.com');
    const match = parsed.pathname.match(/\/v3\/company\/(\d+)\/(\w+)(?:\/(\d+))?/), realm = match?.[1], endpoint = match?.[2], id = match?.[3];
    const tenant = Object.values(identities).find(row => row.realm === realm);
    assert.ok(tenant, 'Only one of the controlled tenant realms can be queried.');
    const current = (await connection(tenant.label).get()).data();
    assert.equal(options.headers.Authorization, 'Bearer ' + current.accessToken, 'Provider request uses the same tenant connection as its realm URL.');
    if (endpoint === 'query') {
      if (gates.query) await gates.query();
      if (env.networkFailure) throw Error('fixture-options-provider-private-detail');
      if (env.queryStatus) return { ok: false, status: env.queryStatus, json: async () => ({ error_description: 'fixture-options-provider-private-detail' }) };
      if (env.invalidJson) return { ok: true, json: async () => { throw Error('fixture-options-provider-private-detail'); } };
      if (env.malformedQuery) return { ok: true, json: async () => ({ QueryResponse: { Account: { Id: '1' }, Item: { Id: '2' } } }) };
      if (env.nullQuery) return { ok: true, json: async () => null };
      if (env.nullCollection) return { ok: true, json: async () => ({ QueryResponse: { Account:null, Item:null } }) };
      const query = parsed.searchParams.get('query') || '', entity = /\bFROM\s+Account\b/i.test(query) ? 'Account' : /\bFROM\s+Item\b/i.test(query) ? 'Item' : null;
      assert.ok(entity, 'Only read-only Account and Item queries are permitted.');
      assert.match(query, /\bActive\s*=\s*true\b/i);
      if (entity === 'Account') { assert.match(query, /Income/); assert.match(query, /Other Income/); }
      else assert.match(query, /\bType\s*=\s*'Service'/i);
      const accounts = env.accounts || [{ Id:'21', Name:`${tenant.label} Services`, FullyQualifiedName:`${tenant.label} Revenue:Services`, AccountType:'Income', AcctNum:'4100', Active:true, privateField:'fixture-options-provider-private-detail' }, { Id:'22', Name:`${tenant.label} Adjustments`, AccountType:'Other Income', Active:true }];
      const items = env.items || [{ Id:'31', Name:`${tenant.label} Pest control`, FullyQualifiedName:`${tenant.label} Services:Pest control`, Description:'Scheduled pest treatment', Type:'Service', Active:true, privateField:'fixture-options-provider-private-detail' }];
      const start = Number(query.match(/\bSTARTPOSITION\s+(\d+)/i)?.[1] || 1), limit = Number(query.match(/\bMAXRESULTS\s+(\d+)/i)?.[1] || 1000), page = (entity === 'Account' ? accounts : items).slice(start-1,start-1+limit);
      return { ok:true, json:async () => ({ QueryResponse:{ ...(page.length ? { [entity]:page } : {}), startPosition:start, maxResults:page.length } }) };
    }
    const entity = endpoint === 'account' ? 'Account' : endpoint === 'item' ? 'Item' : null;
    assert.ok(entity, 'Only account or service-item verification may occur.');
    if (gates.verify) await gates.verify();
    if (env.verifyStatus) return { ok:false, status:env.verifyStatus, json:async()=>({error_description:'fixture-options-provider-private-detail'}) };
    const data = entity === 'Account' ? { Id:id, Name:`${tenant.label} Income`, Active:true, AccountType:'Income', ...env.account } : { Id:id, Name:`${tenant.label} Service`, Active:true, Type:'Service', ...env.item };
    return { ok:true, json:async () => ({ [entity]:data }) };
  };
  for (const [label, index] of [['A',1],['B',2]]) {
    const companyId = `${prefix}-${label}`, uid = `${companyId}-owner`, realm = String(200000+sequence*10+index);
    identities[label] = { label, companyId, uid, realm, auth:{ uid, token:{ companyId, role:'owner', email_verified:true } } };
    await db.doc(`companies/${companyId}`).set({ ownerId:uid });
    await connection(label).set({ companyId, environment:'sandbox', realmId:realm, credentialEnvironment:'sandbox', credentialHash:hash('sandbox:fixture-options-platform-client'), connected:true, connectionId:`${companyId}-connection`, accessToken:`fixture-options-${label}-access`, refreshToken:`fixture-options-${label}-refresh`, accessExpiresAt:Date.now()+3600000, refreshExpiresAt:Date.now()+86400000, refreshLeaseUntil:0, incomeAccountId:'21', defaultItemId:'31', connectedAt:new Date() });
  }
  return { prefix, env, config, identities, calls, gates, connection, request, handlers:quickBooksHandlers(db,config,transport) };
}

test('owner receives friendly active accounting options without provider private fields or credentials', async () => {
  const f = await fixture(), result = await f.handlers.options(f.request('A'));
  assert.deepEqual(result.accounts.map(row=>row.name), ['A Adjustments','A Services']);
  assert.deepEqual(result.items.map(row=>row.name), ['A Pest control']);
  assert.equal(result.accounts.find(row=>row.id==='21').qualifiedName,'A Revenue:Services');
  assert.equal(result.accounts.find(row=>row.id==='21').accountType,'Income');
  assert.equal(result.accounts.find(row=>row.id==='21').accountNumber,'4100');
  assert.equal(result.items[0].description,'Scheduled pest treatment');
  assert.equal(result.incomeAccountId,'21'); assert.equal(result.defaultItemId,'31');
  assert.equal(result.connectionId,(await f.connection('A').get()).get('connectionId'));
  assert.doesNotMatch(JSON.stringify(result),/fixture-options|accessToken|refreshToken|privateField/);
  assert.ok(f.calls.every(row=>row.method==='GET'),'Dropdown loading cannot create or update provider records.');
});

test('request data cannot substitute another tenant realm or accounting connection', async () => {
  const f = await fixture(), a = await f.handlers.options(f.request('A',{companyId:f.identities.B.companyId,realmId:f.identities.B.realm}));
  assert.ok(a.accounts.every(row=>row.name.startsWith('A '))); assert.ok(f.calls.every(row=>row.url.includes('/company/'+f.identities.A.realm+'/')));
  f.calls.length=0; const b=await f.handlers.options(f.request('B')); assert.ok(b.items.every(row=>row.name.startsWith('B '))); assert.ok(f.calls.every(row=>row.url.includes('/company/'+f.identities.B.realm+'/')));
});

test('forged foreign owner claims and unauthenticated requests cannot load accounting options', async () => {
  const f = await fixture();
  await assert.rejects(f.handlers.options({auth:{uid:f.identities.A.uid,token:f.identities.B.auth.token},data:{}}),{code:'permission-denied'});
  await assert.rejects(f.handlers.options({data:{}}),{code:'unauthenticated'});
  assert.equal(f.calls.length,0);
});

test('active administrators, managers and technicians cannot load or alter owner accounting defaults', async () => {
  const f = await fixture();
  for(const role of ['admin','manager','technician']) {
    const companyId=f.identities.A.companyId,uid=`${companyId}-${role}`,membershipId=uid;
    await db.doc(`teamMembers/${membershipId}`).set({companyId,uid,role,status:'active'});
    const request={auth:{uid,token:{companyId,membershipId,role,email_verified:true}},data:{incomeAccountId:'21',defaultItemId:'31'}};
    await assert.rejects(f.handlers.options(request),{code:'permission-denied'});
    await assert.rejects(f.handlers.settings(request),{code:'permission-denied'});
  }
  assert.equal(f.calls.length,0);
});

test('owner saves validated provider IDs while preserving OAuth credentials and other tenant defaults', async () => {
  const f=await fixture(),before=(await f.connection('A').get()).data(),other=(await f.connection('B').get()).data();
  const result=await f.handlers.settings(f.request('A',{incomeAccountId:'24',defaultItemId:'34',companyId:f.identities.B.companyId}));
  assert.equal(result.saved,true);assert.equal(result.incomeAccountId,'24');assert.equal(result.defaultItemId,'34');assert.equal(result.incomeAccountName,'A Income');assert.equal(result.defaultItemName,'A Service');assert.equal(result.connectionId,before.connectionId);
  const after=(await f.connection('A').get()).data();
  assert.equal(after.incomeAccountId,'24');assert.equal(after.defaultItemId,'34');assert.equal(after.accessToken,before.accessToken);assert.equal(after.refreshToken,before.refreshToken);assert.equal(after.connectionId,before.connectionId);
  assert.deepEqual((await f.connection('B').get()).data(),other);assert.ok(f.calls.every(row=>row.method==='GET'));
});

test('unavailable, wrong-type, inactive and mismatched provider selections cannot replace saved defaults', async () => {
  const f=await fixture();
  for(const invalid of [{account:{Active:false}},{account:{Active:undefined}},{account:{AccountType:'Bank'}},{account:{Id:'999'}},{item:{Active:false}},{item:{Active:undefined}},{item:{Type:'Inventory'}},{item:{Id:'999'}}]) {
    f.env.account=invalid.account||{};f.env.item=invalid.item||{};
    await assert.rejects(f.handlers.settings(f.request('A',{incomeAccountId:'24',defaultItemId:'34'})));
    const saved=(await f.connection('A').get()).data();assert.equal(saved.incomeAccountId,'21');assert.equal(saved.defaultItemId,'31');
  }
  f.env.account={};f.env.item={};f.env.verifyStatus=404;
  await assert.rejects(f.handlers.settings(f.request('A',{incomeAccountId:'24',defaultItemId:'34'})));
  assert.equal((await f.connection('A').get()).get('incomeAccountId'),'21');
});

test('malformed selected IDs fail before contacting QuickBooks', async () => {
  const f=await fixture();
  for(const data of [{incomeAccountId:'../B',defaultItemId:'31'},{incomeAccountId:'21',defaultItemId:"31 OR Active = false"},{incomeAccountId:'',defaultItemId:'31'}]) await assert.rejects(f.handlers.settings(f.request('A',data)),{code:'invalid-argument'});
  assert.equal(f.calls.length,0);
});

test('defaults from a superseded dropdown connection cannot be saved against a new authorization', async () => {
  const f=await fixture(),before=(await f.connection('A').get()).data();
  await assert.rejects(f.handlers.settings(f.request('A',{incomeAccountId:'24',defaultItemId:'34',connectionId:'superseded-authorization'})),{code:'aborted'});
  assert.equal(f.calls.length,0);assert.equal((await f.connection('A').get()).get('incomeAccountId'),before.incomeAccountId);assert.equal((await f.connection('A').get()).get('defaultItemId'),before.defaultItemId);
});

test('expired access automatically refreshes through the same tenant and hides rotated token values', async () => {
  const f=await fixture();await f.connection('A').update({accessExpiresAt:0});
  const result=await f.handlers.options(f.request('A'));
  assert.equal(f.env.refreshCount,1);assert.equal(result.accounts.length,2);assert.doesNotMatch(JSON.stringify(result),/rotated-access|rotated-refresh/);
  assert.equal((await f.connection('B').get()).get('refreshToken'),'fixture-options-B-refresh');
});

test('expired or revoked authorization produces an actionable reconnect failure without leaking provider details', async () => {
  const f=await fixture();await f.connection('A').update({accessExpiresAt:0});f.env.refreshFailure=true;
  await assert.rejects(f.handlers.options(f.request('A')),error=>{assert.match(error.message,/reconnect/i);assert.doesNotMatch(error.message,/fixture-options/);return true;});
  assert.equal(f.calls.filter(row=>row.url.includes('/query')).length,0);
  await f.connection('A').update({refreshExpiresAt:0});const before=f.calls.length;
  await assert.rejects(f.handlers.options(f.request('A')),error=>/reconnect/i.test(error.message));assert.equal(f.calls.length,before);
});

test('QuickBooks authorization and service failures leave accounting defaults unchanged and errors sanitized', async () => {
  const f=await fixture();
  for(const status of [401,403,429,503]) {
    f.env.queryStatus=status;
    await assert.rejects(f.handlers.options(f.request('A')),error=>{assert.doesNotMatch(error.message,/fixture-options-provider-private-detail|fixture-options-A-access|fixture-options-A-refresh/);return true;});
    assert.equal((await f.connection('A').get()).get('incomeAccountId'),'21');
  }
});

test('malformed provider JSON, transport failures and invalid query collections are visibly rejected', async () => {
  const f=await fixture();
  for(const key of ['malformedQuery','nullQuery','nullCollection','invalidJson','networkFailure']) {
    f.env[key]=true;
    await assert.rejects(f.handlers.options(f.request('A')),error=>{assert.doesNotMatch(error.message,/fixture-options-provider-private-detail/);return true;});
    f.env[key]=false;
  }
});

test('a replacement OAuth connection invalidates an accounting options request already in flight', async () => {
  const f=await fixture(),entered=deferred(),release=deferred();f.gates.query=async()=>{entered.resolve();await release.promise;};
  const pending=f.handlers.options(f.request('A')),settled=Promise.allSettled([pending]);await entered.promise;
  await f.connection('A').update({connectionId:'replacement-authorization'});release.resolve();
  const [result]=await settled;assert.equal(result.status,'rejected');assert.equal(result.reason.code,'aborted');
});

test('an owner who loses the company during option loading cannot receive its accounting options', async () => {
  const f=await fixture(),entered=deferred(),release=deferred();f.gates.query=async()=>{entered.resolve();await release.promise;};
  const pending=f.handlers.options(f.request('A')),settled=Promise.allSettled([pending]);await entered.promise;
  await db.doc(`companies/${f.identities.A.companyId}`).update({ownerId:'replacement-owner'});release.resolve();
  const [result]=await settled;assert.equal(result.status,'rejected');assert.equal(result.reason.code,'permission-denied');
});

test('company ownership changes during provider verification prevent saving accounting defaults', async () => {
  const f=await fixture(),entered=deferred(),release=deferred();
  f.gates.verify=async()=>{entered.resolve();await release.promise;};
  const pending=f.handlers.settings(f.request('A',{incomeAccountId:'24',defaultItemId:'34'})),settled=Promise.allSettled([pending]);
  await entered.promise;
  await db.doc(`companies/${f.identities.A.companyId}`).update({ownerId:'replacement-owner'});
  release.resolve();const [result]=await settled;assert.equal(result.status,'rejected');assert.equal(result.reason.code,'permission-denied');
  assert.equal((await f.connection('A').get()).get('incomeAccountId'),'21');
});

test('empty active option lists preserve saved selections for explicit unavailable-selection feedback', async () => {
  const f=await fixture();f.env.accounts=[];f.env.items=[];
  const result=await f.handlers.options(f.request('A'));assert.deepEqual(result.accounts,[]);assert.deepEqual(result.items,[]);assert.equal(result.incomeAccountId,'21');assert.equal(result.defaultItemId,'31');
  assert.equal((await f.connection('A').get()).get('incomeAccountId'),'21');
});

test('cached display names do not survive cleared accounting selections', async () => {
  const f=await fixture();await f.connection('A').update({incomeAccountId:'',defaultItemId:'',incomeAccountName:'Previous company income',defaultItemName:'Previous company service'});
  const status=await f.handlers.status(f.request('A'));assert.equal(status.incomeAccountName,null);assert.equal(status.defaultItemName,null);
});

test('accounting options include later query pages without duplicate or missing names', async () => {
  const f=await fixture();f.env.accounts=Array.from({length:1001},(_,index)=>({Id:String(5000+index),Name:'Income '+String(index).padStart(4,'0'),AccountType:'Income',Active:true}));
  const result=await f.handlers.options(f.request('A'));
  assert.equal(result.accounts.length,1001);assert.equal(new Set(result.accounts.map(row=>row.id)).size,1001);assert.equal(result.accounts.at(-1).name,'Income 1000');
  const pages=f.calls.filter(row=>/\bFROM\s+Account\b/i.test(new URL(row.url).searchParams.get('query')||''));assert.ok(pages.length>1);
});
