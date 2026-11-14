const {test,before,after}=require('node:test');
const fs=require('node:fs');
const {initializeTestEnvironment,assertFails,assertSucceeds}=require('@firebase/rules-unit-testing');
const {doc,setDoc,getDoc,updateDoc,deleteDoc,collection,getDocs,writeBatch,setLogLevel}=require('firebase/firestore');
const {ref,uploadBytes,getMetadata,deleteObject}=require('firebase/storage');
let env;
const companyId='cms-rules-company',ownerId='cms-rules-owner',adminId='cms-rules-platform-admin',techId='cms-rules-tech';
const privateCollections=['rlPlatformAdmins','rlPlatformContent','rlPlatformContentImages','rlContentAudit','rlContentSlugs','rlPublicContent','rlPortalChallenges','rlPortalDocuments'];
const record='cms-rules-record',privateData={companyId,userId:ownerId,status:'draft',title:'Private draft',body:'Synthetic draft body',role:'admin',codeHash:'synthetic-never-a-real-code'};
function contexts(){return [
  ['anonymous',env.unauthenticatedContext()],
  ['platform-admin',env.authenticatedContext(adminId,{email_verified:true,platformAdmin:true})],
  ['company-owner',env.authenticatedContext(ownerId,{email_verified:true,companyId,role:'owner'})],
  ['technician',env.authenticatedContext(techId,{email_verified:true,companyId,membershipId:'cms-rules-member',role:'technician'})],
  ['portal-customer',env.authenticatedContext('cms-rules-customer',{email_verified:true,portal:true,email:'customer@example.invalid'})],
];}
before(async()=>{
  if(!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST||'')||!/^(localhost|127\.0\.0\.1):\d+$/.test(process.env.FIREBASE_STORAGE_EMULATOR_HOST||''))throw Error('Local Firestore and Storage emulators are required.');
  setLogLevel('silent');
  env=await initializeTestEnvironment({projectId:'demo-routelogistics',firestore:{rules:fs.readFileSync('firestore.rules','utf8')},storage:{rules:fs.readFileSync('storage.rules','utf8')}});
  await env.withSecurityRulesDisabled(async context=>{
    const db=context.firestore(),batch=writeBatch(db);
    batch.set(doc(db,`companies/${companyId}`),{ownerId,name:'CMS rule fixture'});
    batch.set(doc(db,'teamMembers/cms-rules-member'),{companyId,uid:techId,status:'active',role:'technician'});
    batch.set(doc(db,`rlPlatformAdmins/${adminId}`),{role:'admin',status:'active'});
    batch.set(doc(db,'customers/cms-rules-real-customer'),{companyId,name:'Scoped customer',emailNormalized:'customer@example.invalid'});
    batch.set(doc(db,'jobs/cms-rules-real-job'),{companyId,customerId:'cms-rules-real-customer',assignedTo:'cms-rules-member',status:'scheduled'});
    batch.set(doc(db,'invoices/cms-rules-real-invoice'),{companyId,customerId:'cms-rules-real-customer',total:100,status:'sent'});
    batch.set(doc(db,'photos/cms-rules-real-photo'),{companyId,customerId:'cms-rules-real-customer',jobId:'cms-rules-real-job',storagePath:'rlJobPhotos/private/photo.jpg'});
    for(const collection of privateCollections)batch.set(doc(db,`${collection}/${record}`),privateData);
    batch.set(doc(db,'rlPublicContent/cms-rules-published'),{type:'faq',status:'published',title:'Published via server only',slug:'cms-rules-published',body:'A public answer.'});
    await batch.commit();
    for(const path of [`rlPlatformContent/${record}/draft.png`,`rlPlatformContent/cms-rules-published/public.png`,'rlPortalDocuments/cms-rules-company/cms-rules-real-job/document.pdf','rlJobPhotos/private/photo.jpg',`companies/${companyId}/cms-rules-regression.jpg`])await uploadBytes(ref(context.storage(),path),new Uint8Array([1,2,3]),{contentType:path.endsWith('.pdf')?'application/pdf':'image/png'});
  });
});
after(async()=>{if(env)await env.cleanup();});

test('all browser identities are denied direct CMS/private portal reads, queries and mutations, including platform admins',async()=>{
  for(const [label,context] of contexts())for(const name of privateCollections){
    const db=context.firestore(),target=doc(db,`${name}/${record}`);
    await assertFails(getDoc(target));await assertFails(getDocs(collection(db,name)));
    await assertFails(setDoc(doc(db,`${name}/forged-${label}`),{...privateData,status:'published'}));
    await assertFails(updateDoc(target,{status:'published',role:'admin'}));await assertFails(deleteDoc(target));
  }
});
test('clients cannot self-grant platform administration or change an existing explicit grant',async()=>{
  for(const [label,context] of contexts()){
    const ownUid={'platform-admin':adminId,'company-owner':ownerId,technician:techId,'portal-customer':'cms-rules-customer'}[label]||'anonymous-self';
    const db=context.firestore();await assertFails(setDoc(doc(db,`rlPlatformAdmins/${ownUid}`),{status:'active',role:'admin'}));
    await assertFails(updateDoc(doc(db,`rlPlatformAdmins/${adminId}`),{status:'active',role:'admin',email:'forged@example.invalid'}));
  }
});
test('published projections remain server mediated and draft image objects cannot be fetched or replaced directly',async()=>{
  for(const [,context] of contexts()){
    await assertFails(getDoc(doc(context.firestore(),'rlPublicContent/cms-rules-published')));
    for(const path of [`rlPlatformContent/${record}/draft.png`,'rlPlatformContent/cms-rules-published/public.png','rlPortalDocuments/cms-rules-company/cms-rules-real-job/document.pdf','rlJobPhotos/private/photo.jpg']){
      const file=ref(context.storage(),path);await assertFails(getMetadata(file));await assertFails(uploadBytes(file,new Uint8Array([4]),{contentType:'image/png'}));await assertFails(deleteObject(file));
    }
    await assertFails(uploadBytes(ref(context.storage(),'rlPlatformContent/new-record/new.png'),new Uint8Array([5]),{contentType:'image/png'}));
  }
});
test('platform CMS access does not confer customer/provider financial or service-record privileges',async()=>{
  const admin=env.authenticatedContext(adminId,{email_verified:true,platformAdmin:true}).firestore();
  for(const path of ['customers/cms-rules-real-customer','jobs/cms-rules-real-job','invoices/cms-rules-real-invoice','photos/cms-rules-real-photo'])await assertFails(getDoc(doc(admin,path)));
  const portal=env.authenticatedContext('cms-rules-customer',{email_verified:true,portal:true}).firestore();
  for(const path of ['customers/cms-rules-real-customer','jobs/cms-rules-real-job','invoices/cms-rules-real-invoice','photos/cms-rules-real-photo'])await assertFails(getDoc(doc(portal,path)));
  const owner=env.authenticatedContext(ownerId,{email_verified:true,companyId,role:'owner'});
  await assertSucceeds(getDoc(doc(owner.firestore(),'customers/cms-rules-real-customer')));
  await assertSucceeds(getMetadata(ref(owner.storage(),`companies/${companyId}/cms-rules-regression.jpg`)));
});
