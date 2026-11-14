const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateRetirementArtifact, parseArguments, timestampVersion, PROJECT, REQUIRED_LEGACY_FUNCTIONS, REQUIRED_LEGACY_SCHEDULES } = require('../scripts/quickbooksSandboxCertification');
const { REALM_ID } = require('../scripts/lib/quickbooksSandboxTransport');
const now = Date.parse('2026-11-14T17:00:00Z');
const retired = () => ({ project: PROJECT, realmId: REALM_ID, verifiedAt: new Date(now).toISOString(), legacyConsumersDisabled: true, retiredFunctions: [...REQUIRED_LEGACY_FUNCTIONS], pausedSchedules: [...REQUIRED_LEGACY_SCHEDULES] });

test('operator runner requires a fresh positive retirement verification for the exact shared project and sandbox', () => {
  assert.equal(validateRetirementArtifact(retired(), now).realmId, REALM_ID);
  for (const patch of [{ project: 'other-project' }, { realmId: '123' }, { legacyConsumersDisabled: false }, { legacyConsumersDisabled: undefined }, { verifiedAt: 'invalid' }, { verifiedAt: new Date(now - 16 * 60000).toISOString() }, { verifiedAt: new Date(now + 60000).toISOString() }]) assert.throws(() => validateRetirementArtifact({ ...retired(), ...patch }, now), /fresh verified legacy-retirement/);
});

test('operator runner cannot certify legacy retirement while omitting the webhook or targeting RL functions', () => {
  for (const names of [[], ['scheduledCustomerSync'], [...REQUIRED_LEGACY_FUNCTIONS, 'rlQuickBooksSync'], [...REQUIRED_LEGACY_FUNCTIONS, '../rlQuickBooksWebhook'], [...REQUIRED_LEGACY_FUNCTIONS, 'name/child']]) assert.throws(() => validateRetirementArtifact({ ...retired(), retiredFunctions: names }, now), /retired function list/);
});

test('operator runner rejects foreign schedules and accidental RL accounting scheduler retirement lists', () => {
  for (const schedules of [undefined, ['projects/foreign/locations/us-central1/jobs/schedule'], [`projects/${PROJECT}/locations/us-central1/jobs/../other`], [`projects/${PROJECT}/locations/us-central1/jobs/firebase-schedule-rlQuickBooksProcessEvents-us-central1`]]) assert.throws(() => validateRetirementArtifact({ ...retired(), pausedSchedules: schedules }, now), /schedule list/);
});

test('every known importer and scheduler dependency must be retired, including additional declared requirements', () => {
  assert.equal(REQUIRED_LEGACY_FUNCTIONS.length, 16);
  assert.equal(REQUIRED_LEGACY_SCHEDULES.length, 4);
  for (const missing of REQUIRED_LEGACY_FUNCTIONS) assert.throws(() => validateRetirementArtifact({ ...retired(), retiredFunctions: REQUIRED_LEGACY_FUNCTIONS.filter(name => name !== missing) }, now), /all 16 known legacy/);
  for (const missing of REQUIRED_LEGACY_SCHEDULES) assert.throws(() => validateRetirementArtifact({ ...retired(), pausedSchedules: REQUIRED_LEGACY_SCHEDULES.filter(name => name !== missing) }, now), /all four known legacy/);
  assert.throws(() => validateRetirementArtifact({ ...retired(), legacyRequiredFunctions: [...REQUIRED_LEGACY_FUNCTIONS, 'additionalImporter'] }, now), /retired function list/);
  assert.equal(validateRetirementArtifact({ ...retired(), retiredFunctions: [...REQUIRED_LEGACY_FUNCTIONS, 'additionalImporter'], legacyRequiredFunctions: ['additionalImporter'] }, now).legacyConsumersDisabled, true);
});

test('runner defaults to plan and bounds run identifiers before any credential loading', () => {
  assert.equal(parseArguments([]).mode, 'plan');
  assert.match(parseArguments([]).runId, /^[a-f0-9]{8}$/);
  assert.deepEqual(parseArguments(['--run', '--run-id', 'abcdef', '--retirement', 'safe.json', '--tax-fixture', 'tax.json']), { mode: 'run', runId: 'abcdef', retirement: 'safe.json', taxFixture: 'tax.json' });
  for (const args of [['--run-id', '../file'], ['--run-id', 'aaaaaaaaa'], ['--run-id', 'ABCDEF'], ['--run-id'], ['--production'], ['--retirement', '--run']]) assert.throws(() => parseArguments(args));
});

test('customer version checks preserve sub-millisecond changes instead of truncating microseconds', () => {
  assert.equal(timestampVersion('2026-11-13T06:18:42.010001Z'), '1794550722.010001000');
  assert.notEqual(timestampVersion('2026-11-13T06:18:42.010001Z'), timestampVersion('2026-11-13T06:18:42.010002Z'));
  assert.equal(timestampVersion('2026-11-13T06:18:42Z'), '1794550722.000000000');
  assert.throws(() => timestampVersion('not-a-timestamp'));
});
