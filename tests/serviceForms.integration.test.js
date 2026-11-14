const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const req = require('node:module').createRequire(require('node:path').resolve(__dirname,'../functions/package.json'));
const { initializeApp, deleteApp } = req('firebase-admin/app');
const { getFirestore } = req('firebase-admin/firestore');
const { initializeTestEnvironment,assertFails } = require('@firebase/rules-unit-testing');
const { doc,getDoc,setDoc } = require('firebase/firestore');
const { serviceFormsHandler } = require('../functions/serviceForms');
let app, db, forms, rulesEnv;
const owner = { uid:'service-owner',token:{ companyId:'service-co',role:'owner',email_verified:true } };
const tech = { uid:'service-tech',token:{ companyId:'service-co',role:'technician',membershipId:'service-member',email_verified:true } };
const request = (data,auth=tech) => ({ data,auth });
const save = (jobId,answers,extra={}) => ({ action:'save',jobId,templateId:'pool-maintenance',templateVersion:1,assignmentVersion:1,expectedVersion:0,operationId:'service-operation-0001',status:'completed',answers,...extra });
before(async () => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) throw new Error('Emulator required');
  app = initializeApp({ projectId:'demo-routelogistics' },'service-forms-tests'); db = getFirestore(app); forms = serviceFormsHandler(db,{enabled:()=>true});
  await db.doc('companies/service-co').set({ ownerId:owner.uid });
  await db.doc('teamMembers/service-member').set({ companyId:'service-co',uid:tech.uid,role:'technician',status:'active' });
  rulesEnv=await initializeTestEnvironment({projectId:'demo-routelogistics',firestore:{rules:require('node:fs').readFileSync(require('node:path').resolve(__dirname,'../firestore.rules'),'utf8')}});
});
after(async () => { await rulesEnv?.cleanup(); if(app)await deleteApp(app); });
async function assigned(suffix, extra={}) {
  const jobId=`service-job-${suffix}`;
  await db.doc(`jobs/${jobId}`).set({ companyId:'service-co',userId:owner.uid,assignedTo:'service-member',date:'2026-11-13',status:'in-progress',totalCost:900,...extra });
  await forms(request({action:'assign',jobId,templateId:'pool-maintenance',templateVersion:1,expectedVersion:0},owner)); return jobId;
}
const good = { ph:7.4,freeChlorine:3,equipment:'Normal' };
test('service reports enforce tenant, verified active assignment and manager-only template operations', async () => {
  const jobId=await assigned('access');
  await assert.rejects(forms(request({action:'assign',jobId,templateId:'pest-control',templateVersion:1,expectedVersion:1})),{code:'permission-denied'});
  await assert.rejects(forms(request({action:'read',jobId},{...tech,token:{...tech.token,email_verified:false}})),{code:'failed-precondition'});
  await db.doc(`jobs/${jobId}`).update({ assignedTo:'other-member' });
  await assert.rejects(forms(request(save(jobId,good))),{code:'permission-denied'});
  await db.doc(`jobs/${jobId}`).update({ assignedTo:'service-member',companyId:'other-company' });
  await assert.rejects(forms(request({action:'read',jobId})),{code:'permission-denied'});
});
test('final validation, photo job ownership and immutable/idempotent reports preserve legacy chemical records', async () => {
  const jobId=await assigned('report'); await db.doc('serviceLogs/service-existing').set({companyId:'service-co',jobId,product:'Regulated product',epaRegNo:'existing-registration',amount:2});
  await assert.rejects(forms(request(save(jobId,{ph:7.4}))),{code:'invalid-argument'});
  await db.doc('photos/service-wrong-photo').set({ companyId:'service-co',jobId:'another-job' });
  await assert.rejects(forms(request(save(jobId,{...good,photos:['service-wrong-photo']}))),{code:'permission-denied'});
  await db.doc('photos/service-foreign-photo').set({ companyId:'other-company',jobId });
  await assert.rejects(forms(request(save(jobId,{...good,photos:['service-foreign-photo']}))),{code:'permission-denied'});
  await db.doc('photos/service-valid-photo').set({companyId:'service-co',jobId,storagePath:'private',caption:'Service evidence'});
  const payload=save(jobId,{...good,photos:['service-valid-photo']});
  assert.equal((await forms(request(payload))).version,1); assert.equal((await forms(request(payload))).duplicate,true);
  await assert.rejects(forms(request({...payload,answers:{...good,ph:8}})),{code:'already-exists'});
  const result=await forms(request({action:'read',jobId}));
  assert.equal(result.reports.length,1); assert.equal(result.reports[0].report.serviceDate,'2026-11-13'); assert.equal(result.form.template.version,1);
  assert.equal(result.reports[0].report.fields.find(field=>field.id==='freeChlorine').unit,'ppm'); assert.equal(JSON.stringify(result).includes('totalCost'),false); assert.equal(JSON.stringify(result).includes('storagePath'),false);
  assert.equal((await db.doc('serviceLogs/service-existing').get()).get('epaRegNo'),'existing-registration');
});
test('response conflicts and template reassignment retain immutable history without overwriting newer observations', async () => {
  const jobId=await assigned('conflict'); await forms(request(save(jobId,good)));
  const stale=await forms(request(save(jobId,{...good,ph:7.8},{operationId:'service-operation-0002'})));
  assert.equal(stale.status,'conflict'); assert.equal(stale.version,1); assert.equal(stale.server.answers.ph,7.4);
  await forms(request({action:'assign',jobId,templateId:'pest-control',templateVersion:1,expectedVersion:1},owner));
  await assert.rejects(forms(request(save(jobId,good,{operationId:'service-operation-0003'}))),{code:'failed-precondition'});
  assert.equal((await forms(request({action:'read',jobId}))).reports.length,1);
});
test('company template versions are immutable, tenant scoped and feature-disabled writes are rejected', async () => {
  const template={id:'company-pool',name:'Company pool check',industry:'pool',version:1,fields:[{id:'reading',label:'Water reading',type:'number',unit:'ppm',required:true,min:0,max:100}]};
  await forms(request({action:'publish',template},owner)); await assert.rejects(forms(request({action:'publish',template},owner)),{code:'already-exists'});
  await forms(request({action:'publish',template:{...template,version:2}},owner));
  const catalog=await forms(request({action:'catalog'},owner)); assert.equal(catalog.templates.find(row=>row.id===template.id).version,2);
  const disabled=serviceFormsHandler(db,{enabled:()=>false}); const jobId=await assigned('disabled');
  await assert.rejects(disabled(request(save(jobId,good))),{code:'failed-precondition'}); assert.equal((await disabled(request({action:'read',jobId}))).enabled,false);
});
test('revoked membership and direct client access cannot read or mutate private service records',async()=>{
  const jobId=await assigned('revoked');await db.doc('teamMembers/service-member').update({status:'revoked'});
  await assert.rejects(forms(request({action:'read',jobId})),{code:'permission-denied'});
  await assert.rejects(forms(request(save(jobId,good))),{code:'permission-denied'});
  await db.doc('teamMembers/service-member').update({status:'active'});
  const client=rulesEnv.authenticatedContext(tech.uid,tech.token).firestore();
  for(const collection of ['rlJobServiceForms','rlServiceTemplates','rlServiceTemplateHeads']){
    await assertFails(getDoc(doc(client,collection,jobId)));await assertFails(setDoc(doc(client,collection,'forged'),{companyId:'service-co',userId:tech.uid}));
  }
  await assertFails(setDoc(doc(client,'rlJobServiceForms',jobId,'reports','forged'),{status:'completed',answers:good}));
});
