const{test,beforeEach,afterEach}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
global.window=new EventTarget();global.document={visibilityState:'visible',querySelectorAll:()=>[]};global.IS_REACT_ACT_ENVIRONMENT=true;
const mobile=createRequire(path.resolve(__dirname,'../routeLogisticsMobile/package.json')),web=createRequire(path.resolve(__dirname,'../routeLogisticsWeb/package.json'));
const React=mobile('react'),{create,act}=mobile('react-test-renderer'),{QueryClient,QueryClientProvider,focusManager}=mobile('@tanstack/react-query'),{transformSync}=web('esbuild');
const {selectControlMock}=require('./support/workspaceQueryMock.cjs');
let env,tree,client,modules;
const text=node=>typeof node==='string'||typeof node==='number'?String(node):(node.children||[]).map(text).join('');
const button=label=>tree.root.findAll(node=>node.type==='button'&&text(node).trim()===label)[0];
const labelStat=name=>{const title=tree.root.findAll(node=>node.type==='dt'&&text(node).trim()===name)[0];return title?text(title.parent.findByType('dd')).trim():undefined;};
const settle=async()=>{for(let index=0;index<5;index++)await act(async()=>{await new Promise(done=>setTimeout(done,2));});};
const can=capability=>!env?.deniedCapabilities?.has(capability);
const jobService={
 getJobs:async()=>{env.calls.push('jobs');return env.jobsFailure?{success:false,error:env.jobsFailure}:{success:true,jobs:env.jobs,hasMore:false};},
 getJob:async id=>{env.calls.push(`job:${id}`);if(env.detailError)return{success:false,error:env.detailError.message,code:env.detailError.code};return{success:true,job:env.jobs.find(row=>row.id===id)};},
 updateJobStatus:async(id,status,patch)=>({success:true,job:{...env.jobs.find(row=>row.id===id),...patch,status}}),
};
function DraftChild({job}){const[value,setValue]=React.useState('');return React.createElement('input',{'aria-label':`Service draft ${job.id}`,value,onChange:event=>setValue(event.target.value)});}
function JobForm(props){const[value,setValue]=React.useState('');React.useEffect(()=>{env.formMounts++;return()=>{env.formUnmounts++;};},[]);env.formProps=props;return React.createElement('div',null,React.createElement('input',{'aria-label':'Job editor draft',value,onChange:event=>setValue(event.target.value)}),React.createElement('button',{onClick:props.onClose},'Cancel job editor'));}
function Schedule(props){React.useEffect(()=>{env.scheduleMounts++;return()=>{env.scheduleUnmounts++;};},[]);env.scheduleProps=props;return React.createElement('Schedule',props,props.children);}
function load(relative){
 const file=path.resolve(__dirname,'../routeLogisticsWeb/src',relative);if(modules.has(file))return modules.get(file).exports;
 const module={exports:{}};modules.set(file,module);
 const mock=name=>{
  if(name==='react')return React;if(name==='@tanstack/react-query')return mobile('@tanstack/react-query');
  if(name.endsWith('/services/workspaceApi'))return{readWorkspace:async resource=>{assert.equal(resource,'managementAttention');env.calls.push('management-attention');return env.managementAttention;},callWorkspace:async(name,data)=>{assert.equal(name,'rlJobVisit');assert.equal(data.action,'list');return{events:[]};}};
  if(name.endsWith('/contexts/AuthContext'))return{useAuth:()=>({currentUser:env.auth.currentUser,userProfile:{name:'Synthetic owner'},company:{id:env.claims.companyId},workspace:env.workspace,loading:false})};
  if(name.endsWith('/services/firebase'))return{auth:env.auth};
  if(name.endsWith('/services/tenancy'))return{getClaims:()=>env.claims,getWorkspace:()=>env.workspace,can,canManage:can};
  if(name.endsWith('/services/jobManagementService'))return{__esModule:true,default:jobService};
  if(name.endsWith('/services/customerService'))return{__esModule:true,default:{getCustomers:async()=>({success:true,customers:env.customers}),getCustomerStats:async()=>env.statsFailure?{success:false,error:env.statsFailure}:{success:true,stats:{totalCustomers:7}}}};
  if(name.endsWith('/services/estimateTemplateService'))return{__esModule:true,default:{getTemplateStats:async()=>env.statsFailure?{success:false,error:env.statsFailure}:{success:true,stats:{totalTemplates:3}}}};
  if(name.endsWith('/services/estimateService'))return{callEstimate:async()=>env.estimateAttention};
  if(name.endsWith('/components/JobFormModal'))return{__esModule:true,default:JobForm};
  if(name.endsWith('/components/ServiceChecklist'))return{__esModule:true,default:DraftChild};
  if(name.endsWith('/components/JobPhotos')||name.endsWith('/components/JobApplicationLog'))return{__esModule:true,default:()=>null};
  if(name.endsWith('/components/OperationalAlerts'))return{__esModule:true,default:()=>null};
  if(name.endsWith('/components/JobChangeHistory'))return{__esModule:true,default:()=>null,ModifiedBadge:()=>null};
  if(name.endsWith('/components/PropertyProfile'))return{__esModule:true,default:()=>null};
  if(name.endsWith('/components/ConfirmProvider'))return{useConfirm:()=>async()=>true};
  if(name.endsWith('/hooks/useUnsavedChanges'))return{useUnsavedChanges:()=>({confirmDiscard:async()=>true})};
  if(name.endsWith('/services/invoiceService'))return{createInvoiceFromJob:async()=>({success:true})};
  if(name.endsWith('/components/ThemedSelect'))return{__esModule:true,default:props=>React.createElement('select',{'aria-label':props.label,value:props.value,onChange:event=>props.onChange(event.target.value)},(props.options||[]).map(row=>React.createElement('option',{key:row.value,value:row.value},row.label)))};
  if(name.endsWith('/SelectControl'))return{__esModule:true,default:selectControlMock(React)};
  if(name==='react-router-dom')return{useNavigate:()=>()=>{},Link:({children,to,...props})=>React.createElement('a',{...props,href:to},children)};
  if(name==='framer-motion')return{motion:{div:'div'}};
  if(name==='react-hot-toast')return{__esModule:true,default:{error:value=>env.toasts.push(value),success:value=>env.toasts.push(value)}};
  if(name==='@heroicons/react/24/outline')return new Proxy({},{get:()=>()=>null});
  if(name==='@syncfusion/ej2-react-schedule')return{ScheduleComponent:Schedule,ViewsDirective:({children})=>React.createElement(React.Fragment,null,children),ViewDirective:()=>null,Inject:()=>null};
  if(name.endsWith('.css'))return{};
  if(name.startsWith('.')){const resolved=path.resolve(path.dirname(file),name),target=path.extname(resolved)?resolved:fs.existsSync(resolved+'.jsx')?resolved+'.jsx':resolved+'.js';return load(path.relative(path.resolve(__dirname,'../routeLogisticsWeb/src'),target));}
  throw Error(`Unexpected dependency: ${name}`);
 };
 const code=transformSync(fs.readFileSync(file,'utf8'),{format:'cjs',loader:file.endsWith('.jsx')?'jsx':'js'}).code;
 new Function('React','require','module','exports',code)(React,mock,module,module.exports);return module.exports;
}
async function render(page){env.Page=load(page).default;await act(async()=>{tree=create(React.createElement(QueryClientProvider,{client},React.createElement(env.Page)),{createNodeMock:()=>({focus(){},contains:()=>false,querySelectorAll:()=>[]})});});await settle();}
async function rerender(){await act(async()=>tree.update(React.createElement(QueryClientProvider,{client},React.createElement(env.Page))));await settle();}
async function refresh(resources=['jobs','job']){await act(async()=>{await client.refetchQueries({predicate:query=>resources.includes(query.meta?.resource)},{cancelRefetch:false});});await settle();}
async function click(label){const node=button(label);assert.ok(node,`Missing button ${label}`);await act(async()=>node.props.onClick());await settle();}
async function change(label,value){await act(async()=>tree.root.findByProps({'aria-label':label}).props.onChange({target:{value}}));}
beforeEach(()=>{
 const now=new Date(),day=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
 const auth={app:{options:{projectId:'demo-routelogistics'}},currentUser:{uid:'synthetic-owner',emailVerified:true}};
 env={auth,claims:{companyId:'synthetic-acme',role:'owner'},workspace:{status:'company'},calls:[],toasts:[],deniedCapabilities:new Set(),jobsFailure:null,detailError:null,statsFailure:null,estimateAttention:{estimates:[],quoteNeededVisits:[]},managementAttention:{attention:{counts:{missed:0,unassignedOrReassignment:0,rescheduleRequired:0,totalUnique:0},jobIds:{missed:[],unassignedOrReassignment:[],rescheduleRequired:[]}},jobs:[]},formProps:null,formMounts:0,formUnmounts:0,scheduleProps:null,scheduleMounts:0,scheduleUnmounts:0,
  jobs:[{id:'job-one',companyId:'synthetic-acme',customerId:'customer-one',customerName:'Synthetic customer',serviceType:'Inspection',date:day,time:'10:00',status:'scheduled',estimatedDuration:1,totalCost:100,updatedAt:'version-one',createdAt:day}],customers:[{id:'customer-one',name:'Synthetic customer'}]};
 modules=new Map();client=new QueryClient({defaultOptions:{queries:{gcTime:Infinity,retry:false,retryDelay:1}}});focusManager.setFocused(true);
});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;client.clear();});

