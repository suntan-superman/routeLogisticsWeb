const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PDFDocument}=require('pdf-lib');
const {estimateTotals,cleanDraft,createEstimatePdf}=require('./estimates');
test('estimate totals use integer cents, round line quantities and tax once, and ignore client totals',()=>{
  const totals=estimateTotals([{kind:'labor',description:'Labor',quantity:2,unitPrice:100.05},{kind:'material',description:'Material',quantity:.5,unitPrice:20.01}],7.5);
  assert.equal(totals.subtotalCents,21011);assert.equal(totals.taxCents,1576);assert.equal(totals.totalCents,22587);
  const draft=cleanDraft({title:'Quote',serviceType:'Service',lineItems:[{kind:'service',description:'Visit',quantity:1,unitPrice:10}],totalCents:1,total:0});assert.equal(draft.totalCents,1000);
});
test('estimate amounts reject malformed, negative, overflowing and overly precise values',()=>{
  const item={kind:'service',description:'Visit',quantity:1,unitPrice:10};
  for(const patch of [{quantity:0},{quantity:-1},{quantity:.0001},{unitPrice:-1},{unitPrice:1.001},{unitPrice:Infinity},{unitPrice:'10'},{unitPrice:1000000000}])assert.throws(()=>estimateTotals([{...item,...patch}]));
  assert.throws(()=>estimateTotals([item],100.01));assert.throws(()=>estimateTotals([]));assert.throws(()=>cleanDraft({title:'Quote',serviceType:'Service',lineItems:[item],photoIds:Array(7).fill('same')}));
});
test('branded PDF generation stays local, produces a readable bounded PDF and never fetches company logo URLs',async()=>{
  const quote={...estimateTotals([{kind:'labor',description:'Inspection and service',quantity:1,unitPrice:100}],7.5),title:'Controlled estimate',serviceType:'Inspection',estimateNumber:'RL-CONTROL',version:1,recipient:{name:'Controlled customer',address:'Test address'},scopeOfWork:'Approved service scope',notes:'No live customer data.',validUntil:'2026-12-13T00:00:00.000Z'};
  const bytes=await createEstimatePdf(quote,{name:'Controlled Company',logo:'https://never-fetch.invalid/logo.png'});assert.equal(bytes.subarray(0,5).toString(),'%PDF-');assert.ok(bytes.length<100000);assert.ok((await PDFDocument.load(bytes)).getPageCount()>=1);
});
test('a genuine JPEG attachment and caption are embedded as a PDF image, including a pooled Node Buffer',async()=>{
  // A two-pixel test image generated locally with the OS JPEG encoder. It has
  // no customer content and keeps this unit test portable without native tools.
  const jpeg=Buffer.from('/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDyqiiivyI/Cj//2Q==','base64');
  const quote={...estimateTotals([{kind:'service',description:'Photo-based service quote',quantity:1,unitPrice:25}]),title:'Photo estimate',estimateNumber:'RL-PHOTO',version:1,recipient:{name:'Synthetic customer'},scopeOfWork:'Controlled photo evidence',validUntil:'2026-12-13T00:00:00.000Z'};
  const bytes=await createEstimatePdf(quote,{name:'Controlled Company'},[{bytes:jpeg,caption:'Synthetic green test image'}]);
  const {PDFName,PDFRawStream}=require('pdf-lib'),document=await PDFDocument.load(bytes);
  const images=document.context.enumerateIndirectObjects().map(([,object])=>object).filter(object=>object instanceof PDFRawStream&&object.dict.get(PDFName.of('Subtype'))?.toString()==='/Image');
  assert.equal(images.length,1);assert.equal(images[0].dict.get(PDFName.of('Width')).asNumber(),2);assert.equal(images[0].dict.get(PDFName.of('Height')).asNumber(),2);assert.equal(images[0].dict.get(PDFName.of('Filter')).toString(),'/DCTDecode');
});
