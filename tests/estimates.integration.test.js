const {test,before,after}=require('node:test'),assert=require('node:assert/strict');
const req=require('node:module').createRequire(require('node:path').resolve(__dirname,'../functions/package.json'));
const {initializeApp,deleteApp}=req('firebase-admin/app'),{getFirestore}=req('firebase-admin/firestore');
const {estimateHandlers}=require('../functions/estimates'),{deliverMail}=require('../functions/mail'),{hash}=require('../functions/security');
let app,db,sequence=0;
before(()=>{if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Local emulator required; no production writes allowed.');app=initializeApp({projectId:'demo-routelogistics'},'estimate-tests');db=getFirestore(app);});after(()=>deleteApp(app));
async function fixture({enabled=true,email=true}={}){
  const id=`quote-${++sequence}`,uid=`${id}-owner`,memberId=`${id}-member`,customerId=`${id}-customer`,files=new Map();let clock=Date.parse('2026-11-13T18:00:00Z'),operation=0;
  await db.doc(`companies/${id}`).set({ownerId:uid,name:'Controlled Company'});await db.doc(`teamMembers/${memberId}`).set({companyId:id,uid:`${id}-tech`,role:'technician',status:'active'});await db.doc(`customers/${customerId}`).set({userId:uid,companyId:id,name:'Controlled customer',email:`${id}@example.invalid`,phone:'+16615550101',address:'Test address',isActive:true});
  const bucket={file:path=>({save:async(bytes,options)=>files.set(path,{bytes:Buffer.from(bytes),contentType:options.contentType,metadata:options.metadata}),getMetadata:async()=>{const file=files.get(path);if(!file)throw Error('Private file unavailable');return [{size:file.bytes.length,contentType:file.contentType,...file.metadata}];},download:async()=>[files.get(path).bytes]})};
  const config={enabled:()=>enabled,emailEnabled:()=>email,appUrl:()=> 'https://route-logistics.com',now:()=>clock,bucketProvider:()=>bucket};const handlers=estimateHandlers(db,config);
  const owner={uid,token:{companyId:id,role:'owner',email_verified:true}},tech={uid:`${id}-tech`,token:{companyId:id,membershipId:memberId,role:'technician',email_verified:true}};
  const request=(data,auth=owner)=>({data,auth}),draft={customerId,title:'Controlled quote',serviceType:'Inspection',scopeOfWork:'Work scope',notes:'',lineItems:[{kind:'labor',description:'Inspection',quantity:1.5,unitPrice:100},{kind:'material',description:'Material',quantity:2,unitPrice:25}],taxRate:7.5,validDays:30,photoIds:[]};
  const save=(data=draft,extra={})=>handlers.handle(request({action:'save',operationId:`operation-${id}-${String(++operation).padStart(8,'0')}`,data,...extra}));
  const send=async estimate=>{const result=await handlers.handle(request({action:'deliver',estimateId:estimate.id,expectedVersion:estimate.version}));const mail=await db.doc(`rlMail/${result.mailId}`).get();const token=mail.get('text').match(/token=([a-f0-9]{64})/)[1];return {result,mail,token};};
  const approve=(estimate,token,extra={})=>handlers.approval({data:{action:'approve',estimateId:estimate.id,token,signerName:'Controlled signer',acceptedTerms:true,...extra},rawRequest:{ip:id}});
  return {id,uid,memberId,customerId,files,bucket,handlers,owner,tech,request,draft,save,send,approve,time:()=>clock,advance:ms=>clock+=ms};
}
test('new estimates calculate totals server-side, version immutably and reject stale writes or other companies',async()=>{
  const f=await fixture(),other=await fixture();const {estimate}=await f.save({...f.draft,total:0,totalCents:1});assert.equal(estimate.totalCents,21500);assert.equal(estimate.version,1);
  await assert.rejects(f.handlers.handle(f.request({action:'get',estimateId:estimate.id},f.tech)),{code:'permission-denied'});await assert.rejects(other.handlers.handle(other.request({action:'get',estimateId:estimate.id})),{code:'permission-denied'});
  const updated=await f.save({...f.draft,notes:'Version two'},{estimateId:estimate.id,expectedVersion:1});assert.equal(updated.estimate.version,2);
  assert.equal((await db.doc(`rlEstimateVersions/${hash(`${estimate.id}:1`)}`).get()).get('notes'),'');
  await assert.rejects(f.save(f.draft,{estimateId:estimate.id,expectedVersion:1}),{code:'aborted'});
  await assert.rejects(f.handlers.handle(f.request({action:'pdf',estimateId:estimate.id,expectedVersion:1})),{code:'aborted'});
});
test('disabled estimate email queues nothing, existing legacy estimates and customer records are preserved',async()=>{
  const f=await fixture({email:false}),before=(await db.doc(`customers/${f.customerId}`).get()).data(),{estimate}=await f.save();
  await assert.rejects(f.handlers.handle(f.request({action:'deliver',estimateId:estimate.id,expectedVersion:1})),{code:'failed-precondition'});
  assert.equal((await db.collection('rlMail').where('estimateId','==',estimate.id).get()).size,0);assert.deepEqual((await db.doc(`customers/${f.customerId}`).get()).data(),before);
  await db.doc(`estimates/${f.id}-legacy`).set({companyId:f.id,userId:f.uid,serviceType:'Legacy service',estimatedCost:50,createdAt:'2025-01-01'});
  const legacy=await f.handlers.handle(f.request({action:'get',estimateId:`${f.id}-legacy`}));assert.equal(legacy.estimate.legacy,true);
  await assert.rejects(f.save(f.draft,{estimateId:`${f.id}-legacy`,expectedVersion:0}),{code:'failed-precondition'});
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
  const queuedState=await f.handlers.handle(f.request({action:'get',estimateId:estimate.id}));assert.equal(queuedState.delivery.status,'queued');assert.equal(queuedState.delivery.to,undefined);assert.equal(queuedState.delivery.text,undefined);
  let sends=0;await deliverMail(db,mail.ref,{sendMail:async message=>{sends++;assert.equal(message.attachments[0].content.subarray(0,5).toString(),'%PDF-');assert.equal(message.attachments[0].path,undefined);return {accepted:[message.to]};}},'sender@example.invalid',f.time(),{estimateEmailEnabled:()=>true,bucketProvider:()=>f.bucket});assert.equal(sends,1);assert.equal((await mail.ref.get()).get('status'),'sent');
  const sentState=await f.handlers.handle(f.request({action:'get',estimateId:estimate.id}));assert.equal(sentState.delivery.status,'sent');assert.equal(sentState.delivery.attempts,1);assert.ok(sentState.delivery.sentAt);
  await assert.rejects(f.approve(estimate,'0'.repeat(64)),{code:'permission-denied'});assert.equal((await f.approve(estimate,token)).approved,true);assert.equal((await f.approve(estimate,token)).existing,true);
  const convert={action:'convert',estimateId:estimate.id,expectedVersion:1,schedule:{date:'2026-12-01',time:'10:00',assignedTo:f.memberId}};
  const first=await f.handlers.handle(f.request(convert)),second=await f.handlers.handle(f.request(convert));assert.equal(first.jobId,second.jobId);assert.equal(second.existing,true);const job=await db.doc(`jobs/${first.jobId}`).get();assert.equal(job.get('estimatedCost'),215);assert.equal(job.get('assignedTo'),f.memberId);assert.equal(job.get('status'),'scheduled');
  await assert.rejects(f.save(f.draft,{estimateId:estimate.id,expectedVersion:1}),{code:'failed-precondition'});
});
test('superseded and expired approval tokens cannot approve or convert a different quote',async()=>{
  const f=await fixture(),{estimate}=await f.save(),{token,mail}=await f.send(estimate);const newer=await f.save({...f.draft,notes:'New version'},{estimateId:estimate.id,expectedVersion:1});
  await assert.rejects(f.approve(estimate,token),{code:'permission-denied'});let sends=0;await deliverMail(db,mail.ref,{sendMail:async()=>{sends++;return {accepted:['nobody@example.invalid']};}},'sender@example.invalid',f.time(),{estimateEmailEnabled:()=>true,bucketProvider:()=>f.bucket});assert.equal(sends,0);assert.equal((await mail.ref.get()).get('status'),'cancelled');
  const fresh=await f.send(newer.estimate);f.advance(31*86400000);await assert.rejects(f.approve(newer.estimate,fresh.token),{code:'permission-denied'});
});
test('forged PDF paths, changed recipient and removed sender cannot pass the email worker',async()=>{
  for(const change of ['path','recipient','sender','disabled']){const f=await fixture(),{estimate}=await f.save(),{mail}=await f.send(estimate);
    if(change==='path')await mail.ref.update({estimatePdfPath:'https://external.invalid/private.pdf'});if(change==='recipient')await db.doc(`customers/${f.customerId}`).update({email:'changed@example.invalid'});if(change==='sender')await db.doc(`companies/${f.id}`).update({ownerId:'new-owner'});
    let sends=0;await deliverMail(db,mail.ref,{sendMail:async()=>{sends++;return {accepted:['nobody@example.invalid']};}},'sender@example.invalid',f.time(),{estimateEmailEnabled:()=>change!=='disabled',bucketProvider:()=>f.bucket});assert.equal(sends,0);assert.equal((await mail.ref.get()).get('status'),'cancelled');
  }
});
test('client-forged approval status cannot convert without the private approved version record',async()=>{
  const f=await fixture(),{estimate}=await f.save();await db.doc(`estimates/${estimate.id}`).update({status:'approved'});
  await assert.rejects(f.handlers.handle(f.request({action:'convert',estimateId:estimate.id,expectedVersion:1,schedule:{date:'2026-12-01',time:'09:00'}})),{code:'failed-precondition'});
  assert.equal((await db.doc(`jobs/rl_estimate_${estimate.id}`).get()).exists,false);
});

test('approved prospects create one explicitly requested customer and one scheduled job without changing approved terms',async()=>{
  const f=await fixture(),{estimate}=await f.save({...f.draft,customerId:null,prospect:{name:'Prospect',email:`new-${f.id}@example.invalid`,phone:'+16615550102',address:'Prospect service address'}}),{token}=await f.send(estimate);await f.approve(estimate,token);
  const convert={action:'convert',estimateId:estimate.id,expectedVersion:1,createCustomer:true,schedule:{date:'2026-12-02',time:'09:00'}};
  const first=await f.handlers.handle(f.request(convert)),second=await f.handlers.handle(f.request(convert));assert.equal(first.jobId,second.jobId);
  const job=await db.doc(`jobs/${first.jobId}`).get(),customer=await db.doc(`customers/${job.get('customerId')}`).get();assert.equal(customer.get('source'),'rl-approved-estimate');assert.equal(customer.get('email'),`new-${f.id}@example.invalid`);assert.equal(customer.get('companyId'),f.id);
  assert.equal((await db.doc(`rlEstimateVersions/${hash(`${estimate.id}:1`)}`).get()).get('customerId'),null);
});
test('prospect conversion requires explicit matching-customer reuse and never overwrites an existing customer',async()=>{
  const f=await fixture(),before=(await db.doc(`customers/${f.customerId}`).get()).data(),{estimate}=await f.save({...f.draft,customerId:null,prospect:{name:'Existing prospect',email:before.email,address:'Quoted service address'}}),{token}=await f.send(estimate);await f.approve(estimate,token);
  const convert={action:'convert',estimateId:estimate.id,expectedVersion:1,schedule:{date:'2026-12-02',time:'09:00'}};
  await assert.rejects(f.handlers.handle(f.request({...convert,createCustomer:true})),{code:'failed-precondition'});
  const result=await f.handlers.handle(f.request({...convert,customerId:f.customerId}));assert.equal((await db.doc(`jobs/${result.jobId}`).get()).get('customerId'),f.customerId);assert.deepEqual((await db.doc(`customers/${f.customerId}`).get()).data(),before);
});
test('legacy object addresses survive PDF and job conversion and invalid dates report actionable errors',async()=>{
  const f=await fixture();await db.doc(`customers/${f.customerId}`).update({address:{line1:'123 Legacy Street',city:'Bakersfield',state:'CA',zipCode:'93312'}});
  const {estimate}=await f.save();assert.match(estimate.recipient.address,/123 Legacy Street, Bakersfield, CA, 93312/);
  await assert.rejects(f.handlers.handle(f.request({action:'convert',estimateId:estimate.id,expectedVersion:1,schedule:{date:'2026-99-99',time:'09:00'}})),{code:'invalid-argument'});
});