test('a field completion refreshes web Jobs, summary and read-only details while retaining child draft state',async()=>{
 await render('pages/JobManagementPage.jsx');assert.equal(env.calls.filter(value=>value==='jobs').length,1);assert.equal(labelStat('Scheduled'),'1');
 await act(async()=>tree.root.findAll(node=>node.type==='button'&&node.props.title==='View Job')[0].props.onClick());await settle();await change('Service draft job-one','Unsubmitted checklist answer');
 env.jobs=[{...env.jobs[0],status:'completed',actualWorkDone:'Synthetic mobile completion',updatedAt:'version-two'}];await refresh();
 assert.equal(labelStat('Completed'),'1');assert.equal(labelStat('Scheduled'),'0');assert.equal(tree.root.findByProps({'aria-label':'Service draft job-one'}).props.value,'Unsubmitted checklist answer');assert.match(text(tree.root),/Synthetic mobile completion/);assert.equal(env.toasts.length,0);
});

test('background job refresh cannot reset a status draft or advance an open edit snapshot',async()=>{
 await render('pages/JobManagementPage.jsx');await act(async()=>tree.root.findAll(node=>node.type==='button'&&node.props.title==='Update Status')[0].props.onClick());await settle();
 const dialog=()=>tree.root.findByProps({'aria-label':'Update Job Status'});await act(async()=>dialog().findByType('select').props.onChange({target:{value:'completed'}}));
 env.jobs=[{...env.jobs[0],status:'in-progress',updatedAt:'version-two'}];await refresh();assert.equal(dialog().findByType('select').props.value,'completed');assert.equal(button('Update Status').props.disabled,false);
 await click('Cancel');await act(async()=>tree.root.findAll(node=>node.type==='button'&&node.props.title==='Edit Job')[0].props.onClick());await settle();await change('Job editor draft','Retain this edited text');assert.equal(env.formProps.job.updatedAt,'version-two');
 env.jobs=[{...env.jobs[0],status:'scheduled',updatedAt:'version-three'}];await refresh();assert.equal(env.formProps.job.updatedAt,'version-two');assert.equal(tree.root.findByProps({'aria-label':'Job editor draft'}).props.value,'Retain this edited text');assert.equal(env.formMounts,1);assert.equal(env.formUnmounts,0);
});

