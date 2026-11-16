const {test,beforeEach,afterEach}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
global.IS_REACT_ACT_ENVIRONMENT=true;global.window=new EventTarget();global.document={visibilityState:'visible'};
const mobile=createRequire(path.resolve(__dirname,'../routeLogisticsMobile/package.json')),web=createRequire(path.resolve(__dirname,'../routeLogisticsWeb/package.json'));
const React=mobile('react'),{create,act}=mobile('react-test-renderer'),queries=mobile('@tanstack/react-query'),{transformSync}=web('esbuild');
const {QueryClient,QueryClientProvider,focusManager,onlineManager}=queries;
let tree,client,env,hooks,seen,modules;
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};};
async function until(check){for(let count=0;count<150&&!check();count++)await act(async()=>pause(5));assert.ok(check(),'Principal query condition was not reached.');}
function load(relative){
 const file=path.resolve(__dirname,'../routeLogisticsWeb/src',relative);if(modules.has(file))return modules.get(file).exports;
 const module={exports:{}};modules.set(file,module);
 // Keep real query behavior while disabling retention timers in this Node
 // renderer. The hook's explicit unmount cache removal is still asserted.
 const importer=name=>{if(name==='react')return React;if(name==='@tanstack/react-query')return{...queries,useQuery:options=>queries.useQuery({...options,gcTime:Infinity})};if(name.startsWith('.')){const target=path.resolve(path.dirname(file),name);return load(path.relative(path.resolve(__dirname,'../routeLogisticsWeb/src'),path.extname(target)?target:target+'.js'));}throw Error('Unexpected principal-query dependency '+name);};
 new Function('require','module','exports',transformSync(fs.readFileSync(file,'utf8'),{loader:'js',format:'cjs'}).code)(importer,module,module.exports);return module.exports;
}
function Control({namespace,uid,intervalMs=false,enabled=true}){
 const query=hooks.usePrincipalQuery(namespace,uid,['records'],async()=>{env.calls.push({namespace,uid});return env.loader(namespace,uid);},{intervalMs,enabled,current:value=>env.currentUid===value});
 const[draft,setDraft]=React.useState('');seen[namespace]=query;
 return React.createElement('input',{'aria-label':namespace,value:draft,onChange:event=>setDraft(event.target.value)});
}
async function render(uid=env.currentUid,namespaces=['rl-customer-portal'],intervalMs=false,enabled=true){
 const children=namespaces.map(namespace=>React.createElement(Control,{key:namespace,namespace,uid,intervalMs,enabled}));
 await act(async()=>{const view=React.createElement(QueryClientProvider,{client},...children);if(tree)tree.update(view);else tree=create(view);});
}
beforeEach(()=>{tree=null;seen={};modules=new Map();env={currentUid:'one',calls:[],value:'First authorized snapshot',loader:async()=>({value:env.value})};client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});hooks=load('hooks/usePrincipalQuery.js');focusManager.setFocused(true);onlineManager.setOnline(true);});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());client.clear();focusManager.setFocused(true);onlineManager.setOnline(true);});

test('customer, platform and payment authorities use independent caches even for the same Firebase UID',async()=>{
 env.loader=async namespace=>({value:namespace});const namespaces=['rl-customer-portal','rl-platform-content','rl-payments:portal','rl-payments:staff'];
 await render('one',namespaces);await until(()=>namespaces.every(namespace=>seen[namespace].data));
 for(const namespace of namespaces)assert.equal(seen[namespace].data.value,namespace);
 assert.equal(client.getQueryCache().getAll().length,4);assert.equal(env.calls.length,4);
});

test('a late prior-account response and stale cache setter cannot populate the new principal',async()=>{
 const pending=deferred();env.loader=()=>pending.promise;await render();await until(()=>env.calls.length===1);const old=seen['rl-customer-portal'];
 env.currentUid='two';env.loader=async()=>({value:'Current account records'});await render();await until(()=>seen['rl-customer-portal'].data?.value==='Current account records');
 await act(async()=>{old.setData({value:'Stale account private records'});pending.resolve({value:'Prior account private records'});});await act(async()=>pause(20));
 assert.equal(seen['rl-customer-portal'].data.value,'Current account records');
 assert.doesNotMatch(JSON.stringify(client.getQueryCache().getAll().map(query=>query.state.data)),/Stale account|Prior account/);
});

test('principal authorization denial hides prior records and stops automatic and focus retries',async()=>{
 await render('one',['rl-customer-portal'],20);await until(()=>seen['rl-customer-portal'].data);
 env.loader=async()=>{throw Object.assign(Error('Customer association revoked'),{code:'functions/permission-denied'});};
 await act(async()=>seen['rl-customer-portal'].refetch());await until(()=>seen['rl-customer-portal'].error&&seen['rl-customer-portal'].data===undefined);
 const denied=env.calls.length;window.dispatchEvent(new Event('focus'));await act(async()=>pause(65));assert.equal(env.calls.length,denied);
});

test('principal background refresh preserves a local draft and pauses while hidden or offline',async()=>{
 await render('one',['rl-customer-portal'],20);await until(()=>seen['rl-customer-portal'].data);
 await act(async()=>tree.root.findByType('input').props.onChange({target:{value:'Unsent customer feedback'}}));env.value='New authorized visit';
 await until(()=>seen['rl-customer-portal'].data?.value==='New authorized visit');assert.equal(tree.root.findByType('input').props.value,'Unsent customer feedback');
 focusManager.setFocused(false);await act(async()=>pause(25));const hidden=env.calls.length;await act(async()=>pause(45));assert.equal(env.calls.length,hidden);
 onlineManager.setOnline(false);focusManager.setFocused(true);await act(async()=>pause(30));const offline=env.calls.length;await act(async()=>pause(45));assert.equal(env.calls.length,offline);
 env.value='Reconnected visit';onlineManager.setOnline(true);await until(()=>seen['rl-customer-portal'].data?.value==='Reconnected visit');
});

test('signed-out and disabled principals issue no reads, and unmount removes their private cache',async()=>{
 env.currentUid='';await render('');await act(async()=>pause(15));assert.equal(env.calls.length,0);
 env.currentUid='one';await render('one',['rl-customer-portal'],false,false);await act(async()=>pause(15));assert.equal(env.calls.length,0);
 await render();await until(()=>seen['rl-customer-portal'].data);await act(async()=>tree.unmount());tree=null;assert.equal(client.getQueryCache().getAll().length,0);
});
