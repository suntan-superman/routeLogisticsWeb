const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');

function fixture() {
  const storage = new Map(), copies = [], calls = [], operations = new Map(), visitOperations=new Map(), modules = new Map();
  let online = true, nextId = 0, syncError = null, hold = null, storageError = null, storageReadHold=null, serviceResult = {status:'synced',version:1};
  const claims = { companyId: 'acme', role: 'technician', membershipId: 'member' };
  const auth = { currentUser: { uid: 'tech', emailVerified: true }, app: { options: { projectId: 'mi-factotum-field-service' } } };
  const job = { id: 'job', companyId: 'acme', assignedTo: 'member', status: 'in-progress', updatedAt: '2026-11-13T10:00:00.000Z' };
  const assertAccess = () => {
    if (!auth.currentUser || !auth.currentUser.emailVerified || !['technician','manager','admin','owner'].includes(claims.role)) throw Object.assign(new Error('Active verified membership required.'), { code: 'functions/permission-denied' });
    if (job.companyId !== claims.companyId || (claims.role === 'technician' && job.assignedTo !== claims.membershipId)) throw Object.assign(new Error('This job is no longer assigned to your workspace.'), { code: 'functions/permission-denied' });
  };
  const workspace = {
    readWorkspace: async (resource, data) => { assert.equal(resource, 'jobs'); assert.equal(data.id, job.id); assertAccess(); return { job: { ...job } }; },
    callWorkspace: async (name, data) => { calls.push({ name, ...data }); if(name==='rlApplyJobOperation') return applyJob(data); assertAccess(); if (syncError) throw syncError;
      if(name==='rlJobVisit'){
        if(visitOperations.has(data.operationId))return visitOperations.get(data.operationId);
        if(data.expectedVersion!==job.updatedAt||data.expectedAssignee!==job.assignedTo)return{status:'conflict',version:job.updatedAt,server:{status:job.status}};
        const version=new Date(Date.parse(job.updatedAt)+1).toISOString(),event={id:`server-${data.operationId}`,jobId:data.jobId,type:data.type,note:data.note,source:data.latitude==null?'manual':'manual-gps',occurredAt:data.occurredAt,recordedAt:new Date().toISOString(),capturedAt:data.capturedAt};
        job.updatedAt=version;const result={status:'synced',version,event};visitOperations.set(data.operationId,result);return result;
      }
      return name==='rlServiceForms'?serviceResult:{ status: 'synced' }; },
  };
  async function applyJob(data) {
    if (hold) await hold;
    assertAccess(); if (syncError) throw syncError;
    if (operations.has(data.operationId)) return operations.get(data.operationId);
    if (job.updatedAt !== data.expectedVersion) return { status: 'conflict', version: job.updatedAt, server: { status: job.status } };
    Object.assign(job, data.patch, { updatedAt: '2026-11-13T10:01:00.000Z' });
    const result = { status: 'synced', version: job.updatedAt }; operations.set(data.operationId, result); return result;
  }
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} }; modules.set(filename, module);
    const localRequire = createRequire(filename);
    const mockRequire = name => {
      if (name === './workspaceApi') return workspace;
      if (name === '@react-native-async-storage/async-storage') return {
        getItem: async key => {if(storageReadHold)await storageReadHold;return storage.get(key) || null;},
        setItem: async (key, value) => { if (storageError) throw storageError; storage.set(key, value); },
        getAllKeys: async () => [...storage.keys()], multiRemove: async keys => keys.forEach(key => storage.delete(key)),
      };
      if (name === '@react-native-community/netinfo') return { fetch: async () => ({ isConnected: online, isInternetReachable: online }) };
      if (name === 'expo-crypto') return { randomUUID: () => `00000000-0000-4000-8000-${String(++nextId).padStart(12, '0')}` };
      if (name === 'expo-file-system/legacy') return { documentDirectory: 'file:///documents/', makeDirectoryAsync: async () => {}, copyAsync: async data => copies.push(data), readAsStringAsync: async () => 'base64', deleteAsync: async () => {} };
      if (name === '../constants/firebase') return { auth, functions: {} };
      if (name === 'react-native') return { AppState: { currentState: 'active' } };
      if (name === './tenancy') return { getClaims: () => claims, requireWorkspace: () => { if (!auth.currentUser || !claims.companyId) throw new Error('Accept your company invitation or refresh your workspace before continuing.'); }, tenantFields: () => ({ userId: auth.currentUser.uid, companyId: claims.companyId }) };
      if (name === 'firebase/functions') return { httpsCallable: (_functions, name) => async data => {
        calls.push({ name, ...data });
        return { data: await applyJob(data) };
      } };
      if (name.startsWith('.')) { const target = path.resolve(path.dirname(filename), name); return load(target.endsWith('.js') ? target : target + '.js'); }
      return localRequire(name);
    };
    const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, presets: [[require.resolve('babel-preset-expo'), { jsxRuntime: 'classic' }]], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
    new Function('require','module','exports',code)(mockRequire, module, module.exports);
    return module.exports;
  }
  const offline = load('services/offline.js'), completion = load('services/jobCompletion.js'), estimateVisits = load('services/estimateVisitOperations.js');
  return { ...offline, ...completion, ...estimateVisits, job, claims, auth, copies, calls, operations, visitOperations, storage, restartOffline:()=>{modules.delete(path.resolve(root,'services/offline.js'));return load('services/offline.js');},
    online: value => { online = value; }, failSync: value => { syncError = value; }, holdSync: value => { hold = value; }, failStorage: value => { storageError = value; }, holdStorageRead:value=>{storageReadHold=value;},serviceResult:value=>{serviceResult=value;} };
}
const draft = { actualWorkDone: 'Applied treatment', actualHours: '1.5', completionNotes: 'Work documented.' };
const visit = (type='arrived',extra={})=>({operationId:`offline-visit-${type}-00000001`,type,note:type==='access-blocked'?'Gate locked; attempted customer contact.':'Field evidence',occurredAt:new Date().toISOString(),...extra});

