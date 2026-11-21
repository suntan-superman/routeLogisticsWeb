const { test } = require('node:test');
const assert = require('node:assert/strict');
const { customerUid, otpHash, publicJob, publicInvoice, portalHandlers, portalEmailFor, PORTAL_SESSION_LIFETIME } = require('./portal');

test('portal identities are normalized, deterministic and isolated from team account UIDs', () => {
  assert.equal(customerUid(' Customer@Example.test '), customerUid('customer@example.test'));
  assert.match(customerUid('customer@example.test'), /^rl_customer_[a-f0-9]{64}$/);
  assert.notEqual(customerUid('customer@example.test'), customerUid('another@example.test'));
});

test('OTP hashes bind a six-digit code to a single challenge', () => {
  assert.match(otpHash('a'.repeat(48), '123456'), /^[a-f0-9]{64}$/);
  assert.notEqual(otpHash('a'.repeat(48), '123456'), otpHash('b'.repeat(48), '123456'));
});

test('portal jobs and invoices expose an explicit public field whitelist', () => {
  const job = publicJob('job', { serviceType:'Pest control', date:'2026-11-14', time:'10:00', status:'completed', notes:'Private technician note', assignedTo:'staff', customerId:'customer', companyId:'private-company', storagePath:'private' });
  assert.deepEqual(Object.keys(job).sort(), ['date','id','serviceType','status','time']);
  assert.equal(publicInvoice('legacy', { invoiceNumber:'OLD-1', status:'sent', total:20 }), null);
  const invoice = publicInvoice('invoice', { financialVersion:2, invoiceNumber:'TEST-1', totalCents:2000, paidCents:0, creditCents:0, balanceCents:2000, status:'issued', issuedSnapshot:{invoiceNumber:'TEST-1', totalCents:2000, lineItems:[{description:'Service',quantity:1,unitPriceCents:2000,amountCents:2000,internalCost:2}]}, companyId:'private', stripePaymentId:'secret-reference', bankAccount:'private', notes:'Private' });
  assert.equal(invoice.stripePaymentId, undefined);assert.equal(invoice.companyId, undefined);assert.equal(invoice.notes, undefined);assert.equal(invoice.lineItems[0].internalCost, undefined);
});

test('portal-only operations reject team users, missing sessions and mismatched UID/email claims before database reads', async () => {
  const handlers = portalHandlers({}, {});
  for (const auth of [undefined, {uid:'staff',token:{email:'customer@example.test'}}, {uid:'staff',token:{portal:true,portalEmail:'customer@example.test'}}, {uid:customerUid('one@example.test'),token:{portal:true,portalEmail:'two@example.test'}}]) {
    await assert.rejects(handlers.getCustomerPortal({auth}), {code:'unauthenticated'});
    await assert.rejects(handlers.getCustomerPortalFile({auth}), {code:'unauthenticated'});
  }
});

test('a real portal token requires a fresh email-code sign-in after 24 hours', () => {
  const email='customer@example.test',uid=customerUid(email),now=Math.floor(Date.now()/1000);
  assert.equal(portalEmailFor({auth:{uid,token:{portal:true,portalEmail:email,auth_time:now}}}),email);
  assert.throws(()=>portalEmailFor({auth:{uid,token:{portal:true,portalEmail:email,auth_time:Math.floor((Date.now()-PORTAL_SESSION_LIFETIME-1000)/1000)}}}),{code:'unauthenticated'});
});

test('email-disabled portal cannot issue or verify OTPs', async () => {
  const handlers = portalHandlers({}, {}, () => false);
  await assert.rejects(handlers.requestCustomerOTP({data:{email:'customer@example.test'}}), {code:'failed-precondition'});
  await assert.rejects(handlers.verifyCustomerOTP({data:{}}), {code:'failed-precondition'});
});
