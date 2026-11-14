const {test,afterEach}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const mobile=createRequire(path.resolve(__dirname,'../routeLogisticsMobile/package.json')),web=createRequire(path.resolve(__dirname,'../routeLogisticsWeb/package.json'));
const React=mobile('react'),{create,act}=mobile('react-test-renderer'),{transformSync}=web('esbuild');global.IS_REACT_ACT_ENVIRONMENT=true;
global.window={addEventListener(){},removeEventListener(){}};
let tree,writes=[],planWrites=[],toasts=[],checker,configured=true,dirty=false;
const customer={id:'customer',name:'Authorized customer',phone:'555-0100',address:'100 Billing Road',city:'Bakersfield',state:'CA',zipCode:'93312'};
const other={...customer,id:'other-customer'};
const toast=message=>toasts.push(message);toast.success=message=>toasts.push(message);toast.error=message=>toasts.push(message);
function PropertyMock(props){checker=props;React.useEffect(()=>{props.onPolicyLoaded?.({settings:{configured,revision:2}});},[props.onPolicyLoaded]);return React.createElement('section',{'aria-label':'Mock service property'},React.createElement('input',{'aria-label':'Mock explicit property',value:props.value.address,onChange:event=>props.onChange({...props.value,address:event.target.value,serviceCategory:'Pest Control',exceptionId:null,confirmed:false})}),React.createElement('button',{type:'button',onClick:()=>props.onChange({...props.value,address:props.billingAddress,serviceCategory:'Pest Control',exceptionId:null,confirmed:false})},'Copy billing by explicit action'),React.createElement('button',{type:'button',onClick:()=>props.onChange({...props.value,confirmed:true})},'Confirm current property only'));}
const cache=new Map();
function load(relative){const file=path.resolve(__dirname,'../routeLogisticsWeb/src',relative);if(cache.has(file))return cache.get(file);const module={exports:{}};const mock=name=>{
 if(name==='react')return React;if(name==='react-hot-toast')return{__esModule:true,default:toast};
 if(name.endsWith('/AuthContext'))return{useAuth:()=>({company:{id:'company',ownerId:'owner',serviceCategories:['Pest Control','Pool Cleaning']},currentUser:{uid:'owner'},role:'owner'})};
 if(name.endsWith('/ServicePropertyEligibility'))return{__esModule:true,default:PropertyMock};
 if(name.endsWith('/useUnsavedChanges'))return{useUnsavedChanges:value=>{dirty=value;return{confirmDiscard:async()=>true};}};
 if(name.endsWith('/ConfirmProvider'))return{useConfirm:()=>async()=>true};
 if(name.endsWith('/services/firebase'))return{auth:{currentUser:{uid:'owner',displayName:'Controlled owner'}}};
 if(name.endsWith('/jobManagementService'))return{__esModule:true,default:{createJob:async value=>{writes.push({action:'create',value});return{success:true,job:{id:'new-job',...value}};},updateJob:async(id,value)=>{writes.push({action:'update',id,value});return{success:true};}}};
 if(name.endsWith('/customerService'))return{__esModule:true,default:{getCustomers:async()=>({success:true,customers:[customer]})}};
 if(name.endsWith('/servicePlanService'))return{FREQUENCIES:[{days:90,label:'Quarterly'}],listServicePlans:async()=>({success:true,plans:[]}),createServicePlan:async value=>{planWrites.push(value);return{success:true};},updateServicePlan:async()=>({success:true}),deleteServicePlan:async()=>({success:true}),generateNextJob:async()=>({success:true})};
 if(name.endsWith('/serviceLogService'))return{listServiceLogs:async()=>({success:true,logs:[]}),logsToCsv:()=>''};
 if(name.endsWith('/tenancy'))return{canManage:()=>true};
 if(name.startsWith('.')){const resolved=path.resolve(path.dirname(file),name);return load(path.relative(path.resolve(__dirname,'../routeLogisticsWeb/src'),path.extname(resolved)?resolved:resolved+'.js'));}
 throw Error('Unexpected dependency '+name);
 };new Function('React','require','module','exports',transformSync(fs.readFileSync(file,'utf8'),{loader:file.endsWith('.jsx')?'jsx':'js',format:'cjs'}).code)(React,mock,module,module.exports);cache.set(file,module.exports);return module.exports;}
const Job=load('components/JobFormModal.jsx').default,Plans=load('pages/ServicePlansPage.jsx').default;
const job={id:'existing-job',customerId:customer.id,customerName:customer.name,serviceType:'Pest Control',date:'2030-01-02',time:'09:00',estimatedDuration:1,totalCost:0,address:'Historical routing address',priority:'medium',notes:'Original notes',updatedAt:'old-version',serviceProperty:{address:'Recorded service property',latitude:35,longitude:-119,validated:true},serviceCategory:'Pest Control',serviceAreaExceptionId:'historical-approval'};
const button=label=>tree.root.findAll(node=>node.type==='button'&&node.children.join('')===label)[0];
const submit=async()=>act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));
const renderJob=async(existing)=>act(async()=>{tree=create(React.createElement(Job,{job:existing,defaults:existing?undefined:{customerId:customer.id,serviceType:'Pest Control',date:'2030-01-02'},customers:[customer,other],onClose(){},onCreated(){}}));});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;writes=[];planWrites=[];toasts=[];checker=null;configured=true;dirty=false;});

