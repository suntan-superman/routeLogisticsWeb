const {test,afterEach}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const mobile=createRequire(path.resolve(__dirname,'../routeLogisticsMobile/package.json')),web=createRequire(path.resolve(__dirname,'../routeLogisticsWeb/package.json'));
const React=mobile('react'),{create,act}=mobile('react-test-renderer'),{transformSync}=web('esbuild');global.IS_REACT_ACT_ENVIRONMENT=true;
global.window={addEventListener(){},removeEventListener(){}};
let tree,jobProps,writes=[],planWrites=[],toasts=[],checker,configured=true,dirty=false,allowCustomerManage=true,writeFailure=null;
const defaultCompany={id:'company',ownerId:'owner',serviceCategories:['Pest Control','Pool Cleaning']};
let company=defaultCompany;
const customer={id:'customer',name:'Authorized customer',phone:'555-0100',address:'100 Saved Customer Road',city:'Bakersfield',state:'CA',zipCode:'93312',latitude:35.36,longitude:-119.01,updatedAt:'2026-11-15T15:00:00.000Z'};
const other={...customer,id:'other-customer',name:'Other authorized customer',address:'200 Other Customer Road',zipCode:'93311'};
const missing={id:'missing-address',name:'Customer without a saved address',phone:'555-0101'};
const savedAddress='100 Saved Customer Road, Bakersfield, CA 93312';
const otherAddress='200 Other Customer Road, Bakersfield, CA 93311';
const toast=message=>toasts.push(message);toast.success=message=>toasts.push(message);toast.error=message=>toasts.push(message);
function PropertyMock(props){checker=props;const addressLocked=props.addressReadOnly||props.fixedProperty;React.useEffect(()=>{props.onPolicyLoaded?.({settings:{configured,revision:2}});},[props.onPolicyLoaded]);return React.createElement('section',{'aria-label':'Mock service property'},React.createElement('input',{'aria-label':'Mock explicit property',value:props.value.address,readOnly:!!props.addressReadOnly,disabled:!!props.fixedProperty,onChange:event=>{if(!addressLocked)props.onChange({...props.value,address:event.target.value,serviceCategory:'Pest Control',exceptionId:null,confirmed:false});}}),React.createElement('button',{type:'button',disabled:!!addressLocked,onClick:()=>{if(!addressLocked)props.onChange({...props.value,address:props.billingAddress,serviceCategory:'Pest Control',exceptionId:null,confirmed:false});}},'Copy billing by explicit action'),React.createElement('button',{type:'button',onClick:()=>props.onChange({...props.value,confirmed:true})},'Confirm current property only'));}
const cache=new Map();
function load(relative){const file=path.resolve(__dirname,'../routeLogisticsWeb/src',relative);if(cache.has(file))return cache.get(file);const module={exports:{}};const mock=name=>{
 if(name==='react')return React;if(name==='react-hot-toast')return{__esModule:true,default:toast};
 if(name.endsWith('/AuthContext'))return{useAuth:()=>({company,currentUser:{uid:'owner'},role:'owner',can:capability=>capability!=='customers.manage'||allowCustomerManage})};
 if(name.endsWith('/ServicePropertyEligibility'))return{__esModule:true,default:PropertyMock};
 if(name.endsWith('/useUnsavedChanges'))return{useUnsavedChanges:value=>{dirty=value;return{confirmDiscard:async()=>true};}};
 if(name.endsWith('/ConfirmProvider'))return{useConfirm:()=>async()=>true};
 if(name.endsWith('/services/firebase'))return{auth:{currentUser:{uid:'owner',displayName:'Controlled owner'}}};
 if(name.endsWith('/jobManagementService'))return{__esModule:true,default:{createJob:async(value,options)=>{writes.push({action:'create',value,options});return writeFailure?{success:false,error:writeFailure}:{success:true,job:{id:'new-job',...value},...(options?.saveCustomerAddress?{customerAddressUpdated:true}:{})};},updateJob:async(id,value,expectedVersion,options)=>{writes.push({action:'update',id,value,expectedVersion,options});return writeFailure?{success:false,error:writeFailure}:{success:true,...(options?.saveCustomerAddress?{customerAddressUpdated:true}:{})};}}};
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
const renderJob=async(existing,overrides={})=>act(async()=>{jobProps={job:existing,defaults:existing?undefined:{customerId:customer.id,serviceType:'Pest Control',date:'2030-01-02'},customers:[customer,other,missing],onClose(){},onCreated(){},...overrides};tree=create(React.createElement(Job,jobProps));});
const refreshCustomers=async customers=>act(async()=>{jobProps={...jobProps,customers};tree.update(React.createElement(Job,jobProps));});
const selectCustomer=async id=>act(async()=>tree.root.findAllByType('select')[0].props.onChange({target:{value:id}}));
const changeNotes=async value=>act(async()=>tree.root.findByProps({placeholder:'Gate code, pets, areas of concern…'}).props.onChange({target:{value}}));
const propertyInput=()=>tree.root.findByProps({'aria-label':'Mock explicit property'});
const enableAddressEditing=async()=>{assert.ok(button('Enable Editing'),'An explicit Enable Editing action must exist');await act(async()=>button('Enable Editing').props.onClick());};
const changeProperty=async value=>{if(checker.addressReadOnly)await enableAddressEditing();await act(async()=>propertyInput().props.onChange({target:{value}}));};
const permanentCheckbox=()=>tree.root.findAll(node=>node.type==='input'&&node.props['aria-label']==="Update customer's saved address")[0];
const choosePermanent=async value=>{assert.ok(permanentCheckbox(),'Permanent-address choice must be visible');await act(async()=>permanentCheckbox().props.onChange({target:{checked:value}}));};
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;jobProps=null;writes=[];planWrites=[];toasts=[];checker=null;configured=true;dirty=false;allowCustomerManage=true;company=defaultCompany;writeFailure=null;});