test('estimate outcome uses the existing durable job queue, deduplicates taps and survives offline restart', async () => {
 const f=fixture();f.online(false);Object.assign(f.job,{appointmentKind:'estimate_visit',billable:false,estimateOutcome:'estimate_pending',inquiryId:'inquiry-1',servicePropertyId:'property-1'});
 const [first,second]=await Promise.all([f.saveEstimateVisitOutcome({...f.job},'quote_needed'),f.saveEstimateVisitOutcome({...f.job},'quote_needed')]);
 assert.equal(first.operationId,second.operationId);assert.equal(first.status,'queued');assert.equal(f.calls.length,0);
 const restarted=f.restartOffline(),rows=await restarted.queuedWork();assert.equal(rows.length,1);assert.equal(rows[0].kind,'job');assert.deepEqual(rows[0].patch,{estimateOutcome:'quote_needed'});assert.equal(rows[0].id,first.operationId);
 const [restored]=await restarted.overlayJobs([{...f.job}]);assert.equal(restored.estimateOutcome,'quote_needed');assert.equal(restored.appointmentKind,'estimate_visit');assert.equal(restored.billable,false);assert.equal(restored.inquiryId,'inquiry-1');
});

test('estimate outcome acknowledgement updates both offline caches without losing property, instructions or nonbillable kind', async () => {
 const f=fixture();f.online(false);Object.assign(f.job,{appointmentKind:'estimate_visit',billable:false,estimateOutcome:'estimate_pending',serviceProperty:{address:'22 Rental Street',label:'Rental',unit:'B'},propertyAccessInstructions:'Gate 1234',dispatchNotes:'Inspect exterior only'});
 const stale={...f.job};await f.writeCache('job-bases',{job:stale});await f.writeCache('job-detail:job',{job:stale,customer:{id:'customer'}});
 const saved=await f.saveEstimateVisitOutcome(stale,'quote_prepared');f.online(true);await f.flushOffline();assert.equal((await f.getQueuedOperation(saved.operationId)).state,'synced');
 const restarted=f.restartOffline(),detail=(await restarted.readCache('job-detail:job')).job,[overlaid]=await restarted.overlayJobs([stale]);
 for(const value of [detail,overlaid]){assert.equal(value.estimateOutcome,'quote_prepared');assert.equal(value.appointmentKind,'estimate_visit');assert.equal(value.billable,false);assert.equal(value.propertyAccessInstructions,'Gate 1234');assert.equal(value.dispatchNotes,'Inspect exterior only');assert.equal(value.serviceProperty.unit,'B');}
 assert.equal(f.operations.size,1);
});

test('separate acknowledged notes and outcomes both restore over an old snapshot without overwriting newer server work',async()=>{
 const f=fixture();f.online(false);Object.assign(f.job,{appointmentKind:'estimate_visit',billable:false,estimateOutcome:'estimate_pending',workNotes:'Old note',notes:'Old note'});const stale={...f.job};
 await f.persistWorkNoteDraft(stale,'Retained estimate observations');await f.saveWorkNoteDraft('job');await f.saveEstimateVisitOutcome(stale,'quote_needed');f.online(true);await f.flushOffline();
 const restarted=f.restartOffline(),[restored]=await restarted.overlayJobs([stale]);assert.equal(restored.workNotes,'Retained estimate observations');assert.equal(restored.estimateOutcome,'quote_needed');
 const [newer]=await restarted.overlayJobs([{...stale,workNotes:'Newer server notes',notes:'Newer server notes',estimateOutcome:'quote_prepared',updatedAt:'2026-11-13T11:00:00.000Z'}]);assert.equal(newer.workNotes,'Newer server notes');assert.equal(newer.estimateOutcome,'quote_prepared');
});

test('estimate completion defaults to quote needed and preserves an explicitly selected outcome without invoicing or activation', async () => {
 for(const selected of [undefined,'customer_declined']){
  const f=fixture();f.online(false);Object.assign(f.job,{appointmentKind:'estimate_visit',billable:false,estimateOutcome:'estimate_pending'});
  const result=await f.completeJob({...f.job},{...draft,...(selected?{estimateOutcome:selected}:{})}),row=await f.getQueuedOperation(result.operationId);
  assert.equal(row.patch.estimateOutcome,selected||'quote_needed');assert.equal(row.patch.status,'completed');assert.equal(row.patch.billable,undefined);assert.equal(row.patch.totalCost,undefined);
  f.online(true);await f.flushOffline();assert.equal(f.job.status,'completed');assert.equal(f.job.estimateOutcome,selected||'quote_needed');assert.equal(f.job.billable,false);assert.equal(f.operations.size,1);assert.ok(f.calls.every(call=>call.name==='rlApplyJobOperation'));
 }
});

test('selected offline estimate outcome and later completion retain the existing revision dependency chain', async()=>{
 const f=fixture();f.online(false);Object.assign(f.job,{appointmentKind:'estimate_visit',billable:false,estimateOutcome:'estimate_pending'});
 const outcome=await f.saveEstimateVisitOutcome({...f.job},'quote_prepared'),[current]=await f.overlayJobs([{...f.job}]);
 const completion=await f.completeJob(current,draft),rows=await f.queuedWork();assert.equal(rows.find(row=>row.id===completion.operationId).versionDependency,outcome.operationId);assert.equal(rows.find(row=>row.id===completion.operationId).patch.estimateOutcome,'quote_prepared');
 f.online(true);await f.flushOffline();assert.equal(f.job.status,'completed');assert.equal(f.job.estimateOutcome,'quote_prepared');assert.equal(f.operations.size,2);assert.ok((await f.queuedWork()).every(row=>row.state==='synced'));
});

