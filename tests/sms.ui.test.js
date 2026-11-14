const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const mobile=createRequire(path.resolve(__dirname,'../routeLogisticsMobile/package.json')),web=createRequire(path.resolve(__dirname,'../routeLogisticsWeb/package.json'));
const React=mobile('react'),{create,act}=mobile('react-test-renderer'),{transformSync}=web('esbuild');
global.IS_REACT_ACT_ENVIRONMENT=true;
let tree,owner=true,calls=[],data,companyId='co',dirty=false,toasts=[],saveFailure=null,pendingSave=null,companyUpdates=[];
let companyProfile={id:'co',ownerId:'owner',name:'Acme',serviceCategories:['Pest control']};
const modules=new Map();
function load(relative){const file=path.resolve(__dirname,'../routeLogisticsWeb/src',relative);if(modules.has(file))return modules.get(file);const module={exports:{}};const mock=name=>{
  if(name==='react')return React;
  if(name==='react-hot-toast')return {__esModule:true,default:{success:message=>toasts.push({type:'success',message}),error:message=>toasts.push({type:'error',message})}};
  if(name.endsWith('/AuthContext'))return {useAuth:()=>({company:{id:companyId,ownerId:'owner'},currentUser:{uid:owner?'owner':'manager'},role:owner?'owner':'manager',updateUserProfile:async()=>{},refreshSession:async()=>{}})};
  if(name.endsWith('/useUnsavedChanges'))return {useUnsavedChanges:value=>{dirty=value;return {confirmDiscard:async()=>true};}};
  if(name.endsWith('/workspaceApi'))return {callWorkspace:async(name,params)=>{calls.push({name,params});if(name==='rlSmsConfig'&&params.action==='save'){if(pendingSave)await pendingSave.promise;if(saveFailure)throw saveFailure;return {...data,settings:params.settings};}return data;}};
  if(name.endsWith('/tenancy'))return {getClaims:()=>({companyId})};
  if(name.endsWith('/companyService'))return {__esModule:true,default:{getCompany:async()=>({success:true,company:companyProfile}),getTeamMembers:async()=>({success:true,teamMembers:[]}),updateCompany:async(id,values)=>{companyUpdates.push({id,values});if(saveFailure)throw saveFailure;companyProfile={...companyProfile,...values};return {success:true,company:companyProfile};}}};
  if(name==='firebase/functions')return {httpsCallable:()=>async()=>({data:{}})};
  if(name.endsWith('/services/firebase'))return {functions:{}};
  if(name.endsWith('/ConfirmProvider'))return {useConfirm:()=>async()=>true};
  if(name==='framer-motion')return {motion:{div:props=>React.createElement('div',props,props.children)}};
  if(name==='@heroicons/react/24/outline')return new Proxy({}, {get:()=>props=>React.createElement('svg',props)});
  if(name.startsWith('.')){const resolved=path.resolve(path.dirname(file),name);return load(path.relative(path.resolve(__dirname,'../routeLogisticsWeb/src'),path.extname(resolved)?resolved:fs.existsSync(resolved+'.jsx')?resolved+'.jsx':resolved+'.js'));}
  throw Error('Unexpected dependency '+name);
};const {code}=transformSync(fs.readFileSync(file,'utf8'),{loader:file.endsWith('.jsx')?'jsx':'js',format:'cjs'});new Function('React','require','module','exports',code)(React,mock,module,module.exports);modules.set(file,module.exports);return module.exports;}
const Settings=load('components/SmsSettings.jsx').default,Consent=load('components/CustomerSmsConsent.jsx').default,Company=load('pages/CompanySetupPage.jsx').default;
const text=()=>JSON.stringify(tree.toJSON());
const labels=['appointment-confirmation','pre-visit','en-route','service-completed','service-follow-up'];
const status=()=>({settings:{enabled:false,timeZone:'America/Los_Angeles',reminderMinutes:1440,followUpMinutes:1440,purposes:labels.slice(0,4),templates:Object.fromEntries(labels.map(p=>[p,'Your service visit update.']))},delivery:{active:false,senderApproved:false,automationApproved:false},consent:null,disclosure:'Synthetic customer SMS disclosure.',history:[]});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;owner=true;calls=[];companyId='co';dirty=false;toasts=[];saveFailure=null;pendingSave=null;companyUpdates=[];companyProfile={id:'co',ownerId:'owner',name:'Acme',serviceCategories:['Pest control']};});
test('SMS settings cannot activate live delivery and managers cannot edit owner configuration',async()=>{
  owner=false;data=status();await act(async()=>{tree=create(React.createElement(Settings));});assert.equal(calls.length,0);assert.match(text(),/owner manages SMS/);assert.equal(tree.root.findAllByType('input').length,0);
  await act(async()=>tree.unmount());tree=null;owner=true;
  await act(async()=>{tree=create(React.createElement(Settings));});assert.match(text(),/Disabled or awaiting operator approval/);assert.match(text(),/Saving these settings cannot activate/);
  assert.equal(tree.root.findAll(node=>node.type==='button'&&/send/i.test(node.children.join(''))).length,0);
});
test('customer consent starts unselected and requires disclosure, purpose and evidence rather than phone presence',async()=>{
  data=status();await act(async()=>{tree=create(React.createElement(Consent,{customer:{id:'customer',phone:'+16615550101'}}));});
  const inputs=tree.root.findAllByType('input');assert.ok(inputs.filter(node=>node.props.type==='checkbox').every(node=>node.props.checked===false));
  const record=()=>tree.root.findAll(node=>node.type==='button'&&node.children.includes('Record customer consent'))[0];assert.equal(record().props.disabled,true);
  await act(async()=>inputs[0].props.onChange({target:{checked:true}}));
  await act(async()=>tree.root.findByProps({'aria-label':'SMS consent evidence reference'}).props.onChange({target:{value:'Signed form reference'}}));
  await act(async()=>tree.root.findAllByType('input').filter(node=>node.props.type==='checkbox').at(-1).props.onChange({target:{checked:true}}));assert.equal(record().props.disabled,false);
  data={consent:{status:'granted',purposes:['appointment-confirmation']}};await act(async()=>record().props.onClick());
  const grant=calls.find(call=>call.params.action==='grant');assert.deepEqual(grant.params.purposes,['appointment-confirmation']);assert.equal(grant.params.disclosureAccepted,true);assert.equal(grant.params.disclosure,'Synthetic customer SMS disclosure.');assert.match(text(),/No message was sent/);
});
test('suppressed customer numbers cannot be silently reconsented by staff',async()=>{
  data={...status(),suppressed:true,consent:{status:'stopped',purposes:['pre-visit']}};await act(async()=>{tree=create(React.createElement(Consent,{customer:{id:'customer'}}));});
  assert.match(text(),/Staff cannot override STOP/);assert.equal(tree.root.findByType('fieldset').props.disabled,true);assert.equal(calls.some(call=>call.params.action==='grant'),false);
});

