const { test, before, afterEach } = require('node:test');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const { pathToFileURL } = require('node:url');
const mobile = createRequire(path.resolve(__dirname,'../routeLogisticsMobile/package.json')), web = createRequire(path.resolve(__dirname,'../routeLogisticsWeb/package.json'));
const React = mobile('react'), { create, act } = mobile('react-test-renderer'), { transformSync } = web('esbuild');
global.IS_REACT_ACT_ENVIRONMENT = true;
let tree, env;
let calendarDate;
before(async () => {
  calendarDate = await import(pathToFileURL(path.resolve(__dirname, '../routeLogisticsWeb/src/utils/calendarDate.js')).href);
});
const settle = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return {promise,resolve}; };
const hasDirty = scope => [...env.dirty.values()].some(entry=>entry.dirty&&(scope===undefined||entry.scope===scope));
const confirmDiscard = async scope => { if (!hasDirty(scope)) return true; env.confirmCalls++; return env.allowDiscard; };
function useGuard(dirty,{scope}={}) { const key = React.useRef(Symbol()); React.useEffect(() => { const id=key.current; env.dirty.set(id,{dirty,scope}); return () => env.dirty.delete(id); },[dirty,scope]); return {confirmDiscard:scope===undefined?confirmDiscard:()=>confirmDiscard(scope)}; }
function ChildDraft({job,initialMemberId,initialDate}) { const name=job?'Service draft '+job.id:'Route draft '+initialMemberId+':'+initialDate; const [value,setValue]=React.useState('');useGuard(!!value,{scope:job?`job:${job.id}`:'route-planner'});return React.createElement('input',{'aria-label':name,value,onChange:event=>setValue(event.target.value)}); }
function reset(kind) {
  env={kind,dirty:new Map(),allowDiscard:true,confirmCalls:0,calls:[],toasts:[],failSave:false,throwSave:false,saved:false,failListAfterSave:false,savePending:null,foreignDialog:false,jobs:[{id:'job-1',customerName:'First customer',serviceType:'Pest service',status:'scheduled',date:'2026-11-14',createdAt:'2026-11-14T09:00:00Z',time:'09:00',address:'First address',companyId:'company-1'},{id:'job-2',customerName:'Second customer',serviceType:'Inspection',status:'scheduled',date:'2026-11-14',createdAt:'2026-11-14T09:00:00Z',time:'10:00',address:'Second address',companyId:'company-1'}]};
  global.window=new EventTarget(); global.document={body:{style:{overflow:'auto'}},activeElement:null,visibilityState:'visible',querySelectorAll:()=>env.foreignDialog?[{}]:[]};
}
const service = {
  getJobs:async()=>({success:true,jobs:env.jobs}),getJobStats:async()=>({success:true,stats:{}}),
  updateJobStatus:async(id,status,data)=>{env.calls.push({name:'status',id,status,data});if(env.savePending)await env.savePending.promise;if(env.throwSave)throw Error('Status request failed.');if(env.failSave)return{success:false,error:'Status could not be saved.'};return{success:true,job:{...env.jobs.find(job=>job.id===id),...data}};},
};
const mock = name => {
  if(name==='react')return React;
  if(name==='react-hot-toast')return{__esModule:true,default:{success:message=>env.toasts.push({kind:'success',message}),error:message=>env.toasts.push({kind:'error',message})}};
  if(name.endsWith('/hooks/useUnsavedChanges'))return{useUnsavedChanges:useGuard,useConfirmUnsavedChanges:()=>confirmDiscard};
  if(name.endsWith('/contexts/AuthContext'))return{useAuth:()=>({currentUser:{uid:'owner-1',displayName:'Owner'},company:{id:'company-1',name:'Company'},role:'owner',can:()=>true})};
  if(name.endsWith('/services/tenancy'))return{canManage:()=>true,can:()=>true};
  if(name.endsWith('/services/jobManagementService'))return{__esModule:true,default:service};
  if(name.endsWith('/services/customerService'))return{__esModule:true,default:{getCustomers:async()=>({success:true,customers:[]})}};
  if(name.endsWith('/services/invoiceService'))return{createInvoiceFromJob:async()=>({success:true,id:'invoice-1'})};
  if(name.endsWith('/components/ConfirmProvider'))return{useConfirm:()=>async()=>true};
  if(name==='react-router-dom')return{useNavigate:()=>()=>{}};
  if(name==='framer-motion')return{motion:{div:({children,...props})=>React.createElement('div',props,children)}};
  if(name==='@heroicons/react/24/outline')return new Proxy({}, {get:()=>()=>null});
  if(name.endsWith('/components/ServiceChecklist')||name==='./RoutesPage')return{__esModule:true,default:ChildDraft};
  if(name.endsWith('/components/JobChangeHistory'))return{__esModule:true,default:()=>null,ModifiedBadge:()=>null};
  if(name.endsWith('/components/JobPhotos')||name.endsWith('/components/JobApplicationLog')||name.endsWith('/components/JobFormModal')||name.endsWith('/components/TeamLocationStatus'))return{__esModule:true,default:()=>null};
  if(name.endsWith('/services/serviceLogService'))return{UNITS:['fl oz','oz'],listServiceLogsForJob:async()=>env.saved&&env.failListAfterSave?{success:false,error:'List unavailable'}:{success:true,logs:[]},addServiceLog:async data=>{env.calls.push({name:'application',data});if(env.savePending)await env.savePending.promise;if(env.throwSave)throw Error('Application request failed.');if(env.failSave)return{success:false,error:'Application could not be saved.'};env.saved=true;return{success:true,id:'application-1'};}};
  if(name.endsWith('/services/workspaceApi'))return{readWorkspace:async()=>({jobs:env.jobs,hasMore:false}),callWorkspace:async(name,data)=>{env.calls.push({name,data});if(name==='rlGetRoutingTeam')return{team:[{id:'tech-1',name:'First tech'},{id:'tech-2',name:'Second tech'}]};if(name==='rlGetTeamLocations')return{locations:[],roster:[],policy:{intervalMinutes:3,freshAfterSeconds:300}};if(name==='rlJobVisit')return{events:[]};if(name==='rlManageJob')return{};throw Error('Unexpected workspace operation');}};
  if(name.endsWith('/services/maps'))return{loadMaps:async()=>{throw Error('Maps should not be requested in these tests');}};
  if(name.endsWith('/utils/dispatch'))return{STATUS_COLORS:{scheduled:'blue',completed:'green'},scheduleWarning:()=>'',jobPosition:job=>job.location||null,jobAddress:job=>job.address||''};
  if(name.endsWith('/utils/calendarDate'))return calendarDate;
  if(name.endsWith('/utils/routePlanning'))return{googleNavigation:()=> 'https://example.invalid'};
  if(name.endsWith('/utils/workLocations'))return{LOCATION_LABELS:{},locationState:()=>'',nearestOnDuty:()=>[]};
  if(name.endsWith('/utils/dispatchMap'))return{addressKey:value=>String(value),mapPoint:()=>null,createDispatchAddressResolver:()=>({snapshot:()=>({pending:0,failed:0})})};
  throw Error('Unexpected dependency '+name);
};
function compile(relative) { const result={exports:{}};new Function('React','require','module','exports',transformSync(fs.readFileSync(path.resolve(__dirname,'../routeLogisticsWeb/src',relative),'utf8'),{loader:'jsx',format:'cjs'}).code)(React,mock,result,result.exports);return result.exports.default; }
async function render(relative,props={}) { const Page=compile(relative);await act(async()=>{tree=create(React.createElement(Page,props),{createNodeMock:()=>({focus(){},contains:()=>false,querySelectorAll:()=>[],isConnected:true})});});await act(settle); }
const button=label=>tree.root.findAll(node=>node.type==='button'&&node.children.join('')===label)[0];
const click=async label=>{await act(async()=>button(label).props.onClick());await act(settle);};
const input=label=>tree.root.findByProps({'aria-label':label});
const change=async(label,value)=>{await act(async()=>input(label).props.onChange({target:{value}}));};
const dialog=label=>tree.root.findAll(node=>node.props.role==='dialog'&&(!label||node.props['aria-label']===label))[0];
const escape=async()=>{const event=new Event('keydown',{cancelable:true});event.key='Escape';await act(async()=>window.dispatchEvent(event));await act(settle);};
const view=async()=>{await act(async()=>tree.root.findAll(node=>node.type==='button'&&node.props.title==='View Job')[0].props.onClick());await act(settle);};
const openStatus=async()=>{await act(async()=>tree.root.findAll(node=>node.type==='button'&&node.props.title==='Update Status')[0].props.onClick());await act(settle);};
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;delete global.window;delete global.document;});

