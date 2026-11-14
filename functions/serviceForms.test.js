const { test } = require('node:test');
const assert = require('node:assert/strict');
const { BUILTINS } = require('./serviceForms');
const { validateTemplate, validateAnswers, serviceReport } = require('./shared/serviceFormSchema');
const pool = BUILTINS.find(row => row.id === 'pool-maintenance');
test('eight versioned industry starters retain the specialized pest chemical log separately', () => {
  assert.equal(BUILTINS.length, 8); assert.equal(BUILTINS.filter(row => row.status === 'starter').length, 2);
  assert.ok(BUILTINS.every(row => row.version === 1 && row.fields.length > 0));
  assert.match(BUILTINS.find(row => row.id === 'pest-control').description, /Chemical application records remain separate/);
});
test('templates validate field types, immutable version identity, limits, choices and numeric units', () => {
  assert.equal(validateTemplate(pool).fields.find(field => field.id === 'freeChlorine').unit, 'ppm');
  for (const patch of [{ version: 0 },{ fields: [] },{ fields: [{ id: 'x',label:'X',type:'script' }] },{ fields:[{ id:'x',label:'X',type:'select',options:['One','One'] }] },{ fields:[{ id:'x',label:'X',type:'text',unit:'ppm' }] },{ fields:[{ id:'x',label:'X',type:'number',min:10,max:0 }] }]) assert.throws(() => validateTemplate({ ...pool,...patch }));
  assert.throws(() => validateTemplate({ ...pool, fields:[pool.fields[0],pool.fields[0]] }), /unique/);
});
test('drafts allow partial answers while final reports enforce all required observations', () => {
  assert.deepEqual(validateAnswers(pool, { ph: 7.5 }), { ph: 7.5 });
  assert.throws(() => validateAnswers(pool, { ph: 7.5 }, { complete: true }), /Free chlorine is required/);
  assert.deepEqual(validateAnswers(pool, { ph: 7.5,freeChlorine:3,equipment:'Normal' }, { complete:true }), { ph:7.5,freeChlorine:3,equipment:'Normal' });
});
test('service answers reject unknown financial fields, invalid numbers, choices and photo URLs', () => {
  for (const answers of [{ totalCost: 100 },{ ph:'7.5' },{ ph:Infinity },{ ph:15 },{ equipment:'Safe' },{ tasks:['Made up'] },{ photos:['https://example.com/photo'] },{ photos:['photo','photo'] }]) assert.throws(() => validateAnswers(pool, answers));
  assert.deepEqual(validateAnswers(pool, { photos:['tech_uploaded-photo'] }), { photos:['tech_uploaded-photo'] });
});
test('service reports preserve typed readings and template units without copying unrelated job finances', () => {
  const result = serviceReport(pool, { ph:7.2,freeChlorine:2,equipment:'Normal',totalCost:10000 });
  assert.equal(result.templateVersion,1); assert.equal(result.industry,'pool');
  assert.equal(result.fields.find(field => field.id === 'freeChlorine').unit,'ppm');
  assert.equal(result.fields.find(field => field.id === 'freeChlorine').value,2); assert.equal(result.totalCost,undefined);
});
