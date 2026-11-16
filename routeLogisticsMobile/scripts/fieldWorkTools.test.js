const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), React = require('react');
const { create, act } = require('react-test-renderer'), babel = require('@babel/core');
global.IS_REACT_ACT_ENVIRONMENT = true;
let tree, data, queue, listeners, writes, failure, workDrafts, busyStates, changes, update, visits, visitRequests, visitRecord, visitList, visitCache, cachedVisits, offline, gpsPermission, gpsFix, gpsRequests, permissionRequests, operationSequence, actionsRef, noteDrafts;
async function flushVisits(){if(offline)return;for(const row of queue.filter(row=>row.kind==='visit'&&row.state==='pending')){row.state='syncing';try{const payload={...row.record,jobId:row.jobId,operationId:row.id};visitRequests.push(payload);const result=await visitRecord(payload);if(!result.event?.id||!['manual','manual-gps'].includes(result.event.source))throw new Error('The server did not confirm a saved manual visit report.');row.event=result.event;row.state='synced';row.error='';}catch(error){row.state=String(error.code||'').endsWith('permission-denied')?'conflict':'failed';row.error=error.message;}}listeners.forEach(listener=>listener());}
const panel = ({ children, title, subtitle }) => React.createElement('View', null, title && React.createElement('Text', null, title), subtitle && React.createElement('Text', null, subtitle), children);
const button = ({ title, onPress, busy, disabled }) => React.createElement('Pressable', { accessibilityLabel: title, onPress, disabled: !!busy || !!disabled }, React.createElement('Text', null, title));
const filename = path.resolve(__dirname, '../components/FieldWorkTools.js'), moduleUnderTest = { exports: {} };
const requireMock = name => {
  if (name.startsWith('@babel/runtime/')) return require(name);
  if (name === 'react') return React;
  if (name.endsWith('/services/useJobResources')) return { useJobResourceRefresh: (_resource, id, loader, { enabled }) => { React.useEffect(() => { if (enabled) loader({ query: true }).catch(() => {}); }, [id, enabled]); return { refetch: () => loader().catch(() => {}) }; } };
  if (name === 'react-native') return { View: 'View', Text: 'Text', Pressable: 'Pressable', AppState: { currentState: 'active' }, Linking: { openURL: async () => {} } };
  if (name === 'expo-crypto') return { randomUUID: () => `visit-operation-${++operationSequence}` };
  if (name === 'expo-location') return { Accuracy: { Balanced: 3 }, getForegroundPermissionsAsync: async () => { permissionRequests++; return gpsPermission; }, getCurrentPositionAsync: async () => { gpsRequests++; return gpsFix; }, requestForegroundPermissionsAsync: () => { throw new Error('Visit records must not request permission.'); } };
  if (name.endsWith('/services/firebase')) return { JobService: { updateJob: async (id, patch) => { writes.push({ id, patch }); return update(id, patch); } } };
  if (name.endsWith('/services/tenancy')) return { getClaims: () => ({ role: 'technician' }) };
  if (name.endsWith('/theme/ThemeProvider')) return { useTheme: () => ({ palette: { text: '#FFF', secondary: '#CCC', danger: '#FAA', border: '#888' } }) };
  if (name.endsWith('/services/workspaceApi')) return {
    readWorkspace: async (resource, options) => { assert.equal(resource, 'serviceLogs'); return { logs: data.filter(row => row.jobId === options.jobId) }; },
    callWorkspace: async (name, payload) => { assert.equal(name, 'rlJobVisit'); if (payload.action === 'list') return visitList(payload.jobId); visitRequests.push(payload); return visitRecord(payload); },
  };
  if (name.endsWith('/services/offline')) return {
    offlineVersion:value=>value||null,
    readWorkNoteDraft:async id=>noteDrafts.get(id)||null,
    persistWorkNoteDraft:(job,text,{editedAt}={})=>{const snapshot={jobId:job.id,text,editedAt,revision:`notes-${++operationSequence}`,operationId:`notes-${operationSequence}`,state:'draft',dirty:true};noteDrafts.set(job.id,snapshot);return Promise.resolve(snapshot);},
    saveWorkNoteDraft:async(id,{revision}={})=>{const snapshot=noteDrafts.get(id);assert.ok(snapshot);assert.equal(snapshot.revision,revision);const patch={notes:snapshot.text};writes.push({id,patch});const result=await update(id,patch);if(result.success&&noteDrafts.get(id)?.revision===revision)noteDrafts.set(id,{...snapshot,state:'pending',dirty:false});return result;},
    discardWorkNoteDraft:async(id,{revision}={})=>{const snapshot=noteDrafts.get(id);if(!snapshot||snapshot.state!=='draft'||revision&&snapshot.revision!==revision)return{discarded:false,current:snapshot};noteDrafts.delete(id);return{discarded:true};},
    cachedRead: async(key, loader) => {if(key.startsWith('visits:')&&visitCache)return cachedVisits||{events:[],hasMore:false};const result=await loader();if(key.startsWith('visits:'))cachedVisits=result;return result;}, queuedWork: async () => queue, isOffline: async () => offline,
    subscribeOffline: listener => { listeners.add(listener); return () => listeners.delete(listener); },
    saveApplicationOffline: async (jobId, record) => { if (failure) throw failure; queue.push({ id: 'local-record', kind: 'application', jobId, record, state: 'pending' }); listeners.forEach(listener => listener()); },
    saveVisitOffline:async(job,record)=>{if(failure)throw failure;if(!queue.some(row=>row.id===record.operationId))queue.push({id:record.operationId,kind:'visit',jobId:job.id,record:{...record},state:'pending'});listeners.forEach(listener=>listener());return{success:true,queued:true,operationId:record.operationId};},
    flushOffline:flushVisits,getQueuedOperation:async id=>queue.find(row=>row.id===id),resolveOffline:async id=>{const row=queue.find(row=>row.id===id);if(row)row.state='pending';await flushVisits();return{operationId:id};},
  };
  if (name === './MobileUI') return { Card: panel, SectionHeader: panel, PrimaryButton: button, SecondaryButton: button,
    FormField: ({ label, ...props }) => React.createElement('TextInput', { accessibilityLabel: label, ...props }),
    InlineNotice: ({ message }) => React.createElement('Text', { accessibilityRole: 'alert' }, message), StatusBadge: ({ syncState }) => React.createElement('Text', null, syncState) };
  throw new Error('Unexpected dependency ' + name);
};
const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, presets: [[require.resolve('babel-preset-expo'), { jsxRuntime: 'classic' }]], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
new Function('require', 'module', 'exports', code)(requireMock, moduleUnderTest, moduleUnderTest.exports);
const Work = moduleUnderTest.exports.default;
const selected = overrides => ({ id: 'job', status: 'in-progress', workNotes: 'Original observations', ...overrides });
const props = job => ({ job, draftActionsRef:actionsRef, onDraftChange: value => workDrafts.push(value), onBusyChange: value => busyStates.push(value), onChanged: async () => { changes++; } });
async function render(job = selected()) { await act(async () => { tree = create(React.createElement(Work, props(job))); }); }
const text = () => JSON.stringify(tree.toJSON());
const control = label => tree.root.findAll(node => node.type === 'Pressable' && node.props.accessibilityLabel === label)[0];
async function press(label) { const node = control(label); assert.ok(node, label); assert.equal(node.props.disabled, false); await act(async () => node.props.onPress()); }
async function input(label, value) { await act(async () => tree.root.findByProps({ accessibilityLabel: label }).props.onChangeText(value)); }
beforeEach(() => {
  tree = null; data = []; queue = []; listeners = new Set(); noteDrafts=new Map();writes = []; failure = null; workDrafts = []; busyStates = []; changes = 0; update = async () => ({ success: true, queued: true });
  visits = []; visitRequests = [];visitCache=false;cachedVisits=null;actionsRef={current:null};visitList=async jobId=>({events:visits.filter(event=>!event.jobId||event.jobId===jobId),hasMore:false}); offline = false; gpsPermission = { granted: true }; gpsFix = { coords: { latitude: 35, longitude: -119, accuracy: 15 }, timestamp: Date.now() }; gpsRequests = permissionRequests = operationSequence = 0;
  visitRecord = async payload => { const event = { id: payload.operationId, jobId:payload.jobId,type: payload.type, note: payload.note, source: payload.latitude == null ? 'manual' : 'manual-gps', recordedAt: new Date().toISOString(), capturedAt: payload.capturedAt, accuracy: payload.accuracy }; visits = [event, ...visits]; return { event, duplicate: false }; };
});
afterEach(async () => { if (tree) await act(async () => tree.unmount()); assert.equal(listeners.size, 0); });