test('application record tracks actual changes, guards Cancel and disables unchanged Save',async()=>{
  reset('application');await render('components/JobApplicationLog.jsx',{job:env.jobs[0]});await click('Record application');assert.equal(button('Save record').props.disabled,true);
  const product=()=>tree.root.findAll(node=>node.type==='label'&&node.children[0]==='Product *')[0].findByType('input');
  await act(async()=>product().props.onChange({target:{value:'Product'}}));assert.equal(button('Save record').props.disabled,false);
  env.allowDiscard=false;await click('Cancel');assert.ok(button('Save record'));assert.equal(product().props.value,'Product');
  await act(async()=>product().props.onChange({target:{value:''}}));assert.equal(button('Save record').props.disabled,true);env.allowDiscard=true;await click('Cancel');assert.ok(button('Record application'));
});

async function applicationValues() {for(const [label,value]of[['Product *','Bait'],['Amount used *','1'],['Target pest *','Ants']])await act(async()=>tree.root.findAll(node=>node.type==='label'&&node.children[0]===label)[0].findByType('input').props.onChange({target:{value}}));}
test('application failure retains edits and concurrent Save taps submit once',async()=>{
  reset('application');await render('components/JobApplicationLog.jsx',{job:env.jobs[0]});await click('Record application');await applicationValues();env.failSave=true;
  await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));assert.equal(env.toasts.at(-1).kind,'error');assert.ok(button('Save record'));assert.ok(hasDirty());
  env.failSave=false;env.savePending=deferred();const submit=tree.root.findByType('form').props.onSubmit;let pending;await act(async()=>{pending=submit({preventDefault(){}});submit({preventDefault(){}});});assert.equal(env.calls.filter(row=>row.name==='application').length,2);
  await act(async()=>{env.savePending.resolve();await pending;});assert.ok(button('Record application'));assert.equal(env.toasts.at(-1).kind,'success');assert.equal(hasDirty(),false);
});

