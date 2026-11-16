const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json')), web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), {create,act} = mobile('react-test-renderer'), {transformSync} = web('esbuild');
const {createWorkspaceQueryMock,selectControlMock}=require('./support/workspaceQueryMock.cjs');
const workspaceHooks=createWorkspaceQueryMock(React,{scopeId:()=>env?.company||'solo'});
global.IS_REACT_ACT_ENVIRONMENT = true;
let tree,env, Notice, Recurrence;
const settle = () => new Promise(resolve=>setImmediate(resolve));
const deferred = () => {let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
function reset(){env={calls:[],toasts:[],dirty:false,confirm:true,confirmCalls:0,manage:true,response:{success:true},pending:null,company:'company-1'};}
const toast=message=>env.toasts.push({kind:'notice',message});toast.success=message=>env.toasts.push({kind:'success',message});toast.error=message=>env.toasts.push({kind:'error',message});
const dependencies=name=>{
  if(name==='react')return React;
    if(name.endsWith('/useWorkspaceQuery'))return workspaceHooks;
    if(name.endsWith('/SelectControl'))return{__esModule:true,default:selectControlMock(React)};
    if(name.endsWith('/workspaceQueryPolicy'))return{workspaceAccessError:error=>['permission-denied','unauthenticated','not-found','workspace-changed'].includes(String(error?.code||'').split('/').pop())};
  if(name==='react-hot-toast')return{__esModule:true,default:toast};
  if(name.endsWith('/components/AddressValidationNotice'))return{__esModule:true,default:Notice};
  if(name.endsWith('/components/TechnicianAvailability'))return{__esModule:true,default:()=>null};
  if(name.endsWith('/services/schedulingService'))return{schedulingFingerprint:value=>JSON.stringify(value)};
  if(name.endsWith('/utils/appointmentRecurrence'))return Recurrence;
  if(name.endsWith('/components/TimeSelect'))return{__esModule:true,default:props=>React.createElement('label',null,props.label,React.createElement('input',{type:'time','aria-label':props.label,value:props.value,disabled:props.disabled,onChange:event=>props.onChange(event.target.value)}))};
  if(name.endsWith('/services/customerService'))return{__esModule:true,default:{getCustomers:async()=>({success:true,customers:[{id:'customer-1',name:'Authorized customer'}]})}};
  if(name.endsWith('/services/servicePlanService'))return{FREQUENCIES:[{days:30,label:'Monthly'},{days:90,label:'Quarterly'}],listServicePlans:async()=>({success:true,plans:[]}),createServicePlan:async data=>{env.calls.push(data);if(env.pending)await env.pending.promise;if(env.thrown)throw env.thrown;return env.response;},updateServicePlan:async()=>({success:true}),deleteServicePlan:async()=>({success:true}),generateNextJob:async()=>({success:true})};
  if(name.endsWith('/services/serviceLogService'))return{listServiceLogs:async()=>({success:true,logs:[]}),logsToCsv:()=>''};
  if(name.endsWith('/services/tenancy'))return{canManage:()=>env.manage};
  if(name.endsWith('/components/ConfirmProvider'))return{useConfirm:()=>async()=>true};
  if(name.endsWith('/hooks/useUnsavedChanges'))return{useUnsavedChanges:dirty=>{env.dirty=dirty;return{confirmDiscard:async()=>{env.confirmCalls++;return env.confirm;}};}};
  if(name.endsWith('/contexts/AuthContext'))return{useAuth:()=>({currentUser:{uid:'owner-1'},company:env.company?{id:env.company}:null})};
  if(name.endsWith('/components/ServicePropertyEligibility'))return{__esModule:true,default:props=>{env.property=props;React.useEffect(()=>{props.onPolicyLoaded?.({settings:{configured:false}});},[props.onPolicyLoaded]);return React.createElement('section',null,React.createElement('input',{'aria-label':'Service property address',value:props.value.address,onChange:event=>props.onChange({...props.value,address:event.target.value,exceptionId:null,confirmed:false})}),React.createElement(Notice,{validation:props.validation,disabled:props.disabled,onAccept:address=>props.onChange({...props.value,address,exceptionId:null,confirmed:false})}));}};
  throw Error('Unexpected dependency: '+name);
};
const noticeModule={exports:{}};new Function('React','require','module','exports',transformSync(fs.readFileSync(path.resolve(__dirname,'../routeLogisticsWeb/src/components/AddressValidationNotice.jsx'),'utf8'),{loader:'jsx',format:'cjs'}).code)(React,dependencies,noticeModule,noticeModule.exports);Notice=noticeModule.exports.default;
const recurrenceModule={exports:{}};new Function('require','module','exports',transformSync(fs.readFileSync(path.resolve(__dirname,'../routeLogisticsWeb/src/utils/appointmentRecurrence.js'),'utf8'),{loader:'js',format:'cjs'}).code)(dependencies,recurrenceModule,recurrenceModule.exports);Recurrence=recurrenceModule.exports;
const moduleValue={exports:{}};
new Function('React','require','module','exports',transformSync(fs.readFileSync(path.resolve(__dirname,'../routeLogisticsWeb/src/pages/ServicePlansPage.jsx'),'utf8'),{loader:'jsx',format:'cjs'}).code)(React,dependencies,moduleValue,moduleValue.exports);
const Page=moduleValue.exports.default;
const button=label=>tree.root.findAll(node=>node.type==='button'&&node.children.join('')===label)[0];
const field=label=>tree.root.findAll(node=>node.type==='label'&&typeof node.children[0]==='string'&&node.children[0].trim()===label)[0].findAll(node=>node.type==='input'||node.type==='select')[0];
const render=async()=>{await act(async()=>{tree=create(React.createElement(Page));});await act(settle);};
const click=async label=>{await act(async()=>button(label).props.onClick());await act(settle);};
const change=async(label,value)=>{await act(async()=>field(label).props.onChange({target:{value}}));};
const submit=async()=>{await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));await act(settle);};
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});

