const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname,'../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { portalHandlers, otpHash, customerUid, customersForEmail, FILE_LIMIT, linkId } = require('../functions/portal');
const { hash } = require('../functions/security');
const { authorizeInvoice } = require('../functions/payments');
let app, db, sequence=0;
before(() => { if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error('Firestore emulator required; production portal tests are forbidden.');app=initializeApp({projectId:'demo-routelogistics'},'portal-certification');db=getFirestore(app); });
after(() => deleteApp(app));
async function fixture() {
  const id=`portal-cert-${++sequence}`,email=`${id}@example.test`,companyA=id+'-a',companyB=id+'-b',companyC=id+'-c',customerA=id+'-customer-a',duplicateA=id+'-customer-duplicate',customerB=id+'-customer-b',other=id+'-other';
  let clock=Date.parse('2026-11-14T19:00:00Z'),downloadHook=null,reads=0;const minted=[],files=new Map();
  for(const [company,name] of [[companyA,'Synthetic Provider A'],[companyB,'Synthetic Provider B'],[companyC,'Unrelated provider']])await db.doc(`companies/${company}`).set({name,ownerId:company+'-owner',isActive:true});
  for(const [customer,company,address] of [[customerA,companyA,email],[duplicateA,companyA,email],[customerB,companyB,email],[other,companyA,'other-'+email]])await db.doc(`customers/${customer}`).set({companyId:company,email:address,emailNormalized:address,isActive:true});
  for(const [customer,company] of [[customerA,companyA],[duplicateA,companyA],[customerB,companyB]])await db.doc(`rlPortalLinks/${linkId(customer,email)}`).set({customerId:customer,scopeId:`company:${company}`,email,status:'active',portalUid:customerUid(email)});
  const jobs={a:id+'-job-a',duplicate:id+'-job-duplicate',b:id+'-job-b',other:id+'-job-other'};
  for(const [job,company,customer,date] of [[jobs.a,companyA,customerA,'2026-11-14'],[jobs.duplicate,companyA,duplicateA,'2026-11-13'],[jobs.b,companyB,customerB,'2026-11-12'],[jobs.other,companyA,other,'2026-11-15']])await db.doc(`jobs/${job}`).set({companyId:company,customerId:customer,date,time:'10:00',serviceType:'Synthetic service',status:'completed',notes:'INTERNAL-DO-NOT-EXPOSE',userId:company+'-owner'});
  const invoice=id+'-invoice';await db.doc(`invoices/${invoice}`).set({companyId:companyA,customerId:customerA,financialVersion:2,status:'issued',totalCents:2000,balanceCents:2000,createdAt:new Date(clock),invoiceNumber:'SYNTHETIC-1',internalNotes:'INTERNAL-DO-NOT-EXPOSE',issuedSnapshot:{invoiceNumber:'SYNTHETIC-1',issueDate:'2026-11-14',dueDate:'2026-11-28',totalCents:2000,lineItems:[{description:'Synthetic service',quantity:1,unitPriceCents:2000,amountCents:2000}]}});
  await db.doc(`invoices/${id}-draft`).set({companyId:companyA,customerId:customerA,status:'draft',total:20,createdAt:new Date(clock)});
  await db.doc(`invoices/${id}-wrong-tenant`).set({companyId:companyC,customerId:customerA,status:'sent',total:999,createdAt:new Date(clock)});
  const photo=id+'-photo',document=id+'-document',photoPath=`rlJobPhotos/${companyA}/${jobs.a}/${photo}.jpg`,documentPath=`rlPortalDocuments/${companyB}/${jobs.b}/${document}.pdf`;
  await db.doc(`photos/${photo}`).set({companyId:companyA,customerId:customerA,jobId:jobs.a,customerVisible:true,caption:'Approved synthetic photo',storagePath:photoPath,createdAt:new Date(clock)});
  await db.doc(`rlPortalDocuments/${document}`).set({companyId:companyB,customerId:customerB,jobId:jobs.b,customerVisible:true,status:'published',name:'Synthetic service report.pdf',storagePath:documentPath,createdAt:new Date(clock)});
  files.set(photoPath,{contentType:'image/jpeg',bytes:Buffer.from([255,216,255,217])});files.set(documentPath,{contentType:'application/pdf',bytes:Buffer.from('%PDF-1.4\nSynthetic test only')});
  const bucket={file:path=>({getMetadata:async()=>{reads++;const file=files.get(path);if(!file)throw Error('PRIVATE STORAGE PATH '+path);return [{size:String(file.size??file.bytes.length),contentType:file.contentType}];},download:async options=>{assert.equal(options.start,0);assert.ok(options.end<=FILE_LIMIT);if(downloadHook)await downloadHook();return [files.get(path).bytes];}})};
  const auth={uid:customerUid(email),token:{portal:true,portalEmail:email}},request=data=>({auth,data,rawRequest:{ip:id+'-ip'}});
  const handlers=portalHandlers(db,{createCustomToken:async(uid,claims)=>{minted.push({uid,claims});return 'synthetic-custom-token';}},()=>true,{now:()=>clock,bucketProvider:()=>bucket});
  return {id,email,companyA,companyB,companyC,customerA,duplicateA,customerB,other,jobs,invoice,photo,document,photoPath,documentPath,files,minted,auth,request,handlers,advance:ms=>clock+=ms,now:()=>clock,setDownloadHook:fn=>downloadHook=fn,reads:()=>reads};
}
async function challenge(f,{code='123456',expiresAt=new Date(f.now()+600000),attempts=0,...extra}={}){const id=hash(f.id+':challenge:'+Math.random()).slice(0,48);await db.doc('rlPortalChallenges/'+id).set({email:f.email,codeHash:otpHash(id,code),expiresAt,attempts,consumed:false,...extra});return{id,code,ref:db.doc('rlPortalChallenges/'+id)};}

