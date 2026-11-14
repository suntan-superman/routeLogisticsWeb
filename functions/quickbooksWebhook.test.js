const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeQuickBooksWebhook, QuickBooksWebhookPayloadError, MAX_WEBHOOK_EVENTS, MAX_WEBHOOK_GROUPS } = require('./shared/quickbooksWebhook');
const instant = '2026-11-14T16:30:00.123456789Z';
const cloud = patch => ({ specversion:'1.0', id:'controlled-event-1', source:'intuit.controlled', type:'qbo.invoice.updated.v1', datacontenttype:'application/json', time:instant, intuitentityid:'123', intuitaccountid:'9341455727000797', data:{}, ...patch });
const legacy = (entity = {}, group = {}) => ({ eventNotifications:[{ realmId:'9341455727000797', dataChangeEvent:{ entities:[{ name:'Invoice', id:'123', operation:'Update', lastUpdated:instant, ...entity }] }, ...group }] });
const fails = (body, status=400) => assert.throws(() => normalizeQuickBooksWebhook(body), error => error instanceof QuickBooksWebhookPayloadError && error.status === status && !error.message.includes('private'));

test('legacy entity notifications normalize supported routing without copying arbitrary tenant or sensitive fields', () => {
  const body=legacy({companyId:'foreign-company',accessToken:'fixture-private-token'},{companyId:'foreign-company'});
  assert.deepEqual(normalizeQuickBooksWebhook(body),[{realmId:'9341455727000797',type:'Invoice',id:'123',operation:'Update',lastUpdated:instant}]);
});
test('current Intuit CloudEvents arrays and single structured events preserve provider identity and timestamp', () => {
  const expected={realmId:'9341455727000797',type:'Invoice',id:'123',operation:'Update',lastUpdated:instant,eventId:'controlled-event-1'};
  assert.deepEqual(normalizeQuickBooksWebhook([cloud()]),[expected]);assert.deepEqual(normalizeQuickBooksWebhook(cloud()),[expected]);
});
test('one modern notification batch retains independently authorized realm IDs instead of payload company IDs', () => {
  const events=[cloud({data:{companyId:'spoofed',accessToken:'fixture-private'}}),cloud({id:'event-2',intuitaccountid:'123456',intuitentityid:'456',type:'qbo.payment.created.v1'})];
  const rows=normalizeQuickBooksWebhook(events);assert.deepEqual(rows.map(row=>[row.realmId,row.type,row.id]),[['9341455727000797','Invoice','123'],['123456','Payment','456']]);assert.doesNotMatch(JSON.stringify(rows),/spoofed|private|companyId|accessToken/);
});
test('all supported entity operations use canonical legacy names for downstream processing', () => {
  const cases=[['customer','merged','Customer','Merge'],['item','deleted','Item','Delete'],['invoice','voided','Invoice','Void'],['payment','emailed','Payment','Emailed']];
  for(const [entity,event,type,operation] of cases) {
    const [row]=normalizeQuickBooksWebhook([cloud({type:`qbo.${entity}.${event}.v1`})]);
    assert.equal(row.type,type);assert.equal(row.operation,operation);
  }
});
test('unsupported entities, versions and operations are not promoted into supported accounting events', () => {
  for(const type of ['qbo.vendor.updated.v1','qbo.invoice.updated.v2','qbo.customer.voided.v1','qbo.invoice.unknown.v1','untrusted.invoice.updated.v1'])assert.deepEqual(normalizeQuickBooksWebhook([cloud({type})]),[]);
  assert.deepEqual(normalizeQuickBooksWebhook(legacy({name:'Vendor'})),[]);assert.deepEqual(normalizeQuickBooksWebhook(legacy({operation:'Unknown'})),[]);
});
test('missing real realm or entity IDs fail closed rather than treating portal test metadata as tenant authority', () => {
  for(const patch of [{intuitaccountid:undefined},{intuitentityid:undefined},{intuitaccountid:'../tenant'},{intuitentityid:'1 OR 1=1'},{intuitaccountid:'9'.repeat(31)},{intuitentityid:9007199254740992}])fails([cloud(patch)]);
  fails(legacy({}, {realmId:undefined}));fails(legacy({id:'../invoice'}));
});
test('schema, event identities, content types and timestamps are validated without exposing provider values', () => {
  for(const patch of [{specversion:'2.0'},{id:''},{id:'private\nvalue'},{id:'x'.repeat(201)},{type:null},{datacontenttype:'text/html'},{time:'not-a-date'},{time:'2026-11-14'},{time:undefined}])fails([cloud(patch)]);
  for(const body of [null,true,1,'private',{}, {eventNotifications:{}}, {eventNotifications:[{}]}, [null], [legacy()]])fails(body);
  fails(legacy({lastUpdated:undefined}));fails(legacy({lastUpdated:'private'}));
});
test('legacy ISO service dates and safely represented numeric identifiers remain compatible', () => {
  const rows=normalizeQuickBooksWebhook(legacy({id:123,lastUpdated:'2026-11-14'},{realmId:123456}));assert.equal(rows[0].realmId,'123456');assert.equal(rows[0].id,'123');assert.equal(rows[0].lastUpdated,'2026-11-14');
});
test('oversized batches reject the complete request instead of acknowledging a truncated partial batch', () => {
  fails(Array.from({length:MAX_WEBHOOK_EVENTS+1},()=>cloud()),413);
  const group=legacy().eventNotifications[0];fails({eventNotifications:Array.from({length:MAX_WEBHOOK_GROUPS+1},()=>group)},413);
  fails({eventNotifications:[{...group,dataChangeEvent:{entities:Array.from({length:MAX_WEBHOOK_EVENTS+1},()=>group.dataChangeEvent.entities[0])}}]},413);
  assert.equal(normalizeQuickBooksWebhook(Array.from({length:MAX_WEBHOOK_EVENTS},(_,index)=>cloud({id:'event-'+index}))).length,MAX_WEBHOOK_EVENTS);
});
test('input records are not modified and empty documented batches produce no events', () => {
  const body=cloud({data:Object.freeze({companyId:'untrusted'})});Object.freeze(body);assert.equal(normalizeQuickBooksWebhook(Object.freeze([body])).length,1);
  assert.deepEqual(normalizeQuickBooksWebhook([]),[]);assert.deepEqual(normalizeQuickBooksWebhook({eventNotifications:[]}),[]);
});
