const {test}=require('node:test');
const assert=require('node:assert/strict');
const {phoneE164,signature,verifySignature,createTwilioTransport}=require('./smsProvider');
const {smsHandlers,DEFAULT_SETTINGS,cleanSettings,renderMessage,appointmentTime}=require('./sms');
const accountSid='AC'+'1'.repeat(32),messagingServiceSid='MG'+'2'.repeat(32),authToken='synthetic-provider-token-no-real-sends';
test('customer SMS is disabled without both explicit global gates and makes no provider calls',async()=>{
  for(const config of [{},{enabled:()=>true},{liveApproved:()=>true}]){const sms=smsHandlers(null,config);assert.deepEqual(await sms.schedule(),{skipped:true});assert.deepEqual(await sms.drain({send:()=>{throw Error('must not send');}}),{skipped:true});assert.deepEqual(await sms.onJob(null,{companyId:'co'},'job'),{skipped:true});}
});
test('phone normalization accepts explicit E164 and US local formatting without guessing extensions',()=>{
  assert.equal(phoneE164('(661) 555-0101'),'+16615550101');assert.equal(phoneE164('+44 20 7946 0000'),'+442079460000');
  for(const input of ['555-0101','6615550101 ext 2','++16615550101',null])assert.equal(phoneE164(input),null);
});
test('official Twilio validator binds signed callbacks to URL, query and every form field',()=>{
  const url='https://example.invalid/rlSmsStatus?id=sample',params={AccountSid:accountSid,To:'+16615550101',MessageSid:'SM'+'3'.repeat(32),MessageStatus:'delivered'};
  const sig=signature(url,params,authToken);assert.equal(verifySignature(url,params,authToken,sig),true);
  assert.equal(verifySignature(url.replace('sample','another'),params,authToken,sig),false);assert.equal(verifySignature(url,{...params,MessageStatus:'failed'},authToken,sig),false);
  assert.equal(verifySignature(url,params,'',sig),false);assert.equal(verifySignature(url,{...params,To:['bad']},authToken,sig),false);
});
test('templates cannot interpolate customer, financial, address or account fields',()=>{
  assert.throws(()=>cleanSettings({...DEFAULT_SETTINGS,timeZone:'invalid-zone'}));
  for(const text of ['Invoice balance: {date}','Customer: {customerName}','Service at {address}','Open https://example.invalid','Card 4111111111111111'])assert.throws(()=>cleanSettings({...DEFAULT_SETTINGS,templates:{'pre-visit':text}}));
  const settings=cleanSettings({...DEFAULT_SETTINGS,enabled:true,templates:{'pre-visit':'See you on {date} at {time}.'}});
  const body=renderMessage({name:'Example Service'},settings,{date:'2026-11-13',time:'10:00',customerName:'PRIVATE',address:'PRIVATE',total:999,notes:'PRIVATE'},'pre-visit');
  assert.match(body,/Example Service: See you on 2026-11-13 at 10:00/);assert.doesNotMatch(body,/PRIVATE|999/);assert.match(body,/STOP.*HELP/);
});
test('reminder scheduling respects the company time zone and ignores malformed legacy times',()=>{
  assert.equal(new Date(appointmentTime({date:'2026-11-13',time:'10:00 AM'},'America/Los_Angeles')).toISOString(),'2026-11-13T18:00:00.000Z');
  for(const time of ['Invalid Date','13:00 PM','25:00','10:99'])assert.ok(Number.isNaN(appointmentTime({date:'2026-11-13',time},'America/Los_Angeles')));
});
test('transport distinguishes a known rejection from ambiguous acceptance and never retries itself',async()=>{
  let calls=0;
  const transport=(reply)=>createTwilioTransport({accountSid,authToken,messagingServiceSid,statusUrl:'https://example.invalid/status',fetchImpl:async(_url,options)=>{calls++;const body=new URLSearchParams(options.body);assert.equal(body.get('MessagingServiceSid'),messagingServiceSid);assert.match(body.get('StatusCallback'),/\?id=controlled/);return reply();}});
  const message={id:'controlled',to:'+16615550101',body:'Controlled stub only'};
  assert.equal((await transport(()=>({ok:true,json:async()=>({sid:'SM'+'3'.repeat(32)})})).send(message)).state,'accepted');
  assert.equal((await transport(()=>({ok:false,status:429,json:async()=>({code:20429})})).send(message)).state,'retry');
  assert.equal((await transport(()=>{throw Error('response lost');}).send(message)).state,'uncertain');
  assert.equal((await transport(()=>({ok:false,status:500,json:async()=>({})})).send(message)).state,'uncertain');
  assert.equal((await transport(()=>({ok:false,status:400,json:async()=>({code:21610})})).send(message)).state,'failed');assert.equal(calls,5);
});