test('OTP generation queues a real mail-worker-shaped message with a challenge-bound hash and normalized destination',async()=>{
  const f=await fixture(),response=await f.handlers.requestCustomerOTP({data:{email:' '+f.email.toUpperCase()+' '},rawRequest:{ip:f.id}});
  assert.match(response.challengeId,/^[a-f0-9]{48}$/);assert.equal(response.code,undefined);
  const row=await db.doc('rlPortalChallenges/'+response.challengeId).get(),mail=await db.collection('rlMail').where('to','==',f.email).get();assert.equal(mail.size,1);
  assert.equal(mail.docs[0].get('subject'),'Your Route Logistics customer portal code');assert.match(mail.docs[0].get('text'),/https:\/\/route-logistics.com\/portal/);assert.match(mail.docs[0].get('text'),/Team and platform administration use their own sign-in flow/);
  const code=mail.docs[0].get('text').match(/\b\d{6}\b/)[0];assert.equal(row.get('codeHash'),otpHash(response.challengeId,code));assert.equal(row.get('code'),undefined);assert.equal(row.get('expiresAt').toMillis()-f.now(),600000);assert.equal(mail.docs[0].get('status'),'queued');
  const verified=await f.handlers.verifyCustomerOTP({data:{challengeId:response.challengeId,code},rawRequest:{ip:f.id}});assert.equal(verified.token,'synthetic-custom-token');assert.equal(f.minted[0].uid,customerUid(f.email));assert.deepEqual(f.minted[0].claims,{portal:true,portalEmail:f.email});
});

test('unknown emails receive the same response without mail, customer existence or raw codes being disclosed',async()=>{
  const f=await fixture(),known=await f.handlers.requestCustomerOTP({data:{email:f.email},rawRequest:{ip:f.id}}),email='unknown-'+f.email,unknown=await f.handlers.requestCustomerOTP({data:{email},rawRequest:{ip:f.id}});
  assert.equal(known.message,unknown.message);assert.deepEqual(Object.keys(known).sort(),Object.keys(unknown).sort());assert.equal((await db.doc('rlPortalChallenges/'+unknown.challengeId).get()).exists,false);assert.equal((await db.collection('rlMail').where('to','==',email).get()).size,0);
});