test('new plan requires an actual valid change and reverting clears the unsaved guard',async()=>{
  reset();await render();await click('New plan');assert.equal(button('Create plan').props.disabled,true);assert.equal(env.dirty,false);
  await change('Frequency','90');assert.equal(env.dirty,false);
  await change('Customer *','customer-1');assert.equal(button('Create plan').props.disabled,false);assert.equal(env.dirty,true);
  await change('Customer *','');assert.equal(button('Create plan').props.disabled,true);assert.equal(env.dirty,false);assert.equal(env.calls.length,0);
});

test('service-plan time selection saves its selected quarter hour',async()=>{
  reset();await render();await click('New plan');await change('Customer *','customer-1');
  await change('Time','09:45');assert.equal(field('Time').props.value,'09:45');
  await submit();assert.equal(env.calls.length,1);assert.equal(env.calls[0].time,'09:45');
});

test('cancel retains edited plan on Keep editing and resets it after confirmed discard',async()=>{
  reset();await render();await click('New plan');await change('Customer *','customer-1');await change('Notes','Unsent visit instructions');
  env.confirm=false;await click('Cancel');assert.equal(field('Notes').props.value,'Unsent visit instructions');assert.equal(env.dirty,true);assert.equal(env.confirmCalls,1);
  env.confirm=true;await click('Cancel');assert.equal(tree.root.findAllByType('form').length,0);assert.equal(env.dirty,false);
  await click('New plan');assert.equal(field('Notes').props.value,'');assert.equal(button('Create plan').props.disabled,true);
});

test('failed plan creation shows an error and retains selections for successful retry',async()=>{
  reset();await render();await click('New plan');await change('Customer *','customer-1');await change('Notes','Retain this note');env.response={success:false,error:'The plan could not be saved.'};
  await submit();assert.deepEqual(env.toasts.at(-1),{kind:'error',message:'The plan could not be saved.'});assert.equal(field('Notes').props.value,'Retain this note');assert.equal(env.dirty,true);assert.equal(button('Create plan').props.disabled,false);
  env.response={success:true};await submit();assert.equal(env.toasts.at(-1).kind,'success');assert.equal(env.dirty,false);assert.equal(tree.root.findAllByType('form').length,0);assert.deepEqual(env.calls[0],env.calls[1]);
});

test('in-flight plan creation disables fields and blocks duplicate submit operations',async()=>{
  reset();await render();await click('New plan');await change('Customer *','customer-1');env.pending=deferred();
  const handler=tree.root.findByType('form').props.onSubmit;let first,second;
  await act(async()=>{first=handler({preventDefault(){}});second=handler({preventDefault(){}});});
  assert.equal(env.calls.length,1);assert.equal(tree.root.findByType('fieldset').props.disabled,true);assert.ok(button('Saving…'));assert.equal(button('Cancel').props.disabled,true);
  await act(async()=>{env.pending.resolve();await Promise.all([first,second]);});await act(settle);assert.equal(env.dirty,false);assert.equal(env.calls.length,1);
});

test('transport failure remains retryable and a downgraded role cannot submit its draft',async()=>{
  reset();await render();await click('New plan');await change('Customer *','customer-1');env.thrown=new Error('Network unavailable.');await submit();assert.equal(env.toasts.at(-1).message,'Network unavailable.');assert.equal(env.dirty,true);
  env.manage=false;await submit();assert.equal(env.calls.length,1);assert.equal(field('Customer *').props.value,'customer-1');
});