test('estimate outcome rejects service, cross-company, foreign-assignment and unverified attempts before queueing',async()=>{
 for(const change of [()=>{},f=>Object.assign(f.job,{appointmentKind:'estimate_visit',companyId:'foreign'}),f=>Object.assign(f.job,{appointmentKind:'estimate_visit',assignedTo:'other'}),f=>{f.job.appointmentKind='estimate_visit';f.auth.currentUser.emailVerified=false;}]){
  const f=fixture();f.online(false);change(f);await assert.rejects(f.saveEstimateVisitOutcome({...f.job},'quote_needed'));assert.equal((await f.queuedWork()).length,0);assert.equal(f.calls.length,0);
 }
});

test('failed estimate outcome retains the same saved choice for an explicit retry without another queue',async()=>{
 const f=fixture();Object.assign(f.job,{appointmentKind:'estimate_visit',billable:false,estimateOutcome:'estimate_pending'});f.failSync(Object.assign(new Error('Outcome authorization needs review.'),{code:'functions/permission-denied'}));
 let operationId;await assert.rejects(f.saveEstimateVisitOutcome({...f.job},'customer_declined'),error=>{operationId=error.operationId;return /authorization needs review/.test(error.message);});
 const row=await f.getQueuedOperation(operationId);assert.equal(row.state,'failed');assert.deepEqual(row.patch,{estimateOutcome:'customer_declined'});assert.equal((await f.queuedWork()).length,1);
 f.failSync(null);const retried=await f.saveEstimateVisitOutcome({...f.job},'customer_declined',{retryOperationId:operationId});assert.equal(retried.status,'synced');assert.equal(f.job.estimateOutcome,'customer_declined');assert.equal(f.operations.size,1);assert.equal((await f.queuedWork()).filter(row=>row.state!=='discarded').length,1);
});

test('typed work notes persist immediately, retain Unicode and edit time on restart, and never auto-publish',async()=>{
 const f=fixture();f.online(false);const text='Árbol junto a la puerta.\nCustomer not home; gate locked.',editedAt=1700000000123;
 const write=f.persistWorkNoteDraft({...f.job},text,{editedAt});
 const key=[...f.storage.keys()].find(key=>key.includes(':draft:work-notes:'));assert.ok(key,'native write started in the caller stack');assert.equal(JSON.parse(f.storage.get(key)).text,text);
 const original=await write,restarted=f.restartOffline(),restored=await restarted.readWorkNoteDraft('job');
 assert.equal(restored.text,text);assert.equal(restored.editedAt,editedAt);assert.equal(restored.revision,original.revision);assert.equal(restored.dirty,true);assert.equal((await restarted.queuedWork()).length,0);assert.equal(f.calls.length,0);
});

test('explicit note Save reuses one immutable operation and recovers pending notes after restart',async()=>{
 const f=fixture();f.online(false);const snapshot=await f.persistWorkNoteDraft({...f.job},'Save once.');
 const first=await f.saveWorkNoteDraft('job',{revision:snapshot.revision}),again=await f.saveWorkNoteDraft('job',{revision:snapshot.revision});assert.equal(first.operationId,again.operationId);
 const restarted=f.restartOffline(),rows=await restarted.queuedWork(),restored=await restarted.readWorkNoteDraft('job');assert.equal(rows.length,1);assert.equal(rows[0].id,snapshot.operationId);assert.deepEqual(rows[0].patch,{notes:'Save once.'});assert.equal(rows[0].workNoteDraft.editedAt,snapshot.editedAt);assert.equal(restored.state,'pending');assert.equal(restored.dirty,false);assert.equal(f.calls.length,0);
});

test('ACK retains canonical work notes in both offline caches and overlays stale detail after restart',async()=>{
 const f=fixture();f.online(false);const stale={...f.job,workNotes:'Old field note',notes:'Old field note',dispatchNotes:'Use the side gate.'};
 await f.writeCache('job-bases',{job:stale});await f.writeCache('job-detail:job',{job:stale,customer:{id:'safe-customer'}});
 await f.persistWorkNoteDraft(stale,'Fresh field observations');await f.saveWorkNoteDraft('job');f.online(true);await f.flushOffline();
 const base=(await f.readCache('job-bases')).job,detail=(await f.readCache('job-detail:job')).job;
 for(const value of [base,detail]){assert.equal(value.workNotes,'Fresh field observations');assert.equal(value.notes,'Fresh field observations');assert.equal(value.dispatchNotes,'Use the side gate.');}
 const restarted=f.restartOffline(),restored=await restarted.readWorkNoteDraft('job'),[overlaid]=await restarted.overlayJobs([stale]);assert.equal(restored.state,'synced');assert.equal(restored.text,'Fresh field observations');assert.equal(restored.serverVersion,f.job.updatedAt);assert.equal(overlaid.workNotes,'Fresh field observations');assert.equal(overlaid.dispatchNotes,'Use the side gate.');
});

