const {test,before,after,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const req=require('node:module').createRequire(require('node:path').resolve(__dirname,'../functions/package.json'));
const {initializeApp,deleteApp}=req('firebase-admin/app'),{getFirestore}=req('firebase-admin/firestore');
const {smsHandlers,DEFAULT_SETTINGS}=require('../functions/sms');
const {PILOT_PURPOSES}=require('../functions/smsPilot'),{hash}=require('../functions/security');
const accountSid='AC'+'a'.repeat(32),fromNumber='+18005550123';
let app,db,sequence=0;const fixtures=[];
before(()=>{if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Local Firestore emulator required; production writes forbidden.');app=initializeApp({projectId:'demo-routelogistics'},'sms-pilot-tests');db=getFirestore(app);});
after(()=>deleteApp(app));
afterEach(async()=>{for(const f of fixtures.splice(0)){await f.pilot.update({status:'disabled'});const rows=await db.collection('rlSmsOutbox').where('companyId','==',f.companyId).get(),batch=db.batch();for(const row of rows.docs)if(row.get('status')==='queued')batch.update(row.ref,{status:'cancelled'});await batch.commit();}});
async function fixture({maxMessages=4}={}){
  const id=`sms-pilot-${++sequence}`,companyId=id,customerId=id+'-customer',jobId=id+'-job',uid=id+'-owner',phone='+1661444'+String(sequence).padStart(4,'0');
  let clock=Date.parse('2026-11-13T17:00:00Z'),pilotOn=true;
  const pilot=db.doc(`rlSmsPilots/${id}`),customer=db.doc(`customers/${customerId}`),job=db.doc(`jobs/${jobId}`),consentRef=db.doc(`rlSmsConsents/${hash(`${companyId}:${customerId}`)}`),suppression=db.doc(`rlSmsSuppressions/${hash(phone)}`);
  await db.doc(`companies/${companyId}`).set({ownerId:uid,name:'Pilot Test Company'});
  await customer.set({companyId,phone,name:'Synthetic pilot fixture',isActive:true,isTestRecord:true,smsPilotOnly:true});
  await job.set({companyId,customerId,status:'scheduled',date:'2026-11-13',time:'10:00'});
  await db.doc(`rlSmsSettings/${companyId}`).set({...DEFAULT_SETTINGS,enabled:false});
  await db.doc(`rlSmsSenderApprovals/${companyId}`).set({status:'approved',senderMode:'phone-number',fromNumber,pilotApproved:true,automationApproved:false});
  await pilot.set({status:'active',testOnly:true,companyId,customerId,phoneHash:hash(phone),createdAt:new Date(clock),expiresAt:new Date(clock+86400000),purposes:PILOT_PURPOSES,maxMessages,reservedMessages:0,version:1});
  await suppression.set({blocked:false,providerCommand:'START',providerOrigin:'twilio-event-streams',providerEventAt:new Date(clock)});
  const config={enabled:()=>false,liveApproved:()=>false,pilotEnabled:()=>pilotOn,pilotId:()=>id,senderMode:()=> 'phone-number',fromNumber:()=>fromNumber,now:()=>clock};
  const sms=smsHandlers(db,config),owner={uid,token:{companyId,role:'owner',email_verified:true}},request=(data,auth=owner)=>({data,auth});
  const consent=async()=>{const status=await sms.consent(request({action:'status',customerId}));return sms.consent(request({action:'grant',customerId,purposes:PILOT_PURPOSES,source:'written',evidence:'Emulator-only purpose-specific pilot opt-in',disclosureAccepted:true,disclosure:status.disclosure}));};
  const queue=purpose=>sms.queue(request({jobId,purpose:purpose||'appointment-confirmation'}));
  const f={id,companyId,customerId,jobId,phone,uid,pilot,customer,job,consentRef,suppression,owner,request,sms,consent,queue,outbox:id=>db.doc(`rlSmsOutbox/${id}`),advance:ms=>clock+=ms,disable:()=>pilotOn=false};fixtures.push(f);await consent();return f;
}
function transport(){let count=0;return{count:()=>count,send:async message=>{count++;return{state:'accepted',sid:'SM'+hash(message.id).slice(0,32)};}};}

test('pilot queues and delivers only the authorized synthetic recipient while global and company automation stay disabled',async()=>{
  const f=await fixture(),queued=await f.queue();assert.equal(queued.queued,true);
  const row=await f.outbox(queued.id).get();assert.equal(row.get('pilotId'),f.id);assert.equal(row.get('pilotVersion'),1);assert.equal(row.get('to'),f.phone);
  const provider=transport();assert.equal((await f.sms.drain(provider)).sent,1);assert.equal(provider.count(),1);assert.equal((await f.outbox(queued.id).get()).get('status'),'accepted');
  const status=await f.sms.config(f.request({action:'status',companyId:f.companyId}));assert.equal(status.delivery.active,false);assert.equal(status.delivery.enabled,false);assert.equal(status.delivery.liveApproved,false);assert.equal(status.delivery.pilotEnabled,true);assert.equal(status.settings.enabled,false);
});

test('pilot denies other customers, phone changes and another tenant without granting broader company access',async()=>{
  const f=await fixture(),other=await fixture();
  await assert.rejects(f.sms.queue(f.request({jobId:other.jobId,purpose:'appointment-confirmation'})),{code:'permission-denied'});
  assert.equal((await f.sms.queue(other.request({jobId:other.jobId,purpose:'appointment-confirmation'}))).reason,'pilot-recipient-not-approved');
  const customerId=f.id+'-other-customer',jobId=f.id+'-other-job';await db.doc(`customers/${customerId}`).set({companyId:f.companyId,phone:f.phone,isTestRecord:true,smsPilotOnly:true});await db.doc(`jobs/${jobId}`).set({companyId:f.companyId,customerId,status:'scheduled',date:'2026-11-13',time:'11:00'});
  const old=(await f.consentRef.get()).data();await db.doc(`rlSmsConsents/${hash(`${f.companyId}:${customerId}`)}`).set({...old,customerId});
  assert.equal((await f.sms.queue(f.request({jobId,purpose:'appointment-confirmation'}))).reason,'pilot-recipient-not-approved');
  await f.customer.update({phone:'+16614449999'});assert.equal((await f.queue()).reason,'consent-required');
  const provider=transport();await f.sms.drain(provider);assert.equal(provider.count(),0);
});

test('pilot reservations cap distinct sends atomically and duplicate calls do not consume another slot',async()=>{
  const f=await fixture({maxMessages:1});
  const results=await Promise.all([f.queue('appointment-confirmation'),f.queue('pre-visit')]);assert.equal(results.filter(row=>row.queued).length,1);assert.equal(results.filter(row=>row.reason==='pilot-recipient-not-approved').length,1);
  const first=results.find(row=>row.queued),purpose=(await f.outbox(first.id).get()).get('purpose');const duplicate=await f.queue(purpose);assert.equal(duplicate.id,first.id);assert.equal(duplicate.existing,true);assert.equal((await f.pilot.get()).get('reservedMessages'),1);
  const provider=transport();await f.sms.drain(provider);await f.sms.drain(provider);assert.equal(provider.count(),1);
});

test('pilot expiration, withdrawal, version changes and disabled runtime stop already queued delivery',async()=>{
  for(const change of ['expired','withdrawn','version','runtime']){const f=await fixture(),queued=await f.queue();
    if(change==='expired')f.advance(86400001);if(change==='withdrawn')await f.pilot.update({status:'disabled'});if(change==='version')await f.pilot.update({version:2});if(change==='runtime')f.disable();
    const provider=transport();await f.sms.drain(provider);assert.equal(provider.count(),0);
    if(change!=='runtime')assert.equal((await f.outbox(queued.id).get()).get('status'),'cancelled');
    assert.equal((await f.pilot.get()).get('reservedMessages'),1);
  }
});

test('STOP cancels pilot messages and START alone never restores independent consent or cancelled reservations',async()=>{
  const f=await fixture(),queued=await f.queue();
  const event=(command,offset)=>({phone:f.phone,sid:'SM'+hash(`${f.id}:${command}`).slice(0,32),command,eventTime:Date.parse('2026-11-13T17:00:00Z')+offset,origin:'twilio-event-streams'});
  await f.sms.applyOptOut(event('STOP',1000));assert.equal((await f.outbox(queued.id).get()).get('status'),'cancelled');f.advance(2000);await f.sms.applyOptOut(event('START',2000));
  assert.equal((await f.queue('pre-visit')).reason,'consent-required');assert.equal((await f.consentRef.get()).get('status'),'stopped');
  await f.consent();assert.equal((await f.queue('pre-visit')).queued,true);assert.equal((await f.pilot.get()).get('reservedMessages'),2);assert.equal((await f.outbox(queued.id).get()).get('status'),'cancelled');
});

test('independent RL consent revocation blocks a queued pilot message despite provider START',async()=>{
  const f=await fixture(),queued=await f.queue();await f.sms.consent(f.request({action:'revoke',customerId:f.customerId}));
  const provider=transport();await f.sms.drain(provider);assert.equal(provider.count(),0);assert.equal((await f.outbox(queued.id).get()).get('status'),'cancelled');assert.equal((await f.queue('pre-visit')).reason,'consent-required');
});

test('a pilot cannot dispatch old broad outbox rows or rows assigned to a different pilot',async()=>{
  const f=await fixture(),queued=await f.queue(),valid=(await f.outbox(queued.id).get()).data();
  const broad={...valid};delete broad.pilotId;delete broad.pilotVersion;await db.doc('rlSmsOutbox/'+hash(f.id+':broad')).set(broad);
  await db.doc('rlSmsOutbox/'+hash(f.id+':otherpilot')).set({...valid,pilotId:'unapproved-pilot'});
  const provider=transport();await f.sms.drain(provider);assert.equal(provider.count(),1);
  for(const label of ['broad','otherpilot'])assert.equal((await db.doc('rlSmsOutbox/'+hash(f.id+':'+label)).get()).get('status'),'cancelled');
});

test('the scheduler picks only the pilot recipient when company-wide messaging is disabled',async()=>{
  const f=await fixture();await db.doc(`jobs/${f.id}-other-job`).set({companyId:f.companyId,customerId:f.id+'-other-customer',status:'scheduled',date:'2026-11-13',time:'11:00'});
  await db.doc(`customers/${f.id}-other-customer`).set({companyId:f.companyId,phone:'+16614449998',isTestRecord:true,smsPilotOnly:true});
  assert.equal((await f.sms.schedule()).queued,1);assert.equal((await f.sms.schedule()).queued,0);
  const rows=await db.collection('rlSmsOutbox').where('companyId','==',f.companyId).get();assert.equal(rows.size,1);assert.equal(rows.docs[0].get('customerId'),f.customerId);assert.equal(rows.docs[0].get('purpose'),'pre-visit');assert.equal(rows.docs[0].get('automatic'),true);
});

test('owner SMS settings cannot grant or alter the private test pilot or global delivery gates',async()=>{
  const f=await fixture(),before=(await f.pilot.get()).data();
  const status=await f.sms.config(f.request({action:'save',companyId:f.companyId,settings:{...DEFAULT_SETTINGS,enabled:true,pilotId:'other',pilotEnabled:true,maxMessages:100,liveApproved:true}}));
  assert.equal(status.delivery.active,false);assert.equal(status.delivery.liveApproved,false);assert.deepEqual((await f.pilot.get()).data(),before);
  const stored=await db.doc(`rlSmsSettings/${f.companyId}`).get();assert.equal(stored.get('pilotId'),undefined);assert.equal(stored.get('pilotEnabled'),undefined);assert.equal(stored.get('maxMessages'),undefined);
});

test('invalid private pilot scope, evidence and provider state fail closed',async()=>{
  const changes=[['ttl',f=>f.pilot.update({expiresAt:new Date(Date.parse('2026-11-13T17:00:00Z')+86400001)})],['cap',f=>f.pilot.update({maxMessages:5})],['purposes',f=>f.pilot.update({purposes:[...PILOT_PURPOSES,'service-follow-up']})],['record',f=>f.customer.update({smsPilotOnly:false})],['evidence',f=>f.consentRef.update({evidence:''})],['source',f=>f.consentRef.update({source:'customer-start'})],['consent-age',f=>f.consentRef.update({grantedAt:new Date(Date.parse('2026-11-13T17:00:00Z')-1)})],['provider-age',f=>f.suppression.update({providerEventAt:new Date(Date.parse('2026-11-13T17:00:00Z')-1)})],['provider-origin',f=>f.suppression.update({providerOrigin:'operator-inferred'})],['registration',f=>db.doc(`rlSmsSenderApprovals/${f.companyId}`).update({pilotApproved:false})]];
  for(const [label,change] of changes){const f=await fixture();await change(f);const result=await f.queue();assert.equal(result.queued,undefined,label);assert.equal(result.reason,'pilot-recipient-not-approved',label);const provider=transport();await f.sms.drain(provider);assert.equal(provider.count(),0,label);}
});
