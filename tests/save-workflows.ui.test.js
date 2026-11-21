const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const mobile = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json')), web = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), { transformSync } = web('esbuild');
const {createWorkspaceQueryMock,selectControlMock}=require('./support/workspaceQueryMock.cjs');
const workspaceHooks=createWorkspaceQueryMock(React,{scopeId:'test-workspace'});
global.IS_REACT_ACT_ENVIRONMENT = true;
let tree, env;
const settle = () => new Promise(resolve => setImmediate(resolve));
const source = relative => fs.readFileSync(path.resolve(__dirname, '../routeLogisticsWeb/src', relative), 'utf8');
const compile = (relative, resolve) => { const module = {exports:{}}; new Function('React','require','module','exports',transformSync(source(relative),{loader:'jsx',format:'cjs'}).code)(React,resolve,module,module.exports);return module.exports; };
const utilities = name => compile('utils/'+name+'.js', () => { throw Error('Unexpected utility dependency'); });
const template = {id:'custom-service',name:'Inspection',version:1,fields:[{id:'notes',label:'Notes',type:'notes',maxLength:100},{id:'checks',label:'Checks',type:'checklist',options:['A','B']},{id:'photos',label:'Photos',type:'photos',maxPhotos:3}]};
const estimate = () => ({id:'estimate-1',title:'Inspection estimate',serviceType:'Pest',scopeOfWork:'Inspect property',customerId:'customer-1',status:'draft',version:1,totalCents:2000,lineItems:[{kind:'labor',description:'Inspection',quantity:1,unitPrice:20}],photoIds:[]});
function reset(kind) {
  env={kind,calls:[],toasts:[],dirty:false,confirm:true,confirmCalls:0,failSave:false,failListAfterSave:false,saved:false,estimate:estimate(),delivery:null,pdfPreviews:0,answers:{notes:'Saved note',checks:['A','B'],photos:['photo-1']},version:1};
  const memory = new Map(); global.localStorage={getItem:key=>memory.get(key)||null,setItem:(key,value)=>memory.set(key,value),removeItem:key=>memory.delete(key)};
  Object.defineProperty(global,'navigator',{configurable:true,value:{onLine:true}});
}
async function routing(name,data) {
  env.calls.push({name,data});
  if(name==='rlGetRoutingTeam')return{team:[{id:'tech-1',name:'Technician'},{id:'tech-2',name:'Another technician'}],startAddress:'Company base'};
  if(name==='rlGetDailyRoute')return{saved:{jobIds:['job-1','job-2'],startAddress:'Company base',returnToStart:true,revision:1},stops:[{id:'job-1',customerName:'First',address:'First address',time:'09:00',serviceType:'Pest'},{id:'job-2',customerName:'Second',address:'Second address',time:'10:00',serviceType:'Pest'}]};
  if(name==='rlSaveDailyRoute'){if(env.failSave)throw Error('Route could not be saved.');return{revision:2};}
  throw Error('Unexpected route operation');
}
async function service(_name,data) {
  env.calls.push({name:data.action,data});
  if(data.action==='read')return{enabled:true,form:{template,answers:env.answers,assignmentVersion:1,responseVersion:env.version,status:'draft'},photos:[{id:'photo-1'}],reports:[]};
  if(data.action==='save'){if(env.failSave)throw Error('Service save failed.');env.answers=data.answers;return{status:'synced',version:++env.version};}
  throw Error('Unexpected service operation');
}
async function estimates(name,data) {
  env.calls.push({name,data});
  if(name==='list'){if(env.saved&&env.failListAfterSave)throw Error('List refresh failed.');return{estimates:[env.estimate],enabled:true,emailEnabled:false};}
  if(name==='get')return{estimate:env.estimate,photos:[],versions:[],emailEnabled:true,delivery:env.delivery,permissions:{canEdit:!['approved','converted'].includes(env.estimate.status),canReview:['draft','submitted-for-review'].includes(env.estimate.status),canDeliver:env.estimate.status==='approved-for-delivery'}};
  if(name==='save'){if(env.failSave)throw Error('Estimate save failed.');env.saved=true;env.estimate={...env.estimate,...data.data,version:env.estimate.version+1};return{estimate:env.estimate};}
  if(name==='convert'){env.estimate={...env.estimate,convertedJobId:'controlled-converted-job'};return{jobId:'controlled-converted-job'};}
  throw Error('Unexpected estimate operation');
}
const mock = name => {
  if(name==='react')return React;
    if(name.endsWith('/useWorkspaceQuery'))return workspaceHooks;
    if(name.endsWith('/SelectControl'))return{__esModule:true,default:selectControlMock(React)};
    if(name.endsWith('/workspaceQueryPolicy'))return{workspaceAccessError:error=>['permission-denied','unauthenticated','not-found','workspace-changed'].includes(String(error?.code||'').split('/').pop())};
  if(name.endsWith('/components/TimeSelect'))return{__esModule:true,default:props=>React.createElement('label',null,props.label,React.createElement('input',{type:'time','aria-label':props.label,value:props.value,disabled:props.disabled,onChange:event=>props.onChange(event.target.value)}))};
  if(name==='react-hot-toast')return{__esModule:true,default:{success:message=>env.toasts.push({kind:'success',message}),error:message=>env.toasts.push({kind:'error',message})}};
  if(name.endsWith('/hooks/useUnsavedChanges'))return{useUnsavedChanges:dirty=>{env.dirty=dirty;return{confirmDiscard:async()=>{env.confirmCalls++;return env.confirm;}};}};
  if(name==='firebase/functions')return{httpsCallable:(_functions,name)=>async data=>({data:await routing(name,data)})};
  if(name.endsWith('/services/firebase'))return{functions:{}};
  if(name.endsWith('/services/tenancy'))return{can:()=>true,getClaims:()=>({membershipId:'membership-1'})};
  if(name.endsWith('/services/maps'))return{loadMaps:()=>{throw Error('Maps must not be called during save tests');}};
  if(name.endsWith('/utils/routePlanning'))return{googleNavigation:()=>'',appointmentWarnings:()=>[]};
  if(name.endsWith('/utils/teamLocationMap'))return utilities('teamLocationMap');
  if(name==='./MyWorkPage'||name==='./ServiceTemplateEditor')return{__esModule:true,default:()=>null};
  if(name.endsWith('/contexts/AuthContext'))return{useAuth:()=>({currentUser:{uid:'user-1'},company:{id:'company-1',ownerId:'user-1',serviceCategories:['Pest Control','Pool Cleaning']},role:env.kind==='estimates-geography'?'owner':'technician',can:capability=>env.kind.startsWith('estimates')&&(capability==='estimates.manage'||env.kind==='estimates-geography'&&['customers.manage','jobs.schedule'].includes(capability))})};
  if(name.endsWith('/services/workspaceApi'))return{callWorkspace:async(name,data)=>{
    if(env.kind==='route')return routing(name,data);
    if(name!=='rlServiceAreas')return service(name,data);
    env.calls.push({name,data});
    if(data.action==='status')return{settings:{configured:true,revision:1,allowOutOfAreaRequests:true},canApproveExceptions:true,availableCategories:['Pest Control','Pool Cleaning']};
    if(data.action==='check'){if(env.pendingPropertyCheck)return env.pendingPropertyCheck;return{eligible:true,status:'inside',message:'The actual property is covered.',property:{formattedAddress:data.propertyAddress}};}
    throw Error('Unexpected service-area test operation');
  }};
  if(name.endsWith('/utils/serviceForms'))return utilities('serviceForms');
  if(name.endsWith('/utils/estimateDraft'))return utilities('estimateDraft');
  if(name.endsWith('/utils/format'))return utilities('format');
  if(name.endsWith('/AddressValidationNotice'))return compile('components/AddressValidationNotice.jsx',mock);
  if(name.endsWith('/components/ServicePropertyEligibility'))return env.kind==='estimates-geography'?compile('components/ServicePropertyEligibility.jsx',mock):{__esModule:true,default:()=>null};
  if(name.endsWith('/services/customerService'))return{__esModule:true,default:{getCustomers:async()=>({success:true,customers:[{id:'customer-1',name:'Customer',address:'Customer billing address must not become the service property'}],hasMore:false})}};
  if(name.endsWith('/services/estimateService'))return{callEstimate:estimates,prepareEstimatePhoto:()=>{},previewEstimatePdf:async()=>{env.pdfPreviews++;if(env.previewFailure)throw Error('PDF preview failed.');},downloadEstimatePdf:()=>{}};
  throw Error('Unexpected dependency: '+name);
};
const page = relative => compile(relative,mock).default;
const render = async (relative,props={}) => {const Page=page(relative);await act(async()=>{tree=create(React.createElement(Page,props));});await act(settle);};
const text=()=>JSON.stringify(tree.toJSON());
const button=label=>tree.root.findAll(node=>node.type==='button'&&node.children.join('')===label)[0];
const control=id=>tree.root.findAll(node=>node.props.id===id)[0];
const inputFor=label=>tree.root.findAll(node=>node.type==='label'&&node.children[0]===label)[0].findAll(node=>node.type==='input')[0];
const click=async label=>{await act(async()=>button(label).props.onClick());await act(settle);};
const tab=async label=>{const target=tree.root.findAll(node=>node.props.role==='tab'&&node.children[0]===label)[0];assert.ok(target,label);await act(async()=>target.props.onClick());await act(settle);};
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;});