test('work notes retain a draft through polling, show failure and retry without duplicate mutations', async () => {
  await render(); await input('Work notes', 'New field observations');
  await act(async () => tree.update(React.createElement(Work, props(selected({ workNotes: 'Updated elsewhere' })))));
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Work notes' }).props.value, 'New field observations');
  update = async () => ({ success: false, error: { message: 'Current assignment must be checked.' } });
  await press('Save work notes'); assert.match(text(), /Current assignment must be checked/); assert.equal(workDrafts.at(-1), true);
  let resolve; update = () => new Promise(done => { resolve = done; });
  const action = control('Save work notes').props.onPress; let first, second;
  await act(async () => { first = action(); second = action(); }); assert.equal(writes.length, 2);
  await act(async () => { resolve({ success: true, queued: true }); await Promise.all([first, second]); });
  assert.equal(workDrafts.at(-1), false); assert.equal(busyStates.at(-1), false); assert.equal(changes, 1);
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Work notes' }).props.value, 'New field observations');
});

test('application records combine safe server history and pending work and validate additions', async () => {
  data = [{ id: 'existing', jobId: 'job', product: 'Existing product', amount: 2, unit: 'oz', targetPest: 'Ants' }];
  await render(); assert.match(text(), /Existing product/);
  await press('Record product application'); assert.equal(workDrafts.at(-1), false);
  await press('Save application'); assert.match(text(), /positive quantity/); assert.equal(queue.length, 0);
  await input('Product', 'New product'); await input('Target pest', 'Termites'); await input('Quantity', '1.5'); await input('Unit', 'oz');
  failure = new Error('Device storage unavailable.'); await press('Save application'); assert.match(text(), /Device storage unavailable/);
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Product' }).props.value, 'New product');
  failure = null; await press('Save application'); assert.equal(queue.length, 1); assert.equal(queue[0].jobId, 'job');
  assert.match(text(), /New product/); assert.match(text(), /pending/); assert.equal(workDrafts.at(-1), false);
});

