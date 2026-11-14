const {test}=require('node:test');
const assert=require('node:assert/strict');
const {publicContentHandler,renderCatalog,renderDetail}=require('./publicContent');
const faq={id:'real-faq',type:'faq',status:'published',slug:'customer-portal',title:'How does the customer portal work?',body:'A customer receives an email code.\n\nEach provider controls its own service records.',summary:'Email-code access to your service records.',seo:{title:'Customer portal help',description:'Learn how the portal works.',canonicalUrl:'https://route-logistics.com/faqs/customer-portal',ogTitle:'Portal help',ogDescription:'Access your records.'},publishedAt:'2026-11-14T18:00:00.000Z',updatedAt:'2026-11-14T18:00:00.000Z'};
function fixture(items,fail=false){
 const db={collection:()=>{const filters=[];const query={where:(key,op,value)=>{filters.push([key,value]);return query;},orderBy:()=>query,limit:()=>query,startAfter:()=>query,get:async()=>{if(fail)throw Error('private backend detail');const rows=items.filter(item=>filters.every(([key,value])=>item[key]===value));return{docs:rows.map(item=>({data:()=>item})),size:rows.length};}};return query;}};
 const call=async(path,method='GET')=>{const res={code:200,headers:{},status(code){this.code=code;return this;},set(k,v){this.headers[k]=v;return this;},type(t){this.contentType=t;return this;},send(body){this.body=body;return this;}};await publicContentHandler(db)({method,query:{path}},res);return res;};return{call};
}
test('published FAQ content and metadata are delivered in HTML without a JavaScript shell',async()=>{
 const page=await fixture([faq]).call('/faqs/customer-portal');assert.equal(page.code,200);assert.match(page.body,/<h1>How does the customer portal work\?/);assert.match(page.body,/<title>Customer portal help \| Route Logistics/);assert.match(page.body,/rel="canonical" href="https:\/\/route-logistics.com\/faqs\/customer-portal"/);assert.match(page.body,/property="og:title" content="Portal help"/);assert.match(page.body,/FAQPage/);assert.match(page.body,/acceptedAnswer/);assert.doesNotMatch(page.body,/<div id="root"/);
});
test('draft and archived content is absent from lists, detail and sitemap, with a real noindex 404',async()=>{
 const f=fixture([faq,{...faq,id:'draft',slug:'private-draft',status:'draft',title:'PRIVATE DRAFT'},{...faq,id:'old',slug:'archived',status:'archived',title:'PRIVATE ARCHIVE'}]);
 for(const path of ['/faqs/private-draft','/faqs/archived']){const p=await f.call(path);assert.equal(p.code,404);assert.equal(p.headers['X-Robots-Tag'],'noindex, nofollow');assert.doesNotMatch(p.body,/PRIVATE DRAFT|PRIVATE ARCHIVE/);}
 const list=await f.call('/faqs'),sitemap=await f.call('/sitemap.xml');assert.match(list.body,/customer-portal/);assert.doesNotMatch(list.body,/PRIVATE DRAFT|PRIVATE ARCHIVE/);assert.match(sitemap.body,/https:\/\/route-logistics.com\/faqs\/customer-portal/);assert.doesNotMatch(sitemap.body,/private-draft|archived/);
});
test('plain content and metadata cannot inject HTML, executable scripts, or break JSON-LD',()=>{
 const p=renderDetail('faqs',{...faq,title:'<img src=x onerror=alert(1)>',body:'</script><script>alert(1)</script>',seo:{title:'" onload="alert(1)',description:'<bad>'}});
 assert.doesNotMatch(p,/<img src=x|<script>alert\(1\)/);assert.match(p,/&lt;img/);assert.match(p,/\\u003c\/script>/);
 const structured=p.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1];assert.doesNotThrow(()=>JSON.parse(structured));
});
test('empty testimonials and success stories are honest and contain no invented review or rating',()=>{
 for(const key of ['testimonials','success-stories']){const p=renderCatalog(key,[]);assert.match(p,/permission|approved/);assert.doesNotMatch(p,/aggregateRating|reviewRating|five.star|5\.0/);assert.match(p,/CollectionPage/);}
});
test('published stories include Article and breadcrumb data with publication dates',()=>{
 const p=renderDetail('success-stories',{...faq,type:'story',slug:'verified-story',title:'Verified customer story'});assert.match(p,/Article/);assert.match(p,/BreadcrumbList/);assert.match(p,/datePublished/);assert.match(p,/<time datetime=/);
});
test('sitemap and robots expose published discovery paths and exclude private admin and portal',async()=>{
 const f=fixture([faq]),map=await f.call('/sitemap.xml'),robots=await f.call('/robots.txt');assert.equal(map.contentType,'application/xml');assert.match(map.body,/\/success-stories/);assert.doesNotMatch(map.body,/platform-admin|\/portal</);assert.match(robots.body,/Disallow: \/platform-admin/);assert.match(robots.body,/Sitemap: https:\/\/route-logistics.com\/sitemap.xml/);
});
test('unknown paths, path traversal and preview requests cannot reveal private content',async()=>{
 for(const path of ['/platform-admin','/faqs/../private','/success-stories/draft?preview=1','https://other.example'])assert.equal((await fixture([faq]).call(path)).code,404);
});
test('backend failures return a generic noindex 503 rather than a soft 200 or private error detail',async()=>{
 const p=await fixture([],true).call('/faqs');assert.equal(p.code,503);assert.match(p.headers['X-Robots-Tag'],/noindex/);assert.doesNotMatch(p.body,/private backend detail/);assert.match(p.body,/try again/i);
});
test('HEAD omits bodies and unsupported methods cannot mutate content',async()=>{
 const f=fixture([faq]);assert.equal((await f.call('/faqs','HEAD')).body,'');const p=await f.call('/faqs','POST');assert.equal(p.code,405);assert.equal(p.headers.Allow,'GET, HEAD');
});
