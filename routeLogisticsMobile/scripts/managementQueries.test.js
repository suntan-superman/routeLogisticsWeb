const {test,beforeEach,afterEach}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
global.IS_REACT_ACT_ENVIRONMENT=true;
const root=path.resolve(__dirname,'..'),React=require(path.join(root,'node_modules/react')),{act,create}=require(path.join(root,'node_modules/react-test-renderer'));
const {QueryClient,QueryClientProvider}=require(path.join(root,'node_modules/@tanstack/react-query')),babel=require(path.join(root,'node_modules/@babel/core'));
let context,client,tree,result,requests,enabled,loader,registered,operationsCalls;
const file=path.join(root,'services/useManagementQueries.js'),moduleCache={exports:{}};
const transformed=babel.transformSync(fs.readFileSync(file,'utf8'),{filename:file,configFile:false,babelrc:false,plugins:[require.resolve(path.join(root,'node_modules/@babel/plugin-transform-modules-commonjs'))]});
new Function('require','module','exports',transformed.code)(name=>{
 if(name==='react')return React;if(name==='@tanstack/react-query')return require(path.join(root,'node_modules/@tanstack/react-query'));
 if(name.includes('WorkQueryProvider'))return{useWorkQueryScope:()=>context};if(name==='./workQueryPolicy')return require('../services/workQueryPolicy');
 if(name==='./managementOperations')return{readManagementJobs:async date=>{requests.push(['jobs',date]);return loader('jobs',date);},readManagementAttention:async()=>{requests.push(['attention']);return loader('attention');},readManagementTeam:async()=>{requests.push(['team']);return loader('team');},readManagementLocations:async()=>{requests.push(['locations']);return loader('locations');},readManagementRoute:async(id,date)=>{requests.push(['route',id,date]);return loader('route');}};
 throw Error(`Unexpected dependency: ${name}`);
},moduleCache,moduleCache.exports);
const {useManagementData}=moduleCache.exports;
function Probe(){result=useManagementData('2026-11-15',{enabled,canViewLocations:true});return null;}
async function settle(){for(let i=0;i<5;i++)await act(async()=>{await new Promise(done=>setTimeout(done,2));});}
async function render(){await act(async()=>{tree=create(React.createElement(QueryClientProvider,{client},React.createElement(Probe)));});await settle();}
async function update(){await act(async()=>tree.update(React.createElement(QueryClientProvider,{client},React.createElement(Probe))));await settle();}
beforeEach(()=>{
 tree=null;requests=[];registered=new Set();enabled=true;operationsCalls=[];loader=async name=>name==='jobs'?{jobs:[{id:'synthetic-acme'}]}:name==='attention'?{attention:{counts:{missed:0},jobIds:{missed:[]}},jobs:[]}:name==='team'?{team:[]}:{roster:[],locations:[]};
 const user={id:'owner',companyId:'acme',role:'owner',membershipId:null,emailVerified:true,workspace:{status:'company'}};
 context={user,scope:require('../services/workQueryPolicy').workScopeKey(user),active:true,online:true,canReadWork:true,accessStatus:'ready',registerVisibleQuery:key=>{const value=JSON.stringify(key);registered.add(value);return()=>registered.delete(value);},refreshAccess:async()=>({success:true,authoritative:true,user,accessStatus:'ready'})};
 client=new QueryClient({defaultOptions:{queries:{retry:false,gcTime:Infinity}}});
});
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());client.clear();assert.equal(registered.size,0);});
test('management queries share identity scope, selected date and visibility registration',async()=>{
 await render();assert.equal(requests.length,4);assert.equal(registered.size,4);assert.equal(result.jobs.data.jobs[0].id,'synthetic-acme');
 for(const query of client.getQueryCache().findAll()){assert.deepEqual(query.queryKey.slice(0,context.scope.length),context.scope);assert.equal(query.queryKey[context.scope.length],'management');}
 assert.deepEqual(requests.find(row=>row[0]==='jobs'),['jobs','2026-11-15']);
});
test('hidden, inactive, offline and unauthorized views cannot continue a management polling loop',async()=>{
 enabled=false;await render();assert.equal(requests.length,0);assert.equal(registered.size,0);
 enabled=true;context.active=false;await update();assert.equal(requests.length,0);
 context.active=true;await update();assert.equal(requests.length,4);
 const query=client.getQueryCache().findAll()[0];assert.equal(query.options.refetchInterval(query),30000);
 context.online=false;await update();assert.equal(query.options.refetchInterval(query),false);
 context.canReadWork=false;await update();assert.equal(result.jobs.data,undefined);assert.equal(query.options.refetchInterval(query),false);
});
test('tenant changes never return previous company data and permission errors hide stale successes',async()=>{
 await render();assert.equal(result.jobs.data.jobs[0].id,'synthetic-acme');
 const next={...context.user,companyId:'other'};context.user=next;context.scope=require('../services/workQueryPolicy').workScopeKey(next);loader=async name=>name==='jobs'?{jobs:[{id:'synthetic-other'}]}:name==='team'?{team:[]}:{roster:[],locations:[]};await update();assert.equal(result.jobs.data.jobs[0].id,'synthetic-other');
 loader=async()=>{throw Object.assign(new Error('Membership revoked'),{code:'functions/permission-denied'});};await act(async()=>{await result.jobs.refetch();});await settle();assert.equal(result.jobs.data,undefined);assert.match(result.jobs.error.message,/revoked/);
 const denied=client.getQueryCache().findAll().find(query=>query.queryKey.includes('other')&&query.queryKey.includes('jobs'));assert.equal(denied.options.refetchInterval(denied),false);
});
test('assignment wrapper retains server concurrency checks and never starts a shift or GPS',async()=>{
 const source=path.join(root,'services/managementOperations.js'),module={exports:{}};
 const code=babel.transformSync(fs.readFileSync(source,'utf8'),{filename:source,configFile:false,babelrc:false,plugins:[require.resolve(path.join(root,'node_modules/@babel/plugin-transform-modules-commonjs'))]}).code;
 new Function('require','module','exports',code)(name=>{assert.equal(name,'./workspaceApi');return{callWorkspace:async(name,data)=>{operationsCalls.push({name,data});return{available:true};},readWorkspace:async(resource,data)=>{operationsCalls.push({resource,data});return{jobs:[],hasMore:false};}};},module,module.exports);
 const job={id:'job',date:'2026-11-15',time:'09:00',estimatedDuration:1,updatedAt:'revision-one'};
 await module.exports.checkManagementAssignment(job,'manager');await module.exports.saveManagementAssignment(job,'manager');
 assert.equal(operationsCalls[0].name,'rlCheckAvailability');assert.equal(operationsCalls[1].name,'rlManageJob');assert.equal(operationsCalls[1].data.expectedVersion,'revision-one');assert.equal(operationsCalls[1].data.action,'assign');
 assert.equal(operationsCalls.some(call=>/Shift|Location/.test(call.name)),false);
});