test('completed visits retain documentation and application history without mutation controls', async () => {
  data = [{ id: 'record', jobId: 'job', product: 'Recorded treatment' }];
  await render(selected({ status: 'completed' }));
  assert.match(text(), /Original observations/); assert.match(text(), /Recorded treatment/);
  for (const label of ['Save work notes', 'Record product application', 'Start work', 'Mark en route', 'Record arrival', 'Record departure', "Couldn't access property"]) assert.equal(control(label), undefined);
});

test('manual access-blocked reports require a reason, persist offline and retain unrelated work-note drafts', async () => {
  await render(); await press("Couldn't access property"); assert.equal(workDrafts.at(-1), true);
  await press('Save visit record'); assert.match(text(), /Describe why the property could not be accessed/); assert.equal(visitRequests.length, 0);
  await input('Work notes','Keep these separate observations.');await input('Visit note', 'Gate locked; called customer.'); offline = true;
  await press('Save visit record'); assert.match(text(), /Saved on device.*waiting to sync/);
  assert.equal(queue[0].record.note,'Gate locked; called customer.');assert.equal(tree.root.findByProps({accessibilityLabel:'Work notes'}).props.value,'Keep these separate observations.');
  assert.equal(workDrafts.at(-1), true); assert.equal(queue.length, 1); assert.equal(visitRequests.length, 0);
  offline = false; await act(async()=>flushVisits());await press('Refresh visit record');
  assert.equal(visitRequests.length, 1); assert.equal(visitRequests[0].jobId, 'job'); assert.equal(visitRequests[0].type, 'access-blocked');
  assert.equal(visitRequests[0].note, 'Gate locked; called customer.'); assert.equal(visitRequests[0].latitude, undefined);
  assert.match(text(), /Reported manually/);assert.equal(queue[0].state,'synced');
  assert.equal(workDrafts.at(-1), true); assert.equal(writes.length, 0); assert.equal(gpsRequests, 0); assert.equal(permissionRequests, 0);
});

test('optional visit GPS uses existing foreground permission and reports source and accuracy', async () => {
  await render(); await press('Record arrival'); await press('Include current GPS');
  gpsPermission = { granted: false }; await press('Save visit record');
  assert.match(text(), /Location permission is off/); assert.equal(visitRequests.length, 0); assert.equal(gpsRequests, 0); assert.equal(workDrafts.at(-1), true);
  gpsPermission = { granted: true }; await press('Save visit record');
  assert.equal(gpsRequests, 1); assert.equal(visitRequests[0].latitude, 35); assert.equal(visitRequests[0].longitude, -119); assert.equal(visitRequests[0].accuracy, 15);
  assert.match(text(), /Reported manually with GPS evidence/); assert.match(text(), /GPS accuracy: ±/); assert.match(text(), /15/);
  assert.equal(writes.length, 0); assert.equal(queue.length, 1);assert.equal(queue[0].state,'synced');
});