test('direct job-note Save preserves validated offline identity and schedule before enqueueing without replacing an existing base',async()=>{
 const f=fixture();f.online(false);const job={...f.job,customerName:'Synthetic customer',date:'2026-11-16',time:'09:15',serviceType:'Synthetic service',dispatchNotes:'Authorized gate instructions'};
 await f.persistWorkNoteDraft(job,'Field observations');await f.saveWorkNoteDraft('job');const before=(await f.readCache('job-bases')).job;assert.equal(before.id,job.id);assert.equal(before.companyId,job.companyId);assert.equal(before.assignedTo,job.assignedTo);assert.equal(before.customerName,job.customerName);assert.equal(before.time,job.time);assert.equal(before.dispatchNotes,job.dispatchNotes);
 f.online(true);await f.flushOffline();const after=(await f.readCache('job-bases')).job;assert.equal(after.id,job.id);assert.equal(after.companyId,job.companyId);assert.equal(after.date,job.date);assert.equal(after.workNotes,'Field observations');
 f.online(false);const richer={...after,customerName:'Existing richer cache',serviceName:'Keep existing detail'};await f.writeCache('job-bases',{job:richer});await f.persistWorkNoteDraft({...job,updatedAt:after.updatedAt},'Second note');await f.saveWorkNoteDraft('job');assert.deepEqual((await f.readCache('job-bases')).job,richer);
});

test('a saved note ACK cannot clear or overwrite newer unsubmitted typing',async()=>{
 const f=fixture();f.online(false);const first=await f.persistWorkNoteDraft({...f.job},'Submitted original');await f.saveWorkNoteDraft('job',{revision:first.revision});
 const latest=await f.persistWorkNoteDraft({...f.job},'Typed after Save; must survive',{editedAt:1700000000555});f.online(true);await f.flushOffline();
 const restored=await f.restartOffline().readWorkNoteDraft('job');assert.equal(restored.revision,latest.revision);assert.equal(restored.text,latest.text);assert.equal(restored.editedAt,latest.editedAt);assert.equal(restored.state,'draft');assert.equal(restored.dirty,true);
 const rows=await f.queuedWork();assert.equal(rows.length,1);assert.equal(rows[0].patch.notes,'Submitted original');assert.equal(rows[0].state,'synced');assert.equal(f.operations.size,1);
});

test('older note ACK and synced overlays cannot replace newer known server notes',async()=>{
 const f=fixture();f.online(false);await f.persistWorkNoteDraft({...f.job},'Old submitted text');await f.saveWorkNoteDraft('job');
 const newer={...f.job,workNotes:'Newer server edit',notes:'Newer server edit',updatedAt:'2026-11-13T12:00:00.000Z'};await f.writeCache('job-bases',{job:newer});await f.writeCache('job-detail:job',{job:newer});
 f.online(true);await f.flushOffline();assert.equal((await f.readCache('job-bases')).job.workNotes,'Newer server edit');assert.equal((await f.readCache('job-detail:job')).job.workNotes,'Newer server edit');assert.equal((await f.overlayJobs([newer]))[0].workNotes,'Newer server edit');
});

test('manager ACK updates canonical workNotes while preserving dispatcher notes and access instructions',async()=>{
 const f=fixture();f.claims.role='manager';f.online(false);const base={...f.job,notes:'Dispatcher directions',dispatchNotes:'Dispatcher directions',workNotes:'Old field work'};await f.writeCache('job-bases',{job:base});await f.persistWorkNoteDraft(base,'Manager field observations');await f.saveWorkNoteDraft('job');f.online(true);await f.flushOffline();
 const saved=(await f.readCache('job-bases')).job;assert.equal(saved.workNotes,'Manager field observations');assert.equal(saved.notes,'Dispatcher directions');assert.equal(saved.dispatchNotes,'Dispatcher directions');
});

test('work-note drafts are exact user/company/role/member/job scoped and wrong assignments cannot persist',async()=>{
 const f=fixture();f.online(false);await f.persistWorkNoteDraft({...f.job},'Private local work');
 assert.equal(await f.readWorkNoteDraft('other-job'),null);
 for(const [target,key,value] of [[f.auth.currentUser,'uid','another-user'],[f.claims,'companyId','other-company'],[f.claims,'role','manager'],[f.claims,'membershipId','other-member']]){const old=target[key];target[key]=value;assert.equal(await f.readWorkNoteDraft('job'),null);target[key]=old;}
 await assert.rejects(f.persistWorkNoteDraft({...f.job,assignedTo:'different'},'No access'),/verified job assignment/);await assert.rejects(f.persistWorkNoteDraft({...f.job,assignedToUid:'different'},'No access'),/verified job assignment/);assert.equal((await f.readWorkNoteDraft('job')).text,'Private local work');
});

test('intentional empty work-note drafts remain dirty through restart and publish only on explicit Save',async()=>{
 const f=fixture();f.online(false);await f.persistWorkNoteDraft({...f.job,workNotes:'Old note'},'');const restarted=f.restartOffline();assert.equal((await restarted.readWorkNoteDraft('job')).text,'');assert.equal((await restarted.readWorkNoteDraft('job')).dirty,true);assert.equal((await restarted.queuedWork()).length,0);
 await restarted.saveWorkNoteDraft('job');assert.deepEqual((await restarted.queuedWork())[0].patch,{notes:''});
});

test('a workspace change during draft hydration cannot return private prior-scope text',async()=>{
 const f=fixture();f.online(false);await f.persistWorkNoteDraft({...f.job},'Private old workspace');let release;f.holdStorageRead(new Promise(resolve=>{release=resolve;}));
 const read=f.readWorkNoteDraft('job');f.claims.companyId='other-company';release();await assert.rejects(read,/workspace changed/);f.holdStorageRead(null);assert.equal(await f.readWorkNoteDraft('job'),null);
});

