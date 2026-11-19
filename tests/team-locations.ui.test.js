const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const mobileRequire = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json'));
const webRequire = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobileRequire('react'), { create, act } = mobileRequire('react-test-renderer'), { transformSync } = webRequire('esbuild');
const {createWorkspaceQueryMock,selectControlMock}=require('./support/workspaceQueryMock.cjs');
const workspaceHooks=createWorkspaceQueryMock(React,{scopeId:'test-workspace'});
global.IS_REACT_ACT_ENVIRONMENT = true;
global.document = { visibilityState: 'visible' };
let tree, owner, calls, result, toasts, unsaved, failSave;
const modules = new Map();
function load(relative) {
  const file = path.resolve(__dirname, '../routeLogisticsWeb/src', relative);
  if (modules.has(file)) return modules.get(file);
  const module = { exports: {} };
  const mockRequire = name => {
    if (name === 'react') return React;
    if(name.endsWith('/useWorkspaceQuery'))return workspaceHooks;
    if(name.endsWith('/SelectControl'))return{__esModule:true,default:selectControlMock(React)};
    if(name.endsWith('/workspaceQueryPolicy'))return{workspaceAccessError:error=>['permission-denied','unauthenticated','not-found','workspace-changed'].includes(String(error?.code||'').split('/').pop())};
    if (name.endsWith('/StaffAvailabilityEditor')) return { __esModule: true, default: () => null };
    if (name === 'react-hot-toast') return { __esModule: true, default: { success: message => toasts.push({type:'success',message}), error: message => toasts.push({type:'error',message}) } };
    if (name.endsWith('/useUnsavedChanges')) return { useUnsavedChanges: dirty => { unsaved=dirty; return {confirmDiscard:async()=>true}; } };
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ company: { id: 'acme', ownerId: 'owner' }, currentUser: { uid: owner ? 'owner' : 'manager' } }) };
    if (name.endsWith('/workspaceApi')) return { callWorkspace: async (name, data) => { calls.push({ name, data }); if(name.startsWith('rlSetLocation')) { if(failSave) throw Error('Location policy unavailable'); result={...result,policy:{...result.policy,...(name==='rlSetLocationPolicy'?{intervalMinutes:data.intervalMinutes}:{retentionHours:data.hours})}}; } return result; } };
    if (name.endsWith('/maps')) return { loadMaps: async () => { throw Error('Tests must not make Maps requests.'); } };
    if (name.startsWith('.')) {
      const target=path.resolve(path.dirname(file),name), resolved=path.extname(name)?target:fs.existsSync(target+'.jsx')?target+'.jsx':target+'.js';
      return load(path.relative(path.resolve(__dirname,'../routeLogisticsWeb/src'),resolved));
    }
    throw Error('Unexpected dependency ' + name);
  };
  const { code } = transformSync(fs.readFileSync(file,'utf8'), { loader: file.endsWith('jsx') ? 'jsx' : 'js', format: 'cjs' });
  new Function('React','require','module','exports',code)(React,mockRequire,module,module.exports); modules.set(file,module.exports); return module.exports;
}
const Page = load('pages/TeamLocationsPage.jsx').default;
async function render(isOwner) {
  owner=isOwner; calls=[]; toasts=[]; unsaved=false; failSave=false; result={ policy:{ intervalMinutes:3, retentionHours:24, maxShiftHours:12, freshAfterSeconds:300 }, locations:[], roster:[{memberId:'tech',name:'Tech 3',onDuty:true,dutyStatus:'on-duty',trackingState:'awaiting-fix',location:null}] };
  await act(async()=>{ tree=create(React.createElement(Page)); });
}
const text = () => JSON.stringify(tree.toJSON());
afterEach(async()=>{ if(tree) await act(async()=>tree.unmount()); tree=null; });
test('manager sees on-duty roster without GPS but cannot edit owner cadence', async()=>{
  await render(false); assert.match(text(),/Tech 3|On duty|Waiting for first GPS fix/);
  assert.equal(tree.root.findAll(node=>node.props['aria-label']==='Owner location policy').length,0);
  assert.equal(calls.length,1); assert.equal(calls[0].name,'rlGetTeamLocations');
});
test('only owner interval control sends selected permitted cadence and no retention mutation',async()=>{
  await render(true);
  const select=tree.root.findByProps({'aria-label':'On-duty GPS update interval'});
  await act(async()=>select.props.onChange({target:{value:'5'}}));
  const button=tree.root.findAll(node=>node.type==='button'&&node.children.includes('Save interval'))[0];
  await act(async()=>button.props.onClick());
  assert.deepEqual(calls.find(call=>call.name==='rlSetLocationPolicy'),{name:'rlSetLocationPolicy',data:{companyId:'acme',intervalMinutes:5}});
  assert.equal(calls.some(call=>call.name==='rlSetLocationRetention'),false);
});

const button = label => tree.root.findAll(node=>node.type==='button'&&node.children.includes(label))[0];
test('unchanged and reverted location policy values disable Save and leave protection',async()=>{
  await render(true);assert.equal(button('Save interval').props.disabled,true);assert.equal(button('Save retention').props.disabled,true);assert.equal(unsaved,false);
  const select=tree.root.findByProps({'aria-label':'On-duty GPS update interval'});
  await act(async()=>select.props.onChange({target:{value:'5'}}));assert.equal(unsaved,true);
  await act(async()=>select.props.onChange({target:{value:'3'}}));assert.equal(button('Save interval').props.disabled,true);assert.equal(unsaved,false);
});
test('saving interval retains an independently unsaved retention change',async()=>{
  await render(true);
  await act(async()=>tree.root.findByProps({'aria-label':'On-duty GPS update interval'}).props.onChange({target:{value:'5'}}));
  await act(async()=>tree.root.findByProps({'aria-label':'Location history retention (hours)'}).props.onChange({target:{value:'48'}}));
  await act(async()=>button('Save interval').props.onClick());
  assert.equal(button('Save interval').props.disabled,true);assert.equal(button('Save retention').props.disabled,false);assert.equal(unsaved,true);
  assert.equal(tree.root.findByProps({'aria-label':'Location history retention (hours)'}).props.value,'48');
  await act(async()=>button('Save retention').props.onClick());assert.equal(unsaved,false);assert.equal(button('Save retention').props.disabled,true);assert.equal(toasts.length,2);
});
test('failed location policy saves retain edits and show an actionable toast',async()=>{
  await render(true);await act(async()=>tree.root.findByProps({'aria-label':'On-duty GPS update interval'}).props.onChange({target:{value:'5'}}));failSave=true;
  await act(async()=>button('Save interval').props.onClick());assert.equal(unsaved,true);assert.equal(button('Save interval').props.disabled,false);assert.deepEqual(toasts,[{type:'error',message:'Location policy unavailable'}]);
});
