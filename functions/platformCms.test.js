const {test}=require('node:test');
const assert=require('node:assert/strict');
const {cleanContent,assertPublishable,publicProjection,contentPath}=require('./platformCms');
const fixture=overrides=>({type:'faq',status:'draft',slug:'customer-portal-access',title:'Customer portal access',summary:'How customer access works.',body:'Request a one-time email code to view authorized providers.',...overrides});

test('CMS content normalizes safe SEO defaults and preserves text rather than executable HTML',()=>{
  const value=cleanContent(fixture({body:'<script>alert(1)</script> is plain text, never HTML.'}));
  assert.equal(value.seo.canonicalUrl,'https://route-logistics.com/faqs/customer-portal-access');
  assert.equal(value.seo.description,'How customer access works.');
  assert.equal(value.body,'<script>alert(1)</script> is plain text, never HTML.');
  assert.equal(contentPath(value),'/faqs/customer-portal-access');
});
test('canonical and identifier validation reject external, privileged, credentialed and malformed targets',()=>{
  for(const canonicalUrl of ['https://evil.invalid/faqs/x','https://route-logistics.com/admin','javascript:alert(1)','https://user:pass@route-logistics.com/faqs/access','https://route-logistics.com/faqs/access?preview=secret','https://route-logistics.com/faqs/access#draft'])assert.throws(()=>cleanContent(fixture({seo:{canonicalUrl}})),{code:'invalid-argument'});
  for(const slug of ['A-slug','one/two','-slug','one--two','x'])assert.throws(()=>cleanContent(fixture({slug})),{code:'invalid-argument'});
  assert.throws(()=>cleanContent(fixture({imageId:'other/image',imageAlt:'Image'})),{code:'invalid-argument'});
});
test('publishing requires nonempty content and accessible image descriptions',()=>{
  assert.throws(()=>cleanContent(fixture({status:'published',body:''})),{code:'invalid-argument'});
  assert.throws(()=>cleanContent(fixture({imageId:'safe-image',imageAlt:''})),{code:'invalid-argument'});
  assert.throws(()=>cleanContent(fixture({seo:{title:'x'.repeat(71)}})),{code:'invalid-argument'});
});
test('synthetic stories cannot publish, and genuine stories/testimonials require explicit source and permission',()=>{
  assert.throws(()=>assertPublishable({...cleanContent(fixture({status:'published'})),isSynthetic:true}),{code:'failed-precondition'});
  for(const type of ['story','testimonial']){
    const item=cleanContent(fixture({type,status:'published'}));
    assert.throws(()=>assertPublishable(item),{code:'failed-precondition'});
    assert.doesNotThrow(()=>assertPublishable({...item,companyName:'Authorized Customer',attributionName:'Authorized reviewer',authenticity:{confirmed:true,reference:'Written publication approval reference'}}));
  }
});
test('published projections omit source evidence, admin identity and synthetic/private fields',()=>{
  const privateItem={...cleanContent(fixture({status:'published'})),id:'public-id',createdBy:'admin-uid',updatedBy:'admin-uid',authenticity:{confirmed:true,reference:'Private permission evidence'},isSynthetic:false,revision:1,publishedAt:new Date(),updatedAt:new Date()};
  const published=publicProjection(privateItem);
  for(const key of ['authenticity','createdBy','updatedBy','isSynthetic'])assert.equal(Object.hasOwn(published,key),false);
  assert.equal(published.status,'published');
  assert.equal(published.path,'/faqs/customer-portal-access');
});