test('switching scope immediately after Save or Discard cannot act on the new account workspace',async()=>{
 const f=fixture();f.online(false);await f.persistWorkNoteDraft({...f.job},'Original workspace draft');
 const save=f.saveWorkNoteDraft('job');f.claims.companyId='another-company';await assert.rejects(save,/workspace changed/);assert.equal((await f.queuedWork()).length,0);assert.equal(await f.readWorkNoteDraft('job'),null);
 f.claims.companyId='acme';const discard=f.discardWorkNoteDraft('job');f.claims.companyId='another-company';await assert.rejects(discard,/workspace changed/);f.claims.companyId='acme';assert.equal((await f.readWorkNoteDraft('job')).text,'Original workspace draft');assert.equal((await f.queuedWork()).length,0);
});

test('account deletion summary includes retained unsent notes, excludes another user and does not double-count submitted notes',async()=>{
 const f=fixture();f.online(false);await f.persistWorkNoteDraft({...f.job},'Local draft protected by the deletion warning');assert.deepEqual(await f.accountOfflineSummary('tech'),{pendingOperations:1,pendingPhotos:0});assert.deepEqual(await f.accountOfflineSummary('other-user'),{pendingOperations:0,pendingPhotos:0});
 await f.saveWorkNoteDraft('job');assert.deepEqual(await f.accountOfflineSummary('tech'),{pendingOperations:1,pendingPhotos:0});await f.persistWorkNoteDraft({...f.job},'New unsubmitted text');assert.deepEqual(await f.accountOfflineSummary('tech'),{pendingOperations:2,pendingPhotos:0});
});

test('storage failure cannot report a retained draft or queue a save and retries keep edit time',async()=>{
 const f=fixture();f.online(false);f.failStorage(new Error('Device storage full'));await assert.rejects(f.persistWorkNoteDraft({...f.job},'Keep on screen',{editedAt:123}),/storage full/);assert.equal(f.storage.size,0);assert.equal(f.calls.length,0);
 f.failStorage(null);await f.persistWorkNoteDraft({...f.job},'Keep on screen',{editedAt:123});assert.equal((await f.readWorkNoteDraft('job')).editedAt,123);assert.equal((await f.queuedWork()).length,0);
});

test('only explicit matching draft discard hides text and retains its archived evidence',async()=>{
 const f=fixture();f.online(false);const old=await f.persistWorkNoteDraft({...f.job},'Old edit');const current=await f.persistWorkNoteDraft({...f.job},'Retain until confirmed');assert.equal((await f.discardWorkNoteDraft('job',{revision:old.revision})).discarded,false);
 assert.equal((await f.discardWorkNoteDraft('job',{revision:current.revision})).discarded,true);assert.equal(await f.restartOffline().readWorkNoteDraft('job'),null);const archive=[...f.storage.entries()].find(([key])=>key.includes(':discarded:'));assert.equal(JSON.parse(archive[1]).text,current.text);
 const submitted=await f.persistWorkNoteDraft({...f.job},'Queued evidence remains');await f.saveWorkNoteDraft('job');assert.equal((await f.discardWorkNoteDraft('job',{revision:submitted.revision})).discarded,false);assert.equal((await f.queuedWork())[0].patch.notes,'Queued evidence remains');
});

test('reviewed conflict retries retain the note revision and cannot recreate its superseded operation ID',async()=>{
 const f=fixture();f.online(false);const original=await f.persistWorkNoteDraft({...f.job},'Captured conflict evidence');await f.saveWorkNoteDraft('job');f.job.updatedAt='2026-11-13T10:00:30.000Z';f.online(true);await f.flushOffline();assert.equal((await f.readWorkNoteDraft('job')).state,'conflict');
 const retry=await f.resolveOffline(original.operationId,'retry');await f.flushOffline();assert.notEqual(retry.operationId,original.operationId);
 const restored=await f.restartOffline().readWorkNoteDraft('job');assert.equal(restored.state,'synced');assert.equal(restored.operationId,retry.operationId);assert.equal(restored.revision,original.revision);assert.equal(restored.text,original.text);
 const saved=await f.saveWorkNoteDraft('job',{revision:original.revision});assert.equal(saved.operationId,retry.operationId);assert.equal((await f.queuedWork()).length,1);assert.equal(f.operations.size,1);
});

for(const type of ['arrived','departed','access-blocked'])test(`offline ${type} evidence persists its identity/time before acknowledgement and survives a process restart`,async()=>{
  const f=fixture();f.online(false);const original=visit(type);
  const receipt=await f.saveVisitOffline({...f.job},original);assert.equal(receipt.operationId,original.operationId);assert.equal(f.calls.length,0);
  const restarted=f.restartOffline(),[row]=await restarted.queuedWork();assert.equal(row.kind,'visit');assert.equal(row.state,'pending');assert.equal(row.attribution.userId,'tech');assert.equal(row.attribution.companyId,'acme');assert.equal(row.record.occurredAt,original.occurredAt);assert.equal(row.record.latitude,undefined);
  f.online(true);await restarted.flushOffline();await restarted.flushOffline();const saved=await restarted.getQueuedOperation(original.operationId);
  assert.equal(saved.state,'synced');assert.equal(saved.event.occurredAt,original.occurredAt);assert.equal(f.visitOperations.size,1);assert.equal(f.calls.filter(call=>call.name==='rlJobVisit').length,1);
});

test('visit storage failure retains the unsaved event and cannot report or send a durable operation',async()=>{
 const f=fixture();f.online(false);f.failStorage(new Error('Storage full.'));await assert.rejects(f.saveVisitOffline({...f.job},visit()),/Storage full/);f.failStorage(null);assert.equal((await f.queuedWork()).length,0);assert.equal(f.calls.length,0);
});