test('visit authorization/network failures retain durable evidence and explicit retries keep the same operation identity', async () => {
  await render(); await press('Record departure'); await input('Visit note', 'Departing after treatment.');
  visitRecord = async () => { throw Object.assign(new Error('The current assignment could not be authorized.'), { code: 'functions/permission-denied' }); };
  await press('Save visit record'); assert.match(text(), /current assignment could not be authorized/); assert.equal(workDrafts.at(-1), false);
  assert.equal(queue[0].record.note,'Departing after treatment.');assert.equal(queue[0].state,'conflict');
  const original = { ...visitRequests[0] }; let resolve;
  visitRecord = () => new Promise(done => { resolve = done; });
  const action = control('Retry saved departed event').props.onPress; let first, duplicate;
  await act(async () => { first = action(); duplicate = action(); await Promise.resolve(); });
  assert.equal(visitRequests.length, 2); assert.deepEqual(visitRequests[1], original);
  await act(async () => { resolve({ event: { id: original.operationId, type: 'departed', note: original.note, source: 'manual', recordedAt: new Date().toISOString() }, duplicate: true }); await Promise.all([first, duplicate]); });
  assert.match(text(), /Saved to server/); assert.equal(queue.length,1);assert.equal(workDrafts.at(-1), false); assert.equal(busyStates.at(-1), false);
});

test('visit history labels inferred GPS as evidence and remains readable after completion', async () => {
  visits = [{ id: 'inferred', type: 'arrived', source: 'gps-evidence', recordedAt: '2026-11-13T18:00:00Z', capturedAt: '2026-11-13T17:59:00Z', accuracy: 18, distanceMeters: 30 }];
  await render(selected({ status: 'completed' })); assert.match(text(), /Estimated from GPS evidence/); assert.match(text(), /approximately 30 m/);
  assert.match(text(), /GPS evidence does not verify property access/); assert.equal(control('Record arrival'), undefined);
});

test('stale GPS is rejected without losing the visit note and manual fallback remains available', async () => {
  await render(); await press('Record arrival'); await input('Visit note', 'At the service entrance.'); await press('Include current GPS');
  gpsFix = { ...gpsFix, timestamp: Date.now() - 6 * 60000 };
  await press('Save visit record'); assert.match(text(), /GPS fix is stale or invalid/); assert.equal(visitRequests.length, 0);
  assert.equal(tree.root.findByProps({ accessibilityLabel: 'Visit note' }).props.value, 'At the service entrance.');
  await press('Include current GPS'); await press('Save visit record');
  assert.equal(visitRequests.length, 1); assert.equal(visitRequests[0].latitude, undefined); assert.equal(visitRequests[0].note, 'At the service entrance.');
});

const actionFor=type=>tree.root.findAll(node=>node.type==='Pressable'&&node.props.testID===`visit-action-${type}`)[0];
const manual=(id,type,recordedAt,extra={})=>({id,jobId:'job',type,source:'manual',recordedAt,...extra});

test('arrival/departure buttons are amber until a canonical saved manual report supplies green check and time nearby',async()=>{
 await render();assert.equal(actionFor('arrived').props.style.backgroundColor,'#FEF3C7');assert.equal(actionFor('departed').props.style.backgroundColor,'#FEF3C7');
 await press('Record arrival');assert.match(text(),/This new visit report is not saved yet/);assert.equal(visitRequests.length,0);
 await press('Save visit record');assert.equal(actionFor('arrived').props.style.backgroundColor,'#D1FAE5');assert.equal(actionFor('arrived').props.accessibilityLabel,'Arrival recorded');assert.equal(actionFor('arrived').props.disabled,true);
 const row=tree.root.findByProps({testID:'visit-control-arrived'});const rowText=JSON.stringify(row.toJSON?row.toJSON():row.findAllByType('Text').map(node=>node.children));
 assert.match(rowText,/✓|Saved|Reported manually/);assert.match(text(),/GPS evidence does not verify property access/);assert.ok(control('Record another arrival'));
 await press('Record departure');await press('Save visit record');assert.equal(actionFor('departed').props.style.backgroundColor,'#D1FAE5');assert.equal(actionFor('departed').props.accessibilityLabel,'Departure recorded');
});

