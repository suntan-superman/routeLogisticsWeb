const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json')), web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), {create,act} = mobile('react-test-renderer'), {transformSync} = web('esbuild');
global.IS_REACT_ACT_ENVIRONMENT = true;
let tree,env;
const settle = () => new Promise(resolve=>setImmediate(resolve));
const deferred = () => {let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
function reset(){env={calls:[],toasts:[],dirty:false,confirm:true,confirmCalls:0,manage:true,response:{success:true},pending:null};}
const toast=message=>env.toasts.push({kind:'notice',message});toast.success=message=>env.toasts.push({kind:'success',message});toast.error=message=>env.toasts.push({kind:'error',message});
const dependencies=name=>{
  if(name==='react')return React;
  if(name==='react-hot-toast')return{__esModule:true,default:toast};
  if(name.endsWith('/services/customerService'))return{__esModule:true,default:{getCustomers:async()=>({success:true,customers:[{id:'customer-1',name:'Authorized customer'}]})}};
  if(name.endsWith('/services/servicePlanService'))return{FREQUENCIES:[{days:30,label:'Monthly'},{days:90,label:'Quarterly'}],listServicePlans:async()=>({success:true,plans:[]}),createServicePlan:async data=>{env.calls.push(data);if(env.pending)await env.pending.promise;if(env.thrown)throw env.thrown;return env.response;},updateServicePlan:async()=>({success:true}),deleteServicePlan:async()=>({success:true}),generateNextJob:async()=>({success:true})};
  if(name.endsWith('/services/serviceLogService'))return{listServiceLogs:async()=>({success:true,logs:[]}),logsToCsv:()=>''};
  if(name.endsWith('/services/tenancy'))return{canManage:()=>env.manage};
  if(name.endsWith('/components/ConfirmProvider'))return{useConfirm:()=>async()=>true};
  if(name.endsWith('/hooks/useUnsavedChanges'))return{useUnsavedChanges:dirty=>{env.dirty=dirty;return{confirmDiscard:async()=>{env.confirmCalls++;return env.confirm;}};}};
  if(name.endsWith('/contexts/AuthContext'))return{useAuth:()=>({currentUser:{uid:'owner-1'},company:{id:'company-1'}})};
  if(name.endsWith('/components/ServicePropertyEligibility'))return{__esModule:true,default:props=>{React.useEffect(()=>{props.onPolicyLoaded?.({settings:{configured:false}});},[props.onPolicyLoaded]);return null;}};
  throw Error('Unexpected dependency: '+name);
};
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
