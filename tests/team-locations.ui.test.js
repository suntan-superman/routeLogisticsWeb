const { test, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { createRequire } = require('node:module');
const mobileRequire = createRequire(path.resolve(__dirname, '../routeLogisticsMobile/package.json'));
const webRequire = createRequire(path.resolve(__dirname, '../routeLogisticsWeb/package.json'));
const React = mobileRequire('react'), { create, act } = mobileRequire('react-test-renderer'), { transformSync } = webRequire('esbuild');
global.IS_REACT_ACT_ENVIRONMENT = true;
global.document = { visibilityState: 'visible' };
let tree, owner, calls, result;
const modules = new Map();
function load(relative) {
  const file = path.resolve(__dirname, '../routeLogisticsWeb/src', relative);
  if (modules.has(file)) return modules.get(file);
  const module = { exports: {} };
  const mockRequire = name => {
    if (name === 'react') return React;
    if (name.endsWith('/AuthContext')) return { useAuth: () => ({ company: { id: 'acme', ownerId: 'owner' }, currentUser: { uid: owner ? 'owner' : 'manager' } }) };
    if (name.endsWith('/workspaceApi')) return { callWorkspace: async (name, data) => { calls.push({ name, data }); return result; } };
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
  owner=isOwner; calls=[]; result={ policy:{ intervalMinutes:3, retentionHours:24, maxShiftHours:12, freshAfterSeconds:300 }, locations:[], roster:[{memberId:'tech',name:'Tech 3',onDuty:true,dutyStatus:'on-duty',trackingState:'awaiting-fix',location:null}] };
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
