const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const mobile=createRequire(path.resolve(__dirname,'../routeLogisticsMobile/package.json')),web=createRequire(path.resolve(__dirname,'../routeLogisticsWeb/package.json'));
const React=mobile('react'),{create,act}=mobile('react-test-renderer'),{transformSync}=web('esbuild');
const {createWorkspaceQueryMock,selectControlMock}=require('./support/workspaceQueryMock.cjs');
const workspaceHooks=createWorkspaceQueryMock(React,{scopeId:()=>companyId+':'+role});
global.IS_REACT_ACT_ENVIRONMENT=true;
let tree,role='owner',uid='owner',companyId='co',calls=[],dirty=false,toasts=[],policy,saveFailure=null,statusFailure=null,checkFailure=null,approvalFailure=null,pendingSave=null,pendingCheck=null,allowDiscard=true,latestValue=null,mapsLoads=0,circles=[];
const clone=x=>JSON.parse(JSON.stringify(x));
const baseline=()=>({settings:{configured:true,revision:4,operatingAddress:'100 Synthetic Street, Bakersfield, CA 93312',operatingLocation:{latitude:35.38,longitude:-119.1,formattedAddress:'100 Synthetic Street, Bakersfield, CA 93312',postalCode:'93312'},method:'zip',zipCodes:['93312'],radiusMiles:25,categoryOverrides:[],acceptingNewCustomers:true,publishCoverage:false,allowOutOfAreaRequests:false},canApproveExceptions:role==='owner'});
policy=baseline();
const modules=new Map();
function load(relative){
 const file=path.resolve(__dirname,'../routeLogisticsWeb/src',relative);if(modules.has(file))return modules.get(file);const module={exports:{}};
 const mocked=name=>{
  if(name==='react')return React;
    if(name.endsWith('/useWorkspaceQuery'))return workspaceHooks;
    if(name.endsWith('/SelectControl'))return{__esModule:true,default:selectControlMock(React)};
    if(name.endsWith('/workspaceQueryPolicy'))return{workspaceAccessError:error=>['permission-denied','unauthenticated','not-found','workspace-changed'].includes(String(error?.code||'').split('/').pop())};
  if(name==='react-hot-toast')return{__esModule:true,default:{success:message=>toasts.push({type:'success',message}),error:message=>toasts.push({type:'error',message})}};
  if(name.endsWith('/AuthContext'))return{useAuth:()=>({company:{id:companyId,ownerId:'owner',serviceCategories:['Pest Control','Pool Cleaning']},currentUser:{uid},role})};
  if(name.endsWith('/useUnsavedChanges'))return{useUnsavedChanges:changed=>{dirty=changed;return{confirmDiscard:async()=>allowDiscard};}};
  if(name.endsWith('/workspaceApi'))return{callWorkspace:async(name,data)=>{
   calls.push({name,data:clone(data)});assert.equal(name,'rlServiceAreas');
   if(data.action==='status'){if(statusFailure)throw statusFailure;return clone(policy);}
   if(data.action==='save'){if(pendingSave)await pendingSave;if(saveFailure)throw saveFailure;policy={settings:{...data.settings,configured:true,revision:data.expectedRevision+1,operatingLocation:baseline().settings.operatingLocation},canApproveExceptions:role==='owner'};return clone(policy);}
   if(data.action==='check'){if(pendingCheck)return pendingCheck;if(checkFailure)throw checkFailure;return{eligible:false,status:'outside',message:'The service property is outside saved coverage.',settingsRevision:4,property:{formattedAddress:data.propertyAddress,postalCode:'90001'},distanceMiles:112};}
   if(data.action==='approveException'){if(approvalFailure)throw approvalFailure;return{exceptionId:'approved-property',expiresAt:'2026-11-15T12:00:00Z',result:{eligible:true,status:'exception-approved',message:'The owner approved this specific property.',property:{formattedAddress:data.propertyAddress},settingsRevision:4}};}
   throw Error('Unexpected action '+data.action);
  }};
  if(name.endsWith('/maps'))return{loadMaps:async()=>{mapsLoads++;return{importLibrary:async()=>({Map:class{fitBounds(){}setCenter(){}setZoom(){}},Circle:class{constructor(options){Object.assign(this,options);circles.push(this);}setMap(value){this.map=value;}getBounds(){return{coverage:true};}}})};}};
  if(name.startsWith('.')){const target=path.resolve(path.dirname(file),name);return load(path.relative(path.resolve(__dirname,'../routeLogisticsWeb/src'),path.extname(target)?target:target+'.jsx'));}
  throw Error('Unexpected dependency '+name);
 };
 const {code}=transformSync(fs.readFileSync(file,'utf8'),{loader:'jsx',format:'cjs'});new Function('React','require','module','exports',code)(React,mocked,module,module.exports);modules.set(file,module.exports);return module.exports;
}
const Settings=load('components/ServiceAreasSettings.jsx').default,Eligibility=load('components/ServicePropertyEligibility.jsx').default;
const text=()=>JSON.stringify(tree.toJSON()),button=label=>tree.root.findAll(node=>node.type==='button'&&node.children.join('')===label)[0],field=label=>tree.root.findByProps({'aria-label':label});
const mountSettings=async()=>act(async()=>{tree=create(React.createElement(Settings),{createNodeMock:()=>({})});});
function ControlledProperty({initial={},...props}){const[value,setValue]=React.useState({address:'',serviceCategory:'Pest Control',...initial});latestValue=value;return React.createElement(Eligibility,{companyId,serviceCategories:['Pest Control','Pool Cleaning'],value,onChange:setValue,...props});}
const mountProperty=async(initial,props={})=>act(async()=>{tree=create(React.createElement(ControlledProperty,{initial,...props}));});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;role='owner';uid='owner';companyId='co';calls=[];dirty=false;toasts=[];policy=baseline();saveFailure=null;statusFailure=null;checkFailure=null;approvalFailure=null;pendingSave=null;pendingCheck=null;allowDiscard=true;latestValue=null;mapsLoads=0;circles=[];});

