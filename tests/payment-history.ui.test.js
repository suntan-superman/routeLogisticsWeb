const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const mobile=createRequire(path.resolve(__dirname,'../routeLogisticsMobile/package.json')),web=createRequire(path.resolve(__dirname,'../routeLogisticsWeb/package.json'));
const React=mobile('react'),{create,act}=mobile('react-test-renderer'),{transformSync}=web('esbuild');
const {createPrincipalQueryMock}=require('./support/principalQueryMock.cjs');const principalHooks=createPrincipalQueryMock(React);
global.IS_REACT_ACT_ENVIRONMENT=true;
const staffApp={name:'staff-app'},portalApp={name:'customer-portal'},staffClient={app:staffApp},portalClient={app:portalApp};
const staffAuth={currentUser:{uid:'staff-user'}},portalAuth={currentUser:{uid:'customer-user'}};
let tree,calls=[],authReads=[],listeners=new Map(),failure=null,pending=null;
const importer=name=>{
 if(name==='react')return React;
 if(name.endsWith('/usePrincipalQuery'))return principalHooks;
 if(name.endsWith('/services/firebase'))return{functions:staffClient};
 if(name==='firebase/auth')return{getAuth:app=>{authReads.push(app);return app===portalApp?portalAuth:staffAuth;},onAuthStateChanged:(auth,listener)=>{listeners.set(auth,listener);return()=>listeners.delete(auth);}};
 if(name==='firebase/functions')return{httpsCallable:(client,endpoint)=>async params=>{calls.push({client,endpoint,params});if(pending)return pending;if(failure)throw failure;return{data:{history:[{id:'test-payment',status:'succeeded',mode:'test',amount:2500,type:'payment_intent.succeeded'}]}};}};
 throw Error('Unexpected payment history dependency '+name);
};
const moduleValue={exports:{}};new Function('React','require','module','exports',transformSync(fs.readFileSync(path.resolve(__dirname,'../routeLogisticsWeb/src/components/PaymentHistory.jsx'),'utf8'),{loader:'jsx',format:'cjs'}).code)(React,importer,moduleValue,moduleValue.exports);
const History=moduleValue.exports.default,text=()=>JSON.stringify(tree.toJSON());
async function render(client=portalClient){await act(async()=>{tree=create(React.createElement(History,{invoiceId:'dedicated-test-invoice',functionClient:client}));});}
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;calls=[];authReads=[];listeners=new Map();failure=null;pending=null;staffAuth.currentUser={uid:'staff-user'};portalAuth.currentUser={uid:'customer-user'};});

test('payment history authenticates against the supplied portal app rather than the staff app',async()=>{
 await render();assert.ok(authReads.length);assert.ok(authReads.every(app=>app===portalApp));assert.equal(calls.length,1);assert.equal(calls[0].client,portalClient);assert.deepEqual(calls[0].params,{invoiceId:'dedicated-test-invoice'});assert.match(text(),/TEST|25.00/);
});
test('portal sign-out removes cached payment history even while a staff account remains signed in',async()=>{
 await render();portalAuth.currentUser=null;await act(async()=>listeners.get(portalAuth)(null));assert.ok(staffAuth.currentUser);assert.doesNotMatch(text(),/25.00|succeeded/);assert.equal(calls.length,1);
});
test('a failed authorization refresh hides previous payment records and exposes its actual error',async()=>{
 await render();failure=Object.assign(Error('Invoice access revoked'),{code:'functions/permission-denied'});await act(async()=>principalHooks.refresh(['rl-payments:customer-portal']));assert.match(text(),/Invoice access revoked/);assert.doesNotMatch(text(),/25.00|succeeded/);
});