test('OTP expiration and five failed attempts are enforced before token creation',async()=>{
  const f=await fixture(),c=await challenge(f);for(let i=0;i<5;i++)await assert.rejects(f.handlers.verifyCustomerOTP({data:{challengeId:c.id,code:'000000'},rawRequest:{ip:f.id}}),{code:'permission-denied'});
  assert.equal((await c.ref.get()).get('attempts'),5);await assert.rejects(f.handlers.verifyCustomerOTP({data:{challengeId:c.id,code:c.code},rawRequest:{ip:f.id}}),{code:'permission-denied'});assert.equal(f.minted.length,0);
  const expired=await challenge(f);f.advance(600000);await assert.rejects(f.handlers.verifyCustomerOTP({data:{challengeId:expired.id,code:expired.code},rawRequest:{ip:f.id}}),{code:'permission-denied'});
});

test('concurrent OTP replay mints one isolated token and persists consumption',async()=>{
  const f=await fixture(),c=await challenge(f),request={data:{challengeId:c.id,code:c.code},rawRequest:{ip:f.id}};
  const results=await Promise.allSettled([f.handlers.verifyCustomerOTP(request),f.handlers.verifyCustomerOTP(request)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(f.minted.length,1);assert.equal((await c.ref.get()).get('consumed'),true);
});

test('malformed stored OTP records fail closed with the public invalid-code message',async()=>{
  const f=await fixture();for(const change of [{codeHash:'bad'},{expiresAt:'bad'},{attempts:-1},{attempts:'0'},{email:'invalid'}]){const c=await challenge(f,change);await assert.rejects(f.handlers.verifyCustomerOTP({data:{challengeId:c.id,code:c.code},rawRequest:{ip:f.id}}),{code:'permission-denied'});}assert.equal(f.minted.length,0);
});

test('token minting failures keep the OTP consumed and report an actionable sanitized error',async()=>{
  const f=await fixture(),c=await challenge(f),broken=portalHandlers(db,{createCustomToken:async()=>{throw Error('PRIVATE ADMIN CREDENTIAL');}},()=>true,{now:f.now});
  await assert.rejects(broken.verifyCustomerOTP({data:{challengeId:c.id,code:c.code},rawRequest:{ip:f.id}}),error=>error.code==='unavailable'&&!error.message.includes('PRIVATE')&&/new code/.test(error.message));assert.equal((await c.ref.get()).get('consumed'),true);
});

test('OTP request limits apply to known and unknown emails and to the shared source IP',async()=>{
  const f=await fixture();for(let i=0;i<3;i++)await f.handlers.requestCustomerOTP({data:{email:f.email},rawRequest:{ip:f.id}});await assert.rejects(f.handlers.requestCustomerOTP({data:{email:f.email},rawRequest:{ip:f.id}}),{code:'resource-exhausted'});
  const email='absent-'+f.email;for(let i=0;i<3;i++)await f.handlers.requestCustomerOTP({data:{email},rawRequest:{ip:f.id+'-unknown'}});await assert.rejects(f.handlers.requestCustomerOTP({data:{email},rawRequest:{ip:f.id+'-unknown'}}),{code:'resource-exhausted'});
  for(let i=0;i<15;i++)await f.handlers.requestCustomerOTP({data:{email:`${i}-ip-${f.email}`},rawRequest:{ip:f.id+'-shared'}});await assert.rejects(f.handlers.requestCustomerOTP({data:{email:'16-ip-'+f.email},rawRequest:{ip:f.id+'-shared'}}),{code:'resource-exhausted'});
});

test('provider discovery merges duplicate identities without losing their separate service records',async()=>{
  const f=await fixture(),result=await f.handlers.getCustomerPortal(f.request());assert.equal(result.accounts.length,2);
  const a=result.accounts.find(row=>row.id==='company:'+f.companyA),b=result.accounts.find(row=>row.id==='company:'+f.companyB);assert.equal(a.duplicateCustomerCount,1);assert.equal(a.jobs.length,2);assert.equal(b.jobs.length,1);assert.equal(a.invoices.length,1);assert.equal(a.invoices[0].id,f.invoice);
  assert.equal(JSON.stringify(result).includes('INTERNAL-DO-NOT-EXPOSE'),false);assert.equal(a.invoices[0].lineItems[0].internalCost,undefined);assert.equal(a.photos[0].storagePath,undefined);
});

test('portal identity comes only from linked customer records and keeps provider names separate',async()=>{
  const f=await fixture();
  await db.doc('customers/'+f.customerA).update({name:'  First   Customer  '});
  await db.doc('customers/'+f.duplicateA).update({name:'Second Customer'});
  await db.doc('customers/'+f.customerB).update({name:'Provider B Customer'});
  await db.doc('customers/'+f.other).update({name:'Unlinked Person'});
  await db.doc('companies/'+f.companyA).update({timeZone:'America/New_York'});
  const result=await f.handlers.getCustomerPortal(f.request());
  assert.equal(result.loginEmail,f.email);
  const a=result.accounts.find(row=>row.companyId===f.companyA),b=result.accounts.find(row=>row.companyId===f.companyB);
  assert.deepEqual(a.customerNames,['First Customer','Second Customer']);
  assert.equal(a.timeZone,'America/New_York');
  assert.deepEqual(b.customerNames,['Provider B Customer']);
  assert.equal(JSON.stringify(result).includes('Unlinked Person'),false);
  await db.doc('customers/'+f.customerB).update({name:''});
  const missing=await f.handlers.getCustomerPortal(f.request({accountId:'company:'+f.companyB}));
  assert.deepEqual(missing.accounts[0].customerNames,[]);
});

test('provider switching is server-scoped and rejects another company or customer identity',async()=>{
  const f=await fixture();for(const company of [f.companyA,f.companyB]){const result=await f.handlers.getCustomerPortal(f.request({accountId:'company:'+company}));assert.equal(result.accounts.length,1);assert.equal(result.accounts[0].companyId,company);}
  await assert.rejects(f.handlers.getCustomerPortal(f.request({accountId:'company:'+f.companyC})),{code:'permission-denied'});
  await assert.rejects(f.handlers.getCustomerPortal({...f.request(),auth:{uid:'staff',token:{portal:true,portalEmail:f.email}}}),{code:'unauthenticated'});
});

test('stale normalized email never preserves an association after the current email changes',async()=>{
  const f=await fixture();await db.doc('customers/'+f.customerA).update({email:'new-'+f.email});assert.equal((await customersForEmail(db,f.email)).some(row=>row.id===f.customerA),false);
  const result=await f.handlers.getCustomerPortal(f.request());assert.equal(result.accounts.find(row=>row.id==='company:'+f.companyA).jobs.some(row=>row.id===f.jobs.a),false);
  await assert.rejects(f.handlers.getCustomerPortalFile(f.request({accountId:'company:'+f.companyA,kind:'photo',fileId:f.photo})),{code:'permission-denied'});
});

test('active-session association revocation immediately removes records and denies invoice access',async()=>{
  const f=await fixture();await db.doc('customers/'+f.customerA).update({isActive:false});await db.doc('customers/'+f.duplicateA).update({deletedAt:new Date(f.now())});
  const result=await f.handlers.getCustomerPortal(f.request());assert.deepEqual(result.accounts.map(a=>a.companyId),[f.companyB]);
  await assert.rejects(f.handlers.getCustomerPortalFile(f.request({accountId:'company:'+f.companyA,kind:'photo',fileId:f.photo})),{code:'permission-denied'});
  await assert.rejects(authorizeInvoice(db,f.request(),(await db.doc('invoices/'+f.invoice).get()).data()),{code:'permission-denied'});
});

test('disabled or deleted providers disappear without affecting another authorized provider',async()=>{
  const f=await fixture();await db.doc('companies/'+f.companyA).update({isActive:false});const result=await f.handlers.getCustomerPortal(f.request());assert.deepEqual(result.accounts.map(a=>a.companyId),[f.companyB]);
  await assert.rejects(f.handlers.getCustomerPortalFile(f.request({accountId:'company:'+f.companyA,kind:'photo',fileId:f.photo})),{code:'permission-denied'});
});

test('service file lists require publication, matching provider and the current customer job',async()=>{
  const f=await fixture();await db.doc('photos/'+f.id+'-hidden').set({companyId:f.companyA,customerId:f.customerA,jobId:f.jobs.a,customerVisible:false});await db.doc('photos/'+f.id+'-wrong-job').set({companyId:f.companyA,customerId:f.customerA,jobId:f.jobs.other,customerVisible:true});await db.doc('rlPortalDocuments/'+f.id+'-draft').set({companyId:f.companyB,customerId:f.customerB,jobId:f.jobs.b,customerVisible:true,status:'draft'});
  const result=await f.handlers.getCustomerPortal(f.request());assert.deepEqual(result.accounts.flatMap(row=>row.photos.map(p=>p.id)),[f.photo]);assert.deepEqual(result.accounts.flatMap(row=>row.documents.map(d=>d.id)),[f.document]);
});

test('published photos and PDFs use bounded authenticated bytes without exposing storage paths or permanent URLs',async()=>{
  const f=await fixture();const photo=await f.handlers.getCustomerPortalFile(f.request({accountId:'company:'+f.companyA,kind:'photo',fileId:f.photo})),document=await f.handlers.getCustomerPortalFile(f.request({accountId:'company:'+f.companyB,kind:'document',fileId:f.document}));
  assert.match(photo.dataUri,/^data:image\/jpeg;base64,/);assert.match(document.dataUri,/^data:application\/pdf;base64,/);assert.equal(photo.storagePath,undefined);assert.equal(document.url,undefined);assert.equal(f.reads(),2);
});

test('file access denies forged providers, foreign customer links, private photos and path traversal before Storage',async()=>{
  for(const change of ['provider','customer','private','path']){const f=await fixture();if(change==='customer')await db.doc('photos/'+f.photo).update({customerId:f.other});if(change==='private')await db.doc('photos/'+f.photo).update({customerVisible:false});if(change==='path')await db.doc('photos/'+f.photo).update({storagePath:`rlJobPhotos/${f.companyA}/${f.jobs.a}/../foreign.jpg`});
    await assert.rejects(f.handlers.getCustomerPortalFile(f.request({accountId:'company:'+(change==='provider'?f.companyB:f.companyA),kind:'photo',fileId:f.photo})),{code:'permission-denied'});assert.equal(f.reads(),0);
  }
});

test('unsupported MIME types, oversized metadata and oversized downloaded bytes cannot reach the client',async()=>{
  for(const change of [{contentType:'text/html'},{size:FILE_LIMIT+1},{bytes:Buffer.alloc(FILE_LIMIT+1),size:1}]){const f=await fixture();Object.assign(f.files.get(f.photoPath),change);await assert.rejects(f.handlers.getCustomerPortalFile(f.request({accountId:'company:'+f.companyA,kind:'photo',fileId:f.photo})),{code:'failed-precondition'});}
});

test('association, job and publication revocation during a download are rechecked before returning bytes',async()=>{
  for(const target of ['customer','job','publication','company']){const f=await fixture();f.setDownloadHook(async()=>{if(target==='customer')await db.doc('customers/'+f.customerA).update({email:'changed-'+f.email});if(target==='job')await db.doc('jobs/'+f.jobs.a).update({customerId:f.other});if(target==='publication')await db.doc('photos/'+f.photo).update({customerVisible:false});if(target==='company')await db.doc('companies/'+f.companyA).update({isActive:false});});await assert.rejects(f.handlers.getCustomerPortalFile(f.request({accountId:'company:'+f.companyA,kind:'photo',fileId:f.photo})),{code:'permission-denied'});}
});

test('missing Storage files return an actionable error without bucket paths or credentials',async()=>{
  const f=await fixture();f.files.delete(f.photoPath);await assert.rejects(f.handlers.getCustomerPortalFile(f.request({accountId:'company:'+f.companyA,kind:'photo',fileId:f.photo})),error=>error.code==='unavailable'&&!error.message.includes('PRIVATE')&&!error.message.includes(f.photoPath));
});

test('no remaining association returns a safe empty state for an otherwise valid portal session',async()=>{
  const f=await fixture();for(const customer of [f.customerA,f.duplicateA,f.customerB])await db.doc('customers/'+customer).update({isActive:false});assert.deepEqual(await f.handlers.getCustomerPortal(f.request()),{accounts:[],loginEmail:f.email,hasMoreAccounts:false});
});

test('matching email alone grants no portal, file, or invoice access without an explicit provider link',async()=>{
  const f=await fixture();await db.doc(`rlPortalLinks/${linkId(f.customerA,f.email)}`).delete();
  const result=await f.handlers.getCustomerPortal(f.request());
  assert.equal(result.accounts.find(row=>row.companyId===f.companyA).jobs.some(job=>job.id===f.jobs.a),false);
  await assert.rejects(f.handlers.getCustomerPortalFile(f.request({accountId:`company:${f.companyA}`,kind:'photo',fileId:f.photo})),{code:'permission-denied'});
  await assert.rejects(authorizeInvoice(db,f.request(),(await db.doc(`invoices/${f.invoice}`).get()).data()),{code:'permission-denied'});
});

test('provider-issued link is one use, tenant-scoped and revocable without changing customer records',async()=>{
  const f=await fixture(),ref=db.doc(`rlPortalLinks/${linkId(f.customerA,f.email)}`),before=(await db.doc(`customers/${f.customerA}`).get()).data();
  await ref.delete();
  const owner={uid:f.companyA+'-owner',token:{companyId:f.companyA,role:'owner',email_verified:true}};
  await assert.rejects(f.handlers.managePortalLink({auth:owner,data:{action:'invite',customerId:f.customerB}}),{code:'permission-denied'});
  assert.equal((await f.handlers.managePortalLink({auth:owner,data:{action:'status',customerId:f.customerA}})).status,'not-linked');
  assert.equal((await f.handlers.managePortalLink({auth:owner,data:{action:'invite',customerId:f.customerA}})).status,'invited');
  assert.equal((await f.handlers.managePortalLink({auth:owner,data:{action:'status',customerId:f.customerA}})).status,'invited');
  const mail=(await db.collection('rlMail').where('to','==',f.email).where('subject','==','Connect your Route Logistics service provider').get()).docs.at(-1);
  const token=mail.get('text').match(/#link=([a-f0-9]{64})/)[1];
  assert.equal((await db.doc(`rlPortalLinkInvites/${hash(token)}`).get()).get('token'),undefined);
  await assert.rejects(f.handlers.claimPortalLink({auth:{uid:customerUid('other@example.test'),token:{portal:true,portalEmail:'other@example.test'}},data:{token},rawRequest:{ip:f.id}}),{code:'permission-denied'});
  assert.deepEqual(await f.handlers.claimPortalLink(f.request({token})),{status:'connected'});
  await assert.rejects(f.handlers.claimPortalLink(f.request({token})),{code:'permission-denied'});
  assert.equal((await f.handlers.getCustomerPortal(f.request())).accounts.find(row=>row.companyId===f.companyA).jobs.some(job=>job.id===f.jobs.a),true);
  assert.equal((await f.handlers.managePortalLink({auth:owner,data:{action:'revoke',customerId:f.customerA}})).status,'revoked');
  assert.equal((await f.handlers.getCustomerPortal(f.request())).accounts.find(row=>row.companyId===f.companyA).jobs.some(job=>job.id===f.jobs.a),false);
  assert.deepEqual((await db.doc(`customers/${f.customerA}`).get()).data(),before);
});

test('disconnect removes only the selected provider and leaves another provider and all customer records intact',async()=>{
  const f=await fixture(),original=(await db.doc(`customers/${f.customerA}`).get()).data();
  assert.deepEqual(await f.handlers.disconnectPortalLink(f.request({accountId:`company:${f.companyA}`})),{status:'disconnected'});
  assert.deepEqual((await f.handlers.getCustomerPortal(f.request())).accounts.map(row=>row.companyId),[f.companyB]);
  assert.deepEqual((await db.doc(`customers/${f.customerA}`).get()).data(),original);
  await assert.rejects(f.handlers.disconnectPortalLink(f.request({accountId:`company:${f.companyA}`})),{code:'permission-denied'});
});

test('revoking a pending provider invitation prevents its later claim',async()=>{
  const f=await fixture(),ref=db.doc(`rlPortalLinks/${linkId(f.customerA,f.email)}`);
  await ref.delete();
  const owner={uid:f.companyA+'-owner',token:{companyId:f.companyA,role:'owner',email_verified:true}};
  await f.handlers.managePortalLink({auth:owner,data:{action:'invite',customerId:f.customerA}});
  const mail=(await db.collection('rlMail').where('to','==',f.email).where('subject','==','Connect your Route Logistics service provider').get()).docs.at(-1);
  const token=mail.get('text').match(/#link=([a-f0-9]{64})/)[1];
  await f.handlers.managePortalLink({auth:owner,data:{action:'revoke',customerId:f.customerA}});
  await assert.rejects(f.handlers.claimPortalLink(f.request({token})),{code:'permission-denied'});
  assert.equal((await ref.get()).get('status'),'revoked');
});

test('expired and simultaneous duplicate claims never create multiple active links',async()=>{
  const f=await fixture(),ref=db.doc(`rlPortalLinks/${linkId(f.customerA,f.email)}`);
  await ref.delete();
  const owner={uid:f.companyA+'-owner',token:{companyId:f.companyA,role:'owner',email_verified:true}};
  const invite=async()=>{
    await f.handlers.managePortalLink({auth:owner,data:{action:'invite',customerId:f.customerA}});
    const mails=await db.collection('rlMail').where('to','==',f.email).where('subject','==','Connect your Route Logistics service provider').get();
    return mails.docs.sort((a,b)=>a.get('createdAt').toMillis()-b.get('createdAt').toMillis()).at(-1).get('text').match(/#link=([a-f0-9]{64})/)[1];
  };
  const expired=await invite();
  f.advance(8*24*60*60*1000);
  await assert.rejects(f.handlers.claimPortalLink(f.request({token:expired})),{code:'permission-denied'});
  const valid=await invite();
  const outcomes=await Promise.allSettled([f.handlers.claimPortalLink(f.request({token:valid})),f.handlers.claimPortalLink(f.request({token:valid}))]);
  assert.equal(outcomes.filter(outcome=>outcome.status==='fulfilled').length,1);
  assert.equal(outcomes.filter(outcome=>outcome.status==='rejected').length,1);
  assert.equal((await ref.get()).get('status'),'active');
  assert.equal((await db.collection('rlPortalLinkAudit').where('customerId','==',f.customerA).where('action','==','claim').get()).size,1);
});

test('portal properties are scoped and omit access instructions; jobs without an unambiguous property remain unassigned',async()=>{
  const f=await fixture();
  await db.doc(`customers/${f.customerA}`).update({address:'100 Example Lane',city:'Bakersfield',state:'CA',serviceProperties:[{id:'second',label:'rental',address:'200 Example Lane',accessInstructions:'PRIVATE GATE CODE'}]});
  await db.doc(`customers/${f.customerB}`).update({address:'100 Example Lane',city:'Bakersfield',state:'CA'});
  await db.doc(`jobs/${f.jobs.a}`).update({servicePropertyId:'second'});
  const result=await f.handlers.getCustomerPortal(f.request()),a=result.accounts.find(row=>row.companyId===f.companyA),b=result.accounts.find(row=>row.companyId===f.companyB);
  assert.equal(a.properties.length,2);assert.equal(b.properties.length,1);assert.equal(a.jobs.find(job=>job.id===f.jobs.a).propertyKey,`${f.customerA}:second`);
  assert.equal(a.jobs.find(job=>job.id===f.jobs.duplicate).propertyKey,null);
  assert.equal(JSON.stringify(result).includes('PRIVATE GATE CODE'),false);
  assert.equal(a.properties.find(row=>row.id==='legacy-primary').address,b.properties[0].address);
});
