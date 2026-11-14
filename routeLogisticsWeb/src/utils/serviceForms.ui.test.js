import { test,beforeEach,afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),mobileRequire=createRequire(new URL('../../../routeLogisticsMobile/package.json',import.meta.url));
const React=mobileRequire('react'),{create,act}=mobileRequire('react-test-renderer'),{transformSync}=require('esbuild');
const {validateTemplate}=require('../../../functions/shared/serviceFormSchema');
const template=validateTemplate(require('../../../functions/shared/serviceTemplates.json').find(row=>row.id==='pool-maintenance'));
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
let tree,role,data,stored,calls,listeners,saveHandler;
const modules=new Map(),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function load(filename){
  if(modules.has(filename))return modules.get(filename).exports;
  const module={exports:{}};modules.set(filename,module);
  const mock=name=>{
    if(name==='react')return React;
    if(name==='react/jsx-runtime')return mobileRequire(name);
    if(name.endsWith('/contexts/AuthContext'))return{useAuth:()=>({currentUser:{uid:'tech'},company:{id:'acme'},role,can:()=>role!=='technician'})};
    if(name.endsWith('/services/tenancy'))return{getClaims:()=>({membershipId:'member'})};
    if(name.endsWith('/services/workspaceApi'))return{callWorkspace:async(_name,payload)=>{
      calls.push(payload);
      if(payload.action==='read')return structuredClone(data);
      if(payload.action==='catalog')return{enabled:true,templates:[template]};
      if(payload.action==='save')return saveHandler(payload);
      if(payload.action==='publish')return{template:payload.template};
      if(payload.action==='assign'){data={...data,form:{...data.form,assignmentVersion:data.form.assignmentVersion+1}};return{form:data.form};}
      throw new Error(payload.action);
    }};
    if(name.startsWith('.')){const next=path.resolve(path.dirname(filename),name);return load(path.extname(next)?next:fs.existsSync(next+'.js')?next+'.js':next+'.jsx');}
    throw new Error(name);
  };
  const source=fs.readFileSync(filename,'utf8'),code=transformSync(source,{loader:filename.endsWith('.jsx')?'jsx':'js',format:'cjs',jsx:'automatic'}).code;
  new Function('require','module','exports',code)(mock,module,module.exports);return module.exports;
}
const Checklist=load(path.resolve(root,'components/ServiceChecklist.jsx')).default;
const job={id:'assigned',companyId:'acme',assignedTo:'member',status:'in-progress',totalCost:9999};
const text=node=>typeof node==='string'?node:(Array.isArray(node)?node:node?.children||[]).map(text).join('');
const content=()=>text(tree.toJSON());
const buttons=label=>tree.root.findAll(node=>node.type==='button'&&text(node)===label);
async function settle(){for(let i=0;i<3;i++)await act(async()=>{await Promise.resolve();});}
async function render(){await act(async()=>{tree=create(React.createElement(Checklist,{job}));});await settle();}
async function press(label){const button=buttons(label)[0];assert.ok(button,label);assert.notEqual(button.props.disabled,true);await act(async()=>button.props.onClick());await settle();}
async function input(id,value){const node=tree.root.findAll(node=>node.type==='input'&&node.props.id===id)[0];assert.ok(node,id);await act(async()=>node.props.onChange({target:{value}}));}
beforeEach(()=>{
  tree=null;role='technician';stored=new Map();calls=[];listeners=new Set();
  data={enabled:true,form:{template,assignmentVersion:1,responseVersion:0,answers:{},status:'draft',serviceDate:'2026-11-13'},photos:[{id:'private-photo',caption:'Equipment evidence'}],reports:[]};
  saveHandler=async payload=>{data.form={...data.form,answers:payload.answers,responseVersion:1,status:payload.status};return{status:'synced',version:1};};
  globalThis.localStorage={getItem:key=>stored.get(key)||null,setItem:(key,value)=>stored.set(key,value),removeItem:key=>stored.delete(key)};
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{onLine:true}});
  globalThis.window={addEventListener:(_event,listener)=>listeners.add(listener),removeEventListener:(_event,listener)=>listeners.delete(listener)};
});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());assert.equal(listeners.size,0);delete globalThis.localStorage;delete globalThis.window;delete globalThis.navigator;});
test('technician service UI shows units/private photo labels and cannot assign or publish templates',async()=>{
  await render();assert.match(content(),/Free chlorine \* \(ppm\)/);assert.match(content(),/Equipment evidence/);assert.doesNotMatch(content(),/9999|private-photo|Customize company template/);
  assert.equal(buttons('Assign template version').length,0);assert.equal(buttons('Publish new version').length,0);
  await press('Finalize service report');assert.match(content(),/pH reading is required/);assert.equal(calls.filter(row=>row.action==='save').length,0);
});
test('browser drafts survive reopening and ambiguous save retries keep the exact operation ID',async()=>{
  await render();await input('service-assigned-ph','7.4');await input('service-assigned-freeChlorine','3');
  const selection=tree.root.findAll(node=>node.type==='select'&&node.props.id==='service-assigned-equipment')[0];await act(async()=>selection.props.onChange({target:{value:'Normal'}}));
  saveHandler=async()=>{throw new Error('Connection interrupted.');};await press('Finalize service report');assert.match(content(),/Connection interrupted/);
  const first=calls.find(row=>row.action==='save');assert.ok(first.operationId);assert.equal(first.answers.ph,7.4);
  await act(async()=>tree.unmount());tree=null;await render();assert.match(content(),/browser draft has been restored/);
  saveHandler=async()=>({status:'synced',version:1,duplicate:true});await press('Retry saved attempt');
  const retries=calls.filter(row=>row.action==='save');assert.equal(retries.length,2);assert.deepEqual(retries[1],first);assert.equal(stored.size,0);
});
test('managers can customize and publish a separate company template without mutating the starter',async()=>{
  role='manager';await render();const selector=tree.root.findAll(node=>node.type==='select'&&!node.props.id)[0];
  await act(async()=>selector.props.onChange({target:{value:'pool-maintenance:1'}}));await press('Customize company template');assert.ok(buttons('Publish new version')[0]);
  await press('Publish new version');const published=calls.find(row=>row.action==='publish').template;
  assert.match(published.id,/^custom-/);assert.equal(published.version,1);assert.equal(template.id,'pool-maintenance');assert.equal(calls.filter(row=>row.action==='assign').length,0);
});
