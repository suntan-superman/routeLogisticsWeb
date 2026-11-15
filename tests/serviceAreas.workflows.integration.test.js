const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const req=require('node:module').createRequire(require('node:path').resolve(__dirname,'../functions/package.json'));
const {initializeApp,deleteApp}=req('firebase-admin/app'),{getFirestore}=req('firebase-admin/firestore');
const {serviceAreaHandlers}=require('../functions/serviceAreas');
const {workDataHandlers}=require('../functions/workData');
const {estimateHandlers}=require('../functions/estimates');
const {recurringHandlers}=require('../functions/recurring');
const {routeHandlers}=require('../functions/routes');
const {hash}=require('../functions/security');
const OPERATING='100 Operating Avenue, Example, CA 93301',INSIDE='101 Service Street, Example, CA 93301',OUTSIDE='999 Distant Street, Example, CA 90001',FAR='900 Remote Road, Example, CA 93500';
let app,db,sequence=0;
before(()=>{if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Local emulator required; production provider requests prohibited.');app=initializeApp({projectId:'demo-routelogistics'},'service-area-workflows');db=getFirestore(app);});
after(()=>deleteApp(app));
async function fixture({configured=true}={}){
 const id='area-workflow-'+(++sequence),uid=id+'-owner',customerId=id+'-customer',managerId=id+'-manager',techId=id+'-tech';let calls=0,hook=null,operation=0;
 await db.doc('companies/'+id).set({ownerId:uid,name:'Synthetic geographic workflow provider',serviceCategories:['Pest Control','Pool Cleaning']});
 await db.doc('customers/'+customerId).set({companyId:id,userId:uid,name:'Synthetic property customer',email:id+'@example.test',address:OUTSIDE,isActive:true});
 for(const [memberId,role]of[[managerId,'manager'],[techId,'technician']])await db.doc('teamMembers/'+memberId).set({companyId:id,uid:memberId,role,status:'active'});
 const owner={uid,token:{companyId:id,role:'owner',email_verified:true}},manager={uid:managerId,token:{companyId:id,membershipId:managerId,role:'manager',email_verified:true}},tech={uid:techId,token:{companyId:id,membershipId:techId,role:'technician',email_verified:true}};
 const request=(data,auth=owner)=>({auth,data}),geocode=async address=>{calls++;if(hook){const fn=hook;hook=null;await fn();}if(address.includes('Unresolved'))throw Error('Synthetic provider validation unavailable');return{formattedAddress:address,latitude:address===OUTSIDE?34:address===FAR?36:35,longitude:-119,postalCode:address===OUTSIDE?'90001':address===FAR?'93500':'93301',countryCode:'US',locationType:'ROOFTOP',streetAddressVerified:true};};
 const area=serviceAreaHandlers(db,{geocode}),work=workDataHandlers(db,{serviceAreas:area}),estimates=estimateHandlers(db,{enabled:()=>true,emailEnabled:()=>false,serviceAreas:area}),recurring=recurringHandlers(db,{serviceAreas:area});
 const settings={operatingAddress:OPERATING,method:'zip',zipCodes:['93301'],radiusMiles:25,categoryOverrides:[],acceptingNewCustomers:true,publishCoverage:false,allowOutOfAreaRequests:true};
 const saveSettings=async patch=>{const current=await db.doc('rlServiceAreas/'+id).get();return area.handle(request({action:'save',expectedRevision:current.get('revision')||0,settings:{...settings,...patch}}));};
 if(configured)await saveSettings({});
 const job=(patch={})=>({customerId,serviceType:'Monthly pest inspection',serviceCategory:'Pest Control',serviceProperty:{address:INSIDE},date:'2026-11-15',time:'09:00',...patch});
 const draft=(patch={})=>({customerId,title:'Synthetic property estimate',serviceType:'Inspection',serviceCategory:'Pest Control',serviceProperty:{address:INSIDE},lineItems:[{kind:'service',description:'Synthetic inspection',quantity:1,unitPrice:50}],taxRate:0,validDays:30,photoIds:[],...patch});
 const saveEstimate=(input=draft(),extra={})=>estimates.handle(request({action:'save',data:input,operationId:`operation-${id}-${String(++operation).padStart(8,'0')}`,...extra}));
 const approve=async estimate=>{await db.doc('estimates/'+estimate.id).update({status:'approved'});await db.doc('rlEstimateApprovalSecrets/'+estimate.id).set({status:'approved',version:estimate.version,approvedAt:new Date()});};
 return{id,uid,customerId,owner,manager,tech,request,area,work,estimates,recurring,settings,saveSettings,job,draft,saveEstimate,approve,calls:()=>calls,onGeocode:fn=>hook=fn};
}

test('new jobs use the explicit validated service property, never billing coordinates or client eligibility flags',async()=>{
 const f=await fixture(),customerBefore=(await db.doc('customers/'+f.customerId).get()).data();
 const saved=await f.work.manageJob(f.request({action:'create',job:f.job({address:OUTSIDE,latitude:0,longitude:0,eligible:true,serviceAreaEligibility:{eligible:true,settingsRevision:999}})}));
 const job=(await db.doc('jobs/'+saved.id).get()).data();assert.equal(job.address,INSIDE);assert.equal(job.serviceProperty.address,INSIDE);assert.equal(job.latitude,35);assert.equal(job.serviceAreaEligibility.settingsRevision,1);assert.equal(job.serviceAreaEligibility.status,'inside');assert.deepEqual((await db.doc('customers/'+f.customerId).get()).data(),customerBefore);
});

test('configured job creation fails safely for outside, absent or unvalidated properties despite forged client flags',async()=>{
 const f=await fixture();
 for(const property of [{address:OUTSIDE},undefined,{address:''},{address:'500 Unresolved Service Road, Example, CA 93301'}])await assert.rejects(f.work.manageJob(f.request({action:'create',job:f.job({serviceProperty:property,address:property===undefined?undefined:INSIDE,latitude:35,longitude:-119,eligible:true})})),{code:'failed-precondition'});
 assert.equal((await db.collection('jobs').where('companyId','==',f.id).get()).size,0);
});

test('service category overrides are enforced instead of falling back to a broader base territory',async()=>{
 const f=await fixture();await f.saveSettings({categoryOverrides:[{serviceCategory:'Pool Cleaning',method:'zip',zipCodes:['90001'],radiusMiles:25}]});
 await assert.rejects(f.work.manageJob(f.request({action:'create',job:f.job({serviceCategory:'Pool Cleaning'})})),{code:'failed-precondition'});
 await assert.rejects(f.work.manageJob(f.request({action:'create',job:f.job({serviceCategory:'Unknown service'})})),{code:'failed-precondition'});
 const saved=await f.work.manageJob(f.request({action:'create',job:f.job({serviceCategory:'Pool Cleaning',serviceProperty:{address:OUTSIDE}})}));assert.equal(saved.serviceArea.status,'inside');
});

test('only an explicit current-owner exception allows an out-of-area scheduling operation',async()=>{
 const f=await fixture(),data={action:'approveException',propertyAddress:OUTSIDE,serviceCategory:'Pest Control',purpose:'scheduling',reason:'Synthetic owner-authorized service exception'};
 await assert.rejects(f.area.handle(f.request(data,f.manager)),{code:'permission-denied'});
 const approval=await f.area.handle(f.request(data)),saved=await f.work.manageJob(f.request({action:'create',job:f.job({serviceProperty:{address:OUTSIDE},serviceAreaExceptionId:approval.exceptionId})},f.manager));
 const row=await db.doc('jobs/'+saved.id).get();assert.equal(row.get('serviceAreaEligibility.status'),'exception-approved');assert.equal(row.get('serviceAreaEligibility.exceptionId'),approval.exceptionId);
 await f.saveSettings({zipCodes:['93301']});await assert.rejects(f.work.manageJob(f.request({action:'create',job:f.job({serviceProperty:{address:OUTSIDE},serviceAreaExceptionId:approval.exceptionId})})),{code:'failed-precondition'});
});

test('existing appointments survive boundary changes and normal updates without a paid recheck',async()=>{
 const f=await fixture(),saved=await f.work.manageJob(f.request({action:'create',job:f.job()})),before=(await db.doc('jobs/'+saved.id).get()).data();
 await f.saveSettings({zipCodes:['90001']});const calls=f.calls();await f.work.manageJob(f.request({action:'update',id:saved.id,job:{date:'2026-11-22',notes:'Customer requested a later visit'}}));
 const after=(await db.doc('jobs/'+saved.id).get()).data();assert.equal(after.date,'2026-11-22');assert.deepEqual(after.serviceAreaEligibility,before.serviceAreaEligibility);assert.equal(after.address,INSIDE);assert.equal(f.calls(),calls);
 await assert.rejects(f.work.manageJob(f.request({action:'update',id:saved.id,job:{serviceProperty:{address:FAR}}})),{code:'failed-precondition'});
});

test('policy and exception changes between Google validation and commit abort rather than trusting stale approval',async()=>{
 const f=await fixture();f.onGeocode(()=>db.doc('rlServiceAreas/'+f.id).update({revision:2,zipCodes:['90001']}));
 await assert.rejects(f.work.manageJob(f.request({action:'create',job:f.job()})),{code:'aborted'});assert.equal((await db.collection('jobs').where('companyId','==',f.id).get()).size,0);
 const other=await fixture(),approval=await other.area.handle(other.request({action:'approveException',propertyAddress:OUTSIDE,serviceCategory:'Pest Control',purpose:'scheduling',reason:'Synthetic exception race check'}));
 const checker={checkForWorkflow:async input=>{const result=await other.area.checkForWorkflow(input);await db.doc('rlServiceAreaExceptions/'+approval.exceptionId).update({status:'revoked'});return result;},assertWorkflowCurrent:other.area.assertWorkflowCurrent};
 await assert.rejects(workDataHandlers(db,{serviceAreas:checker}).manageJob(other.request({action:'create',job:other.job({serviceProperty:{address:OUTSIDE},serviceAreaExceptionId:approval.exceptionId})})),{code:'failed-precondition'});
});

test('tenant and technician authorization reject job/plan writes before any Maps request',async()=>{
 const f=await fixture(),other=await fixture(),before=f.calls();
 await assert.rejects(f.work.manageJob(f.request({action:'create',job:f.job()},f.tech)),{code:'permission-denied'});
 await assert.rejects(f.work.manageJob(f.request({action:'create',job:f.job({customerId:other.customerId})})),{code:'permission-denied'});
 await assert.rejects(f.recurring.manageServicePlan(f.request({action:'create',plan:{...f.job(),frequencyDays:30,nextServiceDate:'2026-11-15'}},f.tech)),{code:'permission-denied'});assert.equal(f.calls(),before);
});

test('revoked manager access during address validation cannot commit job, estimate or plan writes',async()=>{
 for(const operation of['job','estimate','plan']){
  const f=await fixture(),before=f.calls();f.onGeocode(()=>db.doc('teamMembers/'+f.manager.uid).update({status:'revoked'}));
  const pending=operation==='job'?f.work.manageJob(f.request({action:'create',job:f.job()},f.manager)):operation==='estimate'?f.estimates.handle(f.request({action:'save',data:f.draft(),operationId:'geo-revocation-'+f.id},f.manager)):f.recurring.manageServicePlan(f.request({action:'create',plan:{...f.job(),frequencyDays:30,nextServiceDate:'2026-11-15'}},f.manager));
  await assert.rejects(pending,{code:'permission-denied'});assert(f.calls()>before);
  for(const collection of['jobs','estimates','servicePlans'])assert.equal((await db.collection(collection).where('companyId','==',f.id).get()).size,0);
 }
});

test('unconfigured providers validate new addresses without rewriting historical appointments',async()=>{
 const f=await fixture({configured:false}),before=f.calls(),saved=await f.work.manageJob(f.request({action:'create',job:{customerId:f.customerId,address:OUTSIDE,date:'2026-11-15',serviceType:'Legacy-style service'}}));assert.equal(f.calls(),before+1);
 const created=await db.doc('jobs/'+saved.id).get();assert.equal(created.get('address'),OUTSIDE);assert.equal(created.get('serviceProperty.validated'),true);
 const legacy=db.doc('jobs/'+f.id+'-old-appointment');await legacy.set({companyId:f.id,userId:f.uid,address:OUTSIDE,status:'scheduled'});
 await f.saveSettings({});const calls=f.calls();await f.work.manageJob(f.request({action:'update',id:legacy.id,job:{notes:'Preserve this established appointment',date:'2026-12-01'}}));assert.equal((await legacy.get()).get('serviceProperty'),undefined);assert.equal(f.calls(),calls);
});

test('estimate properties stay separate from billing contact and survive boundary-only changes',async()=>{
 const f=await fixture(),before=(await db.doc('customers/'+f.customerId).get()).data(),{estimate}=await f.saveEstimate();assert.equal(estimate.recipient.address,OUTSIDE);assert.equal(estimate.serviceProperty.address,INSIDE);
 await f.saveSettings({zipCodes:['90001']});const calls=f.calls(),updated=await f.saveEstimate({...f.draft(),serviceProperty:undefined,serviceCategory:undefined,notes:'Adjusted description only'},{estimateId:estimate.id,expectedVersion:1});assert.equal(updated.estimate.serviceProperty.address,INSIDE);assert.equal(f.calls(),calls);assert.deepEqual((await db.doc('customers/'+f.customerId).get()).data(),before);
 await assert.rejects(f.saveEstimate({...f.draft(),serviceProperty:{address:FAR}},{estimateId:estimate.id,expectedVersion:2}),{code:'failed-precondition'});
});

test('approved estimate conversion creates a validated service-property job and preserves an existing conversion',async()=>{
 const f=await fixture(),{estimate}=await f.saveEstimate();await f.approve(estimate);
 const payload={action:'convert',estimateId:estimate.id,expectedVersion:1,schedule:{date:'2026-12-01',time:'09:00'}},converted=await f.estimates.handle(f.request(payload)),job=await db.doc('jobs/'+converted.jobId).get();assert.equal(job.get('address'),INSIDE);assert.equal(job.get('serviceProperty.validated'),true);
 await f.saveSettings({zipCodes:['90001']});const repeated=await f.estimates.handle(f.request(payload));assert.equal(repeated.existing,true);assert.equal(repeated.jobId,converted.jobId);
});

test('conversion rechecks new appointments after coverage changes and never accepts a different approved property',async()=>{
 const f=await fixture(),{estimate}=await f.saveEstimate();await f.approve(estimate);const payload={action:'convert',estimateId:estimate.id,expectedVersion:1,schedule:{date:'2026-12-01',time:'09:00'}};
 await assert.rejects(f.estimates.handle(f.request({...payload,schedule:{...payload.schedule,serviceProperty:{address:OUTSIDE}}})),{code:'failed-precondition'});
 await f.saveSettings({zipCodes:['90001']});await assert.rejects(f.estimates.handle(f.request(payload)),{code:'failed-precondition'});assert.equal((await db.doc('jobs/rl_estimate_'+estimate.id).get()).exists,false);
});

test('new service plans validate their property while established recurrences retain their original approval',async()=>{
 const f=await fixture(),plan={...f.job(),frequencyDays:30,nextServiceDate:'2026-11-15',price:45};
 await assert.rejects(f.recurring.manageServicePlan(f.request({action:'create',plan:{...plan,serviceProperty:{address:OUTSIDE},eligible:true,createdAt:'2000-01-01'}})),{code:'failed-precondition'});
 const saved=await f.recurring.manageServicePlan(f.request({action:'create',plan})),record=await db.doc('servicePlans/'+saved.id).get();assert.equal(record.get('serviceProperty.address'),INSIDE);assert.equal(record.get('serviceAreaEligibility.settingsRevision'),1);
 await f.saveSettings({zipCodes:['90001']});const calls=f.calls();await f.recurring.manageServicePlan(f.request({action:'update',id:saved.id,plan:{notes:'Continue established plan'}}));const result=await f.recurring.generateServicePlanJob(f.request({planId:saved.id,expectedDate:'2026-11-15'})),job=await db.doc('jobs/'+result.jobId).get();assert.equal(job.get('address'),INSIDE);assert.equal(job.get('latitude'),35);assert.equal(job.get('longitude'),-119);assert.equal(job.get('serviceAreaEligibility.continuedFromServicePlan'),saved.id);assert.equal(f.calls(),calls);
 await assert.rejects(f.recurring.manageServicePlan(f.request({action:'update',id:saved.id,plan:{serviceProperty:{address:FAR}}})),{code:'failed-precondition'});
});

test('workspace and daily routes prioritize explicit properties and preserve legacy billing fallback',async()=>{
 const f=await fixture(),routes=routeHandlers(db);await db.doc('customers/'+f.customerId).update({latitude:34,longitude:-118});
 const base={companyId:f.id,userId:f.uid,customerId:f.customerId,assignedTo:f.uid,date:'2026-11-15',status:'scheduled',time:'09:00'};
 const explicit=db.doc('jobs/'+f.id+'-explicit'),missingPoint=db.doc('jobs/'+f.id+'-missing-point'),legacy=db.doc('jobs/'+f.id+'-legacy');
 await explicit.set({...base,address:OUTSIDE,latitude:0,longitude:0,serviceProperty:{address:INSIDE,latitude:35,longitude:-119,postalCode:'93301',validated:true}});
 await missingPoint.set({...base,address:'',latitude:0,longitude:0,serviceProperty:{address:INSIDE,validated:false}});
 await legacy.set({...base});
 const result=await routes.get(f.request({memberId:f.uid,date:'2026-11-15'})),stop=id=>result.stops.find(row=>row.id===id);
 assert.deepEqual(stop(explicit.id).location,{lat:35,lng:-119});assert.equal(stop(explicit.id).address,INSIDE);
 assert.equal(stop(missingPoint.id).location,null);assert.equal(stop(missingPoint.id).address,INSIDE);
 assert.deepEqual(stop(legacy.id).location,{lat:34,lng:-118});assert.equal(stop(legacy.id).address,OUTSIDE);
 for(const id of[explicit.id,missingPoint.id]){const read=await f.work.read(f.request({resource:'jobs',id}));assert.equal(read.job.address,INSIDE);if(id===explicit.id){assert.equal(read.job.latitude,35);assert.equal(read.job.longitude,-119);}else{assert.equal(read.job.latitude,null);assert.equal(read.job.longitude,null);}}
 const readLegacy=await f.work.read(f.request({resource:'jobs',id:legacy.id}));assert.equal(readLegacy.job.address,OUTSIDE);assert.equal(readLegacy.job.latitude,34);assert.equal(readLegacy.job.longitude,-118);
 const listed=await f.work.read(f.request({resource:'jobs'}));assert.equal(listed.jobs.find(row=>row.id===missingPoint.id).address,INSIDE);assert.equal(listed.jobs.find(row=>row.id===missingPoint.id).latitude,null);
});
