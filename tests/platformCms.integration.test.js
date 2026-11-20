const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const req=require('node:module').createRequire(require('node:path').resolve(__dirname,'../functions/package.json'));
const {initializeApp,deleteApp}=req('firebase-admin/app'),{getFirestore}=req('firebase-admin/firestore');
const {platformCmsHandlers}=require('../functions/platformCms');
const {platformSubscriptionHandler}=require('../functions/platformSubscriptions');
let app,db,cms,sequence=0,clock=Date.parse('2026-11-14T20:00:00Z');
const uid='cms-verified-admin',auth={uid,token:{email_verified:true,email:'admin@example.invalid'}};
const request=(data,identity=auth)=>({data,auth:identity});
const draft=overrides=>({type:'faq',status:'draft',title:'Emulator-only question',slug:'cms-test-'+(++sequence),summary:'Synthetic emulator-only content.',body:'A factual answer used only in the local emulator.',...overrides});
const buffers=new Map();
const bucket={file:path=>({save:async(buffer,options)=>{assert.equal(options.metadata.metadata.firebaseStorageDownloadTokens,undefined);buffers.set(path,Buffer.from(buffer));},download:async()=>{if(!buffers.has(path))throw Error('missing');return[buffers.get(path)];}})};
before(()=>{if(!process.env.FIRESTORE_EMULATOR_HOST)throw Error('Local Firestore emulator required. Production access is forbidden.');app=initializeApp({projectId:'demo-routelogistics'},'platform-cms-tests');db=getFirestore(app);cms=platformCmsHandlers(db,{bucket,now:()=>++clock});});
after(()=>deleteApp(app));
beforeEach(async()=>db.doc(`rlPlatformAdmins/${uid}`).set({status:'active',role:'admin'}));
const save=async(content,expectedRevision=0,identity=auth)=>cms.admin(request({action:'save',content,expectedRevision},identity));
const publicGet=async item=>cms.publicRead({data:{action:'get',type:item.type,slug:item.slug}});
const response=()=>({code:200,headers:{},set(k,v){this.headers[k]=v;return this;},status(code){this.code=code;return this;},send(body){this.body=body;return this;}});

test('subscription actions require an active verified platform grant independent of company roles', async () => {
  const subscriptions = platformSubscriptionHandler(db, cms.requireAdmin);
  const companyId = 'subscription-authorized-company';
  await db.doc(`companies/${companyId}`).set({ ownerId: 'ordinary-owner', name: 'Subscription company' });
  for (const identity of [
    { uid: 'ordinary-owner', token: { role: 'owner', companyId, email_verified: true } },
    { uid: 'ordinary-admin', token: { role: 'admin', companyId, email_verified: true } },
    { uid: 'ordinary-manager', token: { role: 'manager', companyId, email_verified: true } },
    { uid: 'ordinary-tech', token: { role: 'technician', companyId, email_verified: true } },
  ]) {
    for (const action of ['list', 'get', 'save']) {
      await assert.rejects(subscriptions(request({ action, companyId }, identity)), { code: 'permission-denied' });
    }
  }
  await assert.rejects(subscriptions(request({ action: 'list' }, null)), { code: 'unauthenticated' });
  await assert.rejects(subscriptions(request({ action: 'list' }, { uid, token: { portal: true, email_verified: true } })), { code: 'unauthenticated' });
  await assert.rejects(subscriptions(request({ action: 'list' }, { uid, token: { email_verified: false } })), { code: 'failed-precondition' });
  assert.equal((await subscriptions(request({ action: 'get', companyId }))).item.subscription.status, 'unassigned');
  await db.doc(`rlPlatformAdmins/${uid}`).update({ status: 'revoked' });
  await assert.rejects(subscriptions(request({ action: 'get', companyId })), { code: 'permission-denied' });
});

test('subscription pages are bounded and project only company name, ID and subscription', async () => {
  const subscriptions = platformSubscriptionHandler(db, cms.requireAdmin);
  const companies = Array.from({ length: 26 }, (_, index) => `subscription-page-${String(index).padStart(2, '0')}`);
  const batch = db.batch();
  for (const id of companies) batch.set(db.doc(`companies/${id}`), { businessName: id, ownerId: 'private-owner', bankReference: 'private' });
  await batch.commit();
  const first = await subscriptions(request({ action: 'list', cursor: 'subscription-page-' }));
  assert.deepEqual(first.items.map(item => item.id), companies.slice(0, 25));
  for (const item of first.items) assert.deepEqual(Object.keys(item), ['id', 'name', 'subscription']);
  const second = await subscriptions(request({ action: 'list', cursor: first.nextCursor }));
  assert.equal(second.items[0].id, companies[25]);
  assert.equal(second.nextCursor, null);
});