test('reopening cached saved history restores green with a Saved earlier label without another write',async()=>{
 await render();await press('Record arrival');await press('Save visit record');const writesBefore=visitRequests.length;
 await act(async()=>tree.unmount());tree=null;visitCache=true;offline=true;await render();
 assert.equal(actionFor('arrived').props.style.backgroundColor,'#D1FAE5');assert.match(text(),/Saved earlier/);assert.equal(visitRequests.length,writesBefore);
});

test('GPS proximity alone cannot turn a manual button green and distant manual GPS stays an unverified report',async()=>{
 visits=[manual('inferred','arrived','2026-11-15T18:00:00Z',{source:'gps-evidence',distanceMeters:25})];await render();assert.equal(actionFor('arrived').props.style.backgroundColor,'#FEF3C7');assert.equal(control('Arrival recorded'),undefined);
 visitRecord=async payload=>({event:manual(payload.operationId,'arrived',new Date().toISOString(),{source:'manual-gps',distanceMeters:10000,accuracy:15}),duplicate:false});
 await press('Record arrival');await press('Include current GPS');await press('Save visit record');assert.equal(actionFor('arrived').props.style.backgroundColor,'#D1FAE5');assert.match(text(),/approximately 10000 m/);assert.match(text(),/GPS evidence does not verify property access/);
});

test('a failed synchronization stays amber and retained evidence cannot be removed by discarding unrelated drafts',async()=>{
 await render();await press('Record arrival');await input('Visit note','At the gate.');visitRecord=async()=>{throw new Error('Network timed out; retry this event.');};
 await press('Save visit record');assert.equal(actionFor('arrived').props.style.backgroundColor,'#FEF3C7');assert.equal(control('Arrival recorded'),undefined);assert.match(text(),/Network timed out/);
 assert.equal(control('Cancel visit record'),undefined);let result;await act(async()=>{result=await actionsRef.current.discardDrafts();});assert.equal(result.success,true);assert.equal(queue.length,1);assert.equal(queue[0].state,'failed');
 assert.equal(actionsRef.current.getDrafts().visitAttempted,false);const original=visitRequests[0].operationId;
 visitRecord=async payload=>({event:manual('server-id','arrived',new Date().toISOString()),duplicate:true});await press('Retry saved arrived event');assert.equal(visitRequests[1].operationId,original);assert.equal(actionFor('arrived').props.style.backgroundColor,'#D1FAE5');
});

test('a missing or inferred event acknowledgement never becomes a green saved manual report',async()=>{
 await render();await press('Record departure');visitRecord=async()=>({event:manual('wrong-source','departed',new Date().toISOString(),{source:'gps-evidence'})});await press('Save visit record');
 assert.equal(actionFor('departed').props.style.backgroundColor,'#FEF3C7');assert.match(text(),/server did not confirm a saved manual visit report/);assert.equal(actionsRef.current.getDrafts().visitAttempted,false);assert.equal(queue.length,1);assert.equal(queue[0].state,'failed');
});

test('a confirmed new arrival resets only the current departure indicator and preserves append-only prior visits',async()=>{
 visits=[manual('arrival-first','arrived','2026-11-15T17:00:00Z'),manual('departure-first','departed','2026-11-15T18:00:00Z')];await render();assert.equal(actionFor('arrived').props.style.backgroundColor,'#D1FAE5');assert.equal(actionFor('departed').props.style.backgroundColor,'#D1FAE5');
 visitRecord=async payload=>{const event=manual(payload.operationId,'arrived','2026-11-15T19:00:00Z');visits=[event,...visits];return{event};};
 await press('Record another arrival');assert.equal(visitRequests.length,0);await press('Save visit record');assert.equal(actionFor('arrived').props.style.backgroundColor,'#D1FAE5');assert.equal(actionFor('departed').props.style.backgroundColor,'#FEF3C7');assert.match(text(),/No departure report saved since the latest manual arrival/);assert.equal(visits.length,3);assert.equal(visitRequests.length,1);
});

test('saved acknowledgements survive stale/failed list refreshes but permission loss clears the indicators',async()=>{
 await render();visitList=async()=>({events:[],hasMore:false});await press('Record arrival');await press('Save visit record');assert.equal(actionFor('arrived').props.style.backgroundColor,'#D1FAE5');assert.equal(cachedVisits.events.length,1);
 visitList=async()=>{throw new Error('Visit list connection failed.');};await press('Refresh visit record');assert.equal(actionFor('arrived').props.style.backgroundColor,'#D1FAE5');assert.match(text(),/Visit list connection failed/);
 visitList=async()=>{throw Object.assign(new Error('This job was reassigned.'),{code:'functions/permission-denied'});};await press('Refresh visit record');assert.equal(actionFor('arrived').props.style.backgroundColor,'#FEF3C7');assert.match(text(),/This job was reassigned/);
});