test('route changes disable unchanged saves, survive failure and clear only after confirmed success',async()=>{
  reset('route');await render('pages/RoutesPage.jsx');await click('Load jobs');
  assert.equal(button('Save stop order').props.disabled,true);assert.equal(env.dirty,false);
  await act(async()=>tree.root.findByProps({'aria-label':'Move First later'}).props.onClick());
  assert.equal(button('Save stop order').props.disabled,false);assert.equal(env.dirty,true);
  env.failSave=true;await click('Save stop order');assert.equal(env.toasts.at(-1).kind,'error');assert.equal(env.dirty,true);
  env.failSave=false;const handler=button('Save stop order').props.onClick;await act(async()=>{await Promise.all([handler(),handler()]);});await act(settle);
  assert.equal(env.calls.filter(row=>row.name==='rlSaveDailyRoute').length,2);assert.equal(env.toasts.at(-1).kind,'success');assert.equal(env.dirty,false);assert.equal(button('Save stop order').props.disabled,true);
});

test('changing technician can be cancelled without discarding an edited route',async()=>{
  reset('route');await render('pages/RoutesPage.jsx');await click('Load jobs');
  await act(async()=>tree.root.findByProps({'aria-label':'Move First later'}).props.onClick());env.confirm=false;
  const selector=tree.root.findAll(node=>node.type==='select')[0];await act(async()=>selector.props.onChange({target:{value:'tech-2'}}));
  assert.equal(selector.props.value,'tech-1');assert.equal(env.confirmCalls,1);assert.equal(env.dirty,true);
});

