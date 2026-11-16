const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),babel=require('@babel/core');
const root=path.resolve(__dirname,'..'),policy={intervalMinutes:3,retentionHours:24,maxShiftHours:12,freshAfterSeconds:300};
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
const settle=async()=>{for(let i=0;i<4;i++)await new Promise(done=>setImmediate(done));};
const shift=(id,status='on-duty')=>({id,status,trackingConsent:true,startedAt:new Date(Date.now()-60000).toISOString(),expiresAt:new Date(Date.now()+3600000).toISOString()});
function harness(){
 const store=new Map(),calls=[],intervals=new Map(),timeouts=new Map();let timer=0;
 const env={store,calls,intervals,timeouts,permissions:0,native:false,nativeStarts:0,user:null,claims:null,auth:{app:{options:{projectId:'synthetic-scope-tests'}},authStateReady:async()=>{},currentUser:null}};
 env.setUser=(id,companyId='acme',role='technician',membershipId='member',keepAccount=false)=>{
  env.user={id,companyId,role,membershipId};env.claims={companyId,role,membershipId};
  if(!keepAccount||!env.auth.currentUser)env.auth.currentUser={uid:id,emailVerified:true,getIdTokenResult:async()=>({claims:env.claims})};
  return env.user;
 };
 env.setUser('account-a');
 env.rpc=async(name,data)=>name==='rlWorkShift'?{shift:data.action==='start'?shift('new-shift'):shift('initial-shift'),policy}:data.action==='start'?{sessionId:'new-session',policy}:{accepted:true,policy};
 const file=path.join(root,'services/workTracking.js'),module={exports:{}};
 const code=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,configFile:false,babelrc:false,plugins:[require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
 const load=name=>{
  if(name==='@react-native-async-storage/async-storage')return{getItem:async key=>store.get(key)||null,setItem:async(key,value)=>store.set(key,value),removeItem:async key=>store.delete(key)};
  if(name==='react-native')return{AppState:{currentState:'active',addEventListener:()=>({remove(){}})}};
  if(name==='expo-location')return{Accuracy:{Balanced:'balanced'},requestForegroundPermissionsAsync:async()=>{env.permissions++;return{granted:true};},requestBackgroundPermissionsAsync:async()=>{env.permissions++;return{granted:true};},getForegroundPermissionsAsync:async()=>({granted:true}),getBackgroundPermissionsAsync:async()=>({granted:true}),getCurrentPositionAsync:async()=>({timestamp:Date.now(),coords:{latitude:35,longitude:-119,accuracy:10}}),hasStartedLocationUpdatesAsync:async()=>env.native,stopLocationUpdatesAsync:async()=>{env.native=false;},startLocationUpdatesAsync:async()=>{env.native=true;env.nativeStarts++;}};
  if(name==='firebase/auth')return{onIdTokenChanged:()=>()=>{}};
  if(name==='../constants/firebase')return{auth:env.auth};
  if(name==='./workspaceApi')return{callWorkspace:async(name,data)=>{calls.push({name,...data,uid:env.auth.currentUser?.uid,companyId:env.claims?.companyId});return env.rpc(name,data);}};
  if(name==='./nativeInteraction')return{beginNativeInteraction:()=>()=>{}};
  throw Error(`Unexpected dependency: ${name}`);
 };
 new Function('require','module','exports','setInterval','clearInterval','setTimeout','clearTimeout',code)(load,module,module.exports,(fn,ms)=>{const id=++timer;intervals.set(id,{fn,ms});return id;},id=>intervals.delete(id),(fn,ms)=>{const id=++timer;timeouts.set(id,{fn,ms});return id;},id=>timeouts.delete(id));
 env.service=module.exports;return env;
}
test('a delayed status for account A cannot overwrite a later account B snapshot',async()=>{
 const env=harness(),old=deferred(),a={...env.user};env.rpc=async(_name,data)=>data.action==='status'&&env.auth.currentUser.uid==='account-a'?old.promise:{shift:shift('b-shift'),policy};
 const pending=env.service.refreshWorkShift(a);await settle();const b=env.setUser('account-b','other','manager','other-member');await env.service.refreshWorkShift(b);
 old.resolve({shift:shift('a-old'),policy});const stale=await pending;
 assert.equal(env.service.workTrackingSnapshot(b).shift.id,'b-shift');assert.equal(stale.shift,null);assert.equal(env.permissions,0);
});
test('a delayed account A status error cannot publish an error into account B',async()=>{
 const env=harness(),old=deferred(),a={...env.user};env.rpc=async()=>old.promise;
 const pending=env.service.refreshWorkShift(a);await settle();const b=env.setUser('account-b','other','manager','other-member');env.rpc=async()=>({shift:shift('b-shift'),policy});await env.service.refreshWorkShift(b);
 old.reject(Object.assign(new Error('Private old account error'),{code:'functions/permission-denied'}));await pending;
 assert.equal(env.service.workTrackingSnapshot(b).shift.id,'b-shift');assert.equal(env.service.workTrackingSnapshot(b).error,'');
});
test('same-UID company and role changes fence delayed status responses even if the Auth object is reused',async()=>{
 const env=harness(),old=deferred(),a={...env.user};env.rpc=async()=>old.promise;
 const pending=env.service.refreshWorkShift(a);await settle();const b=env.setUser(a.id,'other-company','manager','new-membership',true);env.rpc=async()=>({shift:shift('other-company-shift'),policy});await env.service.refreshWorkShift(b);
 old.resolve({shift:shift('old-company-shift'),policy});await pending;
 assert.equal(env.service.workTrackingSnapshot(b).shift.id,'other-company-shift');assert.equal(env.service.workTrackingSnapshot(a).shift,null);
});
test('a status response is revalidated against changed claims before any view or native update',async()=>{
 const env=harness(),old=deferred(),a={...env.user};env.rpc=async()=>old.promise;
 const pending=env.service.refreshWorkShift(a);await settle();env.claims={...env.claims,role:'manager'};
 old.resolve({shift:shift('untrusted-after-role-change'),policy});await assert.rejects(pending,/company or role changed/);
 assert.equal(env.service.workTrackingSnapshot().shift,null);assert.equal(env.permissions,0);assert.equal(env.native,false);
});
test('an older same-scope status response cannot overwrite a newer authoritative result',async()=>{
 const env=harness(),old=deferred();let count=0;env.rpc=async()=>++count===1?old.promise:{shift:shift('latest-shift'),policy};
 const initial=env.service.refreshWorkShift(env.user);await settle();await env.service.refreshWorkShift(env.user);
 old.resolve({shift:null,policy});await initial;assert.equal(env.service.workTrackingSnapshot(env.user).shift.id,'latest-shift');
});
test('an old End reply cannot replace a newly started shift or its durable consent',async()=>{
 const env=harness(),old=deferred();await env.service.refreshWorkShift(env.user);
 env.rpc=async(name,data)=>name==='rlWorkShift'&&data.action==='end'?old.promise:name==='rlWorkShift'?{shift:shift('new-shift'),policy}:data.action==='start'?{sessionId:'new-session',policy}:{accepted:true,policy};
 const pending=env.service.stopShiftTracking({endShift:true});await settle();await env.service.startWorkShift(env.user,{trackingConsent:true});await settle();
 old.resolve({shift:shift('initial-shift','off-duty'),policy});await pending;
 const current=env.service.workTrackingSnapshot(env.user);assert.equal(current.shift.id,'new-shift');assert.equal(current.shift.status,'on-duty');assert.equal(current.tracking,true);assert.ok([...env.store.values()].some(value=>value.includes('new-shift')));
});
test('an old End error cannot overwrite a newer shift message or error state',async()=>{
 const env=harness(),old=deferred();await env.service.refreshWorkShift(env.user);
 env.rpc=async(name,data)=>name==='rlWorkShift'&&data.action==='end'?old.promise:name==='rlWorkShift'?{shift:shift('new-shift'),policy}:data.action==='start'?{sessionId:'new-session',policy}:{accepted:true,policy};
 const pending=env.service.stopShiftTracking({endShift:true});await settle();await env.service.startWorkShift(env.user,{trackingConsent:true});await settle();
 old.reject(new Error('Old end timed out'));await pending;const current=env.service.workTrackingSnapshot(env.user);
 assert.equal(current.shift.id,'new-shift');assert.doesNotMatch(current.error,/Old end/);assert.doesNotMatch(current.message,/Shift ended/);
});
test('same-user company change ignores an old End reply and does not send an additional end request',async()=>{
 const env=harness(),old=deferred(),a={...env.user};await env.service.refreshWorkShift(a);env.rpc=async()=>old.promise;
 const pending=env.service.stopShiftTracking({endShift:true});await settle();const b=env.setUser(a.id,'other-company','manager','new-membership',true);env.rpc=async()=>({shift:shift('new-company-shift'),policy});await env.service.refreshWorkShift(b);
 old.resolve({shift:shift('initial-shift','off-duty'),policy});await pending;
 assert.equal(env.service.workTrackingSnapshot(b).shift.id,'new-company-shift');assert.equal(env.calls.filter(call=>call.action==='end').length,1);assert.equal(env.permissions,0);
});
test('metadata-only duty refresh does not start GPS or repeatedly restart consented native tracking',async()=>{
 const env=harness();let currentPolicy={...policy},status='on-duty';
 env.rpc=async(name,data)=>name==='rlWorkShift'?{shift:shift('same-shift',status),policy:currentPolicy}:data.action==='start'?{sessionId:'same-session',policy:currentPolicy}:{accepted:true,policy:currentPolicy};
 await env.service.refreshWorkShift(env.user,{reconfigure:false});assert.equal(env.nativeStarts,0);assert.equal(env.permissions,0);
 await env.service.startWorkShift(env.user,{trackingConsent:true,backgroundConsent:true});await settle();
 const starts=env.nativeStarts,permissions=env.permissions;
 await env.service.refreshWorkShift(env.user,{reconfigure:false});await env.service.refreshWorkShift(env.user,{reconfigure:false});
 assert.equal(env.nativeStarts,starts);assert.equal(env.permissions,permissions);
 currentPolicy={...policy,intervalMinutes:5};await env.service.refreshWorkShift(env.user,{reconfigure:false});assert.equal(env.nativeStarts,starts+1);
 status='off-duty';await env.service.refreshWorkShift(env.user,{reconfigure:false});assert.equal(env.native,false);assert.equal(env.service.workTrackingSnapshot(env.user).tracking,false);
});

test('offline End still clears local consent and exposes its unconfirmed server failure',async()=>{
 const env=harness();await env.service.startWorkShift(env.user,{trackingConsent:true,backgroundConsent:true});await settle();env.store.set('job-queue','preserve');
 env.rpc=async()=>{throw new Error('Network offline');};await assert.rejects(env.service.stopShiftTracking({endShift:true}),/Network offline/);
 const current=env.service.workTrackingSnapshot(env.user);assert.equal(current.tracking,false);assert.equal(env.native,false);assert.equal(env.store.get('job-queue'),'preserve');assert.match(current.error,/server shift end is not confirmed/);assert.equal([...env.store.keys()].some(key=>key.startsWith('rl-work-tracking')),false);
});
