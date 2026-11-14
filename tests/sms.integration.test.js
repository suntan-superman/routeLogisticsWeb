const {test,before,after,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const req=require('node:module').createRequire(require('node:path').resolve(__dirname,'../functions/package.json'));
const {initializeApp,deleteApp}=req('firebase-admin/app'),{getFirestore}=req('firebase-admin/firestore');
const {smsHandlers,DEFAULT_SETTINGS}=require('../functions/sms');
const {signature}=require('../functions/smsProvider'),{hash}=require('../functions/security');
const accountSid='AC'+'a'.repeat(32),serviceSid='MG'+'b'.repeat(32),token='synthetic-token-never-send';
const inboundUrl='https://example.invalid/rlSmsInbound',statusUrl='https://example.invalid/rlSmsStatus';
let app,db,sequence=0;const fixtureCompanies=[];
before(()=>{if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Local Firestore emulator required; production writes forbidden.');app=initializeApp({projectId:'demo-routelogistics'},'sms-tests');db=getFirestore(app);});
after(()=>deleteApp(app));
afterEach(async()=>{for(const companyId of fixtureCompanies.splice(0)){await db.doc(`rlSmsSettings/${companyId}`).update({enabled:false});const rows=await db.collection('rlSmsOutbox').where('companyId','==',companyId).get();const batch=db.batch();for(const row of rows.docs)if(['queued','dispatching'].includes(row.get('status')))batch.update(row.ref,{status:'cancelled'});await batch.commit();}});
async function fixture({phone,delivery=true}={}){
  const id=`sms-${++sequence}`,companyId=id,customerId=`${id}-customer`,jobId=`${id}-job`,uid=`${id}-owner`,memberId=`${id}-member`,techUid=`${id}-tech`;
  fixtureCompanies.push(companyId);
  phone=phone||`+1661555${String(sequence).padStart(4,'0')}`;
  await db.doc(`companies/${companyId}`).set({ownerId:uid,name:'Controlled Service'});
  await db.doc(`teamMembers/${memberId}`).set({companyId,uid:techUid,role:'technician',status:'active'});
  await db.doc(`customers/${customerId}`).set({companyId,name:'Unchanged customer',phone,isActive:true});
  await db.doc(`jobs/${jobId}`).set({companyId,customerId,status:'scheduled',date:'2026-11-13',time:'10:00'});
  await db.doc(`rlSmsSettings/${companyId}`).set({...DEFAULT_SETTINGS,enabled:true});
  await db.doc(`rlSmsSenderApprovals/${companyId}`).set({status:'approved',messagingServiceSid:serviceSid,automationApproved:true});
  let clock=Date.parse('2026-11-13T17:00:00Z'),live=delivery;
  const config={enabled:()=>live,liveApproved:()=>live,accountSid:()=>accountSid,authToken:()=>token,messagingServiceSid:()=>serviceSid,inboundUrl,statusUrl,now:()=>clock};
  const sms=smsHandlers(db,config),owner={uid,token:{companyId,role:'owner',email_verified:true}},tech={uid:techUid,token:{companyId,membershipId:memberId,role:'technician',email_verified:true}};
  const request=(data,auth=owner)=>({data,auth});
  const consent=async(purposes=['appointment-confirmation','pre-visit','en-route','service-completed'])=>{const status=await sms.consent(request({action:'status',customerId}));return sms.consent(request({action:'grant',customerId,purposes,source:'written',evidence:'Emulator-only signed form',disclosureAccepted:true,disclosure:status.disclosure}));};
  const queue=purpose=>sms.queue(request({jobId,purpose:purpose||'appointment-confirmation'}));
  const outbox=id=>db.doc(`rlSmsOutbox/${id}`);
  const inbound=async(command,overrides={},valid=true)=>{const body={AccountSid:accountSid,MessagingServiceSid:serviceSid,From:phone,To:'+16615550000',MessageSid:'SM'+hash(`${id}:${command}:${clock}`).slice(0,32),Body:command,OptOutType:command,...overrides};const response=responseStub();await sms.inbound({method:'POST',body,get:()=>valid?signature(inboundUrl,body,token):'bad'},response);return response;};
  const callback=async(id,status,overrides={})=>{const body={AccountSid:accountSid,To:phone,MessageSid:'SM'+hash(id).slice(0,32),MessageStatus:status,...overrides},response=responseStub();await sms.status({method:'POST',query:{id},body,get:()=>signature(`${statusUrl}?id=${id}`,body,token)},response);return response;};
  return {id,companyId,customerId,jobId,phone,uid,memberId,owner,tech,sms,request,consent,queue,outbox,inbound,callback,advance:ms=>clock+=ms,disable:()=>live=false};
}
function responseStub(){return {code:200,body:null,status(code){this.code=code;return this;},type(){return this;},send(value){this.body=value;return this;}};}
const acceptedTransport=()=>{let count=0;return {send:async message=>{count++;return {state:'accepted',sid:'SM'+hash(message.id).slice(0,32)};},count:()=>count};};

test('delivery remains disabled despite company enablement and cannot be activated through owner settings',async()=>{
  const f=await fixture({delivery:false});await f.consent();const before=(await db.doc(`customers/${f.customerId}`).get()).data();
  assert.equal((await f.queue()).reason,'delivery-disabled');const transport=acceptedTransport();assert.deepEqual(await f.sms.drain(transport),{skipped:true});assert.equal(transport.count(),0);
  const result=await f.sms.config(f.request({action:'save',companyId:f.companyId,settings:{...DEFAULT_SETTINGS,enabled:true,senderApproved:true,liveApproved:true}}));assert.equal(result.delivery.active,false);
  assert.equal((await db.doc(`rlSmsSettings/${f.companyId}`).get()).get('senderApproved'),undefined);assert.deepEqual((await db.doc(`customers/${f.customerId}`).get()).data(),before);
});
test('consent requires evidence and purpose scope, preserves customers and denies technicians/cross-company staff',async()=>{
  const f=await fixture(),other=await fixture();assert.equal((await f.queue()).reason,'consent-required');
  await assert.rejects(f.sms.consent(f.request({action:'grant',customerId:f.customerId,purposes:['pre-visit']})),{code:'invalid-argument'});
  await assert.rejects(f.sms.consent(f.request({action:'status',customerId:f.customerId},f.tech)),{code:'permission-denied'});
  await assert.rejects(other.sms.consent(other.request({action:'status',customerId:f.customerId})),{code:'permission-denied'});
  await f.consent(['pre-visit']);assert.equal((await f.queue()).reason,'consent-required');assert.equal((await f.queue('pre-visit')).queued,true);
  assert.equal((await db.doc(`customers/${f.customerId}`).get()).get('smsConsent'),undefined);
});
test('individual messages deduplicate, signed status callbacks reconcile idempotently, and no invoice is altered',async()=>{
  const f=await fixture();await f.consent();const first=await f.queue(),second=await f.queue();assert.equal(first.id,second.id);assert.equal(second.existing,true);
  const transport=acceptedTransport();await f.sms.drain(transport);await f.sms.drain(transport);assert.equal(transport.count(),1);
  assert.equal((await f.outbox(first.id).get()).get('status'),'accepted');await f.callback(first.id,'delivered');await f.callback(first.id,'delivered');await f.callback(first.id,'queued');
  assert.equal((await f.outbox(first.id).get()).get('status'),'delivered');assert.equal((await db.doc(`jobs/${f.jobId}`).get()).get('status'),'scheduled');
  assert.equal((await db.collection('rlSmsStatusEvents').where('outboxId','==',first.id).get()).size,2);
});
test('STOP wins before dispatch; staff cannot override it; signed START restores only the original purposes and HELP sends no duplicate reply',async()=>{
  const f=await fixture();await f.consent(['pre-visit']);const queued=await f.queue('pre-visit');assert.equal((await f.inbound('STOP')).code,200);
  const transport=acceptedTransport();await f.sms.drain(transport);assert.equal(transport.count(),0);assert.equal((await f.outbox(queued.id).get()).get('status'),'cancelled');
  await assert.rejects(f.consent(['appointment-confirmation']),{code:'failed-precondition'});f.advance(1000);await f.inbound('START');
  const status=await f.sms.consent(f.request({action:'status',customerId:f.customerId}));assert.equal(status.consent.status,'granted');assert.deepEqual(status.consent.purposes,['pre-visit']);assert.equal((await f.queue()).reason,'consent-required');
  f.advance(1000);const help=await f.inbound('HELP');assert.equal(help.body,'<Response/>');assert.equal(transport.count(),0);
});
test('unsigned or wrong-service callbacks are rejected and a shared cross-company phone stays suppressed on START',async()=>{
  const f=await fixture(),other=await fixture({phone:f.phone});await f.consent();await other.consent();
  assert.equal((await f.queue()).reason,'suppressed-or-ambiguous');assert.equal((await f.inbound('STOP',{},false)).code,403);
  assert.equal((await f.inbound('STOP',{MessagingServiceSid:'MG'+'d'.repeat(32)})).code,403);
  await f.inbound('STOP');f.advance(1000);await f.inbound('START');assert.equal((await db.doc(`rlSmsSuppressions/${hash(f.phone)}`).get()).get('blocked'),true);
});
test('only explicit rate-limit rejection retries; ambiguous provider acceptance waits for its signed callback',async()=>{
  const f=await fixture();await f.consent();const queued=await f.queue();let calls=0;
  await f.sms.drain({send:async()=>{calls++;return {state:'retry',code:'20429'};}});assert.equal((await f.outbox(queued.id).get()).get('status'),'queued');f.advance(180000);
  await f.sms.drain({send:async()=>{calls++;return {state:'uncertain',code:'provider-response-unknown'};}});f.advance(600000);await f.sms.drain({send:async()=>{throw Error('Ambiguous sends must not retry');}});
  assert.equal(calls,2);assert.equal((await f.outbox(queued.id).get()).get('status'),'uncertain');await f.callback(queued.id,'delivered');assert.equal((await f.outbox(queued.id).get()).get('status'),'delivered');
});
test('changed appointment, changed phone, withdrawn consent and lost staff access cancel pending delivery',async()=>{
  for(const change of ['schedule','phone','consent','owner']){const f=await fixture();await f.consent();const queued=await f.queue();
    if(change==='schedule')await db.doc(`jobs/${f.jobId}`).update({time:'11:00'});
    if(change==='phone')await db.doc(`customers/${f.customerId}`).update({phone:'+16615559999'});
    if(change==='consent')await f.sms.consent(f.request({action:'revoke',customerId:f.customerId}));
    if(change==='owner')await db.doc(`companies/${f.companyId}`).update({ownerId:'different-owner'});
    const transport=acceptedTransport();await f.sms.drain(transport);assert.equal(transport.count(),0);assert.equal((await f.outbox(queued.id).get()).get('status'),'cancelled');
  }
});
test('automation requires separate operator approval and schedules only consented enabled purposes',async()=>{
  const f=await fixture();await f.consent();await db.doc(`rlSmsSenderApprovals/${f.companyId}`).update({automationApproved:false});
  assert.equal((await f.sms.schedule()).queued,0);await db.doc(`rlSmsSenderApprovals/${f.companyId}`).update({automationApproved:true});await f.sms.schedule();
  const rows=await db.collection('rlSmsOutbox').where('companyId','==',f.companyId).get();assert.equal(rows.size,1);assert.equal(rows.docs[0].get('purpose'),'pre-visit');
  await f.sms.schedule();assert.equal((await db.collection('rlSmsOutbox').where('companyId','==',f.companyId).get()).size,1);
});
test('provider opt-out error suppresses subsequent texts without retrying delivery',async()=>{
  const f=await fixture();await f.consent();const queued=await f.queue();let calls=0;await f.sms.drain({send:async()=>{calls++;return {state:'failed',code:'21610'};}});
  assert.equal(calls,1);assert.equal((await f.outbox(queued.id).get()).get('status'),'failed');assert.equal((await db.doc(`rlSmsSuppressions/${hash(f.phone)}`).get()).get('blocked'),true);
  assert.equal((await f.queue('pre-visit')).reason,'suppressed-or-ambiguous');
});