test('route departure time selection stays local until an explicit route operation',async()=>{
  reset('route');await render('pages/RoutesPage.jsx');await click('Load jobs');
  const departure=()=>inputFor('Depart');const previous=departure().props.value;
  const callsBefore=env.calls.length;
  await act(async()=>departure().props.onChange({target:{value:'08:15'}}));
  assert.equal(departure().props.value,'08:15');assert.equal(env.calls.length,callsBefore);
  await act(async()=>departure().props.onChange({target:{value:previous}}));
  assert.equal(departure().props.value,previous);assert.equal(env.calls.length,callsBefore);
});

test('checklist compares saved values and unordered selections so reverting removes its dirty warning',async()=>{
  reset('checklist');await render('components/ServiceChecklist.jsx',{job:{id:'job-1',status:'scheduled'}});
  assert.equal(button('Save service draft').props.disabled,true);
  await act(async()=>control('service-job-1-notes').props.onChange({target:{value:'Changed'}}));assert.equal(env.dirty,true);
  await act(async()=>control('service-job-1-notes').props.onChange({target:{value:'Saved note'}}));assert.equal(env.dirty,false);assert.equal(button('Save service draft').props.disabled,true);
  const checkA=()=>tree.root.findAll(node=>node.type==='label'&&node.children.at(-1)==='A')[0].findByType('input');
  await act(async()=>checkA().props.onChange({target:{checked:false}}));await act(async()=>checkA().props.onChange({target:{checked:true}}));
  assert.equal(env.dirty,false);assert.equal(button('Save service draft').props.disabled,true);
});

