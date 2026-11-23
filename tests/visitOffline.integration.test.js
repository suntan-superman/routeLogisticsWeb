const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const req=require('node:module').createRequire(require('node:path').resolve(__dirname,'../functions/package.json'));
const {initializeApp,deleteApp}=req('firebase-admin/app'),{getFirestore}=req('firebase-admin/firestore');
const {locationHandlers}=require('../functions/locations'),{offlineHandler}=require('../functions/offline');
let app,db,sequence=0;
before(()=>{if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Local Firestore emulator required; production is forbidden.');app=initializeApp({projectId:'demo-routelogistics'},'offline-visit-tests');db=getFirestore(app);});
after(()=>deleteApp(app));
async function fixture(){
 const companyId=`visit-offline-${++sequence}`,uid=`${companyId}-tech`,memberId=`${companyId}-member`,jobId=`${companyId}-job`,ownerId=`${companyId}-owner`;
 const clock=Date.parse('2026-11-16T18:00:00Z'),version='2026-11-15T10:00:00.000Z';
 await db.doc(`companies/${companyId}`).set({ownerId,timeZone:'America/Los_Angeles'});await db.doc(`teamMembers/${memberId}`).set({uid,companyId,role:'technician',status:'active'});
 await db.doc(`jobs/${jobId}`).set({companyId,assignedTo:memberId,assignedToUid:uid,status:'in-progress',date:'2026-11-15',updatedAt:version,latitude:35,longitude:-119});
 const auth={uid,token:{companyId,membershipId:memberId,role:'technician',email_verified:true}},owner={uid:ownerId,token:{companyId,role:'owner',email_verified:true}};
 const handlers=locationHandlers(db,{now:()=>clock}),request=(data,caller=auth)=>({auth:caller,data});
 const payload=(type='arrived',extra={})=>({action:'record',evidenceVersion:1,allowCompatibleRevision:true,expectedJobState:{date:'2026-11-15'},jobId,operationId:`${companyId}-${type}-operation`,type,note:type==='access-blocked'?'Gate locked; contacted dispatcher.':'Original field report',occurredAt:new Date(clock-2*86400000).toISOString(),expectedVersion:version,expectedAssignee:memberId,...extra});
 return{companyId,uid,memberId,jobId,clock,version,auth,owner,handlers,request,payload,job:db.doc(`jobs/${jobId}`)};
}
for(const type of ['arrived','departed','access-blocked'])test(`delayed ${type} evidence retains original time and current authenticated identity without fabricating GPS`,async()=>{
 const f=await fixture(),data=f.payload(type),result=await f.handlers.visit(f.request(data));
 assert.equal(result.status,'synced');assert.equal(result.event.occurredAt,data.occurredAt);assert.equal(result.event.recordedAt,new Date(f.clock).toISOString());assert.equal(result.event.userId,f.uid);assert.equal(result.event.memberId,f.memberId);assert.equal(result.event.companyId,f.companyId);assert.equal(result.event.source,'manual');assert.equal(result.event.latitude,undefined);assert.equal(result.event.accuracy,undefined);
 const job=await f.job.get();assert.equal(job.get('status'),'in-progress');assert.equal(job.get('updatedAt'),result.version);assert.equal(job.get(`visitEvidence.${{arrived:'arrivedAt',departed:'departedAt','access-blocked':'accessBlockedAt'}[type]}`),data.occurredAt);
});
test('offline GPS is checked against the original event time rather than the later upload time',async()=>{
 const f=await fixture(),data=f.payload('arrived',{latitude:35,longitude:-119,accuracy:15,capturedAt:new Date(f.clock-2*86400000).toISOString()});
 const result=await f.handlers.visit(f.request(data));assert.equal(result.event.source,'manual-gps');assert.equal(result.event.accuracy,15);assert.equal(result.event.occurredAt,data.occurredAt);assert.equal(result.event.capturedAt,data.capturedAt);assert.equal(result.event.verifiedAccess,false);
 assert.equal((await db.doc(`rlJobVisits/${result.event.id}`).get()).get('latitude'),undefined,'raw coordinates must not become immutable GPS history');
});
test('accepted delayed evidence replays exactly once after later job changes and rejects a reused identity with altered content',async()=>{
 const f=await fixture(),data=f.payload(),first=await f.handlers.visit(f.request(data));
 await f.job.update({status:'completed',updatedAt:'2026-11-16T19:00:00.000Z'});
 const duplicate=await f.handlers.visit(f.request(data));assert.equal(duplicate.duplicate,true);assert.equal(duplicate.version,first.version);assert.equal(duplicate.event.id,first.event.id);
 assert.equal((await db.collection('rlJobVisits').where('companyId','==',f.companyId).get()).size,1);
 await assert.rejects(f.handlers.visit(f.request({...data,note:'Changed retry'})),{code:'already-exists'});
 await f.job.update({assignedTo:'someone-else',assignedToUid:'someone-else'});await assert.rejects(f.handlers.visit(f.request(data)),{code:'permission-denied'});
});
test('append-only visit evidence safely reconciles a compatible revision while retaining original time and audit versions',async()=>{
 const f=await fixture(),data=f.payload();await f.job.update({updatedAt:'2026-11-16T17:00:00.000Z',workNotes:'New online work'});
 const result=await f.handlers.visit(f.request(data));assert.equal(result.status,'synced');assert.equal(result.reconciled,true);assert.equal(result.event.occurredAt,data.occurredAt);assert.equal((await f.job.get()).get('workNotes'),'New online work');
 const event=await db.doc(`rlJobVisits/${result.event.id}`).get();assert.equal(event.get('originalJobVersion'),f.version);assert.equal(event.get('reconciledJobVersion'),'2026-11-16T17:00:00.000Z');assert.equal(event.get('revisionReconciled'),true);
});
test('a changed service date or property remains a genuine conflict even when the technician is still assigned',async()=>{
 const f=await fixture(),data=f.payload();await f.job.update({updatedAt:'2026-11-16T17:00:00.000Z',date:'2026-11-17',address:'A different service property'});
 const result=await f.handlers.visit(f.request(data));assert.equal(result.status,'conflict');assert.match(result.message,/schedule, service property/);
 assert.equal((await db.collection('rlJobVisits').where('companyId','==',f.companyId).get()).size,0);
});
test('legacy callers, changed assignments, closed jobs and deleted jobs cannot use compatible reconciliation to bypass state checks',async()=>{
 const legacy=await fixture(),legacyData=legacy.payload();delete legacyData.allowCompatibleRevision;await legacy.job.update({updatedAt:'2026-11-16T17:00:00.000Z'});
 assert.equal((await legacy.handlers.visit(legacy.request(legacyData))).status,'conflict');assert.equal((await db.collection('rlJobVisits').where('companyId','==',legacy.companyId).get()).size,0);
 const reassigned=await fixture(),data=reassigned.payload();await reassigned.job.update({assignedTo:'other'});await assert.rejects(reassigned.handlers.visit(reassigned.request(data)),{code:'permission-denied'});
 const cancelled=await fixture();await cancelled.job.update({status:'cancelled',updatedAt:'2026-11-16T17:00:00.000Z'});await assert.rejects(cancelled.handlers.visit(cancelled.request(cancelled.payload())),error=>error.code==='failed-precondition'&&error.details?.reason==='job-closed');
 const deleted=await fixture();await deleted.job.delete();await assert.rejects(deleted.handlers.visit(deleted.request(deleted.payload())),{code:'permission-denied'});
});
test('current member, verified identity and company isolation are rechecked on every replay',async()=>{
 const f=await fixture(),other=await fixture(),data=f.payload();await assert.rejects(other.handlers.visit(other.request(data)),{code:'permission-denied'});
 await assert.rejects(f.handlers.visit(f.request(data,{...f.auth,token:{...f.auth.token,email_verified:false}})),{code:'failed-precondition'});
 await db.doc(`teamMembers/${f.memberId}`).update({status:'removed'});await assert.rejects(f.handlers.visit(f.request(data)),{code:'permission-denied'});
 assert.equal((await db.collection('rlJobVisits').where('companyId','==',f.companyId).get()).size,0);
});
test('a verified personal account without a company cannot submit offline job operations',async()=>{
 const f=await fixture(),apply=offlineHandler(db),data={jobId:f.jobId,operationId:`${f.companyId}-personal-operation`,expectedVersion:f.version,patch:{notes:'Should not reach the company job'}};
 await assert.rejects(apply(f.request(data,{uid:`${f.companyId}-personal`,token:{email_verified:true}})),{code:'permission-denied'});
 assert.equal((await f.job.get()).get('workNotes'),undefined);
});
test('the visit transaction rejects membership revocation occurring after the initial authorization read',async()=>{
 const f=await fixture();let transactions=0;
 const proxy=new Proxy(db,{get(target,property){if(property==='runTransaction')return async(...args)=>{transactions++;if(transactions===2)await db.doc(`teamMembers/${f.memberId}`).update({status:'removed'});return target.runTransaction(...args);};const value=target[property];return typeof value==='function'?value.bind(target):value;}});
 const handler=locationHandlers(proxy,{now:()=>f.clock});await assert.rejects(handler.visit(f.request(f.payload())),{code:'permission-denied'});
 assert.equal((await db.collection('rlJobVisits').where('companyId','==',f.companyId).get()).size,0);
});
test('acknowledged visit revisions chain to work notes, departure and authorized completion without unrelated rebasing',async()=>{
 const f=await fixture(),arrival=await f.handlers.visit(f.request(f.payload()));
 const apply=offlineHandler(db),notes=await apply(f.request({jobId:f.jobId,operationId:`${f.companyId}-notes-operation`,expectedVersion:arrival.version,patch:{notes:'Offline work notes retained'}}));assert.equal(notes.status,'synced');
 const departure=await f.handlers.visit(f.request(f.payload('departed',{expectedVersion:notes.version,occurredAt:new Date(f.clock-86400000).toISOString()})));assert.equal(departure.status,'synced');
 const completed=await apply(f.request({jobId:f.jobId,operationId:`${f.companyId}-complete-operation`,expectedVersion:departure.version,patch:{status:'completed',actualWorkDone:'Test inspection completed'}}));assert.equal(completed.status,'synced');
 const job=await f.job.get();assert.equal(job.get('status'),'completed');assert.equal(job.get('workNotes'),'Offline work notes retained');assert.equal(job.get('visitEvidence.arrivedAt'),f.payload().occurredAt);
});
test('completion after arrival requires a real departure or an explicit audited exception',async()=>{
 const f=await fixture(),arrival=await f.handlers.visit(f.request(f.payload())),apply=offlineHandler(db);
 const base={jobId:f.jobId,expectedVersion:arrival.version,patch:{status:'completed',actualWorkDone:'Inspection completed'}};
 await assert.rejects(apply(f.request({...base,operationId:`${f.companyId}-missing-departure`})),error=>error.code==='failed-precondition'&&/Record departure/.test(error.message));
 assert.equal((await f.job.get()).get('status'),'in-progress');
 const reason='Customer asked the technician to leave immediately after the inspection.';
 const completed=await apply(f.request({...base,operationId:`${f.companyId}-departure-exception`,patch:{...base.patch,departureExceptionReason:reason}}));
 assert.equal(completed.status,'synced');
 const job=await f.job.get();assert.equal(job.get('status'),'completed');assert.equal(job.get('departureExceptionReason'),reason);
 const audits=await db.collection('rlAudit').where('companyId','==',f.companyId).where('action','==','job.departureException').get();
 assert.equal(audits.size,1);assert.equal(audits.docs[0].get('reason'),reason);assert.equal(audits.docs[0].get('jobId'),f.jobId);
});
test('invalid times, missing access reasons and malformed GPS fail without losing or inventing service evidence',async()=>{
 const f=await fixture();
 for(const patch of [{occurredAt:'invalid'},{occurredAt:new Date(f.clock+180000).toISOString()},{occurredAt:new Date(f.clock-31*86400000).toISOString()},{latitude:35,longitude:-119,accuracy:null,capturedAt:f.payload().occurredAt},{latitude:35,longitude:-119,accuracy:15,capturedAt:new Date(f.clock).toISOString()}])await assert.rejects(f.handlers.visit(f.request(f.payload('arrived',patch))),{code:'invalid-argument'});
 await assert.rejects(f.handlers.visit(f.request(f.payload('access-blocked',{note:''}))),{code:'invalid-argument'});assert.equal((await db.collection('rlJobVisits').where('companyId','==',f.companyId).get()).size,0);
});
