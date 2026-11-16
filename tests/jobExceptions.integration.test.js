const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const req=require('node:module').createRequire(require('node:path').resolve(__dirname,'../functions/package.json'));
const {initializeApp,deleteApp}=req('firebase-admin/app'),{getFirestore}=req('firebase-admin/firestore');
const {jobExceptionHandlers}=require('../functions/jobExceptions'),{workDataHandlers}=require('../functions/workData'),{hash}=require('../functions/security'),{availabilityRef}=require('../functions/staffAvailability');
let app,db,serial=0;const scopes=[];
before(()=>{if(!/^(127\.0\.0\.1|localhost):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||''))throw Error('Local Firestore emulator required.');app=initializeApp({projectId:'demo-routelogistics'},'job-exception-tests');db=getFirestore(app);});
after(async()=>{if(!db)return;for(const f of scopes){for(const name of ['jobs','rlJobExceptions','rlJobExceptionOperations','rlJobExceptionAudit','rlAudit','rlScheduleLocks','teamMembers','rlStaffAvailability']){for(const row of (await db.collection(name).where('companyId','==',f.id).get()).docs)await row.ref.delete();}await db.doc(`companies/${f.id}`).delete();for(const role of ['owner','tech','tech2','manager','admin'])for(const group of ['job-exception','job-manage'])await db.doc(`rlRateLimits/${hash(`${group}:${f.uid(role)}`)}`).delete();}await deleteApp(app);});
async function fixture(patch={}){
 const id=`exceptions-${process.pid}-${++serial}`,f={id,jobId:`job-${id}`,api:jobExceptionHandlers(db),work:workDataHandlers(db)};scopes.push(f);
 f.uid=role=>`${id}-${role}-uid`;f.member=role=>`${id}-${role}`;
 await db.doc(`companies/${id}`).set({ownerId:f.uid('owner'),isActive:true,timeZone:'America/Los_Angeles'});
 for(const role of ['tech','tech2','manager','admin'])await db.doc(`teamMembers/${f.member(role)}`).set({companyId:id,uid:f.uid(role),role:role.startsWith('tech')?'technician':role,status:'active',name:role});
 await db.doc(`jobs/${f.jobId}`).set({companyId:id,userId:f.uid('owner'),assignedTo:f.member('tech'),assignedToUid:f.uid('tech'),assignedToName:'tech',date:'2030-01-03',time:'09:00',estimatedDuration:1,status:'scheduled',updatedAt:'2030-01-01T00:00:00.000Z',workNotes:'Existing work',photoIds:['keep-photo'],visitEvidence:{arrivedAt:'2029-12-31T18:00:00.000Z'},...patch});
 f.request=(data,role='tech')=>({auth:{uid:f.uid(role),token:{companyId:id,role:role.startsWith('tech')?'technician':role,...(role==='owner'?{}:{membershipId:f.member(role)}),email_verified:true,email:'fixture@example.test'}},data});
 f.job=async()=> (await db.doc(`jobs/${f.jobId}`).get()).data();
 f.submit=async(options={},role='tech')=>f.api(f.request({action:'request',jobId:f.jobId,operationId:'request-operation-123456789',expectedVersion:(await f.job()).updatedAt,reason:'vehicle',notes:'Vehicle needs repair.',...options},role));
 f.close=async(row,action='dismiss',options={},role='manager')=>f.api(f.request({action,jobId:f.jobId,requestId:row.id,expectedRevision:row.revision,expectedVersion:(await f.job()).updatedAt,operationId:`${action}-operation-123456789`,explanation:'Dispatcher reviewed.',...options},role));
 f.assign=async(memberId,options={},role='manager')=>f.work.manageJob(f.request({action:'assign',id:f.jobId,memberId,expectedVersion:(await f.job()).updatedAt,...options},role));
 f.rows=async name=>(await db.collection(name).where('companyId','==',id).get()).docs;
 return f;
}
const withoutSummary=job=>Object.fromEntries(Object.entries(job).filter(([key])=>key!=='reassignmentRequest'));
test('assigned staff request preserves canonical job, existing work and version and returns safe pending summary',async()=>{
 const f=await fixture(),before=await f.job(),result=await f.submit();assert.equal(result.request.status,'pending');assert.equal(result.request.reason,'vehicle');assert.equal(result.request.requestedBy,f.uid('tech'));assert.equal(result.version,before.updatedAt);assert.deepEqual(withoutSummary(await f.job()),before);assert.deepEqual((await f.job()).reassignmentRequest,result.request);assert.equal(result.request.assignmentUid,undefined);assert.equal((await f.rows('rlJobExceptionAudit')).length,1);
});
test('same operation replays and simultaneous different operations retain exactly one pending request',async()=>{
 const f=await fixture();const [a,b]=await Promise.all([f.submit(),f.submit({operationId:'different-operation-123456789',notes:'Do not replace the first accepted reason.'})]);assert.equal(a.request.id,b.request.id);assert.equal((await f.rows('rlJobExceptions')).length,1);assert.equal((await f.rows('rlJobExceptionAudit')).length,1);const replay=await f.submit();assert.equal(replay.replayed,true);await assert.rejects(f.submit({reason:'other'}),{code:'already-exists'});
});
test('wrong assignee, foreign scope, unverified, revoked and anonymous identities cannot submit or manage',async()=>{
 const f=await fixture(),other=await fixture();await assert.rejects(f.submit({},'tech2'),{code:'permission-denied'});await assert.rejects(f.api(other.request({action:'request',jobId:f.jobId,operationId:'foreign-request-123456789',expectedVersion:(await f.job()).updatedAt,reason:'other'})),{code:'permission-denied'});
 const unverified=f.request({action:'request'});unverified.auth.token.email_verified=false;await assert.rejects(f.api(unverified),{code:'failed-precondition'});await assert.rejects(f.api({data:{action:'request'}}),{code:'unauthenticated'});
 const result=await f.submit();await assert.rejects(f.close(result.request,'dismiss',{},'tech'),{code:'permission-denied'});await db.doc(`teamMembers/${f.member('tech')}`).update({status:'inactive'});await assert.rejects(f.submit(),{code:'permission-denied'});
});
test('request and resolution validate reason, operation identity, notes, job revision and request revision',async()=>{
 const f=await fixture();for(const value of [{reason:'invented'},{operationId:'short'},{notes:'x'.repeat(2001)}])await assert.rejects(f.submit(value),{code:'invalid-argument'});await assert.rejects(f.submit({expectedVersion:'stale'}),{code:'aborted'});
 const r=await f.submit();await assert.rejects(f.close(r.request,'dismiss',{expectedRevision:999}),{code:'aborted'});assert.equal((await f.job()).reassignmentRequest.status,'pending');
});
test('dismiss leaves assignment and work unchanged and permits a new request with a new operation',async()=>{
 const f=await fixture(),before=await f.job(),r=await f.submit();const closed=await f.close(r.request);assert.equal(closed.request.status,'dismissed');assert.deepEqual(withoutSummary(await f.job()),before);assert.equal((await f.job()).reassignmentRequest,null);const next=await f.submit({operationId:'second-request-1234567890'});assert.notEqual(next.request.id,r.request.id);assert.equal((await f.rows('rlJobExceptions')).length,2);assert.equal((await f.rows('rlJobExceptionAudit')).length,3);
});
test('manual resolve is authorized metadata-only and cannot close a concurrently changed request',async()=>{
 const f=await fixture(),before=await f.job(),r=await f.submit();const closed=await f.close(r.request,'resolve');assert.equal(closed.request.status,'resolved');assert.equal(closed.request.revision,2);assert.deepEqual(withoutSummary(await f.job()),before);await assert.rejects(f.close(r.request,'dismiss',{operationId:'late-dismiss-operation-12345'}),{code:'aborted'});
});
test('availability-checked reassignment resolves pending request atomically and retains prior work',async()=>{
 const f=await fixture(),before=await f.job(),r=await f.submit();const saved=await f.assign(f.member('tech2'));const job=await f.job();assert.equal(job.assignedTo,f.member('tech2'));assert.equal(job.reassignmentRequest,null);assert.equal(job.workNotes,before.workNotes);assert.deepEqual(job.photoIds,before.photoIds);assert.deepEqual(job.visitEvidence,before.visitEvidence);assert.equal(saved.updatedAt,job.updatedAt);const record=await db.doc(`rlJobExceptions/${r.request.id}`).get();assert.equal(record.get('status'),'resolved');assert.equal(record.get('resolution'),'reassigned');await assert.rejects(f.submit(),{code:'permission-denied'});
});
test('schedule conflicts and office-only targets reject reassignment without resolving its request',async()=>{
 const f=await fixture(),r=await f.submit();await db.doc(`jobs/conflict-${f.id}`).set({...await f.job(),assignedTo:f.member('tech2'),assignedToUid:f.uid('tech2'),reassignmentRequest:null});await assert.rejects(f.assign(f.member('tech2')),{code:'failed-precondition'});assert.equal((await f.job()).reassignmentRequest.id,r.request.id);await db.doc(`jobs/conflict-${f.id}`).delete();await availabilityRef(db,f.id,f.uid('tech2')).set({companyId:f.id,fieldWorkEnabled:false,revision:1});await assert.rejects(f.assign(f.member('tech2')),{code:'failed-precondition'});assert.equal((await db.doc(`rlJobExceptions/${r.request.id}`).get()).get('status'),'pending');
});
test('started work requires explicit management review before reassignment and keeps evidence intact',async()=>{
 const f=await fixture({status:'in-progress'}),r=await f.submit();await assert.rejects(f.assign(f.member('tech2')),error=>error.code==='failed-precondition'&&error.details.reviewStartedWorkRequired===true);assert.equal((await f.job()).reassignmentRequest.id,r.request.id);await f.assign(f.member('tech2'),{reviewStartedWork:true});assert.equal((await f.job()).status,'in-progress');assert.deepEqual((await f.job()).photoIds,['keep-photo']);
});
test('concurrent assignment changes honor the job revision and resolve the request only once',async()=>{
 const f=await fixture(),r=await f.submit(),expectedVersion=(await f.job()).updatedAt;const results=await Promise.allSettled([f.assign(f.member('tech2'),{expectedVersion}),f.assign(null,{expectedVersion})]);assert.equal(results.filter(row=>row.status==='fulfilled').length,1);assert.equal(results.find(row=>row.status==='rejected').reason.code,'aborted');assert.equal((await f.rows('rlJobExceptionAudit')).filter(row=>row.get('action')==='reassigned').length,1);assert.equal((await db.doc(`rlJobExceptions/${r.request.id}`).get()).get('revision'),2);
});
test('list is tenant scoped; technicians see only own pending requests on a currently assigned job',async()=>{
 const f=await fixture(),other=await fixture();const r=await f.submit();await other.submit();assert.equal((await f.api(f.request({action:'list',jobId:f.jobId}))).requests.length,1);assert.equal((await f.api(f.request({action:'list'},'manager'))).requests.length,1);await assert.rejects(f.api(f.request({action:'list'})),{code:'permission-denied'});await assert.rejects(f.api(f.request({action:'list',jobId:other.jobId})),{code:'permission-denied'});await f.close(r.request);assert.equal((await f.api(f.request({action:'list',jobId:f.jobId}))).requests.length,0);
});
for(const status of ['completed','cancelled'])test(`${status} work cannot create a reassignment request`,async()=>{const f=await fixture({status});await assert.rejects(f.submit(),{code:'failed-precondition'});});