test('new configured jobs never silently turn billing details into the service property',async()=>{
 await renderJob();assert.equal(checker.value.address,'');assert.equal(checker.billingAddress,'100 Billing Road, Bakersfield, CA 93312');
 await act(async()=>tree.root.findByProps({placeholder:'Gate code, pets, areas of concern…'}).props.onChange({target:{value:'A new job note'}}));await submit();assert.equal(writes.length,0);assert.match(toasts.at(-1),/service property address explicitly/);
});
test('an explicit property-copy action creates a scoped property payload without client eligibility flags',async()=>{
 await renderJob();await act(async()=>button('Copy billing by explicit action').props.onClick());await submit();assert.equal(writes.length,1);const data=writes[0].value;assert.deepEqual(data.serviceProperty,{address:'100 Billing Road, Bakersfield, CA 93312'});assert.equal(data.serviceCategory,'Pest Control');assert.equal(data.serviceAreaExceptionId,null);assert.equal(data.confirmed,undefined);assert.equal(data.eligible,undefined);assert.equal(data.address,data.serviceProperty.address);
});
test('normal edits retain historical geography and send no geography recertification fields',async()=>{
 await renderJob(job);await act(async()=>tree.root.findByProps({placeholder:'Gate code, pets, areas of concern…'}).props.onChange({target:{value:'A routine updated note'}}));await submit();assert.equal(writes.length,1);const data=writes[0].value;assert.equal(data.address,'Historical routing address');for(const key of ['serviceProperty','serviceCategory','serviceAreaExceptionId'])assert.equal(Object.hasOwn(data,key),false);assert.deepEqual(data.revisions.at(-1).changes.map(row=>row.field),['notes']);
});
test('an actual property/category/approval edit is sent and recorded in job revision history',async()=>{
 await renderJob(job);await act(async()=>checker.onChange({address:'Different actual service property',serviceCategory:'Pool Cleaning',exceptionId:'new-scoped-approval',confirmed:true}));await submit();const data=writes[0].value;assert.deepEqual(data.serviceProperty,{address:'Different actual service property'});assert.equal(data.address,'Different actual service property');assert.equal(data.serviceCategory,'Pool Cleaning');assert.equal(data.serviceAreaExceptionId,'new-scoped-approval');assert.ok(data.revisions.at(-1).changes.some(row=>row.field==='serviceProperty'));assert.equal(data.originalDetails.serviceProperty.address,'Recorded service property');
});
test('checking an unchanged property is not a job edit and cannot enable a duplicate save',async()=>{
 await renderJob(job);assert.equal(button('Save Changes').props.disabled,true);await act(async()=>button('Confirm current property only').props.onClick());assert.equal(button('Save Changes').props.disabled,true);assert.equal(dirty,false);assert.equal(writes.length,0);
});
test('changing the customer on a legacy job requires a deliberate property before configured scheduling',async()=>{
 const legacy={...job,serviceProperty:undefined,serviceCategory:undefined,serviceAreaExceptionId:undefined};await renderJob(legacy);await act(async()=>tree.root.findAllByType('select')[0].props.onChange({target:{value:other.id}}));await submit();assert.equal(writes.length,0);assert.match(toasts.at(-1),/service property address explicitly/);
});
test('service plans require an explicit configured property and preserve its approved category/scope',async()=>{
 await act(async()=>{tree=create(React.createElement(Plans));});await act(async()=>button('New plan').props.onClick());await act(async()=>tree.root.findByProps({'aria-label':'Service plan customer'}).props.onChange({target:{value:customer.id}}));assert.equal(checker.value.address,'');await submit();assert.equal(planWrites.length,0);assert.match(toasts.at(-1),/service property address explicitly/);
 await act(async()=>checker.onChange({address:'100 Actual Service Street, Bakersfield, CA 93312',serviceCategory:'Pool Cleaning',exceptionId:'plan-owner-approval',confirmed:true}));await submit();assert.equal(planWrites.length,1);assert.deepEqual(planWrites[0].serviceProperty,{address:'100 Actual Service Street, Bakersfield, CA 93312'});assert.equal(planWrites[0].serviceCategory,'Pool Cleaning');assert.equal(planWrites[0].serviceAreaExceptionId,'plan-owner-approval');assert.equal(planWrites[0].confirmed,undefined);
});
test('unconfigured legacy service plans keep their existing optional-property behavior',async()=>{
 configured=false;await act(async()=>{tree=create(React.createElement(Plans));});await act(async()=>button('New plan').props.onClick());await act(async()=>tree.root.findByProps({'aria-label':'Service plan customer'}).props.onChange({target:{value:customer.id}}));await submit();assert.equal(planWrites.length,1);assert.equal(planWrites[0].serviceProperty,undefined);
});
