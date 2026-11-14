const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const babel = require('@babel/core');
const root = path.resolve(__dirname, '..');

function fixture() {
  const storage = new Map(), copies = [], calls = [], operations = new Map(), modules = new Map();
  let online = true, nextId = 0, syncError = null, hold = null, storageError = null, serviceResult = {status:'synced',version:1};
  const claims = { companyId: 'acme', role: 'technician', membershipId: 'member' };
  const auth = { currentUser: { uid: 'tech', emailVerified: true }, app: { options: { projectId: 'mi-factotum-field-service' } } };
  const job = { id: 'job', companyId: 'acme', assignedTo: 'member', status: 'in-progress', updatedAt: '2026-11-13T10:00:00.000Z' };
  const assertAccess = () => {
    if (!auth.currentUser || !auth.currentUser.emailVerified || !['technician','manager','admin','owner'].includes(claims.role)) throw Object.assign(new Error('Active verified membership required.'), { code: 'functions/permission-denied' });
    if (job.companyId !== claims.companyId || (claims.role === 'technician' && job.assignedTo !== claims.membershipId)) throw Object.assign(new Error('This job is no longer assigned to your workspace.'), { code: 'functions/permission-denied' });
  };
  const workspace = {
    readWorkspace: async (resource, data) => { assert.equal(resource, 'jobs'); assert.equal(data.id, job.id); assertAccess(); return { job: { ...job } }; },
    callWorkspace: async (name, data) => { assertAccess(); calls.push({ name, ...data }); if (syncError) throw syncError; return name==='rlServiceForms'?serviceResult:{ status: 'synced' }; },
  };
  function load(relative) {
    const filename = path.resolve(root, relative);
    if (modules.has(filename)) return modules.get(filename).exports;
    const module = { exports: {} }; modules.set(filename, module);
    const localRequire = createRequire(filename);
    const mockRequire = name => {
      if (name === './workspaceApi') return workspace;
      if (name === '@react-native-async-storage/async-storage') return {
        getItem: async key => storage.get(key) || null,
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
        if (hold) await hold;
        assertAccess(); if (syncError) throw syncError;
        if (operations.has(data.operationId)) return { data: operations.get(data.operationId) };
        if (job.updatedAt !== data.expectedVersion) return { data: { status: 'conflict', version: job.updatedAt, server: { status: job.status } } };
        Object.assign(job, data.patch, { updatedAt: '2026-11-13T10:01:00.000Z' });
        const result = { status: 'synced', version: job.updatedAt }; operations.set(data.operationId, result); return { data: result };
      } };
      if (name.startsWith('.')) { const target = path.resolve(path.dirname(filename), name); return load(target.endsWith('.js') ? target : target + '.js'); }
      return localRequire(name);
    };
    const code = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, configFile: false, babelrc: false, presets: [[require.resolve('babel-preset-expo'), { jsxRuntime: 'classic' }]], plugins: [require.resolve('@babel/plugin-transform-modules-commonjs')] }).code;
    new Function('require','module','exports',code)(mockRequire, module, module.exports);
    return module.exports;
  }
  const offline = load('services/offline.js'), completion = load('services/jobCompletion.js');
  return { ...offline, ...completion, job, claims, auth, copies, calls, operations,
    online: value => { online = value; }, failSync: value => { syncError = value; }, holdSync: value => { hold = value; }, failStorage: value => { storageError = value; }, serviceResult:value=>{serviceResult=value;} };
}
const draft = { actualWorkDone: 'Applied treatment', actualHours: '1.5', completionNotes: 'Work documented.' };

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
  assert.equal(overlaid.status, 'completed'); assert.equal(overlaid.syncState, 'pending');
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
