import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isInvitationReturn, mayReviewCompanySetup } from './companySetupAccess.js';

test('company setup review is restricted to owners and administrators', () => {
  assert.equal(mayReviewCompanySetup('owner'), true);
  assert.equal(mayReviewCompanySetup('admin'), true);
  assert.equal(mayReviewCompanySetup('manager'), false);
  assert.equal(mayReviewCompanySetup('technician'), false);
});

test('invitation signup remains separate from new-company onboarding', () => {
  assert.equal(isInvitationReturn('/accept-invite?id=one#code=abc'), true);
  assert.equal(isInvitationReturn('/onboarding'), false);
  assert.equal(isInvitationReturn(null), false);
});
