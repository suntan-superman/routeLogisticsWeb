const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createQuickBooksSandboxTransport, COMPANY_ID, REALM_ID, COMPANY_NAME } = require('../scripts/lib/quickbooksSandboxTransport');
const base = `https://sandbox-quickbooks.api.intuit.com/v3/company/${REALM_ID}/`;
const headers = { Authorization: 'Bearer fixture-access', 'Content-Type':'application/json' };
const verified = { companyId:COMPANY_ID,realmId:REALM_ID,companyName:COMPANY_NAME,environment:'sandbox',credentialEnvironment:'sandbox',legacyConsumersAbsent:true };
async function fixture(overrides = {}) {
  const calls=[],audits=[];
  const gate=createQuickBooksSandboxTransport({companyId:COMPANY_ID,realmId:REALM_ID,runId:'guard01',expiresAt:Date.now()+600000,fetchImpl:async(url,options)=>{
    calls.push({url,options});const resource=new URL(url).pathname.split('/').at(-1),body=options.body&&options.method!=='GET'?JSON.parse(options.body):null;
    if(resource===REALM_ID)return Response.json({CompanyInfo:{Id:'1',CompanyName:COMPANY_NAME}});
    if(url.includes('/tokens/bearer'))return Response.json({access_token:'fixture-new-access',refresh_token:'fixture-new-refresh'});
    const key=resource==='customer'?'Customer':resource==='invoice'?'Invoice':resource==='payment'?'Payment':'QueryResponse';
    return Response.json({[key]:{...body,Id:resource==='customer'?'11':resource==='invoice'?'22':'33'}});
  },audit:async row=>audits.push(row),...overrides});
  const send=(resource,body,auth=headers)=>gate.transport(base+resource+'?requestid=0123456789abcdef',{method:'POST',headers:auth,body:JSON.stringify(body)});
  const customer=()=>({DisplayName:gate.labelPrefix+' customer',PrimaryEmailAddr:{Address:'cert@example.invalid'}});
  const invoice=()=>({CustomerRef:{value:'11'},DocNumber:gate.labelPrefix+'-I',TxnDate:'2026-11-14',DueDate:'2026-11-21',CurrencyRef:{value:'USD'},Line:[{Amount:35,DetailType:'SalesItemLineDetail',SalesItemLineDetail:{ItemRef:{value:'7'},Qty:2,UnitPrice:17.5}}]});
  const payment=()=>({CustomerRef:{value:'11'},PaymentRefNum:gate.labelPrefix+'-P',TxnDate:'2026-11-14',TotalAmt:10,CurrencyRef:{value:'USD'},ProcessPayment:false,Line:[{Amount:10,LinkedTxn:[{TxnType:'Invoice',TxnId:'22'}]}]});
  const arm=async()=>{await gate.transport(base+`companyinfo/${REALM_ID}`,{headers});gate.arm(verified);};
  return{gate,calls,audits,send,customer,invoice,payment,arm};
}