test('arrival, work notes, departure and completion inherit only their explicit acknowledged revision chain',async()=>{
 const f=fixture();f.online(false);await f.writeCache('job-bases',{job:{...f.job}});
 await f.saveVisitOffline({...f.job},visit());await f.saveJobOffline('job',{notes:'Preserved offline observations'});await f.saveVisitOffline({...f.job},visit('departed'));
 const result=await f.completeJob({...f.job},draft);assert.equal(result.status,'queued');const before=await f.queuedWork();assert.equal(before.length,4);
 f.online(true);await f.flushOffline();const after=await f.queuedWork();assert.ok(after.every(row=>row.state==='synced'));assert.equal(f.job.status,'completed');assert.equal(f.visitOperations.size,2);
 const revisionCalls=f.calls.filter(call=>['rlJobVisit','rlApplyJobOperation'].includes(call.name));
 assert.deepEqual(revisionCalls.map(call=>call.name),['rlJobVisit','rlApplyJobOperation','rlJobVisit','rlApplyJobOperation']);
 for(let index=1;index<after.length;index++)assert.equal(revisionCalls[index].expectedVersion,after[index-1].serverVersion);
});

test('reassigned or changed jobs retain visit conflicts and block dependent completion without rebasing the evidence',async()=>{
 for(const reassign of [false,true]){
  const f=fixture();f.online(false);const original=visit();await f.saveVisitOffline({...f.job},original);await f.completeJob({...f.job},draft);
  if(reassign)f.job.assignedTo='another-member';else f.job.updatedAt='2026-11-13T10:30:00.000Z';
  f.online(true);await f.flushOffline();const [event,completion]=await f.queuedWork();assert.equal(event.state,'conflict');assert.equal(completion.state,'pending');assert.equal(f.job.status,'in-progress');assert.equal(f.calls.some(call=>call.name==='rlApplyJobOperation'),false);
  const pinned=event.expectedVersion;await f.resolveOffline(event.id,'retry');await f.flushOffline();const retained=await f.getQueuedOperation(event.id);assert.equal(retained.id,original.operationId);assert.equal(retained.expectedVersion,pinned);assert.equal(retained.record.occurredAt,original.occurredAt);
  await assert.rejects(f.resolveOffline(event.id,'discard'),/retained for management/);
 }
});

test('a previously acknowledged visit replay returns its original identity once and does not create another record',async()=>{
 const f=fixture();f.online(false);const original=visit('arrived',{latitude:35,longitude:-119,accuracy:15,capturedAt:new Date().toISOString()});await f.saveVisitOffline({...f.job},original);f.online(true);await f.flushOffline();
 const row=await f.getQueuedOperation(original.operationId),key=[...f.storage.keys()].find(key=>key.endsWith(':queue'));
 const rows=JSON.parse(f.storage.get(key));rows[0].state='syncing';f.storage.set(key,JSON.stringify(rows));
 const restarted=f.restartOffline();await restarted.flushOffline();assert.equal(f.visitOperations.size,1);assert.equal((await restarted.getQueuedOperation(original.operationId)).event.id,row.event.id);
 assert.equal(f.calls.filter(call=>call.name==='rlJobVisit').length,2);
});

test('lost visit acknowledgement cannot rebase dependent evidence onto an unrelated later server revision',async()=>{
 const f=fixture();f.online(false);const arrival=visit(),departure=visit('departed');await f.saveVisitOffline({...f.job},arrival);await f.saveVisitOffline({...f.job},departure);
 // Simulate the server having committed the first event before the device died,
 // then a separate dispatcher edit. Only its original receipt may advance the chain.
 const firstVersion='2026-11-13T10:00:00.001Z';
 f.visitOperations.set(arrival.operationId,{status:'synced',version:firstVersion,event:{id:'saved-arrival',jobId:'job',type:'arrived',source:'manual',occurredAt:arrival.occurredAt,recordedAt:new Date().toISOString()}});
 f.job.updatedAt='2026-11-13T12:00:00.000Z';f.online(true);await f.flushOffline();const rows=await f.queuedWork();
 assert.equal(rows[0].state,'synced');assert.equal(rows[1].expectedVersion,firstVersion);assert.equal(rows[1].state,'conflict');assert.equal(f.visitOperations.size,1);assert.equal(f.job.updatedAt,'2026-11-13T12:00:00.000Z');
});

test('an upgrade preserves the previous release unsent same-baseline notes/completion chain without rebasing attempted changes',async()=>{
 const f=fixture();f.online(false);await f.writeCache('job-bases',{job:{...f.job}});
 await f.saveJobOffline('job',{notes:'Legacy offline observations'});await f.completeJob({...f.job},draft);
 const key=[...f.storage.keys()].find(key=>key.endsWith(':queue')),rows=JSON.parse(f.storage.get(key));
 for(const row of rows){delete row.baseVersion;delete row.versionDependency;delete row.submittedAt;}
 f.storage.set(key,JSON.stringify(rows));const restarted=f.restartOffline();f.online(true);await restarted.flushOffline();
 const saved=await restarted.queuedWork();assert.ok(saved.every(row=>row.state==='synced'));assert.equal(f.job.status,'completed');assert.equal(f.job.notes,'Legacy offline observations');
 const core=require('../services/offlineQueueCore'),attempted=[{id:'first',kind:'job',jobId:'job',expectedVersion:'baseline',state:'pending',attempts:0},{id:'already-sent',kind:'job',jobId:'job',expectedVersion:'baseline',state:'pending',attempts:1}];
 core.restoreLegacyDependencies(attempted);assert.equal(attempted[1].versionDependency,undefined);assert.equal(attempted[1].expectedVersion,'baseline');
});