test('new jobs visibly reuse the selected customer saved address without retyping it',async()=>{
 await renderJob(undefined,{defaults:{serviceType:'Pest Control',date:'2030-01-02'}});
 assert.equal(checker.value.address,'');await selectCustomer(customer.id);
 assert.equal(checker.value.address,savedAddress);assert.equal(propertyInput().props.value,savedAddress);
 assert.equal(checker.value.confirmed,false);assert.equal(checker.value.exceptionId,null);
});
test('initial customer defaults populate the saved address and submit only the explicit property text',async()=>{
 await renderJob();assert.equal(checker.value.address,savedAddress);assert.equal(propertyInput().props.value,savedAddress);
 await changeNotes('A scheduled visit at the displayed property');await submit();assert.equal(writes.length,1);
 const data=writes[0].value;assert.deepEqual(data.serviceProperty,{address:savedAddress});assert.equal(data.serviceAreaExceptionId,null);assert.equal(data.address,savedAddress);
 for(const key of ['confirmed','eligible','latitude','longitude','location','serviceAreaEligibility','serviceAreaManaged'])assert.equal(Object.hasOwn(data,key),false,`Client must not supply ${key}`);
});
test('a customer list arriving after the job form opens fills its untouched initial property',async()=>{
 await renderJob(undefined,{customers:[]});assert.equal(checker.value.address,'');
 await changeNotes('Keep this draft while customers load');await refreshCustomers([customer,other,missing]);
 assert.equal(propertyInput().props.value,savedAddress);await submit();assert.equal(writes[0].value.notes,'Keep this draft while customers load');assert.equal(writes[0].value.serviceProperty.address,savedAddress);
});
test('explicit property and legacy address defaults take precedence over customer suggestions',async()=>{
 await renderJob(undefined,{defaults:{customerId:customer.id,serviceType:'Pest Control',date:'2030-01-02',address:'A supplied legacy address',serviceProperty:{address:'Explicit default service property'},serviceCategory:'Pool Cleaning'}});
 assert.equal(propertyInput().props.value,'Explicit default service property');assert.equal(checker.value.serviceCategory,'Pool Cleaning');
 await changeNotes('Preserve the supplied property');await submit();assert.equal(writes[0].value.serviceProperty.address,'Explicit default service property');
 await act(async()=>tree.unmount());tree=null;writes=[];
 await renderJob(undefined,{defaults:{customerId:customer.id,serviceType:'Pest Control',date:'2030-01-02',address:'A supplied legacy address'}});
 assert.equal(propertyInput().props.value,'A supplied legacy address');await changeNotes('Keep the supplied legacy location');await submit();assert.equal(writes[0].value.serviceProperty.address,'A supplied legacy address');
});
test('saved nested street and line1 addresses retain city, state and ZIP or postalCode',async()=>{
 for(const [fields,expected] of [[{address:{street:'300 Nested Street',city:'Bakersfield',state:'CA',zipCode:'93309'}},'300 Nested Street, Bakersfield, CA 93309'],[{address:{line1:'400 Nested Avenue',city:'Bakersfield',state:'CA',postalCode:'93308'}},'400 Nested Avenue, Bakersfield, CA 93308'],[{address:'500 Saved Street',city:'Bakersfield',state:'CA',postalCode:'93307'},'500 Saved Street, Bakersfield, CA 93307']]){
  const nested={id:'nested',name:'Nested address customer',...fields};
  await renderJob(undefined,{customers:[nested],defaults:{customerId:nested.id,serviceType:'Pest Control',date:'2030-01-02'}});
  assert.equal(propertyInput().props.value,expected);
  await act(async()=>tree.unmount());tree=null;
 }
});
test('customer switching replaces the property and clears former confirmation and owner exceptions',async()=>{
 await renderJob(job);await act(async()=>checker.onChange({...checker.value,exceptionId:'old-customer-approval',confirmed:true}));
 await selectCustomer(other.id);assert.equal(propertyInput().props.value,otherAddress);assert.equal(checker.value.exceptionId,null);assert.equal(checker.value.confirmed,false);
 await submit();assert.equal(writes.length,1);assert.equal(writes[0].value.customerId,other.id);assert.deepEqual(writes[0].value.serviceProperty,{address:otherAddress});assert.equal(writes[0].value.serviceAreaExceptionId,null);
});
test('custom and deliberately cleared properties survive customer-list refreshes',async()=>{
 await renderJob();await changeProperty('A different actual service property');
 await refreshCustomers([{...customer,address:'A refreshed customer contact address'},other,missing]);
 assert.equal(propertyInput().props.value,'A different actual service property');
 await act(async()=>propertyInput().props.onChange({target:{value:''}}));
 await refreshCustomers([{...customer},other,missing]);assert.equal(propertyInput().props.value,'');
});
test('a manually entered property is not replaced when the initial customer list arrives',async()=>{
 await renderJob(undefined,{customers:[]});await changeProperty('A manually selected property');
 await refreshCustomers([customer,other,missing]);assert.equal(propertyInput().props.value,'A manually selected property');
});
test('configured jobs still require a property when their selected customer has no saved address',async()=>{
 await renderJob(undefined,{defaults:{customerId:missing.id,serviceType:'Pest Control',date:'2030-01-02'}});
 assert.equal(propertyInput().props.value,'');await changeNotes('Missing address must be supplied');await submit();assert.equal(writes.length,0);assert.match(toasts.at(-1),/service property address explicitly/);
});
test('normal edits retain historical geography and send no geography recertification fields',async()=>{
 await renderJob(job);await act(async()=>tree.root.findByProps({placeholder:'Gate code, pets, areas of concern…'}).props.onChange({target:{value:'A routine updated note'}}));await submit();assert.equal(writes.length,1);const data=writes[0].value;assert.equal(data.address,'Historical routing address');for(const key of ['serviceProperty','serviceCategory','serviceAreaExceptionId'])assert.equal(Object.hasOwn(data,key),false);assert.deepEqual(data.revisions.at(-1).changes.map(row=>row.field),['notes']);
});
test('an actual property/category/approval edit is sent and recorded in job revision history',async()=>{
 await renderJob(job);await enableAddressEditing();await act(async()=>checker.onChange({address:'Different actual service property',serviceCategory:'Pool Cleaning',exceptionId:'new-scoped-approval',confirmed:true}));await submit();const data=writes[0].value;assert.deepEqual(data.serviceProperty,{address:'Different actual service property'});assert.equal(data.address,'Different actual service property');assert.equal(data.serviceCategory,'Pool Cleaning');assert.equal(data.serviceAreaExceptionId,'new-scoped-approval');assert.ok(data.revisions.at(-1).changes.some(row=>row.field==='serviceProperty'));assert.equal(data.originalDetails.serviceProperty.address,'Recorded service property');
});
test('checking an unchanged property is not a job edit and cannot enable a duplicate save',async()=>{
 await renderJob(job);assert.equal(button('Save Changes').props.disabled,true);await act(async()=>button('Confirm current property only').props.onClick());assert.equal(button('Save Changes').props.disabled,true);assert.equal(dirty,false);assert.equal(writes.length,0);
});
test('normal legacy job edits show their recorded address and never recertify or move the historical appointment',async()=>{
 const legacy={...job,serviceProperty:undefined,serviceCategory:undefined,serviceAreaExceptionId:undefined};await renderJob(legacy);
 assert.equal(propertyInput().props.value,'Historical routing address');assert.equal(dirty,false);assert.equal(button('Save Changes').props.disabled,true);
 await changeNotes('Update only the legacy visit notes');await submit();assert.equal(writes.length,1);assert.equal(writes[0].value.address,'Historical routing address');
 for(const key of ['serviceProperty','serviceCategory','serviceAreaExceptionId'])assert.equal(Object.hasOwn(writes[0].value,key),false);
 assert.deepEqual(writes[0].value.revisions.at(-1).changes.map(row=>row.field),['notes']);
});
test('changing a legacy job to a customer without an address clears the old property and blocks configured scheduling',async()=>{
 const legacy={...job,serviceProperty:undefined,serviceCategory:undefined,serviceAreaExceptionId:undefined};await renderJob(legacy);await selectCustomer(missing.id);
 assert.equal(propertyInput().props.value,'');assert.equal(checker.value.exceptionId,null);assert.equal(checker.value.confirmed,false);await submit();assert.equal(writes.length,0);assert.match(toasts.at(-1),/service property address explicitly/);
});
test('saved service addresses stay locked until Enable Editing and reject a forged address callback',async()=>{
 await renderJob();assert.equal(checker.addressReadOnly,true);assert.equal(propertyInput().props.readOnly,true);assert.equal(permanentCheckbox(),undefined);
 await act(async()=>checker.onChange({...checker.value,address:'An unapproved replacement address',exceptionId:null,confirmed:false}));
 assert.equal(propertyInput().props.value,savedAddress);assert.equal(checker.addressReadOnly,true);
 await enableAddressEditing();assert.equal(checker.addressReadOnly,false);assert.equal(propertyInput().props.readOnly,false);assert.equal(permanentCheckbox(),undefined);
 await changeProperty('An explicitly edited service address');assert.ok(permanentCheckbox());assert.equal(permanentCheckbox().props.checked,false);
});
test('editing a job address defaults to a one-off change and does not request a permanent customer write',async()=>{
 const created=[];await renderJob(undefined,{onCreated:(...args)=>created.push(args)});await changeProperty('One-off service visit address');
 assert.equal(permanentCheckbox().props.checked,false);await submit();assert.equal(writes.length,1);assert.equal(writes[0].value.address,'One-off service visit address');assert.equal(writes[0].options,undefined);
 for(const key of ['saveCustomerAddress','expectedCustomerVersion','customerAddressUpdated'])assert.equal(Object.hasOwn(writes[0].value,key),false);
 assert.equal(created.length,1);assert.equal(created[0][1]?.customerAddressUpdated===true,false);
});
test('an explicit permanent-address choice sends scoped options and confirms the customer update to the parent',async()=>{
 const created=[];await renderJob(undefined,{onCreated:(...args)=>created.push(args)});await changeProperty('A permanent corrected customer property');await choosePermanent(true);
 await submit();assert.equal(writes.length,1);assert.deepEqual(writes[0].options,{saveCustomerAddress:true,expectedCustomerVersion:customer.updatedAt});
 assert.deepEqual(writes[0].value.serviceProperty,{address:'A permanent corrected customer property'});
 for(const key of ['saveCustomerAddress','expectedCustomerVersion','customerAddressUpdated'])assert.equal(Object.hasOwn(writes[0].value,key),false);
 assert.equal(created.length,1);assert.equal(created[0][1]?.customerAddressUpdated,true);assert.match(toasts.join(' '),/address|customer/i);
});
test('a customer refresh cannot silently rebase a permanent edit and a conflict preserves the draft for review',async()=>{
 const created=[];await renderJob(undefined,{onCreated:(...args)=>created.push(args)});await changeProperty('A deliberate permanent-address correction');await choosePermanent(true);
 await refreshCustomers([{...customer,address:'An address changed by another dispatcher',updatedAt:'2026-11-15T16:00:00.000Z'},other,missing]);
 assert.equal(propertyInput().props.value,'A deliberate permanent-address correction');assert.equal(permanentCheckbox().props.checked,true);
 writeFailure='The customer address changed. Review the latest customer record before saving.';await submit();
 assert.equal(writes.length,1);assert.deepEqual(writes[0].options,{saveCustomerAddress:true,expectedCustomerVersion:customer.updatedAt});
 assert.equal(created.length,0);assert.equal(propertyInput().props.value,'A deliberate permanent-address correction');assert.equal(permanentCheckbox().props.checked,true);assert.equal(dirty,true);
 assert.match(toasts.at(-1),/customer address changed/);assert.equal(toasts.some(message=>/Job scheduled/.test(message)),false);
});
test('the recorded job property can become permanent without inventing another job-address edit',async()=>{
 const created=[];await renderJob(job,{onCreated:(...args)=>created.push(args)});assert.equal(button('Save Changes').props.disabled,true);
 await enableAddressEditing();assert.equal(propertyInput().props.value,'Recorded service property');assert.equal(button('Save Changes').props.disabled,true);
 await choosePermanent(true);assert.equal(button('Save Changes').props.disabled,false);assert.equal(dirty,true);
 await choosePermanent(false);assert.equal(button('Save Changes').props.disabled,true);assert.equal(dirty,false);
 await choosePermanent(true);await submit();assert.equal(writes.length,1);assert.equal(writes[0].action,'update');assert.equal(writes[0].id,job.id);
 assert.deepEqual(writes[0].options,{saveCustomerAddress:true,expectedCustomerVersion:customer.updatedAt});assert.equal(writes[0].expectedVersion,job.updatedAt);
 assert.equal(created[0][0].id,job.id);assert.equal(created[0][1]?.customerAddressUpdated,true);
});
test('customer selection relocks the address and discards a previous customer permanent-update choice',async()=>{
 await renderJob();await changeProperty('An address intended for the first customer');await choosePermanent(true);await selectCustomer(other.id);
 assert.equal(propertyInput().props.value,otherAddress);assert.equal(propertyInput().props.readOnly,true);assert.equal(checker.addressReadOnly,true);assert.equal(permanentCheckbox(),undefined);
 await enableAddressEditing();assert.equal(permanentCheckbox(),undefined);await changeProperty('One-off address for the second customer');assert.equal(permanentCheckbox().props.checked,false);
 await submit();assert.equal(writes.length,1);assert.equal(writes[0].value.customerId,other.id);assert.equal(writes[0].options,undefined);
});
test('a missing saved address requires Enable Editing and may be explicitly persisted with a null legacy version',async()=>{
 await renderJob(undefined,{defaults:{customerId:missing.id,serviceType:'Pest Control',date:'2030-01-02'}});
 assert.equal(propertyInput().props.value,'');assert.equal(checker.addressReadOnly,true);await changeProperty('A newly provided customer service address');await choosePermanent(true);
 await submit();assert.equal(writes.length,1);assert.equal(writes[0].value.customerId,missing.id);assert.deepEqual(writes[0].options,{saveCustomerAddress:true,expectedCustomerVersion:null});
});
test('without customer-management permission an address can change for this job but cannot be made permanent',async()=>{
 allowCustomerManage=false;await renderJob();await changeProperty('A one-off operational service address');assert.equal(permanentCheckbox(),undefined);
 await submit();assert.equal(writes.length,1);assert.equal(writes[0].options,undefined);assert.equal(writes[0].value.address,'A one-off operational service address');
});
test('solo scheduling saves the visible service address instead of a hidden customer suggestion',async()=>{
 company=null;await renderJob();assert.equal(checker,null);
 if(button('Enable Editing'))await enableAddressEditing();
 const address=tree.root.findByProps({placeholder:"Defaults to the customer's address"});await act(async()=>address.props.onChange({target:{value:'A chosen independent-business visit address'}}));
 await changeNotes('Save the visible solo address');await submit();assert.equal(writes.length,1);assert.equal(writes[0].value.address,'A chosen independent-business visit address');assert.equal(Object.hasOwn(writes[0].value,'serviceProperty'),false);
});
test('service plans require an explicit configured property and preserve its approved category/scope',async()=>{
 await act(async()=>{tree=create(React.createElement(Plans));});await act(async()=>button('New plan').props.onClick());await act(async()=>tree.root.findByProps({'aria-label':'Service plan customer'}).props.onChange({target:{value:customer.id}}));assert.equal(checker.value.address,'');await submit();assert.equal(planWrites.length,0);assert.match(toasts.at(-1),/service property address explicitly/);
 await act(async()=>checker.onChange({address:'100 Actual Service Street, Bakersfield, CA 93312',serviceCategory:'Pool Cleaning',exceptionId:'plan-owner-approval',confirmed:true}));await submit();assert.equal(planWrites.length,1);assert.deepEqual(planWrites[0].serviceProperty,{address:'100 Actual Service Street, Bakersfield, CA 93312'});assert.equal(planWrites[0].serviceCategory,'Pool Cleaning');assert.equal(planWrites[0].serviceAreaExceptionId,'plan-owner-approval');assert.equal(planWrites[0].confirmed,undefined);
});
test('unconfigured legacy service plans keep their existing optional-property behavior',async()=>{
 configured=false;await act(async()=>{tree=create(React.createElement(Plans));});await act(async()=>button('New plan').props.onClick());await act(async()=>tree.root.findByProps({'aria-label':'Service plan customer'}).props.onChange({target:{value:customer.id}}));await submit();assert.equal(planWrites.length,1);assert.equal(planWrites[0].serviceProperty,undefined);
});