test('subscription changes are validated, revision-checked and audited without modifying company data', async () => {
  const subscriptions = platformSubscriptionHandler(db, cms.requireAdmin);
  const companyId = 'subscription-save-company';
  const companyRef = db.doc(`companies/${companyId}`);
  const company = { name: 'Subscription company', isActive: true, status: 'active', ownerId: 'ordinary-owner' };
  await companyRef.set(company);
  const save = changes => subscriptions(request({
    action: 'save', companyId, plan: 'Pilot', status: 'trial', endDate: '2027-01-01', reason: 'Pilot approved',
    expectedRevision: 0, ...changes,
  }));
  for (const changes of [{ plan: '' }, { status: 'unassigned' }, { endDate: '2027-02-29' }, { reason: '  ' }, { expectedRevision: -1 }]) {
    await assert.rejects(save(changes), { code: 'invalid-argument' });
  }
  await assert.rejects(save({ companyId: 'subscription-missing-company' }), { code: 'not-found' });
  const results = await Promise.allSettled([save({ isActive: false, actorId: 'forged' }), save({ isActive: false })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.code, 'aborted');
  assert.equal((await save({ expectedRevision: 1 })).unchanged, true);
  await save({ expectedRevision: 1, status: 'paused', reason: 'Pilot paused' });
  const { item, history } = await subscriptions(request({ action: 'get', companyId }));
  assert.equal(item.subscription.status, 'paused');
  assert.deepEqual(history.map(entry => entry.revision), [2, 1]);
  assert.equal(history[0].before.status, 'trial');
  assert.equal(history[0].reason, 'Pilot paused');
  assert.equal(history[1].actorId, uid);
  assert.deepEqual((await companyRef.get()).data(), company);
});

test('platform privilege is explicit and independent of company owner/admin/technician claims',async()=>{
  await db.doc('companies/cms-company').set({ownerId:'company-owner'});
  for(const identity of [{uid:'company-owner',token:{role:'owner',companyId:'cms-company',email_verified:true}},{uid:'company-admin',token:{role:'admin',email_verified:true}},{uid:'technician',token:{role:'technician',email_verified:true}},{uid:'claim-only',token:{platformAdmin:true,email_verified:true}}])await assert.rejects(cms.admin(request({action:'status'},identity)),{code:'permission-denied'});
  await assert.rejects(cms.admin(request({action:'status'},null)),{code:'unauthenticated'});
  await assert.rejects(cms.admin(request({action:'status'},{uid,token:{portal:true,email_verified:true}})),{code:'unauthenticated'});
  await assert.rejects(cms.admin(request({action:'status'},{uid,token:{email_verified:false}})),{code:'failed-precondition'});
  assert.deepEqual(await cms.admin(request({action:'status'})),{authorized:true,role:'admin'});
});
test('revoking an explicit platform admin denies subsequent reads and writes immediately',async()=>{
  const {item}=await save(draft());await db.doc(`rlPlatformAdmins/${uid}`).update({status:'revoked'});
  for(const action of [{action:'get',id:item.id},{action:'save',content:item,expectedRevision:item.revision},{action:'dashboard'}])await assert.rejects(cms.admin(request(action)),{code:'permission-denied'});
});
test('drafts are private and publishing/unpublishing atomically updates only a sanitized public projection',async()=>{
  let {item}=await save(draft({authenticity:{confirmed:true,reference:'Never expose this private evidence'}}));
  await assert.rejects(publicGet(item),{code:'not-found'});
  item=(await save({...item,status:'published'},item.revision)).item;
  const published=(await publicGet(item)).item;assert.equal(published.status,'published');assert.equal(published.authenticity,undefined);assert.equal(published.updatedBy,undefined);assert.equal(published.revision,2);assert.ok(published.publishedAt);
  const firstPublished=item.publishedAt;
  item=(await save({...item,status:'archived'},item.revision)).item;await assert.rejects(publicGet(item),{code:'not-found'});
  item=(await save({...item,status:'published'},item.revision)).item;assert.equal(item.publishedAt,firstPublished);assert.notEqual(item.lastPublishedAt,item.publishedAt);
  item=(await save({...item,status:'draft'},item.revision)).item;await assert.rejects(publicGet(item),{code:'not-found'});
  const history=await cms.admin(request({action:'history',id:item.id}));assert.equal(history.items.length,5);assert.deepEqual(history.items.map(x=>x.revision),[5,4,3,2,1]);
});
test('stale and concurrent saves cannot silently overwrite another editor or duplicate audit revisions',async()=>{
  const {item}=await save(draft()),results=await Promise.allSettled([save({...item,title:'Edit A'},1),save({...item,title:'Edit B'},1)]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(results.find(x=>x.status==='rejected').reason.code,'aborted');
  const history=await cms.admin(request({action:'history',id:item.id}));assert.equal(history.items.length,2);
});
test('slug reservations are unique per type and rename releases the old path without leaking the old public record',async()=>{
  let {item}=await save(draft({status:'published'}));await assert.rejects(save(draft({slug:item.slug})),{code:'already-exists'});
  const oldSlug=item.slug;item=(await save({...item,slug:item.slug+'-renamed'},item.revision)).item;
  assert.equal(item.seo.canonicalUrl,'https://route-logistics.com/faqs/'+item.slug);
  await assert.rejects(cms.publicRead({data:{action:'get',type:'faq',slug:oldSlug}}),{code:'not-found'});
  assert.equal((await save(draft({slug:oldSlug}))).item.slug,oldSlug);
});
test('testimonial/story authenticity cannot be inferred and synthetic acceptance content can never publish',async()=>{
  for(const type of ['testimonial','story']){
    let {item}=await save(draft({type,isSynthetic:true}));await assert.rejects(save({...item,status:'published',isSynthetic:false,attributionName:'Example',companyName:'Example',authenticity:{confirmed:true,reference:'Synthetic approval'}},1),{code:'failed-precondition'});
    item=(await save(draft({type}))).item;await assert.rejects(save({...item,status:'published'},1),{code:'failed-precondition'});
    item=(await save({...item,status:'published',attributionName:'Authorized emulator reviewer',companyName:'Emulator-only customer',authenticity:{confirmed:true,reference:'Emulator-only approval fixture'}},1)).item;assert.equal((await publicGet(item)).item.authenticity,undefined);
  }
});
test('admin list filters and pagination do not leak draft content through public reads',async()=>{
  const items=[];for(let n=0;n<3;n++)items.push((await save(draft({type:'story',status:'draft'}))).item);
  const page=await cms.admin(request({action:'list',type:'story',status:'draft',limit:2}));assert.equal(page.items.length,2);assert.ok(page.nextCursor);
  const next=await cms.admin(request({action:'list',type:'story',status:'draft',limit:2,cursor:page.nextCursor}));assert.ok(next.items.length>=1);assert.ok(next.items.every(x=>!page.items.some(y=>y.id===x.id)));
  const publicRows=await cms.publicRead({data:{action:'list',type:'story'}});assert.ok(publicRows.items.every(x=>x.status==='published'));assert.ok(publicRows.items.every(x=>!items.some(y=>y.id===x.id)));
  const dashboard=await cms.admin(request({action:'dashboard'}));assert.ok(dashboard.counts.story.draft>=3);assert.ok(dashboard.recentAudit.length);
});
test('CMS images are token-free, private while draft and inaccessible immediately after unpublication',async()=>{
  let {item}=await save(draft());const imageBytes=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
  const upload=await cms.image(request({action:'upload',contentId:item.id,contentType:'image/png',data:imageBytes.toString('base64'),alt:'Test diagram'}));
  const privateImage=await cms.image(request({action:'get',imageId:upload.image.id}));assert.equal(privateImage.image.data,imageBytes.toString('base64'));
  let res=response();await cms.publicImage({method:'GET',query:{id:upload.image.id}},res);assert.equal(res.code,404);
  item=(await save({...item,status:'published',imageId:upload.image.id,imageAlt:'Test diagram'},item.revision)).item;
  res=response();await cms.publicImage({method:'GET',query:{id:upload.image.id}},res);assert.equal(res.code,200);assert.equal(res.headers['Cache-Control'],'private, no-store');assert.equal(res.headers['X-Content-Type-Options'],'nosniff');assert.deepEqual(res.body,imageBytes);
  item=(await save({...item,status:'archived'},item.revision)).item;res=response();await cms.publicImage({method:'GET',query:{id:upload.image.id}},res);assert.equal(res.code,404);
});
test('image format spoofing, SVG and cross-content image reuse are rejected',async()=>{
  const {item}=await save(draft());
  for(const input of [{contentType:'image/svg+xml',data:Buffer.from('<svg/>').toString('base64')},{contentType:'image/png',data:Buffer.from('not an image').toString('base64')}])await assert.rejects(cms.image(request({action:'upload',contentId:item.id,alt:'Image',...input})),{code:'invalid-argument'});
  const upload=await cms.image(request({action:'upload',contentId:item.id,alt:'Fixture',contentType:'image/jpeg',data:Buffer.from([255,216,255,0]).toString('base64')}));
  const other=(await save(draft())).item;await assert.rejects(save({...other,imageId:upload.image.id,imageAlt:'Wrong record image'},1),{code:'failed-precondition'});
  await assert.rejects(cms.image(request({action:'get',imageId:upload.image.id},{uid:'ordinary-owner',token:{email_verified:true,role:'owner'}})),{code:'permission-denied'});
});