test('checklist failed saves retain the same operation for retry and show success after confirmation',async()=>{
  reset('checklist');await render('components/ServiceChecklist.jsx',{job:{id:'job-1',status:'scheduled'}});
  await act(async()=>control('service-job-1-notes').props.onChange({target:{value:'Changed'}}));env.failSave=true;await click('Save service draft');
  assert.equal(env.toasts.at(-1).kind,'error');assert.equal(env.dirty,true);const first=env.calls.find(row=>row.name==='save').data;
  env.failSave=false;await click('Retry saved attempt');const saves=env.calls.filter(row=>row.name==='save');assert.deepEqual(saves[1].data,first);
  assert.equal(env.toasts.at(-1).kind,'success');assert.equal(env.dirty,false);assert.equal(button('Save service draft').props.disabled,true);
});

test('checklist discard requires confirmation and retains answers when cancelled',async()=>{
  reset('checklist');await render('components/ServiceChecklist.jsx',{job:{id:'job-1',status:'scheduled'}});await act(async()=>control('service-job-1-notes').props.onChange({target:{value:'Changed'}}));
  env.confirm=false;await click('Discard unsaved service answers');assert.equal(control('service-job-1-notes').props.value,'Changed');assert.equal(env.dirty,true);
  env.confirm=true;await click('Discard unsaved service answers');assert.equal(control('service-job-1-notes').props.value,'Saved note');assert.equal(env.dirty,false);
});

test('service checklist background reads update clean answers but preserve dirty answers and their save version',async()=>{
  reset('checklist');await render('components/ServiceChecklist.jsx',{job:{id:'job-1',status:'scheduled'}});
  env.answers={...env.answers,notes:'Updated server observation'};env.version=2;
  await act(async()=>workspaceHooks.useInvalidateWorkspace()(['service-forms']));
  assert.equal(control('service-job-1-notes').props.value,'Updated server observation');
  await act(async()=>control('service-job-1-notes').props.onChange({target:{value:'Unsaved field observation'}}));
  env.answers={...env.answers,notes:'Another server observation'};env.version=3;
  await act(async()=>workspaceHooks.useInvalidateWorkspace()(['service-forms']));
  assert.equal(control('service-job-1-notes').props.value,'Unsaved field observation');assert.equal(env.dirty,true);
  await click('Save service draft');assert.equal(env.calls.find(row=>row.name==='save').data.expectedVersion,2);
});

test('template publishing requires changed content and cancellation can retain unpublished edits',async()=>{
  reset('template');let cancelled=0;await render('components/ServiceTemplateEditor.jsx',{starter:template,busy:false,onCancel:()=>cancelled++,onPublish:()=>{}});
  assert.equal(button('Publish new version').props.disabled,true);await act(async()=>inputFor('Template name').props.onChange({target:{value:'Changed template'}}));assert.equal(env.dirty,true);
  env.confirm=false;await click('Cancel template editing');assert.equal(cancelled,0);
  await act(async()=>inputFor('Template name').props.onChange({target:{value:template.name}}));assert.equal(env.dirty,false);assert.equal(button('Publish new version').props.disabled,true);
});

test('estimate revert removes dirty state and a successful save is distinguished from a later list failure',async()=>{
  reset('estimates');await render('pages/EstimatesPage.jsx');await click('Open estimate');assert.equal(button('Save estimate version').props.disabled,true);
  await act(async()=>inputFor('Estimate title').props.onChange({target:{value:'Changed title'}}));assert.equal(env.dirty,true);
  await act(async()=>inputFor('Estimate title').props.onChange({target:{value:'Inspection estimate'}}));assert.equal(env.dirty,false);
  await act(async()=>inputFor('Estimate title').props.onChange({target:{value:'Changed title'}}));env.failListAfterSave=true;await click('Save estimate version');
  assert.ok(env.toasts.some(row=>row.kind==='success'&&row.message==='Estimate saved.'));assert.match(env.toasts.at(-1).message,/Estimate saved, but/);assert.equal(env.dirty,false);assert.equal(button('Save estimate version').props.disabled,true);
});

