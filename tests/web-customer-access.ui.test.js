// Uses the existing workspace JSX compiler and React renderer; no Firebase calls.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const mobileRequire = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json'));
const webRequire = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobileRequire('react');
const { create, act } = mobileRequire('react-test-renderer');
const { transformSync } = webRequire('esbuild');
const {createWorkspaceQueryMock,selectControlMock}=require('./support/workspaceQueryMock.cjs');
const workspaceHooks=createWorkspaceQueryMock(React,{scopeId:()=>role||'owner'});
global.IS_REACT_ACT_ENVIRONMENT = true;
let role, customers, writes, dirty=false,discard=true,discardCalls=0,saveFailure=false,addressFailure=null,updateRequests=[];
const keyListeners=new Set();
global.window={addEventListener:(name,callback)=>{if(name==='keydown')keyListeners.add(callback);},removeEventListener:(name,callback)=>{if(name==='keydown')keyListeners.delete(callback);}};
const user = { uid: 'test-user', emailVerified: true, getIdToken: async () => 'test-token', getIdTokenResult: async () => ({ claims: { companyId: 'test-company', role, membershipId: 'test-member' } }) };
const service = {
  getCustomers: async () => ({ success: true, customers, hasMore: false }),
  getCustomerStats: async () => ({ success: true, stats: { totalCustomers: customers.length } }),
  createCustomer: async data => { writes.push(data); return addressFailure ? { success: false, error: addressFailure.message, addressValidation: addressFailure } : { success: true, customer: { id: 'new', ...data } }; },
  updateCustomer:async(id,data,expectedVersion)=>{writes.push(data);updateRequests.push({id,data,expectedVersion});return addressFailure?{success:false,error:addressFailure.message,addressValidation:addressFailure}:saveFailure?{success:false,error:'Customer save unavailable.'}:{success:true,customer:{id,...data}};},
};
const cache = new Map();
function load(relative) {
  const filename = path.resolve(__dirname, '../routeLogisticsWeb/src', relative);
  if (cache.has(filename)) return cache.get(filename);
  const module = { exports: {} };
  const mockRequire = specifier => {
    if (specifier === 'react') return React;
    if(specifier.endsWith('/useWorkspaceQuery'))return workspaceHooks;
    if(specifier.endsWith('/SelectControl'))return{__esModule:true,default:selectControlMock(React)};
    if(specifier.endsWith('/workspaceQueryPolicy'))return{workspaceAccessError:error=>['permission-denied','unauthenticated','not-found','workspace-changed'].includes(String(error?.code||'').split('/').pop())};
    if (specifier === 'framer-motion') return { motion: { div: 'div' } };
    if (specifier === '@heroicons/react/24/outline') return new Proxy({}, { get: (_, key) => key });
    if (specifier === 'react-hot-toast') return { error() {}, success() {} };
    if (specifier.endsWith('/customerService')) return service;
    if (specifier.endsWith('/ConfirmProvider')) return { useConfirm: () => async () => true };
    if (specifier.endsWith('/useUnsavedChanges')) return {useUnsavedChanges:value=>{dirty=value;return {confirmDiscard:async()=>{discardCalls++;return discard;}};}};
    if (specifier.endsWith('/CustomerImport')) return () => React.createElement('aside', null, 'Import customers');
    if (specifier.endsWith('/CustomerSmsConsent')) return () => React.createElement('aside', null, 'SMS consent controls');
    if (specifier === 'firebase/firestore') return { where() {} };
    if (specifier === 'firebase/functions') return { httpsCallable: () => async () => ({ data: { workspace: { status: 'company' } } }) };
    if (specifier === './firebase') return { auth: { currentUser: user }, functions: {} };
    if (specifier.startsWith('.')) {
      const resolved = path.resolve(path.dirname(filename), specifier);
      return load(path.extname(resolved) ? resolved : fs.existsSync(resolved + '.js') ? resolved + '.js' : resolved + '.jsx');
    }
    throw new Error(`Unexpected dependency: ${specifier}`);
  };
  const { code } = transformSync(fs.readFileSync(filename, 'utf8'), { loader: filename.endsWith('.json') ? 'json' : filename.endsWith('.jsx') ? 'jsx' : 'js', format: 'cjs' });
  new Function('require', 'module', 'exports', code)(mockRequire, module, module.exports);
  cache.set(filename, module.exports);
  return module.exports;
}
const Page = load('pages/CustomerManagementPage.jsx').default;
const tenancy = load('services/tenancy.js');
async function setRole(value) { role = value; await tenancy.syncTenancy(); }
async function render(value, records = [{ id: 'active', name: 'Active customer', isActive: true }, { id: 'inactive', name: 'Inactive customer', isActive: false }]) {
  await setRole(value); customers = records; writes = [];dirty=false;discard=true;discardCalls=0;saveFailure=false;addressFailure=null;updateRequests=[];
  let tree;
  await act(async () => { tree = create(React.createElement(Page)); });
  return tree;
}
const text = node => typeof node === 'string' ? node : (node.children || []).map(text).join('');
const buttons = (tree, label) => tree.root.findAll(node => node.type === 'button' && text(node).trim() === label);
const icons = (tree, name) => tree.root.findAllByType(name);

