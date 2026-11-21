const { test } = require('node:test');
const assert = require('node:assert/strict');
const { imageType, validatedBytes, ownedPath, loadLogo } = require('./companyLogo');
const { createEstimatePdf } = require('./estimates');

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lZkAAAAASUVORK5CYII=', 'base64');
const path = 'rlCompanyLogos/company-a/11111111-1111-4111-8111-111111111111.png';

test('logo bytes, MIME type, size and tenant path are validated', async () => {
  assert.equal(imageType(png), 'image/png');
  assert.deepEqual(validatedBytes(png.toString('base64'), 'image/png'), png);
  assert.throws(() => validatedBytes(png.toString('base64'), 'image/jpeg'), { code: 'invalid-argument' });
  assert.throws(() => validatedBytes(Buffer.alloc(1024 * 1024 + 1).toString('base64'), 'image/png'), { code: 'invalid-argument' });
  assert.equal(ownedPath(path, 'company-a'), true);
  assert.equal(ownedPath(path, 'company-b'), false);
  assert.equal(ownedPath('rlCompanyLogos/company-a/../company-b/logo.png', 'company-a'), false);
  let reads = 0;
  const bucket = { file: value => { reads++; assert.equal(value, path); return { getMetadata: async () => [{ size: png.length, contentType: 'image/png' }], download: async () => [png] }; } };
  assert.equal((await loadLogo(path, 'company-a', bucket)).bytes.equals(png), true);
  assert.equal(await loadLogo(path, 'company-b', bucket), null);
  assert.equal(reads, 1);
});

test('private logo is embedded in the existing estimate PDF path', async () => {
  const logo = { bytes: png, contentType: 'image/png' };
  const estimateBytes = await createEstimatePdf({ estimateNumber: 'TEST-1', version: 1, title: 'Synthetic estimate', recipient: { name: 'Synthetic Customer' }, validUntil: '2026-12-01',
    scopeOfWork: 'Synthetic work', lineItems: [], subtotalCents: 0, taxRate: 0, taxCents: 0, totalCents: 0 }, { name: 'Synthetic Company' }, [], logo);
  assert.match(estimateBytes.toString('latin1'), /\/Subtype\s*\/Image/);
});