test('visit queues are isolated by UID/company and malformed optional GPS is never fabricated',async()=>{
 const f=fixture();f.online(false);await f.saveVisitOffline({...f.job},visit());f.auth.currentUser.uid='another-user';assert.equal((await f.queuedWork()).length,0);f.auth.currentUser.uid='tech';f.claims.companyId='other';assert.equal((await f.queuedWork()).length,0);f.claims.companyId='acme';assert.equal((await f.queuedWork()).length,1);
 await assert.rejects(f.saveVisitOffline({...f.job},visit('departed',{latitude:35,longitude:-119,accuracy:null,capturedAt:new Date().toISOString()})),/GPS sample/);
 assert.equal((await f.queuedWork()).length,1);
});

test('offline work-note overlays and cached jobs preserve separate dispatcher access instructions', async () => {
  const f = fixture(), instructions = 'Synthetic gate code 2468\nUse the side entrance.';
  Object.assign(f.job, { dispatchNotes: instructions, notes: 'Earlier field observations', workNotes: 'Earlier field observations' });
  const base = { ...f.job };
  await f.writeCache('job-bases', { [base.id]: base });
  f.online(false);
  await f.saveJobOffline(base.id, { notes: 'New offline observations' });
  const [pending] = await f.overlayJobs([base]);
  assert.equal(pending.dispatchNotes, instructions);
  assert.equal(pending.notes, 'New offline observations');
  assert.equal(pending.syncPatch.notes, 'New offline observations');
  assert.equal(pending.syncPatch.dispatchNotes, undefined);
  const saved = (await f.readCache('job-bases'))[base.id];
  assert.equal(saved.dispatchNotes, instructions);
  assert.equal(saved.workNotes, 'Earlier field observations');
  assert.equal(f.calls.length, 0);
});

test('completion synchronizes once and concurrent duplicate taps share one operation', async () => {
  const f = fixture(); let release;
  f.holdSync(new Promise(resolve => { release = resolve; }));
  const first = f.completeJob({ ...f.job }, draft), second = f.completeJob({ ...f.job }, draft);
  assert.equal(first, second); release();
  const result = await first;
  assert.equal(result.status, 'synced'); assert.equal(f.job.status, 'completed');
  assert.equal(f.calls.filter(row => row.name === 'rlApplyJobOperation').length, 1);
  assert.equal((await f.queuedWork()).length, 1);
});

test('offline completion is durably queued with a stable job ID and visible pending status', async () => {
  const f = fixture(); f.online(false);
  const result = await f.completeJob({ ...f.job }, draft);
  assert.equal(result.status, 'queued'); assert.equal(result.jobId, 'job');
  assert.equal(f.job.status, 'in-progress'); assert.equal(f.calls.length, 0);
  const rows = await f.queuedWork(); assert.equal(rows.length, 1); assert.equal(rows[0].id, result.operationId);
  const [overlaid] = await f.overlayJobs([{ ...f.job }]);
  assert.equal(overlaid.status, 'in-progress'); assert.equal(overlaid.serverStatus, 'in-progress');
  assert.equal(overlaid.localCompletionPending, true); assert.equal(overlaid.syncPatch.status, 'completed');
  assert.equal(overlaid.syncState, 'pending');
  const repeat = await f.completeJob({ ...f.job }, draft);
  assert.equal(repeat.operationId, result.operationId); assert.equal((await f.queuedWork()).length, 1);
});

test('a manager-reopened job uses a new completion operation instead of replaying an older success', async () => {
  const f = fixture();
  const first = await f.completeJob({ ...f.job }, draft);
  f.job.status = 'in-progress'; f.job.updatedAt = '2026-11-13T10:02:00.000Z';
  const second = await f.completeJob({ ...f.job }, draft);
  assert.equal(second.status, 'synced'); assert.notEqual(second.operationId, first.operationId);
  assert.equal(f.calls.filter(row => row.name === 'rlApplyJobOperation').length, 2);
});

test('server denial is actionable and failed completion does not mark the job completed', async () => {
  const f = fixture(); f.failSync(Object.assign(new Error('This job is no longer assigned to your workspace.'), { code: 'functions/permission-denied' }));
  let failure;
  try { await f.completeJob({ ...f.job }, draft); } catch (error) { failure = error; }
  assert.equal(failure.code, 'functions/permission-denied'); assert.ok(failure.operationId);
  assert.match(failure.message, /no longer assigned/);
  const [row] = await f.overlayJobs([{ ...f.job }]);
  assert.equal(row.status, 'in-progress'); assert.equal(row.syncState, 'failed');
  f.failSync(null);
  const result = await f.completeJob({ ...f.job }, draft, { retryOperationId: failure.operationId });
  assert.equal(result.status, 'synced'); assert.equal(result.operationId, failure.operationId);
  assert.equal((await f.queuedWork()).length, 1);
});

test('invalid fields, unverified accounts, wrong assignment and cancelled jobs cannot queue completion', async () => {
  for (const mutate of [f => { f.auth.currentUser.emailVerified = false; }, f => { f.job.assignedTo = 'another'; }, f => { f.job.status = 'cancelled'; }, f => { f.job.companyId = 'other-company'; }]) {
    const f = fixture(); mutate(f);
    await assert.rejects(f.completeJob({ ...f.job }, draft)); assert.equal((await f.queuedWork()).length, 0);
  }
  const f = fixture();
  await assert.rejects(f.completeJob({ ...f.job }, { ...draft, actualWorkDone: '  ' }), /Describe the work/);
  await assert.rejects(f.completeJob({ ...f.job }, { ...draft, actualHours: '-1' }), /actual work hours/);
  assert.equal((await f.queuedWork()).length, 0);
});

