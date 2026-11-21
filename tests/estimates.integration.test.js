const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const req=require('node:module').createRequire(require('node:path').resolve(__dirname,'../functions/package.json'));
const {initializeApp,deleteApp}=req('firebase-admin/app'),{getFirestore}=req('firebase-admin/firestore');
const {estimateHandlers}=require('../functions/estimates'),{deliverMail}=require('../functions/mail'),{hash}=require('../functions/security');
const {serviceAreaHandlers}=require('../functions/serviceAreas');
let app,db,sequence=0;
before(()=>{if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Local emulator required; no production writes allowed.');app=initializeApp({projectId:'demo-routelogistics'},'estimate-tests');db=getFirestore(app);});after(()=>deleteApp(app));
async function fixture({enabled=true,email=true}={}){
  const id=`quote-${++sequence}`,uid=`${id}-owner`,memberId=`${id}-member`,customerId=`${id}-customer`,files=new Map();let clock=Date.parse('2026-11-13T18:00:00Z'),operation=0;
  await db.doc(`companies/${id}`).set({ownerId:uid,name:'Controlled Company'});await db.doc(`teamMembers/${memberId}`).set({companyId:id,uid:`${id}-tech`,role:'technician',status:'active'});await db.doc(`customers/${customerId}`).set({userId:uid,companyId:id,name:'Controlled customer',email:`${id}@example.invalid`,phone:'+16615550101',address:'100 Synthetic Customer Street, Example, CA 93312',isActive:true});
  const bucket={file:path=>({save:async(bytes,options)=>files.set(path,{bytes:Buffer.from(bytes),contentType:options.contentType,metadata:options.metadata}),getMetadata:async()=>{const file=files.get(path);if(!file)throw Error('Private file unavailable');return [{size:file.bytes.length,contentType:file.contentType,...file.metadata}];},download:async()=>[files.get(path).bytes]})};
  let geocodeCalls=0;
  const serviceAreas=serviceAreaHandlers(db,{now:()=>clock,geocode:async address=>{geocodeCalls++;if(address.includes('Invalid'))throw Error('Synthetic invalid address');return {formattedAddress:address,latitude:35,longitude:-119,postalCode:'93312',countryCode:'US',locationType:'PREMISE',streetAddressVerified:true};}});
  const config={enabled:()=>enabled,emailEnabled:()=>email,appUrl:()=> 'https://route-logistics.com',now:()=>clock,bucketProvider:()=>bucket,serviceAreas};const handlers=estimateHandlers(db,config);
  const owner={uid,token:{companyId:id,role:'owner',email_verified:true}},tech={uid:`${id}-tech`,token:{companyId:id,membershipId:memberId,role:'technician',email_verified:true}};
  const request=(data,auth=owner)=>({data,auth}),draft={customerId,title:'Controlled quote',serviceType:'Inspection',scopeOfWork:'Work scope',notes:'',lineItems:[{kind:'labor',description:'Inspection',quantity:1.5,unitPrice:100},{kind:'material',description:'Material',quantity:2,unitPrice:25}],taxRate:7.5,validDays:30,photoIds:[]};
  const save=(data=draft,extra={})=>handlers.handle(request({action:'save',operationId:`operation-${id}-${String(++operation).padStart(8,'0')}`,data,...extra}));
  const send=async(estimate,recipientEmail)=>{let current=(await db.doc(`estimates/${estimate.id}`).get()).data();if(current.status==='draft'){await handlers.handle(request({action:'review',estimateId:estimate.id,expectedVersion:current.version,decision:'approve',comments:'Controlled management approval'}));current=(await db.doc(`estimates/${estimate.id}`).get()).data();}const result=await handlers.handle(request({action:'deliver',estimateId:estimate.id,expectedVersion:current.version,...(recipientEmail?{recipientEmail}:{})}));const mail=await db.doc(`rlMail/${result.mailId}`).get();const token=mail.get('text').match(/token=([a-f0-9]{64})/)[1];return {result,mail,token};};
  const approve=(estimate,token,extra={})=>handlers.approval({data:{action:'approve',estimateId:estimate.id,token,signerName:'Controlled signer',acceptedTerms:true,...extra},rawRequest:{ip:id}});
  const addVisit=async(suffix='visit')=>{const visitId=`${id}-${suffix}`,inquiryId=`${id}-${suffix}-inquiry`,propertyId=`${id}-${suffix}-property`;await db.doc(`rlInquiries/${inquiryId}`).set({companyId:id,userId:uid,customerId,servicePropertyId:propertyId,status:'estimate_completed',revision:1});await db.doc(`jobs/${visitId}`).set({companyId:id,userId:uid,customerId,inquiryId,servicePropertyId:propertyId,serviceProperty:{address:'100 Synthetic Customer Street, Example, CA 93312'},serviceCategory:'Pest Control',serviceType:'Inspection',appointmentKind:'estimate_visit',billable:false,assignedTo:memberId,assignedToUid:tech.uid,status:'completed',date:'2026-11-13',time:'09:00'});return {visitId,inquiryId,propertyId};};
  return {id,uid,memberId,customerId,files,bucket,handlers,owner,tech,request,draft,save,send,approve,addVisit,time:()=>clock,advance:ms=>clock+=ms,geocodeCalls:()=>geocodeCalls};
}
test('new estimates calculate totals server-side, version immutably and reject stale writes or other companies',async()=>{
  const f=await fixture(),other=await fixture();const {estimate}=await f.save({...f.draft,total:0,totalCents:1});assert.equal(estimate.totalCents,21500);assert.equal(estimate.version,1);
  await assert.rejects(f.handlers.handle(f.request({action:'get',estimateId:estimate.id},f.tech)),{code:'permission-denied'});await assert.rejects(other.handlers.handle(other.request({action:'get',estimateId:estimate.id})),{code:'permission-denied'});
  const updated=await f.save({...f.draft,notes:'Version two'},{estimateId:estimate.id,expectedVersion:1});assert.equal(updated.estimate.version,2);
  assert.equal((await db.doc(`rlEstimateVersions/${hash(`${estimate.id}:1`)}`).get()).get('notes'),'');
  await assert.rejects(f.save(f.draft,{estimateId:estimate.id,expectedVersion:1}),{code:'aborted'});
  await assert.rejects(f.handlers.handle(f.request({action:'pdf',estimateId:estimate.id,expectedVersion:1})),{code:'aborted'});
});
test('assigned technicians prepare one visit-linked estimate, submit immutable reviews and cannot cross assignments',async()=>{
  const f=await fixture(),visit=await f.addVisit(),otherCustomer=`${f.id}-other-customer`;
  await db.doc(`customers/${otherCustomer}`).set({companyId:f.id,userId:f.uid,name:'Other customer',email:`other-${f.id}@example.invalid`,isActive:true});
  const context=await f.handlers.handle(f.request({action:'visit-context',visitId:visit.visitId},f.tech));assert.equal(context.context.customerId,f.customerId);assert.equal(context.context.inquiryId,visit.inquiryId);
  const data={...f.draft,sourceVisitId:visit.visitId,inquiryId:visit.inquiryId,servicePropertyId:visit.propertyId,serviceProperty:{address:'100 Synthetic Customer Street, Example, CA 93312'},serviceCategory:'Pest Control',technicianNotes:'Technician-only field note',internalReviewNotes:'forged private note'};
  const created=await f.handlers.handle(f.request({action:'save',operationId:`assigned-estimate-${f.id}-0001`,data},f.tech));assert.equal(created.estimate.sourceVisitId,visit.visitId);assert.equal(created.estimate.internalReviewNotes,undefined);
  const reopened=await f.handlers.handle(f.request({action:'visit-context',visitId:visit.visitId},f.tech));assert.equal(reopened.estimate.id,created.estimate.id);
  await assert.rejects(f.handlers.handle(f.request({action:'save',operationId:`assigned-estimate-${f.id}-0002`,estimateId:created.estimate.id,expectedVersion:1,data:{...data,customerId:otherCustomer}},f.tech)),{code:'failed-precondition'});
  await f.handlers.handle(f.request({action:'submit-review',estimateId:created.estimate.id,expectedVersion:1},f.tech));
  await assert.rejects(f.handlers.handle(f.request({action:'deliver',estimateId:created.estimate.id,expectedVersion:1},f.tech)),{code:'permission-denied'});
  await f.handlers.handle(f.request({action:'review',estimateId:created.estimate.id,expectedVersion:1,decision:'request-changes',comments:'Clarify the treatment area.'}));
  const revised=await f.handlers.handle(f.request({action:'save',operationId:`assigned-estimate-${f.id}-0003`,estimateId:created.estimate.id,expectedVersion:1,data:{...data,scopeOfWork:'Clarified treatment area'}},f.tech));assert.equal(revised.estimate.version,2);assert.equal(revised.estimate.internalReviewNotes,undefined);
  await f.handlers.handle(f.request({action:'submit-review',estimateId:created.estimate.id,expectedVersion:2},f.tech));await f.handlers.handle(f.request({action:'review',estimateId:created.estimate.id,expectedVersion:2,decision:'approve',comments:'Approved exact version.'}));
  const {token}=await f.send(revised.estimate);const decision=await f.handlers.approval({data:{action:'request-revision',estimateId:created.estimate.id,token,reason:'Please include the detached garage.'},rawRequest:{ip:f.id}});assert.equal(decision.decision,'revision-requested');
  const linkedVisits=await db.collection('jobs').where('estimateId','==',created.estimate.id).get();assert.equal(linkedVisits.size,1);assert.equal(linkedVisits.docs[0].id,visit.visitId);assert.equal((await db.collection('invoices').where('estimateId','==',created.estimate.id).get()).size,0);
  const managerRevision=await f.save({...data,scopeOfWork:'House and detached garage'},{estimateId:created.estimate.id,expectedVersion:2});assert.equal(managerRevision.estimate.version,3);await assert.rejects(f.approve(revised.estimate,token),{code:'permission-denied'});
});
test('management list distinguishes completed quote-needed visits from submitted estimate drafts without creating duplicates',async()=>{
  const f=await fixture(),visit=await f.addVisit('quote-needed');
  const first=await f.handlers.handle(f.request({action:'list'}));
  assert.equal(first.quoteNeededVisits.length,1);assert.equal(first.quoteNeededVisits[0].id,visit.visitId);assert.equal(first.quoteNeededVisits[0].state,'quote-needed');
  const context=await f.handlers.handle(f.request({action:'visit-context',visitId:visit.visitId}));
  const data={...f.draft,...context.context,servicePropertyId:visit.propertyId,serviceProperty:{address:'100 Synthetic Customer Street, Example, CA 93312'}};
  const created=await f.handlers.handle(f.request({action:'save',operationId:`handoff-estimate-${f.id}-0001`,data},f.tech));
  await f.handlers.handle(f.request({action:'submit-review',estimateId:created.estimate.id,expectedVersion:1},f.tech));
  const second=await f.handlers.handle(f.request({action:'list'}));
  assert.equal(second.quoteNeededVisits.length,0);assert.equal(second.estimates.filter(row=>row.status==='submitted-for-review').length,1);
  const reopened=await f.handlers.handle(f.request({action:'visit-context',visitId:visit.visitId}));assert.equal(reopened.existing,true);assert.equal(reopened.estimate.id,created.estimate.id);
});
test('technicians cannot generate formal PDFs or deliver estimates even when an obsolete company flag remains',async()=>{
  const f=await fixture(),visit=await f.addVisit(),data={...f.draft,sourceVisitId:visit.visitId,inquiryId:visit.inquiryId,servicePropertyId:visit.propertyId,serviceProperty:{address:'100 Synthetic Customer Street, Example, CA 93312'}};
  const created=await f.handlers.handle(f.request({action:'save',operationId:`direct-estimate-${f.id}-0001`,data},f.tech));
  await db.doc(`companies/${f.id}`).update({allowTechnicianEstimateSend:true});
  await assert.rejects(f.handlers.handle(f.request({action:'pdf',estimateId:created.estimate.id,expectedVersion:1},f.tech)),{code:'permission-denied'});
  await assert.rejects(f.handlers.handle(f.request({action:'deliver',estimateId:created.estimate.id,expectedVersion:1},f.tech)),{code:'permission-denied'});
  await f.handlers.handle(f.request({action:'review',estimateId:created.estimate.id,expectedVersion:1,decision:'approve',comments:'Management approved the exact version.'}));
  const {mail,token}=await f.send(created.estimate);
  const first=await f.handlers.approval({data:{action:'decline',estimateId:created.estimate.id,token,reason:'Not at this time.'},rawRequest:{ip:f.id}}),second=await f.handlers.approval({data:{action:'decline',estimateId:created.estimate.id,token,reason:'Duplicate tap'},rawRequest:{ip:f.id}});assert.equal(first.decision,'declined');assert.equal(second.existing,true);
  await assert.rejects(f.approve(created.estimate,token),{code:'failed-precondition'});const linkedVisits=await db.collection('jobs').where('estimateId','==',created.estimate.id).get();assert.equal(linkedVisits.size,1);assert.equal(linkedVisits.docs[0].id,visit.visitId);assert.equal((await db.collection('invoices').where('estimateId','==',created.estimate.id).get()).size,0);
  assert.equal((await db.doc(`rlAudit/estimate_${created.estimate.id}_v1_send`).get()).get('authorizedRole'),'owner');
});
test('technicians can submit unpriced scope while management pricing creates a new reviewable version',async()=>{
  const f=await fixture(),visit=await f.addVisit(),data={...f.draft,lineItems:[],taxRate:0,sourceVisitId:visit.visitId,inquiryId:visit.inquiryId,servicePropertyId:visit.propertyId,serviceProperty:{address:'100 Synthetic Customer Street, Example, CA 93312'}};
  const created=await f.handlers.handle(f.request({action:'save',operationId:`unpriced-estimate-${f.id}-0001`,data},f.tech));
  assert.equal(created.estimate.totalCents,0);assert.deepEqual(created.estimate.lineItems,[]);
  await f.handlers.handle(f.request({action:'submit-review',estimateId:created.estimate.id,expectedVersion:1},f.tech));
  await assert.rejects(f.handlers.handle(f.request({action:'review',estimateId:created.estimate.id,expectedVersion:1,decision:'approve',comments:'Missing price.'})),{code:'failed-precondition'});
  const priced=await f.handlers.handle(f.request({action:'save',operationId:`unpriced-estimate-${f.id}-0002`,estimateId:created.estimate.id,expectedVersion:1,data:{...data,lineItems:f.draft.lineItems,taxRate:f.draft.taxRate}}));
  assert.equal(priced.estimate.version,2);assert.equal(priced.estimate.status,'draft');assert.equal(priced.estimate.totalCents,21500);
  const oldVersion=await db.doc(`rlEstimateVersions/${hash(`${created.estimate.id}:1`)}`).get();assert.deepEqual(oldVersion.get('lineItems'),[]);
  const oldTask=await db.doc(`rlEstimateTasks/${hash(`${created.estimate.id}:1:review`)}`).get();assert.equal(oldTask.get('status'),'superseded');assert.equal(oldTask.get('supersededByVersion'),2);
  await f.handlers.handle(f.request({action:'review',estimateId:created.estimate.id,expectedVersion:2,decision:'approve',comments:'Management finalized pricing.'}));
  const detail=await f.handlers.handle(f.request({action:'get',estimateId:created.estimate.id}));assert.equal(detail.permissions.canDeliver,true);
});
test('disabled estimate email queues nothing, existing legacy estimates and customer records are preserved',async()=>{
  const f=await fixture({email:false}),before=(await db.doc(`customers/${f.customerId}`).get()).data(),{estimate}=await f.save();
  await assert.rejects(f.handlers.handle(f.request({action:'deliver',estimateId:estimate.id,expectedVersion:1})),{code:'failed-precondition'});
  assert.equal((await db.collection('rlMail').where('estimateId','==',estimate.id).get()).size,0);assert.deepEqual((await db.doc(`customers/${f.customerId}`).get()).data(),before);
  await db.doc(`estimates/${f.id}-legacy`).set({companyId:f.id,userId:f.uid,serviceType:'Legacy service',estimatedCost:50,createdAt:'2025-01-01'});
  const legacy=await f.handlers.handle(f.request({action:'get',estimateId:`${f.id}-legacy`}));assert.equal(legacy.estimate.legacy,true);
  await assert.rejects(f.save(f.draft,{estimateId:`${f.id}-legacy`,expectedVersion:0}),{code:'failed-precondition'});
});
test('signed estimate review shows the approved service property without private coverage or exception records',async()=>{
  const f=await fixture(),address='101 Synthetic Service Street, Bakersfield, CA 93312';
  const {estimate}=await f.save({...f.draft,serviceProperty:{address},serviceCategory:'Inspection'}),{token}=await f.send(estimate);
  const result=await f.handlers.approval({data:{action:'get',estimateId:estimate.id,token},rawRequest:{ip:f.id}});
  assert.deepEqual(result.estimate.serviceProperty,{address});assert.equal(result.estimate.serviceCategory,'Inspection');
  assert.equal(result.estimate.serviceAreaEligibility,undefined);assert.equal(result.estimate.serviceAreaExceptionId,undefined);assert.equal(result.estimate.serviceProperty.latitude,undefined);
});
test('private photo uploads are idempotent, version-neutral, scoped and have no public download tokens',async()=>{
  const f=await fixture(),other=await fixture(),{estimate}=await f.save();const base64=Buffer.from([255,216,255,217]).toString('base64');
  const data={action:'photo-upload',estimateId:estimate.id,operationId:'photo-operation-controlled-0001',base64,caption:'Controlled photo'};
  const first=await f.handlers.handle(f.request(data)),second=await f.handlers.handle(f.request(data));assert.equal(first.id,second.id);assert.equal(f.files.size,1);assert.equal((await db.doc(`estimates/${estimate.id}`).get()).get('version'),1);
  assert.ok([...f.files.keys()][0].startsWith(`rlEstimatePhotos/${f.id}/${estimate.id}/`));assert.equal([...f.files.values()][0].metadata.firebaseStorageDownloadTokens,undefined);
  assert.match((await f.handlers.handle(f.request({action:'photo-read',estimateId:estimate.id,photoId:first.id}))).dataUri,/^data:image\/jpeg;base64,/);
  await assert.rejects(other.handlers.handle(other.request({action:'photo-read',estimateId:estimate.id,photoId:first.id})),{code:'permission-denied'});
  const attached=await f.save({...f.draft,photoIds:[first.id]},{estimateId:estimate.id,expectedVersion:1});assert.equal(attached.estimate.version,2);assert.deepEqual(attached.estimate.photoIds,[first.id]);
});
test('email queues one versioned private PDF, worker guards it and approval/conversion remain idempotent',async()=>{
  const f=await fixture(),{estimate}=await f.save(),{result,mail,token}=await f.send(estimate);assert.equal((await f.send(estimate)).result.mailId,result.mailId);assert.ok(mail.get('estimatePdfPath').startsWith(`rlEstimateDocuments/${f.id}/`));
  const queuedState=await f.handlers.handle(f.request({action:'get',estimateId:estimate.id}));assert.equal(queuedState.delivery.status,'queued');assert.equal(queuedState.delivery.recipient,`${f.id}@example.invalid`);assert.equal(queuedState.delivery.to,undefined);assert.equal(queuedState.delivery.text,undefined);
  let sends=0;await deliverMail(db,mail.ref,{sendMail:async message=>{sends++;assert.equal(message.attachments[0].content.subarray(0,5).toString(),'%PDF-');assert.equal(message.attachments[0].path,undefined);return {accepted:[message.to]};}},'sender@example.invalid',f.time(),{estimateEmailEnabled:()=>true,bucketProvider:()=>f.bucket});assert.equal(sends,1,`mail status: ${(await mail.ref.get()).get('status')} / ${(await mail.ref.get()).get('failureCode')}`);assert.equal((await mail.ref.get()).get('status'),'sent');
  const sentState=await f.handlers.handle(f.request({action:'get',estimateId:estimate.id}));assert.equal(sentState.delivery.status,'sent');assert.equal(sentState.delivery.attempts,1);assert.ok(sentState.delivery.sentAt);
  await assert.rejects(f.approve(estimate,'0'.repeat(64)),{code:'permission-denied'});assert.equal((await f.approve(estimate,token)).approved,true);assert.equal((await f.approve(estimate,token)).existing,true);
  const convert={action:'convert',estimateId:estimate.id,expectedVersion:1,schedule:{date:'2026-12-01',time:'10:00',assignedTo:f.memberId}};
  const first=await f.handlers.handle(f.request(convert)),second=await f.handlers.handle(f.request(convert));assert.equal(first.jobId,second.jobId);assert.equal(second.existing,true);const job=await db.doc(`jobs/${first.jobId}`).get();assert.equal(job.get('estimatedCost'),215);assert.equal(job.get('assignedTo'),f.memberId);assert.equal(job.get('status'),'scheduled');
  await assert.rejects(f.save(f.draft,{estimateId:estimate.id,expectedVersion:1}),{code:'failed-precondition'});
});
test('authorized alternate estimate delivery is attached, tenant-scoped and does not overwrite customer contact data',async()=>{
  const f=await fixture(),before=(await db.doc(`customers/${f.customerId}`).get()).data(),{estimate}=await f.save({...f.draft,internalReviewNotes:'PRIVATE REVIEW NOTE MUST NOT BE EMAILED',technicianNotes:'PRIVATE TECHNICIAN NOTE MUST NOT BE EMAILED'}),alternate=`alternate-${f.id}@example.invalid`,{mail,token}=await f.send(estimate,alternate);
  assert.equal(mail.get('to'),alternate);assert.equal(mail.get('estimateRecipient'),alternate);assert.deepEqual((await db.doc(`customers/${f.customerId}`).get()).data(),before);
  const state=await f.handlers.handle(f.request({action:'get',estimateId:estimate.id}));assert.equal(state.delivery.recipient,alternate);
  let sent;await deliverMail(db,mail.ref,{sendMail:async message=>{sent=message;return {accepted:[message.to]};}},'sender@example.invalid',f.time(),{estimateEmailEnabled:()=>true,bucketProvider:()=>f.bucket});
  assert.ok(sent,`mail status: ${(await mail.ref.get()).get('status')} / ${(await mail.ref.get()).get('failureCode')}`);assert.equal(sent.to,alternate);assert.equal(sent.attachments.length,1);assert.equal(sent.attachments[0].content.subarray(0,5).toString(),'%PDF-');
  const publicView=await f.handlers.approval({data:{action:'get',estimateId:estimate.id,token},rawRequest:{ip:f.id}});assert.equal(publicView.estimate.internalReviewNotes,undefined);assert.equal(publicView.estimate.technicianNotes,undefined);
});
test('superseded and expired approval tokens cannot approve or convert a different quote',async()=>{
  const f=await fixture(),{estimate}=await f.save(),{token,mail}=await f.send(estimate);
  await assert.rejects(f.save({...f.draft,notes:'New version'},{estimateId:estimate.id,expectedVersion:1}),{code:'failed-precondition'});
  await f.handlers.handle(f.request({action:'start-revision',estimateId:estimate.id,expectedVersion:1,reason:'Customer requested revised work scope'}));
  const newer=await f.save({...f.draft,notes:'New version'},{estimateId:estimate.id,expectedVersion:1});
  assert.equal(newer.estimate.estimateNumber,(await db.doc(`rlEstimateVersions/${hash(`${estimate.id}:1`)}`).get()).get('estimateNumber'));
  await assert.rejects(f.approve(estimate,token),{code:'permission-denied'});let sends=0;await deliverMail(db,mail.ref,{sendMail:async()=>{sends++;return {accepted:['nobody@example.invalid']};}},'sender@example.invalid',f.time(),{estimateEmailEnabled:()=>true,bucketProvider:()=>f.bucket});assert.equal(sends,0);assert.equal((await mail.ref.get()).get('status'),'cancelled');
  const fresh=await f.send(newer.estimate);f.advance(31*86400000);await assert.rejects(f.approve(newer.estimate,fresh.token),{code:'permission-denied'});
});
test('estimate numbers begin at approval, remain stable on revision, and resends retain the approved PDF',async()=>{
  const f=await fixture(),first=(await f.save()).estimate,second=(await f.save({...f.draft,title:'Second quote'})).estimate;
  assert.equal(first.estimateNumber,null);assert.equal(second.estimateNumber,null);
  const initial=await f.send(first),approved=(await db.doc(`estimates/${first.id}`).get()).data();
  assert.match(approved.estimateNumber,/^20261113-E001$/);
  const secondSent=await f.send(second);assert.equal((await db.doc(`estimates/${second.id}`).get()).get('estimateNumber'),'20261113-E002');
  let sends=0;await deliverMail(db,initial.mail.ref,{sendMail:async message=>{sends++;assert.equal(message.attachments[0].filename,`${approved.estimateNumber}-v1.pdf`);return {accepted:[message.to]};}},'sender@example.invalid',f.time(),{estimateEmailEnabled:()=>true,bucketProvider:()=>f.bucket});
  const request={action:'resend',estimateId:first.id,expectedVersion:1,operationId:`${f.id}-resend-operation-0001`};
  const resent=await f.handlers.handle(f.request(request)),retried=await f.handlers.handle(f.request(request));
  assert.equal(resent.mailId,retried.mailId);assert.equal((await db.doc(`rlMail/${resent.mailId}`).get()).get('status'),'queued');
  await f.handlers.handle(f.request({action:'start-revision',estimateId:first.id,expectedVersion:1,reason:'Authorized revised estimate required'}));
  await assert.rejects(f.handlers.handle(f.request({action:'resend',estimateId:first.id,expectedVersion:1,operationId:`${f.id}-resend-operation-0002`})),{code:'permission-denied'});
  assert.equal(sends,1);assert.ok(secondSent.mail.exists);
});
test('forged PDF paths, changed queued recipient and removed sender cannot pass the email worker',async()=>{
  for(const change of ['path','recipient','sender','disabled']){const f=await fixture(),{estimate}=await f.save(),{mail}=await f.send(estimate);
    if(change==='path')await mail.ref.update({estimatePdfPath:'https://external.invalid/private.pdf'});if(change==='recipient')await mail.ref.update({to:'changed@example.invalid'});if(change==='sender')await db.doc(`companies/${f.id}`).update({ownerId:'new-owner'});
    let sends=0;await deliverMail(db,mail.ref,{sendMail:async()=>{sends++;return {accepted:['nobody@example.invalid']};}},'sender@example.invalid',f.time(),{estimateEmailEnabled:()=>change!=='disabled',bucketProvider:()=>f.bucket});assert.equal(sends,0);assert.equal((await mail.ref.get()).get('status'),'cancelled');
  }
});
test('client-forged approval status cannot convert without the private approved version record',async()=>{
  const f=await fixture(),{estimate}=await f.save();await db.doc(`estimates/${estimate.id}`).update({status:'approved'});
  await assert.rejects(f.handlers.handle(f.request({action:'convert',estimateId:estimate.id,expectedVersion:1,schedule:{date:'2026-12-01',time:'09:00'}})),{code:'failed-precondition'});
  assert.equal((await db.doc(`jobs/rl_estimate_${estimate.id}`).get()).exists,false);
});

test('approved prospects create one explicitly requested customer and one scheduled job without changing approved terms',async()=>{
  const f=await fixture(),{estimate}=await f.save({...f.draft,customerId:null,prospect:{name:'Prospect',email:`new-${f.id}@example.invalid`,phone:'+16615550102',address:'200 Synthetic Prospect Street, Example, CA 93312'}}),{token}=await f.send(estimate);await f.approve(estimate,token);
  const convert={action:'convert',estimateId:estimate.id,expectedVersion:1,createCustomer:true,schedule:{date:'2026-12-02',time:'09:00'}};
  const first=await f.handlers.handle(f.request(convert)),second=await f.handlers.handle(f.request(convert));assert.equal(first.jobId,second.jobId);
  const job=await db.doc(`jobs/${first.jobId}`).get(),customer=await db.doc(`customers/${job.get('customerId')}`).get();assert.equal(customer.get('source'),'rl-approved-estimate');assert.equal(customer.get('email'),`new-${f.id}@example.invalid`);assert.equal(customer.get('companyId'),f.id);
  assert.equal(customer.get('addressValidation.source'),'google-address-validation');assert.equal(job.get('serviceProperty.validated'),true);assert.equal(f.geocodeCalls(),1);
  assert.equal((await db.doc(`rlEstimateVersions/${hash(`${estimate.id}:1`)}`).get()).get('customerId'),null);
});
test('prospect conversion requires explicit matching-customer reuse and never overwrites an existing customer',async()=>{
  const f=await fixture(),before=(await db.doc(`customers/${f.customerId}`).get()).data(),{estimate}=await f.save({...f.draft,customerId:null,prospect:{name:'Existing prospect',email:before.email,address:'300 Synthetic Quoted Street, Example, CA 93312'}}),{token}=await f.send(estimate);await f.approve(estimate,token);
  const convert={action:'convert',estimateId:estimate.id,expectedVersion:1,schedule:{date:'2026-12-02',time:'09:00'}};
  await assert.rejects(f.handlers.handle(f.request({...convert,createCustomer:true})),{code:'failed-precondition'});
  const result=await f.handlers.handle(f.request({...convert,customerId:f.customerId}));assert.equal((await db.doc(`jobs/${result.jobId}`).get()).get('customerId'),f.customerId);assert.deepEqual((await db.doc(`customers/${f.customerId}`).get()).data(),before);
});
test('conversion cannot create a new customer or job using an unverified approved prospect address',async()=>{
  const f=await fixture(),{estimate}=await f.save({...f.draft,customerId:null,prospect:{name:'Invalid synthetic prospect',email:`invalid-${f.id}@example.invalid`,address:'999 Invalid Street, Example, CA 93312'}}),{token}=await f.send(estimate);await f.approve(estimate,token);
  await assert.rejects(f.handlers.handle(f.request({action:'convert',estimateId:estimate.id,expectedVersion:1,createCustomer:true,schedule:{date:'2026-12-02',time:'09:00'}})),error=>error.code==='failed-precondition'&&error.details.addressValidation.status==='invalid');
  assert.equal((await db.doc(`jobs/rl_estimate_${estimate.id}`).get()).exists,false);assert.equal((await db.doc(`customers/rl_estimate_${estimate.id}_customer`).get()).exists,false);
  assert.equal((await db.doc(`rlEstimateVersions/${hash(`${estimate.id}:1`)}`).get()).get('recipient.address'),'999 Invalid Street, Example, CA 93312');
});
test('legacy object addresses survive PDF and job conversion and invalid dates report actionable errors',async()=>{
  const f=await fixture();await db.doc(`customers/${f.customerId}`).update({address:{line1:'123 Legacy Street',city:'Bakersfield',state:'CA',zipCode:'93312'}});
  const {estimate}=await f.save();assert.match(estimate.recipient.address,/123 Legacy Street, Bakersfield, CA, 93312/);
  await assert.rejects(f.handlers.handle(f.request({action:'convert',estimateId:estimate.id,expectedVersion:1,schedule:{date:'2026-99-99',time:'09:00'}})),{code:'invalid-argument'});
});