test('application thrown errors remain retryable and list-refresh failure does not misreport a successful save',async()=>{
  reset('application');await render('components/JobApplicationLog.jsx',{job:env.jobs[0]});await click('Record application');await applicationValues();env.throwSave=true;
  await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));assert.match(env.toasts.at(-1).message,/Application request failed/);assert.ok(button('Save record'));
  env.throwSave=false;env.failListAfterSave=true;await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));assert.equal(env.toasts.at(-1).kind,'success');assert.match(JSON.stringify(tree.toJSON()),/Application recorded, but the list could not refresh/);
});

test('job details Close and status transition retain dirty child answers when cancelled',async()=>{
  reset('jobs');await render('pages/JobManagementPage.jsx');await view();await change('Service draft job-1','Unsaved answers');env.allowDiscard=false;
  await click('Close');assert.ok(dialog('Job Details'));assert.equal(input('Service draft job-1').props.value,'Unsaved answers');await click('Update Status');assert.ok(dialog('Job Details'));assert.equal(dialog('Update Job Status'),undefined);
  env.allowDiscard=true;await click('Update Status');assert.ok(dialog('Update Job Status'));assert.equal(button('Update Status').props.disabled,true);
});

test('status draft disables unchanged Update and warns on Cancel or Escape until reverted',async()=>{
  reset('jobs');await render('pages/JobManagementPage.jsx');await openStatus();assert.equal(button('Update Status').props.disabled,true);
  const status=()=>dialog('Update Job Status').findByType('select');await act(async()=>status().props.onChange({target:{value:'completed'}}));assert.equal(button('Update Status').props.disabled,false);
  env.allowDiscard=false;await click('Cancel');assert.ok(dialog('Update Job Status'));await escape();assert.ok(dialog('Update Job Status'));
  await act(async()=>status().props.onChange({target:{value:'scheduled'}}));assert.equal(button('Update Status').props.disabled,true);await click('Cancel');assert.equal(dialog('Update Job Status'),undefined);
});

