const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createWorkNoteDraftStore}=require('../services/workNoteDraftCore');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const draft=(revision,text=revision)=>({revision,text,editedAt:123,state:'draft',dirty:true});

test('first typed note starts native storage immediately without a preliminary read',async()=>{
 const calls=[],hold=deferred(),storage={getItem:async()=>{calls.push('read');return null;},setItem:(key,value)=>{calls.push({key,value});return hold.promise;}};
 const store=createWorkNoteDraftStore(storage,'scope:job'),record=draft('one','Unicode: árbol\nGate note');
 const saved=store.persist(record);assert.equal(calls.length,1);assert.equal(calls[0].key,'scope:job');assert.equal(JSON.parse(calls[0].value).text,record.text);assert.equal(store.peek(),record);
 hold.resolve();assert.deepEqual(await saved,record);
});

test('rapid edits persist in order and a new process restores the final text and original edit time',async()=>{
 const values=new Map(),writes=[],hold=deferred();let first=true;
 const storage={getItem:async key=>values.get(key)||null,setItem:async(key,value)=>{writes.push(JSON.parse(value).revision);if(first){first=false;await hold.promise;}values.set(key,value);}};
 const store=createWorkNoteDraftStore(storage,'job'),a=store.persist(draft('first')),b=store.persist(draft('second','last\nline'));
 assert.deepEqual(writes,['first']);hold.resolve();await Promise.all([a,b]);assert.deepEqual(writes,['first','second']);
 assert.deepEqual(await createWorkNoteDraftStore(storage,'job').read(),draft('second','last\nline'));
});

test('an earlier acknowledgement cannot overwrite a newer typed revision',async()=>{
 const values=new Map(),read=deferred();let gated=false;
 const storage={getItem:async key=>{if(gated){gated=false;await read.promise;}return values.get(key)||null;},setItem:async(key,value)=>values.set(key,value)};
 const store=createWorkNoteDraftStore(storage,'job');await store.persist(draft('old'));gated=true;
 const ack=store.compareAndSet('old',value=>({...value,state:'synced',dirty:false}));
 const typing=store.persist(draft('new','Do not erase this.'));read.resolve();await Promise.all([ack,typing]);
 assert.equal((await store.read()).revision,'new');assert.equal(store.peek().text,'Do not erase this.');
});

test('a storage failure cannot acknowledge persistence and an explicit retry preserves text/time',async()=>{
 let fail=true;const values=new Map(),storage={getItem:async key=>values.get(key)||null,setItem:async(key,value)=>{if(fail)throw new Error('Storage full');values.set(key,value);}};
 const store=createWorkNoteDraftStore(storage,'job'),record=draft('one','Retained text');await assert.rejects(store.persist(record),/Storage full/);assert.equal(values.size,0);
 fail=false;await store.persist(record);assert.deepEqual(await store.read(),record);
});

test('explicit discard retains evidence and its stale CAS cannot remove newer typing',async()=>{
 const values=new Map(),storage={getItem:async key=>values.get(key)||null,setItem:async(key,value)=>values.set(key,value)},store=createWorkNoteDraftStore(storage,'job');
 const old=draft('old','Archived only by explicit discard');await store.persist(old);await store.archive({...old,state:'discarded'});await store.persist(draft('new','Keep current'));
 const result=await store.compareAndSet('old',value=>({...value,state:'discarded'}));assert.equal(result.changed,false);assert.equal((await store.read()).text,'Keep current');
 assert.equal(JSON.parse(values.get('job:discarded:old')).text,old.text);
});