test('a plan address suggestion retains its draft and is explicitly applied before a separate save',async()=>{
  reset();await render();await click('New plan');await change('Customer *','customer-1');await change('Notes','Keep these visit instructions');
  await act(async()=>env.property.onChange({address:'Unconfirmed property',serviceCategory:'Pest Control',exceptionId:'old-owner-approval',confirmed:false}));
  env.response={success:false,error:'Review the address.',details:{addressValidation:{status:'confirmation-required',suggestedAddress:'100 Confirmed Property, Bakersfield, CA 93312',message:'Google suggested a more precise address.'}}};
  await submit();assert.equal(field('Notes').props.value,'Keep these visit instructions');assert.equal(env.calls.length,1);assert.ok(button('Use suggested address'));
  await click('Use suggested address');assert.equal(env.calls.length,1);assert.equal(env.property.value.address,'100 Confirmed Property, Bakersfield, CA 93312');assert.equal(env.property.value.exceptionId,null);assert.equal(button('Use suggested address'),undefined);
  env.response={success:true};await submit();assert.equal(env.calls.length,2);assert.equal(env.calls[1].serviceProperty.address,'100 Confirmed Property, Bakersfield, CA 93312');assert.equal(env.calls[1].serviceAreaExceptionId,null);assert.equal(env.calls[1].notes,'Keep these visit instructions');
});

test('solo plans show address suggestions and serialize the accepted property explicitly',async()=>{
  reset();env.company=null;await render();await click('New plan');await change('Customer *','customer-1');
  const address=()=>tree.root.findByProps({'aria-label':'Service property address'});
  await act(async()=>address().props.onChange({target:{value:'Unconfirmed solo property'}}));
  env.response={success:false,error:'Confirm property.',details:{addressValidation:{status:'confirmation-required',suggestedAddress:'200 Confirmed Solo Property',message:'Review the corrected property.'}}};
  await submit();await click('Use suggested address');assert.equal(env.calls.length,1);assert.equal(address().props.value,'200 Confirmed Solo Property');
  env.response={success:true};await submit();assert.deepEqual(env.calls[1].serviceProperty,{address:'200 Confirmed Solo Property'});assert.equal(env.calls[1].serviceAreaExceptionId,null);
});

test('unavailable plan validation remains visible and a manual address or form change removes stale proposals',async()=>{
  reset();await render();await click('New plan');await change('Customer *','customer-1');await change('Notes','Retained plan');
  env.response={success:false,error:'Google is unavailable.',details:{addressValidation:{status:'unavailable',message:'Try the address check again shortly.'}}};
  await submit();assert.match(JSON.stringify(tree.toJSON()),/Address check unavailable/);assert.equal(field('Notes').props.value,'Retained plan');assert.equal(button('Use suggested address'),undefined);
  await act(async()=>env.property.onChange({...env.property.value,address:'Another explicit property'}));assert.doesNotMatch(JSON.stringify(tree.toJSON()),/Address check unavailable/);assert.equal(env.calls.length,1);
  await submit();assert.match(JSON.stringify(tree.toJSON()),/Address check unavailable/);await click('Cancel');await click('New plan');assert.doesNotMatch(JSON.stringify(tree.toJSON()),/Address check unavailable/);
});

test('service-plan client retains structured address rejection details from its callable',async()=>{
  const failure=Object.assign(new Error('Review this address.'),{code:'functions/failed-precondition',details:{addressValidation:{status:'confirmation-required',suggestedAddress:'A confirmed test property'}}});
  const module={exports:{}}, mock=name=>name==='firebase/functions'?{httpsCallable:()=>async()=>{throw failure;}}:name==='firebase/firestore'?{}:name==='./firebase'?{db:{},functions:{}}:name==='./tenancy'?{scopeWhere:()=>{}}:(()=>{throw Error('Unexpected service dependency '+name);})();
  new Function('require','module','exports',transformSync(fs.readFileSync(path.resolve(__dirname,'../routeLogisticsWeb/src/services/servicePlanService.js'),'utf8'),{loader:'js',format:'cjs'}).code)(mock,module,module.exports);
  const originalError=console.error;let result;try{console.error=()=>{};result=await module.exports.createServicePlan({customerId:'customer-1',nextServiceDate:'2030-01-02',frequencyDays:30});}finally{console.error=originalError;}
  assert.equal(result.success,false);assert.equal(result.code,failure.code);assert.deepEqual(result.details,failure.details);
});
