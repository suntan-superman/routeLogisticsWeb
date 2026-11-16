const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const mobile=createRequire(path.resolve(__dirname,'../routeLogisticsMobile/package.json')),web=createRequire(path.resolve(__dirname,'../routeLogisticsWeb/package.json'));
const React=mobile('react'),{create,act}=mobile('react-test-renderer'),{transformSync}=web('esbuild');
const {createWorkspaceQueryMock,selectControlMock}=require('./support/workspaceQueryMock.cjs');
const workspaceHooks=createWorkspaceQueryMock(React);
global.IS_REACT_ACT_ENVIRONMENT=true;
const keys=new Set();global.window={addEventListener:(name,handler)=>{if(name==='keydown')keys.add(handler);},removeEventListener:(name,handler)=>{if(name==='keydown')keys.delete(handler);}};
let tree,dirty=false,discard=true,discardCalls=0,closed=0,created=[],writes=[],failure=null,pending=null,toasts=[];
const toast=message=>toasts.push({type:'info',message});toast.error=message=>toasts.push({type:'error',message});toast.success=message=>toasts.push({type:'success',message});
const template={id:'template-one',name:'Pest treatment',laborHours:2,laborRate:50,materialCost:0,totalCost:100,validityDays:30,isActive:true};
const templateService={getTemplates:async()=>({success:true,templates:[template]}),getTemplateStats:async()=>({success:true,stats:{totalTemplates:1,activeTemplates:1,inactiveTemplates:0,totalUsage:0}}),updateTemplate:async(id,data)=>{writes.push(data);if(failure)throw failure;return {success:true,template:{id,...data}};},createTemplate:async data=>{writes.push(data);return {success:true,template:{id:'new-template',...data}};}};
const jobService={updateJob:async(id,data)=>{writes.push(data);if(pending)await pending;if(failure)throw failure;return {success:true};},createJob:async data=>{writes.push(data);if(failure)throw failure;return {success:true,job:{id:'new-job',...data}};}};
const cache=new Map();
const themedControls=name=>{
 if(name.endsWith('/SelectControl'))return{__esModule:true,default:selectControlMock(React)};
 if(name.endsWith('/TechnicianAvailability')||name.endsWith('/AppointmentRepeatOptions'))return{__esModule:true,default:()=>null};
 if(name.endsWith('/workspaceApi'))return{callWorkspace:async()=>{throw Error('Scheduling RPC belongs to its dedicated UI suite.');}};
 if(name.endsWith('/ThemedSelect'))return{__esModule:true,default:props=>React.createElement('select',{'aria-label':props.label,value:props.value,disabled:props.disabled,onChange:event=>props.onChange(event.target.value)},(props.options||[]).map(option=>React.createElement('option',{key:option.value,value:option.value},option.label)))};
 if(name.endsWith('/TimeSelect'))return{__esModule:true,default:props=>React.createElement('input',{type:'time','aria-label':props.label,value:props.value,disabled:props.disabled,onChange:event=>props.onChange(event.target.value)})};
};
function load(relative){const file=path.resolve(__dirname,'../routeLogisticsWeb/src',relative);if(cache.has(file))return cache.get(file);const module={exports:{}};
  const mock=name=>{const control=themedControls(name);if(control)return control;if(name==='react')return React;
    if(name.endsWith('/useWorkspaceQuery'))return workspaceHooks;
    if(name.endsWith('/SelectControl'))return{__esModule:true,default:selectControlMock(React)};
    if(name.endsWith('/workspaceQueryPolicy'))return{workspaceAccessError:error=>['permission-denied','unauthenticated','not-found','user-changed'].includes(String(error?.code||'').split('/').pop())};if(name==='react-hot-toast')return toast;if(name==='framer-motion')return {motion:{div:'div'}};if(name==='@heroicons/react/24/outline')return new Proxy({},{get:(_target,key)=>key});if(name.endsWith('/useUnsavedChanges'))return {useUnsavedChanges:value=>{dirty=value;return {confirmDiscard:async()=>{discardCalls++;return discard;}};}};if(name.endsWith('/AuthContext'))return{useAuth:()=>({company:null})};if(name.endsWith('/ServicePropertyEligibility'))return{__esModule:true,default:()=>null};if(name.endsWith('/ConfirmProvider'))return {useConfirm:()=>async()=>true};if(name.endsWith('/estimateTemplateService'))return {__esModule:true,default:templateService};if(name.endsWith('/jobManagementService'))return {__esModule:true,default:jobService};if(name.endsWith('/services/firebase'))return {auth:{currentUser:{displayName:'Controlled operator'}}};if(name.startsWith('.')){const resolved=path.resolve(path.dirname(file),name);return load(path.relative(path.resolve(__dirname,'../routeLogisticsWeb/src'),path.extname(resolved)?resolved:fs.existsSync(resolved+'.jsx')?resolved+'.jsx':resolved+'.js'));}throw Error('Unexpected dependency '+name);};
  new Function('require','module','exports',transformSync(fs.readFileSync(file,'utf8'),{loader:file.endsWith('.jsx')?'jsx':'js',format:'cjs'}).code)(mock,module,module.exports);cache.set(file,module.exports);return module.exports;
}
const Templates=load('pages/EstimateTemplatesPage.jsx').default,Job=load('components/JobFormModal.jsx').default;
const text=node=>typeof node==='string'?node:(node.children||[]).map(text).join('');
const button=label=>tree.root.findAll(node=>node.type==='button'&&text(node).trim()===label)[0];
const render=async(Component,props)=>{await act(async()=>{tree=create(React.createElement(Component,props));});};
const job={id:'job-one',customerId:'customer-one',customerName:'Controlled customer',serviceType:'Pest treatment',date:'2030-01-02',time:'09:00',estimatedDuration:1,totalCost:25,address:'1 Test Lane',priority:'medium',notes:'Original notes'};
const jobProps=()=>({job,customers:[{id:'customer-one',name:'Controlled customer',address:'1 Test Lane'}],onClose:()=>closed++,onCreated:value=>created.push(value)});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;dirty=false;discard=true;discardCalls=0;closed=0;created=[];writes=[];failure=null;pending=null;toasts=[];});