test('status save failure preserves draft, and double Update submits only once',async()=>{
  reset('jobs');await render('pages/JobManagementPage.jsx');await openStatus();await act(async()=>dialog('Update Job Status').findByType('select').props.onChange({target:{value:'completed'}}));env.failSave=true;await click('Update Status');assert.ok(dialog('Update Job Status'));assert.equal(env.toasts.at(-1).kind,'error');
  env.failSave=false;env.savePending=deferred();const handler=button('Update Status').props.onClick;let pending;await act(async()=>{pending=handler();handler();});assert.equal(env.calls.filter(row=>row.name==='status').length,2);
  await act(async()=>{env.savePending.resolve();await pending;});assert.equal(dialog('Update Job Status'),undefined);assert.equal(env.toasts.at(-1).kind,'success');assert.equal(hasDirty(),false);
});

test('dispatch drawer Close, backdrop and Escape cannot silently remove dirty service answers',async()=>{
  reset('dispatch');await render('pages/DispatchPage.jsx');await act(async()=>button('First customer · Pest service').props.onClick({currentTarget:{focus(){},isConnected:true}}));await act(settle);await change('Service draft job-1','Unsaved answers');env.allowDiscard=false;
  await click('Close details');assert.ok(input('Service draft job-1'));assert.equal(document.body.style.overflow,'hidden');await escape();assert.ok(input('Service draft job-1'));
  const backdrop=tree.root.findByProps({'data-testid':'job-details-backdrop'});const target={};await act(async()=>backdrop.props.onMouseDown({target,currentTarget:target}));await act(settle);assert.ok(input('Service draft job-1'));
  const prior=env.confirmCalls;env.foreignDialog=true;await escape();assert.equal(env.confirmCalls,prior);env.foreignDialog=false;env.allowDiscard=true;await click('Close details');assert.equal(tree.root.findAll(node=>node.props['aria-label']==='Service draft job-1').length,0);assert.equal(document.body.style.overflow,'auto');
});

test('dispatch route remains mounted during read-only job viewing and dirty route resets are guarded',async()=>{
  reset('dispatch');await render('pages/DispatchPage.jsx');await act(async()=>tree.root.findAll(node=>node.type==='button'&&node.children.join('')==='Open daily route')[0].props.onClick());await act(settle);
  const route=tree.root.findAll(node=>node.type==='input'&&String(node.props['aria-label']).startsWith('Route draft'))[0];await act(async()=>route.props.onChange({target:{value:'Edited route'}}));const name=route.props['aria-label'];env.allowDiscard=false;
  await act(async()=>button('First customer · Pest service').props.onClick({currentTarget:{focus(){},isConnected:true}}));await act(settle);assert.equal(env.confirmCalls,0);assert.equal(input(name).props.value,'Edited route');
  await click('Close details');assert.equal(env.confirmCalls,0);assert.equal(input(name).props.value,'Edited route');
  await click('Close route planner');assert.equal(input(name).props.value,'Edited route');const date=tree.root.findAll(node=>node.type==='input'&&node.props.type==='date')[0];await act(async()=>date.props.onChange({target:{value:'2026-11-15'}}));assert.notEqual(date.props.value,'2026-11-15');assert.equal(input(name).props.value,'Edited route');
});