test('a temporary history refresh failure retains previously authorized server evidence without fabricating a new event',async()=>{
 visits=[manual('existing-history','arrived','2026-11-15T18:00:00Z')];await render();assert.equal(actionFor('arrived').props.style.backgroundColor,'#D1FAE5');
 visitList=async()=>{throw new Error('Temporary history connection failure.');};await press('Refresh visit record');
 assert.equal(actionFor('arrived').props.style.backgroundColor,'#D1FAE5');assert.match(text(),/Temporary history connection failure/);assert.equal(queue.length,0);assert.equal(visitRequests.length,0);
});

test('draft API reads synchronous notes and optional product state and saves without requiring an empty optional log',async()=>{
 await render();assert.equal(actionsRef.current.getDrafts().hasDraft,false);await press('Record product application');assert.equal(actionsRef.current.getDrafts().application,false);assert.equal(workDrafts.at(-1),false);
 await input('Work notes','Saved through completion guard.');assert.equal(actionsRef.current.getDrafts().notes,true);let result;await act(async()=>{result=await actionsRef.current.saveDrafts();});
 assert.equal(result.success,true);assert.equal(actionsRef.current.getDrafts().hasDraft,false);assert.equal(writes[0].patch.notes,'Saved through completion guard.');assert.equal(queue.length,0);
 await input('Product','Optional entered product');assert.equal(actionsRef.current.getDrafts().application,true);await act(async()=>{result=await actionsRef.current.saveDrafts();});assert.equal(result.success,false);assert.match(result.message,/product, target pest and positive quantity/);assert.equal(actionsRef.current.getDrafts().application,true);
 await act(async()=>{result=await actionsRef.current.discardDrafts();});assert.equal(result.success,true);assert.equal(actionsRef.current.getDrafts().hasDraft,false);assert.equal(queue.length,0);
});

test('draft API retains a visit until durable storage succeeds, then completion can continue with queued evidence',async()=>{
 await render();await press('Record departure');failure=new Error('Visit storage unavailable');let result;
 await act(async()=>{result=await actionsRef.current.saveDrafts();});assert.equal(result.success,false);assert.match(result.message,/Visit storage unavailable/);assert.match(text(),/Visit storage unavailable/);assert.equal(actionsRef.current.getDrafts().visitType,'departed');assert.equal(queue.length,0);
 failure=null;offline=true;await act(async()=>{result=await actionsRef.current.saveDrafts();});assert.equal(result.success,true);assert.equal(actionsRef.current.getDrafts().hasDraft,false);assert.equal(queue.length,1);assert.equal(queue[0].state,'pending');assert.equal(visitRequests.length,0);
});

test('switching jobs suppresses old acknowledgements and cannot release a newer job save lock',async()=>{
 await render();await press('Record arrival');let resolveOld,resolveNew;
 visitRecord=()=>new Promise(done=>{resolveOld=done;});const oldAction=control('Save visit record').props.onPress;let oldPending,newPending;
 await act(async()=>{oldPending=oldAction();await Promise.resolve();});const oldHandle=actionsRef.current;
 await act(async()=>tree.update(React.createElement(Work,props(selected({id:'other-job'})))));assert.equal(oldHandle.getDrafts().changed,true);assert.equal(actionFor('arrived').props.style.backgroundColor,'#FEF3C7');
 await press('Record departure');visitRecord=()=>new Promise(done=>{resolveNew=done;});const currentAction=control('Save visit record').props.onPress;
 await act(async()=>{newPending=currentAction();await Promise.resolve();});
 await act(async()=>{resolveOld({event:manual('old-ack','arrived',new Date().toISOString())});await oldPending;});assert.equal(control('Arrival recorded'),undefined);
 await act(async()=>{await currentAction();});assert.equal(visitRequests.length,2);
 await act(async()=>{resolveNew({event:manual('new-ack','departed',new Date().toISOString(),{jobId:'other-job'})});await newPending;});assert.equal(actionFor('departed').props.style.backgroundColor,'#D1FAE5');assert.equal(control('Arrival recorded'),undefined);
});
