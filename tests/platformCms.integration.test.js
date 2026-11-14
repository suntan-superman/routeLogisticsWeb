const {test,before,after,beforeEach}=require('node:test');
const assert=require('node:assert/strict');
const req=require('node:module').createRequire(require('node:path').resolve(__dirname,'../functions/package.json'));
const {initializeApp,deleteApp}=req('firebase-admin/app'),{getFirestore}=req('firebase-admin/firestore');
const {platformCmsHandlers}=require('../functions/platformCms');
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