test('template edits compare numeric values semantically and restore unchanged Save state',async()=>{
  await render(Templates);await act(async()=>tree.root.findAllByType('PencilIcon')[0].parent.props.onClick());assert.equal(button('Save Changes').props.disabled,true);assert.equal(dirty,false);
  const hours=()=>tree.root.findByProps({placeholder:'2.5'});await act(async()=>hours().props.onChange({target:{value:'2.00'}}));assert.equal(dirty,false);assert.equal(button('Save Changes').props.disabled,true);
  await act(async()=>hours().props.onChange({target:{value:'3'}}));assert.equal(dirty,true);discard=false;await act(async()=>button('Cancel').props.onClick());assert.equal(hours().props.value,'3');assert.equal(discardCalls,1);
  discard=true;await act(async()=>button('Cancel').props.onClick());assert.equal(button('Save Changes'),undefined);assert.equal(dirty,false);assert.equal(writes.length,0);
});

test('template save failures retain edits for retry and successful saves close the editor',async()=>{
  await render(Templates);await act(async()=>tree.root.findAllByType('PencilIcon')[0].parent.props.onClick());
  const name=()=>tree.root.findAllByProps({placeholder:'e.g., Pool Maintenance'})[0];await act(async()=>name().props.onChange({target:{value:'Changed treatment'}}));failure=Error('Template save unavailable.');await act(async()=>button('Save Changes').props.onClick());
  assert.equal(name().props.value,'Changed treatment');assert.equal(dirty,true);assert.equal(button('Save Changes').props.disabled,false);assert.equal(toasts.at(-1).type,'error');
  failure=null;await act(async()=>button('Save Changes').props.onClick());assert.equal(button('Save Changes'),undefined);assert.equal(dirty,false);assert.equal(toasts.at(-1).type,'success');
});

test('job modal save disables unchanged numeric edits and Cancel preserves a dirty draft when declined',async()=>{
  await render(Job,jobProps());assert.equal(button('Save Changes').props.disabled,true);const price=()=>tree.root.findByProps({placeholder:'0.00'});
  await act(async()=>price().props.onChange({target:{value:'25.00'}}));assert.equal(dirty,false);assert.equal(button('Save Changes').props.disabled,true);
  await act(async()=>price().props.onChange({target:{value:'30'}}));assert.equal(dirty,true);discard=false;await act(async()=>button('Cancel').props.onClick());assert.equal(closed,0);assert.equal(price().props.value,'30');
  discard=true;await act(async()=>button('Cancel').props.onClick());assert.equal(closed,1);assert.equal(writes.length,0);
});

test('job save exceptions clear loading, retain inputs and permit a successful retry',async()=>{
  await render(Job,jobProps());const notes=()=>tree.root.findByProps({placeholder:'Gate code, pets, areas of concern…'});await act(async()=>notes().props.onChange({target:{value:'Changed notes'}}));failure=Error('Job update unavailable.');
  await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));assert.equal(notes().props.value,'Changed notes');assert.equal(button('Save Changes').props.disabled,false);assert.equal(dirty,true);assert.equal(toasts.at(-1).type,'error');
  failure=null;await act(async()=>tree.root.findByType('form').props.onSubmit({preventDefault(){}}));assert.equal(created.length,1);assert.equal(dirty,false);assert.equal(button('Save Changes').props.disabled,true);assert.equal(toasts.at(-1).type,'success');
});

test('job duplicate submission and repeated Escape cannot bypass the outstanding operation or discard decision',async()=>{
  await render(Job,jobProps());await act(async()=>tree.root.findByProps({placeholder:'Gate code, pets, areas of concern…'}).props.onChange({target:{value:'Changed notes'}}));
  let resolve;discard=new Promise(done=>{resolve=done;});const escape=()=>{const event={key:'Escape',defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};for(const handler of keys)handler(event);};await act(async()=>{escape();escape();});assert.equal(discardCalls,1);assert.equal(closed,0);await act(async()=>resolve(false));
  let finish;pending=new Promise(done=>{finish=done;});const submit=tree.root.findByType('form').props.onSubmit;let first;await act(async()=>{first=submit({preventDefault(){}});submit({preventDefault(){}});});assert.equal(writes.length,1);assert.equal(button('Cancel').props.disabled,true);await act(async()=>{finish();await first;});assert.equal(created.length,1);
});

test('an empty new job draft does not enable Schedule until the user enters a change',async()=>{
  await render(Job,{customers:[],onClose:()=>closed++,onCreated:value=>created.push(value)});assert.equal(button('Schedule Job').props.disabled,true);assert.equal(dirty,false);
  await act(async()=>tree.root.findByProps({placeholder:'e.g. General Pest Control'}).props.onChange({target:{value:'Pest treatment'}}));assert.equal(button('Schedule Job').props.disabled,false);assert.equal(dirty,true);
});