test('estimate transport failures preserve the exact uncertain operation for safe retry',async()=>{
  reset('estimates');await render('pages/EstimatesPage.jsx');await click('Open estimate');await act(async()=>inputFor('Estimate title').props.onChange({target:{value:'Changed title'}}));env.failSave=true;await click('Save estimate version');
  const first=env.calls.find(row=>row.name==='save').data;assert.equal(env.dirty,true);assert.equal(env.toasts.at(-1).kind,'error');
  env.failSave=false;await click('Retry saved request');assert.deepEqual(env.calls.filter(row=>row.name==='save')[1].data,first);assert.equal(env.dirty,false);assert.equal(env.toasts.at(-1).kind,'success');assert.doesNotMatch(text(),/Estimate save failed/);
});

test('estimate background list refresh never replaces an open dirty estimate or its captured version',async()=>{
  reset('estimates');await render('pages/EstimatesPage.jsx');await click('Open estimate');
  await act(async()=>inputFor('Estimate title').props.onChange({target:{value:'Unsaved estimate draft'}}));
  env.estimate={...env.estimate,title:'Changed by another manager',version:2};
  await act(async()=>workspaceHooks.useInvalidateWorkspace()(['estimates','estimate']));
  assert.equal(inputFor('Estimate title').props.value,'Unsaved estimate draft');assert.equal(env.dirty,true);
  await click('Save estimate version');assert.equal(env.calls.find(row=>row.name==='save').data.expectedVersion,1);
});

test('estimate tabs keep unsaved input and restore the selected tab for the same estimate',async()=>{
  reset('estimates');await render('pages/EstimatesPage.jsx');await click('Open estimate');
  await act(async()=>inputFor('Estimate title').props.onChange({target:{value:'Unsaved tabbed estimate'}}));
  await tab('Scope & Pricing');assert.match(text(),/Scope of work/);assert.equal(env.dirty,true);
  await tab('Photos');assert.match(text(),/Work photos/);assert.doesNotMatch(text(),/Scope of work/);
  await tab('Details');assert.equal(inputFor('Estimate title').props.value,'Unsaved tabbed estimate');
  await click('Save estimate version');await tab('History');assert.match(text(),/Version history/);
  await click('Back to estimates');await click('Open estimate');assert.match(text(),/Version history/);
  await tab('Details');assert.equal(inputFor('Estimate title').props.value,'Unsaved tabbed estimate');
  assert.equal(env.calls.filter(row=>row.name==='save').length,1);
});

test('approved estimate asks for delivery choice before closing without sending automatically',async()=>{
  reset('estimates');env.estimate={...env.estimate,status:'approved-for-delivery',recipient:{name:'Test customer',email:'customer@example.invalid'}};
  await render('pages/EstimatesPage.jsx');await click('Open estimate');await click('Back to estimates');
  assert.match(text(),/How will you deliver this approved estimate/);assert.equal(button('Email approved version').props.disabled,false);
  await click('Keep estimate open');assert.equal(button('New photo estimate'),undefined);
  await click('Back to estimates');await click('Email approved version');assert.match(text(),/Email saved version 1 as a PDF attachment/);
  assert.equal(env.calls.some(row=>row.name==='deliver'),false);
  await click('Keep estimate open');await click('Back to estimates');await click('Leave for later');
  assert.ok(button('New photo estimate'));assert.equal(env.calls.some(row=>row.name==='deliver'),false);
});

test('approved estimate print option opens the saved PDF and never records email or postal delivery',async()=>{
  reset('estimates');env.estimate={...env.estimate,status:'approved-for-delivery',recipient:{name:'Test customer',email:'customer@example.invalid'}};
  await render('pages/EstimatesPage.jsx');await click('Open estimate');await click('Back to estimates');
  env.previewFailure=true;await click('Open PDF to print');assert.match(text(),/How will you deliver this approved estimate/);assert.equal(button('New photo estimate'),undefined);
  env.previewFailure=false;await click('Open PDF to print');assert.equal(env.pdfPreviews,2);assert.ok(button('New photo estimate'));
  assert.equal(env.calls.some(row=>row.name==='deliver'),false);
});

