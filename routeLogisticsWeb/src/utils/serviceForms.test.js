import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serviceAnswers,serviceReportText } from './serviceForms.js';
const template={fields:[{id:'reading',label:'Reading',type:'number',unit:'ppm',required:true,min:0,max:100},{id:'checks',label:'Checks',type:'checklist',options:['Inspected']},{id:'notes',label:'Notes',type:'notes',maxLength:100}]};
test('browser service fields validate required numeric limits and fixed choices without adding financial fields',()=>{
  assert.throws(()=>serviceAnswers(template,{},true),/required/);assert.throws(()=>serviceAnswers(template,{reading:'abc'},true),/numeric/);assert.throws(()=>serviceAnswers(template,{reading:101}),/numeric/);
  assert.throws(()=>serviceAnswers(template,{checks:['Unknown']}),/invalid/);
  assert.deepEqual(serviceAnswers(template,{reading:'7.5',checks:['Inspected'],totalCost:999},true),{reading:7.5,checks:['Inspected']});
});
test('exported service reports retain units/version/date while private photo IDs and unrelated finances stay out',()=>{
  const text=serviceReportText({responseVersion:2,status:'completed',createdAt:'2026-11-13',totalCost:999,report:{templateName:'Pool maintenance',templateVersion:1,serviceDate:'2026-11-13',fields:[{label:'Chlorine',type:'number',unit:'ppm',value:3},{label:'Photos',type:'photos',value:['private-photo-id']}]}});
  assert.match(text,/Template version: 1/);assert.match(text,/Report revision: 2/);assert.match(text,/Chlorine: 3 ppm/);assert.doesNotMatch(text,/private-photo-id|999/);
});