test('technicians cannot load or edit private service-area settings',async()=>{
 role='technician';uid='tech';await mountSettings();assert.equal(calls.length,0);assert.match(text(),/Technicians cannot change coverage/);assert.equal(tree.root.findAllByType('input').length,0);
});
test('company administrators can manage coverage without owner exception authority',async()=>{
 role='admin';uid='admin';await mountSettings();assert.equal(calls[0].data.action,'status');assert.equal(button('Save service areas').props.disabled,true);assert.equal(tree.root.findAllByType('input').filter(n=>n.props.type==='checkbox')[1].props.checked,false);
});
test('managers can manage private coverage without owner exception authority',async()=>{
 role='manager';uid='manager';policy=baseline();await mountSettings();assert.equal(calls[0].data.action,'status');assert.equal(button('Save service areas').props.disabled,true);assert.equal(tree.root.findAllByType('input').filter(n=>n.props.type==='checkbox')[1].props.checked,false);
});
test('saving requires an actual change and sends no client coordinates or eligibility flags',async()=>{
 await mountSettings();assert.equal(dirty,false);assert.equal(button('Save service areas').props.disabled,true);
 await act(async()=>field('Default company coverage ZIP codes').props.onChange({target:{value:'93312, 93311'}}));assert.equal(dirty,true);assert.equal(button('Save service areas').props.disabled,false);
 await act(async()=>button('Save service areas').props.onClick());const saved=calls.find(c=>c.data.action==='save').data;assert.equal(saved.expectedRevision,4);assert.deepEqual(saved.settings.zipCodes,['93312','93311']);assert.equal(saved.settings.publishCoverage,false);assert.equal(saved.settings.operatingLocation,undefined);assert.equal(saved.settings.eligible,undefined);assert.equal(dirty,false);assert.equal(button('Save service areas').props.disabled,true);assert.equal(toasts.at(-1).type,'success');
});
test('invalid ZIP codes and radius values cannot be saved',async()=>{
 await mountSettings();await act(async()=>field('Default company coverage ZIP codes').props.onChange({target:{value:'93312, invalid'}}));assert.equal(button('Save service areas').props.disabled,true);assert.match(text(),/valid US ZIP codes/);
 await act(async()=>field('Default company coverage method').props.onChange({target:{value:'radius'}}));await act(async()=>field('Default company coverage radius in miles').props.onChange({target:{value:'301'}}));assert.equal(button('Save service areas').props.disabled,true);assert.match(text(),/between 0.1 and 300 miles/);assert.equal(calls.some(c=>c.data.action==='save'),false);
});
test('a category override replaces one named category and preserves the default territory',async()=>{
 await mountSettings();await act(async()=>button('Add category override').props.onClick());assert.equal(field('Override 1 service category').props.value,'Pest Control');
 await act(async()=>field('Override 1 ZIP codes').props.onChange({target:{value:'93311'}}));await act(async()=>button('Save service areas').props.onClick());
 const saved=calls.find(c=>c.data.action==='save').data.settings;assert.deepEqual(saved.zipCodes,['93312']);assert.deepEqual(saved.categoryOverrides,[{serviceCategory:'Pest Control',method:'zip',zipCodes:['93311'],radiusMiles:25}]);
});
test('a failed save retains edits and allows a visible retry',async()=>{
 await mountSettings();await act(async()=>field('Default company coverage ZIP codes').props.onChange({target:{value:'93311'}}));saveFailure=Error('Address validation unavailable. Retry later.');await act(async()=>button('Save service areas').props.onClick());assert.equal(field('Default company coverage ZIP codes').props.value,'93311');assert.equal(dirty,true);assert.equal(toasts.at(-1).type,'error');assert.match(text(),/Address validation unavailable/);
 saveFailure=null;await act(async()=>button('Save service areas').props.onClick());assert.equal(dirty,false);assert.equal(toasts.at(-1).type,'success');
});

