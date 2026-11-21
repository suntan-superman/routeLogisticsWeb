const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{createRequire}=require('node:module');
const mobile=createRequire(path.resolve(__dirname,'../routeLogisticsMobile/package.json')),web=createRequire(path.resolve(__dirname,'../routeLogisticsWeb/package.json'));
const React=mobile('react'),{create,act}=mobile('react-test-renderer'),{transformSync}=web('esbuild');
const {createWorkspaceQueryMock}=require('./support/workspaceQueryMock.cjs');const workspaceHooks=createWorkspaceQueryMock(React);
global.IS_REACT_ACT_ENVIRONMENT=true;
let tree,failure=null,pending=null,queries=[],invoiceCalls=[],invoiceCall=async()=>{throw Error('No invoice mutation is authorized in this suite.');};
const record={id:'synthetic-invoice',invoiceNumber:'INV-SYNTHETIC',customerName:'Synthetic customer',dueDate:'2030-01-02',status:'sent',total:100};
const importer=name=>{
 if(name==='react')return React;
 if(name==='react-hot-toast')return{__esModule:true,default:{success(){},error(){}}};
 if(name.endsWith('/useWorkspaceQuery'))return workspaceHooks;
 if(name.endsWith('/workspaceQueryPolicy'))return{workspaceAccessError:error=>['permission-denied','unauthenticated'].includes(String(error?.code||'').split('/').pop())};
 if(name.endsWith('/services/tenancy')||name==='./tenancy')return{canManage:()=>true,can:()=>true,scopeWhere:()=>({companyId:'synthetic-company'})};
 if(name.endsWith('/services/invoiceService'))return service;
 if(name.endsWith('/services/invoiceMath')||name==='./invoiceMath')return{isOverdue:()=>false};
 if(name.endsWith('/ConfirmProvider'))return{useConfirm:()=>async()=>true};
 if(name.endsWith('/AuthContext'))return{useAuth:()=>({userProfile:{businessName:'Synthetic provider'}})};
 if(name.endsWith('/services/workspaceApi')||name==='./workspaceApi')return{callWorkspace:(...args)=>invoiceCall(...args)};
 if(name.endsWith('/paymentConfig'))return{paymentsConfigured:false,paymentMode:'test'};
 if(name.endsWith('/InvoicePayment')||name.endsWith('/PaymentHistory')||name.endsWith('/InvoiceCreationDialog')||name.endsWith('/InvoiceLedgerDialog')||name.endsWith('/InvoiceEditorDialog'))return{__esModule:true,default:()=>null};
 if(name==='./firebase')return{db:{}};
 if(name==='firebase/firestore')return{
  collection:(_db,collectionId)=>({collectionId}),query:(...parts)=>parts,orderBy:(field,direction)=>({field,direction}),limit:max=>({max}),
  getDocs:()=>{throw Error('An invoice list must not silently fall back to its empty offline cache.');},
  getDocsFromServer:async query=>{queries.push(query);if(pending)return pending;if(failure)throw failure;return{docs:[{id:record.id,data:()=>({...record,id:'legacy-stored-alias'})}]};},
 };
 throw Error('Unexpected invoice query dependency '+name);
};
function compile(relative){const module={exports:{}};new Function('React','require','module','exports',transformSync(fs.readFileSync(path.resolve(__dirname,'../routeLogisticsWeb/src',relative),'utf8'),{loader:relative.endsWith('.jsx')?'jsx':'js',format:'cjs'}).code)(React,importer,module,module.exports);return module.exports;}
const service=compile('services/invoiceService.js'),Page=compile('pages/InvoicesPage.jsx').default;
const text=()=>JSON.stringify(tree.toJSON());
async function render(){await act(async()=>{tree=create(React.createElement(Page));});}
async function refresh(){await act(async()=>workspaceHooks.useInvalidateWorkspace()(['invoices']));}
afterEach(async()=>{if(tree)await act(async()=>tree.unmount());tree=null;failure=null;pending=null;queries=[];invoiceCalls=[];invoiceCall=async()=>{throw Error('No invoice mutation is authorized in this suite.');};delete record.financialVersion;delete record.issuedSnapshot;delete record.revision;record.status='sent';});

test('invoice email requires recipient review and shows the actual queued delivery state',async()=>{
 record.financialVersion=2;record.status='issued';record.issuedSnapshot={fingerprint:'synthetic'};record.revision=3;
 invoiceCall=async(name,data)=>{invoiceCalls.push({name,data});return data.action==='status'?{recipient:'customer@example.invalid',delivery:invoiceCalls.length>1?{status:'queued'}:null}:{queued:true,status:'queued',recipient:'customer@example.invalid'};};
 await render();
 const click=async label=>act(async()=>tree.root.findAll(node=>node.type==='button'&&node.children.join('')===label)[0].props.onClick());
 await click('Email PDF');assert.match(text(),/customer@example.invalid/);assert.equal(invoiceCalls.filter(call=>call.data.action!=='status').length,0);
 await click('Send invoice PDF');assert.equal(invoiceCalls.filter(call=>call.data.action!=='status').length,1);assert.match(text(),/Delivery is in progress/);
});

test('invoice list requires a tenant-scoped server snapshot and retains its service response contract',async()=>{
 const result=await service.listInvoices();assert.deepEqual(result,{success:true,invoices:[record]});
 assert.equal(result.invoices[0].id,record.id,'The canonical document ID must override a mismatching historical stored id');
 assert.deepEqual(queries[0],[{collectionId:'invoices'},{companyId:'synthetic-company'},{field:'createdAt',direction:'desc'},{max:200}]);
});
test('a disconnected first invoice load shows loading and then an actionable error rather than a false empty success',async()=>{
 let reject;pending=new Promise((_resolve,no)=>{reject=no;});await render();assert.match(text(),/Loading…/);assert.doesNotMatch(text(),/No invoices/);
 const original=console.error;console.error=()=>{};
 try{await act(async()=>reject(Object.assign(Error('Invoice server unavailable. Reconnect and retry.'),{code:'unavailable'})));}finally{console.error=original;}
 assert.match(text(),/Invoice server unavailable/);assert.doesNotMatch(text(),/No invoices/);assert.ok(tree.root.findAll(node=>node.type==='button'&&node.children.join('')==='Retry invoice refresh')[0]);
});
test('a failed invoice background refresh retains confirmed amounts and exposes a retry without reporting success',async()=>{
 await render();assert.match(text(),/INV-SYNTHETIC/);assert.match(text(),/100.00/);
 failure=Object.assign(Error('Invoice server unavailable. Reconnect and retry.'),{code:'unavailable'});const original=console.error;console.error=()=>{};
 try{await refresh();const result=await service.listInvoices();assert.equal(result.success,false);assert.equal(result.code,'unavailable');}finally{console.error=original;}
 assert.match(text(),/INV-SYNTHETIC/);assert.match(text(),/100.00/);assert.match(text(),/Invoice server unavailable/);
 failure=null;await act(async()=>tree.root.findAll(node=>node.type==='button'&&node.children.join('')==='Retry invoice refresh')[0].props.onClick());assert.doesNotMatch(text(),/Invoice server unavailable/);assert.match(text(),/INV-SYNTHETIC/);
});