test('Calendar updates events without unmounting its view or an open scheduling draft',async()=>{
 await render('pages/CalendarPage.jsx');const scheduler=tree.root.findByType('Schedule');await click('New Job');await change('Job editor draft','Keep calendar scheduling draft');
 env.jobs=[{...env.jobs[0],status:'completed'}];await refresh();assert.equal(tree.root.findByType('Schedule'),scheduler);assert.equal(env.scheduleProps.eventSettings.dataSource[0].JobData.status,'completed');assert.equal(env.scheduleProps.eventSettings.dataSource[0].CategoryColor,'#10B981');assert.equal(env.scheduleMounts,1);assert.equal(env.formUnmounts,0);assert.equal(tree.root.findByProps({'aria-label':'Job editor draft'}).props.value,'Keep calendar scheduling draft');
});

test('scope changes hide old calendar events and new-job drafts synchronously',async()=>{
 await render('pages/CalendarPage.jsx');await click('New Job');await change('Job editor draft','Old tenant draft');
 env.claims={...env.claims,companyId:'synthetic-other'};env.jobs=[];env.customers=[];await rerender();assert.equal(tree.root.findAllByProps({'aria-label':'Job editor draft'}).length,0);assert.equal(env.scheduleProps.eventSettings.dataSource.length,0);assert.doesNotMatch(text(tree.root),/Old tenant draft|Synthetic customer/);
});