test('background coverage refresh updates clean settings and preserves a dirty territory revision',async()=>{
 await mountSettings();policy={...policy,settings:{...policy.settings,revision:5,zipCodes:['93311']}};
 await act(async()=>workspaceHooks.useInvalidateWorkspace()(['service-areas']));
 assert.equal(field('Default company coverage ZIP codes').props.value,'93311');assert.equal(dirty,false);
 await act(async()=>field('Default company coverage ZIP codes').props.onChange({target:{value:'93310'}}));
 policy={...policy,settings:{...policy.settings,revision:6,zipCodes:['93309']}};
 await act(async()=>workspaceHooks.useInvalidateWorkspace()(['service-areas']));
 assert.equal(field('Default company coverage ZIP codes').props.value,'93310');assert.equal(dirty,true);
 await act(async()=>button('Save service areas').props.onClick());
 assert.equal(calls.find(row=>row.data.action==='save').data.expectedRevision,5);
});
test('duplicate saves are blocked and a late response cannot overwrite another company',async()=>{
 await mountSettings();await act(async()=>field('Default company coverage ZIP codes').props.onChange({target:{value:'93311'}}));let release;pendingSave=new Promise(resolve=>{release=resolve;});const save=button('Save service areas').props.onClick;
 await act(async()=>{save();save();});assert.equal(calls.filter(c=>c.data.action==='save').length,1);
 companyId='different-company';await act(async()=>tree.update(React.createElement(Settings)));assert.equal(field('Default company coverage ZIP codes').props.value,'93312');
 await act(async()=>{release();await pendingSave;});assert.equal(field('Default company coverage ZIP codes').props.value,'93312');assert.equal(toasts.length,0);
});
test('reload honours the scoped unsaved-change decision',async()=>{
 await mountSettings();await act(async()=>field('Default company coverage ZIP codes').props.onChange({target:{value:'93311'}}));allowDiscard=false;await act(async()=>button('Reload service areas').props.onClick());assert.equal(field('Default company coverage ZIP codes').props.value,'93311');assert.equal(calls.filter(c=>c.data.action==='status').length,1);
 allowDiscard=true;await act(async()=>button('Reload service areas').props.onClick());assert.equal(field('Default company coverage ZIP codes').props.value,'93312');
});
test('radius maps load only on request and display the saved radius in meters',async()=>{
 policy.settings.method='radius';policy.settings.radiusMiles=10;await mountSettings();assert.equal(mapsLoads,0);await act(async()=>button('Show coverage map').props.onClick());assert.equal(mapsLoads,1);assert.equal(circles.at(-1).radius,16093.44);
 await act(async()=>field('Default company coverage radius in miles').props.onChange({target:{value:'20'}}));assert.equal(circles.at(-1).radius,16093.44);assert.equal(mapsLoads,1);assert.match(text(),/Save your changes to update this preview/);
});
test('billing details are copied only by an explicit service-property action',async()=>{
 await mountProperty({}, {billingAddress:'200 Explicit Test Street, Bakersfield, CA 93312',purpose:'estimate'});assert.equal(field('Service property address').props.value,'');assert.equal(button('Check service property').props.disabled,true);assert.equal(calls.some(c=>c.data.action==='check'),false);
 await act(async()=>button('Use this as the service property').props.onClick());assert.equal(latestValue.address,'200 Explicit Test Street, Bakersfield, CA 93312');await act(async()=>button('Check service property').props.onClick());const request=calls.find(c=>c.data.action==='check').data;assert.equal(request.propertyAddress,latestValue.address);assert.equal(request.purpose,'estimate');assert.equal(request.eligible,undefined);assert.match(text(),/Property is outside coverage/);
});
test('editing a service property clears prior approval and invalidates the old result',async()=>{
 await mountProperty({address:'Outside synthetic property',exceptionId:'old-approval',confirmed:true});await act(async()=>button('Check service property').props.onClick());assert.match(text(),/Property is outside coverage/);
 await act(async()=>field('Service property address').props.onChange({target:{value:'A different synthetic property'}}));assert.equal(latestValue.exceptionId,null);assert.equal(latestValue.confirmed,false);assert.doesNotMatch(text(),/Property is outside coverage/);
});
test('only owners with enabled policy can request an exact, reasoned out-of-area exception',async()=>{
 policy.settings.allowOutOfAreaRequests=true;await mountProperty({address:'Outside synthetic property'});await act(async()=>button('Check service property').props.onClick());assert.equal(button('Approve this out-of-area property').props.disabled,true);
 await act(async()=>field('Out-of-area approval reason').props.onChange({target:{value:'Explicit one-property approval for a planned visit.'}}));await act(async()=>button('Approve this out-of-area property').props.onClick());const request=calls.find(c=>c.data.action==='approveException').data;assert.equal(request.propertyAddress,'Outside synthetic property');assert.equal(request.serviceCategory,'Pest Control');assert.equal(request.purpose,'scheduling');assert.equal(latestValue.exceptionId,'approved-property');assert.equal(latestValue.confirmed,true);assert.match(text(),/Approved property exception/);
});
test('managers see an owner-approval warning and cannot approve an outside property',async()=>{
 role='manager';uid='manager';policy=baseline();policy.settings.allowOutOfAreaRequests=true;await mountProperty({address:'Outside synthetic property'});await act(async()=>button('Check service property').props.onClick());assert.equal(button('Approve this out-of-area property'),undefined);assert.match(text(),/company owner must approve/);assert.equal(calls.some(c=>c.data.action==='approveException'),false);
});
test('a late property-check response is ignored after the address changes',async()=>{
 let release;pendingCheck=new Promise(resolve=>{release=resolve;});await mountProperty({address:'First synthetic property'});await act(async()=>{button('Check service property').props.onClick();});
 await act(async()=>field('Service property address').props.onChange({target:{value:'Second synthetic property'}}));await act(async()=>{release({eligible:true,status:'inside',message:'STALE first property',property:{formattedAddress:'First synthetic property'}});await pendingCheck;});assert.doesNotMatch(text(),/STALE first property/);assert.equal(latestValue.confirmed,false);
});
test('address validation failures are actionable and do not permit an exception',async()=>{
 await mountProperty({address:'Incomplete synthetic address'});checkFailure=Error('Enter a complete service property street address.');await act(async()=>button('Check service property').props.onClick());assert.match(text(),/complete service property street address/);assert.equal(button('Approve this out-of-area property'),undefined);assert.equal(latestValue.confirmed,undefined);
});
test('an internal unverified-address check warns without changing the entered address or claiming geographic eligibility',async()=>{
 const message='Google could not confirm this address. You can save this internal job using the entered address. Coverage and map location remain unverified.';
 pendingCheck=Promise.resolve({eligible:false,status:'address-unverified',internalContinuation:true,message,addressValidation:{status:'invalid',message,warningOnly:true}});
 await mountProperty({address:'Operator supplied service property'});await act(async()=>button('Check service property').props.onClick());
 assert.match(text(),/save this internal job/);assert.equal(latestValue.address,'Operator supplied service property');assert.equal(latestValue.confirmed,false);assert.equal(button('Approve this out-of-area property'),undefined);assert.doesNotMatch(text(),/Property is inside coverage/);
 assert.equal(calls.filter(call=>call.data.action==='check').length,1);
});
test('a failed initial policy request is visible and retryable',async()=>{
 statusFailure=Error('Service-area policy is temporarily unavailable.');await mountProperty({address:'Synthetic property'});assert.match(text(),/temporarily unavailable/);assert.equal(button('Check service property').props.disabled,true);statusFailure=null;await act(async()=>button('Retry service-area settings').props.onClick());assert.equal(button('Check service property').props.disabled,false);
});
test('recorded estimate properties stay fixed while coverage checks and scoped owner approval remain available',async()=>{
 policy.settings.allowOutOfAreaRequests=true;policy.availableCategories=['Inspection'];await mountProperty({address:'Approved estimate property'}, {fixedProperty:true,fixedCategory:true,billingAddress:'Unrelated billing address'});
 assert.equal(field('Service property address').props.disabled,true);assert.equal(field('Service property category').props.disabled,true);assert.equal(button('Use this as the service property').props.disabled,true);assert.ok(field('Service property category').findAllByType('option').some(node=>node.props.value==='Inspection'));
 await act(async()=>button('Use this as the service property').props.onClick());assert.equal(latestValue.address,'Approved estimate property');assert.equal(button('Check service property').props.disabled,false);await act(async()=>button('Check service property').props.onClick());assert.ok(button('Approve this out-of-area property'));
});
test('an approved estimate missing its category can select one without changing its fixed property',async()=>{
 policy.availableCategories=['Inspection'];await mountProperty({address:'Approved estimate property',serviceCategory:''},{fixedProperty:true});assert.equal(field('Service property address').props.disabled,true);assert.equal(field('Service property category').props.disabled,false);await act(async()=>field('Service property category').props.onChange({target:{value:'Inspection'}}));assert.equal(latestValue.address,'Approved estimate property');assert.equal(latestValue.serviceCategory,'Inspection');assert.equal(latestValue.exceptionId,null);
});
test('disabled workflow fields cannot start checks or change their property through a stale handler',async()=>{
 await mountProperty({address:'Locked property'}, {disabled:true,billingAddress:'Different billing address'});assert.equal(button('Check service property').props.disabled,true);await act(async()=>button('Check service property').props.onClick());await act(async()=>button('Use this as the service property').props.onClick());assert.equal(calls.some(row=>row.data.action==='check'),false);assert.equal(latestValue.address,'Locked property');
});
test('unconfigured legacy scheduling is not presented as validated coverage',async()=>{
 policy.settings.configured=false;pendingCheck=Promise.resolve({eligible:true,status:'unconfigured',message:'Existing scheduling behavior is preserved.'});await mountProperty({address:'Unconfigured synthetic property'});await act(async()=>button('Check service property').props.onClick());assert.match(text(),/Service areas are not configured/);assert.doesNotMatch(text(),/Property is inside coverage/);
});