test('approved estimate with email already queued closes without a redundant delivery prompt',async()=>{
  reset('estimates');env.estimate={...env.estimate,status:'approved-for-delivery',recipient:{name:'Test customer',email:'customer@example.invalid'}};env.delivery={status:'queued',recipient:'customer@example.invalid'};
  await render('pages/EstimatesPage.jsx');await click('Open estimate');await click('Back to estimates');
  assert.ok(button('New photo estimate'));assert.doesNotMatch(text(),/How will you deliver this approved estimate/);
});

test('estimate property selection is explicit and saves only server-checkable property fields',async()=>{
  reset('estimates-geography');await render('pages/EstimatesPage.jsx');await click('Open estimate');
  const property=()=>tree.root.findByProps({'aria-label':'Service property address'});
  assert.equal(property().props.value,'');assert.equal(env.calls.some(row=>row.name==='rlServiceAreas'&&row.data.action==='check'),false);
  await act(async()=>property().props.onChange({target:{value:'100 Actual Service Street, Bakersfield, CA 93312'}}));
  await act(async()=>tree.root.findByProps({'aria-label':'Service property category'}).props.onChange({target:{value:'Pest Control'}}));
  await click('Check service property');assert.match(text(),/actual property is covered/);await click('Save estimate version');
  const request=env.calls.find(row=>row.name==='save').data.data;assert.deepEqual(request.serviceProperty,{address:'100 Actual Service Street, Bakersfield, CA 93312'});assert.equal(request.serviceCategory,'Pest Control');assert.equal(request.eligible,undefined);assert.equal(request.confirmed,undefined);assert.equal(env.dirty,false);assert.equal(button('Save estimate version').props.disabled,true);
});

test('approved estimate conversion fixes its recorded property but can select a missing category',async()=>{
  reset('estimates-geography');env.estimate={...env.estimate,status:'approved',serviceProperty:{address:'Approved property, Bakersfield, CA 93312',latitude:35,longitude:-119,validated:true}};await render('pages/EstimatesPage.jsx');await click('Open estimate');await tab('Review & Send');
  const property=tree.root.findByProps({'aria-label':'Service property address'}),category=tree.root.findByProps({'aria-label':'Service property category'});
  assert.equal(property.props.value,env.estimate.serviceProperty.address);assert.equal(property.props.disabled,true);assert.equal(category.props.disabled,false);assert.equal(button('Use this as the service property'),undefined);
  await act(async()=>category.props.onChange({target:{value:'Pest Control'}}));await click('Check service property');const checked=env.calls.find(row=>row.name==='rlServiceAreas'&&row.data.action==='check').data;assert.equal(checked.purpose,'scheduling');assert.equal(checked.propertyAddress,env.estimate.serviceProperty.address);assert.equal(checked.serviceCategory,'Pest Control');
  await act(async()=>inputFor('Service date').props.onChange({target:{value:'2030-01-02'}}));await click('Convert approved estimate to job');await click('Confirm job conversion');
  const request=env.calls.find(row=>row.name==='convert').data;assert.deepEqual(request.schedule.serviceProperty,{address:'Approved property, Bakersfield, CA 93312'});assert.equal(request.schedule.serviceCategory,'Pest Control');assert.equal(request.schedule.eligible,undefined);assert.match(text(),/controlled-converted-job/);
});

test('a late estimate property response cannot mark an edited property as eligible',async()=>{
  reset('estimates-geography');await render('pages/EstimatesPage.jsx');await click('Open estimate');const property=()=>tree.root.findByProps({'aria-label':'Service property address'});
  await act(async()=>property().props.onChange({target:{value:'First actual property'}}));let release;env.pendingPropertyCheck=new Promise(resolve=>{release=resolve;});await act(async()=>{button('Check service property').props.onClick();});
  await act(async()=>property().props.onChange({target:{value:'Second actual property'}}));await act(async()=>{release({eligible:true,status:'inside',message:'STALE first-property approval'});await env.pendingPropertyCheck;});assert.doesNotMatch(text(),/STALE first-property approval/);await click('Save estimate version');assert.equal(env.calls.find(row=>row.name==='save').data.data.serviceProperty.address,'Second actual property');
});