test('refreshing provider suppression never restores stopped consent or silently records a fresh grant',async()=>{
  data={...status(),suppressed:true,consent:{status:'stopped',purposes:['pre-visit']}};
  await act(async()=>{tree=create(React.createElement(Consent,{customer:{id:'customer'}}));});
  assert.match(text(),/START alone does not restore consent/);
  data={...status(),suppressed:false,consent:{status:'stopped',purposes:['pre-visit']}};
  await act(async()=>tree.root.findAll(node=>node.type==='button'&&node.children.includes('Refresh SMS status'))[0].props.onClick());
  const consentLabel=tree.root.findAllByType('p').find(node=>node.children.includes('Consent: '));
  assert.equal(consentLabel.children.join(''),'Consent: stopped');
  assert.equal(tree.root.findByType('fieldset').props.disabled,false);
  assert.equal(calls.some(call=>call.params.action==='grant'),false);
  assert.match(text(),/No message was sent/);
});

const button=label=>tree.root.findAll(node=>node.type==='button'&&node.children.join('')===label)[0];
const zone=()=>tree.root.findAllByType('input').find(node=>node.props.value?.startsWith?.('America/'));
test('SMS save enables only for changed values and reports success before resetting its dirty baseline',async()=>{
  data=status();await act(async()=>{tree=create(React.createElement(Settings));});
  assert.equal(button('Save SMS settings').props.disabled,true);assert.equal(dirty,false);
  await act(async()=>zone().props.onChange({target:{value:'America/Denver'}}));assert.equal(dirty,true);assert.equal(button('Save SMS settings').props.disabled,false);
  await act(async()=>zone().props.onChange({target:{value:'America/Los_Angeles'}}));assert.equal(dirty,false);assert.equal(button('Save SMS settings').props.disabled,true);
  await act(async()=>zone().props.onChange({target:{value:'America/Denver'}}));await act(async()=>button('Save SMS settings').props.onClick());
  assert.equal(calls.filter(row=>row.params.action==='save').length,1);assert.equal(dirty,false);assert.equal(button('Save SMS settings').props.disabled,true);assert.equal(toasts.at(-1).type,'success');
});