test('customer component has no technician mutation controls even if mounted outside the route guard', async () => {
  const tree = await render('technician');
  for (const label of ['Add Customer', 'Restore']) assert.equal(buttons(tree, label).length, 0);
  assert.equal(tree.root.findAllByType('aside').length, 0);
  assert.equal(icons(tree, 'PencilIcon').length, 0);
  assert.equal(icons(tree, 'TrashIcon').length, 0);
  const view = icons(tree, 'EyeIcon')[0].parent;
  await act(async () => view.props.onClick());
  assert.ok(buttons(tree, 'Close').length >= 1);
  assert.equal(buttons(tree, 'Edit Customer').length, 0);
  await act(async () => tree.unmount());
});
test('empty customer list never invites a technician to add a customer', async () => {
  const tree = await render('technician', []);
  assert.equal(buttons(tree, 'Add Customer').length, 0);
  assert.doesNotMatch(JSON.stringify(tree.toJSON()), /adding your first customer/);
  await act(async () => tree.unmount());
});
for (const value of ['owner', 'admin', 'manager']) test(`${value} retains customer management controls and can open the edit form`, async () => {
  const tree = await render(value);
  assert.equal(buttons(tree, 'Add Customer').length, 1);
  assert.equal(buttons(tree, 'Restore').length, 1);
  assert.equal(icons(tree, 'TrashIcon').length, 1);
  await act(async () => icons(tree, 'PencilIcon')[0].parent.props.onClick());
  assert.equal(buttons(tree, 'Save Changes').length, 1);
  await act(async () => tree.unmount());
});
test('an already-open add form cannot submit after claims downgrade to technician', async () => {
  const tree = await render('manager');
  await act(async () => buttons(tree, 'Add Customer')[0].props.onClick());
  const input = tree.root.findAllByType('input').find(node => node.props.placeholder === 'Enter customer name');
  await act(async () => input.props.onChange({ target: { value: 'Test customer' } }));
  const submit = buttons(tree, 'Add Customer').at(-1).props.onClick;
  await setRole('technician');
  await act(async () => submit());
  assert.equal(writes.length, 0);
  await act(async () => tree.update(React.createElement(Page)));
  assert.equal(buttons(tree, 'Add Customer').length, 0);
  await act(async () => tree.unmount());
});

test('customer edit save and unsaved warning follow actual changed values and clear when reverted',async()=>{
  const tree=await render('manager');await act(async()=>icons(tree,'PencilIcon')[0].parent.props.onClick());
  const input=()=>tree.root.findByProps({placeholder:'Enter customer name'});
  assert.equal(buttons(tree,'Save Changes')[0].props.disabled,true);assert.equal(dirty,false);
  await act(async()=>input().props.onChange({target:{value:'Changed customer'}}));assert.equal(dirty,true);assert.equal(buttons(tree,'Save Changes')[0].props.disabled,false);
  await act(async()=>input().props.onChange({target:{value:'Active customer'}}));assert.equal(dirty,false);assert.equal(buttons(tree,'Save Changes')[0].props.disabled,true);
  await act(async()=>tree.unmount());
});

