const { test: nodeTest, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { createHmac } = require('node:crypto');
const req = require('node:module').createRequire(path.resolve(__dirname, '../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { quickBooksHandlers, mappingId } = require('../functions/quickbooks');
const { hash } = require('../functions/security');
let app, db, sequence = 0;
const test = (name, run) => nodeTest(name, { timeout: 30000 }, run);
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };

before(() => {
  if (!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST || '')) throw Error('A local Firestore emulator is required; production access is prohibited.');
  app = initializeApp({ projectId: 'demo-routelogistics' }, 'qb-certification-tests'); db = getFirestore(app);
});
after(async () => { if (app) await deleteApp(app); });

async function fixture({ mappedCustomer = true } = {}) {
  const prefix = `qb-certification-${++sequence}`, calls = [], identities = {}, remote = new Map(), requestCache = new Map(), gates = {};
  const env = { invoice: null, payment: null, itemOverrides: {}, itemStatus: {}, accountOverrides: {}, loseFirstCustomerResponse: false, lostCustomerResponse: false, failInvoiceReads: false };
  const config = { enabled: () => true, environment: () => 'sandbox', credentialEnvironment: () => 'sandbox', productionApproved: () => false, writesEnabled: () => true, clientId: () => 'fixture-certification-client', clientSecret: () => 'fixture-certification-client-secret', webhookSecret: () => 'fixture-certification-verifier' };
  const request = (tenant, data = {}) => ({ auth: identities[tenant].auth, data });
  const connection = tenant => db.doc(`rlQuickBooksConnections/${mappingId(identities[tenant].companyId, 'sandbox', 'connection', 'current')}`);
  const mapping = (tenant, type, id) => db.doc(`rlQbMappings/${mappingId(identities[tenant].companyId, 'sandbox', type, id)}`);
  const putMapping = async (tenant, type, localId, remoteId) => mapping(tenant, type, localId).set({ companyId: identities[tenant].companyId, environment: 'sandbox', realmId: identities[tenant].realm, type, localId, remoteId, syncToken: '0', status: 'adopted' });
  for (const [tenant, index] of [['A',1], ['B',2]]) {
    const companyId = `${prefix}-${tenant}`, uid = `${companyId}-owner`, realm = String(700000 + sequence * 10 + index);
    identities[tenant] = { companyId, uid, realm, customerId: `${companyId}-customer`, serviceId: `${companyId}-service`, invoiceId: `${companyId}-invoice`, auth: { uid, token: { companyId, role: 'owner', email_verified: true } } };
    await db.doc(`companies/${companyId}`).set({ ownerId: uid });
    await connection(tenant).set({ companyId, environment: 'sandbox', credentialEnvironment: 'sandbox', realmId: realm, credentialHash: hash('sandbox:fixture-certification-client'), connected: true, connectionId: `${companyId}-connection`, connectedAt: new Date(), accessToken: `fixture-certification-${tenant}-access`, refreshToken: `fixture-certification-${tenant}-refresh`, accessExpiresAt: Date.now()+3600000, refreshExpiresAt: Date.now()+86400000, refreshLeaseUntil: 0, incomeAccountId: '400', defaultItemId: '500' });
    await db.doc(`rlQbRealms/${hash('sandbox:'+realm)}`).set({ companyId, environment: 'sandbox', realmId: realm, active: true, connectionId: `${companyId}-connection` });
    await db.doc(`customers/${identities[tenant].customerId}`).set({ companyId, name: `Controlled ${tenant} certification customer`, email: `certification-${tenant.toLowerCase()}@example.invalid`, phone: '+15555550100' });
    await db.doc(`estimateTemplates/${identities[tenant].serviceId}`).set({ companyId, name: 'Controlled certification service' });
    await db.doc(`invoices/${identities[tenant].invoiceId}`).set({ companyId, customerId: identities[tenant].customerId, status: 'sent', total: 20, tax: 0, taxRate: 0, currency: 'USD', invoiceNumber: `${prefix}-${tenant}`, issueDate: '2026-11-14', dueDate: '2026-11-21', lineItems: [{ description: 'Controlled service', quantity: 2, unitPrice: 10, amount: 20 }] });
    if (mappedCustomer) await putMapping(tenant, 'Customer', identities[tenant].customerId, '600');
  }
  const transport = async (url, options) => {
    const parsed = new URL(url), match = parsed.pathname.match(/^\/v3\/company\/(\d+)\/(customer|item|invoice|account|payment)(?:\/(\d+))?$/);
    assert.equal(parsed.hostname, 'sandbox-quickbooks.api.intuit.com', 'Accounting certification cannot reach a production or non-Intuit host.');
    assert.ok(match, 'Only controlled accounting resources are available in this fixture.');
    const tenant = Object.keys(identities).find(key => identities[key].realm === match[1]);
    assert.ok(tenant); const current = await connection(tenant).get();
    assert.equal(options.headers.Authorization, 'Bearer '+current.get('accessToken'), 'The realm and bearer must belong to the same tenant.');
    const type = match[2][0].toUpperCase()+match[2].slice(1), id = match[3];
    calls.push({ tenant, type, id, method: options.method, url, body: options.body });
    if (options.method === 'POST') {
      assert.ok(['Customer','Invoice'].includes(type), 'Certification must not create accounts, service items or provider payments through export.');
      const body = JSON.parse(options.body), requestId = parsed.searchParams.get('requestid'); assert.ok(requestId);
      let result = requestCache.get(requestId);
      if (!result) {
        const assignedId = body.Id || (type === 'Customer' ? '600' : '700'), key = `${tenant}:${type}:${assignedId}`, prior = remote.get(key);
        result = { ...body, Id: assignedId, SyncToken: String(prior ? Number(prior.SyncToken)+1 : 0), ...(type === 'Customer' ? { Active: true } : { TotalAmt: body.Line.reduce((sum,line)=>sum+line.Amount,0), Balance: body.Line.reduce((sum,line)=>sum+line.Amount,0), CurrencyRef: {value:'USD'} }) };
        remote.set(key,result); requestCache.set(requestId,result);
      }
      if (gates.post) await gates.post({type,tenant,result:structuredClone(result)});
      if (type === 'Customer' && env.loseFirstCustomerResponse && !env.lostCustomerResponse) { env.lostCustomerResponse = true; throw Error('Synthetic response lost after provider commit'); }
      return {ok:true,json:async()=>({[type]:structuredClone(result)})};
    }
    assert.equal(options.method,'GET');
    if (type === 'Account') return {ok:true,json:async()=>({Account:{Id:id,Name:'Controlled income',Active:true,AccountType:'Income',...(env.accountOverrides[id]||{})}})};
    if (type === 'Item') return env.itemStatus[id] ? {ok:false,status:env.itemStatus[id],json:async()=>({error:'fixture-private-provider-detail'})} : {ok:true,json:async()=>({Item:{Id:id,Name:'Controlled service',Active:true,Type:'Service',SyncToken:'0',IncomeAccountRef:{value:'400'},...(env.itemOverrides[id]||{})}})};
    if (type === 'Customer') return {ok:true,json:async()=>({Customer:structuredClone(remote.get(`${tenant}:Customer:${id}`)||{Id:id,SyncToken:'0',DisplayName:'Controlled customer',Active:true})})};
    if (type === 'Payment') return {ok:true,json:async()=>({Payment:{Id:id,SyncToken:'0',CustomerRef:{value:'600'},TotalAmt:20,TxnDate:'2026-11-14',CurrencyRef:{value:'USD'},Line:[{Amount:20,LinkedTxn:[{TxnId:'700',TxnType:'Invoice'}]}],...(env.payment||{})}})};
    if (env.failInvoiceReads) return {ok:false,status:503,json:async()=>({error:'fixture-private-provider-detail'})};
    const invoice = structuredClone({CustomerRef:{value:'600'},...(env.invoice || remote.get(`${tenant}:Invoice:${id}`) || {Id:id,SyncToken:'0',TotalAmt:20,Balance:20,CurrencyRef:{value:'USD'}})});
    if (gates.invoice) await gates.invoice(invoice);
    return {ok:true,json:async()=>({Invoice:invoice})};
  };
  const handlers = quickBooksHandlers(db,config,transport);
  const signed = payload => { const rawBody=Buffer.from(JSON.stringify(payload));return {rawBody,headers:{'intuit-signature':createHmac('sha256',config.webhookSecret()).update(rawBody).digest('base64')}}; };
  const notify = async (tenant, type, version) => {
    const payload={eventNotifications:[{realmId:identities[tenant].realm,dataChangeEvent:{entities:[{name:type,id:type==='Payment'?'800':'700',operation:'Update',lastUpdated:`2026-11-14T12:${String(version).padStart(2,'0')}:00Z`}]}}]};let status;
    await handlers.webhook(signed(payload),{status:value=>({send:()=>{status=value;}})});return status;
  };
  return {prefix,identities,env,gates,calls,config,handlers,request,connection,mapping,putMapping,remote,notify,signed};
}

test('customer export retains contact fields, persists a tenant mapping and reuses the exact successful operation',async()=>{
  const f=await fixture({mappedCustomer:false}),id=f.identities.A.customerId,preview=await f.handlers.preview(f.request('A',{type:'Customer',localId:id}));
  assert.equal(preview.payload.DisplayName,'Controlled A certification customer');assert.equal(preview.payload.PrimaryEmailAddr.Address,'certification-a@example.invalid');assert.equal(preview.payload.PrimaryPhone.FreeFormNumber,'+15555550100');
  const data={type:'Customer',localId:id,fingerprint:preview.fingerprint};const result=await f.handlers.sync(f.request('A',data));await f.handlers.sync(f.request('A',data));
  assert.equal(result.remoteId,'600');assert.equal(f.calls.filter(row=>row.method==='POST').length,1);
  const mapping=await f.mapping('A','Customer',id).get();assert.equal(mapping.get('companyId'),f.identities.A.companyId);assert.equal(mapping.get('realmId'),f.identities.A.realm);assert.equal(mapping.get('remoteId'),'600');
  assert.equal((await f.mapping('B','Customer',id).get()).exists,false);
});

test('an uncertain customer export retries identical request and body after provider commit without another customer',async()=>{
  const f=await fixture({mappedCustomer:false});f.env.loseFirstCustomerResponse=true;const id=f.identities.A.customerId,preview=await f.handlers.preview(f.request('A',{type:'Customer',localId:id})),data={type:'Customer',localId:id,fingerprint:preview.fingerprint};
  await assert.rejects(f.handlers.sync(f.request('A',data)),/temporarily unavailable/i);await f.handlers.sync(f.request('A',data));await f.handlers.sync(f.request('A',data));
  const posts=f.calls.filter(row=>row.method==='POST');assert.equal(posts.length,2);assert.equal(posts[0].url,posts[1].url);assert.equal(posts[0].body,posts[1].body);assert.equal(f.remote.size,1);
});

test('an existing customer mapping is updated using its provider ID rather than creating another customer',async()=>{
  const f=await fixture(),id=f.identities.A.customerId,preview=await f.handlers.preview(f.request('A',{type:'Customer',localId:id}));
  assert.equal(preview.action,'update');assert.equal(preview.payload.Id,'600');
  const saved=await f.handlers.sync(f.request('A',{type:'Customer',localId:id,fingerprint:preview.fingerprint}));
  assert.equal(saved.remoteId,'600');const posts=f.calls.filter(row=>row.method==='POST');assert.equal(posts.length,1);assert.equal(JSON.parse(posts[0].body).Id,'600');assert.equal((await f.mapping('A','Customer',id).get()).get('remoteId'),'600');
});

test('a source changed after provider commit keeps a reviewable remote receipt and cannot create another customer',async()=>{
  const f=await fixture({mappedCustomer:false}),id=f.identities.A.customerId,entered=deferred(),release=deferred();
  const preview=await f.handlers.preview(f.request('A',{type:'Customer',localId:id})),data={type:'Customer',localId:id,fingerprint:preview.fingerprint};
  f.gates.post=async()=>{entered.resolve();await release.promise;};const pending=f.handlers.sync(f.request('A',data)),settled=Promise.allSettled([pending]);let results;
  try{await entered.promise;await db.doc(`customers/${id}`).update({name:'Changed while provider response was pending'});}finally{release.resolve();results=await settled;f.gates.post=null;}
  assert.equal(results[0].status,'rejected');assert.equal(results[0].reason.code,'aborted');
  const map=await f.mapping('A','Customer',id).get();assert.equal(map.get('status'),'review');assert.equal(map.get('remoteId'),'600');
  const operations=await db.collection('rlQbOperations').where('companyId','==',f.identities.A.companyId).get();assert.equal(operations.size,1);assert.equal(operations.docs[0].get('status'),'review');assert.equal(operations.docs[0].get('remoteId'),'600');
  await assert.rejects(f.handlers.preview(f.request('A',{type:'Customer',localId:id})),/review|adopt/i);await assert.rejects(f.handlers.sync(f.request('A',data)));
  assert.equal(f.calls.filter(row=>row.method==='POST').length,1);assert.equal(f.remote.size,1);
});

test('a source moved to another company during provider acceptance never receives a usable cross-tenant mapping',async()=>{
  const f=await fixture({mappedCustomer:false}),id=f.identities.A.customerId,entered=deferred(),release=deferred();
  const preview=await f.handlers.preview(f.request('A',{type:'Customer',localId:id})),data={type:'Customer',localId:id,fingerprint:preview.fingerprint};
  f.gates.post=async()=>{entered.resolve();await release.promise;};const pending=f.handlers.sync(f.request('A',data)),settled=Promise.allSettled([pending]);let results;
  try{await entered.promise;await db.doc(`customers/${id}`).update({companyId:f.identities.B.companyId});}finally{release.resolve();results=await settled;f.gates.post=null;}
  assert.equal(results[0].status,'rejected');const map=await f.mapping('A','Customer',id).get();if(map.exists)assert.equal(map.get('status'),'review');
  assert.equal((await f.mapping('B','Customer',id).get()).exists,false);
  const operations=await db.collection('rlQbOperations').where('companyId','==',f.identities.A.companyId).get();assert.equal(operations.docs[0].get('status'),'review');assert.equal(operations.docs[0].get('remoteId'),'600');
  await assert.rejects(f.handlers.sync(f.request('A',data)));assert.equal(f.calls.filter(row=>row.method==='POST').length,1);
});

test('ownership change after provider acceptance retains a receipt and requires the new owner to adopt it',async()=>{
  const f=await fixture({mappedCustomer:false}),id=f.identities.A.customerId,entered=deferred(),release=deferred();
  const preview=await f.handlers.preview(f.request('A',{type:'Customer',localId:id})),data={type:'Customer',localId:id,fingerprint:preview.fingerprint};
  f.gates.post=async()=>{entered.resolve();await release.promise;};const pending=f.handlers.sync(f.request('A',data)),settled=Promise.allSettled([pending]);let results;
  try{await entered.promise;await db.doc(`companies/${f.identities.A.companyId}`).update({ownerId:'replacement-owner'});}finally{release.resolve();results=await settled;f.gates.post=null;}
  assert.equal(results[0].status,'rejected');
  const operations=await db.collection('rlQbOperations').where('companyId','==',f.identities.A.companyId).get();assert.equal(operations.docs[0].get('status'),'review');assert.equal(operations.docs[0].get('remoteId'),'600');
  const request=data=>({auth:{uid:'replacement-owner',token:{...f.identities.A.auth.token}},data});
  await assert.rejects(f.handlers.preview(request({type:'Customer',localId:id})),/review|adopt/i);assert.equal(f.calls.filter(row=>row.method==='POST').length,1);
  await f.handlers.adopt(request({type:'Customer',localId:id,remoteId:'600'}));
  assert.equal((await operations.docs[0].ref.get()).get('status'),'reviewed');assert.equal((await f.handlers.preview(request({type:'Customer',localId:id}))).action,'update');assert.equal(f.calls.filter(row=>row.method==='POST').length,1);
});

test('missing customer names and foreign-tenant source records fail before provider writes',async()=>{
  const f=await fixture();await db.doc(`customers/${f.identities.A.customerId}`).update({name:''});
  await assert.rejects(f.handlers.preview(f.request('A',{type:'Customer',localId:f.identities.A.customerId})),/customer name/i);
  await assert.rejects(f.handlers.adopt(f.request('A',{type:'Customer',localId:f.identities.B.customerId,remoteId:'600'})),{code:'permission-denied'});assert.equal(f.calls.filter(row=>row.method==='POST').length,0);
});

test('taxes, positive unmapped tax rates and malformed tax values are rejected without silent tax exemption',async()=>{
  const f=await fixture(),ref=db.doc(`invoices/${f.identities.A.invoiceId}`);
  for(const patch of [{tax:1.6,taxRate:8},{tax:0,taxRate:8},{tax:'not-a-tax',taxRate:0},{tax:0,taxRate:'invalid'}]){
    await ref.update(patch);await assert.rejects(f.handlers.preview(f.request('A',{type:'Invoice',localId:ref.id})),error=>error.code==='failed-precondition'&&/tax/i.test(error.message));
  }
  assert.equal(f.calls.filter(row=>row.method==='POST').length,0);
});

test('unsupported currency and discount fields fail closed even when line totals still match',async()=>{
  const f=await fixture(),ref=db.doc(`invoices/${f.identities.A.invoiceId}`);
  for(const currency of ['EUR','CAD']){await ref.update({currency});await assert.rejects(f.handlers.preview(f.request('A',{type:'Invoice',localId:ref.id})),/currency|USD/i);}
  await ref.update({currency:'USD'});
  for(const key of ['discount','discountAmount','discountPercent']){await ref.update({[key]:1});await assert.rejects(f.handlers.preview(f.request('A',{type:'Invoice',localId:ref.id})),/discount/i);await ref.update({[key]:0});}
  assert.equal(f.calls.filter(row=>row.method==='POST').length,0);
});

test('existing active service adoption verifies its own income account and never creates an item',async()=>{
  const f=await fixture(),id=f.identities.A.serviceId;f.env.itemOverrides['501']={IncomeAccountRef:{value:'401'}};
  await f.handlers.adopt(f.request('A',{type:'Item',localId:id,remoteId:'501'}));await f.handlers.adopt(f.request('A',{type:'Item',localId:id,remoteId:'501'}));
  const saved=await f.mapping('A','Item',id).get();assert.equal(saved.get('remoteId'),'501');assert.equal(saved.get('realmId'),f.identities.A.realm);assert.ok(f.calls.some(row=>row.type==='Account'&&row.id==='401'));assert.ok(f.calls.every(row=>row.method==='GET'));
});

test('inactive, deleted, non-service or improperly funded service items cannot be adopted',async()=>{
  const f=await fixture(),id=f.identities.A.serviceId;
  for(const invalid of [{Active:false},{Type:'Inventory'},{IncomeAccountRef:null},{IncomeAccountRef:{value:'../foreign'}}]){f.env.itemOverrides['501']=invalid;await assert.rejects(f.handlers.adopt(f.request('A',{type:'Item',localId:id,remoteId:'501'})));assert.equal((await f.mapping('A','Item',id).get()).exists,false);}
  f.env.itemOverrides['501']={};f.env.accountOverrides['400']={Active:false};await assert.rejects(f.handlers.adopt(f.request('A',{type:'Item',localId:id,remoteId:'501'})));
  f.env.accountOverrides['400']={AccountType:'Bank'};await assert.rejects(f.handlers.adopt(f.request('A',{type:'Item',localId:id,remoteId:'501'})));
  f.env.accountOverrides['400']={};f.env.itemStatus['501']=404;await assert.rejects(f.handlers.adopt(f.request('A',{type:'Item',localId:id,remoteId:'501'})));assert.equal(f.calls.filter(row=>row.method==='POST').length,0);
});

test('invoice export uses configured default service and explicit USD with correct dates and line arithmetic',async()=>{
  const f=await fixture(),id=f.identities.A.invoiceId,preview=await f.handlers.preview(f.request('A',{type:'Invoice',localId:id}));
  assert.equal(preview.payload.CustomerRef.value,'600');assert.deepEqual(preview.payload.CurrencyRef,{value:'USD'});assert.equal(preview.payload.Line[0].SalesItemLineDetail.ItemRef.value,'500');assert.equal(preview.payload.Line[0].SalesItemLineDetail.Qty,2);assert.equal(preview.payload.Line[0].SalesItemLineDetail.UnitPrice,10);assert.equal(preview.payload.Line[0].Amount,20);assert.equal(preview.payload.TxnDate,'2026-11-14');assert.equal(preview.payload.DueDate,'2026-11-21');
  const data={type:'Invoice',localId:id,fingerprint:preview.fingerprint},result=await f.handlers.sync(f.request('A',data));await f.handlers.sync(f.request('A',data));
  const stored=await f.mapping('A','Invoice',id).get();assert.equal(stored.get('remoteId'),result.remoteId);assert.equal(stored.get('companyId'),f.identities.A.companyId);assert.equal(f.calls.filter(row=>row.method==='POST'&&row.type==='Invoice').length,1);assert.equal(f.remote.get(`A:Invoice:${result.remoteId}`).TotalAmt,20);
});

test('mapped service selection overrides fallback but inactive fallback or mapped items fail before export',async()=>{
  const f=await fixture(),id=f.identities.A.invoiceId,ref=db.doc(`invoices/${id}`);await f.putMapping('A','Item',f.identities.A.serviceId,'501');await ref.update({lineItems:[{templateId:f.identities.A.serviceId,description:'Mapped service',quantity:1,unitPrice:20,amount:20}]});
  assert.equal((await f.handlers.preview(f.request('A',{type:'Invoice',localId:id}))).payload.Line[0].SalesItemLineDetail.ItemRef.value,'501');
  f.env.itemOverrides['501']={Active:false};await assert.rejects(f.handlers.preview(f.request('A',{type:'Invoice',localId:id})));
  await ref.update({lineItems:[{description:'Default service',quantity:1,unitPrice:20,amount:20}]});f.env.itemOverrides['500']={Active:false};await assert.rejects(f.handlers.preview(f.request('A',{type:'Invoice',localId:id})));assert.equal(f.calls.filter(row=>row.method==='POST').length,0);
});

test('incorrect line arithmetic and negative amounts cannot reach accounting export',async()=>{
  const f=await fixture(),id=f.identities.A.invoiceId,ref=db.doc(`invoices/${id}`);
  for(const line of [{quantity:2,unitPrice:10,amount:19},{quantity:1,unitPrice:-20,amount:-20},{quantity:0,unitPrice:20,amount:20}]){await ref.update({lineItems:[line]});await assert.rejects(f.handlers.preview(f.request('A',{type:'Invoice',localId:id})),{code:'failed-precondition'});}assert.equal(f.calls.filter(row=>row.method==='POST').length,0);
});

test('partial and full sandbox reconciliation records balances without marking the actual invoice paid',async()=>{
  const f=await fixture(),id=f.identities.A.invoiceId;await f.putMapping('A','Invoice',id,'700');
  f.env.invoice={Id:'700',SyncToken:'1',TotalAmt:20,Balance:12.5,CurrencyRef:{value:'USD'}};await f.handlers.reconcile(f.request('A',{localId:id}));
  let invoice=await db.doc(`invoices/${id}`).get();assert.equal(invoice.get('status'),'sent');assert.equal(invoice.get('qbTestPaymentStatus'),'partial');assert.equal(invoice.get('qbTestBalance'),12.5);assert.equal(invoice.get('qbTestAmountPaid'),7.5);
  f.env.invoice={...f.env.invoice,SyncToken:'2',Balance:0};await f.handlers.reconcile(f.request('A',{localId:id}));await f.handlers.reconcile(f.request('A',{localId:id}));invoice=await db.doc(`invoices/${id}`).get();assert.equal(invoice.get('status'),'sent');assert.equal(invoice.get('qbTestPaymentStatus'),'paid');assert.equal(invoice.get('qbTestBalance'),0);assert.equal(invoice.get('qbTestAmountPaid'),20);assert.equal((await db.collection('rlQbReconciliations').where('companyId','==',f.identities.A.companyId).get()).size,2);
});

test('an invoice mapped to the wrong QuickBooks customer cannot receive a paid reconciliation',async()=>{
  const f=await fixture(),id=f.identities.A.invoiceId;await f.putMapping('A','Invoice',id,'700');
  f.env.invoice={Id:'700',SyncToken:'1',CustomerRef:{value:'999'},TotalAmt:20,Balance:0,CurrencyRef:{value:'USD'}};
  await assert.rejects(f.handlers.reconcile(f.request('A',{localId:id})),error=>/customer|association|mapping/i.test(error.message));
  const invoice=await db.doc(`invoices/${id}`).get();assert.equal(invoice.get('status'),'sent');assert.equal(invoice.get('qbTestPaymentStatus'),undefined);assert.equal(invoice.get('qbTestBalance'),undefined);
});

test('invoice reconciliation serializes concurrent reads and rejects older snapshots after retrying the newest version',async()=>{
  const f=await fixture(),id=f.identities.A.invoiceId,entered=deferred(),release=deferred();await f.putMapping('A','Invoice',id,'700');
  f.env.invoice={Id:'700',SyncToken:'1',TotalAmt:20,Balance:10,CurrencyRef:{value:'USD'}};f.gates.invoice=async invoice=>{if(invoice.SyncToken==='1'){entered.resolve();await release.promise;}};
  const old=f.handlers.reconcile(f.request('A',{localId:id})),settled=Promise.allSettled([old]);let oldResults;
  try {
    await entered.promise;f.env.invoice={...f.env.invoice,SyncToken:'2',Balance:0};
    await assert.rejects(f.handlers.reconcile(f.request('A',{localId:id})),{code:'unavailable'});
  } finally { release.resolve();oldResults=await settled;f.gates.invoice=null; }
  assert.equal(oldResults[0].status,'fulfilled');
  await f.handlers.reconcile(f.request('A',{localId:id}));
  f.env.invoice={...f.env.invoice,SyncToken:'0',Balance:20};await f.handlers.reconcile(f.request('A',{localId:id}));
  const invoice=await db.doc(`invoices/${id}`).get();assert.equal(invoice.get('qbTestPaymentStatus'),'paid');assert.equal(invoice.get('qbTestBalance'),0);assert.equal(invoice.get('status'),'sent');
});

test('signed payment events record provider amount, date and currency while duplicate delivery stays idempotent',async()=>{
  const f=await fixture(),id=f.identities.A.invoiceId;await f.putMapping('A','Invoice',id,'700');
  f.env.invoice={Id:'700',SyncToken:'1',TotalAmt:20,Balance:12.5,CurrencyRef:{value:'USD'}};f.env.payment={SyncToken:'1',TotalAmt:7.5,TxnDate:'2026-11-14',Line:[{Amount:7.5,LinkedTxn:[{TxnId:'700',TxnType:'Invoice'}]}]};
  assert.equal(await f.notify('A','Payment',1),200);assert.equal(await f.notify('A','Payment',1),200);await f.handlers.drain();
  const payments=await db.collection('rlQbPaymentMappings').where('companyId','==',f.identities.A.companyId).get();assert.equal(payments.size,1);const payment=payments.docs[0];assert.equal(payment.get('amount'),7.5);assert.equal(payment.get('txnDate'),'2026-11-14');assert.equal(payment.get('currency'),'USD');assert.deepEqual(payment.get('applications'),[{remoteInvoiceId:'700',amount:7.5}]);assert.deepEqual(payment.get('remoteInvoiceIds'),['700']);assert.deepEqual(payment.get('invoiceIds'),[id]);assert.equal(payment.get('realmId'),f.identities.A.realm);
  assert.equal((await db.collection('rlQbWebhookEvents').where('companyId','==',f.identities.A.companyId).get()).size,1);assert.equal((await db.doc(`invoices/${id}`).get()).get('status'),'sent');assert.equal((await f.mapping('B','Invoice',id).get()).exists,false);
});

test('an older payment snapshot cannot overwrite the latest amount and transaction date',async()=>{
  const f=await fixture(),id=f.identities.A.invoiceId;await f.putMapping('A','Invoice',id,'700');
  f.env.invoice={Id:'700',SyncToken:'2',TotalAmt:20,Balance:0,CurrencyRef:{value:'USD'}};f.env.payment={SyncToken:'2',TotalAmt:20,TxnDate:'2026-11-15'};
  await f.notify('A','Payment',2);await f.handlers.drain();
  f.env.payment={SyncToken:'1',TotalAmt:7.5,TxnDate:'2026-11-14',Line:[{Amount:7.5,LinkedTxn:[{TxnId:'700',TxnType:'Invoice'}]}]};
  await f.notify('A','Payment',1);await f.handlers.drain();
  const payments=await db.collection('rlQbPaymentMappings').where('companyId','==',f.identities.A.companyId).get();assert.equal(payments.size,1);assert.equal(payments.docs[0].get('syncToken'),'2');assert.equal(payments.docs[0].get('amount'),20);assert.equal(payments.docs[0].get('txnDate'),'2026-11-15');
});

test('non-USD or malformed payment metadata is not reconciled as a valid sandbox payment',async()=>{
  const f=await fixture(),id=f.identities.A.invoiceId;await f.putMapping('A','Invoice',id,'700');
  f.env.payment={CurrencyRef:{value:'EUR'}};await f.notify('A','Payment',1);await f.handlers.drain();
  assert.equal((await db.collection('rlQbPaymentMappings').where('companyId','==',f.identities.A.companyId).get()).size,0);assert.equal((await db.doc(`invoices/${id}`).get()).get('qbTestPaymentStatus'),undefined);
});

test('a payment customer mismatch cannot reconcile its linked invoice or save a payment association',async()=>{
  const f=await fixture(),id=f.identities.A.invoiceId;await f.putMapping('A','Invoice',id,'700');
  f.env.invoice={Id:'700',SyncToken:'1',CustomerRef:{value:'600'},TotalAmt:20,Balance:0,CurrencyRef:{value:'USD'}};f.env.payment={CustomerRef:{value:'999'}};
  await f.notify('A','Payment',1);await f.handlers.drain();
  const invoice=await db.doc(`invoices/${id}`).get();assert.equal(invoice.get('status'),'sent');assert.equal(invoice.get('qbTestPaymentStatus'),undefined);
  assert.equal((await db.collection('rlQbPaymentMappings').where('companyId','==',f.identities.A.companyId).get()).size,0);
  const events=await db.collection('rlQbWebhookEvents').where('companyId','==',f.identities.A.companyId).get();assert.equal(events.docs[0].get('status'),'pending');assert.match(events.docs[0].get('error'),/customer|association|mapping/i);
});

test('failed webhook reconciliation retains a retryable event and later retry does not duplicate the payment mapping',async()=>{
  const f=await fixture(),id=f.identities.A.invoiceId;await f.putMapping('A','Invoice',id,'700');f.env.failInvoiceReads=true;
  await f.notify('A','Payment',1);await f.handlers.drain();let events=await db.collection('rlQbWebhookEvents').where('companyId','==',f.identities.A.companyId).get();assert.equal(events.docs[0].get('status'),'pending');assert.equal(events.docs[0].get('attempts'),1);assert.doesNotMatch(events.docs[0].get('error'),/fixture-private-provider-detail/);
  await events.docs[0].ref.update({nextAttempt:0});f.env.failInvoiceReads=false;await f.handlers.drain();await f.handlers.drain();events=await db.collection('rlQbWebhookEvents').where('companyId','==',f.identities.A.companyId).get();assert.equal(events.docs[0].get('status'),'reconciled');assert.equal((await db.collection('rlQbPaymentMappings').where('companyId','==',f.identities.A.companyId).get()).size,1);
});