test('conflicting completion preserves details and requires explicit retry against reviewed server version', async () => {
  const f = fixture(); f.online(false);
  const queued = await f.completeJob({ ...f.job }, draft);
  f.online(true); f.job.updatedAt = '2026-11-13T10:00:30.000Z';
  await f.flushOffline();
  await assert.rejects(f.completeJob({ ...f.job }, draft), error => error.code === 'conflict' && error.operationId === queued.operationId);
  const [overlaid] = await f.overlayJobs([{ ...f.job }]); assert.equal(overlaid.status, 'in-progress'); assert.equal(overlaid.syncState, 'conflict');
  const retried = await f.completeJob({ ...f.job }, draft, { retryOperationId: queued.operationId });
  assert.equal(retried.status, 'synced'); assert.notEqual(retried.operationId, queued.operationId);
  assert.equal((await f.queuedWork()).length, 1);
});

test('photo queue preserves metadata, copied file and scoped operation when offline or persistence fails', async () => {
  const f = fixture(); f.online(false);
  const id = await f.savePhotoOffline({ ...f.job }, 'file:///selected.jpg', { source: 'library', fileName: 'evidence.jpg', mimeType: 'image/jpeg', width: 800, height: 600, arbitrary: 'never persist' });
  const row = await f.getQueuedOperation(id);
  assert.equal(row.jobId, 'job'); assert.equal(row.state, 'pending'); assert.equal(row.attribution.companyId, 'acme');
  assert.deepEqual(row.metadata, { source: 'library', fileName: 'evidence.jpg', mimeType: 'image/jpeg', width: 800, height: 600 });
  assert.match(row.localUri, /^file:\/\/\/documents\/rl-photos\//);
  f.failStorage(new Error('Storage full.'));
  await assert.rejects(f.savePhotoOffline({ ...f.job }, 'file:///selected-still-available.jpg'), /Storage full/);
  assert.equal(f.copies.at(-1).from, 'file:///selected-still-available.jpg');
  assert.equal((await f.queuedWork()).length, 1);
});

test('service reports queue durably with a pinned template and reject duplicate pending saves or unauthorized jobs', async () => {
  const f = fixture(); f.online(false);
  const template={id:'pool-maintenance',version:1,name:'Pool maintenance',fields:[{id:'ph',label:'pH',type:'number',unit:'pH'}]};
  await f.writeCache(`service-form:${f.job.id}`,{enabled:true,form:{template,assignmentVersion:1,responseVersion:0,answers:{}}});
  const record={templateId:template.id,templateVersion:1,assignmentVersion:1,expectedVersion:0,status:'completed',answers:{ph:7.4}};
  const result=await f.saveServiceFormOffline({...f.job},record);
  const row=await f.getQueuedOperation(result.operationId);
  assert.equal(row.kind,'service-form'); assert.equal(row.jobId,f.job.id); assert.equal(row.record.templateVersion,1); assert.equal(row.record.answers.ph,7.4);
  await assert.rejects(f.saveServiceFormOffline({...f.job},record),/already saved/);
  await assert.rejects(f.saveServiceFormOffline({...f.job,companyId:'another'},record),/assignment/);
  await assert.rejects(f.saveServiceFormOffline({...f.job,assignedTo:'another'},record),/assignment/);
  assert.equal((await f.queuedWork()).length,1);
  f.online(true); await f.flushOffline(); assert.equal((await f.getQueuedOperation(result.operationId)).state,'synced');
  assert.equal(f.calls.filter(row=>row.name==='rlServiceForms').length,1); assert.equal(f.calls.filter(row=>row.name==='rlJobPhoto').length,0);
});

test('service conflicts require reviewed response versions and cannot silently adopt a different assigned template', async()=>{
  const f=fixture();f.online(false);const template={id:'pool-maintenance',version:1,name:'Pool maintenance',fields:[]};
  await f.writeCache('service-form:job',{enabled:true,form:{template,assignmentVersion:1,responseVersion:0}});
  const record={templateId:template.id,templateVersion:1,assignmentVersion:1,expectedVersion:0,status:'draft',answers:{}};
  const saved=await f.saveServiceFormOffline({...f.job},record);await f.flushOffline();f.serviceResult({status:'conflict',version:3,server:{assignmentVersion:1,responseVersion:3,answers:{}}});f.online(true);await f.flushOffline();
  assert.equal((await f.getQueuedOperation(saved.operationId)).state,'conflict');f.online(false);
  const retried=await f.resolveOffline(saved.operationId,'retry');const row=await f.getQueuedOperation(retried.operationId);
  assert.notEqual(row.id,saved.operationId);assert.equal(row.record.expectedVersion,3);assert.equal(row.record.assignmentVersion,1);
  await f.flushOffline();f.serviceResult({status:'conflict',version:0,server:{assignmentVersion:2,responseVersion:0,answers:{}}});f.online(true);await f.flushOffline();f.online(false);
  await assert.rejects(f.resolveOffline(row.id,'retry'),/assigned service template changed/);
});

test('job completion waits for an earlier service report to synchronize or be explicitly discarded',async()=>{
  const f=fixture();f.online(false);const template={id:'pool-maintenance',version:1,name:'Pool maintenance',fields:[]};
  await f.writeCache('service-form:job',{enabled:true,form:{template,assignmentVersion:1,responseVersion:0}});
  const saved=await f.saveServiceFormOffline({...f.job},{templateId:template.id,templateVersion:1,assignmentVersion:1,expectedVersion:0,status:'draft',answers:{}});
  await f.completeJob({...f.job},draft);f.serviceResult({status:'conflict',version:1,server:{assignmentVersion:1,responseVersion:1}});f.online(true);await f.flushOffline();
  assert.equal(f.job.status,'in-progress');assert.equal(f.calls.filter(row=>row.name==='rlApplyJobOperation').length,0);
  f.online(false);await f.resolveOffline(saved.operationId,'discard');await f.flushOffline();f.online(true);await f.flushOffline();assert.equal(f.job.status,'completed');
});