test('dashboard keeps unknown reads distinct from zero and follows the same refreshed jobs cache',async()=>{
 env.statsFailure='Synthetic statistics unavailable';env.jobsFailure='Synthetic jobs unavailable';await render('pages/HomePage.jsx');assert.equal(labelStat('Total Customers'),'—');assert.equal(labelStat('Active Jobs'),'—');assert.equal(labelStat('Estimate Templates'),'—');assert.match(text(tree.root),/Synthetic statistics unavailable/);
 env.statsFailure=null;env.jobsFailure=null;await refresh(['jobs','customer-stats','template-stats']);assert.equal(labelStat('Total Customers'),'7');assert.equal(labelStat('Active Jobs'),'1');assert.equal(labelStat('Estimate Templates'),'3');
 env.jobs=[{...env.jobs[0],status:'completed'}];await refresh(['jobs']);assert.equal(labelStat('Active Jobs'),'0');assert.equal(labelStat('Monthly Revenue'),'$100');
});

test('dashboard derives one idempotent management alert from quote-needed visits and review drafts',async()=>{
 env.estimateAttention={quoteNeededVisits:[{id:'visit-one'}],estimates:[{id:'estimate-one',status:'submitted-for-review'},{id:'estimate-two',status:'draft'}]};
 await render('pages/HomePage.jsx');const page=text(tree.root);
 assert.match(page,/Estimates need management attention/);assert.match(page,/1 completed visits need quotes · 1 drafts await review/);
 assert.equal(tree.root.findAll(node=>node.type==='a'&&node.props.href==='/estimates'&&text(node).includes('Estimates need management attention')).length,1);
});