test('customer Cancel preserves a changed draft when kept and discards only after confirmation',async()=>{
  const tree=await render('manager');await act(async()=>buttons(tree,'Add Customer')[0].props.onClick());
  await act(async()=>tree.root.findByProps({placeholder:'Enter customer name'}).props.onChange({target:{value:'Pending customer'}}));discard=false;
  await act(async()=>buttons(tree,'Cancel')[0].props.onClick());assert.equal(tree.root.findByProps({placeholder:'Enter customer name'}).props.value,'Pending customer');assert.equal(dirty,true);assert.equal(discardCalls,1);
  discard=true;await act(async()=>buttons(tree,'Cancel')[0].props.onClick());assert.equal(buttons(tree,'Cancel').length,0);assert.equal(dirty,false);assert.equal(writes.length,0);
  await act(async()=>tree.unmount());
});

test('customer Escape does not dismiss a changed form while a discard decision is pending',async()=>{
  const tree=await render('manager');await act(async()=>buttons(tree,'Add Customer')[0].props.onClick());
  await act(async()=>tree.root.findByProps({placeholder:'Enter customer name'}).props.onChange({target:{value:'Pending customer'}}));
  let resolve;discard=new Promise(done=>{resolve=done;});const escape=()=>{const event={key:'Escape',defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};for(const listener of keyListeners)listener(event);};
  await act(async()=>{escape();escape();});assert.equal(discardCalls,1);assert.equal(buttons(tree,'Cancel').length,1);
  await act(async()=>resolve(false));assert.equal(tree.root.findByProps({placeholder:'Enter customer name'}).props.value,'Pending customer');
  await act(async()=>tree.unmount());
});

test('failed customer saves keep edits and permit retry without dropping the warning',async()=>{
  const tree=await render('manager');await act(async()=>icons(tree,'PencilIcon')[0].parent.props.onClick());
  await act(async()=>tree.root.findByProps({placeholder:'Enter customer name'}).props.onChange({target:{value:'Retained customer'}}));saveFailure=true;
  await act(async()=>buttons(tree,'Save Changes')[0].props.onClick());assert.equal(tree.root.findByProps({placeholder:'Enter customer name'}).props.value,'Retained customer');assert.equal(dirty,true);assert.equal(buttons(tree,'Save Changes')[0].props.disabled,false);
  saveFailure=false;await act(async()=>buttons(tree,'Save Changes')[0].props.onClick());assert.equal(buttons(tree,'Save Changes').length,0);assert.equal(dirty,false);
  await act(async()=>tree.unmount());
});

const field=(tree,placeholder)=>tree.root.findByProps({placeholder});
const change=async(tree,placeholder,value)=>act(async()=>field(tree,placeholder).props.onChange({target:{value}}));
const suggestion={status:'confirmation-required',message:'Google found a suggested address. Confirm it before saving.',suggestedAddress:'1600 Amphitheatre Parkway, Mountain View, CA 94043'};

test('customer add displays the Google suggestion without saving or replacing the draft until explicitly accepted',async()=>{
  const tree=await render('manager');await act(async()=>buttons(tree,'Add Customer')[0].props.onClick());
  await change(tree,'Enter customer name','Synthetic review contact');await change(tree,'123 Main Street','1600 Amphitheatre Pkw');
  await change(tree,'Bakersfield','Old city');await change(tree,'CA','CA');await change(tree,'93311','99999');
  addressFailure=suggestion;
  await act(async()=>buttons(tree,'Add Customer').at(-1).props.onClick());
  assert.equal(writes.length,1);assert.equal(field(tree,'123 Main Street').props.value,'1600 Amphitheatre Pkw');
  assert.match(JSON.stringify(tree.toJSON()),/Google found a suggested address/);assert.equal(buttons(tree,'Use suggested address')[0].props.type,'button');
  await act(async()=>buttons(tree,'Use suggested address')[0].props.onClick());
  assert.equal(writes.length,1);assert.equal(field(tree,'123 Main Street').props.value,suggestion.suggestedAddress);
  for(const placeholder of ['Bakersfield','CA','93311'])assert.equal(field(tree,placeholder).props.value,'');
  assert.equal(field(tree,'Enter customer name').props.value,'Synthetic review contact');assert.equal(buttons(tree,'Use suggested address').length,0);
  addressFailure=null;await act(async()=>buttons(tree,'Add Customer').at(-1).props.onClick());
  assert.equal(writes.length,2);assert.equal(writes[1].address,suggestion.suggestedAddress);assert.equal(buttons(tree,'Cancel').length,0);
  await act(async()=>tree.unmount());
});