test('sandbox writes remain disabled without real scoped company-info verification',async()=>{
  const f=await fixture();assert.equal(f.gate.writesEnabled(),false);assert.throws(()=>f.gate.arm(verified),/verification is incomplete/);assert.equal(f.calls.length,0);
  const g=await fixture();await assert.rejects(g.send('customer',g.customer()),/request denied/);assert.equal(g.calls.length,0);assert.equal(g.audits.at(-1).outcome,'denied');
});
test('sandbox gate validates tenant, realm, credential environment and bounded lifetime',async()=>{
  assert.throws(()=>createQuickBooksSandboxTransport({companyId:'foreign',realmId:REALM_ID,runId:'abc'}),/Invalid sandbox/);
  assert.throws(()=>createQuickBooksSandboxTransport({companyId:COMPANY_ID,realmId:'1',runId:'abc'}),/Invalid sandbox/);
  assert.throws(()=>createQuickBooksSandboxTransport({companyId:COMPANY_ID,realmId:REALM_ID,runId:'too-long-run-id'}),/Invalid sandbox/);
  assert.throws(()=>createQuickBooksSandboxTransport({companyId:COMPANY_ID,realmId:REALM_ID,runId:'abc',expiresAt:Date.now()+3600000}),/Invalid sandbox/);
  const f=await fixture();await f.gate.transport(base+`companyinfo/${REALM_ID}`,{headers});assert.throws(()=>f.gate.arm({...verified,credentialEnvironment:'production'}),/verification/);
});
test('an active or unverified legacy realm consumer blocks certification even after sandbox company verification',async()=>{
  for(const value of [undefined,false]){
    const f=await fixture();await f.gate.transport(base+`companyinfo/${REALM_ID}`,{headers});
    const verification={...verified};if(value===undefined)delete verification.legacyConsumersAbsent;else verification.legacyConsumersAbsent=value;
    assert.throws(()=>f.gate.arm(verification),/legacy consumer of this realm blocks sandbox certification/);
    assert.equal(f.gate.writesEnabled(),false);const before=f.calls.length;
    await assert.rejects(f.send('customer',f.customer()),/request denied/);assert.equal(f.calls.length,before);
  }
});
test('production URLs, foreign realms, token query strings and account/item mutation never reach provider',async()=>{
  for(const path of ['https://quickbooks.api.intuit.com/v3/company/'+REALM_ID+'/customer',base.replace(REALM_ID,'123')+'customer',base+'item?requestid=0123456789abcdef',base+'account?requestid=0123456789abcdef']){
    const f=await fixture();await f.arm();const before=f.calls.length;await assert.rejects(f.gate.transport(path,{method:'POST',headers,body:JSON.stringify(f.customer())}),/denied/);assert.equal(f.calls.length,before);assert.equal(f.gate.writesEnabled(),false);
  }
  const f=await fixture();await assert.rejects(f.gate.transport(base+'query?query=SELECT%20*%20FROM%20Item&access_token=fixture',{headers}),/denied/);assert.equal(f.calls.length,0);
});
test('only synthetic customers, invoices and linked non-processing payments are writable',async()=>{
  const f=await fixture();await f.arm();await f.send('customer',f.customer());assert.equal(f.gate.allowCustomer('11'),'11');
  await f.send('invoice',f.invoice());assert.equal(f.gate.allowInvoice('22'),'22');await f.send('payment',f.payment());
  assert.equal(f.gate.getSummary().writeAttempts,3);assert.equal(f.gate.getSummary().verifiedCustomers,1);assert.equal(f.gate.getSummary().verifiedInvoices,1);
  assert.ok(f.calls.every(call=>call.options.redirect==='error'));
});
test('malformed synthetic scopes, real email, foreign customer/invoice and processing fields fail closed',async()=>{
  for(const scenario of ['email','name','customer','invoice','process','bank','amount','currency','missing-request-id']){
    const f=await fixture();await f.arm();await f.send('customer',f.customer());await f.send('invoice',f.invoice());let resource='payment',body=f.payment();
    if(scenario==='email'){resource='customer';body={...f.customer(),PrimaryEmailAddr:{Address:'real@example.com'}};}
    if(scenario==='name'){resource='customer';body={...f.customer(),DisplayName:'Existing customer'};}
    if(scenario==='customer')body.CustomerRef.value='999';
    if(scenario==='invoice')body.Line[0].LinkedTxn[0].TxnId='999';
    if(scenario==='process')body.ProcessPayment=true;
    if(scenario==='bank')body.BankAccountRef={value:'4'};
    if(scenario==='amount')body.TotalAmt=101;
    if(scenario==='currency')body.CurrencyRef.value='EUR';
    const before=f.calls.length;
    await assert.rejects(scenario==='missing-request-id'?f.gate.transport(base+resource,{method:'POST',headers,body:JSON.stringify(body)}):f.send(resource,body),/denied/);
    assert.equal(f.calls.length,before);assert.equal(f.gate.writesEnabled(),false);
  }
});
test('arbitrary existing customer/invoice IDs cannot be manually allowlisted',async()=>{
  const f=await fixture();await f.arm();assert.throws(()=>f.gate.allowCustomer('888'),/not verified/);assert.equal(f.gate.writesEnabled(),false);
  const g=await fixture();await g.arm();assert.throws(()=>g.gate.allowInvoice('999'),/not verified/);
});
test('a different bearer cannot borrow verified sandbox write authority',async()=>{
  const f=await fixture();await f.arm();const before=f.calls.length;await assert.rejects(f.send('customer',f.customer(),{...headers,Authorization:'Bearer other-fixture'}),/denied/);assert.equal(f.calls.length,before);
});
test('refresh-only token requests remain available before arming but cannot exchange authorization codes or revoke',async()=>{
  const f=await fixture({fetchImpl:async()=>Response.json({access_token:'fixture-new-access',refresh_token:'fixture-new-refresh'})});
  await f.gate.transport('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',{method:'POST',headers:{Authorization:'Basic fixture'},body:'grant_type=refresh_token&refresh_token=fixture'});assert.equal(f.gate.getSummary().refreshes,1);assert.equal(f.gate.writesEnabled(),false);
  for(const url of ['https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer','https://developer.api.intuit.com/v2/oauth2/tokens/revoke']){
    const g=await fixture();await assert.rejects(g.gate.transport(url,{method:'POST',headers:{Authorization:'Basic fixture'},body:'grant_type=authorization_code&code=fixture'}),/denied/);assert.equal(g.calls.length,0);
  }
});
test('successful refresh clears the verified bearer and disables an armed capability',async()=>{
  const f=await fixture({fetchImpl:async(url)=>url.includes('/companyinfo/')?Response.json({CompanyInfo:{Id:'1',CompanyName:COMPANY_NAME}}):Response.json({access_token:'fixture-new-access',refresh_token:'fixture-new-refresh'})});await f.arm();
  await f.gate.transport('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',{method:'POST',headers:{Authorization:'Basic fixture'},body:'grant_type=refresh_token&refresh_token=fixture'});assert.equal(f.gate.writesEnabled(),false);
});
test('write budget, expiry and explicit cleanup restore disabled state without changing deployed configuration',async()=>{
  const f=await fixture({maxWrites:1});await f.arm();await f.send('customer',f.customer());assert.equal(f.gate.writesEnabled(),false);await assert.rejects(f.send('customer',f.customer()),/denied/);
  const g=await fixture();await g.arm();await g.gate.disarm();assert.equal(g.gate.writesEnabled(),false);assert.throws(()=>g.gate.arm(verified),/verification/);assert.equal(g.audits.at(-1).outcome,'disabled');
  const original=Date.now;let now=original();try{Date.now=()=>now;const h=await fixture({expiresAt:now+1000});await h.arm();now+=1001;assert.equal(h.gate.writesEnabled(),false);await assert.rejects(h.send('customer',h.customer()),/denied/);}finally{Date.now=original;}
});
test('audit entries never contain authorization headers, body fields or token response payloads',async()=>{
  const f=await fixture();await f.arm();await f.send('customer',f.customer());await f.gate.disarm();
  assert.ok(f.audits.every(row=>Object.keys(row).every(key=>['runId','method','resource','outcome','httpStatus'].includes(key))));
  assert.doesNotMatch(JSON.stringify(f.audits),/fixture-access|DisplayName|PrimaryEmailAddr|cert@example|Authorization/);assert.doesNotMatch(JSON.stringify(f.gate.getSummary()),/fixture-access|cert@example/);
});
test('audit failure prevents provider mutation and transport exceptions are sanitized',async()=>{
  const f=await fixture();await f.arm();const broken=await fixture({audit:async()=>{throw Error('fixture-private-token');}});await assert.rejects(broken.gate.transport(base+'item/7',{headers}),/audit logging failed/);assert.equal(broken.calls.length,0);
  const g=await fixture({fetchImpl:async()=>{throw Error('fixture-private-token');}});await assert.rejects(g.gate.transport(base+'item/7',{headers}),error=>{assert.doesNotMatch(error.message,/fixture-private-token/);return true;});
});