test('dashboard shows authoritative management counts with direct filtered links only to authorized roles',async()=>{
 env.managementAttention={attention:{counts:{missed:2,unassignedOrReassignment:3,rescheduleRequired:1,totalUnique:4},jobIds:{missed:['missed-one','overlap'],unassignedOrReassignment:['unassigned-one','overlap','reassign-one'],rescheduleRequired:['overlap']}},jobs:[]};
 await render('pages/HomePage.jsx');const page=text(tree.root);assert.match(page,/Missed visits/);assert.match(page,/Assignment attention/);assert.match(page,/Rescheduling required/);
 for(const href of ['/jobs?attention=missed','/jobs?attention=assignment','/jobs?attention=reschedule'])assert.equal(tree.root.findAll(node=>node.type==='a'&&node.props.href===href).length,1);
 assert.equal(env.calls.filter(value=>value==='management-attention').length,1);
 await act(async()=>tree.unmount());tree=null;client.clear();env.deniedCapabilities.add('dispatch.manage');env.calls=[];modules=new Map();client=new QueryClient({defaultOptions:{queries:{gcTime:Infinity,retry:false,retryDelay:1}}});
 await render('pages/HomePage.jsx');assert.doesNotMatch(text(tree.root),/Missed visits|Assignment attention|Rescheduling required/);assert.equal(env.calls.includes('management-attention'),false);
});

test('Jobs attention links render only authoritative tenant-scoped results',async()=>{
 const originalLocation=global.window.location;global.window.location={pathname:'/jobs',search:'?attention=missed',hash:''};
 env.managementAttention={attention:{counts:{missed:1,unassignedOrReassignment:0,rescheduleRequired:0,totalUnique:1},jobIds:{missed:['missed-job'],unassignedOrReassignment:[],rescheduleRequired:[]}},jobs:[{...env.jobs[0],id:'missed-job',customerName:'Missed synthetic customer'}]};
 try{await render('pages/JobManagementPage.jsx');assert.match(text(tree.root),/Management attention: missed visits/);assert.match(text(tree.root),/Missed synthetic customer/);assert.doesNotMatch(text(tree.root),/Synthetic customerSynthetic customer/);assert.equal(env.calls.filter(value=>value==='management-attention').length,1);}
 finally{global.window.location=originalLocation;}
});

test('Jobs surfaces missed work prominently without requiring a preselected attention filter',async()=>{
 env.managementAttention={attention:{counts:{missed:1,unassignedOrReassignment:0,rescheduleRequired:0,totalUnique:1},jobIds:{missed:['missed-job'],unassignedOrReassignment:[],rescheduleRequired:[]}},jobs:[{...env.jobs[0],id:'missed-job',customerName:'Drew Brees'}]};
 await render('pages/JobManagementPage.jsx');const page=text(tree.root);assert.match(page,/1 missed visit requires management review/);assert.match(page,/Review missed visits/);assert.equal(env.calls.filter(value=>value==='management-attention').length,1);
});

test('detail permission loss does not fall back to a previously selected private job snapshot',async()=>{
 await render('pages/JobManagementPage.jsx');await act(async()=>tree.root.findAll(node=>node.type==='button'&&node.props.title==='View Job')[0].props.onClick());await settle();assert.ok(tree.root.findAllByProps({'aria-label':'Job Details'}).length);
 env.detailError={message:'This job is not assigned to your workspace.',code:'permission-denied'};await refresh(['job']);assert.equal(tree.root.findAllByProps({'aria-label':'Job Details'}).length,0);assert.ok(button('Close unavailable job'));assert.match(text(tree.root),/not assigned to your workspace/);
});

test('scheduled Job Details opens the checked editor for date, time or technician rescheduling',async()=>{
 env.jobs=[{...env.jobs[0],assignedTo:'member-david',assignedToName:'David Lopez'}];
 await render('pages/JobManagementPage.jsx');await act(async()=>tree.root.findAll(node=>node.type==='button'&&node.props.title==='View Job')[0].props.onClick());await settle();
 assert.ok(button('Reschedule appointment'));await click('Reschedule appointment');
 assert.equal(tree.root.findAllByProps({'aria-label':'Job Details'}).length,0);assert.ok(tree.root.findByProps({'aria-label':'Job editor draft'}));
 assert.equal(env.formProps.job.id,'job-one');assert.equal(env.formProps.job.assignedTo,'member-david');assert.equal(env.formProps.job.date,env.jobs[0].date);assert.equal(env.formProps.job.time,'10:00');
});