test('customer edit keeps the version captured before editing and retains the draft after validation failure',async()=>{
  const tree=await render('manager',[{id:'active',name:'Saved contact',address:'Old service address',updatedAt:'original-v1',isActive:true}]);
  await act(async()=>icons(tree,'PencilIcon')[0].parent.props.onClick());
  await change(tree,'123 Main Street','An edited service address');
  customers[0]={...customers[0],updatedAt:'background-v2'};await act(async()=>tree.update(React.createElement(Page)));
  addressFailure=suggestion;await act(async()=>buttons(tree,'Save Changes')[0].props.onClick());
  assert.equal(updateRequests[0].expectedVersion,'original-v1');assert.equal(field(tree,'123 Main Street').props.value,'An edited service address');
  assert.equal(buttons(tree,'Save Changes')[0].props.disabled,false);assert.equal(dirty,true);
  await change(tree,'123 Main Street','A manually corrected address');assert.equal(buttons(tree,'Use suggested address').length,0);
  await act(async()=>buttons(tree,'Cancel')[0].props.onClick());
  await act(async()=>icons(tree,'PencilIcon')[0].parent.props.onClick());assert.equal(buttons(tree,'Use suggested address').length,0);
  await act(async()=>tree.unmount());
});

for(const status of ['invalid','unavailable'])test(`customer ${status} address feedback remains actionable and preserves form fields`,async()=>{
  const tree=await render('manager');await act(async()=>buttons(tree,'Add Customer')[0].props.onClick());
  await change(tree,'Enter customer name','Retained synthetic contact');await change(tree,'123 Main Street','An unresolved address');
  addressFailure={status,message:status==='invalid'?'Google could not confirm this property. Review the address.':'The address check is unavailable. Try again shortly.'};
  await act(async()=>buttons(tree,'Add Customer').at(-1).props.onClick());
  assert.match(JSON.stringify(tree.toJSON()),new RegExp(addressFailure.message.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
  assert.equal(field(tree,'Enter customer name').props.value,'Retained synthetic contact');assert.equal(field(tree,'123 Main Street').props.value,'An unresolved address');
  assert.equal(buttons(tree,'Use suggested address').length,0);assert.equal(buttons(tree,'Add Customer').at(-1).props.disabled,false);
  await act(async()=>buttons(tree,'Cancel')[0].props.onClick());await act(async()=>buttons(tree,'Add Customer')[0].props.onClick());
  assert.equal(tree.root.findAll(node=>node.props['aria-label']==='Address validation').length,0);
  await act(async()=>tree.unmount());
});

test('customer background refresh retains all loaded cursor pages and the open editor save version',async()=>{
  const original=service.getCustomers;
  const pages=Array.from({length:200},(_,index)=>({id:`contact-${index}`,name:`Synthetic ${String(index).padStart(3,'0')}`,isActive:true,updatedAt:'saved-v1'}));
  const requests=[];
  service.getCustomers=async(limit,cursor)=>{requests.push({limit,cursor});const start=cursor?.offset||0;return{success:true,customers:pages.slice(start,start+100),lastDoc:{offset:start+100},hasMore:start+100<pages.length};};
  let tree;
  try{
    tree=await render('manager');await act(async()=>buttons(tree,'Load more customers')[0].props.onClick());
    assert.equal(icons(tree,'PencilIcon').length,200);
    await act(async()=>icons(tree,'PencilIcon')[0].parent.props.onClick());await change(tree,'Enter customer name','Unfinished contact edit');
    pages[0]={...pages[0],name:'Changed online',updatedAt:'saved-v2'};
    await act(async()=>workspaceHooks.useInvalidateWorkspace()(['customers']));
    assert.equal(field(tree,'Enter customer name').props.value,'Unfinished contact edit');assert.equal(dirty,true);
    assert.equal(icons(tree,'PencilIcon').length,200);
    assert.deepEqual(requests.slice(-2),[{limit:100,cursor:null},{limit:100,cursor:{offset:100}}]);
    await act(async()=>buttons(tree,'Save Changes')[0].props.onClick());assert.equal(updateRequests[0].expectedVersion,'saved-v1');
  }finally{if(tree)await act(async()=>tree.unmount());service.getCustomers=original;}
});