test('SMS save failure keeps the edited settings and permits an explicit retry',async()=>{
  data=status();await act(async()=>{tree=create(React.createElement(Settings));});await act(async()=>zone().props.onChange({target:{value:'America/Denver'}}));
  saveFailure=Error('SMS settings could not be saved.');await act(async()=>button('Save SMS settings').props.onClick());
  assert.equal(zone().props.value,'America/Denver');assert.equal(dirty,true);assert.equal(button('Save SMS settings').props.disabled,false);assert.equal(toasts.at(-1).type,'error');
  saveFailure=null;await act(async()=>button('Save SMS settings').props.onClick());assert.equal(dirty,false);assert.equal(toasts.at(-1).type,'success');
});

test('SMS save duplicates are blocked and a late response cannot change a newly selected tenant',async()=>{
  data=status();await act(async()=>{tree=create(React.createElement(Settings));});await act(async()=>zone().props.onChange({target:{value:'America/Denver'}}));
  let release;pendingSave={promise:new Promise(resolve=>{release=resolve;})};const save=button('Save SMS settings').props.onClick;let first;
  await act(async()=>{first=save();save();});assert.equal(calls.filter(row=>row.params.action==='save').length,1);
  companyId='other-company';await act(async()=>tree.update(React.createElement(Settings)));assert.equal(zone().props.value,'America/Los_Angeles');assert.equal(dirty,false);
  await act(async()=>{release();await first;});assert.equal(zone().props.value,'America/Los_Angeles');assert.equal(toasts.length,0);
});

test('company profile saves only changed values and preserves service categories in the saved baseline',async()=>{
  await act(async()=>{tree=create(React.createElement(Company));});assert.equal(button('Save Changes').props.disabled,true);assert.equal(dirty,false);
  const name=()=>tree.root.findByProps({placeholder:'Enter company name'});
  await act(async()=>name().props.onChange({target:{value:'Acme West'}}));assert.equal(dirty,true);assert.equal(button('Save Changes').props.disabled,false);
  await act(async()=>name().props.onChange({target:{value:'Acme'}}));assert.equal(dirty,false);
  await act(async()=>button('Next').props.onClick());await act(async()=>tree.root.findByProps({placeholder:'Add a service category (e.g., Pool Maintenance)'}).props.onChange({target:{value:'Pool cleaning'}}));await act(async()=>button('Add').props.onClick());
  assert.equal(dirty,true);await act(async()=>button('Save Changes').props.onClick());assert.deepEqual(companyUpdates[0].values.serviceCategories,['Pest control','Pool cleaning']);assert.equal(dirty,false);assert.equal(button('Save Changes').props.disabled,true);assert.equal(toasts.at(-1).type,'success');
});

test('failed company profile saves retain edited fields and their unsaved warning',async()=>{
  await act(async()=>{tree=create(React.createElement(Company));});const name=()=>tree.root.findByProps({placeholder:'Enter company name'});
  await act(async()=>name().props.onChange({target:{value:'Edited company'}}));saveFailure=Error('Company save unavailable.');await act(async()=>button('Save Changes').props.onClick());
  assert.equal(name().props.value,'Edited company');assert.equal(dirty,true);assert.equal(button('Save Changes').props.disabled,false);assert.equal(toasts.at(-1).type,'error');
});
